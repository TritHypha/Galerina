import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  sha256Canonical,
  sha256Raw,
} from "../lib/logic-aig-source-origin/contract.mjs";
import {
  buildSemanticRows,
  decodeHostProject,
} from "../lib/logic-aig-source-origin/host-decoder.mjs";

const GOVERNANCE = new URL("../../governance/", import.meta.url);
const TYPESCRIPT_ENTRY = new URL("../../packages-ts/galerina-core-compiler/node_modules/typescript/lib/typescript.js", import.meta.url);
const SNAPSHOT_MAP = Map;
const SNAPSHOT_MAP_SET = Map.prototype.set;
const SNAPSHOT_REFLECT_APPLY = Reflect.apply;

function mutableBlobSnapshot(capability) {
  const snapshot = new SNAPSHOT_MAP();
  const iterator = capability.entries();
  while (true) {
    const step = iterator.next();
    if (step.done) return snapshot;
    const pair = step.value;
    SNAPSHOT_REFLECT_APPLY(SNAPSHOT_MAP_SET, snapshot, [pair[0], pair[1]]);
  }
}

async function policy(name) {
  return JSON.parse(await readFile(new URL(name, GOVERNANCE), "utf8"));
}

function row(path, bytes) {
  return {
    path,
    mode: "100644",
    blobOid: createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex"),
    objectFormat: "sha1",
    byteLength: bytes.length,
    rawSha256: sha256Raw(bytes),
  };
}

async function fixtureOptions(sourceTexts) {
  const [repositoryIdentity, sourcePolicy, resolutionPolicy, parserPolicy, pins] = await Promise.all([
    policy("logic-aig-source-origin-repository-identity.json"),
    policy("logic-aig-source-origin-source-policy.json"),
    policy("logic-aig-source-origin-resolution-policy.json"),
    policy("logic-aig-source-origin-parser-policy.json"),
    policy("logic-aig-source-origin-toolchain-pins.json"),
  ]);
  const record = pins.records.find((candidate) => candidate.platform === process.platform && candidate.arch === process.arch);
  assert(record);
  const entries = Object.entries(sourceTexts)
    .map(([path, text]) => [path, Buffer.from(text, "utf8")])
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const rows = entries.map(([path, bytes], index) => row(path, bytes, index + 1));
  const sourceBody = {
    schema: "galerina.logic-aig-source-manifest.v1",
    repositoryId: `repository:${repositoryIdentity.identityDigest}`,
    expectedHead: "a".repeat(40),
    expectedTree: "b".repeat(40),
    objectFormat: "sha1",
    policyDigest: sourcePolicy.policyDigest,
    exclusionDigest: sha256Canonical("galerina.logic-aig-exclusions.v1", sourcePolicy.exclusions),
    rows,
    counts: {
      paths: rows.length,
      blobs: rows.length,
      bytes: rows.reduce((sum, item) => sum + item.byteLength, 0),
      mode100644: rows.length,
      mode100755: 0,
      exclusions: 0,
    },
    authorizing: false,
  };
  const sourceManifest = { ...sourceBody, manifestDigest: sha256Canonical(sourceBody.schema, sourceBody) };
  const resolutionBody = {
    schema: "galerina.logic-aig-resolution-inputs.v1",
    repositoryId: sourceBody.repositoryId,
    expectedHead: sourceBody.expectedHead,
    expectedTree: sourceBody.expectedTree,
    policyDigest: resolutionPolicy.policyDigest,
    rows: [],
    authorizing: false,
  };
  const resolutionInputs = { ...resolutionBody, resolutionInputsDigest: sha256Canonical(resolutionBody.schema, resolutionBody) };
  const typescriptBytes = await readFile(TYPESCRIPT_ENTRY);
  return {
    repositoryIdentity,
    sourcePolicy,
    resolutionPolicy,
    parserPolicy,
    pins,
    sourceManifest,
    sourceBlobs: new Map(entries),
    resolutionInputs,
    resolutionBlobs: new Map(),
    toolchainBlobs: new Map([[record.typescript.entryLocator, typescriptBytes]]),
    platform: record.platform,
    arch: record.arch,
    nodeIdentity: structuredClone(record.nodeIdentity),
    gitIdentity: structuredClone(record.gitIdentity),
  };
}

function expectRefusal(operation, pattern = /^SOURCE_ORIGIN_HOST_[A-Z0-9_]+$/) {
  return assert.rejects(operation, (error) => {
    assert.match(error?.code ?? "", pattern);
    return true;
  });
}

