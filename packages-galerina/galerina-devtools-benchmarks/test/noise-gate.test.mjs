// noise-gate.test.mjs — guards the fail-closed noise preflight (RD-0394 / #63 item 1). Synthetic + deterministic
// (no live timing in the assertions), so it is a stable CI gate. The one job it locks in: the gate can REFUSE.
// A noise gate that always passes is vacuous — worse than none, because it launders a noisy session as measurable.
import { runControl, spreadStats, noiseGateVerdict, measureNoise } from "../src/noise-gate.mjs";

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) fails++; };

// The control probe is sound: deterministic (its wall-time is the only free variable, which is the point).
ok(runControl(200_000).checksum === runControl(200_000).checksum, "control workload deterministic (identical checksum)");

// Spread math is (max − min) / median.
const s = spreadStats([10, 12, 14]);
ok(Math.abs(s.spreadPct - ((14 - 10) / 12) * 100) < 1e-9, "spreadPct = (max − min) / median");
ok(s.medianMs === 12 && s.minMs === 10 && s.maxMs === 14, "spreadStats reports median/min/max");

// A QUIET session PASSES; a NOISY session REFUSES (the non-vacuity guarantee).
ok(noiseGateVerdict({ spreadPct: spreadStats([100, 100.5, 99.5, 100.2, 99.8]).spreadPct }).verdict === "PASSED", "~1% control spread ⇒ PASSED");
ok(noiseGateVerdict({ spreadPct: spreadStats([100, 150, 90, 100, 100]).spreadPct }).verdict === "REFUSED", "60% control spread ⇒ REFUSED (gate can refuse)");

// Threshold boundary honoured on both sides.
ok(noiseGateVerdict({ spreadPct: 7.9 }).verdict === "PASSED", "7.9% ≤ 8% ⇒ PASSED");
ok(noiseGateVerdict({ spreadPct: 8.1 }).verdict === "REFUSED", "8.1% > 8% ⇒ REFUSED");

// An infinite/degenerate spread fails closed.
ok(noiseGateVerdict({ spreadPct: Infinity }).verdict === "REFUSED", "non-finite spread ⇒ REFUSED (fail-closed)");

// A live measurement returns a well-formed, checksum-stable snapshot (the value depends on the host; the SHAPE does not).
const live = measureNoise({ reps: 3, iterations: 300_000 });
ok(live.checksumStable === true, "live measure: control checksum stable across reps");
ok(["PASSED", "REFUSED"].includes(live.verdict) && Array.isArray(live.samples) && live.samples.length === 3, "live measure: well-formed snapshot (verdict + 3 samples)");

console.log(fails === 0 ? "\nnoise-gate: all checks passed ✅" : `\nnoise-gate: ${fails} FAILED ❌`);
process.exit(fails === 0 ? 0 : 1);
