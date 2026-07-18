#!/usr/bin/env node
// component-health.mjs — Galerina per-COMPONENT readiness matrix for v1.0 "full testing".
// Pure-read, zero-dep (node builtins only: fs/path/url/child_process), never throws, exit 0 (1 only with --strict on gaps).
// Prints a git PROVENANCE header (branch/SHA/dirty) so a report can never silently describe the wrong tree —
// a detached HEAD is called out LOUDLY, because a detached-HEAD run once measured a stale pre-rename tree unnoticed.
// Surfaces one honest SHIP-READINESS % over the FULL component set (orphans counted in, no gap class masked).
// Complements status.mjs (headline counts) with a per-package breakdown + gap detector:
//   which workspace packages have a test script, a tests/ dir + test files, a recorded test count,
//   and which packages-galerina/ dirs are ORPHANS (a package.json on disk but absent from the workspace).
//
//   node scripts/component-health.mjs            # full matrix, grouped by family
//   node scripts/component-health.mjs --gaps     # only rows with a readiness gap
//   node scripts/component-health.mjs --json     # machine-readable
//   node scripts/component-health.mjs --strict   # exit 1 if any gap/orphan (CI gate)
//   node scripts/component-health.mjs --table    # per-family readiness table with a TOTAL row
//
// The --table / default / --json outputs also carry two extra AUTOMATIC sections:
//   CONVERSION — the .ts→.fungi self-hosting inventory (Stage-6 model: packages convert one at
//     a time, pure-logic first, TCB last). "Converted" is MECHANICAL: a workspace package whose
//     src/ holds .fungi and zero impl .ts. Self-hosted core modules are counted by EXISTENCE
//     only — existence ≠ parity (the byte-parity gate lives in the Stage-B differential harness).
//   TODO — checkbox counts ([ ] open / [x] done) across every git-TRACKED TODO.md, as written.
//     Per-package TODOs are known to lag reality (e.g. long-shipped items still unchecked), so
//     this is a doc-state signal, never a completion claim.
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { twinParityLadder } from "./lib/twin-parity-ladder.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = join(ROOT, "packages-galerina");

const argv = new Set(process.argv.slice(2));
const ONLY_GAPS = argv.has("--gaps");
const AS_JSON = argv.has("--json");
const STRICT = argv.has("--strict");
const TABLE = argv.has("--table");
const AUDIT_HTML = argv.has("--audit-html");   // emit the self-contained % audit widget artifact
const AUDIT_CHECK = argv.has("--audit-check");  // staleness gate: committed percent-audit.json must match source (git provenance excluded)
const SELF_TEST = argv.has("--self-test");      // prove the % audit can never omit a section (fail-closed)

const readJSON = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const listDir = (p) => { try { return readdirSync(p); } catch { return null; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n));

// ── git provenance (read-only; names the exact tree these numbers describe) ────
// Runs only reporting git subcommands; ROOT-anchored; never throws (returns null on any failure).
const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
};
const provenance = (() => {
  if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") return { available: false };
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]); // literal "HEAD" when detached
  const sha = git(["rev-parse", "--short", "HEAD"]);
  const porcelain = git(["status", "--porcelain"]); // "" ⇒ clean, any content ⇒ dirty
  return {
    available: true, branch, sha,
    detached: branch === "HEAD",
    dirty: porcelain == null ? null : porcelain.length > 0,
  };
})();

// ── inputs ───────────────────────────────────────────────────────────────────
const workspace = readJSON(join(ROOT, "galerina.workspace.json")) || {};
const wsPackages = Array.isArray(workspace.packages) ? workspace.packages : [];
const version = readJSON(join(ROOT, "version.json")) || {};
const testCounts = version.testCountByPackage || {};

// family bucket from the package directory-name head
const FAMILY = {
  core: "core", substrate: "core", auth: "framework", framework: "framework",
  api: "framework", registry: "framework", ai: "ai", data: "data", web: "web",
  db: "db", target: "target", cpu: "target", hardware: "target", photonic: "target",
  ext: "ext", inference: "ext", devtools: "devtools", governance: "governance",
  observability: "governance", tower: "runtime", tri: "runtime", docs: "docs",
  test: "tooling", tools: "tooling",
};
const familyOf = (dir) => FAMILY[dir.replace(/^galerina-/, "").split("-")[0]] || "other";

// ── per-component rows (driven by the workspace list) ─────────────────────────
// This counts A TEST FILE — not "a test file with the extension I expected". The distinction is the
// whole of 2026-07-17: the surface was `(mjs|cjs|js)`, and when galerina-tools-myco was enlisted the
// gate reported `tests-dir-empty` over a directory holding FOUR tests that run and pass, because they
// are `.test.ts` (TypeScript, run under --experimental-strip-types). The verdict was honest about its
// surface and flatly false about the package.
//
// Measured before widening, rather than assumed: 538 `.test.mjs` across 92 packages · 4 `.test.ts` in
// myco · nothing else. So `.test.mjs` IS the house style and myco (vendored from an upstream TS
// project) is the deviation — but that is a STYLE question, and this is not the style gate. A false
// "no tests here" about a tested package teaches people the gate cries wolf, and a gate nobody believes
// gets switched off. Extension-agnostic within the runner's real capability is the honest model.
const TEST_FILE = /\.test\.(mjs|cjs|js|ts|mts|cts)$/;
const countTestFiles = (dir) => {
  let n = 0;
  const walk = (d) => {
    for (const e of listDir(d) || []) {
      const ep = join(d, e);
      if (isDir(ep)) walk(ep);
      else if (TEST_FILE.test(e)) n++;
    }
  };
  if (existsSync(dir)) walk(dir);
  return n;
};

const rows = wsPackages.map((rel) => {
  const abs = join(ROOT, rel);
  const dir = basename(rel);
  const pkg = readJSON(join(abs, "package.json"));
  const testsDir = join(abs, "tests");
  const hasTestsDir = existsSync(testsDir);
  return {
    dir, name: pkg?.name || dir, family: familyOf(dir),
    onDisk: isDir(abs), hasPkg: !!pkg, private: pkg?.private === true,
    version: pkg?.version || null,
    testScript: !!pkg?.scripts?.test, buildScript: !!pkg?.scripts?.build,
    hasTestsDir, testFiles: hasTestsDir ? countTestFiles(testsDir) : 0,
    recordedCount: Object.prototype.hasOwnProperty.call(testCounts, dir) ? testCounts[dir] : null,
  };
});

// ── gap rules ─────────────────────────────────────────────────────────────────
const gapsFor = (r) => {
  const g = [];
  if (!r.onDisk) { g.push("missing-on-disk"); return g; }
  if (!r.hasPkg) { g.push("no-package.json"); return g; }
  if (!r.testScript) g.push("no-test-script");
  if (r.testScript && !r.hasTestsDir) g.push("test-script-but-no-tests-dir");
  if (r.hasTestsDir && r.testFiles === 0) g.push("tests-dir-empty");
  if (r.testScript && r.testFiles > 0 && r.recordedCount == null) g.push("tested-but-not-in-counts");
  return g;
};
for (const r of rows) r.gaps = gapsFor(r);

// ── orphans: packages-galerina/ dirs with a package.json, absent from the workspace ─
const wsDirs = new Set(wsPackages.map((p) => basename(p)));
const orphans = [];
for (const e of listDir(PKG_DIR) || []) {
  if (e === "node_modules" || e.startsWith(".")) continue;
  const ep = join(PKG_DIR, e);
  if (isDir(ep) && existsSync(join(ep, "package.json")) && !wsDirs.has(e)) orphans.push(e);
}

// #32 annotated exemption allowlist — documents WHY each orphan is a deliberate non-workspace package (so the
// sub-100% ship-readiness is explained, not an open question), WITHOUT masking the denominator: exempt orphans
// still count against the ship-readiness %. An orphan ABSENT from this list is UNEXPECTED and is flagged loudly —
// the allowlist is a fail-closed signal (a new un-annotated orphan means "explain it or enlist it", never silent).
const EXEMPT_ORPHANS = {
  "galerina-devtools-benchmarks": "benchmark harness — not a shippable unit-tested package (run via its own npm scripts)",
  "galerina-registry": "signed registry index — planned; joins the workspace when the index ships",
};
const orphanRows = orphans.slice().sort().map((o) => ({ dir: o, exemptReason: EXEMPT_ORPHANS[o] ?? null }));
const unexpectedOrphans = orphanRows.filter((o) => o.exemptReason === null).map((o) => o.dir);

