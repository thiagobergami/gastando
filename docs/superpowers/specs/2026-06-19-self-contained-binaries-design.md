# Self-Contained Binaries for Gastando — Design

**Date:** 2026-06-19
**Status:** Approved (pending spec review)

## Goal

Let anyone run Gastando on a fresh computer **with nothing installed** — no
Node.js, no Docker, no Kubernetes, no build toolchain. The user downloads a
single executable for their OS, runs it, and the app opens in their browser.

## Background

Gastando is a Node.js + SQLite (`better-sqlite3`) + Express expense tracker.
Today it is run via Docker Compose (`docker compose up --build`), and it
auto-runs its SQL migrations on startup. The barrier for a bare machine is the
Docker (or Node + native build) prerequisite. The crux is that
`better-sqlite3` is a **native C++ addon**, so "just run it anywhere" requires
shipping a precompiled artifact rather than expecting the host to compile.

## Approach

Package the existing app into **one executable per OS** using
**`@yao-pkg/pkg`** (the maintained fork of `vercel/pkg`). pkg embeds the app
code plus declared assets into the binary's read-only virtual filesystem and
extracts the `better-sqlite3` native `.node` to a temp dir at runtime.

Binaries are built by a **GitHub Actions matrix** — each OS builds on its own
native runner so the correct `better-sqlite3` prebuilt binary is embedded — and
attached to a **GitHub Release** when a `v*` tag is pushed. End users download
the file for their OS from the Releases page.

### Why pkg over Node SEA

Node's official Single Executable Application feature cannot cross-compile
(each OS binary must be built on that OS) and does not gracefully bundle native
`.node` addons or multiple asset files. `@yao-pkg/pkg` handles native addons and
asset bundling directly, which is exactly this project's hard part.

## Targets

- `node20-win-x64` → `gastando-win-x64.exe`
- `node20-linux-x64` → `gastando-linux-x64`
- `node20-macos-x64` → `gastando-macos-x64`
- `node20-macos-arm64` → `gastando-macos-arm64`

Each `macos-latest` runner is Apple Silicon; the x64 mac binary is produced on
the same runner via pkg's target list (acceptable for v1 — validated by the
smoke test on at least the arm64 artifact).

## Code Changes (isolated, minimal)

### `src/server.js` — runtime data path

When running as a packaged binary (`process.pkg` is truthy), the default DB
path becomes `<dir of the executable>/data/gastando.db`, and that `data`
directory is created if missing. The embedded snapshot is **read-only**, so the
database must live on the real filesystem next to the binary (per the chosen
"next to the binary" data location). When not packaged, behavior is unchanged
(`./data/gastando.db` relative to the project). `DB_PATH` and `PORT` env
overrides remain honored in both modes.

Path resolution:
- Packaged: base dir = `path.dirname(process.execPath)`
- Not packaged: base dir = project root (current behavior)
- DB default = `<base>/data/gastando.db` unless `DB_PATH` is set.

### Browser auto-open

After the server begins listening, open the default browser to
`http://localhost:<port>` using the OS-appropriate command (`start` on Windows,
`open` on macOS, `xdg-open` on Linux) via `child_process`. No new npm
dependency. Suppressible with an env var (e.g. `NO_OPEN=1`) so tests and
headless runs don't spawn a browser.

### Generated CSS

`public/css/app.css` is gitignored and produced by `build:css`. The packaging
step must run `build:css` first so the compiled CSS is present to embed.

## Build / CI Pieces

### `package.json`

- Add `@yao-pkg/pkg` to `devDependencies`.
- Add a `pkg` config block:
  - `bin` / entry: `src/server.js`
  - `assets`: `public/**/*`, `migrations/**/*`
  - `targets`: the four listed above
  - `outputPath`: `dist/`
- Add scripts:
  - `build:binaries`: `npm run build:css && pkg .`
  - (smoke-test helper script as needed — see Testing)

### `.github/workflows/release.yml`

- Trigger: push of tags matching `v*`.
- Matrix: `windows-latest`, `macos-latest`, `ubuntu-latest`.
- Steps per runner: checkout → setup Node 20 → `npm ci` → `npm run build:css`
  → build that platform's binary with pkg → run smoke test on the built binary
  → upload the artifact to the GitHub Release.

## Testing

- **Existing unit/integration tests** run unchanged on Node (`npm test`), not
  against the binary.
- **New smoke test** (the critical addition, since packaging the native addon
  is the risky part): after building, launch the produced binary with
  `NO_OPEN=1`, poll `http://localhost:3000` until it returns HTTP 200 (with a
  timeout), assert the `data/gastando.db` file was created next to the binary,
  then shut the process down cleanly. Runs in CI on each OS runner.

## Known Limitations (documented, not solved in v1)

- **Unsigned binaries** trigger Windows SmartScreen and macOS Gatekeeper
  warnings. README documents the "More info → Run anyway" / right-click → Open
  (or `xattr -d com.apple.quarantine <file>`) workaround. Code-signing certs are
  out of scope.
- On Windows, double-clicking opens a **console window** that must remain open
  while the app runs (it is the server process). Acceptable for v1; closing the
  window stops the app.
- Data lives **next to the binary** in `./data`; moving the binary without its
  `data` folder leaves the database behind. Documented in the README backup
  section.

## README Updates

Add a "Download and run" section: per-OS download instructions, the
unsigned-binary workaround, how to stop the app, and where the data file lives
(next to the binary). Keep the existing Docker and development sections.

## Out of Scope

- Code signing / notarization.
- Auto-update of installed binaries.
- A background service / system-tray launcher (console window is fine for v1).
- Installing runtimes on the host (the binary needs none).
