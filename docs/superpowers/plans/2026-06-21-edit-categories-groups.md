# Edit & Remove Categories and Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add, rename, and remove categories and groups — inline on the Settings limits table for existing users, and via a Suggested/Blank starter-template choice in the first-run wizard.

**Architecture:** Groups gain a soft-delete `active` flag mirroring categories (FK enforcement is ON, so nothing is ever hard-deleted in normal use). The Settings limits table becomes grouped with inline management controls. The wizard gains a "Start" step that picks a template; the actual data mutation (Blank = wipe seeded data) is deferred to the final "Start tracking" action so navigating back and forth is non-destructive.

**Tech Stack:** Node.js, Express 5, better-sqlite3, vanilla ES-module front-end, Tailwind (prebuilt `app.css`), `node:test` + supertest.

## Global Constraints

- All money is stored as integer cents; UI converts via `reaisToCents` / `/100`.
- Soft-delete means `active=0`; lists filter `WHERE active=1`. Never hard-delete categories or groups outside the Blank-template reset.
- Group color is one of exactly: `sage`, `gold`, `slate`, `neutral`.
- Back-end validation uses `fail(status, message)` from `src/validate.js` and the central `errorHandler`.
- Front-end errors surface via `showError(message)` from `public/js/api.js`.
- Use only Tailwind classes already present in `public/css/app.css` (e.g. `tag`, `tag-sage`/`tag-gold`/`tag-slate`/`tag-neutral`, `text-sage`, `text-clay`, `btn-primary`, `btn-ghost`, `bg-paper`, `font-semibold`, `mr-2`). No new utility classes, so no CSS rebuild is required.
- Tests run with `npm test` (`node --test "test/**/*.test.js"`).

---

### Task 1: Add `groups.active` and soft-delete groups

**Files:**
- Create: `migrations/003_groups_active.sql`
- Modify: `test/helpers.js`
- Modify: `src/routes/groups.js`
- Test: `test/crud.test.js`

**Interfaces:**
- Consumes: existing `groups` table from `migrations/001_schema.sql`; `fail` from `src/validate.js`.
- Produces:
  - `groups` table has column `active INTEGER NOT NULL DEFAULT 1`.
  - `GET /api/groups` returns only rows with `active=1`.
  - `DELETE /api/groups/:id` → 409 `'group has categories; remove them first'` if the group has any `active=1` category; otherwise sets `active=0` and returns 204; 404 if the group does not exist or is already inactive.
  - `makeTestDb()` applies every migration file except `002_seed.sql` (so new schema migrations are picked up automatically while fixtures stay minimal).

- [ ] **Step 1: Write the failing tests**

Add to `test/crud.test.js` (after the existing `groups: delete non-existent returns 404` test):

```js
test('groups: delete is a soft-delete and hides the group from listing', async () => {
  const { app } = appWith();
  const g = await request(app).post('/api/groups')
    .send({ name: 'Temp', color: 'gold' }).expect(201);
  await request(app).delete(`/api/groups/${g.body.id}`).expect(204);
  const list = await request(app).get('/api/groups').expect(200);
  assert.ok(!list.body.some(x => x.id === g.body.id), 'soft-deleted group still listed');
});

test('groups: delete is blocked while it has active categories', async () => {
  const { app, ctx } = appWith();
  // ctx.groupId has the seeded-in-helper active category "Supermercado".
  await request(app).delete(`/api/groups/${ctx.groupId}`).expect(409);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="groups: delete is"`
Expected: FAIL — soft-delete test sees the group still listed (currently hard-deleted but listing has no `active` filter / column), and the 409 test gets 204.

- [ ] **Step 3: Create the migration**

Create `migrations/003_groups_active.sql`:

```sql
ALTER TABLE groups ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 4: Update the test helper to apply all schema migrations except the seed**

Replace the body of `test/helpers.js` with:

```js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function makeTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql') && f !== '002_seed.sql')
    .sort();
  for (const f of files) {
    db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  const g = db.prepare("INSERT INTO groups (name, sort_order) VALUES ('Test', 0)").run();
  const c = db.prepare(
    "INSERT INTO categories (group_id, name, sort_order) VALUES (?, 'Supermercado', 0)"
  ).run(g.lastInsertRowid);
  const card = db.prepare("INSERT INTO cards (name) VALUES ('Nubank')").run();
  return { db, groupId: g.lastInsertRowid, categoryId: c.lastInsertRowid, cardId: card.lastInsertRowid };
}

