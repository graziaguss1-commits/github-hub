import { useQuery } from "@tanstack/react-query";

import { check, supabase } from "./supabase";
import type {
  EstoqueProduto,
  Procedure,
  ProcedureItem,
  Product,
  Profile,
  StockLot,
} from "./types";

export function useProdutos() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => check(await supabase.from("products").select("*").order("nome")) as Product[],
  });
}

export function useProcedimentos() {
  return useQuery({
    queryKey: ["procedures"],
    queryFn: async () =>
      check(await supabase.from("procedures").select("*").order("nome")) as Procedure[],
  });
}

export function useComposicao() {
  return useQuery({
    queryKey: ["procedure_items"],
    queryFn: async () =>
      check(await supabase.from("procedure_items").select("*")) as ProcedureItem[],
  });
}

/** Lotes com saldo, do que vence primeiro para o último (FEFO). */
export function useLotesComSaldo() {
  return useQuery({
    queryKey: ["stock_lots", "com_saldo"],
    queryFn: async () =>
      check(
        await supabase
          .from("stock_lots")
          .select("*")
          .gt("quantidade_atual", 0)
          .order("validade", { ascending: true, nullsFirst: false })
          .order("created_at"),
      ) as StockLot[],
  });
}

export function useEstoque() {
  return useQuery({
    queryKey: ["v_estoque_produto"],
    queryFn: async () =>
      check(await supabase.from("v_estoque_produto").select("*").order("nome")) as EstoqueProduto[],
  });
}

export function usePerfis() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => check(await supabase.from("profiles").select("*").order("nome")) as Profile[],
  });
}

/** Chaves que mudam quando o estoque ou uma aplicação mudam. */
export const CHAVES_ESTOQUE = [["stock_lots"], ["v_estoque_produto"], ["stock_movements"]] as const;
