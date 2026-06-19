# Budget Carryover (Rollover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a category overspends its monthly limit, carry the overage forward and add it on top of next month's spending for budget tracking only, self-correcting and never touching real-money totals.

**Architecture:** Carry is computed on the fly in `src/services/dashboard.js` by walking month-by-month from a category's earliest transaction month up to the requested month. The dashboard payload gains `carry_in_cents` and `effective_spent_cents` per category (and `effective_spent_cents` per group). The frontend renders a "carryover" badge when carry is present and drives the category meter/status from effective spending. Real-money totals (projected savings, ceiling) keep using actual transactions.

**Tech Stack:** Node.js, better-sqlite3, Express 5, vanilla ES-module frontend, `node:test` + supertest.

## Global Constraints

- All monetary values are integer cents. Never use floats for money.
- Months are `YYYY-MM` strings; use `addMonths` / `monthOf` from `src/services/dates.js`.
- Coverage must stay ≥80% across all metrics (`npm run coverage`).
- `spent_cents` (category, group, and totals) MUST remain **actual** spending. Carry is exposed only via the new `carry_in_cents` / `effective_spent_cents` fields.
- The carry rule: `carry_in(M) = max(0, actual_spent(M-1) + carry_in(M-1) - limit(M-1))`, reset to 0 in any month where the limit is 0.

---

### Task 1: Carry computation in the dashboard service

**Files:**
- Modify: `src/services/dashboard.js`
- Test: `test/dashboard.test.js`

**Interfaces:**
- Consumes: existing `pickLimit` prepared statement (`SELECT limit_cents ... month<=? ORDER BY month DESC LIMIT 1`) and `sumSpend` (`SELECT SUM(amount_cents) ... strftime('%Y-%m', date)=?`) already defined in `buildDashboard`. `addMonths(ym, n)` from `src/services/dates.js`.
- Produces: each category object in the dashboard payload gains `carry_in_cents` (integer) and `effective_spent_cents` (integer = `spent_cents + carry_in_cents`); `remaining_cents` becomes `limit_cents - effective_spent_cents`; `status` becomes `'over'` when `effective_spent_cents > limit_cents`. Each group object gains `effective_spent_cents`. Real-money `totals` are unchanged.

- [ ] **Step 1: Write the failing tests**

Add these tests to the end of `test/dashboard.test.js` (the file already imports `test`, `assert`, `request`, `makeTestDb`, `createApp`):

