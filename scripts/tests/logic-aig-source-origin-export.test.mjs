import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import nodeTest from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canonicalJsonText,
  serializeCompleteExportSidecarV1,
  sha256CompleteUnresolvedRowsV1,
} from '../lib/logic-aig-source-origin/contract.mjs';
import * as productionExport from '../galerina-source-origin-export.mjs';

const GENUINE_COMMIT = 'f0de2475a7ff6f67849a25855d3c1fb45d535048';
const TASK6B_PLAIN_SENTINEL_ARGUMENT = '--task6b-plain-exporter-sentinel';
const TASK6B_PLAIN_SENTINEL_MODE = process.argv.length === 3
  && process.argv[2] === TASK6B_PLAIN_SENTINEL_ARGUMENT;
const test = TASK6B_PLAIN_SENTINEL_MODE ? () => undefined : nodeTest;
const IDS = Object.freeze([
  'expected-parse-outcomes',
  'export-sidecar',
  'parse-outcomes-receipt',
  'project',
  'resolution-inputs',
  'source-manifest',
  'toolchain-manifest',
]);
const TASK6B_PLAIN_SENTINEL_SUMMARY = Object.freeze({
  schema: 'galerina.task6b-exporter-poison-sentinel.v1',
  status: 'PASS',
  descriptorGetTraps: 0,
  descriptorSetTraps: 0,
  inheritedThenCalls: 0,
  refusalCode: 'SOURCE_ORIGIN_EXPORT_SCHEMA',
  recordCount: 7,
  bodyCheckCount: 7,
  exactCanonicalBodyCount: 7,
  positiveBodyCount: 7,
  resultOwnNameCount: 9,
  totalBytes: 110_300_409,
  promiseResolveSameResult: true,
  directAwaitSameResult: true,
  ids: IDS,
});

const safeObjectDefineProperty = Object.defineProperty;
const safeObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const safeObjectGetOwnPropertyNames = Object.getOwnPropertyNames;
const safeObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
const safeObjectGetPrototypeOf = Object.getPrototypeOf;
const safeObjectCreate = Object.create;
const safeObjectEntries = Object.entries;
const safeObjectFromEntries = Object.fromEntries;
const safeObjectHasOwn = Object.hasOwn;
const safeObjectIsFrozen = Object.isFrozen;
const safeObjectKeys = Object.keys;
const safeDeleteProperty = Reflect.deleteProperty;
const safeBufferCompare = Buffer.compare;
const safeBufferIsBuffer = Buffer.isBuffer;

function nullDescriptor(fields) {
  const descriptor = safeObjectCreate(null);
  for (const field of ['configurable', 'enumerable', 'value', 'writable', 'get', 'set']) {
    if (safeObjectHasOwn(fields, field)) descriptor[field] = fields[field];
  }
  return descriptor;
}

function copyPropertyDescriptor(descriptor) {
  return descriptor === undefined ? undefined : nullDescriptor(descriptor);
}

function installInheritedDescriptorFieldPoison() {
  const originals = safeObjectCreate(null);
  originals.get = copyPropertyDescriptor(
    safeObjectGetOwnPropertyDescriptor(Object.prototype, 'get'),
  );
  originals.set = copyPropertyDescriptor(
    safeObjectGetOwnPropertyDescriptor(Object.prototype, 'set'),
  );
  let getTraps = 0;
  let setTraps = 0;
  safeObjectDefineProperty(Object.prototype, 'get', nullDescriptor({
    configurable: true,
    enumerable: false,
    get() {
      getTraps += 1;
      return undefined;
    },
  }));
  safeObjectDefineProperty(Object.prototype, 'set', nullDescriptor({
    configurable: true,
    enumerable: false,
    get() {
      setTraps += 1;
      return undefined;
    },
  }));
  const controller = safeObjectCreate(null);
  controller.counts = () => ({ get: getTraps, set: setTraps });
  controller.restore = () => {
    for (const field of ['get', 'set']) {
      const descriptor = originals[field];
      if (descriptor === undefined) safeDeleteProperty(Object.prototype, field);
      else safeObjectDefineProperty(Object.prototype, field, descriptor);
    }
  };
  return controller;
}

