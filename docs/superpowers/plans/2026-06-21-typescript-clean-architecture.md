# TypeScript + Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `src/` to TypeScript with a clean (ports & adapters) architecture and Zod-validated contracts, without changing the HTTP API or breaking the `pkg` binary build.

**Architecture:** Four layers — `domain` (entities, pure services, repository interfaces), `application` (use-cases depending only on ports), `adapters/http` (controllers, Zod schemas, presenters, error mapping), and `infra` (SQLite repository implementations, db, paths, server, and the `composition.ts` DI root). The dependency rule points inward; concrete wiring lives only in the composition root.

**Tech Stack:** Node 22, TypeScript (strict, CommonJS output), Express 5, better-sqlite3, Zod, tsx (dev/test runner), `@yao-pkg/pkg` (binaries), node:test + supertest.

## Global Constraints

- **HTTP contract frozen** — every path, request body/query, response shape, status code, the `X-Total-Count` header, and the `{ error }` envelope must remain identical. Frontend `public/js` is NOT modified.
- **Preserve exact 400/404/409 messages** asserted by tests (e.g. `month must be YYYY-MM`, `amount_cents must be a positive integer`, `category_id does not exist`, `group has categories; remove them first`, `cannot reset after data exists`, `invalid template`).
- **TS output = CommonJS**, `strict: true`, target Node 22. Project stays `"type": "commonjs"`.
- **Migrations stay raw `.sql`** and run via the existing runner; `migrations/002_seed.sql` is skipped in tests.
- **`pkg` binary build stays** — `tsc` compiles to `dist/`, then `pkg dist/server.js`. `pkg.assets` (public, migrations, `better_sqlite3.node`) unchanged.
- **No raw SQL outside `infra/repositories`. No `express`/`better-sqlite3` import inside `domain` or `application`.**
- **`npm test` stays green after every task.**
- Each task ends with a commit.

---

## File Structure (end state)

```
src/
  domain/
    entities/index.ts        Transaction, Category, Group, Card, Limit, InstallmentGroup, Settings
    services/money.ts        formatBRL
    services/dates.ts        monthOf, addMonths, monthRange
    services/installments.ts splitCents (pure)
    ports/index.ts           repository interfaces + row/filter types
    errors.ts                AppError (status + message)
  application/use-cases/
    transactions.ts  categories.ts  groups.ts  cards.ts  limits.ts
    installments.ts  onboarding.ts  settings.ts  dashboard.ts  bi.ts  simulate.ts
  adapters/http/
    controllers/<resource>.ts   one per resource (thin)
    schemas/<resource>.ts       Zod request/query schemas
    validate.ts                 parse helper -> AppError(400) with exact message
    error-mapper.ts             AppError/ZodError -> { status, body:{error} }
  contracts/index.ts            response DTO types (inferred where possible)
  infra/
    db.ts  paths.ts  openBrowser.ts  server.ts
    repositories/<resource>.ts   better-sqlite3 implementations of ports
    composition.ts               wires repos -> use-cases -> controllers -> app
  app.ts                         createApp(deps) + buildAppFromDb(db)
test/                            all *.test.js -> *.test.ts; helpers.js -> helpers.ts
tsconfig.json
```

---

## PHASE 0 — Toolchain

### Task 1: TypeScript toolchain with `allowJs`

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json` (devDeps + scripts), `.gitignore` (already ignores `dist`? verify)
- Test: existing suite must still pass unchanged.

**Interfaces:**
- Produces: working `npm run typecheck`, `npm test` (still JS), `npm run build` (tsc → `dist/`).

- [ ] **Step 1: Install dev tooling**

```bash
npm install --save-dev typescript@5 tsx@4 @types/node@22 @types/express@5 @types/better-sqlite3 @types/supertest
npm install zod@3
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "checkJs": false,
    "sourceMap": true,
    "declaration": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Add scripts to `package.json`**

Replace the `scripts` block's relevant entries:

```json
"start": "tsx src/server.ts",
"build": "tsc",
"typecheck": "tsc --noEmit",
"test": "node --import tsx --test \"test/**/*.test.{js,ts}\"",
"coverage": "c8 node --import tsx --test \"test/**/*.test.{js,ts}\"",
"build:binaries": "npm run build:css && npm run build && pkg --config package.json dist/server.js"
```

Note: `start` references `src/server.ts` which does not exist yet — it is created in Task 4. Until then run the app with `node src/server.js`. The build scripts are wired now so later tasks don't touch `package.json` again.

- [ ] **Step 4: Verify the JS suite still runs under the new runner**

Run: `npm test`
Expected: all existing tests PASS (they are still `.js`; `node --import tsx` runs JS fine).

- [ ] **Step 5: Verify typecheck passes on the (still JS) tree**

Run: `npm run typecheck`
Expected: exits 0 (with `checkJs:false`, JS files are not type-checked).

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json package.json package-lock.json
git commit -m "build: add TypeScript toolchain (tsx, zod, tsc) with allowJs"
```

---

## PHASE 1 — infra layer → TS

These three files are self-contained and already have tests (`paths.test.js`, `openBrowser.test.js`). Convert them first; their tests are the safety net.

### Task 2: `paths.ts` and `openBrowser.ts`

**Files:**
- Create: `src/infra/paths.ts`, `src/infra/openBrowser.ts`
- Delete: `src/paths.js`, `src/openBrowser.js`
- Modify: `src/server.js` (require paths from `./infra/paths`), `test/paths.test.js`, `test/openBrowser.test.js` (import path only)

**Interfaces:**
- Produces:
  - `resolveDbPath(opts?: { env?: NodeJS.ProcessEnv; isPackaged?: boolean; execPath?: string; projectRoot?: string }): string`
  - `browserCommand(platform: NodeJS.Platform, url: string): { cmd: string; args: string[] }`
  - `openBrowser(url: string, opts?: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv }): boolean`

- [ ] **Step 1: Create `src/infra/paths.ts`** (logic identical to `src/paths.js`, typed)

```ts
import path from 'path';

