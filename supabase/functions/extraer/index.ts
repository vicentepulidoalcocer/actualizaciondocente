// ================================================================
// Función Edge "extraer" · Lee constancias y títulos con Gemini
// La clave GEMINI_API_KEY vive como secreto del proyecto Supabase
// y nunca llega al navegador.
//
// v6: ya no falla cuando la misma cuenta cerró sesión en otro
// dispositivo (antes respondía "Sesión no válida").
//
// v5: Google retiró "gemini-2.5-flash-lite" para esta cuenta. Ahora la
// función le pregunta a Google qué modelos "flash-lite" (los económicos)
// tiene disponibles tu llave y usa el más reciente; si Google retira uno,
// pasa solo al siguiente. Nunca usa los modelos caros. Cuando
// Gemini responde que está saturado ("high demand"), espera unos
// segundos y lo vuelve a intentar, hasta 4 veces, en lugar de rendirse
// a la primera. Cada fallo queda anotado en los Logs de la función.
//
// v2 (seguridad): además de la verificación de JWT, la función ahora
// comprueba que quien llama sea una persona con sesión iniciada y
// cuenta activa en el portal. Antes bastaba la llave pública de la
// página (que cualquiera puede ver) para usar Gemini a tu costa.
// ================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIAS = [
  "Formación pedagógica", "Evaluación", "Tecnología educativa",
  "Inteligencia artificial", "Matemáticas", "Ciencias", "Lenguaje",
  "Inclusión educativa", "Habilidades socioemocionales", "Gestión escolar", "Otro",
];