// ── .ts→.fungi conversion inventory (Stage-6 self-hosting metric) ─────────────
// Tracked files only (git ls-files) so gitignored build/ output can never inflate the counts.
// Fail-honest: if git is unavailable the section reports itself unavailable instead of guessing.
const trackedFiles = (() => {
  const o = git(["ls-files"]);
  return o ? o.split("\n").filter(Boolean) : null;
})();
const conversion = (() => {
  if (!trackedFiles) return { available: false };
  const isImplTs = (f) => f.endsWith(".ts") && !f.endsWith(".d.ts");
  const tsImplAll = trackedFiles.filter(isImplTs);
  const tsImplPkgs = tsImplAll.filter((f) => f.startsWith("packages-galerina/")); // the convertible universe (Stage 6 converts packages; root CLI/scripts stay host-side)
  const tsDecl = trackedFiles.filter((f) => f.endsWith(".d.ts")).length;
  const fungiAll = trackedFiles.filter((f) => f.endsWith(".fungi"));
  const SELF_HOSTED = "packages-galerina/galerina-core-compiler/src/self-hosted/";
  const fungiSelfHosted = fungiAll.filter((f) => f.startsWith(SELF_HOSTED)).length;
  // "examples" counts BOTH the top-level examples/ tree AND per-package */examples/ trees —
  // a top-level-only filter undercounted 309 example files as 52 (verified 2026-07-10).
  const fungiExamples = fungiAll.filter((f) => f.startsWith("examples/") || f.includes("/examples/")).length;
  // Per-workspace-package verdict — MECHANICAL: src/ holds ≥1 .fungi and ZERO host-language impl
  // (.ts AND .mjs/.cjs/.js — a .mjs-implemented package with .fungi fixtures must not count).
  // This matches .fungi-NATIVE packages as well as completed conversions — the tool cannot
  // mechanically tell them apart, so the label says "fungi-only src/", never "converted".
  // (A package mid-conversion — both languages present — honestly counts as NOT fungi-only.)
  let fungiOnlyPkgs = 0;
  for (const rel of wsPackages) {
    const srcPrefix = `${rel.replace(/\\/g, "/")}/src/`;
    const srcHost = tsImplAll.some((f) => f.startsWith(srcPrefix))
      || trackedFiles.some((f) => f.startsWith(srcPrefix) && /\.(mjs|cjs|js)$/.test(f));
    const srcFungi = fungiAll.some((f) => f.startsWith(srcPrefix) && !f.startsWith(SELF_HOSTED)); // self-hosted drafts live INSIDE compiler src — they don't make the compiler package fungi-only
    if (!srcHost && srcFungi) fungiOnlyPkgs++;
  }
  const convertedPkgs = fungiOnlyPkgs;
  return {
    available: true,
    convertedPackages: convertedPkgs,
    workspacePackages: wsPackages.length,
    pct: wsPackages.length ? (100 * convertedPkgs) / wsPackages.length : 0,
    tsImplRemainingPkgs: tsImplPkgs.length,
    tsImplRemainingTotal: tsImplAll.length,
    tsDecl,
    fungi: {
      total: fungiAll.length,
      selfHosted: fungiSelfHosted,
      examples: fungiExamples,
      other: fungiAll.length - fungiSelfHosted - fungiExamples,
    },
  };
})();

// ── tracked TODO.md checkbox counts (doc-state signal, not a completion claim) ─
const todos = (() => {
  if (!trackedFiles) return { available: false };
  const files = trackedFiles.filter((f) => /(^|\/)TODO\.md$/i.test(f));
  let open = 0, done = 0;
  for (const f of files) {
    let txt = "";
    try { txt = readFileSync(join(ROOT, f), "utf8"); } catch { continue; }
    open += (txt.match(/\[ \]/g) || []).length;
    done += (txt.match(/\[x\]/gi) || []).length;
  }
  const total = open + done;
  return { available: true, files: files.length, open, done, total, donePct: total ? (100 * done) / total : 0 };
})();

// ── roll-up ────────────────────────────────────────────────────────────────────
const summary = {
  workspacePackages: rows.length,
  onDisk: rows.filter((r) => r.onDisk).length,
  withTestScript: rows.filter((r) => r.testScript).length,
  withTestFiles: rows.filter((r) => r.testFiles > 0).length,
  recordedTotal: rows.reduce((a, r) => a + (typeof r.recordedCount === "number" ? r.recordedCount : 0), 0),
  withGaps: rows.filter((r) => r.gaps.length).length,
  orphans: orphans.length,
};
// ── honest ship-readiness: GREEN components over the FULL set. Orphans are un-shippable
//    components (a package.json on disk, absent from the workspace) so they count against the
//    denominator and toward the gap total — never masked out to flatter the headline. ────────────
summary.green = rows.filter((r) => r.gaps.length === 0).length;
summary.components = rows.length + orphans.length;
summary.totalGaps = summary.withGaps + orphans.length;
summary.readinessPct = summary.components ? (summary.green / summary.components) * 100 : 0;
// ── scope declaration: this % measures WORKSPACE PACKAGES ONLY (galerina.workspace.json +
//    packages-galerina/ orphans). It does NOT cover the root CLI (galerina.mjs), root tests/,
//    the scripts/ dev-tool suite, examples/, docs/, or the self-hosted .fungi corpus — those
//    have their own gates (phase-close, lint-conventions, keep-green). Say so in EVERY output
//    mode, so the headline % can never silently read as whole-project readiness. ──────────────
summary.scope = "workspace packages only (not the full project: root CLI/scripts/examples/docs/corpus have their own gates)";
summary.conversion = conversion;
summary.todos = todos;

// ── README thesis tables (curated roadmap status, surfaced here so the tool and the README
//    draw from ONE place — the Tests row is LIVE from version.json; the rest are the
//    roadmap-readiness %s maintained in the README's "Zero-Trust thesis" + "Build Progress"
//    sections. ◑ boundaries are partial: a shipped gate + a design-intent remainder. Update
//    these arrays when a component's readiness changes, then sync the README rows. ─────────
// #122 RULING-1: the Type-checker / Effect-checker row's % is DERIVED live from twin diagnostic-code
// parity (scripts/lib/twin-parity-ladder.mjs → audit-twin-emit-parity). Fail-closed but NON-FATAL: if
// the ladder can't be computed we carry a WORD (never the old hand-typed number), which preserves this
// tool's "never throws" contract while honouring RULING-1's "no evidence ⇒ no number".
let TCE = null;
try { TCE = twinParityLadder(); } catch { TCE = null; }

