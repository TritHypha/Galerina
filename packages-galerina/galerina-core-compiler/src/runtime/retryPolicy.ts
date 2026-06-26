// =============================================================================
// Phase 11C — Retry Policy
//
// Parses contract.retries blocks and provides withRetry execution wrapper.
// =============================================================================

import { type AstNode } from "../parser.js";

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly strategy: "none" | "linear" | "exponential_backoff";
  readonly delayMs: number;
}

export interface EffectRetryPolicy {
  /** Maps effect name to its retry configuration. */
  readonly policies: ReadonlyMap<string, RetryConfig>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 1,
  strategy: "none",
  delayMs: 0,
};

const DEFAULT_EFFECT_RETRY_POLICY: EffectRetryPolicy = {
  policies: new Map<string, RetryConfig>(),
};

/**
 * Parses a contract AST node and extracts per-effect retry policies.
 *
 * Phase 11C skeleton: looks for a `contractSetDecl` / identifier child
 * with value "retries", then reads nested declarations in the form:
 *   <effect> { attempts <N> strategy <strategy> }
 *
 * Returns an empty policy map when contractNode is undefined.
 */
export function parseRetryPolicy(
  contractNode: AstNode | undefined,
): EffectRetryPolicy {
  if (contractNode === undefined) {
    return DEFAULT_EFFECT_RETRY_POLICY;
  }

  const retriesSection = findContractSection(contractNode, "retries");
  if (retriesSection === undefined) {
    return DEFAULT_EFFECT_RETRY_POLICY;
  }

  const policies = new Map<string, RetryConfig>();

  for (const child of retriesSection.children ?? []) {
    if (child.kind !== "identifier" || child.value === undefined) {
      continue;
    }
    // Real ASTs encode each decl line as "decl:<text>"; synthetic nodes use the bare text. The parser also
    // tokenizes dotted effect names with spaces ("database . read"); collapse them back so the leading
    // "<effect> attempts …" pattern matches (dots only occur in dotted effect names in this grammar).
    const declText = (child.value.startsWith("decl:") ? child.value.slice("decl:".length) : child.value)
      .replace(/\s*\.\s*/g, ".");

    // Encoded as "<effect> attempts <N> strategy <strategy> [delay <N> ms]"
    const effectMatch = declText.match(
      /^(\w[\w.]*)\s+attempts\s+(\d+)(?:\s+strategy\s+(none|linear|exponential_backoff))?(?:\s+delay\s+(\d+(?:\.\d+)?)\s*(ms|seconds?))?/i,
    );

    if (effectMatch?.[1] === undefined || effectMatch[2] === undefined) {
      continue;
    }

    const effectName = effectMatch[1];
    const maxAttempts = parseInt(effectMatch[2], 10);
    const rawStrategy = (effectMatch[3] ?? "linear").toLowerCase();
    const strategy = isValidStrategy(rawStrategy) ? rawStrategy : "linear";
    const delayValue = effectMatch[4] !== undefined ? parseFloat(effectMatch[4]) : 0;
    const delayUnit = effectMatch[5] ?? "ms";
    const delayMs = delayUnit.startsWith("second") ? delayValue * 1000 : delayValue;

    policies.set(effectName, { maxAttempts, strategy, delayMs });
  }

  return { policies };
}

/**
 * Executes `fn`, retrying on failure according to the policy for `effectName`.
 * Uses setTimeout-wrapped Promises for non-blocking delays between attempts.
 * Throws the last error if all attempts are exhausted.
 */
export async function withRetry<T>(
  effectName: string,
  policy: EffectRetryPolicy,
  fn: () => Promise<T>,
): Promise<T> {
  const config: RetryConfig = policy.policies.get(effectName) ?? DEFAULT_RETRY_CONFIG;

  let lastError: unknown;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < config.maxAttempts && config.strategy !== "none" && config.delayMs > 0) {
        const delay = computeDelay(config, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeDelay(config: RetryConfig, attempt: number): number {
  if (config.strategy === "exponential_backoff") {
    return config.delayMs * Math.pow(2, attempt - 1);
  }
  // linear or none
  return config.delayMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function findContractSection(
  contractNode: AstNode,
  sectionName: string,
): AstNode | undefined {
  for (const child of contractNode.children ?? []) {
    if (
      (child.kind === "contractSetDecl" || child.kind === "identifier") &&
      // The parser emits sub-blocks as "<name>:block" (e.g. "retries:block"); older synthetic
      // call sites use the bare name. Match both so real corpus ASTs are not silently dropped.
      (child.value === sectionName || child.value === `${sectionName}:block`)
    ) {
      return child;
    }
  }
  return undefined;
}

function isValidStrategy(s: string): s is RetryConfig["strategy"] {
  return s === "none" || s === "linear" || s === "exponential_backoff";
}
