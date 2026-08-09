// ================================================================
// Función Edge "admin-docentes" · Gestión de cuentas
// Crea cuentas de docentes, restablece contraseñas y cambia correos.
// Solo puede usarla un usuario cuyo perfil sea 'admin' y esté activo.
// Usa la SERVICE_ROLE_KEY, que Supabase inyecta automáticamente como
// variable de entorno en las funciones Edge.
// ================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identificar a quien llama y verificar que sea administrador activo
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: quien, error: eTok } = await admin.auth.getUser(token);
    if (eTok || !quien?.user) {
      return Response.json({ error: "Sesión no válida." }, { status: 401, headers: CORS });
    }
    const { data: perfil } = await admin
      .from("perfiles").select("rol, activo").eq("id", quien.user.id).single();
    if (!perfil || perfil.rol !== "admin" || !perfil.activo) {
      return Response.json({ error: "Solo la administración puede realizar esta acción." }, { status: 403, headers: CORS });
    }

    const cuerpo = await req.json();
    const accion = cuerpo.accion;

    if (accion === "crear") {
      const { email, password, nombre, area, asignaturas, antiguedad } = cuerpo;
      if (!email || !password || !nombre) {
        return Response.json({ error: "Faltan datos: nombre, correo y contraseña inicial." }, { status: 400, headers: CORS });
      }
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nombre },
      });
      if (error) return Response.json({ error: error.message }, { status: 400, headers: CORS });

      // El trigger de la base ya creó el perfil; completamos sus datos
      await admin.from("perfiles").update({
        data: { nombre, area: area || "", asignaturas: asignaturas || "", antiguedad: antiguedad || "" },
      }).eq("id", data.user.id);

      return Response.json({ id: data.user.id }, { headers: CORS });
    }

    if (accion === "reset_pass") {
      const { id, password } = cuerpo;
      if (!id || !password || password.length < 6) {
        return Response.json({ error: "La nueva contraseña debe tener al menos 6 caracteres." }, { status: 400, headers: CORS });
      }
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) return Response.json({ error: error.message }, { status: 400, headers: CORS });
      return Response.json({ ok: true }, { headers: CORS });
    }

    if (accion === "cambiar_email") {
      const { id, email } = cuerpo;
      if (!id || !email) return Response.json({ error: "Faltan datos." }, { status: 400, headers: CORS });
      const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (error) return Response.json({ error: error.message }, { status: 400, headers: CORS });
      await admin.from("perfiles").update({ email }).eq("id", id);
      return Response.json({ ok: true }, { headers: CORS });
    }

    return Response.json({ error: "Acción no reconocida." }, { status: 400, headers: CORS });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500, headers: CORS });
  }
});
