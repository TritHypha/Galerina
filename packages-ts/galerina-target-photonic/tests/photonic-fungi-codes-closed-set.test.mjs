import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  FUNGI_PHOTONIC_DIAGNOSTIC_CODES,
  PHOTONIC_DIAGNOSTIC_SCHEMA,
  decodePhotonicDiagnostic,
  isFungiPhotonicDiagnosticCode,
} from "../dist/index.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "index.ts");

function fungiRecord(code) {
  return {
    schema: PHOTONIC_DIAGNOSTIC_SCHEMA,
    code,
    severity: "error",
    message: "planning evidence",
  };
}

describe("FUNGI-PHOTONIC-001..006 closed set", () => {
  it("freezes exactly six tokens in numeric order", () => {
    assert.equal(Object.isFrozen(FUNGI_PHOTONIC_DIAGNOSTIC_CODES), true);
    assert.deepEqual([...FUNGI_PHOTONIC_DIAGNOSTIC_CODES], [
      "FUNGI-PHOTONIC-001",
      "FUNGI-PHOTONIC-002",
      "FUNGI-PHOTONIC-003",
      "FUNGI-PHOTONIC-004",
      "FUNGI-PHOTONIC-005",
      "FUNGI-PHOTONIC-006",
    ]);
  });

  it("refuses unknown and non-family codes", () => {
    for (const code of FUNGI_PHOTONIC_DIAGNOSTIC_CODES) {
      assert.equal(isFungiPhotonicDiagnosticCode(code), true);
    }
    assert.equal(isFungiPhotonicDiagnosticCode("FUNGI-PHOTONIC-007"), false);
    assert.equal(isFungiPhotonicDiagnosticCode("FUNGI-PHOTONIC-001 "), false);
    assert.equal(isFungiPhotonicDiagnosticCode("FUNGI-WASM-001"), false);
    assert.equal(isFungiPhotonicDiagnosticCode("Galerina_PHOTONIC_AMPLITUDE_INVALID"), false);
    assert.equal(isFungiPhotonicDiagnosticCode(""), false);
  });

  it("admits each closed-set code as a C10 record and is deterministic", () => {
    const first = FUNGI_PHOTONIC_DIAGNOSTIC_CODES.map((code) => decodePhotonicDiagnostic(fungiRecord(code)));
    const second = FUNGI_PHOTONIC_DIAGNOSTIC_CODES.map((code) => decodePhotonicDiagnostic(fungiRecord(code)));
    for (const decoded of first) {
      assert.equal(decoded.ok, true);
      if (decoded.ok) {
        assert.equal(Object.isFrozen(decoded.value), true);
        assert.equal(decoded.value.schema, PHOTONIC_DIAGNOSTIC_SCHEMA);
        assert.equal(isFungiPhotonicDiagnosticCode(decoded.value.code), true);
      }
    }
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });

  it("refuses unknown FUNGI-PHOTONIC codes on decode", () => {
    for (const code of ["FUNGI-PHOTONIC-007", "FUNGI-PHOTONIC-000", "FUNGI-PHOTONIC-001 "]) {
      const decoded = decodePhotonicDiagnostic(fungiRecord(code));
      assert.equal(decoded.ok, false);
      if (!decoded.ok) {
        assert.equal(decoded.diagnostic.code, "Galerina_PHOTONIC_DIAGNOSTIC_INVALID");
      }
    }
  });

  it("does not emit FUNGI-PHOTONIC-* from live Galerina_PHOTONIC_* helpers", () => {
    const source = readFileSync(SRC, "utf8");
    const fungi = [...source.matchAll(/FUNGI-PHOTONIC-[0-9]+/g)].map((m) => m[0]);
    assert.deepEqual([...new Set(fungi)], [...FUNGI_PHOTONIC_DIAGNOSTIC_CODES]);
    const live = [...source.matchAll(/Galerina_PHOTONIC_[A-Z0-9_]+/g)].map((m) => m[0]);
    assert.ok(live.includes("Galerina_PHOTONIC_DIAGNOSTIC_INVALID"));
    assert.equal(live.some((code) => code.startsWith("FUNGI-")), false);
  });
});
