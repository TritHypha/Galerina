import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  Stats,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { isProxy } from 'node:util/types';

import {
  SOURCE_ORIGIN_LIMITS,
  canonicalJsonText,
  classifySourcePath,
  decodeUtf8Bytes,
  sha256Canonical,
  validateParserPolicy,
  validateRepositoryIdentity,
  validateResolutionInputs,
  validateResolutionPolicy,
  validateSourceManifest,
  validateSourcePolicy,
  validateToolchainPins,
} from './contract.mjs';
import { admitFrozenBlobSet } from './git-source.mjs';
import { prepareSemanticToolchain } from './toolchain-snapshot.mjs';

const SPAWN_SYNC = spawnSync;
const CREATE_HASH = createHash;
const FS_LSTAT_SYNC = lstatSync;
const FS_MKDIR_SYNC = mkdirSync;
const FS_MKDTEMP_SYNC = mkdtempSync;
const FS_READ_FILE_SYNC = readFileSync;
const FS_REALPATH_SYNC_NATIVE = realpathSync.native;
const FS_RM_SYNC = rmSync;
const FS_WRITE_FILE_SYNC = writeFileSync;
const OS_TMPDIR = tmpdir;
const PROCESS_VERSION = process.version;
const PROCESS_EXEC_PATH = process.execPath;
const PROCESS_PLATFORM = process.platform;
const PROCESS_SYSTEM_ROOT = process.env.SystemRoot;
const UTIL_TYPES_IS_PROXY = isProxy;
const PATH_DIRNAME = path.dirname;
const PATH_JOIN = path.join;
const REFLECT_APPLY = Reflect.apply;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_OWN_PROPERTY_NAMES = Object.getOwnPropertyNames;
const OBJECT_GET_OWN_PROPERTY_SYMBOLS = Object.getOwnPropertySymbols;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const JSON_PARSE = JSON.parse;
const SAFE_SET = Set;
const SET_ADD = Set.prototype.add;
const SET_HAS = Set.prototype.has;
const SET_SIZE = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(Set.prototype, 'size').get;
const SAFE_MAP = Map;
const MAP_GET = Map.prototype.get;
const MAP_HAS = Map.prototype.has;
const MAP_SET = Map.prototype.set;
const MAP_VALUES = Map.prototype.values;
const MAP_SIZE = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(Map.prototype, 'size').get;
const MAP_ITERATOR_NEXT = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_GET_PROTOTYPE_OF(REFLECT_APPLY(MAP_VALUES, new SAFE_MAP(), [])), 'next').value;
const SAFE_REGEXP = RegExp;
const REGEXP_EXEC = RegExp.prototype.exec;
const TEXT_ENCODER = new TextEncoder();
const TEXT_ENCODER_ENCODE = TextEncoder.prototype.encode;
const UINT8_ARRAY_PROTOTYPE = Uint8Array.prototype;
const BUFFER_PROTOTYPE = Buffer.prototype;
const ARRAY_BUFFER_PROTOTYPE = ArrayBuffer.prototype;
const TYPED_ARRAY_PROTOTYPE = OBJECT_GET_PROTOTYPE_OF(UINT8_ARRAY_PROTOTYPE);
const TYPED_ARRAY_PARENT = OBJECT_GET_PROTOTYPE_OF(TYPED_ARRAY_PROTOTYPE);
const TYPED_ARRAY_BUFFER_DESCRIPTOR = OBJECT_FREEZE(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'buffer'));
const TYPED_ARRAY_BYTE_LENGTH_DESCRIPTOR = OBJECT_FREEZE(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'byteLength'));
const TYPED_ARRAY_BYTE_OFFSET_DESCRIPTOR = OBJECT_FREEZE(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'byteOffset'));
const TYPED_ARRAY_LENGTH_DESCRIPTOR = OBJECT_FREEZE(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'length'));
const ARRAY_BUFFER_BYTE_LENGTH_DESCRIPTOR = OBJECT_FREEZE(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(ARRAY_BUFFER_PROTOTYPE, 'byteLength'));
const TYPED_ARRAY_LENGTH = TYPED_ARRAY_LENGTH_DESCRIPTOR.get;
const STRING_FROM_CHAR_CODE = String.fromCharCode;
const NUMBER_TO_STRING = Number.prototype.toString;
const STRING_PAD_START = String.prototype.padStart;
const STRING_NORMALIZE = String.prototype.normalize;
const STRING_TO_UPPER_CASE = String.prototype.toUpperCase;
const STRING_LAST_INDEX_OF = String.prototype.lastIndexOf;
const STRING_SLICE = String.prototype.slice;
const STRING_SPLIT = String.prototype.split;
const STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const STATS_IS_FILE = Stats.prototype.isFile;
const STATS_IS_SYMBOLIC_LINK = Stats.prototype.isSymbolicLink;
const SAFE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_HAS = WeakSet.prototype.has;
const HOST_REFUSALS = new SAFE_WEAK_SET();
const HASH_PROBE = CREATE_HASH('sha256');
let HASH_PROTOTYPE = OBJECT_GET_PROTOTYPE_OF(HASH_PROBE);
while (HASH_PROTOTYPE !== null && !OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(HASH_PROTOTYPE, 'update')) HASH_PROTOTYPE = OBJECT_GET_PROTOTYPE_OF(HASH_PROTOTYPE);
const HASH_UPDATE = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(HASH_PROTOTYPE, 'update').value;
const HASH_DIGEST = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(HASH_PROTOTYPE, 'digest').value;

function trustedNodeByteHash(bytes) {
  const hash = CREATE_HASH('sha256');
  REFLECT_APPLY(HASH_UPDATE, hash, [bytes]);
  return REFLECT_APPLY(HASH_DIGEST, hash, ['hex']);
}

function defineData(target, key, value) {
  const descriptor = OBJECT_CREATE(null);
  descriptor.configurable = true;
  descriptor.enumerable = true;
  descriptor.value = value;
  descriptor.writable = true;
  OBJECT_DEFINE_PROPERTY(target, key, descriptor);
}

function frozenNullRecord(values) {
  const record = OBJECT_CREATE(null);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(values);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(values, name);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) refuse('SOURCE_ORIGIN_HOST_SCHEMA');
    defineData(record, name, descriptor.value);
  }
  return OBJECT_FREEZE(record);
}

const FS_LSTAT_OPTIONS = frozenNullRecord({ bigint: true });
const FS_MKDIR_OPTIONS = frozenNullRecord({ recursive: true });
const FS_WRITE_OPTIONS = frozenNullRecord({ flag: 'wx', mode: 0o600 });
const FS_RM_OPTIONS = frozenNullRecord({ recursive: true, force: true });

function accessorDescriptorMatches(current, expected) {
  return current !== undefined
    && OBJECT_HAS_OWN(current, 'get')
    && OBJECT_HAS_OWN(current, 'set')
    && OBJECT_HAS_OWN(current, 'configurable')
    && OBJECT_HAS_OWN(current, 'enumerable')
    && current.get === expected.get
    && current.set === expected.set
    && current.configurable === expected.configurable
    && current.enumerable === expected.enumerable;
}

const NATIVE_RESULT_FIELDS = OBJECT_FREEZE(['errno', 'error', 'status', 'signal', 'output', 'pid', 'stdout', 'stderr']);

function assertNativeEffectClosure(code) {
  const names = ['buffer', 'byteLength', 'byteOffset', 'length'];
  if (
    OBJECT_GET_PROTOTYPE_OF(BUFFER_PROTOTYPE) !== UINT8_ARRAY_PROTOTYPE
    || OBJECT_GET_PROTOTYPE_OF(UINT8_ARRAY_PROTOTYPE) !== TYPED_ARRAY_PROTOTYPE
    || OBJECT_GET_PROTOTYPE_OF(TYPED_ARRAY_PROTOTYPE) !== TYPED_ARRAY_PARENT
    || OBJECT_GET_PROTOTYPE_OF(ARRAY_BUFFER_PROTOTYPE) !== OBJECT_PROTOTYPE
    || !accessorDescriptorMatches(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'buffer'), TYPED_ARRAY_BUFFER_DESCRIPTOR)
    || !accessorDescriptorMatches(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'byteLength'), TYPED_ARRAY_BYTE_LENGTH_DESCRIPTOR)
    || !accessorDescriptorMatches(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'byteOffset'), TYPED_ARRAY_BYTE_OFFSET_DESCRIPTOR)
    || !accessorDescriptorMatches(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'length'), TYPED_ARRAY_LENGTH_DESCRIPTOR)
    || !accessorDescriptorMatches(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(ARRAY_BUFFER_PROTOTYPE, 'byteLength'), ARRAY_BUFFER_BYTE_LENGTH_DESCRIPTOR)
    || arraySome(names, (name) => OBJECT_HAS_OWN(BUFFER_PROTOTYPE, name) || OBJECT_HAS_OWN(UINT8_ARRAY_PROTOTYPE, name))
    || arraySome(NATIVE_RESULT_FIELDS, (name) => OBJECT_HAS_OWN(OBJECT_PROTOTYPE, name))
  ) refuse(code);
}

function assertChildProcessClosure(code) {
  assertNativeEffectClosure(code);
}

function ownDataValue(value, name, required, code) {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, name);
  if (!descriptor) {
    if (required) refuse(code);
    return undefined;
  }
  if (!OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  return descriptor.value;
}

