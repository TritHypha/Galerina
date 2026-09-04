import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJsonText,
  sha256Canonical,
  sha256Raw,
} from "../lib/logic-aig-source-origin/contract.mjs";
import { buildToolchainSnapshot } from "../lib/logic-aig-source-origin/toolchain-snapshot.mjs";
import * as toolchainSnapshot from "../lib/logic-aig-source-origin/toolchain-snapshot.mjs";

const FIXTURE_PLATFORM = "win32";
const FIXTURE_ARCH = "x64";
const COMPILER_ROOT = "packages-ts/galerina-core-compiler";
const HOST_ROOT = "packages-ts/galerina-core-compiler/node_modules/typescript";
const PARSER_ROOT = "generated-source-origin-parser";
const PARSER_EXPORTS = Object.freeze(["lex", "parseGateV3", "parseProgram"]);
const APPROVED_TYPESCRIPT_DATA_LOCAL_LOCATORS = Object.freeze([
  "LICENSE.txt",
  "README.md",
  "SECURITY.md",
  "ThirdPartyNoticeText.txt",
  "bin/tsc",
  "bin/tsserver",
  "lib/_tsc.js",
  "lib/_tsserver.js",
  "lib/_typingsInstaller.js",
  "lib/cs/diagnosticMessages.generated.json",
  "lib/de/diagnosticMessages.generated.json",
  "lib/es/diagnosticMessages.generated.json",
  "lib/fr/diagnosticMessages.generated.json",
  "lib/it/diagnosticMessages.generated.json",
  "lib/ja/diagnosticMessages.generated.json",
  "lib/ko/diagnosticMessages.generated.json",
  "lib/lib.d.ts",
  "lib/lib.decorators.d.ts",
  "lib/lib.decorators.legacy.d.ts",
  "lib/lib.dom.asynciterable.d.ts",
  "lib/lib.dom.d.ts",
  "lib/lib.dom.iterable.d.ts",
  "lib/lib.es2015.collection.d.ts",
  "lib/lib.es2015.core.d.ts",
  "lib/lib.es2015.d.ts",
  "lib/lib.es2015.generator.d.ts",
  "lib/lib.es2015.iterable.d.ts",
  "lib/lib.es2015.promise.d.ts",
  "lib/lib.es2015.proxy.d.ts",
  "lib/lib.es2015.reflect.d.ts",
  "lib/lib.es2015.symbol.d.ts",
  "lib/lib.es2015.symbol.wellknown.d.ts",
  "lib/lib.es2016.array.include.d.ts",
  "lib/lib.es2016.d.ts",
  "lib/lib.es2016.full.d.ts",
  "lib/lib.es2016.intl.d.ts",
  "lib/lib.es2017.arraybuffer.d.ts",
  "lib/lib.es2017.d.ts",
  "lib/lib.es2017.date.d.ts",
  "lib/lib.es2017.full.d.ts",
  "lib/lib.es2017.intl.d.ts",
  "lib/lib.es2017.object.d.ts",
  "lib/lib.es2017.sharedmemory.d.ts",
  "lib/lib.es2017.string.d.ts",
  "lib/lib.es2017.typedarrays.d.ts",
  "lib/lib.es2018.asyncgenerator.d.ts",
  "lib/lib.es2018.asynciterable.d.ts",
  "lib/lib.es2018.d.ts",
  "lib/lib.es2018.full.d.ts",
  "lib/lib.es2018.intl.d.ts",
  "lib/lib.es2018.promise.d.ts",
  "lib/lib.es2018.regexp.d.ts",
  "lib/lib.es2019.array.d.ts",
  "lib/lib.es2019.d.ts",
  "lib/lib.es2019.full.d.ts",
  "lib/lib.es2019.intl.d.ts",
  "lib/lib.es2019.object.d.ts",
  "lib/lib.es2019.string.d.ts",
  "lib/lib.es2019.symbol.d.ts",
  "lib/lib.es2020.bigint.d.ts",
  "lib/lib.es2020.d.ts",
  "lib/lib.es2020.date.d.ts",
  "lib/lib.es2020.full.d.ts",
  "lib/lib.es2020.intl.d.ts",
  "lib/lib.es2020.number.d.ts",
  "lib/lib.es2020.promise.d.ts",
  "lib/lib.es2020.sharedmemory.d.ts",
  "lib/lib.es2020.string.d.ts",
  "lib/lib.es2020.symbol.wellknown.d.ts",
  "lib/lib.es2021.d.ts",
  "lib/lib.es2021.full.d.ts",
  "lib/lib.es2021.intl.d.ts",
  "lib/lib.es2021.promise.d.ts",
  "lib/lib.es2021.string.d.ts",
  "lib/lib.es2021.weakref.d.ts",
  "lib/lib.es2022.array.d.ts",
  "lib/lib.es2022.d.ts",
  "lib/lib.es2022.error.d.ts",
  "lib/lib.es2022.full.d.ts",
  "lib/lib.es2022.intl.d.ts",
  "lib/lib.es2022.object.d.ts",
  "lib/lib.es2022.regexp.d.ts",
  "lib/lib.es2022.string.d.ts",
  "lib/lib.es2023.array.d.ts",
  "lib/lib.es2023.collection.d.ts",
  "lib/lib.es2023.d.ts",
  "lib/lib.es2023.full.d.ts",
  "lib/lib.es2023.intl.d.ts",
  "lib/lib.es2024.arraybuffer.d.ts",
  "lib/lib.es2024.collection.d.ts",
  "lib/lib.es2024.d.ts",
  "lib/lib.es2024.full.d.ts",
  "lib/lib.es2024.object.d.ts",
  "lib/lib.es2024.promise.d.ts",
  "lib/lib.es2024.regexp.d.ts",
  "lib/lib.es2024.sharedmemory.d.ts",
  "lib/lib.es2024.string.d.ts",
  "lib/lib.es5.d.ts",
  "lib/lib.es6.d.ts",
  "lib/lib.esnext.array.d.ts",
  "lib/lib.esnext.collection.d.ts",
  "lib/lib.esnext.d.ts",
  "lib/lib.esnext.decorators.d.ts",
  "lib/lib.esnext.disposable.d.ts",
  "lib/lib.esnext.error.d.ts",
  "lib/lib.esnext.float16.d.ts",
  "lib/lib.esnext.full.d.ts",
  "lib/lib.esnext.intl.d.ts",
  "lib/lib.esnext.iterator.d.ts",
  "lib/lib.esnext.promise.d.ts",
  "lib/lib.esnext.sharedmemory.d.ts",
  "lib/lib.scripthost.d.ts",
  "lib/lib.webworker.asynciterable.d.ts",
  "lib/lib.webworker.d.ts",
  "lib/lib.webworker.importscripts.d.ts",
  "lib/lib.webworker.iterable.d.ts",
  "lib/pl/diagnosticMessages.generated.json",
  "lib/pt-br/diagnosticMessages.generated.json",
  "lib/ru/diagnosticMessages.generated.json",
  "lib/tr/diagnosticMessages.generated.json",
  "lib/tsc.js",
  "lib/tsserver.js",
  "lib/tsserverlibrary.d.ts",
  "lib/tsserverlibrary.js",
  "lib/typesMap.json",
  "lib/typescript.d.ts",
  "lib/typingsInstaller.js",
  "lib/watchGuard.js",
  "lib/zh-cn/diagnosticMessages.generated.json",
  "lib/zh-tw/diagnosticMessages.generated.json",
  "package.json",
]);
const REQUIRED_GENERATED_DATA_LOCATORS = Object.freeze([
  "generated-source-origin-parser/gate-v3-parser.d.ts",
  "generated-source-origin-parser/lexer.d.ts",
  "generated-source-origin-parser/package.json",
  "generated-source-origin-parser/parser.d.ts",
  "generated-source-origin-parser/requirement-diagnostics.d.ts",
  "generated-source-origin-parser/source-origin-parser-entry.d.ts",
]);
const REQUIRED_SOURCE_DATA_LOCATORS = Object.freeze([
  "packages-ts/galerina-core-compiler/src/gate-v3-parser.ts",
  "packages-ts/galerina-core-compiler/src/lexer.ts",
  "packages-ts/galerina-core-compiler/src/parser.ts",
  "packages-ts/galerina-core-compiler/src/requirement-diagnostics.ts",
  "packages-ts/galerina-core-compiler/src/source-origin-parser-entry.ts",
  "packages-ts/galerina-core-compiler/tsconfig.source-origin-parser.json",
]);
const REQUIRED_TYPESCRIPT_DATA_LOCATORS = Object.freeze([
  ...APPROVED_TYPESCRIPT_DATA_LOCAL_LOCATORS.map((locator) => HOST_ROOT + "/" + locator),
]);
const REQUIRED_DATA_LOCATORS = Object.freeze([
  ...REQUIRED_GENERATED_DATA_LOCATORS,
  ...REQUIRED_TYPESCRIPT_DATA_LOCATORS,
  ...REQUIRED_SOURCE_DATA_LOCATORS,
].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
const OMISSION_CONTROL_LOCATORS = Object.freeze([
  ...REQUIRED_GENERATED_DATA_LOCATORS,
  HOST_ROOT + "/lib/tsc.js",
  HOST_ROOT + "/package.json",
  ...REQUIRED_SOURCE_DATA_LOCATORS,
].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));

