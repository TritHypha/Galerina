/**
 * RD-0240 — a constructor match written as `Some(x) + _` or `Ok(v) + _` must route the
 * MISSING constructor side (None / Err) to the wildcard (`_`) arm, in real WASM.
 *
 * Regression guard. The Option sentinel dispatch and the Result tag dispatch each looked
 * up their two arms strictly BY NAME (None/Some, Ok/Err). With only `Some(x)` + `_`, the
 * None branch found no `None`-named arm and no fallback, so it was emitted EMPTY — the
 * subject fell through and the `out` local kept whatever it was initialised to. A silent
 * no-op is the statement form of the fail-OPEN that RD-0240 bans: the complement side of a
 * two-way ADT dispatch must never be a no-op. The fix falls the missing side to the match's
 * wildcard arm (`Some(x) + _` ⇒ `_` ≡ None; `Ok(v) + _` ⇒ `_` ≡ Err), and traps if neither
 * a named arm nor a wildcard is present (that is FUNGI-MATCH-001 non-exhaustive, upstream).
 *
 * The trap here: `out` is initialised to a THIRD value (7) distinct from both the
 * constructor-arm value and the wildcard value, so the pre-fix silent-skip (returns 7) is
 * distinguishable from the correct wildcard route (returns -9) — an init === wildcard test
 * would have passed even while broken.
 *
 * Statement-form only; expression-position `match` (`return match …` / `let x = match …`)
 * is parser gap #192 — the symmetric expression-path fix rides the same doctrine but is not
 * independently reachable from source yet.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const PROGRAM = `
pure flow half(n: Int) -> Result<Int, String> {
  if n > 0 {
    return Ok(n / 2)
  }
  return Err("not positive")
}

pure flow resOkWildcard(n: Int) -> Int {
  let r = half(n)
  mut out: Int = 7
  match r {
    Ok(v) => { out = v }
    _ => { out = 0 - 9 }
  }
  return out
}

pure flow optSomeWildcard(i: Int) -> Int {
  let xs = [10, 20, 30]
  let v = xs.get(i)
  mut out: Int = 7
  match v {
    Some(x) => { out = x }
    _ => { out = 0 - 9 }
  }
  return out
}
`;

async function instantiate() {
  const prog = L.parseProgram(PROGRAM, "match-wildcard-fallback.fungi");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "match-wildcard-fallback", prog.ast, true));
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

describe("RD-0240 Result `Ok(v) + _`: the wildcard supplies the Err branch", () => {
  it("Ok(v) binds the unwrapped payload", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.resOkWildcard(10), 5, "half(10)=Ok(5) → Ok(v) arm → out=v=5");
  });
  it("Err routes to `_` — NOT a silent skip of the init value", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.resOkWildcard(-4), -9,
      "half(-4)=Err → `_` arm → out=-9 (pre-fix bug: Err branch empty → out kept init 7)");
    assert.notEqual(inst.exports.resOkWildcard(-4), 7, "must not fall through to the init value");
  });
});

describe("RD-0240 Option `Some(x) + _`: the wildcard supplies the None branch", () => {
  it("Some(x) binds the unwrapped payload", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.optSomeWildcard(1), 20, "xs.get(1)=Some(20) → Some(x) arm → out=x=20");
  });
  it("None routes to `_` — NOT a silent skip of the init value", async () => {
    const inst = await instantiate();
    assert.equal(inst.exports.optSomeWildcard(9), -9,
      "xs.get(9)=None → `_` arm → out=-9 (pre-fix bug: None branch empty → out kept init 7)");
    assert.notEqual(inst.exports.optSomeWildcard(9), 7, "must not fall through to the init value");
  });
});
