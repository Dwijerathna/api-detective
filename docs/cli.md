# CLI — Crypto dashboard

Entry: **`crypto_detective.mjs`**

```bash
node crypto_detective.mjs --help
node crypto_detective.mjs --once --json
```

## Common flags

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

The authoritative list is always **`node crypto_detective.mjs --help`**.

← [Documentation index](README.md)
