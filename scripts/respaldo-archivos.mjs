// ============================================================================
//  Respaldo de los archivos de Supabase Storage (constancias, PDF, etc.)
//  Lo usa el flujo "Respaldo semanal" de GitHub Actions.
//  Se guarda en: scripts/respaldo-archivos.mjs
//
//  Baja todos los archivos de todos los buckets a una carpeta, con la misma
//  estructura de carpetas. No necesita instalar nada (Node 20 trae fetch).
//  Variables: URL (Project URL) y LLAVE (llave secreta sb_secret_…).
// ============================================================================

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const URL_BASE = String(process.env.URL || "").replace(/\/+$/, "");
const LLAVE = process.env.LLAVE || "";
const DESTINO = process.argv[2] || "respaldo-archivos";

if (!URL_BASE || !LLAVE) {
  console.error("Faltan los secretos VITE_SUPABASE_URL o SUPABASE_SECRET_KEY.");
  process.exit(1);
}

// Las llaves nuevas (sb_secret_) van en "apikey"; las antiguas (eyJ…) en ambos
const cabeceras = LLAVE.startsWith("eyJ")
  ? { apikey: LLAVE, Authorization: `Bearer ${LLAVE}` }
  : { apikey: LLAVE };

async function pedir(ruta, opciones = {}, intentos = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(`${URL_BASE}/storage/v1${ruta}`, {
        ...opciones, headers: { ...cabeceras, ...(opciones.headers || {}) },
        signal: AbortSignal.timeout(120000),
      });
      if (r.ok || i >= intentos || r.status < 500) return r;
    } catch (e) {
      if (i >= intentos) throw e;
    }
    await new Promise((ok) => setTimeout(ok, 2000 * i));
  }
}

// Lista recursiva: las carpetas vienen sin "id"
async function listar(bucket, prefijo = "") {
  const archivos = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await pedir(`/object/list/${encodeURIComponent(bucket)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) throw new Error(`No se pudo listar ${bucket}/${prefijo}: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    for (const x of lote) {
      const ruta = prefijo ? `${prefijo}${x.name}` : x.name;
      if (x.id === null || x.id === undefined) archivos.push(...await listar(bucket, `${ruta}/`));
      else archivos.push({ ruta, peso: Number(x.metadata?.size) || 0 });
    }
    if (lote.length < 1000) break;
  }
  return archivos;
}

const r = await pedir("/bucket");
if (!r.ok) {
  console.error(`No se pudo leer la lista de buckets: ${r.status} ${await r.text()}`);
  process.exit(1);
}
const buckets = (await r.json()).map((b) => b.name);
console.log(`Buckets: ${buckets.join(", ") || "(ninguno)"}`);

let total = 0, bytes = 0;
const fallos = [];
for (const bucket of buckets) {
  const lista = await listar(bucket);
  console.log(`${bucket}: ${lista.length} archivo(s)`);
  // De 6 en 6, para no saturar
  for (let i = 0; i < lista.length; i += 6) {
    await Promise.all(lista.slice(i, i + 6).map(async ({ ruta }) => {
      const camino = ruta.split("/").map(encodeURIComponent).join("/");
      try {
        const d = await pedir(`/object/${encodeURIComponent(bucket)}/${camino}`);
        if (!d.ok) throw new Error(`${d.status}`);
        const datos = Buffer.from(await d.arrayBuffer());
        const local = join(DESTINO, bucket, ...ruta.split("/"));
        await mkdir(dirname(local), { recursive: true });
        await writeFile(local, datos);
        total++; bytes += datos.length;
      } catch (e) {
        fallos.push(`${bucket}/${ruta} (${e.message})`);
      }
    }));
  }
}

console.log(`Copiados ${total} archivo(s), ${(bytes / 1048576).toFixed(1)} MB.`);
if (fallos.length) {
  console.error(`No se pudieron copiar ${fallos.length}:`);
  fallos.slice(0, 50).forEach((f) => console.error("  " + f));
  process.exit(1);
}
