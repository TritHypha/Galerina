#!/usr/bin/env node
// audit-fungi-runtime.mjs — audit the SELF-HOSTED `.fungi` runtime corpus (the files the compiler/runtime is
// written in) for the properties that must hold before they lower kernel → GIR → WASM. 2026-07-03.
//
// Owner ask: "audit .fungi files written for the runtime, tests including for the kernel→GIR→WASM." The
// Stage-B runtime is authored in packages-galerina/galerina-core-compiler/src/self-hosted/*.fungi and lowers
// through the SAME GIR→WASM backend as `.gate`. Two 2026-07-03 fail-closed fixes bound what runtime `.fungi`
// may contain, and this auditor enforces them on the corpus as a standing gate:
//
//   FUNGI-RT match-exhaustive  — every `match` in a runtime `.fungi` MUST carry a `_` (wildcard) arm.
//                                A non-exhaustive match traps/mis-lowers in WASM (RD-0240); the corpus must
//                                stay exhaustive so the runtime never has a silent-`0`/trap on an unlisted case.
//   FUNGI-RT no-error-prop      — the `?` postfix error-propagation operator does NOT lower to WASM (it drops
//                                at GIR and the WAT emitter traps on it, BK-3). Runtime `.fungi` must avoid it
//                                until `?` lowering lands, or a flow silently can't run in WASM.
//   FUNGI-RT test-coverage      — every self-hosted `.fungi` must have an EXECUTING test (self-hosted-*.test.mjs)
//                                that runs it (axis-B rule: "Done = executing tests pass, not parse-clean").
//   FUNGI-RT pipeline-coverage  — the kernel → GIR → WASM path itself must be pinned: the P9 tokenize byte-parity
//                                harness + the Stage-B pipeline/compile tests must exist (else parity can rot).
//
// Scope: the self-hosted corpus (--root override for tests). Exit = finding count (0 = clean); --soft → exit 0.
//   node scripts/audit-fungi-runtime.mjs               → audit the runtime .fungi + its kernel→GIR→WASM tests
//   node scripts/audit-fungi-runtime.mjs --json        → machine-readable
//   node scripts/audit-fungi-runtime.mjs --soft        → report-only (exit 0) — phase-close wiring
//   node scripts/audit-fungi-runtime.mjs --self-test   → prove each check fires on the anti-pattern
import { readdirSync, statSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = join(ROOT, "packages-galerina", "galerina-core-compiler");
const SELF_HOSTED = join(CORE, "src", "self-hosted");
const TESTS_DIR = join(CORE, "tests");
// The kernel→GIR→WASM path tests that must exist (parity oracle + Stage-B pipeline/compile).
const PIPELINE_TESTS = ["wat-p9-tokenize-parity.test.mjs", "self-hosted-pipeline.test.mjs", "phase50-stage-b-compiles.test.mjs"];

// ── mask a .fungi source to CODE: blank // and /* */ comments and "…"/'…' string literals to spaces
// (newlines kept, offsets exact) so a `match`/`?`/`_ =>` inside a comment or string is not miscounted. ──
export function maskFungi(src) {
  const out = src.split("");
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { let j = i; while (j < n && src[j] !== "\n") j++; blank(i, j); i = j; continue; }
    if (c === "/" && d === "*") { let j = i + 2; while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++; j = Math.min(n, j + 2); blank(i, j); i = j; continue; }
    if (c === '"' || c === "'") { const q = c; let j = i + 1; while (j < n && src[j] !== q) { if (src[j] === "\\") j += 2; else j++; } j = Math.min(n, j + 1); blank(i, j); i = j; continue; }
    i++;
  }
  return out.join("");
}

const matchBrace = (s, open) => { let d = 0; for (let i = open; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (d === 0) return i; } } return -1; };
// text at IMMEDIATE depth inside a `{ … }` (nested braces skipped) — so a nested match's `_` arm is not
// mistaken for the outer match's wildcard (that would false-clean a non-exhaustive outer match).
function immediateText(s, open, close) {
  let out = "", d = 0;
  for (let i = open; i <= close; i++) {
    const c = s[i];
    if (c === "{") { d++; if (d === 1) continue; }
    if (c === "}") { d--; if (d === 0) continue; }
    if (d === 1) out += c;
  }
  return out;
}
function lineIndex(text) {
  const lines = text.split(/\n/); const starts = []; let acc = 0;
  for (const l of lines) { starts.push(acc); acc += l.length + 1; }
  const lineOf = (off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; } return lo; };
  return { lines, lineOf };
}

