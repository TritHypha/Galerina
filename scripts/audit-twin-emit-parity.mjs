// =============================================================================
// audit-twin-emit-parity.mjs — twin-emitted ⊆ type-checker-emitted (fail-closed)
// =============================================================================
// R&D's twin-emit-parity idea (2026-07-16), made structural. The self-hosted
// type-checker TWIN (type-checker.fungi) must only emit diagnostic codes that
// Stage-A's TYPE-CHECKER actually EMITS. A twin code with no type-checker emit
// site is a FALSE DIFFERENTIAL — the twin flagging what the real checker never
// does (fails closed against valid programs, erodes "twin ≡ Stage-A").
//
// AUTHORITY = the actual emit CALL-SITES in the checker SOURCE, scanned directly
// (not the registry's text-match `emits` count, which also matched test-file and
// comment mentions and so spuriously kept dead codes 019/027 "emitted"). A code
// is type-checker-emitted iff type-checker.ts has a `makeTCDiag("CODE", …)` or a
// `diagnostics.push({ code: "CODE" … })` call-site. This is the by-construction
// discipline (#20 taxonomy / RD-0412): parse the emit structure, don't text-match.
//
//   ASSERT  twin.emitSet ⊆ typeChecker.emitSet                    (fail-closed, exit 3)
//   REPORT  type-checker codes absent from the twin (the exact frontier)
//   SCOPE   PER PASS — the twin mirrors type-checker.ts. NAME-* live in the
//           SymbolResolver pass (symbol-resolver.ts); they are a FUTURE
//           symbol-resolver twin's frontier, reported in a separate bucket, never
//           mixed into this twin's frontier (that was the NAME-001/003 confusion).
//
// This would have caught 019 + 027 the moment they were mirrored, is exact (019/027
// no longer appear — they have no type-checker.ts call-site), and is a permanent
// regression guard as new clusters land. Self-sufficient: scans source, no registry.
//
// Usage: node scripts/audit-twin-emit-parity.mjs [--json] [--self-test]
//        exit 3 = a twin false differential exists (twin emits a code the type-checker never does)
// =============================================================================
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CC = join(ROOT, "packages-galerina", "galerina-core-compiler", "src");
const TWIN = join(CC, "self-hosted", "type-checker.fungi");
const TYPE_CHECKER = join(CC, "type-checker.ts");
const SYMBOL_RESOLVER = join(CC, "symbol-resolver.ts");
// effect-checker bucket (2026-07-17, R&D-endorsed): the effect twin mirrors effect-checker.ts's
// FUNGI-EFFECT-* charter. Same by-construction discipline, scoped to its own pass.
const EC_TWIN = join(CC, "self-hosted", "effect-checker.fungi");
const EFFECT_CHECKER = join(CC, "effect-checker.ts");

// ── pure core (self-tested) ───────────────────────────────────────────────────

// Codes the twin RAISES: every `code: "FUNGI-…"` it appends (a comment mentioning a
// code has no `code:` key, so it is excluded).
export function twinEmitSet(src) {
  return [...new Set([...src.matchAll(/code:\s*"(FUNGI-[A-Z0-9]+-\d+)"/g)].map((m) => m[1]))].sort();
}

