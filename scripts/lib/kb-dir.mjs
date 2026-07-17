// =============================================================================
// kb-dir.mjs — one place that answers "where is the KB, and is it actually here?"
// =============================================================================
// WHY THIS EXISTS. Galerina is PUBLIC; the KB (ZTF-Knowledge-Bases) is PRIVATE. Several audits read
// KB docs, and each resolved the path itself — five copies at last count (kb-index.mjs:24,
// audit-doc-drift.mjs:35, audit-diagnostic-doc-drift.mjs:34, galerina-devtools-kb-graph/src/cli.ts:27,
// galerina-core-compiler/tests/diagnostic-namespace.test.mjs:17) — and they had ALREADY diverged:
// kb-index resolves against the repo ROOT, audit-diagnostic-doc-drift against process.cwd(). Identical
// only while cwd == repo root, which is exactly the kind of "true today" that rots silently.
//
// This module is the one place to migrate those to. It does NOT retrofit them (that is a separate,
// reviewable step) — it exists so the NEXT reader has somewhere correct to go, and so the umbrella's
// cross-repo skip decision is not a sixth divergent copy.
//
// ★ THE DISTINCTION THIS MODULE IS FOR — and it is the whole point:
//
//     resolveKbDir()   → where the KB WOULD be          (a path; always answers)
//     kbCorpusPresent() → whether the KB IS READABLE     (a fact; requires the disk)
//
// A path is not a corpus. `secrets.ZTF_KB_READ_TOKEN != ''` is not a readable KB either — that exact
// conflation (presence-of-a-name published as capability) is what kept `conventions` red for 8 days:
// the CI's kb-preflight proved a secret was SET and every job downstream treated that as "we can read
// the KB". The token had never worked. Presence is not capability. Ask for the fact you need.
//
// Usage:  import { resolveKbDir, kbCorpusPresent } from "./lib/kb-dir.mjs"
//         node scripts/lib/kb-dir.mjs --self-test
// =============================================================================
import { existsSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** The canonical marker doc — if this is not readable, the corpus is not usable for doc audits. */
export const KB_MARKER = "compiler-diagnostics.md";

/**
 * Where the KB WOULD be. Always returns a path; says nothing about whether it exists.
 *
 * Resolution order (matches kb-index.mjs, the oldest and most-cited copy):
 *   1. GALERINA_KB_DIR — explicit override (CI, git worktrees where the sibling is not adjacent)
 *   2. <root>/../ZTF-Knowledge-Bases — the sibling checkout
 *
 * `root` defaults to process.cwd() because every caller documents "run from repo root"; pass it
 * explicitly when you cannot guarantee that.
 */
export function resolveKbDir({ env = process.env, root = process.cwd() } = {}) {
  return env.GALERINA_KB_DIR ? resolve(env.GALERINA_KB_DIR) : join(root, "..", "ZTF-Knowledge-Bases");
}

/**
 * Is the KB corpus ACTUALLY readable here? This is the question callers almost always mean.
 *
 * Deliberately checks BOTH that the directory lists AND that the marker doc is in it. A directory that
 * exists but is empty (a failed/partial checkout, an unpopulated submodule, a stale mount) is the
 * dangerous case: it reads as "present" to an existsSync and then every doc audit scans nothing and
 * reports a serene zero. That is a fail-open wearing a green.
 */
export function kbCorpusPresent({ env = process.env, root = process.cwd(), dir = null } = {}) {
  const kb = dir ?? resolveKbDir({ env, root });
  try {
    readdirSync(kb);
  } catch {
    return false;
  }
  return existsSync(join(kb, KB_MARKER));
}

// ── self-test ────────────────────────────────────────────────────────────────
// Lives in scripts/tests/kb-dir.test.mjs too — the meta-gate (audit-gate-selftests) scans audit-*/lint-*
// only, so a LIB's --self-test is outside its surface and would never run (RD-0452's own lesson).

function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "kb-dir-"));

  const emptyKb = join(tmp, "empty-kb");
  mkdirSync(emptyKb);
  const realKb = join(tmp, "real-kb");
  mkdirSync(realKb);
  writeFileSync(join(realKb, KB_MARKER), "# codes\n");

  const checks = [
    ["GALERINA_KB_DIR overrides the sibling default",
      resolveKbDir({ env: { GALERINA_KB_DIR: realKb }, root: "/repo" }) === resolve(realKb)],
    ["without the override it resolves to the sibling, relative to root",
      resolveKbDir({ env: {}, root: join("/repo", "Galerina") }) === join("/repo", "Galerina", "..", "ZTF-Knowledge-Bases")],
    ["resolveKbDir answers even when nothing is there (a path is not a corpus)",
      typeof resolveKbDir({ env: { GALERINA_KB_DIR: join(tmp, "nope") } }) === "string"],

    ["a real corpus is PRESENT", kbCorpusPresent({ env: { GALERINA_KB_DIR: realKb } }) === true],
    ["a missing dir is ABSENT", kbCorpusPresent({ env: { GALERINA_KB_DIR: join(tmp, "nope") } }) === false],
    // ★ the case the whole module exists for: an existsSync would call this "present".
    ["an EMPTY dir is ABSENT — a partial checkout must not read as a corpus",
      kbCorpusPresent({ env: { GALERINA_KB_DIR: emptyKb } }) === false],
  ];

  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("\n  ❌ kb-dir self-test FAILED"); process.exit(1); }
  console.log("\n  kb-dir self-test: a path is not a corpus, and an empty dir is not a corpus ✅");
  process.exit(0);
}

if (process.argv.includes("--self-test")) selfTest();
