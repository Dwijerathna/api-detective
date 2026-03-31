# Documentation

All project docs live under **`docs/`** so the repository root stays minimal.

| Doc | What it covers |
|-----|----------------|
| [**CLI**](cli.md) | `crypto_detective.mjs` — flags, examples |
| [**Web UI**](web-ui.md) | `server.mjs`, SSE, ports, rate limits |
| [**Probe**](probe.md) | `probe_detective.mjs` — JSON polling |
| [**Configuration**](configuration.md) | Environment variables, `.env`, webhooks |
| [**Data & limits**](data-and-limits.md) | Log shape, retries, 429, persistence |
| [**Docker**](docker.md) | Build, run, UI in containers |
| [**Development**](development.md) | Tests, layout, VS Code |
| [**Contributing**](CONTRIBUTING.md) | PRs, maintainers |
| [**Security**](SECURITY.md) | Reporting vulnerabilities |

---

## Repository structure

```text
api-detective/
├── docs/                 ← you are here
├── lib/                  Shared modules (CoinGecko, JSONL, dotenv, Slack)
├── public/               Web UI static files
├── tests/
├── .github/              CI, issue & PR templates
├── crypto_detective.mjs
├── probe_detective.mjs
├── server.mjs
├── package.json
├── Dockerfile
├── .env.example
├── README.md             Project landing (short)
└── LICENSE
```

Return to the [project README](../README.md).
