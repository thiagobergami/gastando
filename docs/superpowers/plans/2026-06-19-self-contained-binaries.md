# Self-Contained Binaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Gastando as a single downloadable executable per OS that runs on a machine with nothing installed.

**Architecture:** Package the existing Node + Express + better-sqlite3 app with `@yao-pkg/pkg`, embedding `public/` and `migrations/` assets into the binary and extracting the native addon at runtime. The SQLite DB is created next to the executable. A GitHub Actions matrix builds each OS binary on its own runner and attaches them to a GitHub Release on `v*` tags.

**Tech Stack:** Node.js 20, Express 5, better-sqlite3 (native addon), @yao-pkg/pkg, GitHub Actions.

## Global Constraints

- Node target runtime: **node20** (matches `Dockerfile` `node:20`).
- No new **runtime** npm dependencies; `@yao-pkg/pkg` is a **devDependency** only.
- Data file location when packaged: `<dir of executable>/data/gastando.db`; when not packaged: `<project root>/data/gastando.db`. `DB_PATH` env always overrides.
- `PORT` env overrides default `3000` in all modes.
- Browser auto-open must be suppressible via `NO_OPEN` env var (any truthy value).
- pkg targets, verbatim: `node20-win-x64`, `node20-linux-x64`, `node20-macos-x64`, `node20-macos-arm64`.
- Existing tests must keep passing: `npm test` (node --test) and coverage ≥80% (`npm run coverage`).

---

### Task 1: DB path resolver

**Files:**
- Create: `src/paths.js`
- Test: `test/paths.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolveDbPath(opts?) -> string`. `opts` is an object with optional keys `{ env, isPackaged, execPath, projectRoot }`, all injectable for testing. Defaults read from `process.env`, `Boolean(process.pkg)`, `process.execPath`, and `path.join(__dirname, '..')` respectively.

- [ ] **Step 1: Write the failing test**

```js
// test/paths.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { resolveDbPath } = require('../src/paths');

test('DB_PATH env overrides everything', () => {
  const result = resolveDbPath({ env: { DB_PATH: '/custom/my.db' }, isPackaged: true, execPath: '/bin/app' });
  assert.strictEqual(result, '/custom/my.db');
});

test('packaged: db sits next to the executable', () => {
  const result = resolveDbPath({ env: {}, isPackaged: true, execPath: path.join('/opt', 'gastando', 'gastando') });
  assert.strictEqual(result, path.join('/opt', 'gastando', 'data', 'gastando.db'));
});

test('not packaged: db sits under the project root', () => {
  const result = resolveDbPath({ env: {}, isPackaged: false, projectRoot: '/proj' });
  assert.strictEqual(result, path.join('/proj', 'data', 'gastando.db'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/paths.test.js`
Expected: FAIL — `Cannot find module '../src/paths'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/paths.js
const path = require('path');

function resolveDbPath(opts = {}) {
  const env = opts.env || process.env;
  if (env.DB_PATH) return env.DB_PATH;
  const isPackaged = opts.isPackaged !== undefined ? opts.isPackaged : Boolean(process.pkg);
  const execPath = opts.execPath || process.execPath;
  const projectRoot = opts.projectRoot || path.join(__dirname, '..');
  const baseDir = isPackaged ? path.dirname(execPath) : projectRoot;
  return path.join(baseDir, 'data', 'gastando.db');
}

module.exports = { resolveDbPath };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/paths.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/paths.js test/paths.test.js
git commit -m "feat: add db path resolver for packaged vs dev runtime"
```

---

### Task 2: Browser-open helper

**Files:**
- Create: `src/openBrowser.js`
- Test: `test/openBrowser.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `browserCommand(platform, url) -> { cmd: string, args: string[] }` — pure selector by `process.platform` value.
  - `openBrowser(url, opts?) -> boolean` — `opts` is `{ platform, env }`, both injectable. Returns `false` (and spawns nothing) when `env.NO_OPEN` is truthy; otherwise spawns detached and returns `true`.

- [ ] **Step 1: Write the failing test**

```js
// test/openBrowser.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { browserCommand, openBrowser } = require('../src/openBrowser');

test('windows uses cmd start', () => {
  assert.deepStrictEqual(browserCommand('win32', 'http://x'), { cmd: 'cmd', args: ['/c', 'start', '', 'http://x'] });
});

test('macOS uses open', () => {
  assert.deepStrictEqual(browserCommand('darwin', 'http://x'), { cmd: 'open', args: ['http://x'] });
});

test('linux uses xdg-open', () => {
  assert.deepStrictEqual(browserCommand('linux', 'http://x'), { cmd: 'xdg-open', args: ['http://x'] });
});

