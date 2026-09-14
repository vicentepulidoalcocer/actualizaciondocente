/* ================================================================
   ASISTENCIA DOCENTE (checador de entradas y salidas del personal)

   NO tiene relación con la asistencia de ALUMNOS (códigos QR).
   Usa sus propias tablas: "checadas" y "reloj_personas".

   Quién ve qué:
   - Docentes y personal administrativo: únicamente sus propios
     registros, semana por semana.
   - Recursos Humanos y administración general: cargan el Excel
     semanal, vinculan cada número del reloj con su persona y
     consultan a cualquiera.
   ================================================================ */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Clock, Loader2, AlertTriangle, CheckCircle2, ChevronLeft,
  ChevronRight, Link2, Search, Paperclip, X,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { guardarArchivo, leerArchivo, eliminarArchivo, MAX_FILE_B64 } from "./lib/nube";

/* ---------------- utilidades de fecha y tiempo ---------------- */

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const isoDe = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* El lunes de la semana a la que pertenece una fecha. La semana
   laboral va de lunes a sábado; el domingo no se muestra. */
const lunesDe = (fecha) => {
  const d = new Date(fecha);
  const dow = d.getDay();                 // 0 = domingo
  const resta = dow === 0 ? 6 : dow - 1;  // el domingo cierra la semana anterior
  d.setDate(d.getDate() - resta);
  d.setHours(0, 0, 0, 0);
  return d;
};

const sumarDias = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const fmtCorta = (d) =>
  d.toLocaleDateString("es-MX", { day: "numeric", month: "long" });

/* "2026-09-11" → "viernes 11 de septiembre de 2026" */
const fmtFechaDia = (iso) => {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

/* "07:53:54" → segundos. Tolera valores vacíos o mal formados. */
const aSegundos = (t) => {
  const p = String(t || "").trim().split(":");
  if (p.length < 2) return 0;
  const [h, m, s] = p.map((x) => parseInt(x, 10) || 0);
  return h * 3600 + m * 60 + (s || 0);
};

const fmtDuracion = (seg) => {
  if (!seg) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
};

const hhmm = (t) => (t ? String(t).slice(0, 5) : "—");

/* Forma corta para el teléfono: "6h 20m" en vez de "6 h 20 min",
   que no cabe en una columna de un tercio de pantalla. */
const fmtDuracionCorta = (seg) => {
  if (!seg) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

/* El número del reloj llega como texto ("004") en el reporte actual,
   pero una exportación distinta podría entregarlo como número (4).
   Si no se normalizara, "004" y "4" se tomarían como dos personas
   distintas y la vinculación se rompería de una semana a otra.
   Se guarda siempre sin ceros a la izquierda y se muestra con ellos. */
const normalizaReloj = (v) => {
  const t = String(v ?? "").trim();
  return /^\d+$/.test(t) ? String(parseInt(t, 10)) : t;
};
const muestraReloj = (v) => {
  const t = String(v ?? "").trim();
  return /^\d+$/.test(t) ? t.padStart(3, "0") : t;
};

/* Convierte el archivo elegido a texto base64, como lo esperan las
   funciones de guardado que ya usa el resto del portal. */
const leerComoBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(",")[1]);
  fr.onerror = () => rej(new Error("No se pudo leer el archivo."));
  fr.readAsDataURL(file);
});

/* Abre en una pestaña nueva un documento guardado */
async function abrirDocumento(clave, nombre) {
  const f = await leerArchivo(clave);
  if (!f) { alert(`No se pudo abrir "${nombre || "el documento"}".`); return; }
  const bytes = atob(f.base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  window.open(URL.createObjectURL(new Blob([arr], { type: f.mime || "application/pdf" })), "_blank");
}

/* Botón para ver el documento de un permiso */
function VerDocumento({ permiso }) {
  const [abriendo, setAbriendo] = useState(false);
  if (!permiso.archivo_guardado) return null;
  return (
    <button
      className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-semibold hover:underline"
      disabled={abriendo}
      onClick={async () => {
        setAbriendo(true);
        await abrirDocumento("permiso_" + permiso.id, permiso.archivo_nombre);
        setAbriendo(false);
      }}>
      {abriendo ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
      {permiso.archivo_nombre || "Ver documento"}
    </button>
  );
}

/* Etiquetas legibles para las notas que pone el checador */
const NOTAS = {
  "Absent": "Falta",
  "Missed Punch": "Falta una checada",
  "Early Leave": "Salida anticipada",
  "Late In": "Entrada tardía",
};
const etiquetaNota = (n) => NOTAS[n] || n || "";

/* ---------------- estilos compartidos ---------------- */
const btnPrim = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a2340] text-white text-sm font-semibold hover:bg-[#26305a] transition disabled:opacity-50";
const btnSec = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50";
const inputCls = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2340]/20";
const Card = ({ children, className = "", ...r }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`} {...r}>{children}</div>
);

/* ================================================================
   COMPONENTE PRINCIPAL
   ================================================================ */

export default function AsistenciaDocente({ user, usuarios = [] }) {
  const esRH = user.rol === "admin" || user.rol === "jefe_rh";
  /* Quien administra Recursos Humanos no ve aquí su propia tarjeta de
     tiempo: para eso entra con su cuenta de docente. Así no se mezcla
     la administración del checador con el registro personal. */
  const [tab, setTab] = useState("personal");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>
          Asistencia Docente
        </h2>
        <p className="text-sm text-slate-500">
          Entradas y salidas registradas en el checador del plantel.
        </p>
      </div>

      {esRH && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
          {[["personal", "Todo el personal"], ["firmas", "Firmas"], ["permisos", "Permisos"],
            ["cargar", "Cargar semana"], ["vinculos", "Vinculación"]].map(([id, txt]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                tab === id ? "bg-white shadow-sm text-[#1a2340]" : "text-slate-500 hover:text-slate-700"}`}>
              {txt}
            </button>
          ))}
        </div>
      )}

      {!esRH && <MiSemana usuarioId={user.id} propia />}
      {!esRH && <MisPermisos usuarioId={user.id} />}
      {esRH && tab === "personal" && <PanelPersonal usuarios={usuarios} />}
      {esRH && tab === "firmas" && <PanelFirmas usuarios={usuarios} />}
      {esRH && tab === "permisos" && <PanelPermisos user={user} usuarios={usuarios} />}
      {esRH && tab === "cargar" && <CargarSemana user={user} usuarios={usuarios} />}
      {esRH && tab === "vinculos" && <Vinculacion usuarios={usuarios} />}
    </div>
  );
}

