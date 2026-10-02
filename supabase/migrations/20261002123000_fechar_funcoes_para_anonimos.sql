-- Ninguém sem login chama as funções do sistema.
revoke execute on function public.ajustar_lote(uuid, numeric, text) from public, anon;
revoke execute on function public.cancelar_aplicacao(uuid, text, text) from public, anon;
revoke execute on function public.definir_senha_edicao(text) from public, anon;
revoke execute on function public.editar_dose_aplicacao(uuid, numeric, text, text) from public, anon;
revoke execute on function public.entrada_lote(uuid, text, date, numeric, numeric, text, text) from public, anon;
revoke execute on function public.pular_semana(uuid, integer, integer, text) from public, anon;
revoke execute on function public.realizar_aplicacao(uuid, integer, integer, date, jsonb, text) from public, anon;
revoke execute on function public.salvar_prescricao(uuid, jsonb) from public, anon;
revoke execute on function public.senha_edicao_definida() from public, anon;
revoke execute on function public.papel_atual() from public, anon;
revoke execute on function public.usuario_ativo() from public, anon;
-- exigir_papel só é usada dentro das outras funções.
revoke execute on function public.exigir_papel(text[]) from public, anon, authenticated;

grant execute on function public.ajustar_lote(uuid, numeric, text) to authenticated;
grant execute on function public.cancelar_aplicacao(uuid, text, text) to authenticated;
grant execute on function public.definir_senha_edicao(text) to authenticated;
grant execute on function public.editar_dose_aplicacao(uuid, numeric, text, text) to authenticated;
grant execute on function public.entrada_lote(uuid, text, date, numeric, numeric, text, text) to authenticated;
grant execute on function public.pular_semana(uuid, integer, integer, text) to authenticated;
grant execute on function public.realizar_aplicacao(uuid, integer, integer, date, jsonb, text) to authenticated;
grant execute on function public.salvar_prescricao(uuid, jsonb) to authenticated;
grant execute on function public.senha_edicao_definida() to authenticated;
grant execute on function public.papel_atual() to authenticated;
grant execute on function public.usuario_ativo() to authenticated;

-- app_settings: sem acesso direto; a senha só passa pelas funções.
comment on table public.app_settings is 'Sem políticas de propósito: acesso apenas pelas funções definir_senha_edicao e _conferir_senha.';
