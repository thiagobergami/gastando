# Phase 0 — Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every later feature safe to build on — gate merges with CI, stop binding the server to all interfaces, finish HTML escaping, add a formatter/linter, and tidy stray files.

**Architecture:** No new runtime architecture. Tasks are cross-cutting hardening: a GitHub Actions workflow, a one-line server bind change, applying the existing `esc()` helper to the remaining unescaped DOM interpolations, a Biome config, and a file move.

**Tech Stack:** Node 22, TypeScript 5.9 (strict), Express 5, better-sqlite3, `node:test` + c8 + supertest, Biome (new), GitHub Actions.

## Global Constraints

These apply to **every** task in this plan and the other phase plans.

- Node 22; `package.json` is `"type": "commonjs"`; source is TypeScript run via `tsx`.
- Money is integer **cents**. Months are `YYYY-MM`; dates are `YYYY-MM-DD`.
- Hexagonal layering: `domain → application → adapters → infra`; dependencies point inward. Ports live in `src/domain/ports/index.ts`; entities in `src/domain/entities/index.ts`; errors are `AppError(status, message)` from `src/domain/errors`.
- Tests are CommonJS (`const { test } = require('node:test')`) in `test/*.test.ts`, run by `npm test`. API tests use `supertest` + `createApp(ctx.db)`; DB tests use `makeTestDb()` from `test/helpers` (in-memory, runs every migration **except** `002_seed.sql`).
- Coverage gate: `npm run coverage` (c8) requires **≥80%** lines/statements/functions/branches over `src/**/*.ts` except `src/server.ts`.
- HTTP-edge validation uses zod schemas in `src/adapters/http/schemas/` parsed with `parse()` from `src/adapters/http/validate`; existence rules live in use-cases and throw `AppError`.
- Frontend is vanilla ESM in `public/js/` (made modules by `public/js/package.json`), styled with the "Serene Ledger" Tailwind system. UI copy is English; data (category names, currency) is pt-BR. Frontend render functions are pure and unit-tested by importing the module and asserting on the returned HTML string.
- Commit after every task with a conventional-commit message.

---

### Task 1: PR-triggered CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: existing npm scripts `typecheck` and `coverage`.
- Produces: a required status check on PRs and pushes to `main`.

- [ ] **Step 1: Confirm the gate passes locally first**

Run: `npm run typecheck && npm run coverage`
Expected: typecheck prints nothing/0 errors; coverage prints the c8 table and exits 0 (all four metrics ≥80%). If this fails, stop — CI would only encode a broken baseline.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run typecheck
      - run: npm run coverage
```

- [ ] **Step 3: Validate the YAML parses**

Run: `npx --yes js-yaml .github/workflows/ci.yml >/dev/null && echo OK`
Expected: `OK` (no YAML syntax error).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run typecheck + coverage on PRs and main"
```

- [ ] **Step 5: (Post-merge, manual) make it required**

In GitHub repo settings → Branches → add a branch protection rule for `main` requiring the `test` check. Note this in the PR description; it cannot be done from code.

---

### Task 2: Bind the HTTP server to loopback by default

**Files:**
- Modify: `src/server.ts:13-17`

**Interfaces:**
- Produces: server binds to `process.env.HOST || '127.0.0.1'`; a `HOST=0.0.0.0` override restores LAN exposure.

Note: `src/server.ts` is excluded from coverage (`.c8rc.json`), so this needs no unit test; verify by running the server.

- [ ] **Step 1: Edit the listen call**

In `src/server.ts`, replace:

```ts
const port = Number(process.env.PORT) || 3000;
buildAppFromDb(db).listen(port, () => {
  console.log(`Gastando listening on :${port}`);
  openBrowser(`http://localhost:${port}`);
});
```

with:

```ts
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
buildAppFromDb(db).listen(port, host, () => {
  console.log(`Gastando listening on http://${host}:${port}`);
  openBrowser(`http://localhost:${port}`);
});
```

- [ ] **Step 2: Verify it serves on loopback**

Run: `PORT=3999 npm start &` then `sleep 1 && curl -fs http://127.0.0.1:3999/api/health` (then `kill %1`)
Expected: `{"ok":true}` from `127.0.0.1`. (Optional: confirm `curl http://$(hostname -I | awk '{print $1}'):3999/api/health` now refuses/times out.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "fix: bind server to 127.0.0.1 by default (HOST override)"
```

---

### Task 3: Apply `esc()` to the remaining unescaped interpolations

**Context:** `esc()` already exists in `public/js/format.js:16` and is already used in `public/js/budget.js`. The unescaped user-controlled interpolations that remain are in `ui.js`, `dashboard.js`, `transactions.js`, `category.js`, `simulate.js`, `settings.js`.

**Files:**
- Modify: `public/js/ui.js:1,25` (groupTag)
- Modify: `public/js/dashboard.js:2,36,48,49` (renderGroups)
- Modify: `public/js/transactions.js:2,13,25` (renderRows, option labels)
- Modify: `public/js/category.js:2,21` (renderRows)
- Modify: `public/js/simulate.js:2,44` (option labels)
- Modify: `public/js/settings.js:2,122` (card names)
- Test: `test/escaping.test.ts` (new)

**Interfaces:**
- Consumes: `esc` from `public/js/format.js`.
- Produces: every render helper that prints a category/group/card name, examples, or description HTML-escapes it.

- [ ] **Step 1: Write failing escaping tests**

Create `test/escaping.test.ts`:

```ts
const { test } = require('node:test');
const assert = require('node:assert');

test('groupTag escapes the group name', async () => {
  const { groupTag } = await import('../public/js/ui.js');
  const html = groupTag('Casa & Jardim <x>');
  assert.match(html, /Casa &amp; Jardim &lt;x&gt;/);
  assert.doesNotMatch(html, /<x>/);
});

test('dashboard renderGroups escapes category name, examples and group header', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const d = {
    categories: [{ category_id: 1, name: '<b>Boom</b>', examples: 'a & b', group_id: 1,
      group_name: 'G&G', limit_cents: 100, spent_cents: 0, status: 'ok' }],
    groups: [{ group_id: 1, name: 'G&G', limit_cents: 100, spent_cents: 0 }],
    totals: {},
  };
  const html = renderGroups(d);
  assert.doesNotMatch(html, /<b>Boom<\/b>/);
  assert.match(html, /&lt;b&gt;Boom/);
  assert.match(html, /a &amp; b/);
});

