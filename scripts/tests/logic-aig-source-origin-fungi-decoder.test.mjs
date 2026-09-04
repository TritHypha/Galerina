import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  sha256Canonical,
  sha256Raw,
} from "../lib/logic-aig-source-origin/contract.mjs";
import { decodeFungiGateProject } from "../lib/logic-aig-source-origin/fungi-decoder.mjs";

const ROOT = new URL("../../", import.meta.url);
const GOVERNANCE = new URL("../../governance/", import.meta.url);
const SNAPSHOT_MAP = Map;
const SNAPSHOT_MAP_SET = Map.prototype.set;
const SNAPSHOT_REFLECT_APPLY = Reflect.apply;

const VALID_GATE = [
  "@gate 3.0.0",
  "CIRCUIT get_customer(caller: CallerId, id: CustomerId) -> CustomerView",
  '  INTENT "Return one authorized, redacted customer view."',
  "  REQUIRES:",
  "    capability customer.read",
  "    effect database.read",
  "    budget scanned_rows=100",
  "  PARTS:",
  "    [auth :: galerina.tower.authorize@1.0.0 capability=customer.read]",
  "    [load :: app.customer.read@1.2.0]",
  "  WIRES:",
  "    IN.caller -> auth.subject",
  "    IN.id -> load.key",
  "    auth.allow -> load.authority",
  "    auth.deny -> DENY.not_authorized",
  "    auth.indeterminate -> DENY.authority_unknown",
  "    load.record -> OUT.value",
  "END",
  "",
].join("\n");

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

