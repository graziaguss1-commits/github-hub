import { useState, type ReactNode } from "react";

import { Campo } from "@/components/app/campos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Confirmação dentro do sistema. O confirm() do navegador é bloqueado na pré-visualização do Lovable,
 * por isso toda confirmação passa por aqui. Pode pedir motivo e/ou senha de edição.
 */
export function Confirmar({
  titulo,
  descricao,
  textoBotao = "Confirmar",
  destrutivo = false,
  pedirMotivo = false,
  pedirSenha = false,
  carregando = false,
  onConfirmar,
  fechar,
}: {
  titulo: string;
  descricao?: ReactNode;
  textoBotao?: string;
  destrutivo?: boolean;
  pedirMotivo?: boolean;
  pedirSenha?: boolean;
  carregando?: boolean;
  onConfirmar: (dados: { motivo: string; senha: string }) => void;
  fechar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [senha, setSenha] = useState("");
  const pronto = (!pedirMotivo || motivo.trim()) && (!pedirSenha || senha);

  return (
    <Dialog open onOpenChange={(o) => !o && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        {descricao && <div className="text-sm text-muted-foreground">{descricao}</div>}
        {(pedirMotivo || pedirSenha) && (
          <div className="grid gap-3">
            {pedirMotivo && (
              <Campo label="Motivo">
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
              </Campo>
            )}
            {pedirSenha && (
              <Campo label="Senha de edição">
                <Input type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
              </Campo>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Voltar
          </Button>
          <Button
            variant={destrutivo ? "destructive" : "default"}
            disabled={!pronto || carregando}
            onClick={() => onConfirmar({ motivo: motivo.trim(), senha })}
          >
            {textoBotao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
