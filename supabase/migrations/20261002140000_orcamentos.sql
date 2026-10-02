-- Orçamentos: itens com preço, descontos com motivo, impressão.
-- Aprovar o orçamento cria o plano de tratamento com os itens comprados (numa única transação).

-- Dados da clínica para o cabeçalho do orçamento impresso (preenchidos pelo admin).
alter table public.app_settings
  add column clinica_nome text,
  add column clinica_rodape text;

create or replace function public.dados_clinica()
returns table (clinica_nome text, clinica_rodape text)
language sql
stable
security definer
set search_path = public
as $$
  select clinica_nome, clinica_rodape from public.app_settings where id = 1
$$;

create or replace function public.definir_dados_clinica(p_nome text, p_rodape text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_papel(array['admin']);
  update public.app_settings
     set clinica_nome = nullif(trim(p_nome), ''), clinica_rodape = nullif(trim(p_rodape), ''),
         updated_at = now(), updated_by = auth.uid()
   where id = 1;
end;
$$;

create sequence public.quotes_numero_seq;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique default nextval('public.quotes_numero_seq'),
  patient_id uuid not null references public.patients (id) on delete cascade,
  medico_id uuid references public.profiles (id),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviado', 'aprovado', 'perdido', 'cancelado')),
  observacoes text,
  plan_id uuid references public.plans (id) on delete set null,
  aprovado_em timestamptz,
  aprovado_por uuid references public.profiles (id),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index quotes_paciente on public.quotes (patient_id);

-- vendido_por = aplicacao → quantidade = nº de aplicações; preço por aplicação
-- vendido_por = unidade   → quantidade = UI/mL; preço por UI/mL
create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  procedure_id uuid not null references public.procedures (id),
  descricao text not null,
  vendido_por text not null check (vendido_por in ('aplicacao', 'unidade')),
  quantidade numeric not null check (quantidade > 0),
  unidade_dose text not null check (unidade_dose in ('ui', 'ml', 'aplicacao')),
  dose_padrao numeric not null check (dose_padrao > 0),
  preco_unitario numeric not null default 0 check (preco_unitario >= 0),
  subtotal numeric generated always as (round(quantidade * preco_unitario, 2)) stored,
  created_at timestamptz not null default now(),
  check (vendido_por = 'aplicacao' or unidade_dose <> 'aplicacao')
);

create table public.quote_discounts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  motivo text not null check (length(trim(motivo)) > 0),
  tipo text not null check (tipo in ('reais', 'percentual')),
  valor numeric not null check (valor > 0),
  created_at timestamptz not null default now(),
  check (tipo = 'reais' or valor <= 100)
);

-- Totais calculados no banco: percentuais incidem sobre o subtotal dos itens.
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
)
select
  q.id as quote_id,
  q.numero,
  q.patient_id,
  q.status,
  q.created_at,
  coalesce(i.subtotal, 0) as subtotal,
  least(coalesce(d.desconto, 0), coalesce(i.subtotal, 0)) as desconto,
  greatest(coalesce(i.subtotal, 0) - coalesce(d.desconto, 0), 0) as total
from public.quotes q
left join itens i on i.quote_id = q.id
left join descontos d on d.quote_id = q.id;

create view public.v_orcamento_desconto with (security_invoker = true) as
select
  d.*,
  case when d.tipo = 'reais' then d.valor
       else round(coalesce((select sum(subtotal) from public.quote_items i where i.quote_id = d.quote_id), 0)
                  * d.valor / 100, 2) end as valor_reais
from public.quote_discounts d;

-- RLS: todo usuário ativo cria e edita; só rascunho/enviado podem mudar; aprovar só pela função.
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_discounts enable row level security;

create policy "ativo le orcamentos" on public.quotes
  for select to authenticated using (public.usuario_ativo());
create policy "ativo cria orcamento" on public.quotes
  for insert to authenticated
  with check (public.usuario_ativo() and status in ('rascunho', 'enviado') and plan_id is null);
create policy "ativo altera orcamento aberto" on public.quotes
  for update to authenticated
  using (public.usuario_ativo() and status in ('rascunho', 'enviado'))
  with check (status in ('rascunho', 'enviado', 'perdido', 'cancelado') and plan_id is null);
create policy "ativo remove rascunho" on public.quotes
  for delete to authenticated using (public.usuario_ativo() and status = 'rascunho');

create or replace function public.orcamento_aberto(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.quotes where id = p_quote_id and status in ('rascunho', 'enviado'))
$$;

do $$
declare t text;
begin
  foreach t in array array['quote_items', 'quote_discounts'] loop
    execute format(
      'create policy "ativo le %1$s" on public.%1$I for select to authenticated using (public.usuario_ativo())', t);
    execute format(
      'create policy "ativo insere %1$s" on public.%1$I for insert to authenticated with check (public.usuario_ativo() and public.orcamento_aberto(quote_id))', t);
    execute format(
      'create policy "ativo altera %1$s" on public.%1$I for update to authenticated using (public.usuario_ativo() and public.orcamento_aberto(quote_id)) with check (public.orcamento_aberto(quote_id))', t);
    execute format(
      'create policy "ativo remove %1$s" on public.%1$I for delete to authenticated using (public.usuario_ativo() and public.orcamento_aberto(quote_id))', t);
  end loop;
end;
$$;

-- Aprovar: cria o plano e os itens comprados a partir do orçamento.
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

  insert into public.plan_purchases (plan_id, procedure_id, vendido_por, quantidade, unidade_dose, dose_padrao)
  select v_plan, procedure_id, vendido_por, quantidade, unidade_dose, dose_padrao
    from public.quote_items
   where quote_id = p_quote_id
   order by created_at;

  update public.quotes
     set status = 'aprovado', plan_id = v_plan, aprovado_em = now(), aprovado_por = auth.uid(),
         medico_id = coalesce(p_medico_id, medico_id)
   where id = p_quote_id;

  perform public.auditar('aprovar_orcamento', 'quotes', p_quote_id, null,
    jsonb_build_object('numero', v_quote.numero, 'plan_id', v_plan));
  return v_plan;
end;
$$;

revoke execute on function public.aprovar_orcamento(uuid, date, uuid) from public, anon;
revoke execute on function public.definir_dados_clinica(text, text) from public, anon;
revoke execute on function public.dados_clinica() from public, anon;
revoke execute on function public.orcamento_aberto(uuid) from public, anon;
grant execute on function public.aprovar_orcamento(uuid, date, uuid) to authenticated;
grant execute on function public.definir_dados_clinica(text, text) to authenticated;
grant execute on function public.dados_clinica() to authenticated;
grant execute on function public.orcamento_aberto(uuid) to authenticated;
