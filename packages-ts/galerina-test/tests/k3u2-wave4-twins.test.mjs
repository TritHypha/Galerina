import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { executeFlow, parseProgram } from "../../galerina-core-compiler/dist/index.js";

// K3U2 (RD-0775 follow-up): trit 0 is the settled NEUTRAL value and is never UNKNOWN.
// Pins the wave-4 twins of three-valued-governance#asVerdict and #unknownDiagnostic.
const OVERLAY_ROOT = join(import.meta.dirname, "..", "src", "self-hosted", "conversion-overlays");
const int = (value) => ({ __tag: "int", value });
const bool = (value) => ({ __tag: "bool", value });
const string = (value) => ({ __tag: "string", value });

async function run(file, flow, entries) {
  const source = readFileSync(join(OVERLAY_ROOT, file), "utf8").replace(/^\uFEFF/u, "");
  const program = parseProgram(source, file);
  assert.deepEqual((program.diagnostics ?? []).filter((d) => d.severity === "error"), [], file);
  return (await executeFlow(flow, new Map(entries), program.ast, program.flows)).value;
}

// Native Verdict images are taken from the compiler, never written as literals.
async function nativeVerdict(member) {
  const source = "@version 1\npure flow k3u2Image(seed: Int) -> Verdict\ncontract { intent { \"image\" } }\n{\n  return Verdict." + member + "\n}\n";
  const program = parseProgram(source, "k3u2-image.fungi");
  return (await executeFlow("k3u2Image", new Map([["seed", int(0)]]), program.ast, program.flows)).value;
}

const ADMIT = ["numeric-verdict-admission.fungi", "numericVerdictAdmissionCore"];
const DIAG = ["indeterminate-diagnostic-action.fungi", "indeterminateDiagnosticActionCore"];

describe("K3U2 wave-4 twins: trit 0 is never UNKNOWN", () => {
  it("K3U2-W4-1 asVerdict twin admits 0 as NEUTRAL, never as native Verdict.Unknown", async () => {
    const out = await run(...ADMIT, [["value", int(0)]]);
    assert.deepEqual(out, string("neutral"));
    assert.notDeepEqual(out, await nativeVerdict("Unknown"));
  });

  it("K3U2-W4-2 asVerdict twin keeps the two decided trits", async () => {
    assert.deepEqual(await run(...ADMIT, [["value", int(1)]]), string("allow"));
    assert.deepEqual(await run(...ADMIT, [["value", int(-1)]]), string("deny"));
  });

  it("K3U2-W4-3 asVerdict twin refuses every non-trit (TS throws), including the native UNKNOWN sentinel -128", async () => {
    for (const junk of [2, -2, 127, -128, 1000000]) {
      assert.deepEqual(await run(...ADMIT, [["value", int(junk)]]), string("refuse"), String(junk));
    }
  });

  it("K3U2-W4-4 unknownDiagnostic twin emits only for UNKNOWN with an admitted code", async () => {
    const unknown = await nativeVerdict("Unknown");
    assert.deepEqual(await run(...DIAG, [["value", unknown], ["codePresent", bool(true)]]), string("emit"));
    assert.deepEqual(await run(...DIAG, [["value", unknown], ["codePresent", bool(false)]]), string("refuse"));
    for (const member of ["Allow", "Deny"]) {
      assert.deepEqual(await run(...DIAG, [["value", await nativeVerdict(member)], ["codePresent", bool(true)]]), string("none"), member);
    }
  });

  it("K3U2-W4-5 the bound TS source has asVerdict(0) as a trit and the renamed unknownDiagnostic", () => {
    const ts = readFileSync(join(import.meta.dirname, "..", "..", "galerina-tower-citizen", "src", "three-valued-governance.ts"), "utf8");
    assert.ok(ts.includes("function unknownDiagnostic("));
    assert.ok(!ts.includes("indeterminateDiagnostic"));
    assert.ok(ts.includes("if (t === -1 || t === 0 || t === 1) return t;"));
  });
});