interface ResolveDbPathOpts {
  env?: NodeJS.ProcessEnv;
  isPackaged?: boolean;
  execPath?: string;
  projectRoot?: string;
}

export function resolveDbPath(opts: ResolveDbPathOpts = {}): string {
  const env = opts.env || process.env;
  if (env.DB_PATH) return env.DB_PATH;
  const isPackaged = opts.isPackaged !== undefined ? opts.isPackaged : Boolean((process as any).pkg);
  const execPath = opts.execPath || process.execPath;
  // From dist/infra/paths.js, project root is two levels up; from src under tsx, also two up.
  const projectRoot = opts.projectRoot || path.join(__dirname, '..', '..');
  const baseDir = isPackaged ? path.dirname(execPath) : projectRoot;
  return path.join(baseDir, 'data', 'gastando.db');
}
```

NOTE the `__dirname` change: the old file was at `src/paths.js` (`..` = root); the new file is at `src/infra/paths.ts` → compiled `dist/infra/paths.js`, so root is `../..`. This is the path-resolution risk called out in the spec — the test below pins it.

- [ ] **Step 2: Update `test/paths.test.js`**

Change the require to `const { resolveDbPath } = require('../src/infra/paths');` and ensure the non-packaged test passes `projectRoot` explicitly OR asserts the path ends with `data/gastando.db` rather than hard-coding the root (the default root is now `../..` from the file). Keep all existing assertions for `DB_PATH`, packaged `execPath`, and explicit `projectRoot`.

- [ ] **Step 3: Create `src/infra/openBrowser.ts`** (identical logic, typed signatures above). Update `test/openBrowser.test.js` require to `../src/infra/openBrowser`.

- [ ] **Step 4: Update `src/server.js`** require: `const { resolveDbPath } = require('./infra/paths');` and `const { openBrowser } = require('./infra/openBrowser');`

- [ ] **Step 5: Delete `src/paths.js` and `src/openBrowser.js`**

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS (paths + openBrowser tests green, tsc clean).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move paths/openBrowser to src/infra in TypeScript"
```

### Task 3: `db.ts` and the domain errors module

**Files:**
- Create: `src/infra/db.ts`, `src/domain/errors.ts`
- Delete: `src/db.js`
- Modify: `src/server.js`, `test/helpers.js` (require path), any test requiring `../src/db`

**Interfaces:**
- Produces:
  - `import Database from 'better-sqlite3'; export type Db = Database.Database;`
  - `openDatabase(filename: string): Db`
  - `runMigrations(db: Db, dir?: string): void`
  - `class AppError extends Error { status: number; constructor(status: number, message: string) }`

- [ ] **Step 1: Create `src/domain/errors.ts`**

```ts
export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}
```

- [ ] **Step 2: Create `src/infra/db.ts`** (logic identical to `src/db.js`, typed; default migrations dir is `path.join(__dirname, '..', '..', 'migrations')` to match the new depth)

```ts
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDatabase(filename: string): Db {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function runMigrations(db: Db, dir = path.join(__dirname, '..', '..', 'migrations')): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map(r => r.name),
  );
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    })();
  }
}
```