async function semanticRowOptions() {
  const [parserPolicy, resolutionPolicy] = await Promise.all([
    policy("logic-aig-source-origin-parser-policy.json"),
    policy("logic-aig-source-origin-resolution-policy.json"),
  ]);
  const bytes = Buffer.from("x", "utf8");
  const sourceRow = row("src/nested.ts", bytes);
  return {
    repositoryId: `repository:${"a".repeat(64)}`,
    parserId: "typescript-compiler-api",
    sourceRows: [sourceRow],
    parseResults: [{ path: sourceRow.path, status: "PARSED", diagnosticCodes: [] }],
    declarations: [],
    relations: [],
    parserPolicy,
    resolutionPolicy,
  };
}

function capturedFailure(operation) {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return undefined;
}

function semanticDeclaration(overrides = {}) {
  return {
    key: "declaration-a",
    path: "src/nested.ts",
    parentKey: null,
    kind: "FUNCTION",
    name: "a",
    parserNodeKind: "FunctionDeclaration",
    startByte: 0,
    endByte: 1,
    preorderOrdinal: 0,
    ...overrides,
  };
}

function semanticRelation(overrides = {}) {
  return {
    path: "src/nested.ts",
    ownerNativeKey: null,
    relationshipClass: "CALLER",
    startByte: 0,
    endByte: 1,
    targetNativeKeys: [],
    targetPaths: [],
    targetState: "DYNAMIC",
    ...overrides,
  };
}

function expectSemanticRefusal(options) {
  let result;
  assert.throws(
    () => { result = buildSemanticRows(options); },
    (error) => error?.code === "SOURCE_ORIGIN_HOST_SEMANTIC",
  );
  assert.equal(result, undefined);
}

function task6BCopyPropertyDescriptor(descriptor) {
  if (descriptor === undefined) return undefined;
  const copy = Object.create(null);
  for (const field of ["configurable", "enumerable", "value", "writable", "get", "set"]) {
    if (Object.hasOwn(descriptor, field)) copy[field] = descriptor[field];
  }
  return copy;
}

function installTask6BDescriptorFieldPoison() {
  const safeCreate = Object.create;
  const safeDefineProperty = Object.defineProperty;
  const safeDeleteProperty = Reflect.deleteProperty;
  const safeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const originals = safeCreate(null);
  originals.get = task6BCopyPropertyDescriptor(
    safeGetOwnPropertyDescriptor(Object.prototype, "get"),
  );
  originals.set = task6BCopyPropertyDescriptor(
    safeGetOwnPropertyDescriptor(Object.prototype, "set"),
  );
  let getTraps = 0;
  let setTraps = 0;
  const getDescriptor = safeCreate(null);
  getDescriptor.configurable = true;
  getDescriptor.enumerable = false;
  getDescriptor.get = function task6BInheritedGet() {
    getTraps += 1;
    return undefined;
  };
  safeDefineProperty(Object.prototype, "get", getDescriptor);
  const setDescriptor = safeCreate(null);
  setDescriptor.configurable = true;
  setDescriptor.enumerable = false;
  setDescriptor.get = function task6BInheritedSet() {
    setTraps += 1;
    return undefined;
  };
  safeDefineProperty(Object.prototype, "set", setDescriptor);
  const controller = safeCreate(null);
  controller.counts = () => ({ get: getTraps, set: setTraps });
  controller.restore = () => {
    for (const field of ["get", "set"]) {
      if (originals[field] === undefined) safeDeleteProperty(Object.prototype, field);
      else safeDefineProperty(Object.prototype, field, originals[field]);
    }
  };
  return controller;
}

