import { useQuery, useQueryClient } from "@tanstack/react-query";

import { check, supabase } from "@/lib/supabase";
import type { OrcamentoTotal, Patient, Quote, QuoteDiscount, QuoteItem, QuoteStatus } from "@/lib/types";

export const STATUS_ORCAMENTO: Record<QuoteStatus, { label: string; tom: "neutro" | "ok" | "alerta" | "perigo" | "info" }> = {
  rascunho: { label: "Rascunho", tom: "neutro" },
  enviado: { label: "Enviado", tom: "info" },
  aprovado: { label: "Aprovado", tom: "ok" },
  perdido: { label: "Perdido", tom: "alerta" },
  cancelado: { label: "Cancelado", tom: "perigo" },
};

export type DadosOrcamento = {
  quote: Quote;
  paciente: Patient;
  itens: QuoteItem[];
  descontos: QuoteDiscount[];
  total: OrcamentoTotal;
};

export function useOrcamento(id: string) {
  return useQuery({
    queryKey: ["orcamento", id],
    queryFn: async (): Promise<DadosOrcamento> => {
      const quote = check(await supabase.from("quotes").select("*").eq("id", id).single()) as Quote;
      const [paciente, itens, descontos, total] = await Promise.all([
        supabase.from("patients").select("*").eq("id", quote.patient_id).single(),
        supabase.from("quote_items").select("*").eq("quote_id", id).order("ordem").order("created_at"),
        supabase.from("v_orcamento_desconto").select("*").eq("quote_id", id).order("created_at"),
        supabase.from("v_orcamento").select("*").eq("quote_id", id).single(),
      ]);
      return {
        quote,
        paciente: check(paciente) as Patient,
        itens: check(itens) as QuoteItem[],
        descontos: check(descontos) as QuoteDiscount[],
        total: check(total) as OrcamentoTotal,
      };
    },
  });
}

export function useOrcamentosDoPaciente(patientId: string) {
  return useQuery({
    queryKey: ["orcamentos", "paciente", patientId],
    queryFn: async () =>
      check(
        await supabase
          .from("v_orcamento")
          .select("*")
          .eq("patient_id", patientId)
          .order("numero", { ascending: false }),
      ) as OrcamentoTotal[],
  });
}

export function useRecarregarOrcamento() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["orcamento"] });
    void qc.invalidateQueries({ queryKey: ["orcamentos"] });
  };
}

/** Texto da quantidade como o paciente entende: "4 aplicações de 24 UI" ou "100 UI". */
export function descreverQuantidade(i: Pick<QuoteItem, "vendido_por" | "quantidade" | "unidade_dose" | "dose_padrao">) {
  const n = Number(i.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (i.vendido_por === "unidade") return `${n} ${i.unidade_dose === "ml" ? "mL" : "UI"}`;
  const aplic = Number(i.quantidade) === 1 ? "aplicação" : "aplicações";
  if (i.unidade_dose === "aplicacao") return `${n} ${aplic}`;
  const dose = Number(i.dose_padrao).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return `${n} ${aplic} de ${dose} ${i.unidade_dose === "ml" ? "mL" : "UI"}`;
}