function without(value, key) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

function fixtureRow(locator, body = locator) {
  const bytes = Buffer.from(body, "utf8");
  return { locator, rawSha256: sha256Raw(bytes), byteLength: bytes.length };
}

function joinedRow(rootLocator, row) {
  return { ...row, locator: `${rootLocator}/${row.locator}` };
}

function executableIdentity(version, body) {
  const bytes = Buffer.from(body, "utf8");
  return {
    version,
    executableRawSha256: sha256Raw(bytes),
    executableByteLength: bytes.length,
  };
}

function moduleClosureDigest({ executableModuleRows, dataRows, builtinModules }) {
  const body = {
    schema: "galerina.logic-aig-module-closure.v1",
    executableModuleRows,
    dataRows,
    builtinModules,
    counts: {
      executableModules: executableModuleRows.length,
      dataRows: dataRows.length,
      builtinModules: builtinModules.length,
    },
    authorizing: false,
  };
  return sha256Canonical(body.schema, body);
}

function sourceOriginParser(hostRows, parserRows) {
  const sourceEntryIdentity = fixtureRow("src/source-origin-parser-entry.ts", "source-entry");
  const projectIdentity = fixtureRow("tsconfig.source-origin-parser.json", "source-project");
  const generatedManifestIdentity = fixtureRow("package.json", '{"type":"module"}');
  const parserEntry = parserRows.find((row) => row.locator === "source-origin-parser-entry.js");
  assert(parserEntry);
  return {
    sourceEntry: {
      rootLocator: COMPILER_ROOT,
      ...sourceEntryIdentity,
      gitBlobOid: "a".repeat(40),
      exportNames: [...PARSER_EXPORTS],
    },
    project: {
      rootLocator: COMPILER_ROOT,
      ...projectIdentity,
      gitBlobOid: "b".repeat(40),
      extendsLocator: "./tsconfig.json",
      files: ["src/source-origin-parser-entry.ts"],
      include: [],
      compilerOptions: {
        types: [],
        noEmitOnError: true,
        incremental: false,
        composite: false,
        sourceMap: false,
        declarationMap: false,
      },
    },
    generatedEntry: { rootLocator: PARSER_ROOT, ...parserEntry },
    generatedPackageManifest: { rootLocator: PARSER_ROOT, ...generatedManifestIdentity },
    exportNames: [...PARSER_EXPORTS],
    sourceEdgeRows: [
      { fromLocator: "src/gate-v3-parser.ts", kind: "IMPORT_TYPE", exportName: null, specifier: "./parser.js", toLocator: "src/parser.ts" },
      { fromLocator: "src/parser.ts", kind: "IMPORT", exportName: null, specifier: "./lexer.js", toLocator: "src/lexer.ts" },
      { fromLocator: "src/parser.ts", kind: "IMPORT", exportName: null, specifier: "./requirement-diagnostics.js", toLocator: "src/requirement-diagnostics.ts" },
      { fromLocator: "src/source-origin-parser-entry.ts", kind: "EXPORT_FROM", exportName: "lex", specifier: "./lexer.js", toLocator: "src/lexer.ts" },
      { fromLocator: "src/source-origin-parser-entry.ts", kind: "EXPORT_FROM", exportName: "parseGateV3", specifier: "./gate-v3-parser.js", toLocator: "src/gate-v3-parser.ts" },
      { fromLocator: "src/source-origin-parser-entry.ts", kind: "EXPORT_FROM", exportName: "parseProgram", specifier: "./parser.js", toLocator: "src/parser.ts" },
    ],
    emittedEdgeRows: [
      { fromLocator: "parser.js", kind: "IMPORT", exportName: null, specifier: "./lexer.js", toLocator: "lexer.js" },
      { fromLocator: "parser.js", kind: "IMPORT", exportName: null, specifier: "./requirement-diagnostics.js", toLocator: "requirement-diagnostics.js" },
      { fromLocator: "source-origin-parser-entry.js", kind: "EXPORT_FROM", exportName: "lex", specifier: "./lexer.js", toLocator: "lexer.js" },
      { fromLocator: "source-origin-parser-entry.js", kind: "EXPORT_FROM", exportName: "parseGateV3", specifier: "./gate-v3-parser.js", toLocator: "gate-v3-parser.js" },
      { fromLocator: "source-origin-parser-entry.js", kind: "EXPORT_FROM", exportName: "parseProgram", specifier: "./parser.js", toLocator: "parser.js" },
    ],
    generatedClosureDigest: "c".repeat(64),
  };
}

