#!/usr/bin/env node
// audit-gscm.mjs — GSCM comment-coverage auditor (RD-0265, 2026-07-04).
//
// Proves, flow-by-flow, that the agreed comment model is actually present — the owner's ask was
// "I need to KNOW all the different comments have been added". For every flow declaration in the
// scanned corpus it inspects the contiguous comment block immediately above and reports coverage of:
//   ;;        govComment (signed → .lmanifest)         REQUIRED
//   // @cause GSCM trigger tag                          REQUIRED
//   // @effect GSCM outcome tag                         REQUIRED
//   // @todo  GSCM unfinished-work tag                  OPTIONAL (never fabricated — counted, not required)
//
// Default root is examples/ — deliberately NOT the byte-locked self-hosted corpus (that retrofit is
// owner-gated, task #12); pass an explicit root to scan elsewhere. Exit = number of flows missing a
// REQUIRED form (0 = full coverage); --soft forces exit 0 (phase-close wiring).
//
//   node scripts/audit-gscm.mjs                → coverage matrix over examples/
//   node scripts/audit-gscm.mjs --gaps         → also list every flow missing something, file:line
//   node scripts/audit-gscm.mjs --json         → machine-readable
//   node scripts/audit-gscm.mjs --self-test    → prove detection fires + stays silent correctly
import { readdirSync, statSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// A flow DECLARATION line: optional indent, optional `governed <tier>`, optional qualifier, `flow NAME(`.
// The trailing `(` is load-bearing: a bare `flow NAME` (no parameter list) is a route-BINDING reference
// inside a `route … { }` block, not a declaration — comments live at the declaration, so bindings are skipped.
const FLOW_RE = /^\s*(?:governed\s+\w+\s+)?(?:secure\s+|guarded\s+|pure\s+)?flow\s+([A-Za-z_]\w*)\s*\(/;

/** Analyse one source: [{name, line, gov, cause, effect, todo}] per flow. */
export function analyse(src) {
  const lines = src.split(/\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = FLOW_RE.exec(lines[i]);
    if (!m) continue;
    // Walk UP through the contiguous comment block directly above the declaration.
    // Members: `;;`, `//`, block-comment interior (`/*`, `*`, `*/`) — a blank or code line ends it.
    let gov = false, cause = false, effect = false, todo = false;
    for (let j = i - 1; j >= 0; j--) {
      const t = lines[j].trim();
      const isComment = t.startsWith(";;") || t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || t.endsWith("*/");
      if (t === "" || !isComment) break;
      if (t.startsWith(";;")) gov = true;
      if (/^(?:\/\/|\*)\s*@cause\b/.test(t)) cause = true;
      if (/^(?:\/\/|\*)\s*@effect\b/.test(t)) effect = true;
      if (/^(?:\/\/|\*)\s*@todo\b/.test(t)) todo = true;
    }
    out.push({ name: m[1], line: i + 1, gov, cause, effect, todo });
  }
  return out;
}

const SKIP_DIR = new Set(["node_modules", "dist", "build", ".git", ".graph", "test-fixtures"]);
function walk(dir, acc) {
  let ents;
  try { ents = readdirSync(dir); } catch { return acc; }
  for (const e of ents) {
    if (SKIP_DIR.has(e) || e.startsWith(".")) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if (e.endsWith(".fungi")) acc.push(p);
  }
  return acc;
}

const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && process.argv.includes("--self-test")) {
  const full = ";; safe\n// @cause  [X] -> a.\n// @effect [Y] -> b.\nflow f(a: Int) -> Int {\n}";
  const noTags = ";; safe\nflow g() -> Int {\n}";
  const blockForm = "/*\n * @cause [X] -> a.\n * @effect [Y] -> b.\n */\n;; safe\nsecure flow h(readonly request: R) -> S {\n}";
  const gapAbove = ";; safe\n// @cause [X] -> a.\n\nflow i() -> Int {\n}"; // blank line breaks the block
  const todoToo = ";; safe\n// @cause [X] -> a.\n// @effect [Y] -> b.\n// @todo [AI] -> later.\nguarded flow j() -> Int {\n}";
  const cases = {
    "full stack detected":            (() => { const r = analyse(full)[0];      return r.gov && r.cause && r.effect && !r.todo; })(),
    "missing tags detected":          (() => { const r = analyse(noTags)[0];    return r.gov && !r.cause && !r.effect; })(),
    "JSDoc block form counts":        (() => { const r = analyse(blockForm)[0]; return r.gov && r.cause && r.effect; })(),
    "blank line breaks the block":    (() => { const r = analyse(gapAbove)[0];  return !r.cause; })(),
    "@todo counted when present":     (() => { const r = analyse(todoToo)[0];   return r.todo; })(),
    "indented flow inside gate{}":    (() => { const r = analyse("  ;; safe\n  // @cause [X] -> a.\n  // @effect [Y] -> b.\n  flow k() -> Int {")[0]; return r !== undefined && r.cause && r.effect; })(),
    "route-binding ref NOT counted":  (() => { const r = analyse('route GET "/health" {\n  response HealthStatus\n  flow healthCheck\n}'); return r.length === 0; })(),
  };
  let ok = true;
  for (const [name, pass] of Object.entries(cases)) { console.log(`  ${pass ? "✓" : "✗ FAIL"} ${name}`); if (!pass) ok = false; }
  console.log(ok ? "[self-test] PASS" : "[self-test] FAIL");
  process.exit(ok ? 0 : 1);
}

if (isMain) {
  const args = process.argv.slice(2);
  const soft = args.includes("--soft"), json = args.includes("--json"), gaps = args.includes("--gaps");
  const rootArg = args.find((a) => !a.startsWith("--"));
  const root = rootArg ?? join(process.cwd(), "examples");
  const files = walk(root, []);
  const rows = [];
  for (const f of files) {
    let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
    const rel = f.replace(/\\/g, "/").replace(root.replace(/\\/g, "/") + "/", "");
    for (const r of analyse(src)) rows.push({ file: rel, ...r });
  }
  const tot = rows.length;
  const c = (k) => rows.filter((r) => r[k]).length;
  const missing = rows.filter((r) => !r.gov || !r.cause || !r.effect);
  if (json) {
    console.log(JSON.stringify({ root, files: files.length, flows: tot, coverage: { govComment: c("gov"), cause: c("cause"), effect: c("effect"), todo: c("todo") }, missing }, null, 2));
  } else {
    console.log(`gscm-coverage over ${root} — ${files.length} files · ${tot} flows`);
    const pct = (n) => tot === 0 ? "—" : `${n}/${tot} (${Math.round((n / tot) * 100)}%)`;
    console.log(`  ;;  govComment : ${pct(c("gov"))}   [REQUIRED]`);
    console.log(`  @cause         : ${pct(c("cause"))}   [REQUIRED]`);
    console.log(`  @effect        : ${pct(c("effect"))}   [REQUIRED]`);
    console.log(`  @todo          : ${c("todo")} flow(s)   [optional — only genuine unfinished work]`);
    if (gaps || missing.length) {
      for (const r of missing.slice(0, 40)) {
        const lack = [!r.gov && ";;", !r.cause && "@cause", !r.effect && "@effect"].filter(Boolean).join(" + ");
        console.log(`  ✗ ${r.file}:${r.line}  ${r.name} — missing ${lack}`);
      }
      if (missing.length > 40) console.log(`  … +${missing.length - 40} more`);
    }
    console.log(`MISSING-REQUIRED: ${missing.length}${missing.length === 0 ? "  — full coverage ✅" : ""}`);
  }
  process.exit(soft ? 0 : missing.length > 0 ? 1 : 0);
}
