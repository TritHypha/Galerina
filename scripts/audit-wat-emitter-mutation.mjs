#!/usr/bin/env node
// =============================================================================
// audit-wat-emitter-mutation.mjs — RD-0529 C1: prove the WASM execution corpus is NON-VACUOUS by
// mutating the EMITTER and asserting an execution test goes RED.
// =============================================================================
// THE GAP (measured): main's `RD0528_COMPILER` mutation set (in audit-mutation.mjs / SEC-002) covers the
// self-hosted .fungi STAGES, and its kills are detected by SOURCE-level oracles. It does NOT touch the WAT
// EMITTER. R&D's recorded insight: a SOURCE mutation is vacuous for backend parity (both backends move
// together and still agree) — to prove the WASM path catches a real defect you must mutate the EMITTER
// itself. Without this, the 742 V8 `WebAssembly.instantiate` tests + the coming RD-0529 A1 wasmtime
// harness could pass VACUOUSLY: an emitter that lowered `+` to subtract would sail through any test that
// only checks "does it validate" or "do two backends agree".
//
// WHAT THIS DOES. Plant an emitter mutation — an OPCODE SWAP in the compiled emitter's binary-op table
// (`BINARY_OP_TO_WAT` / `FLOAT_ARITH_WAT` in wat-emitter) — then run an EXECUTION-differential gate and
// assert it goes RED (non-zero exit). The kill-detector is `audit-arithmetic-conformance.mjs`, whose every
// case is pinned to a KNOWN answer DERIVED BY HAND from the maths (never "what the system prints", never
// "Stage-A == Stage-B") — so a `+ → subtract` emitter defect produces a WRONG VALUE it must flag. A mutant
// that SURVIVES means the corpus cannot see that emitter defect (a vacuity finding), and is a VIOLATION.
//
// WHY A SEPARATE SCRIPT (not RD0528_COMPILER). audit-mutation.mjs restores tracked .fungi source via
// `git checkout`. The emitter is COMPILED TypeScript: the artifact the tests load is `dist/wat-emitter.js`,
// which is GITIGNORED — `git checkout` cannot restore it. So this harness mutates the built dist artifact
// and restores it from an in-memory BYTE SNAPSHOT (+ a `.bak` for crash recovery). Same DISCIPLINE as
// SEC-002: value-change only (an opcode string, never loop-control — the compiler-mutant HANG lesson),
// detector run at the FULL timeout, and the artifact ALWAYS restored in `finally` (a dirty dist = every
// later compile wrong, so restore is load-bearing and self-verified).
//
// Usage:
//   node scripts/audit-wat-emitter-mutation.mjs --self-test   # hermetic proof of apply/restore/classify
//   node scripts/audit-wat-emitter-mutation.mjs               # run the catalog: exit = # SURVIVED (0 = all killed)
//   node scripts/audit-wat-emitter-mutation.mjs --json
// NOT wired into the every-response phase-close (heavy: one full arith-conformance run per mutant) — it is
// an on-demand / CI mutation audit, exactly like SEC-002. Its --self-test IS run in the gate-selftests
// meta-gate (auto-discovered), which is what keeps the harness itself from silently rotting.
// =============================================================================
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EMITTER = "packages-galerina/galerina-core-compiler/dist/wat-emitter.js";
const DETECTOR_TIMEOUT_MS = 600000; // FULL timeout — a detector must never be SIGTERM'd before it verdicts.
const isWin = process.platform === "win32";

// ── the catalog. Each mutant is a VALUE change (an opcode/helper string in the emitter's binary-op map),
//    chosen so the mutated module still VALIDATES — the detector then executes it and reads a WRONG VALUE,
//    which is a strictly stronger kill than "the module no longer assembles". Anchors are the FULL map-entry
//    array literal (unique) so the exactly-once guard is meaningful. ──
const EMITTER_MUTANTS = [
  {
    id: "int-plus→minus",
    file: EMITTER,
    find: `["+", "call $fungi_checked_add_i32"]`,
    replace: `["+", "call $fungi_checked_sub_i32"]`,
    detector: ["node", "scripts/audit-arithmetic-conformance.mjs"],
    note: "`+` lowers to the checked SUBTRACT helper → every addition case computes a-b; arith-conformance (hand-pinned sums) must DIVERGE.",
  },
  {
    id: "int-times→plus",
    file: EMITTER,
    find: `["*", "call $fungi_checked_mul_i32"]`,
    replace: `["*", "call $fungi_checked_add_i32"]`,
    detector: ["node", "scripts/audit-arithmetic-conformance.mjs"],
    note: "`*` lowers to the checked ADD helper → every product computes a+b; arith-conformance (hand-pinned products) must DIVERGE.",
  },
  {
    id: "int-div→times",
    file: EMITTER,
    find: `["/", "i32.div_s"]`,
    replace: `["/", "i32.mul"]`,
    detector: ["node", "scripts/audit-arithmetic-conformance.mjs"],
    note: "`/` lowers to i32.mul → every quotient computes a*b (and /0 no longer traps); arith-conformance (hand-pinned quotients) must DIVERGE.",
  },
];

