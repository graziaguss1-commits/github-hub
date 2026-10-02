import { Link, useNavigate } from "@tanstack/react-router";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Syringe,
  Users,
  UserCog,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { PAPEL_LABEL, useAuth } from "@/lib/auth";
import { bancoConfigurado, supabase } from "@/lib/supabase";

const GRUPOS = [
  {
    rotulo: "Operação",
    itens: [
      { to: "/", label: "Início", icon: LayoutDashboard },
      { to: "/pacientes", label: "Pacientes", icon: Users },
      { to: "/orcamentos", label: "Orçamentos", icon: Receipt },
    ],
  },
  {
    rotulo: "Estoque",
    itens: [
      { to: "/estoque", label: "Estoque", icon: Boxes },
      { to: "/produtos", label: "Produtos", icon: Package },
      { to: "/procedimentos", label: "Procedimentos", icon: ClipboardList },
    ],
  },
  {
    rotulo: "Administração",
    itens: [{ to: "/equipe", label: "Equipe", icon: UserCog }],
  },
] as const;
const NAV = GRUPOS.flatMap((g) => g.itens);

export function AppShell({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  const { carregando, session, perfil } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (bancoConfigurado && !carregando && !session) void navigate({ to: "/login" });
  }, [carregando, session, navigate]);

  if (!bancoConfigurado) {
    return (
      <Centro>
        <h1 className="text-lg font-semibold">Banco de dados não configurado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confira o endereço do banco em <code>src/lib/supabase.ts</code>.
        </p>
      </Centro>
    );
  }

  if (carregando || !session) {
    return <Centro><p className="text-sm text-muted-foreground">Carregando…</p></Centro>;
  }

  if (!perfil?.ativo) {
    return (
      <Centro>
        <h1 className="text-lg font-semibold">Aguardando liberação</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu acesso foi criado. Um administrador precisa liberar o seu usuário em Equipe.
        </p>
        <Button className="mt-6" variant="outline" onClick={() => void supabase.auth.signOut()}>
          Sair
        </Button>
      </Centro>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-5">
          <span className="flex size-10 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Syringe className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-[0.18em] uppercase">Controle</p>
            <p className="eyebrow">de aplicações</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-5">
          {GRUPOS.map((g) => (
            <div key={g.rotulo} className="grid gap-1">
              <p className="eyebrow px-3 pb-1">{g.rotulo}</p>
              {g.itens.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] text-sidebar-foreground hover:bg-sidebar-accent"
                  activeProps={{ className: "!bg-primary !text-primary-foreground font-medium" }}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t border-sidebar-border px-5 py-4 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">{perfil.nome}</p>
            <p className="text-xs text-muted-foreground">{PAPEL_LABEL[perfil.papel]}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void supabase.auth.signOut()} aria-label="Sair">
            <LogOut />
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b bg-sidebar px-3 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm"
              activeProps={{ className: "!bg-primary !text-primary-foreground font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-8 md:px-8">
          <h1 className="text-2xl">{titulo}</h1>
          <div className="flex flex-wrap items-center gap-2">{acoes}</div>
        </header>
        <main className="flex-1 px-4 pb-10 pt-4 md:px-8">{children}</main>
      </div>
    </div>
  );
}

function Centro({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">{children}</div>
    </div>
  );
}
