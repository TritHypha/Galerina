/**
 * #164 — Result<T,E> match arms (Ok(v) / Err(e)) dispatch on the result handle's tag
 * and bind the unwrapped payload, in real WASM. Also covers guard `when` arms.
 *
 * A Result is an opaque registry handle; the lowering reads __result_tag (Ok→0/Err→1)
 * and __result_value (payload) to dispatch + bind. tokenize returns Result and every
 * parser flow matches on it, so this is a parser-parity prerequisite.
 * (Statement-form match only; expression-position `match` is parser gap #192.)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const PROGRAM = `
pure flow okPath(n: Int) -> Int {
  let r: Result<Int, Int> = Ok(n)
  match r {
    Ok(v) => return v + 1
    Err(e) => return 0 - e
  }
}

pure flow errPath(n: Int) -> Int {
  let r: Result<Int, Int> = Err(n)
  match r {
    Ok(v) => return v + 1
    Err(e) => return 100 + e
  }
}

pure flow grade(score: Int) -> Int {
  match score {
    when score >= 90 => return 4
    when score >= 80 => return 3
    when score >= 70 => return 2
    _ => return 0
  }
}
`;

async function instantiate() {
  const prog = L.parseProgram(PROGRAM, "result-match.spore");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "result-match", prog.ast, true));
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

describe("#164 Result Ok/Err match dispatch in WASM", () => {
  it("Ok(v) arm binds the unwrapped payload", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.okPath(5), 6, "Ok(5) → v=5 → v+1 = 6");
    assert.equal(inst.exports.okPath(41), 42, "Ok(41) → 42");
  });
  it("Err(e) arm binds the unwrapped payload", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.errPath(7), 107, "Err(7) → e=7 → 100+e = 107");
  });
});

describe("#164 guard `when` match arms in WASM", () => {
  it("ordered guard conditions select the first true arm", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.grade(95), 4, ">=90 → 4");
    assert.equal(inst.exports.grade(85), 3, ">=80 → 3");
    assert.equal(inst.exports.grade(72), 2, ">=70 → 2");
    assert.equal(inst.exports.grade(50), 0, "default → 0");
  });
});
