// hold-pin.ts — package side of the app-kernel HOLD rows.
//
// RD-1413–1415 stay HOLD / NON_AUTHORIZING. This package never adds TypeScript
// secret-authority, never wires fuse-border or a central registry into
// kernel.ts, never binds a live governed runtime, and never runs SAW / queue /
// audit / durable-replay as live kernel acts.

export const APP_KERNEL_HOLD_PIN_SCHEMA = "galerina.framework-app-kernel.hold-pin.v1" as const;

export type AppKernelHoldRefusalCode =
  | "APPK_SECRET_AUTHORITY_FORBIDDEN"
  | "APPK_PROTECTED_MEMORY_FORBIDDEN"
  | "APPK_FUSE_BORDER_KERNEL_FORBIDDEN"
  | "APPK_CENTRAL_REGISTRY_KERNEL_FORBIDDEN"
  | "APPK_GOVERNED_RUNTIME_WIRE_FORBIDDEN"
  | "APPK_DURABLE_REPLAY_FORBIDDEN"
  | "APPK_LIVE_QUEUE_FORBIDDEN"
  | "APPK_LIVE_STRUCTURED_AWAIT_FORBIDDEN"
  | "APPK_LIVE_AUDIT_EMIT_FORBIDDEN"
  | "APPK_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT"
  | "APPK_HOLD_REQUEST_MALFORMED";

export interface AppKernelHoldRefusal {
  readonly kind: "REFUSED";
  readonly code: AppKernelHoldRefusalCode;
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export interface ProtectedMemoryRouteRequestV1 {
  readonly kind: "PROTECTED_MEMORY_ROUTE_REQUEST";
  readonly schema: typeof APP_KERNEL_HOLD_PIN_SCHEMA;
  readonly status: "REQUESTED_NOT_ADMITTED";
  readonly route: string;
  readonly requires: {
    readonly ownerCompleteDesignApproval: true;
    readonly boundProtectedOperation: true;
    readonly amazonLinuxTcbProfile: true;
    readonly signetIssuerRevoker: true;
    readonly fungiLeaseAbi: true;
  };
  readonly authorityReleased: false;
  readonly admissionAuthority: false;
}

export type ProtectedMemoryRouteRequestResult =
  | ProtectedMemoryRouteRequestV1
  | AppKernelHoldRefusal;

const AUTHORITY_KEYS: ReadonlySet<string> = new Set([
  "lease", "vokLease", "vokDecision", "decision", "grant", "receipt", "admission",
  "admissionToken", "capabilityToken", "executor", "dispatch", "allow", "authority",
  "kernel", "fuseBorder", "secretsAuthority", "protectedMemory", "signet",
]);

function isPlainDataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasAuthorityField(value: unknown, depth: number): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string" && AUTHORITY_KEYS.has(key)) return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return true;
    if (hasAuthorityField(descriptor.value, depth + 1)) return true;
  }
  return false;
}

function boundedString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 512) return null;
  return value.trim();
}

function refusal(code: AppKernelHoldRefusalCode): AppKernelHoldRefusal {
  return Object.freeze({
    kind: "REFUSED",
    code,
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/**
 * Package a coupled-route *request*. Never admits a protected-memory path.
 * RD-1413–1415 stay REQUESTED_NOT_ADMITTED until the owner-approved next gate.
 */
export function prepareProtectedMemoryRouteRequest(input: unknown): ProtectedMemoryRouteRequestResult {
  if (hasAuthorityField(input, 0)) return refusal("APPK_HOLD_REQUEST_AUTHORITY_FIELD_PRESENT");
  if (!isPlainDataObject(input)) return refusal("APPK_HOLD_REQUEST_MALFORMED");
  const route = boundedString(input.route);
  if (route === null) return refusal("APPK_HOLD_REQUEST_MALFORMED");
  return Object.freeze({
    kind: "PROTECTED_MEMORY_ROUTE_REQUEST",
    schema: APP_KERNEL_HOLD_PIN_SCHEMA,
    status: "REQUESTED_NOT_ADMITTED",
    route,
    requires: Object.freeze({
      ownerCompleteDesignApproval: true,
      boundProtectedOperation: true,
      amazonLinuxTcbProfile: true,
      signetIssuerRevoker: true,
      fungiLeaseAbi: true,
    }),
    authorityReleased: false,
    admissionAuthority: false,
  });
}

/** TypeScript secret-authority is forbidden on this path. Every input is refused. */
export function addSecretAuthority(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_SECRET_AUTHORITY_FORBIDDEN");
}

/** A protected-memory lifecycle is not a TypeScript kernel act. Every input is refused. */
export function bindProtectedMemoryLifecycle(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_PROTECTED_MEMORY_FORBIDDEN");
}

/** Fuse-border defaults are not written into kernel.ts. Every input is refused. */
export function wireFuseBorderIntoKernel(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_FUSE_BORDER_KERNEL_FORBIDDEN");
}

/** A kernel-default central registry check is not this package. Every input is refused. */
export function installKernelDefaultRegistryCheck(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_CENTRAL_REGISTRY_KERNEL_FORBIDDEN");
}

/** bindGovernedRuntime is not a CreateAppKernelOptions field. Every input is refused. */
export function bindGovernedRuntime(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_GOVERNED_RUNTIME_WIRE_FORBIDDEN");
}

/** A durable replay store is not this kernel. Every input is refused. */
export function installDurableReplayStore(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_DURABLE_REPLAY_FORBIDDEN");
}

/** Live queue enqueue is not the descriptor contract. Every input is refused. */
export function enqueueQueueJob(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_LIVE_QUEUE_FORBIDDEN");
}

/** Live Structured Await execution is not the descriptor contract. Every input is refused. */
export function executeStructuredAwait(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_LIVE_STRUCTURED_AWAIT_FORBIDDEN");
}

/** Live runtime-audit emission is not the descriptor contract. Every input is refused. */
export function emitRuntimeAuditReport(_input: unknown): AppKernelHoldRefusal {
  return refusal("APPK_LIVE_AUDIT_EMIT_FORBIDDEN");
}
