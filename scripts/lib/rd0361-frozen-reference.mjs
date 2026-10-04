// rd0361-frozen-reference.mjs: RD-0361 SLIDE track, slice S2. Shared strict loader, comparator and twin
// admission helper for hash-pinned FROZEN REFERENCE SETS: the oracle that replaces the live `.ts`
// differential once executable SLIDE integration lands (PLAN S1-S6). Schema v2 adds typed export
// signatures (bool, int, k3, string) so every twin shape can be frozen, not just K3 Int folds.
//
// Fail-closed by construction: a BOM, invalid JSON, unknown or missing key, wrong schema, wrong twin, wrong
// ledger pin, bad oracle, duplicate case, count mismatch, a value that does not match its declared kind,
// an uncovered export or a digest mismatch REFUSES. The comparator never skips: a missing invoker throws
// ("unassessed is not clean"). Zero-trust default, owner may revisit. NON_AUTHORIZING.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const FROZEN_REFERENCE_SCHEMA = "galerina.rd0361.frozen-reference.v2";
export const ORACLE_KINDS = Object.freeze(["typescript-shadow-capture", "differential-spec-capture"]);
export const VALUE_KINDS = Object.freeze(["bool", "int", "k3", "string"]);

const TOP_KEYS = ["caseCount", "cases", "casesSha256", "exports", "oracle", "rd", "schema", "twin"];
const TWIN_KEYS = ["dir", "file", "ledgerSha256", "module"];
const EXPECT_KEYS = ["dir", "file", "ledgerSha256"];
const ORACLE_KEYS = ["capturedAtCommit", "kind", "source"];
const EXPORT_KEYS = ["name", "params", "returns"];
const CASE_KEYS = ["args", "expected", "export", "id"];
const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const CASE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const MODULE = /^[a-z][a-z0-9-]{0,63}$/;
const SAFE_TEXT = /^[\x20-\x7e]{0,256}$/;
const I32_MIN = -2147483648;
const I32_MAX = 2147483647;
const MAX_BYTES = 4194304;
const MAX_CASES = 8192;
const MAX_PARAMS = 16;
const MAX_EXPORTS = 32;

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
  const want = [...keys].sort();
  if (got.length !== want.length || got.some((key, index) => key !== want[index])) {
    refuse(`${at} keys must be exactly [${want.join(", ")}], got [${got.join(", ")}]`);
  }
}