/* ================================================================
   VISTA PERSONAL: la semana de una persona
   ================================================================ */

/* ================================================================
   PERMISOS · lo que ve la propia persona
   ----------------------------------------------------------------
   La consulta filtra por usuario_id, pero la garantía real está en
   la base: su regla de lectura solo entrega los renglones de quien
   consulta. Aunque aquí se pidiera todo, Supabase no devolvería los
   permisos de nadie más.
   ================================================================ */

function MisPermisos({ usuarioId }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!usuarioId) { setFilas([]); setCargando(false); return; }
      setCargando(true); setErr("");
      const { data, error } = await supabase
        .from("permisos_personal").select("*")
        .eq("usuario_id", usuarioId)
        .order("fecha", { ascending: false });
      if (!vivo) return;
      if (error) setErr(error.message);
      setFilas(error ? [] : (data || []));
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [usuarioId]);

  const anioEscolar = (iso) => {
    // Ciclo de agosto a julio, igual que el resto del portal
    const [a, m] = String(iso).slice(0, 10).split("-").map(Number);
    return m >= 8 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
  };
  const cicloHoy = anioEscolar(isoDe(new Date()));
  const deEsteCiclo = filas.filter((f) => anioEscolar(f.fecha) === cicloHoy);

  if (!cargando && !err && filas.length === 0) return null;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-sm">Mis permisos</h3>
        <span className="text-xs text-slate-500">
          <b className="text-[#1a2340]">{deEsteCiclo.length}</b> día(s) en el ciclo {cicloHoy}
          {filas.length !== deEsteCiclo.length && ` · ${filas.length} en total`}
        </span>
      </div>

      {err && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          No se pudo consultar: {err}
        </p>
      )}
      {cargando && (
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 size={15} className="animate-spin" />Consultando…
        </p>
      )}

      {filas.map((f) => (
        <div key={f.id} className="border border-slate-200 rounded-xl p-3 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{fmtFechaDia(f.fecha)}</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
              PERMISO
            </span>
          </div>
          {f.motivo && <p className="text-sm text-slate-700">{f.motivo}</p>}
          {f.observaciones && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">{f.observaciones}</p>
          )}
          <VerDocumento permiso={f} />
        </div>
      ))}
    </Card>
  );
}

/* ================================================================
   FIRMA DE CONFORMIDAD DE LA SEMANA
   ----------------------------------------------------------------
   Al firmar se guardan las horas tal como se mostraban en ese
   momento. Si más adelante la semana se vuelve a cargar y el total
   cambia, la diferencia queda a la vista: así se sabe que lo
   avalado ya no corresponde a lo que hay ahora.

   La base solo acepta una firma cuyo identificador sea el de quien
   la está guardando, de modo que nadie puede firmar por otra
   persona ni aunque la aplicación se lo pidiera.
   ================================================================ */