test("Task 6B host decoder descriptors ignore inherited fields", { timeout: 180_000 }, async () => {
  const semanticOptions = await semanticRowOptions();
  const expectedSemantic = buildSemanticRows(semanticOptions);
  const hostOptions = await fixtureOptions({
    "src/task-6b-descriptor.ts": "export const task6BDescriptor = 1;\n",
  });
  const expectedHost = await decodeHostProject(hostOptions);
  let semanticResult;
  let semanticFailure;
  let hostResult;
  let hostFailure;
  let semanticRefusalResult;
  let semanticRefusal;
  let hostRefusalResult;
  let hostRefusal;
  let counts;
  const poison = installTask6BDescriptorFieldPoison();
  try {
    try { semanticResult = buildSemanticRows(semanticOptions); } catch (error) { semanticFailure = error; }
    try { hostResult = await decodeHostProject(hostOptions); } catch (error) { hostFailure = error; }
    try { semanticRefusalResult = buildSemanticRows({}); } catch (error) { semanticRefusal = error; }
    try { hostRefusalResult = await decodeHostProject({}); } catch (error) { hostRefusal = error; }
  } finally {
    counts = poison.counts();
    poison.restore();
  }
  assert.deepEqual(counts, { get: 0, set: 0 });
  assert.equal(semanticFailure, undefined);
  assert.deepEqual(semanticResult, expectedSemantic);
  assert.equal(hostFailure, undefined);
  assert.deepEqual(hostResult, expectedHost);
  assert.equal(semanticRefusalResult, undefined);
  assert.equal(semanticRefusal?.name, "HostDecoderRefusal");
  assert.equal(semanticRefusal?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
  assert.equal(hostRefusalResult, undefined);
  assert.equal(hostRefusal?.name, "HostDecoderRefusal");
  assert.equal(hostRefusal?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
});

test("semantic-row boundary refuses proxy and accessor options before caller effects", async (t) => {
  await t.test("proxy", () => {
    let effects = 0;
    const hostile = new Proxy({}, {
      get(_target, _key) {
        effects += 1;
        return undefined;
      },
    });
    assert.throws(() => buildSemanticRows(hostile));
    assert.equal(effects, 0);
  });
  await t.test("accessor", () => {
    let effects = 0;
    const hostile = {};
    for (const key of [
      "repositoryId", "parserId", "sourceRows", "parseResults",
      "declarations", "relations", "parserPolicy", "resolutionPolicy",
    ]) {
      Object.defineProperty(hostile, key, {
        enumerable: true,
        get() {
          effects += 1;
          return undefined;
        },
      });
    }
    assert.throws(() => buildSemanticRows(hostile));
    assert.equal(effects, 0);
  });
});

test("eighth-review HOST public boundaries close Object and pooled Buffer dispatch", async (t) => {
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;

  await t.test("buildSemanticRows snapshots Object.getPrototypeOf", () => {
    const descriptor = safeGetDescriptor(Object, "getPrototypeOf");
    let effects = 0;
    let failure;
    safeDefineProperty(Object, "getPrototypeOf", {
      ...descriptor,
      value() {
        effects += 1;
        throw new Error("ATTACKER_OBJECT_GETPROTO");
      },
    });
    try { buildSemanticRows({}); } catch (error) { failure = error; }
    finally { safeDefineProperty(Object, "getPrototypeOf", descriptor); }
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
  });

  await t.test("decodeHostProject snapshots Object.getPrototypeOf", async () => {
    const descriptor = safeGetDescriptor(Object, "getPrototypeOf");
    let effects = 0;
    let failure;
    safeDefineProperty(Object, "getPrototypeOf", {
      ...descriptor,
      value() {
        effects += 1;
        throw new Error("ATTACKER_OBJECT_GETPROTO");
      },
    });
    try { await decodeHostProject({}); } catch (error) { failure = error; }
    finally { safeDefineProperty(Object, "getPrototypeOf", descriptor); }
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
  });

  await t.test("a synced isProxy replacement cannot expose a HOST option Proxy", async () => {
    const { createRequire, syncBuiltinESMExports } = await import("node:module");
    const require = createRequire(import.meta.url);
    const types = require("node:util/types");
    const descriptor = safeGetDescriptor(types, "isProxy");
    let effects = 0;
    let proxyTraps = 0;
    let failure;
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        proxyTraps += 1;
        throw new Error("ATTACKER_PROXY_GETPROTO");
      },
    });
    safeDefineProperty(types, "isProxy", {
      ...descriptor,
      value() {
        effects += 1;
        return false;
      },
    });
    syncBuiltinESMExports();
    try { buildSemanticRows(hostile); } catch (error) { failure = error; }
    finally {
      safeDefineProperty(types, "isProxy", descriptor);
      syncBuiltinESMExports();
    }
    assert.equal(effects, 0);
    assert.equal(proxyTraps, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
  });

  await t.test("semantic name encoding does not call pooled Buffer.from", async () => {
    const options = await semanticRowOptions();
    options.declarations = [semanticDeclaration({ name: "é" })];
    const descriptor = safeGetDescriptor(Buffer, "from");
    let effects = 0;
    let failure;
    let result;
    safeDefineProperty(Buffer, "from", {
      ...descriptor,
      value() {
        effects += 1;
        throw new Error("ATTACKER_BUFFER_FROM");
      },
    });
    try { result = buildSemanticRows(options); } catch (error) { failure = error; }
    finally { safeDefineProperty(Buffer, "from", descriptor); }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assert.equal(result?.nodes.length, 2);
  });
});

