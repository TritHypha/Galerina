// rd0361-cert-gate.real-ts.mjs: RD-0361 S6b real-.ts adapters for the cert-gate frozen set. Drives the
// REAL toSubVerdicts / certVerdict / withSideSignal / certGate / revocationRecheckDue (package dist) and
// the REAL shipped K3 vAnd (galerina-tower-citizen). The four sub-gates are realised as concrete
// CertGateInput fields; boundaryAuthorized is a real certGate() whose folded verdict is checked to equal
// the case's trit before its decision is read. NON_AUTHORIZING.
import { certGate, certVerdict, revocationRecheckDue, toSubVerdicts, withSideSignal } from "../../dist/index.js";
import { vAnd } from "../../../galerina-tower-citizen/dist/three-valued-governance.js";

export const source = "packages-ts/galerina-core-network/src/cert-gate.ts";
const sub = (input) => toSubVerdicts(input);
function boundaryInput(v) {
  return {
    pinnedDigests: ["ab12"], presentedDigest: "ab12",
    chainOutcome: v === 1 ? "valid" : v === 0 ? "incomplete" : "invalid",
    notBefore: 0, notAfter: 100, now: 50,
    revocation: "good", revocationProducedAt: 40, revocationFreshnessMs: 60,
  };
}
export const adapters = {
  vAnd: { covers: () => true, run: (a, b) => vAnd(a, b) },
  withSideSignal: { covers: () => true, run: (a, b) => withSideSignal(a, b) },
  certVerdict: { covers: () => true, run: (p, c, n, r) => certVerdict({ pinMatch: p, chainValid: c, notExpired: n, revocationFresh: r }) },
  pinMatchVerdict: {
    covers: () => true,
    run: (cfg, present, match) => sub({ pinnedDigests: cfg ? ["ab12"] : [], presentedDigest: present ? (match ? "AB12" : "cd34") : "" }).pinMatch,
  },
  chainValidVerdict: {
    covers: () => true,
    run: (valid, invalid) => sub({ chainOutcome: valid ? "valid" : invalid ? "invalid" : "incomplete" }).chainValid,
  },
  notExpiredVerdict: {
    covers: () => true,
    run: (known, within) => sub(known ? { notBefore: 0, notAfter: 100, now: within ? 50 : 200 } : {}).notExpired,
  },
  revocationVerdict: {
    covers: () => true,
    run: (revoked, good, fresh) => sub({
      revocation: revoked ? "revoked" : good ? "good" : "unknown",
      now: 100, revocationProducedAt: fresh ? 90 : 0, revocationFreshnessMs: 60,
    }).revocationFresh,
  },
  boundaryAuthorized: {
    covers: () => true,
    run: (v) => {
      const d = certGate(boundaryInput(v));
      if (d.verdict !== v) throw new Error(`realisation failed: certGate folded ${d.verdict}, wanted ${v}`);
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
