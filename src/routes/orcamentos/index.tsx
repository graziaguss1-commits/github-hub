import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, FileText, Plus, Search, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Seletor, Vazio } from "@/components/app/campos";
import { STATUS_ORCAMENTO } from "@/components/orcamento/dados";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { brl, data } from "@/lib/format";
import { usePerfis } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { OrcamentoTotal, Patient, QuoteStatus } from "@/lib/types";

export const Route = createFileRoute("/orcamentos/")({
  head: () => ({ meta: [{ title: "Orçamentos — Controle de Aplicações" }] }),
  component: Orcamentos,
});

const CORES: Record<QuoteStatus, string> = {
  aprovado: "#0E1A34",
  enviado: "#3D8CDB",
  rascunho: "#555E72",
  perdido: "#CF7317",
  cancelado: "#D92626",
};

type Filtro = QuoteStatus | "" | "falta_prescrever";

function Orcamentos() {
  const [filtro, setFiltro] = useState<Filtro>("");
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const { data: perfis = [] } = usePerfis();

  const { data: orcamentos = [], isLoading } = useQuery({
    queryKey: ["orcamentos", "todos"],
    queryFn: async () =>
      check(await supabase.from("v_orcamento").select("*").order("numero", { ascending: false }).limit(1000)) as OrcamentoTotal[],
  });
  const { data: pacientes = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => check(await supabase.from("patients").select("*").order("nome")) as Patient[],
  });

  const nomePaciente = (id: string) => pacientes.find((p) => p.id === id)?.nome ?? "—";
  const nomeMedico = (id: string | null) => perfis.find((p) => p.id === id)?.nome ?? "—";

  const contagem = useMemo(() => {
    const c = { rascunho: 0, enviado: 0, aprovado: 0, perdido: 0, cancelado: 0 } as Record<QuoteStatus, number>;
    for (const o of orcamentos) c[o.status]++;
    return c;
  }, [orcamentos]);
  const decididos = contagem.aprovado + contagem.perdido;
  const conversao = decididos ? (100 * contagem.aprovado) / decididos : 0;
  const faltaPrescrever = orcamentos.filter((o) => o.falta_prescrever).length;

  const lista = orcamentos.filter((o) => {
    if (filtro === "falta_prescrever" ? !o.falta_prescrever : filtro && o.status !== filtro) return false;
    const b = busca.trim().toLowerCase();
    if (!b) return true;
    return (
      String(o.numero).includes(b.replace("#", "")) ||
      nomePaciente(o.patient_id).toLowerCase().includes(b) ||
      nomeMedico(o.medico_id).toLowerCase().includes(b)
    );
  });

  return (
    <AppShell
      titulo="Orçamentos"
      acoes={
        <>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="w-64 rounded-full pl-9"
              placeholder="Buscar nº, paciente, médico…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Seletor className="w-44 rounded-full" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
            <option value="">Todos</option>
            {(Object.keys(STATUS_ORCAMENTO) as QuoteStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_ORCAMENTO[s].label}
              </option>
            ))}
            <option value="falta_prescrever">Falta prescrever</option>
          </Seletor>
          <Button className="rounded-full" onClick={() => setNovo(true)}>
            <Plus /> Novo orçamento
          </Button>
        </>
      }
    >
      <p className="-mt-2 mb-6 text-muted-foreground">{orcamentos.length} orçamentos</p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Indicador rotulo="Taxa de conversão" valor={`${conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} />
        <Indicador rotulo="Aprovados" valor={contagem.aprovado} icone={<TrendingUp className="size-4 text-[var(--sucesso)]" />} />
        <Indicador rotulo="Perdidos" valor={contagem.perdido} icone={<TrendingDown className="size-4 text-[var(--erro)]" />} />
        <Indicador
          rotulo="Em aberto"
          valor={contagem.rascunho + contagem.enviado}
          icone={<FileText className="size-4 text-muted-foreground" />}
        />
        <button type="button" className="text-left" onClick={() => setFiltro("falta_prescrever")}>
          <Indicador
            rotulo="Falta prescrever"
            valor={faltaPrescrever}
            destaque="text-[var(--atencao)]"
            icone={<AlertTriangle className="size-4 text-[var(--atencao)]" />}
          />
        </button>
        <div className="cartao flex items-center justify-center p-4">
          <Rosca contagem={contagem} />
        </div>
      </div>

      {isLoading ? null : lista.length === 0 ? (
        <Vazio>Nenhum orçamento.</Vazio>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-5 py-4 font-medium">Nº</th>
                <th className="px-5 py-4 font-medium">Paciente</th>
                <th className="px-5 py-4 font-medium">Médico</th>
                <th className="px-5 py-4 font-medium">Total</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 font-medium">Data</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.quote_id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-4 font-semibold">
                    <Link to="/orcamentos/$id" params={{ id: o.quote_id }}>
                      #{o.numero}
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-medium">
                    <Link to="/orcamentos/$id" params={{ id: o.quote_id }} className="hover:underline">
                      {nomePaciente(o.patient_id)}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{nomeMedico(o.medico_id)}</td>
                  <td className="px-5 py-4">{brl(o.total)}</td>
                  <td className="px-5 py-4">
                    <span
                      className="inline-flex rounded-full px-3 py-1 text-xs font-medium text-white"
                      style={{ background: CORES[o.status] }}
                    >
                      {STATUS_ORCAMENTO[o.status].label}
                    </span>
                    {o.falta_prescrever && <span className="ml-2 text-xs font-medium text-[var(--atencao)]">falta prescrever</span>}
                  </td>
                  <td className="px-5 py-4">{data(o.created_at.slice(0, 10))}</td>
                  <td className="px-5 py-4 text-right">
                    <a
                      href={`/imprimir-orcamento/${o.quote_id}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Orçamento em PDF"
                      className="inline-flex text-muted-foreground hover:text-foreground"
                    >
                      <FileText className="size-5" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {novo && <NovoOrcamento pacientes={pacientes} fechar={() => setNovo(false)} />}
    </AppShell>
  );
}

