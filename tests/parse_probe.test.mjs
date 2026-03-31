import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { parseProbeConfig } from "../probe_detective.mjs";

test("parseProbeConfig: defaults", () => {
  const c = parseProbeConfig([]);
  assert.equal(c.url, "");
  assert.equal(c.jsonPath, "");
  assert.equal(c.intervalMs, 60_000);
  assert.equal(c.once, false);
  assert.equal(c.json, false);
  assert.equal(c.pretty, false);
  assert.equal(c.dryRun, false);
  assert.equal(c.maxRuntimeSec, null);
  assert.equal(c.jitterSec, 0);
  assert.equal(c.strict, false);
  assert.equal(c.logFile, path.join(process.cwd(), "probe_detective.log"));
});

test("parseProbeConfig: flags", () => {
  const c = parseProbeConfig([
    "--url=https://x.test/",
    "--path=a.b",
    "--pretty",
    "--dry-run",
    "--strict",
    "--max-runtime=120",
    "--jitter-sec=3",
  ]);
  assert.equal(c.url, "https://x.test/");
  assert.equal(c.jsonPath, "a.b");
  assert.equal(c.pretty, true);
  assert.equal(c.dryRun, true);
  assert.equal(c.strict, true);
  assert.equal(c.maxRuntimeSec, 120);
  assert.equal(c.jitterSec, 3);
});

test("parseProbeConfig: env", () => {
  const c = parseProbeConfig([], {
    PROBE_URL: "https://env.test/",
    PROBE_PRETTY: "1",
    PROBE_DRY_RUN: "true",
    PROBE_MAX_RUNTIME_SEC: "90",
    PROBE_JITTER_SEC: "2",
    PROBE_STRICT: "yes",
  });
  assert.equal(c.url, "https://env.test/");
  assert.equal(c.pretty, true);
  assert.equal(c.dryRun, true);
  assert.equal(c.maxRuntimeSec, 90);
  assert.equal(c.jitterSec, 2);
  assert.equal(c.strict, true);
});
