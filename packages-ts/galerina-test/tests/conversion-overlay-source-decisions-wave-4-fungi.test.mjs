import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  checkEffects,
  emitGIR,
  executeFlow,
  parseProgram,
} from "../../galerina-core-compiler/dist/index.js";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const PACKAGE_ROOT = join(ROOT, "packages-ts", "galerina-test");
const OVERLAY_ROOT = join(PACKAGE_ROOT, "src", "self-hosted", "conversion-overlays");
const PACKAGE = join(PACKAGE_ROOT, "package.json");

const int = (value) => ({ __tag: "int", value });
const bool = (value) => ({ __tag: "bool", value });
const string = (value) => ({ __tag: "string", value });
const verdict = (value) => ({ __tag: "verdict", value });
const args = (entries) => new Map(entries);
const SHADOW_RESERVED_IDENTIFIERS = new Set([
  "version", "pure", "secure", "flow", "FLOW", "contract", "intent", "record",
  "return", "if", "match", "check", "deny", "ambig", "mut", "let",
  "Bool", "Int", "String", "Verdict", "Result", "Option", "Array",
  "true", "false", "Ok", "Err", "Some", "None", "Allow", "Deny", "Unknown",
]);

const CANDIDATES = Object.freeze([
  ["query-option-kind.fungi", "queryOptionKindCore", "galerina-data-query/src/index.ts", "isSome", args([["recordAdmitted", bool(true)], ["kind", string("some")]]), bool(true)],
  ["egress-loopback-decision.fungi", "egressLoopbackDecisionCore", "galerina-core-config/src/posture.ts", "resolveEgressTls", args([["isProd", bool(false)], ["isDev", bool(true)], ["explicitLocalhost", bool(false)]]), bool(true)],
  ["allowed-host-input-decision.fungi", "allowedHostInputDecisionCore", "galerina-core-config/src/posture.ts", "parseAllowedHosts", args([["rawPresent", bool(true)], ["tokenCount", int(2)], ["uniqueCount", int(1)]]), bool(true)],
  ["risk-penalty-mask.fungi", "riskPenaltyMaskCore", "galerina-core-economics/src/index.ts", "calculateRiskCost", args([["multiCloud", bool(true)], ["ungovernedNpu", bool(true)], ["baseLoss", int(5)]]), int(8)],
  ["ai-token-cost-branch.fungi", "aiTokenCostBranchCore", "galerina-core-economics/src/index.ts", "estimateCost", args([["tokensPresent", bool(false)], ["baseCost", int(5)], ["tokenCost", int(9)]]), int(5)],
  ["http-method-fallback.fungi", "httpMethodFallbackCore", "galerina-framework-api-server/src/index.ts", "normaliseMethod", args([["rawPresent", bool(false)], ["alreadyUppercase", bool(false)], ["rawMethod", string("POST")]]), string("GET")],
  ["digest-normalization-action.fungi", "digestNormalizationActionCore", "galerina-framework-api-server/src/index.ts", "normaliseDigest", args([["hadSeparators", bool(true)], ["hadUppercase", bool(true)]]), string("strip_and_lower")],
  ["tls-socket-shape.fungi", "tlsSocketShapeCore", "galerina-framework-api-server/src/index.ts", "isTlsSocket", args([["objectLike", bool(true)], ["nonNull", bool(true)], ["propertyReadSucceeded", bool(true)], ["peerCertificateFunction", bool(true)]]), bool(true)],
  ["tls-custom-verdict.fungi", "tlsCustomVerdictCore", "galerina-framework-api-server/src/index.ts", "composeTlsAndCustomVerdicts", args([["cert", verdict(1)], ["customPresent", bool(true)], ["custom", verdict(0)], ["inputsValid", bool(true)]]), verdict(0)],
  ["nmr-failure-bound.fungi", "nmrFailureBoundCore", "galerina-tower-citizen/src/substrate-model.ts", "nmrFailureProbability", args([["failureScaled", int(20)], ["redundancy", int(3)], ["limitScaled", int(50)]]), bool(true)],
  ["lane-read-flip.fungi", "laneReadFlipCore", "galerina-tower-citizen/src/substrate-model.ts", "read", args([["shouldFlip", bool(true)], ["ideal", int(-1)], ["flipped", int(1)]]), int(1)],
  ["voted-reading-state.fungi", "votedReadingStateCore", "galerina-tower-citizen/src/substrate-model.ts", "readVoted", args([["majority", int(0)], ["noiseMargin", int(3)]]), string("indeterminate")],
  ["deadzone-policy-action.fungi", "deadzonePolicyActionCore", "galerina-tower-citizen/src/substrate-model.ts", "readVotedGoverned", args([["indeterminate", bool(true)], ["actionPolicy", string("revote")], ["revoteCount", int(3)]]), string("revote")],
  ["substrate-guarantee-admission.fungi", "substrateGuaranteeAdmissionCore", "galerina-tower-citizen/src/substrate-model.ts", "validateGuarantee", args([["epsilonValid", bool(true)], ["redundancyOdd", bool(true)], ["redundancyPositive", bool(true)]]), bool(true)],
  ["substrate-guarantee-result.fungi", "substrateGuaranteeResultCore", "galerina-tower-citizen/src/substrate-model.ts", "checkGuarantee", args([["modeled", int(3)], ["declared", int(5)], ["redundancy", int(3)]]), bool(true)],
  ["substrate-denial-severity.fungi", "substrateDenialSeverityCore", "galerina-tower-citizen/src/substrate-model.ts", "deny", args([["requested", string("error")], ["compliance", bool(true)]]), string("error")],
  ["tolerance-diagnostic-precedence.fungi", "toleranceDiagnosticPrecedenceCore", "galerina-tower-citizen/src/substrate-model.ts", "verifyToleranceUnderNoise", args([["cryptoEffect", bool(true)], ["laneNoisy", bool(true)], ["deterministicSink", bool(true)], ["redundancy", int(1)]]), string("crypto_on_noisy_lane")],
  ["voted-trit-three.fungi", "votedTritThreeCore", "galerina-tower-citizen/src/substrate-model.ts", "votedTrit3", args([["a", int(1)], ["b", int(1)], ["c", int(-1)]]), int(1)],
  ["snapshot-float-equality.fungi", "snapshotFloatEqualityCore", "galerina-tower-citizen/src/substrate-snapshot.ts", "eq", args([["absoluteDelta", int(5)], ["tolerance", int(10)]]), bool(true)],
  ["snapshot-consistency-admission.fungi", "snapshotConsistencyAdmissionCore", "galerina-tower-citizen/src/substrate-snapshot.ts", "verifySubstrateSnapshot", args([["freshConsistent", bool(true)], ["modeledClose", bool(true)], ["guaranteeMet", bool(true)]]), bool(true)],
  ["numeric-verdict-admission.fungi", "numericVerdictAdmissionCore", "galerina-tower-citizen/src/three-valued-governance.ts", "asVerdict", args([["value", int(0)]]), string("neutral")],
  ["indeterminate-diagnostic-action.fungi", "indeterminateDiagnosticActionCore", "galerina-tower-citizen/src/three-valued-governance.ts", "unknownDiagnostic", args([["value", verdict(0)], ["codePresent", bool(true)]]), string("emit")],
  ["confidence-range-admission.fungi", "confidenceRangeAdmissionCore", "galerina-tower-citizen/src/three-valued-governance.ts", "inRange", args([["confidence", int(80)], ["lower", int(70)], ["upper", int(90)]]), bool(true)],
  ["correlation-id-admission.fungi", "correlationIdAdmissionCore", "galerina-tower-citizen/src/tower-runtime.ts", "admittedCorrelationId", args([["provided", bool(true)], ["patternMatched", bool(true)], ["length", int(16)]]), string("provided")],
  ["transport-data-permission.fungi", "transportDataPermissionCore", "galerina-tower-citizen/src/transport-fsm.ts", "permitData", args([["stateOpen", bool(true)], ["eventData", bool(true)], ["gateAllow", bool(true)]]), bool(true)],
  ["transport-initial-state.fungi", "transportInitialStateCore", "galerina-tower-citizen/src/transport-fsm.ts", "initialContext", args([["keysPresent", bool(true)], ["opened", bool(true)]]), string("open")],
  ["transport-close-erasure.fungi", "transportCloseErasureCore", "galerina-tower-citizen/src/transport-fsm.ts", "toClosed", args([["keysPresent", bool(false)], ["callbackPresent", bool(true)]]), bool(false)],
  ["transport-step-transition.fungi", "transportStepTransitionCore", "galerina-tower-citizen/src/transport-fsm.ts", "step", args([["state", string("closed")], ["transportEvent", string("data")], ["authorized", bool(false)]]), string("closed")],
  ["lane-grant-mask.fungi", "laneGrantMaskCore", "galerina-tri-pipe/src/execution-router.ts", "laneIsGranted", args([["capabilityGranted", bool(true)], ["attestationVerified", bool(true)], ["componentEligible", bool(false)], ["laneCount", int(1)]]), bool(false)],
  ["execution-offload-decision.fungi", "executionOffloadDecisionCore", "galerina-tri-pipe/src/execution-router.ts", "route", args([["laneGranted", bool(false)], ["photonicEligible", bool(true)], ["precision", string("fp8")]]), string("digital")],
  ["tri-pipe-photonic-enable.fungi", "triPipePhotonicEnableCore", "galerina-tri-pipe/src/tri-pipe.ts", "createTriPipeEngine", args([["targetPhotonic", bool(true)], ["componentEligible", bool(true)], ["configMode", int(1)]]), bool(true)],
  ["regex-budget-veto-kind.fungi", "regexBudgetVetoKindCore", "galerina-tri-regex/src/compile.ts", "budgetVeto", args([["reasonPresent", bool(true)], ["budgetExceeded", bool(true)]]), string("veto")],
  ["regex-range-membership.fungi", "regexRangeMembershipCore", "galerina-tri-regex/src/compile.ts", "inRanges", args([["codePoint", int(65)], ["lower", int(64)], ["upper", int(90)]]), bool(true)],
  ["regex-parser-at-end.fungi", "regexParserAtEndCore", "galerina-tri-regex/src/parser.ts", "atEnd", args([["index", int(3)], ["length", int(3)]]), bool(true)],
  ["regex-parser-eat.fungi", "regexParserEatCore", "galerina-tri-regex/src/parser.ts", "eat", args([["atEnd", bool(false)], ["expected", int(65)], ["actual", int(65)]]), bool(true)],
  ["regex-singleton-range.fungi", "regexSingletonRangeCore", "galerina-tri-regex/src/parser.ts", "one", args([["codePoint", int(97)], ["lower", int(97)], ["upper", int(97)]]), bool(true)],
  ["component-prop-kind-admission.fungi", "componentPropKindAdmissionCore", "galerina-web-components/src/index.ts", "KNOWN_COMPONENT_PROP_KINDS", args([["known", bool(true)], ["kind", string("string")]]), bool(true)],
  ["component-child-kind-admission.fungi", "componentChildKindAdmissionCore", "galerina-web-components/src/index.ts", "KNOWN_COMPONENT_CHILD_KINDS", args([["known", bool(true)], ["safeHtml", bool(true)], ["kind", string("safe_html")]]), string("safe_html")],
  ["component-effect-admission.fungi", "componentEffectAdmissionCore", "galerina-web-components/src/index.ts", "KNOWN_COMPONENT_EFFECTS", args([["known", bool(true)], ["eventEffect", bool(true)], ["mutationEffect", bool(false)]]), bool(true)],
  ["rotation-tick-admission.fungi", "rotationTickAdmissionCore", "galerina-tower-citizen/src/registry-key-rotation.ts", "validTick", args([["safeInteger", bool(true)], ["nonnegative", bool(true)], ["negativeZero", bool(false)]]), bool(true)],
].map(([file, flow, source, symbol, input, expected]) =>
  Object.freeze({ file, flow, source, symbol, input, expected })));

