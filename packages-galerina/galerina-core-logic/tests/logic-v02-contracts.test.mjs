import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ---------------------------------------------------------------------------
// /tri sub-path — TriState v0.2 discriminated union
// ---------------------------------------------------------------------------
import {
  TRI_STATE_TRUE,
  TRI_STATE_FALSE,
  triUnknown,
  triUnknownFromReasons,
  isTriTrue,
  isTriFalse,
  isTriUnknown,
  triStateNot,
  triStateAnd,
  triStateOr,
  triStateNor,
  combineUnknownReasons,
  deduplicateUnknownReasons,
  SPORE_TRI_001_INVALID_TRISTATE,
  SPORE_TRI_002_EMPTY_UNKNOWN_REASONS,
  SPORE_TRI_003_INVALID_OPERAND,
  SPORE_TRI_004_UNKNOWN_LEAKED,
  SPORE_TRI_005_MALFORMED_UNKNOWN_REASON,
  triDiagnosticInvalidTriState,
  triDiagnosticEmptyUnknownReasons,
  triDiagnosticInvalidOperand,
  triDiagnosticUnknownLeaked,
  triDiagnosticMalformedUnknownReason,
} from "../dist/tri/index.js";

// ---------------------------------------------------------------------------
// /decision sub-path — Decision v0.2 4-state discriminated union
// ---------------------------------------------------------------------------
import {
  allow,
  deny,
  review,
  unknownDecision,
  isAllow,
  isDeny,
  isReview,
  isUnknownDecision,
  decisionToRuntimeBool,
  combineDecisions,
  evaluateCapability,
  SPORE_DECISION_001_INVALID_DECISION,
  SPORE_DECISION_002_EMPTY_REASON,
  SPORE_DECISION_003_EMPTY_UNKNOWN_REASONS,
  SPORE_DECISION_004_FAILED_CLOSED,
  SPORE_DECISION_005_EMPTY_COMBINE,
  decisionDiagnosticInvalid,
  decisionDiagnosticEmptyReason,
  decisionDiagnosticEmptyUnknownReasons,
  decisionDiagnosticFailedClosed,
  decisionDiagnosticEmptyCombine,
} from "../dist/decision/index.js";

// ---------------------------------------------------------------------------
// /bool-boundary sub-path — BoolBoundary enforcement
// ---------------------------------------------------------------------------
import {
  validateBoolBoundary,
  SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED,
  SPORE_BOOL_BOUNDARY_002_UNKNOWN_REASON,
  SPORE_BOOL_BOUNDARY_003_INVALID_INPUT,
  SPORE_BOOL_BOUNDARY_004_MISSING_BOUNDARY_NAME,
  SPORE_BOOL_BOUNDARY_005_RESULT_MISUSED,
  boolDiagnosticFailedClosed,
  boolDiagnosticUnknownReason,
  boolDiagnosticInvalidInput,
  boolDiagnosticMissingBoundaryName,
  boolDiagnosticResultMisused,
} from "../dist/bool-boundary/index.js";

// ---------------------------------------------------------------------------
// /omni sub-path — OmniState multi-valued advisory reasoning
// ---------------------------------------------------------------------------
import {
  OMNI_UNCERTAIN_STATES,
  OMNI_STATES,
  isOmniState,
  isOmniUncertain,
  OMNI_MIN_ALLOW_CONFIDENCE,
  omniToDecision,
  SPORE_OMNI_001_DIRECT_BOUNDARY_USE,
  SPORE_OMNI_002_ADVISORY_ONLY_VIOLATED,
  SPORE_OMNI_003_CONFIDENCE_OUT_OF_RANGE,
  SPORE_OMNI_004_MALFORMED_EVIDENCE,
  SPORE_OMNI_005_INVALID_STATE,
  omniDiagnosticDirectBoundaryUse,
  omniDiagnosticAdvisoryOnlyViolated,
  omniDiagnosticConfidenceOutOfRange,
  omniDiagnosticMalformedEvidence,
  omniDiagnosticInvalidState,
} from "../dist/omni/index.js";

