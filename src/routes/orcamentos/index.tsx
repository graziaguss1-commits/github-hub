import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Seletor, Vazio } from "@/components/app/campos";
import { STATUS_ORCAMENTO } from "@/components/orcamento/dados";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, data } from "@/lib/format";
import { check, supabase } from "@/lib/supabase";
import type { OrcamentoTotal, Patient, QuoteStatus } from "@/lib/types";

export const Route = createFileRoute("/orcamentos/")({
  head: () => ({ meta: [{ title: "Orçamentos — Controle de Aplicações" }] }),
  component: Orcamentos,
});

function Orcamentos() {
  const [filtro, setFiltro] = useState<QuoteStatus | "">("");
  const [novo, setNovo] = useState(false);

  const { data: orcamentos = [], isLoading } = useQuery({
    queryKey: ["orcamentos", "todos"],
    queryFn: async () =>
      check(await supabase.from("v_orcamento").select("*").order("numero", { ascending: false }).limit(500)) as OrcamentoTotal[],
  });
  const { data: pacientes = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => check(await supabase.from("patients").select("*").order("nome")) as Patient[],
  });

  const lista = filtro ? orcamentos.filter((o) => o.status === filtro) : orcamentos;
  const nome = (id: string) => pacientes.find((p) => p.id === id)?.nome ?? "—";

  return (
    <AppShell
      titulo="Orçamentos"
      acoes={
        <Button onClick={() => setNovo(true)}>
          <Plus /> Novo orçamento
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <Seletor className="w-48" value={filtro} onChange={(e) => setFiltro(e.target.value as QuoteStatus | "")}>
          <option value="">Todos os status</option>
          {(Object.keys(STATUS_ORCAMENTO) as QuoteStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_ORCAMENTO[s].label}
            </option>
          ))}
        </Seletor>
      </div>
      {isLoading ? null : lista.length === 0 ? (
        <Vazio>Nenhum orçamento.</Vazio>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((o) => (
                <TableRow key={o.quote_id}>
                  <TableCell>
                    <Link to="/orcamentos/$id" params={{ id: o.quote_id }} className="font-medium hover:underline">
                      {o.numero}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to="/orcamentos/$id" params={{ id: o.quote_id }} className="hover:underline">
                      {nome(o.patient_id)}
                    </Link>
                  </TableCell>
                  <TableCell>{data(o.created_at.slice(0, 10))}</TableCell>
                  <TableCell>
                    <Etiqueta tom={STATUS_ORCAMENTO[o.status].tom}>{STATUS_ORCAMENTO[o.status].label}</Etiqueta>
                  </TableCell>
                  <TableCell className="text-right">{brl(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {novo && <NovoOrcamento pacientes={pacientes} fechar={() => setNovo(false)} />}
    </AppShell>
  );
}

function NovoOrcamento({ pacientes, fechar }: { pacientes: Patient[]; fechar: () => void }) {
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState("");
  const criar = useMutation({
    mutationFn: async () => criarOrcamento(paciente),
    onSuccess: (id) => void navigate({ to: "/orcamentos/$id", params: { id } }),
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo orçamento</DialogTitle>
        </DialogHeader>
        <Campo label="Paciente">
          <Seletor value={paciente} onChange={(e) => setPaciente(e.target.value)}>
            <option value="">Escolha…</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Seletor>
        </Campo>
        <p className="text-xs text-muted-foreground">
          Paciente novo? Cadastre em Pacientes e crie o orçamento pela página dele.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
          <Button onClick={() => criar.mutate()} disabled={!paciente || criar.isPending}>
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function criarOrcamento(patientId: string): Promise<string> {
  const q = check(await supabase.from("quotes").insert({ patient_id: patientId }).select("id").single()) as {
    id: string;
  };
  return q.id;
}
