// _rd0361-frozen-reference.mjs: RD-0361 SLIDE slice 1. A strict loader and comparator for a hash-pinned
// FROZEN REFERENCE SET. The frozen set is the oracle that replaces the live `.ts` differential once executable
// SLIDE integration lands. Until then the twin is checked three ways: WASM == frozen and `.ts` == frozen,
// while the existing rd0361-execution-cutover differential (WASM == `.ts`) keeps running unchanged.
//
// Fail-closed by construction: a BOM, invalid JSON, unknown or missing key, wrong schema, wrong twin, wrong
// ledger pin, duplicate case, count mismatch, non-K3 verdict, non-i32 argument, uncovered export or digest
// mismatch REFUSES. The comparator never skips: an export with no invoker throws ("unassessed is not clean").
// Zero-trust default, owner may revisit.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const FROZEN_REFERENCE_SCHEMA = "galerina.rd0361.frozen-reference.v1";

const TOP_KEYS = ["caseCount", "cases", "casesSha256", "exports", "oracle", "rd", "schema", "twin"];
const TWIN_KEYS = ["dir", "file", "ledgerSha256"];
const ORACLE_KEYS = ["capturedAtCommit", "kind", "source"];
const CASE_KEYS = ["args", "expected", "export", "id"];
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const CASE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EXPORT_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const I32_MIN = -2147483648;
const I32_MAX = 2147483647;
const K3_VERDICTS = [-1, 0, 1];
const MAX_BYTES = 1048576;
const MAX_CASES = 4096;
const MAX_ARGS = 16;
const MAX_EXPORTS = 16;

export class FrozenReferenceError extends Error {
  constructor(message) {
    super(`RD0361-FROZEN-REF: ${message}`);
    this.name = "FrozenReferenceError";
  }
}

const refuse = (message) => { throw new FrozenReferenceError(message); };
const isPlainObject = (value) => Object.prototype.toString.call(value) === "[object Object]"
  && Object.getPrototypeOf(value) === Object.prototype;

function exactKeys(value, keys, at) {
  if (!isPlainObject(value)) refuse(`${at} must be a plain object`);
  const own = Reflect.ownKeys(value);
  if (own.some((key) => typeof key !== "string")) refuse(`${at} has a symbol key`);
  const got = [...own].sort();
  if (got.length !== keys.length || got.some((key, index) => key !== keys[index])) {
    refuse(`${at} keys must be exactly [${keys.join(", ")}], got [${got.join(", ")}]`);
  }
}

