import { isProxy } from 'node:util/types';

import {
  SOURCE_ORIGIN_LIMITS,
  canonicalJsonText,
  classifySourcePath,
  decodeUtf8Bytes,
  decodeDiagnosticSet,
  gitBlobOid,
  parseCanonicalJsonBytes,
  sha256Canonical,
  validateExpectedParseOutcomes,
  validateGeneratedConsumerPolicy,
  validateParseOutcomesReceipt,
  validateParserPolicy,
  validateProposedBaseline,
  validateRepositoryIdentity,
  validateResolutionInputs,
  validateResolutionPolicy,
  validateSourceManifest,
  validateSourcePolicy,
  validateToolchainManifest,
  validateToolchainPins,
} from './contract.mjs';
import { decodeFungiGateProject } from './fungi-decoder.mjs';
import { admitFrozenBlobSet, validateLocalExporterPolicy } from './git-source.mjs';
import { buildSemanticRows, decodeHostProject } from './host-decoder.mjs';
import { buildToolchainSnapshot } from './toolchain-snapshot.mjs';

const UTIL_TYPES_IS_PROXY = isProxy;
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
const SAFE_REGEXP = RegExp;
const REGEXP_EXEC = RegExp.prototype.exec;
const STRING_CHAR_CODE_AT = String.prototype.charCodeAt;
const STRING_ENDS_WITH = String.prototype.endsWith;
const STRING_LAST_INDEX_OF = String.prototype.lastIndexOf;
const STRING_NORMALIZE = String.prototype.normalize;
const STRING_SLICE = String.prototype.slice;
const STRING_SPLIT = String.prototype.split;
const STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const SAFE_SET = Set;
const SET_ADD = Set.prototype.add;
const SET_HAS = Set.prototype.has;
const SET_SIZE = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(Set.prototype, 'size').get;
const SAFE_MAP = Map;
const MAP_GET = Map.prototype.get;
const MAP_HAS = Map.prototype.has;
const MAP_SET = Map.prototype.set;
const MAP_ENTRIES = Map.prototype.entries;
const MAP_SIZE = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(Map.prototype, 'size').get;
const MAP_ITERATOR_NEXT = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  OBJECT_GET_PROTOTYPE_OF(REFLECT_APPLY(MAP_ENTRIES, new SAFE_MAP(), [])),
  'next',
).value;

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
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) refuse('SOURCE_ORIGIN_PROJECT_SCHEMA');
    defineData(record, name, descriptor.value);
  }
  return OBJECT_FREEZE(record);
}

function ownArrayValue(values, index, code = 'SOURCE_ORIGIN_PROJECT_SCHEMA') {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(values, `${index}`);
  if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) refuse(code);
  return descriptor.value;
}

function optionalOwnArrayValue(values, index) {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(values, `${index}`);
  return descriptor && OBJECT_HAS_OWN(descriptor, 'value') ? descriptor.value : undefined;
}

function optionalOwnDataValue(value, name) {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, name);
  return descriptor && OBJECT_HAS_OWN(descriptor, 'value') ? descriptor.value : undefined;
}

function append(values, value) { defineData(values, `${values.length}`, value); }
function arrayCopy(values) { const output = []; for (let index = 0; index < values.length; index += 1) append(output, values[index]); return output; }
function arrayMap(values, operation) { const output = []; for (let index = 0; index < values.length; index += 1) append(output, operation(values[index], index)); return output; }
function arrayFilter(values, predicate) { const output = []; for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) append(output, values[index]); return output; }
function arrayFind(values, predicate) { for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) return values[index]; return undefined; }
function arraySome(values, predicate) { for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) return true; return false; }
function arrayReduce(values, operation, initial) { let output = initial; for (let index = 0; index < values.length; index += 1) output = operation(output, values[index], index); return output; }
function flattenArrays(values) { const output = []; for (let outer = 0; outer < values.length; outer += 1) for (let inner = 0; inner < values[outer].length; inner += 1) append(output, values[outer][inner]); return output; }
function sortArray(values, compare = compareCodeUnits) { return REFLECT_APPLY(ARRAY_SORT, values, [compare]); }
function stringEndsWith(value, part) { return REFLECT_APPLY(STRING_ENDS_WITH, value, [part]); }
function stringCharCodeAt(value, index) { return REFLECT_APPLY(STRING_CHAR_CODE_AT, value, [index]); }
function stringLastIndexOf(value, part) { return REFLECT_APPLY(STRING_LAST_INDEX_OF, value, [part]); }
function stringNormalize(value) { return REFLECT_APPLY(STRING_NORMALIZE, value, ['NFC']); }
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
function mapGet(values, key) { return REFLECT_APPLY(MAP_GET, values, [key]); }
function mapHas(values, key) { return REFLECT_APPLY(MAP_HAS, values, [key]); }
function mapSet(values, key, value) { REFLECT_APPLY(MAP_SET, values, [key, value]); }
function mapSize(values) { return REFLECT_APPLY(MAP_SIZE, values, []); }
function mapEntriesArray(values) { const output = []; const iterator = REFLECT_APPLY(MAP_ENTRIES, values, []); while (true) { const step = REFLECT_APPLY(MAP_ITERATOR_NEXT, iterator, []); if (step.done) return output; append(output, step.value); } }
function mapFromArray(values, key, project = (value) => value) { const output = new SAFE_MAP(); for (let index = 0; index < values.length; index += 1) mapSet(output, key(values[index], index), project(values[index], index)); return output; }
function uniqueArray(values) { const seen = new SAFE_SET(); const output = []; for (let index = 0; index < values.length; index += 1) if (!setHas(seen, values[index])) { setAdd(seen, values[index]); append(output, values[index]); } return output; }
function setFromArray(values, project = (value) => value) { const output = new SAFE_SET(); for (let index = 0; index < values.length; index += 1) setAdd(output, project(values[index], index)); return output; }
function regexpMatches(pattern, value) {
  const output = [];
  const firstDescriptor = OBJECT_CREATE(null);
  firstDescriptor.value = 0;
  OBJECT_DEFINE_PROPERTY(pattern, 'lastIndex', firstDescriptor);
  try {
    while (true) {
      const match = REFLECT_APPLY(REGEXP_EXEC, pattern, [value]);
      if (match === null) return output;
      append(output, match);
      if (match[0] === '') {
        const nextDescriptor = OBJECT_CREATE(null);
        nextDescriptor.value = pattern.lastIndex + 1;
        OBJECT_DEFINE_PROPERTY(pattern, 'lastIndex', nextDescriptor);
      }
    }
  } finally {
    const finalDescriptor = OBJECT_CREATE(null);
    finalDescriptor.value = 0;
    OBJECT_DEFINE_PROPERTY(pattern, 'lastIndex', finalDescriptor);
  }
}

