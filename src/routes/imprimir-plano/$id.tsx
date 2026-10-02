import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer } from "lucide-react";

import { chaveSemana, useDadosPlano } from "@/components/plano/dados";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { data, dataCurta, hojeISO, inicioDaSemana, qtd, rotuloSemana } from "@/lib/format";
import { usePerfis, useProcedimentos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Patient, Plan } from "@/lib/types";

export const Route = createFileRoute("/imprimir-plano/$id")({
  head: () => ({ meta: [{ title: "Plano de tratamento" }] }),
  component: ImprimirPlano,
});

type Clinica = { clinica_nome: string | null; clinica_rodape: string | null };

function ImprimirPlano() {
  const { id } = Route.useParams();
  const { carregando, session } = useAuth();
  const { data: plano } = useQuery({
    queryKey: ["plans", "id", id],
    enabled: Boolean(session),
    queryFn: async () => check(await supabase.from("plans").select("*").eq("id", id).single()) as Plan,
  });
  const { data: paciente } = useQuery({
    queryKey: ["patient", plano?.patient_id],
    enabled: Boolean(plano),
    queryFn: async () =>
      check(await supabase.from("patients").select("*").eq("id", plano?.patient_id ?? "").single()) as Patient,
  });
  const { data: quote } = useQuery({
    queryKey: ["quote-do-plano", id],
    enabled: Boolean(session),
    queryFn: async () =>
      (check(await supabase.from("quotes").select("numero").eq("plan_id", id).maybeSingle()) as { numero: number } | null),
  });
  const { data: clinica } = useQuery({
    queryKey: ["dados_clinica"],
    enabled: Boolean(session),
    queryFn: async () => ((check(await supabase.rpc("dados_clinica")) as Clinica[])[0] ?? null) as Clinica | null,
  });
  const { data: dados } = useDadosPlano(session ? id : null);
  const { data: procs = [] } = useProcedimentos();
  const { data: perfis = [] } = usePerfis();

  if (carregando) return <p className="p-10 text-sm text-muted-foreground">Carregando…</p>;
  if (!session) return <p className="p-10 text-sm">Entre no sistema para ver este plano.</p>;
  if (!plano || !paciente || !dados) return <p className="p-10 text-sm text-muted-foreground">Carregando…</p>;

  const medico = perfis.find((p) => p.id === plano.medico_id);
  const nomeCompra = (purchaseId: string) => {
    const c = dados.compras.find((x) => x.id === purchaseId);
    return procs.find((p) => p.id === c?.procedure_id)?.nome ?? "…";
  };
  const unidade = (purchaseId: string) => dados.compras.find((x) => x.id === purchaseId)?.unidade_dose;

  // Semanas com dose ou com registro (realizada/pulada), em ordem.
  const apps = new Map(
    dados.aplicacoes.filter((a) => a.status !== "cancelada").map((a) => [chaveSemana(a.semana, a.sub_semana), a]),
  );
  const chaves = new Set<string>([...dados.doses.map((d) => chaveSemana(d.semana, d.sub_semana)), ...apps.keys()]);
  const semanas = [...chaves]
    .map((k) => {
      const [s, sub] = k.split("-").map(Number);
      return { semana: s ?? 1, sub: sub ?? 1, chave: k };
    })
    .sort((a, b) => a.semana - b.semana || a.sub - b.sub);

  const realizadas = [...apps.values()].filter((a) => a.status === "concluida").length;
  const puladas = [...apps.values()].filter((a) => a.status === "pulada").length;
  const previstas = new Set(dados.doses.map((d) => chaveSemana(d.semana, d.sub_semana))).size;
  const ultima = semanas.at(-1)?.semana ?? 1;
  const fim = addDays(inicioDaSemana(plano.inicio, ultima), 6);

  // Agrupa por mês de início da semana.
  const porMes = new Map<string, typeof semanas>();
  for (const s of semanas) {
    const mes = format(inicioDaSemana(plano.inicio, s.semana), "MMMM 'de' yyyy", { locale: ptBR });
    porMes.set(mes, [...(porMes.get(mes) ?? []), s]);
  }

  return (
    <div className="min-h-screen bg-muted/40 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer /> Imprimir ou salvar PDF
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-12 py-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="mb-8 flex items-start justify-between gap-6 border-b border-neutral-300 pb-6">
          <div>
            {clinica?.clinica_nome && <p className="text-lg font-semibold">{clinica.clinica_nome}</p>}
            <p className="text-neutral-500">Plano de tratamento</p>
          </div>
          <div className="text-right text-neutral-500">
            {quote && <p className="font-semibold text-neutral-900">Orçamento nº {quote.numero}</p>}
            <p>Emitido em {data(hojeISO())}</p>
          </div>
        </header>

        <div className="mb-6 grid gap-1">
          <p>
            <span className="text-neutral-500">Paciente: </span>
            <strong>{paciente.nome}</strong>
          </p>
          {medico && (
            <p>
              <span className="text-neutral-500">Médico(a) responsável: </span>
              {medico.nome}
              {medico.registro_profissional && ` · ${medico.registro_profissional}`}
            </p>
          )}
          <p>
            <span className="text-neutral-500">Período: </span>
            {data(plano.inicio)} a {format(fim, "dd/MM/yyyy")}
          </p>
          <p>
            <span className="text-neutral-500">Andamento: </span>
            {realizadas} de {previstas} semanas realizadas{puladas > 0 && ` · ${puladas} pulada(s)`}
          </p>
        </div>

        {[...porMes.entries()].map(([mes, lista]) => (
          <section key={mes} className="mb-5 break-inside-avoid">
            <h2 className="mb-2 border-b border-neutral-200 pb-1 font-semibold capitalize">{mes}</h2>
            <table className="w-full border-collapse">
              <tbody>
                {lista.map((s) => {
                  const ini = inicioDaSemana(plano.inicio, s.semana);
                  const app = apps.get(s.chave);
                  const doses = dados.doses.filter((d) => d.semana === s.semana && d.sub_semana === s.sub);
                  const itensFeitos = app ? dados.itens.filter((i) => i.application_id === app.id) : [];
                  return (
                    <tr key={s.chave} className="border-b border-neutral-100 align-top">
                      <td className="w-32 py-1.5 pr-3">
                        <p className="font-medium">{rotuloSemana(s.semana, s.sub)}</p>
                        <p className="text-xs text-neutral-500">
                          {dataCurta(ini)} a {dataCurta(addDays(ini, 6))}
                        </p>
                      </td>
                      <td className="py-1.5">
                        {app?.status === "concluida"
                          ? itensFeitos.map((i) => (
                              <p key={i.id}>
                                {nomeCompra(i.purchase_id)}: {qtd(i.dose_real, i.unidade)}
                              </p>
                            ))
                          : doses.map((d) => (
                              <p key={d.id}>
                                {nomeCompra(d.purchase_id)}: {qtd(d.dose, unidade(d.purchase_id))}
                              </p>
                            ))}
                      </td>
                      <td className="w-36 py-1.5 text-right text-neutral-600">
                        {app?.status === "concluida"
                          ? `Realizada ${data(app.data_aplicacao)}`
                          : app?.status === "pulada"
                            ? "Pulada"
                            : "A realizar"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}

        {clinica?.clinica_rodape && (
          <footer className="mt-12 border-t border-neutral-300 pt-4 text-xs whitespace-pre-wrap text-neutral-500">
            {clinica.clinica_rodape}
          </footer>
        )}
      </article>
    </div>
  );
}
