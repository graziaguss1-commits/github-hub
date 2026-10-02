-- Pacientes no modelo do NutroClinic: código PAC-00001, CPF, nascimento, lista com situação.
create sequence public.patients_codigo_seq;

alter table public.patients
  add column codigo text unique,
  add column cpf text,
  add column data_nascimento date;

update public.patients
   set codigo = 'PAC-' || lpad(nextval('public.patients_codigo_seq')::text, 5, '0')
 where codigo is null;

alter table public.patients
  alter column codigo set default 'PAC-' || lpad(nextval('public.patients_codigo_seq')::text, 5, '0'),
  alter column codigo set not null;

create unique index patients_cpf_unico on public.patients (regexp_replace(cpf, '\D', '', 'g'))
  where cpf is not null and cpf <> '';

-- Lista: última aplicação e situação calculadas no banco.
create view public.v_paciente_lista with (security_invoker = true) as
select
  p.id,
  p.codigo,
  p.nome,
  p.cpf,
  p.telefone,
  p.data_nascimento,
  p.created_at,
  (select max(a.data_aplicacao) from public.applications a
    where a.patient_id = p.id and a.status = 'concluida') as ultima_aplicacao,
  case
    when exists (
      select 1 from public.plans pl join public.plan_doses d on d.plan_id = pl.id
       where pl.patient_id = p.id and pl.status = 'ativo' and d.status = 'prevista'
    ) then 'em_tratamento'
    when exists (select 1 from public.plans pl where pl.patient_id = p.id and pl.status = 'ativo')
      then 'concluido'
    else 'sem_plano'
  end as situacao
from public.patients p;

-- Excluir paciente: só admin e só se não tiver orçamento nem plano (nada de apagar histórico).
create or replace function public.excluir_paciente(p_patient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.exigir_papel(array['admin']);
  if exists (select 1 from public.quotes where patient_id = p_patient_id)
     or exists (select 1 from public.plans where patient_id = p_patient_id) then
    raise exception 'Paciente com orçamento ou plano não pode ser excluído.';
  end if;
  delete from public.patients where id = p_patient_id;
  perform public.auditar('excluir_paciente', 'patients', p_patient_id, null, null);
end;
$$;

revoke execute on function public.excluir_paciente(uuid) from public, anon;
grant execute on function public.excluir_paciente(uuid) to authenticated;
