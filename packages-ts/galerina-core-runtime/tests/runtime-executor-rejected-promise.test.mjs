// runtime-executor-rejected-promise.test.mjs — zero-trust default, owner may revisit.
//
// Codex review hold on PR #18: the synchronous gate already DENIES a verifier that returns a Promise, but a
// REJECTED Promise was left unobserved. Node's default `--unhandled-rejections=throw` then terminates the
// whole host process — availability loss from a malformed/async provider even though the VM is never
// reached. Each case runs in a CHILD process so the regression observes the process-level outcome (exit
// code + stderr), not just the verdict: a deny verdict alone is insufficient if the host still crashes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const DIST = new URL("../dist/index.js", import.meta.url).href;

// The child wires one capability to return a rejected native Promise (as an `async` provider that throws
// would), calls the SYNCHRONOUS seam, then yields several macrotask turns so any unhandled rejection fires
// before it prints the verdict and exits 0.
const childSource = (capability) => `
import { GOVERNED_RUNTIME_SEAM_VERSION as V, createGovernedRuntimeExecutor } from ${JSON.stringify(DIST)};
const fakeHash = (bytes) => "h:" + bytes.length + ":" + bytes[0];
const BYTES = new Uint8Array([7, 7, 7]);
const SHA = fakeHash(BYTES);
const rejected = () => Promise.reject(new Error(${JSON.stringify(capability)} + " rejected asynchronously"));
let instantiated = 0;
const deps = {
  hashArtifact: fakeHash,
  artifactSource: { seamVersion: V, artifactBytesFor: () => BYTES },
  admissionVerifier: { seamVersion: V, verifyAttestation: () => true },
  lowLevel: { seamVersion: V, instantiateAndCall: () => { instantiated += 1; return { ok: true, result: 42 }; } },
};
const cap = ${JSON.stringify(capability)};
if (cap === "verifyAttestation") deps.admissionVerifier = { seamVersion: V, verifyAttestation: rejected };
if (cap === "artifactBytesFor") deps.artifactSource = { seamVersion: V, artifactBytesFor: rejected };
if (cap === "hashArtifact") deps.hashArtifact = rejected;
if (cap === "instantiateAndCall") deps.lowLevel = { seamVersion: V, instantiateAndCall: () => { instantiated += 1; return Promise.reject(new Error("vm rejected")); } };
const exec = createGovernedRuntimeExecutor(deps);
const verdict = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: "att", exportName: "runTwin", args: [1] });
for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
process.stdout.write(JSON.stringify({ outcome: verdict.outcome, instantiated }));
`;

const runChild = (capability) =>
  spawnSync(process.execPath, ["--unhandled-rejections=throw", "--input-type=module", "-e", childSource(capability)], {
    encoding: "utf8",
    timeout: 30000,
  });

for (const [capability, expectedInstantiated] of [
  ["verifyAttestation", 0],
  ["artifactBytesFor", 0],
  ["hashArtifact", 0],
  ["instantiateAndCall", 1],
]) {
  test(`${capability} returning a REJECTED Promise is denied AND the host process survives (no unhandled rejection)`, () => {
    const child = runChild(capability);
    assert.equal(child.stderr.includes("rejected asynchronously") || child.stderr.includes("vm rejected"), false,
      `unhandled rejection reached the host: ${child.stderr}`);
    assert.equal(child.status, 0, `child exited ${child.status}: ${child.stderr}`);
    const observed = JSON.parse(child.stdout);
    assert.equal(observed.outcome, "deny");
    assert.equal(observed.instantiated, expectedInstantiated);
  });
}

test("control: the child harness DOES detect an unhandled rejection (the regression discriminates)", () => {
  const child = spawnSync(process.execPath, ["--unhandled-rejections=throw", "--input-type=module", "-e",
    "Promise.reject(new Error('rejected asynchronously')); await new Promise((r) => setTimeout(r, 20)); process.stdout.write('{}');"],
  { encoding: "utf8", timeout: 30000 });
  assert.notEqual(child.status, 0);
  assert.equal(child.stderr.includes("rejected asynchronously"), true);
});

test("a hostile thenable verifier result is denied without the seam invoking its foreign `then`", async () => {
  const { GOVERNED_RUNTIME_SEAM_VERSION: V, createGovernedRuntimeExecutor } = await import(DIST);
  const fakeHash = (bytes) => `h:${bytes.length}:${bytes[0]}`;
  const BYTES = new Uint8Array([7, 7, 7]);
  let thenCalls = 0;
  const hostile = { then: () => { thenCalls += 1; throw new Error("hostile then"); } };
  const exec = createGovernedRuntimeExecutor({
    hashArtifact: fakeHash,
    artifactSource: { seamVersion: V, artifactBytesFor: () => BYTES },
    admissionVerifier: { seamVersion: V, verifyAttestation: () => hostile },
    lowLevel: { seamVersion: V, instantiateAndCall: () => ({ ok: true, result: 42 }) },
  });
  let verdict;
  assert.doesNotThrow(() => {
    verdict = exec.admitAndExecute({ seamVersion: V, artifactSha256: fakeHash(BYTES), attestation: "att", exportName: "runTwin", args: [1] });
  });
  assert.equal(verdict.outcome, "deny");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(thenCalls, 0);
});
