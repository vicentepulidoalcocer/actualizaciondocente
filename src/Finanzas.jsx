/* ================================================================
   FINANZAS · ingresos y egresos de control escolar

   Lo usan control escolar y la administración general. Los egresos
   pueden llevar factura en PDF o imagen, y esa factura se puede
   compartir por WhatsApp a un número que se configura aquí mismo.
   ================================================================ */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  TrendingUp, TrendingDown, Plus, Loader2, AlertTriangle, CheckCircle2,
  Paperclip, X, Trash2, Download, Settings, MessageCircle, Search,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { guardarArchivo, leerArchivo, eliminarArchivo, MAX_FILE_B64 } from "./lib/nube";

/* ---------------- utilidades ---------------- */

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtDinero = (n) =>
  (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const fmtFecha = (iso) => {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX",
    { day: "numeric", month: "long", year: "numeric" });
};

const soloDigitos = (t) => (t || "").toString().replace(/\D/g, "");

/* Número listo para WhatsApp: a 10 dígitos se le antepone 52 */
const numeroWhats = (tel) => {
  const t = soloDigitos(tel);
  if (!t) return null;
  return t.length === 10 ? "52" + t : t;
};

const leerComoBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(",")[1]);
  fr.onerror = () => rej(new Error("No se pudo leer el archivo."));
  fr.readAsDataURL(file);
});

/* Reconstruye el archivo guardado para abrirlo o compartirlo */
const archivoDe = async (clave, nombre) => {
  const f = await leerArchivo(clave);
  if (!f) return null;
  const bytes = atob(f.base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const tipo = f.mime || "application/pdf";
  return { blob: new Blob([arr], { type: tipo }), nombre: f.nombre || nombre || "factura.pdf", tipo };
};

/* ---------------- estilos ---------------- */
const btnPrim = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a2340] text-white text-sm font-semibold hover:bg-[#26305a] transition disabled:opacity-50";
const btnSec = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50";
const inputCls = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2340]/20";
const Card = ({ children, className = "", ...r }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`} {...r}>{children}</div>
);

/* ================================================================
   COMPONENTE PRINCIPAL
   ================================================================ */

export default function Finanzas({ user }) {
  const [tab, setTab] = useState("ingresos");
  const [movs, setMovs] = useState([]);
  const [whatsapp, setWhatsapp] = useState("");
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setErr("");
    const [mv, aj] = await Promise.all([
      supabase.from("finanzas").select("*").order("fecha", { ascending: false }).order("creado", { ascending: false }),
      supabase.from("finanzas_ajustes").select("whatsapp").eq("id", 1).maybeSingle(),
    ]);
    if (mv.error) { setErr(mv.error.message); setMovs([]); }
    else setMovs(mv.data || []);
    setWhatsapp(aj.error ? "" : (aj.data?.whatsapp || ""));
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const ingresos = movs.filter(m => m.tipo === "ingreso");
  const egresos = movs.filter(m => m.tipo === "egreso");
  const totalIn = ingresos.reduce((s, m) => s + Number(m.monto || 0), 0);
  const totalEg = egresos.reduce((s, m) => s + Number(m.monto || 0), 0);
  const saldo = totalIn - totalEg;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>Finanzas</h2>
        <p className="text-sm text-slate-500">Registro de ingresos y egresos del plantel.</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <TrendingUp size={15} /><span className="text-[11px] uppercase font-semibold">Ingresos</span>
          </div>
          <div className="text-xl font-bold text-emerald-700" style={{ fontFamily: "'Archivo', sans-serif" }}>
            {fmtDinero(totalIn)}
          </div>
          <div className="text-[11px] text-slate-400">{ingresos.length} movimiento(s)</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <TrendingDown size={15} /><span className="text-[11px] uppercase font-semibold">Egresos</span>
          </div>
          <div className="text-xl font-bold text-rose-700" style={{ fontFamily: "'Archivo', sans-serif" }}>
            {fmtDinero(totalEg)}
          </div>
          <div className="text-[11px] text-slate-400">{egresos.length} movimiento(s)</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <span className="text-[11px] uppercase font-semibold">Saldo</span>
          </div>
          <div className={`text-xl font-bold ${saldo < 0 ? "text-rose-700" : "text-[#1a2340]"}`}
            style={{ fontFamily: "'Archivo', sans-serif" }}>
            {fmtDinero(saldo)}
          </div>
          <div className="text-[11px] text-slate-400">Ingresos menos egresos</div>
        </Card>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
        {[["ingresos", "Ingresos"], ["egresos", "Egresos"], ["ajustes", "Configuración"]].map(([id, txt]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
              tab === id ? "bg-white shadow-sm text-[#1a2340]" : "text-slate-500 hover:text-slate-700"}`}>
            {txt}
          </button>
        ))}
      </div>

      {err && (
        <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>No se pudo consultar: {err}
            <span className="block text-xs">¿Ya ejecutaste finanzas.sql en Supabase?</span>
          </span>
        </Card>
      )}

      {cargando ? (
        <Card className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />Consultando…
        </Card>
      ) : tab === "ajustes" ? (
        <Ajustes whatsapp={whatsapp} onGuardado={cargar} />
      ) : (
        <Movimientos
          tipo={tab === "ingresos" ? "ingreso" : "egreso"}
          lista={tab === "ingresos" ? ingresos : egresos}
          whatsapp={whatsapp}
          user={user}
          recargar={cargar}
        />
      )}
    </div>
  );
}

