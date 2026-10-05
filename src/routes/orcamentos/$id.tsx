import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Repeat, ChevronDown, ChevronUp, Copy, CreditCard, FileDown, Gift, Plus, Send, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Confirmar } from "@/components/app/Confirmar";
import { Campo, Seletor, Vazio } from "@/components/app/campos";
import {
  descreverQuantidade,
  STATUS_ORCAMENTO,
  useOrcamento,
  useRecarregarOrcamento,
  type DadosOrcamento,
} from "@/components/orcamento/dados";
import { useDadosPlano, useRecarregarPlano } from "@/components/plano/dados";
import { PrescricaoComResumo } from "@/components/plano/PrescricaoComResumo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { brl, data, hojeISO, num, qtd, UNIDADE_LABEL } from "@/lib/format";
import { useComposicao, usePerfis, useProcedimentos, useProdutos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Plan, Procedure, ProcedureItem, Product, Quote, QuoteItem, UnidadeDose } from "@/lib/types";

export const Route = createFileRoute("/orcamentos/$id")({
  head: () => ({ meta: [{ title: "Orçamento — Controle de Aplicações" }] }),
  component: Orcamento,
});

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const FREQUENCIAS = ["Semanal", "2x por semana", "Quinzenal", "Mensal"];
const CONDICOES = ["À vista", "PIX", "Cartão de crédito parcelado", "Cartão de débito", "Boleto"];

