// crypto_detective.mjs — CoinGecko terminal price dashboard (ESM).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isJsonlHistoryPath, readJsonlTail, writeJsonlRecords } from "./lib/jsonl_history.mjs";
import { fetchCoingeckoSnapshot } from "./lib/coingecko_tick.mjs";
import { loadDotEnv } from "./lib/load_dotenv.mjs";
import { postSlackIncoming } from "./lib/slack_incoming.mjs";

loadDotEnv();

export { normalizeCoinRow, shouldRetryHttpStatus } from "./lib/coingecko_tick.mjs";

// Default configuration knobs. These can be overridden by env, then CLI flags.
const DEFAULT_COINS = ["bitcoin", "ethereum", "solana", "dogecoin"];
const DEFAULT_POLL_INTERVAL_MS = 60_000;
const DEFAULT_ALERT_ON_MOVE_PCT = 0.25;
const DEFAULT_ALERT_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_LOG_BASENAME = "crypto_detective.log";
const MAX_RATE_LIMIT_BACKOFF_MS = 15 * 60_000;
const FETCH_RETRIES = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function err(...args) {
  console.error("[crypto_detective]", ...args);
}

function envTruthy(value) {
  if (value == null || value === "") return false;
  const s = String(value).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** Apply CRYPTO_DETECTIVE_* env vars. CLI args should be parsed after this. */
export function applyEnvToConfig(config, env = process.env) {
  const coinsRaw = env.CRYPTO_DETECTIVE_COINS?.trim();
  if (coinsRaw) {
    const list = coinsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) config.coins = list;
  }
  const intervalSec = env.CRYPTO_DETECTIVE_INTERVAL_SEC?.trim();
  if (intervalSec) {
    const v = Number(intervalSec);
    if (Number.isFinite(v) && v > 0) config.pollIntervalMs = v * 1000;
  }
  const alertPct = env.CRYPTO_DETECTIVE_ALERT_PCT?.trim();
  if (alertPct) {
    const v = Number(alertPct);
    if (Number.isFinite(v) && v > 0) config.alertOnMovePct = v;
  }
  const cool = env.CRYPTO_DETECTIVE_ALERT_COOLDOWN_MIN?.trim();
  if (cool) {
    const v = Number(cool);
    if (Number.isFinite(v) && v > 0) config.alertCooldownMs = v * 60_000;
  }
  const hist = env.CRYPTO_DETECTIVE_HISTORY?.trim();
  if (hist) {
    const v = Number(hist);
    if (Number.isInteger(v) && v > 0) config.historyLimit = v;
  }
  const logPath = env.CRYPTO_DETECTIVE_LOG?.trim();
  if (logPath) {
    config.logFile = path.isAbsolute(logPath) ? logPath : path.join(process.cwd(), logPath);
  }
  if (envTruthy(env.CRYPTO_DETECTIVE_ONCE)) config.once = true;
  if (envTruthy(env.CRYPTO_DETECTIVE_JSON)) config.json = true;
  if (envTruthy(env.CRYPTO_DETECTIVE_NO_BEEP)) config.beep = false;
  if (envTruthy(env.CRYPTO_DETECTIVE_NO_LOG)) config.logEnabled = false;
  if (envTruthy(env.CRYPTO_DETECTIVE_PLAIN)) config.plain = true;
  const vs = env.CRYPTO_DETECTIVE_VS?.trim();
  if (vs) {
    const list = vs.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (list.length > 0) config.vsCurrencies = list;
  }
  const h24 = env.CRYPTO_DETECTIVE_ALERT_24H_PCT?.trim();
  if (h24) {
    const v = Number(h24);
    if (Number.isFinite(v) && v > 0) config.alert24hPct = v;
  }
  if (envTruthy(env.CRYPTO_DETECTIVE_WITH_GLOBAL)) config.withGlobal = true;
  if (envTruthy(env.CRYPTO_DETECTIVE_WITH_MARKETS)) config.withMarkets = true;
  if (envTruthy(env.CRYPTO_DETECTIVE_NOTIFY)) config.notify = true;
  const persist = env.CRYPTO_DETECTIVE_HISTORY_PERSIST?.trim();
  if (persist) {
    config.historyPersistPath = path.isAbsolute(persist) ? persist : path.join(process.cwd(), persist);
  }
  if (envTruthy(env.CRYPTO_DETECTIVE_PRETTY)) config.pretty = true;
  if (envTruthy(env.CRYPTO_DETECTIVE_DRY_RUN)) config.dryRun = true;
  const maxRun = env.CRYPTO_DETECTIVE_MAX_RUNTIME_SEC?.trim();
  if (maxRun) {
    const n = Number(maxRun);
    if (Number.isFinite(n) && n > 0) config.maxRuntimeSec = n;
  }
  const jit = env.CRYPTO_DETECTIVE_JITTER_SEC?.trim();
  if (jit) {
    const n = Number(jit);
    if (Number.isFinite(n) && n >= 0) config.jitterSec = n;
  }
}

