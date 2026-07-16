// =============================================================================
// audit-twin-emit-parity.mjs — twin-emitted ⊆ Stage-A-emitted (fail-closed)
// =============================================================================
// R&D's twin-emit-parity idea (2026-07-16), made structural. The self-hosted
// type-checker TWIN (type-checker.fungi) must only emit diagnostic codes that
// Stage-A actually EMITS. A twin code with no Stage-A emit site is a FALSE
// DIFFERENTIAL — the twin flagging what the real checker never does (fails
// closed against valid programs, erodes "twin ≡ Stage-A").
//
// The authoritative Stage-A emit set is the DERIVED code-registry
// (build/code-registry/registry.json, built by gen-code-registry.mjs): each
// entry carries an `emits` count of real emit sites. A code with emits===0 has
// no Stage-A emit site (021/012/019/027 were all found this way). So:
//   ASSERT  twin.emitSet ⊆ { code | registry.emits > 0 }         (fail-closed)
//   REPORT  type-checker codes with emits>0 absent from the twin (the frontier)
//
// This would have caught 019 + 027 the moment they were mirrored, and it is a
// permanent regression guard as new clusters land. Runs after `code-registry`
// in phase-close so the registry it reads is fresh.
//
// Usage: node scripts/audit-twin-emit-parity.mjs [--json] [--self-test]
//        exit 3 = a twin false differential exists (twin emits a registry emits=0 code)
// =============================================================================
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "build", "code-registry", "registry.json");
const TWIN = join(ROOT, "packages-galerina", "galerina-core-compiler", "src", "self-hosted", "type-checker.fungi");

// ── pure core (self-tested) ───────────────────────────────────────────────────

// Codes the twin raises: every `code: "FUNGI-…"` it appends.
export function twinEmitSet(src) {
  return [...new Set([...src.matchAll(/code:\s*"(FUNGI-[A-Z0-9]+-\d+)"/g)].map((m) => m[1]))].sort();
}

// Stage-A emit set from the registry: codes with a real emit site (emits > 0).
export function stageAEmitSet(entries) {
  return new Set(entries.filter((e) => (e.emits ?? 0) > 0).map((e) => e.code));
}

// twin codes with NO Stage-A emit site = false differentials.
export function falseDifferentials(twinCodes, emitSet, byCode) {
  return twinCodes.filter((c) => !emitSet.has(c)).map((c) => ({ code: c, emits: byCode[c]?.emits ?? "absent" }));
}

// ── self-test ─────────────────────────────────────────────────────────────────
if (process.argv.includes("--self-test")) {
  const entries = [
    { code: "FUNGI-TYPE-011", emits: 1 }, { code: "FUNGI-TYPE-019", emits: 0 },
    { code: "FUNGI-TYPE-027", emits: 0 }, { code: "FUNGI-TYPE-002", emits: 1 },
  ];
  const byCode = Object.fromEntries(entries.map((e) => [e.code, e]));
  const emit = stageAEmitSet(entries);
  assert(emit.has("FUNGI-TYPE-011") && !emit.has("FUNGI-TYPE-019"), "emit set");
  const twin = twinEmitSet(`diags.append({ code: "FUNGI-TYPE-011" }) ... { code: "FUNGI-TYPE-019", x }`);
  assert(twin.length === 2 && twin[0] === "FUNGI-TYPE-011", "twin set");
  const bad = falseDifferentials(twin, emit, byCode);
  assert(bad.length === 1 && bad[0].code === "FUNGI-TYPE-019", "detects 019 false diff");
  const clean = falseDifferentials(["FUNGI-TYPE-011", "FUNGI-TYPE-002"], emit, byCode);
  assert(clean.length === 0, "clean twin passes");
  console.log("twin-emit-parity self-test: 4/4 ok");
  process.exit(0);
}
function assert(ok, what) { if (!ok) { console.error(`self-test FAIL: ${what}`); process.exit(1); } }

// ── main ──────────────────────────────────────────────────────────────────────
const entries = JSON.parse(readFileSync(REGISTRY, "utf8")).entries;
const byCode = Object.fromEntries(entries.map((e) => [e.code, e]));
const emitSet = stageAEmitSet(entries);
const twin = twinEmitSet(readFileSync(TWIN, "utf8"));
const bad = falseDifferentials(twin, emitSet, byCode);

// frontier: TYPE-*/NAME-* codes Stage-A emits that the twin does not yet mirror
const twinSet = new Set(twin);
const frontier = [...emitSet].filter((c) => /^FUNGI-(TYPE|NAME)-/.test(c) && !twinSet.has(c)).sort();

const asJson = process.argv.includes("--json");
if (asJson) {
  console.log(JSON.stringify({ twinEmits: twin.length, falseDifferentials: bad, frontier }, null, 1));
} else {
  console.log(`twin-emit-parity: twin emits ${twin.length} codes · ${bad.length} false differential(s)`);
  for (const b of bad) console.log(`  ⚠ FALSE DIFFERENTIAL ${b.code} — Stage-A registry emits=${b.emits} (twin flags what Stage-A never does)`);
  if (bad.length === 0) console.log(`  ✅ twin-emitted ⊆ Stage-A-emitted (no false differential)`);
  console.log(`  frontier (${frontier.length} TYPE/NAME codes Stage-A emits, twin does not yet mirror): ${frontier.join(" ") || "none — full parity"}`);
}
process.exit(bad.length === 0 ? 0 : 3);
