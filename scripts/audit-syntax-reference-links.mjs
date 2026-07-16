#!/usr/bin/env node
/**
 * audit-syntax-reference-links.mjs — fail-closed gate for the language reference docs.
 *
 * docs/language/fungi/SYNTAX-REFERENCE.md and DO-DONT-TERNARY.md are only trustworthy if every
 * example they link actually type-checks. This gate extracts every markdown link to a `.fungi` /
 * `.gate` / `.md` file and re-verifies it:
 *   • `.fungi`  → `galerina check` must exit 0 with NO positive error count (a positive example must
 *                 be clean; the reference links positive demonstrations only).
 *   • `.gate`   → the file must exist (the `.gate` reference checker lives in the ZT workspace; a prod
 *                 `galerina check` fail-closes on `.gate`, so existence is the check here).
 *   • `.md`     → the linked doc must exist.
 * A dangling link, or a `.fungi` example that no longer checks clean, is a RED gate — the reference
 * cannot silently rot. Zero-dep; spawns the same `galerina check` a developer runs.
 *
 * Exit 0 = every linked example verifies. Exit 1 = at least one link is broken or fails.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GALERINA = join(ROOT, "galerina.mjs");
const DOCS = [
  "docs/language/fungi/SYNTAX-REFERENCE.md",
  "docs/language/fungi/DO-DONT-TERNARY.md",
  "docs/reference/cost-model-nesting.md", // RD-0395: every linked cost-model example must stay check-clean
];
const LINK_RE = /\]\(([^)]+\.(?:fungi|gate|md))\)/g;

let checked = 0, failed = 0;
const seen = new Set();

for (const docRel of DOCS) {
  const docAbs = join(ROOT, docRel);
  if (!existsSync(docAbs)) { console.error(`  FAIL  missing doc: ${docRel} (fail-closed)`); failed += 1; continue; }
  const docDir = dirname(docAbs);
  const src = readFileSync(docAbs, "utf8");
  for (const m of src.matchAll(LINK_RE)) {
    const linkAbs = resolve(docDir, m[1].split("#")[0]);
    const rel = relative(ROOT, linkAbs).replace(/\\/g, "/");
    if (seen.has(rel)) continue;               // de-dup: check each target once
    seen.add(rel);
    checked += 1;
    if (!existsSync(linkAbs)) { console.log(`  FAIL  ${rel}  →  dangling link (from ${docRel})`); failed += 1; continue; }
    if (rel.endsWith(".fungi")) {
      const r = spawnSync(process.execPath, [GALERINA, "check", rel], { cwd: ROOT, encoding: "utf8" });
      const out = (r.stdout ?? "") + (r.stderr ?? "");
      const ok = r.status === 0 && !/[1-9]\d* error/i.test(out);
      console.log(`  ${ok ? "OK  " : "FAIL"} ${rel}${ok ? "" : "  →  " + (out.trim().split("\n").pop() || "check failed")}`);
      if (!ok) failed += 1;
    } else {
      console.log(`  OK   ${rel}  (exists)`);   // .gate / .md — existence only
    }
  }
}

console.log(`\nsyntax-reference-links: ${checked - failed}/${checked} verified across ${DOCS.length} doc(s)`);
process.exit(failed === 0 ? 0 : 1);
