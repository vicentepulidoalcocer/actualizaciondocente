/* ================================================================
   TEMAS CONMEMORATIVOS
   ----------------------------------------------------------------
   Cambian solo el "marco" del portal: la barra superior, el botón
   activo del menú, una franja de bienvenida y, en algunas fechas,
   un efecto ligero al entrar (pétalos, nieve, corazones...).

   No tocan datos, permisos ni pantallas de trabajo: el escáner QR,
   las tablas y los reportes conservan sus colores de siempre.

   La elección se guarda en la configuración general del portal
   (db.config.tema), la misma donde vive el ciclo escolar actual,
   así que no requiere SQL.
     modo: "auto"    → cada tema aparece solo en sus fechas
           "fijo"    → se muestra el tema elegido, sin importar la fecha
           "ninguno" → portal con su apariencia normal
   ================================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { X, Sparkles, Palette } from "lucide-react";

/* Fechas en formato "MM-DD". Si "desde" es mayor que "hasta", el
   periodo cruza el año (Navidad: del 8 de diciembre al 6 de enero).
   Los temas "ajustables" toman sus fechas de la configuración porque
   cambian cada ciclo; sus valores aquí son solo los iniciales. */
export const TEMAS = [
  {
    id: "aniversario", nombre: "Aniversario del CBTA 291", ajustable: true,
    desde: "", hasta: "",                       // sin fecha hasta que se configure
    fondo: "linear-gradient(90deg,#14532d,#166534 55%,#a16207)",
    franja: "linear-gradient(90deg,#facc15,#16a34a,#facc15)",
    adorno: "🎂", mensaje: "¡Feliz aniversario, CBTA No. 291! Gracias a quienes hacen grande a nuestra escuela.",
    lluvia: ["✨", "🎉"],
  },
  {
    id: "inicio_ciclo", nombre: "Inicio de ciclo escolar", ajustable: true,
    desde: "08-24", hasta: "08-30",
    fondo: "linear-gradient(90deg,#14532d,#15803d)",
    franja: "linear-gradient(90deg,#facc15,#22c55e,#facc15)",
    adorno: "📚", mensaje: "¡Bienvenidas y bienvenidos al nuevo ciclo escolar! Mucho éxito en este inicio.",
    lluvia: null,
  },
  {
    id: "patrias", nombre: "Fiestas Patrias",
    desde: "09-01", hasta: "09-16",
    fondo: "linear-gradient(90deg,#064e3b,#065f46)",
    franja: "linear-gradient(90deg,#16a34a 0 33%,#ffffff 33% 66%,#dc2626 66% 100%)",
    adorno: "🎉", mensaje: "¡Viva México! Celebramos el Mes de la Patria.",
    lluvia: null,
  },
  {
    id: "quintana_roo", nombre: "Aniversario de Quintana Roo",
    desde: "10-08", hasta: "10-08",
    fondo: "linear-gradient(90deg,#0f766e,#0e7490)",
    franja: "linear-gradient(90deg,#38bdf8,#fde68a,#38bdf8)",
    adorno: "🌴", mensaje: "8 de octubre · Aniversario de la creación del Estado de Quintana Roo.",
    lluvia: null,
  },
  {
    id: "muertos", nombre: "Día de Muertos",
    desde: "10-28", hasta: "11-02",
    fondo: "linear-gradient(90deg,#3b0764,#581c87 60%,#9a3412)",
    franja: "linear-gradient(90deg,#f97316,#facc15,#ec4899,#a855f7,#f97316)",
    adorno: "🌼", mensaje: "Día de Muertos · Honramos la memoria de quienes nos acompañaron.",
    lluvia: ["🌼", "🧡", "🌼"],
  },
  {
    id: "navidad", nombre: "Navidad y Año Nuevo",
    desde: "12-08", hasta: "01-06",
    fondo: "linear-gradient(90deg,#14532d,#166534 55%,#991b1b)",
    franja: "linear-gradient(90deg,#dc2626,#ffffff,#16a34a,#ffffff,#dc2626)",
    adorno: "🎄", mensaje: "¡Felices fiestas y un próspero Año Nuevo les desea el CBTA No. 291!",
    lluvia: ["❄️", "❄️", "⭐"],
  },
  {
    id: "amistad", nombre: "Día del Amor y la Amistad",
    desde: "02-10", hasta: "02-14",
    fondo: "linear-gradient(90deg,#831843,#be185d)",
    franja: "linear-gradient(90deg,#f9a8d4,#ffffff,#f43f5e,#ffffff,#f9a8d4)",
    adorno: "💖", mensaje: "¡Feliz Día del Amor y la Amistad!",
    lluvia: ["💗", "💖", "💌"],
  },
  {
    id: "bandera", nombre: "Día de la Bandera",
    desde: "02-24", hasta: "02-24",
    fondo: "linear-gradient(90deg,#064e3b,#065f46)",
    franja: "linear-gradient(90deg,#16a34a 0 33%,#ffffff 33% 66%,#dc2626 66% 100%)",
    adorno: "🦅", mensaje: "24 de febrero · Día de la Bandera de México.",
    lluvia: null,
  },
  {
    id: "mujer", nombre: "Día Internacional de la Mujer",
    desde: "03-08", hasta: "03-08",
    fondo: "linear-gradient(90deg,#3b0764,#6b21a8)",
    franja: "linear-gradient(90deg,#a855f7,#e9d5ff,#a855f7)",
    adorno: "💜", mensaje: "8 de marzo · Día Internacional de la Mujer. Por la igualdad, hoy y siempre.",
    lluvia: null,
  },
  {
    id: "maestro", nombre: "Día del Maestro",
    desde: "05-13", hasta: "05-15",
    fondo: "linear-gradient(90deg,#1e3a8a,#1e40af 60%,#a16207)",
    franja: "linear-gradient(90deg,#fbbf24,#ffffff,#fbbf24)",
    adorno: "🍎", mensaje: "¡Feliz Día del Maestro! Gracias por su entrega diaria con nuestras y nuestros estudiantes.",
    lluvia: ["✨", "⭐", "🍎"],
  },
  {
    id: "estudiante", nombre: "Día del Estudiante",
    desde: "05-22", hasta: "05-23",
    fondo: "linear-gradient(90deg,#155e75,#0e7490)",
    franja: "linear-gradient(90deg,#facc15,#22d3ee,#f472b6,#facc15)",
    adorno: "🎒", mensaje: "¡Feliz Día del Estudiante! Hoy celebramos a nuestras y nuestros jóvenes.",
    lluvia: ["🎉", "✨"],
  },
  {
    id: "graduacion", nombre: "Fin de ciclo y graduación", ajustable: true,
    desde: "07-13", hasta: "07-24",
    fondo: "linear-gradient(90deg,#172554,#1e3a8a 60%,#a16207)",
    franja: "linear-gradient(90deg,#fbbf24,#fde68a,#fbbf24)",
    adorno: "🎓", mensaje: "¡Felicidades, generación! Cerramos un ciclo más con orgullo.",
    lluvia: ["🎓", "✨"],
  },
];

