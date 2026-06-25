// H7 (threat-model) regression: `constantTimeEquals` must route through node:crypto timingSafeEqual,
// never a short-circuiting `===`. This matters more than a normal crypto-hygiene nit because
// LLN-TYPE-013 actively tells authors to "Use constantTimeEquals() for equality" on secrets — so
// the compiler-recommended secret-equality path MUST actually be constant-time, or the advice is a
// trap. Two runtime dispatch paths (stdlib bare + cryptoModule) + the interpreter all share one
// helper now; this pins the helper's correctness and guards against a `===` regression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { constantTimeStringEquals } from "../dist/stdlib.js";

test("constantTimeStringEquals: equal strings → true", () => {
  assert.equal(constantTimeStringEquals("s3cr3t-token", "s3cr3t-token"), true);
});
test("constantTimeStringEquals: differing same-length strings → false", () => {
  assert.equal(constantTimeStringEquals("s3cr3t-token", "s3cr3t-toXen"), false);
});
test("constantTimeStringEquals: differing-length strings → false (length checked AFTER, not as an early short-circuit)", () => {
  assert.equal(constantTimeStringEquals("abc", "abcd"), false);
  assert.equal(constantTimeStringEquals("", "x"), false);
});
test("constantTimeStringEquals: empty vs empty → true", () => {
  assert.equal(constantTimeStringEquals("", ""), true);
});

test("H7 drift guard: the runtime constantTimeEquals paths route through the timing-safe helper, not `===`", () => {
  const stdlib = readFileSync(new URL("../src/stdlib.ts", import.meta.url), "utf8");
  const interp = readFileSync(new URL("../src/interpreter.ts", import.meta.url), "utf8");
  // Both stdlib dispatch paths (bare + cryptoModule) must call the helper.
  assert.ok(
    (stdlib.match(/constantTimeStringEquals\(/g) ?? []).length >= 2,
    "stdlib.ts must route both constantTimeEquals dispatch paths through constantTimeStringEquals",
  );
  // The interpreter's constantTimeEquals arm must NOT compare with a bare `secureComparable(...) === secureComparable(...)`.
  assert.doesNotMatch(
    interp,
    /secureComparable\([^)]*\)\s*===\s*secureComparable\(/,
    "interpreter.ts must not use a short-circuiting === for constantTimeEquals (H7 side-channel)",
  );
  assert.match(interp, /constantTimeStringEquals\(secureComparable/, "interpreter.ts must use the timing-safe helper");
});
