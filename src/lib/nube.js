/* ================================================================
   CAPA DE DATOS EN LA NUBE (Supabase)
   ----------------------------------------------------------------
   La aplicación trabaja en memoria con un objeto `db` con la forma:
     { users, certs, grados, comp, notifs, activity, logros,
       avisos, acuses, config }
   Este módulo:
   - carga ese objeto desde las tablas de Supabase según el rol,
   - sincroniza los cambios comparando el estado anterior con el
     nuevo (altas → insert, cambios → update, bajas → delete),
   - guarda y lee archivos en Supabase Storage,
   - llama a la función Edge que extrae datos con Gemini.
   Las filas marcadas con `_publico: true` son de solo lectura
   (vienen de vistas públicas para el ranking) y nunca se envían.
   ================================================================ */

import { supabase } from "./supabase";

const CONFIG_DEFECTO = {
  cicloActual: "2025-2026",
  ciclos: ["2025-2026"],
  metaAnual: 80,
  metasPorDocente: {},
  rankingPublico: true,
  semVerde: 100,
  semAmarillo: 60,
  perfilObligatorio: false,
};

/* ---------- utilidades internas ---------- */

const aplanarPerfil = (p) => ({
  id: p.id,
  email: p.email,
  rol: p.rol,
  activo: p.activo,
  ...(p.data || {}),
});

// El acuse vive en columnas reales (no en jsonb) porque el servidor es
// quien fija el usuario y la fecha; aquí solo se traduce a camelCase.
const aplanarAcuse = (a) => ({
  id: a.id, avisoId: a.aviso_id, usuarioId: a.usuario_id, fecha: a.fecha_enterado,
});

const filaPerfil = (u) => {
  const { id, email, rol, activo, _publico, ...data } = u;
  return { id, email, activo, data };
};

// tabla destino y transformación objeto → fila, por colección
const MAPA = {
  certs:  { tabla: "certs",  fila: (r) => ({ id: r.id, docente_id: r.docenteId, estado: r.estado, data: r }) },
  grados: { tabla: "grados", fila: (r) => ({ id: r.id, docente_id: r.docenteId, estado: r.estado, data: r }) },
  comp:   { tabla: "comp",   fila: (r) => ({ id: r.id, docente_id: r.docenteId, estado: r.estado, data: r }) },
  notifs: { tabla: "notifs", fila: (r) => ({ id: r.id, user_id: r.userId, leida: !!r.leida, data: r }) },
  activity: { tabla: "activity", fila: (r) => ({ id: r.id, data: r }) },
  logros: { tabla: "logros", fila: (r) => ({ id: r.id, docente_id: r.docenteId, clave: r.clave, data: r }) },
  avisos: { tabla: "avisos", fila: (r) => ({ id: r.id, estado: r.estado, data: r }) },
  programas: { tabla: "programas", fila: (r) => ({ id: r.id, data: r }) },
  asignaciones: { tabla: "asignaciones", fila: (r) => ({ id: r.id, docente_id: r.docenteId || null, data: r }) },
  entregas: { tabla: "entregas", fila: (r) => ({ id: r.id, docente_id: r.docenteId, estado: r.estado || "entregada", data: r }) },
  // `acuses` se omite a propósito: nunca se escribe desde el estado local.
  // El acuse se crea con marcarEnterado(), que deja que el servidor fije
  // el usuario (auth.uid()) y la fecha (now()).
};

const lanzar = (error, contexto) => {
  if (error) throw new Error(`${contexto}: ${error.message}`);
};

/* ---------- carga completa según rol ---------- */

