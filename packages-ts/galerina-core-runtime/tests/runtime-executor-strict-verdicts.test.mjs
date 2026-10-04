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
    lowLevel: { seamVersion: V, admitInstantiation: () => true, instantiateAndCall: () => { calls.instantiate += 1; return { ok: true, result: 42 }; } },
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
    const { exec } = wired({ lowLevel: { seamVersion: V, admitInstantiation: () => true, instantiateAndCall: () => value } });
    assert.equal(exec.admitAndExecute(req()).outcome, "deny");
  });
}

for (const dep of ["hashArtifact", "artifactBytesFor", "verifyAttestation", "admitInstantiation", "instantiateAndCall"]) {
  test(`a throwing ${dep} yields a deny verdict instead of an exception`, () => {
    const boom = () => { throw new Error(`${dep} exploded`); };
    let vmCalls = 0;
    const over =
      dep === "hashArtifact" ? { hashArtifact: boom }
      : dep === "artifactBytesFor" ? { artifactSource: { seamVersion: V, artifactBytesFor: boom } }
      : dep === "verifyAttestation" ? verifier(boom)
      : dep === "admitInstantiation" ? { lowLevel: { seamVersion: V, admitInstantiation: boom, instantiateAndCall: () => { vmCalls += 1; return { ok: true, result: 42 }; } } }
      : { lowLevel: { seamVersion: V, admitInstantiation: () => true, instantiateAndCall: boom } };
    const { exec, calls } = wired(over);
    let v;
    assert.doesNotThrow(() => { v = exec.admitAndExecute(req()); });
    assert.equal(v.outcome, "deny");
    // A throwing pre-VM capability never lets the request reach the VM (the instantiateAndCall case replaces
    // the counting VM itself, so its counter stays untouched by construction).
    assert.equal(calls.instantiate, 0);
    assert.equal(vmCalls, 0);
  });
}

// Owner no-VM rule (2026-10-04): an `async` capability can only return a Promise (possibly rejected), so it is
// refused BEFORE any capability runs — even one that would resolve to a valid value — and the VM is never
// entered.
for (const dep of ["hashArtifact", "artifactBytesFor", "verifyAttestation", "admitInstantiation", "instantiateAndCall"]) {
  for (const [kind, make] of [
    ["async function", (body) => async (...a) => body(...a)],
    ["async generator", (body) => async function* (...a) { yield body(...a); }],
    ["async method", (body) => ({ async m(...a) { return body(...a); } }).m],
  ]) {
    test(`an ${kind} ${dep} is refused before any capability runs and never reaches the VM`, () => {
      const seen = { capability: 0 };
      const counted = (value) => make(() => { seen.capability += 1; return value; });
      let vmCalls = 0;
      const over =
        dep === "hashArtifact" ? { hashArtifact: counted(SHA) }
        : dep === "artifactBytesFor" ? { artifactSource: { seamVersion: V, artifactBytesFor: counted(BYTES) } }
        : dep === "verifyAttestation" ? verifier(counted(true))
        : dep === "admitInstantiation" ? { lowLevel: { seamVersion: V, admitInstantiation: counted(true), instantiateAndCall: () => { vmCalls += 1; return { ok: true, result: 42 }; } } }
        : { lowLevel: { seamVersion: V, admitInstantiation: () => true, instantiateAndCall: make(() => { vmCalls += 1; seen.capability += 1; return { ok: true, result: 42 }; }) } };
      const { exec, calls } = wired(over);
      let v;
      assert.doesNotThrow(() => { v = exec.admitAndExecute(req()); });
      assert.equal(v.outcome, "deny");
      assert.match(v.reason, /before any VM instance is created/);
      assert.equal(seen.capability, 0);
      assert.equal(calls.instantiate, 0);
      assert.equal(vmCalls, 0);
    });
  }
}

