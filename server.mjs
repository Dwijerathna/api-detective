// server.mjs — local web dashboard for live CoinGecko snapshots (SSE). Does not import crypto_detective CLI (avoids argv side effects).

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchCoingeckoSnapshot } from "./lib/coingecko_tick.mjs";
import { loadDotEnv } from "./lib/load_dotenv.mjs";

loadDotEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BACKOFF_MS = 15 * 60_000;

function envTruthy(value) {
  if (value == null || value === "") return false;
  const s = String(value).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function pricesFromCoins(coins, primaryVs) {
  /** @type {Record<string, number>} */
  const prices = {};
  for (const [id, row] of Object.entries(coins)) {
    const p = row[primaryVs];
    if (typeof p === "number") {
      prices[id] = p;
    }
  }
  return prices;
}

function snapshotOptionsFromEnv() {
  const coinsRaw = process.env.CRYPTO_DETECTIVE_COINS?.trim();
  const coins = coinsRaw
    ? coinsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["bitcoin", "ethereum", "solana", "dogecoin"];
  const vsRaw = process.env.CRYPTO_DETECTIVE_VS?.trim();
  const vsCurrencies = vsRaw
    ? vsRaw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : ["usd"];
  return {
    coins,
    vsCurrencies: vsCurrencies.length > 0 ? vsCurrencies : ["usd"],
    withGlobal: envTruthy(process.env.CRYPTO_DETECTIVE_WITH_GLOBAL),
    withMarkets: envTruthy(process.env.CRYPTO_DETECTIVE_WITH_MARKETS),
  };
}

function parseServerArgv(argv) {
  let port = Number(process.env.CRYPTO_DETECTIVE_UI_PORT || process.env.PORT || 3847);
  let host = process.env.CRYPTO_DETECTIVE_UI_HOST || "127.0.0.1";
  let pollSec = Number(process.env.CRYPTO_DETECTIVE_UI_POLL_SEC || 60);
  if (!Number.isFinite(port) || port < 1) port = 3847;
  if (!Number.isFinite(pollSec) || pollSec < 5) pollSec = 60;

  for (const arg of argv) {
    if (arg.startsWith("--port=")) {
      const n = Number(arg.slice("--port=".length));
      if (Number.isFinite(n) && n > 0) port = n;
    } else if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length).trim() || host;
    } else if (arg.startsWith("--poll=")) {
      const n = Number(arg.slice("--poll=".length));
      if (Number.isFinite(n) && n >= 5) pollSec = n;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node server.mjs [options]

  --port=N     Listen port (default 3847, env CRYPTO_DETECTIVE_UI_PORT)
  --host=ADDR  Bind address (default 127.0.0.1, env CRYPTO_DETECTIVE_UI_HOST; use 0.0.0.0 for LAN)
  --poll=SECS  Seconds between upstream polls per SSE client (default 60, min 5)

Coin list and vs currencies follow CRYPTO_DETECTIVE_COINS, CRYPTO_DETECTIVE_VS, _WITH_GLOBAL, _WITH_MARKETS
(same as the CLI). CoinGecko API key env vars are unchanged.

Open http://127.0.0.1:<port>/ in your browser.
`);
      process.exit(0);
    }
  }
  return { port, host, pollMs: pollSec * 1000 };
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

function resolvePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  if (decoded === "/" || decoded === "") {
    return path.join(PUBLIC_DIR, "index.html");
  }
  const rel = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return path.join(PUBLIC_DIR, rel);
}

async function serveStatic(req, res) {
  const urlPath = req.url ?? "/";
  const filePath = resolvePublicPath(urlPath);
  if (!filePath || !filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const data = await fs.promises.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) }).end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const { port, host, pollMs: basePollMs } = parseServerArgv(argv);
  const snapOpts = snapshotOptionsFromEnv();
  const primaryVs = snapOpts.vsCurrencies[0].toLowerCase();

  const server = http.createServer((req, res) => {
    const u = req.url ?? "";

    if (u.startsWith("/api/stream")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders?.();

      let effectivePollMs = basePollMs;
      let timer = null;
      let closed = false;

      const send = (obj) => {
        if (closed) return;
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      const tick = async () => {
        const result = await fetchCoingeckoSnapshot(snapOpts);
        if (!result.ok) {
          if (result.rateLimited) {
            effectivePollMs = Math.min(Math.max(effectivePollMs * 2, basePollMs), MAX_BACKOFF_MS);
            send({
              at: new Date().toISOString(),
              error: "rate_limited",
              retryInSec: Math.round(effectivePollMs / 1000),
              prices: {},
              coins: {},
            });
          } else {
            send({
              at: new Date().toISOString(),
              error: result.error?.message ?? "fetch_failed",
              prices: {},
              coins: {},
            });
          }
          return;
        }

        effectivePollMs = basePollMs;
        const nowMs = Date.now();
        const record = {
          at: new Date(nowMs).toISOString(),
          prices: pricesFromCoins(result.coins, primaryVs),
          coins: result.coins,
        };
        if (result.global != null) {
          record.global = result.global;
        }
        if (result.markets != null) {
          record.markets = result.markets;
        }
        send(record);
      };

      const loop = async () => {
        await tick();
        if (!closed) {
          timer = setTimeout(loop, effectivePollMs);
        }
      };

      void loop();

      req.on("close", () => {
        closed = true;
        if (timer != null) {
          clearTimeout(timer);
        }
      });
      return;
    }

    if (u.startsWith("/api/snapshot")) {
      void (async () => {
        const result = await fetchCoingeckoSnapshot(snapOpts);
        if (!result.ok) {
          const status = result.rateLimited ? 429 : 502;
          res
            .writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
            .end(
              JSON.stringify({
                ok: false,
                rateLimited: result.rateLimited,
                error: result.error?.message ?? "unknown",
              }),
            );
          return;
        }
        const body = {
          ok: true,
          at: new Date().toISOString(),
          prices: pricesFromCoins(result.coins, primaryVs),
          coins: result.coins,
        };
        if (result.global != null) body.global = result.global;
        if (result.markets != null) body.markets = result.markets;
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
      })();
      return;
    }

    void serveStatic(req, res);
  });

  server.listen(port, host, () => {
    console.log(`[api-detective ui] http://${host}:${port}/`);
    console.log(`[api-detective ui] polling CoinGecko every ${basePollMs / 1000}s (${snapOpts.coins.join(", ")})`);
  });
}

const __file = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __file;
if (isMain) {
  main();
}
