# Gastando v0.3 — Fatia 3: Decidir — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o loop da v0.3 — dar história ao modelo de poupança, transformar a Análise numa pauta de cinco perguntas em português e criar a revisão mensal em cinco passos na tela nova `decidir.html`.

**Architecture:** Backend ganha **uma tabela** (`monthly_model`, uma linha por mês, espelhando `category_limits`), **um repositório**, **um use case** (`model.ts`, com a cadeia de resolução mês → mês anterior → `settings` → zeros), **uma consulta** (`ReportRepository.committedSpendMonth`) e **quatro rotas**. Front-end ganha dois módulos de funções puras (`pauta.js`, `review.js`) mais duas cascas finas de wiring (`analise.js` reescrito, `decidir.js` novo), no mesmo padrão das fatias anteriores: funções puras que devolvem HTML, testadas em `node:test` sem DOM, e o wiring no fim do arquivo atrás de `if (typeof document !== 'undefined' && ...)`. A arquitetura hexagonal não muda: nada novo atravessa camada.

**Tech Stack:** TypeScript + Express 5 + better-sqlite3 + zod no backend; JavaScript ES modules servidos estaticamente (sem build de front-end) + Tailwind + Chart.js 4 no front-end; `node:test` + `supertest` para testes; Biome para lint/format.

## Global Constraints

- **Todo texto de UI em pt-BR.** Inclusive os nomes das séries que saem do backend e aparecem em legenda de gráfico.
- **Serene Ledger fica.** Nenhuma troca de paleta, de tipografia ou de token. Usar as classes existentes: `paper-card`, `field`, `label-caps`, `btn-primary`, `btn-ghost`, `bottom-nav`, `meter`, `meter-fill`, `pill`, `tag`, `step-indicator`, `step`, `step-no`, `step-active`, `step-done`, e as cores `text-ink`, `text-ink-mut`, `text-sage`, `text-clay`, `border-line`, `bg-card`, `bg-paper`.
- **Dinheiro é sempre inteiro em centavos.** Nunca `float`. Conversão só na borda da UI, via `format.js`.
- **Sinais aritméticos usam o glifo `−` (U+2212), não o hífen ASCII.** Vale para as variações (`+ R$ 268,00` / `− R$ 142,00`), os percentuais (`−6%`) e a fórmula do passo 3 (`12.000 − 3.860 − 2.500`). `formatBRL` continua com hífen ASCII para valores negativos e **não** é usada para renderizar variações — variações renderizam sinal separado + `formatBRL(Math.abs(delta))`.
- **Nenhuma capacidade é perdida.** `savings-trend`, `by-card`, `budget-vs-actual`, `installment-forecast` e `category-trend` continuam servidos e testados mesmo quando perdem card próprio. `parcelas.html`, `recurring.html` e `simulate.html` continuam existindo.
- **`npm test`, `npm run typecheck` e `npm run lint` limpos ao fim de cada task.** `lint` é `biome check .` e cobre `public/` também.
- **CSS:** só `public/css/tailwind.src.css` é versionado; `public/css/app.css` está no `.gitignore`. Depois de mexer no CSS, rodar `npm run build:css` para ver o resultado no navegador — mas **não** commitar `app.css`.
- **Commits em inglês, no imperativo**, seguindo o histórico do repo (`feat(ui): ...`, `feat(api): ...`, `refactor: ...`, `chore(ui): ...`).

---

## Decisões tomadas nesta sessão

O design (`docs/superpowers/specs/2026-08-08-v03-fatia-3-decidir-design.md` §C) deixou seis pontos em aberto. Todos estão fechados:

| § | Pergunta | Decisão |
|---|---|---|
| C.1 | `essential` entra em "comprometido"? | **Não.** Comprometido = `installment_group_id IS NOT NULL OR recurring_template_id IS NOT NULL`. A legenda desenhada no Figma (`15:3`) é literal: *"Comprometido — parcelas e recorrentes"*. Mercado e Transporte são discricionários. |
| C.2 | Os três gráficos que não são perguntas | **A Análise tem exatamente cinco cards**, como o frame `15:3`. Previsão de parcelas, orçamento-vs-real **e gasto por cartão** saem da Análise. Nenhum endpoint é removido. |
| C.3 | Qual mês a revisão revisa | **Sempre o mês anterior.** `reviewMonths(hoje) = { closed: mês(hoje) − 1, opening: mês(hoje) }`, sem esperteza de fim de mês. O seletor no cabeçalho cobre quem faz a revisão fora de hora. |
| C.4 | Custos fixos contados duas vezes | **Aviso no passo 3.** O campo `Custos fixos` continua; o passo 3 ganha uma linha explícita dizendo que custos fixos não devem ser lançados como transação. Nenhuma mudança de modelo. |
| C.5 | Adendo à spec §11 | **Sim** — Task 2 acrescenta as duas linhas de `/api/monthly-model` a `docs/spec-v0.3.md` §11. |
| C.6 | Existem frames no Figma? | **Existem.** A enumeração de páginas da API é incompleta; `figma.root.children` devolve tudo. Ver a tabela abaixo. |

### Frames do Figma (arquivo `CBcJpLlGqbQ6WVCNUWLjyk`)

| Frame | node-id | Usado por |
|---|---|---|
| `Análise — Desktop` | `15:3` | Task 7 |
| `Decidir — Passo 1` | `18:3` | Task 9 |
| `Decidir — Passo 3` | `19:12` | Task 10 |
| `Decidir — Passo 4` | `19:70` | Task 10 |
| `Análise — Mobile` | `24:70` | Task 7 |
| `Decidir — Mobile` | `25:86` | Task 8, Task 9 |

---

## Correções que os frames impuseram ao design

O design §B foi escrito antes de os frames serem lidos. Estas divergências **são o alvo** — onde o design e o frame discordam, vale o frame:

1. **A pauta não é uma galeria de cinco `lineChart`.** Só *uma* das cinco perguntas é um gráfico de linha. Duas são barras empilhadas em HTML puro (sem Chart.js), uma é uma lista de linhas, e uma é um gráfico de colunas com linha de meta tracejada.
2. **"O que mais mudou este mês?" é uma lista ranqueada de até quatro categorias**, cada uma com variação em R$ e em %. O design §B.5 previa `biggestChange(trends)` devolvendo *uma* categoria. A função vira `changes(trends, limit)` devolvendo a lista ordenada; o "maior" é `changes(trends)[0]`, que é o que a tile MAIOR MUDANÇA do passo 1 consome.
3. **"Quanto do meu gasto já é compromisso assumido?" é uma barra empilhada de um mês só**, não duas linhas ao longo do tempo. O endpoint continua devolvendo a série por mês (é o que o torna testável e reaproveitável); o card renderiza o mês final do intervalo.
4. **O passo 1 do Decidir não embute a pauta inteira.** O frame `18:3` mostra três tiles — GASTOU, GUARDOU, MAIOR MUDANÇA — e um link *"Ver a análise completa dos seis meses →"*. Isto é bem menos código do que o design §B.4 previa.
5. **O passo 4 tem uma sugestão por linha, não duas.** O frame `19:70` mostra um chip tracejado `média 3m · R$ 720,00`. O `last_month_cents` já aparece na própria linha como `gastou R$ 712,00` — um botão "usar mês anterior" repetiria um número que está a três centímetros dele.
6. **A trilha de passos vira barra de progresso no mobile.** O frame `25:86` troca as cinco pílulas por `PASSO 3 DE 5 · SEU MODELO` + `60%` + barra. Mesmo padrão de `chrome.js`: renderiza os dois e alterna com `hidden md:flex` / `md:hidden`.
7. **`topSeries` e `aggregateSeries` morrem.** `topSeries` já era código morto (design §A.1); `aggregateSeries` só tinha o card de gasto-por-cartão como chamador, que sai na Task 7.

### Divergências deliberadas em relação ao Figma

Registradas aqui uma vez para não serem re-litigadas em cada task:

1. **A Análise mantém o seletor De/Até.** O frame `15:3` não tem seletor — só a frase `Março a agosto de 2026 · seis meses de histórico`. Escolher intervalo é capacidade existente e o design §4 proíbe perdê-la. O card de seletor fica como está hoje, e a frase é acrescentada sob o `<h1>`, derivada do intervalo real. É o mesmo precedente da Fatia 2 (divergência #2 daquele plano: "a barra de filtros continua").
2. **`seis meses de histórico` usa numeral por extenso só de 1 a 12.** Fora dessa faixa a frase usa o algarismo. Um `NUM_WORDS` de doze entradas é mais barato que perder a cadência do texto desenhado.
3. **Os números do frame não fecham entre si** (`CUSTOS FIXOS R$ 3.860,00` é o mesmo valor de `GASTOU R$ 3.860,00`, e `GUARDOU R$ 2.780,00` não é `12.000 − 3.860 − 3.860`). São valores ilustrativos. A aritmética vale mais que o rótulo desenhado.

---

## O que acontece com quem já usa o app

O runner (`src/infra/db.ts`) registra migrações **por nome, sem checksum**, numa
tabela `schema_migrations` que existe desde o primeiro commit do banco
(`805a11e`) — nenhuma instalação é anterior a ela. Ao abrir a versão nova, o
runner roda só os arquivos ainda não registrados, cada um numa transação. O
banco vive em `data/gastando.db` ao lado do executável (`resolveDbPath`), então
substituir o binário não move nem toca o arquivo.

Os quatro cenários foram simulados com o runner real antes de este plano ser
fechado:

| Cenário | Entra com | Sai com |
|---|---|---|
| **v0.2** | 001–005, seed pessoal (15 categorias, 15 limites, 3 cartões), renda de R$ 14.350 | 006/007/008 aplicadas. Categorias, limites, cartões e transações **intactos**; 007 não faz nada porque já há categorias; 008 semeia o modelo a partir da renda que já estava lá |
| **v0.3 Fatia 1/2 com modelo** | 001–007, renda configurada | 008 aplicada, uma linha em `monthly_model` ancorada no primeiro mês lançado |
| **v0.3 sem renda** | 001–007, `settings` vazia | 008 aplicada, `monthly_model` **vazia** — resolve por zeros até a primeira revisão |
| **Instalação nova** | banco inexistente | 001–008 na ordem, 8 categorias genéricas, nada pessoal |

Reabrir o app duas vezes seguidas não duplica nada: 008 fica registrada e não
roda de novo.

### Como isso chega ao usuário

**Ele não executa nada.** Merge em `main` dispara `auto-release.yml`, que
incrementa o patch, cria a tag e chama `release.yml`; este compila um binário por
plataforma com `pkg` e anexa ao GitHub Release. O usuário baixa o executável,
coloca-o **na pasta onde já roda o app** e abre. `server.ts` chama
`runMigrations(db)` antes de `listen`, então a 008 é aplicada no arranque, antes
da primeira requisição. Não há comando de migração, flag, prompt ou passo manual.

As migrações viajam dentro do binário como assets do `pkg`
(`package.json → pkg.assets: ["migrations/**/*"]`). Isso foi verificado num
binário empacotado de verdade: de `/snapshot/gastando/dist/infra`, o
`path.join(__dirname, '..', '..', 'migrations')` de `runMigrations` resolve para
`/snapshot/gastando/migrations`, e `readdirSync` lista os sete `.sql` e
`readFileSync` os lê. A 008 entra nessa lista sem nenhuma mudança de configuração.

Os dois furos nesse caminho — o README não ter seção de atualização, e o smoke
test de release não conseguir detectar uma cadeia de migrações que não rodou —
estão cobertos pela **Task 12**.

**A limitação herdada, que a Fatia 3 não resolve:** o usuário de v0.2 que
renomeou o grupo `Essenciais / semi-fixos` sai da migração com `essential = 0`
em todas as categorias — o backfill da 006 casa pelo nome do grupo. Isso está
documentado na spec §10 e a correção é manual, em Configurações. Nesta fatia a
consequência é menor do que era: a decisão C.1 tirou `essential` da definição de
"comprometido", então a pauta da Análise não depende mais dele.

---

## Estrutura de arquivos

### Back-end

| Arquivo | Responsabilidade |
|---|---|
| `migrations/008_monthly_model.sql` | *(novo)* Tabela `monthly_model` + backfill do mês corrente para quem já configurou. |
| `src/domain/entities/index.ts` | *(modificado)* `MonthlyModel` e `ResolvedModel`. |
| `src/domain/ports/index.ts` | *(modificado)* `MonthlyModelRepository`; `ReportRepository.committedSpendMonth`. |
| `src/infra/repositories/monthlyModel.ts` | *(novo)* SQL da tabela nova: `findAtOrBefore`, `upsert`. |
| `src/infra/repositories/reports.ts` | *(modificado)* `committedSpendMonth`. |
| `src/application/use-cases/model.ts` | *(novo)* `resolve(month)` (cadeia de fallback) e `set(month, input)` (grava nos dois lugares). Exporta o tipo `ModelResolver`. |
| `src/application/use-cases/bi.ts` | *(modificado)* `committedVsDiscretionary`, `savingsRealized`, séries antigas em pt-BR. |
| `src/adapters/http/schemas/monthlyModel.ts` | *(novo)* Schema do corpo do PUT. |
| `src/adapters/http/controllers/monthlyModel.ts` | *(novo)* `GET /` e `PUT /`. |
| `src/adapters/http/controllers/bi.ts` | *(modificado)* Duas rotas. |
| `src/infra/composition.ts` | *(modificado)* Fiação do repositório, do use case e do controller. |
| `src/app.ts` | *(modificado)* Monta `/api/monthly-model`. |
| `docs/spec-v0.3.md` | *(modificado)* Adendo §11 (§C.5 do design). |

### Front-end

| Arquivo | Responsabilidade |
|---|---|
| `public/js/format.js` | *(modificado)* Ganha `MONTHS_LONG` e `monthName`. |
| `public/js/pauta.js` | *(novo)* Funções puras dos cinco cards da Análise: moldura, composição, totais, veredito, variações, split comprometido/discricionário, frase de intervalo. |
| `public/js/charts.js` | *(modificado)* Ganha `savingsChart`; perde `topSeries` e `aggregateSeries`. |
| `public/analise.html` | *(modificado)* Cinco cards, frase de intervalo, um `<canvas>` a menos. |
| `public/js/analise.js` | *(reescrito)* Wiring da pauta. |
| `public/js/review.js` | *(novo)* Funções puras da revisão: meses, trilha, ordenação de orçamentos, resumo do modelo, linhas do fim. |
| `public/decidir.html` | *(novo)* Casca da revisão: cabeçalho, trilha, corpo do passo, rodapé. |
| `public/js/decidir.js` | *(novo)* Wiring dos cinco passos e do fim. |
| `public/js/chrome.js` | *(modificado)* `Decidir` → `/decidir.html`. |
| `public/js/dashboard.js` | *(modificado)* `monthLabel` passa a usar `monthName`; o convite aponta para `decidir.html`. |
| `public/js/category.js` | *(modificado)* Série `'Limit'` → `'Limite'`; resumo em pt-BR. |
| `public/css/tailwind.src.css` | *(modificado)* `.step-*` reescritas para as pílulas do frame; `.stat-tile` e `.chip-suggest` novas. |

### Testes

| Arquivo | O que cobre |
|---|---|
| `test/migrations.test.ts` | *(modificado)* Migração 008 nos três cenários. |
| `test/model.test.ts` | *(novo)* Cadeia de resolução e gravação dupla, via HTTP. |
| `test/bi.test.ts` | *(modificado)* Séries em pt-BR; `committed-vs-discretionary`; `savings-realized` e a regressão do §A.2. |
| `test/pauta.test.ts` | *(novo)* As funções puras de `pauta.js`. |
| `test/review.test.ts` | *(novo)* As funções puras de `review.js`. |
| `test/biChart.test.ts` | *(modificado)* Perde os testes dos helpers mortos. |
| `test/categoryRender.test.ts` | *(modificado)* Resumo em pt-BR. |
| `test/chrome.test.ts` | *(modificado)* `Decidir` aponta para `/decidir.html`. |
| `test/app.test.ts` | *(modificado)* `/decidir.html` é servida. |

---

## Task 1: Migração 008 e a cadeia de resolução do modelo

O modelo de poupança ganha história. Primeiro porque tudo depois depende dele: a poupança realizada (Task 4) e o passo 3 da revisão (Task 10) leem daqui.

**Files:**
- Create: `migrations/008_monthly_model.sql`
- Create: `src/infra/repositories/monthlyModel.ts`
- Create: `src/application/use-cases/model.ts`
- Modify: `src/domain/entities/index.ts` (fim do arquivo)
- Modify: `src/domain/ports/index.ts` (fim do arquivo)
- Modify: `src/infra/composition.ts:51-60` e `62-103`
- Test: `test/migrations.test.ts:12-24` (generalizar o hook de seed) e fim do arquivo

**Interfaces:**
- Consumes: `SettingsRepository.get(key)`, `SettingsRepository.setMany(entries)` — já existem.
- Produces:
  - `interface MonthlyModel { month: string; income_cents: number; fixed_costs_cents: number; savings_goal_cents: number }`
  - `interface ResolvedModel extends MonthlyModel { source: 'month' | 'carry' | 'settings' | 'none' }`
  - `interface MonthlyModelRepository { findAtOrBefore(month: string): MonthlyModel | undefined; findExact(month: string): MonthlyModel | undefined; upsert(m: MonthlyModel): void }`
  - `makeModelUseCases({ monthlyModel, settings })` → `{ resolve(month: string): ResolvedModel; set(month: string, input: { income_cents: number; fixed_costs_cents: number; savings_goal_cents: number }): ResolvedModel }`
  - `interface ModelResolver { resolve(month: string): ResolvedModel }` — exportado de `use-cases/model.ts`, é o contrato estreito que `bi.ts` vai consumir na Task 4.

- [ ] **Step 1: Generalizar o hook de seed do teste de migrações**

`migrate()` hoje só sabe injetar dados antes de `006_category_essential.sql`. A 008 precisa de `settings` populada antes de rodar. Em `test/migrations.test.ts`, substituir as linhas 12–24 por:

```ts
// Roda as migrações, na ordem, num banco em memória — como o runner real.
// `002_seed.sql` fica de fora pelo mesmo motivo que em test/helpers.ts: ele
// semeia dados, e um teste de schema não deve depender de quantos.
// `seedBefore` diz em que ponto da fila o `seedFn` roda, para que cada teste
// possa montar o estado que a sua migração encontra.
function migrate(
  seedFn?: (db: InstanceType<typeof Database>) => void,
  seedBefore = '006_category_essential.sql',
) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f: string) => f.endsWith('.sql') && f !== '002_seed.sql')
    .sort();
  for (const f of files) {
    if (f === seedBefore && seedFn) seedFn(db);
    db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  }
  return db;
}
```

- [ ] **Step 2: Escrever os cinco testes da migração que falham**

Acrescentar ao fim de `test/migrations.test.ts`:

```ts
test('008 creates monthly_model keyed by month', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(monthly_model)').all();
  assert.deepEqual(
    cols.map((c: { name: string }) => c.name),
    ['month', 'income_cents', 'fixed_costs_cents', 'savings_goal_cents'],
  );
  assert.equal(cols.find((c: { name: string }) => c.name === 'month').pk, 1);
});

const CONFIGURED = (d: InstanceType<typeof Database>) => {
  d.prepare("INSERT INTO settings (key, value) VALUES ('monthly_income', '1200000')").run();
  d.prepare("INSERT INTO settings (key, value) VALUES ('fixed_costs', '386000')").run();
  d.prepare("INSERT INTO settings (key, value) VALUES ('savings_goal', '250000')").run();
};

test('008 seeds the current model for whoever already configured one', () => {
  const db = migrate(CONFIGURED, '008_monthly_model.sql');
  const rows = db.prepare('SELECT * FROM monthly_model').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].income_cents, 1200000);
  assert.equal(rows[0].fixed_costs_cents, 386000);
  assert.equal(rows[0].savings_goal_cents, 250000);
  // Sem lançamentos, o primeiro mês registrado é o mês corrente.
  assert.equal(rows[0].month, new Date().toISOString().slice(0, 7));
});

// O teste que justifica a âncora. Sem ele, todo mês anterior ao upgrade
// continuaria resolvendo por `settings`, e mudar a renda hoje seguiria
// reescrevendo o histórico — o bug do §A.2, vivo para quem já usa o app.
test('008 anchors the seeded row at the first month the user ever recorded', () => {
  const db = migrate((d) => {
    CONFIGURED(d);
    d.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
    for (const date of ['2026-01-10', '2026-04-02', '2026-07-30']) {
      d.prepare(
        'INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES (?, 1, 1, 5000)',
      ).run(date);
    }
  }, '008_monthly_model.sql');
  assert.equal(db.prepare('SELECT month FROM monthly_model').get().month, '2026-01');
});

test('008 never anchors in the future, even with a future-dated transaction', () => {
  const db = migrate((d) => {
    CONFIGURED(d);
    d.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
    d.prepare(
      "INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES ('2099-01-10', 1, 1, 5000)",
    ).run();
  }, '008_monthly_model.sql');
  assert.equal(
    db.prepare('SELECT month FROM monthly_model').get().month,
    new Date().toISOString().slice(0, 7),
  );
});

test('008 seeds nothing when the model was never configured', () => {
  const db = migrate();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_model').get().n, 0);
});
```

O `seedFn` de `migrate` roda antes de `008_monthly_model.sql`, quando a tabela `categories` já existe (007 já rodou) — por isso `category_id = 1` resolve. `002_seed.sql` continua fora da fila, então a categoria 1 é `Mercado`, a primeira do seed genérico.

- [ ] **Step 3: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="008"`
Expected: FAIL — `SqliteError: no such table: monthly_model`.

- [ ] **Step 4: Escrever a migração**

Criar `migrations/008_monthly_model.sql`:

```sql
-- v0.3 §9 passo 3 — o modelo de poupança passa a ter história.
-- `settings` continua sendo o modelo CORRENTE: é ele que alimenta o herói do
-- Acompanhar e o sinal `configured` do §6. Esta tabela é o histórico, escrito
-- na revisão mensal. Nada na Fatia 1 muda.
CREATE TABLE monthly_model (
  month              TEXT PRIMARY KEY,
  income_cents       INTEGER NOT NULL,
  fixed_costs_cents  INTEGER NOT NULL,
  savings_goal_cents INTEGER NOT NULL
);

-- Quem já configurou o modelo ganha UMA linha, ancorada no primeiro mês que ele
-- já registrou — não no mês corrente.
--
-- A diferença não é cosmética. Ancorada no mês corrente, todo mês ANTERIOR ao
-- upgrade continuaria caindo no degrau `settings` da cadeia de resolução, e
-- mudar a renda hoje seguiria reescrevendo o histórico inteiro — exatamente o
-- bug do §A.2 que esta fatia existe para matar. Ancorada no primeiro mês, o
-- passado inteiro resolve por `carry` a partir desta linha e congela no
-- instante do upgrade.
--
-- A linha afirma "você ganhava isto em janeiro", o que é um palpite. Mas o
-- fallback afirmava exatamente o mesmo palpite — só que mutável. Congelado é
-- mais honesto do que mutável, e `source: 'carry'` deixa a herança visível.
--
-- O `MIN` externo protege contra lançamento com data futura: a âncora nunca é
-- posterior ao mês corrente, senão o passado voltaria a cair no fallback.
-- Quem nunca configurou renda não ganha linha nenhuma.
INSERT INTO monthly_model (month, income_cents, fixed_costs_cents, savings_goal_cents)
SELECT MIN(COALESCE((SELECT MIN(strftime('%Y-%m', date)) FROM transactions),
                    strftime('%Y-%m', 'now')),
           strftime('%Y-%m', 'now')),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'monthly_income'), 0),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'fixed_costs'), 0),
       COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'savings_goal'), 0)
 WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'monthly_income');