export function parseCliConfig(argv, env = process.env) {
  const config = {
    coins: [...DEFAULT_COINS],
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    alertOnMovePct: DEFAULT_ALERT_ON_MOVE_PCT,
    alertCooldownMs: DEFAULT_ALERT_COOLDOWN_MS,
    historyLimit: DEFAULT_HISTORY_LIMIT,
    logFile: path.join(process.cwd(), DEFAULT_LOG_BASENAME),
    once: false,
    json: false,
    beep: true,
    logEnabled: true,
    plain: false,
    vsCurrencies: ["usd"],
    alert24hPct: null,
    alertsJsonPath: null,
    perCoinAlertPctCli: {},
    withGlobal: false,
    withMarkets: false,
    notify: false,
    historyPersistPath: null,
    pretty: false,
    dryRun: false,
    maxRuntimeSec: null,
    jitterSec: 0,
  };

  applyEnvToConfig(config, env);

  for (const arg of argv) {
    if (arg === "--once") {
      config.once = true;
    } else if (arg === "--no-beep") {
      config.beep = false;
    } else if (arg === "--json") {
      config.json = true;
    } else if (arg === "--no-log") {
      config.logEnabled = false;
    } else if (arg === "--plain") {
      config.plain = true;
    } else if (arg === "--with-global") {
      config.withGlobal = true;
    } else if (arg === "--with-markets") {
      config.withMarkets = true;
    } else if (arg === "--notify") {
      config.notify = true;
    } else if (arg.startsWith("--history-persist=")) {
      const p = arg.slice("--history-persist=".length).trim();
      if (p.length > 0) {
        config.historyPersistPath = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
      }
    } else if (arg.startsWith("--coins=")) {
      const list = arg.slice("--coins=".length).split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        config.coins = list;
      }
    } else if (arg.startsWith("--vs=")) {
      const list = arg
        .slice("--vs=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (list.length > 0) {
        config.vsCurrencies = list;
      }
    } else if (arg.startsWith("--interval=")) {
      const v = Number(arg.slice("--interval=".length));
      if (Number.isFinite(v) && v > 0) {
        config.pollIntervalMs = v * 1000;
      }
    } else if (arg.startsWith("--alertPct=")) {
      const v = Number(arg.slice("--alertPct=".length));
      if (Number.isFinite(v) && v > 0) {
        config.alertOnMovePct = v;
      }
    } else if (arg.startsWith("--alert24hPct=")) {
      const v = Number(arg.slice("--alert24hPct=".length));
      if (Number.isFinite(v) && v > 0) {
        config.alert24hPct = v;
      }
    } else if (arg.startsWith("--alertCooldownMin=")) {
      const v = Number(arg.slice("--alertCooldownMin=".length));
      if (Number.isFinite(v) && v > 0) {
        config.alertCooldownMs = v * 60_000;
      }
    } else if (arg.startsWith("--history=")) {
      const v = Number(arg.slice("--history=".length));
      if (Number.isInteger(v) && v > 0) {
        config.historyLimit = v;
      }
    } else if (arg.startsWith("--log=")) {
      const p = arg.slice("--log=".length).trim();
      if (p.length > 0) {
        config.logFile = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
      }
    } else if (arg.startsWith("--alerts-json=")) {
      const p = arg.slice("--alerts-json=".length).trim();
      if (p.length > 0) {
        config.alertsJsonPath = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
      }
    } else if (arg === "--pretty") {
      config.pretty = true;
    } else if (arg === "--dry-run") {
      config.dryRun = true;
    } else if (arg.startsWith("--max-runtime=")) {
      const n = Number(arg.slice("--max-runtime=".length));
      if (Number.isFinite(n) && n > 0) {
        config.maxRuntimeSec = n;
      }
    } else if (arg.startsWith("--jitter-sec=")) {
      const n = Number(arg.slice("--jitter-sec=".length));
      if (Number.isFinite(n) && n >= 0) {
        config.jitterSec = n;
      }
    } else if (/^--alertPct-[^=]+=/.test(arg)) {
      const m = arg.match(/^--alertPct-([^=]+)=(.+)$/);
      if (m) {
        const coin = m[1].trim().toLowerCase();
        const v = Number(m[2]);
        if (coin.length > 0 && Number.isFinite(v) && v > 0) {
          config.perCoinAlertPctCli[coin] = v;
        }
      }
    }
  }

  /** @type {Record<string, number>} */
  let perCoinFromFile = {};
  if (config.alertsJsonPath) {
    try {
      const raw = fs.readFileSync(config.alertsJsonPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "number" && Number.isFinite(v) && v > 0) {
            perCoinFromFile[k] = v;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`--alerts-json: ${msg}`);
    }
  }

  config.perCoinAlertPct = { ...perCoinFromFile, ...config.perCoinAlertPctCli };
  delete config.perCoinAlertPctCli;

  return config;
}