test("ninth-review descriptor gates require own data values in HOST inputs", { timeout: 30_000 }, async () => {
  const options = await fixtureOptions({
    "src/descriptor.ts": "export const descriptor = 1;\n",
  });
  let inputEffects = 0;
  Object.defineProperty(options, "repositoryIdentity", {
    configurable: true,
    enumerable: true,
    get() {
      inputEffects += 1;
      throw new Error("ATTACKER_INPUT_VALUE");
    },
  });
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;
  const inherited = safeGetDescriptor(Object.prototype, "value");
  let descriptorEffects = 0;
  let failure;
  safeDefineProperty(Object.prototype, "value", {
    configurable: true,
    get() {
      descriptorEffects += 1;
      throw new Error("ATTACKER_DESCRIPTOR_VALUE");
    },
  });
  try { await decodeHostProject(options); } catch (error) { failure = error; }
  finally {
    if (inherited) safeDefineProperty(Object.prototype, "value", inherited);
    else delete Object.prototype.value;
  }
  assert.equal(inputEffects, 0);
  assert.equal(descriptorEffects, 0);
  assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
});

test("twelfth-review HOST async result boundary ignores inherited then capabilities", { timeout: 120_000 }, async (t) => {
  const options = await fixtureOptions({
    "src/async-boundary.ts": "export const asyncBoundary = 1;\n",
  });
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;
  const safeDeleteProperty = Reflect.deleteProperty;
  const safeHasOwn = Object.hasOwn;
  const prior = safeGetDescriptor(Object.prototype, "then");

  try {
    await t.test("inherited getter has zero effects", async () => {
      let effects = 0;
      let failure;
      let result;
      safeDefineProperty(Object.prototype, "then", {
        configurable: true,
        get() {
          if (safeHasOwn(this, "actualRuntimeLoadSet") && safeHasOwn(this, "nodes")) effects += 1;
          return undefined;
        },
      });
      try { result = await decodeHostProject(options); } catch (error) { failure = error; }
      finally { safeDeleteProperty(Object.prototype, "then"); }
      assert.equal(effects, 0);
      assert.equal(failure, undefined);
      assert.equal(result?.authorizing, false);
    });

    await t.test("inherited data function cannot substitute the result", async () => {
      const injected = Object.create(null);
      Object.defineProperty(injected, "authorizing", { enumerable: true, value: true });
      let effects = 0;
      let failure;
      let result;
      safeDefineProperty(Object.prototype, "then", {
        configurable: true,
        value(resolve) {
          if (safeHasOwn(this, "actualRuntimeLoadSet") && safeHasOwn(this, "nodes")) {
            effects += 1;
            resolve(injected);
            return;
          }
          safeDefineProperty(this, "then", { configurable: true, value: undefined });
          resolve(this);
          safeDeleteProperty(this, "then");
        },
        writable: true,
      });
      try { result = await decodeHostProject(options); } catch (error) { failure = error; }
      finally { safeDeleteProperty(Object.prototype, "then"); }
      assert.equal(effects, 0);
      assert.equal(failure, undefined);
      assert.notEqual(result, injected);
      assert.equal(result?.authorizing, false);
    });
  } finally {
    safeDeleteProperty(Object.prototype, "then");
    if (prior) safeDefineProperty(Object.prototype, "then", prior);
  }
});

test("ninth-review HOST native file boundary rejects typed-array prototype drift without effects", { timeout: 120_000 }, async () => {
  const options = await fixtureOptions({
    "src/native-boundary.ts": "export const nativeBoundary = 1;\n",
  });
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;
  const descriptor = safeGetDescriptor(typedArrayPrototype, "buffer");
  assert.equal(typeof descriptor?.get, "function");
  let effects = 0;
  let failure;
  let result;
  safeDefineProperty(typedArrayPrototype, "buffer", {
    ...descriptor,
    get() {
      effects += 1;
      return Reflect.apply(descriptor.get, this, []);
    },
  });
  try { result = await decodeHostProject(options); } catch (error) { failure = error; }
  finally { safeDefineProperty(typedArrayPrototype, "buffer", descriptor); }
  assert.equal(effects, 0);
  assert.equal(result, undefined);
  assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_TOOLCHAIN");
});