function installInheritedThenPoison() {
  const original = copyPropertyDescriptor(
    safeObjectGetOwnPropertyDescriptor(Object.prototype, 'then'),
  );
  let traps = 0;
  safeObjectDefineProperty(Object.prototype, 'then', nullDescriptor({
    configurable: true,
    enumerable: false,
    value(resolve, reject) {
      try {
        traps += 1;
        safeObjectDefineProperty(this, 'then', nullDescriptor({
          configurable: true,
          value: undefined,
        }));
        resolve(this);
        safeDeleteProperty(this, 'then');
      } catch (error) {
        reject(error);
      }
    },
    writable: true,
  }));
  const controller = safeObjectCreate(null);
  controller.traps = () => traps;
  controller.restore = () => {
    if (original === undefined) safeDeleteProperty(Object.prototype, 'then');
    else safeObjectDefineProperty(Object.prototype, 'then', original);
  };
  return controller;
}

function installPostImportRegExpTestPoison() {
  const descriptor = safeObjectGetOwnPropertyDescriptor(RegExp.prototype, 'test');
  let traps = 0;
  safeObjectDefineProperty(RegExp.prototype, 'test', {
    ...descriptor,
    configurable: true,
    value() {
      traps += 1;
      throw new Error('ATTACKER_REGEXP_TEST');
    },
  });

  return {
    get traps() { return traps; },
    restore() {
      safeObjectDefineProperty(RegExp.prototype, 'test', descriptor);
    },
  };
}

function bodyById(records, id) {
  return JSON.parse(records.find((record) => record.id === id).bytes.toString('utf8'));
}

function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function inspectSevenRecordBodyBytes(records) {
  const rows = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const parsed = JSON.parse(record.bytes.toString('utf8'));
    const expectedBytes = record.id === 'export-sidecar'
      ? serializeCompleteExportSidecarV1(safeObjectFromEntries(
        safeObjectEntries(parsed).filter(([key]) => key !== 'sidecarDigest'),
      ))
      : Buffer.from(canonicalJsonText(parsed), 'utf8');
    rows[index] = {
      id: record.id,
      prototype: safeObjectGetPrototypeOf(record),
      frozen: safeObjectIsFrozen(record),
      keys: safeObjectKeys(record),
      symbols: safeObjectGetOwnPropertySymbols(record),
      isBuffer: safeBufferIsBuffer(record.bytes),
      exactCanonicalBytes: safeBufferCompare(record.bytes, expectedBytes) === 0,
      byteLength: record.bytes.byteLength,
    };
  }
  return rows;
}

function plainChildEnvironment() {
  const environment = safeObjectCreate(null);
  for (const [key, value] of safeObjectEntries(process.env)) {
    if (key === 'NODE_TEST_CONTEXT' || key === 'NODE_TEST_WORKER_ID') continue;
    environment[key] = value;
  }
  return environment;
}

test('Task 6B exporter is hardwired to one frozen commit', async () => {
  assert.deepEqual(Object.keys(productionExport), ['exportSourceOriginProject']);
  assert.equal(productionExport.exportSourceOriginProject.length, 1);

  let traps = 0;
  const hostile = new Proxy({}, {
    get() { traps += 1; throw new Error('must not execute'); },
    getOwnPropertyDescriptor() { traps += 1; throw new Error('must not execute'); },
    getPrototypeOf() { traps += 1; throw new Error('must not execute'); },
    ownKeys() { traps += 1; throw new Error('must not execute'); },
  });
  await assert.rejects(
    productionExport.exportSourceOriginProject(hostile, hostile),
    /^SourceOriginExportRefusal: SOURCE_ORIGIN_EXPORT_SCHEMA$/,
  );
  assert.equal(traps, 0);
  await assert.rejects(
    productionExport.exportSourceOriginProject('0'.repeat(40), hostile),
    /^SourceOriginExportRefusal: SOURCE_ORIGIN_EXPORT_SCHEMA$/,
  );
  assert.equal(traps, 0);
});

