/**
 * #195 — OS/HW-compromised security posture.
 *
 * Part of the Zero Trust Framework bar ("OS/hardware treated as potentially
 * compromised, adaptively"). Posture is `off | auto | on`, default `auto`, and
 * `auto` is FAIL-SECURE: when the environment is production/staging or unknown
 * it resolves to `on`; only an explicit development/test environment relaxes to
 * `off`. `on` engages the hostile-host controls (distrust host clock/RNG,
 * require attestation, seal egress at the app layer, zeroize buffers after use).
 *
 * This module is pure config logic — it decides WHICH controls apply. Enforcing
 * them is the runtime/App Kernel's job (P1 consumes `resolvePosture`).
 */
import type { EnvironmentMode } from "./index.js";

export const SECURITY_POSTURES = ["off", "auto", "on"] as const;
export type SecurityPosture = (typeof SECURITY_POSTURES)[number];

/** Default posture — adaptive and fail-secure. */
export const DEFAULT_SECURITY_POSTURE: SecurityPosture = "auto";

/** The hostile-host countermeasures a resolved posture turns on. */
export interface PostureControls {
  /** Reject the host OS clock; require signed / monotonic time. */
  readonly distrustHostTime: boolean;
  /** Require TEE / enclave attestation before admitting the runtime. */
  readonly requireAttestation: boolean;
  /** Reject host RNG; require a verified entropy source. */
  readonly distrustHostEntropy: boolean;
  /** Seal egress at the application layer before it touches host network buffers. */
  readonly sealEgress: boolean;
  /** Wipe arenas / buffers after each request (no residual host-readable state). */
  readonly zeroizeAfterUse: boolean;
}

export interface ResolvedPosture {
  readonly requested: SecurityPosture;
  readonly effective: "off" | "on";          // `auto` resolves to one of these
  readonly env: EnvironmentMode | "unknown";
  readonly failSecure: boolean;              // true when auto/unknown/invalid forced `on`
  readonly controls: PostureControls;
  readonly rationale: string;
}

const CONTROLS_ON: PostureControls = {
  distrustHostTime: true,
  requireAttestation: true,
  distrustHostEntropy: true,
  sealEgress: true,
  zeroizeAfterUse: true,
};

const CONTROLS_OFF: PostureControls = {
  distrustHostTime: false,
  requireAttestation: false,
  distrustHostEntropy: false,
  sealEgress: false,
  zeroizeAfterUse: false,
};

export function isSecurityPosture(v: unknown): v is SecurityPosture {
  return v === "off" || v === "auto" || v === "on";
}

/** Environments where `auto` may relax to `off`. Everything else → `on`. */
const RELAXABLE: ReadonlySet<string> = new Set(["development", "test"]);

/**
 * Resolve the effective posture and the controls it implies.
 *
 * - Invalid / unknown input → `on` (fail-secure) — never silently trusted.
 * - `on`  → always `on`.
 * - `off` → always `off` (dev/test convenience; never appropriate for production).
 * - `auto` → `off` ONLY in development/test; production/staging/unknown → `on`.
 */
export function resolvePosture(
  requested: SecurityPosture | string | undefined,
  env: EnvironmentMode | "unknown" = "unknown",
): ResolvedPosture {
  if (requested !== undefined && !isSecurityPosture(requested)) {
    return {
      requested: "on",
      effective: "on",
      env,
      failSecure: true,
      controls: CONTROLS_ON,
      rationale: `Invalid posture "${String(requested)}" — defaulting to 'on' (fail-secure).`,
    };
  }

  const req: SecurityPosture = (requested as SecurityPosture) ?? DEFAULT_SECURITY_POSTURE;

  if (req === "on") {
    return {
      requested: req, effective: "on", env, failSecure: false, controls: CONTROLS_ON,
      rationale: "Posture 'on' — full hostile-host controls engaged.",
    };
  }
  if (req === "off") {
    return {
      requested: req, effective: "off", env, failSecure: false, controls: CONTROLS_OFF,
      rationale: "Posture 'off' — host trusted (dev/test only; not for production).",
    };
  }

  // `auto` — adaptive and fail-secure.
  const relax = RELAXABLE.has(env);
  return {
    requested: req,
    effective: relax ? "off" : "on",
    env,
    failSecure: !relax,
    controls: relax ? CONTROLS_OFF : CONTROLS_ON,
    rationale: relax
      ? `Posture 'auto' relaxed to 'off' in ${env}.`
      : `Posture 'auto' resolved to 'on' (fail-secure) for ${env === "unknown" ? "unknown env" : env}.`,
  };
}

// ── Import-admission profile (R&D 0051) ──────────────────────────────────────
// The verified-import HYBRID, bound to the posture (NOT a separate knob): production / mesh use
// signed-hash admission; dev/test may use a file-path / unsigned import. TAMPER (hash mismatch or
// invalid signature) is denied in EVERY posture by the loader gates — this profile only decides
// whether an UNSIGNED / file-path import is admissible at all.

/** The import-admission policy derived from a resolved posture. */
export interface ImportProfile {
  /** Production / mesh: an import MUST carry a verifying signature (signed-hash admission). */
  readonly requireSignature: boolean;
  /** Dev/test only: a file-path / unsigned import is permitted. */
  readonly allowFilePath: boolean;
  /** The effective posture this was derived from. */
  readonly posture: "off" | "on";
  readonly rationale: string;
}

/**
 * Derive the import-admission profile from a resolved posture. Fail-secure: ONLY an explicit
 * effective `off` (dev/test) relaxes to allow unsigned / file-path imports; `on` (prod/staging/
 * unknown/invalid) requires a signature. Tamper is always denied by the loader regardless.
 */
export function deriveImportProfile(resolved: ResolvedPosture): ImportProfile {
  const requireSignature = resolved.effective === "on";
  return {
    requireSignature,
    allowFilePath: !requireSignature,
    posture: resolved.effective,
    rationale: requireSignature
      ? `Posture '${resolved.effective}': imports must be signed (signed-hash admission for prod/mesh).`
      : `Posture 'off': file-path / unsigned imports permitted (dev/test only).`,
  };
}
