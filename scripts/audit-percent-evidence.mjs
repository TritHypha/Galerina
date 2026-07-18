// =============================================================================
// audit-percent-evidence.mjs — every published % must carry evidence (RULING 1)
// =============================================================================
// THE DEFECT THIS DETECTS. The % audit's two headline tables (ZERO_TRUST,
// BUILD_PROGRESS in component-health.mjs) were HAND-TYPED constants — one live
// number out of nineteen — and `ztAvg`/`buildAvg` were plain averages over them.
// Nothing bound a number to evidence, so "get every component to 100%" had a
// literal ten-line solution: retype the constants. The audit would then have
// repeated that back forever, with the authority of instrumentation.
//
// The discipline already existed TWENTY LINES DOWN, in TRACKING_REGISTRY's header:
//   "a bare % ONLY where a countable ladder exists (tests / rungs / increments);
//    otherwise it is a truthful WORD. Never an invented number."
// It had simply never been extended to the two tables feeding the toplines. This
// gate extends it. BUILD_PROGRESS already carries two word-rows (P9, B8) with a
// `status:` and no `pct`, so the mechanism is half-present — this finishes it.
//
// THE RULE (R&D-blessed 2026-07-17). A quantified row must declare exactly one of:
//   live     — computed from a live source at render time.
//   ladder   — pct DERIVED from rungs; each rung names a MECHANICALLY CHECKABLE
//              artifact, and `done` is COMPUTED by checking them, never written.
//   asserted — hand-typed. A declared DEBT. Must be in ASSERTED_BASELINE below.
//
// ★ Why `done` must be computed, not typed (R&D's refinement, and the load-bearing
//   half): a derived pct resting on a hand-typed `done` is WORSE than an honest
//   constant, because it LOOKS computed while the fiction has just moved one level
//   down. So a ladder whose stated pct disagrees with its COMPUTED done is a FAIL,
//   not a rounding note.
//
// FAIL-CLOSED DIRECTION: no checkable ladder ⇒ NO NUMBER (carry a word). This gate
// never asks a row to invent a ladder; it asks it to stop claiming a number it
// cannot evidence.
//
// THE RATCHET. Converting all nineteen rows at once would mean inventing nineteen
// ladders in one sitting — exactly the guessing this gate exists to stop. So the
// existing hand-typed rows are a DECLARED, SHRINK-ONLY baseline (the same pattern
// as the .fungi corpus-check ratchet). A NEW bare pct fails immediately; a baseline
// row that gets real evidence must LEAVE the baseline and can never return.
//
// Usage: node scripts/audit-percent-evidence.mjs [--self-test]
// =============================================================================
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { twinParityLadder } from "./lib/twin-parity-ladder.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── THE RATCHET ──────────────────────────────────────────────────────────────
// Rows still carrying a hand-typed pct. THIS LIST MAY ONLY SHRINK. Adding to it is
// a red flag in review: it means a new number was published without evidence.
// Each entry's `asserted:` reason in component-health.mjs states what its ladder
// WOULD be — so this is a work-list, not a dump.
const ASSERTED_BASELINE = Object.freeze([
  "Compiler",
  "I/O — OS kernel",
  "Packages",
  "Memory",
  "TLSTP — zero-middleware",
  "Specification / KB",
  "Lexer / Parser / Verifier / Contract / Value-state",
  "DRCM Phases 1-7 (Stage-A simulation)",
  "CBOR Manifests (RFC 8949)",
  "Stage-B self-hosting — interpreter parity",
  // "Type checker / Effect checker" LEFT the baseline 2026-07-18 (#122): it now derives its pct from
  // a real twin diagnostic-code-parity ladder. Per the ratchet, it can never return here.
  "WAT emitter",
  "Runtime interpreter",
  "Application-framework layer",
  "Post-Quantum & Hardware Security",
  "Passive Execution Plans & Target Bridges",
  "AI Inference Tower (BitNet/Groq/NVFP4)",
  "Photonic / Ternary Computing",
]);

// ── pure core (self-tested) ──────────────────────────────────────────────────

