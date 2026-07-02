#!/usr/bin/env node
// =============================================================================
// audit-sink-canonicality.mjs — sink/source hand-list drift gate (mirrors
//                                audit-effect-canonicality.mjs)
// =============================================================================
// THE FAIL-OPEN CLASS THIS PREVENTS (RD-0234 / RD-0234b):
//   The security checkers recognise sinks and sources via hand-maintained lists —
//   taint-checker.ts INJECTION_SINKS + TAINT_SOURCES, source-escape-checker.ts
//   BANNED_CALL_NAMES, value-state-checker.ts SINK_REQUIREMENTS. The stdlib surface
//   (stdlib-registry.ts STDLIB_CAPABILITY_MAP) grows independently. When someone adds
//   a new egress/exec/write stdlib function (say Http.post, Shell.exec, a *.send) but
//   forgets to add it to a sink list, a tainted / raw-secret value flows INTO that new
//   sink with NO taint or value-state diagnostic — and the artifact signs clean. This
//   is the same negative-space drift that let Shell.exec slip past the effect-cased
//   `shell.exec` SINK_REQUIREMENTS key (RD-0234 VD-1).
//
// This audit treats the stdlib registry as the growth surface and the sink hand-lists
// as what MUST keep up: every STDLIB_CAPABILITY_MAP entry whose name/shape clearly
// denotes an egress / exec / filesystem-write / off-host-send sink must appear in at
// least ONE sink list (case-insensitively) OR carry a reasoned entry in
// scripts/fixtures/sink-canonicality-allowlist.txt. Otherwise: FAIL (exit 1).
//
// Run:   node scripts/audit-sink-canonicality.mjs
//        node scripts/audit-sink-canonicality.mjs --json
//        node scripts/audit-sink-canonicality.mjs --self-test   (proves the detector fires)
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const rootIdx = process.argv.indexOf("--root");
const ROOT = rootIdx !== -1 ? process.argv[rootIdx + 1] : join(HERE, "..");
const SRC = join(ROOT, "packages-galerina/galerina-core-compiler/src");
const TAINT_CHECKER = join(SRC, "taint-checker.ts");
const SOURCE_ESCAPE = join(SRC, "source-escape-checker.ts");
const VALUE_STATE = join(SRC, "value-state-checker.ts");
const STDLIB = join(SRC, "stdlib-registry.ts");
const ALLOWLIST = join(HERE, "fixtures/sink-canonicality-allowlist.txt");

// ── source extractors (regex over TS source — same approach as audit-effect-canonicality.mjs) ──

/** Slice a named declaration block to its balanced closing bracket (from the `=`). */
function sliceBlock(src, declName) {
  const start = src.indexOf(declName);
  if (start === -1) return null;
  const eq = src.indexOf("=", start);
  const from = eq === -1 ? start : eq;
  const bi = src.indexOf("[", from), ci = src.indexOf("{", from);
  const openIdx = bi === -1 ? ci : ci === -1 ? bi : Math.min(bi, ci);
  if (openIdx === -1) return null;
  const openCh = src[openIdx], closeCh = openCh === "[" ? "]" : "}";
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return null;
}

