// Fixture-tree tests for the dev-tool scripts (code-index · gen-code-registry · audit-coverage).
// Subprocess + crafted tmp workspace = tests the REAL end-to-end behavior without refactoring the scripts.
// Locks the review-wn8v30euh scanner fixes: trailing-letter, const-id emit, multi-line throw, comment/
// type-decl exclusion, and the conservative dead-detection.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── fixture workspace: one crafted diagnostics file under a fake package ──
const tmp = mkdtempSync(join(tmpdir(), "fungi-devtools-"));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });
const src = join(tmp, "packages-galerina", "fx", "src");
mkdirSync(src, { recursive: true });
writeFileSync(join(src, "diag.ts"), [
  `export const FUNGI_FX_001 = { code: "FUNGI-FX-001", name: "FxDefinedNeverUsed", severity: "error" };`,
  `export const ERR_FX_THING = "ERR_FX_THING";`,
  `export const ERR_FX_THROWN = "ERR_FX_THROWN";`,
  `export function emitInline(d){`,
  `  d.push({`,
  `    code: "FUNGI-FX-002",`,
  `    name: "FxInline",`,
  `    severity: "warning",`,
  `  });`,
  `}`,
  `export function emitViaConst(){ return { ok: false, code: ERR_FX_THING, reason: "x" }; }`,
  `export function emitThrow(){`,
  `  throw new FxError(`,
  `    ERR_FX_THROWN,`,
  `    "boom",`,
  `  );`,
  `}`,
  `// a comment mentioning FUNGI-FX-099 must be a ref, not an emit/def`,
  `export const FUNGI_FX_005 = { code: "FUNGI-FX-005", name: "FxFive", severity: "error" };`,
  `export const FUNGI_FX_005B = { code: "FUNGI-FX-005B", name: "FxFiveB", severity: "error" };`,
  `export interface FxShape { readonly code: "FUNGI-FX-050"; }`,
  `export function useFive(d){ d.push({ ...FUNGI_FX_005 }); d.push({ ...FUNGI_FX_005B }); }`,
].join("\n") + "\n");

const run = (script, args = []) => spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: tmp, encoding: "utf8" });
run("code-index.mjs");
run("gen-code-registry.mjs");
const idx = JSON.parse(readFileSync(join(tmp, "build", "code-index", "code-index.json"), "utf8"));
const byCode = Object.fromEntries(idx.map((c) => [c.code, c]));
const reg = JSON.parse(readFileSync(join(tmp, "build", "code-registry", "registry.json"), "utf8"));
const status = Object.fromEntries(reg.entries.map((e) => [e.code, e.status]));
const emits = (c) => (byCode[c]?.emits || []).length;
const defs = (c) => (byCode[c]?.defs || []).length;

test("code-index: trailing-letter suffix kept distinct (005 vs 005B both indexed)", () => {
  assert.ok(byCode["FUNGI-FX-005"], "FUNGI-FX-005 indexed");
  assert.ok(byCode["FUNGI-FX-005B"], "FUNGI-FX-005B indexed distinctly (not truncated to 005)");
});

test("code-index: const-identifier emit resolved (code: ERR_FX_THING)", () => {
  assert.ok(emits("ERR_FX_THING") > 0, "ERR_FX_THING emitted via a const-id `code:` reference");
});

test("code-index: multi-line `throw new FxError(\\n ERR_FX_THROWN,…)` resolved", () => {
  assert.ok(emits("ERR_FX_THROWN") > 0, "ERR_FX_THROWN emitted via the windowed constructor throw");
});

test("code-index: inline push emit (FUNGI-FX-002)", () => {
  assert.ok(emits("FUNGI-FX-002") > 0);
});

test("code-index: a comment mention is a ref, NOT an emit/def (FUNGI-FX-099)", () => {
  const c = byCode["FUNGI-FX-099"];
  assert.ok(c, "still indexed (as a ref)");
  assert.equal(emits("FUNGI-FX-099"), 0);
  assert.equal(defs("FUNGI-FX-099"), 0);
});

test("code-index: a TS type position is NOT an emit/def (readonly code: FUNGI-FX-050)", () => {
  assert.equal(emits("FUNGI-FX-050"), 0);
  assert.equal(defs("FUNGI-FX-050"), 0);
});

