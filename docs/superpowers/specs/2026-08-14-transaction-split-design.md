# Split de Transação com Terceiros — Design

**Date:** 2026-08-14
**Status:** Approved

## Summary

Uma transação pode ter uma parte que é de outra pessoa: você paga o valor inteiro
no cartão, mas uma porcentagem é devida por alguém (ex: uma compra dividida com
um amigo). O split é uma anotação opcional por transação — no máximo uma pessoa,
uma porcentagem — que não muda o gasto/orçamento/projeção de poupança (o dinheiro
saiu inteiro do seu cartão, então o valor total continua contando para tudo isso,
igual ao carryover de orçamento hoje). O que o split alimenta é uma lista de
"a receber": quanto cada pessoa te deve, com um jeito de marcar como recebido
quando ela te paga de volta.

## Data model

Segue dois padrões que o schema já usa: soft-delete via `active` (como
`categories`/`cards`, para não quebrar transações passadas se a pessoa for
removida) e vínculo opcional como coluna direta em `transactions` (como
`installment_group_id`/`recurring_template_id`, já que é 1 transação : 0..1
split — não justifica tabela lateral):

```sql
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE transactions ADD COLUMN split_person_id INTEGER REFERENCES people(id);
ALTER TABLE transactions ADD COLUMN split_percent INTEGER;      -- 1–99, inteiro
ALTER TABLE transactions ADD COLUMN split_received INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_tx_split_person ON transactions(split_person_id);
```

Os três campos de split são `NULL`/`0` juntos ou preenchidos juntos —
`split_person_id` é a fonte da verdade de "esta transação tem split"
(`split_percent` sempre acompanha).

O valor a receber **nunca é gravado** — é sempre `amount_cents * split_percent / 100`,
calculado na hora de ler. Gravar o valor seria uma segunda fonte de verdade que
diverge assim que a transação é editada (valor mudou, split não foi recalculado).
`split_percent` é validado como inteiro `1..99` (0 e 100 não fazem sentido como
split — 0 é "não tem split", 100 seria "a transação inteira é da outra pessoa",
o que este design não cobre: quem paga sempre fica com uma parte).

## Domain layer

`src/domain/entities/index.ts`:

```ts
export interface Person {
  id: number;
  name: string;
  active: boolean;
}
```

`Transaction` ganha três campos opcionais: `split_person_id?: number`,
`split_percent?: number`, `split_received: boolean`.

`src/domain/ports/index.ts`:

```ts
export interface PersonRepository {
  list(includeInactive?: boolean): Person[];
  findById(id: number): Person | undefined;
  create(name: string): Person;
  update(id: number, patch: { name?: string; active?: boolean }): void;
}
```

`TransactionRepository` ganha:

```ts
setSplitReceived(id: number, received: boolean): void;
listReceivables(): Array<{
  transaction_id: number;
  person_id: number;
  person_name: string;
  description: string;
  month: string;
  amount_cents: number;   // já calculado: amount_cents * split_percent / 100
  received: boolean;
}>;
```

## API

**Pessoas** — mesmo CRUD que `categories`/`cards` já têm:

- `GET /api/people` — lista (só `active` por padrão, como categorias/cartões).
- `POST /api/people` — cria `{ name }`.
- `PUT /api/people/:id` — edita `{ name, active }`.

**Transações** — `POST /api/transactions` e `PUT /api/transactions/:id` ganham
`split_person_id?`, `split_percent?` no corpo (schema: os dois juntos ou nenhum
dos dois; `split_percent` inteiro `1..99` quando presente). Editar uma transação
para remover o split é enviar os dois como `null`/ausentes.

- `POST /api/transactions/:id/split-received` — marca `split_received=1`.
  Erro 400 se a transação não tem split.
- `DELETE /api/transactions/:id/split-received` — desmarca (volta a pendente),
  para o caso de marcar errado.
- `GET /api/transactions/receivables` — **sem filtro de mês**: uma dívida de
  fevereiro continua valendo em abril. Retorna todos os splits (pendentes e
  recebidos recentemente, ver UI abaixo), cada um com pessoa, descrição, mês da
  transação original, e valor calculado.

## UI — Registrar

No formulário de transação (`registrar.js`), um terceiro toggle ao lado de
"+ dividir em N vezes" / "+ repete todo mês": **"+ dividir com alguém"**. Abre
um campo de pessoa (mesmo padrão de autocomplete + auto-criar por nome que
categoria/cartão já usam, via `ensureId('/api/people', ...)`) e um campo de
porcentagem. Funciona em criação e em edição — `startEdit` pré-popula os campos
quando a transação editada já tem split; `resetForm` limpa os três campos de
split junto com os de parcelamento/recorrência.

Na lista de transações (`renderRows`), uma transação com split ganha uma tag
igual à de parcelamento (`r.installment_no ? ... : ''`), ex: `50% Fulano`.

## UI — Acompanhar (dashboard)

Painel novo, carregado à parte do resto do dashboard (mesmo padrão de
`loadCommitments`: chamada assíncrona própria, erro não derruba o resto da
tela). Só aparece quando há pelo menos um split pendente. Mostra:

- Total pendente no topo (soma de todos os `received: false`).
- Uma linha por split pendente: pessoa, descrição da transação, mês, valor,
  botão "marcar recebido".
- Splits já recebidos não aparecem na lista por padrão (a tela é sobre o que
  falta receber, não um histórico) — sem seção de "recebidos" nesta fatia.

## O que este design deliberadamente não faz

- Não divide entre mais de uma pessoa por transação (decisão explícita: cobre
  "uma parte sua, outra de alguém", não rateio em grupo).
- Não aceita valor fixo em R$, só porcentagem — o valor a receber sempre deriva
  do valor da transação.
- Não muda `spent_cents`, `remaining_cents`, `can_spend_cents` ou
  `projected_savings_cents` em lugar nenhum — o split é overlay puro, igual ao
  carryover de orçamento (`docs/superpowers/specs/2026-06-19-budget-carryover-design.md`).
- Não cria histórico de "quem recebeu quando" além do booleano — marcar como
  recebido não grava data/valor recebido separadamente.

## Testing

- Novo `test/people.test.ts`: CRUD do repositório/use case, `active=false` some
  da listagem padrão mas a pessoa continua resolvível por id (transações
  antigas continuam mostrando o nome).
- `test/transactions.test.ts`: criar/editar transação com `split_person_id` +
  `split_percent` grava os três campos; enviar só um dos dois é erro de
  schema; `split_percent` fora de `1..99` é erro; remover o split (campos
  `null`) funciona na edição.
- Novo teste para `listReceivables`: valor calculado bate com
  `amount_cents * split_percent / 100`; `split-received` (POST/DELETE) reflete
  no `received` da próxima listagem; transações sem split não aparecem.
- Regressão: `dashboard.test.ts` / `bi.test.ts` continuam passando sem
  alteração — nenhum split muda `spent_cents` ou a projeção.
- `test/registrarRender.test.ts` (ou equivalente): tag de split aparece na
  linha da transação; `resetForm` limpa os campos de split.
