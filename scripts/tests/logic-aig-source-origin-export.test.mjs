import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  canonicalJsonText,
  serializeCompleteExportSidecarV1,
  sha256CompleteUnresolvedRowsV1,
} from '../lib/logic-aig-source-origin/contract.mjs';
import * as productionExport from '../galerina-source-origin-export.mjs';

const GENUINE_COMMIT = 'f0de2475a7ff6f67849a25855d3c1fb45d535048';
const IDS = [
  'expected-parse-outcomes',
  'export-sidecar',
  'parse-outcomes-receipt',
  'project',
  'resolution-inputs',
  'source-manifest',
  'toolchain-manifest',
];

const safeObjectDefineProperty = Object.defineProperty;
const safeObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

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
  assert.deepEqual(Object.getOwnPropertyNames(records), ['0', '1', '2', '3', '4', '5', '6', 'length']);
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