test("ninth-review HOST child setup and result handling avoid inherited properties", { timeout: 120_000 }, async (t) => {
  const options = await fixtureOptions({
    "src/child-boundary.ts": "export const childBoundary = 1;\n",
  });
  const { createRequire, syncBuiltinESMExports } = await import("node:module");
  const require = createRequire(import.meta.url);
  const childProcess = require("node:child_process");
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;
  const safeDeleteProperty = Reflect.deleteProperty;
  const spawnDescriptor = safeGetDescriptor(childProcess, "spawnSync");
  let observed;
  safeDefineProperty(childProcess, "spawnSync", {
    ...spawnDescriptor,
    value(file, argv, childOptions) {
      observed = {
        argvPrototype: Object.getPrototypeOf(argv),
        optionsPrototype: Object.getPrototypeOf(childOptions),
        environmentPrototype: Object.getPrototypeOf(childOptions.env),
        stdioPrototype: Object.getPrototypeOf(childOptions.stdio),
      };
      return Reflect.apply(spawnDescriptor.value, this, [file, argv, childOptions]);
    },
  });
  syncBuiltinESMExports();
  let freshDecoder;
  try { freshDecoder = await import("../lib/logic-aig-source-origin/host-decoder.mjs?ninth-review-child-boundary"); }
  finally {
    safeDefineProperty(childProcess, "spawnSync", spawnDescriptor);
    syncBuiltinESMExports();
  }
  await t.test("spawn receives closed option records", async () => {
    const result = await freshDecoder.decodeHostProject(options);
    assert.deepEqual({
      argvExact: observed?.argvPrototype === Array.prototype,
      stdioExact: observed?.stdioPrototype === Array.prototype,
      optionsNull: observed?.optionsPrototype === null,
      environmentNull: observed?.environmentPrototype === null,
    }, {
      argvExact: true,
      stdioExact: true,
      optionsNull: true,
      environmentNull: true,
    });
    assert.equal(result.authorizing, false);
  });

  await t.test("inherited result getter is rejected before spawn", async () => {
    const priorError = safeGetDescriptor(Object.prototype, "error");
    let errorEffects = 0;
    let failure;
    let result;
    observed = undefined;
    safeDefineProperty(Object.prototype, "error", {
      configurable: true,
      get() {
        errorEffects += 1;
        return undefined;
      },
      set(value) {
        safeDefineProperty(this, "error", { configurable: true, enumerable: true, writable: true, value });
      },
    });
    try { result = await freshDecoder.decodeHostProject(options); } catch (error) { failure = error; }
    finally {
      if (priorError) safeDefineProperty(Object.prototype, "error", priorError);
      else safeDeleteProperty(Object.prototype, "error");
    }
    assert.equal(errorEffects, 0);
    assert.equal(observed, undefined);
    assert.equal(result, undefined);
    assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_TOOLCHAIN");
  });
});

test("ninth-review HOST accepts a case-only spelling of the same Windows executable", {
  timeout: 120_000,
  skip: process.platform !== "win32",
}, async () => {
  const options = await fixtureOptions({
    "src/windows-case.ts": "export const windowsCase = 1;\n",
  });
  const descriptor = Object.getOwnPropertyDescriptor(process, "execPath");
  assert(descriptor);
  const actual = process.execPath;
  const alternate = actual.replace(/([A-Za-z])(?=[^\\/]*$)/u, (letter) => letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase());
  assert.notEqual(alternate, actual);
  assert.equal(alternate.toLowerCase(), actual.toLowerCase());
  Object.defineProperty(process, "execPath", { ...descriptor, value: alternate });
  let freshDecoder;
  try { freshDecoder = await import("../lib/logic-aig-source-origin/host-decoder.mjs?ninth-review-windows-case"); }
  finally { Object.defineProperty(process, "execPath", descriptor); }
  const result = await freshDecoder.decodeHostProject(options);
  assert.equal(result.authorizing, false);
});

