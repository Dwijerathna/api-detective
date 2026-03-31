# Generic JSON probe

Entry: **`probe_detective.mjs`**

Polls any HTTP(S) URL that returns JSON and reads a value by **dot path** (e.g. `bitcoin.usd`, `data.0.id`).

```bash
npm run probe -- --help
node probe_detective.mjs --url=https://api.coingecko.com/api/v3/ping --path=gecko_says --once --json
```

## Highlights

- **`--history-persist=path.jsonl`** — fast JSONL history (recommended over a giant single JSON file for rolling windows)
- Env prefix **`PROBE_*`** — see **`node probe_detective.mjs --help`** for the full list
- **`--strict`** — exit **1** if `--path` is set but the resolved JSON value is **undefined**

← [Documentation index](README.md)