function captureSpawnResult(value) {
  const code = 'SOURCE_ORIGIN_HOST_CHILD';
  if (value === null || typeof value !== 'object' || UTIL_TYPES_IS_PROXY(value) ||
      OBJECT_GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  return frozenNullRecord({
    error: ownDataValue(value, 'error', false, code),
    signal: ownDataValue(value, 'signal', true, code),
    status: ownDataValue(value, 'status', true, code),
    stderr: ownDataValue(value, 'stderr', true, code),
    stdout: ownDataValue(value, 'stdout', true, code),
  });
}

function append(values, value) { defineData(values, `${values.length}`, value); }
function arrayCopy(values) { const output = []; for (let index = 0; index < values.length; index += 1) append(output, values[index]); return output; }
function arrayMap(values, operation) { const output = []; for (let index = 0; index < values.length; index += 1) append(output, operation(values[index], index)); return output; }
function arrayFilter(values, predicate) { const output = []; for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) append(output, values[index]); return output; }
function arrayFind(values, predicate) { for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) return values[index]; return undefined; }
function arraySome(values, predicate) { for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) return true; return false; }
function arrayIndexOf(values, sought) { for (let index = 0; index < values.length; index += 1) if (values[index] === sought) return index; return -1; }
function sortArray(values, compare = compareCodeUnits) { return REFLECT_APPLY(ARRAY_SORT, values, [compare]); }
function stringLastIndexOf(value, part) { return REFLECT_APPLY(STRING_LAST_INDEX_OF, value, [part]); }
function stringSlice(value, start, end) { return REFLECT_APPLY(STRING_SLICE, value, end === undefined ? [start] : [start, end]); }
function stringSplit(value, separator) { return REFLECT_APPLY(STRING_SPLIT, value, [separator]); }
function stringToLowerCase(value) { return REFLECT_APPLY(STRING_TO_LOWER_CASE, value, []); }
function regexpTest(pattern, value) {
  const firstDescriptor = OBJECT_CREATE(null);
  firstDescriptor.value = 0;
  OBJECT_DEFINE_PROPERTY(pattern, 'lastIndex', firstDescriptor);
  try {
    return REFLECT_APPLY(REGEXP_EXEC, pattern, [value]) !== null;
  } finally {
    const finalDescriptor = OBJECT_CREATE(null);
    finalDescriptor.value = 0;
    OBJECT_DEFINE_PROPERTY(pattern, 'lastIndex', finalDescriptor);
  }
}
function setAdd(values, value) { REFLECT_APPLY(SET_ADD, values, [value]); }
function setHas(values, value) { return REFLECT_APPLY(SET_HAS, values, [value]); }
function setSize(values) { return REFLECT_APPLY(SET_SIZE, values, []); }
function setFromArray(values, project = (value) => value) { const output = new SAFE_SET(); for (let index = 0; index < values.length; index += 1) setAdd(output, project(values[index], index)); return output; }
function uniqueArray(values) { const seen = new SAFE_SET(); const output = []; for (let index = 0; index < values.length; index += 1) if (!setHas(seen, values[index])) { setAdd(seen, values[index]); append(output, values[index]); } return output; }
function mapGet(values, key) { return REFLECT_APPLY(MAP_GET, values, [key]); }
function mapHas(values, key) { return REFLECT_APPLY(MAP_HAS, values, [key]); }
function mapSet(values, key, value) { REFLECT_APPLY(MAP_SET, values, [key, value]); }
function mapValuesArray(values) { const output = []; const iterator = REFLECT_APPLY(MAP_VALUES, values, []); while (true) { const step = REFLECT_APPLY(MAP_ITERATOR_NEXT, iterator, []); if (step.done) return output; append(output, step.value); } }
function mapFromArray(values, key, project = (value) => value) { const output = new SAFE_MAP(); for (let index = 0; index < values.length; index += 1) mapSet(output, key(values[index], index), project(values[index], index)); return output; }
function pathJoinLocator(root, locator) { const components = stringSplit(locator, '/'); const args = [root]; for (let index = 0; index < components.length; index += 1) append(args, components[index]); return REFLECT_APPLY(PATH_JOIN, null, args); }
function refusalAdd(value) { REFLECT_APPLY(WEAK_SET_ADD, HOST_REFUSALS, [value]); }
function refusalHas(value) { return value !== null && typeof value === 'object' && REFLECT_APPLY(WEAK_SET_HAS, HOST_REFUSALS, [value]); }

const NODE_ID = /^ga1:[0-9a-f]{64}$/;
const HOST_OPTION_KEYS = OBJECT_FREEZE([
  'repositoryIdentity', 'sourcePolicy', 'resolutionPolicy', 'parserPolicy',
  'pins', 'sourceManifest', 'sourceBlobs', 'resolutionInputs',
  'resolutionBlobs', 'toolchainBlobs', 'platform', 'arch', 'nodeIdentity',
  'gitIdentity',
]);
const SEMANTIC_ROW_OPTION_KEYS = OBJECT_FREEZE([
  'repositoryId', 'parserId', 'sourceRows', 'parseResults',
  'declarations', 'relations', 'parserPolicy', 'resolutionPolicy',
]);
const NODE_KINDS = new Set([
  'CLASS', 'FILE', 'FLOW', 'FUNCTION', 'GATE', 'INTERFACE', 'METHOD',
  'MODULE', 'ROUTE', 'SYMBOL', 'TYPE',
]);
const RELATIONSHIP_KINDS = new Set([
  'CALLER', 'CONTRACT', 'GENERATED_CONSUMER', 'IMPORT', 'TEST',
]);
const TARGET_STATES = new Set(['AMBIGUOUS', 'DYNAMIC', 'MISSING', 'OUTSIDE', 'RESOLVED']);

class HostDecoderRefusal extends Error {
  constructor(code) {
    super(code);
    defineData(this, 'name', 'HostDecoderRefusal');
    defineData(this, 'code', code);
    refusalAdd(this);
  }
}

function refuse(code) {
  throw new HostDecoderRefusal(code);
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactObject(value, keys, code = 'SOURCE_ORIGIN_HOST_SCHEMA') {
  if (UTIL_TYPES_IS_PROXY(value) || value === null || typeof value !== 'object' || ARRAY_IS_ARRAY(value)) refuse(code);
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  if (prototype !== OBJECT_PROTOTYPE && prototype !== null || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, names[index]);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  }
  const sorted = REFLECT_APPLY(ARRAY_SORT, names, [compareCodeUnits]);
  const expected = sortArray(arrayCopy(keys));
  if (sorted.length !== expected.length || arraySome(sorted, (name, index) => name !== expected[index])) refuse(code);
}

function exactArray(value, code = 'SOURCE_ORIGIN_HOST_SCHEMA') {
  if (UTIL_TYPES_IS_PROXY(value) || !ARRAY_IS_ARRAY(value) || OBJECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  if (names.length !== value.length + 1 || !arraySome(names, (name) => name === 'length')) refuse(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, `${index}`);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  }
  return value;
}

function deepFreeze(value, seen = new SAFE_SET()) {
  if (value === null || typeof value !== 'object' || REFLECT_APPLY(SET_HAS, seen, [value])) return value;
  REFLECT_APPLY(SET_ADD, seen, [value]);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, names[index]);
    if (descriptor && OBJECT_HAS_OWN(descriptor, 'value')) deepFreeze(descriptor.value, seen);
  }
  return OBJECT_FREEZE(value);
}

function decodeUtf8(bytes, code = 'SOURCE_ORIGIN_HOST_SOURCE') {
  try {
    return decodeUtf8Bytes(bytes);
  } catch {
    refuse(code);
  }
}

function sourcePathFromLocator(locator) {
  const split = stringLastIndexOf(locator, '#');
  return split === -1 ? locator : stringSlice(locator, 0, split);
}

function isTestPath(locator, resolutionPolicy) {
  const components = stringSplit(locator, '/');
  if (arraySome(components, (component) => arraySome(resolutionPolicy.testPathComponents, (candidate) => candidate === component))) return true;
  const basename = components[components.length - 1];
  return regexpTest(new SAFE_REGEXP(resolutionPolicy.testBasenamePattern), basename);
}

function byteCompareIdentity(left, right) {
  return left.byteLength === right.byteLength && left.rawSha256 === right.rawSha256;
}

function authenticateNodeExecutable(nodeIdentity) {
  if (PROCESS_VERSION !== nodeIdentity.version) refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
  let details;
  let canonical;
  let bytes;
  try {
    assertNativeEffectClosure('SOURCE_ORIGIN_HOST_TOOLCHAIN');
    details = FS_LSTAT_SYNC(PROCESS_EXEC_PATH, FS_LSTAT_OPTIONS);
    assertNativeEffectClosure('SOURCE_ORIGIN_HOST_TOOLCHAIN');
    canonical = FS_REALPATH_SYNC_NATIVE(PROCESS_EXEC_PATH);
    assertNativeEffectClosure('SOURCE_ORIGIN_HOST_TOOLCHAIN');
    bytes = FS_READ_FILE_SYNC(PROCESS_EXEC_PATH);
  } catch {
    refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
  }
  const samePath = PROCESS_PLATFORM === 'win32'
    ? stringToLowerCase(canonical) === stringToLowerCase(PROCESS_EXEC_PATH)
    : canonical === PROCESS_EXEC_PATH;
  if (
    REFLECT_APPLY(STATS_IS_SYMBOLIC_LINK, details, [])
    || !REFLECT_APPLY(STATS_IS_FILE, details, [])
    || !samePath
    || bytes.length !== nodeIdentity.executableByteLength
    || trustedNodeByteHash(bytes) !== nodeIdentity.executableRawSha256
  ) refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
}