// =============================================================================
// /tri — TriState v0.2
// =============================================================================

describe("@galerina/core-logic/tri — TriState v0.2", () => {
  it("TRI_STATE_TRUE and TRI_STATE_FALSE are canonical singletons", () => {
    assert.equal(TRI_STATE_TRUE.kind, "true");
    assert.equal(TRI_STATE_TRUE.value, true);
    assert.equal(TRI_STATE_FALSE.kind, "false");
    assert.equal(TRI_STATE_FALSE.value, false);
    // Singletons are referentially stable
    assert.equal(TRI_STATE_TRUE, TRI_STATE_TRUE);
    assert.equal(TRI_STATE_FALSE, TRI_STATE_FALSE);
  });

  it("triUnknown constructs an unknown TriState with structured reason", () => {
    const reason = { code: "POLICY_NOT_EVALUATED", message: "Policy was not evaluated." };
    const state = triUnknown(reason);

    assert.equal(state.kind, "unknown");
    assert.equal(state.reasons[0]?.code, "POLICY_NOT_EVALUATED");
    assert.equal(state.reasons.length, 1);
  });

  it("triUnknownFromReasons merges multiple reasons", () => {
    const reasons = [
      { code: "A", message: "a" },
      { code: "B", message: "b" },
    ];
    const state = triUnknownFromReasons(reasons);

    assert.equal(state.kind, "unknown");
    assert.equal(state.reasons.length, 2);
  });

  it("triUnknownFromReasons throws on empty reasons array", () => {
    assert.throws(() => triUnknownFromReasons([]), /reasons must be non-empty/);
  });

  it("type guards correctly distinguish TriState variants", () => {
    const unknown = triUnknown({ code: "X", message: "x" });

    assert.equal(isTriTrue(TRI_STATE_TRUE), true);
    assert.equal(isTriTrue(TRI_STATE_FALSE), false);
    assert.equal(isTriTrue(unknown), false);

    assert.equal(isTriFalse(TRI_STATE_FALSE), true);
    assert.equal(isTriFalse(TRI_STATE_TRUE), false);
    assert.equal(isTriFalse(unknown), false);

    assert.equal(isTriUnknown(unknown), true);
    assert.equal(isTriUnknown(TRI_STATE_TRUE), false);
  });

  it("triStateNot inverts true/false and preserves unknown", () => {
    const unknown = triUnknown({ code: "Y", message: "y" });

    assert.equal(triStateNot(TRI_STATE_TRUE), TRI_STATE_FALSE);
    assert.equal(triStateNot(TRI_STATE_FALSE), TRI_STATE_TRUE);

    const notUnknown = triStateNot(unknown);
    assert.equal(notUnknown.kind, "unknown");
    // Reasons are preserved
    assert.equal(notUnknown === unknown, true);
  });

  it("triStateAnd short-circuits on false; propagates unknown reasons", () => {
    const ua = triUnknown({ code: "UA", message: "ua" });
    const ub = triUnknown({ code: "UB", message: "ub" });

    // false AND anything = false
    assert.equal(triStateAnd(TRI_STATE_FALSE, TRI_STATE_TRUE), TRI_STATE_FALSE);
    assert.equal(triStateAnd(TRI_STATE_TRUE, TRI_STATE_FALSE), TRI_STATE_FALSE);
    assert.equal(triStateAnd(TRI_STATE_FALSE, ua).kind, "false");

    // true AND true = true
    assert.equal(triStateAnd(TRI_STATE_TRUE, TRI_STATE_TRUE), TRI_STATE_TRUE);

    // true AND unknown = unknown with combined reasons
    const result = triStateAnd(TRI_STATE_TRUE, ua);
    assert.equal(result.kind, "unknown");

    // unknown AND unknown = unknown with deduped reasons
    const both = triStateAnd(ua, ub);
    assert.equal(both.kind, "unknown");
    assert.equal(both.reasons.length, 2);
  });

  it("triStateOr short-circuits on true; propagates unknown reasons", () => {
    const ua = triUnknown({ code: "UA", message: "ua" });

    // true OR anything = true
    assert.equal(triStateOr(TRI_STATE_TRUE, TRI_STATE_FALSE), TRI_STATE_TRUE);
    assert.equal(triStateOr(TRI_STATE_TRUE, ua), TRI_STATE_TRUE);

    // false OR false = false
    assert.equal(triStateOr(TRI_STATE_FALSE, TRI_STATE_FALSE), TRI_STATE_FALSE);

    // false OR unknown = unknown
    const result = triStateOr(TRI_STATE_FALSE, ua);
    assert.equal(result.kind, "unknown");
  });

  it("triStateNor is equivalent to NOT(OR(a, b))", () => {
    assert.equal(triStateNor(TRI_STATE_FALSE, TRI_STATE_FALSE), TRI_STATE_TRUE);
    assert.equal(triStateNor(TRI_STATE_TRUE, TRI_STATE_FALSE), TRI_STATE_FALSE);
    assert.equal(triStateNor(TRI_STATE_TRUE, TRI_STATE_TRUE), TRI_STATE_FALSE);
  });

  it("deduplicateUnknownReasons removes duplicate codes", () => {
    const reasons = [
      { code: "A", message: "first" },
      { code: "A", message: "duplicate" },
      { code: "B", message: "different" },
    ];
    const deduped = deduplicateUnknownReasons(reasons);

    assert.equal(deduped.length, 2);
    assert.equal(deduped[0]?.code, "A");
    assert.equal(deduped[1]?.code, "B");
  });

  it("combineUnknownReasons collects reasons from unknown states only", () => {
    const ua = triUnknown({ code: "P1", message: "p1" });
    const ub = triUnknown({ code: "P2", message: "p2" });

    const combined = combineUnknownReasons([TRI_STATE_TRUE, ua, TRI_STATE_FALSE, ub]);
    assert.equal(combined.length, 2);
    assert.equal(combined[0]?.code, "P1");
    assert.equal(combined[1]?.code, "P2");
  });

  it("tri diagnostic constructors emit correct SPORE-TRI codes", () => {
    assert.equal(SPORE_TRI_001_INVALID_TRISTATE, "SPORE-TRI-001");
    assert.equal(SPORE_TRI_002_EMPTY_UNKNOWN_REASONS, "SPORE-TRI-002");
    assert.equal(SPORE_TRI_003_INVALID_OPERAND, "SPORE-TRI-003");
    assert.equal(SPORE_TRI_004_UNKNOWN_LEAKED, "SPORE-TRI-004");
    assert.equal(SPORE_TRI_005_MALFORMED_UNKNOWN_REASON, "SPORE-TRI-005");

    assert.equal(triDiagnosticInvalidTriState().code, SPORE_TRI_001_INVALID_TRISTATE);
    assert.equal(triDiagnosticEmptyUnknownReasons().code, SPORE_TRI_002_EMPTY_UNKNOWN_REASONS);
    assert.equal(triDiagnosticInvalidOperand().code, SPORE_TRI_003_INVALID_OPERAND);
    assert.equal(triDiagnosticUnknownLeaked().code, SPORE_TRI_004_UNKNOWN_LEAKED);
    assert.equal(triDiagnosticMalformedUnknownReason().code, SPORE_TRI_005_MALFORMED_UNKNOWN_REASON);

    // All diagnostics are errors
    const all = [
      triDiagnosticInvalidTriState(),
      triDiagnosticEmptyUnknownReasons(),
      triDiagnosticInvalidOperand(),
      triDiagnosticUnknownLeaked(),
      triDiagnosticMalformedUnknownReason(),
    ];
    assert.ok(all.every((d) => d.severity === "error"));
  });

  it("tri diagnostics accept optional path context", () => {
    const d = triDiagnosticInvalidTriState("payment.authorize");
    assert.equal(d.path, "payment.authorize");

    const noPath = triDiagnosticInvalidTriState();
    assert.equal(Object.hasOwn(noPath, "path"), false);
  });
});

