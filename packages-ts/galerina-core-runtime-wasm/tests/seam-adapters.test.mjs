/**
 * seam-adapters.test.mjs — the injectable seam providers (RD-0361 R4 / #143; R&D ruling 2026-07-18 model A).
 *
 * Driven with REAL crypto (generateRunnerKeypair/signWasm) and a REAL (hand-encoded) WASM module, then wired
 * through core-runtime's ACTUAL createGovernedRuntimeExecutor — so the whole border-safe path is exercised end
 * to end, not mocked. The load-bearing pins: (1) a valid signature admits a DEFINED export; (2) the HARD
 * export-presence gate DENIES a valid signature over a module that does not define the requested export (the
 * one way model A could drift open) — and denies it at ADMISSION, before the VM is ever touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  wasmHash, generateRunnerKeypair, signWasm,
  hashArtifact, serializeAttestation, parseAttestation,
  createWasmAdmissionVerifier, createLowLevelWasmExecutor, createBorderSafeRuntimeDeps,
} from "../dist/index.js";
import { GOVERNED_RUNTIME_SEAM_VERSION, createGovernedRuntimeExecutor } from "@galerina/core-runtime";

// A minimal, VALID wasm module exporting: add(i32,i32)->i32 (i32.add) and boom()->() (unreachable → traps).
const WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,                    // magic + version
  0x01, 0x0a, 0x02, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, 0x60, 0x00, 0x00, // types: (i32,i32)->i32 , ()->()
  0x03, 0x03, 0x02, 0x00, 0x01,                                     // funcs: f0:type0, f1:type1
  0x07, 0x0e, 0x02, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, 0x04, 0x62, 0x6f, 0x6f, 0x6d, 0x00, 0x01, // export "add"→f0, "boom"→f1
  0x0a, 0x0d, 0x02, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b, 0x03, 0x00, 0x00, 0x0b,       // code: add body, boom body
]);

// A module that IMPORTS env.foo — the closed host set (only "host") does not provide "env" → LinkError.
const IMPORT_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00,                                // type: ()->()
  0x02, 0x0b, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x03, 0x66, 0x6f, 0x6f, 0x00, 0x00, // import "env" "foo" func type0
]);

function externrefGlobalImportWasm() {
  const section = (id, payload) => [id, payload.length, ...payload];
  const name = (value) => [value.length, ...Buffer.from(value, "ascii")];
  return new Uint8Array([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, [1, 0x60, 0, 0]),
    ...section(2, [1, ...name("host"), ...name("__array_create"), 3, 0x6f, 0]),
    ...section(3, [1, 0]),
    ...section(7, [2, ...name("capability"), 3, 0, ...name("invoke"), 0, 0]),
    ...section(10, [1, 2, 0, 0x0b]),
  ]);
}

function funcrefReturnWasm() {
  const section = (id, payload) => [id, payload.length, ...payload];
  const name = (value) => [value.length, ...Buffer.from(value, "ascii")];
  return new Uint8Array([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, [2, 0x60, 0, 0, 0x60, 0, 1, 0x70]),
    ...section(3, [2, 0, 1]),
    ...section(7, [1, ...name("getFunction"), 0, 1]),
    ...section(9, [1, 3, 0, 1, 0]),
    ...section(10, [2, 2, 0, 0x0b, 4, 0, 0xd2, 0, 0x0b]),
  ]);
}

function i64ParamWasm() {
  const section = (id, payload) => [id, payload.length, ...payload];
  const name = (value) => [value.length, ...Buffer.from(value, "ascii")];
  return new Uint8Array([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, [1, 0x60, 1, 0x7e, 0]),
    ...section(3, [1, 0]),
    ...section(7, [1, ...name("run"), 0, 0]),
    ...section(10, [1, 5, 0, 0x20, 0, 0x1a, 0x0b]),
  ]);
}

function multiValueReturnWasm() {
  const section = (id, payload) => [id, payload.length, ...payload];
  const name = (value) => [value.length, ...Buffer.from(value, "ascii")];
  return new Uint8Array([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, [1, 0x60, 0, 2, 0x7f, 0x7f]),
    ...section(3, [1, 0]),
    ...section(7, [1, ...name("run"), 0, 0]),
    ...section(10, [1, 6, 0, 0x41, 0, 0x41, 0, 0x0b]),
  ]);
}

function bomNameCollisionWasm({ numericFirst = false } = {}) {
  const section = (id, payload) => [id, payload.length, ...payload];
  const name = (value) => {
    const bytes = Buffer.from(value, "utf8");
    return [bytes.length, ...bytes];
  };
  const referenceExport = [...name("run"), 0, 0];
  const numericExport = [...name("\uFEFFrun"), 0, 1];
  const exports = numericFirst
    ? [2, ...numericExport, ...referenceExport]
    : [2, ...referenceExport, ...numericExport];
  return new Uint8Array([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, [2, 0x60, 0, 1, 0x70, 0x60, 0, 1, 0x7f]),
    ...section(3, [2, 0, 1]),
    ...section(7, exports),
    ...section(9, [1, 3, 0, 1, 1]),
    ...section(10, [2, 4, 0, 0xd2, 1, 0x0b, 4, 0, 0x41, 42, 0x0b]),
  ]);
}

function printlnModule({ startTrap = false, startCatch = false } = {}) {
  const section = (id, payload) => [id, payload.length, ...payload];
  const types = [
    3,
    0x60, 1, 0x7f, 1, 0x7f, // imported println: (i32) -> i32
    0x60, 0, 1, 0x7f,       // exported invoke: () -> i32
    0x60, 0, 0,              // optional start: () -> ()
  ];
  const imports = [1, 4, 0x68, 0x6f, 0x73, 0x74, 9, 0x5f, 0x5f, 0x70, 0x72, 0x69, 0x6e, 0x74, 0x6c, 0x6e, 0, 0];
  const hasStart = startTrap || startCatch;
  const functionTypes = hasStart ? [2, 1, 2] : [1, 1];
  const exports = [1, 6, 0x69, 0x6e, 0x76, 0x6f, 0x6b, 0x65, 0, 1];
  const invokeBody = [0, 0x41, 0, 0x10, 0, 0x1a, 0x41, 0, 0x0b];
  const sections = [
    ...section(1, types),
    ...section(2, imports),
    ...section(3, functionTypes),
    ...section(7, exports),
  ];
  if (hasStart) sections.push(...section(8, [2]));
  const caughtStartBody = [0, 0x06, 0x40, 0x41, 0, 0x10, 0, 0x1a, 0x19, 0x0b, 0x0b];
  const bodies = hasStart
    ? [2, invokeBody.length, ...invokeBody, ...(startCatch ? [caughtStartBody.length, ...caughtStartBody] : [8, 0, 0x41, 0, 0x10, 0, 0x1a, 0x00, 0x0b])]
    : [1, invokeBody.length, ...invokeBody];
  sections.push(...section(10, bodies));
  return new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, ...sections]);
}

const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
const SHA = wasmHash(WASM);
const att = signWasm(WASM, privateKeyPem, "dev");
const wire = serializeAttestation(att);
const policy = { requireSigned: true, publicKeyPem };
const V = GOVERNED_RUNTIME_SEAM_VERSION;
const sourceFor = (bytes, sha) => ({ seamVersion: V, artifactBytesFor: (s) => (s === sha ? bytes : undefined) });

// ── seam-version pin (keeps the local literal honest vs the real exported const) ────────────────────────────
test("adapters pin the runtime seam version (== @galerina/core-runtime GOVERNED_RUNTIME_SEAM_VERSION)", () => {
  assert.equal(createWasmAdmissionVerifier(policy).seamVersion, V);
  assert.equal(createLowLevelWasmExecutor().seamVersion, V);
  const deps = createBorderSafeRuntimeDeps({ policy });
  assert.equal(deps.admissionVerifier.seamVersion, V);
  assert.equal(deps.lowLevel.seamVersion, V);
});

test("hashArtifact is sha256 over the bytes", () => {
  assert.equal(hashArtifact(WASM), wasmHash(WASM));
  assert.equal(createBorderSafeRuntimeDeps({ policy }).hashArtifact(WASM), SHA);
});

// ── attestation wire format (fail-closed) ───────────────────────────────────────────────────────────────────
test("serialize/parse attestation round-trips; malformed → null (fail-closed)", () => {
  assert.deepEqual(parseAttestation(serializeAttestation(att)), att);
  assert.equal(parseAttestation("not json"), null);
  assert.equal(parseAttestation(""), null);
  assert.equal(parseAttestation(JSON.stringify({ sha256: "xyz", profile: "dev" })), null);           // bad hex
  assert.equal(parseAttestation(JSON.stringify({ sha256: SHA, profile: "root" })), null);            // bad profile
  assert.equal(parseAttestation(JSON.stringify({ sha256: SHA, profile: "dev", signature: 5 })), null); // bad sig type
});

// ── admission verifier (model A) ────────────────────────────────────────────────────────────────────────────
test("★ admission verifier: valid signature + DEFINED export → admit", () => {
  const v = createWasmAdmissionVerifier(policy);
  assert.equal(v.verifyAttestation({ attestation: wire, artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), true);
});

test("★ HARD export-presence gate: valid signature but UNDEFINED export → DENY (the model-A drift path, closed)", () => {
  const v = createWasmAdmissionVerifier(policy);
  assert.equal(v.verifyAttestation({ attestation: wire, artifactSha256: SHA, exportName: "not_an_export", artifactBytes: WASM }), false);
});

test("admission verifier: hash the composition bound us to ≠ attestation hash → deny (anti-replay)", () => {
  const v = createWasmAdmissionVerifier(policy);
  assert.equal(v.verifyAttestation({ attestation: wire, artifactSha256: "0".repeat(64), exportName: "add", artifactBytes: WASM }), false);
});

test("admission verifier: tampered signature → deny", () => {
  const v = createWasmAdmissionVerifier(policy);
  const bad = { ...att, signature: Buffer.from("x".repeat(64)).toString("base64") };
  assert.equal(v.verifyAttestation({ attestation: serializeAttestation(bad), artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), false);
});

test("admission verifier: unsigned attestation under requireSigned → deny", () => {
  const v = createWasmAdmissionVerifier(policy);
  const unsigned = JSON.stringify({ sha256: SHA, profile: "dev" });
  assert.equal(v.verifyAttestation({ attestation: unsigned, artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), false);
});

test("standalone verifier never treats requireSigned:false as permission to admit unsigned WASM", () => {
  const verifier = createWasmAdmissionVerifier({ ...policy, requireSigned: false });
  const unsigned = JSON.stringify({ sha256: SHA, profile: "dev" });
  assert.equal(verifier.verifyAttestation({
    attestation: unsigned,
    artifactSha256: SHA,
    exportName: "add",
    artifactBytes: WASM,
  }), false);
});

test("admission verifier: malformed wire → deny", () => {
  const v = createWasmAdmissionVerifier(policy);
  assert.equal(v.verifyAttestation({ attestation: "garbage", artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), false);
});

test("admission verifier: certified policy REJECTS a dev attestation, ADMITS a certified one", () => {
  const certPolicy = { requireSigned: true, requireCertifiedProfile: true, publicKeyPem };
  const v = createWasmAdmissionVerifier(certPolicy);
  assert.equal(v.verifyAttestation({ attestation: wire, artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), false);
  const certAtt = serializeAttestation(signWasm(WASM, privateKeyPem, "certified"));
  assert.equal(v.verifyAttestation({ attestation: certAtt, artifactSha256: SHA, exportName: "add", artifactBytes: WASM }), true);
});

// ── low-level executor (sync, numeric-fold ABI) ─────────────────────────────────────────────────────────────
test("unauthenticated low-level execution refuses before constructing any WebAssembly instance", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(WebAssembly, "Instance");
  const OriginalInstance = WebAssembly.Instance;
  let constructions = 0;
  class CountingInstance extends OriginalInstance {
    constructor(module, imports) {
      constructions += 1;
      super(module, imports);
    }
  }
  Object.defineProperty(WebAssembly, "Instance", { ...originalDescriptor, value: CountingInstance });
  try {
    const result = createLowLevelWasmExecutor().instantiateAndCall({
      artifactBytes: printlnModule({ startCatch: true }),
      exportName: "invoke",
      args: [],
    });
    assert.equal(result.ok, false);
    assert.equal(constructions, 0, "unsigned direct calls must be refused before guest startup can run");
  } finally {
    Object.defineProperty(WebAssembly, "Instance", originalDescriptor);
  }
});

test("low-level executor: a valid raw call without the paired verifier permit is refused", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: WASM, exportName: "add", args: [2, 40] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing paired, one-shot invocation permit/i);
});

test("low-level executor: unknown export → deny", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: WASM, exportName: "nope", args: [] });
  assert.equal(r.ok, false);
});

test("low-level executor: non-numeric arg is REFUSED (numeric-fold ABI only, no silent NaN→0)", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: WASM, exportName: "add", args: ["1", 2] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing paired, one-shot invocation permit/i);
});

test("low-level executor: a trap (unreachable) is surfaced as a deny (not an ok)", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: WASM, exportName: "boom", args: [] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing paired, one-shot invocation permit/i);
});

test("low-level executor: unparseable bytes → deny", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: new Uint8Array([0, 1, 2, 3]), exportName: "add", args: [1, 2] });
  assert.equal(r.ok, false);
});

test("low-level executor: a module needing an import outside the closed host set → deny (LinkError classified)", () => {
  const r = createLowLevelWasmExecutor().instantiateAndCall({ artifactBytes: IMPORT_WASM, exportName: "x", args: [] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing paired, one-shot invocation permit/i);
  assert.equal(createLowLevelWasmExecutor().admitInstantiation({ artifactBytes: IMPORT_WASM, exportName: "x", args: [] }), false);
});

// ── end-to-end through the ACTUAL composition ───────────────────────────────────────────────────────────────
test("★ e2e: createBorderSafeRuntimeDeps → createGovernedRuntimeExecutor admits a signed twin call", () => {
  const exec = createGovernedRuntimeExecutor({ ...createBorderSafeRuntimeDeps({ policy }), artifactSource: sourceFor(WASM, SHA) });
  const v = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: wire, exportName: "add", args: [40, 2] });
  assert.equal(v.outcome, "admit");
  assert.equal(v.result, 42);
});

test("paired permit snapshots the invocation, executes once, and cannot authorize an unsigned policy", () => {
  const deps = createBorderSafeRuntimeDeps({ policy });
  const originalDescriptor = Object.getOwnPropertyDescriptor(WebAssembly, "Instance");
  const OriginalInstance = WebAssembly.Instance;
  let constructions = 0;
  class CountingInstance extends OriginalInstance {
    constructor(module, imports) {
      constructions += 1;
      super(module, imports);
    }
  }
  Object.defineProperty(WebAssembly, "Instance", { ...originalDescriptor, value: CountingInstance });
  try {
    const permit = deps.admissionVerifier.prepareInvocation({
      attestation: wire,
      artifactSha256: SHA,
      exportName: "add",
      artifactBytes: Uint8Array.from(WASM),
      args: [2, 40],
    });
    assert.equal(typeof permit, "object");
    assert.equal(constructions, 0, "preparation compiles but does not instantiate");
    const executed = deps.lowLevel.instantiateAndCall({ invocationPermit: permit });
    assert.deepEqual(executed, { ok: true, result: 42 }, "execution uses the exact permit-bound export and arguments");
    assert.equal(constructions, 1);
    const replay = deps.lowLevel.instantiateAndCall({ invocationPermit: permit });
    assert.equal(replay.ok, false);
    assert.match(replay.reason, /missing, foreign, or already-consumed/i);
    assert.equal(constructions, 1, "replay is refused before another instance is constructed");
  } finally {
    Object.defineProperty(WebAssembly, "Instance", originalDescriptor);
  }

  const permissivePolicyDeps = createBorderSafeRuntimeDeps({ policy: { ...policy, requireSigned: false } });
  const unsignedPermit = permissivePolicyDeps.admissionVerifier.prepareInvocation({
    attestation: JSON.stringify({ sha256: SHA, profile: "dev" }),
    artifactSha256: SHA,
    exportName: "add",
    artifactBytes: Uint8Array.from(WASM),
    args: [2, 40],
  });
  assert.equal(unsignedPermit, false, "the governed permit path requires signed admission regardless of caller policy defaults");
});

test("execution refuses duplicate artifact, export, or argument fields instead of silently ignoring them", () => {
  const deps = createBorderSafeRuntimeDeps({ policy });
  const permit = deps.admissionVerifier.prepareInvocation({
    attestation: wire,
    artifactSha256: SHA,
    exportName: "add",
    artifactBytes: Uint8Array.from(WASM),
    args: [2, 40],
  });
  assert.equal(typeof permit, "object");
  const substituted = deps.lowLevel.instantiateAndCall({
    invocationPermit: permit,
    artifactBytes: Uint8Array.from(WASM),
    exportName: "boom",
    args: [],
  });
  assert.equal(substituted.ok, false, "extra caller-controlled invocation fields are refused, not ignored");
  assert.match(substituted.reason, /malformed invocation permit request|missing paired/i);

  const exact = deps.lowLevel.instantiateAndCall({ invocationPermit: permit });
  assert.deepEqual(exact, { ok: true, result: 42 }, "the unconsumed permit still executes its exact bound call");
});

test("low-level executor refuses a revoked Proxy request without throwing", () => {
  const deps = createBorderSafeRuntimeDeps({ policy });
  const request = Proxy.revocable({}, {});
  request.revoke();
  let result;
  assert.doesNotThrow(() => {
    result = deps.lowLevel.instantiateAndCall(request.proxy);
  });
  assert.equal(result.ok, false, "a malformed direct-call request is a refusal");
});

test("paired invocation refuses a function-reference result before instantiation", () => {
  const wasm = funcrefReturnWasm();
  assert.equal(WebAssembly.validate(wasm), true, "fixture is a valid module returning a callable function reference");
  const sha = wasmHash(wasm);
  const deps = createBorderSafeRuntimeDeps({ policy });
  const originalDescriptor = Object.getOwnPropertyDescriptor(WebAssembly, "Instance");
  const OriginalInstance = WebAssembly.Instance;
  let constructions = 0;
  class CountingInstance extends OriginalInstance {
    constructor(module, imports) {
      constructions += 1;
      super(module, imports);
    }
  }
  Object.defineProperty(WebAssembly, "Instance", { ...originalDescriptor, value: CountingInstance });
  try {
    const permit = deps.admissionVerifier.prepareInvocation({
      attestation: serializeAttestation(signWasm(wasm, privateKeyPem, "dev")),
      artifactSha256: sha,
      exportName: "getFunction",
      artifactBytes: wasm,
      args: [],
    });
    assert.equal(permit, false, "reference-returning exports are outside the numeric result ABI");
    assert.equal(constructions, 0, "an unsupported result type is refused before module instantiation");
  } finally {
    Object.defineProperty(WebAssembly, "Instance", originalDescriptor);
  }
});

test("synchronous permit ABI refuses i64 parameters, multi-value results, and wrong arity before instantiation", () => {
  const fixtures = [
    { wasm: i64ParamWasm(), exportName: "run", args: [1], label: "i64 parameter" },
    { wasm: multiValueReturnWasm(), exportName: "run", args: [], label: "multi-value result" },
    { wasm: WASM, exportName: "add", args: [1], label: "wrong argument count" },
  ];
  const deps = createBorderSafeRuntimeDeps({ policy });
  const originalDescriptor = Object.getOwnPropertyDescriptor(WebAssembly, "Instance");
  const OriginalInstance = WebAssembly.Instance;
  let constructions = 0;
  class CountingInstance extends OriginalInstance {
    constructor(module, imports) {
      constructions += 1;
      super(module, imports);
    }
  }
  Object.defineProperty(WebAssembly, "Instance", { ...originalDescriptor, value: CountingInstance });
  try {
    for (const { wasm, exportName, args, label } of fixtures) {
      assert.equal(WebAssembly.validate(wasm), true, `${label} fixture is valid WebAssembly`);
      const permit = deps.admissionVerifier.prepareInvocation({
        attestation: serializeAttestation(signWasm(wasm, privateKeyPem, "dev")),
        artifactSha256: wasmHash(wasm),
        exportName,
        artifactBytes: wasm,
        args,
      });
      assert.equal(permit, false, `${label} is outside the synchronous numeric ABI`);
    }
    assert.equal(constructions, 0, "unsupported signatures and arity refuse before module instantiation");
  } finally {
    Object.defineProperty(WebAssembly, "Instance", originalDescriptor);
  }
});

test("signed distinct UTF-8 export names cannot collide through BOM stripping", () => {
  for (const numericFirst of [false, true]) {
    const wasm = bomNameCollisionWasm({ numericFirst });
    assert.equal(WebAssembly.validate(wasm), true, "collision fixture is valid WebAssembly");
    const directExports = new WebAssembly.Instance(new WebAssembly.Module(wasm)).exports;
    assert.equal(typeof directExports.run(), "function", "the exact run export returns a callable reference");
    assert.equal(directExports["\uFEFFrun"](), 42, "the BOM-prefixed export is a distinct numeric function");

    const deps = createBorderSafeRuntimeDeps({ policy });
    const originalDescriptor = Object.getOwnPropertyDescriptor(WebAssembly, "Instance");
    const OriginalInstance = WebAssembly.Instance;
    let constructions = 0;
    class CountingInstance extends OriginalInstance {
      constructor(module, imports) {
        constructions += 1;
        super(module, imports);
      }
    }
    Object.defineProperty(WebAssembly, "Instance", { ...originalDescriptor, value: CountingInstance });
    try {
      const permit = deps.admissionVerifier.prepareInvocation({
        attestation: serializeAttestation(signWasm(wasm, privateKeyPem, "dev")),
        artifactSha256: wasmHash(wasm),
        exportName: "run",
        artifactBytes: wasm,
        args: [],
      });
      assert.equal(permit, false, "the callable export's exact name must retain its reference-returning signature");
      assert.equal(constructions, 0, "the colliding signature must refuse before instance construction");
    } finally {
      Object.defineProperty(WebAssembly, "Instance", originalDescriptor);
    }
  }
});

test("foreign, forged, and failed-call permits cannot be replayed", () => {
  const issuer = createBorderSafeRuntimeDeps({ policy });
  const otherIssuer = createBorderSafeRuntimeDeps({ policy });
  const foreignPermit = issuer.admissionVerifier.prepareInvocation({
    attestation: wire,
    artifactSha256: SHA,
    exportName: "add",
    artifactBytes: Uint8Array.from(WASM),
    args: [2, 40],
  });
  assert.equal(typeof foreignPermit, "object");
  assert.equal(otherIssuer.lowLevel.instantiateAndCall({ invocationPermit: foreignPermit }).ok, false,
    "a permit from a different private authority is foreign");
  assert.equal(issuer.lowLevel.instantiateAndCall({ invocationPermit: Object.freeze(Object.create(null)) }).ok, false,
    "a caller-forged token has no WeakMap authority entry");

  const trapWasm = WASM;
  const trapSha = wasmHash(trapWasm);
  const trapDeps = createBorderSafeRuntimeDeps({ policy });
  const originalDescriptor = Object.getOwnPropertyDescriptor(WebAssembly, "Instance");
  const OriginalInstance = WebAssembly.Instance;
  let constructions = 0;
  class CountingInstance extends OriginalInstance {
    constructor(module, imports) {
      constructions += 1;
      super(module, imports);
    }
  }
  Object.defineProperty(WebAssembly, "Instance", { ...originalDescriptor, value: CountingInstance });
  try {
    const trapPermit = trapDeps.admissionVerifier.prepareInvocation({
      attestation: serializeAttestation(signWasm(trapWasm, privateKeyPem, "dev")),
      artifactSha256: trapSha,
      exportName: "boom",
      artifactBytes: trapWasm,
      args: [],
    });
    assert.equal(typeof trapPermit, "object");
    assert.equal(constructions, 0, "the instance counter is active before permit preparation");
    const failed = trapDeps.lowLevel.instantiateAndCall({ invocationPermit: trapPermit });
    assert.equal(failed.ok, false, "the guest trap is a failed execution");
    assert.match(failed.reason, /unreachable/i, "the guest body actually traps rather than failing admission");
    assert.equal(constructions, 1, "the signed guest trap was invoked once");
    const replay = trapDeps.lowLevel.instantiateAndCall({ invocationPermit: trapPermit });
    assert.equal(replay.ok, false, "a permit burned before execution cannot replay after failure");
    assert.match(replay.reason, /missing, foreign, or already-consumed/i);
    assert.equal(constructions, 1, "replay refusal constructs no second instance");
  } finally {
    Object.defineProperty(WebAssembly, "Instance", originalDescriptor);
  }
});

test("invocation preparation rejects a proxied byte view before invoking proxy traps", () => {
  const deps = createBorderSafeRuntimeDeps({ policy });
  let prototypeTraps = 0;
  const proxiedBytes = new Proxy(Uint8Array.from(WASM), {
    getPrototypeOf(target) {
      prototypeTraps += 1;
      return Reflect.getPrototypeOf(target);
    },
  });
  const permit = deps.admissionVerifier.prepareInvocation({
    attestation: wire,
    artifactSha256: SHA,
    exportName: "add",
    artifactBytes: proxiedBytes,
    args: [2, 40],
  });
  assert.equal(permit, false);
  assert.equal(prototypeTraps, 0, "reject the proxy using the brand test before any user trap can run");
});

test("★ e2e: a request for an UNDEFINED export is denied at ADMISSION (never reaches the VM)", () => {
  const exec = createGovernedRuntimeExecutor({ ...createBorderSafeRuntimeDeps({ policy }), artifactSource: sourceFor(WASM, SHA) });
  const v = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: wire, exportName: "not_an_export", args: [] });
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /did not issue an opaque permit/i);
});

test("★ e2e: an unsigned request is denied (admission before execution)", () => {
  const exec = createGovernedRuntimeExecutor({ ...createBorderSafeRuntimeDeps({ policy }), artifactSource: sourceFor(WASM, SHA) });
  const unsigned = JSON.stringify({ sha256: SHA, profile: "dev" });
  const v = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: unsigned, exportName: "add", args: [1, 2] });
  assert.equal(v.outcome, "deny");
});

test("e2e: a defined-but-trapping export is admitted, then DENIED at execution (deny, not admit)", () => {
  const exec = createGovernedRuntimeExecutor({ ...createBorderSafeRuntimeDeps({ policy }), artifactSource: sourceFor(WASM, SHA) });
  const v = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: wire, exportName: "boom", args: [] });
  assert.equal(v.outcome, "deny");
  assert.match(v.reason, /low-level execution denied|trap/);
});

test("e2e: catching a startup host-gate exception still refuses sync admission", () => {
  const output = [];
  const originalLog = console.log;
  console.log = (line) => output.push(line);
  try {
    const wasm = printlnModule({ startCatch: true });
    const direct = createLowLevelWasmExecutor().instantiateAndCall({
      artifactBytes: wasm,
      exportName: "invoke",
      args: [],
    });
    assert.equal(direct.ok, false, "caught start-time gate exceptions remain sticky refusals");
    assert.match(direct.reason, /missing paired, one-shot invocation permit/i);
    assert.deepEqual(output, []);

    const sha = wasmHash(wasm);
    const governed = createGovernedRuntimeExecutor({
      ...createBorderSafeRuntimeDeps({ policy }),
      artifactSource: sourceFor(wasm, sha),
    });
    const result = governed.admitAndExecute({
      seamVersion: V,
      artifactSha256: sha,
      attestation: serializeAttestation(signWasm(wasm, privateKeyPem, "dev")),
      exportName: "invoke",
      args: [],
    });
    assert.equal(result.outcome, "deny");
    assert.deepEqual(output, []);
  } finally {
    console.log = originalLog;
  }
});

test("low-level executor: a function-only host capability cannot be imported as an externref global", () => {
  const result = createLowLevelWasmExecutor().instantiateAndCall({
    artifactBytes: externrefGlobalImportWasm(),
    exportName: "invoke",
    args: [],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /missing paired, one-shot invocation permit/i);
  assert.equal(createLowLevelWasmExecutor().admitInstantiation({ artifactBytes: externrefGlobalImportWasm(), exportName: "invoke", args: [] }), false);
});

test("e2e: a signed module start cannot emit output before it traps, while an explicit post-init call can", () => {
  const output = [];
  const originalLog = console.log;
  console.log = (line) => output.push(line);
  try {
    const startWasm = printlnModule({ startTrap: true });
    const startSha = wasmHash(startWasm);
    const startExec = createGovernedRuntimeExecutor({
      ...createBorderSafeRuntimeDeps({ policy }),
      artifactSource: sourceFor(startWasm, startSha),
    });
    const denied = startExec.admitAndExecute({
      seamVersion: V,
      artifactSha256: startSha,
      attestation: serializeAttestation(signWasm(startWasm, privateKeyPem, "dev")),
      exportName: "invoke",
      args: [],
    });
    assert.equal(denied.outcome, "deny");
    assert.deepEqual(output, [], "start-time output must not escape before startup fails");

    const normalWasm = printlnModule();
    const normalSha = wasmHash(normalWasm);
    const normalExec = createGovernedRuntimeExecutor({
      ...createBorderSafeRuntimeDeps({ policy }),
      artifactSource: sourceFor(normalWasm, normalSha),
    });
    const admitted = normalExec.admitAndExecute({
      seamVersion: V,
      artifactSha256: normalSha,
      attestation: serializeAttestation(signWasm(normalWasm, privateKeyPem, "dev")),
      exportName: "invoke",
      args: [],
    });
    assert.equal(admitted.outcome, "admit");
    assert.deepEqual(output, ["\n"], "explicit output after successful initialization remains available");
  } finally {
    console.log = originalLog;
  }
});

// ── zero-trust default, owner may revisit: SYNCHRONOUS admit step (owner rule 2026-10-04, no VM on a deny path) ──
test("★ admit step: a valid numeric call to a defined export is allowed with exact true (no instance created)", () => {
  assert.equal(createLowLevelWasmExecutor().admitInstantiation({ artifactBytes: WASM, exportName: "add", args: [2, 40] }), true);
});

test("admit step denies, without instantiating: unknown export, non-numeric arg, unparseable bytes, import outside the closed host set", () => {
  const ex = createLowLevelWasmExecutor();
  assert.equal(ex.admitInstantiation({ artifactBytes: WASM, exportName: "nope", args: [] }), false);
  assert.equal(ex.admitInstantiation({ artifactBytes: WASM, exportName: "add", args: ["1", 2] }), false);
  assert.equal(ex.admitInstantiation({ artifactBytes: new Uint8Array([0, 1, 2, 3]), exportName: "add", args: [1, 2] }), false);
  assert.equal(ex.admitInstantiation({ artifactBytes: IMPORT_WASM, exportName: "x", args: [] }), false);
});

test("★ e2e: a non-numeric arg is denied at the admit step, so the real executor is never instantiated (expectedInstantiated = 0)", () => {
  const deps = createBorderSafeRuntimeDeps({ policy });
  let instantiated = 0;
  const real = deps.lowLevel;
  const lowLevel = {
    seamVersion: real.seamVersion,
    admitInstantiation: (input) => real.admitInstantiation(input),
    instantiateAndCall: (input) => { instantiated += 1; return real.instantiateAndCall(input); },
  };
  const exec = createGovernedRuntimeExecutor({ ...deps, lowLevel, artifactSource: sourceFor(WASM, SHA) });
  const denied = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: wire, exportName: "add", args: ["1", 2] });
  assert.equal(denied.outcome, "deny");
  assert.equal(instantiated, 0);
  const allowed = exec.admitAndExecute({ seamVersion: V, artifactSha256: SHA, attestation: wire, exportName: "add", args: [40, 2] });
  assert.equal(allowed.outcome, "admit");
  assert.equal(allowed.result, 42);
  assert.equal(instantiated, 1);
});
