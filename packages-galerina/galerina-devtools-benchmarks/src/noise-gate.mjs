// noise-gate.mjs — the fail-closed NOISE PREFLIGHT for the benchmark runner (RD-0394 / task #63, item 1).
//
// Why: on a shared/policy-locked dev box the native controls swing 20–47% run-to-run with ZERO code change
// (thermal, scheduler migration, AV/VPN filter drivers, CPython GC). Reading a cross-session diff as a
// regression is the classic false alarm. The cure is not to fight the machine — it is to MEASURE whether the
// session is quiet enough to compare at all, and REFUSE to publish comparisons when it is not. A gate, not a tune.
//
// Doctrine (R&D red line, carried verbatim): user-space only. This never touches endpoint agents, the VPN, power
// plans, or any admin/elevated lever — it takes ordinary process-level timing and decides go/no-go, fail-closed.
//
// The control workload is a DETERMINISTIC pure-integer mixing loop: no allocation, no I/O, no wall-clock inside,
// same checksum every run. So any variance in its wall-time is the HOST's (scheduler/thermal/contention), which
// is exactly the noise we are gating on. Checksum stability is asserted — a drifting checksum would mean the
// probe itself is unsound.
//
//   node src/noise-gate.mjs             # measure this box, print verdict, write results/noise-gate-latest.json
//   node src/noise-gate.mjs --self-test # deterministic: prove the detector PASSES quiet + REFUSES noisy (CI)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_THRESHOLD_PCT = 8;   // control spread above this ⇒ session unmeasurable (R&D §1: ~8–10%)
const DEFAULT_REPS = 5;            // 3–5× the control (R&D item 1)
const DEFAULT_ITERS = 6_000_000;  // ~10–40 ms/rep on a modern core — long enough to time, short enough to be cheap

// Deterministic control: a 32-bit integer avalanche (splitmix-flavoured) over a fixed iteration count.
// Pure compute, allocation-free, no time/PRNG read inside — the wall-time is the only thing that can vary.
export function runControl(iterations = DEFAULT_ITERS) {
  let x = 0x9e3779b9 | 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    x ^= x << 13; x |= 0;
    x ^= x >>> 17;
    x ^= x << 5; x |= 0;
    x = (x + 0x6d2b79f5) | 0;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, checksum: x | 0 };
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); const pos = (s.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo); };

// Raw spread = (max − min) / median. Deliberately conservative: ONE spike trips the gate, because a session with
// even one spike is not a session you can publish a comparison from. (The per-benchmark reports use the robust
// IQR form below to reject a single polluted rep without discarding the whole run — a different job, item 4.)
export function spreadStats(samples) {
  const med = median(samples);
  const min = Math.min(...samples), max = Math.max(...samples);
  const iqr = quantile(samples, 0.75) - quantile(samples, 0.25);
  return {
    medianMs: med, minMs: min, maxMs: max,
    spreadPct: med > 0 ? ((max - min) / med) * 100 : Infinity,   // raw — what the gate reads
    iqrPct: med > 0 ? (iqr / med) * 100 : Infinity,               // robust — for report-side median-of-N
  };
}

// Pure verdict — separated from measurement so the self-test can exercise it on synthetic samples.
export function noiseGateVerdict({ spreadPct, thresholdPct = DEFAULT_THRESHOLD_PCT }) {
  const measurable = Number.isFinite(spreadPct) && spreadPct <= thresholdPct;
  return {
    verdict: measurable ? "PASSED" : "REFUSED",
    spreadPct: Number.isFinite(spreadPct) ? Math.round(spreadPct * 10) / 10 : null,
    thresholdPct,
    reason: measurable
      ? `control spread ${spreadPct.toFixed(1)}% ≤ ${thresholdPct}% — session is measurable`
      : `control spread ${Number.isFinite(spreadPct) ? spreadPct.toFixed(1) + "%" : "∞"} > ${thresholdPct}% — UNMEASURABLE session; publish no comparisons (checksums may still verify)`,
  };
}