// =============================================================================
// /decision — Decision v0.2
// =============================================================================

describe("@galerina/core-logic/decision — Decision v0.2", () => {
  it("canonical constructors produce correct discriminant shapes", () => {
    const a = allow("granted");
    const d = deny("forbidden");
    const r = review("needs human review");
    const u = unknownDecision("not enough data", [{ code: "MISSING", message: "missing" }]);

    assert.equal(a.kind, "allow");
    assert.equal(d.kind, "deny");
    assert.equal(r.kind, "review");
    assert.equal(u.kind, "unknown");
    assert.equal(u.unknownReasons.length, 1);
  });

  it("type guards correctly identify each decision kind", () => {
    const a = allow("ok");
    const d = deny("no");
    const r = review("maybe");
    const u = unknownDecision("?", [{ code: "X", message: "x" }]);

    assert.equal(isAllow(a), true);
    assert.equal(isAllow(d), false);
    assert.equal(isDeny(d), true);
    assert.equal(isDeny(a), false);
    assert.equal(isReview(r), true);
    assert.equal(isReview(a), false);
    assert.equal(isUnknownDecision(u), true);
    assert.equal(isUnknownDecision(r), false);
  });

  it("decisionToRuntimeBool returns true only for allow", () => {
    assert.equal(decisionToRuntimeBool(allow("ok")), true);
    assert.equal(decisionToRuntimeBool(deny("no")), false);
    assert.equal(decisionToRuntimeBool(review("maybe")), false);
    assert.equal(
      decisionToRuntimeBool(unknownDecision("?", [{ code: "X", message: "x" }])),
      false,
    );
  });

  it("combineDecisions follows deny > review > unknown > allow priority", () => {
    const a = allow("ok");
    const d = deny("blocked");
    const r = review("escalate");
    const u = unknownDecision("unsure", [{ code: "U", message: "u" }]);

    // deny wins over all
    assert.equal(combineDecisions([a, r, u, d]).kind, "deny");
    // review wins over unknown and allow
    assert.equal(combineDecisions([a, u, r]).kind, "review");
    // unknown wins over allow
    assert.equal(combineDecisions([a, u]).kind, "unknown");
    // all allow → allow
    assert.equal(combineDecisions([a, allow("also ok")]).kind, "allow");
  });

  it("combineDecisions merges evidence from all decisions", () => {
    const d1 = allow("cap-a", [{ code: "E1", message: "evidence 1" }]);
    const d2 = deny("policy", [{ code: "E2", message: "evidence 2" }]);

    const combined = combineDecisions([d1, d2]);
    assert.equal(combined.kind, "deny");
    assert.equal(combined.evidence.length, 2);
  });

  it("combineDecisions returns allow on empty input", () => {
    const result = combineDecisions([]);
    assert.equal(result.kind, "allow");
  });

  it("combineDecisions deduplicates unknown reasons across decisions", () => {
    const shared = { code: "SAME", message: "same reason" };
    const u1 = unknownDecision("first", [shared]);
    const u2 = unknownDecision("second", [shared, { code: "EXTRA", message: "extra" }]);

    const combined = combineDecisions([u1, u2]);
    assert.equal(combined.kind, "unknown");
    // Should have 2 unique codes (SAME + EXTRA)
    if (combined.kind === "unknown") {
      assert.equal(combined.unknownReasons.length, 2);
    }
  });

  it("evaluateCapability denies explicitly denied capabilities", () => {
    const result = evaluateCapability(
      {
        capability: "database.write",
        actor: "service-a",
        evidence: [],
      },
      {
        environment: "production",
        grantedCapabilities: ["database.read"],
        deniedCapabilities: ["database.write"],
        requiredPolicies: [],
        evidence: [],
      },
    );

    assert.equal(result.kind, "deny");
    assert.match(result.reason, /database.write/);
  });

  it("evaluateCapability allows explicitly granted capabilities", () => {
    const result = evaluateCapability(
      {
        capability: "database.read",
        actor: "service-b",
        evidence: [],
      },
      {
        environment: "production",
        grantedCapabilities: ["database.read"],
        deniedCapabilities: [],
        requiredPolicies: [],
        evidence: [],
      },
    );

    assert.equal(result.kind, "allow");
  });

  it("evaluateCapability returns review when policies are required but unmet", () => {
    const result = evaluateCapability(
      {
        capability: "payment.charge",
        actor: "service-c",
        evidence: [],
      },
      {
        environment: "production",
        grantedCapabilities: ["payment.charge"],
        deniedCapabilities: [],
        requiredPolicies: ["PCI-DSS-compliant"],
        evidence: [], // no policy evidence
      },
    );

    assert.equal(result.kind, "review");
  });

  it("evaluateCapability returns unknown for undeclared capabilities", () => {
    const result = evaluateCapability(
      {
        capability: "ai.generate",
        actor: "service-d",
        evidence: [],
      },
      {
        environment: "production",
        grantedCapabilities: ["database.read"],
        deniedCapabilities: [],
        requiredPolicies: [],
        evidence: [],
      },
    );

    assert.equal(result.kind, "unknown");
    if (result.kind === "unknown") {
      assert.ok(result.unknownReasons.some((r) => r.code === "CAPABILITY_NOT_DECLARED"));
    }
  });

  it("decision diagnostic constructors emit correct SPORE-DECISION codes", () => {
    assert.equal(SPORE_DECISION_001_INVALID_DECISION, "SPORE-DECISION-001");
    assert.equal(SPORE_DECISION_002_EMPTY_REASON, "SPORE-DECISION-002");
    assert.equal(SPORE_DECISION_003_EMPTY_UNKNOWN_REASONS, "SPORE-DECISION-003");
    assert.equal(SPORE_DECISION_004_FAILED_CLOSED, "SPORE-DECISION-004");
    assert.equal(SPORE_DECISION_005_EMPTY_COMBINE, "SPORE-DECISION-005");

    assert.equal(decisionDiagnosticInvalid().code, SPORE_DECISION_001_INVALID_DECISION);
    assert.equal(decisionDiagnosticEmptyReason().code, SPORE_DECISION_002_EMPTY_REASON);
    assert.equal(decisionDiagnosticEmptyUnknownReasons().code, SPORE_DECISION_003_EMPTY_UNKNOWN_REASONS);
    assert.equal(decisionDiagnosticFailedClosed().code, SPORE_DECISION_004_FAILED_CLOSED);
    assert.equal(decisionDiagnosticEmptyCombine().code, SPORE_DECISION_005_EMPTY_COMBINE);
  });
});