function hostChildMain() {
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const path = require('node:path');
  const Module = require('node:module');

  class GuardRefusal extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  const fail = (code) => { throw new GuardRefusal(code); };
  const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  const samePath = (left, right) => process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
  const canonicalBuiltin = new Map();
  for (const name of Module.builtinModules) {
    const canonical = name.startsWith('node:') ? name : `node:${name}`;
    canonicalBuiltin.set(name, canonical);
    canonicalBuiltin.set(canonical, canonical);
  }

  let config;
  try { config = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exitCode = 2; return; }
  const root = path.resolve(config.root);
  const entry = path.resolve(root, ...config.entryLocator.split('/'));
  const admittedRows = new Map(config.allowedRows.map((row) => [row.locator, row]));
  const admittedBuiltins = new Set(config.allowedBuiltins);
  const loadedModules = new Set();
  const loadedBuiltins = new Set();

  const locatorFor = (filename) => {
    const absolute = path.resolve(filename);
    const relative = path.relative(root, absolute);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('LOAD');
    return relative.split(path.sep).join('/');
  };
  const readExact = (filename) => {
    const locator = locatorFor(filename);
    const expected = admittedRows.get(locator);
    if (!expected || !locator.endsWith('.js')) fail('LOAD');
    let details;
    let canonical;
    let bytes;
    try {
      details = fs.lstatSync(filename, { bigint: true });
      canonical = fs.realpathSync.native(filename);
      bytes = fs.readFileSync(filename);
    } catch { fail('LOAD'); }
    if (
      details.isSymbolicLink()
      || !details.isFile()
      || details.nlink !== 1n
      || !samePath(canonical, path.resolve(filename))
      || bytes.length !== expected.byteLength
      || hash(bytes) !== expected.rawSha256
    ) fail('LOAD');
    loadedModules.add(locator);
    return bytes;
  };
  const originalLoad = Module._load;
  Module._load = function guardedLoad(request, parent, isMain) {
    if (typeof request !== 'string') fail('LOAD');
    const builtin = canonicalBuiltin.get(request);
    if (builtin) {
      if (!admittedBuiltins.has(builtin)) fail('LOAD');
      loadedBuiltins.add(builtin);
      return originalLoad.call(this, request, parent, isMain);
    }
    let filename;
    if (path.isAbsolute(request)) {
      if (parent !== null || !isMain || !samePath(path.resolve(request), entry)) fail('LOAD');
      filename = entry;
    } else if ((request.startsWith('./') || request.startsWith('../')) && request.endsWith('.js') && parent && typeof parent.filename === 'string') {
      filename = path.resolve(path.dirname(parent.filename), request);
    } else fail('LOAD');
    if (!admittedRows.has(locatorFor(filename))) fail('LOAD');
    return originalLoad.call(this, filename, parent, isMain);
  };
  Module._extensions['.js'] = function guardedJavaScript(module, filename) {
    const bytes = readExact(filename);
    module._compile(new TextDecoder('utf-8', { fatal: true }).decode(bytes), filename);
  };
  process.chdir = () => fail('LOAD');

  const byteOffset = (text, offset) => Buffer.byteLength(text.slice(0, offset), 'utf8');
  const resolveSpecifier = (sourcePaths, importer, specifier) => {
    if (canonicalBuiltin.has(specifier) || specifier.startsWith('node:')) return { state: 'OUTSIDE', paths: [] };
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return { state: 'OUTSIDE', paths: [] };
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
    if (base === '..' || base.startsWith('../') || base.startsWith('/')) return { state: 'MISSING', paths: [] };
    const candidates = [];
    const add = (candidate) => { if (sourcePaths.has(candidate) && !candidates.includes(candidate)) candidates.push(candidate); };
    add(base);
    const sourceSuffixes = ['.cjs', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'];
    if (/\.(?:c|m)?js$/u.test(base)) {
      const stem = base.replace(/\.(?:c|m)?js$/u, '');
      for (const suffix of sourceSuffixes) add(stem + suffix);
    } else {
      for (const suffix of sourceSuffixes) add(base + suffix);
      for (const suffix of sourceSuffixes) add(`${base}/index${suffix}`);
    }
    candidates.sort(compare);
    return candidates.length === 1
      ? { state: 'RESOLVED', paths: candidates }
      : candidates.length > 1
        ? { state: 'AMBIGUOUS', paths: candidates }
        : { state: 'MISSING', paths: [] };
  };

  const runHost = (ts) => {
    const virtualRoot = '/__galerina_source_origin__';
    const sourceEntries = config.sources.map((row) => [row.path, row.text]);
    const sourceTexts = new Map(sourceEntries);
    const sourcePaths = new Set(sourceEntries.map(([locator]) => locator));
    const virtualByPath = new Map(sourceEntries.map(([locator]) => [locator, `${virtualRoot}/${locator}`]));
    const pathByVirtual = new Map([...virtualByPath].map(([locator, virtual]) => [virtual, locator]));
    const sourceFiles = new Map();
    for (const [locator, text] of sourceEntries) {
      const virtual = virtualByPath.get(locator);
      const scriptKind = typeof ts.getScriptKindFromFileName === 'function'
        ? ts.getScriptKindFromFileName(locator)
        : undefined;
      sourceFiles.set(virtual, ts.createSourceFile(virtual, text, ts.ScriptTarget.Latest, true, scriptKind));
    }
    const compilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      noLib: true,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
    };
    const resolveVirtual = (specifier, containingVirtual) => {
      const importer = pathByVirtual.get(containingVirtual);
      if (!importer) return undefined;
      const resolution = resolveSpecifier(sourcePaths, importer, specifier);
      if (resolution.state !== 'RESOLVED') return undefined;
      const resolved = resolution.paths[0];
      const resolvedFileName = virtualByPath.get(resolved);
      return { resolvedFileName, extension: ts.Extension?.Ts ?? '.ts', isExternalLibraryImport: false };
    };
    const host = {
      getSourceFile(fileName) { return sourceFiles.get(fileName); },
      getDefaultLibFileName() { return `${virtualRoot}/__no_lib__.d.ts`; },
      writeFile() { fail('HOST'); },
      getCurrentDirectory() { return virtualRoot; },
      getDirectories() { return []; },
      fileExists(fileName) { return sourceFiles.has(fileName); },
      readFile(fileName) { return sourceTexts.get(pathByVirtual.get(fileName)); },
      directoryExists(directory) { return directory === virtualRoot || [...sourceFiles.keys()].some((fileName) => fileName.startsWith(`${directory}/`)); },
      getCanonicalFileName(fileName) { return fileName; },
      useCaseSensitiveFileNames() { return true; },
      getNewLine() { return '\n'; },
      realpath(fileName) { return fileName; },
      resolveModuleNames(moduleNames, containingFile) { return moduleNames.map((specifier) => resolveVirtual(specifier, containingFile)); },
    };
    const program = ts.createProgram({ rootNames: [...sourceFiles.keys()], options: compilerOptions, host });
    const checker = program.getTypeChecker();
    const declarations = [];
    const declarationKey = new Map();

    const declarationKind = (node) => {
      if (ts.isModuleDeclaration(node)) return 'MODULE';
      if (ts.isClassDeclaration(node)) return 'CLASS';
      if (ts.isInterfaceDeclaration(node)) return 'INTERFACE';
      if (ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) return 'TYPE';
      if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return 'METHOD';
      if (ts.isFunctionDeclaration(node)) return 'FUNCTION';
      if (ts.isVariableDeclaration(node)) {
        const container = node.parent?.parent?.parent;
        if (ts.isSourceFile(container) || ts.isModuleBlock(container)) return 'SYMBOL';
      }
      return null;
    };
    const declarationName = (node) => {
      const name = node.name;
      if (!name) return null;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return String(name.text);
      return null;
    };
    for (const [locator, text] of sourceEntries) {
      const sourceFile = sourceFiles.get(virtualByPath.get(locator));
      let preorder = 0;
      const stack = [];
      const visit = (node) => {
        const ordinal = preorder++;
        const kind = declarationKind(node);
        let key = null;
        if (kind !== null) {
          let start;
          let end;
          try { start = node.getStart(sourceFile, false); end = node.getEnd(); } catch { start = node.pos; end = node.end; }
          key = `${locator}\u0000${ordinal}`;
          declarationKey.set(node, key);
          declarations.push({
            key,
            path: locator,
            parentKey: stack.at(-1) ?? null,
            kind,
            name: declarationName(node),
            parserNodeKind: ts.SyntaxKind[node.kind] ?? String(node.kind),
            startByte: byteOffset(text, Math.max(0, start)),
            endByte: byteOffset(text, Math.max(start, end)),
            preorderOrdinal: ordinal,
          });
          stack.push(key);
        }
        ts.forEachChild(node, visit);
        if (key !== null) stack.pop();
      };
      visit(sourceFile);
    }
    const relationOwnerKey = (node) => {
      for (let current = node.parent; current; current = current.parent) {
        const key = declarationKey.get(current);
        if (key) return key;
      }
      return null;
    };
    const targetKeys = (node) => {
      let symbol;
      try { symbol = checker.getSymbolAtLocation(node); } catch { return { keys: [], outside: false }; }
      if (!symbol) return { keys: [], outside: false };
      if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
        try { symbol = checker.getAliasedSymbol(symbol); } catch { /* retain alias */ }
      }
      const keys = [];
      let outside = false;
      for (const declaration of symbol.declarations ?? []) {
        const key = declarationKey.get(declaration);
        if (key) keys.push(key);
        else outside = true;
      }
      keys.sort(compare);
      return { keys: [...new Set(keys)], outside };
    };
    const relations = [];
    const relationSpan = (node, sourceFile, text) => {
      let start;
      let end;
      try { start = node.getStart(sourceFile, false); end = node.getEnd(); } catch { start = node.pos; end = node.end; }
      return { startByte: byteOffset(text, Math.max(0, start)), endByte: byteOffset(text, Math.max(start + 1, end)) };
    };
    for (const [locator, text] of sourceEntries) {
      const sourceFile = sourceFiles.get(virtualByPath.get(locator));
      const visit = (node) => {
        const ownerNativeKey = relationOwnerKey(node);
        const span = relationSpan(node, sourceFile, text);
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const resolution = resolveSpecifier(sourcePaths, locator, node.moduleSpecifier.text);
          relations.push({ path: locator, ownerNativeKey, relationshipClass: 'IMPORT', ...span, targetNativeKeys: [], targetPaths: resolution.paths, targetState: resolution.state });
        } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
          if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            relations.push({ path: locator, ownerNativeKey, relationshipClass: 'IMPORT', ...span, targetNativeKeys: [], targetPaths: [], targetState: 'DYNAMIC' });
          } else {
            const target = targetKeys(ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression);
            const targetState = target.keys.length === 1 ? 'RESOLVED' : target.keys.length > 1 ? 'AMBIGUOUS' : target.outside ? 'OUTSIDE' : ts.isIdentifier(node.expression) ? 'MISSING' : 'DYNAMIC';
            relations.push({ path: locator, ownerNativeKey, relationshipClass: 'CALLER', ...span, targetNativeKeys: target.keys, targetPaths: [], targetState });
          }
        } else if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
          const targetNode = ts.isTypeReferenceNode(node) ? node.typeName : node.expression;
          const target = targetKeys(targetNode);
          const targetState = target.keys.length === 1 ? 'RESOLVED' : target.keys.length > 1 ? 'AMBIGUOUS' : target.outside ? 'OUTSIDE' : 'MISSING';
          relations.push({ path: locator, ownerNativeKey, relationshipClass: 'CONTRACT', ...span, targetNativeKeys: target.keys, targetPaths: [], targetState });
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    const diagnostics = [];
    const diagnosticShape = (diagnostic, active = new Set()) => {
      if (!diagnostic || active.has(diagnostic)) fail('HOST');
      active.add(diagnostic);
      const relatedInformation = (diagnostic.relatedInformation ?? []).map((row) => diagnosticShape(row, active));
      active.delete(diagnostic);
      return { code: diagnostic.code, category: diagnostic.category, relatedInformation };
    };
    for (const [locator] of sourceEntries) {
      const sourceFile = sourceFiles.get(virtualByPath.get(locator));
      let rows;
      try { rows = program.getSyntacticDiagnostics(sourceFile).map((row) => diagnosticShape(row)); } catch { fail('HOST'); }
      diagnostics.push({ path: locator, diagnostics: rows });
    }
    return { declarations, relations, diagnostics };
  };

  const compactSemantic = (semantic) => {
    const sourceIndexByPath = new Map(config.sources.map((row, index) => [row.path, index]));
    const declarationIndexByKey = new Map(semantic.declarations.map((row, index) => [row.key, index]));
    const requiredIndex = (values, key) => {
      const index = values.get(key);
      if (!Number.isSafeInteger(index)) fail('HOST');
      return index;
    };
    return {
      declarations: semantic.declarations.map((row) => [
        requiredIndex(sourceIndexByPath, row.path),
        row.parentKey === null ? null : requiredIndex(declarationIndexByKey, row.parentKey),
        row.kind,
        row.name,
        row.parserNodeKind,
        row.startByte,
        row.endByte,
        row.preorderOrdinal,
      ]),
      relations: semantic.relations.map((row) => [
        requiredIndex(sourceIndexByPath, row.path),
        row.ownerNativeKey === null ? null : requiredIndex(declarationIndexByKey, row.ownerNativeKey),
        row.relationshipClass,
        row.startByte,
        row.endByte,
        row.targetNativeKeys.map((key) => requiredIndex(declarationIndexByKey, key)),
        row.targetPaths.map((sourcePath) => requiredIndex(sourceIndexByPath, sourcePath)),
        row.targetState,
      ]),
      diagnostics: semantic.diagnostics.map((row) => [
        requiredIndex(sourceIndexByPath, row.path),
        row.diagnostics,
      ]),
    };
  };

  try {
    if (!samePath(process.cwd(), root)) fail('LOAD');
    const ts = Module._load(entry, null, true);
    for (const name of ['createProgram', 'createSourceFile']) if (typeof ts?.[name] !== 'function') fail('HOST');
    const semantic = runHost(ts);
    const moduleLocators = [...loadedModules].sort(compare);
    const builtinModules = [...loadedBuiltins].sort(compare);
    const expectedModules = config.allowedRows.map((row) => row.locator).sort(compare);
    const expectedBuiltins = [...config.allowedBuiltins].sort(compare);
    if (JSON.stringify(moduleLocators) !== JSON.stringify(expectedModules) || JSON.stringify(builtinModules) !== JSON.stringify(expectedBuiltins)) fail('LOAD');
    process.stdout.write(JSON.stringify({ moduleLocators, builtinModules, semantic: compactSemantic(semantic) }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ refusal: error instanceof GuardRefusal ? error.code : 'CHILD' }));
    process.exitCode = 2;
  }
}

