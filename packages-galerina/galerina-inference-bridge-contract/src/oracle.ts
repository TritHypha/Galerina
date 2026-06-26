// oracle.ts — the determinism-oracle interface. A bridge's results are trusted
// only insofar as they match a reference oracle for the same BridgeOp. The
// reference IMPLEMENTATION (the BitNet-faithful TPLSimulator) lives in the Tower;
// this is just the neutral interface so native bridges can cross-check against it
// without importing Tower runtime internals.

import type { BridgeOp, BridgeResult } from "./bridge.js";

export interface TernaryOracle {
  /** Stable identifier for audit attribution (e.g. "tpl-simulator-v1"). */
  readonly oracleId: string;
  /** Compute the reference deterministic result for an op (the ground truth). */
  execute(op: BridgeOp): BridgeResult;
}

/** Compare a candidate bridge result against the oracle's result for the same op. */
export function oracleAgrees(candidate: BridgeResult, reference: BridgeResult): boolean {
  // Ternary determinism is bit-exact on the scaled integer accumulator.
  return (candidate.value | 0) === (reference.value | 0);
}