/* ================================================================
   LISTA Y ALTA DE MOVIMIENTOS
   ================================================================ */

function Movimientos({ tipo, lista, whatsapp, user, recargar }) {
  const [form, setForm] = useState(null);
  const [q, setQ] = useState("");
  const esEgreso = tipo === "egreso";

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter(m =>
      (m.concepto || "").toLowerCase().includes(t) ||
      (m.observaciones || "").toLowerCase().includes(t));
  }, [lista, q]);

  const nuevo = () => setForm({
    tipo, fecha: hoyISO(), concepto: "", monto: "", observaciones: "",
    con_factura: false, _archivo: null,
  });

  const eliminar = async (m) => {
    if (!window.confirm(
      `¿Eliminar "${m.concepto}" por ${fmtDinero(m.monto)}?\n\nEsto no se puede deshacer.`)) return;
    const { error } = await supabase.from("finanzas").delete().eq("id", m.id);
    if (error) { alert("No se pudo eliminar: " + error.message); return; }
    if (m.archivo_guardado) await eliminarArchivo("factura_" + m.id);
    await recargar();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + " !mt-0 !pl-9"} placeholder="Buscar por concepto…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button className={btnPrim} onClick={nuevo}>
          <Plus size={15} />Registrar {esEgreso ? "egreso" : "ingreso"}
        </button>
      </div>

      {visibles.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          {q ? "Ningún movimiento coincide con la búsqueda."
             : `Todavía no hay ${esEgreso ? "egresos" : "ingresos"} registrados.`}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {visibles.map(m => (
            <div key={m.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-start gap-2">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold break-words">{m.concepto}</span>
                  <span className={`text-sm font-bold ${esEgreso ? "text-rose-700" : "text-emerald-700"}`}>
                    {esEgreso ? "−" : "+"}{fmtDinero(m.monto)}
                  </span>
                </div>
                <div className="text-xs text-slate-500">{fmtFecha(m.fecha)}</div>
                {m.observaciones && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 break-words">{m.observaciones}</p>
                )}
                {esEgreso && (
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {m.con_factura ? (
                      m.archivo_guardado ? (
                        <>
                          <VerFactura mov={m} />
                          <EnviarFactura mov={m} whatsapp={whatsapp} />
                        </>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                          CON FACTURA · SIN ARCHIVO
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
                        SIN FACTURA
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button className="text-slate-300 hover:text-rose-600 shrink-0" title="Eliminar"
                onClick={() => eliminar(m)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Card>
      )}

      {form && (
        <FormaMovimiento
          form={form} setForm={setForm} user={user}
          onListo={async () => { setForm(null); await recargar(); }}
        />
      )}
    </div>
  );
}

/* ================================================================
   FORMULARIO
   ================================================================ */

function FormaMovimiento({ form, setForm, user, onListo }) {
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const esEgreso = form.tipo === "egreso";

  const guardar = async () => {
    if (!form.concepto.trim()) { setErr("Escribe el concepto."); return; }
    const monto = Number(String(form.monto).replace(/,/g, ""));
    if (!Number.isFinite(monto) || monto <= 0) { setErr("Escribe un monto válido, mayor que cero."); return; }
    if (!form.fecha) { setErr("Elige la fecha."); return; }
    setGuardando(true); setErr("");

    /* El identificador se genera aquí para poder nombrar la factura
       antes de registrar el movimiento. */
    const id = (crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let archivoNombre = null, archivoGuardado = false;
    if (esEgreso && form.con_factura && form._archivo) {
      try {
        const b64 = await leerComoBase64(form._archivo);
        if (b64.length > MAX_FILE_B64) {
          setErr("La factura supera el límite de ~7.5 MB. Comprímela e inténtalo de nuevo.");
          setGuardando(false); return;
        }
        const r = await guardarArchivo("factura_" + id, b64,
          form._archivo.type || "application/pdf", form._archivo.name);
        if (!r.guardado) {
          setErr("No se pudo guardar la factura. " + (r.error || ""));
          setGuardando(false); return;
        }
        archivoNombre = form._archivo.name;
        archivoGuardado = true;
      } catch (e) { setErr(e.message); setGuardando(false); return; }
    }

    const { error } = await supabase.from("finanzas").insert({
      id, tipo: form.tipo, fecha: form.fecha,
      concepto: form.concepto.trim(), monto,
      observaciones: (form.observaciones || "").trim(),
      con_factura: esEgreso ? !!form.con_factura : false,
      archivo_nombre: archivoNombre,
      archivo_guardado: archivoGuardado,
      registrado_por: user?.id,
    });
    if (error) {
      /* Si el movimiento no se registró, se retira la factura recién
         subida para no dejar archivos sueltos ocupando espacio. */
      if (archivoGuardado) await eliminarArchivo("factura_" + id);
      setErr(error.message); setGuardando(false); return;
    }
    await onListo();
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto"
      onClick={() => !guardando && setForm(null)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-base" style={{ fontFamily: "'Archivo', sans-serif" }}>
            {esEgreso ? "Nuevo egreso" : "Nuevo ingreso"}
          </h3>
          <button onClick={() => setForm(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Concepto</span>
            <input className={inputCls} maxLength={200}
              placeholder={esEgreso ? "Compra de material de limpieza" : "Aportación voluntaria"}
              value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} />
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Monto (pesos)</span>
              <input className={inputCls} inputMode="decimal" placeholder="0.00"
                value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Fecha</span>
              <input type="date" className={inputCls} value={form.fecha}
                onChange={e => setForm({ ...form, fecha: e.target.value })} />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Observaciones (opcional)</span>
            <textarea className={inputCls + " resize-none"} rows={2} maxLength={500}
              value={form.observaciones}
              onChange={e => setForm({ ...form, observaciones: e.target.value })} />
          </label>

          {esEgreso && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <span className="text-xs font-semibold text-slate-600">¿Este egreso tiene factura?</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={!!form.con_factura}
                    onChange={() => setForm({ ...form, con_factura: true })} />Sí
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={!form.con_factura}
                    onChange={() => setForm({ ...form, con_factura: false, _archivo: null })} />No
                </label>
              </div>

              {form.con_factura && (
                <div className="pt-1">
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" className="text-sm"
                    onChange={e => setForm({ ...form, _archivo: e.target.files[0] || null })} />
                  {form._archivo && (
                    <div className="mt-2 flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                      <Paperclip size={12} className="text-emerald-600 shrink-0" />
                      <span className="flex-1 truncate">{form._archivo.name}</span>
                      <button type="button" className="text-rose-500 hover:text-rose-700 shrink-0"
                        onClick={() => setForm({ ...form, _archivo: null })}><X size={13} /></button>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">
                    PDF o imagen, hasta ~7.5 MB. Puedes registrarlo ahora y subir la factura después.
                  </p>
                </div>
              )}
            </div>
          )}

          {err && (
            <p className="text-sm text-rose-600 flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button className={btnSec} onClick={() => setForm(null)} disabled={guardando}>Cancelar</button>
            <button className={btnPrim} onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 size={14} className="animate-spin" />}Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   FACTURA · ver y enviar
   ================================================================ */

function VerFactura({ mov }) {
  const [abriendo, setAbriendo] = useState(false);
  const abrir = async () => {
    setAbriendo(true);
    const f = await archivoDe("factura_" + mov.id, mov.archivo_nombre);
    setAbriendo(false);
    if (!f) { alert("No se pudo abrir la factura."); return; }
    window.open(URL.createObjectURL(f.blob), "_blank");
  };
  return (
    <button onClick={abrir} disabled={abriendo}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50">
      {abriendo ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
      {mov.archivo_nombre || "Ver factura"}
    </button>
  );
}

/* WhatsApp no permite adjuntar archivos desde un enlace. En celular
   se usa el menú de compartir del sistema, que sí manda el archivo a
   WhatsApp. En computadora eso no existe, así que se descarga la
   factura y se abre la conversación con el texto, para adjuntarla a
   mano: es lo más lejos que se puede llegar sin la API de pago. */
function EnviarFactura({ mov, whatsapp }) {
  const [trabajando, setTrabajando] = useState(false);
  const numero = numeroWhats(whatsapp);

  const texto = `Factura del egreso "${mov.concepto}" por ${fmtDinero(mov.monto)}, con fecha ${fmtFecha(mov.fecha)}. CBTA No. 291.`;

  const enviar = async () => {
    if (!numero) {
      alert("Primero configura el número de WhatsApp en la pestaña Configuración.");
      return;
    }
    setTrabajando(true);
    const f = await archivoDe("factura_" + mov.id, mov.archivo_nombre);
    setTrabajando(false);
    if (!f) { alert("No se pudo leer la factura."); return; }

    const archivo = new File([f.blob], f.nombre, { type: f.tipo });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], text: texto });
        return;                       // el sistema ya mostró a dónde enviarlo
      } catch { /* si se cancela, se sigue con la vía alterna */ }
    }

    // Vía alterna: se descarga la factura y se abre la conversación
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement("a");
    a.href = url; a.download = f.nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, "_blank");
  };

  return (
    <button onClick={enviar} disabled={trabajando}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      title={numero ? `Enviar al ${numero}` : "Falta configurar el número"}>
      {trabajando ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
      Enviar por WhatsApp
    </button>
  );
}

/* ================================================================
   CONFIGURACIÓN · número de WhatsApp
   ================================================================ */

function Ajustes({ whatsapp, onGuardado }) {
  const [valor, setValor] = useState(whatsapp || "");
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const guardar = async () => {
    const limpio = soloDigitos(valor);
    if (limpio && limpio.length < 10) {
      setErr("El número debe tener al menos 10 dígitos."); return;
    }
    setGuardando(true); setErr(""); setMsg("");
    const { error } = await supabase.from("finanzas_ajustes")
      .update({ whatsapp: limpio, actualizado: new Date().toISOString() })
      .eq("id", 1);
    if (error) { setErr(error.message); setGuardando(false); return; }
    setMsg("Número actualizado.");
    await onGuardado();
    setGuardando(false);
  };

  return (
    <Card className="p-5 space-y-3 max-w-md">
      <div className="flex items-center gap-2">
        <Settings size={15} className="text-slate-400" />
        <h3 className="font-bold text-sm">Número para enviar facturas</h3>
      </div>
      <p className="text-sm text-slate-500">
        A este número se mandan las facturas de los egresos. Se guarda en el sistema,
        así que es el mismo desde cualquier equipo y se puede cambiar cuando haga falta.
      </p>
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">Número de WhatsApp</span>
        <input className={inputCls} inputMode="tel" placeholder="9831234567"
          value={valor} onChange={e => setValor(e.target.value)} />
        <span className="block text-[11px] text-slate-400 mt-1">
          Diez dígitos para México. Si es de otro país, escribe la clave por delante.
          {numeroWhats(valor) && ` Se usará: ${numeroWhats(valor)}`}
        </span>
      </label>
      {err && <p className="text-sm text-rose-600 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</p>}
      {msg && <p className="text-sm text-emerald-700 flex items-start gap-1.5"><CheckCircle2 size={14} className="mt-0.5 shrink-0" />{msg}</p>}
      <button className={btnPrim} onClick={guardar} disabled={guardando}>
        {guardando && <Loader2 size={14} className="animate-spin" />}Guardar número
      </button>
    </Card>
  );
}
