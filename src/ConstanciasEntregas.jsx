/* ================================================================
   CONSTANCIAS DE ENTREGAS (Jefatura Académica y Dirección)
   ----------------------------------------------------------------
   Por cada docente con asignación en el semestre elegido revisa si
   entregó todo lo que su asignación pide: planeaciones, planes de
   trabajo, informes, ficha de identificación (tutores) y la captura de
   seguimiento. Usa exactamente el mismo cálculo que "Mi asignación" y
   el "Ranking de entregas".
   · Quien entregó todo → CONSTANCIA de cumplimiento (PDF verde).
   · Quien no → REPORTE de entregas con lo entregado y lo pendiente
     (no es constancia).
   El formato es el verde institucional de los reportes de alumnos.
   ================================================================ */

import React, { useMemo, useState } from "react";
import { Award, FileText, Download, Loader2, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Search } from "lucide-react";

const TIPOS = ["planeacion", "plan", "informe", "ficha"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const btnSec = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50";
const btnPrim = "inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-[#1a2340] text-white text-sm font-semibold hover:bg-[#2a3660] transition disabled:opacity-50";

/* Detalle de lo requerido y lo entregado por un docente */
function revisarDocente(db, asig, h) {
  const filas = [];
  let indeterminado = false;
  for (const e of h.encargosDe(db, asig)) {
    for (const t of TIPOS) {
      const n = e.requisitos[t];
      if (n === undefined) continue;                     // no aplica
      if (n === null) { indeterminado = true; filas.push({ encargo: e.actividad, tipo: t, req: null, ent: 0 }); continue; }
      if (n === 0) continue;
      const ent = Math.min(h.entregasDe(db, asig.docenteId, asig.ciclo, e.clave, t, asig.periodo || "ago-ene").length, n);
      filas.push({ encargo: e.actividad, tipo: t, req: n, ent });
    }
  }
  filas.push({ encargo: "Captura de seguimiento del semestre", tipo: "captura", req: 1,
    ent: h.capturaDe(db, asig.docenteId, asig.ciclo, asig.periodo) ? 1 : 0 });
  const req = filas.reduce((s, f) => s + (f.req || 0), 0);
  const ent = filas.reduce((s, f) => s + (f.req ? f.ent : 0), 0);
  const completo = !indeterminado && filas.every(f => f.req !== null && f.ent >= f.req);
  return { filas, req, ent, pct: req ? Math.round(100 * ent / req) : 0, completo, indeterminado };
}

/* ---------- PDF (formato verde institucional) ---------- */
const CDN_JSPDF = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm";
const CDN_AUTOTABLE = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.mjs";
const funcionDe = (m, n) => [m?.[n], m?.default?.[n], m?.default, m?.default?.default].find(f => typeof f === "function");
let promesaLib = null, promesaLogo = null;
const cargarLib = () => {
  if (!promesaLib) {
    promesaLib = Promise.all([import(/* @vite-ignore */ CDN_JSPDF), import(/* @vite-ignore */ CDN_AUTOTABLE)])
      .then(([a, b]) => ({ jsPDF: funcionDe(a, "jsPDF"), autoTable: funcionDe(b, "autoTable") }))
      .catch(e => { promesaLib = null; throw e; });
  }
  return promesaLib;
};
const cargarLogo = () => {
  if (!promesaLogo) {
    promesaLogo = fetch(import.meta.env.BASE_URL + "logo.png")
      .then(r => r.ok ? r.blob() : Promise.reject(new Error("sin logo")))
      .then(b => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(b); }))
      .then(d => new Promise(ok => { const i = new Image(); i.onload = () => ok({ d, w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = d; }))
      .catch(() => null);
  }
  return promesaLogo;
};
const limpio = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "").slice(0, 50);