function printHelp() {
  console.log(`Usage: node crypto_detective.mjs [options]

  --version, -v         Print package version and exit
  --coins=id1,id2       CoinGecko coin ids (default: ${DEFAULT_COINS.join(",")})
  --vs=usd,eur          Fiat codes for simple/price (first = primary for alerts/sparkline)
  --interval=SECS       Poll interval in seconds (default: ${DEFAULT_POLL_INTERVAL_MS / 1000})
  --alertPct=N          Alert when tick-to-tick move >= N% (default: ${DEFAULT_ALERT_ON_MOVE_PCT})
  --alert24hPct=N       Also alert when |primary fiat 24h change| >= N% (optional)
  --alerts-json=FILE    Per-coin tick thresholds: JSON {"bitcoin":1.5,"ethereum":2} (coin id -> %)
  --alertCooldownMin=N  Minutes between alerts per coin (default: ${DEFAULT_ALERT_COOLDOWN_MS / 60_000})
  --history=N           Max history points (default: ${DEFAULT_HISTORY_LIMIT})
  --log=PATH            JSON log file (default: ${DEFAULT_LOG_BASENAME} in cwd)
  --no-log              Do not append to the log file
  --with-global         Add CoinGecko /global summary to each tick record (extra request)
  --with-markets        Add /coins/markets (rank, name, image) per coin (extra request)
  --history-persist=FILE Save/load rolling history: use .jsonl for fast line format (recommended), or .json for legacy array
  --alertPct-COIN=N     Per-coin tick-move threshold (%); overrides same id from --alerts-json
  --notify              Desktop toast on alerts (requires: npm install node-notifier)
  --plain               No ANSI colors or clear-screen (logs / cron friendly)
  --once                Fetch once, print dashboard, write log, then exit (exit 1 if fetch fails)
  --json                NDJSON per tick to stdout (at, prices, coins, alerts[, global]); errors on stderr
  --pretty              With --json: indent JSON (not one-line NDJSON; avoid piping)
  --dry-run             Print resolved config (secrets redacted) and exit 0; no network
  --max-runtime=SECS    Exit cleanly after SECS (looping mode)
  --jitter-sec=N        Random 0..N seconds added to each poll delay (spread load)
  --no-beep             Do not send the terminal bell (\\x07) when alerts fire
  --help, -h            Show this help

Env (optional; CLI overrides): CRYPTO_DETECTIVE_COINS, _INTERVAL_SEC, _ALERT_PCT, _ALERT_24H_PCT,
  _ALERT_COOLDOWN_MIN, _HISTORY, _LOG, _ONCE, _JSON, _NO_BEEP, _NO_LOG, _PLAIN, _VS, _WITH_GLOBAL,
  _WITH_MARKETS, _NOTIFY, _HISTORY_PERSIST, _PRETTY, _DRY_RUN, _MAX_RUNTIME_SEC, _JITTER_SEC

NO_COLOR=1           Same as --plain for styling.

CoinGecko Pro: set COINGECKO_API_KEY or CRYPTO_DETECTIVE_COINGECKO_API_KEY (header x-cg-pro-api-key).

Webhook: CRYPTO_DETECTIVE_ALERT_WEBHOOK or ALERT_WEBHOOK_URL — POST JSON body when any alert fires.
Slack: CRYPTO_DETECTIVE_SLACK_WEBHOOK — Incoming Webhook URL; posts a short text summary on alerts.

Optional .env in project root is loaded first (does not override existing env vars).

On HTTP 429, wait doubles (cap ${MAX_RATE_LIMIT_BACKOFF_MS / 60_000} min). Retries: 408, 425, 5xx, and network errors (up to ${FETCH_RETRIES} attempts).

Log/JSON: top-level prices = flat id→primary fiat price; coins holds full CoinGecko fields.
`);
}

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (argv.includes("--version") || argv.includes("-v")) {
  try {
    const pkgPath = path.join(__dirname, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    console.log(pkg.version ?? "unknown");
  } catch {
    console.log("unknown");
  }
  process.exit(0);
}

let CLI_CONFIG;
try {
  CLI_CONFIG = parseCliConfig(argv);
} catch (e) {
  err(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

function redactForDryRun(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactForDryRun);
  }
  /** @type {Record<string, unknown>} */
  const o = {};
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (typeof v === "string" && /key|secret|password|token|webhook|auth|bearer|credential|api/i.test(kl)) {
      o[k] = "***";
    } else if (typeof v === "object" && v !== null) {
      o[k] = redactForDryRun(v);
    } else {
      o[k] = v;
    }
  }
  return o;
}