const POR_ID = Object.fromEntries(TEMAS.map(t => [t.id, t]));

/* ---------- Cálculo del tema que toca ---------------------------- */

const mmdd = (d) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const enRango = (hoy, desde, hasta) => {
  if (!desde || !hasta) return false;
  return desde <= hasta ? (hoy >= desde && hoy <= hasta) : (hoy >= desde || hoy <= hasta);
};

/* Fechas efectivas de un tema: las ajustables pueden venir de la
   configuración guardada por la administración. */
export const fechasDe = (tema, cfgTema) => {
  const propias = cfgTema?.fechas?.[tema.id];
  return tema.ajustable && propias ? propias : { desde: tema.desde, hasta: tema.hasta };
};

/* Devuelve el tema activo o null. Si dos coinciden, gana el primero
   de la lista (el aniversario del plantel tiene prioridad). */
export function temaActivo(config, fecha = new Date()) {
  const c = config?.tema || {};
  const modo = c.modo || "auto";
  if (modo === "ninguno") return null;
  if (modo === "fijo") return POR_ID[c.fijo] || null;
  const hoy = mmdd(fecha);
  return TEMAS.find(t => { const f = fechasDe(t, c); return enRango(hoy, f.desde, f.hasta); }) || null;
}

/* Variables de color que usa el marco del portal. Sin tema, quedan
   vacías y todo conserva su color original. */
export const variablesTema = (tema) => tema ? {
  "--fondo-tema": tema.fondo,
  "--color-tema": tema.fondo,
} : {};

/* ---------- Adornos del marco ------------------------------------ */

/* Franja delgada de colores debajo de la barra superior */
export const FranjaTema = ({ tema }) => tema ? (
  <div aria-hidden="true" className="absolute left-0 right-0 bottom-0 h-1" style={{ background: tema.franja }} />
) : null;

