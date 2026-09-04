import { isProxy } from 'node:util/types';

import {
  canonicalJsonText,
  sha256Canonical,
  validateToolchainPins,
} from './contract.mjs';

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
const OBJECT_KEYS = Object.keys;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_IS_ARRAY = Array.isArray;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const STRING_INCLUDES = String.prototype.includes;
const STRING_STARTS_WITH = String.prototype.startsWith;
const STRING_ENDS_WITH = String.prototype.endsWith;
const STRING_SPLIT = String.prototype.split;
const STRING_NORMALIZE = String.prototype.normalize;
const STRING_TO_LOWER_CASE = String.prototype.toLowerCase;
const REGEXP_EXEC = RegExp.prototype.exec;
const SAFE_SET = Set;
const SET_ADD = Set.prototype.add;
const SET_HAS = Set.prototype.has;
const SAFE_MAP = Map;
const MAP_GET = Map.prototype.get;
const MAP_SET = Map.prototype.set;

function defineData(target, key, value) {
  const descriptor = OBJECT_CREATE(null);
  descriptor.configurable = true;
  descriptor.enumerable = true;
  descriptor.value = value;
  descriptor.writable = true;
  OBJECT_DEFINE_PROPERTY(target, key, descriptor);
}

function append(values, value) {
  defineData(values, `${values.length}`, value);
}

function arrayCopy(values) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) append(output, values[index]);
  return output;
}

function arrayMap(values, operation) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) append(output, operation(values[index], index));
  return output;
}

function arrayFilter(values, predicate) {
  const output = [];
  for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) append(output, values[index]);
  return output;
}

function arrayFind(values, predicate) {
  for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) return values[index];
  return undefined;
}

function arraySome(values, predicate) {
  for (let index = 0; index < values.length; index += 1) if (predicate(values[index], index)) return true;
  return false;
}

function arrayIncludes(values, sought) {
  for (let index = 0; index < values.length; index += 1) if (values[index] === sought) return true;
  return false;
}

function sortArray(values, compare = compareCodeUnits) {
  return REFLECT_APPLY(ARRAY_SORT, values, [compare]);
}

function stringNormalize(value) { return REFLECT_APPLY(STRING_NORMALIZE, value, ['NFC']); }
function stringIncludes(value, part) { return REFLECT_APPLY(STRING_INCLUDES, value, [part]); }
function stringStartsWith(value, part) { return REFLECT_APPLY(STRING_STARTS_WITH, value, [part]); }
function stringEndsWith(value, part) { return REFLECT_APPLY(STRING_ENDS_WITH, value, [part]); }
function stringSplit(value, separator) { return REFLECT_APPLY(STRING_SPLIT, value, [separator]); }
function stringToLowerCase(value) { return REFLECT_APPLY(STRING_TO_LOWER_CASE, value, []); }
function regexpTest(pattern, value) {
  const firstDescriptor = OBJECT_CREATE(null);
  firstDescriptor.value = 0;
  OBJECT_DEFINE_PROPERTY(pattern, 'lastIndex', firstDescriptor);
  try { return REFLECT_APPLY(REGEXP_EXEC, pattern, [value]) !== null; }
  finally {
    const finalDescriptor = OBJECT_CREATE(null);
    finalDescriptor.value = 0;
    OBJECT_DEFINE_PROPERTY(pattern, 'lastIndex', finalDescriptor);
  }
}
function setHas(values, value) { return REFLECT_APPLY(SET_HAS, values, [value]); }
function setAdd(values, value) { REFLECT_APPLY(SET_ADD, values, [value]); }
function mapGet(values, key) { return REFLECT_APPLY(MAP_GET, values, [key]); }
function mapSet(values, key, value) { REFLECT_APPLY(MAP_SET, values, [key, value]); }

const HEX64 = /^[0-9a-f]{64}$/;
const BUILTIN = /^node:[a-z0-9][a-z0-9_./-]*$/;

