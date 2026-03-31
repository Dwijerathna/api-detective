// lib/coingecko_tick.mjs — CoinGecko simple/price + optional global/markets (shared by CLI and web UI).

const FETCH_RETRIES = 3;
const RETRY_DELAY_MS = 1_000;

/** HTTP statuses worth retrying (429 handled separately). */
export function shouldRetryHttpStatus(status) {
  return status === 408 || status === 425 || (status >= 500 && status <= 599);
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} id
 * @param {string} primaryVs
 * @param {string[]} allVs
 */
export function normalizeCoinRow(row, id, primaryVs, allVs) {
  const price = row[primaryVs];
  if (typeof price !== "number") {
    throw new Error(`Response JSON missing expected field: ${id}.${primaryVs}`);
  }
  /** @type {Record<string, number>} */
  const out = { [primaryVs]: price };
  for (const v of allVs) {
    if (v !== primaryVs && typeof row[v] === "number") {
      out[v] = row[v];
    }
  }
  const ch = `${primaryVs}_24h_change`;
  if (typeof row[ch] === "number") {
    out[ch] = row[ch];
  }
  const cap = `${primaryVs}_market_cap`;
  if (typeof row[cap] === "number") {
    out[cap] = row[cap];
  }
  const vol = `${primaryVs}_24h_vol`;
  if (typeof row[vol] === "number") {
    out[vol] = row[vol];
  }
  if (typeof row.last_updated_at === "number") {
    out.last_updated_at = row.last_updated_at;
  }
  return out;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function coingeckoHeaders() {
  /** @type {Record<string, string>} */
  const h = { Accept: "application/json" };
  const key =
    process.env.COINGECKO_API_KEY?.trim() ||
    process.env.CRYPTO_DETECTIVE_COINGECKO_API_KEY?.trim() ||
    process.env.COINGECKO_PRO_API_KEY?.trim();
  if (key) {
    h["x-cg-pro-api-key"] = key;
  }
  return h;
}

/**
 * @returns {Promise<{ kind: 'rate_limited' } | { kind: 'ok', response: Response } | { kind: 'fatal', error: Error }>}
 */
async function coingeckoRequest(url) {
  let lastError = new Error("request failed");
  for (let attempt = 0; attempt < FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_DELAY_MS);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: coingeckoHeaders(),
      });
      clearTimeout(timeoutId);
      if (response.status === 429) {
        return { kind: "rate_limited" };
      }
      if (shouldRetryHttpStatus(response.status) && attempt < FETCH_RETRIES - 1) {
        await response.arrayBuffer().catch(() => {});
        continue;
      }
      return { kind: "ok", response };
    } catch (e) {
      clearTimeout(timeoutId);
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < FETCH_RETRIES - 1) {
        continue;
      }
      return { kind: "fatal", error: lastError };
    }
  }
  return { kind: "fatal", error: lastError };
}

function buildSimplePriceUrl(coins, vsParam) {
  const params = new URLSearchParams({
    ids: coins.join(","),
    vs_currencies: vsParam,
    include_market_cap: "true",
    include_24hr_vol: "true",
    include_24hr_change: "true",
    include_last_updated_at: "true",
  });
  return `https://api.coingecko.com/api/v3/simple/price?${params.toString()}`;
}

async function fetchGlobalSummary() {
  const r = await coingeckoRequest("https://api.coingecko.com/api/v3/global");
  if (r.kind !== "ok" || !r.response.ok) {
    return null;
  }
  try {
    const j = await r.response.json();
    return j?.data ?? j ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string[]} coins
 * @param {string} primaryVs
 */
async function fetchCoinMarketsSummary(coins, primaryVs) {
  const params = new URLSearchParams({
    vs_currency: primaryVs,
    ids: coins.join(","),
    order: "market_cap_desc",
    per_page: String(Math.max(coins.length, 1)),
    page: "1",
    sparkline: "false",
  });
  const url = `https://api.coingecko.com/api/v3/coins/markets?${params.toString()}`;
  const r = await coingeckoRequest(url);
  if (r.kind !== "ok" || !r.response.ok) {
    return null;
  }
  try {
    const arr = await r.response.json();
    if (!Array.isArray(arr)) {
      return null;
    }
    /** @type {Record<string, { market_cap_rank?: number; image?: string; name?: string }>} */
    const map = {};
    const wanted = new Set(coins);
    for (const row of arr) {
      if (row && typeof row.id === "string" && wanted.has(row.id)) {
        map[row.id] = {
          market_cap_rank: typeof row.market_cap_rank === "number" ? row.market_cap_rank : undefined,
          image: typeof row.image === "string" ? row.image : undefined,
          name: typeof row.name === "string" ? row.name : undefined,
        };
      }
    }
    return map;
  } catch {
    return null;
  }
}

/**
 * @param {{ coins: string[]; vsCurrencies: string[]; withGlobal?: boolean; withMarkets?: boolean }} opts
 * @returns {Promise<
 *   | { ok: true; coins: Record<string, ReturnType<typeof normalizeCoinRow>>; global: unknown; markets: unknown }
 *   | { ok: false; rateLimited: true }
 *   | { ok: false; rateLimited: false; error: Error }
 * >}
 */
export async function fetchCoingeckoSnapshot(opts) {
  const { coins, vsCurrencies, withGlobal = false, withMarkets = false } = opts;
  if (coins.length === 0) {
    return { ok: false, rateLimited: false, error: new Error("No coins configured") };
  }
  const primaryVs = vsCurrencies[0].toLowerCase();
  const allVs = vsCurrencies.map((v) => v.toLowerCase());
  const vsParam = vsCurrencies.join(",");

  if (typeof fetch !== "function") {
    return {
      ok: false,
      rateLimited: false,
      error: new Error("Global fetch() is not available (Node 18+ required)"),
    };
  }

  try {
    const r = await coingeckoRequest(buildSimplePriceUrl(coins, vsParam));
    if (r.kind === "rate_limited") {
      return { ok: false, rateLimited: true };
    }
    if (r.kind === "fatal") {
      return { ok: false, rateLimited: false, error: r.error };
    }

    const response = r.response;
    if (!response.ok) {
      return {
        ok: false,
        rateLimited: false,
        error: new Error(`HTTP ${response.status} ${response.statusText}`),
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return {
        ok: false,
        rateLimited: false,
        error: new Error(`Unexpected content-type: ${contentType || "(missing)"}`),
      };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return { ok: false, rateLimited: false, error: new Error("Response was not valid JSON") };
    }

    /** @type {Record<string, ReturnType<typeof normalizeCoinRow>>} */
    const out = {};
    for (const id of coins) {
      out[id] = normalizeCoinRow(data[id], id, primaryVs, allVs);
    }

    let globalData = null;
    if (withGlobal) {
      globalData = await fetchGlobalSummary();
    }

    let markets = null;
    if (withMarkets) {
      markets = await fetchCoinMarketsSummary(coins, primaryVs);
    }

    return { ok: true, coins: out, global: globalData, markets };
  } catch (error) {
    const e = error instanceof Error ? error : new Error(String(error));
    return { ok: false, rateLimited: false, error: e };
  }
}
