#!/usr/bin/env node
// audit-oblivious.mjs — RD-0258 data-oblivious / constant-time DETECTOR for .fungi (2026-07-04).
//
// Flags SECRET-DEPENDENT control flow and comparison — the timing & speculative-execution (Spectre)
// side-channel class. This is the DETECTOR half of RD-0258 (owner chose "detector + design"): it makes the
// anti-pattern visible NOW without any language change. The compiler-enforced `@oblivious` lowering (evaluate
// all arms + oblivious mask-select) is a NEW-SYNTAX compiler change and stays OWNER-GATED — not built here.
//
// A "secret" here is a CONFIDENTIALITY-marked value: `protected let X`, `redacted let X`, or a value bound
// from `secret.read(...)`. (Taint is a separate INTEGRITY property — that is the taint-checker's job; a
// tainted value is untrusted *input*, not a *secret*, so branching on it is not a secret timing-leak.)
//
//   HIGH  secret-eq-compare  — `secretX == y` / `secretX != y` : a non-constant-time equality on a secret
//                              leaks it byte-by-byte via timing (classic password/token compare attack).
//                              FIX: a constant-time compare, never `==`/`!=` on a secret (RD-0258).
//   ADVISORY (shown with --extra; never drives the exit code):
//         secret-branch      — `if` / `unless` / `while` whose condition references a secret : the branch
//                              taken (and its timing / speculation) leaks the secret bit. FIX: evaluate both
//                              arms and oblivious-select on a mask so control flow is data-INDEPENDENT.
//         secret-match       — `match secretX { … }` : data-dependent dispatch on a secret.
//
// NOT a finding (kept high-signal): matches inside string literals / comments are masked out; any line
// carrying an inline `oblivious-allow` (optionally `oblivious-allow: <check-id>`) is exempt (use it for a
// value that is a policy boolean, not truly sensitive, or a compare you have proven constant-time). Only
// files under a `src/` dir OR the `examples/` corpus are scanned; tests / dist / build / node_modules skip.
//
//   node scripts/audit-oblivious.mjs                 → scan the .fungi corpus (HIGH tier)
//   node scripts/audit-oblivious.mjs --extra         → also list the advisory tier
//   node scripts/audit-oblivious.mjs --json          → machine-readable
//   node scripts/audit-oblivious.mjs --soft          → report-only (exit 0) — the phase-close wiring
//   node scripts/audit-oblivious.mjs --self-test     → prove every check fires AND stays silent on the good form
import { readdirSync, statSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ── mask a .fungi source down to CODE: blank every comment + string/template literal to spaces (newlines
// kept, so line numbers stay exact). A secret name hiding in a "…" string or a // comment must NOT match. ──
export function maskCodeOnly(src) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { let j = i; while (j < n && src[j] !== "\n") j++; blank(i, j); i = j; continue; }
    if (c === "/" && d === "*") { let j = i + 2; while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++; j = Math.min(n, j + 2); blank(i, j); i = j; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let j = i + 1;
      while (j < n && src[j] !== q) { if (src[j] === "\\") j += 2; else j++; }
      j = Math.min(n, j + 1); blank(i, j); i = j; continue;
    }
    i++;
  }
  return out.join("");
}

function lineIndex(text) {
  const lines = text.split(/\n/);
  const starts = [];
  let acc = 0;
  for (const l of lines) { starts.push(acc); acc += l.length + 1; }
  const lineOf = (off) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
    return lo;
  };
  return { lines, lineOf };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Confidentiality-marked bindings = the secret set. `secret.read(...)` may also appear inline in a condition.
const SECRET_DECL = [
  /\bprotected\s+let\s+([A-Za-z_]\w*)/g,
  /\bredacted\s+let\s+([A-Za-z_]\w*)/g,
  /\blet\s+([A-Za-z_]\w*)\s*=\s*[^\n;]*\bsecret\.read\b/g,
];

/** Findings for one already-masked .fungi doc → { high:[…], advisory:[…] }. `orig` supplies snippet + allow. */
export function findFindings(masked, orig = masked) {
  const { lines, lineOf } = lineIndex(orig);
  const exemptAt = (lineNo, id) => {
    const m = /oblivious-allow(?::\s*([\w-]+))?/.exec(lines[lineNo] ?? "");
    return m ? (m[1] === undefined || m[1] === id) : false;
  };
  const mk = (id, off, hint) => { const ln = lineOf(off); return exemptAt(ln, id) ? null : { check: id, line: ln + 1, hint, snippet: (lines[ln] ?? "").trim().slice(0, 120) }; };

  // 1. collect secret binding names
  const secretNames = new Set();
  for (const re of SECRET_DECL) { re.lastIndex = 0; for (const m of masked.matchAll(re)) if (m[1]) secretNames.add(m[1]); }

  const high = [], advisory = [];
  const push = (arr, f) => { if (f) arr.push(f); };
  const seen = new Set();
  const once = (arr, id, off, hint) => { const ln = lineOf(off); const k = `${id}:${ln}`; if (seen.has(k)) return; seen.add(k); push(arr, mk(id, off, hint)); };

  // build the per-secret probes (plus the inline secret.read(...) form)
  const operands = [...secretNames].map(esc);
  const secretTok = operands.length ? `(?:${operands.join("|")}|secret\\.read\\s*\\([^)]*\\))` : `secret\\.read\\s*\\([^)]*\\)`;

  // HIGH: secret-eq-compare — secret operand on either side of == / !=
  const eqRe = new RegExp(`\\b${secretTok}\\s*(?:==|!=)|(?:==|!=)\\s*${secretTok}`, "g");
  for (const m of masked.matchAll(eqRe)) once(high, "secret-eq-compare", m.index,
    "non-constant-time equality on a secret leaks it via timing — use a constant-time compare, never ==/!= on a secret (RD-0258)");

  // ADVISORY: secret-branch — an if/unless/while whose condition references a secret
  const branchRe = new RegExp(`\\b(?:if|unless|while)\\b[^\\n{]*\\b${secretTok}`, "g");
  for (const m of masked.matchAll(branchRe)) once(advisory, "secret-branch", m.index,
    "the branch taken (its timing + speculation) leaks the secret bit — evaluate both arms and oblivious mask-select so control flow is data-independent (RD-0258)");

  // ADVISORY: secret-match — a match whose subject references a secret
  const matchRe = new RegExp(`\\bmatch\\b[^\\n{]*\\b${secretTok}`, "g");
  for (const m of masked.matchAll(matchRe)) once(advisory, "secret-match", m.index,
    "data-dependent dispatch on a secret — the arm taken leaks the secret (RD-0258)");

  const bySort = (a, b) => a.line - b.line;
  return { high: high.sort(bySort), advisory: advisory.sort(bySort) };
}

