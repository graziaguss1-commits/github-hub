-- Orçamento no modelo do NutroClinic: observação e ordem por item, cortesia após aprovação,
-- acréscimo, mês/frequência/condição de pagamento, duplicar e indicador "falta prescrever".

alter table public.quotes
  add column mes_tratamento text,
  add column frequencia_aplicacoes text,
  add column condicao_pagamento text,
  add column acrescimo_tipo text not null default 'reais' check (acrescimo_tipo in ('reais', 'percentual')),
  add column acrescimo_valor numeric not null default 0 check (acrescimo_valor >= 0);

alter table public.quote_items
  add column observacao text,
  add column ordem int not null default 0,
  add column cortesia boolean not null default false;

alter table public.plan_purchases
  add column observacao text;

-- Totais: subtotal − descontos (limitado ao subtotal) + acréscimo (R$ ou % do subtotal).
drop view if exists public.v_orcamento;
create view public.v_orcamento with (security_invoker = true) as
with itens as (
  select quote_id, coalesce(sum(subtotal), 0) as subtotal from public.quote_items group by quote_id
),
descontos as (
  select d.quote_id,
         sum(case when d.tipo = 'reais' then d.valor
                  else round(coalesce(i.subtotal, 0) * d.valor / 100, 2) end) as desconto
    from public.quote_discounts d
    left join itens i on i.quote_id = d.quote_id
   group by d.quote_id
),
base as (
  select q.*,
         coalesce(i.subtotal, 0) as subtotal_calc,
         least(coalesce(d.desconto, 0), coalesce(i.subtotal, 0)) as desconto_calc
    from public.quotes q
    left join itens i on i.quote_id = q.id
    left join descontos d on d.quote_id = q.id
)
select
  b.id as quote_id,
  b.numero,
  b.patient_id,
  b.medico_id,
  b.status,
  b.created_at,
  b.plan_id,
  b.subtotal_calc as subtotal,
  b.desconto_calc as desconto,
  case when b.acrescimo_tipo = 'reais' then b.acrescimo_valor
       else round(b.subtotal_calc * b.acrescimo_valor / 100, 2) end as acrescimo,
  b.subtotal_calc - b.desconto_calc
    + case when b.acrescimo_tipo = 'reais' then b.acrescimo_valor
           else round(b.subtotal_calc * b.acrescimo_valor / 100, 2) end as total,
  (b.status = 'aprovado' and b.plan_id is not null
     and not exists (select 1 from public.plan_doses d where d.plan_id = b.plan_id)) as falta_prescrever
from base b;

