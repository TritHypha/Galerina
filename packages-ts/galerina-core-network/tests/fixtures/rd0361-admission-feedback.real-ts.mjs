// rd0361-admission-feedback.real-ts.mjs: RD-0361 S6b real-.ts adapters for the admission-feedback frozen
// set. telemetrySideSignal drives the REAL telemetryToSideSignal (package dist); vAnd is the REAL shipped
// K3 vAnd (galerina-tower-citizen three-valued-governance, which admission-feedback.ts imports).
// Flags are realised as real telemetry: health -> "DOWN"; present -> an anomalyScore; garbage -> score 2
// (out of [0,1]); hardDeny -> score 0.9 with denyThreshold 0.8; throttle -> score 0.6 (default 0.5).
// NON_AUTHORIZING.
import { telemetryToSideSignal } from "../../dist/index.js";
import { vAnd } from "../../../galerina-tower-citizen/dist/three-valued-governance.js";

export const source = "packages-ts/galerina-core-network/src/admission-feedback.ts";
function telemetry(health, present, garbage, hardDeny, throttle) {
  const t = {};
  if (health) t.health = "DOWN";
  if (present) {
    if (garbage) t.anomalyScore = 2;
    else if (hardDeny) { t.anomalyScore = 0.9; t.denyThreshold = 0.8; }
    else if (throttle) t.anomalyScore = 0.6;
    else t.anomalyScore = 0.1;
  }
  return t;
}
export const adapters = {
  vAnd: { covers: () => true, run: (a, b) => vAnd(a, b) },
  telemetrySideSignal: { covers: () => true, run: (...flags) => telemetryToSideSignal(telemetry(...flags)) },
};
export const uncovered = {};
export const gaps = [];
