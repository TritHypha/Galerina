/**
 * #163 — `#record-update` (`{ ...base, field: v }`) lowers to a real linear-memory copy
 * in WASM: bump-allocate a fresh record of the base's type, copy ALL base slots, then
 * overwrite the named update fields. Previously it returned a silent null handle.
 *
 * The flows build the record internally and return an Int that encodes the resulting
 * field values (x*100 + y*10 + z), so a direct numeric WASM call verifies both that the
 * updated field changed AND that the untouched fields were copied from the base.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const PROGRAM = `
record Point { x: Int, y: Int, z: Int }

pure flow updateX(a: Int, b: Int, c: Int, nx: Int) -> Int {
  let p: Point = Point { x: a, y: b, z: c }
  let q: Point = { ...p, x: nx }
  return q.x * 100 + q.y * 10 + q.z
}

pure flow updateY(a: Int, b: Int, c: Int, ny: Int) -> Int {
  let p: Point = Point { x: a, y: b, z: c }
  let q: Point = { ...p, y: ny }
  return q.x * 100 + q.y * 10 + q.z
}

pure flow updateZ(a: Int, b: Int, c: Int, nz: Int) -> Int {
  let p: Point = Point { x: a, y: b, z: c }
  let q: Point = { ...p, z: nz }
  return q.x * 100 + q.y * 10 + q.z
}

pure flow baseUnchanged(a: Int, b: Int, c: Int, nx: Int) -> Int {
  let p: Point = Point { x: a, y: b, z: c }
  let q: Point = { ...p, x: nx }
  return p.x * 100 + p.y * 10 + p.z
}
`;

async function instantiate() {
  const prog = L.parseProgram(PROGRAM, "record-update.spore");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "record-update", prog.ast, true));
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

describe("#163 #record-update lowering in WASM", () => {
  it("overwrites the updated field and copies the rest (each slot position)", async () => {
    const inst = await instantiate();
    // base {1,2,3}; updateX→9 ⇒ {9,2,3} = 923 (x changed, y/z copied)
    assert.equal(inst.exports.updateX(1, 2, 3, 9), 923, "x overwritten, y+z copied");
    // updateY→7 ⇒ {1,7,3} = 173 (middle slot)
    assert.equal(inst.exports.updateY(1, 2, 3, 7), 173, "y overwritten, x+z copied");
    // updateZ→8 ⇒ {1,2,8} = 128 (last slot)
    assert.equal(inst.exports.updateZ(1, 2, 3, 8), 128, "z overwritten, x+y copied");
  });

  it("the base record is not mutated by the update (fresh allocation)", async () => {
    const inst = await instantiate();
    // p2 = {...p, x:9} must NOT change p; p stays {1,2,3} = 123
    assert.equal(inst.exports.baseUnchanged(1, 2, 3, 9), 123, "base record unchanged");
  });
});