```

- [ ] **Step 5: Rodar para ver passar**

Run: `npm test -- --test-name-pattern="008"`
Expected: PASS (5 testes).

- [ ] **Step 6: Declarar a entidade**

Acrescentar ao fim de `src/domain/entities/index.ts`:

```ts
// Uma linha por mês, espelhando `category_limits`: o modelo de poupança passa a
// ter história (v0.3 §9 passo 3).
export interface MonthlyModel {
  month: string;
  income_cents: number;
  fixed_costs_cents: number;
  savings_goal_cents: number;
}

// `source` diz de qual degrau da cadeia de fallback o valor veio. É o que torna
// o teste dos três degraus legível, e o que permite à UI dizer "herdado de".
export interface ResolvedModel extends MonthlyModel {
  source: 'month' | 'carry' | 'settings' | 'none';
}
```

- [ ] **Step 7: Declarar a porta**

Em `src/domain/ports/index.ts`, acrescentar `MonthlyModel` à lista de imports de `../entities` (linha 1–8, mantendo a ordem alfabética: entre `InstallmentProgress` e `RecurringTemplate`) e acrescentar ao fim do arquivo:

```ts
export interface MonthlyModelRepository {
  findExact(month: string): MonthlyModel | undefined;
  findAtOrBefore(month: string): MonthlyModel | undefined; // carry-forward pick
  upsert(m: MonthlyModel): void;
}
```

`ReportRepository` não muda nesta task — `committedSpendMonth` entra na Task 3.

- [ ] **Step 8: Implementar o repositório**

Criar `src/infra/repositories/monthlyModel.ts`:

```ts
import type { MonthlyModel } from '../../domain/entities';
import type { MonthlyModelRepository } from '../../domain/ports';
import type { Db } from '../db';

export function makeMonthlyModelRepository(db: Db): MonthlyModelRepository {
  return {
    findExact(month: string): MonthlyModel | undefined {
      return db.prepare('SELECT * FROM monthly_model WHERE month=?').get(month) as
        | MonthlyModel
        | undefined;
    },
    // Mesma regra de `limits.resolve`: a linha mais recente que não é do futuro.
    findAtOrBefore(month: string): MonthlyModel | undefined {
      return db
        .prepare('SELECT * FROM monthly_model WHERE month<=? ORDER BY month DESC LIMIT 1')
        .get(month) as MonthlyModel | undefined;
    },
    upsert(m: MonthlyModel): void {
      db.prepare(
        `INSERT INTO monthly_model (month, income_cents, fixed_costs_cents, savings_goal_cents)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET
           income_cents=excluded.income_cents,
           fixed_costs_cents=excluded.fixed_costs_cents,
           savings_goal_cents=excluded.savings_goal_cents`,
      ).run(m.month, m.income_cents, m.fixed_costs_cents, m.savings_goal_cents);
    },
  };
}
```

- [ ] **Step 9: Implementar o use case**

Criar `src/application/use-cases/model.ts`:

```ts
import type { ResolvedModel } from '../../domain/entities';
import type { MonthlyModelRepository, SettingsRepository } from '../../domain/ports';

export interface ModelUseCaseDeps {
  monthlyModel: MonthlyModelRepository;
  settings: SettingsRepository;
}

export interface ModelInput {
  income_cents: number;
  fixed_costs_cents: number;
  savings_goal_cents: number;
}

// Contrato estreito consumido por `use-cases/bi.ts`: a poupança realizada precisa
// resolver o modelo de cada mês, e não deve reimplementar a cadeia de fallback.
export interface ModelResolver {
  resolve(month: string): ResolvedModel;
}

// As três chaves globais de `settings` continuam sendo o modelo CORRENTE. A
// tabela é o histórico. O passo 3 da revisão grava nos dois (§B.1 do design).
const KEYS = {
  income_cents: 'monthly_income',
  fixed_costs_cents: 'fixed_costs',
  savings_goal_cents: 'savings_goal',
} as const;

export function makeModelUseCases(deps: ModelUseCaseDeps) {
  const { monthlyModel, settings } = deps;

  function num(key: string): number {
    const v = settings.get(key);
    return v !== undefined ? Number(v) : 0;
  }

  return {
    // Cadeia de resolução, do mais específico ao mais genérico:
    //   1. a linha exata do mês
    //   2. a linha mais recente anterior a ele
    //   3. os valores atuais de `settings`
    //   4. zeros
    resolve(month: string): ResolvedModel {
      const row = monthlyModel.findAtOrBefore(month);
      if (row) {
        return { ...row, month, source: row.month === month ? 'month' : 'carry' };
      }
      if (settings.get(KEYS.income_cents) !== undefined) {
        return {
          month,
          income_cents: num(KEYS.income_cents),
          fixed_costs_cents: num(KEYS.fixed_costs_cents),
          savings_goal_cents: num(KEYS.savings_goal_cents),
          source: 'settings',
        };
      }
      return {
        month,
        income_cents: 0,
        fixed_costs_cents: 0,
        savings_goal_cents: 0,
        source: 'none',
      };
    },

    // Grava nos dois lugares numa ação só: o histórico cresce e o herói do
    // Acompanhar continua mostrando o modelo vigente, sem flag nova.
    set(month: string, input: ModelInput): ResolvedModel {
      monthlyModel.upsert({ month, ...input });
      settings.setMany([
        [KEYS.income_cents, String(input.income_cents)],
        [KEYS.fixed_costs_cents, String(input.fixed_costs_cents)],
        [KEYS.savings_goal_cents, String(input.savings_goal_cents)],
      ]);
      return { month, ...input, source: 'month' };
    },
  };
}
```

- [ ] **Step 10: Fiar no container**

Em `src/infra/composition.ts`:

1. Acrescentar aos imports, na ordem alfabética já usada — depois de `makeLimitUseCases` (linha 18): `import { makeModelUseCases } from '../application/use-cases/model';` e depois de `makeLimitRepository` (linha 27): `import { makeMonthlyModelRepository } from './repositories/monthlyModel';`
2. No objeto `repositories` (linha 51–60), depois de `limits:`:

```ts
    monthlyModel: makeMonthlyModelRepository(db),
```

3. O use case do modelo nasce **antes** do objeto `useCases`, porque a Task 4 vai injetá-lo no BI e um objeto não pode se referenciar enquanto é construído. Trocar a linha 62 (`const useCases = {`) por:

```ts
  // Nasce fora do objeto: o BI depende dele (Task 4), e `useCases.model` ainda
  // não existe enquanto `useCases` está sendo construído.
  const model = makeModelUseCases({
    monthlyModel: repositories.monthlyModel,
    settings: repositories.settings,
  });

  const useCases = {
    model,
```

- [ ] **Step 11: Verificar**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo verde. `useCases.model` ainda não tem consumidor — isso é esperado; a Task 2 o expõe por HTTP.

- [ ] **Step 12: Commit**

```bash
git add migrations/008_monthly_model.sql src/domain src/infra src/application test/migrations.test.ts
git commit -m "feat(api): give the savings model a per-month history"
```

---

## Task 2: `GET/PUT /api/monthly-model`

Expõe a cadeia de resolução por HTTP e fecha o §C.5 do design (o adendo à spec).

**Files:**
- Create: `src/adapters/http/schemas/monthlyModel.ts`
- Create: `src/adapters/http/controllers/monthlyModel.ts`
- Create: `test/model.test.ts`
- Modify: `src/infra/composition.ts:33-48` (tipo `Container`) e `105-117` (objeto `controllers`)
- Modify: `src/app.ts:26` (montagem da rota)
- Modify: `docs/spec-v0.3.md:325-333` (tabela §11)

**Interfaces:**
- Consumes: `makeModelUseCases(...)` da Task 1 — `resolve(month)` e `set(month, input)`.
- Produces:
  - `GET /api/monthly-model?month=YYYY-MM` → `ResolvedModel` (200) · `month` malformado → 400
  - `PUT /api/monthly-model` com `{ month, income_cents, fixed_costs_cents, savings_goal_cents }` → `ResolvedModel` (200) · corpo inválido → 400

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/model.test.ts`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('an unconfigured database resolves to zeros', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.deepEqual(r.body, {
    month: '2026-08',
    income_cents: 0,
    fixed_costs_cents: 0,
    savings_goal_cents: 0,
    source: 'none',
  });
});

test('settings answer for months with no row of their own', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 1200000, fixed_costs: 386000, savings_goal: 250000 })
    .expect(200);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.equal(r.body.income_cents, 1200000);
  assert.equal(r.body.source, 'settings');
});

test('the month row wins, and the nearest earlier row carries forward', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-06',
      income_cents: 1000000,
      fixed_costs_cents: 300000,
      savings_goal_cents: 200000,
    })
    .expect(200);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      income_cents: 1200000,
      fixed_costs_cents: 386000,
      savings_goal_cents: 250000,
    })
    .expect(200);

  const june = await request(app).get('/api/monthly-model?month=2026-06').expect(200);
  assert.equal(june.body.income_cents, 1000000);
  assert.equal(june.body.source, 'month');

  const july = await request(app).get('/api/monthly-model?month=2026-07').expect(200);
  assert.equal(july.body.income_cents, 1000000); // carries June forward
  assert.equal(july.body.month, '2026-07');
  assert.equal(july.body.source, 'carry');

  // Maio é anterior a qualquer linha gravada, então não há degrau `carry` — mas
  // também não é `none`: os dois PUTs acima gravaram `settings` junto (é o que o
  // teste seguinte prova), e `settings` é o terceiro degrau da cadeia. O degrau
  // `none` só existe num banco onde o modelo nunca foi configurado, que é o
  // primeiro teste deste arquivo.
  const may = await request(app).get('/api/monthly-model?month=2026-05').expect(200);
  assert.equal(may.body.income_cents, 1200000);
  assert.equal(may.body.source, 'settings');
});