class ToolchainSnapshotRefusal extends Error {
  constructor(code) {
    super(code);
    defineData(this, 'name', 'ToolchainSnapshotRefusal');
    defineData(this, 'code', code);
  }
}

function refuse(code) {
  throw new ToolchainSnapshotRefusal(code);
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function copyClosedData(value, seen = new SAFE_SET(), depth = 0) {
  if (depth > 128) refuse('SOURCE_ORIGIN_SCHEMA');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value !== stringNormalize(value)) refuse('SOURCE_ORIGIN_SCHEMA');
    return value;
  }
  if (typeof value === 'number') {
    if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) refuse('SOURCE_ORIGIN_SCHEMA');
    return value;
  }
  if (typeof value !== 'object' || UTIL_TYPES_IS_PROXY(value) || setHas(seen, value)) refuse('SOURCE_ORIGIN_SCHEMA');
  setAdd(seen, value);

  if (ARRAY_IS_ARRAY(value)) {
    if (OBJECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse('SOURCE_ORIGIN_SCHEMA');
    const length = value.length;
    if (!NUMBER_IS_SAFE_INTEGER(length) || length < 0) refuse('SOURCE_ORIGIN_SCHEMA');
    const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
    if (names.length !== length + 1 || !arrayIncludes(names, 'length')) refuse('SOURCE_ORIGIN_SCHEMA');
    const output = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, `${index}`);
      if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse('SOURCE_ORIGIN_SCHEMA');
      append(output, copyClosedData(descriptor.value, seen, depth + 1));
    }
    return output;
  }

  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  if (prototype !== OBJECT_PROTOTYPE && prototype !== null || OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0) refuse('SOURCE_ORIGIN_SCHEMA');
  const output = OBJECT_CREATE(OBJECT_PROTOTYPE);
  const names = sortArray(OBJECT_GET_OWN_PROPERTY_NAMES(value));
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, name);
    if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value') || !descriptor.enumerable) refuse('SOURCE_ORIGIN_SCHEMA');
    if (name !== stringNormalize(name)) refuse('SOURCE_ORIGIN_SCHEMA');
    defineData(output, name, copyClosedData(descriptor.value, seen, depth + 1));
  }
  return output;
}

function exactObject(value, keys) {
  if (value === null || typeof value !== 'object' || ARRAY_IS_ARRAY(value)) refuse('SOURCE_ORIGIN_SCHEMA');
  const names = sortArray(OBJECT_KEYS(value));
  const expected = sortArray(arrayCopy(keys));
  if (names.length !== expected.length || arraySome(names, (name, index) => name !== expected[index])) refuse('SOURCE_ORIGIN_SCHEMA');
}

function array(value) {
  if (!ARRAY_IS_ARRAY(value)) refuse('SOURCE_ORIGIN_SCHEMA');
  return value;
}

function nonEmptyText(value) {
  if (typeof value !== 'string' || value.length === 0) refuse('SOURCE_ORIGIN_SCHEMA');
  return value;
}

function digest(value) {
  if (typeof value !== 'string' || !regexpTest(HEX64, value)) refuse('SOURCE_ORIGIN_SCHEMA');
  return value;
}

function nonNegativeInteger(value) {
  if (!NUMBER_IS_SAFE_INTEGER(value) || value < 0) refuse('SOURCE_ORIGIN_SCHEMA');
  return value;
}

function canonicalLocator(value) {
  nonEmptyText(value);
  if (
    stringIncludes(value, '\\')
    || stringIncludes(value, '\0')
    || stringStartsWith(value, '/')
    || stringEndsWith(value, '/')
    || stringIncludes(value, ':')
    || arraySome(stringSplit(value, '/'), (component) => component === '' || component === '.' || component === '..')
  ) refuse('SOURCE_ORIGIN_SCHEMA');
  return value;
}

function validateExecutableIdentity(value) {
  exactObject(value, ['version', 'executableRawSha256', 'executableByteLength']);
  nonEmptyText(value.version);
  digest(value.executableRawSha256);
  nonNegativeInteger(value.executableByteLength);
}

