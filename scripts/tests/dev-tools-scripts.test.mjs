// Fixture-tree tests for the dev-tool scripts (code-index · gen-code-registry · audit-coverage).
// Subprocess + crafted tmp workspace = tests the REAL end-to-end behavior without refactoring the scripts.
// Locks the review-wn8v30euh scanner fixes: trailing-letter, const-id emit, multi-line throw, comment/
// type-decl exclusion, and the conservative dead-detection.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── fixture workspace: one crafted diagnostics file under a fake package ──
const tmp = mkdtempSync(join(tmpdir(), "lln-devtools-"));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });
const src = join(tmp, "packages-logicn", "fx", "src");
mkdirSync(src, { recursive: true });
writeFileSync(join(src, "diag.ts"), [
  `export const LLN_FX_001 = { code: "LLN-FX-001", name: "FxDefinedNeverUsed", severity: "error" };`,
  `export const ERR_FX_THING = "ERR_FX_THING";`,
  `export const ERR_FX_THROWN = "ERR_FX_THROWN";`,
  `export function emitInline(d){`,
  `  d.push({`,
  `    code: "LLN-FX-002",`,
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
  `// a comment mentioning LLN-FX-099 must be a ref, not an emit/def`,
  `export const LLN_FX_005 = { code: "LLN-FX-005", name: "FxFive", severity: "error" };`,
  `export const LLN_FX_005B = { code: "LLN-FX-005B", name: "FxFiveB", severity: "error" };`,
  `export interface FxShape { readonly code: "LLN-FX-050"; }`,
  `export function useFive(d){ d.push({ ...LLN_FX_005 }); d.push({ ...LLN_FX_005B }); }`,
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
  assert.ok(byCode["LLN-FX-005"], "LLN-FX-005 indexed");
  assert.ok(byCode["LLN-FX-005B"], "LLN-FX-005B indexed distinctly (not truncated to 005)");
});

test("code-index: const-identifier emit resolved (code: ERR_FX_THING)", () => {
  assert.ok(emits("ERR_FX_THING") > 0, "ERR_FX_THING emitted via a const-id `code:` reference");
});

test("code-index: multi-line `throw new FxError(\\n ERR_FX_THROWN,…)` resolved", () => {
  assert.ok(emits("ERR_FX_THROWN") > 0, "ERR_FX_THROWN emitted via the windowed constructor throw");
});

test("code-index: inline push emit (LLN-FX-002)", () => {
  assert.ok(emits("LLN-FX-002") > 0);
});

test("code-index: a comment mention is a ref, NOT an emit/def (LLN-FX-099)", () => {
  const c = byCode["LLN-FX-099"];
  assert.ok(c, "still indexed (as a ref)");
  assert.equal(emits("LLN-FX-099"), 0);
  assert.equal(defs("LLN-FX-099"), 0);
});

test("code-index: a TS type position is NOT an emit/def (readonly code: LLN-FX-050)", () => {
  assert.equal(emits("LLN-FX-050"), 0);
  assert.equal(defs("LLN-FX-050"), 0);
});

test("gen-code-registry: defined-AND-unreferenced is DEAD (LLN-FX-001)", () => {
  assert.equal(status["LLN-FX-001"], "dead", "LLN-FX-001 is defined but never used → RESERVED");
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
const tmp2 = mkdtempSync(join(tmpdir(), "lln-docdrift-"));
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

const drift = JSON.parse(run2("audit-doc-drift.mjs", ["--json"]).stdout);
function run2(script, args = []) { return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: tmp2, encoding: "utf8" }); }

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