-- Aprovar: agora leva a observação de cada item para o plano, na ordem do orçamento.
create or replace function public.aprovar_orcamento(p_quote_id uuid, p_inicio date, p_medico_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_plan uuid;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Orçamento não encontrado.'; end if;
  if v_quote.status not in ('rascunho', 'enviado') then
    raise exception 'Só orçamentos em rascunho ou enviados podem ser aprovados.';
  end if;
  if not exists (select 1 from public.quote_items where quote_id = p_quote_id) then
    raise exception 'O orçamento não tem itens.';
  end if;
  if p_inicio is null then raise exception 'Informe a data de início do tratamento.'; end if;

  insert into public.plans (patient_id, medico_id, inicio, created_by, observacoes)
  values (v_quote.patient_id, coalesce(p_medico_id, v_quote.medico_id), p_inicio, auth.uid(),
          'Gerado do orçamento nº ' || v_quote.numero)
  returning id into v_plan;

  insert into public.plan_purchases (plan_id, procedure_id, vendido_por, quantidade, unidade_dose, dose_padrao, observacao)
  select v_plan, procedure_id, vendido_por, quantidade, unidade_dose, dose_padrao, observacao
    from public.quote_items
   where quote_id = p_quote_id
   order by ordem, created_at;

  update public.quotes
     set status = 'aprovado', plan_id = v_plan, aprovado_em = now(), aprovado_por = auth.uid(),
         medico_id = coalesce(p_medico_id, medico_id)
   where id = p_quote_id;

  perform public.auditar('aprovar_orcamento', 'quotes', p_quote_id, null,
    jsonb_build_object('numero', v_quote.numero, 'plan_id', v_plan));
  return v_plan;
end;
$$;

-- Cortesia: item sem cobrança incluído depois de aprovado; entra no plano e na prescrição.
create or replace function public.adicionar_cortesia(
  p_quote_id uuid, p_procedure_id uuid, p_descricao text, p_quantidade numeric,
  p_unidade_dose text, p_dose_padrao numeric, p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_proc public.procedures;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found or v_quote.status <> 'aprovado' or v_quote.plan_id is null then
    raise exception 'Cortesia só em orçamento aprovado.';
  end if;
  select * into v_proc from public.procedures where id = p_procedure_id;
  if not found then raise exception 'Procedimento não encontrado.'; end if;

  insert into public.quote_items (
    quote_id, procedure_id, descricao, vendido_por, quantidade, unidade_dose, dose_padrao,
    preco_unitario, observacao, cortesia, ordem
  ) values (
    p_quote_id, p_procedure_id, coalesce(nullif(trim(p_descricao), ''), v_proc.nome), v_proc.forma_venda,
    p_quantidade, p_unidade_dose, case when p_unidade_dose = 'aplicacao' then 1 else p_dose_padrao end,
    0, p_observacao, true,
    coalesce((select max(ordem) + 1 from public.quote_items where quote_id = p_quote_id), 0)
  );

  insert into public.plan_purchases (plan_id, procedure_id, vendido_por, quantidade, unidade_dose, dose_padrao, observacao)
  values (v_quote.plan_id, p_procedure_id, v_proc.forma_venda, p_quantidade, p_unidade_dose,
          case when p_unidade_dose = 'aplicacao' then 1 else p_dose_padrao end,
          coalesce(nullif(trim(p_observacao), ''), 'Cortesia'));

  perform public.auditar('adicionar_cortesia', 'quotes', p_quote_id, null,
    jsonb_build_object('procedure_id', p_procedure_id, 'quantidade', p_quantidade));
end;
$$;

-- Duplicar: novo rascunho com os mesmos itens (sem cortesias), descontos e condições.
create or replace function public.duplicar_orcamento(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo uuid;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);

  insert into public.quotes (
    patient_id, medico_id, status, observacoes, mes_tratamento, frequencia_aplicacoes,
    condicao_pagamento, acrescimo_tipo, acrescimo_valor, created_by
  )
  select patient_id, medico_id, 'rascunho', observacoes, mes_tratamento, frequencia_aplicacoes,
         condicao_pagamento, acrescimo_tipo, acrescimo_valor, auth.uid()
    from public.quotes where id = p_quote_id
  returning id into v_novo;
  if v_novo is null then raise exception 'Orçamento não encontrado.'; end if;

  insert into public.quote_items (
    quote_id, procedure_id, descricao, vendido_por, quantidade, unidade_dose, dose_padrao,
    preco_unitario, observacao, ordem
  )
  select v_novo, procedure_id, descricao, vendido_por, quantidade, unidade_dose, dose_padrao,
         preco_unitario, observacao, ordem
    from public.quote_items where quote_id = p_quote_id and not cortesia;

  insert into public.quote_discounts (quote_id, motivo, tipo, valor)
  select v_novo, motivo, tipo, valor from public.quote_discounts where quote_id = p_quote_id;

  return v_novo;
end;
$$;

revoke execute on function public.adicionar_cortesia(uuid, uuid, text, numeric, text, numeric, text) from public, anon;
revoke execute on function public.duplicar_orcamento(uuid) from public, anon;
revoke execute on function public.aprovar_orcamento(uuid, date, uuid) from public, anon;
grant execute on function public.adicionar_cortesia(uuid, uuid, text, numeric, text, numeric, text) to authenticated;
grant execute on function public.duplicar_orcamento(uuid) to authenticated;
grant execute on function public.aprovar_orcamento(uuid, date, uuid) to authenticated;
