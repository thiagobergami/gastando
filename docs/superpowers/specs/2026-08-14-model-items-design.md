# Detalhamento de Renda e Custos Fixos (`model_items`) — Design

**Date:** 2026-08-14
**Status:** Approved

## Summary

Hoje `income_cents` e `fixed_costs_cents` são números únicos, digitados à mão no
passo 3 da revisão mensal (`decidir.js`) e congelados por mês em `monthly_model`
(carry-forward, v0.3 §9). Essa fatia troca o campo único por uma lista de itens —
"de onde vem cada parte da renda" e "para onde vai cada parte do custo fixo" — sem
mudar o congelamento por mês que já existe: o total continua sendo o que entra no
histórico, só que agora é a soma dos itens em vez de um número solto.

Os itens **não geram transações**. O app já tem um aviso explícito no passo 3 hoje
("Não lance esses valores também como transação — se lançar, eles seriam
descontados duas vezes da sua poupança"), porque a projeção de poupança usa
`income - fixed - spent_cents` (`bi.ts`), que já conta o gasto do mês separadamente.
`recurring_templates` foi cogitado como base para os itens de custo fixo e
descartado por esse motivo: ele materializa transações reais via "Materializar
este mês", o que duplicaria a conta. `model_items` é deliberadamente paralelo e
desconectado de `recurring_templates` e de `transactions`.

## Data model

Uma tabela nova, compartilhada pelos dois tipos — mesma forma, papéis diferentes:

```sql
CREATE TABLE model_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'fixed_cost')),
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_model_items_kind ON model_items(kind, sort_order);
```

Sem `active` (remover é excluir a linha), sem `category_id`, sem vínculo com
`transactions` ou `recurring_templates`. Sem histórico próprio: `model_items`
guarda o estado **atual**, igual a `recurring_templates` guarda o estado atual dos
recorrentes. Quem já guarda história é `monthly_model` — editar um item de custo
fixo hoje não reescreve o total congelado de meses passados, só muda o que a
próxima revisão mensal vai somar e congelar.

## Domain layer

`src/domain/entities/index.ts` ganha:

```ts
export interface ModelItem {
  id: number;
  kind: 'income' | 'fixed_cost';
  name: string;
  amount_cents: number;
  sort_order: number;
}
```

`src/domain/ports/index.ts` ganha:

```ts
export interface ModelItemRepository {
  listByKind(kind: ModelItem['kind']): ModelItem[];
  create(item: Omit<ModelItem, 'id'>): ModelItem;
  update(id: number, item: Omit<ModelItem, 'id' | 'kind'>): void;
  delete(id: number): void;
  sumByKind(kind: ModelItem['kind']): number; // amount_cents, 0 se vazio
}
```

`sumByKind` existe como método próprio (em vez de somar em memória depois de
`listByKind`) porque é exatamente o que o passo 3 precisa para calcular
`income_cents`/`fixed_costs_cents` no servidor — ver próxima seção.

## API

Novo router `model-items`, mesmo padrão dos demais (`categories`, `recurring`):

- `GET /api/model-items?kind=income|fixed_cost` — lista os itens do tipo, ordenados
  por `sort_order`.
- `POST /api/model-items` — cria `{ kind, name, amount_cents }`.
- `PUT /api/model-items/:id` — edita `{ name, amount_cents }` (kind não muda depois
  de criado — trocar de renda para custo fixo é excluir e recriar).
- `DELETE /api/model-items/:id` — remove.

`kind` é obrigatório em `POST` e validado contra `['income', 'fixed_cost']`;
`amount_cents` é `zNonNegInt` como os demais valores monetários do app.

## Cálculo do total no servidor

`PUT /api/monthly-model` deixa de aceitar `income_cents` e `fixed_costs_cents` do
cliente. O schema (`src/adapters/http/schemas/monthlyModel.ts`) passa a exigir só
`month` e `savings_goal_cents`. No use case (`src/application/use-cases/model.ts`),
`set()` chama `modelItems.sumByKind('income')` e `modelItems.sumByKind('fixed_cost')`
para preencher os dois campos antes de gravar em `monthly_model` — o mesmo
`upsert` de hoje, só que os valores vêm da soma dos itens em vez do payload.

Isso garante que o número congelado no histórico nunca diverge da lista de itens
que o gerou: não há um segundo caminho pelo qual `income_cents`/`fixed_costs_cents`
possam ser gravados com um valor que a lista de itens não sustenta.

`resolve()` não muda — carry-forward e os degraus de fallback (`month` → `carry` →
`settings` → `none`) continuam iguais, porque quem eles resolvem é a tabela
`monthly_model`, não `model_items`.

## UI — passo 3 da revisão (`decidir.js`)

Os campos únicos "Renda mensal" e "Custos fixos" (`renderStep3`, `decidir.js:99-116`)
viram duas listas editáveis lado a lado — uma por `kind` — cada linha com nome e
valor, um botão "+ adicionar" no rodapé de cada lista e um botão de remover por
linha. Cada lista mostra o subtotal calculado embaixo (soma client-side dos itens
visíveis, para feedback imediato). "Meta de poupança" continua um campo único
como hoje.

Fluxo:

1. Ao entrar no passo 3, `renderStep3` busca `GET /api/model-items?kind=income` e
   `GET /api/model-items?kind=fixed_cost` (além do `GET /api/monthly-model` que já
   busca hoje, agora só para ler `savings_goal_cents` e popular o campo de meta).
2. Adicionar/editar/remover uma linha chama a API de `model-items` imediatamente
   (sem esperar o "Salvar" do passo) — mesma filosofia de "sem modal, some direto"
   que o resto do app já usa (ex: exclusão de transação). `paintCanSpend` recalcula
   o "posso gastar" a cada mudança, somando os itens em memória.
3. Ao avançar do passo 3 (`saveModel`, hoje disparado ao sair do passo — ver
   `decidir.js:363`), `PUT /api/monthly-model` é chamado só com
   `{ month, savings_goal_cents }`; o servidor recalcula e congela os totais como
   descrito acima.

O aviso existente ("Custos fixos são o que sai todo mês sem passar pelo seu
julgamento... Não lance esses valores também como transação") permanece, adaptado
para o contexto de lista: continua valendo linha a linha.

## Migration

Nova migration `009_model_items.sql`, cria a tabela e o índice acima. Sem
migração de dados: quem já tem um total configurado em `settings`/`monthly_model`
começa com as duas listas vazias (soma 0) e precisa recriar os itens na próxima
revisão mensal — os totais de **meses passados** continuam congelados em
`monthly_model` e não são afetados. O mês corrente/futuro só ganha um total > 0
depois que a pessoa adicionar pelo menos um item de cada lista e salvar o passo 3
de novo.

## Testing

- `test/model.test.ts` (use case): `set()` ignora `income_cents`/`fixed_costs_cents`
  do input e grava a soma real de `model_items` para cada `kind`; lista vazia grava
  0, igual ao comportamento atual quando nada foi configurado.
- Novo `test/modelItems.test.ts`: CRUD do repositório e do use case —
  `sumByKind` soma corretamente, soma 0 quando vazio, `delete` reflete na próxima
  soma, itens de `kind` diferente não se misturam na mesma soma.
- Schema: `PUT /api/monthly-model` com `income_cents`/`fixed_costs_cents` no corpo
  não quebra (campos extras ignorados por Zod `strip` padrão) nem tem efeito — o
  valor gravado vem sempre da soma dos itens.
- `test/decidirRender.test.ts` (ou equivalente): passo 3 renderiza as duas listas
  a partir de `model_items`, soma client-side bate com o `sumByKind` do servidor,
  remover a última linha de uma lista deixa o subtotal em R$ 0,00.
- Regressão: `bi.test.ts` / `dashboard.test.ts` continuam passando sem alteração —
  `resolve()` e a fórmula de projeção não mudam de contrato, só a origem dos
  números gravados em `monthly_model`.
