import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export const UNIDADE_LABEL: Record<string, string> = {
  ui: "UI",
  ml: "mL",
  ampola: "ampola",
  protocolo: "protocolo",
  aplicacao: "aplic.",
};

export function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function qtd(v: number | string | null | undefined, unidade?: string): string {
  const n = num(v);
  const s = n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return unidade ? `${s} ${UNIDADE_LABEL[unidade] ?? unidade}` : s;
}

export function brl(v: number | string | null | undefined): string {
  return num(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function data(iso: string | null | undefined): string {
  if (!iso) return "—";
  return format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });
}

export function dataCurta(d: Date): string {
  return format(d, "dd/MM", { locale: ptBR });
}

export function hojeISO(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Semana 1 começa no início do plano; cada semana seguinte soma 7 dias. */
export function inicioDaSemana(inicioPlano: string, semana: number): Date {
  return addDays(parseISO(inicioPlano), (semana - 1) * 7);
}

export function diasAte(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return differenceInCalendarDays(parseISO(iso), new Date());
}

export function rotuloSemana(semana: number, sub: number): string {
  return sub > 1 ? `Semana ${semana}·${sub}` : `Semana ${semana}`;
}

export function idade(nascimento: string | null | undefined): number | null {
  if (!nascimento) return null;
  const n = parseISO(nascimento);
  const hoje = new Date();
  let anos = hoje.getFullYear() - n.getFullYear();
  if (hoje.getMonth() < n.getMonth() || (hoje.getMonth() === n.getMonth() && hoje.getDate() < n.getDate())) anos--;
  return anos;
}
