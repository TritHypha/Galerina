#!/usr/bin/env node
/**
 * audit-report-blind-consumers.mjs — "does every consumer read the REPORT, or only the VALUE?"
 *
 * THE DEFECT CLASS (#163, measured 2026-07-19). `assembleWAT` returns a value AND a report that
 * disagree BY DESIGN: when wabt rejects a module, the fallback minimal encoder returns an unfaithful
 * STUB — one that implements no calls at all — marked `valid: true` and carrying a diagnostic that
 * says, in plain English, "this is NOT a faithful compile". Four consumers, one tree, three verdicts:
 *
 *   wat-assembler.ts:255  executeWASMFlow   `!valid || diagnostics.length > 0`      → declined  ✅
 *   galerina.mjs:2118     build/sign path   `diagnostics.length === 0` → prod fail  → declined  ✅
 *   cli.ts:1006           CLI emit          `if (assembleResult.valid)`             → WROTE the stub to
 *                                                                                     disk and announced
 *                                                                                     "WASM binary written" ❌
 *   wasm-runner.mjs:41    benchmark runner  `if (!assembled.valid)`                 → BENCHMARKED it ❌
 *
 * The correct gate already existed in-tree and was simply never applied to the other two. Nothing
 * enforced the invariant, so the two blind consumers drifted and stayed blind.
 *
 *   ★ A consumer that reads a result's VALUE but not its REPORT is fail-open by construction.
 *
 * THE INVARIANT: for every watched API (see WATCHED), a consumer that branches on the value field
 * must also consult the report field IN A DECISION — and a consumer that uses the produced ARTIFACT
 * without branching on either is worse still.
 *
 * DISCIPLINES BAKED IN (each one is a mistake this class already caused):
 *   1. DECISION-use vs REPORT-use. `wasm-runner.mjs` DID mention `.diagnostics` — but only to build an
 *      error message AFTER deciding on `.valid`. A rule of "mentions the report somewhere" passes that
 *      bug. A rule of "mentions it in the SAME condition" cries wolf on galerina.mjs, which reads the
 *      report into `const faithfulCompile = …` and branches on it two lines later. Both real shapes are
 *      pinned in --self-test so neither rule can quietly come back.
 *   2. THE SURFACE IS THE WHOLE PROBLEM. A detector that scans the wrong set reports a confident zero.
 *      The repo's own finder returned 5 files for this API where a full walk finds ~90 — it silently
 *      skips large files. So this gate walks the tree itself AND asserts named anchors are in the
 *      scanned set; if an anchor goes missing the gate FAILS rather than reports clean.
 *   3. ZERO CALL SITES IS A FAILURE, NOT A PASS. If the API is never found, the scan broke.
 *   4. UNANALYZED IS NEVER CLEAN. A call site whose binding can't be extracted is REVIEW, not OK.
 *   5. Shrink-only baseline: known-open sites are recorded; a NEW one exits 1. The baseline may only
 *      shrink — a fixed site that reappears is a regression.
 *
 * SCOPE — deliberately product code only. Tests are excluded: a test asserting `result.valid === true`
 * over known-good WAT is the specification, not a shipped consumer, and the ~120 such sites would drown
 * the signal (a gate that cries wolf is ignored within a week). Test files remain protected by their own
 * value assertions — a stub cannot satisfy `example(2,3) === 5`.
 *
 * RUN:  node scripts/audit-report-blind-consumers.mjs [--self-test] [--json] [--update-baseline]
 * EXIT: 0 clean · 1 a NEW off-baseline VIOLATION/REVIEW, a broken surface, or a self-test failure
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GALERINA_ROOT || join(HERE, "..");
const BASELINE = join(ROOT, "packages-galerina/galerina-core-compiler/tests/fixtures/report-blind-consumers-baseline.json");

/**
 * APIs that hand back a value AND a qualifying report. To add one: give the call name, the field a
 * consumer typically branches on, the field that qualifies it, and the artifact the caller goes on to
 * use. Keep `why` concrete — a reviewer must be able to see the hazard without leaving this file.
 */
const WATCHED = [
  {
    api: "assembleWAT",
    value: "valid",
    report: "diagnostics",
    artifact: "wasm",
    why: "a wabt-rejected module comes back as an unfaithful minimal-encoder STUB: valid:true PLUS a 'NOT a faithful compile' diagnostic (#163)",
  },
];

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".github", "coverage", "docs"]);
const SOURCE_EXT = /\.(?:ts|mts|cts|mjs|cjs|js)$/;