module.exports = { makeTestDb };
```

- [ ] **Step 5: Update the groups route**

Replace `src/routes/groups.js` with:

```js
const express = require('express');
const { fail } = require('../validate');

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(db.prepare('SELECT * FROM groups WHERE active=1 ORDER BY sort_order, id').all());
  });

  router.post('/', (req, res) => {
    const { name, color = 'neutral' } = req.body;
    if (!name) fail(400, 'name is required');
    const sort_order = req.body.sort_order ??
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM groups').get().n;
    const r = db.prepare(
      'INSERT INTO groups (name, color, sort_order) VALUES (?, ?, ?)'
    ).run(name, color, sort_order);
    res.status(201).json(db.prepare('SELECT * FROM groups WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { name, color = 'neutral', sort_order = 0 } = req.body;
    if (!name) fail(400, 'name is required');
    const r = db.prepare(
      'UPDATE groups SET name=?, color=?, sort_order=? WHERE id=? AND active=1'
    ).run(name, color, sort_order, req.params.id);
    if (r.changes === 0) fail(404, 'group not found');
    res.json(db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id));
  });

  router.delete('/:id', (req, res) => {
    const active = db.prepare(
      'SELECT COUNT(*) AS n FROM categories WHERE group_id=? AND active=1').get(req.params.id).n;
    if (active > 0) fail(409, 'group has categories; remove them first');
    const r = db.prepare('UPDATE groups SET active=0 WHERE id=? AND active=1').run(req.params.id);
    if (r.changes === 0) fail(404, 'group not found');
    res.status(204).end();
  });

  return router;
};
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — new group tests pass; the existing `groups: create, list, update, delete` test still passes (delete now soft-deletes but still returns 204); all other tests unaffected.

- [ ] **Step 7: Commit**

```bash
git add migrations/003_groups_active.sql test/helpers.js src/routes/groups.js test/crud.test.js
git commit -m "feat: soft-delete groups via active flag

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Append-ordering and active-group validation for categories

**Files:**
- Modify: `src/routes/categories.js`
- Test: `test/crud.test.js`

**Interfaces:**
- Consumes: `groups.active` (Task 1); `fail` from `src/validate.js`.
- Produces:
  - `POST /api/categories` defaults `sort_order` to `MAX(sort_order)+1` when not supplied, and rejects (400 `'group_id does not exist'`) a `group_id` that is missing or inactive.
  - `PUT /api/categories/:id` rejects a `group_id` that is missing or inactive (same message).

- [ ] **Step 1: Write the failing tests**

Add to `test/crud.test.js`:

```js
test('categories: create appends sort_order after existing categories', async () => {
  const { app, ctx } = appWith();
  const a = await request(app).post('/api/categories')
    .send({ group_id: ctx.groupId, name: 'Alpha' }).expect(201);
  const b = await request(app).post('/api/categories')
    .send({ group_id: ctx.groupId, name: 'Beta' }).expect(201);
  assert.ok(b.body.sort_order > a.body.sort_order, 'second category did not append after first');
});

test('categories: create rejects an inactive group', async () => {
  const { app } = appWith();
  const g = await request(app).post('/api/groups').send({ name: 'Soon Gone' }).expect(201);
  await request(app).delete(`/api/groups/${g.body.id}`).expect(204); // now inactive
  await request(app).post('/api/categories')
    .send({ group_id: g.body.id, name: 'Orphan' }).expect(400);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="categories: create (appends|rejects)"`
Expected: FAIL — sort_order defaults to 0 for both (not appended); inactive group currently passes the existence check and returns 201.

- [ ] **Step 3: Update the categories route**

Replace the `POST /` and `PUT /:id` handlers in `src/routes/categories.js` with:

```js
  router.post('/', (req, res) => {
    const { group_id, name, examples = '' } = req.body;
    if (!name) fail(400, 'name is required');
    const group = db.prepare('SELECT id FROM groups WHERE id=? AND active=1').get(group_id);
    if (!group) fail(400, 'group_id does not exist');
    const sort_order = req.body.sort_order ??
      db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories').get().n;
    const r = db.prepare(
      'INSERT INTO categories (group_id, name, examples, sort_order) VALUES (?, ?, ?, ?)'
    ).run(group_id, name, examples, sort_order);
    res.status(201).json(db.prepare('SELECT * FROM categories WHERE id=?').get(r.lastInsertRowid));
  });

  router.put('/:id', (req, res) => {
    const { group_id, name, examples = '', sort_order = 0 } = req.body;
    const active = req.body.active ?? 1;
    if (!name) fail(400, 'name is required');
    if (!db.prepare('SELECT id FROM groups WHERE id=? AND active=1').get(group_id)) fail(400, 'group_id does not exist');
    const r = db.prepare(
      'UPDATE categories SET group_id=?, name=?, examples=?, sort_order=?, active=? WHERE id=?'
    ).run(group_id, name, examples, sort_order, active ? 1 : 0, req.params.id);
    if (r.changes === 0) fail(404, 'category not found');
    res.json(db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id));
  });
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — new category tests pass; existing `categories: put with invalid group_id returns 400` still passes (99999 is neither existing nor active).

- [ ] **Step 5: Commit**

```bash
git add src/routes/categories.js test/crud.test.js
git commit -m "feat: append category sort_order and require active group

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Onboarding template endpoint

**Files:**
- Modify: `src/routes/onboarding.js`
- Test: `test/onboarding.test.js`

**Interfaces:**
- Consumes: `settings` (onboarding flag), `transactions`, `installment_groups`, `category_limits`, `categories`, `groups`; `fail` from `src/validate.js`.
- Produces: `POST /api/onboarding/template` body `{ template: 'suggested' | 'blank' }`:
  - 409 `'onboarding already complete'` if the onboarding flag is set.
  - 409 `'cannot reset after data exists'` if any `transactions` or `installment_groups` rows exist.
  - 400 `'invalid template'` for any other `template` value.
  - `'suggested'` → no-op. `'blank'` → deletes all `category_limits`, then `categories`, then `groups` in a transaction.
  - On success returns `{ template }` with status 200.

- [ ] **Step 1: Write the failing tests**

Add to `test/onboarding.test.js`:

```js
test('POST /api/onboarding/template blank wipes categories and groups', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  const res = await request(app).post('/api/onboarding/template')
    .send({ template: 'blank' }).expect(200);
  assert.deepEqual(res.body, { template: 'blank' });
  assert.deepEqual((await request(app).get('/api/categories').expect(200)).body, []);
  assert.deepEqual((await request(app).get('/api/groups').expect(200)).body, []);
});