/**
 * Compute a ladder's `done` by CHECKING each rung's artifact. Never reads a stored
 * count. `checkRung` is injected so the self-test can drive it without touching the
 * repo (a DI seam — no monkeypatching).
 */
export function computeDone(ladder, checkRung) {
  let done = 0;
  for (const rung of ladder) done += checkRung(rung) ? 1 : 0;
  return done;
}

/** Derived pct from a ladder. Rounded the same way buildAvg rounds, so comparisons are exact. */
export function ladderPct(ladder, checkRung) {
  if (!Array.isArray(ladder) || ladder.length === 0) return null;
  return Math.round((computeDone(ladder, checkRung) / ladder.length) * 100);
}

/**
 * Audit every quantified row. Returns { violations, assertedSeen }.
 * Deny-by-default: a row is clean only if it PROVES one of the three kinds.
 */
export function auditRows(sections, baseline, checkRung = () => false) {
  const violations = [];
  const assertedSeen = new Set();
  for (const s of sections) {
    if (s.kind !== "meter") continue;
    for (const r of s.rows ?? []) {
      if (typeof r.pct !== "number") continue;          // a WORD row — the fail-closed target state
      const ev = r.evidence;
      if (!ev) {
        violations.push({ label: r.label, kind: "NO_EVIDENCE", detail: `pct ${r.pct} with no evidence binding — declare live / ladder / asserted` });
        continue;
      }
      if (ev.live) continue;                            // live source
      if (ev.ladder) {
        const derived = ladderPct(ev.ladder, checkRung);
        if (derived !== r.pct) {
          violations.push({ label: r.label, kind: "LADDER_DISAGREES", detail: `published pct ${r.pct} but the COMPUTED ladder says ${derived} — a derived number resting on an asserted count is worse than an honest constant` });
        }
        continue;
      }
      if (ev.asserted) {
        assertedSeen.add(r.label);
        if (!baseline.includes(r.label)) {
          violations.push({ label: r.label, kind: "NEW_ASSERTED", detail: `a NEW hand-typed pct (${r.pct}) not in ASSERTED_BASELINE — publish evidence or publish a word, not a number` });
        }
        continue;
      }
      violations.push({ label: r.label, kind: "BAD_EVIDENCE", detail: `evidence must be one of live / ladder / asserted, got ${JSON.stringify(ev)}` });
    }
  }
  return { violations, assertedSeen };
}

/** The ratchet: a baseline entry that no longer asserts must be REMOVED (it cannot come back). */
export function staleBaseline(baseline, assertedSeen) {
  return baseline.filter((l) => !assertedSeen.has(l));
}

// ── self-test — non-vacuous in BOTH directions ───────────────────────────────