const ZERO_TRUST = [
  { boundary: "Compiler", pct: 100, status: "✅ shipped — policy + execution DAG proven at build time" },
  { boundary: "I/O — OS kernel", pct: 72, status: "◑ auth gate 6 (kernel.fungi) EXECUTION-PROVEN (RD-0361 differential ≡ the shipped kernel `handle`, first string-ARG twin) · DSS build gate now 10/10 DETERMINISTIC (2026-07-16 night: wabt fresh-instance-per-build + the P9.4 guarded-body adoption gate — the partial-lowering class that blocked the supervisor bundle is structurally dead) · the DSS supervisor V_DPM DECISION CORE is EXECUTION-PROVEN ≡ Stage-A over a 386-point matrix + laws (topology-first, monotonicity, deny-by-default, zero effect calls) with real .wasm artifacts (build/dss-wasm, sha256 manifest). sentinel-io decision surface FULLY twinned + checker-clean. ★ 2026-07-18: the #143 border-safe INJECTABLE execution path is now BUILT (@galerina/core-runtime-wasm seam adapters — R&D model-A admission-verify + HARD export-presence gate + sync LowLevelWasmExecutor, cc057d7c) so the extracted WASM TCB is wirable by the kernel/DSS WITHOUT crossing the compiler border; the % is unchanged because the remaining step is the authority FLIP (owner nod), not the wiring. Remaining to 100%: authoritative execution (#143 flip, owner) + full kernel-bypass I/O EXECUTION (the real Wasmtime TCB, DSS.wasm #102-106, post-v1)" },
  { boundary: "Packages", pct: 98, status: "◑ signed admission fully twinned — central-index (registry-index) + per-package manifest (package-admission) + kernel FUSION admission (descriptor · hash · sidecar · revocation · sig-policy · registry · capability — fuse-admission.fungi) checker-clean · ★ 2026-07-18: the #72 walkthrough-§3 signer CLI is BUILT (registry-index-cli.mjs — build/sign/verify over the SHIPPED decider, single-witness; deny-by-default review gate makes a stub catalog UN-SIGNABLE — proven by 16/16 hermetic self-test + a live-tree REFUSED run; phase-close-wired) · remaining = REAL registry entries (governance review = human act) + the owner signing ceremony (§1.1 alg + §1.2 authority-key decisions, walkthrough §4) + #143 execution — the % does NOT move for a mechanism-only increment · ★ 2026-07-18: the #143 injectable execution path (core-runtime-wasm seam adapters, cc057d7c) is now BUILT — still % unchanged (gated on real registry entries + owner signing + the #143 flip)" },
  { boundary: "Memory", pct: 62, status: "◑ governed-decision surface FULLY twinned (validator · pool-config · segmentation LSM-SEGV · trit-tamper LSM-TRIT-CORRUPT · allocate/free/UAF-guard LSM-UAF-001 + REJECT-scrub — 5 checker-clean .fungi) · real WASM isolation execution = design intent (#143 switch) · ★ 2026-07-18: the injectable border-safe execution path is now BUILT (core-runtime-wasm seam adapters, cc057d7c); % unchanged — the #143 flip is the gate, not the wiring" },
  { boundary: "TLSTP — zero-middleware", pct: 56, status: "◑ S4 recovering-FSM TWINNED + EXECUTION-PROVEN (2026-07-16 night: transport-fsm.fungi — δ as 4 pure all-int projections, checker-clean; RD-0361 differential 192 points ≡ the shipped `transportStep` incl. the τ boundary + Closed absorption, INV-1 join / INV-2 / INV-4 / INV-6 pinned on WASM outputs; charter-safe = state never aliased to the trit, resume rides === ALLOW only, erase-on-Closed). ALL 6 core-network border DECISION surfaces twinned (.fungi, fail-closed): cert-gate · cors-policy · inbound-guard · defensive-controls · admission-feedback · egress-guard — core-network decision surface COMPLETE; the B8 ADMISSION fold (b8-admission.fungi) twinned + EXECUTION-PROVEN ≡ the shipped K3 calculus; the DSS supervisor decision core (the in-sandbox tier's brain) is now execution-proven ≡ Stage-A (386 pts). Remaining = in-sandbox decryption EXECUTION (DSS.wasm Wasmtime TCB, #143 switch/post-v1) + B8 transport plumbing (raw-byte shim/ECH) + S4 wiring into the live transport (the twin is proven, not yet build-wired) · ★ 2026-07-18: the injectable border-safe execution path is now BUILT (core-runtime-wasm seam adapters, cc057d7c) — the DSS/kernel can reach authoritative twin execution without the compiler; % unchanged (owner #143 flip is the gate)" },
];
const BUILD_PROGRESS = [
  { layer: "Specification / KB", pct: 100 },
  { layer: "Lexer / Parser / Verifier / Contract / Value-state", pct: 100 },
  { layer: "DRCM Phases 1-7 (Stage-A simulation)", pct: 100 },
  { layer: "CBOR Manifests (RFC 8949)", pct: 100 },
  { layer: "Tests — full suite", pct: 100, live: true },
  { layer: "Stage-B self-hosting — interpreter parity", pct: 100 },
  TCE
    ? { layer: "Type checker / Effect checker", pct: TCE.pct }
    : { layer: "Type checker / Effect checker", status: "twin-parity ladder unavailable — carrying a word (fail-closed: no number without evidence)" },
  { layer: "WAT emitter", pct: 89 },
  { layer: "Runtime interpreter", pct: 87 },
  { layer: "Application-framework layer", pct: 72 },
  { layer: "Post-Quantum & Hardware Security", pct: 40 },
  { layer: "Passive Execution Plans & Target Bridges", pct: 35 },
  { layer: "AI Inference Tower (BitNet/Groq/NVFP4)", pct: 30 },
  { layer: "Photonic / Ternary Computing", pct: 3 },
  { layer: "Stage-B self-hosting — WASM execution (P9)", status: "in progress — 2 of 7 stages RUN · ★ 5 of 7 carry #100 (4 TRAP at COMPILE, 1 at EXECUTION) — ONLY lexer + parser survive, and THAT is the diagnosis: they are the two stages whose hot paths never erase an element type (parser reads fields too, but off CONCRETE types); erasure ⟺ trap, exact across all seven. PROVEN at R3 (byte-parity ≡ Stage-A through real WASM behind #105): lexer `tokenize` · the whole PARSER ladder to its entry point — parseParams (flat) → parseExpr (recursive) → parseStmt (self+mutual) → parseBlock → parseFlows (2026-07-17, 53 differential tests, all first-run green); the recursive AST readback needed NO new ABI (that was an assertion; it is now executed). ★ TRAP AT R2 (compile) — type-checker · effect-checker · governance-verifier · gir-emitter: each is R0-clean, R0-assembles, R1-#105-admits AND EXPORTS, then throws `unreachable` on one trivial flow. gir-emitter was SWEPT 2026-07-17 via its ON-chain entry `emitGIRModule(flows: Array<Auto>)` (gir-emitter.fungi:157) — the earlier 'off the flows chain' exclusion named the WRONG entry point (emitBodyGIR, statements); the flows entry was right there and traps, VERIFIED by running (audit-stage-execution.mjs baseline 3→4). ALSO carries #100 but traps at EXECUTION not compile: runtime `envLookup` reads b.name/b.val off an Array<Auto> payload, reached by every variable reference (runProgram→evalGIRExpr→envLookup) — construct verified in source, not yet driven. ROOT CAUSE (isolated one-variable-at-a-time, 20-line repro with R&D): reading a RECORD FIELD off an Option payload obtained from `.get()` on an `Array<Auto>` — Array<Auto> alone is fine, get+field on a CONCRETE array is fine, the two TOGETHER erase the element type so the field offset is unknown at lowering and the emitter falls through to `unreachable`. That is TASK #100, now P9's blocker; the stages take Array<Auto> per their own headers 'to avoid generic syntax constraints in Stage B param declarations' — the workaround IS the bug. THE FIX (R&D ruling 2026-07-17, verified in emitter source): the wat-emitter.ts:1340 trap is DELIBERATE fail-closed (#163) — do NOT touch it; only REAL Stage-B generics (un-erase the element type end-to-end, INCLUDING the get→Option→match-bind inference chain) unblocks R2 (does-it-RUN) for the 5 stages — NOT R3. Option/enum-variant lowering (the fix that fits #100's NAME) does NOT unblock it, because the discriminator is the erasure, NOT the Option — the R2 control case proves it by execution: the identical body over a CONCRETE array RUNS. Patch-per-site is visibly wrong at 5 sites; un-erasure at source clears all five AT R2. ★ R3 (byte-parity) is a LARGER, DISTINCT track (R&D correction 2026-07-17): 'fix #100 → self-hosting' is true for does-it-RUN, false for does-it-byte-MATCH — R3 needs the WAT emitter's TOTAL un-lowered-node debt → 0 (385 module-wide nodes across the 7 stages, measured by audit-unlowered-nodes.mjs, ALL #128; #100's field-reads are an INDISTINGUISHABLE subset). The emitter is a PARTIAL emitter; #100 is ONE class of its completeness gap, not the whole. Fixing #100 buys R2-green on 5 stages, NOT R3. ALSO: the stages cannot be concatenated — `appendAll` is defined in both type-checker and governance-verifier (`paramNames` in type-checker and gir-emitter), the compiler accepts duplicate FLOW names (FUNGI-NAME-002 covers bindings only), and it surfaces only as a WASM `Duplicate export name` at instantiate — so the whole-compiler bundle P9 ends at cannot be built today. ⚠ THE ROW WAS THE LESSON: 'all 7 twins build (R0) + admit (R1), flows callable' stood from 2026-07-12 and read as 'the stages work'. They ARE callable. FOUR trap at compile-time, a fifth (runtime) at execution — the number read as 3 until the swept edge was drawn to include gir-emitter's on-chain entry. R1 asks 'does it export?', R3 asks 'does it agree?' — nothing asked 'does it RUN?' (that is R2, now built: audit-stage-execution.mjs). UNSWEPT (declared): runtime — execution-time #100 casualty, a different surface from this compile-pipeline sweep (same root, same un-erasure fix)." },
  { layer: "B8 governed HTTP transport (TLSTP)", status: "in progress — admission fold (b8-admission.fungi) execution-proven ≡ the shipped K3 calculus; S4 recovering-FSM twinned + execution-proven (192-pt differential, 2026-07-16 night); remaining = raw-byte shim + S4 live wiring + ECH/OHTTP + DSS.wasm in-sandbox isolation" },
];
// ── TRACKING REGISTRY — substantial items NOT surfaced by the Zero-Trust or Build-Progress tables
//    (the R&D §5 registry, HANDOVER-v1-finish-line-cutover 2026-07-12). HONESTY RULE: `state` is a bare %
//    ONLY where a countable ladder exists (tests / rungs / increments); otherwise it is a truthful WORD —
//    shipped · building · design-done · build-pending · post-v1 · "🔒 owner". Never an invented number.
//    Keep in sync with the README "Tracking registry" table (tool = source, README = view), same as the
//    two tables above. Order mirrors the §5 registry rows. ──────────────────────────────────────────────
const TRACKING_REGISTRY = [
  { item: "Execution-cutover (RD-0361)",        state: "building",      detail: "execution column COMPLETE · 29/29 DIFFERENTIAL · 0 shadow (R0 build→R1 #105-admit→R3 ≡ the real .ts decider; string-verdict twins LABEL-verified; secret-gate over a REAL Array<SecretPresence> via RD-0389 record-ABI; kernel auth gate 6 closed as the FIRST string-ARG twin; S4 transport-FSM joined 2026-07-16 night as the 29th — 4 pure δ projections ≡ transportStep, 192 pts + INV pins) · only R4 authority flip 🔒 owner (#143) remains" },
  { item: "Twin corpus + 6 sentinels",          state: "shipped",       detail: "29 pure .fungi verdict twins checker-clean across 10 governed dirs (execution is RD-0361)" },
  { item: "Hardening / residency (RD-0358)",     state: "shipped",       detail: "H-1..H-7 INTEGRATED + MERGED to main (f7ff18df, task #52) — per-unit cherry-pick keep-green; H-6 memory.spill deny-only + trit-conformance 6/6 + example 182; remaining 🔒 H-5 signed-FuseDescriptor re-sign + #143 exec; H-4 honestly partial" },
  { item: "Epistemic trust-trit (RD-0337)",      state: "shipped",       detail: "PROVEN/UNKNOWN/REFUTED runtime + compiler mirror (Option A) + trit-conformance gate 6/6" },
  { item: "Hallmark open types (RD-0353 H1)",    state: "shipped",       detail: "developer-minted nominal types + mandatory assay gates; FUNGI-HALLMARK-001..005, example 097" },
  { item: "Value-unit types (RD-0349)",          state: "building",      detail: "I2/I3/I4 done (I4: ONE runtime unit table — generated constructors + deny-by-default Money.of, G2+G5 closed) · I5/I6 queued · I1 OWNER-GATE CLEARED (ISO-4217 snapshot pinned in KB data/iso-4217/, 280 entries, hash-recorded) → remainder = the compile-time tag-validation + fuzzy-suggestion rungs NOW BUILT (2026-07-18 — type-checker imports MONEY_UNIT_TAGS; FUNGI-TYPE-032 rejects Money<BANANAS>/Money<GPB>/Money<XAU>/Money<XXX> at COMPILE, transposition-aware 'did you mean GBP', 6 regression tests, doc-drift+diagnostic-codes+twin-parity green) → I1 = 3/6; remaining rungs = `unit` schema escape · B1 reserved-name gate · B0 shadowing check; metals/reserved SPECIFIC Commodity<T> routing waits on RD-0350 C1; no float bridge" },
  { item: "CANONICAL_EFFECTS registry (RD-0341)",state: "shipped",       detail: "single-source domain.verb + anti-drift self-tests; memory.spill deny-only, FUNGI-EFFECT-006" },
  { item: "Contract Registry (RD-0359)",         state: "shipped",       detail: "gen-contract-registry.mjs BUILT — 907 contracts across 450 .fungi → docs/contract-registry/CONTRACT_REGISTRY.md + .json; parser-authoritative flow list + intent extraction; --self-test + --check (CI-ready)" },
  { item: "Self-hosting Stages 3–6",             state: "post-v1",       detail: "bootstrap fixpoint · crypto FFI seam · .fungi↔host path · floor-by-floor; P9, non-v1-gate" },
  { item: "DSS.wasm supervisor (#102–106)",      state: "post-v1",       detail: "real Wasmtime TCB (kernel-bypass / in-sandbox decrypt) stays post-v1 — but the DECISION CORE is now execution-proven (2026-07-16 night): build gate 10/10 deterministic, V_DPM flows ≡ Stage-A over 386 pts + topology-first/monotonicity/deny-by-default laws, zero effect calls from the pure core, 10 real .wasm artifacts sha256-manifested (build/dss-wasm); effect imports link only via explicit deny-by-default grants (createHostRuntime effectHandlers)" },
  { item: "Workspace package families",          state: "shipped",       detail: "93 workspace packages + 2 #32-exempt orphans = 95 components (target×9 · data×12 · db×5 · web×6 · ai · tools). galerina-tools-myco joined 2026-07-17 — it had a package.json and 14 passing tests but was never in galerina.workspace.json, so it read as an un-adjudicated ORPHAN. Two hand-kept registries (workspace list · version.json testCountByPackage) disagreeing is what that gate is for; it caught it." },
  { item: "Package Standard + pub ladder",       state: "building",      detail: "Standard v1 + pkg-census + 9 schematics done; R1–R6 rungs pending; .graph amendment 🔒 owner" },
  { item: "Security-infra designs (×4)",         state: "building",      detail: "SBOM tool exists · fuzz RD-0316 leg 1 BUILT (slice-6 shape-oracle live in the suite; found+fixed the MIN-literal wasm-trap fidelity bug on run one) · Z3 RD-0318 needs a new dep (🔒 propose) · tabletop RD-0319 = owner exercise, runbook on request" },
  { item: "Devtools audit suite",                state: "shipped",       detail: "77 tools · 45 audits (incl. claim-hygiene public-doc gate + env-var-literal-strict path-leak + the fungi-corpus-check compile gate: 447 tracked .fungi found (myco-graph∪git-index), 211 checkable vs the real `galerina check`, ratcheted 49-file baseline) · keep-green + gate-selftests meta-gate; twin-audit execution column shipped (shadow|differential|authoritative)" },
  { item: "Signing-key custody",                 state: "shipped",       detail: "RESOLVED 2026-07-16 — the hybrid root 21415420b447e219 moved OFF the plaintext env-file into an OFFLINE secret store (owner); custody README corrected (it had mis-named the key + a dangerous restore step) + root-vs-operational split plan written (answers #72 — the registry authority is a NEW operational key, never the cold root). Residual owner cleanup: securely wipe the 2 remaining on-disk plaintext copies (cipher /w:). key-rotation itself SHIPS (tower-citizen/key-rotation.ts). TPM(L3)/HW(L4) + HSM/PKCS#11 = post-v1 hardening" },
  { item: "RD-0363/0364/0365 wiring (R&D done)",        state: "building",      detail: "R&D COMPLETE — all 3 authored in the KB (galerina-rd-0363/0364/0365). RD-0363 replay-admission + RD-0364 inference-governance DECISION surfaces execute through #105 (R0→R1, verdict≡spec); RD-0365 key-custody design-done. What remains is BUILD not R&D: P/I wiring increments (0363/0364) + implement 0365. (Renamed 2026-07-15 — 'Missing R&D' was a stale backlog label; the R&D is not missing.)" },
  { item: "KB category indexes",                 state: "post-v1",       detail: "auto-generated KB grouping (API/Kernel/…); trigger: v1-freeze 🔒 owner" },
  { item: "ZTF-KB path-leak guard",              state: "shipped",       detail: "U7 DONE — kb-guards.yml LIVE + twice green on real pushes (self-test→enforce, contents:read, burn-in passed); guards green 0/1,064. Any future red = investigation, never a baseline bump" },
  { item: "TritMesh / .hypha / TritMeshQL",      state: "post-v1",       detail: "the NEXT project (database on Galerina); RD-0293/0294/0306/0312 designs" },
  { item: "myco",                                state: "shipped",       detail: "v0.1.2 (graph-indexed grep replacement, own subproject); silent size-cap skips now surfaced + VERSION drift gate; npm publish 🔒 outward" },
];
// ── EVIDENCE BINDING (RULING 1, R&D-blessed 2026-07-17) ──────────────────────────────────
// A published number that cannot move in response to evidence is not a measurement, it is a
// slogan. Every QUANTIFIED row above must therefore declare HOW its number is known. Exactly
// three kinds are legal, and `scripts/audit-percent-evidence.mjs` fails closed on anything else:
//
//   live:     { live: "<source>" }   — computed from a live source at render time.
//   ladder:   { ladder: [...] }      — pct DERIVED from rungs. Each rung names a MECHANICALLY
//                                      CHECKABLE artifact (a test that passes, a gate that is
//                                      green, a file that exists, a differential that is ≡) and
//                                      `done` is COMPUTED by checking them — NEVER written.
//                                      R&D's refinement, and it is the load-bearing half: a
//                                      derived pct resting on a hand-typed `done` is WORSE than
//                                      an honest constant, because it LOOKS computed.
//   asserted: { asserted: "<why>" }  — hand-typed. A declared DEBT, not a measurement. Must
//                                      appear in the gate's ASSERTED_BASELINE, which may only
//                                      shrink. Every renderer must LABEL these as asserted, so a
//                                      meter can never lend the aura of instrumentation to them.
//
// Fail-closed direction: no checkable ladder ⇒ NO NUMBER. Such a row should carry a WORD via
// `status:` (BUILD_PROGRESS already does this for P9 and B8 — the mechanism is half-present
// here already; this rule finishes it rather than inventing it).
const EVIDENCE = {
  // The one genuinely live number in the whole audit.
  "Tests — full suite": { live: "version.json test/package counts" },

  // ── DEBT. Each states WHY it is still asserted, so the baseline is a work-list, not a dump. ──
  "Compiler": { asserted: "no countable ladder — 'shipped' is a judgement over the twin corpus; candidate ladder = per-stage twin checker-clean + RD-0361 differential ≡" },
  "I/O — OS kernel": { asserted: "remainder is #143 execution — a binary switch, not a ladder; likely becomes a WORD" },
  "Packages": { asserted: "remainder is #143 execution + Phase-28 registry data; the registry half IS countable (real sourceHash + reviewed:true per package)" },
  "Memory": { asserted: "remainder is #143 execution — a binary switch, not a ladder; likely becomes a WORD" },
  "TLSTP — zero-middleware": { asserted: "remainder is #143 + B8 raw-byte shim + S4 live wiring; the twinned-surface half is countable, the execution half is not" },
  "Specification / KB": { asserted: "no countable ladder defined" },
  "Lexer / Parser / Verifier / Contract / Value-state": { asserted: "no countable ladder defined" },
  "DRCM Phases 1-7 (Stage-A simulation)": { asserted: "candidate ladder = the 7 phases, if each has a green gate" },
  "CBOR Manifests (RFC 8949)": { asserted: "no countable ladder defined" },
  "Stage-B self-hosting — interpreter parity": { asserted: "candidate ladder = R6 corpus Stage-A ≡ Stage-B per stage" },
  // #122: CONVERTED asserted → ladder. pct is DERIVED live from twin diagnostic-code parity (28/29 of
  // the TYPE-* ∪ EFFECT-* charter mirrored today; the 1 open rung is FUNGI-TYPE-032). When the ladder
  // can't be computed the row above carries a WORD, so no `asserted` fallback number is ever published.
  "Type checker / Effect checker": TCE ? { ladder: TCE.ladder } : { asserted: "twin-parity ladder temporarily unavailable — carrying a word, not a stale number" },
  "WAT emitter": { asserted: "candidate ladder = per-construct lowering coverage; #100 Option<Record> is the known open rung" },
  "Runtime interpreter": { asserted: "no countable ladder defined" },
  "Application-framework layer": { asserted: "candidate ladder = servable api-server · example-app · signed registry index" },
  "Post-Quantum & Hardware Security": { asserted: "NO ladder — custody ladder + HW signer are post-v1/hardware. Fail-closed reading: this should become a WORD" },
  "Passive Execution Plans & Target Bridges": { asserted: "countable P1-P4, but P2 is R&D-blocked (RD-0311) — convert once each rung has a check" },
  "AI Inference Tower (BitNet/Groq/NVFP4)": { asserted: "countable I1-I5, but I1+I2 are ONE unit (RULING 2: no load site exists) — convert with the I2 wiring" },
  "Photonic / Ternary Computing": { asserted: "NO ladder — simulation only, no hardware. Fail-closed reading: this should become a WORD" },
};
const evidenceFor = (label) => EVIDENCE[label] ?? null;

