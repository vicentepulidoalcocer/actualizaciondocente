import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LayoutDashboard, Upload, BookOpen, Trophy, Award, FileText, Settings,
  GraduationCap, Bell, Search, LogOut, CheckCircle2, XCircle, Clock,
  AlertTriangle, ChevronRight, Users, Target, TrendingUp, FileCheck,
  Download, Filter, Plus, Pencil, Trash2, Eye, Medal, Star, Loader2,
  FolderOpen, User, Activity, ShieldCheck, Menu, X, Megaphone,
  Paperclip, Link2, Archive, Send
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie,
  Cell, LineChart, Line, Legend, CartesianGrid
} from "recharts";

/* ================================================================
   SISTEMA DE SEGUIMIENTO Y DESARROLLO DOCENTE
   Versión web autoalojada: interfaz en GitHub Pages, datos y
   archivos en Supabase, extracción con IA vía función Edge (Gemini).
   ================================================================ */

import { supabase, configurada } from "./lib/supabase";
import {
  cargarTodo, sincronizar, guardarArchivo, leerArchivo, eliminarArchivo,
  extraerConIA, crearDocente, restablecerPassword, cambiarEmailDocente,
  marcarEnterado,
} from "./lib/nube";

const CATEGORIAS = [
  "Formación pedagógica", "Evaluación", "Tecnología educativa",
  "Inteligencia artificial", "Matemáticas", "Ciencias", "Lenguaje",
  "Inclusión educativa", "Habilidades socioemocionales", "Gestión escolar", "Otro"
];

const ESTADOS_CERT = {
  procesando: { label: "Procesando", color: "bg-slate-200 text-slate-700" },
  revision_docente: { label: "Pendiente de revisión del docente", color: "bg-sky-100 text-sky-800" },
  pendiente_validacion: { label: "Pendiente de validación", color: "bg-amber-100 text-amber-800" },
  validada: { label: "Validada", color: "bg-emerald-100 text-emerald-800" },
  rechazada: { label: "Rechazada", color: "bg-rose-100 text-rose-800" },
};

const ESTADOS_GRADO = {
  sin_documento: { label: "Sin documento", color: "bg-slate-200 text-slate-600" },
  cargado: { label: "Documento cargado", color: "bg-sky-100 text-sky-800" },
  pendiente: { label: "Pendiente de validación", color: "bg-amber-100 text-amber-800" },
  validado: { label: "Validado", color: "bg-emerald-100 text-emerald-800" },
  rechazado: { label: "Rechazado", color: "bg-rose-100 text-rose-800" },
};

const NIVELES = ["Licenciatura", "Maestría", "Doctorado"];

/* ---- Avisos y circulares ---- */
const TIPOS_AVISO = ["Circular", "Curso", "Reunión", "Información general", "Actividad", "Importante", "Urgente"];
const PRIORIDADES = ["Normal", "Importante", "Urgente"];
const COLOR_PRIORIDAD = {
  Normal:     { chip: "bg-slate-100 text-slate-600", borde: "border-slate-200", punto: "" },
  Importante: { chip: "bg-amber-100 text-amber-800", borde: "border-amber-300", punto: "🟠" },
  Urgente:    { chip: "bg-rose-100 text-rose-700",   borde: "border-rose-400",  punto: "🔴" },
};
const ESTADO_AVISO = { draft: "Borrador", published: "Publicado", archived: "Archivado" };

const LOGROS_DEF = [
  { clave: "primer_curso", nombre: "Primer curso registrado", icono: "🎓", desc: "Tu primera constancia validada" },
  { clave: "h20", nombre: "20 horas acumuladas", icono: "⏱️", desc: "20 horas de capacitación validadas" },
  { clave: "h50", nombre: "50 horas acumuladas", icono: "🔥", desc: "50 horas de capacitación validadas" },
  { clave: "h100", nombre: "100 horas acumuladas", icono: "💎", desc: "100 horas de capacitación validadas" },
  { clave: "meta", nombre: "Meta anual alcanzada", icono: "🏁", desc: "Alcanzaste tu meta del ciclo" },
  { clave: "top3", nombre: "Top 3 del ranking", icono: "🏆", desc: "Entre los tres primeros lugares" },
];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* Imágenes institucionales (archivos dentro de la carpeta /public) */
const LOGO = import.meta.env.BASE_URL + "logo.png";
const MASCOTA = import.meta.env.BASE_URL + "mascota.png";
const hoy = () => new Date().toISOString().slice(0, 10);
const ahora = () => new Date().toISOString();

const fmtFecha = (f) => {
  if (!f) return "—";
  try {
    const d = new Date(f + (f.length === 10 ? "T12:00:00" : ""));
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  } catch { return f; }
};

/* ---------------- Lógica de negocio ------------------------------ */

const certsDeCiclo = (certs, ciclo) =>
  ciclo === "historico" ? certs : certs.filter(c => c.ciclo === ciclo);

const horasValidadas = (db, docenteId, ciclo) =>
  certsDeCiclo(db.certs, ciclo).filter(c => c.docenteId === docenteId && c.estado === "validada")
    .reduce((s, c) => s + (Number(c.datos.horas) || 0), 0);

const horasPendientes = (db, docenteId, ciclo) =>
  certsDeCiclo(db.certs, ciclo).filter(c => c.docenteId === docenteId &&
    ["pendiente_validacion", "revision_docente", "procesando"].includes(c.estado))
    .reduce((s, c) => s + (Number(c.datos.horas) || 0), 0);

const metaDe = (db, docenteId) =>
  db.config.metasPorDocente[docenteId] ?? db.config.metaAnual;

const semaforoDe = (db, pct) =>
  pct >= db.config.semVerde ? "verde" : pct >= db.config.semAmarillo ? "amarillo" : "rojo";

const SEM_COLORS = { verde: "#2E7D5B", amarillo: "#D9A404", rojo: "#C9463D" };

const rankingDe = (db, ciclo) =>
  db.users.filter(u => u.rol === "docente" && u.activo)
    .map(u => ({ ...u, horas: horasValidadas(db, u.id, ciclo) }))
    .sort((a, b) => b.horas - a.horas);

function detectarDuplicado(db, cert) {
  const norm = (s) => (s || "").toString().toLowerCase().trim();
  return db.certs.find(c => {
    if (c.id === cert.id || c.docenteId !== cert.docenteId || c.estado === "rechazada") return false;
    if (cert.datos.folio && c.datos.folio && norm(c.datos.folio) === norm(cert.datos.folio)) return true;
    let pts = 0;
    if (norm(c.datos.curso) && norm(c.datos.curso) === norm(cert.datos.curso)) pts += 2;
    if (c.datos.fecha_termino && c.datos.fecha_termino === cert.datos.fecha_termino) pts += 1;
    if (Number(c.datos.horas) && Number(c.datos.horas) === Number(cert.datos.horas)) pts += 1;
    return pts >= 3;
  });
}

// Las insignias se ganan dentro de cada ciclo escolar: la clave guardada
// combina el logro y el ciclo (por ejemplo "h20@2025-2026"), de modo que
// un docente vuelve a conquistarlas cada ciclo.
const claveLogro = (clave, ciclo) => `${clave}@${ciclo}`;

function otorgarLogros(db, docenteId, cicloRef) {
  const ciclo = cicloRef || db.config.cicloActual;
  const tiene = (clave) => db.logros.some(l => l.docenteId === docenteId && l.clave === claveLogro(clave, ciclo));
  const dar = (clave) => {
    if (tiene(clave)) return;
    db.logros.push({ id: uid(), docenteId, clave: claveLogro(clave, ciclo), ciclo, fecha: ahora() });
    const def = LOGROS_DEF.find(l => l.clave === clave);
    notificar(db, docenteId, `🏅 Insignia obtenida (ciclo ${ciclo}): ${def.nombre}`);
  };
  const h = horasValidadas(db, docenteId, ciclo);
  const nCursos = db.certs.filter(c => c.docenteId === docenteId && c.estado === "validada" && c.ciclo === ciclo).length;
  if (nCursos >= 1) dar("primer_curso");
  if (h >= 20) dar("h20");
  if (h >= 50) dar("h50");
  if (h >= 100) dar("h100");
  if (h >= metaDe(db, docenteId)) dar("meta");
  const top3 = rankingDe(db, ciclo).slice(0, 3).map(r => r.id);
  if (top3.includes(docenteId) && h > 0) dar("top3");
}

function notificar(db, userId, texto) {
  db.notifs.unshift({ id: uid(), userId, texto, fecha: ahora(), leida: false });
  db.notifs = db.notifs.slice(0, 200);
}

function registrarActividad(db, texto) {
  db.activity.unshift({ id: uid(), texto, fecha: ahora() });
  db.activity = db.activity.slice(0, 100);
}

function completitudExpediente(db, docenteId) {
  const u = db.users.find(x => x.id === docenteId);
  const partes = [];
  partes.push({ nombre: "Perfil personal", ok: !!(u?.area && u?.asignaturas), cuenta: true });
  for (const nivel of NIVELES) {
    const g = db.grados.find(x => x.docenteId === docenteId && x.nivel === nivel);
    // Maestría y doctorado se registran y se muestran, pero no afectan el
    // porcentaje: no todos los docentes cuentan con posgrado.
    partes.push({
      nombre: nivel, ok: g?.estado === "validado",
      opcional: nivel !== "Licenciatura", registrado: !!g,
      cuenta: nivel === "Licenciatura",
    });
  }
  partes.push({ nombre: "Formación complementaria", ok: db.comp.some(x => x.docenteId === docenteId), cuenta: false });
  partes.push({ nombre: "Capacitación", ok: db.certs.some(c => c.docenteId === docenteId && c.estado === "validada"), cuenta: true });
  const evaluadas = partes.filter(p => p.cuenta);
  const pct = Math.round(100 * evaluadas.filter(p => p.ok).length / evaluadas.length);
  return { partes, pct };
}

/* El ciclo escolar corre de agosto a julio: una fecha de agosto en adelante
   pertenece al ciclo que inicia ese año; de enero a julio, al que inició el
   año anterior. */
function cicloDeFecha(fecha) {
  const f = fecha ? new Date(fecha) : new Date();
  const d = isNaN(f) ? new Date() : f;
  const anio = d.getFullYear();
  const inicio = d.getMonth() >= 7 ? anio : anio - 1; // getMonth: 7 = agosto
  return `${inicio}-${inicio + 1}`;
}

// Ciclo al que corresponde una constancia. Manda la FECHA DE EMISIÓN del
// documento; solo si no aparece se recurre a las fechas del curso.
const cicloDeConstancia = (datos = {}) =>
  cicloDeFecha(datos.fecha_emision || datos.fecha_termino || datos.fecha_inicio || null);

// ¿Se pudo determinar el ciclo con una fecha real del documento?
const tieneFechaDeCiclo = (datos = {}) =>
  !!(datos.fecha_emision || datos.fecha_termino || datos.fecha_inicio);

// Ciclos disponibles: los configurados más los que aparezcan en constancias
function ciclosDisponibles(db) {
  const set = new Set(db.config.ciclos || []);
  set.add(cicloDeFecha());
  db.certs.forEach(c => c.ciclo && set.add(c.ciclo));
  return [...set].sort().reverse();
}

/* ---------------- Avisos y circulares ---------------------------- */

// Destinatarios de un aviso: por ahora, todos los docentes activos.
// El campo `destino` queda guardado en cada aviso para poder ampliarlo
// después (una academia, un departamento, un docente en particular)
// sin migrar los avisos ya publicados.
function destinatariosDe(db, aviso) {
  const activos = db.users.filter(u => u.rol === "docente" && u.activo);
  const destino = aviso?.destino || { tipo: "todos" };
  if (destino.tipo === "docentes" && Array.isArray(destino.ids)) {
    return activos.filter(u => destino.ids.includes(u.id));
  }
  if (destino.tipo === "area" && destino.area) {
    return activos.filter(u => u.area === destino.area);
  }
  return activos;
}

const acuseDe = (db, avisoId, usuarioId) =>
  db.acuses.find(a => a.avisoId === avisoId && a.usuarioId === usuarioId);

function seguimientoDe(db, aviso) {
  const total = destinatariosDe(db, aviso);
  const enterados = total.filter(d => acuseDe(db, aviso.id, d.id));
  const pct = total.length ? Math.round(1000 * enterados.length / total.length) / 10 : 0;
  return { total, enterados, pendientes: total.filter(d => !acuseDe(db, aviso.id, d.id)), pct };
}

const avisoVencido = (aviso) =>
  !!aviso.fechaLimite && new Date(aviso.fechaLimite + "T23:59:59") < new Date();

// Avisos que un docente todavía no ha confirmado
const avisosPendientes = (db, user) =>
  db.avisos.filter(a => a.estado === "published"
    && destinatariosDe(db, a).some(d => d.id === user.id)
    && !acuseDe(db, a.id, user.id));

/* ---------------- Utilidades de exportación ---------------------- */

function descargarCSV(nombre, filas) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

