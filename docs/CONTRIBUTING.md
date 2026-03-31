# Contributing

1. **Node.js 18+** (22 recommended). Run `npm install` and `npm test` before opening a PR.
2. Prefer small, focused changes; match existing style in `crypto_detective.mjs` and `probe_detective.mjs`.
3. New CLI flags should appear in `--help`, `.env.example` when relevant, and the relevant **[docs/](README.md)** page (and the root [README](../README.md) if it’s a headline feature).

## GitHub repo (maintainers)

Under **Settings → General → About**, add a short description and **Topics**, for example:

`nodejs` · `coingecko` · `cryptocurrency` · `cli` · `dashboard` · `docker`

## Security

- **Never commit** `.env`, API keys, or webhook URLs. Use `.env.example` for names only.
- Report sensitive issues privately — [Security policy](SECURITY.md).

← [Documentation index](README.md)
