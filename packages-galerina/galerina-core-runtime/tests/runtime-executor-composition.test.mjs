/**
 * Governed-runtime executor COMPOSITION (RD-0361 R4 / #143 · block 2). createGovernedRuntimeExecutor owns the
 * deny-by-default orchestration — resolve → integrity → admission → execute — while every mechanism is
 * INJECTED so core-runtime stays dependency-free and border-safe. These pins prove the load-bearing property:
 * there is NO path from a missing dependency or a failed check to `admit`, and admission is proven BEFORE the
 * low-level VM is ever touched (an unadmitted artifact must never execute).
 *
 * Admission is a SIGNED attestation verified INSIDE against the freshly-computed hash (R&D ruling 2026-07-18:
 * a bare `admitted` boolean crossing the seam is forgeable — the same class as a bare `as Verdict` cast). The
 * fakes use a trivial injected hash (`h:<len>:<first-byte>`) and a trivial `verifyAttestation` so match/mismatch
 * is controllable without real crypto — the composition logic under test is the control flow, not the algorithm.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOVERNED_RUNTIME_SEAM_VERSION,
  createGovernedRuntimeExecutor,
} from "../dist/index.js";

const V = GOVERNED_RUNTIME_SEAM_VERSION;
const fakeHash = (bytes) => `h:${bytes.length}:${bytes[0] ?? 0}`;
const BYTES = new Uint8Array([7, 7, 7]);
const SHA = fakeHash(BYTES); // "h:3:7" — the pinned hash the request will carry

const req = (over = {}) => ({ seamVersion: V, artifactSha256: SHA, attestation: "att-ok", exportName: "runTwin", args: [1, 2], ...over });

// A fully-wired, all-admitting composition — the happy path and the base every deny-case perturbs.
const wired = (over = {}) => {
  const calls = { instantiate: 0, verifyArg: null };
  const deps = {
    hashArtifact: fakeHash,
    artifactSource: { seamVersion: V, artifactBytesFor: (sha) => (sha === SHA ? BYTES : undefined) },
    admissionVerifier: { seamVersion: V, verifyAttestation: (input) => { calls.verifyArg = input; return input.attestation === "att-ok"; } },
    lowLevel: {
      seamVersion: V,
      instantiateAndCall: () => { calls.instantiate += 1; return { ok: true, result: 42 }; },
    },
    ...over,
  };
  return { exec: createGovernedRuntimeExecutor(deps), calls };
};

test("★ happy path: integrity + a verified attestation → admit, carrying the VM result", () => {
  const { exec, calls } = wired();
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "admit");
  assert.equal(v.result, 42);
  assert.equal(calls.instantiate, 1);
});

test("under-wired: an empty composition DENIES (deny-by-default, no capability can fall open)", () => {
  const exec = createGovernedRuntimeExecutor();
  assert.equal(exec.admitAndExecute(req()).outcome, "deny");
});

test("under-wired: EACH single missing dependency denies", () => {
  for (const drop of ["hashArtifact", "artifactSource", "admissionVerifier", "lowLevel"]) {
    const { exec } = wired({ [drop]: undefined });
    assert.equal(exec.admitAndExecute(req()).outcome, "deny", `missing ${drop} must deny`);
  }
});

test("request seam-version skew → deny (never runs a mismatched request)", () => {
  const { exec, calls } = wired();
  assert.equal(exec.admitAndExecute(req({ seamVersion: "galerina.runtime.seam.v0" })).outcome, "deny");
  assert.equal(calls.instantiate, 0);
});

test("a wired capability pinned to a different seam version → deny", () => {
  const { exec } = wired({ lowLevel: { seamVersion: "galerina.runtime.seam.v0", instantiateAndCall: () => ({ ok: true }) } });
  assert.equal(exec.admitAndExecute(req()).outcome, "deny");
});

test("unknown artifact (source returns undefined for the pinned hash) → deny", () => {
  const { exec, calls } = wired();
  assert.equal(exec.admitAndExecute(req({ artifactSha256: "h:9:9" })).outcome, "deny");
  assert.equal(calls.instantiate, 0, "an unresolved artifact must never execute");
});

test("★ integrity: a source returning bytes that re-hash to a DIFFERENT value → deny (source is untrusted)", () => {
  // The source hands back tampered bytes whose fakeHash ("h:2:1") ≠ the pinned request hash ("h:3:7").
  const tampered = new Uint8Array([1, 1]);
  const { exec, calls } = wired({ artifactSource: { seamVersion: V, artifactBytesFor: () => tampered } });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /integrity check FAILED/);
  assert.equal(calls.instantiate, 0, "bytes failing integrity must never execute");
});

test("★ a bare/empty attestation is REFUSED (a trust-me claim is not admission) — never reaches the VM", () => {
  const { exec, calls } = wired();
  const v = exec.admitAndExecute(req({ attestation: "" }));
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /no signed admission attestation/);
  assert.equal(calls.instantiate, 0);
});

test("★ admission is verified INSIDE, bound to the freshly-COMPUTED hash (anti-replay / anti-TOCTOU)", () => {
  const { exec, calls } = wired();
  exec.admitAndExecute(req());
  assert.deepEqual(calls.verifyArg, { attestation: "att-ok", artifactSha256: SHA, exportName: "runTwin" },
    "verifyAttestation must be called with the computed artifact hash it is bound to");
});

test("★ a non-verifying attestation denies and never reaches the VM (admission before execution)", () => {
  const { exec, calls } = wired({ admissionVerifier: { seamVersion: V, verifyAttestation: () => false } });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /did not verify/);
  assert.equal(calls.instantiate, 0, "an unadmitted artifact must never touch the low-level executor");
});

test("low-level execution failure is surfaced as a deny (not an admit)", () => {
  const { exec } = wired({ lowLevel: { seamVersion: V, instantiateAndCall: () => ({ ok: false, reason: "trap: unreachable" }) } });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /trap: unreachable/);
});

test("the composed executor pins the current seam version", () => {
  assert.equal(createGovernedRuntimeExecutor().seamVersion, GOVERNED_RUNTIME_SEAM_VERSION);
});