function fixtureRecord(overrides = {}) {
  const hostRows = overrides.hostRows ?? [
    fixtureRow("lib/typescript.js", "typescript-entry"),
  ];
  const parserRows = overrides.parserRows ?? [
    fixtureRow("gate-v3-parser.js"),
    fixtureRow("lexer.js"),
    fixtureRow("parser.js"),
    fixtureRow("requirement-diagnostics.js"),
    fixtureRow("source-origin-parser-entry.js"),
  ];
  const hostBuiltins = overrides.hostBuiltins ?? ["node:fs", "node:path"];
  const runtimeLoadSets = overrides.runtimeLoadSets ?? [
    {
      id: "HOST",
      entry: { rootLocator: HOST_ROOT, locator: "lib/typescript.js" },
      moduleRows: hostRows,
      builtinModules: hostBuiltins,
    },
    {
      id: "PARSER",
      entry: { rootLocator: PARSER_ROOT, locator: "source-origin-parser-entry.js" },
      moduleRows: parserRows,
      builtinModules: [],
    },
  ];
  const executableModuleRows = overrides.executableModuleRows ?? [
    ...hostRows.map((row) => joinedRow(HOST_ROOT, row)),
    ...parserRows.map((row) => joinedRow(PARSER_ROOT, row)),
  ].sort((left, right) => left.locator < right.locator ? -1 : left.locator > right.locator ? 1 : 0);
  const builtinModules = overrides.builtinModules ?? [...hostBuiltins];
  const parser = overrides.sourceOriginParser ?? sourceOriginParser(hostRows, parserRows);
  const typescriptEntry = hostRows.find((row) => row.locator === "lib/typescript.js");
  assert(typescriptEntry);
  const dataRows = overrides.dataRows ?? REQUIRED_DATA_LOCATORS.map((locator) => fixtureRow(
    locator,
    locator === "generated-source-origin-parser/package.json"
      ? '{"type":"module"}'
      : locator === "packages-ts/galerina-core-compiler/src/source-origin-parser-entry.ts"
        ? "source-entry"
        : locator === "packages-ts/galerina-core-compiler/tsconfig.source-origin-parser.json"
          ? "source-project"
          : locator === "packages-ts/galerina-core-compiler/node_modules/typescript/package.json"
            ? "typescript-package"
            : locator,
  ));
  const body = {
    recordId: overrides.recordId ?? "win32-x64",
    platform: overrides.platform ?? FIXTURE_PLATFORM,
    arch: overrides.arch ?? FIXTURE_ARCH,
    sourceObservationDigest: overrides.sourceObservationDigest ?? "1".repeat(64),
    loadObservationDigest: overrides.loadObservationDigest ?? "2".repeat(64),
    nodeIdentity: overrides.nodeIdentity ?? executableIdentity("fixture-node", "node-executable"),
    gitIdentity: overrides.gitIdentity ?? executableIdentity("fixture-git", "git-executable"),
    typescript: overrides.typescript ?? {
      name: "typescript",
      version: "fixture-1.0.0",
      packageLocator: `${HOST_ROOT}/package.json`,
      packageRawSha256: sha256Raw(Buffer.from("typescript-package")),
      packageByteLength: Buffer.byteLength("typescript-package"),
      entryLocator: `${HOST_ROOT}/lib/typescript.js`,
      entryRawSha256: typescriptEntry.rawSha256,
      entryByteLength: typescriptEntry.byteLength,
    },
    sourceOriginParser: parser,
    runtimeLoadSets,
    domainSelections: overrides.domainSelections ?? [
      { domain: "FUNGI", parserId: "galerina-fungi-parser", runtimeLoadSetId: "PARSER", operation: "parseProgram" },
      { domain: "GATE", parserId: "galerina-gate-v3-parser", runtimeLoadSetId: "PARSER", operation: "parseGateV3" },
      { domain: "HOST", parserId: "typescript-compiler-api", runtimeLoadSetId: "HOST", operation: "typescript-compiler-api" },
    ],
    builtinModules,
    executableModuleRows,
    dataRows,
    moduleClosureDigest: overrides.moduleClosureDigest ?? moduleClosureDigest({ executableModuleRows, dataRows, builtinModules }),
  };
  return { ...body, recordDigest: sha256Canonical("galerina.logic-aig-toolchain-pin-record.v2", body) };
}

function fixturePins(records = [fixtureRecord()]) {
  const body = {
    schema: "galerina.logic-aig-toolchain-pins.v2",
    records,
    authorizing: false,
  };
  return { ...body, pinsDigest: sha256Canonical(body.schema, body) };
}

function fixtureOptions(overrides = {}) {
  const record = fixtureRecord();
  return {
    pins: fixturePins([record]),
    platform: FIXTURE_PLATFORM,
    arch: FIXTURE_ARCH,
    nodeIdentity: structuredClone(record.nodeIdentity),
    gitIdentity: structuredClone(record.gitIdentity),
    actualRuntimeLoadSets: record.runtimeLoadSets.map((row) => ({
      id: row.id,
      moduleRows: structuredClone(row.moduleRows),
      builtinModules: structuredClone(row.builtinModules),
    })),
    actualParserExportNames: [...PARSER_EXPORTS],
    ...overrides,
  };
}

function selectionOptions(domain, overrides = {}) {
  const record = fixtureRecord();
  const pins = fixturePins([record]);
  const domainSelection = record.domainSelections.find((row) => row.domain === domain);
  assert(domainSelection);
  const runtimeLoadSet = record.runtimeLoadSets.find((row) => row.id === domainSelection.runtimeLoadSetId);
  assert(runtimeLoadSet);
  return {
    pins,
    platform: record.platform,
    arch: record.arch,
    nodeIdentity: structuredClone(record.nodeIdentity),
    gitIdentity: structuredClone(record.gitIdentity),
    selector: {
      domain: domainSelection.domain,
      parserId: domainSelection.parserId,
      runtimeLoadSetId: domainSelection.runtimeLoadSetId,
      operation: domainSelection.operation,
      recordId: record.recordId,
      recordDigest: record.recordDigest,
      resolutionMode: "EXACT_ROOT_LOCAL_V1",
      entry: structuredClone(runtimeLoadSet.entry),
    },
    guardRuntimeLoadSet: structuredClone(runtimeLoadSet),
    parserExportNames: domain === "HOST" ? null : [...PARSER_EXPORTS],
    ...overrides,
  };
}