test('writing a month also updates the current model in settings', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      income_cents: 1200000,
      fixed_costs_cents: 386000,
      savings_goal_cents: 250000,
    })
    .expect(200);
  const s = await request(app).get('/api/settings').expect(200);
  assert.deepEqual(s.body, {
    monthly_income: 1200000,
    fixed_costs: 386000,
    savings_goal: 250000,
  });
});

test('writing the same month twice overwrites instead of duplicating', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const body = {
    month: '2026-08',
    income_cents: 1000000,
    fixed_costs_cents: 300000,
    savings_goal_cents: 200000,
  };
  await request(app).put('/api/monthly-model').send(body).expect(200);
  await request(app)
    .put('/api/monthly-model')
    .send({ ...body, income_cents: 1500000 })
    .expect(200);
  const r = await request(app).get('/api/monthly-model?month=2026-08').expect(200);
  assert.equal(r.body.income_cents, 1500000);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM monthly_model').get().n, 1);
});

test('monthly-model validates its inputs', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).get('/api/monthly-model').expect(400); // no month
  await request(app).get('/api/monthly-model?month=2026').expect(400); // malformed
  await request(app).put('/api/monthly-model').send({ month: '2026-08' }).expect(400); // no values
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      income_cents: -1,
      fixed_costs_cents: 0,
      savings_goal_cents: 0,
    })
    .expect(400); // negative
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-08',
      income_cents: 1.5,
      fixed_costs_cents: 0,
      savings_goal_cents: 0,
    })
    .expect(400); // not an integer
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="monthly-model|unconfigured database|settings answer|month row wins|current model in settings|same month twice"`
Expected: FAIL — todas as chamadas devolvem 404, porque a rota não existe.

- [ ] **Step 3: Escrever o schema**

Criar `src/adapters/http/schemas/monthlyModel.ts`:

```ts
import { z } from 'zod';
import { zMonth, zNonNegInt } from './common';

// Os três valores são obrigatórios: gravar um modelo parcial deixaria o mês com
// um número herdado e outro explícito, e ninguém saberia dizer qual é qual.
export const putMonthlyModelSchema = z.object({
  month: zMonth('month must be YYYY-MM'),
  income_cents: zNonNegInt('income_cents must be a non-negative integer'),
  fixed_costs_cents: zNonNegInt('fixed_costs_cents must be a non-negative integer'),
  savings_goal_cents: zNonNegInt('savings_goal_cents must be a non-negative integer'),
});
```

- [ ] **Step 4: Escrever o controller**

Criar `src/adapters/http/controllers/monthlyModel.ts`:

```ts
import express from 'express';
import type { makeModelUseCases } from '../../../application/use-cases/model';
import { monthQuerySchema } from '../schemas/common';
import { putMonthlyModelSchema } from '../schemas/monthlyModel';
import { parse } from '../validate';

type ModelUseCases = ReturnType<typeof makeModelUseCases>;

export function makeMonthlyModelController(uc: ModelUseCases): express.Router {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { month } = parse(monthQuerySchema, req.query);
    res.json(uc.resolve(month));
  });

  router.put('/', (req, res) => {
    const { month, ...input } = parse(putMonthlyModelSchema, req.body);
    res.json(uc.set(month, input));
  });

  return router;
}
```

- [ ] **Step 5: Fiar o controller**

Em `src/infra/composition.ts`:

1. Import, depois de `makeLimitsController` (linha 8): `import { makeMonthlyModelController } from '../adapters/http/controllers/monthlyModel';`
2. Na interface `Container.controllers` (linha 36–46), depois de `limits: express.Router;`:

```ts
    monthlyModel: express.Router;
```

3. No objeto `controllers` (linha 105–117), depois de `limits:`:

```ts
    monthlyModel: makeMonthlyModelController(useCases.model),
```

Em `src/app.ts`, depois da linha 23 (`app.use('/api/limits', ...)`):

```ts
  app.use('/api/monthly-model', controllers.monthlyModel);
```

- [ ] **Step 6: Rodar para ver passar**

Run: `npm test -- --test-name-pattern="monthly-model|unconfigured database|settings answer|month row wins|current model in settings|same month twice"`
Expected: PASS (6 testes).

- [ ] **Step 7: Adendo à spec (§C.5 do design)**

Em `docs/spec-v0.3.md`, na tabela do §11 (linhas 325–333), inserir uma linha antes de `| demais | inalterados |`:

```markdown
| `GET/PUT /api/monthly-model` | **novo** — modelo de poupança por mês (renda, custos fixos, meta), com resolução carry-forward. Consequência do §9 passo 3: sem dimensão de mês não há "poupança realizada" honesta |
```

- [ ] **Step 8: Verificar e commitar**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo verde.

```bash
git add src/adapters src/infra/composition.ts src/app.ts test/model.test.ts docs/spec-v0.3.md
git commit -m "feat(api): expose the per-month savings model over HTTP"
```

---

## Task 3: Comprometido vs. discricionário

A primeira das duas séries novas. Decisão C.1: comprometido é **só** parcelas e recorrências.

**Files:**
- Modify: `src/domain/ports/index.ts` (interface `ReportRepository`, linhas 155–163)
- Modify: `src/infra/repositories/reports.ts:36-45` (depois de `installmentSpendMonth`)
- Modify: `src/application/use-cases/bi.ts` (novo método antes de `categoryTrend`)
- Modify: `src/adapters/http/controllers/bi.ts:26-33`
- Test: `test/bi.test.ts` (fim do arquivo)

**Interfaces:**
- Consumes: `ReportRepository.spendAllMonth(month)`, `monthRange(from, to)` — já existem.
- Produces:
  - `ReportRepository.committedSpendMonth(month: string): number`
  - `GET /api/bi/committed-vs-discretionary?from=&to=` → `{ months: string[], series: [{ name: 'Comprometido', spent_cents: number[] }, { name: 'Discricionário', spent_cents: number[] }] }`. A ordem das séries é contratual: o front-end lê por índice, não por nome.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `test/bi.test.ts`:

```js
test('committed is installments and recurring charges — not essential categories', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  // A categoria de `makeTestDb` é `essential = 1`. Um gasto avulso nela é
  // discricionário: a decisão C.1 é que "comprometido" é o que já foi assinado.
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-05',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 50000,
    })
    .expect(201);
  await request(app)
    .post('/api/transactions')
    .send({
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      installment_total_cents: 30000,
      installment_count: 3,
      first_month: '2026-06',
    })
    .expect(201);

  const r = await request(app)
    .get('/api/bi/committed-vs-discretionary?from=2026-06&to=2026-06')
    .expect(200);
  assert.deepEqual(
    r.body.series.map((s) => s.name),
    ['Comprometido', 'Discricionário'],
  );
  assert.equal(r.body.series[0].spent_cents[0], 10000); // só a parcela
  assert.equal(r.body.series[1].spent_cents[0], 50000); // o gasto essencial avulso
});

test('committed counts a transaction that is both an installment and recurring once', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const tpl = ctx.db
    .prepare(
      `INSERT INTO recurring_templates (description, category_id, card_id, amount_cents, day_of_month)
       VALUES ('Seguro', ?, ?, 9000, 5)`,
    )
    .run(ctx.categoryId, ctx.cardId);
  const grp = ctx.db
    .prepare(
      `INSERT INTO installment_groups (description, total_cents, total_count, first_month, category_id, card_id)
       VALUES ('Seguro parcelado', 9000, 1, '2026-06', ?, ?)`,
    )
    .run(ctx.categoryId, ctx.cardId);
  ctx.db
    .prepare(
      `INSERT INTO transactions (date, category_id, card_id, amount_cents, description,
                                 installment_group_id, recurring_template_id)
       VALUES ('2026-06-05', ?, ?, 9000, 'Seguro', ?, ?)`,
    )
    .run(ctx.categoryId, ctx.cardId, grp.lastInsertRowid, tpl.lastInsertRowid);

  const r = await request(app)
    .get('/api/bi/committed-vs-discretionary?from=2026-06&to=2026-06')
    .expect(200);
  assert.equal(r.body.series[0].spent_cents[0], 9000); // não 18000
  assert.equal(r.body.series[1].spent_cents[0], 0);
});

test('committed-vs-discretionary validates its range', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .get('/api/bi/committed-vs-discretionary?from=2026-08&to=2026-06')
    .expect(400);
  await request(app).get('/api/bi/committed-vs-discretionary?from=bad&to=2026-06').expect(400);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="committed"`
Expected: FAIL — 404, a rota não existe.

- [ ] **Step 3: Declarar a porta**

Em `src/domain/ports/index.ts`, na interface `ReportRepository`, depois de `installmentSpendMonth`:

```ts
  committedSpendMonth(month: string): number;
```

- [ ] **Step 4: Implementar a consulta**

Em `src/infra/repositories/reports.ts`, depois de `installmentSpendMonth` (linha 45):

```ts
    // "Comprometido" é o que já foi assinado embaixo: parcelas em curso e
    // cobranças de recorrência. Categorias essenciais NÃO entram (decisão C.1) —
    // mercado é inevitável, mas não é um compromisso que você assumiu.
    // O `OR` numa consulta só garante que a transação que é parcela E recorrente
    // seja contada uma vez.
    committedSpendMonth(month: string): number {
      return (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions
         WHERE strftime('%Y-%m', date)=?
           AND (installment_group_id IS NOT NULL OR recurring_template_id IS NOT NULL)`,
          )
          .get(month) as { s: number }
      ).s;
    },
```

- [ ] **Step 5: Escrever o use case**

Em `src/application/use-cases/bi.ts`, depois de `installmentForecast` (linha 69):

```ts
    // A ordem das séries é contratual: o card da Análise lê por índice, não por
    // nome, para não quebrar se a tradução mudar.
    committedVsDiscretionary(from: string, to: string) {
      const months = monthRange(from, to);
      const committed = months.map((m) => reports.committedSpendMonth(m));
      return {
        months,
        series: [
          { name: 'Comprometido', spent_cents: committed },
          {
            name: 'Discricionário',
            spent_cents: months.map((m, i) => reports.spendAllMonth(m) - committed[i]),
          },
        ],
      };
    },
```

- [ ] **Step 6: Expor a rota**

Em `src/adapters/http/controllers/bi.ts`, depois do bloco de `/installment-forecast` (linha 29):

```ts
  router.get('/committed-vs-discretionary', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.committedVsDiscretionary(from, to));
  });
```

- [ ] **Step 7: Rodar para ver passar**

Run: `npm test -- --test-name-pattern="committed"`
Expected: PASS (3 testes).

- [ ] **Step 8: Verificar e commitar**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src test/bi.test.ts
git commit -m "feat(api): add the committed-vs-discretionary series"
```

---

## Task 4: Poupança realizada

A série que fecha o buraco do §A.2: cada mês usa o modelo que valia naquele mês.

**Files:**
- Modify: `src/application/use-cases/bi.ts:1-19` (deps) e depois de `savingsTrend`
- Modify: `src/adapters/http/controllers/bi.ts` (depois de `/savings-trend`)
- Modify: `src/infra/composition.ts` (passar `model` para `makeBiUseCases`)
- Test: `test/bi.test.ts` (fim do arquivo)

**Interfaces:**
- Consumes: `ModelResolver` de `use-cases/model.ts` (Task 1) — `resolve(month): ResolvedModel`.
- Produces: `GET /api/bi/savings-realized?from=&to=` → `{ months, series: [{ name: 'Poupança realizada', spent_cents }, { name: 'Meta', spent_cents }] }`. Ordem contratual, como na Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `test/bi.test.ts`:

```js
test('savings-realized uses the model that was in force each month', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-06',
      income_cents: 1000000,
      fixed_costs_cents: 300000,
      savings_goal_cents: 200000,
    })
    .expect(200);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-07',
      income_cents: 1400000,
      fixed_costs_cents: 300000,
      savings_goal_cents: 250000,
    })
    .expect(200);
  await request(app)
    .post('/api/transactions')
    .send({
      date: '2026-06-10',
      category_id: ctx.categoryId,
      card_id: ctx.cardId,
      amount_cents: 100000,
    })
    .expect(201);

  const r = await request(app)
    .get('/api/bi/savings-realized?from=2026-06&to=2026-07')
    .expect(200);
  const realized = r.body.series[0];
  const goal = r.body.series[1];
  assert.equal(realized.name, 'Poupança realizada');
  assert.equal(goal.name, 'Meta');
  assert.deepEqual(realized.spent_cents, [600000, 1100000]); // 1.000−300−100 · 1.400−300−0
  assert.deepEqual(goal.spent_cents, [200000, 250000]);
});

// A razão de ser da fatia inteira do lado dos dados (§A.2 do design).
test('changing income today does not rewrite a month that already has a model', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .put('/api/monthly-model')
    .send({
      month: '2026-06',
      income_cents: 1000000,
      fixed_costs_cents: 300000,
      savings_goal_cents: 200000,
    })
    .expect(200);

  const before = await request(app)
    .get('/api/bi/savings-realized?from=2026-06&to=2026-06')
    .expect(200);

  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 9900000, fixed_costs: 100, savings_goal: 100 })
    .expect(200);

  const after = await request(app)
    .get('/api/bi/savings-realized?from=2026-06&to=2026-06')
    .expect(200);
  assert.deepEqual(after.body.series[0].spent_cents, before.body.series[0].spent_cents);

  // O contraste: `savings-trend` continua sendo projeção com os números de hoje.
  const trend = await request(app)
    .get('/api/bi/savings-trend?from=2026-06&to=2026-06')
    .expect(200);
  assert.equal(trend.body.series[0].spent_cents[0], 9900000 - 100);
});

test('savings-realized falls back to settings for months with no model row', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 1000000, fixed_costs: 300000, savings_goal: 200000 })
    .expect(200);
  const r = await request(app)
    .get('/api/bi/savings-realized?from=2026-06&to=2026-06')
    .expect(200);
  assert.equal(r.body.series[0].spent_cents[0], 700000);
  assert.equal(r.body.series[1].spent_cents[0], 200000);
});

test('savings-realized validates its range', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).get('/api/bi/savings-realized?from=2026-08&to=2026-06').expect(400);
  await request(app).get('/api/bi/savings-realized?from=2026-06&to=bad').expect(400);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="savings-realized|does not rewrite a month"`
Expected: FAIL — 404.

- [ ] **Step 3: Aceitar o resolvedor nas dependências do BI**

Em `src/application/use-cases/bi.ts`, trocar o bloco de imports e `BiUseCaseDeps` (linhas 1–19) por:

```ts
import type {
  CardRepository,
  CategoryRepository,
  LimitRepository,
  ReportRepository,
  SettingsRepository,
} from '../../domain/ports';
import { monthRange } from '../../domain/services/dates';
// A poupança realizada precisa do modelo de cada mês. Consumir o contrato
// estreito `ModelResolver` — em vez de reimplementar a cadeia de fallback aqui —
// é o que garante que o histórico e a revisão nunca discordem.
import type { ModelResolver } from './model';

export interface BiUseCaseDeps {
  reports: ReportRepository;
  limits: LimitRepository;
  categories: CategoryRepository;
  cards: CardRepository;
  settings: SettingsRepository;
  model: ModelResolver;
}

