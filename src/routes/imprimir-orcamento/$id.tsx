import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, parseISO } from "date-fns";
import { Printer } from "lucide-react";

import { descreverQuantidade, useOrcamento } from "@/components/orcamento/dados";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { brl, data } from "@/lib/format";
import { usePerfis } from "@/lib/queries";
import { check, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/imprimir-orcamento/$id")({
  head: () => ({ meta: [{ title: "Orçamento" }] }),
  component: Imprimir,
});

type Clinica = { clinica_nome: string | null; clinica_rodape: string | null };

function Imprimir() {
  const { id } = Route.useParams();
  const { carregando, session } = useAuth();
  const { data: dados, isLoading } = useOrcamento(id);
  const { data: perfis = [] } = usePerfis();
  const { data: clinica } = useQuery({
    queryKey: ["dados_clinica"],
    enabled: Boolean(session),
    queryFn: async () => ((check(await supabase.rpc("dados_clinica")) as Clinica[])[0] ?? null) as Clinica | null,
  });

  if (carregando || isLoading) return <p className="p-10 text-sm text-muted-foreground">Carregando…</p>;
  if (!session || !dados) return <p className="p-10 text-sm">Entre no sistema para ver este orçamento.</p>;

  const { quote, paciente, itens, descontos, total } = dados;
  const medico = perfis.find((p) => p.id === quote.medico_id);
  const emissao = quote.created_at.slice(0, 10);
  const validade = format(addDays(parseISO(emissao), 7), "yyyy-MM-dd");

  return (
    <div className="min-h-screen bg-muted/40 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <Button onClick={() => window.print()}>
          <Printer /> Imprimir ou salvar PDF
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] bg-white px-12 py-10 text-[13px] leading-relaxed text-neutral-900 shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="mb-8 flex items-start justify-between gap-6 border-b border-neutral-300 pb-6">
          <div>
            {clinica?.clinica_nome && <p className="text-lg font-semibold">{clinica.clinica_nome}</p>}
            <p className="text-neutral-500">Orçamento de tratamento</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Nº {quote.numero}</p>
            <p className="text-neutral-500">{data(quote.created_at.slice(0, 10))}</p>
          </div>
        </header>

        <div className="mb-6 grid gap-1">
          <p>
            <span className="text-neutral-500">Paciente: </span>
            <strong>{paciente.nome}</strong>
          </p>
          {medico && (
            <p>
              <span className="text-neutral-500">Médico(a) responsável: </span>
              {medico.nome}
              {medico.registro_profissional && ` · ${medico.registro_profissional}`}
            </p>
          )}
        </div>

        <table className="mb-6 w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-500">
              <th className="py-2 font-medium">Procedimento</th>
              <th className="py-2 font-medium">Quantidade</th>
              <th className="py-2 text-right font-medium">Valor unit.</th>
              <th className="py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-b border-neutral-200">
                <td className="py-2">{i.descricao}</td>
                <td className="py-2">{descreverQuantidade(i)}</td>
                <td className="py-2 text-right">{brl(i.preco_unitario)}</td>
                <td className="py-2 text-right">{brl(i.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-72 space-y-1">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{brl(total.subtotal)}</span>
          </div>
          {descontos.map((d) => (
            <div key={d.id} className="flex justify-between text-neutral-600">
              <span>
                {d.motivo}
                {d.tipo === "percentual" && ` (${Number(d.valor).toLocaleString("pt-BR")}%)`}
              </span>
              <span>− {brl(d.valor_reais)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-neutral-300 pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{brl(total.total)}</span>
          </div>
        </div>

        <p className="mt-6 text-neutral-600">
          Orçamento válido por 7 dias, até {data(validade)}.
        </p>

        {quote.observacoes && (
          <section className="mt-8">
            <p className="mb-1 font-medium">Observações</p>
            <p className="whitespace-pre-wrap">{quote.observacoes}</p>
          </section>
        )}

        {clinica?.clinica_rodape && (
          <footer className="mt-12 border-t border-neutral-300 pt-4 text-xs whitespace-pre-wrap text-neutral-500">
            {clinica.clinica_rodape}
          </footer>
        )}
      </article>
    </div>
  );
}
