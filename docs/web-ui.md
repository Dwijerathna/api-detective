# Web dashboard

Entry: **`server.mjs`** · Start with **`npm run ui`**

```bash
npm run ui
```

## Defaults

- URL: **http://127.0.0.1:3847/**
- Live updates via **SSE** at `/api/stream`
- One-shot JSON: **GET** `/api/snapshot`

## Configuration

Coins, `vs`, optional global/markets, and CoinGecko Pro key use the same env names as the CLI — see [Configuration](configuration.md) (`CRYPTO_DETECTIVE_*`).

### Server-only env

| Variable | Purpose |
|----------|---------|
| `CRYPTO_DETECTIVE_UI_PORT` | Listen port (default `3847`) |
| `CRYPTO_DETECTIVE_UI_HOST` | Bind address (default `127.0.0.1`) |
| `CRYPTO_DETECTIVE_UI_POLL_SEC` | Seconds between CoinGecko polls (default `60`, min `5` on CLI) |

### Server CLI flags

```bash
node server.mjs --port=8080 --host=127.0.0.1 --poll=60
```

Use **`--host=0.0.0.0`** when running in Docker or on a LAN.

## Rate limits

Each **browser tab** opens its own stream and runs its **own** upstream poll loop. Several tabs multiply calls to CoinGecko and can trigger **429** quickly on the free tier. Prefer **one tab** or a **longer `--poll`**. See [Data & limits](data-and-limits.md).

← [Documentation index](README.md)