export function makeBiUseCases(deps: BiUseCaseDeps) {
  const { reports, limits, categories, cards, settings, model } = deps;
```

- [ ] **Step 4: Escrever o use case**

Em `src/application/use-cases/bi.ts`, depois de `savingsTrend` (que termina na linha 102 do arquivo original):

```ts
    // A diferença para `savingsTrend` é inteira `model.resolve(m)` no lugar de
    // `settings.get()`: cada mês usa o modelo que valia naquele mês, e mudar a
    // renda de hoje não reescreve o passado (§A.2 do design).
    savingsRealized(from: string, to: string) {
      const months = monthRange(from, to);
      const resolved = months.map((m) => model.resolve(m));
      return {
        months,
        series: [
          {
            name: 'Poupança realizada',
            spent_cents: months.map(
              (m, i) =>
                resolved[i].income_cents - resolved[i].fixed_costs_cents - reports.spendAllMonth(m),
            ),
          },
          { name: 'Meta', spent_cents: resolved.map((r) => r.savings_goal_cents) },
        ],
      };
    },
```

- [ ] **Step 5: Expor a rota**

Em `src/adapters/http/controllers/bi.ts`, depois do bloco de `/savings-trend`:

```ts
  router.get('/savings-realized', (req, res) => {
    const { from, to } = range(req);
    res.json(uc.savingsRealized(from, to));
  });
```

- [ ] **Step 6: Fiar a dependência**

Em `src/infra/composition.ts`, na chamada de `makeBiUseCases`, acrescentar a última linha (a constante `model` já existe fora do objeto desde a Task 1):

```ts
    bi: makeBiUseCases({
      reports: repositories.reports,
      limits: repositories.limits,
      categories: repositories.categories,
      cards: repositories.cards,
      settings: repositories.settings,
      model,
    }),
```

- [ ] **Step 7: Rodar para ver passar**

Run: `npm test -- --test-name-pattern="savings-realized|does not rewrite a month"`
Expected: PASS (4 testes).

- [ ] **Step 8: Verificar e commitar**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src test/bi.test.ts
git commit -m "feat(api): add realized savings, resolved per month"
```

---

## Task 5: As séries de BI passam a falar português

Fecha a constraint de pt-BR do §5 no último lugar onde o inglês ainda escapa para a tela: a legenda dos gráficos. Aproveita para terminar a varredura em `category.js`, que a Fatia 2 deixou passar e que esta task já tem de editar.

**Files:**
- Modify: `src/application/use-cases/bi.ts` (linhas 52–53, 64, 78–80, 98–99 do arquivo original)
- Modify: `public/js/category.js:16,36-38,52`
- Test: `test/bi.test.ts:82-83,145-146,184-185`
- Test: `test/categoryRender.test.ts:38,41`

**Interfaces:**
- Consumes: nada novo.
- Produces: o dicionário de tradução, contratual daqui em diante —
  `'Limit'` → `'Limite'` · `'Spent'` → `'Gasto'` · `'Projected savings'` → `'Poupança projetada'` · `'Goal'` → `'Meta'` · `'Committed installments'` → `'Parcelas comprometidas'`.

- [ ] **Step 1: Atualizar os testes primeiro (eles são a especificação)**

Em `test/bi.test.ts`:

- linha 64, o nome do teste: `test('bi budget-vs-actual returns Limite and Gasto series', async () => {`
- linhas 82–83:

```js
  assert.equal(r.body.series.find((s) => s.name === 'Limite').spent_cents[0], 80000);
  assert.equal(r.body.series.find((s) => s.name === 'Gasto').spent_cents[0], 30000);
```

- linha 114, o nome do teste: `test('bi category-trend returns Gasto and Limite series for one category', async () => {`
- linhas 145–146:

```js
  const spent = r.body.series.find((s) => s.name === 'Gasto');
  const limit = r.body.series.find((s) => s.name === 'Limite');
```

- linhas 184–185:

```js
  const projected = res.body.series.find((s) => s.name === 'Poupança projetada');
  const goal = res.body.series.find((s) => s.name === 'Meta');
```

Em `test/bi.test.ts`, acrescentar ao fim:

```js
test('every BI series name ships in pt-BR', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  const qs = 'from=2026-06&to=2026-06';
  const paths = [
    'budget-vs-actual',
    'installment-forecast',
    'savings-trend',
    'savings-realized',
    'committed-vs-discretionary',
  ];
  const expected = new Set([
    'Limite',
    'Gasto',
    'Parcelas comprometidas',
    'Poupança projetada',
    'Poupança realizada',
    'Meta',
    'Comprometido',
    'Discricionário',
  ]);
  for (const p of paths) {
    const r = await request(app).get(`/api/bi/${p}?${qs}`).expect(200);
    for (const s of r.body.series) {
      assert.ok(expected.has(s.name), `${p} still ships "${s.name}"`);
    }
  }
});
```

Em `test/categoryRender.test.ts`, linha 38:

```js
  assert.match(renderRows([]), /Nenhum lançamento neste mês/);
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="budget-vs-actual|category-trend|savingsTrend|pt-BR|empty state"`
Expected: FAIL — as séries ainda saem em inglês; `renderRows([])` ainda diz "No transactions this month."

- [ ] **Step 3: Traduzir as séries**

Em `src/application/use-cases/bi.ts`, quatro trocas:

```ts
          { name: 'Limite', spent_cents: limit_cents },
          { name: 'Gasto', spent_cents },
```

```ts
            name: 'Parcelas comprometidas',
```

```ts
          { name: 'Gasto', spent_cents: months.map((m) => reports.spendByCategoryMonth(categoryId, m)) },
          { name: 'Limite', spent_cents: months.map((m) => limits.resolve(categoryId, m)) },
```

```ts
          { name: 'Poupança projetada', spent_cents: projected },
          { name: 'Meta', spent_cents: months.map(() => goal) },
```

- [ ] **Step 4: Atualizar o consumidor e terminar o pt-BR de `category.js`**

Em `public/js/category.js`, linha 16:

```js
    return `<tr><td class="py-4 text-ink-mut" colspan="3">Nenhum lançamento neste mês.</td></tr>`;
```

linhas 36–38:

```js
      <span>Gasto <b class="text-ink font-mono">${formatBRL(spent_cents)}</b></span>
      <span>Limite <b class="text-ink font-mono">${formatBRL(limit_cents)}</b></span>
      <span>Sobra <b class="text-ink font-mono">${formatBRL(remaining)}</b></span>
```

linha 52:

```js
    const limitSeries = trend.series.find((s) => s.name === 'Limite');
```

- [ ] **Step 5: Rodar para ver passar**

Run: `npm test`
Expected: PASS — toda a suíte.

- [ ] **Step 6: Commit**

```bash
git add src/application/use-cases/bi.ts public/js/category.js test/bi.test.ts test/categoryRender.test.ts
git commit -m "chore(ui): BI series names and the category screen speak pt-BR"
```

---

## Task 6: `pauta.js` — as funções puras da Análise

Todo o raciocínio dos cinco cards, sem tocar em DOM nem em rede. Testável por inteiro em `node:test`.

**Files:**
- Modify: `public/js/format.js` (fim do arquivo)
- Modify: `public/js/dashboard.js:8-26`
- Create: `public/js/pauta.js`
- Create: `test/pauta.test.ts`
- Test: `test/dashboardRender.test.ts` (não muda — `monthLabel` mantém o contrato)

**Interfaces:**
- Consumes: `esc`, `formatBRL` de `format.js`; `PALETTE` de `charts.js`.
- Produces (todas exportadas de `public/js/pauta.js`):
  - `rangeSentence(months: string[]): string` — `'Março a agosto de 2026 · seis meses de histórico'`
  - `questionCard({ question, note, body, wide }): string`
  - `composition(trends, topN = 4): { month, total_cents, rows: { name, spent_cents, pct }[] }`
  - `renderComposition(model): string`
  - `monthlyTotals(trends): { months: string[], totals_cents: number[] }`
  - `trendVerdict(totals_cents: number[]): string`
  - `changes(trends, limit = 4): { name, delta_cents, pct }[]`
  - `changeAmount(delta_cents: number): string` — `'+ R$ 268,00'` / `'− R$ 142,00'`
  - `renderChanges(rows): string`
  - `splitAt(payload, index?): { committed_cents, discretionary_cents, total_cents, committed_pct }`
  - `renderSplit(model): string`
- Produces em `format.js`: `monthName(ym: string): string` — `'2026-08'` → `'agosto'`.

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/pauta.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');

// Seis meses, três categorias — o mesmo formato que `GET /api/bi/trends` devolve.
const trends = {
  months: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
  series: [
    { category_id: 1, name: 'Mercado', spent_cents: [0, 0, 0, 0, 76200, 62000] },
    { category_id: 2, name: 'Restaurantes & Delivery', spent_cents: [0, 0, 0, 0, 44400, 71200] },
    { category_id: 3, name: 'Transporte', spent_cents: [0, 0, 0, 0, 31400, 41000] },
    { category_id: 4, name: 'Lazer', spent_cents: [0, 0, 0, 0, 30000, 24000] },
    { category_id: 5, name: 'Saúde', spent_cents: [0, 0, 0, 0, 5000, 5000] },
  ],
};

test('monthName gives the bare pt-BR month', async () => {
  const { monthName } = await import('../public/js/format.js');
  assert.equal(monthName('2026-08'), 'agosto');
  assert.equal(monthName('2026-01'), 'janeiro');
  assert.equal(monthName('2026-12'), 'dezembro');
  assert.equal(monthName(''), '');
});

test('rangeSentence reads like the frame', async () => {
  const { rangeSentence } = await import('../public/js/pauta.js');
  assert.equal(
    rangeSentence(trends.months),
    'Março a agosto de 2026 · seis meses de histórico',
  );
  assert.equal(rangeSentence(['2026-08']), 'Agosto de 2026 · um mês de histórico');
  assert.equal(
    rangeSentence(['2025-11', '2025-12', '2026-01']),
    'Novembro de 2025 a janeiro de 2026 · três meses de histórico',
  );
  assert.equal(rangeSentence([]), '');
});

test('rangeSentence falls back to digits past twelve months', async () => {
  const { rangeSentence } = await import('../public/js/pauta.js');
  const months = Array.from({ length: 13 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
  assert.match(rangeSentence(months), /· 13 meses de histórico$/);
});

test('composition ranks the final month and folds the tail into Outras', async () => {
  const { composition } = await import('../public/js/pauta.js');
  const c = composition(trends);
  assert.equal(c.month, '2026-08');
  assert.equal(c.total_cents, 71200 + 62000 + 41000 + 24000 + 5000); // 203200
  assert.deepEqual(
    c.rows.map((r) => r.name),
    ['Restaurantes & Delivery', 'Mercado', 'Transporte', 'Lazer', 'Outras'],
  );
  assert.equal(c.rows[0].spent_cents, 71200);
  assert.equal(c.rows[0].pct, 35);
  assert.equal(c.rows[4].spent_cents, 5000); // Saúde, dobrada em Outras
});

test('composition omits Outras when nothing is left over', async () => {
  const { composition } = await import('../public/js/pauta.js');
  const two = {
    months: ['2026-08'],
    series: [
      { name: 'A', spent_cents: [6000] },
      { name: 'B', spent_cents: [4000] },
    ],
  };
  const c = composition(two);
  assert.deepEqual(
    c.rows.map((r) => r.name),
    ['A', 'B'],
  );
  assert.deepEqual(
    c.rows.map((r) => r.pct),
    [60, 40],
  );
});

test('composition on an empty month is empty, not broken', async () => {
  const { composition } = await import('../public/js/pauta.js');
  const c = composition({ months: ['2026-08'], series: [{ name: 'A', spent_cents: [0] }] });
  assert.equal(c.total_cents, 0);
  assert.deepEqual(c.rows, []);
  assert.deepEqual(composition({ months: [], series: [] }), {
    month: '',
    total_cents: 0,
    rows: [],
  });
});

test('monthlyTotals sums every series per month', async () => {
  const { monthlyTotals } = await import('../public/js/pauta.js');
  const t = monthlyTotals(trends);
  assert.deepEqual(t.months, trends.months);
  assert.deepEqual(t.totals_cents, [0, 0, 0, 0, 187000, 203200]);
});

test('trendVerdict compares the last month to the three before it', async () => {
  const { trendVerdict } = await import('../public/js/pauta.js');
  // média de 300, 400, 500 = 400; último = 376 → −6%
  assert.equal(
    trendVerdict([300, 400, 500, 376]),
    'Menos: −6% contra a média dos últimos 3 meses',
  );
  assert.equal(
    trendVerdict([300, 400, 500, 448]),
    'Mais: +12% contra a média dos últimos 3 meses',
  );
  assert.equal(trendVerdict([300, 400, 500, 400]), 'Na média dos últimos 3 meses');
  assert.equal(trendVerdict([100, 200]), ''); // menos de quatro meses
  assert.equal(trendVerdict([0, 0, 0, 500]), ''); // média zero: sem base de comparação
});

test('changes ranks categories by absolute variation between the last two months', async () => {
  const { changes } = await import('../public/js/pauta.js');
  const rows = changes(trends);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Restaurantes & Delivery', 'Mercado', 'Transporte', 'Lazer'],
  );
  assert.deepEqual(
    rows.map((r) => r.delta_cents),
    [26800, -14200, 9600, -6000],
  );
  assert.deepEqual(
    rows.map((r) => r.pct),
    [60, -19, 31, -20],
  );
});

test('changes drops flat categories and honours the limit', async () => {
  const { changes } = await import('../public/js/pauta.js');
  assert.ok(!changes(trends).some((r) => r.name === 'Saúde')); // 5000 → 5000
  assert.equal(changes(trends, 2).length, 2);
});

test('changes has no opinion when there is nothing to compare', async () => {
  const { changes } = await import('../public/js/pauta.js');
  assert.deepEqual(changes({ months: ['2026-08'], series: [{ name: 'A', spent_cents: [10] }] }), []);
  assert.deepEqual(changes({ months: [], series: [] }), []);
});

test('changes reports no percentage when the category is brand new', async () => {
  const { changes } = await import('../public/js/pauta.js');
  const rows = changes({
    months: ['2026-07', '2026-08'],
    series: [{ name: 'Pet', spent_cents: [0, 15000] }],
  });
  assert.equal(rows[0].delta_cents, 15000);
  assert.equal(rows[0].pct, null);
});

test('changeAmount renders the sign apart from the amount', async () => {
  const { changeAmount } = await import('../public/js/pauta.js');
  assert.equal(changeAmount(26800), '+ R$ 268,00');
  assert.equal(changeAmount(-14200), '− R$ 142,00');
});

test('splitAt reads the final month of the committed series', async () => {
  const { splitAt } = await import('../public/js/pauta.js');
  const payload = {
    months: ['2026-07', '2026-08'],
    series: [
      { name: 'Comprometido', spent_cents: [100000, 162000] },
      { name: 'Discricionário', spent_cents: [200000, 224000] },
    ],
  };
  assert.deepEqual(splitAt(payload), {
    committed_cents: 162000,
    discretionary_cents: 224000,
    total_cents: 386000,
    committed_pct: 42,
  });
  assert.equal(splitAt(payload, 0).committed_pct, 33);
});

test('splitAt on a month with no spend reports zero, not NaN', async () => {
  const { splitAt } = await import('../public/js/pauta.js');
  const payload = {
    months: ['2026-08'],
    series: [
      { name: 'Comprometido', spent_cents: [0] },
      { name: 'Discricionário', spent_cents: [0] },
    ],
  };
  assert.equal(splitAt(payload).committed_pct, 0);
});

test('questionCard puts the question in the title', async () => {
  const { questionCard } = await import('../public/js/pauta.js');
  const html = questionCard({
    question: 'Para onde meu dinheiro foi?',
    note: 'Agosto de 2026 · R$ 3.860,00',
    body: '<p>corpo</p>',
  });
  assert.match(html, /paper-card/);
  assert.match(html, /Para onde meu dinheiro foi\?/);
  assert.match(html, /Agosto de 2026 · R\$ 3\.860,00/);
  assert.match(html, /<p>corpo<\/p>/);
});

test('the renderers escape category names', async () => {
  const { composition, renderComposition, changes, renderChanges } = await import(
    '../public/js/pauta.js'
  );
  const evil = {
    months: ['2026-07', '2026-08'],
    series: [{ name: '<img src=x>', spent_cents: [100, 200] }],
  };
  const c = renderComposition(composition(evil));
  assert.match(c, /&lt;img/);
  assert.doesNotMatch(c, /<img/);
  const ch = renderChanges(changes(evil));
  assert.match(ch, /&lt;img/);
  assert.doesNotMatch(ch, /<img/);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- test/pauta.test.ts`
Expected: FAIL — `Cannot find module '../public/js/pauta.js'`.

- [ ] **Step 3: Acrescentar `monthName` a `format.js`**

Em `public/js/format.js`, depois de `MONTHS_SHORT` (linha 49):

```js
// O sinal aritmético do §Global Constraints é U+2212, não hífen: `− R$ 142,00`
// alinha com `+ R$ 268,00` em fonte mono, e o hífen não alinha. Mora aqui para
// que `pauta.js` e `review.js` não tenham cada um a sua cópia.
export const MINUS = '−';

// Os nomes de mês nascem em minúsculo, porque o mesmo nome aparece no meio de
// frase e no começo dela. Quem precisa de caixa alta capitaliza na borda.
export function capitalize(s) {
  return String(s ?? '').replace(/^./, (c) => c.toUpperCase());
}

const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

// `'2026-08' → 'agosto'`. Minúsculo: quem precisa de caixa alta capitaliza na
// borda, porque o mesmo nome aparece no meio de frase e no começo dela.
export function monthName(ym) {
  const [, m] = String(ym ?? '').split('-');
  return MONTHS_LONG[Number(m) - 1] ?? '';
}
```

- [ ] **Step 4: Fazer `dashboard.js` usar a lista única**

Em `public/js/dashboard.js`, remover o array `MONTHS` (linhas 8–21), acrescentar `monthName` ao import de `./format.js` (linha 5) e trocar `monthLabel` (linhas 23–26) por:

```js
export function monthLabel(month) {
  const [y] = String(month).split('-');
  return `${monthName(month)} de ${Number(y)}`;
}
```

- [ ] **Step 5: Escrever `pauta.js`**

Criar `public/js/pauta.js`:

```js
import { PALETTE } from './charts.js';
import { capitalize, esc, formatBRL, MINUS, monthName } from './format.js';

const NUM_WORDS = [
  '',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
];

const year = (ym) => Number(String(ym).slice(0, 4));

// `'Março a agosto de 2026 · seis meses de histórico'`. O numeral por extenso vai
// até doze; além disso o algarismo lê melhor do que "dezesseis".
export function rangeSentence(months) {
  if (!months.length) return '';
  const first = months[0];
  const last = months[months.length - 1];
  const span =
    year(first) === year(last)
      ? months.length === 1
        ? `${capitalize(monthName(last))} de ${year(last)}`
        : `${capitalize(monthName(first))} a ${monthName(last)} de ${year(last)}`
      : `${capitalize(monthName(first))} de ${year(first)} a ${monthName(last)} de ${year(last)}`;
  const n = months.length;
  const count = n < NUM_WORDS.length ? NUM_WORDS[n] : String(n);
  return `${span} · ${count} ${n === 1 ? 'mês' : 'meses'} de histórico`;
}

// A moldura de cada pergunta. O título É a pergunta — é a regra do §8 da spec.
export function questionCard({ question, note, body, wide = false }) {
  return `
    <section class="paper-card${wide ? ' lg:col-span-2' : ''}">
      <h2 class="font-display text-2xl text-ink">${esc(question)}</h2>
      ${note ? `<p class="text-sm text-ink-mut mt-1">${esc(note)}</p>` : ''}
      <div class="mt-4">${body}</div>
    </section>`;
}

// --- 1. Para onde meu dinheiro foi? ---

export function composition(trends, topN = 4) {
  const months = trends.months ?? [];
  if (!months.length) return { month: '', total_cents: 0, rows: [] };
  const i = months.length - 1;
  const all = trends.series
    .map((s) => ({ name: s.name, spent_cents: s.spent_cents[i] ?? 0 }))
    .filter((s) => s.spent_cents > 0)
    .sort((a, b) => b.spent_cents - a.spent_cents);
  const total_cents = all.reduce((sum, s) => sum + s.spent_cents, 0);
  const head = all.slice(0, topN);
  const tail = all.slice(topN).reduce((sum, s) => sum + s.spent_cents, 0);
  const rows = tail > 0 ? [...head, { name: 'Outras', spent_cents: tail }] : head;
  const pct = (c) => (total_cents > 0 ? Math.round((c / total_cents) * 100) : 0);
  return {
    month: months[i],
    total_cents,
    rows: rows.map((r) => ({ ...r, pct: pct(r.spent_cents) })),
  };
}

export function renderComposition(model) {
  if (!model.rows.length) return `<p class="text-ink-mut">Nenhum lançamento neste mês.</p>`;
  const bar = model.rows
    .map(
      (r, i) =>
        `<div class="h-4 rounded-full" style="width:${r.pct}%;background:${PALETTE[i % PALETTE.length]}"></div>`,
    )
    .join('');
  const legend = model.rows
    .map(
      (r, i) => `
      <div class="flex items-baseline justify-between gap-4 py-1.5">
        <span class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${PALETTE[i % PALETTE.length]}"></span>
          ${esc(r.name)}
        </span>
        <span class="font-mono text-sm text-ink-mut whitespace-nowrap">${formatBRL(r.spent_cents)} · ${r.pct}%</span>
      </div>`,
    )
    .join('');
  return `<div class="flex gap-1 mb-4">${bar}</div>${legend}`;
}

// --- 2. Estou gastando mais ou menos que antes? ---

export function monthlyTotals(trends) {
  const months = trends.months ?? [];
  return {
    months,
    totals_cents: months.map((_, i) =>
      trends.series.reduce((sum, s) => sum + (s.spent_cents[i] ?? 0), 0),
    ),
  };
}

// O veredito que o frame põe como subtítulo. Precisa de quatro meses: três para
// a média e um para comparar. Média zero não tem base — a frase some.
export function trendVerdict(totals) {
  if (totals.length < 4) return '';
  const last = totals[totals.length - 1];
  const prev = totals.slice(-4, -1);
  const avg = prev.reduce((a, b) => a + b, 0) / 3;
  if (avg === 0) return '';
  const pct = Math.round(((last - avg) / avg) * 100);
  if (pct === 0) return 'Na média dos últimos 3 meses';
  const head = pct < 0 ? `Menos: ${MINUS}${-pct}%` : `Mais: +${pct}%`;
  return `${head} contra a média dos últimos 3 meses`;
}

// --- 3. O que mais mudou este mês? ---

// Variação, não maior série absoluta (decisão 6 do design). "Caiu R$ 200" é uma
// resposta tão válida quanto "subiu R$ 200", então a ordem é por módulo.
export function changes(trends, limit = 4) {
  const months = trends.months ?? [];
  if (months.length < 2) return [];
  const i = months.length - 1;
  return trends.series
    .map((s) => {
      const now = s.spent_cents[i] ?? 0;
      const before = s.spent_cents[i - 1] ?? 0;
      const delta_cents = now - before;
      return {
        name: s.name,
        delta_cents,
        pct: before > 0 ? Math.round((delta_cents / before) * 100) : null,
      };
    })
    .filter((r) => r.delta_cents !== 0)
    .sort((a, b) => Math.abs(b.delta_cents) - Math.abs(a.delta_cents) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function changeAmount(delta) {
  return `${delta < 0 ? MINUS : '+'} ${formatBRL(Math.abs(delta))}`;
}

export function renderChanges(rows) {
  if (!rows.length) return `<p class="text-ink-mut">Nada mudou de forma relevante.</p>`;
  return rows
    .map((r) => {
      const tone = r.delta_cents > 0 ? 'text-clay' : 'text-ink-mut';
      const pct =
        r.pct === null
          ? ''
          : `<span class="font-mono text-sm ${tone} w-14 text-right">${r.pct < 0 ? MINUS : '+'}${Math.abs(r.pct)}%</span>`;
      return `
      <div class="flex items-baseline justify-between gap-4 py-3 border-b border-line last:border-0">
        <span>${esc(r.name)}</span>
        <span class="flex items-baseline gap-4">
          <span class="font-mono ${tone} whitespace-nowrap">${changeAmount(r.delta_cents)}</span>
          ${pct}
        </span>
      </div>`;
    })
    .join('');
}

// --- 4. Quanto do meu gasto já é compromisso assumido? ---

// A ordem das séries é contratual (use-cases/bi.ts): [0] comprometido,
// [1] discricionário. Ler por índice sobrevive a uma mudança de tradução.
export function splitAt(payload, index) {
  const i = index ?? payload.months.length - 1;
  const committed_cents = payload.series[0].spent_cents[i] ?? 0;
  const discretionary_cents = payload.series[1].spent_cents[i] ?? 0;
  const total_cents = committed_cents + discretionary_cents;
  return {
    committed_cents,
    discretionary_cents,
    total_cents,
    committed_pct: total_cents > 0 ? Math.round((committed_cents / total_cents) * 100) : 0,
  };
}

export function renderSplit(model) {
  if (model.total_cents === 0) return `<p class="text-ink-mut">Nenhum lançamento neste mês.</p>`;
  const row = (color, label, cents) => `
    <div class="flex items-baseline justify-between gap-4 py-1.5">
      <span class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
        ${label}
      </span>
      <span class="font-mono text-sm text-ink-mut whitespace-nowrap">${formatBRL(cents)}</span>
    </div>`;
  return `
    <div class="flex gap-1 mb-4">
      <div class="h-4 rounded-full" style="width:${model.committed_pct}%;background:${PALETTE[3]}"></div>
      <div class="h-4 rounded-full" style="width:${100 - model.committed_pct}%;background:${PALETTE[4]}"></div>
    </div>
    ${row(PALETTE[3], 'Comprometido — parcelas e recorrentes', model.committed_cents)}
    ${row(PALETTE[4], 'Discricionário — o que você decide no mês', model.discretionary_cents)}`;
}
```

- [ ] **Step 6: Rodar para ver passar**

Run: `npm test -- test/pauta.test.ts`
Expected: PASS (16 testes).

- [ ] **Step 7: Verificar e commitar**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo verde — incluindo `test/dashboardRender.test.ts`, que continua valendo porque `monthLabel` manteve o contrato.

```bash
git add public/js/pauta.js public/js/format.js public/js/dashboard.js test/pauta.test.ts
git commit -m "feat(ui): add the pure functions behind the Analise agenda"
```

---

## Task 7: A Análise vira a pauta de cinco perguntas

O frame `15:3` sai do Figma e entra no app. Três cards somem, cinco perguntas aparecem, e dois helpers mortos são enterrados.

**Files:**
- Modify: `public/js/charts.js:9-20` (remover) e fim do arquivo (acrescentar `savingsChart`)
- Modify: `public/analise.html:25-35`
- Rewrite: `public/js/analise.js`
- Modify: `test/biChart.test.ts:21-44` (remover os testes dos helpers mortos)

**Interfaces:**
- Consumes: tudo o que a Task 6 produziu; `lineChart(canvasId, labels, series, onlyNonZero)` e `PALETTE` de `charts.js`; `GET /api/bi/{trends,committed-vs-discretionary,savings-realized}`.
- Produces: `savingsChart(canvasId, months, realizedCents, goalCents)` em `charts.js` — colunas de poupança realizada com a meta como linha tracejada. `topSeries` e `aggregateSeries` deixam de existir.

- [ ] **Step 1: Remover os testes dos helpers mortos**

Em `test/biChart.test.ts`, apagar as linhas 21–44 inteiras (os testes `aggregateSeries sums each series over the range` e `topSeries returns the largest total, first on ties`). O teste de `datasetsFor` fica.

- [ ] **Step 2: Rodar para ver o estado atual**

Run: `npm test -- test/biChart.test.ts`
Expected: PASS (1 teste) — os helpers ainda existem, só não são mais testados. Este passo é a preparação; a remoção vem no Step 4.

- [ ] **Step 3: Reescrever o corpo de `analise.html`**

Em `public/analise.html`, trocar as linhas 16–35 (do `<div class="mb-2">` até o `</section>` final) por:

```html
    <div class="mb-2">
      <h1 class="font-display text-3xl text-ink">Análise</h1>
      <p id="range" class="text-ink-mut mt-1"></p>
    </div>
    <div class="paper-card flex flex-wrap items-end gap-3">
      <label class="field"><span>De</span><input type="month" id="from" /></label>
      <label class="field"><span>Até</span><input type="month" id="to" /></label>
      <button id="run" class="btn-primary">Atualizar</button>
    </div>
    <div id="pauta" class="grid lg:grid-cols-2 gap-6"></div>
```

O `<canvas>` de cada card é criado pelo JS dentro do corpo do `questionCard` — só dois cards têm gráfico, e os dois nascem com o card.

- [ ] **Step 4: Trocar os helpers mortos por `savingsChart`**

Em `public/js/charts.js`, apagar `aggregateSeries` e `topSeries` (linhas 9–20) e acrescentar ao fim do arquivo:

```js
// Colunas de poupança realizada com a meta como linha tracejada, como o frame
// 15:3. A meta entra como série (não como anotação) porque ela varia de mês para
// mês desde que `monthly_model` existe.
export function savingsChart(canvasId, months, realized, goal) {
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Poupança realizada',
          data: realized.map((c) => c / 100),
          backgroundColor: realized.map((c, i) => (c >= goal[i] ? PALETTE[0] : PALETTE[4])),
          borderRadius: 6,
          order: 2,
        },
        {
          label: 'Meta',
          type: 'line',
          data: goal.map((c) => c / 100),
          borderColor: PALETTE[2],
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter' } } } },
      scales: {
        x: {
          ticks: { color: themeColor('--ink-mut'), font: { family: 'JetBrains Mono' } },
          grid: { display: false },
        },
        y: {
          ticks: { color: themeColor('--ink-mut'), font: { family: 'JetBrains Mono' } },
          grid: { color: themeColor('--line') },
        },
      },
    },
  });
}
```

- [ ] **Step 5: Reescrever `analise.js`**

Substituir todo o conteúdo de `public/js/analise.js` por:

```js
import { api, showError } from './api.js';
import { lineChart, savingsChart } from './charts.js';
import { mountChrome } from './chrome.js';
import { addMonths, capitalize, currentMonth, formatBRL, monthName } from './format.js';
import {
  changes,
  composition,
  monthlyTotals,
  questionCard,
  rangeSentence,
  renderChanges,
  renderComposition,
  renderSplit,
  splitAt,
  trendVerdict,
} from './pauta.js';

const $ = (id) => document.getElementById(id);

// Os cinco cards do frame 15:3, na ordem em que a pauta do §8 pergunta. Os dois
// que têm gráfico nascem com o `<canvas>` dentro do próprio card.
function renderPauta({ trends, split, savings }) {
  const comp = composition(trends);
  const totals = monthlyTotals(trends);
  const chg = changes(trends);
  const sp = splitAt(split);
  const months = trends.months;
  const previous = months.length > 1 ? months[months.length - 2] : '';
  const goal = savings.series[1].spent_cents;
  const lastGoal = goal[goal.length - 1] ?? 0;

  return [
    questionCard({
      question: 'Para onde meu dinheiro foi?',
      note: `${capitalize(monthName(comp.month))} de ${String(comp.month).slice(0, 4)} · ${formatBRL(comp.total_cents)}`,
      body: renderComposition(comp),
    }),
    questionCard({
      question: 'Estou gastando mais ou menos que antes?',
      note: trendVerdict(totals.totals_cents),
      body: '<canvas id="totalTrend" height="150"></canvas>',
    }),
    questionCard({
      question: 'O que mais mudou este mês?',
      note: previous ? `Contra ${monthName(previous)} de ${previous.slice(0, 4)}` : '',
      body: renderChanges(chg),
    }),
    questionCard({
      question: 'Quanto do meu gasto já é compromisso assumido?',
      note: sp.total_cents
        ? `${sp.committed_pct}% do mês estava decidido antes de começar`
        : '',
      body: renderSplit(sp),
    }),
    questionCard({
      question: 'Quanto eu de fato guardei?',
      note: `Poupança realizada contra a meta de ${formatBRL(lastGoal)} — o número-herói do app, que até hoje não tinha histórico`,
      body: '<canvas id="savings" height="150"></canvas>',
      wide: true,
    }),
  ].join('');
}

async function run() {
  try {
    const qs = `from=${$('from').value}&to=${$('to').value}`;
    const [trends, split, savings] = await Promise.all([
      api.get(`/api/bi/trends?${qs}`),
      api.get(`/api/bi/committed-vs-discretionary?${qs}`),
      api.get(`/api/bi/savings-realized?${qs}`),
    ]);
    $('range').textContent = rangeSentence(trends.months);
    $('pauta').innerHTML = renderPauta({ trends, split, savings });

    const totals = monthlyTotals(trends);
    lineChart(
      'totalTrend',
      totals.months,
      [{ name: 'Gasto no mês', spent_cents: totals.totals_cents }],
      false,
    );
    savingsChart(
      'savings',
      savings.months,
      savings.series[0].spent_cents,
      savings.series[1].spent_cents,
    );
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && $('pauta')) {
  mountChrome('/analise.html');
  // Todas as cinco perguntas são retrospectivas, então o padrão olha para trás
  // — o intervalo antigo mostrava seis meses que ainda não aconteceram (§A.3).
  $('to').value = currentMonth();
  $('from').value = addMonths(currentMonth(), -5);
  $('run').addEventListener('click', run);
  window.addEventListener('themechange', run);
  run();
}
```

- [ ] **Step 6: Rodar a suíte e o lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo verde. Se `biome` reclamar de import não usado em `analise.js`, remover o import morto.

- [ ] **Step 7: Ver no app**

```bash
npm run build:css && npm start
```

Abrir `http://localhost:3000/analise.html`. Confirmar: cinco cards, cada um com a pergunta como título; a frase de intervalo sob o `<h1>`; nenhum card de cartão, de orçamento-vs-real ou de previsão de parcelas. Num banco vazio os cards mostram os estados vazios em vez de quebrar. Comparar com o frame `15:3`.

- [ ] **Step 8: Commit**

```bash
git add public/analise.html public/js/analise.js public/js/charts.js test/biChart.test.ts
git commit -m "feat(ui): Analise becomes the five-question agenda"
```

---

## Task 8: `review.js` — as funções puras da revisão

Toda a lógica de "que mês, que passo, que ordem" antes de existir uma tela para exibi-la.

**Files:**
- Create: `public/js/review.js`
- Create: `test/review.test.ts`

**Interfaces:**
- Consumes: `esc`, `formatBRL`, `monthName`, `addMonths` de `format.js`.
- Produces (todas exportadas de `public/js/review.js`):
  - `STEPS: string[]` — os cinco rótulos
  - `reviewMonths(today: string): { closed: string, opening: string }`
  - `stepTrail(current: number): string`
  - `stepSubtitle(current: number): string`
  - `overspentFirst(rows): rows` — estouradas primeiro, cada grupo por gasto decrescente
  - `modelSummary(income, fixed, goal): { can_spend_cents: number, formula: string }`
  - `summaryLines(decisions): string[]`

- [ ] **Step 1: Escrever os testes que falham**

Criar `test/review.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');

test('reviewMonths always closes the previous month and opens the current one', async () => {
  const { reviewMonths } = await import('../public/js/review.js');
  assert.deepEqual(reviewMonths('2026-08-08'), { closed: '2026-07', opening: '2026-08' });
  // Decisão C.3: sem esperteza de fim de mês. O último dia de agosto ainda
  // revisa julho — quem quiser outra coisa usa o seletor do cabeçalho.
  assert.deepEqual(reviewMonths('2026-08-31'), { closed: '2026-07', opening: '2026-08' });
  assert.deepEqual(reviewMonths('2026-08-01'), { closed: '2026-07', opening: '2026-08' });
});

test('reviewMonths crosses the year boundary', async () => {
  const { reviewMonths } = await import('../public/js/review.js');
  assert.deepEqual(reviewMonths('2027-01-04'), { closed: '2026-12', opening: '2027-01' });
  assert.deepEqual(reviewMonths('2026-12-20'), { closed: '2026-11', opening: '2026-12' });
});

test('stepTrail marks done, current and pending, and ships a mobile bar', async () => {
  const { stepTrail, STEPS } = await import('../public/js/review.js');
  assert.equal(STEPS.length, 5);
  assert.deepEqual(STEPS, [
    'O mês que passou',
    'Compromissos',
    'Seu modelo',
    'Orçamentos',
    'Simular',
  ]);

  const html = stepTrail(3);
  for (const label of STEPS) assert.ok(html.includes(label), `missing ${label}`);
  assert.match(html, /data-step="1"[^>]*class="[^"]*step-done/);
  assert.match(html, /data-step="3"[^>]*class="[^"]*step-active/);
  assert.doesNotMatch(html, /data-step="4"[^>]*class="[^"]*step-(done|active)/);
  // barra de progresso do mobile (frame 25:86)
  assert.match(html, /PASSO 3 DE 5 · SEU MODELO/);
  assert.match(html, /60%/);
  assert.match(html, /width:60%/);
});

test('stepTrail is clickable on every step — nothing is mandatory', async () => {
  const { stepTrail } = await import('../public/js/review.js');
  const html = stepTrail(1);
  for (let n = 1; n <= 5; n++) {
    assert.match(html, new RegExp(`<button[^>]*data-step="${n}"`), `step ${n} not clickable`);
  }
});

test('stepSubtitle says what the step is for', async () => {
  const { stepSubtitle } = await import('../public/js/review.js');
  assert.equal(stepSubtitle(1), 'Passo 1 de 5 · só leitura, nada a decidir ainda');
  assert.equal(
    stepSubtitle(3),
    'Passo 3 de 5 · o único momento em que o app pergunta números sobre você',
  );
  assert.equal(stepSubtitle(4), 'Passo 4 de 5 · começamos pelas categorias que estouraram');
  assert.equal(stepSubtitle(6), 'Revisão concluída');
});

test('overspentFirst puts blown budgets on top, then the rest by spend', async () => {
  const { overspentFirst } = await import('../public/js/review.js');
  const rows = [
    { name: 'Mercado', spent_cents: 62000, limit_cents: 85000 },
    { name: 'Lazer', spent_cents: 24000, limit_cents: 0 },
    { name: 'Transporte', spent_cents: 41000, limit_cents: 38000 },
    { name: 'Restaurantes & Delivery', spent_cents: 71200, limit_cents: 60000 },
  ];
  assert.deepEqual(
    overspentFirst(rows).map((r) => r.name),
    ['Restaurantes & Delivery', 'Transporte', 'Mercado', 'Lazer'],
  );
});

test('overspentFirst does not treat a missing limit as an overrun', async () => {
  const { overspentFirst } = await import('../public/js/review.js');
  const rows = [
    { name: 'Sem limite', spent_cents: 999999, limit_cents: 0 },
    { name: 'Estourou', spent_cents: 100, limit_cents: 50 },
  ];
  assert.deepEqual(
    overspentFirst(rows).map((r) => r.name),
    ['Estourou', 'Sem limite'],
  );
});

test('overspentFirst leaves the input array alone', async () => {
  const { overspentFirst } = await import('../public/js/review.js');
  const rows = [
    { name: 'A', spent_cents: 10, limit_cents: 0 },
    { name: 'B', spent_cents: 100, limit_cents: 50 },
  ];
  overspentFirst(rows);
  assert.equal(rows[0].name, 'A');
});

test('modelSummary shows the arithmetic the way the frame writes it', async () => {
  const { modelSummary } = await import('../public/js/review.js');
  const m = modelSummary(1200000, 386000, 250000);
  assert.equal(m.can_spend_cents, 564000);
  assert.equal(m.formula, '12.000 − 3.860 − 2.500');
  assert.equal(modelSummary(0, 0, 0).formula, '0 − 0 − 0');
});

test('summaryLines reports the model and every limit that moved', async () => {
  const { summaryLines } = await import('../public/js/review.js');
  const lines = summaryLines({
    opening: '2026-09',
    model: { income_cents: 1200000, fixed_costs_cents: 386000, savings_goal_cents: 250000 },
    limits: [
      { name: 'Restaurantes & Delivery', from_cents: 60000, to_cents: 65000 },
      { name: 'Transporte', from_cents: 38000, to_cents: 52000 },
    ],
  });
  assert.deepEqual(lines, [
    'Modelo de setembro gravado: renda R$ 12.000,00, custos fixos R$ 3.860,00, meta R$ 2.500,00.',
    'Restaurantes & Delivery: R$ 600,00 → R$ 650,00',
    'Transporte: R$ 380,00 → R$ 520,00',
  ]);
});

test('summaryLines admits when nothing was decided', async () => {
  const { summaryLines } = await import('../public/js/review.js');
  assert.deepEqual(summaryLines({ opening: '2026-09', model: null, limits: [] }), [
    'Você passou pela revisão sem mudar nada. Está tudo como estava.',
  ]);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- test/review.test.ts`
Expected: FAIL — `Cannot find module '../public/js/review.js'`.

- [ ] **Step 3: Escrever `review.js`**

Criar `public/js/review.js`:

```js
import { addMonths, esc, formatBRL, MINUS, monthName } from './format.js';

export const STEPS = [
  'O mês que passou',
  'Compromissos',
  'Seu modelo',
  'Orçamentos',
  'Simular',
];

const SUBTITLES = [
  'Passo 1 de 5 · só leitura, nada a decidir ainda',
  'Passo 2 de 5 · o que já está reservado no mês que começa',
  'Passo 3 de 5 · o único momento em que o app pergunta números sobre você',
  'Passo 4 de 5 · começamos pelas categorias que estouraram',
  'Passo 5 de 5 · opcional — e se eu comprar algo parcelado?',
];

// Decisão C.3: o mês fechado é sempre o anterior, sem esperteza de fim de mês.
// `today` entra como parâmetro — uma função que lê o relógio por dentro não tem
// como ser testada.
export function reviewMonths(today) {
  const opening = String(today).slice(0, 7);
  return { closed: addMonths(opening, -1), opening };
}

export function stepSubtitle(current) {
  return SUBTITLES[current - 1] ?? 'Revisão concluída';
}

const CHECK =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l5 5L20 7"/></svg>';

// Pílulas no desktop, barra de progresso no mobile (frames 18:3 e 25:86) — o
// mesmo padrão de dois cabeçalhos que `chrome.js` já usa. Cada passo é um botão:
// nada é obrigatório e a trilha é a saída de emergência (§B.4 do design).
export function stepTrail(current) {
  const pills = STEPS.map((label, i) => {
    const n = i + 1;
    const state = n === current ? ' step-active' : n < current ? ' step-done' : '';
    const mark = n < current ? CHECK : String(n);
    return `<button type="button" data-step="${n}" class="step${state}"><span class="step-no">${mark}</span>${esc(label)}</button>`;
  }).join('');
  const pct = Math.round((Math.min(current, STEPS.length) / STEPS.length) * 100);
  const label = STEPS[Math.min(current, STEPS.length) - 1] ?? '';
  return `
    <div class="step-indicator">${pills}</div>
    <div class="step-progress">
      <div class="flex items-baseline justify-between label-caps text-ink-mut mb-1.5">
        <span>PASSO ${Math.min(current, STEPS.length)} DE ${STEPS.length} · ${esc(label.toUpperCase())}</span>
        <span>${pct}%</span>
      </div>
      <div class="meter"><div class="meter-fill" style="width:${pct}%"></div></div>
    </div>`;
}

// Estouradas primeiro — é a ordem que o §9 passo 4 pede e o frame 19:70 mostra.
// Limite zero é "sem limite", não "estourou": não dá para estourar o que não
// existe. Ordena numa cópia, para não surpreender quem passou o array.
export function overspentFirst(rows) {
  const over = (r) => r.limit_cents > 0 && r.spent_cents > r.limit_cents;
  return [...rows].sort(
    (a, b) => Number(over(b)) - Number(over(a)) || b.spent_cents - a.spent_cents,
  );
}

const reais = (cents) => Math.round(cents / 100).toLocaleString('pt-BR');

// A conta escrita por extenso sob o campo, como o frame 19:12: ver a subtração
// é o que torna "posso gastar" um número explicado em vez de mágico.
export function modelSummary(income, fixed, goal) {
  return {
    can_spend_cents: income - fixed - goal,
    formula: `${reais(income)} ${MINUS} ${reais(fixed)} ${MINUS} ${reais(goal)}`,
  };
}

// O fim da revisão diz o que mudou, não o que existe. Sair sem decidir nada é um
// resultado legítimo, e a frase reconhece isso em vez de repreender.
export function summaryLines(decisions) {
  const lines = [];
  if (decisions.model) {
    const m = decisions.model;
    lines.push(
      `Modelo de ${monthName(decisions.opening)} gravado: renda ${formatBRL(m.income_cents)}, ` +
        `custos fixos ${formatBRL(m.fixed_costs_cents)}, meta ${formatBRL(m.savings_goal_cents)}.`,
    );
  }
  for (const l of decisions.limits) {
    lines.push(`${l.name}: ${formatBRL(l.from_cents)} → ${formatBRL(l.to_cents)}`);
  }
  if (!lines.length) {
    return ['Você passou pela revisão sem mudar nada. Está tudo como estava.'];
  }
  return lines;
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `npm test -- test/review.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Verificar e commitar**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add public/js/review.js test/review.test.ts
git commit -m "feat(ui): add the pure functions behind the monthly review"
```

---

## Task 9: `decidir.html` — a casca da revisão e os passos 1 e 2

A tela nasce navegável com os dois passos que são só leitura. O item `Decidir` da navegação para de apontar para Configurações.

**Files:**
- Create: `public/decidir.html`
- Create: `public/js/decidir.js`
- Modify: `public/css/tailwind.src.css:44-49` (reescrever `.step-*`) e `@layer components` (acrescentar `.stat-tile`)
- Modify: `public/js/chrome.js:12-19`
- Modify: `public/js/dashboard.js:150` (o convite aponta para a revisão)
- Test: `test/chrome.test.ts` (fim do arquivo), `test/app.test.ts` (fim do arquivo)

**Interfaces:**
- Consumes: `stepTrail`, `stepSubtitle`, `reviewMonths` da Task 8; `changes`, `monthlyTotals`, `trendVerdict` da Task 6; `buildCommitments`, `renderCommitments` de `commitments.js` (Fatia 2, sem alteração); `GET /api/bi/{trends,savings-realized}`, `GET /api/installment-groups?month=`, `GET /api/recurring`.
- Produces: a rota `/decidir.html`; `NAV_ITEMS[2].href === '/decidir.html'`; o objeto `state` de `decidir.js` com `{ step, months, decisions }`, que as Tasks 10 e 11 estendem.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao fim de `test/chrome.test.ts`:

```js
test('Decidir now points at the review, not at settings', async () => {
  const { NAV_ITEMS, renderNav } = await import('../public/js/chrome.js');
  const decidir = NAV_ITEMS.find((i) => i.label === 'Decidir');
  assert.equal(decidir.href, '/decidir.html');
  assert.equal(decidir.route, '/decidir.html');
  const html = renderNav('/decidir.html');
  assert.match(html, /href="\/decidir.html"[^>]*class="[^"]*active/);
  // a engrenagem continua sendo o único caminho para Configurações
  assert.match(html, /href="\/settings.html"[^>]*aria-label="Configurações"/);
});
```

Acrescentar ao fim de `test/app.test.ts`:

```js
test('the review screen is served', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).get('/decidir.html').expect(200);
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- --test-name-pattern="Decidir now points|review screen is served"`
Expected: FAIL — `Decidir` ainda aponta para `/settings.html`, e `/decidir.html` responde 404.

- [ ] **Step 3: Reescrever as classes de passo no CSS**

Em `public/css/tailwind.src.css`, trocar as linhas 44–49 por:

```css
  .step-indicator { @apply hidden md:flex gap-3 my-6; }
  .step-progress { @apply md:hidden my-5; }
  .step { @apply flex-1 flex items-center gap-2 text-sm text-ink-mut rounded-full border border-line bg-card px-4 py-2.5 text-left; }
  .step-no { @apply w-5 h-5 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center; }
  .step-active { @apply bg-sage border-sage text-white font-semibold; }
  .step-active .step-no { @apply bg-white/25 text-white; }
  .step-done { @apply text-ink; }
  .step-done .step-no { @apply text-sage; }
  .stat-tile { @apply flex-1 rounded border border-line bg-paper p-4; }
```

- [ ] **Step 4: Criar `decidir.html`**

Criar `public/decidir.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <script src="/js/theme-init.js"></script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gastando — Decidir</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/app.css" />
</head>
<body class="pb-24 md:pb-0">
  <div id="nav"></div>
  <main class="max-w-5xl mx-auto px-6 pt-2">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 id="title" class="font-display text-3xl md:text-5xl text-ink"></h1>
        <p id="subtitle" class="text-ink-mut mt-2"></p>
      </div>
      <label class="field"><span>Mês revisado</span><input type="month" id="closed" /></label>
    </div>
    <div id="trail"></div>
    <div id="step"></div>
    <div id="footer" class="flex items-center justify-between gap-4 mt-6"></div>
  </main>
  <script type="module" src="/js/decidir.js"></script>
</body>
</html>
```

- [ ] **Step 5: Criar `decidir.js` com os passos 1 e 2**

Criar `public/js/decidir.js`:

```js
import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { buildCommitments, renderCommitments } from './commitments.js';
import { capitalize, formatBRL, monthName } from './format.js';
import { changes, monthlyTotals, trendVerdict } from './pauta.js';
import { reviewMonths, stepSubtitle, stepTrail } from './review.js';

const $ = (id) => document.getElementById(id);

// Sem persistência de progresso: sair e voltar recomeça no passo 1. O que
// persiste é o que cada passo grava pela API — nunca estado de wizard. É o que
// impede o `setup.html` que a Fatia 1 matou de ressuscitar por outra porta.
const state = {
  step: 1,
  months: reviewMonths(new Date().toISOString().slice(0, 10)),
  decisions: { model: null, limits: [] },
};

// `note` é o único campo que pode carregar texto do usuário — o nome da
// categoria de maior mudança —, então é o único que escapa. `label`, `value` e
// `tone` são sempre gerados pelo app: literais, saída de `formatBRL` ou classe.
const tile = (label, value, note, tone = 'text-ink') => `
  <div class="stat-tile">
    <div class="label-caps text-ink-mut">${label}</div>
    <div class="font-mono text-2xl ${tone} mt-1">${value}</div>
    <div class="text-sm text-ink-mut mt-1">${esc(note)}</div>
  </div>`;

// Passo 1 — leitura, não ação. Três números e um link, como o frame 18:3: a
// pauta inteira está a um clique, e repeti-la aqui faria o passo 1 pesar mais
// que a decisão que ele prepara.
async function renderStep1() {
  // Os mesmos seis meses da Análise, mas terminando no mês FECHADO — o passo 1
  // olha para o que aconteceu, não para o mês que está correndo.
  const qs = `from=${addMonths(state.months.closed, -5)}&to=${state.months.closed}`;
  const [trends, savings] = await Promise.all([
    api.get(`/api/bi/trends?${qs}`),
    api.get(`/api/bi/savings-realized?${qs}`),
  ]);
  const totals = monthlyTotals(trends);
  const spent = totals.totals_cents[totals.totals_cents.length - 1] ?? 0;
  const realized = savings.series[0].spent_cents;
  const goal = savings.series[1].spent_cents;
  const saved = realized[realized.length - 1] ?? 0;
  const lastGoal = goal[goal.length - 1] ?? 0;
  const top = changes(trends)[0];
  const verdict = trendVerdict(totals.totals_cents);

  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">O mês que passou</h2>
      <p class="text-sm text-ink-mut mt-1 mb-4">${capitalize(monthName(state.months.closed))} fechou. Antes de decidir qualquer coisa, veja o que aconteceu.</p>
      <div class="flex flex-col md:flex-row gap-4">
        ${tile('GASTOU', formatBRL(spent), verdict || 'sem base de comparação ainda')}
        ${tile('GUARDOU', formatBRL(saved), `meta era ${formatBRL(lastGoal)}`, saved >= lastGoal ? 'text-sage' : 'text-ink')}
        ${
          top
            ? tile(
                'MAIOR MUDANÇA',
                `${top.delta_cents < 0 ? '−' : '+'} ${formatBRL(Math.abs(top.delta_cents))}`,
                top.name,
                top.delta_cents > 0 ? 'text-clay' : 'text-ink',
              )
            : tile('MAIOR MUDANÇA', '—', 'nada mudou de forma relevante')
        }
      </div>
      <a href="/analise.html" class="inline-block mt-5 text-sage hover:underline">Ver a análise completa dos seis meses →</a>
    </section>`;
}

// Passo 2 — reuso direto da Fatia 2, zero código novo de render.
async function renderStep2() {
  const [installments, recurring] = await Promise.all([
    api.get(`/api/installment-groups?month=${state.months.opening}`),
    api.get('/api/recurring'),
  ]);
  const panel = renderCommitments(buildCommitments(installments, recurring));
  if (panel) return panel;
  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">O que já está comprometido</h2>
      <p class="text-sm text-ink-mut mt-1">Nada de ${monthName(state.months.opening)} está reservado ainda — o mês inteiro é seu para decidir.</p>
    </section>`;
}

const RENDERERS = { 1: renderStep1, 2: renderStep2 };

function renderFooter() {
  const back =
    state.step === 1
      ? `<a href="/" class="btn-ghost">Sair da revisão</a>`
      : `<button id="back" class="btn-ghost">Voltar</button>`;
  return `${back}<button id="next" class="btn-primary">Continuar</button>`;
}

async function render() {
  $('title').textContent = `Revisão de ${monthName(state.months.closed)}`;
  $('subtitle').textContent = stepSubtitle(state.step);
  $('trail').innerHTML = stepTrail(state.step);
  $('footer').innerHTML = renderFooter();
  $('step').innerHTML = `<p class="text-ink-mut">Carregando…</p>`;
  try {
    $('step').innerHTML = await RENDERERS[state.step]();
  } catch (e) {
    $('step').innerHTML = '';
    showError(e.message);
  }
  wire();
}

// A trilha tem cinco botões desde já, mas nem todos os passos existem ainda.
// Clampar no número de renderizadores registrados mantém a tela navegável em
// cada estado intermediário, e passa a valer sozinho quando as Tasks 10 e 11
// registram os que faltam.
function go(step) {
  state.step = Math.max(1, Math.min(step, Object.keys(RENDERERS).length));
  render();
}

function wire() {
  $('trail')
    .querySelectorAll('button[data-step]')
    .forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.step))));
  const next = $('next');
  if (next) next.addEventListener('click', () => go(state.step + 1));
  const back = $('back');
  if (back) back.addEventListener('click', () => go(state.step - 1));
}

