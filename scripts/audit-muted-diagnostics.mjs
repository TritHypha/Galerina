#!/usr/bin/env node
// =============================================================================
// audit-muted-diagnostics.mjs — visibility + gate for MUTED security/governance codes
// =============================================================================
// THE CONCERN (owner, 2026-07-01): "early in the project some codes were muted to
// stop them alerting during build — could they still be off?" A silenced security
// or governance check is an active fail-open. This audit makes every muting VISIBLE
// and GATES against NEW silent muting.
//
// It scans the compiler source for two muting mechanisms:
//   (1) MODE-GATED severity — `severity: mode === "production" ? "error" : "warning"`
//       (and isProduction/profile variants): the code is downgraded outside a
//       production build. Confined to iteration modes BY DESIGN (a documented
//       warning→error migration), but a NEW security code appearing here must be a
//       deliberate, reviewed choice — not silent.
//   (2) SUPPRESS sets — `const SUPPRESS = new Set([... "FUNGI-*" ...])` in test/audit
//       scripts that silence codes during example assertions.
//
// A security/governance code that is muted but NOT on the reviewed ALLOWLIST below
// makes this audit exit 1. Cosmetic codes (TYPE/SYNTAX/NAME/HINT) are reported, not gated.
//
// Usage:  node scripts/audit-muted-diagnostics.mjs [--json] [--root <dir>]
// =============================================================================
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const rootIdx = process.argv.indexOf("--root");
const ROOT = rootIdx !== -1 ? process.argv[rootIdx + 1] : join(HERE, "..");
const COMPILER_SRC = join(ROOT, "packages-galerina/galerina-core-compiler");

// Code families that are SECURITY / GOVERNANCE / SAFETY (muting these = fail-open).
const SECURITY_GOV = /^FUNGI-(SECRET|PRIVACY|GOV|EFFECT|VALUESTATE|TENANT|PII|PHI|AUDIT|INTENT|CAP|TIER|CRYPTO|SUBSTRATE|RETAIN|SECURITY|SEC|TAINT)\b/;

// ── ALLOWLIST — muted codes that have been REVIEWED and accepted as intentional.
// Each MUST carry a reason. Adding a security/gov code here is the explicit, auditable
// act of accepting the mute; the point is that it can no longer happen SILENTLY.
const ALLOWLIST = {
  // Deliberate warning→error migration: error in build --production, softer in dev
  // iteration. Tracked for the migration + the signing-boundary hardening (2026-07-01).
  "FUNGI-SECRET-002":    "migration: error in production build; dev warning (fail-loud). Pending signing-boundary fix.",
  "FUNGI-SECRET-006":    "#20 split of SECRET-002 (SECRET_CROSSES_FLOW_BOUNDARY); inherits the same reviewed prod-error/dev-warning toggle. RD-0412.",
  "FUNGI-PRIVACY-002":   "migration: error in production build; dev warning. Pending signing-boundary fix.",
  "FUNGI-PRIVACY-004":   "#20 split of PRIVACY-002 (EMBEDDING_CROSSES_FLOW_BOUNDARY); inherits the same reviewed toggle. RD-0412.",
  "FUNGI-EFFECT-004":    "migration: error in production; dev warning (non-canonical effect).",
  "FUNGI-EFFECT-001":    "migration: error in production; warning in check/build (undeclared effect).",
  "FUNGI-STDLIB-001":    "migration: error in production; warning in check/build (stdlib effect).",
  "FUNGI-GOV-002":       "migration: warning in production, info in dev (missing audit for governed sink).",
  "FUNGI-GOV-010":       "migration: error in production, info in dev (intent missing on secure flow).",
  "FUNGI-GOV-004":       "deliberate: fail-closed error in production/deterministic; dev warning (conforms_to policy may be in an unfinished file). Verified 2026-07-01.",
  "FUNGI-GOV-021":       "#20 split of GOV-004 (DOMAIN_GUARD_NOT_FOUND); inherits the same reviewed fail-closed prod-error/dev-warning toggle. RD-0412.",
  "FUNGI-GOV-024":       "deliberate: SANDBOX_REQUIRED_BUT_UNAVAILABLE — error in production/deterministic, warning in dev (sandbox gate is enforced strictly at the prod build boundary). Item 7 Bob architectural review 2026-07.",
  "FUNGI-SUBSTRATE-002": "deliberate: production/deterministic error, dev warning (tolerance unachievable on a noisy substrate lane — compute-safety). Verified 2026-07-01.",
  "FUNGI-VALUESTATE-008":"migration: downgraded in dev/check/build (untrusted boundary input).",
};
// Codes accepted as SUPPRESSED in test/audit example-assertion scripts (test-scoped, not runtime).
const SUPPRESS_ALLOWLIST = {
  "FUNGI-GOV-002": "examples focus on other concepts; governance gap tracked separately",
  "FUNGI-GOV-007": "authority-block-reason not the subject under test",
  "FUNGI-EFFECT-004": "non-canonical effect names in legacy examples; tracked by audit-effect-canonicality",
  "FUNGI-EFFECT-009": "#20 split of EFFECT-004's alias arm (NON_CANONICAL_EFFECT); the CEC suppression follows the arm. RD-0412.",
  "FUNGI-VALUESTATE-006": "Wave-2 example-promotion: Protected boundary violation suppressed while examples are cleaned; TODO un-suppress once examples pass.",
  "FUNGI-VALUESTATE-009": "#20 split of VALUESTATE-006's audit-log arm (PROTECTED_VALUE_AT_AUDIT_LOG); the CEC suppression follows the arm. RD-0412.",
  "FUNGI-VALUESTATE-002": "Wave-2 example-promotion: Unsafe conditional upgrade suppressed while examples are cleaned; TODO un-suppress once examples pass.",
};

