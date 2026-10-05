import { useQuery, useQueryClient } from "@tanstack/react-query";

import { check, supabase } from "@/lib/supabase";
import { CHAVES_ESTOQUE } from "@/lib/queries";
import type {
  Application,
  ApplicationConsumption,
  ApplicationItem,
  Plan,
  PlanDose,
  PlanPurchase,
  SaldoCompra,
  UnidadeDose,
  UnidadeProduto,
} from "@/lib/types";

export function usePlanos(patientId: string) {
  return useQuery({
    queryKey: ["plans", patientId],
    queryFn: async () =>
      check(
        await supabase
          .from("plans")
          .select("*")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false }),
      ) as Plan[],
  });
}

export type DadosPlano = {
  compras: PlanPurchase[];
  doses: PlanDose[];
  aplicacoes: Application[];
  itens: ApplicationItem[];
  consumos: ApplicationConsumption[];
  saldo: SaldoCompra[];
};

export function useDadosPlano(planId: string | null) {
  return useQuery({
    queryKey: ["plano", planId],
    enabled: Boolean(planId),
    queryFn: async (): Promise<DadosPlano> => {
      const id = planId as string;
      const [compras, doses, aplicacoes, saldo] = await Promise.all([
        supabase.from("plan_purchases").select("*").eq("plan_id", id).order("created_at"),
        supabase.from("plan_doses").select("*").eq("plan_id", id).order("semana").order("sub_semana"),
        supabase.from("applications").select("*").eq("plan_id", id).order("semana"),
        supabase.from("v_saldo_compra").select("*").eq("plan_id", id),
      ]);
      const apps = check(aplicacoes) as Application[];
      const idsApps = apps.map((a) => a.id);
      const itens = idsApps.length
        ? (check(await supabase.from("application_items").select("*").in("application_id", idsApps)) as ApplicationItem[])
        : [];
      const idsItens = itens.map((i) => i.id);
      const consumos = idsItens.length
        ? (check(
            await supabase.from("application_consumptions").select("*").in("application_item_id", idsItens),
          ) as ApplicationConsumption[])
        : [];
      return {
        compras: check(compras) as PlanPurchase[],
        doses: check(doses) as PlanDose[],
        aplicacoes: apps,
        itens,
        consumos,
        saldo: check(saldo) as SaldoCompra[],
      };
    },
  });
}

/** Depois de qualquer gravação no plano, recarrega plano, progresso e estoque. */
export function useRecarregarPlano() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["plano"] });
    void qc.invalidateQueries({ queryKey: ["plans"] });
    void qc.invalidateQueries({ queryKey: ["v_progresso_plano"] });
    for (const k of CHAVES_ESTOQUE) void qc.invalidateQueries({ queryKey: [...k] });
  };
}

/** Mesma regra do banco (consumo_produto): mesma unidade → consome a dose; senão → quantidade padrão. */
export function consumoProduto(
  unidadeProduto: UnidadeProduto,
  unidadeDose: UnidadeDose,
  dose: number,
  quantidadePadrao: number,
): number {
  return (unidadeDose === "ui" || unidadeDose === "ml") && unidadeProduto === unidadeDose ? dose : quantidadePadrao;
}

export function chaveSemana(semana: number, sub: number) {
  return `${semana}-${sub}`;
}

/** Cor de cada medicação na prescrição (paleta de gráficos da identidade visual). */
const PALETA = ["#233E6E", "#2268C3", "#CF7317", "#8F4DA6", "#379A69", "#3D8CDB"];
export function corDoItem(compras: { id: string }[], purchaseId: string): string {
  const i = compras.findIndex((c) => c.id === purchaseId);
  return PALETA[(i < 0 ? 0 : i) % PALETA.length] ?? "#233E6E";
}
