// =============================================================================
// GENERIC_ARG_KINDS — type-argument position model
//
// checkTypeRef must recurse ONLY into a generic's TYPE-kind argument positions. A
// generic's non-type PAYLOAD — a Brand tag, a Tensor shape, a Vector/Matrix dimension,
// a Money currency — is NEVER a type reference and must not raise FUNGI-TYPE-001,
// whether written as a bare identifier, a named dimension, or a quoted tag.
//
// This locks in the declarative GENERIC_ARG_KINDS architecture so the Brand-tag (057)
// and Tensor-shape (401) false-positive class can never regress — the "architect around
// it" answer to per-case regex whack-a-mole. The final case proves a genuinely-undefined
// TYPE position is STILL caught, so the detector is not neutered.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../../dist/index.js";

function codesFor(source) {
  const parsed = parseProgram(source, "test.fungi");
  return checkTypes(parsed.ast).diagnostics.map((d) => d.code);
}

describe("GENERIC_ARG_KINDS: a non-type arg position never raises FUNGI-TYPE-001", () => {
  const clean = [
    ["Brand bare tag", `flow f(x: Brand<String, EmailTag>) -> String { return "ok" }`],
    ["Brand quoted tag", `flow f(x: Brand<String, "EmailTag">) -> String { return "ok" }`],
    ["Tensor numeric shape", `flow f(x: Tensor<Float32, [1, 128]>) -> String { return "ok" }`],
    ["Tensor named shape", `flow f(x: Tensor<Float32, [Batch, Features]>) -> String { return "ok" }`],
    ["Vector named dim", `flow f(x: Vector<Float32, N>) -> String { return "ok" }`],
    ["Matrix named dims", `flow f(x: Matrix<Float32, Rows, Cols>) -> String { return "ok" }`],
    ["Money currency tag", `flow f(x: Money<GBP>) -> String { return "ok" }`],
  ];
  for (const [name, src] of clean) {
    it(`${name} -> no FUNGI-TYPE-001`, () => {
      const codes = codesFor(src);
      assert.ok(
        !codes.includes("FUNGI-TYPE-001"),
        `unexpected FUNGI-TYPE-001 for ${name}: [${codes.join(", ")}]`,
      );
    });
  }

  it("a genuinely-undefined TYPE-position type is STILL caught (detector not neutered)", () => {
    const codes = codesFor(`flow f(x: Result<Int, MadeUpErrorXyz>) -> String { return "ok" }`);
    assert.ok(
      codes.includes("FUNGI-TYPE-001"),
      `expected FUNGI-TYPE-001 for MadeUpErrorXyz but got: [${codes.join(", ")}]`,
    );
  });
});
