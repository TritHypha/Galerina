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
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", shell: false, windowsHide: true });

export function isDirectRun() {
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string" || argv1.length === 0) return false;
  return resolve(fileURLToPath(import.meta.url)) === resolve(argv1);
}

export function rebrandContent(s) {
  return s.split("tmf").join("spore").split("Tmf").join("Spore").split("TMF").join("SPORE");
}

export function admitRebrandRel(rel) {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 4096) return false;
  if (rel.includes("\0") || rel.startsWith("-") || rel.startsWith("/") || rel.startsWith("\\")) return false;
  if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return false;
  const parts = rel.split(/[\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  return true;
}

export function gitMvArgs(fromRel, toRel) {
  if (!admitRebrandRel(fromRel) || !admitRebrandRel(toRel)) {
    throw new Error("ERR_REBRAND_PATH");
  }
  return ["mv", "--", fromRel, toRel];
}

const isBinary = (b) => b.subarray(0, 8000).includes(0);

export function runRebrand() {
  const listed = git("ls-files", "-z", "--").split("\0").map((x) => x.trim()).filter(Boolean);
  const files = listed.filter(admitRebrandRel);
  let cContent = 0, tContent = 0;
  for (const rel of files) {
    const abs = join(ROOT, rel);
    let st;
    try { st = lstatSync(abs); } catch { continue; }
    if (st.isSymbolicLink() || !st.isFile()) continue;
    const buf = readFileSync(abs);
    if (isBinary(buf)) continue;
    const t0 = buf.toString("utf8");
    const t = rebrandContent(t0);
    if (t !== t0) { writeFileSync(abs, t); cContent++; tContent += t0.split(/tmf/i).length - 1; }
  }

  let cMoved = 0;
  for (const rel of files) {
    if (!/tmf/i.test(rel)) continue;
    const newRel = rebrandContent(rel);
    if (newRel === rel) continue;
    if (!admitRebrandRel(newRel)) continue;
    mkdirSync(dirname(join(ROOT, newRel)), { recursive: true });
    git(...gitMvArgs(rel, newRel));
    cMoved++;
    console.log(`  mv ${rel} -> ${newRel}`);
  }

  console.log(`\n  rebrand tmf->spore: ${cContent} file(s) rewritten (${tContent} token(s)), ${cMoved} file(s) renamed.`);
  console.log("  Preserved: tmx/TMX, .spore, TriMerkle. NEXT: rebuild + tests -> re-baseline golden vectors for the renamed crypto labels.");
}

if (isDirectRun()) runRebrand();
