import type { ReactNode, SelectHTMLAttributes } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Campo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Seletor({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-[12px] border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted disabled:opacity-70",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[22px] border border-dashed bg-card px-6 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Etiqueta({
  tom = "neutro",
  children,
}: {
  tom?: "neutro" | "ok" | "alerta" | "perigo" | "info";
  children: ReactNode;
}) {
  const cores = {
    neutro: "bg-muted text-muted-foreground",
    ok: "bg-[var(--sucesso)]/10 text-[var(--sucesso)]",
    alerta: "bg-[var(--atencao)]/10 text-[var(--atencao)]",
    perigo: "bg-[var(--erro)]/10 text-[var(--erro)]",
    info: "bg-[var(--info)]/10 text-[var(--info)]",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", cores[tom])}>
      {children}
    </span>
  );
}
