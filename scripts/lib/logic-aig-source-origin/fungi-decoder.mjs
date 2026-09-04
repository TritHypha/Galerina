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
import { buildSemanticRows } from './host-decoder.mjs';
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
const SAFE_SET = Set;
const SET_ADD = Set.prototype.add;
const SET_HAS = Set.prototype.has;
const SET_SIZE = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(Set.prototype, 'size').get;
const SAFE_MAP = Map;
const MAP_GET = Map.prototype.get;
const MAP_HAS = Map.prototype.has;
const MAP_SET = Map.prototype.set;
const MAP_SIZE = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(Map.prototype, 'size').get;
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
const JSON_PARSE = JSON.parse;
const STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const STRING_SPLIT = String.prototype.split;
const STATS_IS_FILE = Stats.prototype.isFile;
const STATS_IS_SYMBOLIC_LINK = Stats.prototype.isSymbolicLink;
const SAFE_WEAK_SET = WeakSet;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_HAS = WeakSet.prototype.has;
const FUNGI_REFUSALS = new SAFE_WEAK_SET();
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
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) refuse('SOURCE_ORIGIN_FUNGI_SCHEMA');
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
  const code = 'SOURCE_ORIGIN_FUNGI_CHILD';
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
function sortArray(values, compare = compareCodeUnits) { return REFLECT_APPLY(ARRAY_SORT, values, [compare]); }
function stringToLowerCase(value) { return REFLECT_APPLY(STRING_TO_LOWER_CASE, value, []); }
function stringSplit(value, separator) { return REFLECT_APPLY(STRING_SPLIT, value, [separator]); }
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
function mapSize(values) { return REFLECT_APPLY(MAP_SIZE, values, []); }
function refusalAdd(value) { REFLECT_APPLY(WEAK_SET_ADD, FUNGI_REFUSALS, [value]); }
function refusalHas(value) { return value !== null && typeof value === 'object' && REFLECT_APPLY(WEAK_SET_HAS, FUNGI_REFUSALS, [value]); }
function pathJoinLocator(root, locator) { const components = stringSplit(locator, '/'); const args = [root]; for (let index = 0; index < components.length; index += 1) append(args, components[index]); return REFLECT_APPLY(PATH_JOIN, null, args); }

const OPTION_KEYS = OBJECT_FREEZE([
  'repositoryIdentity', 'sourcePolicy', 'resolutionPolicy', 'parserPolicy',
  'pins', 'sourceManifest', 'sourceBlobs', 'resolutionInputs',
  'resolutionBlobs', 'toolchainBlobs', 'platform', 'arch', 'nodeIdentity',
  'gitIdentity',
]);
const PARSER_SOURCE_LOCATORS = OBJECT_FREEZE([
  'src/gate-v3-parser.ts',
  'src/lexer.ts',
  'src/parser.ts',
  'src/requirement-diagnostics.ts',
  'src/source-origin-parser-entry.ts',
]);
const PARSER_OUTPUT_LOCATORS = OBJECT_FREEZE([
  'gate-v3-parser.js',
  'lexer.js',
  'parser.js',
  'requirement-diagnostics.js',
  'source-origin-parser-entry.js',
]);
const NODE_KINDS = new Set([
  'CLASS', 'FILE', 'FLOW', 'FUNCTION', 'GATE', 'INTERFACE', 'METHOD',
  'MODULE', 'ROUTE', 'SYMBOL', 'TYPE',
]);
const RELATIONSHIP_KINDS = new Set(['CALLER', 'CONTRACT', 'IMPORT']);

class FungiDecoderRefusal extends Error {
  constructor(code) {
    super(code);
    defineData(this, 'name', 'FungiDecoderRefusal');
    defineData(this, 'code', code);
    refusalAdd(this);
  }
}

function refuse(code) {
  throw new FungiDecoderRefusal(code);
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactObject(value, keys, code = 'SOURCE_ORIGIN_FUNGI_SCHEMA') {
  if (UTIL_TYPES_IS_PROXY(value) || value === null || typeof value !== 'object' || ARRAY_IS_ARRAY(value)) refuse(code);
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  if ((prototype !== OBJECT_PROTOTYPE && prototype !== null) || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, names[index]);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  }
  const sorted = REFLECT_APPLY(ARRAY_SORT, names, [compareCodeUnits]);
  const expected = sortArray(arrayCopy(keys));
  if (sorted.length !== expected.length || arraySome(sorted, (name, index) => name !== expected[index])) refuse(code);
}

