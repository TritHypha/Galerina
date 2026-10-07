import type { PhotonicDiagnostic } from "../index.js";

/** Closed labels from TODO L60. Names are refusal keys, never grants. */
export const PHOTONIC_CAPABILITIES = Object.freeze([
  "OpticalExecution",
  "HybridExecution",
  "ExperimentalRouting",
  "RealtimeScheduling",
] as const);

export type PhotonicCapability = (typeof PHOTONIC_CAPABILITIES)[number];

export const PHOTONIC_CAPABILITY_REFUSED_CODE =
  "Galerina_PHOTONIC_CAPABILITY_REFUSED";
export const PHOTONIC_CAPABILITY_REFUSED_MESSAGE =
  "Photonic capabilities are never granted from this package.";

export const EXPERIMENTAL_TRANSPORT_REFUSED_CODE =
  "Galerina_PHOTONIC_EXPERIMENTAL_TRANSPORT_REFUSED";
export const EXPERIMENTAL_TRANSPORT_REFUSED_MESSAGE =
  "Experimental photonic transport is not admitted. This package never grants production deployment, a sandbox, a capability, or an audit receipt.";

const DIAGNOSTIC_SCHEMA = "fungi.photonic.diagnostic.v1" as const;

function freezeRefusal(
  code: string,
  message: string,
): PhotonicDiagnostic {
  return Object.freeze({
    schema: DIAGNOSTIC_SCHEMA,
    code,
    severity: "error",
    message,
  });
}

export function isPhotonicCapability(
  value: unknown,
): value is PhotonicCapability {
  return (
    typeof value === "string" &&
    (PHOTONIC_CAPABILITIES as readonly string[]).includes(value)
  );
}

/**
 * L61 refusal-only gate. Every capability is refused, including
 * ExperimentalRouting. Returning true would grant; this function never does.
 */
export function validateCapability(_capability: PhotonicCapability): boolean {
  void _capability;
  return false;
}

/** Typed refusal for L61. Message is constant; caller input is not echoed. */
export function refuseCapability(
  _capability: PhotonicCapability,
): PhotonicDiagnostic {
  void _capability;
  return freezeRefusal(
    PHOTONIC_CAPABILITY_REFUSED_CODE,
    PHOTONIC_CAPABILITY_REFUSED_MESSAGE,
  );
}

/** L73: experimental transport is not admitted. Always false. */
export function admitExperimentalTransport(): false {
  return false;
}

/** L73 refusal/doc. No production, sandbox, capability, or audit receipt. */
export function refuseExperimentalTransport(): PhotonicDiagnostic {
  return freezeRefusal(
    EXPERIMENTAL_TRANSPORT_REFUSED_CODE,
    EXPERIMENTAL_TRANSPORT_REFUSED_MESSAGE,
  );
}
