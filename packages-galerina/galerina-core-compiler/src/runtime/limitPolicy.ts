// =============================================================================
// Phase 11C — Limit Policy
//
// Parses contract.limits blocks and checks request/batch/memory/prompt limits.
// =============================================================================

import { type AstNode } from "../parser.js";

export interface RateLimit {
  readonly count: number;      // permitted events per window
  readonly periodMs: number;   // window length (ms)
  readonly scope: "actor" | "ip" | "global";
}

export interface LimitConfig {
  readonly maxRequestSizeBytes?: number;
  readonly maxBatchSize?: number;
  readonly maxMemoryBytes?: number;
  readonly maxPromptChars?: number;
  // BUG B (RD-0234c limit-enforcement-teeth): kinds that previously parsed to nothing (OWASP
  // API4:2023 / CWE-770) now parse into config + have check functions. `results`/`query_length`/
  // `amount` are stateless (fully checkable per call); `concurrent_tasks`/`rate` are stateful —
  // the enforcer holds only the threshold, a host counter store supplies the live count.
  readonly maxResults?: number;
  readonly maxQueryLengthChars?: number;
  readonly maxAmount?: number;
  readonly maxConcurrentTasks?: number;
  readonly rate?: RateLimit;
}

export type LimitViolation = {
  readonly kind:
    | "request_size" | "batch_size" | "memory" | "prompt_size"
    | "results" | "query_length" | "amount" | "concurrent_tasks" | "rate";
  readonly limit: number;
  readonly actual: number;
};

const DEFAULT_LIMIT_CONFIG: LimitConfig = {};

// The recognized `limits {}` declaration grammar — space-separated phrases. SINGLE SOURCE OF TRUTH: both the
// parser below AND the FUNGI-GOV-019 verifier (via isRecognizedLimitDecl) use these regexes, so they cannot
// drift. (RD-0121 found governance-verifier's snake_case KNOWN_LIMITS_FIELDS allowlist disagreed with this
// runtime grammar — it false-fired GOV-019 on the idiomatic `max request size N MB` form; CWE-1287.)
const LIMIT_REQUEST_SIZE_RE = /max\s+request\s+size\s+(\d+(?:\.\d+)?)\s*(bytes?|kb|mb|gb)/;
const LIMIT_BATCH_SIZE_RE   = /max\s+batch\s+size\s+(\d+)/;
const LIMIT_MEMORY_RE       = /max\s+memory\s+(\d+(?:\.\d+)?)\s*(bytes?|kb|mb|gb)/;
const LIMIT_PROMPT_RE       = /max\s+prompt\s+(\d+)\s*(?:chars?)?/;
// BUG B (RD-0234c): previously-inert kinds. Registering them in ALL_LIMIT_PATTERNS is what makes
// isRecognizedLimitDecl (and therefore the FUNGI-GOV-019 verifier) accept them — the prod-correct
// single-source approach (NOT a separate KNOWN_LIMITS_PHRASES set). None is a prefix of another or of
// the four above, so at most one matches per decl line; keep the parse branches in this same order.
const LIMIT_RESULTS_RE      = /max\s+results\s+(\d+)/;
const LIMIT_QUERY_LENGTH_RE = /max\s+query\s+length\s+(\d+)\s*(?:characters?|chars?)?/;
const LIMIT_AMOUNT_RE       = /max\s+amount\s+(\d+(?:\.\d+)?)/;
const LIMIT_CONCURRENT_RE   = /concurrent[_\s]tasks\s+(\d+)/;
const LIMIT_RATE_RE         = /rate\s+(\d+)\s+per\s+(seconds?|sec|minutes?|min|hours?|hr|days?)(?:\s+per\s+(actor|ip|global))?/;
const ALL_LIMIT_PATTERNS = [
  LIMIT_REQUEST_SIZE_RE, LIMIT_BATCH_SIZE_RE, LIMIT_MEMORY_RE, LIMIT_PROMPT_RE,
  LIMIT_RESULTS_RE, LIMIT_QUERY_LENGTH_RE, LIMIT_AMOUNT_RE, LIMIT_CONCURRENT_RE, LIMIT_RATE_RE,
] as const;

/**
 * True iff a `limits {}` declaration line matches the runtime-recognized grammar (case-insensitive). The
 * FUNGI-GOV-019 typo check delegates here so the verifier accepts EXACTLY what the runtime parses — no false
 * positives on the idiomatic space-separated form, real typos still flagged.
 */
export function isRecognizedLimitDecl(decl: string): boolean {
  const v = decl.toLowerCase();
  return ALL_LIMIT_PATTERNS.some((re) => re.test(v));
}

