import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Seletor, Vazio } from "@/components/app/campos";
import { STATUS_ORCAMENTO, useOrcamentosDoPaciente } from "@/components/orcamento/dados";
import { Compras } from "@/components/plano/Compras";
import { useDadosPlano, usePlanos, useRecarregarPlano } from "@/components/plano/dados";
import { Execucao } from "@/components/plano/Execucao";
import { Prescricao } from "@/components/plano/Prescricao";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePode } from "@/lib/auth";
import { brl, data, hojeISO } from "@/lib/format";
import { usePerfis } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Patient, Plan, ProgressoPlano } from "@/lib/types";

export const Route = createFileRoute("/pacientes/$id")({
  head: () => ({ meta: [{ title: "Paciente — Controle de Aplicações" }] }),
  component: PacienteDetalhe,
});

const STATUS_PLANO: Record<Plan["status"], string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  encerrado: "Encerrado",
};

function PacienteDetalhe() {
  const { id } = Route.useParams();
  const podePlano = usePode("admin", "medico");
  const { data: perfis = [] } = usePerfis();
  const [novoPlano, setNovoPlano] = useState(false);
  const [planoId, setPlanoId] = useState<string | null>(null);

  const { data: paciente } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => check(await supabase.from("patients").select("*").eq("id", id).single()) as Patient,
  });
  const { data: planos = [] } = usePlanos(id);
  const { data: progresso = [] } = useQuery({
    queryKey: ["v_progresso_plano", id],
    queryFn: async () =>
      check(await supabase.from("v_progresso_plano").select("*").eq("patient_id", id)) as ProgressoPlano[],
  });

  useEffect(() => {
    if (!planoId && planos.length) setPlanoId((planos.find((p) => p.status === "ativo") ?? planos[0])?.id ?? null);
  }, [planos, planoId]);

  const plano = planos.find((p) => p.id === planoId) ?? null;
  const prog = progresso.find((p) => p.plan_id === planoId);
  const { data: dados } = useDadosPlano(planoId);

  // Recria o editor de prescrição só quando as doses gravadas mudam (não a cada nova leitura).
  const versaoDoses = dados?.doses.map((d) => `${d.id}:${d.semana}:${d.sub_semana}:${d.dose}:${d.status}`).join("|");

  return (
    <AppShell
      titulo={paciente?.nome ?? "Paciente"}
      acoes={
        <>
          <Button variant="outline" asChild>
            <Link to="/pacientes">
              <ArrowLeft /> Pacientes
            </Link>
          </Button>
          <NovoOrcamentoBotao patientId={id} />
          {podePlano && (
            <Button variant="outline" onClick={() => setNovoPlano(true)}>
              <Plus /> Plano sem orçamento
            </Button>
          )}
        </>
      }
    >
      {paciente?.telefone && <p className="mb-4 text-sm text-muted-foreground">Telefone: {paciente.telefone}</p>}

      <OrcamentosDoPaciente patientId={id} />

      {planos.length === 0 ? (
        <Vazio>Ainda não tem plano de tratamento. Crie um orçamento e aprove para gerar o plano.</Vazio>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Seletor className="w-auto" value={planoId ?? ""} onChange={(e) => setPlanoId(e.target.value)}>
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  Plano de {data(p.inicio)} · {STATUS_PLANO[p.status]}
                  {p.observacoes?.startsWith("Gerado do orçamento") ? ` · ${p.observacoes.replace("Gerado do ", "")}` : ""}
                </option>
              ))}
            </Seletor>
            {plano && (
              <>
                <Etiqueta tom={plano.status === "ativo" ? "ok" : "neutro"}>{STATUS_PLANO[plano.status]}</Etiqueta>
                <span className="text-sm text-muted-foreground">
                  Médico(a): {perfis.find((p) => p.id === plano.medico_id)?.nome ?? "—"}
                </span>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/imprimir-plano/${plano.id}`} target="_blank" rel="noreferrer">
                    Imprimir plano
                  </a>
                </Button>
                {podePlano && <StatusPlano plano={plano} />}
              </>
            )}
          </div>

          {prog && prog.semanas_previstas > 0 && (
            <div className="mb-6 max-w-md">
              <div className="mb-1 flex justify-between text-sm">
                <span>Progresso</span>
                <span className="text-muted-foreground">
                  {prog.semanas_realizadas} de {prog.semanas_previstas} semanas
                  {prog.semanas_puladas > 0 && ` · ${prog.semanas_puladas} pulada(s)`}
                </span>
              </div>
              <Progress value={(100 * prog.semanas_realizadas) / prog.semanas_previstas} />
              {plano?.status === "ativo" && prog.proxima_semana === null && (
                <p className="mt-2 text-sm text-amber-700">Tratamento concluído: falta encerrar ou renovar.</p>
              )}
            </div>
          )}

          {plano && dados && (
            <Tabs defaultValue="execucao">
              <TabsList>
                <TabsTrigger value="execucao">Aplicações</TabsTrigger>
                <TabsTrigger value="prescricao">Prescrição</TabsTrigger>
                <TabsTrigger value="compras">Comprado e saldo</TabsTrigger>
              </TabsList>
              <TabsContent value="execucao" className="mt-4">
                <Execucao plano={plano} dados={dados} />
              </TabsContent>
              <TabsContent value="prescricao" className="mt-4">
                <Prescricao key={`${plano.id}:${versaoDoses}`} plano={plano} dados={dados} />
              </TabsContent>
              <TabsContent value="compras" className="mt-4">
                <Compras plano={plano} dados={dados} />
              </TabsContent>
            </Tabs>
          )}
        </>
      )}

      {novoPlano && (
        <NovoPlano
          patientId={id}
          fechar={(novo) => {
            setNovoPlano(false);
            if (novo) setPlanoId(novo);
          }}
        />
      )}
    </AppShell>
  );
}

function NovoOrcamentoBotao({ patientId }: { patientId: string }) {
  const navigate = useNavigate();
  const criar = useMutation({
    mutationFn: async () =>
      (check(await supabase.from("quotes").insert({ patient_id: patientId }).select("id").single()) as { id: string })
        .id,
    onSuccess: (quoteId) => void navigate({ to: "/orcamentos/$id", params: { id: quoteId } }),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
      <Receipt /> Novo orçamento
    </Button>
  );
}

function OrcamentosDoPaciente({ patientId }: { patientId: string }) {
  const { data: orcamentos = [] } = useOrcamentosDoPaciente(patientId);
  if (orcamentos.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 font-medium">Orçamentos</h2>
      <ul className="divide-y rounded-lg border">
        {orcamentos.map((o) => (
          <li key={o.quote_id}>
            <Link
              to="/orcamentos/$id"
              params={{ id: o.quote_id }}
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-muted/50"
            >
              <span className="font-medium">Nº {o.numero}</span>
              <span className="text-muted-foreground">{data(o.created_at.slice(0, 10))}</span>
              <Etiqueta tom={STATUS_ORCAMENTO[o.status].tom}>{STATUS_ORCAMENTO[o.status].label}</Etiqueta>
              <span className="ml-auto">{brl(o.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusPlano({ plano }: { plano: Plan }) {
  const recarregar = useRecarregarPlano();
  const mudar = useMutation({
    mutationFn: async (status: Plan["status"]) =>
      check(await supabase.from("plans").update({ status }).eq("id", plano.id)),
    onSuccess: () => {
      toast.success("Plano atualizado.");
      recarregar();
    },
    onError: (e) => toast.error(e.message),
  });

  if (plano.status === "encerrado") return null;
  return (
    <div className="flex gap-2">
      {plano.status === "ativo" ? (
        <Button size="sm" variant="outline" onClick={() => mudar.mutate("pausado")}>
          Pausar
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => mudar.mutate("ativo")}>
          Reativar
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          confirm("Encerrar o plano? As semanas não feitas ficam bloqueadas.") && mudar.mutate("encerrado")
        }
      >
        Encerrar
      </Button>
    </div>
  );
}

function NovoPlano({ patientId, fechar }: { patientId: string; fechar: (novo?: string) => void }) {
  const qc = useQueryClient();
  const { data: perfis = [] } = usePerfis();
  const [medico, setMedico] = useState("");
  const [inicio, setInicio] = useState(hojeISO());

  const salvar = useMutation({
    mutationFn: async () =>
      check(
        await supabase
          .from("plans")
          .insert({ patient_id: patientId, medico_id: medico || null, inicio })
          .select("id")
          .single(),
      ) as { id: string },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ["plans", patientId] });
      void qc.invalidateQueries({ queryKey: ["v_progresso_plano"] });
      fechar(p.id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo plano de tratamento</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
        >
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
          <Campo label="Início (semana 1)">
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => fechar()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvar.isPending}>
              Criar plano
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
