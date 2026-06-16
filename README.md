# Gastando

A personal expense tracker with support for installment purchases, category budgets, and a monthly dashboard. Built with Node.js and SQLite.

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
