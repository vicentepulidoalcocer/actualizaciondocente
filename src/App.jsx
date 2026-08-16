import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LayoutDashboard, Upload, BookOpen, Trophy, Award, FileText, Settings,
  GraduationCap, Bell, Search, LogOut, CheckCircle2, XCircle, Clock,
  AlertTriangle, ChevronRight, Users, Target, TrendingUp, FileCheck,
  Download, Filter, Plus, Pencil, Trash2, Eye, Medal, Star, Loader2,
  FolderOpen, User, Activity, ShieldCheck, Menu, X, Megaphone,
  Paperclip, Link2, Archive, Send, Sparkles, CalendarDays
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie,
  Cell, LineChart, Line, Legend, CartesianGrid
} from "recharts";

/* ================================================================
   SISTEMA DE SEGUIMIENTO Y DESARROLLO DOCENTE
   Versión web autoalojada: interfaz en GitHub Pages, datos y
   archivos en Supabase, extracción con IA vía función Edge (Gemini).
   ================================================================ */

import { supabase, configurada } from "./lib/supabase";
import {
  cargarTodo, sincronizar, guardarArchivo, leerArchivo, eliminarArchivo,
  extraerConIA, crearDocente, restablecerPassword, cambiarEmailDocente,
  marcarEnterado, MAX_FILE_B64,
} from "./lib/nube";
import {
  soportaPush, esIOS, instaladoEnInicio, permisoActual,
  activarNotificaciones, desactivarNotificaciones, estaActivo, enviarPush, registrarServicio,
} from "./lib/push";

const CATEGORIAS = [
  "Formación pedagógica", "Evaluación", "Tecnología educativa",
  "Inteligencia artificial", "Matemáticas", "Ciencias", "Lenguaje",
  "Inclusión educativa", "Habilidades socioemocionales", "Gestión escolar", "Otro"
];

const ESTADOS_CERT = {
  procesando: { label: "Procesando", color: "bg-slate-200 text-slate-700" },
  revision_docente: { label: "Pendiente de revisión del docente", color: "bg-sky-100 text-sky-800" },
  pendiente_validacion: { label: "Pendiente de validación", color: "bg-amber-100 text-amber-800" },
  validada: { label: "Validada", color: "bg-emerald-100 text-emerald-800" },
  rechazada: { label: "Rechazada", color: "bg-rose-100 text-rose-800" },
};

const ESTADOS_GRADO = {
  sin_documento: { label: "Sin documento", color: "bg-slate-200 text-slate-600" },
  cargado: { label: "Documento cargado", color: "bg-sky-100 text-sky-800" },
  pendiente: { label: "Pendiente de validación", color: "bg-amber-100 text-amber-800" },
  validado: { label: "Validado", color: "bg-emerald-100 text-emerald-800" },
  rechazado: { label: "Rechazado", color: "bg-rose-100 text-rose-800" },
};

const NIVELES = ["Licenciatura", "Maestría", "Doctorado"];

/* ---- Roles ----
   admin           → administrador general
   jefe_formacion  → Jefe del Depto. de Formación Docente
   jefe_academico  → Jefe del Depto. Académico y de Competencias Docentes
   docente         → personal docente */
const NOMBRE_ROL = {
  admin: "Administración general",
  jefe_formacion: "Jefe de Formación Docente",
  jefe_academico: "Jefe Académico y de Competencias",
  docente: "Docente",
};
const esRolValidador = (r) => r === "admin" || r === "jefe_formacion";
const esRolAcademico = (r) => r === "admin" || r === "jefe_academico";
const esRolComunicador = (r) => r !== "docente";

/* ---- Programas de estudio y asignaciones ---- */

/* ---- Avisos y circulares ---- */
const TIPOS_AVISO = ["Circular", "Curso", "Reunión", "Información general", "Actividad", "Importante", "Urgente"];
const PRIORIDADES = ["Normal", "Importante", "Urgente"];
const COLOR_PRIORIDAD = {
  Normal:     { chip: "bg-slate-100 text-slate-600", borde: "border-slate-200", punto: "" },
  Importante: { chip: "bg-amber-100 text-amber-800", borde: "border-amber-300", punto: "🟠" },
  Urgente:    { chip: "bg-rose-100 text-rose-700",   borde: "border-rose-400",  punto: "🔴" },
};
const ESTADO_AVISO = { draft: "Borrador", published: "Publicado", archived: "Archivado" };

/* Las insignias cubren las dos áreas del trabajo docente: la capacitación
   y el cumplimiento de planeaciones, planes de trabajo e informes. */
