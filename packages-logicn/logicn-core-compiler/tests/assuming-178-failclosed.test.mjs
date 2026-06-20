// #178 — cross-module assuming() proof-borrowing must FAIL CLOSED. A flow that borrows a proof
// obligation from a flow OUTSIDE its compilation unit cannot verify that proof here, and the admission
// gate does not yet enforce the external signature (DRCM Phase 5). So in production/deterministic it is
// an ERROR (fail-closed); in dev it stays a warning (separate-compilation iteration).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkEffects, verifyGovernance } from "../dist/index.js";

function gov(source, profile) {
  const p = parseProgram(source, "test.lln");
  const fx = checkEffects(p.flows, p.ast);
  return verifyGovernance(p.ast, p.flows, fx, profile);
}

// `externalValidator` is NOT declared in this unit → cross-module proof borrow → LLN-ASSUME-004.
const src = `flow useExternal(x: Int) -> Int
contract {
  intent { "Borrow a proof from an external validator flow." }
  assuming(externalValidator, "ensure x > 0") { }
}
{
  return x
}`;

const find = (g) => g.diagnostics.find((d) => d.code === "LLN-ASSUME-004");

describe("#178: cross-module assuming() is fail-closed in production", () => {
  it("ERROR in production (unverified cross-module proof borrow is fail-open → rejected)", () => {
    const d = find(gov(src, "production"));
    assert.ok(d, "LLN-ASSUME-004 emitted");
    assert.equal(d.severity, "error");
  });

  it("ERROR in deterministic too", () => {
    const d = find(gov(src, "deterministic"));
    assert.ok(d);
    assert.equal(d.severity, "error");
  });

  it("warning in dev (separate-compilation iteration — relies on the future Phase-5 admission check)", () => {
    const d = find(gov(src, "dev"));
    assert.ok(d);
    assert.equal(d.severity, "warning");
  });
});
