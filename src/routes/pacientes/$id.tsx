import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Receipt } from "lucide-react";
import { addDays, format } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Confirmar } from "@/components/app/Confirmar";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Seletor, Vazio } from "@/components/app/campos";
import { STATUS_ORCAMENTO, useOrcamentosDoPaciente } from "@/components/orcamento/dados";
import { Compras } from "@/components/plano/Compras";
import { useDadosPlano, usePlanos, useRecarregarPlano } from "@/components/plano/dados";
import { Execucao } from "@/components/plano/Execucao";
import { PrescricaoComResumo } from "@/components/plano/PrescricaoComResumo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePode } from "@/lib/auth";
import { brl, data, hojeISO, idade, inicioDaSemana } from "@/lib/format";
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
      {paciente && (
        <p className="mb-4 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          <span className="font-mono">{paciente.codigo}</span>
          {paciente.cpf && <span>CPF {paciente.cpf}</span>}
          {idade(paciente.data_nascimento) !== null && <span>{idade(paciente.data_nascimento)} anos</span>}
          {paciente.telefone && <span>{paciente.telefone}</span>}
        </p>
      )}

      <Tabs defaultValue="cronograma">
        <TabsList className="mb-6 h-auto flex-wrap rounded-xl p-1">
          <TabsTrigger value="cronograma" className="px-4 py-2">Cronograma</TabsTrigger>
          <TabsTrigger value="prescricao" className="px-4 py-2">Prescrição</TabsTrigger>
          <TabsTrigger value="compras" className="px-4 py-2">Comprado e saldo</TabsTrigger>
          <TabsTrigger value="orcamentos" className="px-4 py-2">Orçamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="orcamentos">
          <OrcamentosDoPaciente patientId={id} />
        </TabsContent>

        {planos.length === 0 ? (
          <>
            {["cronograma", "prescricao", "compras"].map((v) => (
              <TabsContent key={v} value={v}>
                <Vazio>Ainda não tem plano de tratamento. Crie um orçamento e aprove para gerar o plano.</Vazio>
              </TabsContent>
            ))}
          </>
        ) : (
          plano && (
            <>
              <CabecalhoPlano
                plano={plano}
                planos={planos}
                setPlanoId={setPlanoId}
                prog={prog}
                ultimaSemana={dados ? Math.max(1, ...dados.doses.map((d) => d.semana)) : 1}
                medico={perfis.find((p) => p.id === plano.medico_id)?.nome}
                podePlano={podePlano}
              />
              {dados && (
                <>
                  <TabsContent value="cronograma">
                    <Execucao plano={plano} dados={dados} />
                  </TabsContent>
                  <TabsContent value="prescricao">
                    <PrescricaoComResumo plano={plano} dados={dados} />
                  </TabsContent>
                  <TabsContent value="compras">
                    <Compras plano={plano} dados={dados} />
                  </TabsContent>
                </>
              )}
            </>
          )
        )}
      </Tabs>

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

function CabecalhoPlano({
  plano,
  planos,
  setPlanoId,
  prog,
  ultimaSemana,
  medico,
  podePlano,
}: {
  plano: Plan;
  planos: Plan[];
  setPlanoId: (id: string) => void;
  prog: ProgressoPlano | undefined;
  ultimaSemana: number;
  medico: string | undefined;
  podePlano: boolean;
}) {
  const { data: quote } = useQuery({
    queryKey: ["quote-do-plano", plano.id],
    queryFn: async () =>
      check(await supabase.from("quotes").select("id, numero").eq("plan_id", plano.id).maybeSingle()) as
        | { id: string; numero: number }
        | null,
  });
  const fim = format(addDays(inicioDaSemana(plano.inicio, ultimaSemana), 6), "yyyy-MM-dd");
  const previstas = prog?.semanas_previstas ?? 0;
  const realizadas = prog?.semanas_realizadas ?? 0;
  const puladas = prog?.semanas_puladas ?? 0;
  const pct = previstas ? (100 * realizadas) / previstas : 0;

  return (
    <div className="mb-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {planos.length > 1 ? (
          <Seletor className="w-auto" value={plano.id} onChange={(e) => setPlanoId(e.target.value)}>
            {planos.map((p) => (
              <option key={p.id} value={p.id}>
                Tratamento {data(p.inicio)} · {STATUS_PLANO[p.status]}
              </option>
            ))}
          </Seletor>
        ) : (
          <span className="text-sm text-muted-foreground">
            Tratamento {data(plano.inicio)} — {data(fim)}
          </span>
        )}
        {quote && (
          <Link
            to="/orcamentos/$id"
            params={{ id: quote.id }}
            className="rounded-full border px-2.5 py-0.5 text-xs font-semibold hover:bg-muted"
          >
            Orçamento #{quote.numero}
          </Link>
        )}
        {plano.status !== "ativo" && <Etiqueta>{STATUS_PLANO[plano.status]}</Etiqueta>}
        {medico && <span className="text-sm text-muted-foreground">Médico(a): {medico}</span>}
        <div className="ml-auto">{podePlano && <StatusPlano plano={plano} />}</div>
      </div>

      <div className="destaque px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">Progresso do tratamento</p>
            <p className="mt-1 text-lg font-semibold">
              {realizadas} de {previstas} semanas realizadas
            </p>
          </div>
          <a
            href={`/imprimir-plano/${plano.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-medium hover:bg-white/20"
          >
            Plano em PDF
          </a>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/10">
          <div className="h-1.5 rounded-full bg-[var(--sucesso)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">
          <span>Início {data(plano.inicio)}</span>
          <span>Fim previsto {data(fim)}</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Numero valor={realizadas} rotulo="realizadas" />
          <Numero valor={puladas} rotulo="puladas" destaque="text-[#f5b766]" />
          <Numero valor={Math.max(0, previstas - realizadas)} rotulo="a realizar" />
        </div>
        {plano.status === "ativo" && previstas > 0 && prog?.proxima_semana === null && (
          <p className="mt-4 text-sm text-[#f5b766]">Tratamento concluído: falta encerrar ou renovar.</p>
        )}
      </div>
    </div>
  );
}

function Numero({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.07] px-4 py-2.5">
      <p className={`text-xl font-semibold ${destaque ?? ""}`}>{valor}</p>
      <p className="text-xs text-white/60">{rotulo}</p>
    </div>
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
  if (orcamentos.length === 0) return <Vazio>Nenhum orçamento para este paciente.</Vazio>;
  return (
    <section>
      <ul className="cartao divide-y overflow-hidden">
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
  const [encerrar, setEncerrar] = useState(false);
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
        onClick={() => setEncerrar(true)}
      >
        Encerrar
      </Button>
      {encerrar && (
        <Confirmar
          titulo="Encerrar o plano?"
          descricao="As semanas não feitas ficam bloqueadas. As aplicações já feitas continuam no histórico."
          textoBotao="Encerrar"
          destrutivo
          carregando={mudar.isPending}
          onConfirmar={() => mudar.mutate("encerrado", { onSettled: () => setEncerrar(false) })}
          fechar={() => setEncerrar(false)}
        />
      )}
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