// =============================================================================
// /bool-boundary — BoolBoundary enforcement
// =============================================================================

describe("@galerina/core-logic/bool-boundary — BoolBoundary enforcement", () => {
  const ctx = { boundaryName: "payment.authorize", actor: "checkout-service" };

  it("TriState true passes the boundary with value=true", () => {
    const result = validateBoolBoundary(TRI_STATE_TRUE, ctx);

    assert.equal(result.allowed, true);
    assert.equal(result.value, true);
    assert.equal(result.diagnostics.length, 0);
  });

  it("TriState false passes the boundary with value=false (explicit deny is not an error)", () => {
    const result = validateBoolBoundary(TRI_STATE_FALSE, ctx);

    assert.equal(result.allowed, true);
    assert.equal(result.value, false);
    assert.equal(result.diagnostics.length, 0);
  });

  it("TriState unknown fails closed and emits diagnostics with reason codes", () => {
    const unknown = triUnknown({ code: "MISSING_CAPABILITY", message: "capability missing" });
    const result = validateBoolBoundary(unknown, ctx);

    assert.equal(result.allowed, false);
    assert.equal(result.value, false);
    assert.ok(result.diagnostics.length >= 1);
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED),
    );
    assert.ok(
      result.diagnostics.some((d) => d.code === SPORE_BOOL_BOUNDARY_002_UNKNOWN_REASON),
    );
  });

  it("Decision allow passes with value=true", () => {
    const result = validateBoolBoundary(allow("capability granted"), ctx);

    assert.equal(result.allowed, true);
    assert.equal(result.value, true);
    assert.equal(result.diagnostics.length, 0);
  });

  it("Decision deny passes with value=false (explicit — not a boundary error)", () => {
    const result = validateBoolBoundary(deny("explicitly denied"), ctx);

    assert.equal(result.allowed, true);
    assert.equal(result.value, false);
    assert.equal(result.diagnostics.length, 0);
  });

  it("Decision review fails closed", () => {
    const result = validateBoolBoundary(review("needs escalation"), ctx);

    assert.equal(result.allowed, false);
    assert.equal(result.value, false);
    assert.ok(result.diagnostics.some((d) => d.code === SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED));
  });

  it("Decision unknown fails closed with reason codes", () => {
    const unknownD = unknownDecision(
      "undecided",
      [{ code: "NO_POLICY", message: "no policy evaluated" }],
    );
    const result = validateBoolBoundary(unknownD, ctx);

    assert.equal(result.allowed, false);
    assert.equal(result.value, false);
    assert.ok(result.diagnostics.some((d) => d.code === SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED));
    assert.ok(result.diagnostics.some((d) => d.code === SPORE_BOOL_BOUNDARY_002_UNKNOWN_REASON));
  });

  it("bool-boundary diagnostic constants have correct SPORE-BOOL-BOUNDARY codes", () => {
    assert.equal(SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED, "SPORE-BOOL-BOUNDARY-001");
    assert.equal(SPORE_BOOL_BOUNDARY_002_UNKNOWN_REASON, "SPORE-BOOL-BOUNDARY-002");
    assert.equal(SPORE_BOOL_BOUNDARY_003_INVALID_INPUT, "SPORE-BOOL-BOUNDARY-003");
    assert.equal(SPORE_BOOL_BOUNDARY_004_MISSING_BOUNDARY_NAME, "SPORE-BOOL-BOUNDARY-004");
    assert.equal(SPORE_BOOL_BOUNDARY_005_RESULT_MISUSED, "SPORE-BOOL-BOUNDARY-005");

    assert.equal(boolDiagnosticFailedClosed("unknown", "test").code, SPORE_BOOL_BOUNDARY_001_FAILED_CLOSED);
    assert.equal(boolDiagnosticUnknownReason("X", "x").code, SPORE_BOOL_BOUNDARY_002_UNKNOWN_REASON);
    assert.equal(boolDiagnosticInvalidInput().code, SPORE_BOOL_BOUNDARY_003_INVALID_INPUT);
    assert.equal(boolDiagnosticMissingBoundaryName().code, SPORE_BOOL_BOUNDARY_004_MISSING_BOUNDARY_NAME);
    assert.equal(boolDiagnosticResultMisused().code, SPORE_BOOL_BOUNDARY_005_RESULT_MISUSED);
  });
});

