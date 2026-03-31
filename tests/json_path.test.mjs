import assert from "node:assert/strict";
import test from "node:test";
import { getByJsonPath } from "../lib/json_path.mjs";

test("getByJsonPath: nested and array index keys", () => {
  const obj = { a: { b: { c: 1 } }, items: { "0": { id: "x" } } };
  assert.equal(getByJsonPath(obj, "a.b.c"), 1);
  assert.equal(getByJsonPath(obj, "items.0.id"), "x");
  assert.equal(getByJsonPath(obj, ""), obj);
  assert.equal(getByJsonPath(obj, "missing"), undefined);
});
