# Gastando v0.3 — Fatia 1: Fundação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Despersonalizar o app e trocar a taxonomia de dois níveis (grupo → categoria) pelo atributo `essential`, para que o Gastando abra usável, sem wizard e sem a vida pessoal do autor no banco.

**Architecture:** Migração aditiva `006` adiciona `categories.essential` e um grupo-sentinela invisível (a coluna `categories.group_id` continua `NOT NULL REFERENCES groups(id)` — a tabela `groups` não é apagada, ela só some da API e da UI). Uma migração `007` semeia 8 categorias genéricas **apenas em bancos sem categoria alguma**. `/api/groups` e `/api/onboarding/*` saem do `app.ts` e da composição; o dashboard passa a agregar por `essential` e a informar `configured`, que é o que faz o Acompanhar escolher entre o herói inicial ("Para onde seu dinheiro foi") e o herói completo ("Posso gastar este mês").

**Tech Stack:** Node 22 · TypeScript 5.9 (CommonJS) · Express 5 · better-sqlite3 12 · zod 3 · Tailwind 3 · testes com `node:test` + supertest · Biome.

## Global Constraints

- Dinheiro **sempre** em centavos inteiros (`*_cents`). Nunca float.
- Toda a cópia de UI em **pt-BR**. Nomes de código, rotas e chaves de payload em inglês.
- Arquitetura hexagonal preservada: `domain/entities` → `domain/ports` → `application/use-cases` → `adapters/http/{controllers,schemas}` → `infra/repositories`. Use-case nunca importa `better-sqlite3`; repositório nunca importa `express`.
- Design system **Serene Ledger não muda**: paleta, tipografia e tokens de `public/css/tailwind.src.css` e `tailwind.config.js` ficam intactos. Só componentes mudam.
- Migrações aplicadas **nunca** são editadas — exceto `002_seed.sql`, que o runner (`src/infra/db.ts`) registra por nome sem checksum e que bancos existentes já marcaram como aplicada (spec §10). Editá-la afeta só instalações novas.
- A tabela `groups` **não é apagada** e nenhum dado é perdido. `groups` apenas deixa de ser usada.
- Comandos: `npm test` · `npm run typecheck` · `npm run lint` · `npm run build:css`.
- Os testes usam `require` em CommonJS no topo e `await import('../public/js/x.js')` para módulos ES do front-end. Siga o padrão dos arquivos existentes.
- Nada de import de CSV, nada de mobile, nada de troca de identidade visual (spec §14).

## File Structure

**Criar**
- `migrations/006_category_essential.sql` — adiciona `categories.essential`, faz backfill pelo nome do grupo, cria o grupo-sentinela `id = 0`.
- `migrations/007_seed_defaults.sql` — semeia as 8 categorias padrão, com trava para não tocar em banco existente.
- `test/migrations.test.ts` — cobre 006 e 007 (backfill, sentinela, trava do seed).

**Modificar**
- `migrations/002_seed.sql` — esvaziado (só comentário explicando por quê).
- `src/domain/entities/index.ts` — `Category.essential`.
- `src/domain/ports/index.ts` — assinaturas de `CategoryRepository`; `ReportRepository.dashboardCategories`; remove `GroupRepository`, `SettingsRepository.wipeCategoryData/countTransactions/countInstallmentGroups`, `ReportRepository.spendByGroupMonth`.
- `src/infra/repositories/categories.ts` · `reports.ts` · `settings.ts`.
- `src/application/use-cases/categories.ts` · `dashboard.ts` · `bi.ts`.
- `src/adapters/http/controllers/categories.ts` · `bi.ts`.
- `src/adapters/http/schemas/categories.ts` (novo arquivo de schema).
- `src/infra/composition.ts` · `src/app.ts`.
- `public/index.html` · `public/js/dashboard.js` · `public/js/ui.js` · `public/js/budget.js` · `public/js/settings.js` · `public/js/transactions.js` · `public/js/chrome.js` · `public/js/advisor.js` · `public/settings.html` · `public/bi.html` · `public/js/bi.js`.
- `test/helpers.ts` e os testes listados na Task 11.
- `README.md`.

**Apagar**
- `src/application/use-cases/groups.ts` · `src/application/use-cases/onboarding.ts`
- `src/adapters/http/controllers/groups.ts` · `src/adapters/http/controllers/onboarding.ts`
- `src/infra/repositories/groups.ts`
- `public/setup.html` · `public/js/setup.js`
- `test/onboarding.test.ts` · `test/onboardingGuard.test.ts` · `test/setupRender.test.ts`

**Fora do escopo desta fatia** (ficam para a Fatia 2/3): navegação de 3 itens, renomeação de páginas, linha de entrada rápida, painel de compromissos, fluxo do Decidir, Análise repensada, e a mudança do toggle de tema do cabeçalho para Configurações (`Nav/Top` 3:11 não tem botão de tema, e a spec §3 lista "tema" entre as responsabilidades de Configurações).

---

### Task 1: Migração 006 — `essential` e o grupo-sentinela

`categories.group_id` é `NOT NULL REFERENCES groups(id)`. Como `groups` some da API mas a coluna fica, todo `INSERT` de categoria precisa de um `group_id` válido. O sentinela `id = 0` é essa âncora: uma linha que nunca aparece em lugar nenhum.

**Files:**
- Create: `migrations/006_category_essential.sql`
- Create: `test/migrations.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: coluna `categories.essential INTEGER NOT NULL DEFAULT 0`; constante de domínio `NO_GROUP_ID = 0` (definida na Task 2).

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/migrations.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const MIGRATIONS = path.join(__dirname, '..', 'migrations');

// Roda todas as migrações, na ordem, num banco em memória — como o runner real.
function migrate(seedFn) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (f === '006_category_essential.sql' && seedFn) seedFn(db);
    db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  }
  return db;
}

test('006 adds essential defaulting to 0', () => {
  const db = migrate();
  const cols = db.prepare('PRAGMA table_info(categories)').all();
  const essential = cols.find((c) => c.name === 'essential');
  assert.ok(essential, 'categories.essential should exist');
  assert.equal(essential.notnull, 1);
  assert.equal(essential.dflt_value, '0');
});

test('006 backfills essential from the legacy "Essenciais" group', () => {
  const db = migrate((d) => {
    d.prepare("INSERT INTO groups (id, name, color, sort_order) VALUES (7, 'Essenciais / semi-fixos', 'sage', 1)").run();
    d.prepare("INSERT INTO groups (id, name, color, sort_order) VALUES (8, 'Estilo de vida', 'gold', 2)").run();
    d.prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (7, 'Supermercado', 1)").run();
    d.prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (8, 'Jogos', 2)").run();
  });
  const rows = db.prepare('SELECT name, essential FROM categories ORDER BY name').all();
  assert.deepEqual(rows, [
    { name: 'Jogos', essential: 0 },
    { name: 'Supermercado', essential: 1 },
  ]);
});

test('006 creates the invisible sentinel group with id 0', () => {
  const db = migrate();
  const g = db.prepare('SELECT id, name, active FROM groups WHERE id = 0').get();
  assert.deepEqual(g, { id: 0, name: 'Sem grupo', active: 0 });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- --test-name-pattern="006"`
Expected: FAIL — `categories.essential should exist`.

- [ ] **Step 3: Escrever a migração**

Crie `migrations/006_category_essential.sql`:

```sql
-- v0.3 §10 — grupos colapsam no atributo `essential` da categoria.
-- Aditiva: a tabela `groups` permanece intacta, só deixa de ser usada.
ALTER TABLE categories ADD COLUMN essential INTEGER NOT NULL DEFAULT 0;

-- Backfill pelo nome do grupo semeado. Limitação conhecida (spec §10): quem
-- renomeou o grupo fica com essential = 0 e corrige em Configurações.
UPDATE categories
   SET essential = 1
 WHERE group_id IN (SELECT id FROM groups WHERE name LIKE 'Essenciais%');

-- categories.group_id continua NOT NULL REFERENCES groups(id). Este sentinela
-- é o alvo de toda categoria criada a partir de agora; active = 0 garante que
-- ele nunca apareceria mesmo que algo ainda listasse grupos.
INSERT INTO groups (id, name, color, sort_order, active)
SELECT 0, 'Sem grupo', 'neutral', 0, 0
 WHERE NOT EXISTS (SELECT 1 FROM groups WHERE id = 0);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- --test-name-pattern="006"`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add migrations/006_category_essential.sql test/migrations.test.ts