const OPTION_KEYS = OBJECT_FREEZE([
  'owners', 'ownerBlobs', 'sourceManifest', 'sourceBlobs', 'resolutionInputs',
  'resolutionBlobs', 'toolchainBlobs', 'platform', 'arch', 'nodeIdentity',
  'gitIdentity',
]);
const OWNER_NAMES = OBJECT_FREEZE([
  'expectedOutcomes', 'exporter', 'gate', 'generated', 'parser', 'pins',
  'proposedBaseline', 'repositoryIdentity', 'resolution', 'source',
]);
const OWNER_LOCATORS = OBJECT_FREEZE({
  expectedOutcomes: 'governance/logic-aig-source-origin-expected-parse-outcomes.json',
  exporter: 'governance/logic-aig-source-origin-exporter-policy.json',
  gate: 'packages-ts/galerina-core-compiler/tests/fixtures/gate-v3/REFERENCE-VERDICTS.json',
  generated: 'governance/logic-aig-source-origin-generated-consumers.json',
  parser: 'governance/logic-aig-source-origin-parser-policy.json',
  pins: 'governance/logic-aig-source-origin-toolchain-pins.json',
  proposedBaseline: 'governance/example-proposed-baseline.json',
  repositoryIdentity: 'governance/logic-aig-source-origin-repository-identity.json',
  resolution: 'governance/logic-aig-source-origin-resolution-policy.json',
  source: 'governance/logic-aig-source-origin-source-policy.json',
});
const RELATIONSHIP_CLASSES = OBJECT_FREEZE(['CALLER', 'CONTRACT', 'GENERATED_CONSUMER', 'IMPORT', 'TEST']);
const DIAGNOSTIC_HEADER = /^\/\/\/\s*expected_diagnostics:\s*(.+)$/gim;
const HEX40_OR_64 = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const HEX64 = /^[0-9a-f]{64}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

class ProjectDecoderRefusal extends Error {
  constructor(code) {
    super(code);
    defineData(this, 'name', 'ProjectDecoderRefusal');
    defineData(this, 'code', code);
  }
}

