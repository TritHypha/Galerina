import { Buffer as NodeBuffer } from 'node:buffer';
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

// Untrusted repository source is evaluated only after this module loads. Keep
// exporter decisions on retained intrinsics throughout that boundary.
const safeReflectApply = Reflect.apply;
const safeCreateHash = createHash;
const safeReadFileSync = readFileSync;
const safeJoin = join;
const safeFileURLToPath = fileURLToPath;
const safeObjectCreate = Object.create;
const safeObjectDefineProperty = Object.defineProperty;
const safeObjectFreeze = Object.freeze;
const safeObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const safeObjectGetOwnPropertyNames = Object.getOwnPropertyNames;
const safeObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
const safeObjectGetPrototypeOf = Object.getPrototypeOf;
const safeObjectHasOwn = Object.hasOwn;
const safeObjectPrototype = Object.prototype;
const safeObjectValues = Object.values;
const safeArrayIsArray = Array.isArray;
const safeArraySort = Array.prototype.sort;
const safeRegExpExec = RegExp.prototype.exec;
const SafeSet = Set;
const safeSetAdd = Set.prototype.add;
const safeSetHas = Set.prototype.has;
const safeSetSize = safeObjectGetOwnPropertyDescriptor(Set.prototype, 'size').get;
const SafeMap = Map;
const safeMapGet = Map.prototype.get;
const safeMapSet = Map.prototype.set;
const safeBufferFrom = NodeBuffer.from;
const safeBufferIsBuffer = NodeBuffer.isBuffer;
const safeTypedArrayPrototype = safeObjectGetPrototypeOf(Uint8Array.prototype);
const safeTypedArrayByteLength = safeObjectGetOwnPropertyDescriptor(
  safeTypedArrayPrototype,
  'byteLength',
).get;
const hashProbe = safeCreateHash('sha256');
let safeHashPrototype = safeObjectGetPrototypeOf(hashProbe);
while (safeHashPrototype !== null && !safeObjectHasOwn(safeHashPrototype, 'update')) {
  safeHashPrototype = safeObjectGetPrototypeOf(safeHashPrototype);
}
const safeHashUpdate = safeObjectGetOwnPropertyDescriptor(safeHashPrototype, 'update').value;
const safeHashDigest = safeObjectGetOwnPropertyDescriptor(safeHashPrototype, 'digest').value;
const hostPlatform = process.platform;
const hostArch = process.arch;
const hostExecPath = process.execPath;
const hostNodeVersion = process.version;

function callIntrinsic(operation, receiver, args) {
  return safeReflectApply(operation, receiver, args);
}

function plainRecord() {
  return safeObjectCreate(safeObjectPrototype);
}

function defineData(target, key, value) {
  const descriptor = safeObjectCreate(null);
  descriptor.configurable = true;
  descriptor.enumerable = true;
  descriptor.value = value;
  descriptor.writable = true;
  safeObjectDefineProperty(target, key, descriptor);
}

function append(values, value) {
  defineData(values, `${values.length}`, value);
}

function copyArray(values) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) append(output, values[index]);
  return output;
}

function sortArray(values) {
  return callIntrinsic(safeArraySort, values, [codeUnitCompare]);
}

function findArray(values, predicate) {
  for (let index = 0; index < values.length; index += 1) {
    if (predicate(values[index], index)) return values[index];
  }
  return undefined;
}

function someArray(values, predicate) {
  for (let index = 0; index < values.length; index += 1) {
    if (predicate(values[index], index)) return true;
  }
  return false;
}

function includesArray(values, sought) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === sought) return true;
  }
  return false;
}

function appendUnique(values, sought) {
  if (!includesArray(values, sought)) append(values, sought);
}

function setAdd(values, value) {
  callIntrinsic(safeSetAdd, values, [value]);
}

function setHas(values, value) {
  return callIntrinsic(safeSetHas, values, [value]);
}

function setSize(values) {
  return callIntrinsic(safeSetSize, values, []);
}

function mapGet(values, key) {
  return callIntrinsic(safeMapGet, values, [key]);
}

function mapSet(values, key, value) {
  callIntrinsic(safeMapSet, values, [key, value]);
}