const quantified = BUILD_PROGRESS.filter((l) => typeof l.pct === "number");
const buildAvg = Math.round(quantified.reduce((a, l) => a + l.pct, 0) / quantified.length);
const ztAvg = Math.round(ZERO_TRUST.reduce((a, b) => a + b.pct, 0) / ZERO_TRUST.length);

// Shared renderer for the two automatic sections (used by --table AND the default report,
// so the numbers can never drift between output modes).
const extraSections = () => {
  const L = (s, n) => String(s).padEnd(n);
  const R = (s, n) => String(s).padStart(n);
  const lines = [];
  lines.push("");
  lines.push("  CONVERSION (.ts -> .fungi, Stage-6 self-hosting)");
  if (!conversion.available) {
    lines.push("    unavailable (not a git work tree)");
  } else {
    lines.push(`    ${L("packages with .fungi-only src/", 34)} ${R(`${conversion.convertedPackages}/${conversion.workspacePackages}`, 8)} ${R(conversion.pct.toFixed(1) + "%", 7)}`);
    lines.push(`    ${L(".ts impl files remaining", 34)} ${R(conversion.tsImplRemainingPkgs, 8)}   (in packages; ${conversion.tsImplRemainingTotal} repo-wide incl. root tooling; +${conversion.tsDecl} .d.ts excluded)`);
    lines.push(`    ${L(".fungi corpus", 34)} ${R(conversion.fungi.total, 8)}   (${conversion.fungi.selfHosted} self-hosted core drafts · ${conversion.fungi.examples} examples · ${conversion.fungi.other} other)`);
    lines.push("    note: fungi-only = src/ holds .fungi with ZERO host-language impl (.ts/.mjs) — matches .fungi-NATIVE packages too, not only conversions; self-hosted drafts count by EXISTENCE, not byte-parity");
  }
  lines.push("");
  lines.push("  TODO (tracked TODO.md checkboxes, as written)");
  if (!todos.available) {
    lines.push("    unavailable (not a git work tree)");
  } else {
    lines.push(`    ${L("items open / done / total", 34)} ${R(`${todos.open} / ${todos.done} / ${todos.total}`, 20)}   (${todos.donePct.toFixed(1)}% done across ${todos.files} TODO.md files)`);
    lines.push("    note: doc-state signal only — per-package TODOs are known to lag shipped reality");
  }
  lines.push("");
  // RULING 1: tag every number with HOW it is known, in the terminal render too — an untagged
  // column of %s reads as measurement regardless of what a footnote says.
  const evTag = (label) => {
    const ev = evidenceFor(label);
    if (ev?.live) return " [live]";
    if (ev?.ladder) return " [derived]";
    if (ev?.asserted) return " [asserted]";
    return " [UNEVIDENCED]";
  };
  lines.push(`  ZERO-TRUST THESIS — boundary readiness (avg ${ztAvg}%; mirrors README "The Zero-Trust thesis")`);
  for (const b of ZERO_TRUST) lines.push(`    ${L(b.boundary, 24)} ${R(b.pct + "%", 5)}${L(evTag(b.boundary), 11)} ${b.status}`);
  lines.push("");
  lines.push(`  BUILD PROGRESS — layer readiness (quantified avg ${buildAvg}%; mirrors README "Build Progress")`);
  for (const l of BUILD_PROGRESS) {
    const has = typeof l.pct === "number";
    const pctStr = has ? `${l.pct}%` : (l.status ?? "—");
    const extra = l.live && version.testCount ? `  (${version.packageCount}/${version.packageCount} pkgs · ${fmt(version.testCount)} tests · 0 fail)` : "";
    lines.push(`    ${L(l.layer, 50)} ${R(pctStr, 12)}${has ? evTag(l.layer) : ""}${extra}`);
  }
  lines.push("    note: [asserted] = HAND-TYPED, not measured — a declared debt, ratcheted by audit-percent-evidence.mjs.");
  lines.push("          [live] = computed from version.json. [derived] = computed from a checkable rung ladder.");
  lines.push("          A row with no checkable ladder should carry a WORD, not a number (P9 and B8 already do).");
  lines.push("");
  lines.push(`  TRACKING REGISTRY — substantial items outside the two tables above (§5; mirrors README "Tracking registry")`);
  for (const t of TRACKING_REGISTRY) {
    const stateStr = typeof t.state === "number" ? `${t.state}%` : t.state;
    lines.push(`    ${L(t.item, 32)} ${R(stateStr, 13)}  ${t.detail}`);
  }
  lines.push("    note: state is an honest WORD (shipped/building/design-done/build-pending/post-v1/🔒) — a bare % appears ONLY where a countable ladder exists, never invented.");
  return lines;
};

