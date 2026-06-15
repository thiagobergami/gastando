# Gastando — Spec

**A local web system to track credit-card spending by category against monthly limits, with BI over time.**

- Date: 2026-06-15
- Author: Thiago Bergami Guedes
- Source of truth for domain/seed data: [`card.md`](../card.md)

---

## 1. Purpose & Goals

Track every credit-card transaction by category and month, compare actual spend
to a proposed monthly limit per category, and build up persisted history so the
data can be analyzed (business intelligence) over time.

Concretely, the system must:

1. Persist individual transactions (manual entry), each tied to a category, card, date and amount.
2. Support installment purchases (parcelas) by spreading a purchase across N months.
3. Compare spend vs. an editable monthly limit per category, grouped as in `card.md`.
4. Reproduce the financial summary (income → fixed costs → savings goal → "teto saudável" → projected savings).
5. Provide BI views (trends per category across months, over/under-limit history, biggest categories).
6. Run locally via Docker, persisting to a single SQLite file that survives rebuilds.

### Non-goals (YAGNI)

- No CSV / bank-statement import (manual entry only). May be revisited later.
- No multi-user / authentication (single local user).
- No mobile app; responsive web is enough.
- No cloud deployment, no real-time bank sync.

---

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Data grain | Individual transactions (system aggregates per category/month) |
| Data entry | Manual entry only |
| Categories & limits | Editable in-app, **per-month limit history** (changing a future limit never rewrites past months) |
| Cards | Tracked per transaction (editable card list) |
| Installments | Modeled: a parcelado purchase expands into N monthly transactions |
| Financial scope | Full savings model (income, fixed costs, savings goal, teto, projected savings) |
| Stack | Node + Express + SQLite, Dockerized |
| Frontend | Vanilla HTML/CSS/JS reusing the `card.html` design system; no build step |
| UI language | English |
| Data/content language | pt-BR (category names, examples, currency R$) |
| Spec location | `docs/spec.md` |

---

## 3. Architecture

Single Docker container running a Node + Express server that:

- Serves a static vanilla HTML/CSS/JS frontend (reusing the `card.html` design system:
  sage/gold/clay palette, Fraunces/Hanken/Spline Sans Mono fonts, meter bars).
- Exposes a JSON REST API.
- Persists to a SQLite file on a Docker volume so data survives container rebuilds and
  can be backed up by copying one file.

```
gastando/
  src/
    server.js          # Express bootstrap, static serving, route mounting
    db.js              # SQLite connection + migration runner
    routes/            # categories.js, groups.js, cards.js, limits.js,
                       # transactions.js, settings.js, dashboard.js, bi.js
    services/          # installments.js, dashboard.js, bi.js, money.js
  public/              # index.html (dashboard), transactions.html, settings.html,
                       # bi.html, css/, js/
  migrations/          # 001_schema.sql, 002_seed.sql (seed from card.md)
  data/                # gastando.db (volume-mounted, gitignored)
  test/                # service + API tests
  Dockerfile
  docker-compose.yml
  package.json
```

**Library choices:** `express`, `better-sqlite3` (synchronous, simple, fast for a
single-user app), a small validation helper (hand-rolled or `zod`), `supertest` +
the built-in Node test runner (`node:test`) for tests. Charts via Chart.js (CDN).

---

## 4. Data Model (SQLite)

All monetary amounts are stored as **integer cents** to avoid floating-point drift.
Months are stored as `TEXT` in `YYYY-MM` format.

### `groups`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | e.g. "Essenciais / semi-fixos" |
| color | TEXT | palette token (sage/gold/slate/neutral) for the group header |
| sort_order | INTEGER | |

### `categories`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| group_id | INTEGER FK → groups | |
| name | TEXT | e.g. "Supermercado" |
| examples | TEXT | free text, e.g. "Pão de Açúcar, Assaí" |
| sort_order | INTEGER | |
| active | INTEGER (0/1) | soft-delete; inactive categories keep historical transactions |

### `category_limits`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| category_id | INTEGER FK → categories | |
| month | TEXT (YYYY-MM) | |
| limit_cents | INTEGER | |

Unique on `(category_id, month)`. When the dashboard needs a limit for a month with
no explicit row, it falls back to the most recent prior month's limit (carry-forward).

