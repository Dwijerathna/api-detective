// probe_detective.mjs — generic HTTP JSON poller: fetch URL, read value by dot-path, optional alerts & JSONL history.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getByJsonPath } from "./lib/json_path.mjs";
import { isJsonlHistoryPath, readJsonlTail, writeJsonlRecords } from "./lib/jsonl_history.mjs";
import { loadDotEnv } from "./lib/load_dotenv.mjs";
import { postSlackIncoming } from "./lib/slack_incoming.mjs";

loadDotEnv();

function err(...args) {
  console.error("[probe_detective]", ...args);
}

const MAX_BACKOFF_MS = 15 * 60_000;
const FETCH_RETRIES = 3;
const RETRY_DELAY_MS = 1_000;

function shouldRetryHttpStatus(status) {
  return status === 408 || status === 425 || (status >= 500 && status <= 599);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function envTruthy(value) {
  if (value == null || value === "") return false;
  const s = String(value).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function printHelp() {
  console.log(`Usage: node probe_detective.mjs --url=URL --path=dot.path [options]

  --url=URL             HTTP(S) endpoint returning JSON
  --path=dot.path       Value to read (e.g. bitcoin.usd or items.0.name). Empty = whole JSON.
  --method=GET|POST     HTTP method (default GET)
  --body-json=STR|FILE JSON body for POST (if starts with @, read file path after @)
  --headers-json=FILE   Extra request headers as JSON object
  --interval=SECS       Poll interval (default 60)
  --history=N           Points to keep in memory (default 50)
  --history-persist=FILE  JSONL (.jsonl) recommended — fast rolling history (no SQLite)
  --alertPct=N          If value is numeric, alert when tick-to-tick % move >= N
  --log=FILE            Append NDJSON log lines (default: probe_detective.log)
  --no-log
  --once                Single request then exit
  --json                Print one NDJSON line per successful tick to stdout
  --pretty              With --json: indent (breaks single-line NDJSON piping)
  --plain               No ANSI / no clear
  --dry-run             Print resolved config and exit (no network)
  --max-runtime=SECS    Exit after SECS when looping
  --jitter-sec=N        Random 0..N seconds added to delay between polls
  --strict              Exit 1 if --path is set but JSON value is missing/undefined
  --help, -h

Why JSONL instead of SQLite: append + small full rewrites are microseconds for tens of rows;
no DB binary, no queries — ideal for dashboards and CI.

Env: PROBE_URL, PROBE_JSON_PATH, PROBE_INTERVAL_SEC, PROBE_HISTORY_PERSIST, PROBE_PRETTY, PROBE_DRY_RUN,
  PROBE_MAX_RUNTIME_SEC, PROBE_JITTER_SEC, PROBE_STRICT, PROBE_SLACK_WEBHOOK, NO_COLOR=1

Optional .env in cwd is loaded first (does not override existing variables).
`);
}

function parseProbeConfig(argv, env = process.env) {
  const config = {
    url: "",
    jsonPath: "",
    method: "GET",
    intervalMs: 60_000,
    historyLimit: 50,
    historyPersist: null,
    alertPct: null,
    once: false,
    json: false,
    plain: envTruthy(env.NO_COLOR),
    bodyJson: null,
    headersJson: null,
    logFile: path.join(process.cwd(), "probe_detective.log"),
    logEnabled: true,
    pretty: false,
    dryRun: false,
    maxRuntimeSec: null,
    jitterSec: 0,
    strict: false,
  };

  const u = env.PROBE_URL?.trim();
  if (u) config.url = u;
  const p = env.PROBE_JSON_PATH?.trim();
  if (p !== undefined && p !== "") config.jsonPath = p;
  const isec = env.PROBE_INTERVAL_SEC?.trim();
  if (isec) {
    const n = Number(isec);
    if (Number.isFinite(n) && n > 0) config.intervalMs = n * 1000;
  }
  const hp = env.PROBE_HISTORY_PERSIST?.trim();
  if (hp) {
    config.historyPersist = path.isAbsolute(hp) ? hp : path.join(process.cwd(), hp);
  }
  if (envTruthy(env.PROBE_PRETTY)) config.pretty = true;
  if (envTruthy(env.PROBE_DRY_RUN)) config.dryRun = true;
  const prm = env.PROBE_MAX_RUNTIME_SEC?.trim();
  if (prm) {
    const n = Number(prm);
    if (Number.isFinite(n) && n > 0) config.maxRuntimeSec = n;
  }
  const pj = env.PROBE_JITTER_SEC?.trim();
  if (pj) {
    const n = Number(pj);
    if (Number.isFinite(n) && n >= 0) config.jitterSec = n;
  }
  if (envTruthy(env.PROBE_STRICT)) config.strict = true;

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--url=")) {
      config.url = arg.slice("--url=".length).trim();
    } else if (arg.startsWith("--path=")) {
      config.jsonPath = arg.slice("--path=".length).trim();
    } else if (arg.startsWith("--method=")) {
      const m = arg.slice("--method=".length).trim().toUpperCase();
      if (m === "GET" || m === "POST") config.method = m;
    } else if (arg.startsWith("--body-json=")) {
      config.bodyJson = arg.slice("--body-json=".length).trim();
    } else if (arg.startsWith("--headers-json=")) {
      config.headersJson = arg.slice("--headers-json=".length).trim();
    } else if (arg.startsWith("--interval=")) {
      const n = Number(arg.slice("--interval=".length));
      if (Number.isFinite(n) && n > 0) config.intervalMs = n * 1000;
    } else if (arg.startsWith("--history=")) {
      const n = Number(arg.slice("--history=".length));
      if (Number.isInteger(n) && n > 0) config.historyLimit = n;
    } else if (arg.startsWith("--history-persist=")) {
      const pth = arg.slice("--history-persist=".length).trim();
      if (pth)
        config.historyPersist = path.isAbsolute(pth) ? pth : path.join(process.cwd(), pth);
    } else if (arg.startsWith("--alertPct=")) {
      const n = Number(arg.slice("--alertPct=".length));
      if (Number.isFinite(n) && n > 0) config.alertPct = n;
    } else if (arg.startsWith("--log=")) {
      const pth = arg.slice("--log=".length).trim();
      if (pth) config.logFile = path.isAbsolute(pth) ? pth : path.join(process.cwd(), pth);
    } else if (arg === "--no-log") {
      config.logEnabled = false;
    } else if (arg === "--once") {
      config.once = true;
    } else if (arg === "--json") {
      config.json = true;
    } else if (arg === "--plain") {
      config.plain = true;
    } else if (arg === "--pretty") {
      config.pretty = true;
    } else if (arg === "--dry-run") {
      config.dryRun = true;
    } else if (arg === "--strict") {
      config.strict = true;
    } else if (arg.startsWith("--max-runtime=")) {
      const n = Number(arg.slice("--max-runtime=".length));
      if (Number.isFinite(n) && n > 0) config.maxRuntimeSec = n;
    } else if (arg.startsWith("--jitter-sec=")) {
      const n = Number(arg.slice("--jitter-sec=".length));
      if (Number.isFinite(n) && n >= 0) config.jitterSec = n;
    }
  }

  return config;
}

