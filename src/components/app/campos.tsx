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
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
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
    <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
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
    ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    alerta: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    perigo: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  } as const;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cores[tom])}>
      {children}
    </span>
  );
}