function refuse(code) {
  throw new ProjectDecoderRefusal(code);
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactObject(value, keys, code = 'SOURCE_ORIGIN_PROJECT_SCHEMA') {
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

function exactArray(value, code = 'SOURCE_ORIGIN_PROJECT_SCHEMA') {
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

function decodeUtf8(bytes, code = 'SOURCE_ORIGIN_PROJECT_OWNER') {
  try {
    return decodeUtf8Bytes(bytes);
  } catch {
    refuse(code);
  }
}

function sameData(left, right) {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function verifyGitBlobOid(blobOid, bytes, code) {
  const algorithm = blobOid.length === 40 ? 'sha1' : blobOid.length === 64 ? 'sha256' : refuse(code);
  let observed;
  try { observed = gitBlobOid(bytes, algorithm); } catch { refuse(code); }
  if (observed !== blobOid) refuse(code);
}

function exporterBindings(values) {
  return {
    sourcePolicyDigest: values.source.policyDigest,
    exclusionDigest: sha256Canonical('galerina.logic-aig-exclusions.v1', values.source.exclusions),
    resolutionPolicyDigest: values.resolution.policyDigest,
    parserPolicyDigest: values.parser.policyDigest,
    generatedConsumerPolicyDigest: values.generated.policyDigest,
    repositoryIdentityDigest: values.repositoryIdentity.identityDigest,
    toolchainPinsDigest: values.pins.pinsDigest,
    expectedOutcomesDigest: values.expectedOutcomes.expectedOutcomesDigest,
    proposedBaselineDigest: values.proposedBaseline.policyDigest,
  };
}

function assertNoDuplicateJsonMembers(text) {
  const scopes = [];
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
      while (cursor < text.length) {
        const unit = stringCharCodeAt(text, cursor);
        if (unit !== 0x20 && unit !== 0x09 && unit !== 0x0a && unit !== 0x0d) break;
        cursor += 1;
      }
      if (stringSlice(text, cursor, cursor + 1) === ':' && scopes.length > 0) {
        let key;
        try { key = REFLECT_APPLY(JSON_PARSE, null, [stringSlice(text, start, index)]); } catch { refuse('SOURCE_ORIGIN_PROJECT_OWNER'); }
        const scope = ownArrayValue(scopes, scopes.length - 1, 'SOURCE_ORIGIN_PROJECT_OWNER');
        if (setHas(scope, key)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
        setAdd(scope, key);
      }
      continue;
    }
    if (character === '{') append(scopes, new SAFE_SET());
    else if (character === '}') {
      if (scopes.length === 0) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
      scopes.length -= 1;
    }
    index += 1;
  }
  if (scopes.length !== 0) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
}

function parseGateOwnerBytes(bytes, parserPolicy) {
  const text = decodeUtf8(bytes);
  if (!stringEndsWith(text, '\n') || stringEndsWith(text, '\n\n') || stringEndsWith(text, '\r\n')) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  assertNoDuplicateJsonMembers(text);
  let value;
  try { value = REFLECT_APPLY(JSON_PARSE, null, [text]); } catch { refuse('SOURCE_ORIGIN_PROJECT_OWNER'); }
  return validateGateOwner(value, parserPolicy);
}

function validateGateOwner(value, parserPolicy) {
  if (UTIL_TYPES_IS_PROXY(value) || value === null || typeof value !== 'object' || ARRAY_IS_ARRAY(value)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  if ((prototype !== OBJECT_PROTOTYPE && prototype !== null) || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  const keys = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, keys[index]);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  }
  const sorted = sortArray(arrayCopy(keys));
  if (arraySome(keys, (key, index) => key !== sorted[index])) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  const pattern = new SAFE_REGEXP(parserPolicy.diagnosticCodePattern, 'u');
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex];
    if (!key || key !== stringNormalize(key) || regexpTest(CONTROL, key)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
    const row = value[key];
    exactObject(row, ['ok','codes'], 'SOURCE_ORIGIN_PROJECT_OWNER');
    if (typeof row.ok !== 'boolean') refuse('SOURCE_ORIGIN_PROJECT_OWNER');
    exactArray(row.codes, 'SOURCE_ORIGIN_PROJECT_OWNER');
    let previous;
    for (let codeIndex = 0; codeIndex < row.codes.length; codeIndex += 1) {
      const code = row.codes[codeIndex];
      if (typeof code !== 'string' || !regexpTest(pattern, code) || (previous !== undefined && compareCodeUnits(previous, code) >= 0)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
      previous = code;
    }
    if (!row.ok && row.codes.length === 0) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  }
  return value;
}

function ownerSemanticDigest(name, value) {
  if (name === 'expectedOutcomes') return value.expectedOutcomesDigest;
  if (name === 'repositoryIdentity') return value.identityDigest;
  if (name === 'pins') return value.pinsDigest;
  if (name === 'gate') return sha256Canonical('galerina.logic-aig-gate-v3-reference-verdicts.v1', value);
  return value.policyDigest;
}

function validateOwners(owners, ownerBlobsInput) {
  exactObject(owners, ['values','identities','ownerSetDigest','authorizing'], 'SOURCE_ORIGIN_PROJECT_OWNER');
  if (owners.authorizing !== false || typeof owners.ownerSetDigest !== 'string' || !regexpTest(HEX64, owners.ownerSetDigest)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  exactObject(owners.values, OWNER_NAMES, 'SOURCE_ORIGIN_PROJECT_OWNER');
  exactArray(owners.identities, 'SOURCE_ORIGIN_PROJECT_OWNER');
  if (owners.identities.length !== OWNER_NAMES.length) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  const identityByLocator = new SAFE_MAP();
  let previous;
  for (let index = 0; index < owners.identities.length; index += 1) {
    const row = owners.identities[index];
    exactObject(row, ['locator','blobOid','byteLength','rawSha256','semanticDigest'], 'SOURCE_ORIGIN_PROJECT_OWNER');
    if (
      typeof row.locator !== 'string'
      || row.locator.length === 0
      || !regexpTest(HEX40_OR_64, row.blobOid)
      || !NUMBER_IS_SAFE_INTEGER(row.byteLength)
      || row.byteLength < 0
      || !regexpTest(HEX64, row.rawSha256)
      || !regexpTest(HEX64, row.semanticDigest)
      || (previous !== undefined && compareCodeUnits(previous, row.locator) >= 0)
      || mapHas(identityByLocator, row.locator)
    ) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
    previous = row.locator;
    mapSet(identityByLocator, row.locator, row);
  }
  if (owners.ownerSetDigest !== sha256Canonical('galerina.logic-aig-frozen-owner-set.v1', owners.identities)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  let ownerBlobs;
  try {
    ownerBlobs = admitFrozenBlobSet(arrayMap(owners.identities, (row) => ({ path: row.locator, byteLength: row.byteLength, rawSha256: row.rawSha256 })), ownerBlobsInput, { label: 'OWNER_SET' });
  } catch {
    refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  }

  const parser = validateParserPolicy(owners.values.parser);
  const exporterIdentity = mapGet(identityByLocator, OWNER_LOCATORS.exporter);
  if (!exporterIdentity) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  const validatedValues = {
    repositoryIdentity: validateRepositoryIdentity(owners.values.repositoryIdentity),
    source: validateSourcePolicy(owners.values.source),
    resolution: validateResolutionPolicy(owners.values.resolution),
    parser,
    pins: validateToolchainPins(owners.values.pins),
    generated: validateGeneratedConsumerPolicy(owners.values.generated),
    proposedBaseline: validateProposedBaseline(owners.values.proposedBaseline),
    expectedOutcomes: validateExpectedParseOutcomes(owners.values.expectedOutcomes, { parserPolicy: parser }),
    gate: validateGateOwner(owners.values.gate, parser),
  };
  defineData(validatedValues, 'exporter', validateLocalExporterPolicy(
    owners.values.exporter,
    exporterBindings({ ...validatedValues, exporter: owners.values.exporter }),
    exporterIdentity.semanticDigest,
  ));
  for (let index = 0; index < OWNER_NAMES.length; index += 1) {
    const name = OWNER_NAMES[index];
    const locator = OWNER_LOCATORS[name];
    const identity = mapGet(identityByLocator, locator);
    const bytes = ownerBlobs.get(locator);
    const value = validatedValues[name];
    if (!identity || !bytes || !sameData(value, owners.values[name]) || identity.semanticDigest !== ownerSemanticDigest(name, value)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
    verifyGitBlobOid(identity.blobOid, bytes, 'SOURCE_ORIGIN_PROJECT_OWNER');
    if (name === 'gate') {
      if (!sameData(parseGateOwnerBytes(bytes, parser), value)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
    } else {
      let parsed;
      try { parsed = parseCanonicalJsonBytes(bytes, { label: locator }); } catch { refuse('SOURCE_ORIGIN_PROJECT_OWNER'); }
      if (!sameData(parsed, value)) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
    }
  }
  return {
    values: validatedValues,
    ownerBlobs,
    ownerSetDigest: owners.ownerSetDigest,
    ownerObjectFormats: uniqueArray(arrayMap(owners.identities, (row) => row.blobOid.length === 40 ? 'sha1' : 'sha256')),
  };
}

function manifestBinding(manifestKind, row) {
  const domain = manifestKind === 'SOURCE_MANIFEST'
    ? 'galerina.logic-aig-source-manifest-row.v1'
    : manifestKind === 'RESOLUTION_INPUTS'
      ? 'galerina.logic-aig-resolution-input-row.v1'
      : refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
  return {
    manifestKind,
    manifestRowDigest: sha256Canonical(domain, row),
    path: row.path,
    blobOid: row.blobOid,
    rawSha256: row.rawSha256,
    byteLength: row.byteLength,
  };
}

function ownerBinding(expected, sourceByPath, resolutionByPath, proposedByName) {
  const manifestKind = expected.ownerKind === 'INLINE_EXPECTATION' ? 'SOURCE_MANIFEST' : 'RESOLUTION_INPUTS';
  const row = manifestKind === 'SOURCE_MANIFEST' ? mapGet(sourceByPath, expected.ownerLocator) : mapGet(resolutionByPath, expected.ownerLocator);
  if (!row) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
  const binding = manifestBinding(manifestKind, row);
  return {
    ownerKind: expected.ownerKind,
    manifestKind: binding.manifestKind,
    manifestRowDigest: binding.manifestRowDigest,
    locator: binding.path,
    blobOid: binding.blobOid,
    rawSha256: binding.rawSha256,
    byteLength: binding.byteLength,
    ownerKey: expected.ownerKey,
    ownerReason: expected.ownerKind === 'PROPOSED_BASELINE' ? mapGet(proposedByName, expected.ownerKey)?.reason ?? refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES') : null,
  };
}

function parserIdForDomain(parserPolicy, domain) {
  return arrayFind(parserPolicy.domainParserBindings, (row) => row.domain === domain)?.parserId ?? refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
}

function sourceBasename(locator) {
  const index = stringLastIndexOf(locator, '/');
  return index === -1 ? locator : stringSlice(locator, index + 1);
}

function decodeSourceText(bytes) {
  return decodeUtf8(bytes, 'SOURCE_ORIGIN_PROJECT_OUTCOMES');
}

function deriveExpectedOutcomes(captured) {
  const sourceByPath = mapFromArray(captured.sourceManifest.rows, (row) => row.path);
  const resolutionByPath = mapFromArray(captured.resolutionInputs.rows, (row) => row.path);
  const proposedByName = mapFromArray(captured.values.proposedBaseline.entries, (row) => row.directoryName);
  const derived = [];
  for (let rowIndex = 0; rowIndex < captured.sourceManifest.rows.length; rowIndex += 1) {
    const sourceRow = ownArrayValue(captured.sourceManifest.rows, rowIndex, 'SOURCE_ORIGIN_PROJECT_OUTCOMES');
    const bytes = captured.sourceBlobs.get(sourceRow.path);
    if (!bytes) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
    const proposedMatches = arrayFilter(stringSplit(sourceRow.path, '/'), (component) => mapHas(proposedByName, component));
    if (proposedMatches.length > 1) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
    const proposedName = optionalOwnArrayValue(proposedMatches, 0) ?? null;
    const sidecarLocator = `${sourceRow.path}.expected.diagnostics.txt`;
    const sidecarRow = mapGet(resolutionByPath, sidecarLocator);
    const domain = classifySourcePath(sourceRow.path, captured.values.source);
    const parserId = parserIdForDomain(captured.values.parser, domain);
    const candidates = [];
    if (proposedName !== null) {
      if (sidecarRow) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
      append(candidates, {
        path: sourceRow.path, domain, parserId, disposition: 'OPAQUE_PROPOSED',
        diagnosticCodes: null, ownerKind: 'PROPOSED_BASELINE',
        ownerLocator: OWNER_LOCATORS.proposedBaseline, ownerKey: proposedName,
      });
    } else {
      const text = decodeSourceText(bytes);
      const matches = regexpMatches(DIAGNOSTIC_HEADER, text);
      if (matches.length > 1) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
      const firstMatch = optionalOwnArrayValue(matches, 0);
      const inlineHeader = firstMatch === undefined ? null : ownArrayValue(firstMatch, 1, 'SOURCE_ORIGIN_PROJECT_OUTCOMES');
      const hasInlineExpectation = inlineHeader !== null && inlineHeader !== 'none';
      if (hasInlineExpectation && sidecarRow) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
      if (hasInlineExpectation) {
        let diagnosticCodes;
        try { diagnosticCodes = decodeDiagnosticSet(inlineHeader, captured.values.parser); } catch { refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES'); }
        append(candidates, {
          path: sourceRow.path, domain, parserId, disposition: 'EXPECTED_REFUSAL',
          diagnosticCodes, ownerKind: 'INLINE_EXPECTATION', ownerLocator: sourceRow.path,
          ownerKey: 'expected_diagnostics',
        });
      }
      if (sidecarRow) {
        const sidecarBytes = captured.resolutionBlobs.get(sidecarLocator);
        if (!sidecarBytes) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
        let diagnosticCodes;
        try { diagnosticCodes = decodeDiagnosticSet(decodeSourceText(sidecarBytes), captured.values.parser); } catch { refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES'); }
        append(candidates, {
          path: sourceRow.path, domain, parserId, disposition: 'EXPECTED_REFUSAL',
          diagnosticCodes, ownerKind: 'SIDECAR_EXPECTATION', ownerLocator: sidecarLocator,
          ownerKey: 'complete-file',
        });
      }
      if (domain === 'GATE') {
        const key = sourceBasename(sourceRow.path);
        const verdict = optionalOwnDataValue(captured.values.gate, key);
        if (verdict !== undefined && verdict.ok === false) append(candidates, {
          path: sourceRow.path, domain, parserId, disposition: 'EXPECTED_REFUSAL',
          diagnosticCodes: verdict.codes, ownerKind: 'GATE_V3_VERDICT',
          ownerLocator: OWNER_LOCATORS.gate, ownerKey: key,
        });
      }
    }
    if (candidates.length > 1) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
    if (candidates.length === 1) append(derived, ownArrayValue(candidates, 0, 'SOURCE_ORIGIN_PROJECT_OUTCOMES'));
  }
  sortArray(derived, (left, right) => compareCodeUnits(left.path, right.path));
  if (!sameData(derived, captured.values.expectedOutcomes.rows)) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
  return { rows: derived, sourceByPath, resolutionByPath, proposedByName };
}

function filteredSource(captured, outcomePaths) {
  const rows = arrayFilter(captured.sourceManifest.rows, (row) => !setHas(outcomePaths, row.path));
  const body = {
    schema: captured.sourceManifest.schema,
    repositoryId: captured.sourceManifest.repositoryId,
    expectedHead: captured.sourceManifest.expectedHead,
    expectedTree: captured.sourceManifest.expectedTree,
    objectFormat: captured.sourceManifest.objectFormat,
    policyDigest: captured.sourceManifest.policyDigest,
    exclusionDigest: captured.sourceManifest.exclusionDigest,
    rows,
    counts: {
      paths: rows.length,
      blobs: setSize(setFromArray(rows, (row) => row.blobOid)),
      bytes: arrayReduce(rows, (sum, row) => sum + row.byteLength, 0),
      mode100644: arrayFilter(rows, (row) => row.mode === '100644').length,
      mode100755: arrayFilter(rows, (row) => row.mode === '100755').length,
      exclusions: captured.values.source.exclusions.length,
    },
    authorizing: false,
  };
  return {
    manifest: { ...body, manifestDigest: sha256Canonical(body.schema, body) },
    blobs: mapFromArray(rows, (row) => row.path, (row) => captured.sourceBlobs.get(row.path)),
  };
}

function decoderOptions(captured, filtered, toolchainBlobs) {
  return {
    repositoryIdentity: captured.values.repositoryIdentity,
    sourcePolicy: captured.values.source,
    resolutionPolicy: captured.values.resolution,
    parserPolicy: captured.values.parser,
    pins: captured.values.pins,
    sourceManifest: filtered.manifest,
    sourceBlobs: filtered.blobs,
    resolutionInputs: captured.resolutionInputs,
    resolutionBlobs: captured.resolutionBlobs,
    toolchainBlobs,
    platform: captured.platform,
    arch: captured.arch,
    nodeIdentity: captured.nodeIdentity,
    gitIdentity: captured.gitIdentity,
  };
}

function toolchainSubsets(captured) {
  const record = arrayFind(captured.values.pins.records, (row) => row.platform === captured.platform && row.arch === captured.arch);
  if (!record) refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN');
  const host = arrayFind(record.runtimeLoadSets, (row) => row.id === 'HOST');
  if (!host) refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN');
  const hostLocator = `${host.entry.rootLocator}/${host.entry.locator}`;
  const parserSourceParts = [record.sourceOriginParser.sourceEntry.locator];
  for (let index = 0; index < record.sourceOriginParser.sourceEdgeRows.length; index += 1) {
    append(parserSourceParts, record.sourceOriginParser.sourceEdgeRows[index].fromLocator);
    append(parserSourceParts, record.sourceOriginParser.sourceEdgeRows[index].toLocator);
  }
  const parserSourceLocators = arrayMap(sortArray(uniqueArray(parserSourceParts)), (locator) => `${record.sourceOriginParser.sourceEntry.rootLocator}/${locator}`);
  const required = [hostLocator];
  for (let index = 0; index < parserSourceLocators.length; index += 1) append(required, parserSourceLocators[index]);
  sortArray(required);
  const rows = arrayMap(required, (locator) => {
    const executable = arrayFind(record.executableModuleRows, (row) => row.locator === locator);
    const data = arrayFind(record.dataRows, (row) => row.locator === locator);
    const identity = executable ?? data;
    if (!identity) refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN');
    return { path: locator, byteLength: identity.byteLength, rawSha256: identity.rawSha256 };
  });
  let all;
  try { all = admitFrozenBlobSet(rows, captured.toolchainBlobsInput, { label: 'SOURCE_MANIFEST' }); } catch { refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN'); }
  const hostMap = new SAFE_MAP();
  mapSet(hostMap, hostLocator, all.get(hostLocator));
  return {
    host: hostMap,
    parser: mapFromArray(required, (locator) => locator, (locator) => all.get(locator)),
  };
}

function validateGlobalLocatorClosure(sourceManifest, pins, platform, arch) {
  const record = arrayFind(pins.records, (row) => row.platform === platform && row.arch === arch);
  if (!record) refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN');
  const rows = arrayMap(sourceManifest.rows, (row) => ({ locator: row.path, byteLength: row.byteLength, rawSha256: row.rawSha256 }));
  for (let index = 0; index < record.executableModuleRows.length; index += 1) append(rows, record.executableModuleRows[index]);
  for (let index = 0; index < record.dataRows.length; index += 1) append(rows, record.dataRows[index]);
  const exact = new SAFE_MAP();
  const folded = new SAFE_MAP();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const retained = mapGet(exact, row.locator);
    if (retained) {
      if (retained.byteLength !== row.byteLength || retained.rawSha256 !== row.rawSha256) refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN');
      continue;
    }
    const lower = stringToLowerCase(row.locator);
    if (mapHas(folded, lower)) refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN');
    mapSet(exact, row.locator, row);
    mapSet(folded, lower, row.locator);
  }
}

function captureOptions(options) {
  exactObject(options, OPTION_KEYS);
  const ownerCapture = validateOwners(options.owners, options.ownerBlobs);
  const values = ownerCapture.values;
  const sourceManifest = validateSourceManifest(options.sourceManifest, { repositoryIdentity: values.repositoryIdentity, sourcePolicy: values.source });
  const resolutionInputs = validateResolutionInputs(options.resolutionInputs, { repositoryIdentity: values.repositoryIdentity, resolutionPolicy: values.resolution });
  if (ownerCapture.ownerObjectFormats.length !== 1 || ownerCapture.ownerObjectFormats[0] !== sourceManifest.objectFormat) refuse('SOURCE_ORIGIN_PROJECT_OWNER');
  if (
    sourceManifest.repositoryId !== resolutionInputs.repositoryId
    || sourceManifest.expectedHead !== resolutionInputs.expectedHead
    || sourceManifest.expectedTree !== resolutionInputs.expectedTree
  ) refuse('SOURCE_ORIGIN_PROJECT_SCHEMA');
  const sourceBlobs = admitFrozenBlobSet(sourceManifest.rows, options.sourceBlobs, { label: 'SOURCE_MANIFEST' });
  const resolutionBlobs = admitFrozenBlobSet(resolutionInputs.rows, options.resolutionBlobs, { label: 'RESOLUTION_INPUTS' });
  for (let index = 0; index < sourceManifest.rows.length; index += 1) {
    const row = sourceManifest.rows[index];
    verifyGitBlobOid(row.blobOid, sourceBlobs.get(row.path), 'SOURCE_ORIGIN_PROJECT_SOURCE');
  }
  for (let index = 0; index < resolutionInputs.rows.length; index += 1) {
    const row = resolutionInputs.rows[index];
    verifyGitBlobOid(row.blobOid, resolutionBlobs.get(row.path), 'SOURCE_ORIGIN_PROJECT_RESOLUTION');
  }
  if (typeof options.platform !== 'string' || typeof options.arch !== 'string') refuse('SOURCE_ORIGIN_PROJECT_SCHEMA');
  validateGlobalLocatorClosure(sourceManifest, values.pins, options.platform, options.arch);
  return {
    ...ownerCapture,
    sourceManifest,
    sourceBlobs,
    resolutionInputs,
    resolutionBlobs,
    toolchainBlobsInput: options.toolchainBlobs,
    platform: options.platform,
    arch: options.arch,
    nodeIdentity: options.nodeIdentity,
    gitIdentity: options.gitIdentity,
  };
}

function compareUnresolved(left, right) {
  const fields = ['sourceNodeId','relationshipClass','reasonCode','sourceLocator','evidenceDigest'];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const compared = compareCodeUnits(left[field], right[field]);
    if (compared !== 0) return compared;
  }
  return 0;
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

function outcomeSemanticRows(captured, outcomes) {
  const grouped = new SAFE_MAP();
  for (let index = 0; index < outcomes.rows.length; index += 1) {
    const expected = outcomes.rows[index];
    const rows = mapGet(grouped, expected.parserId) ?? [];
    append(rows, mapGet(outcomes.sourceByPath, expected.path));
    mapSet(grouped, expected.parserId, rows);
  }
  const outputs = [];
  const groups = mapEntriesArray(grouped);
  for (let index = 0; index < groups.length; index += 1) {
    const parserId = groups[index][0];
    const sourceRows = groups[index][1];
    try {
      append(outputs, buildSemanticRows({
        repositoryId: captured.sourceManifest.repositoryId,
        parserId,
        sourceRows,
        parseResults: arrayMap(sourceRows, (row) => ({ path: row.path, status: 'REFUSED', diagnosticCodes: [] })),
        declarations: [],
        relations: [],
        parserPolicy: captured.values.parser,
        resolutionPolicy: captured.values.resolution,
      }));
    } catch {
      refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
    }
  }
  return outputs;
}

function makeOutcomeRows(captured, outcomes, fileNodes, unresolved) {
  const rows = [];
  for (let expectedIndex = 0; expectedIndex < outcomes.rows.length; expectedIndex += 1) {
    const expected = outcomes.rows[expectedIndex];
    const sourceRow = mapGet(outcomes.sourceByPath, expected.path);
    const fileNode = mapGet(fileNodes, expected.path);
    if (!sourceRow || !fileNode) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
    const sourceBinding = manifestBinding('SOURCE_MANIFEST', sourceRow);
    const ownerBindings = [ownerBinding(expected, outcomes.sourceByPath, outcomes.resolutionByPath, outcomes.proposedByName)];
    const membershipBody = {
      schema: 'galerina.logic-aig-outcome-membership-proof.v1',
      expectedOutcomesDigest: captured.values.expectedOutcomes.expectedOutcomesDigest,
      path: expected.path,
      disposition: expected.disposition,
      parserId: expected.parserId,
      expectedDiagnosticCodes: expected.diagnosticCodes,
      sourceBinding,
      ownerBindings,
      authorizing: false,
    };
    const membershipProofDigest = sha256Canonical(membershipBody.schema, membershipBody);
    const outcomeUnresolved = [];
    for (let relationshipIndex = 0; relationshipIndex < RELATIONSHIP_CLASSES.length; relationshipIndex += 1) {
      const relationshipClass = RELATIONSHIP_CLASSES[relationshipIndex];
      const reasonCode = `OWNER_DISPOSITION_${relationshipClass}_UNRESOLVED`;
      const policyRow = arrayFind(captured.values.parser.unresolvedReasonRows, (row) => row.relationshipClass === relationshipClass && row.reasonCode === reasonCode);
      if (!policyRow || !sameData(policyRow.permittedCandidateStates, ['NOT_APPLICABLE'])) refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
      const evidenceBody = {
        sourceNodeId: fileNode.id,
        sourceLocator: fileNode.locator,
        relationshipClass,
        reasonCode,
        evidenceOwnerDigest: membershipProofDigest,
      };
      append(outcomeUnresolved, { ...evidenceBody, evidenceDigest: sha256Canonical('galerina.logic-aig-unresolved-evidence.v1', evidenceBody) });
    }
    sortArray(outcomeUnresolved, compareUnresolved);
    for (let index = 0; index < outcomeUnresolved.length; index += 1) append(unresolved, outcomeUnresolved[index]);
    const body = {
      path: expected.path,
      disposition: expected.disposition,
      parserId: expected.parserId,
      actualStatus: expected.disposition === 'EXPECTED_REFUSAL' ? 'REFUSED_AS_EXPECTED' : 'OPAQUE_AS_PROPOSED',
      actualDiagnosticCodes: expected.diagnosticCodes,
      sourceBinding,
      ownerBindings,
      membershipProofDigest,
      representedFileNodeId: fileNode.id,
      unresolvedRowsDigest: sha256Canonical('galerina.logic-aig-outcome-unresolved-rows.v1', outcomeUnresolved),
    };
    append(rows, { ...body, rowDigest: sha256Canonical('galerina.logic-aig-parse-outcome-row.v1', body) });
  }
  return rows;
}

function makeOutcomeReceipt(captured, rows, toolchainManifest) {
  const body = {
    schema: 'galerina.logic-aig-parse-outcomes-receipt.v1',
    repositoryId: captured.sourceManifest.repositoryId,
    expectedHead: captured.sourceManifest.expectedHead,
    expectedTree: captured.sourceManifest.expectedTree,
    expectedOutcomesDigest: captured.values.expectedOutcomes.expectedOutcomesDigest,
    sourceManifestDigest: captured.sourceManifest.manifestDigest,
    resolutionInputsDigest: captured.resolutionInputs.resolutionInputsDigest,
    toolchainManifestDigest: toolchainManifest.toolchainManifestDigest,
    rows,
    counts: {
      outcomeRows: rows.length,
      expectedRefusalRows: arrayFilter(rows, (row) => row.disposition === 'EXPECTED_REFUSAL').length,
      opaqueProposedRows: arrayFilter(rows, (row) => row.disposition === 'OPAQUE_PROPOSED').length,
      representedFileNodes: setSize(setFromArray(rows, (row) => row.representedFileNodeId)),
      unresolvedRows: rows.length * RELATIONSHIP_CLASSES.length,
      ownerBindings: arrayReduce(rows, (sum, row) => sum + row.ownerBindings.length, 0),
    },
    authorizing: false,
  };
  const receipt = { ...body, receiptDigest: sha256Canonical(body.schema, body) };
  try {
    return validateParseOutcomesReceipt(receipt, {
      repositoryIdentity: captured.values.repositoryIdentity,
      sourcePolicy: captured.values.source,
      resolutionPolicy: captured.values.resolution,
      parserPolicy: captured.values.parser,
      pins: captured.values.pins,
      proposedBaseline: captured.values.proposedBaseline,
      expectedOutcomes: captured.values.expectedOutcomes,
      sourceManifest: captured.sourceManifest,
      resolutionInputs: captured.resolutionInputs,
      toolchainManifest,
    });
  } catch {
    refuse('SOURCE_ORIGIN_PROJECT_OUTCOMES');
  }
}

export async function decodeSourceProject(options) {
  const captured = captureOptions(options);
  const outcomes = deriveExpectedOutcomes(captured);
  const outcomePaths = setFromArray(outcomes.rows, (row) => row.path);
  const filtered = filteredSource(captured, outcomePaths);
  const toolchains = toolchainSubsets(captured);
  let host;
  let fungiGate;
  try {
    host = await decodeHostProject(decoderOptions(captured, filtered, toolchains.host));
    fungiGate = await decodeFungiGateProject(decoderOptions(captured, filtered, toolchains.parser));
  } catch {
    refuse('SOURCE_ORIGIN_PROJECT_PARSE');
  }
  if (!sameData(host.actualRuntimeLoadSet, fungiGate.actualRuntimeLoadSets[0])) refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN');
  let toolchainManifest;
  try {
    toolchainManifest = buildToolchainSnapshot({
      pins: captured.values.pins,
      platform: captured.platform,
      arch: captured.arch,
      nodeIdentity: captured.nodeIdentity,
      gitIdentity: captured.gitIdentity,
      actualRuntimeLoadSets: fungiGate.actualRuntimeLoadSets,
      actualParserExportNames: fungiGate.actualParserExportNames,
    });
    toolchainManifest = validateToolchainManifest(toolchainManifest, { pins: captured.values.pins });
  } catch {
    refuse('SOURCE_ORIGIN_PROJECT_TOOLCHAIN');
  }

  const ownerSemantic = outcomeSemanticRows(captured, outcomes);
  const nodeGroups = [host.nodes, fungiGate.nodes];
  const idMapGroups = [host.idMapRows, fungiGate.idMapRows];
  for (let index = 0; index < ownerSemantic.length; index += 1) {
    append(nodeGroups, ownerSemantic[index].nodes);
    append(idMapGroups, ownerSemantic[index].idMapRows);
  }
  const nodes = sortArray(flattenArrays(nodeGroups), (left, right) => compareCodeUnits(left.id, right.id));
  const edges = arrayCopy(host.edges);
  for (let index = 0; index < fungiGate.edges.length; index += 1) append(edges, fungiGate.edges[index]);
  sortArray(edges, (left, right) => compareCodeUnits(left.id, right.id));
  const unresolved = arrayCopy(host.unresolved);
  for (let index = 0; index < fungiGate.unresolved.length; index += 1) append(unresolved, fungiGate.unresolved[index]);
  const idMapRows = sortArray(flattenArrays(idMapGroups), compareIdMapRows);
  if (
    nodes.length > SOURCE_ORIGIN_LIMITS.nodes
    || edges.length > SOURCE_ORIGIN_LIMITS.edges
    || setSize(setFromArray(nodes, (row) => row.id)) !== nodes.length
    || setSize(setFromArray(edges, (row) => row.id)) !== edges.length
    || setSize(setFromArray(idMapRows, (row) => row.rowDigest)) !== idMapRows.length
  ) refuse('SOURCE_ORIGIN_PROJECT_CONSERVATION');
  const fileNodes = mapFromArray(arrayFilter(nodes, (row) => row.kind === 'FILE'), (row) => row.locator);
  if (mapSize(fileNodes) !== captured.sourceManifest.rows.length || arraySome(captured.sourceManifest.rows, (row) => !mapHas(fileNodes, row.path))) refuse('SOURCE_ORIGIN_PROJECT_CONSERVATION');
  const outcomeRows = makeOutcomeRows(captured, outcomes, fileNodes, unresolved);
  sortArray(unresolved, compareUnresolved);
  if (unresolved.length > SOURCE_ORIGIN_LIMITS.unresolvedRows || setSize(setFromArray(unresolved, (row) => row.evidenceDigest)) !== unresolved.length) refuse('SOURCE_ORIGIN_PROJECT_CONSERVATION');
  const parseOutcomesReceipt = makeOutcomeReceipt(captured, outcomeRows, toolchainManifest);
  const parseResults = arrayCopy(host.parseResults);
  for (let index = 0; index < fungiGate.parseResults.length; index += 1) append(parseResults, fungiGate.parseResults[index]);
  sortArray(parseResults, (left, right) => compareCodeUnits(left.path, right.path));
  if (parseResults.length + outcomeRows.length !== captured.sourceManifest.rows.length || arraySome(parseResults, (row) => row.status !== 'PARSED')) refuse('SOURCE_ORIGIN_PROJECT_PARSE');
  return deepFreeze(frozenNullRecord({
    nodes,
    edges,
    unresolved,
    parseResults,
    idMapRows,
    idMapDigest: sha256Canonical('galerina.logic-aig-id-map.v1', idMapRows),
    toolchainManifest,
    parseOutcomesReceipt,
    authorizing: false,
  }));
}