function exactArray(value, code = 'SOURCE_ORIGIN_FUNGI_SCHEMA') {
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

function decodeUtf8(bytes, code = 'SOURCE_ORIGIN_FUNGI_SOURCE') {
  try {
    return decodeUtf8Bytes(bytes);
  } catch {
    refuse(code);
  }
}

function authenticateNodeExecutable(nodeIdentity) {
  if (PROCESS_VERSION !== nodeIdentity.version) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  let details;
  let canonical;
  let bytes;
  try {
    assertNativeEffectClosure('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
    details = FS_LSTAT_SYNC(PROCESS_EXEC_PATH, FS_LSTAT_OPTIONS);
    assertNativeEffectClosure('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
    canonical = FS_REALPATH_SYNC_NATIVE(PROCESS_EXEC_PATH);
    assertNativeEffectClosure('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
    bytes = FS_READ_FILE_SYNC(PROCESS_EXEC_PATH);
  } catch {
    refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
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
  ) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
}

function parserChildMain() {
  const fs = require('node:fs');
  const crypto = require('node:crypto');
  const path = require('node:path');
  const Module = require('node:module');
  const { fileURLToPath, pathToFileURL } = require('node:url');
  const { TextEncoder: SafeTextEncoder } = require('node:util');
  const reflectApply = Reflect.apply;
  const textEncoder = new SafeTextEncoder();
  const textEncode = SafeTextEncoder.prototype.encode;

  class GuardRefusal extends Error {
    constructor(code) { super(code); this.code = code; }
  }
  const fail = (code) => { throw new GuardRefusal(code); };
  const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
  const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
  const samePath = (left, right) => process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
  let config;
  try { config = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { process.exitCode = 2; return; }
  const hostRoot = path.resolve(config.hostRoot);
  const parserRoot = path.resolve(config.parserRoot);
  const hostEntry = path.resolve(hostRoot, ...config.hostEntryLocator.split('/'));
  const hostRows = new Map(config.hostRows.map((row) => [row.locator, row]));
  const parserRows = new Map(config.parserRows.map((row) => [row.locator, row]));
  const hostBuiltins = new Set(config.hostBuiltins);
  const loadedHostModules = new Set();
  const loadedHostBuiltins = new Set();
  const loadedParserModules = new Set();
  const canonicalBuiltin = new Map();
  for (const name of Module.builtinModules) {
    const canonical = name.startsWith('node:') ? name : `node:${name}`;
    canonicalBuiltin.set(name, canonical);
    canonicalBuiltin.set(canonical, canonical);
  }
  const hostLocatorFor = (filename) => {
    const absolute = path.resolve(filename);
    const relative = path.relative(hostRoot, absolute);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('LOAD');
    return relative.split(path.sep).join('/');
  };
  const readHostExact = (filename) => {
    const locator = hostLocatorFor(filename);
    const expected = hostRows.get(locator);
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
    loadedHostModules.add(locator);
    return bytes;
  };
  const originalLoad = Module._load;
  Module._load = function guardedLoad(request, parent, isMain) {
    if (typeof request !== 'string') fail('LOAD');
    const builtin = canonicalBuiltin.get(request);
    if (builtin) {
      if (!hostBuiltins.has(builtin)) fail('LOAD');
      loadedHostBuiltins.add(builtin);
      return originalLoad.call(this, request, parent, isMain);
    }
    if (!path.isAbsolute(request) || parent !== null || !isMain || !samePath(path.resolve(request), hostEntry)) fail('LOAD');
    return originalLoad.call(this, hostEntry, parent, isMain);
  };
  Module._extensions['.js'] = function guardedJavaScript(module, filename) {
    const bytes = readHostExact(filename);
    module._compile(new TextDecoder('utf-8', { fatal: true }).decode(bytes), filename);
  };
  process.chdir = () => fail('LOAD');

  const utf8ByteOffsets = (text) => {
    const offsets = new Array(text.length + 1);
    let byteOffset = 0;
    offsets[0] = byteOffset;
    for (let index = 0; index < text.length; index += 1) {
      const unit = text.charCodeAt(index);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) fail('SEMANTIC');
        offsets[index + 1] = null;
        byteOffset += 4;
        index += 1;
      } else {
        if (unit >= 0xdc00 && unit <= 0xdfff) fail('SEMANTIC');
        byteOffset += unit <= 0x7f ? 1 : unit <= 0x7ff ? 2 : 3;
      }
      offsets[index + 1] = byteOffset;
    }
    return offsets;
  };
  const byteSpan = (byteOffsets, location) => {
    if (!location || typeof location !== 'object') fail('SEMANTIC');
    const start = location.offset;
    const end = location.endOffset;
    if (
      !Number.isSafeInteger(start) || start < 0
      || !Number.isSafeInteger(end) || end <= start || end >= byteOffsets.length
      || byteOffsets[start] === null || byteOffsets[end] === null
    ) fail('SEMANTIC');
    const startByte = byteOffsets[start];
    const endByte = byteOffsets[end];
    if (endByte <= startByte || endByte > byteOffsets.at(-1)) fail('SEMANTIC');
    return { startByte, endByte };
  };
  const lineStarts = (text) => {
    const rows = [0];
    for (let index = 0; index < text.length; index += 1) {
      const unit = text.charCodeAt(index);
      if (unit === 0x0d) {
        if (text.charCodeAt(index + 1) === 0x0a) index += 1;
        rows.push(index + 1);
      } else if (unit === 0x0a) rows.push(index + 1);
    }
    return rows;
  };
  const gateSpan = (text, starts, location) => {
    if (!location || !Number.isSafeInteger(location.line) || !Number.isSafeInteger(location.column)) fail('SEMANTIC');
    const lineIndex = location.line - 1;
    if (lineIndex < 0 || lineIndex >= starts.length) fail('SEMANTIC');
    const endLineIndex = Number.isSafeInteger(location.endLine) ? location.endLine - 1 : lineIndex;
    if (endLineIndex < lineIndex || endLineIndex >= starts.length) fail('SEMANTIC');
    const startCharacter = starts[lineIndex] + location.column - 1;
    const endColumn = Number.isSafeInteger(location.endColumn) ? location.endColumn : location.column;
    const endCharacter = starts[endLineIndex] + Math.max(endColumn, location.column);
    const startByte = Buffer.byteLength(text.slice(0, startCharacter), 'utf8');
    const endByte = Buffer.byteLength(text.slice(0, Math.min(text.length, Math.max(startCharacter + 1, endCharacter))), 'utf8');
    if (startByte < 0 || endByte <= startByte || endByte > Buffer.byteLength(text, 'utf8')) fail('SEMANTIC');
    return { startByte, endByte };
  };
  const fungiDeclarationKinds = new Map([
    ['flowDecl', 'FLOW'], ['secureFlowDecl', 'FLOW'], ['pureFlowDecl', 'FLOW'],
    ['guardedFlowDecl', 'FLOW'], ['governedFlowDecl', 'FLOW'], ['fnDecl', 'FUNCTION'],
    ['typeDecl', 'TYPE'], ['recordDecl', 'TYPE'], ['enumDecl', 'TYPE'],
    ['hallmarkDecl', 'TYPE'], ['bitfieldDecl', 'TYPE'], ['resourceDecl', 'TYPE'],
    ['vaultDecl', 'TYPE'], ['contractDecl', 'TYPE'], ['contractSetDecl', 'TYPE'],
    ['apiDecl', 'INTERFACE'], ['routeDecl', 'ROUTE'], ['gateDecl', 'GATE'],
    ['guardDecl', 'GATE'], ['governanceDecl', 'MODULE'], ['authorityDecl', 'MODULE'],
    ['policyDecl', 'MODULE'], ['intentDecl', 'SYMBOL'], ['staticDecl', 'SYMBOL'],
  ]);
  const normalizeFungi = (namespace, source) => {
    const parsed = namespace.parseProgram(source.text, source.path);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.diagnostics) || !Array.isArray(parsed.flows)) fail('PARSER');
    const diagnosticCodes = [...new Set(parsed.diagnostics
      .filter((row) => row && row.severity === 'error')
      .map((row) => {
        if (typeof row.code !== 'string' || !(new RegExp(config.diagnosticCodePattern, 'u')).test(row.code)) fail('PARSER');
        return row.code;
      }))].sort(compare);
    const parseResult = { path: source.path, status: diagnosticCodes.length === 0 ? 'PARSED' : 'REFUSED', diagnosticCodes };
    const declarations = [];
    const relations = [];
    if (parseResult.status === 'REFUSED') return { declarations, relations, parseResult };
    if (!parsed.ast || parsed.ast.kind !== 'program') fail('PARSER');
    const byteOffsets = utf8ByteOffsets(source.text);
    const declarationStack = [];
    const declarationByName = new Map();
    const pendingRelations = [];
    let ordinal = 0;
    const visit = (node) => {
      if (!node || typeof node !== 'object' || typeof node.kind !== 'string') fail('SEMANTIC');
      const currentOrdinal = ordinal++;
      const semanticKind = fungiDeclarationKinds.get(node.kind) ?? null;
      let key = null;
      if (semanticKind !== null) {
        const span = byteSpan(byteOffsets, node.location);
        const name = typeof node.value === 'string' && node.value.length > 0 ? node.value : null;
        key = `${source.path}\u0000${currentOrdinal}`;
        declarations.push({
          key,
          path: source.path,
          parentKey: declarationStack.at(-1) ?? null,
          kind: semanticKind,
          name,
          parserNodeKind: node.kind,
          ...span,
          preorderOrdinal: currentOrdinal,
        });
        if (name !== null) {
          const rows = declarationByName.get(name) ?? [];
          rows.push(key); declarationByName.set(name, rows);
        }
        declarationStack.push(key);
      }
      const ownerNativeKey = declarationStack.at(-1) ?? null;
      if (node.kind === 'callExpr') {
        const span = byteSpan(byteOffsets, node.location);
        pendingRelations.push({ relationshipClass: 'CALLER', ownerNativeKey, name: typeof node.value === 'string' ? node.value : null, dynamic: node.callStyle === 'method', ...span });
      } else if (node.kind === 'typeRef') {
        const span = byteSpan(byteOffsets, node.location);
        pendingRelations.push({ relationshipClass: 'CONTRACT', ownerNativeKey, name: typeof node.value === 'string' ? node.value : null, dynamic: false, ...span });
      } else if (node.kind === 'importDecl') {
        const span = byteSpan(byteOffsets, node.location);
        pendingRelations.push({ relationshipClass: 'IMPORT', ownerNativeKey, name: typeof node.value === 'string' ? node.value : null, dynamic: false, ...span });
      }
      if (node.children !== undefined) {
        if (!Array.isArray(node.children)) fail('SEMANTIC');
        for (const child of node.children) visit(child);
      }
      if (key !== null) declarationStack.pop();
    };
    visit(parsed.ast);
    const sourcePaths = new Set(config.sources.map((row) => row.path));
    const resolveImport = (specifier) => {
      if (typeof specifier !== 'string' || (!specifier.startsWith('./') && !specifier.startsWith('../'))) return { state: 'OUTSIDE', paths: [] };
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(source.path), specifier));
      if (base === '..' || base.startsWith('../') || base.startsWith('/')) return { state: 'MISSING', paths: [] };
      const candidates = [];
      const add = (candidate) => { if (sourcePaths.has(candidate) && !candidates.includes(candidate)) candidates.push(candidate); };
      add(base); add(`${base}.fungi`); add(`${base}/index.fungi`);
      candidates.sort(compare);
      return candidates.length === 1 ? { state: 'RESOLVED', paths: candidates }
        : candidates.length > 1 ? { state: 'AMBIGUOUS', paths: candidates }
          : { state: 'MISSING', paths: [] };
    };
    for (const relation of pendingRelations) {
      let targetNativeKeys = [];
      let targetPaths = [];
      let targetState;
      if (relation.relationshipClass === 'IMPORT') {
        const resolution = resolveImport(relation.name);
        targetPaths = resolution.paths; targetState = resolution.state;
      } else if (relation.dynamic || relation.name === null) {
        targetState = 'DYNAMIC';
      } else {
        targetNativeKeys = [...(declarationByName.get(relation.name) ?? [])].sort(compare);
        targetState = targetNativeKeys.length === 1 ? 'RESOLVED' : targetNativeKeys.length > 1 ? 'AMBIGUOUS' : 'MISSING';
      }
      relations.push({
        path: source.path,
        ownerNativeKey: relation.ownerNativeKey,
        relationshipClass: relation.relationshipClass,
        startByte: relation.startByte,
        endByte: relation.endByte,
        targetNativeKeys,
        targetPaths,
        targetState,
      });
    }
    return { declarations, relations, parseResult };
  };
  const normalizeGate = (namespace, source) => {
    const parsed = namespace.parseGateV3(source.text, source.path);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean' || !Array.isArray(parsed.diagnostics)) fail('PARSER');
    const diagnosticCodes = [...new Set(parsed.diagnostics.map((row) => {
      if (!row || typeof row.code !== 'string' || !(new RegExp(config.diagnosticCodePattern, 'u')).test(row.code)) fail('PARSER');
      return row.code;
    }))].sort(compare);
    const parseResult = { path: source.path, status: parsed.ok ? 'PARSED' : 'REFUSED', diagnosticCodes };
    const declarations = [];
    const relations = [];
    if (!parsed.ok) {
      if (diagnosticCodes.length === 0 || Object.prototype.hasOwnProperty.call(parsed, 'circuit')) fail('PARSER');
      return { declarations, relations, parseResult };
    }
    if (diagnosticCodes.length !== 0 || !parsed.circuit || typeof parsed.circuit.name !== 'string') fail('PARSER');
    const starts = lineStarts(source.text);
    let ordinal = 1;
    const circuitSpan = gateSpan(source.text, starts, parsed.circuit.location);
    const gateKey = `${source.path}\u00000`;
    declarations.push({ key: gateKey, path: source.path, parentKey: null, kind: 'GATE', name: parsed.circuit.name, parserNodeKind: 'GateV3Circuit', ...circuitSpan, preorderOrdinal: 0 });
    const partByName = new Map();
    for (const part of parsed.circuit.parts) {
      if (!part || typeof part.instance !== 'string' || typeof part.component !== 'string') fail('SEMANTIC');
      const span = gateSpan(source.text, starts, part.location);
      const key = `${source.path}\u0000${ordinal}`;
      declarations.push({ key, path: source.path, parentKey: gateKey, kind: 'SYMBOL', name: part.instance, parserNodeKind: 'GateV3Part', ...span, preorderOrdinal: ordinal++ });
      if (partByName.has(part.instance)) fail('SEMANTIC');
      partByName.set(part.instance, key);
      relations.push({ path: source.path, ownerNativeKey: key, relationshipClass: 'CONTRACT', ...span, targetNativeKeys: [], targetPaths: [], targetState: 'OUTSIDE' });
    }
    for (const wire of parsed.circuit.wires) {
      if (!wire || !wire.from || !wire.to || typeof wire.from.node !== 'string' || typeof wire.to.node !== 'string') fail('SEMANTIC');
      const span = gateSpan(source.text, starts, wire.location);
      const sourceKey = partByName.get(wire.from.node) ?? gateKey;
      const targetKey = partByName.get(wire.to.node);
      relations.push({
        path: source.path,
        ownerNativeKey: sourceKey,
        relationshipClass: 'CALLER',
        ...span,
        targetNativeKeys: targetKey === undefined ? [] : [targetKey],
        targetPaths: [],
        targetState: targetKey === undefined ? 'OUTSIDE' : 'RESOLVED',
      });
    }
    return { declarations, relations, parseResult };
  };

  (async () => {
    try {
      if (!samePath(process.cwd(), config.root)) fail('LOAD');
      const ts = Module._load(hostEntry, null, true);
      if (typeof ts?.transpileModule !== 'function') fail('HOST');
      const outputs = new Map();
      const outputBySource = new Map(config.outputBySource.map((row) => [row.sourceLocator, row.outputLocator]));
      for (const source of config.parserSources) {
        const outputLocator = outputBySource.get(source.locator);
        if (!outputLocator || outputs.has(outputLocator)) fail('COMPILE');
        const transpiled = ts.transpileModule(source.text, {
          fileName: source.locator,
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            strict: true,
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
            declaration: true,
            skipLibCheck: true,
          },
        });
        if (!transpiled || typeof transpiled.outputText !== 'string') fail('COMPILE');
        const bytes = reflectApply(textEncode, textEncoder, [transpiled.outputText]);
        const expected = parserRows.get(outputLocator);
        if (!expected || bytes.length !== expected.byteLength || hash(bytes) !== expected.rawSha256) fail('COMPILE');
        outputs.set(outputLocator, bytes);
      }
      const hostModuleLocators = [...loadedHostModules].sort(compare);
      const hostBuiltinModules = [...loadedHostBuiltins].sort(compare);
      if (
        JSON.stringify(hostModuleLocators) !== JSON.stringify([...hostRows.keys()].sort(compare))
        || JSON.stringify(hostBuiltinModules) !== JSON.stringify([...hostBuiltins].sort(compare))
      ) fail('LOAD');
      if (outputs.size !== parserRows.size) fail('COMPILE');
      fs.mkdirSync(parserRoot, { recursive: true });
      for (const [locator, bytes] of [...outputs].sort(([left], [right]) => compare(left, right))) {
        const filename = path.resolve(parserRoot, ...locator.split('/'));
        if (!samePath(path.dirname(filename), parserRoot)) fail('LOAD');
        fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
      }
      const edgeMap = new Map();
      for (const edge of config.emittedEdges) {
        const key = `${edge.fromLocator}\u0000${edge.specifier}`;
        if (edgeMap.has(key)) fail('LOAD');
        edgeMap.set(key, edge.toLocator);
      }
      const entryUrl = pathToFileURL(path.resolve(parserRoot, ...config.parserEntryLocator.split('/'))).href;
      const parserLocatorFromUrl = (url) => {
        let filename;
        try { filename = fileURLToPath(url); } catch { fail('LOAD'); }
        const relative = path.relative(parserRoot, path.resolve(filename));
        if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('LOAD');
        return relative.split(path.sep).join('/');
      };
      if (typeof Module.registerHooks !== 'function') fail('LOAD');
      Module.registerHooks({
        resolve(specifier, context) {
          if (specifier === entryUrl) return { url: entryUrl, shortCircuit: true };
          if (typeof specifier !== 'string' || typeof context.parentURL !== 'string') fail('LOAD');
          const parentLocator = parserLocatorFromUrl(context.parentURL);
          const targetLocator = edgeMap.get(`${parentLocator}\u0000${specifier}`);
          if (!targetLocator) fail('LOAD');
          return { url: pathToFileURL(path.resolve(parserRoot, ...targetLocator.split('/'))).href, shortCircuit: true };
        },
        load(url) {
          const locator = parserLocatorFromUrl(url);
          const expected = parserRows.get(locator);
          if (!expected) fail('LOAD');
          const filename = path.resolve(parserRoot, ...locator.split('/'));
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
            || !samePath(canonical, filename)
            || bytes.length !== expected.byteLength
            || hash(bytes) !== expected.rawSha256
          ) fail('LOAD');
          loadedParserModules.add(locator);
          return { format: 'module', source: bytes, shortCircuit: true };
        },
      });
      const namespace = await import(entryUrl);
      const parserExportNames = Object.keys(namespace).sort(compare);
      if (JSON.stringify(parserExportNames) !== JSON.stringify(config.parserExportNames)) fail('EXPORT');
      for (const name of parserExportNames) if (typeof namespace[name] !== 'function') fail('EXPORT');
      const fungi = { declarations: [], relations: [], parseResults: [] };
      const gate = { declarations: [], relations: [], parseResults: [] };
      for (const source of config.sources) {
        const normalized = source.domain === 'FUNGI'
          ? normalizeFungi(namespace, source)
          : source.domain === 'GATE'
            ? normalizeGate(namespace, source)
            : fail('CHILD');
        const target = source.domain === 'FUNGI' ? fungi : gate;
        target.declarations.push(...normalized.declarations);
        target.relations.push(...normalized.relations);
        target.parseResults.push(normalized.parseResult);
      }
      const parserModuleLocators = [...loadedParserModules].sort(compare);
      if (JSON.stringify(parserModuleLocators) !== JSON.stringify([...parserRows.keys()].sort(compare))) fail('LOAD');
      process.stdout.write(JSON.stringify({
        hostModuleLocators,
        hostBuiltinModules,
        parserModuleLocators,
        parserBuiltinModules: [],
        parserExportNames,
        semantic: { fungi, gate },
      }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ refusal: error instanceof GuardRefusal ? error.code : 'CHILD' }));
      process.exitCode = 2;
    }
  })();
}