const HOST_CHILD_SOURCE = `(${hostChildMain.toString()})()`;

function childEnvironment() {
  const environment = OBJECT_CREATE(null);
  defineData(environment, 'NODE_DISABLE_COMPILE_CACHE', '1');
  if (PROCESS_PLATFORM === 'win32' && typeof PROCESS_SYSTEM_ROOT === 'string') defineData(environment, 'SystemRoot', PROCESS_SYSTEM_ROOT);
  return OBJECT_FREEZE(environment);
}

function runHostChild(selection, entryBytes, sources) {
  let root;
  let result;
  let failure;
  try {
    assertNativeEffectClosure('SOURCE_ORIGIN_HOST_CHILD');
    root = FS_MKDTEMP_SYNC(PATH_JOIN(OS_TMPDIR(), 'galerina-source-origin-host-'));
    const entryPath = pathJoinLocator(root, selection.entry.locator);
    assertNativeEffectClosure('SOURCE_ORIGIN_HOST_CHILD');
    FS_MKDIR_SYNC(PATH_DIRNAME(entryPath), FS_MKDIR_OPTIONS);
    assertNativeEffectClosure('SOURCE_ORIGIN_HOST_CHILD');
    FS_WRITE_FILE_SYNC(entryPath, entryBytes, FS_WRITE_OPTIONS);
    assertNativeEffectClosure('SOURCE_ORIGIN_HOST_CHILD');
    const readback = FS_READ_FILE_SYNC(entryPath);
    const entryIdentity = arrayFind(selection.moduleRows, (row) => row.locator === selection.entry.locator);
    if (!entryIdentity || !byteCompareIdentity(entryIdentity, { byteLength: readback.length, rawSha256: trustedNodeByteHash(readback) })) refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
    const config = {
      root,
      entryLocator: selection.entry.locator,
      allowedRows: selection.moduleRows,
      allowedBuiltins: selection.builtinModules,
      sources,
    };
    const input = canonicalJsonText(config);
    if (REFLECT_APPLY(TYPED_ARRAY_LENGTH, REFLECT_APPLY(TEXT_ENCODER_ENCODE, TEXT_ENCODER, [input]), []) > SOURCE_ORIGIN_LIMITS.jsonBytes) refuse('SOURCE_ORIGIN_LIMIT');
    const argv = OBJECT_FREEZE(['--no-warnings', '--input-type=commonjs', '--eval', HOST_CHILD_SOURCE]);
    const stdio = OBJECT_FREEZE(['pipe', 'pipe', 'pipe']);
    const childOptions = OBJECT_CREATE(null);
    defineData(childOptions, 'cwd', root);
    defineData(childOptions, 'env', childEnvironment());
    defineData(childOptions, 'input', input);
    defineData(childOptions, 'encoding', 'utf8');
    defineData(childOptions, 'stdio', stdio);
    defineData(childOptions, 'timeout', SOURCE_ORIGIN_LIMITS.processMillis);
    defineData(childOptions, 'maxBuffer', SOURCE_ORIGIN_LIMITS.processOutputBytes);
    defineData(childOptions, 'windowsHide', true);
    OBJECT_FREEZE(childOptions);
    assertChildProcessClosure('SOURCE_ORIGIN_HOST_CHILD');
    result = SPAWN_SYNC(PROCESS_EXEC_PATH, argv, childOptions);
  } catch (error) {
    failure = error;
  }
  if (root !== undefined) {
    try {
      assertNativeEffectClosure('SOURCE_ORIGIN_HOST_CLEANUP');
      FS_RM_SYNC(root, FS_RM_OPTIONS);
    } catch { refuse('SOURCE_ORIGIN_HOST_CLEANUP'); }
  }
  if (failure) {
    if (refusalHas(failure)) throw failure;
    refuse('SOURCE_ORIGIN_HOST_CHILD');
  }
  const childResult = captureSpawnResult(result);
  if (childResult.error || childResult.signal !== null || childResult.stderr !== '' || childResult.status !== 0 || typeof childResult.stdout !== 'string' ||
      REFLECT_APPLY(TYPED_ARRAY_LENGTH, REFLECT_APPLY(TEXT_ENCODER_ENCODE, TEXT_ENCODER, [childResult.stdout]), []) > SOURCE_ORIGIN_LIMITS.processOutputBytes) refuse('SOURCE_ORIGIN_HOST_CHILD');
  let parsed;
  try { parsed = REFLECT_APPLY(JSON_PARSE, null, [childResult.stdout]); } catch { refuse('SOURCE_ORIGIN_HOST_CHILD'); }
  const parsedRefusal = parsed !== null && typeof parsed === 'object' && !UTIL_TYPES_IS_PROXY(parsed)
    ? ownDataValue(parsed, 'refusal', false, 'SOURCE_ORIGIN_HOST_CHILD')
    : undefined;
  if (parsedRefusal) refuse(parsedRefusal === 'LOAD' ? 'SOURCE_ORIGIN_HOST_TOOLCHAIN' : 'SOURCE_ORIGIN_HOST_CHILD');
  exactObject(parsed, ['moduleLocators','builtinModules','semantic'], 'SOURCE_ORIGIN_HOST_CHILD');
  return parsed;
}