function regexTest(pattern, value) {
  const firstDescriptor = safeObjectCreate(null);
  firstDescriptor.value = 0;
  safeObjectDefineProperty(pattern, 'lastIndex', firstDescriptor);
  try {
    return callIntrinsic(safeRegExpExec, pattern, [value]) !== null;
  } finally {
    const finalDescriptor = safeObjectCreate(null);
    finalDescriptor.value = 0;
    safeObjectDefineProperty(pattern, 'lastIndex', finalDescriptor);
  }
}

function bufferByteLength(value) {
  return callIntrinsic(safeTypedArrayByteLength, value, []);
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const REPOSITORY_ROOT = safeFileURLToPath(new URL('../../../', import.meta.url));
const PINNED_GIT = hostPlatform === 'win32'
  ? safeFileURLToPath(new URL(
    '../../../.superpowers/sdd/2026-08-31-rd0873-portable-artifact-admission/toolchains/mingit-2.55.0.5/expanded/cmd/git.exe',
    import.meta.url,
  ))
  : '/usr/bin/git';
const HEX_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const NODE_KINDS = safeObjectFreeze([
  'CLASS', 'FILE', 'FLOW', 'FUNCTION', 'GATE', 'INTERFACE', 'METHOD', 'MODULE',
  'ROUTE', 'SYMBOL', 'TYPE',
]);
const RELATIONSHIP_KINDS = safeObjectFreeze([
  'CALLER', 'CONTRACT', 'GENERATED_CONSUMER', 'IMPORT', 'TEST',
]);
const ARTIFACT_IDS = safeObjectFreeze([
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
    defineData(this, 'name', 'SourceOriginExportRefusal');
    defineData(this, 'code', code);
    safeObjectFreeze(this);
  }
}
safeObjectFreeze(SourceOriginExportRefusal.prototype);
safeObjectFreeze(SourceOriginExportRefusal);

function refuse(code) {
  throw new SourceOriginExportRefusal(code);
}

function rawSha256(value) {
  const hash = safeCreateHash('sha256');
  callIntrinsic(safeHashUpdate, hash, [value]);
  return callIntrinsic(safeHashDigest, hash, ['hex']);
}

function canonicalBytes(value) {
  const bytes = callIntrinsic(safeBufferFrom, NodeBuffer, [canonicalJsonText(value), 'utf8']);
  if (bufferByteLength(bytes) > SOURCE_ORIGIN_LIMITS.jsonBytes) refuse('SOURCE_ORIGIN_EXPORT_LIMIT');
  return bytes;
}

function sameData(left, right) {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function exactKeys(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || safeArrayIsArray(value)
    || safeObjectGetOwnPropertySymbols(value).length !== 0
  ) return false;
  const names = sortArray(safeObjectGetOwnPropertyNames(value));
  const expected = sortArray(copyArray(keys));
  return names.length === expected.length
    && !someArray(names, (name, index) => name !== expected[index]);
}

function selectedPin(captured) {
  const records = captured.owners.values.pins.records;
  let match;
  let matchCount = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.platform === hostPlatform && record.arch === hostArch) {
      match = record;
      matchCount += 1;
    }
  }
  if (matchCount !== 1) refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
  return match;
}

function currentNodeIdentity() {
  let bytes;
  try {
    bytes = safeReadFileSync(hostExecPath);
  } catch {
    refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
  }
  return {
    version: hostNodeVersion,
    executableRawSha256: rawSha256(bytes),
    executableByteLength: bufferByteLength(bytes),
  };
}

function joinedPath(locator) {
  return safeJoin(REPOSITORY_ROOT, locator);
}

