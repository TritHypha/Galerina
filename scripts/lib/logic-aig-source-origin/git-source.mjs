import { closeSync, lstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { arch, platform } from 'node:os';
import { ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { isProxy } from 'node:util/types';

import {
  SOURCE_ORIGIN_LIMITS,
  canonicalJsonText,
  classifySourcePath,
  parseCanonicalJsonBytes,
  validateGeneratedConsumerPolicy,
  validateProposedBaseline,
  validateRepositoryIdentity,
  validateExpectedParseOutcomes,
  validateParserPolicy,
  validateResolutionPolicy,
  validateSourcePolicy,
  validateToolchainPins,
} from './contract.mjs';
import {
  OWNER_PROPOSAL_POLICY,
  PRODUCER_ARGV_POLICY,
  validateGitProcessPolicy,
} from './owner-proposal-policy.mjs';

const CLOSE_SYNC = closeSync;
const CREATE_HASH = createHash;
const FILE_URL_TO_PATH = fileURLToPath;
const LSTAT_SYNC = lstatSync;
const OPEN_SYNC = openSync;
const OS_ARCH = arch;
const OS_PLATFORM = platform;
const READ_SYNC = readSync;
const REALPATH_SYNC_NATIVE = realpathSync.native;
const SPAWN = spawn;
const STAT_SYNC = statSync;
const REPOSITORY_ROOT = REALPATH_SYNC_NATIVE(FILE_URL_TO_PATH(new URL('../../../', import.meta.url)));

const POLICY_PATHS = Object.freeze({
  proposedBaseline: 'governance/example-proposed-baseline.json',
  exporter: 'governance/logic-aig-source-origin-exporter-policy.json',
  generated: 'governance/logic-aig-source-origin-generated-consumers.json',
  gate: 'packages-ts/galerina-core-compiler/tests/fixtures/gate-v3/REFERENCE-VERDICTS.json',
  repositoryIdentity: 'governance/logic-aig-source-origin-repository-identity.json',
  expectedOutcomes: 'governance/logic-aig-source-origin-expected-parse-outcomes.json',
  parser: 'governance/logic-aig-source-origin-parser-policy.json',
  resolution: 'governance/logic-aig-source-origin-resolution-policy.json',
  source: 'governance/logic-aig-source-origin-source-policy.json',
  toolchainPins: 'governance/logic-aig-source-origin-toolchain-pins.json',
});
const OWNER_IDENTITIES = Object.freeze({
  pins: Object.freeze({ byteLength: 69_452, rawSha256: '0c5bb3b5e77e36741c479f65442dec01c76c57aa67b57fdcdba975e9a6f036cf', semanticDigest: 'a287faaf55f698b7e78d085a24a34bae4998e78e55706731fe9779a0fe4834f8' }),
  proposedBaseline: Object.freeze({ byteLength: 1_605, rawSha256: 'eb1620e43d72f2d1afc3fc7c467c06856d99d936d45c905ef4f1b77abdff8817', semanticDigest: '7e244a1486778fc21fefbb9412ac1057172f716124ec0266f0ccedbae6dca6f8' }),
  expectedOutcomes: Object.freeze({ byteLength: 35_998, rawSha256: 'e86aa47550164ee30fac455c73f3e32f0e0cb1a047175924805087d2301afbe9', semanticDigest: '9a22abb0889101c39e30a07a546a00829320c5fa679a31e97e70312d93ae14a5' }),
  exporter: Object.freeze({ byteLength: 9_451, rawSha256: '97770da53732b1b09cddef4dbe550beca1b5c80cd203a30d29630f305612225a', semanticDigest: 'd45f8e0c7404d608fc735ee406b1abc6348c4466988e6a150d7aa08a8707b96a' }),
  gate: Object.freeze({ byteLength: 2_029, rawSha256: 'd83ce2590520b152e1c838322e1762e4840c274e812bf6006e275118ada59467', semanticDigest: '4dfceb7f2bf2b6642c3b0cc2838735d41b8aad9e3c08e45f394637eb43bf8a58' }),
});
const EXPORTER_BINDING_FIELDS = Object.freeze([
  'sourcePolicyDigest',
  'exclusionDigest',
  'resolutionPolicyDigest',
  'parserPolicyDigest',
  'generatedConsumerPolicyDigest',
  'repositoryIdentityDigest',
  'toolchainPinsDigest',
  'expectedOutcomesDigest',
  'proposedBaselineDigest',
]);
const EXPORTER_POLICY_FIELDS = Object.freeze([
  'argvPolicy', 'argvPolicyDigest', 'authorizing', 'canonicalizationId',
  'decoderId', 'environmentPolicy', 'environmentPolicyDigest',
  'exclusionDigest', 'expectedOutcomesDigest', 'generatedConsumerPolicyDigest',
  'gitProcessPolicy', 'gitProcessPolicyDigest', 'limits', 'nodeKinds',
  'parserPolicyDigest', 'policyDigest', 'proposedBaselineDigest',
  'relationshipKinds', 'repositoryIdentityDigest', 'resolutionPolicyDigest',
  'schema', 'sourcePolicyDigest', 'toolchainPinsDigest',
]);
const PRODUCER_ARGV_POLICY_FIELDS = Object.freeze([
  'authorizing', 'nodeExecArgv', 'policyDigest', 'schema', 'selfTestSlots',
  'targetArgumentSlots',
]);
const APPROVED_PRODUCER_ARGV_POLICY_DIGEST = '3a636a21a4beddcab4ed87389c7fe19b686742afffdcdc911490b9ad0992a5da';
// Depth starts at zero; every root, container, and leaf occurrence consumes one node.
const SEALED_POLICY_COPY_MAX_DEPTH = 64;
const SEALED_POLICY_COPY_MAX_NODES = 4_096;
const EXPECTED_NODE_KINDS = Object.freeze([
  'CLASS', 'FILE', 'FLOW', 'FUNCTION', 'GATE', 'INTERFACE', 'METHOD',
  'MODULE', 'ROUTE', 'SYMBOL', 'TYPE',
]);
const EXPECTED_RELATIONSHIP_KINDS = Object.freeze([
  'CALLER', 'CONTRACT', 'GENERATED_CONSUMER', 'IMPORT', 'TEST',
]);
const EXPECTED_FORBIDDEN_GIT_ENVIRONMENT_KEYS = Object.freeze([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_ATTR_SOURCE', 'GIT_COMMON_DIR',
  'GIT_CONFIG_COUNT', 'GIT_DIR', 'GIT_EXTERNAL_DIFF', 'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY', 'GIT_TRACE', 'GIT_TRACE2', 'GIT_TRACE2_EVENT',
  'GIT_TRACE2_PERF', 'GIT_WORK_TREE', 'HOME', 'NODE_OPTIONS', 'NODE_PATH',
  'PATH', 'TEMP', 'TMP', 'WINDIR', 'XDG_CONFIG_HOME',
]);
const OID_PATTERNS = Object.freeze({
  sha1: /^[0-9a-f]{40}$/,
  sha256: /^[0-9a-f]{64}$/,
});
const HEX_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const REFLECT_APPLY = Reflect.apply;
const OBJECT_CREATE = Object.create;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_ENTRIES = Object.entries;
const OBJECT_FREEZE = Object.freeze;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_OWN_PROPERTY_NAMES = Object.getOwnPropertyNames;
const OBJECT_GET_OWN_PROPERTY_SYMBOLS = Object.getOwnPropertySymbols;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_PROTOTYPE = Object.prototype;
const OBJECT_SET_PROTOTYPE_OF = Object.setPrototypeOf;
const OBJECT_VALUES = Object.values;
const FUNCTION_PROTOTYPE = Function.prototype;
const BIGINT_CONSTRUCTOR = BigInt;
const DATE_NOW = Date.now;
const JSON_PARSE = JSON.parse;
const NUMBER_CONSTRUCTOR = Number;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const PROMISE_CONSTRUCTOR = Promise;
const REGEXP_CONSTRUCTOR = RegExp;
const REGEXP_EXEC = RegExp.prototype.exec;
const SET_TIMEOUT = setTimeout;
const CLEAR_TIMEOUT = clearTimeout;
const SYMBOL_HAS_INSTANCE = Symbol.hasInstance;
const SYMBOL_ITERATOR = Symbol.iterator;
const STRING_CHAR_CODE_AT = String.prototype.charCodeAt;
const STRING_ENDS_WITH = String.prototype.endsWith;
const STRING_INCLUDES = String.prototype.includes;
const STRING_INDEX_OF = String.prototype.indexOf;
const STRING_LAST_INDEX_OF = String.prototype.lastIndexOf;
const STRING_NORMALIZE = String.prototype.normalize;
const STRING_REPLACE = String.prototype.replace;
const STRING_REPLACE_ALL = String.prototype.replaceAll;
const STRING_SLICE = String.prototype.slice;
const STRING_SPLIT = String.prototype.split;
const STRING_STARTS_WITH = String.prototype.startsWith;
const STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const STRING_TO_UPPER_CASE = String.prototype.toUpperCase;
const ARRAY_CONSTRUCTOR = Array;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const ARRAY_BUFFER_IS_VIEW = ArrayBuffer.isView;
const ARRAY_BUFFER_BYTE_LENGTH_GETTER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(ArrayBuffer.prototype, 'byteLength').get;
const TYPED_ARRAY_PROTOTYPE = OBJECT_GET_PROTOTYPE_OF(Uint8Array.prototype);
const TYPED_ARRAY_LENGTH_GETTER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'length').get;
const TYPED_ARRAY_BUFFER_GETTER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'buffer').get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'byteLength').get;
const TYPED_ARRAY_BYTE_OFFSET_GETTER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_PROTOTYPE, 'byteOffset').get;
const UINT8_ARRAY_CONSTRUCTOR = Uint8Array;
const TYPED_ARRAY_CONSTRUCTOR = OBJECT_GET_PROTOTYPE_OF(UINT8_ARRAY_CONSTRUCTOR);
const TYPED_ARRAY_SET = Uint8Array.prototype.set;
const BUFFER_CONSTRUCTOR = Buffer;
const BUFFER_CONSTRUCTOR_PROTOTYPE = OBJECT_GET_PROTOTYPE_OF(BUFFER_CONSTRUCTOR);
const BUFFER_PROTOTYPE = Buffer.prototype;
const BUFFER_ALLOC_UNSAFE_SLOW = Buffer.allocUnsafeSlow;
const BUFFER_EQUALS = Buffer.prototype.equals;
const BUFFER_IS_BUFFER = Buffer.isBuffer;
const BUFFER_POOL_SIZE_DESCRIPTOR = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(BUFFER_CONSTRUCTOR, 'poolSize');
const BUFFER_SUBARRAY = Buffer.prototype.subarray;
const UTIL_TYPES_IS_PROXY = isProxy;
const MAP_CONSTRUCTOR = Map;
const MAP_PROTOTYPE = Map.prototype;
const MAP_ENTRIES = MAP_PROTOTYPE.entries;
const MAP_GET = MAP_PROTOTYPE.get;
const MAP_HAS = MAP_PROTOTYPE.has;
const MAP_SET = MAP_PROTOTYPE.set;
const MAP_SIZE_GETTER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(MAP_PROTOTYPE, 'size').get;
const MAP_ITERATOR_NEXT = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  OBJECT_GET_PROTOTYPE_OF(REFLECT_APPLY(MAP_ENTRIES, new MAP_CONSTRUCTOR(), [])),
  'next',
).value;
const SET_CONSTRUCTOR = Set;
const SET_PROTOTYPE = Set.prototype;
const SET_ADD = SET_PROTOTYPE.add;
const SET_HAS = SET_PROTOTYPE.has;
const SET_SIZE_GETTER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(SET_PROTOTYPE, 'size').get;
const SET_VALUES = SET_PROTOTYPE.values;
const SET_ITERATOR_NEXT = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  OBJECT_GET_PROTOTYPE_OF(REFLECT_APPLY(SET_VALUES, new SET_CONSTRUCTOR(), [])),
  'next',
).value;
const WEAK_MAP_CONSTRUCTOR = WeakMap;
const WEAK_MAP_GET = WeakMap.prototype.get;
const WEAK_MAP_HAS = WeakMap.prototype.has;
const WEAK_MAP_SET = WeakMap.prototype.set;
const WEAK_SET_CONSTRUCTOR = WeakSet;
const WEAK_SET_ADD = WeakSet.prototype.add;
const WEAK_SET_DELETE = WeakSet.prototype.delete;
const WEAK_SET_HAS = WeakSet.prototype.has;
const BLOB_CAPABILITY_STATES = new WEAK_MAP_CONSTRUCTOR();
const BLOB_ITERATOR_STATES = new WEAK_MAP_CONSTRUCTOR();
const CAPTURE_REFUSALS = new WEAK_SET_CONSTRUCTOR();
const HASH_PROTOTYPE = OBJECT_GET_PROTOTYPE_OF(CREATE_HASH('sha256'));
const HASH_UPDATE = HASH_PROTOTYPE.update;
const HASH_DIGEST = HASH_PROTOTYPE.digest;
const TEXT_ENCODER_CONSTRUCTOR = TextEncoder;
const TEXT_ENCODER_ENCODE = TextEncoder.prototype.encode;
const UTF8_ENCODER = new TEXT_ENCODER_CONSTRUCTOR();
const TEXT_DECODER_CONSTRUCTOR = TextDecoder;
const TEXT_DECODER_DECODE = TextDecoder.prototype.decode;
const UTF8_DECODER = new TEXT_DECODER_CONSTRUCTOR('utf-8', { fatal: true });
const HASH_DOMAIN_SEPARATOR = new UINT8_ARRAY_CONSTRUCTOR(1);
const PATH_BASENAME = path.basename;
const PATH_DIRNAME = path.dirname;
const PATH_IS_ABSOLUTE = path.isAbsolute;
const PATH_JOIN = path.join;
const PATH_NORMALIZE = path.normalize;
const CHILD_PROCESS_KILL = ChildProcess.prototype.kill;
const EVENT_EMITTER_ON = EventEmitter.prototype.on;
const READABLE_RESUME = Readable.prototype.resume;
const SYSTEM_ROOT = process.env.SystemRoot;

class SourceOriginCaptureRefusal extends Error {
  constructor(code) {
    super(code);
    const nameDescriptor = OBJECT_CREATE(null);
    nameDescriptor.configurable = true;
    nameDescriptor.enumerable = true;
    nameDescriptor.value = 'SourceOriginCaptureRefusal';
    nameDescriptor.writable = true;
    OBJECT_DEFINE_PROPERTY(this, 'name', nameDescriptor);
    const codeDescriptor = OBJECT_CREATE(null);
    codeDescriptor.configurable = true;
    codeDescriptor.enumerable = true;
    codeDescriptor.value = code;
    codeDescriptor.writable = true;
    OBJECT_DEFINE_PROPERTY(this, 'code', codeDescriptor);
    REFLECT_APPLY(WEAK_SET_ADD, CAPTURE_REFUSALS, [this]);
  }
}
OBJECT_FREEZE(SourceOriginCaptureRefusal.prototype);
OBJECT_FREEZE(SourceOriginCaptureRefusal);

function refuse(code) {
  throw new SourceOriginCaptureRefusal(code);
}

function isCaptureRefusal(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && REFLECT_APPLY(WEAK_SET_HAS, CAPTURE_REFUSALS, [value]);
}

function codeUnitCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stringCharCodeAt(value, index) {
  return REFLECT_APPLY(STRING_CHAR_CODE_AT, value, [index]);
}

function stringEndsWith(value, suffix) {
  return REFLECT_APPLY(STRING_ENDS_WITH, value, [suffix]);
}

function stringIncludes(value, search) {
  return REFLECT_APPLY(STRING_INCLUDES, value, [search]);
}

