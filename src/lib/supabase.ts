import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lovable Cloud injeta estas variáveis quando o banco é ativado no projeto.
const env = import.meta.env as Record<string, string | undefined>;
const url = env["VITE_SUPABASE_URL"];
const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? env["VITE_SUPABASE_ANON_KEY"];

export const bancoConfigurado = Boolean(url && key);

export const supabase: SupabaseClient = createClient(
  url ?? "http://localhost:54321",
  key ?? "chave-ausente",
  {
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined",
    },
  },
);

/** Lança o erro do banco com a mensagem em português que as funções devolvem. */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