if (typeof document !== 'undefined' && $('trail')) {
  mountChrome('/decidir.html');
  $('closed').value = state.months.closed;
  // Um seletor no cabeçalho desloca os dois meses juntos, para quem faz a
  // revisão atrasada (§B.4 do design). Trocar de mês zera as decisões: elas
  // descrevem o que mudou nesta sessão, e a sessão recomeça.
  $('closed').addEventListener('change', () => {
    const closed = $('closed').value;
    if (!closed) return;
    // Trocar de mês descarta o que estava em edição. Repõe o passo direto, sem
    // passar por `go()`: `go()` grava ao sair do passo 3, e os valores no
    // formulário são do mês ANTERIOR — gravá-los sob o mês novo seria escrever
    // um número que a pessoa nunca afirmou sobre aquele mês.
    state.months = { closed, opening: addMonths(closed, 1) };
    state.decisions = { model: null, limits: [] };
    state.step = 1;
    render();
  });
  render();
}
```

O import de `./format.js` no topo do arquivo é, portanto:

```js
import { addMonths, capitalize, esc, formatBRL, monthName } from './format.js';
```

- [ ] **Step 6: Apontar a navegação para a tela nova**

Em `public/js/chrome.js`, trocar o comentário e a terceira entrada de `NAV_ITEMS` (linhas 12–19) por:

```js
// O loop da v0.3 (§3). `Decidir` é a revisão mensal — não uma tela de
// configurações com outro nome. `Configurações` continua alcançável só pela
// engrenagem do cabeçalho.
export const NAV_ITEMS = [
  { href: '/registrar.html', label: 'Registrar', route: '/registrar.html', icon: ICONS.plus },
  { href: '/', label: 'Acompanhar', route: '/', icon: ICONS.chart },
  { href: '/decidir.html', label: 'Decidir', route: '/decidir.html', icon: ICONS.check },
];
```

Em `public/js/dashboard.js`, linha 150, o botão do convite:

```js
      <a href="decidir.html" class="btn-ghost whitespace-nowrap self-start md:self-auto">Começar a revisão</a>
