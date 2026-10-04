// rd0361-power-governor.real-ts.mjs: RD-0361 S6b real-.ts adapters for the power-governor frozen set.
// Drives the REAL shipped PowerGovernor / validateEnvelope (package dist) under AEROSPACE_ENVELOPE
// (throttle 70 · safe 85 · critical 95). The twin's integer encodings are realised as real readings:
// band b in {NOMINAL, THROTTLED, SAFETY, TERMINAL} is a reading of 50 / 75 / 88 / 99 C. NON_AUTHORIZING.
import { AEROSPACE_ENVELOPE, PowerGovernor, validateEnvelope } from "../../dist/index.js";

export const source = "packages-ts/galerina-core-sentinel-power/src/power-governor.ts";
const TIERS = ["native", "simd", "shadow"];
const BAND_TEMP = [50, 75, 88, 99];
const STATE_NUM = { NOMINAL: 0, THROTTLED: 1, SAFETY: 2, TERMINAL: 3 };
const governorAt = (tempC) => {
  const g = new PowerGovernor(AEROSPACE_ENVELOPE);
  g.setReading(tempC);
  return g;
};
const band = (s) => Number.isInteger(s) && s >= 0 && s <= 3;
const tier = (r) => Number.isInteger(r) && r >= 0 && r <= 2;

export const adapters = {
  // Real rank, read off real grants: band i permits TIERS[i]; granted iff rank(kernel) >= i.
  powerRank: { covers: () => true, run: (kernel) => [0, 1, 2].filter((i) => governorAt(BAND_TEMP[i]).requestAdjustment(kernel).granted).length - 1 },
  // A reading realises only MONOTONE comparison flags (critical => safe => throttle).
  powerStateVerdict: {
    covers: (crit, safe, thr) => (!crit || safe) && (!safe || thr),
    run: (crit, safe, thr) => STATE_NUM[governorAt(crit ? 99 : safe ? 88 : thr ? 75 : 50).evaluate().state],
  },
  kernelForState: { covers: band, run: (s) => TIERS.indexOf(governorAt(BAND_TEMP[s]).evaluate().kernel) },
  adjustmentVerdict: {
    covers: (t, p) => tier(t) && tier(p),
    run: (t, p) => (governorAt(BAND_TEMP[p]).requestAdjustment(TIERS[t]).granted ? 1 : -1),
  },
  envelopeValid: {
    covers: () => true,
    run: (tp, tls, slc) => {
      const throttleC = tp ? 10 : -10;
      const safeC = tls ? throttleC + 10 : throttleC - 5;
      const criticalC = slc ? safeC + 10 : safeC - 5;
      try { validateEnvelope({ throttleC, safeC, criticalC }); return 1; } catch { return -1; }
    },
  },
  killSwitchVerdict: {
    covers: band,
    run: (s) => { try { governorAt(BAND_TEMP[s]).assertWithinEnvelope(); return 1; } catch { return -1; } },
  },
};
export const uncovered = {};
export const gaps = [
  "powerStateVerdict: non-monotone flag tuples (e.g. critical without safe) cannot be produced by any real reading",
  "kernelForState / killSwitchVerdict: states outside 0..3 have no real PowerState",
  "adjustmentVerdict: ranks outside 0..2 have no real KernelTier",
];
