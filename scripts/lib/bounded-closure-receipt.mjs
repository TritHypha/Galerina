import { types as utilTypes } from "node:util";

const RECEIPT_FIELDS = [
  "authorizing", "exclusions", "gates", "governance", "physicalProfile", "product",
  "projectCorpusReceiptDigest", "schema", "scope", "source", "status", "target",
];
const SCOPE_FIELDS = ["file", "package", "symbol"];
const SOURCE_FIELDS = ["contentDigest", "head", "tree"];
const TARGET_FIELDS = ["candidateDigest", "locator"];
const GOVERNANCE_FIELDS = ["planDigest", "rdDigest"];
const GATE_FIELDS = ["evidenceDigest", "name", "status"];
const EXCLUSION_FIELDS = ["authority", "name"];
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HASH = /^[0-9a-f]{40}$/u;
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PACKAGE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SYMBOL = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/u;

function refused(code) {
  return { kind: "refused", code };
}

function exactDataRecord(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string")) return false;
  const sorted = [...keys].sort();
  if (sorted.some((key, index) => key !== fields[index])) return false;
  return fields.every((key) => descriptors[key]?.enumerable === true
    && descriptors[key]?.get === undefined
    && descriptors[key]?.set === undefined
    && Object.hasOwn(descriptors[key] ?? {}, "value"));
}

function exactArray(value) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(descriptors).length !== length + 1) return null;
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor?.enumerable !== true
        || descriptor.get !== undefined
        || descriptor.set !== undefined
        || !Object.hasOwn(descriptor ?? {}, "value")) return null;
    result.push(descriptor.value);
  }
  return result;
}

function sameRecord(left, right, fields) {
  return exactDataRecord(left, fields)
    && exactDataRecord(right, fields)
    && fields.every((field) => left[field] === right[field]);
}

function canonicalPath(value) {
  return typeof value === "string"
    && value.length > 0
    && value === value.normalize("NFC")
    && !value.includes("\\")
    && !value.includes("\0")
    && !value.startsWith("/")
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function validScope(scope) {
  if (!exactDataRecord(scope, SCOPE_FIELDS)
      || !PACKAGE.test(scope.package)
      || !canonicalPath(scope.file)
      || !scope.file.startsWith(`packages-ts/${scope.package}/`)
      || !SYMBOL.test(scope.symbol)) return false;
  return true;
}

function validSource(source) {
  return exactDataRecord(source, SOURCE_FIELDS)
    && DIGEST.test(source.contentDigest)
    && HASH.test(source.head)
    && HASH.test(source.tree);
}

function validTarget(target, product, symbol) {
  if (!exactDataRecord(target, TARGET_FIELDS)
      || !DIGEST.test(target.candidateDigest)
      || typeof target.locator !== "string") return false;
  const parts = target.locator.split("#");
  return parts.length === 2
    && parts[1] === symbol
    && canonicalPath(parts[0])
    && parts[0].startsWith(`packages/fungi/products/${product}/`)
    && parts[0].endsWith(".fungi");
}

function validGovernance(governance) {
  return exactDataRecord(governance, GOVERNANCE_FIELDS)
    && DIGEST.test(governance.planDigest)
    && DIGEST.test(governance.rdDigest);
}

function exactExclusions(actual, expected) {
  const values = exactArray(actual);
  const requirements = exactArray(expected);
  return values !== null
    && requirements !== null
    && values.length === requirements.length
    && values.every((entry, index) => {
      const requirement = requirements[index];
      return exactDataRecord(entry, EXCLUSION_FIELDS)
        && exactDataRecord(requirement, EXCLUSION_FIELDS)
        && NAME.test(entry.name)
        && NAME.test(entry.authority)
        && entry.name === requirement.name
        && entry.authority === requirement.authority;
    });
}

export function validateBoundedClosureReceipt(value, options) {
  try {
    if (!exactDataRecord(value, RECEIPT_FIELDS)) return refused("CLOSURE_RECEIPT_SHAPE");
    if (value.schema !== "galerina.conversion-slice-receipt.v2"
        || value.authorizing !== false
        || value.status !== "PASS"
        || value.product !== "galerina"
        || value.physicalProfile !== 1
        || !DIGEST.test(value.projectCorpusReceiptDigest)) {
      return refused("CLOSURE_RECEIPT_IDENTITY");
    }
    if (!validScope(value.scope)
        || !validSource(value.source)
        || !validTarget(value.target, value.product, value.scope.symbol)
        || !validGovernance(value.governance)) {
      return refused("CLOSURE_RECEIPT_SCOPE");
    }
    if (options === null || typeof options !== "object" || Array.isArray(options) || utilTypes.isProxy(options)) {
      return refused("CLOSURE_RECEIPT_EXPECTATIONS");
    }
    const {
      requiredGates,
      requiredExclusions,
      expectedProduct,
      expectedScope,
      expectedSource,
      expectedTarget,
      expectedGovernance,
      expectedProjectCorpusReceiptDigest,
    } = options;
    if (expectedProduct !== value.product
        || !sameRecord(value.scope, expectedScope, SCOPE_FIELDS)
        || !sameRecord(value.source, expectedSource, SOURCE_FIELDS)
        || !sameRecord(value.target, expectedTarget, TARGET_FIELDS)
        || !sameRecord(value.governance, expectedGovernance, GOVERNANCE_FIELDS)
        || expectedProjectCorpusReceiptDigest !== value.projectCorpusReceiptDigest) {
      return refused("CLOSURE_RECEIPT_EXPECTATIONS");
    }
    const gateNames = exactArray(requiredGates);
    const gates = exactArray(value.gates);
    if (gateNames === null
        || gates === null
        || new Set(gateNames).size !== gateNames.length
        || gateNames.some((name) => typeof name !== "string" || !NAME.test(name))) {
      return refused("CLOSURE_RECEIPT_REQUIRED_GATES");
    }
    if (gates.length !== gateNames.length) return refused("CLOSURE_RECEIPT_GATE_COUNT");
    for (let index = 0; index < gates.length; index += 1) {
      const gate = gates[index];
      if (!exactDataRecord(gate, GATE_FIELDS)
          || gate.name !== gateNames[index]
          || gate.status !== "PASS"
          || !DIGEST.test(gate.evidenceDigest)) {
        return refused("CLOSURE_RECEIPT_GATE_EVIDENCE");
      }
    }
    if (!exactExclusions(value.exclusions, requiredExclusions)) {
      return refused("CLOSURE_RECEIPT_EXCLUSIONS");
    }
    return { kind: "accepted", value };
  } catch {
    return refused("CLOSURE_RECEIPT_HOSTILE_OBJECT");
  }
}
