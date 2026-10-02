import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { supabase } from "./supabase";
import type { Papel, Profile } from "./types";

type AuthState = {
  carregando: boolean;
  session: Session | null;
  perfil: Profile | null;
  recarregarPerfil: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  carregando: true,
  session: null,
  perfil: null,
  recarregarPerfil: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Profile | null>(null);

  async function carregarPerfil(s: Session | null) {
    if (!s) {
      setPerfil(null);
      return;
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    setPerfil((data as Profile | null) ?? null);
  }

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      await carregarPerfil(data.session);
      if (ativo) setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSession(s);
      // fora do callback para não travar o cliente de auth
      setTimeout(() => void carregarPerfil(s), 0);
    });
    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ carregando, session, perfil, recarregarPerfil: () => carregarPerfil(session) }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function usePode(...papeis: Papel[]): boolean {
  const { perfil } = useAuth();
  return Boolean(perfil?.ativo && papeis.includes(perfil.papel));
}

export const PAPEL_LABEL: Record<Papel, string> = {
  admin: "Admin",
  medico: "Médico(a)",
  enfermagem: "Enfermagem",
};
