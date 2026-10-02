import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, PackagePlus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Seletor, Vazio } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePode } from "@/lib/auth";
import { brl, data, diasAte, num, qtd, UNIDADE_LABEL } from "@/lib/format";
import { CHAVES_ESTOQUE, useEstoque, useProdutos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { StockLot } from "@/lib/types";

export const Route = createFileRoute("/estoque")({
  head: () => ({ meta: [{ title: "Estoque — Controle de Aplicações" }] }),
  component: Estoque,
});

type Movimento = {
  id: string;
  product_id: string;
  lot_id: string | null;
  tipo: "entrada" | "saida" | "ajuste" | "estorno";
  quantidade: number;
  custo_unitario_snapshot: number;
  observacao: string | null;
  created_at: string;
};

function Estoque() {
  const podeAjustar = usePode("admin");
  const { data: estoque = [] } = useEstoque();
  const { data: produtos = [] } = useProdutos();
  const [verEsgotados, setVerEsgotados] = useState(false);
  const [entrada, setEntrada] = useState(false);
  const [ajuste, setAjuste] = useState<StockLot | null>(null);

  const { data: lotes = [] } = useQuery({
    queryKey: ["stock_lots", "todos", verEsgotados],
    queryFn: async () => {
      let q = supabase.from("stock_lots").select("*");
      if (!verEsgotados) q = q.gt("quantidade_atual", 0);
      return check(
        await q.order("validade", { ascending: true, nullsFirst: false }).limit(500),
      ) as StockLot[];
    },
  });

  const { data: movimentos = [] } = useQuery({
    queryKey: ["stock_movements"],
    queryFn: async () =>
      check(
        await supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(200),
      ) as Movimento[],
  });

  const produto = (id: string) => produtos.find((p) => p.id === id);
  const lote = (id: string | null) => lotes.find((l) => l.id === id);
  const abaixo = estoque.filter((e) => e.abaixo_minimo);
  const vencendo = lotes.filter((l) => {
    const d = diasAte(l.validade);
    return l.quantidade_atual > 0 && d !== null && d <= 30;
  });

  return (
    <AppShell
      titulo="Estoque"
      acoes={
        <Button onClick={() => setEntrada(true)}>
          <PackagePlus /> Entrada de lote
        </Button>
      }
    >
      {(abaixo.length > 0 || vencendo.length > 0) && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {abaixo.length > 0 && (
            <Alerta titulo="Abaixo do mínimo">
              {abaixo.map((e) => (
                <li key={e.product_id}>
                  {e.nome}: {qtd(e.saldo, e.unidade)} (mínimo {qtd(e.estoque_minimo, e.unidade)})
                </li>
              ))}
            </Alerta>
          )}
          {vencendo.length > 0 && (
            <Alerta titulo="Vencidos ou vencendo em 30 dias">
              {vencendo.map((l) => (
                <li key={l.id}>
                  {produto(l.product_id)?.nome} · lote {l.lote}: {data(l.validade)} ·{" "}
                  {qtd(l.quantidade_atual, produto(l.product_id)?.unidade)}
                </li>
              ))}
            </Alerta>
          )}
        </div>
      )}

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Saldo por produto</TabsTrigger>
          <TabsTrigger value="lotes">Lotes</TabsTrigger>
          <TabsTrigger value="movimentos">Movimentos</TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="mt-4">
          {estoque.length === 0 ? (
            <Vazio>Cadastre produtos para ver o saldo.</Vazio>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Saldo válido</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead>Próximo vencimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estoque.map((e) => (
                    <TableRow key={e.product_id}>
                      <TableCell className="font-medium">
                        {e.nome} {e.abaixo_minimo && <Etiqueta tom="perigo">repor</Etiqueta>}
                      </TableCell>
                      <TableCell className="text-right">{qtd(e.saldo, e.unidade)}</TableCell>
                      <TableCell className="text-right">{qtd(e.estoque_minimo, e.unidade)}</TableCell>
                      <TableCell>{data(e.proxima_validade)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="lotes" className="mt-4">
          <label className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={verEsgotados} onChange={(e) => setVerEsgotados(e.target.checked)} />
            Mostrar lotes esgotados
          </label>
          {lotes.length === 0 ? (
            <Vazio>Nenhum lote com saldo.</Vazio>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Custo unit.</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotes.map((l) => {
                    const p = produto(l.product_id);
                    const d = diasAte(l.validade);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{p?.nome}</TableCell>
                        <TableCell className="font-mono text-xs">{l.lote}</TableCell>
                        <TableCell>
                          {data(l.validade)}{" "}
                          {d !== null && d < 0 && <Etiqueta tom="perigo">vencido</Etiqueta>}
                          {d !== null && d >= 0 && d <= 30 && <Etiqueta tom="alerta">{d} dias</Etiqueta>}
                        </TableCell>
                        <TableCell className="text-right">
                          {qtd(l.quantidade_atual, p?.unidade)}
                          <span className="text-xs text-muted-foreground"> / {qtd(l.quantidade_inicial)}</span>
                        </TableCell>
                        <TableCell className="text-right">{brl(l.custo_unitario)}</TableCell>
                        <TableCell>{l.fornecedor ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {podeAjustar && (
                            <Button size="sm" variant="ghost" onClick={() => setAjuste(l)}>
                              Ajustar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="movimentos" className="mt-4">
          {movimentos.length === 0 ? (
            <Vazio>Nenhum movimento ainda.</Vazio>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Observação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentos.map((m) => {
                    const p = produto(m.product_id);
                    return (
                      <TableRow key={m.id}>
                        <TableCell>{new Date(m.created_at).toLocaleString("pt-BR")}</TableCell>
                        <TableCell>
                          <Etiqueta
                            tom={m.tipo === "entrada" ? "ok" : m.tipo === "saida" ? "info" : "alerta"}
                          >
                            {m.tipo}
                          </Etiqueta>
                        </TableCell>
                        <TableCell>{p?.nome}</TableCell>
                        <TableCell className="font-mono text-xs">{lote(m.lot_id)?.lote ?? "—"}</TableCell>
                        <TableCell className="text-right">{qtd(m.quantidade, p?.unidade)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.observacao ?? ""}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {entrada && <FormEntrada fechar={() => setEntrada(false)} />}
      {ajuste && <FormAjuste lote={ajuste} fechar={() => setAjuste(null)} />}
    </AppShell>
  );
}

function Alerta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <p className="mb-2 flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4" /> {titulo}
      </p>
      <ul className="list-inside list-disc space-y-0.5">{children}</ul>
    </div>
  );
}

function invalidarEstoque(qc: ReturnType<typeof useQueryClient>) {
  for (const k of CHAVES_ESTOQUE) void qc.invalidateQueries({ queryKey: [...k] });
}

function FormEntrada({ fechar }: { fechar: () => void }) {
  const qc = useQueryClient();
  const { data: produtos = [] } = useProdutos();
  const [f, setF] = useState({
    product_id: "",
    lote: "",
    validade: "",
    quantidade: "",
    custo_unitario: "",
    fornecedor: "",
    nota_compra: "",
  });
  const prod = produtos.find((p) => p.id === f.product_id);

  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase.rpc("entrada_lote", {
          p_product_id: f.product_id,
          p_lote: f.lote.trim(),
          p_validade: f.validade || null,
          p_quantidade: num(f.quantidade),
          p_custo_unitario: num(f.custo_unitario),
          p_fornecedor: f.fornecedor.trim() || null,
          p_nota_compra: f.nota_compra.trim() || null,
        }),
      ),
    onSuccess: () => {
      toast.success("Lote registrado.");
      invalidarEstoque(qc);
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    salvar.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrada de lote</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-4">
          <Campo label="Produto">
            <Seletor
              value={f.product_id}
              onChange={(e) => setF({ ...f, product_id: e.target.value })}
              required
            >
              <option value="">Escolha…</option>
              {produtos
                .filter((p) => p.ativo)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
            </Seletor>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Lote">
              <Input value={f.lote} onChange={(e) => setF({ ...f, lote: e.target.value })} required />
            </Campo>
            <Campo label="Validade">
              <Input
                type="date"
                value={f.validade}
                onChange={(e) => setF({ ...f, validade: e.target.value })}
                required={prod?.controla_lote ?? true}
              />
            </Campo>
            <Campo label={`Quantidade${prod ? ` (${UNIDADE_LABEL[prod.unidade]})` : ""}`}>
              <Input
                inputMode="decimal"
                value={f.quantidade}
                onChange={(e) => setF({ ...f, quantidade: e.target.value })}
                required
              />
            </Campo>
            <Campo label="Custo por unidade (R$)">
              <Input
                inputMode="decimal"
                value={f.custo_unitario}
                onChange={(e) => setF({ ...f, custo_unitario: e.target.value })}
              />
            </Campo>
            <Campo label="Fornecedor">
              <Input value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} />
            </Campo>
            <Campo label="Nota de compra">
              <Input value={f.nota_compra} onChange={(e) => setF({ ...f, nota_compra: e.target.value })} />
            </Campo>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              Registrar entrada
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormAjuste({ lote, fechar }: { lote: StockLot; fechar: () => void }) {
  const qc = useQueryClient();
  const [nova, setNova] = useState(String(lote.quantidade_atual));
  const [motivo, setMotivo] = useState("");

  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase.rpc("ajustar_lote", {
          p_lot_id: lote.id,
          p_nova_quantidade: num(nova),
          p_motivo: motivo.trim(),
        }),
      ),
    onSuccess: () => {
      toast.success("Ajuste registrado.");
      invalidarEstoque(qc);
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar lote {lote.lote}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
          className="grid gap-4"
        >
          <Campo label={`Quantidade contada (hoje: ${qtd(lote.quantidade_atual)})`}>
            <Input inputMode="decimal" value={nova} onChange={(e) => setNova(e.target.value)} required />
          </Campo>
          <Campo label="Motivo">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              Salvar ajuste
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
