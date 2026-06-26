// =============================================================================
// Phase 11C — Timeout Policy
//
// Parses contract.timeouts blocks and checks deadlines at runtime.
// =============================================================================

import { type AstNode } from "../parser.js";
import { type RuntimeContext, isExpired } from "./runtimeContext.js";

export interface TimeoutConfig {
  /** Maximum total flow duration in milliseconds. */
  readonly deadlineMs?: number;
  /** Per-effect timeout overrides: effect name → timeout in ms. */
  readonly perOperationMs?: Map<string, number>;
  /** When true, the enforcer throws immediately on deadline exceeded. */
  readonly cancelOnDeadline: boolean;
}

// Default timeout configuration when no contract node is present.
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  cancelOnDeadline: false,
};

/**
 * Parses a contract AST node and extracts timeout configuration.
 *
 * Phase 11C skeleton: walks `contractDecl` children looking for a
 * `contractSetDecl` whose value is "timeouts", then reads `identifier`
 * children for "deadline" and per-operation timeout declarations.
 *
 * Returns sensible defaults when contractNode is undefined or no timeout
 * declarations are found.
 */
export function parseTimeoutConfig(
  contractNode: AstNode | undefined,
): TimeoutConfig {
  if (contractNode === undefined) {
    return DEFAULT_TIMEOUT_CONFIG;
  }

  // Find the timeouts section among contract children
  const timeoutsSection = findContractSection(contractNode, "timeouts");
  if (timeoutsSection === undefined) {
    return DEFAULT_TIMEOUT_CONFIG;
  }

  let deadlineMs: number | undefined;
  const perOperationMs = new Map<string, number>();

  for (const child of timeoutsSection.children ?? []) {
    if (child.kind === "identifier" && child.value !== undefined) {
      // Real ASTs encode each decl line as "decl:<text>"; synthetic nodes use the bare text.
      const v = child.value.startsWith("decl:") ? child.value.slice("decl:".length) : child.value;

      // Match "deadline <N> seconds" or "deadline <N> ms" patterns
      if (v.startsWith("deadline")) {
        const parsed = parseTimeValue(v);
        if (parsed !== undefined) {
          deadlineMs = parsed;
        }
        continue;
      }

      // Match "<effect> { timeout <N> <unit> }" pattern encoded as
      // "<effect>.timeout <N> <unit>" by the parser
      const opMatch = v.match(/^(\w[\w.]*)\s+timeout\s+(\d+(?:\.\d+)?)\s*(ms|seconds?|minutes?)$/i);
      if (opMatch?.[1] !== undefined && opMatch[2] !== undefined && opMatch[3] !== undefined) {
        const ms = toMs(parseFloat(opMatch[2]), opMatch[3]);
        if (ms !== undefined) {
          perOperationMs.set(opMatch[1], ms);
        }
      }
    }
  }

  return {
    cancelOnDeadline: true,
    ...(deadlineMs !== undefined ? { deadlineMs } : {}),
    ...(perOperationMs.size > 0 ? { perOperationMs } : {}),
  };
}

/**
 * Checks whether the context has exceeded the configured deadline.
 */
export function checkDeadline(
  ctx: RuntimeContext,
  config: TimeoutConfig,
): "ok" | "exceeded" {
  if (config.deadlineMs === undefined && ctx.deadlineMs === undefined) {
    return "ok";
  }

  return isExpired(ctx) ? "exceeded" : "ok";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findContractSection(
  contractNode: AstNode,
  sectionName: string,
): AstNode | undefined {
  for (const child of contractNode.children ?? []) {
    if (
      (child.kind === "contractSetDecl" || child.kind === "identifier") &&
      // The parser emits sub-blocks as "<name>:block" (e.g. "timeouts:block"); older synthetic
      // call sites use the bare name. Match both so real corpus ASTs are not silently dropped.
      (child.value === sectionName || child.value === `${sectionName}:block`)
    ) {
      return child;
    }
  }
  return undefined;
}

/** Parses "deadline 5 seconds" → ms number. */
function parseTimeValue(text: string): number | undefined {
  const m = text.match(/\d+(?:\.\d+)?\s*(ms|seconds?|minutes?)/i);
  if (m === null || m[0] === undefined || m[1] === undefined) {
    return undefined;
  }
  const num = parseFloat(m[0]);
  return toMs(num, m[1]);
}

function toMs(value: number, unit: string): number | undefined {
  const u = unit.toLowerCase();
  if (u === "ms") return value;
  if (u.startsWith("second")) return value * 1000;
  if (u.startsWith("minute")) return value * 60_000;
  return undefined;
}
