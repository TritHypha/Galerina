// =============================================================================
// audit-silent-overwrite.mjs — hunt the silent-name-collision class with myco (owner 2026-07-18)
// =============================================================================
// THE CLASS. A duplicate FLOW / type / enum-variant / record-field / flow-param / EFFECT silently
// overwrote or deduped in a name-keyed collection and never errored (fixed 4ee026d2 / 3e58fac3 /
// 9578e221 for flow/type/member; duplicate EFFECT confirmed still open). Rather than keep hunting each
// by hand, this tool systematises the hunt: it asks myco (the graph-indexed finder) for every
// name-keyed collection write in the checker/emitter source, and flags the ones with NO nearby
// duplicate-guard as CANDIDATES for the next silent-overwrite bug.
//
// It is a REVIEW AID, not a proof — a name-keyed `.set`/`.add` with no `.has` / FUNGI-NAME-002 /
// "already declared" within a window is a *candidate*; many are legitimate overwrite caches. So the
// known-reviewed sites are a SHRINK-ONLY baseline and the check is report-only in phase-close: a NEW
// unguarded name-keyed write surfaces immediately, existing reviewed ones stay quiet.
//
//   uses:   myco -e "<pattern>" <scan-dir>   (two queries: writes, then guards) — honours .gitignore
//   report: candidate write sites not in the reviewed baseline, grouped by collection
//
// Usage: node scripts/audit-silent-overwrite.mjs [--self-test] [--all]
//        --all lists every name-keyed write (guarded + unguarded); default lists only candidates.
//        exit 0 always (report-only backlog); fail-closed exit 2 only if myco is unavailable.
// =============================================================================
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MYCO = join(ROOT, "packages-galerina", "galerina-tools-myco", "dist", "cli.js");
const SCAN = "packages-galerina/galerina-core-compiler/src";
const GUARD_WINDOW = 18; // lines: a guard this close to a write counts as protecting it

// ── SHRINK-ONLY baseline: reviewed name-keyed writes that legitimately overwrite (caches / non-name
//    registries), keyed "file:collection". Adding here is a review flag; removing (a site got a real
//    guard, or was deleted) is fine. Seed it from the first real run, then it only shrinks. ──────────
const REVIEWED = new Set([
  // Reviewed 2026-07-18 (owner silent-overwrite hunt, #126). The ONE real top-level declaration collision
  // this surfaced — duplicate domain-guard/policy names (governance-verifier knownDomainGuards) — is now
  // caught upstream by the type-checker (checkDuplicateTopLevelGovernance → FUNGI-NAME-002); its .set site
  // stays here because the guard lives in a different pass, so the heuristic can't see it. The rest are
  // legitimate last-write / accumulation, verified by reading each:

  // — now GUARDED upstream (#126: type-checker rejects the dup before this map is built) —
  "governance-verifier.ts:knownDomainGuards",

  // — flow-name-keyed → a duplicate key can only arise from a duplicate FLOW name, already rejected by #107 —
  "type-checker.ts:flowDeclaredEffects",
  "governance-verifier.ts:governanceFlagsByFlow",
  "governance-verifier.ts:proofGraphsByFlow",
  "governance-verifier.ts:intentStatus",

  // — Set / map semantics where last-write or union IS correct (not a name registry) —
  "governance-verifier.ts:effects",         // permitted_effects Set — add of a dup name is idempotent
  "governance-verifier.ts:aliasCarries",    // read-then-merge (union) of carried taint labels, not overwrite
  "governance-verifier.ts:ceilings",        // enforced_limits keyed by canonicalLimitName — alias→canonical last-wins is intended
  "stdlib.ts:fields",                       // Map.from over entries — last-key-wins is standard map construction
  "value-state-checker.ts:result",          // per-block "safe binding has a gate?" analysis state
  "interpreter.ts:fnIndex",                 // flow-LOCAL fn helpers (runtime dispatch), not a top-level decl

  // — output buffers / accumulators (not name-keyed declaration registries at all) —
  "wat-emitter.ts:out",
  "governance-verifier.ts:out",
  "governance-verifier.ts:denied",
  "stdlib.ts:merged",
  "escape-analysis.ts:types",

  // — section-keyed, NOT a user name: contractSetDecl.value is a SECTION keyword (intent/privacy/audit/…),
  //   so a "duplicate" is a repeated section, whose semantics differ from a name collision — left for a
  //   separate, narrower review rather than treated as the dup-name class —
  "governance-verifier.ts:knownContractSets",
]);