// Live measurement: run the control `reps`× (discard a warmup rep so the timer/JIT settle), gate the spread,
// assert the checksum is stable (probe soundness), return the full session snapshot.
export function measureNoise({ reps = DEFAULT_REPS, iterations = DEFAULT_ITERS, thresholdPct = DEFAULT_THRESHOLD_PCT } = {}) {
  runControl(iterations); // warmup, discarded
  const runs = Array.from({ length: reps }, () => runControl(iterations));
  const samples = runs.map((r) => r.ms);
  const checksums = new Set(runs.map((r) => r.checksum));
  const checksumStable = checksums.size === 1;
  const stats = spreadStats(samples);
  const gate = noiseGateVerdict({ spreadPct: stats.spreadPct, thresholdPct });
  // Fail closed if the probe itself is unsound (a drifting checksum means the control is non-deterministic → refuse).
  if (!checksumStable) return { ...gate, verdict: "REFUSED", reason: "control checksum unstable — probe unsound, refuse", ...stats, samples: samples.map((s) => Math.round(s * 100) / 100), reps, checksumStable };
  return { ...gate, ...stats, spreadPct: gate.spreadPct, samples: samples.map((s) => Math.round(s * 100) / 100), reps, checksumStable, checksum: [...checksums][0] };
}

function selfTest() {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  // determinism: same iterations ⇒ identical checksum (the probe is sound)
  ok(runControl(200_000).checksum === runControl(200_000).checksum, "control workload is deterministic (identical checksum across runs)");
  // a QUIET synthetic session PASSES
  const quiet = noiseGateVerdict({ spreadPct: spreadStats([100, 100.5, 99.5, 100.2, 99.8]).spreadPct });
  ok(quiet.verdict === "PASSED", `quiet control (~1% spread) ⇒ PASSED (${quiet.spreadPct}%)`);
  // a NOISY synthetic session REFUSES — the gate MUST be able to refuse, or it is vacuous
  const noisy = noiseGateVerdict({ spreadPct: spreadStats([100, 150, 90, 100, 100]).spreadPct });
  ok(noisy.verdict === "REFUSED", `noisy control (60% spread) ⇒ REFUSED (${noisy.spreadPct}%)`);
  // threshold boundary is honoured on both sides
  ok(noiseGateVerdict({ spreadPct: 7.9 }).verdict === "PASSED", "7.9% spread ≤ 8% ⇒ PASSED");
  ok(noiseGateVerdict({ spreadPct: 8.1 }).verdict === "REFUSED", "8.1% spread > 8% ⇒ REFUSED");
  // spread math: (max−min)/median
  const s = spreadStats([10, 12, 14]);
  ok(Math.abs(s.spreadPct - ((14 - 10) / 12) * 100) < 1e-9, "spreadPct = (max−min)/median");
  console.log(process.exitCode ? "  noise-gate self-test FAILED" : "  noise-gate self-test: detector passes quiet + REFUSES noisy ✅");
  process.exit(process.exitCode ?? 0);
}

if (process.argv.includes("--self-test")) selfTest();
else if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("noise-gate.mjs")) {
  const snap = measureNoise();
  const resultsDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "results");
  try { if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true }); writeFileSync(join(resultsDir, "noise-gate-latest.json"), JSON.stringify(snap, null, 2)); } catch { /* non-fatal */ }
  console.log(`NOISE-GATE: ${snap.verdict}`);
  console.log(`  ${snap.reason}`);
  console.log(`  samples(ms): [${snap.samples.join(", ")}] · median ${Math.round(snap.medianMs * 100) / 100} · IQR ${Math.round(snap.iqrPct * 10) / 10}%`);
  // REFUSED is not a build failure — it means "do not publish comparisons this session". Exit 3 so a runner can
  // branch on it (checksums may still verify) without mistaking it for a hard error (2) or success (0).
  process.exit(snap.verdict === "PASSED" ? 0 : 3);
}
