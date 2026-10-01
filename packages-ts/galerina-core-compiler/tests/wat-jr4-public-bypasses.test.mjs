// J-R4 — public WAT entry surface fail-closed.
// emitWATBody must not emit Phase-24A identity/default bodies (FUNGI-WAT-BODY-001).
// Public buildWATModule must apply the same schemaVersion + where-admission gates
// as buildWATModuleFromGIR (no skip).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseProgram,
  checkEffects,
  emitGIR,
  buildWATModule,
  emitWATBody,
  STDLIB_CAPABILITY_MAP,
} from "../dist/index.js";

const WHERE_SRC = `@version 1\npure flow gated(p: Int where all{}) -> Int { return p }`;
const PLAIN_SRC = `@version 1\npure flow plain(p: Int) -> Int { return p }`;

describe("J-R4 public emitWATBody identity/default bypass closed", () => {
  it("refuses local.get $p0 identity (FUNGI-WAT-BODY-001)", () => {
    assert.throws(
      () => emitWATBody({ steps: [{ kind: "return" }] }, 1),
      /FUNGI-WAT-BODY-001/,
    );
  });

  it("refuses i32.const 0 default (FUNGI-WAT-BODY-001)", () => {
    assert.throws(
      () => emitWATBody({ steps: [{ kind: "return" }] }, 0),
      /FUNGI-WAT-BODY-001/,
    );
  });

  it("capabilityCall still fail-closes with unreachable (not a guessed success body)", () => {
    const body = emitWATBody({ steps: [{ kind: "capabilityCall" }, { kind: "return" }] }, 1);
    assert.ok(body.includes("unreachable"), body);
    assert.ok(!body.includes("local.get $p0"), body);
  });
});

describe("J-R4 public buildWATModule schemaVersion + where-admission", () => {
  it("refuses missing schemaVersion (BK-4/A4 — no skip)", () => {
    const watInput = {
      flows: [{
        name: "identity",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: ["Int"],
        executionPlan: { steps: [{ kind: "return" }] },
      }],
      entryPoints: ["identity"],
    };
    assert.throws(
      () => buildWATModule(watInput, STDLIB_CAPABILITY_MAP),
      /MISSING GIR schemaVersion/,
    );
  });

  it("refuses unsupported schemaVersion", () => {
    const watInput = {
      schemaVersion: "fungi.gir.v0",
      flows: [{
        name: "identity",
        qualifier: "pure",
        declaredEffects: [],
        paramTypes: ["Int"],
      }],
      entryPoints: ["identity"],
    };
    assert.throws(
      () => buildWATModule(watInput, STDLIB_CAPABILITY_MAP),
      /unsupported GIR schemaVersion/,
    );
  });

  it("refuses a where-admission AST on the public entry (same gate as FromGIR)", () => {
    const parsed = parseProgram(WHERE_SRC, "t.fungi");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    assert.throws(
      () => buildWATModule({ ...gir.gir, ast: parsed.ast }, STDLIB_CAPABILITY_MAP),
      /parameter admission|BYPASS|0155/i,
    );
  });

  it("plain flow with fungi.gir.v1 + AST still lowers (narrow guard)", () => {
    const parsed = parseProgram(PLAIN_SRC, "t.fungi");
    const eff = checkEffects(parsed.flows, parsed.ast);
    const gir = emitGIR(parsed.ast, parsed.flows, eff);
    assert.doesNotThrow(
      () => buildWATModule({ ...gir.gir, ast: parsed.ast }, STDLIB_CAPABILITY_MAP),
    );
  });
});