const bak = (abs) => `${abs}.mutation-bak`;

// Recover from a prior crash: if a .bak exists, a previous run died between mutate and restore — put the
// original back BEFORE doing anything (a stale mutated dist would poison this run and every compile).
function recoverStaleBak(abs) {
  if (existsSync(bak(abs))) {
    copyFileSync(bak(abs), abs);
    unlinkSync(bak(abs));
    return true;
  }
  return false;
}

// Apply: assert the anchor occurs EXACTLY once (0 or >1 = the dist moved under us → refuse, don't guess),
// snapshot original bytes + write a .bak, then write the mutated bytes. Returns the original text.
function applyMutation(abs, find, replace) {
  const original = readFileSync(abs, "utf8");
  const count = original.split(find).length - 1;
  if (count !== 1) {
    throw new Error(`anchor not unique in ${abs}: found ${count}× (expected 1) — ${JSON.stringify(find)}. dist rebuilt/moved; update the catalog anchor.`);
  }
  copyFileSync(abs, bak(abs));                 // crash-recovery breadcrumb
  writeFileSync(abs, original.replace(find, replace));
  return original;
}

// Restore: write the original bytes back, VERIFY they landed, drop the .bak. A failed restore is FATAL and
// loud (the .bak is left in place so the tree is recoverable) — a silently-dirty dist is the worst outcome.
function restore(abs, original) {
  writeFileSync(abs, original);
  const now = readFileSync(abs, "utf8");
  if (now !== original) {
    throw new Error(`FATAL: restore of ${abs} did not match the original snapshot — dist may be dirty. The .bak is kept at ${bak(abs)}; recover with it or rebuild dist.`);
  }
  if (existsSync(bak(abs))) unlinkSync(bak(abs));
}

function runDetector(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", timeout: DETECTOR_TIMEOUT_MS, shell: isWin });
  if (r.status === null) {
    // timed out / killed / could not spawn — treat as INCONCLUSIVE, not a kill (loud, never silent)
    return { exit: r.signal ? 124 : 1, inconclusive: true, note: r.error?.message || `killed by ${r.signal}` };
  }
  return { exit: r.status, inconclusive: false };
}

// Run one mutant end-to-end: recover any stale bak, apply, run detector, ALWAYS restore. KILLED iff the
// detector went non-zero (RED). A survivor (detector stayed green under the mutation) is a vacuity VIOLATION.
function runMutant(m, { detectorOverride } = {}) {
  const abs = resolve(ROOT, m.file); // resolve (not join): m.file is ROOT-relative in the catalog but ABSOLUTE in the self-test
  if (!existsSync(abs)) {
    return { ...m, status: "NO_TARGET", killed: false, violation: false, detail: `emitter artifact absent: ${m.file} — build dist first (npm run build)` };
  }
  recoverStaleBak(abs);
  let original;
  try {
    original = applyMutation(abs, m.find, m.replace);
  } catch (e) {
    return { ...m, status: "ANCHOR_ERROR", killed: false, violation: true, detail: e.message };
  }
  try {
    const [cmd, ...args] = detectorOverride || m.detector;
    const d = runDetector(cmd, args);
    if (d.inconclusive) {
      return { ...m, status: "INCONCLUSIVE", killed: false, violation: true, detail: `detector could not verdict: ${d.note}` };
    }
    const killed = d.exit !== 0;
    return {
      ...m,
      status: killed ? "KILLED" : "SURVIVED",
      killed,
      violation: !killed,
      detail: killed
        ? `detector went RED (exit ${d.exit}) — the corpus SEES this emitter defect`
        : `detector stayed GREEN (exit 0) under the mutation — the corpus is BLIND to this emitter defect (vacuity)`,
    };
  } finally {
    restore(abs, original); // load-bearing: dist must be pristine even if the detector threw
  }
}

