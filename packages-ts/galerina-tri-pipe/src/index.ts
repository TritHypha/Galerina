// @galerina/tri-pipe — proposal, routing and composition (RD-0855 §4.3).
// createTriPipeEngine proposes a digest-bound route and never dispatches.
// ExecutionRouter composes hardware-tier × precision × net-win offload.

export {
  type TriPipeOptions, type TriPipeProposal, type TriPipeRefusal, type TriPipeResult,
  type RepresentationProfile, type ComputeTransferV1, type Tier,
  ADMITTED_REPRESENTATION_PROFILES, EXPERIMENTAL_REPRESENTATION_PROFILES,
  COMPUTE_TRANSFER_SCHEMA,
  createTriPipeEngine, dispatchTriPipeEngine,
} from "./tri-pipe.js";

// The Galerina Execution Router — one decision across all routing axes (tier × precision × offload).
export {
  type CapabilityInput, type ExecutionRouteInput, type ExecutionDecision, type Lane,
  ExecutionRouter, createExecutionRouter,
} from "./execution-router.js";
