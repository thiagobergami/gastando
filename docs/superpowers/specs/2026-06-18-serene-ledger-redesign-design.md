# Gastando — "Serene Ledger" UI Redesign — Design

**Port the Stitch-generated "Serene Ledger" design into Gastando's frontend using Tailwind, as one responsive page per route, rewired to the existing JSON API.**

- Date: 2026-06-18
- Author: Thiago Bergami Guedes
- Visual source of truth: Stitch project `projects/12854342184843741473`, design system `assets/142c168b5d7e47ebac2651ab8720bfd8` ("Serene Ledger"). 10 screens (desktop + mobile for Dashboard, Transactions, Settings, BI, Simulate).
- Supersedes the frontend portions of [`docs/spec.md`](../../spec.md) §3 and §7 (vanilla "no build step / reuse card.html" approach).

---

## 1. Purpose & Goals

Replace the current hand-written `app.css` look with the "Serene Ledger" visual system (warm-paper editorial aesthetic: sage / muted gold / terracotta on off-white, Playfair Display + Inter + JetBrains Mono) across all five pages, for both desktop and mobile, while keeping the app fully functional against the existing API.

Concretely:

1. Adopt Tailwind CSS (compiled via the Tailwind CLI into one static stylesheet) as the styling system.
2. Implement each page as a single responsive HTML file: desktop top-nav + multi-column, collapsing to a mobile bottom tab bar + single column + floating add button.
3. Rewrite the DOM the page JS emits to match the Stitch markup, replacing mockup sample data with live API data.
4. Preserve the Express server, routes, services, SQLite layer, and the JSON API contract.

### Non-goals (YAGNI)

- No new app features, pages, or navigation beyond the existing five pages.
- No API behavior changes (the existing endpoints already return every field the design needs — see §5).
- No dark mode, no theming switch, no auth, no CSV import.
- No client-side framework (React/Vue/etc.) and no bundler beyond the Tailwind CLI.

---

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Implementation strategy | Full port of the Stitch pages to Tailwind, rewired to the existing API (option "B") |
| Styling system | Tailwind CSS, compiled with the Tailwind CLI to a single static `public/css/app.css` |
| Tailwind delivery | CLI build step (`build:css` / `watch:css`); no CDN, no runtime compile |
| Responsive strategy | One responsive HTML per route; desktop ↔ mobile via Tailwind breakpoints (`md`) |
| Fonts | Playfair Display (display/headings/big numbers), Inter (body/UI), JetBrains Mono (currency/dates) |
| Charts | Keep Chart.js (CDN); restyle to the Serene Ledger palette |
| Backend | Unchanged — no route or service changes (existing responses already carry every needed field) |
| Build artifact | `public/css/app.css` is generated and git-ignored; built in Docker before start |

---

## 3. Architecture

Unchanged at every level except the static frontend and the build pipeline: a single Node + Express container serving static files and a JSON REST API over SQLite. No backend code changes (verified: `GET /api/dashboard` already returns per-category `examples`, `group_name`, `group_color`, and per-group subtotals).

### 3.1 Build pipeline

- **Dev dependencies:** `tailwindcss` (+ `@tailwindcss/cli`).
- **`tailwind.config.js`:** encodes the Serene Ledger tokens (colors, fonts, radii, spacing, shadow) so they are available as utilities. `content` globs cover `public/**/*.html` and `public/js/**/*.js` so classes used in JS template literals are not purged.
- **`public/css/tailwind.src.css`:** `@tailwind base; @tailwind components; @tailwind utilities;` plus an `@layer components` block for repeated patterns.
- **npm scripts:**
  - `build:css` → `tailwindcss -i public/css/tailwind.src.css -o public/css/app.css --minify`
  - `watch:css` → same with `--watch`
  - `start` stays `node src/server.js`; dev runs `watch:css` + `start`.
- **`.gitignore`:** add `public/css/app.css` (built artifact).
- **`Dockerfile`:** add `RUN npm run build:css` before the start command so the image ships the compiled CSS.
- **Fonts:** Google Fonts `<link>` in each page `<head>` (existing pattern).

### 3.2 What does NOT change

Express bootstrap (`src/server.js`), all routes (`src/routes/*`), services (`src/services/*`), `src/db.js`, migrations, SQLite storage, the JSON API contract, `public/js/api.js`, and `public/js/format.js`. The app remains "static shell + fetch-and-render-DOM"; only the emitted markup and the CSS change.

---

## 4. Frontend structure

### 4.1 Design tokens (`tailwind.config.js`)

Lifted from the Serene Ledger design system:

- **Colors:** `paper/surface` `#fbf9f4`, `card` `#ffffff`, `ink` `#1b1c19`, `ink-mut` `#424844`, `line` `#e4e2dd`; `sage` `#4c6455`, `sage-soft` `#8fa998`; `gold` `#735c00` / accent `#d4af37`; `clay` `#8a4f35` / soft `#c27d60`; `slate` for the "Fundos" group; plus muted chart tints.
- **Fonts:** `font-display` → Playfair Display; `font-sans` → Inter (default body); `font-mono` → JetBrains Mono (all currency/date figures).
- **Radii:** `rounded-lg` = 16px (cards), `rounded` = 8px (controls), `rounded-full` (meters/pills).
- **Shadow:** soft sage-tinted ambient shadow for cards.

### 4.2 Shared chrome — `public/js/chrome.js` (new)

Exports `renderNav(activeRoute)` (and any shared header bits). Mounts:

- **Desktop (`md+`):** top nav bar — "Gastando" wordmark + tab links (Dashboard / Transactions / Settings / BI / Simulate), active link in sage; right-aligned month picker on pages that use one.
- **Mobile (`< md`):** fixed bottom tab bar (5 icon+label items, active = sage) + a floating "+" action button on Dashboard and Transactions that triggers the add-transaction flow (bottom sheet).

