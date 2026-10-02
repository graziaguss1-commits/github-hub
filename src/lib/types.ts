export type Papel = "admin" | "medico" | "enfermagem";
export type UnidadeProduto = "ui" | "ml" | "ampola" | "protocolo";
export type UnidadeDose = "ui" | "ml" | "aplicacao";

export type Profile = {
  id: string;
  nome: string;
  email: string | null;
  papel: Papel;
  ativo: boolean;
  registro_profissional: string | null;
  especialidade: string | null;
};

export type Product = {
  id: string;
  nome: string;
  grupo: string | null;
  unidade: UnidadeProduto;
  controla_lote: boolean;
  estoque_minimo: number;
  custo_padrao: number;
  ativo: boolean;
};

export type Procedure = {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  forma_venda: "aplicacao" | "unidade";
  preco_base: number;
  custo_base: number;
  ativo: boolean;
};

export type ProcedureItem = {
  id: string;
  procedure_id: string;
  product_id: string;
  quantidade_padrao: number;
};

export type StockLot = {
  id: string;
  product_id: string;
  lote: string;
  validade: string | null;
  custo_unitario: number;
  quantidade_inicial: number;
  quantidade_atual: number;
  fornecedor: string | null;
  nota_compra: string | null;
  status: "ativo" | "vencido" | "esgotado";
};

export type Patient = {
  id: string;
  nome: string;
  telefone: string | null;
  observacoes: string | null;
  created_at: string;
};

export type Plan = {
  id: string;
  patient_id: string;
  medico_id: string | null;
  inicio: string;
  status: "ativo" | "pausado" | "encerrado";
  observacoes: string | null;
  created_at: string;
};

export type PlanPurchase = {
  id: string;
  plan_id: string;
  procedure_id: string;
  vendido_por: "aplicacao" | "unidade";
  quantidade: number;
  unidade_dose: UnidadeDose;
  dose_padrao: number;
  contratado: number;
  observacao: string | null;
};

export type PlanDose = {
  id: string;
  plan_id: string;
  purchase_id: string;
  semana: number;
  sub_semana: number;
  dose: number;
  status: "prevista" | "realizada";
  observacao: string | null;
  created_at: string;
};

export type Application = {
  id: string;
  plan_id: string;
  semana: number;
  sub_semana: number;
  data_aplicacao: string;
  status: "concluida" | "pulada" | "cancelada";
  enfermeiro_id: string | null;
  observacoes: string | null;
  cancelamento_motivo: string | null;
  created_at: string;
};

export type ApplicationItem = {
  id: string;
  application_id: string;
  plan_dose_id: string | null;
  purchase_id: string;
  procedure_id: string;
  dose_prevista: number;
  dose_real: number;
  unidade: UnidadeDose;
};

export type ApplicationConsumption = {
  id: string;
  application_item_id: string;
  lot_id: string;
  product_id: string;
  quantidade: number;
  custo_unitario_snapshot: number;
};

export type SaldoCompra = {
  purchase_id: string;
  plan_id: string;
  procedure_id: string;
  procedimento: string;
  codigo: string;
  vendido_por: "aplicacao" | "unidade";
  quantidade: number;
  unidade_dose: UnidadeDose;
  dose_padrao: number;
  contratado: number;
  prescrito: number;
  aplicado: number;
};

export type ProgressoPlano = {
  plan_id: string;
  patient_id: string;
  status: Plan["status"];
  semanas_previstas: number;
  semanas_realizadas: number;
  semanas_puladas: number;
  proxima_semana: number | null;
};

export type EstoqueProduto = {
  product_id: string;
  nome: string;
  grupo: string | null;
  unidade: UnidadeProduto;
  estoque_minimo: number;
  saldo: number;
  proxima_validade: string | null;
  abaixo_minimo: boolean;
};

export type QuoteStatus = "rascunho" | "enviado" | "aprovado" | "perdido" | "cancelado";

export type Quote = {
  id: string;
  numero: number;
  patient_id: string;
  medico_id: string | null;
  status: QuoteStatus;
  observacoes: string | null;
  plan_id: string | null;
  aprovado_em: string | null;
  created_at: string;
  mes_tratamento: string | null;
  frequencia_aplicacoes: string | null;
  condicao_pagamento: string | null;
  acrescimo_tipo: "reais" | "percentual";
  acrescimo_valor: number;
};

export type QuoteItem = {
  id: string;
  quote_id: string;
  procedure_id: string;
  descricao: string;
  vendido_por: "aplicacao" | "unidade";
  quantidade: number;
  unidade_dose: UnidadeDose;
  dose_padrao: number;
  preco_unitario: number;
  subtotal: number;
  created_at: string;
  observacao: string | null;
  ordem: number;
  cortesia: boolean;
};

export type QuoteDiscount = {
  id: string;
  quote_id: string;
  motivo: string;
  tipo: "reais" | "percentual";
  valor: number;
  valor_reais: number;
};

export type OrcamentoTotal = {
  quote_id: string;
  numero: number;
  patient_id: string;
  medico_id: string | null;
  status: QuoteStatus;
  created_at: string;
  plan_id: string | null;
  subtotal: number;
  desconto: number;
  acrescimo: number;
  total: number;
  falta_prescrever: boolean;
};
