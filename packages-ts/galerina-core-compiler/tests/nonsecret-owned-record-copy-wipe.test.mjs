import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";
import {
  admitAndInstantiate,
  createHostRuntime,
  generateRunnerKeypair,
  signWasm,
  WAT_HEAP_BASE,
} from "@galerina/core-runtime-wasm";

function nestedRecordFixture(depth) {
  const declarations = [];
  for (let index = 0; index < depth; index += 1) {
    const field = index === depth - 1 ? "value: Int" : `child: R${index + 1}`;
    declarations.push(`record R${index} { ${field} }`);
  }
  let expression = "7";
  for (let index = depth - 1; index >= 0; index -= 1) {
    expression = index === depth - 1
      ? `R${index} { value: ${expression} }`
      : `R${index} { child: ${expression} }`;
  }
  return `${declarations.join("\n")}\npure flow make() -> R0 contract { effects {} } { return ${expression} }`;
}

function wideRecordFixture(exportCount) {
  const names = Array.from({ length: 64 }, (_, index) => `f${index}`);
  const record = `record Wide { ${names.map((name) => `${name}: Int`).join(", ")} }`;
  const value = `Wide { ${names.map((name, index) => `${name}: ${index}`).join(", ")} }`;
  const flows = Array.from({ length: exportCount }, (_, index) =>
    `pure flow make${index}() -> Wide contract { effects {} } { return ${value} }`,
  );
  return `${record}\n${flows.join("\n")}`;
}

function ownedReturnSectionCount(wasm) {
  const module = new WebAssembly.Module(wasm);
  return WebAssembly.Module.customSections(module, "fungi.owned-returns.v1").length;
}

function encodeU32(value) {
  const bytes = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 0x80);
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function appendOwnedReturnMetadata(wasm, exports) {
  const encoder = new TextEncoder();
  const name = encoder.encode("fungi.owned-returns.v1");
  const data = encoder.encode(JSON.stringify({ version: 1, exports }));
  const payload = Uint8Array.from([
    ...encodeU32(name.length), ...name, ...data,
  ]);
  const section = Uint8Array.from([0, ...encodeU32(payload.length), ...payload]);
  const output = new Uint8Array(wasm.length + section.length);
  output.set(wasm);
  output.set(section, wasm.length);
  return output;
}

function assertSourceChecks(program) {
  assert.deepEqual((program.diagnostics ?? []).filter((item) => item.severity === "error"), []);
  const resolutionDiagnostics = L.resolveSymbols(program.ast).diagnostics
    .filter((item) => item.severity === "error");
  assert.deepEqual(resolutionDiagnostics, [], JSON.stringify(resolutionDiagnostics));
  const typeDiagnostics = L.checkTypes(program.ast).diagnostics
    .filter((item) => item.severity === "error");
  assert.deepEqual(typeDiagnostics, [], JSON.stringify(typeDiagnostics));
}

async function assembleSource(source, filename, { onEmit = () => {} } = {}) {
  const program = L.parseProgram(source, filename);
  assertSourceChecks(program);
  onEmit();
  const effects = L.checkEffects(program.flows, program.ast);
  const { gir } = L.emitGIR(program.ast, program.flows, effects);
  const module = L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true);
  const assembled = await L.assembleWATModule(module);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  return assembled;
}

test("owned-return source path refuses type-invalid Fungi before WAT emission", async () => {
  const source = `pure flow invalid() -> Int contract { effects {} } {
  return "not an Int"
}`;
  let emissionReached = false;
  await assert.rejects(
    () => assembleSource(source, "owned-return-type-error.fungi", {
      onEmit: () => { emissionReached = true; },
    }),
    /FUNGI-TYPE-008/,
  );
  assert.equal(emissionReached, false, "type errors stop the helper before effects/GIR/WAT emission");
});

test("owned-return source path refuses unresolved Fungi before WAT emission", async () => {
  const source = `pure flow invalid() -> Int contract { effects {} } {
  return missingValue
}`;
  let emissionReached = false;
  await assert.rejects(
    () => assembleSource(source, "owned-return-name-error.fungi", {
      onEmit: () => { emissionReached = true; },
    }),
    /FUNGI-NAME-001/,
  );
  assert.equal(emissionReached, false, "symbol-resolution errors stop the helper before effects/GIR/WAT emission");
});