function resealRecord(record) {
  const candidate = structuredClone(record);
  delete candidate.recordDigest;
  candidate.moduleClosureDigest = moduleClosureDigest(candidate);
  return { ...candidate, recordDigest: sha256Canonical("galerina.logic-aig-toolchain-pin-record.v2", candidate) };
}

function expectRefusal(operation, pattern = /^SOURCE_ORIGIN_(?!HOLD)[A-Z0-9_]+$/) {
  assert.throws(operation, (error) => {
    assert.match(error?.code ?? "", pattern);
    return true;
  });
}

function assertClosedObject(value, keys) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
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

test("Task 6B toolchain snapshot descriptors ignore inherited fields", () => {
  const selectionInput = selectionOptions("HOST");
  const semanticRecord = fixtureRecord();
  const semanticInput = {
    pins: fixturePins([semanticRecord]),
    platform: semanticRecord.platform,
    arch: semanticRecord.arch,
    nodeIdentity: structuredClone(semanticRecord.nodeIdentity),
    gitIdentity: structuredClone(semanticRecord.gitIdentity),
  };
  const snapshotInput = fixtureOptions();
  const expectedSelection = toolchainSnapshot.prepareToolchainSelection(selectionInput);
  const expectedSemantic = toolchainSnapshot.prepareSemanticToolchain(semanticInput);
  const expectedSnapshot = buildToolchainSnapshot(snapshotInput);
  let selectionResult;
  let selectionFailure;
  let semanticResult;
  let semanticFailure;
  let snapshotResult;
  let snapshotFailure;
  let selectionRefusal;
  let semanticRefusal;
  let snapshotRefusal;
  let counts;
  const poison = installTask6BDescriptorFieldPoison();
  try {
    try { selectionResult = toolchainSnapshot.prepareToolchainSelection(selectionInput); } catch (error) { selectionFailure = error; }
    try { semanticResult = toolchainSnapshot.prepareSemanticToolchain(semanticInput); } catch (error) { semanticFailure = error; }
    try { snapshotResult = buildToolchainSnapshot(snapshotInput); } catch (error) { snapshotFailure = error; }
    try { toolchainSnapshot.prepareToolchainSelection({}); } catch (error) { selectionRefusal = error; }
    try { toolchainSnapshot.prepareSemanticToolchain({}); } catch (error) { semanticRefusal = error; }
    try { buildToolchainSnapshot({}); } catch (error) { snapshotRefusal = error; }
  } finally {
    counts = poison.counts();
    poison.restore();
  }
  assert.deepEqual(counts, { get: 0, set: 0 });
  assert.equal(selectionFailure, undefined);
  assert.deepEqual(selectionResult, expectedSelection);
  assert.equal(semanticFailure, undefined);
  assert.deepEqual(semanticResult, expectedSemantic);
  assert.equal(snapshotFailure, undefined);
  assert.deepEqual(snapshotResult, expectedSnapshot);
  for (const refusal of [selectionRefusal, semanticRefusal, snapshotRefusal]) {
    assert.equal(refusal?.name, "ToolchainSnapshotRefusal");
    assert.equal(refusal?.code, "SOURCE_ORIGIN_SCHEMA");
  }
});

test("buildToolchainSnapshot emits only the exact closed manifest-v2 body", () => {
  const options = fixtureOptions();
  const record = options.pins.records[0];
  const manifest = buildToolchainSnapshot(options);

  assertClosedObject(manifest, [
    "schema", "selectedPinRecordId", "selectedPinRecordDigest", "pinsDigest",
    "sourceObservationDigest", "loadObservationDigest", "platform", "arch",
    "nodeIdentity", "gitIdentity", "typescript", "sourceOriginParser",
    "runtimeLoadSets", "domainSelections", "builtinModules",
    "executableModuleRows", "dataRows", "moduleClosureDigest",
    "actualRuntimeLoadSets", "actualLoadedModuleRows",
    "actualLoadedBuiltinModules", "actualParserExportNames",
    "actualLoadedSetDigest", "authorizing", "toolchainManifestDigest",
  ]);
  assert.equal(manifest.schema, "galerina.logic-aig-toolchain-manifest.v2");
  assert.equal(manifest.selectedPinRecordDigest, record.recordDigest);
  assert.equal(manifest.sourceObservationDigest, record.sourceObservationDigest);
  assert.equal(manifest.loadObservationDigest, record.loadObservationDigest);
  assert.equal(manifest.moduleClosureDigest, record.moduleClosureDigest);
  assert.notEqual(manifest.moduleClosureDigest, manifest.actualLoadedSetDigest);
  assert.equal(manifest.authorizing, false);
  assert.equal(
    manifest.toolchainManifestDigest,
    sha256Canonical("galerina.logic-aig-toolchain-manifest.v2", without(manifest, "toolchainManifestDigest")),
  );
  assert.notEqual(
    manifest.toolchainManifestDigest,
    sha256Canonical("galerina.logic-aig-toolchain-manifest.v1", without(manifest, "toolchainManifestDigest")),
  );
});

test("actual-loaded-set-v2 retains phase-local rows and independently digests the joined projection", () => {
  const options = fixtureOptions();
  const manifest = buildToolchainSnapshot(options);
  assert.deepEqual(manifest.actualRuntimeLoadSets, options.actualRuntimeLoadSets);
  assert.deepEqual(manifest.actualLoadedModuleRows, options.pins.records[0].executableModuleRows);
  assert.deepEqual(manifest.actualLoadedBuiltinModules, ["node:fs", "node:path"]);
  assert.deepEqual(manifest.actualParserExportNames, PARSER_EXPORTS);
  const actualBody = {
    schema: "galerina.logic-aig-actual-loaded-set.v2",
    actualRuntimeLoadSets: options.actualRuntimeLoadSets,
    actualLoadedModuleRows: manifest.actualLoadedModuleRows,
    actualLoadedBuiltinModules: ["node:fs", "node:path"],
    actualParserExportNames: [...PARSER_EXPORTS],
    counts: {
      runtimeLoadSets: 2,
      modules: manifest.actualLoadedModuleRows.length,
      builtinModules: 2,
      parserExports: 3,
    },
    authorizing: false,
  };
  assert.equal(manifest.actualLoadedSetDigest, sha256Canonical(actualBody.schema, actualBody));
  assert.notEqual(manifest.actualLoadedSetDigest, sha256Canonical("galerina.logic-aig-actual-loaded-set.v1", actualBody));
});

