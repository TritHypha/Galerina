// Fixture-tree tests for audit-corpus-effect-names.mjs (the CG-6 corpus gate).
// A crafted --root workspace carries a mini effect-checker.ts (the SoT tables the
// scanner extracts) + .fungi files exercising every classification: canonical,
// broad alias (warn), non-broad alias (block), deny-only (block), unknown (block),
// keyword forms (`allow X`), tests/-scoped negative fixtures (report-only).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

const tmp = mkdtempSync(join(tmpdir(), "fungi-corpus-effects-"));
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// Mini SoT the scanner extracts (shapes mirror effect-checker.ts).
const CHECKER_DIR = join(tmp, "packages-galerina", "galerina-core-compiler", "src");
mkdirSync(CHECKER_DIR, { recursive: true });
writeFileSync(join(CHECKER_DIR, "effect-checker.ts"), [
  `const CANONICAL_EFFECTS = new Set([`,
  `  "good.effect", "audit.write",`,
  `]);`,
  `const EFFECT_NAME_ALIASES: ReadonlyMap<string, string> = new Map([`,
  `  ["old.name", "good.effect"],`,
  `  ["broadish", "good.effect"],`,
  `]);`,
  `const BROAD_EFFECT_ALIASES: ReadonlySet<string> = new Set([`,
  `  "broadish",`,
  `]);`,
  `const DENY_ONLY_EFFECTS: ReadonlySet<string> = new Set([`,
  `  "evil.op",`,
  `]);`,
].join("\n"));

function fungi(rel, effectsClause) {
  const p = join(tmp, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, [
    "secure flow f(x: Int) -> Int",
    "contract {",
    `  intent "corpus fixture"`,
    `  effects { ${effectsClause} }`,
    "}",
    "{ return x }",
    "",
  ].join("\n"));
}

function run() {
  return spawnSync("node", [join(SCRIPTS, "audit-corpus-effect-names.mjs"), "--root", tmp, "--json"],
    { encoding: "utf8", timeout: 60_000, shell: isWin });
}

test("clean corpus (canonical + keyword form + broad alias + tests/ fixtures) passes", () => {
  fungi("examples/clean.fungi", "good.effect");
  fungi("examples/keyworded.fungi", "allow good.effect, allow audit.write");
  fungi("examples/nudged.fungi", "broadish");
  fungi("examples/tests/negative.fungi", "totally.bogus"); // tests/ scope = report-only
  const r = run();
  assert.equal(r.status, 0, `expected clean: ${r.stdout}`);
  const out = JSON.parse(r.stdout);
  assert.ok(out.findings.some(f => f.class === "broad-alias" && f.name === "broadish"), "broad alias reported as warn");
  assert.ok(out.findings.some(f => f.reportOnly && f.name === "totally.bogus"), "tests/ fixture is report-only");
});

test("an unknown name in the teaching corpus BLOCKS", () => {
  fungi("examples/bad-unknown.fungi", "invented.name");
  const r = run();
  assert.equal(r.status, 1, "unknown name must block");
  rmSync(join(tmp, "examples", "bad-unknown.fungi"));
});

test("a deny-only name in the teaching corpus BLOCKS", () => {
  fungi("examples/bad-deny.fungi", "evil.op");
  const r = run();
  assert.equal(r.status, 1, "deny-only name must block");
  rmSync(join(tmp, "examples", "bad-deny.fungi"));
});

test("a non-broad alias in the teaching corpus BLOCKS (production rejects it)", () => {
  fungi("examples/bad-alias.fungi", "old.name");
  const r = run();
  assert.equal(r.status, 1, "non-broad alias must block");
  rmSync(join(tmp, "examples", "bad-alias.fungi"));
});
