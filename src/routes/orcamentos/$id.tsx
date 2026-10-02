import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Plus, Printer, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Seletor, Vazio } from "@/components/app/campos";
import {
  descreverQuantidade,
  STATUS_ORCAMENTO,
  useOrcamento,
  useRecarregarOrcamento,
  type DadosOrcamento,
} from "@/components/orcamento/dados";
import { useDadosPlano } from "@/components/plano/dados";
import { Prescricao } from "@/components/plano/Prescricao";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { brl, data, hojeISO, num, qtd, UNIDADE_LABEL } from "@/lib/format";
import { useComposicao, usePerfis, useProcedimentos, useProdutos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Plan, QuoteItem, QuoteStatus, UnidadeDose } from "@/lib/types";

export const Route = createFileRoute("/orcamentos/$id")({
  head: () => ({ meta: [{ title: "Orçamento — Controle de Aplicações" }] }),
  component: Orcamento,
});

function Orcamento() {
  const { id } = Route.useParams();
  const { data: dados } = useOrcamento(id);

  if (!dados) return <AppShell titulo="Orçamento">{null}</AppShell>;
  const { quote, paciente } = dados;
  const aberto = quote.status === "rascunho" || quote.status === "enviado";
  const st = STATUS_ORCAMENTO[quote.status];

  return (
    <AppShell
      titulo={`Orçamento nº ${quote.numero}`}
      acoes={
        <>
          <Button variant="outline" asChild>
            <Link to="/pacientes/$id" params={{ id: paciente.id }}>
              <ArrowLeft /> {paciente.nome}
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/imprimir-orcamento/${quote.id}`} target="_blank" rel="noreferrer">
              <Printer /> Imprimir / PDF
            </a>
          </Button>
        </>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        <Etiqueta tom={st.tom}>{st.label}</Etiqueta>
        <span className="text-muted-foreground">Criado em {data(quote.created_at.slice(0, 10))}</span>
        <Medico dados={dados} aberto={aberto} />
        {quote.status === "aprovado" && (
          <span className="text-muted-foreground">
            Aprovado em {data(quote.aprovado_em?.slice(0, 10))} ·{" "}
            <Link to="/pacientes/$id" params={{ id: paciente.id }} className="text-primary underline-offset-4 hover:underline">
              ver plano de tratamento
            </Link>
          </span>
        )}
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
        <div className="grid gap-8">
          <Itens dados={dados} aberto={aberto} />
          <Descontos dados={dados} aberto={aberto} />
          <Observacoes dados={dados} aberto={aberto} />
        </div>
        <aside className="grid h-fit gap-4 rounded-lg border p-4">
          <Linha rotulo="Subtotal" valor={brl(dados.total.subtotal)} />
          <Linha rotulo="Descontos" valor={`− ${brl(dados.total.desconto)}`} />
          <div className="border-t pt-3">
            <Linha rotulo="Total" valor={brl(dados.total.total)} forte />
          </div>
          {aberto && <Acoes dados={dados} />}
        </aside>
      </div>

      {quote.status === "aprovado" && quote.plan_id && <PrescricaoDoOrcamento planId={quote.plan_id} />}
    </AppShell>
  );
}

function PrescricaoDoOrcamento({ planId }: { planId: string }) {
  const { data: plano } = useQuery({
    queryKey: ["plans", "id", planId],
    queryFn: async () => check(await supabase.from("plans").select("*").eq("id", planId).single()) as Plan,
  });
  const { data: dados } = useDadosPlano(planId);
  if (!plano || !dados) return null;
  // Recria o editor só quando as doses gravadas mudam.
  const versao = dados.doses.map((d) => `${d.id}:${d.semana}:${d.sub_semana}:${d.dose}:${d.status}`).join("|");
  return (
    <section id="prescricao" className="mt-10 border-t pt-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Prescrição por semana</h2>
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          Semana 1 começa em {data(plano.inicio)} · a aplicação é registrada na página do paciente
          <Button size="sm" variant="outline" asChild>
            <a href={`/imprimir-plano/${plano.id}`} target="_blank" rel="noreferrer">
              <Printer /> Imprimir plano
            </a>
          </Button>
        </span>
      </div>
      <Prescricao key={`${plano.id}:${versao}`} plano={plano} dados={dados} />
    </section>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={`flex justify-between ${forte ? "text-lg font-semibold" : "text-sm"}`}>
      <span>{rotulo}</span>
      <span>{valor}</span>
    </div>
  );
}

function Medico({ dados, aberto }: { dados: DadosOrcamento; aberto: boolean }) {
  const { data: perfis = [] } = usePerfis();
  const recarregar = useRecarregarOrcamento();
  const medicos = perfis.filter((p) => p.ativo && (p.papel === "medico" || p.papel === "admin"));
  const salvar = useMutation({
    mutationFn: async (medico: string) =>
      check(await supabase.from("quotes").update({ medico_id: medico || null }).eq("id", dados.quote.id)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });

  if (!aberto) {
    const m = perfis.find((p) => p.id === dados.quote.medico_id);
    return m ? <span className="text-muted-foreground">Médico(a): {m.nome}</span> : null;
  }
  return (
    <label className="flex items-center gap-2 text-muted-foreground">
      Médico(a):
      <Seletor className="h-8 w-auto" value={dados.quote.medico_id ?? ""} onChange={(e) => salvar.mutate(e.target.value)}>
        <option value="">—</option>
        {medicos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </Seletor>
    </label>
  );
}

// ─── Itens ──────────────────────────────────────────────────

function Itens({ dados, aberto }: { dados: DadosOrcamento; aberto: boolean }) {
  const recarregar = useRecarregarOrcamento();
  const [editando, setEditando] = useState<QuoteItem | "novo" | null>(null);

  const remover = useMutation({
    mutationFn: async (id: string) => check(await supabase.from("quote_items").delete().eq("id", id)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Itens</h2>
        {aberto && (
          <Button size="sm" onClick={() => setEditando("novo")}>
            <Plus /> Adicionar item
          </Button>
        )}
      </div>
      {dados.itens.length === 0 ? (
        <Vazio>Nenhum item ainda.</Vazio>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Procedimento</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead className="text-right">Valor unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.itens.map((i) => (
                <TableRow
                  key={i.id}
                  className={aberto ? "cursor-pointer" : undefined}
                  onClick={() => aberto && setEditando(i)}
                >
                  <TableCell className="font-medium">{i.descricao}</TableCell>
                  <TableCell>{descreverQuantidade(i)}</TableCell>
                  <TableCell className="text-right">
                    {brl(i.preco_unitario)}
                    <span className="text-xs text-muted-foreground">
                      {i.vendido_por === "aplicacao" ? " /aplic." : ` /${UNIDADE_LABEL[i.unidade_dose]}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{brl(i.subtotal)}</TableCell>
                  <TableCell className="text-right">
                    {aberto && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          remover.mutate(i.id);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Subtotal</TableCell>
                <TableCell className="text-right">{brl(dados.total.subtotal)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      {editando && (
        <FormItem
          quoteId={dados.quote.id}
          item={editando === "novo" ? null : editando}
          fechar={() => setEditando(null)}
        />
      )}
    </section>
  );
}

function FormItem({ quoteId, item, fechar }: { quoteId: string; item: QuoteItem | null; fechar: () => void }) {
  const recarregar = useRecarregarOrcamento();
  const { data: procs = [] } = useProcedimentos();
  const { data: comp = [] } = useComposicao();
  const { data: produtos = [] } = useProdutos();
  const [procId, setProcId] = useState(item?.procedure_id ?? "");
  const [descricao, setDescricao] = useState(item?.descricao ?? "");
  const [quantidade, setQuantidade] = useState(item ? String(item.quantidade) : "");
  const [unidadeDose, setUnidadeDose] = useState<UnidadeDose>(item?.unidade_dose ?? "aplicacao");
  const [dose, setDose] = useState(item ? String(item.dose_padrao) : "1");
  const [preco, setPreco] = useState(item ? String(item.preco_unitario) : "");

  const proc = procs.find((p) => p.id === procId);
  const porAplicacao = proc?.forma_venda !== "unidade";

  function escolher(id: string) {
    setProcId(id);
    const p = procs.find((x) => x.id === id);
    if (!p) return;
    setDescricao(p.nome);
    setPreco(String(p.preco_base));
    // Sugere unidade e dose pelo primeiro produto em UI/mL da composição.
    const alvo = comp
      .filter((c) => c.procedure_id === id)
      .map((c) => ({ c, prod: produtos.find((x) => x.id === c.product_id) }))
      .find(({ prod }) => prod?.unidade === "ui" || prod?.unidade === "ml");
    if (alvo?.prod && (alvo.prod.unidade === "ui" || alvo.prod.unidade === "ml")) {
      setUnidadeDose(alvo.prod.unidade);
      setDose(String(alvo.c.quantidade_padrao));
    } else {
      setUnidadeDose(p.forma_venda === "unidade" ? "ui" : "aplicacao");
      setDose("1");
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!proc) throw new Error("Escolha o procedimento.");
      const linha = {
        quote_id: quoteId,
        procedure_id: proc.id,
        descricao: descricao.trim() || proc.nome,
        vendido_por: proc.forma_venda,
        quantidade: num(quantidade),
        unidade_dose: unidadeDose,
        dose_padrao: unidadeDose === "aplicacao" ? 1 : num(dose),
        preco_unitario: num(preco),
      };
      if (item) check(await supabase.from("quote_items").update(linha).eq("id", item.id));
      else check(await supabase.from("quote_items").insert(linha));
    },
    onSuccess: () => {
      recarregar();
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  const subtotal = num(quantidade) * num(preco);

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Adicionar item"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <Campo label="Procedimento">
            <Seletor value={procId} onChange={(e) => escolher(e.target.value)} required>
              <option value="">Escolha…</option>
              {procs
                .filter((p) => (p.ativo && p.categoria !== "acompanhamento") || p.id === procId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.forma_venda === "aplicacao" ? "por aplicação" : "por UI/mL"})
                  </option>
                ))}
            </Seletor>
          </Campo>
          <Campo label="Descrição no orçamento">
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label={porAplicacao ? "Nº de aplicações" : `Quantidade (${UNIDADE_LABEL[unidadeDose]})`}>
              <Input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
            </Campo>
            <Campo label="Unidade da dose">
              <Seletor value={unidadeDose} onChange={(e) => setUnidadeDose(e.target.value as UnidadeDose)}>
                {porAplicacao && <option value="aplicacao">Aplicação (dose fixa)</option>}
                <option value="ui">UI</option>
                <option value="ml">mL</option>
              </Seletor>
            </Campo>
            {unidadeDose !== "aplicacao" && (
              <Campo label={porAplicacao ? "Dose por aplicação" : "Dose semanal sugerida"}>
                <Input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} required />
              </Campo>
            )}
            <Campo label={porAplicacao ? "Valor por aplicação (R$)" : `Valor por ${UNIDADE_LABEL[unidadeDose]} (R$)`}>
              <Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} required />
            </Campo>
          </div>
          <p className="text-sm text-muted-foreground">
            Subtotal: <strong>{brl(subtotal)}</strong>
            {porAplicacao && unidadeDose !== "aplicacao" && num(quantidade) > 0 && (
              <> · contratado {qtd(num(quantidade) * num(dose), unidadeDose)}</>
            )}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Descontos ──────────────────────────────────────────────

