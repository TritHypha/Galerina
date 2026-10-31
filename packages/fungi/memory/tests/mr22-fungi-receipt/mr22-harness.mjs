// MR22 harness: one-use lease receipt in secret-arena.fungi (gap 1.1, .fungi
// side), driven through the MR3 flattening harness. Synthetic integers only.
import { runFlow, expectPacked, withMutant, ST } from "../mr3-fungi-arena/mr3-harness.mjs";
import { leasedUse } from "../mr5-release-realloc/mr5-harness.mjs";

export { runFlow, expectPacked, withMutant, ST, leasedUse };

export const K3 = Object.freeze({ allow: 1, deny: -1, unknown: -128 });
export const LEASE_SPENT = 152;

export function useArgs(o) {
  return [
    o.stateClass ?? 0, o.stateToken ?? 0,
    o.liveClass ?? 0, o.liveCount ?? 0,
    o.abortClass ?? 0, o.abortToken ?? 0,
    o.statusClass ?? 0, o.statusToken ?? 0,
    o.lenClass ?? 0, o.dataLen ?? 1,
    o.callbackClass ?? 0, o.callbackToken ?? 1,
    o.wipeClass ?? 0, o.wipeToken ?? 0,
    o.spentViewClass ?? 0, o.spentViewToken ?? 0,
    o.clockClass ?? 0, o.clock ?? 1000,
    o.presentClass ?? 0, o.clockPresent ?? 1,
    o.armedClass ?? 0, o.armedAt ?? 1000,
    o.budgetClass ?? 0, o.budget ?? 5000,
    o.clockEpochClass ?? 0, o.clockEpoch ?? 1,
    o.armedEpochClass ?? 0, o.armedEpoch ?? 1,
  ];
}

function spendArgs(o) {
  return [o.spentClass ?? 0, o.spentCount ?? 0, o.receiptClass ?? 0, o.receiptCount ?? 0];
}

export function spend(o = {}) {
  return runFlow("arenaLeaseSpend", spendArgs(o));
}

export function outcome(verdict) {
  return runFlow("arenaLeaseReceiptOutcome", [verdict]);
}

export function oneUse(o = {}) {
  return runFlow("arenaOneUseLeasedUse", [...spendArgs(o), ...useArgs(o)]);
}

export function receiptsAfter(o = {}) {
  return runFlow("arenaOneUseReceiptsAfter", spendArgs(o));
}

export function step(op, state, packed) {
  return runFlow("arenaStep", [op, state, packed]);
}