/** True only when `value` is a well-formed member of `kind`. */
export function isValueOfKind(kind, value) {
  if (kind === "bool") return value === true || value === false;
  if (kind === "int") return Number.isSafeInteger(value) && value >= I32_MIN && value <= I32_MAX;
  if (kind === "k3") return value === -1 || value === 0 || value === 1;
  if (kind === "string") return typeof value === "string" && SAFE_TEXT.test(value);
  return false;
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
  if (text.length > MAX_BYTES) refuse("input exceeds 4 MiB");
  if (text.charCodeAt(0) === 0xfeff) refuse("input starts with a BOM");
  let doc;
  try { doc = JSON.parse(text); } catch { refuse("input is not valid JSON"); }
  exactKeys(doc, TOP_KEYS, "document");
  if (doc.schema !== FROZEN_REFERENCE_SCHEMA) refuse(`schema must be ${FROZEN_REFERENCE_SCHEMA}`);
  if (doc.rd !== "RD-0361") refuse("rd must be RD-0361");

  exactKeys(doc.twin, TWIN_KEYS, "twin");
  exactKeys(expect, EXPECT_KEYS, "expect");
  if (doc.twin.dir !== expect.dir || doc.twin.file !== expect.file) refuse("frozen set is for a different twin");
  if (typeof doc.twin.module !== "string" || !MODULE.test(doc.twin.module)) refuse("twin.module is invalid");
  if (typeof doc.twin.ledgerSha256 !== "string" || !HEX64.test(doc.twin.ledgerSha256)) refuse("twin.ledgerSha256 is not 64 lowercase hex");
  if (doc.twin.ledgerSha256 !== expect.ledgerSha256) refuse("twin.ledgerSha256 does not match the authority ledger pin");

  exactKeys(doc.oracle, ORACLE_KEYS, "oracle");
  if (!ORACLE_KINDS.includes(doc.oracle.kind)) refuse(`oracle.kind must be one of ${ORACLE_KINDS.join(", ")}`);
  const sourceSuffix = doc.oracle.kind === "typescript-shadow-capture" ? ".ts" : ".test.mjs";
  if (typeof doc.oracle.source !== "string" || !SAFE_TEXT.test(doc.oracle.source) || !doc.oracle.source.endsWith(sourceSuffix)) {
    refuse(`oracle.source must name the captured ${sourceSuffix} file`);
  }
  if (typeof doc.oracle.capturedAtCommit !== "string" || !HEX40.test(doc.oracle.capturedAtCommit)) refuse("oracle.capturedAtCommit must be a 40-hex commit");

  if (!Array.isArray(doc.exports) || doc.exports.length < 1 || doc.exports.length > MAX_EXPORTS) refuse("exports must list 1 to 32 signatures");
  const signatures = new Map();
  doc.exports.forEach((sig, index) => {
    const at = `exports[${index}]`;
    exactKeys(sig, EXPORT_KEYS, at);
    if (typeof sig.name !== "string" || !NAME.test(sig.name)) refuse(`${at}.name is invalid`);
    if (signatures.has(sig.name)) refuse(`exports lists ${sig.name} twice`);
    if (!Array.isArray(sig.params) || sig.params.length > MAX_PARAMS || !sig.params.every((kind) => VALUE_KINDS.includes(kind))) {
      refuse(`${at}.params must be at most 16 of ${VALUE_KINDS.join("/")}`);
    }
    if (!VALUE_KINDS.includes(sig.returns)) refuse(`${at}.returns must be one of ${VALUE_KINDS.join("/")}`);
    signatures.set(sig.name, sig);
  });

  if (!Array.isArray(doc.cases) || doc.cases.length < 1 || doc.cases.length > MAX_CASES) refuse("cases must hold 1 to 8192 rows");
  const ids = new Set();
  const seen = new Set();
  const covered = new Set();
  doc.cases.forEach((row, index) => {
    const at = `cases[${index}]`;
    exactKeys(row, CASE_KEYS, at);
    if (typeof row.id !== "string" || !CASE_ID.test(row.id)) refuse(`${at}.id is invalid`);
    if (ids.has(row.id)) refuse(`${at}.id ${row.id} is a duplicate`);
    ids.add(row.id);
    if (!signatures.has(row.export)) refuse(`${at}.export is not declared in exports`);
    const sig = signatures.get(row.export);
    if (!Array.isArray(row.args) || row.args.length !== sig.params.length) refuse(`${at}.args must match the ${sig.params.length}-parameter signature`);
    row.args.forEach((arg, position) => {
      if (!isValueOfKind(sig.params[position], arg)) refuse(`${at}.args[${position}] is not a valid ${sig.params[position]}`);
    });
    if (!isValueOfKind(sig.returns, row.expected)) refuse(`${at}.expected is not a valid ${sig.returns}`);
    const key = `${row.export}${JSON.stringify(row.args)}`;
    if (seen.has(key)) refuse(`${at} repeats ${key}`);
    seen.add(key);
    covered.add(row.export);
  });
  for (const name of signatures.keys()) if (!covered.has(name)) refuse(`export ${name} has no case`);
  if (doc.caseCount !== doc.cases.length) refuse(`caseCount ${doc.caseCount} does not equal ${doc.cases.length} rows`);
  if (typeof doc.casesSha256 !== "string" || !HEX64.test(doc.casesSha256)) refuse("casesSha256 is not 64 lowercase hex");
  if (canonicalCasesDigest(doc.cases) !== doc.casesSha256) refuse("casesSha256 does not match the canonical case digest");
  return deepFreeze(doc);
}

export function loadFrozenReference(path, expect) {
  return parseFrozenReference(readFileSync(path, "utf8"), expect);
}

/**
 * Compare every frozen case against `invokers` (export name -> function(...args) -> value). Never skips:
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
    if (!Object.is(got, row.expected)) mismatches.push(Object.freeze({ id: row.id, expected: row.expected, got }));
  }
  return Object.freeze({ compared, mismatches: Object.freeze(mismatches) });
}

/** A different valid value of the same kind, for planted-fault controls. */
export function plantedValue(kind, value) {
  if (kind === "bool") return !value;
  if (kind === "k3") return value === 1 ? -1 : 1;
  if (kind === "int") return value === I32_MAX ? value - 1 : value + 1;
  if (kind === "string") return value === "planted-fault" ? "planted-fault-2" : "planted-fault";
  return refuse(`unknown kind ${kind}`);
}

