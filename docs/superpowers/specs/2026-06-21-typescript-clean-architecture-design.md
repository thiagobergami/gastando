# TypeScript + Clean Architecture for `src/`

**Date:** 2026-06-21
**Status:** Approved design — ready for implementation planning
**Scope:** Backend `src/` and the test suite. Frontend (`public/js`) stays plain JS.

## 1. Motivation & Goals

The current `src/` is plain CommonJS. Routes are factory functions `(db) => router`
that perform request validation and raw SQL inline against `better-sqlite3`. There is
no type system, no boundary between HTTP and persistence, and validation is ad-hoc per
route. This rework targets four outcomes the user explicitly asked for:

1. **Type safety / fewer bugs** — contract mismatches (route ↔ DB ↔ frontend) caught at
   compile time.
2. **Testability & boundaries** — domain logic unit-testable without Express or a DB.
3. **Reliable API contracts** — runtime-validated requests and guaranteed response shapes.
4. **Maintainability / future growth** — consistent structure and conventions.

The chosen approach is **full clean architecture (ports & adapters)** in **TypeScript**,
with **Zod** for contracts, executed as an **incremental, layer-by-layer migration**.

## 2. Hard Constraints (must not break)

- **The HTTP contract is frozen.** `public/js` calls these endpoints. Every path, request
  body, response shape, status code, the `X-Total-Count` header, and the `{ error }` error
  envelope must remain byte-for-byte compatible. The frontend is not modified.
- **`pkg` binary distribution stays.** Single-binary Win/Linux/macOS with `better-sqlite3`
  bundled. TypeScript introduces a compile step before `pkg`.
- **Migrations stay raw `.sql`**, run unchanged by the existing migration runner.
- **The test suite stays the contract safety net.** `node:test` + `supertest` continue to
  drive `createApp`, and must stay green at every migration step.
- **CommonJS output.** The project is already `"type": "commonjs"`; TS compiles to CJS to
  keep `pkg` + `better-sqlite3` + Express 5 on the proven path.

## 3. Target Layer Structure

```
src/
  domain/         pure; zero framework/db dependencies
    entities/       Transaction, Category, Group, Card, Limit,
                    InstallmentGroup, Settings (+ invariants)
    services/       money, dates, installment-split (pure functions)
    ports/          repository INTERFACES (TransactionRepository, …)
    errors.ts       domain error types (carry a status hint)
  application/
    use-cases/      CreateTransaction, CreateInstallmentPurchase,
                    ListTransactions, UpdateTransaction, DeleteTransaction,
                    category/group/card/limit management, onboarding,
                    settings, Simulate, Dashboard, Bi
  adapters/
    http/
      controllers/  one express controller per resource
      schemas/      Zod request/query schemas → parsed DTOs
      presenters/   domain → response DTO mapping
      error-mapper.ts  domain/validation errors → { status, { error } }
  infra/
    db/             connection (openDatabase), migration runner
    repositories/   SQLite implementations of domain ports
    paths.ts        DB path / asset resolution
    server.ts       process bootstrap (entry for tsx/dist/pkg)
    composition.ts  DI root: wires repos → use-cases → controllers → app
  contracts/        shared DTO / response types (inferred from Zod schemas)
```

### Dependency rule

`domain` depends on nothing. `application` depends only on `domain` ports. `adapters` and
`infra` depend inward. Concrete wiring happens **only** in `infra/composition.ts`.

### Where ceremony is and isn't used

- **Repository ports (interfaces) are used** — this is the real seam: it decouples
  use-cases from `better-sqlite3`, enables in-memory/mock repositories in unit tests, and
  is where "swap the DB" would happen.
- **Pure functions stay plain functions** — `money` (`formatBRL`), `dates` (`addMonths`),
  and `splitCents` are not wrapped in interfaces. Abstracting them buys nothing and would
  be dead indirection. This keeps the architecture clean where it pays and lean where it
  doesn't.

### `createApp` shape

