// MR6 harness: release (op 7) and re-alloc read (op 8) wired through
// arenaStateAfter/arenaStep, plus the derived release cycle. Driven through the
// MR3 flattening harness. All inputs are synthetic integers.
import { runFlow, expectPacked, withMutant, OP, ST } from "../mr3-fungi-arena/mr3-harness.mjs";
import { release, nextGeneration, realloc, GEN_MAX_LIVE } from "../mr5-release-realloc/mr5-harness.mjs";

export { runFlow, expectPacked, withMutant, OP, ST, release, nextGeneration, realloc, GEN_MAX_LIVE };

// Ops 7 and 8 are new in MR6; the MR3 OP map stays frozen at ops 0-6.
export const OP6 = Object.freeze({ ...OP, release: 7, realloc: 8 });

function releaseArgs(o) {
  return [
    o.slotGeneration ?? 3, o.handleGeneration ?? 3, o.freed ?? 0,
    o.wipeClass ?? 0, o.wipeToken ?? 0,
    o.readbackClass ?? 0, o.readbackNonZero ?? 0,
  ];
}

function readArgs(o) {
  return [
    o.lenClass ?? 0, o.readLen ?? 32, o.expectedLen ?? 32,
    o.nonZeroClass ?? 0, o.nonZeroCount ?? 0,
  ];
}

export function stateAfter(op, state, packed) {
  return runFlow("arenaStateAfter", [op, state, packed]);
}

export function step(op, state, packed) {
  return runFlow("arenaStep", [op, state, packed]);
}

export function releaseStep(o = {}) {
  return runFlow("arenaReleaseStep", [o.stateToken ?? ST.active, ...releaseArgs(o)]);
}

export function reallocStep(o = {}) {
  return runFlow("arenaReallocReadStep", [
    o.stateToken ?? ST.active,
    o.releaseVerdict ?? 100, o.priorGeneration ?? 3, o.slotGeneration ?? 4,
    ...readArgs(o),
  ]);
}

export function cycle(o = {}) {
  return runFlow("arenaReleaseCycle", [...releaseArgs(o), ...readArgs(o)]);
}

export function cycleStep(o = {}) {
  return runFlow("arenaReleaseCycleStep", [o.stateToken ?? ST.active, ...releaseArgs(o), ...readArgs(o)]);
}

export function value(r, label) {
  expectPacked(r, r.value, label);
  return r.value;
}