// ── pure core (self-tested) ──────────────────────────────────────────────────

/** Parse myco's `relpath:line:col:text` output into {file,line,text}. */
export function parseMyco(output) {
  const out = [];
  for (const ln of (output ?? "").split(/\r?\n/)) {
    const m = ln.match(/^(.+?):(\d+):(\d+):(.*)$/);
    if (m) out.push({ file: m[1].replace(/\\/g, "/"), line: Number(m[2]), text: m[4] });
  }
  return out;
}

/** The collection identifier written by `X.set(`/`X.add(`, or "" if the line is not such a write. */
export function collectionOf(text) {
  const m = text.match(/([A-Za-z_]\w*)\s*\.\s*(?:set|add)\s*\(/);
  return m ? m[1] : "";
}

/** The first argument (the KEY) of a `.set(`/`.add(` write, trimmed. */
export function keyArgOf(text) {
  const m = text.match(/\.\s*(?:set|add)\s*\(\s*([^,)]+)/);
  return m ? m[1].trim() : "";
}

/**
 * A DECLARATION-NAMESPACE write is one whose key is an AST node's `.value` or `.name` — e.g.
 * `out.set(node.value, …)`, `variants.add(child.value)`. That is the exact signature of a name
 * registry built from parsed declarations, which is where the silent-collision bugs live (dup
 * flow/type/enum-variant/record-field/EFFECT). A key that is a literal (`"x"`, `0`), or a bare local
 * whose name isn't an AST value/name (`stripped`, `id`, `hash`), is a runtime cache — deliberately
 * OUT of scope, because that is the noise (~100 cache writes) that drowns the real signal.
 */
export function isNameKeyed(text) {
  if (collectionOf(text) === "") return false;
  return /\.\s*(?:value|name)\b/.test(keyArgOf(text));           // key is an AST node's .value / .name
}

/** A write is a CANDIDATE if no guard sits within `window` lines of it in the same file. */
export function unguardedCandidates(writes, guards, window) {
  const byFile = new Map();
  for (const g of guards) { if (!byFile.has(g.file)) byFile.set(g.file, []); byFile.get(g.file).push(g.line); }
  return writes.filter((w) => {
    const lines = byFile.get(w.file) ?? [];
    return !lines.some((l) => Math.abs(l - w.line) <= window);
  });
}

// ── myco integration ─────────────────────────────────────────────────────────
function mycoSearch(pattern) {
  try {
    return execFileSync("node", [MYCO, "-e", pattern, SCAN, "--no-color", "-n", "2000", "--no-refresh"], { encoding: "utf8", cwd: ROOT });
  } catch (e) {
    if (e.status === 1) return ""; // myco: 1 = no matches (not an error)
    throw e;
  }
}

// ── self-test ─────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`); } else { fail++; console.log(`  ❌ ${m}`); } };

  ok(collectionOf("      out.set(node.value, variants);") === "out", "collectionOf reads the collection ident");
  ok(collectionOf("if (x) foo.add(child.value)") === "foo", "collectionOf handles .add");
  ok(collectionOf("return x + 1") === "", "a non-write line yields no collection");
  ok(keyArgOf("out.set(node.value, variants)") === "node.value", "keyArgOf reads the first arg");
  ok(isNameKeyed("out.set(node.value, variants)") === true, "a .value-keyed write is a declaration namespace");
  ok(isNameKeyed("v.add(child.name)") === true, "a .name-keyed write is a declaration namespace too");
  ok(isNameKeyed('_stringTable.set("literal", id)') === false, "a string-literal key is a cache, not a namespace");
  ok(isNameKeyed("arr.set(0, x)") === false, "a numeric key is a cache");
  ok(isNameKeyed("m.set(paramName, t)") === false, "a bare local (no .value/.name) is OUT of scope — the cache noise we drop");

  const writes = [{ file: "a.ts", line: 10, text: "m.set(n.value,x)" }, { file: "a.ts", line: 50, text: "q.set(n.value,x)" }];
  const guards = [{ file: "a.ts", line: 12, text: "m.has(n.value)" }];
  const cand = unguardedCandidates(writes, guards, 18);
  ok(cand.length === 1 && cand[0].line === 50, "a write with a guard within the window is cleared; the far one is a candidate");
  ok(unguardedCandidates(writes, [], 18).length === 2, "no guards → both are candidates");
  ok(parseMyco("packages/x.ts:12:5:  foo.set(a,b)")[0]?.line === 12, "parseMyco reads line numbers");

  console.log(`\n${fail === 0 ? "✅" : "❌"} silent-overwrite self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── main — report-only backlog ────────────────────────────────────────────────
if (!existsSync(MYCO)) {
  console.error(`❌ silent-overwrite: myco is not built at ${MYCO.replace(ROOT, ".")} — run its build first (npm --prefix packages-galerina/galerina-tools-myco run build). Fail-closed: this hunt needs the finder.`);
  process.exit(2);
}

const writes = parseMyco(mycoSearch("\\.(set|add)\\(")).filter((w) => isNameKeyed(w.text));
// guards: a membership check, a duplicate diagnostic, or an "already declared" message near a write.
const guards = parseMyco(mycoSearch("\\.has\\(|FUNGI-NAME-002|already declared"));
const candidates = unguardedCandidates(writes, guards, GUARD_WINDOW)
  .filter((w) => !REVIEWED.has(`${w.file.split("/").pop()}:${collectionOf(w.text)}`));

const ALL = process.argv.includes("--all");
console.log("silent-overwrite (myco-powered) — name-keyed collection writes lacking a nearby dup-guard.");
console.log(`  scanned: ${SCAN} · ${writes.length} name-keyed writes · ${guards.length} guard signals · window ±${GUARD_WINDOW} lines.`);
console.log("  NOTE: heuristic REVIEW AID, not a proof. A candidate is a name-keyed .set/.add with no");
console.log("        .has / FUNGI-NAME-002 / 'already declared' nearby — review for a silent-overwrite (dup) bug.");
if (ALL) {
  for (const w of writes) {
    const guarded = !candidates.includes(w);
    console.log(`  ${guarded ? "✅guarded " : "⚠CANDIDATE"} ${w.file}:${w.line}  ${collectionOf(w.text)}.<set/add>(${keyArgOf(w.text)})`);
  }
}
const byColl = new Map();
for (const c of candidates) { const k = `${c.file}::${collectionOf(c.text)}`; if (!byColl.has(k)) byColl.set(k, []); byColl.get(k).push(c.line); }
if (candidates.length) {
  console.log(`\n  ${candidates.length} CANDIDATE write(s) across ${byColl.size} collection(s) — review each for duplicate-key silent-overwrite:`);
  for (const [k, lines] of byColl) {
    const [file, coll] = k.split("::");
    console.log(`    ⚠ ${coll}  (${file}:${lines.join(",")})`);
  }
} else {
  console.log("\n  ✅ 0 unguarded name-keyed writes outside the reviewed baseline.");
}
process.exit(0); // report-only backlog (like fungi-quality) — surfaces candidates, never blocks