function imprimirReporte(titulo, html) {
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>${titulo}</title><style>
    body{font-family:Georgia,serif;padding:32px;color:#1a2340}
    h1{font-size:22px;border-bottom:3px solid #1a2340;padding-bottom:8px}
    table{border-collapse:collapse;width:100%;margin-top:16px;font-size:13px}
    th,td{border:1px solid #cbd2e0;padding:6px 10px;text-align:left}
    th{background:#eef1f7}.pie{margin-top:24px;font-size:11px;color:#667}
  </style></head><body><h1>${titulo}</h1>${html}
  <p class="pie">Departamento de Formación Docente · CBTA No. 291 · Generado el ${new Date().toLocaleString("es-MX")}</p>
  <script>window.print()</script></body></html>`);
  w.document.close();
}

const leerComoBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.split(",")[1]);
  r.onerror = () => rej(new Error("No se pudo leer el archivo"));
  r.readAsDataURL(file);
});

/* ================================================================
   COMPONENTES BASE DE INTERFAZ
   ================================================================ */

const Card = ({ children, className = "", ...resto }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`} {...resto}>{children}</div>
);

const Badge = ({ estado, mapa = ESTADOS_CERT }) => {
  const e = mapa[estado] || { label: estado, color: "bg-slate-200 text-slate-700" };
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${e.color}`}>{e.label}</span>;
};

const Stat = ({ icono: Ic, label, valor, sub, color = "text-slate-900" }) => (
  <Card className="p-4 flex items-start gap-3">
    <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 shrink-0"><Ic size={20} /></div>
    <div className="min-w-0">
      <div className={`text-2xl font-bold leading-tight ${color}`} style={{fontFamily:"'Archivo', sans-serif"}}>{valor}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  </Card>
);

const Progreso = ({ actual, meta, semaforo }) => {
  const pct = meta > 0 ? Math.min(100, Math.round(100 * actual / meta)) : 0;
  const color = SEM_COLORS[semaforo] || "#1a2340";
  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <span className="text-2xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>{actual} <span className="text-sm font-medium text-slate-500">/ {meta} horas</span></span>
        <span className="text-lg font-bold" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: pct + "%", background: color }} />
      </div>
      <p className="text-sm text-slate-600 mt-1.5">
        {actual >= meta ? "🎉 ¡Alcanzaste tu meta de capacitación!" : `Te faltan ${meta - actual} horas para alcanzar tu meta.`}
      </p>
    </div>
  );
};

const Modal = ({ titulo, onClose, children, ancho = "max-w-2xl" }) => (
  <div data-formulario-abierto className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 overflow-y-auto" onClick={onClose}>
    <div className={`bg-white rounded-2xl shadow-xl w-full ${ancho} my-8`} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <h3 className="font-bold text-lg" style={{fontFamily:"'Archivo', sans-serif"}}>{titulo}</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const Campo = ({ label, children, detectado }) => (
  <label className="block">
    <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
      {label}
      {detectado === true && <span className="text-emerald-600 text-[10px] font-bold">● detectado por IA</span>}
      {detectado === false && <span className="text-amber-600 text-[10px] font-bold">○ no detectado — captúralo</span>}
    </span>
    {children}
  </label>
);

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white";
const btnPrim = "inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1a2340] text-white text-sm font-semibold hover:bg-[#2a3660] disabled:opacity-50 transition";
const btnSec = "inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition";

/* ================================================================
   PANTALLA DE ACCESO
   ================================================================ */

function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [entrando, setEntrando] = useState(false);
  const entrar = async (e) => {
    e.preventDefault();
    setErr(""); setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setEntrando(false);
    if (error) {
      setErr(/invalid/i.test(error.message) ? "Correo o contraseña incorrectos." : error.message);
    }
    // Si el acceso es correcto, App detecta la sesión y carga los datos.
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a2340] p-4" style={{fontFamily:"'Inter', sans-serif"}}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={LOGO} alt="CBTA No. 291" className="w-24 h-24 mx-auto mb-3 rounded-full bg-white p-1 shadow-lg" />
          <h1 className="text-white text-2xl font-bold leading-tight" style={{fontFamily:"'Archivo', sans-serif"}}>Departamento de<br />Formación Docente</h1>
          <p className="text-slate-300 text-sm mt-1">Seguimiento de capacitación y expediente académico</p>
        </div>
        <Card className="p-6">
          <form onSubmit={entrar} className="space-y-4">
            <Campo label="Correo institucional">
              <input className={inputCls} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@escuela.mx" required />
            </Campo>
            <Campo label="Contraseña">
              <input className={inputCls} type="password" value={pass} onChange={e => setPass(e.target.value)} required />
            </Campo>
            {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14} />{err}</p>}
            <button className={btnPrim + " w-full justify-center"} disabled={entrando}>
              {entrando && <Loader2 size={15} className="animate-spin" />}Iniciar sesión
            </button>
          </form>
          <p className="mt-4 text-[11px] text-slate-400 leading-snug">
            Las cuentas las crea la administración escolar. Puedes cambiar tu contraseña
            desde “Mi cuenta” una vez que entres. Si la olvidaste, solicita a la
            administración que te asigne una nueva.
          </p>
        </Card>
        <div className="flex items-end justify-center mt-4">
          <img src={MASCOTA} alt="" className="w-28 drop-shadow-xl" />
          <p className="text-slate-200 text-xs mb-6 -ml-2 bg-white/10 rounded-2xl rounded-bl-sm px-3 py-2 leading-snug">
            ¡Bienvenido!<br />CBTA No. 291
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   RAÍZ DE LA APLICACIÓN
   ================================================================ */

export default function App() {
  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [sesion, setSesion] = useState(undefined); // undefined = aún no se sabe; null = sin sesión; string = id del usuario
  const ultimaCarga = useRef(0);
  const cargadaPara = useRef(null); // id de usuario cuyos datos ya están cargados
  const [pagina, setPagina] = useState("dashboard");
  const [paginaCtx, setPaginaCtx] = useState(null); // p.ej. id de docente a abrir
  const [cargando, setCargando] = useState(true);
  const [errCarga, setErrCarga] = useState("");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [verNotifs, setVerNotifs] = useState(false);
  const snapRef = useRef(null); // último estado confirmado en la nube

  useEffect(() => {
    if (!configurada) return;
    supabase.auth.getSession().then(({ data }) => setSesion(data.session?.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      // Solo interesa QUIÉN está conectado, no el token: así una renovación
      // de sesión no vuelve a montar la pantalla ni borra lo que se escribe.
      setSesion(prev => {
        const id = s?.user?.id ?? null;
        return prev === id ? prev : id;
      });
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const recargar = useCallback(async (uid, esPrimeraCarga = false) => {
    const d = await cargarTodo(uid);
    const yo = d.users.find(u => u.id === uid);
    if (!yo || (yo.rol === "docente" && !yo.activo)) {
      await supabase.auth.signOut();
      throw new Error("Esta cuenta está desactivada. Contacta a la administración.");
    }
    snapRef.current = JSON.parse(JSON.stringify(d));
    setDb(d);
    setUser(yo);
    // Al iniciar sesión, el docente aterriza en sus avisos; la
    // administración, en su tablero. En recargas posteriores no se
    // toca la pantalla en la que esté trabajando.
    if (esPrimeraCarga && yo.rol === "docente") setPagina("avisos");
  }, []);

  useEffect(() => {
    if (!configurada || sesion === undefined) return;
    if (!sesion) {
      cargadaPara.current = null;
      setUser(null); setDb(null); snapRef.current = null; setCargando(false);
      return;
    }
    // Si los datos de este mismo usuario ya están en pantalla, no se
    // vuelve a cargar: evita reinicios al renovarse la sesión.
    if (cargadaPara.current === sesion) return;
    cargadaPara.current = sesion;
    setCargando(true); setErrCarga("");
    recargar(sesion, true)
      .catch(e => { cargadaPara.current = null; setErrCarga(e.message); })
      .finally(() => { setCargando(false); ultimaCarga.current = Date.now(); });
  }, [sesion, recargar]);

  // Refresca datos al volver a la pestaña, para ver los cambios de otros
  // usuarios. Nunca muestra la pantalla de carga ni desmonta nada: los
  // formularios abiertos conservan lo que se haya escrito. Además se
  // omite si hay un formulario en pantalla o si se recargó hace poco.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible" || !sesion) return;
      if (document.querySelector("[data-formulario-abierto]")) return;
      if (Date.now() - ultimaCarga.current < 15000) return;
      ultimaCarga.current = Date.now();
      recargar(sesion).catch(() => {});
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [sesion, recargar]);

  // Mutación central: aplica cambios en memoria y sincroniza solo las
  // diferencias con Supabase (altas, cambios y bajas por tabla).
  const mutar = useCallback(async (fn) => {
    const nuevo = JSON.parse(JSON.stringify(db));
    await fn(nuevo);
    setDb(nuevo);
    try {
      await sincronizar(snapRef.current, nuevo);
      snapRef.current = JSON.parse(JSON.stringify(nuevo));
    } catch (e) {
      console.error("Error guardando", e);
      alert("No se pudieron guardar los cambios: " + e.message);
    }
    return nuevo;
  }, [db]);

  if (!configurada) return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a2340] text-white p-6">
      <div className="max-w-md text-sm leading-relaxed bg-white/10 rounded-2xl p-6">
        <b>Falta configurar la conexión.</b><br />
        Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> como
        secretos del repositorio (o en un archivo <code>.env</code> local) y vuelve a publicar.
        Consulta el README del proyecto.
      </div>
    </div>
  );

  if (!db && (cargando || sesion === undefined)) return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a2340] text-white gap-3">
      <Loader2 className="animate-spin" /> Cargando sistema…
    </div>
  );

  if (!user) return (
    <>
      <Login />
      {errCarga && (
        <div className="fixed bottom-4 inset-x-0 flex justify-center px-4">
          <p className="bg-rose-600 text-white text-sm rounded-xl px-4 py-2 shadow-lg">{errCarga}</p>
        </div>
      )}
    </>
  );

  const esAdmin = user.rol === "admin";
  const misNotifs = db.notifs.filter(n => n.userId === user.id);
  const noLeidas = misNotifs.filter(n => !n.leida).length;

  const nav = esAdmin ? [
    { id: "dashboard", label: "Dashboard", icono: LayoutDashboard },
    { id: "validaciones", label: "Validaciones", icono: FileCheck, badge: db.certs.filter(c => c.estado === "pendiente_validacion").length + db.grados.filter(g => g.estado === "pendiente").length + db.comp.filter(x => x.estado === "pendiente").length },
    { id: "docentes", label: "Docentes", icono: Users },
    { id: "avisos", label: "Avisos y Circulares", icono: Megaphone },
    { id: "ranking", label: "Ranking", icono: Trophy },
    { id: "reportes", label: "Reportes", icono: FileText },
    { id: "perfil_inst", label: "Perfil académico institucional", icono: GraduationCap },
    { id: "actividad", label: "Actividad reciente", icono: Activity },
    { id: "respaldo", label: "Respaldo", icono: Download },
    { id: "admin", label: "Administración", icono: Settings },
  ] : [
    { id: "avisos", label: "Avisos", icono: Megaphone, badge: avisosPendientes(db, user).length },
    { id: "dashboard", label: "Dashboard", icono: LayoutDashboard },
    { id: "subir", label: "Subir constancia", icono: Upload },
    { id: "cursos", label: "Mis cursos", icono: BookOpen },
    { id: "expediente", label: "Mi perfil académico", icono: GraduationCap },
    ...(db.config.rankingPublico ? [{ id: "ranking", label: "Ranking", icono: Trophy }] : []),
    { id: "logros", label: "Logros", icono: Award },
    { id: "cuenta", label: "Mi cuenta", icono: User },
  ];

  const irA = (p, ctx = null) => { setPagina(p); setPaginaCtx(ctx); setMenuAbierto(false); setBusqueda(""); };

  const marcarLeidas = () => mutar(d => { d.notifs.forEach(n => { if (n.userId === user.id) n.leida = true; }); });

  return (
    <div className="min-h-screen bg-[#f2f4f8]" style={{fontFamily:"'Inter', sans-serif"}}>
      {cargando && (
        <div className="fixed top-2 right-3 z-[60] text-[11px] text-slate-500 bg-white/90 border border-slate-200 rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
          <Loader2 size={11} className="animate-spin" /> Actualizando…
        </div>
      )}
      {/* Barra superior */}
      <header className="sticky top-0 z-40 bg-[#1a2340] text-white">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button className="lg:hidden p-1.5 rounded-lg hover:bg-white/10" onClick={() => setMenuAbierto(v => !v)}><Menu size={20} /></button>
          <div className="flex items-center gap-2 font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>
            <img src={LOGO} alt="CBTA 291" className="w-9 h-9 rounded-full bg-white p-0.5" />
            <span className="hidden sm:inline leading-tight text-[13px]">Departamento de<br />Formación Docente</span>
          </div>
          <div className="flex-1 max-w-md mx-auto relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder={esAdmin ? "Buscar docente, curso, institución…" : "Buscar en mis cursos…"}
              className="w-full rounded-xl bg-white/10 border border-white/15 pl-9 pr-3 py-1.5 text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white/15" />
            {busqueda.trim() && <Buscador db={db} user={user} q={busqueda} irA={irA} cerrar={() => setBusqueda("")} />}
          </div>
          <button className="relative p-2 rounded-lg hover:bg-white/10" onClick={() => { setVerNotifs(v => !v); if (!verNotifs) marcarLeidas(); }}>
            <Bell size={19} />
            {noLeidas > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E8871E] text-[10px] font-bold flex items-center justify-center">{noLeidas}</span>}
          </button>
          <div className="hidden md:block text-right leading-tight">
            <div className="text-sm font-semibold">{user.nombre}</div>
            <div className="text-[11px] text-slate-300">{esAdmin ? "Administrador" : user.area || "Docente"}</div>
          </div>
          <button className="p-2 rounded-lg hover:bg-white/10" title="Cerrar sesión" onClick={() => supabase.auth.signOut()}><LogOut size={18} /></button>
        </div>
        {verNotifs && (
          <div className="absolute right-4 top-14 w-80 max-h-96 overflow-y-auto bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200 z-50">
            <div className="px-4 py-2.5 font-bold text-sm border-b border-slate-100">Notificaciones</div>
            {misNotifs.length === 0 && <p className="p-4 text-sm text-slate-500">Sin notificaciones por ahora.</p>}
            {misNotifs.slice(0, 30).map(n => (
              <div key={n.id} className="px-4 py-2.5 border-b border-slate-50 text-sm">
                <p>{n.texto}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{new Date(n.fecha).toLocaleString("es-MX")}</p>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="flex">
        {/* Navegación lateral */}
        <aside className={`${menuAbierto ? "block" : "hidden"} lg:block w-60 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-52px)] fixed lg:static z-30`}>
          <nav className="p-3 space-y-1">
            {nav.map(item => (
              <button key={item.id} onClick={() => irA(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition ${pagina === item.id ? "bg-[#1a2340] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                <item.icono size={17} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-[#E8871E] text-white text-[11px] font-bold flex items-center justify-center">{item.badge}</span>}
              </button>
            ))}
          </nav>
        </aside>

        {/* Contenido */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl mx-auto w-full">
          {pagina === "dashboard" && (esAdmin
            ? <DashboardAdmin db={db} irA={irA} />
            : <DashboardDocente db={db} user={user} irA={irA} />)}
          {pagina === "subir" && <SubirConstancia db={db} user={user} mutar={mutar} irA={irA} />}
          {pagina === "cursos" && <MisCursos db={db} user={user} mutar={mutar} />}
          {pagina === "expediente" && <PerfilAcademico db={db} user={user} docenteId={user.id} mutar={mutar} editable />}
          {pagina === "ranking" && <Ranking db={db} user={user} />}
          {pagina === "logros" && <Logros db={db} user={user} />}
          {pagina === "cuenta" && <MiCuenta user={user} />}
          {pagina === "avisos" && (esAdmin
            ? <Avisos db={db} user={user} mutar={mutar} />
            : <MisAvisos db={db} user={user} recargar={() => recargar(user.id)} />)}
          {pagina === "validaciones" && esAdmin && <Validaciones db={db} user={user} mutar={mutar} />}
          {pagina === "docentes" && esAdmin && <Docentes db={db} mutar={mutar} irA={irA} />}
          {pagina === "expediente_docente" && esAdmin && <ExpedienteIntegral db={db} docenteId={paginaCtx} mutar={mutar} user={user} volver={() => irA("docentes")} />}
          {pagina === "reportes" && esAdmin && <Reportes db={db} />}
          {pagina === "perfil_inst" && esAdmin && <PerfilInstitucional db={db} />}
          {pagina === "actividad" && esAdmin && <ActividadReciente db={db} />}
          {pagina === "respaldo" && esAdmin && <Respaldo db={db} user={user} />}
          {pagina === "admin" && esAdmin && <Administracion db={db} user={user} mutar={mutar} />}
        </main>
      </div>
    </div>
  );
}

/* ---------------- Buscador global -------------------------------- */
function Buscador({ db, user, q, irA, cerrar }) {
  const esAdmin = user.rol === "admin";
  const t = q.toLowerCase();
  const certs = db.certs.filter(c =>
    (esAdmin || c.docenteId === user.id) &&
    [c.datos.curso, c.datos.institucion, c.datos.folio, c.datos.categoria].some(v => (v || "").toLowerCase().includes(t))
  ).slice(0, 6);
  const docentes = esAdmin ? db.users.filter(u => u.rol === "docente" &&
    (u.nombre.toLowerCase().includes(t) || (u.area || "").toLowerCase().includes(t))).slice(0, 5) : [];
  const avisos = db.avisos.filter(a =>
    (esAdmin || a.estado !== "draft") &&
    [a.titulo, a.tipo, a.descripcion].some(v => (v || "").toLowerCase().includes(t))
  ).slice(0, 5);
  return (
    <div className="absolute left-0 right-0 top-10 bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
      {docentes.length > 0 && <div className="px-3 pt-2 text-[11px] font-bold text-slate-400 uppercase">Docentes</div>}
      {docentes.map(d => (
        <button key={d.id} onClick={() => { irA("expediente_docente", d.id); cerrar(); }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
          <User size={14} className="text-slate-400" />{d.nombre} <span className="text-xs text-slate-400">· {d.area}</span>
        </button>
      ))}
      {certs.length > 0 && <div className="px-3 pt-2 text-[11px] font-bold text-slate-400 uppercase">Constancias</div>}
      {certs.map(c => (
        <button key={c.id} onClick={() => { irA(esAdmin ? "validaciones" : "cursos"); cerrar(); }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
          {c.datos.curso || "(sin título)"} <span className="text-xs text-slate-400">· {c.datos.institucion || "—"}</span>
        </button>
      ))}
      {avisos.length > 0 && <div className="px-3 pt-2 text-[11px] font-bold text-slate-400 uppercase">Avisos</div>}
      {avisos.map(a => (
        <button key={a.id} onClick={() => { irA("avisos"); cerrar(); }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2">
          <Megaphone size={14} className="text-slate-400" />{a.titulo} <span className="text-xs text-slate-400">· {a.tipo}</span>
        </button>
      ))}
      {docentes.length === 0 && certs.length === 0 && avisos.length === 0 && <p className="px-3 py-3 text-sm text-slate-500">Sin resultados para “{q}”.</p>}
    </div>
  );
}

/* ================================================================
   DASHBOARD DEL ADMINISTRADOR
   ================================================================ */

const PIE_COLORS = ["#1a2340", "#E8871E", "#2E7D5B", "#D9A404", "#C9463D", "#5B6EE8", "#8B5CA8", "#3A9BB5", "#B5703A", "#6b7280", "#94a3b8"];

function usarFiltros(db) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const [categoria, setCategoria] = useState("todas");
  const [docente, setDocente] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const certs = db.certs.filter(c =>
    (ciclo === "historico" || c.ciclo === ciclo) &&
    (categoria === "todas" || c.datos.categoria === categoria) &&
    (docente === "todos" || c.docenteId === docente) &&
    (estado === "todos" || c.estado === estado)
  );
  const UI = (
    <div className="flex flex-wrap gap-2 items-center">
      <Filter size={15} className="text-slate-400" />
      <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
        {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
        <option value="historico">Histórico</option>
      </select>
      <select className={inputCls + " !mt-0 !w-auto"} value={categoria} onChange={e => setCategoria(e.target.value)}>
        <option value="todas">Todas las categorías</option>
        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
      </select>
      <select className={inputCls + " !mt-0 !w-auto"} value={docente} onChange={e => setDocente(e.target.value)}>
        <option value="todos">Todos los docentes</option>
        {db.users.filter(u => u.rol === "docente").map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
      <select className={inputCls + " !mt-0 !w-auto"} value={estado} onChange={e => setEstado(e.target.value)}>
        <option value="todos">Todos los estados</option>
        {Object.entries(ESTADOS_CERT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
  );
  return { certs, ciclo, UI };
}

function DashboardAdmin({ db, irA }) {
  const { certs, ciclo, UI } = usarFiltros(db);
  const docentes = db.users.filter(u => u.rol === "docente" && u.activo);
  const validadas = certs.filter(c => c.estado === "validada");
  const horasTot = validadas.reduce((s, c) => s + (Number(c.datos.horas) || 0), 0);
  const pendientes = db.certs.filter(c => c.estado === "pendiente_validacion").length;
  const cumplieron = docentes.filter(d => horasValidadas(db, d.id, ciclo) >= metaDe(db, d.id)).length;

  const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const porMes = MESES.map((m, i) => ({ mes: m, horas: validadas.filter(c => c.datos.fecha_termino && new Date(c.datos.fecha_termino + "T12:00").getMonth() === i).reduce((s, c) => s + (Number(c.datos.horas) || 0), 0) }));
  const porDocente = docentes.map(d => ({ nombre: d.nombre.split(" ")[0] + " " + (d.nombre.split(" ")[1]?.[0] || "") + ".", horas: certs.filter(c => c.docenteId === d.id && c.estado === "validada").reduce((s, c) => s + (Number(c.datos.horas) || 0), 0) })).sort((a, b) => b.horas - a.horas);
  const porCat = CATEGORIAS.map(cat => ({ name: cat, value: validadas.filter(c => c.datos.categoria === cat).length })).filter(x => x.value > 0);
  const cumpl = [
    { name: "Meta alcanzada", value: docentes.filter(d => { const p = 100 * horasValidadas(db, d.id, ciclo) / metaDe(db, d.id); return p >= db.config.semVerde; }).length, color: SEM_COLORS.verde },
    { name: "En proceso", value: docentes.filter(d => { const p = 100 * horasValidadas(db, d.id, ciclo) / metaDe(db, d.id); return p >= db.config.semAmarillo && p < db.config.semVerde; }).length, color: SEM_COLORS.amarillo },
    { name: "Bajo cumplimiento", value: docentes.filter(d => { const p = 100 * horasValidadas(db, d.id, ciclo) / metaDe(db, d.id); return p < db.config.semAmarillo; }).length, color: SEM_COLORS.rojo },
  ].filter(x => x.value > 0);
  const porCiclo = {};
  db.certs.filter(c => c.estado === "validada" && c.ciclo).forEach(c => {
    porCiclo[c.ciclo] = (porCiclo[c.ciclo] || 0) + (Number(c.datos.horas) || 0);
  });
  const evolucion = Object.entries(porCiclo).sort().map(([anio, horas]) => ({ anio, horas }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Panorama institucional</h2>
        {UI}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat icono={Users} label="Docentes activos" valor={docentes.length} />
        <Stat icono={BookOpen} label="Cursos registrados" valor={certs.length} />
        <Stat icono={Clock} label="Horas validadas" valor={horasTot} />
        <Stat icono={TrendingUp} label="Promedio por docente" valor={docentes.length ? (horasTot / docentes.length).toFixed(1) : 0} />
        <Stat icono={FileCheck} label="Constancias pendientes" valor={pendientes} color={pendientes > 0 ? "text-amber-600" : "text-slate-900"} />
        <Stat icono={Target} label="Alcanzaron la meta" valor={docentes.length ? Math.round(100 * cumplieron / docentes.length) + "%" : "—"} sub={`${cumplieron} de ${docentes.length}`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Horas de capacitación por mes</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porMes}><CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="horas" fill="#1a2340" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Horas por docente</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porDocente}><CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
              <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-25} height={50} textAnchor="end" /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="horas" fill="#E8871E" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Cursos por categoría</h3>
          {porCat.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">Aún no hay cursos validados con estos filtros.</p> :
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={porCat} dataKey="value" nameKey="name" outerRadius={80} label={{ fontSize: 10 }}>
              {porCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie>
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>}
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Docentes según cumplimiento de meta</h3>
          {cumpl.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">Sin docentes registrados.</p> :
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={cumpl} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} label>
              {cumpl.map((x, i) => <Cell key={i} fill={x.color} />)}</Pie>
              <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ResponsiveContainer>}
        </Card>
        <Card className="p-4 lg:col-span-2">
          <h3 className="font-bold text-sm mb-3">Evolución de horas de capacitación por ciclo escolar (histórico)</h3>
          {evolucion.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">Aún no hay historial.</p> :
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={evolucion}><CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
              <XAxis dataKey="anio" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
              <Line type="monotone" dataKey="horas" stroke="#1a2340" strokeWidth={2.5} dot={{ fill: "#E8871E", r: 4 }} /></LineChart>
          </ResponsiveContainer>}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm">Actividad reciente</h3>
            <button className="text-xs text-indigo-600 font-semibold" onClick={() => irA("actividad")}>Ver todo</button>
          </div>
          {db.activity.slice(0, 6).map(a => (
            <div key={a.id} className="py-2 border-b border-slate-100 last:border-0 text-sm text-slate-700">
              {a.texto}<span className="block text-[11px] text-slate-400">{new Date(a.fecha).toLocaleString("es-MX")}</span>
            </div>
          ))}
          {db.activity.length === 0 && <p className="text-sm text-slate-400 py-4">La actividad de la escuela aparecerá aquí.</p>}
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-2">Semáforo de docentes · ciclo {ciclo === "historico" ? "histórico" : ciclo}</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {docentes.map(d => {
              const h = horasValidadas(db, d.id, ciclo); const m = metaDe(db, d.id);
              const pct = m ? Math.round(100 * h / m) : 0; const sem = semaforoDe(db, pct);
              return (
                <button key={d.id} onClick={() => irA("expediente_docente", d.id)} className="w-full flex items-center gap-2 text-sm py-1 hover:bg-slate-50 rounded-lg px-1">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SEM_COLORS[sem] }} />
                  <span className="flex-1 text-left truncate">{d.nombre}</span>
                  <span className="text-xs font-semibold text-slate-500">{h}/{m} h · {pct}%</span>
                  <ChevronRight size={14} className="text-slate-300" />
                </button>
              );
            })}
            {docentes.length === 0 && <p className="text-sm text-slate-400 py-2">Agrega docentes en la sección Docentes.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================
   DASHBOARD DEL DOCENTE
   ================================================================ */

function DashboardDocente({ db, user, irA }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const h = horasValidadas(db, user.id, ciclo);
  const hp = horasPendientes(db, user.id, ciclo);
  const meta = metaDe(db, user.id);
  const pct = meta ? Math.round(100 * h / meta) : 0;
  const sem = semaforoDe(db, pct);
  const rank = rankingDe(db, ciclo);
  const pos = rank.findIndex(r => r.id === user.id) + 1;
  const misCerts = db.certs.filter(c => c.docenteId === user.id);
  const validados = misCerts.filter(c => c.estado === "validada");
  const pendCount = misCerts.filter(c => ["pendiente_validacion", "revision_docente"].includes(c.estado)).length;
  const exp = completitudExpediente(db, user.id);
  const misLogros = db.logros.filter(l => l.docenteId === user.id && l.clave.endsWith("@" + ciclo));
  const pendAvisos = avisosPendientes(db, user);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={MASCOTA} alt="" className="w-14 h-14 object-contain object-top hidden sm:block" />
          <div>
            <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Hola, {user.nombre.split(" ")[0]}</h2>
            <p className="text-sm text-slate-500">{user.area || "Docente"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
            {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          </select>
          <button className={btnPrim} onClick={() => irA("subir")}><Upload size={15} /> Subir constancia</button>
        </div>
      </div>

      {pendAvisos.length > 0 && (
        <button onClick={() => irA("avisos")}
          className={`w-full text-left p-3 rounded-2xl border flex items-center gap-3 transition ${
            pendAvisos.some(a => a.prioridad === "Urgente")
              ? "bg-rose-50 border-rose-200 hover:bg-rose-100"
              : "bg-amber-50 border-amber-200 hover:bg-amber-100"}`}>
          <Megaphone className={pendAvisos.some(a => a.prioridad === "Urgente") ? "text-rose-600 shrink-0" : "text-amber-600 shrink-0"} size={20} />
          <div className="flex-1 text-sm">
            <b>{pendAvisos.length} aviso{pendAvisos.length > 1 ? "s" : ""} pendiente{pendAvisos.length > 1 ? "s" : ""} de enterado.</b>{" "}
            Consulta los comunicados y confirma que los leíste.
          </div>
          <ChevronRight size={16} className="text-slate-400" />
        </button>
      )}

      {exp.pct < 100 && (
        <button onClick={() => irA("expediente")} className="w-full text-left p-3 rounded-2xl bg-sky-50 border border-sky-200 flex items-center gap-3 hover:bg-sky-100 transition">
          <GraduationCap className="text-sky-600 shrink-0" size={20} />
          <div className="flex-1 text-sm text-sky-900">
            <b>Perfil académico completado al {exp.pct}%.</b> Completa tu expediente para que la escuela conozca tu formación.
          </div>
          <ChevronRight size={16} className="text-sky-400" />
        </button>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="p-5 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Target size={16} /> Mi meta del ciclo</h3>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: SEM_COLORS[sem] + "22", color: SEM_COLORS[sem] }}>
              {sem === "verde" ? "Meta alcanzada" : sem === "amarillo" ? "En proceso" : "Bajo cumplimiento"}
            </span>
          </div>
          <Progreso actual={h} meta={meta} semaforo={sem} />
        </Card>
        <Card className="p-5 flex flex-col items-center justify-center text-center bg-gradient-to-b from-[#1a2340] to-[#2a3660] text-white">
          <Trophy className="text-[#E8871E] mb-1" size={26} />
          <div className="text-3xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>{pos > 0 && h > 0 ? `#${pos}` : "—"}</div>
          <div className="text-xs text-slate-300">Posición en el ranking{db.config.rankingPublico ? "" : " (privado)"}</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icono={BookOpen} label="Cursos validados" valor={validados.filter(c => c.ciclo === ciclo).length} sub={`${validados.length} en total`} />
        <Stat icono={Clock} label="Horas acumuladas" valor={h} sub="este ciclo" />
        <Stat icono={FileCheck} label="Horas pendientes" valor={hp} sub={`${pendCount} constancia(s)`} color={hp > 0 ? "text-amber-600" : "text-slate-900"} />
        <Stat icono={Award} label="Insignias del ciclo" valor={misLogros.length} sub={`de ${LOGROS_DEF.length} posibles`} />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">Historial de cursos</h3>
          <button className="text-xs text-indigo-600 font-semibold" onClick={() => irA("cursos")}>Ver todos</button>
        </div>
        <TablaCursos certs={misCerts.slice().sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || "")).slice(0, 5)} db={db} />
      </Card>
    </div>
  );
}

