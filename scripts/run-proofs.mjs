#!/usr/bin/env node
// =============================================================================
// run-proofs.mjs — keep-green gate for machine-checkable R&D proofs
// =============================================================================
// WHY: the POSTURE "prove-own-maths" rule requires every proposed AND dismissed
// R&D claim to carry a machine-checkable, re-runnable proof. Those proofs existed
// (scripts/*-proof.mjs + the KB proofs/ dir) but NOTHING ran them in the green
// cadence — so a proof could silently rot (bit-rot / API drift) and no gate would
// notice. This runner discovers every proof and runs it; a red proof fails CI.
//
// Discovers:
//   • this repo's        scripts/*-proof.mjs
//   • the KB proofs dir  $GALERINA_KB_DIR/proofs/*.mjs  (default ../ZTF-Knowledge-Bases/proofs)
//
// A proof is GREEN iff it exits 0 AND prints no "<n> fail" with n>0.
// Usage:  node scripts/run-proofs.mjs [--json] [--kb-only]
// Exit 1 if any proof fails or errors (CI-usable), else 0.
// =============================================================================
import { readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const KB_DIR = process.env.GALERINA_KB_DIR || join(ROOT, "../ZTF-Knowledge-Bases");
const JSON_OUT = process.argv.includes("--json");
const KB_ONLY = process.argv.includes("--kb-only");

const sources = [
  { label: "scripts", dir: HERE, match: (f) => /-proof\.mjs$/.test(f), skip: KB_ONLY },
  { label: "kb-proofs", dir: join(KB_DIR, "proofs"), match: (f) => /\.mjs$/.test(f), skip: false },
];

const proofs = [];
for (const s of sources) {
  if (s.skip || !existsSync(s.dir)) continue;
  for (const f of readdirSync(s.dir)) {
    if (s.match(f)) proofs.push({ group: s.label, name: f, path: join(s.dir, f) });
  }
}
proofs.sort((a, b) => (a.group + "/" + a.name).localeCompare(b.group + "/" + b.name));

const results = [];
for (const p of proofs) {
  let ok = true, tail = "", err = "";
  try {
    const out = execFileSync("node", [p.path], {
      encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "pipe"],
    });
    const lines = out.trim().split(/\r?\n/);
    tail = (lines.filter((l) => /pass|fail|RESULT|SUMMARY/i.test(l)).slice(-1)[0]
            || lines.slice(-1)[0] || "").trim().slice(0, 140);
    // GREEN == exit 0. Each proof self-determines pass/fail and exits non-zero on failure
    // (the convention; rd-0128 demonstrates it). We deliberately do NOT parse stdout for
    // "fail": proofs legitimately print "FAIL=0" tallies and narrative "= FAIL" findings
    // (e.g. a taint scanner correctly reporting a violation), which a text heuristic misreads.
  } catch (e) {
    ok = false;
    const so = e.stdout ? String(e.stdout).trim().split(/\r?\n/).slice(-1)[0] : "";
    err = (so || e.message || "non-zero exit").slice(0, 140);
  }
  results.push({ ...p, ok, tail, err });
}

const failed = results.filter((r) => !r.ok);
if (JSON_OUT) {
  console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}
console.log(`\n=== run-proofs — ${results.length} proof(s) (${KB_ONLY ? "kb-only" : "scripts + kb"}) ===`);
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.group}/${r.name}${r.ok ? "" : "  <- " + err_(r)}`);
  if (r.tail) console.log(`        ${r.tail}`);
}
function err_(r) { return r.err || ""; }
console.log(`\n=== ${results.length - failed.length}/${results.length} proofs green ===`);
process.exit(failed.length ? 1 : 0);