test("gen-code-registry: defined-AND-unreferenced is DEAD (FUNGI-FX-001)", () => {
  assert.equal(status["FUNGI-FX-001"], "dead", "FUNGI-FX-001 is defined but never used → RESERVED");
});

test("gen-code-registry: const-emitted codes are LIVE, not dead (ERR_FX_THING/THROWN)", () => {
  assert.notEqual(status["ERR_FX_THING"], "dead");
  assert.notEqual(status["ERR_FX_THROWN"], "dead");
});

test("audit-coverage: a clean fixture has 0 coverage holes (no phantom)", () => {
  const r = run("audit-coverage.mjs", ["codes", "--json"]);
  const j = JSON.parse(r.stdout);
  assert.equal(j.holes, 0, "no registry phantoms on a fixture with no curated registry");
});

// ── DOC-004 doc↔source drift: a second fixture (version.json authority + crafted docs) ──
const tmp2 = mkdtempSync(join(tmpdir(), "fungi-docdrift-"));
after(() => { try { rmSync(tmp2, { recursive: true, force: true }); } catch { /* best effort */ } });
mkdirSync(join(tmp2, "docs", "Knowledge-Bases"), { recursive: true });
writeFileSync(join(tmp2, "version.json"), JSON.stringify({ testCount: 4993, packageCount: 53 }) + "\n");
// living doc (no date in filename) — its CURRENT count claim is stale → MUST flag
writeFileSync(join(tmp2, "docs", "Knowledge-Bases", "living.md"), [
  `# Status`,
  `Live full suite: 44/44 packages, 4,128 tests, 0 fail.`,          // drift (both) → flag x2
  `The kernel package alone has 87 tests.`,                          // per-package, no global ctx → NOT flagged
  `Previously 40/40 packages (superseded by the above).`,           // historical keyword → NOT flagged
  `2026-05-01 verified: 33/33 packages, 3,300 tests.`,              // "verified:" historical line → NOT flagged
].join("\n") + "\n");
// dated-FILENAME snapshot — counts are historical by construction → whole file exempt
writeFileSync(join(tmp2, "docs", "Knowledge-Bases", "snap-2026-06-01.md"), `Snapshot: 40/40 packages, 3,000 tests.\n`);
// dated-with-SUFFIX snapshot (…-eod.md) + append-only -log.md — both exempt classes
writeFileSync(join(tmp2, "docs", "Knowledge-Bases", "audit-2026-06-02-eod.md"), `EOD: full suite 41/41 packages, 3,100 tests.\n`);
writeFileSync(join(tmp2, "docs", "Knowledge-Bases", "results-log.md"), `Entry: full suite 42/42 packages, 3,200 tests.\n`);

// The tool resolves the KB corpus via GALERINA_KB_DIR (sibling ZTF-Knowledge-Bases by default) —
// point it at the fixture's docs dir so the harness stays hermetic.
const drift = JSON.parse(run2("audit-doc-drift.mjs", ["--json"]).stdout);
function run2(script, args = [], env = { GALERINA_KB_DIR: join(tmp2, "docs", "Knowledge-Bases") }) { return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: tmp2, encoding: "utf8", env: { ...process.env, ...env } }); }

test("doc-drift: a living doc's stale CURRENT count is flagged (packages + tests)", () => {
  const inLiving = drift.drift.filter((d) => d.rel.includes("living.md"));
  assert.ok(inLiving.some((d) => d.kind === "packages" && d.claim.includes("44/44")), "44/44 packages flagged");
  assert.ok(inLiving.some((d) => d.kind === "tests" && d.claim.includes("4,128")), "4,128 tests flagged");
});

test("doc-drift: a per-package count (no global context) is NOT flagged", () => {
  assert.ok(!drift.drift.some((d) => d.claim.includes("87")), "87 tests (per-package) not treated as global");
});

test("doc-drift: historical lines (superseded / verified:) are exempt", () => {
  assert.ok(!drift.drift.some((d) => d.claim.includes("40/40")), "superseded line exempt");
  assert.ok(!drift.drift.some((d) => d.claim.includes("3,300")), "verified: line exempt");
});