test('Task 6B exporter argument refusal bypasses post-import RegExp dispatch', async () => {
  const poison = installPostImportRegExpTestPoison();
  let failure;
  try {
    await productionExport.exportSourceOriginProject('not-a-commit');
  } catch (error) {
    failure = error;
  } finally {
    poison.restore();
  }
  assert.equal(poison.traps, 0);
  assert.equal(failure?.name, 'SourceOriginExportRefusal');
  assert.equal(failure?.code, 'SOURCE_ORIGIN_EXPORT_SCHEMA');
  assert.equal(Object.isFrozen(Object.getPrototypeOf(failure)), true);
  assert.equal(Object.isFrozen(Object.getPrototypeOf(failure).constructor), true);
});

async function executeTask6BExporterPoisonSentinel() {
  const descriptorPoison = installInheritedDescriptorFieldPoison();
  const thenPoison = installInheritedThenPoison();
  let exportPromise;
  let refusal;
  let records;
  let reassimilated;
  let awaitedAgain;
  let bodyInspection;
  let resultInspection;
  let descriptorCounts;
  let thenTraps;
  let failure;
  try {
    exportPromise = productionExport.exportSourceOriginProject(GENUINE_COMMIT);
    try {
      await productionExport.exportSourceOriginProject('not-a-commit');
    } catch (error) {
      refusal = error;
    }
    records = await exportPromise;
    bodyInspection = inspectSevenRecordBodyBytes(records);
    reassimilated = await Promise.resolve(records);
    awaitedAgain = await records;
    resultInspection = {
      prototype: safeObjectGetPrototypeOf(records),
      frozen: safeObjectIsFrozen(records),
      names: safeObjectGetOwnPropertyNames(records),
      symbols: safeObjectGetOwnPropertySymbols(records),
      thenDescriptor: safeObjectGetOwnPropertyDescriptor(records, 'then'),
      ids: records.map((record) => record.id),
      totalBytes: records.reduce((sum, record) => sum + record.bytes.byteLength, 0),
    };
  } catch (error) {
    failure = error;
  } finally {
    descriptorCounts = descriptorPoison.counts();
    thenTraps = thenPoison.traps();
    thenPoison.restore();
    descriptorPoison.restore();
  }

  return {
    descriptorCounts,
    thenTraps,
    refusal,
    failure,
    records,
    reassimilated,
    awaitedAgain,
    bodyInspection,
    resultInspection,
  };
}

function assertTask6BExporterPoisonSentinel(evidence) {
  assert.deepEqual(evidence.descriptorCounts, { get: 0, set: 0 });
  assert.equal(evidence.refusal?.name, 'SourceOriginExportRefusal');
  assert.equal(evidence.refusal?.code, 'SOURCE_ORIGIN_EXPORT_SCHEMA');
  assert.equal(safeObjectIsFrozen(safeObjectGetPrototypeOf(evidence.refusal)), true);
  assert.equal(
    safeObjectIsFrozen(safeObjectGetPrototypeOf(evidence.refusal).constructor),
    true,
  );
  assert.equal(evidence.failure, undefined);
  assert.equal(evidence.thenTraps, 0);
  assert.equal(evidence.reassimilated, evidence.records);
  assert.equal(evidence.awaitedAgain, evidence.records);
  assert.equal(evidence.resultInspection.prototype, Array.prototype);
  assert.equal(evidence.resultInspection.frozen, true);
  assert.deepEqual(evidence.resultInspection.names, [
    '0', '1', '2', '3', '4', '5', '6', 'length', 'then',
  ]);
  assert.deepEqual(evidence.resultInspection.symbols, []);
  assert.deepEqual(evidence.resultInspection.thenDescriptor, {
    configurable: false,
    enumerable: false,
    value: undefined,
    writable: false,
  });
  assert.deepEqual(evidence.resultInspection.ids, IDS);
  assert.equal(evidence.resultInspection.totalBytes, 110_300_409);
  assert.equal(evidence.bodyInspection.length, IDS.length);
  let exactCanonicalBodyCount = 0;
  let positiveBodyCount = 0;
  for (let index = 0; index < IDS.length; index += 1) {
    const body = evidence.bodyInspection[index];
    assert.deepEqual(body, {
      id: IDS[index],
      prototype: Object.prototype,
      frozen: true,
      keys: ['id', 'bytes'],
      symbols: [],
      isBuffer: true,
      exactCanonicalBytes: true,
      byteLength: body.byteLength,
    });
    if (body.exactCanonicalBytes) exactCanonicalBodyCount += 1;
    if (body.byteLength > 0) positiveBodyCount += 1;
  }

  const summary = {
    schema: TASK6B_PLAIN_SENTINEL_SUMMARY.schema,
    status: 'PASS',
    descriptorGetTraps: evidence.descriptorCounts.get,
    descriptorSetTraps: evidence.descriptorCounts.set,
    inheritedThenCalls: evidence.thenTraps,
    refusalCode: evidence.refusal.code,
    recordCount: evidence.records.length,
    bodyCheckCount: evidence.bodyInspection.length,
    exactCanonicalBodyCount,
    positiveBodyCount,
    resultOwnNameCount: evidence.resultInspection.names.length,
    totalBytes: evidence.resultInspection.totalBytes,
    promiseResolveSameResult: evidence.reassimilated === evidence.records,
    directAwaitSameResult: evidence.awaitedAgain === evidence.records,
    ids: evidence.resultInspection.ids,
  };
  assert.deepEqual(summary, TASK6B_PLAIN_SENTINEL_SUMMARY);
  return summary;
}

