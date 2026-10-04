// runtime-executor-strict-verdicts.test.mjs — zero-trust default, owner may revisit.
//
// The composed governed executor must admit ONLY on an exact boolean `true` from the admission verifier and
// an exact `ok: true` from the low-level VM. Before this fix both were truthiness checks: an ASYNC verifier
// (WebCrypto `subtle.verify` returns a Promise) made `!promise` false and the request was ADMITTED without
// any verification; `{ ok: "no" }` from the VM admitted too. A dependency that THROWS escaped the verdict
// contract instead of denying. (RD-0361 R4 composition code — security fix, see the PR note.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOVERNED_RUNTIME_SEAM_VERSION,
  DENY_ALL_RUNTIME_EXECUTOR,
  bindGovernedRuntime,
  createGovernedRuntimeExecutor,
} from "../dist/index.js";

const V = GOVERNED_RUNTIME_SEAM_VERSION;
const fakeHash = (bytes) => `h:${bytes.length}:${bytes[0] ?? 0}`;
const BYTES = new Uint8Array([7, 7, 7]);
const SHA = fakeHash(BYTES);
const req = (over = {}) => ({ seamVersion: V, artifactSha256: SHA, attestation: "att-ok", exportName: "runTwin", args: [1], ...over });

const wired = (over = {}) => {
  const calls = { instantiate: 0 };
  const deps = {
    hashArtifact: fakeHash,
    artifactSource: { seamVersion: V, artifactBytesFor: (sha) => (sha === SHA ? BYTES : undefined) },
    admissionVerifier: { seamVersion: V, verifyAttestation: () => true },
    lowLevel: { seamVersion: V, instantiateAndCall: () => { calls.instantiate += 1; return { ok: true, result: 42 }; } },
    ...over,
  };
  return { exec: createGovernedRuntimeExecutor(deps), calls };
};

const verifier = (fn) => ({ admissionVerifier: { seamVersion: V, verifyAttestation: fn } });

test("control: an exact `true` verifier and `ok: true` VM still admit", () => {
  const { exec, calls } = wired();
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "admit");
  assert.equal(v.result, 42);
  assert.equal(calls.instantiate, 1);
});

for (const [label, value] of [
  ["a Promise (async verifier)", Promise.resolve(true)],
  ["the number 1", 1],
  ["the string \"true\"", "true"],
  ["an object", {}],
  ["a Boolean wrapper object", Object(true)],
]) {
  test(`verifyAttestation returning ${label} is a refusal and never reaches the VM`, () => {
    const { exec, calls } = wired(verifier(() => value));
    const v = exec.admitAndExecute(req());
    assert.equal(v.outcome, "deny");
    assert.equal(calls.instantiate, 0);
  });
}

for (const [label, value] of [
  ["{ ok: \"no\" }", { ok: "no" }],
  ["{ ok: 1 }", { ok: 1 }],
  ["a non-object", "admit"],
  ["a Promise", Promise.resolve({ ok: true })],
]) {
  test(`instantiateAndCall returning ${label} is a refusal`, () => {
    const { exec } = wired({ lowLevel: { seamVersion: V, instantiateAndCall: () => value } });
    assert.equal(exec.admitAndExecute(req()).outcome, "deny");
  });
}

for (const dep of ["hashArtifact", "artifactBytesFor", "verifyAttestation", "instantiateAndCall"]) {
  test(`a throwing ${dep} yields a deny verdict instead of an exception`, () => {
    const boom = () => { throw new Error(`${dep} exploded`); };
    const over =
      dep === "hashArtifact" ? { hashArtifact: boom }
      : dep === "artifactBytesFor" ? { artifactSource: { seamVersion: V, artifactBytesFor: boom } }
      : dep === "verifyAttestation" ? verifier(boom)
      : { lowLevel: { seamVersion: V, instantiateAndCall: boom } };
    const { exec } = wired(over);
    let v;
    assert.doesNotThrow(() => { v = exec.admitAndExecute(req()); });
    assert.equal(v.outcome, "deny");
  });
}

test("an artifact source returning a non-Uint8Array is a refusal", () => {
  const { exec, calls } = wired({ artifactSource: { seamVersion: V, artifactBytesFor: () => [7, 7, 7] } });
  assert.equal(exec.admitAndExecute(req()).outcome, "deny");
  assert.equal(calls.instantiate, 0);
});

test("bindGovernedRuntime fails closed for a null / malformed provider instead of throwing", () => {
  for (const p of [JSON.parse("null"), 42, {}, { seamVersion: V }, { seamVersion: V, admitAndExecute: "x" }]) {
    let bound;
    assert.doesNotThrow(() => { bound = bindGovernedRuntime(p); });
    assert.equal(bound, DENY_ALL_RUNTIME_EXECUTOR);
  }
});
