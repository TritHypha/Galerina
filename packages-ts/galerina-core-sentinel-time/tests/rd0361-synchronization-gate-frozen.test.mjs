// rd0361-synchronization-gate-frozen.test.mjs: RD-0361 SLIDE slice 1. The synchronization-gate twin is
// checked against a hash-pinned FROZEN REFERENCE SET, the oracle that will replace the live `.ts` once
// executable SLIDE integration lands (plan slice S1).
//
// Additive only. rd0361-execution-cutover.test.mjs (WASM == real .ts) is unchanged and still runs; the
// `.ts` still decides at runtime. This file proves, every run:
//   F0  the built twin WASM hashes to the authority-ledger pin, and the frozen set is pinned to that same hash
//       (a changed twin or emitter cannot silently keep an old frozen set);
//   F1  the twin is signed + admitted through #105 (requireSigned) before it is called;
//   F2  WASM == frozen for every case, with coverage attestation (N cases, N compared, 0 skipped);
//   F3  real .ts == frozen for every case while the .ts exists (three-way agreement);
//   F4  the comparator fires on a planted fault, and the loader refuses malformed or tampered sets.
// NON_AUTHORIZING: no consumer switch, authority change or `.ts` retirement follows from this test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { LogicalClock, SynchronizationGate } from "../dist/index.js";
import {
  FrozenReferenceError,
  canonicalCasesDigest,
  compareAgainstFrozen,
  ledgerPin,
  loadFrozenReference,
  parseFrozenReference,
} from "./_rd0361-frozen-reference.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const COMPILER = join(ROOT, "packages-ts", "galerina-core-compiler", "dist", "index.js");
const LEDGER = join(ROOT, "docs", "security", "rd0361-authoritative-twins.json");
const TWIN_DIR = "packages-ts/galerina-core-sentinel-time/src/self-hosted";
const TWIN_FILE = "synchronization-gate.fungi";
const TWIN = join(ROOT, ...TWIN_DIR.split("/"), TWIN_FILE);
const FROZEN = join(HERE, "fixtures", "rd0361-synchronization-gate.frozen.json");

const PIN = ledgerPin(readFileSync(LEDGER, "utf8"), TWIN_DIR, TWIN_FILE);
const EXPECT = Object.freeze({ dir: TWIN_DIR, file: TWIN_FILE, ledgerSha256: PIN });

// The real .ts verdict for an abstract (synced, driftAbs, maxDriftTicks) state, built exactly as the existing
// execution-cutover differential builds it: drift == +driftAbs, throw => DENY (-1), return => ALLOW (+1).
function tsDriftVerdict(synced, driftAbs, maxDriftTicks) {
  const clock = new LogicalClock();
  const gate = new SynchronizationGate(clock, { maxDriftTicks });
  try {
    if (synced !== 1) { gate.enforceDrift(100, 1); return 1; }
    gate.syncToPhysical(0);
    clock.advance(100 + driftAbs);
    gate.enforceDrift(100, 1);
    return 1;
  } catch {
    return -1;
  }
}
const tsInvokers = Object.freeze({
  syncGateVerdict: (synced) => tsDriftVerdict(synced, 0, 0),
  driftGateVerdict: (synced, driftAbs, maxDriftTicks) => tsDriftVerdict(synced, driftAbs, maxDriftTicks),
});

let admittedPromise;
function admittedTwin() {
  admittedPromise ??= (async () => {
    assert.ok(existsSync(COMPILER),
      "galerina-core-compiler dist not built: build the compiler before this frozen-reference gate");
    const L = await import(pathToFileURL(COMPILER).href);
    let src = readFileSync(TWIN, "utf8");
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
    const prog = L.parseProgram(src, TWIN_FILE);
    assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean");
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "sync-gate", prog.ast, /*exportAllPure*/ true));
    const asm = await L.assembleWAT(wat);
    assert.ok(asm.valid && asm.diagnostics.length === 0, `twin assembles faithfully: ${JSON.stringify(asm.diagnostics)}`);
    const wasmSha256 = L.wasmHash(asm.wasm);
    const host = L.createHostRuntime();
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    return { instance, wasmSha256 };
  })();
  return admittedPromise;
}

const wasmInvokers = (instance) => Object.freeze({
  syncGateVerdict: (synced) => instance.exports.syncGateVerdict(synced),
  driftGateVerdict: (synced, driftAbs, maxDriftTicks) => instance.exports.driftGateVerdict(synced, driftAbs, maxDriftTicks),
});

test("RD-0361 S1 F0 · built twin WASM hash == ledger pin == frozen-set pin", async () => {
  const { wasmSha256 } = await admittedTwin();
  const frozen = loadFrozenReference(FROZEN, EXPECT);
  assert.equal(wasmSha256, PIN, "built synchronization-gate WASM must hash to the authority-ledger pin");
  assert.equal(frozen.twin.ledgerSha256, PIN, "frozen set must be pinned to the same twin artifact");
});

test("RD-0361 S1 F1+F2 · admitted WASM == frozen reference set, every case compared", async () => {
  const { instance } = await admittedTwin();
  assert.equal(typeof instance.exports.syncGateVerdict, "function", "syncGateVerdict admitted + exported");
  assert.equal(typeof instance.exports.driftGateVerdict, "function", "driftGateVerdict admitted + exported");
  const frozen = loadFrozenReference(FROZEN, EXPECT);
  const result = compareAgainstFrozen(frozen, wasmInvokers(instance));
  assert.deepEqual(result.mismatches, [], "WASM verdicts must equal the frozen reference set");
  assert.equal(result.compared, frozen.caseCount, "coverage: N cases, N compared, 0 skipped");
  assert.ok(frozen.cases.some((row) => row.expected === 1) && frozen.cases.some((row) => row.expected === -1),
    "the frozen set holds both ALLOW and DENY cases (not a one-verdict corpus)");
});