function construirPrompt(tipo: string): { reglas: string; esquema: string } {
  if (tipo === "constancia") {
    return {
      esquema: `{"docente": string|null, "curso": string|null, "institucion": string|null, "fecha_inicio": "YYYY-MM-DD"|null, "fecha_termino": "YYYY-MM-DD"|null, "horas": number|null, "modalidad": string|null, "categoria": string|null, "folio": string|null, "fecha_emision": "YYYY-MM-DD"|null, "otros": string|null}`,
      reglas: `Analiza esta constancia de curso de capacitación docente. Extrae ÚNICAMENTE datos que aparezcan explícitamente en el documento. REGLAS ESTRICTAS:
1. Si un dato NO aparece claramente, devuelve null. NUNCA inventes información.
2. Las HORAS tienen prioridad especial: si dice "40 horas", registra 40. Si indica días o sesiones sin equivalencia clara en horas, devuelve null en horas (no conviertas sin evidencia).
3. Clasifica el curso en UNA de estas categorías exactas: ${CATEGORIAS.join(", ")}. Si dudas, usa "Otro".
4. Fechas en formato YYYY-MM-DD; si solo hay año, usa null y menciónalo en "otros".`,
    };
  }
  return {
    esquema: `{"nombre": string|null, "nivel": "Licenciatura"|"Maestría"|"Doctorado"|null, "programa": string|null, "institucion": string|null, "campus": string|null, "pais": string|null, "fecha_expedicion": "YYYY-MM-DD"|null, "fecha_terminacion": "YYYY-MM-DD"|null, "num_titulo": string|null, "cedula": string|null, "otros": string|null}`,
    reglas: `Analiza este título o grado académico. Extrae ÚNICAMENTE datos que aparezcan explícitamente. Si un dato no aparece claramente, devuelve null. NUNCA inventes información. Fechas en formato YYYY-MM-DD.`,
  };
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const saturado = (status: number, msg: string) =>
  status === 429 || status === 500 || status === 503 ||
  /high demand|overloaded|try again|resource exhausted/i.test(msg);

// Le pregunta a Google qué modelos "flash-lite" puede usar esta llave.
// Se guarda la lista unos minutos para no preguntar en cada constancia.
let listaLite: { modelos: string[]; hasta: number } | null = null;
async function modelosLite(clave: string): Promise<string[]> {
  if (listaLite && listaLite.hasta > Date.now()) return listaLite.modelos;
  const respaldo = ["gemini-flash-lite-latest"];
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${clave}`);
    const j = await r.json();
    const nombres: string[] = (j.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m: any) => String(m.name || "").replace(/^models\//, ""))
      .filter((n: string) => /flash-lite/.test(n) && !/preview|exp|tts|image|audio|live/.test(n));
    // Más nuevo primero: por número de versión (3.5 antes que 2.5)
    const version = (n: string) => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    nombres.sort((a, b) => version(b) - version(a) || a.length - b.length);
    const modelos = [...new Set([...nombres, ...respaldo])];
    console.log(`extraer: modelos económicos disponibles: ${modelos.join(", ")}`);
    listaLite = { modelos, hasta: Date.now() + 30 * 60 * 1000 };
    return modelos;
  } catch (e) {
    console.log(`extraer: no se pudo leer la lista de modelos: ${(e as Error).message}`);
    return respaldo;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ¿Quién llama? Debe ser un usuario real con cuenta activa.
    // La firma y la vigencia del token ya las comprobó Supabase antes de
    // llegar aquí (verify_jwt). Se lee el usuario del propio token en vez
    // de preguntarle al servidor de sesiones: así, si la misma cuenta
    // cerró sesión en otro dispositivo, este no deja de poder usar la IA.
    const urlBase = Deno.env.get("SUPABASE_URL")!;
    const servicio = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    let usuario: { id?: string } | null = null;
    try {
      const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const datosToken = JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4)));
      if (datosToken.role === "authenticated" && /^[0-9a-f-]{36}$/i.test(datosToken.sub || "")) {
        usuario = { id: datosToken.sub };
      }
    } catch { usuario = null; }
    if (!usuario?.id) {
      console.log("extraer: token sin usuario válido");
      return Response.json({ error: "Sesión no válida." }, { status: 401, headers: CORS });
    }
    const p = await fetch(`${urlBase}/rest/v1/perfiles?id=eq.${usuario.id}&select=activo`, {
      headers: { Authorization: `Bearer ${servicio}`, apikey: servicio },
    });
    const perfil = p.ok ? (await p.json())[0] : null;
    if (!perfil?.activo) {
      return Response.json({ error: "Tu cuenta no está activa." }, { status: 403, headers: CORS });
    }

    const { base64, mime, tipo } = await req.json();
    // Un archivo de más de ~10 MB no es una constancia: se rechaza
    if (String(base64 || "").length > 14_000_000) {
      return Response.json({ error: "El archivo es demasiado grande." }, { status: 413, headers: CORS });
    }
    if (!base64 || !mime || !["constancia", "titulo"].includes(tipo)) {
      return Response.json({ error: "Solicitud incompleta." }, { status: 400, headers: CORS });
    }

    const clave = Deno.env.get("GEMINI_API_KEY");
    if (!clave) {
      return Response.json({ error: "Falta configurar GEMINI_API_KEY en los secretos de la función." }, { status: 500, headers: CORS });
    }

    const { reglas, esquema } = construirPrompt(tipo);
    const cuerpo = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mime, data: base64 } },
          { text: `${reglas}\n\nResponde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta, sin markdown ni texto adicional:\n${esquema}` },
        ],
      }],
      generationConfig: { temperature: 0, response_mime_type: "application/json" },
    };

    // Modelos económicos disponibles para esta llave, del más nuevo al
    // más viejo. Si Gemini está saturado, se espera y se reintenta.
    const modelos = await modelosLite(clave);
    let j: any = null;
    let ultimoError = "";
    afuera:
    for (const MODELO of modelos) {
      for (let intento = 1; intento <= 3; intento++) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${clave}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) },
        );
        const resp = await r.json().catch(() => ({ error: { message: `respuesta no válida (${r.status})` } }));
        if (!resp.error) { j = resp; console.log(`extraer: leído con ${MODELO}`); break afuera; }
        ultimoError = resp.error.message || `error ${r.status}`;
        console.log(`extraer: ${MODELO} intento ${intento} falló (${r.status}): ${ultimoError}`);
        if (!saturado(r.status, ultimoError)) break;          // retirado o no existe: siguiente modelo
        if (intento < 3) await esperar(2000 * intento);
      }
    }
    if (!j) {
      return Response.json({ error: `Gemini: ${ultimoError || "error desconocido"}` }, { status: 502, headers: CORS });
    }

    const texto = (j.candidates?.[0]?.content?.parts || [])
      .map((p: { text?: string }) => p.text || "").join("");
    const limpio = texto.replace(/```json|```/g, "").trim();
    const ini = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (ini < 0 || fin < 0) {
      return Response.json({ error: "La IA no devolvió un JSON válido." }, { status: 502, headers: CORS });
    }
    const datos = JSON.parse(limpio.slice(ini, fin + 1));
    return Response.json(datos, { headers: CORS });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
});
