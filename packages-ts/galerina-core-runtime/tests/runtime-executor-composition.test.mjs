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
  const calls = { instantiate: 0, prepareArg: null, lowLevelInput: null };
  const deps = {
    hashArtifact: fakeHash,
    artifactSource: { seamVersion: V, artifactBytesFor: (sha) => (sha === SHA ? BYTES : undefined) },
    admissionVerifier: {
      seamVersion: V,
      verifyAttestation: () => false,
      prepareInvocation: (input) => {
        calls.prepareArg = input;
        return input.attestation === "att-ok" ? Object.freeze(Object.create(null)) : false;
      },
    },
    lowLevel: {
      seamVersion: V,
      admitInstantiation: () => true,
      instantiateAndCall: (input) => { calls.instantiate += 1; calls.lowLevelInput = input; return { ok: true, result: 42 }; },
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
  assert.deepEqual(Object.keys(calls.lowLevelInput), ["invocationPermit"], "execution receives only the permit, not substitutable call inputs");
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

test("a Boolean-only admission verifier is refused before it or the executor can run", () => {
  const calls = { verify: 0, prepare: 0, admit: 0, execute: 0 };
  const { exec } = wired({
    admissionVerifier: {
      seamVersion: V,
      verifyAttestation: () => { calls.verify += 1; return true; },
    },
    lowLevel: {
      seamVersion: V,
      admitInstantiation: () => { calls.admit += 1; return true; },
      instantiateAndCall: () => { calls.execute += 1; return { ok: true, result: 42 }; },
    },
  });
  const verdict = exec.admitAndExecute(req());
  assert.equal(verdict.outcome, "deny");
  assert.deepEqual(calls, { verify: 0, prepare: 0, admit: 0, execute: 0 });
});

test("request seam-version skew → deny (never runs a mismatched request)", () => {
  const { exec, calls } = wired();
  assert.equal(exec.admitAndExecute(req({ seamVersion: "galerina.runtime.seam.v0" })).outcome, "deny");
  assert.equal(calls.instantiate, 0);
});

test("a wired capability pinned to a different seam version → deny", () => {
  const { exec } = wired({ lowLevel: { seamVersion: "galerina.runtime.seam.v0", admitInstantiation: () => true, instantiateAndCall: () => ({ ok: true }) } });
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

test("★ preparation is bound to the freshly-COMPUTED hash, exact bytes, export and args (anti-replay / anti-TOCTOU)", () => {
  const { exec, calls } = wired();
  exec.admitAndExecute(req());
  assert.deepEqual(calls.prepareArg, { attestation: "att-ok", artifactSha256: SHA, exportName: "runTwin", artifactBytes: BYTES, args: [1, 2] },
    "permit preparation must bind the full invocation to the computed artifact hash and exact re-hashed bytes");
});

test("★ a non-preparing attestation denies and never reaches the VM (admission before execution)", () => {
  const { exec, calls } = wired({ admissionVerifier: { seamVersion: V, verifyAttestation: () => true, prepareInvocation: () => false } });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /did not issue an opaque permit/i);
  assert.equal(calls.instantiate, 0, "an unadmitted artifact must never touch the low-level executor");
});

test("low-level execution failure is surfaced as a deny (not an admit)", () => {
  const { exec } = wired({ lowLevel: { seamVersion: V, admitInstantiation: () => true, instantiateAndCall: () => ({ ok: false, reason: "trap: unreachable" }) } });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /trap: unreachable/);
});

test("the composed executor pins the current seam version", () => {
  assert.equal(createGovernedRuntimeExecutor().seamVersion, GOVERNED_RUNTIME_SEAM_VERSION);
});

test("hostile: mutating the source buffer after return cannot change hashed or executed bytes", () => {
  const leaked = new Uint8Array([7, 7, 7]);
  let hashedFirst = null;
  let preparedFirst = null;
  const { exec, calls } = wired({
    artifactSource: {
      seamVersion: V,
      artifactBytesFor: () => leaked,
    },
    hashArtifact: (bytes) => {
      leaked[0] = 99;
      hashedFirst = bytes[0];
      return fakeHash(bytes);
    },
    admissionVerifier: {
      seamVersion: V,
      verifyAttestation: () => false,
      prepareInvocation: ({ artifactBytes }) => {
        preparedFirst = artifactBytes[0];
        return Object.freeze(Object.create(null));
      },
    },
    lowLevel: {
      seamVersion: V,
      admitInstantiation: () => true,
      instantiateAndCall: (input) => {
        calls.instantiate += 1;
        assert.deepEqual(Object.keys(input), ["invocationPermit"]);
        return { ok: true, result: 42 };
      },
    },
  });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "admit");
  assert.equal(leaked[0], 99);
  assert.equal(hashedFirst, 7);
  assert.equal(preparedFirst, 7);
});

test("zero-trust default, owner may revisit: the low-level admit step denying means NO VM instance (expectedInstantiated = 0)", () => {
  let instantiated = 0;
  const { exec } = wired({ lowLevel: { seamVersion: V, admitInstantiation: () => false, instantiateAndCall: () => { instantiated += 1; return { ok: true, result: 42 }; } } });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /before any VM instance is created/);
  assert.equal(instantiated, 0);
});
