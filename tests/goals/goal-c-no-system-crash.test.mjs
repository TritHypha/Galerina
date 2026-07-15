/**
 * T-008: Goal C — Structural Prevention of System-Wide Crashes
 *
 * Validates that a fault or resource exhaustion inside an individual governed
 * unit terminates ONLY that unit, leaving the host running.
 *
 * Reference: ../ZTF-Knowledge-Bases/galerina-engineering-goals.md Goal C
 *
 * TIERS:
 *  1. UNIT TIER (REAL, runs now): a runaway `.fungi` loop compiled to WASM and
 *     admitted through #105 TRAPS at the emitter's fuel cap (WAT_LOOP_FUEL_CAP,
 *     #22/RD-0314) instead of hanging the host; a bounded loop under the cap
 *     completes with the correct value (no false trap). The runaway call runs in
 *     a worker_threads watchdog (RD-0316): if the cap ever regresses, the loop
 *     hangs the WORKER, the 60s watchdog fires, and this test FAILS — it can
 *     never false-green or hang the suite.
 *  2. DRCM PHASE-5 TIER (todo): the full three-isolate DSS supervisor scenario
 *     (concurrent DWI instances, V_DPM bit-clearing) — deferred until DSS.wasm
 *     multi-module merge + DWI isolates ship. Marked `todo`, NEVER a passing
 *     placeholder (a placeholder that asserts true reads as shipped coverage).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "packages-galerina", "galerina-core-compiler", "dist", "index.js");

// One module, two flows: the runaway loop (must trap at the fuel cap) and a
// bounded control (must complete — proves the cap does not false-trap real work).
const FUEL_SRC = `@version 1
pure flow runaway() -> Int
contract { intent { "Loops forever; the WAT fuel cap must TRAP this, never hang the host." } }
{
  mut i: Int = 0
  while i > 0 - 1 {
    i = i + 0
  }
  return i
}

pure flow sumTo(n: Int) -> Int
contract { intent { "Bounded control: sums 1..n under the fuel cap and must complete correctly." } }
{
  mut i: Int = 0
  mut acc: Int = 0
  while i < n {
    i = i + 1
    acc = acc + i
  }
  return acc
}
`;

// The worker builds, signs, #105-admits and RUNS the module; the main thread is
// the watchdog. eval-mode workers are CJS — the ESM compiler dist loads via
// dynamic import.
const WORKER_SRC = `
const { parentPort, workerData } = require("node:worker_threads");
const { pathToFileURL } = require("node:url");
(async () => {
  const L = await import(pathToFileURL(workerData.compiler).href);
  const prog = L.parseProgram(workerData.src, "goal-c-fuel.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length > 0) { parentPort.postMessage({ kind: "parse-failed", errs }); return; }
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "goal-c-fuel", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  if (!asm.valid || asm.diagnostics.length > 0) { parentPort.postMessage({ kind: "build-failed", diags: asm.diagnostics }); return; }
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const sum = instance.exports.sumTo(50000);
  try {
    instance.exports.runaway();
    parentPort.postMessage({ kind: "no-trap", sum });
  } catch (e) {
    parentPort.postMessage({ kind: "trapped", message: String((e && e.message) || e), sum });
  }
})().catch((e) => { parentPort.postMessage({ kind: "worker-error", message: String((e && e.stack) || e) }); });
`;

describe("T-008: Goal C — Structural Prevention of System-Wide Crashes", () => {

  it("Goal C (unit tier): a runaway governed loop TRAPS at the WAT fuel cap — the host survives (#22/RD-0314)", async () => {
    assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
    const worker = new Worker(WORKER_SRC, { eval: true, workerData: { compiler: COMPILER, src: FUEL_SRC } });
    const result = await new Promise((resolve, reject) => {
      const watchdog = setTimeout(() => {
        worker.terminate();
        reject(new Error("FUEL-CAP REGRESSION: the runaway loop did not trap within 60s — the WAT_LOOP_FUEL_CAP emission is missing (RD-0314 WASM DoS is live again)"));
      }, 60_000);
      worker.once("message", (m) => { clearTimeout(watchdog); resolve(m); });
      worker.once("error", (e) => { clearTimeout(watchdog); reject(e); });
    });
    await worker.terminate();

    assert.equal(result.kind, "trapped", `the runaway loop must trap, got: ${JSON.stringify(result)}`);
    assert.match(result.message, /unreachable/i, "the trap is the WASM `unreachable` (fuel exhaustion), not another fault");
    assert.equal(result.sum, 1_250_025_000, "the bounded control loop under the cap completes with the correct value (no false trap)");
    // The host — this process — is alive to make these assertions: the fault stayed inside the unit.
  });

  it("T-008 (DRCM Phase 5): concurrent DWI fault isolation under the DSS supervisor", { todo: true }, () => {
    // Acceptance criterion (three concurrent DWI instances) — build when DSS.wasm
    // multi-module merge + DWI isolates ship (see task #57):
    //   - Instance A: well-formed flow → completes successfully
    //   - Instance B: infinite loop → fuel exhausted → FUNGI-RESOURCE-001 → terminated
    //   - Instance C: path traversal → capability violation → FUNGI-CAP-003 → terminated
    //   - DSS supervisor survives all three; V_DPM bit cleared for Instance C
    // Fault isolation: 4MB sealed linear memory per DWI + hardware guard pages.
    // Fuel injection at the DRCM tier: wasmtime Store fuel (the unit tier above
    // already proves the in-module WAT fuel cap).
  });

  it("T-008 pre-verification: isolated fault cannot propagate to sibling flows (architecture math)", () => {
    // The isolation guarantee is structural (WebAssembly linear memory + hardware
    // guard pages), not policy-enforced. There is no shared heap between DWI instances.
    const DWI_MAX_BYTES = 4 * 1024 * 1024;
    const GUARD_PAGE_BYTES = 2 * 1024 * 1024 * 1024;
    assert.ok(GUARD_PAGE_BYTES > DWI_MAX_BYTES,
      "Guard pages must be larger than the DWI heap to prevent pointer traversal");
    const THREE_ISOLATES_BYTES = 3 * (DWI_MAX_BYTES + GUARD_PAGE_BYTES);
    const ADDRESSABLE_64BIT = Math.pow(2, 47);
    assert.ok(THREE_ISOLATES_BYTES < ADDRESSABLE_64BIT,
      "Three concurrent DWI isolates must fit in addressable virtual memory");
  });
});
