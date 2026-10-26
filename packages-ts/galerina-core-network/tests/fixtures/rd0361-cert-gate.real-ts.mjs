// rd0361-cert-gate.real-ts.mjs: RD-0361 S6b real-.ts adapters for the cert-gate frozen set. Drives the
// REAL toSubVerdicts / certVerdict / withSideSignal / certGate / revocationRecheckDue (package dist) and
// the REAL shipped K3 vAnd (galerina-tower-citizen). The four sub-gates are realised as concrete
// CertGateInput fields; boundaryAuthorized is a real certGate() whose folded verdict is checked to equal
// the case's value before its decision is read. K3-UNKNOWN-NOT-ZERO (owner decision D-A, Phillip
// 2026-10-25 18:28 GMT): K3 values cross the native/TS seam only through the identity-only codec
// (-128 <-> the one K3_UNKNOWN; anything else throws), never by mapping UNKNOWN to 0. NON_AUTHORIZING.
import { certGate, certVerdict, revocationRecheckDue, toSubVerdicts, withSideSignal } from "../../dist/index.js";
import { vAnd } from "../../../galerina-tower-citizen/dist/three-valued-governance.js";
import { decodeK3, encodeK3, NATIVE_UNKNOWN } from "./rd0361-k3-codec.mjs";

export const source = "packages-ts/galerina-core-network/src/cert-gate.ts";
const sub = (input) => toSubVerdicts(input);
const GOOD = Object.freeze({
  pinnedDigests: ["ab12"], presentedDigest: "ab12", chainOutcome: "valid",
  notBefore: 0, notAfter: 100, now: 50,
  revocation: "good", revocationProducedAt: 40, revocationFreshnessMs: 60,
});
// Realise each native K3 value as a concrete certGate input: ALLOW = all four sub-gates good; DENY = a
// provably invalid chain; UNKNOWN = an incomplete chain; NEUTRAL 0 = all good plus a computed 0 side-signal
// (the sub-gates never emit 0 now, so 0 can only arrive as a computed degrade). Anything else throws.
function boundaryInput(v) {
  if (v === 1) return { ...GOOD };
  if (v === -1) return { ...GOOD, chainOutcome: "invalid" };
  if (v === NATIVE_UNKNOWN) return { ...GOOD, chainOutcome: "incomplete" };
  if (v === 0) return { ...GOOD, sideSignals: [0] };
  throw new Error(`realisation failed: not a native K3 value: ${String(v)}`);
}
export const adapters = {
  vAnd: { covers: () => true, run: (a, b) => encodeK3(vAnd(decodeK3(a), decodeK3(b))) },
  withSideSignal: { covers: () => true, run: (a, b) => encodeK3(withSideSignal(decodeK3(a), decodeK3(b))) },
  certVerdict: {
    covers: () => true,
    run: (p, c, n, r) => encodeK3(certVerdict({ pinMatch: decodeK3(p), chainValid: decodeK3(c), notExpired: decodeK3(n), revocationFresh: decodeK3(r) })),
  },
  pinMatchVerdict: {
    covers: () => true,
    run: (cfg, present, match) => encodeK3(sub({ pinnedDigests: cfg ? ["ab12"] : [], presentedDigest: present ? (match ? "AB12" : "cd34") : "" }).pinMatch),
  },
  chainValidVerdict: {
    covers: () => true,
    run: (valid, invalid) => encodeK3(sub({ chainOutcome: valid ? "valid" : invalid ? "invalid" : "incomplete" }).chainValid),
  },
  notExpiredVerdict: {
    covers: () => true,
    run: (known, within) => encodeK3(sub(known ? { notBefore: 0, notAfter: 100, now: within ? 50 : 200 } : {}).notExpired),
  },
  revocationVerdict: {
    covers: () => true,
    run: (revoked, good, fresh) => encodeK3(sub({
      revocation: revoked ? "revoked" : good ? "good" : "unknown",
      now: 100, revocationProducedAt: fresh ? 90 : 0, revocationFreshnessMs: 60,
    }).revocationFresh),
  },
  boundaryAuthorized: {
    covers: () => true,
    run: (v) => {
      const d = certGate(boundaryInput(v));
      const got = encodeK3(d.verdict);
      if (got !== v) throw new Error(`realisation failed: certGate folded ${got}, wanted ${v}`);
      return d.authorized ? "authorized" : "denied";
    },
  },
  revocationRecheckDue: {
    covers: () => true,
    run: (mode, everyMsValid, intervalElapsed, atChunkBoundary) => {
      const cadence = mode === "poll" ? { mode: "poll", everyMs: everyMsValid ? 1000 : 0 } : { mode };
      return revocationRecheckDue(cadence, { atChunkBoundary, msSinceLastCheck: intervalElapsed ? 5000 : 10 }) ? "due" : "not-due";
    },
  },
};
export const uncovered = {};
export const gaps = [];