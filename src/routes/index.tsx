import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays } from "date-fns";
import { AlertTriangle, CalendarClock, PackageX } from "lucide-react";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/AppShell";
import { Etiqueta, Vazio } from "@/components/app/campos";
import { data, dataCurta, diasAte, inicioDaSemana, qtd, rotuloSemana } from "@/lib/format";
import { useEstoque, useLotesComSaldo, useProdutos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Application, Patient, Plan, PlanDose } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Controle de Aplicações" },
      { name: "description", content: "Plano, aplicação e estoque de medicações injetáveis." },
    ],
  }),
  component: Inicio,
});

type Pendente = { plano: Plan; paciente: Patient | undefined; semana: number; sub: number; inicio: Date };

function Inicio() {
  const { data: estoque = [] } = useEstoque();
  const { data: lotes = [] } = useLotesComSaldo();
  const { data: produtos = [] } = useProdutos();

  const { data: pendentes = [] } = useQuery({
    queryKey: ["painel", "pendentes"],
    queryFn: async (): Promise<Pendente[]> => {
      const planos = check(await supabase.from("plans").select("*").eq("status", "ativo")) as Plan[];
      if (!planos.length) return [];
      const ids = planos.map((p) => p.id);
      const [doses, apps, pacs] = await Promise.all([
        supabase.from("plan_doses").select("*").in("plan_id", ids).eq("status", "prevista"),
        supabase.from("applications").select("*").in("plan_id", ids).in("status", ["concluida", "pulada"]),
        supabase.from("patients").select("*").in("id", planos.map((p) => p.patient_id)),
      ]);
      const pacientes = check(pacs) as Patient[];
      const feitas = new Set((check(apps) as Application[]).map((a) => `${a.plan_id}-${a.semana}-${a.sub_semana}`));
      const vistos = new Map<string, Pendente>();
      for (const d of check(doses) as PlanDose[]) {
        const k = `${d.plan_id}-${d.semana}-${d.sub_semana}`;
        const plano = planos.find((p) => p.id === d.plan_id);
        if (!plano || feitas.has(k) || vistos.has(k)) continue;
        vistos.set(k, {
          plano,
          paciente: pacientes.find((p) => p.id === plano.patient_id),
          semana: d.semana,
          sub: d.sub_semana,
          inicio: inicioDaSemana(plano.inicio, d.semana),
        });
      }
      return [...vistos.values()];
    },
  });

  const hoje = new Date();
  const daquiUmaSemana = addDays(hoje, 7);
  const atrasadas = pendentes.filter((p) => addDays(p.inicio, 6) < hoje).sort((a, b) => +a.inicio - +b.inicio);
  const estaSemana = pendentes
    .filter((p) => addDays(p.inicio, 6) >= hoje && p.inicio <= daquiUmaSemana)
    .sort((a, b) => +a.inicio - +b.inicio);
  const abaixo = estoque.filter((e) => e.abaixo_minimo);
  const vencendo = lotes.filter((l) => {
    const d = diasAte(l.validade);
    return d !== null && d <= 30;
  });

  return (
    <AppShell titulo="Início">
      <div className="grid gap-6 lg:grid-cols-2">
        <Bloco icone={<CalendarClock className="size-4" />} titulo="Aplicações dos próximos 7 dias">
          {estaSemana.length === 0 ? <Vazio>Nada previsto.</Vazio> : <ListaPendentes itens={estaSemana} />}
        </Bloco>

        <Bloco icone={<AlertTriangle className="size-4" />} titulo="Atrasadas">
          {atrasadas.length === 0 ? <Vazio>Nenhuma semana atrasada.</Vazio> : <ListaPendentes itens={atrasadas} atrasada />}
        </Bloco>

        <Bloco icone={<PackageX className="size-4" />} titulo="Estoque abaixo do mínimo">
          {abaixo.length === 0 ? (
            <Vazio>Tudo acima do mínimo.</Vazio>
          ) : (
            <ul className="divide-y rounded-lg border">
              {abaixo.map((e) => (
                <li key={e.product_id} className="flex justify-between px-4 py-2 text-sm">
                  <span>{e.nome}</span>
                  <span className="text-destructive">
                    {qtd(e.saldo, e.unidade)} / mín. {qtd(e.estoque_minimo, e.unidade)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco icone={<AlertTriangle className="size-4" />} titulo="Lotes vencidos ou vencendo em 30 dias">
          {vencendo.length === 0 ? (
            <Vazio>Nenhum lote perto do vencimento.</Vazio>
          ) : (
            <ul className="divide-y rounded-lg border">
              {vencendo.map((l) => {
                const p = produtos.find((x) => x.id === l.product_id);
                const d = diasAte(l.validade) ?? 0;
                return (
                  <li key={l.id} className="flex justify-between gap-2 px-4 py-2 text-sm">
                    <span>
                      {p?.nome} · lote {l.lote}
                    </span>
                    <span>
                      {data(l.validade)}{" "}
                      <Etiqueta tom={d < 0 ? "perigo" : "alerta"}>{d < 0 ? "vencido" : `${d} dias`}</Etiqueta>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Bloco>
      </div>
    </AppShell>
  );
}

function Bloco({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-medium">
        {icone} {titulo}
      </h2>
      {children}
    </section>
  );
}

function ListaPendentes({ itens, atrasada }: { itens: Pendente[]; atrasada?: boolean }) {
  return (
    <ul className="divide-y rounded-lg border">
      {itens.map((p) => (
        <li
          key={`${p.plano.id}-${p.semana}-${p.sub}`}
          className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
        >
          <Link to="/pacientes/$id" params={{ id: p.plano.patient_id }} className="font-medium hover:underline">
            {p.paciente?.nome ?? "Paciente"}
          </Link>
          <span className={atrasada ? "text-destructive" : "text-muted-foreground"}>
            {rotuloSemana(p.semana, p.sub)} · {dataCurta(p.inicio)}
          </span>
        </li>
      ))}
    </ul>
  );
}
