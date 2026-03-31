# Docker

```bash
docker build -t api-detective .
docker run --rm -e COINGECKO_API_KEY=... api-detective
```

Default image command runs the **crypto CLI**. Override for other entrypoints.

## Web UI in a container

```bash
docker run --rm -p 3847:3847 -e COINGECKO_API_KEY=... api-detective node server.mjs --host=0.0.0.0 --port=3847
```

## Probe

```bash
docker run --rm api-detective node probe_detective.mjs --help
```

← [Documentation index](README.md)
