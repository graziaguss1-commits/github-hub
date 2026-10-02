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

const NAV = [
  { to: "/", label: "Início", icon: LayoutDashboard },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/orcamentos", label: "Orçamentos", icon: Receipt },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/procedimentos", label: "Procedimentos", icon: ClipboardList },
  { to: "/equipe", label: "Equipe", icon: UserCog },
] as const;

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
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar px-3 py-5 md:flex">
        <div className="flex items-center gap-2 px-2 pb-6">
          <Syringe className="size-5 text-primary" />
          <span className="font-semibold leading-tight">Controle de Aplicações</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent font-medium" }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t pt-4 text-sm">
          <p className="truncate px-2 font-medium">{perfil.nome}</p>
          <p className="px-2 text-xs text-muted-foreground">{PAPEL_LABEL[perfil.papel]}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={() => void supabase.auth.signOut()}
          >
            <LogOut /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b px-3 py-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm"
              activeProps={{ className: "bg-accent font-medium" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 md:px-8">
          <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
          <div className="flex flex-wrap gap-2">{acoes}</div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
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