`createApp` remains the integration entry point but takes wired dependencies (or a
composition container) rather than a raw `db`. A thin `createApp(db)` overload (or a
`buildAppFromDb(db)` helper) is retained so existing supertest setup
(`createApp(makeTestDb().db)`) keeps working with minimal churn.

## 4. Contracts (Zod)

- One Zod schema per request body / query string. **TS types are `z.infer`'d** from the
  schemas — schemas are the single source of truth for both runtime validation and static
  types.
- Validation runs at the HTTP edge (controller), replacing the ad-hoc `isMonth` / `isDate`
  / `isPositiveInt` helpers. **The exact 400 messages that tests assert on are preserved**
  (e.g. `"month must be YYYY-MM"`, `"amount_cents must be a positive integer"`,
  `"category_id does not exist"`).
- DB row shapes are explicit TS interfaces inside `infra/repositories`, mapped to domain
  entities at the data boundary — raw rows never leak past the data layer.
- Response DTOs are typed in `contracts/`; presenters guarantee the outgoing shapes.

## 5. Build, Dev & Test Toolchain

- **TS config:** `strict: true`, target Node 22, **module + output = CommonJS**.
- **Production build:** `tsc` → `dist/`, then `pkg dist/server.js`. The `build:binaries`
  script becomes `build:css && tsc && pkg …`. `pkg.assets` (public, migrations,
  `better-sqlite3` native node binding) unchanged.
- **Dev / start:** `tsx` runs the TS entry without a precompile step.
- **Tests:** `node --import tsx --test "test/**/*.test.ts"` — same runner, same supertest,
  ported to TS. (`test/helpers.js` → `.ts`; render tests that import `public/js` stay
  importing the JS frontend unchanged.)
- **CI:** add a `tsc --noEmit` typecheck step alongside `npm test` in the release workflow.

### Integration risk handled explicitly

`paths.ts` and the migration-dir resolution use `__dirname + '..'`. Moving the runtime
entry into `dist/` shifts that base. The implementation plan must **verify
`resolveDbPath` and the migrations directory resolve correctly in all three runtimes** —
`tsx` (dev), compiled `dist/` run, and inside a `pkg` binary — with a **packaged smoke
test** (boot the binary, run a migration, hit `/api/health`) before the work is declared
done.

## 6. Migration Sequence (incremental; suite green throughout)

Each step is a reviewable commit with `npm test` passing.

1. **Toolchain in, `allowJs: true`.** Add `tsconfig.json`, `tsx`, `zod`, build/test
   scripts. Everything still runs as JS. Establishes the compile + run + test pipeline
   first, in isolation.
2. **`infra` layer → TS.** `db`, `paths`, migration runner, `server`, and a first
   `composition.ts`. Verify the three-runtime path resolution here.
3. **`data` layer.** Extract typed SQLite repositories behind domain ports; routes call
   repositories instead of inline SQL (still procedural routes at this point).
4. **`domain`.** Entities + pure services (`money`/`dates`/`installments` typed) +
   use-cases that depend only on ports.
5. **`adapters/http`.** Controllers + Zod schemas + presenters + error-mapper; routes
   become thin wiring.
6. **Finalize.** Port tests to TS, flip `allowJs: false`, add the CI typecheck step, run
   the packaged smoke test.

## 7. Out of Scope (untouched)

`public/js` (frontend) and its render tests' import targets, `migrations/*.sql`, the
Tailwind/CSS pipeline, `Dockerfile` / `docker-compose.yml`, and the release-workflow logic
(only a typecheck step is added).

## 8. Acceptance Criteria

- All existing tests pass, ported to TS, run via `node --import tsx --test`.
- `tsc --noEmit` passes under `strict: true` with no `allowJs`.
- Every endpoint's path, request contract, response shape, status codes, `X-Total-Count`
  header, and `{ error }` envelope are unchanged (verified by the existing suite).
- `npm run build:binaries` produces working binaries; the packaged smoke test passes.
- No raw SQL outside `infra/repositories`; no `better-sqlite3`/Express import inside
  `domain` or `application`.