function stringIndexOf(value, search, fromIndex) {
  return fromIndex === undefined
    ? REFLECT_APPLY(STRING_INDEX_OF, value, [search])
    : REFLECT_APPLY(STRING_INDEX_OF, value, [search, fromIndex]);
}

function stringLastIndexOf(value, search) {
  return REFLECT_APPLY(STRING_LAST_INDEX_OF, value, [search]);
}

function stringNormalize(value) {
  return REFLECT_APPLY(STRING_NORMALIZE, value, ['NFC']);
}

function stringReplace(value, search, replacement) {
  return REFLECT_APPLY(STRING_REPLACE, value, [search, replacement]);
}

function stringReplaceAll(value, search, replacement) {
  return REFLECT_APPLY(STRING_REPLACE_ALL, value, [search, replacement]);
}

function stringSlice(value, start, end) {
  return end === undefined
    ? REFLECT_APPLY(STRING_SLICE, value, [start])
    : REFLECT_APPLY(STRING_SLICE, value, [start, end]);
}

function stringSplit(value, separator) {
  return REFLECT_APPLY(STRING_SPLIT, value, [separator]);
}

function stringStartsWith(value, prefix) {
  return REFLECT_APPLY(STRING_STARTS_WITH, value, [prefix]);
}

function stringToLowerCase(value) {
  return REFLECT_APPLY(STRING_TO_LOWER_CASE, value, []);
}

function stringToUpperCase(value) {
  return REFLECT_APPLY(STRING_TO_UPPER_CASE, value, []);
}

function regexpExec(pattern, value) {
  return REFLECT_APPLY(REGEXP_EXEC, pattern, [value]);
}

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

function safeArrayAppend(values, value) {
  const descriptor = OBJECT_CREATE(null);
  descriptor.configurable = true;
  descriptor.enumerable = true;
  descriptor.value = value;
  descriptor.writable = true;
  OBJECT_DEFINE_PROPERTY(values, values.length, descriptor);
}

function safeArrayMap(values, transform) {
  const output = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < values.length; index += 1) {
    safeArrayAppend(output, transform(values[index], index));
  }
  return output;
}

function safeArrayFilter(values, predicate) {
  const output = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < values.length; index += 1) {
    if (predicate(values[index], index)) safeArrayAppend(output, values[index]);
  }
  return output;
}

function safeArraySome(values, predicate) {
  for (let index = 0; index < values.length; index += 1) {
    if (predicate(values[index], index)) return true;
  }
  return false;
}

function safeArrayEvery(values, predicate) {
  for (let index = 0; index < values.length; index += 1) {
    if (!predicate(values[index], index)) return false;
  }
  return true;
}

function safeArrayIncludes(values, sought) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === sought) return true;
  }
  return false;
}

function safeArrayCount(values, predicate) {
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (predicate(values[index], index)) count += 1;
  }
  return count;
}

function safeArrayCopy(values) {
  return safeArrayMap(values, (value) => value);
}

function safeArraySort(values, compare) {
  REFLECT_APPLY(ARRAY_SORT, values, [compare]);
  return values;
}

function setAdd(set, value) {
  REFLECT_APPLY(SET_ADD, set, [value]);
}

function setHas(set, value) {
  return REFLECT_APPLY(SET_HAS, set, [value]);
}

function setSize(set) {
  return REFLECT_APPLY(SET_SIZE_GETTER, set, []);
}

function capturedSetValues(set) {
  const iterator = REFLECT_APPLY(SET_VALUES, set, []);
  const values = new ARRAY_CONSTRUCTOR();
  while (true) {
    const step = REFLECT_APPLY(SET_ITERATOR_NEXT, iterator, []);
    if (step.done) return values;
    safeArrayAppend(values, step.value);
  }
}

function safeUniqueCount(values, select) {
  const unique = new SET_CONSTRUCTOR();
  for (let index = 0; index < values.length; index += 1) setAdd(unique, select(values[index], index));
  return setSize(unique);
}

function mapSize(map) {
  return REFLECT_APPLY(MAP_SIZE_GETTER, map, []);
}

function typedArrayLength(value) {
  return REFLECT_APPLY(TYPED_ARRAY_LENGTH_GETTER, value, []);
}

function bufferEquals(left, right) {
  return REFLECT_APPLY(BUFFER_EQUALS, left, [right]);
}

function bufferSubarray(value, start, end) {
  return end === undefined
    ? REFLECT_APPLY(BUFFER_SUBARRAY, value, [start])
    : REFLECT_APPLY(BUFFER_SUBARRAY, value, [start, end]);
}

function readDescriptorExact(descriptor, byteLength, code) {
  if (!NUMBER_IS_SAFE_INTEGER(byteLength) || byteLength < 0 || byteLength > SOURCE_ORIGIN_LIMITS.capturedFileBytes) refuse(code);
  const bytes = allocateExactBuffer(byteLength, code);
  const sentinel = allocateExactBuffer(1, code);
  let offset = 0;
  try {
    while (offset < byteLength) {
      const count = READ_SYNC(descriptor, bytes, offset, byteLength - offset, null);
      if (!NUMBER_IS_SAFE_INTEGER(count) || count <= 0 || count > byteLength - offset) refuse(code);
      offset += count;
    }
    if (READ_SYNC(descriptor, sentinel, 0, 1, null) !== 0) refuse(code);
  } catch (error) {
    if (isCaptureRefusal(error)) throw error;
    refuse(code);
  }
  return bytes;
}

function assertCaptureRuntimeClosure() {
  const current = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(BUFFER_CONSTRUCTOR, 'poolSize');
  if (
    !current
    || !OBJECT_HAS_OWN(current, 'value')
    || current.value !== BUFFER_POOL_SIZE_DESCRIPTOR.value
    || current.configurable !== BUFFER_POOL_SIZE_DESCRIPTOR.configurable
    || current.enumerable !== BUFFER_POOL_SIZE_DESCRIPTOR.enumerable
    || current.writable !== BUFFER_POOL_SIZE_DESCRIPTOR.writable
  ) refuse('SOURCE_ORIGIN_GIT_PROCESS');
}

function hashHex(algorithm, chunks) {
  const hash = CREATE_HASH(algorithm);
  for (let index = 0; index < chunks.length; index += 1) {
    REFLECT_APPLY(HASH_UPDATE, hash, [chunks[index]]);
  }
  return REFLECT_APPLY(HASH_DIGEST, hash, ['hex']);
}

function encodeUtf8(value) {
  return REFLECT_APPLY(TEXT_ENCODER_ENCODE, UTF8_ENCODER, [value]);
}

function sha256CanonicalCaptured(domain, value) {
  const canonical = canonicalJsonText(value);
  return hashHex('sha256', [encodeUtf8(domain), HASH_DOMAIN_SEPARATOR, encodeUtf8(canonical)]);
}

function statIsKind(value, expected) {
  const mode = value.mode;
  if (typeof mode === 'bigint') {
    const kind = mode & 0o170000n;
    if (expected === 'FILE') return kind === 0o100000n;
    if (expected === 'DIRECTORY') return kind === 0o040000n;
    return kind === 0o120000n;
  }
  const kind = mode & 0o170000;
  if (expected === 'FILE') return kind === 0o100000;
  if (expected === 'DIRECTORY') return kind === 0o040000;
  return kind === 0o120000;
}

function setDynamicData(target, property, value) {
  const descriptor = OBJECT_CREATE(null);
  descriptor.configurable = true;
  descriptor.enumerable = true;
  descriptor.value = value;
  descriptor.writable = true;
  OBJECT_DEFINE_PROPERTY(target, property, descriptor);
}

function joinPathArguments(values) {
  return REFLECT_APPLY(PATH_JOIN, undefined, values);
}

function joinRepositoryLocator(locator) {
  const values = new ARRAY_CONSTRUCTOR();
  safeArrayAppend(values, REPOSITORY_ROOT);
  const components = stringSplit(locator, '/');
  for (let index = 0; index < components.length; index += 1) safeArrayAppend(values, components[index]);
  return joinPathArguments(values);
}

function exactObject(value, keys, code = 'SOURCE_ORIGIN_GIT_SCHEMA') {
  if (value === null || typeof value !== 'object' || UTIL_TYPES_IS_PROXY(value) || ARRAY_IS_ARRAY(value)) refuse(code);
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  if (prototype !== OBJECT_PROTOTYPE || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  const ownNames = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  if (ownNames.length !== keys.length) refuse(code);
  for (let index = 0; index < ownNames.length; index += 1) {
    const name = ownNames[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, name);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  }
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    let found = false;
    for (let nameIndex = 0; nameIndex < ownNames.length; nameIndex += 1) {
      if (ownNames[nameIndex] === keys[keyIndex]) {
        found = true;
        break;
      }
    }
    if (!found) refuse(code);
  }
}

function captureOptions(value) {
  exactObject(value, ['commitOid', 'gitExecutableLocator']);
  if (typeof value.commitOid !== 'string' || !regexpTest(HEX_OID, value.commitOid) ||
      typeof value.gitExecutableLocator !== 'string' || value.gitExecutableLocator.length === 0 ||
      stringIncludes(value.gitExecutableLocator, '\0') || !PATH_IS_ABSOLUTE(value.gitExecutableLocator) ||
      PATH_NORMALIZE(value.gitExecutableLocator) !== value.gitExecutableLocator) refuse('SOURCE_ORIGIN_GIT_SCHEMA');
  const captured = OBJECT_CREATE(null);
  captured.commitOid = value.commitOid;
  captured.gitExecutableLocator = value.gitExecutableLocator;
  return OBJECT_FREEZE(captured);
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

function validatePath(path) {
  if (
    typeof path !== 'string'
    || path.length === 0
    || stringIncludes(path, '\0')
    || stringIncludes(path, '\\')
    || stringStartsWith(path, '/')
    || regexpTest(/^[A-Za-z]:\//, path)
    || stringEndsWith(path, '/')
    || hasUnpairedSurrogate(path)
    || path !== stringNormalize(path)
  ) refuse('SOURCE_ORIGIN_GIT_PATH');
  const components = stringSplit(path, '/');
  if (safeArraySome(components, (component) => component.length === 0 || component === '.' || component === '..')) refuse('SOURCE_ORIGIN_GIT_PATH');
  return path;
}

function exporterBindings(value) {
  const bindings = OBJECT_CREATE(null);
  for (let index = 0; index < EXPORTER_BINDING_FIELDS.length; index += 1) {
    const field = EXPORTER_BINDING_FIELDS[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable ||
        typeof descriptor.value !== 'string' || !regexpTest(HEX64, descriptor.value)) refuse('SOURCE_ORIGIN_GIT_POLICY');
    setDynamicData(bindings, field, descriptor.value);
  }
  return OBJECT_FREEZE(bindings);
}

function captureExpectedExporterBindings(value) {
  const code = 'SOURCE_ORIGIN_GIT_POLICY';
  if (value === null || typeof value !== 'object' || UTIL_TYPES_IS_PROXY(value) || ARRAY_IS_ARRAY(value)) refuse(code);
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  if ((prototype !== OBJECT_PROTOTYPE && prototype !== null) || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  if (names.length !== EXPORTER_BINDING_FIELDS.length) refuse(code);
  const bindings = OBJECT_CREATE(null);
  for (let index = 0; index < EXPORTER_BINDING_FIELDS.length; index += 1) {
    const field = EXPORTER_BINDING_FIELDS[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, field);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable ||
        typeof descriptor.value !== 'string' || !regexpTest(HEX64, descriptor.value)) refuse(code);
    setDynamicData(bindings, field, descriptor.value);
  }
  return OBJECT_FREEZE(bindings);
}

function readBoundWorkingOwner(locator, identity, validate, semanticDigestField) {
  const absolute = joinRepositoryLocator(locator);
  let before;
  let bytes;
  let after;
  try {
    before = LSTAT_SYNC(absolute, { bigint: true });
    if (statIsKind(before, 'LINK') || !statIsKind(before, 'FILE') || before.size !== BIGINT_CONSTRUCTOR(identity.byteLength) || REALPATH_SYNC_NATIVE(absolute) !== absolute) refuse('SOURCE_ORIGIN_GIT_POLICY');
    const descriptor = OPEN_SYNC(absolute, 'r');
    try { bytes = readDescriptorExact(descriptor, identity.byteLength, 'SOURCE_ORIGIN_GIT_POLICY'); } finally { CLOSE_SYNC(descriptor); }
    after = LSTAT_SYNC(absolute, { bigint: true });
  } catch (error) {
    if (isCaptureRefusal(error)) throw error;
    refuse('SOURCE_ORIGIN_GIT_POLICY');
  }
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
      typedArrayLength(bytes) !== identity.byteLength || sha256CapturedBytes(bytes) !== identity.rawSha256) refuse('SOURCE_ORIGIN_GIT_POLICY');
  let value;
  try { value = validate(parseCanonicalJsonBytes(bytes, { label: locator })); } catch { refuse('SOURCE_ORIGIN_GIT_POLICY'); }
  if (value[semanticDigestField] !== identity.semanticDigest) refuse('SOURCE_ORIGIN_GIT_POLICY');
  return OBJECT_FREEZE({ bytes: copyHeldBuffer(bytes, 'SOURCE_ORIGIN_GIT_POLICY'), value, ...identity });
}

function readBootstrapOwners() {
  const pins = readBoundWorkingOwner(POLICY_PATHS.toolchainPins, OWNER_IDENTITIES.pins, validateToolchainPins, 'pinsDigest');
  const exporter = readBoundWorkingOwner(
    POLICY_PATHS.exporter,
    OWNER_IDENTITIES.exporter,
    (value) => validateLocalExporterPolicy(value, exporterBindings(value)),
    'policyDigest',
  );
  if (exporter.value.toolchainPinsDigest !== pins.value.pinsDigest ||
      canonicalLocalExporterPolicyData(exporter.value.gitProcessPolicy) !== SEALED_GIT_PROCESS_POLICY.canonical ||
      canonicalLocalExporterPolicyData(exporter.value.environmentPolicy) !== SEALED_GIT_ENVIRONMENT_POLICY.canonical ||
      canonicalLocalExporterPolicyData(exporter.value.limits) !== SEALED_EXPORTER_LIMITS_CANONICAL) refuse('SOURCE_ORIGIN_GIT_POLICY');
  return frozenNullRecord({ pins, exporter }, 'SOURCE_ORIGIN_GIT_POLICY');
}

function selectHostPin(pins) {
  const rows = safeArrayFilter(pins.records, (row) => row.platform === OS_PLATFORM() && row.arch === OS_ARCH());
  if ((OS_PLATFORM() !== 'win32' && OS_PLATFORM() !== 'linux') || OS_ARCH() !== 'x64' || rows.length !== 1) refuse('SOURCE_ORIGIN_HOLD_TOOLCHAIN');
  return rows[0];
}

function observeRegularFile(locator, expectedByteLength, code = 'SOURCE_ORIGIN_GIT_EXECUTABLE') {
  if (typeof locator !== 'string' || !PATH_IS_ABSOLUTE(locator) || PATH_NORMALIZE(locator) !== locator || stringIncludes(locator, '\0')) refuse(code);
  let before;
  let bytes;
  let after;
  try {
    before = LSTAT_SYNC(locator, { bigint: true });
    if (statIsKind(before, 'LINK') || !statIsKind(before, 'FILE') || before.size !== BIGINT_CONSTRUCTOR(expectedByteLength) || REALPATH_SYNC_NATIVE(locator) !== locator) refuse(code);
    const descriptor = OPEN_SYNC(locator, 'r');
    try { bytes = readDescriptorExact(descriptor, expectedByteLength, code); } finally { CLOSE_SYNC(descriptor); }
    after = LSTAT_SYNC(locator, { bigint: true });
  } catch (error) {
    if (isCaptureRefusal(error)) throw error;
    refuse(code);
  }
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || typedArrayLength(bytes) !== expectedByteLength) refuse(code);
  return OBJECT_FREEZE({ locator, byteLength: typedArrayLength(bytes), rawSha256: sha256CapturedBytes(bytes), stat: after });
}

