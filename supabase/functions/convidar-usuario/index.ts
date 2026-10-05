// Convida (ou reenvia o convite a) um usuário por e-mail (só admin). A pessoa recebe o link, cria a senha e já entra liberada
// com o papel escolhido. Usa a chave de serviço, que existe só no servidor do Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function lerUsuario(token: string): string | null {
  try {
    const parte = token.split(".")[1] ?? "";
    const json = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parte.length / 4) * 4, "=")));
    if (json.role !== "authenticated" || typeof json.sub !== "string") return null;
    if (typeof json.exp === "number" && json.exp * 1000 < Date.now()) return null;
    return json.sub;
  } catch {
    return null;
  }
}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const servico = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Quem chama precisa ser admin liberado. A assinatura do token já foi conferida na entrada
  // (verify_jwt); aqui só lemos quem é, sem depender da sessão continuar aberta no servidor.
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const userId = lerUsuario(token);
  if (!userId) return resposta({ erro: "Saia e entre de novo no sistema." }, 401);
  const quem = { user: { id: userId } };
  const { data: perfil } = await servico.from("profiles").select("papel, ativo").eq("id", userId).single();
  if (!perfil?.ativo || perfil.papel !== "admin") return resposta({ erro: "Só o admin pode convidar usuários." }, 403);

  const corpo = await req.json().catch(() => ({}));
  const redirect = typeof corpo.redirectTo === "string" ? corpo.redirectTo : undefined;

  // Link de acesso sem e-mail (não conta no limite): o admin copia e manda por WhatsApp.
  if (corpo.acao === "link") {
    const { data: alvo, error: erroAlvo } = await servico.auth.admin.getUserById(String(corpo.user_id ?? ""));
    if (erroAlvo || !alvo?.user?.email) return resposta({ erro: "Usuário não encontrado." }, 404);
    const { data: gerado, error } = await servico.auth.admin.generateLink({
      type: "recovery",
      email: alvo.user.email,
      ...(redirect ? { options: { redirectTo: redirect } } : {}),
    });
    if (error || !gerado?.properties?.action_link) return resposta({ erro: error?.message ?? "Não foi possível gerar o link." }, 400);
    await servico.from("audit_log").insert({
      acao: "gerar_link_acesso",
      tabela: "profiles",
      registro_id: alvo.user.id,
      dados: { email: alvo.user.email },
      user_id: quem.user.id,
    });
    return resposta({ ok: true, link: gerado.properties.action_link, email: alvo.user.email });
  }

  // Reenviar: convite de novo para quem nunca entrou; senão, link para criar nova senha.
  if (corpo.acao === "reenviar") {
    const { data: alvo, error: erroAlvo } = await servico.auth.admin.getUserById(String(corpo.user_id ?? ""));
    if (erroAlvo || !alvo?.user?.email) return resposta({ erro: "Usuário não encontrado." }, 404);
    const emailAlvo = alvo.user.email;
    let enviado = false;
    if (!alvo.user.last_sign_in_at) {
      const { error } = await servico.auth.admin.inviteUserByEmail(emailAlvo, {
        data: alvo.user.user_metadata ?? {},
        ...(redirect ? { redirectTo: redirect } : {}),
      });
      enviado = !error;
      if (error && /rate|limit/i.test(error.message)) {
        return resposta({ erro: "Limite de e-mails do plano grátis atingido. Tente de novo em uma hora." }, 429);
      }
    }
    if (!enviado) {
      const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
      const { error } = await anon.auth.resetPasswordForEmail(emailAlvo, redirect ? { redirectTo: redirect } : {});
      if (error) {
        const msg = /rate|limit|seconds/i.test(error.message)
          ? "Limite de e-mails atingido. Espere alguns minutos e tente de novo."
          : error.message;
        return resposta({ erro: msg }, 400);
      }
    }
    await servico.from("audit_log").insert({
      acao: "reenviar_convite",
      tabela: "profiles",
      registro_id: alvo.user.id,
      dados: { email: emailAlvo },
      user_id: quem.user.id,
    });
    return resposta({ ok: true, email: emailAlvo });
  }

  const email = String(corpo.email ?? "").trim().toLowerCase();
  const nome = String(corpo.nome ?? "").trim();
  const papel = String(corpo.papel ?? "enfermagem");
  const redirectTo = redirect;
  if (!email.includes("@")) return resposta({ erro: "E-mail inválido." }, 400);
  if (!nome) return resposta({ erro: "Informe o nome." }, 400);
  if (!["admin", "medico", "enfermagem"].includes(papel)) return resposta({ erro: "Papel inválido." }, 400);

  const { data: convite, error } = await servico.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    ...(redirectTo ? { redirectTo } : {}),
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? "Já existe um usuário com este e-mail."
      : /rate|limit/i.test(error.message)
        ? "Limite de e-mails do plano grátis atingido. Tente de novo em uma hora."
        : error.message;
    return resposta({ erro: msg }, 400);
  }

  // O gatilho cria o perfil bloqueado; aqui ele já sai liberado com o papel escolhido.
  const { error: erroPerfil } = await servico
    .from("profiles")
    .update({
      nome,
      papel,
      ativo: true,
      registro_profissional: corpo.registro_profissional || null,
      especialidade: corpo.especialidade || null,
    })
    .eq("id", convite.user.id);
  if (erroPerfil) return resposta({ erro: erroPerfil.message }, 500);

  await servico.from("audit_log").insert({
    acao: "convidar_usuario",
    tabela: "profiles",
    registro_id: convite.user.id,
    dados: { email, papel },
    user_id: quem.user.id,
  });

  return resposta({ ok: true });
});
