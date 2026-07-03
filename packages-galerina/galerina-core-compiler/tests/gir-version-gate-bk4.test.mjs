/**
 * BK-4 (2026-07-03) — the GIR consumer must REJECT an unrecognised schemaVersion, never best-effort-parse.
 *
 * `fungi.gir.v1` is written by emitGIR but was never READ/checked by any consumer (the WAT emitter). A
 * future `fungi.gir.v2` (new fields/semantics) meeting a v1 emitter would be structurally best-effort-parsed
 * — the C++ "old tool eats new format" 50-year trap. buildWATModuleFromGIR now fails closed on an unknown version.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

describe("BK-4 GIR schemaVersion reject-on-unknown", () => {
  const emptyCaps = new Map();

  it("an unrecognised GIR schemaVersion is REJECTED (fail-closed)", () => {
    assert.throws(
      () => L.buildWATModuleFromGIR({ flows: [], entryPoints: [], schemaVersion: "fungi.gir.v2" }, emptyCaps, "wasm-standalone"),
      /unsupported GIR schemaVersion/,
      "a future/foreign GIR version must be refused, not best-effort-lowered",
    );
  });

  it("the current version fungi.gir.v1 is accepted", () => {
    assert.doesNotThrow(
      () => L.buildWATModuleFromGIR({ flows: [], entryPoints: [], schemaVersion: "fungi.gir.v1" }, emptyCaps, "wasm-standalone"),
    );
  });

  it("an absent schemaVersion (internal partial-GIR builder) is tolerated", () => {
    assert.doesNotThrow(
      () => L.buildWATModuleFromGIR({ flows: [], entryPoints: [] }, emptyCaps, "wasm-standalone"),
    );
  });
});