function authenticateGitExecutable(locator, hostPin) {
  const observed = observeRegularFile(locator, hostPin.gitIdentity.executableByteLength);
  if (observed.rawSha256 !== hostPin.gitIdentity.executableRawSha256) refuse('SOURCE_ORIGIN_GIT_EXECUTABLE');
  return observed;
}

function buildEnvironment() {
  return SEALED_GIT_ENVIRONMENT;
}

function substituteArguments(values, substitutions, repositoryRoot = REPOSITORY_ROOT) {
  return safeArrayMap(values, (value) => {
    if (value === '<REPOSITORY_ROOT>') return repositoryRoot;
    if (value === 'core.worktree=<REPOSITORY_ROOT>') return `core.worktree=${repositoryRoot}`;
    if (value === '<BLOB_OID>') {
      if (!regexpTest(HEX_OID, substitutions.blobOid ?? '')) refuse('SOURCE_ORIGIN_GIT_PROCESS');
      return substitutions.blobOid;
    }
    if (value === '<TREE_OID>') {
      if (!regexpTest(HEX_OID, substitutions.treeOid ?? '')) refuse('SOURCE_ORIGIN_GIT_PROCESS');
      return substitutions.treeOid;
    }
    if (stringIncludes(value, '<')) refuse('SOURCE_ORIGIN_GIT_PROCESS');
    return value;
  });
}

function copySealedPolicyValue(value, code, state, depth) {
  if (depth > SEALED_POLICY_COPY_MAX_DEPTH || state.remainingNodes === 0) refuse(code);
  state.remainingNodes -= 1;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) refuse(code);
    return value;
  }
  if (typeof value === 'string') {
    if (hasUnpairedSurrogate(value) || value !== stringNormalize(value)) refuse(code);
    return value;
  }
  if (typeof value !== 'object') refuse(code);
  if (UTIL_TYPES_IS_PROXY(value) || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  if (REFLECT_APPLY(WEAK_SET_HAS, state.active, [value])) refuse(code);
  REFLECT_APPLY(WEAK_SET_ADD, state.active, [value]);
  try {
    if (ARRAY_IS_ARRAY(value)) {
      if (OBJECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE) refuse(code);
      const lengthDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
      if (!lengthDescriptor || !OBJECT_HAS_OWN(lengthDescriptor, 'value') ||
          !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
          lengthDescriptor.value > state.remainingNodes) refuse(code);
      const values = closedArrayValues(value, code);
      const output = new ARRAY_CONSTRUCTOR();
      for (let index = 0; index < values.length; index += 1) {
        safeArrayAppend(output, copySealedPolicyValue(values[index], code, state, depth + 1));
      }
      return OBJECT_FREEZE(output);
    }
    const prototype = OBJECT_GET_PROTOTYPE_OF(value);
    if (prototype !== OBJECT_PROTOTYPE && prototype !== null) refuse(code);
    const output = OBJECT_CREATE(null);
    const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
    if (names.length > state.remainingNodes) refuse(code);
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      if (hasUnpairedSurrogate(name) || name !== stringNormalize(name)) refuse(code);
      const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, name);
      if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
      setDynamicData(output, name, copySealedPolicyValue(descriptor.value, code, state, depth + 1));
    }
    return OBJECT_FREEZE(output);
  } finally {
    REFLECT_APPLY(WEAK_SET_DELETE, state.active, [value]);
  }
}

function copySealedPolicyData(value, code = 'SOURCE_ORIGIN_GIT_PROCESS') {
  const state = OBJECT_CREATE(null);
  setDynamicData(state, 'active', new WEAK_SET_CONSTRUCTOR());
  setDynamicData(state, 'remainingNodes', SEALED_POLICY_COPY_MAX_NODES);
  return copySealedPolicyValue(value, code, state, 0);
}

function copyLocalExporterPolicyData(value) {
  try { return copySealedPolicyData(value, 'SOURCE_ORIGIN_GIT_POLICY'); } catch { refuse('SOURCE_ORIGIN_GIT_POLICY'); }
}

function canonicalLocalExporterPolicyData(value) {
  try { return canonicalJsonText(value); } catch { refuse('SOURCE_ORIGIN_GIT_POLICY'); }
}

function hashLocalExporterPolicyData(domain, value) {
  try { return sha256CanonicalCaptured(domain, value); } catch { refuse('SOURCE_ORIGIN_GIT_POLICY'); }
}

function exactSealedObject(value, keys, code) {
  if (value === null || typeof value !== 'object' || UTIL_TYPES_IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      OBJECT_GET_PROTOTYPE_OF(value) !== null || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  if (names.length !== keys.length) refuse(code);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, names[index]);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
  }
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    if (!OBJECT_HAS_OWN(value, keys[keyIndex])) refuse(code);
  }
  return value;
}

function sealedWithoutField(value, excluded, code) {
  const output = OBJECT_CREATE(null);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (name === excluded) continue;
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, name);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
    setDynamicData(output, name, descriptor.value);
  }
  return OBJECT_FREEZE(output);
}

function frozenNullRecord(values, code = 'SOURCE_ORIGIN_GIT_PROCESS') {
  const output = OBJECT_CREATE(null);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(values);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(values, names[index]);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
    setDynamicData(output, names[index], descriptor.value);
  }
  return OBJECT_FREEZE(output);
}

function asyncEnvelope(value) {
  const output = OBJECT_CREATE(null);
  setDynamicData(output, 'value', value);
  return OBJECT_FREEZE(output);
}

function unwrapAsyncEnvelope(value, code = 'SOURCE_ORIGIN_GIT_PROCESS') {
  exactSealedObject(value, ['value'], code);
  return sealedRecordValue(value, 'value');
}

function sealedRecordValue(record, key) {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(record, key);
  return descriptor && OBJECT_HAS_OWN(descriptor, 'value') ? descriptor.value : undefined;
}

function materializeSealedGitEnvironmentPolicy(policyValue) {
  const code = 'SOURCE_ORIGIN_GIT_ENVIRONMENT';
  const policy = copySealedPolicyData(policyValue, code);
  exactSealedObject(policy, ['authorizing', 'commonEntries', 'forbiddenKeys', 'platformRows', 'policyDigest', 'schema'], code);
  if (policy.schema !== 'galerina.logic-aig-git-environment-policy.v2' || policy.authorizing !== false ||
      policy.policyDigest !== '2f82f6e34936fb0039bd505c489aad1224742dde6bca42a1739378560376022d' ||
      sha256CanonicalCaptured(policy.schema, sealedWithoutField(policy, 'policyDigest', code)) !== policy.policyDigest) refuse(code);

  const commonEntries = closedArrayValues(policy.commonEntries, code);
  if (commonEntries.length !== 10) refuse(code);
  const commonKeys = OBJECT_CREATE(null);
  for (let index = 0; index < commonEntries.length; index += 1) {
    const row = commonEntries[index];
    const hasValue = OBJECT_HAS_OWN(row, 'value');
    exactSealedObject(row, hasValue ? ['key', 'value'] : ['key', 'valueByPlatform'], code);
    if (typeof row.key !== 'string' || row.key.length === 0 || sealedRecordValue(commonKeys, row.key) !== undefined) refuse(code);
    if (hasValue) {
      if (typeof row.value !== 'string') refuse(code);
    } else {
      exactSealedObject(row.valueByPlatform, ['linux', 'win32'], code);
      if (typeof row.valueByPlatform.linux !== 'string' || typeof row.valueByPlatform.win32 !== 'string') refuse(code);
    }
    setDynamicData(commonKeys, row.key, true);
  }

  const platformRows = closedArrayValues(policy.platformRows, code);
  if (platformRows.length !== 2) refuse(code);
  const platformByName = OBJECT_CREATE(null);
  for (let index = 0; index < platformRows.length; index += 1) {
    const row = platformRows[index];
    exactSealedObject(row, ['copiedParentKeys', 'platform'], code);
    if ((row.platform !== 'linux' && row.platform !== 'win32') || sealedRecordValue(platformByName, row.platform) !== undefined) refuse(code);
    const copied = closedArrayValues(row.copiedParentKeys, code);
    if ((row.platform === 'linux' && copied.length !== 0) ||
        (row.platform === 'win32' && (copied.length !== 1 || copied[0] !== 'SystemRoot'))) refuse(code);
    setDynamicData(platformByName, row.platform, row);
  }
  if (!sealedRecordValue(platformByName, 'linux') || !sealedRecordValue(platformByName, 'win32')) refuse(code);

  const forbiddenKeys = closedArrayValues(policy.forbiddenKeys, code);
  if (forbiddenKeys.length !== EXPECTED_FORBIDDEN_GIT_ENVIRONMENT_KEYS.length) refuse(code);
  for (let index = 0; index < forbiddenKeys.length; index += 1) {
    if (forbiddenKeys[index] !== EXPECTED_FORBIDDEN_GIT_ENVIRONMENT_KEYS[index] || sealedRecordValue(commonKeys, forbiddenKeys[index]) !== undefined) refuse(code);
  }
  return OBJECT_FREEZE({
    policy,
    canonical: canonicalJsonText(policy),
    platformByName: OBJECT_FREEZE(platformByName),
  });
}

function materializeHostGitEnvironment() {
  const code = 'SOURCE_ORIGIN_GIT_ENVIRONMENT';
  const currentPlatform = OS_PLATFORM();
  const currentArchitecture = OS_ARCH();
  if ((currentPlatform !== 'linux' && currentPlatform !== 'win32') || currentArchitecture !== 'x64') refuse(code);
  const platformRow = sealedRecordValue(SEALED_GIT_ENVIRONMENT_POLICY.platformByName, currentPlatform);
  if (!platformRow) refuse(code);
  const output = OBJECT_CREATE(null);
  for (let index = 0; index < SEALED_GIT_ENVIRONMENT_POLICY.policy.commonEntries.length; index += 1) {
    const row = SEALED_GIT_ENVIRONMENT_POLICY.policy.commonEntries[index];
    const value = OBJECT_HAS_OWN(row, 'value') ? row.value : sealedRecordValue(row.valueByPlatform, currentPlatform);
    if (typeof value !== 'string' || OBJECT_HAS_OWN(output, row.key)) refuse(code);
    setDynamicData(output, row.key, value);
  }
  if (currentPlatform === 'win32') {
    const systemRoot = SYSTEM_ROOT;
    if (typeof systemRoot !== 'string' || systemRoot.length === 0 || stringIncludes(systemRoot, '\0') || !PATH_IS_ABSOLUTE(systemRoot)) refuse(code);
    let details;
    try { details = STAT_SYNC(systemRoot); } catch { refuse(code); }
    if (!statIsKind(details, 'DIRECTORY')) refuse(code);
    setDynamicData(output, 'SystemRoot', systemRoot);
  }
  const expectedKeys = SEALED_GIT_ENVIRONMENT_POLICY.policy.commonEntries.length + (currentPlatform === 'win32' ? 1 : 0);
  if (OBJECT_GET_OWN_PROPERTY_NAMES(output).length !== expectedKeys) refuse(code);
  return OBJECT_FREEZE(output);
}

function requireSealedGitEnvironment(value) {
  const code = 'SOURCE_ORIGIN_GIT_ENVIRONMENT';
  if (value === null || typeof value !== 'object' || UTIL_TYPES_IS_PROXY(value) || ARRAY_IS_ARRAY(value) ||
      OBJECT_GET_PROTOTYPE_OF(value) !== null || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  const expectedNames = OBJECT_GET_OWN_PROPERTY_NAMES(SEALED_GIT_ENVIRONMENT);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  if (names.length !== expectedNames.length) refuse(code);
  for (let index = 0; index < expectedNames.length; index += 1) {
    const name = expectedNames[index];
    const expected = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(SEALED_GIT_ENVIRONMENT, name);
    const observed = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, name);
    if (!expected || !observed || !OBJECT_HAS_OWN(observed, 'value') || !observed.enumerable || observed.value !== expected.value) refuse(code);
  }
  return SEALED_GIT_ENVIRONMENT;
}

function materializeSealedProducerArgvPolicy(policyValue, expectedCanonical) {
  const code = 'SOURCE_ORIGIN_GIT_POLICY';
  const policy = copyLocalExporterPolicyData(policyValue);
  exactSealedObject(policy, PRODUCER_ARGV_POLICY_FIELDS, code);
  if (policy.schema !== 'galerina.logic-aig-producer-argv-policy.v2' ||
      policy.authorizing !== false ||
      policy.policyDigest !== APPROVED_PRODUCER_ARGV_POLICY_DIGEST ||
      hashLocalExporterPolicyData(policy.schema, sealedWithoutField(policy, 'policyDigest', code)) !== policy.policyDigest) refuse(code);
  const canonical = canonicalLocalExporterPolicyData(policy);
  if (expectedCanonical !== undefined &&
      (typeof expectedCanonical !== 'string' || canonical !== expectedCanonical)) refuse(code);
  return OBJECT_FREEZE({ policy, canonical });
}

export function validateLocalExporterPolicy(
  value,
  expectedBindings,
  expectedPolicyDigest = OWNER_IDENTITIES.exporter.semanticDigest,
) {
  const code = 'SOURCE_ORIGIN_GIT_POLICY';
  if (typeof expectedPolicyDigest !== 'string' || !regexpTest(HEX64, expectedPolicyDigest)) refuse(code);
  const policy = copyLocalExporterPolicyData(value);
  exactSealedObject(policy, EXPORTER_POLICY_FIELDS, code);
  if (policy.schema !== 'galerina.logic-aig-exporter-policy.v2' ||
      policy.decoderId !== 'galerina-source-origin' ||
      policy.canonicalizationId !== 'utf8-nfc-code-unit-canonical-json-v1' ||
      policy.authorizing !== false || policy.policyDigest !== expectedPolicyDigest ||
      hashLocalExporterPolicyData(policy.schema, sealedWithoutField(policy, 'policyDigest', code)) !== policy.policyDigest) refuse(code);

  const argvPolicy = materializeSealedProducerArgvPolicy(
    sealedRecordValue(policy, 'argvPolicy'),
    SEALED_PRODUCER_ARGV_POLICY.canonical,
  );

  const bindings = captureExpectedExporterBindings(expectedBindings);
  for (let index = 0; index < EXPORTER_BINDING_FIELDS.length; index += 1) {
    const field = EXPORTER_BINDING_FIELDS[index];
    if (policy[field] !== sealedRecordValue(bindings, field)) refuse(code);
  }
  if (policy.argvPolicyDigest !== APPROVED_PRODUCER_ARGV_POLICY_DIGEST ||
      policy.argvPolicyDigest !== argvPolicy.policy.policyDigest ||
      policy.gitProcessPolicyDigest !== SEALED_GIT_PROCESS_POLICY.policy.policyDigest ||
      policy.environmentPolicyDigest !== SEALED_GIT_ENVIRONMENT_POLICY.policy.policyDigest ||
      canonicalLocalExporterPolicyData(policy.gitProcessPolicy) !== SEALED_GIT_PROCESS_POLICY.canonical ||
      canonicalLocalExporterPolicyData(policy.environmentPolicy) !== SEALED_GIT_ENVIRONMENT_POLICY.canonical ||
      canonicalLocalExporterPolicyData(policy.limits) !== SEALED_EXPORTER_LIMITS_CANONICAL ||
      canonicalLocalExporterPolicyData(policy.nodeKinds) !== canonicalLocalExporterPolicyData(EXPECTED_NODE_KINDS) ||
      canonicalLocalExporterPolicyData(policy.relationshipKinds) !== canonicalLocalExporterPolicyData(EXPECTED_RELATIONSHIP_KINDS)) refuse(code);
  return policy;
}

