# Configuration

## `.env`

Optional **`.env`** in the **project root** is loaded on startup. Values already set in `process.env` are **not** overwritten.

Copy **`.env.example`** → **`.env`** and edit. **Never commit** `.env`.

## Crypto CLI & web UI (`CRYPTO_DETECTIVE_*`)

CLI flags override these when both are set.

| Prefix / examples | Role |
|-------------------|------|
| `CRYPTO_DETECTIVE_COINS` | Comma-separated CoinGecko ids |
| `CRYPTO_DETECTIVE_INTERVAL_SEC` | Poll interval (seconds) |
| `CRYPTO_DETECTIVE_ALERT_PCT` | Tick-to-tick alert threshold (%) |
| `CRYPTO_DETECTIVE_ALERT_24H_PCT` | 24h change alert threshold |
| `CRYPTO_DETECTIVE_ALERT_COOLDOWN_MIN` | Minutes between alerts per coin |
| `CRYPTO_DETECTIVE_HISTORY` | In-memory history length |
| `CRYPTO_DETECTIVE_LOG` | Log file path |
| `CRYPTO_DETECTIVE_ONCE`, `_JSON`, `_PRETTY`, `_DRY_RUN` | Truthy `1` / `true` / `yes` |
| `CRYPTO_DETECTIVE_MAX_RUNTIME_SEC`, `_JITTER_SEC` | Loop lifetime & jitter |
| `CRYPTO_DETECTIVE_NO_BEEP`, `_NO_LOG`, `_PLAIN` | Behavior toggles |
| `CRYPTO_DETECTIVE_VS` | Comma-separated fiat codes |
| `CRYPTO_DETECTIVE_WITH_GLOBAL`, `_WITH_MARKETS`, `_NOTIFY` | Extra requests / desktop notify |
| `CRYPTO_DETECTIVE_HISTORY_PERSIST` | Path to JSON / JSONL history file |

Full names and examples: **`.env.example`** in the repo root.

## CoinGecko Pro

| Variable | Role |
|----------|------|
| `COINGECKO_API_KEY` | Sent as `x-cg-pro-api-key` |
| `CRYPTO_DETECTIVE_COINGECKO_API_KEY` | Same (alternate name) |

## Webhooks & Slack

| Variable | Role |
|----------|------|
| `CRYPTO_DETECTIVE_ALERT_WEBHOOK` or `ALERT_WEBHOOK_URL` | `POST` JSON body when an alert fires |
| `CRYPTO_DETECTIVE_SLACK_WEBHOOK` | Slack Incoming Webhook URL (short text on alerts) |

## Probe (`PROBE_*`)

See **`probe_detective.mjs --help`** and **`.env.example`**.

← [Documentation index](README.md)