function shadowFingerprint(source) {
  const identifiers = new Map();
  return createHash("sha256").update(source
    .replace(/^\uFEFF/u, "")
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/^\s*\/\/.*$/gmu, " ")
    .replace(/\b((?:pure|secure)\s+)?flow\s+[A-Za-z_][A-Za-z0-9_]*/gu, (match) =>
      match.replace(/([A-Za-z_][A-Za-z0-9_]*)$/u, "FLOW"))
    .replace(/"(?:\\.|[^"\\])*"/gu, '"STRING"')
    .replace(/\b-?(?:0x[0-9a-fA-F_]+|\d[\d_]*)\b/gu, "NUMBER")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/gu, (identifier) => {
      if (SHADOW_RESERVED_IDENTIFIERS.has(identifier)) return identifier;
      let replacement = identifiers.get(identifier);
      if (replacement === undefined) {
        replacement = `ID${identifiers.size}`;
        identifiers.set(identifier, replacement);
      }
      return replacement;
    }), "utf8").digest("hex");
}

describe("40-file source-bound Fungi decision-core overlay wave 4", () => {
  it("binds 40 distinct live source behaviours and package assets", () => {
    assert.equal(CANDIDATES.length, 40);
    const loadedAssets = JSON.parse(readFileSync(PACKAGE, "utf8")).packageGraph?.loadedAssets ?? [];
    const sourceScopes = new Set();
    for (const candidate of CANDIDATES) {
      assert.ok(loadedAssets.includes(`src/self-hosted/conversion-overlays/${candidate.file}`), `${candidate.file} must be a loaded asset`);
      const reference = readFileSync(join(ROOT, "packages-ts", candidate.source), "utf8");
      assert.ok(reference.includes(candidate.symbol), `${candidate.source} must contain ${candidate.symbol}`);
      assert.equal(sourceScopes.has(`${candidate.source}#${candidate.symbol}`), false, `${candidate.symbol} must be a distinct source scope`);
      sourceScopes.add(`${candidate.source}#${candidate.symbol}`);
    }
  });

  it("has no exact duplicate or normalized template shadow", () => {
    const seen = new Map();
    for (const candidate of CANDIDATES) {
      const path = join(OVERLAY_ROOT, candidate.file);
      assert.ok(existsSync(path), `${candidate.file} must exist`);
      const source = readFileSync(path, "utf8");
      for (const [kind, fingerprint] of [
        ["exact duplicate", createHash("sha256").update(source, "utf8").digest("hex")],
        ["template shadow", shadowFingerprint(source)],
      ]) {
        assert.equal(seen.has(fingerprint), false, `${candidate.file} ${kind} of ${seen.get(fingerprint)}`);
        seen.set(fingerprint, candidate.file);
      }
    }
  });

  it("parses, effect-checks, emits GIR and executes every decision core", async () => {
    for (const candidate of CANDIDATES) {
      const source = readFileSync(join(OVERLAY_ROOT, candidate.file), "utf8").replace(/^\uFEFF/u, "");
      const program = parseProgram(source, candidate.file);
      assert.deepEqual((program.diagnostics ?? []).filter((d) => d.severity === "error"), [], candidate.file);
      const effects = checkEffects(program.flows, program.ast);
      assert.deepEqual(effects.flatMap((r) => r.diagnostics).filter((d) => d.severity === "error"), [], candidate.file);
      const { gir } = emitGIR(program.ast, program.flows, effects);
      assert.equal(gir.flows.length, 1, candidate.file);
      const execution = await executeFlow(candidate.flow, candidate.input, program.ast, program.flows);
      assert.deepEqual(execution.value, candidate.expected, candidate.file);
    }
  });
});