// ── file walk: shipped/authored .fungi only ──
const SKIP_DIR = new Set(["node_modules", "dist", "build", ".graph", ".git", "coverage", "test-fixtures", "tests"]);
const SKIP_FILE = [".test.", ".spec."];

function walk(dir, acc) {
  let ents;
  try { ents = readdirSync(dir); } catch { return acc; }
  for (const e of ents) {
    if (SKIP_DIR.has(e) || e.startsWith(".")) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { walk(p, acc); continue; }
    if (!e.endsWith(".fungi")) continue;
    const norm = p.replace(/\\/g, "/");
    if (!/\/src\//.test(norm) && !/\/examples\//.test(norm)) continue; // shipped/authored .fungi only
    if (SKIP_FILE.some((s) => norm.includes(s))) continue;
    acc.push(p);
  }
  return acc;
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && process.argv.includes("--self-test")) {
  const R = (code) => findFindings(maskCodeOnly(code), code);
  const inHigh = (code, id) => R(code).high.some((f) => f.check === id);
  const inAdv = (code, id) => R(code).advisory.some((f) => f.check === id);
  const noHigh = (code) => R(code).high.length === 0;
  const cases = {
    "eq-compare fires (protected)":   inHigh("protected let pw = record.pw\nif pw == input { deny() }", "secret-eq-compare"),
    "eq-compare fires (secret.read)": inHigh('let t = secret.read("k")\nif t != given { reject() }', "secret-eq-compare"),
    "branch fires (redacted)":        inAdv("redacted let s = load()\nif s { pathA() } else { pathB() }", "secret-branch"),
    "match fires (secret bind)":      inAdv('let k = secret.read("k")\nmatch k { case a => x }', "secret-match"),
    "non-secret compare silent":      noHigh("let x = 1\nif x == y { go() }"),
    "string-literal masked":          noHigh('protected let pw = p\nlog("pw == input is fine in a string")'),
    "comment masked":                 noHigh("protected let pw = p\n// if pw == input then leak"),
    "oblivious-allow exempts":        noHigh("protected let pw = p\nif pw == input { } // oblivious-allow: secret-eq-compare — proven constant-time"),
  };
  let ok = true;
  for (const [name, pass] of Object.entries(cases)) { console.log(`  ${pass ? "✓" : "✗ FAIL"} ${name}`); if (!pass) ok = false; }
  console.log(ok ? "[self-test] PASS — secret compare/branch/match detected; strings+comments+allow respected"
                 : "[self-test] FAIL");
  process.exit(ok ? 0 : 1);
}

if (isMain) {
  const args = process.argv.slice(2);
  const soft = args.includes("--soft"), json = args.includes("--json"), extra = args.includes("--extra");
  const rootArg = args.find((a) => !a.startsWith("--"));
  const root = rootArg ? rootArg : process.cwd();
  const files = walk(root, []);
  const highAll = [], advAll = [];
  for (const f of files) {
    let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
    const { high, advisory } = findFindings(maskCodeOnly(src), src);
    const rel = f.replace(/\\/g, "/").replace(root.replace(/\\/g, "/") + "/", "");
    for (const h of high) highAll.push({ file: rel, ...h });
    for (const a of advisory) advAll.push({ file: rel, ...a });
  }
  if (json) {
    console.log(JSON.stringify({ findings: highAll.length, advisory: advAll.length, results: highAll, advisoryResults: advAll }, null, 2));
  } else {
    for (const f of highAll) { console.log(`  ⚠ ${f.file}:${f.line}  [${f.check}] ${f.snippet}`); console.log(`        → ${f.hint}`); }
    if (extra) for (const f of advAll) { console.log(`  · ${f.file}:${f.line}  [${f.check}] ${f.snippet}`); console.log(`        → ${f.hint}`); }
    if (highAll.length === 0) console.log("audit-oblivious: no HIGH secret-compare findings (RD-0258).");
    console.log(`FINDINGS: ${highAll.length}  (+${advAll.length} advisory${extra ? "" : " — run --extra to list"})`);
    console.log("NOTE: advisory detector for RD-0258; the compiler-enforced @oblivious lowering stays owner-gated.");
  }
  process.exit(soft ? 0 : highAll.length > 0 ? 1 : 0);
}