```

- [ ] **Step 7: Rodar para ver passar**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo verde.

- [ ] **Step 8: Ver no app**

```bash
npm run build:css && npm start
```

Abrir `http://localhost:3000/decidir.html`. Confirmar contra o frame `18:3`: título `Revisão de <mês fechado>`, subtítulo do passo, cinco pílulas com a primeira ativa, três tiles, o link para a Análise, e `Sair da revisão` / `Continuar` no rodapé. Clicar em `Continuar` mostra o painel de compromissos e o rodapé troca para `Voltar` / `Continuar`. Estreitar a janela abaixo de 768px: as pílulas viram `PASSO 1 DE 5 · O MÊS QUE PASSOU` + `20%` + barra.

- [ ] **Step 9: Commit**

```bash
git add public/decidir.html public/js/decidir.js public/js/chrome.js public/js/dashboard.js public/css/tailwind.src.css test/chrome.test.ts test/app.test.ts
git commit -m "feat(ui): Decidir becomes the monthly review, starting with steps 1 and 2"
```

---

## Task 10: Passos 3 e 4 — o modelo e os orçamentos

Os dois passos que gravam. É aqui que o app sai do estado inicial do §6.

**Files:**
- Modify: `public/js/decidir.js` (dois renderizadores novos, dois blocos de wiring, `RENDERERS`)
- Modify: `public/css/tailwind.src.css` (acrescentar `.chip-suggest`)