test("a non-callable capability is refused before any VM instance is created", () => {
  for (const over of [
    { hashArtifact: "sha" },
    { artifactSource: { seamVersion: V, artifactBytesFor: BYTES } },
    verifier(true),
    { lowLevel: { seamVersion: V, admitInstantiation: () => true, instantiateAndCall: { ok: true } } },
    { lowLevel: { seamVersion: V, admitInstantiation: true, instantiateAndCall: () => ({ ok: true, result: 42 }) } },
  ]) {
    const { exec, calls } = wired(over);
    const v = exec.admitAndExecute(req());
    assert.equal(v.outcome, "deny");
    assert.match(v.reason, /before any VM instance is created/);
    assert.equal(calls.instantiate, 0);
  }
});

test("a capability whose inspection throws (hostile Proxy) is refused, not thrown, and never reaches the VM", () => {
  const hostile = new Proxy(() => true, { get: () => { throw new Error("hostile trap"); } });
  const { exec, calls } = wired(verifier(hostile));
  let v;
  assert.doesNotThrow(() => { v = exec.admitAndExecute(req()); });
  assert.equal(v.outcome, "deny");
  assert.equal(calls.instantiate, 0);
});

test("a throwing capability getter is refused, not thrown, and never reaches the VM", () => {
  const source = { seamVersion: V, get artifactBytesFor() { throw new Error("getter exploded"); } };
  const { exec, calls } = wired({ artifactSource: source });
  let v;
  assert.doesNotThrow(() => { v = exec.admitAndExecute(req()); });
  assert.equal(v.outcome, "deny");
  assert.equal(calls.instantiate, 0);
});

test("each capability is read exactly once, so a getter cannot swap in an async capability after the check", () => {
  let reads = 0;
  const admissionVerifier = {
    seamVersion: V,
    get verifyAttestation() {
      reads += 1;
      return reads === 1 ? () => true : async () => true;
    },
  };
  const { exec, calls } = wired({ admissionVerifier });
  const v = exec.admitAndExecute(req());
  assert.equal(reads, 1);
  assert.equal(v.outcome, "admit");
  assert.equal(calls.instantiate, 1);
});

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

// Codex fresh-review hold (2) on 4e63a98f: provider/request property reads must not throw out of the
// fail-closed verdict or bind contract. Every hostile accessor is a deny (or deny-all bind), never an
// exception, and never reaches the VM.
const throwingSeam = (rest) => Object.defineProperty({ ...rest }, "seamVersion", { get() { throw new Error("seam getter exploded"); } });

for (const [label, over] of [
  ["artifactSource.seamVersion", () => ({ artifactSource: throwingSeam({ artifactBytesFor: () => BYTES }) })],
  ["admissionVerifier.seamVersion", () => ({ admissionVerifier: throwingSeam({ verifyAttestation: () => true }) })],
  ["lowLevel.seamVersion", () => ({ lowLevel: throwingSeam({ admitInstantiation: () => true, instantiateAndCall: () => ({ ok: true, result: 42 }) }) })],
]) {
  test(`a throwing ${label} getter is a deny verdict, not an exception, and never reaches the VM`, () => {
    const { exec, calls } = wired(over());
    let v;
    assert.doesNotThrow(() => { v = exec.admitAndExecute(req()); });
    assert.equal(v.outcome, "deny");
    assert.equal(calls.instantiate, 0);
  });
}

test("a throwing request accessor (or hostile toString in a reason) is a deny verdict, not an exception", () => {
  const { exec, calls } = wired();
  const hostileRequest = Object.defineProperty(req(), "seamVersion", { get() { throw new Error("request getter exploded"); } });
  const hostileToString = req({ seamVersion: { toString() { throw new Error("toString exploded"); } } });
  for (const r of [hostileRequest, hostileToString]) {
    let v;
    assert.doesNotThrow(() => { v = exec.admitAndExecute(r); });
    assert.equal(v.outcome, "deny");
  }
  assert.equal(calls.instantiate, 0);
});

