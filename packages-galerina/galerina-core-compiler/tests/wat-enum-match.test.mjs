/**
 * #168 — enum-variant match arms dispatch on the declaration-order i32 tag in WASM.
 *
 * `match c { Red => …, Green => … }` must compare the subject against each variant's
 * tag (Red=0, Green=1, Blue=2), NOT against an interned-string id of the variant name.
 * Verified by compiling a small program to real WASM, executing through the #105 gate,
 * and asserting each variant routes to the right arm.
 *
 * Also pins the statement-path match-chain rewrite that #168 required: N-arm recursion
 * with balanced parens + one-liner (`Red => return 10`) arm bodies + a wildcard default
 * — the prior version dropped the 3rd+ arm and mis-emitted bare-statement arm bodies.
 * (Expression-position `match` — `return match …` / `let x = match …` — is a separate
 * parser gap not yet supported, so only the statement form is exercised here.)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const PROGRAM = `
enum Color { Red Green Blue }

pure flow rankStmt(c: Color) -> Int {
  match c {
    Red => return 10
    Green => return 20
    Blue => return 30
  }
}

pure flow rankDefault(c: Color) -> Int {
  match c {
    Red => return 100
    _ => return 999
  }
}
`;

async function instantiate() {
  const prog = L.parseProgram(PROGRAM, "enum-match.spore");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "enum-match", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, "module assembles: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  return instance;
}

describe("#168 enum-variant match dispatch in WASM (statement form)", () => {
  it("each variant tag routes to its arm (3-arm chain, one-liner bodies)", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.rankStmt(0), 10, "Red (tag 0) → 10");
    assert.equal(inst.exports.rankStmt(1), 20, "Green (tag 1) → 20");
    assert.equal(inst.exports.rankStmt(2), 30, "Blue (tag 2) → 30");
  });

  it("wildcard default arm catches the non-matching variants", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.rankDefault(0), 100, "Red → its arm");
    assert.equal(inst.exports.rankDefault(1), 999, "Green → default");
    assert.equal(inst.exports.rankDefault(2), 999, "Blue → default");
  });
});
