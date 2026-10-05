-- Para o admin ver em Equipe quem ainda não aceitou o convite.
create or replace function public.status_acessos()
returns table (id uuid, confirmado boolean, ultimo_acesso timestamptz, convidado_em timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.papel_atual() is distinct from 'admin' then
    raise exception 'Sem permissão para esta ação.';
  end if;
  return query
    select u.id, u.email_confirmed_at is not null, u.last_sign_in_at, u.invited_at
      from auth.users u
      join public.profiles p on p.id = u.id;
end;
$$;

revoke execute on function public.status_acessos() from public, anon;
grant execute on function public.status_acessos() to authenticated;
