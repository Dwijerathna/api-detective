# Contributing

1. **Node.js 18+** (22 recommended). Run `npm install` and `npm test` before pushing.
2. Prefer small, focused changes; match existing style in `crypto_detective.mjs` and `probe_detective.mjs`.
3. New CLI flags should appear in `--help`, `.env.example` when relevant, and `README.md` briefly.

## Security

- **Never commit** `.env`, API keys, or webhook URLs. Use `.env.example` for names only.
- If you find a security issue, report it privately to the maintainer rather than a public issue when sensitive.