### `cards`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | Nubank, Mercado Pago, Itaú |
| active | INTEGER (0/1) | soft-delete |

### `installment_groups`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| description | TEXT | e.g. "Avianca" |
| total_cents | INTEGER | full purchase amount |
| total_count | INTEGER | number of parcelas |
| first_month | TEXT (YYYY-MM) | month the first parcela lands |
| category_id | INTEGER FK | |
| card_id | INTEGER FK | |

### `transactions`
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| date | TEXT (YYYY-MM-DD) | |
| category_id | INTEGER FK → categories | |
| card_id | INTEGER FK → cards | |
| amount_cents | INTEGER | > 0 |
| description | TEXT | |
| installment_group_id | INTEGER FK → installment_groups, nullable | null for single-shot purchases |
| installment_no | INTEGER, nullable | 1..total_count |
| installment_total | INTEGER, nullable | denormalized for display |

A transaction's month is derived from `date` (`strftime('%Y-%m', date)`).

### `settings` (key/value)
Keys (values in cents where monetary): `monthly_income`, `fixed_costs`,
`savings_goal`. Optional breakdown keys may be added later. Computed values are
**not** stored — they are derived:

- `teto_cents = monthly_income − fixed_costs − savings_goal`
- `projected_savings_cents = monthly_income − fixed_costs − (sum of spend for the month)`

---

## 5. Business Logic (services)

### Installment expansion (`services/installments.js`)
When a parcelado purchase is created:
1. Create an `installment_groups` row.
2. Compute per-parcela amount = `round(total_cents / total_count)`, distributing the
   rounding remainder so the parcelas sum exactly to `total_cents` (e.g. first parcela
   absorbs the remainder cents).
3. Insert `total_count` transactions, one per consecutive month starting at `first_month`,
   each dated on the 1st of its month (or a chosen day), with `installment_no` 1..N.

All of the above runs in a single DB transaction (atomic). Editing the group amount/count
re-expands (delete + recreate child transactions). Deleting the group deletes its children.

### Dashboard aggregation (`services/dashboard.js`)
For a given month, returns:
- Per category: resolved `limit_cents` (with carry-forward), `spent_cents` (sum of
  transactions in that month), `remaining_cents`, and `status` (`ok` | `over`).
- Per group: subtotals of limit and spend.
- Totals: sum of all limits, sum of all spend, `teto_cents`, `projected_savings_cents`,
  `savings_goal_cents`, and delta vs goal.

### BI aggregation (`services/bi.js`)
- Monthly spend per category across a `[from, to]` month range (matrix for charts).
- Over/under-limit history per category.
- Biggest categories / biggest single transactions for a month or range.

### Money helpers (`services/money.js`)
- Parse/format between cents and `R$ x.xxx,xx` (pt-BR formatting).

---