/**
 * Parses a contract AST node and extracts limit configuration.
 *
 * Phase 11C skeleton: looks for a `contractSetDecl` / identifier child
 * with value "limits", then reads nested identifier children for limit
 * declarations such as:
 *   max request size 5 MB
 *   max batch size 100
 *   max memory 256 MB
 *   max prompt 4096 chars
 *
 * Returns an empty config when contractNode is undefined.
 */
export function parseLimitConfig(
  contractNode: AstNode | undefined,
): LimitConfig {
  if (contractNode === undefined) {
    return DEFAULT_LIMIT_CONFIG;
  }

  const limitsSection = findContractSection(contractNode, "limits");
  if (limitsSection === undefined) {
    return DEFAULT_LIMIT_CONFIG;
  }

  let maxRequestSizeBytes: number | undefined;
  let maxBatchSize: number | undefined;
  let maxMemoryBytes: number | undefined;
  let maxPromptChars: number | undefined;
  let maxResults: number | undefined;
  let maxQueryLengthChars: number | undefined;
  let maxAmount: number | undefined;
  let maxConcurrentTasks: number | undefined;
  let rate: RateLimit | undefined;

  for (const child of limitsSection.children ?? []) {
    if (child.kind !== "identifier" || child.value === undefined) {
      continue;
    }
    // Real ASTs encode each decl line as "decl:<text>"; synthetic nodes use the bare text.
    const raw = child.value.startsWith("decl:") ? child.value.slice("decl:".length) : child.value;
    const v = raw.toLowerCase();

    // "max request size <N> <unit>"
    const reqMatch = v.match(LIMIT_REQUEST_SIZE_RE);
    if (reqMatch?.[1] !== undefined && reqMatch[2] !== undefined) {
      maxRequestSizeBytes = toBytes(parseFloat(reqMatch[1]), reqMatch[2]);
      continue;
    }

    // "max batch size <N>"
    const batchMatch = v.match(LIMIT_BATCH_SIZE_RE);
    if (batchMatch?.[1] !== undefined) {
      maxBatchSize = parseInt(batchMatch[1], 10);
      continue;
    }

    // "max memory <N> <unit>"
    const memMatch = v.match(LIMIT_MEMORY_RE);
    if (memMatch?.[1] !== undefined && memMatch[2] !== undefined) {
      maxMemoryBytes = toBytes(parseFloat(memMatch[1]), memMatch[2]);
      continue;
    }

    // "max prompt <N> chars"
    const promptMatch = v.match(LIMIT_PROMPT_RE);
    if (promptMatch?.[1] !== undefined) {
      maxPromptChars = parseInt(promptMatch[1], 10);
      continue;
    }

    // BUG B (RD-0234c): the previously-inert kinds (kept AFTER the four above so shipped kinds win).
    // "max results <N>"
    const resultsMatch = v.match(LIMIT_RESULTS_RE);
    if (resultsMatch?.[1] !== undefined) {
      maxResults = parseInt(resultsMatch[1], 10);
      continue;
    }

    // "max query length <N> [characters]"
    const queryLenMatch = v.match(LIMIT_QUERY_LENGTH_RE);
    if (queryLenMatch?.[1] !== undefined) {
      maxQueryLengthChars = parseInt(queryLenMatch[1], 10);
      continue;
    }

    // "max amount <N>"
    const amountMatch = v.match(LIMIT_AMOUNT_RE);
    if (amountMatch?.[1] !== undefined) {
      maxAmount = parseFloat(amountMatch[1]);
      continue;
    }

    // "concurrent_tasks <N>" / "concurrent tasks <N>"
    const concurrentMatch = v.match(LIMIT_CONCURRENT_RE);
    if (concurrentMatch?.[1] !== undefined) {
      maxConcurrentTasks = parseInt(concurrentMatch[1], 10);
      continue;
    }

    // "rate <N> per <period> [per <scope>]"
    const rateMatch = v.match(LIMIT_RATE_RE);
    if (rateMatch?.[1] !== undefined && rateMatch[2] !== undefined) {
      rate = {
        count: parseInt(rateMatch[1], 10),
        periodMs: toPeriodMs(rateMatch[2]),
        scope: normaliseRateScope(rateMatch[3]),
      };
      continue;
    }
  }

  return {
    ...(maxRequestSizeBytes !== undefined ? { maxRequestSizeBytes } : {}),
    ...(maxBatchSize !== undefined ? { maxBatchSize } : {}),
    ...(maxMemoryBytes !== undefined ? { maxMemoryBytes } : {}),
    ...(maxPromptChars !== undefined ? { maxPromptChars } : {}),
    ...(maxResults !== undefined ? { maxResults } : {}),
    ...(maxQueryLengthChars !== undefined ? { maxQueryLengthChars } : {}),
    ...(maxAmount !== undefined ? { maxAmount } : {}),
    ...(maxConcurrentTasks !== undefined ? { maxConcurrentTasks } : {}),
    ...(rate !== undefined ? { rate } : {}),
  };
}

