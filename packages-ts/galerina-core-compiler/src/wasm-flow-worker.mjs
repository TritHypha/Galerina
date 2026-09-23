import { parentPort, workerData } from "node:worker_threads";

const { wasm, flowName, args } = workerData;
try {
  const { instance } = await WebAssembly.instantiate(wasm);
  const fn = instance.exports[flowName];
  if (typeof fn !== "function") {
    parentPort.postMessage({
      ok: false,
      error: `Export '${flowName}' not found. Available: ${Object.keys(instance.exports).join(", ")}`,
    });
  } else {
    parentPort.postMessage({ ok: true, result: fn(...args) });
  }
} catch (err) {
  parentPort.postMessage({ ok: false, error: String(err) });
}
