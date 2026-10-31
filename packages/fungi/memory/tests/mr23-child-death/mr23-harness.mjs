// MR23 harness: custodian child death seen from the parent (gap 2.2 / H7,
// .fungi side), driven through the MR3 flattening harness. Synthetic
// integers only: exit kinds, exit statuses and signal numbers, no bytes.
import { runFlow, expectPacked, withMutant, ST } from "../mr3-fungi-arena/mr3-harness.mjs";

export { runFlow, expectPacked, withMutant, ST };

export const CUSTODIAN_GONE = 153;
export const K3 = Object.freeze({ allow: 1, deny: -1, unknown: -128 });
export const KIND = Object.freeze({ running: 0, exited: 1, signalled: 2 });

// Named child readings used across the files.
export const RUNNING = Object.freeze({ exitKind: 0, detail: 0, inFlight: 0 });
export const SIGKILL_MID = Object.freeze({ exitKind: 2, detail: 9, inFlight: 1 });
export const SIGKILL_IDLE = Object.freeze({ exitKind: 2, detail: 9, inFlight: 0 });
export const EXIT0_IDLE = Object.freeze({ exitKind: 1, detail: 0, inFlight: 0 });
export const EXIT1_MID = Object.freeze({ exitKind: 1, detail: 1, inFlight: 1 });
export const DEATHS = Object.freeze([SIGKILL_MID, SIGKILL_IDLE, EXIT0_IDLE, EXIT1_MID]);

function childArgs(o) {
  return [
    o.exitClass ?? 0, o.exitKind ?? 0,
    o.detailClass ?? 0, o.detail ?? 0,
    o.inFlightClass ?? 0, o.inFlight ?? 0,
  ];
}

export function liveness(o = {}) {
  return runFlow("arenaChildLiveness", childArgs(o));
}

export function deathStep(op, state, o = {}) {
  return runFlow("arenaChildDeathStep", [op, state, ...childArgs(o)]);
}

export function leaseAfter(o = {}) {
  return runFlow("arenaLeaseAfterChildEvent", [
    o.op ?? 3, o.stateClass ?? 0, o.stateToken ?? 0,
    ...childArgs(o),
    o.liveClass ?? 0, o.liveCount ?? 0,
  ]);
}

export function leaseOpen(state, live) {
  return runFlow("arenaLeaseOpen", [0, state, 0, live]);
}

export function outcome(verdict) {
  return runFlow("arenaLeaseReceiptOutcome", [verdict]);
}

export function label(o) {
  return `kind ${o.exitKind} detail ${o.detail} inFlight ${o.inFlight}`;
}
