import { constants as FS_CONSTANTS } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { types as UTIL_TYPES } from 'node:util';

import {
  LOCAL_INVENTORY_POLICY_SCHEMA,
  LOCAL_SOURCE_SNAPSHOT_SCHEMA,
  SOURCE_ORIGIN_LIMITS,
  canonicalJsonText,
  parseCanonicalJsonBytes,
  sha256Canonical,
  sha256Raw,
  validateLocalInventoryPolicy,
  validateLocalSourceSnapshot,
  validateRepositoryIdentity,
} from './contract.mjs';
import { buildLocalSourceOriginSubject } from './local-subject.mjs';

export { LOCAL_INVENTORY_POLICY_SCHEMA, LOCAL_SOURCE_SNAPSHOT_SCHEMA };

const EXECUTION_BOUNDARY = 'COOPERATIVE_LOCAL_SAME_USER';
const POLICY_KEYS = ['schema', 'profile', 'entries', 'exclusions', 'limits', 'authorizing', 'policyDigest'];
const ENTRY_KEYS = ['path', 'role'];
const LIMIT_KEYS = [
  'maxDepth',
  'maxEntries',
  'maxFileBytes',
  'maxMillis',
  'maxResolutionBytes',
  'maxResolutionFiles',
  'maxSourceBytes',
  'maxSourceFiles',
  'maxTotalBytes',
];
const OPTION_KEYS = ['rootPath', 'repositoryIdentityBytes', 'inventoryPolicyBytes'];
const CAPTURE_SUBJECT_OPTION_KEYS = [
  'allowFixtureOnly', 'capability', 'repository', 'policy', 'host', 'myco', 'hypha',
];
const ROLES = new Set(['DEPENDENCY', 'GENERATED_INPUT', 'POLICY_OWNER', 'RESOLUTION', 'SOURCE']);
const SOURCE_ROLES = new Set(['DEPENDENCY', 'GENERATED_INPUT', 'SOURCE']);
const CAPTURE_STATES = new WeakMap();
const PLAIN_OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_PROTOTYPE = Array.prototype;
const UINT8_ARRAY_PROTOTYPE = Uint8Array.prototype;
const BUFFER_PROTOTYPE = Buffer.prototype;
const TYPED_ARRAY_PROTOTYPE = objectGetPrototypeOfSafe(UINT8_ARRAY_PROTOTYPE);
const ARRAY_BUFFER_PROTOTYPE = ArrayBuffer.prototype;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyNames = Object.getOwnPropertyNames;
const objectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectFreeze = Object.freeze;
const arrayIsArray = Array.isArray;
const numberIsSafeInteger = Number.isSafeInteger;
const bufferByteLength = Buffer.byteLength;
const bufferAlloc = Buffer.alloc;
const bufferFrom = Buffer.from;
const bufferEquals = Buffer.prototype.equals;
const typedArraySet = Uint8Array.prototype.set;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'buffer').get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'byteLength').get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'byteOffset').get;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'length').get;
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(ARRAY_BUFFER_PROTOTYPE, 'byteLength').get;
const arrayBufferResizableGetter = Object.getOwnPropertyDescriptor(ARRAY_BUFFER_PROTOTYPE, 'resizable')?.get ?? null;
const regexpTest = RegExp.prototype.test;
const stringNormalize = String.prototype.normalize;
const stringToLowerCase = String.prototype.toLowerCase;
const reflectApply = Reflect.apply;

function objectGetPrototypeOfSafe(value) {
  return Object.getPrototypeOf(value);
}

// This fixture-only collector is confined to execution before untrusted module evaluation.
// A later production integration must establish its own reviewed primordial boundary.

class LocalSourceRefusal extends Error {
  constructor(code) {
    super(code);
    this.name = 'LocalSourceRefusal';
    this.code = code;
  }
}

function refuse(code) {
  throw new LocalSourceRefusal(code);
}

function apply(fn, receiver, args) {
  return reflectApply(fn, receiver, args);
}

