// wasm-invoke-worker.mjs — isolated WASM invoke for the fidelity harness's liveness slice (RD-0316).
// A busy WASM loop cannot be preempted from JS on the same thread, so a fuel-cap regression would
// freeze the whole `node --test` run — a `catch` can't catch a hang. Running the invoke in a worker
// lets the parent hold a wall-clock watchdog and `terminate()` to RECLAIM a hang, turning it into a
// reportable divergence finding (the RD-0314 class) instead of a frozen harness.
import { parentPort, workerData } from "node:worker_threads";
import * as L from "../../dist/index.js";

const { wasmB64, attestation, publicKeyPem, flow, args } = workerData;
try {
  const { instance } = await L.admitAndInstantiate({
    wasm: Buffer.from(wasmB64, "base64"),
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: L.createHostRuntime(),
  });
  let trapped = false, value;
  try { value = instance.exports[flow](...args); } catch { trapped = true; }
  parentPort.postMessage({ ok: true, trapped, value: typeof value === "number" ? value : null });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e && e.message ? e.message : e) });
}
