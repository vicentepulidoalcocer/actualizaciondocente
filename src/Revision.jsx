/* ================================================================
   AYUDAS PARA REVISAR DOCUMENTOS (Validaciones)
   ----------------------------------------------------------------
   · VistaDocumento: muestra el PDF o la imagen dentro de la ventana
     de revisión, para comparar con los datos sin cambiar de pestaña.
   · posiblesDuplicados / AvisoDuplicados: buscan, entre las
     constancias y la formación complementaria del MISMO docente,
     documentos con un nombre muy parecido, para que las horas no se
     cuenten dos veces (como un diplomado y la constancia del mismo
     curso).
   ================================================================ */

import React, { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { leerArchivo } from "./lib/nube";

const esCelular = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

export function VistaDocumento({ clave, guardado, alto = "70vh" }) {
  const [doc, setDoc] = useState(null);      // { url, tipo, nombre }
  const [estado, setEstado] = useState("cargando");

  useEffect(() => {
    if (!guardado || !clave) { setEstado("sin"); return; }
    let vivo = true, url = null;
    setEstado("cargando");
    leerArchivo(clave).then((f) => {
      if (!vivo) return;
      if (!f) { setEstado("error"); return; }
      const bytes = atob(f.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const tipo = f.mime || "application/pdf";
      url = URL.createObjectURL(new Blob([arr], { type: tipo }));
      setDoc({ url, tipo, nombre: f.nombre });
      setEstado("listo");
    }).catch(() => vivo && setEstado("error"));
    return () => { vivo = false; if (url) URL.revokeObjectURL(url); };
  }, [clave, guardado]);

  const caja = "rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-400";
  if (estado === "sin") return <div className={caja + " p-6"}>Este registro no tiene documento.</div>;
  if (estado === "cargando") return <div className={caja + " p-6 gap-2"} style={{ minHeight: 160 }}><Loader2 size={16} className="animate-spin" />Cargando documento…</div>;
  if (estado === "error" || !doc) return <div className={caja + " p-6"}>No se pudo abrir el documento.</div>;

  const abrir = (
    <a href={doc.url} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline">
      <ExternalLink size={13} />Abrir en otra pestaña
    </a>
  );

  if (/^image\//.test(doc.tipo)) {
    return (
      <div className="space-y-1.5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-auto" style={{ maxHeight: alto }}>
          <img src={doc.url} alt="Documento" className="w-full h-auto" />
        </div>
        {abrir}
      </div>
    );
  }
  // En el celular el navegador no muestra PDF dentro de la página
  if (esCelular()) {
    return (
      <div className={caja + " p-6 flex-col gap-2 text-center"}>
        <span>El celular abre los PDF aparte.</span>
        <a href={doc.url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1a2340] text-white text-xs font-semibold">
          <ExternalLink size={13} />Ver el documento
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <iframe title="Documento" src={doc.url} className="w-full rounded-xl border border-slate-200 bg-white" style={{ height: alto }} />
      {abrir}
    </div>
  );
}

/* ---------- Posibles duplicados ---------- */

const VACIAS = new Set(("de la el en y los las para del al a con por sobre un una que se su sus o e " +
  "curso cursos diplomado taller constancia formacion integral educacion media superior ems " +
  "modulo nivel basico avanzado introduccion").split(" "));

const palabras = (t) => new Set(String(t || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9ñ ]+/g, " ").split(/\s+/)
  .filter((w) => w.length >= 3 && !VACIAS.has(w)));

// Qué tanto se parecen dos nombres: palabras en común entre las del más corto
const parecido = (a, b) => {
  const A = palabras(a), B = palabras(b);
  const menor = Math.min(A.size, B.size);
  if (menor < 2) return 0;
  let comunes = 0;
  A.forEach((w) => { if (B.has(w)) comunes++; });
  return comunes / menor;
};

/* item: { id, docenteId, nombre, folio? }. Devuelve los documentos del
   mismo docente (constancias y formación complementaria, sin contar
   los rechazados) cuyo nombre se parece mucho. */
export function posiblesDuplicados(db, item) {
  if (!item?.docenteId || !item?.nombre) return [];
  const res = [];
  (db.certs || []).forEach((c) => {
    if (c.id === item.id || c.docenteId !== item.docenteId || c.estado === "rechazada") return;
    const mismoFolio = item.folio && c.datos?.folio && String(item.folio).trim() === String(c.datos.folio).trim();
    const p = parecido(item.nombre, c.datos?.curso);
    if (mismoFolio || p >= 0.7) res.push({
      id: c.id, tipo: "Constancia", nombre: c.datos?.curso || "Sin título",
      horas: Number(c.datos?.horas) || 0, estado: c.estado === "validada" ? "validada" : "pendiente",
      cuando: c.ciclo ? `ciclo ${c.ciclo}` : "", mismoFolio,
    });
  });
  (db.comp || []).forEach((c) => {
    if (c.id === item.id || c.docenteId !== item.docenteId || c.estado === "rechazado") return;
    if (parecido(item.nombre, c.nombre) >= 0.7) res.push({
      id: c.id, tipo: c.tipo || "Formación complementaria", nombre: c.nombre,
      horas: c.tipo === "Diplomado" ? (Number(c.horas) || 0) : null,
      estado: c.estado === "validado" ? "validada" : "pendiente", cuando: c.fecha || "",
    });
  });
  return res;
}

export function AvisoDuplicados({ lista }) {
  if (!lista?.length) return null;
  return (
    <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
      <p className="font-semibold flex items-center gap-2"><AlertTriangle size={16} className="shrink-0" />
        Posible duplicado: este docente ya tiene {lista.length === 1 ? "un documento" : `${lista.length} documentos`} con nombre muy parecido.
      </p>
      <ul className="text-xs space-y-0.5 pl-6 list-disc">
        {lista.map((d) => (
          <li key={d.id}>
            <b>{d.tipo}</b>: {d.nombre}
            {d.horas !== null && d.horas !== undefined ? ` · ${d.horas} h` : ""}
            {d.cuando ? ` · ${d.cuando}` : ""} · {d.estado === "validada" ? "ya validada" : "pendiente"}
            {d.mismoFolio ? " · mismo folio" : ""}
          </li>
        ))}
      </ul>
      <p className="text-xs">Revisa que no sea el mismo curso antes de validar, para no contar las horas dos veces.</p>
    </div>
  );
}
