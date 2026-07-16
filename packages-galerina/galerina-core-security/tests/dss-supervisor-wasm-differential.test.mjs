// dss-supervisor-wasm-differential.test.mjs — the DSS.wasm supervisor's DECISION CORE executes,
// and its verdicts are proven EQUAL to Stage-A (the interpreter) over the V_DPM matrix.
//
// The supervisor import-DAG bundle now builds to real WASM in-batch (10/10 — the 2026-07-16
// wabt-isolation + partial-lowering fixes). This gate takes the next rung, the same ladder every
// RD-0361 twin climbed:
//   R0  the supervisor bundle `galerina build`s to a real, signable WASM (deterministic in-batch).
//   R1  that WASM is signed + admitted through the attestation-first #105 gate + instantiated.
//   R3  FAIL-CLOSED DIFFERENTIAL: over a V_DPM state × effect matrix (~400 points), every WASM
//       verdict EQUALS the Stage-A interpreter's verdict on the SAME bundle source — the
//       concatenated-twins oracle (#56 pattern). Results compare as u32 (bit 31 = emergency_mode
//       makes i32 sign representation an artifact, the INT32_MIN class).
//   LAWS asserted on the WASM outputs directly (not just agreement):
//       · topology-first — without dag_edge_valid (bit 8) NO effect is permitted, ever
//       · monotonicity  — transitions may only CLEAR capability bits; the only settable bits
//         are the containment flags (bit 30 quarantine_engaged, bit 31 emergency_mode)
//       · unknown effects map to 0 (no capability granted — deny-by-default)
//
// Nothing here is authoritative: the supervisor's runtime role stays design-stage until the real
// Wasmtime TCB (#102-106, post-v1) and the R4 authority flip (#143, owner-gated). This proves the
// decision core is EXECUTABLE and FAITHFUL — a feasibility+fidelity gate, not an isolation claim.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const DSS = join(HERE, "..", "src", "dss");

// ── the gate's import-DAG bundler (deps-before-dependents, imports stripped) ──
const read = (p) => { const s = readFileSync(p, "utf8"); return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; };
const importsOf = (src) => [...src.matchAll(/^\s*import\s+"([^"]+)"\s*$/gm)].map((m) => m[1]);
function bundleFor(entryAbs) {
  const seen = new Set(), order = [];
  (function load(abs) {
    const key = resolve(abs);
    if (seen.has(key) || !existsSync(key)) return;
    seen.add(key);
    const src = read(key);
    for (const spec of importsOf(src)) load(join(dirname(key), spec));
    order.push(src);
  })(entryAbs);
  const strip = (s) => s.replace(/^\s*import\s+"[^"]+"\s*$/gm, "").replace(/^@version\s+\d+\s*$/gm, "");
  return "@version 1\n" + order.map(strip).join("\n\n");
}

// u32 view — bit 31 (emergency_mode) makes signedness an encoding artifact, not a semantic.
const u32 = (v) => Number(BigInt.asUintN(32, BigInt(v)));

// V_DPM bit constants (mirrors vdpm.fungi's bitfield — used for matrix construction + laws).
const BIT = { dag: 1 << 8, quarantine: 2 ** 30, emergency: 2 ** 31 };
const INITIAL = 15728895; // VDPM_INITIAL_CAPABILITIES (bits 0-7 + 20-23)

const VDPM_STATES = [
  0,                          // nothing
  BIT.dag,                    // topology only, no capabilities
  1,                          // network cap WITHOUT dag (topology-first must refuse)
  BIT.dag + 1,                // dag + network
  BIT.dag + 35,               // dag + the circuit-breaker trio (network, storage, ai)
  INITIAL,                    // all caps, NO dag
  INITIAL + BIT.dag,          // the real post-admission posture
  BIT.dag + BIT.quarantine,   // quarantined, dag still marked
  BIT.dag + BIT.emergency + 1,// emergency posture with a stray cap bit
  BIT.quarantine + BIT.emergency, // both containment flags
  4279230464,                 // the keep_mask itself as a state (phase+reserved+flags region)
  4294967295,                 // every bit set
];

const EFFECTS = [
  "network.outbound", "storage.write", "secret.access", "audit.write",
  "database.write", "ai.inference", "shell.execute", "native.call",
  "payment.charge", "pii.read", "phi.read", "phi.write",
  "unknown.effect", "", // deny-by-default probes
];