function validateClosureRow(value) {
  exactObject(value, ['locator', 'rawSha256', 'byteLength']);
  canonicalLocator(value.locator);
  digest(value.rawSha256);
  nonNegativeInteger(value.byteLength);
}

function assertSortedUnique(values, selector = (value) => value) {
  for (let index = 1; index < values.length; index += 1) {
    if (compareCodeUnits(selector(values[index - 1]), selector(values[index])) >= 0) refuse('SOURCE_ORIGIN_ORDER');
  }
}

function sameData(left, right) {
  return canonicalJsonText(left) === canonicalJsonText(right);
}

function validateLoadedRows(rows, admittedRows) {
  array(rows);
  for (let index = 0; index < rows.length; index += 1) validateClosureRow(rows[index]);
  assertSortedUnique(rows, (row) => row.locator);
  const admittedByLocator = new SAFE_MAP();
  for (let index = 0; index < admittedRows.length; index += 1) mapSet(admittedByLocator, admittedRows[index].locator, admittedRows[index]);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const admitted = mapGet(admittedByLocator, row.locator);
    if (!admitted || !sameData(row, admitted)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  }
}

function validateLoadedBuiltins(values, admittedValues) {
  array(values);
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== 'string' || !regexpTest(BUILTIN, values[index])) refuse('SOURCE_ORIGIN_SCHEMA');
  }
  assertSortedUnique(values);
  for (let index = 0; index < values.length; index += 1) if (!arrayIncludes(admittedValues, values[index])) refuse('SOURCE_ORIGIN_TOOLCHAIN');
}

function validateActualRuntimeLoadSets(values, record) {
  array(values);
  if (values.length !== 2 || values[0]?.id !== 'HOST' || values[1]?.id !== 'PARSER') refuse('SOURCE_ORIGIN_TOOLCHAIN');
  for (let index = 0; index < values.length; index += 1) {
    const actual = values[index];
    const admitted = record.runtimeLoadSets[index];
    exactObject(actual, ['id', 'moduleRows', 'builtinModules']);
    if (actual.id !== admitted.id) refuse('SOURCE_ORIGIN_TOOLCHAIN');
    validateLoadedRows(actual.moduleRows, admitted.moduleRows);
    validateLoadedBuiltins(actual.builtinModules, admitted.builtinModules);
    if (!arraySome(actual.moduleRows, (row) => row.locator === admitted.entry.locator)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  }
}

function joinActualModuleRows(actualRuntimeLoadSets, admittedRuntimeLoadSets) {
  const exactLocators = new SAFE_SET();
  const foldedLocators = new SAFE_SET();
  const output = [];
  for (let index = 0; index < actualRuntimeLoadSets.length; index += 1) {
    const actual = actualRuntimeLoadSets[index];
    const rootLocator = admittedRuntimeLoadSets[index].entry.rootLocator;
    for (let rowIndex = 0; rowIndex < actual.moduleRows.length; rowIndex += 1) {
      const row = actual.moduleRows[rowIndex];
      const locator = `${rootLocator}/${row.locator}`;
      const folded = stringToLowerCase(locator);
      if (setHas(exactLocators, locator) || setHas(foldedLocators, folded)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
      setAdd(exactLocators, locator);
      setAdd(foldedLocators, folded);
      append(output, { locator, rawSha256: row.rawSha256, byteLength: row.byteLength });
    }
  }
  sortArray(output, (left, right) => compareCodeUnits(left.locator, right.locator));
  return output;
}

function builtinUnion(actualRuntimeLoadSets) {
  const seen = new SAFE_SET();
  const output = [];
  for (let outer = 0; outer < actualRuntimeLoadSets.length; outer += 1) {
    const values = actualRuntimeLoadSets[outer].builtinModules;
    for (let inner = 0; inner < values.length; inner += 1) if (!setHas(seen, values[inner])) {
      setAdd(seen, values[inner]);
      append(output, values[inner]);
    }
  }
  return sortArray(output);
}

function deepFreeze(value, seen = new SAFE_SET()) {
  if (value === null || typeof value !== 'object' || setHas(seen, value)) return value;
  setAdd(seen, value);
  const names = OBJECT_GET_OWN_PROPERTY_NAMES(value);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, names[index]);
    if (descriptor && OBJECT_HAS_OWN(descriptor, 'value')) deepFreeze(descriptor.value, seen);
  }
  return OBJECT_FREEZE(value);
}

