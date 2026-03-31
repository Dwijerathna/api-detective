import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { isJsonlHistoryPath, readJsonlTail, writeJsonlRecords } from "../lib/jsonl_history.mjs";

test("isJsonlHistoryPath", () => {
  assert.equal(isJsonlHistoryPath("/tmp/h.jsonl"), true);
  assert.equal(isJsonlHistoryPath("x.NDJSON"), true);
  assert.equal(isJsonlHistoryPath("data.json"), false);
});

test("writeJsonlRecords + readJsonlTail", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jl-"));
  const fp = path.join(dir, "h.jsonl");
  writeJsonlRecords(fp, [
    { at: 1, coins: { bitcoin: { usd: 1 } } },
    { at: 2, coins: { bitcoin: { usd: 2 } } },
    { at: 3, coins: { bitcoin: { usd: 3 } } },
  ]);
  const tail = readJsonlTail(fp, 2, (row) => typeof row?.at === "number" && row.coins != null);
  assert.equal(tail.length, 2);
  assert.equal(tail[0].at, 2);
  assert.equal(tail[1].at, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});