function materializeSealedGitProcessPolicy(policyValue) {
  let validated;
  try { validated = validateGitProcessPolicy(policyValue); } catch { refuse('SOURCE_ORIGIN_GIT_PROCESS'); }
  exactObject(validated, [
    'schema', 'fixedPrefix', 'commandRows', 'configAllowanceRows', 'outputLimitRows',
    'stderrRule', 'shell', 'windowsHide', 'authorizing', 'policyDigest',
  ], 'SOURCE_ORIGIN_GIT_PROCESS');
  const fixedPrefix = closedArrayValues(validated.fixedPrefix, 'SOURCE_ORIGIN_GIT_PROCESS');
  const commandRows = closedArrayValues(validated.commandRows, 'SOURCE_ORIGIN_GIT_PROCESS');
  const outputLimitRows = closedArrayValues(validated.outputLimitRows, 'SOURCE_ORIGIN_GIT_PROCESS');
  for (let index = 0; index < fixedPrefix.length; index += 1) {
    if (typeof fixedPrefix[index] !== 'string') refuse('SOURCE_ORIGIN_GIT_PROCESS');
  }
  for (let index = 0; index < commandRows.length; index += 1) {
    const row = commandRows[index];
    exactObject(row, ['commandId', 'arguments', 'outputLimitId', 'stdoutRule'], 'SOURCE_ORIGIN_GIT_PROCESS');
    const argumentsList = closedArrayValues(row.arguments, 'SOURCE_ORIGIN_GIT_PROCESS');
    if (typeof row.commandId !== 'string' || typeof row.outputLimitId !== 'string' || typeof row.stdoutRule !== 'string' ||
        safeArraySome(argumentsList, (argument) => typeof argument !== 'string')) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  }
  for (let index = 0; index < outputLimitRows.length; index += 1) {
    const row = outputLimitRows[index];
    exactObject(row, ['outputLimitId', 'maximumBytes', 'maximumSource'], 'SOURCE_ORIGIN_GIT_PROCESS');
    if (typeof row.outputLimitId !== 'string' || typeof row.maximumSource !== 'string' ||
        (row.maximumBytes !== null && (!NUMBER_IS_SAFE_INTEGER(row.maximumBytes) || row.maximumBytes <= 0))) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  }
  const policy = copySealedPolicyData(validated);
  const commandById = OBJECT_CREATE(null);
  const limitById = OBJECT_CREATE(null);
  const blobLimitByClass = OBJECT_CREATE(null);
  for (let index = 0; index < policy.outputLimitRows.length; index += 1) {
    const row = policy.outputLimitRows[index];
    if (sealedRecordValue(limitById, row.outputLimitId) !== undefined) refuse('SOURCE_ORIGIN_GIT_PROCESS');
    setDynamicData(limitById, row.outputLimitId, row);
  }
  for (let index = 0; index < policy.commandRows.length; index += 1) {
    const row = policy.commandRows[index];
    if (sealedRecordValue(commandById, row.commandId) !== undefined || sealedRecordValue(limitById, row.outputLimitId) === undefined) refuse('SOURCE_ORIGIN_GIT_PROCESS');
    setDynamicData(commandById, row.commandId, row);
  }
  const capturedFileMaximum = SOURCE_ORIGIN_LIMITS.capturedFileBytes < SOURCE_ORIGIN_LIMITS.processOutputBytes
    ? SOURCE_ORIGIN_LIMITS.capturedFileBytes
    : SOURCE_ORIGIN_LIMITS.processOutputBytes;
  const jsonMaximum = SOURCE_ORIGIN_LIMITS.jsonBytes < SOURCE_ORIGIN_LIMITS.processOutputBytes
    ? SOURCE_ORIGIN_LIMITS.jsonBytes
    : SOURCE_ORIGIN_LIMITS.processOutputBytes;
  if (!NUMBER_IS_SAFE_INTEGER(capturedFileMaximum) || capturedFileMaximum <= 0 ||
      !NUMBER_IS_SAFE_INTEGER(jsonMaximum) || jsonMaximum <= 0) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  setDynamicData(blobLimitByClass, 'CAPTURED_FILE', capturedFileMaximum);
  setDynamicData(blobLimitByClass, 'JSON', jsonMaximum);
  const canonical = canonicalJsonText(policy);
  if (canonical !== canonicalJsonText(validated)) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  return OBJECT_FREEZE({
    policy,
    canonical,
    commandById: OBJECT_FREEZE(commandById),
    limitById: OBJECT_FREEZE(limitById),
    blobLimitByClass: OBJECT_FREEZE(blobLimitByClass),
  });
}

const SEALED_PRODUCER_ARGV_POLICY = materializeSealedProducerArgvPolicy(PRODUCER_ARGV_POLICY);
const SEALED_GIT_PROCESS_POLICY = materializeSealedGitProcessPolicy(OWNER_PROPOSAL_POLICY.gitProcessPolicy);
const SEALED_GIT_ENVIRONMENT_POLICY = materializeSealedGitEnvironmentPolicy(OWNER_PROPOSAL_POLICY.environmentPolicy);
const SEALED_EXPORTER_LIMITS = copyLocalExporterPolicyData(OWNER_PROPOSAL_POLICY.limits);
const SEALED_EXPORTER_LIMITS_CANONICAL = canonicalLocalExporterPolicyData(SEALED_EXPORTER_LIMITS);
const SEALED_GIT_ENVIRONMENT = materializeHostGitEnvironment();
const BOOTSTRAP_OWNERS = readBootstrapOwners();

function requireSealedGitProcessPolicy(policyValue) {
  let canonical;
  try { canonical = canonicalJsonText(policyValue); } catch { refuse('SOURCE_ORIGIN_GIT_PROCESS'); }
  if (canonical !== SEALED_GIT_PROCESS_POLICY.canonical) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  return SEALED_GIT_PROCESS_POLICY;
}

export function materializeGitCommand(processPolicy, commandId, repositoryRoot, substitutions = {}, blobClass) {
  if (typeof repositoryRoot !== 'string' || !PATH_IS_ABSOLUTE(repositoryRoot) || PATH_NORMALIZE(repositoryRoot) !== repositoryRoot || stringIncludes(repositoryRoot, '\0')) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  if (typeof commandId !== 'string') refuse('SOURCE_ORIGIN_GIT_PROCESS');
  const sealed = requireSealedGitProcessPolicy(processPolicy);
  const selected = sealedRecordValue(sealed.commandById, commandId);
  if (!selected) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  const limit = sealedRecordValue(sealed.limitById, selected.outputLimitId);
  if (!limit) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  let maximumBytes;
  if (selected.outputLimitId === 'BLOB') {
    maximumBytes = sealedRecordValue(sealed.blobLimitByClass, blobClass);
    if (maximumBytes === undefined) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  } else {
    maximumBytes = limit.maximumBytes;
  }
  if (!NUMBER_IS_SAFE_INTEGER(maximumBytes) || maximumBytes <= 0 || maximumBytes > SOURCE_ORIGIN_LIMITS.processOutputBytes) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  const argumentsList = substituteArguments(sealed.policy.fixedPrefix, substitutions, repositoryRoot);
  const selectedArguments = substituteArguments(selected.arguments, substitutions, repositoryRoot);
  for (let index = 0; index < selectedArguments.length; index += 1) safeArrayAppend(argumentsList, selectedArguments[index]);
  const argvDigest = sha256CanonicalCaptured('galerina.logic-aig-git-command-argv.v1', { commandId, arguments: argumentsList });
  return OBJECT_FREEZE({
    arguments: OBJECT_FREEZE(argumentsList),
    maximumBytes,
    stdoutRule: selected.stdoutRule,
    argvDigest,
  });
}

function killChild(child) {
  try { REFLECT_APPLY(CHILD_PROCESS_KILL, child, ['SIGKILL']); } catch { /* fail path */ }
}

export function exceedsChildOutputLimit(stdoutBytes, stderrBytes, commandMaximumBytes, processOutputBytes) {
  if (!safeArrayEvery([stdoutBytes, stderrBytes, commandMaximumBytes, processOutputBytes], (value) => NUMBER_IS_SAFE_INTEGER(value) && value >= 0)) refuse('SOURCE_ORIGIN_LIMIT');
  return stdoutBytes > commandMaximumBytes || stderrBytes > commandMaximumBytes || stdoutBytes + stderrBytes > processOutputBytes;
}

async function collectChild(child, maximumBytes, processOutputBytes, deadline) {
  return await new PROMISE_CONSTRUCTOR((resolve, reject) => {
    const stdout = new ARRAY_CONSTRUCTOR();
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer;
    const fail = (code) => {
      if (settled) return;
      settled = true;
      if (timer) CLEAR_TIMEOUT(timer);
      killChild(child);
      reject(new SourceOriginCaptureRefusal(code));
    };
    const remaining = deadline - REFLECT_APPLY(DATE_NOW, undefined, []);
    if (remaining <= 0) return fail('SOURCE_ORIGIN_GIT_PROCESS');
    timer = SET_TIMEOUT(() => fail('SOURCE_ORIGIN_GIT_PROCESS'), remaining);
    REFLECT_APPLY(EVENT_EMITTER_ON, child.stdout, ['data', (chunk) => {
      stdoutBytes += typedArrayLength(chunk);
      if (exceedsChildOutputLimit(stdoutBytes, stderrBytes, maximumBytes, processOutputBytes)) fail('SOURCE_ORIGIN_LIMIT');
      else safeArrayAppend(stdout, exactBuffer(chunk, undefined, 'SOURCE_ORIGIN_GIT_PROCESS'));
    }]);
    REFLECT_APPLY(EVENT_EMITTER_ON, child.stderr, ['data', (chunk) => {
      stderrBytes += typedArrayLength(chunk);
      if (exceedsChildOutputLimit(stdoutBytes, stderrBytes, maximumBytes, processOutputBytes)) fail('SOURCE_ORIGIN_LIMIT');
    }]);
    REFLECT_APPLY(EVENT_EMITTER_ON, child, ['error', () => fail('SOURCE_ORIGIN_GIT_PROCESS')]);
    REFLECT_APPLY(EVENT_EMITTER_ON, child, ['close', (status, signal) => {
      if (settled) return;
      settled = true;
      CLEAR_TIMEOUT(timer);
      if (status !== 0 || signal !== null || stderrBytes !== 0) reject(new SourceOriginCaptureRefusal('SOURCE_ORIGIN_GIT_PROCESS'));
      else resolve(asyncEnvelope(concatExactBuffers(stdout, processOutputBytes, 'SOURCE_ORIGIN_GIT_PROCESS')));
    }]);
    try {
      REFLECT_APPLY(READABLE_RESUME, child.stdout, []);
      REFLECT_APPLY(READABLE_RESUME, child.stderr, []);
    } catch {
      fail('SOURCE_ORIGIN_GIT_PROCESS');
    }
  });
}

function hasUtf8Bom(bytes) {
  const length = typedArrayLength(bytes);
  return length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

export function decodeGitLine(bytes, code = 'SOURCE_ORIGIN_GIT_PROCESS') {
  captureExactBufferState(bytes, code);
  if (hasUtf8Bom(bytes)) refuse(code);
  let value;
  try {
    value = REFLECT_APPLY(TEXT_DECODER_DECODE, UTF8_DECODER, [bytes]);
  } catch {
    refuse(code);
  }
  if (!stringEndsWith(value, '\n')) refuse(code);
  value = stringSlice(value, 0, -1);
  if (stringEndsWith(value, '\r')) value = stringSlice(value, 0, -1);
  if (value.length === 0 || stringIncludes(value, '\0') || stringIncludes(value, '\n') || stringIncludes(value, '\r')) refuse(code);
  return value;
}

function decodeUtf8(bytes, code) {
  captureExactBufferState(bytes, code);
  if (hasUtf8Bom(bytes)) refuse(code);
  try {
    const text = REFLECT_APPLY(TEXT_DECODER_DECODE, UTF8_DECODER, [bytes]);
    if (text !== stringNormalize(text)) refuse(code);
    return text;
  } catch {
    refuse(code);
  }
}

function configAssignmentRows(processPolicy, repositoryRoot) {
  const rows = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < processPolicy.fixedPrefix.length; index += 1) {
    if (processPolicy.fixedPrefix[index] !== '-c') continue;
    const assignment = stringReplace(processPolicy.fixedPrefix[index + 1], '<REPOSITORY_ROOT>', repositoryRoot);
    const split = stringIndexOf(assignment, '=');
    if (split <= 0) refuse('SOURCE_ORIGIN_GIT_CONFIG');
    safeArrayAppend(rows, { key: stringSlice(assignment, 0, split), value: stringSlice(assignment, split + 1) });
  }
  return safeArraySort(rows, (left, right) => codeUnitCompare(`${left.key}\0${left.value}`, `${right.key}\0${right.value}`));
}

function allowanceMatches(key, row) {
  if (!stringIncludes(row.keyRule, '<SUBSECTION>')) return key === row.keyRule;
  const components = stringSplit(row.keyRule, '<SUBSECTION>');
  const prefix = components[0];
  const suffix = components[1];
  if (!stringStartsWith(key, prefix) || !stringEndsWith(key, suffix)) return false;
  const subsection = stringSlice(key, prefix.length, key.length - suffix.length);
  return subsection.length > 0 && subsection === stringNormalize(subsection) && !regexpTest(CONTROL, subsection);
}

function allowanceValueMatches(value, rule) {
  if (rule === 'BOOL') return value === 'true' || value === 'false';
  if (rule === 'BOOL_OR_ALWAYS') return value === 'true' || value === 'false' || value === 'always';
  if (rule === 'FALSE') return value === 'false';
  if (rule === 'TRUE') return value === 'true';
  if (rule === 'ZERO') return value === '0';
  if (rule === 'DOT') return value === '.';
  if (rule === 'NONEMPTY_TEXT') return value.length > 0 && value === stringNormalize(value) && !regexpTest(CONTROL, value);
  return false;
}

