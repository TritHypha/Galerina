#!/usr/bin/env node
// fix-logicn-brand.mjs — targeted LogicN->Galerina completion for the residual
// brand stragglers the .lln/.spore->.fungi sweep left (comments, docstrings,
// intent{} strings, string literals, package metadata). Reads brand-audit JSON
// on stdin; fixes only STRAGGLER text files (NOT notes/, NOT binaries, NOT the
// root-signed/allow-listed set). Replaces the WHOLE token `logicn` (never
// `galerin`, so it cannot recreate the `galerinaa` typo). Dry-run unless --write.
//   node scripts/brand-audit.mjs . --json | node scripts/fix-logicn-brand.mjs [--write]
import { readFileSync, writeFileSync } from "node:fs";
const WRITE = process.argv.includes("--write");
const audit = JSON.parse(readFileSync(0, "utf8"));
const SKIP_EXT = /\.(pdb|exe|dll|so|dylib|o|a|lib|node|wasm|lindex)$/i;
const nulFiles = new Set(audit.findings.STRAGGLER.filter((f) => f.nul).map((f) => f.file));
const files = [...new Set(audit.findings.STRAGGLER.map((f) => f.file))]
  .filter((f) => !f.startsWith("notes/"))          // historical R&D discussion — leave verbatim
  .filter((f) => !SKIP_EXT.test(f))                // compiled/regenerable binaries — rebuild, don't edit
  .filter((f) => !nulFiles.has(f))                 // any NUL-byte (binary) file — regenerable, never edit
  .filter((f) => !/(brand-audit|fix-logicn-brand)\.mjs$/.test(f)) // the audit tools contain the tokens
  .filter((f) => !/ClaragonwwwLOtest/.test(f));    // tracked junk — removed separately
let changed = 0, total = 0;
for (const rel of files) {
  let buf;
  try { buf = readFileSync(rel); } catch { continue; }
  const orig = buf.toString("latin1");             // byte-exact (preserves any non-ASCII verbatim)
  const next = orig
    .replace(/LogicN/g, "Galerina")
    .replace(/LOGICN/g, "GALERINA")
    .replace(/Logicn/g, "Galerina")
    .replace(/logicn/g, "galerina")
    .replace(/\bLLN-([A-Z0-9])/g, "FUNGI-$1")       // diagnostic codes LLN-* -> FUNGI-* (preserve the code)
    .replace(/\.lln\b/g, ".fungi");                 // old SOURCE ext refs -> .fungi
    // NB: .spore is INTENTIONALLY untouched — it is the current TritMesh DB format, not old branding.
  if (next !== orig) {
    const c = (orig.match(/logicn/gi) || []).length
      + (orig.match(/\bLLN-[A-Z0-9]/g) || []).length
      + (orig.match(/\.lln\b/g) || []).length;
    total += c; changed++;
    console.log(`${WRITE ? "FIXED " : "would fix"}  ${String(c).padStart(2)}  ${rel}`);
    if (WRITE) writeFileSync(rel, Buffer.from(next, "latin1"));
  }
}
console.log(`\n${changed} files, ${total} occurrences ${WRITE ? "FIXED" : "(DRY-RUN — pass --write to apply)"}`);