// =============================================================================
// /omni — OmniState advisory reasoning
// =============================================================================

describe("@galerina/core-logic/omni — OmniState advisory reasoning", () => {
  it("OMNI_STATES includes all 8 states; OMNI_UNCERTAIN_STATES includes 6", () => {
    assert.equal(OMNI_STATES.length, 8);
    assert.equal(OMNI_UNCERTAIN_STATES.size, 6);

    assert.ok(OMNI_STATES.includes("true"));
    assert.ok(OMNI_STATES.includes("false"));
    assert.ok(OMNI_STATES.includes("partial_true"));
    assert.ok(OMNI_STATES.includes("conflicted"));
  });

  it("isOmniState validates membership", () => {
    assert.equal(isOmniState("true"), true);
    assert.equal(isOmniState("partial_false"), true);
    assert.equal(isOmniState("conflicted"), true);
    assert.equal(isOmniState("yes"), false);
    assert.equal(isOmniState(1), false);
    assert.equal(isOmniState(null), false);
  });

  it("isOmniUncertain returns true for all uncertain states", () => {
    const uncertainStates = ["unknown", "partial_true", "partial_false", "conflicted", "deferred", "inconsistent"];
    for (const s of uncertainStates) {
      assert.equal(isOmniUncertain(s), true, `${s} should be uncertain`);
    }
    assert.equal(isOmniUncertain("true"), false);
    assert.equal(isOmniUncertain("false"), false);
  });

  it("omniToDecision maps false → deny regardless of confidence", () => {
    const result = omniToDecision({
      state: "false",
      confidence: 0.99,
      reasons: ["negative signal"],
      evidence: [],
      advisoryOnly: true,
    });

    assert.equal(result.kind, "deny");
  });

  it("omniToDecision maps true + high confidence → allow", () => {
    const result = omniToDecision({
      state: "true",
      confidence: 0.9,
      reasons: ["strong positive signal"],
      evidence: [{ code: "MODEL_SCORE", message: "score 0.9", confidence: 0.9 }],
      advisoryOnly: true,
    });

    assert.equal(result.kind, "allow");
    assert.equal(result.evidence.length, 1);
  });

  it("omniToDecision maps true + low confidence → review (not allow)", () => {
    const result = omniToDecision({
      state: "true",
      confidence: 0.5,
      reasons: ["weak signal"],
      evidence: [],
      advisoryOnly: true,
    });

    assert.equal(result.kind, "review");
    assert.match(result.reason, /confidence/);
    assert.match(result.reason, /threshold/);
  });

  it("OMNI_MIN_ALLOW_CONFIDENCE is 0.8", () => {
    assert.equal(OMNI_MIN_ALLOW_CONFIDENCE, 0.8);
  });

  it("all uncertain OmniStates map to review — never allow, never unknown", () => {
    const uncertainStates = ["unknown", "partial_true", "partial_false", "conflicted", "deferred", "inconsistent"];

    for (const state of uncertainStates) {
      const result = omniToDecision({
        state,
        confidence: 0.95,
        reasons: ["signal"],
        evidence: [],
        advisoryOnly: true,
      });

      assert.equal(result.kind, "review", `${state} should produce review`);
    }
  });

  it("omniToDecision carries evidence through to the Decision", () => {
    const result = omniToDecision({
      state: "true",
      confidence: 0.95,
      reasons: ["approved"],
      evidence: [
        { code: "SCAN_PASSED", message: "security scan passed", confidence: 0.95, source: "scanner-v2" },
      ],
      advisoryOnly: true,
    });

    assert.equal(result.evidence[0]?.code, "SCAN_PASSED");
    assert.equal(result.evidence[0]?.source, "scanner-v2");
  });

  it("omni diagnostic constants have correct SPORE-OMNI codes", () => {
    assert.equal(SPORE_OMNI_001_DIRECT_BOUNDARY_USE, "SPORE-OMNI-001");
    assert.equal(SPORE_OMNI_002_ADVISORY_ONLY_VIOLATED, "SPORE-OMNI-002");
    assert.equal(SPORE_OMNI_003_CONFIDENCE_OUT_OF_RANGE, "SPORE-OMNI-003");
    assert.equal(SPORE_OMNI_004_MALFORMED_EVIDENCE, "SPORE-OMNI-004");
    assert.equal(SPORE_OMNI_005_INVALID_STATE, "SPORE-OMNI-005");

    assert.equal(omniDiagnosticDirectBoundaryUse().code, SPORE_OMNI_001_DIRECT_BOUNDARY_USE);
    assert.equal(omniDiagnosticAdvisoryOnlyViolated().code, SPORE_OMNI_002_ADVISORY_ONLY_VIOLATED);
    assert.equal(omniDiagnosticConfidenceOutOfRange(1.5).code, SPORE_OMNI_003_CONFIDENCE_OUT_OF_RANGE);
    assert.equal(omniDiagnosticMalformedEvidence().code, SPORE_OMNI_004_MALFORMED_EVIDENCE);
    assert.equal(omniDiagnosticInvalidState("bad").code, SPORE_OMNI_005_INVALID_STATE);
  });
});
