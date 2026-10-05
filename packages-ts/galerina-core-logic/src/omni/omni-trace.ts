// =============================================================================
// Omni Phase 2 - runtime reasoning traces
//
// traceOmniDecision() is the validated runtime entry for an OmniDecision that
// arrives from an advisory source (model, heuristic, external signal). It
// returns the canonical Decision together with an OmniReasoningTrace: an
// audit record of how that Decision was reached, kept separate from
// deterministic state as omni-state.ts requires.
//
// Zero-trust defaults (Grok Bot 2026-10-05, standing permission; owner may revisit):
//   - The input is untrusted. Any malformed field (state, advisoryOnly,
//     confidence, evidence, reasons) fails validation and yields review(),
//     never allow. omniToDecision() alone does not validate, so a "true" state
//     with confidence 5 would otherwise allow.
//   - At most MAX_OMNI_TRACE_EVIDENCE evidence items; more is malformed.
//   - The trace keeps codes, confidences and sources only. Free text
//     (evidence messages, reasons, rejected values) is withheld because it may
//     carry prompts or secrets. The returned Decision still carries the
//     omniToDecision() reason text for callers that need it.
//   - The trace is advisory (advisoryOnly: true) and frozen. It never grants
//     anything; only the Decision may reach a boolean boundary.
// =============================================================================

import type { Decision } from "../decision/decision-state.js";
import { review } from "../decision/decision-constructors.js";
import type { LogicDiagnostic } from "../index.js";
import {
  omniDiagnosticAdvisoryOnlyViolated,
  omniDiagnosticConfidenceOutOfRange,
  omniDiagnosticInvalidState,
  omniDiagnosticMalformedEvidence,
} from "./omni-diagnostics.js";
import { isOmniState, isOmniUncertain, type OmniDecision, type OmniEvidence, type OmniState } from "./omni-state.js";
import { OMNI_MIN_ALLOW_CONFIDENCE, omniToDecision } from "./omni-to-decision.js";

export const OMNI_TRACE_SCHEMA = "galerina.core-logic.omni-trace.v1";
export const MAX_OMNI_TRACE_EVIDENCE = 64;

/** Which mapping rule produced the Decision. */
export type OmniTraceRule =
  | "review-invalid-input"
  | "deny-false"
  | "allow-confident-true"
  | "review-low-confidence-true"
  | "review-uncertain";

export type OmniTraceStepKind = "validate" | "evidence" | "classify" | "convert";

export interface OmniTraceStep {
  readonly index: number;
  readonly kind: OmniTraceStepKind;
  /** Diagnostic code, evidence code, OmniState, or rule - never free text. */
  readonly code: string;
  readonly confidence?: number;
  readonly source?: string;
}

export interface OmniTraceEvidence {
  readonly code: string;
  readonly confidence: number;
  readonly source?: string;
}

export interface OmniReasoningTrace {
  readonly schema: typeof OMNI_TRACE_SCHEMA;
  readonly advisoryOnly: true;
  readonly valid: boolean;
  /** Present only when the input validated. */
  readonly state?: OmniState;
  readonly confidence?: number;
  readonly uncertain?: boolean;
  readonly threshold: number;
  readonly evidence: readonly OmniTraceEvidence[];
  readonly diagnostics: readonly LogicDiagnostic[];
  readonly rule: OmniTraceRule;
  readonly decisionKind: Decision["kind"];
  readonly steps: readonly OmniTraceStep[];
}

export interface OmniTraceResult {
  readonly decision: Decision;
  readonly trace: OmniReasoningTrace;
}

const WITHHELD = "(value withheld)";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isEvidence(value: unknown): value is OmniEvidence {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.message === "string" &&
    isUnitInterval(value.confidence) &&
    (value.source === undefined || typeof value.source === "string")
  );
}

