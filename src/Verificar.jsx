/* Página pública de verificación de constancias: se abre al escanear el
   QR de una constancia (…/?verificar=FOLIO). No requiere iniciar sesión. */
import React, { useEffect, useState } from "react";
import { consultarFolio } from "./lib/verificacion.js";

const TIPOS = {
  entregas: "Constancia de cumplimiento de entregas académicas",
  paec: "Constancia de participación en el PAEC",
};
const fecha = (iso) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Cancun" });

export default function Verificar({ folio }) {
  const [estado, setEstado] = useState("cargando");
  const [c, setC] = useState(null);
  useEffect(() => {
    consultarFolio(folio)
      .then((d) => { setC(d); setEstado(d ? "valida" : "no"); })
      .catch(() => setEstado("error"));
  }, [folio]);

  return (
    <div className="min-h-screen bg-[#1a2340] flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-[#1f7a3f] text-white px-6 py-5 flex items-center gap-4">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="w-14 h-14 rounded-full bg-white p-1" />
          <div>
            <p className="text-[11px] uppercase tracking-wider opacity-80">CBTA No. 291 · Dziuché, Q. Roo</p>
            <p className="font-bold text-lg leading-tight">Verificación de constancias</p>
          </div>
        </div>
        <div className="p-6">
          {estado === "cargando" && <p className="text-slate-500 text-sm">Consultando el folio…</p>}
          {estado === "error" && <p className="text-rose-700 text-sm">No se pudo consultar en este momento. Revisa tu conexión e inténtalo de nuevo.</p>}
          {estado === "no" && (
            <div>
              <p className="text-rose-700 font-bold text-lg">Folio no encontrado</p>
              <p className="text-sm text-slate-600 mt-2">El folio <b className="font-mono">{folio}</b> no corresponde a ninguna constancia emitida por el plantel. El documento podría no ser auténtico.</p>
            </div>
          )}
          {estado === "valida" && c && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-lg">
                <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">✓</span> Constancia auténtica
              </div>
              <dl className="text-sm space-y-3">
                <div><dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Documento</dt><dd className="font-semibold text-slate-800">{TIPOS[c.tipo] || "Constancia"}</dd></div>
                <div><dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Se otorgó a</dt><dd className="font-bold text-slate-900 text-base">{c.titular}</dd></div>
                <div><dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Ampara</dt><dd className="text-slate-700">{c.detalle}</dd></div>
                <div className="flex gap-6">
                  <div><dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Emitida</dt><dd className="text-slate-700">{fecha(c.emitida_en)}</dd></div>
                  <div><dt className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Folio</dt><dd className="font-mono text-slate-700">{c.folio}</dd></div>
                </div>
              </dl>
              <p className="text-[11px] text-slate-400">Este registro lo conserva el plantel aunque los archivos del semestre ya no estén disponibles.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