const LOGROS_DEF = [
  // --- Capacitación ---
  { clave: "primer_curso", nombre: "Primer curso registrado", icono: "🎓", area: "Capacitación", desc: "Tu primera constancia validada" },
  { clave: "h20", nombre: "20 horas acumuladas", icono: "⏱️", area: "Capacitación", desc: "20 horas de capacitación validadas" },
  { clave: "h50", nombre: "50 horas acumuladas", icono: "🔥", area: "Capacitación", desc: "50 horas de capacitación validadas" },
  { clave: "h100", nombre: "100 horas acumuladas", icono: "💎", area: "Capacitación", desc: "100 horas de capacitación validadas" },
  { clave: "meta", nombre: "Meta anual alcanzada", icono: "🏁", area: "Capacitación", desc: "Alcanzaste tu meta del ciclo" },
  { clave: "top3", nombre: "Top 3 en capacitación", icono: "🏆", area: "Capacitación", desc: "Entre los tres primeros lugares en horas" },
  // --- Planeaciones, planes de trabajo e informes ---
  { clave: "primera_entrega", nombre: "Primera entrega", icono: "📄", area: "Planeaciones", desc: "Subiste tu primera planeación, plan o informe" },
  { clave: "avance50", nombre: "Media asignación cubierta", icono: "📈", area: "Planeaciones", desc: "50% de tus entregas del semestre" },
  { clave: "planeaciones_completas", nombre: "Planeaciones completas", icono: "📚", area: "Planeaciones", desc: "Todas las planeaciones que te corresponden" },
  { clave: "comisiones_completas", nombre: "Comisiones al día", icono: "🗂️", area: "Planeaciones", desc: "Planes de trabajo e informes de tus comisiones" },
  { clave: "entrega_total", nombre: "Asignación completa", icono: "✅", area: "Planeaciones", desc: "100% de tus entregas del semestre" },
  { clave: "puntual", nombre: "Entrega anticipada", icono: "⚡", area: "Planeaciones", desc: "Completaste tus entregas durante el primer mes del semestre" },
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* Imágenes institucionales (archivos dentro de la carpeta /public) */
const LOGO = import.meta.env.BASE_URL + "logo.png";
const MASCOTA = import.meta.env.BASE_URL + "mascota.png";
const hoy = () => new Date().toISOString().slice(0, 10);
const ahora = () => new Date().toISOString();

const fmtFecha = (f) => {
  if (!f) return "—";
  try {
    const d = new Date(f + (f.length === 10 ? "T12:00:00" : ""));
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  } catch { return f; }
};

/* ---------------- Lógica de negocio ------------------------------ */

const certsDeCiclo = (certs, ciclo) =>
  ciclo === "historico" ? certs : certs.filter(c => c.ciclo === ciclo);

const horasValidadas = (db, docenteId, ciclo) =>
  certsDeCiclo(db.certs, ciclo).filter(c => c.docenteId === docenteId && c.estado === "validada")
    .reduce((s, c) => s + (Number(c.datos.horas) || 0), 0);

const horasPendientes = (db, docenteId, ciclo) =>
  certsDeCiclo(db.certs, ciclo).filter(c => c.docenteId === docenteId &&
    ["pendiente_validacion", "revision_docente", "procesando"].includes(c.estado))
    .reduce((s, c) => s + (Number(c.datos.horas) || 0), 0);

const metaDe = (db, docenteId) =>
  db.config.metasPorDocente[docenteId] ?? db.config.metaAnual;

const semaforoDe = (db, pct) =>
  pct >= db.config.semVerde ? "verde" : pct >= db.config.semAmarillo ? "amarillo" : "rojo";

const SEM_COLORS = { verde: "#2E7D5B", amarillo: "#D9A404", rojo: "#C9463D" };

const rankingDe = (db, ciclo) =>
  db.users.filter(u => u.rol === "docente" && u.activo)
    .map(u => ({ ...u, horas: horasValidadas(db, u.id, ciclo) }))
    .sort((a, b) => b.horas - a.horas);

/* Ranking de cumplimiento de entregas (planeaciones, planes e informes).
   Ordena por porcentaje de avance; a igual porcentaje, gana quien más
   entregas haya cubierto en términos absolutos. */
const rankingEntregas = (db, ciclo, periodo) =>
  db.users.filter(u => u.rol === "docente" && u.activo)
    .map(u => {
      const asig = asignacionDe(db, u.id, ciclo, periodo);
      const av = asig ? avanceDe(db, asig) : { requeridas: 0, entregadas: 0, pct: 0, indeterminado: false };
      return { ...u, ...av, conAsignacion: !!asig };
    })
    .sort((a, b) => b.pct - a.pct || b.entregadas - a.entregadas);

/* Ranking general del docente: combina capacitación y entregas.
   Ambas mitades valen lo mismo (50 y 50) para que ninguna eclipse a la
   otra, y la de capacitación se mide contra la meta anual del plantel. */
function rankingGeneral(db, ciclo, periodo) {
  const meta = Number(db.config.metaAnual) || 0;
  return db.users.filter(u => u.rol === "docente" && u.activo)
    .map(u => {
      const horas = horasValidadas(db, u.id, ciclo);
      const asig = asignacionDe(db, u.id, ciclo, periodo);
      const av = asig ? avanceDe(db, asig) : null;
      const pctCap = meta ? Math.min(100, Math.round(100 * horas / meta)) : (horas > 0 ? 100 : 0);
      const pctEnt = av && av.requeridas ? av.pct : null;
      // Si el docente aún no tiene asignación, su puntaje se basa solo en
      // capacitación: no se le penaliza por algo que no le han cargado.
      const puntos = pctEnt === null ? pctCap : Math.round(0.5 * pctCap + 0.5 * pctEnt);
      return { ...u, horas, pctCap, pctEnt, av, puntos };
    })
    .sort((a, b) => b.puntos - a.puntos || b.horas - a.horas);
}

function detectarDuplicado(db, cert) {
  const norm = (s) => (s || "").toString().toLowerCase().trim();
  return db.certs.find(c => {
    if (c.id === cert.id || c.docenteId !== cert.docenteId || c.estado === "rechazada") return false;
    if (cert.datos.folio && c.datos.folio && norm(c.datos.folio) === norm(cert.datos.folio)) return true;
    let pts = 0;
    if (norm(c.datos.curso) && norm(c.datos.curso) === norm(cert.datos.curso)) pts += 2;
    if (c.datos.fecha_termino && c.datos.fecha_termino === cert.datos.fecha_termino) pts += 1;
    if (Number(c.datos.horas) && Number(c.datos.horas) === Number(cert.datos.horas)) pts += 1;
    return pts >= 3;
  });
}

// Las insignias se ganan dentro de cada ciclo escolar: la clave guardada
// combina el logro y el ciclo (por ejemplo "h20@2025-2026"), de modo que
// un docente vuelve a conquistarlas cada ciclo.
const claveLogro = (clave, ciclo) => `${clave}@${ciclo}`;

function otorgarLogros(db, docenteId, cicloRef) {
  const ciclo = cicloRef || db.config.cicloActual;
  const tiene = (clave) => db.logros.some(l => l.docenteId === docenteId && l.clave === claveLogro(clave, ciclo));
  const dar = (clave) => {
    if (tiene(clave)) return;
    db.logros.push({ id: uid(), docenteId, clave: claveLogro(clave, ciclo), ciclo, fecha: ahora() });
    const def = LOGROS_DEF.find(l => l.clave === clave);
    notificar(db, docenteId, `🏅 Insignia obtenida (ciclo ${ciclo}): ${def.nombre}`);
  };
  const h = horasValidadas(db, docenteId, ciclo);
  const nCursos = db.certs.filter(c => c.docenteId === docenteId && c.estado === "validada" && c.ciclo === ciclo).length;
  if (nCursos >= 1) dar("primer_curso");
  if (h >= 20) dar("h20");
  if (h >= 50) dar("h50");
  if (h >= 100) dar("h100");
  if (h >= metaDe(db, docenteId)) dar("meta");
  const top3 = rankingDe(db, ciclo).slice(0, 3).map(r => r.id);
  if (top3.includes(docenteId) && h > 0) dar("top3");

  /* --- Insignias de planeaciones, planes de trabajo e informes ---
     Se calculan sobre la asignación del semestre en curso. */
  const asig = asignacionDe(db, docenteId, ciclo, periodoDeFecha());
  if (!asig) return;
  const entregasSem = db.entregas.filter(e => e.docenteId === docenteId
    && e.ciclo === ciclo && (e.periodo || "ago-ene") === (asig.periodo || "ago-ene"));
  if (entregasSem.length >= 1) dar("primera_entrega");

  const av = avanceDe(db, asig);
  if (av.requeridas > 0) {
    if (av.entregadas >= Math.ceil(av.requeridas / 2)) dar("avance50");
    if (av.entregadas >= av.requeridas && !av.indeterminado) {
      dar("entrega_total");
      // Anticipada: completó todo dentro del primer mes del semestre
      const inicio = new Date((asig.periodo || "ago-ene") === "feb-jul"
        ? `${ciclo.split("-")[1]}-02-01` : `${ciclo.split("-")[0]}-08-01`);
      const ultima = entregasSem.map(e => new Date(e.fecha)).sort((a, b) => b - a)[0];
      if (ultima && (ultima - inicio) / 86400000 <= 31) dar("puntual");
    }
  }

  // Por bloques: planeaciones (grupo y módulos) y comisiones (planes e informes)
  const encargos = encargosDe(db, asig);
  const cubierto = (tipos, filtro) => {
    const items = encargos.filter(filtro);
    if (!items.length) return false;
    return items.every(e => tipos.every(t => {
      const n = e.requisitos[t];
      if (n === null) return false;   // requisito sin definir: no cuenta
      if (!n) return true;
      return entregasDe(db, docenteId, ciclo, e.clave, t, asig.periodo || "ago-ene").length >= n;
    }));
  };
  if (cubierto(["planeacion"], e => e.tipo === "asignatura" || e.tipo === "modulo" || e.tipo === "baetam")) dar("planeaciones_completas");
  if (cubierto(["plan", "informe"], e => e.tipo === "comision")) dar("comisiones_completas");
}

function notificar(db, userId, texto) {
  db.notifs.unshift({ id: uid(), userId, texto, fecha: ahora(), leida: false });
  db.notifs = db.notifs.slice(0, 200);
}

function registrarActividad(db, texto) {
  db.activity.unshift({ id: uid(), texto, fecha: ahora() });
  db.activity = db.activity.slice(0, 100);
}

function completitudExpediente(db, docenteId) {
  const u = db.users.find(x => x.id === docenteId);
  const partes = [];
  partes.push({ nombre: "Perfil personal", ok: !!(u?.area && u?.asignaturas), cuenta: true });
  for (const nivel of NIVELES) {
    const g = db.grados.find(x => x.docenteId === docenteId && x.nivel === nivel);
    // Maestría y doctorado se registran y se muestran, pero no afectan el
    // porcentaje: no todos los docentes cuentan con posgrado.
    partes.push({
      nombre: nivel, ok: g?.estado === "validado",
      opcional: nivel !== "Licenciatura", registrado: !!g,
      cuenta: nivel === "Licenciatura",
    });
  }
  partes.push({ nombre: "Formación complementaria", ok: db.comp.some(x => x.docenteId === docenteId), cuenta: false });
  partes.push({ nombre: "Capacitación", ok: db.certs.some(c => c.docenteId === docenteId && c.estado === "validada"), cuenta: true });
  const evaluadas = partes.filter(p => p.cuenta);
  const pct = Math.round(100 * evaluadas.filter(p => p.ok).length / evaluadas.length);
  return { partes, pct };
}

/* El ciclo escolar corre de agosto a julio: una fecha de agosto en adelante
   pertenece al ciclo que inicia ese año; de enero a julio, al que inició el
   año anterior. */
function cicloDeFecha(fecha) {
  const f = fecha ? new Date(fecha) : new Date();
  const d = isNaN(f) ? new Date() : f;
  const anio = d.getFullYear();
  const inicio = d.getMonth() >= 7 ? anio : anio - 1; // getMonth: 7 = agosto
  return `${inicio}-${inicio + 1}`;
}

// Ciclo al que corresponde una constancia. Manda la FECHA DE EMISIÓN del
// documento; solo si no aparece se recurre a las fechas del curso.
const cicloDeConstancia = (datos = {}) =>
  cicloDeFecha(datos.fecha_emision || datos.fecha_termino || datos.fecha_inicio || null);

// ¿Se pudo determinar el ciclo con una fecha real del documento?
const tieneFechaDeCiclo = (datos = {}) =>
  !!(datos.fecha_emision || datos.fecha_termino || datos.fecha_inicio);

/* Las asignaciones son SEMESTRALES: cada ciclo escolar (agosto–julio)
   se divide en dos periodos. */
const PERIODOS = [
  ["ago-ene", "Agosto – Enero"],
  ["feb-jul", "Febrero – Julio"],
];
const nombrePeriodo = (p) => (PERIODOS.find(x => x[0] === p) || ["", p || "—"])[1];

// Periodo al que pertenece una fecha (por omisión, hoy)
function periodoDeFecha(fecha) {
  const f = fecha ? new Date(fecha) : new Date();
  const d = isNaN(f) ? new Date() : f;
  const m = d.getMonth(); // 0 = enero
  return (m >= 1 && m <= 6) ? "feb-jul" : "ago-ene"; // feb–jul / ago–ene
}

// Ciclos disponibles: los configurados más los que aparezcan en constancias
function ciclosDisponibles(db) {
  const set = new Set(db.config.ciclos || []);
  set.add(cicloDeFecha());
  db.certs.forEach(c => c.ciclo && set.add(c.ciclo));
  return [...set].sort().reverse();
}

/* ---------------- Programas, asignaciones y entregas ------------- */

// Normaliza texto para comparar nombres (sin acentos, mayúsculas, sin signos)
const normTexto = (t) => (t || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/* Clasifica cada renglón de la asignación:
   - "modulo": módulos profesionales → 3 planeaciones por semestre
   - "comision": tutoría, orientación educativa, activación física, becas,
     cargos y comisiones → 1 plan de trabajo + 3 informes
   - "asignatura": frente a grupo → tantas planeaciones como propósitos o
     progresiones tenga su programa de estudio */
const PALABRAS_COMISION = /(TUTOR|ORIENTACION EDUCATIVA|ACTIVACION FISICA|PARAESCOLAR|BECA|YO NO ABAND|DIRECCION|SUBDIRECCION|DEPARTAMENTO|COORDINAD|ENCARGAD|AUXILIAR|SECRETARI|RECURSOS HUMANOS|PROMOCION Y DIFUSION|PROYECTOS|PRESIDENTE DE ACADEMIA|OFICINA|VINCULACION|CENTRO DE COMPUTO|FORMACION SOCIOEMOCIONAL)/;

/* BAETAM es una modalidad distinta: sus asignaciones entregan UNA sola
   planeación, sin importar cuántos propósitos tenga el programa. Aparece
   tanto en el nombre de la actividad como en la columna de grupo
   (por ejemplo "BAETAM 1° A"), así que se revisan ambos. */
const esBaetam = (actividad, grupos = []) =>
  /BAETAM/.test(normTexto(actividad)) || grupos.some(g => /BAETAM/.test(normTexto(g)));

function clasificarActividad(nombre, grupos = []) {
  if (esBaetam(nombre, grupos)) return "baetam";
  const n = normTexto(nombre);
  if (/MODULO/.test(n)) return "modulo";
  if (PALABRAS_COMISION.test(n)) return "comision";
  return "asignatura";
}

/* Cada programa de estudio cubre VARIAS asignaturas (por ejemplo, el
   programa de Pensamiento Matemático desarrolla I, II y III), cada una
   con su propio número de planeaciones. */
const asignaturasDe = (p) => Array.isArray(p.asignaturas) ? p.asignaturas : [];

// Todas las asignaturas del repositorio, con su programa de origen
const todasLasAsignaturas = (db) =>
  db.programas.flatMap(p => asignaturasDe(p).map((a, i) => ({ ...a, programa: p, idx: i })));

/* Busca la asignatura del repositorio que corresponde a una actividad de
   la asignación. Prioriza la coincidencia exacta; si no la hay, la más
   específica (la más larga), para que "Pensamiento Matemático III" no se
   confunda con "Pensamiento Matemático I". */
function buscarPrograma(db, actividad) {
  const n = normTexto(actividad);
  if (!n) return null;
  const cands = todasLasAsignaturas(db);
  for (const a of cands) if (normTexto(a.nombre) === n) return a;
  let mejor = null, mejorLen = 0;
  for (const a of cands) {
    const an = normTexto(a.nombre);
    if (!an) continue;
    if ((n.includes(an) || an.includes(n)) && an.length > mejorLen) { mejor = a; mejorLen = an.length; }
  }
  return mejor;
}

/* Agrupa los renglones de una asignación por actividad y calcula qué debe
   entregar el docente por cada encargo. */
function encargosDe(db, asig) {
  const mapa = new Map();
  (asig?.items || []).forEach(it => {
    const clave = normTexto(it.actividad);
    if (!clave || /^RECESO/.test(clave)) return;
    const e = mapa.get(clave) || { clave, actividad: it.actividad, grupos: [], horas: 0 };
    if (it.grupo) e.grupos.push(it.grupo);
    e.horas += Number(it.horas) || 0;
    mapa.set(clave, e);
  });
  /* La administración general puede ajustar a mano cuántas entregas
     corresponden a un encargo (incluido 0). Ese ajuste manda sobre el
     cálculo automático y queda guardado en la asignación. */
  const ajustes = asig?.ajustes || {};
  const aplicarAjuste = (clave, req) => {
    const a = ajustes[clave];
    if (!a) return req;
    const val = (t) => (a[t] === undefined || a[t] === null || a[t] === "") ? req[t] : Number(a[t]);
    return { planeacion: val("planeacion"), plan: val("plan"), informe: val("informe") };
  };

  return [...mapa.values()].map(e => {
    const tipo = clasificarActividad(e.actividad, e.grupos);
    const ajustado = !!ajustes[e.clave];
    if (tipo === "baetam") {
      return { ...e, tipo, ajustado, programa: buscarPrograma(db, e.actividad),
        requisitos: aplicarAjuste(e.clave, { planeacion: 1, plan: 0, informe: 0 }) };
    }
    if (tipo === "modulo") {
      return { ...e, tipo, ajustado, programa: buscarPrograma(db, e.actividad),
        requisitos: aplicarAjuste(e.clave, { planeacion: 3, plan: 0, informe: 0 }) };
    }
    if (tipo === "comision") {
      return { ...e, tipo, ajustado, programa: null,
        requisitos: aplicarAjuste(e.clave, { planeacion: 0, plan: 1, informe: 3 }) };
    }
    const prog = buscarPrograma(db, e.actividad);
    const num = prog && prog.numPlaneaciones != null && prog.numPlaneaciones !== ""
      ? Number(prog.numPlaneaciones) : null;
    return { ...e, tipo, ajustado, programa: prog,
      requisitos: aplicarAjuste(e.clave, { planeacion: num, plan: 0, informe: 0 }) };
  }).sort((a, b) => a.actividad.localeCompare(b.actividad));
}

// Entregas del docente para un encargo y tipo dados, dentro de un semestre
const entregasDe = (db, docenteId, ciclo, clave, tipo, periodo) =>
  db.entregas.filter(e => e.docenteId === docenteId && e.ciclo === ciclo
    && (periodo ? (e.periodo || "ago-ene") === periodo : true)
    && e.encargoClave === clave && e.tipo === tipo);

// Avance total de un docente sobre su asignación de un ciclo
function avanceDe(db, asig) {
  if (!asig) return { requeridas: 0, entregadas: 0, pct: 0, indeterminado: false };
  let req = 0, ent = 0, indeterminado = false;
  for (const e of encargosDe(db, asig)) {
    for (const t of ["planeacion", "plan", "informe"]) {
      const n = e.requisitos[t];
      if (n === null) { indeterminado = true; continue; }
      req += n;
      ent += Math.min(entregasDe(db, asig.docenteId, asig.ciclo, e.clave, t, asig.periodo || "ago-ene").length, n);
    }
  }
  return { requeridas: req, entregadas: ent, pct: req ? Math.round(100 * ent / req) : 0, indeterminado };
}

/* La asignación de un docente en un ciclo y periodo concretos. Sin
   argumentos, la vigente: la del periodo actual, o la más reciente. */
const asignacionDe = (db, docenteId, ciclo, periodo) => {
  const suyas = db.asignaciones.filter(a => a.docenteId === docenteId);
  if (ciclo) return suyas.find(a => a.ciclo === ciclo && (!periodo || (a.periodo || "ago-ene") === periodo)) || null;
  const cicloHoy = cicloDeFecha(), periodoHoy = periodoDeFecha();
  return suyas.find(a => a.ciclo === cicloHoy && (a.periodo || "ago-ene") === periodoHoy)
    || suyas.sort((a, b) => (b.ciclo + (b.periodo || "")).localeCompare(a.ciclo + (a.periodo || "")))[0]
    || null;
};

// Entregas que le faltan al docente (para la insignia del menú)
function pendientesEntrega(db, docenteId) {
  const asig = asignacionDe(db, docenteId);
  if (!asig) return 0;
  const av = avanceDe(db, asig);
  return Math.max(av.requeridas - av.entregadas, 0);
}

// Empareja el nombre extraído del PDF con una cuenta de docente
function emparejarDocente(db, nombreExtraido) {
  const n = normTexto(nombreExtraido);
  let mejor = null, mejorPunt = 0;
  for (const d of db.users.filter(u => u.rol === "docente")) {
    const palabras = normTexto(d.nombre).split(" ").filter(w => w.length > 2);
    if (!palabras.length) continue;
    const punt = palabras.filter(w => n.includes(w)).length / palabras.length;
    if (punt > mejorPunt) { mejorPunt = punt; mejor = d; }
  }
  return mejorPunt >= 0.6 ? mejor : null;
}

const NOMBRE_TIPO_ENTREGA = { planeacion: "Planeación", plan: "Plan de trabajo", informe: "Informe" };
const NOMBRE_TIPO_ENCARGO = {
  asignatura: "Frente a grupo",
  modulo: "Módulo profesional",
  comision: "Comisión / cargo",
  baetam: "BAETAM",
};
const PLURAL_TIPO_ENTREGA = { planeacion: "Planeaciones", plan: "Planes de trabajo", informe: "Informes" };
// Devuelve singular o plural según la cantidad
const tipoEntrega = (t, n) => (n === 1 ? NOMBRE_TIPO_ENTREGA[t] : PLURAL_TIPO_ENTREGA[t]) || t;
// "1 planeación" / "8 planeaciones"
const nPlaneaciones = (n) => `${n} ${Number(n) === 1 ? "planeación" : "planeaciones"}`;
// Concordancia para palabras con acento que lo pierden en plural
const nAsignaciones = (n) => `${n} ${Number(n) === 1 ? "asignación" : "asignaciones"}`;

/* ---------------- Avisos y circulares ---------------------------- */

// Destinatarios de un aviso: por ahora, todos los docentes activos.
// El campo `destino` queda guardado en cada aviso para poder ampliarlo
// después (una academia, un departamento, un docente en particular)
// sin migrar los avisos ya publicados.
function destinatariosDe(db, aviso) {
  const activos = db.users.filter(u => u.rol === "docente" && u.activo);
  const destino = aviso?.destino || { tipo: "todos" };
  if (destino.tipo === "docentes" && Array.isArray(destino.ids)) {
    return activos.filter(u => destino.ids.includes(u.id));
  }
  if (destino.tipo === "area" && destino.area) {
    return activos.filter(u => u.area === destino.area);
  }
  return activos;
}

const acuseDe = (db, avisoId, usuarioId) =>
  db.acuses.find(a => a.avisoId === avisoId && a.usuarioId === usuarioId);

function seguimientoDe(db, aviso) {
  const total = destinatariosDe(db, aviso);
  const enterados = total.filter(d => acuseDe(db, aviso.id, d.id));
  const pct = total.length ? Math.round(1000 * enterados.length / total.length) / 10 : 0;
  return { total, enterados, pendientes: total.filter(d => !acuseDe(db, aviso.id, d.id)), pct };
}

const avisoVencido = (aviso) =>
  !!aviso.fechaLimite && new Date(aviso.fechaLimite + "T23:59:59") < new Date();

// Avisos que un docente todavía no ha confirmado
const avisosPendientes = (db, user) =>
  db.avisos.filter(a => a.estado === "published"
    && destinatariosDe(db, a).some(d => d.id === user.id)
    && !acuseDe(db, a.id, user.id));

/* ---------------- Utilidades de exportación ---------------------- */

function descargarCSV(nombre, filas) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

function imprimirReporte(titulo, html) {
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>${titulo}</title><style>
    body{font-family:Georgia,serif;padding:32px;color:#1a2340}
    h1{font-size:22px;border-bottom:3px solid #1a2340;padding-bottom:8px}
    table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}
    th,td{border:1px solid #cbd2e0;padding:6px 10px;text-align:left}
    th{background:#eef1f7}.pie{margin-top:24px;font-size:11px;color:#667}
  </style></head><body><h1>${titulo}</h1>${html}
  <p class="pie">Mi portal CBTA 291 · Generado el ${new Date().toLocaleString("es-MX")}</p>
  <script>window.print()</script></body></html>`);
  w.document.close();
}

const leerComoBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = () => rej(new Error("No se pudo leer el archivo"));
  r.readAsDataURL(file);
});

/* ================================================================
   COMPONENTES BASE DE INTERFAZ
   ================================================================ */

const Card = ({ children, className = "", ...resto }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`} {...resto}>{children}</div>
);

const Badge = ({ estado, mapa = ESTADOS_CERT }) => {
  const e = mapa[estado] || { label: estado, color: "bg-slate-200 text-slate-700" };
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${e.color}`}>{e.label}</span>;
};

const Stat = ({ icono: Ic, label, valor, sub, color = "text-slate-900" }) => (
  <Card className="p-4 flex items-start gap-3">
    <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 shrink-0"><Ic size={20} /></div>
    <div className="min-w-0">
      <div className={`text-2xl font-bold leading-tight ${color}`} style={{fontFamily:"'Archivo', sans-serif"}}>{valor}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  </Card>
);

const Progreso = ({ actual, meta, semaforo }) => {
  const pct = meta > 0 ? Math.min(100, Math.round(100 * actual / meta)) : 0;
  const color = SEM_COLORS[semaforo] || "#1a2340";
  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <span className="text-2xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>{actual} <span className="text-sm font-medium text-slate-500">/ {meta} horas</span></span>
        <span className="text-lg font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: pct + "%", background: color }} />
      </div>
      <p className="text-sm text-slate-600 mt-1.5">
        {actual >= meta ? "🎉 ¡Alcanzaste tu meta de capacitación!" : `Te faltan ${meta - actual} horas para alcanzar tu meta.`}
      </p>
    </div>
  );
};

const Modal = ({ titulo, onClose, children, ancho = "max-w-2xl" }) => (
  <div data-formulario-abierto className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-xl w-full ${ancho} my-8`} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h3 className="font-bold text-lg" style={{fontFamily:"'Archivo', sans-serif"}}>{titulo}</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const Campo = ({ label, children, detectado }) => (
  <label className="block">
    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
      {label}
      {detectado === true && <span className="text-emerald-600 text-[10px] font-bold">● detectado por IA</span>}
      {detectado === false && <span className="text-amber-600 text-[10px] font-bold">○ no detectado — captúralo</span>}
    </span>
    {children}
  </label>
);

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";
const btnPrim = "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a2340] text-white text-sm font-semibold hover:bg-[#2a3660] disabled:opacity-50 transition";
const btnSec = "inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition";

/* ================================================================
   PANTALLA DE ACCESO
   ================================================================ */

function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [entrando, setEntrando] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    setErr(""); setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setEntrando(false);
    if (error) {
      setErr(/invalid/i.test(error.message) ? "Correo o contraseña incorrectos." : error.message);
    }
    // Si el acceso es correcto, App detecta la sesión y carga los datos.
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a2340] p-4" style={{fontFamily:"'Inter', sans-serif"}}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={LOGO} alt="CBTA No. 291" className="w-24 h-24 mx-auto mb-3 rounded-full bg-white p-1 shadow-lg" />
          <h1 className="text-white text-2xl font-bold leading-tight" style={{fontFamily:"'Archivo', sans-serif"}}>Mi portal<br />CBTA 291</h1>
          <p className="text-slate-300 text-sm mt-1 max-w-sm mx-auto">
            Todo lo que necesita el docente en un solo lugar: capacitación, expedientes,
            planeaciones, calendarios y más.
          </p>
        </div>
        <Card className="p-6">
          <form onSubmit={entrar} className="space-y-4">
            <Campo label="Correo institucional">
              <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@escuela.mx" required />
            </Campo>
            <Campo label="Contraseña">
              <input className={inputCls} type="password" value={pass} onChange={e => setPass(e.target.value)} required />
            </Campo>
            {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14} />{err}</p>}
            <button className={btnPrim + " w-full justify-center"} disabled={entrando}>
              {entrando && <Loader2 size={15} className="animate-spin" />}Iniciar sesión
            </button>
          </form>
          <p className="mt-4 text-[11px] text-slate-400 leading-snug">
            Las cuentas las crea la administración escolar. Puedes cambiar tu contraseña
            desde “Mi cuenta” una vez que entres. Si la olvidaste, solicita a la
            administración que te asigne una nueva.
          </p>
        </Card>
        <div className="flex items-end justify-center mt-4">
          <img src={MASCOTA} alt="" className="w-28 drop-shadow-xl" />
          <p className="text-slate-200 text-xs mb-6 -ml-2 bg-white/10 rounded-2xl rounded-bl-sm px-3 py-2 leading-snug">
            ¡Bienvenido!<br />CBTA No. 291
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   RAÍZ DE LA APLICACIÓN
   ================================================================ */

export default function App() {
  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [sesion, setSesion] = useState(undefined); // undefined = aún no se sabe; null = sin sesión; string = id del usuario
  const ultimaCarga = useRef(0);
  const cargadaPara = useRef(null); // id de usuario cuyos datos ya están cargados
  const [pagina, setPagina] = useState("dashboard");
  const [paginaCtx, setPaginaCtx] = useState(null); // p.ej. id de docente a abrir
  const [cargando, setCargando] = useState(true);
  const [errCarga, setErrCarga] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [verNotifs, setVerNotifs] = useState(false);
  const snapRef = useRef(null); // último estado confirmado en la nube

  useEffect(() => {
    if (!configurada) return;
    supabase.auth.getSession().then(({ data }) => setSesion(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      // Solo interesa QUIÉN está conectado, no el token: así una renovación
      // de sesión no vuelve a montar la pantalla ni borra lo que se escribe.
      setSesion(prev => {
        const id = s?.user?.id ?? null;
        return prev === id ? prev : id;
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const recargar = useCallback(async (uid, esPrimeraCarga = false) => {
    const d = await cargarTodo(uid);
    const yo = d.users.find(u => u.id === uid);
    if (!yo || (yo.rol === "docente" && !yo.activo)) {
      await supabase.auth.signOut();
      throw new Error("Esta cuenta está desactivada. Contacta a la administración.");
    }
    snapRef.current = JSON.parse(JSON.stringify(d));
    setDb(d);
    setUser(yo);
    // Al iniciar sesión, cada rol aterriza en su pantalla de trabajo;
    // en recargas posteriores no se toca la pantalla en la que esté.
    if (esPrimeraCarga && yo.rol === "docente") setPagina("avisos");
  }, []);

  useEffect(() => {
    if (!configurada || sesion === undefined) return;
    if (!sesion) {
      cargadaPara.current = null;
      setUser(null); setDb(null); snapRef.current = null; setCargando(false);
      return;
    }
    // Si los datos de este mismo usuario ya están en pantalla, no se
    // vuelve a cargar: evita reinicios al renovarse la sesión.
    if (cargadaPara.current === sesion) return;
    cargadaPara.current = sesion;
    setCargando(true); setErrCarga("");
    recargar(sesion, true)
      .catch(e => { cargadaPara.current = null; setErrCarga(e.message); })
      .finally(() => { setCargando(false); ultimaCarga.current = Date.now(); });
  }, [sesion, recargar]);

  // Prepara la recepción de notificaciones y atiende los toques en ellas
  useEffect(() => {
    if (!soportaPush()) return;
    registrarServicio().catch(() => {});
    const alMensaje = (ev) => {
      if (ev.data?.tipo === "ir_a" && ev.data.ruta) setPagina(ev.data.ruta);
    };
    navigator.serviceWorker.addEventListener("message", alMensaje);
    return () => navigator.serviceWorker.removeEventListener("message", alMensaje);
  }, []);

  // Refresca datos al volver a la pestaña, para ver los cambios de otros
  // usuarios. Nunca muestra la pantalla de carga ni desmonta nada: los
  // formularios abiertos conservan lo que se haya escrito. Además se
  // omite si hay un formulario en pantalla o si se recargó hace poco.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible" || !sesion) return;
      if (document.querySelector("[data-formulario-abierto]")) return;
      if (Date.now() - ultimaCarga.current < 15000) return;
      ultimaCarga.current = Date.now();
      recargar(sesion).catch(() => {});
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [sesion, recargar]);

  // Mutación central: aplica cambios en memoria y sincroniza solo las
  // diferencias con Supabase (altas, cambios y bajas por tabla).
  const mutar = useCallback(async (fn) => {
    const nuevo = JSON.parse(JSON.stringify(db));
    await fn(nuevo);
    setDb(nuevo);
    try {
      await sincronizar(snapRef.current, nuevo);
      snapRef.current = JSON.parse(JSON.stringify(nuevo));
    } catch (e) {
      console.error("Error guardando", e);
      alert("No se pudieron guardar los cambios: " + e.message);
    }
    return nuevo;
  }, [db]);

  if (!configurada) return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a2340] text-white p-6">
      <div className="max-w-md text-sm leading-relaxed bg-white/10 rounded-2xl p-6">
        <b>Falta configurar la conexión.</b><br />
        Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> como
        secretos del repositorio (o en un archivo <code>.env</code> local) y vuelve a publicar.
        Consulta el README del proyecto.
      </div>
    </div>
  );

  if (!db && (cargando || sesion === undefined)) return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a2340] text-white gap-3">
      <Loader2 className="animate-spin" /> Cargando sistema…
    </div>
  );

  if (!user) return (
    <>
      <Login />
      {errCarga && (
        <div className="fixed bottom-4 inset-x-0 flex justify-center px-4">
          <p className="bg-rose-600 text-white text-sm rounded-xl px-4 py-2 shadow-lg">{errCarga}</p>
        </div>
      )}
    </>
  );

  const esAdmin = user.rol === "admin";
  const misNotifs = db.notifs.filter(n => n.userId === user.id);
  const noLeidas = misNotifs.filter(n => !n.leida).length;

  const pendValidacion = db.certs.filter(c => c.estado === "pendiente_validacion").length
    + db.grados.filter(g => g.estado === "pendiente").length
    + db.comp.filter(x => x.estado === "pendiente").length;

  const nav = user.rol === "admin" ? [
    { id: "dashboard", label: "Dashboard", icono: LayoutDashboard },
    { id: "avisos", label: "Avisos y Circulares", icono: Megaphone },
    { id: "validaciones", label: "Validaciones", icono: FileCheck, badge: pendValidacion },
    { id: "docentes", label: "Docentes", icono: Users },
    { id: "calendario", label: "Calendario académico", icono: CalendarDays },
    { id: "programas", label: "Programas de Estudio", icono: BookOpen },
    { id: "asignaciones", label: "Asignaciones", icono: FolderOpen },
    { id: "perfil_inst", label: "Perfil académico institucional", icono: GraduationCap },
    { id: "ranking", label: "Ranking de capacitación", icono: Trophy },
    { id: "ranking_entregas", label: "Ranking de entregas", icono: Trophy },
    { id: "ranking_general", label: "Ranking general", icono: Medal },
    { id: "actividad", label: "Actividad reciente", icono: Activity },
    { id: "respaldo", label: "Respaldo", icono: Download },
    { id: "admin", label: "Administración", icono: Settings },
  ] : user.rol === "jefe_formacion" ? [
    { id: "dashboard", label: "Dashboard", icono: LayoutDashboard },
    { id: "validaciones", label: "Validaciones", icono: FileCheck, badge: pendValidacion },
    { id: "docentes", label: "Expedientes docentes", icono: Users },
    { id: "avisos", label: "Avisos y Circulares", icono: Megaphone },
    { id: "calendario", label: "Calendario académico", icono: CalendarDays },
    { id: "ranking", label: "Ranking de capacitación", icono: Trophy },
    { id: "perfil_inst", label: "Perfil académico institucional", icono: GraduationCap },
    { id: "admin", label: "Metas y ciclos", icono: Settings },
  ] : user.rol === "jefe_academico" ? [
    { id: "dashboard", label: "Dashboard", icono: LayoutDashboard },
    { id: "avisos", label: "Avisos y Circulares", icono: Megaphone },
    { id: "calendario", label: "Calendario académico", icono: CalendarDays },
    { id: "programas", label: "Programas de Estudio", icono: BookOpen },
    { id: "asignaciones", label: "Asignaciones", icono: FolderOpen },
    { id: "ranking_entregas", label: "Ranking de entregas", icono: Trophy },
  ] : [
    { id: "avisos", label: "Avisos", icono: Megaphone, badge: avisosPendientes(db, user).length },
    { id: "dashboard", label: "Dashboard", icono: LayoutDashboard },
    { id: "mi_asignacion", label: "Mi asignación", icono: FolderOpen, badge: pendientesEntrega(db, user.id) },
    { id: "calendario", label: "Calendario académico", icono: CalendarDays },
    { id: "programas", label: "Programas de Estudio", icono: BookOpen },
    { id: "cursos", label: "Mis cursos", icono: BookOpen },
    { id: "expediente", label: "Mi perfil académico", icono: GraduationCap },
    ...(db.config.rankingPublico ? [{ id: "ranking", label: "Ranking general", icono: Trophy }] : []),
    { id: "logros", label: "Logros", icono: Award },
  ];

  const irA = (p, ctx = null) => { setPagina(p); setPaginaCtx(ctx); setMenuAbierto(false); setBusqueda(""); };

  const marcarLeidas = () => mutar(d => { d.notifs.forEach(n => { if (n.userId === user.id) n.leida = true; }); });

  return (
    <div className="min-h-screen bg-[#f2f4f8]" style={{fontFamily:"'Inter', sans-serif"}}>
      {cargando && (
        <div className="fixed top-2 right-3 z-[60] text-[11px] text-slate-500 bg-white/90 border border-slate-200 rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
          <Loader2 size={11} className="animate-spin" /> Actualizando…
        </div>
      )}
      {/* Barra superior */}
      <header className="sticky top-0 z-40 bg-[#1a2340] text-white">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button className="lg:hidden p-1.5 rounded-lg hover:bg-white/10" onClick={() => setMenuAbierto(v => !v)}><Menu size={20} /></button>
          <div className="flex items-center gap-2 font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>
            <img src={LOGO} alt="CBTA 291" className="w-9 h-9 rounded-full bg-white p-0.5" />
            <span className="hidden sm:inline leading-tight text-[13px]">Mi portal<br />CBTA 291</span>
          </div>
          <div className="flex-1 max-w-md mx-auto relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder={
                user.rol === "admin" ? "Buscar docente, curso, programa, asignación…" :
                user.rol === "jefe_formacion" ? "Buscar docente, constancia, institución…" :
                user.rol === "jefe_academico" ? "Buscar programa, asignatura, docente, entrega…" :
                "Buscar en mis cursos, programas y entregas…"}
              className="w-full rounded-xl bg-white/10 border border-white/15 pl-9 pr-3 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white/15" />
            {busqueda.trim() && <Buscador db={db} user={user} q={busqueda} irA={irA} cerrar={() => setBusqueda("")} />}
          </div>
          <button className="relative p-2 rounded-lg hover:bg-white/10" onClick={() => { setVerNotifs(v => !v); if (!verNotifs) marcarLeidas(); }}>
            <Bell size={19} />
            {noLeidas > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E8871E] text-[10px] font-bold flex items-center justify-center">{noLeidas}</span>}
          </button>
          <div className="hidden md:block text-right leading-tight">
            <div className="text-sm font-semibold">{user.nombre}</div>
            <div className="text-[11px] text-slate-300">{user.rol === "docente" ? (user.area || "Docente") : NOMBRE_ROL[user.rol]}</div>
          </div>
          <button className="p-2 rounded-lg hover:bg-white/10" title="Cerrar sesión" onClick={() => supabase.auth.signOut()}><LogOut size={18} /></button>
        </div>
        {verNotifs && (
          <div className="absolute right-4 top-14 w-80 max-h-96 overflow-y-auto bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200 z-50">
            <div className="px-4 py-2.5 font-bold text-sm border-b border-slate-100">Notificaciones</div>
            {misNotifs.length === 0 && <p className="p-4 text-sm text-slate-500">Sin notificaciones por ahora.</p>}
            {misNotifs.slice(0, 30).map(n => (
              <div key={n.id} className="px-4 py-2.5 border-b border-slate-50 text-sm">
                <p>{n.texto}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{new Date(n.fecha).toLocaleString("es-MX")}</p>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="flex">
        {/* Navegación lateral */}
        <aside className={`${menuAbierto ? "block" : "hidden"} lg:block w-60 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-52px)] fixed lg:static z-30`}>
          <nav className="p-3 space-y-1">
            {nav.map(item => (
              <button key={item.id} onClick={() => irA(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition ${pagina === item.id ? "bg-[#1a2340] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <item.icono size={17} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-[#E8871E] text-white text-[11px] font-bold flex items-center justify-center">{item.badge}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* Contenido */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl mx-auto w-full">
          {pagina === "dashboard" && (user.rol === "jefe_academico"
            ? <DashboardAcademico db={db} irA={irA} />
            : user.rol === "admin"
              ? <DashboardGeneral db={db} irA={irA} />
              : esRolValidador(user.rol)
                ? <DashboardAdmin db={db} irA={irA} />
                : <DashboardDocente db={db} user={user} irA={irA} />)}
          {pagina === "panel_entregas" && esRolAcademico(user.rol) && <DashboardAcademico db={db} irA={irA} />}
          {pagina === "subir" && <SubirConstancia db={db} user={user} mutar={mutar} irA={irA} />}
          {pagina === "cursos" && <MisCursos db={db} user={user} mutar={mutar} />}
          {pagina === "expediente" && <PerfilAcademico db={db} user={user} docenteId={user.id} mutar={mutar} editable />}
          {pagina === "ranking" && (user.rol === "docente"
            ? <RankingGeneral db={db} user={user} />
            : <Ranking db={db} user={user} />)}
          {pagina === "ranking_entregas" && esRolAcademico(user.rol) && <RankingEntregas db={db} />}
          {pagina === "ranking_general" && esRolComunicador(user.rol) && <RankingGeneral db={db} user={user} />}
          {pagina === "logros" && <Logros db={db} user={user} />}
          {pagina === "avisos" && (esRolComunicador(user.rol)
            ? <Avisos db={db} user={user} mutar={mutar} />
            : <MisAvisos db={db} user={user} recargar={() => recargar(user.id)} />)}
          {pagina === "calendario" && <CalendarioAcademico db={db} user={user} mutar={mutar} puedeEditar={esRolAcademico(user.rol)} />}
          {pagina === "programas" && (esRolAcademico(user.rol)
            ? <ProgramasEstudio db={db} user={user} mutar={mutar} />
            : <ProgramasDocente db={db} />)}
          {pagina === "asignaciones" && esRolAcademico(user.rol) && <Asignaciones db={db} user={user} mutar={mutar} irAPanel={() => irA(user.rol === "jefe_academico" ? "dashboard" : "panel_entregas")} />}
          {pagina === "mi_asignacion" && user.rol === "docente" && <MiAsignacion db={db} user={user} mutar={mutar} />}
          {pagina === "validaciones" && esRolValidador(user.rol) && <Validaciones db={db} user={user} mutar={mutar} />}
          {pagina === "docentes" && esRolValidador(user.rol) && <Docentes db={db} mutar={mutar} irA={irA} esAdmin={esAdmin} />}
          {pagina === "expediente_docente" && esRolValidador(user.rol) && <ExpedienteIntegral db={db} docenteId={paginaCtx} mutar={mutar} user={user} volver={() => irA("docentes")} />}
          {pagina === "reportes" && esRolValidador(user.rol) && <Reportes db={db} />}
          {pagina === "perfil_inst" && esRolValidador(user.rol) && <PerfilInstitucional db={db} />}
          {pagina === "actividad" && esAdmin && <ActividadReciente db={db} />}
          {pagina === "respaldo" && esAdmin && <Respaldo db={db} user={user} />}
          {pagina === "admin" && esRolValidador(user.rol) && <Administracion db={db} user={user} mutar={mutar} esAdmin={esAdmin} />}
        </main>
      </div>
    </div>
  );
}

/* ---------------- Buscador global -------------------------------- */
function Buscador({ db, user, q, irA, cerrar }) {
  const rol = user.rol;
  const esValidador = esRolValidador(rol);
  const esAcademico = esRolAcademico(rol);
  const t = q.toLowerCase();
  const coincide = (...vs) => vs.some(v => (v || "").toLowerCase().includes(t));

  /* Cada rol busca en lo que usa: Formación Docente en expedientes y
     constancias; el Académico en programas, asignaturas y asignaciones;
     el docente en lo suyo. */
  const docentes = (esValidador || esAcademico)
    ? db.users.filter(u => u.rol === "docente" && coincide(u.nombre, u.area)).slice(0, 5) : [];
  const certs = (esValidador || rol === "docente")
    ? db.certs.filter(c => (esValidador || c.docenteId === user.id)
        && coincide(c.datos.curso, c.datos.institucion, c.datos.folio, c.datos.categoria)).slice(0, 6) : [];
  const grados = esValidador
    ? db.grados.filter(g => coincide(g.datos?.programa, g.datos?.institucion, g.nivel)).slice(0, 4) : [];
  const programas = esAcademico || rol === "docente"
    ? db.programas.filter(p => coincide(p.nombre) || asignaturasDe(p).some(a => coincide(a.nombre))).slice(0, 5) : [];
  const asignaciones = esAcademico
    ? db.asignaciones.filter(a => coincide(a.nombreExtraido)
        || (a.items || []).some(i => coincide(i.actividad))).slice(0, 5) : [];
  const entregas = esAcademico
    ? db.entregas.filter(e => coincide(e.actividad, e.titulo)).slice(0, 5)
    : rol === "docente" ? db.entregas.filter(e => e.docenteId === user.id && coincide(e.actividad, e.titulo)).slice(0, 4) : [];
  const avisos = db.avisos.filter(a => (esRolComunicador(rol) || a.estado !== "draft")
    && coincide(a.titulo, a.tipo, a.descripcion)).slice(0, 4);

  const nombreDe = (id) => db.users.find(u => u.id === id)?.nombre || "Docente";
  const vacio = ![docentes, certs, grados, programas, asignaciones, entregas, avisos].some(x => x.length);

  const Seccion = ({ titulo, children }) => (<>
    <div className="px-3 pt-2 text-[11px] font-bold text-slate-400 uppercase">{titulo}</div>
    {children}
  </>);
  const Fila = ({ onClick, icono: Ico, children }) => (
    <button onClick={onClick} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
      {Ico && <Ico size={14} className="text-slate-400 shrink-0" />}<span className="truncate">{children}</span>
    </button>
  );

  return (
    <div className="absolute left-0 right-0 top-10 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
      {docentes.length > 0 && <Seccion titulo="Docentes">
        {docentes.map(d => <Fila key={d.id} icono={User}
          onClick={() => { irA(esValidador ? "expediente_docente" : "asignaciones", d.id); cerrar(); }}>
          {d.nombre} <span className="text-xs text-slate-400">· {d.area || "sin área"}</span>
        </Fila>)}
      </Seccion>}

      {programas.length > 0 && <Seccion titulo="Programas de estudio">
        {programas.map(p => <Fila key={p.id} icono={BookOpen} onClick={() => { irA("programas"); cerrar(); }}>
          {p.nombre} <span className="text-xs text-slate-400">· {asignaturasDe(p).length} asignatura(s)</span>
        </Fila>)}
      </Seccion>}

      {asignaciones.length > 0 && <Seccion titulo="Asignaciones">
        {asignaciones.map(a => <Fila key={a.id} icono={FolderOpen} onClick={() => { irA("asignaciones"); cerrar(); }}>
          {a.nombreExtraido} <span className="text-xs text-slate-400">· ciclo {a.ciclo}</span>
        </Fila>)}
      </Seccion>}

      {entregas.length > 0 && <Seccion titulo="Planeaciones y entregas">
        {entregas.map(e => <Fila key={e.id} icono={FileCheck}
          onClick={() => { irA(rol === "docente" ? "mi_asignacion" : "asignaciones"); cerrar(); }}>
          {e.actividad} <span className="text-xs text-slate-400">· {NOMBRE_TIPO_ENTREGA[e.tipo]}{esAcademico ? ` · ${nombreDe(e.docenteId)}` : ""}</span>
        </Fila>)}
      </Seccion>}

      {certs.length > 0 && <Seccion titulo="Constancias">
        {certs.map(c => <Fila key={c.id} icono={FileText}
          onClick={() => { irA(esValidador ? "validaciones" : "cursos"); cerrar(); }}>
          {c.datos.curso || "(sin título)"} <span className="text-xs text-slate-400">· {c.datos.institucion || "—"}{esValidador ? ` · ${nombreDe(c.docenteId)}` : ""}</span>
        </Fila>)}
      </Seccion>}

      {grados.length > 0 && <Seccion titulo="Grados académicos">
        {grados.map(g => <Fila key={g.id} icono={GraduationCap}
          onClick={() => { irA("expediente_docente", g.docenteId); cerrar(); }}>
          {g.nivel} — {g.datos?.programa || "sin programa"} <span className="text-xs text-slate-400">· {nombreDe(g.docenteId)}</span>
        </Fila>)}
      </Seccion>}

      {avisos.length > 0 && <Seccion titulo="Avisos">
        {avisos.map(a => <Fila key={a.id} icono={Megaphone} onClick={() => { irA("avisos"); cerrar(); }}>
          {a.titulo} <span className="text-xs text-slate-400">· {a.tipo}</span>
        </Fila>)}
      </Seccion>}

      {vacio && <p className="px-3 py-3 text-sm text-slate-500">Sin resultados para “{q}”.</p>}
    </div>
  );
}

/* ================================================================
   DASHBOARD DEL ADMINISTRADOR
   ================================================================ */

const PIE_COLORS = ["#1a2340", "#E8871E", "#2E7D5B", "#D9A404", "#C9463D", "#5B6EE8", "#8B5CA8", "#3A9BB5", "#B5703A", "#6b7280", "#94a3b8"];

function usarFiltros(db) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const [categoria, setCategoria] = useState("todas");
  const [docente, setDocente] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const certs = db.certs.filter(c =>
    (ciclo === "historico" || c.ciclo === ciclo) &&
    (categoria === "todas" || c.datos.categoria === categoria) &&
    (docente === "todos" || c.docenteId === docente) &&
    (estado === "todos" || c.estado === estado)
  );
  const UI = (
    <div className="flex flex-wrap gap-2 items-center">
      <Filter size={15} className="text-slate-400" />
      <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
        {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
        <option value="historico">Histórico</option>
      </select>
      <select className={inputCls + " !mt-0 !w-auto"} value={categoria} onChange={e => setCategoria(e.target.value)}>
        <option value="todas">Todas las categorías</option>
        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
      </select>
      <select className={inputCls + " !mt-0 !w-auto"} value={docente} onChange={e => setDocente(e.target.value)}>
        <option value="todos">Todos los docentes</option>
        {db.users.filter(u => u.rol === "docente").map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
      <select className={inputCls + " !mt-0 !w-auto"} value={estado} onChange={e => setEstado(e.target.value)}>
        <option value="todos">Todos los estados</option>
        {Object.entries(ESTADOS_CERT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
  );
  return { certs, ciclo, UI };
}

/* El administrador general ve las dos áreas en un mismo tablero:
   capacitación (Formación Docente) y planeaciones (Académico), más los
   reportes descargables de cada una. */
function DashboardGeneral({ db, irA }) {
  const [area, setArea] = useState("formacion");
  const tabs = [
    ["formacion", "Formación Docente", Award],
    ["academico", "Académico y Competencias", FileCheck],
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map(([id, txt, Ico]) => (
          <button key={id} onClick={() => setArea(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${area === id ? "bg-white text-[#1a2340] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Ico size={14}/>{txt}
          </button>
        ))}
      </div>
      {area === "formacion" && <DashboardAdmin db={db} irA={irA} />}
      {area === "academico" && <DashboardAcademico db={db} irA={irA} compacto />}
    </div>
  );
}

function DashboardAdmin({ db, irA }) {
  const { certs, ciclo, UI } = usarFiltros(db);
  const docentes = db.users.filter(u => u.rol === "docente" && u.activo);
  const validadas = certs.filter(c => c.estado === "validada");
  const horasTot = validadas.reduce((s, c) => s + (Number(c.datos.horas) || 0), 0);
  const pendientes = db.certs.filter(c => c.estado === "pendiente_validacion").length;
  const cumplieron = docentes.filter(d => horasValidadas(db, d.id, ciclo) >= metaDe(db, d.id)).length;

  const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const porMes = MESES.map((m, i) => ({ mes: m, horas: validadas.filter(c => c.datos.fecha_termino && new Date(c.datos.fecha_termino + "T12:00").getMonth() === i).reduce((s, c) => s + (Number(c.datos.horas) || 0), 0) }));
  const porDocente = docentes.map(d => ({ nombre: d.nombre.split(" ")[0] + " " + (d.nombre.split(" ")[1]?.[0] || "") + ".", horas: certs.filter(c => c.docenteId === d.id && c.estado === "validada").reduce((s, c) => s + (Number(c.datos.horas) || 0), 0) })).sort((a, b) => b.horas - a.horas);
  const porCat = CATEGORIAS.map(cat => ({ name: cat, value: validadas.filter(c => c.datos.categoria === cat).length })).filter(x => x.value > 0);
  const cumpl = [
    { name: "Meta alcanzada", value: docentes.filter(d => { const p = 100 * horasValidadas(db, d.id, ciclo) / metaDe(db, d.id); return p >= db.config.semVerde; }).length, color: SEM_COLORS.verde },
    { name: "En proceso", value: docentes.filter(d => { const p = 100 * horasValidadas(db, d.id, ciclo) / metaDe(db, d.id); return p >= db.config.semAmarillo && p < db.config.semVerde; }).length, color: SEM_COLORS.amarillo },
    { name: "Bajo cumplimiento", value: docentes.filter(d => { const p = 100 * horasValidadas(db, d.id, ciclo) / metaDe(db, d.id); return p < db.config.semAmarillo; }).length, color: SEM_COLORS.rojo },
  ].filter(x => x.value > 0);
  const porCiclo = {};
  db.certs.filter(c => c.estado === "validada" && c.ciclo).forEach(c => {
    porCiclo[c.ciclo] = (porCiclo[c.ciclo] || 0) + (Number(c.datos.horas) || 0);
  });
  const evolucion = Object.entries(porCiclo).sort().map(([anio, horas]) => ({ anio, horas }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Panorama institucional</h2>
        {UI}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat icono={Users} label="Docentes activos" valor={docentes.length} />
        <Stat icono={BookOpen} label="Cursos registrados" valor={certs.length} />
        <Stat icono={Clock} label="Horas validadas" valor={horasTot} />
        <Stat icono={TrendingUp} label="Promedio por docente" valor={docentes.length ? (horasTot / docentes.length).toFixed(1) : 0} />
        <Stat icono={FileCheck} label="Constancias pendientes" valor={pendientes} color={pendientes > 0 ? "text-amber-600" : "text-slate-900"} />
        <Stat icono={Target} label="Alcanzaron la meta" valor={docentes.length ? Math.round(100 * cumplieron / docentes.length) + "%" : "—"} sub={`${cumplieron} de ${docentes.length}`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Horas de capacitación por mes</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porMes}><CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="horas" fill="#1a2340" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Horas por docente</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porDocente}><CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
              <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-25} height={50} textAnchor="end" /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="horas" fill="#E8871E" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Cursos por categoría</h3>
          {porCat.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">Aún no hay cursos validados con estos filtros.</p> :
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={porCat} dataKey="value" nameKey="name" outerRadius={80} label={{ fontSize: 10 }}>
              {porCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie>
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>}
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Docentes según cumplimiento de meta</h3>
          {cumpl.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">Sin docentes registrados.</p> :
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={cumpl} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} label>
              {cumpl.map((x, i) => <Cell key={i} fill={x.color} />)}</Pie>
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>}
        </Card>
        <Card className="p-4 lg:col-span-2">
          <h3 className="font-bold text-sm mb-3">Evolución de horas de capacitación por ciclo escolar (histórico)</h3>
          {evolucion.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">Aún no hay historial.</p> :
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={evolucion}><CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
              <XAxis dataKey="anio" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Line type="monotone" dataKey="horas" stroke="#1a2340" strokeWidth={2.5} dot={{ fill: "#E8871E", r: 4 }} /></LineChart>
          </ResponsiveContainer>}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm">Actividad reciente</h3>
            <button className="text-xs text-indigo-600 font-semibold" onClick={() => irA("actividad")}>Ver todo</button>
          </div>
          {db.activity.slice(0, 6).map(a => (
            <div key={a.id} className="py-2 border-b border-slate-100 last:border-0 text-sm text-slate-700">
              {a.texto}<span className="block text-[11px] text-slate-400">{new Date(a.fecha).toLocaleString("es-MX")}</span>
            </div>
          ))}
          {db.activity.length === 0 && <p className="text-sm text-slate-400 py-4">La actividad de la escuela aparecerá aquí.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-2">Semáforo de docentes · ciclo {ciclo === "historico" ? "histórico" : ciclo}</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {docentes.map(d => {
              const h = horasValidadas(db, d.id, ciclo); const m = metaDe(db, d.id);
              const pct = m ? Math.round(100 * h / m) : 0; const sem = semaforoDe(db, pct);
              return (
                <button key={d.id} onClick={() => irA("expediente_docente", d.id)} className="w-full flex items-center gap-2 text-sm py-1 hover:bg-slate-50 rounded-lg px-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SEM_COLORS[sem] }} />
                  <span className="flex-1 text-left truncate">{d.nombre}</span>
                  <span className="text-xs font-semibold text-slate-500">{h}/{m} h · {pct}%</span>
                  <ChevronRight size={14} className="text-slate-300" />
                </button>
              );
            })}
            {docentes.length === 0 && <p className="text-sm text-slate-400 py-2">Agrega docentes en la sección Docentes.</p>}
          </div>
        </Card>
      </div>
      <Reportes db={db} dentroDeTablero />
    </div>
  );
}

/* ================================================================
   DASHBOARD DEL DOCENTE
   ================================================================ */

function DashboardDocente({ db, user, irA }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const h = horasValidadas(db, user.id, ciclo);
  const hp = horasPendientes(db, user.id, ciclo);
  const meta = metaDe(db, user.id);
  const pct = meta ? Math.round(100 * h / meta) : 0;
  const sem = semaforoDe(db, pct);
  const rank = rankingDe(db, ciclo);
  const pos = rank.findIndex(r => r.id === user.id) + 1;
  const misCerts = db.certs.filter(c => c.docenteId === user.id);
  const validados = misCerts.filter(c => c.estado === "validada");
  const pendCount = misCerts.filter(c => ["pendiente_validacion", "revision_docente"].includes(c.estado)).length;
  const exp = completitudExpediente(db, user.id);
  const misLogros = db.logros.filter(l => l.docenteId === user.id && l.clave.endsWith("@" + ciclo));
  const pendAvisos = avisosPendientes(db, user);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={MASCOTA} alt="" className="w-14 h-14 object-contain object-top hidden sm:block" />
          <div>
            <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Hola, {user.nombre.split(" ")[0]}</h2>
            <p className="text-sm text-slate-500">{user.area || "Docente"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
            {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          </select>
          <button className={btnPrim} onClick={() => irA("subir")}><Upload size={15} /> Subir constancia</button>
        </div>
      </div>

      {pendAvisos.length > 0 && (
        <button onClick={() => irA("avisos")}
          className={`w-full text-left p-3 rounded-2xl border flex items-center gap-3 transition ${
            pendAvisos.some(a => a.prioridad === "Urgente")
              ? "bg-rose-50 border-rose-200 hover:bg-rose-100"
              : "bg-amber-50 border-amber-200 hover:bg-amber-100"}`}>
          <Megaphone className={pendAvisos.some(a => a.prioridad === "Urgente") ? "text-rose-600 shrink-0" : "text-amber-600 shrink-0"} size={20} />
          <div className="flex-1 text-sm">
            <b>{pendAvisos.length} aviso{pendAvisos.length > 1 ? "s" : ""} pendiente{pendAvisos.length > 1 ? "s" : ""} de enterado.</b>{" "}
            Consulta los comunicados y confirma que los leíste.
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </button>
      )}

      {exp.pct < 100 && (
        <button onClick={() => irA("expediente")} className="w-full text-left p-3 rounded-2xl bg-sky-50 border border-sky-200 flex items-center gap-3 hover:bg-sky-100 transition">
          <GraduationCap className="text-sky-600 shrink-0" size={20} />
          <div className="flex-1 text-sm text-sky-900">
            <b>Perfil académico completado al {exp.pct}%.</b> Completa tu expediente para que la escuela conozca tu formación.
          </div>
          <ChevronRight size={16} className="text-sky-400" />
        </button>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Target size={16} /> Mi meta del ciclo</h3>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: SEM_COLORS[sem] + "22", color: SEM_COLORS[sem] }}>
              {sem === "verde" ? "Meta alcanzada" : sem === "amarillo" ? "En proceso" : "Bajo cumplimiento"}
            </span>
          </div>
          <Progreso actual={h} meta={meta} semaforo={sem} />
        </Card>
        <Card className="p-5 flex flex-col items-center justify-center text-center bg-gradient-to-b from-[#1a2340] to-[#2a3660] text-white">
          <Trophy className="text-[#E8871E] mb-1" size={26} />
          <div className="text-3xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>{pos > 0 && h > 0 ? `#${pos}` : "—"}</div>
          <div className="text-xs text-slate-300">Posición en el ranking{db.config.rankingPublico ? "" : " (privado)"}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icono={BookOpen} label="Cursos validados" valor={validados.filter(c => c.ciclo === ciclo).length} sub={`${validados.length} en total`} />
        <Stat icono={Clock} label="Horas acumuladas" valor={h} sub="este ciclo" />
        <Stat icono={FileCheck} label="Horas pendientes" valor={hp} sub={`${pendCount} constancia(s)`} color={hp > 0 ? "text-amber-600" : "text-slate-900"} />
        <Stat icono={Award} label="Insignias del ciclo" valor={misLogros.length} sub={`de ${LOGROS_DEF.length} posibles`} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">Historial de cursos</h3>
          <button className="text-xs text-indigo-600 font-semibold" onClick={() => irA("cursos")}>Ver todos</button>
        </div>
        <TablaCursos certs={misCerts.slice().sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || "")).slice(0, 5)} db={db} />
      </Card>
    </div>
  );
}

function TablaCursos({ certs, db, acciones }) {
  if (certs.length === 0) return <p className="text-sm text-slate-400 py-6 text-center">Todavía no hay constancias aquí. Sube tu primera constancia para comenzar.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-200">
          <th className="py-2 pr-3">Curso</th><th className="py-2 pr-3 hidden md:table-cell">Institución</th>
          <th className="py-2 pr-3">Horas</th><th className="py-2 pr-3 hidden lg:table-cell">Categoría</th>
          <th className="py-2 pr-3 hidden md:table-cell">Término</th>
          <th className="py-2 pr-3 hidden sm:table-cell">Ciclo</th><th className="py-2 pr-3">Estado</th>
          {acciones && <th className="py-2"></th>}
        </tr></thead>
        <tbody>
          {certs.map(c => (
            <tr key={c.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2.5 pr-3 font-medium max-w-[220px]">
                <div className="truncate">{c.datos.curso || <span className="text-slate-400 italic">Sin título detectado</span>}</div>
                {c.dupFlag && <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1"><AlertTriangle size={11}/>Posible constancia duplicada</span>}
              </td>
              <td className="py-2.5 pr-3 hidden md:table-cell text-slate-500 max-w-[180px] truncate">{c.datos.institucion || "—"}</td>
              <td className="py-2.5 pr-3 font-semibold">{c.datos.horas ?? "—"}</td>
              <td className="py-2.5 pr-3 hidden lg:table-cell text-slate-500">{c.datos.categoria || "—"}</td>
              <td className="py-2.5 pr-3 hidden md:table-cell text-slate-500">{fmtFecha(c.datos.fecha_termino)}</td>
              <td className="py-2.5 pr-3 hidden sm:table-cell text-slate-500 whitespace-nowrap">
                {c.ciclo || "—"}
                {!tieneFechaDeCiclo(c.datos) && (
                  <span title="Sin fecha de emisión registrada: captúrala para archivar la constancia en el ciclo correcto."
                    className="ml-1 text-amber-500">⚠</span>
                )}
              </td>
              <td className="py-2.5 pr-3"><Badge estado={c.estado} />
                {c.estado === "rechazada" && c.motivoRechazo && <div className="text-[11px] text-rose-600 mt-0.5 max-w-[180px]">Motivo: {c.motivoRechazo}</div>}
              </td>
              {acciones && <td className="py-2.5">{acciones(c)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   CARGA DE CONSTANCIAS · flujo con IA
   ================================================================ */

const camposConstancia = [
  ["curso", "Nombre del curso", "text"],
  ["institucion", "Institución que lo impartió", "text"],
  ["fecha_inicio", "Fecha de inicio", "date"],
  ["fecha_termino", "Fecha de término", "date"],
  ["horas", "Duración en horas", "number"],
  ["modalidad", "Modalidad", "text"],
  ["folio", "Folio de la constancia", "text"],
  ["fecha_emision", "Fecha de emisión", "date"],
];

function FormularioConstancia({ cert, onChange }) {
  const d = cert.datos;
  const set = (k, v) => onChange({ ...cert, datos: { ...d, [k]: v === "" ? null : v } });
  const detectado = (k) => cert.detectados ? cert.detectados.includes(k) : undefined;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {camposConstancia.map(([k, label, tipo]) => (
        <Campo key={k} label={label} detectado={detectado(k)}>
          <input className={inputCls} type={tipo} value={d[k] ?? ""} onChange={e => set(k, tipo === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
        </Campo>
      ))}
      <Campo label="Categoría o área de capacitación" detectado={detectado("categoria")}>
        <select className={inputCls} value={d.categoria ?? ""} onChange={e => set("categoria", e.target.value)}>
          <option value="">— Selecciona —</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
      </Campo>
      <Campo label="Otros datos detectados">
        <input className={inputCls} value={d.otros ?? ""} onChange={e => set("otros", e.target.value)} />
      </Campo>
    </div>
  );
}

function SubirConstancia({ db, user, mutar, irA }) {
  const [fase, setFase] = useState("elegir"); // elegir | subiendo | ia | revisar | enviado | error
  const [progreso, setProgreso] = useState(0);
  const [cert, setCert] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [avisoArchivo, setAvisoArchivo] = useState("");
  const inputRef = useRef();
  const exp = completitudExpediente(db, user.id);
  const bloqueado = db.config.perfilObligatorio && exp.pct < 100;

  const procesar = async (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") { setErrMsg("Solo se aceptan archivos PDF para constancias."); setFase("error"); return; }
    setFase("subiendo"); setProgreso(10); setErrMsg(""); setAvisoArchivo("");
    try {
      const base64 = await leerComoBase64(file);
      setProgreso(35);
      const id = uid();
      const guardado = await guardarArchivo(id, base64, file.type, file.name);
      if (!guardado.guardado) setAvisoArchivo("El PDF supera el límite de almacenamiento; se registrarán los datos pero el archivo no quedará guardado. Conserva tu original.");
      setProgreso(55); setFase("ia");
      let datos = {}, detectados = [], fallo = false;
      try {
        datos = await extraerConIA({ base64, mime: "application/pdf", tipo: "constancia" });
        detectados = Object.entries(datos).filter(([k, v]) => v !== null && v !== "" && k !== "docente").map(([k]) => k);
      } catch (e) { fallo = true; }
      setProgreso(90);
      const nuevo = {
        id, docenteId: user.id, ciclo: cicloDeConstancia(datos),
        archivoNombre: file.name, archivoGuardado: guardado.guardado,
        estado: "revision_docente",
        datos: {
          curso: datos.curso ?? null, institucion: datos.institucion ?? null,
          fecha_inicio: datos.fecha_inicio ?? null, fecha_termino: datos.fecha_termino ?? null,
          horas: datos.horas ?? null, modalidad: datos.modalidad ?? null,
          categoria: CATEGORIAS.includes(datos.categoria) ? datos.categoria : (datos.categoria ? "Otro" : null),
          folio: datos.folio ?? null, fecha_emision: datos.fecha_emision ?? null, otros: datos.otros ?? null,
        },
        detectados, iaFallo: fallo, creadoEn: ahora(),
        historial: [{ fecha: ahora(), accion: "Constancia cargada" + (fallo ? " (la IA no pudo procesarla; captura manual)" : " y procesada con IA"), por: user.nombre }],
      };
      setCert(nuevo); setProgreso(100); setFase("revisar");
    } catch (e) {
      setErrMsg("Ocurrió un problema al procesar el archivo: " + e.message); setFase("error");
    }
  };

  const enviarValidacion = async () => {
    if (!cert.datos.curso || !cert.datos.horas) {
      setErrMsg("Antes de enviar, captura al menos el nombre del curso y las horas."); return;
    }
    await mutar(d => {
      const dup = detectarDuplicado(d, cert);
      const c = { ...cert, estado: "pendiente_validacion", dupFlag: !!dup };
      c.historial.push({ fecha: ahora(), accion: "Enviada a validación por el docente" + (dup ? " · marcada como posible duplicado" : ""), por: user.nombre });
      d.certs.unshift(c);
      registrarActividad(d, `${user.nombre} subió una nueva constancia: “${c.datos.curso}”.`);
      d.users.filter(u => esRolValidador(u.rol) && u.activo).forEach(a =>
        notificar(d, a.id, `📄 ${user.nombre} envió la constancia “${c.datos.curso}” a validación.${dup ? " ⚠️ Posible duplicado." : ""}`));
    });
    setFase("enviado");
  };

  const noDetectados = cert ? camposConstancia.map(([k]) => k).concat(["categoria"]).filter(k => !(cert.detectados || []).includes(k)) : [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Subir constancia</h2>
      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 flex-wrap">
        {["Subir", "Extraer con IA", "Revisar", "Enviar a validación"].map((p, i) => (
          <React.Fragment key={p}>
            {i > 0 && <ChevronRight size={12} />}
            <span className={["elegir","subiendo"].includes(fase) && i === 0 || fase === "ia" && i === 1 || fase === "revisar" && i === 2 || fase === "enviado" && i === 3 ? "text-[#E8871E]" : ""}>{p}</span>
          </React.Fragment>
        ))}
      </div>

      {bloqueado && (
        <Card className="p-4 border-amber-300 bg-amber-50 text-sm text-amber-900 flex gap-2">
          <AlertTriangle size={18} className="shrink-0" />
          <span>La administración activó el <b>perfil obligatorio</b>: completa tu perfil académico ({exp.pct}%) antes de registrar capacitaciones. Ve a <b>Mi perfil académico</b>.</span>
        </Card>
      )}

      {fase === "elegir" && !bloqueado && (
        <Card className="p-8 text-center border-2 border-dashed border-slate-300 hover:border-[#E8871E] transition cursor-pointer" >
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={e => procesar(e.target.files[0])} />
          <div onClick={() => inputRef.current.click()}>
            <Upload size={36} className="mx-auto text-slate-300 mb-3" />
            <p className="font-semibold">Selecciona el PDF de tu constancia</p>
            <p className="text-sm text-slate-500 mt-1">El sistema leerá el documento con IA y te mostrará los datos detectados para que los revises.</p>
            <button className={btnPrim + " mt-4"}>Elegir archivo PDF</button>
          </div>
        </Card>
      )}

      {(fase === "subiendo" || fase === "ia") && (
        <Card className="p-8 text-center">
          <Loader2 size={32} className="mx-auto animate-spin text-[#E8871E] mb-3" />
          <p className="font-semibold">{fase === "subiendo" ? "Guardando tu archivo…" : "La IA está leyendo tu constancia…"}</p>
          <div className="h-2 rounded-full bg-slate-200 mt-4 max-w-xs mx-auto overflow-hidden">
            <div className="h-full bg-[#E8871E] rounded-full transition-all duration-500" style={{ width: progreso + "%" }} />
          </div>
        </Card>
      )}

      {fase === "revisar" && cert && (
        <Card className="p-5 space-y-4" data-formulario-abierto>
          <div className="flex items-center gap-2 text-sm">
            <FileText size={16} className="text-slate-400" />
            <span className="font-medium">{cert.archivoNombre}</span>
            <Badge estado="revision_docente" />
          </div>
          {avisoArchivo && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{avisoArchivo}</p>}
          {cert.iaFallo
            ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">La IA no pudo extraer información de este documento. Captura los datos manualmente.</p>
            : <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                La IA detectó <b>{(cert.detectados || []).length}</b> campo(s). {noDetectados.length > 0 && <>No pudo detectar: <b>{noDetectados.length}</b> campo(s) (marcados en ámbar). La IA nunca inventa datos: revisa y completa lo que falte.</>}
              </p>}
          <FormularioConstancia cert={cert} onChange={setCert} />
          {errMsg && <p className="text-sm text-rose-600">{errMsg}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <button className={btnSec} onClick={() => { setCert(null); setFase("elegir"); }}>Descartar</button>
            <button className={btnPrim} onClick={enviarValidacion}><CheckCircle2 size={15} /> Enviar a validación</button>
          </div>
        </Card>
      )}

      {fase === "enviado" && (
        <Card className="p-8 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-600 mb-3" />
          <p className="font-bold text-lg">Constancia enviada a validación</p>
          <p className="text-sm text-slate-500 mt-1">Las horas se sumarán a tu historial cuando la administración la valide. Puedes seguir su estado en “Mis cursos”.</p>
          <div className="flex gap-2 justify-center mt-4">
            <button className={btnSec} onClick={() => { setCert(null); setFase("elegir"); }}>Subir otra</button>
            <button className={btnPrim} onClick={() => irA("cursos")}>Ir a mis cursos</button>
          </div>
        </Card>
      )}

      {fase === "error" && (
        <Card className="p-6 text-center">
          <XCircle size={32} className="mx-auto text-rose-500 mb-2" />
          <p className="text-sm text-slate-700">{errMsg}</p>
          <button className={btnSec + " mt-3"} onClick={() => setFase("elegir")}>Intentar de nuevo</button>
        </Card>
      )}
    </div>
  );
}

/* ================================================================
   MIS CURSOS (docente)
   ================================================================ */

function VerArchivoBtn({ certId, guardado }) {
  const [abriendo, setAbriendo] = useState(false);
  if (!guardado) return null;
  const abrir = async () => {
    setAbriendo(true);
    const f = await leerArchivo(certId);
    setAbriendo(false);
    if (!f) return;
    const bytes = atob(f.base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: f.mime }));
    window.open(url, "_blank");
  };
  return <button onClick={abrir} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Ver documento">{abriendo ? <Loader2 size={15} className="animate-spin"/> : <Eye size={15} />}</button>;
}

function MisCursos({ db, user, mutar }) {
  const [cicloF, setCicloF] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [cat, setCat] = useState("todas");
  const [editando, setEditando] = useState(null);
  const mis = db.certs.filter(c => c.docenteId === user.id)
    .filter(c => cicloF === "todos" || c.ciclo === cicloF)
    .filter(c => estado === "todos" || c.estado === estado)
    .filter(c => cat === "todas" || c.datos.categoria === cat)
    .sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || ""));
  const misCiclos = [...new Set(db.certs.filter(c => c.docenteId === user.id).map(c => c.ciclo).filter(Boolean))].sort().reverse();

  // El docente puede quitar de su historial una constancia rechazada
  const descartarRechazada = async (c) => {
    if (c.estado !== "rechazada") return;
    if (!window.confirm(`¿Quitar de tu historial la constancia “${c.datos.curso || c.archivoNombre}”?\n\nNo pasó la validación, así que no suma horas. Esta acción no se puede deshacer.`)) return;
    await mutar(d => { d.certs = d.certs.filter(x => x.id !== c.id); });
    await eliminarArchivo(c.id);
  };

  const guardarEdicion = async () => {
    await mutar(d => {
      const c = d.certs.find(x => x.id === editando.id);
      if (!c || c.estado === "validada") return; // no editable tras validación
      c.datos = editando.datos;
      c.ciclo = cicloDeConstancia(editando.datos); // corte de ciclo en agosto
      c.estado = "pendiente_validacion";
      c.dupFlag = !!detectarDuplicado(d, c);
      c.historial.push({ fecha: ahora(), accion: "Datos corregidos por el docente y reenviados a validación", por: user.nombre });
      d.users.filter(u => esRolValidador(u.rol) && u.activo).forEach(a => notificar(d, a.id, `✏️ ${user.nombre} corrigió la constancia “${c.datos.curso}”.`));
    });
    setEditando(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mis cursos</h2>
        <div className="flex flex-wrap gap-2">
          <select className={inputCls + " !mt-0 !w-auto"} value={cicloF} onChange={e => setCicloF(e.target.value)}>
            <option value="todos">Todos los ciclos</option>{misCiclos.map(a => <option key={a} value={a}>Ciclo {a}</option>)}
          </select>
          <select className={inputCls + " !mt-0 !w-auto"} value={cat} onChange={e => setCat(e.target.value)}>
            <option value="todas">Todas las categorías</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className={inputCls + " !mt-0 !w-auto"} value={estado} onChange={e => setEstado(e.target.value)}>
            <option value="todos">Todos los estados</option>
            {Object.entries(ESTADOS_CERT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <Card className="p-4">
        <TablaCursos certs={mis} db={db} acciones={(c) => (
          <div className="flex gap-1">
            <VerArchivoBtn certId={c.id} guardado={c.archivoGuardado} />
            {["revision_docente", "pendiente_validacion", "rechazada"].includes(c.estado) &&
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Corregir datos" onClick={() => setEditando(JSON.parse(JSON.stringify(c)))}><Pencil size={15} /></button>}
            {c.estado === "rechazada" &&
              <button className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="Quitar de mi historial" onClick={() => descartarRechazada(c)}><Trash2 size={15} /></button>}
          </div>
        )} />
      </Card>
      {editando && (
        <Modal titulo="Corregir constancia" onClose={() => setEditando(null)}>
          <FormularioConstancia cert={editando} onChange={setEditando} />
          <p className="text-xs text-slate-500 mt-3">Al guardar, la constancia volverá a la fila de validación de la administración.</p>
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            <button className={btnPrim} onClick={guardarEdicion}>Guardar y reenviar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   RANKING Y PODIO
   ================================================================ */

/* ================================================================
   RANKING DE ENTREGAS (jefe académico y administrador)
   ================================================================ */

function RankingEntregas({ db }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const rank = rankingEntregas(db, ciclo).filter(r => r.conAsignacion);
  const podio = rank.slice(0, 3);
  const resto = rank.slice(3);
  const medallas = ["🥇", "🥈", "🥉"];

  const exportar = () => {
    const filas = [["Lugar", "Docente", "Área", "Entregas requeridas", "Entregas recibidas", "% de cumplimiento"]];
    rank.forEach((r, i) => filas.push([i + 1, r.nombre, r.area || "", r.requeridas, r.entregadas, r.pct + "%"]));
    descargarCSV(`ranking_entregas_${ciclo}`, filas);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Ranking de entregas</h2>
          <p className="text-sm text-slate-500">Cumplimiento de planeaciones, planes de trabajo e informes.</p>
        </div>
        <div className="flex gap-2">
          <button className={btnSec + " !px-3 !py-1.5"} onClick={exportar}><Download size={13}/>CSV</button>
          <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
            {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          </select>
        </div>
      </div>

      {rank.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-400">
          No hay asignaciones cargadas en este ciclo, así que todavía no hay nada que comparar.
        </Card>
      )}

      {podio.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[1, 0, 2].map(pos => {
            const r = podio[pos];
            if (!r) return <div key={pos} />;
            return (
              <Card key={pos} className={`p-4 text-center ${pos === 0 ? "ring-2 ring-[#E8871E]" : ""}`}>
                <div className="text-3xl">{medallas[pos]}</div>
                <div className="font-bold text-sm mt-1 truncate">{r.nombre}</div>
                <div className="text-xs text-slate-500">{r.area || "Sin área"}</div>
                <div className="text-2xl font-bold text-[#1a2340] mt-2">{r.pct}%</div>
                <div className="text-[11px] text-slate-500">{r.entregadas} de {r.requeridas} entregas</div>
              </Card>
            );
          })}
        </div>
      )}

      {resto.length > 0 && (
        <Card className="p-4">
          {resto.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className="w-6 text-sm font-bold text-slate-400">{i + 4}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.nombre}</div>
                <div className="text-xs text-slate-500">{r.entregadas} de {r.requeridas} entregas{r.indeterminado && " · algunos requisitos por definir"}</div>
              </div>
              <div className="w-28">
                <div className="text-[11px] text-slate-500 text-right mb-0.5">{r.pct}%</div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full ${r.pct >= 100 ? "bg-emerald-600" : r.pct >= 60 ? "bg-[#E8871E]" : "bg-rose-500"}`} style={{ width: Math.min(r.pct, 100) + "%" }} />
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ================================================================
   RANKING GENERAL DEL DOCENTE (capacitación + entregas)
   ================================================================ */

function RankingGeneral({ db, user }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const [periodo, setPeriodo] = useState(periodoDeFecha());
  const esStaff = user.rol !== "docente";
  // El interruptor de ranking público solo afecta a los docentes
  if (!esStaff && !db.config.rankingPublico) return (
    <Card className="p-8 text-center text-sm text-slate-500">La administración ha desactivado la visualización pública del ranking.</Card>
  );
  const rank = rankingGeneral(db, ciclo, periodo);

  const exportar = () => {
    const filas = [["Lugar", "Docente", "Área", "Horas de capacitación", "% capacitación",
      "Entregas recibidas", "Entregas requeridas", "% entregas", "Puntaje general"]];
    rank.forEach((r, i) => filas.push([i + 1, r.nombre, r.area || "", r.horas, r.pctCap + "%",
      r.av?.entregadas ?? "", r.av?.requeridas ?? "", r.pctEnt === null ? "sin asignación" : r.pctEnt + "%", r.puntos]));
    descargarCSV(`ranking_general_${ciclo}_${periodo}`, filas);
  };
  const yo = rank.findIndex(r => r.id === user.id);
  const podio = rank.slice(0, 3);
  const resto = rank.slice(3);
  const medallas = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Ranking general</h2>
          <p className="text-sm text-slate-500">Combina capacitación y entrega de planeaciones, con el mismo peso cada una.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {esStaff && <button className={btnSec + " !px-3 !py-1.5"} onClick={exportar}><Download size={13}/>CSV</button>}
          <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
            {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          </select>
          <select className={inputCls + " !mt-0 !w-auto"} value={periodo} onChange={e => setPeriodo(e.target.value)}>
            {PERIODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </div>
      </div>

      {esStaff && rank.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icono={Users} label="Docentes" valor={rank.length} />
          <Stat icono={Target} label="Puntaje promedio" valor={Math.round(rank.reduce((s, r) => s + r.puntos, 0) / rank.length)} />
          <Stat icono={Award} label="Con 80 o más" valor={rank.filter(r => r.puntos >= 80).length} />
          <Stat icono={AlertTriangle} label="Por debajo de 50" valor={rank.filter(r => r.puntos < 50).length} />
        </div>
      )}

      {!esStaff && yo >= 0 && (
        <Card className="p-4 bg-[#1a2340] text-white">
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">#{yo + 1}</div>
              <div className="text-[11px] text-slate-300">de {rank.length}</div>
            </div>
            <div className="flex-1 min-w-[180px] grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-bold">{rank[yo].puntos}</div>
                <div className="text-[11px] text-slate-300">puntos</div>
              </div>
              <div>
                <div className="text-lg font-bold">{rank[yo].pctCap}%</div>
                <div className="text-[11px] text-slate-300">capacitación</div>
              </div>
              <div>
                <div className="text-lg font-bold">{rank[yo].pctEnt === null ? "—" : rank[yo].pctEnt + "%"}</div>
                <div className="text-[11px] text-slate-300">entregas</div>
              </div>
            </div>
          </div>
          {rank[yo].pctEnt === null && (
            <p className="text-[11px] text-slate-300 mt-2">
              Aún no tienes asignación cargada, así que tu puntaje considera solo la capacitación.
            </p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[1, 0, 2].map(pos => {
          const r = podio[pos];
          if (!r) return <div key={pos} />;
          return (
            <Card key={pos} className={`p-4 text-center ${r.id === user.id ? "ring-2 ring-[#E8871E]" : ""}`}>
              <div className="text-3xl">{medallas[pos]}</div>
              <div className="font-bold text-sm mt-1 truncate">{r.nombre}</div>
              <div className="text-2xl font-bold text-[#1a2340] mt-2">{r.puntos}</div>
              <div className="text-[11px] text-slate-500">{r.horas} h · {r.pctEnt === null ? "sin asignación" : r.pctEnt + "% entregas"}</div>
            </Card>
          );
        })}
      </div>

      {resto.length > 0 && (
        <Card className="p-4">
          {resto.map((r, i) => (
            <div key={r.id} className={`flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 ${r.id === user.id ? "bg-amber-50 -mx-4 px-4" : ""}`}>
              <span className="w-6 text-sm font-bold text-slate-400">{i + 4}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.nombre}</div>
                <div className="text-xs text-slate-500">{r.horas} h de capacitación · {r.pctEnt === null ? "sin asignación" : `${r.entregadas ?? r.av?.entregadas ?? 0} de ${r.av?.requeridas ?? 0} entregas`}</div>
              </div>
              <span className="text-sm font-bold text-[#1a2340]">{r.puntos}</span>
            </div>
          ))}
        </Card>
      )}

      <p className="text-[11px] text-slate-400">
        El puntaje va de 0 a 100: la mitad corresponde al avance hacia la meta anual de capacitación
        y la otra mitad al porcentaje de planeaciones, planes e informes entregados.
      </p>
    </div>
  );
}

function Ranking({ db, user }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const esAdmin = user.rol === "admin";
  if (!db.config.rankingPublico && !esAdmin) return (
    <Card className="p-8 text-center text-sm text-slate-500">La administración ha desactivado la visualización pública del ranking.</Card>
  );
  const rank = rankingDe(db, ciclo);
  const podio = rank.slice(0, 3);
  const resto = rank.slice(3);
  const alturas = ["h-32", "h-24", "h-20"];
  const orden = [1, 0, 2]; // 2do, 1ro, 3ro visual
  const medallas = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Podio de capacitación</h2>
        <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
          {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          <option value="historico">Histórico</option>
        </select>
      </div>
      {!db.config.rankingPublico && esAdmin &&
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">El ranking está oculto para los docentes. Puedes activarlo en Administración.</p>}
      <Card className="p-6 bg-gradient-to-b from-[#1a2340] to-[#232f52]">
        {podio.filter(p => p.horas > 0).length === 0
          ? <p className="text-center text-slate-300 text-sm py-6">Aún no hay horas validadas en este periodo. El podio espera a sus campeones. 🏆</p>
          : <div className="flex items-end justify-center gap-3 sm:gap-6">
              {orden.map(i => podio[i] && (
                <div key={podio[i].id} className="flex flex-col items-center flex-1 max-w-[160px]">
                  <div className="text-3xl mb-1">{medallas[i]}</div>
                  <div className="text-white text-sm font-bold text-center leading-tight mb-0.5">{podio[i].nombre}</div>
                  <div className="text-[#E8871E] text-xs font-bold mb-2">{podio[i].horas} horas</div>
                  <div className={`w-full ${alturas[i]} rounded-t-xl bg-gradient-to-b from-[#E8871E] to-[#c26d10] flex items-start justify-center pt-2 text-white font-bold text-xl`} style={{fontFamily:"'Archivo', sans-serif"}}>{i + 1}</div>
                </div>
              ))}
            </div>}
      </Card>
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-2">Tabla general</h3>
        {rank.map((r, i) => {
          const m = metaDe(db, r.id);
          const pct = m ? Math.min(100, Math.round(100 * r.horas / m)) : 0;
          const sem = semaforoDe(db, m ? Math.round(100 * r.horas / m) : 0);
          return (
            <div key={r.id} className={`flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 ${r.id === user.id ? "bg-amber-50 -mx-2 px-2 rounded-lg" : ""}`}>
              <span className="w-8 text-center font-bold text-slate-400" style={{fontFamily:"'Archivo', sans-serif"}}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.nombre}{r.id === user.id && <span className="text-[10px] text-[#E8871E] font-bold ml-1.5">TÚ</span>}</div>
                <div className="h-1.5 rounded-full bg-slate-200 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: SEM_COLORS[sem] }} /></div>
              </div>
              <span className="text-sm font-bold w-16 text-right">{r.horas} h</span>
            </div>
          );
        })}
        {rank.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Sin docentes registrados todavía.</p>}
      </Card>
    </div>
  );
}

/* ================================================================
   LOGROS
   ================================================================ */

function Logros({ db, user }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const mios = db.logros.filter(l => l.docenteId === user.id);
  const totalCiclo = mios.filter(m => m.clave.endsWith("@" + ciclo)).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mis logros</h2>
          <p className="text-sm text-slate-500">{totalCiclo} de {LOGROS_DEF.length} insignias en el ciclo {ciclo}</p>
        </div>
        <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
          {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
        </select>
      </div>
      {["Capacitación", "Planeaciones"].map(area => {
        const del = LOGROS_DEF.filter(l => l.area === area);
        const ganadas = del.filter(l => mios.some(m => m.clave === claveLogro(l.clave, ciclo))).length;
        return (
          <div key={area} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="font-bold text-sm">
                {area === "Capacitación" ? "Capacitación y formación" : "Planeaciones, planes de trabajo e informes"}
              </h3>
              <span className="text-xs text-slate-400">{ganadas} de {del.length}</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {del.map(l => {
                const ganado = mios.find(m => m.clave === claveLogro(l.clave, ciclo));
                return (
                  <Card key={l.clave} className={`p-4 flex items-center gap-3 ${ganado ? "border-[#E8871E] bg-amber-50/60" : "opacity-55"}`}>
                    <span className="text-3xl">{l.icono}</span>
                    <div>
                      <div className="font-bold text-sm">{l.nombre}</div>
                      <div className="text-xs text-slate-500">{l.desc}</div>
                      {ganado ? <div className="text-[11px] text-[#E8871E] font-bold mt-0.5">Obtenida el {fmtFecha(ganado.fecha.slice(0,10))}</div>
                              : <div className="text-[11px] text-slate-400 mt-0.5">Aún por conseguir</div>}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-slate-400">
        Las insignias se renuevan cada ciclo escolar. Las de planeaciones se calculan sobre la
        asignación del semestre en curso.
      </p>
    </div>
  );
}

/* ================================================================
   MI CUENTA (administrador y docente)
   ================================================================ */

function MiCuenta({ user, soloTarjeta = false }) {
  const [passActual, setPassActual] = useState("");
  const [passNueva, setPassNueva] = useState("");
  const [passRepetir, setPassRepetir] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cambiar = async () => {
    setMsg(""); setErr("");
    if (passNueva.length < 6) { setErr("La nueva contraseña debe tener al menos 6 caracteres."); return; }
    if (passNueva !== passRepetir) { setErr("Las contraseñas nuevas no coinciden."); return; }
    if (passNueva === passActual) { setErr("La nueva contraseña debe ser distinta de la actual."); return; }
    setGuardando(true);
    // Se comprueba la contraseña actual reautenticando antes de cambiarla
    const { error: e1 } = await supabase.auth.signInWithPassword({ email: user.email, password: passActual });
    if (e1) { setErr("La contraseña actual no coincide."); setGuardando(false); return; }
    const { error: e2 } = await supabase.auth.updateUser({ password: passNueva });
    setGuardando(false);
    if (e2) { setErr("No se pudo actualizar: " + e2.message); return; }
    setPassActual(""); setPassNueva(""); setPassRepetir("");
    setMsg("Contraseña actualizada. Úsala la próxima vez que inicies sesión.");
  };

  const tarjeta = (
    <Card className="p-5 space-y-3">
      <div>
        <h3 className="font-bold text-sm">Cambiar mi contraseña</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Tu cuenta: <b>{user.email}</b>. Nadie más puede ver tu contraseña.
        </p>
      </div>
      <Campo label="Contraseña actual">
        <input className={inputCls} type="password" autoComplete="current-password"
          value={passActual} onChange={e => setPassActual(e.target.value)} />
      </Campo>
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo label="Nueva contraseña">
          <input className={inputCls} type="password" autoComplete="new-password"
            value={passNueva} onChange={e => setPassNueva(e.target.value)} />
        </Campo>
        <Campo label="Repetir nueva contraseña">
          <input className={inputCls} type="password" autoComplete="new-password"
            value={passRepetir} onChange={e => setPassRepetir(e.target.value)} />
        </Campo>
      </div>
      <p className="text-[11px] text-slate-400">Mínimo 6 caracteres. Evita usar tu nombre o fechas fáciles de adivinar.</p>
      {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{msg}</p>}
      <button className={btnSec} disabled={guardando} onClick={cambiar}>
        {guardando && <Loader2 size={14} className="animate-spin"/>}Cambiar contraseña
      </button>
    </Card>
  );

  if (soloTarjeta) return tarjeta;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mi cuenta</h2>
        <p className="text-sm text-slate-500">Datos de acceso al sistema.</p>
      </div>
      <Card className="p-5">
        <h3 className="font-bold text-sm mb-2">Mis datos</h3>
        <div className="grid sm:grid-cols-2 gap-y-2 text-sm">
          <div><span className="text-slate-500">Nombre: </span>{user.nombre}</div>
          <div><span className="text-slate-500">Correo: </span>{user.email}</div>
          <div><span className="text-slate-500">Área: </span>{user.area || "—"}</div>
          <div><span className="text-slate-500">Asignaturas: </span>{user.asignaturas || "—"}</div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Si algún dato es incorrecto, solicita a la administración escolar que lo corrija.
        </p>
      </Card>
      {tarjeta}
    </div>
  );
}

/* ================================================================
   RESPALDO (administrador)
   Descarga todo el acervo en un solo archivo ZIP: los documentos
   originales con nombres legibles, organizados por docente, más los
   índices en CSV. Todo ocurre en el navegador; nada se envía a
   ningún servidor externo.
   ================================================================ */

// Deja un texto apto para nombre de archivo en cualquier sistema
function nombreSeguro(txt, max = 60) {
  return (txt || "sin_nombre")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // quita acentos
    .replace(/[^a-zA-Z0-9 _-]/g, "")                     // quita signos
    .trim().replace(/\s+/g, "_").slice(0, max) || "sin_nombre";
}

const csvTexto = (filas) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
};

/* Genera el ZIP con el expediente completo de UN docente: constancias,
   grados, formación complementaria y planeaciones, con índices en CSV. */
async function generarRespaldoDocente(db, u) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const sello = new Date().toISOString().slice(0, 10);
  const carpeta = nombreSeguro(u.nombre, 40);

  const certs = db.certs.filter(c => c.docenteId === u.id && !c._publico);
  const grados = db.grados.filter(g => g.docenteId === u.id);
  const comp = db.comp.filter(c => c.docenteId === u.id);
  const entregas = db.entregas.filter(e => e.docenteId === u.id);

  const fC = [["Curso", "Institución", "Horas", "Categoría", "Modalidad", "Fecha de emisión", "Folio", "Ciclo", "Estado", "Validado por", "Fecha de validación"]];
  certs.forEach(c => fC.push([c.datos.curso, c.datos.institucion, c.datos.horas, c.datos.categoria,
    c.datos.modalidad, c.datos.fecha_emision, c.datos.folio, c.ciclo,
    ESTADOS_CERT[c.estado]?.txt || c.estado, c.validadoPor || "", (c.validadoEn || "").slice(0, 10)]));
  zip.file(`${carpeta}/constancias_de_capacitacion.csv`, csvTexto(fC));

  const fG = [["Nivel", "Programa", "Institución", "Año", "Cédula", "Estado"]];
  grados.forEach(g => fG.push([g.nivel, g.datos?.programa || "", g.datos?.institucion || "",
    g.datos?.fecha_expedicion || "", g.datos?.cedula || "", g.estado]));
  zip.file(`${carpeta}/grados_academicos.csv`, csvTexto(fG));

  if (comp.length) {
    const fK = [["Tipo", "Nombre", "Institución", "Fecha", "Duración", "Estado"]];
    comp.forEach(c => fK.push([c.tipo, c.nombre, c.institucion, c.fecha, c.duracion, c.estado]));
    zip.file(`${carpeta}/formacion_complementaria.csv`, csvTexto(fK));
  }

  if (entregas.length) {
    const fE = [["Ciclo", "Semestre", "Actividad", "Tipo de entrega", "Archivo", "Fecha"]];
    entregas.forEach(e => fE.push([e.ciclo, nombrePeriodo(e.periodo || "ago-ene"), e.actividad,
      NOMBRE_TIPO_ENTREGA[e.tipo] || e.tipo, e.titulo,
      e.fecha ? new Date(e.fecha).toLocaleString("es-MX") : ""]));
    zip.file(`${carpeta}/planeaciones_planes_e_informes.csv`, csvTexto(fE));
  }

  const docs = [
    ...certs.filter(c => c.archivoGuardado).map(c => ({ clave: c.id,
      ruta: `${carpeta}/Constancias_de_capacitacion/${nombreSeguro(c.datos.curso || "constancia", 50)}__${c.ciclo || "sin_ciclo"}` })),
    ...grados.filter(g => g.archivoGuardado).map(g => ({ clave: g.id,
      ruta: `${carpeta}/Grados_academicos/${nombreSeguro(g.nivel || "grado", 30)}__${nombreSeguro(g.datos?.programa || "titulo", 40)}` })),
    ...comp.filter(c => c.archivoGuardado).map(c => ({ clave: c.id,
      ruta: `${carpeta}/Formacion_complementaria/${nombreSeguro(c.nombre || "documento", 50)}` })),
    ...entregas.map(e => ({ clave: "ent_" + e.id,
      ruta: `${carpeta}/Planeaciones_planes_e_informes/${nombreSeguro(e.ciclo + "_" + (e.periodo || ""), 20)}__${nombreSeguro(e.actividad, 35)}__${NOMBRE_TIPO_ENTREGA[e.tipo] || e.tipo}__${nombreSeguro(e.titulo, 25)}` })),
  ];

  let ok = 0, fallidos = 0;
  for (const d of docs) {
    try {
      const f = await leerArchivo(d.clave);
      if (!f) { fallidos++; continue; }
      const ext = (f.nombre && f.nombre.includes(".")) ? f.nombre.split(".").pop().toLowerCase()
        : (f.mime || "").includes("pdf") ? "pdf" : "jpg";
      zip.file(`${d.ruta}.${ext}`, f.base64, { base64: true });
      ok++;
    } catch { fallidos++; }
  }

  const exp = completitudExpediente(db, u.id);
  const asig = asignacionDe(db, u.id);
  const av = asig ? avanceDe(db, asig) : null;
  zip.file(`${carpeta}/LEEME.txt`,
`EXPEDIENTE DOCENTE
Mi portal CBTA 291

Docente: ${u.nombre}
Correo: ${u.email}
Área: ${u.area || "—"}
Generado el: ${new Date().toLocaleString("es-MX")}

CAPACITACIÓN
Constancias registradas: ${certs.length} (validadas: ${certs.filter(c => c.estado === "validada").length})
Horas validadas en el ciclo ${db.config.cicloActual}: ${horasValidadas(db, u.id, db.config.cicloActual)}
Grados académicos: ${grados.length}
Formación complementaria: ${comp.length}
Completitud del expediente: ${exp.pct}%

PLANEACIONES Y PLANES DE TRABAJO
Documentos entregados: ${entregas.length}
${av ? `Avance de la asignación vigente: ${av.entregadas} de ${av.requeridas} (${av.pct}%)` : "Sin asignación cargada"}

CONTENIDO
- Archivos CSV con el índice de cada apartado (se abren con Excel).
- Carpetas con los documentos originales en PDF o imagen.
Documentos incluidos: ${ok}${fallidos ? ` (no se pudieron recuperar ${fallidos})` : ""}
`);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `expediente_${carpeta}_${sello}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  return { documentos: ok, fallidos, peso: (blob.size / 1048576).toFixed(1) };
}

function Respaldo({ db, user }) {
  const [estado, setEstado] = useState("listo"); // listo | trabajando | terminado | error
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0, actual: "" });
  const [resultado, setResultado] = useState(null);
  const [err, setErr] = useState("");
  const [incluirArchivos, setIncluirArchivos] = useState(true);
  const [docenteSel, setDocenteSel] = useState("");
  const [indiv, setIndiv] = useState(null);
  const [resultadoIndiv, setResultadoIndiv] = useState(null);

  const docentes = db.users.filter(u => u.rol === "docente");
  const nombreDe = (id) => docentes.find(d => d.id === id)?.nombre || "Docente";

  // Todo lo que tiene documento adjunto, con su ruta dentro del ZIP
  const inventario = () => {
    const items = [];
    db.certs.filter(c => c.archivoGuardado && !c._publico).forEach(c => {
      const d = nombreSeguro(nombreDe(c.docenteId), 40);
      items.push({
        clave: c.id,
        ruta: `Docentes/${d}/Constancias/${nombreSeguro(c.datos.curso || "constancia", 50)}__${c.ciclo || "sin_ciclo"}`,
      });
    });
    db.grados.filter(g => g.archivoGuardado).forEach(g => {
      const d = nombreSeguro(nombreDe(g.docenteId), 40);
      items.push({
        clave: g.id,
        ruta: `Docentes/${d}/Grados_academicos/${nombreSeguro(g.nivel || "grado", 30)}__${nombreSeguro(g.datos?.programa || g.programa || "titulo", 40)}`,
      });
    });
    db.comp.filter(c => c.archivoGuardado).forEach(c => {
      const d = nombreSeguro(nombreDe(c.docenteId), 40);
      items.push({
        clave: c.id,
        ruta: `Docentes/${d}/Formacion_complementaria/${nombreSeguro(c.nombre || c.datos?.nombre || "documento", 50)}`,
      });
    });
    db.avisos.filter(a => a.archivoGuardado).forEach(a => {
      items.push({
        clave: "aviso_" + a.id,
        ruta: `Avisos/${nombreSeguro(a.titulo, 50)}`,
      });
    });
    db.programas.filter(p => p.archivoGuardado).forEach(p => {
      items.push({
        clave: "prog_" + p.id,
        ruta: `Programas_de_estudio/${nombreSeguro(p.nombre, 60)}`,
      });
    });
    db.entregas.forEach(e => {
      const d = nombreSeguro(nombreDe(e.docenteId), 40);
      items.push({
        clave: "ent_" + e.id,
        ruta: `Docentes/${d}/Planeaciones_y_planes/${nombreSeguro(e.actividad, 40)}__${e.tipo}__${nombreSeguro(e.titulo, 30)}`,
      });
    });
    (db.calendarios || []).filter(c => c.archivoGuardado).forEach(c => {
      items.push({
        clave: "cal_" + c.id,
        ruta: `Calendarios_academicos/${nombreSeguro(c.titulo, 50)}__${c.ciclo || ""}`,
      });
    });
    return items;
  };

  const totalArchivos = inventario().length;

  const generar = async () => {
    setEstado("trabajando"); setErr(""); setResultado(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const hoy = new Date();
      const sello = hoy.toISOString().slice(0, 10);

      /* ---- Índices en CSV ---- */
      const fCerts = [["Docente", "Área", "Curso", "Institución", "Horas", "Categoría", "Modalidad",
                       "Fecha inicio", "Fecha término", "Fecha emisión", "Folio", "Ciclo", "Estado",
                       "Validada por", "Fecha de validación", "Archivo adjunto"]];
      db.certs.filter(c => !c._publico).forEach(c => {
        const d = docentes.find(x => x.id === c.docenteId);
        const val = (c.historial || []).filter(h => /valid/i.test(h.accion)).slice(-1)[0];
        fCerts.push([nombreDe(c.docenteId), d?.area || "", c.datos.curso, c.datos.institucion,
          c.datos.horas, c.datos.categoria, c.datos.modalidad, c.datos.fecha_inicio,
          c.datos.fecha_termino, c.datos.fecha_emision, c.datos.folio, c.ciclo,
          ESTADOS_CERT[c.estado]?.txt || c.estado, val?.por || "", val ? val.fecha : "",
          c.archivoGuardado ? "Sí" : "No"]);
      });
      zip.file(`Indices/constancias_${sello}.csv`, csvTexto(fCerts));

      const fGrados = [["Docente", "Nivel", "Programa", "Institución", "Campus", "País",
                        "Año de titulación", "Cédula", "Número de título", "Estado"]];
      db.grados.forEach(g => fGrados.push([nombreDe(g.docenteId), g.nivel,
        g.datos?.programa || "", g.datos?.institucion || "", g.datos?.campus || "",
        g.datos?.pais || "", g.datos?.fecha_expedicion || "", g.datos?.cedula || "",
        g.datos?.num_titulo || "", g.estado]));
      zip.file(`Indices/grados_academicos_${sello}.csv`, csvTexto(fGrados));

      const fComp = [["Docente", "Tipo", "Nombre", "Institución", "Fecha", "Duración", "Estado"]];
      db.comp.forEach(c => fComp.push([nombreDe(c.docenteId), c.tipo, c.nombre,
        c.institucion, c.fecha, c.duracion, c.estado]));
      zip.file(`Indices/formacion_complementaria_${sello}.csv`, csvTexto(fComp));

      const fDoc = [["Nombre", "Correo", "Área", "Asignaturas", "Estado", "Expediente %"]];
      docentes.forEach(d => fDoc.push([d.nombre, d.email, d.area || "", d.asignaturas || "",
        d.activo ? "Activo" : "Inactivo", completitudExpediente(db, d.id).pct + "%"]));
      zip.file(`Indices/docentes_${sello}.csv`, csvTexto(fDoc));

      const fAvisos = [["Título", "Tipo", "Prioridad", "Estado", "Publicado",
                        "Fecha límite", "Enterados", "Total destinatarios"]];
      db.avisos.forEach(a => {
        const s = seguimientoDe(db, a);
        fAvisos.push([a.titulo, a.tipo, a.prioridad, ESTADO_AVISO[a.estado],
          a.fechaPublicacion || "", a.fechaLimite || "", s.enterados.length, s.total.length]);
      });
      zip.file(`Indices/avisos_${sello}.csv`, csvTexto(fAvisos));

      const fAcuses = [["Aviso", "Docente", "Estado", "Fecha y hora del acuse"]];
      db.avisos.filter(a => a.estado !== "draft").forEach(a => {
        destinatariosDe(db, a).forEach(d => {
          const ac = acuseDe(db, a.id, d.id);
          fAcuses.push([a.titulo, d.nombre, ac ? "Enterado" : "Pendiente",
            ac ? new Date(ac.fecha).toLocaleString("es-MX") : ""]);
        });
      });
      zip.file(`Indices/acuses_de_enterado_${sello}.csv`, csvTexto(fAcuses));

      const fEnt = [["Docente", "Ciclo", "Semestre", "Actividad", "Tipo", "Archivo", "Fecha de entrega"]];
      db.entregas.forEach(e => fEnt.push([nombreDe(e.docenteId), e.ciclo, nombrePeriodo(e.periodo || "ago-ene"), e.actividad,
        NOMBRE_TIPO_ENTREGA[e.tipo] || e.tipo, e.titulo, e.fecha ? new Date(e.fecha).toLocaleString("es-MX") : ""]));
      zip.file(`Indices/entregas_planeaciones_${sello}.csv`, csvTexto(fEnt));

      /* ---- Documentos originales ---- */
      let fallidos = 0, guardados = 0;
      if (incluirArchivos) {
        const items = inventario();
        setProgreso({ hechos: 0, total: items.length, actual: "" });
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          setProgreso({ hechos: i, total: items.length, actual: it.ruta.split("/").pop() });
          try {
            const f = await leerArchivo(it.clave);
            if (!f) { fallidos++; continue; }
            const ext = (f.nombre && f.nombre.includes(".")) ? f.nombre.split(".").pop().toLowerCase()
              : (f.mime || "").includes("pdf") ? "pdf"
              : (f.mime || "").includes("png") ? "png" : "jpg";
            zip.file(`${it.ruta}.${ext}`, f.base64, { base64: true });
            guardados++;
          } catch { fallidos++; }
        }
        setProgreso({ hechos: items.length, total: items.length, actual: "" });
      }

      /* ---- Nota explicativa ---- */
      zip.file("LEEME.txt",
`RESPALDO DEL SISTEMA
Mi portal CBTA 291

Generado el: ${hoy.toLocaleString("es-MX")}
Generado por: ${user.nombre}

CONTENIDO
- Indices/ .............. Tablas en formato CSV (se abren con Excel).
- Docentes/ ............. Documentos originales, en una carpeta por docente:
                          constancias de cursos, títulos y grados académicos,
                          y formación complementaria.
- Avisos/ ............... Archivos adjuntos de las circulares publicadas.

RESUMEN
Docentes registrados: ${docentes.length}
Constancias: ${db.certs.filter(c => !c._publico).length}
Grados académicos: ${db.grados.length}
Formación complementaria: ${db.comp.length}
Avisos: ${db.avisos.length}
Documentos incluidos: ${guardados}${fallidos ? ` (no se pudieron recuperar ${fallidos})` : ""}

NOTA
Este archivo es una copia de seguridad. Consérvalo en un lugar distinto
de la computadora de uso diario (por ejemplo, un disco externo o una
carpeta en la nube del plantel). Conviene generar un respaldo al cierre
de cada ciclo escolar.
`);

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `respaldo_formacion_docente_${sello}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);

      setResultado({ guardados, fallidos, peso: (blob.size / 1048576).toFixed(1) });
      setEstado("terminado");
    } catch (e) {
      setErr(e.message || "No se pudo generar el respaldo.");
      setEstado("error");
    }
  };

  const pct = progreso.total ? Math.round(100 * progreso.hechos / progreso.total) : 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Respaldo del sistema</h2>
        <p className="text-sm text-slate-500">
          Descarga todo el acervo en un solo archivo ZIP: documentos originales organizados por
          docente e índices en Excel. Se recomienda hacerlo al cierre de cada ciclo escolar.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icono={Users} label="Docentes" valor={docentes.length} />
        <Stat icono={FileCheck} label="Constancias" valor={db.certs.filter(c => !c._publico).length} />
        <Stat icono={GraduationCap} label="Grados y complementaria" valor={db.grados.length + db.comp.length} />
        <Stat icono={FolderOpen} label="Documentos adjuntos" valor={totalArchivos} />
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <h3 className="font-bold text-sm mb-2">Qué incluye el respaldo</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• <b>Índices en CSV</b>: constancias, grados, formación complementaria, docentes, avisos y acuses de enterado.</li>
            <li>• <b>Documentos originales</b> con nombres legibles, en una carpeta por docente.</li>
            <li>• <b>Nota explicativa</b> con la fecha del respaldo y el resumen del contenido.</li>
          </ul>
        </div>

        <label className="flex items-start gap-3 text-sm bg-slate-50 rounded-xl p-3">
          <input type="checkbox" className="mt-0.5" checked={incluirArchivos}
            onChange={e => setIncluirArchivos(e.target.checked)} disabled={estado === "trabajando"} />
          <span>
            Incluir los {totalArchivos} documentos originales (PDF e imágenes).
            <span className="block text-xs text-slate-500 mt-0.5">
              Si lo desmarcas, el respaldo solo trae los índices en Excel: se genera en segundos y pesa muy poco.
            </span>
          </span>
        </label>

        {estado === "trabajando" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin"/>
                {progreso.total ? `Recuperando documentos… ${progreso.hechos} de ${progreso.total}` : "Preparando índices…"}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-[#E8871E] transition-all" style={{ width: pct + "%" }} />
            </div>
            {progreso.actual && <p className="text-[11px] text-slate-400 truncate">{progreso.actual}</p>}
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              No cierres esta pestaña hasta que termine. El archivo se descargará solo.
            </p>
          </div>
        )}

        {estado === "terminado" && resultado && (
          <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3">
            <b>Respaldo descargado.</b> {resultado.guardados} documento(s) incluidos · {resultado.peso} MB.
            {resultado.fallidos > 0 && (
              <span className="block text-amber-700 mt-1">
                {resultado.fallidos} documento(s) no se pudieron recuperar; sus datos sí están en los índices.
              </span>
            )}
            <span className="block text-xs mt-1">Guárdalo fuera de esta computadora: disco externo o nube del plantel.</span>
          </div>
        )}

        {estado === "error" && (
          <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>
        )}

        <button className={btnPrim} disabled={estado === "trabajando"} onClick={generar}>
          {estado === "trabajando" ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>}
          {estado === "trabajando" ? "Generando respaldo…" : "Generar y descargar respaldo"}
        </button>
      </Card>

      <Card className="p-5 space-y-3">
        <div>
          <h3 className="font-bold text-sm">Respaldo de un solo docente</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Genera el expediente completo de una persona: constancias de capacitación, grados,
            formación complementaria y sus planeaciones, planes de trabajo e informes. Útil cuando
            un docente solicita su expediente o cuando cambia de plantel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select className={inputCls + " !mt-0 flex-1 min-w-[200px]"} value={docenteSel} onChange={e => setDocenteSel(e.target.value)}>
            <option value="">Selecciona un docente…</option>
            {[...docentes].sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" }))
              .map(d => <option key={d.id} value={d.id}>{d.nombre}{!d.activo ? " (inactivo)" : ""}</option>)}
          </select>
          <button className={btnPrim} disabled={!docenteSel || !!indiv}
            onClick={async () => {
              const u = docentes.find(x => x.id === docenteSel);
              if (!u) return;
              setIndiv("trabajando"); setErr("");
              try {
                const r = await generarRespaldoDocente(db, u);
                setIndiv(null);
                setResultadoIndiv({ nombre: u.nombre, ...r });
              } catch (e) { setIndiv(null); setErr("No se pudo generar: " + e.message); }
            }}>
            {indiv ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>}
            {indiv ? "Generando…" : "Descargar expediente"}
          </button>
        </div>
        {resultadoIndiv && (
          <p className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-2.5">
            Expediente de <b>{resultadoIndiv.nombre}</b> descargado · {resultadoIndiv.documentos} documento(s) · {resultadoIndiv.peso} MB.
          </p>
        )}
        <p className="text-[11px] text-slate-400">También puedes hacerlo desde Docentes, con el ícono de descarga de cada persona.</p>
      </Card>

      <Card className="p-5">
        <h3 className="font-bold text-sm mb-2">Recomendaciones</h3>
        <div className="text-sm text-slate-600 space-y-2">
          <p>Genera un respaldo <b>al cierre de cada ciclo escolar</b>, en julio, y consérvalo en un lugar distinto de la computadora de uso diario.</p>
          <p>Este archivo también sirve para entregar el expediente completo de un docente: basta con abrir el ZIP y tomar su carpeta.</p>
          <p className="text-xs text-slate-400">Con muchos documentos el proceso puede tardar varios minutos, porque cada archivo se descarga uno por uno desde el almacenamiento.</p>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================
   JEFES DE DEPARTAMENTO (solo el administrador general)
   Cuentas rotativas: cuando cambia la persona, se crea una cuenta
   nueva con su correo y contraseña, y la anterior se desactiva en
   el mismo paso — el jefe saliente pierde el acceso de inmediato.
   ================================================================ */

function JefesDepartamento({ db, mutar }) {
  const [form, setForm] = useState(null); // { rol, nombre, email, pass }
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const ROLES_JEFE = [
    ["jefe_formacion", "Jefe del Depto. de Formación Docente",
      "Avisos, validaciones, expedientes, metas, ciclos, perfil institucional y reportes."],
    ["jefe_academico", "Jefe del Depto. Académico y de Competencias Docentes",
      "Avisos, Programas de Estudio y Asignaciones (planeaciones, planes e informes)."],
  ];

  const actualDe = (rol) => db.users.find(u => u.rol === rol && u.activo);

  const reemplazar = async () => {
    const f = form;
    if (!f.nombre.trim() || !f.email.trim() || (f.pass || "").length < 6) {
      setErr("Completa nombre, correo y una contraseña de al menos 6 caracteres."); return;
    }
    setGuardando(true); setErr("");
    try {
      const anterior = actualDe(f.rol);
      const creado = await crearDocente({
        email: f.email.trim(), password: f.pass, nombre: f.nombre.trim(), rol: f.rol,
      });
      await mutar(d => {
        // Desactivar al jefe anterior: pierde el acceso de inmediato
        if (anterior) {
          const u = d.users.find(x => x.id === anterior.id);
          if (u) u.activo = false;
        }
        if (!d.users.some(x => x.id === creado.id)) {
          d.users.push({ id: creado.id, nombre: f.nombre.trim(), email: f.email.trim(),
            rol: f.rol, activo: true, creadoEn: ahora() });
        }
        registrarActividad(d, `Cambio de titular: ${NOMBRE_ROL[f.rol]} → ${f.nombre.trim()}.`);
      });
      setMsg(`Cuenta creada para ${f.nombre.trim()}.${anterior ? ` La cuenta anterior (${anterior.nombre}) quedó desactivada.` : ""}`);
      setForm(null);
    } catch (e) { setErr(e.message); }
    setGuardando(false);
  };

  const restablecer = async (jefe) => {
    const nueva = window.prompt(`Nueva contraseña para ${jefe.nombre} (mínimo 6 caracteres):`);
    if (nueva === null) return;
    if (nueva.length < 6) { alert("Debe tener al menos 6 caracteres."); return; }
    try {
      await restablecerPassword({ id: jefe.id, password: nueva });
      alert("Contraseña actualizada. Compártela con la persona de forma segura.");
    } catch (e) { alert("No se pudo actualizar: " + e.message); }
  };

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="font-bold text-sm">Jefes de departamento</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Cuentas con permisos parciales que puedes renovar cuando cambie la persona en el cargo.
          Al registrar un nuevo titular, la cuenta del anterior se desactiva automáticamente.
        </p>
      </div>

      {ROLES_JEFE.map(([rol, titulo, alcance]) => {
        const actual = actualDe(rol);
        return (
          <div key={rol} className="border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[220px]">
                <div className="font-semibold text-sm">{titulo}</div>
                <div className="text-xs text-slate-500 mt-0.5">{alcance}</div>
                <div className="text-xs mt-1.5">
                  {actual ? (
                    <span className="text-slate-700">Titular actual: <b>{actual.nombre}</b> · {actual.email}</span>
                  ) : (
                    <span className="text-amber-600 font-semibold">Sin titular asignado</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {actual && <button className={btnSec + " !px-3 !py-1.5"} onClick={() => restablecer(actual)}>Restablecer contraseña</button>}
                <button className={btnPrim + " !px-3 !py-1.5"} onClick={() => { setForm({ rol, nombre: "", email: "", pass: "" }); setErr(""); setMsg(""); }}>
                  {actual ? "Cambiar titular" : "Asignar titular"}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{msg}</p>}

      {form && (
        <Modal titulo={`Nuevo titular · ${NOMBRE_ROL[form.rol]}`} onClose={() => setForm(null)}>
          <div className="space-y-3">
            {actualDe(form.rol) && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Al guardar, la cuenta de <b>{actualDe(form.rol).nombre}</b> se desactivará y dejará de tener acceso.
              </p>
            )}
            <Campo label="Nombre completo">
              <input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </Campo>
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo label="Correo de acceso">
                <input className={inputCls} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </Campo>
              <Campo label="Contraseña inicial">
                <input className={inputCls} value={form.pass} onChange={e => setForm({ ...form, pass: e.target.value })} />
              </Campo>
            </div>
            {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setForm(null)}>Cancelar</button>
            <button className={btnPrim} disabled={guardando} onClick={reemplazar}>
              {guardando && <Loader2 size={14} className="animate-spin"/>}Guardar titular
            </button>
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ================================================================
   NOTIFICACIONES AL CELULAR
   ================================================================ */

function NotificacionesCelular({ user }) {
  const [activo, setActivo] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { estaActivo().then(setActivo); }, []);

  const soporta = soportaPush();
  const iosPendiente = soporta && esIOS() && !instaladoEnInicio();

  const activar = async () => {
    setTrabajando(true); setErr(""); setMsg("");
    const r = await activarNotificaciones(user.id);
    setTrabajando(false);
    if (r.ok) {
      setActivo(true);
      setMsg("Listo. Este dispositivo recibirá los avisos aunque el portal esté cerrado.");
      return;
    }
    const razones = {
      no_soportado: "Este navegador no admite notificaciones. Prueba con Chrome en Android o Safari en iPhone.",
      ios_sin_instalar: "En iPhone primero agrega el portal a la pantalla de inicio (botón Compartir → “Agregar a inicio”) y ábrelo desde ese ícono.",
      permiso_denegado: "No se concedió el permiso. Puedes habilitarlo en los ajustes del navegador para este sitio.",
      guardado: "No se pudo registrar el dispositivo: " + (r.detalle || ""),
    };
    setErr(razones[r.motivo] || "No se pudieron activar las notificaciones.");
  };

  const desactivar = async () => {
    setTrabajando(true); setErr(""); setMsg("");
    await desactivarNotificaciones();
    setTrabajando(false); setActivo(false);
    setMsg("Este dispositivo dejará de recibir notificaciones.");
  };

  const probar = async () => {
    setTrabajando(true); setErr(""); setMsg("");
    const r = await enviarPush({
      destinatarios: [user.id],
      titulo: "Notificación de prueba",
      cuerpo: "Si ves esto, tu dispositivo está bien configurado.",
    });
    setTrabajando(false);
    if (r.enviadas > 0) { setMsg("Enviada. Debe aparecer en unos segundos."); return; }
    // Se muestra el motivo real para poder corregirlo
    setErr(r.error || "No se pudo enviar. Vuelve a activar las notificaciones en este dispositivo.");
  };

  return (
    <Card className="p-5 space-y-3">
      <div>
        <h3 className="font-bold text-sm flex items-center gap-1.5"><Bell size={15}/>Notificaciones en este dispositivo</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Recibe los avisos y circulares en tu celular, aunque no tengas el portal abierto.
          Cada dispositivo se activa por separado.
        </p>
      </div>

      {!soporta && (
        <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-2.5">
          Este navegador no admite notificaciones. Funcionan en Chrome (Android y computadora) y en
          Safari de iPhone con el portal agregado a la pantalla de inicio.
        </p>
      )}

      {iosPendiente && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <b>Un paso previo en iPhone:</b> toca el botón <b>Compartir</b> de Safari, elige
          <b> “Agregar a inicio”</b> y abre el portal desde ese nuevo ícono. Desde ahí podrás
          activar las notificaciones. Es un requisito de Apple, no del portal.
        </div>
      )}

      {soporta && !iosPendiente && (
        <div className="flex flex-wrap items-center gap-2">
          {activo ? (
            <>
              <span className="text-sm text-emerald-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={15}/>Activas en este dispositivo
              </span>
              <button className={btnSec + " !px-3 !py-1.5"} disabled={trabajando} onClick={probar}>
                {trabajando ? <Loader2 size={13} className="animate-spin"/> : <Send size={13}/>}Enviar prueba
              </button>
              <button className={btnSec + " !px-3 !py-1.5"} disabled={trabajando} onClick={desactivar}>Desactivar</button>
            </>
          ) : (
            <button className={btnPrim} disabled={trabajando} onClick={activar}>
              {trabajando ? <Loader2 size={14} className="animate-spin"/> : <Bell size={14}/>}
              Activar notificaciones
            </button>
          )}
        </div>
      )}

      {permisoActual() === "denied" && (
        <p className="text-xs text-slate-500">
          El permiso está bloqueado para este sitio. Habilítalo desde el candado de la barra de
          direcciones (o Ajustes → Notificaciones) y vuelve a intentarlo.
        </p>
      )}
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{msg}</p>}
      {err && <p className="text-sm text-rose-600 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>{err}</p>}
    </Card>
  );
}

/* ================================================================
   CALENDARIO ACADÉMICO
   Lo publica el Depto. de Formación Docente (o la administración
   general) como imagen o PDF; todo el personal lo consulta en
   pantalla, sin necesidad de descargarlo.
   ================================================================ */

const esImagenCal = (c) =>
  (c.archivoTipo || "").startsWith("image/") ||
  /\.(jpe?g|png|webp|gif)$/i.test(c.archivoNombre || "");

// Visor: muestra imágenes directamente y PDFs incrustados en la página
function VisorCalendario({ cal }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    let vivo = true, creada = null;
    (async () => {
      try {
        const f = await leerArchivo("cal_" + cal.id);
        if (!f || !vivo) { if (vivo) setErr(true); return; }
        const bytes = atob(f.base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        creada = URL.createObjectURL(new Blob([arr], { type: f.mime }));
        setUrl(creada); setNombre(f.nombre || "calendario");
      } catch { if (vivo) setErr(true); }
    })();
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [cal.id]);

  const descargar = () => {
    const a = document.createElement("a");
    a.href = url; a.download = nombre || (cal.titulo + ".pdf"); a.click();
  };

  if (err) return <p className="text-sm text-slate-400 py-6 text-center">El archivo de este calendario no está disponible.</p>;
  if (!url) return (
    <div className="h-64 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-sm gap-2">
      <Loader2 size={16} className="animate-spin" /> Cargando calendario…
    </div>
  );

  return (
    <div className="space-y-2">
      {esImagenCal(cal) ? (
        <a href={url} target="_blank" rel="noreferrer" title="Abrir en tamaño completo">
          <img src={url} alt={cal.titulo} className="w-full rounded-xl border border-slate-200" />
        </a>
      ) : (
        <object data={url} type="application/pdf" className="w-full rounded-xl border border-slate-200" style={{ height: "70vh" }}>
          {/* Algunos navegadores móviles no incrustan PDF: se ofrece abrirlo */}
          <div className="p-6 text-center text-sm text-slate-500">
            Tu navegador no puede mostrar el PDF aquí.
            <a href={url} target="_blank" rel="noreferrer" className="text-indigo-600 font-semibold underline ml-1">Ábrelo en una pestaña nueva</a>.
          </div>
        </object>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={btnSec + " !px-3 !py-1.5"} onClick={descargar}><Download size={13}/>Descargar</button>
        <a className={btnSec + " !px-3 !py-1.5"} href={url} target="_blank" rel="noreferrer"><Eye size={13}/>Ver en pantalla completa</a>
      </div>
    </div>
  );
}

function CalendarioAcademico({ db, user, mutar, puedeEditar }) {
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");

  const lista = [...db.calendarios].sort((a, b) =>
    (b.ciclo || "").localeCompare(a.ciclo || "") || (b.creadoEn || "").localeCompare(a.creadoEn || ""));
  const [verId, setVerId] = useState(null);
  const actual = lista.find(c => c.id === verId) || lista[0] || null;

  const guardar = async () => {
    const f = form;
    if (!f.titulo.trim()) { setErr("Ponle un título al calendario."); return; }
    if (!f._archivo && !f.archivoGuardado) { setErr("Selecciona la imagen o el PDF del calendario."); return; }
    setGuardando(true); setErr("");
    try {
      const id = f.id || uid();
      let guardado = f.archivoGuardado, tipo = f.archivoTipo, nombreArch = f.archivoNombre;
      if (f._archivo) {
        const b64 = await leerComoBase64(f._archivo);
        if (b64.length > MAX_FILE_B64) { setErr("El archivo supera el límite (~7.5 MB). Comprímelo e inténtalo de nuevo."); setGuardando(false); return; }
        const r = await guardarArchivo("cal_" + id, b64, f._archivo.type || "application/pdf", f._archivo.name);
        if (!r.guardado) { setErr("No se pudo guardar el archivo."); setGuardando(false); return; }
        guardado = true; tipo = f._archivo.type || ""; nombreArch = f._archivo.name;
      }
      const esNuevo = !db.calendarios.some(c => c.id === id);
      await mutar(d => {
        const base = { id, titulo: f.titulo.trim(), ciclo: f.ciclo, periodo: f.periodo || "",
          nota: f.nota || "", archivoNombre: nombreArch, archivoTipo: tipo,
          archivoGuardado: guardado, creadoEn: f.creadoEn || ahora(), publicadoPor: user.nombre };
        const i = d.calendarios.findIndex(c => c.id === id);
        if (i >= 0) d.calendarios[i] = { ...d.calendarios[i], ...base };
        else d.calendarios.push(base);
        if (esNuevo) {
          d.users.filter(u => u.rol === "docente" && u.activo).forEach(u =>
            notificar(d, u.id, `🗓️ Se publicó el calendario académico “${base.titulo}”.`));
          registrarActividad(d, `Se publicó el calendario académico “${base.titulo}”.`);
        }
      });
      setVerId(id);
      setForm(null);
    } catch (e) { setErr(e.message); }
    setGuardando(false);
  };

  const eliminar = async (c) => {
    if (!window.confirm(`¿Eliminar el calendario “${c.titulo}”?`)) return;
    await mutar(d => { d.calendarios = d.calendarios.filter(x => x.id !== c.id); });
    await eliminarArchivo("cal_" + c.id);
    setVerId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Calendario académico</h2>
          <p className="text-sm text-slate-500">
            {puedeEditar ? "Publica el calendario del ciclo; los docentes lo verán en pantalla y podrán descargarlo."
              : "Calendario oficial del plantel. Puedes verlo aquí mismo o descargarlo."}
          </p>
        </div>
        {puedeEditar && (
          <button className={btnPrim} onClick={() => { setForm({ titulo: "", ciclo: db.config.cicloActual, periodo: "", nota: "", _archivo: null }); setErr(""); }}>
            <Plus size={15}/>Publicar calendario
          </button>
        )}
      </div>

      {lista.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-400">
          {puedeEditar ? "Aún no has publicado ningún calendario." : "El calendario académico aún no ha sido publicado."}
        </Card>
      )}

      {lista.length > 1 && (
        <Card className="p-3 flex flex-wrap gap-2 items-center">
          <span className="text-sm text-slate-500">Ver:</span>
          <select className={inputCls + " !mt-0 !w-auto"} value={actual?.id || ""} onChange={e => setVerId(e.target.value)}>
            {lista.map(c => <option key={c.id} value={c.id}>{c.titulo} · {c.ciclo}{c.periodo ? " · " + nombrePeriodo(c.periodo) : ""}</option>)}
          </select>
        </Card>
      )}

      {actual && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-sm">{actual.titulo}</h3>
              <p className="text-xs text-slate-500">
                Ciclo {actual.ciclo}{actual.periodo ? ` · ${nombrePeriodo(actual.periodo)}` : ""}
                {actual.publicadoPor && ` · publicado por ${actual.publicadoPor}`}
              </p>
            </div>
            {puedeEditar && (
              <div className="flex gap-1">
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar"
                  onClick={() => { setForm({ ...actual, _archivo: null }); setErr(""); }}><Pencil size={15}/></button>
                <button className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="Eliminar"
                  onClick={() => eliminar(actual)}><Trash2 size={15}/></button>
              </div>
            )}
          </div>
          {actual.nota && <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2.5">{actual.nota}</p>}
          <VisorCalendario cal={actual} />
        </Card>
      )}

      {form && (
        <Modal titulo={form.id ? "Editar calendario" : "Publicar calendario académico"} onClose={() => setForm(null)}>
          <div className="space-y-3">
            <Campo label="Título">
              <input className={inputCls} placeholder="Calendario académico 2026–2027"
                value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
            </Campo>
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo label="Ciclo escolar">
                <select className={inputCls} value={form.ciclo} onChange={e => setForm({ ...form, ciclo: e.target.value })}>
                  {ciclosDisponibles(db).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo label="Semestre (opcional)">
                <select className={inputCls} value={form.periodo || ""} onChange={e => setForm({ ...form, periodo: e.target.value })}>
                  <option value="">Todo el ciclo</option>
                  {PERIODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </Campo>
            </div>
            <Campo label="Nota (opcional)">
              <input className={inputCls} placeholder="Vigente a partir del 17 de agosto"
                value={form.nota || ""} onChange={e => setForm({ ...form, nota: e.target.value })} />
            </Campo>
            <Campo label="Archivo: imagen o PDF">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="text-sm"
                onChange={e => setForm({ ...form, _archivo: e.target.files[0] || null })} />
              <p className="text-[11px] text-slate-400 mt-1">
                Las imágenes se muestran directamente; los PDF se incrustan en la página. En ambos
                casos el docente puede descargarlo.
              </p>
              {form.archivoNombre && !form._archivo &&
                <p className="text-xs text-slate-500 mt-1">Archivo actual: {form.archivoNombre}</p>}
            </Campo>
            {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setForm(null)}>Cancelar</button>
            <button className={btnPrim} disabled={guardando} onClick={guardar}>
              {guardando && <Loader2 size={14} className="animate-spin"/>}Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   PROGRAMAS DE ESTUDIO (repositorio)
   ================================================================ */

function DescargarProgramaBtn({ programa, texto = false }) {
  const [abriendo, setAbriendo] = useState(false);
  const abrir = async () => {
    setAbriendo(true);
    const f = await leerArchivo("prog_" + programa.id);
    setAbriendo(false);
    if (!f) { alert("El archivo de este programa no está disponible."); return; }
    const bytes = atob(f.base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: f.mime }));
    if (texto) { const a = document.createElement("a"); a.href = url; a.download = f.nombre || (programa.nombre + ".pdf"); a.click(); }
    else window.open(url, "_blank");
  };
  if (texto) return (
    <button onClick={abrir} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-semibold hover:underline">
      {abriendo ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>}Descargar PDF
    </button>
  );
  return (
    <button onClick={abrir} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Ver programa">
      {abriendo ? <Loader2 size={15} className="animate-spin"/> : <Eye size={15}/>}
    </button>
  );
}

// Vista del jefe académico y del administrador: administra el repositorio
function ProgramasEstudio({ db, user, mutar }) {
  const [cola, setCola] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const lista = db.programas
    .filter(p => !q || normTexto(p.nombre).includes(normTexto(q))
      || asignaturasDe(p).some(a => normTexto(a.nombre).includes(normTexto(q))))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  const totalAsig = todasLasAsignaturas(db).length;
  const pendientes = todasLasAsignaturas(db).filter(a => a.numPlaneaciones == null || a.numPlaneaciones === "").length;

  /* Subida masiva: se pueden seleccionar TODOS los PDF a la vez. Cada
     documento se procesa y guarda de inmediato, uno por uno. Un mismo
     programa puede desarrollar varias asignaturas (I, II, III…) y la IA
     extrae cada una con su propio número de planeaciones. */
  const subirLote = async (files) => {
    const archivos = [...files].filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (!archivos.length) return;
    setResumen(null); setErr("");
    let ok = 0, asigs = 0, revisar = 0, fallidos = [], motivos = [], funcionVieja = false;
    let cuotaAgotada = false;
    /* El nivel gratuito de Gemini permite unas pocas peticiones por minuto.
       Se deja un respiro entre documentos para no toparlo; la función Edge
       además espera y reintenta sola cuando ocurre. */
    const RESPIRO_MS = 5000;
    for (let i = 0; i < archivos.length; i++) {
      const f = archivos[i];
      setCola({ total: archivos.length, hechos: i, actual: f.name });
      if (i > 0) {
        setCola({ total: archivos.length, hechos: i, actual: f.name, esperando: true });
        await new Promise(r => setTimeout(r, RESPIRO_MS));
        setCola({ total: archivos.length, hechos: i, actual: f.name });
      }
      try {
        const b64 = await leerComoBase64(f);
        if (b64.length > MAX_FILE_B64) { fallidos.push(f.name + " (supera ~7.5 MB)"); continue; }
        let nombrePrograma = "", asignaturas = [], motivo = "";
        try {
          const d = await extraerConIA({ base64: b64, mime: f.type || "application/pdf", tipo: "programa" });
          nombrePrograma = d.programa || "";
          asignaturas = (d.asignaturas || []).filter(a => a && a.nombre).map(a => ({
            nombre: a.nombre,
            numPlaneaciones: a.num_planeaciones ?? null,
            base: a.base || null,
            semestre: a.semestre || "",
          }));
          /* Compatibilidad: si la función Edge todavía es la versión
             anterior, responde con un solo {nombre, num_planeaciones}.
             Se aprovecha el dato y se avisa que falta actualizarla. */
          if (!asignaturas.length && d.nombre) {
            asignaturas = [{ nombre: d.nombre, numPlaneaciones: d.num_planeaciones ?? null, base: null, semestre: d.semestre || "" }];
            nombrePrograma = nombrePrograma || d.nombre;
            motivo = "funcion_vieja";
          } else if (!asignaturas.length) {
            motivo = "La IA respondió sin asignaturas";
          }
        } catch (e) {
          motivo = e.message || "Error del servicio de IA";
          if (/límite de uso|cuota|quota|429/i.test(motivo)) cuotaAgotada = true;
        }
        const id = uid();
        const r = await guardarArchivo("prog_" + id, b64, f.type || "application/pdf", f.name);
        if (!r.guardado) { fallidos.push(f.name + " (no se pudo guardar)"); continue; }
        await mutar(d => {
          d.programas.push({
            id, nombre: nombrePrograma || f.name.replace(/\.pdf$/i, ""),
            asignaturas, archivoNombre: f.name, archivoGuardado: true, creadoEn: ahora(),
          });
        });
        ok++; asigs += asignaturas.length;
        revisar += asignaturas.filter(a => a.numPlaneaciones == null).length + (asignaturas.length ? 0 : 1);
        if (motivo === "funcion_vieja") funcionVieja = true;
        else if (motivo) motivos.push(f.name + ": " + motivo);
        if (cuotaAgotada) {
          // El PDF ya quedó guardado; solo faltó la lectura con IA.
          // Se detiene la cola: insistir solo consumiría más intentos.
          fallidos.push(`Se detuvo en “${f.name}”: quedan ${archivos.length - i - 1} sin leer.`);
          break;
        }
      } catch (e) { fallidos.push(f.name + " (" + e.message + ")"); }
    }
    setCola(null);
    setResumen({ ok, asigs, revisar, fallidos, motivos, funcionVieja, cuotaAgotada });
  };

  const [reintentando, setReintentando] = useState(null);

  /* Reintenta la lectura con IA usando el PDF que ya está guardado,
     sin necesidad de volver a subirlo. */
  const reintentar = async (p) => {
    setReintentando(p.id); setErr("");
    try {
      const f = await leerArchivo("prog_" + p.id);
      if (!f) { setErr("El PDF de este programa ya no está disponible."); setReintentando(null); return; }
      const d = await extraerConIA({ base64: f.base64, mime: f.mime || "application/pdf", tipo: "programa" });
      let asigs = (d.asignaturas || []).filter(a => a && a.nombre).map(a => ({
        nombre: a.nombre, numPlaneaciones: a.num_planeaciones ?? null,
        base: a.base || null, semestre: a.semestre || "",
      }));
      if (!asigs.length && d.nombre) {
        asigs = [{ nombre: d.nombre, numPlaneaciones: d.num_planeaciones ?? null, base: null, semestre: "" }];
        setErr("La función “extraer” de Supabase aún responde con el formato anterior: solo detecta una asignatura por documento. Actualízala para leer todas.");
      } else if (!asigs.length) {
        setErr("La IA leyó el documento pero no identificó asignaturas. Agrégalas manualmente con el lápiz.");
      }
      if (asigs.length) {
        await mutar(dd => {
          const i = dd.programas.findIndex(x => x.id === p.id);
          if (i >= 0) dd.programas[i] = { ...dd.programas[i],
            nombre: d.programa || dd.programas[i].nombre, asignaturas: asigs, actualizadoEn: ahora() };
        });
      }
    } catch (e) { setErr("No se pudo leer: " + e.message); }
    setReintentando(null);
  };

  const abrirEdicion = (p) => {
    setEditando({ id: p.id, nombre: p.nombre || "",
      asignaturas: asignaturasDe(p).map(a => ({ ...a, numPlaneaciones: a.numPlaneaciones ?? "" })) });
    setErr("");
  };

  const guardarEdicion = async () => {
    const e = editando;
    if (!e.nombre.trim()) { setErr("El nombre del programa es obligatorio."); return; }
    if (e.asignaturas.some(a => !a.nombre.trim())) { setErr("Todas las asignaturas necesitan nombre."); return; }
    setGuardando(true); setErr("");
    try {
      await mutar(d => {
        const i = d.programas.findIndex(x => x.id === e.id);
        if (i >= 0) d.programas[i] = { ...d.programas[i], nombre: e.nombre.trim(),
          asignaturas: e.asignaturas.map(a => ({ ...a, nombre: a.nombre.trim(),
            numPlaneaciones: a.numPlaneaciones === "" ? null : Number(a.numPlaneaciones) })),
          actualizadoEn: ahora() };
      });
      setEditando(null);
    } catch (er) { setErr(er.message); }
    setGuardando(false);
  };

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar el programa “${p.nombre}” y sus ${asignaturasDe(p).length} asignatura(s)?\n\nLas asignaciones que dependan de él quedarán marcadas como “sin programa”.`)) return;
    await mutar(d => { d.programas = d.programas.filter(x => x.id !== p.id); });
    await eliminarArchivo("prog_" + p.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Programas de Estudio</h2>
          <p className="text-sm text-slate-500">
            Repositorio oficial. Un programa suele desarrollar varias asignaturas (I, II, III…); la IA
            extrae cada una con su número de propósitos o progresiones, que equivale a sus planeaciones.
          </p>
        </div>
        <label className={btnPrim + " cursor-pointer" + (cola ? " opacity-50 pointer-events-none" : "")}>
          <Upload size={15}/>Subir programas
          <input type="file" accept=".pdf" multiple className="hidden"
            onChange={e => { subirLote(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat icono={BookOpen} label="Programas" valor={db.programas.length} />
        <Stat icono={FileText} label="Asignaturas cubiertas" valor={totalAsig} />
        <Stat icono={AlertTriangle} label="Por revisar" valor={pendientes} />
      </div>

      {cola && (
        <Card className="p-4 space-y-2" data-formulario-abierto>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <Loader2 size={14} className="animate-spin"/>Procesando {cola.hechos + 1} de {cola.total}…
            </span>
            <span className="text-slate-500">{Math.round(100 * cola.hechos / cola.total)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full bg-[#E8871E] transition-all" style={{ width: (100 * cola.hechos / cola.total) + "%" }} />
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {cola.esperando ? "Pausa breve para respetar el límite de la API…" : cola.actual}
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
            Cada programa se lee con IA y se guarda de inmediato. Entre uno y otro se hace una pausa
            corta para no exceder el límite gratuito de Gemini, así que con muchos archivos el
            proceso tarda. No cierres esta pestaña.
          </p>
        </Card>
      )}

      {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>{err}</p>}

      {resumen && (
        <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3">
          <b>{resumen.ok} programa(s) subidos</b> con {resumen.asigs} asignatura(s) detectada(s).
          {resumen.revisar > 0 && <span className="block text-amber-700 mt-1">⚠ {resumen.revisar} asignatura(s) sin número de planeaciones: complétalas con el lápiz.</span>}
          {resumen.cuotaAgotada && (
            <span className="block text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-2">
              <b>Se alcanzó el límite de la API de Gemini.</b> Los PDF sí quedaron guardados; lo que
              faltó fue la lectura automática. Espera unos minutos y usa el botón ✨ de cada programa
              para reintentar, o captura las asignaturas a mano con el lápiz.
              <span className="block mt-1 text-xs">
                El límite cuenta <b>peticiones</b>, no tamaño: cada PDF consume una. Subir los
                programas en tandas de 10 a 15, con unos minutos de separación, evita toparlo.
              </span>
            </span>
          )}
          {resumen.funcionVieja && (
            <span className="block text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-2">
              <b>La función “extraer” de Supabase no está actualizada.</b> Está respondiendo con el
              formato anterior (una sola asignatura por documento). Actualízala en Supabase →
              Edge Functions → extraer → Deploy, y vuelve a subir estos programas.
            </span>
          )}
          {resumen.motivos?.length > 0 && (
            <span className="block text-amber-700 mt-1 text-xs">Detalle: {resumen.motivos.join(" · ")}</span>
          )}
          {resumen.fallidos.length > 0 && <span className="block text-rose-600 mt-1">No se subieron: {resumen.fallidos.join("; ")}</span>}
        </div>
      )}

      <Card className="p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + " !mt-0 !pl-8"} placeholder="Buscar programa o asignatura…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      {lista.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-400">
          Aún no hay programas. Selecciona todos los PDF de una vez con “Subir programas”.
        </Card>
      )}

      {lista.map(p => {
        const asigs = asignaturasDe(p);
        return (
          <Card key={p.id} className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="font-bold text-sm">{p.nombre}</div>
                <div className="text-xs text-slate-500">
                  {asigs.length} asignatura(s){!p.archivoGuardado && <span className="text-amber-600"> · sin PDF</span>}
                </div>
              </div>
              <DescargarProgramaBtn programa={p} />
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Reintentar lectura con IA"
                disabled={reintentando === p.id} onClick={() => reintentar(p)}>
                {reintentando === p.id ? <Loader2 size={15} className="animate-spin"/> : <Sparkles size={15}/>}
              </button>
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar asignaturas"
                onClick={() => abrirEdicion(p)}><Pencil size={15}/></button>
              <button className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="Eliminar"
                onClick={() => eliminar(p)}><Trash2 size={15}/></button>
            </div>
            {asigs.length === 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                ⚠ Sin asignaturas detectadas. Usa ✨ para reintentar la lectura con IA, o el lápiz para agregarlas a mano.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {asigs.map((a, i) => {
                  const sin = a.numPlaneaciones == null || a.numPlaneaciones === "";
                  return (
                    <span key={i} className={`text-xs px-2.5 py-1 rounded-full border ${sin ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                      {a.nombre} · {sin ? "⚠ sin definir" : nPlaneaciones(a.numPlaneaciones)}
                    </span>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}

      {editando && (
        <Modal titulo="Editar programa y asignaturas" onClose={() => setEditando(null)} ancho="max-w-3xl">
          <div className="space-y-3">
            <Campo label="Nombre del programa">
              <input className={inputCls} value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} />
            </Campo>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-600">Asignaturas que desarrolla</span>
                <button className="text-xs font-semibold text-indigo-600 hover:underline"
                  onClick={() => setEditando({ ...editando, asignaturas: [...editando.asignaturas, { nombre: "", numPlaneaciones: "", base: null, semestre: "" }] })}>
                  + Agregar asignatura
                </button>
              </div>
              <div className="space-y-2">
                {editando.asignaturas.map((a, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input className={inputCls + " !mt-0 flex-1"} placeholder="Nombre de la asignatura, UAC o módulo"
                      value={a.nombre} onChange={e => setEditando({ ...editando,
                        asignaturas: editando.asignaturas.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x) })} />
                    <input type="number" min="0" className={inputCls + " !mt-0 !w-28"} placeholder="Planeac."
                      value={a.numPlaneaciones} onChange={e => setEditando({ ...editando,
                        asignaturas: editando.asignaturas.map((x, j) => j === i ? { ...x, numPlaneaciones: e.target.value } : x) })} />
                    <button className="p-2 rounded-lg hover:bg-rose-50 text-rose-500 shrink-0" title="Quitar"
                      onClick={() => setEditando({ ...editando, asignaturas: editando.asignaturas.filter((_, j) => j !== i) })}><Trash2 size={15}/></button>
                  </div>
                ))}
                {editando.asignaturas.length === 0 && <p className="text-xs text-slate-400">Sin asignaturas. Agrega al menos una.</p>}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              El número de planeaciones equivale a los <b>propósitos</b> de la asignatura, o a sus
              <b> progresiones</b> cuando el programa se organiza así. El nombre debe coincidir con el
              que aparece en las asignaciones para que el sistema los relacione.
            </p>
            {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            <button className={btnPrim} disabled={guardando} onClick={guardarEdicion}>
              {guardando && <Loader2 size={14} className="animate-spin"/>}Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Vista del docente: consulta y descarga
function ProgramasDocente({ db }) {
  const [q, setQ] = useState("");
  const lista = db.programas
    .filter(p => !q || normTexto(p.nombre).includes(normTexto(q))
      || asignaturasDe(p).some(a => normTexto(a.nombre).includes(normTexto(q))))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Programas de Estudio</h2>
        <p className="text-sm text-slate-500">Repositorio oficial del plantel. Consulta y descarga los programas vigentes.</p>
      </div>
      <Card className="p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + " !mt-0 !pl-8"} placeholder="Buscar programa o asignatura…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>
      {lista.map(p => (
        <Card key={p.id} className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="font-bold text-sm">{p.nombre}</div>
              <div className="text-xs text-slate-500">{asignaturasDe(p).length} asignatura(s)</div>
            </div>
            {p.archivoGuardado ? <DescargarProgramaBtn programa={p} texto />
              : <span className="text-xs text-slate-400">PDF no disponible</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {asignaturasDe(p).map((a, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-700">
                {a.nombre}{a.numPlaneaciones != null && a.numPlaneaciones !== "" && ` · ${nPlaneaciones(a.numPlaneaciones)}`}
              </span>
            ))}
          </div>
        </Card>
      ))}
      {lista.length === 0 && <Card className="p-8 text-center text-sm text-slate-400">Aún no hay programas publicados.</Card>}
    </div>
  );
}

/* ================================================================
   DASHBOARD ACADÉMICO (jefe académico y administrador)
   Panorama del cumplimiento de planeaciones, planes e informes.
   ================================================================ */

function DashboardAcademico({ db, irA, compacto = false }) {
  const [cicloSel, setCicloSel] = useState(db.config.cicloActual);
  const [periodoSel, setPeriodoSel] = useState(periodoDeFecha());
  const delCiclo = db.asignaciones.filter(a => a.ciclo === cicloSel && (a.periodo || "ago-ene") === periodoSel);

  const filas = delCiclo.map(a => {
    const av = avanceDe(db, a);
    const encargos = encargosDe(db, a);
    return { asig: a, av, encargos,
      sinPrograma: encargos.filter(e => e.tipo === "asignatura" && (!e.programa || e.requisitos.planeacion === null)).length };
  }).sort((x, y) => x.av.pct - y.av.pct);

  const totReq = filas.reduce((s, f) => s + f.av.requeridas, 0);
  const totEnt = filas.reduce((s, f) => s + f.av.entregadas, 0);
  const pctGlobal = totReq ? Math.round(100 * totEnt / totReq) : 0;
  const alCien = filas.filter(f => f.av.requeridas > 0 && f.av.entregadas >= f.av.requeridas).length;
  const sinVinculo = delCiclo.filter(a => !a.docenteId).length;
  const conPendPrograma = filas.filter(f => f.sinPrograma > 0).length;

  /* Reparto por tipo de entrega: muestra dónde está el rezago
     (planeaciones, planes de trabajo o informes). */
  const porTipo = ["planeacion", "plan", "informe"].map(t => {
    let req = 0, ent = 0;
    filas.forEach(f => f.encargos.forEach(e => {
      const n = e.requisitos[t];
      if (n === null || !n) return;
      req += n;
      ent += Math.min(entregasDe(db, f.asig.docenteId, cicloSel, e.clave, t, periodoSel).length, n);
    }));
    return { nombre: PLURAL_TIPO_ENTREGA[t], requeridas: req, entregadas: ent,
      pendientes: Math.max(req - ent, 0), pct: req ? Math.round(100 * ent / req) : 0 };
  }).filter(x => x.requeridas > 0);

  // Cuántos docentes hay en cada tramo de cumplimiento
  const tramos = [
    { nombre: "Completo (100%)", color: "#059669", n: filas.filter(f => f.av.pct >= 100).length },
    { nombre: "Avanzado (60–99%)", color: "#E8871E", n: filas.filter(f => f.av.pct >= 60 && f.av.pct < 100).length },
    { nombre: "Inicial (1–59%)", color: "#eab308", n: filas.filter(f => f.av.pct > 0 && f.av.pct < 60).length },
    { nombre: "Sin entregas", color: "#e11d48", n: filas.filter(f => f.av.pct === 0).length },
  ].filter(t => t.n > 0);

  // Reparto de la carga por tipo de actividad
  const porActividad = [
    { nombre: "Frente a grupo", color: "#1a2340", n: 0 },
    { nombre: "Módulos", color: "#E8871E", n: 0 },
    { nombre: "BAETAM", color: "#0ea5e9", n: 0 },
    { nombre: "Comisiones", color: "#64748b", n: 0 },
  ];
  filas.forEach(f => f.encargos.forEach(e => {
    if (e.tipo === "asignatura") porActividad[0].n++;
    else if (e.tipo === "modulo") porActividad[1].n++;
    else if (e.tipo === "baetam") porActividad[2].n++;
    else porActividad[3].n++;
  }));

  const exportarResumen = () => {
    const fs = [["Lugar", "Docente", "Ciclo", "Semestre", "Actividades", "Horas", "Entregas requeridas", "Entregas recibidas", "% de avance", "Requisitos por definir"]];
    [...filas].sort((a, b) => b.av.pct - a.av.pct).forEach((f, i) => fs.push([
      i + 1, f.asig.nombreExtraido, cicloSel, nombrePeriodo(periodoSel), f.encargos.length,
      f.asig.totalHoras ?? "", f.av.requeridas, f.av.entregadas, f.av.pct + "%",
      f.sinPrograma > 0 ? `${f.sinPrograma} asignatura(s) sin programa` : "",
    ]));
    descargarCSV(`cumplimiento_planeaciones_${cicloSel}_${periodoSel}`, fs);
  };

  const exportarDetalle = () => {
    const fs = [["Docente", "Ciclo", "Semestre", "Actividad", "Tipo", "Grupos", "Horas", "Tipo de entrega", "Requeridas", "Recibidas", "Archivos recibidos"]];
    filas.forEach(f => f.encargos.forEach(e => {
      [["planeacion", e.requisitos.planeacion], ["plan", e.requisitos.plan], ["informe", e.requisitos.informe]]
        .filter(([, n]) => n === null || n > 0)
        .forEach(([t, n]) => {
          const ent = f.asig.docenteId ? entregasDe(db, f.asig.docenteId, cicloSel, e.clave, t, periodoSel) : [];
          fs.push([f.asig.nombreExtraido, cicloSel, nombrePeriodo(periodoSel), e.actividad,
            NOMBRE_TIPO_ENCARGO[e.tipo] || e.tipo,
            [...new Set(e.grupos)].join(" "), e.horas,
            NOMBRE_TIPO_ENTREGA[t], n === null ? "Por definir" : n, ent.length,
            ent.map(x => x.titulo).join(" | ")]);
        });
    }));
    descargarCSV(`detalle_entregas_${cicloSel}_${periodoSel}`, fs);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={compacto ? "text-lg font-bold" : "text-xl font-bold"} style={{fontFamily:"'Archivo', sans-serif"}}>
            Cumplimiento de planeaciones
          </h2>
          <p className="text-sm text-slate-500">Avance de planeaciones, planes de trabajo e informes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select className={inputCls + " !mt-0 !w-auto"} value={cicloSel} onChange={e => setCicloSel(e.target.value)}>
            {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          </select>
          <select className={inputCls + " !mt-0 !w-auto"} value={periodoSel} onChange={e => setPeriodoSel(e.target.value)}>
            {PERIODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icono={Users} label="Docentes con asignación" valor={delCiclo.length} />
        <Stat icono={FileCheck} label="Entregas recibidas" valor={`${totEnt}/${totReq}`} />
        <Stat icono={TrendingUp} label="Avance global" valor={pctGlobal + "%"} />
        <Stat icono={Award} label="Docentes al 100%" valor={alCien} />
      </div>

      {(sinVinculo > 0 || conPendPrograma > 0) && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          {sinVinculo > 0 && <p>⚠ <b>{sinVinculo}</b> {sinVinculo === 1 ? "asignación" : "asignaciones"} sin cuenta vinculada: esos docentes no pueden ver ni subir sus entregas. Corrígelo en <button className="underline font-semibold" onClick={() => irA("asignaciones")}>Asignaciones</button>.</p>}
          {conPendPrograma > 0 && <p>⚠ <b>{conPendPrograma}</b> docente(s) con asignaturas sin programa en el repositorio: su requisito no se puede calcular. Súbelos en <button className="underline font-semibold" onClick={() => irA("programas")}>Programas de Estudio</button>.</p>}
        </div>
      )}

      {filas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          No hay asignaciones cargadas en {nombrePeriodo(periodoSel)} del ciclo {cicloSel}.
        </Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            {porTipo.length > 0 && (
              <Card className="p-4">
                <h3 className="font-bold text-sm mb-3">Avance por tipo de entrega</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={porTipo} margin={{ top: 4, right: 8, left: -18, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="nombre" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v, n) => [v, n === "entregadas" ? "Recibidas" : "Pendientes"]} />
                    <Legend formatter={v => v === "entregadas" ? "Recibidas" : "Pendientes"} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="entregadas" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pendientes" stackId="a" fill="#e2e8f0" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}

            <Card className="p-4">
              <h3 className="font-bold text-sm mb-3">Docentes por nivel de cumplimiento</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={tramos} dataKey="n" nameKey="nombre" cx="50%" cy="50%" outerRadius={78} label={({ n }) => n}>
                    {tramos.map((t, i) => <Cell key={i} fill={t.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} docente(s)`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">Avance por docente</h3>
            <ResponsiveContainer width="100%" height={Math.max(220, filas.length * 26)}>
              <BarChart data={filas.map(f => ({
                nombre: (f.asig.nombreExtraido || "").split(" ").slice(0, 2).join(" "),
                pct: f.av.pct, entregadas: f.av.entregadas, requeridas: f.av.requeridas,
              }))} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, n, p) => [`${v}% (${p.payload.entregadas} de ${p.payload.requeridas})`, "Avance"]} />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                  {filas.map((f, i) => (
                    <Cell key={i} fill={f.av.pct >= 100 ? "#059669" : f.av.pct >= 60 ? "#E8871E" : "#e11d48"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-bold text-sm mb-3">Reparto de la carga académica</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={porActividad.filter(a => a.n > 0)} dataKey="n" nameKey="nombre" cx="50%" cy="50%"
                    innerRadius={45} outerRadius={72} label={({ n }) => n}>
                    {porActividad.filter(a => a.n > 0).map((a, i) => <Cell key={i} fill={a.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`${v} encargo(s)`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm">Reportes</h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Descarga el cumplimiento de {nombrePeriodo(periodoSel)} en formato Excel.
              </p>
              <div className="space-y-2">
                <button className={btnSec + " w-full justify-start"} onClick={exportarResumen}>
                  <Download size={14}/>Resumen por docente
                </button>
                <button className={btnSec + " w-full justify-start"} onClick={exportarDetalle}>
                  <Download size={14}/>Detalle por actividad y entrega
                </button>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                <div className="flex justify-between"><span>Con rezago (menos del 60%)</span><b>{filas.filter(f => f.av.pct < 60).length}</b></div>
                <div className="flex justify-between"><span>Entregas pendientes</span><b>{Math.max(totReq - totEnt, 0)}</b></div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================
   ASIGNACIONES (jefe académico y administrador)
   ================================================================ */

function Asignaciones({ db, user, mutar, irAPanel }) {
  const [fase, setFase] = useState("lista"); // lista | subiendo | ia | revisar
  const [progreso, setProgreso] = useState(0);
  const [extraidos, setExtraidos] = useState(null); // [{nombre, items, total_horas, docenteId}]
  const [loteArchivo, setLoteArchivo] = useState(null);
  const [cicloSel, setCicloSel] = useState(db.config.cicloActual);
  const [periodoSel, setPeriodoSel] = useState(periodoDeFecha());
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle] = useState(null); // asignación abierta
  const [ultimoIntento, setUltimoIntento] = useState(null); // para reintentar sin volver a elegir archivo

  const docentes = db.users.filter(u => u.rol === "docente" && u.activo);
  const delCiclo = db.asignaciones.filter(a => a.ciclo === cicloSel && (a.periodo || "ago-ene") === periodoSel);

  const procesar = async (file) => {
    if (!file) return;
    setErr("");
    const b64 = await leerComoBase64(file);
    if (b64.length > MAX_FILE_B64) { setErr("El PDF supera el límite (~7.5 MB). Divídelo o comprímelo."); return; }
    await procesarB64({ file, b64 });
  };

  const procesarB64 = async ({ file, b64 }) => {
    setErr("");
    setLoteArchivo({ file, b64 });
    setFase("ia"); setProgreso(30);
    const timer = setInterval(() => setProgreso(p => Math.min(p + 4, 92)), 700);
    try {
      const r = await extraerConIA({ base64: b64, mime: file.type || "application/pdf", tipo: "asignaciones" });
      clearInterval(timer); setProgreso(100);
      const lista = (r.docentes || []).map(d => ({
        nombre: d.nombre || "", titulo: d.titulo || "",
        items: (d.items || []).filter(i => i.actividad),
        totalHoras: d.total_horas ?? null,
        docenteId: emparejarDocente(db, d.nombre)?.id || "",
      }));
      if (!lista.length) { setErr("La IA no encontró docentes en el documento. Verifica que sea el PDF de asignaciones."); setFase("lista"); return; }
      setExtraidos(lista); setFase("revisar");
    } catch (e) {
      clearInterval(timer);
      const msg = e.message || "";
      if (/límite de uso|cuota|quota|429|RESOURCE_EXHAUSTED/i.test(msg)) {
        setErr("cuota");
        setUltimoIntento({ file, b64 });
      } else {
        setErr("No se pudo leer el documento: " + msg);
      }
      setFase("lista");
    }
  };

  const confirmar = async () => {
    const sinMatch = extraidos.filter(x => !x.docenteId).length;
    if (sinMatch && !window.confirm(`${sinMatch} docente(s) del PDF no quedaron vinculados a una cuenta y no podrán ver su asignación. ¿Guardar de todos modos?`)) return;
    setGuardando(true); setErr("");
    const aNotificar = [];
    try {
      const loteId = uid();
      await guardarArchivo("asig_" + loteId, loteArchivo.b64, loteArchivo.file.type || "application/pdf", loteArchivo.file.name);
      await mutar(d => {
        for (const x of extraidos) {
          // Si el docente ya tenía asignación en este ciclo, se reemplaza
          d.asignaciones = d.asignaciones.filter(a => !(a.ciclo === cicloSel
            && (a.periodo || "ago-ene") === periodoSel && a.docenteId && a.docenteId === x.docenteId));
          d.asignaciones.push({
            id: uid(), loteId, ciclo: cicloSel, periodo: periodoSel,
            docenteId: x.docenteId || null,
            nombreExtraido: (x.titulo ? x.titulo + " " : "") + x.nombre,
            items: x.items, totalHoras: x.totalHoras,
            creadoEn: ahora(), creadoPor: user.nombre,
          });
          if (x.docenteId) {
            notificar(d, x.docenteId,
              `📋 Ya está disponible tu asignación del semestre ${nombrePeriodo(periodoSel)} (ciclo ${cicloSel}). Revisa en “Mi asignación” qué planeaciones, planes e informes te corresponden.`);
            aNotificar.push(x.docenteId);
          }
        }
        registrarActividad(d, `Se cargaron asignaciones de ${nombrePeriodo(periodoSel)} del ciclo ${cicloSel} (${extraidos.length} docentes).`);
      });
      if (aNotificar.length) {
        enviarPush({
          destinatarios: aNotificar,
          titulo: "Tu asignación está disponible",
          cuerpo: `Semestre ${nombrePeriodo(periodoSel)} · ciclo ${cicloSel}. Revisa qué debes entregar.`,
          ruta: "mi_asignacion",
        });
      }
      setFase("lista"); setExtraidos(null); setLoteArchivo(null);
    } catch (e) { setErr(e.message); }
    setGuardando(false);
  };

  const eliminarAsig = async (a) => {
    if (!window.confirm(`¿Eliminar la asignación de ${a.nombreExtraido}? Las entregas ya subidas se conservan.`)) return;
    await mutar(d => { d.asignaciones = d.asignaciones.filter(x => x.id !== a.id); });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Asignaciones</h2>
          <p className="text-sm text-slate-500">
            Sube el PDF de asignaciones del semestre; la IA extrae cada docente con sus actividades y
            horas, y el sistema calcula qué debe entregar cada quien según los programas de estudio.
          </p>
        </div>
        {fase === "lista" && (
          <div className="flex gap-2">
            <button className={btnSec} onClick={() => irAPanel && irAPanel()}><TrendingUp size={15}/>Panel de cumplimiento</button>
          <label className={btnPrim + " cursor-pointer"}>
            <Upload size={15}/>Subir PDF de asignaciones
            <input type="file" accept=".pdf" className="hidden" onChange={e => { procesar(e.target.files[0]); e.target.value = ""; }} />
          </label>
          </div>
        )}
      </div>

      {err === "cuota" ? (
        <div className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 space-y-2">
          <p className="flex items-start gap-1.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0"/>
            <span>
              <b>Se alcanzó el límite de uso de la API de Gemini.</b> El nivel gratuito permite unas
              pocas lecturas por minuto. Espera un momento y vuelve a intentarlo; el documento no se
              perdió. Si el aviso se repite todo el día, es la cuota diaria, que se restablece de
              madrugada.
            </span>
          </p>
          {ultimoIntento && (
            <button className={btnSec + " !px-3 !py-1.5"} onClick={() => { setErr(""); procesarB64(ultimoIntento); }}>
              <Sparkles size={13}/>Reintentar con el mismo PDF
            </button>
          )}
        </div>
      ) : err ? (
        <p className="text-sm text-rose-600 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0"/>{err}</p>
      ) : null}

      {fase === "ia" && (
        <Card className="p-6 text-center space-y-3">
          <Loader2 className="animate-spin mx-auto text-[#E8871E]" size={28} />
          <p className="text-sm font-semibold">La IA está leyendo el documento…</p>
          <p className="text-xs text-slate-500">Extrae cada docente, sus actividades y horas. Con muchos docentes puede tardar un par de minutos.</p>
          <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden max-w-md mx-auto">
            <div className="h-full bg-[#E8871E] transition-all" style={{ width: progreso + "%" }} />
          </div>
        </Card>
      )}

      {fase === "revisar" && extraidos && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-sm">Revisa lo extraído · {extraidos.length} docente(s)</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Ciclo:</span>
              <select className={inputCls + " !mt-0 !w-auto"} value={cicloSel} onChange={e => setCicloSel(e.target.value)}>
                {ciclosDisponibles(db).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span className="text-slate-500">Semestre:</span>
              <select className={inputCls + " !mt-0 !w-auto"} value={periodoSel} onChange={e => setPeriodoSel(e.target.value)}>
                {PERIODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Se guardarán en <b>{nombrePeriodo(periodoSel)}</b> del ciclo <b>{cicloSel}</b>; si un docente
            ya tenía asignación en ese semestre, se reemplaza. Verifica que cada docente esté
            vinculado a su cuenta: los datos con ⚠ requieren tu atención.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-3">Docente en el PDF</th><th className="py-2 pr-3">Cuenta vinculada</th>
                <th className="py-2 pr-3">Actividades</th><th className="py-2">Horas</th>
              </tr></thead>
              <tbody>
                {extraidos.map((x, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium">{x.titulo && <span className="text-slate-400">{x.titulo} </span>}{x.nombre}</td>
                    <td className="py-2 pr-3">
                      <select className={inputCls + " !mt-0"} value={x.docenteId}
                        onChange={e => setExtraidos(list => list.map((y, j) => j === i ? { ...y, docenteId: e.target.value } : y))}>
                        <option value="">⚠ Sin vincular</option>
                        {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{x.items.length}</td>
                    <td className="py-2 font-semibold">{x.totalHoras ?? "⚠"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button className={btnSec} onClick={() => { setFase("lista"); setExtraidos(null); }}>Cancelar</button>
            <button className={btnPrim} disabled={guardando} onClick={confirmar}>
              {guardando && <Loader2 size={14} className="animate-spin"/>}Guardar asignaciones
            </button>
          </div>
        </Card>
      )}

      {fase === "lista" && (
        <>
          <Card className="p-3 flex flex-wrap gap-2 items-center">
            <span className="text-sm text-slate-500">Ciclo:</span>
            <select className={inputCls + " !mt-0 !w-auto"} value={cicloSel} onChange={e => setCicloSel(e.target.value)}>
              {ciclosDisponibles(db).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-sm text-slate-500">Semestre:</span>
            <select className={inputCls + " !mt-0 !w-auto"} value={periodoSel} onChange={e => setPeriodoSel(e.target.value)}>
              {PERIODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
            <span className="text-xs text-slate-400 ml-auto">{nAsignaciones(delCiclo.length)} en este semestre</span>
          </Card>
          {user.rol !== "admin" && delCiclo.length > 0 && (
            <p className="text-[11px] text-slate-400">
              Para corregir una comisión, sus horas o el número de entregas de un docente,
              solicítalo a la administración general.
            </p>
          )}
          <Card className="p-4">
            {delCiclo.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">No hay asignaciones cargadas en este ciclo.</p>}
            {delCiclo.sort((a, b) => a.nombreExtraido.localeCompare(b.nombreExtraido)).map(a => {
              const av = avanceDe(db, a);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium text-sm">{a.nombreExtraido}</div>
                    <div className="text-xs text-slate-500">
                      {a.docenteId ? (docentes.find(d => d.id === a.docenteId)?.nombre || "Cuenta desactivada")
                        : <span className="text-amber-600 font-semibold">⚠ Sin cuenta vinculada</span>}
                      {" · "}{(a.items || []).length} actividades · {a.totalHoras ?? "—"} h
                    </div>
                  </div>
                  <div className="text-center min-w-[110px]">
                    <div className="text-xs font-bold">{av.entregadas}/{av.requeridas}{av.indeterminado && " ⚠"}</div>
                    <div className="w-24 h-1.5 rounded-full bg-slate-200 overflow-hidden mx-auto mt-1">
                      <div className={`h-full ${av.pct >= 100 ? "bg-emerald-600" : "bg-[#E8871E]"}`} style={{ width: av.pct + "%" }} />
                    </div>
                  </div>
                  <button className={btnSec + " !px-3 !py-1.5"} onClick={() => setDetalle(a)}>Ver detalle</button>
                  <button className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="Eliminar" onClick={() => eliminarAsig(a)}><Trash2 size={15}/></button>
                </div>
              );
            })}
          </Card>
        </>
      )}

      {detalle && <DetalleAsignacion db={db} asig={detalle} docentes={docentes} mutar={mutar}
        onClose={() => setDetalle(null)} esAdmin={user.rol === "admin"} />}
    </div>
  );
}

function DetalleAsignacion({ db, asig, docentes, mutar, onClose, esAdmin = false }) {
  const encargos = encargosDe(db, asig);
  const [editando, setEditando] = useState(null);
  const cambiarVinculo = (id) => mutar(d => {
    const a = d.asignaciones.find(x => x.id === asig.id);
    if (a) a.docenteId = id || null;
  });

  /* Edición manual (solo administración general): cambiar el nombre de la
     actividad o comisión, sus horas, y cuántas entregas corresponden. */
  const abrirEdicion = (e) => setEditando({
    clave: e.clave,
    actividad: e.actividad,
    horas: e.horas,
    planeacion: e.requisitos.planeacion ?? "",
    plan: e.requisitos.plan ?? "",
    informe: e.requisitos.informe ?? "",
  });

  const guardarEdicion = async () => {
    const ed = editando;
    const nuevaClave = normTexto(ed.actividad);
    if (!nuevaClave) return;
    await mutar(d => {
      const a = d.asignaciones.find(x => x.id === asig.id);
      if (!a) return;

      // 1. Renombrar la actividad en los renglones y repartir las horas
      const renglones = (a.items || []).filter(i => normTexto(i.actividad) === ed.clave);
      if (renglones.length) {
        const nuevasHoras = Number(ed.horas);
        const total = renglones.reduce((s, i) => s + (Number(i.horas) || 0), 0);
        renglones.forEach((i, idx) => {
          i.actividad = ed.actividad;
          if (!isNaN(nuevasHoras)) {
            // Se reparte proporcionalmente; el último absorbe el redondeo
            i.horas = total > 0
              ? (idx === renglones.length - 1
                  ? nuevasHoras - renglones.slice(0, -1).reduce((s, r) => s + Math.round(nuevasHoras * (Number(r.horas) || 0) / total), 0)
                  : Math.round(nuevasHoras * (Number(i.horas) || 0) / total))
              : (idx === 0 ? nuevasHoras : 0);
          }
        });
      }
      a.totalHoras = (a.items || []).reduce((s, i) => s + (Number(i.horas) || 0), 0);

      // 2. Guardar el ajuste de entregas bajo la clave nueva
      a.ajustes = { ...(a.ajustes || {}) };
      if (ed.clave !== nuevaClave) delete a.ajustes[ed.clave];
      a.ajustes[nuevaClave] = {
        planeacion: ed.planeacion === "" ? null : Number(ed.planeacion),
        plan: ed.plan === "" ? null : Number(ed.plan),
        informe: ed.informe === "" ? null : Number(ed.informe),
      };

      // 3. Si cambió el nombre, mover las entregas ya subidas a la clave nueva
      //    para que no se pierda el trabajo del docente
      if (ed.clave !== nuevaClave) {
        d.entregas.filter(x => x.docenteId === a.docenteId && x.ciclo === a.ciclo
          && (x.periodo || "ago-ene") === (a.periodo || "ago-ene") && x.encargoClave === ed.clave)
          .forEach(x => { x.encargoClave = nuevaClave; x.actividad = ed.actividad; });
      }

      registrarActividad(d, `Se ajustó la asignación de ${a.nombreExtraido}: “${ed.actividad}”.`);
    });
    setEditando(null);
  };

  const quitarAjuste = async (clave) => {
    await mutar(d => {
      const a = d.asignaciones.find(x => x.id === asig.id);
      if (a && a.ajustes) { delete a.ajustes[clave]; a.ajustes = { ...a.ajustes }; }
    });
  };
  return (
    <Modal titulo={`Asignación · ${asig.nombreExtraido}`} onClose={onClose} ancho="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-500">Ciclo {asig.ciclo} · {asig.totalHoras ?? "—"} horas totales</span>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-500">Cuenta:</span>
            <select className={inputCls + " !mt-0 !w-auto"} value={asig.docenteId || ""} onChange={e => cambiarVinculo(e.target.value)}>
              <option value="">Sin vincular</option>
              {docentes.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        </div>
        {encargos.map(e => {
          const filas = [
            ["planeacion", e.requisitos.planeacion],
            ["plan", e.requisitos.plan],
            ["informe", e.requisitos.informe],
          ].filter(([, n]) => n === null || n > 0);
          return (
            <Card key={e.clave} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">{e.actividad}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {NOMBRE_TIPO_ENCARGO[e.tipo] || e.tipo}
                </span>
                {e.grupos.length > 0 && <span className="text-xs text-slate-400">{[...new Set(e.grupos)].join(", ")}</span>}
                {e.ajustado && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    AJUSTADO A MANO
                  </span>
                )}
                <span className="text-xs text-slate-400 ml-auto">{e.horas} h</span>
                {esAdmin && (
                  <>
                    <button className="p-1 rounded hover:bg-slate-100 text-slate-500" title="Editar actividad, horas y entregas"
                      onClick={() => abrirEdicion(e)}><Pencil size={14}/></button>
                    {e.ajustado && (
                      <button className="p-1 rounded hover:bg-slate-100 text-slate-400" title="Quitar el ajuste manual y volver al cálculo automático"
                        onClick={() => quitarAjuste(e.clave)}><X size={14}/></button>
                    )}
                  </>
                )}
              </div>
              {e.tipo === "asignatura" && !e.programa && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2">
                  ⚠ No hay programa de estudio que coincida con esta asignatura: no se puede calcular cuántas
                  planeaciones corresponden. Súbelo en Programas de Estudio (el nombre debe coincidir).
                </p>
              )}
              {e.programa && <p className="text-[11px] text-slate-400 mt-1">Programa: {e.programa.programa?.nombre} · {e.programa.nombre}</p>}
              <div className="mt-2 space-y-1">
                {filas.map(([t, n]) => {
                  const ent = asig.docenteId ? entregasDe(db, asig.docenteId, asig.ciclo, e.clave, t, asig.periodo || "ago-ene") : [];
                  return (
                    <div key={t} className="flex items-center gap-2 text-sm">
                      <span className="w-32 text-slate-500">{tipoEntrega(t, n)}:</span>
                      <span className={`font-semibold ${n !== null && ent.length >= n ? "text-emerald-700" : ""}`}>
                        {ent.length} de {n === null ? "?" : n}
                      </span>
                      {ent.map(x => <VerEntregaBtn key={x.id} entrega={x} />)}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {editando && (
        <Modal titulo="Editar actividad de la asignación" onClose={() => setEditando(null)}>
          <div className="space-y-3">
            <Campo label="Actividad, comisión o cargo">
              <input className={inputCls} value={editando.actividad}
                onChange={e => setEditando({ ...editando, actividad: e.target.value })} />
            </Campo>
            <Campo label="Horas totales de esta actividad">
              <input type="number" min="0" className={inputCls} value={editando.horas}
                onChange={e => setEditando({ ...editando, horas: e.target.value })} />
            </Campo>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Entregas que debe subir el docente</p>
              <div className="grid grid-cols-3 gap-2">
                <Campo label="Planeaciones">
                  <input type="number" min="0" className={inputCls} value={editando.planeacion}
                    onChange={e => setEditando({ ...editando, planeacion: e.target.value })} />
                </Campo>
                <Campo label="Planes de trabajo">
                  <input type="number" min="0" className={inputCls} value={editando.plan}
                    onChange={e => setEditando({ ...editando, plan: e.target.value })} />
                </Campo>
                <Campo label="Informes">
                  <input type="number" min="0" className={inputCls} value={editando.informe}
                    onChange={e => setEditando({ ...editando, informe: e.target.value })} />
                </Campo>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Puedes poner <b>0</b> para que no se pida ese tipo de entrega. Deja el campo vacío
                para volver al cálculo automático de ese renglón.
              </p>
            </div>
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Si cambias el nombre de la actividad, los documentos que el docente ya subió se
              conservan y se mueven a la actividad renombrada.
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            <button className={btnPrim} onClick={guardarEdicion}>Guardar cambios</button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

function VerEntregaBtn({ entrega }) {
  const [abriendo, setAbriendo] = useState(false);
  const abrir = async () => {
    setAbriendo(true);
    const f = await leerArchivo("ent_" + entrega.id);
    setAbriendo(false);
    if (!f) return;
    const bytes = atob(f.base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    window.open(URL.createObjectURL(new Blob([arr], { type: f.mime })), "_blank");
  };
  return (
    <button onClick={abrir} title={`${entrega.titulo || "Entrega"} · ${fmtFecha((entrega.fecha || "").slice(0,10))}`}
      className="p-1 rounded hover:bg-slate-100 text-slate-400">
      {abriendo ? <Loader2 size={13} className="animate-spin"/> : <Eye size={13}/>}
    </button>
  );
}

/* ================================================================
   MI ASIGNACIÓN (docente)
   ================================================================ */

function MiAsignacion({ db, user, mutar }) {
  const misAsigs = db.asignaciones.filter(a => a.docenteId === user.id)
    .sort((a, b) => (b.ciclo + (b.periodo || "")).localeCompare(a.ciclo + (a.periodo || "")));
  const vigente = asignacionDe(db, user.id);
  const [sel, setSel] = useState(vigente ? `${vigente.ciclo}|${vigente.periodo || "ago-ene"}`
    : `${db.config.cicloActual}|${periodoDeFecha()}`);
  const [cicloSel, periodoSel] = sel.split("|");
  const asig = misAsigs.find(a => a.ciclo === cicloSel && (a.periodo || "ago-ene") === periodoSel) || null;
  const [subiendo, setSubiendo] = useState(null); // clave del slot en proceso
  const [err, setErr] = useState("");

  const subir = async (encargo, tipo, file) => {
    if (!file) return;
    setErr("");
    const slot = encargo.clave + "|" + tipo;
    setSubiendo(slot);
    try {
      const b64 = await leerComoBase64(file);
      if (b64.length > MAX_FILE_B64) { setErr("El archivo supera el límite (~7.5 MB)."); setSubiendo(null); return; }
      const id = uid();
      const r = await guardarArchivo("ent_" + id, b64, file.type || "application/pdf", file.name);
      if (!r.guardado) { setErr("No se pudo guardar el archivo. Inténtalo de nuevo."); setSubiendo(null); return; }
      await mutar(d => {
        d.entregas.push({
          id, docenteId: user.id, ciclo: asig.ciclo, periodo: asig.periodo || "ago-ene",
          encargoClave: encargo.clave,
          actividad: encargo.actividad, tipo, titulo: file.name,
          estado: "entregada", fecha: ahora(),
        });
        d.users.filter(u => esRolAcademico(u.rol) && u.rol !== "admin" && u.activo).forEach(j =>
          notificar(d, j.id, `📥 ${user.nombre} subió ${NOMBRE_TIPO_ENTREGA[tipo].toLowerCase()} de “${encargo.actividad}”.`));
        otorgarLogros(d, user.id, asig.ciclo);
      });
    } catch (e) { setErr(e.message); }
    setSubiendo(null);
  };

  const quitar = async (entrega) => {
    if (!window.confirm(`¿Quitar “${entrega.titulo}”? Podrás subir otro archivo en su lugar.`)) return;
    await mutar(d => { d.entregas = d.entregas.filter(x => x.id !== entrega.id); });
    await eliminarArchivo("ent_" + entrega.id);
  };

  if (!misAsigs.length) return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mi asignación</h2>
      <Card className="p-8 text-center text-sm text-slate-400">
        Aún no tienes una asignación cargada. Cuando el Departamento Académico la publique, aparecerá aquí
        junto con las planeaciones, planes de trabajo e informes que te corresponden.
      </Card>
    </div>
  );

  const av = asig ? avanceDe(db, asig) : null;
  const encargos = asig ? encargosDe(db, asig) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mi asignación</h2>
            <p className="text-sm text-slate-500">{asig ? `${asig.totalHoras ?? "—"} horas · ${encargos.length} actividades` : "Sin asignación en este semestre"}</p>
        </div>
        <select className={inputCls + " !mt-0 !w-auto"} value={sel} onChange={e => setSel(e.target.value)}>
          {[...new Set([...misAsigs.map(a => `${a.ciclo}|${a.periodo || "ago-ene"}`),
                        `${db.config.cicloActual}|${periodoDeFecha()}`])]
            .sort().reverse()
            .map(v => <option key={v} value={v}>{nombrePeriodo(v.split("|")[1])} · {v.split("|")[0]}</option>)}
        </select>
      </div>

      {av && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="font-semibold">Avance de entregas</span>
            <span className="text-slate-500">{av.entregadas} de {av.requeridas}{av.indeterminado ? " (+ pendientes por definir)" : ""}</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
            <div className={`h-full transition-all ${av.pct >= 100 ? "bg-emerald-600" : "bg-[#E8871E]"}`} style={{ width: av.pct + "%" }} />
          </div>
        </Card>
      )}

      {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}

      {encargos.map(e => {
        const filas = [
          ["planeacion", e.requisitos.planeacion],
          ["plan", e.requisitos.plan],
          ["informe", e.requisitos.informe],
        ].filter(([, n]) => n === null || n > 0);
        return (
          <Card key={e.clave} className="p-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-sm">{e.actividad}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {NOMBRE_TIPO_ENCARGO[e.tipo] || e.tipo}
              </span>
              {e.grupos.length > 0 && <span className="text-xs text-slate-400">{[...new Set(e.grupos)].join(", ")}</span>}
            </div>
            {e.programa && (
              <p className="text-[11px] text-slate-400 mb-1 flex items-center gap-2">
                Programa: {e.programa.programa?.nombre} · {e.programa.nombre}
                {e.programa.programa && <DescargarProgramaBtn programa={e.programa.programa} texto />}
              </p>
            )}
            {e.tipo === "asignatura" && !e.programa && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
                El programa de esta asignatura aún no está en el repositorio; cuando el Departamento
                Académico lo suba, aquí verás cuántas planeaciones te corresponden.
              </p>
            )}
            <div className="space-y-2 mt-2">
              {filas.map(([t, n]) => {
                const ent = entregasDe(db, user.id, asig.ciclo, e.clave, t, asig.periodo || "ago-ene");
                const faltan = n === null ? 0 : Math.max(n - ent.length, 0);
                const slot = e.clave + "|" + t;
                return (
                  <div key={t} className="border border-slate-100 rounded-xl p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{tipoEntrega(t, n ?? 2)}</span>
                      <span className={`text-xs font-bold ${n !== null && ent.length >= n ? "text-emerald-700" : "text-slate-500"}`}>
                        {ent.length} de {n === null ? "?" : n} {n !== null && ent.length >= n && "✓"}
                      </span>
                    </div>
                    {ent.map(x => (
                      <div key={x.id} className="flex items-center gap-2 text-xs text-slate-600 mt-1.5">
                        <FileText size={13} className="text-slate-400 shrink-0"/>
                        <span className="truncate flex-1">{x.titulo}</span>
                        <span className="text-slate-400 shrink-0">{fmtFecha((x.fecha || "").slice(0,10))}</span>
                        <VerEntregaBtn entrega={x} />
                        <button className="p-1 rounded hover:bg-rose-50 text-rose-400" title="Quitar y volver a subir" onClick={() => quitar(x)}><Trash2 size={13}/></button>
                      </div>
                    ))}
                    {faltan > 0 && (
                      <label className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-3 py-1.5 rounded-lg border ${subiendo === slot ? "text-slate-400 border-slate-200" : "text-[#1a2340] border-slate-300 hover:bg-slate-50"}`}>
                        {subiendo === slot ? <Loader2 size={13} className="animate-spin"/> : <Upload size={13}/>}
                        Subir {NOMBRE_TIPO_ENTREGA[t].toLowerCase()} ({faltan} pendiente{faltan > 1 ? "s" : ""})
                        <input type="file" accept=".pdf,.doc,.docx" className="hidden" disabled={!!subiendo}
                          onChange={ev => { subir(e, t, ev.target.files[0]); ev.target.value = ""; }} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ================================================================
   AVISOS Y CIRCULARES
   ================================================================ */

const esImagenAdjunta = (aviso) =>
  (aviso.archivoTipo || "").startsWith("image/") ||
  /\.(jpe?g|png|webp|gif)$/i.test(aviso.archivoNombre || "");

function ChipPrioridad({ prioridad }) {
  const c = COLOR_PRIORIDAD[prioridad] || COLOR_PRIORIDAD.Normal;
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.chip}`}>{c.punto} {prioridad.toUpperCase()}</span>;
}

// Texto con saltos de línea, **negritas**, *cursivas*, listas y enlaces
function TextoAviso({ texto }) {
  const lineas = (texto || "").split("\n");
  const inline = (t, k) => {
    const partes = t.split(/(\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/\S+)/g).filter(Boolean);
    return partes.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
      if (p.startsWith("*") && p.endsWith("*")) return <i key={i}>{p.slice(1, -1)}</i>;
      if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="text-indigo-600 underline break-all">{p}</a>;
      return <span key={i}>{p}</span>;
    });
  };
  return (
    <div className="text-sm text-slate-600 space-y-1">
      {lineas.map((l, i) => {
        const li = l.match(/^\s*[-*•]\s+(.*)$/);
        if (li) return <div key={i} className="flex gap-2 pl-1"><span className="text-slate-400">•</span><span>{inline(li[1], i)}</span></div>;
        if (!l.trim()) return <div key={i} className="h-1.5" />;
        return <p key={i}>{inline(l, i)}</p>;
      })}
    </div>
  );
}

/* ---------------- Administrador ---------------- */

function Avisos({ db, user, mutar }) {
  const [editando, setEditando] = useState(null);
  const [confirmar, setConfirmar] = useState(null);   // aviso por publicar
  const [siguiendo, setSiguiendo] = useState(null);   // aviso en seguimiento
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fTipo, setFTipo] = useState("todos");
  const [fEstado, setFEstado] = useState("todos");
  const [fPrio, setFPrio] = useState("todas");

  const lista = db.avisos
    .filter(a => !q || (a.titulo || "").toLowerCase().includes(q.toLowerCase()))
    .filter(a => fTipo === "todos" || a.tipo === fTipo)
    .filter(a => fEstado === "todos" || a.estado === fEstado)
    .filter(a => fPrio === "todas" || a.prioridad === fPrio);

  const nuevo = () => setEditando({
    id: uid(), titulo: "", descripcion: "", tipo: "Circular", prioridad: "Normal",
    fechaLimite: "", enlace: "", archivoNombre: null, archivoGuardado: false,
    estado: "draft", destino: { tipo: "todos" }, creadoEn: ahora(), creadoPor: user.nombre,
    _archivoNuevo: null,
  });

  const subirAdjunto = async (aviso) => {
    if (!aviso._archivoNuevo) return { nombre: aviso.archivoNombre, guardado: aviso.archivoGuardado, tipo: aviso.archivoTipo };
    const f = aviso._archivoNuevo;
    const b64 = await leerComoBase64(f);
    const r = await guardarArchivo("aviso_" + aviso.id, b64, f.type, f.name);
    return { nombre: f.name, guardado: r.guardado, tipo: f.type };
  };

  const guardar = async (publicar) => {
    let paraPush = [];
    if (!editando.titulo.trim() || !editando.descripcion.trim()) {
      setErr("El título y la descripción son obligatorios."); return;
    }
    setGuardando(true); setErr("");
    try {
      const adj = await subirAdjunto(editando);
      await mutar(d => {
        const { _archivoNuevo, ...limpio } = editando;
        const base = {
          ...limpio, archivoNombre: adj.nombre, archivoGuardado: adj.guardado,
          archivoTipo: adj.tipo || limpio.archivoTipo || "",
          estado: publicar ? "published" : "draft",
          actualizadoEn: ahora(),
        };
        if (publicar && !base.fechaPublicacion) base.fechaPublicacion = ahora();
        const i = d.avisos.findIndex(a => a.id === base.id);
        if (i >= 0) d.avisos[i] = { ...d.avisos[i], ...base };
        else d.avisos.unshift(base);
        if (publicar) {
          destinatariosDe(d, base).forEach(doc => notificar(d, doc.id,
            `${base.prioridad === "Urgente" ? "🔴 URGENTE · " : "📢 "}Nuevo aviso: “${base.titulo}”. Márcalo como enterado en la sección Avisos.`));
          registrarActividad(d, `Se publicó el aviso “${base.titulo}”.`);
          paraPush = destinatariosDe(d, base).map(doc => doc.id);
        }
      });

      /* Notificación al celular. Va después de guardar y sin bloquear:
         si el envío falla, el aviso igual quedó publicado. */
      if (paraPush.length) {
        enviarPush({
          destinatarios: paraPush,
          titulo: (editando.prioridad === "Urgente" ? "🔴 URGENTE · " : "") + "Nuevo aviso",
          cuerpo: editando.titulo,
          ruta: "avisos",
          urgente: editando.prioridad === "Urgente",
        });
      }
      setEditando(null); setConfirmar(null);
    } catch (e) { setErr(e.message); }
    setGuardando(false);
  };

  const cambiarEstado = async (aviso, estado) => {
    const verbo = estado === "archived" ? "archivar" : "reactivar";
    if (!window.confirm(`¿Deseas ${verbo} el aviso “${aviso.titulo}”?\n\nLos acuses ya registrados se conservan.`)) return;
    await mutar(d => {
      const a = d.avisos.find(x => x.id === aviso.id);
      a.estado = estado; a.actualizadoEn = ahora();
      registrarActividad(d, `Se ${estado === "archived" ? "archivó" : "reactivó"} el aviso “${a.titulo}”.`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Avisos y Circulares</h2>
          <p className="text-sm text-slate-500">Publica comunicados y consulta el seguimiento de los acuses de enterado.</p>
        </div>
        <button className={btnPrim} onClick={nuevo}><Plus size={15}/>Nuevo aviso</button>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + " !mt-0 !pl-8"} placeholder="Buscar por título…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className={inputCls + " !mt-0 !w-auto"} value={fTipo} onChange={e => setFTipo(e.target.value)}>
          <option value="todos">Todos los tipos</option>{TIPOS_AVISO.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className={inputCls + " !mt-0 !w-auto"} value={fPrio} onChange={e => setFPrio(e.target.value)}>
          <option value="todas">Toda prioridad</option>{PRIORIDADES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className={inputCls + " !mt-0 !w-auto"} value={fEstado} onChange={e => setFEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADO_AVISO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Card>

      <Card className="p-4">
        {lista.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">No hay avisos que coincidan. Crea el primero con “Nuevo aviso”.</p>}
        {lista.map(a => {
          const s = seguimientoDe(db, a);
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-3 py-3 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{a.titulo}</span>
                  <ChipPrioridad prioridad={a.prioridad} />
                  <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{a.tipo}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {a.estado === "draft" ? "Sin publicar" : `Publicado ${fmtFecha((a.fechaPublicacion || "").slice(0,10))}`}
                  {a.fechaLimite && ` · Límite ${fmtFecha(a.fechaLimite)}`}
                  {a.archivoNombre && ` · 📎 ${a.archivoNombre}`}
                </div>
              </div>
              {a.estado !== "draft" && (
                <div className="text-center min-w-[86px]">
                  <div className="text-sm font-bold">{s.enterados.length}/{s.total.length}</div>
                  <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden mx-auto mt-1">
                    <div className="h-full bg-emerald-600" style={{ width: s.pct + "%" }} />
                  </div>
                </div>
              )}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                a.estado === "published" ? "bg-emerald-100 text-emerald-800"
                : a.estado === "draft" ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>
                {ESTADO_AVISO[a.estado]}
              </span>
              <div className="flex gap-1">
                {a.estado !== "draft" &&
                  <button className={btnSec + " !px-3 !py-1.5"} onClick={() => setSiguiendo(a)}>Ver seguimiento</button>}
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar"
                  onClick={() => setEditando({ ...JSON.parse(JSON.stringify(a)), _archivoNuevo: null })}><Pencil size={15}/></button>
                {a.estado === "published" &&
                  <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Archivar"
                    onClick={() => cambiarEstado(a, "archived")}><Archive size={15}/></button>}
                {a.estado === "archived" &&
                  <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Reactivar"
                    onClick={() => cambiarEstado(a, "published")}><Send size={15}/></button>}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Formulario */}
      {editando && (
        <Modal titulo={db.avisos.some(a => a.id === editando.id) ? "Editar aviso" : "Nuevo aviso"} onClose={() => setEditando(null)} ancho="max-w-2xl">
          <div className="space-y-3">
            <Campo label="Título">
              <input className={inputCls} value={editando.titulo} placeholder="Curso de actualización docente 2026"
                onChange={e => setEditando({ ...editando, titulo: e.target.value })} />
            </Campo>
            <Campo label="Descripción">
              <textarea className={inputCls + " min-h-[140px]"} value={editando.descripcion}
                placeholder={"Se informa al personal docente que…\n\nPuedes usar **negritas**, *cursivas*, listas con - y pegar ligas."}
                onChange={e => setEditando({ ...editando, descripcion: e.target.value })} />
            </Campo>
            <p className="text-[11px] text-slate-400 -mt-1">Formato: **negritas**, *cursivas*, líneas que empiezan con “- ” para listas. Las direcciones web se convierten en enlaces.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Campo label="Tipo de aviso">
                <select className={inputCls} value={editando.tipo} onChange={e => setEditando({ ...editando, tipo: e.target.value })}>
                  {TIPOS_AVISO.map(t => <option key={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Prioridad">
                <select className={inputCls} value={editando.prioridad} onChange={e => setEditando({ ...editando, prioridad: e.target.value })}>
                  {PRIORIDADES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Fecha límite de enterado (opcional)">
                <input type="date" className={inputCls} value={editando.fechaLimite || ""}
                  onChange={e => setEditando({ ...editando, fechaLimite: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Enlace externo (opcional)">
              <input className={inputCls} placeholder="https://…" value={editando.enlace || ""}
                onChange={e => setEditando({ ...editando, enlace: e.target.value })} />
            </Campo>
            <Campo label="Archivo adjunto (opcional): PDF o imagen">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" className="text-sm"
                onChange={e => setEditando({ ...editando, _archivoNuevo: e.target.files[0] || null })} />
              <p className="text-[11px] text-slate-400 mt-1">
                Las imágenes (cartel, invitación, infografía) se muestran directamente dentro del aviso;
                los PDF se abren al tocarlos.
              </p>
              {editando.archivoNombre && !editando._archivoNuevo &&
                <p className="text-xs text-slate-500 mt-1">Adjunto actual: {editando.archivoNombre}</p>}
            </Campo>
            {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            <button className={btnSec} disabled={guardando} onClick={() => guardar(false)}>
              {guardando && <Loader2 size={14} className="animate-spin"/>}Guardar borrador
            </button>
            <button className={btnPrim} disabled={guardando} onClick={() => {
              if (!editando.titulo.trim() || !editando.descripcion.trim()) { setErr("El título y la descripción son obligatorios."); return; }
              setConfirmar(editando);
            }}><Send size={15}/>Publicar aviso</button>
          </div>
        </Modal>
      )}

      {/* Confirmación de publicación */}
      {confirmar && (
        <Modal titulo="Confirmar publicación" onClose={() => setConfirmar(null)}>
          <p className="text-sm text-slate-600">¿Deseas publicar este aviso? Una vez publicado será visible para todos los docentes.</p>
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setConfirmar(null)}>Cancelar</button>
            <button className={btnPrim} disabled={guardando} onClick={() => guardar(true)}>
              {guardando && <Loader2 size={14} className="animate-spin"/>}Sí, publicar
            </button>
          </div>
        </Modal>
      )}

      {siguiendo && <SeguimientoAviso db={db} aviso={siguiendo} onClose={() => setSiguiendo(null)} />}
    </div>
  );
}

function SeguimientoAviso({ db, aviso, onClose }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const s = seguimientoDe(db, aviso);
  const filas = s.total
    .map(d => ({ d, ac: acuseDe(db, aviso.id, d.id) }))
    .filter(({ ac }) => filtro === "todos" || (filtro === "enterados" ? ac : !ac))
    .filter(({ d }) => !q || d.nombre.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.d.nombre.localeCompare(b.d.nombre));

  const exportar = () => {
    const filasCSV = [["Docente", "Área", "Estado", "Fecha", "Hora"]];
    s.total.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach(d => {
      const ac = acuseDe(db, aviso.id, d.id);
      const f = ac ? new Date(ac.fecha) : null;
      filasCSV.push([d.nombre, d.area || "", ac ? "Enterado" : "Pendiente",
        f ? f.toLocaleDateString("es-MX") : "", f ? f.toLocaleTimeString("es-MX") : ""]);
    });
    descargarCSV(`seguimiento_${aviso.titulo.slice(0, 30).replace(/\s+/g, "_")}`, filasCSV);
  };

  return (
    <Modal titulo="Seguimiento del aviso" onClose={onClose} ancho="max-w-3xl">
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold">{aviso.titulo}</h3>
            <ChipPrioridad prioridad={aviso.prioridad} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Publicado: {aviso.fechaPublicacion ? new Date(aviso.fechaPublicacion).toLocaleString("es-MX") : "—"}
            {aviso.fechaLimite && ` · Fecha límite: ${fmtFecha(aviso.fechaLimite)}`}
          </p>
          {avisoVencido(aviso) && s.pendientes.length > 0 && (
            <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1.5">
              <AlertTriangle size={13}/>{s.pendientes.length} docente(s) pendiente(s) después de la fecha límite.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icono={Users} label="Docentes" valor={s.total.length} />
          <Stat icono={CheckCircle2} label="Enterados" valor={s.enterados.length} />
          <Stat icono={Clock} label="Pendientes" valor={s.pendientes.length} color={s.pendientes.length ? "text-amber-600" : "text-slate-900"} />
          <Stat icono={TrendingUp} label="Avance" valor={s.pct + "%"} />
        </div>
        <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: s.pct + "%" }} />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputCls + " !mt-0 !pl-8"} placeholder="Buscar docente…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className={inputCls + " !mt-0 !w-auto"} value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="enterados">Solo enterados</option>
            <option value="pendientes">Solo pendientes</option>
          </select>
          <button className={btnSec} onClick={exportar}><Download size={14}/>Exportar seguimiento</button>
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-3">Docente</th><th className="py-2 pr-3">Estado</th><th className="py-2">Fecha de enterado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ d, ac }) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3">{d.nombre}<span className="block text-[11px] text-slate-400">{d.area || "—"}</span></td>
                  <td className="py-2 pr-3">
                    {ac ? <span className="text-emerald-700 font-semibold text-xs">✓ Enterado</span>
                        : <span className="text-amber-600 font-semibold text-xs">⚠ Pendiente</span>}
                  </td>
                  <td className="py-2 text-slate-500 text-xs">{ac ? new Date(ac.fecha).toLocaleString("es-MX") : "—"}</td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-400 text-sm">Sin resultados con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Docente ---------------- */

function MisAvisos({ db, user, recargar }) {
  const [tab, setTab] = useState("pendientes");
  const [mostrarPush, setMostrarPush] = useState(false);
  // Si aún no las activó, se ofrece de forma discreta
  useEffect(() => { estaActivo().then(a => setMostrarPush(!a && permisoActual() === "default")); }, []);
  const [confirmando, setConfirmando] = useState(null);
  const [firmando, setFirmando] = useState(false);
  const [err, setErr] = useState("");

  const mios = db.avisos.filter(a => a.estado !== "draft" && destinatariosDe(db, a).some(d => d.id === user.id));
  const pendientes = mios.filter(a => a.estado === "published" && !acuseDe(db, a.id, user.id));
  const atendidos = mios.filter(a => acuseDe(db, a.id, user.id));
  const lista = tab === "pendientes" ? pendientes : atendidos;

  const confirmar = async () => {
    setFirmando(true); setErr("");
    try {
      // El servidor fija usuario y hora; aquí solo se envía el aviso.
      await marcarEnterado(confirmando.id);
      setConfirmando(null);
      await recargar();
    } catch (e) { setErr("No se pudo registrar el acuse: " + e.message); }
    setFirmando(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Avisos y Circulares</h2>
        <p className="text-sm text-slate-500">Comunicados del plantel. Marca cada uno como enterado cuando lo hayas leído.</p>
      </div>

      <div className="flex gap-2">
        {[["pendientes", `Pendientes (${pendientes.length})`], ["atendidos", `Atendidos (${atendidos.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold ${tab === k ? "bg-[#1a2340] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{l}</button>
        ))}
        {!mostrarPush && soportaPush() && (
          <button onClick={() => setMostrarPush(true)}
            className="ml-auto text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1">
            <Bell size={13}/>Recibir avisos en mi celular
          </button>
        )}
      </div>

      {mostrarPush && <NotificacionesCelular user={user} />}

      {lista.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-400">
          {tab === "pendientes" ? "No tienes avisos pendientes. Todo al día. ✨" : "Todavía no has confirmado ningún aviso."}
        </Card>
      )}

      <div className="space-y-3">
        {lista.map(a => {
          const ac = acuseDe(db, a.id, user.id);
          const c = COLOR_PRIORIDAD[a.prioridad] || COLOR_PRIORIDAD.Normal;
          const vencido = avisoVencido(a) && !ac;
          return (
            <Card key={a.id} className={`p-5 border-l-4 ${c.borde}`}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <ChipPrioridad prioridad={a.prioridad} />
                <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{a.tipo}</span>
                {a.estado === "archived" && <span className="text-[11px] text-slate-400">· Archivado</span>}
              </div>
              <h3 className="font-bold text-base" style={{fontFamily:"'Archivo', sans-serif"}}>{a.titulo}</h3>
              <p className="text-xs text-slate-400 mb-3">
                Publicado: {a.fechaPublicacion ? new Date(a.fechaPublicacion).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
              </p>

              <TextoAviso texto={a.descripcion} />

              {a.archivoGuardado && esImagenAdjunta(a) && <ImagenAviso aviso={a} />}

              <div className="flex flex-wrap gap-3 mt-3">
                {a.archivoGuardado && !esImagenAdjunta(a) && <AdjuntoAviso aviso={a} />}
                {a.enlace && (
                  <a href={a.enlace} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-semibold hover:underline">
                    <Link2 size={15}/>Más información
                  </a>
                )}
              </div>

              {a.fechaLimite && (
                <p className={`text-xs mt-3 font-semibold ${vencido ? "text-rose-600" : "text-slate-500"}`}>
                  {vencido ? "🔴 Fecha límite vencida: " : "Fecha límite para enterarse: "}
                  {fmtFecha(a.fechaLimite)}
                </p>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100">
                {ac ? (
                  <p className="text-sm text-emerald-700 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={16}/>✓ Enterado · Confirmado el {new Date(ac.fecha).toLocaleString("es-MX")}
                  </p>
                ) : (
                  <button className={btnPrim} onClick={() => { setConfirmando(a); setErr(""); }}>
                    <ShieldCheck size={15}/>Marcar como enterado
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {confirmando && (
        <Modal titulo="Confirmar acuse de enterado" onClose={() => setConfirmando(null)}>
          <p className="text-sm text-slate-600">¿Confirmas que has leído y estás enterado de este aviso?</p>
          <p className="text-sm font-semibold mt-2">“{confirmando.titulo}”</p>
          <p className="text-xs text-slate-400 mt-2">Se registrará la fecha y hora del servidor. El acuse no puede deshacerse.</p>
          {err && <p className="text-sm text-rose-600 mt-2 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setConfirmando(null)}>Cancelar</button>
            <button className={btnPrim} disabled={firmando} onClick={confirmar}>
              {firmando && <Loader2 size={14} className="animate-spin"/>}Sí, estoy enterado
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ImagenAviso({ aviso }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true, creada = null;
    (async () => {
      const f = await leerArchivo("aviso_" + aviso.id);
      if (!f || !vivo) { if (vivo) setError(true); return; }
      const bytes = atob(f.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      creada = URL.createObjectURL(new Blob([arr], { type: f.mime }));
      setUrl(creada);
    })();
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [aviso.id]);

  if (error) return <AdjuntoAviso aviso={aviso} />;
  if (!url) return (
    <div className="mt-3 h-40 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-sm gap-2">
      <Loader2 size={16} className="animate-spin" /> Cargando imagen…
    </div>
  );
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-3" title="Abrir en tamaño completo">
      <img src={url} alt={aviso.archivoNombre || "Imagen del aviso"}
        className="max-h-96 w-auto rounded-xl border border-slate-200 hover:opacity-95 transition" />
    </a>
  );
}

function AdjuntoAviso({ aviso }) {
  const [abriendo, setAbriendo] = useState(false);
  const abrir = async () => {
    setAbriendo(true);
    const f = await leerArchivo("aviso_" + aviso.id);
    setAbriendo(false);
    if (!f) return;
    const bytes = atob(f.base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    window.open(URL.createObjectURL(new Blob([arr], { type: f.mime })), "_blank");
  };
  return (
    <button onClick={abrir} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-semibold hover:underline">
      {abriendo ? <Loader2 size={15} className="animate-spin"/> : <Paperclip size={15}/>}
      {aviso.archivoNombre || "Archivo adjunto"}
    </button>
  );
}

/* ================================================================
   VALIDACIONES (administrador)
   ================================================================ */

function Validaciones({ db, user, mutar }) {
  const [tab, setTab] = useState("constancias");
  const [revisando, setRevisando] = useState(null); // cert en revisión
  const [gradoRev, setGradoRev] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [soloPend, setSoloPend] = useState(true);

  const certs = db.certs
    .filter(c => !soloPend || ["pendiente_validacion", "procesando", "revision_docente"].includes(c.estado))
    .sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || ""));
  const grados = db.grados.filter(g => !soloPend || g.estado === "pendiente");
  const comps = db.comp.filter(g => !soloPend || g.estado === "pendiente");
  const nombreDe = (id) => db.users.find(u => u.id === id)?.nombre || "—";

  const validarCert = async (cert) => {
    let avisarAlCelular = null;
    await mutar(d => {
      const c = d.certs.find(x => x.id === cert.id);
      c.datos = cert.datos; // correcciones del admin
      c.estado = "validada"; c.validadoPor = user.nombre; c.validadoEn = ahora(); c.motivoRechazo = null;
      c.historial.push({ fecha: ahora(), accion: "Validada por la administración", por: user.nombre });
      notificar(d, c.docenteId, `✅ Tu constancia “${c.datos.curso}” fue validada. Se sumaron ${c.datos.horas || 0} horas a tu historial.`);
      registrarActividad(d, `Se validó la constancia “${c.datos.curso}” de ${nombreDe(c.docenteId)} (${c.datos.horas || 0} h).`);
      otorgarLogros(d, c.docenteId, c.ciclo);
      avisarAlCelular = { id: c.docenteId, ok: true, curso: c.datos.curso };
      const h = horasValidadas(d, c.docenteId, d.config.cicloActual);
      const m = metaDe(d, c.docenteId);
      if (h >= m) registrarActividad(d, `🎉 ${nombreDe(c.docenteId)} alcanzó ${h} horas y cumplió su meta del ciclo.`);
      else if (h >= 20 && h - (Number(c.datos.horas)||0) < 20) registrarActividad(d, `${nombreDe(c.docenteId)} alcanzó ${h} horas de capacitación.`);
    });
    if (avisarAlCelular) {
      enviarPush({
        destinatarios: [avisarAlCelular.id],
        titulo: "Constancia validada ✅",
        cuerpo: `“${avisarAlCelular.curso}” ya cuenta en tu historial.`,
        ruta: "cursos",
      });
    }
    setRevisando(null);
  };

  const rechazarCert = async (cert) => {
    if (!motivo.trim()) return;
    let avisarRechazo = null;
    await mutar(d => {
      const c = d.certs.find(x => x.id === cert.id);
      c.estado = "rechazada"; c.motivoRechazo = motivo.trim();
      c.historial.push({ fecha: ahora(), accion: `Rechazada · motivo: ${motivo.trim()}`, por: user.nombre });
      notificar(d, c.docenteId, `❌ Tu constancia “${c.datos.curso || c.archivoNombre}” fue rechazada. Motivo: ${motivo.trim()}`);
      avisarRechazo = { id: c.docenteId, curso: c.datos.curso || c.archivoNombre };
    });
    if (avisarRechazo) {
      enviarPush({
        destinatarios: [avisarRechazo.id],
        titulo: "Constancia rechazada",
        cuerpo: `“${avisarRechazo.curso}”. Revisa el motivo en Mis cursos.`,
        ruta: "cursos",
      });
    }
    setMotivo(""); setRevisando(null);
  };

  const eliminarCert = async (c) => {
    const eraValidada = c.estado === "validada";
    const aviso = eraValidada
      ? `Esta constancia está VALIDADA. Al eliminarla se restarán ${c.datos.horas || 0} horas del ciclo ${c.ciclo} de ${nombreDe(c.docenteId)}.\n\n¿Eliminar definitivamente?`
      : "¿Eliminar definitivamente este registro? Esta acción no se puede deshacer.";
    if (!window.confirm(aviso)) return;
    await mutar(d => {
      d.certs = d.certs.filter(x => x.id !== c.id);
      notificar(d, c.docenteId, `🗑️ La administración eliminó tu constancia “${c.datos.curso || c.archivoNombre}”${eraValidada ? ` y se restaron ${c.datos.horas || 0} horas de tu historial` : ""}.`);
      registrarActividad(d, `Se eliminó la constancia “${c.datos.curso || "sin título"}” de ${nombreDe(c.docenteId)}.`);
    });
    await eliminarArchivo(c.id);
    setRevisando(null);
  };

  const resolverGrado = async (item, coleccion, aprobar) => {
    if (!aprobar && !motivo.trim()) return;
    await mutar(d => {
      const g = d[coleccion].find(x => x.id === item.id);
      if (coleccion === "grados") g.datos = item.datos;
      g.estado = aprobar ? "validado" : "rechazado";
      g.motivoRechazo = aprobar ? null : motivo.trim();
      g.validadoEn = aprobar ? ahora() : null; g.validadoPor = user.nombre;
      const que = coleccion === "grados" ? `tu ${g.nivel}` : `“${g.nombre}”`;
      notificar(d, g.docenteId, aprobar ? `✅ Se validó ${que} en tu expediente académico.` : `❌ Se rechazó ${que}. Motivo: ${motivo.trim()}`);
    });
    setMotivo(""); setGradoRev(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Validaciones</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={soloPend} onChange={e => setSoloPend(e.target.checked)} /> Solo pendientes
        </label>
      </div>
      <div className="flex gap-2">
        {[["constancias", `Constancias (${certs.length})`], ["grados", `Grados académicos (${grados.length})`], ["comp", `Formación complementaria (${comps.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold ${tab === k ? "bg-[#1a2340] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{l}</button>
        ))}
      </div>

      {tab === "constancias" && (
        <Card className="p-4">
          {certs.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No hay constancias {soloPend ? "pendientes de validación" : "registradas"}. Todo al día. ✨</p>}
          {certs.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.datos.curso || <i className="text-slate-400">Sin título</i>}
                  {c.dupFlag && <span className="ml-2 text-[10px] font-bold text-amber-600">⚠️ Posible constancia duplicada</span>}
                </div>
                <div className="text-xs text-slate-500">{nombreDe(c.docenteId)} · {c.datos.horas ?? "?"} h · {c.datos.institucion || "—"} · ciclo {c.ciclo}</div>
              </div>
              <Badge estado={c.estado} />
              <VerArchivoBtn certId={c.id} guardado={c.archivoGuardado} />
              <button className={btnSec + " !px-3 !py-1.5"} onClick={() => { setRevisando(JSON.parse(JSON.stringify(c))); setMotivo(""); }}>Revisar</button>
              <button title="Eliminar constancia" className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                onClick={() => eliminarCert(c)}><Trash2 size={16} /></button>
            </div>
          ))}
        </Card>
      )}

      {(tab === "grados" || tab === "comp") && (
        <Card className="p-4">
          {(tab === "grados" ? grados : comps).length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Nada pendiente en esta sección.</p>}
          {(tab === "grados" ? grados : comps).map(g => (
            <div key={g.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{tab === "grados" ? `${g.nivel} · ${g.datos?.programa || "—"}` : `${g.tipo}: ${g.nombre}`}</div>
                <div className="text-xs text-slate-500">{nombreDe(g.docenteId)} · {(tab === "grados" ? g.datos?.institucion : g.institucion) || "—"}</div>
              </div>
              <Badge estado={g.estado} mapa={ESTADOS_GRADO} />
              <VerArchivoBtn certId={g.id} guardado={g.archivoGuardado} />
              <button className={btnSec + " !px-3 !py-1.5"} onClick={() => { setGradoRev({ item: JSON.parse(JSON.stringify(g)), coleccion: tab === "grados" ? "grados" : "comp" }); setMotivo(""); }}>Revisar</button>
            </div>
          ))}
        </Card>
      )}

      {revisando && (
        <Modal titulo={`Revisar constancia · ${nombreDe(revisando.docenteId)}`} onClose={() => setRevisando(null)} ancho="max-w-3xl">
          {revisando.dupFlag && <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2"><AlertTriangle size={16} className="shrink-0"/>Posible constancia duplicada: existe otro registro del mismo docente con curso, fecha, horas o folio coincidentes. Decide si procede validarla.</p>}
          <FormularioConstancia cert={revisando} onChange={setRevisando} />
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Historial de cambios</h4>
            {(revisando.historial || []).map((h, i) => <p key={i} className="text-xs text-slate-500">· {new Date(h.fecha).toLocaleString("es-MX")} — {h.accion} ({h.por})</p>)}
            {revisando.validadoPor && <p className="text-xs text-emerald-700 mt-1">Validada por {revisando.validadoPor} el {new Date(revisando.validadoEn).toLocaleString("es-MX")}</p>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 justify-between">
            <button className="text-rose-600 text-sm font-semibold inline-flex items-center gap-1.5" onClick={() => eliminarCert(revisando)}><Trash2 size={15}/>Eliminar registro</button>
            <div className="flex flex-wrap gap-2 items-center">
              <input className={inputCls + " !mt-0 !w-56"} placeholder="Motivo del rechazo…" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <button className={btnSec + " !text-rose-600 !border-rose-300"} disabled={!motivo.trim()} onClick={() => rechazarCert(revisando)}><XCircle size={15}/>Rechazar</button>
              <button className={btnPrim + " !bg-emerald-700 hover:!bg-emerald-800"} onClick={() => validarCert(revisando)}><ShieldCheck size={15}/>Validar y sumar horas</button>
            </div>
          </div>
        </Modal>
      )}

      {gradoRev && (
        <Modal titulo="Revisar documento académico" onClose={() => setGradoRev(null)} ancho="max-w-2xl">
          {gradoRev.coleccion === "grados" ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[["programa","Programa"],["institucion","Institución"],["campus","Campus"],["pais","País"],["inicio","Inicio"],["fin","Terminación"],["titulacion","Año de titulación"],["cedula","Cédula profesional"],["numTitulo","Número de título"]].map(([k,l]) => (
                <Campo key={k} label={l}><input className={inputCls} value={gradoRev.item.datos?.[k] ?? ""} onChange={e => setGradoRev(g => ({ ...g, item: { ...g.item, datos: { ...g.item.datos, [k]: e.target.value || null } } }))} /></Campo>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">{gradoRev.item.tipo}: <b>{gradoRev.item.nombre}</b> · {gradoRev.item.institucion || "—"} · {fmtFecha(gradoRev.item.fecha)} {gradoRev.item.duracion ? `· ${gradoRev.item.duracion}` : ""}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2 justify-end items-center">
            <input className={inputCls + " !mt-0 !w-56"} placeholder="Motivo del rechazo…" value={motivo} onChange={e => setMotivo(e.target.value)} />
            <button className={btnSec + " !text-rose-600 !border-rose-300"} disabled={!motivo.trim()} onClick={() => resolverGrado(gradoRev.item, gradoRev.coleccion, false)}>Rechazar</button>
            <button className={btnPrim + " !bg-emerald-700 hover:!bg-emerald-800"} onClick={() => resolverGrado(gradoRev.item, gradoRev.coleccion, true)}>Validar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   GESTIÓN DE DOCENTES (administrador)
   ================================================================ */

function Docentes({ db, mutar, irA, esAdmin = true }) {
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errAlta, setErrAlta] = useState("");
  const [orden, setOrden] = useState("az");
  const [qD, setQD] = useState("");
  const [respaldando, setRespaldando] = useState(null);

  /* Orden por APELLIDO: en México se usan dos apellidos al final del
     nombre, así que se toman las dos últimas palabras. Con nombres
     compuestos ("Yahaira Aracely Domínguez Tello") esto acierta, mientras
     que tomar todo menos la primera palabra fallaría. */
  const claveApellido = (n) => {
    const ps = (n || "").trim().split(/\s+/);
    if (ps.length <= 1) return n || "";
    const apellidos = ps.length >= 3 ? ps.slice(-2) : ps.slice(-1);
    const nombres = ps.slice(0, ps.length - apellidos.length);
    return apellidos.join(" ") + " " + nombres.join(" ");
  };
  const cmp = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });

  const docentes = db.users.filter(u => u.rol === "docente")
    .filter(u => !qD || normTexto(u.nombre).includes(normTexto(qD))
      || normTexto(u.email).includes(normTexto(qD))
      || normTexto(u.area || "").includes(normTexto(qD)))
    .sort((a, b) => {
      if (orden === "az") return cmp(a.nombre || "", b.nombre || "");
      if (orden === "za") return cmp(b.nombre || "", a.nombre || "");
      if (orden === "apellido") return cmp(claveApellido(a.nombre), claveApellido(b.nombre));
      if (orden === "area") return cmp(a.area || "zzz", b.area || "zzz") || cmp(a.nombre || "", b.nombre || "");
      if (orden === "expediente") return completitudExpediente(db, a.id).pct - completitudExpediente(db, b.id).pct;
      return 0;
    });

  // Respaldo del expediente de un solo docente
  const respaldarDocente = async (u) => {
    setRespaldando(u.id);
    try { await generarRespaldoDocente(db, u); }
    catch (e) { alert("No se pudo generar el respaldo: " + e.message); }
    setRespaldando(null);
  };

  const guardar = async () => {
    const e = editando;
    if (!e.nombre.trim() || !e.email.trim()) return;
    setGuardando(true); setErrAlta("");
    try {
      if (e.id) {
        const original = db.users.find(x => x.id === e.id);
        if (e.email.trim() !== original.email) {
          await cambiarEmailDocente({ id: e.id, email: e.email.trim() });
        }
        if (e.nuevaPass) {
          await restablecerPassword({ id: e.id, password: e.nuevaPass });
        }
        await mutar(d => {
          const u = d.users.find(x => x.id === e.id);
          Object.assign(u, { nombre: e.nombre, email: e.email.trim(), area: e.area, asignaturas: e.asignaturas });
        });
      } else {
        // Crea la cuenta real (correo + contraseña) mediante la función Edge
        const creado = await crearDocente({
          email: e.email.trim(), password: e.nuevaPass || "docente123",
          nombre: e.nombre, area: e.area || "", asignaturas: e.asignaturas || "",
        });
        await mutar(d => {
          const u = d.users.find(x => x.id === creado.id);
          if (u) Object.assign(u, { nombre: e.nombre, area: e.area || "", asignaturas: e.asignaturas || "", creadoEn: ahora() });
          else d.users.push({ id: creado.id, nombre: e.nombre, email: e.email.trim(), rol: "docente", area: e.area || "", asignaturas: e.asignaturas || "", activo: true, creadoEn: ahora() });
          registrarActividad(d, `Se dio de alta al docente ${e.nombre}.`);
        });
      }
      setEditando(null);
    } catch (err) {
      setErrAlta(err.message);
    }
    setGuardando(false);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>{esAdmin ? "Docentes" : "Expedientes docentes"}</h2>
        {esAdmin && <button className={btnPrim} onClick={() => setEditando({ nombre: "", email: "", area: "", asignaturas: "", nuevaPass: "" })}><Plus size={15}/>Agregar docente</button>}
      </div>
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 items-center pb-3 mb-1 border-b border-slate-100">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputCls + " !mt-0 !pl-8"} placeholder="Buscar docente…" value={qD} onChange={e => setQD(e.target.value)} />
          </div>
          <select className={inputCls + " !mt-0 !w-auto"} value={orden} onChange={e => setOrden(e.target.value)}>
            <option value="az">A – Z por nombre</option>
            <option value="za">Z – A por nombre</option>
            <option value="apellido">A – Z por apellido</option>
            <option value="area">Por área</option>
            <option value="expediente">Expediente menos completo</option>
          </select>
          <span className="text-xs text-slate-400">{docentes.length}</span>
        </div>
        {docentes.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No hay docentes que coincidan.</p>}
        {docentes.map(u => {
          const exp = completitudExpediente(db, u.id);
          return (
            <div key={u.id} className={`flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 ${!u.activo ? "opacity-50" : ""}`}>
              <div className="w-9 h-9 rounded-full bg-[#1a2340] text-white flex items-center justify-center text-sm font-bold shrink-0">{u.nombre.split(" ").map(p=>p[0]).slice(0,2).join("")}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{u.nombre} {!u.activo && <span className="text-[10px] font-bold text-rose-500">DESACTIVADO</span>}</div>
                <div className="text-xs text-slate-500 truncate">{u.email} · {u.area || "Sin área"} · Expediente {exp.pct}%</div>
              </div>
              <button className={btnSec + " !px-3 !py-1.5"} onClick={() => irA("expediente_docente", u.id)}><FolderOpen size={14}/>Expediente</button>
              {esAdmin && <>
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Respaldar expediente en ZIP"
                  disabled={respaldando === u.id} onClick={() => respaldarDocente(u)}>
                  {respaldando === u.id ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>}
                </button>
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar" onClick={() => setEditando({ ...u, nuevaPass: "" })}><Pencil size={15}/></button>
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title={u.activo ? "Desactivar" : "Reactivar"}
                  onClick={() => mutar(d => { const x = d.users.find(y => y.id === u.id); x.activo = !x.activo; })}>
                  {u.activo ? <XCircle size={15}/> : <CheckCircle2 size={15}/>}
                </button>
              </>}
            </div>
          );
        })}
      </Card>
      {editando && (
        <Modal titulo={editando.id ? "Editar docente" : "Agregar docente"} onClose={() => setEditando(null)}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo label="Nombre completo"><input className={inputCls} value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} /></Campo>
            <Campo label="Correo institucional"><input className={inputCls} type="email" value={editando.email} onChange={e => setEditando({ ...editando, email: e.target.value })} /></Campo>
            <Campo label="Área o academia"><input className={inputCls} value={editando.area || ""} onChange={e => setEditando({ ...editando, area: e.target.value })} /></Campo>
            <Campo label="Asignatura(s) que imparte"><input className={inputCls} value={editando.asignaturas || ""} onChange={e => setEditando({ ...editando, asignaturas: e.target.value })} /></Campo>
            <Campo label={editando.id ? "Nueva contraseña (opcional)" : "Contraseña inicial"}><input className={inputCls} value={editando.nuevaPass} onChange={e => setEditando({ ...editando, nuevaPass: e.target.value })} placeholder={editando.id ? "Dejar en blanco para no cambiar" : "docente123"} /></Campo>
          </div>
          {errAlta && <p className="text-sm text-rose-600 mt-3 flex items-center gap-1.5"><AlertTriangle size={14} />{errAlta}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            <button className={btnPrim} disabled={guardando} onClick={guardar}>
              {guardando && <Loader2 size={14} className="animate-spin" />}Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   PERFIL ACADÉMICO DEL DOCENTE (expediente)
   ================================================================ */

function PerfilAcademico({ db, user, docenteId, mutar, editable }) {
  const docente = db.users.find(u => u.id === docenteId);
  const [subiendo, setSubiendo] = useState(null); // { nivel } o { comp:true }
  const [form, setForm] = useState(null);
  const [procesandoIA, setProcesandoIA] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef();
  const exp = completitudExpediente(db, docenteId);
  const gradoDe = (nivel) => db.grados.find(g => g.docenteId === docenteId && g.nivel === nivel);
  const misComp = db.comp.filter(c => c.docenteId === docenteId);

  const cargarDoc = async (file) => {
    if (!file) return;
    const permitidos = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!permitidos.includes(file.type)) { setErr("Formatos permitidos: PDF, JPG, JPEG o PNG."); return; }
    setErr(""); setProcesandoIA(true);
    try {
      const base64 = await leerComoBase64(file);
      const id = uid();
      const guardado = await guardarArchivo(id, base64, file.type, file.name);
      let datos = {}, fallo = false;
      try { datos = await extraerConIA({ base64, mime: file.type === "image/jpg" ? "image/jpeg" : file.type, tipo: "titulo" }); }
      catch { fallo = true; }
      if (subiendo.comp) {
        setForm({ id, comp: true, archivoGuardado: guardado.guardado, archivoNombre: file.name, tipo: "Diplomado",
          nombre: datos.programa || "", institucion: datos.institucion || "", fecha: datos.fecha_expedicion || "", duracion: "" , iaFallo: fallo });
      } else {
        setForm({ id, nivel: subiendo.nivel, archivoGuardado: guardado.guardado, archivoNombre: file.name, iaFallo: fallo,
          datos: { programa: datos.programa ?? null, institucion: datos.institucion ?? null, campus: datos.campus ?? null,
            pais: datos.pais ?? null, inicio: datos.fecha_terminacion ? null : null, fin: datos.fecha_terminacion ?? null,
            titulacion: (datos.fecha_expedicion || "").slice(0, 4) || null, cedula: datos.cedula ?? null, numTitulo: datos.num_titulo ?? null },
          detectados: Object.entries(datos).filter(([_, v]) => v !== null && v !== "").map(([k]) => k) });
      }
    } catch (e) { setErr("No se pudo procesar el documento: " + e.message); }
    setProcesandoIA(false);
  };

  const enviarGrado = async () => {
    await mutar(d => {
      d.grados = d.grados.filter(g => !(g.docenteId === docenteId && g.nivel === form.nivel)); // reemplaza registro previo
      d.grados.push({ id: form.id, docenteId, nivel: form.nivel, datos: form.datos, archivoGuardado: form.archivoGuardado,
        archivoNombre: form.archivoNombre, estado: "pendiente", cargadoEn: ahora(), motivoRechazo: null });
      d.users.filter(u => esRolValidador(u.rol) && u.activo).forEach(a => notificar(d, a.id, `🎓 ${docente.nombre} cargó su ${form.nivel} para validación.`));
      registrarActividad(d, `${docente.nombre} registró su ${form.nivel}.`);
    });
    setForm(null); setSubiendo(null);
  };

  const enviarComp = async () => {
    if (!form.nombre.trim()) { setErr("Escribe el nombre del estudio."); return; }
    await mutar(d => {
      d.comp.push({ id: form.id, docenteId, tipo: form.tipo, nombre: form.nombre, institucion: form.institucion,
        fecha: form.fecha || null, duracion: form.duracion || null, archivoGuardado: form.archivoGuardado,
        archivoNombre: form.archivoNombre, estado: "pendiente", cargadoEn: ahora() });
      d.users.filter(u => esRolValidador(u.rol) && u.activo).forEach(a => notificar(d, a.id, `📜 ${docente.nombre} registró formación complementaria: ${form.nombre}.`));
    });
    setForm(null); setSubiendo(null); setErr("");
  };

  const iconoEstado = (g) => {
    if (!g) return <span className="text-slate-300">○</span>;
    if (g.estado === "validado") return <span className="text-emerald-600">✓</span>;
    if (g.estado === "rechazado") return <span className="text-rose-500">✕</span>;
    return <span className="text-amber-500">◐</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mi perfil académico</h2>
        <div className="text-sm font-semibold px-3 py-1.5 rounded-xl bg-white border border-slate-200">
          Expediente docente: <span className={exp.pct === 100 ? "text-emerald-600" : "text-[#E8871E]"}>{exp.pct}%</span>
        </div>
      </div>

      {/* Perfil profesional */}
      <Card className="p-5">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><User size={16}/>Perfil profesional</h3>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><span className="text-slate-400 text-xs block">Nombre</span>{docente.nombre}</div>
          <div><span className="text-slate-400 text-xs block">Correo institucional</span>{docente.email}</div>
          <div><span className="text-slate-400 text-xs block">Área / academia</span>{docente.area || "—"}</div>
          <div><span className="text-slate-400 text-xs block">Asignaturas</span>{docente.asignaturas || "—"}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {exp.partes.map(p => (
            <span key={p.nombre} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
              {p.ok ? "✓" : "—"} {p.nombre}{!p.cuenta && <span className="font-normal opacity-70"> · no cuenta</span>}
            </span>
          ))}
        </div>
      </Card>

      {/* Línea de formación */}
      <Card className="p-5">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><GraduationCap size={16}/>Formación académica</h3>
        <div className="space-y-1">
          {NIVELES.map((nivel, i) => {
            const g = gradoDe(nivel);
            return (
              <React.Fragment key={nivel}>
                {i > 0 && <div className="ml-3.5 h-4 border-l-2 border-slate-200" />}
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full border-2 border-slate-300 flex items-center justify-center text-sm font-bold bg-white shrink-0">{iconoEstado(g)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm">{nivel}</span>
                      {g && <Badge estado={g.estado} mapa={ESTADOS_GRADO} />}
                      {!g && <span className="text-xs text-slate-400">Sin registrar</span>}
                    </div>
                    {g && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {g.datos?.programa || "Programa por confirmar"} · {g.datos?.institucion || "—"} {g.datos?.titulacion ? `· ${g.datos.titulacion}` : ""}
                        {g.estado === "rechazado" && g.motivoRechazo && <span className="block text-rose-600">Motivo del rechazo: {g.motivoRechazo}</span>}
                      </div>
                    )}
                  </div>
                  {editable && (!g || g.estado === "rechazado") && (
                    <button className={btnSec + " !px-3 !py-1.5 shrink-0"} onClick={() => { setSubiendo({ nivel }); setForm(null); setErr(""); }}>
                      <Upload size={13}/>{g ? "Volver a subir" : "Subir documento"}
                    </button>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Formación complementaria */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm flex items-center gap-2"><Star size={16}/>Formación complementaria</h3>
          {editable && <button className={btnSec + " !px-3 !py-1.5"} onClick={() => { setSubiendo({ comp: true }); setForm(null); setErr(""); }}><Plus size={13}/>Agregar</button>}
        </div>
        <p className="text-xs text-slate-400 mb-2">Especialidades, diplomados y certificaciones. No se contabilizan como grados académicos.</p>
        {misComp.length === 0 && <p className="text-sm text-slate-400 py-2">Sin registros todavía.</p>}
        {misComp.map(c => (
          <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase w-24 shrink-0">{c.tipo}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{c.nombre}</div>
              <div className="text-xs text-slate-500">{c.institucion || "—"} · {fmtFecha(c.fecha)} {c.duracion ? `· ${c.duracion}` : ""}</div>
            </div>
            <Badge estado={c.estado} mapa={ESTADOS_GRADO} />
            <VerArchivoBtn certId={c.id} guardado={c.archivoGuardado} />
          </div>
        ))}
      </Card>

      {/* Modal de carga */}
      {subiendo && (
        <Modal titulo={subiendo.comp ? "Agregar formación complementaria" : `Subir documento de ${subiendo.nivel}`} onClose={() => { setSubiendo(null); setForm(null); }}>
          {!form && (
            <div className="text-center py-4">
              <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => cargarDoc(e.target.files[0])} />
              {procesandoIA
                ? <div className="py-6"><Loader2 size={28} className="mx-auto animate-spin text-[#E8871E] mb-2" /><p className="text-sm">La IA está leyendo el documento…</p></div>
                : <>
                    <p className="text-sm text-slate-600 mb-3">{subiendo.comp ? "Sube el documento acreditativo (opcional pero recomendado)." : `Sube el ${subiendo.nivel === "Licenciatura" ? "título" : "grado"} en PDF, JPG, JPEG o PNG. La IA extraerá los datos para que los revises.`}</p>
                    <button className={btnPrim} onClick={() => inputRef.current.click()}><Upload size={15}/>Elegir archivo</button>
                    {subiendo.comp && <button className={btnSec + " ml-2"} onClick={() => setForm({ id: uid(), comp: true, tipo: "Diplomado", nombre: "", institucion: "", fecha: "", duracion: "", archivoGuardado: false })}>Capturar sin documento</button>}
                  </>}
              {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
            </div>
          )}
          {form && !form.comp && (
            <div className="space-y-3">
              {form.iaFallo ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">La IA no pudo leer este documento; captura los datos manualmente.</p>
                : <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">Revisa los datos detectados. Los campos vacíos no aparecieron en el documento: la IA no inventa información.</p>}
              <div className="grid sm:grid-cols-2 gap-3">
                {[["programa","Nombre del programa"],["institucion","Institución educativa"],["campus","Campus (si aplica)"],["pais","País"],["inicio","Año/fecha de inicio"],["fin","Año/fecha de terminación"],["titulacion","Año de titulación / grado"],["cedula","Cédula profesional (si existe)"],["numTitulo","Número de título (si aparece)"]].map(([k,l]) => (
                  <Campo key={k} label={l}><input className={inputCls} value={form.datos[k] ?? ""} onChange={e => setForm(f => ({ ...f, datos: { ...f.datos, [k]: e.target.value || null } }))} /></Campo>
                ))}
              </div>
              <div className="flex justify-end gap-2"><button className={btnSec} onClick={() => setForm(null)}>Atrás</button>
                <button className={btnPrim} onClick={enviarGrado}>Enviar a validación</button></div>
            </div>
          )}
          {form && form.comp && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo label="Tipo"><select className={inputCls} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                  {["Especialidad","Diplomado","Certificación","Otro estudio"].map(t => <option key={t}>{t}</option>)}</select></Campo>
                <Campo label="Nombre"><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></Campo>
                <Campo label="Institución"><input className={inputCls} value={form.institucion} onChange={e => setForm({ ...form, institucion: e.target.value })} /></Campo>
                <Campo label="Fecha"><input className={inputCls} type="date" value={form.fecha || ""} onChange={e => setForm({ ...form, fecha: e.target.value })} /></Campo>
                <Campo label="Duración (si aplica)"><input className={inputCls} value={form.duracion || ""} onChange={e => setForm({ ...form, duracion: e.target.value })} placeholder="p. ej. 120 horas" /></Campo>
              </div>
              {err && <p className="text-sm text-rose-600">{err}</p>}
              <div className="flex justify-end gap-2"><button className={btnSec} onClick={() => setForm(null)}>Atrás</button>
                <button className={btnPrim} onClick={enviarComp}>Enviar a validación</button></div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   EXPEDIENTE INTEGRAL (vista del administrador)
   ================================================================ */

function ExpedienteIntegral({ db, docenteId, mutar, user, volver }) {
  const [tab, setTab] = useState("academica");
  const d = db.users.find(u => u.id === docenteId);
  if (!d) return <p>Docente no encontrado.</p>;
  const ciclo = db.config.cicloActual;
  const h = horasValidadas(db, docenteId, ciclo);
  const meta = metaDe(db, docenteId);
  const pos = rankingDe(db, ciclo).findIndex(r => r.id === docenteId) + 1;
  const exp = completitudExpediente(db, docenteId);
  const certs = db.certs.filter(c => c.docenteId === docenteId);
  return (
    <div className="space-y-4">
      <button className="text-sm text-indigo-600 font-semibold" onClick={volver}>← Volver a docentes</button>
      <Card className="p-5 flex flex-wrap items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[#1a2340] text-white flex items-center justify-center text-xl font-bold">{d.nombre.split(" ").map(p=>p[0]).slice(0,2).join("")}</div>
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-lg font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>{d.nombre}</h2>
          <p className="text-sm text-slate-500">{d.area || "Sin área"} · {d.asignaturas || "Sin asignaturas"} · {d.email}</p>
        </div>
        <div className="text-center px-4"><div className="text-xl font-bold">{exp.pct}%</div><div className="text-[11px] text-slate-400">Expediente</div></div>
        <div className="text-center px-4"><div className="text-xl font-bold">{h}/{meta}</div><div className="text-[11px] text-slate-400">Horas ciclo</div></div>
        <div className="text-center px-4"><div className="text-xl font-bold">{pos > 0 ? "#" + pos : "—"}</div><div className="text-[11px] text-slate-400">Ranking</div></div>
      </Card>
      <div className="flex gap-2">
        <button onClick={() => setTab("academica")} className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold ${tab === "academica" ? "bg-[#1a2340] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Formación académica</button>
        <button onClick={() => setTab("capacitacion")} className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold ${tab === "capacitacion" ? "bg-[#1a2340] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Capacitación docente</button>
      </div>
      {tab === "academica" && <PerfilAcademico db={db} user={user} docenteId={docenteId} mutar={mutar} editable={false} />}
      {tab === "capacitacion" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icono={BookOpen} label="Cursos validados" valor={certs.filter(c => c.estado === "validada").length} />
            <Stat icono={Clock} label="Horas del ciclo" valor={h} />
            <Stat icono={FileCheck} label="Horas pendientes" valor={horasPendientes(db, docenteId, ciclo)} />
            <Stat icono={Award} label="Insignias del ciclo" valor={db.logros.filter(l => l.docenteId === docenteId && l.clave.endsWith("@" + ciclo)).length} />
          </div>
          <Card className="p-5"><Progreso actual={h} meta={meta} semaforo={semaforoDe(db, meta ? Math.round(100*h/meta) : 0)} /></Card>
          <Card className="p-4"><h3 className="font-bold text-sm mb-2">Constancias</h3><TablaCursos certs={certs} db={db} /></Card>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   REPORTES
   ================================================================ */

function Reportes({ db, dentroDeTablero = false }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const docentes = db.users.filter(u => u.rol === "docente");
  const nombreDe = (id) => docentes.find(u => u.id === id)?.nombre || "—";
  const certsC = certsDeCiclo(db.certs, ciclo).filter(c => c.estado === "validada");

  const filasGeneral = () => [["Docente","Curso","Institución","Horas","Categoría","Fecha término","Folio","Ciclo","Validado por","Fecha de validación"],
    ...certsC.map(c => [nombreDe(c.docenteId), c.datos.curso, c.datos.institucion, c.datos.horas, c.datos.categoria, c.datos.fecha_termino, c.datos.folio, c.ciclo, c.validadoPor, c.validadoEn?.slice(0,10)])];

  const filasResumen = () => [["Docente","Área","Cursos validados","Horas validadas","Meta","% cumplimiento","Estado"],
    ...docentes.map(d => { const h = horasValidadas(db, d.id, ciclo); const m = metaDe(db, d.id);
      const pct = m ? Math.round(100*h/m) : 0;
      return [d.nombre, d.area, certsC.filter(c => c.docenteId === d.id).length, h, m, pct + "%", pct >= 100 ? "Meta alcanzada" : pct >= db.config.semAmarillo ? "En proceso" : "Bajo cumplimiento"]; })];

  const filasCategoria = () => [["Categoría","Cursos","Horas totales"],
    ...CATEGORIAS.map(cat => { const cs = certsC.filter(c => c.datos.categoria === cat);
      return [cat, cs.length, cs.reduce((s, c) => s + (Number(c.datos.horas)||0), 0)]; }).filter(f => f[1] > 0)];

  const filasRanking = () => [["Posición","Docente","Horas validadas"],
    ...rankingDe(db, ciclo).map((r, i) => [i + 1, r.nombre, r.horas])];

  const filasMeta = (cumple) => [["Docente","Área","Horas","Meta","% cumplimiento"],
    ...docentes.map(d => { const h = horasValidadas(db, d.id, ciclo); const m = metaDe(db, d.id); return { d, h, m, pct: m ? Math.round(100*h/m) : 0 }; })
      .filter(x => cumple ? x.pct >= 100 : x.pct < 100)
      .map(x => [x.d.nombre, x.d.area, x.h, x.m, x.pct + "%"])];

  const aHtml = (filas) => `<table><tr>${filas[0].map(h => `<th>${h ?? ""}</th>`).join("")}</tr>${filas.slice(1).map(f => `<tr>${f.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</table>`;

  const reportes = [
    { nombre: "Reporte general de capacitación", filas: filasGeneral },
    { nombre: "Resumen individual por docente", filas: filasResumen },
    { nombre: "Reporte por categoría", filas: filasCategoria },
    { nombre: "Ranking de capacitación", filas: filasRanking },
    { nombre: "Docentes que ya cumplieron la meta", filas: () => filasMeta(true) },
    { nombre: "Docentes que aún no cumplen la meta", filas: () => filasMeta(false) },
  ];

  return (
    <div className="space-y-4">
      <div className={"flex flex-wrap items-center justify-between gap-3" + (dentroDeTablero ? " pt-2 border-t border-slate-200 mt-2" : "")}>
        <h2 className={dentroDeTablero ? "text-lg font-bold" : "text-xl font-bold"} style={{fontFamily:"'Archivo', sans-serif"}}>
          Reportes de capacitación
        </h2>
        <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
          {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          <option value="historico">Histórico</option>
        </select>
      </div>
      <p className="text-sm text-slate-500">Incluyen únicamente constancias validadas. El CSV abre en Excel; el botón PDF abre la vista de impresión para guardar como PDF.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {reportes.map(r => (
          <Card key={r.nombre} className="p-4 flex items-center gap-3">
            <FileText size={20} className="text-slate-400 shrink-0" />
            <span className="flex-1 text-sm font-medium">{r.nombre}</span>
            <button className={btnSec + " !px-3 !py-1.5"} onClick={() => descargarCSV(r.nombre.replace(/\s+/g, "_") + `_${ciclo}.csv`, r.filas())}><Download size={13}/>CSV / Excel</button>
            <button className={btnSec + " !px-3 !py-1.5"} onClick={() => imprimirReporte(`${r.nombre} · ${ciclo === "historico" ? "Histórico" : "Ciclo " + ciclo}`, aHtml(r.filas()))}>PDF</button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   PERFIL ACADÉMICO INSTITUCIONAL (administrador)
   ================================================================ */

function PerfilInstitucional({ db }) {
  const [area, setArea] = useState("todas");
  const docentes = db.users.filter(u => u.rol === "docente" && u.activo)
    .filter(d => area === "todas" || d.area === area);
  const areas = [...new Set(db.users.filter(u => u.rol === "docente").map(u => u.area).filter(Boolean))];
  // Grado máximo validado de cada docente: se cuenta una sola vez, en su
  // nivel más alto (quien tiene doctorado no suma también en licenciatura).
  const gradoMaximo = (docenteId) => {
    for (const nivel of [...NIVELES].reverse()) {
      if (db.grados.some(g => g.docenteId === docenteId && g.nivel === nivel && g.estado === "validado")) return nivel;
    }
    return "Sin grado validado";
  };
  const maximos = docentes.map(d => gradoMaximo(d.id));
  const con = (nivel) => maximos.filter(m => m === nivel).length;
  const conComp = docentes.filter(d => db.comp.some(c => c.docenteId === d.id && c.estado === "validado")).length;
  const completos = docentes.filter(d => completitudExpediente(db, d.id).pct === 100).length;
  const dist = [...NIVELES, "Sin grado validado"]
    .map(n => ({ name: n, value: maximos.filter(m => m === n).length }))
    .filter(x => x.value > 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Perfil académico institucional</h2>
        <select className={inputCls + " !mt-0 !w-auto"} value={area} onChange={e => setArea(e.target.value)}>
          <option value="todas">Todas las áreas</option>{areas.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icono={GraduationCap} label="Máximo grado: licenciatura" valor={con("Licenciatura")} />
        <Stat icono={GraduationCap} label="Máximo grado: maestría" valor={con("Maestría")} />
        <Stat icono={GraduationCap} label="Máximo grado: doctorado" valor={con("Doctorado")} />
        <Stat icono={Star} label="Con formación complementaria" valor={conComp} />
        <Stat icono={FolderOpen} label="Expedientes completos" valor={docentes.length ? Math.round(100 * completos / docentes.length) + "%" : "—"} sub={`${completos} de ${docentes.length}`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-1">Distribución por grado máximo</h3>
          <p className="text-[11px] text-slate-400 mb-2">Cada docente se cuenta una sola vez, en su nivel de estudios más alto.</p>
          {dist.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">Aún no hay docentes registrados.</p> :
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={dist} dataKey="value" nameKey="name" outerRadius={80} label>
              {dist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}</Pie><Tooltip /><Legend wrapperStyle={{fontSize:11}}/></PieChart>
          </ResponsiveContainer>}
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-2">Completitud de expedientes</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {docentes.map(d => {
              const e = completitudExpediente(db, d.id);
              return (
                <div key={d.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate">{d.nombre}</span>
                  <div className="w-28 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-[#1a2340]" style={{ width: e.pct + "%" }} /></div>
                  <span className="w-10 text-right text-xs font-bold">{e.pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================
   ACTIVIDAD RECIENTE
   ================================================================ */

function ActividadReciente({ db }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Actividad reciente</h2>
      <Card className="p-4">
        {db.activity.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">La actividad de la escuela se registrará aquí conforme el sistema se use.</p>}
        {db.activity.map(a => (
          <div key={a.id} className="flex gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <Activity size={15} className="text-[#E8871E] mt-0.5 shrink-0" />
            <div className="text-sm text-slate-700">{a.texto}
              <span className="block text-[11px] text-slate-400">{new Date(a.fecha).toLocaleString("es-MX")}</span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ================================================================
   ADMINISTRACIÓN Y CONFIGURACIÓN
   ================================================================ */

function Administracion({ db, user, mutar, esAdmin = true }) {
  const cfg = db.config;
  const [meta, setMeta] = useState(cfg.metaAnual);
  const [verde, setVerde] = useState(cfg.semVerde);
  const [amarillo, setAmarillo] = useState(cfg.semAmarillo);
  const [nuevoCiclo, setNuevoCiclo] = useState("");
  const [msg, setMsg] = useState("");
  const docentes = db.users.filter(u => u.rol === "docente");

  const guardarGeneral = () => mutar(d => {
    d.config.metaAnual = Number(meta) || 0;
    d.config.semVerde = Number(verde) || 100;
    d.config.semAmarillo = Number(amarillo) || 60;
  }).then(() => setMsg("Configuración guardada."));

  const agregarCiclo = () => {
    if (!/^\d{4}-\d{4}$/.test(nuevoCiclo.trim())) { setMsg("Escribe el ciclo con formato 2026-2027."); return; }
    mutar(d => { if (!d.config.ciclos.includes(nuevoCiclo.trim())) d.config.ciclos.push(nuevoCiclo.trim()); });
    setNuevoCiclo("");
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Administración</h2>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{msg}</p>}

      <Card className="p-5 space-y-3">
        <h3 className="font-bold text-sm">Metas y semáforo</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo label="Meta anual de horas (general)"><input className={inputCls} type="number" value={meta} onChange={e => setMeta(e.target.value)} /></Campo>
          <Campo label="Verde desde (% de la meta)"><input className={inputCls} type="number" value={verde} onChange={e => setVerde(e.target.value)} /></Campo>
          <Campo label="Amarillo desde (% de la meta)"><input className={inputCls} type="number" value={amarillo} onChange={e => setAmarillo(e.target.value)} /></Campo>
        </div>
        <p className="text-xs text-slate-400">Debajo del umbral amarillo, el docente aparece en rojo (bajo cumplimiento).</p>
        <button className={btnPrim} onClick={guardarGeneral}>Guardar</button>
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="font-bold text-sm">Metas individuales por docente (opcional)</h3>
        {docentes.length === 0 && <p className="text-sm text-slate-400">Agrega docentes para configurar metas individuales.</p>}
        {docentes.map(d => (
          <div key={d.id} className="flex items-center gap-3 text-sm">
            <span className="flex-1 truncate">{d.nombre}</span>
            <input className={inputCls + " !mt-0 !w-24"} type="number" placeholder={String(cfg.metaAnual)}
              value={cfg.metasPorDocente[d.id] ?? ""}
              onChange={e => mutar(x => { const v = e.target.value; if (v === "") delete x.config.metasPorDocente[d.id]; else x.config.metasPorDocente[d.id] = Number(v); })} />
            <span className="text-xs text-slate-400">horas</span>
          </div>
        ))}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-bold text-sm">Ciclos escolares</h3>
        <div className="flex flex-wrap gap-2 items-center">
          {cfg.ciclos.map(c => (
            <button key={c} onClick={() => mutar(d => { d.config.cicloActual = c; })}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${cfg.cicloActual === c ? "bg-[#1a2340] text-white border-[#1a2340]" : "bg-white border-slate-300 text-slate-600"}`}>
              {c}{cfg.cicloActual === c && " · actual"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls + " !mt-0 !w-40"} placeholder="2026-2027" value={nuevoCiclo} onChange={e => setNuevoCiclo(e.target.value)} />
          <button className={btnSec} onClick={agregarCiclo}><Plus size={14}/>Agregar ciclo</button>
        </div>
        <p className="text-xs text-slate-400">
          El ciclo escolar corre de <b>agosto a julio</b>. Cada constancia se registra
          automáticamente en el ciclo que le corresponde según la fecha del curso, sin importar
          cuándo se suba al sistema. El ciclo marcado como actual es el que se usa en los
          tableros y el ranking.
        </p>
        {cicloDeFecha() !== cfg.cicloActual && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <AlertTriangle size={14} />
            Por la fecha de hoy, el ciclo en curso es <b>{cicloDeFecha()}</b>.
            <button className="underline font-semibold" onClick={() => mutar(d => {
              if (!d.config.ciclos.includes(cicloDeFecha())) d.config.ciclos.push(cicloDeFecha());
              d.config.cicloActual = cicloDeFecha();
            })}>Cambiar al ciclo {cicloDeFecha()}</button>
          </div>
        )}
      </Card>

      {esAdmin && (
        <Card className="p-5 space-y-3">
          <h3 className="font-bold text-sm">Visibilidad y reglas</h3>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={cfg.rankingPublico} onChange={e => mutar(d => { d.config.rankingPublico = e.target.checked; })} />
            Mostrar el ranking públicamente a los docentes
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={cfg.perfilObligatorio} onChange={e => mutar(d => { d.config.perfilObligatorio = e.target.checked; })} />
            Perfil académico obligatorio antes de registrar capacitaciones
          </label>
        </Card>
      )}

      {esAdmin && <JefesDepartamento db={db} mutar={mutar} />}

      <NotificacionesCelular user={user} />
      <MiCuenta user={user} soloTarjeta />
    </div>
  );
}
