// =============================================================================
// Phase 11C — Runtime Enforcement Report
//
// Immutable record of contract enforcement decisions during a flow execution.
// All mutations return a new record (functional update pattern).
// =============================================================================

import { type LimitViolation } from "./limitPolicy.js";

export interface ContractEnforcementRecord {
  readonly flowName: string;
  readonly deadlineMs?: number;
  readonly deadlineExceeded: boolean;
  readonly retries: ReadonlyMap<string, { readonly attemptsUsed: number; readonly maxAttempts: number }>;
  readonly limits: {
    readonly requestSizeBytes?: number;
    readonly maxRequestSizeBytes?: number;
    readonly batchSize?: number;
    readonly maxBatchSize?: number;
  };
  readonly violations: readonly string[];
}

/**
 * Creates a fresh enforcement record for the named flow.
 */
export function createEnforcementRecord(flowName: string): ContractEnforcementRecord {
  return {
    flowName,
    deadlineExceeded: false,
    retries: new Map(),
    limits: {},
    violations: [],
  };
}

/**
 * Returns a new record with updated retry tracking for the given effect.
 */
export function recordRetryAttempt(
  record: ContractEnforcementRecord,
  effectName: string,
  attempt: number,
  maxAttempts: number,
): ContractEnforcementRecord {
  const updated = new Map(record.retries);
  updated.set(effectName, { attemptsUsed: attempt, maxAttempts });

  return { ...record, retries: updated };
}

/**
 * Returns a new record with the limit violation appended.
 */
export function recordLimitViolation(
  record: ContractEnforcementRecord,
  violation: LimitViolation,
): ContractEnforcementRecord {
  const message = formatViolationMessage(violation);

  const updatedLimits = applyViolationToLimits(record.limits, violation);

  return {
    ...record,
    limits: updatedLimits,
    violations: [...record.violations, message],
  };
}

/**
 * Returns a YAML-style string representation of the enforcement record
 * suitable for inclusion in runtime reports.
 */
export function formatEnforcementRecord(record: ContractEnforcementRecord): string {
  const lines: string[] = [
    `flow: ${record.flowName}`,
    `deadline_exceeded: ${record.deadlineExceeded}`,
  ];

  if (record.deadlineMs !== undefined) {
    lines.push(`deadline_ms: ${record.deadlineMs}`);
  }

  if (record.retries.size > 0) {
    lines.push("retries:");
    for (const [effect, info] of record.retries) {
      lines.push(`  ${effect}: { attempts_used: ${info.attemptsUsed}, max_attempts: ${info.maxAttempts} }`);
    }
  }

  const limitsLines = formatLimits(record.limits);
  if (limitsLines.length > 0) {
    lines.push("limits:");
    lines.push(...limitsLines);
  }

  if (record.violations.length > 0) {
    lines.push("violations:");
    for (const v of record.violations) {
      lines.push(`  - ${v}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatViolationMessage(v: LimitViolation): string {
  switch (v.kind) {
    case "request_size":
      return `request_size: actual=${v.actual} exceeded limit=${v.limit}`;
    case "batch_size":
      return `batch_size: actual=${v.actual} exceeded limit=${v.limit}`;
    case "memory":
      return `memory: actual=${v.actual} exceeded limit=${v.limit}`;
    case "prompt_size":
      return `prompt_size: actual=${v.actual} exceeded limit=${v.limit}`;
  }
}

function applyViolationToLimits(
  limits: ContractEnforcementRecord["limits"],
  violation: LimitViolation,
): ContractEnforcementRecord["limits"] {
  switch (violation.kind) {
    case "request_size":
      return {
        ...limits,
        requestSizeBytes: violation.actual,
        maxRequestSizeBytes: violation.limit,
      };
    case "batch_size":
      return {
        ...limits,
        batchSize: violation.actual,
        maxBatchSize: violation.limit,
      };
    default:
      return limits;
  }
}

function formatLimits(limits: ContractEnforcementRecord["limits"]): string[] {
  const lines: string[] = [];
  if (limits.requestSizeBytes !== undefined) {
    lines.push(`  request_size_bytes: ${limits.requestSizeBytes}`);
  }
  if (limits.maxRequestSizeBytes !== undefined) {
    lines.push(`  max_request_size_bytes: ${limits.maxRequestSizeBytes}`);
  }
  if (limits.batchSize !== undefined) {
    lines.push(`  batch_size: ${limits.batchSize}`);
  }
  if (limits.maxBatchSize !== undefined) {
    lines.push(`  max_batch_size: ${limits.maxBatchSize}`);
  }
  return lines;
}