function frozenBlob(locator) {
  return execFileSync("git", ["show", `HEAD:${locator}`], {
    cwd: fileURLToPath(ROOT),
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
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
  const host = record.runtimeLoadSets.find((candidate) => candidate.id === "HOST");
  const parserSourceLocators = [...new Set([
    record.sourceOriginParser.sourceEntry.locator,
    ...record.sourceOriginParser.sourceEdgeRows.flatMap((edge) => [edge.fromLocator, edge.toLocator]),
  ])].sort();
  const toolchainEntries = [
    [`${host.entry.rootLocator}/${host.entry.locator}`, await readFile(new URL(`${host.entry.rootLocator}/${host.entry.locator}`, ROOT))],
  ];
  for (const locator of parserSourceLocators) {
    const joined = `${record.sourceOriginParser.sourceEntry.rootLocator}/${locator.replace(/^src\//u, "src/")}`;
    toolchainEntries.push([joined, frozenBlob(joined)]);
  }
  toolchainEntries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
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
    toolchainBlobs: new Map(toolchainEntries),
    platform: record.platform,
    arch: record.arch,
    nodeIdentity: structuredClone(record.nodeIdentity),
    gitIdentity: structuredClone(record.gitIdentity),
  };
}

function expectRefusal(operation, pattern = /^SOURCE_ORIGIN_(?:FUNGI|GATE)_[A-Z0-9_]+$/) {
  return assert.rejects(operation, (error) => {
    assert.match(error?.code ?? "", pattern);
    return true;
  });
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

test("Task 6B fungi decoder descriptors ignore inherited fields", { timeout: 300_000 }, async () => {
  const options = await fixtureOptions({
    "src/task-6b-descriptor.fungi": "flow task6b_descriptor(a: Int) -> Int { return a }\n",
  });
  const expected = await decodeFungiGateProject(options);
  let ordinary;
  let ordinaryFailure;
  let refusalResult;
  let refusalFailure;
  let counts;
  const poison = installTask6BDescriptorFieldPoison();
  try {
    try { ordinary = await decodeFungiGateProject(options); } catch (error) { ordinaryFailure = error; }
    try { refusalResult = await decodeFungiGateProject({}); } catch (error) { refusalFailure = error; }
  } finally {
    counts = poison.counts();
    poison.restore();
  }
  assert.deepEqual(counts, { get: 0, set: 0 });
  assert.equal(ordinaryFailure, undefined);
  assert.deepEqual(ordinary, expected);
  assert.equal(refusalResult, undefined);
  assert.equal(refusalFailure?.name, "FungiDecoderRefusal");
  assert.equal(refusalFailure?.code, "SOURCE_ORIGIN_FUNGI_SCHEMA");
});

test("FUNGI/GATE decoder compiles and evaluates only the pinned parser closure", async () => {
  const options = await fixtureOptions({
    "src/add.fungi": [
      "flow helper(a: Int) -> Int {",
      "  return a",
      "}",
      "flow add(a: Int) -> Int {",
      "  return helper(a)",
      "}",
      "",
    ].join("\n"),
    "src/customer.gate": VALID_GATE,
  });
  const result = await decodeFungiGateProject(options);
  assert.equal(result.authorizing, false);
  assert.deepEqual(result.toolchains.map((row) => [row.domain, row.operation]), [
    ["FUNGI", "parseProgram"],
    ["GATE", "parseGateV3"],
  ]);
  assert(!result.toolchains.some((row) => row.domain === "BUILD"));
  assert.deepEqual(result.actualRuntimeLoadSets.map((row) => row.id), ["HOST", "PARSER"]);
  assert.deepEqual(result.actualParserExportNames, ["lex", "parseGateV3", "parseProgram"]);
  assert(result.nodes.some((node) => node.kind === "FLOW" && node.locator.includes("!helper")));
  assert(result.nodes.some((node) => node.kind === "FLOW" && node.locator.includes("!add")));
  assert(result.nodes.some((node) => node.kind === "GATE" && node.locator.includes("!get_customer")));
  assert(result.edges.some((edge) => edge.kind === "CALLER"));
  assert.deepEqual(result.parseResults.map((row) => [row.path, row.status]), [
    ["src/add.fungi", "PARSED"],
    ["src/customer.gate", "PARSED"],
  ]);
  assert(Object.isFrozen(result));
  assert(Object.isFrozen(result.nodes));
});

test("eighth-review FUNGI public boundary closes Object, imported child and pooled output dispatch", async (t) => {
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;

  await t.test("decodeFungiGateProject snapshots Object.getPrototypeOf", async () => {
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
    try { await decodeFungiGateProject({}); } catch (error) { failure = error; }
    finally { safeDefineProperty(Object, "getPrototypeOf", descriptor); }
    assert.equal(effects, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_FUNGI_SCHEMA");
  });

  await t.test("a synced isProxy replacement cannot expose a FUNGI option Proxy", async () => {
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
    try { await decodeFungiGateProject(hostile); } catch (error) { failure = error; }
    finally {
      safeDefineProperty(types, "isProxy", descriptor);
      syncBuiltinESMExports();
    }
    assert.equal(effects, 0);
    assert.equal(proxyTraps, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_FUNGI_SCHEMA");
  });

  await t.test("syncBuiltinESMExports cannot replace the imported child runner", { timeout: 900_000 }, async () => {
    const options = await fixtureOptions({
      "src/add.fungi": "flow add(a: Int) -> Int { return a }\n",
    });
    const { createRequire, syncBuiltinESMExports } = await import("node:module");
    const require = createRequire(import.meta.url);
    const childProcess = require("node:child_process");
    const descriptor = safeGetDescriptor(childProcess, "spawnSync");
    let effects = 0;
    let failure;
    let result;
    safeDefineProperty(childProcess, "spawnSync", {
      ...descriptor,
      value() {
        effects += 1;
        throw new Error("ATTACKER_SPAWN_SYNC");
      },
    });
    syncBuiltinESMExports();
    try { result = await decodeFungiGateProject(options); } catch (error) { failure = error; }
    finally {
      safeDefineProperty(childProcess, "spawnSync", descriptor);
      syncBuiltinESMExports();
    }
    assert.equal(effects, 0);
    assert.equal(failure, undefined);
    assert.equal(result?.authorizing, false);
  });

  await t.test("the child transpile hash route contains no pooled Buffer construction", async () => {
    const source = await readFile(
      new URL("../lib/logic-aig-source-origin/fungi-decoder.mjs", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /Buffer\.from\(transpiled\.outputText/u);
  });
});

test("ninth-review descriptor gates require own data values in FUNGI inputs", { timeout: 30_000 }, async () => {
  const options = await fixtureOptions({
    "src/descriptor.fungi": "flow descriptor(a: Int) -> Int { return a }\n",
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
  try { await decodeFungiGateProject(options); } catch (error) { failure = error; }
  finally {
    if (inherited) safeDefineProperty(Object.prototype, "value", inherited);
    else delete Object.prototype.value;
  }
  assert.equal(inputEffects, 0);
  assert.equal(descriptorEffects, 0);
  assert.equal(failure?.code, "SOURCE_ORIGIN_FUNGI_SCHEMA");
});

test("twelfth-review FUNGI async result boundary ignores inherited then capabilities", { timeout: 120_000 }, async (t) => {
  const options = await fixtureOptions({
    "src/async-boundary.fungi": "flow async_boundary(a: Int) -> Int { return a }\n",
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
          if (safeHasOwn(this, "actualRuntimeLoadSets") && safeHasOwn(this, "nodes")) effects += 1;
          return undefined;
        },
      });
      try { result = await decodeFungiGateProject(options); } catch (error) { failure = error; }
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
          if (safeHasOwn(this, "actualRuntimeLoadSets") && safeHasOwn(this, "nodes")) {
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
      try { result = await decodeFungiGateProject(options); } catch (error) { failure = error; }
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

test("ninth-review FUNGI native file boundary rejects typed-array prototype drift without effects", { timeout: 120_000 }, async () => {
  const options = await fixtureOptions({
    "src/native-boundary.fungi": "flow native_boundary(a: Int) -> Int { return a }\n",
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
  try { result = await decodeFungiGateProject(options); } catch (error) { failure = error; }
  finally { safeDefineProperty(typedArrayPrototype, "buffer", descriptor); }
  assert.equal(effects, 0);
  assert.equal(result, undefined);
  assert.equal(failure?.code, "SOURCE_ORIGIN_FUNGI_TOOLCHAIN");
});

test("ninth-review FUNGI child setup and result handling avoid inherited properties", { timeout: 120_000 }, async (t) => {
  const options = await fixtureOptions({
    "src/child-boundary.fungi": "flow child_boundary(a: Int) -> Int { return a }\n",
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
  try { freshDecoder = await import("../lib/logic-aig-source-origin/fungi-decoder.mjs?ninth-review-child-boundary"); }
  finally {
    safeDefineProperty(childProcess, "spawnSync", spawnDescriptor);
    syncBuiltinESMExports();
  }
  await t.test("spawn receives closed option records", async () => {
    const result = await freshDecoder.decodeFungiGateProject(options);
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
    try { result = await freshDecoder.decodeFungiGateProject(options); } catch (error) { failure = error; }
    finally {
      if (priorError) safeDefineProperty(Object.prototype, "error", priorError);
      else safeDeleteProperty(Object.prototype, "error");
    }
    assert.equal(errorEffects, 0);
    assert.equal(observed, undefined);
    assert.equal(result, undefined);
    assert.equal(failure?.code, "SOURCE_ORIGIN_FUNGI_TOOLCHAIN");
  });
});

test("FUNGI converts parser code-unit locations to UTF-8 byte spans", async () => {
  const validPath = "src/unicode.fungi";
  const validSource = [
    "// café 😀",
    "flow helper(a: Int) -> Int {",
    "  return a",
    "}",
    "// piñata",
    "flow add(a: Int) -> Int {",
    "  return helper(a)",
    "}",
    "",
  ].join("\n");
  const brokenPath = "src/unicode-broken.fungi";
  const brokenSource = "// café 😀\nflow broken( {\n";
  const options = await fixtureOptions({
    [validPath]: validSource,
    [brokenPath]: brokenSource,
  });
  const result = await decodeFungiGateProject(options);
  const sourceBytes = Buffer.from(validSource, "utf8");
  const helperStart = sourceBytes.indexOf(Buffer.from("flow helper", "utf8"));
  const helperEnd = helperStart + Buffer.byteLength("flow", "utf8");
  const addStart = sourceBytes.indexOf(Buffer.from("flow add", "utf8"));
  const addEnd = addStart + Buffer.byteLength("flow", "utf8");
  const callStart = sourceBytes.indexOf(Buffer.from("helper(a)", "utf8"), addStart);
  const callEnd = callStart + Buffer.byteLength("helper", "utf8");
  assert(helperStart >= 0 && helperEnd > helperStart && addStart > helperEnd && addEnd > addStart && callStart > addStart);

  const helper = result.nodes.find((node) => node.kind === "FLOW" && node.locator.includes("!helper"));
  const add = result.nodes.find((node) => node.kind === "FLOW" && node.locator.includes("!add"));
  assert(helper);
  assert(add);
  const helperIdentity = result.idMapRows.find((row) => row.nodeId === helper.id)?.nativeIdentity;
  const addIdentity = result.idMapRows.find((row) => row.nodeId === add.id)?.nativeIdentity;
  assert.deepEqual(
    [helperIdentity?.startByte, helperIdentity?.endByte, addIdentity?.startByte, addIdentity?.endByte],
    [helperStart, helperEnd, addStart, addEnd],
  );

  const caller = result.edges.find((edge) => edge.kind === "CALLER" && edge.from === add.id && edge.to === helper.id);
  assert(caller);
  const sourceRow = options.sourceManifest.rows.find((row) => row.path === validPath);
  assert(sourceRow);
  const evidenceBody = {
    schema: "galerina.logic-aig-edge-evidence.v1",
    relationshipKind: "CALLER",
    sourceNodeId: add.id,
    targetNodeId: helper.id,
    evidenceLocation: {
      kind: "SOURCE_SYNTAX",
      sourceBlobOid: sourceRow.blobOid,
      sourceRawSha256: sourceRow.rawSha256,
      startByte: callStart,
      endByte: callEnd,
    },
    authorizing: false,
  };
  assert.equal(caller.digest, sha256Canonical(evidenceBody.schema, evidenceBody));

  const brokenResult = result.parseResults.find((row) => row.path === brokenPath);
  const brokenFile = result.nodes.find((node) => node.kind === "FILE" && node.locator === brokenPath);
  assert.equal(brokenResult?.status, "REFUSED");
  assert(brokenFile);
  const brokenIdentity = result.idMapRows.find((row) => row.nodeId === brokenFile.id)?.nativeIdentity;
  assert.equal(brokenIdentity?.endByte, Buffer.byteLength(brokenSource, "utf8"));
});

test("ninth-review GATE line starts preserve LF, CRLF, and bare-CR byte offsets", { timeout: 120_000 }, async () => {
  const sources = new Map([
    ["src/line-lf.gate", VALID_GATE],
    ["src/line-crlf.gate", VALID_GATE.replace(/\n/gu, "\r\n")],
    ["src/line-cr.gate", VALID_GATE.replace(/\n/gu, "\r")],
  ]);
  const options = await fixtureOptions(Object.fromEntries(sources));
  const result = await decodeFungiGateProject(options);
  for (const [path, source] of sources) {
    const node = result.nodes.find((candidate) => candidate.kind === "GATE" && candidate.locator.startsWith(`${path}#`));
    assert(node);
    const identity = result.idMapRows.find((row) => row.nodeId === node.id)?.nativeIdentity;
    assert.equal(identity?.startByte, Buffer.from(source, "utf8").indexOf(Buffer.from("CIRCUIT", "utf8")));
  }
});

test("FUNGI/GATE parser diagnostics are canonical refusals with file nodes only", async () => {
  const options = await fixtureOptions({
    "src/broken.fungi": "flow broken( {\n",
    "src/broken.gate": "@gate 1.0.0\n",
  });
  const result = await decodeFungiGateProject(options);
  assert.deepEqual(result.parseResults.map((row) => row.status), ["REFUSED", "REFUSED"]);
  assert(result.parseResults[0].diagnosticCodes.every((code) => /^FUNGI-[A-Z0-9-]+$/u.test(code)));
  assert.deepEqual(result.parseResults[1].diagnosticCodes, ["GATE-PARSE-002"]);
  assert.equal(result.nodes.filter((node) => node.kind !== "FILE").length, 0);
  assert.equal(result.edges.length, 0);
});

test("FUNGI/GATE refuses parser source drift before evaluation or parser artifacts", async () => {
  const options = await fixtureOptions({ "src/clean.fungi": "flow clean() -> Int { return 1 }\n" });
  const record = options.pins.records.find((candidate) => candidate.platform === process.platform && candidate.arch === process.arch);
  assert(record);
  const parserLocator = `${record.sourceOriginParser.sourceEntry.rootLocator}/src/parser.ts`;
  const drift = { ...options, toolchainBlobs: mutableBlobSnapshot(options.toolchainBlobs) };
  drift.toolchainBlobs.set(parserLocator, Buffer.from("export const parseProgram = () => ({ injected: true });\n", "utf8"));
  let result;
  await expectRefusal(decodeFungiGateProject(drift), /^SOURCE_ORIGIN_(?:FUNGI|GATE)_TOOLCHAIN$/);
  assert.equal(result, undefined);

  let evaluations = 0;
  await expectRefusal(decodeFungiGateProject({ ...options, evaluate() { evaluations += 1; } }), /^SOURCE_ORIGIN_(?:FUNGI|GATE)_SCHEMA$/);
  assert.equal(evaluations, 0);
});
