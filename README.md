# Gastando

A personal expense tracker for credit-card spending. Record every transaction by
category, card and month; compare actual spend against editable per-category
monthly limits; model installment purchases (*parcelas*); reproduce a full savings
summary (income → fixed costs → savings goal → healthy ceiling → projected
savings); and explore your history through BI views.

It runs entirely on your machine. There is no account, no cloud sync, and no
telemetry — everything lives in a single SQLite file you control. The UI is in
English; example data and currency are pt-BR (R$).

Built with Node.js, Express and SQLite.

---

## Pick how to run it

| You want to… | Use | Needs |
|---|---|---|
| Just use the app | [Download a binary](#1-download-and-run-recommended) | Nothing |
| Run it in a container | [Docker](#2-run-with-docker) | Docker |
| Hack on the code | [From source](#3-run-from-source) | Node.js 20 |

Whichever you choose, open **http://localhost:3000** once it starts. The binary
opens your browser automatically.

---

## 1. Download and run (recommended)

No Node.js, Docker, or any other install required — the binary bundles everything.

1. Go to the [**Releases page**](../../releases) and download the file for your
   operating system from the latest release:

   | OS | File |
   |---|---|
   | Windows | `gastando-win-x64.exe` |
   | macOS (Apple Silicon) | `gastando-macos-arm64` |
   | macOS (Intel) | `gastando-macos-x64` |
   | Linux | `gastando-linux-x64` |

2. Run it:

   - **Windows** — double-click `gastando-win-x64.exe`. SmartScreen may warn
     about an unknown publisher: click **More info → Run anyway**. A console
     window opens and stays open while the app runs — closing it stops the app.

   - **macOS** — the first run is blocked by Gatekeeper. Either right-click the
     file → **Open** → **Open**, or in a terminal run:

     ```bash
     xattr -d com.apple.quarantine ./gastando-macos-arm64
     ./gastando-macos-arm64
     ```

   - **Linux** — make it executable and run it:

     ```bash
     chmod +x ./gastando-linux-x64
     ./gastando-linux-x64
     ```

3. Your browser opens automatically at **http://localhost:3000**.

Your data is stored in a `data/` folder created **next to the executable**. If you
move the app, move that folder with it. To stop the app, close the console window
(Windows) or press `Ctrl+C` in the terminal.

---

## 2. Run with Docker

From the project root:

```bash
docker compose up --build
```

Then open **http://localhost:3000**.

Your data is persisted to `./data/gastando.db` on the host via a bind mount, so it
survives container rebuilds. The container restarts automatically unless stopped.

---

## 3. Run from source

Requires **Node.js 20** (see `.nvmrc`).

```bash
npm install
npm run build:css   # compile Tailwind into public/css/app.css
npm start           # starts the server on http://localhost:3000
```

`npm start` runs `node src/server.js`, applies any pending migrations, opens your
browser, and listens on the port from `PORT` (default `3000`).

---

## Configuration

The app reads two environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port the web server listens on |
| `DB_PATH` | `./data/gastando.db` (next to the binary when packaged) | Location of the SQLite database file |

---

## Your data

Everything you enter is stored in a single SQLite file, **`data/gastando.db`**.
There is no other state.

- **Back up** by copying that file:

  ```bash
  cp ./data/gastando.db ./data/gastando.db.bak
  ```

- **Move or migrate** to another machine by copying the same file into the new
  install's `data/` folder.

The database schema and seed data live in `migrations/` and are applied
automatically on startup.

---

## Development

**Run the test suite:**

```bash
npm test
```

**Check coverage** (must be ≥ 80% across all metrics):

```bash
npm run coverage
```

**Watch and rebuild CSS** while working on the UI:

```bash
npm run watch:css
```

### Building the binaries

Self-contained binaries are produced with
[`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg):

```bash
npm run build:binaries
```

This builds the CSS and emits one executable per target (Windows, Linux, macOS
x64, macOS arm64) into `dist/`. In CI, pushing a `v*` git tag builds each target
on its native runner, smoke-tests it, and attaches the binaries to a GitHub
Release (see `.github/workflows/release.yml`).

### Project layout

```
src/
  server.js     entry point — migrate, listen, open browser
  app.js        Express app and route wiring
  db.js         SQLite connection and migration runner
  paths.js      resolves the database location
  routes/       HTTP route handlers (transactions, cards, limits, BI, …)
  services/     domain logic (installments, dashboard, simulate, money, …)
migrations/     SQL schema and seed data, applied on startup
public/         static frontend (HTML/JS + compiled Tailwind CSS)
docs/           spec.md (source of truth) and plan.md
```

The full specification lives in [`docs/spec.md`](docs/spec.md).
