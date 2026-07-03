// gate-parser.test.mjs — §5a–5d increment 1: the `.gate` front-end parser.
// Proves (a) the declarative header (#gate / INTENT / EFFECTS) parses, (b) the parser returns the
// SAME ParseResult shape as parseProgram, and (c) it FAILS CLOSED on the not-yet-implemented FLOW
// lowering (FUNGI-GATELANG-002 error + zero flows) so a `.gate` build cannot mis-lower / silently sign.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGate, parseGateHeader, FUNGI_GATELANG_001, FUNGI_GATELANG_002 } from "../dist/index.js";

const VALID = [
  "#gate v0.4",
  'INTENT "Return one customer record for an authorised caller; PII is redacted before egress."',
  "EFFECTS { database.read, audit.write }",
  "PRIVACY deny protected CustomerId -> response.body",
  "FLOW:",
  "  [entry] -> [q:fu dbQuery] @database.read",
  "  [q:fu dbQuery] -> [logged:fu audit] @audit.write",
].join("\n");

const codesOf = (r) => r.diagnostics.map((d) => d.code);

test("gate-parser: header parses (intent + declared effects), whitespace/comments insignificant", () => {
  const h = parseGateHeader(VALID + "\n   # a trailing comment line\n");
  assert.equal(h.intent?.startsWith("Return one customer record"), true);
  assert.deepEqual([...h.effects], ["database.read", "audit.write"]);
  assert.equal(h.effectsDeclared, true);
  assert.equal(h.hasFlow, true);
});

test("gate-parser: parseGate returns the parseProgram-compatible ParseResult shape", () => {
  const r = parseGate(VALID, "customer.gate");
  assert.ok(r.ast && typeof r.ast.kind === "string", "has an AstNode root");
  assert.ok(Array.isArray(r.flows), "has flows[]");
  assert.ok(Array.isArray(r.diagnostics), "has diagnostics[]");
});

test("gate-parser: FAIL-CLOSED — a clean-header .gate refuses (FUNGI-GATELANG-002) with ZERO flows", () => {
  const r = parseGate(VALID, "customer.gate");
  assert.ok(codesOf(r).includes(FUNGI_GATELANG_002.code), "FLOW lowering not yet implemented ⇒ refuse");
  assert.equal(r.flows.length, 0, "no flows lowered ⇒ nothing downstream can mis-lower");
  assert.ok(r.diagnostics.some((d) => d.severity === "error"), "the refusal is an error, not a warning");
});

test("gate-parser: missing #gate pragma ⇒ FUNGI-GATELANG-001 (not a .gate file, refuse)", () => {
  const r = parseGate('INTENT "x"\nEFFECTS { }\n', "no-pragma.gate");
  assert.deepEqual(codesOf(r), [FUNGI_GATELANG_001.code]);
  assert.equal(r.flows.length, 0);
});

test("gate-parser: #gate present but INTENT missing ⇒ FUNGI-GATELANG-001", () => {
  const r = parseGate("#gate v0.4\nEFFECTS { database.read }\nFLOW:\n  [a] -> [b]\n", "no-intent.gate");
  assert.ok(codesOf(r).includes(FUNGI_GATELANG_001.code), "mandatory INTENT missing");
});

test("gate-parser: does NOT touch the .fungi parser — a .fungi source is NOT a valid .gate", () => {
  // A `.fungi` flow has no `#gate` pragma, so parseGate refuses it (the two front-ends are separate).
  const r = parseGate("secure flow main() -> Int contract { effects {} } { return 0 }", "main.fungi");
  assert.deepEqual(codesOf(r), [FUNGI_GATELANG_001.code]);
});
