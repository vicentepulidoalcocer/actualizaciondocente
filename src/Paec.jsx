/* ================================================================
   PAEC · PROGRAMA AULA, ESCUELA Y COMUNIDAD  (primera versión)
   ----------------------------------------------------------------
   Un solo proyecto por ciclo escolar para todo el plantel
   (escolarizado). La administración general lo crea y lo edita;
   cada docente se suma con su asignatura y sube evidencias con foto.
   Al final, la "Ficha para SEMS" junta los campos del Anexo 1 del
   documento oficial para copiarlos a la plataforma de Planteles con
   Responsabilidad Social SEMS.

   Es independiente del resto del portal: usa sus propias tablas
   (paec_…) y su propio espacio de fotos ("paec"), y no pasa por el
   guardado general. Para quitarlo ver quitar_paec.sql.
   ================================================================ */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users, Camera, Trash2, Loader2, Plus, Pencil, Save, X, Copy, Check,
  AlertTriangle, Star, ClipboardList, CheckCircle2, History, FileDown, CalendarDays,
} from "lucide-react";
import { supabase } from "./lib/supabase";

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);
const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";
const btnPrim = "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a2340] text-white text-sm font-semibold hover:bg-[#2a3660] disabled:opacity-50 transition";
const btnSec = "inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50";

const ETAPAS = [
  { n: 1, nombre: "Identificación del tema", ayuda: "¿Qué pasa en la localidad que preocupa o inspira al estudiantado? Diagnóstico y elección del tema." },
  { n: 2, nombre: "Plan factible", ayuda: "Propósito, actividades, responsables, cronograma y asignaturas que se integran." },
  { n: 3, nombre: "Realización de actividades", ayuda: "Se llevan a cabo las actividades y el acercamiento con la comunidad." },
  { n: 4, nombre: "Reflexión y conclusiones", ayuda: "Se difunden los resultados: feria, foro, video, podcast, mural…" },
];
const AMBITOS = [
  "Práctica y colaboración ciudadana",
  "Educación para la salud",
  "Actividades físicas y deportivas",
  "Educación integral en sexualidad y género",
  "Actividades artísticas y culturales",
];
const CONTEOS = [
  ["mujeres", "Estudiantes mujeres"],
  ["hombres", "Estudiantes hombres"],
  ["no_binarios", "Estudiantes no binarios"],
  ["tutores", "Madres, padres y tutores"],
  ["docentes", "Personal con funciones docentes"],
  ["directivos", "Personal con funciones directivas"],
  ["administrativos", "Personal con funciones administrativas"],
  ["comunidad", "Integrantes de la comunidad"],
];
const PLANTEL_BASE = {
  cct: "23DTA0291Z", subsistema: "DGETAyCM", plantel: "CBTA No. 291 \"Ignacio Ramírez Calzada\"",
  entidad: "Quintana Roo", municipio: "José María Morelos", localidad: "Dziuché",
};
const MAX_RESUMEN = 1700;
// Datos del plantel: lo guardado, y lo que falte, de los datos base
const datosPlantel = (guardado) => {
  const r = { ...PLANTEL_BASE };
  Object.entries(guardado || {}).forEach(([k, v]) => { if (String(v ?? "").trim()) r[k] = v; });
  return r;
};

const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Cancun" });
const fechaLarga = (f) => {
  if (!f) return "";
  const [a, m, d] = String(f).slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
};
const totalConteos = (p) => CONTEOS.reduce((s, [k]) => s + (Number(p?.[k]) || 0), 0);
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/* Reduce la foto antes de subirla: máximo 1600 px por lado, en JPG.
   Una foto de celular de 4–8 MB queda en unos 300–600 KB. */
function reducirFoto(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const max = 1600;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la foto."))), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("El archivo no es una imagen válida.")); };
    img.src = url;
  });
}