function canonicalTypeScriptDiagnostic(row, mapping, related = false) {
  exactObject(row, ['code','category','relatedInformation'], 'SOURCE_ORIGIN_HOST_DIAGNOSTIC');
  if (!NUMBER_IS_SAFE_INTEGER(row.code) || row.code < mapping.minimumCode || row.code > mapping.maximumCode) refuse('SOURCE_ORIGIN_HOST_DIAGNOSTIC');
  if (!NUMBER_IS_SAFE_INTEGER(row.category)) refuse('SOURCE_ORIGIN_HOST_DIAGNOSTIC');
  const category = arrayFind(mapping.categoryRows, (candidate) => candidate.typescriptCategory === row.category);
  if (!category) refuse('SOURCE_ORIGIN_HOST_DIAGNOSTIC');
  exactArray(row.relatedInformation, 'SOURCE_ORIGIN_HOST_DIAGNOSTIC');
  for (let index = 0; index < row.relatedInformation.length; index += 1) canonicalTypeScriptDiagnostic(row.relatedInformation[index], mapping, true);
  if (related || category.codeSetAction === 'EXCLUDE') return null;
  if (category.codeSetAction !== 'INCLUDE') refuse('SOURCE_ORIGIN_HOST_DIAGNOSTIC');
  const digits = REFLECT_APPLY(STRING_PAD_START, `${row.code}`, [mapping.minimumDigits, '0']);
  return `${mapping.prefix}${digits}`;
}

function mappedDiagnostics(rows, parserPolicy) {
  exactArray(rows, 'SOURCE_ORIGIN_HOST_DIAGNOSTIC');
  const codes = [];
  for (let index = 0; index < rows.length; index += 1) {
    const code = canonicalTypeScriptDiagnostic(rows[index], parserPolicy.typescriptDiagnosticMapping);
    if (code !== null) append(codes, code);
  }
  return sortArray(uniqueArray(codes));
}

function escapeName(name) {
  if (typeof name !== 'string' || !name || name !== REFLECT_APPLY(STRING_NORMALIZE, name, ['NFC'])) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  let output = '';
  const bytes = REFLECT_APPLY(TEXT_ENCODER_ENCODE, TEXT_ENCODER, [name]);
  const length = REFLECT_APPLY(TYPED_ARRAY_LENGTH, bytes, []);
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index];
    const character = STRING_FROM_CHAR_CODE(byte);
    const allowed = byte >= 0x41 && byte <= 0x5a || byte >= 0x61 && byte <= 0x7a || byte >= 0x30 && byte <= 0x39 || byte === 0x5f || byte === 0x2e || byte === 0x24 || byte === 0x2d;
    output += allowed
      ? character
      : `%${REFLECT_APPLY(STRING_PAD_START, REFLECT_APPLY(STRING_TO_UPPER_CASE, REFLECT_APPLY(NUMBER_TO_STRING, byte, [16]), []), [2, '0'])}`;
  }
  return output;
}