test("non-secret compiled record return is admitted, copied, then wiped on early and tail returns", async () => {
  const source = `record Inner { y: Int }
record Point { x: Int, inner: Inner }
pure flow makePoint(early: Bool, x: Int, y: Int) -> Point contract { effects {} } {
  if early { return Point { x: x, inner: Inner { y: y } } }
  return Point { x: x + 1, inner: Inner { y: y + 1 } }
  }`;
  const program = L.parseProgram(source, "owned-return.fungi");
  assertSourceChecks(program);
  const effects = L.checkEffects(program.flows, program.ast);
  const { gir } = L.emitGIR(program.ast, program.flows, effects);
  const module = L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true);
  const wat = L.renderWAT(module);
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  const ownedAssembled = await L.assembleWATModule(module);
  assert.equal(ownedAssembled.valid, true, JSON.stringify(ownedAssembled.diagnostics));
  assert.equal(ownedAssembled.sourceWAT, wat, "owned metadata is bound after normal WAT assembly");

  const driftedFunction = module.functions.find((candidate) => candidate.name === "makePoint");
  assert.ok(driftedFunction, "the checked compiler output contains makePoint");
  const checkedBody = driftedFunction.body;
  const nestedStore = "(i32.store (i32.add (local.get $__fungi_rec_2) (i32.const 4)) (block (result i32)";
  assert.ok(checkedBody.includes(nestedStore), "the checked output stores the nested record pointer in field two");
  driftedFunction.body = checkedBody.replace(nestedStore, nestedStore.replace("i32.const 4", "i32.const 0"));
  const driftedAssembly = await L.assembleWATModule(module);
  assert.equal(driftedAssembly.valid, true, JSON.stringify(driftedAssembly.diagnostics));
  const { publicKeyPem: driftPublicKeyPem, privateKeyPem: driftPrivateKeyPem } = generateRunnerKeypair();
  await assert.rejects(() => admitAndInstantiate({
    wasm: driftedAssembly.wasm,
    attestation: signWasm(driftedAssembly.wasm, driftPrivateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem: driftPublicKeyPem },
    host: createHostRuntime(),
    requireOwnedReturnSchemas: true,
  }), (error) => {
    driftedFunction.body = checkedBody;
    assert.match(error.message, /strict admission requires attested owned-return metadata/i);
    return true;
  });
  driftedFunction.body = checkedBody;

  // Inspect the compiler-produced allocation before cleanup, then verify the
  // emitted helper wipes exactly the live heap extent and leaves an adjacent
  // canary beyond that extent untouched. This is a raw test witness, not an
  // admitted execution path.
  const rawHost = createHostRuntime();
  const raw = await WebAssembly.instantiate(assembled.wasm, rawHost.imports);
  const rawMemory = raw.instance.exports.memory;
  const rawView = new DataView(rawMemory.buffer);
  const canaryAddress = WAT_HEAP_BASE + 64;
  rawView.setInt32(canaryAddress, 0x5a5a5a5a, true);
  const rawPointer = raw.instance.exports.makePoint(1, 7, 9);
  assert.equal(rawPointer, WAT_HEAP_BASE, "first owned record begins at the declared heap base");
  const innerPointer = rawView.getInt32(rawPointer + 4, true);
  const heapEnd = raw.instance.exports.__fungi_heap_get();
  assert.ok(innerPointer >= WAT_HEAP_BASE + 8 && innerPointer < heapEnd, "nested record lies inside the allocated extent");
  assert.equal(rawView.getInt32(rawPointer, true), 7);
  assert.equal(rawView.getInt32(innerPointer, true), 9);

  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestedWasm = ownedAssembled.wasm;
  const admissionCases = [
    {
      name: "legacy caller-supplied layout",
      wasm: assembled.wasm,
      options: { returnLayouts: { makePoint: [{ kind: "i32" }, { kind: "record", fields: [{ kind: "i32" }] }] } },
    },
    {
      name: "signed attested owned-return schema",
      wasm: attestedWasm,
      options: { requireOwnedReturnSchemas: true },
    },
  ];

  for (const admissionCase of admissionCases) {
    const host = createHostRuntime();
    const admitted = await admitAndInstantiate({
      wasm: admissionCase.wasm,
      attestation: signWasm(admissionCase.wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host,
      ...admissionCase.options,
    });

    const assertCopiedAndWiped = (early, expected) => {
      assert.deepEqual(admitted.instance.exports.makePoint(early, 7, 9), expected, admissionCase.name);
      const snapshot = host.snapshotMemory();
      const view = new DataView(snapshot.buffer, snapshot.byteOffset, snapshot.byteLength);
      assert.equal(view.getInt32(WAT_HEAP_BASE, true), 0, `${admissionCase.name}: copied x field is wiped`);
      assert.equal(view.getInt32(WAT_HEAP_BASE + 4, true), 0, `${admissionCase.name}: nested pointer slot is wiped`);
      assert.equal(view.getInt32(WAT_HEAP_BASE + 8, true), 0, `${admissionCase.name}: nested y field is wiped`);
    };
    assertCopiedAndWiped(1, [7, [9]]);
    assertCopiedAndWiped(0, [8, [10]]);
  }

  raw.instance.exports.__fungi_wipe_owned();
  assert.deepEqual(
    [rawView.getInt32(rawPointer, true), rawView.getInt32(rawPointer + 4, true), rawView.getInt32(innerPointer, true)],
    [0, 0, 0],
    "the emitted cleanup helper wipes the outer record, nested pointer slot and child value",
  );
  assert.equal(rawView.getInt32(canaryAddress, true), 0x5a5a5a5a, "cleanup leaves memory beyond the owned extent unchanged");
});

