#!/usr/bin/env node
// rd0361-freeze-reference.mjs: RD-0361 SLIDE track, slice S2. Capture (or re-check) a hash-pinned frozen
// reference set for one authoritative twin from its capture spec.
//
//   node scripts/rd0361-freeze-reference.mjs --check <capture-spec.mjs>   # exit 0 iff the fixture is current
//   node scripts/rd0361-freeze-reference.mjs --write <capture-spec.mjs>   # (re)write the fixture
//
// A capture spec (packages-ts/<pkg>/tests/fixtures/rd0361-<stem>.capture.mjs) exports: twin {dir, file,
// module}, oracle {kind, source}, signatures [{name, params, returns}], cases() -> [{id, export, args}] and
// reference {exportName: (...args) => value}. The tool builds and #105-admits the twin, evaluates every
// case on BOTH the reference oracle and the admitted WASM, and REFUSES (exit 1, nothing written) if any case
// disagrees: a disagreement is never frozen. Fixture: <same dir>/rd0361-<stem>.frozen.json.
// Recapture authority is owner decision D-A (PLAN S7); this tool only mechanises it. NON_AUTHORIZING.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  FROZEN_REFERENCE_SCHEMA,
  admitTwin,
  canonicalCasesDigest,
  ledgerPin,
  parseFrozenReference,
} from "./lib/rd0361-frozen-reference.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPILER = join(ROOT, "packages-ts", "galerina-core-compiler", "dist", "index.js");
const LEDGER = join(ROOT, "docs", "security", "rd0361-authoritative-twins.json");
const USAGE = "usage: node scripts/rd0361-freeze-reference.mjs --check|--write <capture-spec.mjs>";

const argv = process.argv.slice(2);
if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) { console.log(USAGE); process.exit(0); }
if (argv.length !== 2 || !["--check", "--write"].includes(argv[0])) { console.error(USAGE); process.exit(2); }
const mode = argv[0];
const specPath = resolve(argv[1]);
if (!specPath.endsWith(".capture.mjs") || !existsSync(specPath)) { console.error(`REFUSED: capture spec not found: ${argv[1]}`); process.exit(2); }
if (!existsSync(COMPILER)) { console.error("REFUSED: galerina-core-compiler dist not built"); process.exit(2); }

const spec = await import(pathToFileURL(specPath).href);
const fixturePath = join(dirname(specPath), basename(specPath).replace(/\.capture\.mjs$/, ".frozen.json"));
const pin = ledgerPin(readFileSync(LEDGER, "utf8"), spec.twin.dir, spec.twin.file);
const expect = { dir: spec.twin.dir, file: spec.twin.file, ledgerSha256: pin };
const L = await import(pathToFileURL(COMPILER).href);
const admitted = await admitTwin(L, {
  twinPath: join(ROOT, ...spec.twin.dir.split("/"), spec.twin.file),
  file: spec.twin.file, module: spec.twin.module, signatures: spec.signatures,
});
if (admitted.wasmSha256 !== pin) {
  console.error(`REFUSED: built ${spec.twin.file} WASM ${admitted.wasmSha256} does not match ledger pin ${pin}`);
  process.exit(1);
}

const cases = [];
const disagreements = [];
for (const row of spec.cases()) {
  if (!Object.hasOwn(spec.reference, row.export)) { console.error(`REFUSED: no reference for ${row.export}`); process.exit(1); }
  const expected = spec.reference[row.export](...row.args);
  const wasm = admitted.invokers[row.export](...row.args);
  if (!Object.is(expected, wasm)) disagreements.push(`${row.id}: reference=${JSON.stringify(expected)} wasm=${JSON.stringify(wasm)}`);
  cases.push({ id: row.id, export: row.export, args: [...row.args], expected });
}
if (disagreements.length !== 0) {
  console.error(`REFUSED: ${disagreements.length} case(s) disagree; nothing frozen:\n  ${disagreements.join("\n  ")}`);
  process.exit(1);
}

const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
const head = git.status === 0 ? git.stdout.trim() : "";
const doc = {
  schema: FROZEN_REFERENCE_SCHEMA,
  rd: "RD-0361",
  twin: { dir: spec.twin.dir, file: spec.twin.file, module: spec.twin.module, ledgerSha256: pin },
  oracle: { kind: spec.oracle.kind, source: spec.oracle.source, capturedAtCommit: head },
  exports: spec.signatures.map((sig) => ({ name: sig.name, params: [...sig.params], returns: sig.returns })),
  caseCount: cases.length,
  casesSha256: canonicalCasesDigest(cases),
  cases,
};
parseFrozenReference(JSON.stringify(doc), expect); // the tool must never write a set its own loader refuses

if (mode === "--check") {
  if (!existsSync(fixturePath)) { console.error(`STALE: ${fixturePath} is missing`); process.exit(1); }
  const current = parseFrozenReference(readFileSync(fixturePath, "utf8"), expect);
  const same = current.casesSha256 === doc.casesSha256
    && JSON.stringify(current.exports) === JSON.stringify(doc.exports)
    && current.twin.module === doc.twin.module
    && current.oracle.kind === doc.oracle.kind && current.oracle.source === doc.oracle.source;
  if (!same) { console.error(`STALE: ${fixturePath} differs from a fresh capture`); process.exit(1); }
  console.log(`rd0361-freeze-reference: ${spec.twin.file} current (${cases.length} cases, WASM == reference, pin ${pin.slice(0, 12)})`);
  process.exit(0);
}
writeFileSync(fixturePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
console.log(`rd0361-freeze-reference: wrote ${fixturePath} (${cases.length} cases, casesSha256 ${doc.casesSha256})`);
