import { addDays } from "date-fns";
import { CheckCircle2, FileText, Lock } from "lucide-react";
import { useState } from "react";

import { Vazio } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { usePode } from "@/lib/auth";
import { data, dataCurta, inicioDaSemana, qtd, rotuloSemana } from "@/lib/format";
import { useProcedimentos } from "@/lib/queries";
import type { Plan } from "@/lib/types";

import { chaveSemana, type DadosPlano } from "./dados";
import { Prescricao } from "./Prescricao";

/** Prescrição como no NutroClinic: resumo por semana e botão "Alterar prescrição" para editar. */
export function PrescricaoComResumo({ plano, dados }: { plano: Plan; dados: DadosPlano }) {
  const pode = usePode("admin", "medico") && plano.status !== "encerrado";
  const [editando, setEditando] = useState(false);
  const { data: procs = [] } = useProcedimentos();

  // Recria o editor só quando as doses gravadas mudam.
  const versao = dados.doses.map((d) => `${d.id}:${d.semana}:${d.sub_semana}:${d.dose}:${d.status}`).join("|");

  if (editando || dados.doses.length === 0) {
    return (
      <div className="grid gap-3">
        {dados.doses.length > 0 && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setEditando(false)}>
              Voltar ao resumo
            </Button>
          </div>
        )}
        {dados.doses.length === 0 && !pode ? (
          <Vazio>Ainda não há prescrição.</Vazio>
        ) : (
          <Prescricao key={`${plano.id}:${versao}`} plano={plano} dados={dados} />
        )}
      </div>
    );
  }

  const nomeCompra = (purchaseId: string) => {
    const c = dados.compras.find((x) => x.id === purchaseId);
    return procs.find((p) => p.id === c?.procedure_id)?.nome ?? "…";
  };
  const unidade = (purchaseId: string) => dados.compras.find((x) => x.id === purchaseId)?.unidade_dose;
  const feitas = new Set(
    dados.aplicacoes
      .filter((a) => a.status === "concluida" || a.status === "pulada")
      .map((a) => chaveSemana(a.semana, a.sub_semana)),
  );
  const criadaEm = dados.doses.map((d) => d.created_at).sort()[0];

  const linhas = [...new Set(dados.doses.map((d) => chaveSemana(d.semana, d.sub_semana)))]
    .map((k) => {
      const [s, sub] = k.split("-").map(Number);
      return { semana: s ?? 1, sub: sub ?? 1, chave: k };
    })
    .sort((a, b) => a.semana - b.semana || a.sub - b.sub);

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5" />
          <div>
            <p className="font-semibold">Prescrição já realizada</p>
            <p className="text-sm text-muted-foreground">
              Criada em {data(criadaEm?.slice(0, 10))} · {dados.doses.length} itens · Status: {plano.status}
            </p>
          </div>
        </div>
        {pode && (
          <Button variant="outline" onClick={() => setEditando(true)}>
            <FileText /> Alterar prescrição
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        {linhas.map(({ semana, sub, chave }) => {
          const ini = inicioDaSemana(plano.inicio, semana);
          const doses = dados.doses.filter((d) => d.semana === semana && d.sub_semana === sub);
          return (
            <div key={chave} className="flex flex-wrap items-center gap-2 rounded-full border px-4 py-2">
              <span className="w-14 font-semibold">
                S{semana}
                {sub > 1 && <span className="text-muted-foreground">·{sub}</span>}
              </span>
              <span className="w-24 text-xs text-muted-foreground">
                {dataCurta(ini)} a {dataCurta(addDays(ini, 6))}
              </span>
              {doses.map((d) => (
                <span
                  key={d.id}
                  title={`${nomeCompra(d.purchase_id)} · ${qtd(d.dose, unidade(d.purchase_id))}`}
                  className={`inline-flex max-w-56 items-center gap-2 rounded-full px-3 py-1 text-sm ${
                    d.status === "realizada"
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-900 text-white dark:bg-slate-700"
                  }`}
                >
                  <span className="truncate">{nomeCompra(d.purchase_id)}</span>
                  <span className="shrink-0 opacity-80">{qtd(d.dose, unidade(d.purchase_id))}</span>
                </span>
              ))}
              {feitas.has(chave) && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" /> {rotuloSemana(semana, sub)} feita
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
