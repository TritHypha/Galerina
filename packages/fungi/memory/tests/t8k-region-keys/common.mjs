// T8K shared grid helper. Synthetic data only. NON_AUTHORIZING.
// Region-keys unit is flattened after the per-secret port it reuses (portAccess, CN-1 c-boundary).
import assert from "node:assert/strict";
import { flatten, withUnit, invoke } from "./harness.mjs";

export const UNITS = ["c-boundary", "release-commit-point", "secrets-provider-port", "region-keys"];
// Closed set of every value a region-keys flow may return (K8).
export const CLOSED = new Set([100, 11, 61, 62, 63, 64, 65, 66, 106, 112, 119]);

export function grid(flow, fn) {
  return withUnit(flatten(UNITS), (file) => fn((args) => {
    const r = invoke(file, flow, args);
    assert.equal(r.status, 0, flow + "(" + args.join(",") + ") status " + r.text);
    assert.equal(r.present, true, flow + "(" + args.join(",") + ") value absent " + r.text);
    assert.ok(CLOSED.has(r.value), flow + "(" + args.join(",") + ") returned " + r.value + " outside the closed set");
    return r.value;
  }));
}