export function prepareToolchainSelection(options) {
  const input = copyClosedData(options);
  canonicalJsonText(input);
  exactObject(input, [
    'pins', 'platform', 'arch', 'nodeIdentity', 'gitIdentity',
    'selector', 'guardRuntimeLoadSet', 'parserExportNames',
  ]);
  nonEmptyText(input.platform);
  nonEmptyText(input.arch);
  validateExecutableIdentity(input.nodeIdentity);
  validateExecutableIdentity(input.gitIdentity);

  const pins = validateToolchainPins(input.pins);
  if (pins.records.length === 0) refuse('SOURCE_ORIGIN_HOLD_TOOLCHAIN');
  const matchingRecords = arrayFilter(pins.records,
    (record) => record.platform === input.platform && record.arch === input.arch,
  );
  if (matchingRecords.length !== 1) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  const record = matchingRecords[0];
  if (!sameData(input.nodeIdentity, record.nodeIdentity) || !sameData(input.gitIdentity, record.gitIdentity)) refuse('SOURCE_ORIGIN_TOOLCHAIN');

  exactObject(input.selector, [
    'domain', 'parserId', 'runtimeLoadSetId', 'operation', 'recordId',
    'recordDigest', 'resolutionMode', 'entry',
  ]);
  const selectorTextFields = ['domain', 'parserId', 'runtimeLoadSetId', 'operation', 'recordId', 'resolutionMode'];
  for (let index = 0; index < selectorTextFields.length; index += 1) nonEmptyText(input.selector[selectorTextFields[index]]);
  digest(input.selector.recordDigest);
  exactObject(input.selector.entry, ['rootLocator', 'locator']);
  canonicalLocator(input.selector.entry.rootLocator);
  canonicalLocator(input.selector.entry.locator);
  if (
    input.selector.recordId !== record.recordId
    || input.selector.recordDigest !== record.recordDigest
    || input.selector.resolutionMode !== 'EXACT_ROOT_LOCAL_V1'
  ) refuse('SOURCE_ORIGIN_TOOLCHAIN');

  const domainSelection = arrayFind(record.domainSelections, (row) => row.domain === input.selector.domain);
  if (!domainSelection || !sameData(domainSelection, {
    domain: input.selector.domain,
    parserId: input.selector.parserId,
    runtimeLoadSetId: input.selector.runtimeLoadSetId,
    operation: input.selector.operation,
  })) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  const runtimeLoadSet = arrayFind(record.runtimeLoadSets, (row) => row.id === domainSelection.runtimeLoadSetId);
  if (!runtimeLoadSet || !sameData(input.selector.entry, runtimeLoadSet.entry)) refuse('SOURCE_ORIGIN_TOOLCHAIN');

  exactObject(input.guardRuntimeLoadSet, ['id', 'entry', 'moduleRows', 'builtinModules']);
  nonEmptyText(input.guardRuntimeLoadSet.id);
  exactObject(input.guardRuntimeLoadSet.entry, ['rootLocator', 'locator']);
  canonicalLocator(input.guardRuntimeLoadSet.entry.rootLocator);
  canonicalLocator(input.guardRuntimeLoadSet.entry.locator);
  validateLoadedRows(input.guardRuntimeLoadSet.moduleRows, runtimeLoadSet.moduleRows);
  validateLoadedBuiltins(input.guardRuntimeLoadSet.builtinModules, runtimeLoadSet.builtinModules);
  if (!sameData(input.guardRuntimeLoadSet, runtimeLoadSet)) refuse('SOURCE_ORIGIN_TOOLCHAIN');

  if (input.selector.domain === 'HOST') {
    if (input.parserExportNames !== null) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  } else {
    array(input.parserExportNames);
    assertSortedUnique(input.parserExportNames);
    if (!sameData(input.parserExportNames, ['lex', 'parseGateV3', 'parseProgram'])) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  }

  return deepFreeze({
    domain: domainSelection.domain,
    parserId: domainSelection.parserId,
    runtimeLoadSetId: domainSelection.runtimeLoadSetId,
    operation: domainSelection.operation,
    recordId: record.recordId,
    recordDigest: record.recordDigest,
    entry: runtimeLoadSet.entry,
    moduleRows: runtimeLoadSet.moduleRows,
    builtinModules: runtimeLoadSet.builtinModules,
    parserExportNames: input.parserExportNames,
    authorizing: false,
  });
}

