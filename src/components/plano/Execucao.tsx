import { useMutation } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { Check, CheckCircle2, Pencil, SkipForward, Syringe, Undo2 } from "lucide-react";
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
  const { data: produtos = [] } = useProdutos();
  const { data: perfis = [] } = usePerfis();
  const [realizar, setRealizar] = useState<Semana | null>(null);
  const [pular, setPular] = useState<Semana | null>(null);
  const [editar, setEditar] = useState<Semana | null>(null);
  const [cancelar, setCancelar] = useState<Application | null>(null);

  // Semanas (com suas sub-semanas) em ordem.
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
    const porSemana = new Map<number, Semana[]>();
    for (const s of mapa.values()) porSemana.set(s.semana, [...(porSemana.get(s.semana) ?? []), s]);
    return [...porSemana.entries()]
      .sort(([a], [b]) => a - b)
      .map(([semana, subs]) => ({ semana, subs: subs.sort((a, b) => a.sub - b.sub) }));
  }, [dados]);

  const nomeCompra = (purchaseId: string) => {
    const c = dados.compras.find((x) => x.id === purchaseId);
    return procs.find((p) => p.id === c?.procedure_id)?.nome ?? "…";
  };
  const unidadeCompra = (purchaseId: string) => dados.compras.find((x) => x.id === purchaseId)?.unidade_dose;
  const nomePerfil = (id: string | null) => perfis.find((p) => p.id === id)?.nome ?? "—";
  const nomeProduto = (id: string) => produtos.find((p) => p.id === id);

  function situacao(s: Semana): "realizada" | "pulada" | "bloqueada" | "atrasada" | "a_realizar" {
    if (s.app?.status === "concluida") return "realizada";
    if (s.app?.status === "pulada") return "pulada";
    if (plano.status !== "ativo") return "bloqueada";
    const fim = addDays(inicioDaSemana(plano.inicio, s.semana), 6);
    return (diasAte(format(fim, "yyyy-MM-dd")) ?? 0) < 0 ? "atrasada" : "a_realizar";
  }

  if (semanas.length === 0) return <Vazio>Nenhuma semana prescrita ainda.</Vazio>;

  return (
    <div className="grid gap-2.5">
      {semanas.map(({ semana, subs }) => {
        const ini = inicioDaSemana(plano.inicio, semana);
        const sits = subs.map(situacao);
        const tudoFeito = sits.every((x) => x === "realizada" || x === "pulada");
        const algumAtraso = sits.includes("atrasada");
        const dividida = subs.length > 1;

        return (
          <div key={semana} className="cartao px-5 py-4">
            <div className="flex gap-3">
              <div
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  tudoFeito
                    ? "bg-[var(--sucesso)] text-white"
                    : algumAtraso
                      ? "bg-[var(--erro)]/10 text-[var(--erro)]"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {tudoFeito ? <CheckCircle2 className="size-4" /> : semana}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Semana {semana}</span>
                  <span className="text-xs text-muted-foreground">
                    {dataCurta(ini)} a {dataCurta(addDays(ini, 6))}
                  </span>
                  {dividida && (
                    <span className="rounded-full bg-[var(--info)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--info)]">
                      Dividida em {subs.length} aplicações
                    </span>
                  )}
                </div>

                <div className={dividida ? "grid gap-3" : ""}>
                  {subs.map((s, idx) => {
                    const sit = sits[idx] ?? "a_realizar";
                    const itensApp = s.app ? dados.itens.filter((i) => i.application_id === s.app?.id) : [];
                    return (
                      <div
                        key={s.sub}
                        className={dividida ? "flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted/40 p-3" : "flex flex-wrap items-start justify-between gap-3"}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          {dividida && (
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              {s.sub}ª aplicação
                            </p>
                          )}
                          {sit === "realizada"
                            ? itensApp.map((i) => {
                                const consumos = dados.consumos.filter((c) => c.application_item_id === i.id);
                                return (
                                  <p key={i.id}>
                                    <span className="font-semibold">{nomeCompra(i.purchase_id)}</span>
                                    <span className="text-muted-foreground">
                                      {" — "}
                                      {consumos.length
                                        ? consumos
                                            .map((c) => {
                                              const pr = nomeProduto(c.product_id);
                                              return `${pr?.nome ?? ""} ${qtd(c.quantidade, pr?.unidade)}`;
                                            })
                                            .join(" + ")
                                        : qtd(i.dose_real, i.unidade)}
                                      {i.dose_real !== i.dose_prevista && ` (previsto ${qtd(i.dose_prevista, i.unidade)})`}
                                    </span>
                                  </p>
                                );
                              })
                            : s.doses.map((d) => {
                                const obs = dados.compras.find((c) => c.id === d.purchase_id)?.observacao;
                                return (
                                  <div key={d.id}>
                                    <p>
                                      <span className="font-semibold">{nomeCompra(d.purchase_id)}</span>
                                      <span className="text-muted-foreground"> — {qtd(d.dose, unidadeCompra(d.purchase_id))}</span>
                                    </p>
                                    {obs && <p className="text-xs italic text-muted-foreground">{obs}</p>}
                                  </div>
                                );
                              })}
                          {sit === "realizada" && s.app && (
                            <p className="text-xs text-[var(--sucesso)]">
                              Aplicada em {data(s.app.data_aplicacao)} · {format(parseISO(s.app.created_at), "HH:mm")} · por{" "}
                              {nomePerfil(s.app.enfermeiro_id)}
                            </p>
                          )}
                          {s.app?.observacoes && (
                            <p className="text-xs italic text-muted-foreground">
                              {sit === "pulada" ? "Motivo: " : ""}
                              {s.app.observacoes}
                            </p>
                          )}

                          {pode && (
                            <div className="flex flex-wrap gap-1.5 pt-1 [&_button]:h-7 [&_button]:px-2.5 [&_button]:text-xs">
                              {(sit === "a_realizar" || sit === "atrasada") && s.doses.length > 0 && (
                                <>
                                  <Button size="sm" onClick={() => setRealizar(s)}>
                                    <Syringe /> Realizar
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setPular(s)}>
                                    <SkipForward /> Pular
                                  </Button>
                                </>
                              )}
                              {sit === "realizada" && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => setEditar(s)}>
                                    <Pencil /> Editar
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => s.app && setCancelar(s.app)}>
                                    <Undo2 /> Cancelar
                                  </Button>
                                </>
                              )}
                              {sit === "pulada" && (
                                <Button size="sm" variant="ghost" onClick={() => s.app && setCancelar(s.app)}>
                                  <Undo2 /> Desfazer
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        <StatusSemana sit={sit} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
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

function StatusSemana({ sit }: { sit: "realizada" | "pulada" | "bloqueada" | "atrasada" | "a_realizar" }) {
  const cfg = {
    realizada: { texto: "Realizada", cls: "border-transparent bg-[var(--sucesso)]/10 text-[var(--sucesso)]" },
    pulada: { texto: "Pulada", cls: "border-transparent bg-[var(--atencao)]/10 text-[var(--atencao)]" },
    bloqueada: { texto: "Bloqueada", cls: "border-transparent bg-muted text-muted-foreground" },
    atrasada: { texto: "Atrasada", cls: "border-transparent bg-[var(--erro)]/10 text-[var(--erro)]" },
    a_realizar: { texto: "A realizar", cls: "border-transparent bg-[var(--info)]/10 text-[var(--info)]" },
  }[sit];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {sit === "realizada" && <CheckCircle2 className="size-3.5" />}
      {cfg.texto}
    </span>
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
            <div key={dose.id} className="rounded-[16px] border bg-card p-4">
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
