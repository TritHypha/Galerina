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
