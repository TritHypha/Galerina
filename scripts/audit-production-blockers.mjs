#!/usr/bin/env node
// audit-production-blockers.mjs — every PRODUCTION_BLOCKER must have a real emitter (RD-0124 NOW-1 follow-up).
//
// The bug this exists to prevent: the production-readiness gate (production-check.ts PRODUCTION_BLOCKERS)
// listed LLN-MEMORY-001/002/003/007 as codes that block deployment, but NO compiler pass emits them —
// so the gate advertised it blocks on use-after-move / borrow violations it CANNOT actually detect. An
// operator trusting ready=true was told memory-safety is enforced when it is not. A PRODUCTION_BLOCKER
// that no pass can produce is a FALSE CAPABILITY CLAIM. This lint makes that a hard, machine-checked error.
//
// THE INVARIANT: every code in PRODUCTION_BLOCKERS must be EMITTABLE — referenced by some pass in a way
// that builds a diagnostic, NOT merely defined + listed as a blocker. "Emittable" = the code string or
// its diagnostic const appears in production source OUTSIDE (a) its own definition object's `code:` line,
// (b) its export-list entry, (c) comments, (d) production-check.ts itself, (e) tests. Const `.code`/`.name`
// usage, a `code: "X"` push, a `["X", ...]` audit row, or a `=== "X"` comparison all count as an emitter.
//
// Exit code = violation count (0 = clean). Run from repo root.
//   node scripts/audit-production-blockers.mjs             → scan
//   node scripts/audit-production-blockers.mjs --self-test → prove the detector fires
import { readdirSync, statSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = "packages-logicn/logicn-core-compiler/src/production-check.ts";
const SRC_ROOT = "packages-logicn";

// ── pure core ─────────────────────────────────────────────────────────────────────────────────────
/** Parse the PRODUCTION_BLOCKERS Set literal -> array of codes. */
export function parseBlockers(gateText) {
  const start = gateText.indexOf("PRODUCTION_BLOCKERS");
  if (start < 0) return [];
  const open = gateText.indexOf("[", start);
  const close = gateText.indexOf("]", open);
  if (open < 0 || close < 0) return [];
  return [...gateText.slice(open, close).matchAll(/"(LLN-[A-Z0-9-]+|ERR_[A-Z0-9_]+)"/g)].map((m) => m[1]);
}

/** Map code -> diagnostic const name, from `export const LLN_X = { code: "LLN-...-NNN" ...`. */
export function buildConstMap(files) {
  const map = {};
  const re = /export const (LLN_[A-Z0-9_]+)\s*=\s*\{\s*code:\s*"(LLN-[A-Z0-9-]+)"/g;
  for (const { lines } of files) {
    const t = lines.join("\n");
    let m;
    while ((m = re.exec(t))) map[m[2]] = m[1];
  }
  return map;
}

/**
 * Find an emission of `code` (const `cn` may be undefined) across files, or null. An emission is any
 * reference that is NOT the definition's `code:` line, the def opener, an export-list entry, a comment,
 * or in production-check.ts. files = [{ path, lines }].
 */
export function findEmission(code, cn, files) {
  const codeStr = `"${code}"`;
  for (const { path, lines } of files) {
    if (path.replace(/\\/g, "/").endsWith("production-check.ts")) continue;
    let prev = "";
    for (const raw of lines) {
      const s = raw.trim();
      const isComment = s.startsWith("//") || s.startsWith("*") || s.startsWith("/*");
      const isDefOpener = cn !== undefined && new RegExp(`^export const ${cn}\\b`).test(s);
      const isDefCodeLine = /^code:\s*"LLN-/.test(s) && /^export const LLN_[A-Z0-9_]+\s*=\s*\{$/.test(prev) && s.includes(codeStr);
      const isExportEntry = /^export\s*\{/.test(s) || (cn !== undefined && new RegExp(`^${cn},?$`).test(s));
      const matches = raw.includes(codeStr) || (cn !== undefined && new RegExp(`\\b${cn}\\b`).test(raw));
      if (matches && !isComment && !isDefOpener && !isDefCodeLine && !isExportEntry) {
        return `${path.replace(/\\/g, "/").split("/").slice(-1)[0]}: ${s.slice(0, 60)}`;
      }
      if (s.length) prev = s;
    }
  }
  return null;
}

// ── file walk ─────────────────────────────────────────────────────────────────────────────────────
function walkTs(dir, acc) {
  let ents;
  try { ents = readdirSync(dir); } catch { return acc; }
  for (const e of ents) {
    if (e === "node_modules" || e === "dist" || e === ".graph" || e.startsWith(".")) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkTs(p, acc);
    else if (e.endsWith(".ts") && !e.endsWith(".d.ts") && !e.includes(".test.")) acc.push(p);
  }
  return acc;
}

// ── self-test ─────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] !== undefined && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain && process.argv.includes("--self-test")) {
  const defFile = { path: "index.ts", lines: [
    'export const LLN_X_001 = {', '  code: "LLN-X-001",', '  name: "Foo",', '} as const;',
    'export const LLN_X_002 = {', '  code: "LLN-X-002",', '} as const;',
    "export { LLN_X_001, LLN_X_002 };",
  ] };
  const emitFile = { path: "checker.ts", lines: ['  diagnostics.push(LLN_X_001.code, "boom");'] }; // emits 001 via const
  const cm = buildConstMap([defFile]);
  const blockers = parseBlockers('const PRODUCTION_BLOCKERS = new Set([\n"LLN-X-001",\n"LLN-X-002",\n]);');
  const e001 = findEmission("LLN-X-001", cm["LLN-X-001"], [defFile, emitFile]); // emittable
  const e002 = findEmission("LLN-X-002", cm["LLN-X-002"], [defFile, emitFile]); // NOT emittable (def+export only)
  const strEmit = findEmission("LLN-Y-007", undefined, [{ path: "i.ts", lines: ['  diagnostics.push({ code: "LLN-Y-007" });'] }]); // string emit, no const
  const ok = blockers.length === 2 && cm["LLN-X-001"] === "LLN_X_001" && e001 !== null && e002 === null && strEmit !== null;
  console.log(`[self-test] parse:${blockers.length === 2} constmap:${cm["LLN-X-001"] === "LLN_X_001"} const-emit:${e001 !== null} non-emit→null:${e002 === null} string-emit:${strEmit !== null}`);
  console.log(ok ? "[self-test] PASS — production-blocker emitter detector fires (catches a blocker with no emitter)" : "[self-test] FAIL");
  process.exit(ok ? 0 : 1);
}

// ── scan ──────────────────────────────────────────────────────────────────────────────────────────
if (isMain) {
  if (!existsSync(GATE)) { console.error(`[prod-blockers] ${GATE} not found — fail-closed`); console.log("VIOLATIONS: 1"); process.exit(1); }
  const files = walkTs(SRC_ROOT, []).map((p) => ({ path: p, lines: readFileSync(p, "utf8").split(/\r?\n/) }));
  const blockers = parseBlockers(readFileSync(GATE, "utf8"));
  const constMap = buildConstMap(files);

  const violations = [];
  for (const code of blockers) {
    if (findEmission(code, constMap[code], files) === null) {
      violations.push(`${code} is a PRODUCTION_BLOCKER but has NO emitter — no pass can produce it, so the gate advertises a block it cannot enforce. Wire an emitter, or remove it from PRODUCTION_BLOCKERS (mark RESERVED).`);
    }
  }

  console.log(`production-blockers: checked ${blockers.length} blocker code(s) against ${files.length} source files for a real emitter`);
  for (const v of violations) console.log(`  ✖ ${v}`);
  console.log(violations.length === 0 ? "production-blockers: every blocker has an emitter (no false capability claim)." : `production-blockers: ${violations.length} non-emittable blocker(s).`);
  console.log(`VIOLATIONS: ${violations.length}`);
  console.log(`TOTAL: ${violations.length} production-blocker violation(s)`);
  process.exit(violations.length);
}