test('POST /api/onboarding/template suggested keeps existing data', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).post('/api/onboarding/template').send({ template: 'suggested' }).expect(200);
  assert.ok((await request(app).get('/api/categories').expect(200)).body.length > 0);
});

test('POST /api/onboarding/template rejects an unknown template', async () => {
  const { db } = makeTestDb();
  await request(createApp(db)).post('/api/onboarding/template')
    .send({ template: 'nope' }).expect(400);
});

test('POST /api/onboarding/template is blocked once transactions exist', async () => {
  const { db, categoryId, cardId } = makeTestDb();
  db.prepare('INSERT INTO transactions (date, category_id, card_id, amount_cents) VALUES (?,?,?,?)')
    .run('2026-06-01', categoryId, cardId, 1000);
  await request(createApp(db)).post('/api/onboarding/template')
    .send({ template: 'blank' }).expect(409);
});

test('POST /api/onboarding/template is blocked once onboarding is complete', async () => {
  const { db } = makeTestDb();
  const app = createApp(db);
  await request(app).post('/api/onboarding/complete').expect(200);
  await request(app).post('/api/onboarding/template').send({ template: 'blank' }).expect(409);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="onboarding/template"`
Expected: FAIL with 404 (route not defined yet).

- [ ] **Step 3: Add the template route**

Replace `src/routes/onboarding.js` with:

```js
const express = require('express');
const { fail } = require('../validate');

const KEY = 'onboarding_complete';

function isComplete(db) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(KEY);
  return row ? row.value === '1' : false;
}

module.exports = (db) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ complete: isComplete(db) });
  });

  router.post('/complete', (req, res) => {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(KEY, '1');
    res.json({ complete: true });
  });

  router.post('/template', (req, res) => {
    if (isComplete(db)) fail(409, 'onboarding already complete');
    const txCount = db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;
    const igCount = db.prepare('SELECT COUNT(*) AS n FROM installment_groups').get().n;
    if (txCount > 0 || igCount > 0) fail(409, 'cannot reset after data exists');
    const { template } = req.body;
    if (template !== 'suggested' && template !== 'blank') fail(400, 'invalid template');
    if (template === 'blank') {
      db.transaction(() => {
        db.exec('DELETE FROM category_limits; DELETE FROM categories; DELETE FROM groups;');
      })();
    }
    res.json({ template });
  });

  return router;
};
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — all five new template tests pass; existing onboarding tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/routes/onboarding.js test/onboarding.test.js
git commit -m "feat: onboarding template endpoint (suggested/blank)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Grouped, inline-editable limits table in Settings

**Files:**
- Modify: `public/js/budget.js`
- Modify: `public/js/settings.js`
- Test: `test/settingsRender.test.js`

