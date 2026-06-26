// Phase 1 governance core: the pre-spawn limit gate (every breach a distinct fail-closed
// code, no spawn), the env-absent honest fallback, and the tolerance manifest. No ffsim needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FfsimBackend, checkJobLimits, buildFfsimManifest, validateFfsimManifest, createQuantumBridgeRegistry,
} from "../dist/index.js";

const H = "a".repeat(64);
const LIMITS = {
  maxOrbitals: 26, maxSubspaceDim: 134217728, maxMemoryMB: 2048, maxWallMs: 60000,
  maxTrotterSteps: 50, maxShots: 1024, rayonThreads: 4, tolerance: 1e-8,
};
const job = (over = {}) => ({ op: "expectation_energy", correlationId: "c1", norb: 4, nelec: [2, 2], seed: 0, params: {}, ...over });

test("limit gate: a valid in-budget job passes", () => {
  assert.equal(checkJobLimits(job(), LIMITS).ok, true);
});

test("limit gate: every breach is a distinct fail-closed error code (NO spawn)", () => {
  assert.equal(checkJobLimits(job({ op: "rm -rf /" }), LIMITS).errorCode, "ERR_UNKNOWN_OP");
  assert.equal(checkJobLimits(job({ norb: 999 }), LIMITS).errorCode, "ERR_ORBITALS_EXCEEDED");
  assert.equal(checkJobLimits(job({ norb: 26, nelec: [13, 13] }), LIMITS).errorCode, "ERR_SUBSPACE_TOO_LARGE");
  assert.equal(checkJobLimits(job({ nelec: [5, 0] }), LIMITS).errorCode, "ERR_INVALID_NELEC");
  assert.equal(checkJobLimits(job({ seed: -1 }), LIMITS).errorCode, "ERR_INVALID_SEED");
  assert.equal(checkJobLimits(job({ params: { theta: NaN } }), LIMITS).errorCode, "ERR_INVALID_PARAMS");
  assert.equal(checkJobLimits(job({ params: { trotter_steps: 9999 } }), LIMITS).errorCode, "ERR_TROTTER_STEPS_EXCEEDED");
  assert.equal(checkJobLimits(job({ params: { shots: 1e9 } }), LIMITS).errorCode, "ERR_SHOTS_EXCEEDED");
});

test("backend: an over-budget job TRAPS (LOAD→TRAP→ERASE, executedNatively=false, no spawn)", async () => {
  const b = new FfsimBackend({ available: true, ffsimVersion: "0.0.81" });
  const r = await b.run(job({ norb: 26, nelec: [13, 13] }), LIMITS);
  assert.equal(r.trapFired, true);
  assert.equal(r.executedNatively, false);
  assert.equal(r.errorCode, "ERR_SUBSPACE_TOO_LARGE");
  assert.ok(r.provenance.inputHash.length === 64, "provenance carries the input hash even on a trap");
});

test("backend: ffsim ABSENT → honest unavailable (executedNatively=false, no trap)", async () => {
  const b = new FfsimBackend({ available: false, reason: "ffsim not installed" });
  assert.equal(b.available, false);
  const r = await b.run(job(), LIMITS);
  assert.equal(r.trapFired, false);
  assert.equal(r.executedNatively, false);
  assert.match(r.reason, /unavailable/);
});

test("backend: ffsim PRESENT + in-budget → governed, real run deferred to Phase 2 (never faked)", async () => {
  const b = new FfsimBackend({ available: true, ffsimVersion: "0.0.81" });
  const r = await b.run(job(), LIMITS);
  assert.equal(r.trapFired, false);
  assert.equal(r.executedNatively, false, "Phase 1 never claims a native run");
  assert.match(r.reason, /Phase 2/);
});

test("manifest: a fully-pinned ffsim tolerance manifest validates; a missing pin fails closed", () => {
  const m = buildFfsimManifest({ packageHash: H, backendArtifactHash: H, pinnedEnvHash: H, ffsimVersion: "0.0.81", tolerance: 1e-8, certificationProfile: "certified" });
  assert.equal(m.domain, "quantum");
  assert.equal(m.determinismMode, "tolerance");
  assert.equal(m.precision, undefined, "precision omitted for quantum");
  assert.equal(validateFfsimManifest(m).ok, true);
  assert.equal(validateFfsimManifest({ ...m, pinnedEnvHash: undefined }).ok, false);
  assert.equal(validateFfsimManifest({ ...m, backendArtifactHash: undefined }).ok, false);
});

test("registry: exposes the ffsim backend by id", () => {
  const reg = createQuantumBridgeRegistry();
  assert.ok(reg.has("ffsim-quantum-v1"));
});