git commit -m "feat(db): add categories.essential and the sentinel group (v0.3 006)"
```

---

### Task 2: Seed genérico — `002` esvaziado, `007` com as 8 categorias

**Files:**
- Create: `migrations/007_seed_defaults.sql`
- Modify: `migrations/002_seed.sql` (substituir todo o conteúdo)
- Modify: `test/migrations.test.ts` (acrescentar testes)
- Modify: `test/helpers.ts:19` (pular também `007_seed_defaults.sql`)

**Interfaces:**
- Consumes: `categories.essential` e o grupo `id = 0` da Task 1.
- Produces: em banco novo, 8 categorias ativas; nenhum cartão, nenhum limite, nenhuma configuração de renda.

- [ ] **Step 1: Escrever os testes que falham**

Acrescente ao fim de `test/migrations.test.ts`:

```ts
const DEFAULTS = [
  { name: 'Mercado', essential: 1 },
  { name: 'Transporte', essential: 1 },
  { name: 'Moradia & Contas', essential: 1 },
  { name: 'Saúde', essential: 1 },
  { name: 'Assinaturas', essential: 1 },
  { name: 'Restaurantes & Delivery', essential: 0 },
  { name: 'Lazer', essential: 0 },
  { name: 'Outros', essential: 0 },
];

test('a fresh database gets exactly the eight default categories', () => {
  const db = migrate();
  const rows = db
    .prepare('SELECT name, essential FROM categories WHERE active = 1 ORDER BY sort_order')
    .all();
  assert.deepEqual(rows, DEFAULTS);
});

test('the seed ships no personal data: no cards, no limits, no income', () => {
  const db = migrate();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM category_limits').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM settings').get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM categories WHERE examples <> ''").get().n, 0);
});

