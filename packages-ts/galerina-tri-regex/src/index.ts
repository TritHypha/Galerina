// =============================================================================
// TriRegex — ternary streaming pattern matching, ReDoS-immune by construction.
// Public API. Provenance: dp-rd-0459 (defensive publication).
// Contact hello@trithypha.dev · Apache-2.0.
// =============================================================================
import { compileAst } from "./compile.ts";
import { parsePattern } from "./parser.ts";
import { TriMatcher } from "./engine.ts";
import type { Budget, CompileVeto, CostCertificate } from "./types.ts";
import { DEFAULT_BUDGET } from "./types.ts";

export const VERSION = "0.1.1";

export {
  MATCH, INDETERMINATE, SECURITY_VETO, DEFAULT_BUDGET,
} from "./types.ts";
export type {
  TriVerdict, Budget, CostCertificate, CompileVeto, EngineStats, MatchOutcome,
} from "./types.ts";
export type { TriStream } from "./engine.ts";
export { TriMatcher } from "./engine.ts";

export interface CompileOptions {
  budget?: Partial<Budget>;
  /**
   * Disable the early exit after a latched match (every character is still
   * scanned). v0.1 HONESTY: this reduces data-dependent control flow; it is
   * NOT a constant-time guarantee (JS/JIT gives none) and the active-set size
   * still varies with content. A dense fixed-shape scan is a declared v0.2.
   */
  uniformScan?: boolean;
}

export interface CompileOk {
  ok: true;
  certificate: CostCertificate;
  matcher: TriMatcher;
}

/** A typed, certificate-bearing pattern capability for downstream runtimes. */
export interface PatternCapability {
  readonly kind: "triregex-pattern";
  readonly engineVersion: string;
  readonly pattern: string;
  readonly certificate: CostCertificate;
  readonly matcher: TriMatcher;
}

export interface CompileCapabilityOk {
  ok: true;
  capability: PatternCapability;
}

export interface FindAllOptions {
  /** Maximum number of returned spans; the operation refuses rather than truncating. */
  maxMatches?: number;
  /** Maximum subject size measured in Unicode code points. */
  maxSubjectCodePoints?: number;
  /** Maximum certified work for the bounded search, inclusive. */
  maxCertifiedWorkUnits?: number;
}

export interface FindAllOk {
  ok: true;
  spans: readonly (readonly [number, number])[];
  workUnits: number;
}

export interface FindAllVeto {
  ok: false;
  verdict: -1;
  code: "TPRX-BUDGET";
  reason: string;
}

/**
 * Compile a pattern. NEVER throws on pattern content — an unsupported or
 * over-budget pattern returns a SECURITY_VETO refusal ({ok:false, verdict:-1})
 * so the caller's fail-closed path is a value check, not exception handling.
 */
export function compile(pattern: string, opts: CompileOptions = {}): CompileOk | CompileVeto {
  if (typeof pattern !== "string") {
    return {
      ok: false,
      verdict: -1,
      code: "TPRX-PARSE",
      reason: "pattern must be a string",
    };
  }
  const supplied = opts.budget ?? {};
  const budget: Budget = {
    maxInstructions: supplied.maxInstructions ?? DEFAULT_BUDGET.maxInstructions,
    maxPatternLength: supplied.maxPatternLength ?? DEFAULT_BUDGET.maxPatternLength,
    maxRepetition: supplied.maxRepetition ?? DEFAULT_BUDGET.maxRepetition,
  };
  for (const [name, value, minimum] of [
    ["maxInstructions", budget.maxInstructions, 1],
    ["maxPatternLength", budget.maxPatternLength, 0],
    ["maxRepetition", budget.maxRepetition, 0],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      return {
        ok: false,
        verdict: -1,
        code: "TPRX-BUDGET",
        reason: `budget.${name} must be a finite safe integer >= ${minimum}`,
      };
    }
  }
  const parsed = parsePattern(pattern, budget);
  if (!parsed.ok) return parsed;
  const compiled = compileAst(parsed.ast, budget, pattern.length);
  if ("ok" in compiled) return compiled;
  return {
    ok: true,
    certificate: compiled.certificate,
    matcher: new TriMatcher(compiled, opts.uniformScan === true),
  };
}

/**
 * Compile a pattern into an explicit capability whose certificate travels with
 * the matcher. Refusals remain values and never become a host Boolean.
 */
