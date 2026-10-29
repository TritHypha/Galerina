// MR7 harness: a malformed (110) or unlisted (111) reply on op 7 (release) or
// op 8 (re-alloc read) quarantines, because the zeroing cannot be confirmed.
// Ops 0-6 keep the MR3 table. Reuses the MR6 harness; synthetic integers only.
export {
  runFlow, expectPacked, withMutant, OP, ST, OP6,
  stateAfter, step, releaseStep, reallocStep, cycle, cycleStep, value,
} from "../mr6-release-steps/mr6-harness.mjs";

export const MALFORMED = 110;
export const UNLISTED = 111;

// Ops whose 110/111 must quarantine (MR7) and ops that keep MR3's benign
// 110/111. Op 5 (dispose) always goes to Disposed and is pinned separately.
export const RELEASE_OPS = Object.freeze([7, 8]);
export const KEEP_OPS = Object.freeze([0, 1, 2, 3, 4, 6]);