test('the default seed never touches a database that already has categories', () => {
  const db = migrate((d) => {
    d.prepare("INSERT INTO groups (id, name, color, sort_order) VALUES (7, 'Meu grupo', 'sage', 1)").run();
    d.prepare("INSERT INTO categories (group_id, name, sort_order) VALUES (7, 'Pet', 1)").run();
  });
  const rows = db.prepare('SELECT name FROM categories').all();
  assert.deepEqual(rows, [{ name: 'Pet' }]);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- --test-name-pattern="default|personal"`
Expected: FAIL — o banco novo ainda traz as 15 categorias pessoais de `002_seed.sql`.

- [ ] **Step 3: Esvaziar `002_seed.sql`**

Substitua **todo** o conteúdo de `migrations/002_seed.sql` por:

```sql
-- Intencionalmente vazio desde a v0.3 (spec §6 e §10).
--
-- Este arquivo semeava a vida pessoal do autor: categorias como "Pet (Border
-- Collie)" e "Educação & Cursos — PUC-Rio", os cartões Nubank/Mercado Pago/Itaú,
-- renda de R$ 14.350 e custos fixos de R$ 3.770. Um produto para distribuir não
-- pode nascer com as categorias de outra pessoa.
--
-- Editar este arquivo é seguro: o runner (src/infra/db.ts) registra migrações
-- por nome, sem checksum, e bancos existentes já a marcaram como aplicada — eles
-- nunca a re-executam. O seed genérico vive em 007_seed_defaults.sql.
SELECT 1;
```

- [ ] **Step 4: Escrever `007_seed_defaults.sql`**

Crie `migrations/007_seed_defaults.sql`:

```sql
-- v0.3 §6 — conjunto padrão brasileiro enxuto, para bancos novos.
--
-- A trava é uma tabela temporária avaliada UMA vez, antes do INSERT: se já
-- existe qualquer categoria, este arquivo não faz nada. Isso o torna seguro
-- para instalações existentes, que rodam 007 pela primeira vez com dados dentro.
--
-- Sem `examples` (os antigos eram estabelecimentos pessoais), sem limites
-- (nascem na primeira revisão mensal), sem cartões (o primeiro nasce no
-- primeiro lançamento) e sem renda/custos/meta (nascem no passo 3 do Decidir).
CREATE TEMP TABLE v03_seed_gate AS SELECT (SELECT COUNT(*) FROM categories) = 0 AS ok;

INSERT INTO categories (group_id, name, examples, sort_order, active, essential)
SELECT 0, d.column1, '', d.column2, 1, d.column3
  FROM (VALUES
         ('Mercado',                 1, 1),
         ('Transporte',              2, 1),
         ('Moradia & Contas',        3, 1),
         ('Saúde',                   4, 1),
         ('Assinaturas',             5, 1),
         ('Restaurantes & Delivery', 6, 0),
         ('Lazer',                   7, 0),
         ('Outros',                  8, 0)
       ) d,
       v03_seed_gate g
 WHERE g.ok;

DROP TABLE v03_seed_gate;
```

- [ ] **Step 5: Fazer os helpers de teste pularem o seed**

Em `test/helpers.ts:19`, troque a linha do filtro:

```ts
    .filter((f) => f.endsWith('.sql') && f !== '002_seed.sql' && f !== '007_seed_defaults.sql')
```

Ainda em `test/helpers.ts`, a categoria criada à mão passa a declarar `essential` — substitua o bloco das linhas 24–28 por:

```ts
  const g = db.prepare("INSERT INTO groups (name, sort_order) VALUES ('Test', 0)").run();
  const c = db
    .prepare(
      "INSERT INTO categories (group_id, name, sort_order, essential) VALUES (?, 'Supermercado', 0, 1)",
    )
    .run(g.lastInsertRowid);
  const card = db.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
```

- [ ] **Step 6: Rodar os testes de migração**

Run: `npm test -- --test-name-pattern="default|personal|006|seed"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add migrations/002_seed.sql migrations/007_seed_defaults.sql test/migrations.test.ts test/helpers.ts
git commit -m "feat(db): replace the personal seed with eight generic BR categories"
```

---

### Task 3: `essential` atravessa domínio, repositório, use-case e HTTP

**Files:**
- Modify: `src/domain/entities/index.ts:8-15`
- Modify: `src/domain/ports/index.ts:22-34`
- Modify: `src/infra/repositories/categories.ts`
- Modify: `src/application/use-cases/categories.ts`
- Create: `src/adapters/http/schemas/categories.ts`
- Modify: `src/adapters/http/controllers/categories.ts`
- Test: `test/crud.test.ts`

**Interfaces:**
- Consumes: coluna `essential` (Task 1), grupo `id = 0` (Task 1).
- Produces:
  - `NO_GROUP_ID = 0` exportado de `src/domain/entities/index.ts`.
  - `Category = { id, group_id, name, examples, sort_order, active, essential }`.
  - `CategoryRepository.insert({ name, examples, sort_order, essential }): Category`
  - `CategoryRepository.update(id, { name, examples, sort_order, active, essential }): number`
  - `CreateCategoryInput = { name: string; essential?: number; examples?: string; sort_order?: number }`
  - `UpdateCategoryInput = CreateCategoryInput & { active?: number }`
  - `POST/PUT /api/categories` deixam de aceitar `group_id`; aceitam `essential` (0 ou 1).

- [ ] **Step 1: Escrever o teste que falha**

Crie um arquivo novo `test/categories.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { makeTestDb } = require('./helpers');
const { createApp } = require('../src/app');

test('POST /api/categories creates without a group and defaults to non-essential', async () => {
  const { db } = makeTestDb();
  const res = await request(createApp(db)).post('/api/categories').send({ name: 'Farmácia' }).expect(201);
  assert.equal(res.body.name, 'Farmácia');
  assert.equal(res.body.essential, 0);
  assert.equal(res.body.group_id, 0);
});

test('POST /api/categories honours essential', async () => {
  const { db } = makeTestDb();
  const res = await request(createApp(db))
    .post('/api/categories')
    .send({ name: 'Moradia & Contas', essential: 1 })
    .expect(201);
  assert.equal(res.body.essential, 1);
});

test('POST /api/categories rejects an essential outside 0/1', async () => {
  const { db } = makeTestDb();
  await request(createApp(db)).post('/api/categories').send({ name: 'X', essential: 2 }).expect(400);
});

test('PUT /api/categories/:id flips essential', async () => {
  const { db, categoryId } = makeTestDb();
  const res = await request(createApp(db))
    .put(`/api/categories/${categoryId}`)
    .send({ name: 'Supermercado', essential: 0 })
    .expect(200);
  assert.equal(res.body.essential, 0);
});

test('GET /api/categories exposes essential', async () => {
  const { db } = makeTestDb();
  const res = await request(createApp(db)).get('/api/categories').expect(200);
  assert.equal(res.body[0].essential, 1);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- --test-name-pattern="categories"`
Expected: FAIL — hoje `POST /api/categories` exige `group_id` e responde 400 `group_id does not exist`.

- [ ] **Step 3: Domínio e portas**

Em `src/domain/entities/index.ts`, substitua a interface `Category` (linhas 8–15) por:

```ts
// categories.group_id continua NOT NULL REFERENCES groups(id) no schema, mas
// grupos saíram da UI e da API na v0.3: toda categoria aponta para o sentinela.
export const NO_GROUP_ID = 0;

export interface Category {
  id: number;
  group_id: number;
  name: string;
  examples: string;
  sort_order: number;
  active: number;
  essential: number; // 0 | 1
}
```

Em `src/domain/ports/index.ts`: apague a interface `GroupRepository` inteira (linhas 10–20) e o `Group` do bloco de import; substitua `CategoryRepository` (linhas 22–34) por:

```ts
export interface CategoryRepository {
  listAll(): Category[]; // ORDER BY sort_order, id
  listActive(): Category[];
  listActiveIds(): number[]; // SELECT id WHERE active=1 (insertion order; for GET /api/limits)
  findById(id: number): Category | undefined;
  nextSortOrder(): number; // MAX(sort_order)+1 WHERE active=1
  insert(c: { name: string; examples: string; sort_order: number; essential: number }): Category;
  update(
    id: number,
    c: { name: string; examples: string; sort_order: number; active: number; essential: number },
  ): number;
  deactivate(id: number): number;
}
```

- [ ] **Step 4: Repositório**

Em `src/infra/repositories/categories.ts`, substitua `insert` e `update` (linhas 31–45) por:

```ts
    insert(c) {
      const r = db
        .prepare(
          'INSERT INTO categories (group_id, name, examples, sort_order, essential) VALUES (?, ?, ?, ?, ?)',
        )
        .run(NO_GROUP_ID, c.name, c.examples, c.sort_order, c.essential);
      return db.prepare('SELECT * FROM categories WHERE id=?').get(r.lastInsertRowid) as Category;
    },
    update(id, c) {
      return db
        .prepare(
          'UPDATE categories SET name=?, examples=?, sort_order=?, active=?, essential=? WHERE id=?',
        )
        .run(c.name, c.examples, c.sort_order, c.active, c.essential, id).changes;
    },
```

e ajuste o import do topo:

```ts
import { type Category, NO_GROUP_ID } from '../../domain/entities';
```

- [ ] **Step 5: Use-case**

Substitua **todo** o conteúdo de `src/application/use-cases/categories.ts` por:

```ts
import type { Category } from '../../domain/entities';
import { AppError } from '../../domain/errors';
import type { CategoryRepository } from '../../domain/ports';

export interface CategoryUseCaseDeps {
  categories: CategoryRepository;
}

export interface CreateCategoryInput {
  name: string;
  essential?: number;
  examples?: string;
  sort_order?: number;
}
export interface UpdateCategoryInput extends CreateCategoryInput {
  active?: number;
}

const flag = (v: number | undefined): number => (v ? 1 : 0);

export function makeCategoryUseCases(deps: CategoryUseCaseDeps) {
  const { categories } = deps;

  return {
    list(): Category[] {
      return categories.listAll();
    },
    create(input: CreateCategoryInput): Category {
      return categories.insert({
        name: input.name,
        examples: input.examples ?? '',
        sort_order: input.sort_order ?? categories.nextSortOrder(),
        essential: flag(input.essential),
      });
    },
    update(id: number, input: UpdateCategoryInput): Category {
      const changes = categories.update(id, {
        name: input.name,
        examples: input.examples ?? '',
        sort_order: input.sort_order ?? 0,
        active: (input.active ?? 1) ? 1 : 0,
        essential: flag(input.essential),
      });
      if (changes === 0) throw new AppError(404, 'category not found');
      return categories.findById(id) as Category;
    },
    remove(id: number): void {
      if (categories.deactivate(id) === 0) throw new AppError(404, 'category not found');
    },
  };
}
```

- [ ] **Step 6: Schema e controller HTTP**

Crie `src/adapters/http/schemas/categories.ts`:

```ts
import { z } from 'zod';

// `essential` é opcional (default 0) mas, se vier, tem de ser 0 ou 1 — evitar
// que um `true`/`2` acidental vire um valor gravado sem sentido.
const essentialFlag = z.custom<number | undefined>(
  (v) => v === undefined || v === 0 || v === 1,
  { message: 'essential must be 0 or 1' },
);

export const categoryBodySchema = z.object({
  name: z.custom<string>((v) => !!v, { message: 'name is required' }),
  essential: essentialFlag,
});
```

Em `src/adapters/http/controllers/categories.ts`, troque o import de `nameBodySchema` e as duas chamadas de `parse`:

```ts
import { categoryBodySchema } from '../schemas/categories';
```

```ts
  router.post('/', (req, res) => {
    parse(categoryBodySchema, req.body);
    res.status(201).json(uc.create(req.body));
  });

  router.put('/:id', (req, res) => {
    parse(categoryBodySchema, req.body);
    res.json(uc.update(Number(req.params.id), req.body));
  });
```

- [ ] **Step 7: Ajustar a composição**

Em `src/infra/composition.ts:82-85`, o use-case de categorias perde a dependência de grupos:

```ts
    categories: makeCategoryUseCases({ categories: repositories.categories }),
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `npm test -- --test-name-pattern="categories"`
Expected: PASS (5 testes). `npm run typecheck` ainda vai falhar — `groups` continua referenciado; a Task 4 resolve.

- [ ] **Step 9: Commit**

```bash
git add src/domain src/infra/repositories/categories.ts src/application/use-cases/categories.ts src/adapters/http src/infra/composition.ts test/categories.test.ts
git commit -m "feat(api): categories carry essential and drop group_id"
```

---

### Task 4: Remover `/api/groups` e `/api/onboarding` do backend

**Files:**
- Delete: `src/application/use-cases/groups.ts`, `src/application/use-cases/onboarding.ts`, `src/adapters/http/controllers/groups.ts`, `src/adapters/http/controllers/onboarding.ts`, `src/infra/repositories/groups.ts`, `test/onboarding.test.ts`
- Modify: `src/app.ts:21,28`, `src/infra/composition.ts`, `src/domain/ports/index.ts`, `src/infra/repositories/settings.ts`, `src/application/use-cases/bi.ts`, `src/adapters/http/controllers/bi.ts`
- Test: `test/app.test.ts`

**Interfaces:**
- Consumes: use-case de categorias sem grupos (Task 3).
- Produces: `GET /api/groups`, `POST /api/onboarding/*` e `GET /api/bi/by-group` respondem **404**. `Container.controllers` perde `groups` e `onboarding`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente ao fim de `test/app.test.ts`:

```ts
test('v0.3 retires the groups and onboarding endpoints', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).get('/api/groups').expect(404);
  await request(app).get('/api/onboarding').expect(404);
  await request(app).post('/api/onboarding/complete').expect(404);
  await request(app).get('/api/bi/by-group?from=2026-01&to=2026-02').expect(404);
});
```

Se `test/app.test.ts` ainda não importar `makeTestDb`/`request`/`createApp`, copie o cabeçalho de `test/onboarding.test.ts` (linhas 1–5) antes de apagá-lo.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- --test-name-pattern="retires"`
Expected: FAIL — as rotas respondem 200.

- [ ] **Step 3: Apagar os arquivos mortos**

```bash
git rm src/application/use-cases/groups.ts src/application/use-cases/onboarding.ts \
       src/adapters/http/controllers/groups.ts src/adapters/http/controllers/onboarding.ts \
       src/infra/repositories/groups.ts test/onboarding.test.ts
```

- [ ] **Step 4: Limpar `app.ts`**

Em `src/app.ts`, apague as linhas `app.use('/api/groups', controllers.groups);` e `app.use('/api/onboarding', controllers.onboarding);`.

- [ ] **Step 5: Limpar a composição**

Em `src/infra/composition.ts`: remova os imports de `makeGroupsController`, `makeOnboardingController`, `makeGroupUseCases`, `makeOnboardingUseCases`, `makeGroupRepository`; remova `groups` e `onboarding` da interface `Container['controllers']`; remova `groups: makeGroupRepository(db)` de `repositories`; remova as entradas `groups` e `onboarding` de `useCases`; remova `groups: repositories.groups` das deps de `bi`; remova `groups`/`onboarding` de `controllers`.

- [ ] **Step 6: Limpar portas e repositório de settings**

Em `src/domain/ports/index.ts`, tire `spendByGroupMonth` de `ReportRepository` e reduza `SettingsRepository` a:

```ts
export interface SettingsRepository {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  setMany(entries: [string, string][]): void; // atomic
}
```

Em `src/infra/repositories/settings.ts`, apague `countTransactions`, `countInstallmentGroups` e `wipeCategoryData` (eram usados só pelo onboarding).
Em `src/infra/repositories/reports.ts`, apague `spendByGroupMonth` (linhas 33–43).

- [ ] **Step 7: Tirar `by-group` do BI**

Em `src/application/use-cases/bi.ts`: apague o método `byGroup` (linhas 44–52), a dep `groups` e o import de `GroupRepository`.
Em `src/adapters/http/controllers/bi.ts`: apague a rota `/by-group` (linhas 22–25).

- [ ] **Step 8: Rodar tudo e confirmar**

Run: `npm run typecheck && npm test -- --test-name-pattern="retires"`
Expected: typecheck limpo; teste PASS. Outros testes ainda falham (Task 11 os atualiza).

- [ ] **Step 9: Commit**

```bash
git add -A src test/app.test.ts
git commit -m "refactor(api): retire the groups and onboarding endpoints"
```

---

### Task 5: Dashboard agrega por `essential` e informa `configured`

O herói do Acompanhar depende de saber se o modelo de poupança existe. A ausência de `monthly_income` é esse sinal (spec §10) — nenhuma flag nova.

**Files:**
- Modify: `src/application/use-cases/dashboard.ts`
- Modify: `src/infra/repositories/reports.ts` (`dashboardCategories`)
- Modify: `src/domain/ports/index.ts` (`ReportRepository.dashboardCategories`)
- Test: `test/dashboard.test.ts`

**Interfaces:**
- Consumes: `Category.essential` (Task 3).
- Produces: `GET /api/dashboard?month=YYYY-MM` →

```ts
{
  month: string;
  configured: boolean;            // existe monthly_income gravado
  entry_count: number;            // transações no mês — alimenta o subtítulo (Task 6)
  categories: Array<{
    category_id: number; name: string; examples: string; essential: number;
    limit_cents: number; spent_cents: number; carry_in_cents: number;
    effective_spent_cents: number; remaining_cents: number;
    status: 'ok' | 'approaching' | 'over';
  }>;
  by_essential: { essential_cents: number; non_essential_cents: number };
  totals: {
    limit_cents: number; spent_cents: number;
    monthly_income_cents: number; fixed_costs_cents: number; savings_goal_cents: number;
    can_spend_cents: number;        // renda − fixos − meta  (era `teto_cents`)
    left_to_spend_cents: number;    // can_spend − gasto
    projected_savings_cents: number;
    vs_goal_cents: number;
  };
}
```

`groups` e `teto_cents` **somem do payload**.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente a `test/dashboard.test.ts`:

```ts
test('dashboard aggregates by essential and reports the unconfigured state', async () => {
  const { db, categoryId, cardId } = makeTestDb();
  const lazer = db
    .prepare("INSERT INTO categories (group_id, name, sort_order, essential) VALUES (0, 'Lazer', 2, 0)")
    .run().lastInsertRowid;
  const tx = db.prepare(
    'INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES (?,?,?,?)',
  );
  tx.run('2026-08-03', categoryId, cardId, 30000); // essencial
  tx.run('2026-08-04', lazer, cardId, 12000); // não essencial

  const res = await request(createApp(db)).get('/api/dashboard?month=2026-08').expect(200);
  assert.equal(res.body.configured, false);
  assert.deepEqual(res.body.by_essential, { essential_cents: 30000, non_essential_cents: 12000 });
  assert.equal(res.body.groups, undefined);
  assert.equal(res.body.totals.teto_cents, undefined);
  assert.equal(res.body.categories[0].essential, 1);
});

test('dashboard reports the configured state and "posso gastar"', async () => {
  const { db, categoryId, cardId } = makeTestDb();
  db.prepare('INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES (?,?,?,?)')
    .run('2026-08-03', categoryId, cardId, 386000);
  const app = createApp(db);
  await request(app)
    .put('/api/settings')
    .send({ monthly_income: 1200000, fixed_costs: 386000, savings_goal: 250000 })
    .expect(200);

  const res = await request(app).get('/api/dashboard?month=2026-08').expect(200);
  assert.equal(res.body.configured, true);
  assert.equal(res.body.totals.can_spend_cents, 564000); // 12.000 − 3.860 − 2.500
  assert.equal(res.body.totals.left_to_spend_cents, 178000); // 5.640 − 3.860
  assert.equal(res.body.totals.projected_savings_cents, 428000); // 12.000 − 3.860 − 3.860
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- --test-name-pattern="by essential|posso gastar"`
Expected: FAIL — `by_essential` é `undefined`.

- [ ] **Step 3: Ajustar a porta e o repositório de reports**

Em `src/domain/ports/index.ts`, `ReportRepository` ganha a contagem do mês e a assinatura de categorias fica simplesmente:

```ts
  dashboardCategories(): Category[];
  countTransactions(month: string): number;
```

Em `src/infra/repositories/reports.ts`, apague o type `DashboardCategoryRow` e substitua o método por:

```ts
    dashboardCategories(): Category[] {
      // Essenciais primeiro — é a ordem em que a pessoa lê "o que é obrigatório".
      return db
        .prepare(
          'SELECT * FROM categories WHERE active = 1 ORDER BY essential DESC, sort_order, id',
        )
        .all() as Category[];
    },
    countTransactions(month: string): number {
      return (
        db
          .prepare("SELECT COUNT(*) AS n FROM transactions WHERE strftime('%Y-%m', date) = ?")
          .get(month) as { n: number }
      ).n;
    },
```

- [ ] **Step 4: Reescrever o use-case do dashboard**

Em `src/application/use-cases/dashboard.ts`, substitua o corpo do `return { build(month) { ... } }` (linhas 31–98) por:

```ts
  return {
    build(month: string) {
      const categories = reports.dashboardCategories().map((c) => {
        const limit_cents = limits.resolve(c.id, month);
        const spent_cents = limits.sumSpend(c.id, month);
        const carry_in_cents = computeCarryIn(c.id, month);
        const effective_spent_cents = spent_cents + carry_in_cents;
        return {
          category_id: c.id,
          name: c.name,
          examples: c.examples,
          essential: c.essential,
          limit_cents,
          spent_cents,
          carry_in_cents,
          effective_spent_cents,
          remaining_cents: limit_cents - effective_spent_cents,
          status: budgetStatus(effective_spent_cents, limit_cents),
        };
      });

      const sumWhere = (essential: number) =>
        categories.reduce((s, c) => (c.essential === essential ? s + c.spent_cents : s), 0);

      const income = num('monthly_income');
      const fixed = num('fixed_costs');
      const goal = num('savings_goal');
      const spent_cents = categories.reduce((s, c) => s + c.spent_cents, 0);
      const can_spend_cents = income - fixed - goal;
      const projected_savings_cents = income - fixed - spent_cents;

      return {
        month,
        // A ausência de renda é o que separa o estado inicial do completo (§10).
        configured: settings.get('monthly_income') !== undefined,
        entry_count: reports.countTransactions(month),
        categories,
        by_essential: {
          essential_cents: sumWhere(1),
          non_essential_cents: sumWhere(0),
        },
        totals: {
          limit_cents: categories.reduce((s, c) => s + c.limit_cents, 0),
          spent_cents,
          monthly_income_cents: income,
          fixed_costs_cents: fixed,
          savings_goal_cents: goal,
          can_spend_cents,
          left_to_spend_cents: can_spend_cents - spent_cents,
          projected_savings_cents,
          vs_goal_cents: projected_savings_cents - goal,
        },
      };
    },
  };
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- --test-name-pattern="by essential|posso gastar" && npm run typecheck`
Expected: PASS, typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add src/application/use-cases/dashboard.ts src/infra/repositories/reports.ts src/domain/ports/index.ts test/dashboard.test.ts
git commit -m "feat(api): dashboard aggregates by essential and exposes configured + can_spend"
```

---

### Task 6: Acompanhar — os dois estados do herói

O ponto da fatia inteira: com uma transação e zero configuração, a tela já diz alguma coisa.

> **Nota sobre o Figma:** no frame `Acompanhar — Estado completo` (10:16) os números do mock não fecham entre si (o "de R$ 8.140,00 previstos" é renda − custos fixos, enquanto o passo 3 do Decidir define "posso gastar" como renda − fixos − meta). A definição da spec §5 e do passo 3 é a correta e é a implementada aqui: **posso gastar = renda − custos fixos − meta**, e o número grande é o que ainda sobra dele. Não "conserte" para bater com o mock.
>
> **Segunda divergência intencional:** no frame `Hero — Para onde foi` (12:54) os seis medidores exibem `R$ 620,00 / R$ 850,00` e todos se chamam "Mercado" — são duplicatas não renomeadas do componente, não uma decisão de design. A spec §6 define esse herói como a **composição** dos gastos do mês, então cada linha aqui é `valor · percentual do total`, e não `gasto / limite` (no estado inicial não há limite algum). Também não "conserte" para bater com o mock.

**Files:**
- Modify: `public/js/dashboard.js` (reescrita das funções de render)
- Modify: `public/index.html`
- Modify: `public/js/ui.js` (remover `groupTag`)
- Modify: `public/js/advisor.js` (só no estado completo)
- Test: `test/dashboardRender.test.ts` (reescrito)

**Interfaces:**
- Consumes: payload do `GET /api/dashboard` da Task 5.
- Produces, exportados de `public/js/dashboard.js`:
  - `renderHero(d)` → despacha por `d.configured`
  - `renderHeroConfigured(d)` · `renderHeroInitial(d)`
  - `renderCategories(d)` · `renderReviewInvite()`
  - `monthLabel(month)` · `monthSubtitle(d, today)` — a linha de contexto sob o título

- [ ] **Step 1: Escrever os testes que falham**

Substitua **todo** o conteúdo de `test/dashboardRender.test.ts` por:

```ts
const { test } = require('node:test');
const assert = require('node:assert');

const configured = {
  month: '2026-08',
  configured: true,
  categories: [
    {
      category_id: 1, name: 'Mercado', examples: '', essential: 1,
      limit_cents: 85000, spent_cents: 62000, carry_in_cents: 0,
      effective_spent_cents: 62000, remaining_cents: 23000, status: 'ok',
    },
    {
      category_id: 2, name: 'Restaurantes & Delivery', examples: '', essential: 0,
      limit_cents: 65000, spent_cents: 71200, carry_in_cents: 0,
      effective_spent_cents: 71200, remaining_cents: -6200, status: 'over',
    },
    {
      category_id: 3, name: 'Lazer', examples: '', essential: 0,
      limit_cents: 0, spent_cents: 24000, carry_in_cents: 0,
      effective_spent_cents: 24000, remaining_cents: -24000, status: 'ok',
    },
  ],
  by_essential: { essential_cents: 62000, non_essential_cents: 95200 },
  totals: {
    limit_cents: 150000, spent_cents: 157200,
    monthly_income_cents: 1200000, fixed_costs_cents: 386000, savings_goal_cents: 250000,
    can_spend_cents: 564000, left_to_spend_cents: 406800,
    projected_savings_cents: 657000, vs_goal_cents: 407000,
  },
};

const initial = {
  month: '2026-08',
  configured: false,
  categories: [
    { category_id: 1, name: 'Mercado', examples: '', essential: 1, limit_cents: 0, spent_cents: 62000, carry_in_cents: 0, effective_spent_cents: 62000, remaining_cents: -62000, status: 'ok' },
    { category_id: 3, name: 'Lazer', examples: '', essential: 0, limit_cents: 0, spent_cents: 24000, carry_in_cents: 0, effective_spent_cents: 24000, remaining_cents: -24000, status: 'ok' },
  ],
  by_essential: { essential_cents: 62000, non_essential_cents: 24000 },
  totals: {
    limit_cents: 0, spent_cents: 86000,
    monthly_income_cents: 0, fixed_costs_cents: 0, savings_goal_cents: 0,
    can_spend_cents: 0, left_to_spend_cents: 0, projected_savings_cents: -86000, vs_goal_cents: -86000,
  },
};

test('renderHero picks the initial hero when nothing is configured', async () => {
  const { renderHero } = await import('../public/js/dashboard.js');
  const html = renderHero(initial);
  assert.match(html, /PARA ONDE SEU DINHEIRO FOI/);
  assert.match(html, /R\$ 860,00/); // total gasto no mês
  assert.doesNotMatch(html, /POSSO GASTAR/);
});

test('the initial hero breaks the month down by category share', async () => {
  const { renderHeroInitial } = await import('../public/js/dashboard.js');
  const html = renderHeroInitial(initial);
  assert.match(html, /Mercado/);
  assert.match(html, /72%/); // 62.000 de 86.000
  assert.match(html, /28%/); // 24.000 de 86.000
});

test('renderHero shows "posso gastar" once income exists', async () => {
  const { renderHero } = await import('../public/js/dashboard.js');
  const html = renderHero(configured);
  assert.match(html, /POSSO GASTAR ESTE MÊS/);
  assert.match(html, /R\$ 4\.068,00/); // left_to_spend
  assert.match(html, /R\$ 5\.640,00/); // can_spend, na linha de apoio
  assert.match(html, /Projeção de sobra/);
});

test('renderCategories meters spend against the limit, flat — no group headers', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const html = renderCategories(configured);
  assert.match(html, /Mercado/);
  assert.match(html, /meter-fill over/); // Restaurantes estourou
  assert.doesNotMatch(html, /Essenciais/);
  assert.doesNotMatch(html, /tag-sage/); // o chip de grupo morreu
});

test('renderCategories shows a limitless category as an amount, not as an error', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const html = renderCategories(configured);
  const lazer = html.slice(html.indexOf('Lazer'));
  assert.match(lazer, /sem limite/);
  assert.match(lazer, /R\$ 240,00/);
});

test('renderCategories keeps the carry-over badge', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const d = {
    ...configured,
    categories: [
      { category_id: 9, name: 'Jogos', examples: '', essential: 0, limit_cents: 10000, spent_cents: 8000, carry_in_cents: 3000, effective_spent_cents: 11000, remaining_cents: -1000, status: 'over' },
    ],
  };
  const html = renderCategories(d);
  assert.match(html, /saldo/);
  assert.match(html, /R\$ 30,00/);
});

test('renderCategories links each row to the category screen', async () => {
  const { renderCategories } = await import('../public/js/dashboard.js');
  const html = renderCategories(configured);
  assert.match(html, /href="category\.html\?id=1&month=2026-08"/);
});

test('renderReviewInvite points at the place where limits are set', async () => {
  const { renderReviewInvite } = await import('../public/js/dashboard.js');
  const html = renderReviewInvite();
  assert.match(html, /Ainda sem tetos por categoria/);
  assert.match(html, /href="settings\.html"/);
});

// Linha de contexto sob o título (Figma 10:15 e 12:53). `today` é injetado para
// que o teste não dependa da data em que roda.
test('monthSubtitle counts the days left when the budget is configured', async () => {
  const { monthSubtitle } = await import('../public/js/dashboard.js');
  assert.equal(monthSubtitle(configured, '2026-08-06'), 'Agosto de 2026 · faltam 25 dias para fechar o mês');
});

test('monthSubtitle counts the entries when nothing is configured', async () => {
  const { monthSubtitle } = await import('../public/js/dashboard.js');
  const d = { ...initial, entry_count: 14 };
  assert.equal(monthSubtitle(d, '2026-08-06'), 'Agosto de 2026 · 14 lançamentos até agora');
});

test('monthSubtitle says so when the month is already closed', async () => {
  const { monthSubtitle } = await import('../public/js/dashboard.js');
  assert.equal(monthSubtitle(configured, '2026-09-02'), 'Agosto de 2026 · mês fechado');
});
```

**Sobre `entry_count`:** o estado inicial mostra "14 lançamentos até agora", um número
que o payload do dashboard ainda não traz. Some `entry_count` ao retorno da Task 5 —
é `categories.reduce` sobre uma contagem, não uma consulta nova: acrescente
`countTransactions(month)` a `ReportRepository` (`SELECT COUNT(*) FROM transactions
WHERE strftime('%Y-%m', date) = ?`) e exponha o resultado como `entry_count` no
payload. Se preferir manter a Task 5 fechada, faça isso aqui e ajuste o teste de
dashboard correspondente.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- test/dashboardRender.test.ts`
Expected: FAIL — `renderHeroInitial is not a function`.

- [ ] **Step 3: Reescrever `public/js/dashboard.js`**

Substitua **todo** o conteúdo por:

```js
import { renderAdvisor } from './advisor.js';
import { api, showError } from './api.js';
import { mountChrome } from './chrome.js';
import { currentMonth, esc, formatBRL } from './format.js';
import { meterBar, statusPill } from './ui.js';

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function monthLabel(month) {
  const [y, m] = String(month).split('-').map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

// Linha de contexto sob o título (Figma 10:15 / 12:53). `today` entra como
// parâmetro — uma função que lê o relógio por dentro não tem como ser testada.
export function monthSubtitle(d, today) {
  const head = monthLabel(d.month).replace(/^./, (c) => c.toUpperCase());
  if (!d.configured) {
    const n = d.entry_count ?? 0;
    return `${head} · ${n} ${n === 1 ? 'lançamento' : 'lançamentos'} até agora`;
  }
  const [y, m] = String(d.month).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const now = new Date(`${today}T00:00:00Z`);
  const end = Date.UTC(y, m - 1, lastDay);
  const left = Math.round((end - now.getTime()) / 86400000);
  if (left < 0) return `${head} · mês fechado`;
  if (left === 0) return `${head} · último dia do mês`;
  return `${head} · ${left === 1 ? 'falta 1 dia' : `faltam ${left} dias`} para fechar o mês`;
}

// Estado inicial (§6): funciona a partir da primeira transação, sem pedir nada.
export function renderHeroInitial(d) {
  const total = d.totals.spent_cents;
  const rows = d.categories
    .filter((c) => c.spent_cents > 0)
    .sort((a, b) => b.spent_cents - a.spent_cents)
    .map((c) => {
      const pct = total > 0 ? Math.round((c.spent_cents / total) * 100) : 0;
      return `
      <div class="mb-3">
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-semibold">${esc(c.name)}</span>
          <span class="font-mono text-sm text-ink-mut">${formatBRL(c.spent_cents)} · ${pct}%</span>
        </div>
        <div class="meter mt-1"><div class="meter-fill" style="width:${pct}%"></div></div>
      </div>`;
    })
    .join('');
  return `
    <section class="paper-card">
      <div class="label-caps text-ink-mut">PARA ONDE SEU DINHEIRO FOI</div>
      <div class="font-display text-5xl text-ink leading-none mt-1">${formatBRL(total)}</div>
      <p class="text-sm text-ink-mut mt-2 mb-5">em ${esc(monthLabel(d.month))}, distribuídos assim:</p>
      ${rows || `<p class="text-ink-mut">Nenhum lançamento neste mês ainda.</p>`}
    </section>`;
}

// Estado completo (§6): renda e custos fixos existem, então a projeção existe.
export function renderHeroConfigured(d) {
  const t = d.totals;
  const line = (label, cents) => `
    <div class="flex items-baseline justify-between gap-4 text-sm">
      <span class="text-ink-mut">${label}</span>
      <span class="font-mono">${formatBRL(cents)}</span>
    </div>`;
  const ok = t.left_to_spend_cents >= 0;
  return `
    <section class="paper-card grid md:grid-cols-2 gap-6 items-center">
      <div>
        <div class="label-caps text-ink-mut">POSSO GASTAR ESTE MÊS</div>
        <div class="font-display text-5xl ${ok ? 'text-sage' : 'text-clay'} leading-none mt-1">${formatBRL(t.left_to_spend_cents)}</div>
        <p class="text-sm text-ink-mut mt-2">de ${formatBRL(t.can_spend_cents)} previstos · ${formatBRL(t.spent_cents)} já gastos</p>
        <div class="mt-3">${meterBar(t.spent_cents, t.can_spend_cents, ok ? 'ok' : 'over')}</div>
      </div>
      <div class="md:border-l md:border-line md:pl-6 space-y-2">
        ${line('Renda', t.monthly_income_cents)}
        ${line('Custos fixos', t.fixed_costs_cents)}
        ${line('Meta de poupança', t.savings_goal_cents)}
        <div class="pt-2 border-t border-line">${line('Projeção de sobra', t.projected_savings_cents)}</div>
      </div>
    </section>`;
}

export function renderHero(d) {
  return d.configured ? renderHeroConfigured(d) : renderHeroInitial(d);
}

// Lista plana: os cabeçalhos de grupo sumiram junto com os grupos.
export function renderCategories(d) {
  const month = d.month || '';
  const rows = d.categories
    .map((c) => {
      const carry = c.carry_in_cents || 0;
      const eff = c.effective_spent_cents ?? c.spent_cents;
      const right = c.limit_cents > 0
        ? `<span class="font-mono text-sm text-ink-mut">${formatBRL(eff)} / ${formatBRL(c.limit_cents)}</span>`
        : `<span class="font-mono text-sm text-ink-mut">${formatBRL(eff)} <span class="text-xs">· sem limite</span></span>`;
      const meter = c.limit_cents > 0
        ? `<div class="mt-2 flex items-center gap-3">
             <div class="flex-1">${meterBar(eff, c.limit_cents, c.status)}</div>
             ${carry > 0 ? `<span class="pill pill-over">+${formatBRL(carry)} saldo</span>` : ''}
             ${statusPill(c.status)}
           </div>`
        : '';
      return `
      <a href="category.html?id=${c.category_id}&month=${month}"
         class="paper-card block hover:border-sage transition-colors">
        <div class="flex items-baseline justify-between gap-4">
          <span class="font-semibold">${esc(c.name)}</span>
          ${right}
        </div>
        ${meter}
      </a>`;
    })
    .join('');
  return `
    <section class="mt-8">
      <h2 class="font-display text-2xl text-ink mb-3">Por categoria</h2>
      <div class="space-y-3">${rows}</div>
    </section>`;
}

// Não é banner de "complete seu perfil": é o convite para o ritual (§6).
export function renderReviewInvite() {
  return `
    <section class="paper-card mt-8 flex flex-col md:flex-row md:items-center gap-4">
      <div class="flex-1">
        <h2 class="font-display text-xl text-ink">Ainda sem tetos por categoria</h2>
        <p class="text-sm text-ink-mut mt-1">Definir renda, custos fixos e limites é o primeiro passo da revisão mensal.</p>
      </div>
      <a href="settings.html" class="btn-ghost whitespace-nowrap self-start md:self-auto">Começar a revisão</a>
    </section>`;
}

async function load(month) {
  try {
    const d = await api.get(`/api/dashboard?month=${month}`);
    const sub = document.getElementById('subtitle');
    if (sub) sub.textContent = monthSubtitle(d, new Date().toISOString().slice(0, 10));
    document.getElementById('hero').innerHTML = renderHero(d);
    document.getElementById('body').innerHTML = d.configured
      ? renderCategories(d) + renderAdvisor(d)
      : renderReviewInvite();
  } catch (e) {
    showError(e.message);
  }
}

if (typeof document !== 'undefined' && document.getElementById('hero')) {
  mountChrome('/');
  const monthEl = document.getElementById('month');
  monthEl.value = currentMonth();
  monthEl.addEventListener('change', () => load(monthEl.value));
  load(monthEl.value);
}
```

- [ ] **Step 4: Ajustar o HTML e o `ui.js`**

Em `public/index.html`, troque `<div id="groups"></div>` (linha 19) por `<div id="body"></div>` e o `<title>` por `Gastando — Acompanhar`. Acrescente também, logo abaixo do título da página, o alvo da linha de contexto:

```html
      <p id="subtitle" class="text-ink-mut mt-2"></p>
```

Em `public/js/ui.js`, apague a função `groupTag` (linhas 27–34) inteira.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm test -- test/dashboardRender.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 6: Commit**

```bash
git add public/js/dashboard.js public/js/ui.js public/index.html test/dashboardRender.test.ts
git commit -m "feat(ui): Acompanhar gains an initial and a configured hero"
```

---

### Task 7: Configurações sem grupos, com `essential` e com "Posso gastar"

**Files:**
- Modify: `public/js/budget.js`
- Modify: `public/js/settings.js`
- Modify: `public/settings.html:33` (rótulo)
- Test: `test/settingsRender.test.ts`, `test/budget.test.ts`

**Interfaces:**
- Consumes: `essential` no payload de `/api/categories` (Task 3).
- Produces, exportados de `public/js/budget.js`:
  - `renderCategoryRows(cats, byCat): string` — substitui `renderGroupedLimitRows` **e** `renderLimitRows`
  - `canSpendText(income, fixed, goal): string` — substitui `ceilingText`
  - `GROUP_COLORS`, `colorSwatches` deixam de existir.

- [ ] **Step 1: Escrever os testes que falham**

Substitua o conteúdo de `test/settingsRender.test.ts` por:

```ts
const { test } = require('node:test');
const assert = require('node:assert');

const cats = [
  { id: 1, name: 'Mercado', active: 1, essential: 1 },
  { id: 2, name: 'Lazer', active: 1, essential: 0 },
  { id: 3, name: 'Antiga', active: 0, essential: 0 },
];
const byCat = new Map([
  [1, 85000],
  [2, 20000],
]);

test('renderCategoryRows lists only active categories, flat', async () => {
  const { renderCategoryRows } = await import('../public/js/budget.js');
  const html = renderCategoryRows(cats, byCat);
  assert.match(html, /Mercado/);
  assert.match(html, /Lazer/);
  assert.doesNotMatch(html, /Antiga/);
  assert.doesNotMatch(html, /grupo/i);
});

test('renderCategoryRows renders the essential toggle in both states', async () => {
  const { renderCategoryRows } = await import('../public/js/budget.js');
  const html = renderCategoryRows(cats, byCat);
  assert.match(html, /data-essential="1"[^>]*checked/);
  assert.match(html, /data-essential="2"(?![^>]*checked)/);
});

test('renderCategoryRows prefills the limit in reais', async () => {
  const { renderCategoryRows } = await import('../public/js/budget.js');
  const html = renderCategoryRows(cats, byCat);
  assert.match(html, /data-cat="1"[^>]*value="850"/);
});

test('canSpendText names the number the way the user asks the question', async () => {
  const { canSpendText } = await import('../public/js/budget.js');
  assert.equal(canSpendText(1200000, 386000, 250000), 'Posso gastar este mês R$ 5.640,00');
});
```

Em `test/budget.test.ts`, troque as importações/asserções de `ceilingText` por `canSpendText` com a mesma aritmética, e apague qualquer teste de `renderGroupedLimitRows`/`colorSwatches`/`GROUP_COLORS`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- test/settingsRender.test.ts`
Expected: FAIL — `renderCategoryRows is not a function`.

- [ ] **Step 3: Reescrever `public/js/budget.js`**

Substitua **todo** o conteúdo por:

```js
import { esc, formatBRL } from './format.js';

// Helpers puros do modelo de orçamento, sem efeito no DOM.

export function nameEditor(kind, id, value) {
  return `<span class="inline-flex items-center gap-1">
    <input data-edit-input="${kind}:${id}" value="${esc(value)}"
      class="rounded border border-line px-2 py-0.5 text-sm" />
    <button data-save="${kind}:${id}" class="text-sage text-sm">Salvar</button>
    <button data-cancel="${kind}:${id}" class="text-ink-mut text-sm">Cancelar</button>
  </span>`;
}

export function canSpendText(income, fixed, goal) {
  return `Posso gastar este mês ${formatBRL(income - fixed - goal)}`;
}

// Lista plana de categorias: limite, marcação de essencial e ações.
// `essential` é o que sobrou dos grupos — quem renomeou grupos antes da
// migração 006 corrige aqui (spec §10).
export function renderCategoryRows(cats, byCat) {
  const rows = cats
    .filter((c) => c.active)
    .map(
      (c) => `
    <tr class="border-b border-line">
      <td class="py-2" data-name-cell="cat:${c.id}">${esc(c.name)}</td>
      <td class="py-2 text-center">
        <label class="inline-flex items-center gap-1 text-xs text-ink-mut">
          <input type="checkbox" data-essential="${c.id}" ${c.essential ? 'checked' : ''} /> essencial
        </label>
      </td>
      <td class="py-2 text-right">
        <input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}"
          class="w-32 rounded border border-line bg-card px-2 py-1 text-right font-mono" />
      </td>
      <td class="py-2 text-right">
        <button data-cat-rename="${c.id}" class="text-sage text-sm mr-2">Renomear</button>
        <button data-cat-del="${c.id}" class="text-clay text-sm">Remover</button>
      </td>
    </tr>`,
    )
    .join('');
  return `${rows}
    <tr>
      <td class="py-2" colspan="4"><button data-add-cat class="text-sage text-sm">+ Adicionar categoria</button></td>
    </tr>`;
}

// --- Reconciliação de alocação: os limites cabem no "posso gastar"? ---

export function allocationStatus(limitCentsList, income, fixed, goal) {
  const ceiling = income - fixed - goal;
  const allocated = limitCentsList.reduce((sum, n) => sum + (n || 0), 0);
  const remaining = ceiling - allocated;
  return { ceiling, allocated, remaining, over: remaining < 0 };
}

export function allocationText(status) {
  const head = `Alocado ${formatBRL(status.allocated)} de ${formatBRL(status.ceiling)}`;
  return status.over
    ? `${head} · ${formatBRL(-status.remaining)} acima do que posso gastar`
    : `${head} · ${formatBRL(status.remaining)} disponível`;
}

export function allocationPillClass(status) {
  return status.over ? 'pill pill-over' : 'pill pill-ok';
}
```

- [ ] **Step 4: Ajustar `public/js/settings.js`**

Aplique estas mudanças:

1. Import: troque `renderGroupedLimitRows, renderLimitRows` e `ceilingText` por `canSpendText, renderCategoryRows`; a linha de re-export (linha 15) vira `export { canSpendText, renderCategoryRows };`
2. `state` (linha 18) vira `const state = { cats: [] };`
3. `loadLimits` deixa de buscar grupos:

```js
async function loadLimits() {
  try {
    const [cats, limits] = await Promise.all([
      api.get('/api/categories'),
      api.get(`/api/limits?month=${$('month').value}`),
    ]);
    state.cats = cats;
    const byCat = new Map(limits.map((l) => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = renderCategoryRows(cats, byCat);
    wireLimitInputs();
    wireEssentialToggles();
    updateAllocation();
  } catch (e) {
    showError(e.message);
  }
}

function wireEssentialToggles() {
  $('limits')
    .querySelectorAll('input[data-essential]')
    .forEach((box) => {
      box.addEventListener('change', async () => {
        const id = Number(box.dataset.essential);
        const c = state.cats.find((x) => x.id === id);
        try {
          await api.put(`/api/categories/${id}`, { ...c, essential: box.checked ? 1 : 0 });
          c.essential = box.checked ? 1 : 0;
        } catch (e) {
          box.checked = !box.checked;
          showError(e.message);
        }
      });
    });
}
```

4. `beginRename` perde o ramo de grupo: `const cur = state.cats.find((c) => c.id === id).name;`
5. `beginAdd` só trata categoria: assinatura `beginAdd()`, seletor `'[data-add-cat]'`, e `cell.innerHTML = nameEditor('addcat', 'new', '');`
6. `saveEdit`: apague os ramos `group` e `addgroup`; o ramo `addcat` vira `await api.post('/api/categories', { name: val });`
7. `onLimitsClick`: apague os ramos `groupDel`, `groupRename`, `groupColor` e `data-add-group`; o ramo `addCat` vira `if (e.target.hasAttribute('data-add-cat')) { beginAdd(); return; }`

- [ ] **Step 5: Ajustar o `settings.html`**

Em `public/settings.html:21`, troque o título da seção para `Modelo de poupança` (mantém) e, na linha 28, o `<span id="ceiling">` mantém o id mas passa a exibir o texto de `allocationText` — nenhuma mudança de markup é necessária. Acrescente a coluna de cabeçalho da tabela de limites, substituindo a linha 38 por:

```html
      <table class="w-full text-left">
        <thead><tr class="text-xs uppercase tracking-wide text-ink-mut border-b border-line">
          <th class="py-2 font-semibold">Categoria</th>
          <th class="py-2 text-center font-semibold">Essencial</th>
          <th class="py-2 text-right font-semibold">Limite</th>
          <th class="py-2"></th>
        </tr></thead>
        <tbody id="limits"></tbody>
      </table>
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `npm test -- test/settingsRender.test.ts test/budget.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add public/js/budget.js public/js/settings.js public/settings.html test/settingsRender.test.ts test/budget.test.ts
git commit -m "feat(ui): settings drops groups and edits the essential flag"
```

---

### Task 8: Transações e BI param de falar de grupos

**Files:**
- Modify: `public/js/transactions.js:34-66, 11-32`
- Modify: `public/bi.html:28`, `public/js/bi.js`
- Test: `test/transactionsRender.test.ts`, `test/ui.test.ts`, `test/escaping.test.ts`, `test/biChart.test.ts`

**Interfaces:**
- Consumes: `groupTag` removido (Task 6), `/api/groups` e `/api/bi/by-group` mortos (Task 4).
- Produces: `renderRows(rows, refs)` com `refs = { cats: Map<id,{name}>, cards: Map<id,name> }` — sem `groups`.

- [ ] **Step 1: Escrever o teste que falha**

Em `test/transactionsRender.test.ts`, ajuste a fixture para `refs` sem `groups` e acrescente:

```ts
test('renderRows shows the category name without any group chip', async () => {
  const { renderRows } = await import('../public/js/transactions.js');
  const html = renderRows(
    [{ id: 1, date: '2026-08-03', description: 'Assaí', category_id: 1, card_id: 1, amount_cents: 12300 }],
    { cats: new Map([[1, { name: 'Mercado' }]]), cards: new Map([[1, 'Nubank']]) },
  );
  assert.match(html, /Mercado/);
  assert.doesNotMatch(html, /tag-sage|tag-gold|tag-slate|tag-neutral/);
});
```

Em `test/ui.test.ts` e `test/escaping.test.ts`, apague os testes de `groupTag`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- test/transactionsRender.test.ts`
Expected: FAIL — a linha ainda tem o chip.

- [ ] **Step 3: Ajustar `public/js/transactions.js`**

1. Import: apague `import { groupTag } from './ui.js';`
2. `lookups` (linha 9) vira `const lookups = { cats: new Map(), cards: new Map() };`
3. Em `renderRows`, o default do segundo parâmetro vira `{ cats: new Map(), cards: new Map() }`; apague a linha `const groupName = ...` e troque a célula de categoria por:

```js
      <td class="py-3 text-sm">${esc(refs.cats.get(r.category_id)?.name ?? '')}</td>
```

4. Em `loadSelectors`, o `Promise.all` perde `/api/groups`:

```js
  const [cats, cards] = await Promise.all([api.get('/api/categories'), api.get('/api/cards')]);
  lookups.cats = new Map(cats.map((c) => [c.id, { name: c.name }]));
  lookups.cards = new Map(cards.map((c) => [c.id, c.name]));
```

(apague a linha `lookups.groups = ...`).

- [ ] **Step 4: Tirar o gráfico de grupo do BI**

Em `public/bi.html`, apague a `<div class="paper-card">` inteira do "Gasto por grupo" (linha 28).
Em `public/js/bi.js`: tire `api.get(\`/api/bi/by-group?${qs}\`)` do `Promise.all` e a variável `byGroup` da desestruturação; apague o bloco `const groupAgg = ...` / `barChart('byGroup', ...)` e o bloco de `topSeries`/`byGroupImpact` (linhas 27–36). `topSeries` continua exportado de `charts.js` — a Fatia 3 volta a usá-lo em "O que mais mudou este mês?".

- [ ] **Step 5: Rodar e confirmar**

Run: `npm test -- test/transactionsRender.test.ts test/ui.test.ts test/escaping.test.ts test/biChart.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/js/transactions.js public/js/bi.js public/bi.html test/
git commit -m "refactor(ui): transactions and BI stop referencing groups"
```

---

### Task 9: Matar o wizard

**Files:**
- Delete: `public/setup.html`, `public/js/setup.js`, `test/setupRender.test.ts`, `test/onboardingGuard.test.ts`
- Modify: `public/js/chrome.js:32-44, 63-65`
- Test: `test/chrome.test.ts`

**Interfaces:**
- Consumes: `/api/onboarding` já morto (Task 4).
- Produces: `mountChrome(active)` não faz mais nenhuma chamada de rede; `enforceOnboarding` deixa de existir.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente a `test/chrome.test.ts`:

```ts
test('chrome no longer ships an onboarding guard', async () => {
  const mod = await import('../public/js/chrome.js');
  assert.equal(mod.enforceOnboarding, undefined);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- test/chrome.test.ts`
Expected: FAIL — `enforceOnboarding` ainda é exportado.

- [ ] **Step 3: Apagar wizard e guarda**

```bash
git rm public/setup.html public/js/setup.js test/setupRender.test.ts test/onboardingGuard.test.ts
```

Em `public/js/chrome.js`: apague a função `enforceOnboarding` inteira (linhas 32–44, incluindo o comentário acima dela) e o bloco final dentro de `mountChrome`:

```js
  if (typeof fetch !== 'undefined' && typeof location !== 'undefined') {
    enforceOnboarding(fetch, location);
  }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- test/chrome.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A public test
git commit -m "feat: remove the onboarding wizard — the app opens usable"
```

---

### Task 10: Suíte verde, lint e docs

**Files:**
- Modify: `test/crud.test.ts`, `test/bi.test.ts`, `test/dashboard.test.ts`, `test/installments.test.ts`, `test/transactions.test.ts`, `test/categoryRender.test.ts`, `test/advisor.test.ts` (o que sobrar quebrado)
- Modify: `README.md`
- Modify: `package.json` (`version`)

**Interfaces:**
- Consumes: tudo das tasks 1–9.
- Produces: `npm test`, `npm run typecheck` e `npm run lint` limpos.

- [ ] **Step 1: Rodar a suíte inteira e listar o estrago**

Run: `npm test 2>&1 | tail -40`
Expected: falhas concentradas em testes que ainda criam categorias com `group_id`, chamam `/api/groups`, ou esperam `teto_cents`/`groups` no payload do dashboard.

- [ ] **Step 2: Corrigir cada teste**

Regras de conversão, aplicadas mecanicamente:

- `POST /api/categories` com `{ group_id: X, name }` → `{ name }` (e `essential: 1` quando o teste depende de a categoria ser essencial).
- Qualquer bloco de teste que exercite `/api/groups` (CRUD, 409 de grupo com categorias, cores) → **apagar o teste**; a capacidade não existe mais.
- `INSERT INTO categories (group_id, name, sort_order)` em SQL cru → acrescentar `essential` explicitamente: `INSERT INTO categories (group_id, name, sort_order, essential) VALUES (0, 'X', 1, 0)`.
- `res.body.totals.teto_cents` → `res.body.totals.can_spend_cents`.
- `res.body.groups` → `res.body.by_essential`.
- `/api/bi/by-group` → apagar o teste.
- `ceilingText` → `canSpendText`.

- [ ] **Step 3: Rodar tudo**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 3 comandos limpos. Se o Biome reclamar de formatação, rode `npm run format`.

- [ ] **Step 4: Atualizar o README**

Em `README.md`, no parágrafo de abertura, substitua a menção a "healthy ceiling" e a "The UI is in English" por:

```markdown
category, card and month; compare actual spend against editable per-category
monthly limits; model installment purchases (*parcelas*); and see, month by
month, how much you can still spend ("posso gastar este mês") and how much you
are on track to save.

It runs entirely on your machine. There is no account, no cloud sync, and no
telemetry — everything lives in a single SQLite file you control. The UI is in
pt-BR; currency is R$.

On first run the app opens ready to use: eight generic Brazilian categories, no
setup wizard, no sample data belonging to anyone else.
```

- [ ] **Step 5: Subir a versão**

Em `package.json`, `"version": "0.3.0-alpha.1"`.

- [ ] **Step 6: Rodar o app e olhar**

Run: `rm -f /tmp/gastando-smoke.db && GASTANDO_DB=/tmp/gastando-smoke.db npm start`

(se a variável de ambiente do banco tiver outro nome, confira `src/infra/paths.ts` antes de rodar). Abra `http://localhost:3000`, confirme: nenhuma redireção para `/setup.html`; Configurações lista as 8 categorias com a marcação de essencial; lance uma transação em Transações e volte ao Acompanhar — o herói "Para onde seu dinheiro foi" aparece com a composição. Encerre com Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: green suite, pt-BR README and 0.3.0-alpha.1"
```

---

## Definition of Done

- [ ] `npm test`, `npm run typecheck` e `npm run lint` passam.
- [ ] Banco novo abre com 8 categorias, zero cartões, zero limites, zero renda.
- [ ] Banco antigo migra sem perder nada; categorias do grupo `Essenciais%` viram `essential = 1`; a tabela `groups` continua no arquivo.
- [ ] `/api/groups`, `/api/onboarding/*` e `/api/bi/by-group` respondem 404.
- [ ] O app nunca redireciona para um wizard.
- [ ] Nenhuma string de `002_seed.sql` antigo (`Border Collie`, `PUC-Rio`, `Nubank`, `14350`) sobrevive em `migrations/`. Verifique: `grep -rniE "border collie|puc-rio|nubank|caçula" migrations/` não retorna nada.
