import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SOURCE_ORIGIN_LIMITS,
  canonicalJsonText,
  serializeCompleteExportSidecarV1,
  sha256CompleteUnresolvedRowsV1,
  validateExpectedParseOutcomes,
  validateParseOutcomesReceipt,
  validateResolutionInputs,
  validateSourceManifest,
  validateToolchainManifest,
} from './contract.mjs';
import { decodeSourceProject } from './decode-project.mjs';
import { captureFrozenSource } from './git-source.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PINNED_GIT = process.platform === 'win32'
  ? fileURLToPath(new URL(
    '../../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe',
    import.meta.url,
  ))
  : '/usr/bin/git';
const HEX_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const NODE_KINDS = Object.freeze([
  'CLASS', 'FILE', 'FLOW', 'FUNCTION', 'GATE', 'INTERFACE', 'METHOD', 'MODULE',
  'ROUTE', 'SYMBOL', 'TYPE',
]);
const RELATIONSHIP_KINDS = Object.freeze([
  'CALLER', 'CONTRACT', 'GENERATED_CONSUMER', 'IMPORT', 'TEST',
]);
const ARTIFACT_IDS = Object.freeze([
  'expected-parse-outcomes',
  'export-sidecar',
  'parse-outcomes-receipt',
  'project',
  'resolution-inputs',
  'source-manifest',
  'toolchain-manifest',
]);

class SourceOriginExportRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'SourceOriginExportRefusal';
    this.code = code;
  }
}

function refuse(code) {
  throw new SourceOriginExportRefusal(code);
}

function rawSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalBytes(value) {
  const bytes = Buffer.from(canonicalJsonText(value), 'utf8');
  if (bytes.byteLength > SOURCE_ORIGIN_LIMITS.jsonBytes) refuse('SOURCE_ORIGIN_EXPORT_LIMIT');
  return bytes;
}

function sameData(left, right) {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function exactKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getOwnPropertySymbols(value).length === 0
    && sameData(Object.keys(value).sort(), [...keys].sort());
}

function selectedPin(captured) {
  const matches = captured.owners.values.pins.records.filter(
    (record) => record.platform === process.platform && record.arch === process.arch,
  );
  if (matches.length !== 1) refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
  return matches[0];
}

function currentNodeIdentity() {
  let bytes;
  try {
    bytes = readFileSync(process.execPath);
  } catch {
    refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
  }
  return {
    version: process.version,
    executableRawSha256: rawSha256(bytes),
    executableByteLength: bytes.byteLength,
  };
}

function joinedPath(locator) {
  return join(REPOSITORY_ROOT, ...locator.split('/'));
}

function toolchainBlobs(captured, pin) {
  const host = pin.runtimeLoadSets.find((row) => row.id === 'HOST');
  if (!host) refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
  const hostLocator = `${host.entry.rootLocator}/${host.entry.locator}`;
  const blobs = new Map();
  let hostBytes;
  try {
    hostBytes = readFileSync(joinedPath(hostLocator));
  } catch {
    refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
  }
  blobs.set(hostLocator, hostBytes);

  const localLocators = new Set([pin.sourceOriginParser.sourceEntry.locator]);
  for (const edge of pin.sourceOriginParser.sourceEdgeRows) {
    localLocators.add(edge.fromLocator);
    localLocators.add(edge.toLocator);
  }
  const root = pin.sourceOriginParser.sourceEntry.rootLocator;
  for (const local of [...localLocators].sort()) {
    const locator = `${root}/${local}`;
    const bytes = captured.sourceBlobs.get(locator);
    if (!bytes) refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
    blobs.set(locator, bytes);
  }
  return blobs;
}

function increment(counts, key) {
  if (!Object.hasOwn(counts, key)) refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
  counts[key] += 1;
}