export function parseGitConfigRows(bytes, processPolicyValue, repositoryRoot) {
  let processPolicy;
  try { processPolicy = requireSealedGitProcessPolicy(processPolicyValue).policy; } catch { refuse('SOURCE_ORIGIN_GIT_CONFIG'); }
  if (typeof repositoryRoot !== 'string' || !PATH_IS_ABSOLUTE(repositoryRoot) || stringIncludes(repositoryRoot, '\0')) refuse('SOURCE_ORIGIN_GIT_CONFIG');
  const text = decodeUtf8(bytes, 'SOURCE_ORIGIN_GIT_CONFIG');
  if (!stringEndsWith(text, '\0')) refuse('SOURCE_ORIGIN_GIT_CONFIG');
  const fields = stringSplit(stringSlice(text, 0, -1), '\0');
  if (fields.length === 0 || fields.length % 3 !== 0) refuse('SOURCE_ORIGIN_GIT_CONFIG');
  const commandRows = new ARRAY_CONSTRUCTOR();
  const localRows = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < fields.length; index += 3) {
    const scope = fields[index];
    const origin = fields[index + 1];
    const assignment = fields[index + 2];
    const newline = stringIndexOf(assignment, '\n');
    if ((scope !== 'command' && scope !== 'local') || !origin || regexpTest(CONTROL, origin) || origin !== stringNormalize(origin) ||
        newline <= 0 || stringIndexOf(assignment, '\n', newline + 1) !== -1) refuse('SOURCE_ORIGIN_GIT_CONFIG');
    const key = stringSlice(assignment, 0, newline);
    const value = stringSlice(assignment, newline + 1);
    if (!key || key !== stringNormalize(key) || regexpTest(CONTROL, key)) refuse('SOURCE_ORIGIN_GIT_CONFIG');
    safeArrayAppend(scope === 'command' ? commandRows : localRows, { key, value });
  }
  safeArraySort(commandRows, (left, right) => codeUnitCompare(`${left.key}\0${left.value}`, `${right.key}\0${right.value}`));
  if (canonicalJsonText(commandRows) !== canonicalJsonText(configAssignmentRows(processPolicy, repositoryRoot))) refuse('SOURCE_ORIGIN_GIT_CONFIG');
  const normalized = new ARRAY_CONSTRUCTOR();
  const seen = new MAP_CONSTRUCTOR();
  for (let index = 0; index < localRows.length; index += 1) {
    const row = localRows[index];
    const matches = safeArrayFilter(processPolicy.configAllowanceRows, (allowance) => allowanceMatches(row.key, allowance));
    if (matches.length !== 1 || !allowanceValueMatches(row.value, matches[0].valueRule)) refuse('SOURCE_ORIGIN_GIT_CONFIG');
    const allowance = matches[0];
    const prior = mapGet(seen, row.key) ?? new ARRAY_CONSTRUCTOR();
    if (allowance.cardinality === 'SINGLETON' ? prior.length !== 0 : safeArrayIncludes(prior, row.value)) refuse('SOURCE_ORIGIN_GIT_CONFIG');
    safeArrayAppend(prior, row.value);
    mapSet(seen, row.key, prior);
    safeArrayAppend(normalized, { scope: 'local', key: row.key, value: row.value });
  }
  safeArraySort(normalized, (left, right) => codeUnitCompare(`${left.key}\0${left.value}`, `${right.key}\0${right.value}`));
  return OBJECT_FREEZE({
    commandRowCount: commandRows.length,
    localRowCount: normalized.length,
    semanticDigest: sha256CanonicalCaptured('galerina.logic-aig-local-git-config.v1', normalized),
  });
}

function oidPattern(objectFormat) {
  if (objectFormat === 'sha1') return OID_PATTERNS.sha1;
  if (objectFormat === 'sha256') return OID_PATTERNS.sha256;
  refuse('SOURCE_ORIGIN_GIT_OBJECT_FORMAT');
}

export function parseGitTreeRows(bytes, objectFormat) {
  const byteLength = captureExactBufferState(bytes, 'SOURCE_ORIGIN_GIT_TREE').length;
  if (byteLength === 0 || bytes[byteLength - 1] !== 0) refuse('SOURCE_ORIGIN_GIT_TREE');
  const pattern = oidPattern(objectFormat);
  const rows = new ARRAY_CONSTRUCTOR();
  const paths = new SET_CONSTRUCTOR();
  const foldedPaths = new SET_CONSTRUCTOR();
  const records = stringSplit(decodeUtf8(bufferSubarray(bytes, 0, -1), 'SOURCE_ORIGIN_GIT_TREE'), '\0');
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const match = regexpExec(/^(\d{6}) (blob|tree|commit) ([0-9a-f]+)\t([\s\S]+)$/, record);
    if (!match) refuse('SOURCE_ORIGIN_GIT_TREE');
    const mode = match[1];
    const type = match[2];
    const blobOid = match[3];
    const locator = match[4];
    validatePath(locator);
    if (!regexpTest(pattern, blobOid)) refuse('SOURCE_ORIGIN_GIT_OBJECT_FORMAT');
    if (mode !== '100644' && mode !== '100755' || type !== 'blob') refuse('SOURCE_ORIGIN_GIT_MODE');
    const folded = stringToLowerCase(locator);
    if (setHas(paths, locator)) refuse('SOURCE_ORIGIN_GIT_DUPLICATE');
    if (setHas(foldedPaths, folded)) refuse('SOURCE_ORIGIN_GIT_CASE_SHADOW');
    setAdd(paths, locator);
    setAdd(foldedPaths, folded);
    safeArrayAppend(rows, OBJECT_FREEZE({ path: locator, mode, blobOid }));
  }
  return OBJECT_FREEZE(rows);
}

function parseStageRows(bytes, objectFormat) {
  const byteLength = captureExactBufferState(bytes, 'SOURCE_ORIGIN_GIT_INDEX').length;
  if (byteLength !== 0 && bytes[byteLength - 1] !== 0) refuse('SOURCE_ORIGIN_GIT_INDEX');
  const pattern = oidPattern(objectFormat);
  const rows = new ARRAY_CONSTRUCTOR();
  const stageKeys = new SET_CONSTRUCTOR();
  const records = byteLength === 0 ? new ARRAY_CONSTRUCTOR() : stringSplit(decodeUtf8(bufferSubarray(bytes, 0, -1), 'SOURCE_ORIGIN_GIT_INDEX'), '\0');
  for (let index = 0; index < records.length; index += 1) {
    const match = regexpExec(/^(\d{6}) ([0-9a-f]+) ([0-3])\t([\s\S]+)$/, records[index]);
    if (!match) refuse('SOURCE_ORIGIN_GIT_INDEX');
    const mode = match[1];
    const blobOid = match[2];
    const stageText = match[3];
    const locator = match[4];
    validatePath(locator);
    if (!regexpTest(pattern, blobOid)) refuse('SOURCE_ORIGIN_GIT_OBJECT_FORMAT');
    const stage = REFLECT_APPLY(NUMBER_CONSTRUCTOR, undefined, [stageText]);
    const key = `${locator}\0${stage}`;
    if (setHas(stageKeys, key)) refuse('SOURCE_ORIGIN_GIT_INDEX');
    setAdd(stageKeys, key);
    safeArrayAppend(rows, { path: locator, mode, blobOid, stage });
  }
  return rows;
}

function parseFlagRows(bytes) {
  const byteLength = captureExactBufferState(bytes, 'SOURCE_ORIGIN_GIT_INDEX').length;
  if (byteLength !== 0 && bytes[byteLength - 1] !== 0) refuse('SOURCE_ORIGIN_GIT_INDEX');
  const flags = new MAP_CONSTRUCTOR();
  const records = byteLength === 0 ? new ARRAY_CONSTRUCTOR() : stringSplit(decodeUtf8(bufferSubarray(bytes, 0, -1), 'SOURCE_ORIGIN_GIT_INDEX'), '\0');
  for (let index = 0; index < records.length; index += 1) {
    const match = regexpExec(/^([A-Za-z?]) ([\s\S]+)$/, records[index]);
    if (!match) refuse('SOURCE_ORIGIN_GIT_INDEX');
    const tag = match[1];
    const locator = match[2];
    validatePath(locator);
    if (mapHas(flags, locator)) refuse('SOURCE_ORIGIN_GIT_INDEX');
    mapSet(flags, locator, OBJECT_FREEZE({
      assumeUnchanged: tag === stringToLowerCase(tag),
      skipWorktree: stringToUpperCase(tag) === 'S',
    }));
  }
  return flags;
}

export function observeGitIndex(stageBytes, flagBytes, objectFormat, treeRows) {
  const stages = parseStageRows(stageBytes, objectFormat);
  const flags = parseFlagRows(flagBytes);
  if (safeArraySome(stages, (row) => row.stage !== 0 || row.mode !== '100644' && row.mode !== '100755')) refuse('SOURCE_ORIGIN_GIT_INDEX');
  const rows = safeArraySort(
    safeArrayMap(stages, (row) => {
      const observedFlags = mapGet(flags, row.path);
      if (!observedFlags || observedFlags.assumeUnchanged || observedFlags.skipWorktree) refuse('SOURCE_ORIGIN_GIT_INDEX');
      return OBJECT_FREEZE({ ...row, ...observedFlags });
    }),
    (left, right) => codeUnitCompare(left.path, right.path),
  );
  if (mapSize(flags) !== rows.length || rows.length !== treeRows.length) refuse('SOURCE_ORIGIN_GIT_INDEX');
  const sortedTree = safeArraySort(safeArrayCopy(treeRows), (left, right) => codeUnitCompare(left.path, right.path));
  for (let index = 0; index < rows.length; index += 1) {
    const actual = rows[index];
    const expected = sortedTree[index];
    if (actual.path !== expected.path || actual.mode !== expected.mode || actual.blobOid !== expected.blobOid) refuse('SOURCE_ORIGIN_GIT_INDEX');
  }
  const digestRows = safeArrayMap(rows, (row) => ({
    path: row.path,
    mode: row.mode,
    blobOid: row.blobOid,
    stage: row.stage,
    assumeUnchanged: row.assumeUnchanged,
    skipWorktree: row.skipWorktree,
  }));
  return OBJECT_FREEZE({
    rows: OBJECT_FREEZE(safeArrayMap(digestRows, (row) => OBJECT_FREEZE(row))),
    indexDigest: sha256CanonicalCaptured('galerina.logic-aig-git-index.v1', { objectFormat, rows: digestRows }),
  });
}

export function canonicalExistingPath(locator, kind, code = 'SOURCE_ORIGIN_GIT_LAYOUT') {
  if (typeof locator !== 'string' || !PATH_IS_ABSOLUTE(locator) || stringIncludes(locator, '\0')) refuse(code);
  let observed;
  let real;
  try {
    observed = LSTAT_SYNC(locator);
    real = REALPATH_SYNC_NATIVE(locator);
  } catch { refuse(code); }
  if (statIsKind(observed, 'LINK') || (kind === 'DIRECTORY' ? !statIsKind(observed, 'DIRECTORY') : !statIsKind(observed, 'FILE'))) refuse(code);
  const canonicalText = OS_PLATFORM() === 'win32' ? stringReplaceAll(real, '\\', '/') : real;
  if (locator !== canonicalText) refuse(code);
  return real;
}

export function assertCanonicalRepositoryLayout(value) {
  exactObject(value, ['repositoryRoot', 'toplevel', 'gitDirectory', 'indexPath'], 'SOURCE_ORIGIN_GIT_LAYOUT');
  let repositoryRoot;
  try {
    const details = LSTAT_SYNC(value.repositoryRoot);
    repositoryRoot = REALPATH_SYNC_NATIVE(value.repositoryRoot);
    if (statIsKind(details, 'LINK') || !statIsKind(details, 'DIRECTORY') || repositoryRoot !== value.repositoryRoot) refuse('SOURCE_ORIGIN_GIT_LAYOUT');
  } catch (error) {
    if (isCaptureRefusal(error)) throw error;
    refuse('SOURCE_ORIGIN_GIT_LAYOUT');
  }
  const toplevel = canonicalExistingPath(value.toplevel, 'DIRECTORY');
  const gitDirectory = canonicalExistingPath(value.gitDirectory, 'DIRECTORY');
  const indexPath = canonicalExistingPath(value.indexPath, 'FILE');
  if (toplevel !== repositoryRoot || indexPath !== PATH_JOIN(gitDirectory, 'index')) refuse('SOURCE_ORIGIN_GIT_LAYOUT');
  return OBJECT_FREEZE({ repositoryRoot, gitDirectory, indexPath });
}

function commonGitDirectory(gitDirectory) {
  return stringToLowerCase(PATH_BASENAME(PATH_DIRNAME(gitDirectory))) === 'worktrees'
    ? PATH_DIRNAME(PATH_DIRNAME(gitDirectory))
    : gitDirectory;
}

function alternateExpectation(gitDirectory, kind) {
  return PATH_JOIN(commonGitDirectory(gitDirectory), 'objects', 'info', kind);
}

function observeAlternateFile(locator, expected) {
  if (typeof locator !== 'string' || stringIncludes(locator, '\0') || !PATH_IS_ABSOLUTE(locator)) refuse('SOURCE_ORIGIN_GIT_ALTERNATES');
  let canonicalExpected;
  try {
    const parent = REALPATH_SYNC_NATIVE(PATH_DIRNAME(expected));
    canonicalExpected = PATH_JOIN(parent, PATH_BASENAME(expected));
  } catch { refuse('SOURCE_ORIGIN_GIT_ALTERNATES'); }
  const canonicalText = OS_PLATFORM() === 'win32' ? stringReplaceAll(canonicalExpected, '\\', '/') : canonicalExpected;
  if (locator !== canonicalText) refuse('SOURCE_ORIGIN_GIT_ALTERNATES');
  try {
    const observed = LSTAT_SYNC(canonicalExpected);
    if (statIsKind(observed, 'LINK') || !statIsKind(observed, 'FILE') || observed.size !== 0 || REALPATH_SYNC_NATIVE(canonicalExpected) !== canonicalExpected) refuse('SOURCE_ORIGIN_GIT_ALTERNATES');
    return 'ZERO_REGULAR_FILE';
  } catch (error) {
    if (isCaptureRefusal(error)) throw error;
    if (error?.code !== 'ENOENT') refuse('SOURCE_ORIGIN_GIT_ALTERNATES');
    return 'ABSENT';
  }
}

async function repositoryState(run) {
  const layout = assertCanonicalRepositoryLayout({
    repositoryRoot: REPOSITORY_ROOT,
    toplevel: unwrapAsyncEnvelope(await run('TOPLEVEL')),
    gitDirectory: unwrapAsyncEnvelope(await run('GIT_DIR')),
    indexPath: unwrapAsyncEnvelope(await run('INDEX_PATH')),
  });
  const alternates = observeAlternateFile(unwrapAsyncEnvelope(await run('ALTERNATES')), alternateExpectation(layout.gitDirectory, 'alternates'));
  const httpAlternates = observeAlternateFile(unwrapAsyncEnvelope(await run('HTTP_ALTERNATES')), alternateExpectation(layout.gitDirectory, 'http-alternates'));
  const objectFormat = unwrapAsyncEnvelope(await run('OBJECT_FORMAT'));
  const pattern = oidPattern(objectFormat);
  const head = unwrapAsyncEnvelope(await run('HEAD'));
  const tree = unwrapAsyncEnvelope(await run('TREE'));
  if (!regexpTest(pattern, head) || !regexpTest(pattern, tree)) refuse('SOURCE_ORIGIN_GIT_OBJECT_FORMAT');
  const treeRows = parseGitTreeRows(unwrapAsyncEnvelope(await run('TREE_ROWS', { treeOid: tree })), objectFormat);
  const index = observeGitIndex(
    unwrapAsyncEnvelope(await run('INDEX_STAGE')),
    unwrapAsyncEnvelope(await run('INDEX_FLAGS')),
    objectFormat,
    treeRows,
  );
  return frozenNullRecord({ ...layout, alternates, httpAlternates, objectFormat, head, tree, treeRows, index });
}

function closureView(state, configDigest, ownerSetDigest) {
  return OBJECT_FREEZE({
    repositoryRoot: state.repositoryRoot,
    gitDirectory: state.gitDirectory,
    indexPath: state.indexPath,
    alternates: state.alternates,
    httpAlternates: state.httpAlternates,
    objectFormat: state.objectFormat,
    commitOid: state.head,
    treeOid: state.tree,
    treeDigest: sha256CanonicalCaptured('galerina.logic-aig-git-tree.v1', state.treeRows),
    indexDigest: state.index.indexDigest,
    configDigest,
    ownerSetDigest,
  });
}

export function assertFrozenSourceClosure(opening, closing) {
  if (opening === null || typeof opening !== 'object' || UTIL_TYPES_IS_PROXY(opening) || closing === null || typeof closing !== 'object' || UTIL_TYPES_IS_PROXY(closing) ||
      canonicalJsonText(opening) !== canonicalJsonText(closing)) refuse('SOURCE_ORIGIN_GIT_DRIFT');
}

async function readBlob(run, oid, operationClass = 'CAPTURED_FILE') {
  const bytes = unwrapAsyncEnvelope(await run('BLOB', { blobOid: oid }, operationClass));
  return asyncEnvelope(exactBuffer(bytes, undefined, 'SOURCE_ORIGIN_GIT_PROCESS'));
}