/** first-of-pair keys in a `new Map([ ["k", V], ... ])` block */
function mapKeys(block) {
  if (!block) return [];
  return [...block.matchAll(/\[\s*"([^"]+)"\s*,/g)].map((m) => m[1]);
}
/** every double-quoted token in a block */
function quoted(block) {
  if (!block) return [];
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// ── the classifier: does an stdlib entry name/shape denote a governed sink? ───
// Egress (data leaves host), exec (dynamic/native execution), or filesystem write.
// Kept deliberately broad (fail-toward-flagging): a false flag is silenced with one
// allowlist line + reason; a MISSED sink is the very fail-open we are guarding.
const SINK_SHAPE = [
  /\.exec$/i, /\.execute$/i, /\.spawn$/i, /\.run$/i,              // exec / dynamic execution
  /^shell\./i, /^process\./i, /^runtime\./i,                       // process / runtime surfaces
  /\.(post|put|patch|send|write|writeText|writeBytes|upload|deliver|charge|publish|dispatch|notify|push)$/i, // egress / write / off-host send
  /^https?\./i, /^net\./i, /^socket\./i, /^ws\./i, /^websocket\./i,// network transports (incl. GET — SSRF surface)
  /\.(insert|update|delete)$/i,                                    // database mutations
];
export function looksLikeSink(name) {
  return SINK_SHAPE.some((re) => re.test(name));
}

// ── the audit core (also exercised by --self-test) ───────────────────────────
// Given the four hand-lists + the stdlib names + the allowlist set, return the
// stdlib entries that LOOK like a sink but are covered by NO sink list and not allowed.
export function auditSinkCoverage({ stdlibNames, sinkNames, allow }) {
  // case-insensitive membership across ALL sink lists (the RD-0234 VD-1 case-drift fix
  // taught us Shell.exec vs shell.exec must be treated identically).
  const sinkLC = new Set(sinkNames.map((s) => s.toLowerCase()));
  const allowLC = new Set([...allow].map((s) => s.toLowerCase()));
  const uncovered = [];
  for (const name of stdlibNames) {
    if (!looksLikeSink(name)) continue;
    if (sinkLC.has(name.toLowerCase())) continue;   // already tracked by a sink list
    if (allowLC.has(name.toLowerCase())) continue;  // explicitly reasoned as non-sink / covered elsewhere
    uncovered.push(name);
  }
  uncovered.sort();
  return uncovered;
}

function loadAllowlist(path) {
  const map = new Map();
  if (!existsSync(path)) return map;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const hash = line.indexOf("#");
    const name = (hash === -1 ? line : line.slice(0, hash)).trim();
    const reason = hash === -1 ? "" : line.slice(hash + 1).trim();
    if (name !== "") map.set(name, reason);
  }
  return map;
}

// ── --self-test: a neutered sink-drift detector is itself a fail-open ─────────
if (process.argv.includes("--self-test")) {
  // Synthetic: stdlib gains "Danger.exec" (obvious exec sink) and "Http.post" — the
  // latter IS in the sink list (covered), the former is NOT (must be flagged). A pure
  // op ("Math.sqrt") must never flag. An allowlisted sink-shaped name must be silenced.
  const stdlibNames = ["Math.sqrt", "Http.post", "Danger.exec", "Legacy.writeBytes"];
  const sinkNames = ["Http.post", "Database.query"];         // covers Http.post only
  const allow = new Set(["Legacy.writeBytes"]);              // reasoned as non-egress
  const out = auditSinkCoverage({ stdlibNames, sinkNames, allow });
  const ok =
    out.includes("Danger.exec") &&        // uncovered exec sink -> flagged
    !out.includes("Http.post") &&         // covered by sink list -> not flagged
    !out.includes("Legacy.writeBytes") && // allowlisted -> not flagged
    !out.includes("Math.sqrt");           // pure op -> not flagged
  // also assert the shape-classifier itself is not neutered
  const shapeOk = looksLikeSink("Shell.exec") && looksLikeSink("Http.post") &&
                  looksLikeSink("database.insert") && !looksLikeSink("String.trim");
  if (ok && shapeOk) {
    console.log("[self-test] PASS — detector flags an uncovered exec/egress stdlib sink, respects the");
    console.log("            sink lists (case-insensitively) and the allowlist, and ignores pure ops.");
  } else {
    console.log("[self-test] FAIL", JSON.stringify({ out, ok, shapeOk }));
  }
  process.exit(ok && shapeOk ? 0 : 1);
}

// ── read the real source hand-lists ──────────────────────────────────────────
for (const [label, p] of [["taint-checker", TAINT_CHECKER], ["source-escape-checker", SOURCE_ESCAPE],
                          ["value-state-checker", VALUE_STATE], ["stdlib-registry", STDLIB]]) {
  if (!existsSync(p)) { console.error(`FAIL: missing source ${label}: ${p}`); process.exit(1); }
}
const taintSrc = readFileSync(TAINT_CHECKER, "utf8");
const escapeSrc = readFileSync(SOURCE_ESCAPE, "utf8");
const vsSrc = readFileSync(VALUE_STATE, "utf8");
const stdlibSrc = readFileSync(STDLIB, "utf8");

const INJECTION_SINKS = mapKeys(sliceBlock(taintSrc, "INJECTION_SINKS"));
const TAINT_SOURCES = quoted(sliceBlock(taintSrc, "TAINT_SOURCES = new Set"));
const BANNED_CALL_NAMES = quoted(sliceBlock(escapeSrc, "BANNED_CALL_NAMES = new Set"));
const SINK_REQUIREMENTS = mapKeys(sliceBlock(vsSrc, "SINK_REQUIREMENTS: ReadonlyMap"));
const STDLIB_NAMES = mapKeys(sliceBlock(stdlibSrc, "STDLIB_CAPABILITY_MAP: ReadonlyMap"));

// bootstrap guard — an empty extraction means the source shape changed under us.
const bootstrapErr = [];
if (INJECTION_SINKS.length === 0) bootstrapErr.push("INJECTION_SINKS");
if (SINK_REQUIREMENTS.length === 0) bootstrapErr.push("SINK_REQUIREMENTS");
if (BANNED_CALL_NAMES.length === 0) bootstrapErr.push("BANNED_CALL_NAMES");
if (STDLIB_NAMES.length === 0) bootstrapErr.push("STDLIB_CAPABILITY_MAP");
if (bootstrapErr.length) {
  console.error(`FAIL: could not parse ${bootstrapErr.join(", ")} — extractor/source mismatch.`);
  process.exit(1);
}

// The union of every recognised-sink hand-list. TAINT_SOURCES is the source side —
// included so a value-state "source-shaped" name is not mistaken for an uncovered sink.
const SINK_NAMES = [...INJECTION_SINKS, ...SINK_REQUIREMENTS, ...BANNED_CALL_NAMES];
const allow = loadAllowlist(ALLOWLIST);
const uncovered = auditSinkCoverage({
  stdlibNames: STDLIB_NAMES, sinkNames: SINK_NAMES, allow: new Set(allow.keys()),
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    counts: {
      stdlib: STDLIB_NAMES.length, injectionSinks: INJECTION_SINKS.length,
      sinkRequirements: SINK_REQUIREMENTS.length, bannedCalls: BANNED_CALL_NAMES.length,
      taintSources: TAINT_SOURCES.length, allowlisted: allow.size,
    },
    uncovered,
  }, null, 2));
  process.exit(uncovered.length ? 1 : 0);
}