function toolchainBlobs(captured, pin) {
  const host = findArray(pin.runtimeLoadSets, (row) => row.id === 'HOST');
  if (!host) refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
  const hostLocator = `${host.entry.rootLocator}/${host.entry.locator}`;
  const blobs = new SafeMap();
  let hostBytes;
  try {
    hostBytes = safeReadFileSync(joinedPath(hostLocator));
  } catch {
    refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
  }
  mapSet(blobs, hostLocator, hostBytes);

  const localLocators = [pin.sourceOriginParser.sourceEntry.locator];
  const sourceEdgeRows = pin.sourceOriginParser.sourceEdgeRows;
  for (let index = 0; index < sourceEdgeRows.length; index += 1) {
    const edge = sourceEdgeRows[index];
    appendUnique(localLocators, edge.fromLocator);
    appendUnique(localLocators, edge.toLocator);
  }
  const root = pin.sourceOriginParser.sourceEntry.rootLocator;
  sortArray(localLocators);
  for (let index = 0; index < localLocators.length; index += 1) {
    const local = localLocators[index];
    const locator = `${root}/${local}`;
    const bytes = captured.sourceBlobs.get(locator);
    if (!bytes) refuse('SOURCE_ORIGIN_EXPORT_TOOLCHAIN');
    mapSet(blobs, locator, bytes);
  }
  return blobs;
}

function increment(counts, key) {
  if (!safeObjectHasOwn(counts, key)) refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
  counts[key] += 1;
}

function zeroCounts(keys) {
  const counts = plainRecord();
  for (let index = 0; index < keys.length; index += 1) defineData(counts, keys[index], 0);
  return counts;
}

function assertSortedUnique(rows, field) {
  let previous;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const value = row[field];
    if (typeof value !== 'string' || (previous !== undefined && previous >= value)) {
      refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
    }
    previous = value;
  }
}