if (CLI_CONFIG.dryRun) {
  const snap = {
    ...CLI_CONFIG,
    coins: [...CLI_CONFIG.coins],
    vsCurrencies: [...CLI_CONFIG.vsCurrencies],
    perCoinAlertPct: { ...CLI_CONFIG.perCoinAlertPct },
  };
  console.log(JSON.stringify(redactForDryRun(snap), null, 2));
  process.exit(0);
}

const COINS = CLI_CONFIG.coins;
const POLL_INTERVAL_MS = CLI_CONFIG.pollIntervalMs;
const LOG_FILE = CLI_CONFIG.logFile;
const PRIMARY_VS = CLI_CONFIG.vsCurrencies[0].toLowerCase();
const VS_PARAM = CLI_CONFIG.vsCurrencies.join(",");
const PLAIN_MODE = CLI_CONFIG.plain || envTruthy(process.env.NO_COLOR);
const LOG_ENABLED = CLI_CONFIG.logEnabled;
const ALERT_24H_PCT = CLI_CONFIG.alert24hPct;
const PER_COIN_ALERT_PCT = CLI_CONFIG.perCoinAlertPct;
const WITH_GLOBAL = CLI_CONFIG.withGlobal;
const WITH_MARKETS = CLI_CONFIG.withMarkets;
const NOTIFY_ENABLED = CLI_CONFIG.notify;
const HISTORY_PERSIST_PATH = CLI_CONFIG.historyPersistPath;

const ALERT_WEBHOOK_URL =
  process.env.CRYPTO_DETECTIVE_ALERT_WEBHOOK?.trim() || process.env.ALERT_WEBHOOK_URL?.trim() || "";
const SLACK_INCOMING_URL = process.env.CRYPTO_DETECTIVE_SLACK_WEBHOOK?.trim() || "";

const PRETTY_JSON = CLI_CONFIG.pretty;
const MAX_RUNTIME_MS =
  CLI_CONFIG.maxRuntimeSec != null && CLI_CONFIG.maxRuntimeSec > 0
    ? CLI_CONFIG.maxRuntimeSec * 1000
    : null;
const JITTER_MS_MAX =
  CLI_CONFIG.jitterSec != null && CLI_CONFIG.jitterSec > 0 ? CLI_CONFIG.jitterSec * 1000 : 0;