export { parseProbeConfig };

function resolveBodyJson(spec) {
  if (spec == null || spec === "") return undefined;
  if (spec.startsWith("@")) {
    const fp = spec.slice(1);
    return fs.readFileSync(fp, "utf8");
  }
  return spec;
}

function loadHeadersFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const o = JSON.parse(raw);
  if (o == null || typeof o !== "object" || Array.isArray(o)) {
    throw new Error("headers-json must be a JSON object");
  }
  /** @type {Record<string, string>} */
  const h = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") {
      h[k] = v;
    }
  }
  return h;
}

async function fetchProbeOnce(cfg) {
  /** @type {Record<string, string>} */
  const headers = { Accept: "application/json" };
  if (cfg.headersJson) {
    const fp = path.isAbsolute(cfg.headersJson)
      ? cfg.headersJson
      : path.join(process.cwd(), cfg.headersJson);
    Object.assign(headers, loadHeadersFromFile(fp));
  }

  /** @type {RequestInit} */
  const init = { method: cfg.method, headers };

  if (cfg.method === "POST" && cfg.bodyJson) {
    const raw = resolveBodyJson(cfg.bodyJson);
    if (raw) {
      init.body = raw;
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  let lastErr = new Error("fetch failed");
  for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_DELAY_MS);
    }
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(cfg.url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(t);
      if (response.status === 429) {
        return { ok: false, rateLimited: true };
      }
      if (!response.ok) {
        if (shouldRetryHttpStatus(response.status) && attempt < FETCH_RETRIES - 1) {
          await response.arrayBuffer().catch(() => {});
          continue;
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const ct = response.headers.get("content-type") ?? "";
      if (!ct.toLowerCase().includes("application/json")) {
        throw new Error(`Expected JSON content-type, got ${ct || "(missing)"}`);
      }
      const data = await response.json();
      const value = cfg.jsonPath === "" ? data : getByJsonPath(data, cfg.jsonPath);
      if (cfg.jsonPath !== "" && value === undefined) {
        return { ok: false, missingValue: true };
      }
      return { ok: true, value, raw: data };
    } catch (e) {
      clearTimeout(t);
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt < FETCH_RETRIES - 1) {
        continue;
      }
      err(`PROBE FAILURE: ${lastErr.message}`);
      return { ok: false, rateLimited: false };
    }
  }
  err(`PROBE FAILURE: ${lastErr.message}`);
  return { ok: false, rateLimited: false };
}