function exactRecord(value, keys, code) {
  if (value === null || typeof value !== 'object' || UTIL_TYPES.isProxy(value) || arrayIsArray(value)) refuse(code);
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== PLAIN_OBJECT_PROTOTYPE && prototype !== null) refuse(code);
  if (objectGetOwnPropertySymbols(value).length !== 0) refuse(code);
  const names = objectGetOwnPropertyNames(value);
  if (names.length !== keys.length) refuse(code);
  for (const key of keys) {
    if (!names.includes(key)) refuse(code);
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !objectHasOwn(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  }
}

function recordValue(value, key) {
  return objectGetOwnPropertyDescriptor(value, key).value;
}

function exactArray(value, code) {
  if (!arrayIsArray(value) || UTIL_TYPES.isProxy(value) || objectGetPrototypeOf(value) !== ARRAY_PROTOTYPE) refuse(code);
  if (objectGetOwnPropertySymbols(value).length !== 0) refuse(code);
  const names = objectGetOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes('length')) refuse(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, `${index}`);
    if (!descriptor || !objectHasOwn(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  }
  return value;
}

function copyExactBytes(value) {
  if (value === null || typeof value !== 'object' || UTIL_TYPES.isProxy(value) || !UTIL_TYPES.isUint8Array(value)) refuse('LOCAL_SOURCE_SCHEMA');
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== UINT8_ARRAY_PROTOTYPE && prototype !== BUFFER_PROTOTYPE) refuse('LOCAL_SOURCE_SCHEMA');
  let backing;
  let backingByteLength;
  let byteLength;
  let byteOffset;
  let length;
  try {
    backing = apply(typedArrayBufferGetter, value, []);
    byteLength = apply(typedArrayByteLengthGetter, value, []);
    byteOffset = apply(typedArrayByteOffsetGetter, value, []);
    length = apply(typedArrayLengthGetter, value, []);
    backingByteLength = apply(arrayBufferByteLengthGetter, backing, []);
  } catch {
    refuse('LOCAL_SOURCE_SCHEMA');
  }
  if (UTIL_TYPES.isSharedArrayBuffer(backing)
    || arrayBufferResizableGetter && apply(arrayBufferResizableGetter, backing, []) === true
    || !numberIsSafeInteger(byteLength)
    || !numberIsSafeInteger(byteOffset)
    || !numberIsSafeInteger(backingByteLength)
    || length !== byteLength
    || byteLength > SOURCE_ORIGIN_LIMITS.jsonBytes
    || byteOffset + byteLength > backingByteLength
    || objectGetOwnPropertyNames(value).length !== length
    || objectGetOwnPropertySymbols(value).length !== 0) refuse('LOCAL_SOURCE_SCHEMA');
  const copy = bufferAlloc(byteLength);
  apply(typedArraySet, copy, [value]);
  return copy;
}

function nfcString(value, code) {
  if (typeof value !== 'string' || value !== apply(stringNormalize, value, ['NFC'])) refuse(code);
  return value;
}

