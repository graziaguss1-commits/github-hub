import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
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
import { useProdutos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Product, UnidadeProduto } from "@/lib/types";

export const Route = createFileRoute("/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Controle de Aplicações" }] }),
  component: Produtos,
});

const VAZIO = {
  nome: "",
  grupo: "",
  unidade: "ui" as UnidadeProduto,
  controla_lote: true,
  estoque_minimo: "0",
  custo_padrao: "0",
  ativo: true,
};

function Produtos() {
  const pode = usePode("admin", "medico");
  const { data: produtos = [], isLoading } = useProdutos();
  const [editando, setEditando] = useState<Product | "novo" | null>(null);

  return (
    <AppShell
      titulo="Produtos"
      acoes={
        pode && (
          <Button onClick={() => setEditando("novo")}>
            <Plus /> Novo produto
          </Button>
        )
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        O que fica no estoque. A unidade aqui é a unidade em que o estoque é contado.
      </p>
      {isLoading ? null : produtos.length === 0 ? (
        <Vazio>Nenhum produto cadastrado.</Vazio>
      ) : (
        <div className="cartao overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Estoque mínimo</TableHead>
                <TableHead className="text-right">Custo padrão</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((p) => (
                <TableRow
                  key={p.id}
                  className={pode ? "cursor-pointer" : undefined}
                  onClick={() => pode && setEditando(p)}
                >
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell>{p.grupo ?? "—"}</TableCell>
                  <TableCell>{UNIDADE_LABEL[p.unidade]}</TableCell>
                  <TableCell className="text-right">{qtd(p.estoque_minimo, p.unidade)}</TableCell>
                  <TableCell className="text-right">{brl(p.custo_padrao)}</TableCell>
                  <TableCell>{!p.ativo && <Etiqueta>inativo</Etiqueta>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {editando && <FormProduto produto={editando === "novo" ? null : editando} fechar={() => setEditando(null)} />}
    </AppShell>
  );
}

function FormProduto({ produto, fechar }: { produto: Product | null; fechar: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(
    produto
      ? {
          nome: produto.nome,
          grupo: produto.grupo ?? "",
          unidade: produto.unidade,
          controla_lote: produto.controla_lote,
          estoque_minimo: String(produto.estoque_minimo),
          custo_padrao: String(produto.custo_padrao),
          ativo: produto.ativo,
        }
      : VAZIO,
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const linha = {
        nome: f.nome.trim(),
        grupo: f.grupo.trim() || null,
        unidade: f.unidade,
        controla_lote: f.controla_lote,
        estoque_minimo: num(f.estoque_minimo),
        custo_padrao: num(f.custo_padrao),
        ativo: f.ativo,
      };
      if (produto) check(await supabase.from("products").update(linha).eq("id", produto.id));
      else check(await supabase.from("products").insert(linha));
    },
    onSuccess: () => {
      toast.success("Produto salvo.");
      void qc.invalidateQueries({ queryKey: ["products"] });
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
          <DialogTitle>{produto ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-4">
          <Campo label="Nome">
            <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Grupo">
              <Input value={f.grupo} onChange={(e) => setF({ ...f, grupo: e.target.value })} />
            </Campo>
            <Campo label="Unidade de estoque">
              <Seletor
                value={f.unidade}
                disabled={Boolean(produto)}
                onChange={(e) => setF({ ...f, unidade: e.target.value as UnidadeProduto })}
              >
                <option value="ui">UI</option>
                <option value="ml">mL</option>
                <option value="ampola">Ampola</option>
                <option value="protocolo">Protocolo</option>
              </Seletor>
            </Campo>
            <Campo label="Estoque mínimo">
              <Input
                inputMode="decimal"
                value={f.estoque_minimo}
                onChange={(e) => setF({ ...f, estoque_minimo: e.target.value })}
              />
            </Campo>
            <Campo label="Custo padrão (R$)">
              <Input
                inputMode="decimal"
                value={f.custo_padrao}
                onChange={(e) => setF({ ...f, custo_padrao: e.target.value })}
              />
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={f.controla_lote}
              onCheckedChange={(v) => setF({ ...f, controla_lote: v === true })}
            />
            Controla lote e validade
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.ativo} onCheckedChange={(v) => setF({ ...f, ativo: v === true })} />
            Ativo
          </label>
          {produto && (
            <p className="text-xs text-muted-foreground">
              A unidade não muda depois do cadastro, para não distorcer o saldo dos lotes.
            </p>
          )}
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
