import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { idade } from "@/lib/format";
import { cn } from "@/lib/utils";

type PacienteOpcao = {
  id: string;
  nome: string;
  codigo: string;
  cpf: string | null;
  data_nascimento: string | null;
};

function detalhe(p: PacienteOpcao) {
  const anos = idade(p.data_nascimento);
  return [p.codigo, p.cpf, anos !== null ? `${anos} anos` : null].filter(Boolean).join(" · ");
}

/** Escolha de paciente com busca por nome, código ou CPF (como no NutroClinic). */
export function SeletorPaciente({
  pacientes,
  valor,
  onChange,
}: {
  pacientes: PacienteOpcao[];
  valor: string;
  onChange: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = pacientes.find((p) => p.id === valor);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={aberto}
          className="flex h-10 w-full items-center justify-between rounded-[12px] border border-input bg-card px-3 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn("truncate", !atual && "text-muted-foreground")}>{atual ? atual.nome : "Selecionar…"}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] rounded-[16px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Pesquisar paciente…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Nenhum paciente encontrado.</CommandEmpty>
            {pacientes.map((p) => (
              <CommandItem
                key={p.id}
                // cmdk filtra por este texto: nome, código e CPF (com e sem pontuação)
                value={`${p.nome} ${p.codigo} ${p.cpf ?? ""} ${(p.cpf ?? "").replace(/\D/g, "")} ${p.id}`}
                onSelect={() => {
                  onChange(p.id);
                  setAberto(false);
                }}
                className="flex items-start gap-2 rounded-[12px] px-3 py-2"
              >
                <Check className={cn("mt-1 size-4 shrink-0", p.id === valor ? "opacity-100" : "opacity-0")} />
                <div className="min-w-0">
                  <p className="truncate">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">{detalhe(p)}</p>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
