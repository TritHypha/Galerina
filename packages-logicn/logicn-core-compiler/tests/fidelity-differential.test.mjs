/**
 * 0014 Fidelity Differential Harness — slices 1-2: tree-walker ≡ bytecode-VM ≡ WASM, BYTE-EXACT.
 *
 * Owner decision (2026-06-18): WASM i32 is the semantic reference tier; all execution tiers must be
 * byte-identical. This is the foundational slice of the 0014 harness: it drives the same flow + input
 * through (a) the reference async tree-walker (executeFlow with NO pureFastPath) and (b) the fast
 * tier (executeFlow with { pureFastPath: true } → bytecode VM / sync fast-path), and asserts the
 * result is byte-identical — return value via Object.is (so a JS `-0` that diverges from `+0` is
 * CAUGHT) and traps by message. The corpus targets exactly the i32 edges hardened this cycle
 * (overflow / div0 / mod0 / the mul sqrt-boundary / INT32_MIN÷-1 / the -0 case).
 *
 * It doubles as the conformance lock for slices 1/3 (cfb72f9) + 2/3 (6542bae): if any future change
 * makes a tier diverge on these edges, this fails. Slice-2 (below) extends the differential to the
 * REAL WASM tier (.lln → WAT → wabt → #105 admission → instantiate), proving the same i32 conformance
 * end-to-end against the semantic reference. The full 6-component tuple (effect trace, taint/seal,
 * audit record, diagnostics) remains the next harness slice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, executeFlow, clearBytecodeCache } from "../dist/index.js";
import * as L from "../dist/index.js"; // WASM-tier path (assembleWAT / admitAndInstantiate / …) for slice-2

const MIN = -2147483648;
const MAX = 2147483647;
const int = (v) => ({ __tag: "int", value: v });
const argMap = (names, vals) => new Map(names.map((n, i) => [n, int(vals[i])]));

// Reference tier = tree-walker (no pureFastPath). Candidate tier = bytecode/sync fast-path.
const reference = (prog, flow, args) => executeFlow(flow, args, prog.ast, prog.flows);
const candidate = (prog, flow, args) =>
  executeFlow(flow, args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });

const show = (v) =>
  v.__tag === "runtimeError" ? `trap:${v.message}` : v.__tag === "int" ? `int:${v.value}` : v.__tag;

// [source, flowName, paramNames, [ [args…] … ]] — pure i32 flows over the hardened edge set.
// NOTE: each flow has a UNIQUE name. On the harness's first run a shared name ("f") exposed that the
// GLOBAL bytecode cache keys on flow name, so the fast tier reused the first "f"'s bytecode across
// later same-named flows from SEPARATE compilations (walker=7 vs fast=13 on a sub flow). Real programs
// can't trigger it (the symbol resolver forbids duplicate names), but the persistent cross-compilation
// cache is a real hygiene hazard — the 0014 design's `sourceTag` scoping is the fix. We use unique
// names + clearBytecodeCache() per entry so the differential tests the TIERS, not the cache.
const CORPUS = [
  ["pure flow fAdd(a: Int, b: Int) -> Int contract { effects {} } { return a + b }", "fAdd", ["a", "b"], [[2, 3], [MAX, 1], [MIN, -1]]],
  ["pure flow fSub(a: Int, b: Int) -> Int contract { effects {} } { return a - b }", "fSub", ["a", "b"], [[10, 3], [MIN, 1], [MAX, -1]]],
  ["pure flow fMul(a: Int, b: Int) -> Int contract { effects {} } { return a * b }", "fMul", ["a", "b"], [[6, 7], [46340, 46340], [46341, 46341], [MIN, -1]]],
  ["pure flow fDiv(a: Int, b: Int) -> Int contract { effects {} } { return a / b }", "fDiv", ["a", "b"], [[7, 2], [-1, 2], [10, 0], [MIN, -1]]],
  ["pure flow fMod(a: Int, b: Int) -> Int contract { effects {} } { return a % b }", "fMod", ["a", "b"], [[10, 3], [10, 0], [MIN, -1]]],
  ["pure flow fNeg(a: Int) -> Int contract { effects {} } { return 0 - a }", "fNeg", ["a"], [[5], [MIN]]],
];

test("0014 slice-1: tree-walker ≡ bytecode/fast tier, byte-exact (value + trap) over the i32 edges", async () => {
  for (const [src, flow, params, caseList] of CORPUS) {
    clearBytecodeCache(); // isolate each entry — see the NOTE above (cross-compilation cache hygiene)
    const prog = parseProgram(src, "fid.lln");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, `parse error in "${src}": ${errs.map((d) => d.message).join("; ")}`);
    for (const vals of caseList) {
      const args = argMap(params, vals);
      const ref = (await reference(prog, flow, args)).value;
      const cand = (await candidate(prog, flow, args)).value;
      const ctx = `flow=${flow} args=[${vals}] : walker=${show(ref)} fast=${show(cand)}`;
      // 1. same tag (a value-vs-trap divergence is a fidelity failure)
      assert.equal(ref.__tag, cand.__tag, `tier TAG divergence — ${ctx}`);
      // 2. byte-exact value via Object.is (catches a `-0` that === would hide)
      if (ref.__tag === "int") {
        assert.ok(Object.is(ref.value, cand.value), `tier VALUE divergence (incl. -0) — ${ctx}`);
      }
      // 3. identical trap kind
      if (ref.__tag === "runtimeError") {
        assert.equal(ref.message, cand.message, `tier TRAP divergence — ${ctx}`);
      }
    }
  }
});

// ── Slice 2: WASM tier ≡ reference walker (byte-exact value; trap ⟺ trap) ─────────────────────────
// Owner decision (2026-06-18): WASM i32 is the SEMANTIC REFERENCE tier. Slices 1/3 (cfb72f9) + 2/3
// (6542bae) made the walker + bytecode + WASM emitter conform on the i32 edges (checked add/sub/mul →
// trap on overflow; native i32.div_s/rem_s trap on /0 and INT32_MIN÷-1; INT32_MIN%-1 = 0, no trap).
// This slice PROVES that conformance end-to-end: it drives the SAME pure-i32 flows through the reference
// async tree-walker AND through real WASM (.lln → WAT → real-wabt → #105 Ed25519-attested admission →
// instantiate), asserting the WASM result is byte-identical to the walker. Trap MESSAGES legitimately
// differ across runtimes (walker "integer overflow" vs a WASM `unreachable`/`div_s` trap), so traps are
// compared by KIND (both trapped) and values by Object.is (catches a -0 that === would hide). This
// closes the WASM half of the cross-tier i32 conformance (X1 for these ops) at the artifact level.
const WASM_SRC = CORPUS.map(([src]) => src).join("\n");

test("0014 slice-2: WASM tier ≡ reference walker, byte-exact (value; trap⟺trap) over the i32 edges", async () => {
  const prog = parseProgram(WASM_SRC, "fid-wasm.lln");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse error: ${errs.map((d) => d.message).join("; ")}`);

  // .lln → WAT → real wabt module → #105 Ed25519-attested admission gate → instantiate (once, all flows).
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "fid", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `module assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem },
    host: L.createHostRuntime(),
  });

  for (const [, flow, params, caseList] of CORPUS) {
    assert.equal(typeof instance.exports[flow], "function", `WASM exports pure flow ${flow}`);
    for (const vals of caseList) {
      // reference tier = governed async tree-walker (the semantic conformance target)
      const ref = (await executeFlow(flow, argMap(params, vals), prog.ast, prog.flows)).value;
      const refTrap = ref.__tag === "runtimeError";
      // candidate tier = real WASM; an overflow / div0 / mod0 trap surfaces as a thrown RuntimeError on invoke
      let wasmTrap = false, wasmVal;
      try { wasmVal = instance.exports[flow](...vals); } catch { wasmTrap = true; }
      const ctx = `flow=${flow} args=[${vals}] : walker=${refTrap ? "trap" : "int:" + ref.value} wasm=${wasmTrap ? "trap" : "int:" + wasmVal}`;
      // 1. trap ⟺ trap (a value-vs-trap split is a fidelity failure)
      assert.equal(refTrap, wasmTrap, `tier TRAP/VALUE divergence — ${ctx}`);
      // 2. when both produce a value, byte-exact via Object.is (catches a -0 that === would hide)
      if (!refTrap) {
        assert.equal(ref.__tag, "int", `reference produced a non-int value — ${ctx}`);
        assert.ok(Object.is(ref.value, wasmVal), `WASM value divergence (incl. -0) — ${ctx}`);
      }
    }
  }
});
