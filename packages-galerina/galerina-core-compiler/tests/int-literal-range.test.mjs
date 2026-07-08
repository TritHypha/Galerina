// =============================================================================
// FUNGI-TYPE-024 — i32 literal-range warning (RD-0277 §4)
//
// Galerina `Int` lowers to WASM i32. A decimal integer literal outside the i32
// range wraps SILENTLY in lowering (2654435761 -> -1640531535). The runtime
// overflow trap is the fail-closed backstop for COMPUTED overflow, but a
// constant that cannot be represented was silent — this surfaces it.
//
// WARNING (not error): a bare integer literal is also accepted in Float context
// (return 5 in a -> Float flow type-checks), so an error would false-reject a
// legitimate 2654435761-as-Float. Hex/bin/oct (Byte) and decimals (Float) are
// different lanes and skipped.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkTypes } from "../dist/index.js";

function ty024(ret, expr) {
  const p = parseProgram(
    `@version 1\npure flow f() -> ${ret}\ncontract { effects {} }\n{ return ${expr} }`,
    "t.fungi",
  );
  return checkTypes(p.ast).diagnostics.filter((d) => d.code === "FUNGI-TYPE-024");
}

describe("FUNGI-TYPE-024 i32 literal-range (RD-0277 §4)", () => {
  it("warns on the RD-0277 constant 2654435761 (> i32 max) used as Int", () => {
    const d = ty024("Int", "2654435761");
    assert.equal(d.length, 1, "a > i32 literal must be surfaced, not silent");
    assert.equal(d[0].severity, "warning");
  });

  it("warns on any decimal literal above i32 max", () => {
    assert.equal(ty024("Int", "3000000000")[0]?.severity, "warning");
    assert.equal(ty024("Int", "9999999999")[0]?.severity, "warning");
  });

  it("does NOT warn at the i32 max boundary (2147483647)", () => {
    assert.equal(ty024("Int", "2147483647").length, 0);
  });

  it("does NOT warn on small in-range literals", () => {
    assert.equal(ty024("Int", "100").length, 0);
    assert.equal(ty024("Int", "65535").length, 0);
  });

  it("does NOT warn on a Float literal (different lane)", () => {
    assert.equal(ty024("Float", "2654435761.0").length, 0);
  });

  it("does NOT warn on hex/Byte literals (different lane)", () => {
    assert.equal(ty024("Byte", "0xFFFFFFFF").length, 0);
  });

  it("is a WARNING, not an error — Float coercion is legal and the runtime trap is the hard backstop", () => {
    const d = ty024("Int", "2654435761");
    assert.equal(d[0].severity, "warning");
    assert.notEqual(d[0].severity, "error");
  });
});