test("manifest-v2 refuses every v1 pins or pin-record digest substitute", () => {
  const options = fixtureOptions();
  const v1Pins = structuredClone(options.pins);
  v1Pins.schema = "galerina.logic-aig-toolchain-pins.v1";
  v1Pins.pinsDigest = sha256Canonical(v1Pins.schema, without(v1Pins, "pinsDigest"));
  expectRefusal(() => buildToolchainSnapshot({ ...options, pins: v1Pins }));

  const record = structuredClone(options.pins.records[0]);
  const body = without(record, "recordDigest");
  record.recordDigest = sha256Canonical("galerina.logic-aig-toolchain-pin-record.v1", body);
  expectRefusal(() => buildToolchainSnapshot({ ...options, pins: fixturePins([record]) }));
});

test("actual runtime sets are exactly HOST and PARSER with no BUILD, omission, duplicate or surplus", () => {
  const options = fixtureOptions();
  const host = options.actualRuntimeLoadSets[0];
  const parser = options.actualRuntimeLoadSets[1];
  for (const actualRuntimeLoadSets of [
    [host],
    [host, parser, { id: "BUILD", moduleRows: [], builtinModules: [] }],
    [host, host],
    [parser, host],
    [host, parser, { id: "SURPLUS", moduleRows: [], builtinModules: [] }],
  ]) {
    expectRefusal(() => buildToolchainSnapshot({ ...options, actualRuntimeLoadSets }));
  }
});

test("phase-local actual rows require the authorized local identity and entry before joined comparison", () => {
  const options = fixtureOptions();
  const host = structuredClone(options.actualRuntimeLoadSets[0]);
  const parser = structuredClone(options.actualRuntimeLoadSets[1]);
  host.moduleRows = host.moduleRows.filter((row) => row.locator !== "lib/typescript.js");
  expectRefusal(() => buildToolchainSnapshot({ ...options, actualRuntimeLoadSets: [host, parser] }));

  const joinedInsteadOfLocal = structuredClone(options.actualRuntimeLoadSets);
  joinedInsteadOfLocal[0].moduleRows[0].locator = `${HOST_ROOT}/${joinedInsteadOfLocal[0].moduleRows[0].locator}`;
  expectRefusal(() => buildToolchainSnapshot({ ...options, actualRuntimeLoadSets: joinedInsteadOfLocal }));

  const dataRowLoad = structuredClone(options.actualRuntimeLoadSets);
  dataRowLoad[1].moduleRows.push(fixtureRow("package.json", '{"type":"module"}'));
  expectRefusal(() => buildToolchainSnapshot({ ...options, actualRuntimeLoadSets: dataRowLoad }));
});

test("row, builtin and parser-export widening or drift refuses", () => {
  const options = fixtureOptions();
  const extraRow = structuredClone(options.actualRuntimeLoadSets);
  extraRow[0].moduleRows.push(fixtureRow("lib/lazy.js", "lazy"));
  const extraBuiltin = structuredClone(options.actualRuntimeLoadSets);
  extraBuiltin[0].builtinModules.push("node:util");
  expectRefusal(() => buildToolchainSnapshot({ ...options, actualRuntimeLoadSets: extraRow }));
  expectRefusal(() => buildToolchainSnapshot({ ...options, actualRuntimeLoadSets: extraBuiltin }));
  expectRefusal(() => buildToolchainSnapshot({ ...options, actualParserExportNames: ["lex", "parseProgram"] }));
  expectRefusal(() => buildToolchainSnapshot({ ...options, actualParserExportNames: ["lex", "parseGateV3", "parseProgram", "surplus"] }));
});

test("pin records refuse BUILD admission, selector drift and global locator collisions", () => {
  const options = fixtureOptions();
  const buildRecord = structuredClone(options.pins.records[0]);
  buildRecord.runtimeLoadSets.push({
    id: "BUILD",
    entry: { rootLocator: HOST_ROOT, locator: "lib/tsc.js" },
    moduleRows: [fixtureRow("lib/tsc.js")],
    builtinModules: [],
  });
  expectRefusal(() => buildToolchainSnapshot({ ...options, pins: fixturePins([resealRecord(buildRecord)]) }));

  const selectorRecord = structuredClone(options.pins.records[0]);
  selectorRecord.domainSelections[0].operation = "parseGateV3";
  expectRefusal(() => buildToolchainSnapshot({ ...options, pins: fixturePins([resealRecord(selectorRecord)]) }));

  const generatedManifestRecord = structuredClone(options.pins.records[0]);
  const counterfeitManifest = fixtureRow("package.json", "{}");
  generatedManifestRecord.sourceOriginParser.generatedPackageManifest = {
    rootLocator: PARSER_ROOT,
    ...counterfeitManifest,
  };
  generatedManifestRecord.dataRows = generatedManifestRecord.dataRows.map((row) => (
    row.locator === `${PARSER_ROOT}/package.json`
      ? joinedRow(PARSER_ROOT, counterfeitManifest)
      : row
  ));
  expectRefusal(() => buildToolchainSnapshot({
    ...options,
    pins: fixturePins([resealRecord(generatedManifestRecord)]),
  }));

  const collisionRecord = structuredClone(options.pins.records[0]);
  collisionRecord.runtimeLoadSets[0].moduleRows.splice(1, 0, fixtureRow("lib/Typescript.js", "case-alias"));
  collisionRecord.executableModuleRows.push(joinedRow(HOST_ROOT, collisionRecord.runtimeLoadSets[0].moduleRows[1]));
  collisionRecord.executableModuleRows.sort((left, right) => left.locator < right.locator ? -1 : left.locator > right.locator ? 1 : 0);
  expectRefusal(() => buildToolchainSnapshot({ ...options, pins: fixturePins([resealRecord(collisionRecord)]) }));
});

for (const locator of OMISSION_CONTROL_LOCATORS) {
  test("pin records refuse omission of required declared data member " + locator, () => {
    const options = fixtureOptions();
    const record = structuredClone(options.pins.records[0]);
    record.dataRows = record.dataRows.filter((row) => row.locator !== locator);
    assert.equal(record.dataRows.length, REQUIRED_DATA_LOCATORS.length - 1);
    expectRefusal(() => buildToolchainSnapshot({
      ...options,
      pins: fixturePins([resealRecord(record)]),
    }));
  });
}

