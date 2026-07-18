#!/usr/bin/env node
// =============================================================================
// audit-cast-hygiene.mjs — LINT: no NEW bare `as Verdict` / `as Trit` authority cast.
// =============================================================================
// The cast-hygiene linchpin (R&D sorted-critical-path S0, 2026-07-18). A governance `Verdict` (and the
// arithmetic `Trit`) carries AUTHORITY; a bare TypeScript cast `x as Verdict` MINTS that authority by fiat,
// bypassing every gate/vote — the confused-deputy / authority-laundering path a type-BRAND cannot see (a
// brand constrains a value's type, but `as` overrides the type-checker). SUITE 5 (verify-governance-algebra,
// 169/169) proves the concrete harm: an *unvoted* substrate reading cast to a Verdict manufactures ALLOW.
// "parse, don't cast" — mint a Verdict only through a blessed constructor that actually decides; never `as`.
//
// This gate is the ENFORCEMENT half (the brand is cosmetic without it — R&D). It is a pure detector with a
// SHRINK-ONLY, location-keyed BASELINE of the casts that exist today (all in tower-citizen). Any authority
// cast NOT in the baseline — anywhere in packages-galerina src — is a VIOLATION (exit = count). The baseline
// documents the known debt to remediate (behind a blessed `asVerdict()` / a gate), it does not bless growth:
// a moved or added cast fails, and a baseline entry that no longer matches is surfaced (prune it — don't let
// the allowlist outlive the debt). Additive: it touches no governance code, so it cannot regress the kernel.
//
// Flags:  --json  machine-readable.   --soft  report-only (exit 0).   --self-test  run own hermetic proof.
// Build-free (reads source text). Pattern mirrors the audit-* family: detector + --self-test + `VIOLATIONS: N`
// + exit = count. Run from repo root:  node scripts/audit-cast-hygiene.mjs
// =============================================================================
import { readdirSync, readFileSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE); // repo root (scripts/..)
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const soft = argv.includes("--soft");
const SELFTEST = argv.includes("--self-test");

// The authority names a bare `as` may not mint. R&D S0 scope = Verdict + Trit; extend to the epistemic
// vocabulary (Secret/Trusted/Tainted/…) only when those casts are proven to exist (avoid the B0 over-reach).
const BANNED = ["Verdict", "Trit"];
const CAST_RE = new RegExp(`\\bas\\s+(${BANNED.join("|")})\\b`, "g");

// SHRINK-ONLY baseline — authority casts that exist and are known remediation debt, keyed by (repo-relative
// file, trimmed line). Remediate → delete the entry (the gate then forbids that cast forever).
// ★ 2026-07-18 (S0): the 7 original `as Verdict` casts are all GONE (6 → the blessed `asVerdict()`, 2 redundant
// dropped). The ONLY allowlisted cast is the single blessed number→Trit mint inside `asTrit()` — a branded type
// (`number & {__trit}`) cannot be produced by `if`-narrowing, so its constructor needs exactly one `as Trit`,
// validated first (SecurityTrap on a non-trit). Everything else is ZERO-TOLERANCE: any other `as Verdict`/`as
// Trit` anywhere is a violation. A future blessed cast goes here WITH a note — but a mint is the only door.
const BASELINE = [
  { file: "packages-galerina/galerina-tower-citizen/src/tpl-simulator.ts", line: "return n as Trit;",
    note: "the ONE blessed number→Trit mint, inside asTrit() (validates -1|0|1 first; mirrors asVerdict). RD-0510 brand." },
];
const baseKey = (file, line) => `${file}::${line}`;

// Is the `as X` match at index `idx` inside a comment or string on this line? (skip those — e.g. a JSDoc that
// discusses `as Verdict` in prose, or a string literal). Pragmatic: comment lines (trim starts with * // /*),
// a `//` before the match, or an odd count of quote/backtick chars before the match (inside a string span).
function inCommentOrString(line, idx) {
  const t = line.trimStart();
  if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return true;
  const before = line.slice(0, idx);
  const lineComment = before.indexOf("//");
  if (lineComment !== -1) return true;
  for (const q of ["`", '"', "'"]) {
    const n = (before.match(new RegExp(q === "`" ? "`" : q, "g")) || []).length;
    if (n % 2 === 1) return true; // an unclosed quote before the match → inside a string literal
  }
  return false;
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      walk(p, out);
    } else if (/\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name) && !/\.test\./.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

