// ================================================================
// Función Edge "extraer" · Lee constancias y títulos con Gemini
// La clave GEMINI_API_KEY vive como secreto del proyecto Supabase
// y nunca llega al navegador. Mantén activada la verificación de
// JWT para que solo usuarios con sesión puedan usarla.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { base64, mime, tipo } = await req.json();
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

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${clave}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) },
    );
    const j = await r.json();

    if (j.error) {
      return Response.json({ error: `Gemini: ${j.error.message || "error desconocido"}` }, { status: 502, headers: CORS });
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