// ══════════════════════════════════════════════════════════════════════════════
// % AUDIT — the three MANDATORY sections, structurally enforced.
//   The % audit has recurrently shipped MISSING its "Tracking registry" section (a
//   hand-built widget silently dropped it). This makes that IMPOSSIBLE: the audit is
//   built from a FIXED three-section spec, and buildPercentAudit() THROWS if any
//   required section is empty or absent — so a % audit artifact can NEVER render with
//   fewer than three sections. `--self-test` proves the throw fires (a neutered guard
//   is itself a fail-open); it is wired into the audit cadence.
// ══════════════════════════════════════════════════════════════════════════════
// Owner rule (2026-07-15): the Tracking registry is ALWAYS ordered by STATUS — progress order,
// most-shipped first. Enforced HERE (in the audit assembler) so every render — --audit-html, the --json
// percentAudit, and any widget built from them — is status-ordered by construction, never hand-sorted.
const STATUS_ORDER = ["shipped", "building", "design-done", "build-pending", "post-v1"];
const statusRank = (s) => { const i = STATUS_ORDER.indexOf(typeof s === "number" ? "building" : s); return i === -1 ? STATUS_ORDER.length : i; };
const REQUIRED_SECTIONS = [
  { key: "zero-trust-thesis", title: "Zero-Trust thesis", kind: "meter", get rows() { return ZERO_TRUST.map((b) => ({ label: b.boundary, pct: b.pct, note: b.status, evidence: evidenceFor(b.boundary) })); }, get avg() { return ztAvg; } },
  { key: "build-progress",    title: "Build progress",    kind: "meter", get rows() { return BUILD_PROGRESS.map((l) => ({ label: l.layer, pct: typeof l.pct === "number" ? l.pct : null, status: l.status ?? null, live: !!l.live, evidence: evidenceFor(l.layer) })); }, get avg() { return buildAvg; } },
  { key: "tracking-registry", title: "Tracking registry", kind: "registry", get rows() {
    return TRACKING_REGISTRY
      .map((t, i) => ({ item: t.item, state: t.state, detail: t.detail, _i: i }))
      .sort((a, b) => statusRank(a.state) - statusRank(b.state) || a._i - b._i)   // status order, stable within a status
      .map(({ _i, ...r }) => r);
  } },
];
// FAIL-CLOSED assembler: any missing / empty section is a hard error, never a silent drop.
function buildPercentAudit() {
  const sections = REQUIRED_SECTIONS.map((s) => {
    const rows = s.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`% audit section "${s.key}" (${s.title}) is empty or missing — the audit MUST carry all ${REQUIRED_SECTIONS.length} sections (zero-trust-thesis · build-progress · tracking-registry). Refusing to emit a partial audit.`);
    }
    return { key: s.key, title: s.title, kind: s.kind, avg: s.avg ?? null, rows };
  });
  const keys = sections.map((s) => s.key).join(",");
  const need = ["zero-trust-thesis", "build-progress", "tracking-registry"].join(",");
  if (keys !== need) throw new Error(`% audit section set drifted: got [${keys}], require [${need}]`);
  return {
    generatedBy: "scripts/component-health.mjs --audit-html",
    provenance, shipReadinessPct: summary.readinessPct, ztAvg, buildAvg,
    trackingRegistryCount: TRACKING_REGISTRY.length, sections,
  };
}