**Interfaces:**
- Consumes: `modelSummary`, `overspentFirst` da Task 8; `parseReais`, `formatBRL` de `format.js`; `GET/PUT /api/monthly-model` (Task 2); `GET /api/categories`, `GET /api/limits?month=`, `GET /api/limits/suggestions?month=`, `PUT /api/limits`.
- Produces: `state.decisions.model` preenchido pelo passo 3; `state.decisions.limits` alimentado pelo passo 4 com `{ name, from_cents, to_cents }` — é o que a Task 11 lê para montar o resumo.

- [ ] **Step 1: Acrescentar o chip de sugestão ao CSS**

Em `public/css/tailwind.src.css`, dentro de `@layer components`, depois de `.stat-tile`:

```css
  .chip-suggest { @apply rounded-full border border-dashed border-line px-3 py-1.5 text-sm font-mono text-ink-mut hover:border-sage hover:text-sage whitespace-nowrap; }
```

- [ ] **Step 2: Escrever o passo 3**

Em `public/js/decidir.js`, acrescentar depois de `renderStep2`:

```js
// Passo 3 — o único momento em que o app pergunta números sobre a pessoa.
// Grava `monthly_model[opening]` E `settings` numa ação só (§B.1 do design),
// que é o que faz o herói do Acompanhar e a Análise nunca discordarem.
async function renderStep3() {
  const m = await api.get(`/api/monthly-model?month=${state.months.opening}`);
  const field = (id, label, cents) => `
    <label class="field">
      <span>${label}</span>
      <input type="text" id="${id}" value="${formatBRL(cents)}" class="font-mono" />
    </label>`;
  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">Seu modelo</h2>
      <p class="text-sm text-ink-mut mt-1 mb-4">Renda, custos fixos e quanto você quer guardar. É daqui que sai o "posso gastar".</p>
      <div class="grid sm:grid-cols-3 gap-3">
        ${field('income', 'Renda mensal', m.income_cents)}
        ${field('fixed', 'Custos fixos', m.fixed_costs_cents)}
        ${field('goal', 'Meta de poupança', m.savings_goal_cents)}
      </div>
      <div id="canSpend" class="mt-4 rounded border border-sage/40 bg-sage-soft/10 p-4 flex flex-col md:flex-row md:items-center gap-2"></div>
      <p class="text-sm text-ink-mut mt-4">Antes deste passo o app funciona normalmente — só sem projeção de poupança. Nada aqui é obrigatório.</p>
      <p class="text-sm text-ink-mut mt-2">Custos fixos são o que sai todo mês sem passar pelo seu julgamento: aluguel, condomínio, mensalidades. <b>Não lance esses valores também como transação</b> — se lançar, eles seriam descontados duas vezes da sua poupança.</p>
    </section>`;
}

function readModelFields() {
  const cents = (id) => {
    const v = parseReais($(id).value);
    return Number.isNaN(v) || v < 0 ? 0 : v;
  };
  return {
    income_cents: cents('income'),
    fixed_costs_cents: cents('fixed'),
    savings_goal_cents: cents('goal'),
  };
}

function paintCanSpend() {
  const v = readModelFields();
  const s = modelSummary(v.income_cents, v.fixed_costs_cents, v.savings_goal_cents);
  $('canSpend').innerHTML = `
    <div>
      <div class="label-caps text-ink-mut">POSSO GASTAR ESTE MÊS</div>
      <div class="text-sm text-ink-mut font-mono mt-0.5">${s.formula}</div>
    </div>
    <div class="md:ml-auto font-mono text-3xl ${s.can_spend_cents >= 0 ? 'text-sage' : 'text-clay'}">${formatBRL(s.can_spend_cents)}</div>`;
}

async function saveModel() {
  const v = readModelFields();
  await api.put('/api/monthly-model', { month: state.months.opening, ...v });
  state.decisions.model = v;
}