function regularTreeRow(treeByPath, locator, code = 'SOURCE_ORIGIN_GIT_POLICY') {
  const row = mapGet(treeByPath, locator);
  if (!row || (row.mode !== '100644' && row.mode !== '100755')) refuse(code);
  return row;
}

async function heldBlob(run, treeByPath, locator, operationClass = 'JSON', code = 'SOURCE_ORIGIN_GIT_POLICY') {
  const row = regularTreeRow(treeByPath, locator, code);
  const bytes = unwrapAsyncEnvelope(await readBlob(run, row.blobOid, operationClass), code);
  return frozenNullRecord({ locator, blobOid: row.blobOid, bytes, byteLength: typedArrayLength(bytes), rawSha256: sha256CapturedBytes(bytes) }, code);
}

function classifyResolutionPath(path, policy) {
  const name = stringSlice(path, stringLastIndexOf(path, '/') + 1);
  if (safeArrayIncludes(policy.resolutionBasenames, name)) return true;
  return safeArraySome(policy.resolutionNamePatterns, (source) => regexpTest(new REGEXP_CONSTRUCTOR(source), name));
}

function addAggregate(total, increment, maximum) {
  if (!NUMBER_IS_SAFE_INTEGER(increment) || increment < 0 || total > maximum - increment) refuse('SOURCE_ORIGIN_LIMIT');
  return total + increment;
}

function deepFreeze(value, seen) {
  const retainedSeen = seen ?? new SET_CONSTRUCTOR();
  if (value === null || typeof value !== 'object' || REFLECT_APPLY(ARRAY_BUFFER_IS_VIEW, undefined, [value]) || setHas(retainedSeen, value)) return value;
  setAdd(retainedSeen, value);
  const children = REFLECT_APPLY(OBJECT_VALUES, undefined, [value]);
  for (let index = 0; index < children.length; index += 1) deepFreeze(children[index], retainedSeen);
  return OBJECT_FREEZE(value);
}

function weakMapHas(map, key) {
  return REFLECT_APPLY(WEAK_MAP_HAS, map, [key]);
}

function weakMapGet(map, key) {
  return REFLECT_APPLY(WEAK_MAP_GET, map, [key]);
}

function weakMapSet(map, key, value) {
  REFLECT_APPLY(WEAK_MAP_SET, map, [key, value]);
}

function mapHas(map, key) {
  return REFLECT_APPLY(MAP_HAS, map, [key]);
}

function mapGet(map, key) {
  return REFLECT_APPLY(MAP_GET, map, [key]);
}

function mapSet(map, key, value) {
  REFLECT_APPLY(MAP_SET, map, [key, value]);
}

function capturedMapEntries(value) {
  const iterator = REFLECT_APPLY(MAP_ENTRIES, value, []);
  const entries = new ARRAY_CONSTRUCTOR();
  while (true) {
    const step = REFLECT_APPLY(MAP_ITERATOR_NEXT, iterator, []);
    if (step.done) return entries;
    safeArrayAppend(entries, step.value);
  }
}

function defineFrozenData(target, property, value, enumerable = false) {
  const descriptor = OBJECT_CREATE(null);
  descriptor.configurable = false;
  descriptor.enumerable = enumerable;
  descriptor.value = value;
  descriptor.writable = false;
  OBJECT_DEFINE_PROPERTY(target, property, descriptor);
}

function closeCallable(value) {
  OBJECT_SET_PROTOTYPE_OF(value, null);
  return OBJECT_FREEZE(value);
}

function requireBlobCapability(value) {
  if (!weakMapHas(BLOB_CAPABILITY_STATES, value)) refuse('SOURCE_ORIGIN_GIT_BLOB_SET');
  return weakMapGet(BLOB_CAPABILITY_STATES, value);
}

function requireBlobIterator(value) {
  if (!weakMapHas(BLOB_ITERATOR_STATES, value)) refuse('SOURCE_ORIGIN_GIT_BLOB_SET');
  return weakMapGet(BLOB_ITERATOR_STATES, value);
}

function frozenIteratorResult(done, value) {
  const result = OBJECT_CREATE(null);
  defineFrozenData(result, 'done', done, true);
  defineFrozenData(result, 'value', value, true);
  return OBJECT_FREEZE(result);
}

function frozenEntryPair(key, bytes) {
  const pair = OBJECT_CREATE(null);
  defineFrozenData(pair, '0', key, true);
  defineFrozenData(pair, '1', bytes, true);
  defineFrozenData(pair, 'length', 2);
  return OBJECT_FREEZE(pair);
}

const BLOB_ITERATOR_NEXT = closeCallable({
  next() {
    const iterator = requireBlobIterator(this);
    if (iterator.index >= iterator.capability.size) return frozenIteratorResult(true, undefined);
    const entry = iterator.capability.entries[iterator.index];
    iterator.index += 1;
    let value;
    if (iterator.kind === 'KEYS') value = entry[0];
    else if (iterator.kind === 'VALUES') value = copyHeldBuffer(entry[1], 'SOURCE_ORIGIN_GIT_BLOB_SET');
    else value = frozenEntryPair(entry[0], copyHeldBuffer(entry[1], 'SOURCE_ORIGIN_GIT_BLOB_SET'));
    return frozenIteratorResult(false, value);
  },
}.next);

const BLOB_ITERATOR_SELF = closeCallable({
  iterator() {
    requireBlobIterator(this);
    return this;
  },
}.iterator);

function createBlobIterator(capability, kind) {
  const iterator = OBJECT_CREATE(null);
  defineFrozenData(iterator, 'next', BLOB_ITERATOR_NEXT);
  defineFrozenData(iterator, SYMBOL_ITERATOR, BLOB_ITERATOR_SELF);
  const state = OBJECT_CREATE(null);
  state.capability = capability;
  state.index = 0;
  state.kind = kind;
  weakMapSet(BLOB_ITERATOR_STATES, iterator, state);
  return OBJECT_FREEZE(iterator);
}

const BLOB_CAPABILITY_GET = closeCallable({
  get(key) {
    const capability = requireBlobCapability(this);
    if (typeof key !== 'string') refuse('SOURCE_ORIGIN_GIT_BLOB_SET');
    const bytes = mapGet(capability.byKey, key);
    return bytes === undefined ? undefined : copyHeldBuffer(bytes, 'SOURCE_ORIGIN_GIT_BLOB_SET');
  },
}.get);

const BLOB_CAPABILITY_HAS = closeCallable({
  has(key) {
    const capability = requireBlobCapability(this);
    if (typeof key !== 'string') refuse('SOURCE_ORIGIN_GIT_BLOB_SET');
    return mapHas(capability.byKey, key);
  },
}.has);

const BLOB_CAPABILITY_ENTRIES = closeCallable({
  entries() {
    return createBlobIterator(requireBlobCapability(this), 'ENTRIES');
  },
}.entries);

const BLOB_CAPABILITY_KEYS = closeCallable({
  keys() {
    return createBlobIterator(requireBlobCapability(this), 'KEYS');
  },
}.keys);

const BLOB_CAPABILITY_VALUES = closeCallable({
  values() {
    return createBlobIterator(requireBlobCapability(this), 'VALUES');
  },
}.values);

const BLOB_CAPABILITY_SIZE = closeCallable(OBJECT_GET_OWN_PROPERTY_DESCRIPTOR({
  get size() {
    return requireBlobCapability(this).size;
  },
}, 'size').get);

function createBlobCapability(entries, code = 'SOURCE_ORIGIN_GIT_BLOB_SET') {
  const capability = OBJECT_CREATE(null);
  const byKey = new MAP_CONSTRUCTOR();
  const heldEntries = OBJECT_CREATE(null);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const key = entry[0];
    if (typeof key !== 'string' || mapHas(byKey, key)) refuse(code);
    const bytes = copyHeldBuffer(entry[1], code);
    const heldEntry = frozenEntryPair(key, bytes);
    defineFrozenData(heldEntries, index, heldEntry, true);
    mapSet(byKey, key, bytes);
  }
  defineFrozenData(heldEntries, 'length', entries.length);
  OBJECT_FREEZE(heldEntries);
  const state = OBJECT_CREATE(null);
  state.byKey = byKey;
  state.entries = heldEntries;
  state.size = entries.length;
  OBJECT_FREEZE(state);
  weakMapSet(BLOB_CAPABILITY_STATES, capability, state);
  defineFrozenData(capability, 'get', BLOB_CAPABILITY_GET);
  defineFrozenData(capability, 'has', BLOB_CAPABILITY_HAS);
  defineFrozenData(capability, 'entries', BLOB_CAPABILITY_ENTRIES);
  defineFrozenData(capability, 'keys', BLOB_CAPABILITY_KEYS);
  defineFrozenData(capability, 'values', BLOB_CAPABILITY_VALUES);
  const sizeDescriptor = OBJECT_CREATE(null);
  sizeDescriptor.configurable = false;
  sizeDescriptor.enumerable = false;
  sizeDescriptor.get = BLOB_CAPABILITY_SIZE;
  sizeDescriptor.set = undefined;
  OBJECT_DEFINE_PROPERTY(capability, 'size', sizeDescriptor);
  defineFrozenData(capability, SYMBOL_ITERATOR, BLOB_CAPABILITY_ENTRIES);
  return OBJECT_FREEZE(capability);
}

function closedArrayValues(value, code) {
  if (UTIL_TYPES_IS_PROXY(value) || !ARRAY_IS_ARRAY(value) || OBJECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse(code);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  const lengthDescriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
  if (!lengthDescriptor || !OBJECT_HAS_OWN(lengthDescriptor, 'value') || lengthDescriptor.enumerable || !NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value) || lengthDescriptor.value < 0 || names.length !== lengthDescriptor.value + 1) refuse(code);
  const output = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, index);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse(code);
    safeArrayAppend(output, descriptor.value);
  }
  return output;
}

function captureExactBufferState(value, code) {
  if (
    UTIL_TYPES_IS_PROXY(value)
    || value === null
    || typeof value !== 'object'
    || OBJECT_GET_PROTOTYPE_OF(value) !== BUFFER_PROTOTYPE
    || OBJECT_GET_PROTOTYPE_OF(BUFFER_CONSTRUCTOR) !== BUFFER_CONSTRUCTOR_PROTOTYPE
    || OBJECT_GET_PROTOTYPE_OF(BUFFER_CONSTRUCTOR_PROTOTYPE) !== TYPED_ARRAY_CONSTRUCTOR
    || OBJECT_GET_PROTOTYPE_OF(TYPED_ARRAY_CONSTRUCTOR) !== FUNCTION_PROTOTYPE
    || OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(BUFFER_CONSTRUCTOR, SYMBOL_HAS_INSTANCE) !== undefined
    || OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(BUFFER_CONSTRUCTOR_PROTOTYPE, SYMBOL_HAS_INSTANCE) !== undefined
    || OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(TYPED_ARRAY_CONSTRUCTOR, SYMBOL_HAS_INSTANCE) !== undefined
    || !REFLECT_APPLY(BUFFER_IS_BUFFER, BUFFER_CONSTRUCTOR, [value])
    || !REFLECT_APPLY(ARRAY_BUFFER_IS_VIEW, undefined, [value])
    || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0
  ) refuse(code);
  const extentFields = ['buffer','byteLength','byteOffset','length'];
  for (let index = 0; index < extentFields.length; index += 1) {
    if (OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, extentFields[index]) !== undefined) refuse(code);
  }
  let length;
  let backing;
  let byteLength;
  let byteOffset;
  let backingByteLength;
  try {
    length = REFLECT_APPLY(TYPED_ARRAY_LENGTH_GETTER, value, []);
    backing = REFLECT_APPLY(TYPED_ARRAY_BUFFER_GETTER, value, []);
    byteLength = REFLECT_APPLY(TYPED_ARRAY_BYTE_LENGTH_GETTER, value, []);
    byteOffset = REFLECT_APPLY(TYPED_ARRAY_BYTE_OFFSET_GETTER, value, []);
    backingByteLength = REFLECT_APPLY(ARRAY_BUFFER_BYTE_LENGTH_GETTER, backing, []);
  } catch {
    refuse(code);
  }
  if (
    !NUMBER_IS_SAFE_INTEGER(length)
    || !NUMBER_IS_SAFE_INTEGER(byteLength)
    || !NUMBER_IS_SAFE_INTEGER(byteOffset)
    || !NUMBER_IS_SAFE_INTEGER(backingByteLength)
    || length !== byteLength
    || length < 0
    || byteOffset < 0
    || byteOffset > backingByteLength
    || byteLength > backingByteLength - byteOffset
    || OBJECT_GET_OWN_PROPERTY_NAMES(value).length !== length
  ) refuse(code);
  return { backing, backingByteLength, byteLength, byteOffset, length };
}

function exactBuffer(value, expectedLength, code) {
  const captured = captureExactBufferState(value, code);
  const { backing, byteLength, byteOffset, length } = captured;
  if ((expectedLength !== undefined && length !== expectedLength) || length > SOURCE_ORIGIN_LIMITS.capturedFileBytes) refuse(code);
  let view;
  const output = allocateExactBuffer(byteLength, code);
  try {
    view = new UINT8_ARRAY_CONSTRUCTOR(backing, byteOffset, byteLength);
    REFLECT_APPLY(TYPED_ARRAY_SET, output, [view, 0]);
  } catch {
    refuse(code);
  }
  const outputState = captureExactBufferState(output, code);
  if (
    outputState.length !== length
    || outputState.byteLength !== length
    || outputState.byteOffset !== 0
    || outputState.backingByteLength !== length
    || (length > 0 && outputState.backing === backing)
  ) refuse(code);
  return output;
}

function allocateExactBuffer(byteLength, code) {
  if (!NUMBER_IS_SAFE_INTEGER(byteLength) || byteLength < 0 || byteLength > SOURCE_ORIGIN_LIMITS.capturedFileBytes) refuse(code);
  let output;
  try {
    output = REFLECT_APPLY(BUFFER_ALLOC_UNSAFE_SLOW, BUFFER_CONSTRUCTOR, [byteLength]);
  } catch {
    refuse(code);
  }
  const state = captureExactBufferState(output, code);
  if (state.length !== byteLength || state.byteOffset !== 0 || state.backingByteLength !== byteLength) refuse(code);
  return output;
}

function concatExactBuffers(values, maximumBytes, code) {
  const states = new ARRAY_CONSTRUCTOR();
  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const state = captureExactBufferState(values[index], code);
    total = addAggregate(total, state.length, maximumBytes);
    safeArrayAppend(states, state);
  }
  const output = allocateExactBuffer(total, code);
  try {
    let offset = 0;
    for (let index = 0; index < states.length; index += 1) {
      const state = states[index];
      const view = new UINT8_ARRAY_CONSTRUCTOR(state.backing, state.byteOffset, state.byteLength);
      REFLECT_APPLY(TYPED_ARRAY_SET, output, [view, offset]);
      offset += state.length;
    }
  } catch {
    refuse(code);
  }
  const outputState = captureExactBufferState(output, code);
  if (outputState.length !== total || outputState.byteOffset !== 0 || outputState.backingByteLength !== total) refuse(code);
  return output;
}

function copyHeldBuffer(value, code) {
  return exactBuffer(value, undefined, code);
}

function sha256CapturedBytes(bytes) {
  return hashHex('sha256', [bytes]);
}