async function pdfDocente({ docente, rev, ciclo, periodo, h }) {
  const [{ jsPDF, autoTable }, logo] = await Promise.all([cargarLib(), cargarLogo()]);
  const VERDE = [31, 122, 63], AMARILLO = [232, 185, 49], TXT = [24, 33, 27], GRIS = [74, 90, 79], ROJO = [190, 18, 60];
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 42;
  const semestre = `${h.nombrePeriodo(periodo)}, ciclo escolar ${ciclo}`;

  const encabezado = () => {
    if (logo) { const hh = 62, w = hh * logo.w / logo.h; doc.addImage(logo.d, "PNG", M, 26, w, hh); }
    doc.setTextColor(...GRIS); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text("SEMS - DGETAYCM", W - M, 36, { align: "right" });
    doc.setTextColor(...VERDE); doc.setFontSize(11);
    doc.text("Centro de Bachillerato Tecnológico", W - M, 51, { align: "right" });
    doc.text("Agropecuario No. 291", W - M, 64, { align: "right" });
    doc.setTextColor(...TXT); doc.setFontSize(9);
    doc.text("“Ignacio Ramírez Calzada”", W - M, 76, { align: "right" });
    doc.setTextColor(...GRIS); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text("C.C.T. 23DTA0291Z", W - M, 87, { align: "right" });
    doc.setDrawColor(...VERDE); doc.setLineWidth(2.4); doc.line(M, 97, W - M, 97);
  };
  const pie = (n, total) => {
    doc.setDrawColor(...VERDE); doc.setLineWidth(0.8); doc.line(M, H - 50, W - M, H - 50);
    doc.setTextColor(61, 74, 65); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text("Carretera Federal 184, Km 121, Dziuché, Quintana Roo, C.P. 77800", W / 2, H - 39, { align: "center" });
    const ancho = W - 2 * M;
    doc.setFillColor(...VERDE); doc.rect(M, H - 32, ancho * 0.857, 6, "F");
    doc.setFillColor(...AMARILLO); doc.rect(M + ancho * 0.857, H - 32, ancho * 0.143, 6, "F");
    doc.setTextColor(140, 150, 143); doc.setFontSize(7);
    doc.text(`Generado desde Mi portal CBTA 291 · Página ${n} de ${total}`, W / 2, H - 16, { align: "center" });
  };

  encabezado();
  const hoy = new Date();
  doc.setTextColor(...GRIS); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Dziuché, Q. Roo, a ${hoy.getDate()} de ${MESES_LARGOS[hoy.getMonth()]} de ${hoy.getFullYear()}`, W - M, 120, { align: "right" });

  let y;
  if (rev.completo) {
    doc.setTextColor(...VERDE); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text("CONSTANCIA", W / 2, 168, { align: "center" });
    doc.setTextColor(...GRIS); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("de cumplimiento de entregas académicas", W / 2, 184, { align: "center" });
    doc.setTextColor(...TXT); doc.setFontSize(11);
    doc.text("La Jefatura Académica y de Competencias Docentes del plantel hace constar que", W / 2, 222, { align: "center" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(17);
    const nom = doc.splitTextToSize(docente.nombre.toUpperCase(), W - 2 * M);
    doc.text(nom, W / 2, 252, { align: "center" });
    y = 252 + nom.length * 20;
    doc.setDrawColor(...AMARILLO); doc.setLineWidth(1.2); doc.line(W / 2 - 130, y - 12, W / 2 + 130, y - 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    const p = doc.splitTextToSize(
      `cumplió con la entrega de la totalidad de los documentos académicos que corresponden a su asignación del semestre ${semestre}: ` +
      `planeaciones didácticas, planes de trabajo, informes y captura de seguimiento, según aplica a cada una de sus actividades ` +
      `(${rev.ent} de ${rev.req} documentos requeridos).`, W - 2 * M - 30);
    doc.text(p, W / 2, y + 8, { align: "center", lineHeightFactor: 1.5 });
    y += 8 + p.length * 16.5 + 10;
  } else {
    doc.setTextColor(...TXT); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("Reporte de entregas académicas", M, 146);
    doc.setTextColor(...GRIS); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text(`Semestre ${semestre}`, M, 162);
    autoTable(doc, {
      startY: 172, theme: "plain", margin: { left: M, right: M },
      styles: { font: "helvetica", fontSize: 9.5, textColor: TXT, cellPadding: { top: 3, bottom: 3, left: 0, right: 6 } },
      columnStyles: { 0: { fontStyle: "bold", textColor: GRIS, cellWidth: 92 } },
      body: [["Docente:", docente.nombre], ["Avance:", `${rev.ent} de ${rev.req} documentos requeridos (${rev.pct}%)${rev.indeterminado ? " · hay requisitos por definir" : ""}`]],
    });
    y = doc.lastAutoTable.finalY + 6;
    doc.setTextColor(...ROJO); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Este documento no es una constancia: informa lo entregado y lo pendiente a la fecha.", M, y + 8);
    y += 18;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: 112, bottom: 64 },
    head: [["Actividad", "Documento", "Requeridos", "Entregados", "Situación"]],
    body: rev.filas.map(f => [
      f.encargo, h.NOMBRE_TIPO_ENTREGA[f.tipo] || f.tipo,
      f.req === null ? "Por definir" : String(f.req), String(f.ent),
      f.req === null ? "Por definir" : f.ent >= f.req ? "Completo" : `Faltan ${f.req - f.ent}`,
    ]),
    styles: { font: "helvetica", fontSize: 8.5, textColor: TXT, cellPadding: 4, lineColor: [226, 232, 228], lineWidth: 0.5, valign: "middle" },
    headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: { 1: { cellWidth: 104 }, 2: { cellWidth: 62, halign: "center" }, 3: { cellWidth: 62, halign: "center" }, 4: { cellWidth: 70, fontStyle: "bold" } },
    didParseCell: (d) => {
      if (d.section !== "body" || d.column.index !== 4) return;
      d.cell.styles.textColor = d.cell.raw === "Completo" ? [4, 120, 87] : d.cell.raw === "Por definir" ? [180, 83, 9] : ROJO;
    },
    didDrawPage: (d) => { if (d.pageNumber > 1) encabezado(); },
  });

  y = doc.lastAutoTable.finalY + 18;
  if (y > H - 190) { doc.addPage(); encabezado(); y = 130; }
  doc.setTextColor(...GRIS); doc.setFont("helvetica", "italic"); doc.setFontSize(7.5);
  doc.text(rev.completo
    ? "Se extiende la presente para los fines que a la persona interesada convengan."
    : "Los documentos pendientes pueden subirse en Mi portal CBTA 291, en la sección Mi asignación.", M, y, { maxWidth: W - 2 * M });
  y += 60;
  doc.setTextColor(...TXT); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  doc.text("A T E N T A M E N T E", W / 2, y, { align: "center" });
  if (rev.completo) {
    const x1 = W / 2 - 130, x2 = W / 2 + 130;
    doc.setDrawColor(...TXT); doc.setLineWidth(0.6);
    doc.line(x1 - 100, y + 44, x1 + 70, y + 44); doc.line(x2 - 70, y + 44, x2 + 100, y + 44);
    doc.setFontSize(8.5);
    doc.text("Jefatura Académica y de", x1 - 15, y + 57, { align: "center" });
    doc.text("Competencias Docentes", x1 - 15, y + 68, { align: "center" });
    doc.text("Vo. Bo. Dirección del plantel", x2 + 15, y + 57, { align: "center" });
  } else {
    doc.setDrawColor(...TXT); doc.setLineWidth(0.6); doc.line(W / 2 - 110, y + 40, W / 2 + 110, y + 40);
    doc.setFontSize(8.5);
    doc.text("Jefatura Académica y de Competencias Docentes", W / 2, y + 53, { align: "center" });
  }

  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) { doc.setPage(i); pie(i, total); }
  const nombre = `${rev.completo ? "Constancia_entregas" : "Reporte_entregas"}_${ciclo}_${periodo}_${limpio(docente.nombre)}.pdf`;
  return { nombre, blob: doc.output("blob") };
}

const descargar = async ({ nombre, blob }) => {
  const archivo = typeof File === "function" ? new File([blob], nombre, { type: "application/pdf" }) : null;
  if (archivo && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare?.({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: nombre }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};

/* ---------- Pantalla ---------- */
export default function ConstanciasEntregas({ db, h }) {
  const [ciclo, setCiclo] = useState(h.cicloDeFecha());
  const [periodo, setPeriodo] = useState(h.periodoDeFecha());
  const [abierto, setAbierto] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [q, setQ] = useState("");

  const ciclos = useMemo(() => [...new Set([h.cicloDeFecha(), ...db.asignaciones.map(a => a.ciclo).filter(Boolean)])].sort().reverse(), [db, h]);
  const filas = useMemo(() => db.asignaciones
    .filter(a => a.ciclo === ciclo && (a.periodo || "ago-ene") === periodo)
    .map(asig => {
      const docente = db.users.find(u => u.id === asig.docenteId);
      return docente ? { docente, asig, rev: revisarDocente(db, asig, h) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.rev.completo) - Number(a.rev.completo) || a.docente.nombre.localeCompare(b.docente.nombre, "es")),
  [db, ciclo, periodo, h]);

  const t = q.trim().toLowerCase();
  const visibles = filas.filter(f => !t || f.docente.nombre.toLowerCase().includes(t));
  const completos = filas.filter(f => f.rev.completo).length;

  const uno = async (f) => {
    setTrabajando(f.docente.id);
    try { await descargar(await pdfDocente({ docente: f.docente, rev: f.rev, ciclo, periodo, h })); }
    catch (e) { alert("No se pudo generar el PDF: " + e.message); }
    setTrabajando("");
  };
  const todos = async (soloCompletos) => {
    const lista = filas.filter(f => !soloCompletos || f.rev.completo);
    if (!lista.length) return;
    setTrabajando(soloCompletos ? "_const" : "_todos");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const f of lista) {
        const r = await pdfDocente({ docente: f.docente, rev: f.rev, ciclo, periodo, h });
        zip.file(`${f.rev.completo ? "Constancias" : "Reportes"}/${r.nombre}`, r.blob);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${soloCompletos ? "Constancias" : "Constancias_y_reportes"}_entregas_${ciclo}_${periodo}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) { alert("No se pudo generar el ZIP: " + e.message); }
    setTrabajando("");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>Constancias de entregas</h2>
        <p className="text-sm text-slate-500">Constancia para quien entregó todo lo de su asignación; reporte de lo entregado y lo pendiente para quien no.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white" value={ciclo} onChange={e => setCiclo(e.target.value)}>
          {ciclos.map(c => <option key={c} value={c}>Ciclo {c}</option>)}
        </select>
        <select className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white" value={periodo} onChange={e => setPeriodo(e.target.value)}>
          <option value="ago-ene">{h.nombrePeriodo("ago-ene")}</option>
          <option value="feb-jul">{h.nombrePeriodo("feb-jul")}</option>
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm" placeholder="Buscar docente…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      {filas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">No hay asignaciones cargadas para ese semestre.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[["Entregaron todo", completos, "text-emerald-700"], ["Con pendientes", filas.length - completos, "text-amber-600"], ["Docentes", filas.length, "text-slate-800"]].map(([t1, n, c]) => (
              <div key={t1} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                <div className={`text-2xl font-bold ${c}`}>{n}</div>
                <div className="text-xs text-slate-500">{t1}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button className={btnPrim} disabled={!!trabajando || !completos} onClick={() => todos(true)}>
              {trabajando === "_const" ? <Loader2 size={14} className="animate-spin" /> : <Award size={14} />}Todas las constancias (ZIP)
            </button>
            <button className={btnSec} disabled={!!trabajando} onClick={() => todos(false)}>
              {trabajando === "_todos" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}Constancias y reportes de todos (ZIP)
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            {visibles.map(f => {
              const ab = abierto === f.docente.id;
              return (
                <div key={f.docente.id} className="border-b border-slate-100 last:border-0">
                  <div className="p-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
                    <button className="flex items-center gap-2 basis-full sm:basis-auto sm:flex-1 min-w-0 text-left" onClick={() => setAbierto(ab ? null : f.docente.id)}>
                      {ab ? <ChevronDown size={15} className="text-slate-400 shrink-0" /> : <ChevronRight size={15} className="text-slate-400 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold break-words">{f.docente.nombre}</span>
                        <span className="block text-xs text-slate-500">{f.rev.ent} de {f.rev.req} documentos · {f.rev.pct}%{f.rev.indeterminado ? " · requisitos por definir" : ""}</span>
                      </span>
                    </button>
                    {f.rev.completo
                      ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1"><CheckCircle2 size={12} />Entregó todo</span>
                      : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1"><AlertTriangle size={12} />Con pendientes</span>}
                    <button className={f.rev.completo ? btnPrim : btnSec} disabled={!!trabajando} onClick={() => uno(f)}>
                      {trabajando === f.docente.id ? <Loader2 size={14} className="animate-spin" /> : f.rev.completo ? <Award size={14} /> : <FileText size={14} />}
                      {f.rev.completo ? "Constancia" : "Reporte"}
                    </button>
                  </div>
                  {ab && (
                    <div className="px-3 pb-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-slate-400 border-b"><th className="py-1.5 pr-2">Actividad</th><th className="pr-2">Documento</th><th className="pr-2 text-center">Req.</th><th className="pr-2 text-center">Entr.</th><th>Situación</th></tr></thead>
                        <tbody>
                          {f.rev.filas.map((r, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="py-1.5 pr-2">{r.encargo}</td>
                              <td className="pr-2">{h.NOMBRE_TIPO_ENTREGA[r.tipo] || r.tipo}</td>
                              <td className="pr-2 text-center">{r.req ?? "?"}</td>
                              <td className="pr-2 text-center">{r.ent}</td>
                              <td className={`font-semibold ${r.req === null ? "text-amber-600" : r.ent >= r.req ? "text-emerald-700" : "text-rose-600"}`}>
                                {r.req === null ? "Por definir" : r.ent >= r.req ? "Completo" : `Faltan ${r.req - r.ent}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400">Se cuenta lo que cada docente subió en Mi asignación, con el mismo cálculo del Ranking de entregas. No se revisa el contenido de los documentos.</p>
        </>
      )}
    </div>
  );
}