const COLORS = PLAIN_MODE
  ? { reset: "", dim: "", cyan: "", green: "", red: "", yellow: "" }
  : {
      reset: "\x1b[0m",
      dim: "\x1b[2m",
      cyan: "\x1b[36m",
      green: "\x1b[32m",
      red: "\x1b[31m",
      yellow: "\x1b[33m",
    };

const FIAT_PREFIX = {
  usd: "$",
  eur: "€",
  gbp: "£",
  jpy: "¥",
  aud: "A$",
  cad: "C$",
};

function fiatPrefix(vs) {
  return FIAT_PREFIX[vs.toLowerCase()] ?? `${vs.toUpperCase()} `;
}

const COIN_LABELS = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  dogecoin: "DOGE",
};

function labelForCoin(id) {
  const known = COIN_LABELS[id];
  if (known) return known.padEnd(4);
  return id.slice(0, 4).toUpperCase().padEnd(4);
}

const ALERT_ON_MOVE_PCT = CLI_CONFIG.alertOnMovePct;
const ALERT_COOLDOWN_MS = CLI_CONFIG.alertCooldownMs;
const ALERT_BEEP = CLI_CONFIG.beep;
const HISTORY_LIMIT = CLI_CONFIG.historyLimit;
const RUN_ONCE = CLI_CONFIG.once;
const JSON_MODE = CLI_CONFIG.json;

function primaryPrice(row) {
  return row[PRIMARY_VS];
}

async function fetchPrices() {
  const result = await fetchCoingeckoSnapshot({
    coins: COINS,
    vsCurrencies: CLI_CONFIG.vsCurrencies,
    withGlobal: WITH_GLOBAL,
    withMarkets: WITH_MARKETS,
  });

  if (result.ok) {
    return {
      ok: true,
      coins: result.coins,
      global: result.global,
      markets: result.markets,
    };
  }

  if (result.rateLimited) {
    if (JSON_MODE) {
      err("HTTP 429 Too Many Requests — backing off before the next attempt.");
    } else {
      err(
        `${COLORS.yellow}HTTP 429 Too Many Requests — backing off before the next attempt.${COLORS.reset}`,
      );
    }
    return { ok: false, rateLimited: true };
  }

  const error = result.error;
  const message = error instanceof Error ? error.message : String(error);
  const maybeCause = error instanceof Error ? error.cause : undefined;
  const causeMsg =
    maybeCause && typeof maybeCause === "object" && "code" in maybeCause
      ? ` (cause: ${maybeCause.code})`
      : maybeCause instanceof Error
        ? ` (cause: ${maybeCause.message})`
        : "";
  err(`CRITICAL FAILURE: ${message}${causeMsg}`);
  return { ok: false, rateLimited: false };
}

