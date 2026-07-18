// =============================================================================
// twin-parity-ladder.mjs — the Type-checker / Effect-checker %'s RULING-1 ladder
// =============================================================================
// #122. The "Type checker / Effect checker" BUILD_PROGRESS row was a hand-typed 90
// (an `asserted` debt). Its readiness IS mechanically measurable: the fraction of
// the self-hosted twin's TYPE-* ∪ EFFECT-* diagnostic CHARTER that the twin mirrors
// with full emit ⊆ + name-parity + severity-parity. A rung is a diagnostic code; it
// is DONE iff the twin mirrors it (in the mirrored lists) and NOT still on the
// frontier (emitted by Stage-A but not yet twinned).
//
// SINGLE SOURCE OF SCOPING is audit-twin-emit-parity.mjs (--json) — which codes are
// in-charter, mirrored, or frontier is decided THERE, by construction, once. This
// lib only SHAPES that output into a ladder, so the two consumers cannot disagree:
//   component-health.mjs      — imports twinParityLadder() to PUBLISH the pct + ladder
//   audit-percent-evidence.mjs — imports it to build checkRung and VERIFY pct == derived
// (A published pct resting on a count the verifier computes differently is exactly the
//  LADDER_DISAGREES failure the percent-evidence gate exists to catch.)
//
// Usage: node scripts/lib/twin-parity-ladder.mjs [--self-test]
// =============================================================================
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TWIN_AUDIT = join(ROOT, "scripts", "audit-twin-emit-parity.mjs");

/**
 * Pure: shape the twin audit's --json into { ladder, mirrored, done, total, pct }.
 * `mirrored` is the Set the verifier's checkRung consults; `ladder` is every rung
 * (mirrored ∪ frontier). Injected data ⇒ self-testable without spawning (DI seam).
 */
export function deriveLadder(j) {
  const mirrored = new Set([...(j.typeMirrored ?? []), ...(j.effectMirrored ?? [])]);
  const frontier = [...(j.typeFrontier ?? []), ...(j.effectFrontier ?? [])];
  const ladder = [...new Set([...mirrored, ...frontier])].sort();
  const done = ladder.filter((c) => mirrored.has(c)).length;
  const total = ladder.length;
  // Fail-closed: an empty charter is not "100% of nothing", it is a broken measurement.
  if (total === 0) throw new Error("twin-parity-ladder: empty ladder — the twin audit reported no charter codes; RULING-1 forbids publishing a number with no rungs.");
  return { ladder, mirrored, done, total, pct: Math.round((done / total) * 100) };
}

/**
 * Live: run the twin audit and derive. Fail-closed — a subprocess/parse failure THROWS
 * rather than letting the % audit silently fall back to a stale hand-typed number.
 */
export function twinParityLadder() {
  let raw;
  try {
    raw = execFileSync("node", [TWIN_AUDIT, "--json"], { encoding: "utf8" });
  } catch (e) {
    throw new Error(`twin-parity-ladder: audit-twin-emit-parity.mjs --json failed (${e.message}) — cannot derive the type/effect ladder, and RULING-1 forbids publishing an unevidenced number.`);
  }
  return deriveLadder(JSON.parse(raw));
}

// ── self-test — the derivation is non-vacuous in both directions ──────────────
// IS_MAIN guard: this module is IMPORTED by component-health.mjs and audit-percent-evidence.mjs, both
// of which have their OWN --self-test. Without this guard, running EITHER with --self-test would trip
// this block (it sees the importer's argv) and process.exit BEFORE their real self-test runs — the
// shared-module self-test hazard. So fire only when THIS file is the entry point.
const IS_MAIN = process.argv[1] !== undefined && process.argv[1].replace(/\\/g, "/").endsWith("scripts/lib/twin-parity-ladder.mjs");
if (IS_MAIN && process.argv.includes("--self-test")) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`); } else { fail++; console.log(`  ❌ ${m}`); } };

  const r = deriveLadder({ typeMirrored: ["FUNGI-TYPE-001", "FUNGI-TYPE-002"], typeFrontier: ["FUNGI-TYPE-032"], effectMirrored: ["FUNGI-EFFECT-001"], effectFrontier: [] });
  ok(r.total === 4 && r.done === 3 && r.pct === 75, `derives done/total/pct from the lists (3/4 = 75; got ${r.done}/${r.total} = ${r.pct})`);
  ok(r.ladder.length === 4 && r.mirrored.has("FUNGI-TYPE-001") && !r.mirrored.has("FUNGI-TYPE-032"), "a frontier code is a RUNG but NOT mirrored (checkRung=false on it)");
  ok(deriveLadder({ typeMirrored: ["A"], effectMirrored: [], typeFrontier: [], effectFrontier: [] }).pct === 100, "all-mirrored, no frontier → 100");
  ok(deriveLadder({ typeMirrored: [], effectMirrored: [], typeFrontier: ["A", "B"], effectFrontier: [] }).pct === 0, "all-frontier → 0 (the number MOVES with evidence)");
  let threw = false; try { deriveLadder({ typeMirrored: [], effectMirrored: [], typeFrontier: [], effectFrontier: [] }); } catch { threw = true; }
  ok(threw, "empty ladder THROWS (fail-closed — no rungs, no number)");

  // Integration: the LIVE path derives from real sources and is internally consistent.
  const live = twinParityLadder();
  ok(live.total > 0 && live.done <= live.total && live.pct === Math.round((live.done / live.total) * 100),
    `live path is consistent over real data (${live.done}/${live.total} = ${live.pct}%)`);

  console.log(`\n${fail === 0 ? "✅" : "❌"} twin-parity-ladder self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
