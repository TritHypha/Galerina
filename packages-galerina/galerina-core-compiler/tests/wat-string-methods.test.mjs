/**
 * #162 — host String methods (contains/startsWith/endsWith/indexOf/slice/trim/toUpper/
 * toLower) execute correctly in real WASM, mirroring src/stdlib.ts for byte-parity.
 *
 * `contains` is type-directed: String → __str_contains (substring), Array<String> →
 * __array_contains_str (by-value); these tests pin the String path. Input strings are
 * seeded into the host registry and passed by handle.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const PROGRAM = `
pure flow hasFlow(s: String) -> Bool { return s.contains("flow") }
pure flow startsView(s: String) -> Bool { return s.startsWith("view(") }
pure flow endsParen(s: String) -> Bool { return s.endsWith(")") }
pure flow idxOf(s: String) -> Int { return s.indexOf("x") }
pure flow midSlice(s: String) -> String { return s.slice(1, 4) }
pure flow upper(s: String) -> String { return s.toUpper() }
pure flow trimmed(s: String) -> String { return s.trim() }
`;

async function setup() {
  const prog = L.parseProgram(PROGRAM, "string-methods.spore");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "string-methods", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, "module assembles: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  // Seed the emitter's literal intern table at its exact handles so string literals
  // ("flow", "view(", …) inside the flows resolve to the right host-side strings.
  // Input strings are then interned AFTER it (host.internString appends at the tail).
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  return { instance, host };
}

describe("#162 host String methods in WASM", () => {
  it("contains / startsWith / endsWith (Bool results)", async () => {
    const { instance, host } = await setup();
    assert.equal(instance.exports.hasFlow(host.internString("pure flow add")), 1, "contains 'flow' → true");
    assert.equal(instance.exports.hasFlow(host.internString("let x = 1")), 0, "no 'flow' → false");
    assert.equal(instance.exports.startsView(host.internString("view(Net)")), 1, "startsWith 'view(' → true");
    assert.equal(instance.exports.startsView(host.internString("plain")), 0, "no prefix → false");
    assert.equal(instance.exports.endsParen(host.internString("f(x)")), 1, "endsWith ')' → true");
  });

  it("indexOf (Int result)", async () => {
    const { instance, host } = await setup();
    assert.equal(instance.exports.idxOf(host.internString("abxcd")), 2, "'x' at index 2");
    assert.equal(instance.exports.idxOf(host.internString("abcd")), -1, "absent → -1");
  });

  it("slice / toUpper / trim (String results, read back from the host registry)", async () => {
    const { instance, host } = await setup();
    assert.equal(host.readString(instance.exports.midSlice(host.internString("abcdef"))), "bcd", "slice(1,4)");
    assert.equal(host.readString(instance.exports.upper(host.internString("abc"))), "ABC", "toUpper");
    assert.equal(host.readString(instance.exports.trimmed(host.internString("  hi  "))), "hi", "trim");
  });
});
