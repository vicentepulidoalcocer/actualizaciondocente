/* ================================================================
   BITÁCORA DE CAMBIOS
   ----------------------------------------------------------------
   Quién agregó, cambió o borró qué, y cuándo, con el antes y el
   después de cada registro. La anota la propia base de datos
   (bitacora.sql); aquí solo se consulta. Solo la ve la
   administración general.
   ================================================================ */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { History, Loader2, Download, Search, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase } from "./lib/supabase";

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);
const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";
const btnSec = "inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50";

const TABLAS = {
  asistencias: "Asistencia QR",
  asistencias_baetam: "Asistencia BAETAM",
  justificaciones: "Justificaciones",
  justificaciones_baetam: "Justificaciones BAETAM",
  pases_salida: "Pases de salida",
  pases_salida_baetam: "Pases de salida BAETAM",
  alumnos: "Padrón de alumnos",
  alumnos_baetam: "Padrón BAETAM",
  dias_clase: "Días especiales",
  dias_clase_baetam: "Días especiales BAETAM",
  horario_semestres_baetam: "Horario BAETAM",
  docentes_semestre_baetam: "Docentes BAETAM",
  finanzas: "Finanzas",
  certs: "Constancias",
  entregas: "Entregas académicas",
};
const ACCIONES = {
  alta:    ["Agregó", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  cambio:  ["Cambió", "bg-amber-50 text-amber-700 border-amber-200"],
  borrado: ["Borró",  "bg-rose-50 text-rose-700 border-rose-200"],
};
const ROLES = {
  admin: "Administración", administrativo: "Control escolar", coord_baetam: "Coord. BAETAM",
  docente: "Docente", jefe_academico: "Jefatura académica", jefe_formacion: "Jefatura de formación",
  jefe_rh: "Recursos humanos", coord_tutorias: "Tutorías", personal_administrativo: "Personal administrativo",
};
// Campos que no aportan al leer el cambio
const OCULTOS = new Set(["id", "creado", "creado_en", "actualizado", "actualizado_en", "updated_at", "registrado_por", "data"]);

const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Cancun" });
const haceDias = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Cancun" });
};
const diaSiguiente = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
};
const fmtFechaHora = (ts) => new Date(ts).toLocaleString("es-MX", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Cancun" });
const texto = (v) => v === null || v === undefined || v === "" ? "—"
  : typeof v === "object" ? JSON.stringify(v) : String(v);
const fechaCorta = (f) => {
  if (!f) return "";
  const [a, m, d] = String(f).slice(0, 10).split("-").map(Number);
  return a ? new Date(a, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : String(f);
};

/* De qué o de quién se trata el registro, en palabras */
function resumen(r, nombres) {
  const f = r.despues || r.antes || {};
  const d = f.data && typeof f.data === "object" ? f.data : {};
  const alumno = f.nombre || nombres.get(String(r.alumno_id)) || r.alumno_id;
  switch (r.tabla.replace(/_baetam$/, "")) {
    case "asistencias":
      return `${alumno || "Alumno"} · ${fechaCorta(f.fecha)} · ${f.estado || ""}${f.hora ? ` ${String(f.hora).slice(0, 5)}` : ""}${f.manual ? " (manual)" : ""}`;
    case "justificaciones":
      return `${alumno || "Alumno"} · ${fechaCorta(f.fecha)} · ${f.tipo || ""}${f.motivo ? ` · ${f.motivo}` : ""}`;
    case "pases_salida":
      return `${alumno || "Alumno"} · ${fechaCorta(f.fecha)} · salió ${String(f.hora || "").slice(0, 5)}${f.recoge ? ` · ${f.recoge}` : ""}`;
    case "alumnos":
      return `${f.nombre || r.registro} · ${f.semestre ? `${f.semestre}° ` : ""}${f.grupo || ""}`;
    case "dias_clase":
      return `${fechaCorta(f.fecha)} · ${f.motivo || "día especial"}`;
    case "horario_semestres":
      return `Semestre ${f.semestre}`;
    case "docentes_semestre":
      return `Semestre ${f.semestre}`;
    case "finanzas":
      return [f.concepto || d.concepto, f.monto ?? d.monto, f.tipo || d.tipo].filter(v => v !== undefined && v !== null && v !== "").join(" · ") || `Movimiento ${r.registro}`;
    case "certs":
      return d.datos?.curso || d.archivoNombre || `Constancia ${r.registro}`;
    case "entregas":
      return [d.actividad, d.tipo].filter(Boolean).join(" · ") || `Entrega ${r.registro}`;
    default:
      return `Registro ${r.registro || ""}`;
  }
}

/* Lista de campos con su valor antes y después */
function camposDe(r) {
  const a = r.antes || {}, d = r.despues || {};
  const llaves = r.accion === "cambio" && r.cambios?.length
    ? r.cambios
    : [...new Set([...Object.keys(a), ...Object.keys(d)])].filter(k => !OCULTOS.has(k));
  return llaves.map(k => [k, a[k], d[k]]);
}

export default function Bitacora() {
  const [desde, setDesde] = useState(haceDias(7));
  const [hasta, setHasta] = useState(hoyISO());
  const [tabla, setTabla] = useState("");
  const [accion, setAccion] = useState("");
  const [persona, setPersona] = useState("");
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [err, setErr] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [nombres, setNombres] = useState(new Map());
  const TAM = 500;

  // Nombres de alumnos, para las justificaciones que solo guardan el ID
  useEffect(() => {
    Promise.all([
      supabase.from("alumnos").select("id, nombre").range(0, 4999),
      supabase.from("alumnos_baetam").select("id, nombre").range(0, 4999),
    ]).then(rs => {
      const m = new Map();
      rs.forEach(r => (r.error ? [] : r.data || []).forEach(a => m.set(String(a.id), a.nombre)));
      setNombres(m);
    });
  }, []);

  const consultar = useCallback(async (mas = false) => {
    setErr("");
    if (!mas) { setFilas(null); setAbierto(null); }
    let qy = supabase.from("bitacora_cambios").select("*")
      .gte("creado", `${desde}T00:00:00-05:00`)
      .lt("creado", `${diaSiguiente(hasta)}T00:00:00-05:00`)
      .order("creado", { ascending: false });
    if (tabla) qy = qy.eq("tabla", tabla);
    if (accion) qy = qy.eq("accion", accion);
    const inicio = mas ? (filas?.length || 0) : 0;
    const { data, error } = await qy.range(inicio, inicio + TAM - 1);
    if (error) {
      setErr(/bitacora_cambios/.test(error.message) || error.code === "42P01" || error.code === "PGRST205"
        ? "La bitácora aún no está activa. Ejecuta bitacora.sql en Supabase."
        : error.message);
      setFilas(mas ? filas : []);
      return;
    }
    setFilas(mas ? [...(filas || []), ...(data || [])] : (data || []));
    setHayMas((data || []).length === TAM);
  }, [desde, hasta, tabla, accion, filas]);

  useEffect(() => { consultar(false); }, [desde, hasta, tabla, accion]);   // eslint-disable-line

  const personas = useMemo(() =>
    [...new Set((filas || []).map(r => r.usuario_nombre || "Sistema"))].sort((a, b) => a.localeCompare(b, "es")), [filas]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (filas || []).filter(r =>
      (!persona || (r.usuario_nombre || "Sistema") === persona) &&
      (!t || `${resumen(r, nombres)} ${r.alumno_id || ""} ${r.usuario_nombre || ""}`.toLowerCase().includes(t)));
  }, [filas, persona, q, nombres]);

  const exportar = () => {
    const f = [["Fecha y hora", "Persona", "Rol", "Acción", "Sección", "Registro", "Campos cambiados", "Antes", "Después"]];
    visibles.forEach(r => f.push([fmtFechaHora(r.creado), r.usuario_nombre || "Sistema", ROLES[r.usuario_rol] || r.usuario_rol || "",
      ACCIONES[r.accion]?.[0] || r.accion, TABLAS[r.tabla] || r.tabla, resumen(r, nombres), (r.cambios || []).join(", "),
      r.antes ? JSON.stringify(r.antes) : "", r.despues ? JSON.stringify(r.despues) : ""]));
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + f.map(x => x.map(esc).join(",")).join("\n");
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    el.download = `bitacora_${desde}_a_${hasta}.csv`;
    el.click();
    URL.revokeObjectURL(el.href);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ fontFamily: "'Archivo', sans-serif" }}>
          <History size={20} />Bitácora de cambios
        </h2>
        <p className="text-sm text-slate-500">
          Quién agregó, cambió o borró registros, y cuándo. Los escaneos normales con QR no aparecen;
          los registros manuales y cualquier cambio o borrado, sí.
        </p>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="text-xs text-slate-500">Desde
            <input type="date" className={inputCls} value={desde} max={hasta} onChange={e => setDesde(e.target.value || haceDias(7))} />
          </label>
          <label className="text-xs text-slate-500">Hasta
            <input type="date" className={inputCls} value={hasta} max={hoyISO()} onChange={e => setHasta(e.target.value || hoyISO())} />
          </label>
          <label className="text-xs text-slate-500">Sección
            <select className={inputCls} value={tabla} onChange={e => setTabla(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(TABLAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">Acción
            <select className={inputCls} value={accion} onChange={e => setAccion(e.target.value)}>
              <option value="">Todas</option>
              <option value="alta">Agregó</option>
              <option value="cambio">Cambió</option>
              <option value="borrado">Borró</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">Persona
            <select className={inputCls} value={persona} onChange={e => setPersona(e.target.value)}>
              <option value="">Todas</option>
              {personas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500 col-span-2 md:col-span-2">Buscar alumno o registro
            <div className="relative">
              <Search size={14} className="absolute left-3 top-[calc(50%+2px)] -translate-y-1/2 text-slate-400" />
              <input className={inputCls + " !pl-9"} placeholder="Nombre, matrícula, concepto…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </label>
          <div className="flex items-end">
            <button className={btnSec + " w-full justify-center"} onClick={exportar} disabled={!visibles.length}>
              <Download size={14} />Excel
            </button>
          </div>
        </div>
      </Card>

      {err && (
        <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />{err}
        </Card>
      )}

      <Card className="overflow-hidden">
        {filas === null ? (
          <p className="text-sm text-slate-400 py-10 text-center"><Loader2 size={16} className="animate-spin inline mr-2" />Consultando…</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-slate-400 py-10 text-center">Sin cambios registrados con estos filtros.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibles.map(r => {
              const [verbo, color] = ACCIONES[r.accion] || [r.accion, "bg-slate-50 text-slate-600 border-slate-200"];
              const abiertoAqui = abierto === r.id;
              return (
                <div key={r.id}>
                  <button className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3" onClick={() => setAbierto(abiertoAqui ? null : r.id)}>
                    {abiertoAqui ? <ChevronDown size={16} className="mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 text-slate-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${color}`}>{verbo}</span>
                        <span className="text-xs font-semibold text-slate-600">{TABLAS[r.tabla] || r.tabla}</span>
                        {r.accion === "cambio" && r.cambios?.length > 0 && (
                          <span className="text-[11px] text-slate-400">({r.cambios.join(", ")})</span>
                        )}
                      </div>
                      <div className="text-sm text-slate-800 mt-0.5 break-words">{resumen(r, nombres)}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {r.usuario_nombre || "Sistema"}{r.usuario_rol ? ` · ${ROLES[r.usuario_rol] || r.usuario_rol}` : ""} · {fmtFechaHora(r.creado)}
                      </div>
                    </div>
                  </button>
                  {abiertoAqui && (
                    <div className="px-4 pb-4 pl-11">
                      <div className="border border-slate-200 rounded-xl overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500">
                            <tr><th className="text-left px-3 py-2">Campo</th>
                              {r.accion !== "alta" && <th className="text-left px-3 py-2">Antes</th>}
                              {r.accion !== "borrado" && <th className="text-left px-3 py-2">Después</th>}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {camposDe(r).map(([k, a, d]) => (
                              <tr key={k}>
                                <td className="px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap">{k}</td>
                                {r.accion !== "alta" && <td className="px-3 py-1.5 text-rose-700 break-all">{texto(a)}</td>}
                                {r.accion !== "borrado" && <td className="px-3 py-1.5 text-emerald-700 break-all">{texto(d)}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hayMas && (
          <div className="p-3 text-center border-t border-slate-100">
            <button className={btnSec} onClick={() => consultar(true)}>Cargar más</button>
          </div>
        )}
      </Card>
    </div>
  );
}
