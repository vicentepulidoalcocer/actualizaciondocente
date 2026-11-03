// ============================================================================
//  Respaldo de los archivos de Supabase Storage (constancias, PDF, etc.)
//  Lo usa el flujo "Respaldo semanal" de GitHub Actions.
//  Se guarda en: scripts/respaldo-archivos.mjs
//
//  Baja todos los archivos de todos los buckets a una carpeta, con la misma
//  estructura de carpetas. No necesita instalar nada (Node 20 trae fetch).
//  Variables: URL (Project URL) y LLAVE (llave secreta sb_secret_…).
//
//  v2: muestra el avance, pone un tiempo límite a cada archivo, reintenta,
//  y si alguno falla igual termina la copia de los demás y deja la lista
//  de los que faltaron en FALTANTES.txt.
// ============================================================================

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const URL_BASE = String(process.env.URL || "").replace(/\/+$/, "");
const LLAVE = process.env.LLAVE || "";
const DESTINO = process.argv[2] || "respaldo-archivos";

// Mantiene vivo el proceso mientras haya descargas pendientes. Sin esto, si
// una conexión se queda colgada, Node puede terminar en silencio a medias.
const latido = setInterval(() => {}, 1000);

process.on("unhandledRejection", (e) => {
  console.error("Error inesperado:", e?.stack || e);
  process.exit(1);
});

if (!URL_BASE || !LLAVE) {
  console.error("Faltan los secretos VITE_SUPABASE_URL o SUPABASE_SECRET_KEY.");
  process.exit(1);
}

// Las llaves nuevas (sb_secret_) van en "apikey"; las antiguas (eyJ…) en ambos
const cabeceras = LLAVE.startsWith("eyJ")
  ? { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` }
  : { apikey: LLAVE };

// Pide algo a Storage con tiempo límite y hasta 4 intentos. Devuelve la
// respuesta con el cuerpo ya leído, para que el tiempo límite cubra todo.
async function pedir(ruta, opciones = {}, segundos = 90) {
  let ultimo;
  for (let i = 1; i <= 4; i++) {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), segundos * 1000);
    try {
      const r = await fetch(`${URL_BASE}/storage/v1${ruta}`, {
        ...opciones, headers: { ...cabeceras, ...(opciones.headers || {}) },
        signal: control.signal,
      });
      const cuerpo = Buffer.from(await r.arrayBuffer());
      clearTimeout(reloj);
      if (r.ok || r.status < 500) return { ok: r.ok, status: r.status, cuerpo };
      ultimo = `HTTP ${r.status}`;
    } catch (e) {
      clearTimeout(reloj);
      ultimo = e?.name === "AbortError" ? `sin respuesta en ${segundos} s` : String(e?.message || e);
    }
    await new Promise((ok) => setTimeout(ok, 2000 * i));
  }
  return { ok: false, status: 0, cuerpo: Buffer.alloc(0), error: ultimo };
}

// Lista recursiva: las carpetas vienen sin "id"
async function listar(bucket, prefijo = "") {
  const archivos = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await pedir(`/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    }, 60);
    if (!r.ok) throw new Error(`No se pudo listar ${bucket}/${prefijo}: ${r.status || r.error} ${r.cuerpo.toString().slice(0, 200)}`);
    const lote = JSON.parse(r.cuerpo.toString());
    for (const x of lote) {
      const ruta = prefijo ? `${prefijo}${x.name}` : x.name;
      if (x.id === null || x.id === undefined) archivos.push(...await listar(bucket, `${ruta}/`));
      else archivos.push(ruta);
    }
    if (lote.length < 1000) break;
  }
  return archivos;
}

const rb = await pedir("/bucket", {}, 60);
if (!rb.ok) {
  console.error(`No se pudo leer la lista de buckets: ${rb.status || rb.error} ${rb.cuerpo.toString().slice(0, 200)}`);
  process.exit(1);
}
const buckets = JSON.parse(rb.cuerpo.toString()).map((b) => b.name);
console.log(`Buckets: ${buckets.join(", ") || "(ninguno)"}`);

let total = 0, bytes = 0, vistos = 0;
const fallos = [];
const inicio = Date.now();
for (const bucket of buckets) {
  const lista = await listar(bucket);
  console.log(`${bucket}: ${lista.length} archivo(s)`);
  vistos = 0;
  for (let i = 0; i < lista.length; i += 6) {
    await Promise.all(lista.slice(i, i + 6).map(async (ruta) => {
      const camino = ruta.split("/").map(encodeURIComponent).join("/");
      const d = await pedir(`/object/${encodeURIComponent(bucket)}/${camino}`, {}, Number(process.env.SEG || 120));
      vistos++;
      if (!d.ok) { fallos.push(`${bucket}/${ruta}  (${d.error || "HTTP " + d.status})`); return; }
      try {
        const local = join(DESTINO, bucket, ...ruta.split("/"));
        await mkdir(dirname(local), { recursive: true });
        await writeFile(local, d.cuerpo);
        total++; bytes += d.cuerpo.length;
      } catch (e) {
        fallos.push(`${bucket}/${ruta}  (no se pudo guardar: ${e.message})`);
      }
    }));
    if (vistos % 60 < 6 || i + 6 >= lista.length) {
      console.log(`  avance: ${vistos}/${lista.length} · ${(bytes / 1048576).toFixed(1)} MB · ${Math.round((Date.now() - inicio) / 1000)} s`);
    }
  }
}

console.log(`Copiados ${total} archivo(s), ${(bytes / 1048576).toFixed(1)} MB.`);
clearInterval(latido);
if (fallos.length) {
  await mkdir(DESTINO, { recursive: true });
  await writeFile(join(DESTINO, "FALTANTES.txt"), fallos.join("\n") + "\n");
  console.error(`No se pudieron copiar ${fallos.length}. Lista completa en FALTANTES.txt dentro del respaldo:`);
  fallos.slice(0, 40).forEach((f) => console.error("  " + f));
  process.exit(2);   // el flujo guarda lo copiado y avisa al final
}
