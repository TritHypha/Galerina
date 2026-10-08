// Bounded native-floor contracts (TODO pass, SuperGrok 2026-10-08).
//
// Pure, fail-closed admission for opaque VM/component-resource transfer, the
// first RD-0656 VEO identity envelope (return-u64 only) and memory isolation
// claims. None of these functions maps memory or executes guest code.

import type { RuntimePolicyDiagnostic, RuntimePolicyVerdict } from "./runtime-contracts.js";

const refuse = (code: string, message: string, path: string): RuntimePolicyDiagnostic => ({
  code,
  severity: "error",
  message,
  path,
});
const verdictOf = (diagnostics: readonly RuntimePolicyDiagnostic[]): RuntimePolicyVerdict => ({
  allowed: diagnostics.length === 0,
  diagnostics,
});

export const VM_RESOURCE_KINDS = Object.freeze([
  "function",
  "memory",
  "table",
  "component-instance",
  "component-resource",
] as const);

export type VmResourceKindName = (typeof VM_RESOURCE_KINDS)[number];

export const MAX_RESOURCES_PER_LEASE = 16;
export const VEO_RETURN_U64_PROFILE = 1;
export const VEO_OBJECT_BYTES = 16;

export interface VmResourceTransferRequest {
  readonly kind: unknown;
  readonly pointer?: unknown;
  readonly path?: unknown;
  readonly machineBytes?: unknown;
  readonly count?: unknown;
}

export function admitVmResourceTransfer(request: VmResourceTransferRequest): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [];
  if (typeof request.kind !== "string" || !VM_RESOURCE_KINDS.includes(request.kind as VmResourceKindName)) {
    d.push(refuse("Galerina_RUNTIME_RESOURCE_KIND", "VM resource kind must be one closed kind.", "kind"));
  }
  if (request.pointer !== undefined) {
    d.push(refuse("Galerina_RUNTIME_RESOURCE_POINTER", "Opaque transfer refuses native pointers.", "pointer"));
  }
  if (request.path !== undefined) {
    d.push(refuse("Galerina_RUNTIME_RESOURCE_PATH", "Opaque transfer refuses pathnames.", "path"));
  }
  if (request.machineBytes !== undefined) {
    d.push(refuse("Galerina_RUNTIME_RESOURCE_NOT_CODE", "Resource identity is never machine code.", "machineBytes"));
  }
  if (request.count !== undefined) {
    const count = request.count;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > MAX_RESOURCES_PER_LEASE) {
      d.push(refuse("Galerina_RUNTIME_RESOURCE_BUDGET", "At most 16 opaque resources may ride one lease.", "count"));
    }
  }
  return verdictOf(d);
}

export interface VeoAdmissionInput {
  readonly profile: unknown;
  readonly importCount: unknown;
  readonly relocCount: unknown;
  readonly constructorCount: unknown;
  readonly pathPresent: unknown;
  readonly objectBytes: unknown;
  readonly identityComplete: unknown;
}

export function admitVeoReturnU64Profile(input: VeoAdmissionInput): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [];
  if (input.profile !== VEO_RETURN_U64_PROFILE) {
    d.push(refuse("Galerina_RUNTIME_VEO_PROFILE", "Only the return-u64 VEO profile is admitted on this floor.", "profile"));
  }
  if (input.importCount !== 0) {
    d.push(refuse("Galerina_RUNTIME_VEO_IMPORTS", "Imports belong to the general linker HOLD.", "importCount"));
  }
  if (input.relocCount !== 0) {
    d.push(refuse("Galerina_RUNTIME_VEO_RELOCS", "Relocations belong to the general linker HOLD.", "relocCount"));
  }
  if (input.constructorCount !== 0) {
    d.push(refuse("Galerina_RUNTIME_VEO_CONSTRUCTORS", "Constructors belong to the general linker HOLD.", "constructorCount"));
  }
  if (input.pathPresent !== false) {
    d.push(refuse("Galerina_RUNTIME_VEO_PATH", "VEO admission refuses pathnames.", "pathPresent"));
  }
  if (!(input.objectBytes instanceof Uint8Array) || input.objectBytes.length !== VEO_OBJECT_BYTES) {
    d.push(refuse("Galerina_RUNTIME_VEO_OBJECT", "Bounded object is exactly 16 GVEO bytes.", "objectBytes"));
  } else {
    const magic = String.fromCharCode(
      input.objectBytes[0] ?? 0,
      input.objectBytes[1] ?? 0,
      input.objectBytes[2] ?? 0,
      input.objectBytes[3] ?? 0,
    );
    if (magic !== "GVEO" || input.objectBytes[4] !== 1 || input.objectBytes[5] !== 1) {
      d.push(refuse("Galerina_RUNTIME_VEO_OBJECT", "Object must be GVEO v1 return-u64.", "objectBytes"));
    }
  }
  if (input.identityComplete !== true) {
    d.push(refuse("Galerina_RUNTIME_VEO_IDENTITY", "Complete RD-0656 action identity is required.", "identityComplete"));
  }
  return verdictOf(d);
}

export function admitGeneralVeoLinker(): RuntimePolicyVerdict {
  return verdictOf([
    refuse(
      "Galerina_RUNTIME_VEO_GENERAL_LINKER",
      "The general RD-0656 object/linker profile is unavailable.",
      "profile",
    ),
  ]);
}

export type IsolationClaimName =
  | "forged-handle"
  | "cross-table-handle"
  | "resource-as-machine-code"
  | "writable-and-executable"
  | "logical-wipe-verified"
  | "physical-media-wipe";

export function admitIsolationClaim(claim: IsolationClaimName): RuntimePolicyVerdict {
  if (claim === "logical-wipe-verified") {
    return verdictOf([]);
  }
  if (claim === "physical-media-wipe") {
    return verdictOf([
      refuse(
        "Galerina_RUNTIME_MEMORY_PHYSICAL_ERASURE",
        "Physical media erasure is unproven from this userspace floor.",
        "claim",
      ),
    ]);
  }
  if (claim === "resource-as-machine-code") {
    return verdictOf([
      refuse("Galerina_RUNTIME_RESOURCE_NOT_CODE", "Resource identity is never machine code.", "claim"),
    ]);
  }
  if (claim === "writable-and-executable") {
    return verdictOf([
      refuse("Galerina_RUNTIME_MEMORY_WX", "Writable-and-executable mappings are refused.", "claim"),
    ]);
  }
  return verdictOf([
    refuse("Galerina_RUNTIME_RESOURCE_HANDLE", "Hostile or foreign handles are refused.", "claim"),
  ]);
}

export function claimPhysicalErasure(): RuntimePolicyVerdict {
  return admitIsolationClaim("physical-media-wipe");
}