/** Anchors that MUST be in the scanned set. If the walk stops seeing these, the surface broke. */
const SURFACE_ANCHORS = [
  "packages-galerina/galerina-core-compiler/src/wat-assembler.ts",
  "packages-galerina/galerina-core-compiler/src/cli.ts",
  "packages-galerina/galerina-devtools-benchmarks/src/wasm-runner.mjs",
  "galerina.mjs",
];

const isTest = (rel) =>
  /(?:^|\/)tests?\//.test(rel) || /\.test\.(?:[mc]?js|ts)$/.test(rel) || /(?:^|\/)__tests__\//.test(rel);

function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (SOURCE_EXT.test(e)) acc.push(p);
  }
  return acc;
}

const rel = (abs) => relative(ROOT, abs).replace(/\\/g, "/");
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

/** Strip line + block comments so a commented-out example never counts as a real consumer. */
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

const lineStart = (src, idx) => { const i = src.lastIndexOf("\n", idx); return i === -1 ? 0 : i + 1; };

/** The statement containing `idx`: from its line start to the first top-level `;` or unbalanced end. */
function statementAround(src, idx, maxLines = 8) {
  const start = lineStart(src, idx);
  let depth = 0, lines = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === ";" && depth <= 0) return src.slice(start, i);
    else if (c === "\n") { if (depth <= 0 || ++lines >= maxLines) return src.slice(start, i); }
  }
  return src.slice(start);
}

const COMPARISON = /(?:===|!==|==|!=|>=|<=|>|<)/;

/**
 * Is this occurrence a DECISION (the code acts on it) or merely a REPORT (it is printed/returned)?
 * The `const ok = x.diagnostics.length === 0; … if (!ok)` shape is a DECISION — that is galerina.mjs,
 * and treating it as a report-use would flag the one consumer that gets this right.
 */
function classifyUse(src, stmt, stmtStart = -1, occIdx = -1) {
  const s = stmt.trim();
  const head = /^(?:\}\s*)?(?:else\s+)?(?:if|while|for|switch)\s*\(/.exec(s);
  if (head) {
    // ⚠ A one-liner — `if (!asm.valid) { log(asm.diagnostics); exit(2); }` — is ONE statement, so a
    // naive "starts with if" credits the BODY's mention as a condition test. That is the exact false
    // negative this gate exists to catch (it hid bench-i64-vs-i32.mjs:23 from v1). Only an occurrence
    // INSIDE the condition parens is a decision; anything after them is reporting.
    const open = stmtStart + (stmt.length - stmt.trimStart().length) + head[0].length - 1;
    let depth = 0, close = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) { close = i; break; }
    }
    if (occIdx < 0 || close < 0) return "DECISION";
    return occIdx > open && occIdx < close ? "DECISION" : "REPORT";
  }
  if (/^(?:throw|process\.exit)\b/.test(s)) return "DECISION";
  if (/^return\s+[\s\S]*\?/.test(s)) return "DECISION";
  const asg = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=([\s\S]*)$/.exec(s);
  if (asg && COMPARISON.test(asg[2])) {
    const n = asg[1];
    const usedInDecision = new RegExp(
      `if\\s*\\([^)]*\\b${n}\\b|\\b${n}\\b\\s*\\?|&&\\s*!?\\s*${n}\\b|\\|\\|\\s*!?\\s*${n}\\b|!${n}\\b`,
    ).test(src);
    if (usedInDecision) return "DECISION";
  }
  return "REPORT";
}

