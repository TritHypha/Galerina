// MR5 harness: release, re-alloc read and handle-gated leased use in
// secret-arena.fungi, driven through the MR3 flattening harness. All inputs
// are synthetic integers (no secret bytes exist in these tests).
import { runFlow, expectPacked, withMutant, OP, ST } from "../mr3-fungi-arena/mr3-harness.mjs";
import { expectStep, decode } from "../mr4-arena-steps/mr4-harness.mjs";

export { runFlow, expectPacked, withMutant, expectStep, decode, OP, ST };

export const GEN_MAX_LIVE = 2147483646;

function releaseArgs(o) {
  return [
    o.slotGeneration ?? 3, o.handleGeneration ?? 3, o.freed ?? 0,
    o.wipeClass ?? 0, o.wipeToken ?? 0,
    o.readbackClass ?? 0, o.readbackNonZero ?? 0,
  ];
}

export function release(o = {}) {
  return runFlow("arenaRelease", releaseArgs(o));
}

export function nextGeneration(o = {}) {
  return runFlow("arenaReleaseNextGeneration", releaseArgs(o));
}

export function realloc(o = {}) {
  return runFlow("arenaReallocRead", [
    o.releaseVerdict ?? 100, o.priorGeneration ?? 3, o.slotGeneration ?? 4,
    o.lenClass ?? 0, o.readLen ?? 32, o.expectedLen ?? 32,
    o.nonZeroClass ?? 0, o.nonZeroCount ?? 0,
  ]);
}

export function slotCheck(slotGeneration, handleGeneration, freed = 0) {
  return runFlow("arenaSlotCheck", [slotGeneration, handleGeneration, freed]);
}

function useArgs(o) {
  return [
    o.stateClass ?? 0, o.stateToken ?? 0,
    o.liveClass ?? 0, o.liveCount ?? 0,
    o.abortClass ?? 0, o.abortToken ?? 0,
    o.statusClass ?? 0, o.statusToken ?? 0,
    o.lenClass ?? 0, o.dataLen ?? 1,
    o.callbackClass ?? 0, o.callbackToken ?? 1,
    o.wipeClass ?? 0, o.wipeToken ?? 0,
    o.spentClass ?? 0, o.spentViewToken ?? 0,
    o.clockClass ?? 0, o.clock ?? 1000,
    o.presentClass ?? 0, o.clockPresent ?? 1,
    o.armedClass ?? 0, o.armedAt ?? 1000,
    o.budgetClass ?? 0, o.budget ?? 5000,
    o.clockEpochClass ?? 0, o.clockEpoch ?? 1,
    o.armedEpochClass ?? 0, o.armedEpoch ?? 1,
  ];
}

function handleArgs(o) {
  return [o.slotGeneration ?? 3, o.handleGeneration ?? 3, o.freed ?? 0, ...useArgs(o)];
}

export function handleUse(o = {}) {
  return runFlow("arenaHandleLeasedUse", handleArgs(o));
}

export function handleUseStep(o = {}) {
  return runFlow("arenaHandleLeasedUseStep", handleArgs(o));
}

export function leasedUse(o = {}) {
  return runFlow("arenaLeasedUse", useArgs(o));
}
