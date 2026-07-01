// =============================================================================
// Galerina — Observability Inference (Convention over Configuration)
//
// `contract { observability {} }` is OPTIONAL and auto-by-default.
// Produces OPERATIONAL telemetry — NOT compliance evidence.
//
// Distinction (by design):
//   audit {}          = evidentiary, signed, always-on, permanent retention
//   observability {}  = operational, sampled, rolling retention, best-effort
//
// Design approved: 2026-06-04 (galerina-resilience-observability-design.md)
//
// Key rules:
//   - FUNGI-OBS-001: observability explicitly declared on pure flow is a warning
//     (pure flows have no observable side effects — telemetry is pointless)
//   - Sampling rate is float 0.0–1.0 (IEEE 754), consistent with economics {} primitives
//   - Alert destinations are platform-agnostic (routing is deployment config)
// =============================================================================

import { type AstNode, type FlowMeta } from "./parser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TraceConfig =
  | { enabled: false }
  | { enabled: true; sampleRate: number };

export interface ObservabilityMetric {
  readonly name: string;
  readonly custom: boolean;
}

export interface AlertRule {
  readonly metric: string;
  readonly operator: ">" | "<" | ">=" | "<=" | "==" | "!=";
  readonly threshold: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface InferredObservability {
  readonly trace:     TraceConfig;
  readonly metrics:   readonly ObservabilityMetric[];
  readonly alertRules: readonly AlertRule[];
  readonly logLevel:  LogLevel;
  readonly explicit:  boolean;
}

// ---------------------------------------------------------------------------
// Standard metrics
// ---------------------------------------------------------------------------

const LATENCY_METRIC:    ObservabilityMetric = { name: "latency_p99",  custom: false };
const ERROR_RATE_METRIC: ObservabilityMetric = { name: "error_rate",   custom: false };
const THROUGHPUT_METRIC: ObservabilityMetric = { name: "throughput",   custom: false };

const HIGH_TRUST_EFFECTS = new Set([
  // 2026-07-01: was "gateway.charge" (non-canonical → matched nothing; payment flows
  // silently missed high-trust observability). Canonical payment effect is payment.charge.
  "ledger.mutate", "database.write", "payment.charge",
  "network.outbound", "audit.write",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasExplicitObservability(flowNode: AstNode): boolean {
  const contractNode = (flowNode.children ?? []).find(c => c.kind === "contractDecl");
  return (contractNode?.children ?? []).some(
    c => c.kind === "identifier" && c.value === "observability:block",
  );
}

function extractAuditLevel(flowNode: AstNode): string {
  const contractNode = (flowNode.children ?? []).find(c => c.kind === "contractDecl");
  if (contractNode === undefined) return "";
  const auditBlock = (contractNode.children ?? []).find(
    c => c.kind === "identifier" && c.value === "audit:block",
  );
  if (auditBlock === undefined) return "";
  const rawDecl = (auditBlock.children ?? []).find(
    c => (c.value ?? "").includes("cryptographic_state_hash"),
  );
  return rawDecl !== undefined ? "cryptographic_state_hash" : "standard";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Infer observability configuration for a flow.
 *
 * pure flows → minimal (no trace, latency only, no alerts)
 * secure + network → 10% sampling, standard metrics, alert at p99 > 1s
 * high-trust (crypto audit) → 100% sampling, all metrics, tight thresholds
 */
export function inferFlowObservability(
  flowNode: AstNode,
  flow: FlowMeta,
): InferredObservability {
  const isPure      = flow.qualifier === "pure";
  const auditLevel  = extractAuditLevel(flowNode);
  const isHighTrust = auditLevel === "cryptographic_state_hash" ||
                      flow.declaredEffects.some(e => HIGH_TRUST_EFFECTS.has(e));

  if (hasExplicitObservability(flowNode)) {
    // Developer declared explicit — use a sensible base; full parsing is TODO
    return {
      trace:      { enabled: true, sampleRate: 0.1 },
      metrics:    [LATENCY_METRIC, ERROR_RATE_METRIC],
      alertRules: [],
      logLevel:   "info",
      explicit:   true,
    };
  }

  // Auto-by-default inference:
  if (isPure) {
    // Pure flows have no observable side effects — minimal telemetry
    return {
      trace:      { enabled: false },
      metrics:    [LATENCY_METRIC],
      alertRules: [],
      logLevel:   "silent",
      explicit:   false,
    };
  }

  if (isHighTrust) {
    // High-trust flows: full sampling, all standard metrics, tight alert thresholds
    return {
      trace:      { enabled: true, sampleRate: 1.0 },
      metrics:    [LATENCY_METRIC, ERROR_RATE_METRIC, THROUGHPUT_METRIC],
      alertRules: [
        { metric: "latency_p99", operator: ">", threshold: "500ms" },
        { metric: "error_rate",  operator: ">", threshold: "1%"    },
      ],
      logLevel:   "warn",
      explicit:   false,
    };
  }

  // Standard governed flows: 10% trace sampling, standard metrics, 1s alert
  return {
    trace:      { enabled: true, sampleRate: 0.1 },
    metrics:    [LATENCY_METRIC, ERROR_RATE_METRIC],
    alertRules: [
      { metric: "latency_p99", operator: ">", threshold: "1000ms" },
      { metric: "error_rate",  operator: ">", threshold: "5%"     },
    ],
    logLevel:   "info",
    explicit:   false,
  };
}

// ---------------------------------------------------------------------------
// Governance check (FUNGI-OBS-001)
// ---------------------------------------------------------------------------

export interface ObservabilityWarning {
  readonly code: "FUNGI-OBS-001";
  readonly message: string;
  readonly severity: "warning";
}

/**
 * FUNGI-OBS-001: explicitly declaring observability {} on a pure flow is a warning.
 * Pure flows have no side effects — trace spans and error rates are meaningless.
 */
export function checkObservabilityWarnings(
  flowNode: AstNode,
  flow: FlowMeta,
): ObservabilityWarning[] {
  if (flow.qualifier === "pure" && hasExplicitObservability(flowNode)) {
    return [{
      code: "FUNGI-OBS-001",
      message:
        `Flow '${flow.name}' is a pure flow with an explicit observability {} block. ` +
        `Pure flows have no side effects — traces, error rates, and latency metrics ` +
        `are not meaningful. Remove the observability block or change the flow qualifier.`,
      severity: "warning",
    }];
  }
  return [];
}