function zeroCounts(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function assertSortedUnique(rows, field) {
  let previous;
  const seen = new Set();
  for (const row of rows) {
    const value = row[field];
    if (typeof value !== 'string' || seen.has(value) || (previous !== undefined && previous >= value)) {
      refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
    }
    seen.add(value);
    previous = value;
  }
}

function projectBody(captured, decoded) {
  assertSortedUnique(decoded.nodes, 'id');
  assertSortedUnique(decoded.edges, 'id');
  const nodeIds = new Set(decoded.nodes.map((row) => row.id));
  for (const node of decoded.nodes) {
    if (!NODE_KINDS.includes(node.kind)) refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
  }
  for (const edge of decoded.edges) {
    if (!RELATIONSHIP_KINDS.includes(edge.kind) || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
    }
  }
  if (
    decoded.nodes.length !== decoded.idMapRows.length
    || new Set(decoded.idMapRows.map((row) => row.nodeId)).size !== decoded.idMapRows.length
    || decoded.idMapRows.some((row) => !nodeIds.has(row.nodeId))
  ) refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');

  const graphDigest = rawSha256(canonicalBytes({ nodes: decoded.nodes, edges: decoded.edges }));
  const exporter = captured.owners.values.exporter;
  const receipt = {
    schema: 'logic-graph-receipt.v1',
    profile: 'PROJECT',
    repositoryId: captured.sourceManifest.repositoryId,
    expectedHead: captured.sourceManifest.expectedHead,
    indexedHead: captured.sourceManifest.expectedHead,
    decoder: {
      id: exporter.decoderId,
      version: `1.0.0+sha256.${exporter.policyDigest}`,
      available: true,
    },
    graphDigest,
    coverage: {
      algorithm: 'project-closure.v1',
      limits: { maxNodes: SOURCE_ORIGIN_LIMITS.nodes, maxEdges: SOURCE_ORIGIN_LIMITS.edges },
      nodeCount: decoded.nodes.length,
      edgeCount: decoded.edges.length,
      complete: true,
    },
    scope: {
      dirtyInventoryDigest: null,
      locators: [],
      closureKinds: [],
      closureComplete: true,
    },
    parentProjectDigest: null,
  };
  return { schema: 'logic-aig-project.v1', receipt, nodes: decoded.nodes, edges: decoded.edges };
}

function validateSixBodies(captured, decoded, project) {
  const values = captured.owners.values;
  const expected = validateExpectedParseOutcomes(values.expectedOutcomes, { parserPolicy: values.parser });
  const source = validateSourceManifest(captured.sourceManifest, {
    repositoryIdentity: values.repositoryIdentity,
    sourcePolicy: values.source,
  });
  const resolution = validateResolutionInputs(captured.resolutionInputs, {
    repositoryIdentity: values.repositoryIdentity,
    resolutionPolicy: values.resolution,
  });
  const toolchain = validateToolchainManifest(decoded.toolchainManifest, { pins: values.pins });
  const outcomes = validateParseOutcomesReceipt(decoded.parseOutcomesReceipt, {
    repositoryIdentity: values.repositoryIdentity,
    sourcePolicy: values.source,
    resolutionPolicy: values.resolution,
    parserPolicy: values.parser,
    pins: values.pins,
    proposedBaseline: values.proposedBaseline,
    expectedOutcomes: expected,
    sourceManifest: source,
    resolutionInputs: resolution,
    toolchainManifest: toolchain,
  });
  const repeated = [source, resolution, outcomes];
  if (
    repeated.some((body) => body.repositoryId !== source.repositoryId)
    || repeated.some((body) => body.expectedHead !== source.expectedHead)
    || repeated.some((body) => body.expectedTree !== source.expectedTree)
    || project.receipt.repositoryId !== source.repositoryId
    || project.receipt.expectedHead !== source.expectedHead
    || project.receipt.indexedHead !== source.expectedHead
    || outcomes.expectedOutcomesDigest !== expected.expectedOutcomesDigest
    || outcomes.sourceManifestDigest !== source.manifestDigest
    || outcomes.resolutionInputsDigest !== resolution.resolutionInputsDigest
    || outcomes.toolchainManifestDigest !== toolchain.toolchainManifestDigest
  ) refuse('SOURCE_ORIGIN_EXPORT_BINDING');
  return { expected, outcomes, project, resolution, source, toolchain };
}

function buildCounts(captured, decoded, bodies) {
  const nodesByKind = zeroCounts(NODE_KINDS);
  for (const node of decoded.nodes) increment(nodesByKind, node.kind);
  const edgesByKind = zeroCounts(RELATIONSHIP_KINDS);
  for (const edge of decoded.edges) increment(edgesByKind, edge.kind);
  const unresolvedByClass = zeroCounts(RELATIONSHIP_KINDS);
  const reasonCodes = [...new Set(
    captured.owners.values.parser.unresolvedReasonRows.map((row) => row.reasonCode),
  )].sort();
  const unresolvedByReason = zeroCounts(reasonCodes);
  for (const row of decoded.unresolved) {
    increment(unresolvedByClass, row.relationshipClass);
    increment(unresolvedByReason, row.reasonCode);
  }
  const ownerBindings = bodies.outcomes.rows.reduce((sum, row) => sum + row.ownerBindings.length, 0);
  return {
    sourcePaths: bodies.source.counts.paths,
    sourceBlobs: bodies.source.counts.blobs,
    sourceBytes: bodies.source.counts.bytes,
    resolutionRows: bodies.resolution.rows.length,
    resolutionBytes: bodies.resolution.rows.reduce((sum, row) => sum + row.byteLength, 0),
    parseOutcomeRows: bodies.outcomes.rows.length,
    ownerBindings,
    representedFileNodes: new Set(bodies.outcomes.rows.map((row) => row.representedFileNodeId)).size,
    nodesByKind,
    edgesByKind,
    unresolvedByClass,
    unresolvedByReason,
    duplicateIds: 0,
    caseShadows: 0,
    idMapRows: decoded.idMapRows.length,
  };
}

function toolchainBinding(toolchain) {
  return {
    selectedPinRecordId: toolchain.selectedPinRecordId,
    selectedPinRecordDigest: toolchain.selectedPinRecordDigest,
    pinsDigest: toolchain.pinsDigest,
    toolchainManifestDigest: toolchain.toolchainManifestDigest,
    nodeIdentity: toolchain.nodeIdentity,
    gitIdentity: toolchain.gitIdentity,
    typescript: toolchain.typescript,
    sourceOriginParser: toolchain.sourceOriginParser,
    moduleClosureDigest: toolchain.moduleClosureDigest,
    actualLoadedSetDigest: toolchain.actualLoadedSetDigest,
  };
}

function buildSidecar(captured, decoded, bodies, bodyBytes) {
  const values = captured.owners.values;
  const graphBytes = bodyBytes.get('project');
  const unresolved = {
    rows: decoded.unresolved,
    rowCount: decoded.unresolved.length,
    rowsDigest: sha256CompleteUnresolvedRowsV1(decoded.unresolved),
  };
  const body = {
    schema: 'galerina.logic-aig-export-receipt.v1',
    repositoryId: bodies.source.repositoryId,
    expectedHead: bodies.source.expectedHead,
    expectedTree: bodies.source.expectedTree,
    gitObservation: captured.observation,
    sourcePolicy: {
      policyDigest: values.source.policyDigest,
      exclusionDigest: bodies.source.exclusionDigest,
      excludedPaths: bodies.source.counts.exclusions,
      excludedBytes: 0,
    },
    sourceManifestDigest: bodies.source.manifestDigest,
    resolutionInputsDigest: bodies.resolution.resolutionInputsDigest,
    toolchainManifestDigest: bodies.toolchain.toolchainManifestDigest,
    expectedParseOutcomesDigest: bodies.expected.expectedOutcomesDigest,
    parseOutcomesReceiptDigest: bodies.outcomes.receiptDigest,
    generatedConsumerPolicyDigest: values.generated.policyDigest,
    parserPolicyDigest: values.parser.policyDigest,
    repositoryIdentityDigest: values.repositoryIdentity.identityDigest,
    graphDigest: bodies.project.receipt.graphDigest,
    graphRawSha256: rawSha256(graphBytes),
    graphByteLength: graphBytes.byteLength,
    embeddedReceiptDigest: rawSha256(canonicalBytes(bodies.project.receipt)),
    counts: buildCounts(captured, decoded, bodies),
    unresolved,
    idMapDigest: decoded.idMapDigest,
    toolchain: toolchainBinding(bodies.toolchain),
    executionPolicy: {
      argvPolicyDigest: values.exporter.argvPolicyDigest,
      environmentPolicyDigest: values.exporter.environmentPolicyDigest,
      timeoutMillis: values.exporter.limits.processMillis,
      outputByteLimit: values.exporter.limits.processOutputBytes,
      concurrencyLimit: 1,
    },
    nativeGraphCrossCheck: { status: 'UNAVAILABLE', receiptDigest: null, authorizing: false },
    discoveryCrossChecks: [],
    limits: values.exporter.limits,
    status: 'COMPLETE',
    authorizing: false,
  };
  return body;
}

function validateSidecar(captured, decoded, bodies, sidecar, bodyBytes) {
  const topKeys = [
    'schema', 'repositoryId', 'expectedHead', 'expectedTree', 'gitObservation',
    'sourcePolicy', 'sourceManifestDigest', 'resolutionInputsDigest',
    'toolchainManifestDigest', 'expectedParseOutcomesDigest',
    'parseOutcomesReceiptDigest', 'generatedConsumerPolicyDigest',
    'parserPolicyDigest', 'repositoryIdentityDigest', 'graphDigest',
    'graphRawSha256', 'graphByteLength', 'embeddedReceiptDigest', 'counts',
    'unresolved', 'idMapDigest', 'toolchain', 'executionPolicy',
    'nativeGraphCrossCheck', 'discoveryCrossChecks', 'limits', 'status',
    'authorizing',
  ];
  const values = captured.owners.values;
  if (
    !exactKeys(sidecar, topKeys)
    || sidecar.status !== 'COMPLETE'
    || sidecar.authorizing !== false
    || sidecar.graphRawSha256 !== rawSha256(bodyBytes.get('project'))
    || sidecar.graphByteLength !== bodyBytes.get('project').byteLength
    || sidecar.embeddedReceiptDigest !== rawSha256(canonicalBytes(bodies.project.receipt))
    || sidecar.unresolved.rowCount !== decoded.unresolved.length
    || sidecar.unresolved.rows !== decoded.unresolved
    || sidecar.unresolved.rowsDigest !== sha256CompleteUnresolvedRowsV1(decoded.unresolved)
    || sidecar.idMapDigest !== decoded.idMapDigest
    || !sameData(sidecar.gitObservation, captured.observation)
    || !sameData(sidecar.limits, SOURCE_ORIGIN_LIMITS)
    || !sameData(sidecar.limits, values.exporter.limits)
    || !sameData(sidecar.toolchain, toolchainBinding(bodies.toolchain))
    || sidecar.sourceManifestDigest !== bodies.source.manifestDigest
    || sidecar.resolutionInputsDigest !== bodies.resolution.resolutionInputsDigest
    || sidecar.toolchainManifestDigest !== bodies.toolchain.toolchainManifestDigest
    || sidecar.expectedParseOutcomesDigest !== bodies.expected.expectedOutcomesDigest
    || sidecar.parseOutcomesReceiptDigest !== bodies.outcomes.receiptDigest
  ) refuse('SOURCE_ORIGIN_EXPORT_SIDECAR');
  const nodeTotal = Object.values(sidecar.counts.nodesByKind).reduce((sum, count) => sum + count, 0);
  const edgeTotal = Object.values(sidecar.counts.edgesByKind).reduce((sum, count) => sum + count, 0);
  const unresolvedClassTotal = Object.values(sidecar.counts.unresolvedByClass).reduce((sum, count) => sum + count, 0);
  const unresolvedReasonTotal = Object.values(sidecar.counts.unresolvedByReason).reduce((sum, count) => sum + count, 0);
  if (
    nodeTotal !== decoded.nodes.length
    || edgeTotal !== decoded.edges.length
    || unresolvedClassTotal !== decoded.unresolved.length
    || unresolvedReasonTotal !== decoded.unresolved.length
    || sidecar.counts.idMapRows !== decoded.nodes.length
    || sidecar.counts.duplicateIds !== 0
    || sidecar.counts.caseShadows !== 0
  ) refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
}

function artifactArray(bodyBytes) {
  const records = [];
  for (const id of ARTIFACT_IDS) {
    const bytes = bodyBytes.get(id);
    if (!Buffer.isBuffer(bytes)) refuse('SOURCE_ORIGIN_EXPORT_SERIALIZATION');
    records.push(Object.freeze({ id, bytes }));
  }
  return Object.freeze(records);
}

export async function exportSourceOriginProject(commitOid) {
  if (arguments.length !== 1 || typeof commitOid !== 'string' || !HEX_COMMIT.test(commitOid)) {
    refuse('SOURCE_ORIGIN_EXPORT_SCHEMA');
  }
  try {
    const captured = await captureFrozenSource({ commitOid, gitExecutableLocator: PINNED_GIT });
    const pin = selectedPin(captured);
    const nodeIdentity = currentNodeIdentity();
    if (!sameData(nodeIdentity, pin.nodeIdentity)) refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
    if (
      captured.observation.before.gitVersion !== `git version ${pin.gitIdentity.version}`
      || captured.observation.after.gitVersion !== `git version ${pin.gitIdentity.version}`
      || captured.observation.before.gitExecutableRawSha256 !== pin.gitIdentity.executableRawSha256
      || captured.observation.after.gitExecutableRawSha256 !== pin.gitIdentity.executableRawSha256
      || captured.observation.before.gitExecutableByteLength !== pin.gitIdentity.executableByteLength
      || captured.observation.after.gitExecutableByteLength !== pin.gitIdentity.executableByteLength
    ) refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');

    const decoded = await decodeSourceProject({
      owners: captured.owners,
      ownerBlobs: captured.ownerBlobs,
      sourceManifest: captured.sourceManifest,
      sourceBlobs: captured.sourceBlobs,
      resolutionInputs: captured.resolutionInputs,
      resolutionBlobs: captured.resolutionBlobs,
      toolchainBlobs: toolchainBlobs(captured, pin),
      platform: process.platform,
      arch: process.arch,
      nodeIdentity,
      gitIdentity: pin.gitIdentity,
    });
    const project = projectBody(captured, decoded);
    const bodies = validateSixBodies(captured, decoded, project);

    const bodyBytes = new Map([
      ['expected-parse-outcomes', canonicalBytes(bodies.expected)],
      ['parse-outcomes-receipt', canonicalBytes(bodies.outcomes)],
      ['project', canonicalBytes(bodies.project)],
      ['resolution-inputs', canonicalBytes(bodies.resolution)],
      ['source-manifest', canonicalBytes(bodies.source)],
      ['toolchain-manifest', canonicalBytes(bodies.toolchain)],
    ]);
    const sidecar = buildSidecar(captured, decoded, bodies, bodyBytes);
    validateSidecar(captured, decoded, bodies, sidecar, bodyBytes);
    bodyBytes.set('export-sidecar', serializeCompleteExportSidecarV1(sidecar));
    return artifactArray(bodyBytes);
  } catch (error) {
    throw error;
  }
}