test("RD-0361 S1 F3 · real .ts == frozen reference set (three-way while the .ts exists)", () => {
  const frozen = loadFrozenReference(FROZEN, EXPECT);
  const result = compareAgainstFrozen(frozen, tsInvokers);
  assert.deepEqual(result.mismatches, [], "the live .ts must reproduce the frozen reference set");
  assert.equal(result.compared, frozen.caseCount, "coverage: N cases, N compared, 0 skipped");
});

test("RD-0361 S1 F4 · planted fault is detected; an un-repinned flip is refused", async () => {
  const { instance } = await admittedTwin();
  const text = readFileSync(FROZEN, "utf8");
  const doc = JSON.parse(text);
  const target = doc.cases.findIndex((row) => row.id === "drift-s1-d5-m5");
  assert.ok(target >= 0, "planted-fault anchor case exists");
  assert.equal(doc.cases[target].expected, 1, "anchor is the drift == max ALLOW boundary");

  // Planted fault with a re-computed digest: the loader accepts it, so the COMPARATOR must catch it.
  doc.cases[target].expected = -1;
  doc.casesSha256 = canonicalCasesDigest(doc.cases);
  const planted = parseFrozenReference(JSON.stringify(doc), EXPECT);
  const fired = compareAgainstFrozen(planted, wasmInvokers(instance));
  assert.deepEqual(fired.mismatches.map((row) => row.id), ["drift-s1-d5-m5"], "comparator fires on exactly the planted case");
  assert.equal(fired.compared, planted.caseCount);

  // The same flip WITHOUT re-pinning the digest must be refused by the loader.
  const unpinned = JSON.parse(text);
  unpinned.cases[target].expected = -1;
  assert.throws(() => parseFrozenReference(JSON.stringify(unpinned), EXPECT), FrozenReferenceError);
});

test("RD-0361 S1 F4 · loader refuses every malformed variant", () => {
  const text = readFileSync(FROZEN, "utf8");
  const base = () => JSON.parse(text);
  const repin = (doc) => { doc.casesSha256 = canonicalCasesDigest(doc.cases); doc.caseCount = doc.cases.length; return doc; };
  const edit = (fn) => { const doc = base(); fn(doc); return JSON.stringify(repin(doc)); };
  const variants = {
    "BOM": "\uFEFF" + text,
    "invalid JSON": text.slice(0, -3),
    "unknown top key": JSON.stringify({ ...base(), extra: 1 }),
    "missing top key": (() => { const d = base(); delete d.oracle; return JSON.stringify(d); })(),
    "wrong schema": JSON.stringify({ ...base(), schema: "galerina.rd0361.frozen-reference.v0" }),
    "wrong rd": JSON.stringify({ ...base(), rd: "RD-0362" }),
    "other twin file": JSON.stringify({ ...base(), twin: { ...base().twin, file: "power-governor.fungi" } }),
    "stale ledger pin": JSON.stringify({ ...base(), twin: { ...base().twin, ledgerSha256: "0".repeat(64) } }),
    "oracle kind": JSON.stringify({ ...base(), oracle: { ...base().oracle, kind: "hand-written" } }),
    "short commit": JSON.stringify({ ...base(), oracle: { ...base().oracle, capturedAtCommit: "030052b2c" } }),
    "count mismatch": JSON.stringify({ ...base(), caseCount: base().caseCount + 1 }),
    "empty cases": edit((d) => { d.cases = []; }),
    "duplicate id": edit((d) => { d.cases[1].id = d.cases[0].id; }),
    "duplicate signature": edit((d) => { d.cases.push({ ...d.cases[0], id: "dup-copy" }); }),
    "non-K3 verdict": edit((d) => { d.cases[0].expected = 2; }),
    "fractional arg": edit((d) => { d.cases[2].args[1] = 1.5; }),
    "out-of-i32 arg": edit((d) => { d.cases[2].args[1] = 2147483648; }),
    "string arg": edit((d) => { d.cases[2].args[1] = "5"; }),
    "unknown case key": edit((d) => { d.cases[0].note = "x"; }),
    "undeclared export": edit((d) => { d.cases[0].export = "otherVerdict"; }),
    "uncovered export": edit((d) => { d.cases = d.cases.filter((row) => row.export !== "syncGateVerdict"); }),
    "duplicate export": JSON.stringify({ ...base(), exports: ["syncGateVerdict", "syncGateVerdict"] }),
  };
  for (const [name, variant] of Object.entries(variants)) {
    assert.throws(() => parseFrozenReference(variant, EXPECT), FrozenReferenceError, `must refuse: ${name}`);
  }
  // The comparator never skips: a missing invoker throws instead of reporting a clean, partial run.
  const frozen = loadFrozenReference(FROZEN, EXPECT);
  assert.throws(() => compareAgainstFrozen(frozen, { driftGateVerdict: tsInvokers.driftGateVerdict }), FrozenReferenceError);
  // The untouched file still loads, so the refusals above are not vacuous.
  assert.equal(frozen.caseCount, frozen.cases.length);
});
