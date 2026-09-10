import { Buffer as NodeBuffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';
import { isProxy } from 'node:util/types';

// Task 6A evaluates untrusted source only after this module has loaded.  Every
// mutable global/prototype operation reachable below is captured here, before
// that evaluation boundary, and invoked without caller-provided iteration.
const safeReflectApply = Reflect.apply;
const safeCreateHash = createHash;
const safeIsProxy = isProxy;
const safeObjectCreate = Object.create;
const safeObjectDefineProperty = Object.defineProperty;
const safeObjectFreeze = Object.freeze;
const safeObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const safeObjectGetOwnPropertyNames = Object.getOwnPropertyNames;
const safeObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols;
const safeObjectGetPrototypeOf = Object.getPrototypeOf;
const safeObjectHasOwn = Object.hasOwn;
const safeObjectKeys = Object.keys;
const safeObjectValues = Object.values;
const safeObjectEntries = Object.entries;
const safeObjectPrototype = Object.prototype;
const safeArrayIsArray = Array.isArray;
const safeArrayPrototype = Array.prototype;
const safeArraySort = Array.prototype.sort;
const safeNumberIsSafeInteger = Number.isSafeInteger;
const safeStringCharCodeAt = String.prototype.charCodeAt;
const safeStringNormalize = String.prototype.normalize;
const safeStringIncludes = String.prototype.includes;
const safeStringStartsWith = String.prototype.startsWith;
const safeStringEndsWith = String.prototype.endsWith;
const safeStringSplit = String.prototype.split;
const safeStringSlice = String.prototype.slice;
const safeStringLastIndexOf = String.prototype.lastIndexOf;
const safeStringToLowerCase = String.prototype.toLowerCase;
const safeRegExpExec = RegExp.prototype.exec;
const safeJsonParse = JSON.parse;
const safeJsonStringify = JSON.stringify;
const SafeSet = Set;
const safeSetHas = Set.prototype.has;
const safeSetAdd = Set.prototype.add;
const safeSetDelete = Set.prototype.delete;
const safeSetValues = Set.prototype.values;
const safeSetSize = safeObjectGetOwnPropertyDescriptor(Set.prototype, 'size').get;
const SafeMap = Map;
const safeMapGet = Map.prototype.get;
const safeMapSet = Map.prototype.set;
const safeMapValues = Map.prototype.values;
const safeSymbolIterator = Symbol.iterator;
const safeSetIteratorNext = safeObjectGetPrototypeOf(new SafeSet()[safeSymbolIterator]()).next;
const safeMapIteratorNext = safeObjectGetPrototypeOf(new SafeMap()[safeSymbolIterator]()).next;
const safeBufferFrom = NodeBuffer.from;
const safeBufferPrototype = NodeBuffer.prototype;
const SafeUint8Array = Uint8Array;
const safeUint8ArrayPrototype = SafeUint8Array.prototype;
const safeTypedArrayPrototype = safeObjectGetPrototypeOf(safeUint8ArrayPrototype);
const safeTypedArrayBuffer = safeObjectGetOwnPropertyDescriptor(safeTypedArrayPrototype, 'buffer').get;
const safeTypedArrayByteLength = safeObjectGetOwnPropertyDescriptor(safeTypedArrayPrototype, 'byteLength').get;
const safeTypedArrayByteOffset = safeObjectGetOwnPropertyDescriptor(safeTypedArrayPrototype, 'byteOffset').get;
const safeTypedArrayLength = safeObjectGetOwnPropertyDescriptor(safeTypedArrayPrototype, 'length').get;
const safeArrayBufferByteLength = safeObjectGetOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const safeTextEncode = NodeTextEncoder.prototype.encode;
const safeTextDecode = NodeTextDecoder.prototype.decode;
const safeTextEncoder = new NodeTextEncoder();
const safeTextDecoder = new NodeTextDecoder('utf-8', { fatal: true });
const hashProbe = safeCreateHash('sha256');
let safeHashPrototype = safeObjectGetPrototypeOf(hashProbe);
while (safeHashPrototype !== null && !safeObjectHasOwn(safeHashPrototype, 'update')) {
  safeHashPrototype = safeObjectGetPrototypeOf(safeHashPrototype);
}
const safeHashUpdate = safeObjectGetOwnPropertyDescriptor(safeHashPrototype, 'update').value;
const safeHashDigest = safeObjectGetOwnPropertyDescriptor(safeHashPrototype, 'digest').value;

function callIntrinsic(operation, receiver, args) {
  return safeReflectApply(operation, receiver, args);
}

function nullRecord() {
  return safeObjectCreate(null);
}

function plainRecord() {
  return safeObjectCreate(safeObjectPrototype);
}

function defineData(target, key, value, enumerable = true) {
  const descriptor = nullRecord();
  descriptor.value = value;
  descriptor.writable = true;
  descriptor.enumerable = enumerable;
  descriptor.configurable = true;
  safeObjectDefineProperty(target, key, descriptor);
}

function append(values, value) {
  defineData(values, `${values.length}`, value);
  return values.length;
}

function copyArray(values) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) append(output, values[index]);
  return output;
}

function mapArray(values, operation) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) append(output, operation(values[index], index));
  return output;
}

function forEachArray(values, operation) {
  for (let index = 0; index < values.length; index += 1) operation(values[index], index);
}

function reduceArray(values, operation, initial) {
  let result = initial;
  for (let index = 0; index < values.length; index += 1) result = operation(result, values[index], index);
  return result;
}

function setFromArray(values, project = (value) => value) {
  const output = new SafeSet();
  for (let index = 0; index < values.length; index += 1) setAdd(output, project(values[index], index));
  return output;
}

function mapFromArray(values, key, project = (value) => value) {
  const output = new SafeMap();
  for (let index = 0; index < values.length; index += 1) mapSet(output, key(values[index], index), project(values[index], index));
  return output;
}

function filterArray(values, predicate) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) append(output, values[index]);
  return output;
}

function someArray(values, predicate) {
  for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) return true;
  return false;
}

function everyArray(values, predicate) {
  for (let index = 0; index < values.length; index += 1) if (!predicate(values[index], index)) return false;
  return true;
}

function includesArray(values, sought) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === sought || value !== value && sought !== sought) return true;
  }
  return false;
}

function findArray(values, predicate) {
  for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) return values[index];
  return undefined;
}

function flatMapArray(values, operation) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    const part = operation(values[index], index);
    for (let inner = 0; inner < part.length; inner += 1) append(output, part[inner]);
  }
  return output;
}

function sortArray(values, compare) {
  return callIntrinsic(safeArraySort, values, [compare]);
}

function setHas(values, value) {
  return callIntrinsic(safeSetHas, values, [value]);
}

function setAdd(values, value) {
  callIntrinsic(safeSetAdd, values, [value]);
}

function setDelete(values, value) {
  callIntrinsic(safeSetDelete, values, [value]);
}

function mapGet(values, key) {
  return callIntrinsic(safeMapGet, values, [key]);
}

function mapSet(values, key, value) {
  callIntrinsic(safeMapSet, values, [key, value]);
}

function mapValuesArray(values) {
  const output = [];
  const iterator = callIntrinsic(safeMapValues, values, []);
  while (true) {
    const step = callIntrinsic(safeMapIteratorNext, iterator, []);
    if (step.done) return output;
    append(output, step.value);
  }
}

function setValuesArray(values) {
  const output = [];
  const iterator = callIntrinsic(safeSetValues, values, []);
  while (true) {
    const step = callIntrinsic(safeSetIteratorNext, iterator, []);
    if (step.done) return output;
    append(output, step.value);
  }
}

function setSize(values) { return callIntrinsic(safeSetSize, values, []); }

function stringCharCodeAt(value, index) { return callIntrinsic(safeStringCharCodeAt, value, [index]); }
function stringNormalize(value) { return callIntrinsic(safeStringNormalize, value, ['NFC']); }
function stringIncludes(value, part) { return callIntrinsic(safeStringIncludes, value, [part]); }
function stringStartsWith(value, part) { return callIntrinsic(safeStringStartsWith, value, [part]); }
function stringEndsWith(value, part) { return callIntrinsic(safeStringEndsWith, value, [part]); }
function stringSplit(value, separator) {
  if (typeof separator !== 'string') refuse('SOURCE_ORIGIN_SCHEMA');
  return callIntrinsic(safeStringSplit, value, [separator]);
}
function stringSlice(value, start, end) { return callIntrinsic(safeStringSlice, value, end === undefined ? [start] : [start, end]); }
function stringLastIndexOf(value, part) { return callIntrinsic(safeStringLastIndexOf, value, [part]); }
function stringToLowerCase(value) { return callIntrinsic(safeStringToLowerCase, value, []); }
function regexTest(pattern, value) {
  const firstDescriptor = nullRecord();
  firstDescriptor.value = 0;
  safeObjectDefineProperty(pattern, 'lastIndex', firstDescriptor);
  try {
    return callIntrinsic(safeRegExpExec, pattern, [value]) !== null;
  } finally {
    const finalDescriptor = nullRecord();
    finalDescriptor.value = 0;
    safeObjectDefineProperty(pattern, 'lastIndex', finalDescriptor);
  }
}