test("semantic-row boundary captures every nested public input before iteration", async (t) => {
  const valid = await semanticRowOptions();
  await t.test("proxied source array", () => {
    let effects = 0;
    const sourceRows = new Proxy(valid.sourceRows, {
      get(target, key, receiver) {
        effects += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const failure = capturedFailure(() => buildSemanticRows({ ...valid, sourceRows }));
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
  });
  await t.test("accessor source row", () => {
    let effects = 0;
    const sourceRow = { ...valid.sourceRows[0] };
    Object.defineProperty(sourceRow, "path", {
      enumerable: true,
      get() {
        effects += 1;
        return "src/nested.ts";
      },
    });
    const failure = capturedFailure(() => buildSemanticRows({ ...valid, sourceRows: [sourceRow] }));
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
  });
  await t.test("sparse source array", () => {
    const sourceRows = new Array(1);
    assert.throws(
      () => buildSemanticRows({ ...valid, sourceRows }),
      (error) => error?.code === "SOURCE_ORIGIN_HOST_SCHEMA",
    );
  });
  await t.test("proxied relation target array", () => {
    let effects = 0;
    const targetNativeKeys = new Proxy([], {
      get(target, key, receiver) {
        effects += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const relations = [{
      path: valid.sourceRows[0].path,
      ownerNativeKey: null,
      relationshipClass: "CALLER",
      startByte: 0,
      endByte: 1,
      targetNativeKeys,
      targetPaths: [],
      targetState: "DYNAMIC",
    }];
    const failure = capturedFailure(() => buildSemanticRows({ ...valid, relations }));
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
  });
  await t.test("cyclic relation target array", () => {
    const targetPaths = [];
    targetPaths.push(targetPaths);
    const relations = [{
      path: valid.sourceRows[0].path,
      ownerNativeKey: null,
      relationshipClass: "CALLER",
      startByte: 0,
      endByte: 1,
      targetNativeKeys: [],
      targetPaths,
      targetState: "DYNAMIC",
    }];
    assert.throws(
      () => buildSemanticRows({ ...valid, relations }),
      (error) => error?.code === "SOURCE_ORIGIN_HOST_SCHEMA",
    );
  });
  for (const name of ["parserPolicy", "resolutionPolicy"]) {
    await t.test(`proxied ${name}`, () => {
      let effects = 0;
      const hostile = new Proxy({}, {
        get() {
          effects += 1;
          return undefined;
        },
      });
      const failure = capturedFailure(() => buildSemanticRows({ ...valid, [name]: hostile }));
      assert.equal(effects, 0);
      assert.equal(failure?.code, "SOURCE_ORIGIN_HOST_SCHEMA");
    });
  }
});

test("semantic-row boundary closes cross-row conservation invariants before rendering", async (t) => {
  const valid = await semanticRowOptions();
  const sourcePath = valid.sourceRows[0].path;
  const secondBytes = Buffer.from("y", "utf8");
  const secondSource = row("src/second.ts", secondBytes);
  const twoSources = {
    ...valid,
    sourceRows: [...valid.sourceRows, secondSource],
    parseResults: [
      ...valid.parseResults,
      { path: secondSource.path, status: "PARSED", diagnosticCodes: [] },
    ],
  };

  await t.test("source and parse-result sets differ", () => {
    expectSemanticRefusal({
      ...valid,
      parseResults: [
        ...valid.parseResults,
        { path: "src/surplus.ts", status: "PARSED", diagnosticCodes: [] },
      ],
    });
  });

  await t.test("parse status contradicts diagnostics", () => {
    expectSemanticRefusal({
      ...valid,
      parseResults: [{ path: sourcePath, status: "PARSED", diagnosticCodes: ["TS-100"] }],
    });
  });

  await t.test("parser id is outside the owner policy", () => {
    expectSemanticRefusal({ ...valid, parserId: "unowned-parser" });
  });

  await t.test("refused source retains a declaration", () => {
    expectSemanticRefusal({
      ...valid,
      parseResults: [{ path: sourcePath, status: "REFUSED", diagnosticCodes: ["TS-100"] }],
      declarations: [semanticDeclaration()],
    });
  });

  await t.test("declaration parent is missing", () => {
    expectSemanticRefusal({
      ...valid,
      declarations: [semanticDeclaration({ parentKey: "missing-parent" })],
    });
  });

  await t.test("declaration parent belongs to another source", () => {
    expectSemanticRefusal({
      ...twoSources,
      declarations: [
        semanticDeclaration({ key: "child", parentKey: "foreign-parent", preorderOrdinal: 1 }),
        semanticDeclaration({ key: "foreign-parent", path: secondSource.path, name: "foreign" }),
      ],
    });
  });

  await t.test("declaration parents form a cycle", () => {
    expectSemanticRefusal({
      ...valid,
      declarations: [
        semanticDeclaration({ key: "cycle-a", parentKey: "cycle-b", name: "a", preorderOrdinal: 0 }),
        semanticDeclaration({ key: "cycle-b", parentKey: "cycle-a", name: "b", preorderOrdinal: 1 }),
      ],
    });
  });

  await t.test("declaration parent follows its child in preorder", () => {
    expectSemanticRefusal({
      ...valid,
      declarations: [
        semanticDeclaration({ key: "preorder-child", parentKey: "preorder-parent", name: "child", preorderOrdinal: 0 }),
        semanticDeclaration({ key: "preorder-parent", name: "parent", preorderOrdinal: 1 }),
      ],
    });
  });

  await t.test("declarations reuse a source preorder ordinal", () => {
    expectSemanticRefusal({
      ...valid,
      declarations: [
        semanticDeclaration({ key: "ordinal-a", name: "a" }),
        semanticDeclaration({ key: "ordinal-b", name: "b" }),
      ],
    });
  });

  await t.test("relation source is not a parsed source", () => {
    expectSemanticRefusal({
      ...valid,
      relations: [semanticRelation({ path: "src/surplus.ts" })],
    });
  });

  await t.test("relation owner belongs to another source", () => {
    expectSemanticRefusal({
      ...twoSources,
      declarations: [semanticDeclaration({ key: "foreign-owner", path: secondSource.path })],
      relations: [semanticRelation({ ownerNativeKey: "foreign-owner" })],
    });
  });

  await t.test("relation target key is missing", () => {
    expectSemanticRefusal({
      ...valid,
      relations: [semanticRelation({ targetNativeKeys: ["missing-target"] })],
    });
  });

  const targetCases = [
    ["unknown target state", valid, { targetState: "UNKNOWN" }],
    ["RESOLVED has no target", valid, { targetState: "RESOLVED" }],
    ["RESOLVED has two targets", twoSources, { targetState: "RESOLVED", targetPaths: [sourcePath, secondSource.path] }],
    ["AMBIGUOUS has one target", valid, { targetState: "AMBIGUOUS", targetPaths: [sourcePath] }],
    ["MISSING retains a target", valid, { targetState: "MISSING", targetPaths: [sourcePath] }],
    ["OUTSIDE retains a target", valid, { targetState: "OUTSIDE", targetPaths: [sourcePath] }],
    ["RESOLVED repeats one target", valid, { targetState: "RESOLVED", targetPaths: [sourcePath, sourcePath] }],
  ];
  for (const [label, fixture, relation] of targetCases) {
    await t.test(label, () => {
      expectSemanticRefusal({ ...fixture, relations: [semanticRelation(relation)] });
    });
  }
});

test("HOST decoder loads only pinned lib/typescript.js and emits stable file/declaration semantics", async () => {
  const options = await fixtureOptions({
    "src/contracts.ts": [
      'import fs from "node:fs";',
      "export interface Contract { value: string }",
      "export function useContract(value: Contract): string { return value.value }",
    ].join("\n"),
  });
  const result = await decodeHostProject(options);
  assert.equal(result.authorizing, false);
  assert.equal(result.toolchain.domain, "HOST");
  assert.equal(result.toolchain.operation, "typescript-compiler-api");
  assert.deepEqual(result.toolchain.entry, {
    rootLocator: "packages-ts/galerina-core-compiler/node_modules/typescript",
    locator: "lib/typescript.js",
  });
  assert.deepEqual(result.actualRuntimeLoadSet, {
    id: "HOST",
    moduleRows: options.pins.records.find((row) => row.recordId === result.toolchain.recordId).runtimeLoadSets[0].moduleRows,
    builtinModules: options.pins.records.find((row) => row.recordId === result.toolchain.recordId).runtimeLoadSets[0].builtinModules,
  });
  assert(result.nodes.some((node) => node.kind === "FILE" && node.locator === "src/contracts.ts"));
  assert(result.nodes.some((node) => node.kind === "INTERFACE" && node.locator.includes("#INTERFACE!N!Contract")));
  assert(result.nodes.some((node) => node.kind === "FUNCTION" && node.locator.includes("#FUNCTION!N!useContract")));
  assert(result.unresolved.some((item) => item.relationshipClass === "IMPORT" && item.reasonCode === "TARGET_OUTSIDE_SOURCE_DOMAIN"));
  assert.match(result.idMapDigest, /^[0-9a-f]{64}$/);
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result.nodes));
});

test("HOST child preserves governed semantic evidence when repeated locators exceed the process-output ceiling", { timeout: 900_000 }, async () => {
  const callCount = 7_000;
  const sourcePath = `src/${"a".repeat(3_500)}.ts`;
  const options = await fixtureOptions({
    [sourcePath]: [
      "export function target(): number { return 1; }",
      "export function caller(): number {",
      "  let value = 0;",
      "  value += target();\n".repeat(callCount),
      "  return value;",
      "}",
      "",
    ].join("\n"),
  });

  const result = await decodeHostProject(options);

  assert.equal(result.parseResults.length, 1);
  assert.equal(result.parseResults[0].status, "PARSED");
  assert.equal(result.edges.filter((edge) => edge.kind === "CALLER").length, callCount);
  assert.equal(result.unresolved.filter((row) => row.relationshipClass === "CALLER").length, 0);
});

test("HOST checker does not join unrelated property-name has calls", async () => {
  const options = await fixtureOptions({
    "src/has.ts": [
      "const ENVIRONMENT_MODE_SET = new Set<string>();",
      "class GateCache { has(value: string): boolean { return value.length > 0; } }",
      'ENVIRONMENT_MODE_SET.has("production");',
      'new GateCache().has("gate");',
    ].join("\n"),
  });
  const result = await decodeHostProject(options);
  const method = result.nodes.find((node) => node.kind === "METHOD" && node.locator.includes("!has"));
  assert(method);
  const callerEdges = result.edges.filter((edge) => edge.kind === "CALLER" && edge.to === method.id);
  assert.equal(callerEdges.length, 1);
  assert(result.unresolved.some((item) => item.relationshipClass === "CALLER"));
});

test("HOST conserves NewExpression constructor calls as checker-backed relations", async () => {
  const options = await fixtureOptions({
    "src/constructor.ts": [
      "export class Widget {}",
      "export function makeWidget(): Widget {",
      "  return new Widget();",
      "}",
      "",
    ].join("\n"),
  });
  const result = await decodeHostProject(options);
  const widget = result.nodes.find((node) => node.kind === "CLASS" && node.locator.includes("!Widget"));
  const maker = result.nodes.find((node) => node.kind === "FUNCTION" && node.locator.includes("!makeWidget"));
  assert(widget);
  assert(maker);
  const constructorEdges = result.edges.filter((edge) => edge.kind === "CALLER" && edge.from === maker.id && edge.to === widget.id);
  assert.equal(constructorEdges.length, 1);
  assert.equal(
    result.edges.filter((edge) => edge.kind === "CALLER").length
      + result.unresolved.filter((row) => row.relationshipClass === "CALLER").length,
    1,
  );
});

test("HOST locator framing conserves case-distinct declarations under the global fold rule", async () => {
  const options = await fixtureOptions({
    "src/case-bindings.mjs": [
      "export function P() { return 1; }",
      "export function p() { return 2; }",
      "P();",
      "p();",
      "",
    ].join("\n"),
  });
  const result = await decodeHostProject(options);
  const bindings = result.nodes.filter((node) => node.kind === "FUNCTION" && /!N![Pp]!C![01]$/u.test(node.locator));
  assert.equal(bindings.length, 2);
  assert.equal(new Set(bindings.map((node) => node.locator.toLowerCase())).size, 2);
});

test("HOST retains addressable declarations while conserving relations from local implementation bindings", async () => {
  const options = await fixtureOptions({
    "src/addressable.mjs": [
      "export function retained() {",
      "  const local = () => retained();",
      "  return local();",
      "}",
      "",
    ].join("\n"),
  });
  const result = await decodeHostProject(options);
  assert.equal(result.nodes.filter((node) => node.kind === "FUNCTION").length, 1);
  assert.equal(result.nodes.filter((node) => node.kind === "SYMBOL").length, 0);
  assert.equal(result.edges.length + result.unresolved.length, 2);
  assert(result.edges.some((edge) => edge.kind === "CALLER"));
  assert(result.unresolved.some((row) => row.relationshipClass === "CALLER"));
});

test("HOST diagnostics use the policy-owned canonical TypeScript mapping", async () => {
  const options = await fixtureOptions({ "src/broken.ts": "const = ;\n" });
  const result = await decodeHostProject(options);
  assert.equal(result.parseResults.length, 1);
  assert.equal(result.parseResults[0].status, "REFUSED");
  assert(result.parseResults[0].diagnosticCodes.length > 0);
  for (const code of result.parseResults[0].diagnosticCodes) assert.match(code, /^TS-[0-9]{3,5}$/);
  assert.equal(result.nodes.filter((node) => node.kind !== "FILE").length, 0);
});

test("HOST refuses source or runtime byte drift before returning semantic or toolchain artifacts", async () => {
  const options = await fixtureOptions({ "src/clean.ts": "export const clean = true;\n" });
  const sourceDrift = { ...options, sourceBlobs: mutableBlobSnapshot(options.sourceBlobs) };
  sourceDrift.sourceBlobs.set("src/clean.ts", Buffer.from("drift", "utf8"));
  await expectRefusal(decodeHostProject(sourceDrift), /^SOURCE_ORIGIN_GIT_BLOB_SET$/);

  const runtimeDrift = { ...options, toolchainBlobs: mutableBlobSnapshot(options.toolchainBlobs) };
  runtimeDrift.toolchainBlobs.set(options.pins.records.find((row) => row.platform === process.platform).typescript.entryLocator, Buffer.from("module.exports = {};", "utf8"));
  let result;
  await expectRefusal(decodeHostProject(runtimeDrift), /^SOURCE_ORIGIN_HOST_TOOLCHAIN$/);
  assert.equal(result, undefined);

  let evaluations = 0;
  await expectRefusal(decodeHostProject({ ...options, evaluate() { evaluations += 1; } }), /^SOURCE_ORIGIN_HOST_SCHEMA$/);
  assert.equal(evaluations, 0);
});
