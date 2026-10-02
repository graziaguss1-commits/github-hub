import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Vazio } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { check, supabase } from "@/lib/supabase";
import type { Patient, ProgressoPlano } from "@/lib/types";

export const Route = createFileRoute("/pacientes/")({
  head: () => ({ meta: [{ title: "Pacientes — Controle de Aplicações" }] }),
  component: Pacientes,
});

function Pacientes() {
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);

  const { data: pacientes = [], isLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => check(await supabase.from("patients").select("*").order("nome")) as Patient[],
  });
  const { data: progresso = [] } = useQuery({
    queryKey: ["v_progresso_plano"],
    queryFn: async () => check(await supabase.from("v_progresso_plano").select("*")) as ProgressoPlano[],
  });

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return b ? pacientes.filter((p) => p.nome.toLowerCase().includes(b) || p.telefone?.includes(b)) : pacientes;
  }, [busca, pacientes]);

  return (
    <AppShell
      titulo="Pacientes"
      acoes={
        <Button onClick={() => setNovo(true)}>
          <Plus /> Novo paciente
        </Button>
      }
    >
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {isLoading ? null : filtrados.length === 0 ? (
        <Vazio>{pacientes.length ? "Nenhum paciente encontrado." : "Nenhum paciente cadastrado."}</Vazio>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-48">Progresso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => {
                const ativo = progresso.find((g) => g.patient_id === p.id && g.status === "ativo");
                const pendente = ativo && ativo.proxima_semana !== null;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link to="/pacientes/$id" params={{ id: p.id }} className="hover:underline">
                        {p.nome}
                      </Link>
                    </TableCell>
                    <TableCell>{p.telefone ?? "—"}</TableCell>
                    <TableCell>
                      {!ativo ? (
                        <Etiqueta>sem plano ativo</Etiqueta>
                      ) : pendente ? (
                        <Etiqueta tom="info">em tratamento</Etiqueta>
                      ) : (
                        <Etiqueta tom="alerta">tratamento concluído</Etiqueta>
                      )}
                    </TableCell>
                    <TableCell>
                      {ativo && ativo.semanas_previstas > 0 && (
                        <div className="flex items-center gap-2">
                          <Progress value={(100 * ativo.semanas_realizadas) / ativo.semanas_previstas} />
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {ativo.semanas_realizadas}/{ativo.semanas_previstas}
                          </span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {novo && <NovoPaciente fechar={() => setNovo(false)} />}
    </AppShell>
  );
}

function NovoPaciente({ fechar }: { fechar: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");

  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase
          .from("patients")
          .insert({ nome: nome.trim(), telefone: telefone.trim() || null })
          .select("id")
          .single(),
      ) as { id: string },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void navigate({ to: "/pacientes/$id", params: { id: p.id } });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo paciente</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <Campo label="Nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </Campo>
          <Campo label="Telefone">
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              Cadastrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