```javascript
test('dashboard carries overage forward and self-corrects', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);

  // Limit R$100,00 set in January; it applies to all later months.
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-01', limit_cents: 10000 }).expect(200);

  const spend = async (month, cents) => {
    await request(app).post('/api/transactions').send({
      date: `${month}-10`, category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: cents,
    }).expect(201);
  };
  await spend('2026-01', 13000); // 130 vs 100 -> over by 30
  await spend('2026-02', 8000);  // 30 + 80 = 110 -> over by 10
  await spend('2026-03', 5000);  // 10 + 50 = 60  -> under, clears
  await spend('2026-04', 5000);  // 0 + 50 = 50   -> under

  const catFor = async (month) => {
    const d = await request(app).get(`/api/dashboard?month=${month}`).expect(200);
    return { cat: d.body.categories.find(c => c.category_id === ctx.categoryId), totals: d.body.totals };
  };

  const jan = await catFor('2026-01');
  assert.equal(jan.cat.carry_in_cents, 0);
  assert.equal(jan.cat.effective_spent_cents, 13000);
  assert.equal(jan.cat.spent_cents, 13000);
  assert.equal(jan.cat.remaining_cents, -3000);
  assert.equal(jan.cat.status, 'over');

  const feb = await catFor('2026-02');
  assert.equal(feb.cat.carry_in_cents, 3000);
  assert.equal(feb.cat.spent_cents, 8000);            // actual, not effective
  assert.equal(feb.cat.effective_spent_cents, 11000);
  assert.equal(feb.cat.remaining_cents, -1000);
  assert.equal(feb.cat.status, 'over');
  assert.equal(feb.totals.spent_cents, 8000);         // real-money total unaffected by carry

  const mar = await catFor('2026-03');
  assert.equal(mar.cat.carry_in_cents, 1000);
  assert.equal(mar.cat.effective_spent_cents, 6000);
  assert.equal(mar.cat.status, 'ok');

  const apr = await catFor('2026-04');
  assert.equal(apr.cat.carry_in_cents, 0);            // debt cleared in March, no snowball
  assert.equal(apr.cat.effective_spent_cents, 5000);
  assert.equal(apr.cat.status, 'ok');
});

test('dashboard: no carry for a category without a limit', async () => {
  const ctx = makeTestDb(); // default category has no limit row
  const app = createApp(ctx.db);
  for (const month of ['2026-01', '2026-02']) {
    await request(app).post('/api/transactions').send({
      date: `${month}-10`, category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 5000,
    }).expect(201);
  }
  const d = await request(app).get('/api/dashboard?month=2026-02').expect(200);
  const cat = d.body.categories.find(c => c.category_id === ctx.categoryId);
  assert.equal(cat.carry_in_cents, 0);
  assert.equal(cat.effective_spent_cents, 5000);
});

test('dashboard: group rollup reflects carry via effective_spent_cents', async () => {
  const ctx = makeTestDb();
  const app = createApp(ctx.db);
  await request(app).put('/api/limits')
    .send({ category_id: ctx.categoryId, month: '2026-01', limit_cents: 10000 }).expect(200);
  await request(app).post('/api/transactions').send({
    date: '2026-01-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 13000,
  }).expect(201);
  await request(app).post('/api/transactions').send({
    date: '2026-02-10', category_id: ctx.categoryId, card_id: ctx.cardId, amount_cents: 8000,
  }).expect(201);

  const d = await request(app).get('/api/dashboard?month=2026-02').expect(200);
  const g = d.body.groups.find(x => x.group_id === ctx.groupId);
  assert.equal(g.spent_cents, 8000);            // actual
  assert.equal(g.effective_spent_cents, 11000); // actual + 3000 carry
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test 2>&1 | grep -A3 "carries overage"`
Expected: FAIL — `carry_in_cents` is `undefined`, assertions on `effective_spent_cents` fail.

- [ ] **Step 3: Add the carry helper to `src/services/dashboard.js`**

At the top of the file, add the import:

```javascript
const { addMonths } = require('./dates');
```

Then add this function above `buildDashboard`:

```javascript
function computeCarryIn(db, categoryId, month, pickLimit, sumSpend) {
  const first = db.prepare(
    `SELECT MIN(strftime('%Y-%m', date)) AS m FROM transactions WHERE category_id=?`).get(categoryId);
  if (!first || !first.m || first.m >= month) return 0;
  let carry = 0;
  for (let m = first.m; m < month; m = addMonths(m, 1)) {
    const limitRow = pickLimit.get(categoryId, m);
    const limit = limitRow ? limitRow.limit_cents : 0;
    const actual = sumSpend.get(categoryId, m).s;
    carry = limit > 0 ? Math.max(0, actual + carry - limit) : 0;
  }
  return carry;
}
```

- [ ] **Step 4: Wire carry into the category mapping**

In `buildDashboard`, replace the `cats.map(...)` body so it computes carry and effective spend:

```javascript
  const categories = cats.map(c => {
    const limit = pickLimit.get(c.id, month);
    const limit_cents = limit ? limit.limit_cents : 0;
    const spent_cents = sumSpend.get(c.id, month).s;
    const carry_in_cents = computeCarryIn(db, c.id, month, pickLimit, sumSpend);
    const effective_spent_cents = spent_cents + carry_in_cents;
    return {
      category_id: c.id, name: c.name, examples: c.examples,
      group_id: c.group_id, group_name: c.group_name, group_color: c.group_color,
      limit_cents, spent_cents, carry_in_cents, effective_spent_cents,
      remaining_cents: limit_cents - effective_spent_cents,
      status: effective_spent_cents > limit_cents ? 'over' : 'ok',
    };
  });
```

