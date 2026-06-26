// strict-key.test.mjs — certified mode rejects the all-zero development HMAC key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { StateSerializer } from "../dist/index.js";

function caught(fn) { try { fn(); return null; } catch (e) { return e; } }

test("StateSerializer strictKey rejects a missing/all-zero key", () => {
  const e1 = caught(() => new StateSerializer({ strictKey: true })); // no key
  assert.ok(e1); assert.match(String(e1.code ?? e1.message), /LSS-KEY-001/);
  const e2 = caught(() => new StateSerializer({ strictKey: true, hmacKey: new Uint8Array(32) })); // zeros
  assert.ok(e2); assert.match(String(e2.code ?? e2.message), /LSS-KEY-001/);
});

test("StateSerializer strictKey accepts a real key", () => {
  const key = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  assert.doesNotThrow(() => new StateSerializer({ strictKey: true, hmacKey: key }));
});

test("default (non-strict) still permits the dev key for local use", () => {
  assert.doesNotThrow(() => new StateSerializer());
});