- [ ] **Step 3: Update requires** in `src/server.js` (`./infra/db`) and any test that does `require('../src/db')`. Leave `test/helpers.js` opening its own in-memory DB (it doesn't import `db.js`).

- [ ] **Step 4: Delete `src/db.js`**

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move db runner to src/infra and add domain AppError"
```

### Task 4: `server.ts`, `app.ts`, and the composition skeleton

**Files:**
- Create: `src/server.ts`, `src/app.ts`, `src/infra/composition.ts`
- Delete: `src/server.js`, `src/app.js`
- Modify: every `test/*.js` that does `require('../src/app')` → keep path `../src/app` (resolves to `app.ts` under tsx); no change needed if extension is omitted.

**Interfaces:**
- Consumes: `openDatabase`, `runMigrations`, `resolveDbPath`, `openBrowser`.
- Produces:
  - `buildAppFromDb(db: Db): express.Express` — wires composition root from a raw db (used by tests and server).
  - `createApp(deps: AppDeps): express.Express` — wires from already-constructed controllers (used once full DI lands).
  - `buildContainer(db: Db): Container` in `composition.ts` (initially returns `{ db }`, grows each phase).

- [ ] **Step 1: Create `src/infra/composition.ts` (skeleton)**

```ts
import type { Db } from './db';

export interface Container {
  db: Db;
  // repositories, use-cases, and controllers are added in later phases
}

export function buildContainer(db: Db): Container {
  return { db };
}
```

- [ ] **Step 2: Create `src/app.ts`** — for now it mirrors today's `app.js` but routed through the container. Until controllers are migrated, mount the existing JS routes from the container's `db` so behavior is unchanged.

```ts
import express from 'express';
import path from 'path';
import { buildContainer, Container } from './infra/composition';
import type { Db } from './infra/db';
// existing JS route factories still work via require during the migration:
const groups = require('./routes/groups');
const categories = require('./routes/categories');
const cards = require('./routes/cards');
const limits = require('./routes/limits');
const transactions = require('./routes/transactions');
const installmentGroups = require('./routes/installmentGroups');
const settings = require('./routes/settings');
const onboarding = require('./routes/onboarding');
const dashboard = require('./routes/dashboard');
const bi = require('./routes/bi');
const simulate = require('./routes/simulate');
const { errorHandler } = require('./errorHandler');

export function createApp(container: Container): express.Express {
  const app = express();
  const db = container.db;
  app.use(express.json());
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/groups', groups(db));
  app.use('/api/categories', categories(db));
  app.use('/api/cards', cards(db));
  app.use('/api/limits', limits(db));
  app.use('/api/transactions', transactions(db));
  app.use('/api/installment-groups', installmentGroups(db));
  app.use('/api/settings', settings(db));
  app.use('/api/onboarding', onboarding(db));
  app.use('/api/dashboard', dashboard(db));
  app.use('/api/bi', bi(db));
  app.use('/api/simulate', simulate(db));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(errorHandler);
  return app;
}

export function buildAppFromDb(db: Db): express.Express {
  return createApp(buildContainer(db));
}
```

IMPORTANT — keep tests working: tests currently call `createApp(ctx.db)`. Add backward-compatibility by accepting either a `Db` or a `Container`:

```ts
export function createApp(arg: Container | Db): express.Express {
  const container: Container = 'db' in (arg as any) ? (arg as Container) : buildContainer(arg as Db);
  // ...use container.db
}
```

Keep this dual signature until Task 19 (test port) when all callers pass a container or use `buildAppFromDb`.

- [ ] **Step 3: Create `src/server.ts`**

```ts
import fs from 'fs';
import path from 'path';
import { openDatabase, runMigrations } from './infra/db';
import { buildAppFromDb } from './app';
import { resolveDbPath } from './infra/paths';
import { openBrowser } from './infra/openBrowser';

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDatabase(dbPath);
runMigrations(db);

const port = Number(process.env.PORT) || 3000;
buildAppFromDb(db).listen(port, () => {
  console.log(`Gastando listening on :${port}`);
  openBrowser(`http://localhost:${port}`);
});
```

- [ ] **Step 4: Delete `src/server.js` and `src/app.js`. Keep `src/errorHandler.js` and `src/routes/*` and `src/services/*` (migrated later).**

- [ ] **Step 5: Run app + tests**

Run: `npm start` (should boot via tsx, open browser unless `NO_OPEN=1`), then `NO_OPEN=1 npm test && npm run typecheck`
Expected: app boots; all tests PASS; tsc clean.

- [ ] **Step 6: Three-runtime path check (the spec's named risk)**

Run:
```bash
npm run build && NO_OPEN=1 PORT=3999 node -e "require('./dist/server.js')" & sleep 2; curl -s localhost:3999/api/health; kill %1
```
Expected: `{"ok":true}` and a `data/gastando.db` created at project root (compiled path resolution correct).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: TypeScript server/app entrypoints with composition skeleton"
```

---

## PHASE 2 — domain pure services + ports

### Task 5: Pure domain services (money, dates, installments split)

**Files:**
- Create: `src/domain/services/money.ts`, `src/domain/services/dates.ts`, `src/domain/services/installments.ts`
- Modify: `test/money.test.js`, `test/dates.test.js`, `test/installments.test.js` (require paths), and `src/services/*` consumers (re-export shims, see below)
- Keep temporarily: `src/services/money.js` etc. re-export from new location to avoid touching every consumer at once.

**Interfaces:**
- Produces:
  - `formatBRL(cents: number): string`
  - `monthOf(date: string): string`
  - `addMonths(ym: string, n: number): string`
  - `monthRange(from: string, to: string): string[]` (moved here from `services/bi.js`)
  - `splitCents(total: number, count: number): number[]`

- [ ] **Step 1: Create `src/domain/services/money.ts`** (copy `formatBRL` from `src/services/money.js`, add `: number` / `: string` types).

- [ ] **Step 2: Create `src/domain/services/dates.ts`** with `monthOf`, `addMonths`, and `monthRange` (move `monthRange` out of `services/bi.js`):

```ts
export function monthOf(date: string): string {
  return String(date).slice(0, 7);
}
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let cur = from;
  for (let i = 0; i < 600 && cur <= to; i++) { months.push(cur); cur = addMonths(cur, 1); }
  return months;
}
```

- [ ] **Step 3: Create `src/domain/services/installments.ts`** with ONLY the pure `splitCents` (the DB-touching `createInstallmentPurchase`/`deleteInstallmentGroup` move to the repository in Task 8):

```ts
// Split total into `count` parts; first (total % count) parts get +1 cent.
export function splitCents(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
```

- [ ] **Step 4: Convert `src/services/money.js`, `dates.js` into re-export shims** so existing JS routes keep importing `../services/...`:

```js
// src/services/money.js
module.exports = require('../domain/services/money');
```
Do the same for `dates.js`. For `installments.js`, keep `createInstallmentPurchase`/`deleteInstallmentGroup` as-is for now but import `splitCents` from the new module:
```js
const { splitCents } = require('../domain/services/installments');
```
For `bi.js`, import `monthRange` from `../domain/services/dates` and delete its local copy.

- [ ] **Step 5: Update tests** `test/money.test.js`, `test/dates.test.js`, `test/installments.test.js` to require the new module paths for the pure functions. Keep assertions identical.

- [ ] **Step 6: Run tests + typecheck**

Run: `NO_OPEN=1 npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: pure domain services (money/dates/split) in TypeScript"
```

### Task 6: Domain entities and repository ports

**Files:**
- Create: `src/domain/entities/index.ts`, `src/domain/ports/index.ts`
- Test: `test/ports.types.test.ts` (a compile-time/structural smoke test — see step)

**Interfaces (these names are referenced by every later task — keep them exact):**

- [ ] **Step 1: Create `src/domain/entities/index.ts`**

```ts
export interface Group { id: number; name: string; color: string; sort_order: number; active: number; }
export interface Category { id: number; group_id: number; name: string; examples: string; sort_order: number; active: number; }
export interface Card { id: number; name: string; active: number; }
export interface CategoryLimit { id: number; category_id: number; month: string; limit_cents: number; }
export interface InstallmentGroup {
  id: number; description: string; total_cents: number; total_count: number;
  first_month: string; category_id: number; card_id: number;
}
export interface Transaction {
  id: number; date: string; category_id: number; card_id: number; amount_cents: number;
  description: string; installment_group_id: number | null;
  installment_no: number | null; installment_total: number | null;
}
```

- [ ] **Step 2: Create `src/domain/ports/index.ts`** — interfaces only (no implementation). These map 1:1 to current SQL. Define exactly:

```ts
import type { Group, Category, Card, CategoryLimit, Transaction } from '../entities';

export interface GroupRepository {
  listActive(): Group[];
  findById(id: number): Group | undefined;
  findActiveById(id: number): Group | undefined;
  nextSortOrder(): number;
  insert(g: { name: string; color: string; sort_order: number }): Group;
  update(id: number, g: { name: string; color: string; sort_order: number }): number; // changes
  countActiveCategories(groupId: number): number;
  deactivate(id: number): number; // changes (active=1 guard)
}

export interface CategoryRepository {
  listAll(): Category[];                 // ORDER BY sort_order, id
  listActive(): Category[];
  findById(id: number): Category | undefined;
  nextSortOrder(): number;               // MAX(sort_order)+1 WHERE active=1
  insert(c: { group_id: number; name: string; examples: string; sort_order: number }): Category;
  update(id: number, c: { group_id: number; name: string; examples: string; sort_order: number; active: number }): number;
  deactivate(id: number): number;
}

export interface CardRepository {
  listAll(): Card[];                     // ORDER BY id
  findById(id: number): Card | undefined;
  insert(c: { name: string }): Card;
  update(id: number, c: { name: string; active: number }): number;
  deactivate(id: number): number;
}

export interface TransactionFilter { month?: string; categoryId?: number; cardId?: number; }
export interface TransactionPage extends TransactionFilter { limit?: number | null; offset?: number; }

export interface TransactionRepository {
  list(p: TransactionPage): Transaction[];
  count(f: TransactionFilter): number;
  findById(id: number): Transaction | undefined;
  insert(t: { date: string; category_id: number; card_id: number; amount_cents: number; description: string }): Transaction;
  update(id: number, t: { date: string; category_id: number; card_id: number; amount_cents: number; description: string }): number;
  remove(id: number): number;
  firstByGroup(groupId: number): Transaction | undefined;
}

export interface LimitRepository {
  resolve(categoryId: number, month: string): number;   // carry-forward pick, 0 if none
  upsert(categoryId: number, month: string, limitCents: number): void;
  sumSpend(categoryId: number, month: string): number;
  firstTxMonth(categoryId: number): string | null;
}

export interface InstallmentRepository {
  // atomic: insert group + N child transactions; returns new group id
  createPurchase(p: {
    category_id: number; card_id: number; description: string;
    total_cents: number; count: number; first_month: string;
  }): number;
  remove(id: number): void;              // throws AppError(404) if absent
}

export interface SettingsRepository {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  setMany(entries: [string, string][]): void;  // atomic
  countTransactions(): number;
  countInstallmentGroups(): number;
  wipeCategoryData(): void;              // atomic: delete limits, categories, groups
}

export interface ReportRepository {
  spendByCategoryMonth(categoryId: number, month: string): number;
  spendByCardMonth(cardId: number, month: string): number;
  spendByGroupMonth(groupId: number, month: string): number;
  spendAllMonth(month: string): number;
  installmentSpendMonth(month: string): number;
  dashboardCategories(): Array<Category & { group_name: string; group_color: string; group_sort: number }>;
}
```

- [ ] **Step 3: Add a structural smoke test `test/ports.types.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert';
import type { TransactionRepository } from '../src/domain/ports';

test('ports module is importable and shaped', () => {
  // Pure type module: assert a no-op so the test file type-checks the imports.
  const noop: Partial<TransactionRepository> = {};
  assert.equal(typeof noop, 'object');
});
```

- [ ] **Step 4: Run tests + typecheck**

Run: `NO_OPEN=1 npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: domain entities and repository ports"
```

---

## PHASE 3 — data layer (SQLite repositories)

Each repository implements a port using the EXACT SQL from today's routes/services. After each repository lands, its consuming route is refactored to use it (still a JS route at this point) so tests stay green. One task per repository keeps diffs reviewable.

**Canonical repository pattern (transactions — the most complex; implement fully):**

### Task 7: `TransactionRepository`

**Files:**
- Create: `src/infra/repositories/transactions.ts`
- Modify: `src/routes/transactions.js` (use the repo for list/count/insert/update/remove/firstByGroup; keep validation inline for now)
- Test: existing `test/transactions.test.js` is the safety net (unchanged).

**Interfaces:**
- Consumes: `Db`, `TransactionRepository`, `TransactionPage`, `Transaction`.
- Produces: `makeTransactionRepository(db: Db): TransactionRepository`.

- [ ] **Step 1: Implement `src/infra/repositories/transactions.ts`**

```ts
import type { Db } from '../db';
import type { Transaction } from '../../domain/entities';
import type { TransactionRepository, TransactionPage, TransactionFilter } from '../../domain/ports';

function buildWhere(f: TransactionFilter): { clause: string; args: unknown[] } {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.month !== undefined) { where.push("strftime('%Y-%m', date) = ?"); args.push(f.month); }
  if (f.categoryId !== undefined) { where.push('category_id = ?'); args.push(f.categoryId); }
  if (f.cardId !== undefined) { where.push('card_id = ?'); args.push(f.cardId); }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

export function makeTransactionRepository(db: Db): TransactionRepository {
  return {
    list(p: TransactionPage): Transaction[] {
      const { clause, args } = buildWhere(p);
      let sql = `SELECT * FROM transactions ${clause} ORDER BY date DESC, id DESC`;
      const a = [...args];
      if (p.limit !== null && p.limit !== undefined) { sql += ' LIMIT ? OFFSET ?'; a.push(p.limit, p.offset ?? 0); }
      return db.prepare(sql).all(...a) as Transaction[];
    },
    count(f: TransactionFilter): number {
      const { clause, args } = buildWhere(f);
      return (db.prepare(`SELECT COUNT(*) AS n FROM transactions ${clause}`).get(...args) as { n: number }).n;
    },
    findById(id) { return db.prepare('SELECT * FROM transactions WHERE id=?').get(id) as Transaction | undefined; },
    insert(t) {
      const r = db.prepare(
        `INSERT INTO transactions (date, category_id, card_id, amount_cents, description)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(t.date, t.category_id, t.card_id, t.amount_cents, t.description);
      return db.prepare('SELECT * FROM transactions WHERE id=?').get(r.lastInsertRowid) as Transaction;
    },
    update(id, t) {
      return db.prepare(
        `UPDATE transactions SET date=?, category_id=?, card_id=?, amount_cents=?, description=? WHERE id=?`,
      ).run(t.date, t.category_id, t.card_id, t.amount_cents, t.description, id).changes;
    },
    remove(id) { return db.prepare('DELETE FROM transactions WHERE id=?').run(id).changes; },
    firstByGroup(groupId) {
      return db.prepare('SELECT * FROM transactions WHERE installment_group_id=? ORDER BY date LIMIT 1')
        .get(groupId) as Transaction | undefined;
    },
  };
}
```

- [ ] **Step 2: Refactor `src/routes/transactions.js`** to build `const repo = makeTransactionRepository(db);` and replace inline SQL with `repo.*` calls. Keep the validation (`isDate`, `isPositiveInt`, category/card existence) and the `X-Total-Count` header exactly as-is. Existence checks may still use `db.prepare(...)` for now (moved to use-case in Phase 4).

- [ ] **Step 3: Run the transactions suite**

Run: `NO_OPEN=1 node --import tsx --test test/transactions.test.js`
Expected: PASS (create/filter/update/delete, validation, pagination + `x-total-count`).

- [ ] **Step 4: Full suite + typecheck**

Run: `NO_OPEN=1 npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: TransactionRepository; route uses repo for data access"
```

### Tasks 8–13: Remaining repositories (same pattern as Task 7)

For each, create `src/infra/repositories/<name>.ts` exporting `make<Name>Repository(db: Db): <Name>Repository`, port the EXACT SQL listed below, then refactor the matching JS route/service to call it. Run `NO_OPEN=1 npm test && npm run typecheck` and commit after each.

> The SQL below is copied verbatim from the current code — implement it exactly, including ordering and the `active=1` guards, or response shapes will drift.

- [ ] **Task 8 — `InstallmentRepository`** (`src/infra/repositories/installments.ts`)
  - `createPurchase(p)`: wrap in `db.transaction`: insert into `installment_groups (description,total_cents,total_count,first_month,category_id,card_id)`; then for `splitCents(total_cents,count)` insert each child into `transactions (date,category_id,card_id,amount_cents,description,installment_group_id,installment_no,installment_total)` with `date = \`${addMonths(first_month,i)}-01\``, `installment_no = i+1`, `installment_total = count`. Return the group id. (Import `splitCents` from `domain/services/installments`, `addMonths` from `domain/services/dates`.)
  - `remove(id)`: `db.transaction`: `DELETE FROM transactions WHERE installment_group_id=?`; `DELETE FROM installment_groups WHERE id=?`; if `changes===0` `throw new AppError(404, 'installment group not found')`.
  - Refactor `src/services/installments.js` to delegate to this repo (keep its exported names so `routes/transactions.js` and `routes/installmentGroups.js` keep working), then have routes call the repo. Tests: `test/installments.test.js`.

- [ ] **Task 9 — `CategoryRepository`** (`src/infra/repositories/categories.ts`)
  - `listAll`: `SELECT * FROM categories ORDER BY sort_order, id`
  - `findById`: `SELECT * FROM categories WHERE id=?`
  - `nextSortOrder`: `SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM categories WHERE active=1`
  - `insert`: `INSERT INTO categories (group_id,name,examples,sort_order) VALUES (?,?,?,?)` → return row by id
  - `update`: `UPDATE categories SET group_id=?,name=?,examples=?,sort_order=?,active=? WHERE id=?` (active passed as `active ? 1 : 0`)
  - `deactivate`: `UPDATE categories SET active=0 WHERE id=?`
  - Group existence for category routes uses `GroupRepository.findActiveById` (Task 10) — refactor `routes/categories.js` to use both repos. Tests: `test/crud.test.js`.

- [ ] **Task 10 — `GroupRepository`** (`src/infra/repositories/groups.ts`)
  - `listActive`: `SELECT * FROM groups WHERE active=1 ORDER BY sort_order, id`
  - `findById`: `SELECT * FROM groups WHERE id=?`; `findActiveById`: `SELECT id FROM groups WHERE id=? AND active=1`
  - `nextSortOrder`: `SELECT COALESCE(MAX(sort_order),0)+1 AS n FROM groups WHERE active=1`
  - `insert`: `INSERT INTO groups (name,color,sort_order) VALUES (?,?,?)`
  - `update`: `UPDATE groups SET name=?,color=?,sort_order=? WHERE id=? AND active=1`
  - `countActiveCategories`: `SELECT COUNT(*) AS n FROM categories WHERE group_id=? AND active=1`
  - `deactivate`: `UPDATE groups SET active=0 WHERE id=? AND active=1`
  - Refactor `routes/groups.js`. Tests: `test/crud.test.js`.

- [ ] **Task 11 — `CardRepository`** (`src/infra/repositories/cards.ts`)
  - `listAll`: `SELECT * FROM cards ORDER BY id`; `findById`: `SELECT * FROM cards WHERE id=?`
  - `insert`: `INSERT INTO cards (name) VALUES (?)`; `update`: `UPDATE cards SET name=?,active=? WHERE id=?`; `deactivate`: `UPDATE cards SET active=0 WHERE id=?`
  - Refactor `routes/cards.js`. Tests: `test/crud.test.js`.

- [ ] **Task 12 — `LimitRepository`** (`src/infra/repositories/limits.ts`)
  - `resolve`: `SELECT limit_cents FROM category_limits WHERE category_id=? AND month<=? ORDER BY month DESC LIMIT 1` → `row ? row.limit_cents : 0`
  - `upsert`: `INSERT INTO category_limits (category_id,month,limit_cents) VALUES (?,?,?) ON CONFLICT(category_id,month) DO UPDATE SET limit_cents=excluded.limit_cents`
  - `sumSpend`: `SELECT COALESCE(SUM(amount_cents),0) AS s FROM transactions WHERE category_id=? AND strftime('%Y-%m', date)=?` → `s`
  - `firstTxMonth`: `SELECT MIN(strftime('%Y-%m', date)) AS m FROM transactions WHERE category_id=?` → `m` (string|null)
  - Refactor `routes/limits.js` (uses `resolve`/`upsert` + `CategoryRepository.findById`/`listActive`). Tests: `test/budget.test.js`.

- [ ] **Task 13 — `SettingsRepository` + `ReportRepository`** (`src/infra/repositories/settings.ts`, `src/infra/repositories/reports.ts`)
  - Settings `get`: `SELECT value FROM settings WHERE key=?`; `set`/`setMany`: `INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value` (setMany wrapped in `db.transaction`); `countTransactions`/`countInstallmentGroups`: `SELECT COUNT(*) AS n ...`; `wipeCategoryData`: `db.transaction` deleting `category_limits`, `categories`, `groups` (in that order).
  - Report queries (verbatim from `services/bi.js`, `services/dashboard.js`, `services/simulate.js`): `spendByCategoryMonth`, `spendByCardMonth`, `spendByGroupMonth` (JOIN categories), `spendAllMonth`, `installmentSpendMonth` (`WHERE installment_group_id IS NOT NULL`), and `dashboardCategories` (the JOINed `SELECT c.id,c.name,c.group_id,c.examples,g.name AS group_name,g.color AS group_color,g.sort_order AS group_sort FROM categories c JOIN groups g ON g.id=c.group_id WHERE c.active=1 ORDER BY g.sort_order,c.sort_order,c.id`).
  - Refactor `routes/settings.js` and `routes/onboarding.js` to use `SettingsRepository`. Leave `services/bi|dashboard|simulate.js` calling these repos in Phase 4. Tests: `test/onboarding.test.js`, `test/onboardingGuard.test.js`, `test/settingsRender.test.js` (render test unaffected — frontend), `test/dashboard.test.js`, `test/bi.test.js`, `test/simulate.test.js`.

---

## PHASE 4 — application use-cases (domain logic out of routes/services)

Move orchestration + business rules into pure use-case functions that depend ONLY on ports. Each use-case is a factory `make<Name>UseCases(deps): {...}` taking the ports it needs. Convert the corresponding `src/services/*.js` into TS use-cases and delete the JS service.

### Task 14: Transactions + installments use-cases

**Files:**
- Create: `src/application/use-cases/transactions.ts`, `src/application/use-cases/installments.ts`
- Test: `test/transactions.test.js`, `test/installments.test.js` (unchanged, still green via routes)

**Interfaces:**
- Produces:
  - `makeTransactionUseCases(deps: { transactions: TransactionRepository; categories: CategoryRepository; cards: CardRepository; installments: InstallmentRepository }): { list, create, update, remove }`
  - Each method takes already-validated input (validation stays at the HTTP edge) and throws `AppError` for not-found/existence failures with the EXACT messages: `category_id does not exist`, `card_id does not exist`, `transaction not found`.
  - `create` handles BOTH paths: if installment fields present → `installments.createPurchase(...)` then return `{ ...firstByGroup, installment_group_id }`; else `transactions.insert(...)`.

- [ ] **Step 1:** Write `src/application/use-cases/transactions.ts` moving the existence checks and the two create paths out of `routes/transactions.js`. Existence checks call `categories.findById`/`cards.findById` and `throw new AppError(400, 'category_id does not exist')` etc.
- [ ] **Step 2:** Write `src/application/use-cases/installments.ts` exposing `remove(id)` delegating to `installments.remove` (which throws 404).
- [ ] **Step 3:** Leave routes as the caller for now (route → use-case → repo). Validation still inline in the route.
- [ ] **Step 4:** Run `NO_OPEN=1 node --import tsx --test test/transactions.test.js test/installments.test.js` → PASS.
- [ ] **Step 5:** Full suite + typecheck → PASS. Commit `feat: transaction/installment use-cases`.

### Task 15: Categories, groups, cards, limits use-cases

**Files:** Create `src/application/use-cases/{categories,groups,cards,limits}.ts`. Move the business rules currently in those routes:
- groups `delete` rule: if `countActiveCategories(id) > 0` → `throw new AppError(409, 'group has categories; remove them first')`; then `deactivate`; if `changes===0` → `AppError(404, 'group not found')`.
- categories: group existence via `groups.findActiveById` → `AppError(400, 'group_id does not exist')`; `name` required check stays at HTTP edge (Zod).
- limits: category existence → `AppError(400, 'category_id does not exist')`; build the resolved-limit list for `GET` by `categories.listActive().map(c => ({ category_id, month, limit_cents: limits.resolve(c.id, month) }))`.
- cards: `findById`/not-found 404 messages (`card not found`).

- [ ] Steps mirror Task 14 (write use-case, route calls it, run that resource's tests, full suite + typecheck, commit). Tests: `test/crud.test.js`, `test/budget.test.js`. Commit `feat: category/group/card/limit use-cases`.

### Task 16: Onboarding + settings use-cases

**Files:** Create `src/application/use-cases/{onboarding,settings}.ts`. Move:
- settings: `KEYS = ['monthly_income','fixed_costs','savings_goal']`; `get` returns `{k: Number(value)||0}`; `put` writes only provided keys as `String(Math.trunc(v))` via `settings.setMany`, returns the re-read object.
- onboarding: `isComplete` via `settings.get('onboarding_complete')==='1'`; `complete` sets `'1'`; `template`: if complete → `AppError(409,'onboarding already complete')`; template must be `'suggested'|'blank'` else `AppError(400,'invalid template')`; if `countTransactions>0 || countInstallmentGroups>0` → `AppError(409,'cannot reset after data exists')`; if `'blank'` → `settings.wipeCategoryData()`; return `{ template }`.

- [ ] Steps mirror Task 14. Tests: `test/onboarding.test.js`, `test/onboardingGuard.test.js`. Commit `feat: onboarding/settings use-cases`.

### Task 17: Dashboard, BI, simulate use-cases

**Files:** Create `src/application/use-cases/{dashboard,bi,simulate}.ts`; delete `src/services/{dashboard,bi,simulate}.js` once routes call the use-cases.
- dashboard: move `buildDashboard` + `computeCarryIn` logic, replacing inline `db.prepare` with `LimitRepository.resolve/sumSpend/firstTxMonth`, `ReportRepository.dashboardCategories`, and `SettingsRepository.get`. Preserve the EXACT output object (categories[], groups[], totals{...} with `teto_cents`, `projected_savings_cents`, `vs_goal_cents`).
- bi: move `trends/byCard/byGroup/budgetVsActual/installmentForecast`, using `monthRange` (domain/dates) + `ReportRepository` + `LimitRepository.resolve`. Preserve `{ months, series:[...] }` shapes and the `Limit`/`Spent`/`Committed installments` series names.
- simulate: move `simulatePurchase` using `splitCents` + `addMonths` + `LimitRepository.resolve/sumSpend` + `categories.findById` (active). Return `null` → route maps to 404 (`category not found`). Preserve the per-month object fields exactly.

- [ ] Steps mirror Task 14. Tests: `test/dashboard.test.js`, `test/bi.test.js`, `test/biChart.test.js`, `test/simulate.test.js`. Commit `feat: dashboard/bi/simulate use-cases`.

---

## PHASE 5 — HTTP adapters (Zod schemas, controllers, error mapping) + finalize

### Task 18: Validation foundation + error mapper

**Files:**
- Create: `src/adapters/http/validate.ts`, `src/adapters/http/error-mapper.ts`, `src/adapters/http/schemas/common.ts`
- Delete: `src/validate.js`, `src/errorHandler.js` (after consumers move)
- Modify: keep `src/validate.js` as a re-export shim until all routes migrate, then delete.
- Test: `test/validate.test.js` (point at new module or keep the helpers), `test/errorHandler.test.js`.

**Interfaces:**
- Produces:
  - `parse<T>(schema: ZodType<T>, data: unknown): T` — on failure `throw new AppError(400, firstZodMessage)`.
  - `errorHandler(err, req, res, next)` — `AppError` → `res.status(err.status).json({ error: err.message })`; `ZodError` → 400 with first message; else 500 + `console.error`. Same `{ error }` envelope as today.
  - `common.ts`: `zMonth` (`z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')`), `zDate`, `zPositiveInt`, `zNonNegInt` — messages chosen to MATCH existing assertions per field (override message at call site where the field name differs, e.g. `amount_cents must be a positive integer`).

- [ ] **Step 1:** Write `error-mapper.ts` reproducing `src/errorHandler.js` behavior plus a `ZodError` branch:

```ts
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../domain/errors';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.errors[0]?.message ?? 'invalid request' });
  }
  const status = (err as AppError)?.status ?? 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: (err as Error)?.message || 'Internal error' });
}
```

- [ ] **Step 2:** Write `validate.ts` `parse` helper that runs `schema.parse` and rethrows the first issue as `AppError(400, msg)` (so messages flow through unchanged even if a controller validates before the handler).
- [ ] **Step 3:** `test/errorHandler.test.js` → assert the AppError and 500 branches unchanged; add a case for a thrown `ZodError` → 400. Update its import to `../src/adapters/http/error-mapper`.
- [ ] **Step 4:** Run `NO_OPEN=1 npm test && npm run typecheck` → PASS. Commit `feat: http validation + error mapper`.

### Task 19: Controllers + Zod schemas per resource; thin routes; wire composition root

**Files:**
- Create: `src/adapters/http/schemas/<resource>.ts` and `src/adapters/http/controllers/<resource>.ts` for all 11 resources.
- Modify: `src/infra/composition.ts` (build repos → use-cases → controllers), `src/app.ts` (mount controllers from container; drop `require('./routes/*')`).
- Delete: `src/routes/*.js`, `src/services/*.js` (all now superseded), `src/validate.js` shim.

**Interfaces:**
- `buildContainer(db)` now returns `{ db, repositories, useCases, controllers }`. `createApp(container)` mounts `container.controllers.<name>` at the same base paths as today.
- Each controller is `(useCases) => express.Router()`; it parses input with the resource Zod schema (exact messages), calls the use-case, sets headers (transactions: `X-Total-Count`), and sends the same status codes (200/201/204/400/404/409).

**Per-resource Zod schemas (field → rule, message must match current tests):**
- transactions POST single: `date`=zDate(`date must be YYYY-MM-DD`), `amount_cents`=positive int (`amount_cents must be a positive integer`), `category_id`/`card_id` numbers (existence checked in use-case → 400 messages), `description` optional default `''`. Installment branch: `installment_total_cents`/`installment_count` positive int with their messages, `first_month`=zMonth(`first_month must be YYYY-MM`). GET query: `month` optional zMonth, `category_id`/`card_id` optional numeric, `limit` positive int (`limit must be a positive integer`), `offset` non-negative int (`offset must be a non-negative integer`).
- categories/groups/cards POST/PUT: `name` required (`name is required`), plus fields per current routes (color default `neutral`, examples default `''`, sort_order optional).
- limits PUT: `month`=zMonth, `limit_cents` non-negative int (`limit_cents must be a non-negative integer`), `category_id` number.
- limits/dashboard GET: `month`=zMonth (`month must be YYYY-MM`).
- bi GET: `from`/`to`=zMonth (`from/to must be YYYY-MM`) + cross-field `from <= to` (`from must be <= to`).
- simulate GET: `category_id` positive int (`category_id must be a positive integer`), `first_month`=zMonth (`first_month must be YYYY-MM`), `total_cents` positive int (`total_cents must be a positive integer`), `count` positive int default 1 (`count must be a positive integer`). Order of checks must match current route (category_id, first_month, total_cents, count) so the first failing message matches tests.
- settings PUT: optional numeric `monthly_income`/`fixed_costs`/`savings_goal`. onboarding `template` POST: `template` in `['suggested','blank']` (use-case enforces; schema may pass through to keep the `invalid template` message from the use-case).

- [ ] **Step 1:** Implement schemas + controllers for transactions first; rewire `app.ts`/`composition.ts` to mount the new transactions controller while other resources still use legacy routes (dual-mount during the task). Run `test/transactions.test.js` → PASS.
- [ ] **Step 2:** Repeat per resource (categories, groups, cards, limits, installmentGroups, settings, onboarding, dashboard, bi, simulate), swapping each legacy route for its controller and running that resource's tests after each. Commit per resource (e.g. `feat: categories http controller + zod schema`).
- [ ] **Step 3:** Once all controllers are mounted, delete `src/routes/`, `src/services/`, and the `src/validate.js` shim. Update `createApp` to drop the dual-signature `Db` branch only if all callers now pass a container; otherwise keep `buildAppFromDb` and have tests use it.
- [ ] **Step 4:** Full suite + typecheck → PASS. Commit `refactor: remove legacy routes/services; all HTTP via adapters`.

### Task 20: Port test suite to TS; flip `allowJs:false`; CI typecheck; packaged smoke test

**Files:**
- Modify: rename `test/*.test.js` → `test/*.test.ts`, `test/helpers.js` → `test/helpers.ts`; `tsconfig.json` (`allowJs:false`); `.github/workflows/release.yml` (add typecheck step).
- Render tests (`test/*Render.test.js`) import from `public/js/*.js` — keep those imports as JS; the test files become `.ts` but still `await import('../public/js/...')`.

**Interfaces:**
- Produces: `makeTestDb(): { db: Db; groupId: number; categoryId: number; cardId: number }` in `test/helpers.ts`; tests call `buildAppFromDb(ctx.db)`.

- [ ] **Step 1:** Convert `test/helpers.js` → `test/helpers.ts` with types; its migrations dir is `path.join(__dirname, '..', 'migrations')` (unchanged — tests live in `test/` at root).
- [ ] **Step 2:** Rename all `test/*.test.js` → `.ts`. Replace `createApp(ctx.db)` with `buildAppFromDb(ctx.db)`. Add minimal type annotations only where `tsc` complains. Keep every assertion identical.
- [ ] **Step 3:** Set `"allowJs": false` and `"checkJs": false` (no JS left in `src`). Run `npm run typecheck` → must pass with zero JS in `src/`.
- [ ] **Step 4:** Run `NO_OPEN=1 npm test` → all tests PASS as `.ts`.
- [ ] **Step 5:** Add typecheck to `.github/workflows/release.yml` `test` job, after `npm ci`:

```yaml
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 6: Packaged smoke test (the spec's acceptance gate)**

```bash
npm run build
npm run build:binaries        # produces dist/ binaries
# run the matching binary for this OS from dist/, then:
NO_OPEN=1 PORT=3998 ./dist/<binary-for-this-os> & sleep 2
curl -s localhost:3998/api/health           # expect {"ok":true}
curl -s "localhost:3998/api/dashboard?month=2026-06" | head -c 80   # expect JSON, migrations applied
kill %1
```
Expected: health ok, dashboard returns JSON (DB created next to the binary, migrations + seed applied).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: port suite to TypeScript; allowJs off; CI typecheck; packaged smoke test"
```

---

## Self-Review

**Spec coverage:**
- §2 HTTP contract frozen → enforced by keeping the unchanged test suite green every task + frozen messages table in Task 19. ✓
- §2 pkg build → Task 1 scripts + Task 20 packaged smoke test. ✓
- §2 migrations raw SQL → untouched; runner typed in Task 3. ✓
- §3 layer structure → Phases 1–5 build domain/application/adapters/infra exactly as in the spec's tree. ✓
- §3 repository ports as the seam; pure fns stay plain → Task 6 ports, Task 5 pure services. ✓
- §3 `createApp` keeps supertest working → Task 4 dual-signature + `buildAppFromDb`. ✓
- §4 Zod single source of truth + preserved 400 messages → Tasks 18–19. ✓
- §5 toolchain (strict, CJS, tsx dev, `node --import tsx` tests, CI typecheck) → Tasks 1, 20. ✓
- §5 three-runtime path risk → Task 4 step 6 (tsx + dist) and Task 20 step 6 (pkg). ✓
- §6 incremental order infra→data→domain→http → Phases 1→3→4→5 (domain pure services pulled earlier in Phase 2 since data/use-cases depend on them). ✓
- §8 acceptance criteria → all mapped to Task 20 gates. ✓

**Placeholder scan:** No TBD/TODO. SQL and messages are quoted verbatim from current code. The only intentional compression is Tasks 8–17 referencing the Task 7/14 pattern with full per-resource SQL/rules supplied — not "same as N" hand-waving.

**Type consistency:** Port method names (`listActive`, `findActiveById`, `resolve`, `sumSpend`, `firstTxMonth`, `createPurchase`, `setMany`, `wipeCategoryData`, `dashboardCategories`) are defined in Task 6 and reused unchanged in Tasks 7–17. `makeTransactionRepository`/`make<Name>Repository`, `make<Name>UseCases`, `buildContainer`, `createApp`, `buildAppFromDb` are consistent across tasks.