test("pin records refuse a portable sorted surplus generated data row after resealing", () => {
  const options = fixtureOptions();
  const record = structuredClone(options.pins.records[0]);
  record.dataRows.push(fixtureRow("generated-source-origin-parser/surplus.json", "surplus"));
  record.dataRows.sort((left, right) => left.locator < right.locator ? -1 : left.locator > right.locator ? 1 : 0);
  expectRefusal(() => buildToolchainSnapshot({
    ...options,
    pins: fixturePins([resealRecord(record)]),
  }));
});

test("pin records refuse a portable sorted surplus source data row after resealing", () => {
  const options = fixtureOptions();
  const record = structuredClone(options.pins.records[0]);
  record.dataRows.push(fixtureRow("packages-ts/galerina-core-compiler/src/surplus.ts", "surplus"));
  record.dataRows.sort((left, right) => left.locator < right.locator ? -1 : left.locator > right.locator ? 1 : 0);
  expectRefusal(() => buildToolchainSnapshot({
    ...options,
    pins: fixturePins([resealRecord(record)]),
  }));
});

test("pin records refuse a portable sorted surplus TypeScript data row after resealing", () => {
  const options = fixtureOptions();
  const record = structuredClone(options.pins.records[0]);
  record.dataRows.push(fixtureRow("packages-ts/galerina-core-compiler/node_modules/typescript/surplus.json", "surplus"));
  record.dataRows.sort((left, right) => left.locator < right.locator ? -1 : left.locator > right.locator ? 1 : 0);
  expectRefusal(() => buildToolchainSnapshot({
    ...options,
    pins: fixturePins([resealRecord(record)]),
  }));
});

test("pin-record data locators use the same portable root-relative colon rule as derivation", () => {
  const options = fixtureOptions();
  const record = structuredClone(options.pins.records[0]);
  record.dataRows.push(fixtureRow("generated-source-origin-parser/x:extra.json", "surplus"));
  record.dataRows.sort((left, right) => left.locator < right.locator ? -1 : left.locator > right.locator ? 1 : 0);
  expectRefusal(
    () => buildToolchainSnapshot({ ...options, pins: fixturePins([resealRecord(record)]) }),
    /^SOURCE_ORIGIN_POLICY$/,
  );
});

test("empty production pins remain an explicit HOLD with no manifest", () => {
  const options = fixtureOptions({ pins: fixturePins([]) });
  expectRefusal(() => buildToolchainSnapshot(options), /^SOURCE_ORIGIN_HOLD_TOOLCHAIN$/);
});

test("snapshot inputs are captured defensively before any output is formed", () => {
  let calls = 0;
  const hostile = new Proxy({}, {
    get() { calls += 1; throw new Error("proxy get ran"); },
    getOwnPropertyDescriptor() { calls += 1; throw new Error("proxy descriptor ran"); },
    getPrototypeOf() { calls += 1; throw new Error("proxy prototype ran"); },
    ownKeys() { calls += 1; throw new Error("proxy keys ran"); },
  });
  expectRefusal(() => buildToolchainSnapshot(hostile));
  expectRefusal(() => buildToolchainSnapshot({ ...fixtureOptions(), pins: hostile }));
  assert.equal(calls, 0);

  const options = fixtureOptions();
  const manifest = buildToolchainSnapshot(options);
  const retained = manifest.actualLoadedModuleRows[0].locator;
  options.actualRuntimeLoadSets[0].moduleRows[0].locator = "lib/mutated.js";
  assert.equal(manifest.actualLoadedModuleRows[0].locator, retained);
  assert(Object.isFrozen(manifest.actualRuntimeLoadSets));
  assert.doesNotMatch(canonicalJsonText(manifest), /toolchain-manifest\.v1|actual-loaded-set\.v1/);
});

test("pre-evaluation selection freezes HOST, FUNGI and GATE to the approved entries and operations", () => {
  const expected = {
    HOST: { runtimeLoadSetId: "HOST", operation: "typescript-compiler-api", rootLocator: HOST_ROOT, locator: "lib/typescript.js" },
    FUNGI: { runtimeLoadSetId: "PARSER", operation: "parseProgram", rootLocator: PARSER_ROOT, locator: "source-origin-parser-entry.js" },
    GATE: { runtimeLoadSetId: "PARSER", operation: "parseGateV3", rootLocator: PARSER_ROOT, locator: "source-origin-parser-entry.js" },
  };
  for (const domain of ["HOST", "FUNGI", "GATE"]) {
    const selected = toolchainSnapshot.prepareToolchainSelection(selectionOptions(domain));
    assert.equal(selected.domain, domain);
    assert.equal(selected.runtimeLoadSetId, expected[domain].runtimeLoadSetId);
    assert.equal(selected.operation, expected[domain].operation);
    assert.deepEqual(selected.entry, {
      rootLocator: expected[domain].rootLocator,
      locator: expected[domain].locator,
    });
    assert.equal(selected.authorizing, false);
    assert(Object.isFrozen(selected));
    assert(Object.isFrozen(selected.moduleRows));
  }
});

