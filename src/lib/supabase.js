import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurada = Boolean(url && anon);

export const supabase = configurada ? createClient(url, anon) : null;