- [ ] **Step 5: Add `effective_spent_cents` to the group rollup**

In `buildDashboard`, update the group-map initializer and accumulation:

```javascript
      groupsMap.set(c.group_id, {
        group_id: c.group_id, name: c.group_name, color: c.group_color,
        limit_cents: 0, spent_cents: 0, effective_spent_cents: 0,
      });
    }
    const g = groupsMap.get(c.group_id);
    g.limit_cents += c.limit_cents;
    g.spent_cents += c.spent_cents;
    g.effective_spent_cents += c.effective_spent_cents;
```

Leave the real-money totals block (`spent_cents`, `teto_cents`, `projected_savings_cents`, etc.) exactly as-is — it must keep summing actual `c.spent_cents`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test 2>&1 | tail -20`
Expected: all dashboard tests PASS, including the three new ones. The existing `dashboard computes spend, status, teto and projected savings` test still passes (no carry in that scenario, so `effective` equals actual).

- [ ] **Step 7: Commit**

```bash
git add src/services/dashboard.js test/dashboard.test.js
git commit -m "feat: carry category overage forward in dashboard budget tracking

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Carryover badge and effective meter on the dashboard UI

**Files:**
- Modify: `public/js/dashboard.js`
- Test: `test/dashboardRender.test.js`

**Interfaces:**
- Consumes: category fields `carry_in_cents`, `effective_spent_cents` (from Task 1), plus existing `spent_cents`, `limit_cents`, `status`; group field `effective_spent_cents`. `formatBRL` from `./format.js`; `meterBar`, `statusPill`, `groupTag` from `./ui.js`.
- Produces: `renderGroups` output containing a `carryover` badge for categories with `carry_in_cents > 0`, with the category meter and group "spent / limit" line driven by effective spend. Falls back to actual spend when the effective fields are absent (defensive against older payloads).

- [ ] **Step 1: Write the failing test**

Add this test to the end of `test/dashboardRender.test.js`:

```javascript
test('renderGroups shows carryover badge and effective group total', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const d = {
    categories: [
      { category_id: 1, name: 'Games', examples: '', group_id: 1,
        group_name: 'Estilo de vida', limit_cents: 10000, spent_cents: 8000,
        carry_in_cents: 3000, effective_spent_cents: 11000, status: 'over' },
    ],
    groups: [{ group_id: 1, name: 'Estilo de vida', limit_cents: 10000,
      spent_cents: 8000, effective_spent_cents: 11000 }],
    totals: {},
  };
  const html = renderGroups(d);
  assert.match(html, /carryover/);          // badge present when carrying
  assert.match(html, /R\$ 30,00/);          // the carried amount is shown
  assert.match(html, /meter-fill over/);    // meter driven by effective spend
});

test('renderGroups omits carryover badge when not carrying', async () => {
  const { renderGroups } = await import('../public/js/dashboard.js');
  const d = {
    categories: [
      { category_id: 1, name: 'Games', examples: '', group_id: 1,
        group_name: 'Estilo de vida', limit_cents: 10000, spent_cents: 5000,
        carry_in_cents: 0, effective_spent_cents: 5000, status: 'ok' },
    ],
    groups: [{ group_id: 1, name: 'Estilo de vida', limit_cents: 10000,
      spent_cents: 5000, effective_spent_cents: 5000 }],
    totals: {},
  };
  const html = renderGroups(d);
  assert.doesNotMatch(html, /carryover/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test 2>&1 | grep -A3 "carryover badge"`
Expected: FAIL — no `carryover` text in the rendered output.

