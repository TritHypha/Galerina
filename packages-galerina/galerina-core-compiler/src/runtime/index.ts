// =============================================================================
// Phase 11C — Runtime Contract Enforcement
//
// Barrel export for the runtime/ module.
// =============================================================================

export {
  createContractEnforcer,
  type ContractEnforcer,
} from "./contractEnforcer.js";

export {
  createContext,
  isExpired,
  remainingMs,
  verifyRuntimeManifestHash,
  type RuntimeContext,
} from "./runtimeContext.js";

export {
  parseTimeoutConfig,
  checkDeadline,
  type TimeoutConfig,
} from "./timeoutPolicy.js";

export {
  parseRetryPolicy,
  withRetry,
  type RetryConfig,
  type EffectRetryPolicy,
} from "./retryPolicy.js";

export {
  parseLimitConfig,
  checkRequestSize,
  checkBatchSize,
  type LimitConfig,
  type LimitViolation,
} from "./limitPolicy.js";

export type { ContractEnforcementRecord } from "./runtimeReport.js";

export {
  createEnforcementRecord,
  recordRetryAttempt,
  recordLimitViolation,
  formatEnforcementRecord,
} from "./runtimeReport.js";

export {
  createCapabilityHost,
  type CapabilityHost,
  type CapabilityCall,
  type CapabilityResult,
  type CapabilityCheckResult,
  type CapabilityHostConfig,
} from "./capabilityHost.js";

export {
  createGovernedMemory,
  type GovernedMemory,
  type GovernedValueTag,
} from "./governedMemory.js";

// Stage B — Root Capability Provider (Phase 14)
export {
  createRootCapabilityProvider,
  COMPILER_MINIMUM_CAPABILITIES,
  type RootCapabilityProvider,
  type CompilerCapabilityHost,
  type UserRuntimeCapabilities,
  type CapabilityDomain,
  type AuditLogEntry,
} from "./rootCapabilityProvider.js";

// Phase 16A — Canonical Hashing
export {
  canonicalHash,
  stripNonDeterministic,
  hashSource,
  hashGIR,
  hashPassivePlan,
} from "./canonicalHash.js";