// ── scan TS sources for mode-gated diagnostics ───────────────────────────────
function tsFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "node_modules" || e === "dist") continue;
    const st = statSync(p);
    if (st.isDirectory()) out.push(...tsFiles(p));
    else if (e.endsWith(".ts") && !e.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const MODE_GATE = /\b(mode|this\.mode|profile)\b[^?\n]*===\s*"production"|isProduction/;
const TERNARY_SEV = /\?\s*"(error|warning|info)"\s*:\s*"(error|warning|info)"/;
// Match a code whether written `code: "FUNGI-X"` OR positional `makeGovDiag("FUNGI-X", ...)`.
const CODE_RE = /"(FUNGI-[A-Z0-9-]+)"/;

const modeGated = [];  // { code, prodSev, devSev, file, line }
for (const f of existsSync(join(COMPILER_SRC, "src")) ? tsFiles(join(COMPILER_SRC, "src")) : []) {
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!MODE_GATE.test(lines[i]) || !TERNARY_SEV.test(lines[i])) continue;
    const sev = lines[i].match(TERNARY_SEV);
    // find the nearest code: within this diagnostic object (look up, then down)
    let code = null;
    for (let d = 0; d <= 15 && !code; d++) {
      const up = lines[i - d], dn = lines[i + d];
      if (up && CODE_RE.test(up)) code = up.match(CODE_RE)[1];
      else if (dn && CODE_RE.test(dn)) code = dn.match(CODE_RE)[1];
    }
    modeGated.push({ code: code ?? "(code-not-located)", prodSev: sev[1], devSev: sev[2],
                     file: f.slice(ROOT.length + 1).replace(/\\/g, "/"), line: i + 1 });
  }
}

// ── scan for SUPPRESS sets (test/audit scripts) ──────────────────────────────
const suppressed = [];  // { code, file }
function scanSuppress(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "node_modules" || e === "dist") continue;
    const st = statSync(p);
    if (st.isDirectory()) { scanSuppress(p); continue; }
    if (!/\.(mjs|ts|js)$/.test(e)) continue;
    const txt = readFileSync(p, "utf8");
    const m = txt.match(/(?:SUPPRESS|MUTED|muted|suppress)\w*\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    if (!m) continue;
    for (const c of m[1].matchAll(/"(FUNGI-[A-Z0-9-]+)"/g))
      suppressed.push({ code: c[1], file: p.slice(ROOT.length + 1).replace(/\\/g, "/") });
  }
}
if (existsSync(COMPILER_SRC)) scanSuppress(COMPILER_SRC);

// ── evaluate ─────────────────────────────────────────────────────────────────
const isSecGov = (c) => SECURITY_GOV.test(c);
const violations = [];
for (const g of modeGated) {
  if (isSecGov(g.code) && !(g.code in ALLOWLIST))
    violations.push({ kind: "mode-gated", ...g });
}
const suppressViolations = [];
for (const s of suppressed) {
  if (isSecGov(s.code) && !(s.code in SUPPRESS_ALLOWLIST))
    suppressViolations.push({ kind: "suppressed", ...s });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ modeGated, suppressed: [...new Set(suppressed.map(s => s.code))],
    violations, suppressViolations,
    blocking: violations.length + suppressViolations.length }, null, 2));
  process.exit(violations.length + suppressViolations.length ? 1 : 0);
}

console.log(`\n=== muted-diagnostics audit ===`);
console.log(`   mode-gated diagnostics: ${modeGated.length} | SUPPRESS-set codes: ${new Set(suppressed.map(s=>s.code)).size}`);
console.log(`\n   Security/governance codes that are MODE-GATED (soft outside a production build):`);
for (const g of modeGated.filter(g => isSecGov(g.code))) {
  const ok = g.code in ALLOWLIST;
  console.log(`     ${ok ? "✓" : "❌"} ${g.code}  [${g.file}:${g.line}]  prod=${g.prodSev} dev=${g.devSev}${ok ? "" : "  ← NOT reviewed/allowlisted"}`);
}
console.log(`\n   Security/governance codes SUPPRESSED in test/audit scripts:`);
for (const c of [...new Set(suppressed.filter(s => isSecGov(s.code)).map(s => s.code))]) {
  const ok = c in SUPPRESS_ALLOWLIST;
  console.log(`     ${ok ? "✓" : "❌"} ${c}${ok ? "" : "  ← NOT reviewed/allowlisted"}`);
}
const total = violations.length + suppressViolations.length;
if (total === 0) {
  console.log(`\n   ✅ every muted security/governance code is on a reviewed allowlist (no SILENT muting)`);
  process.exit(0);
}
console.log(`\n   ❌ ${total} security/governance code(s) muted WITHOUT review — re-arm or allowlist-with-reason:`);
for (const v of [...violations, ...suppressViolations]) console.log(`        • ${v.code} (${v.kind}) ${v.file}${v.line ? ":" + v.line : ""}`);
process.exit(1);