function wireStep3() {
  paintCanSpend();
  for (const id of ['income', 'fixed', 'goal']) {
    $(id).addEventListener('input', paintCanSpend);
    // Reescreve o campo em `R$ 1.234,56` quando a pessoa sai dele: digitar é
    // livre (`parseReais` aceita vírgula, ponto de milhar e o prefixo), ler é
    // formatado.
    $(id).addEventListener('blur', () => {
      const v = parseReais($(id).value);
      $(id).value = formatBRL(Number.isNaN(v) || v < 0 ? 0 : v);
      paintCanSpend();
    });
  }
}
```

- [ ] **Step 3: Escrever o passo 4**

Em `public/js/decidir.js`, depois de `wireStep3`:

```js
// Passo 4 — categorias que estouraram no mês fechado aparecem primeiro. O
// número já gasto e a sugestão de média de 3 meses vêm de `/api/limits/*`, que
// já existiam; o que é novo é a ordem e o lugar.
async function renderStep4() {
  const [cats, limits, sugg] = await Promise.all([
    api.get('/api/categories'),
    api.get(`/api/limits?month=${state.months.opening}`),
    api.get(`/api/limits/suggestions?month=${state.months.opening}`),
  ]);
  const limitBy = new Map(limits.map((l) => [l.category_id, l.limit_cents]));
  const suggBy = new Map(sugg.map((s) => [s.category_id, s]));
  const rows = overspentFirst(
    cats
      .filter((c) => c.active)
      .map((c) => ({
        category_id: c.id,
        name: c.name,
        limit_cents: limitBy.get(c.id) ?? 0,
        spent_cents: suggBy.get(c.id)?.last_month_cents ?? 0,
        avg3_cents: suggBy.get(c.id)?.avg3_cents ?? 0,
      })),
  );
  state.limitRows = rows;

  const body = rows
    .map((r) => {
      const over = r.limit_cents > 0 && r.spent_cents > r.limit_cents;
      return `
      <div class="flex flex-wrap items-center gap-3 py-4 border-b border-line last:border-0">
        <div class="flex-1 min-w-[12rem]">
          <div>${esc(r.name)}</div>
          <div class="text-sm ${over ? 'text-clay' : 'text-ink-mut'}">gastou ${formatBRL(r.spent_cents)}</div>
        </div>
        <button type="button" class="chip-suggest" data-suggest="${r.category_id}" data-value="${r.avg3_cents}">média 3m · ${formatBRL(r.avg3_cents)}</button>
        <input type="text" class="w-32 rounded-full border border-line bg-card px-4 py-2 text-right font-mono"
               data-limit="${r.category_id}" value="${formatBRL(r.limit_cents)}" />
      </div>`;
    })
    .join('');

  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">Ajustar orçamentos</h2>
      <p class="text-sm text-ink-mut mt-1 mb-2">Os limites valem para ${monthName(state.months.opening)}. ${capitalize(monthName(state.months.closed))} fica como está — o histórico por mês é preservado.</p>
      ${body || `<p class="text-ink-mut">Nenhuma categoria ativa ainda.</p>`}
    </section>`;
}

async function saveLimit(input) {
  const id = Number(input.dataset.limit);
  const row = state.limitRows.find((r) => r.category_id === id);
  const parsed = parseReais(input.value);
  const to_cents = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
  input.value = formatBRL(to_cents);
  if (to_cents === row.limit_cents) return;
  await api.put('/api/limits', {
    category_id: id,
    month: state.months.opening,
    limit_cents: to_cents,
  });
  // Um limite pode ser mexido várias vezes: o resumo guarda de onde veio e para
  // onde foi, não cada passo do caminho.
  const seen = state.decisions.limits.find((l) => l.category_id === id);
  if (seen) seen.to_cents = to_cents;
  else
    state.decisions.limits.push({
      category_id: id,
      name: row.name,
      from_cents: row.limit_cents,
      to_cents,
    });
  row.limit_cents = to_cents;
}

function wireStep4() {
  $('step')
    .querySelectorAll('button[data-suggest]')
    .forEach((b) =>
      b.addEventListener('click', () => {
        const input = $('step').querySelector(`input[data-limit="${b.dataset.suggest}"]`);
        input.value = formatBRL(Number(b.dataset.value));
        saveLimit(input).catch((e) => showError(e.message));
      }),
    );
  $('step')
    .querySelectorAll('input[data-limit]')
    .forEach((inp) =>
      inp.addEventListener('change', () => saveLimit(inp).catch((e) => showError(e.message))),
    );
}
```

Os dois imports do topo de `decidir.js` passam a ser:

```js
import { addMonths, capitalize, esc, formatBRL, monthName, parseReais } from './format.js';
import { modelSummary, overspentFirst, reviewMonths, stepSubtitle, stepTrail } from './review.js';
```

- [ ] **Step 4: Ligar os dois passos ao roteador**

Em `public/js/decidir.js`, trocar a linha `const RENDERERS = { 1: renderStep1, 2: renderStep2 };` por:

```js
const RENDERERS = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4 };
const WIRERS = { 3: wireStep3, 4: wireStep4 };
```

e, no fim de `wire()`, antes do fechamento da função:

```js
  const extra = WIRERS[state.step];
  if (extra) extra();
```

O passo 3 grava ao sair dele. Em `go(step)`, antes de trocar `state.step`:

```js
function go(step) {
  const leaving = state.step;
  const next = Math.max(1, Math.min(step, Object.keys(RENDERERS).length));
  if (leaving === 3 && next !== 3 && $('income')) {
    // Sair do passo 3 grava — inclusive pela trilha, inclusive para trás. Não
    // existe botão "salvar": o passo é a gravação.
    saveModel()
      .catch((e) => showError(e.message))
      .finally(() => {
        state.step = next;
        render();
      });
    return;
  }
  state.step = next;
  render();
}
```

- [ ] **Step 5: Verificar**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo verde. As funções puras já estão cobertas pelas Tasks 6 e 8; o que esta task acrescenta é wiring, verificado no app no passo seguinte.

- [ ] **Step 6: Verificar no app, num banco limpo**

```bash
rm -f data/gastando.db && npm run build:css && npm start
```

1. Lançar duas ou três transações em `/registrar.html`.
2. Abrir `/` — o herói é o **estado inicial** ("PARA ONDE SEU DINHEIRO FOI").
3. Clicar em `Começar a revisão` → cai em `/decidir.html`.
4. Ir ao passo 3, preencher renda/custos/meta, ver o `POSSO GASTAR ESTE MÊS` recalcular a cada tecla e a fórmula acompanhar. Comparar com o frame `19:12`.
5. `Continuar` → passo 4: as estouradas em cima, `gastou ...` em terracota nelas, chip `média 3m` preenchendo o campo. Comparar com `19:70`.
6. Voltar a `/` — **o herói agora é o estado completo** ("POSSO GASTAR ESTE MÊS"). Esta transição é a do §6 e nenhuma outra tela a dispara.
7. `GET /api/monthly-model?month=<opening>` responde com `source: 'month'`.

- [ ] **Step 7: Commit**

```bash
git add public/js/decidir.js public/css/tailwind.src.css
git commit -m "feat(ui): review steps 3 and 4 write the model and the budgets"
```

---

## Task 11: Passo 5 e o fim da revisão

O último passo e o fecho. Depois desta task o loop está fechado.

**Files:**
- Modify: `public/js/decidir.js` (renderizador do passo 5, do fim, `RENDERERS`, `renderFooter`)

**Interfaces:**
- Consumes: `summaryLines` da Task 8; `renderResult`, `simulateAdvisory` de `simulate.js` (sem alteração); `GET /api/categories`, `GET /api/simulate`.
- Produces: nada que outra task consuma — esta é a folha da árvore.

- [ ] **Step 1: Escrever o passo 5 e o fim**

Em `public/js/decidir.js`, depois de `wireStep4`:

```js
// Passo 5 — o formulário de `simulate.html` embutido. Contra os limites que
// acabaram de ser definidos no passo 4, que é o que torna este passo a última
// pergunta natural da revisão e não uma feature órfã.
async function renderStep5() {
  const cats = await api.get('/api/categories');
  const options = cats
    .filter((c) => c.active)
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join('');
  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">Simular uma compra</h2>
      <p class="text-sm text-ink-mut mt-1 mb-4">Opcional. Veja como uma compra parcelada caberia nos limites que você acabou de definir. Nada é salvo.</p>
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label class="field"><span>Categoria</span><select id="simCategory">${options}</select></label>
        <label class="field"><span>Valor total</span><input type="text" id="simAmount" class="font-mono" placeholder="R$ 0,00" /></label>
        <label class="field"><span># parcelas</span><input type="number" id="simCount" min="1" value="1" /></label>
        <label class="field"><span>Primeiro mês</span><input type="month" id="simMonth" value="${state.months.opening}" /></label>
      </div>
      <button id="simRun" class="btn-primary mt-4">Simular</button>
    </section>
    <div id="simResult" class="mt-6"></div>`;
}

function wireStep5() {
  $('simRun').addEventListener('click', async () => {
    try {
      const total_cents = parseReais($('simAmount').value);
      if (!Number.isInteger(total_cents) || total_cents <= 0) {
        showError('Informe um valor total');
        return;
      }
      const params = new URLSearchParams({
        category_id: $('simCategory').value,
        total_cents,
        count: Number($('simCount').value) || 1,
        first_month: $('simMonth').value,
      });
      const d = await api.get(`/api/simulate?${params.toString()}`);
      $('simResult').innerHTML = renderResult(d);
    } catch (e) {
      showError(e.message);
    }
  });
}

// Fim — o resumo do que mudou nesta sessão e a volta para o Acompanhar, agora
// no estado completo. Não é um passo: a trilha aparece toda concluída.
function renderDone() {
  const lines = summaryLines({
    opening: state.months.opening,
    model: state.decisions.model,
    limits: state.decisions.limits,
  })
    .map((l) => `<li class="py-2 border-b border-line last:border-0">${esc(l)}</li>`)
    .join('');
  return `
    <section class="paper-card">
      <h2 class="font-display text-2xl text-ink">Revisão de ${esc(monthName(state.months.closed))} concluída</h2>
      <p class="text-sm text-ink-mut mt-1 mb-4">O que você decidiu para ${esc(monthName(state.months.opening))}:</p>
      <ul>${lines}</ul>
      <a href="/" class="btn-primary inline-block mt-5">Ver como estou este mês</a>
    </section>`;
}
```

Os imports do topo de `decidir.js` passam a ser:

```js
import { addMonths, capitalize, esc, formatBRL, monthName, parseReais } from './format.js';
import {
  modelSummary,
  overspentFirst,
  reviewMonths,
  stepSubtitle,
  stepTrail,
  summaryLines,
} from './review.js';
import { renderResult } from './simulate.js';
```

Importar `simulate.js` é seguro: o wiring dele está guardado por `document.getElementById('result')`, e `decidir.html` tem `#simResult`, não `#result`.

- [ ] **Step 2: Ligar ao roteador e ao rodapé**

Em `public/js/decidir.js`:

```js
const RENDERERS = {
  1: renderStep1,
  2: renderStep2,
  3: renderStep3,
  4: renderStep4,
  5: renderStep5,
  6: async () => renderDone(),
};
const WIRERS = { 3: wireStep3, 4: wireStep4, 5: wireStep5 };
```

`go()` não muda: ele clampa em `Object.keys(RENDERERS).length`, que agora é 6.

`renderFooter` ganha os dois estados novos:

```js
function renderFooter() {
  if (state.step === 6) return '';
  const back =
    state.step === 1
      ? `<a href="/" class="btn-ghost">Sair da revisão</a>`
      : `<button id="back" class="btn-ghost">Voltar</button>`;
  const label = state.step === 5 ? 'Concluir revisão' : 'Continuar';
  return `${back}<button id="next" class="btn-primary">${label}</button>`;
}
```

- [ ] **Step 3: Verificar**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo verde.

- [ ] **Step 4: Rodar a revisão de ponta a ponta num banco limpo**

Esta é a verificação que o §B.6 do design pede, e nenhum teste automatizado a substitui.

```bash
rm -f data/gastando.db && npm run build:css && npm start
```

1. Lançar cinco ou seis transações em `/registrar.html`, incluindo uma parcelada em 3x e uma marcada como "repete todo mês".
2. `/` mostra o herói **inicial**.
3. `Começar a revisão` → passo 1: os três tiles têm números; o link leva à Análise.
4. Passo 2: o painel de compromissos lista a parcela e a recorrência.
5. Passo 3: preencher os três campos.
6. Passo 4: mexer em dois limites, um pelo chip e um digitando.
7. Passo 5: simular uma compra em 6x; a tabela aparece.
8. `Concluir revisão`: o resumo lista o modelo e **exatamente os dois** limites mexidos, com o valor de origem e o de destino.
9. `Ver como estou este mês` → `/` mostra o herói **completo**. É a transição do §6.
10. Voltar a `/decidir.html`: recomeça no passo 1, sem progresso salvo, com o modelo e os limites gravados.
11. Percorrer a trilha clicando direto no passo 4 a partir do 1: nada quebra, nada é obrigatório.

- [ ] **Step 5: Commit**

```bash
git add public/js/decidir.js
git commit -m "feat(ui): close the review with the simulator and a summary of what changed"
```

---

## Task 12: Proteger o caminho até o usuário

A 008 é a primeira migração desta fatia que toca o banco de quem já usa o app, e
duas coisas no caminho entre `git tag` e a máquina da pessoa não estão cobertas.
Task separada porque é infraestrutura de release, não Decidir — dá para adiar
sem quebrar nada, mas ela é o que impede o pior incidente possível desta entrega.

**Files:**
- Modify: `test/smoke.js:60-100` (o bloco de asserções)
- Modify: `README.md` (nova seção entre `## 1. Download and run` e `## 2. Run with Docker`)

**Interfaces:**
- Consumes: o binário empacotado, via `node test/smoke.js dist/<artifact>` — como `release.yml:60` já o invoca.
- Produces: um smoke test que falha se a cadeia de migrações não rodar dentro do snapshot.

- [ ] **Step 1: Entender o furo antes de tapá-lo**

O smoke test de release afirma exatamente duas coisas: que `GET /` devolve 200 e
que o arquivo do banco existe. Ambas passam com o schema **vazio** —
`openDatabase` cria o arquivo só de abri-lo, e `/` é o `index.html` servido por
`express.static`, que não toca no banco. Uma migração que **lança** é pega (o
processo morre e o smoke falha), mas uma que vira **no-op silencioso** não é: se
alguém editar `package.json` e tirar `migrations/**/*` de `pkg.assets`,
`readdirSync` devolve lista vazia, o binário sobe, serve `/`, cria um banco sem
uma tabela sequer — e o release é publicado verde. Todo endpoint quebra na
máquina do usuário.

- [ ] **Step 2: Escrever a asserção que falta**

Em `test/smoke.js`, dentro do bloco `(async () => {`, depois da checagem de
`fs.existsSync(dbPath)`:

```js
  // O schema tem de ter sido criado DENTRO do binário empacotado. `/` e a
  // existência do arquivo passam com o banco vazio; `/api/categories` só
  // responde 8 se a cadeia 001→007 rodou a partir do snapshot do pkg.
  try {
    const cats = await getJson(`http://localhost:${PORT}/api/categories`);
    if (!Array.isArray(cats) || cats.length !== 8) {
      console.error(
        `SMOKE FAIL: expected the 8 seeded categories, got ${
          Array.isArray(cats) ? cats.length : typeof cats
        } — migrations did not run inside the packaged binary`,
      );
      failed = true;
    }
  } catch (e) {
    console.error(`SMOKE FAIL: /api/categories did not answer (${e.message})`);
    failed = true;
  }
```

E, junto de `getStatus`, o leitor de corpo que ele usa:

```js
function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}
```

- [ ] **Step 3: Provar que a asserção nova pega o furo**

Rodar o smoke contra o servidor de código, que migra normalmente:

```bash
npm run build:css && npm run build && node test/smoke.js node dist/server.js
```

Expected: `SMOKE PASS`.

Agora simular o furo — um build sem as migrações empacotadas:

```bash
node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.pkg.assets=p.pkg.assets.filter(a=>!a.startsWith('migrations'));
fs.writeFileSync('/tmp/pkg-broken.json',JSON.stringify(p));"
npx pkg --config /tmp/pkg-broken.json dist/server.js --targets node22-linux-x64 --output /tmp/gastando-broken
node test/smoke.js /tmp/gastando-broken
```

Expected: `SMOKE FAIL: expected the 8 seeded categories, got 0 — migrations did
not run inside the packaged binary`, e saída com código 1. **Antes desta task o
mesmo comando imprimia `SMOKE PASS`** — é essa diferença que justifica a task.

> Nota de ambiente: um build local do pkg só roda se o `better-sqlite3` do
> `node_modules` tiver sido compilado para a mesma major do alvo (`node22`). Sob
> Node 23 o binário morre com `ERR_DLOPEN_FAILED / NODE_MODULE_VERSION 131 vs
> 127`. No CI isso não acontece — `release.yml` fixa `node-version: 22`. Para
> reproduzir localmente, usar Node 22 (`nvm use 22 && npm ci`) antes de empacotar.

- [ ] **Step 4: Documentar a atualização no README**

O README cobre instalar, fazer backup, restaurar e mover — **nunca atualizar**. E
o banco fica *ao lado do executável*: quem baixa o binário novo para `~/Downloads`
enquanto usa o app a partir de outra pasta abre um banco vazio e conclui que
perdeu tudo. É o incidente mais provável desta entrega, e é de documentação.

Inserir no `README.md`, logo depois do parágrafo `Your data is stored in a
data/ folder created next to the executable…` da seção 1:

```markdown
### Updating to a new version

Migrations run automatically — there is nothing to execute by hand. But the
database lives in the `data/` folder **next to the executable**, so:

1. Download the new binary for your OS from the Releases page.
2. **Put it in the same folder as the one you are already running**, replacing it.
   Keep the `data/` folder exactly where it is.
3. Start it. Any pending schema changes are applied on startup, in order, each in
   a transaction, and are recorded so they never run twice.

> If you start the new binary from a *different* folder — your Downloads folder,
> for example — it will not see your `data/` folder and will create a new, empty
> database. Nothing is lost: move the executable next to your existing `data/`
> folder and start it again.

Back up before a major upgrade by copying `data/gastando.db`, or by using
**Download backup** in Settings.
```

- [ ] **Step 5: Verificar e commitar**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add test/smoke.js README.md
git commit -m "test: smoke-test that migrations actually run inside the packaged binary"
```

---

## Fora de escopo (confirmado)

- Import de CSV, mobile nativo, multiusuário, nuvem — spec §14, inegociável.
- Remover a tabela `groups` — spec §10: fica para depois de v0.3 estável.
- Notificação ou lembrete de "está na hora da revisão". O ritual é puxado, não empurrado.
- Persistir progresso da revisão entre sessões — design §B.4.
- Resolver a dupla contagem de custos fixos no modelo de dados — decisão C.4 é avisar, não redesenhar.
- Dar destino novo ao gasto-por-cartão — decisão C.2: o endpoint fica, o card sai.

## Riscos e como este plano os cobre

| Risco | Cobertura |
|---|---|
| A revisão virar cerimônia que ninguém completa (spec §15) | Todo passo é opcional, a trilha é botão em todos os cinco (testado), sair não perde o que foi gravado, e o passo 3 grava ao sair — não há botão "salvar" para esquecer de apertar |
| `monthly_model` divergir de `settings`, e o herói mostrar um número e a Análise outro | `model.set` grava nos dois numa ação só (Task 1), o teste `writing a month also updates the current model in settings` cobre, e `bi.ts` consome `ModelResolver` em vez de reimplementar a cadeia |
| Backfill da 008 semear o mês errado em quem instalou há muito tempo | Semeia **uma** linha, ancorada no primeiro mês lançado, nunca no futuro, e só para quem já tem `monthly_income`. Cinco testes de migração cobrem os quatro cenários, e a simulação de upgrade (abaixo) confirma nos quatro tipos de banco |
| Um usuário antigo abrir a Análise e ver "poupança realizada" idêntica à projeção antiga | É o que é: não há dado histórico de renda para inventar. A âncora do §008 pelo menos **congela** esse número no instante do upgrade em vez de deixá-lo mudar toda vez que a renda for editada. A partir da primeira revisão, cada mês passa a ter o seu |
| Custos fixos contados duas vezes (§C.4) | Aviso explícito no passo 3, decisão registrada. O número de poupança realizada segue suspeito para quem lança custos fixos como transação — limitação conhecida, não bug |
| A Análise ficar sem audiência mesmo repensada | O passo 1 da revisão a torna destino com motivo: o link `Ver a análise completa dos seis meses →` sai de dentro do ritual |
| Uma tradução futura quebrar os cards | O front-end lê as séries novas por índice, não por nome, e a ordem é documentada como contratual nos dois use cases |