function nextPollDelayMs(baseMs, jitterSec) {
  if (jitterSec == null || jitterSec <= 0) return baseMs;
  return baseMs + Math.floor(Math.random() * (jitterSec * 1000 + 1));
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const cfg = parseProbeConfig(argv);

  if (cfg.dryRun) {
    const slack = process.env.PROBE_SLACK_WEBHOOK?.trim();
    console.log(
      JSON.stringify(
        { ...cfg, slackWebhook: slack ? "<set>" : "" },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  if (!cfg.url) {
    err("Missing --url= (or PROBE_URL)");
    process.exit(1);
  }

  const PLAIN = cfg.plain;
  const COLORS = PLAIN
    ? { r: "", d: "", g: "", y: "", c: "" }
    : { r: "\x1b[0m", d: "\x1b[2m", g: "\x1b[32m", y: "\x1b[33m", c: "\x1b[36m" };

  /** @type {{ at: number; value: unknown }[]} */
  let history = [];
  if (cfg.historyPersist) {
    if (!isJsonlHistoryPath(cfg.historyPersist)) {
      err("Use .jsonl or .ndjson for --history-persist (fast line format). Example: ./probe_history.jsonl");
      process.exit(1);
    }
    history = readJsonlTail(
      cfg.historyPersist,
      cfg.historyLimit,
      (row) =>
        row != null &&
        typeof row === "object" &&
        typeof row.at === "number" &&
        "value" in row,
    ).map((row) => ({ at: row.at, value: row.value }));
  }

  let effectiveDelayMs = cfg.intervalMs;
  let pollTimer = null;
  let lastAlertAt = 0;
  const ALERT_COOLDOWN_MS = 5 * 60_000;

  const persistHistory = () => {
    if (!cfg.historyPersist) {
      return;
    }
    const slim = history.map((e) => ({ at: e.at, value: e.value }));
    writeJsonlRecords(cfg.historyPersist, slim);
  };

  const logLine = (rec) => {
    if (!cfg.logEnabled) {
      return;
    }
    fs.appendFile(cfg.logFile, JSON.stringify(rec) + "\n", (writeErr) => {
      if (writeErr) {
        err("Log write failed:", writeErr.message);
      }
    });
  };

  const tick = async () => {
    const result = await fetchProbeOnce(cfg);
    if (!result.ok) {
      if (result.missingValue) {
        err("JSON path missing or value is undefined");
        if (cfg.strict) {
          process.exit(1);
        }
        return false;
      }
      if (result.rateLimited) {
        effectiveDelayMs = Math.min(Math.max(effectiveDelayMs * 2, cfg.intervalMs), MAX_BACKOFF_MS);
        err(`${COLORS.d}429 backoff: next in ${Math.round(effectiveDelayMs / 1000)}s${COLORS.r}`);
      }
      return false;
    }

    effectiveDelayMs = cfg.intervalMs;
    const nowMs = Date.now();
    const { value } = result;
    history.push({ at: nowMs, value });
    if (history.length > cfg.historyLimit) {
      history.shift();
    }
    persistHistory();

    const prev = history.length >= 2 ? history[history.length - 2].value : undefined;
    let alertMsg = null;
    if (
      cfg.alertPct != null &&
      typeof value === "number" &&
      typeof prev === "number" &&
      prev !== 0
    ) {
      const pct = ((value - prev) / prev) * 100;
      if (Math.abs(pct) >= cfg.alertPct && nowMs - lastAlertAt >= ALERT_COOLDOWN_MS) {
        lastAlertAt = nowMs;
        alertMsg = `Value moved ${pct >= 0 ? "+" : ""}${pct.toFixed(4)}% (${prev} → ${value})`;
      }
    } else if (cfg.alertPct != null && prev !== undefined) {
      const a = stableStringify(value);
      const b = stableStringify(prev);
      if (a !== b && nowMs - lastAlertAt >= ALERT_COOLDOWN_MS) {
        lastAlertAt = nowMs;
        alertMsg = `Value changed: ${b.slice(0, 80)} → ${a.slice(0, 80)}`;
      }
    }

    const record = {
      at: new Date(nowMs).toISOString(),
      path: cfg.jsonPath || "(root)",
      value,
      alert: alertMsg,
    };

    const slackUrl = process.env.PROBE_SLACK_WEBHOOK?.trim();
    if (alertMsg && slackUrl) {
      postSlackIncoming(
        slackUrl,
        `*probe_detective* ${cfg.url}\n${alertMsg}\n\`${record.at}\``,
      ).catch((e) => err("Slack webhook failed:", e instanceof Error ? e.message : e));
    }

    if (cfg.json) {
      const space = cfg.pretty ? 2 : undefined;
      console.log(JSON.stringify(record, null, space));
    } else {
      if (!PLAIN) {
        console.clear();
      }
      console.log(`${COLORS.c}HTTP PROBE${COLORS.r}  ${COLORS.d}${cfg.url}${COLORS.r}`);
      console.log(`${COLORS.d}path: ${cfg.jsonPath || "(root)"}${COLORS.r}`);
      console.log(`${COLORS.d}time: ${record.at}${COLORS.r}`);
      console.log("---");
      console.log(typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : String(value));
      if (alertMsg) {
        console.log(`${COLORS.y}ALERT: ${alertMsg}${COLORS.r}`);
      }
      console.log("---");
      console.log(`${COLORS.d}Next in ${Math.round(effectiveDelayMs / 1000)}s${COLORS.r}`);
    }

    logLine(record);
    return true;
  };

  const ok = await tick();
  if (cfg.once) {
    process.exit(ok ? 0 : 1);
  }

  let maxRuntimeTimer = null;
  const shutdown = () => {
    if (pollTimer != null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (maxRuntimeTimer != null) {
      clearTimeout(maxRuntimeTimer);
      maxRuntimeTimer = null;
    }
    process.exit(0);
  };

  if (cfg.maxRuntimeSec != null && cfg.maxRuntimeSec > 0) {
    maxRuntimeTimer = setTimeout(() => shutdown(), cfg.maxRuntimeSec * 1000);
    maxRuntimeTimer.unref?.();
  }

  const pump = async () => {
    await tick();
    const waitMs = nextPollDelayMs(effectiveDelayMs, cfg.jitterSec);
    pollTimer = setTimeout(pump, waitMs);
  };
  pollTimer = setTimeout(pump, nextPollDelayMs(effectiveDelayMs, cfg.jitterSec));

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  main();
}
