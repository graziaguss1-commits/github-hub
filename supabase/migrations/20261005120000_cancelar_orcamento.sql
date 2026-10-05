-- Cancelar orçamento (inclusive aprovado) e marcar como perdido, sempre com motivo e registro.
alter table public.quotes
  add column motivo_status text,
  add column status_alterado_em timestamptz,
  add column status_alterado_por uuid references public.profiles (id);

-- Aprovado: exige senha de edição; encerra o plano e retira só as doses ainda não aplicadas.
-- Aplicações feitas e baixas de estoque continuam no histórico.
create or replace function public.cancelar_orcamento(p_quote_id uuid, p_motivo text, p_senha text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_removidas int := 0;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Orçamento não encontrado.'; end if;
  if v_quote.status = 'cancelado' then raise exception 'Este orçamento já está cancelado.'; end if;

  if v_quote.status = 'aprovado' then
    perform public._conferir_senha(p_senha);
    if v_quote.plan_id is not null then
      delete from public.plan_doses where plan_id = v_quote.plan_id and status = 'prevista';
      get diagnostics v_removidas = row_count;
      update public.plans set status = 'encerrado' where id = v_quote.plan_id;
    end if;
  end if;

  update public.quotes
     set status = 'cancelado', motivo_status = trim(p_motivo),
         status_alterado_em = now(), status_alterado_por = auth.uid()
   where id = p_quote_id;

  perform public.auditar('cancelar_orcamento', 'quotes', p_quote_id, trim(p_motivo),
    jsonb_build_object('numero', v_quote.numero, 'status_anterior', v_quote.status, 'doses_removidas', v_removidas));
end;
$$;

create or replace function public.marcar_orcamento_perdido(p_quote_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da perda.'; end if;
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Orçamento não encontrado.'; end if;
  if v_quote.status not in ('rascunho', 'enviado') then
    raise exception 'Só orçamentos em aberto podem ser marcados como perdidos.';
  end if;
  update public.quotes
     set status = 'perdido', motivo_status = trim(p_motivo),
         status_alterado_em = now(), status_alterado_por = auth.uid()
   where id = p_quote_id;
  perform public.auditar('orcamento_perdido', 'quotes', p_quote_id, trim(p_motivo), null);
end;
$$;

revoke execute on function public.cancelar_orcamento(uuid, text, text) from public, anon;
revoke execute on function public.marcar_orcamento_perdido(uuid, text) from public, anon;
grant execute on function public.cancelar_orcamento(uuid, text, text) to authenticated;
grant execute on function public.marcar_orcamento_perdido(uuid, text) to authenticated;

-- Trocar medicação de um orçamento aprovado: o que já foi aplicado fica; o saldo não usado sai
-- do plano (com as doses previstas) e a medicação nova entra no lugar. O total do orçamento não muda.
create or replace function public.trocar_medicacao(
  p_quote_id uuid, p_purchase_id uuid, p_novo_procedure_id uuid,
  p_quantidade numeric, p_unidade_dose text, p_dose_padrao numeric, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes;
  v_compra public.plan_purchases;
  v_proc public.procedures;
  v_nome_antigo text;
  v_aplicado numeric;
  v_dose numeric;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo da troca.'; end if;
  if p_quantidade is null or p_quantidade <= 0 then raise exception 'Informe a quantidade da medicação nova.'; end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found or v_quote.status <> 'aprovado' or v_quote.plan_id is null then
    raise exception 'Troca só em orçamento aprovado.';
  end if;
  select * into v_compra from public.plan_purchases where id = p_purchase_id and plan_id = v_quote.plan_id for update;
  if not found then raise exception 'Item não pertence a este orçamento.'; end if;
  select * into v_proc from public.procedures where id = p_novo_procedure_id;
  if not found then raise exception 'Medicação nova não encontrada.'; end if;
  select nome into v_nome_antigo from public.procedures where id = v_compra.procedure_id;

  select coalesce(sum(i.dose_real), 0) into v_aplicado
    from public.application_items i join public.applications a on a.id = i.application_id
   where i.purchase_id = v_compra.id and a.status = 'concluida';
  -- o que já está marcado como realizado na prescrição também precisa caber no item reduzido
  v_aplicado := greatest(v_aplicado, coalesce((
    select sum(dose) from public.plan_doses where purchase_id = v_compra.id and status = 'realizada'), 0));

  delete from public.plan_doses where purchase_id = v_compra.id and status = 'prevista';

  if v_aplicado = 0 then
    if exists (select 1 from public.plan_doses where purchase_id = v_compra.id) then
      raise exception 'Item com doses registradas não pode ser trocado por inteiro.';
    end if;
    delete from public.plan_purchases where id = v_compra.id;
  else
    -- reduz o item antigo ao que já foi aplicado
    update public.plan_purchases
       set quantidade = case when vendido_por = 'aplicacao' then v_aplicado / dose_padrao else v_aplicado end,
           observacao = trim(coalesce(observacao || ' · ', '') || 'Trocado por ' || v_proc.nome)
     where id = v_compra.id;
  end if;

  v_dose := case when p_unidade_dose = 'aplicacao' then 1 else p_dose_padrao end;

  insert into public.plan_purchases (plan_id, procedure_id, vendido_por, quantidade, unidade_dose, dose_padrao, observacao)
  values (v_quote.plan_id, v_proc.id, v_proc.forma_venda, p_quantidade, p_unidade_dose, v_dose,
          'Troca de ' || v_nome_antigo || ': ' || trim(p_motivo));

  insert into public.quote_items (
    quote_id, procedure_id, descricao, vendido_por, quantidade, unidade_dose, dose_padrao,
    preco_unitario, observacao, cortesia, ordem
  ) values (
    p_quote_id, v_proc.id, v_proc.nome || ' (troca de ' || v_nome_antigo || ')', v_proc.forma_venda,
    p_quantidade, p_unidade_dose, v_dose, 0, trim(p_motivo), true,
    coalesce((select max(ordem) + 1 from public.quote_items where quote_id = p_quote_id), 0)
  );

  perform public.auditar('trocar_medicacao', 'quotes', p_quote_id, trim(p_motivo),
    jsonb_build_object('de', v_nome_antigo, 'para', v_proc.nome, 'aplicado_antes', v_aplicado, 'quantidade_nova', p_quantidade));
end;
$$;

revoke execute on function public.trocar_medicacao(uuid, uuid, uuid, numeric, text, numeric, text) from public, anon;
grant execute on function public.trocar_medicacao(uuid, uuid, uuid, numeric, text, numeric, text) to authenticated;