console.log(`\n=== sink-canonicality audit — new stdlib sinks must be tracked by a sink list ===`);
console.log(`   stdlib entries: ${STDLIB_NAMES.length} | INJECTION_SINKS: ${INJECTION_SINKS.length}` +
            ` | SINK_REQUIREMENTS: ${SINK_REQUIREMENTS.length} | BANNED_CALL_NAMES: ${BANNED_CALL_NAMES.length}` +
            ` | TAINT_SOURCES: ${TAINT_SOURCES.length}`);
if (allow.size) {
  console.log(`\n   allowlisted (sink-shaped but tracked elsewhere / not an egress sink — see fixtures/sink-canonicality-allowlist.txt):`);
  for (const [name, reason] of allow) console.log(`     [skip] ${name}  — ${reason || "(no reason given)"}`);
}
if (uncovered.length) {
  console.log(`\n   UNCOVERED SINKS (stdlib egress/exec/write NOT in any sink list — the RD-0234 drift class):`);
  for (const n of uncovered) console.log(`     [FAIL] ${n}`);
  console.log(`\nFAIL: ${uncovered.length} stdlib sink(s) escape taint/value-state tracking.`);
  console.log(`Add each to the right hand-list (taint-checker INJECTION_SINKS / value-state SINK_REQUIREMENTS /`);
  console.log(`source-escape BANNED_CALL_NAMES), or — if it is genuinely not an egress/exec/write sink or is`);
  console.log(`governed by another path — add a line + reason to scripts/fixtures/sink-canonicality-allowlist.txt.`);
  process.exit(1);
}
console.log(`\nOK: every sink-shaped stdlib entry is tracked by a sink list (or reasoned in the allowlist).`);