/**
 * Build the twin (R0), sign + admit it through #105 with requireSigned (R1), and return typed invokers
 * that marshal Bool/String arguments and decode Bool/String results exactly like the existing rd0361
 * execution-cutover tests. `L` is the injected compiler module; this file never imports the compiler.
 * The signing key is an ephemeral in-memory dev keypair minted per run by the existing test harness; it
 * is never stored and is not the twin signing key (S8: the owner holds that key).
 */
export async function admitTwin(L, { twinPath, file, module, signatures }) {
  let src = readFileSync(twinPath, "utf8");
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const prog = L.parseProgram(src, file);
  const errors = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errors.length !== 0) refuse(`twin ${file} does not parse clean (R0): ${JSON.stringify(errors)}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, new Map(), module, prog.ast, /*exportAllPure*/ true));
  const internTable = new Map(L.getInternedStrings().map((e) => [e.handle, e.value]));
  const asm = await L.assembleWAT(wat);
  if (!(asm.valid && asm.diagnostics.length === 0)) refuse(`twin ${file} does not assemble faithfully: ${JSON.stringify(asm.diagnostics)}`);
  const wasmSha256 = L.wasmHash(asm.wasm);
  const host = L.createHostRuntime();
  for (const [handle, value] of internTable) host.seedString(handle, value);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  const marshal = (text) => {
    for (const [handle, value] of internTable) if (value === text) return handle;
    return host.internString(text);
  };
  const decode = (handle) => (internTable.has(handle) ? internTable.get(handle) : host.readString(handle));
  const toWasm = (kind, value) => (kind === "bool" ? (value ? 1 : 0) : kind === "string" ? marshal(value) : value);
  const fromWasm = (kind, raw) => {
    if (kind === "bool") {
      if (raw !== 0 && raw !== 1) refuse(`Bool result ${raw} is not 0/1`);
      return raw === 1;
    }
    if (kind === "string") return decode(raw);
    return raw;
  };
  const invokers = {};
  for (const sig of signatures) {
    if (typeof instance.exports[sig.name] !== "function") refuse(`export ${sig.name} is not admitted + exported (R1)`);
    invokers[sig.name] = (...args) => fromWasm(sig.returns, instance.exports[sig.name](...args.map((arg, i) => toWasm(sig.params[i], arg))));
  }
  return Object.freeze({ wasmSha256, invokers: Object.freeze(invokers) });
}

/**
 * Run the full frozen-reference check for one capture spec: ledger pin, admitted-WASM hash, WASM == frozen,
 * reference == frozen (three-way while the oracle exists) and a planted-fault control on the first case.
 * Returns plain facts; the calling test asserts them. `L` is the injected compiler module.
 */
export async function checkFrozenTwin(L, { root, spec, fixturePath, ledgerText }) {
  const pin = ledgerPin(ledgerText, spec.twin.dir, spec.twin.file);
  const expect = { dir: spec.twin.dir, file: spec.twin.file, ledgerSha256: pin };
  const frozen = loadFrozenReference(fixturePath, expect);
  if (frozen.twin.module !== spec.twin.module) refuse("capture spec module differs from the frozen set");
  const admitted = await admitTwin(L, {
    twinPath: [root, ...spec.twin.dir.split("/"), spec.twin.file].join("/"),
    file: spec.twin.file, module: spec.twin.module, signatures: frozen.exports,
  });
  const wasm = compareAgainstFrozen(frozen, admitted.invokers);
  const reference = compareAgainstFrozen(frozen, spec.reference);
  const doc = JSON.parse(readFileSync(fixturePath, "utf8"));
  const target = doc.cases[0];
  const sig = doc.exports.find((row) => row.name === target.export);
  target.expected = plantedValue(sig.returns, target.expected);
  doc.casesSha256 = canonicalCasesDigest(doc.cases);
  const planted = compareAgainstFrozen(parseFrozenReference(JSON.stringify(doc), expect), admitted.invokers);
  const kinds = new Set(frozen.cases.map((row) => JSON.stringify(row.expected)));
  return Object.freeze({
    pin, wasmSha256: admitted.wasmSha256, caseCount: frozen.caseCount, distinctExpected: kinds.size,
    wasm, reference, planted, plantedId: target.id,
  });
}