function projectBody(captured, decoded) {
  assertSortedUnique(decoded.nodes, 'id');
  assertSortedUnique(decoded.edges, 'id');
  const nodeIds = new SafeSet();
  for (let index = 0; index < decoded.nodes.length; index += 1) {
    const node = decoded.nodes[index];
    setAdd(nodeIds, node.id);
    if (!includesArray(NODE_KINDS, node.kind)) refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
  }
  for (let index = 0; index < decoded.edges.length; index += 1) {
    const edge = decoded.edges[index];
    if (
      !includesArray(RELATIONSHIP_KINDS, edge.kind)
      || !setHas(nodeIds, edge.from)
      || !setHas(nodeIds, edge.to)
    ) {
      refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
    }
  }
  const idMapNodeIds = new SafeSet();
  for (let index = 0; index < decoded.idMapRows.length; index += 1) {
    const nodeId = decoded.idMapRows[index].nodeId;
    if (setHas(idMapNodeIds, nodeId) || !setHas(nodeIds, nodeId)) {
      refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');
    }
    setAdd(idMapNodeIds, nodeId);
  }
  if (decoded.nodes.length !== decoded.idMapRows.length) refuse('SOURCE_ORIGIN_EXPORT_CONSERVATION');

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
    someArray(repeated, (body) => body.repositoryId !== source.repositoryId)
    || someArray(repeated, (body) => body.expectedHead !== source.expectedHead)
    || someArray(repeated, (body) => body.expectedTree !== source.expectedTree)
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
  for (let index = 0; index < decoded.nodes.length; index += 1) {
    increment(nodesByKind, decoded.nodes[index].kind);
  }
  const edgesByKind = zeroCounts(RELATIONSHIP_KINDS);
  for (let index = 0; index < decoded.edges.length; index += 1) {
    increment(edgesByKind, decoded.edges[index].kind);
  }
  const unresolvedByClass = zeroCounts(RELATIONSHIP_KINDS);
  const reasonCodes = [];
  const unresolvedReasonRows = captured.owners.values.parser.unresolvedReasonRows;
  for (let index = 0; index < unresolvedReasonRows.length; index += 1) {
    appendUnique(reasonCodes, unresolvedReasonRows[index].reasonCode);
  }
  sortArray(reasonCodes);
  const unresolvedByReason = zeroCounts(reasonCodes);
  for (let index = 0; index < decoded.unresolved.length; index += 1) {
    const row = decoded.unresolved[index];
    increment(unresolvedByClass, row.relationshipClass);
    increment(unresolvedByReason, row.reasonCode);
  }
  let ownerBindings = 0;
  for (let index = 0; index < bodies.outcomes.rows.length; index += 1) {
    ownerBindings += bodies.outcomes.rows[index].ownerBindings.length;
  }
  let resolutionBytes = 0;
  for (let index = 0; index < bodies.resolution.rows.length; index += 1) {
    resolutionBytes += bodies.resolution.rows[index].byteLength;
  }
  const representedFileNodeIds = new SafeSet();
  for (let index = 0; index < bodies.outcomes.rows.length; index += 1) {
    setAdd(representedFileNodeIds, bodies.outcomes.rows[index].representedFileNodeId);
  }
  return {
    sourcePaths: bodies.source.counts.paths,
    sourceBlobs: bodies.source.counts.blobs,
    sourceBytes: bodies.source.counts.bytes,
    resolutionRows: bodies.resolution.rows.length,
    resolutionBytes,
    parseOutcomeRows: bodies.outcomes.rows.length,
    ownerBindings,
    representedFileNodes: setSize(representedFileNodeIds),
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
  const graphBytes = mapGet(bodyBytes, 'project');
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
    graphByteLength: bufferByteLength(graphBytes),
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
  const projectBytes = mapGet(bodyBytes, 'project');
  if (
    !exactKeys(sidecar, topKeys)
    || sidecar.status !== 'COMPLETE'
    || sidecar.authorizing !== false
    || sidecar.graphRawSha256 !== rawSha256(projectBytes)
    || sidecar.graphByteLength !== bufferByteLength(projectBytes)
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
  const sumValues = (record) => {
    const valuesToSum = safeObjectValues(record);
    let sum = 0;
    for (let index = 0; index < valuesToSum.length; index += 1) sum += valuesToSum[index];
    return sum;
  };
  const nodeTotal = sumValues(sidecar.counts.nodesByKind);
  const edgeTotal = sumValues(sidecar.counts.edgesByKind);
  const unresolvedClassTotal = sumValues(sidecar.counts.unresolvedByClass);
  const unresolvedReasonTotal = sumValues(sidecar.counts.unresolvedByReason);
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
  for (let index = 0; index < ARTIFACT_IDS.length; index += 1) {
    const id = ARTIFACT_IDS[index];
    const bytes = mapGet(bodyBytes, id);
    if (!callIntrinsic(safeBufferIsBuffer, NodeBuffer, [bytes])) {
      refuse('SOURCE_ORIGIN_EXPORT_SERIALIZATION');
    }
    append(records, safeObjectFreeze({ id, bytes }));
  }
  const thenDescriptor = safeObjectCreate(null);
  thenDescriptor.configurable = false;
  thenDescriptor.enumerable = false;
  thenDescriptor.value = undefined;
  thenDescriptor.writable = false;
  safeObjectDefineProperty(records, 'then', thenDescriptor);
  return safeObjectFreeze(records);
}

export async function exportSourceOriginProject(commitOid) {
  if (arguments.length !== 1 || typeof commitOid !== 'string' || !regexTest(HEX_COMMIT, commitOid)) {
    refuse('SOURCE_ORIGIN_EXPORT_SCHEMA');
  }
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
    platform: hostPlatform,
    arch: hostArch,
    nodeIdentity,
    gitIdentity: pin.gitIdentity,
  });
  const project = projectBody(captured, decoded);
  const bodies = validateSixBodies(captured, decoded, project);

  const bodyBytes = new SafeMap();
  mapSet(bodyBytes, 'expected-parse-outcomes', canonicalBytes(bodies.expected));
  mapSet(bodyBytes, 'parse-outcomes-receipt', canonicalBytes(bodies.outcomes));
  mapSet(bodyBytes, 'project', canonicalBytes(bodies.project));
  mapSet(bodyBytes, 'resolution-inputs', canonicalBytes(bodies.resolution));
  mapSet(bodyBytes, 'source-manifest', canonicalBytes(bodies.source));
  mapSet(bodyBytes, 'toolchain-manifest', canonicalBytes(bodies.toolchain));
  const sidecar = buildSidecar(captured, decoded, bodies, bodyBytes);
  validateSidecar(captured, decoded, bodies, sidecar, bodyBytes);
  mapSet(bodyBytes, 'export-sidecar', serializeCompleteExportSidecarV1(sidecar));
  return artifactArray(bodyBytes);
}