test("package, main, broad-entry, source-entry, record and guard poison refuses before evaluation", () => {
  const base = selectionOptions("FUNGI");
  const poisons = [];
  for (const [resolutionMode, rootLocator, locator] of [
    ["PACKAGE_NAME", "@galerina/core-compiler", "@galerina/core-compiler"],
    ["PACKAGE_MAIN", "packages-ts/galerina-core-compiler", "package.json"],
    ["EXACT_ROOT_LOCAL_V1", "packages-ts/galerina-core-compiler", "dist/index.js"],
    ["EXACT_ROOT_LOCAL_V1", "packages-ts/galerina-core-compiler", "src/index.ts"],
    ["EXACT_ROOT_LOCAL_V1", "packages-ts/galerina-core-compiler", "src/source-origin-parser-entry.ts"],
    ["EXACT_ROOT_LOCAL_V1", PARSER_ROOT, "source-origin-parser-entry.ts"],
  ]) {
    const candidate = structuredClone(base);
    Object.assign(candidate.selector, { resolutionMode, entry: { rootLocator, locator } });
    poisons.push(candidate);
  }
  const wrongRecord = structuredClone(base);
  wrongRecord.selector.recordId = "linux-x64";
  poisons.push(wrongRecord);
  const wrongDigest = structuredClone(base);
  wrongDigest.selector.recordDigest = "f".repeat(64);
  poisons.push(wrongDigest);
  const wrongGuard = structuredClone(base);
  wrongGuard.guardRuntimeLoadSet.id = "HOST";
  poisons.push(wrongGuard);
  const dataRowLoad = structuredClone(base);
  dataRowLoad.guardRuntimeLoadSet.moduleRows.push(fixtureRow("package.json", '{"type":"module"}'));
  poisons.push(dataRowLoad);
  const missingRow = structuredClone(base);
  missingRow.guardRuntimeLoadSet.moduleRows.pop();
  poisons.push(missingRow);
  const missingNonEntryRow = structuredClone(base);
  missingNonEntryRow.guardRuntimeLoadSet.moduleRows.shift();
  poisons.push(missingNonEntryRow);
  const lazyRow = structuredClone(base);
  lazyRow.guardRuntimeLoadSet.moduleRows.push(fixtureRow("lazy.js"));
  poisons.push(lazyRow);
  const extraBuiltin = structuredClone(base);
  extraBuiltin.guardRuntimeLoadSet.builtinModules.push("node:fs");
  poisons.push(extraBuiltin);
  const missingBuiltin = selectionOptions("HOST");
  missingBuiltin.guardRuntimeLoadSet.builtinModules.pop();
  poisons.push(missingBuiltin);

  let evaluations = 0;
  for (const candidate of poisons) {
    expectRefusal(() => toolchainSnapshot.prepareToolchainSelection(candidate));
  }
  expectRefusal(() => toolchainSnapshot.prepareToolchainSelection({
    ...base,
    evaluate() { evaluations += 1; },
  }));
  assert.equal(evaluations, 0);
});

test("selector mutation and post-selection allowlist widening cannot alter the captured guard", () => {
  const options = selectionOptions("HOST");
  const selected = toolchainSnapshot.prepareToolchainSelection(options);
  const retainedEntry = structuredClone(selected.entry);
  const retainedRows = structuredClone(selected.moduleRows);
  options.selector.entry.locator = "dist/index.js";
  options.guardRuntimeLoadSet.moduleRows.push(fixtureRow("lib/lazy.js"));
  assert.deepEqual(selected.entry, retainedEntry);
  assert.deepEqual(selected.moduleRows, retainedRows);
  assert.throws(() => selected.moduleRows.push(fixtureRow("lib/post-execution.js")), TypeError);
  assert.deepEqual(Object.keys(selected).sort(), [
    "authorizing", "builtinModules", "domain", "entry", "moduleRows", "operation",
    "parserExportNames", "parserId", "recordDigest", "recordId", "runtimeLoadSetId",
  ].sort());
  assert.equal("toolchainManifest" in selected, false);
  assert.equal("parserResult" in selected, false);
  assert.equal("exportArtifact" in selected, false);
});

test("v2 snapshot options remain closed to legacy startup, union and evaluator inputs", () => {
  const options = fixtureOptions();
  for (const extra of [
    { nodeStartup: { legacy: true } },
    { actualLoadedModuleRows: [] },
    { actualLoadedBuiltinModules: [] },
    { executeParser() { throw new Error("must not execute"); } },
  ]) {
    expectRefusal(() => buildToolchainSnapshot({ ...options, ...extra }), /^SOURCE_ORIGIN_SCHEMA$/);
  }
  assert.doesNotMatch(
    canonicalJsonText(buildToolchainSnapshot(options)),
    /WINDOWS_SYSTEMROOT_ONLY|SystemRoot|nodeStartup|executionBoundary|galerinaParser/,
  );
});

test("v2 record selection binds one platform, architecture, Node identity and Git identity", () => {
  const options = fixtureOptions();
  expectRefusal(() => buildToolchainSnapshot({ ...options, platform: "linux" }));
  expectRefusal(() => buildToolchainSnapshot({ ...options, arch: "arm64" }));
  expectRefusal(() => buildToolchainSnapshot({
    ...options,
    nodeIdentity: { ...options.nodeIdentity, executableRawSha256: "4".repeat(64) },
  }));
  expectRefusal(() => buildToolchainSnapshot({
    ...options,
    gitIdentity: { ...options.gitIdentity, executableByteLength: options.gitIdentity.executableByteLength + 1 },
  }));
  expectRefusal(() => buildToolchainSnapshot({
    ...options,
    pins: fixturePins([options.pins.records[0], options.pins.records[0]]),
  }));
});

test("v2 executable, data and builtin owners remain sorted, unique and disjoint", () => {
  const base = fixtureOptions();
  const hostileRecords = [];
  const reversedExecutable = structuredClone(base.pins.records[0]);
  reversedExecutable.executableModuleRows.reverse();
  hostileRecords.push(reversedExecutable);
  const duplicateExecutable = structuredClone(base.pins.records[0]);
  duplicateExecutable.executableModuleRows.splice(1, 0, structuredClone(duplicateExecutable.executableModuleRows[0]));
  hostileRecords.push(duplicateExecutable);
  const overlappingData = structuredClone(base.pins.records[0]);
  overlappingData.dataRows.push(structuredClone(overlappingData.executableModuleRows[0]));
  overlappingData.dataRows.sort((left, right) => left.locator < right.locator ? -1 : left.locator > right.locator ? 1 : 0);
  hostileRecords.push(overlappingData);
  const reversedBuiltins = structuredClone(base.pins.records[0]);
  reversedBuiltins.builtinModules.reverse();
  hostileRecords.push(reversedBuiltins);
  const duplicateBuiltins = structuredClone(base.pins.records[0]);
  duplicateBuiltins.builtinModules.push(duplicateBuiltins.builtinModules[0]);
  hostileRecords.push(duplicateBuiltins);
  for (const record of hostileRecords) {
    expectRefusal(() => buildToolchainSnapshot({ ...base, pins: fixturePins([resealRecord(record)]) }));
  }
});

test("v2 actual rows refuse altered identities, duplicates and noncanonical ordering", () => {
  const options = fixtureOptions();
  const altered = structuredClone(options.actualRuntimeLoadSets);
  altered[0].moduleRows[0].rawSha256 = "5".repeat(64);
  const duplicated = structuredClone(options.actualRuntimeLoadSets);
  duplicated[0].moduleRows.splice(1, 0, structuredClone(duplicated[0].moduleRows[0]));
  const reordered = structuredClone(options.actualRuntimeLoadSets);
  reordered[1].moduleRows.reverse();
  const reorderedBuiltins = structuredClone(options.actualRuntimeLoadSets);
  reorderedBuiltins[0].builtinModules.reverse();
  for (const actualRuntimeLoadSets of [altered, duplicated, reordered, reorderedBuiltins]) {
    expectRefusal(() => buildToolchainSnapshot({ ...options, actualRuntimeLoadSets }));
  }
});

