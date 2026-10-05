import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Send, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Seletor } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAPEL_LABEL, useAuth, usePode } from "@/lib/auth";
import { usePerfis } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";
import type { Papel, Profile } from "@/lib/types";

export const Route = createFileRoute("/equipe")({
  head: () => ({ meta: [{ title: "Equipe — Controle de Aplicações" }] }),
  component: Equipe,
});

function Equipe() {
  const admin = usePode("admin");
  const { perfil: eu } = useAuth();
  const qc = useQueryClient();
  const { data: perfis = [] } = usePerfis();

  const atualizar = useMutation({
    mutationFn: async ({ id, ...mudanca }: Partial<Profile> & { id: string }) =>
      check(await supabase.from("profiles").update(mudanca).eq("id", id)),
    onSuccess: () => {
      toast.success("Equipe atualizada.");
      void qc.invalidateQueries({ queryKey: ["profiles"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AppShell titulo="Equipe" acoes={admin && <ConvidarBotao />}>
      <p className="mb-4 text-sm text-muted-foreground">
        Use "Convidar usuário" para mandar o acesso por e-mail. Quem cria a conta sozinho na tela de login entra
        bloqueado até o admin liberar. CRM/COREN e especialidade saem no orçamento e no plano impressos.
      </p>
      <div className="cartao mb-8 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CRM / COREN</TableHead>
              <TableHead>Especialidade</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perfis.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {admin ? (
                    <CampoTexto valor={p.nome} salvar={(v) => atualizar.mutate({ id: p.id, nome: v ?? "" })} />
                  ) : (
                    p.nome
                  )}
                </TableCell>
                <TableCell>
                  {admin ? (
                    <CampoTexto
                      valor={p.registro_profissional}
                      placeholder="CRM-SP 000000"
                      salvar={(v) => atualizar.mutate({ id: p.id, registro_profissional: v })}
                    />
                  ) : (
                    (p.registro_profissional ?? "—")
                  )}
                </TableCell>
                <TableCell>
                  {admin ? (
                    <CampoTexto
                      valor={p.especialidade}
                      salvar={(v) => atualizar.mutate({ id: p.id, especialidade: v })}
                    />
                  ) : (
                    (p.especialidade ?? "—")
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.email}</TableCell>
                <TableCell>
                  {admin && p.id !== eu?.id ? (
                    <Seletor
                      className="w-40"
                      value={p.papel}
                      onChange={(e) => atualizar.mutate({ id: p.id, papel: e.target.value as Papel })}
                    >
                      {(Object.keys(PAPEL_LABEL) as Papel[]).map((k) => (
                        <option key={k} value={k}>
                          {PAPEL_LABEL[k]}
                        </option>
                      ))}
                    </Seletor>
                  ) : (
                    PAPEL_LABEL[p.papel]
                  )}
                </TableCell>
                <TableCell>
                  {admin && p.id !== eu?.id ? (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={p.ativo}
                        onCheckedChange={(v) => atualizar.mutate({ id: p.id, ativo: v === true })}
                      />
                      {p.ativo ? "Liberado" : "Bloqueado"}
                    </label>
                  ) : (
                    <Etiqueta tom={p.ativo ? "ok" : "alerta"}>{p.ativo ? "Liberado" : "Bloqueado"}</Etiqueta>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {admin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SenhaEdicao />
          <DadosClinica />
        </div>
      )}
    </AppShell>
  );
}

function ConvidarBotao() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button className="rounded-full" onClick={() => setAberto(true)}>
        <UserPlus /> Convidar usuário
      </Button>
      {aberto && <Convidar fechar={() => setAberto(false)} />}
    </>
  );
}

function Convidar({ fechar }: { fechar: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("enfermagem");
  const [registro, setRegistro] = useState("");
  const [especialidade, setEspecialidade] = useState("");

  const convidar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("convidar-usuario", {
        body: {
          nome: nome.trim(),
          email: email.trim(),
          papel,
          registro_profissional: registro.trim() || null,
          especialidade: especialidade.trim() || null,
          redirectTo: `${window.location.origin}/definir-senha`,
        },
      });
      if (error) {
        // a função devolve { erro } com a mensagem em português
        const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(corpo?.erro ?? error.message);
      }
      if (data?.erro) throw new Error(data.erro);
    },
    onSuccess: () => {
      toast.success(`Convite enviado para ${email.trim()}.`);
      void qc.invalidateQueries({ queryKey: ["profiles"] });
      fechar();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          A pessoa recebe um e-mail com um link para criar a senha e já entra liberada com o papel escolhido.
        </p>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            convidar.mutate();
          }}
        >
          <Campo label="Nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </Campo>
          <Campo label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Campo>
          <Campo label="Papel">
            <Seletor value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {(Object.keys(PAPEL_LABEL) as Papel[]).map((k) => (
                <option key={k} value={k}>
                  {PAPEL_LABEL[k]}
                </option>
              ))}
            </Seletor>
          </Campo>
          {papel !== "admin" && (
            <div className="grid grid-cols-2 gap-3">
              <Campo label={papel === "medico" ? "CRM" : "COREN"}>
                <Input value={registro} onChange={(e) => setRegistro(e.target.value)} />
              </Campo>
              <Campo label="Especialidade">
                <Input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} />
              </Campo>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={convidar.isPending}>
              <Send /> Enviar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Campo que salva ao sair (ou com Enter), só se mudou. */
function CampoTexto({
  valor,
  salvar,
  placeholder,
}: {
  valor: string | null;
  salvar: (v: string | null) => void;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState(valor ?? "");
  return (
    <Input
      className="h-8 min-w-36"
      value={texto}
      placeholder={placeholder}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      onBlur={() => texto.trim() !== (valor ?? "") && salvar(texto.trim() || null)}
    />
  );
}

function SenhaEdicao() {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const { data: definida, refetch } = useQuery({
    queryKey: ["senha_edicao_definida"],
    queryFn: async () => check(await supabase.rpc("senha_edicao_definida")) as boolean,
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (senha !== confirma) throw new Error("As senhas não conferem.");
      check(await supabase.rpc("definir_senha_edicao", { p_nova: senha }));
    },
    onSuccess: () => {
      toast.success("Senha de edição definida.");
      setSenha("");
      setConfirma("");
      void refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="cartao max-w-md p-6">
      <h2 className="font-medium">Senha de edição de aplicações</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Exigida para editar ou cancelar uma aplicação realizada. Fica guardada embaralhada no banco.{" "}
        {definida ? <Etiqueta tom="ok">definida</Etiqueta> : <Etiqueta tom="alerta">ainda não definida</Etiqueta>}
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <Campo label={definida ? "Nova senha" : "Senha"}>
          <Input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        <Campo label="Repita a senha">
          <Input type="password" autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} />
        </Campo>
        <Button type="submit" disabled={!senha || salvar.isPending}>
          Salvar senha
        </Button>
      </form>
    </div>
  );
}

function DadosClinica() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["dados_clinica"],
    queryFn: async () =>
      ((check(await supabase.rpc("dados_clinica")) as { clinica_nome: string | null; clinica_rodape: string | null }[])[0] ??
        null),
  });
  const [nome, setNome] = useState<string | null>(null);
  const [rodape, setRodape] = useState<string | null>(null);
  const nomeAtual = nome ?? data?.clinica_nome ?? "";
  const rodapeAtual = rodape ?? data?.clinica_rodape ?? "";

  const salvar = useMutation({
    mutationFn: async () =>
      check(await supabase.rpc("definir_dados_clinica", { p_nome: nomeAtual, p_rodape: rodapeAtual })),
    onSuccess: () => {
      toast.success("Dados do orçamento impresso salvos.");
      void qc.invalidateQueries({ queryKey: ["dados_clinica"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="cartao max-w-md p-6">
      <h2 className="font-medium">Orçamento impresso</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Nome no cabeçalho e texto do rodapé (endereço, telefone, validade do orçamento). Fica em branco se não preencher.
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <Campo label="Nome da clínica">
          <Input value={nomeAtual} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo label="Rodapé">
          <Textarea rows={3} value={rodapeAtual} onChange={(e) => setRodape(e.target.value)} />
        </Campo>
        <Button type="submit" disabled={salvar.isPending}>
          Salvar
        </Button>
      </form>
    </div>
  );
}