// Codes a checker SOURCE file EMITS: the first arg of a `makeTCDiag("CODE", …)` call,
// or the `code:` of an inline `diagnostics.push({ code: "CODE" … })`. Both are emit
// call-sites; a `// FUNGI-…` comment or an `x.code === "FUNGI-…"` compare has neither
// shape, so only real emissions are counted (the by-construction fix for 019/027).
export function sourceEmitSet(src) {
  const codes = new Set();
  for (const m of src.matchAll(/makeTCDiag\(\s*"(FUNGI-[A-Z0-9]+-\d+)"/g)) codes.add(m[1]);
  for (const m of src.matchAll(/\bcode:\s*"(FUNGI-[A-Z0-9]+-\d+)"/g)) codes.add(m[1]);
  return codes;
}

// twin codes with NO type-checker emit call-site = false differentials.
export function falseDifferentials(twinCodes, emitSet) {
  return twinCodes.filter((c) => !emitSet.has(c));
}

// type-checker codes the twin does not yet mirror (the exact frontier), TYPE-* only
// scoped to the pass the twin twins.
export function frontierFor(emitSet, twinCodes) {
  const twinSet = new Set(twinCodes);
  return [...emitSet].filter((c) => !twinSet.has(c)).sort();
}

// ── name-parity leg — one-code = one-NAME across twin and Stage-A ────────────────
// A code-set gate can't catch a SEMANTIC squat: a code mirrored at the wrong MEANING (the twin's
// `name` for a code differs from Stage-A's) passes ⊆ but is a latent false differential — the
// 014-was-001 / effect-005 class. This leg diffs the twin's declared code→name against Stage-A's
// emit-site code→name, by construction, for every shared code.

// The twin's code→name from its `diagName` table (`if code == "CODE" { return "NAME" }`).
export function twinNameMap(src) {
  const m = {};
  for (const x of src.matchAll(/if\s+code\s*==\s*"(FUNGI-[A-Z0-9]+-\d+)"\s*\{\s*return\s*"([A-Z0-9_]+)"/g)) m[x[1]] = x[2];
  return m;
}
// Stage-A code→name from its emit sites: makeTCDiag("CODE", "NAME", …) or push({ code:"CODE", name:"NAME" }).
export function sourceNameMap(src) {
  const m = {};
  for (const x of src.matchAll(/makeTCDiag\(\s*"(FUNGI-[A-Z0-9]+-\d+)"\s*,\s*"([A-Z0-9_]+)"/g)) m[x[1]] = x[2];
  for (const x of src.matchAll(/code:\s*"(FUNGI-[A-Z0-9]+-\d+)"\s*,\s*name:\s*"([A-Z0-9_]+)"/g)) if (!(x[1] in m)) m[x[1]] = x[2];
  return m;
}
// codes where the twin's name and Stage-A's name disagree (a semantic squat), or the twin declares
// no name for a code it emits (an incomplete mirror). Both are name-parity violations.
export function nameParityViolations(twinCodes, twinNames, srcNames) {
  const out = [];
  for (const c of twinCodes) {
    const tn = twinNames[c] ?? "";
    const sn = srcNames[c] ?? "";
    if (sn === "") continue;                       // no Stage-A name to diff against (skip)
    if (tn === "") out.push({ code: c, twin: "(none)", stageA: sn, kind: "missing" });
    else if (tn !== sn) out.push({ code: c, twin: tn, stageA: sn, kind: "squat" });
  }
  return out;
}

// ── severity-parity leg — one-code = one-SEVERITY where Stage-A is unambiguous ───────────────────
// A code the twin emits at a DIFFERENT severity than Stage-A is a latent divergence a name/emit-set
// check can't see: a warning mirrored as an error over-blocks valid programs; an error mirrored as a
// warning under-blocks (the dangerous direction). Severity is derived from the emit OBJECT, brace-
// bounded (`[^{}]` never crosses an object boundary — so no cross-object mis-attribution, the fragility
// R&D flagged), collecting ALL severities seen per code. Parity is asserted ONLY where Stage-A is
// SINGLE-valued: a code with >1 Stage-A severity is CONDITIONAL (e.g. FUNGI-TIER-001 =
// `enforceTierFloor ? "error" : "warning"`) and exempt — reported, not failed; a severity set via a
// const/spread (no inline `severity:`) simply isn't extracted → exempt (sound: never assert on what we
// can't read, so no false failure). This is the third parity leg after emit-set ⊆ and name-parity.

// code -> Set<severity> from an emit object, in both field orders. Anchored on the object's opening `{`
// with NO brace between it and the code+severity pair (`[^{}]` can't cross an object boundary, so no
// cross-object mis-attribution). We deliberately do NOT anchor the trailing `}`: Stage-A diag objects
// carry template-literal message/suggestedFix fields whose `${…}` braces sit AFTER severity, so a
// closing-brace anchor would fail to match and make the whole leg vacuous. code+name+severity always
// precede those templates, so matching just up to severity is both sufficient and brace-safe.
export function severityMap(src) {
  const m = {};
  const add = (code, sev) => { if (m[code] === undefined) m[code] = new Set(); m[code].add(sev); };
  for (const x of src.matchAll(/\{[^{}]*?code:\s*"(FUNGI-[A-Z0-9]+-\d+)"[^{}]*?severity:\s*"([a-z]+)"/g)) add(x[1], x[2]);
  for (const x of src.matchAll(/\{[^{}]*?severity:\s*"([a-z]+)"[^{}]*?code:\s*"(FUNGI-[A-Z0-9]+-\d+)"/g)) add(x[2], x[1]);
  return m;
}
// codes where the twin's single severity disagrees with Stage-A's single severity. Conditional (>1
// Stage-A severity) or unextracted (0) codes are exempt. Returns {code, twin, stageA}.
export function severityParityViolations(twinCodes, twinSev, srcSev) {
  const out = [];
  for (const c of twinCodes) {
    const sa = srcSev[c];
    const tw = twinSev[c];
    if (sa === undefined || sa.size !== 1) continue;   // no Stage-A severity, or conditional → exempt
    if (tw === undefined || tw.size !== 1) continue;   // twin has no single emitted severity here → skip
    const saV = [...sa][0];
    const twV = [...tw][0];
    if (saV !== twV) out.push({ code: c, twin: twV, stageA: saV });
  }
  return out;
}

// ── self-test ─────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  const tcSrc = `
    this.diagnostics.push(makeTCDiag("FUNGI-TYPE-002", "X", msg));
    this.diagnostics.push({ code: "FUNGI-TYPE-014", name: "Y" });
    // dead: no FUNGI-TYPE-019 emit here — this comment must NOT count
    if (d.code === "FUNGI-TYPE-027") return; // a compare, not an emit
  `;
  const emit = sourceEmitSet(tcSrc);
  assert(emit.has("FUNGI-TYPE-002") && emit.has("FUNGI-TYPE-014"), "emit set: real sites");
  assert(!emit.has("FUNGI-TYPE-019") && !emit.has("FUNGI-TYPE-027"), "emit set: excludes comment + compare");
  const twin = twinEmitSet(`diags.append({ code: "FUNGI-TYPE-002" }); // no FUNGI-TYPE-019\n{ code: "FUNGI-TYPE-014" }`);
  assert(twin.length === 2 && twin[0] === "FUNGI-TYPE-002", "twin set (comment excluded)");
  assert(falseDifferentials(twin, emit).length === 0, "clean twin passes");
  assert(falseDifferentials(["FUNGI-TYPE-019"], emit).length === 1, "detects a false differential");
  assert(frontierFor(emit, twin).length === 0, "frontier empty when twin has all emits");
  assert(frontierFor(sourceEmitSet(`makeTCDiag("FUNGI-TYPE-002",` + `"a")\nmakeTCDiag("FUNGI-TYPE-099","b")`), twin).join() === "FUNGI-TYPE-099", "frontier = unmirrored emits");
  // name-parity leg
  const tn = twinNameMap(`if code == "FUNGI-TYPE-002" { return "TYPE_MISMATCH" }\nif code == "FUNGI-TYPE-014" { return "MISSING_REQUIRED_EFFECT" }`);
  assert(tn["FUNGI-TYPE-002"] === "TYPE_MISMATCH", "twinNameMap extracts the diagName table");
  const sn = sourceNameMap(`makeTCDiag("FUNGI-TYPE-002", "TYPE_MISMATCH", m)\nthis.diagnostics.push({ code: "FUNGI-TYPE-014", name: "WRONG_NAME" });`);
  assert(sn["FUNGI-TYPE-002"] === "TYPE_MISMATCH" && sn["FUNGI-TYPE-014"] === "WRONG_NAME", "sourceNameMap extracts emit-site names");
  const nv = nameParityViolations(["FUNGI-TYPE-002", "FUNGI-TYPE-014"], tn, sn);
  assert(nv.length === 1 && nv[0].code === "FUNGI-TYPE-014" && nv[0].kind === "squat", "detects a name squat, passes matching");
  // effect-checker bucket: the same pure functions, scoped to the FUNGI-EFFECT-* charter.
  const ecSet = twinEmitSet(`diags.append({ code: "FUNGI-EFFECT-006" })\n{ code: "FUNGI-VAL-001" }`).filter((c) => /^FUNGI-EFFECT-/.test(c));
  assert(ecSet.length === 1 && ecSet[0] === "FUNGI-EFFECT-006", "effect bucket scopes to FUNGI-EFFECT-* (excludes VAL)");
  // effect name-parity: an effectDiagName table diffed against effect-checker.ts emit-site names — the
  // 005-repurpose class (twin's 005 name ≠ Stage-A's) is exactly what this leg must catch.
  const ecTn = twinNameMap(`if code == "FUNGI-EFFECT-006" { return "DENY_ONLY_EFFECT" }\nif code == "FUNGI-EFFECT-005" { return "UNKNOWN_EFFECT" }`);
  const ecSn = sourceNameMap(`code: "FUNGI-EFFECT-006", name: "DENY_ONLY_EFFECT"\ncode: "FUNGI-EFFECT-005", name: "BROAD_ALIAS_USED"`);
  const ecNv = nameParityViolations(["FUNGI-EFFECT-006", "FUNGI-EFFECT-005"], ecTn, ecSn);
  assert(ecNv.length === 1 && ecNv[0].code === "FUNGI-EFFECT-005" && ecNv[0].kind === "squat", "effect name-parity: detects a 005 squat, passes the 006 match");
  // severity-parity: derive code→severity from brace-bounded emit objects; assert only where Stage-A is
  // single-valued (a conditional code with two literal severities — the TIER-001 class — is exempt).
  const twSev = severityMap(`diags.append({ code: "FUNGI-EFFECT-005", message: m, severity: "warning" })\n{ code: "FUNGI-EFFECT-006", severity: "error", message: m }`);
  assert(twSev["FUNGI-EFFECT-005"] !== undefined && [...twSev["FUNGI-EFFECT-005"]][0] === "warning", "severityMap: code-before-severity");
  assert(twSev["FUNGI-EFFECT-006"] !== undefined && [...twSev["FUNGI-EFFECT-006"]][0] === "error", "severityMap: severity-before-code (reverse order)");
  const saSev = severityMap(`{ code: "FUNGI-EFFECT-005", severity: "error" }\n{ code: "FUNGI-COND-001", severity: "error" }\n{ code: "FUNGI-COND-001", severity: "warning" }`);
  const sv = severityParityViolations(["FUNGI-EFFECT-005", "FUNGI-COND-001"], twSev, saSev);
  assert(sv.length === 1 && sv[0].code === "FUNGI-EFFECT-005" && sv[0].twin === "warning" && sv[0].stageA === "error", "severity-parity: detects the 005 skew, exempts the conditional COND-001");
  console.log("twin-emit-parity self-test: 12/12 ok");
  process.exit(0);
}
function assert(ok, what) { if (!ok) { console.error(`self-test FAIL: ${what}`); process.exit(1); } }

// ── main — run only when invoked directly, not when imported for its exports ────
// (import-safe: reusing sourceEmitSet/twinEmitSet from another gate, e.g. the effect-checker
// parity bucket, must not trigger this file's report + process.exit. No side effects on import.)
const IS_MAIN = process.argv[1] !== undefined && process.argv[1].replace(/\\/g, "/").endsWith("scripts/audit-twin-emit-parity.mjs");
if (IS_MAIN) {
const twin = twinEmitSet(readFileSync(TWIN, "utf8"));
const tcEmits = sourceEmitSet(readFileSync(TYPE_CHECKER, "utf8"));
const srEmits = sourceEmitSet(readFileSync(SYMBOL_RESOLVER, "utf8"));

const twinSet = new Set(twin);
const bad = falseDifferentials(twin, tcEmits);          // twin ⊄ type-checker → false differential
const tcGap = frontierFor(tcEmits, twin);               // ALL type-checker codes not yet mirrored (exact)
// The twin's CHARTER is the TYPE-* type-system family. Scope the frontier to it; surface the other
// diagnostic families type-checker.ts also emits (K3 logic, HALLMARK provenance, PREFILTER, CHECK,
// BINDING lifecycle) as a SEPARATE bucket — real emits, distinct subsystems, a future twin's scope,
// never silently hidden (the old TYPE|NAME frontier filter hid them). SymbolResolver (NAME-*) is a
// different PASS again (per-pass scoping — the NAME-001/003 confusion).
const typeFrontier = tcGap.filter((c) => /^FUNGI-TYPE-/.test(c));
const otherFamilies = tcGap.filter((c) => !/^FUNGI-(TYPE|NAME)-/.test(c));
const otherPass = [...srEmits].filter((c) => !tcEmits.has(c) && !twinSet.has(c)).sort();

// name-parity leg: for every code the twin emits, its declared name must equal Stage-A's emit-site name.
const twinNames = twinNameMap(readFileSync(TWIN, "utf8"));
const tcNames = sourceNameMap(readFileSync(TYPE_CHECKER, "utf8"));
const nameViol = nameParityViolations(twin, twinNames, tcNames);

// ── effect-checker bucket: effect-checker.fungi ⊆ effect-checker.ts (FUNGI-EFFECT-* charter) ──
// The effect twin folds several Stage-A functions (validateDeclaredEffectNames + checkFlowEffects)
// into one loop; a twin EFFECT-* code with no effect-checker.ts emit site is a false differential
// (the 005-squat class). Scoped to FUNGI-EFFECT-* — the effect twin's own charter/pass. Name-parity
// for effects is now wired too (2026-07-17): the effect twin carries an effectDiagName table (and a
// effectWithNames pass emitting {code, name} at every entry return), diffed against effect-checker.ts.
const ecTwinSrc = readFileSync(EC_TWIN, "utf8");
const ecCheckerSrc = readFileSync(EFFECT_CHECKER, "utf8");
const ecTwin = twinEmitSet(ecTwinSrc).filter((c) => /^FUNGI-EFFECT-/.test(c));
const ecEmits = sourceEmitSet(ecCheckerSrc);
const ecBad = falseDifferentials(ecTwin, ecEmits);
const ecTwinSet = new Set(ecTwin);
const ecFrontier = [...ecEmits].filter((c) => /^FUNGI-EFFECT-/.test(c) && !ecTwinSet.has(c)).sort();
// name-parity for the effect twin: every effect code it emits must carry Stage-A's canonical name.
const ecTwinNames = twinNameMap(ecTwinSrc);
const ecCheckerNames = sourceNameMap(ecCheckerSrc);
const ecNameViol = nameParityViolations(ecTwin, ecTwinNames, ecCheckerNames);
// severity-parity for the effect twin: where Stage-A's severity is single-valued, the twin must match.
const ecTwinSev = severityMap(ecTwinSrc);
const ecCheckerSev = severityMap(ecCheckerSrc);
const ecSevViol = severityParityViolations(ecTwin, ecTwinSev, ecCheckerSev);

const asJson = process.argv.includes("--json");
if (asJson) {
  console.log(JSON.stringify({ twinEmits: twin.length, falseDifferentials: bad, nameParityViolations: nameViol, typeFrontier, otherFamilies, otherPassFrontier: otherPass, effectTwinEmits: ecTwin.length, effectFalseDifferentials: ecBad, effectNameParityViolations: ecNameViol, effectSeverityParityViolations: ecSevViol, effectFrontier: ecFrontier }, null, 1));
} else {
  console.log(`twin-emit-parity: type-twin ${twin.length} codes · ${bad.length} false diff · ${nameViol.length} name-parity viol · effect-twin ${ecTwin.length} codes · ${ecBad.length} false diff · ${ecNameViol.length} name-parity viol · ${ecSevViol.length} severity-parity viol`);
  for (const c of bad) console.log(`  ⚠ FALSE DIFFERENTIAL ${c} — no emit call-site in type-checker.ts (twin flags what the checker never does)`);
  if (bad.length === 0) console.log(`  ✅ twin-emitted ⊆ type-checker-emitted (no false differential)`);
  for (const v of nameViol) console.log(`  ⚠ NAME SQUAT ${v.code} — twin name '${v.twin}' ≠ Stage-A name '${v.stageA}' (one-code=one-name; a code mirrored at the wrong meaning)`);
  if (nameViol.length === 0) console.log(`  ✅ name-parity: every twin code's name == Stage-A's (no semantic squat)`);
  console.log(`  type-system frontier (${typeFrontier.length} TYPE-* codes the twin does not yet mirror): ${typeFrontier.join(" ") || "none — the TYPE-* type-system twin is COMPLETE"}`);
  console.log(`  other type-checker families (${otherFamilies.length}; distinct subsystems, NOT the TYPE-* charter — future twin scope): ${otherFamilies.join(" ") || "none"}`);
  console.log(`  other-pass (SymbolResolver, a future twin's scope): ${otherPass.join(" ") || "none"}`);
  console.log(`  ── effect-checker bucket ──`);
  for (const c of ecBad) console.log(`  ⚠ FALSE DIFFERENTIAL ${c} — no emit call-site in effect-checker.ts (effect twin flags what the checker never does)`);
  if (ecBad.length === 0) console.log(`  ✅ effect twin (${ecTwin.length} FUNGI-EFFECT-* codes) ⊆ effect-checker-emitted (no false differential)`);
  for (const v of ecNameViol) console.log(`  ⚠ NAME SQUAT ${v.code} — effect twin name '${v.twin}' ≠ Stage-A name '${v.stageA}' (one-code=one-name; a code mirrored at the wrong meaning)`);
  if (ecNameViol.length === 0) console.log(`  ✅ effect name-parity: every effect twin code's name == Stage-A's (no semantic squat)`);
  for (const v of ecSevViol) console.log(`  ⚠ SEVERITY SKEW ${v.code} — effect twin severity '${v.twin}' ≠ Stage-A severity '${v.stageA}' (an error-as-warning under-blocks; a warning-as-error over-blocks)`);
  if (ecSevViol.length === 0) console.log(`  ✅ effect severity-parity: every effect twin code's severity == Stage-A's where single-valued (conditional codes exempt)`);
  console.log(`  effect frontier (${ecFrontier.length} FUNGI-EFFECT-* codes the twin does not yet mirror): ${ecFrontier.join(" ") || "none — the effect-checker twin is COMPLETE"}`);
}
process.exit(bad.length === 0 && nameViol.length === 0 && ecBad.length === 0 && ecNameViol.length === 0 && ecSevViol.length === 0 ? 0 : 3);
}