test("v2 defensive capture preserves determinism and refuses accessors, sparse arrays, cycles and unsafe integers", () => {
  const options = fixtureOptions();
  const first = buildToolchainSnapshot(options);
  const second = buildToolchainSnapshot(structuredClone(options));
  assert.deepEqual(second, first);
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.actualRuntimeLoadSets[0].moduleRows));

  let getterCalls = 0;
  const accessor = fixtureOptions();
  Object.defineProperty(accessor, "platform", {
    enumerable: true,
    get() { getterCalls += 1; return FIXTURE_PLATFORM; },
  });
  expectRefusal(() => buildToolchainSnapshot(accessor));
  assert.equal(getterCalls, 0);

  const sparse = fixtureOptions();
  sparse.actualRuntimeLoadSets[0].moduleRows = new Array(2);
  expectRefusal(() => buildToolchainSnapshot(sparse));
  const cyclic = fixtureOptions();
  cyclic.pins.records[0].typescript = cyclic;
  expectRefusal(() => buildToolchainSnapshot(cyclic));
  let deeplyNested = null;
  for (let index = 0; index <= 129; index += 1) deeplyNested = [deeplyNested];
  const deep = fixtureOptions();
  deep.pins.records[0].dataRows[0].locator = deeplyNested;
  expectRefusal(() => buildToolchainSnapshot(deep));
  const unsafe = fixtureOptions();
  unsafe.pins.records[0].runtimeLoadSets[0].moduleRows[0].byteLength = Number.MAX_SAFE_INTEGER + 1;
  expectRefusal(() => buildToolchainSnapshot(unsafe));
});

test("eighth-review toolchain public entries snapshot Object.getPrototypeOf", async (t) => {
  const safeGetDescriptor = Object.getOwnPropertyDescriptor;
  const safeDefineProperty = Object.defineProperty;
  for (const name of ["prepareToolchainSelection", "prepareSemanticToolchain", "buildToolchainSnapshot"]) {
    await t.test(name, () => {
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
      try { toolchainSnapshot[name]({}); } catch (error) { failure = error; }
      finally { safeDefineProperty(Object, "getPrototypeOf", descriptor); }
      assert.equal(effects, 0);
      assert.equal(failure?.code, "SOURCE_ORIGIN_SCHEMA");
    });
  }

  await t.test("a synced isProxy replacement cannot expose a toolchain option Proxy", async () => {
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
    try { toolchainSnapshot.buildToolchainSnapshot(hostile); } catch (error) { failure = error; }
    finally {
      safeDefineProperty(types, "isProxy", descriptor);
      syncBuiltinESMExports();
    }
    assert.equal(effects, 0);
    assert.equal(proxyTraps, 0);
    assert.equal(failure?.code, "SOURCE_ORIGIN_SCHEMA");
  });
});

test("ninth-review descriptor gates require own data values in toolchain inputs", { timeout: 30_000 }, () => {
  const options = fixtureOptions();
  let inputEffects = 0;
  Object.defineProperty(options, "platform", {
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
  try { buildToolchainSnapshot(options); } catch (error) { failure = error; }
  finally {
    if (inherited) safeDefineProperty(Object.prototype, "value", inherited);
    else delete Object.prototype.value;
  }
  assert.equal(inputEffects, 0);
  assert.equal(descriptorEffects, 0);
  assert.equal(failure?.code, "SOURCE_ORIGIN_SCHEMA");
});

test("semantic preparation derives the closed HOST, FUNGI and GATE selections without caller selectors", () => {
  const record = fixtureRecord();
  const options = {
    pins: fixturePins([record]),
    platform: record.platform,
    arch: record.arch,
    nodeIdentity: structuredClone(record.nodeIdentity),
    gitIdentity: structuredClone(record.gitIdentity),
  };
  const prepared = toolchainSnapshot.prepareSemanticToolchain(options);
  assertClosedObject(prepared, [
    "pinsDigest", "recordId", "recordDigest", "platform", "arch",
    "nodeIdentity", "gitIdentity", "selections", "authorizing",
  ]);
  assert.equal(prepared.authorizing, false);
  assert.deepEqual(prepared.selections.map(({ domain, runtimeLoadSetId, operation, entry }) => ({ domain, runtimeLoadSetId, operation, entry })), [
    { domain: "FUNGI", runtimeLoadSetId: "PARSER", operation: "parseProgram", entry: { rootLocator: PARSER_ROOT, locator: "source-origin-parser-entry.js" } },
    { domain: "GATE", runtimeLoadSetId: "PARSER", operation: "parseGateV3", entry: { rootLocator: PARSER_ROOT, locator: "source-origin-parser-entry.js" } },
    { domain: "HOST", runtimeLoadSetId: "HOST", operation: "typescript-compiler-api", entry: { rootLocator: HOST_ROOT, locator: "lib/typescript.js" } },
  ]);
  assert.deepEqual(prepared.selections.map(({ parserExportNames }) => parserExportNames), [PARSER_EXPORTS, PARSER_EXPORTS, null]);
  assert(Object.isFrozen(prepared));
  assert(Object.isFrozen(prepared.selections));
  assert(Object.isFrozen(prepared.selections[0].moduleRows));
  options.pins.records[0].runtimeLoadSets[0].moduleRows[0].locator = "dist/index.js";
  assert.equal(prepared.selections[2].entry.locator, "lib/typescript.js");
});

test("semantic preparation refuses caller selection, guard and evaluator authority before evaluation", () => {
  const record = fixtureRecord();
  const base = {
    pins: fixturePins([record]),
    platform: record.platform,
    arch: record.arch,
    nodeIdentity: structuredClone(record.nodeIdentity),
    gitIdentity: structuredClone(record.gitIdentity),
  };
  let evaluations = 0;
  for (const extra of [
    { selector: selectionOptions("HOST").selector },
    { guardRuntimeLoadSet: selectionOptions("HOST").guardRuntimeLoadSet },
    { parserExportNames: [...PARSER_EXPORTS] },
    { evaluate() { evaluations += 1; } },
  ]) expectRefusal(() => toolchainSnapshot.prepareSemanticToolchain({ ...base, ...extra }), /^SOURCE_ORIGIN_SCHEMA$/);
  assert.equal(evaluations, 0);

  const wrongIdentity = structuredClone(base);
  wrongIdentity.nodeIdentity.executableRawSha256 = "0".repeat(64);
  expectRefusal(() => toolchainSnapshot.prepareSemanticToolchain(wrongIdentity));
});