/** Structural findings in one .fungi (already-masked `code`, original `orig` for snippets). */
export function fungiFindings(code, orig = code) {
  const { lines, lineOf } = lineIndex(orig);
  const out = [];
  // FUNGI-RT match-exhaustive: every `match … { … }` must carry an immediate-level `_` (wildcard) arm.
  for (const m of code.matchAll(/\bmatch\b/g)) {
    let j = m.index + 5;
    while (j < code.length && code[j] !== "{") j++;         // subject → block-open (subjects carry no top-level {)
    if (code[j] !== "{") continue;
    const close = matchBrace(code, j);
    if (close < 0) continue;
    const imm = immediateText(code, j, close);
    const hasWildcard = /(^|[^A-Za-z0-9_.$])_\s*=>/.test(imm) || /(^|[^A-Za-z0-9_.$])else\s*=>/.test(imm);
    if (!hasWildcard) {
      const ln = lineOf(m.index);
      out.push({ check: "match-exhaustive", line: ln + 1, snippet: (lines[ln] ?? "").trim().slice(0, 100), hint: "add a `_ =>` arm — a non-exhaustive match traps/mis-lowers in WASM (RD-0240)" });
    }
  }
  // FUNGI-RT no-error-prop: postfix `?` (after an identifier/`)`/`]`) — the error-propagation operator that
  // drops at GIR and cannot lower to WASM (BK-3). Excludes `??`, `?.`, and `?:` (not error-prop).
  for (const m of code.matchAll(/[A-Za-z0-9_)\]]\s*\?(?![?.:])/g)) {
    const ln = lineOf(m.index);
    out.push({ check: "no-error-prop", line: ln + 1, snippet: (lines[ln] ?? "").trim().slice(0, 100), hint: "`?` error-propagation does not lower to WASM (drops at GIR, traps in WAT — BK-3); rewrite as an explicit match" });
  }
  return out;
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && process.argv.includes("--self-test")) {
  const F = (src) => fungiFindings(maskFungi(src), src);
  const has = (src, id) => F(src).some((f) => f.check === id);
  const none = (src, id) => !F(src).some((f) => f.check === id);
  const cases = {
    "non-exhaustive match flagged":       has("flow f(x: T) -> Int { match x { A => 1  B => 2 } }", "match-exhaustive"),
    "exhaustive match (has _) is clean":  none("flow f(x: T) -> Int { match x { A => 1  _ => 0 } }", "match-exhaustive"),
    "nested _ does NOT clear outer":      has("flow f(x: T) -> Int { match x { A => match y { _ => 1 } } }", "match-exhaustive"),
    "`?` error-prop flagged":             has("flow f(x: T) -> R { let y = risky(x)?  return y }", "no-error-prop"),
    "`??` nullish is NOT error-prop":     none("flow f(x: T) -> R { let y = a ?? b  return y }", "no-error-prop"),
    "match/? inside a comment masked":    none("flow f() -> Int { // match x { A => 1 } and risky()?\n return 0 }", "match-exhaustive"),
    "match in a string literal masked":   none('flow f() -> Int { let s = "match x { A => 1 }"  return 0 }', "match-exhaustive"),
  };
  const failed = Object.entries(cases).filter(([, ok]) => !ok).map(([k]) => k);
  for (const [k, ok] of Object.entries(cases)) console.log(`  ${ok ? "✓" : "✗"} ${k}`);
  console.log(failed.length === 0 ? "[self-test] PASS — runtime .fungi checks fire on the anti-pattern, silent on the good form" : `[self-test] FAIL — ${failed.join(" · ")}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

if (isMain) {
  const asJson = process.argv.includes("--json");
  const soft = process.argv.includes("--soft");
  const rootArg = process.argv.indexOf("--root");
  const shDir = rootArg >= 0 ? process.argv[rootArg + 1] : SELF_HOSTED;
  const tDir = rootArg >= 0 ? join(process.argv[rootArg + 1], "..", "tests") : TESTS_DIR;

  const findings = [];
  let fungiFiles = [];
  try { fungiFiles = readdirSync(shDir).filter((f) => f.endsWith(".fungi")).sort(); } catch { /* dir missing → pipeline check will fail-closed */ }

  // FUNGI-RT structural checks + test-coverage, per self-hosted .fungi.
  const testFiles = (() => { try { return readdirSync(tDir); } catch { return []; } })();
  const testBlob = testFiles.filter((f) => f.endsWith(".mjs")).map((f) => { try { return readFileSync(join(tDir, f), "utf8"); } catch { return ""; } }).join("\n");
  for (const f of fungiFiles) {
    const abs = join(shDir, f);
    let src; try { src = readFileSync(abs, "utf8"); } catch { continue; }
    for (const finding of fungiFindings(maskFungi(src), src)) findings.push({ file: `self-hosted/${f}`, ...finding });
    // executing-test coverage: a self-hosted-<name>.test.mjs, or the file referenced by any test.
    const stem = basename(f, ".fungi");
    const hasTest = testFiles.includes(`self-hosted-${stem}.test.mjs`) || testBlob.includes(f) || testBlob.includes(`self-hosted/${stem}`);
    if (!hasTest) findings.push({ file: `self-hosted/${f}`, check: "test-coverage", line: 0, snippet: "", hint: `no executing test runs ${f} (expected self-hosted-${stem}.test.mjs) — parse-clean never counts (axis-B)` });
  }

  // FUNGI-RT pipeline-coverage: the kernel → GIR → WASM tests must exist (fail-closed if the harness is gone).
  for (const t of PIPELINE_TESTS) {
    if (!existsSync(join(tDir, t))) findings.push({ file: `tests/${t}`, check: "pipeline-coverage", line: 0, snippet: "", hint: "the kernel→GIR→WASM parity/pipeline test is missing — the byte-parity oracle is unpinned" });
  }
  if (fungiFiles.length === 0) findings.push({ file: shDir, check: "pipeline-coverage", line: 0, snippet: "", hint: "no self-hosted .fungi found — the runtime corpus is missing (fail-closed)" });

  const byCheck = {};
  for (const f of findings) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;

  if (asJson) {
    console.log(JSON.stringify({ findings: findings.length, fungiFiles: fungiFiles.length, byCheck, results: findings }, null, 2));
    process.exit(soft ? 0 : findings.length);
  }
  console.log(`fungi-runtime: audited ${fungiFiles.length} self-hosted .fungi + the kernel→GIR→WASM test harness`);
  for (const f of findings) console.log(`  ⚠ ${f.file}${f.line ? ":" + f.line : ""}  [${f.check}] ${f.snippet}\n        → ${f.hint}`);
  console.log("");
  console.log(Object.keys(byCheck).length ? "by check: " + Object.entries(byCheck).map(([k, v]) => `${k}=${v}`).join(" · ") : "fungi-runtime: runtime .fungi corpus is WASM-lowerable + test-covered (clean).");
  console.log(`FINDINGS: ${findings.length}`);
  process.exit(soft ? 0 : findings.length);
}
