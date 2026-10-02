-- Ficha profissional: CRM/COREN e especialidade (como no NutroClinic, em texto livre).
alter table public.profiles
  add column registro_profissional text,
  add column especialidade text;
