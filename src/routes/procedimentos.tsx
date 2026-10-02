import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Seletor, Vazio } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePode } from "@/lib/auth";
import { brl, num, qtd, UNIDADE_LABEL } from "@/lib/format";
import { useComposicao, useProcedimentos, useProdutos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Procedure } from "@/lib/types";

export const Route = createFileRoute("/procedimentos")({
  head: () => ({ meta: [{ title: "Procedimentos — Controle de Aplicações" }] }),
  component: Procedimentos,
});

const CATEGORIAS = ["injetavel", "consulta", "acompanhamento", "coadjuvante", "outro"];

function Procedimentos() {
  const pode = usePode("admin", "medico");
  const { data: procs = [], isLoading } = useProcedimentos();
  const { data: itens = [] } = useComposicao();
  const { data: produtos = [] } = useProdutos();
  const [editando, setEditando] = useState<Procedure | "novo" | null>(null);

  const nomeProduto = (id: string) => produtos.find((p) => p.id === id);

  return (
    <AppShell
      titulo="Procedimentos"
      acoes={
        pode && (
          <Button onClick={() => setEditando("novo")}>
            <Plus /> Novo procedimento
          </Button>
        )
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        O que é vendido e aplicado. A composição diz quanto de cada produto uma aplicação consome.
      </p>
      {isLoading ? null : procs.length === 0 ? (
        <Vazio>Nenhum procedimento cadastrado.</Vazio>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Venda</TableHead>
                <TableHead>Composição</TableHead>
                <TableHead className="text-right">Preço base</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procs.map((p) => (
                <TableRow
                  key={p.id}
                  className={pode ? "cursor-pointer" : undefined}
                  onClick={() => pode && setEditando(p)}
                >
                  <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                  <TableCell className="font-medium">
                    {p.nome} {!p.ativo && <Etiqueta>inativo</Etiqueta>}
                  </TableCell>
                  <TableCell>{p.forma_venda === "aplicacao" ? "Por aplicação" : "Por UI/mL"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {itens
                      .filter((i) => i.procedure_id === p.id)
                      .map((i) => {
                        const prod = nomeProduto(i.product_id);
                        return `${prod?.nome ?? "?"} ${qtd(i.quantidade_padrao, prod?.unidade)}`;
                      })
                      .join(" + ") || "—"}
                  </TableCell>
                  <TableCell className="text-right">{brl(p.preco_base)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editando && (
        <FormProcedimento proc={editando === "novo" ? null : editando} fechar={() => setEditando(null)} />
      )}
    </AppShell>
  );
}

type LinhaComposicao = { product_id: string; quantidade_padrao: string };

function FormProcedimento({ proc, fechar }: { proc: Procedure | null; fechar: () => void }) {
  const qc = useQueryClient();
  const { data: produtos = [] } = useProdutos();
  const { data: itens = [] } = useComposicao();
  const [f, setF] = useState({
    nome: proc?.nome ?? "",
    categoria: proc?.categoria ?? "injetavel",
    forma_venda: proc?.forma_venda ?? ("aplicacao" as Procedure["forma_venda"]),
    preco_base: String(proc?.preco_base ?? 0),
    custo_base: String(proc?.custo_base ?? 0),
    ativo: proc?.ativo ?? true,
  });
  const [comp, setComp] = useState<LinhaComposicao[]>(() =>
    proc
      ? itens
          .filter((i) => i.procedure_id === proc.id)
          .map((i) => ({ product_id: i.product_id, quantidade_padrao: String(i.quantidade_padrao) }))
      : [],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const linha = {
        nome: f.nome.trim(),
        categoria: f.categoria,
        forma_venda: f.forma_venda,
        preco_base: num(f.preco_base),
        custo_base: num(f.custo_base),
        ativo: f.ativo,
      };
      const validas = comp.filter((c) => c.product_id && num(c.quantidade_padrao) > 0);
      if (new Set(validas.map((c) => c.product_id)).size !== validas.length) {
        throw new Error("O mesmo produto aparece duas vezes na composição.");
      }
      let id = proc?.id;
      if (id) {
        check(await supabase.from("procedures").update(linha).eq("id", id));
        check(await supabase.from("procedure_items").delete().eq("procedure_id", id));
      } else {
        const novo = check(await supabase.from("procedures").insert(linha).select("id").single()) as {
          id: string;
        };
        id = novo.id;
      }
      if (validas.length) {
        check(
          await supabase.from("procedure_items").insert(
            validas.map((c) => ({
              procedure_id: id,
              product_id: c.product_id,
              quantidade_padrao: num(c.quantidade_padrao),
            })),
          ),
        );
      }
    },
    onSuccess: () => {
      toast.success("Procedimento salvo.");
      void qc.invalidateQueries({ queryKey: ["procedures"] });
      void qc.invalidateQueries({ queryKey: ["procedure_items"] });
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{proc ? `Editar ${proc.codigo}` : "Novo procedimento"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-4">
          <Campo label="Nome">
            <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Categoria">
              <Seletor value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Seletor>
            </Campo>
            <Campo label="Forma de venda">
              <Seletor
                value={f.forma_venda}
                onChange={(e) => setF({ ...f, forma_venda: e.target.value as Procedure["forma_venda"] })}
              >
                <option value="aplicacao">Por aplicação (dose fixa)</option>
                <option value="unidade">Por UI/mL (saldo)</option>
              </Seletor>
            </Campo>
            <Campo label="Preço base (R$)">
              <Input
                inputMode="decimal"
                value={f.preco_base}
                onChange={(e) => setF({ ...f, preco_base: e.target.value })}
              />
            </Campo>
            <Campo label="Custo base (R$)">
              <Input
                inputMode="decimal"
                value={f.custo_base}
                onChange={(e) => setF({ ...f, custo_base: e.target.value })}
              />
            </Campo>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Composição (por aplicação)</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setComp([...comp, { product_id: "", quantidade_padrao: "" }])}
              >
                <Plus /> Produto
              </Button>
            </div>
            {comp.length === 0 && (
              <p className="text-xs text-muted-foreground">Sem produtos: este procedimento não baixa estoque.</p>
            )}
            {comp.map((c, i) => {
              const prod = produtos.find((p) => p.id === c.product_id);
              return (
                <div key={i} className="flex items-center gap-2">
                  <Seletor
                    value={c.product_id}
                    onChange={(e) =>
                      setComp(comp.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))
                    }
                  >
                    <option value="">Escolha o produto…</option>
                    {produtos
                      .filter((p) => p.ativo || p.id === c.product_id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                  </Seletor>
                  <Input
                    className="w-24"
                    inputMode="decimal"
                    placeholder="Qtd."
                    value={c.quantidade_padrao}
                    onChange={(e) =>
                      setComp(comp.map((x, j) => (j === i ? { ...x, quantidade_padrao: e.target.value } : x)))
                    }
                  />
                  <span className="w-16 text-xs text-muted-foreground">{prod ? UNIDADE_LABEL[prod.unidade] : ""}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setComp(comp.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v === true })} />
            Ativo
          </label>
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
