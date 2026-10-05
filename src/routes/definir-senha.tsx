import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Syringe } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Campo } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// Destino do link do e-mail de convite (e de "esqueci a senha"): a pessoa já chega logada pelo link.
export const Route = createFileRoute("/definir-senha")({
  head: () => ({ meta: [{ title: "Criar senha — Controle de Aplicações" }] }),
  component: DefinirSenha,
});

function DefinirSenha() {
  const navigate = useNavigate();
  const { carregando, session, perfil } = useAuth();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (senha !== confirma) return toast.error("As senhas não conferem.");
    setEnviando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) return toast.error(error.message);
    toast.success("Senha criada. Bem-vinda(o)!");
    void navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={enviar} className="cartao w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2">
          <Syringe className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Crie sua senha</h1>
        </div>
        {carregando ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !session ? (
          <p className="text-sm text-muted-foreground">
            Este link expirou ou já foi usado. Peça um novo convite ao administrador, ou use "Esqueci a senha" na tela de
            login.
          </p>
        ) : (
          <div className="grid gap-4">
            {perfil && (
              <p className="text-sm text-muted-foreground">
                Olá, {perfil.nome}. Escolha uma senha para entrar no sistema.
              </p>
            )}
            <Campo label="Nova senha">
              <Input type="password" autoComplete="new-password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} required />
            </Campo>
            <Campo label="Repita a senha">
              <Input type="password" autoComplete="new-password" minLength={6} value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
            </Campo>
            <Button type="submit" disabled={enviando}>
              Salvar senha e entrar
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