function TablaCursos({ certs, db, acciones }) {
  if (certs.length === 0) return <p className="text-sm text-slate-400 py-6 text-center">Todavía no hay constancias aquí. Sube tu primera constancia para comenzar.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-200">
          <th className="py-2 pr-3">Curso</th><th className="py-2 pr-3 hidden md:table-cell">Institución</th>
          <th className="py-2 pr-3">Horas</th><th className="py-2 pr-3 hidden lg:table-cell">Categoría</th>
          <th className="py-2 pr-3 hidden md:table-cell">Término</th>
          <th className="py-2 pr-3 hidden sm:table-cell">Ciclo</th><th className="py-2 pr-3">Estado</th>
          {acciones && <th className="py-2"></th>}
        </tr></thead>
        <tbody>
          {certs.map(c => (
            <tr key={c.id} className="border-b border-slate-100 last:border-0">
              <td className="py-2.5 pr-3 font-medium max-w-[220px]">
                <div className="truncate">{c.datos.curso || <span className="text-slate-400 italic">Sin título detectado</span>}</div>
                {c.dupFlag && <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1"><AlertTriangle size={11}/>Posible constancia duplicada</span>}
              </td>
              <td className="py-2.5 pr-3 hidden md:table-cell text-slate-500 max-w-[180px] truncate">{c.datos.institucion || "—"}</td>
              <td className="py-2.5 pr-3 font-semibold">{c.datos.horas ?? "—"}</td>
              <td className="py-2.5 pr-3 hidden lg:table-cell text-slate-500">{c.datos.categoria || "—"}</td>
              <td className="py-2.5 pr-3 hidden md:table-cell text-slate-500">{fmtFecha(c.datos.fecha_termino)}</td>
              <td className="py-2.5 pr-3 hidden sm:table-cell text-slate-500 whitespace-nowrap">
                {c.ciclo || "—"}
                {!tieneFechaDeCiclo(c.datos) && (
                  <span title="Sin fecha de emisión registrada: captúrala para archivar la constancia en el ciclo correcto."
                    className="ml-1 text-amber-500">⚠</span>
                )}
              </td>
              <td className="py-2.5 pr-3"><Badge estado={c.estado} />
                {c.estado === "rechazada" && c.motivoRechazo && <div className="text-[11px] text-rose-600 mt-0.5 max-w-[180px]">Motivo: {c.motivoRechazo}</div>}
              </td>
              {acciones && <td className="py-2.5">{acciones(c)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   CARGA DE CONSTANCIAS · flujo con IA
   ================================================================ */

const camposConstancia = [
  ["curso", "Nombre del curso", "text"],
  ["institucion", "Institución que lo impartió", "text"],
  ["fecha_inicio", "Fecha de inicio", "date"],
  ["fecha_termino", "Fecha de término", "date"],
  ["horas", "Duración en horas", "number"],
  ["modalidad", "Modalidad", "text"],
  ["folio", "Folio de la constancia", "text"],
  ["fecha_emision", "Fecha de emisión", "date"],
];

function FormularioConstancia({ cert, onChange }) {
  const d = cert.datos;
  const set = (k, v) => onChange({ ...cert, datos: { ...d, [k]: v === "" ? null : v } });
  const detectado = (k) => cert.detectados ? cert.detectados.includes(k) : undefined;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {camposConstancia.map(([k, label, tipo]) => (
        <Campo key={k} label={label} detectado={detectado(k)}>
          <input className={inputCls} type={tipo} value={d[k] ?? ""} onChange={e => set(k, tipo === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
        </Campo>
      ))}
      <Campo label="Categoría o área de capacitación" detectado={detectado("categoria")}>
        <select className={inputCls} value={d.categoria ?? ""} onChange={e => set("categoria", e.target.value)}>
          <option value="">— Selecciona —</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
      </Campo>
      <Campo label="Otros datos detectados">
        <input className={inputCls} value={d.otros ?? ""} onChange={e => set("otros", e.target.value)} />
      </Campo>
    </div>
  );
}

function SubirConstancia({ db, user, mutar, irA }) {
  const [fase, setFase] = useState("elegir"); // elegir | subiendo | ia | revisar | enviado | error
  const [progreso, setProgreso] = useState(0);
  const [cert, setCert] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [avisoArchivo, setAvisoArchivo] = useState("");
  const inputRef = useRef();
  const exp = completitudExpediente(db, user.id);
  const bloqueado = db.config.perfilObligatorio && exp.pct < 100;

  const procesar = async (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") { setErrMsg("Solo se aceptan archivos PDF para constancias."); setFase("error"); return; }
    setFase("subiendo"); setProgreso(10); setErrMsg(""); setAvisoArchivo("");
    try {
      const base64 = await leerComoBase64(file);
      setProgreso(35);
      const id = uid();
      const guardado = await guardarArchivo(id, base64, file.type, file.name);
      if (!guardado.guardado) setAvisoArchivo("El PDF supera el límite de almacenamiento; se registrarán los datos pero el archivo no quedará guardado. Conserva tu original.");
      setProgreso(55); setFase("ia");
      let datos = {}, detectados = [], fallo = false;
      try {
        datos = await extraerConIA({ base64, mime: "application/pdf", tipo: "constancia" });
        detectados = Object.entries(datos).filter(([k, v]) => v !== null && v !== "" && k !== "docente").map(([k]) => k);
      } catch (e) { fallo = true; }
      setProgreso(90);
      const nuevo = {
        id, docenteId: user.id, ciclo: cicloDeConstancia(datos),
        archivoNombre: file.name, archivoGuardado: guardado.guardado,
        estado: "revision_docente",
        datos: {
          curso: datos.curso ?? null, institucion: datos.institucion ?? null,
          fecha_inicio: datos.fecha_inicio ?? null, fecha_termino: datos.fecha_termino ?? null,
          horas: datos.horas ?? null, modalidad: datos.modalidad ?? null,
          categoria: CATEGORIAS.includes(datos.categoria) ? datos.categoria : (datos.categoria ? "Otro" : null),
          folio: datos.folio ?? null, fecha_emision: datos.fecha_emision ?? null, otros: datos.otros ?? null,
        },
        detectados, iaFallo: fallo, creadoEn: ahora(),
        historial: [{ fecha: ahora(), accion: "Constancia cargada" + (fallo ? " (la IA no pudo procesarla; captura manual)" : " y procesada con IA"), por: user.nombre }],
      };
      setCert(nuevo); setProgreso(100); setFase("revisar");
    } catch (e) {
      setErrMsg("Ocurrió un problema al procesar el archivo: " + e.message); setFase("error");
    }
  };

  const enviarValidacion = async () => {
    if (!cert.datos.curso || !cert.datos.horas) {
      setErrMsg("Antes de enviar, captura al menos el nombre del curso y las horas."); return;
    }
    await mutar(d => {
      const dup = detectarDuplicado(d, cert);
      const c = { ...cert, estado: "pendiente_validacion", dupFlag: !!dup };
      c.historial.push({ fecha: ahora(), accion: "Enviada a validación por el docente" + (dup ? " · marcada como posible duplicado" : ""), por: user.nombre });
      d.certs.unshift(c);
      registrarActividad(d, `${user.nombre} subió una nueva constancia: “${c.datos.curso}”.`);
      d.users.filter(u => u.rol === "admin").forEach(a =>
        notificar(d, a.id, `📄 ${user.nombre} envió la constancia “${c.datos.curso}” a validación.${dup ? " ⚠️ Posible duplicado." : ""}`));
    });
    setFase("enviado");
  };

  const noDetectados = cert ? camposConstancia.map(([k]) => k).concat(["categoria"]).filter(k => !(cert.detectados || []).includes(k)) : [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Subir constancia</h2>
      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 flex-wrap">
        {["Subir", "Extraer con IA", "Revisar", "Enviar a validación"].map((p, i) => (
          <React.Fragment key={p}>
            {i > 0 && <ChevronRight size={12} />}
            <span className={["elegir","subiendo"].includes(fase) && i === 0 || fase === "ia" && i === 1 || fase === "revisar" && i === 2 || fase === "enviado" && i === 3 ? "text-[#E8871E]" : ""}>{p}</span>
          </React.Fragment>
        ))}
      </div>

      {bloqueado && (
        <Card className="p-4 border-amber-300 bg-amber-50 text-sm text-amber-900 flex gap-2">
          <AlertTriangle size={18} className="shrink-0" />
          <span>La administración activó el <b>perfil obligatorio</b>: completa tu perfil académico ({exp.pct}%) antes de registrar capacitaciones. Ve a <b>Mi perfil académico</b>.</span>
        </Card>
      )}

      {fase === "elegir" && !bloqueado && (
        <Card className="p-8 text-center border-2 border-dashed border-slate-300 hover:border-[#E8871E] transition cursor-pointer" >
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={e => procesar(e.target.files[0])} />
          <div onClick={() => inputRef.current.click()}>
            <Upload size={36} className="mx-auto text-slate-300 mb-3" />
            <p className="font-semibold">Selecciona el PDF de tu constancia</p>
            <p className="text-sm text-slate-500 mt-1">El sistema leerá el documento con IA y te mostrará los datos detectados para que los revises.</p>
            <button className={btnPrim + " mt-4"}>Elegir archivo PDF</button>
          </div>
        </Card>
      )}

      {(fase === "subiendo" || fase === "ia") && (
        <Card className="p-8 text-center">
          <Loader2 size={32} className="mx-auto animate-spin text-[#E8871E] mb-3" />
          <p className="font-semibold">{fase === "subiendo" ? "Guardando tu archivo…" : "La IA está leyendo tu constancia…"}</p>
          <div className="h-2 rounded-full bg-slate-200 mt-4 max-w-xs mx-auto overflow-hidden">
            <div className="h-full bg-[#E8871E] rounded-full transition-all duration-500" style={{ width: progreso + "%" }} />
          </div>
        </Card>
      )}

      {fase === "revisar" && cert && (
        <Card className="p-5 space-y-4" data-formulario-abierto>
          <div className="flex items-center gap-2 text-sm">
            <FileText size={16} className="text-slate-400" />
            <span className="font-medium">{cert.archivoNombre}</span>
            <Badge estado="revision_docente" />
          </div>
          {avisoArchivo && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">{avisoArchivo}</p>}
          {cert.iaFallo
            ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2.5">La IA no pudo extraer información de este documento. Captura los datos manualmente.</p>
            : <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                La IA detectó <b>{(cert.detectados || []).length}</b> campo(s). {noDetectados.length > 0 && <>No pudo detectar: <b>{noDetectados.length}</b> campo(s) (marcados en ámbar). La IA nunca inventa datos: revisa y completa lo que falte.</>}
              </p>}
          <FormularioConstancia cert={cert} onChange={setCert} />
          {errMsg && <p className="text-sm text-rose-600">{errMsg}</p>}
          <div className="flex flex-wrap gap-2 justify-end">
            <button className={btnSec} onClick={() => { setCert(null); setFase("elegir"); }}>Descartar</button>
            <button className={btnPrim} onClick={enviarValidacion}><CheckCircle2 size={15} /> Enviar a validación</button>
          </div>
        </Card>
      )}

      {fase === "enviado" && (
        <Card className="p-8 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-600 mb-3" />
          <p className="font-bold text-lg">Constancia enviada a validación</p>
          <p className="text-sm text-slate-500 mt-1">Las horas se sumarán a tu historial cuando la administración la valide. Puedes seguir su estado en “Mis cursos”.</p>
          <div className="flex gap-2 justify-center mt-4">
            <button className={btnSec} onClick={() => { setCert(null); setFase("elegir"); }}>Subir otra</button>
            <button className={btnPrim} onClick={() => irA("cursos")}>Ir a mis cursos</button>
          </div>
        </Card>
      )}

      {fase === "error" && (
        <Card className="p-6 text-center">
          <XCircle size={32} className="mx-auto text-rose-500 mb-2" />
          <p className="text-sm text-slate-700">{errMsg}</p>
          <button className={btnSec + " mt-3"} onClick={() => setFase("elegir")}>Intentar de nuevo</button>
        </Card>
      )}
    </div>
  );
}

/* ================================================================
   MIS CURSOS (docente)
   ================================================================ */

function VerArchivoBtn({ certId, guardado }) {
  const [abriendo, setAbriendo] = useState(false);
  if (!guardado) return null;
  const abrir = async () => {
    setAbriendo(true);
    const f = await leerArchivo(certId);
    setAbriendo(false);
    if (!f) return;
    const bytes = atob(f.base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: f.mime }));
    window.open(url, "_blank");
  };
  return <button onClick={abrir} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Ver documento">{abriendo ? <Loader2 size={15} className="animate-spin"/> : <Eye size={15} />}</button>;
}

function MisCursos({ db, user, mutar }) {
  const [cicloF, setCicloF] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [cat, setCat] = useState("todas");
  const [editando, setEditando] = useState(null);
  const mis = db.certs.filter(c => c.docenteId === user.id)
    .filter(c => cicloF === "todos" || c.ciclo === cicloF)
    .filter(c => estado === "todos" || c.estado === estado)
    .filter(c => cat === "todas" || c.datos.categoria === cat)
    .sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || ""));
  const misCiclos = [...new Set(db.certs.filter(c => c.docenteId === user.id).map(c => c.ciclo).filter(Boolean))].sort().reverse();

  // El docente puede quitar de su historial una constancia rechazada
  const descartarRechazada = async (c) => {
    if (c.estado !== "rechazada") return;
    if (!window.confirm(`¿Quitar de tu historial la constancia “${c.datos.curso || c.archivoNombre}”?\n\nNo pasó la validación, así que no suma horas. Esta acción no se puede deshacer.`)) return;
    await mutar(d => { d.certs = d.certs.filter(x => x.id !== c.id); });
    await eliminarArchivo(c.id);
  };

  const guardarEdicion = async () => {
    await mutar(d => {
      const c = d.certs.find(x => x.id === editando.id);
      if (!c || c.estado === "validada") return; // no editable tras validación
      c.datos = editando.datos;
      c.ciclo = cicloDeConstancia(editando.datos); // corte de ciclo en agosto
      c.estado = "pendiente_validacion";
      c.dupFlag = !!detectarDuplicado(d, c);
      c.historial.push({ fecha: ahora(), accion: "Datos corregidos por el docente y reenviados a validación", por: user.nombre });
      d.users.filter(u => u.rol === "admin").forEach(a => notificar(d, a.id, `✏️ ${user.nombre} corrigió la constancia “${c.datos.curso}”.`));
    });
    setEditando(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mis cursos</h2>
        <div className="flex flex-wrap gap-2">
          <select className={inputCls + " !mt-0 !w-auto"} value={cicloF} onChange={e => setCicloF(e.target.value)}>
            <option value="todos">Todos los ciclos</option>{misCiclos.map(a => <option key={a} value={a}>Ciclo {a}</option>)}
          </select>
          <select className={inputCls + " !mt-0 !w-auto"} value={cat} onChange={e => setCat(e.target.value)}>
            <option value="todas">Todas las categorías</option>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className={inputCls + " !mt-0 !w-auto"} value={estado} onChange={e => setEstado(e.target.value)}>
            <option value="todos">Todos los estados</option>
            {Object.entries(ESTADOS_CERT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <Card className="p-4">
        <TablaCursos certs={mis} db={db} acciones={(c) => (
          <div className="flex gap-1">
            <VerArchivoBtn certId={c.id} guardado={c.archivoGuardado} />
            {["revision_docente", "pendiente_validacion", "rechazada"].includes(c.estado) &&
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Corregir datos" onClick={() => setEditando(JSON.parse(JSON.stringify(c)))}><Pencil size={15} /></button>}
            {c.estado === "rechazada" &&
              <button className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500" title="Quitar de mi historial" onClick={() => descartarRechazada(c)}><Trash2 size={15} /></button>}
          </div>
        )} />
      </Card>
      {editando && (
        <Modal titulo="Corregir constancia" onClose={() => setEditando(null)}>
          <FormularioConstancia cert={editando} onChange={setEditando} />
          <p className="text-xs text-slate-500 mt-3">Al guardar, la constancia volverá a la fila de validación de la administración.</p>
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            <button className={btnPrim} onClick={guardarEdicion}>Guardar y reenviar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   RANKING Y PODIO
   ================================================================ */

function Ranking({ db, user }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const esAdmin = user.rol === "admin";
  if (!db.config.rankingPublico && !esAdmin) return (
    <Card className="p-8 text-center text-sm text-slate-500">La administración ha desactivado la visualización pública del ranking.</Card>
  );
  const rank = rankingDe(db, ciclo);
  const podio = rank.slice(0, 3);
  const resto = rank.slice(3);
  const alturas = ["h-32", "h-24", "h-20"];
  const orden = [1, 0, 2]; // 2do, 1ro, 3ro visual
  const medallas = ["🥇", "🥈", "🥉"];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Podio de capacitación</h2>
        <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
          {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          <option value="historico">Histórico</option>
        </select>
      </div>
      {!db.config.rankingPublico && esAdmin &&
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">El ranking está oculto para los docentes. Puedes activarlo en Administración.</p>}
      <Card className="p-6 bg-gradient-to-b from-[#1a2340] to-[#232f52]">
        {podio.filter(p => p.horas > 0).length === 0
          ? <p className="text-center text-slate-300 text-sm py-6">Aún no hay horas validadas en este periodo. El podio espera a sus campeones. 🏆</p>
          : <div className="flex items-end justify-center gap-3 sm:gap-6">
              {orden.map(i => podio[i] && (
                <div key={podio[i].id} className="flex flex-col items-center flex-1 max-w-[160px]">
                  <div className="text-3xl mb-1">{medallas[i]}</div>
                  <div className="text-white text-sm font-bold text-center leading-tight mb-0.5">{podio[i].nombre}</div>
                  <div className="text-[#E8871E] text-xs font-bold mb-2">{podio[i].horas} horas</div>
                  <div className={`w-full ${alturas[i]} rounded-t-xl bg-gradient-to-b from-[#E8871E] to-[#c26d10] flex items-start justify-center pt-2 text-white font-bold text-xl`} style={{fontFamily:"'Archivo', sans-serif"}}>{i + 1}</div>
                </div>
              ))}
            </div>}
      </Card>
      <Card className="p-4">
        <h3 className="font-bold text-sm mb-2">Tabla general</h3>
        {rank.map((r, i) => {
          const m = metaDe(db, r.id);
          const pct = m ? Math.min(100, Math.round(100 * r.horas / m)) : 0;
          const sem = semaforoDe(db, m ? Math.round(100 * r.horas / m) : 0);
          return (
            <div key={r.id} className={`flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 ${r.id === user.id ? "bg-amber-50 -mx-2 px-2 rounded-lg" : ""}`}>
              <span className="w-8 text-center font-bold text-slate-400" style={{fontFamily:"'Archivo', sans-serif"}}>{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.nombre}{r.id === user.id && <span className="text-[10px] text-[#E8871E] font-bold ml-1.5">TÚ</span>}</div>
                <div className="h-1.5 rounded-full bg-slate-200 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + "%", background: SEM_COLORS[sem] }} /></div>
              </div>
              <span className="text-sm font-bold w-16 text-right">{r.horas} h</span>
            </div>
          );
        })}
        {rank.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Sin docentes registrados todavía.</p>}
      </Card>
    </div>
  );
}

/* ================================================================
   LOGROS
   ================================================================ */

function Logros({ db, user }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const mios = db.logros.filter(l => l.docenteId === user.id);
  const totalCiclo = mios.filter(m => m.clave.endsWith("@" + ciclo)).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mis logros</h2>
          <p className="text-sm text-slate-500">{totalCiclo} de {LOGROS_DEF.length} insignias en el ciclo {ciclo}</p>
        </div>
        <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
          {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
        </select>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {LOGROS_DEF.map(l => {
          const ganado = mios.find(m => m.clave === claveLogro(l.clave, ciclo));
          return (
            <Card key={l.clave} className={`p-4 flex items-center gap-3 ${ganado ? "border-[#E8871E] bg-amber-50/60" : "opacity-55"}`}>
              <span className="text-3xl">{l.icono}</span>
              <div>
                <div className="font-bold text-sm">{l.nombre}</div>
                <div className="text-xs text-slate-500">{l.desc}</div>
                {ganado ? <div className="text-[11px] text-[#E8871E] font-bold mt-0.5">Obtenida el {fmtFecha(ganado.fecha.slice(0,10))}</div>
                        : <div className="text-[11px] text-slate-400 mt-0.5">Aún por conseguir</div>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   MI CUENTA (administrador y docente)
   ================================================================ */

function MiCuenta({ user, soloTarjeta = false }) {
  const [passActual, setPassActual] = useState("");
  const [passNueva, setPassNueva] = useState("");
  const [passRepetir, setPassRepetir] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cambiar = async () => {
    setMsg(""); setErr("");
    if (passNueva.length < 6) { setErr("La nueva contraseña debe tener al menos 6 caracteres."); return; }
    if (passNueva !== passRepetir) { setErr("Las contraseñas nuevas no coinciden."); return; }
    if (passNueva === passActual) { setErr("La nueva contraseña debe ser distinta de la actual."); return; }
    setGuardando(true);
    // Se comprueba la contraseña actual reautenticando antes de cambiarla
    const { error: e1 } = await supabase.auth.signInWithPassword({ email: user.email, password: passActual });
    if (e1) { setErr("La contraseña actual no coincide."); setGuardando(false); return; }
    const { error: e2 } = await supabase.auth.updateUser({ password: passNueva });
    setGuardando(false);
    if (e2) { setErr("No se pudo actualizar: " + e2.message); return; }
    setPassActual(""); setPassNueva(""); setPassRepetir("");
    setMsg("Contraseña actualizada. Úsala la próxima vez que inicies sesión.");
  };

  const tarjeta = (
    <Card className="p-5 space-y-3">
      <div>
        <h3 className="font-bold text-sm">Cambiar mi contraseña</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Tu cuenta: <b>{user.email}</b>. Nadie más puede ver tu contraseña.
        </p>
      </div>
      <Campo label="Contraseña actual">
        <input className={inputCls} type="password" autoComplete="current-password"
          value={passActual} onChange={e => setPassActual(e.target.value)} />
      </Campo>
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo label="Nueva contraseña">
          <input className={inputCls} type="password" autoComplete="new-password"
            value={passNueva} onChange={e => setPassNueva(e.target.value)} />
        </Campo>
        <Campo label="Repetir nueva contraseña">
          <input className={inputCls} type="password" autoComplete="new-password"
            value={passRepetir} onChange={e => setPassRepetir(e.target.value)} />
        </Campo>
      </div>
      <p className="text-[11px] text-slate-400">Mínimo 6 caracteres. Evita usar tu nombre o fechas fáciles de adivinar.</p>
      {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{msg}</p>}
      <button className={btnSec} disabled={guardando} onClick={cambiar}>
        {guardando && <Loader2 size={14} className="animate-spin"/>}Cambiar contraseña
      </button>
    </Card>
  );

  if (soloTarjeta) return tarjeta;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mi cuenta</h2>
        <p className="text-sm text-slate-500">Datos de acceso al sistema.</p>
      </div>
      <Card className="p-5">
        <h3 className="font-bold text-sm mb-2">Mis datos</h3>
        <div className="grid sm:grid-cols-2 gap-y-2 text-sm">
          <div><span className="text-slate-500">Nombre: </span>{user.nombre}</div>
          <div><span className="text-slate-500">Correo: </span>{user.email}</div>
          <div><span className="text-slate-500">Área: </span>{user.area || "—"}</div>
          <div><span className="text-slate-500">Asignaturas: </span>{user.asignaturas || "—"}</div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Si algún dato es incorrecto, solicita a la administración escolar que lo corrija.
        </p>
      </Card>
      {tarjeta}
    </div>
  );
}

/* ================================================================
   RESPALDO (administrador)
   Descarga todo el acervo en un solo archivo ZIP: los documentos
   originales con nombres legibles, organizados por docente, más los
   índices en CSV. Todo ocurre en el navegador; nada se envía a
   ningún servidor externo.
   ================================================================ */

// Deja un texto apto para nombre de archivo en cualquier sistema
function nombreSeguro(txt, max = 60) {
  return (txt || "sin_nombre")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")   // quita acentos
    .replace(/[^a-zA-Z0-9 _-]/g, "")                     // quita signos
    .trim().replace(/\s+/g, "_").slice(0, max) || "sin_nombre";
}

const csvTexto = (filas) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\uFEFF" + filas.map(f => f.map(esc).join(",")).join("\n");
};

function Respaldo({ db, user }) {
  const [estado, setEstado] = useState("listo"); // listo | trabajando | terminado | error
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0, actual: "" });
  const [resultado, setResultado] = useState(null);
  const [err, setErr] = useState("");
  const [incluirArchivos, setIncluirArchivos] = useState(true);

  const docentes = db.users.filter(u => u.rol === "docente");
  const nombreDe = (id) => docentes.find(d => d.id === id)?.nombre || "Docente";

  // Todo lo que tiene documento adjunto, con su ruta dentro del ZIP
  const inventario = () => {
    const items = [];
    db.certs.filter(c => c.archivoGuardado && !c._publico).forEach(c => {
      const d = nombreSeguro(nombreDe(c.docenteId), 40);
      items.push({
        clave: c.id,
        ruta: `Docentes/${d}/Constancias/${nombreSeguro(c.datos.curso || "constancia", 50)}__${c.ciclo || "sin_ciclo"}`,
      });
    });
    db.grados.filter(g => g.archivoGuardado).forEach(g => {
      const d = nombreSeguro(nombreDe(g.docenteId), 40);
      items.push({
        clave: g.id,
        ruta: `Docentes/${d}/Grados_academicos/${nombreSeguro(g.nivel || "grado", 30)}__${nombreSeguro(g.datos?.programa || g.programa || "titulo", 40)}`,
      });
    });
    db.comp.filter(c => c.archivoGuardado).forEach(c => {
      const d = nombreSeguro(nombreDe(c.docenteId), 40);
      items.push({
        clave: c.id,
        ruta: `Docentes/${d}/Formacion_complementaria/${nombreSeguro(c.nombre || c.datos?.nombre || "documento", 50)}`,
      });
    });
    db.avisos.filter(a => a.archivoGuardado).forEach(a => {
      items.push({
        clave: "aviso_" + a.id,
        ruta: `Avisos/${nombreSeguro(a.titulo, 50)}`,
      });
    });
    return items;
  };

  const totalArchivos = inventario().length;

  const generar = async () => {
    setEstado("trabajando"); setErr(""); setResultado(null);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const hoy = new Date();
      const sello = hoy.toISOString().slice(0, 10);

      /* ---- Índices en CSV ---- */
      const fCerts = [["Docente", "Área", "Curso", "Institución", "Horas", "Categoría", "Modalidad",
                       "Fecha inicio", "Fecha término", "Fecha emisión", "Folio", "Ciclo", "Estado",
                       "Validada por", "Fecha de validación", "Archivo adjunto"]];
      db.certs.filter(c => !c._publico).forEach(c => {
        const d = docentes.find(x => x.id === c.docenteId);
        const val = (c.historial || []).filter(h => /valid/i.test(h.accion)).slice(-1)[0];
        fCerts.push([nombreDe(c.docenteId), d?.area || "", c.datos.curso, c.datos.institucion,
          c.datos.horas, c.datos.categoria, c.datos.modalidad, c.datos.fecha_inicio,
          c.datos.fecha_termino, c.datos.fecha_emision, c.datos.folio, c.ciclo,
          ESTADOS_CERT[c.estado]?.txt || c.estado, val?.por || "", val ? val.fecha : "",
          c.archivoGuardado ? "Sí" : "No"]);
      });
      zip.file(`Indices/constancias_${sello}.csv`, csvTexto(fCerts));

      const fGrados = [["Docente", "Nivel", "Programa", "Institución", "Campus", "País",
                        "Año de titulación", "Cédula", "Número de título", "Estado"]];
      db.grados.forEach(g => fGrados.push([nombreDe(g.docenteId), g.nivel,
        g.datos?.programa || "", g.datos?.institucion || "", g.datos?.campus || "",
        g.datos?.pais || "", g.datos?.fecha_expedicion || "", g.datos?.cedula || "",
        g.datos?.num_titulo || "", g.estado]));
      zip.file(`Indices/grados_academicos_${sello}.csv`, csvTexto(fGrados));

      const fComp = [["Docente", "Tipo", "Nombre", "Institución", "Fecha", "Duración", "Estado"]];
      db.comp.forEach(c => fComp.push([nombreDe(c.docenteId), c.tipo, c.nombre,
        c.institucion, c.fecha, c.duracion, c.estado]));
      zip.file(`Indices/formacion_complementaria_${sello}.csv`, csvTexto(fComp));

      const fDoc = [["Nombre", "Correo", "Área", "Asignaturas", "Estado", "Expediente %"]];
      docentes.forEach(d => fDoc.push([d.nombre, d.email, d.area || "", d.asignaturas || "",
        d.activo ? "Activo" : "Inactivo", completitudExpediente(db, d.id).pct + "%"]));
      zip.file(`Indices/docentes_${sello}.csv`, csvTexto(fDoc));

      const fAvisos = [["Título", "Tipo", "Prioridad", "Estado", "Publicado",
                        "Fecha límite", "Enterados", "Total destinatarios"]];
      db.avisos.forEach(a => {
        const s = seguimientoDe(db, a);
        fAvisos.push([a.titulo, a.tipo, a.prioridad, ESTADO_AVISO[a.estado],
          a.fechaPublicacion || "", a.fechaLimite || "", s.enterados.length, s.total.length]);
      });
      zip.file(`Indices/avisos_${sello}.csv`, csvTexto(fAvisos));

      const fAcuses = [["Aviso", "Docente", "Estado", "Fecha y hora del acuse"]];
      db.avisos.filter(a => a.estado !== "draft").forEach(a => {
        destinatariosDe(db, a).forEach(d => {
          const ac = acuseDe(db, a.id, d.id);
          fAcuses.push([a.titulo, d.nombre, ac ? "Enterado" : "Pendiente",
            ac ? new Date(ac.fecha).toLocaleString("es-MX") : ""]);
        });
      });
      zip.file(`Indices/acuses_de_enterado_${sello}.csv`, csvTexto(fAcuses));

      /* ---- Documentos originales ---- */
      let fallidos = 0, guardados = 0;
      if (incluirArchivos) {
        const items = inventario();
        setProgreso({ hechos: 0, total: items.length, actual: "" });
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          setProgreso({ hechos: i, total: items.length, actual: it.ruta.split("/").pop() });
          try {
            const f = await leerArchivo(it.clave);
            if (!f) { fallidos++; continue; }
            const ext = (f.nombre && f.nombre.includes(".")) ? f.nombre.split(".").pop().toLowerCase()
              : (f.mime || "").includes("pdf") ? "pdf"
              : (f.mime || "").includes("png") ? "png" : "jpg";
            zip.file(`${it.ruta}.${ext}`, f.base64, { base64: true });
            guardados++;
          } catch { fallidos++; }
        }
        setProgreso({ hechos: items.length, total: items.length, actual: "" });
      }

      /* ---- Nota explicativa ---- */
      zip.file("LEEME.txt",
`RESPALDO DEL SISTEMA
Departamento de Formación Docente · CBTA No. 291

Generado el: ${hoy.toLocaleString("es-MX")}
Generado por: ${user.nombre}

CONTENIDO
- Indices/ .............. Tablas en formato CSV (se abren con Excel).
- Docentes/ ............. Documentos originales, en una carpeta por docente:
                          constancias de cursos, títulos y grados académicos,
                          y formación complementaria.
- Avisos/ ............... Archivos adjuntos de las circulares publicadas.

RESUMEN
Docentes registrados: ${docentes.length}
Constancias: ${db.certs.filter(c => !c._publico).length}
Grados académicos: ${db.grados.length}
Formación complementaria: ${db.comp.length}
Avisos: ${db.avisos.length}
Documentos incluidos: ${guardados}${fallidos ? ` (no se pudieron recuperar ${fallidos})` : ""}

NOTA
Este archivo es una copia de seguridad. Consérvalo en un lugar distinto
de la computadora de uso diario (por ejemplo, un disco externo o una
carpeta en la nube del plantel). Conviene generar un respaldo al cierre
de cada ciclo escolar.
`);

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `respaldo_formacion_docente_${sello}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);

      setResultado({ guardados, fallidos, peso: (blob.size / 1048576).toFixed(1) });
      setEstado("terminado");
    } catch (e) {
      setErr(e.message || "No se pudo generar el respaldo.");
      setEstado("error");
    }
  };

  const pct = progreso.total ? Math.round(100 * progreso.hechos / progreso.total) : 0;

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Respaldo del sistema</h2>
        <p className="text-sm text-slate-500">
          Descarga todo el acervo en un solo archivo ZIP: documentos originales organizados por
          docente e índices en Excel. Se recomienda hacerlo al cierre de cada ciclo escolar.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icono={Users} label="Docentes" valor={docentes.length} />
        <Stat icono={FileCheck} label="Constancias" valor={db.certs.filter(c => !c._publico).length} />
        <Stat icono={GraduationCap} label="Grados y complementaria" valor={db.grados.length + db.comp.length} />
        <Stat icono={FolderOpen} label="Documentos adjuntos" valor={totalArchivos} />
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <h3 className="font-bold text-sm mb-2">Qué incluye el respaldo</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• <b>Índices en CSV</b>: constancias, grados, formación complementaria, docentes, avisos y acuses de enterado.</li>
            <li>• <b>Documentos originales</b> con nombres legibles, en una carpeta por docente.</li>
            <li>• <b>Nota explicativa</b> con la fecha del respaldo y el resumen del contenido.</li>
          </ul>
        </div>

        <label className="flex items-start gap-3 text-sm bg-slate-50 rounded-xl p-3">
          <input type="checkbox" className="mt-0.5" checked={incluirArchivos}
            onChange={e => setIncluirArchivos(e.target.checked)} disabled={estado === "trabajando"} />
          <span>
            Incluir los {totalArchivos} documentos originales (PDF e imágenes).
            <span className="block text-xs text-slate-500 mt-0.5">
              Si lo desmarcas, el respaldo solo trae los índices en Excel: se genera en segundos y pesa muy poco.
            </span>
          </span>
        </label>

        {estado === "trabajando" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin"/>
                {progreso.total ? `Recuperando documentos… ${progreso.hechos} de ${progreso.total}` : "Preparando índices…"}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-[#E8871E] transition-all" style={{ width: pct + "%" }} />
            </div>
            {progreso.actual && <p className="text-[11px] text-slate-400 truncate">{progreso.actual}</p>}
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              No cierres esta pestaña hasta que termine. El archivo se descargará solo.
            </p>
          </div>
        )}

        {estado === "terminado" && resultado && (
          <div className="text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3">
            <b>Respaldo descargado.</b> {resultado.guardados} documento(s) incluidos · {resultado.peso} MB.
            {resultado.fallidos > 0 && (
              <span className="block text-amber-700 mt-1">
                {resultado.fallidos} documento(s) no se pudieron recuperar; sus datos sí están en los índices.
              </span>
            )}
            <span className="block text-xs mt-1">Guárdalo fuera de esta computadora: disco externo o nube del plantel.</span>
          </div>
        )}

        {estado === "error" && (
          <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>
        )}

        <button className={btnPrim} disabled={estado === "trabajando"} onClick={generar}>
          {estado === "trabajando" ? <Loader2 size={15} className="animate-spin"/> : <Download size={15}/>}
          {estado === "trabajando" ? "Generando respaldo…" : "Generar y descargar respaldo"}
        </button>
      </Card>

      <Card className="p-5">
        <h3 className="font-bold text-sm mb-2">Recomendaciones</h3>
        <div className="text-sm text-slate-600 space-y-2">
          <p>Genera un respaldo <b>al cierre de cada ciclo escolar</b>, en julio, y consérvalo en un lugar distinto de la computadora de uso diario.</p>
          <p>Este archivo también sirve para entregar el expediente completo de un docente: basta con abrir el ZIP y tomar su carpeta.</p>
          <p className="text-xs text-slate-400">Con muchos documentos el proceso puede tardar varios minutos, porque cada archivo se descarga uno por uno desde el almacenamiento.</p>
        </div>
      </Card>
    </div>
  );
}

/* ================================================================
   AVISOS Y CIRCULARES
   ================================================================ */

const esImagenAdjunta = (aviso) =>
  (aviso.archivoTipo || "").startsWith("image/") ||
  /\.(jpe?g|png|webp|gif)$/i.test(aviso.archivoNombre || "");

function ChipPrioridad({ prioridad }) {
  const c = COLOR_PRIORIDAD[prioridad] || COLOR_PRIORIDAD.Normal;
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${c.chip}`}>{c.punto} {prioridad.toUpperCase()}</span>;
}

// Texto con saltos de línea, **negritas**, *cursivas*, listas y enlaces
function TextoAviso({ texto }) {
  const lineas = (texto || "").split("\n");
  const inline = (t, k) => {
    const partes = t.split(/(\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/\S+)/g).filter(Boolean);
    return partes.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
      if (p.startsWith("*") && p.endsWith("*")) return <i key={i}>{p.slice(1, -1)}</i>;
      if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer" className="text-indigo-600 underline break-all">{p}</a>;
      return <span key={i}>{p}</span>;
    });
  };
  return (
    <div className="text-sm text-slate-600 space-y-1">
      {lineas.map((l, i) => {
        const li = l.match(/^\s*[-*•]\s+(.*)$/);
        if (li) return <div key={i} className="flex gap-2 pl-1"><span className="text-slate-400">•</span><span>{inline(li[1], i)}</span></div>;
        if (!l.trim()) return <div key={i} className="h-1.5" />;
        return <p key={i}>{inline(l, i)}</p>;
      })}
    </div>
  );
}

/* ---------------- Administrador ---------------- */

function Avisos({ db, user, mutar }) {
  const [editando, setEditando] = useState(null);
  const [confirmar, setConfirmar] = useState(null);   // aviso por publicar
  const [siguiendo, setSiguiendo] = useState(null);   // aviso en seguimiento
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [fTipo, setFTipo] = useState("todos");
  const [fEstado, setFEstado] = useState("todos");
  const [fPrio, setFPrio] = useState("todas");

  const lista = db.avisos
    .filter(a => !q || (a.titulo || "").toLowerCase().includes(q.toLowerCase()))
    .filter(a => fTipo === "todos" || a.tipo === fTipo)
    .filter(a => fEstado === "todos" || a.estado === fEstado)
    .filter(a => fPrio === "todas" || a.prioridad === fPrio);

  const nuevo = () => setEditando({
    id: uid(), titulo: "", descripcion: "", tipo: "Circular", prioridad: "Normal",
    fechaLimite: "", enlace: "", archivoNombre: null, archivoGuardado: false,
    estado: "draft", destino: { tipo: "todos" }, creadoEn: ahora(), creadoPor: user.nombre,
    _archivoNuevo: null,
  });

  const subirAdjunto = async (aviso) => {
    if (!aviso._archivoNuevo) return { nombre: aviso.archivoNombre, guardado: aviso.archivoGuardado, tipo: aviso.archivoTipo };
    const f = aviso._archivoNuevo;
    const b64 = await leerComoBase64(f);
    const r = await guardarArchivo("aviso_" + aviso.id, b64, f.type, f.name);
    return { nombre: f.name, guardado: r.guardado, tipo: f.type };
  };

  const guardar = async (publicar) => {
    if (!editando.titulo.trim() || !editando.descripcion.trim()) {
      setErr("El título y la descripción son obligatorios."); return;
    }
    setGuardando(true); setErr("");
    try {
      const adj = await subirAdjunto(editando);
      await mutar(d => {
        const { _archivoNuevo, ...limpio } = editando;
        const base = {
          ...limpio, archivoNombre: adj.nombre, archivoGuardado: adj.guardado,
          archivoTipo: adj.tipo || limpio.archivoTipo || "",
          estado: publicar ? "published" : "draft",
          actualizadoEn: ahora(),
        };
        if (publicar && !base.fechaPublicacion) base.fechaPublicacion = ahora();
        const i = d.avisos.findIndex(a => a.id === base.id);
        if (i >= 0) d.avisos[i] = { ...d.avisos[i], ...base };
        else d.avisos.unshift(base);
        if (publicar) {
          destinatariosDe(d, base).forEach(doc => notificar(d, doc.id,
            `${base.prioridad === "Urgente" ? "🔴 URGENTE · " : "📢 "}Nuevo aviso: “${base.titulo}”. Márcalo como enterado en la sección Avisos.`));
          registrarActividad(d, `Se publicó el aviso “${base.titulo}”.`);
        }
      });
      setEditando(null); setConfirmar(null);
    } catch (e) { setErr(e.message); }
    setGuardando(false);
  };

  const cambiarEstado = async (aviso, estado) => {
    const verbo = estado === "archived" ? "archivar" : "reactivar";
    if (!window.confirm(`¿Deseas ${verbo} el aviso “${aviso.titulo}”?\n\nLos acuses ya registrados se conservan.`)) return;
    await mutar(d => {
      const a = d.avisos.find(x => x.id === aviso.id);
      a.estado = estado; a.actualizadoEn = ahora();
      registrarActividad(d, `Se ${estado === "archived" ? "archivó" : "reactivó"} el aviso “${a.titulo}”.`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Avisos y Circulares</h2>
          <p className="text-sm text-slate-500">Publica comunicados y consulta el seguimiento de los acuses de enterado.</p>
        </div>
        <button className={btnPrim} onClick={nuevo}><Plus size={15}/>Nuevo aviso</button>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + " !mt-0 !pl-8"} placeholder="Buscar por título…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className={inputCls + " !mt-0 !w-auto"} value={fTipo} onChange={e => setFTipo(e.target.value)}>
          <option value="todos">Todos los tipos</option>{TIPOS_AVISO.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className={inputCls + " !mt-0 !w-auto"} value={fPrio} onChange={e => setFPrio(e.target.value)}>
          <option value="todas">Toda prioridad</option>{PRIORIDADES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className={inputCls + " !mt-0 !w-auto"} value={fEstado} onChange={e => setFEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          {Object.entries(ESTADO_AVISO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Card>

      <Card className="p-4">
        {lista.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">No hay avisos que coincidan. Crea el primero con “Nuevo aviso”.</p>}
        {lista.map(a => {
          const s = seguimientoDe(db, a);
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-3 py-3 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{a.titulo}</span>
                  <ChipPrioridad prioridad={a.prioridad} />
                  <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{a.tipo}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {a.estado === "draft" ? "Sin publicar" : `Publicado ${fmtFecha((a.fechaPublicacion || "").slice(0,10))}`}
                  {a.fechaLimite && ` · Límite ${fmtFecha(a.fechaLimite)}`}
                  {a.archivoNombre && ` · 📎 ${a.archivoNombre}`}
                </div>
              </div>
              {a.estado !== "draft" && (
                <div className="text-center min-w-[86px]">
                  <div className="text-sm font-bold">{s.enterados.length}/{s.total.length}</div>
                  <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden mx-auto mt-1">
                    <div className="h-full bg-emerald-600" style={{ width: s.pct + "%" }} />
                  </div>
                </div>
              )}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                a.estado === "published" ? "bg-emerald-100 text-emerald-800"
                : a.estado === "draft" ? "bg-slate-100 text-slate-600" : "bg-slate-200 text-slate-500"}`}>
                {ESTADO_AVISO[a.estado]}
              </span>
              <div className="flex gap-1">
                {a.estado !== "draft" &&
                  <button className={btnSec + " !px-3 !py-1.5"} onClick={() => setSiguiendo(a)}>Ver seguimiento</button>}
                <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar"
                  onClick={() => setEditando({ ...JSON.parse(JSON.stringify(a)), _archivoNuevo: null })}><Pencil size={15}/></button>
                {a.estado === "published" &&
                  <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Archivar"
                    onClick={() => cambiarEstado(a, "archived")}><Archive size={15}/></button>}
                {a.estado === "archived" &&
                  <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Reactivar"
                    onClick={() => cambiarEstado(a, "published")}><Send size={15}/></button>}
              </div>
            </div>
          );
        })}
      </Card>

      {/* Formulario */}
      {editando && (
        <Modal titulo={db.avisos.some(a => a.id === editando.id) ? "Editar aviso" : "Nuevo aviso"} onClose={() => setEditando(null)} ancho="max-w-2xl">
          <div className="space-y-3">
            <Campo label="Título">
              <input className={inputCls} value={editando.titulo} placeholder="Curso de actualización docente 2026"
                onChange={e => setEditando({ ...editando, titulo: e.target.value })} />
            </Campo>
            <Campo label="Descripción">
              <textarea className={inputCls + " min-h-[140px]"} value={editando.descripcion}
                placeholder={"Se informa al personal docente que…\n\nPuedes usar **negritas**, *cursivas*, listas con - y pegar ligas."}
                onChange={e => setEditando({ ...editando, descripcion: e.target.value })} />
            </Campo>
            <p className="text-[11px] text-slate-400 -mt-1">Formato: **negritas**, *cursivas*, líneas que empiezan con “- ” para listas. Las direcciones web se convierten en enlaces.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <Campo label="Tipo de aviso">
                <select className={inputCls} value={editando.tipo} onChange={e => setEditando({ ...editando, tipo: e.target.value })}>
                  {TIPOS_AVISO.map(t => <option key={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Prioridad">
                <select className={inputCls} value={editando.prioridad} onChange={e => setEditando({ ...editando, prioridad: e.target.value })}>
                  {PRIORIDADES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Fecha límite de enterado (opcional)">
                <input type="date" className={inputCls} value={editando.fechaLimite || ""}
                  onChange={e => setEditando({ ...editando, fechaLimite: e.target.value })} />
              </Campo>
            </div>
            <Campo label="Enlace externo (opcional)">
              <input className={inputCls} placeholder="https://…" value={editando.enlace || ""}
                onChange={e => setEditando({ ...editando, enlace: e.target.value })} />
            </Campo>
            <Campo label="Archivo adjunto (opcional): PDF o imagen">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" className="text-sm"
                onChange={e => setEditando({ ...editando, _archivoNuevo: e.target.files[0] || null })} />
              <p className="text-[11px] text-slate-400 mt-1">
                Las imágenes (cartel, invitación, infografía) se muestran directamente dentro del aviso;
                los PDF se abren al tocarlos.
              </p>
              {editando.archivoNombre && !editando._archivoNuevo &&
                <p className="text-xs text-slate-500 mt-1">Adjunto actual: {editando.archivoNombre}</p>}
            </Campo>
            {err && <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
          </div>
          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            <button className={btnSec} disabled={guardando} onClick={() => guardar(false)}>
              {guardando && <Loader2 size={14} className="animate-spin"/>}Guardar borrador
            </button>
            <button className={btnPrim} disabled={guardando} onClick={() => {
              if (!editando.titulo.trim() || !editando.descripcion.trim()) { setErr("El título y la descripción son obligatorios."); return; }
              setConfirmar(editando);
            }}><Send size={15}/>Publicar aviso</button>
          </div>
        </Modal>
      )}

      {/* Confirmación de publicación */}
      {confirmar && (
        <Modal titulo="Confirmar publicación" onClose={() => setConfirmar(null)}>
          <p className="text-sm text-slate-600">¿Deseas publicar este aviso? Una vez publicado será visible para todos los docentes.</p>
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setConfirmar(null)}>Cancelar</button>
            <button className={btnPrim} disabled={guardando} onClick={() => guardar(true)}>
              {guardando && <Loader2 size={14} className="animate-spin"/>}Sí, publicar
            </button>
          </div>
        </Modal>
      )}

      {siguiendo && <SeguimientoAviso db={db} aviso={siguiendo} onClose={() => setSiguiendo(null)} />}
    </div>
  );
}

function SeguimientoAviso({ db, aviso, onClose }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const s = seguimientoDe(db, aviso);
  const filas = s.total
    .map(d => ({ d, ac: acuseDe(db, aviso.id, d.id) }))
    .filter(({ ac }) => filtro === "todos" || (filtro === "enterados" ? ac : !ac))
    .filter(({ d }) => !q || d.nombre.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.d.nombre.localeCompare(b.d.nombre));

  const exportar = () => {
    const filasCSV = [["Docente", "Área", "Estado", "Fecha", "Hora"]];
    s.total.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).forEach(d => {
      const ac = acuseDe(db, aviso.id, d.id);
      const f = ac ? new Date(ac.fecha) : null;
      filasCSV.push([d.nombre, d.area || "", ac ? "Enterado" : "Pendiente",
        f ? f.toLocaleDateString("es-MX") : "", f ? f.toLocaleTimeString("es-MX") : ""]);
    });
    descargarCSV(`seguimiento_${aviso.titulo.slice(0, 30).replace(/\s+/g, "_")}`, filasCSV);
  };

  return (
    <Modal titulo="Seguimiento del aviso" onClose={onClose} ancho="max-w-3xl">
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold">{aviso.titulo}</h3>
            <ChipPrioridad prioridad={aviso.prioridad} />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Publicado: {aviso.fechaPublicacion ? new Date(aviso.fechaPublicacion).toLocaleString("es-MX") : "—"}
            {aviso.fechaLimite && ` · Fecha límite: ${fmtFecha(aviso.fechaLimite)}`}
          </p>
          {avisoVencido(aviso) && s.pendientes.length > 0 && (
            <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1.5">
              <AlertTriangle size={13}/>{s.pendientes.length} docente(s) pendiente(s) después de la fecha límite.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icono={Users} label="Docentes" valor={s.total.length} />
          <Stat icono={CheckCircle2} label="Enterados" valor={s.enterados.length} />
          <Stat icono={Clock} label="Pendientes" valor={s.pendientes.length} color={s.pendientes.length ? "text-amber-600" : "text-slate-900"} />
          <Stat icono={TrendingUp} label="Avance" valor={s.pct + "%"} />
        </div>
        <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: s.pct + "%" }} />
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={inputCls + " !mt-0 !pl-8"} placeholder="Buscar docente…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className={inputCls + " !mt-0 !w-auto"} value={filtro} onChange={e => setFiltro(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="enterados">Solo enterados</option>
            <option value="pendientes">Solo pendientes</option>
          </select>
          <button className={btnSec} onClick={exportar}><Download size={14}/>Exportar seguimiento</button>
        </div>

        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-200">
                <th className="py-2 pr-3">Docente</th><th className="py-2 pr-3">Estado</th><th className="py-2">Fecha de enterado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ d, ac }) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3">{d.nombre}<span className="block text-[11px] text-slate-400">{d.area || "—"}</span></td>
                  <td className="py-2 pr-3">
                    {ac ? <span className="text-emerald-700 font-semibold text-xs">✓ Enterado</span>
                        : <span className="text-amber-600 font-semibold text-xs">⚠ Pendiente</span>}
                  </td>
                  <td className="py-2 text-slate-500 text-xs">{ac ? new Date(ac.fecha).toLocaleString("es-MX") : "—"}</td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-slate-400 text-sm">Sin resultados con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Docente ---------------- */

function MisAvisos({ db, user, recargar }) {
  const [tab, setTab] = useState("pendientes");
  const [confirmando, setConfirmando] = useState(null);
  const [firmando, setFirmando] = useState(false);
  const [err, setErr] = useState("");

  const mios = db.avisos.filter(a => a.estado !== "draft" && destinatariosDe(db, a).some(d => d.id === user.id));
  const pendientes = mios.filter(a => a.estado === "published" && !acuseDe(db, a.id, user.id));
  const atendidos = mios.filter(a => acuseDe(db, a.id, user.id));
  const lista = tab === "pendientes" ? pendientes : atendidos;

  const confirmar = async () => {
    setFirmando(true); setErr("");
    try {
      // El servidor fija usuario y hora; aquí solo se envía el aviso.
      await marcarEnterado(confirmando.id);
      setConfirmando(null);
      await recargar();
    } catch (e) { setErr("No se pudo registrar el acuse: " + e.message); }
    setFirmando(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Avisos y Circulares</h2>
        <p className="text-sm text-slate-500">Comunicados del plantel. Marca cada uno como enterado cuando lo hayas leído.</p>
      </div>

      <div className="flex gap-2">
        {[["pendientes", `Pendientes (${pendientes.length})`], ["atendidos", `Atendidos (${atendidos.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold ${tab === k ? "bg-[#1a2340] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{l}</button>
        ))}
      </div>

      {lista.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-400">
          {tab === "pendientes" ? "No tienes avisos pendientes. Todo al día. ✨" : "Todavía no has confirmado ningún aviso."}
        </Card>
      )}

      <div className="space-y-3">
        {lista.map(a => {
          const ac = acuseDe(db, a.id, user.id);
          const c = COLOR_PRIORIDAD[a.prioridad] || COLOR_PRIORIDAD.Normal;
          const vencido = avisoVencido(a) && !ac;
          return (
            <Card key={a.id} className={`p-5 border-l-4 ${c.borde}`}>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <ChipPrioridad prioridad={a.prioridad} />
                <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{a.tipo}</span>
                {a.estado === "archived" && <span className="text-[11px] text-slate-400">· Archivado</span>}
              </div>
              <h3 className="font-bold text-base" style={{fontFamily:"'Archivo', sans-serif"}}>{a.titulo}</h3>
              <p className="text-xs text-slate-400 mb-3">
                Publicado: {a.fechaPublicacion ? new Date(a.fechaPublicacion).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }) : "—"}
              </p>

              <TextoAviso texto={a.descripcion} />

              {a.archivoGuardado && esImagenAdjunta(a) && <ImagenAviso aviso={a} />}

              <div className="flex flex-wrap gap-3 mt-3">
                {a.archivoGuardado && !esImagenAdjunta(a) && <AdjuntoAviso aviso={a} />}
                {a.enlace && (
                  <a href={a.enlace} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-semibold hover:underline">
                    <Link2 size={15}/>Más información
                  </a>
                )}
              </div>

              {a.fechaLimite && (
                <p className={`text-xs mt-3 font-semibold ${vencido ? "text-rose-600" : "text-slate-500"}`}>
                  {vencido ? "🔴 Fecha límite vencida: " : "Fecha límite para enterarse: "}
                  {fmtFecha(a.fechaLimite)}
                </p>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100">
                {ac ? (
                  <p className="text-sm text-emerald-700 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={16}/>✓ Enterado · Confirmado el {new Date(ac.fecha).toLocaleString("es-MX")}
                  </p>
                ) : (
                  <button className={btnPrim} onClick={() => { setConfirmando(a); setErr(""); }}>
                    <ShieldCheck size={15}/>Marcar como enterado
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {confirmando && (
        <Modal titulo="Confirmar acuse de enterado" onClose={() => setConfirmando(null)}>
          <p className="text-sm text-slate-600">¿Confirmas que has leído y estás enterado de este aviso?</p>
          <p className="text-sm font-semibold mt-2">“{confirmando.titulo}”</p>
          <p className="text-xs text-slate-400 mt-2">Se registrará la fecha y hora del servidor. El acuse no puede deshacerse.</p>
          {err && <p className="text-sm text-rose-600 mt-2 flex items-center gap-1.5"><AlertTriangle size={14}/>{err}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setConfirmando(null)}>Cancelar</button>
            <button className={btnPrim} disabled={firmando} onClick={confirmar}>
              {firmando && <Loader2 size={14} className="animate-spin"/>}Sí, estoy enterado
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ImagenAviso({ aviso }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true, creada = null;
    (async () => {
      const f = await leerArchivo("aviso_" + aviso.id);
      if (!f || !vivo) { if (vivo) setError(true); return; }
      const bytes = atob(f.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      creada = URL.createObjectURL(new Blob([arr], { type: f.mime }));
      setUrl(creada);
    })();
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [aviso.id]);

  if (error) return <AdjuntoAviso aviso={aviso} />;
  if (!url) return (
    <div className="mt-3 h-40 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-sm gap-2">
      <Loader2 size={16} className="animate-spin" /> Cargando imagen…
    </div>
  );
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block mt-3" title="Abrir en tamaño completo">
      <img src={url} alt={aviso.archivoNombre || "Imagen del aviso"}
        className="max-h-96 w-auto rounded-xl border border-slate-200 hover:opacity-95 transition" />
    </a>
  );
}

function AdjuntoAviso({ aviso }) {
  const [abriendo, setAbriendo] = useState(false);
  const abrir = async () => {
    setAbriendo(true);
    const f = await leerArchivo("aviso_" + aviso.id);
    setAbriendo(false);
    if (!f) return;
    const bytes = atob(f.base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    window.open(URL.createObjectURL(new Blob([arr], { type: f.mime })), "_blank");
  };
  return (
    <button onClick={abrir} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 font-semibold hover:underline">
      {abriendo ? <Loader2 size={15} className="animate-spin"/> : <Paperclip size={15}/>}
      {aviso.archivoNombre || "Archivo adjunto"}
    </button>
  );
}

/* ================================================================
   VALIDACIONES (administrador)
   ================================================================ */

function Validaciones({ db, user, mutar }) {
  const [tab, setTab] = useState("constancias");
  const [revisando, setRevisando] = useState(null); // cert en revisión
  const [gradoRev, setGradoRev] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [soloPend, setSoloPend] = useState(true);

  const certs = db.certs
    .filter(c => !soloPend || ["pendiente_validacion", "procesando", "revision_docente"].includes(c.estado))
    .sort((a, b) => (b.creadoEn || "").localeCompare(a.creadoEn || ""));
  const grados = db.grados.filter(g => !soloPend || g.estado === "pendiente");
  const comps = db.comp.filter(g => !soloPend || g.estado === "pendiente");
  const nombreDe = (id) => db.users.find(u => u.id === id)?.nombre || "—";

  const validarCert = async (cert) => {
    await mutar(d => {
      const c = d.certs.find(x => x.id === cert.id);
      c.datos = cert.datos; // correcciones del admin
      c.estado = "validada"; c.validadoPor = user.nombre; c.validadoEn = ahora(); c.motivoRechazo = null;
      c.historial.push({ fecha: ahora(), accion: "Validada por la administración", por: user.nombre });
      notificar(d, c.docenteId, `✅ Tu constancia “${c.datos.curso}” fue validada. Se sumaron ${c.datos.horas || 0} horas a tu historial.`);
      registrarActividad(d, `Se validó la constancia “${c.datos.curso}” de ${nombreDe(c.docenteId)} (${c.datos.horas || 0} h).`);
      otorgarLogros(d, c.docenteId, c.ciclo);
      const h = horasValidadas(d, c.docenteId, d.config.cicloActual);
      const m = metaDe(d, c.docenteId);
      if (h >= m) registrarActividad(d, `🎉 ${nombreDe(c.docenteId)} alcanzó ${h} horas y cumplió su meta del ciclo.`);
      else if (h >= 20 && h - (Number(c.datos.horas)||0) < 20) registrarActividad(d, `${nombreDe(c.docenteId)} alcanzó ${h} horas de capacitación.`);
    });
    setRevisando(null);
  };

  const rechazarCert = async (cert) => {
    if (!motivo.trim()) return;
    await mutar(d => {
      const c = d.certs.find(x => x.id === cert.id);
      c.estado = "rechazada"; c.motivoRechazo = motivo.trim();
      c.historial.push({ fecha: ahora(), accion: `Rechazada · motivo: ${motivo.trim()}`, por: user.nombre });
      notificar(d, c.docenteId, `❌ Tu constancia “${c.datos.curso || c.archivoNombre}” fue rechazada. Motivo: ${motivo.trim()}`);
    });
    setMotivo(""); setRevisando(null);
  };

  const eliminarCert = async (c) => {
    const eraValidada = c.estado === "validada";
    const aviso = eraValidada
      ? `Esta constancia está VALIDADA. Al eliminarla se restarán ${c.datos.horas || 0} horas del ciclo ${c.ciclo} de ${nombreDe(c.docenteId)}.\n\n¿Eliminar definitivamente?`
      : "¿Eliminar definitivamente este registro? Esta acción no se puede deshacer.";
    if (!window.confirm(aviso)) return;
    await mutar(d => {
      d.certs = d.certs.filter(x => x.id !== c.id);
      notificar(d, c.docenteId, `🗑️ La administración eliminó tu constancia “${c.datos.curso || c.archivoNombre}”${eraValidada ? ` y se restaron ${c.datos.horas || 0} horas de tu historial` : ""}.`);
      registrarActividad(d, `Se eliminó la constancia “${c.datos.curso || "sin título"}” de ${nombreDe(c.docenteId)}.`);
    });
    await eliminarArchivo(c.id);
    setRevisando(null);
  };

  const resolverGrado = async (item, coleccion, aprobar) => {
    if (!aprobar && !motivo.trim()) return;
    await mutar(d => {
      const g = d[coleccion].find(x => x.id === item.id);
      if (coleccion === "grados") g.datos = item.datos;
      g.estado = aprobar ? "validado" : "rechazado";
      g.motivoRechazo = aprobar ? null : motivo.trim();
      g.validadoEn = aprobar ? ahora() : null; g.validadoPor = user.nombre;
      const que = coleccion === "grados" ? `tu ${g.nivel}` : `“${g.nombre}”`;
      notificar(d, g.docenteId, aprobar ? `✅ Se validó ${que} en tu expediente académico.` : `❌ Se rechazó ${que}. Motivo: ${motivo.trim()}`);
    });
    setMotivo(""); setGradoRev(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Validaciones</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={soloPend} onChange={e => setSoloPend(e.target.checked)} /> Solo pendientes
        </label>
      </div>
      <div className="flex gap-2">
        {[["constancias", `Constancias (${certs.length})`], ["grados", `Grados académicos (${grados.length})`], ["comp", `Formación complementaria (${comps.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold ${tab === k ? "bg-[#1a2340] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{l}</button>
        ))}
      </div>

      {tab === "constancias" && (
        <Card className="p-4">
          {certs.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No hay constancias {soloPend ? "pendientes de validación" : "registradas"}. Todo al día. ✨</p>}
          {certs.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.datos.curso || <i className="text-slate-400">Sin título</i>}
                  {c.dupFlag && <span className="ml-2 text-[10px] font-bold text-amber-600">⚠️ Posible constancia duplicada</span>}
                </div>
                <div className="text-xs text-slate-500">{nombreDe(c.docenteId)} · {c.datos.horas ?? "?"} h · {c.datos.institucion || "—"} · ciclo {c.ciclo}</div>
              </div>
              <Badge estado={c.estado} />
              <VerArchivoBtn certId={c.id} guardado={c.archivoGuardado} />
              <button className={btnSec + " !px-3 !py-1.5"} onClick={() => { setRevisando(JSON.parse(JSON.stringify(c))); setMotivo(""); }}>Revisar</button>
              <button title="Eliminar constancia" className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                onClick={() => eliminarCert(c)}><Trash2 size={16} /></button>
            </div>
          ))}
        </Card>
      )}

      {(tab === "grados" || tab === "comp") && (
        <Card className="p-4">
          {(tab === "grados" ? grados : comps).length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Nada pendiente en esta sección.</p>}
          {(tab === "grados" ? grados : comps).map(g => (
            <div key={g.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{tab === "grados" ? `${g.nivel} · ${g.datos?.programa || "—"}` : `${g.tipo}: ${g.nombre}`}</div>
                <div className="text-xs text-slate-500">{nombreDe(g.docenteId)} · {(tab === "grados" ? g.datos?.institucion : g.institucion) || "—"}</div>
              </div>
              <Badge estado={g.estado} mapa={ESTADOS_GRADO} />
              <VerArchivoBtn certId={g.id} guardado={g.archivoGuardado} />
              <button className={btnSec + " !px-3 !py-1.5"} onClick={() => { setGradoRev({ item: JSON.parse(JSON.stringify(g)), coleccion: tab === "grados" ? "grados" : "comp" }); setMotivo(""); }}>Revisar</button>
            </div>
          ))}
        </Card>
      )}

      {revisando && (
        <Modal titulo={`Revisar constancia · ${nombreDe(revisando.docenteId)}`} onClose={() => setRevisando(null)} ancho="max-w-3xl">
          {revisando.dupFlag && <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex gap-2"><AlertTriangle size={16} className="shrink-0"/>Posible constancia duplicada: existe otro registro del mismo docente con curso, fecha, horas o folio coincidentes. Decide si procede validarla.</p>}
          <FormularioConstancia cert={revisando} onChange={setRevisando} />
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase mb-1">Historial de cambios</h4>
            {(revisando.historial || []).map((h, i) => <p key={i} className="text-xs text-slate-500">· {new Date(h.fecha).toLocaleString("es-MX")} — {h.accion} ({h.por})</p>)}
            {revisando.validadoPor && <p className="text-xs text-emerald-700 mt-1">Validada por {revisando.validadoPor} el {new Date(revisando.validadoEn).toLocaleString("es-MX")}</p>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 justify-between">
            <button className="text-rose-600 text-sm font-semibold inline-flex items-center gap-1.5" onClick={() => eliminarCert(revisando)}><Trash2 size={15}/>Eliminar registro</button>
            <div className="flex flex-wrap gap-2 items-center">
              <input className={inputCls + " !mt-0 !w-56"} placeholder="Motivo del rechazo…" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <button className={btnSec + " !text-rose-600 !border-rose-300"} disabled={!motivo.trim()} onClick={() => rechazarCert(revisando)}><XCircle size={15}/>Rechazar</button>
              <button className={btnPrim + " !bg-emerald-700 hover:!bg-emerald-800"} onClick={() => validarCert(revisando)}><ShieldCheck size={15}/>Validar y sumar horas</button>
            </div>
          </div>
        </Modal>
      )}

      {gradoRev && (
        <Modal titulo="Revisar documento académico" onClose={() => setGradoRev(null)} ancho="max-w-2xl">
          {gradoRev.coleccion === "grados" ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[["programa","Programa"],["institucion","Institución"],["campus","Campus"],["pais","País"],["inicio","Inicio"],["fin","Terminación"],["titulacion","Año de titulación"],["cedula","Cédula profesional"],["numTitulo","Número de título"]].map(([k,l]) => (
                <Campo key={k} label={l}><input className={inputCls} value={gradoRev.item.datos?.[k] ?? ""} onChange={e => setGradoRev(g => ({ ...g, item: { ...g.item, datos: { ...g.item.datos, [k]: e.target.value || null } } }))} /></Campo>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">{gradoRev.item.tipo}: <b>{gradoRev.item.nombre}</b> · {gradoRev.item.institucion || "—"} · {fmtFecha(gradoRev.item.fecha)} {gradoRev.item.duracion ? `· ${gradoRev.item.duracion}` : ""}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2 justify-end items-center">
            <input className={inputCls + " !mt-0 !w-56"} placeholder="Motivo del rechazo…" value={motivo} onChange={e => setMotivo(e.target.value)} />
            <button className={btnSec + " !text-rose-600 !border-rose-300"} disabled={!motivo.trim()} onClick={() => resolverGrado(gradoRev.item, gradoRev.coleccion, false)}>Rechazar</button>
            <button className={btnPrim + " !bg-emerald-700 hover:!bg-emerald-800"} onClick={() => resolverGrado(gradoRev.item, gradoRev.coleccion, true)}>Validar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   GESTIÓN DE DOCENTES (administrador)
   ================================================================ */

function Docentes({ db, mutar, irA }) {
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [errAlta, setErrAlta] = useState("");
  const docentes = db.users.filter(u => u.rol === "docente");
  const guardar = async () => {
    const e = editando;
    if (!e.nombre.trim() || !e.email.trim()) return;
    setGuardando(true); setErrAlta("");
    try {
      if (e.id) {
        const original = db.users.find(x => x.id === e.id);
        if (e.email.trim() !== original.email) {
          await cambiarEmailDocente({ id: e.id, email: e.email.trim() });
        }
        if (e.nuevaPass) {
          await restablecerPassword({ id: e.id, password: e.nuevaPass });
        }
        await mutar(d => {
          const u = d.users.find(x => x.id === e.id);
          Object.assign(u, { nombre: e.nombre, email: e.email.trim(), area: e.area, asignaturas: e.asignaturas });
        });
      } else {
        // Crea la cuenta real (correo + contraseña) mediante la función Edge
        const creado = await crearDocente({
          email: e.email.trim(), password: e.nuevaPass || "docente123",
          nombre: e.nombre, area: e.area || "", asignaturas: e.asignaturas || "",
        });
        await mutar(d => {
          const u = d.users.find(x => x.id === creado.id);
          if (u) Object.assign(u, { nombre: e.nombre, area: e.area || "", asignaturas: e.asignaturas || "", creadoEn: ahora() });
          else d.users.push({ id: creado.id, nombre: e.nombre, email: e.email.trim(), rol: "docente", area: e.area || "", asignaturas: e.asignaturas || "", activo: true, creadoEn: ahora() });
          registrarActividad(d, `Se dio de alta al docente ${e.nombre}.`);
        });
      }
      setEditando(null);
    } catch (err) {
      setErrAlta(err.message);
    }
    setGuardando(false);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Docentes</h2>
        <button className={btnPrim} onClick={() => setEditando({ nombre: "", email: "", area: "", asignaturas: "", nuevaPass: "" })}><Plus size={15}/>Agregar docente</button>
      </div>
      <Card className="p-4">
        {docentes.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Todavía no hay docentes. Agrega al primero: la contraseña inicial por defecto es <code>docente123</code>.</p>}
        {docentes.map(u => {
          const exp = completitudExpediente(db, u.id);
          return (
            <div key={u.id} className={`flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0 ${!u.activo ? "opacity-50" : ""}`}>
              <div className="w-9 h-9 rounded-full bg-[#1a2340] text-white flex items-center justify-center text-sm font-bold shrink-0">{u.nombre.split(" ").map(p=>p[0]).slice(0,2).join("")}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{u.nombre} {!u.activo && <span className="text-[10px] font-bold text-rose-500">DESACTIVADO</span>}</div>
                <div className="text-xs text-slate-500 truncate">{u.email} · {u.area || "Sin área"} · Expediente {exp.pct}%</div>
              </div>
              <button className={btnSec + " !px-3 !py-1.5"} onClick={() => irA("expediente_docente", u.id)}><FolderOpen size={14}/>Expediente</button>
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Editar" onClick={() => setEditando({ ...u, nuevaPass: "" })}><Pencil size={15}/></button>
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title={u.activo ? "Desactivar" : "Reactivar"}
                onClick={() => mutar(d => { const x = d.users.find(y => y.id === u.id); x.activo = !x.activo; })}>
                {u.activo ? <XCircle size={15}/> : <CheckCircle2 size={15}/>}
              </button>
            </div>
          );
        })}
      </Card>
      {editando && (
        <Modal titulo={editando.id ? "Editar docente" : "Agregar docente"} onClose={() => setEditando(null)}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo label="Nombre completo"><input className={inputCls} value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} /></Campo>
            <Campo label="Correo institucional"><input className={inputCls} type="email" value={editando.email} onChange={e => setEditando({ ...editando, email: e.target.value })} /></Campo>
            <Campo label="Área o academia"><input className={inputCls} value={editando.area || ""} onChange={e => setEditando({ ...editando, area: e.target.value })} /></Campo>
            <Campo label="Asignatura(s) que imparte"><input className={inputCls} value={editando.asignaturas || ""} onChange={e => setEditando({ ...editando, asignaturas: e.target.value })} /></Campo>
            <Campo label={editando.id ? "Nueva contraseña (opcional)" : "Contraseña inicial"}><input className={inputCls} value={editando.nuevaPass} onChange={e => setEditando({ ...editando, nuevaPass: e.target.value })} placeholder={editando.id ? "Dejar en blanco para no cambiar" : "docente123"} /></Campo>
          </div>
          {errAlta && <p className="text-sm text-rose-600 mt-3 flex items-center gap-1.5"><AlertTriangle size={14} />{errAlta}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
            <button className={btnPrim} disabled={guardando} onClick={guardar}>
              {guardando && <Loader2 size={14} className="animate-spin" />}Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   PERFIL ACADÉMICO DEL DOCENTE (expediente)
   ================================================================ */

function PerfilAcademico({ db, user, docenteId, mutar, editable }) {
  const docente = db.users.find(u => u.id === docenteId);
  const [subiendo, setSubiendo] = useState(null); // { nivel } o { comp:true }
  const [form, setForm] = useState(null);
  const [procesandoIA, setProcesandoIA] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef();
  const exp = completitudExpediente(db, docenteId);
  const gradoDe = (nivel) => db.grados.find(g => g.docenteId === docenteId && g.nivel === nivel);
  const misComp = db.comp.filter(c => c.docenteId === docenteId);

  const cargarDoc = async (file) => {
    if (!file) return;
    const permitidos = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!permitidos.includes(file.type)) { setErr("Formatos permitidos: PDF, JPG, JPEG o PNG."); return; }
    setErr(""); setProcesandoIA(true);
    try {
      const base64 = await leerComoBase64(file);
      const id = uid();
      const guardado = await guardarArchivo(id, base64, file.type, file.name);
      let datos = {}, fallo = false;
      try { datos = await extraerConIA({ base64, mime: file.type === "image/jpg" ? "image/jpeg" : file.type, tipo: "titulo" }); }
      catch { fallo = true; }
      if (subiendo.comp) {
        setForm({ id, comp: true, archivoGuardado: guardado.guardado, archivoNombre: file.name, tipo: "Diplomado",
          nombre: datos.programa || "", institucion: datos.institucion || "", fecha: datos.fecha_expedicion || "", duracion: "" , iaFallo: fallo });
      } else {
        setForm({ id, nivel: subiendo.nivel, archivoGuardado: guardado.guardado, archivoNombre: file.name, iaFallo: fallo,
          datos: { programa: datos.programa ?? null, institucion: datos.institucion ?? null, campus: datos.campus ?? null,
            pais: datos.pais ?? null, inicio: datos.fecha_terminacion ? null : null, fin: datos.fecha_terminacion ?? null,
            titulacion: (datos.fecha_expedicion || "").slice(0, 4) || null, cedula: datos.cedula ?? null, numTitulo: datos.num_titulo ?? null },
          detectados: Object.entries(datos).filter(([_, v]) => v !== null && v !== "").map(([k]) => k) });
      }
    } catch (e) { setErr("No se pudo procesar el documento: " + e.message); }
    setProcesandoIA(false);
  };

  const enviarGrado = async () => {
    await mutar(d => {
      d.grados = d.grados.filter(g => !(g.docenteId === docenteId && g.nivel === form.nivel)); // reemplaza registro previo
      d.grados.push({ id: form.id, docenteId, nivel: form.nivel, datos: form.datos, archivoGuardado: form.archivoGuardado,
        archivoNombre: form.archivoNombre, estado: "pendiente", cargadoEn: ahora(), motivoRechazo: null });
      d.users.filter(u => u.rol === "admin").forEach(a => notificar(d, a.id, `🎓 ${docente.nombre} cargó su ${form.nivel} para validación.`));
      registrarActividad(d, `${docente.nombre} registró su ${form.nivel}.`);
    });
    setForm(null); setSubiendo(null);
  };

  const enviarComp = async () => {
    if (!form.nombre.trim()) { setErr("Escribe el nombre del estudio."); return; }
    await mutar(d => {
      d.comp.push({ id: form.id, docenteId, tipo: form.tipo, nombre: form.nombre, institucion: form.institucion,
        fecha: form.fecha || null, duracion: form.duracion || null, archivoGuardado: form.archivoGuardado,
        archivoNombre: form.archivoNombre, estado: "pendiente", cargadoEn: ahora() });
      d.users.filter(u => u.rol === "admin").forEach(a => notificar(d, a.id, `📜 ${docente.nombre} registró formación complementaria: ${form.nombre}.`));
    });
    setForm(null); setSubiendo(null); setErr("");
  };

  const iconoEstado = (g) => {
    if (!g) return <span className="text-slate-300">○</span>;
    if (g.estado === "validado") return <span className="text-emerald-600">✓</span>;
    if (g.estado === "rechazado") return <span className="text-rose-500">✕</span>;
    return <span className="text-amber-500">◐</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Mi perfil académico</h2>
        <div className="text-sm font-semibold px-3 py-1.5 rounded-xl bg-white border border-slate-200">
          Expediente docente: <span className={exp.pct === 100 ? "text-emerald-600" : "text-[#E8871E]"}>{exp.pct}%</span>
        </div>
      </div>

      {/* Perfil profesional */}
      <Card className="p-5">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><User size={16}/>Perfil profesional</h3>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><span className="text-slate-400 text-xs block">Nombre</span>{docente.nombre}</div>
          <div><span className="text-slate-400 text-xs block">Correo institucional</span>{docente.email}</div>
          <div><span className="text-slate-400 text-xs block">Área / academia</span>{docente.area || "—"}</div>
          <div><span className="text-slate-400 text-xs block">Asignaturas</span>{docente.asignaturas || "—"}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {exp.partes.map(p => (
            <span key={p.nombre} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
              {p.ok ? "✓" : "—"} {p.nombre}{!p.cuenta && <span className="font-normal opacity-70"> · no cuenta</span>}
            </span>
          ))}
        </div>
      </Card>

      {/* Línea de formación */}
      <Card className="p-5">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><GraduationCap size={16}/>Formación académica</h3>
        <div className="space-y-1">
          {NIVELES.map((nivel, i) => {
            const g = gradoDe(nivel);
            return (
              <React.Fragment key={nivel}>
                {i > 0 && <div className="ml-3.5 h-4 border-l-2 border-slate-200" />}
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full border-2 border-slate-300 flex items-center justify-center text-sm font-bold bg-white shrink-0">{iconoEstado(g)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm">{nivel}</span>
                      {g && <Badge estado={g.estado} mapa={ESTADOS_GRADO} />}
                      {!g && <span className="text-xs text-slate-400">Sin registrar</span>}
                    </div>
                    {g && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {g.datos?.programa || "Programa por confirmar"} · {g.datos?.institucion || "—"} {g.datos?.titulacion ? `· ${g.datos.titulacion}` : ""}
                        {g.estado === "rechazado" && g.motivoRechazo && <span className="block text-rose-600">Motivo del rechazo: {g.motivoRechazo}</span>}
                      </div>
                    )}
                  </div>
                  {editable && (!g || g.estado === "rechazado") && (
                    <button className={btnSec + " !px-3 !py-1.5 shrink-0"} onClick={() => { setSubiendo({ nivel }); setForm(null); setErr(""); }}>
                      <Upload size={13}/>{g ? "Volver a subir" : "Subir documento"}
                    </button>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Formación complementaria */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm flex items-center gap-2"><Star size={16}/>Formación complementaria</h3>
          {editable && <button className={btnSec + " !px-3 !py-1.5"} onClick={() => { setSubiendo({ comp: true }); setForm(null); setErr(""); }}><Plus size={13}/>Agregar</button>}
        </div>
        <p className="text-xs text-slate-400 mb-2">Especialidades, diplomados y certificaciones. No se contabilizan como grados académicos.</p>
        {misComp.length === 0 && <p className="text-sm text-slate-400 py-2">Sin registros todavía.</p>}
        {misComp.map(c => (
          <div key={c.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0 text-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase w-24 shrink-0">{c.tipo}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{c.nombre}</div>
              <div className="text-xs text-slate-500">{c.institucion || "—"} · {fmtFecha(c.fecha)} {c.duracion ? `· ${c.duracion}` : ""}</div>
            </div>
            <Badge estado={c.estado} mapa={ESTADOS_GRADO} />
            <VerArchivoBtn certId={c.id} guardado={c.archivoGuardado} />
          </div>
        ))}
      </Card>

      {/* Modal de carga */}
      {subiendo && (
        <Modal titulo={subiendo.comp ? "Agregar formación complementaria" : `Subir documento de ${subiendo.nivel}`} onClose={() => { setSubiendo(null); setForm(null); }}>
          {!form && (
            <div className="text-center py-4">
              <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={e => cargarDoc(e.target.files[0])} />
              {procesandoIA
                ? <div className="py-6"><Loader2 size={28} className="mx-auto animate-spin text-[#E8871E] mb-2" /><p className="text-sm">La IA está leyendo el documento…</p></div>
                : <>
                    <p className="text-sm text-slate-600 mb-3">{subiendo.comp ? "Sube el documento acreditativo (opcional pero recomendado)." : `Sube el ${subiendo.nivel === "Licenciatura" ? "título" : "grado"} en PDF, JPG, JPEG o PNG. La IA extraerá los datos para que los revises.`}</p>
                    <button className={btnPrim} onClick={() => inputRef.current.click()}><Upload size={15}/>Elegir archivo</button>
                    {subiendo.comp && <button className={btnSec + " ml-2"} onClick={() => setForm({ id: uid(), comp: true, tipo: "Diplomado", nombre: "", institucion: "", fecha: "", duracion: "", archivoGuardado: false })}>Capturar sin documento</button>}
                  </>}
              {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
            </div>
          )}
          {form && !form.comp && (
            <div className="space-y-3">
              {form.iaFallo ? <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">La IA no pudo leer este documento; captura los datos manualmente.</p>
                : <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2">Revisa los datos detectados. Los campos vacíos no aparecieron en el documento: la IA no inventa información.</p>}
              <div className="grid sm:grid-cols-2 gap-3">
                {[["programa","Nombre del programa"],["institucion","Institución educativa"],["campus","Campus (si aplica)"],["pais","País"],["inicio","Año/fecha de inicio"],["fin","Año/fecha de terminación"],["titulacion","Año de titulación / grado"],["cedula","Cédula profesional (si existe)"],["numTitulo","Número de título (si aparece)"]].map(([k,l]) => (
                  <Campo key={k} label={l}><input className={inputCls} value={form.datos[k] ?? ""} onChange={e => setForm(f => ({ ...f, datos: { ...f.datos, [k]: e.target.value || null } }))} /></Campo>
                ))}
              </div>
              <div className="flex justify-end gap-2"><button className={btnSec} onClick={() => setForm(null)}>Atrás</button>
                <button className={btnPrim} onClick={enviarGrado}>Enviar a validación</button></div>
            </div>
          )}
          {form && form.comp && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo label="Tipo"><select className={inputCls} value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                  {["Especialidad","Diplomado","Certificación","Otro estudio"].map(t => <option key={t}>{t}</option>)}</select></Campo>
                <Campo label="Nombre"><input className={inputCls} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></Campo>
                <Campo label="Institución"><input className={inputCls} value={form.institucion} onChange={e => setForm({ ...form, institucion: e.target.value })} /></Campo>
                <Campo label="Fecha"><input className={inputCls} type="date" value={form.fecha || ""} onChange={e => setForm({ ...form, fecha: e.target.value })} /></Campo>
                <Campo label="Duración (si aplica)"><input className={inputCls} value={form.duracion || ""} onChange={e => setForm({ ...form, duracion: e.target.value })} placeholder="p. ej. 120 horas" /></Campo>
              </div>
              {err && <p className="text-sm text-rose-600">{err}</p>}
              <div className="flex justify-end gap-2"><button className={btnSec} onClick={() => setForm(null)}>Atrás</button>
                <button className={btnPrim} onClick={enviarComp}>Enviar a validación</button></div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ================================================================
   EXPEDIENTE INTEGRAL (vista del administrador)
   ================================================================ */

function ExpedienteIntegral({ db, docenteId, mutar, user, volver }) {
  const [tab, setTab] = useState("academica");
  const d = db.users.find(u => u.id === docenteId);
  if (!d) return <p>Docente no encontrado.</p>;
  const ciclo = db.config.cicloActual;
  const h = horasValidadas(db, docenteId, ciclo);
  const meta = metaDe(db, docenteId);
  const pos = rankingDe(db, ciclo).findIndex(r => r.id === docenteId) + 1;
  const exp = completitudExpediente(db, docenteId);
  const certs = db.certs.filter(c => c.docenteId === docenteId);
  return (
    <div className="space-y-4">
      <button className="text-sm text-indigo-600 font-semibold" onClick={volver}>← Volver a docentes</button>
      <Card className="p-5 flex flex-wrap items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[#1a2340] text-white flex items-center justify-center text-xl font-bold">{d.nombre.split(" ").map(p=>p[0]).slice(0,2).join("")}</div>
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-lg font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>{d.nombre}</h2>
          <p className="text-sm text-slate-500">{d.area || "Sin área"} · {d.asignaturas || "Sin asignaturas"} · {d.email}</p>
        </div>
        <div className="text-center px-4"><div className="text-xl font-bold">{exp.pct}%</div><div className="text-[11px] text-slate-400">Expediente</div></div>
        <div className="text-center px-4"><div className="text-xl font-bold">{h}/{meta}</div><div className="text-[11px] text-slate-400">Horas ciclo</div></div>
        <div className="text-center px-4"><div className="text-xl font-bold">{pos > 0 ? "#" + pos : "—"}</div><div className="text-[11px] text-slate-400">Ranking</div></div>
      </Card>
      <div className="flex gap-2">
        <button onClick={() => setTab("academica")} className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold ${tab === "academica" ? "bg-[#1a2340] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Formación académica</button>
        <button onClick={() => setTab("capacitacion")} className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold ${tab === "capacitacion" ? "bg-[#1a2340] text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Capacitación docente</button>
      </div>
      {tab === "academica" && <PerfilAcademico db={db} user={user} docenteId={docenteId} mutar={mutar} editable={false} />}
      {tab === "capacitacion" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icono={BookOpen} label="Cursos validados" valor={certs.filter(c => c.estado === "validada").length} />
            <Stat icono={Clock} label="Horas del ciclo" valor={h} />
            <Stat icono={FileCheck} label="Horas pendientes" valor={horasPendientes(db, docenteId, ciclo)} />
            <Stat icono={Award} label="Insignias del ciclo" valor={db.logros.filter(l => l.docenteId === docenteId && l.clave.endsWith("@" + ciclo)).length} />
          </div>
          <Card className="p-5"><Progreso actual={h} meta={meta} semaforo={semaforoDe(db, meta ? Math.round(100*h/meta) : 0)} /></Card>
          <Card className="p-4"><h3 className="font-bold text-sm mb-2">Constancias</h3><TablaCursos certs={certs} db={db} /></Card>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   REPORTES
   ================================================================ */

function Reportes({ db }) {
  const [ciclo, setCiclo] = useState(db.config.cicloActual);
  const docentes = db.users.filter(u => u.rol === "docente");
  const nombreDe = (id) => docentes.find(u => u.id === id)?.nombre || "—";
  const certsC = certsDeCiclo(db.certs, ciclo).filter(c => c.estado === "validada");

  const filasGeneral = () => [["Docente","Curso","Institución","Horas","Categoría","Fecha término","Folio","Ciclo","Validado por","Fecha de validación"],
    ...certsC.map(c => [nombreDe(c.docenteId), c.datos.curso, c.datos.institucion, c.datos.horas, c.datos.categoria, c.datos.fecha_termino, c.datos.folio, c.ciclo, c.validadoPor, c.validadoEn?.slice(0,10)])];

  const filasResumen = () => [["Docente","Área","Cursos validados","Horas validadas","Meta","% cumplimiento","Estado"],
    ...docentes.map(d => { const h = horasValidadas(db, d.id, ciclo); const m = metaDe(db, d.id);
      const pct = m ? Math.round(100*h/m) : 0;
      return [d.nombre, d.area, certsC.filter(c => c.docenteId === d.id).length, h, m, pct + "%", pct >= 100 ? "Meta alcanzada" : pct >= db.config.semAmarillo ? "En proceso" : "Bajo cumplimiento"]; })];

  const filasCategoria = () => [["Categoría","Cursos","Horas totales"],
    ...CATEGORIAS.map(cat => { const cs = certsC.filter(c => c.datos.categoria === cat);
      return [cat, cs.length, cs.reduce((s, c) => s + (Number(c.datos.horas)||0), 0)]; }).filter(f => f[1] > 0)];

  const filasRanking = () => [["Posición","Docente","Horas validadas"],
    ...rankingDe(db, ciclo).map((r, i) => [i + 1, r.nombre, r.horas])];

  const filasMeta = (cumple) => [["Docente","Área","Horas","Meta","% cumplimiento"],
    ...docentes.map(d => { const h = horasValidadas(db, d.id, ciclo); const m = metaDe(db, d.id); return { d, h, m, pct: m ? Math.round(100*h/m) : 0 }; })
      .filter(x => cumple ? x.pct >= 100 : x.pct < 100)
      .map(x => [x.d.nombre, x.d.area, x.h, x.m, x.pct + "%"])];

  const aHtml = (filas) => `<table><tr>${filas[0].map(h => `<th>${h ?? ""}</th>`).join("")}</tr>${filas.slice(1).map(f => `<tr>${f.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("")}</table>`;

  const reportes = [
    { nombre: "Reporte general de capacitación", filas: filasGeneral },
    { nombre: "Resumen individual por docente", filas: filasResumen },
    { nombre: "Reporte por categoría", filas: filasCategoria },
    { nombre: "Ranking de capacitación", filas: filasRanking },
    { nombre: "Docentes que ya cumplieron la meta", filas: () => filasMeta(true) },
    { nombre: "Docentes que aún no cumplen la meta", filas: () => filasMeta(false) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Reportes</h2>
        <select className={inputCls + " !mt-0 !w-auto"} value={ciclo} onChange={e => setCiclo(e.target.value)}>
          {ciclosDisponibles(db).map(c => <option key={c} value={c}>Ciclo {c}</option>)}
          <option value="historico">Histórico</option>
        </select>
      </div>
      <p className="text-sm text-slate-500">Los reportes incluyen únicamente constancias validadas. Excel abre directamente los archivos CSV exportados; el botón PDF abre la vista de impresión para guardar como PDF.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {reportes.map(r => (
          <Card key={r.nombre} className="p-4 flex items-center gap-3">
            <FileText size={20} className="text-slate-400 shrink-0" />
            <span className="flex-1 text-sm font-medium">{r.nombre}</span>
            <button className={btnSec + " !px-3 !py-1.5"} onClick={() => descargarCSV(r.nombre.replace(/\s+/g, "_") + `_${ciclo}.csv`, r.filas())}><Download size={13}/>CSV / Excel</button>
            <button className={btnSec + " !px-3 !py-1.5"} onClick={() => imprimirReporte(`${r.nombre} · ${ciclo === "historico" ? "Histórico" : "Ciclo " + ciclo}`, aHtml(r.filas()))}>PDF</button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   PERFIL ACADÉMICO INSTITUCIONAL (administrador)
   ================================================================ */

function PerfilInstitucional({ db }) {
  const [area, setArea] = useState("todas");
  const docentes = db.users.filter(u => u.rol === "docente" && u.activo)
    .filter(d => area === "todas" || d.area === area);
  const areas = [...new Set(db.users.filter(u => u.rol === "docente").map(u => u.area).filter(Boolean))];
  // Grado máximo validado de cada docente: se cuenta una sola vez, en su
  // nivel más alto (quien tiene doctorado no suma también en licenciatura).
  const gradoMaximo = (docenteId) => {
    for (const nivel of [...NIVELES].reverse()) {
      if (db.grados.some(g => g.docenteId === docenteId && g.nivel === nivel && g.estado === "validado")) return nivel;
    }
    return "Sin grado validado";
  };
  const maximos = docentes.map(d => gradoMaximo(d.id));
  const con = (nivel) => maximos.filter(m => m === nivel).length;
  const conComp = docentes.filter(d => db.comp.some(c => c.docenteId === d.id && c.estado === "validado")).length;
  const completos = docentes.filter(d => completitudExpediente(db, d.id).pct === 100).length;
  const dist = [...NIVELES, "Sin grado validado"]
    .map(n => ({ name: n, value: maximos.filter(m => m === n).length }))
    .filter(x => x.value > 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Perfil académico institucional</h2>
        <select className={inputCls + " !mt-0 !w-auto"} value={area} onChange={e => setArea(e.target.value)}>
          <option value="todas">Todas las áreas</option>{areas.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icono={GraduationCap} label="Máximo grado: licenciatura" valor={con("Licenciatura")} />
        <Stat icono={GraduationCap} label="Máximo grado: maestría" valor={con("Maestría")} />
        <Stat icono={GraduationCap} label="Máximo grado: doctorado" valor={con("Doctorado")} />
        <Stat icono={Star} label="Con formación complementaria" valor={conComp} />
        <Stat icono={FolderOpen} label="Expedientes completos" valor={docentes.length ? Math.round(100 * completos / docentes.length) + "%" : "—"} sub={`${completos} de ${docentes.length}`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-1">Distribución por grado máximo</h3>
          <p className="text-[11px] text-slate-400 mb-2">Cada docente se cuenta una sola vez, en su nivel de estudios más alto.</p>
          {dist.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">Aún no hay docentes registrados.</p> :
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={dist} dataKey="value" nameKey="name" outerRadius={80} label>
              {dist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}</Pie><Tooltip /><Legend wrapperStyle={{fontSize:11}}/></PieChart>
          </ResponsiveContainer>}
        </Card>
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-2">Completitud de expedientes</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {docentes.map(d => {
              const e = completitudExpediente(db, d.id);
              return (
                <div key={d.id} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate">{d.nombre}</span>
                  <div className="w-28 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-[#1a2340]" style={{ width: e.pct + "%" }} /></div>
                  <span className="w-10 text-right text-xs font-bold">{e.pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================
   ACTIVIDAD RECIENTE
   ================================================================ */

function ActividadReciente({ db }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Actividad reciente</h2>
      <Card className="p-4">
        {db.activity.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">La actividad de la escuela se registrará aquí conforme el sistema se use.</p>}
        {db.activity.map(a => (
          <div key={a.id} className="flex gap-3 py-2.5 border-b border-slate-100 last:border-0">
            <Activity size={15} className="text-[#E8871E] mt-0.5 shrink-0" />
            <div className="text-sm text-slate-700">{a.texto}
              <span className="block text-[11px] text-slate-400">{new Date(a.fecha).toLocaleString("es-MX")}</span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ================================================================
   ADMINISTRACIÓN Y CONFIGURACIÓN
   ================================================================ */

function Administracion({ db, user, mutar }) {
  const cfg = db.config;
  const [meta, setMeta] = useState(cfg.metaAnual);
  const [verde, setVerde] = useState(cfg.semVerde);
  const [amarillo, setAmarillo] = useState(cfg.semAmarillo);
  const [nuevoCiclo, setNuevoCiclo] = useState("");
  const [msg, setMsg] = useState("");
  const docentes = db.users.filter(u => u.rol === "docente");

  const guardarGeneral = () => mutar(d => {
    d.config.metaAnual = Number(meta) || 0;
    d.config.semVerde = Number(verde) || 100;
    d.config.semAmarillo = Number(amarillo) || 60;
  }).then(() => setMsg("Configuración guardada."));

  const agregarCiclo = () => {
    if (!/^\d{4}-\d{4}$/.test(nuevoCiclo.trim())) { setMsg("Escribe el ciclo con formato 2026-2027."); return; }
    mutar(d => { if (!d.config.ciclos.includes(nuevoCiclo.trim())) d.config.ciclos.push(nuevoCiclo.trim()); });
    setNuevoCiclo("");
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-xl font-bold" style={{fontFamily:"'Archivo', sans-serif"}}>Administración</h2>
      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{msg}</p>}

      <Card className="p-5 space-y-3">
        <h3 className="font-bold text-sm">Metas y semáforo</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo label="Meta anual de horas (general)"><input className={inputCls} type="number" value={meta} onChange={e => setMeta(e.target.value)} /></Campo>
          <Campo label="Verde desde (% de la meta)"><input className={inputCls} type="number" value={verde} onChange={e => setVerde(e.target.value)} /></Campo>
          <Campo label="Amarillo desde (% de la meta)"><input className={inputCls} type="number" value={amarillo} onChange={e => setAmarillo(e.target.value)} /></Campo>
        </div>
        <p className="text-xs text-slate-400">Debajo del umbral amarillo, el docente aparece en rojo (bajo cumplimiento).</p>
        <button className={btnPrim} onClick={guardarGeneral}>Guardar</button>
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="font-bold text-sm">Metas individuales por docente (opcional)</h3>
        {docentes.length === 0 && <p className="text-sm text-slate-400">Agrega docentes para configurar metas individuales.</p>}
        {docentes.map(d => (
          <div key={d.id} className="flex items-center gap-3 text-sm">
            <span className="flex-1 truncate">{d.nombre}</span>
            <input className={inputCls + " !mt-0 !w-24"} type="number" placeholder={String(cfg.metaAnual)}
              value={cfg.metasPorDocente[d.id] ?? ""}
              onChange={e => mutar(x => { const v = e.target.value; if (v === "") delete x.config.metasPorDocente[d.id]; else x.config.metasPorDocente[d.id] = Number(v); })} />
            <span className="text-xs text-slate-400">horas</span>
          </div>
        ))}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-bold text-sm">Ciclos escolares</h3>
        <div className="flex flex-wrap gap-2 items-center">
          {cfg.ciclos.map(c => (
            <button key={c} onClick={() => mutar(d => { d.config.cicloActual = c; })}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold border ${cfg.cicloActual === c ? "bg-[#1a2340] text-white border-[#1a2340]" : "bg-white border-slate-300 text-slate-600"}`}>
              {c}{cfg.cicloActual === c && " · actual"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls + " !mt-0 !w-40"} placeholder="2026-2027" value={nuevoCiclo} onChange={e => setNuevoCiclo(e.target.value)} />
          <button className={btnSec} onClick={agregarCiclo}><Plus size={14}/>Agregar ciclo</button>
        </div>
        <p className="text-xs text-slate-400">
          El ciclo escolar corre de <b>agosto a julio</b>. Cada constancia se registra
          automáticamente en el ciclo que le corresponde según la fecha del curso, sin importar
          cuándo se suba al sistema. El ciclo marcado como actual es el que se usa en los
          tableros y el ranking.
        </p>
        {cicloDeFecha() !== cfg.cicloActual && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <AlertTriangle size={14} />
            Por la fecha de hoy, el ciclo en curso es <b>{cicloDeFecha()}</b>.
            <button className="underline font-semibold" onClick={() => mutar(d => {
              if (!d.config.ciclos.includes(cicloDeFecha())) d.config.ciclos.push(cicloDeFecha());
              d.config.cicloActual = cicloDeFecha();
            })}>Cambiar al ciclo {cicloDeFecha()}</button>
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="font-bold text-sm">Visibilidad y reglas</h3>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={cfg.rankingPublico} onChange={e => mutar(d => { d.config.rankingPublico = e.target.checked; })} />
          Mostrar el ranking públicamente a los docentes
        </label>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={cfg.perfilObligatorio} onChange={e => mutar(d => { d.config.perfilObligatorio = e.target.checked; })} />
          Perfil académico obligatorio antes de registrar capacitaciones
        </label>
      </Card>

      <MiCuenta user={user} soloTarjeta />
    </div>
  );
}