test('NO_OPEN suppresses launch', () => {
  assert.strictEqual(openBrowser('http://x', { platform: 'linux', env: { NO_OPEN: '1' } }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/openBrowser.test.js`
Expected: FAIL — `Cannot find module '../src/openBrowser'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/openBrowser.js
const { spawn } = require('child_process');

function browserCommand(platform, url) {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  return { cmd: 'xdg-open', args: [url] };
}

function openBrowser(url, { platform = process.platform, env = process.env } = {}) {
  if (env.NO_OPEN) return false;
  const { cmd, args } = browserCommand(platform, url);
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

module.exports = { browserCommand, openBrowser };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/openBrowser.test.js`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/openBrowser.js test/openBrowser.test.js
git commit -m "feat: add cross-platform browser-open helper"
```

---

### Task 3: Wire resolver + browser-open into the server; add reusable smoke harness

**Files:**
- Modify: `src/server.js` (entire file, currently 10 lines)
- Create: `test/smoke.js` (standalone harness script, not a `node --test` file)

**Interfaces:**
- Consumes: `resolveDbPath` (Task 1), `openBrowser` (Task 2).
- Produces: `test/smoke.js` — a CLI run as `node test/smoke.js <command> [args...]`. It launches the given command with `PORT=3998 NO_OPEN=1 DB_PATH=<temp>`, polls `http://localhost:3998/` for HTTP 200 (30s timeout), asserts the temp DB file was created, kills the child, prints `SMOKE PASS`/`SMOKE FAIL`, and exits 0 on success / 1 on failure. Reused by Task 4 and Task 5.

- [ ] **Step 1: Update `src/server.js`**

```js
// src/server.js
const fs = require('fs');
const path = require('path');
const { openDatabase, runMigrations } = require('./db');
const { createApp } = require('./app');
const { resolveDbPath } = require('./paths');
const { openBrowser } = require('./openBrowser');

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDatabase(dbPath);
runMigrations(db);

const port = process.env.PORT || 3000;
createApp(db).listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`Gastando listening on :${port}`);
  openBrowser(url);
});
```

- [ ] **Step 2: Create the smoke harness**

```js
// test/smoke.js
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node test/smoke.js <command> [args...]');
  process.exit(2);
}

const PORT = 3998;
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gastando-smoke-'));
const dbPath = path.join(dbDir, 'gastando.db');

const child = spawn(cmd, args, {
  env: { ...process.env, PORT: String(PORT), NO_OPEN: '1', DB_PATH: dbPath },
  stdio: 'inherit',
});

function getStatus(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
}

async function pollReady() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      if (await getStatus(`http://localhost:${PORT}/`) === 200) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  let failed = false;
  if (!await pollReady()) { console.error('SMOKE FAIL: server did not return 200 in time'); failed = true; }
  if (!fs.existsSync(dbPath)) { console.error('SMOKE FAIL: db file was not created'); failed = true; }
  child.kill();
  if (failed) process.exit(1);
  console.log('SMOKE PASS');
  process.exit(0);
})();
```

- [ ] **Step 3: Run the existing suite to confirm no regression**

Run: `npm test`
Expected: PASS — all existing tests plus Task 1 & 2 tests pass.

- [ ] **Step 4: Smoke-test the dev server through the harness**

Run: `node test/smoke.js node src/server.js`
Expected: prints `Gastando listening on :3998`, then `SMOKE PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/smoke.js
git commit -m "feat: resolve data dir, auto-open browser, add smoke harness"
```

---

### Task 4: pkg packaging config and local build

**Files:**
- Modify: `package.json` (add `pkg` config block, `build:binaries` script, `@yao-pkg/pkg` devDependency)
- Modify: `.gitignore` (ignore `dist/`)

**Interfaces:**
- Consumes: `test/smoke.js` (Task 3).
- Produces: `npm run build:binaries` builds all four targets into `dist/gastando-<platform>-<arch>[.exe]`. Output name base is the package `name` (`gastando`).

- [ ] **Step 1: Add the dev dependency**

Run: `npm install --save-dev @yao-pkg/pkg`
Expected: `@yao-pkg/pkg` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the `pkg` config block and build script to `package.json`**

Add this top-level `"pkg"` key (sibling of `"scripts"`):

```json
"pkg": {
  "assets": [
    "public/**/*",
    "migrations/**/*"
  ],
  "targets": [
    "node20-win-x64",
    "node20-linux-x64",
    "node20-macos-x64",
    "node20-macos-arm64"
  ],
  "outputPath": "dist"
}
```

Add to `"scripts"`:

```json
"build:binaries": "npm run build:css && pkg src/server.js"
```

- [ ] **Step 3: Ignore the build output**

Add a line to `.gitignore`:

```
dist/
```

- [ ] **Step 4: Build the binary for the current host**

Run: `npm run build:binaries`
Expected: `dist/` contains four files including the one for the current OS/arch (e.g. on Linux x64, `dist/gastando-linux-x64`). pkg embeds the better-sqlite3 native addon — watch for a warning-free build of the host target.

- [ ] **Step 5: Smoke-test the host binary**

Run (Linux example): `node test/smoke.js ./dist/gastando-linux-x64`
Expected: `SMOKE PASS`, exit code 0. (Use `./dist/gastando-macos-arm64` on Apple Silicon, `dist\gastando-win-x64.exe` on Windows.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "build: package app into per-OS binaries with @yao-pkg/pkg"
```

---

### Task 5: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `npm run build:css`, `pkg`, `test/smoke.js`.
- Produces: on a pushed `v*` tag, a GitHub Release with the four binaries attached. The `node20-macos-x64` artifact is built but not smoke-tested (it cannot execute on the Apple-Silicon `macos-latest` runner).

- [ ] **Step 1: Create the workflow**

```yaml
# .github/workflows/release.yml
name: Release binaries

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            target: node20-win-x64
            artifact: gastando-win-x64.exe
          - os: ubuntu-latest
            target: node20-linux-x64
            artifact: gastando-linux-x64
          - os: macos-latest
            target: node20-macos-arm64
            artifact: gastando-macos-arm64
          - os: macos-latest
            target: node20-macos-x64
            artifact: gastando-macos-x64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build:css
      - run: npx pkg src/server.js --targets ${{ matrix.target }} --output dist/${{ matrix.artifact }}
      - name: Smoke test
        if: matrix.target != 'node20-macos-x64'
        shell: bash
        run: node test/smoke.js dist/${{ matrix.artifact }}
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/${{ matrix.artifact }}
```

- [ ] **Step 2: Lint the YAML locally**

Run: `node -e "require('js-yaml')" 2>/dev/null && npx js-yaml .github/workflows/release.yml >/dev/null && echo OK || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('OK')"`
Expected: prints `OK` (valid YAML). If neither parser is available, visually confirm indentation instead.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: build and release per-OS binaries on version tags"
```

- [ ] **Step 4: Note for the operator (no command)**

Releases are produced by pushing a tag, e.g. `git tag v1.0.0 && git push origin v1.0.0`. Do this only when actually cutting a release — not part of implementing this plan.

---

### Task 6: README download-and-run documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: user-facing docs for the binaries.

- [ ] **Step 1: Add a "Download and run" section near the top of `README.md`** (after the intro paragraph, before "Run with Docker")

````markdown
## Download and run (no install needed)

Download the file for your operating system from the [Releases page](../../releases), then run it. No Node.js, Docker, or anything else required.

- **Windows** — `gastando-win-x64.exe`. Double-click it. Windows SmartScreen may warn about an unknown publisher: click **More info → Run anyway**. A console window opens and stays open while the app runs — closing it stops the app.
- **macOS** — `gastando-macos-arm64` (Apple Silicon) or `gastando-macos-x64` (Intel). The first run is blocked by Gatekeeper: right-click the file → **Open**, or run `xattr -d com.apple.quarantine ./gastando-macos-arm64` then `./gastando-macos-arm64` in a terminal.
- **Linux** — `gastando-linux-x64`. Run `chmod +x ./gastando-linux-x64 && ./gastando-linux-x64`.

Your browser opens automatically at http://localhost:3000. Your data is stored in a `data/` folder created next to the executable — keep them together if you move the app, and back up `data/gastando.db` to save your records.
````

- [ ] **Step 2: Verify the file reads correctly**

Run: `head -40 README.md`
Expected: the new section appears with intact formatting.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document downloading and running the binaries"
```

---

## Self-Review

**Spec coverage:**
- pkg + native addon embedding → Task 4. ✅
- DB next to binary / `DB_PATH` override → Task 1 + Task 3. ✅
- Browser auto-open + `NO_OPEN` → Task 2 + Task 3. ✅
- `build:css` before packaging → Task 4 (`build:binaries`) and Task 5 (CI step). ✅
- Four targets incl. mac arm64 + x64 → Task 4 config + Task 5 matrix. ✅
- GitHub Actions matrix → Release on `v*` → Task 5. ✅
- Smoke test proving boot/serve/native-addon → Task 3 harness, run in Task 4 + Task 5. ✅
- Migrations from snapshot → no code change needed (`__dirname`-relative); covered by declaring `migrations/**` asset in Task 4. ✅
- Unsigned-binary + console-window + data-location docs → Task 6. ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" present; all code shown in full.

**Type consistency:** `resolveDbPath(opts)` and `openBrowser(url, opts)` / `browserCommand(platform, url)` signatures match between their defining tasks (1, 2) and their use in Task 3. Smoke harness contract (PORT 3998, `NO_OPEN`, `DB_PATH`, exit codes) is consistent across Tasks 3–5. Output naming `gastando-<target>` consistent between Task 4 config and Task 5 explicit `--output`.