/* Todas las asignaturas conocidas, para sugerirlas al sumarse */
function asignaturasSugeridas(db, user) {
  const set = new Set();
  String(user?.asignaturas || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).forEach((a) => set.add(a));
  (db?.programas || []).forEach((p) =>
    (Array.isArray(p.asignaturas) ? p.asignaturas : []).forEach((a) => a?.nombre && set.add(a.nombre.trim())));
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

export default function Paec({ db, user }) {
  const esAdmin = user.rol === "admin";
  const cicloActual = db?.config?.cicloActual || "";

  const [proyectos, setProyectos] = useState([]);
  const [cicloVer, setCicloVer] = useState(cicloActual);
  const [participantes, setParticipantes] = useState([]);
  const [plan, setPlan] = useState([]);
  const [evidencias, setEvidencias] = useState([]);
  const [urls, setUrls] = useState({});
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [editando, setEditando] = useState(false);
  const [verFicha, setVerFicha] = useState(false);

  const proyecto = proyectos.find((p) => p.ciclo === cicloVer) || null;
  const soloLectura = !proyecto || proyecto.ciclo !== cicloActual;

  const cargarProyectos = useCallback(async () => {
    const { data, error } = await supabase.from("paec_proyectos").select("*").order("ciclo", { ascending: false });
    if (error) throw error;
    setProyectos(data || []);
    return data || [];
  }, []);

  const cargarDetalle = useCallback(async (p) => {
    if (!p) { setParticipantes([]); setPlan([]); setEvidencias([]); setUrls({}); return; }
    const [pa, pl, ev] = await Promise.all([
      supabase.from("paec_participantes").select("*").eq("proyecto_id", p.id).order("creado_en"),
      supabase.from("paec_plan").select("*").eq("proyecto_id", p.id),
      supabase.from("paec_evidencias").select("*").eq("proyecto_id", p.id).order("fecha", { ascending: false }).order("creado_en", { ascending: false }),
    ]);
    if (pa.error) throw pa.error;
    if (ev.error) throw ev.error;
    setParticipantes(pa.data || []);
    setPlan(pl.error ? [] : ordenarPlan(pl.data || []));
    setEvidencias(ev.data || []);
    const rutas = (ev.data || []).map((e) => e.foto);
    if (rutas.length) {
      const { data } = await supabase.storage.from("paec").createSignedUrls(rutas, 60 * 60);
      const m = {};
      (data || []).forEach((d) => { if (d.signedUrl) m[d.path] = d.signedUrl; });
      setUrls(m);
    } else setUrls({});
  }, []);

  const recargar = useCallback(async () => {
    setErr("");
    try {
      const lista = await cargarProyectos();
      await cargarDetalle(lista.find((p) => p.ciclo === cicloVer) || null);
    } catch (e) {
      setErr(/paec_/.test(e.message || "") && /exist|schema cache/i.test(e.message || "")
        ? "Falta crear las tablas del PAEC en Supabase (archivo paec.sql)."
        : `No se pudo cargar el PAEC: ${e.message}`);
    } finally { setCargando(false); }
  }, [cargarProyectos, cargarDetalle, cicloVer]);

  useEffect(() => { recargar(); }, [recargar]);

  if (cargando) return <Card className="p-8 text-center text-slate-400 text-sm"><Loader2 className="inline animate-spin mr-2" size={16} />Cargando PAEC…</Card>;

  const ciclosConProyecto = proyectos.map((p) => p.ciclo);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">PAEC</h1>
          <p className="text-sm text-slate-500">Programa Aula, Escuela y Comunidad · un proyecto para todo el plantel</p>
        </div>
        {ciclosConProyecto.length > 0 && (
          <label className="text-sm text-slate-600 flex items-center gap-2">
            <History size={15} /> Ciclo
            <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" value={cicloVer}
              onChange={(e) => { setCicloVer(e.target.value); setEditando(false); }}>
              {!ciclosConProyecto.includes(cicloActual) && <option value={cicloActual}>{cicloActual} (actual)</option>}
              {ciclosConProyecto.map((c) => <option key={c} value={c}>{c}{c === cicloActual ? " (actual)" : ""}</option>)}
            </select>
          </label>
        )}
      </div>

      {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" />{err}</p>}

      {!proyecto ? (
        cicloVer !== cicloActual ? null : esAdmin ? (
          editando
            ? <FormProyecto ciclo={cicloActual} onCancelar={() => setEditando(false)} onGuardado={async () => { setEditando(false); await recargar(); }} />
            : <Card className="p-8 text-center space-y-3">
                <ClipboardList className="mx-auto text-slate-300" size={40} />
                <p className="text-slate-600">Todavía no hay proyecto PAEC para el ciclo <b>{cicloActual}</b>.</p>
                <button className={btnPrim} onClick={() => setEditando(true)}><Plus size={16} /> Crear el proyecto del ciclo</button>
              </Card>
        ) : (
          <Card className="p-8 text-center text-slate-500 text-sm">
            La administración aún no crea el proyecto PAEC de este ciclo. Cuando lo haga, aparecerá aquí para que te sumes.
          </Card>
        )
      ) : editando ? (
        <FormProyecto ciclo={proyecto.ciclo} proyecto={proyecto} onCancelar={() => setEditando(false)}
          onGuardado={async () => { setEditando(false); await recargar(); }} />
      ) : (
        <>
          <FichaProyecto proyecto={proyecto} esAdmin={esAdmin} soloLectura={soloLectura}
            participantes={participantes} evidencias={evidencias}
            onEditar={() => setEditando(true)} onFicha={() => setVerFicha(true)} onCambio={recargar} />
          <Participantes proyecto={proyecto} participantes={participantes} user={user} db={db}
            esAdmin={esAdmin} soloLectura={soloLectura} onCambio={recargar} />
          <ConstanciasParticipacion proyecto={proyecto} participantes={participantes} plan={plan}
            evidencias={evidencias} user={user} esAdmin={esAdmin} />
          <PlanProyecto proyecto={proyecto} plan={plan} participantes={participantes} user={user}
            esAdmin={esAdmin} soloLectura={soloLectura} onCambio={recargar} />
          <Evidencias proyecto={proyecto} evidencias={evidencias} urls={urls} user={user} esAdmin={esAdmin}
            soloLectura={soloLectura} sumado={participantes.some((p) => p.docente_id === user.id)} onCambio={recargar} />
          {verFicha && <FichaSEMS proyecto={proyecto} participantes={participantes} plan={plan} evidencias={evidencias}
            urls={urls} esAdmin={esAdmin} onCerrar={() => setVerFicha(false)} onCambio={recargar} />}
        </>
      )}
    </div>
  );
}

/* ---------- Crear o editar el proyecto (solo administración) ---------- */
function FormProyecto({ ciclo, proyecto, onCancelar, onGuardado }) {
  const [f, setF] = useState(() => ({
    nombre: proyecto?.nombre || "", tema: proyecto?.tema || "", proposito: proyecto?.proposito || "",
    duracion: proyecto?.duracion || "", ambitos: proyecto?.ambitos || [], estatus: proyecto?.estatus || "En curso",
    resumen: proyecto?.resumen || "", participantes: { ...(proyecto?.participantes || {}) },
    plantel: datosPlantel(proyecto?.plantel),
  }));
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    if (!f.nombre.trim()) { setErr("Escribe el nombre del proyecto."); return; }
    if (f.resumen.length > MAX_RESUMEN) { setErr(`El resumen pasa de ${MAX_RESUMEN} caracteres.`); return; }
    setGuardando(true); setErr("");
    const fila = { ...f, nombre: f.nombre.trim().slice(0, 200), actualizado_en: new Date().toISOString() };
    const r = proyecto
      ? await supabase.from("paec_proyectos").update(fila).eq("id", proyecto.id)
      : await supabase.from("paec_proyectos").insert({ ...fila, ciclo });
    setGuardando(false);
    if (r.error) { setErr(`No se pudo guardar: ${r.error.message}`); return; }
    onGuardado();
  };

  return (
    <Card className="p-5 space-y-4">
      <h2 className="font-bold text-slate-800">{proyecto ? "Editar proyecto" : "Nuevo proyecto"} · ciclo {ciclo}</h2>
      <label className="block text-sm font-medium text-slate-700">Nombre del proyecto <span className="text-slate-400 font-normal">({f.nombre.length}/200)</span>
        <input className={inputCls} maxLength={200} value={f.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Cuidemos el agua de Dziuché" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Tema o problemática de la comunidad
        <textarea className={inputCls} rows={3} value={f.tema} onChange={(e) => set("tema", e.target.value)} placeholder="¿Qué situación del entorno se va a analizar o atender, y por qué?" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Propósito
        <textarea className={inputCls} rows={2} value={f.proposito} onChange={(e) => set("proposito", e.target.value)} placeholder="¿Qué queremos lograr?" />
      </label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm font-medium text-slate-700">Duración
          <input className={inputCls} value={f.duracion} onChange={(e) => set("duracion", e.target.value)} placeholder="Ej. Semestre agosto 2026 – enero 2027" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Estatus
          <select className={inputCls} value={f.estatus} onChange={(e) => set("estatus", e.target.value)}>
            {["En curso", "Concluido", "Suspendido"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700">Ámbitos de Formación Socioemocional</legend>
        <div className="mt-2 grid sm:grid-cols-2 gap-2">
          {AMBITOS.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.ambitos.includes(a)}
                onChange={(e) => set("ambitos", e.target.checked ? [...f.ambitos, a] : f.ambitos.filter((x) => x !== a))} />
              {a}
            </label>
          ))}
        </div>
      </fieldset>

      <details className="rounded-xl border border-slate-200 p-3" open={!!proyecto}>
        <summary className="text-sm font-semibold text-slate-700 cursor-pointer">Para el registro en SEMS (se puede llenar al final)</summary>
        <div className="mt-3 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Resumen: objetivos, actividades y reflexiones (¿qué aprendimos?, ¿qué logramos?, ¿cómo lo hicimos?, ¿qué mejoraríamos?)
            <span className={`ml-1 font-normal ${f.resumen.length > MAX_RESUMEN ? "text-rose-600" : "text-slate-400"}`}>({f.resumen.length}/{MAX_RESUMEN})</span>
            <textarea className={inputCls} rows={6} value={f.resumen} onChange={(e) => set("resumen", e.target.value)} />
          </label>
          <div>
            <p className="text-sm font-medium text-slate-700">Participantes</p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {CONTEOS.map(([k, t]) => (
                <label key={k} className="text-xs text-slate-600">{t}
                  <input type="number" min="0" className={inputCls} value={f.participantes[k] ?? ""}
                    onChange={(e) => set("participantes", { ...f.participantes, [k]: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">Total: {totalConteos(f.participantes)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">Datos del plantel</p>
            <div className="mt-2 grid sm:grid-cols-3 gap-3">
              {[["cct", "CCT"], ["subsistema", "Subsistema"], ["plantel", "Plantel"], ["entidad", "Entidad"], ["municipio", "Municipio"], ["localidad", "Localidad"]].map(([k, t]) => (
                <label key={k} className="text-xs text-slate-600">{t}
                  <input className={inputCls} value={f.plantel[k] || ""} onChange={(e) => set("plantel", { ...f.plantel, [k]: e.target.value })} />
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>

      {err && <p className="text-sm text-rose-700">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button className={btnSec} onClick={onCancelar} disabled={guardando}><X size={16} /> Cancelar</button>
        <button className={btnPrim} onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
        </button>
      </div>
    </Card>
  );
}

/* ---------- Ficha del proyecto con su etapa ---------- */
function FichaProyecto({ proyecto, esAdmin, soloLectura, participantes, evidencias, onEditar, onFicha, onCambio }) {
  const [moviendo, setMoviendo] = useState(false);
  const asignaturas = new Set(participantes.map((p) => p.asignatura.toLowerCase())).size;

  const cambiarEtapa = async (n) => {
    if (!esAdmin || soloLectura || n === proyecto.etapa) return;
    setMoviendo(true);
    const { error } = await supabase.from("paec_proyectos").update({ etapa: n, actualizado_en: new Date().toISOString() }).eq("id", proyecto.id);
    setMoviendo(false);
    if (error) alert(`No se pudo cambiar la etapa: ${error.message}`);
    else onCambio();
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Ciclo {proyecto.ciclo} · {proyecto.estatus}</p>
          <h2 className="text-xl font-bold text-slate-800 break-words">{proyecto.nombre}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {esAdmin && <button className={btnSec} onClick={onFicha}><ClipboardList size={16} /> Ficha para SEMS</button>}
          {esAdmin && !soloLectura && <button className={btnSec} onClick={onEditar}><Pencil size={16} /> Editar</button>}
        </div>
      </div>

      {proyecto.registrado_sems_en && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <CheckCircle2 size={16} /> Registrado en la plataforma SEMS el {fechaLarga(proyecto.registrado_sems_en)}
        </p>
      )}

      <ol className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {ETAPAS.map((e) => {
          const hecha = e.n < proyecto.etapa, actual = e.n === proyecto.etapa;
          return (
            <li key={e.n}>
              <button type="button" disabled={!esAdmin || soloLectura || moviendo} onClick={() => cambiarEtapa(e.n)}
                title={esAdmin && !soloLectura ? "Marcar como etapa actual" : e.ayuda}
                className={`w-full h-full text-left rounded-xl border p-3 transition ${actual ? "border-indigo-400 bg-indigo-50" : hecha ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"} ${esAdmin && !soloLectura ? "hover:border-indigo-300" : "cursor-default"}`}>
                <span className={`text-xs font-bold ${actual ? "text-indigo-700" : hecha ? "text-emerald-700" : "text-slate-400"}`}>
                  {hecha ? "✓ " : ""}Etapa {e.n}{actual ? " · actual" : ""}
                </span>
                <span className="block text-sm font-semibold text-slate-700 leading-snug">{e.nombre}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-slate-500">{ETAPAS[proyecto.etapa - 1].ayuda}</p>

      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        {proyecto.tema && <div><p className="font-semibold text-slate-700">Tema o problemática</p><p className="text-slate-600 whitespace-pre-line">{proyecto.tema}</p></div>}
        {proyecto.proposito && <div><p className="font-semibold text-slate-700">Propósito</p><p className="text-slate-600 whitespace-pre-line">{proyecto.proposito}</p></div>}
        {proyecto.duracion && <div><p className="font-semibold text-slate-700">Duración</p><p className="text-slate-600">{proyecto.duracion}</p></div>}
        {proyecto.ambitos?.length > 0 && <div><p className="font-semibold text-slate-700">Ámbitos socioemocionales</p><p className="text-slate-600">{proyecto.ambitos.join(" · ")}</p></div>}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{new Set(participantes.map((p) => p.docente_id)).size} docente(s)</span>
        <span className={`px-2.5 py-1 rounded-full ${asignaturas >= 3 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {asignaturas} asignatura(s){asignaturas < 3 ? " · el PAEC pide 3 o más" : ""}
        </span>
        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">{evidencias.length} evidencia(s)</span>
      </div>
    </Card>
  );
}

/* ---------- Docentes que se suman con su asignatura ---------- */
function Participantes({ proyecto, participantes, user, db, esAdmin, soloLectura, onCambio }) {
  const [asig, setAsig] = useState("");
  const [act, setAct] = useState(actividadVacia);
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const sugeridas = useMemo(() => asignaturasSugeridas(db, user), [db, user]);
  const mias = participantes.filter((p) => p.docente_id === user.id);

  const porAsignatura = useMemo(() => {
    const m = new Map();
    participantes.forEach((p) => {
      const k = p.asignatura.trim();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [participantes]);

  const sumarme = async () => {
    const a = asig.trim();
    if (a.length < 2) { alert("Escribe tu asignatura o módulo."); return; }
    const falta = faltaEnActividad(act);
    if (falta) { alert(falta); return; }
    setTrabajando(true);
    const { data, error } = await supabase.from("paec_participantes").insert({
      proyecto_id: proyecto.id, docente_id: user.id, docente_nombre: user.nombre || "", asignatura: a,
    }).select().single();
    if (error) {
      setTrabajando(false);
      alert(/duplicate|unique/i.test(error.message) ? "Ya estás sumado con esa asignatura o módulo." : `No se pudo: ${error.message}`);
      return;
    }
    const r = await supabase.from("paec_plan").insert(filaActividad(act, {
      proyecto_id: proyecto.id, participante_id: data.id, docente_id: user.id,
      responsable: user.nombre || "", asignatura: a,
    }));
    setTrabajando(false);
    if (r.error) alert(`Quedaste sumado, pero tu actividad no se guardó: ${r.error.message}. Captúrala en "Plan del proyecto".`);
    setAsig(""); setAct(actividadVacia()); setAbierto(false); onCambio();
  };
  const quitar = async (p) => {
    if (!confirm(`¿Quitar "${p.asignatura}"${p.docente_id !== user.id ? ` de ${p.docente_nombre}` : ""} del proyecto?`)) return;
    const { error } = await supabase.from("paec_participantes").delete().eq("id", p.id);
    if (error) alert(`No se pudo: ${error.message}`); else onCambio();
  };

  return (
    <Card className="p-5 space-y-4">
      <h3 className="font-bold text-slate-800 flex items-center gap-2"><Users size={18} /> Docentes y asignaturas o módulos</h3>

      {!soloLectura && !abierto && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-700">
            {mias.length ? "¿Integras otra asignatura o módulo?" : "Súmate al proyecto con tu asignatura o módulo y tu parte del plan."}
          </p>
          <button className={btnPrim} onClick={() => setAbierto(true)}><Plus size={16} /> {mias.length ? "Sumar otra" : "Sumarme"}</button>
        </div>
      )}
      {!soloLectura && abierto && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">{user.rol === "personal_administrativo" ? "Tu área o función" : "Tu asignatura o módulo"}
            <input className={inputCls} list="paec-asignaturas" value={asig} onChange={(e) => setAsig(e.target.value)}
              placeholder={user.rol === "personal_administrativo" ? "Ej. Biblioteca, Laboratorio, Prefectura" : "Escribe o elige"} maxLength={200} />
            <datalist id="paec-asignaturas">{sugeridas.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide pt-1">Tu parte del plan</p>
          <CamposActividad v={act} set={setAct} />
          <div className="flex gap-2 justify-end">
            <button className={btnSec} onClick={() => setAbierto(false)} disabled={trabajando}><X size={16} /> Cancelar</button>
            <button className={btnPrim} onClick={sumarme} disabled={trabajando}>
              {trabajando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Sumarme
            </button>
          </div>
        </div>
      )}

      {porAsignatura.length === 0 ? (
        <p className="text-sm text-slate-500">Aún no se suma ningún docente.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {porAsignatura.map(([a, lista]) => (
            <li key={a} className="py-2.5">
              <p className="text-sm font-semibold text-slate-800">{a}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {lista.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">
                    {p.docente_nombre || "Docente"}
                    {!soloLectura && (p.docente_id === user.id || esAdmin) && (
                      <button onClick={() => quitar(p)} title="Quitar" className="hover:text-rose-600"><X size={12} /></button>
                    )}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Constancias de participación ----------
   La administración puede descargar la de cualquier participante; cada
   docente, la suya. */
function ConstanciasParticipacion({ proyecto, participantes, plan, evidencias, user, esAdmin }) {
  const [generando, setGenerando] = useState("");
  const personas = useMemo(() => {
    const m = new Map();
    participantes.forEach((p) => {
      if (!m.has(p.docente_id)) m.set(p.docente_id, { id: p.docente_id, nombre: p.docente_nombre || "Docente", asignaturas: [] });
      m.get(p.docente_id).asignaturas.push(p.asignatura.trim());
    });
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [participantes]);
  const visibles = esAdmin ? personas : personas.filter((p) => p.id === user.id);
  if (!visibles.length) return null;

  const generar = async (p) => {
    setGenerando(p.id);
    try {
      await generarConstanciaPAEC({
        proyecto, persona: p,
        actividades: ordenarPlan(plan.filter((a) => !a.general && a.docente_id === p.id)),
        nEvidencias: evidencias.filter((e) => e.docente_id === p.id).length,
      });
    } catch (e) { alert(`No se pudo generar la constancia: ${e.message}`); }
    finally { setGenerando(""); }
  };

  return (
    <Card className="p-5 space-y-3">
      <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileDown size={18} /> {esAdmin ? "Constancias de participación" : "Mi constancia de participación"}</h3>
      <p className="text-xs text-slate-500">PDF con el membrete del plantel: proyecto, ciclo, asignaturas o módulos, actividades del plan y evidencias aportadas.</p>
      <ul className="divide-y divide-slate-100">
        {visibles.map((p) => (
          <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 break-words">{p.nombre}</p>
              <p className="text-xs text-slate-500">{p.asignaturas.join(" · ")}</p>
            </div>
            <button className={btnSec + " !px-3 !py-1.5"} disabled={generando === p.id} onClick={() => generar(p)}>
              {generando === p.id ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Constancia PDF
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Plan del proyecto ----------
   Se arma con lo que aporta cada docente al sumarse (actividad,
   contenido de su asignatura o módulo, grupos y fechas), más las
   actividades generales que agregue la administración. */
const actividadVacia = () => ({ actividad: "", contenido: "", grupos: "", fecha_inicio: "", fecha_fin: "", responsable: "", asignatura: "" });
const faltaEnActividad = (a) =>
  a.actividad.trim().length < 3 ? "Describe la actividad."
  : a.fecha_inicio && a.fecha_fin && a.fecha_fin < a.fecha_inicio ? "La fecha de fin no puede ser antes del inicio."
  : "";
const filaActividad = (a, extra) => ({
  actividad: a.actividad.trim().slice(0, 500),
  contenido: a.contenido.trim().slice(0, 500) || null,
  grupos: a.grupos.trim().slice(0, 100) || null,
  fecha_inicio: a.fecha_inicio || null,
  fecha_fin: a.fecha_fin || null,
  ...extra,
});
const ordenarPlan = (lista) => [...lista].sort((a, b) =>
  (a.fecha_inicio || "9999").localeCompare(b.fecha_inicio || "9999") || (a.creado_en || "").localeCompare(b.creado_en || ""));
const rangoFechas = (a) => {
  if (!a.fecha_inicio && !a.fecha_fin) return "Sin fecha";
  if (!a.fecha_fin || a.fecha_fin === a.fecha_inicio) return fechaLarga(a.fecha_inicio || a.fecha_fin);
  if (!a.fecha_inicio) return `Hasta ${fechaLarga(a.fecha_fin)}`;
  return `${fechaLarga(a.fecha_inicio)} – ${fechaLarga(a.fecha_fin)}`;
};

function CamposActividad({ v, set, general = false }) {
  const c = (k) => (e) => set((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      {general && (
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-700">Responsable
            <input className={inputCls} value={v.responsable} onChange={c("responsable")} maxLength={150} placeholder="Ej. Dirección, Vinculación…" />
          </label>
          <label className="text-sm font-medium text-slate-700">Área (opcional)
            <input className={inputCls} value={v.asignatura} onChange={c("asignatura")} maxLength={200} placeholder="Ej. Todo el plantel" />
          </label>
        </div>
      )}
      <label className="block text-sm font-medium text-slate-700">Actividad <span className="text-slate-400 font-normal">({v.actividad.length}/500)</span>
        <textarea className={inputCls} rows={2} maxLength={500} value={v.actividad} onChange={c("actividad")}
          placeholder={general ? "Ej. Feria de cierre con la comunidad" : "Ej. Encuesta a familias sobre el uso de plantas medicinales"} />
      </label>
      {!general && (
        <label className="block text-sm font-medium text-slate-700">Contenido de su asignatura o módulo
          <textarea className={inputCls} rows={2} maxLength={500} value={v.contenido} onChange={c("contenido")}
            placeholder="Ej. Estadística descriptiva: tablas de frecuencia y gráficas" />
        </label>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm font-medium text-slate-700">Grupos
          <input className={inputCls} value={v.grupos} onChange={c("grupos")} maxLength={100} placeholder={general ? "Ej. Todos" : "Ej. 3A, 3B"} />
        </label>
        <label className="text-sm font-medium text-slate-700">Inicio
          <input type="date" className={inputCls} value={v.fecha_inicio} onChange={c("fecha_inicio")} />
        </label>
        <label className="text-sm font-medium text-slate-700">Fin
          <input type="date" className={inputCls} value={v.fecha_fin} min={v.fecha_inicio || undefined} onChange={c("fecha_fin")} />
        </label>
      </div>
    </div>
  );
}

function PlanProyecto({ proyecto, plan, participantes, user, esAdmin, soloLectura, onCambio }) {
  // forma: null | { modo: "nueva" | "editar", id?, participante_id?, general, v }
  const [forma, setForma] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const mias = participantes.filter((p) => p.docente_id === user.id);
  const sinActividad = mias.filter((p) => !plan.some((a) => a.participante_id === p.id));

  const abrirNueva = (participante, general = false) =>
    setForma({ modo: "nueva", participante_id: participante?.id || null, general, v: actividadVacia(),
               asignatura: participante?.asignatura || "" });
  const abrirEditar = (a) =>
    setForma({ modo: "editar", id: a.id, participante_id: a.participante_id, general: a.general, asignatura: a.asignatura || "",
               v: { actividad: a.actividad || "", contenido: a.contenido || "", grupos: a.grupos || "",
                    fecha_inicio: a.fecha_inicio || "", fecha_fin: a.fecha_fin || "",
                    responsable: a.responsable || "", asignatura: a.asignatura || "" } });

  const guardar = async () => {
    const falta = faltaEnActividad(forma.v);
    if (falta) { alert(falta); return; }
    if (!forma.general && !forma.participante_id) { alert("Elige tu asignatura o módulo."); return; }
    const part = participantes.find((p) => p.id === forma.participante_id);
    const extra = forma.general
      ? { general: true, participante_id: null, responsable: forma.v.responsable.trim() || "Administración",
          asignatura: forma.v.asignatura.trim() || null, contenido: null }
      : { general: false, participante_id: forma.participante_id, asignatura: part?.asignatura || forma.asignatura,
          responsable: part?.docente_nombre || user.nombre || "" };
    setGuardando(true);
    const fila = filaActividad(forma.v, extra);
    const r = forma.modo === "editar"
      ? await supabase.from("paec_plan").update(fila).eq("id", forma.id)
      : await supabase.from("paec_plan").insert({ ...fila, proyecto_id: proyecto.id, docente_id: user.id });
    setGuardando(false);
    if (r.error) { alert(`No se pudo guardar: ${r.error.message}`); return; }
    setForma(null); onCambio();
  };
  const borrar = async (a) => {
    if (!confirm("¿Borrar esta actividad del plan?")) return;
    const { error } = await supabase.from("paec_plan").delete().eq("id", a.id);
    if (error) alert(`No se pudo: ${error.message}`); else onCambio();
  };
  const puedeEditar = (a) => !soloLectura && (esAdmin || (a.docente_id === user.id && !a.general));

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-slate-800 flex items-center gap-2"><CalendarDays size={18} /> Plan del proyecto</h3>
        {!soloLectura && !forma && (
          <div className="flex flex-wrap gap-2">
            {mias.length > 0 && (
              <button className={btnSec} onClick={() => abrirNueva(mias.length === 1 ? mias[0] : null)}><Plus size={16} /> Agregar actividad mía</button>
            )}
            {esAdmin && <button className={btnSec} onClick={() => abrirNueva(null, true)}><Plus size={16} /> Actividad general</button>}
          </div>
        )}
      </div>

      {!soloLectura && !forma && sinActividad.map((p) => (
        <div key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-amber-900">Falta tu parte del plan para <b>{p.asignatura}</b>.</p>
          <button className={btnPrim} onClick={() => abrirNueva(p)}><Pencil size={16} /> Completar mi parte</button>
        </div>
      ))}

      {forma && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">
            {forma.modo === "editar" ? "Editar actividad" : forma.general ? "Nueva actividad general del plantel" : "Nueva actividad"}
          </p>
          {!forma.general && (forma.modo === "editar" || mias.length <= 1
            ? <p className="text-sm text-slate-600">Asignatura o módulo: <b>{participantes.find((p) => p.id === forma.participante_id)?.asignatura || forma.asignatura}</b></p>
            : <label className="block text-sm font-medium text-slate-700">Asignatura o módulo
                <select className={inputCls} value={forma.participante_id || ""} onChange={(e) => setForma((f) => ({ ...f, participante_id: e.target.value || null }))}>
                  <option value="">Elige…</option>
                  {mias.map((p) => <option key={p.id} value={p.id}>{p.asignatura}</option>)}
                </select>
              </label>)}
          <CamposActividad v={forma.v} set={(fn) => setForma((f) => ({ ...f, v: fn(f.v) }))} general={forma.general} />
          <div className="flex gap-2 justify-end">
            <button className={btnSec} onClick={() => setForma(null)} disabled={guardando}><X size={16} /> Cancelar</button>
            <button className={btnPrim} onClick={guardar} disabled={guardando}>
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar
            </button>
          </div>
        </div>
      )}

      {plan.length === 0 ? (
        <p className="text-sm text-slate-500">El plan se irá formando con la actividad que capture cada docente al sumarse.</p>
      ) : (
        <ol className="space-y-2">
          {plan.map((a) => (
            <li key={a.id} className={`rounded-xl border p-3 ${a.general ? "border-violet-200 bg-violet-50/50" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-semibold text-indigo-700">{rangoFechas(a)}</p>
                {puedeEditar(a) && (
                  <div className="flex gap-1 -mt-1">
                    <button onClick={() => abrirEditar(a)} title="Editar" className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil size={15} /></button>
                    <button onClick={() => borrar(a)} title="Borrar" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800 whitespace-pre-line break-words">{a.actividad}</p>
              {a.contenido && <p className="text-sm text-slate-600 break-words"><span className="text-slate-500">Contenido:</span> {a.contenido}</p>}
              <p className="text-xs text-slate-500 mt-1">
                {a.general ? "Actividad general" : a.asignatura}{a.general && a.asignatura ? ` · ${a.asignatura}` : ""}
                {" · "}{a.responsable || "—"}{a.grupos ? ` · Grupos: ${a.grupos}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ---------- Evidencias con foto ---------- */
function Evidencias({ proyecto, evidencias, urls, user, esAdmin, soloLectura, sumado, onCambio }) {
  const vacio = () => ({ archivo: null, vista: "", descripcion: "", grupo: "", fecha: hoyISO(), etapa: proyecto.etapa });
  const [f, setF] = useState(vacio);
  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState("");
  const [filtro, setFiltro] = useState(0);
  const [ampliada, setAmpliada] = useState(null);
  const comprobables = evidencias.filter((e) => e.comprobable).length;

  useEffect(() => () => { if (f.vista) URL.revokeObjectURL(f.vista); }, [f.vista]);

  const elegirFoto = (archivo) => {
    if (!archivo) return;
    if (!/^image\/(jpe?g|png|heic|heif|webp)$/i.test(archivo.type) && !/\.(jpe?g|png|heic|heif|webp)$/i.test(archivo.name)) {
      setErr("Elige una foto (JPG o PNG)."); return;
    }
    setErr("");
    setF((x) => ({ ...x, archivo, vista: URL.createObjectURL(archivo) }));
  };

  const subir = async () => {
    if (!f.archivo) { setErr("Elige una foto."); return; }
    if (f.descripcion.trim().length < 3) { setErr("Describe brevemente la actividad."); return; }
    setSubiendo(true); setErr("");
    try {
      const blob = await reducirFoto(f.archivo);
      const ruta = `${user.id}/${nuevoId()}.jpg`;
      const up = await supabase.storage.from("paec").upload(ruta, blob, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("paec_evidencias").insert({
        proyecto_id: proyecto.id, docente_id: user.id, docente_nombre: user.nombre || "",
        etapa: Number(f.etapa), grupo: f.grupo.trim() || null, fecha: f.fecha || hoyISO(),
        descripcion: f.descripcion.trim().slice(0, 600), foto: ruta,
      });
      if (error) { await supabase.storage.from("paec").remove([ruta]); throw error; }
      setF(vacio()); setAbierto(false); onCambio();
    } catch (e) {
      setErr(`No se pudo subir: ${e.message}`);
    } finally { setSubiendo(false); }
  };

  const borrar = async (e) => {
    if (!confirm("¿Borrar esta evidencia y su foto?")) return;
    const { error } = await supabase.from("paec_evidencias").delete().eq("id", e.id);
    if (error) { alert(`No se pudo: ${error.message}`); return; }
    await supabase.storage.from("paec").remove([e.foto]);
    onCambio();
  };

  const alternarComprobable = async (e) => {
    if (!e.comprobable && comprobables >= 2) { alert("SEMS acepta máximo 2 fotos comprobables. Quita una antes de marcar otra."); return; }
    const { error } = await supabase.from("paec_evidencias").update({ comprobable: !e.comprobable }).eq("id", e.id);
    if (error) alert(`No se pudo: ${error.message}`); else onCambio();
  };

  const visibles = filtro ? evidencias.filter((e) => e.etapa === filtro) : evidencias;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Camera size={18} /> Evidencias</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" value={filtro} onChange={(e) => setFiltro(Number(e.target.value))}>
            <option value={0}>Todas las etapas</option>
            {ETAPAS.map((e) => <option key={e.n} value={e.n}>Etapa {e.n}</option>)}
          </select>
          {!soloLectura && !abierto && (
            sumado
              ? <button className={btnPrim} onClick={() => { setF(vacio()); setAbierto(true); }}><Plus size={16} /> Subir evidencia</button>
              : <span className="text-xs text-slate-500">Súmate al proyecto para subir evidencias</span>
          )}
        </div>
      </div>

      {esAdmin && <p className="text-xs text-slate-500">Toca la ⭐ para elegir las fotos comprobables para SEMS ({comprobables}/2).</p>}

      {abierto && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Foto de la actividad</span>
            <input type="file" accept="image/jpeg,image/png,image/*" className="mt-1 block w-full text-sm"
              onChange={(e) => elegirFoto(e.target.files?.[0])} />
          </label>
          {f.vista && <img src={f.vista} alt="" className="max-h-56 rounded-lg border border-slate-200 object-contain bg-white" />}
          <label className="block text-sm font-medium text-slate-700">¿Qué se hizo? <span className="text-slate-400 font-normal">({f.descripcion.length}/600)</span>
            <textarea className={inputCls} rows={3} maxLength={600} value={f.descripcion}
              onChange={(e) => setF((x) => ({ ...x, descripcion: e.target.value }))} placeholder="Ej. Encuesta a vecinos sobre el uso del agua, grupo 3B." />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm font-medium text-slate-700">Grupo
              <input className={inputCls} value={f.grupo} maxLength={40} onChange={(e) => setF((x) => ({ ...x, grupo: e.target.value }))} placeholder="Ej. 3B" />
            </label>
            <label className="text-sm font-medium text-slate-700">Fecha
              <input type="date" className={inputCls} value={f.fecha} max={hoyISO()} onChange={(e) => setF((x) => ({ ...x, fecha: e.target.value }))} />
            </label>
            <label className="text-sm font-medium text-slate-700">Etapa
              <select className={inputCls} value={f.etapa} onChange={(e) => setF((x) => ({ ...x, etapa: Number(e.target.value) }))}>
                {ETAPAS.map((e) => <option key={e.n} value={e.n}>{e.n}. {e.nombre}</option>)}
              </select>
            </label>
          </div>
          {err && <p className="text-sm text-rose-700">{err}</p>}
          <div className="flex gap-2 justify-end">
            <button className={btnSec} onClick={() => { setAbierto(false); setErr(""); }} disabled={subiendo}><X size={16} /> Cancelar</button>
            <button className={btnPrim} onClick={subir} disabled={subiendo}>
              {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />} {subiendo ? "Subiendo…" : "Subir"}
            </button>
          </div>
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="text-sm text-slate-500">{evidencias.length ? "No hay evidencias en esta etapa." : "Aún no hay evidencias."}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map((e) => (
            <figure key={e.id} className="rounded-xl border border-slate-200 overflow-hidden bg-white flex flex-col">
              <button type="button" className="relative block bg-slate-100 aspect-[4/3]" onClick={() => urls[e.foto] && setAmpliada(e)}>
                {urls[e.foto]
                  ? <img src={urls[e.foto]} alt={e.descripcion} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  : <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Foto no disponible</span>}
                {e.comprobable && <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950">Comprobable SEMS</span>}
              </button>
              <figcaption className="p-3 flex-1 flex flex-col gap-1">
                <p className="text-sm text-slate-700 whitespace-pre-line break-words">{e.descripcion}</p>
                <p className="text-xs text-slate-500 mt-auto pt-1">
                  {e.docente_nombre || "Docente"} · {fechaLarga(e.fecha)}{e.grupo ? ` · ${e.grupo}` : ""} · Etapa {e.etapa}
                </p>
                {!soloLectura && (esAdmin || e.docente_id === user.id) && (
                  <div className="flex gap-1 justify-end pt-1">
                    {esAdmin && (
                      <button onClick={() => alternarComprobable(e)} title={e.comprobable ? "Quitar de comprobables" : "Marcar como comprobable para SEMS"}
                        className={`p-1.5 rounded-lg hover:bg-amber-50 ${e.comprobable ? "text-amber-500" : "text-slate-400"}`}>
                        <Star size={16} fill={e.comprobable ? "currentColor" : "none"} />
                      </button>
                    )}
                    <button onClick={() => borrar(e)} title="Borrar" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={16} /></button>
                  </div>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {ampliada && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setAmpliada(null)}>
          <div className="max-w-4xl w-full" onClick={(ev) => ev.stopPropagation()}>
            <img src={urls[ampliada.foto]} alt={ampliada.descripcion} className="max-h-[75vh] w-full object-contain rounded-lg" />
            <div className="flex items-start justify-between gap-3 mt-3 text-white">
              <p className="text-sm">{ampliada.descripcion}</p>
              <div className="flex gap-2 shrink-0">
                <a href={urls[ampliada.foto]} download target="_blank" rel="noreferrer" className="text-sm underline">Abrir original</a>
                <button onClick={() => setAmpliada(null)} className="text-sm underline">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Ficha para la plataforma SEMS (Anexo 1) ---------- */
function FichaSEMS({ proyecto, participantes, plan, evidencias, urls, esAdmin, onCerrar, onCambio }) {
  const [copiado, setCopiado] = useState("");
  const [marcando, setMarcando] = useState(false);
  const pl = datosPlantel(proyecto.plantel);
  const [generando, setGenerando] = useState(false);
  const pa = proyecto.participantes || {};
  const asignaturas = [...new Set(participantes.map((p) => p.asignatura.trim()))].sort((a, b) => a.localeCompare(b, "es"));
  const fotos = evidencias.filter((e) => e.comprobable);

  const campos = [
    ["CCT plantel", pl.cct],
    ["Subsistema", pl.subsistema],
    ["Plantel", pl.plantel],
    ["Entidad", pl.entidad],
    ["Municipio", pl.municipio],
    ["Localidad", pl.localidad],
    ["Nombre proyecto", proyecto.nombre],
    ["Asignaturas", asignaturas.join(", ")],
    ["Ámbitos de Formación Socioemocional", (proyecto.ambitos || []).join(", ")],
    ["Duración", proyecto.duracion],
    ["Ciclo escolar", proyecto.ciclo],
    ["Estatus", proyecto.estatus],
    ["Resumen", proyecto.resumen],
    ...CONTEOS.map(([k, t]) => [t, String(Number(pa[k]) || 0)]),
    ["Total participantes", String(totalConteos(pa))],
    ["Total de proyectos", "1"],
  ];
  const faltan = campos.filter(([, v]) => !String(v || "").trim()).map(([k]) => k);

  const copiar = async (texto, clave) => {
    try { await navigator.clipboard.writeText(texto || ""); setCopiado(clave); setTimeout(() => setCopiado(""), 1500); }
    catch { alert("No se pudo copiar. Selecciona el texto y cópialo a mano."); }
  };
  const marcarRegistrado = async () => {
    setMarcando(true);
    const valor = proyecto.registrado_sems_en ? null : new Date().toISOString();
    const { error } = await supabase.from("paec_proyectos").update({ registrado_sems_en: valor }).eq("id", proyecto.id);
    setMarcando(false);
    if (error) alert(`No se pudo: ${error.message}`); else onCambio();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 overflow-y-auto" onClick={onCerrar}>
      <div className="min-h-full flex items-start justify-center p-3 sm:p-8">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-800">Ficha para la plataforma SEMS</h3>
              <p className="text-xs text-slate-500">Campos del Anexo 1 · toca <Copy size={11} className="inline" /> para copiar cada uno</p>
            </div>
            <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
          </div>

          {faltan.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Faltan: {faltan.join(", ")}. Complétalos en <b>Editar</b>.
            </p>
          )}

          <dl className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {campos.map(([k, v]) => (
              <div key={k} className="flex flex-wrap sm:flex-nowrap items-start gap-x-3 gap-y-0.5 px-3 py-2">
                <dt className="w-full sm:w-40 shrink-0 text-xs font-semibold text-slate-500 pt-0.5">{k}</dt>
                <dd className="flex-1 min-w-0 text-sm text-slate-800 whitespace-pre-line break-words">{v || <span className="text-slate-300">—</span>}</dd>
                <button onClick={() => copiar(v, k)} disabled={!v} className="p-1 rounded text-slate-400 hover:text-indigo-600 disabled:opacity-30" title="Copiar">
                  {copiado === k ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
              </div>
            ))}
          </dl>

          <div>
            <p className="text-sm font-semibold text-slate-700">Comprobables (1 a 2 fotos JPG o PNG)</p>
            {fotos.length === 0
              ? <p className="text-xs text-amber-700 mt-1">Aún no eliges fotos. Márcalas con ⭐ en Evidencias.</p>
              : <div className="mt-2 flex flex-wrap gap-3">
                  {fotos.map((e, i) => (
                    <a key={e.id} href={urls[e.foto]} target="_blank" rel="noreferrer" download={`PAEC_comprobable_${i + 1}.jpg`}
                      className="block w-36 text-xs text-indigo-700 underline">
                      {urls[e.foto] && <img src={urls[e.foto]} alt="" className="w-36 h-24 object-cover rounded-lg border border-slate-200 mb-1" />}
                      Descargar foto {i + 1}
                    </a>
                  ))}
                </div>}
          </div>

          {esAdmin && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap gap-2">
                <button className={btnSec} onClick={() => copiar(campos.map(([k, v]) => `${k}: ${v || ""}`).join("\n"), "_todo")}>
                  {copiado === "_todo" ? <Check size={16} /> : <Copy size={16} />} Copiar todo
                </button>
                <button className={btnPrim} disabled={generando} onClick={async () => {
                  setGenerando(true);
                  try { await generarPDF({ proyecto, participantes, plan, evidencias, urls, plantel: pl, asignaturas }); }
                  catch (e) { alert(`No se pudo generar el PDF: ${e.message}`); }
                  finally { setGenerando(false); }
                }}>
                  {generando ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} {generando ? "Generando…" : "Descargar PDF"}
                </button>
              </div>
              <button className={proyecto.registrado_sems_en ? btnSec : btnPrim} onClick={marcarRegistrado} disabled={marcando}>
                <CheckCircle2 size={16} />
                {proyecto.registrado_sems_en ? `Registrado el ${fechaLarga(proyecto.registrado_sems_en)} · desmarcar` : "Marcar como registrado en SEMS"}
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/* ---------- PDF de la ficha con el membrete del plantel ----------
   Membrete tomado del oficio institucional: logos de Educación (SEP)
   y DGETAyCM arriba, y la imagen del año con la dirección abajo. Las
   imágenes viven en public/paec/. El generador de PDF se descarga
   solo cuando alguien lo usa. */
const CDN_JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm";
const CDN_AUTOTABLE = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.mjs";
const funcionDe = (m, nombre) =>
  [m?.[nombre], m?.default?.[nombre], m?.default, m?.default?.default].find((f) => typeof f === "function");
let promesaLib = null;
const cargarLib = () => {
  if (!promesaLib) {
    promesaLib = Promise.all([import(/* @vite-ignore */ CDN_JSPDF), import(/* @vite-ignore */ CDN_AUTOTABLE)])
      .then(([a, b]) => {
        const lib = { jsPDF: funcionDe(a, "jsPDF"), autoTable: funcionDe(b, "autoTable") };
        if (!lib.jsPDF || !lib.autoTable) throw new Error("No se reconoció el generador de PDF.");
        return lib;
      })
      .catch((e) => { promesaLib = null; throw e; });
  }
  return promesaLib;
};

// Descarga una imagen y la deja lista para el PDF: { d: dataURL, w, h, tipo }
const imagenParaPDF = (url) =>
  fetch(url)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("imagen no disponible"))))
    .then((b) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(b); }))
    .then((d) => new Promise((ok) => {
      const i = new Image();
      i.onload = () => ok({ d, w: i.naturalWidth, h: i.naturalHeight, tipo: /^data:image\/png/.test(d) ? "PNG" : "JPEG" });
      i.onerror = () => ok(null);
      i.src = d;
    }))
    .catch(() => null);

const MEMBRETE = import.meta.env.BASE_URL + "paec/";
const VINO = [105, 17, 53];      // #691135, color del pie del oficio
const GUINDA = [156, 33, 72];    // #9C2148, línea del pie

async function generarPDF({ proyecto, participantes, plan = [], evidencias, urls, plantel, asignaturas }) {
  const fotosSel = evidencias.filter((e) => e.comprobable && urls[e.foto]);
  const [{ jsPDF, autoTable }, sep, dgeta, bandera, anio, ...fotos] = await Promise.all([
    cargarLib(),
    imagenParaPDF(MEMBRETE + "membrete-sep.png"),
    imagenParaPDF(MEMBRETE + "membrete-dgetaycm.png"),
    imagenParaPDF(MEMBRETE + "membrete-bandera.png"),
    imagenParaPDF(MEMBRETE + "membrete-2026.png"),
    ...fotosSel.map((e) => imagenParaPDF(urls[e.foto])),
  ]);

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = 215.9, M = 30, ANCHO = W - 2 * M;
  const ARRIBA = 40, ABAJO = 242;   // zona de contenido, entre membrete y pie
  const pa = proyecto.participantes || {};
  const hoy = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Cancun" });

  const titulo = (t, y) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...VINO);
    doc.text(t.toUpperCase(), M, y);
    doc.setDrawColor(...GUINDA); doc.setLineWidth(0.3); doc.line(M, y + 1.5, M + ANCHO, y + 1.5);
    doc.setTextColor(0);
    return y + 4;
  };
  const tabla = (y, body, opciones = {}) => {
    autoTable(doc, {
      startY: y, body, theme: "grid",
      margin: { left: M, right: M, top: ARRIBA, bottom: 279.4 - ABAJO },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, lineColor: [190, 190, 190], lineWidth: 0.2, textColor: 30, valign: "top" },
      columnStyles: { 0: { cellWidth: 55, fontStyle: "bold", fillColor: [246, 240, 243] } },
      ...opciones,
    });
    return doc.lastAutoTable.finalY + 7;
  };
  const sitio = (y, alto) => { if (y + alto > ABAJO) { doc.addPage(); return ARRIBA; } return y; };

  // Encabezado del documento
  let y = ARRIBA + 2;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text(`${plantel.localidad || "Dziuché"}, Q. Roo, a ${hoy}`, M + ANCHO, y, { align: "right" });
  y += 9;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...VINO);
  doc.text("PROGRAMA AULA, ESCUELA Y COMUNIDAD (PAEC)", W / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60);
  doc.text(`Ficha de registro · Ciclo escolar ${proyecto.ciclo}`, W / 2, y, { align: "center" });
  doc.setTextColor(0);
  y += 9;

  y = titulo("Datos del plantel", y);
  y = tabla(y, [
    ["CCT", plantel.cct], ["Subsistema", plantel.subsistema], ["Plantel", plantel.plantel],
    ["Entidad", plantel.entidad], ["Municipio", plantel.municipio], ["Localidad", plantel.localidad],
  ].map(([a, b]) => [a, b || "—"]));

  y = sitio(y, 30);
  y = titulo("Datos del proyecto", y);
  y = tabla(y, [
    ["Nombre del proyecto", proyecto.nombre],
    ["Tema o problemática", proyecto.tema],
    ["Propósito", proyecto.proposito],
    ["Asignaturas", asignaturas.join(", ")],
    ["Ámbitos de Formación Socioemocional", (proyecto.ambitos || []).join(", ")],
    ["Duración", proyecto.duracion],
    ["Ciclo escolar", proyecto.ciclo],
    ["Estatus", proyecto.estatus],
    ["Etapa", `${proyecto.etapa}. ${ETAPAS[proyecto.etapa - 1].nombre}`],
    ...(proyecto.registrado_sems_en ? [["Registro en plataforma SEMS", fechaLarga(proyecto.registrado_sems_en)]] : []),
  ].map(([a, b]) => [a, String(b || "").trim() || "—"]));

  if (participantes.length) {
    const porAsig = new Map();
    participantes.forEach((p) => {
      const k = p.asignatura.trim();
      porAsig.set(k, [...(porAsig.get(k) || []), p.docente_nombre || "Docente"]);
    });
    y = sitio(y, 30);
    y = titulo("Docentes participantes", y);
    y = tabla(y, [...porAsig.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([a, d]) => [a, d.join(", ")]),
      { head: [["Asignatura o módulo", "Docentes"]], headStyles: { fillColor: VINO, textColor: 255, fontStyle: "bold" } });
  }

  if (plan.length) {
    y = sitio(y, 30);
    y = titulo("Plan del proyecto", y);
    y = tabla(y, ordenarPlan(plan).map((a) => [
      rangoFechas(a),
      a.actividad + (a.contenido ? `\nContenido: ${a.contenido}` : ""),
      a.general ? (a.asignatura || "General") : (a.asignatura || ""),
      a.responsable || "",
      a.grupos || "",
    ]), {
      head: [["Fechas", "Actividad", "Asignatura o módulo", "Responsable", "Grupos"]],
      headStyles: { fillColor: VINO, textColor: 255, fontStyle: "bold", fontSize: 8.5 },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, lineColor: [190, 190, 190], lineWidth: 0.2, textColor: 30, valign: "top" },
      columnStyles: { 0: { cellWidth: 26, fontStyle: "normal", fillColor: false }, 1: { cellWidth: 58 }, 2: { cellWidth: 28 }, 3: { cellWidth: 26 }, 4: { cellWidth: 17.9 } },
    });
  }

  y = sitio(y, 40);
  y = titulo("Participantes", y);
  y = tabla(y, [
    ...CONTEOS.map(([k, t]) => [t, String(Number(pa[k]) || 0)]),
    ["Total de participantes", String(totalConteos(pa))],
    ["Total de proyectos", "1"],
  ], { columnStyles: { 0: { cellWidth: 110, fontStyle: "bold", fillColor: [246, 240, 243] }, 1: { halign: "center" } },
       didParseCell: (d) => { if (d.row.index >= CONTEOS.length) d.cell.styles.fontStyle = "bold"; } });

  y = sitio(y, 30);
  y = titulo("Resumen", y);
  doc.setFontSize(8.5); doc.setTextColor(90);
  doc.text("Objetivos, actividades y reflexiones: ¿qué aprendimos?, ¿qué logramos?, ¿cómo lo hicimos?, ¿qué mejoraríamos?", M, y + 2);
  doc.setTextColor(0);
  y = tabla(y + 4, [[proyecto.resumen?.trim() || "Sin resumen todavía."]],
    { columnStyles: { 0: { fontStyle: "normal", fillColor: false, halign: "justify" } }, styles: { font: "helvetica", fontSize: 9.5, cellPadding: 3, lineColor: [190, 190, 190], lineWidth: 0.2, textColor: 30 } });

  // Comprobables: cada foto con su descripción
  const validas = fotosSel.map((e, i) => [e, fotos[i]]).filter(([, f]) => f);
  if (validas.length) {
    y = sitio(y, 95);
    y = titulo("Comprobables", y);
    for (const [e, f] of validas) {
      const maxW = ANCHO, maxH = 78;
      const k = Math.min(maxW / f.w, maxH / f.h);
      const w = f.w * k, h = f.h * k;
      const pie = doc.setFontSize(8.5).splitTextToSize(
        `${e.descripcion} — ${e.docente_nombre || "Docente"}, ${fechaLarga(e.fecha)}${e.grupo ? `, grupo ${e.grupo}` : ""}.`, ANCHO);
      y = sitio(y, h + 6 + pie.length * 4);
      doc.addImage(f.d, f.tipo, M + (ANCHO - w) / 2, y, w, h, undefined, "FAST");
      doc.setDrawColor(190); doc.setLineWidth(0.2); doc.rect(M + (ANCHO - w) / 2, y, w, h);
      y += h + 4;
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(70);
      doc.text(pie, W / 2, y, { align: "center" });
      doc.setTextColor(0); doc.setFont("helvetica", "normal");
      y += pie.length * 4 + 6;
    }
  }

  // Membrete y pie en todas las páginas (medidas tomadas del oficio)
  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    if (sep) doc.addImage(sep.d, "PNG", 12.2, 12.7, 59.8, 16.9);
    if (dgeta) doc.addImage(dgeta.d, "PNG", 73.6, 17.65, 32.5, 7.2);  // centrado con el logo de Educación
    if (bandera) doc.addImage(bandera.d, "PNG", 175.2, 8.8, 23.8, 24.9);
    if (anio) doc.addImage(anio.d, "PNG", 10, 248.8, 56.7, 23.5);
    doc.setDrawColor(...GUINDA); doc.setLineWidth(0.5); doc.line(61.2, 260.7, 188.7, 260.7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...VINO);
    doc.text("Km 121, Carretera Federal 184, Dziuché, Quintana Roo. CP 77800", 62, 264.5);
    doc.text("www.cbta291.edu.mx", 62, 267.6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(120);
    doc.text(`Página ${n} de ${total}`, 188.7, 267.6, { align: "right" });
    doc.setTextColor(0);
  }

  const nombre = `PAEC_${proyecto.ciclo}_${(proyecto.nombre || "proyecto").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").slice(0, 40)}.pdf`;
  const blob = doc.output("blob");
  const archivo = typeof File === "function" ? new File([blob], nombre, { type: "application/pdf" }) : null;
  if (archivo && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}


/* ---------- Constancia de participación en PDF ---------- */
async function generarConstanciaPAEC({ proyecto, persona, actividades, nEvidencias }) {
  const [{ jsPDF, autoTable }, sep, dgeta, bandera, anio] = await Promise.all([
    cargarLib(),
    imagenParaPDF(MEMBRETE + "membrete-sep.png"),
    imagenParaPDF(MEMBRETE + "membrete-dgetaycm.png"),
    imagenParaPDF(MEMBRETE + "membrete-bandera.png"),
    imagenParaPDF(MEMBRETE + "membrete-2026.png"),
  ]);
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = 215.9, M = 30, ANCHO = W - 2 * M;
  const pl = datosPlantel(proyecto.plantel);
  const hoy = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Cancun" });

  let y = 44;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  doc.text(`${pl.localidad || "Dziuché"}, Q. Roo, a ${hoy}`, M + ANCHO, y, { align: "right" });
  y += 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...VINO);
  doc.text("CONSTANCIA DE PARTICIPACIÓN", W / 2, y, { align: "center" });
  y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(70);
  doc.text("Programa Aula, Escuela y Comunidad (PAEC)", W / 2, y, { align: "center" });
  y += 14;
  doc.setTextColor(0); doc.setFontSize(11);
  doc.text(`La Dirección del ${pl.plantel}, con CCT ${pl.cct}, hace constar que`, W / 2, y, { align: "center", maxWidth: ANCHO });
  y += 13;
  doc.setFont("helvetica", "bold"); doc.setFontSize(17);
  const nom = doc.splitTextToSize(persona.nombre.toUpperCase(), ANCHO);
  doc.text(nom, W / 2, y, { align: "center" });
  y += nom.length * 7 + 5;
  doc.setDrawColor(...GUINDA); doc.setLineWidth(0.4); doc.line(W / 2 - 50, y - 6, W / 2 + 50, y - 6);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  const asig = persona.asignaturas.join(", ");
  const parrafo = `participó en el Programa Aula, Escuela y Comunidad con el proyecto «${proyecto.nombre}», durante el ciclo escolar ${proyecto.ciclo}, integrando ${persona.asignaturas.length > 1 ? "las asignaturas o módulos" : "la asignatura o módulo"} ${asig}` +
    (nEvidencias ? ` y aportando ${nEvidencias} evidencia${nEvidencias === 1 ? "" : "s"} de las actividades realizadas.` : ".");
  const lineas = doc.splitTextToSize(parrafo, ANCHO);
  doc.text(lineas, W / 2, y, { align: "center", lineHeightFactor: 1.5 });
  y += lineas.length * 6.2 + 6;

  if (actividades.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...VINO);
    doc.text("Actividades a su cargo", M, y); doc.setTextColor(0);
    autoTable(doc, {
      startY: y + 2, theme: "grid",
      margin: { left: M, right: M, top: 40, bottom: 40 },
      head: [["Fechas", "Actividad", "Grupos"]],
      headStyles: { fillColor: VINO, textColor: 255, fontStyle: "bold", fontSize: 9 },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.8, lineColor: [190, 190, 190], lineWidth: 0.2, textColor: 30, valign: "top" },
      columnStyles: { 0: { cellWidth: 38 }, 2: { cellWidth: 22 } },
      body: actividades.map((a) => [rangoFechas(a), a.actividad + (a.contenido ? `\nContenido: ${a.contenido}` : ""), a.grupos || ""]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
  if (y > 200) { doc.addPage(); y = 50; }
  doc.text("Se extiende la presente para los fines que a la persona interesada convengan.", W / 2, y + 2, { align: "center", maxWidth: ANCHO });
  y = Math.max(y + 32, 215);
  if (y > 235) { doc.addPage(); y = 90; }
  doc.setDrawColor(60); doc.setLineWidth(0.3); doc.line(W / 2 - 40, y, W / 2 + 40, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("DIRECCIÓN DEL PLANTEL", W / 2, y + 5, { align: "center" });

  const total = doc.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    doc.setPage(n);
    if (sep) doc.addImage(sep.d, "PNG", 12.2, 12.7, 59.8, 16.9);
    if (dgeta) doc.addImage(dgeta.d, "PNG", 73.6, 17.65, 32.5, 7.2);  // centrado con el logo de Educación
    if (bandera) doc.addImage(bandera.d, "PNG", 175.2, 8.8, 23.8, 24.9);
    if (anio) doc.addImage(anio.d, "PNG", 10, 248.8, 56.7, 23.5);
    doc.setDrawColor(...GUINDA); doc.setLineWidth(0.5); doc.line(61.2, 260.7, 188.7, 260.7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...VINO);
    doc.text("Km 121, Carretera Federal 184, Dziuché, Quintana Roo. CP 77800", 62, 264.5);
    doc.text("www.cbta291.edu.mx", 62, 267.6);
    doc.setTextColor(0);
  }

  const limpio = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "_").slice(0, 40);
  const nombre = `Constancia_PAEC_${proyecto.ciclo}_${limpio(persona.nombre)}.pdf`;
  const blob = doc.output("blob");
  const archivo = typeof File === "function" ? new File([blob], nombre, { type: "application/pdf" }) : null;
  if (archivo && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------- Tarjeta para el Dashboard de la dirección ----------
   Resumen del proyecto PAEC del ciclo actual sin entrar al apartado:
   etapa, docentes sumados, evidencias y actividades del plan. Si las
   tablas del PAEC no existen (por ejemplo, si se quitó), no muestra
   nada. */
export function TarjetaPaec({ db, irA }) {
  const ciclo = db?.config?.cicloActual || "";
  const [info, setInfo] = useState(null);   // null = cargando · false = no mostrar

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: p, error } = await supabase.from("paec_proyectos").select("*").eq("ciclo", ciclo).maybeSingle();
        if (error) throw error;
        if (!p) { if (vivo) setInfo({ sinProyecto: true }); return; }
        const [pa, ev, pl] = await Promise.all([
          supabase.from("paec_participantes").select("docente_id, asignatura").eq("proyecto_id", p.id),
          supabase.from("paec_evidencias").select("fecha, comprobable").eq("proyecto_id", p.id),
          supabase.from("paec_plan").select("id", { count: "exact", head: true }).eq("proyecto_id", p.id),
        ]);
        const part = pa.data || [], evs = ev.data || [];
        if (vivo) setInfo({
          p,
          docentes: new Set(part.map((x) => x.docente_id)).size,
          asignaturas: new Set(part.map((x) => x.asignatura.trim().toLowerCase())).size,
          evidencias: evs.length,
          comprobables: evs.filter((e) => e.comprobable).length,
          ultima: evs.map((e) => e.fecha).sort().pop() || null,
          actividades: pl.count || 0,
        });
      } catch { if (vivo) setInfo(false); }
    })();
    return () => { vivo = false; };
  }, [ciclo]);

  if (info === false) return null;
  const ir = () => irA && irA("paec");
  if (info === null) {
    return <Card className="p-4 text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Cargando PAEC…</Card>;
  }
  if (info.sinProyecto) {
    return (
      <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600"><b>PAEC:</b> todavía no hay proyecto para el ciclo {ciclo}.</p>
        <button className={btnSec + " !px-3 !py-1.5"} onClick={ir}>Ir al PAEC</button>
      </Card>
    );
  }
  const { p } = info;
  const dato = (n, t, alerta) => (
    <div className="min-w-[90px]">
      <div className={`text-xl font-bold ${alerta ? "text-amber-600" : "text-slate-800"}`}>{n}</div>
      <div className="text-[11px] text-slate-500 leading-tight">{t}</div>
    </div>
  );
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">PAEC · ciclo {p.ciclo} · {p.estatus}</p>
          <p className="font-bold text-slate-800 break-words">{p.nombre}</p>
        </div>
        <button className={btnSec + " !px-3 !py-1.5"} onClick={ir}>Ver PAEC</button>
      </div>
      <div className="flex gap-1">
        {ETAPAS.map((e) => (
          <div key={e.n} title={e.nombre}
            className={`flex-1 h-2 rounded-full ${e.n < p.etapa ? "bg-emerald-500" : e.n === p.etapa ? "bg-indigo-500" : "bg-slate-200"}`} />
        ))}
      </div>
      <p className="text-xs text-slate-600">Etapa {p.etapa} de 4: <b>{ETAPAS[p.etapa - 1].nombre}</b></p>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {dato(info.docentes, "docentes sumados")}
        {dato(info.asignaturas, info.asignaturas < 3 ? "asignaturas (pide 3+)" : "asignaturas o módulos", info.asignaturas < 3)}
        {dato(info.actividades, "actividades en el plan")}
        {dato(info.evidencias, info.ultima ? `evidencias · última ${fechaLarga(info.ultima)}` : "evidencias")}
        {dato(`${info.comprobables}/2`, "comprobables SEMS", info.comprobables === 0)}
      </div>
      {p.registrado_sems_en && (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={13} />Registrado en SEMS el {fechaLarga(p.registrado_sems_en)}</p>
      )}
    </Card>
  );
}