Each page HTML is a thin shell: `<head>` (fonts + built `app.css`), nav mount point, page mount point(s) (`#hero`, `#groups`, `#list`, etc. as today), and the page `<script type="module">`. Nav is injected by `chrome.js` so the five pages don't hardcode it.

### 4.3 Shared component patterns (`@layer components`)

Defined once so JS template literals stay readable: `.paper-card`, `.meter` / `.meter-fill` (sage; `.over` → terracotta), `.tag` (group chips: sage / gold / slate / neutral), `.pill` (status: ok / over), `.field` (labeled input), `.bottom-sheet` (mobile add form), restyled `.toast`.

### 4.4 Shared render helpers — `public/js/ui.js` (new)

`meterBar(spent, limit, status)`, `statusPill(state, label)`, `groupTag(groupName)` — used across Dashboard, Settings, and Simulate so the over-limit visual language is defined in one place. `format.js` (`formatBRL`, `reaisToCents`, `centsToReais`, `currentMonth`) and `api.js` (`api`, `getPage`, `showError`) are reused as-is.

---

## 5. Per-page plan

Each page keeps its existing data flow; render functions are rewritten to emit Tailwind markup matching the Stitch screens. Mockup sample data is replaced with live API data.

### Dashboard (`index.html` / `js/dashboard.js`)
- Savings hero: projected-savings big number (Playfair), ceiling line, ok/over pill, spend-vs-ceiling capsule meter.
- Category rows grouped under the four group headers **with group subtotals**; each row: name + **examples line** + **group tag chip** + limit + spent + meter (terracotta when over) + over-by hint.
- **No API change needed** (verified): `GET /api/dashboard` already returns, per category, `examples`, `group_name`, `group_color`, `limit_cents`, `spent_cents`, `remaining_cents`, `status`; and a `groups` array with per-group `name`, `color`, and `limit_cents`/`spent_cents` subtotals. The richer dashboard render is purely a frontend change.

### Transactions (`transactions.html` / `js/transactions.js`)
- Desktop: add/edit form card (Date, Category, Card, Amount, Description, Installment toggle → `#parcelas` + first month) above a styled table — category tag chips, mono right-aligned amounts, installment "3/6" chips, hover edit/delete, existing pager (`getPage`, `X-Total-Count`).
- Mobile: chronological transaction cards + add-transaction **bottom sheet** launched from the FAB.
- Endpoints and pagination unchanged.

### Settings (`settings.html` / `js/settings.js`)
- Three paper cards: Savings model (income / fixed costs / goal + derived ceiling read-out), per-month Limits (editable rows with group chips + sum footer), Cards (toggle / edit / delete + add field).
- Existing `/api/settings`, `/api/limits`, `/api/cards` wiring preserved.

### BI (`bi.html` / `js/bi.js`)
- Keep Chart.js (CDN); introduce a shared chart-theme object applying the muted sage / gold / terracotta / slate palette, Inter/JetBrains fonts, soft gridlines.
- Restyle the filter card (From / To / Update). The five charts (by-category/trends, by-card, by-group, budget-vs-actual, installment-forecast) already have endpoints — only presentation changes.

### Simulate (`simulate.html` / `js/simulate.js`)
- Restyled input card (Category, Total, # parcelas, First month, Simulate).
- Results: forward-looking table (desktop) / stacked month cards (mobile), each with a per-month meter and ok/over pill, plus an "over in N of M months" summary line.
- Uses existing `GET /api/simulate`.

---

## 6. Error handling

Unchanged contract. All failures route through `showError` (toast restyled to the palette). Client-side checks (installment toggle wiring, amount > 0, `YYYY-MM` / `YYYY-MM-DD` formats) are preserved; the API remains the source of truth, and every API error is surfaced inline. No silent failures.

---

## 7. Testing

- **Backend:** no backend changes, so the existing `node --test` suite must simply stay green (no new assertions required).
- **CSS build:** `npm run build:css` must succeed and emit a non-empty `public/css/app.css`; this runs in Docker and should be smoke-checked in CI.
- **Frontend (thin, per existing convention):** optional smoke test that each page shell loads and its mount points render against a mocked API. Logic stays in the already-tested API; no heavy DOM-framework testing.
- **Coverage:** the ≥80% gate stays. Logic is untouched (markup/CSS only), so it should hold.

---

## 8. Rollout

- Work proceeds on a dedicated branch off the current frontend state (the Simulate/BI pages live on `feat/simulation-and-bi`, so the redesign branches from there, not `main`).
- Order: (1) shared layer — tokens, build pipeline, `chrome.js`, `ui.js`, component classes; (2) port **Dashboard** end-to-end as the reference page and review it; then (3) Transactions → (4) Settings → (5) BI → (6) Simulate.
- Update `docs/spec.md` §3 and §7 to describe the Tailwind build and responsive layout, and reference the Stitch project as the visual source of truth.

---

## 9. Build order (for the implementation plan)

1. Tailwind toolchain: deps, `tailwind.config.js`, `tailwind.src.css`, npm scripts, `.gitignore`, Dockerfile build step.
2. Design tokens + shared `@layer components` patterns; verify `build:css` output.
3. `chrome.js` (responsive nav + bottom tab bar + FAB) and `ui.js` render helpers.
4. Dashboard port (frontend only; endpoint already returns the needed fields).
5. Transactions port (table + mobile bottom sheet).
6. Settings port.
7. BI port (Chart.js theme).
8. Simulate port.
9. Update `docs/spec.md`; final test + coverage + `build:css` verification.
