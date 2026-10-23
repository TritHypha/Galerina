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
    // Buffer.from() may return a Buffer-backed pooled view. The runtime admission
    // contract intentionally accepts only an ordinary, exclusively-owned Uint8Array.
    wasm: Uint8Array.from(Buffer.from(wasmB64, "base64")),
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: L.createHostRuntime(),
  });
  if (typeof instance.exports[flow] !== "function") {
    throw new Error(`requested export '${flow}' is not a callable function of the admitted module`);
  }
  let trapped = false, value = null;
  let trapReason, trapStack;
  if (workerData.captureWasmStack === true) {
    try {
      value = instance.exports[flow](...args);
    } catch (err) {
      trapped = true;
      trapReason = `trap during '${flow}': ${err instanceof Error ? err.message : String(err)}`;
      trapStack = err instanceof Error ? err.stack : undefined;
    }
  } else {
    const invoked = L.invokeAdmittedExport(instance, flow, args);
    if (!invoked.ok) {
      trapped = true;
      trapReason = invoked.reason;
    }
    else value = typeof invoked.result === "number" ? invoked.result : invoked.result;
  }
  parentPort.postMessage({ ok: true, callStarted: true, trapped, trapReason, trapStack, value });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e && e.message ? e.message : e) });
}
