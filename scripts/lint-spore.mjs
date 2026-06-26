#!/usr/bin/env node
// lint-spore.mjs — `.spore` source-quality gate (owner rules, 2026-06-23).
//
// Enforces three authoring rules + an AI-slop / bad-syntax sweep, so "write a comment, declare a
// contract, don't ship slop" is a TOOL not advice (TASK-ENV-001 family). Heuristics are deliberately
// HIGH-SIGNAL / LOW-FALSE-POSITIVE: a linter that cries wolf is itself slop. When unsure it stays quiet.
//
// Rules (each finding has a stable code; whitelist by code/file/line):
//   1. FLOW COMMENTS        — every flow has a human `//` comment directly above it (the `//spore:`
//                             generated provenance lines do NOT count).            → SPORE-LINT-COMMENT
//   2. CONTRACTS            — every flow declares `contract { … }` with an `intent {}`, and as many
//                             other clauses as apply — EXCEPT the auto-by-default ones, which must be
//                             omitted (let the runtime infer them):                → SPORE-LINT-CONTRACT
//                             secrets · economics · epilogue · cyber_physical_hardening · liability
//                                                                                  → SPORE-LINT-INTENT / SPORE-LINT-AUTO-SETTING
//   3. QUALITY (no slop)    — filler/hedging comments, AI-assistant artifacts, placeholder names,
//                             emoji, vacuous intent strings; plus bad syntax: contract-inside-body,
//                             `match` with no `_ =>` wildcard, unbalanced braces, tabs, trailing space.
//
// Whitelist (so the gate is precise, not blunt):
//   - default file `governance/spore-lint-allow.json` (auto-loaded if present),
//   - `--whitelist <file>` (merged on top),
//   - inline `//spore-allow: CODE[,CODE]` on the offending line OR the line directly above a flow.
//
// Flags:  --json   --soft (always exit 0)   --summary   --whitelist <f>   --no-default-whitelist
//         [paths…]  (default scan roots: packages-galerina, examples, tests)
// Prints `VIOLATIONS: N` for the lint-conventions umbrella. Run from repo root.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const soft = argv.includes("--soft");
const summary = argv.includes("--summary");
const noDefaultWl = argv.includes("--no-default-whitelist");
const wlArg = argv.includes("--whitelist") ? argv[argv.indexOf("--whitelist") + 1] : undefined;
const ROOT = process.cwd();
const paths = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--whitelist");
const SCAN_ROOTS = paths.length > 0 ? paths : ["packages-galerina", "examples", "tests"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

// ── Slop dictionaries (tight on purpose — only egregious tells) ─────────────────────────────────
// Filler/hedging comment bodies (matched as the WHOLE comment after `//`, case-insensitive, anchored).
const FILLER_COMMENT = [
  /^todo\b/, /^fixme\b/, /^xxx\b/, /^hack\b/, /^note:?\s*$/, /^here we\b/, /^this (function|flow|method|code)\b/,
  /^helper( function)?\.?$/, /^placeholder\b/, /^for (demonstration|example|illustration|now)\b/,
  /^in a real (implementation|app|application|world|system)\b/, /^(simply|just|basically|obviously)\b/,
  /^as you can see\b/, /^self.?explanatory\b/, /^do(es)? (the|some)? ?(stuff|thing|work)\b/, /^magic\b/,
];
// AI-assistant artifacts that should NEVER appear in committed source.
const AI_ARTIFACT = [
  /\bas an ai\b/i, /\bi cannot\b/i, /\bi apologi[sz]e\b/i, /^certainly[!.]/i, /\bhere'?s (the|a|how|your)\b/i,
  /\bi hope this helps\b/i, /\bfeel free to\b/i, /\blet me know if\b/i, /\bhappy to help\b/i,
  /\b(above|below) (code|function|snippet)\b/i, /\bas requested\b/i, /\bcertainly! here\b/i,
];
// Placeholder identifiers (egregious only — NOT data/result/value, which are legit).
const PLACEHOLDER_NAME = new Set([
  "foo", "bar", "baz", "qux", "quux", "temp", "tmp", "thing", "stuff", "dostuff", "dosomething",
  "myflow", "test123", "asdf", "qwerty", "blah", "xyz", "abc", "func1", "function1", "flow1", "handlething",
]);
// contract sub-blocks that are AUTO-by-default — declaring them manually is the rule-2 exception.
const AUTO_SETTINGS = new Set(["secrets", "economics", "epilogue", "cyber_physical_hardening", "liability"]);
// Recognised contract sub-block keywords (for presence detection).
const CONTRACT_CLAUSES = new Set([
  "types", "intent", "request", "response", "effects", "authority", "privacy", "secrets", "audit",
  "limits", "economics", "epilogue", "targets", "invariant", "cyber_physical_hardening", "liability",
]);
const FLOW_RE = /^(\s*)(?:(?:pure|secure|guarded)\s+)?flow\s+([A-Za-z_]\w*)\s*\(/;
// True pictographic emoji ONLY (the 1F000–1FAFF planes: emoticons, pictographs, transport,
// supplemental, regional indicators, enclosed). Deliberately EXCLUDES arrows (→ ⇒ ←), dingbat
// checkmarks (✓ ✗), warning signs (⚠), and math (≤ ≥) — those are legitimate typography used
// throughout Galerina comments and are NOT slop.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}]/u;

// ── Whitelist ───────────────────────────────────────────────────────────────────────────────────
function loadWhitelist() {
  const wl = { files: new Set(), rules: new Set(), allow: [], skip: [] };
  const sources = [];
  if (!noDefaultWl) sources.push(join(ROOT, "governance", "spore-lint-allow.json"));
  if (wlArg) sources.push(wlArg);
  for (const src of sources) {
    if (!existsSync(src)) continue;
    try {
      const j = JSON.parse(readFileSync(src, "utf8"));
      for (const f of j.files ?? []) wl.files.add(f.split("/").join(sep));
      for (const r of j.rules ?? []) wl.rules.add(r);
      for (const a of j.allow ?? []) wl.allow.push(a);
      for (const s of j.skipPathContains ?? []) wl.skip.push(s);
    } catch (e) {
      console.error(`lint-spore: could not parse whitelist ${src}: ${e.message}`);
    }
  }
  return wl;
}
// A file whose rel-path contains any skip substring is exempt wholesale (fixtures/examples/benchmarks).
function isSkipped(wl, rel) { return wl.skip.some((s) => rel.includes(s)); }
function isWhitelisted(wl, rel, code, line) {
  if (wl.rules.has(code)) return true;
  if (wl.files.has(rel.split("/").join(sep)) || wl.files.has(rel)) return true;
  return wl.allow.some((a) =>
    (a.file === undefined || a.file === rel || a.file.split("/").join(sep) === rel.split("/").join(sep)) &&
    (a.rule === undefined || a.rule === code) &&
    (a.line === undefined || a.line === line));
}

// ── File discovery ────────────────────────────────────────────────────────────────────────────
function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(p); }
    else if (e.name.endsWith(".spore")) yield p;
  }
}
function discover() {
  const out = [];
  for (const r of SCAN_ROOTS) {
    const abs = join(ROOT, r);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isFile()) { if (abs.endsWith(".spore")) out.push(abs); }
    else out.push(...walk(abs));
  }
  return out;
}

