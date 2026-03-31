import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseCliConfig, pricesFromCoins } from "../crypto_detective.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("parseCliConfig: defaults", () => {
  const c = parseCliConfig([]);
  assert.deepEqual(c.coins, ["bitcoin", "ethereum", "solana", "dogecoin"]);
  assert.equal(c.pollIntervalMs, 60_000);
  assert.equal(c.alertOnMovePct, 0.25);
  assert.equal(c.alertCooldownMs, 5 * 60_000);
  assert.equal(c.historyLimit, 20);
  assert.equal(c.logFile, path.join(process.cwd(), "crypto_detective.log"));
  assert.equal(c.once, false);
  assert.equal(c.json, false);
  assert.equal(c.beep, true);
  assert.equal(c.logEnabled, true);
  assert.equal(c.plain, false);
  assert.deepEqual(c.vsCurrencies, ["usd"]);
  assert.equal(c.alert24hPct, null);
  assert.equal(c.withGlobal, false);
  assert.equal(c.withMarkets, false);
  assert.equal(c.notify, false);
  assert.equal(c.historyPersistPath, null);
  assert.deepEqual(c.perCoinAlertPct, {});
  assert.equal(c.pretty, false);
  assert.equal(c.dryRun, false);
  assert.equal(c.maxRuntimeSec, null);
  assert.equal(c.jitterSec, 0);
});

test("parseCliConfig: env overrides before argv", () => {
  const env = {
    CRYPTO_DETECTIVE_INTERVAL_SEC: "120",
    CRYPTO_DETECTIVE_NO_LOG: "1",
    CRYPTO_DETECTIVE_PLAIN: "true",
    CRYPTO_DETECTIVE_VS: "eur",
    CRYPTO_DETECTIVE_ALERT_24H_PCT: "3",
    CRYPTO_DETECTIVE_WITH_GLOBAL: "1",
  };
  const c = parseCliConfig(["--interval=60"], env);
  assert.equal(c.pollIntervalMs, 60_000);
  assert.equal(c.logEnabled, false);
  assert.equal(c.plain, true);
  assert.deepEqual(c.vsCurrencies, ["eur"]);
  assert.equal(c.alert24hPct, 3);
  assert.equal(c.withGlobal, true);
});

test("parseCliConfig: --no-log --plain --vs --alert24hPct --with-global", () => {
  const c = parseCliConfig([
    "--no-log",
    "--plain",
    "--vs=usd,eur",
    "--alert24hPct=5",
    "--with-global",
  ]);
  assert.equal(c.logEnabled, false);
  assert.equal(c.plain, true);
  assert.deepEqual(c.vsCurrencies, ["usd", "eur"]);
  assert.equal(c.alert24hPct, 5);
  assert.equal(c.withGlobal, true);
});

test("parseCliConfig: --alerts-json", () => {
  const fp = path.join(__dirname, "fixtures", "alerts.json");
  const c = parseCliConfig([`--alerts-json=${fp}`]);
  assert.equal(c.perCoinAlertPct.bitcoin, 2);
  assert.equal(c.perCoinAlertPct.ethereum, 1.5);
});

test("parseCliConfig: --alertPct-coin overrides file", () => {
  const fp = path.join(__dirname, "fixtures", "alerts.json");
  const c = parseCliConfig([`--alerts-json=${fp}`, "--alertPct-bitcoin=9"]);
  assert.equal(c.perCoinAlertPct.bitcoin, 9);
  assert.equal(c.perCoinAlertPct.ethereum, 1.5);
});

test("parseCliConfig: --with-markets --notify --history-persist", () => {
  const p = path.join(process.cwd(), "tmp_hist.json");
  const c = parseCliConfig(["--with-markets", "--notify", `--history-persist=${p}`]);
  assert.equal(c.withMarkets, true);
  assert.equal(c.notify, true);
  assert.equal(c.historyPersistPath, p);
});

test("parseCliConfig: --coins", () => {
  const c = parseCliConfig(["--coins=bitcoin,ethereum"]);
  assert.deepEqual(c.coins, ["bitcoin", "ethereum"]);
});

test("parseCliConfig: --interval seconds to ms", () => {
  const c = parseCliConfig(["--interval=30"]);
  assert.equal(c.pollIntervalMs, 30_000);
});

test("parseCliConfig: --log relative path joins cwd", () => {
  const c = parseCliConfig(["--log=custom.log"]);
  assert.equal(c.logFile, path.join(process.cwd(), "custom.log"));
});

test("parseCliConfig: --log absolute path preserved", () => {
  const abs = path.join(process.cwd(), "abs", "out.log");
  const c = parseCliConfig([`--log=${abs}`]);
  assert.equal(c.logFile, abs);
});

test("parseCliConfig: --once", () => {
  const c = parseCliConfig(["--once"]);
  assert.equal(c.once, true);
});

test("parseCliConfig: --json", () => {
  const c = parseCliConfig(["--json"]);
  assert.equal(c.json, true);
});

test("parseCliConfig: --no-beep", () => {
  const c = parseCliConfig(["--no-beep"]);
  assert.equal(c.beep, false);
});

test("pricesFromCoins: flat usd map", () => {
  const coins = {
    bitcoin: { usd: 50_000, usd_24h_change: 1.5 },
    ethereum: { usd: 3000 },
  };
  assert.deepEqual(pricesFromCoins(coins), { bitcoin: 50_000, ethereum: 3000 });
});

test("pricesFromCoins: primary vs", () => {
  const coins = {
    bitcoin: { eur: 45_000, usd: 50_000 },
  };
  assert.deepEqual(pricesFromCoins(coins, "eur"), { bitcoin: 45_000 });
});
