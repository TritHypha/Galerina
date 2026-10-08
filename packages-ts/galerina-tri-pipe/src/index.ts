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

// Typed SLIDE/VOK admission *request* only. admitProposedRoute always refuses.
export {
  type SlideAdmissionRequestStatus, type SlideAdmissionRequestV1,
  type SlideAdmissionRequestRefusal, type SlideAdmissionRequestResult,
  type SlideAdmissionActRefusal,
  SLIDE_ADMISSION_REQUEST_SCHEMA,
  prepareSlideAdmissionRequest, admitProposedRoute,
} from "./slide-admission-request.js";

// The Galerina Execution Router — one decision across all routing axes (tier × precision × offload).
export {
  type CapabilityInput, type ExecutionRouteInput, type ExecutionDecision, type Lane,
  ExecutionRouter, createExecutionRouter,
} from "./execution-router.js";

// RD-0855 admission-time attempt and alternative proposals (proposal only; owner three-tier order).
export {
  type FallbackStep, type LogicCarrier, type PermittedReason, type WorkloadClass, type ParentOutcome,
  type TaskPolicyV1, type CandidateIdentityV1, type ParentAttemptV1, type ReasonEvidenceV1,
  type InitialAttemptRequestV1, type AlternativeRequestV1, type ReasonBindingV1, type ReasonVerifier,
  type AlternativeDeps, type BinaryCarrierConstraintsV1, type ProposedCandidateV1, type ParentLinkV1,
  type AttemptProposalV1, type AttemptRefusalCode, type AttemptRefusalV1, type AttemptResult,
  TASK_POLICY_SCHEMA, INITIAL_ATTEMPT_REQUEST_SCHEMA, ALTERNATIVE_REQUEST_SCHEMA, ATTEMPT_PROPOSAL_SCHEMA,
  MAX_ATTEMPTS_HARD_CAP, PERMITTED_REASONS,
  computeTaskPolicyDigest, initialCandidate, nextCandidate, proposeInitialAttempt, proposeAlternative,
} from "./alternative-proposal.js";
