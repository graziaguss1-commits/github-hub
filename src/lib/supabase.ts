import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Banco Supabase próprio (plano Free, São Paulo). O Lovable não lê o .env do repositório,
// então o endereço fica aqui. A chave publicável é pública por natureza: quem protege os
// dados são as regras (RLS) do banco.
const SUPABASE_URL = "https://bpcapmktfbphkdzyuhqr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Y60Spqe7oKqb-z5xtVBlyA_BCkRU631";

const env = import.meta.env as Record<string, string | undefined>;
const url = env["VITE_SUPABASE_URL"] || SUPABASE_URL;
const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"] || SUPABASE_PUBLISHABLE_KEY;

/** Endereço publicado: os links de convite e de senha sempre apontam para cá (a equipe não abre a pré-visualização do Lovable). */
export const SITE_PUBLICADO = "https://nucleo-aplicacoes.lovable.app";

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