/**
 * Checks whether `bytes` exceeds the configured request size limit.
 * Returns a LimitViolation when the limit is exceeded, or null otherwise.
 */
export function checkRequestSize(
  bytes: number,
  config: LimitConfig,
): LimitViolation | null {
  if (config.maxRequestSizeBytes === undefined) {
    return null;
  }
  if (bytes > config.maxRequestSizeBytes) {
    return {
      kind: "request_size",
      limit: config.maxRequestSizeBytes,
      actual: bytes,
    };
  }
  return null;
}

/**
 * Checks whether `count` exceeds the configured batch size limit.
 * Returns a LimitViolation when the limit is exceeded, or null otherwise.
 */
export function checkBatchSize(
  count: number,
  config: LimitConfig,
): LimitViolation | null {
  if (config.maxBatchSize === undefined) {
    return null;
  }
  if (count > config.maxBatchSize) {
    return {
      kind: "batch_size",
      limit: config.maxBatchSize,
      actual: count,
    };
  }
  return null;
}

// BUG B (RD-0234c): checks for the previously-inert limit kinds. Each mirrors checkRequestSize/
// checkBatchSize (undefined config => null; actual > limit => LimitViolation). Stateless kinds
// (results/query_length/amount) are fully enforceable from a single call; the stateful kinds
// (concurrent_tasks/rate) take the live count from a host counter store — the config holds only
// the threshold, so a single-invocation check cannot itself count across requests.

/** `max results N` — the returned collection length must not exceed N. */
export function checkResultCount(count: number, config: LimitConfig): LimitViolation | null {
  if (config.maxResults === undefined) return null;
  return count > config.maxResults ? { kind: "results", limit: config.maxResults, actual: count } : null;
}

/** `max query length N characters` — an input query string length must not exceed N. */
export function checkQueryLength(chars: number, config: LimitConfig): LimitViolation | null {
  if (config.maxQueryLengthChars === undefined) return null;
  return chars > config.maxQueryLengthChars ? { kind: "query_length", limit: config.maxQueryLengthChars, actual: chars } : null;
}

/** `max amount N` — a monetary/numeric amount must not exceed N. */
export function checkAmount(amount: number, config: LimitConfig): LimitViolation | null {
  if (config.maxAmount === undefined) return null;
  return amount > config.maxAmount ? { kind: "amount", limit: config.maxAmount, actual: amount } : null;
}

/** `concurrent_tasks N` — the host-supplied live in-flight count must not exceed N. */
export function checkConcurrentTasks(current: number, config: LimitConfig): LimitViolation | null {
  if (config.maxConcurrentTasks === undefined) return null;
  return current > config.maxConcurrentTasks ? { kind: "concurrent_tasks", limit: config.maxConcurrentTasks, actual: current } : null;
}

/** `rate N per <period> [per <scope>]` — the host-supplied events-in-window must not exceed N. */
export function checkRate(observedInWindow: number, config: LimitConfig): LimitViolation | null {
  if (config.rate === undefined) return null;
  return observedInWindow > config.rate.count ? { kind: "rate", limit: config.rate.count, actual: observedInWindow } : null;
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
      // The parser emits sub-blocks as "<name>:block" (e.g. "limits:block"); older synthetic
      // call sites use the bare name. Match both so real corpus ASTs are not silently dropped.
      (child.value === sectionName || child.value === `${sectionName}:block`)
    ) {
      return child;
    }
  }
  return undefined;
}

function toBytes(value: number, unit: string): number {
  switch (unit.toLowerCase().replace(/s$/, "")) {
    case "kb": return Math.round(value * 1024);
    case "mb": return Math.round(value * 1024 * 1024);
    case "gb": return Math.round(value * 1024 * 1024 * 1024);
    default:   return Math.round(value); // bytes
  }
}

// BUG B (RD-0234c): convert a `rate N per <period>` unit token to milliseconds. startsWith keeps it
// tolerant of the singular/plural/abbreviated forms the regex accepts (sec/second/seconds, min/minute…).
function toPeriodMs(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("sec")) return 1000;
  if (u.startsWith("min")) return 60_000;
  if (u.startsWith("h"))   return 3_600_000; // hour / hr / hours
  if (u.startsWith("day")) return 86_400_000;
  return 1000; // conservative default (per-second) — never widens a window
}

// BUG B (RD-0234c): normalise the optional `per <scope>` token; a `rate` with no explicit scope
// defaults to per-actor (the tightest common intent; a host store keys the counter by this scope).
function normaliseRateScope(raw: string | undefined): RateLimit["scope"] {
  switch ((raw ?? "").toLowerCase()) {
    case "ip":     return "ip";
    case "global": return "global";
    default:       return "actor";
  }
}