function selfTest() {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`); } else { fail++; console.log(`  ❌ ${m}`); } };
  const meter = (rows) => [{ kind: "meter", rows }];

  // Clean cases stay SILENT.
  ok(auditRows(meter([{ label: "L", pct: 100, evidence: { live: "version.json" } }]), []).violations.length === 0,
    "a LIVE row passes");
  ok(auditRows(meter([{ label: "W", pct: null, status: "in progress" }]), []).violations.length === 0,
    "a WORD row (no pct) passes — the fail-closed target state is not punished");
  ok(auditRows(meter([{ label: "B", pct: 40, evidence: { asserted: "why" } }]), ["B"]).violations.length === 0,
    "a DECLARED baseline row passes (the ratchet allows existing debt)");

  // Fires on every defect.
  ok(auditRows(meter([{ label: "X", pct: 99 }]), []).violations[0]?.kind === "NO_EVIDENCE",
    "a bare pct with NO evidence FIRES");
  ok(auditRows(meter([{ label: "N", pct: 77, evidence: { asserted: "snuck in" } }]), []).violations[0]?.kind === "NEW_ASSERTED",
    "a NEW hand-typed pct outside the baseline FIRES (the ratchet cannot be widened silently)");
  ok(auditRows(meter([{ label: "Z", pct: 50, evidence: { ladder: ["a", "b"] } }]), [], () => false).violations[0]?.kind === "LADDER_DISAGREES",
    "an INFLATED ladder FIRES — published 50 while 0 of 2 rungs actually check");

  // ★ R&D's refinement, tested directly: `done` is COMPUTED, so the same ladder
  //   yields a different pct purely from the artifacts changing. A hand-typed
  //   `done` could never do this.
  const ladder = ["r1", "r2", "r3", "r4"];
  ok(ladderPct(ladder, () => true) === 100 && ladderPct(ladder, () => false) === 0 &&
     ladderPct(ladder, (r) => r === "r1" || r === "r2") === 50,
    "ladderPct is COMPUTED from the artifacts (100 / 0 / 50 on the same ladder) — not read from a stored count");
  ok(auditRows(meter([{ label: "Z", pct: 50, evidence: { ladder } }]), [], (r) => r === "r1" || r === "r2").violations.length === 0,
    "a HONEST ladder (published 50 == computed 50) is silent — the gate is not just 'always fire'");

  // The ratchet only shrinks.
  ok(staleBaseline(["A", "B"], new Set(["A"])).join() === "B",
    "a baseline row that no longer asserts is reported STALE (must be removed — it cannot return)");
  ok(auditRows(meter([{ label: "E", pct: 10, evidence: { hunch: true } }]), []).violations[0]?.kind === "BAD_EVIDENCE",
    "an unrecognised evidence kind FIRES (deny-by-default, not 'anything truthy passes')");

  console.log(`\n${fail === 0 ? "✅" : "❌"} percent-evidence self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── main ─────────────────────────────────────────────────────────────────────

if (process.argv.includes("--self-test")) selfTest();

const raw = execFileSync("node", [join(ROOT, "scripts", "component-health.mjs"), "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const audit = JSON.parse(raw).percentAudit;

// #122: the FIRST real ladder is wired — "Type checker / Effect checker" derives from twin
// diagnostic-code parity. checkRung consults the SAME twinParityLadder() source component-health
// published from, so the gate recomputes the pct INDEPENDENTLY and fails LADDER_DISAGREES on any skew
// (the whole point: a derived pct resting on a count the verifier computes differently is the defect).
// If the twin audit can't run, component-health degrades that row to a WORD (no pct) — so there is no
// ladder row to check and the empty mirrored set is never consulted.
let mirrored = new Set();
try { mirrored = twinParityLadder().mirrored; } catch { /* row degraded to a word upstream — nothing to check */ }
const checkRung = (code) => mirrored.has(code);
const { violations, assertedSeen } = auditRows(audit.sections, ASSERTED_BASELINE, checkRung);
const stale = staleBaseline(ASSERTED_BASELINE, assertedSeen);

const quantified = audit.sections.filter((s) => s.kind === "meter").flatMap((s) => (s.rows ?? []).filter((r) => typeof r.pct === "number"));
const live = quantified.filter((r) => r.evidence?.live).length;
const ladderCount = quantified.filter((r) => r.evidence?.ladder).length;

if (violations.length) {
  console.error(`❌ percent-evidence: ${violations.length} violation(s) — a published % must carry evidence.\n`);
  for (const v of violations) console.error(`   [${v.kind}] ${v.label}\n      ${v.detail}`);
  process.exit(1);
}
if (stale.length) {
  console.error(`❌ percent-evidence: ${stale.length} STALE baseline entr(ies) — these no longer assert, so they must be REMOVED from ASSERTED_BASELINE (the ratchet only shrinks):\n   ${stale.join("\n   ")}`);
  process.exit(1);
}

console.log(`✅ percent-evidence: ${quantified.length} quantified rows — ${live} live · ${ladderCount} ladder · ${assertedSeen.size} asserted (declared debt, ratchet holds).`);
console.log(`   The ${assertedSeen.size} asserted rows are HAND-TYPED, not measured. They are labelled as such in every render.`);
console.log(`   Ratchet: no NEW bare pct can be published, and a row that earns evidence can never return to the baseline.`);