function formatPrice(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFiatCompact(n, vs) {
  if (!Number.isFinite(n)) return "—";
  const sym = fiatPrefix(vs);
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${sym}${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sym}${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sym}${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sym}${(n / 1e3).toFixed(2)}K`;
  return `${sym}${formatPrice(n)}`;
}

function renderCoinRow(id, history, alerts) {
  const latest = history[history.length - 1];
  const prev = history[history.length - 2];

  const latestRow = latest?.coins[id] ?? null;
  const prevRow = prev?.coins[id] ?? null;
  const latestPrice = latestRow != null ? primaryPrice(latestRow) : null;
  const prevPrice = prevRow != null ? primaryPrice(prevRow) : null;

  const label = labelForCoin(id);
  const sym = fiatPrefix(PRIMARY_VS);

  if (latestPrice == null) {
    console.log(`${COLORS.yellow}${label}  No data yet...${COLORS.reset}`);
    return;
  }

  const mkt = latest?.markets?.[id];
  if (mkt != null && (mkt.market_cap_rank != null || mkt.name)) {
    const rank = mkt.market_cap_rank != null ? `#${mkt.market_cap_rank} ` : "";
    const title = mkt.name ?? id;
    console.log(`${COLORS.dim}      ${rank}${title}${COLORS.reset}`);
  }

  let changeText = "N/A";
  let direction = "●";
  let color = COLORS.yellow;

  if (prevPrice != null && prevPrice !== 0) {
    const diff = latestPrice - prevPrice;
    const pct = (diff / prevPrice) * 100;
    if (diff > 0) {
      direction = "▲";
      color = COLORS.green;
    } else if (diff < 0) {
      direction = "▼";
      color = COLORS.red;
    } else {
      direction = "●";
      color = COLORS.yellow;
    }
    changeText = `${diff > 0 ? "+" : ""}${formatPrice(diff)} (${pct.toFixed(2)}%)`;
  }

  console.log(
    `${color}${label}  ${sym}${formatPrice(latestPrice).padStart(13)}  ${direction}  ${changeText}${COLORS.reset}`,
  );

  const chKey = `${PRIMARY_VS}_24h_change`;
  const ch24 = latestRow[chKey];
  if (typeof ch24 === "number") {
    const chColor = ch24 > 0 ? COLORS.green : ch24 < 0 ? COLORS.red : COLORS.dim;
    const capKey = `${PRIMARY_VS}_market_cap`;
    const volKey = `${PRIMARY_VS}_24h_vol`;
    const cap =
      typeof latestRow[capKey] === "number" ? `  cap ${formatFiatCompact(latestRow[capKey], PRIMARY_VS)}` : "";
    const vol =
      typeof latestRow[volKey] === "number" ? `  vol ${formatFiatCompact(latestRow[volKey], PRIMARY_VS)}` : "";
    console.log(
      `${COLORS.dim}      24h ${chColor}${ch24 > 0 ? "+" : ""}${ch24.toFixed(2)}%${COLORS.reset}${COLORS.dim}${cap}${vol}${COLORS.reset}`,
    );
  }

  const values = history.map((h) => primaryPrice(h.coins[id])).filter((v) => v != null);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    console.log(`${COLORS.dim}      ` + "━".repeat(values.length) + COLORS.reset);
  } else {
    const barChars = "▁▂▃▄▅▆▇█";
    const line = values
      .map((v) => {
        const ratio = (v - min) / (max - min);
        const idx = Math.min(barChars.length - 1, Math.floor(ratio * barChars.length));
        return barChars[idx];
      })
      .join("");
    console.log(`${COLORS.dim}      ${line}${COLORS.reset}`);
  }

  const alert = alerts[id];
  if (alert) {
    const alertColor = alert.direction === "up" ? COLORS.green : alert.direction === "down" ? COLORS.red : COLORS.yellow;
    console.log(`${alertColor}      ⚠ ALERT: ${alert.message}${COLORS.reset}`);
  }
}

function renderDashboard(history, alerts, nextDelayMs = POLL_INTERVAL_MS) {
  const now = new Date().toLocaleTimeString();

  if (!PLAIN_MODE) {
    console.clear();
  }
  console.log(`${COLORS.cyan}╔══════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.cyan}║${COLORS.reset}   CRYPTO DETECTIVE : MULTI UPLINK      ${COLORS.cyan}║${COLORS.reset}`);
  console.log(`${COLORS.cyan}╚══════════════════════════════════════════╝${COLORS.reset}`);
  console.log(`${COLORS.dim}Time: ${now}  vs=${PRIMARY_VS.toUpperCase()}${COLORS.reset}`);

  if (history.length === 0) {
    console.log(`${COLORS.yellow}No price data yet...${COLORS.reset}`);
    return;
  }

  if (ALERT_BEEP && Object.keys(alerts).length > 0) {
    process.stdout.write("\x07");
  }

  for (const id of COINS) {
    console.log("------------------------------------------");
    renderCoinRow(id, history, alerts);
  }

  console.log("------------------------------------------");
  if (RUN_ONCE) {
    console.log(`${COLORS.dim}Single run (--once); exiting.${COLORS.reset}`);
  } else {
    const sec = Math.max(1, Math.round(nextDelayMs / 1000));
    console.log(`${COLORS.dim}Next update in ${sec}s${COLORS.reset}`);
  }
}

export function pricesFromCoins(coins, primaryVs = "usd") {
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

function buildTickRecord(historyEntry, alerts) {
  const rec = {
    at: new Date(historyEntry.at).toISOString(),
    prices: pricesFromCoins(historyEntry.coins, PRIMARY_VS),
    coins: historyEntry.coins,
    alerts,
  };
  if (historyEntry.global != null) {
    rec.global = historyEntry.global;
  }
  if (historyEntry.markets != null) {
    rec.markets = historyEntry.markets;
  }
  return rec;
}

function logTickRecord(record) {
  if (!LOG_ENABLED) {
    return;
  }
  const line = JSON.stringify(record) + "\n";
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) {
      err(`Failed to write to ${LOG_FILE}:`, err.message);
    }
  });
}

