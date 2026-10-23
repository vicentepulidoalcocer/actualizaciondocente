/* ================================================================
   AUSENTES DE BAETAM · lo que ve un docente asignado a BAETAM
   ----------------------------------------------------------------
   Se muestra dentro de "Alumnos ausentes", debajo de lo
   escolarizado, solo a los docentes que la administración asignó a
   algún semestre de BAETAM. Si el docente no tiene semestres BAETAM,
   no aparece nada.

   Las consultas pasan por vistas "_basico" que la base ya filtra a
   los semestres del docente y sin datos sensibles (sin teléfono,
   tutor, motivos ni documentos).

   Si todavía no se ejecuta docentes_baetam.sql, esta sección
   simplemente no aparece: el resto de la pantalla sigue igual.
   ================================================================ */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { CheckCircle2, Clock, Loader2, RefreshCw, CalendarDays, ClipboardCheck, LogOut } from "lucide-react";
import { supabase } from "./lib/supabase";

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
const diaSemanaDe = (iso) => {
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).getDay();
};
const inicioSemestre = () => {
  const h = new Date();
  const a = h.getFullYear(), m = h.getMonth() + 1;
  if (m >= 8) return `${a}-08-01`;
  if (m === 1) return `${a - 1}-08-01`;
  return `${a}-02-01`;
};
const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const TIPOS_JUSTIFICACION = { medica: "Médica", personal: "Personal", otra: "Otra" };