/* Adorno junto al logo */
export const AdornoTema = ({ tema }) => tema ? (
  <span aria-hidden="true" title={tema.nombre} className="text-xl leading-none select-none">{tema.adorno}</span>
) : null;

/* ---------- Franja de bienvenida --------------------------------- */
/* Se puede cerrar; queda cerrada hasta que termine ese tema en ese
   año (si se cierra en Navidad, no vuelve a salir esa temporada). */
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin espacio */ } };

export function MensajeTema({ tema }) {
  const temporada = tema ? `tema_cerrado_${tema.id}_${temporadaDe(tema)}` : "";
  const [cerrado, setCerrado] = useState(() => tema ? leer(temporada) === "1" : true);
  useEffect(() => { setCerrado(tema ? leer(temporada) === "1" : true); }, [temporada]);
  if (!tema || cerrado) return null;
  return (
    <div className="mb-4 rounded-2xl text-white shadow-sm overflow-hidden relative" style={{ background: tema.fondo }}>
      <div className="flex items-center gap-3 px-4 py-3 pr-10 min-w-0">
        <span aria-hidden="true" className="text-2xl leading-none shrink-0">{tema.adorno}</span>
        <p className="text-sm font-semibold min-w-0">{tema.mensaje}</p>
      </div>
      <div aria-hidden="true" className="h-1" style={{ background: tema.franja }} />
      <button className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/15" title="Cerrar"
        onClick={() => { guardar(temporada, "1"); setCerrado(true); }}>
        <X size={16} />
      </button>
    </div>
  );
}

/* Año de la temporada: para Navidad, enero cuenta con el diciembre anterior */
const temporadaDe = (tema) => {
  const hoy = new Date();
  const a = hoy.getFullYear();
  return tema.desde && tema.hasta && tema.desde > tema.hasta && mmdd(hoy) <= tema.hasta ? a - 1 : a;
};

/* ---------- Efecto al entrar ------------------------------------- */
/* Unas cuantas figuras caen durante ~7 segundos, una vez por sesión.
   No bloquea clics y no aparece si el equipo pidió reducir animaciones. */
export function LluviaTema({ tema, forzar = 0 }) {
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    if (!tema?.lluvia) return;
    let reducir = false;
    try { reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* */ }
    if (reducir && !forzar) return;
    const clave = `tema_lluvia_${tema.id}`;
    let yaSalio = false;
    try { yaSalio = sessionStorage.getItem(clave) === "1"; } catch { /* */ }
    if (yaSalio && !forzar) return;
    try { sessionStorage.setItem(clave, "1"); } catch { /* */ }
    setActivo(true);
    const t = setTimeout(() => setActivo(false), 9000);
    return () => clearTimeout(t);
  }, [tema?.id, forzar]);

  const piezas = useMemo(() => {
    if (!tema?.lluvia) return [];
    return Array.from({ length: 22 }, (_, i) => ({
      i,
      figura: tema.lluvia[i % tema.lluvia.length],
      left: Math.random() * 100,
      retraso: Math.random() * 3,
      duracion: 4.5 + Math.random() * 3,
      tam: 16 + Math.random() * 14,
      giro: Math.random() > 0.5 ? 1 : -1,
    }));
  }, [tema?.id, forzar]);

  if (!activo || !piezas.length) return null;
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none overflow-hidden z-[70]">
      <style>{`
        @keyframes tema-caer {
          0%   { transform: translate3d(0,-10vh,0) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translate3d(var(--deriva),105vh,0) rotate(var(--giro)); opacity: 0; }
        }
      `}</style>
      {piezas.map(p => (
        <span key={p.i} className="absolute top-0 select-none"
          style={{
            left: `${p.left}%`, fontSize: p.tam,
            animation: `tema-caer ${p.duracion}s linear ${p.retraso}s forwards`,
            opacity: 0,
            "--deriva": `${p.giro * 30}px`, "--giro": `${p.giro * 240}deg`,
          }}>{p.figura}</span>
      ))}
    </div>
  );
}

/* ---------- Tarjeta de configuración (solo administración) ------- */

const fechaLarga = (m) => {
  if (!m) return "sin fecha";
  const [mes, dia] = m.split("-").map(Number);
  return new Date(2000, mes - 1, dia).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
};