test("doc-drift: a dated-FILENAME snapshot is fully exempt", () => {
  assert.ok(!drift.drift.some((d) => d.rel.includes("snap-2026-06-01")), "dated snapshot not scanned");
});

test("doc-drift: a dated-with-suffix filename (…-2026-06-02-eod.md) is exempt", () => {
  assert.ok(!drift.drift.some((d) => d.rel.includes("audit-2026-06-02-eod")), "dated+suffix snapshot not scanned");
});

test("doc-drift: an append-only -log.md file is exempt", () => {
  assert.ok(!drift.drift.some((d) => d.rel.includes("results-log")), "-log.md record not scanned");
});

test("doc-drift: a MISSING KB corpus is a VIOLATION (fail-closed), not silence", () => {
  const r = JSON.parse(run2("audit-doc-drift.mjs", ["--json"], { GALERINA_KB_DIR: join(tmp2, "no-such-kb") }).stdout);
  assert.ok(r.drift.some((d) => d.kind === "kb-corpus"), "missing corpus surfaces as a kb-corpus violation");
});

// ── SEC-002 mutation gate: a hermetic tmp git repo proves KILL + SURVIVE + git-safety (no production touched) ──
const tmp3 = mkdtempSync(join(tmpdir(), "fungi-mutation-"));
after(() => { try { rmSync(tmp3, { recursive: true, force: true }); } catch { /* best effort */ } });
const git3 = (...a) => spawnSync("git", a, { cwd: tmp3, encoding: "utf8" });
// a fixture "gate": one check is GUARDED by the test, one is NOT
writeFileSync(join(tmp3, "gate.mjs"), [
  `export function admit(result, level) {`,
  `  if (result !== true) throw new Error("DENY non-true verifier");`, // GUARDED
  `  if (level > 5) throw new Error("DENY level too high");`,          // UNGUARDED (no test exercises level)
  `  return "ok";`,
  `}`,
].join("\n") + "\n");
// plain-node assertion script (NOT nested `node --test` — a child test-runner spawned from this test-runner
// parent misreports its exit code; the production catalog uses `node --test` because its parent is plain node).
writeFileSync(join(tmp3, "gate.check.mjs"), [
  `import assert from "node:assert/strict";`,
  `import { admit } from "./gate.mjs";`,
  `for (const x of ["yes", 1, {}]) assert.throws(() => admit(x, 0)); // GUARDS the result-check`,
  `assert.equal(admit(true, 0), "ok");`,
].join("\n") + "\n");
writeFileSync(join(tmp3, "mutants.json"), JSON.stringify([
  { id: "guarded", file: "gate.mjs", find: "if (result !== true)", replace: "if (!result)", cwd: ".", test: ["node", "gate.check.mjs"], desc: "guarded check" },
  { id: "unguarded", file: "gate.mjs", find: "if (level > 5)", replace: "if (level > 6)", cwd: ".", test: ["node", "gate.check.mjs"], desc: "unguarded check" },
]) + "\n");
git3("init", "-q");
git3("add", "-A");
git3("-c", "user.email=ci@x", "-c", "user.name=ci", "commit", "-q", "-m", "fixture");
const mut = JSON.parse(spawnSync(process.execPath,
  [join(SCRIPTS, "audit-mutation.mjs"), "--config", join(tmp3, "mutants.json"), "--root", tmp3, "--json"],
  { cwd: tmp3, encoding: "utf8" }).stdout);
const verdict = (id) => mut.results.find((r) => r.id === id);

test("mutation: a GUARDED fail-closed check → mutant KILLED (the test catches the re-introduced hole)", () => {
  assert.equal(verdict("guarded")?.killed, true);
});
test("mutation: an UNGUARDED check → mutant SURVIVED (flags the missing red-team test)", () => {
  assert.equal(verdict("unguarded")?.killed, false);
  assert.equal(mut.survived.length, 1);
});
test("mutation: git-safety — every target file restored clean after the run", () => {
  assert.deepEqual(mut.leftDirty, []);
  assert.equal(git3("diff", "--quiet", "--", "gate.mjs").status, 0, "gate.mjs is git-clean after mutation run");
});

