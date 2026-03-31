// Optional .env in cwd — no dependency on dotenv. Does not override existing process.env.

import fs from "node:fs";
import path from "node:path";

/**
 * Load KEY=value pairs from `filePath`. Skips comments and blank lines.
 * @param {string} [filePath]
 */
export function loadDotEnv(filePath = path.join(process.cwd(), ".env")) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (t === "" || t.startsWith("#")) {
        continue;
      }
      const eq = t.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = t.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        continue;
      }
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
        (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    /* missing .env is fine */
  }
}
