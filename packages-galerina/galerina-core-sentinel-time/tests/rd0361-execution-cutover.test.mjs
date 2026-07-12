// rd0361-execution-cutover.test.mjs — RD-0361 T1: the synchronization-gate `.fungi` twin EXECUTES.
//
// Formalises the scratchpad R1+R3 proof into a keep-green gate: the checker-verified twin is no longer a
// mere shadow — it is compiled, ADMITTED through the attestation-first #105 gate, and its verdict is proven
// EQUAL to the real synchronization-gate.ts verdict it shadows. The RD-0361 A-reading, demonstrated every run:
//   R0  the twin `galerina build`s to a real, signable WASM (buildable now — no P9, no DSS.wasm).
//   R1  that WASM is signed + admitted through #105 (requireSigned) and instantiated — never run un-admitted.
//   R3  FAIL-CLOSED DIFFERENTIAL: the WASM verdict EQUALS the REAL enforceDrift verdict (throw ⇔ DENY) over a
//       boundary corpus. Any disagreement fails this gate — the `fidelity-differential` pattern, on execution.
//
// Nothing here is authoritative: the `.ts` still decides at runtime. The R4 authority flip (delete the `.ts`
// decision body, make the WASM authoritative) is owner-gated and NOT done — this only proves it COULD be.
//
// The compiler is built earlier in the suite (core-compiler < core-sentinel-time) so it is imported
// relatively; the real `.ts` is this package's own freshly-built dist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { LogicalClock, SynchronizationGate } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "synchronization-gate.fungi");

// The REAL .ts verdict for an abstract (synced, driftAbs, maxDriftTicks) state: ALLOW (+1, enforceDrift
// returns) or DENY (-1, PrecisionFault). We construct a gate scenario whose signed drift == +driftAbs, so
// |drift| == driftAbs exercises the exact LST-DRIFT-001 magnitude fold the twin mirrors (strict `>`).
function tsVerdict(synced, driftAbs, maxDriftTicks) {
  const clock = new LogicalClock();
  const gate = new SynchronizationGate(clock, { maxDriftTicks });
  try {
    if (!synced) { gate.enforceDrift(100, 1); return 1; } // no syncToPhysical → LST-SYNC-001 → DENY
    gate.syncToPhysical(0);               // boot mapping: physical 0 ↔ tick 0
    const elapsed = 100;                  // expected ticks = elapsed * rate(1) = 100
    clock.advance(elapsed + driftAbs);    // actual ticks = 100 + driftAbs → drift = +driftAbs
    gate.enforceDrift(elapsed, 1);        // faults iff |drift| > maxDriftTicks (LST-DRIFT-001)
    return 1;                             // returned → ALLOW
  } catch {
    return -1;                            // PrecisionFault → DENY
  }
}

test("RD-0361 T1 · synchronization-gate: R0 build → R1 #105-admit → R3 WASM ≡ real .ts", async () => {
  assert.ok(existsSync(COMPILER),
    "galerina-core-compiler dist not built — run the full suite (or build the compiler) before this execution-cutover gate");
  const L = await import(pathToFileURL(COMPILER).href);

  // ── R0 · the twin builds to a WASM that wabt-assembles ──
  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "synchronization-gate.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "sync-gate", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles to WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + admit through the attestation-first #105 gate, then instantiate ──
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  assert.equal(typeof instance.exports.syncGateVerdict, "function", "syncGateVerdict admitted + exported (R1)");
  assert.equal(typeof instance.exports.driftGateVerdict, "function", "driftGateVerdict admitted + exported (R1)");

  // ── R3 · fail-closed differential: WASM verdict EQUALS the real .ts verdict ──
  const B = (b) => (b ? 1 : 0);
  for (const s of [true, false]) {
    // syncGateVerdict is the LST-SYNC-001 precondition alone: synced ⇒ ALLOW, unsynced ⇒ DENY.
    assert.equal(instance.exports.syncGateVerdict(B(s)), s ? 1 : -1, `syncGateVerdict(${s})`);
  }
  // Boundary corpus: below / AT / above the envelope, synced + unsynced, incl. a zero-tolerance envelope.
  const corpus = [
    [true, 0, 5], [true, 4, 5], [true, 5, 5], [true, 6, 5], [true, 100, 5],
    [false, 0, 5], [false, 100, 5], [true, 0, 0], [true, 1, 0], [false, 0, 0],
  ];
  let agree = 0;
  for (const [s, d, m] of corpus) {
    const w = instance.exports.driftGateVerdict(B(s), d, m);
    const r = tsVerdict(s, d, m);
    assert.equal(w, r, `driftGateVerdict(${s},${d},${m}): WASM=${w} must equal real enforceDrift verdict=${r}`);
    agree++;
  }
  assert.equal(agree, corpus.length, "every differential case checked");

  // The fidelity boundary, called out explicitly on BOTH sides (strict `>` — drift == max PASSES):
  assert.equal(instance.exports.driftGateVerdict(1, 5, 5), 1, "WASM: drift == max PASSES (ALLOW)");
  assert.equal(instance.exports.driftGateVerdict(1, 6, 5), -1, "WASM: drift > max DENIES");
  assert.equal(tsVerdict(true, 5, 5), 1, "real .ts: drift == max PASSES");
  assert.equal(tsVerdict(true, 6, 5), -1, "real .ts: drift > max faults (LST-DRIFT-001)");
});
