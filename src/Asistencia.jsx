/* ================================================================
   CONTROL DE ASISTENCIA CON CÓDIGOS QR
   Escaneo con cámara, registro en Supabase, historial permanente,
   panel de indicadores y aviso a tutores por WhatsApp.

   El historial vive en la nube: ya no se pierde al borrar el caché
   ni queda encerrado en una sola computadora.
   ================================================================ */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Camera, CameraOff, Users, Clock, CheckCircle2, AlertTriangle, Download,
  Upload, Search, Loader2, TrendingUp, MessageCircle, CalendarDays, X, RefreshCw,
  Trash2, UserMinus, UserCheck, ClipboardCheck, Pencil, ChevronLeft, ChevronRight,
  Paperclip,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { supabase } from "./lib/supabase";
import { guardarArchivo, leerArchivo, eliminarArchivo, MAX_FILE_B64 } from "./lib/nube";

/* ---------------- utilidades ---------------- */
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
const soloDigitos = (t) => (t || "").toString().replace(/\D/g, "");
/* Compara nombres sin acentos ni mayúsculas, para que "Nuñez"
   encuentre a "Núñez" y "jose" a "JOSÉ". */
const normaliza = (t) => (t || "").toString()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const btnPrim = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a2340] text-white text-sm font-semibold hover:bg-[#26305a] transition disabled:opacity-50";
const btnSec = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50";
const inputCls = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2340]/20";
/* "min-w-0" evita que una tarjeta con contenido ancho estire la
   página: dentro de una cuadrícula o una fila flexible, sin esto
   toma su ancho natural en vez del disponible. */
