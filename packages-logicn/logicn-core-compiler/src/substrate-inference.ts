// =============================================================================
// LogicN — Substrate Inference (Direction B)
//
// `contract { substrate { lane / tolerance / redundancy } }` is OPTIONAL, peer to
// `resilience {}` / `observability {}` (the #58 inferred-block family). The
// verifier reads it and holds the flow to the Direction-C noise model *before any
// silicon exists*, fail-closed:
//   B1  crypto/hash/sign effect on a noisy lane            → LLN-SUBSTRATE-001 (always error)
//   B2  declared tolerance unprovable at declared N        → LLN-SUBSTRATE-002 (warn dev / err prod)
//       declared N insufficient, or pBad ≥ 0.5             → LLN-SUBSTRATE-003 (always error)
//   B3  un-voted (N=1) noisy result into a determ. sink    → LLN-SUBSTRATE-004 (always error)
// Priority when several fire: 001 > 004 > 003 > 002 (mirrors substrate-model.ts
// verifyToleranceUnderNoise). Safety (a noisy reading can never manufacture an ALLOW)
// is inherited structurally from Direction A's vAnd/No-Coercion — not re-proved here.
//
// A flow with NO substrate {} block, or one declaring `lane: digital`, is INERT
// (returns []), so existing flows are completely unaffected.
//
// Spec: docs/Knowledge-Bases/logicn-substrate-contracts.md
// =============================================================================

import { type AstNode, type FlowMeta } from "./parser.js";
import { type SubstrateNoiseParams, singleLaneErrorProbability, nmrFailureProbability } from "./substrate-math.js";

// Local profile union (kept local to avoid a type-import cycle with governance-verifier).
type DeploymentProfile = "dev" | "production" | "deterministic" | "check-only";

export type SubstrateLane = "photonic" | "noisy" | "digital";

/** Default tolerance when a substrate block omits it: tight (deny-by-default). */
const DEFAULT_TOLERANCE = 1e-9;

/**
 * Author-declared disposition when a substrate operation yields the K3-0 INDETERMINATE
 * dead-zone (a photonic/noisy lane reading that discretizes to 0 — phase drift, an
 * attacker tapping the fiber, severe noise). Default `trap` = fail-closed (refuse the
 * value, trap to RECOVERING + audit). `fallback_digital` = recompute the operation
 * exactly on the digital core. `revote:N` = re-vote the reading N times (NMR-style) —
 * only meaningful on a lane that can converge (pBad < 0.5). The runtime/router honours
 * this; omitting it defaults to fail-closed, so it can never weaken safety. (TRACK a.)
 */
export type OnIndeterminate =
  | { readonly kind: "trap" }
  | { readonly kind: "revote"; readonly n: number }
  | { readonly kind: "fallback_digital" };

const DEFAULT_ON_INDETERMINATE: OnIndeterminate = { kind: "trap" };

/**
 * Lane → conservative representative noise profile. PLACEHOLDER calibration (no
 * silicon to calibrate against; documented knob — spec §6/§9, same Q3 caveat as
 * Direction C). `digital` is noiseless (inert). The author declares the *guarantee*
 * (lane/tolerance/redundancy); the noise floor is fixed here so it cannot be gamed
 * downward to make a tolerance pass.
 */
const LANE_PROFILES: Record<SubstrateLane, SubstrateNoiseParams> = {
  digital: { phaseDriftSigma: 0, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 }, // pBad 0 (inert)
  photonic: { phaseDriftSigma: 0.02, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 }, // pBad 0.02 — redundancy converges
  noisy: { phaseDriftSigma: 0.60, crosstalkCoeff: 0, laneFailureProb: 0, readoutSigma: 0 }, // pBad 0.60 — degraded lane, voting cannot converge (pBad ≥ 0.5)
};