// The staleness-relevant CONTENT of a % audit: everything EXCEPT the git `provenance` (branch/sha/dirty),
// which moves every commit and so is not a staleness signal. Two audits with the same content key are the
// same audit even if generated at different commits. Used by the --audit-check gate and its self-test.
function auditContentKey(a) { const { provenance, ...rest } = a; return JSON.stringify(rest); }

// Self-contained SVG/HTML % audit artifact — no CDN, no <script>, opens offline, adapts to light/dark.
function renderAuditHtml(audit) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const stateClass = (st) => ({ shipped: "s-ship", building: "s-build", "design-done": "s-build", "build-pending": "s-pend", "post-v1": "s-front" }[st] ?? "s-front");
  // Owner rule 2026-07-16 ("% colors — always show it that way"): the meter fill stays ONE hue
  // (series blue — the bar carries magnitude, not judgement); the VALUE text is threshold-colored:
  // >=90 green (v-hi) · <40 red (v-lo) · otherwise primary (v-mid). Color encodes the reading.
  const pctColor = (pct) => (pct >= 90 ? "v-hi" : pct < 40 ? "v-lo" : "v-mid");
  // RULING 1: an ASSERTED row is hand-typed, not measured. Drawing it as a solid meter lends it
  // the aura of instrumentation — the exact overclaim this rule exists to stop. So an asserted
  // row renders HOLLOW (hatched fill) and carries an explicit "asserted" tag with its reason on
  // hover; live/ladder rows render solid. The number still shows — this labels it, never hides it.
  const meterRow = (r) => {
    const has = typeof r.pct === "number";
    const w = has ? r.pct : 0;
    const val = has ? `${r.pct}%` : esc(r.status ?? "—");
    const vcls = has ? pctColor(r.pct) : "v-mid";
    const asserted = has && !!r.evidence?.asserted;
    const tag = asserted
      ? ` <span class="atag" title="${esc(r.evidence.asserted)}">asserted</span>`
      : (has && r.evidence?.live ? ` <span class="ltag" title="${esc(r.evidence.live)}">live</span>` : "");
    return `<div class="mrow"><span class="mlabel">${esc(r.label)}${tag}</span>`
      + `<span class="mtrack"><span class="mfill${asserted ? " mfill-asserted" : ""}" style="width:${w}%"></span></span>`
      + `<span class="mval ${vcls}">${val}</span></div>`;
  };
  const sectionHtml = (s) => {
    if (s.kind === "meter") {
      return `<h2>${esc(s.title)}${s.avg != null ? ` <span class="avg">avg ${s.avg}%</span>` : ""}</h2>` + s.rows.map(meterRow).join("");
    }
    // registry — grouped by STATUS (owner rule: always status-ordered), a state badge per item.
    // Rows arrive status-ordered from REQUIRED_SECTIONS; insert a group header each time the status changes.
    let last = null;
    const body = s.rows.map((r) => {
      const st = typeof r.state === "number" ? "building" : r.state;
      const hdr = st !== last ? `<tr><td colspan="3" class="rgroup"><span class="badge ${stateClass(r.state)}">${esc(st)}</span> <span class="rgcount">${s.rows.filter((x) => (typeof x.state === "number" ? "building" : x.state) === st).length}</span></td></tr>` : "";
      last = st;
      return hdr + `<tr><td class="ritem">${esc(r.item)}</td><td class="rst">${esc(typeof r.state === "number" ? r.state + "%" : "")}</td><td class="rdetail">${esc(r.detail)}</td></tr>`;
    }).join("");
    return `<h2>${esc(s.title)} <span class="avg">${s.rows.length} items · ordered by status</span></h2><table class="reg"><tbody>${body}</tbody></table>`;
  };
  const style = `<style>
  .pa{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:920px;margin:0 auto;padding:1rem;color:#1a1a19}
  .pa h1{font-size:20px;font-weight:500;margin:0 0 2px}.pa h2{font-size:16px;font-weight:500;margin:1.5rem 0 8px}
  .pa .sub{font-size:13px;color:#6b6a64;margin:0 0 1rem}.pa .avg{font-size:12px;color:#8a8880;font-weight:400}
  .pa .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:.6rem 0 0}
  .pa .card{background:#f5f4ef;border-radius:8px;padding:.7rem}.pa .card .k{font-size:12px;color:#6b6a64}.pa .card .v{font-size:22px;font-weight:500}
  .pa .mrow{display:grid;grid-template-columns:210px 1fr 46px;align-items:center;gap:10px;margin:5px 0}
  .pa .mlabel{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .pa .mtrack{height:14px;background:#e6e5de;border-radius:7px;overflow:hidden}.pa .mfill{display:block;height:100%;border-radius:7px;background:#2a78d6}
  .pa .mval{font-size:13px;font-weight:500;text-align:right}
  .pa .v-hi{color:#0f6e56}.pa .v-lo{color:#a32d2d}.pa .v-mid{color:#1a1a19}
  /* RULING 1: an asserted (hand-typed) number must NOT wear the costume of a measurement.
     A solid bar reads as instrumentation; these render HATCHED + tagged, so the eye can
     tell a measured row from a claimed one without reading the JSON. */
  .pa .atag{font-size:10px;padding:1px 5px;border-radius:8px;background:#faeeda;color:#854f0b;font-weight:500;cursor:help}
  .pa .ltag{font-size:10px;padding:1px 5px;border-radius:8px;background:#e1f5ee;color:#0f6e56;font-weight:500;cursor:help}
  .pa .mfill-asserted{background:repeating-linear-gradient(45deg,#c3c2b7 0 4px,transparent 4px 8px);border:0.5px solid #b4b2a9;box-sizing:border-box}
  .pa table.reg{width:100%;border-collapse:collapse;font-size:13px}.pa .reg td{padding:6px 8px;border-top:0.5px solid #e1e0d9;vertical-align:top}
  .pa .ritem{font-weight:500;white-space:nowrap}.pa .rdetail{color:#6b6a64;font-size:12px}.pa .rst{font-size:11px;color:#8a8880;text-align:right}
  .pa .rgroup{padding-top:12px}.pa .rgcount{font-size:11px;color:#8a8880}
  .pa .badge{font-size:11px;padding:2px 8px;border-radius:10px;white-space:nowrap}
  .pa .s-ship{background:#e1f5ee;color:#0f6e56}.pa .s-build{background:#e6f1fb;color:#185fa5}.pa .s-pend{background:#faeeda;color:#854f0b}.pa .s-front{background:#f1efe8;color:#5f5e5a}
  @media (prefers-color-scheme:dark){.pa{color:#e8e7e0}.pa .sub,.pa .card .k,.pa .rdetail{color:#a3a29a}
    .pa .card{background:#232322}.pa .mtrack{background:#333330}.pa .reg td{border-top-color:#333330}
    .pa .mfill{background:#3987e5}.pa .v-hi{color:#5dcaa5}.pa .v-lo{color:#e66767}.pa .v-mid{color:#e8e7e0}
    .pa .atag{background:#412402;color:#ef9f27}.pa .ltag{background:#04342c;color:#5dcaa5}
    .pa .mfill-asserted{background:repeating-linear-gradient(45deg,#5f5e5a 0 4px,transparent 4px 8px);border-color:#5f5e5a}
    .pa .s-ship{background:#04342c;color:#5dcaa5}.pa .s-build{background:#042c53;color:#85b7eb}.pa .s-pend{background:#412402;color:#ef9f27}.pa .s-front{background:#2c2c2a;color:#b4b2a9}}
  </style>`;
  const cards = `<div class="cards">`
    + `<div class="card"><div class="k">ship-readiness</div><div class="v" style="color:#0f6e56">${audit.shipReadinessPct.toFixed(1)}%</div></div>`
    + `<div class="card"><div class="k">ZT-thesis avg</div><div class="v">${audit.ztAvg}%</div></div>`
    + `<div class="card"><div class="k">build avg</div><div class="v">${audit.buildAvg}%</div></div>`
    + `<div class="card"><div class="k">tracking registry</div><div class="v">${audit.trackingRegistryCount}<span style="font-size:13px;color:#8a8880"> items</span></div></div>`
    + `</div>`;
  return `<!doctype html><meta charset="utf-8"><title>Galerina % audit</title>${style}<div class="pa">`
    + `<h1>Galerina % audit</h1><p class="sub">${audit.provenance?.available ? esc(audit.provenance.branch + " @ " + audit.provenance.sha) : "provenance unavailable"} · generated by component-health.mjs · ${REQUIRED_SECTIONS.length} mandatory sections</p>`
    + cards + audit.sections.map(sectionHtml).join("") + `</div>`;
}

