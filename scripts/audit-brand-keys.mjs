#!/usr/bin/env node
// audit-brand-keys.mjs — Brand-everywhere BOLA lint (RD-0286 §5.3; OWASP API1:2023, CWE-639).
//
// BOLA's cheapest STRUCTURAL counter: an object identifier that reaches a KEYED data access as a raw
// primitive (`id: String` / `id: Int` / a literal) can address ANY object the caller invents — the
// classic /users/{id} IDOR shape. A `Brand<T, "Name">` nominal type (docs/language/fungi/04-types-and-
// values.md) proves the identifier passed a constructor/validation site, so "raw String reaches
// database.read as the key" becomes UNREPRESENTABLE instead of a code-review hope.
//
// WHAT IT FLAGS (decidable, per .fungi file — one parsed program = one scope, same soundness stance as
// audit-route-overlap.mjs):
//   • an argument (position ≥ 1 — position 0 is the table/collection) of a KEYED verb call
//     (database./storage./ledger. + read|find|get|query|load|fetch|lookup|delete|update) that is
//       - an identifier declared in the ENCLOSING flow's signature with a RAW primitive type
//         (String/Int/Number — not a Brand alias, not a domain type), or
//       - a string/number LITERAL (a hardcoded object address).
//   • WRITE-shaped verbs (write/insert/append/save/store) are NOT keyed — their payload arg is an
//     object, not an address — so they are deliberately out of scope (no false positives).
// NOT claimed: full type inference. Locals, field projections (a.b), and call results are out of scope
// (undecidable line-locally) — this is a necessary-not-sufficient structural lint; the sound authority
// stays the compiler's type-checker + the signed capability. Fail-closed: an unreadable tracked file is
// a violation, never a skip.
//
// Usage:
//   node scripts/audit-brand-keys.mjs --self-test     # prove the detectors fire first
//   node scripts/audit-brand-keys.mjs                 # enforce over every git-tracked .fungi file
//   node scripts/audit-brand-keys.mjs --json
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEYED_VERBS = new Set(["read", "find", "get", "query", "load", "fetch", "lookup", "delete", "update"]);
const KEYED_FAMILIES = new Set(["database", "storage", "ledger"]);
const RAW_PRIMITIVES = new Set(["String", "Int", "Number"]);