const PARSER_CHILD_SOURCE = `(${parserChildMain.toString()})()`;

function childEnvironment() {
  const environment = OBJECT_CREATE(null);
  defineData(environment, 'NODE_DISABLE_COMPILE_CACHE', '1');
  if (PROCESS_PLATFORM === 'win32' && typeof PROCESS_SYSTEM_ROOT === 'string') defineData(environment, 'SystemRoot', PROCESS_SYSTEM_ROOT);
  return OBJECT_FREEZE(environment);
}

function runParserChild(captured, sourceRows) {
  let root;
  let result;
  let failure;
  try {
    assertNativeEffectClosure('SOURCE_ORIGIN_FUNGI_CHILD');
    root = FS_MKDTEMP_SYNC(PATH_JOIN(OS_TMPDIR(), 'galerina-source-origin-parser-'));
    const hostRoot = PATH_JOIN(root, 'host');
    const parserRoot = PATH_JOIN(root, 'parser');
    const hostEntryPath = pathJoinLocator(hostRoot, captured.hostSelection.entry.locator);
    assertNativeEffectClosure('SOURCE_ORIGIN_FUNGI_CHILD');
    FS_MKDIR_SYNC(PATH_DIRNAME(hostEntryPath), FS_MKDIR_OPTIONS);
    const hostEntryJoined = `${captured.hostSelection.entry.rootLocator}/${captured.hostSelection.entry.locator}`;
    const hostEntryBytes = captured.toolchainBlobs.get(hostEntryJoined);
    if (!hostEntryBytes) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
    assertNativeEffectClosure('SOURCE_ORIGIN_FUNGI_CHILD');
    FS_WRITE_FILE_SYNC(hostEntryPath, hostEntryBytes, FS_WRITE_OPTIONS);
    assertNativeEffectClosure('SOURCE_ORIGIN_FUNGI_CHILD');
    const readback = FS_READ_FILE_SYNC(hostEntryPath);
    const hostEntryRow = arrayFind(captured.hostSelection.moduleRows, (row) => row.locator === captured.hostSelection.entry.locator);
    if (!hostEntryRow || readback.length !== hostEntryRow.byteLength || trustedNodeByteHash(readback) !== hostEntryRow.rawSha256) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
    const parserSources = arrayMap(PARSER_SOURCE_LOCATORS, (locator) => {
      const joined = `${captured.parserSourceRoot}/${locator}`;
      const bytes = captured.toolchainBlobs.get(joined);
      if (!bytes) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
      return { locator, text: decodeUtf8(bytes, 'SOURCE_ORIGIN_FUNGI_TOOLCHAIN') };
    });
    const sources = arrayMap(sourceRows, (row) => {
      const bytes = captured.sourceBlobs.get(row.path);
      if (!bytes) refuse('SOURCE_ORIGIN_FUNGI_SOURCE');
      return { path: row.path, domain: classifySourcePath(row.path, captured.sourcePolicy), text: decodeUtf8(bytes) };
    });
    const record = arrayFind(captured.pins.records, (row) => row.recordId === captured.prepared.recordId);
    if (!record) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
    const config = {
      root,
      hostRoot,
      parserRoot,
      hostEntryLocator: captured.hostSelection.entry.locator,
      hostRows: captured.hostSelection.moduleRows,
      hostBuiltins: captured.hostSelection.builtinModules,
      parserRows: captured.parserRuntime.moduleRows,
      parserEntryLocator: captured.parserRuntime.entry.locator,
      parserExportNames: captured.fungiSelection.parserExportNames,
      parserSources,
      outputBySource: arrayMap(PARSER_SOURCE_LOCATORS, (sourceLocator, index) => ({ sourceLocator, outputLocator: PARSER_OUTPUT_LOCATORS[index] })),
      emittedEdges: record.sourceOriginParser.emittedEdgeRows,
      diagnosticCodePattern: captured.parserPolicy.diagnosticCodePattern,
      sources,
    };
    const input = canonicalJsonText(config);
    if (REFLECT_APPLY(TYPED_ARRAY_LENGTH, REFLECT_APPLY(TEXT_ENCODER_ENCODE, TEXT_ENCODER, [input]), []) > SOURCE_ORIGIN_LIMITS.jsonBytes) refuse('SOURCE_ORIGIN_LIMIT');
    const argv = OBJECT_FREEZE(['--no-warnings', '--input-type=commonjs', '--eval', PARSER_CHILD_SOURCE]);
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
    assertChildProcessClosure('SOURCE_ORIGIN_FUNGI_CHILD');
    result = SPAWN_SYNC(PROCESS_EXEC_PATH, argv, childOptions);
  } catch (error) {
    failure = error;
  }
  if (root !== undefined) {
    try {
      assertNativeEffectClosure('SOURCE_ORIGIN_FUNGI_CLEANUP');
      FS_RM_SYNC(root, FS_RM_OPTIONS);
    } catch { refuse('SOURCE_ORIGIN_FUNGI_CLEANUP'); }
  }
  if (failure) {
    if (refusalHas(failure)) throw failure;
    refuse('SOURCE_ORIGIN_FUNGI_CHILD');
  }
  const childResult = captureSpawnResult(result);
  if (childResult.error || childResult.signal !== null || childResult.stderr !== '' || childResult.status !== 0 || typeof childResult.stdout !== 'string' ||
      REFLECT_APPLY(TYPED_ARRAY_LENGTH, REFLECT_APPLY(TEXT_ENCODER_ENCODE, TEXT_ENCODER, [childResult.stdout]), []) > SOURCE_ORIGIN_LIMITS.processOutputBytes) {
    let parsedRefusal;
    try { parsedRefusal = REFLECT_APPLY(JSON_PARSE, null, [childResult.stdout]); } catch { /* no child artifact */ }
    const refusal = parsedRefusal !== null && typeof parsedRefusal === 'object' && !UTIL_TYPES_IS_PROXY(parsedRefusal)
      ? ownDataValue(parsedRefusal, 'refusal', false, 'SOURCE_ORIGIN_FUNGI_CHILD')
      : undefined;
    if (refusal === 'COMPILE' || refusal === 'LOAD' || refusal === 'EXPORT') refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
    if (typeof refusal === 'string') refuse('SOURCE_ORIGIN_FUNGI_CHILD');
    refuse('SOURCE_ORIGIN_FUNGI_CHILD');
  }
  let parsed;
  try { parsed = REFLECT_APPLY(JSON_PARSE, null, [childResult.stdout]); } catch { refuse('SOURCE_ORIGIN_FUNGI_CHILD'); }
  exactObject(parsed, ['hostModuleLocators','hostBuiltinModules','parserModuleLocators','parserBuiltinModules','parserExportNames','semantic'], 'SOURCE_ORIGIN_FUNGI_CHILD');
  return parsed;
}