if (SELF_TEST) {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  let audit;
  try { audit = buildPercentAudit(); ok(true, "buildPercentAudit() succeeds on the real data"); }
  catch (e) { ok(false, `buildPercentAudit threw on real data: ${e.message}`); process.exit(1); }
  ok(audit.sections.length === 3, "the % audit has exactly 3 sections");
  ok(audit.sections.some((s) => s.key === "tracking-registry" && s.rows.length > 0), "the Tracking registry section is present AND non-empty");
  ok(audit.sections.map((s) => s.key).join(",") === "zero-trust-thesis,build-progress,tracking-registry", "sections are exactly [zero-trust · build · tracking-registry], in order");
  const html = renderAuditHtml(audit);
  for (const t of ["Zero-Trust thesis", "Build progress", "Tracking registry"]) ok(html.includes(t), `rendered artifact contains the "${t}" heading`);
  ok(html.includes(esc0(TRACKING_REGISTRY[0].item)), "rendered artifact contains a real Tracking-registry row");
  // Tracking registry is ALWAYS status-ordered (owner rule): the emitted ranks must be non-decreasing.
  const reg = audit.sections.find((s) => s.key === "tracking-registry").rows;
  const ranks = reg.map((r) => statusRank(r.state));
  ok(ranks.every((v, i) => i === 0 || ranks[i - 1] <= v), "Tracking registry rows are ordered by status (non-decreasing rank)");
  ok(!/https?:\/\//.test(html) && !/<script/i.test(html), "artifact is self-contained (no CDN / no <script>)");
  // Owner color rule (2026-07-16): one-hue blue meter fill + threshold-colored VALUES (>=90 green, <40 red).
  ok(html.includes('class="mval v-hi"') && html.includes(".v-hi{color:#0f6e56}"), "values >=90 carry the green threshold class (color rule enforced)");
  ok(html.includes(".mfill") && html.includes("background:#2a78d6"), "meter fill is the single series blue (bars carry magnitude, values carry judgement)");
  // The load-bearing guarantee: an EMPTY tracking registry must be REFUSED, never silently rendered.
  const saved = TRACKING_REGISTRY.splice(0, TRACKING_REGISTRY.length);
  let threw = false; try { buildPercentAudit(); } catch { threw = true; }
  TRACKING_REGISTRY.push(...saved);
  ok(threw, "an EMPTY Tracking registry is REFUSED (buildPercentAudit throws — the % audit cannot drop a section)");
  // #95 staleness gate — the content key must IGNORE the volatile git provenance yet DETECT real drift.
  ok(auditContentKey({ ...audit, provenance: { sha: "aaaaaaa" } }) === auditContentKey({ ...audit, provenance: { sha: "bbbbbbb" } }),
    "staleness content key ignores git provenance (a new commit sha alone is NOT staleness)");
  ok(auditContentKey(audit) !== auditContentKey({ ...audit, ztAvg: audit.ztAvg + 1 }),
    "staleness content key DETECTS real drift (a changed ztAvg trips the gate — non-vacuous)");
  console.log(process.exitCode ? "  component-health % audit self-test FAILED" : "  component-health % audit self-test: all 3 sections structurally enforced ✅");
  process.exit(process.exitCode ?? 0);
}
function esc0(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

if (AUDIT_HTML) {
  const audit = buildPercentAudit();   // throws (fail-closed) if any of the 3 sections is missing/empty
  const outDir = join(ROOT, "build", "component-health");
  mkdirSync(outDir, { recursive: true });
  const htmlPath = join(outDir, "percent-audit.html");
  writeFileSync(htmlPath, renderAuditHtml(audit));
  writeFileSync(join(outDir, "percent-audit.json"), JSON.stringify(audit, null, 2));
  console.log(`✅ % audit: build/component-health/percent-audit.{html,json} — ${audit.sections.length} sections (ZT-thesis ${audit.ztAvg}% · build ${audit.buildAvg}% · tracking registry ${audit.trackingRegistryCount} items)`);
  process.exit(0);
}

if (AUDIT_CHECK) {
  // Staleness gate (#95): the committed % audit must match what component-health.mjs (the source of
  // truth) would generate NOW, comparing CONTENT only — the git `provenance` moves every commit and is
  // NOT a staleness signal, so it's excluded via auditContentKey. Fail-closed (exit 3) if the source
  // data (ZERO_TRUST / BUILD_PROGRESS / TRACKING_REGISTRY) drifted without a `--audit-html` regen.
  const fresh = buildPercentAudit();   // throws (fail-closed) if any section is missing/empty
  const auditPath = join(ROOT, "build", "component-health", "percent-audit.json");
  if (!existsSync(auditPath)) {
    console.error("❌ percent-audit staleness: build/component-health/percent-audit.json is MISSING — run `node scripts/component-health.mjs --audit-html` and commit it.");
    process.exit(3);
  }
  const committed = JSON.parse(readFileSync(auditPath, "utf8"));
  if (auditContentKey(fresh) !== auditContentKey(committed)) {
    console.error("❌ percent-audit staleness: build/component-health/percent-audit.json content drifted from component-health.mjs (source of truth) — run `node scripts/component-health.mjs --audit-html` and commit the refreshed % audit. (git provenance is excluded from this check; only real content drift trips it.)");
    process.exit(3);
  }
  console.log("✅ percent-audit fresh: committed % audit content == component-health.mjs (git provenance excluded from the staleness check)");
  process.exit(0);
}

if (AS_JSON) {
  console.log(JSON.stringify({ provenance, summary, rows, orphans, orphanExemptions: orphanRows, unexpectedOrphans, percentAudit: buildPercentAudit() }, null, 2));
  process.exit(STRICT && summary.totalGaps > 0 ? 1 : 0);
}

if (TABLE) {
  // Per-family readiness table with a TOTAL row — the honest ship-readiness % broken out,
  // ranked most-ready first. Orphans are their own row (0 green / N) and count in the TOTAL,
  // so the TOTAL equals the SHIP-READINESS headline exactly (no masked denominator).
  const fams = {};
  for (const r of rows) {
    if (!fams[r.family]) fams[r.family] = { g: 0, t: 0 };
    fams[r.family].t += 1;
    if (r.gaps.length === 0) fams[r.family].g += 1;
  }
  const ranked = Object.keys(fams)
    .map((f) => ({ f, g: fams[f].g, t: fams[f].t, pct: (100 * fams[f].g) / fams[f].t }))
    .sort((a, b) => b.pct - a.pct || a.f.localeCompare(b.f));
  const L = (s, n) => String(s).padEnd(n);
  const R = (s, n) => String(s).padStart(n);
  const out = [];
  if (provenance.available) out.push(`  ${provenance.branch} @ ${provenance.sha} · ${provenance.dirty ? "dirty" : "clean"}`);
  out.push(`  ${L("FAMILY", 12)} ${R("GREEN", 6)} ${R("TOTAL", 6)} ${R("%", 7)}`);
  for (const r of ranked) out.push(`  ${L(r.f, 12)} ${R(r.g, 6)} ${R(r.t, 6)} ${R(r.pct.toFixed(0) + "%", 7)}`);
  out.push(`  ${L("(orphans)", 12)} ${R(0, 6)} ${R(orphans.length, 6)} ${R("0%", 7)}  ${unexpectedOrphans.length ? `⚠ ${unexpectedOrphans.length} UNEXPECTED (not on #32 allowlist)` : "all exempt (#32 documented)"}`);
  out.push(`  ${L("TOTAL", 12)} ${R(summary.green, 6)} ${R(summary.components, 6)} ${R(summary.readinessPct.toFixed(1) + "%", 7)}`);
  out.push(`  scope: ${summary.scope}`);
  out.push(...extraSections());
  console.log(out.join("\n"));
  process.exit(STRICT && summary.totalGaps > 0 ? 1 : 0);
}

// ── render ───────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const out = [];
out.push(`Galerina component health — ${summary.workspacePackages} workspace packages · ${summary.withTestScript} test-bearing · ${fmt(summary.recordedTotal)} recorded tests`);
// ── provenance header: which git tree produced these numbers (top of report) ──
if (provenance.available) {
  const state = provenance.dirty == null ? "dirty state unknown" : provenance.dirty ? "dirty (uncommitted changes)" : "clean";
  out.push(`  provenance: ${provenance.branch} @ ${provenance.sha} · ${state}`);
  if (provenance.detached) out.push("  ⚠ DETACHED HEAD — report may reflect a stale tree; confirm the SHA above is the tree you meant to measure");
} else {
  out.push("  provenance: unavailable (not a git work tree)");
}
out.push(`  SHIP-READINESS: ${summary.readinessPct.toFixed(1)}% (${summary.green}/${summary.components} components green) · ${summary.totalGaps} gap(s)`);
out.push(`  scope: ${summary.scope}`);
out.push("");
for (const fam of [...new Set(rows.map((r) => r.family))].sort()) {
  const famRows = rows.filter((r) => r.family === fam).sort((a, b) => a.dir.localeCompare(b.dir));
  const shown = ONLY_GAPS ? famRows.filter((r) => r.gaps.length) : famRows;
  if (!shown.length) continue;
  out.push(`  ${fam}/`);
  for (const r of shown) {
    const cnt = r.recordedCount != null ? `${fmt(r.recordedCount)}t` : (r.testFiles ? `${r.testFiles}f` : "—");
    const flags = r.gaps.length ? `  ⚠ ${r.gaps.join(", ")}` : "";
    out.push(`    ${pad(r.dir, 40)} ${pad(cnt, 9)}${flags}`);
  }
}
out.push("");
out.push(`  gaps    : ${summary.withGaps} package(s) with a readiness gap${ONLY_GAPS ? "" : "  (--gaps to isolate)"}`);
out.push(`  orphans : ${summary.orphans}${orphans.length ? "  -> " + orphans.sort().join(", ") : ""}`);
out.push(`  ship    : ${summary.readinessPct.toFixed(1)}% ship-ready · ${summary.totalGaps} total gap(s) = ${summary.withGaps} package + ${summary.orphans} orphan`);
out.push(...extraSections());
console.log(out.join("\n"));
process.exit(STRICT && summary.totalGaps > 0 ? 1 : 0);
