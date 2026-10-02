import { useMutation } from "@tanstack/react-query";
import { Lock, Plus, Wand2, X } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { Etiqueta, Seletor, Vazio } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePode } from "@/lib/auth";
import { dataCurta, inicioDaSemana, num, qtd, rotuloSemana, UNIDADE_LABEL } from "@/lib/format";
import { useProcedimentos } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Plan, PlanPurchase } from "@/lib/types";

import { chaveSemana, useRecarregarPlano, type DadosPlano } from "./dados";

type Chip = {
  key: string;
  purchase_id: string;
  semana: number;
  sub_semana: number;
  dose: string;
  realizada: boolean;
};

let seq = 0;
const novaChave = () => `n${++seq}`;

// Frequência por item, como no NutroClinic.
type Frequencia = "2x" | "semanal" | "quinzenal" | "mensal" | "n";
const FREQUENCIAS: { valor: Frequencia; rotulo: string }[] = [
  { valor: "semanal", rotulo: "Semanal" },
  { valor: "2x", rotulo: "2x por semana" },
  { valor: "quinzenal", rotulo: "Quinzenal" },
  { valor: "mensal", rotulo: "Mensal (a cada 4 semanas)" },
  { valor: "n", rotulo: "A cada N semanas" },
];
type Config = { frequencia: Frequencia; cadaN: string; inicio: string };