export function prepareSemanticToolchain(options) {
  const input = copyClosedData(options);
  canonicalJsonText(input);
  exactObject(input, ['pins', 'platform', 'arch', 'nodeIdentity', 'gitIdentity']);
  nonEmptyText(input.platform);
  nonEmptyText(input.arch);
  validateExecutableIdentity(input.nodeIdentity);
  validateExecutableIdentity(input.gitIdentity);
  const pins = validateToolchainPins(input.pins);
  if (pins.records.length === 0) refuse('SOURCE_ORIGIN_HOLD_TOOLCHAIN');
  const matches = arrayFilter(pins.records, (record) => record.platform === input.platform && record.arch === input.arch);
  if (matches.length !== 1) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  const record = matches[0];
  if (!sameData(input.nodeIdentity, record.nodeIdentity) || !sameData(input.gitIdentity, record.gitIdentity)) refuse('SOURCE_ORIGIN_TOOLCHAIN');

  const selections = arrayMap(record.domainSelections, (domainSelection) => {
    const runtimeLoadSet = arrayFind(record.runtimeLoadSets, (row) => row.id === domainSelection.runtimeLoadSetId);
    if (!runtimeLoadSet) refuse('SOURCE_ORIGIN_TOOLCHAIN');
    const parserExportNames = domainSelection.domain === 'HOST'
      ? null
      : record.sourceOriginParser.exportNames;
    return {
      domain: domainSelection.domain,
      parserId: domainSelection.parserId,
      runtimeLoadSetId: domainSelection.runtimeLoadSetId,
      operation: domainSelection.operation,
      recordId: record.recordId,
      recordDigest: record.recordDigest,
      entry: runtimeLoadSet.entry,
      moduleRows: runtimeLoadSet.moduleRows,
      builtinModules: runtimeLoadSet.builtinModules,
      parserExportNames,
      authorizing: false,
    };
  });
  if (!sameData(arrayMap(selections, ({ domain, parserId, runtimeLoadSetId, operation }) => ({ domain, parserId, runtimeLoadSetId, operation })), record.domainSelections)) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  return deepFreeze({
    pinsDigest: pins.pinsDigest,
    recordId: record.recordId,
    recordDigest: record.recordDigest,
    platform: record.platform,
    arch: record.arch,
    nodeIdentity: record.nodeIdentity,
    gitIdentity: record.gitIdentity,
    selections,
    authorizing: false,
  });
}