const Card = ({ children, className = "", ...r }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm min-w-0 ${className}`} {...r}>{children}</div>
);
/* La etiqueta se parte en dos renglones si hace falta. Antes no podía
   encogerse y, en pantallas angostas, empujaba el ancho de toda la
   página: por eso el encabezado se veía cortado en el teléfono. */
const Stat = ({ icono: Ico, label, valor, sub, color = "text-slate-900" }) => (
  <Card className="p-3 sm:p-4">
    <div className="flex items-start gap-1.5 text-slate-400 mb-1 min-w-0">
      <Ico size={15} className="shrink-0 mt-0.5" />
      <span className="text-[11px] uppercase font-semibold leading-tight break-words min-w-0">{label}</span>
    </div>
    <div className={`text-2xl font-bold ${color}`} style={{ fontFamily: "'Archivo', sans-serif" }}>{valor}</div>
    {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
  </Card>
);

/* Cola local para no perder registros cuando falla la conexión.
   En Dziuché la señal se cae a ratos: el escaneo sigue funcionando y
   los registros se envían solos cuando vuelve el internet. */
const CLAVE_COLA = "asistencia_pendiente_v1";
const leerCola = () => {
  try { return JSON.parse(localStorage.getItem(CLAVE_COLA) || "[]"); } catch { return []; }
};
const escribirCola = (c) => {
  try { localStorage.setItem(CLAVE_COLA, JSON.stringify(c)); } catch { /* sin espacio */ }
};

/* ================================================================
   PANTALLA PRINCIPAL
   ================================================================ */
export default function Asistencia({ user }) {
  const [tab, setTab] = useState("escaneo");
  const [alumnos, setAlumnos] = useState([]);
  const [registrosHoy, setRegistrosHoy] = useState([]);
  const [justificaciones, setJustificaciones] = useState([]);
  const [diaEspecial, setDiaEspecial] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [horaLimite, setHoraLimite] = useState(
    () => localStorage.getItem("asistencia_hora_limite") || "08:00");
  const [pendientes, setPendientes] = useState(leerCola().length);

  const fecha = hoyISO();

  const cargar = useCallback(async () => {
    setCargando(true); setErr("");
    try {
      const [al, as, ju, dc] = await Promise.all([
        supabase.from("alumnos").select("*").order("nombre"),
        supabase.from("asistencias").select("*").eq("fecha", hoyISO()).order("hora"),
        supabase.from("justificaciones").select("*").eq("fecha", hoyISO()),
        supabase.from("dias_clase").select("*").eq("fecha", hoyISO()).maybeSingle(),
      ]);
      if (al.error) throw new Error(al.error.message);
      if (as.error) throw new Error(as.error.message);
      setAlumnos(al.data || []);
      setRegistrosHoy(as.data || []);
      /* Si la tabla de justificaciones aún no existe, se trabaja sin
         ellas en lugar de dejar inservible toda la pantalla. */
      setJustificaciones(ju.error ? [] : (ju.data || []));
      setDiaEspecial(dc.error ? null : (dc.data || null));
    } catch (e) { setErr(e.message); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => { localStorage.setItem("asistencia_hora_limite", horaLimite); }, [horaLimite]);

  /* Envía los registros que quedaron en cola por falta de conexión */
  const sincronizarCola = useCallback(async () => {
    const cola = leerCola();
    if (!cola.length) return;
    const quedan = [];
    for (const r of cola) {
      const { error } = await supabase.from("asistencias").insert(r);
      // El código 23505 es "ya existe": el alumno ya estaba registrado
      if (error && error.code !== "23505") quedan.push(r);
    }
    escribirCola(quedan);
    setPendientes(quedan.length);
    if (quedan.length < cola.length) cargar();
  }, [cargar]);

  useEffect(() => {
    sincronizarCola();
    const alVolver = () => sincronizarCola();
    window.addEventListener("online", alVolver);
    return () => window.removeEventListener("online", alVolver);
  }, [sincronizarCola]);

  /* Registra una asistencia: primero en pantalla, luego en la nube */
  const registrar = useCallback(async (datos) => {
    const { id, manual = false } = datos;   // manual: se buscó por nombre
    if (!id) return { ok: false, msg: "Código no reconocido" };
    const yaEsta = registrosHoy.find(r => r.alumno_id === id);
    if (yaEsta) {
      return { ok: false, tipo: "repetido",
        msg: `Ya registrado hoy a las ${(yaEsta.hora || "").slice(0, 5)}: ${yaEsta.nombre}` };
    }

    const ahora = new Date();
    const hora = ahora.toTimeString().slice(0, 8);
    const [lh, lm] = horaLimite.split(":").map(Number);
    const tarde = ahora.getHours() * 60 + ahora.getMinutes() > lh * 60 + lm;
    const estado = tarde ? "Retardo" : "Asistencia";

    // Los datos vigentes salen del padrón
    const enPadron = alumnos.find(a => a.id === id);
    if (!enPadron) {
      return { ok: false, tipo: "desconocido",
        msg: `El ID ${id} no está en el padrón. Verifica la credencial o actualiza la lista de alumnos.` };
    }
    if (enPadron.activo === false) {
      return { ok: false, tipo: "baja",
        msg: `${enPadron.nombre} está dado de baja en el padrón.` };
    }
    const fila = {
      alumno_id: id,
      fecha: hoyISO(),
      hora,
      estado,
      nombre: enPadron.nombre,
      grupo: enPadron.grupo || "",
      semestre: enPadron.semestre || "",
      manual,
      registrado_por: user.id,
    };

    setRegistrosHoy(prev => [...prev, { ...fila, id: "tmp_" + id }]);

    const { error } = await supabase.from("asistencias").insert(fila);
    if (error) {
      if (error.code === "23505") {
        return { ok: false, tipo: "repetido", msg: `Ya registrado hoy: ${fila.nombre}` };
      }
      // Sin conexión: se guarda en cola y se enviará solo
      const cola = leerCola(); cola.push(fila); escribirCola(cola);
      setPendientes(cola.length);
      return { ok: true, tipo: "encolado", estado,
        msg: `${fila.nombre} · guardado sin conexión, se enviará solo` };
    }
    return { ok: true, estado, msg: `${estado === "Retardo" ? "Retardo" : "Registrado"}: ${fila.nombre}` };
  }, [registrosHoy, alumnos, horaLimite, user.id]);

  const tabs = [
    ["escaneo", "Escanear", Camera],
    ["dashboard", "Panel del día", TrendingUp],
    ["historial", "Historial", CalendarDays],
    ["seguimiento", "Seguimiento", AlertTriangle],
    ["estadisticas", "Estadísticas", TrendingUp],
    ["padron", "Alumnos", Users],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>Control de asistencia</h2>
          <p className="text-sm text-slate-500">{fmtFechaLarga(fecha)}</p>
        </div>
        <div className="flex items-center gap-2">
          {pendientes > 0 && (
            <button className={btnSec + " !px-3 !py-1.5"} onClick={sincronizarCola} title="Enviar registros guardados sin conexión">
              <RefreshCw size={13} />{pendientes} por enviar
            </button>
          )}
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            Hora límite
            <input type="time" className={inputCls + " !mt-0 !w-auto !py-1"} value={horaLimite}
              onChange={e => setHoraLimite(e.target.value || "08:00")} />
          </label>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 overflow-x-auto">
        {tabs.map(([id, txt, Ico]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${tab === id ? "bg-white text-[#1a2340] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Ico size={14} />{txt}
          </button>
        ))}
      </div>

      {err && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</p>}
      {cargando && <Card className="p-8 text-center text-sm text-slate-400"><Loader2 size={18} className="animate-spin inline mr-2" />Cargando…</Card>}

      {!cargando && tab === "escaneo" && (
        <PanelEscaneo registrar={registrar} registrosHoy={registrosHoy} horaLimite={horaLimite} alumnos={alumnos} />
      )}
      {!cargando && tab === "dashboard" && (
        <PanelDia alumnos={alumnos} registros={registrosHoy} fecha={fecha}
          justificaciones={justificaciones} user={user} recargar={cargar}
          diaEspecial={diaEspecial} />
      )}
      {!cargando && tab === "historial" && <PanelHistorial alumnos={alumnos} user={user} />}
      {!cargando && tab === "seguimiento" && <PanelSeguimiento alumnos={alumnos} />}
      {!cargando && tab === "estadisticas" && <PanelEstadisticas alumnos={alumnos} />}
      {!cargando && tab === "padron" && <PanelPadron alumnos={alumnos} recargar={cargar} />}
    </div>
  );
}

/* ================================================================
   ESCANEO CON CÁMARA
   ================================================================ */
function PanelEscaneo({ registrar, registrosHoy, horaLimite, alumnos }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const corriendo = useRef(false);
  const ultimoRef = useRef({ texto: "", t: 0 });
  const [activa, setActiva] = useState(false);
  const [estado, setEstado] = useState({ msg: "Cámara apagada", tipo: "" });
  const [busqueda, setBusqueda] = useState("");

  const procesarTexto = useCallback(async (texto, manual = false) => {
    // Evita releer el mismo código varias veces por segundo
    const ahora = Date.now();
    if (texto === ultimoRef.current.texto && ahora - ultimoRef.current.t < 3000) return;
    ultimoRef.current = { texto, t: ahora };

    /* La credencial lleva ÚNICAMENTE el ID del alumno. El nombre, el
       grupo y el semestre se consultan en el padrón al escanear, así el
       dato siempre está vigente aunque la credencial sea de hace años.
       Las credenciales antiguas traían "ID|Nombre|Grupo|Generación":
       se sigue leyendo el primer campo y se ignora el resto. */
    const datos = { id: texto.split("|")[0].trim(), manual };

    const r = await registrar(datos);
    setEstado({ msg: r.msg, tipo: !r.ok ? (r.tipo === "repetido" ? "warn" : "err")
      : r.tipo === "encolado" ? "warn" : r.estado === "Retardo" ? "warn" : "ok" });
    if (r.ok && navigator.vibrate) navigator.vibrate(r.estado === "Retardo" ? [120, 60, 120] : 90);
  }, [registrar]);

  const encender = async () => {
    setEstado({ msg: "Iniciando cámara…", tipo: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, audio: false,
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      corriendo.current = true;
      setActiva(true);
      setEstado({ msg: "Apunta la credencial al recuadro", tipo: "" });
      const jsQR = (await import("jsqr")).default;
      const tick = () => {
        if (!corriendo.current) return;
        const v = videoRef.current, c = canvasRef.current;
        if (v && v.readyState === v.HAVE_ENOUGH_DATA && c) {
          c.width = v.videoWidth; c.height = v.videoHeight;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const cod = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (cod?.data) procesarTexto(cod.data);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) {
      setEstado({ msg: "No se pudo abrir la cámara: " + e.message + ". Revisa el permiso del navegador.", tipo: "err" });
    }
  };

  const apagar = useCallback(() => {
    corriendo.current = false;
    const v = videoRef.current;
    if (v?.srcObject) { v.srcObject.getTracks().forEach(t => t.stop()); v.srcObject = null; }
    setActiva(false);
    setEstado({ msg: "Cámara apagada", tipo: "" });
  }, []);

  useEffect(() => () => apagar(), [apagar]);

  /* Coincidencias mientras se escribe. Cada palabra tecleada debe
     aparecer en el nombre, sin importar el orden: así "canul edwin"
     encuentra a "CANUL CASTILLO EDWIN ALFONSO", aunque el padrón
     guarde primero los apellidos. */
  const sugerencias = React.useMemo(() => {
    const partes = normaliza(busqueda).split(/\s+/).filter(Boolean);
    if (!partes.length) return [];
    return (alumnos || [])
      .filter(a => a.activo !== false)
      .filter(a => {
        const n = normaliza(a.nombre);
        return partes.every(p => n.includes(p));
      })
      .slice(0, 8);
  }, [alumnos, busqueda]);

  const registrarPorNombre = async (alumno) => {
    await procesarTexto(alumno.id, true);   // sin credencial: queda marcado
    setBusqueda("");
  };

  const colorEstado = estado.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : estado.tipo === "warn" ? "bg-amber-50 border-amber-200 text-amber-800"
    : estado.tipo === "err" ? "bg-rose-50 border-rose-200 text-rose-700"
    : "bg-slate-50 border-slate-200 text-slate-600";

  const asistencias = registrosHoy.filter(r => r.estado === "Asistencia").length;
  const retardos = registrosHoy.filter(r => r.estado === "Retardo").length;

  /* "min-w-0" en la cuadrícula y en su columna: sin ellos, el
     contenido toma su ancho natural en lugar del disponible y estira
     la página más allá de la pantalla del teléfono. */
  return (
    <div className="grid lg:grid-cols-2 gap-4 min-w-0">
      <div className="space-y-3 min-w-0">
        <Card className="p-4 space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-[4/3]">
            <video ref={videoRef} playsInline autoPlay muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            {!activa && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                <CameraOff size={30} />
                <span className="text-xs">Cámara apagada</span>
              </div>
            )}
            {activa && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-3/5 aspect-square border-4 border-white/70 rounded-2xl" />
              </div>
            )}
          </div>

          <div className={`text-sm rounded-xl border p-3 font-medium ${colorEstado}`}>{estado.msg}</div>

          <div className="flex gap-2">
            {!activa
              ? <button className={btnPrim + " flex-1"} onClick={encender}><Camera size={15} />Encender cámara</button>
              : <button className={btnSec + " flex-1"} onClick={apagar}><CameraOff size={15} />Apagar cámara</button>}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-1">¿La credencial no lee? Busca al alumno por su nombre:</p>
            <div className="relative">
              <input className={inputCls + " !mt-0 w-full"}
                placeholder="Apellidos y nombre…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && sugerencias.length === 1) registrarPorNombre(sugerencias[0]);
                  if (e.key === "Escape") setBusqueda("");
                }} />
              {busqueda.trim() && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {sugerencias.length === 0 && (
                    <p className="text-xs text-slate-400 px-3 py-2.5">Sin coincidencias en el padrón.</p>
                  )}
                  {sugerencias.map(a => {
                    const yaEsta = registrosHoy.some(r => r.alumno_id === a.id);
                    return (
                      <button key={a.id} type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2 border-b border-slate-50 last:border-0"
                        onClick={() => registrarPorNombre(a)}>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">{a.nombre}</span>
                          <span className="block text-xs text-slate-400 truncate">
                            {a.semestre ? `${a.semestre}° ` : ""}{a.grupo ? `Grupo ${a.grupo}` : ""}
                          </span>
                        </span>
                        {yaEsta && <span className="text-[10px] font-bold text-emerald-600 shrink-0">YA REGISTRADO</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat icono={CheckCircle2} label="Asistencias" valor={asistencias} />
          <Stat icono={Clock} label="Retardos" valor={retardos} color="text-amber-600" />
          <Stat icono={Users} label="Total del día" valor={registrosHoy.length} sub={`límite ${horaLimite}`} />
        </div>
      </div>

      <Card className="p-4">
        <h3 className="font-bold text-sm mb-2">Registrados hoy · {registrosHoy.length}</h3>
        {registrosHoy.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">Aún no hay registros. Enciende la cámara para comenzar.</p>}
        <div className="max-h-[28rem] overflow-y-auto">
          {[...registrosHoy].reverse().map((r, i) => (
            <div key={r.id || i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${r.estado === "Retardo" ? "bg-amber-500" : "bg-emerald-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.nombre}</div>
                <div className="text-xs text-slate-500">
                  {r.semestre ? `${r.semestre}° ` : ""}{r.grupo || "—"} · ID {r.alumno_id}
                  {r.manual && (
                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700">
                      MANUAL
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-semibold">{(r.hora || "").slice(0, 5)}</div>
                <div className={`text-[10px] font-bold ${r.estado === "Retardo" ? "text-amber-600" : "text-emerald-600"}`}>{r.estado}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================
   PANEL DEL DÍA: indicadores, ausentes y WhatsApp
   ================================================================ */
/* ---------------- avisos a tutores ----------------
   Quiénes ya recibieron aviso se guarda en este navegador, por fecha.
   Así, si control escolar se interrumpe a la mitad o recarga la
   página, no vuelve a avisar a las mismas familias. */
const clave_avisados = (fecha) => `avisos_tutor_${fecha}`;

const leerAvisados = (fecha) => {
  try { return new Set(JSON.parse(localStorage.getItem(clave_avisados(fecha)) || "[]")); }
  catch { return new Set(); }
};

const guardarAvisados = (fecha, conjunto) => {
  try { localStorage.setItem(clave_avisados(fecha), JSON.stringify([...conjunto])); }
  catch { /* si el navegador no deja guardar, se sigue sin registro */ }
};

/* Número listo para WhatsApp: a 10 dígitos se le antepone 52 */
const numeroWhats = (tel) => {
  const t = soloDigitos(tel);
  if (!t) return null;
  return t.length === 10 ? "52" + t : t;
};

/* El mismo texto para el aviso individual y para el envío por lotes */
const mensajeAusencia = (al, fecha) => {
  const ubica = [al.semestre ? `${al.semestre}° semestre` : null, al.grupo ? `grupo ${al.grupo}` : null]
    .filter(Boolean).join(", ");
  return `Buen día. Le informamos que ${al.nombre}${ubica ? ` (${ubica})` : ""} no registró asistencia hoy ${fmtFechaLarga(fecha)}. CBTA No. 291.`;
};

/* ---------------- días especiales ----------------
   Un día marcado indica qué grupos SÍ tuvieron clase. Si un grupo no
   está en la lista, ese día no cuenta para él: ni ausentes ni falta.
   Sin marca, el día es normal y cuenta para todos. */
const claveGrupo = (sem, letra) => `${sem || ""}|${letra || ""}`;

const tuvoClase = (excepcion, sem, letra) =>
  !excepcion || (excepcion.grupos || []).includes(claveGrupo(sem, letra));

/* ---------------- documento del justificante ----------------
   La foto o el PDF se guarda con una clave formada por el alumno y
   la fecha. Como no puede haber dos justificaciones del mismo alumno
   el mismo día, esa clave es única por sí sola y al reemplazar una
   justificación el documento se sobrescribe, que es lo correcto. */
const claveJustificante = (alumnoId, fecha) => `justif_${alumnoId}_${fecha}`;

const leerComoBase64 = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(",")[1]);
  fr.onerror = () => rej(new Error("No se pudo leer el archivo."));
  fr.readAsDataURL(file);
});

/* Reconstruye el documento guardado para abrirlo en otra pestaña */
const abrirJustificante = async (alumnoId, fecha) => {
  const f = await leerArchivo(claveJustificante(alumnoId, fecha));
  if (!f) { alert("No se pudo abrir el justificante."); return; }
  const bytes = atob(f.base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: f.mime || "application/pdf" }));
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/* Etiquetas legibles del tipo de justificación */
const TIPOS_JUSTIFICACION = { medica: "Médica", personal: "Personal", otra: "Otra" };

function PanelDia({ alumnos, registros, fecha, justificaciones = [], user, recargar, diaEspecial = null }) {
  const [marcandoDia, setMarcandoDia] = useState(false);
  const [justificando, setJustificando] = useState(null);
  const [lote, setLote] = useState(false);
  const [avisados, setAvisados] = useState(() => leerAvisados(fecha));

  // Al cambiar de día se lee el registro de avisos de ese día
  useEffect(() => { setAvisados(leerAvisados(fecha)); }, [fecha]);

  const marcarAvisado = (id) => {
    setAvisados(prev => {
      const n = new Set(prev); n.add(id);
      guardarAvisados(fecha, n);
      return n;
    });
  };
  const [grupo, setGrupo] = useState("todos");
  const [semestre, setSemestre] = useState("todos");
  const grupos = [...new Set(alumnos.map(a => a.grupo).filter(Boolean))].sort();
  const semestres = [...new Set(alumnos.map(a => a.semestre).filter(Boolean))]
    .sort((x, y) => Number(x) - Number(y));

  const delGrupo = (lista) => lista
    .filter(x => grupo === "todos" || (x.grupo || "") === grupo)
    .filter(x => semestre === "todos" || String(x.semestre || "") === semestre);
  const padron = delGrupo(alumnos.filter(a => a.activo !== false));
  const presentes = delGrupo(registros);
  const idsPresentes = new Set(presentes.map(r => r.alumno_id));
  /* Si el día está marcado como especial, los grupos que no tuvieron
     clase quedan fuera: no son ausentes, simplemente no les tocaba. */
  const ausentes = padron
    .filter(a => !idsPresentes.has(a.id))
    .filter(a => tuvoClase(diaEspecial, a.semestre, a.grupo));
  const pct = padron.length ? Math.round(100 * presentes.length / padron.length) : 0;

  // Justificación vigente de cada ausente, por su ID
  const justPorAlumno = new Map((justificaciones || []).map(j => [j.alumno_id, j]));
  const justificadosCount = ausentes.filter(a => justPorAlumno.has(a.id)).length;

  const guardarJustificacion = async (datos) => {
    await guardarConJustificante(datos, fecha, user, justPorAlumno);
    await recargar();
  };

  const quitarJustificacion = async (alumno_id) => {
    const { error } = await supabase.from("justificaciones")
      .delete().eq("alumno_id", alumno_id).eq("fecha", fecha);
    if (error) throw new Error(error.message);
    /* El documento se retira con la justificación: si no, quedaría
       ocupando espacio sin nada que lo relacione con nadie. */
    await eliminarArchivo(claveJustificante(alumno_id, fecha));
    await recargar();
  };

  /* Un mismo grupo "A" existe en varios semestres, así que se agrupa
     por la combinación semestre + grupo. */
  const combos = [...new Set(alumnos.filter(a => a.activo !== false)
    .map(a => `${a.semestre || "?"}|${a.grupo || "?"}`))]
    .sort((x, y) => x.localeCompare(y, "es", { numeric: true }));

  const porGrupo = combos.map(c => {
    const [sem, gr] = c.split("|");
    const total = alumnos.filter(a => a.activo !== false
      && String(a.semestre || "?") === sem && (a.grupo || "?") === gr).length;
    const pres = registros.filter(r => String(r.semestre || "?") === sem && (r.grupo || "?") === gr).length;
    const ret = registros.filter(r => String(r.semestre || "?") === sem && (r.grupo || "?") === gr
      && r.estado === "Retardo").length;
    return { grupo: `${sem}° ${gr}`, total, presentes: pres, retardos: ret,
      ausentes: Math.max(total - pres, 0), pct: total ? Math.round(100 * pres / total) : 0 };
  });

  const exportarCSV = () => {
    const filas = [["ID", "Nombre", "Semestre", "Grupo", "Fecha", "Hora", "Estado", "Registro"]];
    presentes.forEach(r => filas.push([r.alumno_id, r.nombre, r.semestre, r.grupo, r.fecha, r.hora,
      r.estado, r.manual ? "Manual" : "Escaneado"]));
    ausentes.forEach(a => {
      const j = justPorAlumno.get(a.id);
      filas.push([a.id, a.nombre, a.semestre, a.grupo, fecha, "",
        j ? `Justificado (${TIPOS_JUSTIFICACION[j.tipo] || j.tipo})` : "Ausente", ""]);
    });
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `asistencia_${fecha}${grupo !== "todos" ? "_" + grupo : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const avisarTutor = (al) => {
    const numero = numeroWhats(al.telefono);
    if (!numero) { alert(`No hay teléfono registrado para el tutor de ${al.nombre}.`); return; }
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensajeAusencia(al, fecha))}`, "_blank");
    marcarAvisado(al.id);
  };

  /* A quiénes falta avisar: ausentes sin justificación, con teléfono
     y a los que todavía no se les ha mandado el mensaje hoy. */
  const porAvisar = ausentes.filter(a =>
    !justPorAlumno.has(a.id) && numeroWhats(a.telefono) && !avisados.has(a.id));
  const sinTelefono = ausentes.filter(a => !justPorAlumno.has(a.id) && !numeroWhats(a.telefono));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <select className={inputCls + " !mt-0 !w-auto"} value={semestre} onChange={e => setSemestre(e.target.value)}>
            <option value="todos">Todos los semestres</option>
            {semestres.map(s => <option key={s} value={s}>{s}° semestre</option>)}
          </select>
          <select className={inputCls + " !mt-0 !w-auto"} value={grupo} onChange={e => setGrupo(e.target.value)}>
            <option value="todos">Todos los grupos</option>
            {grupos.map(g => <option key={g} value={g}>Grupo {g}</option>)}
          </select>
        </div>
        <button className={btnSec + " !px-3 !py-1.5"} onClick={exportarCSV}><Download size={13} />Exportar a Excel</button>
      </div>

      {diaEspecial ? (
        <Card className="p-3 bg-sky-50 border-sky-200 flex flex-wrap items-center gap-2">
          <ClipboardCheck size={15} className="text-sky-700 shrink-0" />
          <span className="text-sm text-sky-900 flex-1 min-w-[180px]">
            <b>Día especial</b>
            {diaEspecial.motivo && ` · ${diaEspecial.motivo}`}
            {" · "}
            {(diaEspecial.grupos || []).length === 0
              ? "sin clases para nadie"
              : `solo con clase: ${(diaEspecial.grupos || []).map(g => g.replace("|", "° ")).join(", ")}`}
          </span>
          <button className="text-xs font-semibold text-sky-700 hover:underline"
            onClick={() => setMarcandoDia(true)}>Cambiar</button>
        </Card>
      ) : (
        <div className="text-right">
          <button className="text-xs font-semibold text-slate-400 hover:text-slate-600 hover:underline"
            onClick={() => setMarcandoDia(true)}>
            ¿Hoy no hubo clases normales? Márcalo
          </button>
        </div>
      )}

      {/* Ausentes son todos los que no se presentaron; los justificados
          son una parte de ellos, no un grupo aparte. Por eso la tarjeta
          de ausentes lo aclara cuando los hay. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat icono={Users} label="En el padrón" valor={padron.length} />
        <Stat icono={CheckCircle2} label="Presentes" valor={presentes.length} sub={`${pct}% de asistencia`} />
        <Stat icono={Clock} label="Retardos" valor={presentes.filter(r => r.estado === "Retardo").length} color="text-amber-600" />
        <Stat icono={AlertTriangle} label="Ausentes" valor={ausentes.length}
          color={ausentes.length ? "text-rose-600" : "text-slate-900"}
          sub={justificadosCount > 0 ? `${ausentes.length - justificadosCount} sin justificar` : undefined} />
        <Stat icono={ClipboardCheck} label="Justificados" valor={justificadosCount}
          color={justificadosCount ? "text-sky-600" : "text-slate-900"}
          sub={justificadosCount > 0 ? "de los ausentes" : undefined} />
      </div>

      {padron.length === 0 && (
        <Card className="p-4 text-sm text-amber-800 bg-amber-50 border-amber-200">
          Todavía no hay alumnos en el padrón, así que no se puede calcular quién falta.
          Cárgalo desde la pestaña <b>Alumnos</b>.
        </Card>
      )}

      {porGrupo.length > 0 && (
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Asistencia por semestre y grupo</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, porGrupo.length * 38)}>
            <BarChart data={porGrupo} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="grupo" width={60} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n, p) => [`${v}% (${p.payload.presentes} de ${p.payload.total})`, "Asistencia"]} />
              <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                {porGrupo.map((g, i) => (
                  <Cell key={i} fill={g.pct >= 90 ? "#059669" : g.pct >= 75 ? "#E8871E" : "#e11d48"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">Ausentes {grupo !== "todos" && `· grupo ${grupo}`}</h3>
          {porAvisar.length > 0 && (
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setLote(true)}>
              <MessageCircle size={13} />Avisar a los tutores ({porAvisar.length})
            </button>
          )}
          <span className="text-xs text-slate-400">
            {ausentes.length}
            {justificadosCount > 0 && <span className="text-sky-600 font-semibold"> · {justificadosCount} justificado(s)</span>}
          </span>
        </div>
        {ausentes.length === 0 && <p className="text-sm text-emerald-700 py-6 text-center">Asistencia completa. No hay ausentes.</p>}
        <div className="max-h-96 overflow-y-auto">
          {ausentes.map(a => {
            const just = justPorAlumno.get(a.id);
            return (
              <div key={a.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-slate-100 last:border-0 ${a.activo === false ? "opacity-60" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium break-words">
                    {a.nombre}
                    {a.activo === false && <span className="ml-1.5 text-[10px] font-bold text-slate-400">BAJA</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    {a.semestre ? `${a.semestre}° ` : ""}{a.grupo || "—"} · ID {a.id}
                    {a.tutor && <> · Tutor: {a.tutor}</>}
                  </div>
                  {just && (
                    <span className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
                        <ClipboardCheck size={10} />Justificado · {TIPOS_JUSTIFICACION[just.tipo] || just.tipo}
                      </span>
                      {just.archivo_guardado && (
                        <button className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline"
                          onClick={() => abrirJustificante(a.id, fecha)}
                          title={just.archivo_nombre || "Ver el justificante"}>
                          <Paperclip size={10} />Ver justificante
                        </button>
                      )}
                    </span>
                  )}
                  {!just && avisados.has(a.id) && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                      <CheckCircle2 size={10} />Tutor avisado
                    </span>
                  )}
                </div>
                {just ? (
                  <button className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 shrink-0 w-full sm:w-auto"
                    onClick={() => setJustificando(a)} title="Editar o quitar la justificación">
                    <Pencil size={13} />Editar
                  </button>
                ) : (
                  <div className="flex gap-1.5 shrink-0">
                    <button className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-sky-300 text-sky-700 hover:bg-sky-50"
                      onClick={() => setJustificando(a)} title="Marcar la falta como justificada">
                      <ClipboardCheck size={13} />Justificar
                    </button>
                    <button className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => avisarTutor(a)} title={a.telefono ? "Avisar al tutor por WhatsApp" : "Sin teléfono registrado"}>
                      <MessageCircle size={13} />WhatsApp
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {marcandoDia && (
        <MarcarDiaEspecial
          fecha={fecha}
          alumnos={alumnos}
          actual={diaEspecial}
          user={user}
          onCerrar={() => setMarcandoDia(false)}
          onListo={async () => { setMarcandoDia(false); await recargar(); }}
        />
      )}

      {lote && (
        <EnvioPorLotes
          pendientes={porAvisar}
          sinTelefono={sinTelefono}
          fecha={fecha}
          onAvisado={marcarAvisado}
          onCerrar={() => setLote(false)}
        />
      )}

      {justificando && (
        <ModalJustificar
          alumno={justificando}
          existente={justPorAlumno.get(justificando.id) || null}
          fecha={fecha}
          onClose={() => setJustificando(null)}
          onGuardar={async (datos) => { await guardarJustificacion(datos); setJustificando(null); }}
          onQuitar={async () => { await quitarJustificacion(justificando.id); setJustificando(null); }}
        />
      )}
    </div>
  );
}

/* ================================================================
   ENVÍO POR LOTES · avisa a los tutores uno tras otro
   ----------------------------------------------------------------
   No envía solo: WhatsApp no permite que una página mande mensajes
   por su cuenta. Lo que hace es encadenar el trabajo: abre WhatsApp
   con el mensaje ya escrito y, al volver, muestra al siguiente. Se
   evita buscar cada nombre en la lista y se lleva la cuenta.
   ================================================================ */

/* ================================================================
   MARCAR UN DÍA ESPECIAL
   ----------------------------------------------------------------
   Se eligen los grupos que SÍ tuvieron clase. Los demás quedan fuera
   de las ausencias de ese día y el día no les cuenta en el
   seguimiento de faltas. Si no se elige ninguno, es un día sin
   clases para todo el plantel.
   ================================================================ */

function MarcarDiaEspecial({ fecha, alumnos, actual, user, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState(actual?.motivo || "");
  const [elegidos, setElegidos] = useState(() => new Set(actual?.grupos || []));
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");

  /* Todos los grupos del padrón, ordenados */
  const grupos = [...new Set(alumnos.filter(a => a.activo !== false)
    .map(a => claveGrupo(a.semestre, a.grupo)))]
    .sort((x, y) => x.localeCompare(y, "es", { numeric: true }));

  const alternar = (g) => setElegidos(prev => {
    const n = new Set(prev);
    n.has(g) ? n.delete(g) : n.add(g);
    return n;
  });

  const guardar = async () => {
    setGuardando(true); setErr("");
    const { error } = await supabase.from("dias_clase").upsert({
      fecha, motivo: motivo.trim(), grupos: [...elegidos], registrado_por: user?.id,
    }, { onConflict: "fecha" });
    if (error) { setErr(error.message); setGuardando(false); return; }
    await onListo();
    setGuardando(false);
  };

  const quitarMarca = async () => {
    if (!window.confirm("¿Quitar la marca? El día volverá a contar como normal para todos los grupos.")) return;
    setGuardando(true); setErr("");
    const { error } = await supabase.from("dias_clase").delete().eq("fecha", fecha);
    if (error) { setErr(error.message); setGuardando(false); return; }
    await onListo();
    setGuardando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-base" style={{ fontFamily: "'Archivo', sans-serif" }}>
            Día especial
          </h3>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">{fmtFechaLarga(fecha)}</p>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">¿Qué pasó ese día?</span>
            <input className={inputCls} maxLength={120}
              placeholder="Consejo técnico · Solo se citó a 5° C · Media jornada"
              value={motivo} onChange={e => setMotivo(e.target.value)} />
          </label>

          <div>
            <span className="text-xs font-semibold text-slate-600">
              ¿Qué grupos SÍ tuvieron clase?
            </span>
            <p className="text-[11px] text-slate-400 mb-2">
              Los que no marques quedan fuera: ese día no se les cuenta como falta.
              Si no marcas ninguno, no hubo clases para nadie.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {grupos.map(g => {
                const activo = elegidos.has(g);
                return (
                  <button key={g} type="button" onClick={() => alternar(g)}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition ${
                      activo ? "bg-[#1a2340] text-white border-[#1a2340]"
                             : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
                    {g.replace("|", "° ")}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 mt-2">
              <button type="button" className="text-[11px] text-slate-400 hover:underline"
                onClick={() => setElegidos(new Set(grupos))}>Marcar todos</button>
              <button type="button" className="text-[11px] text-slate-400 hover:underline"
                onClick={() => setElegidos(new Set())}>Ninguno</button>
            </div>
          </div>

          {err && <p className="text-sm text-rose-600 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</p>}

          <div className="flex items-center justify-between pt-1">
            {actual
              ? <button className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                  onClick={quitarMarca} disabled={guardando}>Quitar la marca</button>
              : <span />}
            <div className="flex gap-2">
              <button className={btnSec} onClick={onCerrar} disabled={guardando}>Cancelar</button>
              <button className={btnPrim} onClick={guardar} disabled={guardando}>
                {guardando && <Loader2 size={14} className="animate-spin" />}Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnvioPorLotes({ pendientes, sinTelefono, fecha, onAvisado, onCerrar }) {
  const [i, setI] = useState(0);
  const [enviados, setEnviados] = useState(0);
  const [omitidos, setOmitidos] = useState(0);

  const total = pendientes.length;
  const actual = pendientes[i] || null;
  const terminado = i >= total;

  const enviar = () => {
    if (!actual) return;
    const numero = numeroWhats(actual.telefono);
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensajeAusencia(actual, fecha))}`, "_blank");
    onAvisado(actual.id);
    setEnviados(n => n + 1);
    setI(n => n + 1);
  };

  const omitir = () => { setOmitidos(n => n + 1); setI(n => n + 1); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-base" style={{ fontFamily: "'Archivo', sans-serif" }}>
            Avisar a los tutores
          </h3>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>

        {terminado ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 size={36} className="text-emerald-600 mx-auto" />
            <p className="font-semibold">Terminaste la lista</p>
            <p className="text-sm text-slate-600">
              {enviados} aviso(s) enviado(s){omitidos > 0 && `, ${omitidos} omitido(s)`}.
            </p>
            {sinTelefono.length > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-left">
                {sinTelefono.length} alumno(s) ausentes no tienen teléfono de tutor en el padrón,
                así que no se les pudo avisar: {sinTelefono.slice(0, 5).map(a => a.nombre).join(", ")}
                {sinTelefono.length > 5 && ` y ${sinTelefono.length - 5} más`}.
              </p>
            )}
            <button className={btnPrim + " w-full"} onClick={onCerrar}>Cerrar</button>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {/* Avance */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span><b className="text-[#1a2340]">{i + 1}</b> de {total}</span>
                <span>{enviados} enviado(s){omitidos > 0 && ` · ${omitidos} omitido(s)`}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(100 * i / total)}%` }} />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-3">
              <p className="text-sm font-semibold break-words">{actual.nombre}</p>
              <p className="text-xs text-slate-500">
                {actual.semestre ? `${actual.semestre}° ` : ""}{actual.grupo || "—"}
                {actual.tutor && <> · Tutor: {actual.tutor}</>}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Se enviará al {numeroWhats(actual.telefono)}</p>
            </div>

            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-[11px] uppercase font-semibold text-slate-400 mb-1">Mensaje</p>
              <p className="text-sm text-slate-700">{mensajeAusencia(actual, fecha)}</p>
            </div>

            <button className={btnPrim + " w-full !bg-emerald-600 hover:!bg-emerald-700"} onClick={enviar}>
              <MessageCircle size={15} />Abrir WhatsApp y enviar
            </button>
            <div className="flex items-center justify-between">
              <button className="text-xs font-semibold text-slate-500 hover:underline" onClick={omitir}>
                Omitir a este alumno
              </button>
              <button className="text-xs font-semibold text-slate-400 hover:underline" onClick={onCerrar}>
                Pausar y cerrar
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Al tocar el botón se abre WhatsApp con el mensaje escrito; ahí tienes que presionar
              enviar. Cuando regreses a esta pantalla ya estará el siguiente alumno. Si cierras,
              puedes retomar después: no se repiten los que ya avisaste hoy.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Justificar (o editar/quitar) la falta de un alumno
   ================================================================ */
/* Guarda la justificación junto con su documento, si lo hay.
   La usan por igual el panel del día y el historial, para que
   justificar hoy o justificar un día pasado funcionen idéntico.

   El orden importa: primero se sube el documento y solo si eso sale
   bien se registra la justificación. Al revés, un fallo de red
   dejaría una justificación diciendo que tiene documento cuando no
   lo tiene. */
async function guardarConJustificante({ alumno_id, tipo, motivo, archivo, quitarDoc }, fecha, user, previas) {
  const clave = claveJustificante(alumno_id, fecha);
  const antes = previas?.get?.(alumno_id) || null;

  let nombre = antes?.archivo_nombre || null;
  let guardado = !!antes?.archivo_guardado;

  if (archivo) {
    const b64 = await leerComoBase64(archivo);
    if (b64.length > MAX_FILE_B64) {
      throw new Error("El justificante supera el límite de ~7.5 MB. Toma la foto con menos resolución o comprime el PDF.");
    }
    const r = await guardarArchivo(clave, b64, archivo.type || "application/pdf", archivo.name);
    if (!r.guardado) throw new Error("No se pudo guardar el justificante. " + (r.error || ""));
    nombre = archivo.name;
    guardado = true;
  } else if (quitarDoc && guardado) {
    await eliminarArchivo(clave);
    nombre = null;
    guardado = false;
  }

  const { error } = await supabase.from("justificaciones").upsert(
    { alumno_id, fecha, tipo, motivo,
      archivo_nombre: nombre, archivo_guardado: guardado,
      registrado_por: user?.id },
    { onConflict: "alumno_id,fecha" });
  if (error) throw new Error(error.message);
}

function ModalJustificar({ alumno, existente, fecha, onClose, onGuardar, onQuitar }) {
  const [tipo, setTipo] = useState(existente?.tipo || "medica");
  const [motivo, setMotivo] = useState(existente?.motivo || "");
  const [archivo, setArchivo] = useState(null);     // el que se acaba de elegir
  const [quitarDoc, setQuitarDoc] = useState(false); // retirar el que ya había
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [err, setErr] = useState("");

  const guardar = async () => {
    setGuardando(true); setErr("");
    try {
      await onGuardar({ alumno_id: alumno.id, tipo, motivo: motivo.trim(),
        archivo, quitarDoc });
    }
    catch (e) { setErr(e.message); setGuardando(false); }
  };

  const quitar = async () => {
    if (!window.confirm(`¿Quitar la justificación de ${alumno.nombre}? Volverá a aparecer como ausente sin justificar.`)) return;
    setQuitando(true); setErr("");
    try { await onQuitar(); }
    catch (e) { setErr(e.message); setQuitando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-bold text-base" style={{ fontFamily: "'Archivo', sans-serif" }}>
            {existente ? "Editar justificación" : "Justificar falta"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">{alumno.nombre}</p>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Tipo de justificación</span>
            <select className={inputCls} value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="medica">Médica</option>
              <option value="personal">Personal</option>
              <option value="otra">Otra</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Motivo breve (opcional)</span>
            <textarea className={inputCls + " resize-none"} rows={2} maxLength={200}
              placeholder="Ej. Cita médica, trámite familiar…"
              value={motivo} onChange={e => setMotivo(e.target.value)} />
          </label>
          {/* Documento del justificante: receta, oficio o constancia */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <span className="text-xs font-semibold text-slate-600">
              Justificante (opcional)
            </span>

            {/* El que ya estaba guardado, si lo hay */}
            {existente?.archivo_guardado && !quitarDoc && !archivo && (
              <div className="flex flex-wrap items-center gap-2 text-xs bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">
                <Paperclip size={12} className="text-sky-600 shrink-0" />
                <button type="button" className="flex-1 min-w-0 text-left text-sky-700 font-medium truncate hover:underline"
                  onClick={() => abrirJustificante(alumno.id, fecha)}>
                  {existente.archivo_nombre || "Ver justificante"}
                </button>
                <button type="button" className="text-rose-500 hover:text-rose-700 shrink-0"
                  title="Quitar este documento" onClick={() => setQuitarDoc(true)}>
                  <X size={13} />
                </button>
              </div>
            )}

            {quitarDoc && !archivo && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                El documento se retirará al guardar.{" "}
                <button type="button" className="font-semibold hover:underline"
                  onClick={() => setQuitarDoc(false)}>Conservarlo</button>
              </p>
            )}

            {/* Elegir uno nuevo */}
            {!archivo ? (
              <input type="file" className="text-sm w-full"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
                onChange={e => { setArchivo(e.target.files[0] || null); setQuitarDoc(false); }} />
            ) : (
              <div className="flex items-center gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                <Paperclip size={12} className="text-emerald-600 shrink-0" />
                <span className="flex-1 truncate">{archivo.name}</span>
                <button type="button" className="text-rose-500 hover:text-rose-700 shrink-0"
                  onClick={() => setArchivo(null)}><X size={13} /></button>
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Foto o PDF de la receta, el oficio o la constancia. Hasta ~7.5 MB.
              {existente?.archivo_guardado && !quitarDoc && " Si eliges otro, reemplaza al actual."}
            </p>
          </div>

          <p className="text-[11px] text-slate-400">
            El motivo y el justificante solo los ven control escolar y
            administración. A los docentes únicamente les aparece que el alumno
            está justificado y el tipo.
          </p>
          {err && <p className="text-sm text-rose-600 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</p>}
          <div className="flex items-center justify-between pt-2">
            {existente
              ? <button className="text-xs font-semibold text-rose-600 hover:underline disabled:opacity-50"
                  onClick={quitar} disabled={quitando || guardando}>
                  {quitando ? "Quitando…" : "Quitar justificación"}
                </button>
              : <span />}
            <div className="flex gap-2">
              <button className={btnSec} onClick={onClose} disabled={guardando || quitando}>Cancelar</button>
              <button className={btnPrim} onClick={guardar} disabled={guardando || quitando}>
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   HISTORIAL: consulta de días anteriores
   ================================================================ */
function PanelHistorial({ alumnos, user }) {
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(hoyISO());
  const [porDia, setPorDia] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState("");
  const [detalle, setDetalle] = useState(null);      // fecha abierta
  const [filasDia, setFilasDia] = useState([]);      // alumnos de esa fecha
  const [justDia, setJustDia] = useState([]);        // justificaciones de esa fecha
  const [excepDia, setExcepDia] = useState(null);    // ¿fue día especial?
  const [marcandoDia, setMarcandoDia] = useState(false);
  const [vistaDia, setVistaDia] = useState("presentes");
  const [justificando, setJustificando] = useState(null);
  const [cargandoDia, setCargandoDia] = useState(false);
  const [borrando, setBorrando] = useState(null);
  const [exportando, setExportando] = useState(false);

  /* El resumen lo calcula la base y devuelve una fila por día. Traer
     los registros completos aquí fallaría: con 371 alumnos, tres días
     ya pasan el tope de 1000 filas de Supabase. */
  const consultar = useCallback(async () => {
    setCargando(true); setErr("");
    const { data, error } = await supabase.rpc("resumen_asistencia", { desde, hasta });
    if (error) { setErr(error.message); setPorDia([]); }
    else setPorDia((data || []).map(d => ({
      fecha: d.fecha, presentes: Number(d.presentes) || 0, retardos: Number(d.retardos) || 0,
    })));
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { consultar(); }, [consultar]);

  /* El detalle de un día sí se pide completo, pero es un solo día:
     nunca pasa del padrón. */
  const cargarDia = useCallback(async (fecha) => {
    setCargandoDia(true);
    const [as, ju, dc] = await Promise.all([
      supabase.from("asistencias").select("*").eq("fecha", fecha).order("hora"),
      supabase.from("justificaciones").select("*").eq("fecha", fecha),
      supabase.from("dias_clase").select("*").eq("fecha", fecha).maybeSingle(),
    ]);
    setFilasDia(as.error ? [] : (as.data || []));
    setJustDia(ju.error ? [] : (ju.data || []));
    setExcepDia(dc.error ? null : (dc.data || null));
    setCargandoDia(false);
  }, []);

  /* Quién faltó ese día: el padrón vigente menos quienes registraron. */
  const justPorAlumnoDia = new Map(justDia.map(j => [j.alumno_id, j]));
  const idsPresentesDia = new Set(filasDia.map(r => r.alumno_id));
  const ausentesDia = alumnos
    .filter(a => a.activo !== false && !idsPresentesDia.has(a.id))
    .filter(a => tuvoClase(excepDia, a.semestre, a.grupo))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

  const abrirDia = async (fecha) => {
    setDetalle(fecha); setFilasDia([]); setJustDia([]); setVistaDia("presentes");
    await cargarDia(fecha);
  };

  /* Justificar una falta de un día anterior. Es el mismo mecanismo del
     Panel del día, pero aplicado a la fecha que se está consultando:
     no siempre se sabe el mismo día que alguien traía justificante. */
  const guardarJustificacionDia = async (datos) => {
    await guardarConJustificante(datos, detalle, user, justPorAlumnoDia);
    await cargarDia(detalle);
  };

  const quitarJustificacionDia = async (alumno_id) => {
    const { error } = await supabase.from("justificaciones")
      .delete().eq("alumno_id", alumno_id).eq("fecha", detalle);
    if (error) throw new Error(error.message);
    await eliminarArchivo(claveJustificante(alumno_id, detalle));
    await cargarDia(detalle);
  };

  const totalPadron = alumnos.filter(a => a.activo !== false).length;
  const dias = porDia.map(d => ({
    ...d, pct: totalPadron ? Math.round(100 * d.presentes / totalPadron) : 0,
  }));

  /* Borra todos los registros de un día. Se pide confirmación escrita
     porque no hay forma de recuperarlos después. */
  const borrarDia = async (fecha, cuantos) => {
    const texto = window.prompt(
      `Se eliminarán los ${cuantos} registro(s) del ${fmtFechaLarga(fecha)}.\n\n` +
      `Esta acción no se puede deshacer. Escribe BORRAR para confirmar:`);
    if (texto !== "BORRAR") return;
    setBorrando(fecha);
    const { error } = await supabase.from("asistencias").delete().eq("fecha", fecha);
    setBorrando(null);
    if (error) { setErr("No se pudo borrar: " + error.message); return; }
    setPorDia(prev => prev.filter(d => d.fecha !== fecha));
    setDetalle(null); setFilasDia([]);
  };

  /* Para el archivo sí hacen falta todos los registros, así que se
     piden por tandas de 1000 hasta terminar. */
  const exportarRango = async () => {
    setExportando(true); setErr("");
    const TAM = 1000;
    let inicio = 0, todos = [];
    for (;;) {
      const { data, error } = await supabase.from("asistencias")
        .select("*").gte("fecha", desde).lte("fecha", hasta)
        .order("fecha", { ascending: false }).order("hora")
        .range(inicio, inicio + TAM - 1);
      if (error) { setErr("No se pudo exportar: " + error.message); setExportando(false); return; }
      todos = todos.concat(data || []);
      if (!data || data.length < TAM) break;
      inicio += TAM;
    }
    const filas = [["Fecha", "ID", "Nombre", "Semestre", "Grupo", "Hora", "Estado", "Registro"]];
    todos.forEach(r => filas.push([r.fecha, r.alumno_id, r.nombre, r.semestre, r.grupo, r.hora,
      r.estado, r.manual ? "Manual" : "Escaneado"]));
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `asistencia_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExportando(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap gap-2 items-end">
        <label className="text-xs text-slate-500">Desde
          <input type="date" className={inputCls} value={desde} onChange={e => setDesde(e.target.value)} />
        </label>
        <label className="text-xs text-slate-500">Hasta
          <input type="date" className={inputCls} value={hasta} onChange={e => setHasta(e.target.value)} />
        </label>
        <button className={btnSec} onClick={consultar} disabled={cargando}>
          {cargando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}Consultar
        </button>
        <button className={btnSec + " ml-auto"} onClick={exportarRango} disabled={!dias.length || exportando}>
          {exportando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {exportando ? "Preparando…" : "Exportar"}
        </button>
      </Card>

      {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14} />{err}</p>}

      {dias.length > 1 && (
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Tendencia de asistencia</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={[...dias].reverse()} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={f => f.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip formatter={(v, n, p) => [`${v}% (${p.payload.presentes} alumnos)`, "Asistencia"]} />
              <Line type="monotone" dataKey="pct" stroke="#1a2340" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-bold text-sm mb-2">Días registrados · {dias.length}</h3>
        {dias.length === 0 && !cargando && <p className="text-sm text-slate-400 py-6 text-center">No hay registros en este periodo.</p>}
        {dias.map(d => (
          <div key={d.fecha}
            className="flex flex-wrap items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-2 -mx-2 rounded-lg transition">
            <button onClick={() => abrirDia(d.fecha)} className="flex-1 min-w-[160px] text-left">
              <div className="text-sm font-medium capitalize">{fmtFechaLarga(d.fecha)}</div>
              <div className="text-xs text-slate-500">{d.presentes} presentes · {d.retardos} retardo(s)</div>
            </button>
            <div className="w-28">
              <div className="text-[11px] text-slate-500 text-right mb-0.5">{d.pct}%</div>
              <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full ${d.pct >= 90 ? "bg-emerald-600" : d.pct >= 75 ? "bg-[#E8871E]" : "bg-rose-500"}`}
                  style={{ width: Math.min(d.pct, 100) + "%" }} />
              </div>
            </div>
            <button className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 shrink-0"
              title="Eliminar este día del historial" disabled={borrando === d.fecha}
              onClick={() => borrarDia(d.fecha, d.presentes)}>
              {borrando === d.fecha ? <Loader2 size={15} className="animate-spin"/> : <Trash2 size={15}/>}
            </button>
          </div>
        ))}
      </Card>

      {detalle && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto"
          onClick={() => setDetalle(null)} data-formulario-abierto>
          <div className="bg-white rounded-2xl w-full max-w-2xl mt-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-sm capitalize">{fmtFechaLarga(detalle)}</h3>
              <div className="flex items-center gap-1">
                <button className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="Eliminar este día"
                  onClick={() => borrarDia(detalle, filasDia.length)}><Trash2 size={16}/></button>
                <button onClick={() => setDetalle(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
              </div>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {excepDia && (
                <div className="mb-3 text-xs bg-sky-50 border border-sky-200 text-sky-900 rounded-xl p-2.5">
                  <b>Día especial</b>{excepDia.motivo && ` · ${excepDia.motivo}`}
                  {" · "}
                  {(excepDia.grupos || []).length === 0
                    ? "sin clases para nadie"
                    : `solo con clase: ${(excepDia.grupos || []).map(g => g.replace("|", "° ")).join(", ")}`}
                </div>
              )}
              <div className="mb-3 text-right">
                <button className="text-xs font-semibold text-slate-400 hover:text-slate-600 hover:underline"
                  onClick={() => setMarcandoDia(true)}>
                  {excepDia ? "Cambiar la marca del día" : "Marcar como día especial"}
                </button>
              </div>

              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-3">
                {[["presentes", `Asistieron (${filasDia.length})`],
                  ["ausentes", `Faltaron (${ausentesDia.length})`]].map(([id, txt]) => (
                  <button key={id} onClick={() => setVistaDia(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      vistaDia === id ? "bg-white shadow-sm text-[#1a2340]" : "text-slate-500 hover:text-slate-700"}`}>
                    {txt}
                  </button>
                ))}
              </div>

              {cargandoDia && (
                <p className="text-sm text-slate-400 py-6 text-center flex items-center justify-center gap-2">
                  <Loader2 size={15} className="animate-spin" />Consultando…
                </p>
              )}

              {!cargandoDia && vistaDia === "presentes" && filasDia.map(r => (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${r.estado === "Retardo" ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.nombre}</div>
                    <div className="text-xs text-slate-500">
                      {r.semestre ? `${r.semestre}° ` : ""}{r.grupo || "—"} · ID {r.alumno_id}
                      {r.manual && (
                        <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700">
                          MANUAL
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs font-semibold shrink-0">{(r.hora || "").slice(0, 5)}</div>
                </div>
              ))}

              {!cargandoDia && vistaDia === "ausentes" && (
                <>
                  {ausentesDia.length === 0 && (
                    <p className="text-sm text-emerald-700 py-6 text-center">
                      Ese día no faltó nadie del padrón.
                    </p>
                  )}
                  {ausentesDia.map(a => {
                    const just = justPorAlumnoDia.get(a.id);
                    return (
                      <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium break-words">{a.nombre}</div>
                          <div className="text-xs text-slate-500">
                            {a.semestre ? `${a.semestre}° ` : ""}{a.grupo || "—"} · ID {a.id}
                          </div>
                          {just && (
                            <span className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
                                <ClipboardCheck size={10} />Justificado · {TIPOS_JUSTIFICACION[just.tipo] || just.tipo}
                              </span>
                              {just.archivo_guardado && (
                                <button className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:underline"
                                  onClick={() => abrirJustificante(a.id, detalle)}
                                  title={just.archivo_nombre || "Ver el justificante"}>
                                  <Paperclip size={10} />Ver justificante
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                        <button className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border shrink-0 ${
                          just ? "border-slate-300 text-slate-600 hover:bg-slate-50"
                               : "border-sky-300 text-sky-700 hover:bg-sky-50"}`}
                          onClick={() => setJustificando(a)}>
                          {just ? <><Pencil size={13} />Editar</> : <><ClipboardCheck size={13} />Justificar</>}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {marcandoDia && detalle && (
        <MarcarDiaEspecial
          fecha={detalle}
          alumnos={alumnos}
          actual={excepDia}
          user={user}
          onCerrar={() => setMarcandoDia(false)}
          onListo={async () => { setMarcandoDia(false); await cargarDia(detalle); }}
        />
      )}

      {justificando && (
        <ModalJustificar
          alumno={justificando}
          existente={justPorAlumnoDia.get(justificando.id) || null}
          fecha={detalle}
          onClose={() => setJustificando(null)}
          onGuardar={async (datos) => { await guardarJustificacionDia(datos); setJustificando(null); }}
          onQuitar={async () => { await quitarJustificacionDia(justificando.id); setJustificando(null); }}
        />
      )}
    </div>
  );
}

/* ================================================================
   PADRÓN DE ALUMNOS
   ================================================================ */
/* ================================================================
   SEGUIMIENTO DE INASISTENCIAS · semáforo por alumno
   ----------------------------------------------------------------
   Verde: pocas o ninguna falta. Amarillo: empieza a acumular.
   Rojo: faltas suficientes para atenderlo.

   Las faltas justificadas NO cuentan para el semáforo, pero se
   muestran aparte para que control escolar tenga el panorama.

   El denominador son los días en que realmente se pasó lista, no
   los días del calendario: si un día no hubo clases, no perjudica
   a nadie.
   ================================================================ */

/* Inicio del semestre en curso: agosto-enero o febrero-julio */
const inicioSemestre = () => {
  const h = new Date();
  const a = h.getFullYear(), m = h.getMonth() + 1;
  if (m >= 8) return `${a}-08-01`;           // agosto a diciembre
  if (m === 1) return `${a - 1}-08-01`;      // enero cierra el primer semestre
  return `${a}-02-01`;                        // febrero a julio
};

const haceDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDe(d);
};

const isoDe = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Clasifica a un alumno según sus faltas y los límites elegidos */
const semaforoDe = (faltas, amarillo, rojo) =>
  faltas >= rojo ? "rojo" : faltas >= amarillo ? "amarillo" : "verde";

const COLORES_SEM = {
  verde:    { chip: "bg-emerald-50 border-emerald-200 text-emerald-800", punto: "#059669", txt: "Al corriente" },
  amarillo: { chip: "bg-amber-50 border-amber-200 text-amber-800",      punto: "#E8871E", txt: "En riesgo" },
  rojo:     { chip: "bg-rose-50 border-rose-200 text-rose-800",         punto: "#e11d48", txt: "Atención urgente" },
};

function PanelSeguimiento({ alumnos }) {
  const [periodo, setPeriodo] = useState("semestre");
  const [amarillo, setAmarillo] = useState(
    () => Number(localStorage.getItem("seguimiento_amarillo")) || 3);
  const [rojo, setRojo] = useState(
    () => Number(localStorage.getItem("seguimiento_rojo")) || 6);
  const [datos, setDatos] = useState(null);
  const [manuales, setManuales] = useState([]);
  const [diasGrupo, setDiasGrupo] = useState(new Map());
  const [dias, setDias] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [grupo, setGrupo] = useState("todos");
  const [detalleAlumno, setDetalleAlumno] = useState(null);

  const desde = periodo === "semestre" ? inicioSemestre()
    : periodo === "30" ? haceDias(30) : haceDias(7);
  const hasta = hoyISO();

  const consultar = useCallback(async () => {
    setCargando(true); setErr("");
    const [res, dd, dg] = await Promise.all([
      supabase.rpc("resumen_inasistencias", { desde, hasta }),
      supabase.rpc("dias_con_registro", { desde, hasta }),
      supabase.rpc("dias_por_grupo", { desde, hasta }),
    ]);
    if (res.error || dd.error) { setErr((res.error || dd.error).message); setCargando(false); return; }
    setDatos(res.data || []);
    setDias(Number(dd.data) || 0);
    /* Cada grupo tiene su propio número de días: los días marcados
       como especiales solo cuentan para quienes sí tuvieron clase.
       Si la función aún no existe, se usa el conteo general. */
    setDiasGrupo(dg.error ? new Map()
      : new Map((dg.data || []).map(r => [`${r.semestre}|${r.grupo}`, Number(r.dias) || 0])));

    /* Registros hechos a mano: alumnos que asistieron pero no
       presentaron credencial. Se piden por tandas porque, aunque hoy
       son pocos, con los meses podrían pasar del tope de 1000. */
    const TAM = 1000;
    let inicio = 0, todos = [];
    for (;;) {
      const { data, error } = await supabase.from("asistencias")
        .select("alumno_id, fecha")
        .eq("manual", true)
        .gte("fecha", desde).lte("fecha", hasta)
        .order("fecha", { ascending: false })
        .range(inicio, inicio + TAM - 1);
      if (error) break;                      // si falla, la sección no aparece
      todos = todos.concat(data || []);
      if (!data || data.length < TAM) break;
      inicio += TAM;
    }
    setManuales(todos);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { consultar(); }, [consultar]);

  const guardarLimites = (a, r) => {
    setAmarillo(a); setRojo(r);
    localStorage.setItem("seguimiento_amarillo", String(a));
    localStorage.setItem("seguimiento_rojo", String(r));
  };

  const grupos = [...new Set(alumnos.map(a => `${a.semestre || "?"}|${a.grupo || "?"}`))]
    .sort((x, y) => x.localeCompare(y, "es", { numeric: true }));

  const lista = useMemo(() => {
    if (!datos) return [];
    const porAlumno = new Map(datos.map(d => [d.alumno_id, d]));
    return alumnos
      .filter(a => a.activo !== false)
      .map(a => {
        const d = porAlumno.get(a.id) || { presentes: 0, retardos: 0, justificadas: 0 };
        const presentes = Number(d.presentes) || 0;
        const justificadas = Number(d.justificadas) || 0;
        /* Días que de verdad le tocaban a este alumno, según su grupo */
        const suyos = diasGrupo.has(`${a.semestre || ""}|${a.grupo || ""}`)
          ? diasGrupo.get(`${a.semestre || ""}|${a.grupo || ""}`) : dias;
        const faltas = Math.max(0, suyos - presentes - justificadas);
        return { ...a, presentes, justificadas, retardos: Number(d.retardos) || 0,
          diasSuyos: suyos, faltas, sem: semaforoDe(faltas, amarillo, rojo) };
      })
      .sort((a, b) => (b.faltas - a.faltas) || (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }, [datos, alumnos, dias, diasGrupo, amarillo, rojo]);

  /* Quiénes asistieron sin credencial, cuántas veces y qué días */
  const sinCredencial = useMemo(() => {
    const porAlumno = new Map();
    manuales.forEach(m => {
      if (!porAlumno.has(m.alumno_id)) porAlumno.set(m.alumno_id, []);
      porAlumno.get(m.alumno_id).push(m.fecha);
    });
    return [...porAlumno.entries()]
      .map(([id, fechas]) => {
        const al = alumnos.find(a => a.id === id);
        return { id, nombre: al?.nombre || "(fuera del padrón)",
          semestre: al?.semestre, grupo: al?.grupo,
          veces: fechas.length, fechas: [...fechas].sort().reverse() };
      })
      .sort((a, b) => (b.veces - a.veces) || (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }, [manuales, alumnos]);

  const visibles = lista
    .filter(a => filtro === "todos" || a.sem === filtro)
    .filter(a => grupo === "todos" || `${a.semestre || "?"}|${a.grupo || "?"}` === grupo);

  const cuenta = (c) => lista.filter(a => a.sem === c).length;

  const exportar = () => {
    const filas = [["Alumno", "ID", "Semestre", "Grupo", "Días con registro",
      "Asistencias", "Retardos", "Faltas", "Justificadas", "Situación", "Tutor", "Teléfono"]];
    visibles.forEach(a => filas.push([a.nombre, a.id, a.semestre, a.grupo, a.diasSuyos,
      a.presentes, a.retardos, a.faltas, a.justificadas, COLORES_SEM[a.sem].txt,
      a.tutor || "", a.telefono || ""]));
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    el.download = `seguimiento_inasistencias_${desde}_a_${hasta}.csv`;
    el.click();
    URL.revokeObjectURL(el.href);
  };

  const avisarTutor = (al) => {
    const tel = soloDigitos(al.telefono);
    if (!tel) { alert(`No hay teléfono registrado para el tutor de ${al.nombre}.`); return; }
    const numero = tel.length === 10 ? "52" + tel : tel;
    const msg = `Buen día. Le informamos que ${al.nombre} acumula ${al.faltas} inasistencia(s) ` +
      `en lo que va del periodo. Le pedimos comunicarse con el plantel. CBTA No. 291.`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className={inputCls + " !mt-0 !w-auto"} value={periodo} onChange={e => setPeriodo(e.target.value)}>
            <option value="semestre">Semestre en curso</option>
            <option value="30">Últimos 30 días</option>
            <option value="7">Últimos 7 días</option>
          </select>
          <select className={inputCls + " !mt-0 !w-auto"} value={grupo} onChange={e => setGrupo(e.target.value)}>
            <option value="todos">Todos los grupos</option>
            {grupos.map(g => {
              const [s, l] = g.split("|");
              return <option key={g} value={g}>{s}° {l}</option>;
            })}
          </select>
          <button className={btnSec + " !px-3 !py-1.5"} onClick={consultar}>
            <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />Actualizar
          </button>
          <button className={btnSec + " !px-3 !py-1.5 ml-auto"} onClick={exportar} disabled={!visibles.length}>
            <Download size={13} />Exportar
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Del {desde} al {hasta} · <b>{dias}</b> día(s) con lista pasada.</span>
          <span className="flex items-center gap-1.5 ml-auto">
            Amarillo desde
            <input type="number" min="1" className={inputCls + " !mt-0 !w-16 !py-1"} value={amarillo}
              onChange={e => guardarLimites(Math.max(1, Number(e.target.value) || 1), rojo)} />
            faltas · Rojo desde
            <input type="number" min="1" className={inputCls + " !mt-0 !w-16 !py-1"} value={rojo}
              onChange={e => guardarLimites(amarillo, Math.max(1, Number(e.target.value) || 1))} />
            faltas
          </span>
        </div>
      </Card>

      {err && (
        <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          No se pudo consultar: {err}
          <span className="block text-xs">¿Ya ejecutaste seguimiento_inasistencias.sql en Supabase?</span>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        {["verde", "amarillo", "rojo"].map(c => (
          <button key={c} onClick={() => setFiltro(filtro === c ? "todos" : c)}
            className={`rounded-2xl border p-4 text-left transition ${COLORES_SEM[c].chip} ${filtro === c ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORES_SEM[c].punto }} />
              <span className="text-[11px] uppercase font-semibold truncate">{COLORES_SEM[c].txt}</span>
            </div>
            <div className="text-2xl font-bold" style={{ fontFamily: "'Archivo', sans-serif" }}>{cuenta(c)}</div>
          </button>
        ))}
      </div>

      {filtro !== "todos" && (
        <button className="text-xs text-slate-400 hover:underline" onClick={() => setFiltro("todos")}>
          Ver a todos los alumnos
        </button>
      )}

      <Card className="p-4">
        {cargando ? (
          <p className="text-sm text-slate-400 py-8 text-center flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />Calculando…
          </p>
        ) : dias === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">
            Todavía no se ha pasado lista en este periodo, así que no hay faltas que contar.
          </p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">Ningún alumno en esta categoría.</p>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto">
            {visibles.map(a => (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2.5 border-b border-slate-100 last:border-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0 hidden sm:block"
                  style={{ background: COLORES_SEM[a.sem].punto }} />
                <button className="flex-1 min-w-0 text-left hover:underline"
                  onClick={() => setDetalleAlumno(a)} title="Ver en qué fechas faltó">
                  <div className="text-sm font-medium break-words">
                    <span className="w-2.5 h-2.5 rounded-full inline-block mr-1.5 sm:hidden align-middle"
                      style={{ background: COLORES_SEM[a.sem].punto }} />
                    {a.nombre}
                  </div>
                  <div className="text-xs text-slate-500">
                    {a.semestre ? `${a.semestre}° ` : ""}{a.grupo || "—"} · asistió {a.presentes} de {a.diasSuyos}
                    {a.retardos > 0 && ` · ${a.retardos} retardo(s)`}
                    {a.justificadas > 0 && <span className="text-sky-600"> · {a.justificadas} justificada(s)</span>}
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${COLORES_SEM[a.sem].chip}`}>
                    {a.faltas} falta(s)
                  </span>
                  {a.sem !== "verde" && (
                    <button className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => avisarTutor(a)} title={a.telefono ? "Avisar al tutor por WhatsApp" : "Sin teléfono registrado"}>
                      <MessageCircle size={13} />WhatsApp
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {sinCredencial.length > 0 && <SinCredencial lista={sinCredencial} />}

      {detalleAlumno && (
        <FaltasDelAlumno
          alumno={detalleAlumno}
          desde={desde}
          hasta={hasta}
          onCerrar={() => setDetalleAlumno(null)}
        />
      )}
    </div>
  );
}

/* ================================================================
   EN QUÉ FECHAS FALTÓ UN ALUMNO
   ----------------------------------------------------------------
   Se comparan los días que le tocaron a su grupo contra los días en
   que sí registró asistencia. Lo que queda son sus faltas, con las
   justificadas señaladas aparte.
   ================================================================ */

function FaltasDelAlumno({ alumno, desde, hasta, onCerrar }) {
  const [faltas, setFaltas] = useState([]);
  const [presentes, setPresentes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true); setErr("");
      const [fe, dc, as, ju] = await Promise.all([
        supabase.rpc("fechas_con_lista", { desde, hasta }),
        supabase.from("dias_clase").select("fecha, grupos, motivo")
          .gte("fecha", desde).lte("fecha", hasta),
        supabase.from("asistencias").select("fecha, estado, manual")
          .eq("alumno_id", alumno.id).gte("fecha", desde).lte("fecha", hasta),
        supabase.from("justificaciones").select("fecha, tipo, motivo")
          .eq("alumno_id", alumno.id).gte("fecha", desde).lte("fecha", hasta),
      ]);
      if (!vivo) return;
      if (fe.error) { setErr(fe.error.message); setCargando(false); return; }

      const excepciones = new Map((dc.error ? [] : (dc.data || []))
        .map(d => [String(d.fecha).slice(0, 10), d]));
      const asistio = new Map((as.error ? [] : (as.data || []))
        .map(r => [String(r.fecha).slice(0, 10), r]));
      const justificada = new Map((ju.error ? [] : (ju.data || []))
        .map(j => [String(j.fecha).slice(0, 10), j]));

      const sinVenir = [];
      (fe.data || []).forEach(f => {
        const dia = String(f.fecha).slice(0, 10);
        const exc = excepciones.get(dia);
        // Si ese día su grupo no tuvo clase, no es falta
        if (!tuvoClase(exc, alumno.semestre, alumno.grupo)) return;
        if (asistio.has(dia)) return;
        sinVenir.push({ fecha: dia, just: justificada.get(dia) || null });
      });

      setFaltas(sinVenir.reverse());
      setPresentes([...asistio.entries()].map(([f, r]) => ({ fecha: f, ...r })).reverse());
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [alumno.id, alumno.semestre, alumno.grupo, desde, hasta]);

  const sinJustificar = faltas.filter(f => !f.just);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="font-bold text-base break-words" style={{ fontFamily: "'Archivo', sans-serif" }}>
              {alumno.nombre}
            </h3>
            <p className="text-xs text-slate-500">
              {alumno.semestre ? `${alumno.semestre}° ` : ""}{alumno.grupo || "—"} · del {desde} al {hasta}
            </p>
          </div>
          <button onClick={onCerrar} className="p-1 rounded-lg hover:bg-slate-100 shrink-0"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {err && (
            <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
              No se pudo consultar: {err}
            </p>
          )}

          {cargando ? (
            <p className="text-sm text-slate-400 py-6 text-center flex items-center justify-center gap-2">
              <Loader2 size={15} className="animate-spin" />Consultando…
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
                  <div className="text-lg font-bold text-emerald-700">{presentes.length}</div>
                  <div className="text-[10px] uppercase font-semibold text-emerald-700">Asistió</div>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-2">
                  <div className="text-lg font-bold text-rose-700">{sinJustificar.length}</div>
                  <div className="text-[10px] uppercase font-semibold text-rose-700">Faltó</div>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-2">
                  <div className="text-lg font-bold text-sky-700">{faltas.length - sinJustificar.length}</div>
                  <div className="text-[10px] uppercase font-semibold text-sky-700">Justificó</div>
                </div>
              </div>

              {faltas.length === 0 ? (
                <p className="text-sm text-emerald-700 py-4 text-center">
                  No faltó ningún día en este periodo.
                </p>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-1.5">Días que no asistió</p>
                  <div className="space-y-1">
                    {faltas.map(f => (
                      <div key={f.fecha} className={`flex flex-wrap items-center gap-2 text-sm rounded-lg px-2.5 py-1.5 border ${
                        f.just ? "bg-sky-50 border-sky-200" : "bg-rose-50 border-rose-200"}`}>
                        <span className="capitalize flex-1 min-w-0">{fmtFechaLarga(f.fecha)}</span>
                        {f.just && (
                          <span className="text-[10px] font-bold text-sky-700 shrink-0">
                            JUSTIFICADA · {(TIPOS_JUSTIFICACION[f.just.tipo] || f.just.tipo || "").toUpperCase()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                No se cuentan los días en que su grupo no tuvo clase.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   ALUMNOS SIN CREDENCIAL
   ----------------------------------------------------------------
   Quienes se registraron buscándolos por nombre: sí asistieron, pero
   no traían credencial o no leyó. Sirve para saber a quién hay que
   reponérsela y con qué frecuencia ocurre.
   ================================================================ */

function SinCredencial({ lista }) {
  const [abierto, setAbierto] = useState(null);

  const exportar = () => {
    const filas = [["Alumno", "ID / Matrícula", "Semestre", "Grupo", "Veces sin credencial", "Fechas"]];
    lista.forEach(a => filas.push([a.nombre, a.id, a.semestre || "", a.grupo || "",
      a.veces, a.fechas.join("; ")]));
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    el.download = "alumnos_sin_credencial.csv";
    el.click();
    URL.revokeObjectURL(el.href);
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h3 className="font-bold text-sm">Alumnos sin credencial</h3>
        <button className={btnSec + " !px-3 !py-1.5"} onClick={exportar}>
          <Download size={13} />Exportar
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Asistieron y se registraron a mano porque no traían credencial o no leyó.
        Toca un nombre para ver en qué días ocurrió.
      </p>
      <div className="max-h-80 overflow-y-auto">
        {lista.map(a => (
          <div key={a.id} className="border-b border-slate-100 last:border-0">
            <button className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-slate-50 px-2 -mx-2 rounded-lg"
              onClick={() => setAbierto(abierto === a.id ? null : a.id)}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium break-words">{a.nombre}</div>
                <div className="text-xs text-slate-500">
                  {a.semestre ? `${a.semestre}° ` : ""}{a.grupo || "—"} · ID {a.id}
                </div>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-700 shrink-0">
                {a.veces} vez(ces)
              </span>
            </button>
            {abierto === a.id && (
              <div className="pb-3 pl-2 flex flex-wrap gap-1.5">
                {a.fechas.map(f => (
                  <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ================================================================
   ESTADÍSTICAS POR GRUPO
   ----------------------------------------------------------------
   Dos indicadores distintos, que conviene no confundir:

   ASISTENCIA  = de todas las veces que un alumno del grupo debió
                 presentarse, cuántas se presentó. Se calcula sobre
                 los días que le tocaron a ESE grupo, así que los
                 días marcados como especiales no lo perjudican.

   PUNTUALIDAD = de las veces que sí llegaron, cuántas fueron antes
                 de la hora límite. Un grupo puede tener asistencia
                 baja y puntualidad alta: pocos vienen, pero los que
                 vienen llegan temprano.
   ================================================================ */

const PERIODOS_EST = [
  ["semana", "Semanal"],
  ["mes", "Mensual"],
  ["semestre", "Semestral"],
];

/* Rango de fechas según el periodo y cuántos saltos atrás */
function rangoPeriodo(tipo, desplazamiento) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (tipo === "semana") {
    const d = new Date(hoy);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + desplazamiento * 7);
    const fin = new Date(d); fin.setDate(fin.getDate() + 5);  // lunes a sábado
    return { desde: isoDe(d), hasta: isoDe(fin),
      titulo: `${d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} al ${fin.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}` };
  }
  if (tipo === "mes") {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1);
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { desde: isoDe(d), hasta: isoDe(fin),
      titulo: d.toLocaleDateString("es-MX", { month: "long", year: "numeric" }) };
  }
  // Semestre: agosto-enero o febrero-julio
  const a = hoy.getFullYear(), m = hoy.getMonth() + 1;
  const desde = m >= 8 ? `${a}-08-01` : m === 1 ? `${a - 1}-08-01` : `${a}-02-01`;
  const hasta = m >= 8 ? `${a + 1}-01-31` : m === 1 ? `${a}-01-31` : `${a}-07-31`;
  const nombre = (m >= 8 || m === 1) ? "agosto – enero" : "febrero – julio";
  return { desde, hasta, titulo: `Semestre ${nombre}` };
}

const colorPct = (p) => p >= 90 ? "#059669" : p >= 75 ? "#E8871E" : "#e11d48";

function PanelEstadisticas({ alumnos }) {
  const [tipo, setTipo] = useState("semana");
  const [salto, setSalto] = useState(0);
  const [datos, setDatos] = useState([]);
  const [diasNormales, setDiasNormales] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");

  const { desde, hasta, titulo } = rangoPeriodo(tipo, salto);

  const consultar = useCallback(async () => {
    setCargando(true); setErr("");
    const est = await supabase.rpc("estadisticas_asistencia", { desde, hasta });
    if (est.error) { setErr(est.error.message); setCargando(false); return; }
    setDatos(est.data || []);
    /* Los días normales del periodo: el mismo número para todos los
       grupos, porque los días especiales quedan fuera. */
    setDiasNormales(Number(est.data?.[0]?.dias) || 0);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { consultar(); }, [consultar]);

  const filas = useMemo(() => {
    const porGrupo = new Map(datos.map(d => [`${d.semestre}|${d.grupo}`, d]));
    const grupos = [...new Set(alumnos.filter(a => a.activo !== false)
      .map(a => `${a.semestre || ""}|${a.grupo || ""}`))]
      .sort((x, y) => x.localeCompare(y, "es", { numeric: true }));

    return grupos.map(g => {
      const [sem, letra] = g.split("|");
      const d = porGrupo.get(g) || { registros: 0, retardos: 0 };
      const registros = Number(d.registros) || 0;
      const retardos = Number(d.retardos) || 0;
      const inscritos = alumnos.filter(a => a.activo !== false
        && (a.semestre || "") === sem && (a.grupo || "") === letra).length;
      const dias = diasNormales;
      const esperados = inscritos * dias;
      return {
        clave: g, nombre: `${sem}° ${letra}`, inscritos, dias, registros, retardos,
        asistencia: esperados ? Math.round(100 * registros / esperados) : null,
        puntualidad: registros ? Math.round(100 * (registros - retardos) / registros) : null,
      };
    });
  }, [datos, alumnos, diasNormales]);

  const conDatos = filas.filter(f => f.dias > 0);
  const promedioAsis = conDatos.length
    ? Math.round(conDatos.reduce((s, f) => s + (f.asistencia || 0), 0) / conDatos.length) : 0;
  const promedioPunt = conDatos.length
    ? Math.round(conDatos.reduce((s, f) => s + (f.puntualidad || 0), 0) / conDatos.length) : 0;

  const exportar = () => {
    const f = [["Periodo", "Grupo", "Inscritos", "Días con clase", "Asistencias registradas",
      "Retardos", "% de asistencia", "% de puntualidad"]];
    conDatos.forEach(x => f.push([titulo, x.nombre, x.inscritos, x.dias, x.registros,
      x.retardos, x.asistencia, x.puntualidad]));
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + f.map(r => r.map(esc).join(",")).join("\n");
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    el.download = `estadisticas_${desde}_a_${hasta}.csv`;
    el.click();
    URL.revokeObjectURL(el.href);
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {PERIODOS_EST.map(([id, txt]) => (
              <button key={id} onClick={() => { setTipo(id); setSalto(0); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                  tipo === id ? "bg-white shadow-sm text-[#1a2340]" : "text-slate-500 hover:text-slate-700"}`}>
                {txt}
              </button>
            ))}
          </div>
          <button className={btnSec + " !px-3 !py-1.5 ml-auto"} onClick={exportar} disabled={!conDatos.length}>
            <Download size={13} />Exportar
          </button>
        </div>

        {tipo !== "semestre" && (
          <div className="flex items-center justify-between gap-2">
            <button className={btnSec + " !px-3 !py-1.5"} onClick={() => setSalto(n => n - 1)}>
              <ChevronLeft size={15} />Anterior
            </button>
            <span className="text-sm font-bold text-center capitalize">{titulo}</span>
            <button className={btnSec + " !px-3 !py-1.5"} disabled={salto >= 0}
              onClick={() => setSalto(n => n + 1)}>
              Siguiente<ChevronRight size={15} />
            </button>
          </div>
        )}
        {tipo === "semestre" && (
          <p className="text-sm font-bold text-center capitalize">{titulo}</p>
        )}
      </Card>

      {err && (
        <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>No se pudo consultar: {err}
            <span className="block text-xs">¿Ya se ejecutó estadisticas_grupo.sql en Supabase?</span>
          </span>
        </Card>
      )}

      {cargando ? (
        <Card className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />Calculando…
        </Card>
      ) : conDatos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          No se pasó lista en este periodo.
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="text-[11px] uppercase font-semibold text-slate-400 mb-1">Asistencia del plantel</div>
              <div className="text-2xl font-bold" style={{ fontFamily: "'Archivo', sans-serif", color: colorPct(promedioAsis) }}>
                {promedioAsis}%
              </div>
              <div className="text-[11px] text-slate-400">promedio de los {conDatos.length} grupos</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase font-semibold text-slate-400 mb-1">Puntualidad del plantel</div>
              <div className="text-2xl font-bold" style={{ fontFamily: "'Archivo', sans-serif", color: colorPct(promedioPunt) }}>
                {promedioPunt}%
              </div>
              <div className="text-[11px] text-slate-400">de quienes sí asistieron</div>
            </Card>
          </div>

          <Card className="p-4">
            <h3 className="font-bold text-sm mb-3">Comparación entre grupos</h3>
            <ResponsiveContainer width="100%" height={Math.max(200, conDatos.length * 40)}>
              <BarChart data={conDatos} layout="vertical" margin={{ top: 4, right: 30, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nombre" width={55} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, n) => [`${v}%`, n === "asistencia" ? "Asistencia" : "Puntualidad"]} />
                <Legend formatter={v => v === "asistencia" ? "Asistencia" : "Puntualidad"} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="asistencia" fill="#1a2340" radius={[0, 4, 4, 0]} />
                <Bar dataKey="puntualidad" fill="#38bdf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="overflow-hidden">
            <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1.2fr] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-semibold text-slate-400">
              <span>Grupo</span><span>Asistencia</span><span>Puntualidad</span><span>Detalle</span>
            </div>
            {conDatos.map(f => (
              <div key={f.clave} className="px-4 py-3 border-b border-slate-100 last:border-0">
                <div className="sm:grid sm:grid-cols-[1fr_1fr_1fr_1.2fr] sm:gap-2 sm:items-center">
                  <div className="text-sm font-bold">{f.nombre}</div>

                  <div className="flex items-center gap-2 mt-1 sm:mt-0">
                    <span className="sm:hidden text-[11px] text-slate-400 w-20">Asistencia</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden max-w-[120px]">
                      <div className="h-full rounded-full"
                        style={{ width: `${f.asistencia ?? 0}%`, background: colorPct(f.asistencia ?? 0) }} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: colorPct(f.asistencia ?? 0) }}>
                      {f.asistencia ?? "—"}%
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1 sm:mt-0">
                    <span className="sm:hidden text-[11px] text-slate-400 w-20">Puntualidad</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden max-w-[120px]">
                      <div className="h-full rounded-full"
                        style={{ width: `${f.puntualidad ?? 0}%`, background: colorPct(f.puntualidad ?? 0) }} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: colorPct(f.puntualidad ?? 0) }}>
                      {f.puntualidad ?? "—"}%
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 mt-1 sm:mt-0">
                    {f.inscritos} inscritos · {f.dias} día(s) · {f.retardos} retardo(s)
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <p className="text-[11px] text-slate-400">
            Los días marcados como especiales quedan fuera de estas estadísticas: un día en
            que solo se citó a un grupo distorsionaría el panorama. La puntualidad se mide
            únicamente entre quienes sí asistieron.
          </p>
        </>
      )}
    </div>
  );
}

function PanelPadron({ alumnos, recargar }) {
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [modo, setModo] = useState("reemplazar");   // reemplazar | eliminar | agregar
  const [limpiando, setLimpiando] = useState(false);

  /* Quita alumnos del padrón. Los que ya tienen asistencias registradas
     NO se borran: se dan de baja, para no dejar registros de asistencia
     apuntando a un alumno inexistente. Devuelve cuántos de cada caso. */
  const quitarDelPadron = async (ids) => {
    if (!ids.length) return { borrados: 0, conservados: 0 };
    const protegidos = new Set();
    for (let i = 0; i < ids.length; i += 100) {
      const tanda = ids.slice(i, i + 100);
      const { data } = await supabase.from("asistencias")
        .select("alumno_id").in("alumno_id", tanda);
      (data || []).forEach(r => protegidos.add(r.alumno_id));
    }
    const aBorrar = ids.filter(id => !protegidos.has(id));
    for (let i = 0; i < aBorrar.length; i += 100) {
      const { error } = await supabase.from("alumnos").delete().in("id", aBorrar.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
    if (protegidos.size) {
      const lista = [...protegidos];
      for (let i = 0; i < lista.length; i += 100) {
        await supabase.from("alumnos").update({ activo: false }).in("id", lista.slice(i, i + 100));
      }
    }
    return { borrados: aBorrar.length, conservados: protegidos.size };
  };

  /* Botón para vaciar de una vez los que ya estaban dados de baja */
  const limpiarBajas = async () => {
    const bajas = alumnos.filter(a => a.activo === false);
    if (!bajas.length) return;
    if (!window.confirm(
      `¿Borrar del padrón a ${bajas.length} alumno(s) dados de baja?\n\n` +
      `Quien tenga asistencias registradas se conservará dado de baja para no perder su historial.\n\n` +
      `Esto no se puede deshacer.`)) return;
    setLimpiando(true); setErr(""); setMsg("");
    try {
      const r = await quitarDelPadron(bajas.map(a => a.id));
      setMsg(`Se borraron ${r.borrados} alumno(s) del padrón.` +
        (r.conservados ? ` ${r.conservados} se conservaron porque ya tienen asistencias registradas.` : ""));
      await recargar();
    } catch (e) { setErr("No se pudo limpiar: " + e.message); }
    setLimpiando(false);
  };
  const [semSel, setSemSel] = useState("todos");
  const [verBajas, setVerBajas] = useState(false);
  const [pendiente, setPendiente] = useState(null); // confirmación de bajas

  const grupos = [...new Set(alumnos.map(a => a.grupo).filter(Boolean))].sort();
  const semestres = [...new Set(alumnos.map(a => a.semestre).filter(Boolean))]
    .sort((x, y) => Number(x) - Number(y));
  const activos = alumnos.filter(a => a.activo !== false);
  const bajas = alumnos.filter(a => a.activo === false);
  const lista = (verBajas ? bajas : activos)
    .filter(a => grupo === "todos" || a.grupo === grupo)
    .filter(a => semSel === "todos" || String(a.semestre || "") === semSel)
    .filter(a => !q || (a.nombre || "").toLowerCase().includes(q.toLowerCase()) || a.id.includes(q));

  const reactivar = async (al) => {
    const { error } = await supabase.from("alumnos").update({ activo: true }).eq("id", al.id);
    if (error) { setErr(error.message); return; }
    await recargar();
  };

  /* Eliminar definitivamente solo tiene sentido para altas equivocadas.
     Si el alumno ya tiene asistencias registradas, conviene dejarlo
     dado de baja para no dejar huecos en el historial. */
  const eliminar = async (al) => {
    const { count } = await supabase.from("asistencias")
      .select("id", { count: "exact", head: true }).eq("alumno_id", al.id);
    const aviso = count
      ? `${al.nombre} tiene ${count} registro(s) de asistencia. Si lo eliminas, esos registros quedarán sin nombre en el padrón.\n\n`
      : "";
    if (!window.confirm(`${aviso}¿Eliminar definitivamente a ${al.nombre} del padrón?`)) return;
    const { error } = await supabase.from("alumnos").delete().eq("id", al.id);
    if (error) { setErr(error.message); return; }
    await recargar();
  };

  /* Carga desde el mismo Excel que usas para generar las credenciales:
     ID, apellidos, nombre(s), generación, grupo, tutor y teléfono. */
  const cargarExcel = async (file) => {
    if (!file) return;
    setSubiendo(true); setErr(""); setMsg("");
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

      const clave = (obj, ...nombres) => {
        const llaves = Object.keys(obj);
        for (const n of nombres) {
          const k = llaves.find(x => x.trim().toUpperCase().replace(/\s+/g, " ") === n);
          if (k) return obj[k];
        }
        return "";
      };

      const registros = filas.map(f => {
        const id = String(clave(f, "ID", "MATRICULA", "MATRÍCULA")).trim();
        if (!id) return null;
        const nombre = [
          clave(f, "APELLIDO PATERNO"), clave(f, "APELLIDO MATERNO"), clave(f, "NOMBRE (S)", "NOMBRE", "NOMBRES"),
        ].map(x => String(x).trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
          || String(clave(f, "NOMBRE COMPLETO", "NOMBRE")).trim();
        if (!nombre) return null;
        return {
          id,
          nombre,
          grupo: String(clave(f, "GRUPO")).trim(),
          semestre: String(clave(f, "SEMESTRE", "SEM")).trim(),
          generacion: String(clave(f, "GENERACION", "GENERACIÓN")).trim(),
          tutor: String(clave(f, "NOMBRE DEL TUTOR", "TUTOR")).trim(),
          telefono: String(clave(f, "TELEFONO DEL TUTOR", "TELÉFONO DEL TUTOR", "TELEFONO", "TELÉFONO")).trim(),
          activo: true,
        };
      }).filter(Boolean);

      if (!registros.length) {
        setErr("No se encontraron alumnos. Revisa que el archivo tenga las columnas ID, APELLIDO PATERNO, APELLIDO MATERNO, NOMBRE (S) y GRUPO.");
        setSubiendo(false); return;
      }

      // Se actualiza por ID: los alumnos existentes se corrigen, no se duplican
      const { error } = await supabase.from("alumnos").upsert(registros, { onConflict: "id" });
      if (error) throw new Error(error.message);

      /* Los que estaban en el padrón y ya no vienen en el archivo:
         en modo "reemplazar" se dan de baja (no se borran, para que su
         historial de asistencia siga teniendo sentido). */
      const idsNuevos = new Set(registros.map(r => r.id));
      const sobrantes = alumnos.filter(a => a.activo !== false && !idsNuevos.has(a.id));

      if (modo === "reemplazar" && sobrantes.length) {
        const { error: e2 } = await supabase.from("alumnos")
          .update({ activo: false }).in("id", sobrantes.map(a => a.id));
        if (e2) throw new Error(e2.message);
        setMsg(`${registros.length} alumno(s) cargados o actualizados. ` +
          `${sobrantes.length} que ya no aparecen en la lista fueron dados de baja.`);
      } else if (modo === "eliminar" && sobrantes.length) {
        const r = await quitarDelPadron(sobrantes.map(a => a.id));
        setMsg(`${registros.length} alumno(s) cargados o actualizados. ` +
          `${r.borrados} que ya no aparecen en la lista se borraron del padrón.` +
          (r.conservados ? ` ${r.conservados} se dieron de baja en vez de borrarse porque ya tienen asistencias registradas.` : ""));
      } else if (sobrantes.length) {
        setMsg(`${registros.length} alumno(s) cargados o actualizados. ` +
          `${sobrantes.length} del padrón no venían en el archivo y se conservaron activos.`);
      } else {
        setMsg(`${registros.length} alumno(s) cargados o actualizados.`);
      }
      await recargar();
    } catch (e) { setErr("No se pudo leer el archivo: " + e.message); }
    setSubiendo(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <h3 className="font-bold text-sm">Padrón de alumnos</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Sirve para saber quién faltó y para avisar a los tutores. Carga el mismo archivo de
            Excel que usas para generar las credenciales; los alumnos que ya existan se actualizan
            en lugar de duplicarse.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">¿Qué hacer con los alumnos que ya no aparezcan en el archivo?</p>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" className="mt-1" checked={modo === "reemplazar"} onChange={() => setModo("reemplazar")} />
            <span>
              <b>Darlos de baja</b> — la lista queda igual al archivo.
              <span className="block text-xs text-slate-500">Úsalo cuando subas el padrón completo del plantel.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" className="mt-1" checked={modo === "eliminar"} onChange={() => setModo("eliminar")} />
            <span>
              <b>Borrarlos del padrón</b> — el archivo manda, sin acumular.
              <span className="block text-xs text-slate-500">
                Úsalo si solo te interesa la lista vigente. Quien tenga asistencias registradas
                se da de baja en lugar de borrarse, para no perder su historial.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" className="mt-1" checked={modo === "agregar"} onChange={() => setModo("agregar")} />
            <span>
              <b>Conservarlos</b> — solo agrega y corrige.
              <span className="block text-xs text-slate-500">Úsalo si subes la lista de un solo grupo o generación.</span>
            </span>
          </label>
          <p className="text-[11px] text-slate-400">
            Dar de baja no borra a nadie: el alumno deja de contar para la asistencia, pero su
            historial se conserva y puedes reactivarlo cuando quieras. Borrar sí lo quita de la lista.
          </p>
        </div>

        <label className={btnPrim + " cursor-pointer w-fit" + (subiendo ? " opacity-50 pointer-events-none" : "")}>
          {subiendo ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {subiendo ? "Cargando…" : "Cargar lista desde Excel"}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { cargarExcel(e.target.files[0]); e.target.value = ""; }} />
        </label>
        {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{msg}</p>}
        {err && <p className="text-sm text-rose-600 flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{err}</p>}
      </Card>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + " !mt-0 !pl-8"} placeholder="Buscar por nombre o ID…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className={inputCls + " !mt-0 !w-auto"} value={semSel} onChange={e => setSemSel(e.target.value)}>
          <option value="todos">Todos los semestres</option>
          {semestres.map(s => <option key={s} value={s}>{s}° semestre</option>)}
        </select>
        <select className={inputCls + " !mt-0 !w-auto"} value={grupo} onChange={e => setGrupo(e.target.value)}>
          <option value="todos">Todos los grupos</option>
          {grupos.map(g => <option key={g} value={g}>Grupo {g}</option>)}
        </select>
        <button onClick={() => setVerBajas(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold border transition ${verBajas ? "bg-[#1a2340] text-white border-[#1a2340]" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
          {verBajas ? `Viendo bajas (${bajas.length})` : `Ver bajas (${bajas.length})`}
        </button>
        {verBajas && bajas.length > 0 && (
          <button onClick={limpiarBajas} disabled={limpiando}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-rose-300 text-rose-600 hover:bg-rose-50 disabled:opacity-50">
            {limpiando ? "Borrando…" : `Borrar las ${bajas.length} bajas del padrón`}
          </button>
        )}
        <span className="text-xs text-slate-400">{lista.length} de {verBajas ? bajas.length : activos.length}</span>
      </Card>

      <Card className="p-4">
        {lista.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">
            {verBajas ? "No hay alumnos dados de baja." : "No hay alumnos que coincidan."}
          </p>
        )}
        <div className="max-h-[32rem] overflow-y-auto">
          {lista.map(a => (
            <div key={a.id} className={`flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 ${a.activo === false ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {a.nombre}
                  {a.activo === false && <span className="ml-1.5 text-[10px] font-bold text-slate-400">BAJA</span>}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  ID {a.id} · {a.semestre ? `${a.semestre}° semestre` : "Semestre —"} · Grupo {a.grupo || "—"}
                  {a.tutor && <> · Tutor: {a.tutor}</>}
                </div>
              </div>
              {!a.telefono && <span className="text-[10px] font-bold text-amber-600 shrink-0">SIN TELÉFONO</span>}
              {a.activo === false ? (
                <button className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0"
                  onClick={() => reactivar(a)} title="Volver a incluirlo en el padrón">
                  <UserCheck size={12}/>Reactivar
                </button>
              ) : (
                <button className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 shrink-0" title="Dar de baja"
                  onClick={async () => {
                    if (!window.confirm(`¿Dar de baja a ${a.nombre}? Dejará de contar para la asistencia, pero su historial se conserva.`)) return;
                    await supabase.from("alumnos").update({ activo: false }).eq("id", a.id);
                    await recargar();
                  }}><UserMinus size={14}/></button>
              )}
              <button className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 shrink-0" title="Eliminar del padrón"
                onClick={() => eliminar(a)}><Trash2 size={14}/></button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