export async function cargarTodo(uid) {
  const { data: perfilFila, error: e0 } = await supabase
    .from("perfiles").select("*").eq("id", uid).single();
  lanzar(e0, "No se pudo leer tu perfil");
  const yo = aplanarPerfil(perfilFila);
  const esStaff = yo.rol !== "docente"; // admin y jefes de departamento

  const { data: cfgFila, error: e1 } = await supabase
    .from("config").select("data").eq("id", 1).maybeSingle();
  lanzar(e1, "No se pudo leer la configuración");
  const config = { ...CONFIG_DEFECTO, ...(cfgFila?.data || {}) };

  const db = { users: [], certs: [], grados: [], comp: [], notifs: [],
               activity: [], logros: [], avisos: [], acuses: [],
               programas: [], asignaciones: [], entregas: [], config };

  if (esStaff) {
    const [pf, ce, gr, co, no, ac, lo, av, aq, pr, asg, en] = await Promise.all([
      supabase.from("perfiles").select("*"),
      supabase.from("certs").select("data"),
      supabase.from("grados").select("data"),
      supabase.from("comp").select("data"),
      supabase.from("notifs").select("data"),
      supabase.from("activity").select("data"),
      supabase.from("logros").select("data"),
      supabase.from("avisos").select("data"),
      supabase.from("acuses").select("id, aviso_id, usuario_id, fecha_enterado"),
      supabase.from("programas").select("data"),
      supabase.from("asignaciones").select("data"),
      supabase.from("entregas").select("data"),
    ]);
    for (const r of [pf, ce, gr, co, no, ac, lo, av, aq, pr, asg, en]) lanzar(r.error, "No se pudieron cargar los datos");
    db.users = pf.data.map(aplanarPerfil);
    db.certs = ce.data.map((r) => r.data);
    db.grados = gr.data.map((r) => r.data);
    db.comp = co.data.map((r) => r.data);
    db.notifs = no.data.map((r) => r.data);
    db.activity = ac.data.map((r) => r.data);
    db.logros = lo.data.map((r) => r.data);
    db.avisos = av.data.map((r) => r.data);
    db.acuses = aq.data.map(aplanarAcuse);
    db.programas = pr.data.map((r) => r.data);
    db.asignaciones = asg.data.map((r) => r.data);
    db.entregas = en.data.map((r) => r.data);
  } else {
    const [pub, horas, ce, gr, co, no, lo, av, aq, pr, asg, en] = await Promise.all([
      supabase.from("publico_docentes").select("*"),
      supabase.from("publico_horas").select("*"),
      supabase.from("certs").select("data").eq("docente_id", uid),
      supabase.from("grados").select("data").eq("docente_id", uid),
      supabase.from("comp").select("data").eq("docente_id", uid),
      supabase.from("notifs").select("data").eq("user_id", uid),
      supabase.from("logros").select("data").eq("docente_id", uid),
      supabase.from("avisos").select("data").in("estado", ["published", "archived"]),
      supabase.from("acuses").select("id, aviso_id, usuario_id, fecha_enterado").eq("usuario_id", uid),
      supabase.from("programas").select("data"),
      supabase.from("asignaciones").select("data").eq("docente_id", uid),
      supabase.from("entregas").select("data").eq("docente_id", uid),
    ]);
    for (const r of [pub, horas, ce, gr, co, no, lo, av, aq, pr, asg, en]) lanzar(r.error, "No se pudieron cargar los datos");
    db.users = pub.data.map((p) =>
      p.id === uid ? yo : { id: p.id, nombre: p.nombre || "Docente", rol: p.rol, activo: p.activo, _publico: true }
    );
    if (!db.users.some((u) => u.id === uid)) db.users.push(yo);
    db.certs = ce.data.map((r) => r.data);
    // Horas validadas de los demás docentes, como registros sintéticos de
    // solo lectura para que el ranking y el podio funcionen igual que
    // para el administrador, sin exponer el detalle de sus constancias.
    for (const h of horas.data) {
      if (h.docente_id === uid) continue;
      db.certs.push({
        id: `pub_${h.docente_id}_${h.ciclo}`,
        _publico: true,
        docenteId: h.docente_id,
        ciclo: h.ciclo,
        estado: "validada",
        datos: { horas: Number(h.horas) || 0 },
        historial: [],
      });
    }
    db.grados = gr.data.map((r) => r.data);
    db.comp = co.data.map((r) => r.data);
    db.notifs = no.data.map((r) => r.data);
    db.logros = lo.data.map((r) => r.data);
    db.avisos = av.data.map((r) => r.data);
    db.acuses = aq.data.map(aplanarAcuse);
    db.programas = pr.data.map((r) => r.data);
    db.asignaciones = asg.data.map((r) => r.data);
    db.entregas = en.data.map((r) => r.data);
  }

  // orden estable: lo más reciente primero donde aplica
  db.notifs.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  db.activity.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  db.avisos.sort((a, b) => (b.fechaPublicacion || b.creadoEn || "").localeCompare(a.fechaPublicacion || a.creadoEn || ""));
  return db;
}

/* ---------- sincronización por diferencias ---------- */