// ── pure core ────────────────────────────────────────────────────────────────
/** Split a call-argument list at top-level commas (respects (), <>, "", ''). */
function splitArgs(s) {
  const out = []; let depth = 0, cur = "", q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === "(" || ch === "<" || ch === "[") depth++;
    if (ch === ")" || ch === ">" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Scan ONE .fungi source: returns violations [{line, flow, call, arg, why}]. */
export function scanSource(src, rel) {
  const violations = [];
  const lines = src.split(/\r?\n/);
  // 1. Brand aliases declared in this file: `type X = Brand<...>` (any Brand alias is a domain type).
  const branded = new Set();
  for (const l of lines) {
    const m = /^\s*type\s+([A-Za-z_]\w*)\s*=\s*Brand\s*</.exec(l);
    if (m) branded.add(m[1]);
  }
  // 2. Walk lines; track the ENCLOSING flow's param types (a new `flow ...(` header resets the scope).
  let params = new Map(); let flowName = "(top)";
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const l = raw.replace(/\/\/.*$/, "");                       // comments carry no authority
    const fm = /\bflow\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(l);
    if (fm) {
      flowName = fm[1]; params = new Map();
      for (const p of splitArgs(fm[2])) {
        const pm = /^(?:readonly\s+)?([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)/.exec(p);
        if (pm) params.set(pm[1], pm[2]);
      }
    }
    // keyed calls on this line
    const callRe = /\b(database|storage|ledger)\.([a-z]\w*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
    let cm;
    while ((cm = callRe.exec(l)) !== null) {
      const [, family, verb, argStr] = cm;
      if (!KEYED_FAMILIES.has(family) || !KEYED_VERBS.has(verb)) continue;
      const args = splitArgs(argStr);
      for (let a = 1; a < args.length; a++) {                    // position 0 = table/collection
        const arg = args[a];
        if (/^["'`]/.test(arg) || /^\d[\d_.]*$/.test(arg)) {
          violations.push({ file: rel, line: i + 1, flow: flowName, call: `${family}.${verb}`, arg,
            why: `literal object key ${arg} — a hardcoded address is not a Brand-validated identifier (API1/CWE-639)` });
          continue;
        }
        const idm = /^([A-Za-z_]\w*)$/.exec(arg);
        if (!idm) continue;                                      // projections/calls: undecidable line-locally (documented limit)
        const ty = params.get(idm[1]);
        if (ty && RAW_PRIMITIVES.has(ty) && !branded.has(ty)) {
          violations.push({ file: rel, line: i + 1, flow: flowName, call: `${family}.${verb}`, arg,
            why: `param '${idm[1]}: ${ty}' reaches ${family}.${verb} as a key while RAW — any caller-supplied ${ty} addresses any object; give it a nominal identity: type XId = Brand<${ty}, "XId"> (RD-0286 §5.3, API1/CWE-639)` });
        }
      }
    }
  }
  return violations;
}

// ── self-test: prove every detector fires (a neutered lint is a fail-open) ──
function selfTest() {
  const cases = [
    ["raw String param as a read key FLAGGED",
      `flow getUser(id: String) -> User {\n  let u = database.read(users, id)\n  return u\n}`, 1],
    ["Brand-typed param as a read key CLEAN",
      `type UserId = Brand<String, "UserId">\nflow getUser(id: UserId) -> User {\n  let u = database.read(users, id)\n  return u\n}`, 0],
    ["literal key FLAGGED",
      `flow peek() -> User {\n  return database.read(users, "42")\n}`, 1],
    ["raw Int param on a keyed delete FLAGGED",
      `flow drop(n: Int) -> Ack {\n  ledger.delete(entries, n)\n  return Ack\n}`, 1],
    ["Brand-of-Int param CLEAN",
      `type EntryId = Brand<Int, "EntryId">\nflow drop(n: EntryId) -> Ack {\n  ledger.delete(entries, n)\n  return Ack\n}`, 0],
    ["write payload is NOT a key (no false positive)",
      `flow save(user: String) -> Ack {\n  database.write(users, user)\n  return Ack\n}`, 0],
    ["table arg (position 0) never flagged",
      `flow list(tbl: String) -> Rows {\n  return database.query(tbl)\n}`, 0],
    ["scope resets per flow (raw in flow A does not taint flow B's branded param)",
      `type UId = Brand<String, "UId">\nflow a(id: String) -> U { return database.read(us, id) }\nflow b(id: UId) -> U { return database.read(us, id) }`, 1],
    ["storage.get with raw key FLAGGED",
      `flow g(k: String) -> Blob {\n  return storage.get(bucket, k)\n}`, 1],
    ["commented-out call carries no authority",
      `flow g(k: String) -> Blob {\n  // return storage.get(bucket, k)\n  return Blob\n}`, 0],
  ];
  let allOk = true;
  for (const [name, src, want] of cases) {
    const got = scanSource(src, "self-test.fungi").length;
    const pass = got === want;
    console.log(`  ${pass ? "✅" : "❌"} ${name} (want ${want}, got ${got})`);
    if (!pass) allOk = false;
  }
  if (!allOk) { console.error("  ❌ brand-keys self-test FAILED — a detector is neutered (fail-open)"); process.exit(1); }
  console.log("  brand-keys self-test: every detector fires; the clean shapes stay clean ✅");
}

// ── runner: git-tracked .fungi files (no shell; grep-independent discovery) ──
if (process.argv.includes("--self-test")) { selfTest(); process.exit(0); }

const tracked = execFileSync("git", ["ls-files", "*.fungi", "**/*.fungi"], { cwd: ROOT, encoding: "utf8", windowsHide: true })
  .split(/\r?\n/).filter(Boolean);
const all = []; const unreadable = [];
for (const rel of tracked) {
  try { all.push(...scanSource(readFileSync(join(ROOT, rel), "utf8"), rel)); }
  catch (e) { unreadable.push(`${rel}: ${e.message}`); }         // fail-closed below
}
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ files: tracked.length, violations: all, unreadable }, null, 2));
} else {
  for (const v of all) console.log(`  ❌ ${v.file}:${v.line} [${v.flow}] ${v.call}(…, ${v.arg}) — ${v.why}`);
  for (const u of unreadable) console.log(`  ❌ UNREADABLE (fail-closed): ${u}`);
}
if (all.length || unreadable.length) {
  console.error(`\n  ❌ brand-keys: ${all.length} raw object key(s) + ${unreadable.length} unreadable file(s) across ${tracked.length} tracked .fungi files — BOLA structural counter (RD-0286 §5.3).`);
  process.exit(1);
}
console.log(`  ✅ brand-keys: no raw-primitive object keys reach a keyed database/storage/ledger call across ${tracked.length} tracked .fungi files (Brand-everywhere holds).`);