// ── kb-index: a tmp KB tree proves BUILD + QUERY ranking + --code lookup ──
const tmp6 = mkdtempSync(join(tmpdir(), "fungi-kbindex-"));
after(() => { try { rmSync(tmp6, { recursive: true, force: true }); } catch { /* best effort */ } });
mkdirSync(join(tmp6, "docs", "Knowledge-Bases"), { recursive: true });
writeFileSync(join(tmp6, "docs", "Knowledge-Bases", "alpha.md"),
  "# Alpha Transport\n## Morphing frames\nThe **morphing transport** layer governs FUNGI-FOO-001 per task #201.\n");
writeFileSync(join(tmp6, "docs", "Knowledge-Bases", "beta.md"),
  "# Beta Storage\n## Arena allocator\nMonotone bump memory and zeroize on reset.\n");
const kb = (a) => spawnSync(process.execPath, [join(SCRIPTS, "kb-index.mjs"), ...a], { cwd: tmp6, encoding: "utf8", env: { ...process.env, GALERINA_KB_DIR: join(tmp6, "docs", "Knowledge-Bases") } });
kb([]); // build
const kbIdx = JSON.parse(readFileSync(join(tmp6, "build", "kb-index", "kb-index.json"), "utf8"));

test("kb-index: builds an index over the KB tree (codes + tasks captured)", () => {
  assert.equal(kbIdx.docCount, 2);
  const alpha = kbIdx.docs.find((d) => d.rel.endsWith("alpha.md"));
  assert.ok(alpha.codes.includes("FUNGI-FOO-001"), "code captured");
  assert.ok(alpha.tasks.includes("#201"), "task ref captured");
});
test("kb-index: query ranks the relevant doc first", () => {
  const firstHit = kb(["morphing"]).stdout.split(/\r?\n/).find((l) => /\.md$/.test(l)) || "";
  assert.ok(firstHit.includes("alpha.md"), `morphing -> alpha.md (got: ${firstHit})`);
});
test("kb-index: --code lists only the doc mentioning the code", () => {
  const out = kb(["--code", "FUNGI-FOO-001"]).stdout;
  assert.ok(out.includes("alpha.md") && !out.includes("beta.md"));
});

// ── BLD-003 audit-provenance: a tmp tree proves stamped+fresh vs STALE vs UNSTAMPED (kb-index artifact) ──
const tmp7 = mkdtempSync(join(tmpdir(), "fungi-prov-"));
after(() => { try { rmSync(tmp7, { recursive: true, force: true }); } catch { /* best effort */ } });
mkdirSync(join(tmp7, "docs", "Knowledge-Bases"), { recursive: true });
mkdirSync(join(tmp7, "build", "kb-index"), { recursive: true });
writeFileSync(join(tmp7, "docs", "Knowledge-Bases", "a.md"), "# A\n");
writeFileSync(join(tmp7, "build", "kb-index", "kb-index.json"), JSON.stringify({ docs: [] }));
writeFileSync(join(tmp7, "build", "kb-index", "provenance.json"), JSON.stringify({ tool: "kb-index", gitCommit: "abc1234", builtAt: "x" }));
const prov = () => JSON.parse(spawnSync(process.execPath, [join(SCRIPTS, "audit-provenance.mjs"), "--json"], { cwd: tmp7, encoding: "utf8" }).stdout);
const kbFindings = (j) => j.findings.filter((f) => f.name === "kb-index");

test("provenance: a stamped + fresh artifact has no finding", () => {
  assert.equal(kbFindings(prov()).length, 0);
});
test("provenance: a source newer than the artifact → STALE", () => {
  utimesSync(join(tmp7, "docs", "Knowledge-Bases", "a.md"), new Date(Date.now() + 1e6), new Date(Date.now() + 1e6));
  assert.ok(kbFindings(prov()).some((f) => f.issue === "STALE"));
});
test("provenance: a missing sidecar → UNSTAMPED", () => {
  rmSync(join(tmp7, "build", "kb-index", "provenance.json"));
  assert.ok(kbFindings(prov()).some((f) => f.issue === "UNSTAMPED"));
});

