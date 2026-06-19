/**
 * #128 part (b) / GAP-4 — real `forEachStmt` (for-in) WASM lowering.
 *
 * Until now a for-in loop lowered to a fail-closed `(unreachable)` trap in the WAT emitter
 * (correct but unrunnable). It now desugars to a counted loop over the host array bridge
 * (__array_length / __array_get), matching the Stage-A interpreter's `for item in list`.
 *
 * These tests prove the lowering is (a) structurally a real loop, (b) assembles to valid
 * WASM, (c) EXECUTES correctly against a host list, and (d) is byte-identical to the
 * reference tree-walker (the 0014 fidelity contract).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const SUM_LIST = `pure flow sumList(items: List<Int>) -> Int
contract { effects {} }
{ mut total = 0
  for x in items {
    total = total + x
  }
  return total }`;

function compileWAT(src) {
  const prog = L.parseProgram(src, "t.lln");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length) throw new Error("parse: " + errs.map((e) => e.message).join("; "));
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "forin", prog.ast, true));
}

async function instantiate(wat, host) {
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem },
    host,
  });
  return instance;
}

function hostListOf(host, nums) {
  const fn = host.imports.host;
  const arr = fn.__array_create();
  for (const n of nums) fn.__array_append(arr, n);
  return arr;
}

describe("#128/GAP-4: for-in lowers to a real WASM loop (no fail-closed trap)", () => {
  it("emits a counted loop using the host array bridge", () => {
    const wat = compileWAT(SUM_LIST);
    assert.ok(wat.includes("(loop $forin_loop_"), `for-in must lower to a real loop:\n${wat}`);
    assert.ok(wat.includes("$host___array_length"), "must call __array_length");
    assert.ok(wat.includes("$host___array_get"), "must call __array_get");
    assert.ok(!wat.includes("unsupported-in-WASM: forEachStmt"), "must NOT fall through to the fail-closed trap");
  });
});

describe("#128/GAP-4: for-in EXECUTES correctly and matches the interpreter", () => {
  it("sums a host list [1..5] = 15", async () => {
    const host = L.createHostRuntime();
    const arr = hostListOf(host, [1, 2, 3, 4, 5]);
    const instance = await instantiate(compileWAT(SUM_LIST), host);
    assert.equal(typeof instance.exports.sumList, "function", "exports sumList");
    assert.equal(instance.exports.sumList(arr), 15, "WASM for-in summed the host list");
  });

  it("empty list → 0 (loop body never runs, no trap)", async () => {
    const host = L.createHostRuntime();
    const arr = hostListOf(host, []);
    const instance = await instantiate(compileWAT(SUM_LIST), host);
    assert.equal(instance.exports.sumList(arr), 0, "empty list sums to 0");
  });

  it("WASM result is byte-identical to the reference tree-walker (0014 fidelity)", async () => {
    const nums = [7, 11, 13, 2, 100];
    const host = L.createHostRuntime();
    const arr = hostListOf(host, nums);
    const instance = await instantiate(compileWAT(SUM_LIST), host);
    const wasmVal = instance.exports.sumList(arr);

    const prog = L.parseProgram(SUM_LIST, "t.lln");
    const listVal = { __tag: "list", items: nums.map((v) => ({ __tag: "int", value: v })) };
    const ref = (await L.executeFlow("sumList", new Map([["items", listVal]]), prog.ast, prog.flows)).value;
    assert.equal(ref.__tag, "int", "interpreter produced an int");
    assert.ok(Object.is(ref.value, wasmVal), `WASM (${wasmVal}) must equal walker (${ref.value})`);
  });
});