export function buildToolchainSnapshot(options) {
  const input = copyClosedData(options);
  canonicalJsonText(input);
  exactObject(input, [
    'pins', 'platform', 'arch', 'nodeIdentity', 'gitIdentity',
    'actualRuntimeLoadSets', 'actualParserExportNames',
  ]);
  nonEmptyText(input.platform);
  nonEmptyText(input.arch);
  validateExecutableIdentity(input.nodeIdentity);
  validateExecutableIdentity(input.gitIdentity);

  const pins = validateToolchainPins(input.pins);
  if (pins.records.length === 0) refuse('SOURCE_ORIGIN_HOLD_TOOLCHAIN');
  const matchingRecords = arrayFilter(pins.records,
    (record) => record.platform === input.platform && record.arch === input.arch,
  );
  if (matchingRecords.length !== 1) refuse('SOURCE_ORIGIN_TOOLCHAIN');
  const record = matchingRecords[0];
  if (!sameData(input.nodeIdentity, record.nodeIdentity) || !sameData(input.gitIdentity, record.gitIdentity)) refuse('SOURCE_ORIGIN_TOOLCHAIN');

  validateActualRuntimeLoadSets(input.actualRuntimeLoadSets, record);
  array(input.actualParserExportNames);
  assertSortedUnique(input.actualParserExportNames);
  if (
    !sameData(input.actualParserExportNames, ['lex', 'parseGateV3', 'parseProgram'])
    || !sameData(input.actualParserExportNames, record.sourceOriginParser.exportNames)
  ) refuse('SOURCE_ORIGIN_TOOLCHAIN');

  const actualLoadedModuleRows = joinActualModuleRows(input.actualRuntimeLoadSets, record.runtimeLoadSets);
  validateLoadedRows(actualLoadedModuleRows, record.executableModuleRows);
  const actualLoadedBuiltinModules = builtinUnion(input.actualRuntimeLoadSets);
  validateLoadedBuiltins(actualLoadedBuiltinModules, record.builtinModules);

  const closureBody = {
    schema: 'galerina.logic-aig-module-closure.v1',
    executableModuleRows: record.executableModuleRows,
    dataRows: record.dataRows,
    builtinModules: record.builtinModules,
    counts: {
      executableModules: record.executableModuleRows.length,
      dataRows: record.dataRows.length,
      builtinModules: record.builtinModules.length,
    },
    authorizing: false,
  };
  const moduleClosureDigest = sha256Canonical(closureBody.schema, closureBody);
  if (moduleClosureDigest !== record.moduleClosureDigest) refuse('SOURCE_ORIGIN_DIGEST');

  const loadedBody = {
    schema: 'galerina.logic-aig-actual-loaded-set.v2',
    actualRuntimeLoadSets: input.actualRuntimeLoadSets,
    actualLoadedModuleRows,
    actualLoadedBuiltinModules,
    actualParserExportNames: input.actualParserExportNames,
    counts: {
      runtimeLoadSets: input.actualRuntimeLoadSets.length,
      modules: actualLoadedModuleRows.length,
      builtinModules: actualLoadedBuiltinModules.length,
      parserExports: input.actualParserExportNames.length,
    },
    authorizing: false,
  };
  const body = {
    schema: 'galerina.logic-aig-toolchain-manifest.v2',
    selectedPinRecordId: record.recordId,
    selectedPinRecordDigest: record.recordDigest,
    pinsDigest: pins.pinsDigest,
    sourceObservationDigest: record.sourceObservationDigest,
    loadObservationDigest: record.loadObservationDigest,
    platform: input.platform,
    arch: input.arch,
    nodeIdentity: record.nodeIdentity,
    gitIdentity: record.gitIdentity,
    typescript: record.typescript,
    sourceOriginParser: record.sourceOriginParser,
    runtimeLoadSets: record.runtimeLoadSets,
    domainSelections: record.domainSelections,
    builtinModules: record.builtinModules,
    executableModuleRows: record.executableModuleRows,
    dataRows: record.dataRows,
    moduleClosureDigest,
    actualRuntimeLoadSets: input.actualRuntimeLoadSets,
    actualLoadedModuleRows,
    actualLoadedBuiltinModules,
    actualParserExportNames: input.actualParserExportNames,
    actualLoadedSetDigest: sha256Canonical(loadedBody.schema, loadedBody),
    authorizing: false,
  };
  return deepFreeze({
    ...body,
    toolchainManifestDigest: sha256Canonical(body.schema, body),
  });
}
