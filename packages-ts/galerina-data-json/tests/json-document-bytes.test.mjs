import assert from "node:assert/strict";
import { test } from "node:test";
import { parseJsonValue } from "../dist/json-value.js";

const memory = { maxDepth: 8, maxDocumentBytes: 10 };

test("a short ASCII JSON document is admitted under maxDocumentBytes", () => {
  const r = parseJsonValue("true", { memory });
  assert.equal(r.ok, true);
});

test("hostile: UTF-16 length under the ceiling still refuses oversize UTF-8", () => {
  const euros = `"${"€".repeat(4)}"`;
  assert.equal(euros.length <= 10, true);
  assert.equal(Buffer.byteLength(euros, "utf8") > 10, true);
  const r = parseJsonValue(euros, { memory });
  assert.equal(r.ok, false);
  assert.equal(r.diagnostic.code, "FUNGI-JSON-002");
});

test("two euro characters fit in 10 UTF-8 bytes including quotes", () => {
  const two = `"${"€".repeat(2)}"`;
  assert.equal(Buffer.byteLength(two, "utf8"), 8);
  const r = parseJsonValue(two, { memory });
  assert.equal(r.ok, true);
});