test('Task 6B exporter result blocks inherited then assimilation', { timeout: 900_000 }, () => {
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), TASK6B_PLAIN_SENTINEL_ARGUMENT],
    {
      encoding: 'utf8',
      env: plainChildEnvironment(),
      maxBuffer: 1024 * 1024,
      timeout: 840_000,
      windowsHide: true,
    },
  );
  const expectedStdout = `${JSON.stringify(TASK6B_PLAIN_SENTINEL_SUMMARY)}\n`;
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0);
  assert.equal(child.stderr, '');
  assert.equal(child.stdout, expectedStdout);
  assert.deepEqual(JSON.parse(child.stdout), TASK6B_PLAIN_SENTINEL_SUMMARY);
});

test('Task 6B exporter returns the genuine complete seven-body set', { timeout: 900_000 }, async () => {
  const head = GENUINE_COMMIT;
  const poison = installPostImportRegExpTestPoison();
  let records;
  let failure;
  try {
    records = await productionExport.exportSourceOriginProject(head);
  } catch (error) {
    failure = error;
  } finally {
    poison.restore();
  }
  assert.equal(failure, undefined);
  assert.equal(poison.traps, 0);

  assert.equal(Object.getPrototypeOf(records), Array.prototype);
  assert.equal(records.length, IDS.length);
  assert.equal(Object.isFrozen(records), true);
  assert.deepEqual(records.map((record) => record.id), IDS);
  assert.deepEqual(Object.getOwnPropertyNames(records), ['0', '1', '2', '3', '4', '5', '6', 'length', 'then']);
  assert.deepEqual(Object.getOwnPropertySymbols(records), []);
  assert.equal(new Set(records).size, records.length);
  assert.equal(new Set(records.map((record) => record.bytes)).size, records.length);

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    assert.equal(Object.getPrototypeOf(record), Object.prototype);
    assert.equal(Object.isFrozen(record), true);
    assert.deepEqual(Object.keys(record), ['id', 'bytes']);
    assert.deepEqual(Object.getOwnPropertySymbols(record), []);
    assert.equal(Buffer.isBuffer(record.bytes), true);
    const parsed = JSON.parse(record.bytes.toString('utf8'));
    if (record.id === 'export-sidecar') {
      assert.deepEqual(
        record.bytes,
        serializeCompleteExportSidecarV1(Object.fromEntries(
          Object.entries(parsed).filter(([key]) => key !== 'sidecarDigest'),
        )),
      );
    } else {
      assert.deepEqual(record.bytes, Buffer.from(canonicalJsonText(parsed), 'utf8'));
    }
  }

  const expected = bodyById(records, 'expected-parse-outcomes');
  const sidecar = bodyById(records, 'export-sidecar');
  const outcomes = bodyById(records, 'parse-outcomes-receipt');
  const project = bodyById(records, 'project');
  const resolution = bodyById(records, 'resolution-inputs');
  const source = bodyById(records, 'source-manifest');
  const toolchain = bodyById(records, 'toolchain-manifest');
  const sidecarBytes = records.find((record) => record.id === 'export-sidecar').bytes;

  assert.deepEqual([
    expected.schema,
    sidecar.schema,
    outcomes.schema,
    project.schema,
    resolution.schema,
    source.schema,
    toolchain.schema,
  ], [
    'galerina.logic-aig-expected-parse-outcomes.v1',
    'galerina.logic-aig-export-receipt.v1',
    'galerina.logic-aig-parse-outcomes-receipt.v1',
    'logic-aig-project.v1',
    'galerina.logic-aig-resolution-inputs.v1',
    'galerina.logic-aig-source-manifest.v1',
    'galerina.logic-aig-toolchain-manifest.v2',
  ]);
  assert.equal(sidecar.status, 'COMPLETE');
  assert.equal(sidecar.authorizing, false);
  assert.equal(source.expectedHead, head);
  assert.equal(resolution.expectedHead, head);
  assert.equal(outcomes.expectedHead, head);
  assert.equal(project.receipt.expectedHead, head);
  assert.equal(sidecar.expectedHead, head);
  assert.equal(sidecar.expectedTree, source.expectedTree);
  assert.equal(sidecar.expectedTree, resolution.expectedTree);
  assert.equal(sidecar.expectedTree, outcomes.expectedTree);
  assert.equal(sidecar.repositoryId, source.repositoryId);
  assert.equal(sidecar.repositoryId, resolution.repositoryId);
  assert.equal(sidecar.repositoryId, outcomes.repositoryId);
  assert.equal(sidecar.repositoryId, project.receipt.repositoryId);
  assert.equal(sidecar.sourceManifestDigest, source.manifestDigest);
  assert.equal(sidecar.resolutionInputsDigest, resolution.resolutionInputsDigest);
  assert.equal(sidecar.toolchainManifestDigest, toolchain.toolchainManifestDigest);
  assert.equal(sidecar.expectedParseOutcomesDigest, expected.expectedOutcomesDigest);
  assert.equal(sidecar.parseOutcomesReceiptDigest, outcomes.receiptDigest);
  assert.equal(outcomes.sourceManifestDigest, source.manifestDigest);
  assert.equal(outcomes.resolutionInputsDigest, resolution.resolutionInputsDigest);
  assert.equal(outcomes.toolchainManifestDigest, toolchain.toolchainManifestDigest);
  assert.equal(outcomes.expectedOutcomesDigest, expected.expectedOutcomesDigest);

  const graphBytes = Buffer.from(canonicalJsonText({ nodes: project.nodes, edges: project.edges }), 'utf8');
  const receiptBytes = Buffer.from(canonicalJsonText(project.receipt), 'utf8');
  const projectBytes = records.find((record) => record.id === 'project').bytes;
  assert.equal(project.receipt.graphDigest, rawSha256(graphBytes));
  assert.equal(sidecar.graphDigest, project.receipt.graphDigest);
  assert.equal(sidecar.graphRawSha256, rawSha256(projectBytes));
  assert.equal(sidecar.graphByteLength, projectBytes.byteLength);
  assert.equal(sidecar.embeddedReceiptDigest, rawSha256(receiptBytes));
  assert.equal(sidecar.unresolved.rowCount, 177_699);
  assert.equal(sidecar.unresolved.rowCount, sidecar.unresolved.rows.length);
  assert.equal(Buffer.byteLength(JSON.stringify(sidecar.unresolved.rows), 'utf8'), 74_270_556);
  assert.equal(sidecarBytes.byteLength, 74_279_137);
  assert.equal(records.reduce((sum, record) => sum + record.bytes.byteLength, 0), 110_300_409);
  assert.equal(
    sidecar.unresolved.rowsDigest,
    sha256CompleteUnresolvedRowsV1(sidecar.unresolved.rows),
  );
  assert.equal(sidecar.idMapDigest.length, 64);
  assert.deepEqual(
    sidecarBytes,
    serializeCompleteExportSidecarV1(Object.fromEntries(
      Object.entries(sidecar).filter(([key]) => key !== 'sidecarDigest'),
    )),
  );
});

if (TASK6B_PLAIN_SENTINEL_MODE) {
  const evidence = await executeTask6BExporterPoisonSentinel();
  const summary = assertTask6BExporterPoisonSentinel(evidence);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