/** Findings for one file against one watched API. */
function analyze(relPath, rawSrc, spec) {
  const src = decomment(rawSrc);
  const out = [];
  const callSites = [...src.matchAll(new RegExp(`\\b${spec.api}\\s*\\(`, "g"))];
  if (callSites.length === 0) return { findings: out, callSites: 0 };

  // ⚠ PER-SITE, not per-name. Two calls in one file commonly reuse the same variable
  // (`const asm = await assembleWAT(...)` at :144 AND :250 of audit-stage-execution.mjs). Keying by
  // name kept only the first and searched the WHOLE file for `asm.diagnostics`, so gating ONE site
  // would mark the file clean while the other stayed blind — the baseline would understate and the
  // burn-down would report done with a live blind consumer. Each occurrence now gets its own scope,
  // running to the next binding of the same name. Found by R&D's independent detector, not by mine.
  const bindings = [];
  const bind = (name, idx) => { if (name) bindings.push({ name, idx }); };

  for (const m of src.matchAll(
    new RegExp(`(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:[A-Za-z_$][\\w$]*\\.)?${spec.api}\\s*\\(`, "g"),
  )) bind(m[1], m.index);

  for (const m of src.matchAll(
    new RegExp(`(?:[A-Za-z_$][\\w$]*\\.)?${spec.api}\\s*\\([\\s\\S]{0,400}?\\.then\\s*\\(\\s*(?:async\\s*)?\\(?\\s*([A-Za-z_$][\\w$]*)`, "g"),
  )) bind(m[1], m.index);

  for (const m of src.matchAll(
    new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*(?:await\\s+)?(?:[A-Za-z_$][\\w$]*\\.)?${spec.api}\\s*\\(`, "g"),
  )) {
    const names = m[1].split(",").map((s) => s.trim().split(":").pop().trim()).filter(Boolean);
    const takesValue = names.includes(spec.value);
    const takesArtifact = names.includes(spec.artifact);
    if (!takesValue && !takesArtifact) continue;
    // Destructuring the artifact WITHOUT the report is decisive: the report was never bound, so it
    // cannot have been consulted. Destructuring the value without the report is the same fail-open.
    out.push({
      file: relPath, line: lineOf(src, m.index), api: spec.api, binding: `{${names.join(",")}}`,
      kind: names.includes(spec.report) ? "REVIEW" : "VIOLATION",
      why: names.includes(spec.report)
        ? `destructured — decision-use of .${spec.report} is not statically tracked here`
        : `destructures .${takesValue ? spec.value : spec.artifact} without ever binding .${spec.report}`,
    });
  }

  bindings.sort((x, y) => x.idx - y.idx);
  for (let bi = 0; bi < bindings.length; bi++) {
    const { name: b, idx: bIdx } = bindings[bi];
    // Scope this site: from its own binding to the NEXT binding of the same name (or EOF).
    const next = bindings.slice(bi + 1).find((o) => o.name === b);
    const scopeEnd = next ? next.idx : src.length;
    // `?.` must be matched as well as `.` — `b?.wasm` is the shape that hid audit-wasm-validate.mjs
    // from the first version of this gate, which is the very tool R&D proved cannot see a stub.
    const uses = (field) => [...src.slice(bIdx, scopeEnd)
      .matchAll(new RegExp(`\\b${b}\\s*\\??\\.\\s*${field}\\b`, "g"))]
      .map((m) => ({ index: m.index + bIdx }));
    const valueUses = uses(spec.value);
    const artifactUses = uses(spec.artifact);
    const reportDecides = uses(spec.report)
      .some((m) => classifyUse(src, statementAround(src, m.index), lineStart(src, m.index), m.index) === "DECISION");
    const valueDecides = valueUses
      .some((m) => classifyUse(src, statementAround(src, m.index), lineStart(src, m.index), m.index) === "DECISION");

    if (valueDecides && !reportDecides) {
      out.push({
        file: relPath, line: lineOf(src, valueUses[0].index), api: spec.api, binding: b, kind: "VIOLATION",
        why: `branches on .${spec.value} but never consults .${spec.report} in a decision`,
      });
    } else if (!valueDecides && artifactUses.length > 0) {
      out.push({
        file: relPath, line: lineOf(src, artifactUses[0].index), api: spec.api, binding: b, kind: "VIOLATION",
        why: `uses .${spec.artifact} without branching on .${spec.value} or .${spec.report} at all`,
      });
    }
  }

  if (bindings.size === 0 && callSites.length > 0) {
    const inline = callSites.filter((m) => {
      const stmt = statementAround(src, m.index);
      return new RegExp(`\\.${spec.artifact}\\b|\\.${spec.value}\\b`).test(stmt);
    });
    if (inline.length > 0) {
      out.push({
        file: relPath, line: lineOf(src, inline[0].index), api: spec.api, binding: "(inline)", kind: "REVIEW",
        why: `result used inline without a binding — cannot statically confirm .${spec.report} is consulted`,
      });
    }
  }

  return { findings: out, callSites: callSites.length };
}

/**
 * Baseline key. The ORDINAL is load-bearing: audit-stage-execution.mjs has two ungated
 * `const asm = await assembleWAT(...)` sites, so without it both collapse onto one baseline entry —
 * gate one site and the other is silently treated as already-baselined, which is how a burn-down
 * closes with a live blind consumer. An ordinal (nth such site in the file, source order) survives
 * line movement, where embedding the line number would churn on every unrelated edit.
 */
const keyOf = (f) => `${f.file}::${f.api}::${f.binding}::${f.kind}#${f.ord ?? 1}`;

/** Number same-shaped findings within a file so each physical site has its own identity. */
function assignOrdinals(list) {
  const seen = new Map();
  for (const f of list.slice().sort((a, b) => a.line - b.line)) {
    const k = `${f.file}::${f.api}::${f.binding}::${f.kind}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    f.ord = n;
  }
  return list;
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return { entries: [] };
  try { return JSON.parse(readFileSync(BASELINE, "utf8")); } catch { return { entries: [] }; }
}

// ── self-test ────────────────────────────────────────────────────────────────────────────────────
// Fixtures are the REAL shapes from this defect, good and bad. A fixture-only self-test cannot reveal
// a broken SURFACE, so the surface is asserted separately against SURFACE_ANCHORS below.
const SPEC = WATCHED[0];
const FIXTURES = [
  { name: "blind: branches on valid, never reads diagnostics (old cli.ts)", expect: "VIOLATION",
    src: `const r = await assembleWAT(w);\nif (r.valid) { writeFileSync(p, r.wasm); }\nelse { log("nope"); }` },
  { name: "blind: mentions diagnostics ONLY in a message (old wasm-runner.mjs)", expect: "VIOLATION",
    src: `const assembled = await m.assembleWAT(wat);\nif (!assembled.valid) {\n  return { error: true, reason: assembled.diagnostics.map(d => d.message).join("; ") };\n}\nawait WebAssembly.instantiate(assembled.wasm);` },
  { name: "good: value and report in one condition (executeWASMFlow)", expect: "CLEAN",
    src: `const assembled = await assembleWAT(watSource);\nif (!assembled.valid || assembled.diagnostics.length > 0) { return decline(); }\nrun(assembled.wasm);` },
  { name: "good: report read into a const, branched on later (galerina.mjs)", expect: "CLEAN",
    src: `const assembled = await m.assembleWAT(wat);\nif (!assembled.valid) { process.exit(1); }\nconst faithfulCompile = assembled.diagnostics.length === 0;\nif (!faithfulCompile) { process.exit(1); }\nwriteFileSync(out, assembled.wasm);` },
  { name: "good: .then callback gating on both (fixed cli.ts)", expect: "CLEAN",
    src: `assembleWAT(clean).then((res) => {\n  if (res.valid && res.diagnostics.length === 0) { writeFileSync(p, res.wasm); }\n});` },
  { name: "blind: uses the artifact with no gate at all", expect: "VIOLATION",
    src: `const out = await assembleWAT(w);\nwriteFileSync(p, out.wasm);` },
  { name: "clean: a commented-out consumer is not a consumer", expect: "CLEAN",
    src: `// const r = await assembleWAT(w);\n// if (r.valid) { use(r.wasm); }\nconst x = 1;` },
  { name: "blind via OPTIONAL CHAINING (audit-wasm-validate.mjs shape)", expect: "VIOLATION",
    src: `const b = await L.assembleWAT(wat);\nconst u8 = b instanceof Uint8Array ? b : new Uint8Array(b?.bytes || b?.wasm || b);\nWebAssembly.validate(u8);` },
  { name: "blind: destructures the artifact, never binds the report", expect: "VIOLATION",
    src: `const { wasm } = await assembleWAT(w);\nwriteFileSync(p, wasm);` },
  { name: "blind ONE-LINER: report mentioned in the if BODY, not the condition (bench-i64-vs-i32.mjs:23)", expect: "VIOLATION",
    src: `const asm = await L.assembleWAT(wat);\nif (!asm.valid) { console.error("no:", JSON.stringify(asm.diagnostics)); process.exit(2); }\nconst att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");` },
  { name: "good ONE-LINER: report tested INSIDE the condition", expect: "CLEAN",
    src: `const asm = await L.assembleWAT(wat);\nif (!asm.valid || asm.diagnostics.length > 0) { process.exit(2); }\nuse(asm.wasm);` },
];

function selfTest() {
  let pass = 0, fail = 0;
  for (const f of FIXTURES) {
    const { findings } = analyze("fixture.mjs", f.src, SPEC);
    const got = findings.some((x) => x.kind === "VIOLATION") ? "VIOLATION"
      : findings.some((x) => x.kind === "REVIEW") ? "REVIEW" : "CLEAN";
    if (got === f.expect) { pass++; console.log(`  ok   ${f.name}`); }
    else { fail++; console.log(`  FAIL ${f.name} — expected ${f.expect}, got ${got}`); }
  }
  // The surface assertion a fixture can never make: the real tree must still be walkable and the
  // named consumers still in scope.
  const scanned = new Set(walk(ROOT).map(rel));
  for (const a of SURFACE_ANCHORS) {
    if (scanned.has(a)) { pass++; console.log(`  ok   surface anchor present: ${a}`); }
    else { fail++; console.log(`  FAIL surface anchor MISSING from the scan: ${a}`); }
  }
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--self-test")) process.exit(selfTest() ? 0 : 1);

const files = walk(ROOT);
const scanned = new Set(files.map(rel));
for (const a of SURFACE_ANCHORS) {
  if (!scanned.has(a)) {
    console.error(`[report-blind-consumers] SURFACE BROKEN: anchor '${a}' is not in the scanned set — refusing to report clean.`);
    process.exit(1);
  }
}

const findings = [];
let totalCallSites = 0, filesInScope = 0, filesSkippedAsTest = 0;
for (const abs of files) {
  const r = rel(abs);
  let src;
  try { src = readFileSync(abs, "utf8"); } catch { continue; }
  if (!WATCHED.some((s) => src.includes(s.api))) continue;
  // This gate's own --self-test fixtures are literal, deliberate examples of the defect. Scanning
  // itself would report them as live consumers. Narrow, documented, and the ONLY path exemption.
  if (r === "scripts/audit-report-blind-consumers.mjs") continue;
  if (isTest(r)) { filesSkippedAsTest++; continue; }
  filesInScope++;
  for (const spec of WATCHED) {
    const { findings: f, callSites } = analyze(r, src, spec);
    totalCallSites += callSites;
    findings.push(...f);
  }
}

if (totalCallSites === 0) {
  console.error(`[report-blind-consumers] ZERO call sites found for ${WATCHED.map((s) => s.api).join(", ")} — the scan is broken, not the code. Refusing to report clean.`);
  process.exit(1);
}

assignOrdinals(findings);
const baseline = loadBaseline();
const baseKeys = new Set((baseline.entries || []).map((e) => e.key));
const fresh = findings.filter((f) => !baseKeys.has(keyOf(f)));
const stale = [...baseKeys].filter((k) => !findings.some((f) => keyOf(f) === k));

if (argv.includes("--update-baseline")) {
  writeFileSync(BASELINE, `${JSON.stringify({
    note: "Shrink-only baseline of known report-blind consumers. Entries may be REMOVED as sites are fixed; a NEW entry must be a deliberate, reviewed act. See scripts/audit-report-blind-consumers.mjs.",
    generated_by: "scripts/audit-report-blind-consumers.mjs --update-baseline",
    entries: findings.map((f) => ({ key: keyOf(f), file: f.file, line: f.line, why: f.why })),
  }, null, 2)}\n`, "utf8");
  console.log(`baseline written: ${findings.length} entries`);
  process.exit(0);
}

if (argv.includes("--json")) {
  console.log(JSON.stringify({ findings, fresh, stale, totalCallSites, filesInScope, filesSkippedAsTest }, null, 2));
  process.exit(fresh.length > 0 ? 1 : 0);
}

console.log(`\naudit-report-blind-consumers — ${WATCHED.map((s) => `${s.api}(.${s.value} / .${s.report})`).join(", ")}`);
console.log(`  scanned ${files.length} source files · ${filesInScope} in scope · ${filesSkippedAsTest} test files excluded by scope · ${totalCallSites} call sites`);
for (const f of findings) {
  const mark = f.kind === "VIOLATION" ? "x" : "?";
  const tag = baseKeys.has(keyOf(f)) ? "  [baselined]" : "";
  console.log(`    ${mark} ${f.file}:${f.line}  ${f.binding} — ${f.why}${tag}`);
}
if (stale.length > 0) {
  console.log(`\n  ${stale.length} baseline entr${stale.length === 1 ? "y is" : "ies are"} STALE (fixed — remove with --update-baseline):`);
  for (const k of stale) console.log(`    - ${k}`);
}
console.log(`\nVIOLATIONS: ${fresh.length}  (${findings.length - fresh.length} baselined)`);
if (fresh.length > 0) {
  console.log(`\nA consumer that reads a result's VALUE but not its REPORT is fail-open by construction.`);
  for (const s of WATCHED) console.log(`  ${s.api}: ${s.why}`);
}
process.exit(fresh.length > 0 ? 1 : 0);
