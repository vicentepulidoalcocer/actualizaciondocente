/* ================================================================
   CONTROL DE ASISTENCIA CON CÓDIGOS QR
   Escaneo con cámara, registro en Supabase, historial permanente,
   panel de indicadores y aviso a tutores por WhatsApp.

   El historial vive en la nube: ya no se pierde al borrar el caché
   ni queda encerrado en una sola computadora.
   ================================================================ */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera, CameraOff, Users, Clock, CheckCircle2, AlertTriangle, Download,
  Upload, Search, Loader2, TrendingUp, MessageCircle, CalendarDays, X, RefreshCw,
  Trash2, UserMinus, UserCheck, ClipboardCheck, Pencil,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line,
} from "recharts";
import { supabase } from "./lib/supabase";

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
// Quita acentos y pasa a minúsculas, para que "Nuñez" encuentre "Núñez"
const normaliza = (t) => (t || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const btnPrim = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1a2340] text-white text-sm font-semibold hover:bg-[#26305a] transition disabled:opacity-50";
const btnSec = "inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50";
const inputCls = "mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2340]/20";
const Card = ({ children, className = "", ...r }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`} {...r}>{children}</div>
);
const Stat = ({ icono: Ico, label, valor, sub, color = "text-slate-900" }) => (
  <Card className="p-4">
    <div className="flex items-center gap-2 text-slate-400 mb-1"><Ico size={15} /><span className="text-[11px] uppercase font-semibold">{label}</span></div>
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
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [horaLimite, setHoraLimite] = useState(
    () => localStorage.getItem("asistencia_hora_limite") || "08:00");
  const [pendientes, setPendientes] = useState(leerCola().length);

  const fecha = hoyISO();

  const cargar = useCallback(async () => {
    setCargando(true); setErr("");
    try {
      const [al, as, ju] = await Promise.all([
        supabase.from("alumnos").select("*").order("nombre"),
        supabase.from("asistencias").select("*").eq("fecha", hoyISO()).order("hora"),
        supabase.from("justificaciones").select("*").eq("fecha", hoyISO()),
      ]);
      if (al.error) throw new Error(al.error.message);
      if (as.error) throw new Error(as.error.message);
      if (ju.error) throw new Error(ju.error.message);
      setAlumnos(al.data || []);
      setRegistrosHoy(as.data || []);
      setJustificaciones(ju.data || []);
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
    const { id } = datos;
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
          justificaciones={justificaciones} user={user} recargar={cargar} />
      )}
      {!cargando && tab === "historial" && <PanelHistorial alumnos={alumnos} user={user} />}
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

  const procesarTexto = useCallback(async (texto) => {
    // Evita releer el mismo código varias veces por segundo
    const ahora = Date.now();
    if (texto === ultimoRef.current.texto && ahora - ultimoRef.current.t < 3000) return;
    ultimoRef.current = { texto, t: ahora };

    /* La credencial lleva ÚNICAMENTE el ID del alumno. El nombre, el
       grupo y el semestre se consultan en el padrón al escanear, así el
       dato siempre está vigente aunque la credencial sea de hace años.
       Las credenciales antiguas traían "ID|Nombre|Grupo|Generación":
       se sigue leyendo el primer campo y se ignora el resto. */
    const datos = { id: texto.split("|")[0].trim() };

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

  // Coincidencias por nombre mientras se escribe (apellido paterno,
  // apellido materno o nombre, sin importar acentos ni mayúsculas)
  const sugerencias = React.useMemo(() => {
    const q = normaliza(busqueda);
    if (!q) return [];
    return (alumnos || [])
      .filter(a => a.activo !== false)
      .filter(a => normaliza(a.nombre).includes(q))
      .slice(0, 8);
  }, [alumnos, busqueda]);

  const registrarDesdeNombre = async (alumno) => {
    await procesarTexto(alumno.id);
    setBusqueda("");
  };

  const colorEstado = estado.tipo === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
    : estado.tipo === "warn" ? "bg-amber-50 border-amber-200 text-amber-800"
    : estado.tipo === "err" ? "bg-rose-50 border-rose-200 text-rose-700"
    : "bg-slate-50 border-slate-200 text-slate-600";

  const asistencias = registrosHoy.filter(r => r.estado === "Asistencia").length;
  const retardos = registrosHoy.filter(r => r.estado === "Retardo").length;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-3">
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

          <div className="pt-2 border-t border-slate-100 relative">
            <p className="text-xs text-slate-500 mb-1">¿La credencial no lee? Busca al alumno por nombre:</p>
            <div className="relative">
              <input className={inputCls + " !mt-0 w-full"}
                placeholder="Apellido paterno, apellido materno o nombre…"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && sugerencias.length === 1) registrarDesdeNombre(sugerencias[0]);
                  if (e.key === "Escape") setBusqueda("");
                }} />
              {busqueda.trim() && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {sugerencias.length === 0 && (
                    <p className="text-xs text-slate-400 px-3 py-2">Sin coincidencias en el padrón.</p>
                  )}
                  {sugerencias.map(a => {
                    const yaEsta = registrosHoy.some(r => r.alumno_id === a.id);
                    return (
                      <button key={a.id} type="button"
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2 border-b border-slate-50 last:border-0"
                        onClick={() => registrarDesdeNombre(a)}>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">{a.nombre}</span>
                          <span className="block text-xs text-slate-400 truncate">
                            {a.semestre ? `${a.semestre}° ` : ""}{a.grupo ? `Grupo ${a.grupo}` : ""} · ID {a.id}
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

        <div className="grid grid-cols-3 gap-3">
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

/* Etiquetas legibles para el tipo de justificación */
const TIPOS_JUSTIFICACION = { medica: "Médica", personal: "Personal", otra: "Otra" };

/* ================================================================
   PANEL DEL DÍA: indicadores, ausentes, justificantes y WhatsApp
   ================================================================ */
function PanelDia({ alumnos, registros, fecha, justificaciones, user, recargar }) {
  const [grupo, setGrupo] = useState("todos");
  const [semestre, setSemestre] = useState("todos");
  const [justificando, setJustificando] = useState(null); // alumno seleccionado, o null
  const grupos = [...new Set(alumnos.map(a => a.grupo).filter(Boolean))].sort();
  const semestres = [...new Set(alumnos.map(a => a.semestre).filter(Boolean))]
    .sort((x, y) => Number(x) - Number(y));

  const delGrupo = (lista) => lista
    .filter(x => grupo === "todos" || (x.grupo || "") === grupo)
    .filter(x => semestre === "todos" || String(x.semestre || "") === semestre);
  const padron = delGrupo(alumnos.filter(a => a.activo !== false));
  const presentes = delGrupo(registros);
  const idsPresentes = new Set(presentes.map(r => r.alumno_id));
  const ausentes = padron.filter(a => !idsPresentes.has(a.id));
  const pct = padron.length ? Math.round(100 * presentes.length / padron.length) : 0;

  // Justificación vigente de cada alumno ausente, por su ID
  const justPorAlumno = new Map((justificaciones || []).map(j => [j.alumno_id, j]));
  const justificadosCount = ausentes.filter(a => justPorAlumno.has(a.id)).length;

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
    const filas = [["ID", "Nombre", "Semestre", "Grupo", "Fecha", "Hora", "Estado"]];
    presentes.forEach(r => filas.push([r.alumno_id, r.nombre, r.semestre, r.grupo, r.fecha, r.hora, r.estado]));
    ausentes.forEach(a => {
      const just = justPorAlumno.get(a.id);
      const estado = just ? `Justificado (${TIPOS_JUSTIFICACION[just.tipo] || just.tipo})` : "Ausente";
      filas.push([a.id, a.nombre, a.semestre, a.grupo, fecha, "", estado]);
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
    const tel = soloDigitos(al.telefono);
    if (!tel) { alert(`No hay teléfono registrado para el tutor de ${al.nombre}.`); return; }
    const numero = tel.length === 10 ? "52" + tel : tel;
    const ubica = [al.semestre ? `${al.semestre}° semestre` : null, al.grupo ? `grupo ${al.grupo}` : null]
      .filter(Boolean).join(", ");
    const msg = `Buen día. Le informamos que ${al.nombre}${ubica ? ` (${ubica})` : ""} no registró asistencia hoy ${fmtFechaLarga(fecha)}. CBTA No. 291.`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const guardarJustificacion = async ({ alumno_id, tipo, motivo }) => {
    const { error } = await supabase.from("justificaciones").upsert(
      { alumno_id, fecha, tipo, motivo, registrado_por: user?.id },
      { onConflict: "alumno_id,fecha" });
    if (error) throw new Error(error.message);
    await recargar();
  };

  const quitarJustificacion = async (alumno_id) => {
    const { error } = await supabase.from("justificaciones")
      .delete().eq("alumno_id", alumno_id).eq("fecha", fecha);
    if (error) throw new Error(error.message);
    await recargar();
  };

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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icono={Users} label="En el padrón" valor={padron.length} />
        <Stat icono={CheckCircle2} label="Presentes" valor={presentes.length} sub={`${pct}% de asistencia`} />
        <Stat icono={Clock} label="Retardos" valor={presentes.filter(r => r.estado === "Retardo").length} color="text-amber-600" />
        <Stat icono={AlertTriangle} label="Ausentes" valor={ausentes.length} color={ausentes.length ? "text-rose-600" : "text-slate-900"}
          sub={justificadosCount ? `${justificadosCount} justificado(s)` : undefined} />
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
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
                      <ClipboardCheck size={10} />Justificado · {TIPOS_JUSTIFICACION[just.tipo] || just.tipo}
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

      {justificando && (
        <ModalJustificar
          alumno={justificando}
          existente={justPorAlumno.get(justificando.id) || null}
          onClose={() => setJustificando(null)}
          onGuardar={async (datos) => { await guardarJustificacion(datos); setJustificando(null); }}
          onQuitar={async () => { await quitarJustificacion(justificando.id); setJustificando(null); }}
        />
      )}
    </div>
  );
}

/* ================================================================
   MODAL: justificar (o editar/quitar) la falta de un alumno
   ================================================================ */
function ModalJustificar({ alumno, existente, onClose, onGuardar, onQuitar }) {
  const [tipo, setTipo] = useState(existente?.tipo || "medica");
  const [motivo, setMotivo] = useState(existente?.motivo || "");
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [err, setErr] = useState("");

  const guardar = async () => {
    setGuardando(true); setErr("");
    try { await onGuardar({ alumno_id: alumno.id, tipo, motivo: motivo.trim() }); }
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
          <p className="text-[11px] text-slate-400">
            El motivo solo lo ve control escolar y administración. A los docentes únicamente
            les aparece que el alumno está justificado y el tipo.
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
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [borrando, setBorrando] = useState(null);

  const consultar = useCallback(async () => {
    setCargando(true); setErr("");
    const { data, error } = await supabase.from("asistencias")
      .select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false });
    if (error) setErr(error.message); else setDatos(data || []);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { consultar(); }, [consultar]);

  const totalPadron = alumnos.filter(a => a.activo !== false).length;
  const porDia = [...new Set(datos.map(r => r.fecha))].sort().reverse().map(f => {
    const del = datos.filter(r => r.fecha === f);
    return { fecha: f, presentes: del.length, retardos: del.filter(r => r.estado === "Retardo").length,
      pct: totalPadron ? Math.round(100 * del.length / totalPadron) : 0 };
  });

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
    setDatos(prev => prev.filter(r => r.fecha !== fecha));
    setDetalle(null);
  };

  const exportarRango = () => {
    const filas = [["Fecha", "ID", "Nombre", "Semestre", "Grupo", "Hora", "Estado"]];
    datos.forEach(r => filas.push([r.fecha, r.alumno_id, r.nombre, r.semestre, r.grupo, r.hora, r.estado]));
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `asistencia_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
        <button className={btnSec + " ml-auto"} onClick={exportarRango} disabled={!datos.length}>
          <Download size={13} />Exportar
        </button>
      </Card>

      {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14} />{err}</p>}

      {porDia.length > 1 && (
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Tendencia de asistencia</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={[...porDia].reverse()} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
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
        <h3 className="font-bold text-sm mb-2">Días registrados · {porDia.length}</h3>
        {porDia.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No hay registros en este periodo.</p>}
        {porDia.map(d => (
          <div key={d.fecha}
            className="flex flex-wrap items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 px-2 -mx-2 rounded-lg transition">
            <button onClick={() => setDetalle(d.fecha)} className="flex-1 min-w-[160px] text-left">
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
                  onClick={() => borrarDia(detalle, datos.filter(r => r.fecha === detalle).length)}><Trash2 size={16}/></button>
                <button onClick={() => setDetalle(null)} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
              </div>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {datos.filter(r => r.fecha === detalle).map(r => (
                <div key={r.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${r.estado === "Retardo" ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.nombre}</div>
                    <div className="text-xs text-slate-500">
                  {r.semestre ? `${r.semestre}° ` : ""}{r.grupo || "—"} · ID {r.alumno_id}
                </div>
                  </div>
                  <div className="text-xs font-semibold shrink-0">{(r.hora || "").slice(0, 5)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   PADRÓN DE ALUMNOS
   ================================================================ */
function PanelPadron({ alumnos, recargar }) {
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [modo, setModo] = useState("reemplazar");   // reemplazar | agregar
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
            <input type="radio" className="mt-1" checked={modo === "agregar"} onChange={() => setModo("agregar")} />
            <span>
              <b>Conservarlos</b> — solo agrega y corrige.
              <span className="block text-xs text-slate-500">Úsalo si subes la lista de un solo grupo o generación.</span>
            </span>
          </label>
          <p className="text-[11px] text-slate-400">
            Dar de baja no borra a nadie: el alumno deja de contar para la asistencia, pero su
            historial se conserva y puedes reactivarlo cuando quieras.
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