// Crypto/integrity effects that must run bit-exact on a deterministic core (LLN-SUBSTRATE-001)
// — extended for #34 confidentiality (encrypt/decrypt/seal) so a KEM-DEM/AEAD op on a noisy
// or analog (photonic) lane is rejected, exactly as sign/verify/hash already are.
// The `(\.|$)` tail (NOT a bare `$`) is load-bearing: it also matches the PQ/algorithm-suffixed
// variants — crypto.sign.hybrid / crypto.sign.mldsa65 / crypto.sign.slhdsa / crypto.seal.* — which
// a certified profile MANDATES (LLN-CRYPTO-PQ-001 rejects bare crypto.sign). A `$`-anchored match
// let the mandatory PQ form escape the crypto-on-noisy-lane gate in exactly the certified posture
// where it matters most. Match the whole crypto.<head>.* family fail-closed; integrity is never
// tolerance-bounded, so there is no crypto sub-variant that is legitimate on a noisy lane.
const CRYPTO_EFFECT = /^crypto\.(hash|sign|verify|encrypt|decrypt|seal)(\.|$)/;

// ---------------------------------------------------------------------------
// AST extraction (reuses the resilience-inference idiom)
// ---------------------------------------------------------------------------

function findSubstrateBlock(flowNode: AstNode): AstNode | undefined {
  const contractNode = (flowNode.children ?? []).find((c) => c.kind === "contractDecl");
  return (contractNode?.children ?? []).find(
    (c) => c.kind === "identifier" && c.value === "substrate:block",
  );
}

/** Join every `decl:` child of the block into one space-separated text (layout-robust). */
function substrateDeclText(block: AstNode): string {
  return (block.children ?? [])
    .filter((c) => c.kind === "identifier" && (c.value ?? "").startsWith("decl:"))
    .map((c) => (c.value ?? "").replace(/^decl:/, ""))
    .join(" ");
}

// A clean numeric literal token: integer, optional fraction, optional exponent.
// The lexer now emits scientific notation (`1e-6`) as ONE token, so a well-formed
// value arrives WITHOUT internal spaces; a split/garbage value ("1 e - 6", "1e-") has
// spaces or stray chars and fails this anchor → flagged malformed (fail-closed).
const CLEAN_NUMBER = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

interface Field<T> {
  readonly present: boolean;
  readonly value: T;
  readonly malformed: boolean;
}

/** Slice the value text of one field (up to the next known field keyword or end). */
function fieldSegment(text: string, field: string, others: readonly string[]): string | undefined {
  const stop = others.join("|");
  const m = text.match(new RegExp(`\\b${field}\\b\\s*:?\\s*([^]*?)\\s*(?:\\b(?:${stop})\\b|$)`));
  return m?.[1]?.trim();
}

function parseLaneField(text: string): Field<SubstrateLane> {
  const seg = fieldSegment(text, "lane", ["tolerance", "redundancy", "on_indeterminate"]);
  if (seg === undefined || seg === "") return { present: false, value: "digital", malformed: false };
  if (seg === "photonic" || seg === "noisy" || seg === "digital") return { present: true, value: seg, malformed: false };
  return { present: true, value: "digital", malformed: true }; // unrecognised lane keyword → fail closed
}

function parseToleranceField(text: string): Field<number> {
  const seg = fieldSegment(text, "tolerance", ["lane", "redundancy", "on_indeterminate"]);
  if (seg === undefined || seg === "") return { present: false, value: DEFAULT_TOLERANCE, malformed: false };
  if (!CLEAN_NUMBER.test(seg)) return { present: true, value: DEFAULT_TOLERANCE, malformed: true }; // split/garbage
  const v = parseFloat(seg);
  return { present: true, value: v, malformed: !Number.isFinite(v) || v < 0 || v > 1 };
}

function parseRedundancyField(text: string): Field<number> {
  const seg = fieldSegment(text, "redundancy", ["lane", "tolerance", "on_indeterminate"]);
  if (seg === undefined || seg === "") return { present: false, value: 1, malformed: false };
  if (seg === "tmr") return { present: true, value: 3, malformed: false };
  if (!/^[0-9]+$/.test(seg)) return { present: true, value: 1, malformed: true };
  const n = parseInt(seg, 10);
  if (!Number.isInteger(n) || n < 1 || n % 2 === 0) return { present: true, value: 1, malformed: true }; // even / <1
  return { present: true, value: n, malformed: false };
}