/** Canonical bytes of the case list: fixed key order, so the digest does not depend on file layout or EOL. */
export function canonicalCasesDigest(cases) {
  const canonical = cases.map((row) => ({ id: row.id, export: row.export, args: [...row.args], expected: row.expected }));
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

/** The ledger pin for exactly one authoritative twin (dir + file). Zero or several matches refuse. */
export function ledgerPin(ledgerText, dir, file) {
  let ledger;
  try { ledger = JSON.parse(ledgerText); } catch { refuse("authority ledger is not valid JSON"); }
  if (!isPlainObject(ledger) || !Array.isArray(ledger.twins)) refuse("authority ledger has no twins array");
  const hits = ledger.twins.filter((row) => isPlainObject(row) && row.dir === dir && row.file === file);
  if (hits.length !== 1) refuse(`authority ledger must list ${dir}/${file} exactly once, found ${hits.length}`);
  if (typeof hits[0].sha256 !== "string" || !HEX64.test(hits[0].sha256)) refuse("ledger sha256 is not 64 lowercase hex");
  return hits[0].sha256;
}

function deepFreeze(value) {
  if (Array.isArray(value) || isPlainObject(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Parse and validate a frozen reference set. `expect` = { dir, file, ledgerSha256 } of the twin the caller
 * is about to check. Returns a deep-frozen copy. Any deviation throws FrozenReferenceError.
 */
export function parseFrozenReference(text, expect) {
  if (typeof text !== "string") refuse("input must be a string");
  if (text.length > MAX_BYTES) refuse("input exceeds 1 MiB");
  if (text.charCodeAt(0) === 0xfeff) refuse("input starts with a BOM");
  let doc;
  try { doc = JSON.parse(text); } catch { refuse("input is not valid JSON"); }
  exactKeys(doc, TOP_KEYS, "document");
  if (doc.schema !== FROZEN_REFERENCE_SCHEMA) refuse(`schema must be ${FROZEN_REFERENCE_SCHEMA}`);
  if (doc.rd !== "RD-0361") refuse("rd must be RD-0361");

  exactKeys(doc.twin, TWIN_KEYS, "twin");
  exactKeys(expect, TWIN_KEYS, "expect");
  if (doc.twin.dir !== expect.dir || doc.twin.file !== expect.file) refuse("frozen set is for a different twin");
  if (typeof doc.twin.ledgerSha256 !== "string" || !HEX64.test(doc.twin.ledgerSha256)) refuse("twin.ledgerSha256 is not 64 lowercase hex");
  if (doc.twin.ledgerSha256 !== expect.ledgerSha256) refuse("twin.ledgerSha256 does not match the authority ledger pin");

  exactKeys(doc.oracle, ORACLE_KEYS, "oracle");
  if (doc.oracle.kind !== "typescript-shadow-capture") refuse("oracle.kind must be typescript-shadow-capture");
  if (typeof doc.oracle.source !== "string" || !doc.oracle.source.endsWith(".ts")) refuse("oracle.source must name the captured .ts file");
  if (typeof doc.oracle.capturedAtCommit !== "string" || !HEX40.test(doc.oracle.capturedAtCommit)) refuse("oracle.capturedAtCommit must be a 40-hex commit");

  if (!Array.isArray(doc.exports) || doc.exports.length < 1 || doc.exports.length > MAX_EXPORTS) refuse("exports must list 1 to 16 names");
  const exportNames = new Set();
  for (const name of doc.exports) {
    if (typeof name !== "string" || !EXPORT_NAME.test(name)) refuse("exports contains an invalid name");
    if (exportNames.has(name)) refuse(`exports lists ${name} twice`);
    exportNames.add(name);
  }

  if (!Array.isArray(doc.cases) || doc.cases.length < 1 || doc.cases.length > MAX_CASES) refuse("cases must hold 1 to 4096 rows");
  const ids = new Set();
  const signatures = new Set();
  const covered = new Set();
  doc.cases.forEach((row, index) => {
    const at = `cases[${index}]`;
    exactKeys(row, CASE_KEYS, at);
    if (typeof row.id !== "string" || !CASE_ID.test(row.id)) refuse(`${at}.id is invalid`);
    if (ids.has(row.id)) refuse(`${at}.id ${row.id} is a duplicate`);
    ids.add(row.id);
    if (!exportNames.has(row.export)) refuse(`${at}.export is not declared in exports`);
    if (!Array.isArray(row.args) || row.args.length > MAX_ARGS) refuse(`${at}.args must be an array of at most 16`);
    for (const arg of row.args) {
      if (!Number.isSafeInteger(arg) || arg < I32_MIN || arg > I32_MAX) refuse(`${at}.args holds a non-i32 value`);
    }
    if (!K3_VERDICTS.includes(row.expected)) refuse(`${at}.expected must be a K3 verdict (-1, 0, +1)`);
    const signature = `${row.export}(${row.args.join(",")})`;
    if (signatures.has(signature)) refuse(`${at} repeats ${signature}`);
    signatures.add(signature);
    covered.add(row.export);
  });
  for (const name of exportNames) if (!covered.has(name)) refuse(`export ${name} has no case`);
  if (doc.caseCount !== doc.cases.length) refuse(`caseCount ${doc.caseCount} does not equal ${doc.cases.length} rows`);
  if (typeof doc.casesSha256 !== "string" || !HEX64.test(doc.casesSha256)) refuse("casesSha256 is not 64 lowercase hex");
  if (canonicalCasesDigest(doc.cases) !== doc.casesSha256) refuse("casesSha256 does not match the canonical case digest");
  return deepFreeze(doc);
}

export function loadFrozenReference(path, expect) {
  return parseFrozenReference(readFileSync(path, "utf8"), expect);
}

/**
 * Compare every frozen case against `invokers` (export name -> function(...args) -> verdict). Never skips:
 * a case whose export has no invoker throws. Returns { compared, mismatches } with compared === caseCount.
 */
export function compareAgainstFrozen(frozen, invokers) {
  const mismatches = [];
  let compared = 0;
  for (const row of frozen.cases) {
    if (!Object.hasOwn(invokers, row.export) || typeof invokers[row.export] !== "function") {
      refuse(`no invoker for export ${row.export}: unassessed is not clean`);
    }
    const got = invokers[row.export](...row.args);
    compared += 1;
    if (got !== row.expected) mismatches.push(Object.freeze({ id: row.id, expected: row.expected, got }));
  }
  return Object.freeze({ compared, mismatches: Object.freeze(mismatches) });
}