test("DSS supervisor · V_DPM decision core: R0 build → R1 #105-admit → R3 WASM ≡ Stage-A interpreter (+ laws)", async () => {
  assert.ok(existsSync(COMPILER), "galerina-core-compiler dist not built — run the full suite before this gate");
  const L = await import(pathToFileURL(COMPILER).href);

  // ── R0 · the supervisor import-DAG bundle builds to real WASM ──
  const source = bundleFor(join(DSS, "dss-supervisor.fungi"));
  const prog = L.parseProgram(source, "dss-supervisor.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "supervisor bundle parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "dss-supervisor", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `supervisor bundle assembles to real WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + admit through the attestation-first #105 gate, then instantiate ──
  // The bundle's effectful flows declare `audit.write`, so its import table carries a host
  // effect import. Admission is deny-by-default: it links ONLY because this test explicitly
  // GRANTS a handler for exactly that effect (createHostRuntime grants) — and the law below
  // asserts the pure decision core never actually invokes it (zero effect calls).
  const effectCalls = [];
  const grant = (name) => (a, b) => { effectCalls.push([name, a, b]); return 0; };
  const host = L.createHostRuntime(undefined, {
    effectHandlers: { "audit.write": grant("audit.write"), "audit.log": grant("audit.log") },
  });
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  const X = instance.exports;
  for (const f of ["capability_to_bitmask", "vdpm_check", "isCapabilityPermitted", "vdpm_apply_circuit_breaker", "vdpm_enter_quarantine", "vdpm_enter_emergency"]) {
    assert.equal(typeof X[f], "function", `${f} admitted + exported (R1)`);
  }

  // ── Stage-A oracle: the interpreter runs the SAME bundle source ──
  const I = (n) => ({ __tag: "int", value: n });
  const S = (s) => ({ __tag: "string", value: s });
  async function interp(flowName, args) {
    const r = await L.executeFlow(flowName, new Map(args), prog.ast, prog.flows);
    const v = r.value;
    if (v?.__tag === "bool") return v.value ? 1 : 0;
    if (v?.__tag === "int") return u32(v.value);
    throw new Error(`interpreter returned unexpected value shape for ${flowName}: ${JSON.stringify(v)}`);
  }
  const wasmStr = (s) => host.internString(s); // string ARG → interned handle (identity compare)

  let points = 0;
  const agree = async (label, interpVal, wasmVal) => {
    assert.equal(u32(wasmVal), interpVal, `${label}: WASM(u32 ${u32(wasmVal)}) must equal interpreter(u32 ${interpVal})`);
    points++;
  };

  // ── R3 · effect→bitmask (string-ARG flows), full effect vocabulary ──
  for (const eff of EFFECTS) {
    await agree(`capability_to_bitmask("${eff}")`,
      await interp("capability_to_bitmask", [["effect", S(eff)]]),
      X.capability_to_bitmask(wasmStr(eff)));
  }

  // ── R3 · the checks (state × effect matrix) ──
  for (const vdpm of VDPM_STATES) {
    for (const eff of EFFECTS) {
      await agree(`vdpm_check(${vdpm}, "${eff}")`,
        await interp("vdpm_check", [["vdpm", I(vdpm)], ["effect", S(eff)]]),
        X.vdpm_check(vdpm, wasmStr(eff)));
      await agree(`isCapabilityPermitted(${vdpm}, "${eff}")`,
        await interp("isCapabilityPermitted", [["vdpm", I(vdpm)], ["effect", S(eff)]]),
        X.isCapabilityPermitted(vdpm, wasmStr(eff)));
    }
  }

  // ── R3 · the containment transitions (int→int flows) ──
  for (const vdpm of VDPM_STATES) {
    for (const f of ["vdpm_apply_circuit_breaker", "vdpm_enter_quarantine", "vdpm_enter_emergency"]) {
      await agree(`${f}(${vdpm})`, await interp(f, [["vdpm", I(vdpm)]]), X[f](vdpm));
    }
  }
  // 14 bitmask + (12 states × 14 effects × 2 check flows) + (12 states × 3 transitions) = 386.
  assert.ok(points >= 380, `differential coverage is real (${points} agreement points)`);

  // ── LAWS on the WASM outputs directly ──
  // 1. topology-first: without dag_edge_valid nothing is permitted, even with every cap bit set.
  for (const eff of EFFECTS) {
    assert.equal(X.vdpm_check(INITIAL, wasmStr(eff)), 0, `topology-first: vdpm_check(INITIAL w/o dag, "${eff}") must refuse`);
  }
  // 2. monotonicity: a transition may only CLEAR bits; the ONLY settable bits are the containment
  //    flags. Bit math in BigInt space — JS `&`/`~` coerce to SIGNED i32, which mangles bit 31
  //    (the exact sign-representation class the u32 view exists to avoid).
  const b32 = (x) => BigInt.asUintN(32, BigInt(x));
  const MASK32 = 0xFFFFFFFFn;
  const SETTABLE = b32(BIT.quarantine) | b32(BIT.emergency);
  for (const vdpm of VDPM_STATES) {
    for (const f of ["vdpm_apply_circuit_breaker", "vdpm_enter_quarantine", "vdpm_enter_emergency"]) {
      const out = b32(X[f](vdpm));
      const gained = out & ~b32(vdpm) & MASK32;
      assert.equal(gained & ~SETTABLE & MASK32, 0n,
        `monotonicity: ${f}(${vdpm}) set non-containment bits (gained=${gained.toString(2)})`);
    }
    // circuit breaker clears exactly the trio {network(1), storage(2), ai(32)} and sets nothing.
    assert.equal(b32(X.vdpm_apply_circuit_breaker(vdpm)), b32(vdpm) & ~35n & MASK32, "circuit breaker clears exactly bits {0,1,5}");
    // quarantine/emergency set their flag.
    assert.equal(b32(X.vdpm_enter_quarantine(vdpm)) & b32(BIT.quarantine), b32(BIT.quarantine), "quarantine sets bit 30");
    assert.equal(b32(X.vdpm_enter_emergency(vdpm)) & b32(BIT.emergency), b32(BIT.emergency), "emergency sets bit 31");
  }
  // 3. deny-by-default: unknown/empty effects grant no capability on BOTH tiers (already differential-
  //    agreed above); assert the WASM value explicitly.
  assert.equal(X.capability_to_bitmask(wasmStr("unknown.effect")), 0, "unknown effect → 0 (deny-by-default)");
  assert.equal(X.capability_to_bitmask(wasmStr("")), 0, "empty effect → 0 (deny-by-default)");
  // 4. the pure decision core performed ZERO effect calls across the whole matrix — the granted
  //    audit.write handler exists only to satisfy the import table of the (stubbed) effectful flows.
  assert.equal(effectCalls.length, 0, "pure V_DPM flows must never invoke a host effect");
});