const inputCls = "w-auto px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2340]/20";
const btnSec = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50";
const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm min-w-0 ${className}`}>{children}</div>
);

export default function AusentesBaetam({ user }) {
  const [semestres, setSemestres] = useState(null);   // null = consultando
  const [fecha, setFecha] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);

  /* 1 · ¿Este docente tiene semestres BAETAM? Y el último día con
     lista de sus semestres, para abrir directamente en ese día
     (BAETAM no tiene clase diario). */
  useEffect(() => {
    let vivo = true;
    (async () => {
      const ds = await supabase.from("docentes_semestre_baetam").select("semestre").eq("docente_id", user.id);
      if (!vivo) return;
      const mios = ds.error ? [] : [...new Set((ds.data || []).map(x => String(x.semestre)))].sort();
      setSemestres(mios);
      if (!mios.length) return;
      const ult = await supabase.from("asistencias_baetam_basico").select("fecha")
        .lte("fecha", hoyISO()).order("fecha", { ascending: false }).limit(1);
      if (!vivo) return;
      setFecha(ult.data?.[0]?.fecha ? String(ult.data[0].fecha).slice(0, 10) : hoyISO());
    })();
    return () => { vivo = false; };
  }, [user.id]);

  /* 2 · Lo del día elegido */
  const consultar = useCallback(async () => {
    if (!fecha || !semestres?.length) return;
    setCargando(true);
    const [al, as, ju, ps, dc, ho] = await Promise.all([
      supabase.from("alumnos_baetam_basico").select("*"),
      supabase.from("asistencias_baetam_basico").select("*").eq("fecha", fecha),
      supabase.from("justificaciones_baetam_basico").select("*").eq("fecha", fecha),
      supabase.from("pases_salida_baetam_basico").select("*").eq("fecha", fecha),
      supabase.from("dias_clase_baetam_basico").select("*").eq("fecha", fecha).maybeSingle(),
      supabase.from("horario_semestres_baetam_basico").select("*"),
    ]);
    setDatos({
      alumnos: al.error ? [] : (al.data || []),
      registros: as.error ? [] : (as.data || []),
      justificaciones: ju.error ? [] : (ju.data || []),
      pases: ps.error ? [] : (ps.data || []),
      especial: dc.error ? null : (dc.data || null),
      horario: new Map((ho.error ? [] : (ho.data || [])).map(h => [String(h.semestre), (h.dias || []).map(Number)])),
    });
    setCargando(false);
  }, [fecha, semestres]);
  useEffect(() => { consultar(); }, [consultar]);

  const grupos = useMemo(() => {
    if (!datos || !semestres) return [];
    const presentes = new Set(datos.registros.map(r => r.alumno_id));
    const just = new Map(datos.justificaciones.map(j => [j.alumno_id, j.tipo]));
    const salida = new Map();
    datos.pases.forEach(p => { if (!salida.has(p.alumno_id) || p.hora > salida.get(p.alumno_id)) salida.set(p.alumno_id, p.hora); });
    const combos = [...new Set(datos.alumnos.filter(a => a.activo !== false && semestres.includes(String(a.semestre || "")))
      .map(a => `${a.semestre || ""}|${a.grupo || ""}`))].sort((x, y) => x.localeCompare(y, "es", { numeric: true }));
    const dow = diaSemanaDe(fecha);

    return combos.map(c => {
      const [sem, letra] = c.split("|");
      const delGrupo = datos.alumnos.filter(a => a.activo !== false
        && String(a.semestre || "") === sem && (a.grupo || "") === letra)
        .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
      const diasSem = datos.horario.get(sem) || [];
      const tocaHorario = !diasSem.length || diasSem.includes(dow);
      const tocaEspecial = !datos.especial || (datos.especial.grupos || []).includes(`${sem}|${letra}`);
      const registrosGrupo = datos.registros.filter(r => String(r.semestre || "") === sem && (r.grupo || "") === letra);
      const faltantes = delGrupo.filter(a => !presentes.has(a.id));
      return {
        sem, letra, total: delGrupo.length, diasSem,
        tuvoClase: tocaHorario && tocaEspecial,
        sinLista: registrosGrupo.length === 0,
        ausentes: faltantes.filter(a => !just.has(a.id)),
        justificados: faltantes.filter(a => just.has(a.id)).map(a => ({ ...a, tipo: just.get(a.id) })),
        retardos: registrosGrupo.filter(r => r.estado === "Retardo")
          .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es")),
        pases: delGrupo.filter(a => presentes.has(a.id) && salida.has(a.id)).map(a => ({ ...a, hora: salida.get(a.id) })),
      };
    });
  }, [datos, semestres, fecha]);

  if (!semestres || !semestres.length) return null;   // no es docente de BAETAM

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h2 className="text-lg font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>Alumnos ausentes · BAETAM</h2>
          <p className="text-sm text-slate-500">
            {fecha ? fmtFechaLarga(fecha).replace(/^./, c => c.toUpperCase()) : "…"} · {semestres.map(s => `${s}°`).join(", ")} semestre
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" className={inputCls} value={fecha || ""} max={hoyISO()}
            onChange={e => setFecha(e.target.value || hoyISO())} />
          <button className={btnSec} onClick={consultar} disabled={cargando}>
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Actualizar
          </button>
        </div>
      </div>

      {!datos ? (
        <Card className="p-6 text-center text-sm text-slate-400"><Loader2 size={15} className="animate-spin inline mr-2" />Consultando…</Card>
      ) : grupos.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-400">No hay alumnos BAETAM registrados en tus semestres.</Card>
      ) : grupos.map(g => (
        <Card key={`${g.sem}${g.letra}`} className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-bold text-sm">BAETAM · {g.sem}° {g.letra ? `“${g.letra}”` : ""}</h3>
            {g.diasSem.length > 0 && (
              <span className="text-xs text-slate-400">Clase: {g.diasSem.map(d => NOMBRE_DIA[d]).join(", ")}</span>
            )}
            {g.tuvoClase && !g.sinLista && (
              <span className="text-xs ml-auto">
                <b className={g.ausentes.length ? "text-rose-600" : "text-emerald-700"}>{g.ausentes.length}</b>
                <span className="text-slate-400"> de {g.total} ausentes</span>
                {g.justificados.length > 0 && <span className="text-sky-600"> · {g.justificados.length} justificado(s)</span>}
              </span>
            )}
          </div>

          {!g.tuvoClase ? (
            <p className="text-sm text-slate-400 py-3 text-center flex items-center justify-center gap-1.5">
              <CalendarDays size={15} />Este semestre no tuvo clase ese día. Elige un día de clase.
            </p>
          ) : g.sinLista ? (
            <p className="text-sm text-slate-400 py-3 text-center">Ese día no se pasó lista con QR en este semestre.</p>
          ) : g.ausentes.length === 0 && g.justificados.length === 0 ? (
            <p className="text-sm text-emerald-700 py-3 text-center flex items-center justify-center gap-1.5">
              <CheckCircle2 size={15} />Asistencia completa
            </p>
          ) : (
            <>
              {g.ausentes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {g.ausentes.map(a => (
                    <span key={a.id} className="text-xs px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-800">{a.nombre}</span>
                  ))}
                </div>
              )}
              {g.justificados.length > 0 && (
                <div className={`flex flex-wrap gap-1.5 ${g.ausentes.length ? "mt-2" : ""}`}>
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

          {g.tuvoClase && g.pases.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-100">
              <p className="text-[11px] font-semibold text-violet-700 mb-1.5 flex items-center gap-1">
                <LogOut size={12} />Pase de salida ({g.pases.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.pases.map(a => (
                  <span key={a.id} className="text-xs px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-800">
                    {a.nombre} <span className="text-violet-600">· salió {a.hora}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {g.tuvoClase && g.retardos.length > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-100">
              <p className="text-[11px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                <Clock size={12} />Llegaron tarde ({g.retardos.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.retardos.map(r => (
                  <span key={r.alumno_id} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                    {r.nombre} <span className="text-amber-600">{(r.hora || "").slice(0, 5)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}

      <SeguimientoBaetam semestres={semestres} />
    </div>
  );
}

/* Faltas acumuladas en el semestre, con el mismo criterio que el
   escolarizado (las justificadas no cuentan) y contando solo los
   días de clase de cada semestre. */
const COLORES_SEM = {
  amarillo: { chip: "bg-amber-50 border-amber-200 text-amber-800", punto: "#E8871E" },
  rojo:     { chip: "bg-rose-50 border-rose-200 text-rose-800",    punto: "#e11d48" },
};

function SeguimientoBaetam({ semestres }) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!abierto || lista) return;
    let vivo = true;
    (async () => {
      const desde = inicioSemestre(), hasta = hoyISO();
      const [al, res, dg] = await Promise.all([
        supabase.from("alumnos_baetam_basico").select("*"),
        supabase.rpc("resumen_inasistencias_baetam", { desde, hasta }),
        supabase.rpc("dias_por_grupo_baetam", { desde, hasta }),
      ]);
      if (!vivo) return;
      if (al.error || res.error || dg.error) { setErr((al.error || res.error || dg.error).message); setLista([]); return; }
      const porAlumno = new Map((res.data || []).map(d => [d.alumno_id, d]));
      const diasDe = new Map((dg.data || []).map(d => [`${d.semestre}|${d.grupo}`, Number(d.dias) || 0]));
      setLista((al.data || [])
        .filter(a => a.activo !== false && semestres.includes(String(a.semestre || "")))
        .map(a => {
          const d = porAlumno.get(a.id) || {};
          const dias = diasDe.get(`${a.semestre || ""}|${a.grupo || ""}`) || 0;
          const presentes = Number(d.presentes) || 0, justificadas = Number(d.justificadas) || 0;
          const faltas = Math.max(0, dias - presentes - justificadas);
          return { ...a, dias, presentes, justificadas, faltas,
            sem: faltas >= 6 ? "rojo" : faltas >= 3 ? "amarillo" : "verde" };
        })
        .filter(a => a.sem !== "verde")
        .sort((a, b) => b.faltas - a.faltas || (a.nombre || "").localeCompare(b.nombre || "", "es")));
    })();
    return () => { vivo = false; };
  }, [abierto, lista, semestres]);

  return (
    <Card className="p-4">
      <button className="w-full flex items-center justify-between gap-2 text-left" onClick={() => setAbierto(v => !v)}>
        <span>
          <span className="font-bold text-sm">Seguimiento de faltas acumuladas · BAETAM</span>
          <span className="block text-xs text-slate-500">Alumnos de tus semestres BAETAM con varias inasistencias</span>
        </span>
        <span className="text-xs text-slate-400 shrink-0">{abierto ? "Ocultar" : "Ver"}</span>
      </button>
      {abierto && (
        <div className="mt-3">
          {lista === null && <p className="text-sm text-slate-400 py-4 text-center"><Loader2 size={15} className="animate-spin inline mr-2" />Calculando…</p>}
          {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">No se pudo consultar: {err}</p>}
          {lista && !err && lista.length === 0 && (
            <p className="text-sm text-emerald-700 py-4 text-center">Ningún alumno de tus semestres BAETAM acumula faltas preocupantes.</p>
          )}
          {lista && lista.map(a => (
            <div key={a.id} className="flex items-center gap-2 py-2 border-b border-slate-100 last:border-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORES_SEM[a.sem].punto }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium break-words">{a.nombre}</div>
                <div className="text-xs text-slate-500">
                  {a.semestre}° {a.grupo || ""} · asistió {a.presentes} de {a.dias} día(s) de clase
                  {a.justificadas > 0 && <span className="text-sky-600"> · {a.justificadas} justificada(s)</span>}
                </div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${COLORES_SEM[a.sem].chip}`}>{a.faltas} falta(s)</span>
            </div>
          ))}
          {lista && lista.length > 0 && (
            <p className="text-[11px] text-slate-400 mt-2">Para justificar una falta o avisar al tutor, acude a la Coordinación BAETAM.</p>
          )}
        </div>
      )}
    </Card>
  );
}