test("scalar-only owned-return metadata does not require a heap-wipe export", async () => {
  const source = `pure flow add(x: Int) -> Int contract { effects {} } {
  return x + 1
}`;
  const program = L.parseProgram(source, "owned-scalar-return.fungi");
  assertSourceChecks(program);
  const effects = L.checkEffects(program.flows, program.ast);
  const { gir } = L.emitGIR(program.ast, program.flows, effects);
  const module = L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", program.ast, true);
  const assembled = await L.assembleWATModule(module);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));

  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const admitted = await admitAndInstantiate({
    wasm: assembled.wasm,
    attestation: signWasm(assembled.wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
    requireOwnedReturnSchemas: true,
  });
  assert.equal(admitted.instance.exports.add(7), 8);
});

test("cyclic owned-return data refuses publication and still wipes guest memory", async () => {
  const assembled = await L.assembleWAT(`(module
    (memory (export "memory") 1)
    (data (i32.const ${WAT_HEAP_BASE}) "\\00\\04\\00\\00")
    (func (export "makeLoop") (result i32) (i32.const ${WAT_HEAP_BASE}))
    (func (export "__fungi_wipe_owned")
      (i32.store (i32.const ${WAT_HEAP_BASE}) (i32.const 0)))
  )`);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  const wasm = appendOwnedReturnMetadata(assembled.wasm, {
    makeLoop: {
      kind: "record",
      fields: [{ kind: "record", fields: [{ kind: "i32" }] }],
    },
  });
  assert.equal(WebAssembly.validate(wasm), true);

  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const host = createHostRuntime();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
    requireOwnedReturnSchemas: true,
  });
  const before = new DataView(host.snapshotMemory().buffer);
  assert.equal(before.getInt32(WAT_HEAP_BASE, true), WAT_HEAP_BASE, "fixture contains a self-referential record pointer");

  assert.throws(() => admitted.instance.exports.makeLoop(), /snapshot contains a record cycle/);
  const after = new DataView(host.snapshotMemory().buffer);
  assert.equal(after.getInt32(WAT_HEAP_BASE, true), 0, "cycle refusal still runs the owned-memory cleanup export");
});

