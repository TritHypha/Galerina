// =============================================================================
// Leading UTF-8 BOM strip (docs/examples review: 18 examples failed SPORE-PARSE-001)
//
// 18 canonical example .spore files were saved with a leading UTF-8 BOM (EF BB BF /
// U+FEFF) by Windows editors. The lexer had no BOM strip, so it failed with
// "Unexpected character U+FEFF" at byte 0 — aborting the file before any intended
// diagnostic. The fix strips a BOM ONLY at the start (an interior U+FEFF is still
// flagged). Also pre-governance ingest hardening (untrusted .spore is lexed first).
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram } from "../../dist/index.js";

const BOM = "﻿";
const FLOW = `pure flow main() -> Int contract { effects {} } { return 42 }`;
const errs = (p) => (p.diagnostics ?? []).filter((d) => d.severity === "error");

test("a leading UTF-8 BOM is stripped — the file lexes clean", () => {
  const p = parseProgram(BOM + FLOW, "bom.spore");
  assert.equal(errs(p).length, 0, `BOM-prefixed source must parse clean, got: ${errs(p).map((d) => d.code).join(",")}`);
});

test("an INTERIOR U+FEFF is still flagged (BOM only meaningful at byte 0)", () => {
  const p = parseProgram(`pure flow main() -> Int contract { effects {} } { return ${BOM}42 }`, "int.spore");
  assert.ok(errs(p).length >= 1, "an interior U+FEFF must still be an error, not silently dropped");
});

test("a normal (BOM-free) source is unaffected", () => {
  const p = parseProgram(FLOW, "plain.spore");
  assert.equal(errs(p).length, 0);
});