function equalData(left, right) {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function validateTextArray(value, expected, code) {
  exactArray(value, code);
  for (let index = 0; index < value.length; index += 1) if (typeof value[index] !== 'string') refuse(code);
  if (!equalData(value, expected)) refuse(code);
}

function validateParseResult(row, sourcePathSet, parserPolicy) {
  exactObject(row, ['path','status','diagnosticCodes'], 'SOURCE_ORIGIN_FUNGI_CHILD');
  if (!setHas(sourcePathSet, row.path) || (row.status !== 'PARSED' && row.status !== 'REFUSED')) refuse('SOURCE_ORIGIN_FUNGI_CHILD');
  exactArray(row.diagnosticCodes, 'SOURCE_ORIGIN_FUNGI_CHILD');
  const pattern = new SAFE_REGEXP(parserPolicy.diagnosticCodePattern, 'u');
  let previous;
  for (let index = 0; index < row.diagnosticCodes.length; index += 1) {
    const code = row.diagnosticCodes[index];
    if (typeof code !== 'string' || !regexpTest(pattern, code) || (previous !== undefined && compareCodeUnits(previous, code) >= 0)) refuse('SOURCE_ORIGIN_FUNGI_CHILD');
    previous = code;
  }
  if ((row.status === 'PARSED') !== (row.diagnosticCodes.length === 0)) refuse('SOURCE_ORIGIN_FUNGI_CHILD');
}

function validateDeclaration(row, sourcePathSet) {
  exactObject(row, ['key','path','parentKey','kind','name','parserNodeKind','startByte','endByte','preorderOrdinal'], 'SOURCE_ORIGIN_FUNGI_CHILD');
  if (
    typeof row.key !== 'string'
    || !setHas(sourcePathSet, row.path)
    || (row.parentKey !== null && typeof row.parentKey !== 'string')
    || !setHas(NODE_KINDS, row.kind)
    || (row.name !== null && typeof row.name !== 'string')
    || typeof row.parserNodeKind !== 'string'
    || !NUMBER_IS_SAFE_INTEGER(row.startByte)
    || !NUMBER_IS_SAFE_INTEGER(row.endByte)
    || row.startByte < 0
    || row.endByte <= row.startByte
    || !NUMBER_IS_SAFE_INTEGER(row.preorderOrdinal)
    || row.preorderOrdinal < 0
  ) refuse('SOURCE_ORIGIN_FUNGI_CHILD');
}

function validateRelation(row, sourcePathSet) {
  exactObject(row, ['path','ownerNativeKey','relationshipClass','startByte','endByte','targetNativeKeys','targetPaths','targetState'], 'SOURCE_ORIGIN_FUNGI_CHILD');
  if (
    !setHas(sourcePathSet, row.path)
    || (row.ownerNativeKey !== null && typeof row.ownerNativeKey !== 'string')
    || !setHas(RELATIONSHIP_KINDS, row.relationshipClass)
    || !NUMBER_IS_SAFE_INTEGER(row.startByte)
    || !NUMBER_IS_SAFE_INTEGER(row.endByte)
    || row.startByte < 0
    || row.endByte <= row.startByte
    || !arraySome(['AMBIGUOUS','DYNAMIC','MISSING','OUTSIDE','RESOLVED'], (state) => state === row.targetState)
  ) refuse('SOURCE_ORIGIN_FUNGI_CHILD');
  exactArray(row.targetNativeKeys, 'SOURCE_ORIGIN_FUNGI_CHILD');
  exactArray(row.targetPaths, 'SOURCE_ORIGIN_FUNGI_CHILD');
  for (let index = 0; index < row.targetNativeKeys.length; index += 1) if (typeof row.targetNativeKeys[index] !== 'string') refuse('SOURCE_ORIGIN_FUNGI_CHILD');
  for (let index = 0; index < row.targetPaths.length; index += 1) if (typeof row.targetPaths[index] !== 'string') refuse('SOURCE_ORIGIN_FUNGI_CHILD');
}

function validateDomainSemantic(value, sourceRows, parserPolicy) {
  exactObject(value, ['declarations','relations','parseResults'], 'SOURCE_ORIGIN_FUNGI_CHILD');
  exactArray(value.declarations, 'SOURCE_ORIGIN_FUNGI_CHILD');
  exactArray(value.relations, 'SOURCE_ORIGIN_FUNGI_CHILD');
  exactArray(value.parseResults, 'SOURCE_ORIGIN_FUNGI_CHILD');
  const paths = setFromArray(sourceRows, (row) => row.path);
  if (value.parseResults.length !== setSize(paths)) refuse('SOURCE_ORIGIN_FUNGI_CHILD');
  const seen = new SAFE_SET();
  for (let index = 0; index < value.parseResults.length; index += 1) {
    const row = value.parseResults[index];
    validateParseResult(row, paths, parserPolicy);
    if (setHas(seen, row.path)) refuse('SOURCE_ORIGIN_FUNGI_CHILD');
    setAdd(seen, row.path);
  }
  for (let index = 0; index < value.declarations.length; index += 1) validateDeclaration(value.declarations[index], paths);
  for (let index = 0; index < value.relations.length; index += 1) validateRelation(value.relations[index], paths);
  return value;
}

function captureOptions(options) {
  exactObject(options, OPTION_KEYS);
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
  ) refuse('SOURCE_ORIGIN_FUNGI_SCHEMA');
  const sourceBlobs = admitFrozenBlobSet(sourceManifest.rows, options.sourceBlobs, { label: 'SOURCE_MANIFEST' });
  const resolutionBlobs = admitFrozenBlobSet(resolutionInputs.rows, options.resolutionBlobs, { label: 'RESOLUTION_INPUTS' });
  const prepared = prepareSemanticToolchain({
    pins,
    platform: options.platform,
    arch: options.arch,
    nodeIdentity: options.nodeIdentity,
    gitIdentity: options.gitIdentity,
  });
  const hostSelection = arrayFind(prepared.selections, (row) => row.domain === 'HOST');
  const fungiSelection = arrayFind(prepared.selections, (row) => row.domain === 'FUNGI');
  const gateSelection = arrayFind(prepared.selections, (row) => row.domain === 'GATE');
  if (
    !hostSelection
    || !fungiSelection
    || !gateSelection
    || hostSelection.operation !== 'typescript-compiler-api'
    || fungiSelection.operation !== 'parseProgram'
    || gateSelection.operation !== 'parseGateV3'
    || fungiSelection.runtimeLoadSetId !== 'PARSER'
    || gateSelection.runtimeLoadSetId !== 'PARSER'
    || !equalData(fungiSelection.moduleRows, gateSelection.moduleRows)
    || !equalData(fungiSelection.builtinModules, gateSelection.builtinModules)
    || !equalData(fungiSelection.parserExportNames, ['lex','parseGateV3','parseProgram'])
    || !equalData(gateSelection.parserExportNames, fungiSelection.parserExportNames)
  ) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  const record = arrayFind(pins.records, (row) => row.recordId === prepared.recordId);
  const parserRuntime = record === undefined ? undefined : arrayFind(record.runtimeLoadSets, (row) => row.id === 'PARSER');
  if (!record || !parserRuntime || !equalData(arrayMap(parserRuntime.moduleRows, (row) => row.locator), PARSER_OUTPUT_LOCATORS)) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  const parserSourceParts = [record.sourceOriginParser.sourceEntry.locator];
  for (let index = 0; index < record.sourceOriginParser.sourceEdgeRows.length; index += 1) {
    append(parserSourceParts, record.sourceOriginParser.sourceEdgeRows[index].fromLocator);
    append(parserSourceParts, record.sourceOriginParser.sourceEdgeRows[index].toLocator);
  }
  const parserSourceLocators = sortArray(uniqueArray(parserSourceParts));
  if (!equalData(parserSourceLocators, PARSER_SOURCE_LOCATORS)) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  const parserSourceRoot = record.sourceOriginParser.sourceEntry.rootLocator;
  const expectedToolchainRows = [];
  const hostEntryJoined = `${hostSelection.entry.rootLocator}/${hostSelection.entry.locator}`;
  const hostEntryRow = arrayFind(hostSelection.moduleRows, (row) => row.locator === hostSelection.entry.locator);
  if (!hostEntryRow) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  append(expectedToolchainRows, { path: hostEntryJoined, byteLength: hostEntryRow.byteLength, rawSha256: hostEntryRow.rawSha256 });
  for (let index = 0; index < PARSER_SOURCE_LOCATORS.length; index += 1) {
    const locator = PARSER_SOURCE_LOCATORS[index];
    const joined = `${parserSourceRoot}/${locator}`;
    const dataRow = arrayFind(record.dataRows, (row) => row.locator === joined);
    if (!dataRow) refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
    append(expectedToolchainRows, { path: joined, byteLength: dataRow.byteLength, rawSha256: dataRow.rawSha256 });
  }
  sortArray(expectedToolchainRows, (left, right) => compareCodeUnits(left.path, right.path));
  let toolchainBlobs;
  try {
    toolchainBlobs = admitFrozenBlobSet(expectedToolchainRows, options.toolchainBlobs, { label: 'SOURCE_MANIFEST' });
  } catch {
    refuse('SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  }
  return {
    repositoryIdentity, sourcePolicy, resolutionPolicy, parserPolicy, pins,
    sourceManifest, sourceBlobs, resolutionInputs, resolutionBlobs, prepared,
    hostSelection, fungiSelection, gateSelection, parserRuntime,
    parserSourceRoot, toolchainBlobs,
  };
}

function compareIdMapRows(left, right) {
  let compared = compareCodeUnits(left.nodeId, right.nodeId);
  if (compared !== 0) return compared;
  compared = compareCodeUnits(left.nativeIdentity.parserId, right.nativeIdentity.parserId);
  if (compared !== 0) return compared;
  compared = compareCodeUnits(left.nativeIdentity.parserNodeKind, right.nativeIdentity.parserNodeKind);
  if (compared !== 0) return compared;
  const fields = ['startByte','endByte','preorderOrdinal'];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (left.nativeIdentity[field] !== right.nativeIdentity[field]) return left.nativeIdentity[field] - right.nativeIdentity[field];
  }
  return 0;
}

export async function decodeFungiGateProject(options) {
  const captured = captureOptions(options);
  authenticateNodeExecutable(captured.prepared.nodeIdentity);
  const sourceRows = arrayFilter(captured.sourceManifest.rows, (row) => {
    const domain = classifySourcePath(row.path, captured.sourcePolicy);
    return domain === 'FUNGI' || domain === 'GATE';
  });
  const replay = runParserChild(captured, sourceRows);
  validateTextArray(replay.hostModuleLocators, arrayMap(captured.hostSelection.moduleRows, (row) => row.locator), 'SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  validateTextArray(replay.hostBuiltinModules, captured.hostSelection.builtinModules, 'SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  validateTextArray(replay.parserModuleLocators, arrayMap(captured.parserRuntime.moduleRows, (row) => row.locator), 'SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  validateTextArray(replay.parserBuiltinModules, captured.parserRuntime.builtinModules, 'SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  validateTextArray(replay.parserExportNames, captured.fungiSelection.parserExportNames, 'SOURCE_ORIGIN_FUNGI_TOOLCHAIN');
  exactObject(replay.semantic, ['fungi','gate'], 'SOURCE_ORIGIN_FUNGI_CHILD');
  const fungiRows = arrayFilter(sourceRows, (row) => classifySourcePath(row.path, captured.sourcePolicy) === 'FUNGI');
  const gateRows = arrayFilter(sourceRows, (row) => classifySourcePath(row.path, captured.sourcePolicy) === 'GATE');
  const fungiSemantic = validateDomainSemantic(replay.semantic.fungi, fungiRows, captured.parserPolicy);
  const gateSemantic = validateDomainSemantic(replay.semantic.gate, gateRows, captured.parserPolicy);
  let fungiOutput;
  let gateOutput;
  try {
    fungiOutput = buildSemanticRows({
      repositoryId: captured.sourceManifest.repositoryId,
      parserId: captured.fungiSelection.parserId,
      sourceRows: fungiRows,
      parseResults: fungiSemantic.parseResults,
      declarations: fungiSemantic.declarations,
      relations: fungiSemantic.relations,
      parserPolicy: captured.parserPolicy,
      resolutionPolicy: captured.resolutionPolicy,
    });
    gateOutput = buildSemanticRows({
      repositoryId: captured.sourceManifest.repositoryId,
      parserId: captured.gateSelection.parserId,
      sourceRows: gateRows,
      parseResults: gateSemantic.parseResults,
      declarations: gateSemantic.declarations,
      relations: gateSemantic.relations,
      parserPolicy: captured.parserPolicy,
      resolutionPolicy: captured.resolutionPolicy,
    });
  } catch {
    refuse('SOURCE_ORIGIN_FUNGI_SEMANTIC');
  }
  const nodes = arrayCopy(fungiOutput.nodes);
  for (let index = 0; index < gateOutput.nodes.length; index += 1) append(nodes, gateOutput.nodes[index]);
  sortArray(nodes, (left, right) => compareCodeUnits(left.id, right.id));
  const edges = arrayCopy(fungiOutput.edges);
  for (let index = 0; index < gateOutput.edges.length; index += 1) append(edges, gateOutput.edges[index]);
  sortArray(edges, (left, right) => compareCodeUnits(left.id, right.id));
  const unresolved = arrayCopy(fungiOutput.unresolved);
  for (let index = 0; index < gateOutput.unresolved.length; index += 1) append(unresolved, gateOutput.unresolved[index]);
  sortArray(unresolved, (left, right) => {
    const fields = ['sourceNodeId','relationshipClass','reasonCode','sourceLocator','evidenceDigest'];
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const compared = compareCodeUnits(left[field], right[field]);
      if (compared !== 0) return compared;
    }
    return 0;
  });
  const idMapRows = arrayCopy(fungiOutput.idMapRows);
  for (let index = 0; index < gateOutput.idMapRows.length; index += 1) append(idMapRows, gateOutput.idMapRows[index]);
  sortArray(idMapRows, compareIdMapRows);
  if (
    setSize(setFromArray(nodes, (row) => row.id)) !== nodes.length
    || setSize(setFromArray(edges, (row) => row.id)) !== edges.length
    || setSize(setFromArray(unresolved, (row) => row.evidenceDigest)) !== unresolved.length
    || setSize(setFromArray(idMapRows, (row) => row.rowDigest)) !== idMapRows.length
  ) refuse('SOURCE_ORIGIN_FUNGI_SEMANTIC');
  const parseResults = arrayCopy(fungiSemantic.parseResults);
  for (let index = 0; index < gateSemantic.parseResults.length; index += 1) append(parseResults, gateSemantic.parseResults[index]);
  sortArray(parseResults, (left, right) => compareCodeUnits(left.path, right.path));
  const actualRuntimeLoadSets = [
    { id: 'HOST', moduleRows: captured.hostSelection.moduleRows, builtinModules: captured.hostSelection.builtinModules },
    { id: 'PARSER', moduleRows: captured.parserRuntime.moduleRows, builtinModules: captured.parserRuntime.builtinModules },
  ];
  return deepFreeze(frozenNullRecord({
    nodes,
    edges,
    unresolved,
    parseOutcomes: [],
    parseResults,
    idMapRows,
    idMapDigest: sha256Canonical('galerina.logic-aig-id-map.v1', idMapRows),
    toolchains: [captured.fungiSelection, captured.gateSelection],
    actualRuntimeLoadSets,
    actualParserExportNames: replay.parserExportNames,
    authorizing: false,
  }));
}