function asciiBytes(value) {
  const bytes = new UINT8_ARRAY_CONSTRUCTOR(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = stringCharCodeAt(value, index);
  return bytes;
}

export function admitFrozenBlobSet(rowsValue, blobs, options) {
  const code = 'SOURCE_ORIGIN_GIT_BLOB_SET';
  const brandedCapability = weakMapHas(BLOB_CAPABILITY_STATES, blobs);
  exactObject(options, ['label'], code);
  if (options.label !== 'SOURCE_MANIFEST' && options.label !== 'RESOLUTION_INPUTS' && options.label !== 'OWNER_SET') refuse(code);
  const rows = closedArrayValues(rowsValue, code);
  const byPath = new MAP_CONSTRUCTOR();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (UTIL_TYPES_IS_PROXY(row) || row === null || typeof row !== 'object') refuse(code);
    const keys = OBJECT_GET_OWN_PROPERTY_NAMES(row);
    const short = ['byteLength','path','rawSha256'];
    const full = ['blobOid','byteLength','mode','objectFormat','path','rawSha256'];
    const expected = keys.length === short.length ? short : full;
    exactObject(row, expected, code);
    validatePath(row.path);
    if (!NUMBER_IS_SAFE_INTEGER(row.byteLength) || row.byteLength < 0 || row.byteLength > SOURCE_ORIGIN_LIMITS.capturedFileBytes || typeof row.rawSha256 !== 'string' || !regexpTest(/^[0-9a-f]{64}$/, row.rawSha256) || mapHas(byPath, row.path)) refuse(code);
    if (expected === full && (
      row.mode !== '100644' && row.mode !== '100755'
      || row.objectFormat !== 'sha1' && row.objectFormat !== 'sha256'
      || typeof row.blobOid !== 'string'
      || !regexpTest(row.objectFormat === 'sha1' ? /^[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/, row.blobOid)
    )) refuse(code);
    mapSet(byPath, row.path, row);
  }
  let entries;
  if (brandedCapability) {
    entries = weakMapGet(BLOB_CAPABILITY_STATES, blobs).entries;
  } else {
    if (UTIL_TYPES_IS_PROXY(blobs) || blobs === null || typeof blobs !== 'object') refuse(code);
    if (OBJECT_GET_OWN_PROPERTY_NAMES(blobs).length !== 0 || OBJECT_GET_OWN_PROPERTY_SYMBOLS(blobs).length !== 0 || OBJECT_GET_PROTOTYPE_OF(blobs) !== MAP_PROTOTYPE) refuse(code);
    try {
      if (REFLECT_APPLY(MAP_SIZE_GETTER, blobs, []) !== rows.length) refuse(code);
      entries = capturedMapEntries(blobs);
    } catch {
      refuse(code);
    }
  }
  if (entries.length !== rows.length) refuse(code);
  const captured = new MAP_CONSTRUCTOR();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const locator = entry[0];
    const value = entry[1];
    if (typeof locator !== 'string') refuse(code);
    const row = mapGet(byPath, locator);
    if (!row || mapHas(captured, locator)) refuse(code);
    const bytes = exactBuffer(value, row.byteLength, code);
    if (sha256CapturedBytes(bytes) !== row.rawSha256) refuse(code);
    if (OBJECT_HAS_OWN(row, 'blobOid')) {
      const blobOid = hashHex(row.objectFormat, [asciiBytes(`blob ${row.byteLength}\0`), bytes]);
      if (blobOid !== row.blobOid) refuse(code);
    }
    mapSet(captured, locator, bytes);
  }
  const ordered = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const bytes = mapGet(captured, row.path);
    if (bytes === undefined) refuse(code);
    safeArrayAppend(ordered, [row.path, bytes]);
  }
  return createBlobCapability(ordered, code);
}

async function buildManifests({ run, frozen, treeRows, treeByPath, repositoryIdentity, sourcePolicy, resolutionPolicy, resolutionOwnerPaths, limits }) {
  const sourceRows = new ARRAY_CONSTRUCTOR();
  const resolutionRows = new ARRAY_CONSTRUCTOR();
  const sourceEntries = new ARRAY_CONSTRUCTOR();
  const resolutionEntries = new ARRAY_CONSTRUCTOR();
  let sourceBytes = 0;
  let resolutionBytes = 0;

  for (let index = 0; index < treeRows.length; index += 1) {
    const treeRow = treeRows[index];
    const sourceDomain = classifySourcePath(treeRow.path, sourcePolicy);
    const isResolution = classifyResolutionPath(treeRow.path, resolutionPolicy) || setHas(resolutionOwnerPaths, treeRow.path);
    if (!sourceDomain && !isResolution) continue;
    const bytes = unwrapAsyncEnvelope(await readBlob(run, treeRow.blobOid, 'CAPTURED_FILE'));
    const byteLength = typedArrayLength(bytes);
    const row = OBJECT_FREEZE({
      path: treeRow.path,
      mode: treeRow.mode,
      blobOid: treeRow.blobOid,
      objectFormat: frozen.objectFormat,
      byteLength,
      rawSha256: sha256CapturedBytes(bytes),
    });
    if (sourceDomain) {
      if (sourceRows.length >= limits.sourceFiles) refuse('SOURCE_ORIGIN_LIMIT');
      sourceBytes = addAggregate(sourceBytes, byteLength, limits.sourceBytes);
      safeArrayAppend(sourceRows, row);
      safeArrayAppend(sourceEntries, [row.path, bytes]);
    }
    if (isResolution) {
      if (resolutionRows.length >= limits.resolutionFiles) refuse('SOURCE_ORIGIN_LIMIT');
      resolutionBytes = addAggregate(resolutionBytes, byteLength, limits.resolutionBytes);
      safeArrayAppend(resolutionRows, row);
      safeArrayAppend(resolutionEntries, [row.path, bytes]);
    }
  }

  safeArraySort(sourceRows, (left, right) => codeUnitCompare(left.path, right.path));
  safeArraySort(resolutionRows, (left, right) => codeUnitCompare(left.path, right.path));
  safeArraySort(sourceEntries, (left, right) => codeUnitCompare(left[0], right[0]));
  safeArraySort(resolutionEntries, (left, right) => codeUnitCompare(left[0], right[0]));
  const resolutionOwnerValues = capturedSetValues(resolutionOwnerPaths);
  for (let index = 0; index < resolutionOwnerValues.length; index += 1) {
    const ownerPath = resolutionOwnerValues[index];
    if (!mapHas(treeByPath, ownerPath) || !safeArraySome(resolutionRows, (row) => row.path === ownerPath)) refuse('SOURCE_ORIGIN_GIT_EXPECTED_OUTCOMES');
  }

  const repositoryId = `repository:${repositoryIdentity.identityDigest}`;
  const exclusionDigest = sha256CanonicalCaptured('galerina.logic-aig-exclusions.v1', sourcePolicy.exclusions);
  const sourceBody = {
    schema: 'galerina.logic-aig-source-manifest.v1',
    repositoryId,
    expectedHead: frozen.head,
    expectedTree: frozen.tree,
    objectFormat: frozen.objectFormat,
    policyDigest: sourcePolicy.policyDigest,
    exclusionDigest,
    rows: sourceRows,
    counts: {
      paths: sourceRows.length,
      blobs: safeUniqueCount(sourceRows, (row) => row.blobOid),
      bytes: sourceBytes,
      mode100644: safeArrayCount(sourceRows, (row) => row.mode === '100644'),
      mode100755: safeArrayCount(sourceRows, (row) => row.mode === '100755'),
      exclusions: 0,
    },
    authorizing: false,
  };
  const sourceManifest = {
    ...sourceBody,
    manifestDigest: sha256CanonicalCaptured(sourceBody.schema, sourceBody),
  };
  const resolutionBody = {
    schema: 'galerina.logic-aig-resolution-inputs.v1',
    repositoryId,
    expectedHead: frozen.head,
    expectedTree: frozen.tree,
    policyDigest: resolutionPolicy.policyDigest,
    rows: resolutionRows,
    authorizing: false,
  };
  const resolutionInputs = {
    ...resolutionBody,
    resolutionInputsDigest: sha256CanonicalCaptured(resolutionBody.schema, resolutionBody),
  };
  return frozenNullRecord({
    sourceManifest: deepFreeze(sourceManifest),
    sourceBlobs: createBlobCapability(sourceEntries),
    resolutionInputs: deepFreeze(resolutionInputs),
    resolutionBlobs: createBlobCapability(resolutionEntries),
  });
}

function assertNoDuplicateJsonMembers(text, code) {
  const scopes = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < text.length;) {
    const character = stringSlice(text, index, index + 1);
    if (character === '"') {
      const start = index++;
      while (index < text.length) {
        if (stringSlice(text, index, index + 1) === '\\') index += 2;
        else {
          const next = stringSlice(text, index, index + 1);
          index += 1;
          if (next === '"') break;
        }
      }
      let cursor = index;
      while (regexpTest(/\s/u, stringSlice(text, cursor, cursor + 1))) cursor += 1;
      if (stringSlice(text, cursor, cursor + 1) === ':' && scopes.length > 0) {
        let key;
        try { key = REFLECT_APPLY(JSON_PARSE, undefined, [stringSlice(text, start, index)]); } catch { refuse(code); }
        const scope = scopes[scopes.length - 1];
        if (setHas(scope, key)) refuse(code);
        setAdd(scope, key);
      }
      continue;
    }
    if (character === '{') safeArrayAppend(scopes, new SET_CONSTRUCTOR());
    else if (character === '}') {
      if (scopes.length === 0) refuse(code);
      scopes.length -= 1;
    }
    index += 1;
  }
  if (scopes.length !== 0) refuse(code);
}

export function authenticateGateOwnerBytes(bytes, parserPolicy) {
  const text = decodeUtf8(bytes, 'SOURCE_ORIGIN_GIT_POLICY');
  if (!stringEndsWith(text, '\n') || stringEndsWith(text, '\n\n') || stringEndsWith(text, '\r\n')) refuse('SOURCE_ORIGIN_GIT_POLICY');
  assertNoDuplicateJsonMembers(text, 'SOURCE_ORIGIN_GIT_POLICY');
  let value;
  try { value = REFLECT_APPLY(JSON_PARSE, undefined, [text]); } catch { refuse('SOURCE_ORIGIN_GIT_POLICY'); }
  if (value === null || typeof value !== 'object' || ARRAY_IS_ARRAY(value) || UTIL_TYPES_IS_PROXY(value) || OBJECT_GET_PROTOTYPE_OF(value) !== OBJECT_PROTOTYPE || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse('SOURCE_ORIGIN_GIT_POLICY');
  const pattern = new REGEXP_CONSTRUCTOR(parserPolicy.diagnosticCodePattern, 'u');
  const keys = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable || !key || key !== stringNormalize(key) || regexpTest(CONTROL, key)) refuse('SOURCE_ORIGIN_GIT_POLICY');
    const row = descriptor.value;
    exactObject(row, ['ok', 'codes'], 'SOURCE_ORIGIN_GIT_POLICY');
    if (typeof row.ok !== 'boolean' || !ARRAY_IS_ARRAY(row.codes) || UTIL_TYPES_IS_PROXY(row.codes) || OBJECT_GET_PROTOTYPE_OF(row.codes) !== ARRAY_PROTOTYPE) refuse('SOURCE_ORIGIN_GIT_POLICY');
    const codes = closedArrayValues(row.codes, 'SOURCE_ORIGIN_GIT_POLICY');
    const uniqueCodes = new SET_CONSTRUCTOR();
    for (let codeIndex = 0; codeIndex < codes.length; codeIndex += 1) setAdd(uniqueCodes, codes[codeIndex]);
    const sortedUniqueCodes = safeArraySort(capturedSetValues(uniqueCodes), codeUnitCompare);
    if (safeArraySome(codes, (diagnosticCode) => typeof diagnosticCode !== 'string' || !regexpTest(pattern, diagnosticCode)) ||
        canonicalJsonText(codes) !== canonicalJsonText(sortedUniqueCodes) ||
        (!row.ok && codes.length === 0)) refuse('SOURCE_ORIGIN_GIT_POLICY');
  }
  const byteLength = captureExactBufferState(bytes, 'SOURCE_ORIGIN_GIT_POLICY').length;
  const rawSha256 = sha256CapturedBytes(bytes);
  const semanticDigest = sha256CanonicalCaptured('galerina.logic-aig-gate-v3-reference-verdicts.v1', value);
  if (byteLength !== OWNER_IDENTITIES.gate.byteLength || rawSha256 !== OWNER_IDENTITIES.gate.rawSha256 ||
      semanticDigest !== OWNER_IDENTITIES.gate.semanticDigest) refuse('SOURCE_ORIGIN_GIT_POLICY');
  return OBJECT_FREEZE({ value: deepFreeze(value), byteLength, rawSha256, semanticDigest });
}

function semanticOwner(blob, validate, digestField, options) {
  let value;
  try { value = validate(parseCanonicalJsonBytes(blob.bytes, { label: blob.locator }), options); } catch { refuse('SOURCE_ORIGIN_GIT_POLICY'); }
  return OBJECT_FREEZE({ ...blob, value, semanticDigest: value[digestField] });
}

async function readHeldOwners(run, state) {
  const treeByPath = new MAP_CONSTRUCTOR();
  for (let index = 0; index < state.treeRows.length; index += 1) {
    const row = state.treeRows[index];
    mapSet(treeByPath, row.path, row);
  }
  const blobs = OBJECT_CREATE(null);
  const policyEntries = REFLECT_APPLY(OBJECT_ENTRIES, undefined, [POLICY_PATHS]);
  for (let index = 0; index < policyEntries.length; index += 1) {
    const entry = policyEntries[index];
    setDynamicData(blobs, entry[0], await heldBlob(run, treeByPath, entry[1]));
  }
  const pins = semanticOwner(blobs.toolchainPins, validateToolchainPins, 'pinsDigest');
  const parser = semanticOwner(blobs.parser, validateParserPolicy, 'policyDigest');
  const proposedBaseline = semanticOwner(blobs.proposedBaseline, validateProposedBaseline, 'policyDigest');
  const expectedOutcomes = semanticOwner(blobs.expectedOutcomes, validateExpectedParseOutcomes, 'expectedOutcomesDigest', { parserPolicy: parser.value });
  const generated = semanticOwner(blobs.generated, validateGeneratedConsumerPolicy, 'policyDigest');
  const repositoryIdentity = semanticOwner(blobs.repositoryIdentity, validateRepositoryIdentity, 'identityDigest');
  const resolution = semanticOwner(blobs.resolution, validateResolutionPolicy, 'policyDigest');
  const source = semanticOwner(blobs.source, validateSourcePolicy, 'policyDigest');
  const gateParsed = authenticateGateOwnerBytes(blobs.gate.bytes, parser.value);
  const gate = OBJECT_FREEZE({ ...blobs.gate, value: gateParsed.value, semanticDigest: gateParsed.semanticDigest });
  const bindings = frozenNullRecord({
    sourcePolicyDigest: source.value.policyDigest,
    exclusionDigest: sha256CanonicalCaptured('galerina.logic-aig-exclusions.v1', source.value.exclusions),
    resolutionPolicyDigest: resolution.value.policyDigest,
    parserPolicyDigest: parser.value.policyDigest,
    generatedConsumerPolicyDigest: generated.value.policyDigest,
    repositoryIdentityDigest: repositoryIdentity.value.identityDigest,
    toolchainPinsDigest: pins.value.pinsDigest,
    expectedOutcomesDigest: expectedOutcomes.value.expectedOutcomesDigest,
    proposedBaselineDigest: proposedBaseline.value.policyDigest,
  }, 'SOURCE_ORIGIN_GIT_POLICY');
  const exporter = semanticOwner(blobs.exporter, (value) => validateLocalExporterPolicy(value, bindings), 'policyDigest');
  const owners = { pins, proposedBaseline, expectedOutcomes, exporter, generated, parser, repositoryIdentity, resolution, source, gate };
  const identities = safeArrayMap(REFLECT_APPLY(OBJECT_VALUES, undefined, [owners]), (owner) => ({
    locator: owner.locator,
    blobOid: owner.blobOid,
    byteLength: owner.byteLength,
    rawSha256: owner.rawSha256,
    semanticDigest: owner.semanticDigest,
  }));
  safeArraySort(identities, (left, right) => codeUnitCompare(left.locator, right.locator));
  return frozenNullRecord({ ...owners, identities: deepFreeze(identities), ownerSetDigest: sha256CanonicalCaptured('galerina.logic-aig-frozen-owner-set.v1', identities) }, 'SOURCE_ORIGIN_GIT_POLICY');
}

