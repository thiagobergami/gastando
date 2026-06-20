# Gastando

A personal expense tracker with support for installment purchases, category budgets, and a monthly dashboard. Built with Node.js and SQLite.

## Download and run (no install needed)

Download the file for your operating system from the [Releases page](../../releases), then run it. No Node.js, Docker, or anything else required.

- **Windows** — `gastando-win-x64.exe`. Double-click it. Windows SmartScreen may warn about an unknown publisher: click **More info → Run anyway**. A console window opens and stays open while the app runs — closing it stops the app.
- **macOS** — `gastando-macos-arm64` (Apple Silicon) or `gastando-macos-x64` (Intel). The first run is blocked by Gatekeeper: right-click the file → **Open**, or run `xattr -d com.apple.quarantine ./gastando-macos-arm64` then `./gastando-macos-arm64` in a terminal.
- **Linux** — `gastando-linux-x64`. Run `chmod +x ./gastando-linux-x64 && ./gastando-linux-x64`.

Your browser opens automatically at http://localhost:3000. Your data is stored in a `data/` folder created next to the executable — keep them together if you move the app, and back up `data/gastando.db` to save your records.

## Run with Docker

```bash
docker compose up --build
```

Open http://localhost:3000 in your browser.

## Data

Expenses are stored in `./data/gastando.db`. To back up your data, copy that file:

```bash
cp ./data/gastando.db ./data/gastando.db.bak
```

## Development

**Run tests:**

```bash
npm test
```

**Check coverage (must be ≥80% across all metrics):**

```bash
npm run coverage
```
