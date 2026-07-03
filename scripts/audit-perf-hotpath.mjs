#!/usr/bin/env node
// audit-perf-hotpath.mjs — static PERFORMANCE / optimisation auditor for the production source
// (the security/bug audits have siblings; this is the perf one). 2026-07-03.
//
// What it exists to surface: recurring, high-confidence performance anti-patterns a security/correctness
// lint does NOT catch — quadratic work inside a loop, blocking I/O in a loop, re-sorting/re-parsing per
// iteration, and the classic O(n²) "spread the accumulator" reduce. These are optimisation opportunities,
// not correctness bugs, so the tool is ADVISORY (report-only under --soft, the phase-close wiring).
//
// Two tiers, deliberately, because a noisy perf lint gets muted (worse than none):
//   HIGH-confidence (drive the FINDINGS count / exit code) — unambiguous:
//     loop-array-find      — `.find(`/`.findIndex(` (callback array scans) INSIDE a loop → O(n²);
//                            index the collection in a Map/Set once, outside the loop.
//     loop-sync-io         — `readFileSync/readdirSync/statSync/lstatSync/existsSync/writeFileSync/
//                            appendFileSync(` inside a loop → repeated blocking syscalls.
//     loop-sort            — `.sort(` inside a loop → re-sorting every iteration.
//     loop-json-parse      — `JSON.parse(` inside a loop → re-parse per iteration.
//     reduce-spread-accum  — `.reduce(… => [...acc] / ({...acc}))` → O(n²) accumulator copy.
//   ADVISORY (counted separately, shown with --extra, NEVER gate) — real but higher false-positive:
//     loop-membership      — `.includes/.indexOf/.lastIndexOf(` with a NON-literal arg inside a loop.
//                            (string-literal args are excluded — those are substring checks, not array
//                            membership — but a string.includes(varString) can still slip through, hence
//                            advisory: "verify the receiver is a large array, not a string".)
//     loop-sequential-await— `await` inside a `for`/`while` body → serialised I/O; often INTENTIONAL
//                            (ordered work), so advisory-only.
//
// NOT a finding (kept high-signal): matches inside string literals or comments are masked out (only real
// CODE is scanned); any line carrying an inline `perf-allow` (optionally `perf-allow: <check-id>`) is exempt;
// tests / dist / build / node_modules / examples / benchmarks are skipped, and only files under a `src/`
// directory are scanned (the shipped runtime/compiler, not dev scripts or fixtures).
//
// Scope: walks --root (default cwd). Exit = HIGH finding count (0 = clean); --soft forces exit 0.
//   node scripts/audit-perf-hotpath.mjs               → scan the production src tree
//   node scripts/audit-perf-hotpath.mjs --extra       → also list the advisory tier
//   node scripts/audit-perf-hotpath.mjs --json        → machine-readable (high + advisory)
//   node scripts/audit-perf-hotpath.mjs --soft        → report-only (exit 0) — the phase-close wiring
//   node scripts/audit-perf-hotpath.mjs --self-test   → prove every check fires AND stays silent on the good form
import { readdirSync, statSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ── mask a source file down to CODE: blank every comment + string/template literal to spaces (newlines
// kept, so offsets & line numbers are exact). A perf pattern hiding in a "…find…" string or a // comment
// must NOT match. Heuristic (no full lexer): template `${…}` is blanked with the rest of the template. ──
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

// ── loop-body spans over masked code. Track BRACE depth only (parens don't change it); when a loop-opener
// token is seen we "arm", and the NEXT `{` becomes a loop body. `;` at paren-depth 0 disarms (a braceless
// single-statement loop, or a spurious arm). Each span carries kind: "forwhile" | "method". ──
export function loopSpans(code) {
  const spans = [];
  const stack = [];
  const isWord = (ch) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
  let armedKind = null, paren = 0, i = 0;
  const n = code.length;
  while (i < n) {
    if (armedKind === null) {
      if (code.startsWith("for", i) || code.startsWith("while", i)) {
        const kwLen = code.startsWith("for", i) ? 3 : 5;
        if (!isWord(code[i - 1]) && !isWord(code[i + kwLen])) armedKind = "forwhile";
      } else if (code[i] === "." && /^\.(forEach|map|filter|reduce|some|every|find|findIndex|flatMap)\b/.test(code.slice(i, i + 14))) {
        armedKind = "method";
      }
    }
    const c = code[i];
    if (c === "(") paren++;
    else if (c === ")") { if (paren > 0) paren--; }
    else if (c === "{") { stack.push({ kind: armedKind, start: i + 1 }); armedKind = null; i++; continue; }
    else if (c === "}") { const t = stack.pop(); if (t && t.kind) spans.push({ start: t.start, end: i, kind: t.kind }); i++; continue; }
    else if (c === ";" && paren === 0) { armedKind = null; }
    i++;
  }
  return spans;
}

// map char offset → 1-based line + physical line text
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

// HIGH-confidence checks (drive the finding count / exit code) — unambiguous array/loop operations.
const HIGH_CHECKS = [
  { id: "loop-array-find", re: /\.(?:find|findIndex)\s*\(/g, scope: "any", hint: "array .find/.findIndex inside a loop → O(n²); build a Map/Set index of the collection once, outside the loop" },
  { id: "loop-sync-io", re: /\b(?:readFileSync|readdirSync|statSync|lstatSync|existsSync|writeFileSync|appendFileSync)\s*\(/g, scope: "any", hint: "synchronous FS syscall inside a loop → hoist out of the loop or batch the reads" },
  { id: "loop-sort", re: /\.sort\s*\(/g, scope: "any", hint: "sort inside a loop → sort once outside the loop" },
  { id: "loop-json-parse", re: /\bJSON\.parse\s*\(/g, scope: "any", hint: "JSON.parse inside a loop → parse once and reuse the value" },
];
const REDUCE_SPREAD_RE = /\.reduce\s*\([\s\S]{0,160}?=>\s*(?:\[\s*\.\.\.|\(?\s*\{\s*\.\.\.)/g;
// ADVISORY checks (counted separately; shown with --extra; do NOT drive the exit code) — real but higher FP.
const ADVISORY_CHECKS = [
  { id: "loop-membership", re: /\.(?:includes|indexOf|lastIndexOf)\s*\(\s*[^"'`/)\s]/g, scope: "any", hint: "membership scan inside a loop — IF the receiver is a large array (not a string), hoist it to a Set/Map" },
  { id: "loop-sequential-await", re: /\bawait\b/g, scope: "forwhile", hint: "sequential await in a for/while loop → Promise.all when the iterations are independent (often intentional — review)" },
];

/** Findings in one already-masked document → { high:[...], advisory:[...] }. `orig` supplies snippet + perf-allow. */
export function findFindings(masked, orig = masked) {
  const spans = loopSpans(masked);
  const { lines, lineOf } = lineIndex(orig);
  const inLoop = (off, kind) => spans.some((s) => off >= s.start && off < s.end && (kind === "any" || s.kind === kind));
  const exemptAt = (lineNo, id) => {
    const m = /perf-allow(?::\s*([\w-]+))?/.exec(lines[lineNo] ?? "");
    return m ? (m[1] === undefined || m[1] === id) : false;
  };
  const mk = (id, off, hint) => { const ln = lineOf(off); return exemptAt(ln, id) ? null : { check: id, line: ln + 1, hint, snippet: (lines[ln] ?? "").trim().slice(0, 120) }; };
  const collect = (checks) => {
    const out = [];
    for (const chk of checks) {
      for (const m of masked.matchAll(chk.re)) {
        if (!inLoop(m.index, chk.scope)) continue;
        const f = mk(chk.id, m.index, chk.hint);
        if (f) out.push(f);
      }
    }
    return out;
  };
  const high = collect(HIGH_CHECKS);
  for (const m of masked.matchAll(REDUCE_SPREAD_RE)) {
    const f = mk("reduce-spread-accum", m.index, "spread of the accumulator in reduce → O(n²) copy each step; push/assign into one accumulator instead");
    if (f) high.push(f);
  }
  const bySort = (a, b) => a.line - b.line;
  return { high: high.sort(bySort), advisory: collect(ADVISORY_CHECKS).sort(bySort) };
}

// ── file walk: production src only (shipped runtime/compiler), skip tests/fixtures/dist/build/deps ──
const CODE_EXT = new Set([".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx"]);
const SKIP_DIR = new Set(["node_modules", "dist", "build", ".graph", ".git", "coverage", "test-fixtures", "tests", "examples", "benchmarks"]);
const SKIP_FILE = ["audit-perf-hotpath", ".test.", ".spec.", ".d.ts"];

function walk(dir, acc) {
  let ents;
  try { ents = readdirSync(dir); } catch { return acc; }
  for (const e of ents) {
    if (SKIP_DIR.has(e) || e.startsWith(".")) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { walk(p, acc); continue; }
    const dot = e.lastIndexOf(".");
    const ext = dot < 0 ? "" : e.slice(dot).toLowerCase();
    if (!CODE_EXT.has(ext)) continue;
    const norm = p.replace(/\\/g, "/");
    if (!/\/src\//.test(norm)) continue; // shipped source only — not dev scripts, not root files
    if (SKIP_FILE.some((s) => norm.includes(s))) continue;
    acc.push(p);
  }
  return acc;
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

// ── self-test: every check must FIRE on the bad form and stay SILENT on the good form + respect exemptions ──
if (isMain && process.argv.includes("--self-test")) {
  const R = (code) => findFindings(maskCodeOnly(code), code);
  const inHigh = (code, id) => R(code).high.some((f) => f.check === id);
  const inAdv = (code, id) => R(code).advisory.some((f) => f.check === id);
  const noHigh = (code) => R(code).high.length === 0;
  const cases = {
    "array-find fires in loop":        inHigh("for (const x of xs) { const h = ys.find(y => y.k === x) }", "loop-array-find"),
    "array-find silent at top level":  noHigh("const h = ys.find(y => y.k === x)"),
    "sync-io fires in loop":           inHigh("for (const f of files) { const s = readFileSync(f) }", "loop-sync-io"),
    "sort fires in loop":              inHigh("while (go) { rows.sort((a,b)=>a-b) }", "loop-sort"),
    "json-parse fires in loop":        inHigh("for (let i=0;i<n;i++) { const o = JSON.parse(blob) }", "loop-json-parse"),
    "reduce-spread fires (obj)":       inHigh("const m = xs.reduce((acc, x) => ({ ...acc, [x.k]: x.v }), {})", "reduce-spread-accum"),
    "reduce-spread fires (arr)":       inHigh("const a = xs.reduce((acc, x) => [...acc, f(x)], [])", "reduce-spread-accum"),
    "good reduce is silent":           noHigh("const s = xs.reduce((acc, x) => acc + x, 0)"),
    "string literal masked":           noHigh('const q = "ys.find(y=>y.k) in a loop"; run()'),
    "comment masked":                  noHigh("for (const x of xs) { work(x) } // ys.find(y=>y.k===x)"),
    "perf-allow exempts":              noHigh("for (const x of xs) { ys.find(y=>y===x) } // perf-allow: loop-array-find"),
    "membership is advisory NOT high": noHigh("for (const x of xs) { if (seen.includes(x)) drop(x) }"),
    "membership fires as advisory":    inAdv("for (const x of xs) { if (seen.includes(x)) drop(x) }", "loop-membership"),
    "string-literal .includes not advisory": !R('for (const x of xs) { if (s.includes("lit")) drop(x) }').advisory.some((f) => f.check === "loop-membership"),
    "await advisory in for-loop":      inAdv("for (const u of us) { await save(u) }", "loop-sequential-await"),
    "await silent in forEach":         !R("us.forEach(async (u) => { await save(u) })").advisory.some((f) => f.check === "loop-sequential-await"),
  };
  const failed = Object.entries(cases).filter(([, ok]) => !ok).map(([k]) => k);
  for (const [k, ok] of Object.entries(cases)) console.log(`  ${ok ? "✓" : "✗"} ${k}`);
  console.log(failed.length === 0 ? "[self-test] PASS — high tier fires on real anti-patterns; advisory tier catches membership/await without gating"
    : `[self-test] FAIL — ${failed.join(" · ")}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

// ── scan the tree ──────────────────────────────────────────────────────────────────────────────────
if (isMain) {
  const rootArg = process.argv.indexOf("--root");
  const root = rootArg >= 0 ? process.argv[rootArg + 1] : ".";
  const asJson = process.argv.includes("--json");
  const soft = process.argv.includes("--soft");
  const extra = process.argv.includes("--extra");

  const files = walk(root, []);
  const high = [], advisory = [];
  for (const p of files) {
    let src;
    try { src = readFileSync(p, "utf8"); } catch { continue; }
    const r = findFindings(maskCodeOnly(src), src);
    const tag = (f) => ({ file: p.replace(/\\/g, "/"), ...f });
    for (const f of r.high) high.push(tag(f));
    for (const f of r.advisory) advisory.push(tag(f));
  }
  const tally = (arr) => { const b = {}; for (const f of arr) b[f.check] = (b[f.check] ?? 0) + 1; return b; };

  if (asJson) {
    console.log(JSON.stringify({ findings: high.length, advisory: advisory.length, scanned: files.length, byCheck: tally(high), byAdvisory: tally(advisory), results: high, advisoryResults: advisory }, null, 2));
    process.exit(soft ? 0 : high.length);
  }

  console.log(`perf-hotpath: scanned ${files.length} production src file(s) for hot-path anti-patterns`);
  for (const f of high) console.log(`  ⚠ ${f.file}:${f.line}  [${f.check}] ${f.snippet}\n        → ${f.hint}`);
  if (extra) for (const f of advisory) console.log(`  · ${f.file}:${f.line}  [${f.check}] ${f.snippet}\n        → ${f.hint}`);
  console.log("");
  const hb = tally(high);
  console.log(Object.keys(hb).length
    ? "by check: " + Object.entries(hb).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" · ")
    : "perf-hotpath: no high-confidence hot-path anti-patterns found.");
  console.log(`FINDINGS: ${high.length}  (+${advisory.length} advisory${extra ? "" : " — run --extra to list"})`);
  process.exit(soft ? 0 : high.length);
}