function Orcamento() {
  const { id } = Route.useParams();
  const { data: dados } = useOrcamento(id);
  const { data: perfis = [] } = usePerfis();
  const [aba, setAba] = useState("orcamento");

  if (!dados) return <AppShell titulo="Orçamento">{null}</AppShell>;
  const { quote, paciente } = dados;
  const aberto = quote.status === "rascunho" || quote.status === "enviado";
  const aprovado = quote.status === "aprovado" && Boolean(quote.plan_id);
  const medico = perfis.find((p) => p.id === quote.medico_id);

  return (
    <AppShell
      titulo={`Orçamento #${quote.numero} — ${paciente.nome}`}
      acoes={
        <>
          <Button variant="outline" asChild>
            <a href={`/imprimir-orcamento/${quote.id}`} target="_blank" rel="noreferrer">
              <FileDown /> Exportar PDF
            </a>
          </Button>
          <Duplicar quoteId={quote.id} />
          <span className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {STATUS_ORCAMENTO[quote.status].label}
          </span>
        </>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3 text-muted-foreground">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/orcamentos" aria-label="Voltar">
            <ArrowLeft />
          </Link>
        </Button>
        <Link to="/pacientes/$id" params={{ id: paciente.id }} className="hover:underline">
          {paciente.nome}
        </Link>
        <span>·</span>
        {aberto ? <MedicoSeletor dados={dados} /> : <span>Médico: {medico?.nome ?? "—"}</span>}
        <span>·</span>
        <span>{data(quote.created_at.slice(0, 10))}</span>
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="mb-6 h-auto rounded-xl p-1">
          <TabsTrigger value="orcamento" className="px-4 py-2">
            Orçamento
          </TabsTrigger>
          <TabsTrigger value="prescricao" className="px-4 py-2" disabled={!aprovado}>
            Prescrição
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orcamento" className="grid gap-6">
          <Condicoes quote={quote} aberto={aberto} />
          <Itens dados={dados} aberto={aberto} />
          {aberto && <AdicionarItem quoteId={quote.id} proximaOrdem={(dados.itens.at(-1)?.ordem ?? -1) + 1} />}
          {aprovado && <AdicionarCortesia quoteId={quote.id} />}
          <Totais dados={dados} aberto={aberto} />
          <CondicaoPagamento quote={quote} aberto={aberto} />
          <Acoes dados={dados} irParaPrescricao={() => setAba("prescricao")} />
        </TabsContent>

        <TabsContent value="prescricao">
          {quote.plan_id && <PrescricaoDoOrcamento planId={quote.plan_id} />}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

// ─── Cabeçalho ──────────────────────────────────────────────

function MedicoSeletor({ dados }: { dados: DadosOrcamento }) {
  const { data: perfis = [] } = usePerfis();
  const recarregar = useRecarregarOrcamento();
  const salvar = useMutation({
    mutationFn: async (medico: string) =>
      check(await supabase.from("quotes").update({ medico_id: medico || null }).eq("id", dados.quote.id)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });
  return (
    <label className="flex items-center gap-2">
      Médico:
      <Seletor className="h-8 w-auto" value={dados.quote.medico_id ?? ""} onChange={(e) => salvar.mutate(e.target.value)}>
        <option value="">—</option>
        {perfis
          .filter((p) => p.ativo && (p.papel === "medico" || p.papel === "admin"))
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
      </Seletor>
    </label>
  );
}

function Duplicar({ quoteId }: { quoteId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const duplicar = useMutation({
    mutationFn: async () => check(await supabase.rpc("duplicar_orcamento", { p_quote_id: quoteId })) as string,
    onSuccess: (novo) => {
      toast.success("Orçamento duplicado como rascunho.");
      void qc.invalidateQueries({ queryKey: ["orcamentos"] });
      void navigate({ to: "/orcamentos/$id", params: { id: novo } });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button variant="outline" onClick={() => duplicar.mutate()} disabled={duplicar.isPending}>
      <Copy /> Duplicar
    </Button>
  );
}

/** Atualiza um campo do orçamento (só enquanto aberto; o banco recusa depois). */
function useAtualizarQuote(quoteId: string) {
  const recarregar = useRecarregarOrcamento();
  return useMutation({
    mutationFn: async (mudanca: Partial<Quote>) =>
      check(await supabase.from("quotes").update(mudanca).eq("id", quoteId)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });
}

function Condicoes({ quote, aberto }: { quote: Quote; aberto: boolean }) {
  const atualizar = useAtualizarQuote(quote.id);
  const [obs, setObs] = useState(quote.observacoes ?? "");
  useEffect(() => setObs(quote.observacoes ?? ""), [quote.observacoes]);

  return (
    <div className="grid gap-4 border-b pb-6 md:grid-cols-3">
      <Campo label="Mês do tratamento">
        {aberto ? (
          <Seletor value={quote.mes_tratamento ?? ""} onChange={(e) => atualizar.mutate({ mes_tratamento: e.target.value || null })}>
            <option value="">Selecionar…</option>
            {MESES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Seletor>
        ) : (
          <p className="font-medium">{quote.mes_tratamento ?? "—"}</p>
        )}
      </Campo>
      <Campo label="Frequência das aplicações">
        {aberto ? (
          <Seletor
            value={quote.frequencia_aplicacoes ?? ""}
            onChange={(e) => atualizar.mutate({ frequencia_aplicacoes: e.target.value || null })}
          >
            <option value="">Selecionar…</option>
            {FREQUENCIAS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Seletor>
        ) : (
          <p className="font-medium">{quote.frequencia_aplicacoes ?? "—"}</p>
        )}
      </Campo>
      <Campo label="Observações">
        {aberto ? (
          <Input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => obs !== (quote.observacoes ?? "") && atualizar.mutate({ observacoes: obs.trim() || null })}
          />
        ) : (
          <p className="font-medium">{quote.observacoes ?? "—"}</p>
        )}
      </Campo>
    </div>
  );
}

// ─── Itens ──────────────────────────────────────────────────

function Itens({ dados, aberto }: { dados: DadosOrcamento; aberto: boolean }) {
  const recarregar = useRecarregarOrcamento();
  const [editando, setEditando] = useState<QuoteItem | null>(null);

  const remover = useMutation({
    mutationFn: async (id: string) => check(await supabase.from("quote_items").delete().eq("id", id)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });

  // Troca a ordem com o vizinho (as ordens são renumeradas 0..n para não haver empate).
  const mover = useMutation({
    mutationFn: async ({ indice, direcao }: { indice: number; direcao: -1 | 1 }) => {
      const lista = [...dados.itens];
      const alvo = indice + direcao;
      if (alvo < 0 || alvo >= lista.length) return;
      const a = lista[indice];
      const b = lista[alvo];
      if (!a || !b) return;
      lista[indice] = b;
      lista[alvo] = a;
      await Promise.all(
        lista.map((item, ordem) =>
          item.ordem === ordem ? null : supabase.from("quote_items").update({ ordem }).eq("id", item.id),
        ),
      );
    },
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });

  if (dados.itens.length === 0) return <Vazio>Nenhum item ainda. Adicione abaixo.</Vazio>;

  return (
    <div className="cartao overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Descrição</th>
            <th className="px-4 py-3 font-medium">Qtd</th>
            <th className="px-4 py-3 font-medium">Preço unit.</th>
            <th className="px-4 py-3 font-medium">Subtotal</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {dados.itens.map((i, idx) => (
            <ItemLinha
              key={i.id}
              item={i}
              aberto={aberto}
              primeiro={idx === 0}
              ultimo={idx === dados.itens.length - 1}
              onEditar={() => setEditando(i)}
              onRemover={() => remover.mutate(i.id)}
              onMover={(direcao) => mover.mutate({ indice: idx, direcao })}
            />
          ))}
        </tbody>
      </table>
      {editando && <FormItem item={editando} fechar={() => setEditando(null)} />}
    </div>
  );
}

function ItemLinha({
  item,
  aberto,
  primeiro,
  ultimo,
  onEditar,
  onRemover,
  onMover,
}: {
  item: QuoteItem;
  aberto: boolean;
  primeiro: boolean;
  ultimo: boolean;
  onEditar: () => void;
  onRemover: () => void;
  onMover: (direcao: -1 | 1) => void;
}) {
  const recarregar = useRecarregarOrcamento();
  const [obs, setObs] = useState(item.observacao ?? "");
  const salvarObs = useMutation({
    mutationFn: async () =>
      check(await supabase.from("quote_items").update({ observacao: obs.trim() || null }).eq("id", item.id)),
    onSuccess: recarregar,
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <tr className="bg-muted/30">
        <td className="px-4 pt-4">
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold">
            {item.cortesia ? "Cortesia" : "Proc."}
          </span>
        </td>
        <td className="px-4 pt-4">
          <button type="button" className="text-left hover:underline disabled:no-underline" onClick={onEditar} disabled={!aberto}>
            {item.descricao}
          </button>
        </td>
        <td className="px-4 pt-4">{descreverQuantidade(item)}</td>
        <td className="px-4 pt-4">{brl(item.preco_unitario)}</td>
        <td className="px-4 pt-4 font-semibold">{brl(item.subtotal)}</td>
        <td className="px-4 pt-4">
          {aberto && (
            <div className="flex justify-end gap-1">
              <Button size="icon" variant="ghost" disabled={primeiro} onClick={() => onMover(-1)} aria-label="Subir">
                <ChevronUp />
              </Button>
              <Button size="icon" variant="ghost" disabled={ultimo} onClick={() => onMover(1)} aria-label="Descer">
                <ChevronDown />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={onRemover} aria-label="Remover">
                <Trash2 />
              </Button>
            </div>
          )}
        </td>
      </tr>
      <tr className="border-b bg-muted/30">
        <td />
        <td colSpan={5} className="px-4 pb-4 pt-2">
          {aberto ? (
            <Textarea
              rows={1}
              className="min-h-9 rounded-full bg-background px-4"
              placeholder="Observação (opcional) — aparece no cronograma do paciente"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              onBlur={() => obs.trim() !== (item.observacao ?? "") && salvarObs.mutate()}
            />
          ) : (
            item.observacao && <p className="text-sm italic text-muted-foreground">{item.observacao}</p>
          )}
        </td>
      </tr>
    </>
  );
}

/** Sugere unidade e dose pelo primeiro produto em UI/mL da composição. */
function sugerir(proc: Procedure, comp: ProcedureItem[], produtos: Product[]): { unidade: UnidadeDose; dose: number } {
  const alvo = comp
    .filter((c) => c.procedure_id === proc.id)
    .map((c) => ({ c, prod: produtos.find((x) => x.id === c.product_id) }))
    .find(({ prod }) => prod?.unidade === "ui" || prod?.unidade === "ml");
  if (alvo?.prod && (alvo.prod.unidade === "ui" || alvo.prod.unidade === "ml")) {
    return { unidade: alvo.prod.unidade, dose: alvo.c.quantidade_padrao };
  }
  return { unidade: proc.forma_venda === "unidade" ? "ui" : "aplicacao", dose: 1 };
}

function AdicionarItem({ quoteId, proximaOrdem }: { quoteId: string; proximaOrdem: number }) {
  const recarregar = useRecarregarOrcamento();
  const { data: procs = [] } = useProcedimentos();
  const { data: comp = [] } = useComposicao();
  const { data: produtos = [] } = useProdutos();
  const [procId, setProcId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [preco, setPreco] = useState("");
  const proc = procs.find((p) => p.id === procId);

  const adicionar = useMutation({
    mutationFn: async () => {
      if (!proc) throw new Error("Escolha o item.");
      const { unidade, dose } = sugerir(proc, comp, produtos);
      check(
        await supabase.from("quote_items").insert({
          quote_id: quoteId,
          procedure_id: proc.id,
          descricao: proc.nome,
          vendido_por: proc.forma_venda,
          quantidade: num(quantidade),
          unidade_dose: unidade,
          dose_padrao: dose,
          preco_unitario: num(preco),
          ordem: proximaOrdem,
        }),
      );
    },
    onSuccess: () => {
      setProcId("");
      setQuantidade("1");
      setPreco("");
      recarregar();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <LinhaAdicionar
      titulo="Adicionar item"
      procs={procs}
      procId={procId}
      setProcId={(v) => {
        setProcId(v);
        const p = procs.find((x) => x.id === v);
        if (p) setPreco(String(p.preco_base));
      }}
      quantidade={quantidade}
      setQuantidade={setQuantidade}
      preco={preco}
      setPreco={setPreco}
      onAdicionar={() => adicionar.mutate()}
      carregando={adicionar.isPending}
      dica={proc ? `Quantidade em ${proc.forma_venda === "aplicacao" ? "aplicações" : "UI/mL"}. Clique no item depois para ajustar dose e unidade.` : undefined}
    />
  );
}

function AdicionarCortesia({ quoteId }: { quoteId: string }) {
  const recarregarOrc = useRecarregarOrcamento();
  const recarregarPlano = useRecarregarPlano();
  const { data: procs = [] } = useProcedimentos();
  const { data: comp = [] } = useComposicao();
  const { data: produtos = [] } = useProdutos();
  const [ativo, setAtivo] = useState(false);
  const [procId, setProcId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const proc = procs.find((p) => p.id === procId);

  const adicionar = useMutation({
    mutationFn: async () => {
      if (!proc) throw new Error("Escolha o item.");
      const { unidade, dose } = sugerir(proc, comp, produtos);
      check(
        await supabase.rpc("adicionar_cortesia", {
          p_quote_id: quoteId,
          p_procedure_id: proc.id,
          p_descricao: proc.nome,
          p_quantidade: num(quantidade),
          p_unidade_dose: unidade,
          p_dose_padrao: dose,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Cortesia incluída. Ela já entra na prescrição.");
      setProcId("");
      setQuantidade("1");
      recarregarOrc();
      recarregarPlano();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        <Gift className="size-4" /> Cortesia — sem cobrança (não altera o total do orçamento)
      </label>
      {ativo && (
        <LinhaAdicionar
          titulo="Item adicionado agora entra normalmente na prescrição"
          procs={procs}
          procId={procId}
          setProcId={setProcId}
          quantidade={quantidade}
          setQuantidade={setQuantidade}
          preco="0"
          onAdicionar={() => adicionar.mutate()}
          carregando={adicionar.isPending}
        />
      )}
    </div>
  );
}

function LinhaAdicionar({
  titulo,
  procs,
  procId,
  setProcId,
  quantidade,
  setQuantidade,
  preco,
  setPreco,
  onAdicionar,
  carregando,
  dica,
}: {
  titulo: string;
  procs: Procedure[];
  procId: string;
  setProcId: (v: string) => void;
  quantidade: string;
  setQuantidade: (v: string) => void;
  preco: string;
  setPreco?: (v: string) => void;
  onAdicionar: () => void;
  carregando: boolean;
  dica?: string | undefined;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Campo label="Item" className="min-w-64 flex-1">
          <Seletor value={procId} onChange={(e) => setProcId(e.target.value)}>
            <option value="">Selecionar…</option>
            {procs
              .filter((p) => p.ativo && p.categoria !== "acompanhamento")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </Seletor>
        </Campo>
        <Campo label="Qtd" className="w-24">
          <Input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
        </Campo>
        <Campo label="Preço unit." className="w-32">
          <Input inputMode="decimal" value={preco} disabled={!setPreco} onChange={(e) => setPreco?.(e.target.value)} />
        </Campo>
        <Button
          size="icon"
          className="rounded-full"
          onClick={onAdicionar}
          disabled={!procId || num(quantidade) <= 0 || carregando}
          aria-label="Adicionar"
        >
          <Plus />
        </Button>
      </div>
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}

function FormItem({ item, fechar }: { item: QuoteItem; fechar: () => void }) {
  const recarregar = useRecarregarOrcamento();
  const { data: procs = [] } = useProcedimentos();
  const proc = procs.find((p) => p.id === item.procedure_id);
  const porAplicacao = item.vendido_por === "aplicacao";
  const [descricao, setDescricao] = useState(item.descricao);
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [unidadeDose, setUnidadeDose] = useState<UnidadeDose>(item.unidade_dose);
  const [dose, setDose] = useState(String(item.dose_padrao));
  const [preco, setPreco] = useState(String(item.preco_unitario));

  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase
          .from("quote_items")
          .update({
            descricao: descricao.trim() || proc?.nome || item.descricao,
            quantidade: num(quantidade),
            unidade_dose: unidadeDose,
            dose_padrao: unidadeDose === "aplicacao" ? 1 : num(dose),
            preco_unitario: num(preco),
          })
          .eq("id", item.id),
      ),
    onSuccess: () => {
      recarregar();
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar item</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <Campo label="Descrição no orçamento">
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label={porAplicacao ? "Nº de aplicações" : `Quantidade (${UNIDADE_LABEL[unidadeDose]})`}>
              <Input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
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
                <Input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} />
              </Campo>
            )}
            <Campo label={porAplicacao ? "Valor por aplicação (R$)" : `Valor por ${UNIDADE_LABEL[unidadeDose]} (R$)`}>
              <Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </Campo>
          </div>
          <p className="text-sm text-muted-foreground">
            Subtotal: <strong>{brl(num(quantidade) * num(preco))}</strong>
            {porAplicacao && unidadeDose !== "aplicacao" && (
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

// ─── Totais: descontos e acréscimo ──────────────────────────

function Totais({ dados, aberto }: { dados: DadosOrcamento; aberto: boolean }) {
  const recarregar = useRecarregarOrcamento();
  const atualizar = useAtualizarQuote(dados.quote.id);
  const [motivo, setMotivo] = useState("");
  const [tipo, setTipo] = useState<"reais" | "percentual">("reais");
  const [valor, setValor] = useState("");
  const [acrescimo, setAcrescimo] = useState(String(dados.quote.acrescimo_valor ?? 0));
  useEffect(() => setAcrescimo(String(dados.quote.acrescimo_valor ?? 0)), [dados.quote.acrescimo_valor]);

  const adicionar = useMutation({
    mutationFn: async () => {
      if (!motivo.trim()) throw new Error("O motivo do desconto é obrigatório.");
      check(await supabase.from("quote_discounts").insert({ quote_id: dados.quote.id, motivo: motivo.trim(), tipo, valor: num(valor) }));
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
    <div className="ml-auto grid w-full max-w-xl gap-3 text-right">
      <p>
        Subtotal: <strong>{brl(dados.total.subtotal)}</strong>
      </p>

      {dados.descontos.map((d) => (
        <div key={d.id} className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Desconto:</span>
          <span className="rounded-full border px-3 py-1">{d.motivo}</span>
          <span className="rounded-full bg-primary px-3 py-1 text-primary-foreground">
            {d.tipo === "reais" ? "R$" : "%"}
          </span>
          <span className="w-24">{d.tipo === "reais" ? qtd(d.valor) : `${qtd(d.valor)}%`}</span>
          <span className="w-24 text-muted-foreground">− {brl(d.valor_reais)}</span>
          {aberto && (
            <Button size="icon" variant="ghost" onClick={() => remover.mutate(d.id)} aria-label="Remover desconto">
              <X />
            </Button>
          )}
        </div>
      ))}

      {aberto && (
        <form
          className="flex flex-wrap items-center justify-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            adicionar.mutate();
          }}
        >
          <span className="text-sm text-muted-foreground">Desconto:</span>
          <Input className="h-9 w-48 rounded-full" placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <AlternarTipo valor={tipo} onChange={setTipo} />
          <Input className="h-9 w-24 text-right" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          <Button type="submit" variant="ghost" size="sm" disabled={!motivo.trim() || num(valor) <= 0}>
            <Plus /> Adicionar desconto
          </Button>
        </form>
      )}

      {(aberto || dados.total.acrescimo > 0) && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Acréscimo:</span>
          {aberto ? (
            <>
              <AlternarTipo valor={dados.quote.acrescimo_tipo} onChange={(t) => atualizar.mutate({ acrescimo_tipo: t })} />
              <Input
                className="h-9 w-24 text-right"
                inputMode="decimal"
                value={acrescimo}
                onChange={(e) => setAcrescimo(e.target.value)}
                onBlur={() => num(acrescimo) !== dados.quote.acrescimo_valor && atualizar.mutate({ acrescimo_valor: num(acrescimo) })}
              />
            </>
          ) : (
            <span>{brl(dados.total.acrescimo)}</span>
          )}
        </div>
      )}

      <p className="text-xl font-semibold">Total: {brl(dados.total.total)}</p>
    </div>
  );
}

function AlternarTipo({ valor, onChange }: { valor: "reais" | "percentual"; onChange: (v: "reais" | "percentual") => void }) {
  return (
    <span className="inline-flex rounded-full border p-0.5">
      {(["reais", "percentual"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`rounded-full px-3 py-1 text-sm ${valor === t ? "bg-primary text-primary-foreground" : ""}`}
        >
          {t === "reais" ? "R$" : "%"}
        </button>
      ))}
    </span>
  );
}

function CondicaoPagamento({ quote, aberto }: { quote: Quote; aberto: boolean }) {
  const atualizar = useAtualizarQuote(quote.id);
  return (
    <Cartao icone={<CreditCard className="size-4" />} titulo="Condição de pagamento">
      {aberto ? (
        <Seletor
          value={quote.condicao_pagamento ?? ""}
          onChange={(e) => atualizar.mutate({ condicao_pagamento: e.target.value || null })}
        >
          <option value="">Selecionar…</option>
          {CONDICOES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Seletor>
      ) : null}
      <p className="mt-2 text-sm text-muted-foreground">Condição salva: {quote.condicao_pagamento ?? "—"}</p>
    </Cartao>
  );
}

function Cartao({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section className="cartao p-6">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        {icone} {titulo}
      </h2>
      {children}
    </section>
  );
}

// ─── Ações de status ────────────────────────────────────────

function Acoes({ dados, irParaPrescricao }: { dados: DadosOrcamento; irParaPrescricao: () => void }) {
  const atualizar = useAtualizarQuote(dados.quote.id);
  const recarregarOrc = useRecarregarOrcamento();
  const recarregarPlano = useRecarregarPlano();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dialogo, setDialogo] = useState<"aprovar" | "perdido" | "cancelar" | "excluir" | "trocar" | null>(null);
  const { status } = dados.quote;
  const aberto = status === "rascunho" || status === "enviado";
  const fechar = () => setDialogo(null);
  const depois = () => {
    recarregarOrc();
    recarregarPlano();
    fechar();
  };

  const excluir = useMutation({
    mutationFn: async () => check(await supabase.from("quotes").delete().eq("id", dados.quote.id)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orcamentos"] });
      void navigate({ to: "/orcamentos" });
    },
    onError: (e) => toast.error(e.message),
  });
  const perdido = useMutation({
    mutationFn: async (motivo: string) =>
      check(await supabase.rpc("marcar_orcamento_perdido", { p_quote_id: dados.quote.id, p_motivo: motivo })),
    onSuccess: () => {
      toast.success("Orçamento marcado como perdido.");
      depois();
    },
    onError: (e) => toast.error(e.message),
  });
  const cancelar = useMutation({
    mutationFn: async ({ motivo, senha }: { motivo: string; senha: string }) =>
      check(
        await supabase.rpc("cancelar_orcamento", {
          p_quote_id: dados.quote.id,
          p_motivo: motivo,
          p_senha: senha || null,
        }),
      ),
    onSuccess: () => {
      toast.success("Orçamento cancelado.");
      depois();
    },
    onError: (e) => toast.error(e.message),
  });

  if (status === "cancelado" || status === "perdido") {
    return dados.quote.motivo_status ? (
      <p className="text-right text-sm text-muted-foreground">
        {status === "cancelado" ? "Cancelado" : "Perdido"}
        {dados.quote.status_alterado_em && ` em ${data(dados.quote.status_alterado_em.slice(0, 10))}`} · Motivo:{" "}
        {dados.quote.motivo_status}
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {status === "rascunho" && (
        <Button variant="ghost" className="text-destructive" onClick={() => setDialogo("excluir")}>
          <Trash2 /> Excluir rascunho
        </Button>
      )}
      {aberto && (
        <Button variant="outline" onClick={() => setDialogo("perdido")}>
          Perdido
        </Button>
      )}
      <Button className="bg-[var(--erro)] text-white hover:bg-[var(--erro)]/90" onClick={() => setDialogo("cancelar")}>
        <AlertTriangle /> Cancelar orçamento
      </Button>
      {status === "aprovado" && (
        <>
          <Button variant="outline" onClick={() => setDialogo("trocar")}>
            <Repeat /> Trocar medicação
          </Button>
          <Button onClick={irParaPrescricao}>Ir para a prescrição</Button>
        </>
      )}
      {status === "rascunho" && (
        <Button variant="outline" onClick={() => atualizar.mutate({ status: "enviado" })}>
          <Send /> Marcar como enviado
        </Button>
      )}
      {aberto && (
        <Button onClick={() => setDialogo("aprovar")} disabled={dados.itens.length === 0}>
          <Check /> Aprovar e prescrever
        </Button>
      )}

      {dialogo === "aprovar" && (
        <Aprovar
          dados={dados}
          fechar={fechar}
          aprovado={() => {
            fechar();
            irParaPrescricao();
          }}
        />
      )}
      {dialogo === "excluir" && (
        <Confirmar
          titulo="Excluir este rascunho?"
          textoBotao="Excluir"
          destrutivo
          carregando={excluir.isPending}
          onConfirmar={() => excluir.mutate()}
          fechar={fechar}
        />
      )}
      {dialogo === "perdido" && (
        <Confirmar
          titulo={`Marcar o orçamento #${dados.quote.numero} como perdido?`}
          pedirMotivo
          textoBotao="Marcar como perdido"
          carregando={perdido.isPending}
          onConfirmar={({ motivo }) => perdido.mutate(motivo)}
          fechar={fechar}
        />
      )}
      {dialogo === "cancelar" && (
        <Confirmar
          titulo={`Cancelar o orçamento #${dados.quote.numero}?`}
          descricao={
            status === "aprovado"
              ? "O plano será encerrado e as doses ainda não aplicadas saem da prescrição. As aplicações já feitas e a baixa de estoque continuam no histórico."
              : undefined
          }
          pedirMotivo
          pedirSenha={status === "aprovado"}
          textoBotao="Cancelar orçamento"
          destrutivo
          carregando={cancelar.isPending}
          onConfirmar={(d) => cancelar.mutate(d)}
          fechar={fechar}
        />
      )}
      {dialogo === "trocar" && dados.quote.plan_id && (
        <TrocarMedicacao quoteId={dados.quote.id} planId={dados.quote.plan_id} fechar={fechar} concluido={depois} />
      )}
    </div>
  );
}

function TrocarMedicacao({
  quoteId,
  planId,
  fechar,
  concluido,
}: {
  quoteId: string;
  planId: string;
  fechar: () => void;
  concluido: () => void;
}) {
  const { data: dadosPlano } = useDadosPlano(planId);
  const { data: procs = [] } = useProcedimentos();
  const { data: comp = [] } = useComposicao();
  const { data: produtos = [] } = useProdutos();
  const [purchaseId, setPurchaseId] = useState("");
  const [novoId, setNovoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");

  const saldo = dadosPlano?.saldo ?? [];
  const atual = saldo.find((x) => x.purchase_id === purchaseId);
  const novo = procs.find((p) => p.id === novoId);
  const sugestao = novo ? sugerir(novo, comp, produtos) : null;

  const trocar = useMutation({
    mutationFn: async () => {
      if (!novo || !sugestao) throw new Error("Escolha a medicação nova.");
      check(
        await supabase.rpc("trocar_medicacao", {
          p_quote_id: quoteId,
          p_purchase_id: purchaseId,
          p_novo_procedure_id: novo.id,
          p_quantidade: num(quantidade),
          p_unidade_dose: sugestao.unidade,
          p_dose_padrao: sugestao.dose,
          p_motivo: motivo.trim(),
        }),
      );
    },
    onSuccess: () => {
      toast.success("Medicação trocada. Prescreva a nova na aba Prescrição.");
      concluido();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trocar medicação</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          O que já foi aplicado do item atual fica no histórico. O saldo não usado e as doses previstas dele saem do plano, e
          a medicação nova entra no lugar. O total do orçamento não muda.
        </p>
        <div className="grid gap-3">
          <Campo label="Sai">
            <Seletor value={purchaseId} onChange={(e) => setPurchaseId(e.target.value)}>
              <option value="">Escolha o item…</option>
              {saldo.map((x) => (
                <option key={x.purchase_id} value={x.purchase_id}>
                  {x.procedimento} — aplicado {qtd(x.aplicado)} de {qtd(x.contratado, x.unidade_dose)}
                </option>
              ))}
            </Seletor>
          </Campo>
          {atual && (
            <p className="text-xs text-muted-foreground">
              Saldo não usado que sai: {qtd(Math.max(0, atual.contratado - atual.aplicado), atual.unidade_dose)}
            </p>
          )}
          <Campo label="Entra">
            <Seletor value={novoId} onChange={(e) => setNovoId(e.target.value)}>
              <option value="">Escolha a medicação nova…</option>
              {procs
                .filter((p) => p.ativo && p.categoria !== "acompanhamento")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </Seletor>
          </Campo>
          <Campo
            label={
              novo
                ? novo.forma_venda === "aplicacao"
                  ? "Quantidade (nº de aplicações)"
                  : `Quantidade (${sugestao ? UNIDADE_LABEL[sugestao.unidade] : "UI/mL"})`
                : "Quantidade"
            }
          >
            <Input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
          </Campo>
          <Campo label="Motivo">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Voltar
          </Button>
          <Button
            onClick={() => trocar.mutate()}
            disabled={!purchaseId || !novoId || num(quantidade) <= 0 || !motivo.trim() || trocar.isPending}
          >
            <Repeat /> Trocar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Aprovar({ dados, fechar, aprovado }: { dados: DadosOrcamento; fechar: () => void; aprovado: () => void }) {
  const qc = useQueryClient();
  const { data: perfis = [] } = usePerfis();
  const [inicio, setInicio] = useState(hojeISO());
  const [medico, setMedico] = useState(dados.quote.medico_id ?? "");

  const salvar = useMutation({
    mutationFn: async () =>
      check(await supabase.rpc("aprovar_orcamento", { p_quote_id: dados.quote.id, p_inicio: inicio, p_medico_id: medico || null })),
    onSuccess: async () => {
      toast.success("Orçamento aprovado. Agora prescreva as semanas.");
      await Promise.all(
        [["orcamento"], ["orcamentos"], ["plans"], ["plano"], ["v_progresso_plano"]].map((k) => qc.invalidateQueries({ queryKey: k })),
      );
      aprovado();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar orçamento #{dados.quote.numero}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Cria o plano de tratamento de {dados.paciente.nome} com os {dados.itens.length} item(ns) e abre a prescrição.
          Depois de aprovado, o orçamento não pode mais ser alterado (só receber cortesias).
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

// ─── Prescrição do orçamento ────────────────────────────────

function PrescricaoDoOrcamento({ planId }: { planId: string }) {
  const { data: plano } = useQuery({
    queryKey: ["plans", "id", planId],
    queryFn: async () => check(await supabase.from("plans").select("*").eq("id", planId).single()) as Plan,
  });
  const { data: dados } = useDadosPlano(planId);
  if (!plano || !dados) return null;
  return <PrescricaoComResumo plano={plano} dados={dados} />;
}