**Interfaces:**
- Consumes: `GET /api/groups`, `GET /api/categories`, `GET /api/limits`; `POST`/`PUT`/`DELETE` on `/api/groups` and `/api/categories`; `api`, `showError` from `public/js/api.js`; `reaisToCents`, `currentMonth` from `public/js/format.js`; `allocationStatus`, `allocationText`, `allocationPillClass` from `public/js/budget.js`.
- Produces:
  - `renderGroupedLimitRows(groups, cats, byCat)` in `public/js/budget.js` — pure function returning table-row HTML: one header row per active group (color tag + Rename/Color/Remove buttons), each active category as a row (name + limit input + Rename/Remove), an "+ Add category" row per group, and a trailing "+ Add group" row.
  - `settings.js` re-exports `renderGroupedLimitRows` and wires the controls via click delegation on `#limits`.

- [ ] **Step 1: Write the failing test**

Replace the `renderLimitRows` test in `test/settingsRender.test.js` with a `renderGroupedLimitRows` test (keep the `ceilingText` test as-is, and keep a direct `renderLimitRows` test pointed at `budget.js` since the wizard still uses it):

```js
test('renderLimitRows (budget) still builds editable rows', async () => {
  const { renderLimitRows } = await import('../public/js/budget.js');
  const cats = [{ id: 1, name: 'Supermercado', active: 1 }];
  const html = renderLimitRows(cats, new Map([[1, 85000]]));
  assert.match(html, /data-cat="1"/);
  assert.match(html, /value="850"/);
});

test('renderGroupedLimitRows groups categories under their group with controls', async () => {
  const { renderGroupedLimitRows } = await import('../public/js/settings.js');
  const groups = [{ id: 7, name: 'Essenciais', color: 'sage', active: 1 }];
  const cats = [{ id: 1, name: 'Supermercado', group_id: 7, active: 1 }];
  const byCat = new Map([[1, 85000]]);
  const html = renderGroupedLimitRows(groups, cats, byCat);
  assert.match(html, /Essenciais/);
  assert.match(html, /tag-sage/);
  assert.match(html, /data-cat="1"/);
  assert.match(html, /value="850"/);
  assert.match(html, /data-cat-del="1"/);
  assert.match(html, /data-group-del="7"/);
  assert.match(html, /data-add-cat="7"/);
  assert.match(html, /data-add-group/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --test-name-pattern="renderGroupedLimitRows"`
Expected: FAIL — `renderGroupedLimitRows` is not exported.

- [ ] **Step 3: Add the pure render helper**

Append to `public/js/budget.js`:

```js
export function renderGroupedLimitRows(groups, cats, byCat) {
  const groupBlock = (g) => {
    const rows = cats.filter(c => c.active && c.group_id === g.id).map(c => `
      <tr class="border-b border-line">
        <td class="py-2">${c.name}</td>
        <td class="py-2 text-right">
          <input type="number" step="0.01" data-cat="${c.id}" value="${(byCat.get(c.id) || 0) / 100}"
            class="w-32 rounded border border-line bg-card px-2 py-1 text-right font-mono" />
        </td>
        <td class="py-2 text-right">
          <button data-cat-rename="${c.id}" class="text-sage text-sm mr-2">Rename</button>
          <button data-cat-del="${c.id}" class="text-clay text-sm">Remove</button>
        </td>
      </tr>`).join('');
    return `
      <tr class="bg-paper">
        <td class="py-2" colspan="2"><span class="tag tag-${g.color}">${g.name}</span></td>
        <td class="py-2 text-right">
          <button data-group-rename="${g.id}" class="text-sage text-sm mr-2">Rename</button>
          <button data-group-recolor="${g.id}" class="text-sage text-sm mr-2">Color</button>
          <button data-group-del="${g.id}" class="text-clay text-sm">Remove</button>
        </td>
      </tr>
      ${rows}
      <tr>
        <td class="py-2" colspan="3">
          <button data-add-cat="${g.id}" class="text-sage text-sm">+ Add category</button>
        </td>
      </tr>`;
  };
  return groups.filter(g => g.active).map(groupBlock).join('') + `
    <tr>
      <td class="py-2" colspan="3"><button data-add-group class="text-sage text-sm">+ Add group</button></td>
    </tr>`;
}
```

- [ ] **Step 4: Wire the Settings page**

Replace `public/js/settings.js` with:

```js
import { api, showError } from './api.js';
import { reaisToCents, currentMonth } from './format.js';
import { mountChrome } from './chrome.js';
import { ceilingText, renderLimitRows, renderGroupedLimitRows,
  allocationStatus, allocationText, allocationPillClass } from './budget.js';

// Re-exported so existing importers (and tests) can keep reaching them here.
export { ceilingText, renderLimitRows, renderGroupedLimitRows };

const COLORS = ['sage', 'gold', 'slate', 'neutral'];
const $ = id => document.getElementById(id);
const state = { groups: [], cats: [] };

async function loadSettings() {
  try {
    const s = await api.get('/api/settings');
    $('monthly_income').value = s.monthly_income / 100;
    $('fixed_costs').value = s.fixed_costs / 100;
    $('savings_goal').value = s.savings_goal / 100;
    updateAllocation();
  } catch (e) { showError(e.message); }
}

function readLimitCents() {
  return [...document.querySelectorAll('#limits input[data-cat]')]
    .map(inp => reaisToCents(inp.value || 0));
}

function updateAllocation() {
  const status = allocationStatus(
    readLimitCents(),
    reaisToCents($('monthly_income').value || 0),
    reaisToCents($('fixed_costs').value || 0),
    reaisToCents($('savings_goal').value || 0));
  const el = $('ceiling');
  el.textContent = allocationText(status);
  el.className = allocationPillClass(status);
}

function wireLimitInputs() {
  $('limits').querySelectorAll('input[data-cat]').forEach(inp => {
    inp.addEventListener('input', updateAllocation);
    inp.addEventListener('change', async () => {
      try {
        await api.put('/api/limits', { category_id: Number(inp.dataset.cat),
          month: $('month').value, limit_cents: reaisToCents(inp.value) });
      } catch (e) { showError(e.message); }
    });
  });
}

async function loadLimits() {
  try {
    const [groups, cats, limits] = await Promise.all([
      api.get('/api/groups'), api.get('/api/categories'),
      api.get(`/api/limits?month=${$('month').value}`)]);
    state.groups = groups; state.cats = cats;
    const byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
    $('limits').innerHTML = renderGroupedLimitRows(groups, cats, byCat);
    wireLimitInputs();
    updateAllocation();
  } catch (e) { showError(e.message); }
}

async function renameCategory(id) {
  const cat = state.cats.find(c => c.id === id);
  const name = prompt('Rename category', cat.name);
  if (!name || name === cat.name) return;
  await api.put(`/api/categories/${id}`, { ...cat, name });
  loadLimits();
}

async function renameGroup(id) {
  const g = state.groups.find(x => x.id === id);
  const name = prompt('Rename group', g.name);
  if (!name || name === g.name) return;
  await api.put(`/api/groups/${id}`, { ...g, name });
  loadLimits();
}

async function recolorGroup(id) {
  const g = state.groups.find(x => x.id === id);
  const color = prompt(`Color (${COLORS.join(', ')})`, g.color);
  if (!color || color === g.color || !COLORS.includes(color)) return;
  await api.put(`/api/groups/${id}`, { ...g, color });
  loadLimits();
}

async function addCategory(groupId) {
  const name = prompt('New category name');
  if (!name) return;
  await api.post('/api/categories', { group_id: groupId, name });
  loadLimits();
}

async function addGroup() {
  const name = prompt('New group name');
  if (!name) return;
  await api.post('/api/groups', { name });
  loadLimits();
}

async function onLimitsClick(e) {
  const d = e.target.dataset;
  try {
    if (d.catDel) { await api.del(`/api/categories/${d.catDel}`); return loadLimits(); }
    if (d.groupDel) { await api.del(`/api/groups/${d.groupDel}`); return loadLimits(); }
    if (d.catRename) return renameCategory(Number(d.catRename));
    if (d.groupRename) return renameGroup(Number(d.groupRename));
    if (d.groupRecolor) return recolorGroup(Number(d.groupRecolor));
    if (d.addCat) return addCategory(Number(d.addCat));
    if (e.target.hasAttribute('data-add-group')) return addGroup();
  } catch (err) { showError(err.message); }
}

async function loadCards() {
  try {
    const cards = await api.get('/api/cards');
    $('cards').innerHTML = cards.filter(c => c.active).map(c => `
      <div class="flex items-center justify-between border-b border-line py-2">
        <span>${c.name}</span>
        <button data-del="${c.id}" class="text-clay text-sm">Remove</button>
      </div>`).join('');
    $('cards').querySelectorAll('button[data-del]').forEach(b =>
      b.addEventListener('click', async () => {
        try { await api.del(`/api/cards/${b.dataset.del}`); loadCards(); } catch (e) { showError(e.message); }
      }));
  } catch (e) { showError(e.message); }
}

if (typeof document !== 'undefined' && document.getElementById('limits')) {
  mountChrome('/settings.html');
  $('month').value = currentMonth();
  $('monthLabel').textContent = $('month').value;
  $('month').addEventListener('change', () => { $('monthLabel').textContent = $('month').value; loadLimits(); });
  $('limits').addEventListener('click', onLimitsClick);
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id => $(id).addEventListener('input', updateAllocation));
  $('saveSettings').addEventListener('click', async () => {
    try {
      await api.put('/api/settings', {
        monthly_income: reaisToCents($('monthly_income').value),
        fixed_costs: reaisToCents($('fixed_costs').value),
        savings_goal: reaisToCents($('savings_goal').value),
      });
      showError('Saved');
    } catch (e) { showError(e.message); }
  });
  $('addCard').addEventListener('click', async () => {
    try { await api.post('/api/cards', { name: $('newCard').value }); $('newCard').value = ''; loadCards(); }
    catch (e) { showError(e.message); }
  });
  loadSettings(); loadLimits(); loadCards();
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — `renderGroupedLimitRows` and `renderLimitRows` render tests pass; all other tests unaffected.

- [ ] **Step 6: Manual smoke check**

Run: `npm start`, open http://localhost:3000/settings.html. Verify the limits table shows group headers with color tags; "+ Add group", "+ Add category", Rename, Color, and Remove all work; removing a group that still has categories shows the toast "group has categories; remove them first"; the allocation pill updates after edits.

- [ ] **Step 7: Commit**

```bash
git add public/js/budget.js public/js/settings.js test/settingsRender.test.js
git commit -m "feat: inline category and group management in settings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Starter-template step in the setup wizard