function capturedOwnerSnapshot(held) {
  const ownerNames = [
    'expectedOutcomes', 'exporter', 'gate', 'generated', 'parser', 'pins',
    'proposedBaseline', 'repositoryIdentity', 'resolution', 'source',
  ];
  const values = {};
  const entries = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < ownerNames.length; index += 1) {
    const name = ownerNames[index];
    const owner = held[name];
    if (!owner) refuse('SOURCE_ORIGIN_GIT_POLICY');
    captureExactBufferState(owner.bytes, 'SOURCE_ORIGIN_GIT_POLICY');
    setDynamicData(values, name, owner.value);
    safeArrayAppend(entries, [owner.locator, owner.bytes]);
  }
  safeArraySort(entries, (left, right) => codeUnitCompare(left[0], right[0]));
  const owners = deepFreeze({
    values,
    identities: held.identities,
    ownerSetDigest: held.ownerSetDigest,
    authorizing: false,
  });
  const rows = safeArrayMap(held.identities, (row) => ({
    path: row.locator,
    byteLength: row.byteLength,
    rawSha256: row.rawSha256,
  }));
  const ownerInput = new MAP_CONSTRUCTOR();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    mapSet(ownerInput, entry[0], entry[1]);
  }
  const ownerBlobs = admitFrozenBlobSet(rows, ownerInput, { label: 'OWNER_SET' });
  return OBJECT_FREEZE({ owners, ownerBlobs });
}

function readInstalledWorkingOwners(parserPolicy) {
  const pins = readBoundWorkingOwner(POLICY_PATHS.toolchainPins, OWNER_IDENTITIES.pins, validateToolchainPins, 'pinsDigest');
  const proposedBaseline = readBoundWorkingOwner(POLICY_PATHS.proposedBaseline, OWNER_IDENTITIES.proposedBaseline, validateProposedBaseline, 'policyDigest');
  const expectedOutcomes = readBoundWorkingOwner(
    POLICY_PATHS.expectedOutcomes,
    OWNER_IDENTITIES.expectedOutcomes,
    (value) => validateExpectedParseOutcomes(value, { parserPolicy }),
    'expectedOutcomesDigest',
  );
  const exporter = readBoundWorkingOwner(
    POLICY_PATHS.exporter,
    OWNER_IDENTITIES.exporter,
    (value) => validateLocalExporterPolicy(value, exporterBindings(value)),
    'policyDigest',
  );
  return OBJECT_FREEZE({ pins, proposedBaseline, expectedOutcomes, exporter });
}

function assertHeldWorkingOwners(held, working) {
  const names = ['pins', 'proposedBaseline', 'expectedOutcomes', 'exporter'];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    if (!bufferEquals(held[name].bytes, working[name].bytes) || held[name].semanticDigest !== working[name].semanticDigest) refuse('SOURCE_ORIGIN_GIT_POLICY');
  }
}

function sameExecutable(left, right) {
  return left.locator === right.locator && left.byteLength === right.byteLength && left.rawSha256 === right.rawSha256 &&
    left.stat.dev === right.stat.dev && left.stat.ino === right.stat.ino && left.stat.size === right.stat.size && left.stat.mtimeNs === right.stat.mtimeNs;
}

function sameWorkingOwners(left, right) {
  const names = ['pins', 'proposedBaseline', 'expectedOutcomes', 'exporter'];
  return safeArrayEvery(names, (name) =>
    left[name].rawSha256 === right[name].rawSha256 && left[name].semanticDigest === right[name].semanticDigest && bufferEquals(left[name].bytes, right[name].bytes));
}

function makeRunner({ executable, environment, policy, deadline }) {
  const trace = [];
  const sealedEnvironment = requireSealedGitEnvironment(environment);
  const environmentDigest = sha256CanonicalCaptured('galerina.logic-aig-git-environment.v1', sealedEnvironment);
  const runCommand = async (commandId, substitutions = {}, blobClass) => {
    const selected = materializeGitCommand(policy.gitProcessPolicy, commandId, REPOSITORY_ROOT, substitutions, blobClass);
    let child;
    try {
      child = SPAWN(executable, selected.arguments, {
        cwd: REPOSITORY_ROOT,
        env: sealedEnvironment,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch { refuse('SOURCE_ORIGIN_GIT_PROCESS'); }
    const bytes = unwrapAsyncEnvelope(await collectChild(child, selected.maximumBytes, policy.limits.processOutputBytes, deadline));
    safeArrayAppend(trace, deepFreeze({
      commandId,
      arguments: safeArrayCopy(selected.arguments),
      argvDigest: selected.argvDigest,
      environmentDigest,
    }));
    return asyncEnvelope(selected.stdoutRule === 'ONE_UTF8_LINE' ? decodeGitLine(bytes) : bytes);
  };
  const traceDescriptor = OBJECT_CREATE(null);
  traceDescriptor.value = trace;
  OBJECT_DEFINE_PROPERTY(runCommand, 'trace', traceDescriptor);
  return runCommand;
}

function traceArgumentsMatch(argumentsList, commandRow, repositoryRoot) {
  const template = new ARRAY_CONSTRUCTOR();
  for (let index = 0; index < SEALED_GIT_PROCESS_POLICY.policy.fixedPrefix.length; index += 1) {
    safeArrayAppend(template, SEALED_GIT_PROCESS_POLICY.policy.fixedPrefix[index]);
  }
  for (let index = 0; index < commandRow.arguments.length; index += 1) safeArrayAppend(template, commandRow.arguments[index]);
  if (argumentsList.length !== template.length) return false;
  for (let index = 0; index < template.length; index += 1) {
    const expected = template[index];
    const observed = argumentsList[index];
    if (typeof observed !== 'string') return false;
    if (expected === '<REPOSITORY_ROOT>') {
      if (observed !== repositoryRoot) return false;
    } else if (expected === 'core.worktree=<REPOSITORY_ROOT>') {
      if (observed !== `core.worktree=${repositoryRoot}`) return false;
    } else if (expected === '<BLOB_OID>' || expected === '<TREE_OID>') {
      if (!regexpTest(HEX_OID, observed)) return false;
    } else if (observed !== expected || stringIncludes(expected, '<')) {
      return false;
    }
  }
  return true;
}

export function validateGitCommandTrace(traceValue, processPolicy, repositoryRoot, environmentValue) {
  if (typeof repositoryRoot !== 'string' || !PATH_IS_ABSOLUTE(repositoryRoot) || PATH_NORMALIZE(repositoryRoot) !== repositoryRoot || stringIncludes(repositoryRoot, '\0')) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  const sealed = requireSealedGitProcessPolicy(processPolicy);
  const environment = requireSealedGitEnvironment(environmentValue);
  const environmentDigest = sha256CanonicalCaptured('galerina.logic-aig-git-environment.v1', environment);
  const trace = closedArrayValues(traceValue, 'SOURCE_ORIGIN_GIT_PROCESS');
  const expected = safeArrayMap(sealed.policy.commandRows, (row) => row.commandId);
  safeArraySort(expected, codeUnitCompare);
  for (let index = 0; index < trace.length; index += 1) {
    const entry = trace[index];
    exactObject(entry, ['commandId', 'arguments', 'argvDigest', 'environmentDigest'], 'SOURCE_ORIGIN_GIT_PROCESS');
    if (typeof entry.commandId !== 'string' || typeof entry.argvDigest !== 'string' || entry.environmentDigest !== environmentDigest) refuse('SOURCE_ORIGIN_GIT_PROCESS');
    const commandRow = sealedRecordValue(sealed.commandById, entry.commandId);
    if (!commandRow) refuse('SOURCE_ORIGIN_GIT_PROCESS');
    const argumentsList = closedArrayValues(entry.arguments, 'SOURCE_ORIGIN_GIT_PROCESS');
    if (!traceArgumentsMatch(argumentsList, commandRow, repositoryRoot) ||
        entry.argvDigest !== sha256CanonicalCaptured('galerina.logic-aig-git-command-argv.v1', { commandId: entry.commandId, arguments: argumentsList })) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  }
  if (trace.length < expected.length + 2 || trace[0].commandId !== 'GIT_VERSION' || trace[1].commandId !== 'CONFIG_ROWS' ||
      trace[trace.length - 2].commandId !== 'CONFIG_ROWS' || trace[trace.length - 1].commandId !== 'GIT_VERSION' ||
      safeArrayCount(trace, (entry) => entry.commandId === 'GIT_VERSION') !== 2 || safeArrayCount(trace, (entry) => entry.commandId === 'CONFIG_ROWS') !== 2 ||
      !safeArrayEvery(expected, (commandId) => safeArraySome(trace, (entry) => entry.commandId === commandId)) ||
      safeArraySome(trace, (entry) => !safeArrayIncludes(expected, entry.commandId))) refuse('SOURCE_ORIGIN_GIT_PROCESS');
  return true;
}

function observationEdge(frozen, executable, version) {
  return OBJECT_FREEZE({
    head: frozen.head,
    tree: frozen.tree,
    indexDigest: frozen.index.indexDigest,
    gitVersion: version,
    gitExecutableRawSha256: executable.rawSha256,
    gitExecutableByteLength: executable.byteLength,
  });
}

export async function captureFrozenSource(options) {
  const captured = captureOptions(options);
  assertCaptureRuntimeClosure();
  const bootstrap = BOOTSTRAP_OWNERS;
  const hostPin = selectHostPin(bootstrap.pins.value);
  const executableOpening = authenticateGitExecutable(captured.gitExecutableLocator, hostPin);
  const environment = buildEnvironment();
  const deadline = REFLECT_APPLY(DATE_NOW, undefined, []) + bootstrap.exporter.value.limits.processMillis;
  const run = makeRunner({ executable: captured.gitExecutableLocator, environment, policy: bootstrap.exporter.value, deadline });

  const version = unwrapAsyncEnvelope(await run('GIT_VERSION'));
  if (version !== `git version ${hostPin.gitIdentity.version}`) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  const openingConfig = parseGitConfigRows(unwrapAsyncEnvelope(await run('CONFIG_ROWS')), bootstrap.exporter.value.gitProcessPolicy, REPOSITORY_ROOT);
  const frozenBefore = await repositoryState(run);
  if (frozenBefore.head !== captured.commitOid) refuse('SOURCE_ORIGIN_GIT_HEAD');
  const heldOpening = await readHeldOwners(run, frozenBefore);
  const workingOpening = readInstalledWorkingOwners(heldOpening.parser.value);
  assertHeldWorkingOwners(heldOpening, workingOpening);
  if (!bufferEquals(workingOpening.pins.bytes, bootstrap.pins.bytes) || !bufferEquals(workingOpening.exporter.bytes, bootstrap.exporter.bytes)) refuse('SOURCE_ORIGIN_GIT_POLICY');

  const treeByPath = new MAP_CONSTRUCTOR();
  for (let index = 0; index < frozenBefore.treeRows.length; index += 1) {
    const row = frozenBefore.treeRows[index];
    mapSet(treeByPath, row.path, row);
  }
  const ownerManifestKindByKind = new MAP_CONSTRUCTOR();
  const ownerManifestBindings = heldOpening.parser.value.ownerManifestBindings;
  for (let index = 0; index < ownerManifestBindings.length; index += 1) {
    const binding = ownerManifestBindings[index];
    mapSet(ownerManifestKindByKind, binding.ownerKind, binding.manifestKind);
  }
  const resolutionOwnerPaths = new SET_CONSTRUCTOR();
  const expectedRows = heldOpening.expectedOutcomes.value.rows;
  for (let index = 0; index < expectedRows.length; index += 1) {
    const row = expectedRows[index];
    if (mapGet(ownerManifestKindByKind, row.ownerKind) === 'RESOLUTION_INPUTS') setAdd(resolutionOwnerPaths, row.ownerLocator);
  }

  const manifests = await buildManifests({
    run,
    frozen: frozenBefore,
    treeRows: frozenBefore.treeRows,
    treeByPath,
    repositoryIdentity: heldOpening.repositoryIdentity.value,
    sourcePolicy: heldOpening.source.value,
    resolutionPolicy: heldOpening.resolution.value,
    resolutionOwnerPaths,
    limits: bootstrap.exporter.value.limits,
  });

  const frozenAfter = await repositoryState(run);
  const heldClosing = await readHeldOwners(run, frozenAfter);
  const closingConfig = parseGitConfigRows(unwrapAsyncEnvelope(await run('CONFIG_ROWS')), bootstrap.exporter.value.gitProcessPolicy, REPOSITORY_ROOT);
  const workingBeforeVersion = readInstalledWorkingOwners(heldClosing.parser.value);
  assertHeldWorkingOwners(heldClosing, workingBeforeVersion);
  assertFrozenSourceClosure(
    closureView(frozenBefore, openingConfig.semanticDigest, heldOpening.ownerSetDigest),
    closureView(frozenAfter, closingConfig.semanticDigest, heldClosing.ownerSetDigest),
  );
  if (!sameWorkingOwners(workingOpening, workingBeforeVersion)) refuse('SOURCE_ORIGIN_GIT_DRIFT');
  const executableBeforeVersion = authenticateGitExecutable(captured.gitExecutableLocator, hostPin);
  if (!sameExecutable(executableOpening, executableBeforeVersion)) refuse('SOURCE_ORIGIN_GIT_DRIFT');
  const closingVersion = unwrapAsyncEnvelope(await run('GIT_VERSION'));
  if (closingVersion !== version) refuse('SOURCE_ORIGIN_GIT_DRIFT');
  const workingAfterVersion = readInstalledWorkingOwners(heldClosing.parser.value);
  assertHeldWorkingOwners(heldClosing, workingAfterVersion);
  const executableAfterVersion = authenticateGitExecutable(captured.gitExecutableLocator, hostPin);
  if (!sameWorkingOwners(workingOpening, workingAfterVersion) || !sameExecutable(executableOpening, executableAfterVersion)) refuse('SOURCE_ORIGIN_GIT_DRIFT');
  validateGitCommandTrace(run.trace, bootstrap.exporter.value.gitProcessPolicy, REPOSITORY_ROOT, environment);

  const before = observationEdge(frozenBefore, executableOpening, version);
  const after = observationEdge(frozenAfter, executableAfterVersion, closingVersion);
  const observation = OBJECT_FREEZE({
    before,
    after,
    objectFormat: frozenBefore.objectFormat,
    indexDigest: frozenBefore.index.indexDigest,
    executionBoundary: 'COOPERATIVE_LOCAL_SAME_USER',
  });
  const semanticOwners = capturedOwnerSnapshot(heldClosing);
  const sourceBlobs = admitFrozenBlobSet(manifests.sourceManifest.rows, manifests.sourceBlobs, { label: 'SOURCE_MANIFEST' });
  const resolutionBlobs = admitFrozenBlobSet(manifests.resolutionInputs.rows, manifests.resolutionBlobs, { label: 'RESOLUTION_INPUTS' });
  return frozenNullRecord({
    observation,
    sourceManifest: manifests.sourceManifest,
    sourceBlobs,
    resolutionInputs: manifests.resolutionInputs,
    resolutionBlobs,
    ...semanticOwners,
  });
}
