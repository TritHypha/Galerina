// @galerina/tri-pipe — the Tri-Pipe capstone: hardware() → tier → one governed engine.
//
// Composes @galerina/hardware-tier (the capability directive) + @galerina/ext-photonic-emulator (the
// photonic backend + net-win router) + @galerina/tower-citizen (the governed engine) into a single
// `createTriPipeEngine()` call. Digital stays the default; photonic only on a proven-win eligible
// kernel; fail-closed to binary. Worst case == binary == today.

export {
  type TriPipeOptions, type TriPipeEngine, type Tier,
  createTriPipeEngine,
} from "./tri-pipe.js";

// The Galerina Execution Router — one decision across all routing axes (tier × precision × offload).
export {
  type CapabilityInput, type ExecutionRouteInput, type ExecutionDecision, type Lane,
  ExecutionRouter, createExecutionRouter,
} from "./execution-router.js";