**Files:**
- Modify: `public/setup.html`
- Modify: `public/js/setup.js`
- Test: `test/setupRender.test.js`

**Interfaces:**
- Consumes: `POST /api/onboarding/template` (Task 3); `GET /api/settings`, `GET /api/categories`, `GET /api/limits`; `PUT /api/settings`, `PUT /api/limits`, `POST /api/onboarding/complete`; `renderLimitRows`, `allocationStatus`, `allocationText`, `allocationPillClass` from `public/js/budget.js`.
- Produces:
  - `SETUP_STEPS === ['Start', 'Income', 'Fixed costs', 'Savings goal', 'Limits']`.
  - A "Start" step (index 0) offering Suggested vs Blank; the chosen template is applied (DB mutation) only inside `finish()`, so back/forward navigation is non-destructive.
  - On the Limits step, Blank shows an empty-state message instead of limit rows; the allocation pill still reflects the full ceiling.

- [ ] **Step 1: Write the failing tests**

Replace the four step-related tests in `test/setupRender.test.js` with these (updating counts for five steps):

```js
test('SETUP_STEPS lists the five wizard steps in order', async () => {
  const { SETUP_STEPS } = await import('../public/js/setup.js');
  assert.deepEqual(SETUP_STEPS, ['Start', 'Income', 'Fixed costs', 'Savings goal', 'Limits']);
});

test('progressPct maps the active step to a percentage of total', async () => {
  const { progressPct } = await import('../public/js/setup.js');
  assert.equal(progressPct(0, 5), 20);
  assert.equal(progressPct(4, 5), 100);
});

test('isLastStep is true only on the final step', async () => {
  const { isLastStep } = await import('../public/js/setup.js');
  assert.equal(isLastStep(0, 5), false);
  assert.equal(isLastStep(4, 5), true);
});

test('continueLabel switches to the finish label on the last step', async () => {
  const { continueLabel } = await import('../public/js/setup.js');
  assert.equal(continueLabel(0, 5), 'Continue');
  assert.equal(continueLabel(4, 5), 'Start tracking');
});

test('renderStepIndicator marks the active step and lists every label', async () => {
  const { renderStepIndicator, SETUP_STEPS } = await import('../public/js/setup.js');
  const html = renderStepIndicator(1);
  for (const label of SETUP_STEPS) assert.ok(html.includes(label), `missing ${label}`);
  assert.match(html, /Step 2 of 5/);
  assert.match(html, /aria-current="step"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="SETUP_STEPS|progressPct|isLastStep|continueLabel|renderStepIndicator"`
Expected: FAIL — `SETUP_STEPS` still has four entries and the percentages/labels don't match.

- [ ] **Step 3: Update the wizard markup**

In `public/setup.html`, insert a new Start panel before the existing income panel and renumber the existing `data-step` values (income 0→1, fixed 1→2, savings 2→3, limits 3→4). Replace the block from the first `<div data-step="0" ...>` through the limits `</div>` with:

```html
        <div data-step="0" class="mt-6 space-y-4">
          <h3 class="font-display text-xl">Choose a starting point</h3>
          <p class="text-sm text-ink-mut">You can add, rename and remove categories any time in Settings.</p>
          <div class="grid gap-3">
            <button type="button" data-template="suggested" class="btn-primary text-left">
              Suggested — start with ready-made categories you can tweak later
            </button>
            <button type="button" data-template="blank" class="btn-ghost text-left">
              Blank — start from scratch and build your own in Settings
            </button>
          </div>
        </div>

        <div data-step="1" class="mt-6 space-y-4" hidden>
          <h3 class="font-display text-xl">Your monthly income</h3>
          <label class="field"><span>Monthly income (R$)</span>
            <input type="number" id="monthly_income" step="0.01" inputmode="decimal" /></label>
        </div>

        <div data-step="2" class="mt-6 space-y-4" hidden>
          <h3 class="font-display text-xl">Fixed costs</h3>
          <p class="text-sm text-ink-mut">Rent, utilities and other bills that don't go on a card.</p>
          <label class="field"><span>Fixed costs (R$)</span>
            <input type="number" id="fixed_costs" step="0.01" inputmode="decimal" /></label>
        </div>

        <div data-step="3" class="mt-6 space-y-4" hidden>
          <h3 class="font-display text-xl">Savings goal</h3>
          <p class="text-sm text-ink-mut">How much you want to set aside each month.</p>
          <label class="field"><span>Savings goal (R$)</span>
            <input type="number" id="savings_goal" step="0.01" inputmode="decimal" /></label>
        </div>

        <div data-step="4" class="mt-6 space-y-4" hidden>
          <h3 class="font-display text-xl">Category limits for <span id="limitsMonth" class="font-mono text-base"></span></h3>
          <p class="text-sm text-ink-mut">A monthly ceiling per category. You can change these any time in Settings.</p>
          <table class="w-full text-left"><tbody id="limits"></tbody></table>
          <p id="limitsEmpty" class="text-sm text-ink-mut" hidden>No categories yet — you can add them anytime in Settings.</p>
        </div>
```

- [ ] **Step 4: Update the wizard logic**

Replace `public/js/setup.js` with:

```js
import { api, showError } from './api.js';
import { reaisToCents, currentMonth } from './format.js';
import { renderLimitRows, allocationStatus, allocationText, allocationPillClass } from './budget.js';

export const SETUP_STEPS = ['Start', 'Income', 'Fixed costs', 'Savings goal', 'Limits'];

export function progressPct(stepIndex, total) {
  return Math.round(((stepIndex + 1) / total) * 100);
}

export function isLastStep(stepIndex, total) {
  return stepIndex === total - 1;
}

export function continueLabel(stepIndex, total) {
  return isLastStep(stepIndex, total) ? 'Start tracking' : 'Continue';
}

export function renderStepIndicator(activeIndex) {
  const total = SETUP_STEPS.length;
  const pills = SETUP_STEPS.map((label, i) => {
    const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
    const current = i === activeIndex ? ' aria-current="step"' : '';
    return `<li class="step step-${state}"${current}><span class="step-no">${i + 1}</span>${label}</li>`;
  }).join('');
  return `
    <p class="label-caps text-ink-mut">Step ${activeIndex + 1} of ${total}</p>
    <ol class="step-indicator">${pills}</ol>
    <div class="meter"><div class="meter-fill" style="width:${progressPct(activeIndex, total)}%"></div></div>`;
}

// ---- DOM bootstrap (browser only) ----
const $ = id => document.getElementById(id);
const LIMITS_STEP = SETUP_STEPS.length - 1;

if (typeof document !== 'undefined' && document.getElementById('setup')) {
  const month = currentMonth();
  let step = 0;
  let template = 'suggested';
  let seededCats = [];
  let byCat = new Map();

  function readLimitCents() {
    return [...document.querySelectorAll('#limits input[data-cat]')]
      .map(inp => reaisToCents(inp.value || 0));
  }

  function updateAllocation() {
    const status = allocationStatus(
      readLimitCents(),
      reaisToCents($('monthly_income').value || 0),
      reaisToCents($('fixed_costs').value || 0),
      reaisToCents($('savings_goal').value || 0));
    const el = $('ceiling');
    el.textContent = allocationText(status);
    el.className = allocationPillClass(status);
  }

  function paintTemplate() {
    document.querySelectorAll('[data-template]').forEach(b => {
      b.className = (b.dataset.template === template ? 'btn-primary' : 'btn-ghost') + ' text-left';
    });
  }

  function renderLimitsStep() {
    if (template === 'blank') {
      $('limits').innerHTML = '';
      $('limitsEmpty').hidden = false;
    } else {
      $('limits').innerHTML = renderLimitRows(seededCats, byCat);
      $('limitsEmpty').hidden = true;
      $('limits').querySelectorAll('input[data-cat]').forEach(inp =>
        inp.addEventListener('input', updateAllocation));
    }
    updateAllocation();
  }

  function render() {
    $('indicator').innerHTML = renderStepIndicator(step);
    document.querySelectorAll('[data-step]').forEach(el => {
      el.hidden = Number(el.dataset.step) !== step;
    });
    $('back').disabled = step === 0;
    $('continue').textContent = continueLabel(step, SETUP_STEPS.length);
    if (step === LIMITS_STEP) renderLimitsStep();
  }

  async function finish() {
    try {
      await api.put('/api/settings', {
        monthly_income: reaisToCents($('monthly_income').value),
        fixed_costs: reaisToCents($('fixed_costs').value),
        savings_goal: reaisToCents($('savings_goal').value),
      });
      await api.post('/api/onboarding/template', { template });
      if (template !== 'blank') {
        const puts = seededCats.map(c => {
          const inp = $('limits').querySelector(`input[data-cat="${c.id}"]`);
          return api.put('/api/limits', {
            category_id: c.id, month, limit_cents: reaisToCents(inp.value || 0),
          });
        });
        await Promise.all(puts);
      }
      await api.post('/api/onboarding/complete');
      location.replace('/');
    } catch (e) { showError(e.message); }
  }

  async function load() {
    try {
      const [s, categories, limits] = await Promise.all([
        api.get('/api/settings'),
        api.get('/api/categories'),
        api.get(`/api/limits?month=${month}`),
      ]);
      seededCats = categories.filter(c => c.active);
      byCat = new Map(limits.map(l => [l.category_id, l.limit_cents]));
      $('monthly_income').value = s.monthly_income / 100;
      $('fixed_costs').value = s.fixed_costs / 100;
      $('savings_goal').value = s.savings_goal / 100;
      $('limitsMonth').textContent = month;
      paintTemplate();
      render();
    } catch (e) { showError(e.message); }
  }

  document.querySelectorAll('[data-template]').forEach(btn =>
    btn.addEventListener('click', () => { template = btn.dataset.template; paintTemplate(); }));
  ['monthly_income', 'fixed_costs', 'savings_goal'].forEach(id =>
    $(id).addEventListener('input', updateAllocation));
  $('back').addEventListener('click', () => { if (step > 0) { step--; render(); } });
  $('continue').addEventListener('click', () => {
    if (isLastStep(step, SETUP_STEPS.length)) finish();
    else { step++; render(); }
  });

  load();
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — updated setup render tests pass; all other tests unaffected.

- [ ] **Step 6: Manual smoke check**

Reset onboarding (delete the local SQLite data file, or set `onboarding_complete` to `0`) and run `npm start`. Open http://localhost:3000/setup.html:
- Suggested path: limits step shows the seeded categories; finishing lands on a populated dashboard.
- Blank path: limits step shows "No categories yet…"; finishing lands on an empty dashboard; Settings shows no categories/groups and lets you add them.
- Going Start → pick Blank → forward → Back → pick Suggested → forward still shows the seeded categories (no premature wipe).

- [ ] **Step 7: Commit**

```bash
git add public/setup.html public/js/setup.js test/setupRender.test.js
git commit -m "feat: starter-template choice in setup wizard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `groups.active` migration + soft-delete → Task 1. ✓
- Groups list filters active; delete blocked by active categories → Task 1. ✓
- Append `sort_order`; add-to-inactive-group rejected → Task 2 (categories) + Task 1 (groups POST). ✓
- `POST /api/onboarding/template` (suggested no-op, blank guarded wipe) → Task 3. ✓
- Grouped limits table with inline rename/remove/recolor + add controls → Task 4. ✓
- Allocation pill stays correct after mutations → Task 4 (`updateAllocation` after `loadLimits`). ✓
- Wizard "Start" template step + blank empty-state → Task 5. ✓
- Tests across crud / onboarding / settingsRender / setupRender → Tasks 1-5. ✓

**Deviation from spec (intentional, called out for review):**
- The spec sketched "click name → inline rename input"; the plan uses a `prompt()` dialog for name/color entry. Same capability (rename/add/recolor inline on the table), simpler and more reliable wiring, and the testable surface (pure render functions) is unchanged. Recolor uses a `prompt()` constrained to the four valid colors rather than a swatch picker.
- The spec described applying the template when leaving the Start step; the plan defers the actual DB mutation to `finish()` to avoid destructively wiping seeded data if the user picks Blank then navigates back to Suggested. Behavior from the user's view is unchanged.

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step contains full code. ✓

**Type consistency:** `renderGroupedLimitRows(groups, cats, byCat)` defined in Task 4 and consumed identically in Task 4's test and `settings.js`. `template` values `'suggested'`/`'blank'` consistent across Tasks 3 and 5. `active` is integer `0`/`1` throughout. Error messages quoted identically between route code and tests. ✓