// ── RD-0126 overclaim-E: the "O(1) / constant-time zero-wipe" phrase-blocklist (memory.fill is Θ(arena-size)) ──
const tmp8 = mkdtempSync(join(tmpdir(), "fungi-overclaim-"));
after(() => { try { rmSync(tmp8, { recursive: true, force: true }); } catch { /* best effort */ } });
// a doc: the false claim (flag), the approved phrasing (pass), and a correction line (co-occurs but exempt).
writeFileSync(join(tmp8, "doc.md"), [
  `# Overclaim fixture`,
  `The intrusion wipe is an O(1) memory.fill(0) zero-wipe.`,                  // L2 → MUST flag
  `The reset is one atomic memory.fill (Θ(arena-size) work).`,               // L3 → MUST pass (no boost token)
  `Note: memory.fill is O(arena-size), not "O(1)" — linear work.`,           // L4 → co-occurs but is the CORRECTION → exempt
].join("\n") + "\n");
// a source file: the overclaim in a string literal is masked (code, not a claim); in a // comment it is caught.
writeFileSync(join(tmp8, "mod.ts"), [
  `const s = "O(1) memory.fill zero-wipe"; // a literal codegen string, not prose`, // L1 → masked → NOT flagged
  `foo(); // O(1) memory.fill zero-wipe`,                                            // L2 → comment prose → MUST flag
].join("\n") + "\n");
const oc = JSON.parse(spawnSync(process.execPath,
  [join(SCRIPTS, "audit-overclaim-phrases.mjs"), "--json", "--root", tmp8],
  { encoding: "utf8" }).stdout);
const ocIn = (suffix) => oc.findings.filter((f) => f.file.endsWith(suffix));

test("overclaim-phrases: catches 'O(1) memory.fill(0) zero-wipe' in a doc", () => {
  const hit = ocIn("doc.md").find((f) => f.line === 2);
  assert.ok(hit, "the O(1) memory.fill zero-wipe line is flagged");
  assert.equal(hit.boost, "O(1)");
  assert.equal(hit.target, "memory.fill");
});

test("overclaim-phrases: passes the approved 'one atomic memory.fill (Θ(arena-size) work)' phrasing", () => {
  assert.ok(!oc.findings.some((f) => f.file.endsWith("doc.md") && f.line === 3), "approved-phrasing line is NOT flagged");
});

test("overclaim-phrases: a correction line (O(arena-size), not 'O(1)') is exempt despite co-occurrence", () => {
  assert.ok(!oc.findings.some((f) => f.file.endsWith("doc.md") && f.line === 4), "the correction line is exempt");
});

test("overclaim-phrases: caught in a // comment but masked inside a string literal", () => {
  assert.ok(ocIn("mod.ts").some((f) => f.line === 2), "comment prose is flagged");
  assert.ok(!ocIn("mod.ts").some((f) => f.line === 1), "string-literal codegen is masked, not flagged");
});

test("overclaim-phrases: the fixture yields exactly the two intended violations", () => {
  assert.equal(oc.violations, 2);
});

// ── FUNGI-EFFECT-CANON: effect-vocabulary single-source-of-truth gate ──────────
// A crafted fixture with a deliberate `bitmask ⊄ canonical` drift proves the audit
// DETECTS it; a consistent fixture proves no false-positive; and the REAL repo is
// asserted internally consistent (regression guard for the 2026-07-01 reconciliation
// — if anyone re-adds an effect to the bitmask/registry without CANONICAL_EFFECTS,
// or vice-versa, this goes red).
const tmp9 = mkdtempSync(join(tmpdir(), "fungi-effcanon-"));
after(() => { try { rmSync(tmp9, { recursive: true, force: true }); } catch { /* best effort */ } });
const ec9 = join(tmp9, "packages-galerina", "galerina-core-compiler", "src");
mkdirSync(ec9, { recursive: true });
const writeEffFixture = (canon, flagNames) => {
  writeFileSync(join(ec9, "effect-checker.ts"), [
    `const CANONICAL_EFFECTS = new Set([`,
    ...canon.map((e) => `  "${e}",`),
    `]);`,
    `const EFFECT_NAME_ALIASES: ReadonlyMap<string, string> = new Map([`,
    `  ["db.read", "database.read"],`,
    `]);`,
    `const BROAD_EFFECT_ALIASES: ReadonlySet<string> = new Set(["database"]);`,
    `const SECURE_REQUIRED_EFFECTS = new Set(["database.write"]);`,
    `const PURE_FORBIDDEN_EFFECTS = new Set(["database.read", "database.write"]);`,
    `export const EFFECT_REGISTRY: Readonly<Record<string, readonly string[]>> = {`,
    `  "database.find": ["database.read"],`,
    `};`,
  ].join("\n") + "\n");
  writeFileSync(join(ec9, "type-registry.ts"), [
    `const EFFECT_NAME_TO_FLAG: ReadonlyMap<string, number> = new Map([`,
    ...flagNames.map((n) => `  ["${n}", 1],`),
    `]);`,
  ].join("\n") + "\n");
};
const runCanon = (root) => JSON.parse(spawnSync(process.execPath,
  [join(SCRIPTS, "audit-effect-canonicality.mjs"), "--root", root, "--json"],
  { encoding: "utf8" }).stdout);

