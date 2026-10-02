import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Vazio } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePode } from "@/lib/auth";
import { data, idade } from "@/lib/format";
import { check, supabase } from "@/lib/supabase";
import type { PacienteLista } from "@/lib/types";

export const Route = createFileRoute("/pacientes/")({
  head: () => ({ meta: [{ title: "Pacientes — Controle de Aplicações" }] }),
  component: Pacientes,
});

type Aba = "todos" | "em_tratamento" | "aniversariantes";

const SITUACAO: Record<PacienteLista["situacao"], { texto: string; cls: string }> = {
  em_tratamento: { texto: "Em tratamento", cls: "bg-[var(--info)]/10 text-[var(--info)]" },
  concluido: { texto: "Tratamento concluído", cls: "bg-[var(--atencao)]/10 text-[var(--atencao)]" },
  sem_plano: { texto: "—", cls: "bg-muted text-muted-foreground" },
};

const soDigitos = (v: string) => v.replace(/\D/g, "");

function Pacientes() {
  const admin = usePode("admin");
  const [aba, setAba] = useState<Aba>("todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<PacienteLista | "novo" | null>(null);
  const qc = useQueryClient();

  const { data: pacientes = [], isLoading } = useQuery({
    queryKey: ["patients", "lista"],
    queryFn: async () =>
      check(await supabase.from("v_paciente_lista").select("*").order("nome")) as PacienteLista[],
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => check(await supabase.rpc("excluir_paciente", { p_patient_id: id })),
    onSuccess: () => {
      toast.success("Paciente excluído.");
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const mesAtual = new Date().getMonth();
  const lista = useMemo(() => {
    let l = pacientes;
    if (aba === "em_tratamento") l = l.filter((p) => p.situacao === "em_tratamento");
    if (aba === "aniversariantes")
      l = l
        .filter((p) => p.data_nascimento && parseISO(p.data_nascimento).getMonth() === mesAtual)
        .sort((a, b) => parseISO(a.data_nascimento ?? "").getDate() - parseISO(b.data_nascimento ?? "").getDate());
    const b = busca.trim().toLowerCase();
    if (!b) return l;
    const dig = soDigitos(b);
    return l.filter(
      (p) =>
        p.nome.toLowerCase().includes(b) ||
        p.codigo.toLowerCase().includes(b) ||
        (dig.length >= 3 && (soDigitos(p.cpf ?? "").includes(dig) || soDigitos(p.telefone ?? "").includes(dig))),
    );
  }, [pacientes, aba, busca, mesAtual]);

  const abas: { id: Aba; texto: string }[] = [
    { id: "todos", texto: "Todos" },
    { id: "em_tratamento", texto: "Em tratamento" },
    { id: "aniversariantes", texto: "Aniversariantes do mês" },
  ];

  return (
    <AppShell
      titulo="Pacientes"
      acoes={
        <Button className="rounded-full" onClick={() => setEditando("novo")}>
          <Plus /> Novo paciente
        </Button>
      }
    >
      <p className="-mt-2 mb-4 text-muted-foreground">{pacientes.length} cadastrados</p>

      <div className="mb-6 flex gap-6 border-b">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={`-mb-px border-b-2 pb-3 text-sm ${
              aba === a.id ? "border-foreground font-medium" : "border-transparent text-muted-foreground"
            }`}
          >
            {a.texto}
          </button>
        ))}
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-4 top-3 size-4 text-muted-foreground" />
        <Input
          className="h-10 rounded-xl pl-11"
          placeholder="Buscar por nome, CPF, telefone ou código (PAC-…)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {isLoading ? null : lista.length === 0 ? (
        <Vazio>Nenhum paciente encontrado.</Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="eyebrow border-b text-left">
                <th className="px-5 py-4 font-normal">Código</th>
                <th className="px-5 py-4 font-normal">Paciente</th>
                <th className="px-5 py-4 font-normal">Telefone</th>
                <th className="px-5 py-4 font-normal">Últ. aplicação</th>
                <th className="px-5 py-4 font-normal">Situação</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const anos = idade(p.data_nascimento);
                const sit = SITUACAO[p.situacao];
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{p.codigo}</td>
                    <td className="px-5 py-4">
                      <Link to="/pacientes/$id" params={{ id: p.id }} className="font-medium hover:underline">
                        {p.nome}
                      </Link>
                      {(p.cpf || anos !== null) && (
                        <p className="text-xs text-muted-foreground">
                          {[p.cpf, anos !== null ? `${anos} anos` : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">{p.telefone ?? "—"}</td>
                    <td className="px-5 py-4">{p.ultima_aplicacao ? data(p.ultima_aplicacao) : "—"}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${sit.cls}`}>{sit.texto}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditando(p)} aria-label="Editar">
                          <Pencil />
                        </Button>
                        {admin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            aria-label="Excluir"
                            onClick={() => confirm(`Excluir ${p.nome}?`) && excluir.mutate(p.id)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editando && <FormPaciente paciente={editando === "novo" ? null : editando} fechar={() => setEditando(null)} />}
    </AppShell>
  );
}

function FormPaciente({ paciente, fechar }: { paciente: PacienteLista | null; fechar: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [nome, setNome] = useState(paciente?.nome ?? "");
  const [cpf, setCpf] = useState(paciente?.cpf ?? "");
  const [nascimento, setNascimento] = useState(paciente?.data_nascimento ?? "");
  const [telefone, setTelefone] = useState(paciente?.telefone ?? "");

  const salvar = useMutation({
    mutationFn: async () => {
      const linha = {
        nome: nome.trim(),
        cpf: cpf.trim() || null,
        data_nascimento: nascimento || null,
        telefone: telefone.trim() || null,
      };
      if (paciente) {
        check(await supabase.from("patients").update(linha).eq("id", paciente.id));
        return paciente.id;
      }
      return (check(await supabase.from("patients").insert(linha).select("id").single()) as { id: string }).id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["patient"] });
      if (paciente) fechar();
      else void navigate({ to: "/pacientes/$id", params: { id } });
    },
    onError: (e) =>
      toast.error(e.message.includes("patients_cpf_unico") ? "Já existe um paciente com este CPF." : e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{paciente ? `Editar ${paciente.codigo}` : "Novo paciente"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
          <Campo label="Nome completo">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="CPF">
              <Input inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </Campo>
            <Campo label="Data de nascimento">
              <Input type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
            </Campo>
          </div>
          <Campo label="Telefone">
            <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              {paciente ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