function Indicador({
  rotulo,
  valor,
  icone,
  destaque,
}: {
  rotulo: string;
  valor: ReactNode;
  icone?: ReactNode;
  destaque?: string;
}) {
  return (
    <div className="flex h-full items-start gap-3 cartao p-6">
      {icone && <span className="mt-1">{icone}</span>}
      <div>
        <p className="text-sm text-muted-foreground">{rotulo}</p>
        <p className={`text-2xl font-semibold ${destaque ?? ""}`}>{valor}</p>
      </div>
    </div>
  );
}

/** Rosca com a proporção de orçamentos por status. */
function Rosca({ contagem }: { contagem: Record<QuoteStatus, number> }) {
  const total = Object.values(contagem).reduce((s, n) => s + n, 0);
  const r = 30;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <svg viewBox="0 0 80 80" className="size-20" role="img" aria-label="Orçamentos por status">
      <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth="12" />
      {total > 0 &&
        (Object.keys(contagem) as QuoteStatus[]).map((s) => {
          const fatia = (contagem[s] / total) * c;
          const el = (
            <circle
              key={s}
              cx="40"
              cy="40"
              r={r}
              fill="none"
              stroke={CORES[s]}
              strokeWidth="12"
              strokeDasharray={`${fatia} ${c - fatia}`}
              strokeDashoffset={-acumulado}
              transform="rotate(-90 40 40)"
            >
              <title>
                {STATUS_ORCAMENTO[s].label}: {contagem[s]}
              </title>
            </circle>
          );
          acumulado += fatia;
          return el;
        })}
    </svg>
  );
}

function NovoOrcamento({ pacientes, fechar }: { pacientes: Patient[]; fechar: () => void }) {
  const navigate = useNavigate();
  const [paciente, setPaciente] = useState("");
  const criar = useMutation({
    mutationFn: async () =>
      (check(await supabase.from("quotes").insert({ patient_id: paciente }).select("id").single()) as { id: string }).id,
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
        <p className="text-xs text-muted-foreground">Paciente novo? Cadastre em Pacientes e crie o orçamento pela página dele.</p>
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