function portablePath(value) {
  nfcString(value, 'LOCAL_SOURCE_PATH');
  if (!value || bufferByteLength(value, 'utf8') > 4_096 || value.startsWith('/') || value.endsWith('/') || value.includes('\\') || value.includes('//')) refuse('LOCAL_SOURCE_PATH');
  const components = value.split('/');
  for (const component of components) {
    if (!component || component === '.' || component === '..' || bufferByteLength(component, 'utf8') > 255) refuse('LOCAL_SOURCE_PATH');
    if (apply(regexpTest, /[<>:"|?*\u0000-\u001f]/u, [component]) || component.endsWith('.') || component.endsWith(' ')) refuse('LOCAL_SOURCE_PATH');
    if (apply(regexpTest, /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\.|$)/iu, [component])) refuse('LOCAL_SOURCE_PATH');
  }
  return value;
}

function caseKey(value) {
  return apply(stringNormalize, apply(stringToLowerCase, value, []), ['NFC']);
}

function digest(value) {
  if (typeof value !== 'string' || !apply(regexpTest, /^[0-9a-f]{64}$/u, [value])) refuse('LOCAL_SOURCE_POLICY');
  return value;
}

function boundedInteger(value, minimum, maximum) {
  if (!numberIsSafeInteger(value) || value < minimum || value > maximum) refuse('LOCAL_SOURCE_LIMIT');
  return value;
}

function withoutKey(value, omitted) {
  const output = Object.create(null);
  for (const key of objectGetOwnPropertyNames(value)) {
    if (key !== omitted) output[key] = recordValue(value, key);
  }
  return output;
}

function isExcluded(path, exclusions) {
  for (const exclusion of exclusions) {
    if (path === exclusion || path.startsWith(`${exclusion}/`)) return true;
  }
  return false;
}

function isStructuralDirectory(path, policy) {
  const prefix = `${path}/`;
  for (const entry of policy.entries) if (entry.path.startsWith(prefix)) return true;
  for (const exclusion of policy.exclusions) if (exclusion.startsWith(prefix)) return true;
  return false;
}

function validatePolicy(value) {
  exactRecord(value, POLICY_KEYS, 'LOCAL_SOURCE_POLICY');
  const profile = recordValue(value, 'profile');
  if (recordValue(value, 'schema') !== LOCAL_INVENTORY_POLICY_SCHEMA
    || (profile !== 'FIXTURE_ONLY' && profile !== 'LOCAL_PRODUCTION_V1')
    || recordValue(value, 'authorizing') !== false) refuse('LOCAL_SOURCE_POLICY');

  const entriesValue = exactArray(recordValue(value, 'entries'), 'LOCAL_SOURCE_POLICY');
  const exclusionsValue = exactArray(recordValue(value, 'exclusions'), 'LOCAL_SOURCE_POLICY');
  const limitsValue = recordValue(value, 'limits');
  exactRecord(limitsValue, LIMIT_KEYS, 'LOCAL_SOURCE_POLICY');

  const limits = Object.create(null);
  limits.maxDepth = boundedInteger(recordValue(limitsValue, 'maxDepth'), 1, 64);
  limits.maxEntries = boundedInteger(recordValue(limitsValue, 'maxEntries'), 1, SOURCE_ORIGIN_LIMITS.nodes);
  limits.maxFileBytes = boundedInteger(recordValue(limitsValue, 'maxFileBytes'), 1, SOURCE_ORIGIN_LIMITS.capturedFileBytes);
  limits.maxMillis = boundedInteger(recordValue(limitsValue, 'maxMillis'), 1, SOURCE_ORIGIN_LIMITS.processMillis);
  limits.maxResolutionBytes = boundedInteger(recordValue(limitsValue, 'maxResolutionBytes'), 0, SOURCE_ORIGIN_LIMITS.resolutionBytes);
  limits.maxResolutionFiles = boundedInteger(recordValue(limitsValue, 'maxResolutionFiles'), 0, SOURCE_ORIGIN_LIMITS.resolutionFiles);
  limits.maxSourceBytes = boundedInteger(recordValue(limitsValue, 'maxSourceBytes'), 0, SOURCE_ORIGIN_LIMITS.sourceBytes);
  limits.maxSourceFiles = boundedInteger(recordValue(limitsValue, 'maxSourceFiles'), 0, SOURCE_ORIGIN_LIMITS.sourceFiles);
  limits.maxTotalBytes = boundedInteger(recordValue(limitsValue, 'maxTotalBytes'), 0, SOURCE_ORIGIN_LIMITS.sourceBytes + SOURCE_ORIGIN_LIMITS.resolutionBytes);

  if (limits.maxFileBytes > limits.maxTotalBytes || entriesValue.length > limits.maxEntries) refuse('LOCAL_SOURCE_LIMIT');

  const entries = [];
  const entryKeys = new Set();
  let previousPath = null;
  for (const valueEntry of entriesValue) {
    exactRecord(valueEntry, ENTRY_KEYS, 'LOCAL_SOURCE_POLICY');
    const path = portablePath(recordValue(valueEntry, 'path'));
    const role = recordValue(valueEntry, 'role');
    if (!ROLES.has(role)) refuse('LOCAL_SOURCE_POLICY');
    if (path.split('/').length > limits.maxDepth) refuse('LOCAL_SOURCE_LIMIT');
    if (previousPath !== null && previousPath >= path) refuse('LOCAL_SOURCE_POLICY');
    const key = caseKey(path);
    if (entryKeys.has(key)) refuse('LOCAL_SOURCE_ALIAS');
    entryKeys.add(key);
    entries.push(objectFreeze({ path, role }));
    previousPath = path;
  }

  const exclusions = [];
  const exclusionKeys = new Set();
  previousPath = null;
  for (const valueExclusion of exclusionsValue) {
    const path = portablePath(valueExclusion);
    if (path.split('/').length > limits.maxDepth) refuse('LOCAL_SOURCE_LIMIT');
    if (previousPath !== null && previousPath >= path) refuse('LOCAL_SOURCE_POLICY');
    const key = caseKey(path);
    if (exclusionKeys.has(key) || entryKeys.has(key)) refuse('LOCAL_SOURCE_ALIAS');
    exclusionKeys.add(key);
    exclusions.push(path);
    previousPath = path;
  }
  for (const entry of entries) if (isExcluded(entry.path, exclusions)) refuse('LOCAL_SOURCE_POLICY');

  const policyDigest = digest(recordValue(value, 'policyDigest'));
  if (policyDigest !== sha256Canonical(LOCAL_INVENTORY_POLICY_SCHEMA, withoutKey(value, 'policyDigest'))) refuse('LOCAL_SOURCE_POLICY');

  const normalized = objectFreeze({
    schema: LOCAL_INVENTORY_POLICY_SCHEMA,
    profile,
    entries: objectFreeze(entries),
    exclusions: objectFreeze(exclusions),
    limits: objectFreeze(limits),
    authorizing: false,
    policyDigest,
  });
  try {
    validateLocalInventoryPolicy(
      normalized,
      profile === 'FIXTURE_ONLY' ? { allowFixtureOnly: true } : undefined,
    );
  } catch {
    refuse('LOCAL_SOURCE_POLICY');
  }
  return normalized;
}

function captureInputs(options) {
  exactRecord(options, OPTION_KEYS, 'LOCAL_SOURCE_SCHEMA');
  const rootPath = recordValue(options, 'rootPath');
  if (typeof rootPath !== 'string' || rootPath.includes('\0') || !isAbsolute(rootPath) || resolve(rootPath) !== rootPath) refuse('LOCAL_SOURCE_SCHEMA');
  const repositoryBytes = copyExactBytes(recordValue(options, 'repositoryIdentityBytes'));
  const policyBytes = copyExactBytes(recordValue(options, 'inventoryPolicyBytes'));
  const repositoryIdentity = validateRepositoryIdentity(parseCanonicalJsonBytes(repositoryBytes, { label: 'LOCAL_REPOSITORY_IDENTITY' }));
  const policy = validatePolicy(parseCanonicalJsonBytes(policyBytes, { label: 'LOCAL_INVENTORY_POLICY' }));
  return objectFreeze({ rootPath, repositoryIdentity, policy });
}

function deadlineFor(policy) {
  return performance.now() + policy.limits.maxMillis;
}

function checkDeadline(deadline) {
  if (performance.now() > deadline) refuse('LOCAL_SOURCE_LIMIT');
}

async function awaited(promise, deadline) {
  // Cooperative elapsed checks only. The production caller must supply the existing
  // external process deadline for hard termination of a stalled filesystem operation.
  checkDeadline(deadline);
  const value = await promise;
  checkDeadline(deadline);
  return value;
}

async function openOwnedDirectory(path, deadline) {
  checkDeadline(deadline);
  let handle;
  try {
    handle = await opendir(path);
  } catch (error) {
    checkDeadline(deadline);
    throw error;
  }
  try {
    checkDeadline(deadline);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function openOwnedFile(path, flags, deadline) {
  checkDeadline(deadline);
  let handle;
  try {
    handle = await open(path, flags);
  } catch (error) {
    checkDeadline(deadline);
    throw error;
  }
  try {
    checkDeadline(deadline);
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

function statKind(stat) {
  if (stat.isSymbolicLink()) return 'LINK';
  if (stat.isDirectory()) return 'DIRECTORY';
  if (stat.isFile()) return 'FILE';
  return 'OTHER';
}

function statIdentity(stat) {
  return objectFreeze({
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    size: stat.size,
    mtimeNs: stat.mtimeNs,
    ctimeNs: stat.ctimeNs,
  });
}

function sameStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function enumerateCompleteTree(rootPath, policy, deadline) {
  const rootStat = await awaited(lstat(rootPath, { bigint: true }), deadline);
  if (statKind(rootStat) !== 'DIRECTORY') refuse('LOCAL_SOURCE_LINK');
  const expectedByPath = new Map(policy.entries.map((entry) => [entry.path, entry]));
  const seenFiles = new Set();
  const seenCase = new Map();
  const records = [];
  const stack = [{ fullPath: rootPath, relativePath: '', depth: 0 }];
  let observedEntries = 0;

  while (stack.length > 0) {
    const directory = stack.pop();
    const handle = await openOwnedDirectory(directory.fullPath, deadline);
    try {
      while (true) {
        const dirent = await awaited(handle.read(), deadline);
        if (dirent === null) break;
        observedEntries += 1;
        if (observedEntries > policy.limits.maxEntries) refuse('LOCAL_SOURCE_LIMIT');
        if (typeof dirent.name !== 'string') refuse('LOCAL_SOURCE_PATH');
        const relativePath = portablePath(directory.relativePath ? `${directory.relativePath}/${dirent.name}` : dirent.name);
        const depth = directory.depth + 1;
        if (isExcluded(relativePath, policy.exclusions)) continue;
        if (depth > policy.limits.maxDepth) refuse('LOCAL_SOURCE_LIMIT');
        const folded = caseKey(relativePath);
        if (seenCase.has(folded) && seenCase.get(folded) !== relativePath) refuse('LOCAL_SOURCE_ALIAS');
        seenCase.set(folded, relativePath);
        const fullPath = join(rootPath, ...relativePath.split('/'));
        const stat = await awaited(lstat(fullPath, { bigint: true }), deadline);
        const kind = statKind(stat);
        if (kind === 'LINK' || kind === 'OTHER') refuse('LOCAL_SOURCE_LINK');
        if (kind === 'DIRECTORY') {
          if (!isStructuralDirectory(relativePath, policy)) refuse('LOCAL_SOURCE_EXTRA_PATH');
          records.push(objectFreeze({ path: relativePath, kind, stat: statIdentity(stat) }));
          stack.push({ fullPath, relativePath, depth });
          continue;
        }
        const expected = expectedByPath.get(relativePath);
        if (!expected) refuse('LOCAL_SOURCE_EXTRA_PATH');
        if (stat.nlink !== 1n) refuse('LOCAL_SOURCE_LINK');
        records.push(objectFreeze({ path: relativePath, kind, role: expected.role, stat: statIdentity(stat) }));
        seenFiles.add(relativePath);
      }
    } finally {
      await handle.close();
    }
    checkDeadline(deadline);
  }

  for (const entry of policy.entries) if (!seenFiles.has(entry.path)) refuse('LOCAL_SOURCE_MISSING_PATH');
  records.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return objectFreeze(records);
}

function compareInventories(expected, actual) {
  if (expected.length !== actual.length) refuse('LOCAL_SOURCE_CHANGED');
  for (let index = 0; index < expected.length; index += 1) {
    const left = expected[index];
    const right = actual[index];
    if (left.path !== right.path || left.kind !== right.kind || left.role !== right.role || !sameStat(left.stat, right.stat)) refuse('LOCAL_SOURCE_CHANGED');
  }
}

async function readOneFile(rootPath, record, policy, deadline) {
  const length = record.stat.size;
  if (length < 0n || length > BigInt(policy.limits.maxFileBytes) || length > BigInt(Number.MAX_SAFE_INTEGER)) refuse('LOCAL_SOURCE_LIMIT');
  const flags = process.platform === 'win32' || typeof FS_CONSTANTS.O_NOFOLLOW !== 'number'
    ? FS_CONSTANTS.O_RDONLY
    : FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_NOFOLLOW;
  let handle;
  let captured;
  try {
    handle = await openOwnedFile(join(rootPath, ...record.path.split('/')), flags, deadline);
    const before = await awaited(handle.stat({ bigint: true }), deadline);
    if (statKind(before) !== 'FILE' || before.nlink !== 1n) refuse('LOCAL_SOURCE_LINK');
    if (!sameStat(record.stat, statIdentity(before))) refuse('LOCAL_SOURCE_CHANGED');
    const size = Number(length);
    const bytes = bufferAlloc(size);
    let offset = 0;
    while (offset < size) {
      const result = await awaited(handle.read(bytes, offset, size - offset, offset), deadline);
      if (!numberIsSafeInteger(result.bytesRead) || result.bytesRead <= 0 || result.bytesRead > size - offset) refuse('LOCAL_SOURCE_CHANGED');
      offset += result.bytesRead;
    }
    const after = await awaited(handle.stat({ bigint: true }), deadline);
    if (!sameStat(before, statIdentity(after))) refuse('LOCAL_SOURCE_CHANGED');
    captured = bytes;
  } finally {
    if (handle) await handle.close();
  }
  checkDeadline(deadline);
  return captured;
}

function fileRecords(inventory) {
  return inventory.filter((record) => record.kind === 'FILE');
}

async function readInventoryBytes(rootPath, inventory, policy, deadline) {
  const held = new Map();
  let sourceFiles = 0;
  let sourceBytes = 0;
  let resolutionFiles = 0;
  let resolutionBytes = 0;

  for (const record of fileRecords(inventory)) {
    const bytes = await readOneFile(rootPath, record, policy, deadline);
    const byteLength = bytes.byteLength;
    if (SOURCE_ROLES.has(record.role)) {
      sourceFiles += 1;
      sourceBytes += byteLength;
      if (sourceFiles > policy.limits.maxSourceFiles || sourceBytes > policy.limits.maxSourceBytes) refuse('LOCAL_SOURCE_LIMIT');
    } else {
      resolutionFiles += 1;
      resolutionBytes += byteLength;
      if (resolutionFiles > policy.limits.maxResolutionFiles || resolutionBytes > policy.limits.maxResolutionBytes) refuse('LOCAL_SOURCE_LIMIT');
    }
    if (sourceBytes + resolutionBytes > policy.limits.maxTotalBytes) refuse('LOCAL_SOURCE_LIMIT');
    held.set(record.path, objectFreeze({ bytes, rawSha256: sha256Raw(bytes) }));
  }

  return objectFreeze({
    held,
    counts: objectFreeze({
      entries: held.size,
      sourceFiles,
      sourceBytes,
      resolutionFiles,
      resolutionBytes,
      totalBytes: sourceBytes + resolutionBytes,
    }),
  });
}

function compareHeld(expected, actual) {
  if (expected.size !== actual.size) refuse('LOCAL_SOURCE_CHANGED');
  for (const [path, left] of expected) {
    const right = actual.get(path);
    if (!right || left.rawSha256 !== right.rawSha256 || left.bytes.byteLength !== right.bytes.byteLength
      || !apply(bufferEquals, left.bytes, [right.bytes])) refuse('LOCAL_SOURCE_CHANGED');
  }
}

function buildSnapshot(repositoryIdentity, policy, capture) {
  const entries = policy.entries.map((entry) => {
    const held = capture.held.get(entry.path);
    if (!held) refuse('LOCAL_SOURCE_CHANGED');
    return objectFreeze({
      path: entry.path,
      role: entry.role,
      byteLength: held.bytes.byteLength,
      rawSha256: held.rawSha256,
    });
  });
  const body = objectFreeze({
    schema: LOCAL_SOURCE_SNAPSHOT_SCHEMA,
    repositoryIdentityDigest: repositoryIdentity.identityDigest,
    inventoryPolicyDigest: policy.policyDigest,
    entries: objectFreeze(entries),
    counts: capture.counts,
    authorizing: false,
    authentication: 'NONE',
    executionBoundary: EXECUTION_BOUNDARY,
    atomicSnapshot: false,
    hostileWriterResistance: false,
    fixtureOnly: policy.profile === 'FIXTURE_ONLY',
  });
  const snapshot = objectFreeze({ ...body, snapshotDigest: sha256Canonical(LOCAL_SOURCE_SNAPSHOT_SCHEMA, body) });
  try {
    validateLocalSourceSnapshot(snapshot, {
      allowFixtureOnly: snapshot.fixtureOnly,
      repositoryIdentity,
      inventoryPolicy: policy,
    });
  } catch {
    refuse('LOCAL_SOURCE_SCHEMA');
  }
  return snapshot;
}

function stateFor(capability) {
  if (capability === null || typeof capability !== 'object' || UTIL_TYPES.isProxy(capability) || !CAPTURE_STATES.has(capability)) refuse('LOCAL_SOURCE_CAPABILITY');
  return CAPTURE_STATES.get(capability);
}

export async function captureLocalSourceSnapshot(options) {
  const input = captureInputs(options);
  const deadline = deadlineFor(input.policy);
  const openingInventory = await enumerateCompleteTree(input.rootPath, input.policy, deadline);
  const openingCapture = await readInventoryBytes(input.rootPath, openingInventory, input.policy, deadline);
  const closingInventory = await enumerateCompleteTree(input.rootPath, input.policy, deadline);
  compareInventories(openingInventory, closingInventory);
  const closingCapture = await readInventoryBytes(input.rootPath, closingInventory, input.policy, deadline);
  compareHeld(openingCapture.held, closingCapture.held);
  const snapshot = buildSnapshot(input.repositoryIdentity, input.policy, openingCapture);
  const capability = objectFreeze(Object.create(null));
  CAPTURE_STATES.set(capability, objectFreeze({
    rootPath: input.rootPath,
    policy: input.policy,
    inventory: openingInventory,
    held: openingCapture.held,
    snapshot,
  }));
  return capability;
}

export function getLocalSourceSnapshot(capability) {
  return stateFor(capability).snapshot;
}

export function getCapturedLocalSourceBytes(capability, path) {
  const state = stateFor(capability);
  portablePath(path);
  const retained = state.held.get(path);
  if (!retained) refuse('LOCAL_SOURCE_MISSING_PATH');
  return bufferFrom(retained.bytes);
}

export function verifyRetainedLocalSourceBytes(capability) {
  const state = stateFor(capability);
  for (const entry of state.snapshot.entries) {
    const retained = state.held.get(entry.path);
    if (!retained || retained.bytes.byteLength !== entry.byteLength || sha256Raw(retained.bytes) !== entry.rawSha256) refuse('LOCAL_SOURCE_CHANGED');
  }
  return true;
}

export async function revalidateLocalSourceSnapshot(capability) {
  const state = stateFor(capability);
  verifyRetainedLocalSourceBytes(capability);
  const deadline = deadlineFor(state.policy);
  const currentInventory = await enumerateCompleteTree(state.rootPath, state.policy, deadline);
  compareInventories(state.inventory, currentInventory);
  const currentCapture = await readInventoryBytes(state.rootPath, currentInventory, state.policy, deadline);
  compareHeld(state.held, currentCapture.held);
  return true;
}

export function buildLocalSourceOriginSubjectFromCapture(options) {
  exactRecord(options, CAPTURE_SUBJECT_OPTION_KEYS, 'LOCAL_SOURCE_SCHEMA');
  const capability = recordValue(options, 'capability');
  const snapshot = stateFor(capability).snapshot;
  return buildLocalSourceOriginSubject({
    allowFixtureOnly: recordValue(options, 'allowFixtureOnly'),
    repository: recordValue(options, 'repository'),
    policy: recordValue(options, 'policy'),
    snapshot,
    host: recordValue(options, 'host'),
    myco: recordValue(options, 'myco'),
    hypha: recordValue(options, 'hypha'),
  });
}