let notifierImport = null;

async function notifyDesktopAlerts(alerts) {
  if (!NOTIFY_ENABLED || Object.keys(alerts).length === 0) {
    return;
  }
  try {
    if (!notifierImport) {
      notifierImport = await import("node-notifier");
    }
    const notifier = notifierImport.default;
    const message = Object.entries(alerts)
      .map(([id, a]) => `${id}: ${a.message}`)
      .join("\n");
    notifier.notify({ title: "Crypto detective", message });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    err(`Desktop notify failed (${msg}). Install dependency: npm install node-notifier`);
  }
}

function loadPersistedHistory(filePath, limit) {
  if (isJsonlHistoryPath(filePath)) {
    const rows = readJsonlTail(filePath, limit, (row) => {
      return (
        typeof row === "object" &&
        row !== null &&
        typeof row.at === "number" &&
        "coins" in row &&
        typeof row.coins === "object" &&
        row.coins !== null
      );
    });
    return rows.map((row) => ({ at: row.at, coins: row.coins }));
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) {
      return [];
    }
    const out = [];
    for (const row of arr) {
      if (
        row &&
        typeof row === "object" &&
        typeof row.at === "number" &&
        row.coins &&
        typeof row.coins === "object"
      ) {
        out.push({ at: row.at, coins: row.coins });
      }
    }
    return out.slice(-limit);
  } catch {
    return [];
  }
}

function savePersistedHistory(filePath, history) {
  const slim = history.map((e) => ({ at: e.at, coins: e.coins }));
  if (isJsonlHistoryPath(filePath)) {
    writeJsonlRecords(filePath, slim);
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(slim), "utf8");
}

async function postAlertWebhook(record) {
  if (!ALERT_WEBHOOK_URL) {
    return;
  }
  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    err(`Webhook POST failed: ${msg}`);
  }
}

