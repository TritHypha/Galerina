# Galerina Logic TODO

```text
[x] Align older v0.2 KB/developer-guide examples with current README canonical kind/evidence/review shape — galerina-core-logic-v02.md and galerina-core-logic-tristate-developer-guide.md both carry accurate Update Status annotations pointing to canonical README; alignment complete (2026-05-26)
[x] Create /packages-galerina/galerina-core-logic
[x] Document package boundary
[x] Add package metadata
[x] Add initial typed exports
[x] Define Galerina language syntax for Tri
[x] Define initial Galerina validation rules
[x] Define Omni logic rules
[x] Implement TriState discriminated union: {kind:"true";value:true} | {kind:"false";value:false} | {kind:"unknown";reasons:UnknownReason[]} (2026-05-26)
[x] Define UnknownReason: {code: string, message: string, source?: string} (2026-05-26)
[x] Define TRI_STATE_TRUE / TRI_STATE_FALSE canonical singletons; triUnknown(reason) constructor (2026-05-26)
[x] Implement triUnknown(reason: UnknownReason): TriState (2026-05-26)
[x] Implement combineUnknownReasons(states: TriState[]): UnknownReason[] — deduplicates by code (2026-05-26)
[x] Implement triStateNot(a: TriState): TriState (2026-05-26)
[x] Implement triStateAnd(a, b): TriState — false short-circuits (2026-05-26)
[x] Implement triStateOr(a, b): TriState — true short-circuits (2026-05-26)
[x] Define SPORE-TRI-001 through SPORE-TRI-005 diagnostic codes (2026-05-26)
[x] Create tri/ dir: tri-state.ts, tri-unknown-reason.ts, tri-ops.ts, tri-diagnostics.ts, index.ts (2026-05-26)
[x] Implement Decision discriminated union: allow|deny|review|unknown — each with reason:string, evidence:DecisionEvidence[] (2026-05-26)
[x] Define DecisionEvidence: {code: string, message: string, source?: string} (2026-05-26)
[x] Implement constructors: allow(reason, evidence?), deny(reason, evidence?), review(reason, evidence?), unknownDecision(reason, unknownReasons, evidence?) (2026-05-26)
[x] Implement decisionToRuntimeBool(d: Decision): boolean — fails closed (deny→false, review→false, unknown→false) (2026-05-26)
[x] Define CapabilityRequest: {capability, effect?, actor, target?, evidence[]} (2026-05-26)
[x] Define PolicyContext: {environment, grantedCapabilities[], deniedCapabilities[], requiredPolicies[], evidence[]} (2026-05-26)
[x] Implement evaluateCapability(request, context): Decision — deny-first; review() when policies present with no evidence (2026-05-26)
[x] Implement combineDecisions(decisions: Decision[]): Decision — priority: deny > review > unknown > allow (2026-05-26)
[x] Define SPORE-DECISION-001 through SPORE-DECISION-005 diagnostic codes (2026-05-26)
[x] Create decision/ dir: decision-state.ts, decision-constructors.ts, decision-combine.ts, decision-evaluate.ts, decision-diagnostics.ts, index.ts (2026-05-26)
[x] Implement BoolBoundaryResult: {allowed: boolean, value: boolean, diagnostics: LogicDiagnostic[], reason: string} (2026-05-26)
[x] Define BoolBoundaryContext: {boundaryName, actor?, production?, source?} (2026-05-26)
[x] Implement validateBoolBoundary(value: TriState|Decision, context: BoolBoundaryContext): BoolBoundaryResult — unknown and review fail closed (2026-05-26)
[x] Define SPORE-BOOL-BOUNDARY-001 through SPORE-BOOL-BOUNDARY-005 diagnostic codes (2026-05-26)
[x] Create bool-boundary/ dir: bool-boundary.ts, bool-boundary-context.ts, bool-enforce.ts, bool-diagnostics.ts, index.ts (2026-05-26)
[x] Define OmniState as string literal union: "true"|"false"|"unknown"|"partial_true"|"partial_false"|"conflicted"|"deferred"|"inconsistent" (2026-05-26)
[x] Define OmniEvidence: {code: string, message: string, confidence: number, source?: string} (2026-05-26)
[x] Define OmniDecision: {state: OmniState, confidence: number, reasons: string[], evidence: OmniEvidence[], advisoryOnly: true} (2026-05-26)
[x] Implement omniToDecision(omni: OmniDecision): Decision — maps uncertain states → review(); "true" + confidence>=0.8 → allow; "false" → deny (2026-05-26)
[x] Define Omni logic safety boundaries: must not override runtime policy, capability checks, or compiler decisions (2026-05-26)
[x] Define binary safety rule: deterministic systems (capability gates, security policy) must not be controlled by OmniState directly (2026-05-26)
[x] Define Omni advisory vs deterministic model: advisoryOnly: true is enforced on OmniDecision (2026-05-26)
[x] Define SPORE-OMNI-001 through SPORE-OMNI-005 diagnostic codes (2026-05-26)
[x] Phase 1: advisory OmniState types and omniToDecision() — COMPLETE (2026-05-26)
[ ] Phase 2: runtime reasoning traces (deferred)
[ ] Phase 3: AI orchestration integration (deferred until Phase 3)
[x] Define initial Tri conversion rules
[x] Define initial truth table report format
[x] Move or cross-reference relevant galerina-core logic docs when package extraction is ready
[x] Add examples
[x] Add tests
```