function nodeId(repositoryId, kind, locator) {
  if (!setHas(NODE_KINDS, kind)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  return `ga1:${sha256Canonical('galerina.logic-aig-node-id.v1', { repositoryId, kind, locator })}`;
}

function idMapRow(parserId, parserNodeKind, startByte, endByte, preorderOrdinal, node, sourceRow) {
  const body = {
    nativeIdentity: { parserId, parserNodeKind, startByte, endByte, preorderOrdinal },
    nodeId: node.id,
    kind: node.kind,
    locator: node.locator,
    sourceBlobOid: sourceRow.blobOid,
    sourceRawSha256: sourceRow.rawSha256,
  };
  return { ...body, rowDigest: sha256Canonical('galerina.logic-aig-id-map-row.v1', body) };
}

function compareIdMapRows(left, right) {
  const topFields = ['nodeId'];
  for (let index = 0; index < topFields.length; index += 1) {
    const field = topFields[index];
    const compared = compareCodeUnits(left[field], right[field]);
    if (compared !== 0) return compared;
  }
  const parserFields = ['parserId','parserNodeKind'];
  for (let index = 0; index < parserFields.length; index += 1) {
    const field = parserFields[index];
    const compared = compareCodeUnits(left.nativeIdentity[field], right.nativeIdentity[field]);
    if (compared !== 0) return compared;
  }
  const positionFields = ['startByte','endByte','preorderOrdinal'];
  for (let index = 0; index < positionFields.length; index += 1) {
    const field = positionFields[index];
    if (left.nativeIdentity[field] !== right.nativeIdentity[field]) return left.nativeIdentity[field] - right.nativeIdentity[field];
  }
  return 0;
}

function addEdge(edges, evidence, relationshipKind, sourceNodeId, targetNodeId) {
  if (!setHas(RELATIONSHIP_KINDS, relationshipKind) || !regexpTest(NODE_ID, sourceNodeId) || !regexpTest(NODE_ID, targetNodeId)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  const evidenceBody = {
    schema: 'galerina.logic-aig-edge-evidence.v1',
    relationshipKind,
    sourceNodeId,
    targetNodeId,
    evidenceLocation: evidence,
    authorizing: false,
  };
  const evidenceDigest = sha256Canonical(evidenceBody.schema, evidenceBody);
  const identity = { relationshipKind, sourceNodeId, targetNodeId, evidenceDigest };
  append(edges, {
    id: `ga1:${sha256Canonical('galerina.logic-aig-edge-id.v1', identity)}`,
    kind: relationshipKind,
    from: sourceNodeId,
    to: targetNodeId,
    digest: evidenceDigest,
  });
}

function addUnresolved(unresolved, parserPolicy, relation, sourceNode, sourceRow, candidateNodeIds) {
  let reasonCode;
  let candidateState;
  if (relation.targetState === 'AMBIGUOUS') {
    if (candidateNodeIds.length < 2) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    reasonCode = 'AMBIGUOUS_TARGET'; candidateState = 'EXACT_SET';
  } else if (relation.targetState === 'DYNAMIC') {
    reasonCode = 'DYNAMIC_TARGET'; candidateState = candidateNodeIds.length > 0 ? 'EXACT_SET' : 'UNKNOWN';
  } else if (relation.targetState === 'OUTSIDE') {
    reasonCode = 'TARGET_OUTSIDE_SOURCE_DOMAIN'; candidateState = 'UNKNOWN'; candidateNodeIds = [];
  } else {
    reasonCode = 'MISSING_TARGET'; candidateState = 'UNKNOWN'; candidateNodeIds = [];
  }
  candidateNodeIds = sortArray(uniqueArray(candidateNodeIds));
  const policyRow = arrayFind(parserPolicy.unresolvedReasonRows, (row) => row.relationshipClass === relation.relationshipClass && row.reasonCode === reasonCode);
  if (!policyRow || !arraySome(policyRow.permittedCandidateStates, (state) => state === candidateState)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  const ownerBody = {
    schema: 'galerina.logic-aig-unresolved-relation-owner.v1',
    sourceNodeId: sourceNode.id,
    sourceLocator: sourceNode.locator,
    relationshipClass: relation.relationshipClass,
    reasonCode,
    sourceBinding: {
      sourceBlobOid: sourceRow.blobOid,
      sourceRawSha256: sourceRow.rawSha256,
      startByte: relation.startByte,
      endByte: relation.endByte,
    },
    candidateState,
    candidateNodeIds,
    authorizing: false,
  };
  const evidenceOwnerDigest = sha256Canonical(ownerBody.schema, ownerBody);
  const evidenceBody = {
    sourceNodeId: sourceNode.id,
    sourceLocator: sourceNode.locator,
    relationshipClass: relation.relationshipClass,
    reasonCode,
    evidenceOwnerDigest,
  };
  append(unresolved, { ...evidenceBody, evidenceDigest: sha256Canonical('galerina.logic-aig-unresolved-evidence.v1', evidenceBody) });
}

function semanticText(value) {
  if (typeof value !== 'string' || value.length === 0) refuse('SOURCE_ORIGIN_HOST_SCHEMA');
  return value;
}

function semanticNullableText(value) {
  if (value === null) return value;
  return semanticText(value);
}

function semanticInteger(value) {
  if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) refuse('SOURCE_ORIGIN_HOST_SCHEMA');
  return value;
}

function semanticTextArray(value) {
  exactArray(value, 'SOURCE_ORIGIN_HOST_SCHEMA');
  for (let index = 0; index < value.length; index += 1) semanticText(value[index]);
  return value;
}

function validateSemanticRowClosure(value) {
  if (!arraySome(value.parserPolicy.parserIds, (parserId) => parserId === value.parserId)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  const sourceByPath = new SAFE_MAP();
  for (let index = 0; index < value.sourceRows.length; index += 1) {
    const row = value.sourceRows[index];
    if (mapHas(sourceByPath, row.path)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    mapSet(sourceByPath, row.path, row);
  }
  const parseByPath = new SAFE_MAP();
  const diagnosticPattern = new SAFE_REGEXP(value.parserPolicy.diagnosticCodePattern, 'u');
  for (let rowIndex = 0; rowIndex < value.parseResults.length; rowIndex += 1) {
    const row = value.parseResults[rowIndex];
    if (!mapHas(sourceByPath, row.path) || mapHas(parseByPath, row.path)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    let previous;
    for (let codeIndex = 0; codeIndex < row.diagnosticCodes.length; codeIndex += 1) {
      const code = row.diagnosticCodes[codeIndex];
      if (!regexpTest(diagnosticPattern, code) || (previous !== undefined && compareCodeUnits(previous, code) >= 0)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
      previous = code;
    }
    if (row.status === 'PARSED' && row.diagnosticCodes.length !== 0) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    mapSet(parseByPath, row.path, row);
  }
  if (REFLECT_APPLY(MAP_SIZE, parseByPath, []) !== REFLECT_APPLY(MAP_SIZE, sourceByPath, [])) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');

  const declarationByKey = new SAFE_MAP();
  const ordinals = new SAFE_SET();
  for (let rowIndex = 0; rowIndex < value.declarations.length; rowIndex += 1) {
    const row = value.declarations[rowIndex];
    const sourceRow = mapGet(sourceByPath, row.path);
    if (
      !sourceRow
      || mapGet(parseByPath, row.path)?.status !== 'PARSED'
      || mapHas(declarationByKey, row.key)
      || !setHas(NODE_KINDS, row.kind)
      || row.endByte <= row.startByte
      || row.endByte > sourceRow.byteLength
    ) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    const ordinalKey = `${row.path}\u0000${row.preorderOrdinal}`;
    if (setHas(ordinals, ordinalKey)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    setAdd(ordinals, ordinalKey);
    mapSet(declarationByKey, row.key, row);
  }
  for (let rowIndex = 0; rowIndex < value.declarations.length; rowIndex += 1) {
    const row = value.declarations[rowIndex];
    if (row.parentKey === null) continue;
    const parent = mapGet(declarationByKey, row.parentKey);
    if (!parent || parent.path !== row.path || parent.preorderOrdinal >= row.preorderOrdinal) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  }
  const parentStates = new SAFE_MAP();
  for (let rowIndex = 0; rowIndex < value.declarations.length; rowIndex += 1) {
    const row = value.declarations[rowIndex];
    if (mapGet(parentStates, row.key) === 'DONE') continue;
    const chain = [];
    let current = row;
    while (current !== null && mapGet(parentStates, current.key) === undefined) {
      mapSet(parentStates, current.key, 'VISITING');
      append(chain, current);
      current = current.parentKey === null ? null : mapGet(declarationByKey, current.parentKey);
    }
    if (current !== null && mapGet(parentStates, current.key) === 'VISITING') refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    for (let chainIndex = 0; chainIndex < chain.length; chainIndex += 1) mapSet(parentStates, chain[chainIndex].key, 'DONE');
  }

  for (let rowIndex = 0; rowIndex < value.relations.length; rowIndex += 1) {
    const row = value.relations[rowIndex];
    const sourceRow = mapGet(sourceByPath, row.path);
    const owner = row.ownerNativeKey === null ? null : mapGet(declarationByKey, row.ownerNativeKey);
    if (
      !sourceRow
      || mapGet(parseByPath, row.path)?.status !== 'PARSED'
      || (row.ownerNativeKey !== null && (!owner || owner.path !== row.path))
      || !setHas(RELATIONSHIP_KINDS, row.relationshipClass)
      || row.relationshipClass === 'TEST'
      || row.relationshipClass === 'GENERATED_CONSUMER'
      || row.endByte <= row.startByte
      || row.endByte > sourceRow.byteLength
      || !setHas(TARGET_STATES, row.targetState)
      || setSize(setFromArray(row.targetNativeKeys)) !== row.targetNativeKeys.length
      || setSize(setFromArray(row.targetPaths)) !== row.targetPaths.length
      || arraySome(row.targetNativeKeys, (key) => !mapHas(declarationByKey, key))
      || arraySome(row.targetPaths, (path) => !mapHas(sourceByPath, path))
    ) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    const targetCount = row.targetNativeKeys.length + row.targetPaths.length;
    if (
      (row.targetState === 'RESOLVED' && targetCount !== 1)
      || (row.targetState === 'AMBIGUOUS' && targetCount < 2)
      || ((row.targetState === 'MISSING' || row.targetState === 'OUTSIDE') && targetCount !== 0)
    ) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  }
}

function validateCapturedSemanticRows(captured) {
  exactObject(captured, SEMANTIC_ROW_OPTION_KEYS, 'SOURCE_ORIGIN_HOST_SCHEMA');
  semanticText(captured.repositoryId);
  semanticText(captured.parserId);
  exactArray(captured.sourceRows, 'SOURCE_ORIGIN_HOST_SCHEMA');
  exactArray(captured.parseResults, 'SOURCE_ORIGIN_HOST_SCHEMA');
  exactArray(captured.declarations, 'SOURCE_ORIGIN_HOST_SCHEMA');
  exactArray(captured.relations, 'SOURCE_ORIGIN_HOST_SCHEMA');
  for (let index = 0; index < captured.sourceRows.length; index += 1) {
    const row = captured.sourceRows[index];
    exactObject(row, ['path','mode','blobOid','objectFormat','byteLength','rawSha256'], 'SOURCE_ORIGIN_HOST_SCHEMA');
    semanticText(row.path);
    if (row.mode !== '100644' && row.mode !== '100755') refuse('SOURCE_ORIGIN_HOST_SCHEMA');
    if (row.objectFormat !== 'sha1' && row.objectFormat !== 'sha256') refuse('SOURCE_ORIGIN_HOST_SCHEMA');
    if (!regexpTest(row.objectFormat === 'sha1' ? /^[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/, row.blobOid)) refuse('SOURCE_ORIGIN_HOST_SCHEMA');
    semanticInteger(row.byteLength);
    if (!regexpTest(/^[0-9a-f]{64}$/, row.rawSha256)) refuse('SOURCE_ORIGIN_HOST_SCHEMA');
  }
  for (let index = 0; index < captured.parseResults.length; index += 1) {
    const row = captured.parseResults[index];
    exactObject(row, ['path','status','diagnosticCodes'], 'SOURCE_ORIGIN_HOST_SCHEMA');
    semanticText(row.path);
    if (row.status !== 'PARSED' && row.status !== 'REFUSED') refuse('SOURCE_ORIGIN_HOST_SCHEMA');
    semanticTextArray(row.diagnosticCodes);
  }
  for (let index = 0; index < captured.declarations.length; index += 1) {
    const row = captured.declarations[index];
    exactObject(row, ['key','path','parentKey','kind','name','parserNodeKind','startByte','endByte','preorderOrdinal'], 'SOURCE_ORIGIN_HOST_SCHEMA');
    semanticText(row.key); semanticText(row.path); semanticNullableText(row.parentKey);
    semanticText(row.kind); semanticNullableText(row.name); semanticText(row.parserNodeKind);
    semanticInteger(row.startByte); semanticInteger(row.endByte); semanticInteger(row.preorderOrdinal);
  }
  for (let index = 0; index < captured.relations.length; index += 1) {
    const row = captured.relations[index];
    exactObject(row, ['path','ownerNativeKey','relationshipClass','startByte','endByte','targetNativeKeys','targetPaths','targetState'], 'SOURCE_ORIGIN_HOST_SCHEMA');
    semanticText(row.path); semanticNullableText(row.ownerNativeKey); semanticText(row.relationshipClass);
    semanticInteger(row.startByte); semanticInteger(row.endByte);
    semanticTextArray(row.targetNativeKeys); semanticTextArray(row.targetPaths); semanticText(row.targetState);
  }
  try {
    captured.parserPolicy = validateParserPolicy(captured.parserPolicy);
    captured.resolutionPolicy = validateResolutionPolicy(captured.resolutionPolicy);
  } catch {
    refuse('SOURCE_ORIGIN_HOST_SCHEMA');
  }
  validateSemanticRowClosure(captured);
  return captured;
}

function captureSemanticRowsOptions(options) {
  exactObject(options, SEMANTIC_ROW_OPTION_KEYS, 'SOURCE_ORIGIN_HOST_SCHEMA');
  let captured;
  try {
    captured = REFLECT_APPLY(JSON_PARSE, null, [canonicalJsonText(options)]);
  } catch {
    refuse('SOURCE_ORIGIN_HOST_SCHEMA');
  }
  return validateCapturedSemanticRows(captured);
}

function buildCapturedSemanticRows(options) {
  const {
    repositoryId, parserId, sourceRows, parseResults, declarations, relations,
    parserPolicy, resolutionPolicy,
  } = options;
  const sourceByPath = mapFromArray(sourceRows, (row) => row.path);
  const parseByPath = mapFromArray(parseResults, (row) => row.path);
  const nodes = [];
  const idMapRows = [];
  const fileNodeByPath = new SAFE_MAP();
  for (let sourceIndex = 0; sourceIndex < sourceRows.length; sourceIndex += 1) {
    const sourceRow = sourceRows[sourceIndex];
    const result = mapGet(parseByPath, sourceRow.path);
    if (!result) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    const node = {
      id: nodeId(repositoryId, 'FILE', sourceRow.path),
      kind: 'FILE',
      locator: sourceRow.path,
      digest: sourceRow.rawSha256,
    };
    append(nodes, node); mapSet(fileNodeByPath, sourceRow.path, node);
    append(idMapRows, idMapRow(
      parserId,
      result.status === 'PARSED' ? 'SourceFile' : 'OWNER_DISPOSITION_FILE',
      0,
      sourceRow.byteLength,
      0,
      node,
      sourceRow,
    ));
  }

  const admittedDeclarations = declarations;
  const byKey = mapFromArray(admittedDeclarations, (row) => row.key);
  if (REFLECT_APPLY(MAP_SIZE, byKey, []) !== admittedDeclarations.length) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  const frameByKey = new SAFE_MAP();
  const baseFrameByKey = new SAFE_MAP();
  const siblingGroups = new SAFE_MAP();
  for (let index = 0; index < admittedDeclarations.length; index += 1) {
    const row = admittedDeclarations[index];
    const groupKey = `${row.path}\u0000${row.parentKey ?? ''}\u0000${row.kind}\u0000${row.name ?? ''}`;
    const group = mapGet(siblingGroups, groupKey) ?? [];
    append(group, row); mapSet(siblingGroups, groupKey, group);
  }
  const siblingValues = mapValuesArray(siblingGroups);
  for (let index = 0; index < siblingValues.length; index += 1) sortArray(siblingValues[index], (left, right) => left.startByte - right.startByte || left.endByte - right.endByte || left.preorderOrdinal - right.preorderOrdinal);
  const foldedFrameGroups = new SAFE_MAP();
  for (let index = 0; index < admittedDeclarations.length; index += 1) {
    const row = admittedDeclarations[index];
    const groupKey = `${row.path}\u0000${row.parentKey ?? ''}\u0000${row.kind}\u0000${row.name ?? ''}`;
    const siblings = mapGet(siblingGroups, groupKey);
    let baseFrame;
    if (row.name === null) baseFrame = `${row.kind}!A!${arrayIndexOf(siblings, row)}`;
    else if (siblings.length === 1) baseFrame = `${row.kind}!N!${escapeName(row.name)}`;
    else baseFrame = `${row.kind}!O!${escapeName(row.name)}!${arrayIndexOf(siblings, row)}`;
    mapSet(baseFrameByKey, row.key, baseFrame);
    const foldedKey = `${row.path}\u0000${row.parentKey ?? ''}\u0000${stringToLowerCase(baseFrame)}`;
    const foldedGroup = mapGet(foldedFrameGroups, foldedKey) ?? [];
    append(foldedGroup, row);
    mapSet(foldedFrameGroups, foldedKey, foldedGroup);
  }
  const foldedValues = mapValuesArray(foldedFrameGroups);
  for (let index = 0; index < foldedValues.length; index += 1) sortArray(foldedValues[index], (left, right) => left.startByte - right.startByte || left.endByte - right.endByte || left.preorderOrdinal - right.preorderOrdinal);
  const buildFrame = (row) => {
    const retained = mapGet(frameByKey, row.key);
    if (retained) return retained;
    const chain = [];
    let current = row;
    while (current !== null && !mapHas(frameByKey, current.key)) {
      append(chain, current);
      current = current.parentKey === null ? null : mapGet(byKey, current.parentKey);
      if (current === undefined) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    }
    let qualified = current === null ? null : mapGet(frameByKey, current.key);
    while (chain.length > 0) {
      const member = chain[chain.length - 1];
      chain.length -= 1;
      const baseFrame = mapGet(baseFrameByKey, member.key);
      const foldedKey = `${member.path}\u0000${member.parentKey ?? ''}\u0000${stringToLowerCase(baseFrame)}`;
      const foldedGroup = mapGet(foldedFrameGroups, foldedKey);
      const frame = foldedGroup.length === 1 ? baseFrame : `${baseFrame}!C!${arrayIndexOf(foldedGroup, member)}`;
      qualified = qualified === null ? frame : `${qualified}/${frame}`;
      mapSet(frameByKey, member.key, qualified);
    }
    return mapGet(frameByKey, row.key);
  };
  const nodeByNativeKey = new SAFE_MAP();
  for (let index = 0; index < admittedDeclarations.length; index += 1) {
    const row = admittedDeclarations[index];
    if (!setHas(NODE_KINDS, row.kind) || !mapHas(sourceByPath, row.path)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    const locator = `${row.path}#${buildFrame(row)}`;
    const sourceRow = mapGet(sourceByPath, row.path);
    if (row.startByte < 0 || row.endByte <= row.startByte || row.endByte > sourceRow.byteLength) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    const node = { id: nodeId(repositoryId, row.kind, locator), kind: row.kind, locator, digest: sourceRow.rawSha256 };
    append(nodes, node); mapSet(nodeByNativeKey, row.key, node);
    append(idMapRows, idMapRow(parserId, row.parserNodeKind, row.startByte, row.endByte, row.preorderOrdinal, node, sourceRow));
  }
  if (nodes.length > SOURCE_ORIGIN_LIMITS.nodes) refuse('SOURCE_ORIGIN_LIMIT');
  sortArray(nodes, (left, right) => compareCodeUnits(left.id, right.id));
  const nodeIds = new SAFE_SET();
  const foldedLocators = new SAFE_SET();
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const folded = stringToLowerCase(node.locator);
    if (setHas(nodeIds, node.id) || setHas(foldedLocators, folded)) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    setAdd(nodeIds, node.id); setAdd(foldedLocators, folded);
  }
  sortArray(idMapRows, compareIdMapRows);
  if (setSize(setFromArray(idMapRows, (row) => row.rowDigest)) !== idMapRows.length) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  const idMapDigest = sha256Canonical('galerina.logic-aig-id-map.v1', idMapRows);

  const edges = [];
  const unresolved = [];
  for (let relationIndex = 0; relationIndex < relations.length; relationIndex += 1) {
    const relation = relations[relationIndex];
    const sourceRow = mapGet(sourceByPath, relation.path);
    const sourceNode = relation.ownerNativeKey === null ? mapGet(fileNodeByPath, relation.path) : mapGet(nodeByNativeKey, relation.ownerNativeKey);
    if (!sourceRow || !sourceNode || !setHas(RELATIONSHIP_KINDS, relation.relationshipClass) || relation.relationshipClass === 'TEST' || relation.relationshipClass === 'GENERATED_CONSUMER') refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    if (!NUMBER_IS_SAFE_INTEGER(relation.startByte) || !NUMBER_IS_SAFE_INTEGER(relation.endByte) || relation.startByte < 0 || relation.endByte <= relation.startByte || relation.endByte > sourceRow.byteLength) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
    let candidateNodes = arrayFilter(arrayMap(relation.targetNativeKeys, (key) => mapGet(nodeByNativeKey, key)), (value) => value !== undefined && value !== null);
    const pathCandidates = arrayFilter(arrayMap(relation.targetPaths, (locator) => mapGet(fileNodeByPath, locator)), (value) => value !== undefined && value !== null);
    for (let index = 0; index < pathCandidates.length; index += 1) append(candidateNodes, pathCandidates[index]);
    const uniqueCandidates = new SAFE_MAP();
    for (let index = 0; index < candidateNodes.length; index += 1) mapSet(uniqueCandidates, candidateNodes[index].id, candidateNodes[index]);
    candidateNodes = sortArray(mapValuesArray(uniqueCandidates), (left, right) => compareCodeUnits(left.id, right.id));
    if (relation.targetState === 'RESOLVED' && candidateNodes.length === 1) {
      const targetNode = candidateNodes[0];
      const evidence = {
        kind: 'SOURCE_SYNTAX',
        sourceBlobOid: sourceRow.blobOid,
        sourceRawSha256: sourceRow.rawSha256,
        startByte: relation.startByte,
        endByte: relation.endByte,
      };
      addEdge(edges, evidence, relation.relationshipClass, sourceNode.id, targetNode.id);
      if (isTestPath(relation.path, resolutionPolicy) && !isTestPath(sourcePathFromLocator(targetNode.locator), resolutionPolicy)) addEdge(edges, evidence, 'TEST', sourceNode.id, targetNode.id);
    } else {
      addUnresolved(unresolved, parserPolicy, relation, sourceNode, sourceRow, arrayMap(candidateNodes, (node) => node.id));
    }
  }
  if (edges.length > SOURCE_ORIGIN_LIMITS.edges || unresolved.length > SOURCE_ORIGIN_LIMITS.unresolvedRows) refuse('SOURCE_ORIGIN_LIMIT');
  sortArray(edges, (left, right) => compareCodeUnits(left.id, right.id));
  sortArray(unresolved, (left, right) => {
    const fields = ['sourceNodeId','relationshipClass','reasonCode','sourceLocator','evidenceDigest'];
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const compared = compareCodeUnits(left[field], right[field]);
      if (compared !== 0) return compared;
    }
    return 0;
  });
  if (setSize(setFromArray(edges, (row) => row.id)) !== edges.length || setSize(setFromArray(unresolved, (row) => row.evidenceDigest)) !== unresolved.length) refuse('SOURCE_ORIGIN_HOST_SEMANTIC');
  return { nodes, edges, unresolved, idMapRows, idMapDigest };
}

export function buildSemanticRows(options) {
  return buildCapturedSemanticRows(captureSemanticRowsOptions(options));
}

function childTuple(value, length) {
  exactArray(value, 'SOURCE_ORIGIN_HOST_CHILD');
  if (value.length !== length) refuse('SOURCE_ORIGIN_HOST_CHILD');
  return value;
}

function childIndex(value, length) {
  if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0 || value >= length) refuse('SOURCE_ORIGIN_HOST_CHILD');
  return value;
}

function childNullableIndex(value, length) {
  return value === null ? null : childIndex(value, length);
}

function childInteger(value) {
  if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) refuse('SOURCE_ORIGIN_HOST_CHILD');
  return value;
}

function validateChildSemantic(value, sourceRows, parserPolicy) {
  exactObject(value, ['declarations','relations','diagnostics'], 'SOURCE_ORIGIN_HOST_CHILD');
  exactArray(value.declarations, 'SOURCE_ORIGIN_HOST_CHILD');
  exactArray(value.relations, 'SOURCE_ORIGIN_HOST_CHILD');
  exactArray(value.diagnostics, 'SOURCE_ORIGIN_HOST_CHILD');
  const declarationKeys = [];
  for (let index = 0; index < value.declarations.length; index += 1) {
    const row = childTuple(value.declarations[index], 8);
    const sourceIndex = childIndex(row[0], sourceRows.length);
    const preorderOrdinal = childInteger(row[7]);
    append(declarationKeys, `${sourceRows[sourceIndex].path}\u0000${preorderOrdinal}`);
  }
  const declarations = [];
  for (let index = 0; index < value.declarations.length; index += 1) {
    const row = value.declarations[index];
    const sourceIndex = childIndex(row[0], sourceRows.length);
    const parentIndex = childNullableIndex(row[1], declarationKeys.length);
    append(declarations, {
      key: declarationKeys[index],
      path: sourceRows[sourceIndex].path,
      parentKey: parentIndex === null ? null : declarationKeys[parentIndex],
      kind: row[2],
      name: row[3],
      parserNodeKind: row[4],
      startByte: row[5],
      endByte: row[6],
      preorderOrdinal: row[7],
    });
  }
  const relations = [];
  for (let index = 0; index < value.relations.length; index += 1) {
    const row = childTuple(value.relations[index], 8);
    const sourceIndex = childIndex(row[0], sourceRows.length);
    const ownerIndex = childNullableIndex(row[1], declarationKeys.length);
    const targetNativeIndexes = exactArray(row[5], 'SOURCE_ORIGIN_HOST_CHILD');
    const targetPathIndexes = exactArray(row[6], 'SOURCE_ORIGIN_HOST_CHILD');
    append(relations, {
      path: sourceRows[sourceIndex].path,
      ownerNativeKey: ownerIndex === null ? null : declarationKeys[ownerIndex],
      relationshipClass: row[2],
      startByte: row[3],
      endByte: row[4],
      targetNativeKeys: arrayMap(targetNativeIndexes, (targetIndex) => declarationKeys[childIndex(targetIndex, declarationKeys.length)]),
      targetPaths: arrayMap(targetPathIndexes, (targetIndex) => sourceRows[childIndex(targetIndex, sourceRows.length)].path),
      targetState: row[7],
    });
  }
  const diagnostics = new SAFE_MAP();
  for (let index = 0; index < value.diagnostics.length; index += 1) {
    const row = childTuple(value.diagnostics[index], 2);
    const sourcePath = sourceRows[childIndex(row[0], sourceRows.length)].path;
    if (mapHas(diagnostics, sourcePath)) refuse('SOURCE_ORIGIN_HOST_CHILD');
    mapSet(diagnostics, sourcePath, mappedDiagnostics(row[1], parserPolicy));
  }
  const parseResults = arrayMap(sourceRows, (row) => {
    const codes = mapGet(diagnostics, row.path);
    if (!codes) refuse('SOURCE_ORIGIN_HOST_CHILD');
    return { path: row.path, status: codes.length === 0 ? 'PARSED' : 'REFUSED', diagnosticCodes: codes };
  });
  return { declarations, relations, parseResults };
}

function captureOptions(options) {
  exactObject(options, HOST_OPTION_KEYS);
  const repositoryIdentity = validateRepositoryIdentity(options.repositoryIdentity);
  const sourcePolicy = validateSourcePolicy(options.sourcePolicy);
  const resolutionPolicy = validateResolutionPolicy(options.resolutionPolicy);
  const parserPolicy = validateParserPolicy(options.parserPolicy);
  const pins = validateToolchainPins(options.pins);
  const sourceManifest = validateSourceManifest(options.sourceManifest, { repositoryIdentity, sourcePolicy });
  const resolutionInputs = validateResolutionInputs(options.resolutionInputs, { repositoryIdentity, resolutionPolicy });
  if (
    resolutionInputs.repositoryId !== sourceManifest.repositoryId
    || resolutionInputs.expectedHead !== sourceManifest.expectedHead
    || resolutionInputs.expectedTree !== sourceManifest.expectedTree
  ) refuse('SOURCE_ORIGIN_HOST_SCHEMA');
  const sourceBlobs = admitFrozenBlobSet(sourceManifest.rows, options.sourceBlobs, { label: 'SOURCE_MANIFEST' });
  const resolutionBlobs = admitFrozenBlobSet(resolutionInputs.rows, options.resolutionBlobs, { label: 'RESOLUTION_INPUTS' });
  const prepared = prepareSemanticToolchain({
    pins,
    platform: options.platform,
    arch: options.arch,
    nodeIdentity: options.nodeIdentity,
    gitIdentity: options.gitIdentity,
  });
  const selection = arrayFind(prepared.selections, (row) => row.domain === 'HOST');
  if (!selection || selection.entry.locator !== 'lib/typescript.js') refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
  const entryJoined = `${selection.entry.rootLocator}/${selection.entry.locator}`;
  const entryRow = arrayFind(selection.moduleRows, (row) => row.locator === selection.entry.locator);
  if (!entryRow) refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
  let toolchainBlobs;
  try {
    toolchainBlobs = admitFrozenBlobSet([
      { path: entryJoined, byteLength: entryRow.byteLength, rawSha256: entryRow.rawSha256 },
    ], options.toolchainBlobs, { label: 'SOURCE_MANIFEST' });
  } catch {
    refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
  }
  return { repositoryIdentity, sourcePolicy, resolutionPolicy, parserPolicy, pins, sourceManifest, sourceBlobs, resolutionInputs, resolutionBlobs, prepared, selection, toolchainBlobs, entryJoined };
}

export async function decodeHostProject(options) {
  const captured = captureOptions(options);
  authenticateNodeExecutable(captured.prepared.nodeIdentity);
  const sourceRows = arrayFilter(captured.sourceManifest.rows, (row) => classifySourcePath(row.path, captured.sourcePolicy) === 'HOST');
  const sourceEntries = arrayMap(sourceRows, (row) => {
    const bytes = captured.sourceBlobs.get(row.path);
    if (!bytes) refuse('SOURCE_ORIGIN_HOST_SOURCE');
    return [row.path, bytes];
  });
  const sources = arrayMap(sourceEntries, (entry) => ({ path: entry[0], text: decodeUtf8(entry[1]) }));
  const entryBytes = captured.toolchainBlobs.get(captured.entryJoined);
  if (!entryBytes) refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
  const replay = runHostChild(captured.selection, entryBytes, sources);
  const semantic = validateChildSemantic(replay.semantic, sourceRows, captured.parserPolicy);
  const semanticRows = validateCapturedSemanticRows({
    repositoryId: captured.sourceManifest.repositoryId,
    parserId: captured.selection.parserId,
    sourceRows,
    parseResults: semantic.parseResults,
    declarations: semantic.declarations,
    relations: semantic.relations,
    parserPolicy: captured.parserPolicy,
    resolutionPolicy: captured.resolutionPolicy,
  });
  const rows = buildCapturedSemanticRows(semanticRows);
  const actualRuntimeLoadSet = {
    id: 'HOST',
    moduleRows: captured.selection.moduleRows,
    builtinModules: captured.selection.builtinModules,
  };
  if (
    canonicalJsonText(replay.moduleLocators) !== canonicalJsonText(arrayMap(actualRuntimeLoadSet.moduleRows, (row) => row.locator))
    || canonicalJsonText(replay.builtinModules) !== canonicalJsonText(actualRuntimeLoadSet.builtinModules)
  ) refuse('SOURCE_ORIGIN_HOST_TOOLCHAIN');
  return deepFreeze(frozenNullRecord({
    nodes: rows.nodes,
    edges: rows.edges,
    unresolved: rows.unresolved,
    parseOutcomes: [],
    parseResults: semantic.parseResults,
    idMapRows: rows.idMapRows,
    idMapDigest: rows.idMapDigest,
    toolchain: captured.selection,
    actualRuntimeLoadSet,
    authorizing: false,
  }));
}
