/* ================================================================
   ALUMNOS AUSENTES (docente)
   Muestra quién faltó, únicamente en los grupos que el docente
   atiende según su asignación del semestre.
   ================================================================ */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Download, CalendarDays,
  ClipboardCheck,
} from "lucide-react";
import { supabase } from "./lib/supabase";

const btnSec = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50";
const inputCls = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2340]/20";
const Card = ({ children, className = "", ...r }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`} {...r}>{children}</div>
);

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtFechaLarga = (iso) => {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};
const TIPOS_JUSTIFICACION = { medica: "Médica", personal: "Personal", otra: "Otra" };

/* Los grupos vienen escritos de varias formas en la asignación:
   «1° "A"», «3° B», «BAETAM 1° A», «5°C». Se extrae el semestre y la
   letra para poder cruzarlos con el padrón, donde son campos aparte. */
/* Extrae el grupo de una celda del horario: «PM III 3C» → 3° C,
   «CNET I 1B» → 1° B, «UAC F 5B» → 5° B. Las celdas sin grupo
   («TUTORÍA», «PARAESCOLARES», «RECESO») devuelven null. */
export function grupoDeCelda(texto) {
  const t = (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const re = /\b([1-6])\s*°?\s*"?([A-F])"?\b/g;
  let m, ultimo = null;
  while ((m = re.exec(t)) !== null) ultimo = m;
  return ultimo ? { sem: ultimo[1], letra: ultimo[2] } : null;
}

const DIAS_HORARIO = ["lunes", "martes", "miercoles", "jueves", "viernes"];

export function interpretarGrupo(texto) {
  const t = (texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const sem = (t.match(/\b([135])\s*°?/) || t.match(/\b([1-6])\b/) || [])[1] || null;
  // La letra del grupo: una sola letra suelta, normalmente al final
  const letras = t.replace(/BAETAM/g, " ").match(/\b([A-F])\b/g) || [];
  const letra = letras.length ? letras[letras.length - 1].trim() : null;
  return sem && letra ? { sem: String(sem), letra } : null;
}

export default function Ausentes({ db, user }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [alumnos, setAlumnos] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [justificaciones, setJustificaciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState("");

  /* Grupos que atiende el docente, tomados de su asignación vigente.
     Solo cuentan las actividades frente a grupo: una comisión o un
     cargo no implica tener alumnos a cargo. */
  const asig = useMemo(
    () => db.asignaciones.find(a => a.docenteId === user.id) || null,
    [db.asignaciones, user.id]);

  // Día de la semana de la fecha elegida (null en sábado y domingo)
  const diaSemana = useMemo(() => {
    const [a, m, d] = fecha.split("-").map(Number);
    const n = new Date(a, m - 1, d).getDay();   // 0 = domingo
    return n >= 1 && n <= 5 ? DIAS_HORARIO[n - 1] : null;
  }, [fecha]);

  /* Todos los grupos del docente, con las materias que imparte en cada uno */
  const todosMisGrupos = useMemo(() => {
    if (!asig) return [];
    const vistos = new Map();
    (asig.items || []).forEach(it => {
      if (!it.grupo) return;
      const g = interpretarGrupo(it.grupo);
      if (!g) return;
      const clave = `${g.sem}|${g.letra}`;
      if (!vistos.has(clave)) vistos.set(clave, { ...g, materias: new Set() });
      vistos.get(clave).materias.add(it.actividad);
    });
    return [...vistos.values()].sort((a, b) =>
      a.sem.localeCompare(b.sem) || a.letra.localeCompare(b.letra));
  }, [asig]);

  /* Grupos a los que REALMENTE da clase el día elegido, según su horario.
     Sin este filtro aparecerían todos sus grupos incluso en sábado o en
     días en que no los atiende. */
  const hayHorario = !!(asig?.horario || []).length;
  const gruposDelDia = useMemo(() => {
    if (!diaSemana || !hayHorario) return null;
    const conClase = new Set();
    (asig.horario || []).forEach(f => {
      const celda = (f[diaSemana] || "").trim();
      if (!celda || /RECESO/i.test(celda)) return;
      const g = grupoDeCelda(celda);
      if (g) conClase.add(`${g.sem}|${g.letra}`);
    });
    return conClase;
  }, [asig, diaSemana, hayHorario]);

  const misGrupos = useMemo(() => {
    if (!diaSemana) return [];                       // fin de semana
    if (!gruposDelDia) return todosMisGrupos;        // sin horario cargado
    return todosMisGrupos.filter(g => gruposDelDia.has(`${g.sem}|${g.letra}`));
  }, [todosMisGrupos, gruposDelDia, diaSemana]);

  const consultar = useCallback(async () => {
    if (!misGrupos.length) return;
    setCargando(true); setErr("");
    try {
      const [al, as, ju] = await Promise.all([
        supabase.from("alumnos_basico").select("*"),
        supabase.from("asistencias_basico").select("*").eq("fecha", fecha),
        supabase.from("justificaciones_basico").select("*").eq("fecha", fecha),
      ]);
      if (al.error) throw new Error(al.error.message);
      if (as.error) throw new Error(as.error.message);
      if (ju.error) throw new Error(ju.error.message);
      setAlumnos(al.data || []);
      setRegistros(as.data || []);
      setJustificaciones(ju.data || []);
    } catch (e) { setErr(e.message); }
    setCargando(false);
  }, [fecha, misGrupos.length]);

  useEffect(() => { consultar(); }, [consultar]);

  const porGrupo = useMemo(() => {
    if (!alumnos) return [];
    const presentes = new Set(registros.map(r => r.alumno_id));
    const justificados = new Set(justificaciones.map(j => j.alumno_id));
    const tipoDe = new Map(justificaciones.map(j => [j.alumno_id, j.tipo]));
    return misGrupos.map(g => {
      const delGrupo = alumnos.filter(a => a.activo !== false
        && String(a.semestre || "") === g.sem && (a.grupo || "") === g.letra);
      const faltantes = delGrupo.filter(a => !presentes.has(a.id))
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
      const ausentes = faltantes.filter(a => !justificados.has(a.id));
      const justificadosGrupo = faltantes.filter(a => justificados.has(a.id))
        .map(a => ({ ...a, tipo: tipoDe.get(a.id) }));
      const conRetardo = registros.filter(r => String(r.semestre || "") === g.sem
        && (r.grupo || "") === g.letra && r.estado === "Retardo")
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
      return { ...g, total: delGrupo.length, ausentes, justificados: justificadosGrupo, conRetardo,
        presentes: delGrupo.length - faltantes.length };
    });
  }, [alumnos, registros, justificaciones, misGrupos]);

  const totalAusentes = porGrupo.reduce((n, g) => n + g.ausentes.length, 0);
  const totalJustificados = porGrupo.reduce((n, g) => n + g.justificados.length, 0);
  const totalAlumnos = porGrupo.reduce((n, g) => n + g.total, 0);
  const sinPadron = alumnos && porGrupo.every(g => g.total === 0);

  const exportar = () => {
    const filas = [["Fecha", "Semestre", "Grupo", "ID", "Alumno", "Situación"]];
    porGrupo.forEach(g => {
      g.ausentes.forEach(a => filas.push([fecha, g.sem, g.letra, a.id, a.nombre, "Ausente"]));
      g.justificados.forEach(a => filas.push([fecha, g.sem, g.letra, a.id, a.nombre,
        `Justificado (${TIPOS_JUSTIFICACION[a.tipo] || a.tipo || "sin tipo"})`]));
      g.conRetardo.forEach(r => filas.push([fecha, g.sem, g.letra, r.alumno_id, r.nombre,
        `Retardo (${(r.hora || "").slice(0, 5)})`]));
    });
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `ausentes_${fecha}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!misGrupos.length) {
    const motivo = !diaSemana
      ? "Ese día no hay clases: es fin de semana. Elige un día de lunes a viernes."
      : !todosMisGrupos.length
        ? "Aún no hay grupos asociados a tu asignación. Cuando el Departamento Académico publique la asignación del semestre, aquí aparecerán los alumnos de tus grupos."
        : `Según tu horario no tienes clases el ${diaSemana === "miercoles" ? "miércoles" : diaSemana}. Elige otro día para ver las ausencias de tus grupos.`;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>Alumnos ausentes</h2>
            <p className="text-sm text-slate-500 capitalize">{fmtFechaLarga(fecha)}</p>
          </div>
          <input type="date" className={inputCls + " !mt-0 !w-auto"} value={fecha} max={hoyISO()}
            onChange={e => setFecha(e.target.value)} />
        </div>
        <Card className="p-8 text-center text-sm text-slate-400">{motivo}</Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>Alumnos ausentes</h2>
          <p className="text-sm text-slate-500 capitalize">
            {fmtFechaLarga(fecha)} · {misGrupos.length} grupo(s) con clase
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" className={inputCls + " !mt-0 !w-auto"} value={fecha} max={hoyISO()}
            onChange={e => setFecha(e.target.value)} />
          <button className={btnSec + " !px-3 !py-1.5"} onClick={consultar} disabled={cargando}>
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Actualizar
          </button>
          <button className={btnSec + " !px-3 !py-1.5"} onClick={exportar} disabled={!alumnos}>
            <Download size={13} />CSV
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</p>}
      {cargando && !alumnos && <Card className="p-8 text-center text-sm text-slate-400"><Loader2 size={16} className="animate-spin inline mr-2" />Consultando…</Card>}

      {alumnos && sinPadron && (
        <Card className="p-4 text-sm text-amber-800 bg-amber-50 border-amber-200">
          No hay alumnos registrados en el padrón para tus grupos. Consulta con control escolar.
        </Card>
      )}

      {alumnos && !sinPadron && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1"><Users size={15} /><span className="text-[11px] uppercase font-semibold">Mis alumnos</span></div>
              <div className="text-2xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>{totalAlumnos}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{porGrupo.length} grupo(s)</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1"><CheckCircle2 size={15} /><span className="text-[11px] uppercase font-semibold">Presentes</span></div>
              <div className="text-2xl font-bold text-emerald-700" style={{ fontFamily: "'Archivo', sans-serif" }}>{totalAlumnos - totalAusentes - totalJustificados}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {totalAlumnos ? Math.round(100 * (totalAlumnos - totalAusentes - totalJustificados) / totalAlumnos) : 0}% de asistencia
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1"><ClipboardCheck size={15} /><span className="text-[11px] uppercase font-semibold">Justificados</span></div>
              <div className={`text-2xl font-bold ${totalJustificados ? "text-sky-600" : "text-slate-900"}`} style={{ fontFamily: "'Archivo', sans-serif" }}>{totalJustificados}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-400 mb-1"><AlertTriangle size={15} /><span className="text-[11px] uppercase font-semibold">Ausentes</span></div>
              <div className={`text-2xl font-bold ${totalAusentes ? "text-rose-600" : "text-slate-900"}`} style={{ fontFamily: "'Archivo', sans-serif" }}>{totalAusentes}</div>
            </Card>
          </div>

          {porGrupo.map(g => (
            <Card key={`${g.sem}${g.letra}`} className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h3 className="font-bold text-sm">{g.sem}° “{g.letra}”</h3>
                <span className="text-xs text-slate-400">
                  {[...g.materias].join(" · ")}
                </span>
                <span className="text-xs ml-auto">
                  <b className={g.ausentes.length ? "text-rose-600" : "text-emerald-700"}>
                    {g.ausentes.length}
                  </b>
                  <span className="text-slate-400"> de {g.total} ausentes</span>
                  {g.justificados.length > 0 && <span className="text-sky-600"> · {g.justificados.length} justificado(s)</span>}
                </span>
              </div>

              {g.total === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">Sin alumnos en el padrón para este grupo.</p>
              ) : g.ausentes.length === 0 && g.justificados.length === 0 ? (
                <p className="text-sm text-emerald-700 py-3 text-center flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={15} />Asistencia completa
                </p>
              ) : (
                <>
                  {g.ausentes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {g.ausentes.map(a => (
                        <span key={a.id} className="text-xs px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800">
                          {a.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                  {g.justificados.length > 0 && (
                    <div className={`flex flex-wrap gap-1.5 ${g.ausentes.length > 0 ? "mt-2" : ""}`}>
                      {g.justificados.map(a => (
                        <span key={a.id} className="text-xs px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 text-sky-800 inline-flex items-center gap-1">
                          <ClipboardCheck size={11} />{a.nombre}
                          <span className="text-sky-600">· {TIPOS_JUSTIFICACION[a.tipo] || "justificado"}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}

              {g.conRetardo.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                    <Clock size={12} />Llegaron tarde ({g.conRetardo.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.conRetardo.map(r => (
                      <span key={r.alumno_id} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                        {r.nombre} <span className="text-amber-600">{(r.hora || "").slice(0, 5)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}

          <p className="text-[11px] text-slate-400">
            Se muestran solo los grupos a los que das clase este día, según tu horario.
            La ausencia proviene del registro de entrada al plantel, tomado en la mañana por
            control escolar: no sustituye tu propio pase de lista por clase.
          </p>
          {!hayHorario && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Tu asignación no incluye horario, así que se muestran todos tus grupos. Cuando el
              Departamento Académico vuelva a cargar las asignaciones, se filtrarán por día.
            </p>
          )}
        </>
      )}
    </div>
  );
}