function byteView(value, requireBuffer = false) {
  if (value === null || typeof value !== 'object' || safeIsProxy(value)) refuse('SOURCE_ORIGIN_SCHEMA');
  const prototype = safeObjectGetPrototypeOf(value);
  const buffer = prototype === safeBufferPrototype;
  if (requireBuffer ? !buffer : !buffer && prototype !== safeUint8ArrayPrototype) refuse('SOURCE_ORIGIN_SCHEMA');
  let backing;
  let byteLength;
  let byteOffset;
  let length;
  let ownNameCount;
  let ownSymbolCount;
  try {
    backing = callIntrinsic(safeTypedArrayBuffer, value, []);
    byteLength = callIntrinsic(safeTypedArrayByteLength, value, []);
    byteOffset = callIntrinsic(safeTypedArrayByteOffset, value, []);
    length = callIntrinsic(safeTypedArrayLength, value, []);
    callIntrinsic(safeArrayBufferByteLength, backing, []);
    ownNameCount = safeObjectGetOwnPropertyNames(value).length;
    ownSymbolCount = safeObjectGetOwnPropertySymbols(value).length;
  } catch {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
  if (!safeNumberIsSafeInteger(byteLength) || !safeNumberIsSafeInteger(byteOffset) || length !== byteLength) refuse('SOURCE_ORIGIN_SCHEMA');
  if (ownSymbolCount !== 0 || ownNameCount !== byteLength) refuse('SOURCE_ORIGIN_SCHEMA');
  return { value, byteLength, byteOffset, backing };
}

function freshEncodedByteView(value) {
  if (value === null || typeof value !== 'object' || safeIsProxy(value)) refuse('SOURCE_ORIGIN_SCHEMA');
  if (safeObjectGetPrototypeOf(value) !== safeUint8ArrayPrototype) refuse('SOURCE_ORIGIN_SCHEMA');
  let backing;
  let backingByteLength;
  let byteLength;
  let byteOffset;
  let length;
  let ownSymbolCount;
  try {
    backing = callIntrinsic(safeTypedArrayBuffer, value, []);
    backingByteLength = callIntrinsic(safeArrayBufferByteLength, backing, []);
    byteLength = callIntrinsic(safeTypedArrayByteLength, value, []);
    byteOffset = callIntrinsic(safeTypedArrayByteOffset, value, []);
    length = callIntrinsic(safeTypedArrayLength, value, []);
    ownSymbolCount = safeObjectGetOwnPropertySymbols(value).length;
  } catch {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
  if (!safeNumberIsSafeInteger(backingByteLength)
    || !safeNumberIsSafeInteger(byteLength)
    || !safeNumberIsSafeInteger(byteOffset)
    || byteOffset !== 0
    || length !== byteLength
    || backingByteLength !== byteLength
    || ownSymbolCount !== 0) refuse('SOURCE_ORIGIN_SCHEMA');
  return { value, byteLength, byteOffset, backing };
}

function encodeUtf8(value) {
  const bytes = callIntrinsic(safeTextEncode, safeTextEncoder, [value]);
  freshEncodedByteView(bytes);
  return bytes;
}

function hashParts(parts, algorithm = 'sha256') {
  const hash = safeCreateHash(algorithm);
  for (let index = 0; index < parts.length; index += 1) callIntrinsic(safeHashUpdate, hash, [parts[index]]);
  return callIntrinsic(safeHashDigest, hash, ['hex']);
}

export const SOURCE_ORIGIN_LIMITS = deepFreeze({
  capturedFileBytes: 67_108_864,
  jsonBytes: 67_108_864,
  sourceFiles: 16_384,
  sourceBytes: 67_108_864,
  resolutionFiles: 1_024,
  resolutionBytes: 4_194_304,
  nodes: 65_536,
  edges: 200_000,
  unresolvedRows: 262_144,
  processMillis: 900_000,
  processOutputBytes: 67_108_864,
});

export const LOCAL_INVENTORY_POLICY_SCHEMA = 'galerina.logic-aig-local-inventory-policy.v1';
export const LOCAL_SOURCE_SNAPSHOT_SCHEMA = 'galerina.logic-aig-local-source-snapshot.v1';

const LOCAL_POLICY_KEYS = Object.freeze(['schema', 'profile', 'entries', 'exclusions', 'limits', 'authorizing', 'policyDigest']);
const LOCAL_POLICY_ENTRY_KEYS = Object.freeze(['path', 'role']);
const LOCAL_POLICY_LIMIT_KEYS = Object.freeze([
  'maxDepth', 'maxEntries', 'maxFileBytes', 'maxMillis', 'maxResolutionBytes',
  'maxResolutionFiles', 'maxSourceBytes', 'maxSourceFiles', 'maxTotalBytes',
]);
const LOCAL_SNAPSHOT_KEYS = Object.freeze([
  'schema', 'repositoryIdentityDigest', 'inventoryPolicyDigest', 'entries', 'counts',
  'authorizing', 'authentication', 'executionBoundary', 'atomicSnapshot',
  'hostileWriterResistance', 'fixtureOnly', 'snapshotDigest',
]);
const LOCAL_SNAPSHOT_ENTRY_KEYS = Object.freeze(['path', 'role', 'byteLength', 'rawSha256']);
const LOCAL_SNAPSHOT_COUNT_KEYS = Object.freeze([
  'entries', 'sourceFiles', 'sourceBytes', 'resolutionFiles', 'resolutionBytes', 'totalBytes',
]);
const LOCAL_ROLES = new SafeSet(['DEPENDENCY', 'GENERATED_INPUT', 'POLICY_OWNER', 'RESOLUTION', 'SOURCE']);
const LOCAL_SOURCE_ROLES = new SafeSet(['DEPENDENCY', 'GENERATED_INPUT', 'SOURCE']);
const LOCAL_PROFILE_FIXTURE = 'FIXTURE_ONLY';
const LOCAL_PROFILE_PRODUCTION = 'LOCAL_PRODUCTION_V1';

function localPath(value, code = 'SOURCE_ORIGIN_POLICY') {
  nfcString(value);
  if (!value || callIntrinsic(safeTypedArrayByteLength, encodeUtf8(value), []) > 4_096
    || stringStartsWith(value, '/') || stringEndsWith(value, '/') || stringIncludes(value, '\\')
    || stringIncludes(value, '//') || stringIncludes(value, '/./') || stringIncludes(value, '/../')
    || value === '.' || value === '..') refuse(code);
  const parts = stringSplit(value, '/');
  forEachArray(parts, (part) => {
    if (!part || part === '.' || part === '..' || callIntrinsic(safeTypedArrayByteLength, encodeUtf8(part), []) > 255
      || regexTest(/[<>:"|?*\u0000-\u001f]/u, part) || stringEndsWith(part, '.') || stringEndsWith(part, ' ')
      || regexTest(/^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\.|$)/iu, part)) refuse(code);
  });
  return value;
}

function localOption(value, keys) {
  if (value === undefined) return null;
  dataObject(value, keys);
  return value;
}

function localLimit(value, maximum) {
  if (!safeNumberIsSafeInteger(value) || value < 0 || value > maximum) refuse('SOURCE_ORIGIN_LIMIT');
  return value;
}

function validateLocalPolicyOptions(options) {
  const value = localOption(options, ['allowFixtureOnly']);
  if (value === null) return false;
  if (typeof value.allowFixtureOnly !== 'boolean') refuse('SOURCE_ORIGIN_FIXTURE');
  return value.allowFixtureOnly;
}

export function validateLocalInventoryPolicy(value, options) {
  const allowFixtureOnly = validateLocalPolicyOptions(options);
  dataObject(value, LOCAL_POLICY_KEYS);
  if (value.schema !== LOCAL_INVENTORY_POLICY_SCHEMA || value.authorizing !== false) refuse('SOURCE_ORIGIN_POLICY');
  if (value.profile !== LOCAL_PROFILE_FIXTURE && value.profile !== LOCAL_PROFILE_PRODUCTION) refuse('SOURCE_ORIGIN_POLICY');
  if (value.profile === LOCAL_PROFILE_FIXTURE && !allowFixtureOnly) refuse('SOURCE_ORIGIN_FIXTURE');

  checkedArray(value.entries, 'SOURCE_ORIGIN_POLICY');
  checkedArray(value.exclusions, 'SOURCE_ORIGIN_POLICY');
  dataObject(value.limits, LOCAL_POLICY_LIMIT_KEYS);
  const limits = value.limits;
  localLimit(limits.maxDepth, 64);
  localLimit(limits.maxEntries, SOURCE_ORIGIN_LIMITS.nodes);
  localLimit(limits.maxFileBytes, SOURCE_ORIGIN_LIMITS.capturedFileBytes);
  localLimit(limits.maxMillis, SOURCE_ORIGIN_LIMITS.processMillis);
  localLimit(limits.maxResolutionBytes, SOURCE_ORIGIN_LIMITS.resolutionBytes);
  localLimit(limits.maxResolutionFiles, SOURCE_ORIGIN_LIMITS.resolutionFiles);
  localLimit(limits.maxSourceBytes, SOURCE_ORIGIN_LIMITS.sourceBytes);
  localLimit(limits.maxSourceFiles, SOURCE_ORIGIN_LIMITS.sourceFiles);
  localLimit(limits.maxTotalBytes, SOURCE_ORIGIN_LIMITS.sourceBytes + SOURCE_ORIGIN_LIMITS.resolutionBytes);
  if (limits.maxFileBytes > limits.maxTotalBytes || value.entries.length > limits.maxEntries) refuse('SOURCE_ORIGIN_LIMIT');

  let previousPath = null;
  const folded = new SafeSet();
  forEachArray(value.entries, (entry) => {
    dataObject(entry, LOCAL_POLICY_ENTRY_KEYS);
    const path = localPath(entry.path);
    if (!LOCAL_ROLES.has(entry.role)) refuse('SOURCE_ORIGIN_POLICY');
    if (path.split('/').length > limits.maxDepth) refuse('SOURCE_ORIGIN_LIMIT');
    if (previousPath !== null && codeUnitCompare(previousPath, path) >= 0) refuse('SOURCE_ORIGIN_ORDER');
    const key = stringToLowerCase(path);
    if (setHas(folded, key)) refuse('SOURCE_ORIGIN_ALIAS');
    setAdd(folded, key);
    previousPath = path;
  });
  assertSortedUniqueStrings(value.exclusions);
  const exclusionFolded = new SafeSet();
  forEachArray(value.exclusions, (exclusion) => {
    const path = localPath(exclusion);
    if (path.split('/').length > limits.maxDepth) refuse('SOURCE_ORIGIN_LIMIT');
    const key = stringToLowerCase(path);
    if (setHas(exclusionFolded, key) || setHas(folded, key)) refuse('SOURCE_ORIGIN_ALIAS');
    setAdd(exclusionFolded, key);
    forEachArray(value.entries, (entry) => {
      const entryKey = stringToLowerCase(entry.path);
      if (entryKey === key || stringStartsWith(entryKey, `${key}/`)) refuse('SOURCE_ORIGIN_POLICY');
    });
  });
  checkDigest(value, 'policyDigest');
  return immutableCopy(value);
}

function validateLocalSnapshotOptions(options) {
  if (options === undefined) return { allowFixtureOnly: false, repositoryIdentity: null, inventoryPolicy: null };
  if (options === null || typeof options !== 'object' || safeIsProxy(options)
    || safeArrayIsArray(options) || safeObjectGetPrototypeOf(options) !== safeObjectPrototype
    || safeObjectGetOwnPropertySymbols(options).length !== 0) refuse('SOURCE_ORIGIN_SCHEMA');
  const names = safeObjectGetOwnPropertyNames(options);
  if (names.length !== 1 && names.length !== 3) refuse('SOURCE_ORIGIN_SCHEMA');
  const allowed = new SafeSet(['allowFixtureOnly', 'repositoryIdentity', 'inventoryPolicy']);
  forEachArray(names, (name) => {
    if (!setHas(allowed, name)) refuse('SOURCE_ORIGIN_SCHEMA');
    const descriptor = safeObjectGetOwnPropertyDescriptor(options, name);
    if (!descriptor || !safeObjectHasOwn(descriptor, 'value') || !descriptor.enumerable) refuse('SOURCE_ORIGIN_SCHEMA');
  });
  if (!safeObjectHasOwn(options, 'allowFixtureOnly') || typeof options.allowFixtureOnly !== 'boolean') refuse('SOURCE_ORIGIN_FIXTURE');
  const hasRepository = safeObjectHasOwn(options, 'repositoryIdentity');
  const hasPolicy = safeObjectHasOwn(options, 'inventoryPolicy');
  if (hasRepository !== hasPolicy) refuse('SOURCE_ORIGIN_SCHEMA');
  if (hasRepository && (options.repositoryIdentity === null || options.inventoryPolicy === null
    || options.repositoryIdentity === undefined || options.inventoryPolicy === undefined)) {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
  return {
    allowFixtureOnly: options.allowFixtureOnly,
    repositoryIdentity: hasRepository ? options.repositoryIdentity : null,
    inventoryPolicy: hasPolicy ? options.inventoryPolicy : null,
  };
}

export function validateLocalSourceSnapshot(value, options) {
  const configured = validateLocalSnapshotOptions(options);
  dataObject(value, LOCAL_SNAPSHOT_KEYS);
  if (value.schema !== LOCAL_SOURCE_SNAPSHOT_SCHEMA || value.authorizing !== false
    || value.authentication !== 'NONE' || value.executionBoundary !== 'COOPERATIVE_LOCAL_SAME_USER'
    || value.atomicSnapshot !== false || value.hostileWriterResistance !== false
    || typeof value.fixtureOnly !== 'boolean') refuse('SOURCE_ORIGIN_POLICY');
  if (value.fixtureOnly && !configured.allowFixtureOnly) refuse('SOURCE_ORIGIN_FIXTURE');
  if (!HEX64.test(value.repositoryIdentityDigest) || !HEX64.test(value.inventoryPolicyDigest)) refuse('SOURCE_ORIGIN_DIGEST');
  checkedArray(value.entries, 'SOURCE_ORIGIN_SCHEMA');
  dataObject(value.counts, LOCAL_SNAPSHOT_COUNT_KEYS);
  forEachArray(LOCAL_SNAPSHOT_COUNT_KEYS, (key) => localLimit(value.counts[key], SOURCE_ORIGIN_LIMITS.sourceBytes + SOURCE_ORIGIN_LIMITS.resolutionBytes));
  if (value.counts.entries > SOURCE_ORIGIN_LIMITS.nodes
    || value.counts.sourceFiles > SOURCE_ORIGIN_LIMITS.sourceFiles
    || value.counts.sourceBytes > SOURCE_ORIGIN_LIMITS.sourceBytes
    || value.counts.resolutionFiles > SOURCE_ORIGIN_LIMITS.resolutionFiles
    || value.counts.resolutionBytes > SOURCE_ORIGIN_LIMITS.resolutionBytes) {
    refuse('SOURCE_ORIGIN_LIMIT');
  }

  let previousPath = null;
  let sourceFiles = 0;
  let sourceBytes = 0;
  let resolutionFiles = 0;
  let resolutionBytes = 0;
  const folded = new SafeSet();
  forEachArray(value.entries, (entry) => {
    dataObject(entry, LOCAL_SNAPSHOT_ENTRY_KEYS);
    const path = localPath(entry.path, 'SOURCE_ORIGIN_SCHEMA');
    if (!LOCAL_ROLES.has(entry.role) || !safeNumberIsSafeInteger(entry.byteLength)
      || entry.byteLength < 0 || entry.byteLength > SOURCE_ORIGIN_LIMITS.capturedFileBytes
      || !HEX64.test(entry.rawSha256)) refuse('SOURCE_ORIGIN_SCHEMA');
    if (previousPath !== null && codeUnitCompare(previousPath, path) >= 0) refuse('SOURCE_ORIGIN_ORDER');
    const key = stringToLowerCase(path);
    if (setHas(folded, key)) refuse('SOURCE_ORIGIN_ALIAS');
    setAdd(folded, key);
    previousPath = path;
    if (setHas(LOCAL_SOURCE_ROLES, entry.role)) {
      sourceFiles += 1;
      sourceBytes += entry.byteLength;
    } else {
      resolutionFiles += 1;
      resolutionBytes += entry.byteLength;
    }
  });
  if (value.counts.entries !== value.entries.length
    || value.counts.sourceFiles !== sourceFiles || value.counts.sourceBytes !== sourceBytes
    || value.counts.resolutionFiles !== resolutionFiles || value.counts.resolutionBytes !== resolutionBytes
    || value.counts.totalBytes !== sourceBytes + resolutionBytes) refuse('SOURCE_ORIGIN_COUNTS');
  if (configured.repositoryIdentity !== null) {
    const repository = validateRepositoryIdentity(configured.repositoryIdentity);
    if (repository.identityDigest !== value.repositoryIdentityDigest) refuse('SOURCE_ORIGIN_DIGEST');
  }
  if (configured.inventoryPolicy !== null) {
    const policy = validateLocalInventoryPolicy(configured.inventoryPolicy, { allowFixtureOnly: configured.allowFixtureOnly });
    if (value.fixtureOnly !== (policy.profile === LOCAL_PROFILE_FIXTURE)) refuse('SOURCE_ORIGIN_FIXTURE');
    if (value.entries.length > policy.limits.maxEntries
      || sourceFiles > policy.limits.maxSourceFiles || sourceBytes > policy.limits.maxSourceBytes
      || resolutionFiles > policy.limits.maxResolutionFiles || resolutionBytes > policy.limits.maxResolutionBytes
      || value.counts.totalBytes > policy.limits.maxTotalBytes) {
      refuse('SOURCE_ORIGIN_LIMIT');
    }
    forEachArray(value.entries, (entry) => {
      if (entry.byteLength > policy.limits.maxFileBytes) refuse('SOURCE_ORIGIN_LIMIT');
    });
    const snapshotPolicyEntries = mapArray(value.entries, (entry) => ({ path: entry.path, role: entry.role }));
    if (policy.policyDigest !== value.inventoryPolicyDigest || canonicalJsonText(policy.entries) !== canonicalJsonText(snapshotPolicyEntries)) refuse('SOURCE_ORIGIN_DIGEST');
  } else if (!value.fixtureOnly) {
    refuse('SOURCE_ORIGIN_FIXTURE');
  }
  checkDigest(value, 'snapshotDigest');
  return immutableCopy(value);
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const DIAGNOSTIC = /^(?:[A-Z][A-Z0-9]*-)+[0-9]{3,5}[A-Z]?$/;

class SourceOriginRefusal extends Error {
  constructor(code) {
    super(code);
    defineData(this, 'name', 'SourceOriginRefusal');
    defineData(this, 'code', code);
  }
}
safeObjectFreeze(SourceOriginRefusal.prototype);
safeObjectFreeze(SourceOriginRefusal);

function refuse(code) {
  throw new SourceOriginRefusal(code);
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze(value, seen = undefined) {
  if (seen === undefined) seen = new SafeSet();
  if (value === null || typeof value !== 'object' || setHas(seen, value)) return value;
  setAdd(seen, value);
  const names = safeObjectGetOwnPropertyNames(value);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = safeObjectGetOwnPropertyDescriptor(value, names[index]);
    if (descriptor && safeObjectHasOwn(descriptor, 'value')) deepFreeze(descriptor.value, seen);
  }
  return safeObjectFreeze(value);
}

function dataObject(value, keys) {
  if (value === null || typeof value !== 'object' || safeIsProxy(value) || safeArrayIsArray(value)) refuse('SOURCE_ORIGIN_SCHEMA');
  const prototype = safeObjectGetPrototypeOf(value);
  if (prototype !== safeObjectPrototype && prototype !== null) refuse('SOURCE_ORIGIN_SCHEMA');
  if (safeObjectGetOwnPropertySymbols(value).length !== 0) refuse('SOURCE_ORIGIN_SCHEMA');
  const names = safeObjectGetOwnPropertyNames(value);
  if (names.length !== keys.length) refuse('SOURCE_ORIGIN_SCHEMA');
  const sortedNames = sortArray(copyArray(names), codeUnitCompare);
  const sortedKeys = sortArray(copyArray(keys), codeUnitCompare);
  if (someArray(sortedNames, (name, index) => name !== sortedKeys[index])) refuse('SOURCE_ORIGIN_SCHEMA');
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = safeObjectGetOwnPropertyDescriptor(value, names[index]);
    if (!descriptor || !safeObjectHasOwn(descriptor, 'value') || !descriptor.enumerable) refuse('SOURCE_ORIGIN_SCHEMA');
  }
}

function checkedArray(value, code) {
  if (safeIsProxy(value) || !safeArrayIsArray(value) || safeObjectGetPrototypeOf(value) !== safeArrayPrototype || safeObjectGetOwnPropertySymbols(value).length !== 0) refuse(code);
  const length = value.length;
  if (!safeNumberIsSafeInteger(length) || length < 0 || length > SOURCE_ORIGIN_LIMITS.jsonBytes) refuse(code);
  const names = safeObjectGetOwnPropertyNames(value);
  if (names.length !== length + 1 || !includesArray(names, 'length')) refuse(code);
  for (let index = 0; index < length; index += 1) {
    const descriptor = safeObjectGetOwnPropertyDescriptor(value, `${index}`);
    if (!descriptor || !safeObjectHasOwn(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  }
  return value;
}

function array(value) {
  return checkedArray(value, 'SOURCE_ORIGIN_SCHEMA');
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = stringCharCodeAt(value, index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = stringCharCodeAt(value, index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function nfcString(value) {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value) || value !== stringNormalize(value)) refuse('SOURCE_ORIGIN_SCHEMA');
  return value;
}

function canonicalValue(value, active, depth = 0, retainIdentities = false) {
  if (depth > 128) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!safeNumberIsSafeInteger(value) || value < 0) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
    return value;
  }
  if (typeof value === 'string') {
    if (hasUnpairedSurrogate(value) || value !== stringNormalize(value)) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
    return value;
  }
  if (typeof value !== 'object' || safeIsProxy(value) || setHas(active, value)) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  setAdd(active, value);
  try {
    if (safeArrayIsArray(value)) {
      checkedArray(value, 'SOURCE_ORIGIN_JSON_CANONICAL');
      const output = [];
      for (let index = 0; index < value.length; index += 1) append(
        output,
        canonicalValue(
          safeObjectGetOwnPropertyDescriptor(value, `${index}`).value,
          active,
          depth + 1,
          retainIdentities,
        ),
      );
      return output;
    }
    const prototype = safeObjectGetPrototypeOf(value);
    if (prototype !== safeObjectPrototype && prototype !== null || safeObjectGetOwnPropertySymbols(value).length !== 0) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
    const output = plainRecord();
    const names = sortArray(safeObjectGetOwnPropertyNames(value), codeUnitCompare);
    for (let index = 0; index < names.length; index += 1) {
      const key = names[index];
      const descriptor = safeObjectGetOwnPropertyDescriptor(value, key);
      if (!descriptor || !safeObjectHasOwn(descriptor, 'value') || !descriptor.enumerable) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
      defineData(
        output,
        nfcString(key),
        canonicalValue(descriptor.value, active, depth + 1, retainIdentities),
      );
    }
    return output;
  } finally {
    if (!retainIdentities) setDelete(active, value);
  }
}

function serializeCanonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return callIntrinsic(safeJsonStringify, null, [value]);
  }
  if (safeArrayIsArray(value)) {
    let text = '[';
    for (let index = 0; index < value.length; index += 1) {
      if (index !== 0) text += ',';
      text += serializeCanonical(value[index]);
    }
    return text + ']';
  }
  const names = safeObjectGetOwnPropertyNames(value);
  let text = '{';
  for (let index = 0; index < names.length; index += 1) {
    if (index !== 0) text += ',';
    const name = names[index];
    text += callIntrinsic(safeJsonStringify, null, [name]) + ':' + serializeCanonical(safeObjectGetOwnPropertyDescriptor(value, name).value);
  }
  return text + '}';
}

export function canonicalJsonText(value) {
  const text = serializeCanonical(canonicalValue(value, new SafeSet()));
  if (text === undefined) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  const bytes = encodeUtf8(text);
  if (callIntrinsic(safeTypedArrayByteLength, bytes, []) > SOURCE_ORIGIN_LIMITS.jsonBytes) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  return text;
}

export function sha256Raw(bytes) {
  byteView(bytes);
  return hashParts([bytes]);
}

export function decodeUtf8Bytes(bytes) {
  byteView(bytes, true);
  try {
    return callIntrinsic(safeTextDecode, safeTextDecoder, [bytes]);
  } catch {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
}

export function gitBlobOid(bytes, objectFormat) {
  const view = byteView(bytes, true);
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') refuse('SOURCE_ORIGIN_SCHEMA');
  return hashParts([encodeUtf8(`blob ${view.byteLength}\0`), bytes], objectFormat);
}

export function sha256Canonical(domain, value) {
  nfcString(domain);
  return hashParts([encodeUtf8(domain), new SafeUint8Array(1), encodeUtf8(canonicalJsonText(value))]);
}

function assertNoDuplicateMembers(text) {
  const objectScopes = [];
  for (let index = 0; index < text.length;) {
    const char = stringSlice(text, index, index + 1);
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < text.length) {
        const inner = stringSlice(text, index, index + 1);
        if (inner === '\\') index += 2;
        else if (inner === '"') { index += 1; break; }
        else index += 1;
      }
      let cursor = index;
      while (regexTest(/\s/, stringSlice(text, cursor, cursor + 1))) cursor += 1;
      if (stringSlice(text, cursor, cursor + 1) === ':' && objectScopes.length > 0) {
        let key;
        try { key = callIntrinsic(safeJsonParse, null, [stringSlice(text, start, index)]); } catch { return; }
        const scope = objectScopes[objectScopes.length - 1];
        if (setHas(scope, key)) refuse('SOURCE_ORIGIN_JSON_DUPLICATE');
        setAdd(scope, key);
      }
      continue;
    }
    if (char === '{') append(objectScopes, new SafeSet());
    else if (char === '}') {
      if (objectScopes.length === 0) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
      objectScopes.length -= 1;
    }
    index += 1;
  }
}

export function parseCanonicalJsonBytes(bytes, options) {
  const view = byteView(bytes, true);
  dataObject(options, ['label']);
  const label = options.label;
  if (view.byteLength > SOURCE_ORIGIN_LIMITS.jsonBytes || typeof label !== 'string') refuse('SOURCE_ORIGIN_SCHEMA');
  if (view.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  let text;
  try { text = callIntrinsic(safeTextDecode, safeTextDecoder, [bytes]); } catch { refuse('SOURCE_ORIGIN_JSON_CANONICAL'); }
  if (stringCharCodeAt(text, 0) === 0xfeff) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  assertNoDuplicateMembers(text);
  let value;
  try { value = callIntrinsic(safeJsonParse, null, [text]); } catch { refuse('SOURCE_ORIGIN_JSON_CANONICAL'); }
  if (canonicalJsonText(value) !== text) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  return deepFreeze(canonicalValue(value, new SafeSet()));
}

function immutableCopy(value) {
  return deepFreeze(canonicalValue(value, new SafeSet()));
}

function without(value, key) {
  const copy = nullRecord();
  const names = safeObjectKeys(value);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (name !== key) defineData(copy, name, safeObjectGetOwnPropertyDescriptor(value, name).value);
  }
  return copy;
}

function checkDigest(value, field) {
  if (typeof value[field] !== 'string' || !regexTest(HEX64, value[field])) refuse('SOURCE_ORIGIN_DIGEST');
  const expected = sha256Canonical(value.schema, without(value, field));
  if (value[field] !== expected) refuse('SOURCE_ORIGIN_DIGEST');
}

function equalExact(actual, expected) {
  if (canonicalJsonText(actual) !== canonicalJsonText(expected)) refuse('SOURCE_ORIGIN_POLICY');
}

function assertSortedUniqueStrings(values) {
  array(values);
  forEachArray(values, nfcString);
  for (let index = 1; index < values.length; index += 1) if (codeUnitCompare(values[index - 1], values[index]) >= 0) refuse('SOURCE_ORIGIN_ORDER');
}

export function validateRepositoryIdentity(value) {
  dataObject(value, ['schema', 'ownerNamespace', 'repositoryName', 'canonicalIdentity', 'authorizing', 'identityDigest']);
  if (value.schema !== 'galerina.logic-aig-repository-identity.v1' || value.authorizing !== false) refuse('SOURCE_ORIGIN_POLICY');
  forEachArray(['ownerNamespace', 'repositoryName', 'canonicalIdentity'], (field) => nfcString(value[field]));
  if (!value.ownerNamespace || !value.repositoryName || stringIncludes(value.ownerNamespace, '/') || stringIncludes(value.repositoryName, '/') || value.ownerNamespace !== 'TritHypha' || value.repositoryName !== 'Galerina' || value.canonicalIdentity !== 'TritHypha/Galerina') refuse('SOURCE_ORIGIN_POLICY');
  checkDigest(value, 'identityDigest');
  return immutableCopy(value);
}

export const SOURCE_POLICY_BODY = deepFreeze({
  schema: 'galerina.logic-aig-source-policy.v1',
  domains: ['FUNGI', 'GATE', 'HOST'],
  suffixes: [
    { domain: 'HOST', suffix: '.cjs' }, { domain: 'HOST', suffix: '.cts' }, { domain: 'HOST', suffix: '.d.ts' },
    { domain: 'FUNGI', suffix: '.fungi' }, { domain: 'GATE', suffix: '.gate' }, { domain: 'HOST', suffix: '.js' },
    { domain: 'HOST', suffix: '.jsx' }, { domain: 'HOST', suffix: '.mjs' }, { domain: 'HOST', suffix: '.mts' },
    { domain: 'HOST', suffix: '.ts' }, { domain: 'HOST', suffix: '.tsx' },
  ],
  exclusions: [],
  authorizing: false,
});

export function validateSourcePolicy(value) {
  dataObject(value, ['schema', 'domains', 'suffixes', 'exclusions', 'authorizing', 'policyDigest']);
  array(value.domains); array(value.suffixes); array(value.exclusions);
  forEachArray(value.suffixes, (row) => dataObject(row, ['domain', 'suffix']));
  const body = without(value, 'policyDigest');
  const expected = SOURCE_POLICY_BODY;
  if (value.domains.length === expected.domains.length && everyArray(sortArray(copyArray(value.domains), codeUnitCompare), (entry, index) => entry === expected.domains[index]) && canonicalJsonText(value.domains) !== canonicalJsonText(expected.domains)) refuse('SOURCE_ORIGIN_ORDER');
  const expectedSuffixKeys = setFromArray(expected.suffixes, (row) => `${row.suffix}\0${row.domain}`);
  const actualSuffixKeys = mapArray(value.suffixes, (row) => `${row.suffix}\0${row.domain}`);
  if (setSize(setFromArray(actualSuffixKeys)) !== actualSuffixKeys.length) refuse('SOURCE_ORIGIN_ORDER');
  if (actualSuffixKeys.length === setSize(expectedSuffixKeys) && everyArray(actualSuffixKeys, (key) => setHas(expectedSuffixKeys, key)) && canonicalJsonText(value.suffixes) !== canonicalJsonText(expected.suffixes)) refuse('SOURCE_ORIGIN_ORDER');
  equalExact(body, expected);
  checkDigest(value, 'policyDigest');
  return immutableCopy(value);
}

export function classifySourcePath(path, policy) {
  policy = validateSourcePolicy(policy);
  nfcString(path);
  let selected = null;
  forEachArray(policy.suffixes, (row) => { if (stringEndsWith(path, row.suffix) && (!selected || row.suffix.length > selected.suffix.length)) selected = row; });
  return selected?.domain ?? null;
}

export const RESOLUTION_POLICY_BODY = deepFreeze({
  schema: 'galerina.logic-aig-resolution-policy.v1',
  sourceSuffixes: ['.cjs', '.cts', '.d.ts', '.fungi', '.gate', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'],
  resolutionBasenames: ['galerina.workspace.json', 'npm-shrinkwrap.json', 'package-lock.json', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'yarn.lock'],
  resolutionNamePatterns: ['^jsconfig(?:\\.[A-Za-z0-9_-]+)?\\.json$', '^tsconfig(?:\\.[A-Za-z0-9_-]+)?\\.json$'],
  includeExpectedOutcomeOwners: true,
  testPathComponents: ['test', 'tests'],
  testBasenamePattern: '^(?:.+[.-])?(?:test|spec)\\.(?:cjs|cts|fungi|gate|js|jsx|mjs|mts|ts|tsx)$',
  authorizing: false,
});

export function validateResolutionPolicy(value) {
  dataObject(value, ['schema', 'sourceSuffixes', 'resolutionBasenames', 'resolutionNamePatterns', 'includeExpectedOutcomeOwners', 'testPathComponents', 'testBasenamePattern', 'authorizing', 'policyDigest']);
  forEachArray(['sourceSuffixes', 'resolutionBasenames', 'resolutionNamePatterns', 'testPathComponents'], (field) => assertSortedUniqueStrings(value[field]));
  if (value.includeExpectedOutcomeOwners !== true) refuse('SOURCE_ORIGIN_POLICY');
  equalExact(without(value, 'policyDigest'), RESOLUTION_POLICY_BODY);
  checkDigest(value, 'policyDigest');
  return immutableCopy(value);
}

export const UNRESOLVED_REASON_ROWS = deepFreeze(mapArray([
  ['CALLER','AMBIGUOUS_TARGET',['EXACT_SET']],['CALLER','DYNAMIC_TARGET',['EXACT_SET','UNKNOWN']],['CALLER','MISSING_TARGET',['UNKNOWN']],['CALLER','OWNER_DISPOSITION_CALLER_UNRESOLVED',['NOT_APPLICABLE']],['CALLER','TARGET_OUTSIDE_SOURCE_DOMAIN',['UNKNOWN']],
  ['CONTRACT','AMBIGUOUS_TARGET',['EXACT_SET']],['CONTRACT','DYNAMIC_TARGET',['EXACT_SET','UNKNOWN']],['CONTRACT','MISSING_TARGET',['UNKNOWN']],['CONTRACT','OWNER_DISPOSITION_CONTRACT_UNRESOLVED',['NOT_APPLICABLE']],['CONTRACT','TARGET_OUTSIDE_SOURCE_DOMAIN',['UNKNOWN']],
  ['GENERATED_CONSUMER','OWNER_DISPOSITION_GENERATED_CONSUMER_UNRESOLVED',['NOT_APPLICABLE']],
  ['IMPORT','AMBIGUOUS_TARGET',['EXACT_SET']],['IMPORT','DYNAMIC_TARGET',['EXACT_SET','UNKNOWN']],['IMPORT','MISSING_TARGET',['UNKNOWN']],['IMPORT','OWNER_DISPOSITION_IMPORT_UNRESOLVED',['NOT_APPLICABLE']],['IMPORT','TARGET_OUTSIDE_SOURCE_DOMAIN',['UNKNOWN']],
  ['TEST','AMBIGUOUS_TARGET',['EXACT_SET']],['TEST','DYNAMIC_TARGET',['EXACT_SET','UNKNOWN']],['TEST','MISSING_TARGET',['UNKNOWN']],['TEST','OWNER_DISPOSITION_TEST_UNRESOLVED',['NOT_APPLICABLE']],['TEST','TARGET_OUTSIDE_SOURCE_DOMAIN',['UNKNOWN']],
], (row) => ({ relationshipClass: row[0], reasonCode: row[1], permittedCandidateStates: row[2] })));

export const PARSER_POLICY_BODY = deepFreeze({
  schema: 'galerina.logic-aig-parser-policy.v1',
  parserIds: ['galerina-fungi-parser', 'galerina-gate-v3-parser', 'typescript-compiler-api'],
  domainParserBindings: [{ domain: 'FUNGI', parserId: 'galerina-fungi-parser' }, { domain: 'GATE', parserId: 'galerina-gate-v3-parser' }, { domain: 'HOST', parserId: 'typescript-compiler-api' }],
  dispositions: ['EXPECTED_REFUSAL', 'OPAQUE_PROPOSED'],
  diagnosticCodePattern: '^(?:[A-Z][A-Z0-9]*-)+[0-9]{3,5}[A-Z]?$',
  diagnosticSetEncoding: 'ASCII_COMMA_OR_WHITESPACE_V1',
  diagnosticCanonicalization: 'UTF16_CODE_UNIT_ASCENDING_UNIQUE',
  typescriptDiagnosticMapping: { schema: 'galerina.logic-aig-typescript-diagnostic-mapping.v1', inputCodeType: 'NON_NEGATIVE_SAFE_INTEGER', minimumCode: 0, maximumCode: 99999, minimumDigits: 3, prefix: 'TS-', categoryRows: [{ typescriptCategory: 0, name: 'WARNING', codeSetAction: 'EXCLUDE' }, { typescriptCategory: 1, name: 'ERROR', codeSetAction: 'INCLUDE' }, { typescriptCategory: 2, name: 'SUGGESTION', codeSetAction: 'EXCLUDE' }, { typescriptCategory: 3, name: 'MESSAGE', codeSetAction: 'EXCLUDE' }], relatedInformationAction: 'VALIDATE_AND_EXCLUDE', deduplicate: true, ordering: 'UTF16_CODE_UNIT_ASCENDING', authorizing: false },
  ownerKinds: ['GATE_V3_VERDICT', 'INLINE_EXPECTATION', 'PROPOSED_BASELINE', 'SIDECAR_EXPECTATION'],
  ownerManifestBindings: [
    { ownerKind: 'GATE_V3_VERDICT', manifestKind: 'RESOLUTION_INPUTS', ownerKeyRequired: true, ownerReasonRequired: false },
    { ownerKind: 'INLINE_EXPECTATION', manifestKind: 'SOURCE_MANIFEST', ownerKeyRequired: true, ownerReasonRequired: false },
    { ownerKind: 'PROPOSED_BASELINE', manifestKind: 'RESOLUTION_INPUTS', ownerKeyRequired: true, ownerReasonRequired: true },
    { ownerKind: 'SIDECAR_EXPECTATION', manifestKind: 'RESOLUTION_INPUTS', ownerKeyRequired: true, ownerReasonRequired: false },
  ],
  actualOutcomeBindings: [
    { disposition: 'EXPECTED_REFUSAL', actualStatus: 'REFUSED_AS_EXPECTED', diagnosticCodesRule: 'NON_EMPTY_EXACT_CANONICAL_SET' },
    { disposition: 'OPAQUE_PROPOSED', actualStatus: 'OPAQUE_AS_PROPOSED', diagnosticCodesRule: 'NULL' },
  ],
  unresolvedReasonRows: UNRESOLVED_REASON_ROWS,
  authorizing: false,
});

export function validateParserPolicy(value) {
  dataObject(value, ['schema','parserIds','domainParserBindings','dispositions','diagnosticCodePattern','diagnosticSetEncoding','diagnosticCanonicalization','typescriptDiagnosticMapping','ownerKinds','ownerManifestBindings','actualOutcomeBindings','unresolvedReasonRows','authorizing','policyDigest']);
  forEachArray(['parserIds','dispositions','ownerKinds'], (field) => array(value[field]));
  forEachArray(['domainParserBindings','ownerManifestBindings','actualOutcomeBindings','unresolvedReasonRows'], (field) => array(value[field]));
  const expectedReasonRows = canonicalJsonText(PARSER_POLICY_BODY.unresolvedReasonRows);
  const actualReasonRows = canonicalJsonText(value.unresolvedReasonRows);
  const sortedReasonRows = canonicalJsonText(sortArray(copyArray(value.unresolvedReasonRows), (a,b) => codeUnitCompare(`${a.relationshipClass}\0${a.reasonCode}`, `${b.relationshipClass}\0${b.reasonCode}`)));
  if (actualReasonRows !== expectedReasonRows && sortedReasonRows === expectedReasonRows) refuse('SOURCE_ORIGIN_ORDER');
  if (value.diagnosticSetEncoding !== 'ASCII_COMMA_OR_WHITESPACE_V1') refuse('SOURCE_ORIGIN_POLICY');
  equalExact(without(value, 'policyDigest'), PARSER_POLICY_BODY);
  checkDigest(value, 'policyDigest');
  return immutableCopy(value);
}

export function decodeDiagnosticSet(text, policy) {
  policy = validateParserPolicy(policy);
  if (typeof text !== 'string' || regexTest(/[^\x00-\x7f]/, text) || text !== stringNormalize(text)) refuse('SOURCE_ORIGIN_DIAGNOSTIC_SET');
  const whitespace = (index) => {
    const unit = stringCharCodeAt(text, index);
    return unit === 0x20 || (unit >= 0x09 && unit <= 0x0d);
  };
  let start = 0;
  let end = text.length;
  while (start < end && whitespace(start)) start += 1;
  while (end > start && whitespace(end - 1)) end -= 1;
  if (start === end) refuse('SOURCE_ORIGIN_DIAGNOSTIC_SET');
  const tokens = [];
  let cursor = start;
  while (cursor < end) {
    const tokenStart = cursor;
    while (cursor < end && stringCharCodeAt(text, cursor) !== 0x2c && !whitespace(cursor)) cursor += 1;
    if (cursor === tokenStart) refuse('SOURCE_ORIGIN_DIAGNOSTIC_SET');
    append(tokens, stringSlice(text, tokenStart, cursor));
    while (cursor < end && whitespace(cursor)) cursor += 1;
    if (cursor === end) break;
    if (stringCharCodeAt(text, cursor) === 0x2c) {
      cursor += 1;
      while (cursor < end && whitespace(cursor)) cursor += 1;
      if (cursor === end) refuse('SOURCE_ORIGIN_DIAGNOSTIC_SET');
    }
  }
  if (someArray(tokens, (token) => !token || !regexTest(DIAGNOSTIC, token)) || setSize(setFromArray(tokens)) !== tokens.length) refuse('SOURCE_ORIGIN_DIAGNOSTIC_SET');
  return sortArray(tokens, codeUnitCompare);
}

export function validateGeneratedConsumerPolicy(value) {
  dataObject(value, ['schema','relations','authorizing','policyDigest']);
  if (value.schema !== 'galerina.logic-aig-generated-consumers.v1' || value.authorizing !== false) refuse('SOURCE_ORIGIN_POLICY');
  array(value.relations);
  if (value.relations.length !== 0) refuse('SOURCE_ORIGIN_POLICY');
  checkDigest(value, 'policyDigest');
  return immutableCopy(value);
}

function validateSortedEntries(entries, key) {
  array(entries);
  for (let index = 1; index < entries.length; index += 1) if (codeUnitCompare(entries[index - 1][key], entries[index][key]) >= 0) refuse('SOURCE_ORIGIN_ORDER');
}

export function validateProposedBaseline(value) {
  dataObject(value, ['schema','entries','authorizing','policyDigest']);
  if (value.schema !== 'galerina.example-proposed-baseline.v1' || value.authorizing !== false) refuse('SOURCE_ORIGIN_POLICY');
  array(value.entries);
  forEachArray(value.entries, (entry) => { dataObject(entry, ['directoryName','reason']); nfcString(entry.directoryName); nfcString(entry.reason); if (!entry.directoryName || !entry.reason) refuse('SOURCE_ORIGIN_POLICY'); });
  validateSortedEntries(value.entries, 'directoryName');
  checkDigest(value, 'policyDigest');
  return immutableCopy(value);
}

function nonEmptyString(value) {
  nfcString(value);
  if (!value) refuse('SOURCE_ORIGIN_POLICY');
  return value;
}

function canonicalLocator(value) {
  nonEmptyString(value);
  if (stringIncludes(value, '\0') || stringIncludes(value, '\\') || stringIncludes(value, ':') || stringStartsWith(value, '/')) refuse('SOURCE_ORIGIN_POLICY');
  const components = stringSplit(value, '/');
  if (someArray(components, (component) => component === '' || component === '.' || component === '..')) refuse('SOURCE_ORIGIN_POLICY');
  return value;
}

function nonNegativeInteger(value) {
  if (!safeNumberIsSafeInteger(value) || value < 0) refuse('SOURCE_ORIGIN_SCHEMA');
  return value;
}

function digest(value) {
  if (typeof value !== 'string' || !regexTest(HEX64, value)) refuse('SOURCE_ORIGIN_DIGEST');
  return value;
}

function validateExpectedOutcomeRow(row, parserPolicy) {
  dataObject(row, ['path','domain','parserId','disposition','diagnosticCodes','ownerKind','ownerLocator','ownerKey']);
  forEachArray(['path','domain','parserId','disposition','ownerKind','ownerLocator','ownerKey'], (field) => nonEmptyString(row[field]));
  const parserByDomain = mapFromArray(parserPolicy.domainParserBindings, (binding) => binding.domain, (binding) => binding.parserId);
  canonicalLocator(row.path); canonicalLocator(row.ownerLocator);
  if (mapGet(parserByDomain, row.domain) !== row.parserId || !includesArray(parserPolicy.dispositions, row.disposition) || !includesArray(parserPolicy.ownerKinds, row.ownerKind)) refuse('SOURCE_ORIGIN_POLICY');
  if (row.disposition === 'EXPECTED_REFUSAL') {
    if (row.ownerKind === 'PROPOSED_BASELINE') refuse('SOURCE_ORIGIN_POLICY');
    assertSortedUniqueStrings(row.diagnosticCodes);
    if (row.diagnosticCodes.length === 0 || someArray(row.diagnosticCodes, (code) => !regexTest(DIAGNOSTIC, code))) refuse('SOURCE_ORIGIN_POLICY');
  } else {
    if (row.ownerKind !== 'PROPOSED_BASELINE' || row.diagnosticCodes !== null) refuse('SOURCE_ORIGIN_POLICY');
  }
  if (row.ownerKind === 'INLINE_EXPECTATION' && (row.ownerLocator !== row.path || row.ownerKey !== 'expected_diagnostics')) refuse('SOURCE_ORIGIN_POLICY');
  if (row.ownerKind === 'SIDECAR_EXPECTATION' && (row.ownerLocator !== `${row.path}.expected.diagnostics.txt` || row.ownerKey !== 'complete-file')) refuse('SOURCE_ORIGIN_POLICY');
  if (row.ownerKind === 'GATE_V3_VERDICT' && (row.ownerLocator !== 'packages-ts/galerina-core-compiler/tests/fixtures/gate-v3/REFERENCE-VERDICTS.json' || row.ownerKey !== stringSlice(row.path, stringLastIndexOf(row.path, '/') + 1))) refuse('SOURCE_ORIGIN_POLICY');
  if (row.ownerKind === 'PROPOSED_BASELINE') {
    const ownerComponentCount = filterArray(stringSplit(row.path, '/'), (component) => component === row.ownerKey).length;
    if (row.ownerLocator !== 'governance/example-proposed-baseline.json' || ownerComponentCount !== 1) refuse('SOURCE_ORIGIN_POLICY');
  }
}

export function validateExpectedParseOutcomes(value, options) {
  dataObject(value, ['schema','parserPolicyDigest','rows','authorizing','expectedOutcomesDigest']);
  dataObject(options, ['parserPolicy']);
  let parserPolicy = options.parserPolicy;
  parserPolicy = validateParserPolicy(parserPolicy);
  if (value.schema !== 'galerina.logic-aig-expected-parse-outcomes.v1' || value.authorizing !== false || value.parserPolicyDigest !== parserPolicy.policyDigest) refuse('SOURCE_ORIGIN_POLICY');
  array(value.rows);
  forEachArray(value.rows, (row) => validateExpectedOutcomeRow(row, parserPolicy));
  validateSortedEntries(value.rows, 'path');
  checkDigest(value, 'expectedOutcomesDigest');
  return immutableCopy(value);
}

function validateManifestRow(row, objectFormat) {
  dataObject(row, ['path','mode','blobOid','objectFormat','byteLength','rawSha256']);
  canonicalLocator(row.path);
  if (row.mode !== '100644' && row.mode !== '100755') refuse('SOURCE_ORIGIN_MANIFEST');
  if (row.objectFormat !== objectFormat || objectFormat !== 'sha1' && objectFormat !== 'sha256') refuse('SOURCE_ORIGIN_MANIFEST');
  const oidPattern = objectFormat === 'sha1' ? HEX40 : HEX64;
  if (typeof row.blobOid !== 'string' || !regexTest(oidPattern, row.blobOid)) refuse('SOURCE_ORIGIN_MANIFEST');
  digest(row.rawSha256);
  nonNegativeInteger(row.byteLength);
  if (row.byteLength > SOURCE_ORIGIN_LIMITS.capturedFileBytes) refuse('SOURCE_ORIGIN_LIMIT');
}

function validateManifestRows(rows, objectFormat, maximumRows, maximumBytes) {
  array(rows);
  if (rows.length > maximumRows) refuse('SOURCE_ORIGIN_LIMIT');
  let totalBytes = 0;
  const folded = new SafeSet();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    validateManifestRow(row, objectFormat);
    if (totalBytes > maximumBytes - row.byteLength) refuse('SOURCE_ORIGIN_LIMIT');
    totalBytes += row.byteLength;
    const lower = stringToLowerCase(row.path);
    if (setHas(folded, lower)) refuse('SOURCE_ORIGIN_MANIFEST');
    setAdd(folded, lower);
  }
  validateSortedEntries(rows, 'path');
  return totalBytes;
}

function manifestOptions(options, keys) {
  if (options === undefined) refuse('SOURCE_ORIGIN_SCHEMA');
  dataObject(options, keys);
  return options;
}

export function validateSourceManifest(value, options) {
  dataObject(value, [
    'schema','repositoryId','expectedHead','expectedTree','objectFormat',
    'policyDigest','exclusionDigest','rows','counts','authorizing','manifestDigest',
  ]);
  options = manifestOptions(options, ['repositoryIdentity','sourcePolicy']);
  const repositoryIdentity = validateRepositoryIdentity(options.repositoryIdentity);
  const sourcePolicy = validateSourcePolicy(options.sourcePolicy);
  if (
    value.schema !== 'galerina.logic-aig-source-manifest.v1'
    || value.authorizing !== false
    || value.repositoryId !== `repository:${repositoryIdentity.identityDigest}`
    || value.policyDigest !== sourcePolicy.policyDigest
    || value.exclusionDigest !== sha256Canonical('galerina.logic-aig-exclusions.v1', sourcePolicy.exclusions)
  ) refuse('SOURCE_ORIGIN_POLICY');
  if (value.objectFormat !== 'sha1' && value.objectFormat !== 'sha256') refuse('SOURCE_ORIGIN_MANIFEST');
  const oidPattern = value.objectFormat === 'sha1' ? HEX40 : HEX64;
  if (!regexTest(oidPattern, value.expectedHead) || !regexTest(oidPattern, value.expectedTree)) refuse('SOURCE_ORIGIN_MANIFEST');
  const totalBytes = validateManifestRows(value.rows, value.objectFormat, SOURCE_ORIGIN_LIMITS.sourceFiles, SOURCE_ORIGIN_LIMITS.sourceBytes);
  dataObject(value.counts, ['paths','blobs','bytes','mode100644','mode100755','exclusions']);
  forEachArray(safeObjectValues(value.counts), nonNegativeInteger);
  const uniqueBlobs = setFromArray(value.rows, (row) => row.blobOid);
  const expectedCounts = {
    paths: value.rows.length,
    blobs: setSize(uniqueBlobs),
    bytes: totalBytes,
    mode100644: filterArray(value.rows, (row) => row.mode === '100644').length,
    mode100755: filterArray(value.rows, (row) => row.mode === '100755').length,
    exclusions: sourcePolicy.exclusions.length,
  };
  if (canonicalJsonText(value.counts) !== canonicalJsonText(expectedCounts)) refuse('SOURCE_ORIGIN_MANIFEST');
  checkDigest(value, 'manifestDigest');
  return immutableCopy(value);
}

export function validateResolutionInputs(value, options) {
  dataObject(value, [
    'schema','repositoryId','expectedHead','expectedTree','policyDigest','rows',
    'authorizing','resolutionInputsDigest',
  ]);
  options = manifestOptions(options, ['repositoryIdentity','resolutionPolicy']);
  const repositoryIdentity = validateRepositoryIdentity(options.repositoryIdentity);
  const resolutionPolicy = validateResolutionPolicy(options.resolutionPolicy);
  if (
    value.schema !== 'galerina.logic-aig-resolution-inputs.v1'
    || value.authorizing !== false
    || value.repositoryId !== `repository:${repositoryIdentity.identityDigest}`
    || value.policyDigest !== resolutionPolicy.policyDigest
  ) refuse('SOURCE_ORIGIN_POLICY');
  const objectFormat = value.expectedHead.length === 40 && value.expectedTree.length === 40
    ? 'sha1'
    : value.expectedHead.length === 64 && value.expectedTree.length === 64
      ? 'sha256'
      : null;
  if (objectFormat === null) refuse('SOURCE_ORIGIN_MANIFEST');
  validateManifestRows(value.rows, objectFormat, SOURCE_ORIGIN_LIMITS.resolutionFiles, SOURCE_ORIGIN_LIMITS.resolutionBytes);
  checkDigest(value, 'resolutionInputsDigest');
  return immutableCopy(value);
}

function validateActualRuntimeLoadSetsForManifest(values, record) {
  array(values);
  if (values.length !== 2 || values[0]?.id !== 'HOST' || values[1]?.id !== 'PARSER') refuse('SOURCE_ORIGIN_TOOLCHAIN');
  for (let index = 0; index < values.length; index += 1) {
    const actual = values[index];
    const admitted = record.runtimeLoadSets[index];
    dataObject(actual, ['id','moduleRows','builtinModules']);
    if (actual.id !== admitted.id) refuse('SOURCE_ORIGIN_TOOLCHAIN');
    validateClosureRows(actual.moduleRows);
    validateBuiltinModules(actual.builtinModules);
    const admittedRows = mapFromArray(admitted.moduleRows, (row) => row.locator);
    for (let rowIndex = 0; rowIndex < actual.moduleRows.length; rowIndex += 1) {
      const row = actual.moduleRows[rowIndex];
      const expected = mapGet(admittedRows, row.locator);
      if (!expected || canonicalJsonText(row) !== canonicalJsonText(expected)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
    }
    if (!someArray(actual.moduleRows, (row) => row.locator === admitted.entry.locator)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
    if (someArray(actual.builtinModules, (specifier) => !includesArray(admitted.builtinModules, specifier))) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  }
}

function actualJoinedProjection(values, record) {
  const rows = [];
  const exact = new SafeSet();
  const folded = new SafeSet();
  for (let index = 0; index < values.length; index += 1) {
    const rootLocator = record.runtimeLoadSets[index].entry.rootLocator;
    for (let rowIndex = 0; rowIndex < values[index].moduleRows.length; rowIndex += 1) {
      const row = values[index].moduleRows[rowIndex];
      const locator = `${rootLocator}/${row.locator}`;
      const lower = stringToLowerCase(locator);
      if (setHas(exact, locator) || setHas(folded, lower)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
      setAdd(exact, locator); setAdd(folded, lower);
      append(rows, { locator, rawSha256: row.rawSha256, byteLength: row.byteLength });
    }
  }
  return sortArray(rows, (left, right) => codeUnitCompare(left.locator, right.locator));
}

function validateToolchainManifestCore(value) {
  dataObject(value, [
    'schema','selectedPinRecordId','selectedPinRecordDigest','pinsDigest',
    'sourceObservationDigest','loadObservationDigest','platform','arch',
    'nodeIdentity','gitIdentity','typescript','sourceOriginParser',
    'runtimeLoadSets','domainSelections','builtinModules','executableModuleRows',
    'dataRows','moduleClosureDigest','actualRuntimeLoadSets',
    'actualLoadedModuleRows','actualLoadedBuiltinModules',
    'actualParserExportNames','actualLoadedSetDigest','authorizing',
    'toolchainManifestDigest',
  ]);
  if (value.schema !== 'galerina.logic-aig-toolchain-manifest.v2' || value.authorizing !== false) refuse('SOURCE_ORIGIN_POLICY');
  forEachArray(['selectedPinRecordId','platform','arch'], (field) => nonEmptyString(value[field]));
  forEachArray([
    'selectedPinRecordDigest','pinsDigest','sourceObservationDigest','loadObservationDigest',
    'moduleClosureDigest','actualLoadedSetDigest','toolchainManifestDigest',
  ], (field) => digest(value[field]));
  array(value.actualParserExportNames);
  assertSortedUniqueStrings(value.actualParserExportNames);
  if (canonicalJsonText(value.actualParserExportNames) !== canonicalJsonText(TOOLCHAIN_PARSER_EXPORTS)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  checkDigest(value, 'toolchainManifestDigest');
}

export function validateToolchainManifest(value, options) {
  validateToolchainManifestCore(value);
  dataObject(options, ['pins']);
  const pins = validateToolchainPins(options.pins);
  const records = filterArray(pins.records, (record) =>
    record.recordId === value.selectedPinRecordId
    && record.recordDigest === value.selectedPinRecordDigest
    && record.platform === value.platform
    && record.arch === value.arch);
  if (records.length !== 1 || value.pinsDigest !== pins.pinsDigest) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  const record = records[0];
  const repeated = [
    'sourceObservationDigest','loadObservationDigest','nodeIdentity','gitIdentity',
    'typescript','sourceOriginParser','runtimeLoadSets','domainSelections',
    'builtinModules','executableModuleRows','dataRows','moduleClosureDigest',
  ];
  forEachArray(repeated, (field) => { if (canonicalJsonText(value[field]) !== canonicalJsonText(record[field])) refuse('SOURCE_ORIGIN_TOOLCHAIN'); });
  validateActualRuntimeLoadSetsForManifest(value.actualRuntimeLoadSets, record);
  const actualLoadedModuleRows = actualJoinedProjection(value.actualRuntimeLoadSets, record);
  if (canonicalJsonText(value.actualLoadedModuleRows) !== canonicalJsonText(actualLoadedModuleRows)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  const executable = mapFromArray(record.executableModuleRows, (row) => row.locator);
  for (let index = 0; index < actualLoadedModuleRows.length; index += 1) {
    const row = actualLoadedModuleRows[index];
    const expected = mapGet(executable, row.locator);
    if (!expected || canonicalJsonText(row) !== canonicalJsonText(expected)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  }
  const actualLoadedBuiltinModules = sortArray(setValuesArray(setFromArray(flatMapArray(value.actualRuntimeLoadSets, (row) => row.builtinModules))), codeUnitCompare);
  if (canonicalJsonText(value.actualLoadedBuiltinModules) !== canonicalJsonText(actualLoadedBuiltinModules)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  const loadedBody = {
    schema: 'galerina.logic-aig-actual-loaded-set.v2',
    actualRuntimeLoadSets: value.actualRuntimeLoadSets,
    actualLoadedModuleRows,
    actualLoadedBuiltinModules,
    actualParserExportNames: value.actualParserExportNames,
    counts: {
      runtimeLoadSets: value.actualRuntimeLoadSets.length,
      modules: actualLoadedModuleRows.length,
      builtinModules: actualLoadedBuiltinModules.length,
      parserExports: value.actualParserExportNames.length,
    },
    authorizing: false,
  };
  if (value.actualLoadedSetDigest !== sha256Canonical(loadedBody.schema, loadedBody)) refuse('SOURCE_ORIGIN_DIGEST');
  return immutableCopy(value);
}

function manifestRowDigest(kind, row) {
  const domain = kind === 'SOURCE_MANIFEST'
    ? 'galerina.logic-aig-source-manifest-row.v1'
    : kind === 'RESOLUTION_INPUTS'
      ? 'galerina.logic-aig-resolution-input-row.v1'
      : refuse('SOURCE_ORIGIN_OUTCOMES');
  return sha256Canonical(domain, row);
}

function validateReceiptBinding(binding, manifests, expectedKind) {
  dataObject(binding, ['manifestKind','manifestRowDigest','path','blobOid','rawSha256','byteLength']);
  if (binding.manifestKind !== expectedKind) refuse('SOURCE_ORIGIN_OUTCOMES');
  canonicalLocator(binding.path); digest(binding.manifestRowDigest); digest(binding.rawSha256); nonNegativeInteger(binding.byteLength);
  const manifest = expectedKind === 'SOURCE_MANIFEST' ? manifests.sourceManifest : manifests.resolutionInputs;
  const row = findArray(manifest.rows, (candidate) => candidate.path === binding.path);
  if (!row || binding.blobOid !== row.blobOid || binding.rawSha256 !== row.rawSha256 || binding.byteLength !== row.byteLength || binding.manifestRowDigest !== manifestRowDigest(expectedKind, row)) refuse('SOURCE_ORIGIN_OUTCOMES');
}

function nullableCompare(left, right) {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return codeUnitCompare(left, right);
}

function ownerBindingCompare(left, right) {
  const fields = ['ownerKind','locator','ownerKey','ownerReason'];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const comparison = nullableCompare(left[field], right[field]);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function validateOwnerBindings(values, manifests, parserPolicy, expectedOutcome, proposedBaseline) {
  array(values);
  if (values.length !== 1) refuse('SOURCE_ORIGIN_OUTCOMES');
  const policy = mapFromArray(parserPolicy.ownerManifestBindings, (row) => row.ownerKind);
  for (let index = 0; index < values.length; index += 1) {
    const binding = values[index];
    dataObject(binding, ['ownerKind','manifestKind','manifestRowDigest','locator','blobOid','rawSha256','byteLength','ownerKey','ownerReason']);
    const rule = mapGet(policy, binding.ownerKind);
    if (!rule || binding.manifestKind !== rule.manifestKind) refuse('SOURCE_ORIGIN_OUTCOMES');
    if (rule.ownerKeyRequired ? typeof binding.ownerKey !== 'string' || !binding.ownerKey : binding.ownerKey !== null) refuse('SOURCE_ORIGIN_OUTCOMES');
    if (rule.ownerReasonRequired ? typeof binding.ownerReason !== 'string' || !binding.ownerReason : binding.ownerReason !== null) refuse('SOURCE_ORIGIN_OUTCOMES');
    const reduced = {
      manifestKind: binding.manifestKind,
      manifestRowDigest: binding.manifestRowDigest,
      path: binding.locator,
      blobOid: binding.blobOid,
      rawSha256: binding.rawSha256,
      byteLength: binding.byteLength,
    };
    validateReceiptBinding(reduced, manifests, binding.manifestKind);
    canonicalLocator(binding.locator);
    if (
      binding.ownerKind !== expectedOutcome.ownerKind
      || binding.locator !== expectedOutcome.ownerLocator
      || binding.ownerKey !== expectedOutcome.ownerKey
      || binding.ownerReason !== (expectedOutcome.ownerKind === 'PROPOSED_BASELINE'
        ? findArray(proposedBaseline.entries, (row) => row.directoryName === expectedOutcome.ownerKey)?.reason ?? refuse('SOURCE_ORIGIN_OUTCOMES')
        : null)
    ) refuse('SOURCE_ORIGIN_OUTCOMES');
  }
  for (let index = 1; index < values.length; index += 1) if (ownerBindingCompare(values[index - 1], values[index]) >= 0) refuse('SOURCE_ORIGIN_ORDER');
}

function validateParseOutcomeReceiptRow(row, expected, manifests, parserPolicy, proposedBaseline, expectedOutcomesDigest) {
  dataObject(row, [
    'path','disposition','parserId','actualStatus','actualDiagnosticCodes',
    'sourceBinding','ownerBindings','membershipProofDigest',
    'representedFileNodeId','unresolvedRowsDigest','rowDigest',
  ]);
  canonicalLocator(row.path);
  forEachArray(['disposition','parserId','actualStatus'], (field) => nonEmptyString(row[field]));
  forEachArray(['membershipProofDigest','unresolvedRowsDigest','rowDigest'], (field) => digest(row[field]));
  if (!regexTest(/^ga1:[0-9a-f]{64}$/, row.representedFileNodeId)) refuse('SOURCE_ORIGIN_OUTCOMES');
  if (row.path !== expected.path || row.disposition !== expected.disposition || row.parserId !== expected.parserId) refuse('SOURCE_ORIGIN_OUTCOMES');
  validateReceiptBinding(row.sourceBinding, manifests, 'SOURCE_MANIFEST');
  if (row.sourceBinding.path !== row.path) refuse('SOURCE_ORIGIN_OUTCOMES');
  validateOwnerBindings(row.ownerBindings, manifests, parserPolicy, expected, proposedBaseline);
  if (expected.disposition === 'EXPECTED_REFUSAL') {
    if (row.actualStatus !== 'REFUSED_AS_EXPECTED' || canonicalJsonText(row.actualDiagnosticCodes) !== canonicalJsonText(expected.diagnosticCodes)) refuse('SOURCE_ORIGIN_OUTCOMES');
  } else if (expected.disposition === 'OPAQUE_PROPOSED') {
    if (row.actualStatus !== 'OPAQUE_AS_PROPOSED' || row.actualDiagnosticCodes !== null) refuse('SOURCE_ORIGIN_OUTCOMES');
  } else refuse('SOURCE_ORIGIN_OUTCOMES');
  const membershipBody = {
    schema: 'galerina.logic-aig-outcome-membership-proof.v1',
    expectedOutcomesDigest,
    path: row.path,
    disposition: row.disposition,
    parserId: row.parserId,
    expectedDiagnosticCodes: expected.diagnosticCodes,
    sourceBinding: row.sourceBinding,
    ownerBindings: row.ownerBindings,
    authorizing: false,
  };
  if (row.membershipProofDigest !== sha256Canonical(membershipBody.schema, membershipBody)) refuse('SOURCE_ORIGIN_DIGEST');
  if (row.rowDigest !== sha256Canonical('galerina.logic-aig-parse-outcome-row.v1', without(row, 'rowDigest'))) refuse('SOURCE_ORIGIN_DIGEST');
}

export function validateParseOutcomesReceipt(value, options) {
  dataObject(value, [
    'schema','repositoryId','expectedHead','expectedTree','expectedOutcomesDigest',
    'sourceManifestDigest','resolutionInputsDigest','toolchainManifestDigest',
    'rows','counts','authorizing','receiptDigest',
  ]);
  options = manifestOptions(options, [
    'repositoryIdentity','sourcePolicy','resolutionPolicy','parserPolicy','pins',
    'proposedBaseline','expectedOutcomes','sourceManifest','resolutionInputs','toolchainManifest',
  ]);
  const repositoryIdentity = validateRepositoryIdentity(options.repositoryIdentity);
  const sourcePolicy = validateSourcePolicy(options.sourcePolicy);
  const resolutionPolicy = validateResolutionPolicy(options.resolutionPolicy);
  const parserPolicy = validateParserPolicy(options.parserPolicy);
  const pins = validateToolchainPins(options.pins);
  const proposedBaseline = validateProposedBaseline(options.proposedBaseline);
  const expectedOutcomes = validateExpectedParseOutcomes(options.expectedOutcomes, { parserPolicy });
  const sourceManifest = validateSourceManifest(options.sourceManifest, { repositoryIdentity, sourcePolicy });
  const resolutionInputs = validateResolutionInputs(options.resolutionInputs, { repositoryIdentity, resolutionPolicy });
  const toolchainManifest = validateToolchainManifest(options.toolchainManifest, { pins });
  if (
    value.schema !== 'galerina.logic-aig-parse-outcomes-receipt.v1'
    || value.authorizing !== false
  ) refuse('SOURCE_ORIGIN_POLICY');
  const repeated = {
    repositoryId: sourceManifest.repositoryId,
    expectedHead: sourceManifest.expectedHead,
    expectedTree: sourceManifest.expectedTree,
    expectedOutcomesDigest: expectedOutcomes.expectedOutcomesDigest,
    sourceManifestDigest: sourceManifest.manifestDigest,
    resolutionInputsDigest: resolutionInputs.resolutionInputsDigest,
    toolchainManifestDigest: toolchainManifest.toolchainManifestDigest,
  };
  const repeatedEntries = safeObjectEntries(repeated);
  for (let index = 0; index < repeatedEntries.length; index += 1) {
    const field = repeatedEntries[index][0];
    const expected = repeatedEntries[index][1];
    if (value[field] !== expected) refuse('SOURCE_ORIGIN_OUTCOMES');
  }
  if (resolutionInputs.repositoryId !== value.repositoryId || resolutionInputs.expectedHead !== value.expectedHead || resolutionInputs.expectedTree !== value.expectedTree) refuse('SOURCE_ORIGIN_OUTCOMES');
  array(value.rows);
  if (value.rows.length !== expectedOutcomes.rows.length) refuse('SOURCE_ORIGIN_OUTCOMES');
  for (let index = 0; index < value.rows.length; index += 1) validateParseOutcomeReceiptRow(
    value.rows[index], expectedOutcomes.rows[index], { sourceManifest, resolutionInputs }, parserPolicy, proposedBaseline, expectedOutcomes.expectedOutcomesDigest,
  );
  validateSortedEntries(value.rows, 'path');
  dataObject(value.counts, ['outcomeRows','expectedRefusalRows','opaqueProposedRows','representedFileNodes','unresolvedRows','ownerBindings']);
  forEachArray(safeObjectValues(value.counts), nonNegativeInteger);
  const representedFileNodeIds = setFromArray(value.rows, (row) => row.representedFileNodeId);
  const expectedCounts = {
    outcomeRows: value.rows.length,
    expectedRefusalRows: filterArray(value.rows, (row) => row.disposition === 'EXPECTED_REFUSAL').length,
    opaqueProposedRows: filterArray(value.rows, (row) => row.disposition === 'OPAQUE_PROPOSED').length,
    representedFileNodes: setSize(representedFileNodeIds),
    unresolvedRows: value.rows.length * 5,
    ownerBindings: reduceArray(value.rows, (sum, row) => sum + row.ownerBindings.length, 0),
  };
  if (canonicalJsonText(value.counts) !== canonicalJsonText(expectedCounts)) refuse('SOURCE_ORIGIN_OUTCOMES');
  checkDigest(value, 'receiptDigest');
  return immutableCopy(value);
}

function validateExecutableIdentity(value) {
  dataObject(value, ['version','executableRawSha256','executableByteLength']);
  nonEmptyString(value.version); digest(value.executableRawSha256); nonNegativeInteger(value.executableByteLength);
}

function validatePackageIdentity(value) {
  dataObject(value, ['name','version','packageLocator','packageRawSha256','packageByteLength','entryLocator','entryRawSha256','entryByteLength']);
  forEachArray(['name','version','packageLocator','entryLocator'], (field) => nonEmptyString(value[field]));
  canonicalLocator(value.packageLocator); canonicalLocator(value.entryLocator);
  digest(value.packageRawSha256); digest(value.entryRawSha256);
  nonNegativeInteger(value.packageByteLength); nonNegativeInteger(value.entryByteLength);
}

function validateClosureRows(rows) {
  array(rows);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    dataObject(row, ['locator','rawSha256','byteLength']);
    canonicalLocator(row.locator); digest(row.rawSha256); nonNegativeInteger(row.byteLength);
  }
  validateSortedEntries(rows, 'locator');
}

const TOOLCHAIN_COMPILER_ROOT = 'packages-ts/galerina-core-compiler';
const TOOLCHAIN_HOST_ROOT = TOOLCHAIN_COMPILER_ROOT + '/node_modules/typescript';
const TOOLCHAIN_PARSER_ROOT = 'generated-source-origin-parser';
const TOOLCHAIN_PARSER_EXPORTS = deepFreeze(['lex', 'parseGateV3', 'parseProgram']);
const TOOLCHAIN_DOMAIN_SELECTIONS = deepFreeze([
  { domain: 'FUNGI', parserId: 'galerina-fungi-parser', runtimeLoadSetId: 'PARSER', operation: 'parseProgram' },
  { domain: 'GATE', parserId: 'galerina-gate-v3-parser', runtimeLoadSetId: 'PARSER', operation: 'parseGateV3' },
  { domain: 'HOST', parserId: 'typescript-compiler-api', runtimeLoadSetId: 'HOST', operation: 'typescript-compiler-api' },
]);
const TOOLCHAIN_SOURCE_EDGES = deepFreeze([
  { fromLocator: 'src/gate-v3-parser.ts', kind: 'IMPORT_TYPE', exportName: null, specifier: './parser.js', toLocator: 'src/parser.ts' },
  { fromLocator: 'src/parser.ts', kind: 'IMPORT', exportName: null, specifier: './lexer.js', toLocator: 'src/lexer.ts' },
  { fromLocator: 'src/parser.ts', kind: 'IMPORT', exportName: null, specifier: './requirement-diagnostics.js', toLocator: 'src/requirement-diagnostics.ts' },
  { fromLocator: 'src/source-origin-parser-entry.ts', kind: 'EXPORT_FROM', exportName: 'lex', specifier: './lexer.js', toLocator: 'src/lexer.ts' },
  { fromLocator: 'src/source-origin-parser-entry.ts', kind: 'EXPORT_FROM', exportName: 'parseGateV3', specifier: './gate-v3-parser.js', toLocator: 'src/gate-v3-parser.ts' },
  { fromLocator: 'src/source-origin-parser-entry.ts', kind: 'EXPORT_FROM', exportName: 'parseProgram', specifier: './parser.js', toLocator: 'src/parser.ts' },
]);
const TOOLCHAIN_EMITTED_EDGES = deepFreeze([
  { fromLocator: 'parser.js', kind: 'IMPORT', exportName: null, specifier: './lexer.js', toLocator: 'lexer.js' },
  { fromLocator: 'parser.js', kind: 'IMPORT', exportName: null, specifier: './requirement-diagnostics.js', toLocator: 'requirement-diagnostics.js' },
  { fromLocator: 'source-origin-parser-entry.js', kind: 'EXPORT_FROM', exportName: 'lex', specifier: './lexer.js', toLocator: 'lexer.js' },
  { fromLocator: 'source-origin-parser-entry.js', kind: 'EXPORT_FROM', exportName: 'parseGateV3', specifier: './gate-v3-parser.js', toLocator: 'gate-v3-parser.js' },
  { fromLocator: 'source-origin-parser-entry.js', kind: 'EXPORT_FROM', exportName: 'parseProgram', specifier: './parser.js', toLocator: 'parser.js' },
]);
const TOOLCHAIN_PARSER_MODULES = deepFreeze([
  'gate-v3-parser.js',
  'lexer.js',
  'parser.js',
  'requirement-diagnostics.js',
  'source-origin-parser-entry.js',
]);
const TOOLCHAIN_SOURCE_DATA_LOCATORS = deepFreeze((() => {
  const locators = [];
  forEachArray(TOOLCHAIN_SOURCE_EDGES, (row) => { append(locators, row.fromLocator); append(locators, row.toLocator); });
  const unique = setValuesArray(setFromArray(locators));
  append(unique, 'tsconfig.source-origin-parser.json');
  return sortArray(unique, codeUnitCompare);
})());
const TOOLCHAIN_GENERATED_DATA_LOCATORS = deepFreeze((() => {
  const locators = mapArray(TOOLCHAIN_PARSER_MODULES, (locator) => `${stringSlice(locator, 0, -3)}.d.ts`);
  append(locators, 'package.json');
  return sortArray(locators, codeUnitCompare);
})());
export const TOOLCHAIN_TYPESCRIPT_DATA_LOCATORS = deepFreeze([
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

function validateBuiltinModules(values) {
  assertSortedUniqueStrings(values);
  if (someArray(values, (specifier) => {
    if (!regexTest(/^node:[a-z0-9][a-z0-9_./-]*$/, specifier)) return true;
    const components = stringSplit(stringSlice(specifier, 5), '/');
    return someArray(components, (component) => component === '' || component === '.' || component === '..');
  })) refuse('SOURCE_ORIGIN_POLICY');
}

function validateRootedIdentity(value) {
  dataObject(value, ['rootLocator','locator','rawSha256','byteLength']);
  canonicalLocator(value.rootLocator); canonicalLocator(value.locator);
  digest(value.rawSha256); nonNegativeInteger(value.byteLength);
}

function validateSourceEntry(value) {
  dataObject(value, ['rootLocator','locator','gitBlobOid','rawSha256','byteLength','exportNames']);
  canonicalLocator(value.rootLocator); canonicalLocator(value.locator);
  if (!regexTest(HEX40, value.gitBlobOid)) refuse('SOURCE_ORIGIN_POLICY');
  digest(value.rawSha256); nonNegativeInteger(value.byteLength);
  equalExact(value.exportNames, TOOLCHAIN_PARSER_EXPORTS);
  if (value.rootLocator !== 'packages-ts/galerina-core-compiler' || value.locator !== 'src/source-origin-parser-entry.ts') refuse('SOURCE_ORIGIN_POLICY');
}

function validateSourceProject(value) {
  dataObject(value, ['rootLocator','locator','gitBlobOid','rawSha256','byteLength','extendsLocator','files','include','compilerOptions']);
  canonicalLocator(value.rootLocator); canonicalLocator(value.locator);
  if (!regexTest(HEX40, value.gitBlobOid)) refuse('SOURCE_ORIGIN_POLICY');
  digest(value.rawSha256); nonNegativeInteger(value.byteLength);
  const expectedOptions = {
    types: [], noEmitOnError: true, incremental: false, composite: false,
    sourceMap: false, declarationMap: false,
  };
  if (
    value.rootLocator !== 'packages-ts/galerina-core-compiler'
    || value.locator !== 'tsconfig.source-origin-parser.json'
    || value.extendsLocator !== './tsconfig.json'
  ) refuse('SOURCE_ORIGIN_POLICY');
  equalExact(value.files, ['src/source-origin-parser-entry.ts']);
  equalExact(value.include, []);
  equalExact(value.compilerOptions, expectedOptions);
}

function validateEdgeRows(value, expected) {
  array(value);
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    dataObject(row, ['fromLocator','kind','exportName','specifier','toLocator']);
    canonicalLocator(row.fromLocator); canonicalLocator(row.toLocator);
    nonEmptyString(row.kind); nonEmptyString(row.specifier);
    if (row.exportName !== null) nonEmptyString(row.exportName);
  }
  equalExact(value, expected);
}

function validateSourceOriginParser(value) {
  dataObject(value, ['sourceEntry','project','generatedEntry','generatedPackageManifest','exportNames','sourceEdgeRows','emittedEdgeRows','generatedClosureDigest']);
  validateSourceEntry(value.sourceEntry);
  validateSourceProject(value.project);
  validateRootedIdentity(value.generatedEntry);
  validateRootedIdentity(value.generatedPackageManifest);
  if (
    value.generatedEntry.rootLocator !== TOOLCHAIN_PARSER_ROOT
    || value.generatedEntry.locator !== 'source-origin-parser-entry.js'
    || value.generatedPackageManifest.rootLocator !== TOOLCHAIN_PARSER_ROOT
    || value.generatedPackageManifest.locator !== 'package.json'
    || value.generatedPackageManifest.byteLength !== 17
    || value.generatedPackageManifest.rawSha256 !== sha256Raw(encodeUtf8('{"type":"module"}'))
  ) refuse('SOURCE_ORIGIN_POLICY');
  equalExact(value.exportNames, TOOLCHAIN_PARSER_EXPORTS);
  validateEdgeRows(value.sourceEdgeRows, TOOLCHAIN_SOURCE_EDGES);
  validateEdgeRows(value.emittedEdgeRows, TOOLCHAIN_EMITTED_EDGES);
  digest(value.generatedClosureDigest);
}

function validateRuntimeLoadSet(value) {
  dataObject(value, ['id','entry','moduleRows','builtinModules']);
  nonEmptyString(value.id);
  dataObject(value.entry, ['rootLocator','locator']);
  canonicalLocator(value.entry.rootLocator); canonicalLocator(value.entry.locator);
  validateClosureRows(value.moduleRows);
  validateBuiltinModules(value.builtinModules);
  const entryRows = filterArray(value.moduleRows, (row) => row.locator === value.entry.locator);
  if (entryRows.length !== 1) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  if (value.id === 'HOST') {
    if (value.entry.rootLocator !== TOOLCHAIN_HOST_ROOT || value.entry.locator !== 'lib/typescript.js') refuse('SOURCE_ORIGIN_TOOLCHAIN');
  } else if (value.id === 'PARSER') {
    if (value.entry.rootLocator !== TOOLCHAIN_PARSER_ROOT || value.entry.locator !== 'source-origin-parser-entry.js') refuse('SOURCE_ORIGIN_TOOLCHAIN');
    if (value.builtinModules.length !== 0) refuse('SOURCE_ORIGIN_TOOLCHAIN');
    equalExact(mapArray(value.moduleRows, (row) => row.locator), TOOLCHAIN_PARSER_MODULES);
  } else refuse('SOURCE_ORIGIN_TOOLCHAIN');
}

function joinedRuntimeProjection(runtimeLoadSets) {
  const pairs = new SafeMap();
  for (let setIndex = 0; setIndex < runtimeLoadSets.length; setIndex += 1) {
    const loadSet = runtimeLoadSets[setIndex];
    for (let rowIndex = 0; rowIndex < loadSet.moduleRows.length; rowIndex += 1) {
      const row = loadSet.moduleRows[rowIndex];
      const pairKey = `${loadSet.entry.rootLocator}\0${row.locator}`;
      const retained = mapGet(pairs, pairKey);
      if (retained) {
        if (retained.rawSha256 !== row.rawSha256 || retained.byteLength !== row.byteLength) refuse('SOURCE_ORIGIN_TOOLCHAIN');
        continue;
      }
      mapSet(pairs, pairKey, { rootLocator: loadSet.entry.rootLocator, locator: row.locator, rawSha256: row.rawSha256, byteLength: row.byteLength });
    }
  }
  const exact = new SafeSet();
  const folded = new SafeSet();
  const rows = [];
  const pairValues = mapValuesArray(pairs);
  for (let index = 0; index < pairValues.length; index += 1) {
    const row = pairValues[index];
    const locator = `${row.rootLocator}/${row.locator}`;
    const lower = stringToLowerCase(locator);
    if (setHas(exact, locator) || setHas(folded, lower)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
    setAdd(exact, locator); setAdd(folded, lower);
    append(rows, { locator, rawSha256: row.rawSha256, byteLength: row.byteLength });
  }
  sortArray(rows, (left, right) => codeUnitCompare(left.locator, right.locator));
  return rows;
}

function assertGlobalLocatorClosure(executableRows, dataRows) {
  const exact = new SafeSet();
  const folded = new SafeSet();
  const combined = copyArray(executableRows);
  forEachArray(dataRows, (row) => append(combined, row));
  for (let index = 0; index < combined.length; index += 1) {
    const row = combined[index];
    const lower = stringToLowerCase(row.locator);
    if (setHas(exact, row.locator) || setHas(folded, lower)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
    setAdd(exact, row.locator); setAdd(folded, lower);
  }
}

function requireRepresented(rows, rootedIdentity) {
  const locator = `${rootedIdentity.rootLocator}/${rootedIdentity.locator}`;
  const row = findArray(rows, (candidate) => candidate.locator === locator);
  if (!row || row.rawSha256 !== rootedIdentity.rawSha256 || row.byteLength !== rootedIdentity.byteLength) refuse('SOURCE_ORIGIN_TOOLCHAIN');
}

function requireDataRow(rows, locator, expectedIdentity = undefined) {
  const row = findArray(rows, (candidate) => candidate.locator === locator);
  if (
    !row
    || expectedIdentity !== undefined
      && (row.rawSha256 !== expectedIdentity.rawSha256 || row.byteLength !== expectedIdentity.byteLength)
  ) refuse('SOURCE_ORIGIN_TOOLCHAIN');
}

function validateDeclaredDataPartition(record) {
  const sourceDataValues = mapArray(TOOLCHAIN_SOURCE_DATA_LOCATORS, (locator) => TOOLCHAIN_COMPILER_ROOT + '/' + locator);
  const generatedDataValues = mapArray(TOOLCHAIN_GENERATED_DATA_LOCATORS, (locator) => TOOLCHAIN_PARSER_ROOT + '/' + locator);
  const typescriptDataValues = mapArray(TOOLCHAIN_TYPESCRIPT_DATA_LOCATORS, (locator) => TOOLCHAIN_HOST_ROOT + '/' + locator);
  const exactSourceData = setFromArray(sourceDataValues);
  const exactGeneratedData = setFromArray(generatedDataValues);
  const exactTypescriptData = setFromArray(typescriptDataValues);

  forEachArray(sourceDataValues, (locator) => requireDataRow(record.dataRows, locator));
  forEachArray(generatedDataValues, (locator) => requireDataRow(record.dataRows, locator));
  forEachArray(typescriptDataValues, (locator) => requireDataRow(record.dataRows, locator));
  requireDataRow(record.dataRows, record.typescript.packageLocator, {
    rawSha256: record.typescript.packageRawSha256,
    byteLength: record.typescript.packageByteLength,
  });
  requireDataRow(record.dataRows, TOOLCHAIN_HOST_ROOT + '/lib/tsc.js');

  for (let index = 0; index < record.dataRows.length; index += 1) {
    const row = record.dataRows[index];
    if (
      !setHas(exactSourceData, row.locator)
      && !setHas(exactGeneratedData, row.locator)
      && !setHas(exactTypescriptData, row.locator)
    ) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  }
}

function validateToolchainRecord(record) {
  dataObject(record, [
    'recordId','platform','arch','sourceObservationDigest','loadObservationDigest',
    'nodeIdentity','gitIdentity','typescript','sourceOriginParser','runtimeLoadSets',
    'domainSelections','builtinModules','executableModuleRows','dataRows',
    'moduleClosureDigest','recordDigest',
  ]);
  forEachArray(['recordId','platform','arch'], (field) => nonEmptyString(record[field]));
  digest(record.sourceObservationDigest); digest(record.loadObservationDigest);
  if (
    record.recordId === 'win32-x64'
      ? record.platform !== 'win32' || record.arch !== 'x64'
      : record.recordId === 'linux-x64'
        ? record.platform !== 'linux' || record.arch !== 'x64'
        : true
  ) refuse('SOURCE_ORIGIN_POLICY');
  validateExecutableIdentity(record.nodeIdentity); validateExecutableIdentity(record.gitIdentity);
  validatePackageIdentity(record.typescript);
  if (
    record.typescript.name !== 'typescript'
    || record.typescript.packageLocator !== `${TOOLCHAIN_HOST_ROOT}/package.json`
    || record.typescript.entryLocator !== `${TOOLCHAIN_HOST_ROOT}/lib/typescript.js`
  ) refuse('SOURCE_ORIGIN_POLICY');
  validateSourceOriginParser(record.sourceOriginParser);
  array(record.runtimeLoadSets);
  forEachArray(record.runtimeLoadSets, validateRuntimeLoadSet);
  equalExact(mapArray(record.runtimeLoadSets, (row) => row.id), ['HOST', 'PARSER']);
  equalExact(record.domainSelections, TOOLCHAIN_DOMAIN_SELECTIONS);
  validateBuiltinModules(record.builtinModules);
  validateClosureRows(record.executableModuleRows); validateClosureRows(record.dataRows);
  if (record.executableModuleRows.length === 0 || record.dataRows.length === 0) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  assertGlobalLocatorClosure(record.executableModuleRows, record.dataRows);
  const projection = joinedRuntimeProjection(record.runtimeLoadSets);
  equalExact(record.executableModuleRows, projection);
  const builtinUnion = sortArray(setValuesArray(setFromArray(flatMapArray(record.runtimeLoadSets, (row) => row.builtinModules))), codeUnitCompare);
  equalExact(record.builtinModules, builtinUnion);

  const hostSet = record.runtimeLoadSets[0];
  const parserSet = record.runtimeLoadSets[1];
  const hostEntry = findArray(hostSet.moduleRows, (row) => row.locator === hostSet.entry.locator);
  const parserEntry = findArray(parserSet.moduleRows, (row) => row.locator === parserSet.entry.locator);
  if (
    !hostEntry
    || record.typescript.entryRawSha256 !== hostEntry.rawSha256
    || record.typescript.entryByteLength !== hostEntry.byteLength
    || !parserEntry
    || record.sourceOriginParser.generatedEntry.rawSha256 !== parserEntry.rawSha256
    || record.sourceOriginParser.generatedEntry.byteLength !== parserEntry.byteLength
  ) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  requireRepresented(record.executableModuleRows, record.sourceOriginParser.generatedEntry);
  requireRepresented(record.dataRows, record.sourceOriginParser.sourceEntry);
  requireRepresented(record.dataRows, record.sourceOriginParser.project);
  requireRepresented(record.dataRows, record.sourceOriginParser.generatedPackageManifest);
  validateDeclaredDataPartition(record);

  const moduleClosureBody = {
    schema: 'galerina.logic-aig-module-closure.v1',
    executableModuleRows: record.executableModuleRows,
    dataRows: record.dataRows,
    builtinModules: record.builtinModules,
    counts: { executableModules: record.executableModuleRows.length, dataRows: record.dataRows.length, builtinModules: record.builtinModules.length },
    authorizing: false,
  };
  digest(record.moduleClosureDigest); digest(record.recordDigest);
  if (record.moduleClosureDigest !== sha256Canonical(moduleClosureBody.schema, moduleClosureBody)) refuse('SOURCE_ORIGIN_DIGEST');
  if (record.recordDigest !== sha256Canonical('galerina.logic-aig-toolchain-pin-record.v2', without(record, 'recordDigest'))) refuse('SOURCE_ORIGIN_DIGEST');
}

export function validateToolchainPins(value) {
  dataObject(value, ['schema','records','authorizing','pinsDigest']);
  if (value.schema !== 'galerina.logic-aig-toolchain-pins.v2' || value.authorizing !== false) refuse('SOURCE_ORIGIN_POLICY');
  array(value.records);
  forEachArray(value.records, validateToolchainRecord);
  for (let index = 1; index < value.records.length; index += 1) if (codeUnitCompare(value.records[index - 1].recordId, value.records[index].recordId) >= 0) refuse('SOURCE_ORIGIN_ORDER');
  checkDigest(value, 'pinsDigest');
  return immutableCopy(value);
}

const TASK_6B_UNRESOLVED_ROW_KEYS = deepFreeze([
  'sourceNodeId',
  'sourceLocator',
  'relationshipClass',
  'reasonCode',
  'evidenceOwnerDigest',
  'evidenceDigest',
]);
const TASK_6B_UNRESOLVED_ORDER_KEYS = deepFreeze([
  'sourceNodeId',
  'relationshipClass',
  'reasonCode',
  'sourceLocator',
  'evidenceDigest',
]);
const TASK_6B_SIDECAR_BODY_KEYS = deepFreeze([
  'schema',
  'repositoryId',
  'expectedHead',
  'expectedTree',
  'gitObservation',
  'sourcePolicy',
  'sourceManifestDigest',
  'resolutionInputsDigest',
  'toolchainManifestDigest',
  'expectedParseOutcomesDigest',
  'parseOutcomesReceiptDigest',
  'generatedConsumerPolicyDigest',
  'parserPolicyDigest',
  'repositoryIdentityDigest',
  'graphDigest',
  'graphRawSha256',
  'graphByteLength',
  'embeddedReceiptDigest',
  'counts',
  'unresolved',
  'idMapDigest',
  'toolchain',
  'executionPolicy',
  'nativeGraphCrossCheck',
  'discoveryCrossChecks',
  'limits',
  'status',
  'authorizing',
]);
const TASK_6B_NODE_KINDS = deepFreeze([
  'CLASS', 'FILE', 'FLOW', 'FUNCTION', 'GATE', 'INTERFACE', 'METHOD', 'MODULE',
  'ROUTE', 'SYMBOL', 'TYPE',
]);
const TASK_6B_RELATIONSHIP_CLASSES = deepFreeze([
  'CALLER', 'CONTRACT', 'GENERATED_CONSUMER', 'IMPORT', 'TEST',
]);
const TASK_6B_REASON_CODES = deepFreeze(sortArray(
  setValuesArray(setFromArray(UNRESOLVED_REASON_ROWS, (row) => row.reasonCode)),
  codeUnitCompare,
));
const TASK_6B_REPOSITORY_ID = /^repository:[0-9a-f]{64}$/;
const TASK_6B_NODE_ID = /^ga1:[0-9a-f]{64}$/;

function task6BShallowText(value) {
  if (typeof value !== 'string') refuse('SOURCE_ORIGIN_SCHEMA');
}

function task6BAssertDataObjectHeader(value) {
  if (
    value === null
    || typeof value !== 'object'
    || safeIsProxy(value)
    || safeArrayIsArray(value)
  ) refuse('SOURCE_ORIGIN_SCHEMA');
  const prototype = safeObjectGetPrototypeOf(value);
  if (prototype !== safeObjectPrototype && prototype !== null) refuse('SOURCE_ORIGIN_SCHEMA');
  if (safeObjectGetOwnPropertySymbols(value).length !== 0) refuse('SOURCE_ORIGIN_SCHEMA');
}

function task6BExactDataDescriptors(value, keys, names) {
  if (names.length !== keys.length) refuse('SOURCE_ORIGIN_SCHEMA');
  const descriptors = [];
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = safeObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || !safeObjectHasOwn(descriptor, 'value') || !descriptor.enumerable) {
      refuse('SOURCE_ORIGIN_SCHEMA');
    }
    append(descriptors, descriptor);
  }
  return descriptors;
}

function task6BShallowDataObject(value, keys) {
  task6BAssertDataObjectHeader(value);
  task6BExactDataDescriptors(value, keys, safeObjectGetOwnPropertyNames(value));
}

function task6BShallowArrayHeader(value, maximum, code = 'SOURCE_ORIGIN_SCHEMA') {
  if (
    value === null
    || typeof value !== 'object'
    || safeIsProxy(value)
    || !safeArrayIsArray(value)
    || safeObjectGetPrototypeOf(value) !== safeArrayPrototype
    || safeObjectGetOwnPropertySymbols(value).length !== 0
  ) refuse('SOURCE_ORIGIN_SCHEMA');
  const descriptor = safeObjectGetOwnPropertyDescriptor(value, 'length');
  if (!descriptor || !safeObjectHasOwn(descriptor, 'value') || descriptor.enumerable) {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
  if (!safeNumberIsSafeInteger(descriptor.value) || descriptor.value < 0) {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
  if (descriptor.value > maximum) refuse(code);
  return descriptor.value;
}

function task6BShallowExecutableIdentity(value) {
  task6BShallowDataObject(value, ['version','executableRawSha256','executableByteLength']);
  task6BShallowText(value.version);
  task6BShallowText(value.executableRawSha256);
  nonNegativeInteger(value.executableByteLength);
}

function task6BShallowPackageIdentity(value) {
  task6BShallowDataObject(value, [
    'name','version','packageLocator','packageRawSha256','packageByteLength',
    'entryLocator','entryRawSha256','entryByteLength',
  ]);
  forEachArray([
    'name','version','packageLocator','packageRawSha256','entryLocator','entryRawSha256',
  ], (field) => task6BShallowText(value[field]));
  nonNegativeInteger(value.packageByteLength);
  nonNegativeInteger(value.entryByteLength);
}

function task6BShallowRootedIdentity(value) {
  task6BShallowDataObject(value, ['rootLocator','locator','rawSha256','byteLength']);
  task6BShallowText(value.rootLocator);
  task6BShallowText(value.locator);
  task6BShallowText(value.rawSha256);
  nonNegativeInteger(value.byteLength);
}

function task6BValidateSidecarShallow(value) {
  forEachArray([
    'schema','repositoryId','expectedHead','expectedTree','sourceManifestDigest',
    'resolutionInputsDigest','toolchainManifestDigest','expectedParseOutcomesDigest',
    'parseOutcomesReceiptDigest','generatedConsumerPolicyDigest','parserPolicyDigest',
    'repositoryIdentityDigest','graphDigest','graphRawSha256','embeddedReceiptDigest',
    'idMapDigest','status',
  ], (field) => task6BShallowText(value[field]));
  nonNegativeInteger(value.graphByteLength);
  if (typeof value.authorizing !== 'boolean') refuse('SOURCE_ORIGIN_SCHEMA');

  task6BShallowDataObject(value.gitObservation, [
    'before','after','objectFormat','indexDigest','executionBoundary',
  ]);
  task6BShallowText(value.gitObservation.objectFormat);
  task6BShallowText(value.gitObservation.indexDigest);
  task6BShallowText(value.gitObservation.executionBoundary);
  const observationEdges = [value.gitObservation.before, value.gitObservation.after];
  for (let index = 0; index < observationEdges.length; index += 1) {
    const edge = observationEdges[index];
    task6BShallowDataObject(edge, [
      'head','tree','indexDigest','gitVersion','gitExecutableRawSha256',
      'gitExecutableByteLength',
    ]);
    forEachArray([
      'head','tree','indexDigest','gitVersion','gitExecutableRawSha256',
    ], (field) => task6BShallowText(edge[field]));
    nonNegativeInteger(edge.gitExecutableByteLength);
  }

  task6BShallowDataObject(value.sourcePolicy, [
    'policyDigest','exclusionDigest','excludedPaths','excludedBytes',
  ]);
  task6BShallowText(value.sourcePolicy.policyDigest);
  task6BShallowText(value.sourcePolicy.exclusionDigest);
  nonNegativeInteger(value.sourcePolicy.excludedPaths);
  nonNegativeInteger(value.sourcePolicy.excludedBytes);

  task6BShallowDataObject(value.counts, [
    'sourcePaths','sourceBlobs','sourceBytes','resolutionRows','resolutionBytes',
    'parseOutcomeRows','ownerBindings','representedFileNodes','nodesByKind',
    'edgesByKind','unresolvedByClass','unresolvedByReason','duplicateIds',
    'caseShadows','idMapRows',
  ]);
  forEachArray([
    'sourcePaths','sourceBlobs','sourceBytes','resolutionRows','resolutionBytes',
    'parseOutcomeRows','ownerBindings','representedFileNodes','duplicateIds',
    'caseShadows','idMapRows',
  ], (field) => nonNegativeInteger(value.counts[field]));
  task6BValidateCountMap(value.counts.nodesByKind, TASK_6B_NODE_KINDS);
  task6BValidateCountMap(value.counts.edgesByKind, TASK_6B_RELATIONSHIP_CLASSES);
  task6BValidateCountMap(value.counts.unresolvedByClass, TASK_6B_RELATIONSHIP_CLASSES);
  task6BValidateCountMap(value.counts.unresolvedByReason, TASK_6B_REASON_CODES);

  task6BShallowDataObject(value.unresolved, ['rows','rowCount','rowsDigest']);
  task6BShallowArrayHeader(
    value.unresolved.rows,
    SOURCE_ORIGIN_LIMITS.unresolvedRows,
    'SOURCE_ORIGIN_LIMIT',
  );
  nonNegativeInteger(value.unresolved.rowCount);
  task6BShallowText(value.unresolved.rowsDigest);

  task6BShallowDataObject(value.toolchain, [
    'selectedPinRecordId','selectedPinRecordDigest','pinsDigest','toolchainManifestDigest',
    'nodeIdentity','gitIdentity','typescript','sourceOriginParser','moduleClosureDigest',
    'actualLoadedSetDigest',
  ]);
  forEachArray([
    'selectedPinRecordId','selectedPinRecordDigest','pinsDigest','toolchainManifestDigest',
    'moduleClosureDigest','actualLoadedSetDigest',
  ], (field) => task6BShallowText(value.toolchain[field]));
  task6BShallowExecutableIdentity(value.toolchain.nodeIdentity);
  task6BShallowExecutableIdentity(value.toolchain.gitIdentity);
  task6BShallowPackageIdentity(value.toolchain.typescript);

  const parser = value.toolchain.sourceOriginParser;
  task6BShallowDataObject(parser, [
    'sourceEntry','project','generatedEntry','generatedPackageManifest','exportNames',
    'sourceEdgeRows','emittedEdgeRows','generatedClosureDigest',
  ]);
  task6BShallowDataObject(parser.sourceEntry, [
    'rootLocator','locator','gitBlobOid','rawSha256','byteLength','exportNames',
  ]);
  forEachArray([
    'rootLocator','locator','gitBlobOid','rawSha256',
  ], (field) => task6BShallowText(parser.sourceEntry[field]));
  nonNegativeInteger(parser.sourceEntry.byteLength);
  if (task6BShallowArrayHeader(parser.sourceEntry.exportNames, 3) !== 3) {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
  task6BShallowDataObject(parser.project, [
    'rootLocator','locator','gitBlobOid','rawSha256','byteLength','extendsLocator',
    'files','include','compilerOptions',
  ]);
  forEachArray([
    'rootLocator','locator','gitBlobOid','rawSha256','extendsLocator',
  ], (field) => task6BShallowText(parser.project[field]));
  nonNegativeInteger(parser.project.byteLength);
  if (task6BShallowArrayHeader(parser.project.files, 1) !== 1) refuse('SOURCE_ORIGIN_SCHEMA');
  if (task6BShallowArrayHeader(parser.project.include, 0) !== 0) refuse('SOURCE_ORIGIN_SCHEMA');
  task6BShallowDataObject(parser.project.compilerOptions, [
    'types','noEmitOnError','incremental','composite','sourceMap','declarationMap',
  ]);
  if (task6BShallowArrayHeader(parser.project.compilerOptions.types, 0) !== 0) {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
  forEachArray([
    'noEmitOnError','incremental','composite','sourceMap','declarationMap',
  ], (field) => {
    if (typeof parser.project.compilerOptions[field] !== 'boolean') refuse('SOURCE_ORIGIN_SCHEMA');
  });
  task6BShallowRootedIdentity(parser.generatedEntry);
  task6BShallowRootedIdentity(parser.generatedPackageManifest);
  if (task6BShallowArrayHeader(parser.exportNames, 3) !== 3) refuse('SOURCE_ORIGIN_SCHEMA');
  if (task6BShallowArrayHeader(parser.sourceEdgeRows, TOOLCHAIN_SOURCE_EDGES.length)
    !== TOOLCHAIN_SOURCE_EDGES.length) refuse('SOURCE_ORIGIN_SCHEMA');
  if (task6BShallowArrayHeader(parser.emittedEdgeRows, TOOLCHAIN_EMITTED_EDGES.length)
    !== TOOLCHAIN_EMITTED_EDGES.length) refuse('SOURCE_ORIGIN_SCHEMA');
  task6BShallowText(parser.generatedClosureDigest);

  task6BShallowDataObject(value.executionPolicy, [
    'argvPolicyDigest','environmentPolicyDigest','timeoutMillis','outputByteLimit',
    'concurrencyLimit',
  ]);
  task6BShallowText(value.executionPolicy.argvPolicyDigest);
  task6BShallowText(value.executionPolicy.environmentPolicyDigest);
  nonNegativeInteger(value.executionPolicy.timeoutMillis);
  nonNegativeInteger(value.executionPolicy.outputByteLimit);
  nonNegativeInteger(value.executionPolicy.concurrencyLimit);
  task6BShallowDataObject(value.nativeGraphCrossCheck, ['status','receiptDigest','authorizing']);
  task6BShallowText(value.nativeGraphCrossCheck.status);
  if (value.nativeGraphCrossCheck.receiptDigest !== null
    && typeof value.nativeGraphCrossCheck.receiptDigest !== 'string') refuse('SOURCE_ORIGIN_SCHEMA');
  if (typeof value.nativeGraphCrossCheck.authorizing !== 'boolean') refuse('SOURCE_ORIGIN_SCHEMA');
  if (task6BShallowArrayHeader(value.discoveryCrossChecks, 0) !== 0) {
    refuse('SOURCE_ORIGIN_SCHEMA');
  }
  const limitKeys = safeObjectKeys(SOURCE_ORIGIN_LIMITS);
  task6BShallowDataObject(value.limits, limitKeys);
  forEachArray(limitKeys, (field) => nonNegativeInteger(value.limits[field]));
}

function task6BNewCaptureWorkState() {
  const state = nullRecord();
  defineData(state, 'remaining', 2101248);
  defineData(state, 'used', 0);
  defineData(state, 'primitiveStringCodeUnitsRemaining', 83886080);
  return state;
}

function task6BConsumeCaptureWork(state, units) {
  if (state.remaining < units) refuse('SOURCE_ORIGIN_LIMIT');
  state.remaining -= units;
  state.used += units;
}

function task6BAssertCaptureWork(state, expected) {
  if (state.used !== expected) refuse('SOURCE_ORIGIN_LIMIT');
}

function task6BConsumePrimitiveStringWork(state, value) {
  const units = value.length;
  if (state.primitiveStringCodeUnitsRemaining < units) {
    refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  }
  state.primitiveStringCodeUnitsRemaining -= units;
}

function task6BClaimIdentity(value, identities) {
  if (setHas(identities, value)) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  setAdd(identities, value);
}

function task6BCaptureDataObject(value, keys, state, identities) {
  task6BAssertDataObjectHeader(value);
  task6BClaimIdentity(value, identities);
  task6BConsumeCaptureWork(state, 1);
  const names = safeObjectGetOwnPropertyNames(value);
  task6BConsumeCaptureWork(state, names.length);
  const descriptors = task6BExactDataDescriptors(value, keys, names);
  const output = plainRecord();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[index];
    task6BConsumePrimitiveStringWork(state, key);
    if (typeof descriptor.value === 'string') {
      task6BConsumePrimitiveStringWork(state, descriptor.value);
    }
    defineData(output, key, descriptor.value);
  }
  return output;
}

function task6BCaptureArray(value, maximum, exactLength, limitCode, state, identities, captureElement) {
  if (value === null || typeof value !== 'object' || safeIsProxy(value) || !safeArrayIsArray(value)) refuse('SOURCE_ORIGIN_SCHEMA');
  if (safeObjectGetPrototypeOf(value) !== safeArrayPrototype || safeObjectGetOwnPropertySymbols(value).length !== 0) refuse('SOURCE_ORIGIN_SCHEMA');
  const lengthDescriptor = safeObjectGetOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !safeObjectHasOwn(lengthDescriptor, 'value') || lengthDescriptor.enumerable) refuse('SOURCE_ORIGIN_SCHEMA');
  const length = lengthDescriptor.value;
  if (!safeNumberIsSafeInteger(length) || length < 0 || length > maximum) refuse(limitCode);
  if (exactLength !== undefined && length !== exactLength) refuse('SOURCE_ORIGIN_SCHEMA');
  task6BClaimIdentity(value, identities);
  task6BConsumeCaptureWork(state, 1);
  const names = safeObjectGetOwnPropertyNames(value);
  task6BConsumeCaptureWork(state, names.length - 1);
  if (names.length !== length + 1 || !includesArray(names, 'length')) refuse('SOURCE_ORIGIN_SCHEMA');
  const output = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = safeObjectGetOwnPropertyDescriptor(value, `${index}`);
    if (!descriptor || !safeObjectHasOwn(descriptor, 'value') || !descriptor.enumerable) refuse('SOURCE_ORIGIN_SCHEMA');
    if (typeof descriptor.value === 'string') {
      task6BConsumePrimitiveStringWork(state, descriptor.value);
    }
    append(output, captureElement(descriptor.value, index));
  }
  return output;
}

function task6BCaptureExactValues(value, expected, state, identities) {
  return task6BCaptureArray(
    value,
    expected.length,
    expected.length,
    'SOURCE_ORIGIN_SCHEMA',
    state,
    identities,
    (entry, index) => {
      if (entry !== expected[index]) refuse('SOURCE_ORIGIN_SCHEMA');
      return entry;
    },
  );
}

function task6BCaptureExactRows(value, expected, state, identities) {
  const rowKeys = ['fromLocator','kind','exportName','specifier','toLocator'];
  return task6BCaptureArray(
    value,
    expected.length,
    expected.length,
    'SOURCE_ORIGIN_SCHEMA',
    state,
    identities,
    (entry, index) => {
      const row = task6BCaptureDataObject(entry, rowKeys, state, identities);
      for (let fieldIndex = 0; fieldIndex < rowKeys.length; fieldIndex += 1) {
        const key = rowKeys[fieldIndex];
        if (row[key] !== expected[index][key]) refuse('SOURCE_ORIGIN_SCHEMA');
      }
      return row;
    },
  );
}

function task6BCaptureUnresolvedRows(value, state, identities) {
  const evidenceDigests = new SafeSet();
  let previous;
  return task6BCaptureArray(
    value,
    SOURCE_ORIGIN_LIMITS.unresolvedRows,
    undefined,
    'SOURCE_ORIGIN_LIMIT',
    state,
    identities,
    (entry) => {
      const row = task6BCaptureDataObject(entry, TASK_6B_UNRESOLVED_ROW_KEYS, state, identities);
      forEachArray(TASK_6B_UNRESOLVED_ROW_KEYS, (field) => nonEmptyString(row[field]));
      if (!regexTest(TASK_6B_NODE_ID, row.sourceNodeId)) refuse('SOURCE_ORIGIN_SCHEMA');
      canonicalLocator(row.sourceLocator);
      digest(row.evidenceOwnerDigest);
      digest(row.evidenceDigest);
      const reason = findArray(
        UNRESOLVED_REASON_ROWS,
        (candidate) => candidate.relationshipClass === row.relationshipClass && candidate.reasonCode === row.reasonCode,
      );
      if (!reason) refuse('SOURCE_ORIGIN_POLICY');
      if (previous !== undefined) {
        let compared = 0;
        for (let fieldIndex = 0; fieldIndex < TASK_6B_UNRESOLVED_ORDER_KEYS.length; fieldIndex += 1) {
          const field = TASK_6B_UNRESOLVED_ORDER_KEYS[fieldIndex];
          compared = codeUnitCompare(previous[field], row[field]);
          if (compared !== 0) break;
        }
        if (compared >= 0) refuse('SOURCE_ORIGIN_ORDER');
      }
      if (setHas(evidenceDigests, row.evidenceDigest)) refuse('SOURCE_ORIGIN_ORDER');
      setAdd(evidenceDigests, row.evidenceDigest);
      previous = row;
      return row;
    },
  );
}

function task6BCaptureChildObject(parent, key, keys, state, identities) {
  const child = task6BCaptureDataObject(parent[key], keys, state, identities);
  defineData(parent, key, child);
  return child;
}

function task6BCaptureChildExactValues(parent, key, expected, state, identities) {
  defineData(parent, key, task6BCaptureExactValues(parent[key], expected, state, identities));
}

function task6BCaptureSidecarBody(value, state) {
  const identities = new SafeSet();
  const source = task6BCaptureDataObject(value, TASK_6B_SIDECAR_BODY_KEYS, state, identities);
  task6BValidateSidecarShallow(source);

  const observation = task6BCaptureChildObject(
    source,
    'gitObservation',
    ['before','after','objectFormat','indexDigest','executionBoundary'],
    state,
    identities,
  );
  task6BCaptureChildObject(
    observation,
    'before',
    ['head','tree','indexDigest','gitVersion','gitExecutableRawSha256','gitExecutableByteLength'],
    state,
    identities,
  );
  task6BCaptureChildObject(
    observation,
    'after',
    ['head','tree','indexDigest','gitVersion','gitExecutableRawSha256','gitExecutableByteLength'],
    state,
    identities,
  );
  task6BCaptureChildObject(
    source,
    'sourcePolicy',
    ['policyDigest','exclusionDigest','excludedPaths','excludedBytes'],
    state,
    identities,
  );

  const counts = task6BCaptureChildObject(
    source,
    'counts',
    [
      'sourcePaths','sourceBlobs','sourceBytes','resolutionRows','resolutionBytes',
      'parseOutcomeRows','ownerBindings','representedFileNodes','nodesByKind',
      'edgesByKind','unresolvedByClass','unresolvedByReason','duplicateIds',
      'caseShadows','idMapRows',
    ],
    state,
    identities,
  );
  task6BCaptureChildObject(counts, 'nodesByKind', TASK_6B_NODE_KINDS, state, identities);
  task6BCaptureChildObject(counts, 'edgesByKind', TASK_6B_RELATIONSHIP_CLASSES, state, identities);
  task6BCaptureChildObject(counts, 'unresolvedByClass', TASK_6B_RELATIONSHIP_CLASSES, state, identities);
  task6BCaptureChildObject(counts, 'unresolvedByReason', TASK_6B_REASON_CODES, state, identities);

  const toolchain = task6BCaptureChildObject(
    source,
    'toolchain',
    [
      'selectedPinRecordId','selectedPinRecordDigest','pinsDigest','toolchainManifestDigest',
      'nodeIdentity','gitIdentity','typescript','sourceOriginParser','moduleClosureDigest',
      'actualLoadedSetDigest',
    ],
    state,
    identities,
  );
  task6BCaptureChildObject(
    toolchain,
    'nodeIdentity',
    ['version','executableRawSha256','executableByteLength'],
    state,
    identities,
  );
  task6BCaptureChildObject(
    toolchain,
    'gitIdentity',
    ['version','executableRawSha256','executableByteLength'],
    state,
    identities,
  );
  task6BCaptureChildObject(
    toolchain,
    'typescript',
    [
      'name','version','packageLocator','packageRawSha256','packageByteLength',
      'entryLocator','entryRawSha256','entryByteLength',
    ],
    state,
    identities,
  );
  const parser = task6BCaptureChildObject(
    toolchain,
    'sourceOriginParser',
    [
      'sourceEntry','project','generatedEntry','generatedPackageManifest','exportNames',
      'sourceEdgeRows','emittedEdgeRows','generatedClosureDigest',
    ],
    state,
    identities,
  );
  const sourceEntry = task6BCaptureChildObject(
    parser,
    'sourceEntry',
    ['rootLocator','locator','gitBlobOid','rawSha256','byteLength','exportNames'],
    state,
    identities,
  );
  task6BCaptureChildExactValues(
    sourceEntry,
    'exportNames',
    TOOLCHAIN_PARSER_EXPORTS,
    state,
    identities,
  );
  const project = task6BCaptureChildObject(
    parser,
    'project',
    [
      'rootLocator','locator','gitBlobOid','rawSha256','byteLength','extendsLocator',
      'files','include','compilerOptions',
    ],
    state,
    identities,
  );
  task6BCaptureChildExactValues(
    project,
    'files',
    ['src/source-origin-parser-entry.ts'],
    state,
    identities,
  );
  task6BCaptureChildExactValues(project, 'include', [], state, identities);
  const compilerOptions = task6BCaptureChildObject(
    project,
    'compilerOptions',
    ['types','noEmitOnError','incremental','composite','sourceMap','declarationMap'],
    state,
    identities,
  );
  task6BCaptureChildExactValues(compilerOptions, 'types', [], state, identities);
  task6BCaptureChildObject(
    parser,
    'generatedEntry',
    ['rootLocator','locator','rawSha256','byteLength'],
    state,
    identities,
  );
  task6BCaptureChildObject(
    parser,
    'generatedPackageManifest',
    ['rootLocator','locator','rawSha256','byteLength'],
    state,
    identities,
  );
  task6BCaptureChildExactValues(parser, 'exportNames', TOOLCHAIN_PARSER_EXPORTS, state, identities);
  defineData(
    parser,
    'sourceEdgeRows',
    task6BCaptureExactRows(parser.sourceEdgeRows, TOOLCHAIN_SOURCE_EDGES, state, identities),
  );
  defineData(
    parser,
    'emittedEdgeRows',
    task6BCaptureExactRows(parser.emittedEdgeRows, TOOLCHAIN_EMITTED_EDGES, state, identities),
  );

  task6BCaptureChildObject(
    source,
    'executionPolicy',
    ['argvPolicyDigest','environmentPolicyDigest','timeoutMillis','outputByteLimit','concurrencyLimit'],
    state,
    identities,
  );
  task6BCaptureChildObject(
    source,
    'nativeGraphCrossCheck',
    ['status','receiptDigest','authorizing'],
    state,
    identities,
  );
  task6BCaptureChildExactValues(source, 'discoveryCrossChecks', [], state, identities);
  task6BCaptureChildObject(source, 'limits', safeObjectKeys(SOURCE_ORIGIN_LIMITS), state, identities);

  const unresolved = task6BCaptureChildObject(
    source,
    'unresolved',
    ['rows','rowCount','rowsDigest'],
    state,
    identities,
  );
  defineData(unresolved, 'rows', task6BCaptureUnresolvedRows(unresolved.rows, state, identities));
  task6BAssertCaptureWork(state, 8 * unresolved.rows.length + 294);
  return source;
}

function task6BDomainTextDigest(domain, text) {
  return hashParts([encodeUtf8(domain), new SafeUint8Array(1), encodeUtf8(text)]);
}

function task6BEvidenceBody(row) {
  const body = plainRecord();
  for (let index = 0; index < TASK_6B_UNRESOLVED_ROW_KEYS.length; index += 1) {
    const key = TASK_6B_UNRESOLVED_ROW_KEYS[index];
    if (key !== 'evidenceDigest') defineData(body, key, row[key]);
  }
  return body;
}

function task6BValidateOid(value, objectFormat) {
  if (typeof value !== 'string' || !regexTest(objectFormat === 'sha1' ? HEX40 : HEX64, value)) refuse('SOURCE_ORIGIN_SCHEMA');
}

function task6BValidateObservationEdge(value, objectFormat, expectedHead, expectedTree, expectedIndexDigest) {
  dataObject(value, [
    'head','tree','indexDigest','gitVersion','gitExecutableRawSha256','gitExecutableByteLength',
  ]);
  task6BValidateOid(value.head, objectFormat);
  task6BValidateOid(value.tree, objectFormat);
  digest(value.indexDigest);
  nonEmptyString(value.gitVersion);
  digest(value.gitExecutableRawSha256);
  nonNegativeInteger(value.gitExecutableByteLength);
  if (
    value.head !== expectedHead
    || value.tree !== expectedTree
    || value.indexDigest !== expectedIndexDigest
    || value.gitExecutableByteLength === 0
  ) refuse('SOURCE_ORIGIN_POLICY');
}

function task6BValidateCountMap(value, keys) {
  task6BShallowDataObject(value, keys);
  for (let index = 0; index < keys.length; index += 1) nonNegativeInteger(value[keys[index]]);
}

function task6BValidateToolchainBinding(value, manifestDigest) {
  dataObject(value, [
    'selectedPinRecordId','selectedPinRecordDigest','pinsDigest','toolchainManifestDigest',
    'nodeIdentity','gitIdentity','typescript','sourceOriginParser','moduleClosureDigest',
    'actualLoadedSetDigest',
  ]);
  nonEmptyString(value.selectedPinRecordId);
  forEachArray([
    'selectedPinRecordDigest','pinsDigest','toolchainManifestDigest','moduleClosureDigest',
    'actualLoadedSetDigest',
  ], (field) => digest(value[field]));
  validateExecutableIdentity(value.nodeIdentity);
  validateExecutableIdentity(value.gitIdentity);
  validatePackageIdentity(value.typescript);
  validateSourceOriginParser(value.sourceOriginParser);
  if (value.toolchainManifestDigest !== manifestDigest) refuse('SOURCE_ORIGIN_DIGEST');
}

function task6BValidateGitObservationBridge(value) {
  const before = value.gitObservation.before;
  const after = value.gitObservation.after;
  const gitIdentity = value.toolchain.gitIdentity;
  const expectedVersion = `git version ${gitIdentity.version}`;
  if (
    before.gitVersion !== after.gitVersion
    || before.gitExecutableRawSha256 !== after.gitExecutableRawSha256
    || before.gitExecutableByteLength !== after.gitExecutableByteLength
    || before.gitVersion !== expectedVersion
    || before.gitExecutableRawSha256 !== gitIdentity.executableRawSha256
    || before.gitExecutableByteLength !== gitIdentity.executableByteLength
  ) refuse('SOURCE_ORIGIN_POLICY');
}

function task6BValidateSidecarBody(value) {
  if (
    value.schema !== 'galerina.logic-aig-export-receipt.v1'
    || value.status !== 'COMPLETE'
    || value.authorizing !== false
    || !regexTest(TASK_6B_REPOSITORY_ID, value.repositoryId)
  ) refuse('SOURCE_ORIGIN_POLICY');
  const objectFormat = value.gitObservation.objectFormat;
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') refuse('SOURCE_ORIGIN_SCHEMA');
  task6BValidateOid(value.expectedHead, objectFormat);
  task6BValidateOid(value.expectedTree, objectFormat);
  dataObject(value.gitObservation, ['before','after','objectFormat','indexDigest','executionBoundary']);
  digest(value.gitObservation.indexDigest);
  if (value.gitObservation.executionBoundary !== 'COOPERATIVE_LOCAL_SAME_USER') refuse('SOURCE_ORIGIN_POLICY');
  task6BValidateObservationEdge(
    value.gitObservation.before,
    objectFormat,
    value.expectedHead,
    value.expectedTree,
    value.gitObservation.indexDigest,
  );
  task6BValidateObservationEdge(
    value.gitObservation.after,
    objectFormat,
    value.expectedHead,
    value.expectedTree,
    value.gitObservation.indexDigest,
  );
  dataObject(value.sourcePolicy, ['policyDigest','exclusionDigest','excludedPaths','excludedBytes']);
  digest(value.sourcePolicy.policyDigest);
  digest(value.sourcePolicy.exclusionDigest);
  nonNegativeInteger(value.sourcePolicy.excludedPaths);
  nonNegativeInteger(value.sourcePolicy.excludedBytes);
  if (value.sourcePolicy.excludedBytes !== 0) refuse('SOURCE_ORIGIN_POLICY');
  forEachArray([
    'sourceManifestDigest','resolutionInputsDigest','toolchainManifestDigest',
    'expectedParseOutcomesDigest','parseOutcomesReceiptDigest',
    'generatedConsumerPolicyDigest','parserPolicyDigest','repositoryIdentityDigest',
    'graphDigest','graphRawSha256','embeddedReceiptDigest','idMapDigest',
  ], (field) => digest(value[field]));
  if (value.repositoryId !== `repository:${value.repositoryIdentityDigest}`) refuse('SOURCE_ORIGIN_POLICY');
  nonNegativeInteger(value.graphByteLength);

  dataObject(value.counts, [
    'sourcePaths','sourceBlobs','sourceBytes','resolutionRows','resolutionBytes',
    'parseOutcomeRows','ownerBindings','representedFileNodes','nodesByKind',
    'edgesByKind','unresolvedByClass','unresolvedByReason','duplicateIds',
    'caseShadows','idMapRows',
  ]);
  forEachArray([
    'sourcePaths','sourceBlobs','sourceBytes','resolutionRows','resolutionBytes',
    'parseOutcomeRows','ownerBindings','representedFileNodes','duplicateIds',
    'caseShadows','idMapRows',
  ], (field) => nonNegativeInteger(value.counts[field]));
  task6BValidateCountMap(value.counts.nodesByKind, TASK_6B_NODE_KINDS);
  task6BValidateCountMap(value.counts.edgesByKind, TASK_6B_RELATIONSHIP_CLASSES);
  task6BValidateCountMap(value.counts.unresolvedByClass, TASK_6B_RELATIONSHIP_CLASSES);
  task6BValidateCountMap(value.counts.unresolvedByReason, TASK_6B_REASON_CODES);
  if (
    value.counts.duplicateIds !== 0
    || value.counts.caseShadows !== 0
    || value.counts.idMapRows !== reduceArray(TASK_6B_NODE_KINDS, (sum, key) => sum + value.counts.nodesByKind[key], 0)
    || value.counts.representedFileNodes > value.counts.nodesByKind.FILE
  ) refuse('SOURCE_ORIGIN_POLICY');

  nonNegativeInteger(value.unresolved.rowCount);
  digest(value.unresolved.rowsDigest);
  if (value.unresolved.rowCount !== value.unresolved.rows.length) refuse('SOURCE_ORIGIN_POLICY');
  const byClass = nullRecord();
  const byReason = nullRecord();
  forEachArray(TASK_6B_RELATIONSHIP_CLASSES, (key) => defineData(byClass, key, 0));
  forEachArray(TASK_6B_REASON_CODES, (key) => defineData(byReason, key, 0));
  for (let index = 0; index < value.unresolved.rows.length; index += 1) {
    const row = value.unresolved.rows[index];
    byClass[row.relationshipClass] += 1;
    byReason[row.reasonCode] += 1;
  }
  for (let index = 0; index < TASK_6B_RELATIONSHIP_CLASSES.length; index += 1) {
    const key = TASK_6B_RELATIONSHIP_CLASSES[index];
    if (value.counts.unresolvedByClass[key] !== byClass[key]) refuse('SOURCE_ORIGIN_POLICY');
  }
  for (let index = 0; index < TASK_6B_REASON_CODES.length; index += 1) {
    const key = TASK_6B_REASON_CODES[index];
    if (value.counts.unresolvedByReason[key] !== byReason[key]) refuse('SOURCE_ORIGIN_POLICY');
  }

  task6BValidateToolchainBinding(value.toolchain, value.toolchainManifestDigest);
  task6BValidateGitObservationBridge(value);
  dataObject(value.executionPolicy, [
    'argvPolicyDigest','environmentPolicyDigest','timeoutMillis','outputByteLimit',
    'concurrencyLimit',
  ]);
  digest(value.executionPolicy.argvPolicyDigest);
  digest(value.executionPolicy.environmentPolicyDigest);
  nonNegativeInteger(value.executionPolicy.timeoutMillis);
  nonNegativeInteger(value.executionPolicy.outputByteLimit);
  nonNegativeInteger(value.executionPolicy.concurrencyLimit);
  if (
    value.executionPolicy.timeoutMillis !== SOURCE_ORIGIN_LIMITS.processMillis
    || value.executionPolicy.outputByteLimit !== SOURCE_ORIGIN_LIMITS.processOutputBytes
    || value.executionPolicy.concurrencyLimit !== 1
  ) refuse('SOURCE_ORIGIN_POLICY');
  dataObject(value.nativeGraphCrossCheck, ['status','receiptDigest','authorizing']);
  if (
    value.nativeGraphCrossCheck.status !== 'UNAVAILABLE'
    || value.nativeGraphCrossCheck.receiptDigest !== null
    || value.nativeGraphCrossCheck.authorizing !== false
  ) refuse('SOURCE_ORIGIN_POLICY');
  array(value.discoveryCrossChecks);
  if (value.discoveryCrossChecks.length !== 0) refuse('SOURCE_ORIGIN_POLICY');
  equalExact(value.limits, SOURCE_ORIGIN_LIMITS);
}

function canonicalTask6BJsonText(value) {
  const text = serializeCanonical(canonicalValue(value, new SafeSet()));
  if (text === undefined) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  const bytes = encodeUtf8(text);
  if (callIntrinsic(safeTypedArrayByteLength, bytes, []) > 83886080) refuse('SOURCE_ORIGIN_JSON_CANONICAL');
  return text;
}

export function sha256CompleteUnresolvedRowsV1(unresolvedRows) {
  if (arguments.length !== 1) refuse('SOURCE_ORIGIN_SCHEMA');
  const work = task6BNewCaptureWorkState();
  const rows = task6BCaptureUnresolvedRows(unresolvedRows, work, new SafeSet());
  task6BAssertCaptureWork(work, 1 + 8 * rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const evidenceText = canonicalTask6BJsonText(task6BEvidenceBody(row));
    const expected = task6BDomainTextDigest('galerina.logic-aig-unresolved-evidence.v1', evidenceText);
    if (row.evidenceDigest !== expected) refuse('SOURCE_ORIGIN_DIGEST');
  }
  const rowsText = canonicalTask6BJsonText(rows);
  return task6BDomainTextDigest('galerina.logic-aig-unresolved-rows.v1', rowsText);
}

export function serializeCompleteExportSidecarV1(sidecarBody) {
  if (arguments.length !== 1) refuse('SOURCE_ORIGIN_SCHEMA');
  const work = task6BNewCaptureWorkState();
  const body = task6BCaptureSidecarBody(sidecarBody, work);
  for (let index = 0; index < body.unresolved.rows.length; index += 1) {
    const row = body.unresolved.rows[index];
    const evidenceText = canonicalTask6BJsonText(task6BEvidenceBody(row));
    const expected = task6BDomainTextDigest('galerina.logic-aig-unresolved-evidence.v1', evidenceText);
    if (row.evidenceDigest !== expected) refuse('SOURCE_ORIGIN_DIGEST');
  }
  const rowsText = canonicalTask6BJsonText(body.unresolved.rows);
  const rowsDigest = task6BDomainTextDigest('galerina.logic-aig-unresolved-rows.v1', rowsText);
  if (body.unresolved.rowsDigest !== rowsDigest) refuse('SOURCE_ORIGIN_DIGEST');
  task6BValidateSidecarBody(body);
  const bodyText = canonicalTask6BJsonText(body);
  const sidecarDigest = task6BDomainTextDigest('galerina.logic-aig-export-receipt.v1', bodyText);
  const complete = plainRecord();
  for (let index = 0; index < TASK_6B_SIDECAR_BODY_KEYS.length; index += 1) {
    const key = TASK_6B_SIDECAR_BODY_KEYS[index];
    defineData(complete, key, body[key]);
  }
  defineData(complete, 'sidecarDigest', sidecarDigest);
  const completeText = canonicalTask6BJsonText(complete);
  return callIntrinsic(safeBufferFrom, NodeBuffer, [completeText, 'utf8']);
}