// ── self-test — hermetic: a temp file + fake detectors, never the real dist or arith-conformance ─────────
function selfTest() {
  return import("node:os").then(({ tmpdir }) => {
    const checks = [];
    const scratch = join(tmpdir(), `wat-emitter-mutation-selftest-${process.pid}.js`);
    const CLEAN = `const M = new Map([["+", "OP_ADD"], ["*", "OP_MUL"]]);\n`;
    const MUT = { id: "fake", file: scratch, find: `["+", "OP_ADD"]`, replace: `["+", "OP_SUB"]` };

    // Fake detectors as tiny temp .mjs files invoked with a PATH arg — no `node -e` inline script (whose
    // embedded quotes get mangled by shell:true on Windows, which is exactly what a first self-test caught).
    const catchPath = join(tmpdir(), `wat-emitter-mutation-catch-${process.pid}.mjs`);
    const blindPath = join(tmpdir(), `wat-emitter-mutation-blind-${process.pid}.mjs`);
    // RED iff the file now contains the mutated token — simulates "the corpus catches the emitter defect".
    writeFileSync(catchPath, `import { readFileSync } from "node:fs";\nprocess.exit(readFileSync(process.argv[2], "utf8").includes("OP_SUB") ? 1 : 0);\n`);
    // ALWAYS green — simulates a corpus blind to the mutation.
    writeFileSync(blindPath, `process.exit(0);\n`);
    const catchingDetector = ["node", catchPath, scratch];
    const blindDetector = ["node", blindPath, scratch];

    // 1. a catching detector → KILLED, and the file is RESTORED to the clean bytes afterwards.
    writeFileSync(scratch, CLEAN);
    const killed = runMutant({ ...MUT, file: scratch }, { detectorOverride: catchingDetector });
    const restoredAfterKill = readFileSync(scratch, "utf8") === CLEAN;
    checks.push(["★ a catching detector ⟹ KILLED", killed.status === "KILLED" && killed.killed === true]);
    checks.push(["★ dist RESTORED to original bytes after a kill (finally ran)", restoredAfterKill]);
    checks.push(["★ no .bak left behind after a clean run", !existsSync(bak(scratch))]);

    // 2. a blind detector → SURVIVED (violation), file still restored.
    writeFileSync(scratch, CLEAN);
    const survived = runMutant({ ...MUT, file: scratch }, { detectorOverride: blindDetector });
    checks.push(["★ a blind (always-green) detector ⟹ SURVIVED + violation (vacuity is caught)", survived.status === "SURVIVED" && survived.violation === true]);
    checks.push(["dist restored after a survivor too", readFileSync(scratch, "utf8") === CLEAN]);

    // 3. precision guard: a non-unique anchor errors rather than mutating blindly.
    writeFileSync(scratch, `["+","OP_ADD"] and again ["+","OP_ADD"]\n`);
    const dup = runMutant({ id: "dup", file: scratch, find: `["+","OP_ADD"]`, replace: `["+","OP_SUB"]` }, { detectorOverride: blindDetector });
    checks.push(["★ non-unique anchor ⟹ ANCHOR_ERROR (never mutate on an ambiguous match)", dup.status === "ANCHOR_ERROR"]);

    // 4. crash recovery: a stale .bak is restored on the next run before anything else.
    writeFileSync(scratch, "MUTATED-LEFTOVER\n");                 // simulate dist left dirty by a crash
    writeFileSync(bak(scratch), CLEAN);                           // ...with the original preserved in .bak
    const recovered = recoverStaleBak(scratch);
    checks.push(["★ a stale .bak is recovered (crash-safety): dist put back + bak removed",
      recovered && readFileSync(scratch, "utf8") === CLEAN && !existsSync(bak(scratch))]);

    for (const p of [scratch, bak(scratch), catchPath, blindPath]) {
      try { if (existsSync(p)) unlinkSync(p); } catch { /* best effort */ }
    }

    let ok = true;
    for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
    if (!ok) { console.error("\n  ❌ wat-emitter-mutation self-test FAILED — the harness cannot be trusted to kill/restore"); process.exit(1); }
    console.log("\n  wat-emitter-mutation self-test: catching⟹KILLED, blind⟹SURVIVED, anchor-guard + crash-recovery + restore all proven ✅");
    process.exit(0);
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
const asJson = process.argv.includes("--json");
if (process.argv.includes("--self-test")) { await selfTest(); }

const results = [];
for (const m of EMITTER_MUTANTS) {
  if (!asJson) console.error(`  · mutating ${m.id} … (running ${m.detector.slice(1).join(" ")})`);
  results.push(runMutant(m));
}
const survived = results.filter((r) => r.violation);

if (asJson) {
  console.log(JSON.stringify({
    tool: "wat-emitter-mutation",
    total: results.length,
    killed: results.filter((r) => r.status === "KILLED").length,
    survived: survived.length,
    results: results.map(({ find, replace, detector, ...r }) => r),
  }, null, 2));
  process.exit(survived.length);
}

console.log(`\n  wat-emitter-mutation — mutate the WAT emitter, prove an execution test goes RED (RD-0529 C1)\n`);
for (const r of results) {
  const icon = r.status === "KILLED" ? "✅" : "❌";
  console.log(`  ${icon} ${r.id.padEnd(18)} [${r.status}] — ${r.detail}`);
  console.log(`       ${r.note ?? ""}`);
}
console.log(`\n  ${survived.length === 0 ? "✅" : "❌"} ${results.filter((r) => r.killed).length}/${results.length} emitter mutants KILLED by the execution corpus` +
  (survived.length ? ` — ${survived.length} SURVIVED (the corpus is blind to a real emitter defect):` : " — the WASM execution differential is NON-VACUOUS."));
for (const r of survived) console.log(`     ✗ ${r.id}: ${r.detail}`);
console.log(`SUMMARY: ${results.filter((r) => r.killed).length}/${results.length} WAT-emitter mutants killed by arith-conformance · ${survived.length} survived`);
console.log(`VIOLATIONS: ${survived.length}`);
process.exit(survived.length);