export async function sincronizar(prev, next) {
  const tareas = [];

  for (const col of Object.keys(MAPA)) {
    const { tabla, fila } = MAPA[col];
    const antes = new Map((prev?.[col] || []).filter((r) => !r._publico).map((r) => [r.id, r]));
    const despues = new Map((next?.[col] || []).filter((r) => !r._publico).map((r) => [r.id, r]));

    const upserts = [];
    for (const [id, r] of despues) {
      const p = antes.get(id);
      if (!p || JSON.stringify(p) !== JSON.stringify(r)) upserts.push(fila(r));
    }
    const bajas = [...antes.keys()].filter((id) => !despues.has(id));

    if (upserts.length) tareas.push(supabase.from(tabla).upsert(upserts).then((r) => lanzar(r.error, `Guardando ${tabla}`)));
    if (bajas.length) tareas.push(supabase.from(tabla).delete().in("id", bajas).then((r) => lanzar(r.error, `Eliminando en ${tabla}`)));
  }

  // perfiles: solo actualizaciones (las altas se hacen por función Edge)
  const antesU = new Map((prev?.users || []).filter((u) => !u._publico).map((u) => [u.id, u]));
  for (const u of (next?.users || []).filter((u) => !u._publico)) {
    const p = antesU.get(u.id);
    if (p && JSON.stringify(p) !== JSON.stringify(u)) {
      const f = filaPerfil(u);
      tareas.push(
        supabase.from("perfiles").update({ email: f.email, activo: f.activo, data: f.data }).eq("id", f.id)
          .then((r) => lanzar(r.error, "Guardando perfil"))
      );
    }
  }

  if (JSON.stringify(prev?.config) !== JSON.stringify(next?.config)) {
    tareas.push(supabase.from("config").upsert({ id: 1, data: next.config }).then((r) => lanzar(r.error, "Guardando configuración")));
  }

  await Promise.all(tareas);
}

/* ---------- archivos (Supabase Storage) ---------- */

const BUCKET = "archivos";
export const MAX_FILE_B64 = 10_000_000; // ~10 MB en base64 (~7.5 MB reales)

export async function guardarArchivo(id, base64, mime, nombre) {
  if (!base64 || base64.length > MAX_FILE_B64) return { guardado: false };
  try {
    const blob = new Blob([JSON.stringify({ base64, mime, nombre })], { type: "application/json" });
    const { error } = await supabase.storage.from(BUCKET).upload(`${id}.json`, blob, { upsert: true });
    if (error) return { guardado: false };
    return { guardado: true };
  } catch {
    return { guardado: false };
  }
}

export async function leerArchivo(id) {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(`${id}.json`);
    if (error || !data) return null;
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

export async function eliminarArchivo(id) {
  try { await supabase.storage.from(BUCKET).remove([`${id}.json`]); } catch { /* sin efecto */ }
}

/* ---------- extracción con IA (función Edge → Gemini) ---------- */

async function detalleError(error, generico) {
  // Las funciones Edge devuelven { error: "mensaje" } en el cuerpo;
  // supabase-js lo deja en error.context (un Response).
  try {
    const j = await error.context.json();
    if (j?.error) return j.error;
  } catch { /* sin cuerpo legible */ }
  return error.message || generico;
}

export async function extraerConIA({ base64, mime, tipo }) {
  const { data, error } = await supabase.functions.invoke("extraer", {
    body: { base64, mime, tipo },
  });
  if (error) throw new Error(await detalleError(error, "Error del servicio de IA"));
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ---------- acuse de enterado ----------
   El cliente solo envía el id del aviso. El usuario y la fecha los pone el
   servidor (columnas con DEFAULT auth.uid() y now()), y la restricción
   UNIQUE(aviso_id, usuario_id) impide duplicados. Aunque alguien alterara
   la petición, la política RLS rechaza cualquier acuse a nombre de otro. */

export async function marcarEnterado(avisoId) {
  const { data, error } = await supabase
    .from("acuses").insert({ aviso_id: avisoId }).select().single();
  if (error) {
    if (error.code === "23505") { // ya existía: no es un fallo real
      const { data: prev } = await supabase
        .from("acuses").select("id, aviso_id, usuario_id, fecha_enterado")
        .eq("aviso_id", avisoId).maybeSingle();
      if (prev) return aplanarAcuse(prev);
    }
    throw new Error(error.message);
  }
  return aplanarAcuse(data);
}

/* ---------- administración de cuentas (función Edge) ---------- */

async function llamarAdmin(body) {
  const { data, error } = await supabase.functions.invoke("admin-docentes", { body });
  if (error) throw new Error(await detalleError(error, "Error en la función de administración"));
  if (data?.error) throw new Error(data.error);
  return data;
}

export const crearDocente = ({ email, password, nombre, area, asignaturas, rol }) =>
  llamarAdmin({ accion: "crear", email, password, nombre, area, asignaturas, rol });

export const restablecerPassword = ({ id, password }) =>
  llamarAdmin({ accion: "reset_pass", id, password });

export const cambiarEmailDocente = ({ id, email }) =>
  llamarAdmin({ accion: "cambiar_email", id, email });
