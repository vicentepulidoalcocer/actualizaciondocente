/* ================================================================
   ARCHIVOS SOBRANTES (solo administración general)
   ----------------------------------------------------------------
   Lista los archivos guardados que ya no pertenecen a ningún registro
   (por ejemplo, un documento que alguien eligió y luego no terminó de
   registrar). La lista la calcula la base de datos con la función
   archivos_sobrantes(), que solo propone archivos cuyo identificador
   no aparece en NINGUNA tabla del portal y que tienen más de 2 días.

   Antes de borrar se puede descargar una copia de todo en un ZIP. Para
   borrar hay que escribir BORRAR.
   ================================================================ */

import React, { useEffect, useState } from "react";
import { Loader2, Download, Trash2, CheckCircle2, HardDrive } from "lucide-react";
import { supabase } from "./lib/supabase";

const BUCKET = "archivos";
const TIPOS = {
  documento: "Constancia, título o formación complementaria sin registro",
  entrega: "Entrega sin registro",
  asignacion: "Asignación reemplazada",
  constancia_fiscal: "Constancia fiscal reemplazada",
};
const mb = (b) => (b / 1048576).toLocaleString("es-MX", { maximumFractionDigits: 1 }) + " MB";
const btnSec = "inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50";

export default function ArchivosSobrantes() {
  const [lista, setLista] = useState(null);
  const [err, setErr] = useState("");
  const [trabajo, setTrabajo] = useState("");      // "zip" | "borrar"
  const [avance, setAvance] = useState("");
  const [respaldado, setRespaldado] = useState(false);
  const [hecho, setHecho] = useState("");

  const cargar = async () => {
    setErr(""); setLista(null);
    const { data, error } = await supabase.rpc("archivos_sobrantes");
    if (error) { setErr(error.message); setLista([]); return; }
    setLista(data || []);
  };
  useEffect(() => { cargar(); }, []);

  if (lista === null) return <div className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Buscando archivos sobrantes…</div>;
  if (err) return <p className="text-sm text-slate-400">No se pudo revisar: {err}</p>;

  const total = lista.reduce((s, x) => s + Number(x.tam || 0), 0);
  const documentos = new Set(lista.map((x) => x.base)).size;
  const porTipo = Object.entries(lista.reduce((m, x) => { m[x.tipo] = (m[x.tipo] || 0) + 1; return m; }, {}));

  const descargarZip = async () => {
    setTrabajo("zip"); setAvance("");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let i = 0;
      for (const x of lista) {
        i++; setAvance(`${i} de ${lista.length}`);
        const { data } = await supabase.storage.from(BUCKET).download(x.nombre);
        if (data) zip.file(`${x.tipo}/${x.nombre}`, data);
      }
      zip.file("LEEME.txt", "Copia de archivos sobrantes del portal, descargada antes de borrarlos.\n" +
        lista.map((x) => `${x.nombre}\t${x.tipo}\t${x.subio || ""}\t${String(x.creado).slice(0, 10)}`).join("\n"));
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `archivos_sobrantes_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setRespaldado(true);
    } catch (e) { alert("No se pudo preparar la copia: " + e.message); }
    setTrabajo(""); setAvance("");
  };

  const borrar = async () => {
    const r = window.prompt(`Se borrarán ${lista.length} archivos (${mb(total)}) que no pertenecen a ningún registro.${respaldado ? "" : "\n\nTodavía no descargas la copia en ZIP."}\n\nNo se puede deshacer. Para confirmar, escribe BORRAR:`);
    if (r === null) return;
    if (r.trim().toUpperCase() !== "BORRAR") { alert("No se borró nada: no escribiste BORRAR."); return; }
    setTrabajo("borrar");
    let ok = 0;
    const nombres = lista.map((x) => x.nombre);
    for (let i = 0; i < nombres.length; i += 50) {
      setAvance(`${Math.min(i + 50, nombres.length)} de ${nombres.length}`);
      const { data, error } = await supabase.storage.from(BUCKET).remove(nombres.slice(i, i + 50));
      if (!error) ok += (data || []).length;
    }
    setTrabajo(""); setAvance("");
    setHecho(`Se borraron ${ok} archivos y se liberaron cerca de ${mb(total)}.`);
    await cargar();
  };

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-sm flex items-center gap-2"><HardDrive size={16} />Archivos sobrantes</h3>
      {hecho && <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 size={15} />{hecho}</p>}
      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">No hay archivos sobrantes. 👍</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Hay <b>{lista.length} archivos</b> ({documentos} documentos, <b>{mb(total)}</b>) que ya no pertenecen a ningún
            registro: casi siempre son documentos que alguien eligió y no terminó de registrar, o versiones que se reemplazaron.
          </p>
          <ul className="text-xs text-slate-500 list-disc pl-5">
            {porTipo.map(([t, n]) => <li key={t}>{TIPOS[t] || t}: {n} archivo(s)</li>)}
          </ul>
          <p className="text-xs text-slate-400">
            Solo se proponen archivos que no aparecen en ninguna tabla del portal y que tienen más de 2 días. Avisos,
            justificantes, facturas, permisos, cédulas, programas y calendarios nunca se tocan.
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-indigo-600 font-semibold">Ver la lista</summary>
            <div className="mt-2 max-h-64 overflow-auto border border-slate-200 rounded-lg">
              {lista.map((x) => (
                <div key={x.nombre} className="px-2 py-1 border-b border-slate-100 last:border-0 flex flex-wrap gap-x-3">
                  <span className="font-mono">{x.nombre}</span>
                  <span className="text-slate-400">{String(x.creado).slice(0, 10)} · {x.subio || "—"} · {mb(Number(x.tam || 0))}</span>
                </div>
              ))}
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <button className={btnSec} disabled={!!trabajo} onClick={descargarZip}>
              {trabajo === "zip" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {trabajo === "zip" ? `Descargando ${avance}…` : respaldado ? "Copia descargada ✓" : "1. Descargar copia (ZIP)"}
            </button>
            <button className={btnSec + " !text-rose-600 !border-rose-300"} disabled={!!trabajo} onClick={borrar}>
              {trabajo === "borrar" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {trabajo === "borrar" ? `Borrando ${avance}…` : "2. Borrar sobrantes"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
