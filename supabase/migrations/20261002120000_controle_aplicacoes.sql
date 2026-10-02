-- Controle de Aplicações — fase 1
-- Cadastros, lotes, plano do paciente, execução semanal com baixa de estoque transacional,
-- saldo e progresso calculados no banco, auditoria de quem fez cada ação.
--
-- Unidades: cada produto tem UMA unidade de estoque (ui, ml, ampola, protocolo).
-- A composição (procedure_items.quantidade_padrao) está sempre na unidade do produto.
-- Cada compra do plano declara a unidade da dose (ui, ml ou aplicacao) — a conversão é explícita.

create extension if not exists pgcrypto with schema extensions;

-- ─────────────────────────────────────────────────────────────
-- Perfis e permissões
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text,
  papel text not null default 'enfermagem' check (papel in ('admin', 'medico', 'enfermagem')),
  ativo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Primeiro usuário vira admin ativo; os demais entram inativos até o admin liberar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primeiro boolean;
begin
  select not exists (select 1 from public.profiles) into v_primeiro;
  insert into public.profiles (id, nome, email, papel, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    new.email,
    case when v_primeiro then 'admin' else 'enfermagem' end,
    v_primeiro
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.papel_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.profiles where id = auth.uid() and ativo
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select ativo from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.exigir_papel(p_papeis text[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.papel_atual() is null or not (public.papel_atual() = any (p_papeis)) then
    raise exception 'Sem permissão para esta ação.';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Configurações (senha de edição de aplicações, guardada com hash)
-- ─────────────────────────────────────────────────────────────
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  senha_edicao_hash text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
insert into public.app_settings (id) values (1);

-- ─────────────────────────────────────────────────────────────
-- Auditoria
-- ─────────────────────────────────────────────────────────────
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  acao text not null,
  tabela text not null,
  registro_id uuid,
  motivo text,
  dados jsonb,
  user_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create or replace function public.auditar(
  p_acao text, p_tabela text, p_registro uuid, p_motivo text, p_dados jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (acao, tabela, registro_id, motivo, dados, user_id)
  values (p_acao, p_tabela, p_registro, p_motivo, p_dados, auth.uid())
$$;

-- ─────────────────────────────────────────────────────────────
-- Cadastros
-- ─────────────────────────────────────────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  grupo text,
  unidade text not null check (unidade in ('ui', 'ml', 'ampola', 'protocolo')),
  controla_lote boolean not null default true,
  estoque_minimo numeric not null default 0 check (estoque_minimo >= 0),
  custo_padrao numeric not null default 0 check (custo_padrao >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence public.procedures_codigo_seq;

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique
    default 'PROC-' || lpad(nextval('public.procedures_codigo_seq')::text, 4, '0'),
  nome text not null,
  categoria text not null default 'injetavel',
  forma_venda text not null check (forma_venda in ('aplicacao', 'unidade')),
  preco_base numeric not null default 0 check (preco_base >= 0),
  custo_base numeric not null default 0 check (custo_base >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.procedure_items (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantidade_padrao numeric not null check (quantidade_padrao > 0),
  unique (procedure_id, product_id)
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  observacoes text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Estoque
-- ─────────────────────────────────────────────────────────────
create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  lote text not null,
  validade date,
  custo_unitario numeric not null default 0 check (custo_unitario >= 0),
  quantidade_inicial numeric not null check (quantidade_inicial > 0),
  quantidade_atual numeric not null check (quantidade_atual >= 0),
  fornecedor text,
  nota_compra text,
  status text not null default 'ativo' check (status in ('ativo', 'vencido', 'esgotado')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index stock_lots_fefo on public.stock_lots (product_id, validade) where quantidade_atual > 0;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  lot_id uuid references public.stock_lots (id),
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste', 'estorno')),
  quantidade numeric not null,
  custo_unitario_snapshot numeric not null default 0,
  referencia_tipo text,
  referencia_id uuid,
  observacao text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index stock_movements_produto on public.stock_movements (product_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- Plano do paciente
-- ─────────────────────────────────────────────────────────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  medico_id uuid references public.profiles (id),
  inicio date not null,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'encerrado')),
  observacoes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- O que o paciente comprou.
-- vendido_por = aplicacao → quantidade = nº de aplicações, cada uma com dose_padrao (na unidade_dose)
-- vendido_por = unidade   → quantidade = total de UI/mL comprado, distribuído depois
create table public.plan_purchases (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  procedure_id uuid not null references public.procedures (id),
  vendido_por text not null check (vendido_por in ('aplicacao', 'unidade')),
  quantidade numeric not null check (quantidade > 0),
  unidade_dose text not null check (unidade_dose in ('ui', 'ml', 'aplicacao')),
  dose_padrao numeric not null check (dose_padrao > 0),
  contratado numeric generated always as (
    case when vendido_por = 'aplicacao' then quantidade * dose_padrao else quantidade end
  ) stored,
  created_at timestamptz not null default now(),
  check (vendido_por = 'aplicacao' or unidade_dose <> 'aplicacao')
);

-- Uma linha por dose (uma seringa = um registro).
create table public.plan_doses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  purchase_id uuid not null references public.plan_purchases (id) on delete cascade,
  semana int not null check (semana >= 1),
  sub_semana int not null default 1 check (sub_semana in (1, 2)),
  dose numeric not null check (dose > 0),
  status text not null default 'prevista' check (status in ('prevista', 'realizada')),
  observacao text,
  created_at timestamptz not null default now()
);
create index plan_doses_semana on public.plan_doses (plan_id, semana, sub_semana);

-- ─────────────────────────────────────────────────────────────
-- Aplicações
-- ─────────────────────────────────────────────────────────────
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  semana int not null,
  sub_semana int not null default 1,
  data_aplicacao date not null default current_date,
  status text not null check (status in ('concluida', 'pulada', 'cancelada')),
  enfermeiro_id uuid references public.profiles (id),
  observacoes text,
  cancelado_em timestamptz,
  cancelado_por uuid references public.profiles (id),
  cancelamento_motivo text,
  created_at timestamptz not null default now()
);
create unique index applications_semana_unica
  on public.applications (plan_id, semana, sub_semana)
  where status in ('concluida', 'pulada');

create table public.application_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  plan_dose_id uuid references public.plan_doses (id) on delete set null,
  purchase_id uuid not null references public.plan_purchases (id),
  procedure_id uuid not null references public.procedures (id),
  dose_prevista numeric not null,
  dose_real numeric not null check (dose_real > 0),
  unidade text not null
);

create table public.application_consumptions (
  id uuid primary key default gen_random_uuid(),
  application_item_id uuid not null references public.application_items (id) on delete cascade,
  lot_id uuid not null references public.stock_lots (id),
  product_id uuid not null references public.products (id),
  quantidade numeric not null check (quantidade > 0),
  custo_unitario_snapshot numeric not null default 0
);

-- ─────────────────────────────────────────────────────────────
-- RLS: leitura para usuário ativo; escrita sensível só pelas funções abaixo
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;
alter table public.products enable row level security;
alter table public.procedures enable row level security;
alter table public.procedure_items enable row level security;
alter table public.patients enable row level security;
alter table public.stock_lots enable row level security;
alter table public.stock_movements enable row level security;
alter table public.plans enable row level security;
alter table public.plan_purchases enable row level security;
alter table public.plan_doses enable row level security;
alter table public.applications enable row level security;
alter table public.application_items enable row level security;
alter table public.application_consumptions enable row level security;

create policy "proprio perfil ou ativo le perfis" on public.profiles
  for select to authenticated using (id = auth.uid() or public.usuario_ativo());
create policy "admin altera perfis" on public.profiles
  for update to authenticated using (public.papel_atual() = 'admin');

create policy "admin le auditoria" on public.audit_log
  for select to authenticated using (public.papel_atual() = 'admin');

-- leitura geral
do $$
declare t text;
begin
  foreach t in array array[
    'products', 'procedures', 'procedure_items', 'patients', 'stock_lots', 'stock_movements',
    'plans', 'plan_purchases', 'plan_doses', 'applications', 'application_items',
    'application_consumptions'
  ] loop
    execute format(
      'create policy "ativo le %1$s" on public.%1$I for select to authenticated using (public.usuario_ativo())', t
    );
  end loop;
end;
$$;

-- cadastros: admin e médico
do $$
declare t text;
begin
  foreach t in array array['products', 'procedures', 'procedure_items', 'plans', 'plan_purchases'] loop
    execute format(
      'create policy "admin/medico insere %1$s" on public.%1$I for insert to authenticated with check (public.papel_atual() in (''admin'', ''medico''))', t
    );
    execute format(
      'create policy "admin/medico altera %1$s" on public.%1$I for update to authenticated using (public.papel_atual() in (''admin'', ''medico''))', t
    );
    execute format(
      'create policy "admin/medico remove %1$s" on public.%1$I for delete to authenticated using (public.papel_atual() in (''admin'', ''medico''))', t
    );
  end loop;
end;
$$;

-- pacientes: qualquer usuário ativo cadastra e edita
create policy "ativo insere pacientes" on public.patients
  for insert to authenticated with check (public.usuario_ativo());
create policy "ativo altera pacientes" on public.patients
  for update to authenticated using (public.usuario_ativo());

-- ─────────────────────────────────────────────────────────────
-- Estoque: entrada e ajuste
-- ─────────────────────────────────────────────────────────────
create or replace function public.entrada_lote(
  p_product_id uuid,
  p_lote text,
  p_validade date,
  p_quantidade numeric,
  p_custo_unitario numeric,
  p_fornecedor text default null,
  p_nota_compra text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade deve ser maior que zero.';
  end if;

  insert into public.stock_lots (
    product_id, lote, validade, custo_unitario, quantidade_inicial, quantidade_atual,
    fornecedor, nota_compra, created_by
  ) values (
    p_product_id, p_lote, p_validade, coalesce(p_custo_unitario, 0), p_quantidade, p_quantidade,
    p_fornecedor, p_nota_compra, auth.uid()
  ) returning id into v_lot;

  insert into public.stock_movements (
    product_id, lot_id, tipo, quantidade, custo_unitario_snapshot, referencia_tipo, referencia_id, created_by
  ) values (
    p_product_id, v_lot, 'entrada', p_quantidade, coalesce(p_custo_unitario, 0), 'stock_lot', v_lot, auth.uid()
  );

  perform public.auditar('entrada_lote', 'stock_lots', v_lot, null,
    jsonb_build_object('lote', p_lote, 'quantidade', p_quantidade));
  return v_lot;
end;
$$;

create or replace function public.ajustar_lote(p_lot_id uuid, p_nova_quantidade numeric, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.stock_lots;
  v_delta numeric;
begin
  perform public.exigir_papel(array['admin']);
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do ajuste.';
  end if;
  if p_nova_quantidade < 0 then
    raise exception 'Quantidade não pode ser negativa.';
  end if;

  select * into v_lot from public.stock_lots where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado.'; end if;

  v_delta := p_nova_quantidade - v_lot.quantidade_atual;
  if v_delta = 0 then return; end if;

  update public.stock_lots
     set quantidade_atual = p_nova_quantidade,
         status = case when p_nova_quantidade = 0 then 'esgotado'
                       when status = 'esgotado' then 'ativo' else status end
   where id = p_lot_id;

  insert into public.stock_movements (
    product_id, lot_id, tipo, quantidade, custo_unitario_snapshot, referencia_tipo, referencia_id,
    observacao, created_by
  ) values (
    v_lot.product_id, p_lot_id, 'ajuste', v_delta, v_lot.custo_unitario, 'stock_lot', p_lot_id,
    p_motivo, auth.uid()
  );

  perform public.auditar('ajuste_lote', 'stock_lots', p_lot_id, p_motivo,
    jsonb_build_object('de', v_lot.quantidade_atual, 'para', p_nova_quantidade));
end;
$$;

-- Tira (p_qtd > 0) ou devolve (p_qtd < 0) de um lote, com trava e movimento.
create or replace function public._mover_lote(
  p_lot_id uuid, p_qtd numeric, p_tipo text, p_ref_tipo text, p_ref_id uuid, p_obs text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.stock_lots;
  v_lote_nome text;
begin
  select * into v_lot from public.stock_lots where id = p_lot_id for update;
  if not found then raise exception 'Lote não encontrado.'; end if;

  if p_qtd > 0 and v_lot.quantidade_atual < p_qtd then
    raise exception 'Lote % sem saldo suficiente: tem %, precisa de %, faltam %.',
      v_lot.lote, v_lot.quantidade_atual, p_qtd, p_qtd - v_lot.quantidade_atual;
  end if;
  if p_qtd > 0 and v_lot.validade is not null and v_lot.validade < current_date then
    raise exception 'Lote % está vencido (%).', v_lot.lote, to_char(v_lot.validade, 'DD/MM/YYYY');
  end if;

  update public.stock_lots
     set quantidade_atual = quantidade_atual - p_qtd,
         status = case when quantidade_atual - p_qtd = 0 then 'esgotado'
                       when status = 'esgotado' then 'ativo' else status end
   where id = p_lot_id;

  insert into public.stock_movements (
    product_id, lot_id, tipo, quantidade, custo_unitario_snapshot, referencia_tipo, referencia_id,
    observacao, created_by
  ) values (
    v_lot.product_id, p_lot_id, p_tipo, abs(p_qtd), v_lot.custo_unitario, p_ref_tipo, p_ref_id,
    p_obs, auth.uid()
  );

  return v_lot.custo_unitario;
end;
$$;

-- Regra de consumo: produto na mesma unidade da dose → consome a dose; senão → quantidade padrão.
create or replace function public.consumo_produto(
  p_unidade_produto text, p_unidade_dose text, p_dose numeric, p_quantidade_padrao numeric
)
returns numeric
language sql
immutable
as $$
  select case when p_unidade_dose in ('ui', 'ml') and p_unidade_produto = p_unidade_dose
              then p_dose else p_quantidade_padrao end
$$;

-- ─────────────────────────────────────────────────────────────
-- Prescrição
-- ─────────────────────────────────────────────────────────────
-- p_doses: [{purchase_id, semana, sub_semana, dose, observacao?}] — substitui todas as doses previstas.
create or replace function public.salvar_prescricao(p_plan_id uuid, p_doses jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_esperadas int;
  v_inseridas int;
  v_excesso record;
  v_travada record;
begin
  perform public.exigir_papel(array['admin', 'medico']);

  if exists (select 1 from public.plans where id = p_plan_id and status = 'encerrado') then
    raise exception 'Plano encerrado não pode ser alterado.';
  end if;

  v_esperadas := jsonb_array_length(coalesce(p_doses, '[]'::jsonb));

  -- Regrava só as doses previstas; qualquer erro abaixo desfaz tudo.
  delete from public.plan_doses where plan_id = p_plan_id and status = 'prevista';

  insert into public.plan_doses (plan_id, purchase_id, semana, sub_semana, dose, observacao)
  select p_plan_id, p.id, (d ->> 'semana')::int, coalesce((d ->> 'sub_semana')::int, 1),
         (d ->> 'dose')::numeric, d ->> 'observacao'
    from jsonb_array_elements(coalesce(p_doses, '[]'::jsonb)) d
    join public.plan_purchases p on p.id = (d ->> 'purchase_id')::uuid and p.plan_id = p_plan_id;
  get diagnostics v_inseridas = row_count;

  if v_inseridas <> v_esperadas then
    raise exception 'Há doses ligadas a itens que não pertencem a este plano.';
  end if;

  -- semana já realizada ou pulada fica travada
  select d.semana, d.sub_semana into v_travada
    from public.plan_doses d
    join public.applications a
      on a.plan_id = d.plan_id and a.semana = d.semana and a.sub_semana = d.sub_semana
     and a.status in ('concluida', 'pulada')
   where d.plan_id = p_plan_id and d.status = 'prevista'
   limit 1;
  if found then
    raise exception 'A semana %·% já foi realizada ou pulada e não pode receber doses.',
      v_travada.semana, v_travada.sub_semana;
  end if;

  -- prescrito (realizado + previsto) não passa do contratado
  select pr.nome, p.contratado, sum(d.dose) as total
    into v_excesso
    from public.plan_purchases p
    join public.procedures pr on pr.id = p.procedure_id
    join public.plan_doses d on d.purchase_id = p.id
   where p.plan_id = p_plan_id
   group by p.id, pr.nome, p.contratado
  having sum(d.dose) > p.contratado
   limit 1;
  if found then
    raise exception 'Excede o contratado em %: prescrito %, contratado %.',
      v_excesso.nome, v_excesso.total, v_excesso.contratado;
  end if;

  perform public.auditar('salvar_prescricao', 'plans', p_plan_id, null,
    jsonb_build_object('doses', v_esperadas));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Execução: realizar aplicação (uma única transação)
-- ─────────────────────────────────────────────────────────────
-- p_itens: [{plan_dose_id, dose_real, lotes: {"<product_id>": "<lot_id>"}}]
-- Lote não informado → escolhe pelo vencimento mais próximo (FEFO) com saldo suficiente.
create or replace function public.realizar_aplicacao(
  p_plan_id uuid,
  p_semana int,
  p_sub_semana int,
  p_data date,
  p_itens jsonb,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
  v_app uuid;
  v_item jsonb;
  v_dose public.plan_doses;
  v_purchase public.plan_purchases;
  v_app_item uuid;
  v_comp record;
  v_qtd numeric;
  v_lot uuid;
  v_custo numeric;
  v_dose_real numeric;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);

  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then raise exception 'Plano não encontrado.'; end if;
  if v_plan.status <> 'ativo' then raise exception 'O plano não está ativo.'; end if;

  if exists (
    select 1 from public.applications
     where plan_id = p_plan_id and semana = p_semana and sub_semana = p_sub_semana
       and status in ('concluida', 'pulada')
  ) then
    raise exception 'Esta semana já foi realizada ou pulada.';
  end if;

  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'Nenhum item para aplicar.';
  end if;

  insert into public.applications (
    plan_id, patient_id, semana, sub_semana, data_aplicacao, status, enfermeiro_id, observacoes
  ) values (
    p_plan_id, v_plan.patient_id, p_semana, p_sub_semana, coalesce(p_data, current_date), 'concluida',
    auth.uid(), p_observacoes
  ) returning id into v_app;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_dose from public.plan_doses
     where id = (v_item ->> 'plan_dose_id')::uuid and plan_id = p_plan_id
     for update;
    if not found then raise exception 'Dose prescrita não encontrada.'; end if;
    if v_dose.status <> 'prevista' then raise exception 'Uma das doses já foi aplicada.'; end if;
    if v_dose.semana <> p_semana or v_dose.sub_semana <> p_sub_semana then
      raise exception 'Dose de outra semana enviada nesta aplicação.';
    end if;

    select * into v_purchase from public.plan_purchases where id = v_dose.purchase_id;
    v_dose_real := coalesce((v_item ->> 'dose_real')::numeric, v_dose.dose);
    if v_dose_real <= 0 then raise exception 'Dose real deve ser maior que zero.'; end if;

    insert into public.application_items (
      application_id, plan_dose_id, purchase_id, procedure_id, dose_prevista, dose_real, unidade
    ) values (
      v_app, v_dose.id, v_purchase.id, v_purchase.procedure_id, v_dose.dose, v_dose_real, v_purchase.unidade_dose
    ) returning id into v_app_item;

    update public.plan_doses set status = 'realizada' where id = v_dose.id;

    for v_comp in
      select pi.product_id, pi.quantidade_padrao, pr.unidade, pr.nome, pr.controla_lote
        from public.procedure_items pi
        join public.products pr on pr.id = pi.product_id
       where pi.procedure_id = v_purchase.procedure_id
    loop
      v_qtd := public.consumo_produto(v_comp.unidade, v_purchase.unidade_dose, v_dose_real, v_comp.quantidade_padrao);
      continue when v_qtd <= 0;

      v_lot := nullif(v_item -> 'lotes' ->> v_comp.product_id::text, '')::uuid;
      if v_lot is null then
        select id into v_lot from public.stock_lots
         where product_id = v_comp.product_id and quantidade_atual >= v_qtd
           and (validade is null or validade >= current_date)
         order by validade nulls last, created_at
         limit 1;
        if v_lot is null then
          raise exception 'Sem lote com saldo para % (precisa de % %).', v_comp.nome, v_qtd, v_comp.unidade;
        end if;
      elsif not exists (select 1 from public.stock_lots where id = v_lot and product_id = v_comp.product_id) then
        raise exception 'O lote escolhido não é de %.', v_comp.nome;
      end if;

      v_custo := public._mover_lote(v_lot, v_qtd, 'saida', 'application', v_app, null);

      insert into public.application_consumptions (
        application_item_id, lot_id, product_id, quantidade, custo_unitario_snapshot
      ) values (v_app_item, v_lot, v_comp.product_id, v_qtd, v_custo);
    end loop;
  end loop;

  perform public.auditar('realizar_aplicacao', 'applications', v_app, null,
    jsonb_build_object('semana', p_semana, 'sub_semana', p_sub_semana));
  return v_app;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Pular semana: grava a semana como pulada e empurra as doses seguintes uma semana
-- ─────────────────────────────────────────────────────────────
create or replace function public.pular_semana(p_plan_id uuid, p_semana int, p_sub_semana int, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans;
  v_app uuid;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;

  select * into v_plan from public.plans where id = p_plan_id for update;
  if not found then raise exception 'Plano não encontrado.'; end if;

  if exists (
    select 1 from public.applications
     where plan_id = p_plan_id and semana = p_semana and sub_semana = p_sub_semana
       and status in ('concluida', 'pulada')
  ) then
    raise exception 'Esta semana já foi realizada ou pulada.';
  end if;

  insert into public.applications (
    plan_id, patient_id, semana, sub_semana, data_aplicacao, status, enfermeiro_id, observacoes
  ) values (
    p_plan_id, v_plan.patient_id, p_semana, p_sub_semana, current_date, 'pulada', auth.uid(), p_motivo
  ) returning id into v_app;

  update public.plan_doses
     set semana = semana + 1
   where plan_id = p_plan_id and status = 'prevista' and semana >= p_semana;

  perform public.auditar('pular_semana', 'applications', v_app, p_motivo,
    jsonb_build_object('semana', p_semana, 'sub_semana', p_sub_semana));
  return v_app;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Senha de edição (hash no banco; nenhuma tela lê a senha)
-- ─────────────────────────────────────────────────────────────
create or replace function public.definir_senha_edicao(p_nova text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.exigir_papel(array['admin']);
  if length(coalesce(p_nova, '')) < 4 then raise exception 'A senha precisa de pelo menos 4 caracteres.'; end if;
  update public.app_settings
     set senha_edicao_hash = extensions.crypt(p_nova, extensions.gen_salt('bf')),
         updated_at = now(), updated_by = auth.uid()
   where id = 1;
  perform public.auditar('definir_senha_edicao', 'app_settings', null, null, null);
end;
$$;

create or replace function public.senha_edicao_definida()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select senha_edicao_hash is not null from public.app_settings where id = 1
$$;

create or replace function public._conferir_senha(p_senha text)
returns void
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select senha_edicao_hash into v_hash from public.app_settings where id = 1;
  if v_hash is null then raise exception 'A senha de edição ainda não foi definida pelo admin.'; end if;
  if extensions.crypt(coalesce(p_senha, ''), v_hash) <> v_hash then
    raise exception 'Senha de edição incorreta.';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Editar dose de uma aplicação realizada (ajusta o lote pela diferença)
-- ─────────────────────────────────────────────────────────────
create or replace function public.editar_dose_aplicacao(
  p_application_item_id uuid, p_nova_dose numeric, p_senha text, p_motivo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.application_items;
  v_app public.applications;
  v_purchase public.plan_purchases;
  v_cons record;
  v_nova_qtd numeric;
  v_delta numeric;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);
  perform public._conferir_senha(p_senha);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  if p_nova_dose is null or p_nova_dose <= 0 then raise exception 'Dose deve ser maior que zero.'; end if;

  select * into v_item from public.application_items where id = p_application_item_id for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  select * into v_app from public.applications where id = v_item.application_id;
  if v_app.status <> 'concluida' then raise exception 'Só aplicações realizadas podem ser editadas.'; end if;
  select * into v_purchase from public.plan_purchases where id = v_item.purchase_id;

  for v_cons in
    select c.id, c.lot_id, c.quantidade, pi.quantidade_padrao, pr.unidade
      from public.application_consumptions c
      join public.products pr on pr.id = c.product_id
      join public.procedure_items pi on pi.procedure_id = v_item.procedure_id and pi.product_id = c.product_id
     where c.application_item_id = v_item.id
  loop
    v_nova_qtd := public.consumo_produto(v_cons.unidade, v_purchase.unidade_dose, p_nova_dose, v_cons.quantidade_padrao);
    v_delta := v_nova_qtd - v_cons.quantidade;
    continue when v_delta = 0;
    perform public._mover_lote(
      v_cons.lot_id, v_delta, case when v_delta > 0 then 'saida' else 'estorno' end,
      'application', v_app.id, 'Edição de dose: ' || p_motivo
    );
    update public.application_consumptions set quantidade = v_nova_qtd where id = v_cons.id;
  end loop;

  update public.application_items set dose_real = p_nova_dose where id = v_item.id;

  perform public.auditar('editar_dose', 'application_items', v_item.id, p_motivo,
    jsonb_build_object('de', v_item.dose_real, 'para', p_nova_dose));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Cancelar aplicação realizada (devolve tudo aos lotes) ou desfazer semana pulada
-- ─────────────────────────────────────────────────────────────
create or replace function public.cancelar_aplicacao(p_application_id uuid, p_senha text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.applications;
  v_cons record;
begin
  perform public.exigir_papel(array['admin', 'medico', 'enfermagem']);
  perform public._conferir_senha(p_senha);
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;

  select * into v_app from public.applications where id = p_application_id for update;
  if not found then raise exception 'Aplicação não encontrada.'; end if;
  if v_app.status = 'cancelada' then raise exception 'Esta aplicação já foi cancelada.'; end if;

  if v_app.status = 'concluida' then
    for v_cons in
      select c.lot_id, c.quantidade
        from public.application_consumptions c
        join public.application_items i on i.id = c.application_item_id
       where i.application_id = v_app.id
    loop
      perform public._mover_lote(v_cons.lot_id, -v_cons.quantidade, 'estorno', 'application', v_app.id,
        'Cancelamento: ' || p_motivo);
    end loop;

    update public.plan_doses d
       set status = 'prevista'
      from public.application_items i
     where i.application_id = v_app.id and d.id = i.plan_dose_id;
  else
    -- semana pulada: as doses voltam uma semana, se a semana original estiver livre
    if exists (
      select 1 from public.plan_doses
       where plan_id = v_app.plan_id and semana = v_app.semana and status = 'prevista'
    ) then
      raise exception 'Já existem doses na semana %; ajuste a prescrição antes de desfazer.', v_app.semana;
    end if;
    update public.plan_doses
       set semana = semana - 1
     where plan_id = v_app.plan_id and status = 'prevista' and semana > v_app.semana;
  end if;

  update public.applications
     set status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), cancelamento_motivo = p_motivo
   where id = v_app.id;

  perform public.auditar('cancelar_aplicacao', 'applications', v_app.id, p_motivo,
    jsonb_build_object('status_anterior', v_app.status, 'semana', v_app.semana));
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Visões: saldo, progresso e estoque (mesmo número na tela, no relatório e na API)
-- ─────────────────────────────────────────────────────────────
create view public.v_saldo_compra with (security_invoker = true) as
select
  p.id as purchase_id,
  p.plan_id,
  p.procedure_id,
  pr.nome as procedimento,
  pr.codigo,
  p.vendido_por,
  p.quantidade,
  p.unidade_dose,
  p.dose_padrao,
  p.contratado,
  coalesce((select sum(d.dose) from public.plan_doses d where d.purchase_id = p.id), 0) as prescrito,
  coalesce((
    select sum(i.dose_real) from public.application_items i
      join public.applications a on a.id = i.application_id
     where i.purchase_id = p.id and a.status = 'concluida'
  ), 0) as aplicado
from public.plan_purchases p
join public.procedures pr on pr.id = p.procedure_id;

create view public.v_progresso_plano with (security_invoker = true) as
select
  pl.id as plan_id,
  pl.patient_id,
  pl.status,
  (select count(*) from (
     select distinct semana, sub_semana from public.plan_doses d where d.plan_id = pl.id
   ) s) as semanas_previstas,
  (select count(*) from public.applications a where a.plan_id = pl.id and a.status = 'concluida') as semanas_realizadas,
  (select count(*) from public.applications a where a.plan_id = pl.id and a.status = 'pulada') as semanas_puladas,
  (select min(semana) from public.plan_doses d where d.plan_id = pl.id and d.status = 'prevista') as proxima_semana
from public.plans pl;

create view public.v_estoque_produto with (security_invoker = true) as
select
  pr.id as product_id,
  pr.nome,
  pr.grupo,
  pr.unidade,
  pr.estoque_minimo,
  coalesce(sum(l.quantidade_atual) filter (where l.validade is null or l.validade >= current_date), 0) as saldo,
  min(l.validade) filter (where l.quantidade_atual > 0 and l.validade >= current_date) as proxima_validade,
  coalesce(sum(l.quantidade_atual) filter (where l.validade is null or l.validade >= current_date), 0)
    < pr.estoque_minimo as abaixo_minimo
from public.products pr
left join public.stock_lots l on l.product_id = pr.id and l.quantidade_atual > 0
where pr.ativo
group by pr.id;

-- ─────────────────────────────────────────────────────────────
-- Permissões das funções
-- ─────────────────────────────────────────────────────────────
revoke execute on function public._mover_lote(uuid, numeric, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public._conferir_senha(text) from public, anon, authenticated;
revoke execute on function public.auditar(text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