export function compileCapability(
  pattern: string,
  opts: CompileOptions = {},
): CompileCapabilityOk | CompileVeto {
  const result = compile(pattern, opts);
  if (!result.ok) return result;
  return {
    ok: true,
    capability: Object.freeze({
      kind: "triregex-pattern",
      engineVersion: VERSION,
      pattern,
      certificate: result.certificate,
      matcher: result.matcher,
    }),
  };
}

const DEFAULT_FIND_ALL_MAX_MATCHES = 128;
const DEFAULT_FIND_ALL_MAX_SUBJECT_CODE_POINTS = 4_096;
const DEFAULT_FIND_ALL_MAX_WORK_UNITS = 1_000_000;

function boundedOption(value: number | undefined, fallback: number, label: string): number | FindAllVeto {
  const chosen = value ?? fallback;
  if (!Number.isSafeInteger(chosen) || chosen < 1) {
    return {
      ok: false,
      verdict: -1,
      code: "TPRX-BUDGET",
      reason: `${label} must be a finite safe integer >= 1`,
    };
  }
  return chosen;
}

/**
 * Find non-overlapping matches under the capability's certified work bound.
 * The operation refuses instead of returning a truncated or partially trusted
 * result when the caller's match or work ceiling would be exceeded.
 */
export function findAll(
  capability: PatternCapability,
  subject: string,
  options: FindAllOptions = {},
): FindAllOk | FindAllVeto {
  if (typeof subject !== "string") {
    return { ok: false, verdict: -1, code: "TPRX-BUDGET", reason: "subject must be a string" };
  }
  const maxMatches = boundedOption(options.maxMatches, DEFAULT_FIND_ALL_MAX_MATCHES, "maxMatches");
  if (typeof maxMatches !== "number") return maxMatches;
  const maxSubject = boundedOption(options.maxSubjectCodePoints, DEFAULT_FIND_ALL_MAX_SUBJECT_CODE_POINTS, "maxSubjectCodePoints");
  if (typeof maxSubject !== "number") return maxSubject;
  const maxWork = boundedOption(options.maxCertifiedWorkUnits, DEFAULT_FIND_ALL_MAX_WORK_UNITS, "maxCertifiedWorkUnits");
  if (typeof maxWork !== "number") return maxWork;

  const codePoints = [...subject];
  if (codePoints.length > maxSubject) {
    return { ok: false, verdict: -1, code: "TPRX-BUDGET", reason: "subject exceeds maxSubjectCodePoints" };
  }
  const perSearchBound = BigInt(codePoints.length) * BigInt(capability.certificate.perCharWorkBound)
    + BigInt(capability.certificate.boundaryWorkBound);
  const worstCaseSearches = BigInt(maxMatches) + 1n;
  if (perSearchBound * worstCaseSearches > BigInt(maxWork)) {
    return { ok: false, verdict: -1, code: "TPRX-BUDGET", reason: "findAll certified work exceeds maxCertifiedWorkUnits" };
  }

  const spans: Array<readonly [number, number]> = [];
  let cursor = 0;
  let workUnits = 0;
  while (cursor < codePoints.length || (codePoints.length === 0 && cursor === 0)) {
    if (spans.length >= maxMatches) {
      return { ok: false, verdict: -1, code: "TPRX-BUDGET", reason: "findAll maxMatches would truncate results" };
    }
    const result = capability.matcher.test(codePoints.slice(cursor).join(""));
    workUnits += result.stats.steps;
    if (!Number.isSafeInteger(workUnits) || workUnits > maxWork) {
      return { ok: false, verdict: -1, code: "TPRX-BUDGET", reason: "findAll runtime work exceeded maxCertifiedWorkUnits" };
    }
    if (result.verdict !== 1) break;
    if (result.span === undefined) {
      return { ok: false, verdict: -1, code: "TPRX-BUDGET", reason: "matcher returned a match without a span" };
    }
    const [start, end] = result.span;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > codePoints.length - cursor) {
      return { ok: false, verdict: -1, code: "TPRX-BUDGET", reason: "matcher returned an invalid span" };
    }
    spans.push(Object.freeze([cursor + start, cursor + end]));
    cursor += Math.max(end, 1);
  }
  return { ok: true, spans: Object.freeze(spans), workUnits };
}
