# api-detective

CoinGecko-powered terminal dashboard: live prices, sparklines, tick-to-tick and optional 24h alerts, JSON logging, NDJSON mode, HTTP 429 backoff, optional market metadata, history persistence, and desktop notifications.

## Requirements

- **Node.js 18+** (see `engines` in `package.json`; global `fetch`)
- **`npm install`** — pulls in `node-notifier` for `--notify` (optional feature; other flags work without it if you avoid `--notify`)

Optional **`.env`** in the project directory is loaded on startup (values already in the process environment are not overwritten).

## Quick start

```bash
npm install
npm start
```

### Web dashboard

```bash
npm run ui
```

Opens a local server (default [http://127.0.0.1:3847/](http://127.0.0.1:3847/)) with a live CoinGecko dashboard. Coin list and `vs` currencies use the same env vars as the CLI (`CRYPTO_DETECTIVE_COINS`, `CRYPTO_DETECTIVE_VS`, optional `_WITH_GLOBAL`, `_WITH_MARKETS`, Pro API key). Flags: `node server.mjs --port=8080 --host=127.0.0.1 --poll=60` (poll interval seconds, minimum 5). Env: `CRYPTO_DETECTIVE_UI_PORT`, `CRYPTO_DETECTIVE_UI_HOST`, `CRYPTO_DETECTIVE_UI_POLL_SEC`.

Each browser tab runs its own upstream poll loop; use one tab or a longer `--poll` if you hit CoinGecko rate limits.

```bash
node crypto_detective.mjs --help
node crypto_detective.mjs --once --json
```

## CLI highlights

| Flag | Purpose |
|------|---------|
| `--version` / `-v` | Print version |
| `--coins=id1,id2` | CoinGecko ids |
| `--vs=usd,eur` | Fiat codes (first = primary for alerts / sparkline) |
| `--interval=SECS` | Poll interval |
| `--alertPct=N` | Default tick-to-tick move alert threshold (%) |
| `--alertPct-bitcoin=N` | Per-coin tick threshold (overrides same id in `--alerts-json`) |
| `--alert24hPct=N` | \|24h change\| alert (separate cooldown) |
| `--alerts-json=FILE` | Per-coin tick thresholds JSON |
| `--with-global` | Add `/global` to each record (extra request) |
| `--with-markets` | Add `/coins/markets` (rank, name, image) per coin (extra request) |
| `--history-persist=FILE` | Save/load rolling `{ at, coins }[]` so sparklines survive restarts |
| `--notify` | Desktop toast on alerts (`node-notifier`) |
| `--once` | Single fetch then exit |
| `--json` | One NDJSON line per tick on stdout |
| `--pretty` | With `--json`: pretty-printed JSON (multi-line; not pipe-friendly as NDJSON) |
| `--dry-run` | Print resolved config (redacted) and exit; no network |
| `--max-runtime=SECS` | Stop after `SECS` when looping |
| `--jitter-sec=N` | Add random 0..N seconds to each poll delay |
| `--no-log` | Skip log file |
| `--plain` | No colors / no clear-screen |
| `NO_COLOR=1` | Same styling effect as `--plain` |
| `--no-beep` | No terminal bell on alerts |

## Environment variables

CLI overrides env. Supported: `CRYPTO_DETECTIVE_COINS`, `_INTERVAL_SEC`, `_ALERT_PCT`, `_ALERT_24H_PCT`, `_ALERT_COOLDOWN_MIN`, `_HISTORY`, `_LOG`, `_ONCE`, `_JSON`, `_PRETTY`, `_DRY_RUN`, `_MAX_RUNTIME_SEC`, `_JITTER_SEC`, `_NO_BEEP`, `_NO_LOG`, `_PLAIN`, `_VS`, `_WITH_GLOBAL`, `_WITH_MARKETS`, `_NOTIFY`, `_HISTORY_PERSIST` (path).

**CoinGecko Pro:** set `COINGECKO_API_KEY` or `CRYPTO_DETECTIVE_COINGECKO_API_KEY` (sent as `x-cg-pro-api-key`).

## Webhook

`CRYPTO_DETECTIVE_ALERT_WEBHOOK` or `ALERT_WEBHOOK_URL` — `POST` JSON when any alert fires.

**Slack:** `CRYPTO_DETECTIVE_SLACK_WEBHOOK` (Incoming Webhook URL) sends a short text message on alerts.

## Log / NDJSON shape

`at`, `prices`, `coins`, `alerts`, and when enabled: `global`, `markets`.

## Retries

HTTP **408**, **425**, **5xx**, and network errors are retried (a few attempts). **429** triggers backoff instead of blind retries.

## Persistence

`--history-persist` uses a **JSON file** (not SQLite) for portability—only `at` and `coins` are stored to keep files small.

## Develop

```bash
npm test
```

VS Code: **Run crypto_detective.mjs** (`.vscode/launch.json`).

## Docker

```bash
docker build -t api-detective .
docker run --rm -e COINGECKO_API_KEY=... api-detective
```

Override the command if you need probe mode, e.g. `docker run ... api-detective node probe_detective.mjs --help`.

## Generic HTTP JSON probe

`probe_detective.mjs` polls any URL that returns JSON and reads a value by **dot path** (e.g. `bitcoin.usd` or `data.0.id`).

```bash
npm run probe -- --help
node probe_detective.mjs --url=https://api.coingecko.com/api/v3/ping --path=gecko_says --once --json
```

Use **`--history-persist=path.jsonl`** so history is stored as **JSONL** (one object per line). That avoids SQLite: tiny files, no DB engine, very fast for a capped rolling window (rewrite cost scales with history length, usually well under a millisecond for dozens of rows).

`crypto_detective.mjs` supports the same: **`--history-persist=foo.jsonl`** uses JSONL; **`foo.json`** stays the old single JSON-array format.

Probe env: `PROBE_URL`, `PROBE_JSON_PATH`, `PROBE_INTERVAL_SEC`, `PROBE_PRETTY`, `PROBE_DRY_RUN`, `PROBE_MAX_RUNTIME_SEC`, `PROBE_JITTER_SEC`, `PROBE_STRICT`, `PROBE_SLACK_WEBHOOK`, `PROBE_HISTORY_PERSIST`, etc. See `probe_detective.mjs --help`.

`--strict` makes the process **exit 1** when `--path` is set but the resolved JSON value is **undefined** (path missing). Without `--strict`, that tick is treated as a failed read and the loop continues.

## Security

- Do not commit **`.env`** or API keys; use **`.env.example`** as a template.
- Webhook URLs are secrets; prefer environment variables in CI and production.

## API

Uses the [CoinGecko API](https://www.coingecko.com/en/api). Respect rate limits.