function Descontos({ dados, aberto }: { dados: DadosOrcamento; aberto: boolean }) {
  const recarregar = useRecarregarOrcamento();
  const [motivo, setMotivo] = useState("");
  const [tipo, setTipo] = useState<"reais" | "percentual">("reais");
  const [valor, setValor] = useState("");

  const adicionar = useMutation({
    mutationFn: async () => {
      if (!motivo.trim()) throw new Error("O motivo do desconto é obrigatório.");
      check(
        await supabase
          .from("quote_discounts")
          .insert({ quote_id: dados.quote.id, motivo: motivo.trim(), tipo, valor: num(valor) }),
      );
    },
    onSuccess: () => {
      setMotivo("");
      setValor("");
      recarregar();
    },
    onError: (e) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => check(await supabase.from("quote_discounts").delete().eq("id", id)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });

  return (
    <section>
      <h2 className="mb-3 font-medium">Descontos</h2>
      {dados.descontos.length > 0 && (
        <ul className="mb-3 divide-y rounded-lg border">
          {dados.descontos.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
              <span>
                {d.motivo}
                {d.tipo === "percentual" && <span className="text-muted-foreground"> ({qtd(d.valor)}%)</span>}
              </span>
              <span className="flex items-center gap-2">
                − {brl(d.valor_reais)}
                {aberto && (
                  <Button size="icon" variant="ghost" onClick={() => remover.mutate(d.id)}>
                    <Trash2 />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {dados.descontos.length === 0 && !aberto && <p className="text-sm text-muted-foreground">Sem descontos.</p>}
      {aberto && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            adicionar.mutate();
          }}
        >
          <Campo label="Motivo" className="min-w-48 flex-1">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: pagamento à vista" />
          </Campo>
          <Campo label="Tipo" className="w-28">
            <Seletor value={tipo} onChange={(e) => setTipo(e.target.value as "reais" | "percentual")}>
              <option value="reais">R$</option>
              <option value="percentual">%</option>
            </Seletor>
          </Campo>
          <Campo label="Valor" className="w-28">
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
          <Button type="submit" variant="outline" disabled={!motivo.trim() || num(valor) <= 0 || adicionar.isPending}>
            <Plus /> Desconto
          </Button>
        </form>
      )}
    </section>
  );
}

function Observacoes({ dados, aberto }: { dados: DadosOrcamento; aberto: boolean }) {
  const recarregar = useRecarregarOrcamento();
  const [texto, setTexto] = useState(dados.quote.observacoes ?? "");
  const salvar = useMutation({
    mutationFn: async () =>
      check(await supabase.from("quotes").update({ observacoes: texto.trim() || null }).eq("id", dados.quote.id)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });

  if (!aberto) {
    return dados.quote.observacoes ? (
      <section>
        <h2 className="mb-2 font-medium">Observações</h2>
        <p className="whitespace-pre-wrap text-sm">{dados.quote.observacoes}</p>
      </section>
    ) : null;
  }
  return (
    <section>
      <h2 className="mb-2 font-medium">Observações (saem no orçamento impresso)</h2>
      <Textarea
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => texto !== (dados.quote.observacoes ?? "") && salvar.mutate()}
      />
    </section>
  );
}

// ─── Ações de status ────────────────────────────────────────

function Acoes({ dados }: { dados: DadosOrcamento }) {
  const recarregar = useRecarregarOrcamento();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [aprovar, setAprovar] = useState(false);

  const mudar = useMutation({
    mutationFn: async (status: QuoteStatus) =>
      check(await supabase.from("quotes").update({ status }).eq("id", dados.quote.id)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async () => check(await supabase.from("quotes").delete().eq("id", dados.quote.id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orcamentos"] });
      void navigate({ to: "/pacientes/$id", params: { id: dados.paciente.id } });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="grid gap-2 border-t pt-4">
      <Button onClick={() => setAprovar(true)} disabled={dados.itens.length === 0}>
        <Check /> Aprovar e gerar plano
      </Button>
      {dados.quote.status === "rascunho" && (
        <Button variant="outline" onClick={() => mudar.mutate("enviado")}>
          <Send /> Marcar como enviado
        </Button>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" variant="ghost" onClick={() => mudar.mutate("perdido")}>
          Perdido
        </Button>
        <Button className="flex-1" variant="ghost" onClick={() => mudar.mutate("cancelado")}>
          Cancelar
        </Button>
      </div>
      {dados.quote.status === "rascunho" && (
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => confirm("Excluir este rascunho?") && excluir.mutate()}
        >
          <Trash2 /> Excluir rascunho
        </Button>
      )}
      {aprovar && <Aprovar dados={dados} fechar={() => setAprovar(false)} />}
    </div>
  );
}

function Aprovar({ dados, fechar }: { dados: DadosOrcamento; fechar: () => void }) {
  const qc = useQueryClient();
  const { data: perfis = [] } = usePerfis();
  const [inicio, setInicio] = useState(hojeISO());
  const [medico, setMedico] = useState(dados.quote.medico_id ?? "");

  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase.rpc("aprovar_orcamento", {
          p_quote_id: dados.quote.id,
          p_inicio: inicio,
          p_medico_id: medico || null,
        }),
      ),
    onSuccess: () => {
      toast.success("Orçamento aprovado. Agora prescreva as semanas logo abaixo.");
      for (const k of [["orcamento"], ["orcamentos"], ["plans"], ["plano"], ["v_progresso_plano"]])
        void qc.invalidateQueries({ queryKey: k });
      fechar();
      setTimeout(() => document.getElementById("prescricao")?.scrollIntoView({ behavior: "smooth" }), 600);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar orçamento nº {dados.quote.numero}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cria o plano de tratamento de {dados.paciente.nome} com os {dados.itens.length} item(ns) deste orçamento
          e abre a prescrição por semana aqui mesmo. Depois de aprovado, o orçamento não pode mais ser alterado.
        </p>
        <div className="grid gap-3">
          <Campo label="Início do tratamento (semana 1)">
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </Campo>
          <Campo label="Médico(a)">
            <Seletor value={medico} onChange={(e) => setMedico(e.target.value)}>
              <option value="">—</option>
              {perfis
                .filter((p) => p.ativo && (p.papel === "medico" || p.papel === "admin"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </Seletor>
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Voltar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!inicio || salvar.isPending}>
            Aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