/** Parse `on_indeterminate: trap | revote:N | fallback_digital`. Absent → trap (fail-closed default). */
function parseOnIndeterminateField(text: string): Field<OnIndeterminate> {
  const seg0 = fieldSegment(text, "on_indeterminate", ["lane", "tolerance", "redundancy"]);
  if (seg0 === undefined || seg0 === "") return { present: false, value: DEFAULT_ON_INDETERMINATE, malformed: false };
  const seg = seg0.replace(/\s+/g, ""); // value is a single token ("trap"/"fallback_digital"/"revote:N")
  if (seg === "trap") return { present: true, value: { kind: "trap" }, malformed: false };
  if (seg === "fallback_digital") return { present: true, value: { kind: "fallback_digital" }, malformed: false };
  const m = seg.match(/^revote:?([0-9]+)$/);
  if (m) {
    const n = parseInt(m[1] ?? "", 10);
    if (Number.isInteger(n) && n >= 1) return { present: true, value: { kind: "revote", n }, malformed: false };
  }
  return { present: true, value: DEFAULT_ON_INDETERMINATE, malformed: true }; // unrecognised → fail closed (trap)
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

export interface InferredSubstrate {
  readonly lane: SubstrateLane;
  readonly tolerance: number;
  readonly redundancyN: number;
  /** Author disposition on a K3-0 INDETERMINATE substrate reading. Default trap (fail-closed). */
  readonly onIndeterminate: OnIndeterminate;
  /** true iff a substrate {} block was present (regardless of lane). */
  readonly explicit: boolean;
  /** a declared field failed validation (malformed) — fail-closed signal. */
  readonly malformed: boolean;
}

/**
 * Read the substrate {} block. Absent block (or `lane: digital`) → inert digital
 * default. Malformed declared values fail closed (flagged, never coerced silently).
 */
export function inferFlowSubstrate(flowNode: AstNode, _flow: FlowMeta): InferredSubstrate {
  const block = findSubstrateBlock(flowNode);
  if (block === undefined) {
    return {
      lane: "digital", tolerance: DEFAULT_TOLERANCE, redundancyN: 1,
      onIndeterminate: DEFAULT_ON_INDETERMINATE, explicit: false, malformed: false,
    };
  }
  const text = substrateDeclText(block);
  const lane = parseLaneField(text);
  const tolerance = parseToleranceField(text);
  const redundancy = parseRedundancyField(text);
  const onIndeterminate = parseOnIndeterminateField(text);
  return {
    lane: lane.value,
    tolerance: tolerance.value,
    redundancyN: redundancy.value,
    onIndeterminate: onIndeterminate.value,
    explicit: true,
    malformed: lane.malformed || tolerance.malformed || redundancy.malformed || onIndeterminate.malformed,
  };
}

// ---------------------------------------------------------------------------
// Governance check (LLN-SUBSTRATE-001..004) — fail-closed, priority 001 > 004 > 003 > 002
// ---------------------------------------------------------------------------

export interface SubstrateViolation {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly suggestedFix?: string;
}

export function checkSubstrateViolations(
  flowNode: AstNode,
  flow: FlowMeta,
  profile: DeploymentProfile,
  /** True if the flow declares `safety { require deterministic_execution }` (a B3 sink signal
   *  independent of the deployment profile). Computed by the verifier via extractSafetyRequirements. */
  externalDeterminismSink = false,
): SubstrateViolation[] {
  const inf = inferFlowSubstrate(flowNode, flow);

  // Malformed declared value fails closed as an error — checked BEFORE the digital early-return
  // below. parseLaneField fails an unrecognised lane keyword closed to value "digital" WITH
  // malformed=true (e.g. `lane: gaming`, or a value polluted by a trailing `//` comment the
  // parser did not strip). If the `inf.lane === "digital"` early-return ran first, that safe
  // default would masquerade as an author-chosen inert digital lane and silently drop the
  // crypto-on-noisy gate — a fail-open. Spec §8: malformed never silently coerces to a default.
  if (inf.malformed) {
    return [{
      code: "LLN-SUBSTRATE-002",
      name: "TOLERANCE_UNACHIEVABLE_UNDER_NOISE",
      severity: "error",
      message: `Flow '${flow.name}' substrate {} has a malformed value. lane must be photonic | noisy | digital; tolerance must be in [0,1]; redundancy must be an odd integer ≥ 1 or 'tmr'; on_indeterminate must be trap | revote:N | fallback_digital.`,
      suggestedFix: "Fix the substrate {} field values (e.g. lane: photonic, tolerance: 0.001, redundancy: 3). Note: a trailing // comment on a field line is not stripped — put comments on their own line.",
    }];
  }

  // A flow with no substrate block, or a (well-formed) digital lane, is completely inert.
  if (inf.lane === "digital") return [];

  const laneIsNoisy = inf.lane === "photonic" || inf.lane === "noisy";
  const hasCrypto = flow.declaredEffects.some((e) => CRYPTO_EFFECT.test(e));

  const params = LANE_PROFILES[inf.lane];
  const pBad = singleLaneErrorProbability(params);
  const epsilonModeled = nmrFailureProbability(pBad, inf.redundancyN);
  const met = epsilonModeled <= inf.tolerance;
  const redundancyHelps = pBad < 0.5;

  // B1 — crypto on a noisy lane: integrity is never tolerance-bounded (highest priority).
  if (hasCrypto && laneIsNoisy) {
    return [{
      code: "LLN-SUBSTRATE-001",
      name: "CRYPTO_ON_NOISY_LANE",
      severity: "error",
      message: `Flow '${flow.name}' declares a crypto effect on lane '${inf.lane}'. Integrity requires bit-exactness and cannot be tolerance-bounded.`,
      suggestedFix: "Move the crypto/hash/sign operation to a digital lane (substrate { lane: digital }).",
    }];
  }

  // B3 — un-voted noisy result feeding a determinism-requiring sink. The sink signal is the
  // `deterministic` deployment profile OR a `safety { require deterministic_execution }` clause
  // on the flow (the latter binds the requirement regardless of profile). Crypto-on-noisy is
  // already fully owned by B1/001 above, so it is not re-tested here.
  const isUnvoted = inf.redundancyN === 1;
  const sinkRequiresDeterminism = profile === "deterministic" || externalDeterminismSink;
  if (laneIsNoisy && isUnvoted && sinkRequiresDeterminism) {
    return [{
      code: "LLN-SUBSTRATE-004",
      name: "UNVOTED_ANALOG_INTO_DETERMINISTIC",
      severity: "error",
      message: `Flow '${flow.name}' feeds an un-voted (redundancy: 1) result from noisy lane '${inf.lane}' into a context requiring determinism.`,
      suggestedFix: "Add redundancy (e.g. redundancy: tmr) so the result is majority-voted, or use lane: digital.",
    }];
  }

  // B2 — declared tolerance not provable under the model.
  if (!met) {
    if (!redundancyHelps) {
      return [{
        code: "LLN-SUBSTRATE-003",
        name: "REDUNDANCY_INSUFFICIENT",
        severity: "error",
        message: `Flow '${flow.name}': lane '${inf.lane}' single-lane error pBad=${pBad} ≥ 0.5 — majority voting cannot converge; redundancy will not help.`,
        suggestedFix: "Reduce the lane noise or move to lane: digital; more redundancy cannot meet this tolerance.",
      }];
    }
    if (inf.redundancyN > 1) {
      return [{
        code: "LLN-SUBSTRATE-003",
        name: "REDUNDANCY_INSUFFICIENT",
        severity: "error",
        message: `Flow '${flow.name}': declared redundancy N=${inf.redundancyN} is insufficient — modeled error ${epsilonModeled} > tolerance ${inf.tolerance}. Raise N.`,
        suggestedFix: "Increase redundancy (a higher odd N) until the modeled error meets the declared tolerance.",
      }];
    }
    const severity = profile === "production" || profile === "deterministic" ? "error" : "warning";
    return [{
      code: "LLN-SUBSTRATE-002",
      name: "TOLERANCE_UNACHIEVABLE_UNDER_NOISE",
      severity,
      message: `Flow '${flow.name}': tolerance ${inf.tolerance} is unachievable on lane '${inf.lane}' at redundancy 1 — modeled error ${epsilonModeled}.`,
      suggestedFix: "Declare redundancy (e.g. redundancy: tmr) so the majority vote meets the tolerance.",
    }];
  }

  return [];
}
