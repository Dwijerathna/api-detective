# Data, logs & rate limits

## Log / NDJSON shape

Each tick record includes:

- **`at`** — ISO timestamp  
- **`prices`** — flat `coinId → primary fiat price`  
- **`coins`** — full normalized fields per coin  
- **`alerts`** — alert objects when thresholds fire  
- **`global`**, **`markets`** — when `--with-global` / `--with-markets` (or matching env) are enabled  

## HTTP behavior

- **408**, **425**, **5xx**, and transient network errors: **retried** (bounded attempts).  
- **429 (rate limit)**: **backoff** — wait increases (capped), not blind retry spam.

## Persistence

`--history-persist` uses a **JSON** or **JSONL** file (not SQLite). **JSONL** (`.jsonl` / `.ndjson`) is recommended for rolling windows: small rewrites, easy tailing.

## CoinGecko limits

Free/public tiers are **strict per IP**. Extra options (`WITH_GLOBAL`, `WITH_MARKETS`, multiple web UI tabs, short poll intervals) multiply requests. Use a **Pro API key** if you need higher throughput.

← [Documentation index](README.md)
