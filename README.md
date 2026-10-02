# Controle de Aplicações

Sistema interno para controlar aplicações de medicação injetável: o que o paciente comprou,
a prescrição por semanas, a aplicação feita pela enfermagem e a baixa do estoque por lote.

Projeto no Lovable: https://lovable.dev/projects/9cec097d-16ea-4ae1-9948-7e39468df4c5
O código é editado por este repositório; cada push na `main` sincroniza com o Lovable.

## Fase 1 (o que existe)

- Cadastros: produtos (unidade de estoque única), procedimentos (código PROC-0001) e composição
- Estoque: entrada de lote, ajuste com motivo, saldo por produto, alertas de mínimo e vencimento
- Plano do paciente: itens comprados, prescrição por semanas (chips, distribuição automática, arrastar)
- Aplicação: dose real, lote sugerido por validade mais próxima, baixa numa única transação no banco
- Pular semana (empurra as seguintes), editar dose e cancelar com senha de edição
- Saldo (contratado x prescrito x aplicado) e progresso calculados por visões no banco
- Equipe: primeiro usuário vira admin; os demais entram bloqueados até o admin liberar

Fora da fase 1: orçamento com pagamentos, nota fiscal, descontos, cashback, recibo, importação por
Excel, acompanhamento e encerramento com saldo importado para novo orçamento.

## Banco de dados

Tudo está em `supabase/migrations/`. Regras que ficam no banco (não na tela):

| Função | O que faz |
|---|---|
| `realizar_aplicacao` | Grava aplicação, itens, consumo por lote, baixa o lote e o movimento — tudo ou nada |
| `pular_semana` | Marca a semana como pulada e empurra as doses seguintes |
| `editar_dose_aplicacao` | Exige senha; ajusta o lote pela diferença |
| `cancelar_aplicacao` | Exige senha; devolve ao lote (estorno) ou desfaz a semana pulada |
| `salvar_prescricao` | Regrava doses previstas; trava semanas feitas; bloqueia o que excede o contratado |
| `entrada_lote` / `ajustar_lote` | Entrada e ajuste de estoque com movimento e auditoria |

Toda ação sensível grava em `audit_log` quem fez, quando e o motivo.

Regra de consumo: produto na mesma unidade da dose (UI ou mL) consome a dose aplicada;
nos demais casos consome a quantidade padrão da composição.

**Dados de paciente reais nunca entram neste repositório.**
