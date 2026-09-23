#!/usr/bin/env node
// fix-logicn-brand.mjs — targeted LogicN->Galerina completion for the residual
// brand stragglers the .lln/.spore->.fungi sweep left (comments, docstrings,
// intent{} strings, string literals, package metadata). Reads brand-audit JSON
// on stdin; fixes only STRAGGLER text files (NOT notes/, NOT binaries, NOT the
// root-signed/allow-listed set). Replaces the WHOLE token `logicn` (never
// `galerin`, so it cannot recreate the `galerinaa` typo). Dry-run unless --write.
//   node scripts/brand-audit.mjs . --json | node scripts/fix-logicn-brand.mjs [--write]
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_STDIN_BYTES = 1_048_576;
const MAX_FILE_BYTES = 1_048_576;

export function isDirectRun() {
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string" || argv1.length === 0) return false;
  return resolve(fileURLToPath(import.meta.url)) === resolve(argv1);
}

export function admitBrandRel(rel) {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 4096) return false;
  if (rel.includes("\0") || rel.startsWith("-") || rel.startsWith("/") || rel.startsWith("\\")) return false;
  if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return false;
  const parts = rel.split(/[\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) return false;
  return true;
}

export function parseBrandAudit(raw) {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAX_STDIN_BYTES) {
    throw new Error("ERR_BRAND_AUDIT_SIZE");
  }
  const audit = JSON.parse(raw);
  if (audit === null || typeof audit !== "object" || Array.isArray(audit) || audit.findings == null) {
    throw new Error("ERR_BRAND_AUDIT_SHAPE");
  }
  return audit;
}

const SKIP_EXT = /\.(pdb|exe|dll|so|dylib|o|a|lib|node|wasm|lindex)$/i;

export function brandRelTargets(audit) {
  const stragglers = Array.isArray(audit?.findings?.STRAGGLER) ? audit.findings.STRAGGLER : [];
  const nulFiles = new Set(stragglers.filter((f) => f && f.nul).map((f) => f.file));
  return [...new Set(stragglers.map((f) => f && f.file))]
    .filter((f) => typeof f === "string")
    .filter((f) => admitBrandRel(f))
    .filter((f) => !f.startsWith("notes/"))
    .filter((f) => !SKIP_EXT.test(f))
    .filter((f) => !nulFiles.has(f))
    .filter((f) => !/(brand-audit|fix-logicn-brand)\.mjs$/.test(f))
    .filter((f) => !/ClaragonwwwLOtest/.test(f));
}

export function runFixLogicnBrand(audit, { write = false, stdinRaw = "" } = {}) {
  parseBrandAudit(typeof stdinRaw === "string" && stdinRaw.length > 0 ? stdinRaw : JSON.stringify(audit));
  const files = brandRelTargets(audit);
  let changed = 0, total = 0;
  for (const rel of files) {
    const abs = resolve(ROOT, rel);
    const fromRoot = relative(ROOT, abs);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) continue;
    let st;
    try { st = lstatSync(abs); } catch { continue; }
    if (st.isSymbolicLink() || !st.isFile() || st.size > MAX_FILE_BYTES) continue;
    let buf;
    try { buf = readFileSync(abs); } catch { continue; }
    if (buf.byteLength > MAX_FILE_BYTES) continue;
    const orig = buf.toString("latin1");
    const next = orig
      .replace(/LogicN/g, "Galerina")
      .replace(/LOGICN/g, "GALERINA")
      .replace(/Logicn/g, "Galerina")
      .replace(/logicn/g, "galerina")
      .replace(/\bLLN-([A-Z0-9])/g, "FUNGI-$1")
      .replace(/\.lln\b/g, ".fungi");
    if (next !== orig) {
      const c = (orig.match(/logicn/gi) || []).length
        + (orig.match(/\bLLN-[A-Z0-9]/g) || []).length
        + (orig.match(/\.lln\b/g) || []).length;
      total += c; changed++;
      console.log(`${write ? "FIXED " : "would fix"}  ${String(c).padStart(2)}  ${rel}`);
      if (write) writeFileSync(abs, Buffer.from(next, "latin1"));
    }
  }
  console.log(`\n${changed} files, ${total} occurrences ${write ? "FIXED" : "(DRY-RUN — pass --write to apply)"}`);
  return { changed, total };
}

if (isDirectRun()) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const audit = parseBrandAudit(raw);
  runFixLogicnBrand(audit, { write: process.argv.includes("--write"), stdinRaw: raw });
}
