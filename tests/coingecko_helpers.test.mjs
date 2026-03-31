import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCoinRow, shouldRetryHttpStatus } from "../crypto_detective.mjs";

test("shouldRetryHttpStatus", () => {
  assert.equal(shouldRetryHttpStatus(408), true);
  assert.equal(shouldRetryHttpStatus(425), true);
  assert.equal(shouldRetryHttpStatus(502), true);
  assert.equal(shouldRetryHttpStatus(503), true);
  assert.equal(shouldRetryHttpStatus(599), true);
  assert.equal(shouldRetryHttpStatus(429), false);
  assert.equal(shouldRetryHttpStatus(404), false);
  assert.equal(shouldRetryHttpStatus(200), false);
});

test("normalizeCoinRow: primary and includes", () => {
  const row = {
    usd: 100,
    eur: 90,
    usd_24h_change: -1.2,
    usd_market_cap: 1e12,
    usd_24h_vol: 1e9,
    last_updated_at: 1700000000,
  };
  const out = normalizeCoinRow(row, "bitcoin", "usd", ["usd", "eur"]);
  assert.equal(out.usd, 100);
  assert.equal(out.eur, 90);
  assert.equal(out.usd_24h_change, -1.2);
  assert.equal(out.last_updated_at, 1700000000);
});
