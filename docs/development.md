# Development

```bash
npm install
npm test
```

- **Runner:** Node’s built-in **`node:test`** (`npm test`).
- **VS Code:** launch config **Run crypto_detective.mjs** in `.vscode/launch.json`.

## Layout (code)

| Path | Role |
|------|------|
| `lib/coingecko_tick.mjs` | CoinGecko fetch shared by CLI and web server |
| `lib/jsonl_history.mjs`, `json_path.mjs` | History & JSON path helpers |
| `lib/load_dotenv.mjs`, `slack_incoming.mjs` | Env loading, Slack webhook helper |
| `public/` | Web UI static assets |
| `tests/` | Unit / integration-style tests |

Pull requests: see [Contributing](CONTRIBUTING.md).

← [Documentation index](README.md)
