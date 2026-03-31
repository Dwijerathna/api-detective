// Dot-path access into JSON (e.g. "data.bitcoin.usd" or "items.0.name").

/**
 * @param {unknown} obj
 * @param {string} pathStr
 * @returns {unknown}
 */
export function getByJsonPath(obj, pathStr) {
  if (pathStr == null || pathStr === "") {
    return obj;
  }
  const parts = pathStr.split(".").filter((p) => p.length > 0);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") {
      return undefined;
    }
    cur = /** @type {Record<string, unknown>} */ (cur)[p];
  }
  return cur;
}
