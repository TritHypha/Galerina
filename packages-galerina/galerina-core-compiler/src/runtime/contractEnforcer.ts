// =============================================================================
// Phase 11C — Contract Enforcer
//
// Main orchestrator for runtime contract enforcement. This is what
// interpreter.ts will call once Phase 11C enforcement goes live.
// =============================================================================

import { type AstNode } from "../parser.js";
import { type RuntimeContext, createContext } from "./runtimeContext.js";
import { type TimeoutConfig, parseTimeoutConfig, checkDeadline } from "./timeoutPolicy.js";
import { type EffectRetryPolicy, parseRetryPolicy, withRetry } from "./retryPolicy.js";
import {
  type LimitConfig, parseLimitConfig, checkRequestSize, checkBatchSize,
  checkResultCount, checkQueryLength, checkAmount, checkConcurrentTasks, checkRate,
} from "./limitPolicy.js";
import {
  type ContractEnforcementRecord,
  createEnforcementRecord,
  recordRetryAttempt,
  recordLimitViolation,
} from "./runtimeReport.js";

export interface ContractEnforcer {
  readonly context: RuntimeContext;
  readonly enforcementRecord: ContractEnforcementRecord;

  /**
   * Checks whether the request byte size exceeds the configured limit.
   * Throws a RangeError with a descriptive message if the limit is exceeded.
   */
  checkRequestSize(bytes: number): void;

  /**
   * Checks whether the batch item count exceeds the configured limit.
   * Throws a RangeError with a descriptive message if the limit is exceeded.
   */
  checkBatchSize(count: number): void;

  /**
   * BUG B (RD-0234c): the previously-inert limit kinds. Each throws a RangeError ([FUNGI-LIMIT])
   * when the supplied value exceeds the configured limit, and is a no-op when that limit is not
   * declared. concurrent_tasks/rate take a host-supplied live count (the config holds the threshold).
   */
  checkResultCount(count: number): void;
  checkQueryLength(chars: number): void;
  checkAmount(amount: number): void;
  checkConcurrentTasks(current: number): void;
  checkRate(observedInWindow: number): void;

  /**
   * Checks whether the flow deadline has been exceeded.
   * Throws an Error if the deadline has passed and cancelOnDeadline is true.
   */
  checkDeadline(): void;

  /**
   * Wraps an async operation with retry logic according to the configured
   * policy for the named effect.
   */
  withRetry<T>(effectName: string, fn: () => Promise<T>): Promise<T>;

  /**
   * Records a retry attempt for the named effect (used for audit/reporting).
   * This mutates the enforcementRecord in place by replacing the internal ref.
   */
  recordRetry(effectName: string, attempt: number, max: number): void;
}

/**
 * Creates a ContractEnforcer for the named flow, parsing all policy
 * configuration from the optional contract AST node.
 */