// ── Comment / string aware brace matcher (char scan over the whole file) ────────────────────────
// Returns the index just AFTER the brace that closes the one at `open`, or -1. Ignores braces inside
// `// …` and `;; …` line comments and `"…"` / `'…'` strings.
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    if (c === ";" && text[i + 1] === ";") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < text.length && text[i] !== q) { if (text[i] === "\\") i++; i++; } continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

// ── Per-file lint ───────────────────────────────────────────────────────────────────────────────
function lintFile(abs, wl, findings) {
  const rel = relative(ROOT, abs).split(sep).join("/");
  const text = readFileSync(abs, "utf8");
  const lines = text.split(/\r?\n/);

  // line offsets so a char index → line number
  const lineStart = [0];
  for (let i = 0; i < lines.length; i++) lineStart.push(lineStart[i] + lines[i].length + 1);
  const lineOf = (idx) => { let lo = 0, hi = lineStart.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lineStart[m] <= idx) lo = m; else hi = m - 1; } return lo + 1; };

  const inlineAllow = (lineNo) => {
    const m = (lines[lineNo - 1] ?? "").match(/\/\/spore-allow:\s*([A-Z0-9,\- ]+)/);
    return m ? new Set(m[1].split(",").map((s) => s.trim())) : null;
  };
  const add = (code, line, msg) => {
    if (isWhitelisted(wl, rel, code, line)) return;
    const here = inlineAllow(line); const above = inlineAllow(line - 1);
    if ((here && here.has(code)) || (above && above.has(code))) return;
    findings.push({ file: rel, line, code, msg });
  };

  // ── line-level slop sweeps (comments + emoji + tabs + trailing ws) ──
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]; const no = i + 1;
    if (/\t/.test(ln.match(/^\s*/)[0])) add("SPORE-SYNTAX-TAB", no, "tab in indentation — use spaces");
    if (/[ \t]+$/.test(ln)) add("SPORE-SYNTAX-TRAILING-WS", no, "trailing whitespace");
    if (EMOJI_RE.test(ln)) add("SPORE-SLOP-EMOJI", no, "emoji in source");
    const cm = ln.match(/\/\/\s?(.*)$/);
    if (cm && !ln.includes("//spore:") && !ln.includes("//spore-allow:")) {
      const body = cm[1].trim();
      const low = body.toLowerCase();
      if (body && FILLER_COMMENT.some((re) => re.test(low))) add("SPORE-SLOP-FILLER-COMMENT", no, `filler/hedging comment: "${body.slice(0, 50)}"`);
      if (AI_ARTIFACT.some((re) => re.test(body))) add("SPORE-SLOP-AI-ARTIFACT", no, `AI-assistant artifact in source: "${body.slice(0, 50)}"`);
    }
  }

  // ── whole-file brace balance (heuristic; ignores comments/strings) ──
  let depth = 0, bad = false;
  for (let i = 0; i < text.length && !bad; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i++; continue; }
    if (c === ";" && text[i + 1] === ";") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === '"' || c === "'") { const q = c; i++; while (i < text.length && text[i] !== q) { if (text[i] === "\\") i++; i++; } continue; }
    if (c === "{") depth++; else if (c === "}") { depth--; if (depth < 0) bad = true; }
  }
  if (bad || depth !== 0) add("SPORE-SYNTAX-BRACE", 1, `unbalanced braces (net ${depth}) — likely a syntax error`);

  // ── per-flow checks ──
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FLOW_RE);
    if (!m) continue;
    const flowLine = i + 1;
    const name = m[2];

    // placeholder name
    if (PLACEHOLDER_NAME.has(name.toLowerCase())) add("SPORE-SLOP-PLACEHOLDER-NAME", flowLine, `placeholder flow name "${name}"`);

    // rule 1 — human comment directly above (skip //spore: provenance; a blank gap breaks association)
    let hasComment = false;
    for (let j = i - 1; j >= 0; j--) {
      const t = lines[j].trim();
      if (t === "") break;                       // blank gap → not attached
      if (t.startsWith("//spore:")) continue;      // generated provenance — not a human comment
      if (t.startsWith("//")) { const c = t.slice(2).trim(); if (c !== "") { hasComment = true; } continue; }
      break;                                     // hit code → stop
    }
    if (!hasComment) add("SPORE-LINT-COMMENT", flowLine, `flow "${name}" has no human comment (rule 1)`);

    // rule 2 — contract presence + intent + auto-settings + contract-in-body
    const declStart = lineStart[i];
    const bodyText = text.slice(declStart);
    // find `contract` token before the body opens. The body is the first `{` that is not the start of
    // `contract {`/`policy {`. Heuristic: locate `contract` and the first top-level `{` after the signature.
    const sigCloseRel = bodyText.indexOf(")");
    const afterSig = sigCloseRel >= 0 ? bodyText.slice(sigCloseRel) : bodyText;
    const contractRel = afterSig.search(/\bcontract\b/);
    const firstBraceRel = afterSig.indexOf("{");
    const hasContract = contractRel >= 0 && (firstBraceRel < 0 || contractRel < firstBraceRel + 1);
    if (!hasContract) {
      add("SPORE-LINT-CONTRACT", flowLine, `flow "${name}" declares no contract {} (rule 2)`);
    } else {
      // parse the contract block to see its sub-blocks
      const contractAbs = declStart + (sigCloseRel >= 0 ? sigCloseRel : 0) + contractRel;
      const braceOpen = text.indexOf("{", contractAbs);
      const braceClose = braceOpen >= 0 ? matchBrace(text, braceOpen) : -1;
      if (braceOpen >= 0 && braceClose > braceOpen) {
        const inner = text.slice(braceOpen + 1, braceClose - 1);
        const clauses = new Set();
        for (const cm of inner.matchAll(/\b([a-z_]+)\s*\{/g)) if (CONTRACT_CLAUSES.has(cm[1])) clauses.add(cm[1]);
        if (!clauses.has("intent")) add("SPORE-LINT-INTENT", flowLine, `flow "${name}" contract has no intent {} (rule 2)`);
        for (const c of clauses) if (AUTO_SETTINGS.has(c)) add("SPORE-LINT-AUTO-SETTING", lineOf(braceOpen + 1 + inner.indexOf(c)), `contract declares the AUTO-by-default setting "${c}" — omit it (let the runtime infer; rule 2 exception)`);
        // vacuous intent
        const im = inner.match(/\bintent\s*\{\s*"([^"]*)"/);
        if (im) { const s = im[1].trim(); if (s.length < 12 || /^todo$/i.test(s) || s.toLowerCase() === name.toLowerCase()) add("SPORE-SLOP-VACUOUS-INTENT", flowLine, `intent string is vacuous/too short: "${s}"`); }
        // contract-in-body: did the body open BEFORE this contract? (the #1 AI mistake)
        const bodyBeforeContract = afterSig.slice(0, contractRel).lastIndexOf("{");
        if (bodyBeforeContract >= 0) add("SPORE-SYNTAX-CONTRACT-IN-BODY", flowLine, `flow "${name}" puts contract {} INSIDE the body — it must sit between signature and body`);
      }
    }

    // NOTE: match exhaustiveness (the mandatory `_ =>` / `else =>` catch-all, SPORE-TYPE-023) is
    // deliberately NOT checked here — the COMPILER enforces it authoritatively. Duplicating it in a
    // text heuristic only adds false-positive risk on complex flows; this gate covers what the
    // compiler does NOT: comments, contract completeness, and slop.
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────────────────────
const wl = loadWhitelist();
const allFiles = discover();
const files = allFiles.filter((f) => !isSkipped(wl, relative(ROOT, f).split(sep).join("/")));
const skippedCount = allFiles.length - files.length;
const findings = [];
for (const f of files) { try { lintFile(f, wl, findings); } catch (e) { findings.push({ file: relative(ROOT, f), line: 1, code: "SPORE-LINT-ERROR", msg: `lint crashed: ${e.message}` }); } }

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
const byCode = {};
for (const f of findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1;

if (asJson) {
  console.log(JSON.stringify({ tool: "lint-spore", scanned: files.length, skippedFixtures: skippedCount, violations: findings.length, byCode, findings }, null, 2));
} else if (summary) {
  const codes = Object.entries(byCode).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(" · ");
  console.log(`lint-spore: ${files.length} .spore scanned (${skippedCount} fixtures skipped) · ${findings.length} finding(s)${findings.length ? " — " + codes : ""}`);
  console.log(`VIOLATIONS: ${findings.length}`);
} else {
  const out = ["# lint-spore — .spore source-quality gate (rules: flow comments · contracts · no slop)\n"];
  for (const f of findings) out.push(`${f.file}:${f.line}  ${f.code}  ${f.msg}`);
  out.push(`\nScanned ${files.length} .spore file(s) (${skippedCount} fixtures skipped via whitelist) · ${findings.length} finding(s)`);
  if (Object.keys(byCode).length) out.push(Object.entries(byCode).sort((a, b) => b[1] - a[1]).map(([c, n]) => `  ${c}: ${n}`).join("\n"));
  out.push(findings.length === 0 ? "CLEAN ✓ — every flow is commented + contracted and no slop detected." : "Whitelist false positives in governance/spore-lint-allow.json or with //spore-allow: <CODE>.");
  out.push(`VIOLATIONS: ${findings.length}`);
  console.log(out.join("\n"));
}
process.exit(soft ? 0 : Math.min(findings.length, 250));