// Pure core (unit-testable): scan `scanRoot` for banned authority casts, classify against `baseline`. Paths
// are keyed relative to `relBase` (default: scanRoot) so the baseline can use repo-root-relative paths while
// the walk starts inside a subtree (real run: walk packages-galerina, key from repo root).
export function scanCasts(scanRoot, baseline = BASELINE, relBase = scanRoot) {
  const known = new Set(baseline.map((b) => baseKey(b.file, b.line)));
  const seen = new Set();
  const violations = [];
  const debt = [];
  for (const abs of walk(scanRoot)) {
    const relPath = relative(relBase, abs).split(sep).join("/");
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      CAST_RE.lastIndex = 0;
      let m;
      while ((m = CAST_RE.exec(line)) !== null) {
        if (inCommentOrString(line, m.index)) continue;
        const trimmed = line.trim();
        const key = baseKey(relPath, trimmed);
        const hit = { file: relPath, lineNo: i + 1, type: m[1], code: trimmed };
        if (known.has(key)) { seen.add(key); debt.push({ ...hit, note: baseline.find((b) => baseKey(b.file, b.line) === key)?.note }); }
        else violations.push(hit);
      }
    });
  }
  // A baseline entry that matched nothing = the debt was paid but the allowlist wasn't pruned (surface it).
  const stale = baseline.filter((b) => !seen.has(baseKey(b.file, b.line))).map((b) => `${b.file} :: ${b.line}`);
  return { violations, debt, stale };
}

// ── hermetic self-test: a tmp tree proves NEW casts fire, baselined ones pass, comments/strings are ignored ─
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "cast-hygiene-"));
  const write = (rel, body) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };
  try {
    write("pkg/src/new-bad.ts", "export const x = foo() as Verdict;\n");                 // NEW cast → violation
    write("pkg/src/new-trit.ts", "const t = raw as Trit;\n");                             // NEW Trit cast → violation
    write("pkg/src/allowed.ts", "  return fv as Verdict;\n");                             // matches baseline → debt, not violation
    write("pkg/src/comment.ts", "/** the same class as a bare `as Verdict` cast */\nexport const y = 1;\n"); // comment → ignored
    write("pkg/src/string.ts", 'export const s = "cast x as Verdict here";\n');           // string literal → ignored
    write("pkg/src/skip.d.ts", "declare const z: unknown as Verdict;\n");                 // .d.ts → not scanned
    const baseline = [{ file: "pkg/src/allowed.ts", line: "return fv as Verdict;" },
                      { file: "pkg/src/GONE.ts", line: "return q as Verdict;" }];          // 2nd = stale (no such file)
    const { violations, debt, stale } = scanCasts(dir, baseline);
    const vkeys = violations.map((v) => `${v.file}:${v.type}`);
    const checks = [
      ["a NEW `as Verdict` is flagged", vkeys.includes("pkg/src/new-bad.ts:Verdict")],
      ["a NEW `as Trit` is flagged", vkeys.includes("pkg/src/new-trit.ts:Trit")],
      ["a baselined cast is NOT flagged (debt, not violation)", !vkeys.some((k) => k.startsWith("pkg/src/allowed.ts")) && debt.length === 1],
      ["a comment mentioning the cast is ignored", !vkeys.some((k) => k.startsWith("pkg/src/comment.ts"))],
      ["a string literal mentioning the cast is ignored", !vkeys.some((k) => k.startsWith("pkg/src/string.ts"))],
      [".d.ts is not scanned", !vkeys.some((k) => k.startsWith("pkg/src/skip.d.ts"))],
      ["exactly 2 violations in the fixture", violations.length === 2],
      ["a stale (paid-off but un-pruned) baseline entry is surfaced", stale.some((s) => s.includes("GONE.ts"))],
    ];
    const failed = checks.filter(([, ok]) => !ok);
    for (const [n, ok] of checks) console.log(`[self-test] ${ok ? "ok" : "FAIL"} — ${n}`);
    if (failed.length) { console.log(`[self-test] FAIL — ${failed.length} cast-hygiene check(s) broke`); process.exit(1); }
    console.log("[self-test] PASS — new casts caught, baseline honoured, comments/strings/.d.ts ignored, stale entry surfaced");
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────────────
if (SELFTEST) { selfTest(); process.exit(0); }

const { violations, debt, stale } = scanCasts(join(ROOT, "packages-galerina"), BASELINE, ROOT);

if (asJson) {
  console.log(JSON.stringify({ tool: "cast-hygiene", banned: BANNED, violations, debt, stale }, null, 2));
} else {
  console.log("# Cast hygiene — no NEW bare authority cast (`as Verdict` / `as Trit`); mint a Verdict through a gate, never `as`\n");
  if (debt.length) {
    console.log(`Known baseline debt (shrink-only — remediate behind a blessed asVerdict()/gate, then prune the baseline):`);
    for (const d of debt) console.log(`  • ${d.file}:${d.lineNo}  ${d.code}` + (d.note ? `\n      ${d.note}` : ""));
    console.log("");
  }
  if (stale.length) {
    console.log(`⚠ ${stale.length} baseline entr(y/ies) matched NOTHING — the cast was remediated but the allowlist wasn't pruned:`);
    for (const s of stale) console.log(`  • ${s}`);
    console.log("");
  }
  if (violations.length) {
    console.log(`❌ ${violations.length} NEW authority cast(s) — mint through a gate/blessed constructor, not \`as\`:`);
    for (const v of violations) console.log(`  ✗ ${v.file}:${v.lineNo}  ${v.code}  (as ${v.type})`);
  } else {
    console.log("✅ no NEW authority cast beyond the known baseline.");
  }
  console.log(`\nVIOLATIONS: ${violations.length}`);
}

process.exit(soft ? 0 : Math.min(violations.length, 250));