## 6. API (JSON REST)

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/groups` | list / create groups |
| PUT/DELETE | `/api/groups/:id` | update / delete |
| GET/POST | `/api/categories` | list / create categories |
| PUT/DELETE | `/api/categories/:id` | update / soft-delete |
| GET | `/api/limits?month=YYYY-MM` | resolved limits for a month |
| PUT | `/api/limits` | set a category's limit for a month |
| GET/POST | `/api/cards` | list / create cards |
| PUT/DELETE | `/api/cards/:id` | update / soft-delete |
| GET | `/api/transactions?month=&category_id=&card_id=` | filtered list |
| POST | `/api/transactions` | create (installment fields optional → expands group) |
| PUT/DELETE | `/api/transactions/:id` | update / delete single transaction |
| DELETE | `/api/installment-groups/:id` | delete a group + all child transactions |
| GET/PUT | `/api/settings` | read / update savings-model values |
| GET | `/api/dashboard?month=YYYY-MM` | hero + per-category + group subtotals |
| GET | `/api/bi/trends?from=YYYY-MM&to=YYYY-MM` | spend-per-category matrix over months |

**Conventions:** request/response bodies are JSON; amounts sent/received in cents;
errors return appropriate HTTP status with `{ "error": "message" }`.

---

## 7. Frontend (vanilla, reuses `card.html` design)

Shared `css/app.css` lifts the `card.html` design tokens and components (palette,
fonts, hero, meters, cards). A small `js/api.js` wraps `fetch`. A month selector in
the header is shared across pages.

- **Dashboard (`index.html`)** — month selector; the savings hero (income → teto →
  projected savings, with meter and ok/under pill); category cards grouped by group,
  each showing limit / spent / remaining and a colored meter (green normally, clay when
  over). Mirrors `card.html` layout.
- **Transactions (`transactions.html`)** — filterable list (month / category / card);
  add & edit form with an "installment?" toggle (when on: total amount + number of
  parcelas + first month); rows from an installment group are visually marked
  (e.g. "3/6") and link back to their group.
- **Settings (`settings.html`)** — manage groups, categories (name, examples, group,
  active), per-month limits, cards, and the savings-model values (income, fixed costs,
  savings goal).
- **BI (`bi.html`)** — Chart.js charts styled to the palette: spend per category across
  months (line/stacked bar), over/under-limit history, biggest categories.

Errors from the API are shown inline / via a small toast; no silent failures.

---

## 8. Error Handling

- API validates input: `amount > 0`, valid `YYYY-MM` / `YYYY-MM-DD` formats, referenced
  category/card exists and is active, installment `total_count >= 1`.
- All multi-row writes (installment expansion, group edit/delete) run inside a single
  SQLite transaction; on error the transaction rolls back.
- Invalid requests → `400` with `{error}`; missing resources → `404`; unexpected → `500`
  with a generic message (details logged server-side).
- Frontend surfaces every API error inline.

---

## 9. Testing (TDD)

- **Services (unit):** installment expansion (sum equals total, remainder distribution,
  month sequence), dashboard aggregation (limit carry-forward, spent sums, status,
  teto & projected savings math), BI aggregation, money formatting.
- **API (integration):** route tests with `supertest` against an in-memory SQLite,
  covering happy paths and validation errors.
- **Frontend:** kept thin (logic lives in API). Optional smoke test that pages load and
  render dashboard data.
- Tests run via `node --test`; `npm test` is the entry point and must pass before
  features are considered done.

---

## 10. Seed Data (from `card.md`, June/2026)

Migration `002_seed.sql` seeds, so the app opens resembling `card.md` on first run:

- **Groups:** Essenciais / semi-fixos, Estilo de vida, Fundos, Folga.
- **Categories + June limits + examples:** all 15 rows from `card.md` (Supermercado 850,
  Transporte 520, Assinaturas & Serviços 450, Pet 250, Saúde & Farmácia 180,
  Restaurantes & Delivery 650, Jogos 350, Hobbies criativos 550, Esportes & Vestuário 350,
  Lazer & Eventos 200, Compras gerais 1000, Viagens 650, Casa & Manutenção 300,
  Educação & Cursos 220, Imprevistos / Folga 450). Limits stored as cents.
- **Cards:** Nubank, Mercado Pago, Itaú.
- **Savings model:** monthly_income 14.350, fixed_costs 3.770, savings_goal 2.440
  (→ teto 8.140), per `card.md`.
- Note: the "Gasto atual" figures in `card.md` are illustrative and are **not** seeded as
  transactions; transactions start empty and are entered manually. (Optional: a dev-only
  fixture could seed example transactions — out of scope for V1.)

---

## 11. Docker

- `Dockerfile`: Node base image, install deps, copy app, run migrations on start,
  expose the HTTP port, start `server.js`.
- `docker-compose.yml`: one service, maps the host port, mounts `./data` as a volume so
  `gastando.db` persists across rebuilds.
- `data/` is gitignored.

---

## 12. Build Order (for the implementation plan)

1. Project scaffold (package.json, Express server, static serving, health route).
2. DB layer + migration runner + schema (`001_schema.sql`).
3. Money helpers (+ tests).
4. CRUD for groups, categories, cards, limits (+ tests).
5. Transactions CRUD (single-shot) (+ tests).
6. Installment expansion service + endpoints (+ tests).
7. Settings + dashboard aggregation service + endpoint (+ tests).
8. BI aggregation service + endpoint (+ tests).
9. Seed migration (`002_seed.sql`).
10. Frontend: shared CSS/JS, Dashboard, Transactions, Settings, BI.
11. Dockerfile + docker-compose; verify persistence across rebuilds.
