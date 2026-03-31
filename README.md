# API Detective

[![Node.js >= 18](https://img.shields.io/badge/node-%3E%3D18-3c873a?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

Live crypto prices via the [CoinGecko API](https://www.coingecko.com/en/api): **terminal dashboard**, **local web UI**, **JSON / NDJSON** logging, alerts, webhooks, Slack, Docker, plus a **generic JSON HTTP probe**.

## Quick start

```bash
git clone https://github.com/<you>/api-detective.git
cd api-detective
npm install
npm start
```

| Command | What it runs |
|---------|----------------|
| `npm start` | Crypto terminal dashboard |
| `npm run ui` | Web UI → http://127.0.0.1:3847/ |
| `npm run probe` | Generic JSON poller (`--help` for flags) |
| `npm test` | Test suite |

Copy **`.env.example`** → **`.env`** if you use env-based config (do not commit `.env`).

---

## Documentation

**Everything detailed lives in [`docs/`](docs/README.md)** — CLI, web UI, probe, env vars, Docker, development, contributing, security.

| Quick link | Topic |
|------------|--------|
| [docs/README.md](docs/README.md) | Full doc index & repo tree |
| [docs/cli.md](docs/cli.md) | `crypto_detective` flags |
| [docs/web-ui.md](docs/web-ui.md) | Dashboard server & rate limits |
| [docs/configuration.md](docs/configuration.md) | Environment variables |

---

## License

[ISC](LICENSE)
