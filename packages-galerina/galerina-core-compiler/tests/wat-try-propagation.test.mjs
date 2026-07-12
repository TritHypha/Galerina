/**
 * `expr?` — Rust-style error propagation lowered onto the Result ADT ABI, in real WASM.
 *
 * `let h = half(n)?` desugars to: evaluate the subject ONCE; if it is Err, early-return
 * the Err handle unchanged (the flow's own return type is that same Result<T,E>); if Ok,
 * bind h to the unwrapped payload and continue. Previously the emitter had no case for the
 * `errorPropagation` node, so every `?` fell through to the fail-closed `(unreachable)`
 * default and trapped at run time. This pins the lowering against the governed interpreter's
 * semantics (Err throws EarlyReturn(Err); Ok yields the value).
 *
 * The subject is a call (`half(n)`), so the "evaluate once" property matters — a naive
 * two-site lowering would call half twice. We assert on the observable Result either way;
 * the single-scratch lowering is what makes that sound.
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

pure flow tryChain(n: Int) -> Result<Int, String> {
  let h = half(n)?
  return Ok(h + 1)
}
`;

async function instantiate() {
  const prog = L.parseProgram(PROGRAM, "try-propagation.fungi");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "try-propagation", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, "module assembles: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  for (const { handle, value } of L.getInternedStrings()) host.seedString(handle, value);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  if (instance.exports.memory instanceof WebAssembly.Memory) host.bindMemory(instance.exports.memory);
  return { instance, host };
}

describe("`?` error propagation onto the Result ABI in WASM", () => {
  it("Ok subject: `?` unwraps and the flow continues (half(10)=Ok(5) -> Ok(6))", async () => {
    const { instance, host } = await instantiate();
    const r = host.readResult(instance.exports.tryChain(10));
    assert.equal(r.tag, "ok", "tryChain(10) is Ok");
    assert.equal(r.value, 6, "h=5 unwrapped, Ok(5+1)=Ok(6)");
  });

  it("Err subject: `?` early-returns the Err UNCHANGED — payload preserved, not swallowed", async () => {
    const { instance, host } = await instantiate();
    const r = host.readResult(instance.exports.tryChain(-4));
    assert.equal(r.tag, "err", "tryChain(-4) propagates Err (never reaches the Ok(h+1))");
    assert.equal(host.readString(r.value), "not positive", "the original Err payload rides through `?`");
  });
});
