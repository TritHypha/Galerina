// =============================================================================
// SPORE-PARSE-DEPTH-001 — parser stack-exhaustion guard (threat-model: parser DoS)
//
// The recursive-descent parser had no depth bound, so a tiny (~3KB) .spore of deeply
// nested expressions overflowed the host JS stack with an uncaught RangeError —
// crashing the whole compiler/embedder BEFORE any governance ran (untrusted .spore
// is parsed first). The compute-step/loop/call-depth caps bound the INTERPRETER,
// not the PARSER's host stack. The guard fails CLOSED: a clean diagnostic + an
// aborted parse, never a host crash. Must not false-trip on wide-but-shallow code.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram } from "../../dist/index.js";

const wrap = (body) => `pure flow main() -> Int contract { effects {} } { ${body} }`;
const errs = (p) => (p.diagnostics ?? []).filter((d) => d.severity === "error");
const hasDepth = (p) => (p.diagnostics ?? []).some((d) => d.code === "SPORE-PARSE-DEPTH-001");

test("deeply-nested parens emit SPORE-PARSE-DEPTH-001 instead of crashing the host", () => {
  let p;
  assert.doesNotThrow(() => {
    p = parseProgram(wrap("return " + "(".repeat(1600) + "1" + ")".repeat(1600)), "deep.spore");
  }, "must NOT throw a RangeError — fail-closed with a diagnostic");
  assert.ok(hasDepth(p), "expected SPORE-PARSE-DEPTH-001");
});

test("deeply-nested array literals also emit SPORE-PARSE-DEPTH-001 (no crash)", () => {
  let p;
  assert.doesNotThrow(() => {
    p = parseProgram(wrap("let a = " + "[".repeat(1200) + "1" + "]".repeat(1200) + "  return 0"), "arr.spore");
  });
  assert.ok(hasDepth(p), "expected SPORE-PARSE-DEPTH-001 for nested arrays");
});

test("deeply-nested STATEMENT BLOCKS emit SPORE-PARSE-DEPTH-001 (DevSecOps: the block-recursion vector)", () => {
  let body = "return 1";
  for (let i = 0; i < 4000; i++) body = `if true { ${body} }`;
  let p;
  assert.doesNotThrow(() => { p = parseProgram(wrap(body), "blocks.spore"); },
    "nested statement blocks must NOT throw a RangeError — the guard must cover block recursion too");
  assert.ok(hasDepth(p), "expected SPORE-PARSE-DEPTH-001 for nested blocks");
});

test("legit moderate BLOCK nesting (depth ~8) parses clean — no false depth-trip", () => {
  let body = "return 1";
  for (let i = 0; i < 8; i++) body = `if x > 0 { ${body} }`;
  const p = parseProgram(`pure flow main(x: Int) -> Int contract { effects {} } { ${body}  return 0 }`, "okblocks.spore");
  assert.equal(errs(p).length, 0, "moderate block nesting must parse with no errors");
});

test("legit moderate nesting (depth ~12) parses clean — no false depth-trip", () => {
  const p = parseProgram(wrap("return " + "(".repeat(12) + "1 + 2" + ")".repeat(12)), "ok.spore");
  assert.equal(errs(p).length, 0, "moderate nesting must parse with no errors");
  assert.ok(!hasDepth(p));
});

test("WIDE but shallow expression (500 siblings) does NOT trip the depth guard (counter balances)", () => {
  const wide = "let s: Int = " + Array.from({ length: 500 }, (_, i) => `(${i + 1})`).join(" + ") + "  return s";
  const p = parseProgram(wrap(wide), "wide.spore");
  assert.ok(!hasDepth(p), "a wide-but-shallow file must not false-trip the per-nesting-level depth guard");
});
