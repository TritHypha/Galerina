#!/usr/bin/env node
// lint-no-secret-egress.mjs — CI gate for the edit/read-back boundary (design doc Part 5).
//
// FAILS (exit 1) if the decrypt-path source contains:
//   1. any NETWORK SINK (http/https/net/dgram/fetch/WebSocket) — get is local-only; there is NO
//      network read-back endpoint. (The custody-anchor unseal in anchor.ts is the only allowed
//      network surface, and it is a FETCHER CALLBACK injected by the host — this package ships
//      no transport, so even that must not appear as a literal net import here.)
//   2. any PLAINTEXT-TO-DISK on the secret path — createWriteStream/appendFile of a decrypted
//      value, a /tmp path, a .swp file, a FIFO/mkfifo, or a $EDITOR spawn.
//      (The ONE allowed disk write is io.atomicWriteCiphertext, which writes SEALED bytes only.)
//   3. any SECRET-IN-ARGV path — STRUCTURALLY: ANY read of `process.argv` outside the single
//      sanctioned entry point (`process.argv.slice(2)` feeding parseArgs). This is no longer a
//      keyword/proximity heuristic (which could miss a secret bound from argv across two lines or
//      via a generically-named var — leak-hunter #5); argv must enter at exactly one audited choke.
//
// This is a structural grep gate, intentionally conservative. Allowed exceptions are explicitly
// whitelisted by an inline `// lint-allow: <reason>` marker on the same line.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");

const NET_SINKS = [
  /\bfrom\s+["']node:(?:http|https|net|dgram|tls|http2)["']/,
  /\brequire\(\s*["']node:?(?:http|https|net|dgram|tls|http2)["']\s*\)/,
  /\bfetch\s*\(/,
  /\bnew\s+WebSocket\b/,
  /\bXMLHttpRequest\b/,
];

const PLAINTEXT_DISK = [
  /\bcreateWriteStream\s*\(/,
  /\bappendFileSync?\s*\(/,
  /\bmkfifo\b/,
  /\bFIFO\b/i,
  /\.swp\b/,
  /\$EDITOR\b/,
  /process\.env\.EDITOR\b/,
  /\/tmp\//,
  /\btmpdir\s*\(/,
  /\bmkdtemp\b/,
];

// writeFile is allowed ONLY inside io.ts (atomicWriteCiphertext, ciphertext-only).
const WRITEFILE = /\bwriteFileSync?\s*\(/;

// SECRET-IN-ARGV — structural, NOT keyword/proximity. The old gate only fired when `process.argv`
// and a value/secret keyword co-occurred within 40 chars on ONE line, giving false assurance: a
// regression binding a secret from argv across two lines, or via a generically-named var, would
// slip through (leak-hunter #5). New rule: flag ANY read of `process.argv` anywhere in src EXCEPT
// the single allow-listed entry point (the CLI's `process.argv.slice(2)` feeding parseArgs). Every
// other argv touch must carry an explicit `// lint-allow:` marker with a reason. This makes
// "no secret-in-argv" structurally enforced — argv enters at exactly one audited choke point.
const ARGV_ANY = /\bprocess\.argv\b/;
// The ONLY sanctioned argv read: the top-level slice that hands argv to parseArgs. Anything else
// (indexing argv into a var, re-reading argv deeper in the call graph) is a violation.
const ARGV_ALLOWED_ENTRY = /\bprocess\.argv\.slice\s*\(\s*2\s*\)/;

let violations = 0;
function fail(file, line, n, why) {
  console.error(`VIOLATION [${why}] ${file}:${n}: ${line.trim()}`);
  violations += 1;
}

/**
 * Strip comment + string-literal text so the gate scans CODE only — the doc comments in this
 * package deliberately spell out the forbidden patterns ("NO $EDITOR / .swp / /tmp"), and those
 * descriptions must not trip the gate. We blank out: line comments (// ...), block comments
 * (/* ... *\/ over a line), and the contents of string/template literals.
 */
/**
 * Strip COMMENTS only — the doc comments in this package deliberately spell out the forbidden
 * patterns ("NO $EDITOR / .swp / /tmp"), and those descriptions must not trip the gate. Import
 * specifiers ("node:https") are real CODE, so we KEEP string literals here: the NET_SINKS regexes
 * match `from "node:http"` and need the specifier intact.
 */
function stripComments(line) {
  let s = line;
  s = s.replace(/\/\/.*$/, "");                       // line comments
  if (/^\s*\*/.test(s) || /^\s*\/\*/.test(s)) s = ""; // leading-* / /* JSDoc block bodies
  return s;
}

/** Additionally blank string/template contents — used only for the PLAINTEXT_DISK literal scan
 *  so a forbidden path inside a *message string* (not a real fs call) does not false-positive. */
function blankStrings(line) {
  return line
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

function scan(file) {
  const text = readFileSync(file, "utf8");
  const base = file.split(/[\\/]/).pop();
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const n = i + 1;
    if (/\/\/\s*lint-allow:/.test(rawLine)) return; // explicit whitelist
    const code = stripComments(rawLine);              // strings PRESERVED (import specifiers are code)
    if (code.trim() === "") return;
    // net-sink: detect on code WITH strings (import specifiers / require args live in strings)
    for (const re of NET_SINKS) if (re.test(code)) fail(base, rawLine, n, "net-sink");
    // disk/argv/writeFile: detect on code WITHOUT string contents so message text can't trip it,
    // but a genuine `os.tmpdir()` / `createWriteStream(...)` call (outside strings) still matches.
    const noStr = blankStrings(code);
    for (const re of PLAINTEXT_DISK) if (re.test(noStr)) fail(base, rawLine, n, "plaintext-to-disk");
    // structural argv gate: ANY process.argv read except the one sanctioned slice(2) entry point.
    if (ARGV_ANY.test(noStr) && !ARGV_ALLOWED_ENTRY.test(noStr)) {
      fail(base, rawLine, n, "argv-read-outside-allowlist");
    }
    if (WRITEFILE.test(noStr) && base !== "io.ts") fail(base, rawLine, n, "writeFile-outside-ciphertext-sink");
  });
}

function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (extname(p) === ".ts") scan(p);
  }
}

walk(srcDir);

if (violations > 0) {
  console.error(`\nlint-no-secret-egress: FAIL (${violations} violation(s))`);
  process.exit(1);
}
console.log("lint-no-secret-egress: PASS (no net sink, no plaintext-to-disk, no process.argv read outside the single sanctioned slice(2) entry point)");
