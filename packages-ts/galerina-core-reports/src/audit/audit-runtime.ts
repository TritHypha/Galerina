// RuntimeAuditRuntime (TODO pass, Grok 2026-10-05; owner may revisit).

/** Same 11-value vocabulary as @galerina/core-compute RuntimeTarget, duplicated to keep this package dependency-free. */
export type ReportRuntimeTarget = "cpu" | "node" | "wasm" | "browser-wasm" | "wasi" | "gpu" | "optical_io" | "photonic" | "native" | "serverless" | "edge";

export const REPORT_RUNTIME_TARGETS: readonly ReportRuntimeTarget[] = Object.freeze(["cpu", "node", "wasm", "browser-wasm", "wasi", "gpu", "optical_io", "photonic", "native", "serverless", "edge"] as const);

export interface RuntimeAuditRuntime {
  readonly runtimeId: string;
  readonly environment: string;
  readonly target: ReportRuntimeTarget;
  readonly processId: string;
  readonly region?: string;
}