export function Prescricao({ plano, dados }: { plano: Plan; dados: DadosPlano }) {
  const pode = usePode("admin", "medico") && plano.status !== "encerrado";
  const recarregar = useRecarregarPlano();
  const { data: procs = [] } = useProcedimentos();

  const [chips, setChips] = useState<Chip[]>(() =>
    dados.doses.map((d) => ({
      key: d.id,
      purchase_id: d.purchase_id,
      semana: d.semana,
      sub_semana: d.sub_semana,
      dose: String(d.dose),
      realizada: d.status === "realizada",
    })),
  );
  const [extras, setExtras] = useState<string[]>([]);
  const [config, setConfig] = useState<Record<string, Config>>({});
  const [sujo, setSujo] = useState(false);

  // semanas realizadas ou puladas ficam travadas
  const travadas = useMemo(
    () =>
      new Set(
        dados.aplicacoes
          .filter((a) => a.status === "concluida" || a.status === "pulada")
          .map((a) => chaveSemana(a.semana, a.sub_semana)),
      ),
    [dados.aplicacoes],
  );
  const puladas = useMemo(
    () => new Set(dados.aplicacoes.filter((a) => a.status === "pulada").map((a) => chaveSemana(a.semana, a.sub_semana))),
    [dados.aplicacoes],
  );

  const nomeCompra = (c: PlanPurchase) => procs.find((p) => p.id === c.procedure_id)?.nome ?? "…";
  const compra = (id: string) => dados.compras.find((c) => c.id === id);

  const linhas = useMemo(() => {
    const chaves = new Set<string>([...chips.map((c) => chaveSemana(c.semana, c.sub_semana)), ...travadas, ...extras]);
    if (chaves.size === 0) chaves.add(chaveSemana(1, 1));
    return [...chaves]
      .map((k) => {
        const [s, sub] = k.split("-").map(Number);
        return { semana: s ?? 1, sub: sub ?? 1, chave: k };
      })
      .sort((a, b) => a.semana - b.semana || a.sub - b.sub);
  }, [chips, travadas, extras]);

  const pool = dados.compras.map((c) => {
    const prescrito = chips.filter((x) => x.purchase_id === c.id).reduce((s, x) => s + num(x.dose), 0);
    return { compra: c, prescrito, excede: prescrito > c.contratado + 1e-9 };
  });
  const algumExcede = pool.some((p) => p.excede);

  function mudar(fn: (c: Chip[]) => Chip[]) {
    setChips(fn);
    setSujo(true);
  }

  const primeiraLivre = Math.max(0, ...[...travadas].map((k) => Number(k.split("-")[0]))) + 1;
  const configDe = (id: string): Config =>
    config[id] ?? { frequencia: "semanal", cadaN: "3", inicio: String(primeiraLivre) };

  /** Refaz as doses previstas de um item a partir da frequência escolhida para ele. */
  function dosesDoItem(c: PlanPurchase, base: Chip[]): Chip[] {
    const cfg = configDe(c.id);
    const passo =
      cfg.frequencia === "quinzenal" ? 2 : cfg.frequencia === "mensal" ? 4 : cfg.frequencia === "n" ? Math.max(1, Math.round(num(cfg.cadaN))) : 1;
    const subs = cfg.frequencia === "2x" ? [1, 2] : [1];
    let semana = Math.max(primeiraLivre, Math.round(num(cfg.inicio)) || primeiraLivre);
    let restante =
      c.contratado - base.filter((x) => x.realizada && x.purchase_id === c.id).reduce((s, x) => s + num(x.dose), 0);
    const novas: Chip[] = [];
    let guarda = 0;
    while (restante > 1e-9 && guarda++ < 500) {
      for (const sub of subs) {
        if (restante <= 1e-9) break;
        if (travadas.has(chaveSemana(semana, sub))) continue;
        const dose = Math.min(c.dose_padrao, restante);
        novas.push({ key: novaChave(), purchase_id: c.id, semana, sub_semana: sub, dose: String(dose), realizada: false });
        restante -= dose;
      }
      semana += passo;
    }
    return novas;
  }

  function distribuirItem(c: PlanPurchase) {
    mudar((cs) => [...cs.filter((x) => x.purchase_id !== c.id || x.realizada), ...dosesDoItem(c, cs)]);
  }

  function distribuirTodos() {
    setExtras([]);
    mudar((cs) => [...cs.filter((x) => x.realizada), ...dados.compras.flatMap((c) => dosesDoItem(c, cs))]);
  }

  function soltar(e: DragEvent, semana: number, sub: number) {
    e.preventDefault();
    const key = e.dataTransfer.getData("text/plain");
    if (travadas.has(chaveSemana(semana, sub))) return;
    mudar((cs) => cs.map((c) => (c.key === key && !c.realizada ? { ...c, semana, sub_semana: sub } : c)));
  }

  function adicionarSemana() {
    const ultima = linhas.at(-1)?.semana ?? 0;
    setExtras((x) => [...x, chaveSemana(ultima + 1, 1)]);
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const doses = chips
        .filter((c) => !c.realizada)
        .map((c) => ({ purchase_id: c.purchase_id, semana: c.semana, sub_semana: c.sub_semana, dose: num(c.dose) }));
      if (doses.some((d) => d.dose <= 0)) throw new Error("Há dose vazia ou zerada.");
      check(await supabase.rpc("salvar_prescricao", { p_plan_id: plano.id, p_doses: doses }));
    },
    onSuccess: () => {
      toast.success("Prescrição salva.");
      setSujo(false);
      recarregar();
    },
    onError: (e) => toast.error(e.message),
  });

  if (dados.compras.length === 0) {
    return <Vazio>Adicione o que o paciente comprou antes de montar a prescrição.</Vazio>;
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Saldo do que foi comprado e frequência de cada item</p>
        {pool.map(({ compra: c, prescrito, excede }) => {
          const cfg = configDe(c.id);
          const setCfg = (m: Partial<Config>) => setConfig((x) => ({ ...x, [c.id]: { ...cfg, ...m } }));
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm first:border-t-0 first:pt-0">
              <span className="min-w-48 font-medium">{nomeCompra(c)}</span>
              <span className={excede ? "font-medium text-destructive" : "text-muted-foreground"}>
                {qtd(prescrito)} / {qtd(c.contratado, c.unidade_dose)} (restam {qtd(Math.max(0, c.contratado - prescrito))})
              </span>
              {excede && <Etiqueta tom="perigo">Excede</Etiqueta>}
              {pode && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Seletor
                    className="h-8 w-auto"
                    value={cfg.frequencia}
                    onChange={(e) => setCfg({ frequencia: e.target.value as Frequencia })}
                  >
                    {FREQUENCIAS.map((f) => (
                      <option key={f.valor} value={f.valor}>
                        {f.rotulo}
                      </option>
                    ))}
                  </Seletor>
                  {cfg.frequencia === "n" && (
                    <Input
                      className="h-8 w-16"
                      inputMode="numeric"
                      value={cfg.cadaN}
                      onChange={(e) => setCfg({ cadaN: e.target.value })}
                      aria-label="A cada quantas semanas"
                    />
                  )}
                  <span className="text-xs text-muted-foreground">a partir da semana</span>
                  <Input
                    className="h-8 w-14"
                    inputMode="numeric"
                    value={cfg.inicio}
                    onChange={(e) => setCfg({ inicio: e.target.value })}
                    aria-label="Semana de início"
                  />
                  <Button size="sm" variant="outline" onClick={() => distribuirItem(c)}>
                    <Wand2 /> Distribuir
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pode && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={distribuirTodos}>
            <Wand2 /> Distribuir todos os itens
          </Button>
          <Button variant="outline" onClick={adicionarSemana}>
            <Plus /> Semana
          </Button>
          <div className="flex-1" />
          {sujo && <span className="text-sm text-amber-600">Alterações não salvas</span>}
          <Button onClick={() => salvar.mutate()} disabled={!sujo || algumExcede || salvar.isPending}>
            Salvar prescrição
          </Button>
        </div>
      )}

      <div className="grid gap-2">
        {linhas.map(({ semana, sub, chave }) => {
          const travada = travadas.has(chave);
          const daSemana = chips.filter((c) => c.semana === semana && c.sub_semana === sub);
          const ini = inicioDaSemana(plano.inicio, semana);
          return (
            <div
              key={chave}
              onDragOver={(e) => !travada && e.preventDefault()}
              onDrop={(e) => soltar(e, semana, sub)}
              className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${travada ? "bg-muted/60" : "bg-card"}`}
            >
              <div className="w-36 shrink-0">
                <p className="text-sm font-medium">{rotuloSemana(semana, sub)}</p>
                <p className="text-xs text-muted-foreground">
                  {dataCurta(ini)} a {dataCurta(new Date(ini.getTime() + 6 * 86400000))}
                </p>
              </div>
              {travada && (
                <Etiqueta tom={puladas.has(chave) ? "alerta" : "ok"}>
                  <Lock className="mr-1 size-3" />
                  {puladas.has(chave) ? "pulada" : "realizada"}
                </Etiqueta>
              )}
              {daSemana.map((c) => {
                const cp = compra(c.purchase_id);
                return (
                  <div
                    key={c.key}
                    draggable={pode && !c.realizada}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", c.key)}
                    className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
                      c.realizada ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950" : "cursor-grab bg-background"
                    }`}
                  >
                    <span>{cp ? nomeCompra(cp) : "…"}</span>
                    {pode && !c.realizada ? (
                      <Input
                        className="h-6 w-16 px-1 text-right text-xs"
                        inputMode="decimal"
                        value={c.dose}
                        onChange={(e) =>
                          mudar((cs) => cs.map((x) => (x.key === c.key ? { ...x, dose: e.target.value } : x)))
                        }
                      />
                    ) : (
                      <span className="font-medium">{qtd(c.dose)}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{cp ? UNIDADE_LABEL[cp.unidade_dose] : ""}</span>
                    {pode && !c.realizada && (
                      <button
                        type="button"
                        className="ml-1 text-muted-foreground hover:text-destructive"
                        onClick={() => mudar((cs) => cs.filter((x) => x.key !== c.key))}
                        aria-label="Remover dose"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
              {pode && !travada && (
                <AdicionarDose
                  compras={dados.compras}
                  nome={nomeCompra}
                  onAdd={(c) =>
                    mudar((cs) => [
                      ...cs,
                      {
                        key: novaChave(),
                        purchase_id: c.id,
                        semana,
                        sub_semana: sub,
                        dose: String(c.dose_padrao),
                        realizada: false,
                      },
                    ])
                  }
                  onSegunda={
                    sub === 1 && !linhas.some((l) => l.semana === semana && l.sub === 2)
                      ? () => setExtras((x) => [...x, chaveSemana(semana, 2)])
                      : undefined
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      {pode && (
        <p className="text-xs text-muted-foreground">
          Arraste as doses entre semanas. Doses iguais na mesma semana ficam separadas (uma seringa, um registro).
          Semanas realizadas ou puladas ficam travadas.
        </p>
      )}
    </div>
  );
}

function AdicionarDose({
  compras,
  nome,
  onAdd,
  onSegunda,
}: {
  compras: PlanPurchase[];
  nome: (c: PlanPurchase) => string;
  onAdd: (c: PlanPurchase) => void;
  onSegunda: (() => void) | undefined;
}) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <select
        className="h-7 rounded-md border bg-background px-2 text-xs text-muted-foreground"
        value=""
        onChange={(e) => {
          const c = compras.find((x) => x.id === e.target.value);
          if (c) onAdd(c);
        }}
      >
        <option value="">+ dose</option>
        {compras.map((c) => (
          <option key={c.id} value={c.id}>
            {nome(c)}
          </option>
        ))}
      </select>
      {onSegunda && (
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onSegunda}>
          + 2ª na semana
        </Button>
      )}
    </div>
  );
}