test("bindGovernedRuntime binds deny-all, without throwing, for hostile admitAndExecute / seamVersion accessors", () => {
  const hostileMethod = Object.defineProperty({ seamVersion: V }, "admitAndExecute", { get() { throw new Error("method getter exploded"); } });
  const hostileSeam = Object.defineProperty({ admitAndExecute: () => ({ outcome: "admit" }) }, "seamVersion", { get() { throw new Error("seam getter exploded"); } });
  for (const p of [hostileMethod, hostileSeam]) {
    let bound;
    assert.doesNotThrow(() => { bound = bindGovernedRuntime(p); });
    assert.equal(bound, DENY_ALL_RUNTIME_EXECUTOR);
  }
});

// Zero-trust default, owner may revisit (owner rule 2026-10-04: no VM at all on a deny path). The low-level
// executor is split: a SYNCHRONOUS admit step decides allow/deny with no VM; instantiation runs only after an
// exact `true`. Every deny below asserts expectedInstantiated = 0.
const splitExecutor = (admit) => {
  const seen = { admitCalls: 0, instantiated: 0, admitInput: undefined };
  const lowLevel = {
    seamVersion: V,
    admitInstantiation: (input) => { seen.admitCalls += 1; seen.admitInput = input; return admit(input); },
    instantiateAndCall: () => { seen.instantiated += 1; return { ok: true, result: 42 }; },
  };
  return { lowLevel, seen };
};

test("control: an admit step returning exact true instantiates exactly once", () => {
  const { lowLevel, seen } = splitExecutor(() => true);
  const { exec } = wired({ lowLevel });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "admit");
  assert.equal(v.result, 42);
  assert.equal(seen.admitCalls, 1);
  assert.equal(seen.instantiated, 1);
});

for (const [label, value] of [
  ["false", false],
  ["a resolved Promise of true", Promise.resolve(true)],
  ["the number 1", 1],
  ["the string \"true\"", "true"],
  ["an object", {}],
  ["a Boolean wrapper object", Object(true)],
  ["a hostile thenable", { then: () => { throw new Error("hostile then"); } }],
]) {
  test(`an admit step returning ${label} denies with no VM instance (expectedInstantiated = 0)`, () => {
    const { lowLevel, seen } = splitExecutor(() => value);
    const { exec } = wired({ lowLevel });
    const v = exec.admitAndExecute(req());
    assert.equal(v.outcome, "deny");
    assert.match(v.reason, /before any VM instance is created/);
    assert.equal(seen.instantiated, 0);
  });
}

test("a legacy executor with no admit step cannot prove it is safe synchronously: denied, expectedInstantiated = 0", () => {
  let instantiated = 0;
  const { exec } = wired({ lowLevel: { seamVersion: V, instantiateAndCall: () => { instantiated += 1; return { ok: true, result: 42 }; } } });
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "deny");
  assert.equal(instantiated, 0);
});

test("the admit step is not reached when attestation fails, and it receives copies it cannot use to mutate the run", () => {
  const denied = splitExecutor(() => true);
  const { exec: deniedExec } = wired({ lowLevel: denied.lowLevel, admissionVerifier: { seamVersion: V, verifyAttestation: () => false } });
  assert.equal(deniedExec.admitAndExecute(req()).outcome, "deny");
  assert.equal(denied.seen.admitCalls, 0);
  assert.equal(denied.seen.instantiated, 0);

  let executedFirst = 0;
  const lowLevel = {
    seamVersion: V,
    admitInstantiation: ({ artifactBytes, args }) => { artifactBytes[0] = 99; args[0] = 99; return true; },
    instantiateAndCall: ({ artifactBytes, args }) => { executedFirst = artifactBytes[0] * 1000 + args[0]; return { ok: true, result: 42 }; },
  };
  const { exec } = wired({ lowLevel });
  assert.equal(exec.admitAndExecute(req()).outcome, "admit");
  assert.equal(executedFirst, 7001);
});
