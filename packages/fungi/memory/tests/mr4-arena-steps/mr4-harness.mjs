// MR4 harness: the MR3 flattening harness drives the new caller-wiring flows
// in secret-arena.fungi. A step value is verdict * 10 + next state token.
import assert from "node:assert/strict";
import { runFlow, expectPacked, withMutant, OP, ST } from "../mr3-fungi-arena/mr3-harness.mjs";

export { runFlow, expectPacked, withMutant, OP, ST };

export function decode(value) {
  return { verdict: Math.trunc(value / 10), next: value % 10 };
}

export function expectStep(r, verdict, next, label) {
  expectPacked(r, verdict * 10 + next, label);
  const d = decode(r.value);
  assert.equal(d.verdict, verdict, label + " verdict");
  assert.equal(d.next, next, label + " next state");
}

export function step(op, state, packed) {
  return runFlow("arenaStep", [op, state, packed]);
}

export function hasStep(o = {}) {
  return runFlow("arenaHasStep", [0, o.stateToken ?? 0, 0, o.statusToken ?? 0, 0, o.dataLen ?? 1, 0, o.dataByte ?? 1]);
}

export function statusStep(o = {}) {
  return runFlow("arenaStatusStep", [0, o.stateToken ?? 0, 0, o.statusToken ?? 0, 0, o.dataLen ?? 1, 0, o.dataByte ?? 0]);
}

export function epochStep(o = {}) {
  return runFlow("arenaEpochStep", [
    0, o.stateToken ?? 0, 0, o.statusToken ?? 0, 0, o.dataLen ?? 8,
    0, o.epochValue ?? 1, 0, o.lastEpoch ?? 1, 0, o.fenceEpoch ?? 2,
  ]);
}

export function putStep(o = {}) {
  return runFlow("arenaPutStep", [
    0, o.stateToken ?? 0, 0, o.nameLen ?? 1, 0, o.valueLen ?? 1, 0, o.maxFrame ?? 64,
    0, o.highBit ?? 0, 0, o.statusToken ?? 0, 0, o.wipeToken ?? 0,
    o.replyLenClass ?? 0, o.replyLen ?? 0, o.replyWipeClass ?? 0, o.replyWipeToken ?? 0,
  ]);
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

export function leasedUse(o = {}) {
  return runFlow("arenaLeasedUse", useArgs(o));
}

export function leasedUseStep(o = {}) {
  return runFlow("arenaLeasedUseStep", useArgs(o));
}

// Bare arenaUse with the same defaults (no lease), for differential checks.
export function bareUse(o = {}) {
  const a = useArgs(o);
  a.splice(2, 2);
  return runFlow("arenaUse", a);
}