async function postSlackCryptoAlerts(record, alerts) {
  if (!SLACK_INCOMING_URL || Object.keys(alerts).length === 0) {
    return;
  }
  const lines = Object.entries(alerts)
    .map(([id, a]) => `• *${id}*: ${a.message}`)
    .join("\n");
  const text = `*Crypto detective* ${record.at}\n${lines}`;
  try {
    await postSlackIncoming(SLACK_INCOMING_URL, text);
  } catch (e) {
    err(`Slack: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function startDashboard() {
  if (!JSON_MODE) {
    console.log("INITIALIZING CRYPTO UPLINK...");
  }

  const history =
    HISTORY_PERSIST_PATH != null ? loadPersistedHistory(HISTORY_PERSIST_PATH, HISTORY_LIMIT) : [];
  const lastTickAlertAt = {};
  const last24hAlertAt = {};

  let effectiveDelayMs = POLL_INTERVAL_MS;
  let pollTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let maxRunTimer = null;

  const nextPollDelayMs = () => {
    const j = JITTER_MS_MAX > 0 ? Math.floor(Math.random() * (JITTER_MS_MAX + 1)) : 0;
    return effectiveDelayMs + j;
  };

  if (MAX_RUNTIME_MS != null) {
    maxRunTimer = setTimeout(() => {
      if (pollTimer != null) {
        clearTimeout(pollTimer);
      }
      process.exit(0);
    }, MAX_RUNTIME_MS);
  }

  const tick = async () => {
    const result = await fetchPrices();
    if (!result.ok) {
      if (result.rateLimited) {
        const doubled = effectiveDelayMs * 2;
        effectiveDelayMs = Math.min(Math.max(doubled, POLL_INTERVAL_MS), MAX_RATE_LIMIT_BACKOFF_MS);
        const sec = Math.round(effectiveDelayMs / 1000);
        if (JSON_MODE) {
          err(`Rate-limit backoff: next attempt in ${sec}s (max ${MAX_RATE_LIMIT_BACKOFF_MS / 60_000} min).`);
        } else {
          err(
            `${COLORS.dim}Rate-limit backoff: next attempt in ${sec}s (max ${MAX_RATE_LIMIT_BACKOFF_MS / 60_000} min).${COLORS.reset}`,
          );
        }
      }
      if (history.length > 0 && !JSON_MODE) {
        renderDashboard(history, {}, effectiveDelayMs);
      }
      return false;
    }

    effectiveDelayMs = POLL_INTERVAL_MS;
    const { coins, global: globalData, markets: marketsData } = result;

    const nowMs = Date.now();
    const entry = {
      coins,
      at: nowMs,
      global: globalData ?? undefined,
      markets: marketsData ?? undefined,
    };
    history.push(entry);
    if (history.length > HISTORY_LIMIT) {
      history.shift();
    }
    if (HISTORY_PERSIST_PATH != null) {
      savePersistedHistory(HISTORY_PERSIST_PATH, history);
    }

    const alerts = {};
    const latest = history[history.length - 1];
    const prev = history[history.length - 2];

    const chKey = `${PRIMARY_VS}_24h_change`;

    if (prev != null) {
      for (const id of COINS) {
        const latestPrice = primaryPrice(latest.coins[id]);
        const prevPrice = primaryPrice(prev.coins[id]);

        if (latestPrice != null && prevPrice != null && prevPrice !== 0) {
          const diff = latestPrice - prevPrice;
          const pct = (diff / prevPrice) * 100;
          const cooldownOk = nowMs - (lastTickAlertAt[id] ?? 0) >= ALERT_COOLDOWN_MS;
          const threshold = PER_COIN_ALERT_PCT[id] ?? ALERT_ON_MOVE_PCT;

          if (Math.abs(pct) >= threshold && cooldownOk) {
            lastTickAlertAt[id] = nowMs;
            alerts[id] = {
              direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
              message: `${labelForCoin(id).trim()} moved ${diff > 0 ? "+" : ""}${pct.toFixed(2)}% since last tick`,
            };
          }
        }
      }
    }

    if (ALERT_24H_PCT != null) {
      for (const id of COINS) {
        const row = latest.coins[id];
        if (!row) {
          continue;
        }
        const ch = row[chKey];
        if (typeof ch !== "number" || Math.abs(ch) < ALERT_24H_PCT) {
          continue;
        }
        const cooldownOk = nowMs - (last24hAlertAt[id] ?? 0) >= ALERT_COOLDOWN_MS;
        if (!cooldownOk) {
          continue;
        }
        last24hAlertAt[id] = nowMs;
        const msg = `${labelForCoin(id).trim()} 24h ${ch > 0 ? "+" : ""}${ch.toFixed(2)}% (≥${ALERT_24H_PCT}% threshold)`;
        const prev = alerts[id];
        if (prev) {
          alerts[id] = {
            direction: ch > 0 ? "up" : ch < 0 ? "down" : "flat",
            message: `${prev.message}; ${msg}`,
          };
        } else {
          alerts[id] = {
            direction: ch > 0 ? "up" : ch < 0 ? "down" : "flat",
            message: msg,
          };
        }
      }
    }

    const record = buildTickRecord(entry, alerts);

    if (JSON_MODE) {
      console.log(JSON.stringify(record, null, PRETTY_JSON ? 2 : undefined));
    } else {
      renderDashboard(history, alerts, effectiveDelayMs);
    }
    logTickRecord(record);
    if (ALERT_WEBHOOK_URL && Object.keys(alerts).length > 0) {
      await postAlertWebhook(record);
    }
    if (Object.keys(alerts).length > 0) {
      await postSlackCryptoAlerts(record, alerts);
    }
    if (Object.keys(alerts).length > 0) {
      await notifyDesktopAlerts(alerts);
    }
    return true;
  };

  const ok = await tick();
  if (RUN_ONCE) {
    process.exit(ok ? 0 : 1);
  }

  const pump = async () => {
    await tick();
    pollTimer = setTimeout(pump, nextPollDelayMs());
  };
  pollTimer = setTimeout(pump, nextPollDelayMs());

  const shutdown = () => {
    if (pollTimer != null) {
      clearTimeout(pollTimer);
    }
    if (maxRunTimer != null) {
      clearTimeout(maxRunTimer);
    }
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  startDashboard();
}
