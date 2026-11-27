/* Verificación de constancias con código QR.
   Cada constancia emitida queda registrada en la tabla constancias_emitidas
   (folio, titular y qué ampara). El registro es independiente de los
   archivos del semestre: aunque estos se borren, el QR se sigue validando. */
import { supabase } from "./supabase.js";

export const urlVerificacion = (folio) =>
  `${window.location.origin}${import.meta.env.BASE_URL}?verificar=${encodeURIComponent(folio)}`;

/* Registra (o actualiza, si ya existía) la constancia y devuelve su folio.
   Si algo falla devuelve null y el PDF sale igual, sin QR. */
export async function registrarConstancia({ clave, tipo, titularId, titular, detalle, datos = {} }) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("registrar_constancia", {
      p_clave: clave, p_tipo: tipo, p_titular_id: titularId || null,
      p_titular: titular, p_detalle: detalle, p_datos: datos,
    });
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.warn("No se pudo registrar la constancia para verificación:", e?.message || e);
    return null;
  }
}

/* Imagen PNG (data URL) del código QR que lleva a la página de verificación */
export async function qrVerificacion(folio) {
  const QR = await import("qrcode");
  return QR.toDataURL(urlVerificacion(folio), { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#18211b", light: "#ffffff" } });
}

export async function consultarFolio(folio) {
  const { data, error } = await supabase.rpc("verificar_constancia", { p_folio: folio });
  if (error) throw error;
  return data;
}
