import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/AppShell";
import { Campo, Etiqueta, Seletor } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
    <AppShell titulo="Equipe">
      <p className="mb-4 text-sm text-muted-foreground">
        Quem cria acesso entra bloqueado. O admin libera e define o papel de cada pessoa.
      </p>
      <div className="mb-8 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Acesso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perfis.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>{p.email}</TableCell>
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

      {admin && <SenhaEdicao />}
    </AppShell>
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
    <div className="max-w-md rounded-lg border p-4">
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
