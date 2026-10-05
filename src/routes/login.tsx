import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Syringe } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Campo } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { bancoConfigurado, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar — Controle de Aplicações" }] }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (session) void navigate({ to: "/" });
  }, [session, navigate]);

  // Link do e-mail vencido ou já usado: o Supabase devolve o erro no endereço.
  const [erroLink, setErroLink] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.replace(/^#/, "") || window.location.search);
    const codigo = p.get("error_code");
    if (codigo) {
      setErroLink(
        codigo === "otp_expired"
          ? "Este link já foi usado ou expirou. Peça ao administrador um novo link de acesso."
          : (p.get("error_description")?.replace(/\+/g, " ") ?? "Não foi possível usar este link."),
      );
    }
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Acesso criado. Se pedir confirmação, veja seu e-mail.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={enviar} className="cartao w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2">
          <Syringe className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Controle de Aplicações</h1>
        </div>
        {erroLink && (
          <p className="mb-4 rounded-[12px] bg-[var(--erro)]/10 p-3 text-sm text-[var(--erro)]">{erroLink}</p>
        )}
        {!bancoConfigurado && (
          <p className="mb-4 rounded-[12px] bg-[var(--atencao)]/10 p-3 text-sm text-[var(--atencao)]">
            O banco de dados ainda não foi ativado neste projeto.
          </p>
        )}
        <div className="grid gap-4">
          {modo === "criar" && (
            <Campo label="Nome">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </Campo>
          )}
          <Campo label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Campo>
          <Campo label="Senha">
            <Input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={6}
              required
            />
          </Campo>
          <Button type="submit" disabled={enviando || !bancoConfigurado}>
            {modo === "entrar" ? "Entrar" : "Criar acesso"}
          </Button>
          {modo === "entrar" && (
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={async () => {
                if (!email.includes("@")) return toast.error("Digite seu e-mail acima primeiro.");
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${window.location.origin}/definir-senha`,
                });
                if (error) toast.error(error.message);
                else toast.success("Enviamos um link para criar uma nova senha.");
              }}
            >
              Esqueci a senha
            </button>
          )}
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}
          >
            {modo === "entrar" ? "Primeiro acesso? Criar usuário" : "Já tenho acesso"}
          </button>
        </div>
      </form>
    </div>
  );
}