- [ ] **Step 3: Update `renderGroups` in `public/js/dashboard.js`**

Replace the group "spent / limit" line and the category card body. First, the group header amount (line currently reading `${formatBRL(g.spent_cents)} / ${formatBRL(g.limit_cents)}`):

```javascript
        <span class="font-mono text-sm text-ink-mut">${formatBRL(g.effective_spent_cents ?? g.spent_cents)} / ${formatBRL(g.limit_cents)}</span>
```

Then replace the category card template (the `g.cats.map(c => ...)` block) with:

```javascript
        ${g.cats.map(c => {
          const carry = c.carry_in_cents || 0;
          const eff = c.effective_spent_cents ?? c.spent_cents;
          return `
          <div class="paper-card">
            <div class="flex items-start justify-between gap-4">
              <div>
                <div class="font-semibold flex items-center gap-2">${c.name} ${groupTag(g.name)}</div>
                ${c.examples ? `<div class="text-xs text-ink-mut mt-0.5">${c.examples}</div>` : ''}
              </div>
              <div class="text-right">
                <div class="font-display text-xl">${formatBRL(c.limit_cents)}</div>
                <div class="font-mono text-xs text-ink-mut mt-0.5">spent ${formatBRL(c.spent_cents)}</div>
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3">
              <div class="flex-1">${meterBar(eff, c.limit_cents, c.status)}</div>
              ${carry > 0 ? `<span class="pill pill-over">+${formatBRL(carry)} carryover</span>` : ''}
              ${statusPill(c.status)}
            </div>
          </div>`;
        }).join('')}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test 2>&1 | grep -A3 "carryover"`
Expected: both new render tests PASS. The existing `renderGroups shows examples, group tag, and over meter` test still passes (its data has no `effective_spent_cents`, so the fallback uses `spent_cents` and the over meter still renders for Transporte).

- [ ] **Step 5: Rebuild CSS (no new utility classes used, but keep build current)**

Run: `npm run build:css`
Expected: exits 0, regenerates `public/css/app.css`. (No new Tailwind classes were introduced — `pill`, `pill-over`, `meter-fill` already exist — so the file may be unchanged.)

- [ ] **Step 6: Commit**

```bash
git add public/js/dashboard.js test/dashboardRender.test.js public/css/app.css
git commit -m "feat: show carryover badge and effective meter on dashboard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verify full suite and coverage

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test 2>&1 | tail -15`
Expected: all tests pass, no failures.

- [ ] **Step 2: Check coverage stays ≥80%**

Run: `npm run coverage 2>&1 | tail -20`
Expected: all metrics ≥80%; `src/services/dashboard.js` and `public/js/dashboard.js` lines exercised by the new tests.

- [ ] **Step 3: Manual smoke check (optional, if a dev server is handy)**

Run: `npm start` and open `http://localhost:3000`, pick a month following an over-budget month for a limited category; confirm the `+R$… carryover` badge appears and the meter reflects effective spend, while projected savings in the hero is unchanged from actual spending.

## Self-Review

- **Spec coverage:** Carry rule → Task 1 helper + tests (Jan–Apr example). Budget-view-only (real-money totals untouched) → Task 1 Step 5 note + Feb totals assertion. No-limit category accrues nothing → Task 1 test. Group rollup uses effective → Task 1 test + Task 2. Computed on the fly (no schema change) → Task 1 helper. UI badge only when carrying → Task 2 both tests. Testing list items 1–5 all covered. No gaps.
- **Placeholder scan:** No TBD/TODO; every code step shows full code; Task 3 Step 3 is explicitly optional manual verification, not a placeholder.
- **Type consistency:** `carry_in_cents`, `effective_spent_cents`, `computeCarryIn(db, categoryId, month, pickLimit, sumSpend)` used identically across tasks; group `effective_spent_cents` matches between Task 1 producer and Task 2 consumer.