export function createContractEnforcer(
  contractNode: AstNode | undefined,
  flowName: string,
  opts?: { traceId?: string; actor?: string; deadlineMs?: number },
): ContractEnforcer {
  const timeoutConfig: TimeoutConfig = parseTimeoutConfig(contractNode);
  const retryPolicy: EffectRetryPolicy = parseRetryPolicy(contractNode);
  const limitConfig: LimitConfig = parseLimitConfig(contractNode);

  // Deadline resolution priority:
  //   1. opts.deadlineMs (absolute ms, from caller like runtime.ts options)
  //   2. contract timeout deadlineMs (relative, converted to absolute)
  //   3. no deadline
  const externalDeadline = opts?.deadlineMs !== undefined;
  const resolvedDeadlineMs: number | undefined =
    opts?.deadlineMs !== undefined
      ? opts.deadlineMs
      : timeoutConfig.deadlineMs !== undefined
        ? Date.now() + timeoutConfig.deadlineMs
        : undefined;

  // When an external deadline is supplied (via opts) and there is no contract
  // node, we still want cancelOnDeadline to be true so checkDeadline() throws.
  const effectiveTimeoutConfig: TimeoutConfig = externalDeadline && !timeoutConfig.cancelOnDeadline
    ? { ...timeoutConfig, cancelOnDeadline: true }
    : timeoutConfig;

  // Build context — use deadline from contract if present
  const context = createContext(flowName, {
    ...(opts?.traceId !== undefined ? { traceId: opts.traceId } : {}),
    ...(opts?.actor !== undefined ? { actor: opts.actor } : {}),
    ...(resolvedDeadlineMs !== undefined ? { deadlineMs: resolvedDeadlineMs } : {}),
  });

  // Enforcement record is held in a mutable cell so recordRetry can update it
  // while the ContractEnforcer object reference stays stable.
  const cell: { record: ContractEnforcementRecord } = {
    record: createEnforcementRecord(flowName),
  };

  const enforcer: ContractEnforcer = {
    get context() {
      return context;
    },

    get enforcementRecord() {
      return cell.record;
    },

    checkRequestSize(bytes: number): void {
      const violation = checkRequestSize(bytes, limitConfig);
      if (violation !== null) {
        cell.record = recordLimitViolation(cell.record, violation);
        throw new RangeError(
          `[FUNGI-LIMIT] request size ${bytes} bytes exceeds contract limit ${violation.limit} bytes`,
        );
      }
    },

    checkBatchSize(count: number): void {
      const violation = checkBatchSize(count, limitConfig);
      if (violation !== null) {
        cell.record = recordLimitViolation(cell.record, violation);
        throw new RangeError(
          `[FUNGI-LIMIT] batch size ${count} exceeds contract limit ${violation.limit}`,
        );
      }
    },

    // BUG B (RD-0234c): enforcer methods for the previously-inert kinds. Same throw-on-violation
    // shape as checkRequestSize/checkBatchSize; the bare identifier resolves to the imported check
    // function (module scope), not this object property (mirrors the existing methods above).
    checkResultCount(count: number): void {
      const violation = checkResultCount(count, limitConfig);
      if (violation !== null) {
        cell.record = recordLimitViolation(cell.record, violation);
        throw new RangeError(`[FUNGI-LIMIT] result count ${count} exceeds contract limit ${violation.limit}`);
      }
    },

    checkQueryLength(chars: number): void {
      const violation = checkQueryLength(chars, limitConfig);
      if (violation !== null) {
        cell.record = recordLimitViolation(cell.record, violation);
        throw new RangeError(`[FUNGI-LIMIT] query length ${chars} exceeds contract limit ${violation.limit}`);
      }
    },

    checkAmount(amount: number): void {
      const violation = checkAmount(amount, limitConfig);
      if (violation !== null) {
        cell.record = recordLimitViolation(cell.record, violation);
        throw new RangeError(`[FUNGI-LIMIT] amount ${amount} exceeds contract limit ${violation.limit}`);
      }
    },

    checkConcurrentTasks(current: number): void {
      const violation = checkConcurrentTasks(current, limitConfig);
      if (violation !== null) {
        cell.record = recordLimitViolation(cell.record, violation);
        throw new RangeError(`[FUNGI-LIMIT] concurrent tasks ${current} exceeds contract limit ${violation.limit}`);
      }
    },

    checkRate(observedInWindow: number): void {
      const violation = checkRate(observedInWindow, limitConfig);
      if (violation !== null) {
        cell.record = recordLimitViolation(cell.record, violation);
        throw new RangeError(`[FUNGI-LIMIT] rate ${observedInWindow} exceeds contract limit ${violation.limit}`);
      }
    },

    checkDeadline(): void {
      const result = checkDeadline(context, effectiveTimeoutConfig);
      if (result === "exceeded" && effectiveTimeoutConfig.cancelOnDeadline) {
        throw new Error(
          `[FUNGI-TIMEOUT] flow "${flowName}" exceeded deadline`,
        );
      }
    },

    async withRetry<T>(effectName: string, fn: () => Promise<T>): Promise<T> {
      return withRetry(effectName, retryPolicy, fn);
    },

    recordRetry(effectName: string, attempt: number, max: number): void {
      cell.record = recordRetryAttempt(cell.record, effectName, attempt, max);
    },
  };

  return enforcer;
}
