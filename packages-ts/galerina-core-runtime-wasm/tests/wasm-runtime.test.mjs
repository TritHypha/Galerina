// wasm-runtime.test.mjs — the border-safe TCB owns this surface, so it verifies it here (not only via the
// compiler's re-export). Covers the admission gate's FAIL-CLOSED contract: deterministic hashing, a genuine
// sign→verify roundtrip, and refusal on a missing / tampered / profile-mismatched attestation.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wasmHash, generateRunnerKeypair, signWasm, verifyWasm, createHostRuntime,
  admitAndInstantiate,
} from "../dist/index.js";

const bin = (bytes) => new Uint8Array(bytes);

test("wasmHash is deterministic sha256 hex", () => {
  const a = wasmHash(bin([1, 2, 3]));
  const b = wasmHash(bin([1, 2, 3]));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, wasmHash(bin([1, 2, 4]))); // different bytes → different hash
});

test("sign → verify roundtrip admits a genuine attestation", () => {
  const wasm = bin([10, 20, 30, 40]);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const att = signWasm(wasm, privateKeyPem, "certified");
  const v = verifyWasm(wasm, att, { requireSigned: true, publicKeyPem, requireCertifiedProfile: true });
  assert.equal(v.ok, true);
});

test("FAIL-CLOSED: no attestation is refused", () => {
  const v = verifyWasm(bin([1]), undefined, { requireSigned: true, publicKeyPem: "x" });
  assert.equal(v.ok, false);
});

test("FAIL-CLOSED: a tampered binary breaks the signature", () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const att = signWasm(bin([1, 2, 3]), privateKeyPem, "certified");
  // verify the SAME attestation against DIFFERENT bytes → hash mismatch, refused
  const v = verifyWasm(bin([1, 2, 9]), att, { requireSigned: true, publicKeyPem });
  assert.equal(v.ok, false);
});

test("FAIL-CLOSED: a dev attestation cannot pass a certified-required policy (profile bound into the signature)", () => {
  const wasm = bin([5, 5, 5]);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const devAtt = signWasm(wasm, privateKeyPem, "dev");
  // re-labelling to certified must not verify — the profile is inside the signed pre-image (#173)
  const forged = { ...devAtt, profile: "certified" };
  const v = verifyWasm(wasm, forged, { requireSigned: true, publicKeyPem, requireCertifiedProfile: true });
  assert.equal(v.ok, false);
});

function rangeHost() {
  const rt = createHostRuntime();
  return { rt, range: rt.imports.host.__range };
}

test("__range(2,7) still materializes the exclusive interval", () => {
  const { rt, range } = rangeHost();
  assert.deepEqual([...rt.readArray(range(2, 7))], [2, 3, 4, 5, 6]);
});

test("hostile: __range must not allocate a 1e5 host array outside guest memory", () => {
  const { range } = rangeHost();
  assert.throws(() => range(0, 100_000), /guest memory|fuel/);
});

test("__range refuses a second allocation once host fuel is exhausted", () => {
  const { range } = rangeHost();
  range(0, 10_000);
  assert.throws(() => range(0, 10_000), /fuel|guest memory/);
});

test("bound guest memory is the range ceiling after bindMemory", () => {
  const { rt, range } = rangeHost();
  rt.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  assert.throws(() => range(0, 20_000), /guest memory/);
  assert.deepEqual([...rt.readArray(range(0, 3))], [0, 1, 2]);
});

const EMPTY_WASM = bin([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

test("admitAndInstantiate instantiates the snapshot, not a mutated caller buffer", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = Uint8Array.from(EMPTY_WASM);
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const pending = admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  wasm[0] = 0xff;
  const admitted = await pending;
  assert.equal(admitted.hash, wasmHash(EMPTY_WASM));
  assert.ok(admitted.instance);
});

test("FAIL-CLOSED: Buffer-backed wasm is not an exclusive Uint8Array snapshot", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = Buffer.from(EMPTY_WASM);
  const attestation = signWasm(Uint8Array.from(EMPTY_WASM), privateKeyPem, "dev");
  await assert.rejects(
    () => admitAndInstantiate({
      wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
    }),
    /exclusively owned Uint8Array/,
  );
});