test('transactions renderRows escapes the description', async () => {
  const { renderRows } = await import('../public/js/transactions.js');
  const html = renderRows([{ id: 1, date: '2026-06-01', description: '<img src=x>',
    amount_cents: 100, installment_no: null, installment_total: null, installment_group_id: null }]);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt;/);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- --test-name-pattern="escapes"` (or `npx tsx --test test/escaping.test.ts`)
Expected: FAIL — raw `<b>`/`<img>` present because the helpers don't escape yet.

- [ ] **Step 3: Escape in `ui.js`**

Change line 1 import and the `groupTag` return:

```js
import { formatBRL, esc } from './format.js';
```
```js
  return `<span class="tag ${cls}">${esc(groupName)}</span>`;
```

- [ ] **Step 4: Escape in `dashboard.js`**

Change the format import to include `esc`:

```js
import { formatBRL, currentMonth, esc } from './format.js';
```

In `renderGroups`, wrap the three user strings:
- the group header: `<h2 ...>${esc(g.name)}</h2>`
- the category name: `<div class="font-semibold flex items-center gap-2">${esc(c.name)} ${groupTag(g.name)}</div>`
- the examples line: `${c.examples ? `<div class="text-xs text-ink-mut mt-0.5">${esc(c.examples)}</div>` : ''}`

- [ ] **Step 5: Escape in `transactions.js`, `category.js`, `simulate.js`, `settings.js`**

In each, add `esc` to the `./format.js` import and wrap:
- `transactions.js` `renderRows`: `${esc(r.description)}`; `loadSelectors` option labels: `${esc(c.name)}` (both category and card maps).
- `category.js` `renderRows`: `${esc(r.description)}`.
- `simulate.js` `loadCategories`: option label `${esc(c.name)}`.
- `settings.js` `loadCards`: `<span>${esc(c.name)}</span>`.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — new escaping tests pass and existing render tests still pass (accented names like `Pão de Açúcar` are unaffected by `esc`).

- [ ] **Step 7: Audit for any leftover raw interpolation of names/descriptions**

Run: `grep -rn '${\(c\.name\|g\.name\|r\.description\|c\.examples\)}' public/js`
Expected: no matches (every such interpolation now goes through `esc(...)`). If any remain, wrap them and re-run `npm test`.

- [ ] **Step 8: Commit**

```bash
git add public/js test/escaping.test.ts
git commit -m "fix: HTML-escape category/group/card names and descriptions"
```

---

### Task 4: Add Biome (formatter + linter) and EditorConfig

**Files:**
- Modify: `package.json` (devDependency + scripts)
- Create: `biome.json`
- Create: `.editorconfig`
- Modify: `.github/workflows/ci.yml` (add a format/lint check)

**Interfaces:**
- Produces: `npm run lint` and `npm run format`; CI fails on unformatted or lint-erroring code.

- [ ] **Step 1: Install Biome**

Run: `npm install --save-dev --save-exact @biomejs/biome@2`
Expected: it appears under `devDependencies`.

- [ ] **Step 2: Write `biome.json` matching the existing style**

The codebase uses 2-space indent, single quotes, semicolons, and trailing commas. Encode that so formatting churn is minimal:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": { "includes": ["src/**", "public/js/**", "test/**"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "single", "trailingCommas": "all", "semicolons": "always" } },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "off" },
      "style": { "noParameterAssign": "off" }
    }
  }
}
```

- [ ] **Step 3: Add scripts to `package.json`**

In `"scripts"` add:

```json
"lint": "biome check .",
"format": "biome format --write ."
```

- [ ] **Step 4: Format the codebase (its own commit)**

Run: `npm run format`
Expected: Biome rewrites files to the canonical style. Review the diff — it should be whitespace/quote-level only, no logic changes.

```bash
git add -A
git commit -m "style: apply Biome formatting"
```

- [ ] **Step 5: Fix or scope lint findings**

Run: `npm run lint`
Expected: either clean, or a finite list. For each finding, fix it; if a rule is genuinely too noisy for this codebase, disable that specific rule in `biome.json` (do not blanket-ignore files). Re-run until `npm run lint` exits 0.

- [ ] **Step 6: Add `.editorconfig`**

Create `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 7: Wire lint into CI**

In `.github/workflows/ci.yml`, add a step after `npm ci` and before typecheck:

```yaml
      - run: npm run lint
```

- [ ] **Step 8: Verify the whole gate**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json biome.json .editorconfig .github/workflows/ci.yml
git commit -m "build: add Biome lint/format + editorconfig and gate in CI"
```

---

### Task 5: Housekeeping — move root mockups into `docs/`

**Files:**
- Move: `card.html` → `docs/card.html`
- Move: `orcamento-cartoes.html` → `docs/orcamento-cartoes.html`

Note: leave `card.md` at the root — `docs/spec.md` references it as the domain source of truth. The two `.html` files are static design mockups not served by the app (`pkg` assets are `public/**` + `migrations/**` only), so moving them is safe.

- [ ] **Step 1: Confirm nothing references the files**

Run: `grep -rn "card.html\|orcamento-cartoes.html" --include=*.ts --include=*.js --include=*.json --include=Dockerfile . | grep -v node_modules`
Expected: no runtime references (matches, if any, are only in docs/markdown).

- [ ] **Step 2: Move with git**

```bash
git mv card.html docs/card.html
git mv orcamento-cartoes.html docs/orcamento-cartoes.html
```

- [ ] **Step 3: Verify build still green**

Run: `npm run typecheck && npm test`
Expected: pass (no code depended on these).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: move root HTML mockups into docs/"
```

---

## Self-Review

- **Spec coverage:** PR CI (Task 1), localhost binding (Task 2), escaping (Task 3 — corrected to *apply* the existing `esc()` rather than create a helper), linter/formatter + editorconfig (Task 4), housekeeping (Task 5). All Tier 3 + escaping items covered.
- **Placeholder scan:** none — every code step shows the exact edit; lint-fix step (4.5) is bounded by "re-run until exit 0".
- **Ordering:** CI first so the rest is gated; escaping before Biome so new escaped code is formatted in one pass; housekeeping last (independent).
- **Type consistency:** no new types introduced. `esc` is the existing export from `format.js`.
