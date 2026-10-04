// runtime-executor-rejected-promise.test.mjs — owner no-VM rule (Phillip Booth, 2026-10-04).
//
// Codex review hold on PR #18: the synchronous gate already DENIES a capability that returns a Promise, but a
// REJECTED Promise was left unobserved, and Node's default `--unhandled-rejections=throw` then terminates the
// whole host process. Owner decision: a rejected promise must be refused BEFORE any VM or WASM instance is
// created. An `async` capability can only ever return a Promise, so the seam refuses it structurally before
// any capability runs; `instantiateAndCall` is never entered on any rejected-promise or deny path here.
// Each case runs in a CHILD process so the regression observes the process-level outcome (exit code +
// stderr), not just the verdict: a deny verdict alone is insufficient if the host still crashes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const DIST = new URL("../dist/index.js", import.meta.url).href;

// The child wires one capability per `mode`, calls the SYNCHRONOUS seam, then yields several macrotask turns
// so any unhandled rejection fires before it prints the observation and exits 0.
//   async-declared   — the capability is an `async` function that rejects (as a real async provider would)
//   returns-rejected — the capability is a plain function that returns a rejected native Promise
//   valid            — nothing rejects (control: the VM is still reached exactly once)
const childSource = (capability, mode) => `
import { GOVERNED_RUNTIME_SEAM_VERSION as V, createGovernedRuntimeExecutor } from ${JSON.stringify(DIST)};
const fakeHash = (bytes) => "h:" + bytes.length + ":" + bytes[0];
const BYTES = new Uint8Array([7, 7, 7]);
const SHA = fakeHash(BYTES);
let instantiated = 0;
let capabilityCalls = 0;
const cap = ${JSON.stringify(capability)};
const mode = ${JSON.stringify(mode)};
const message = cap + " rejected asynchronously";
const rejecting = mode === "async-declared"
  ? async () => { capabilityCalls += 1; throw new Error(message); }
  : () => { capabilityCalls += 1; return Promise.reject(new Error(message)); };
const deps = {
  hashArtifact: fakeHash,
  artifactSource: { seamVersion: V, artifactBytesFor: () => BYTES },
  admissionVerifier: { seamVersion: V, verifyAttestation: () => true },
  lowLevel: { seamVersion: V, instantiateAndCall: () => { instantiated += 1; return { ok: true, result: 42 }; } },
};
if (mode !== "valid") {
  if (cap === "verifyAttestation") deps.admissionVerifier = { seamVersion: V, verifyAttestation: rejecting };
  if (cap === "artifactBytesFor") deps.artifactSource = { seamVersion: V, artifactBytesFor: rejecting };
  if (cap === "hashArtifact") deps.hashArtifact = rejecting;
  if (cap === "instantiateAndCall") {
    deps.lowLevel = { seamVersion: V, instantiateAndCall: mode === "async-declared"
      ? async () => { instantiated += 1; capabilityCalls += 1; throw new Error(message); }
      : () => { instantiated += 1; capabilityCalls += 1; return Promise.reject(new Error(message)); } };
  }
}
const exec = createGovernedRuntimeExecutor(deps);
const verdict = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: "att", exportName: "runTwin", args: [1] });
for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
process.stdout.write(JSON.stringify({ outcome: verdict.outcome, instantiated, capabilityCalls }));
`;

const runChild = (capability, mode) =>
  spawnSync(process.execPath, ["--unhandled-rejections=throw", "--input-type=module", "-e", childSource(capability, mode)], {
    encoding: "utf8",
    timeout: 30000,
  });

const observe = (capability, mode) => {
  const child = runChild(capability, mode);
  assert.equal(child.stderr.includes("rejected asynchronously"), false, `unhandled rejection reached the host: ${child.stderr}`);
  assert.equal(child.status, 0, `child exited ${child.status}: ${child.stderr}`);
  return JSON.parse(child.stdout);
};

// Every rejected-promise path that can be refused before the VM: expectedInstantiated = 0.
for (const [capability, mode, expectedInstantiated, expectedCapabilityCalls] of [
  ["verifyAttestation", "async-declared", 0, 0],
  ["artifactBytesFor", "async-declared", 0, 0],
  ["hashArtifact", "async-declared", 0, 0],
  ["instantiateAndCall", "async-declared", 0, 0],
  ["verifyAttestation", "returns-rejected", 0, 1],
  ["artifactBytesFor", "returns-rejected", 0, 1],
  ["hashArtifact", "returns-rejected", 0, 1],
]) {
  test(`${capability} (${mode}) rejecting is denied BEFORE any VM instance is created and the host survives`, () => {
    const observed = observe(capability, mode);
    assert.equal(observed.outcome, "deny");
    assert.equal(observed.instantiated, expectedInstantiated);
    assert.equal(observed.capabilityCalls, expectedCapabilityCalls);
  });
}

test("control: a fully valid wiring still admits and instantiates exactly once", () => {
  const observed = observe("instantiateAndCall", "valid");
  assert.equal(observed.outcome, "admit");
  assert.equal(observed.instantiated, 1);
});

// Backstop only (not a pre-VM refusal): a PLAIN function cannot be told apart from a sync executor until it is
// called, so if it returns a rejected Promise the seam still denies and consumes the rejection so the host
// survives. The no-VM guarantee for async providers is the structural refusal above.
test("backstop: a plain instantiateAndCall that returns a rejected Promise is denied and the host survives", () => {
  const observed = observe("instantiateAndCall", "returns-rejected");
  assert.equal(observed.outcome, "deny");
});

test("control: the child harness DOES detect an unhandled rejection (the regression discriminates)", () => {
  const child = spawnSync(process.execPath, ["--unhandled-rejections=throw", "--input-type=module", "-e",
    "Promise.reject(new Error('rejected asynchronously')); await new Promise((r) => setTimeout(r, 20)); process.stdout.write('{}');"],
  { encoding: "utf8", timeout: 30000 });
  assert.notEqual(child.status, 0);
  assert.equal(child.stderr.includes("rejected asynchronously"), true);
});

test("a hostile thenable verifier result is denied without the seam invoking its foreign `then` or the VM", async () => {
  const { GOVERNED_RUNTIME_SEAM_VERSION: V, createGovernedRuntimeExecutor } = await import(DIST);
  const fakeHash = (bytes) => `h:${bytes.length}:${bytes[0]}`;
  const BYTES = new Uint8Array([7, 7, 7]);
  let thenCalls = 0;
  let instantiated = 0;
  const hostile = { then: () => { thenCalls += 1; throw new Error("hostile then"); } };
  const exec = createGovernedRuntimeExecutor({
    hashArtifact: fakeHash,
    artifactSource: { seamVersion: V, artifactBytesFor: () => BYTES },
    admissionVerifier: { seamVersion: V, verifyAttestation: () => hostile },
    lowLevel: { seamVersion: V, instantiateAndCall: () => { instantiated += 1; return { ok: true, result: 42 }; } },
  });
  let verdict;
  assert.doesNotThrow(() => {
    verdict = exec.admitAndExecute({ seamVersion: V, artifactSha256: fakeHash(BYTES), attestation: "att", exportName: "runTwin", args: [1] });
  });
  assert.equal(verdict.outcome, "deny");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(thenCalls, 0);
  assert.equal(instantiated, 0);
});