test("compiler refuses owned-return schemas outside runtime depth and node accounting", async (t) => {
  await t.test("a scalar leaf at the maximum admitted schema depth remains usable", async () => {
    const assembled = await assembleSource(nestedRecordFixture(8), "owned-depth-limit.fungi");
    const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
    const admitted = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation: signWasm(assembled.wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
      requireOwnedReturnSchemas: true,
    });
    let expected = 7;
    for (let index = 0; index < 8; index += 1) expected = [expected];
    assert.deepEqual(admitted.instance.exports.make(), expected);
  });

  await t.test("a scalar leaf beyond the runtime depth bound is not advertised", async () => {
    const assembled = await assembleSource(nestedRecordFixture(9), "owned-depth-overflow.fungi");
    const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
    await assert.rejects(() => admitAndInstantiate({
      wasm: assembled.wasm,
      attestation: signWasm(assembled.wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
      requireOwnedReturnSchemas: true,
    }), /strict admission requires attested owned-return metadata/i);
  });

  await t.test("63 wide exports fit the runtime node bound", async () => {
    const assembled = await assembleSource(wideRecordFixture(63), "owned-node-limit.fungi");
    assert.equal(ownedReturnSectionCount(assembled.wasm), 1);
    const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
    const admitted = await admitAndInstantiate({
      wasm: assembled.wasm,
      attestation: signWasm(assembled.wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
      requireOwnedReturnSchemas: true,
    });
    assert.equal(admitted.instance.exports.make0().length, 64);
  });

  await t.test("64 wide exports exceed the runtime node bound and are not advertised", async () => {
    const assembled = await assembleSource(wideRecordFixture(64), "owned-node-overflow.fungi");
    assert.equal(ownedReturnSectionCount(assembled.wasm), 0);
    const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
    await assert.rejects(() => admitAndInstantiate({
      wasm: assembled.wasm,
      attestation: signWasm(assembled.wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
      requireOwnedReturnSchemas: true,
    }), /strict admission requires attested owned-return metadata/i);
  });

  await t.test("exactly 4,096 schema nodes are admitted and 4,097 are refused", async () => {
    const wide = wideRecordFixture(63);
    const scalar = (name) => `pure flow ${name}() -> Int contract { effects {} } { return 7 }`;
    const atLimit = await assembleSource(`${wide}\n${scalar("scalar0")}`, "owned-node-exact-limit.fungi");
    assert.equal(ownedReturnSectionCount(atLimit.wasm), 1);
    const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
    const admitted = await admitAndInstantiate({
      wasm: atLimit.wasm,
      attestation: signWasm(atLimit.wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
      requireOwnedReturnSchemas: true,
    });
    assert.equal(admitted.instance.exports.scalar0(), 7);

    const overLimit = await assembleSource(`${wide}\n${scalar("scalar0")}\n${scalar("scalar1")}`, "owned-node-over-limit.fungi");
    assert.equal(ownedReturnSectionCount(overLimit.wasm), 0);
    await assert.rejects(() => admitAndInstantiate({
      wasm: overLimit.wasm,
      attestation: signWasm(overLimit.wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
      requireOwnedReturnSchemas: true,
    }), /strict admission requires attested owned-return metadata/i);
  });

  await t.test("a signed mixed scalar/record schema without cleanup is refused", async () => {
    const assembled = await L.assembleWAT(`(module
      (memory (export "memory") 1)
      (func (export "scalar") (result i32) (i32.const 7))
      (func (export "record") (result i32) (i32.const 1024))
    )`);
    assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
    const wasm = appendOwnedReturnMetadata(assembled.wasm, {
      scalar: { kind: "i32" },
      record: { kind: "record", fields: [{ kind: "i32" }] },
    });
    assert.equal(WebAssembly.validate(wasm), true);
    assert.equal(ownedReturnSectionCount(wasm), 1);

    const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
    await assert.rejects(() => admitAndInstantiate({
      wasm,
      attestation: signWasm(wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
      requireOwnedReturnSchemas: true,
    }), /attested owned-return metadata requires the owned-memory cleanup export/i);
  });
});