/** Validate an untrusted OmniDecision. Returns no diagnostics when it is well formed. */
export function validateOmniDecision(input: unknown): readonly LogicDiagnostic[] {
  if (!isRecord(input)) return [omniDiagnosticInvalidState(WITHHELD)];
  const diagnostics: LogicDiagnostic[] = [];
  if (!isOmniState(input.state)) diagnostics.push(omniDiagnosticInvalidState(WITHHELD, "state"));
  if (input.advisoryOnly !== true) diagnostics.push(omniDiagnosticAdvisoryOnlyViolated("advisoryOnly"));
  if (!isUnitInterval(input.confidence)) {
    diagnostics.push(omniDiagnosticConfidenceOutOfRange(typeof input.confidence === "number" ? input.confidence : Number.NaN, "confidence"));
  }
  if (!Array.isArray(input.reasons) || !input.reasons.every((reason) => typeof reason === "string")) {
    diagnostics.push(omniDiagnosticMalformedEvidence("reasons"));
  }
  if (!Array.isArray(input.evidence) || input.evidence.length > MAX_OMNI_TRACE_EVIDENCE) {
    diagnostics.push(omniDiagnosticMalformedEvidence("evidence"));
  } else {
    input.evidence.forEach((item, index) => {
      if (!isEvidence(item)) diagnostics.push(omniDiagnosticMalformedEvidence(`evidence.${index}`));
    });
  }
  return diagnostics;
}

function ruleFor(omni: OmniDecision): OmniTraceRule {
  if (omni.state === "false") return "deny-false";
  if (omni.state === "true") {
    return omni.confidence >= OMNI_MIN_ALLOW_CONFIDENCE ? "allow-confident-true" : "review-low-confidence-true";
  }
  return "review-uncertain";
}

const EXPECTED_KIND: Readonly<Record<OmniTraceRule, Decision["kind"]>> = Object.freeze({
  "review-invalid-input": "review",
  "deny-false": "deny",
  "allow-confident-true": "allow",
  "review-low-confidence-true": "review",
  "review-uncertain": "review",
});

function step(steps: OmniTraceStep[], kind: OmniTraceStepKind, code: string, extra: { confidence?: number; source?: string } = {}): void {
  steps.push(Object.freeze({
    index: steps.length,
    kind,
    code,
    ...(extra.confidence === undefined ? {} : { confidence: extra.confidence }),
    ...(extra.source === undefined ? {} : { source: extra.source }),
  }));
}

/**
 * Validate an untrusted OmniDecision, convert it to a Decision and record how.
 * Invalid input always yields review(). See the module note for the defaults.
 */
export function traceOmniDecision(input: unknown): OmniTraceResult {
  const steps: OmniTraceStep[] = [];
  const diagnostics = Object.freeze(validateOmniDecision(input).map((d) => Object.freeze({ ...d })));

  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) step(steps, "validate", diagnostic.code);
    step(steps, "convert", "review-invalid-input");
    const decision = review("OmniDecision failed validation. Escalating to review.");
    return Object.freeze({
      decision,
      trace: Object.freeze({
        schema: OMNI_TRACE_SCHEMA,
        advisoryOnly: true as const,
        valid: false,
        threshold: OMNI_MIN_ALLOW_CONFIDENCE,
        evidence: Object.freeze([]),
        diagnostics,
        rule: "review-invalid-input" as const,
        decisionKind: decision.kind,
        steps: Object.freeze(steps),
      }),
    });
  }

  const omni = input as OmniDecision;
  step(steps, "validate", "ok");
  const evidence = Object.freeze(omni.evidence.map((item) => {
    step(steps, "evidence", item.code, { confidence: item.confidence, ...(item.source === undefined ? {} : { source: item.source }) });
    return Object.freeze({ code: item.code, confidence: item.confidence, ...(item.source === undefined ? {} : { source: item.source }) });
  }));
  const uncertain = isOmniUncertain(omni.state);
  step(steps, "classify", omni.state);

  let rule = ruleFor(omni);
  let decision = omniToDecision(omni);
  if (decision.kind !== EXPECTED_KIND[rule]) {
    // Defensive: the mapping and omniToDecision() disagree. Fail closed.
    rule = "review-invalid-input";
    decision = review("OmniDecision conversion was inconsistent. Escalating to review.");
  }
  step(steps, "convert", rule);

  return Object.freeze({
    decision,
    trace: Object.freeze({
      schema: OMNI_TRACE_SCHEMA,
      advisoryOnly: true as const,
      valid: true,
      state: omni.state,
      confidence: omni.confidence,
      uncertain,
      threshold: OMNI_MIN_ALLOW_CONFIDENCE,
      evidence,
      diagnostics,
      rule,
      decisionKind: decision.kind,
      steps: Object.freeze(steps),
    }),
  });
}
