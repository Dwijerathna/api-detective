# Contributing

1. **Node.js 18+** (22 recommended). Run `npm install` and `npm test` before opening a PR.
2. Prefer small, focused changes; match existing style in `crypto_detective.mjs` and `probe_detective.mjs`.
3. New CLI flags should appear in `--help`, `.env.example` when relevant, and `README.md` briefly.

## Repository presentation (maintainers)

On GitHub **Settings → General**, set **About** description, **Website** (if any), and **Topics**, for example:

`nodejs` · `coingecko` · `cryptocurrency` · `cli` · `dashboard` · `docker`

## Security

- **Never commit** `.env`, API keys, or webhook URLs. Use `.env.example` for names only.
- See **[SECURITY.md](SECURITY.md)** for reporting vulnerabilities.
