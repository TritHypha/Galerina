// Producer-side wire of NetworkPolicyReport / NetworkReport onto the closed
// galerina.runtime.audit.v1 envelope (category network). Field names and
// vocabularies are copied from @galerina/core-reports so this package stays
// dependency-free. Callers supply eventId, timestamp, and runtime (no clock
// is chosen here). core-reports / core-compiler do not import this module
// in this slice. Compiler fungi.runtime.audit.v1 mapping is not invented.

import { FUNGI_NETWORK_CODES } from "../diagnostics/network-codes.js";
import type { NetworkDiagnostic, NetworkReport } from "../index.js";
import { NETWORK_POLICY_REPORT_SCHEMA, type NetworkPolicyReport } from "./network-policy-report.js";

export const NETWORK_RUNTIME_AUDIT_SCHEMA = "galerina.runtime.audit.v1" as const;
export const NETWORK_RUNTIME_AUDIT_CATEGORY = "network" as const;

export const NETWORK_RUNTIME_AUDIT_EVENT_KEYS = Object.freeze([
  "schemaVersion",
  "eventId",
  "timestamp",
  "category",
  "status",
  "message",
  "runtime",
  "effect",
  "capability",
  "destination",
  "references",
  "metadata",
] as const);

export const NETWORK_RUNTIME_AUDIT_RUNTIME_KEYS = Object.freeze([
  "runtimeId",
  "environment",
  "target",
  "processId",
  "region",
] as const);

export const NETWORK_RUNTIME_AUDIT_STATUSES = Object.freeze([
  "allowed",
  "denied",
  "warning",
  "error",
  "executed",
  "verified",
] as const);

export const NETWORK_RUNTIME_AUDIT_REFERENCE_TYPES = Object.freeze([
  "proof",
  "denial",
  "evidence",
  "manifest",
  "policy",
] as const);

/** Same 11-value vocabulary as core-reports ReportRuntimeTarget. */
export const NETWORK_REPORT_RUNTIME_TARGETS = Object.freeze([
  "cpu",
  "node",
  "wasm",
  "browser-wasm",
  "wasi",
  "gpu",
  "optical_io",
  "photonic",
  "native",
  "serverless",
  "edge",
] as const);

export type NetworkRuntimeAuditStatus = (typeof NETWORK_RUNTIME_AUDIT_STATUSES)[number];
export type NetworkReportRuntimeTarget = (typeof NETWORK_REPORT_RUNTIME_TARGETS)[number];

export interface NetworkRuntimeAuditRuntime {
  readonly runtimeId: string;
  readonly environment: string;
  readonly target: NetworkReportRuntimeTarget;
  readonly processId: string;
  readonly region?: string;
}

export interface NetworkRuntimeAuditReference {
  readonly type: (typeof NETWORK_RUNTIME_AUDIT_REFERENCE_TYPES)[number];
  readonly id: string;
}

export interface NetworkRuntimeAuditEvent {
  readonly schemaVersion: typeof NETWORK_RUNTIME_AUDIT_SCHEMA;
  readonly eventId: string;
  readonly timestamp: string;
  readonly category: typeof NETWORK_RUNTIME_AUDIT_CATEGORY;
  readonly status: NetworkRuntimeAuditStatus;
  readonly message: string;
  readonly runtime: NetworkRuntimeAuditRuntime;
  readonly destination?: string;
  readonly references?: readonly NetworkRuntimeAuditReference[];
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface NetworkRuntimeAuditWireContext {
  readonly eventId: string;
  readonly timestamp: string;
  readonly runtime: NetworkRuntimeAuditRuntime;
}

export interface NetworkRuntimeAuditWireResult {
  readonly event?: NetworkRuntimeAuditEvent;
  readonly diagnostics: readonly NetworkDiagnostic[];
}

const AUDIT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const AUDIT_MESSAGE_MAX = 2048;

const diag = (message: string, path: string): NetworkDiagnostic =>
  Object.freeze({
    code: FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE,
    severity: "error",
    message,
    path,
  });

function isAuditId(value: unknown): value is string {
  return typeof value === "string" && AUDIT_ID.test(value);
}

function isAuditTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
}