test("effect-canonicality: DETECTS a bitmask name absent from canonical (C1) and blocks", () => {
  writeEffFixture(["database.read", "database.write"], ["database.read", "secret.access"]);
  const j = runCanon(tmp9);
  const c1 = j.internal.find((f) => f.check.startsWith("C1"));
  assert.ok(c1, "C1 raised: secret.access is in the flag map but not canonical/aliased");
  assert.ok(c1.items.includes("secret.access"), "the drifted name is reported");
  assert.ok(j.blockingCount > 0, "an internal drift is blocking by default");
});

test("effect-canonicality: a consistent fixture has 0 internal findings (no false-positive)", () => {
  writeEffFixture(["database.read", "database.write", "secret.access"], ["database.read", "secret.access"]);
  const j = runCanon(tmp9);
  assert.equal(j.internal.length, 0, "flag map ⊆ canonical ⇒ no internal drift");
});

test("effect-canonicality: the REAL repo effect tables are single-source consistent (regression guard)", () => {
  const j = JSON.parse(spawnSync(process.execPath,
    [join(SCRIPTS, "audit-effect-canonicality.mjs"), "--json"],
    { cwd: SCRIPTS, encoding: "utf8" }).stdout);
  assert.equal(j.internal.length, 0,
    `internal effect tables have drifted: ${JSON.stringify(j.internal, null, 2)}`);
});

// ── audit-muted-diagnostics: fail-open gate for silenced security/governance codes ──
// A fixture with an UN-allowlisted mode-gated SECURITY code proves detection; the REAL repo
// is asserted to have NO silently-muted security/governance codes (regression guard).
const tmp10 = mkdtempSync(join(tmpdir(), "fungi-muted-"));
after(() => { try { rmSync(tmp10, { recursive: true, force: true }); } catch { /* best effort */ } });
const mSrc = join(tmp10, "packages-galerina", "galerina-core-compiler", "src");
mkdirSync(mSrc, { recursive: true });
writeFileSync(join(mSrc, "x.ts"), [
  `export function f(mode) {`,
  `  diagnostics.push({`,
  `    code: "FUNGI-SECRET-999",`,
  `    name: "FixtureSecretMute",`,
  `    severity: mode === "production" ? "error" : "warning",`,  // mode-gated SECURITY code, not allowlisted
  `  });`,
  `}`,
].join("\n") + "\n");
const runMuted = (root) => JSON.parse(spawnSync(process.execPath,
  [join(SCRIPTS, "audit-muted-diagnostics.mjs"), "--root", root, "--json"],
  { encoding: "utf8" }).stdout);

test("muted-diagnostics: DETECTS an un-allowlisted mode-gated SECURITY code and blocks", () => {
  const j = runMuted(tmp10);
  assert.ok(j.violations.some((v) => v.code === "FUNGI-SECRET-999"), "the un-reviewed secret mute is flagged");
  assert.ok(j.blocking > 0, "an un-allowlisted security mute is blocking");
});

test("muted-diagnostics: the REAL repo has NO silently-muted security/governance codes (regression guard)", () => {
  const j = JSON.parse(spawnSync(process.execPath,
    [join(SCRIPTS, "audit-muted-diagnostics.mjs"), "--json"],
    { cwd: SCRIPTS, encoding: "utf8" }).stdout);
  assert.equal(j.blocking, 0,
    `security/governance codes muted without review: ${JSON.stringify([...j.violations, ...j.suppressViolations], null, 2)}`);
});
