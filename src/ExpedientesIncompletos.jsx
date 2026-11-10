/* ================================================================
   EXPEDIENTES INCOMPLETOS (dirección y jefatura de formación)
   ----------------------------------------------------------------
   Solo consulta, sin mandar avisos. Por cada docente activo muestra:
   · Licenciatura: si falta, está pendiente o fue rechazada.
   · Cédulas: grados registrados que aún no tienen su cédula.
   · Constancia de situación fiscal: si falta o tiene más de 3 meses.
   · Porcentaje del expediente.
   ================================================================ */

import React, { useMemo, useState } from "react";
import { FolderOpen, Search, CheckCircle2, AlertTriangle } from "lucide-react";

const NIVELES = ["Licenciatura", "Maestría", "Doctorado"];
const DIAS_CSF = 90;

const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "";
const diasDesde = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

const Chip = ({ tono, children }) => {
  const c = { rojo: "bg-rose-50 text-rose-700 border-rose-200", ambar: "bg-amber-50 text-amber-800 border-amber-200",
              verde: "bg-emerald-50 text-emerald-700 border-emerald-200", gris: "bg-slate-50 text-slate-500 border-slate-200" }[tono];
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${c}`}>{children}</span>;
};

export default function ExpedientesIncompletos({ db, irA, completitud }) {
  const [soloPend, setSoloPend] = useState(true);
  const [q, setQ] = useState("");

  const filas = useMemo(() => db.users
    .filter(u => u.rol === "docente" && u.activo)
    .map(u => {
      const grados = Object.fromEntries(NIVELES.map(n => [n, db.grados.find(g => g.docenteId === u.id && g.nivel === n)]));
      const lic = grados.Licenciatura;
      const cedulas = u.cedulas || {};
      const sinCedula = NIVELES.filter(n => grados[n] && grados[n].estado !== "rechazado" && !cedulas[n]);
      const dCsf = diasDesde(u.csf?.cargadaEn);
      const csf = !u.csf ? "falta" : dCsf > DIAS_CSF ? "vieja" : "ok";
      const problemas = (lic?.estado === "validado" ? 0 : 1) + sinCedula.length + (csf === "ok" ? 0 : 1);
      return { u, lic, sinCedula, csf, csfFecha: u.csf?.cargadaEn, pct: completitud(db, u.id).pct, problemas };
    })
    .sort((a, b) => b.problemas - a.problemas || a.u.nombre.localeCompare(b.u.nombre, "es")),
  [db, completitud]);

  const t = q.trim().toLowerCase();
  const visibles = filas.filter(f => (!soloPend || f.problemas > 0) && (!t || f.u.nombre.toLowerCase().includes(t)));
  const conPend = filas.filter(f => f.problemas > 0).length;
  const cuenta = (pred) => filas.filter(pred).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>Expedientes incompletos</h2>
        <p className="text-sm text-slate-500">Qué le falta a cada docente. Solo consulta: no se envían avisos.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Con pendientes", conPend, `de ${filas.length} docentes`],
          ["Licenciatura sin validar", cuenta(f => f.lic?.estado !== "validado"), "falta, pendiente o rechazada"],
          ["Cédulas por subir", filas.reduce((s, f) => s + f.sinCedula.length, 0), "de grados registrados"],
          ["Constancia fiscal", cuenta(f => f.csf !== "ok"), `falta o con más de ${DIAS_CSF / 30} meses`],
        ].map(([t1, n, sub]) => (
          <div key={t1} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className={`text-2xl font-bold ${n ? "text-amber-600" : "text-emerald-700"}`}>{n}</div>
            <div className="text-sm font-semibold text-slate-700">{t1}</div>
            <div className="text-[11px] text-slate-400">{sub}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm" placeholder="Buscar docente…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={soloPend} onChange={e => setSoloPend(e.target.checked)} /> Solo con pendientes
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        {visibles.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600" />{soloPend ? "Ningún expediente tiene pendientes." : "Sin resultados."}
          </p>
        )}
        {visibles.map(({ u, lic, sinCedula, csf, csfFecha, pct, problemas }) => (
          <div key={u.id} className="p-4 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold break-words">{u.nombre}</span>
                <span className="text-xs text-slate-400">Expediente {pct}%</span>
                {problemas === 0 && <Chip tono="verde">Completo</Chip>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!lic && <Chip tono="rojo">Sin licenciatura registrada</Chip>}
                {lic?.estado === "pendiente" && <Chip tono="ambar">Licenciatura por validar</Chip>}
                {lic?.estado === "rechazado" && <Chip tono="rojo">Licenciatura rechazada</Chip>}
                {sinCedula.map(n => <Chip key={n} tono="ambar">Falta cédula de {n}</Chip>)}
                {csf === "falta" && <Chip tono="rojo">Sin constancia fiscal</Chip>}
                {csf === "vieja" && <Chip tono="ambar">Constancia fiscal del {fmt(csfFecha)}</Chip>}
              </div>
            </div>
            <button onClick={() => irA("expediente_docente", u.id)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 shrink-0 self-start sm:self-center">
              <FolderOpen size={14} />Expediente
            </button>
          </div>
        ))}
      </div>
      {filas.some(f => f.csf !== "ok") && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><AlertTriangle size={12} />La constancia fiscal se considera vieja después de 3 meses.</p>
      )}
    </div>
  );
}
