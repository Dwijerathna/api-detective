# API Detective

[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-3c873a?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

Live crypto prices from the [CoinGecko API](https://www.coingecko.com/en/api): **terminal dashboard**, optional **web UI**, **JSON / NDJSON** logging, alerts (tick move, optional 24h), webhooks, Slack, Docker, and a separate **generic JSON HTTP probe**.

---

## Contents

- [Features](#features)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [CLI (`crypto_detective`)](#cli-crypto_detective)
- [Web dashboard](#web-dashboard)
- [Generic probe (`probe_detective`)](#generic-probe-probe_detective)
- [Environment variables](#environment-variables)
- [Data & persistence](#data--persistence)
- [Develop & test](#develop--test)
- [Docker](#docker)
- [Security](#security)
- [Contributing](#contributing)

---

## Features

| Area | What you get |
|------|----------------|
| **CLI** | Multi-coin prices, sparklines, `%` move alerts, 429 backoff, `--json` / `--once`, history persist (JSONL) |
| **Web UI** | Local dashboard (`npm run ui`), SSE updates, same env as CLI for coins / API key |
| **Probe** | Poll any JSON URL, dot-path extraction, alerts, JSONL history, Slack optional |
| **Integrations** | Custom webhook, Slack Incoming Webhook, desktop notify (`node-notifier`) |

---

## Repository layout

```text
api-detective/
├── .github/
│   ├── ISSUE_TEMPLATE/      # Bug / feature forms (GitHub)
│   └── workflows/ci.yml       # Node 20 & 22 — npm test
├── lib/                       # Shared modules (CoinGecko tick, JSONL, dotenv, Slack)
├── public/                    # Static assets for the web UI
├── tests/                     # node:test suite
├── crypto_detective.mjs       # CoinGecko CLI entry
├── probe_detective.mjs        # Generic JSON poller entry
├── server.mjs                 # Web UI + /api/stream (SSE)
├── package.json
├── Dockerfile
├── .env.example               # Documented env vars (no secrets)
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

---

## Quick start

```bash
git clone https://github.com/<you>/api-detective.git
cd api-detective
npm install
npm start
```

Copy `.env.example` → `.env` if you use env-based config (never commit `.env`).

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Run `crypto_detective.mjs` (terminal dashboard) |
| `npm run ui` | Run `server.mjs` → [http://127.0.0.1:3847/](http://127.0.0.1:3847/) |
| `npm run probe` | Run `probe_detective.mjs` (pass `--help` after) |
| `npm test` | Run all tests |

---

## CLI (`crypto_detective`)

```bash
node crypto_detective.mjs --help
node crypto_detective.mjs --once --json
```

### Common flags

| Flag | Purpose |
|------|---------|
| `--coins=id1,id2` | CoinGecko ids |
| `--vs=usd,eur` | Fiat codes (first = primary for alerts / sparkline) |
| `--interval=SECS` | Poll interval |
| `--alertPct=N` | Default tick-to-tick move alert threshold (%) |
| `--alertPct-bitcoin=N` | Per-coin threshold (overrides same id in `--alerts-json`) |
| `--alert24hPct=N` | \|24h change\| alert (separate cooldown) |
| `--alerts-json=FILE` | Per-coin tick thresholds JSON |
| `--with-global` | Add `/global` to each record (extra request) |
| `--with-markets` | Add `/coins/markets` (rank, name, image) per coin (extra request) |
| `--history-persist=FILE` | Rolling `{ at, coins }` — prefer `.jsonl` |
| `--notify` | Desktop toast on alerts (`node-notifier`) |
| `--once` | Single fetch then exit |
| `--json` | One NDJSON line per tick on stdout |
| `--pretty` | With `--json`: indented JSON (not one-line NDJSON) |
| `--dry-run` | Print resolved config (redacted) and exit; no network |
| `--max-runtime=SECS` | Stop after `SECS` when looping |
| `--jitter-sec=N` | Random 0..N seconds added to each poll delay |
| `--no-log` | Skip log file |
| `--plain` / `NO_COLOR=1` | No colors / no clear-screen |
| `--no-beep` | No terminal bell on alerts |
| `--version` / `-v` | Print package version |

Full list: `node crypto_detective.mjs --help`.

---

## Web dashboard

```bash
npm run ui
```

- Default URL: **http://127.0.0.1:3847/**
- Coins / `vs` / optional `WITH_GLOBAL` / `WITH_MARKETS` / Pro API key: same env names as the CLI (`CRYPTO_DETECTIVE_*`).
- Server flags: `node server.mjs --port=8080 --host=127.0.0.1 --poll=60` (poll seconds, minimum **5**). Env: `CRYPTO_DETECTIVE_UI_PORT`, `CRYPTO_DETECTIVE_UI_HOST`, `CRYPTO_DETECTIVE_UI_POLL_SEC`.

**Rate limits:** each browser tab runs its own upstream poll. Prefer one tab or a longer `--poll` if CoinGecko returns 429.

---

## Generic probe (`probe_detective`)

Polls any HTTP(S) URL that returns JSON; reads a value by **dot path** (e.g. `bitcoin.usd`, `data.0.id`).

```bash
npm run probe -- --help
node probe_detective.mjs --url=https://api.coingecko.com/api/v3/ping --path=gecko_says --once --json
```

Use **`--history-persist=path.jsonl`** for fast JSONL history. Env: `PROBE_*` (see `probe_detective.mjs --help`). **`--strict`** exits **1** if `--path` is set but the value is missing.

---

## Environment variables

**Crypto CLI / UI:** `CRYPTO_DETECTIVE_COINS`, `_INTERVAL_SEC`, `_ALERT_PCT`, `_ALERT_24H_PCT`, `_ALERT_COOLDOWN_MIN`, `_HISTORY`, `_LOG`, `_ONCE`, `_JSON`, `_PRETTY`, `_DRY_RUN`, `_MAX_RUNTIME_SEC`, `_JITTER_SEC`, `_NO_BEEP`, `_NO_LOG`, `_PLAIN`, `_VS`, `_WITH_GLOBAL`, `_WITH_MARKETS`, `_NOTIFY`, `_HISTORY_PERSIST`. See **`.env.example`**.

**CoinGecko Pro:** `COINGECKO_API_KEY` or `CRYPTO_DETECTIVE_COINGECKO_API_KEY` (header `x-cg-pro-api-key`).

**Webhooks:** `CRYPTO_DETECTIVE_ALERT_WEBHOOK` or `ALERT_WEBHOOK_URL` — `POST` JSON on alerts. **Slack:** `CRYPTO_DETECTIVE_SLACK_WEBHOOK`.

Optional **`.env`** in the project root is loaded on startup (existing `process.env` values are not overwritten).

---

## Data & persistence

- **Log / NDJSON shape:** `at`, `prices`, `coins`, `alerts`, and when enabled: `global`, `markets`.
- **Retries:** HTTP **408**, **425**, **5xx**, and transient network errors are retried. **429** uses backoff (no blind spam).
- **History:** `--history-persist` uses a **JSON** or **JSONL** file (not SQLite); JSONL is recommended for rolling windows.

---

## Develop & test

```bash
npm test
```

VS Code: **Run crypto_detective.mjs** (`.vscode/launch.json`). See **[CONTRIBUTING.md](CONTRIBUTING.md)** for PR expectations.

---

## Docker

```bash
docker build -t api-detective .
docker run --rm -e COINGECKO_API_KEY=... api-detective
```

Web UI in a container (listen on all interfaces):

```bash
docker run --rm -p 3847:3847 -e COINGECKO_API_KEY=... api-detective node server.mjs --host=0.0.0.0 --port=3847
```

Override `CMD` for probe mode, e.g. `docker run ... api-detective node probe_detective.mjs --help`.

---

## Security

- Do not commit **`.env`**, API keys, or webhook URLs; use **`.env.example`** for names only.
- Report sensitive issues privately — see **[SECURITY.md](SECURITY.md)**.

---

## Contributing

Issues and PRs welcome. Use the templates under **`.github/`**. Guidelines: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## License

[ISC](LICENSE)
