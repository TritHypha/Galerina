#!/usr/bin/env node
// rebrand-tmf-to-spore.mjs — case-aware rename of the RETIRED format name "tmf" -> "spore" across every
// git-tracked file (CONTENT) and every file/dir NAME. The `.tmf` container format was renamed to `.spore`;
// this finishes it: code identifiers (Tmf* -> Spore*), the crypto/wire domain-separation labels
// ("tmf-dem-kdf-v0" -> "spore-dem-kdf-v0" — a deliberate format RE-VERSION; golden vectors get re-baselined),
// the config env-var (GALERINA_ENVTMF_WRAP -> GALERINA_ENVSPORE_WRAP), spec/doc file names, and prose.
//
// PRESERVED automatically: `tmx`/`TMX` (TriMerkle-XOF — a distinct crypto primitive, NOT the format name),
// `.spore`, `TriMerkle` — none contain the substring "tmf"/"Tmf"/"TMF", so nothing touches them.
// Verified safe before running: no "tmf" occurs inside any hex/base64 data constant (hex golden vectors are
// [0-9a-f], cannot contain 't'/'m'/'f'-as-word), so a blind substring replace corrupts no data.
//
// Reliable by construction (not an ad-hoc grep): git ls-files = the complete tracked set; exact case-aware
// substring replacement (three disjoint cases); git mv = history-preserving. Skips binaries. Does NOT
// commit or push. Usage: node scripts/rebrand-tmf-to-spore.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WIN = process.platform === "win32";
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", shell: IS_WIN });

// Three disjoint cases: "tmf" (all-lower), "Tmf" (identifier), "TMF" (const/env). No mixed forms occur.
const rebrand = (s) => s.split("tmf").join("spore").split("Tmf").join("Spore").split("TMF").join("SPORE");

const files = git("ls-files").split("\n").map((x) => x.trim()).filter(Boolean);
const isBinary = (b) => b.subarray(0, 8000).includes(0);

// 1) Content rewrite across every tracked text file.
let cContent = 0, tContent = 0;
for (const rel of files) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const buf = readFileSync(abs);
  if (isBinary(buf)) continue;
  const t0 = buf.toString("utf8");
  const t = rebrand(t0);
  if (t !== t0) { writeFileSync(abs, t); cContent++; tContent += t0.split(/tmf/i).length - 1; }
}

// 2) File/dir renames — any tracked path containing "tmf" (git mv creates the renamed parent dir as needed).
let cMoved = 0;
for (const rel of files) {
  if (!/tmf/i.test(rel)) continue;
  const newRel = rebrand(rel);
  if (newRel === rel) continue;
  mkdirSync(dirname(join(ROOT, newRel)), { recursive: true });
  git("mv", rel, newRel);
  cMoved++;
  console.log(`  mv ${rel} -> ${newRel}`);
}

console.log(`\n  rebrand tmf->spore: ${cContent} file(s) rewritten (${tContent} token(s)), ${cMoved} file(s) renamed.`);
console.log("  Preserved: tmx/TMX, .spore, TriMerkle. NEXT: rebuild + tests -> re-baseline golden vectors for the renamed crypto labels.");
