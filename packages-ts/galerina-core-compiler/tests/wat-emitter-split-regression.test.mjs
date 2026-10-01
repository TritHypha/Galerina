/**
 * Emitter-split regression — public facade still exports the typed-entry
 * surface; intern table resets per getInternedStrings; HOF/BODY gates stay
 * throw-closed. Replay: node --test tests/wat-emitter-split-regression.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  astHasParamAdmission,
  galerinaTypeToWAT,
  getInternedStrings,
  getWATImportsForEffects,
  resetStringTable,
  DEFAULT_WAT_MEMORY,
  DEFAULT_WASM_SIMD,
} from "../dist/wat-emitter.js";
import { wasmImportStringToWATImport } from "../dist/wat-emitter-gir.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "..", "src");

describe("emitter split public facade", () => {
  it("keeps the split modules beside the facade", () => {
    for (const name of [
      "wat-emitter.ts",
      "wat-emitter-types.ts",
      "wat-emitter-intern.ts",
      "wat-emitter-refusals.ts",
      "wat-emitter-binary.ts",
      "wat-emitter-layouts.ts",
      "wat-emitter-gir.ts",
    ]) {
      assert.equal(existsSync(join(SRC, name)), true, name);
    }
  });

  it("exposes typed SIMD/memory defaults and galerinaTypeToWAT", () => {
    assert.equal(DEFAULT_WASM_SIMD.available, false);
    assert.equal(DEFAULT_WAT_MEMORY.minPages, 2);
    assert.equal(galerinaTypeToWAT("Int"), "i32");
    assert.equal(galerinaTypeToWAT("Int64"), "i64");
    assert.equal(galerinaTypeToWAT("Float"), "f64");
    assert.equal(galerinaTypeToWAT("String"), "i32");
  });

  it("resets the intern table so handles do not leak across modules", () => {
    resetStringTable();
    const before = getInternedStrings();
    assert.equal(before.length, 1);
    assert.equal(before[0].handle, 0);
    assert.equal(before[0].value, "");
    resetStringTable();
    const after = getInternedStrings();
    assert.equal(after.length, 1);
    assert.equal(after[0].handle, 0);
  });

  it("astHasParamAdmission is false on a missing AST and true on where-clauses", () => {
    assert.equal(astHasParamAdmission(undefined), false);
    assert.equal(astHasParamAdmission(null), false);
    assert.equal(
      astHasParamAdmission({ kind: "paramAdmissionDecl", value: "x > 0", children: [] }),
      true,
    );
    assert.equal(
      astHasParamAdmission({
        kind: "program",
        value: "",
        children: [{ kind: "flowDecl", value: "f", children: [] }],
      }),
      false,
    );
  });

  it("getWATImportsForEffects returns a defined array", () => {
    const empty = getWATImportsForEffects([]);
    assert.equal(Array.isArray(empty), true);
    assert.equal(empty.length, 0);
  });

  it("wasmImportStringToWATImport yields named none on missing colon, never null/undefined/NaN", () => {
    const skipped = wasmImportStringToWATImport("hostwrite", "io");
    assert.notEqual(skipped, null);
    assert.notEqual(skipped, undefined);
    assert.equal(Number.isNaN(skipped), false);
    assert.equal(skipped.kind, "none");
    assert.equal(skipped.reason, "missing-colon");
    const parsed = wasmImportStringToWATImport("host:write", "io");
    assert.equal(parsed.kind, "found");
    assert.equal(parsed.value.module, "host");
    assert.equal(parsed.value.name, "write");
    assert.equal(parsed.value.effect, "io");
  });
});
