// Append-friendly history: one JSON object per line (JSONL / NDJSON).
// Faster than SQLite for small rolling buffers: no DB engine, tiny O(n) rewrites with n = history limit.

import fs from "node:fs";

export function isJsonlHistoryPath(filePath) {
  return /\.(jsonl|ndjson)$/i.test(filePath);
}

/**
 * Read up to `limit` trailing records from a JSONL file.
 * @template T
 * @param {string} filePath
 * @param {number} limit
 * @param {(row: unknown) => row is T} [validate]
 * @returns {T[]}
 */
export function readJsonlTail(filePath, limit, validate) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split(/\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const slice = lines.slice(-limit);
  /** @type {T[]} */
  const out = [];
  for (const line of slice) {
    try {
      const row = JSON.parse(line);
      if (validate && !validate(row)) {
        continue;
      }
      out.push(row);
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

/**
 * Replace file with exactly these records (one JSON per line). Keeps files small when limit is capped in memory.
 * @param {string} filePath
 * @param {unknown[]} records
 */
export function writeJsonlRecords(filePath, records) {
  const text = records.map((r) => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : "");
  fs.writeFileSync(filePath, text, "utf8");
}
