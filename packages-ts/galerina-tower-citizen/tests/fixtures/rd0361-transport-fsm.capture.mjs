// rd0361-transport-fsm.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the transport-fsm
// twin. Oracle = the REAL shipped transportStep (package dist), driven exactly as
// rd0361-transport-fsm-execution.test.mjs drives it: encoded (state, hasKeys, enteredAt, kind, g, nowMs,
// timeoutMs) is decoded to a real context/event, the real step decides, and each of the four twin
// projections is read off the real result. The "no clock" and "no keys" values are taken from the real FSM
// (initialContext / a fatal step), never written as literals. Re-capture: node scripts/rd0361-freeze-reference.mjs.
import { initialTransportContext as initialContext, transportStep } from "../../dist/index.js";

export const twin = Object.freeze({
  dir: "packages-ts/galerina-tower-citizen/src/self-hosted",
  file: "transport-fsm.fungi",
  module: "transport-fsm",
});
export const oracle = Object.freeze({
  kind: "typescript-shadow-capture",
  source: "packages-ts/galerina-tower-citizen/src/transport-fsm.ts",
});
const ARGS = ["int", "int", "int", "int", "int", "int", "int"];
export const signatures = Object.freeze([
  { name: "s4NextState", params: ARGS, returns: "int" },
  { name: "s4Erased", params: ARGS, returns: "int" },
  { name: "s4NextHasKeys", params: ARGS, returns: "int" },
  { name: "s4NextEnteredAt", params: ARGS, returns: "int" },
]);

const KEYS = Object.freeze({ chain: "x25519+mlkem" });
const TIMEOUT = 500;
const NO_CLOCK = initialContext(KEYS).enteredRecoveringAt;
const NO_KEYS = transportStep(initialContext(KEYS), { kind: "fatal" }, { timeoutMs: TIMEOUT }).next.keys;
const STATE_NAME = ["Established", "Recovering", "Closed"];
const STATE_NUM = { Established: 0, Recovering: 1, Closed: 2 };

function realStep(st, hk, ea, kind, g, nowMs, timeoutMs) {
  const ctx = { state: STATE_NAME[st], enteredRecoveringAt: ea === -1 ? NO_CLOCK : ea, keys: hk === 1 ? KEYS : NO_KEYS };
  const event = kind === 0 ? { kind: "fault", nowMs }
    : kind === 1 ? { kind: "reverify", subVerdicts: [1, 1, g], nowMs }
    : kind === 2 ? { kind: "tick", nowMs }
    : { kind: "fatal" };
  return transportStep(ctx, event, { timeoutMs });
}
export const reference = Object.freeze({
  s4NextState: (...a) => STATE_NUM[realStep(...a).next.state],
  s4Erased: (...a) => (realStep(...a).erased ? 1 : 0),
  s4NextHasKeys: (...a) => (realStep(...a).next.keys === NO_KEYS ? 0 : 1),
  s4NextEnteredAt: (...a) => {
    const at = realStep(...a).next.enteredRecoveringAt;
    return at === NO_CLOCK ? -1 : at;
  },
});

// The existing test's 6 contexts x 8 events, plus extra tick/fault boundaries around enteredAt=100, tau=500.
const CONTEXTS = [["est-keys", 0, 1, -1], ["est-nokeys", 0, 0, -1], ["rec-keys-100", 1, 1, 100], ["rec-nokeys-100", 1, 0, 100], ["rec-keys-nullclk", 1, 1, -1], ["closed", 2, 0, -1]];
const EVENTS = [
  ["fault-150", 0, 0, 150], ["fault-0", 0, 0, 0], ["fatal", 3, 0, 0],
  ["tick-100", 2, 0, 100], ["tick-599", 2, 0, 599], ["tick-600", 2, 0, 600], ["tick-601", 2, 0, 601], ["tick-9999", 2, 0, 9999],
  ["reverify-deny", 1, -1, 150], ["reverify-indet", 1, 0, 150], ["reverify-allow", 1, 1, 150],
];
const PROJ = [["state", "s4NextState"], ["erased", "s4Erased"], ["keys", "s4NextHasKeys"], ["at", "s4NextEnteredAt"]];
export function cases() {
  const rows = [];
  for (const [cn, st, hk, ea] of CONTEXTS) for (const [en, kind, g, nowMs] of EVENTS) for (const [pn, exp] of PROJ)
    rows.push({ id: `${pn}-${cn}-${en}`, export: exp, args: [st, hk, ea, kind, g, nowMs, TIMEOUT] });
  return rows;
}