function FirmaSemana({ usuarioId, lunes, segundos }) {
  const [firma, setFirma] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [firmando, setFirmando] = useState(false);
  const [err, setErr] = useState("");

  const consultar = useCallback(async () => {
    setCargando(true); setErr("");
    const { data, error } = await supabase
      .from("firmas_semana").select("*")
      .eq("usuario_id", usuarioId).eq("lunes", lunes)
      .maybeSingle();
    if (error) setErr(error.message);
    setFirma(error ? null : data);
    setCargando(false);
  }, [usuarioId, lunes]);

  useEffect(() => { consultar(); }, [consultar]);

  const firmar = async () => {
    if (!window.confirm(
      `Vas a avalar ${fmtDuracion(segundos)} en esta semana.\n\n` +
      `Revisa que las entradas y salidas sean correctas antes de continuar. ` +
      `Una vez firmada, solo Recursos Humanos puede retirarla.`)) return;
    setFirmando(true); setErr("");
    const { error } = await supabase.from("firmas_semana")
      .insert({ usuario_id: usuarioId, lunes, segundos });
    if (error) {
      setErr(error.message.includes("firmas_semana_unica")
        ? "Esta semana ya estaba firmada."
        : error.message);
    }
    await consultar();
    setFirmando(false);
  };

  if (cargando) return null;

  const desfase = firma && firma.segundos !== segundos;

  return (
    <Card className="p-4 space-y-2">
      {firma ? (
        <>
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Semana firmada</p>
              <p className="text-xs text-slate-500">
                Avalaste {fmtDuracion(firma.segundos)} el{" "}
                {new Date(firma.firmado_en).toLocaleString("es-MX",
                  { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          {desfase && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Las horas de esta semana cambiaron después de tu firma: ahora suman{" "}
              <b>{fmtDuracion(segundos)}</b>. Avisa a Recursos Humanos si necesitas revisarlas
              y volver a firmar.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Si las entradas y salidas de esta semana son correctas, puedes firmarlas de conformidad.
          </p>
          {err && (
            <p className="text-sm text-rose-600 flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}
            </p>
          )}
          <button className={btnPrim + " w-full sm:w-auto"} onClick={firmar} disabled={firmando}>
            {firmando && <Loader2 size={14} className="animate-spin" />}
            Firmar {fmtDuracion(segundos)} de esta semana
          </button>
        </>
      )}
    </Card>
  );
}

function MiSemana({ usuarioId, nombre, propia = false }) {
  const [lunes, setLunes] = useState(() => lunesDe(new Date()));
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");

  const desde = isoDe(lunes);
  const hasta = isoDe(sumarDias(lunes, 5)); // lunes a sábado

  const cargar = useCallback(async () => {
    if (!usuarioId) { setFilas([]); setCargando(false); return; }
    setCargando(true); setErr("");
    const { data, error } = await supabase
      .from("checadas").select("*")
      .eq("usuario_id", usuarioId)
      .gte("fecha", desde).lte("fecha", hasta)
      .order("fecha");
    if (error) setErr(error.message);
    setFilas(error ? [] : (data || []));
    setCargando(false);
  }, [usuarioId, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  // Los seis días de la semana, haya o no registro para cada uno
  const dias = useMemo(() => {
    const porFecha = new Map(filas.map((f) => [f.fecha, f]));
    return Array.from({ length: 6 }, (_, i) => {
      const d = sumarDias(lunes, i);
      const iso = isoDe(d);
      return { fecha: d, iso, registro: porFecha.get(iso) || null };
    });
  }, [filas, lunes]);

  const totalSemana = filas.reduce((s, f) => s + (f.segundos || 0), 0);
  const esFutura = lunes > lunesDe(new Date());

  return (
    <div className="space-y-3">
      {/* En celular las fechas van completas arriba y los botones abajo;
          en pantallas anchas, todo en una sola línea. */}
      <Card className="p-3">
        <div className="text-center mb-2 sm:hidden">
          <div className="text-sm font-bold">
            {fmtCorta(lunes)} al {fmtCorta(sumarDias(lunes, 5))}
          </div>
          <div className="text-[11px] text-slate-400">{lunes.getFullYear()} · lunes a sábado</div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button className={btnSec + " !px-3 !py-1.5"} onClick={() => setLunes(sumarDias(lunes, -7))}>
            <ChevronLeft size={15} />Anterior
          </button>
          <div className="text-center min-w-0 hidden sm:block">
            <div className="text-sm font-bold">
              {fmtCorta(lunes)} al {fmtCorta(sumarDias(lunes, 5))}
            </div>
            <div className="text-[11px] text-slate-400">{lunes.getFullYear()} · lunes a sábado</div>
          </div>
          <button className={btnSec + " !px-3 !py-1.5"} disabled={esFutura}
            onClick={() => setLunes(sumarDias(lunes, 7))}>
            Siguiente<ChevronRight size={15} />
          </button>
        </div>
      </Card>

      {nombre && <p className="text-sm font-semibold text-slate-600">{nombre}</p>}

      {err && (
        <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />No se pudo consultar: {err}
        </Card>
      )}

      {cargando ? (
        <Card className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />Consultando…
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <Clock size={15} /><span className="text-[11px] uppercase font-semibold">Tiempo de la semana</span>
            </div>
            <div className="text-2xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>
              {fmtDuracion(totalSemana)}
            </div>
          </Card>

          <Card className="overflow-hidden">
            {/* Encabezado solo en pantallas anchas */}
            <div className="hidden sm:grid grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-semibold text-slate-400">
              <span>Día</span><span>Entrada</span><span>Salida</span><span>Tiempo trabajado</span>
            </div>
            {dias.map(({ fecha, iso, registro }) => (
              <div key={iso} className="border-b border-slate-100 last:border-0 px-4 py-2.5">
                {/* Pantallas anchas: una sola línea con cuatro columnas */}
                <div className="hidden sm:grid sm:grid-cols-[1.4fr_1fr_1fr_1.2fr] sm:gap-2 sm:items-center">
                  <div>
                    <div className="text-sm font-medium">{DIAS[fecha.getDay()]}</div>
                    <div className="text-[11px] text-slate-400">
                      {fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <div className="text-sm">{hhmm(registro?.entrada)}</div>
                  <div className="text-sm">{hhmm(registro?.salida)}</div>
                  <div className="text-sm font-semibold">{fmtDuracion(registro?.segundos)}</div>
                </div>

                {/* Celular: el día arriba y los tres datos en una fila
                    de tres columnas, para que la semana entre completa
                    sin renglones de más. */}
                <div className="sm:hidden">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{DIAS[fecha.getDay()]}</span>
                    <span className="text-[11px] text-slate-400">
                      {fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase text-slate-400">Entrada</div>
                      <div className="text-sm">{hhmm(registro?.entrada)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase text-slate-400">Salida</div>
                      <div className="text-sm">{hhmm(registro?.salida)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase text-slate-400">Trabajado</div>
                      <div className="text-sm font-semibold">{fmtDuracionCorta(registro?.segundos)}</div>
                    </div>
                  </div>
                </div>

                {registro?.nota && (
                  <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                    {etiquetaNota(registro.nota)}
                  </span>
                )}
              </div>
            ))}
          </Card>

          {filas.length === 0 && (
            <p className="text-xs text-slate-400 text-center">
              No hay registros cargados para esta semana.
            </p>
          )}

          {propia && filas.length > 0 && (
            <FirmaSemana usuarioId={usuarioId} lunes={desde} segundos={totalSemana} />
          )}
        </>
      )}
    </div>
  );
}

/* ================================================================
   RECURSOS HUMANOS · consultar a cualquier persona
   ================================================================ */

/* Quiénes checan entrada y salida en el plantel. Las cuentas de
   jefaturas y de la administración general son cuentas de gestión:
   su titular ya aparece aquí con su cuenta de docente, así que
   incluirlas solo duplicaría a la misma persona en la lista. */
const ROLES_QUE_CHECAN = ["docente", "personal_administrativo"];

/* ================================================================
   PERMISOS · panel de Recursos Humanos
   Registra, consulta y elimina permisos del personal.
   ================================================================ */

/* ================================================================
   FIRMAS · panel de Recursos Humanos
   Quién firmó su semana y quién no.
   ================================================================ */

function PanelFirmas({ usuarios }) {
  const [lunes, setLunes] = useState(() => lunesDe(new Date()));
  const [horas, setHoras] = useState(new Map());   // usuario_id → segundos
  const [firmas, setFirmas] = useState(new Map()); // usuario_id → firma
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [retirando, setRetirando] = useState("");

  const desde = isoDe(lunes);
  const hasta = isoDe(sumarDias(lunes, 5));

  const cargar = useCallback(async () => {
    setCargando(true); setErr("");
    /* Una semana de todo el personal son unas 120 filas: muy por
       debajo del tope de 1000, así que se puede sumar aquí. */
    const [ch, fi] = await Promise.all([
      supabase.from("checadas").select("usuario_id, segundos")
        .gte("fecha", desde).lte("fecha", hasta),
      supabase.from("firmas_semana").select("*").eq("lunes", desde),
    ]);
    if (ch.error || fi.error) setErr((ch.error || fi.error).message);
    const h = new Map();
    (ch.data || []).forEach((r) => {
      if (!r.usuario_id) return;
      h.set(r.usuario_id, (h.get(r.usuario_id) || 0) + (r.segundos || 0));
    });
    setHoras(h);
    setFirmas(new Map((fi.data || []).map((f) => [f.usuario_id, f])));
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const retirar = async (f, nombre) => {
    if (!window.confirm(
      `¿Retirar la firma de ${nombre} de esta semana?\n\n` +
      `Tendrá que revisarla y firmarla de nuevo. Hazlo solo si la semana se corrigió después de que firmó.`)) return;
    setRetirando(f.usuario_id);
    const { error } = await supabase.from("firmas_semana").delete().eq("id", f.id);
    if (error) alert("No se pudo retirar: " + error.message);
    await cargar();
    setRetirando("");
  };

  /* Solo aparece quien tiene registros esa semana: a quien no le
     cargaron horas no se le puede pedir una firma. */
  const personal = (usuarios || [])
    .filter((u) => ROLES_QUE_CHECAN.includes(u.rol) && u.activo !== false)
    .filter((u) => horas.has(u.id))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  const firmados = personal.filter((u) => firmas.has(u.id));
  const esFutura = lunes > lunesDe(new Date());

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="text-center mb-2 sm:hidden">
          <div className="text-sm font-bold">
            {fmtCorta(lunes)} al {fmtCorta(sumarDias(lunes, 5))}
          </div>
          <div className="text-[11px] text-slate-400">{lunes.getFullYear()}</div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button className={btnSec + " !px-3 !py-1.5"} onClick={() => setLunes(sumarDias(lunes, -7))}>
            <ChevronLeft size={15} />Anterior
          </button>
          <div className="text-center min-w-0 hidden sm:block">
            <div className="text-sm font-bold">
              {fmtCorta(lunes)} al {fmtCorta(sumarDias(lunes, 5))}
            </div>
            <div className="text-[11px] text-slate-400">{lunes.getFullYear()}</div>
          </div>
          <button className={btnSec + " !px-3 !py-1.5"} disabled={esFutura}
            onClick={() => setLunes(sumarDias(lunes, 7))}>
            Siguiente<ChevronRight size={15} />
          </button>
        </div>
      </Card>

      {err && (
        <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200">
          No se pudo consultar: {err}
        </Card>
      )}

      {cargando ? (
        <Card className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />Consultando…
        </Card>
      ) : personal.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          No hay registros cargados para esta semana.
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <CheckCircle2 size={15} />
              <span className="text-[11px] uppercase font-semibold">Firmas de la semana</span>
            </div>
            <div className="text-2xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>
              {firmados.length}
              <span className="text-base text-slate-400 font-semibold"> de {personal.length}</span>
            </div>
          </Card>

          <Card className="overflow-hidden">
            {personal.map((u) => {
              const f = firmas.get(u.id);
              const total = horas.get(u.id) || 0;
              const desfase = f && f.segundos !== total;
              return (
                <div key={u.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium break-words">{u.nombre}</div>
                    <div className="text-xs text-slate-500">
                      {fmtDuracion(total)} en la semana
                      {f && ` · firmó el ${new Date(f.firmado_en).toLocaleDateString("es-MX",
                        { day: "numeric", month: "short", year: "numeric" })}`}
                    </div>
                    {desfase && (
                      <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
                        FIRMÓ {fmtDuracion(f.segundos)} · LAS HORAS CAMBIARON DESPUÉS
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {f ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                          <CheckCircle2 size={11} />FIRMADA
                        </span>
                        <button className="text-xs font-semibold text-slate-400 hover:text-rose-600 hover:underline"
                          disabled={retirando === u.id} onClick={() => retirar(f, u.nombre)}>
                          {retirando === u.id ? "Retirando…" : "Retirar"}
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
                        SIN FIRMAR
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}

function PanelPermisos({ user, usuarios }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errForm, setErrForm] = useState("");
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setErr("");
    const { data, error } = await supabase
      .from("permisos_personal").select("*").order("fecha", { ascending: false });
    if (error) setErr(error.message);
    setFilas(error ? [] : (data || []));
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const personal = (usuarios || [])
    .filter((u) => ROLES_QUE_CHECAN.includes(u.rol) && u.activo !== false)
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  const nombreDe = (id) => personal.find((u) => u.id === id)?.nombre
    || (usuarios || []).find((u) => u.id === id)?.nombre || "—";

  const guardar = async () => {
    if (!form.usuario_id) { setErrForm("Elige a la persona."); return; }
    if (!form.fecha) { setErrForm("Elige la fecha del permiso."); return; }
    if (!form.motivo.trim()) { setErrForm("Escribe el motivo del permiso."); return; }
    setGuardando(true); setErrForm("");

    // Aviso si ya existe un permiso de esa persona ese mismo día
    const repetido = filas.some((f) => f.usuario_id === form.usuario_id && f.fecha === form.fecha);
    if (repetido && !window.confirm(
      `${nombreDe(form.usuario_id)} ya tiene un permiso registrado el ${fmtFechaDia(form.fecha)}. ¿Registrar otro de todos modos?`)) {
      setGuardando(false); return;
    }

    /* El identificador se genera aquí para poder nombrar el archivo
       antes de registrar el permiso. */
    const id = (crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let archivoNombre = null, archivoGuardado = false;
    if (form._archivo) {
      try {
        const b64 = await leerComoBase64(form._archivo);
        if (b64.length > MAX_FILE_B64) {
          setErrForm("El documento supera el límite de ~7.5 MB. Comprímelo e inténtalo de nuevo.");
          setGuardando(false); return;
        }
        const r = await guardarArchivo("permiso_" + id, b64,
          form._archivo.type || "application/pdf", form._archivo.name);
        if (!r.guardado) {
          setErrForm("No se pudo guardar el documento. " + (r.error || ""));
          setGuardando(false); return;
        }
        archivoNombre = form._archivo.name;
        archivoGuardado = true;
      } catch (e) {
        setErrForm(e.message); setGuardando(false); return;
      }
    }

    const { error } = await supabase.from("permisos_personal").insert({
      id,
      usuario_id: form.usuario_id,
      fecha: form.fecha,
      motivo: form.motivo.trim(),
      observaciones: (form.observaciones || "").trim(),
      archivo_nombre: archivoNombre,
      archivo_guardado: archivoGuardado,
      registrado_por: user.id,
    });
    if (error) {
      /* Si el permiso no se pudo registrar, el documento recién subido
         se retira para no dejar archivos sueltos ocupando espacio. */
      if (archivoGuardado) await eliminarArchivo("permiso_" + id);
      setErrForm(error.message); setGuardando(false); return;
    }
    await cargar();
    setForm(null);
    setGuardando(false);
  };

  const eliminar = async (f) => {
    if (!window.confirm(
      `¿Eliminar el permiso de ${nombreDe(f.usuario_id)} del ${fmtFechaDia(f.fecha)}? Dejará de verlo en su portal.`)) return;
    const { error } = await supabase.from("permisos_personal").delete().eq("id", f.id);
    if (error) { alert("No se pudo eliminar: " + error.message); return; }
    if (f.archivo_guardado) await eliminarArchivo("permiso_" + f.id);
    await cargar();
  };

  const visibles = filtro ? filas.filter((f) => f.usuario_id === filtro) : filas;

  // Conteo de días por persona, de mayor a menor
  const conteo = personal
    .map((u) => ({ ...u, dias: filas.filter((f) => f.usuario_id === u.id).length }))
    .filter((u) => u.dias > 0)
    .sort((a, b) => b.dias - a.dias);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-slate-500 flex-1 min-w-[200px]">
          Cada permiso le aparece únicamente a la persona registrada, en su propio portal.
        </p>
        <button className={btnPrim + " !px-3 !py-1.5"}
          onClick={() => {
            setForm({ usuario_id: "", fecha: isoDe(new Date()), motivo: "", observaciones: "", _archivo: null });
            setErrForm("");
          }}>
          Registrar permiso
        </button>
      </div>

      {form && (
        <Card className="p-5 space-y-3">
          <h3 className="font-bold text-sm">Nuevo permiso</h3>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Persona</span>
            <select className={inputCls} value={form.usuario_id}
              onChange={(e) => setForm({ ...form, usuario_id: e.target.value })}>
              <option value="">— Elige a la persona —</option>
              {personal.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Fecha del permiso</span>
            <input type="date" className={inputCls} value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Motivo</span>
            <input className={inputCls} maxLength={200} placeholder="Comisión oficial, asunto familiar…"
              value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Observaciones (opcional)</span>
            <textarea className={inputCls + " resize-none"} rows={2} maxLength={500}
              placeholder="Detalles adicionales que deba conocer la persona"
              value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Documento (opcional)</span>
            <div className="mt-1">
              <input type="file" accept=".pdf,application/pdf" className="text-sm"
                onChange={(e) => setForm({ ...form, _archivo: e.target.files[0] || null })} />
            </div>
            {form._archivo && (
              <div className="mt-2 flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                <Paperclip size={12} className="text-emerald-600 shrink-0" />
                <span className="flex-1 truncate">{form._archivo.name}</span>
                <button type="button" className="text-rose-500 hover:text-rose-700 shrink-0"
                  title="Quitar el documento"
                  onClick={() => setForm({ ...form, _archivo: null })}><X size={13} /></button>
              </div>
            )}
          </label>
          <p className="text-[11px] text-slate-400">
            El motivo, las observaciones y el documento los verá la persona en su portal.
            Útil para licencias médicas, oficios de comisión y constancias.
          </p>
          {errForm && (
            <p className="text-sm text-rose-600 flex items-start gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />{errForm}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className={btnSec} onClick={() => setForm(null)} disabled={guardando}>Cancelar</button>
            <button className={btnPrim} onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 size={14} className="animate-spin" />}Guardar
            </button>
          </div>
        </Card>
      )}

      {conteo.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="font-bold text-sm">Días de permiso por persona</h3>
          <div className="flex flex-wrap gap-1.5">
            {conteo.map((u) => (
              <button key={u.id}
                onClick={() => setFiltro(filtro === u.id ? "" : u.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  filtro === u.id
                    ? "bg-[#1a2340] text-white border-[#1a2340]"
                    : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
                {u.nombre} · <b>{u.dias}</b>
              </button>
            ))}
          </div>
          {filtro && (
            <button className="text-xs text-slate-400 hover:underline" onClick={() => setFiltro("")}>
              Ver todos los permisos
            </button>
          )}
        </Card>
      )}

      {err && (
        <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200">
          No se pudo consultar: {err}
        </Card>
      )}

      {cargando ? (
        <Card className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />Consultando…
        </Card>
      ) : visibles.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          {filtro ? "Esa persona no tiene permisos registrados." : "Todavía no hay permisos registrados."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {visibles.map((f) => (
            <div key={f.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-start gap-2">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="text-sm font-semibold break-words">{nombreDe(f.usuario_id)}</div>
                <div className="text-xs text-slate-500">{fmtFechaDia(f.fecha)}</div>
                {f.motivo && <p className="text-sm text-slate-700 break-words">{f.motivo}</p>}
                {f.observaciones && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2 break-words">{f.observaciones}</p>
                )}
                <VerDocumento permiso={f} />
              </div>
              <button className="text-xs font-semibold text-rose-600 hover:underline shrink-0 text-left"
                onClick={() => eliminar(f)}>
                Eliminar
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function PanelPersonal({ usuarios }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  const lista = (usuarios || [])
    .filter((u) => u.activo !== false)
    .filter((u) => ROLES_QUE_CHECAN.includes(u.rol))
    .filter((u) => !q || (u.nombre || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  if (sel) {
    return (
      <div className="space-y-3">
        <button className={btnSec + " !px-3 !py-1.5"} onClick={() => setSel(null)}>
          <ChevronLeft size={15} />Volver a la lista
        </button>
        <MiSemana usuarioId={sel.id} nombre={sel.nombre} />
        <MisPermisos usuarioId={sel.id} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + " !mt-0 !pl-9"} placeholder="Buscar por nombre…"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>
      <Card className="overflow-hidden">
        {lista.map((u) => (
          <button key={u.id} onClick={() => setSel(u)}
            className="w-full text-left px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{u.nombre}</span>
            <ChevronRight size={15} className="text-slate-300 shrink-0" />
          </button>
        ))}
        {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Sin resultados.</p>}
      </Card>
    </div>
  );
}

/* ================================================================
   RECURSOS HUMANOS · vinculación reloj ↔ persona
   ================================================================ */

/* Quita acentos y reduce a palabras, para comparar nombres */
const palabras = (t) =>
  String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().split(/\s+/).filter(Boolean);

/* Propone a qué persona del portal corresponde un renglón del Excel.
   El reloj usa nombres cortos ("Yahaira Domínguez") y el portal los
   completos ("Yahaira Aracely Domínguez Tello"), así que se busca
   que el nombre Y el apellido del reloj aparezcan en el nombre
   completo. Solo se propone cuando hay UNA coincidencia. */
function proponer(nombreHoja, usuarios) {
  const p = palabras(nombreHoja);
  if (p.length < 2) return null;
  const nombre = p[0], apellido = p[p.length - 1];
  const hits = (usuarios || [])
    .filter((u) => ROLES_QUE_CHECAN.includes(u.rol) && u.activo !== false)
    .filter((u) => {
      const w = palabras(u.nombre);
      return w.includes(nombre) && w.includes(apellido);
    });
  return hits.length === 1 ? hits[0] : null;
}

function Vinculacion({ usuarios }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setErr("");
    const { data, error } = await supabase.from("reloj_personas").select("*").order("reloj_id");
    if (error) setErr(error.message);
    setFilas(error ? [] : (data || []));
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const vincular = async (relojId, usuarioId) => {
    setGuardando(relojId);
    const { error } = await supabase.from("reloj_personas")
      .update({ usuario_id: usuarioId || null, actualizado: new Date().toISOString() })
      .eq("reloj_id", relojId);
    if (error) { alert("No se pudo guardar: " + error.message); setGuardando(""); return; }
    /* Las checadas ya cargadas de ese número se reasignan, para que la
       persona vea de inmediato su historial completo. */
    await supabase.from("checadas").update({ usuario_id: usuarioId || null }).eq("reloj_id", relojId);
    await cargar();
    setGuardando("");
  };

  const sinVincular = filas.filter((f) => !f.usuario_id).length;

  return (
    <div className="space-y-3">
      <Card className="p-4 text-sm text-slate-600">
        Cada número del checador se vincula <b>una sola vez</b> con la cuenta de la persona.
        Después de eso, las cargas semanales se asignan solas.
        {sinVincular > 0 && (
          <span className="block mt-2 text-amber-700 font-semibold">
            Faltan {sinVincular} por vincular: sus registros no le aparecen a nadie todavía.
          </span>
        )}
      </Card>

      {err && (
        <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200">
          No se pudo consultar: {err}
        </Card>
      )}

      {cargando ? (
        <Card className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />Consultando…
        </Card>
      ) : filas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          Todavía no se ha cargado ningún Excel del checador.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {filas.map((f) => {
            const sugerido = !f.usuario_id ? proponer(f.nombre_hoja, usuarios) : null;
            return (
              <div key={f.reloj_id} className="px-4 py-3 border-b border-slate-100 last:border-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded shrink-0">
                    {muestraReloj(f.reloj_id)}
                  </span>
                  <span className="text-sm font-medium truncate">{f.nombre_hoja}</span>
                  {f.usuario_id
                    ? <Link2 size={14} className="text-emerald-600 shrink-0" />
                    : <span className="text-[10px] font-bold text-amber-600 shrink-0">SIN VINCULAR</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className={inputCls + " !mt-0 flex-1 min-w-[180px]"}
                    value={f.usuario_id || ""} disabled={guardando === f.reloj_id}
                    onChange={(e) => vincular(f.reloj_id, e.target.value)}>
                    <option value="">— Sin vincular —</option>
                    {(usuarios || [])
                      .filter((u) => ROLES_QUE_CHECAN.includes(u.rol) && u.activo !== false)
                      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"))
                      .map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                  {guardando === f.reloj_id && <Loader2 size={15} className="animate-spin text-slate-400" />}
                </div>
                {sugerido && (
                  <button className="text-xs text-indigo-600 font-semibold hover:underline"
                    onClick={() => vincular(f.reloj_id, sugerido.id)}>
                    ¿Es {sugerido.nombre}? Vincular
                  </button>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/* ================================================================
   RECURSOS HUMANOS · cargar el Excel de la semana
   ================================================================ */

/* Los encabezados que trae el reporte del checador. Se buscan por
   nombre y no por posición, para que un cambio de orden de columnas
   no rompa la carga. */
const COLS = {
  nombre: ["nombre de la persona", "name"],
  relojId: ["id de persona", "person id"],
  fecha: ["fecha", "date"],
  entrada: ["clock in"],
  salida: ["clock out"],
  tiempo: ["clock time(h)", "clock time"],
  nota: ["situación anormal", "situacion anormal", "abnormal"],
};

const buscaCol = (encabezados, claves) => {
  const norm = encabezados.map((h) => String(h || "").trim().toLowerCase());
  for (const k of claves) {
    const i = norm.indexOf(k);
    if (i >= 0) return i;
  }
  return -1;
};

/* "11/09/2026" → "2026-09-11". También acepta fechas que Excel haya
   convertido a objeto Date. */
const fechaISO = (v) => {
  if (v instanceof Date && !isNaN(v)) return isoDe(v);
  const t = String(v || "").trim();
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
};

/* Excel a veces entrega las horas como fracción de día */
const horaTexto = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const seg = Math.round(v * 86400);
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (v instanceof Date && !isNaN(v)) {
    return `${String(v.getHours()).padStart(2, "0")}:${String(v.getMinutes()).padStart(2, "0")}:${String(v.getSeconds()).padStart(2, "0")}`;
  }
  const t = String(v).trim();
  return t || null;
};

function CargarSemana({ user, usuarios }) {
  const [recargaHistorial, setRecargaHistorial] = useState(0);
  const [archivo, setArchivo] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [listo, setListo] = useState("");

  const leer = async (f) => {
    setLeyendo(true); setErr(""); setPrevia(null); setListo("");
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const libro = XLSX.read(buf, { cellDates: true });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null });

      /* El reporte trae un título en la primera fila, así que se
         localiza el renglón de encabezados en vez de suponerlo. */
      let iEnc = -1;
      for (let i = 0; i < Math.min(matriz.length, 10); i++) {
        if (buscaCol(matriz[i] || [], COLS.relojId) >= 0 && buscaCol(matriz[i] || [], COLS.fecha) >= 0) {
          iEnc = i; break;
        }
      }
      if (iEnc < 0) throw new Error("No se encontraron las columnas “ID de Persona” y “Fecha”. ¿Es el reporte del checador?");

      const enc = matriz[iEnc];
      const cN = buscaCol(enc, COLS.nombre), cId = buscaCol(enc, COLS.relojId);
      const cF = buscaCol(enc, COLS.fecha), cE = buscaCol(enc, COLS.entrada);
      const cS = buscaCol(enc, COLS.salida), cT = buscaCol(enc, COLS.tiempo);
      const cNota = buscaCol(enc, COLS.nota);

      const filas = [];
      const personas = new Map();
      const fechas = new Set();
      let descartadas = 0;

      for (let i = iEnc + 1; i < matriz.length; i++) {
        const r = matriz[i] || [];
        const relojId = normalizaReloj(r[cId]);
        const iso = fechaISO(r[cF]);
        if (!relojId || !iso) { if (r.some((x) => x != null && x !== "")) descartadas++; continue; }

        const entrada = horaTexto(r[cE]);
        const salida = horaTexto(r[cS]);
        // Se usa el tiempo REAL (de la entrada a la salida)
        let seg = aSegundos(horaTexto(r[cT]));
        if (!seg && entrada && salida) seg = Math.max(0, aSegundos(salida) - aSegundos(entrada));

        filas.push({
          id: `${relojId}_${iso}`, reloj_id: relojId, fecha: iso,
          entrada, salida, segundos: seg,
          nota: String(r[cNota] ?? "").trim(),
        });
        fechas.add(iso);
        if (!personas.has(relojId)) personas.set(relojId, String(r[cN] ?? "").trim() || relojId);
      }

      if (!filas.length) throw new Error("El archivo no contiene registros legibles.");

      const ordenadas = [...fechas].sort();
      setPrevia({
        filas, personas, descartadas,
        desde: ordenadas[0], hasta: ordenadas[ordenadas.length - 1],
        dias: ordenadas.length,
      });
    } catch (e) {
      setErr(e.message);
    }
    setLeyendo(false);
  };

  const guardar = async () => {
    setGuardando(true); setErr(""); setListo("");
    try {
      /* 1. Se registran los números del reloj que aún no existen, para
            que aparezcan en la pestaña de Vinculación. */
      const nuevos = [...previa.personas].map(([reloj_id, nombre_hoja]) => ({ reloj_id, nombre_hoja }));
      const { data: yaHay } = await supabase.from("reloj_personas").select("reloj_id");
      const existentes = new Set((yaHay || []).map((x) => x.reloj_id));
      const porCrear = nuevos.filter((n) => !existentes.has(n.reloj_id));
      if (porCrear.length) {
        const { error } = await supabase.from("reloj_personas").insert(porCrear);
        if (error) throw new Error("Registrando personas del reloj: " + error.message);
      }

      /* 2. Se resuelve a qué cuenta pertenece cada número */
      const { data: mapa, error: eMapa } = await supabase.from("reloj_personas").select("reloj_id, usuario_id");
      if (eMapa) throw new Error(eMapa.message);
      const deReloj = new Map((mapa || []).map((m) => [m.reloj_id, m.usuario_id]));

      /* 3. Se reemplaza lo que hubiera de ese mismo rango de fechas.
            Así, volver a subir la misma semana la deja corregida en
            lugar de duplicarla. */
      const { error: eDel } = await supabase.from("checadas").delete()
        .gte("fecha", previa.desde).lte("fecha", previa.hasta);
      if (eDel) throw new Error("Reemplazando la semana anterior: " + eDel.message);

      /* 4. Se insertan por bloques, para no mandar todo de una vez */
      const conDueño = previa.filas.map((f) => ({
        ...f,
        usuario_id: deReloj.get(f.reloj_id) || null,
        cargado_por: user.id,
      }));
      for (let i = 0; i < conDueño.length; i += 200) {
        const { error } = await supabase.from("checadas").insert(conDueño.slice(i, i + 200));
        if (error) throw new Error("Guardando registros: " + error.message);
      }

      const sinDueño = conDueño.filter((f) => !f.usuario_id).length;
      setListo(
        `Se cargaron ${conDueño.length} registros de ${previa.personas.size} personas.` +
        (sinDueño ? ` ${sinDueño} quedaron sin asignar: revisa la pestaña Vinculación.` : "")
      );
      setPrevia(null); setArchivo(null);
      setRecargaHistorial((n) => n + 1);   // el historial se vuelve a leer
    } catch (e) {
      setErr(e.message);
    }
    setGuardando(false);
  };

  const sinVincularPrevia = previa
    ? [...previa.personas].filter(([, n]) => !proponer(n, usuarios)).length : 0;

  return (
    <div className="space-y-3">
      <Card className="p-5 space-y-3">
        <h3 className="font-bold text-sm">Cargar el reporte semanal del checador</h3>
        <p className="text-sm text-slate-500">
          Sube el archivo de Excel tal como lo entrega el checador, sin modificarlo.
          Se lee la primera hoja y se toman las columnas por su nombre.
        </p>
        <input type="file" accept=".xlsx,.xls" className="text-sm"
          onChange={(e) => {
            const f = e.target.files[0] || null;
            setArchivo(f);
            if (f) leer(f);
          }} />
        {leyendo && (
          <p className="text-sm text-slate-500 flex items-center gap-2">
            <Loader2 size={15} className="animate-spin" />Leyendo el archivo…
          </p>
        )}
        {err && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5 flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />{err}
          </p>
        )}
        {listo && (
          <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-start gap-2">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />{listo}
          </p>
        )}
      </Card>

      {previa && (
        <Card className="p-5 space-y-3">
          <h3 className="font-bold text-sm">Revisa antes de guardar</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[["Registros", previa.filas.length], ["Personas", previa.personas.size],
              ["Días", previa.dias], ["Descartados", previa.descartadas]].map(([t, v]) => (
              <div key={t} className="bg-slate-50 rounded-xl p-3">
                <div className="text-xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>{v}</div>
                <div className="text-[11px] text-slate-400">{t}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-600">
            Del <b>{previa.desde}</b> al <b>{previa.hasta}</b>.
          </p>
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              Al guardar se <b>reemplazan</b> los registros que ya existan entre esas dos fechas.
              Los de otras semanas no se tocan.
            </span>
          </div>
          {sinVincularPrevia > 0 && (
            <p className="text-xs text-slate-500">
              {sinVincularPrevia} persona(s) del archivo no coinciden automáticamente con una cuenta
              del portal. Se podrán vincular a mano después de guardar.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button className={btnSec} onClick={() => { setPrevia(null); setArchivo(null); }} disabled={guardando}>
              Cancelar
            </button>
            <button className={btnPrim} onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 size={14} className="animate-spin" />}Guardar la semana
            </button>
          </div>
        </Card>
      )}

      <HistorialSemanas usuarios={usuarios} recarga={recargaHistorial} />
    </div>
  );
}

/* ================================================================
   HISTORIAL DE SEMANAS CARGADAS
   ----------------------------------------------------------------
   Se arma a partir de las propias checadas (cada renglón guarda
   quién lo cargó y cuándo), resumidas por la vista
   "checadas_semanas". No hace falta llevar un registro aparte.
   ================================================================ */

function HistorialSemanas({ usuarios, recarga }) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true); setErr("");
      const { data, error } = await supabase
        .from("checadas_semanas").select("*").order("lunes", { ascending: false });
      if (!vivo) return;
      if (error) setErr(error.message);
      setFilas(error ? [] : (data || []));
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [recarga]);

  const nombreDe = (id) =>
    (usuarios || []).find((u) => u.id === id)?.nombre || "—";

  const fmtMomento = (t) => {
    if (!t) return "—";
    const d = new Date(t);
    return isNaN(d) ? "—" : d.toLocaleString("es-MX",
      { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const fmtDia = (iso) => {
    if (!iso) return "";
    const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  };

  return (
    <Card className="p-5 space-y-3">
      <h3 className="font-bold text-sm">Semanas cargadas</h3>

      {err && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
          No se pudo consultar el historial: {err}
        </p>
      )}

      {cargando && (
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 size={15} className="animate-spin" />Consultando…
        </p>
      )}

      {!cargando && !err && filas.length === 0 && (
        <p className="text-sm text-slate-400 py-2">Todavía no se ha cargado ninguna semana.</p>
      )}

      {filas.map((f) => (
        <div key={f.lunes} className="border border-slate-200 rounded-xl p-3 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              {fmtDia(f.primer_dia)} al {fmtDia(f.ultimo_dia)}
            </span>
            <span className="text-xs text-slate-400">
              {f.registros} registro(s) · {f.personas} persona(s)
            </span>
          </div>
          <div className="text-xs text-slate-500">
            Cargada por {nombreDe(f.cargado_por)} el {fmtMomento(f.cargado_en)}
          </div>
          {f.sin_vincular > 0 && (
            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
              {f.sin_vincular} registro(s) sin vincular
            </span>
          )}
        </div>
      ))}
    </Card>
  );
}
