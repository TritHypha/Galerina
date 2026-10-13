// Bounded native-floor contracts (TODO pass, SuperGrok 2026-10-08).
//
// Data-only admission adapters for opaque VM/component-resource transfer, the
// first RD-0656 VEO identity envelope (return-u64 only) and memory isolation
// claims. They neither map memory nor execute guest code; see the caller-input
// boundary below before treating them as fail-closed admission.

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
const addDiagnostic = (diagnostics: RuntimePolicyDiagnostic[], diagnostic: RuntimePolicyDiagnostic): void => {
  diagnostics[diagnostics.length] = diagnostic;
};

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

// These adapters are not a JavaScript trust boundary. Catching an accessor or
// proxy exception produces a refusal, but a proxy trap may already have run;
// production callers must pass internally constructed data-only records.
export function admitVmResourceTransfer(request: VmResourceTransferRequest): RuntimePolicyVerdict {
  const d: RuntimePolicyDiagnostic[] = [];
  try {
    if (typeof request.kind !== "string" || !VM_RESOURCE_KINDS.includes(request.kind as VmResourceKindName)) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_RESOURCE_KIND", "VM resource kind must be one closed kind.", "kind"));
    }
    if (request.pointer !== undefined) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_RESOURCE_POINTER", "Opaque transfer refuses native pointers.", "pointer"));
    }
    if (request.path !== undefined) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_RESOURCE_PATH", "Opaque transfer refuses pathnames.", "path"));
    }
    if (request.machineBytes !== undefined) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_RESOURCE_NOT_CODE", "Resource identity is never machine code.", "machineBytes"));
    }
    if (request.count !== undefined) {
      const count = request.count;
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1 || count > MAX_RESOURCES_PER_LEASE) {
        addDiagnostic(d, refuse("Galerina_RUNTIME_RESOURCE_BUDGET", "At most 16 opaque resources may ride one lease.", "count"));
      }
    }
  } catch {
    return {
      allowed: false,
      diagnostics: [refuse("Galerina_RUNTIME_ADMISSION_INPUT", "Admission input access failed; refusing the request.", "$input")],
    };
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
  try {
    if (input.profile !== VEO_RETURN_U64_PROFILE) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_VEO_PROFILE", "Only the return-u64 VEO profile is admitted on this floor.", "profile"));
    }
    if (input.importCount !== 0) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_VEO_IMPORTS", "Imports belong to the general linker HOLD.", "importCount"));
    }
    if (input.relocCount !== 0) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_VEO_RELOCS", "Relocations belong to the general linker HOLD.", "relocCount"));
    }
    if (input.constructorCount !== 0) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_VEO_CONSTRUCTORS", "Constructors belong to the general linker HOLD.", "constructorCount"));
    }
    if (input.pathPresent !== false) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_VEO_PATH", "VEO admission refuses pathnames.", "pathPresent"));
    }
    const objectBytes = input.objectBytes;
    if (!(objectBytes instanceof Uint8Array) || objectBytes.length !== VEO_OBJECT_BYTES) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_VEO_OBJECT", "Bounded object is exactly 16 GVEO bytes.", "objectBytes"));
    } else {
      const magic = String.fromCharCode(
        objectBytes[0] ?? 0,
        objectBytes[1] ?? 0,
        objectBytes[2] ?? 0,
        objectBytes[3] ?? 0,
      );
      if (magic !== "GVEO" || objectBytes[4] !== 1 || objectBytes[5] !== 1) {
        addDiagnostic(d, refuse("Galerina_RUNTIME_VEO_OBJECT", "Object must be GVEO v1 return-u64.", "objectBytes"));
      }
    }
    if (input.identityComplete !== true) {
      addDiagnostic(d, refuse("Galerina_RUNTIME_VEO_IDENTITY", "Complete RD-0656 action identity is required.", "identityComplete"));
    }
  } catch {
    return {
      allowed: false,
      diagnostics: [refuse("Galerina_RUNTIME_ADMISSION_INPUT", "Admission input access failed; refusing the request.", "$input")],
    };
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
