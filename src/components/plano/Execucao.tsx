import { useMutation } from "@tanstack/react-query";
import { Check, Pencil, SkipForward, Syringe, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Campo, Etiqueta, Seletor, Vazio } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePode } from "@/lib/auth";
import { data, dataCurta, diasAte, hojeISO, inicioDaSemana, num, qtd, rotuloSemana } from "@/lib/format";
import { useComposicao, useLotesComSaldo, usePerfis, useProcedimentos, useProdutos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Application, Plan, PlanDose } from "@/lib/types";

import { chaveSemana, consumoProduto, useRecarregarPlano, type DadosPlano } from "./dados";

type Semana = {
  semana: number;
  sub: number;
  doses: PlanDose[];
  app: Application | undefined;
};

export function Execucao({ plano, dados }: { plano: Plan; dados: DadosPlano }) {
  const pode = usePode("admin", "medico", "enfermagem");
  const { data: procs = [] } = useProcedimentos();
  const { data: perfis = [] } = usePerfis();
  const [realizar, setRealizar] = useState<Semana | null>(null);
  const [pular, setPular] = useState<Semana | null>(null);
  const [editar, setEditar] = useState<Semana | null>(null);
  const [cancelar, setCancelar] = useState<Application | null>(null);

  const semanas = useMemo(() => {
    const mapa = new Map<string, Semana>();
    const pegar = (semana: number, sub: number) => {
      const k = chaveSemana(semana, sub);
      let s = mapa.get(k);
      if (!s) {
        s = { semana, sub, doses: [], app: undefined };
        mapa.set(k, s);
      }
      return s;
    };
    for (const d of dados.doses) pegar(d.semana, d.sub_semana).doses.push(d);
    for (const a of dados.aplicacoes) {
      if (a.status === "cancelada") continue;
      pegar(a.semana, a.sub_semana).app = a;
    }
    return [...mapa.values()].sort((a, b) => a.semana - b.semana || a.sub - b.sub);
  }, [dados]);

  const nomeCompra = (purchaseId: string) => {
    const c = dados.compras.find((x) => x.id === purchaseId);
    return procs.find((p) => p.id === c?.procedure_id)?.nome ?? "…";
  };
  const unidadeCompra = (purchaseId: string) => dados.compras.find((x) => x.id === purchaseId)?.unidade_dose;
  const nomePerfil = (id: string | null) => perfis.find((p) => p.id === id)?.nome ?? "—";

  if (semanas.length === 0) return <Vazio>Nenhuma semana prescrita ainda.</Vazio>;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {semanas.map((s) => {
        const ini = inicioDaSemana(plano.inicio, s.semana);
        const fimISO = new Date(ini.getTime() + 6 * 86400000).toISOString().slice(0, 10);
        const realizada = s.app?.status === "concluida";
        const pulada = s.app?.status === "pulada";
        const atrasada = !s.app && plano.status === "ativo" && (diasAte(fimISO) ?? 0) < 0;
        const bloqueada = !s.app && plano.status !== "ativo";
        const itensApp = s.app ? dados.itens.filter((i) => i.application_id === s.app?.id) : [];

        return (
          <div key={chaveSemana(s.semana, s.sub)} className="flex flex-col rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{rotuloSemana(s.semana, s.sub)}</p>
                <p className="text-xs text-muted-foreground">
                  {dataCurta(ini)} a {dataCurta(new Date(ini.getTime() + 6 * 86400000))}
                </p>
              </div>
              {realizada ? (
                <Etiqueta tom="ok">Realizada {data(s.app?.data_aplicacao)}</Etiqueta>
              ) : pulada ? (
                <Etiqueta tom="alerta">Pulada</Etiqueta>
              ) : bloqueada ? (
                <Etiqueta>Bloqueada</Etiqueta>
              ) : atrasada ? (
                <Etiqueta tom="perigo">Atrasada</Etiqueta>
              ) : (
                <Etiqueta tom="info">A realizar</Etiqueta>
              )}
            </div>

            <ul className="mb-3 flex-1 space-y-1 text-sm">
              {realizada
                ? itensApp.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span>{nomeCompra(i.purchase_id)}</span>
                      <span className={i.dose_real !== i.dose_prevista ? "font-medium text-amber-700" : ""}>
                        {qtd(i.dose_real, i.unidade)}
                        {i.dose_real !== i.dose_prevista && (
                          <span className="text-xs text-muted-foreground"> (prev. {qtd(i.dose_prevista)})</span>
                        )}
                      </span>
                    </li>
                  ))
                : s.doses.map((d) => (
                    <li key={d.id} className="flex justify-between gap-2">
                      <span>{nomeCompra(d.purchase_id)}</span>
                      <span>{qtd(d.dose, unidadeCompra(d.purchase_id))}</span>
                    </li>
                  ))}
              {pulada && <li className="text-muted-foreground">Motivo: {s.app?.observacoes}</li>}
            </ul>

            {realizada && (
              <p className="mb-2 text-xs text-muted-foreground">Por {nomePerfil(s.app?.enfermeiro_id ?? null)}</p>
            )}

            {pode && (
              <div className="flex flex-wrap gap-2">
                {!s.app && !bloqueada && s.doses.length > 0 && (
                  <>
                    <Button size="sm" onClick={() => setRealizar(s)}>
                      <Syringe /> Realizar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPular(s)}>
                      <SkipForward /> Pular
                    </Button>
                  </>
                )}
                {realizada && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditar(s)}>
                      <Pencil /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => s.app && setCancelar(s.app)}>
                      <Undo2 /> Cancelar
                    </Button>
                  </>
                )}
                {pulada && (
                  <Button size="sm" variant="ghost" onClick={() => s.app && setCancelar(s.app)}>
                    <Undo2 /> Desfazer
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {realizar && <Realizar plano={plano} dados={dados} semana={realizar} nomeCompra={nomeCompra} fechar={() => setRealizar(null)} />}
      {pular && <Pular plano={plano} semana={pular} fechar={() => setPular(null)} />}
      {editar && <Editar dados={dados} semana={editar} nomeCompra={nomeCompra} fechar={() => setEditar(null)} />}
      {cancelar && <Cancelar app={cancelar} fechar={() => setCancelar(null)} />}
    </div>
  );
}

// ─── Realizar ───────────────────────────────────────────────

type ItemForm = { dose_real: string; lotes: Record<string, string> };

function Realizar({
  plano,
  dados,
  semana,
  nomeCompra,
  fechar,
}: {
  plano: Plan;
  dados: DadosPlano;
  semana: Semana;
  nomeCompra: (id: string) => string;
  fechar: () => void;
}) {
  const recarregar = useRecarregarPlano();
  const { data: comp = [] } = useComposicao();
  const { data: produtos = [] } = useProdutos();
  const { data: lotes = [] } = useLotesComSaldo();
  const [dataApl, setDataApl] = useState(hojeISO());
  const [obs, setObs] = useState("");
  const [form, setForm] = useState<Record<string, ItemForm>>(() =>
    Object.fromEntries(semana.doses.map((d) => [d.id, { dose_real: String(d.dose), lotes: {} }])),
  );

  // Consumo por dose e produto, com o lote sugerido pela validade mais próxima (FEFO).
  const linhas = semana.doses.map((d) => {
    const compra = dados.compras.find((c) => c.id === d.purchase_id);
    const f = form[d.id] ?? { dose_real: String(d.dose), lotes: {} };
    const doseReal = num(f.dose_real);
    const produtosDaDose = comp
      .filter((c) => c.procedure_id === compra?.procedure_id)
      .map((c) => {
        const prod = produtos.find((p) => p.id === c.product_id);
        const consumo = prod && compra ? consumoProduto(prod.unidade, compra.unidade_dose, doseReal, c.quantidade_padrao) : 0;
        const opcoes = lotes.filter(
          (l) => l.product_id === c.product_id && (l.validade === null || (diasAte(l.validade) ?? 0) >= 0),
        );
        const sugerido = opcoes.find((l) => l.quantidade_atual >= consumo) ?? opcoes[0];
        const escolhido = opcoes.find((l) => l.id === f.lotes[c.product_id]) ?? sugerido;
        return { prod, consumo, opcoes, escolhido };
      });
    return { dose: d, compra, f, produtosDaDose };
  });

  // Mesmo lote usado por mais de uma dose: soma antes de conferir saldo.
  const usoPorLote = new Map<string, number>();
  for (const l of linhas)
    for (const p of l.produtosDaDose)
      if (p.escolhido) usoPorLote.set(p.escolhido.id, (usoPorLote.get(p.escolhido.id) ?? 0) + p.consumo);
  const faltas = [...usoPorLote.entries()]
    .map(([id, uso]) => ({ lote: lotes.find((l) => l.id === id), uso }))
    .filter(({ lote, uso }) => lote && lote.quantidade_atual < uso);
  const semLote = linhas.some((l) => l.produtosDaDose.some((p) => p.consumo > 0 && !p.escolhido));

  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase.rpc("realizar_aplicacao", {
          p_plan_id: plano.id,
          p_semana: semana.semana,
          p_sub_semana: semana.sub,
          p_data: dataApl,
          p_observacoes: obs.trim() || null,
          p_itens: linhas.map((l) => ({
            plan_dose_id: l.dose.id,
            dose_real: num(l.f.dose_real),
            lotes: Object.fromEntries(
              l.produtosDaDose.filter((p) => p.prod && p.escolhido).map((p) => [p.prod?.id, p.escolhido?.id]),
            ),
          })),
        }),
      ),
    onSuccess: () => {
      toast.success("Aplicação registrada e estoque baixado.");
      recarregar();
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  const setItem = (id: string, f: ItemForm) => setForm((x) => ({ ...x, [id]: f }));

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Realizar · {rotuloSemana(semana.semana, semana.sub)}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {linhas.map(({ dose, compra, f, produtosDaDose }) => (
            <div key={dose.id} className="rounded-lg border p-3">
              <div className="mb-2 flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <p className="font-medium">{nomeCompra(dose.purchase_id)}</p>
                  <p className="text-xs text-muted-foreground">Dose prevista: {qtd(dose.dose, compra?.unidade_dose)}</p>
                </div>
                <Campo label="Dose real" className="w-28">
                  <Input
                    inputMode="decimal"
                    value={f.dose_real}
                    onChange={(e) => setItem(dose.id, { ...f, dose_real: e.target.value })}
                  />
                </Campo>
              </div>
              {produtosDaDose.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem composição cadastrada: não baixa estoque.</p>
              )}
              {produtosDaDose.map((p) =>
                p.prod ? (
                  <div key={p.prod.id} className="mt-2 grid gap-1">
                    <p className="text-sm">
                      {p.prod.nome}: consome <strong>{qtd(p.consumo, p.prod.unidade)}</strong>
                    </p>
                    {p.opcoes.length === 0 ? (
                      <p className="text-sm text-destructive">Sem lote válido com saldo.</p>
                    ) : (
                      <Seletor
                        value={p.escolhido?.id ?? ""}
                        onChange={(e) => setItem(dose.id, { ...f, lotes: { ...f.lotes, [p.prod?.id ?? ""]: e.target.value } })}
                      >
                        {p.opcoes.map((l) => (
                          <option key={l.id} value={l.id}>
                            Lote {l.lote} · saldo {qtd(l.quantidade_atual, p.prod?.unidade)} · val. {data(l.validade)}
                            {l.fornecedor ? ` · ${l.fornecedor}` : ""}
                          </option>
                        ))}
                      </Seletor>
                    )}
                  </div>
                ) : null,
              )}
            </div>
          ))}

          {faltas.length > 0 && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
              {faltas.map(({ lote, uso }) => (
                <p key={lote?.id}>
                  Lote {lote?.lote} não tem saldo: tem {qtd(lote?.quantidade_atual)}, precisa de {qtd(uso)}, faltam{" "}
                  {qtd(uso - (lote?.quantidade_atual ?? 0))}.
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Data da aplicação">
              <Input type="date" value={dataApl} onChange={(e) => setDataApl(e.target.value)} />
            </Campo>
          </div>
          <Campo label="Observações">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </Campo>
          <p className="text-xs text-muted-foreground">
            O saldo é conferido de novo no banco no momento de gravar. Se faltar, nada é gravado.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Voltar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || faltas.length > 0 || semLote}>
            <Check /> Confirmar aplicação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pular ──────────────────────────────────────────────────

function Pular({ plano, semana, fechar }: { plano: Plan; semana: Semana; fechar: () => void }) {
  const recarregar = useRecarregarPlano();
  const [motivo, setMotivo] = useState("");
  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase.rpc("pular_semana", {
          p_plan_id: plano.id,
          p_semana: semana.semana,
          p_sub_semana: semana.sub,
          p_motivo: motivo.trim(),
        }),
      ),
    onSuccess: () => {
      toast.success("Semana pulada. As seguintes andaram uma semana.");
      recarregar();
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pular {rotuloSemana(semana.semana, semana.sub)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A dose não se perde: esta semana e todas as seguintes andam uma semana para frente. A semana pulada não
          conta no progresso.
        </p>
        <Campo label="Motivo">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Voltar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!motivo.trim() || salvar.isPending}>
            Pular semana
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Editar dose (com senha) ────────────────────────────────

function Editar({
  dados,
  semana,
  nomeCompra,
  fechar,
}: {
  dados: DadosPlano;
  semana: Semana;
  nomeCompra: (id: string) => string;
  fechar: () => void;
}) {
  const recarregar = useRecarregarPlano();
  const itens = dados.itens.filter((i) => i.application_id === semana.app?.id);
  const [doses, setDoses] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, String(i.dose_real)])),
  );
  const [senha, setSenha] = useState("");
  const [motivo, setMotivo] = useState("");

  const mudados = itens.filter((i) => num(doses[i.id]) !== i.dose_real);

  const salvar = useMutation({
    mutationFn: async () => {
      for (const i of mudados) {
        check(
          await supabase.rpc("editar_dose_aplicacao", {
            p_application_item_id: i.id,
            p_nova_dose: num(doses[i.id]),
            p_senha: senha,
            p_motivo: motivo.trim(),
          }),
        );
      }
    },
    onSuccess: () => {
      toast.success("Dose corrigida e estoque ajustado.");
      recarregar();
      fechar();
    },
    onError: (e) => {
      toast.error(e.message);
      recarregar();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar · {rotuloSemana(semana.semana, semana.sub)}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {itens.map((i) => (
            <div key={i.id} className="flex items-end gap-3">
              <p className="flex-1 text-sm">{nomeCompra(i.purchase_id)}</p>
              <Campo label={`Dose real (${qtd(i.dose_real, i.unidade)})`} className="w-40">
                <Input
                  inputMode="decimal"
                  value={doses[i.id] ?? ""}
                  onChange={(e) => setDoses({ ...doses, [i.id]: e.target.value })}
                />
              </Campo>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Aumentou a dose, sai mais do mesmo lote; diminuiu, volta para o lote.
          </p>
          <Campo label="Motivo">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <Campo label="Senha de edição de aplicações">
            <Input type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Voltar
          </Button>
          <Button
            onClick={() => salvar.mutate()}
            disabled={!mudados.length || !senha || !motivo.trim() || salvar.isPending}
          >
            Salvar correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancelar / desfazer (com senha) ────────────────────────

function Cancelar({ app, fechar }: { app: Application; fechar: () => void }) {
  const recarregar = useRecarregarPlano();
  const [senha, setSenha] = useState("");
  const [motivo, setMotivo] = useState("");
  const pulada = app.status === "pulada";

  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase.rpc("cancelar_aplicacao", {
          p_application_id: app.id,
          p_senha: senha,
          p_motivo: motivo.trim(),
        }),
      ),
    onSuccess: () => {
      toast.success(pulada ? "Semana pulada desfeita." : "Aplicação cancelada e estoque devolvido.");
      recarregar();
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pulada ? "Desfazer semana pulada" : "Cancelar aplicação"} · {rotuloSemana(app.semana, app.sub_semana)}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {pulada
            ? "As doses voltam uma semana para trás."
            : "As quantidades consumidas voltam para os lotes (movimento de estorno) e a semana volta a ficar a realizar."}
        </p>
        <Campo label="Motivo">
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Campo>
        <Campo label="Senha de edição de aplicações">
          <Input type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={() => salvar.mutate()}
            disabled={!senha || !motivo.trim() || salvar.isPending}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
