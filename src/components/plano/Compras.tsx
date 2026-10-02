import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Campo, Seletor, Vazio } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePode } from "@/lib/auth";
import { num, qtd, UNIDADE_LABEL } from "@/lib/format";
import { useComposicao, useProcedimentos, useProdutos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Plan, UnidadeDose } from "@/lib/types";

import { useRecarregarPlano, type DadosPlano } from "./dados";

export function Compras({ plano, dados }: { plano: Plan; dados: DadosPlano }) {
  const pode = usePode("admin", "medico") && plano.status !== "encerrado";
  const recarregar = useRecarregarPlano();
  const [nova, setNova] = useState(false);

  const remover = useMutation({
    mutationFn: async (id: string) => check(await supabase.from("plan_purchases").delete().eq("id", id)),
    onSuccess: () => {
      toast.success("Item removido.");
      recarregar();
    },
    onError: () => toast.error("Este item já tem aplicações e não pode ser removido."),
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          O que o paciente comprou. Contratado x prescrito x aplicado, calculado no banco.
        </p>
        {pode && (
          <Button size="sm" onClick={() => setNova(true)}>
            <Plus /> Adicionar item
          </Button>
        )}
      </div>
      {dados.saldo.length === 0 ? (
        <Vazio>Nenhum item comprado neste plano.</Vazio>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Compra</TableHead>
                <TableHead className="text-right">Contratado</TableHead>
                <TableHead className="text-right">Prescrito</TableHead>
                <TableHead className="w-56">Aplicado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.saldo.map((s) => {
                const excede = s.prescrito > s.contratado;
                return (
                  <TableRow key={s.purchase_id}>
                    <TableCell className="font-medium">
                      {s.procedimento}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{s.codigo}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.vendido_por === "aplicacao"
                        ? `${qtd(s.quantidade)} aplicações de ${qtd(s.dose_padrao, s.unidade_dose)}`
                        : `${qtd(s.quantidade, s.unidade_dose)} (dose sugerida ${qtd(s.dose_padrao, s.unidade_dose)})`}
                    </TableCell>
                    <TableCell className="text-right">{qtd(s.contratado, s.unidade_dose)}</TableCell>
                    <TableCell className={excede ? "text-right font-medium text-destructive" : "text-right"}>
                      {qtd(s.prescrito, s.unidade_dose)} {excede && "· Excede"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={s.contratado ? (100 * s.aplicado) / s.contratado : 0} />
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {qtd(s.aplicado)}/{qtd(s.contratado, s.unidade_dose)} · restam{" "}
                          {qtd(s.contratado - s.aplicado)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {pode && s.aplicado === 0 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => confirm("Remover este item do plano?") && remover.mutate(s.purchase_id)}
                        >
                          <Trash2 />
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
      {nova && <NovaCompra plano={plano} fechar={() => setNova(false)} />}
    </div>
  );
}

function NovaCompra({ plano, fechar }: { plano: Plan; fechar: () => void }) {
  const recarregar = useRecarregarPlano();
  const { data: procs = [] } = useProcedimentos();
  const { data: comp = [] } = useComposicao();
  const { data: produtos = [] } = useProdutos();
  const [procId, setProcId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [unidadeDose, setUnidadeDose] = useState<UnidadeDose>("aplicacao");
  const [dose, setDose] = useState("1");

  const proc = procs.find((p) => p.id === procId);

  function escolher(id: string) {
    setProcId(id);
    const p = procs.find((x) => x.id === id);
    // sugere unidade e dose a partir do primeiro produto em UI/mL da composição
    const item = comp
      .filter((c) => c.procedure_id === id)
      .map((c) => ({ c, prod: produtos.find((x) => x.id === c.product_id) }))
      .find(({ prod }) => prod?.unidade === "ui" || prod?.unidade === "ml");
    if (item?.prod && (item.prod.unidade === "ui" || item.prod.unidade === "ml")) {
      setUnidadeDose(item.prod.unidade);
      setDose(String(item.c.quantidade_padrao));
    } else {
      setUnidadeDose(p?.forma_venda === "unidade" ? "ui" : "aplicacao");
      setDose("1");
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!proc) throw new Error("Escolha o procedimento.");
      check(
        await supabase.from("plan_purchases").insert({
          plan_id: plano.id,
          procedure_id: proc.id,
          vendido_por: proc.forma_venda,
          quantidade: num(quantidade),
          unidade_dose: unidadeDose,
          dose_padrao: unidadeDose === "aplicacao" ? 1 : num(dose),
        }),
      );
    },
    onSuccess: () => {
      toast.success("Item adicionado.");
      recarregar();
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  const porAplicacao = proc?.forma_venda !== "unidade";

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar item comprado</DialogTitle>
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
                .filter((p) => p.ativo && p.categoria !== "acompanhamento")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.forma_venda === "aplicacao" ? "por aplicação" : "por UI/mL"})
                  </option>
                ))}
            </Seletor>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label={porAplicacao ? "Nº de aplicações" : `Total comprado (${UNIDADE_LABEL[unidadeDose]})`}>
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
          </div>
          {proc && porAplicacao && unidadeDose !== "aplicacao" && num(quantidade) > 0 && (
            <p className="text-sm text-muted-foreground">
              Contratado: {qtd(num(quantidade) * num(dose), unidadeDose)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Programa de acompanhamento (consultas) não entra aqui: ele é separado do tratamento de aplicações.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              Adicionar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