function shortText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function validateContext(ctx: NetworkRuntimeAuditWireContext): NetworkDiagnostic[] {
  const out: NetworkDiagnostic[] = [];
  if (!isAuditId(ctx.eventId)) out.push(diag("eventId is invalid.", "eventId"));
  if (!isAuditTimestamp(ctx.timestamp)) out.push(diag("timestamp must be ISO-8601 UTC.", "timestamp"));
  const rt = ctx.runtime;
  if (rt === null || typeof rt !== "object") {
    out.push(diag("runtime must be a plain record.", "runtime"));
    return out;
  }
  for (const key of Object.keys(rt)) {
    if (!(NETWORK_RUNTIME_AUDIT_RUNTIME_KEYS as readonly string[]).includes(key)) {
      out.push(diag(`Unknown runtime field ${key}.`, `runtime.${key}`));
    }
  }
  if (!isAuditId(rt.runtimeId)) out.push(diag("runtime.runtimeId is invalid.", "runtime.runtimeId"));
  if (!shortText(rt.environment, 256)) out.push(diag("runtime.environment is required.", "runtime.environment"));
  if (typeof rt.target !== "string" || !(NETWORK_REPORT_RUNTIME_TARGETS as readonly string[]).includes(rt.target)) {
    out.push(diag("runtime.target is invalid.", "runtime.target"));
  }
  if (!shortText(rt.processId, 256)) out.push(diag("runtime.processId is required.", "runtime.processId"));
  if ("region" in rt && rt.region !== undefined && !shortText(rt.region, 256)) {
    out.push(diag("runtime.region must be a short string when present.", "runtime.region"));
  }
  return out;
}

function statusFromDiagnostics(diagnostics: readonly { readonly severity?: string }[]): NetworkRuntimeAuditStatus {
  if (diagnostics.some((d) => d.severity === "error")) return "denied";
  if (diagnostics.some((d) => d.severity === "warning")) return "warning";
  return "verified";
}

function freezeRuntime(runtime: NetworkRuntimeAuditRuntime): NetworkRuntimeAuditRuntime {
  return Object.freeze(
    runtime.region === undefined
      ? { runtimeId: runtime.runtimeId, environment: runtime.environment, target: runtime.target, processId: runtime.processId }
      : { runtimeId: runtime.runtimeId, environment: runtime.environment, target: runtime.target, processId: runtime.processId, region: runtime.region },
  );
}

function finishEvent(
  ctx: NetworkRuntimeAuditWireContext,
  input: {
    readonly status: NetworkRuntimeAuditStatus;
    readonly message: string;
    readonly destination?: string;
    readonly policyName: string;
    readonly metadata: Record<string, string>;
  },
): NetworkRuntimeAuditWireResult {
  if (!shortText(input.message, AUDIT_MESSAGE_MAX)) {
    return { diagnostics: Object.freeze([diag(`message must be 1..${AUDIT_MESSAGE_MAX} characters.`, "message")]) };
  }
  const metadata = Object.freeze({ ...input.metadata });
  const event: NetworkRuntimeAuditEvent = {
    schemaVersion: NETWORK_RUNTIME_AUDIT_SCHEMA,
    eventId: ctx.eventId,
    timestamp: ctx.timestamp,
    category: NETWORK_RUNTIME_AUDIT_CATEGORY,
    status: input.status,
    message: input.message,
    runtime: freezeRuntime(ctx.runtime),
    metadata,
  };
  if (shortText(input.destination, 512)) (event as { destination?: string }).destination = input.destination;
  if (isAuditId(input.policyName)) {
    (event as { references?: readonly NetworkRuntimeAuditReference[] }).references = Object.freeze([
      Object.freeze({ type: "policy" as const, id: input.policyName }),
    ]);
  }
  const frozen = Object.freeze(event);
  for (const key of Object.keys(frozen)) {
    if (!(NETWORK_RUNTIME_AUDIT_EVENT_KEYS as readonly string[]).includes(key)) {
      return { diagnostics: Object.freeze([diag(`Unknown audit event field ${key}.`, key)]) };
    }
  }
  const encoded = JSON.stringify(frozen);
  if (encoded.includes('"secret"')) {
    return { diagnostics: Object.freeze([diag("Audit event must not carry webhook secrets.", "event")]) };
  }
  return { event: frozen, diagnostics: Object.freeze([]) };
}