export function ConfigTemas({ config, mutar }) {
  const [prueba, setPrueba] = useState(0);
  const c = config?.tema || {};
  const modo = c.modo || "auto";
  const hoyTema = temaActivo(config);
  const autoHoy = temaActivo({ tema: { ...c, modo: "auto" } });
  const anio = new Date().getFullYear();

  const cambiar = (fn) => mutar(d => {
    d.config.tema = { modo: "auto", fijo: "", fechas: {}, ...(d.config.tema || {}) };
    d.config.tema.fechas = d.config.tema.fechas || {};
    fn(d.config.tema);
  });

  const ponerFecha = (id, campo, valor) => cambiar(t => {
    const actual = t.fechas[id] || { desde: POR_ID[id].desde, hasta: POR_ID[id].hasta };
    const nuevo = { ...actual, [campo]: valor ? valor.slice(5) : "" };
    // Si solo se puso una fecha, el tema dura ese día
    if (campo === "desde" && nuevo.desde && !nuevo.hasta) nuevo.hasta = nuevo.desde;
    t.fechas[id] = nuevo;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      {prueba > 0 && <LluviaTema tema={hoyTema} forzar={prueba} />}
      <div>
        <h3 className="font-bold text-sm flex items-center gap-2"><Palette size={16} /> Temas conmemorativos</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Cambian la barra superior, el menú y muestran un mensaje en fechas especiales.
          No afectan datos ni pantallas de trabajo (QR, tablas, reportes).
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-2">
        {[
          ["auto", "Automático", "Cada tema aparece en sus fechas."],
          ["fijo", "Tema fijo", "Muestra el tema que elijas, sin importar la fecha."],
          ["ninguno", "Sin tema", "Apariencia normal (útil en un luto institucional)."],
        ].map(([id, titulo, detalle]) => (
          <button key={id} onClick={() => cambiar(t => { t.modo = id; if (id === "fijo" && !t.fijo) t.fijo = TEMAS[1].id; })}
            className={`text-left rounded-xl border p-3 transition ${modo === id ? "border-[#1a2340] bg-slate-50 ring-2 ring-[#1a2340]/15" : "border-slate-200 hover:bg-slate-50"}`}>
            <div className="text-sm font-semibold">{titulo}{id === "auto" && " (recomendado)"}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{detalle}</div>
          </button>
        ))}
      </div>

      {modo === "fijo" && (
        <label className="block">
          <span className="text-xs font-semibold text-slate-600">Tema que se mostrará</span>
          <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            value={c.fijo || ""} onChange={e => cambiar(t => { t.fijo = e.target.value; })}>
            {TEMAS.map(t => <option key={t.id} value={t.id}>{t.adorno} {t.nombre}</option>)}
          </select>
          <span className="text-[11px] text-amber-700 mt-1 block">
            Recuerda regresar a "Automático" cuando ya no lo necesites.
          </span>
        </label>
      )}

      <div className="text-xs rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center gap-2">
        <span>Hoy se muestra:</span>
        {hoyTema
          ? <b>{hoyTema.adorno} {hoyTema.nombre}</b>
          : <b>apariencia normal</b>}
        {modo !== "auto" && autoHoy && <span className="text-slate-500">(en automático tocaría {autoHoy.nombre})</span>}
        {hoyTema?.lluvia && (
          <button className="ml-auto inline-flex items-center gap-1 font-semibold text-[#1a2340] hover:underline" onClick={() => setPrueba(n => n + 1)}>
            <Sparkles size={13} /> Ver efecto
          </button>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-1.5">Calendario de temas</div>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {TEMAS.map(t => {
            const f = fechasDe(t, c);
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="w-6 text-center" aria-hidden="true">{t.adorno}</span>
                <span className="flex-1 min-w-[160px] font-medium">{t.nombre}</span>
                {t.ajustable ? (
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <input type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      value={f.desde ? `${anio}-${f.desde}` : ""}
                      onChange={e => ponerFecha(t.id, "desde", e.target.value)} />
                    <span className="text-slate-400">al</span>
                    <input type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                      value={f.hasta ? `${anio}-${f.hasta}` : ""}
                      onChange={e => ponerFecha(t.id, "hasta", e.target.value)} />
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    {f.desde === f.hasta ? fechaLarga(f.desde) : `${fechaLarga(f.desde)} al ${fechaLarga(f.hasta)}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          Las fechas con calendario cambian cada ciclo; ajústalas cuando conozcas las del año.
          El año no importa: se repiten cada año en el mismo día y mes.
          El aniversario no aparece hasta que le pongas fecha.
        </p>
      </div>
    </div>
  );
}