export function networkPolicyReportToRuntimeAuditEvent(
  report: NetworkPolicyReport,
  ctx: NetworkRuntimeAuditWireContext,
): NetworkRuntimeAuditWireResult {
  const contextDiags = validateContext(ctx);
  if (report === null || typeof report !== "object") {
    return { diagnostics: Object.freeze([...contextDiags, diag("NetworkPolicyReport must be an object.", "report")]) };
  }
  if (report.schemaVersion !== NETWORK_POLICY_REPORT_SCHEMA) {
    return {
      diagnostics: Object.freeze([
        ...contextDiags,
        diag("schemaVersion must be galerina.network.report.v1.", "report.schemaVersion"),
      ]),
    };
  }
  if (contextDiags.length > 0) return { diagnostics: Object.freeze(contextDiags) };
  const denied = report.deniedDestinations ?? [];
  const validated = report.validatedDestinations ?? [];
  const destination = denied[0] ?? (typeof validated[0]?.name === "string" ? validated[0].name : undefined);
  const args: {
    readonly status: NetworkRuntimeAuditStatus;
    readonly message: string;
    readonly destination?: string;
    readonly policyName: string;
    readonly metadata: Record<string, string>;
  } = {
    status: statusFromDiagnostics(report.diagnostics ?? []),
    message: `network-policy-report denied=${denied.length} validated=${validated.length}`,
    policyName: typeof report.policy?.name === "string" ? report.policy.name : "",
    metadata: {
      reportKind: "NetworkPolicyReport",
      reportSchema: NETWORK_POLICY_REPORT_SCHEMA,
      policyName: typeof report.policy?.name === "string" ? report.policy.name : "",
      deniedCount: String(denied.length),
      validatedCount: String(validated.length),
    },
  };
  if (typeof destination === "string" && destination.length > 0) {
    return finishEvent(ctx, { ...args, destination });
  }
  return finishEvent(ctx, args);
}

export function networkReportToRuntimeAuditEvent(
  report: NetworkReport,
  ctx: NetworkRuntimeAuditWireContext,
): NetworkRuntimeAuditWireResult {
  const contextDiags = validateContext(ctx);
  if (report === null || typeof report !== "object") {
    return { diagnostics: Object.freeze([...contextDiags, diag("NetworkReport must be an object.", "report")]) };
  }
  if (contextDiags.length > 0) return { diagnostics: Object.freeze(contextDiags) };
  const hosts = report.outboundHosts ?? [];
  const destination = hosts[0];
  const args: {
    readonly status: NetworkRuntimeAuditStatus;
    readonly message: string;
    readonly destination?: string;
    readonly policyName: string;
    readonly metadata: Record<string, string>;
  } = {
    status: statusFromDiagnostics(report.diagnostics ?? []),
    message: `network-report diagnostics=${(report.diagnostics ?? []).length} outboundHosts=${hosts.length}`,
    policyName: typeof report.policy?.name === "string" ? report.policy.name : "",
    metadata: {
      reportKind: "NetworkReport",
      policyName: typeof report.policy?.name === "string" ? report.policy.name : "",
      diagnosticCount: String((report.diagnostics ?? []).length),
    },
  };
  if (typeof destination === "string" && destination.length > 0) {
    return finishEvent(ctx, { ...args, destination });
  }
  return finishEvent(ctx, args);
}
