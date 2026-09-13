// =============================================================================
// Galerina — Governed memory-residency hardening (RD-0358), PROTOTYPE
//
// Design + rationale: ../ZTF-Knowledge-Bases/galerina-rd-0358-governed-memory-
//   residency-dataflow-tri-photonic.md  ·  build-sheet: ../ZTF-Knowledge-Bases/
//   HANDOVER-governed-memory-residency-hardening-auto-2026-07-11.md
//
// WHAT THIS IS (the honest scope — read before trusting it):
//   A value's MAXIMUM memory-residency tier is a governed, fail-closed property,
//   AUTO-DERIVED from what the type system already knows (Secret/Tainted/secret.read),
//   invisible for the common case, explicit only at the exceptions. This module is
//   the PURE derivation + reconciliation core: H-1 (auto-derive), H-2 (residency
//   ceiling lattice + fail-closed honour check), H-5 (the host-seam capability
//   contract), H-7 (only-tightens; an audited opt-out to loosen), the M6 injection-
//   determinism fingerprint (HV1/HV9), and the HV3 `--show-derived` serializer.
//
// WHAT THIS IS NOT (stubbed / partial — never claimed as done):
//   • The RD-0337 epistemic type-state composition (a proven spill re-types the value
//     `Refuted`/`Tainted`, contagiously) is a STUB (see RD0337_TYPESTATE_STUB). The
//     prototype REJECTS an unhonourable ceiling fail-closed instead; the softer
//     governed-downgrade-that-re-types is wired once RD-0337 lands.
//   • The `fingerprint()` here is a DETERMINISM digest (M6/HV1/HV9), NOT a cryptographic
//     signature — HV2 (a post-signature inject fails artifact verification) needs the
//     real signer and is design-stage on this branch.
//   • Actual placement/`mlock`/zeroize EXECUTION is host + #143-switch territory. These
//     are checker-verified SHADOWS: the derivation is proven, the enforcement is not
//     build-wired until the execution switch (#143), exactly like the Stage-6 twins.
//   • H-4 constant-time is UNDECIDABLE in general (RD-0358 §7 HV4). The checkable subset
//     lives in the verifier; FUNGI_HARDEN_006 flags the common case and the doc states
//     what it does NOT prove.
//
// STRIP-LIST (binding, from the RD): photonic = a classical accelerator (dataflow half
//   only, never secrets); tri/K3 = a classical governor; no "unhackable" — this shrinks
//   and governs a memory-attack surface, it never zeroes it.
// =============================================================================

// ---------------------------------------------------------------------------
// Diagnostic codes (UPPER_SNAKE names — audit-diagnostic-codes V5 compliant;
// registered in ../ZTF-Knowledge-Bases/compiler-diagnostics.md).
// ---------------------------------------------------------------------------

/** FUNGI-HARDEN-001: an explicit `hardening { residency <x> }` value is not a recognised tier. */
export const FUNGI_HARDEN_001 = {
  code: "FUNGI-HARDEN-001",
  name: "UNKNOWN_RESIDENCY_TIER",
  severity: "error" as const,
  message: "hardening { residency … } declares an unrecognised tier. Valid ceilings (strictest first): register_only | no_dram_spill | no_swap | no_disk.",
} as const;

/** FUNGI-HARDEN-002: an explicit `hardening { erase <x> }` value is not a recognised mode. */
export const FUNGI_HARDEN_002 = {
  code: "FUNGI-HARDEN-002",
  name: "UNKNOWN_ERASE_MODE",
  severity: "error" as const,
  message: "hardening { erase … } declares an unrecognised mode. Valid modes: on_exit | none.",
} as const;

/** FUNGI-HARDEN-003: an explicit `hardening { timing <x> }` value is not a recognised discipline. */
export const FUNGI_HARDEN_003 = {
  code: "FUNGI-HARDEN-003",
  name: "UNKNOWN_TIMING_DISCIPLINE",
  severity: "error" as const,
  message: "hardening { timing … } declares an unrecognised discipline. Valid disciplines: constant | unconstrained.",
} as const;

/** FUNGI-HARDEN-004 (H-7): a secret's auto-derived default was LOOSENED without the audited opt-out. */
export const FUNGI_HARDEN_004 = {
  code: "FUNGI-HARDEN-004",
  name: "HARDENING_LOOSEN_NOT_AUDITED",
  severity: "error" as const,
  message: "An explicit hardening block loosens a secret's auto-derived default. Loosening a secret is a visible, audited, deny-by-default act — add `audited_loosen` (governance may still refuse it), or remove the weaker directive.",
} as const;

/** FUNGI-HARDEN-005 (H-2 / HV5): the effective residency ceiling cannot be honoured by the declared host → REJECT. */
export const FUNGI_HARDEN_005 = {
  code: "FUNGI-HARDEN-005",
  name: "RESIDENCY_CEILING_UNHONOURABLE",
  severity: "error" as const,
  message: "The declared host cannot honour this residency ceiling. Fail-closed: a value that would be forced to spill past its ceiling is REJECTED, never silently spilled. Declare a capable host seam, or relax the ceiling with an audited opt-out.",
} as const;

/** FUNGI-HARDEN-006 (H-4, HONESTLY PARTIAL): a secret-dependent branch/index under a `timing constant` obligation. */
export const FUNGI_HARDEN_006 = {
  code: "FUNGI-HARDEN-006",
  name: "SECRET_DEPENDENT_TIMING",
  severity: "warning" as const,
  message: "A secret-dependent branch or index was found under a `timing constant` obligation — a cache/timing side-channel (RD-0358 §2). NOTE: constant-time is undecidable in general; this flags the checkable subset only and does NOT prove constant-time.",
} as const;

/** FUNGI-HARDEN-007 (HV5, RD-0337 composition): a proven spill re-types the value `Refuted` (contagious). */
export const FUNGI_HARDEN_007 = {
  code: "FUNGI-HARDEN-007",
  name: "SPILL_REFUTED",
  severity: "error" as const,
  message: "The value provably spills past its residency ceiling, so its compile-time type-state is downgraded to `Refuted` (sticky + contagious, RD-0337) — it can no longer be released at a trust boundary, and anything derived from it inherits the refutation. This is the governed downgrade (RD-0358 §3-2), not a silent spill.",
} as const;

/**
 * FUNGI-HARDEN-008 (BOB-M1): `register_only` (or `no_dram_spill`) residency is declared but the
 * runtime mlock/VirtualLock enforcement is not yet wired (post-#143 execution cutover).
 * The compile-time governance declaration is still valuable — it closes the declare-and-forget
 * silent gap — but production operators must know the declaration is currently asserted, not enforced.
 * Suppressable with `@allow_residency_unenforceable` on the specific hardening block.
 */
export const FUNGI_HARDEN_008 = {
  code: "FUNGI-HARDEN-008",
  name: "RESIDENCY_NOT_ENFORCED_AT_RUNTIME",
  severity: "warning" as const,
  message:
    "Residency ceiling `register_only` or `no_dram_spill` declared, but host-level mlock/VirtualLock " +
    "enforcement is not yet wired (post-#143). The compile-time declaration is authoritative — " +
    "the runtime enforcement gap must be tracked. Suppress with @allow_residency_unenforceable " +
    "after reviewing, or wait for #143 to land.",
} as const;

/** Every hardening diagnostic constant — for registry tests + tooling. */
export const HARDENING_DIAGNOSTICS = [
  FUNGI_HARDEN_001, FUNGI_HARDEN_002, FUNGI_HARDEN_003,
  FUNGI_HARDEN_004, FUNGI_HARDEN_005, FUNGI_HARDEN_006, FUNGI_HARDEN_007,
  FUNGI_HARDEN_008,
] as const;

// ---------------------------------------------------------------------------
// The residency lattice + the derived hardening record.
// ---------------------------------------------------------------------------

/** A residency CEILING — the loosest tier a value's storage may reach. Deny-by-default. */
export type ResidencyTier =
  | "register_only"   // registers only — never L-cache/DRAM/swap/disk (the extreme; opt-in)
  | "no_dram_spill"   // registers + on-package SRAM/cache — never DRAM
  | "no_swap"         // may touch DRAM but NEVER swap/disk (mlock) — the derived secret default
  | "no_disk"         // may swap but NEVER persist to disk
  | "unrestricted";   // no ceiling (the non-secret default)

export type EraseMode = "on_exit" | "none";
export type TimingDiscipline = "constant" | "unconstrained";
export type Substrate = "binary" | "any";
export type Provenance = "auto-derived" | "explicit-tighten" | "audited-loosen" | "none";

/** The derived (or reconciled) hardening for a value/flow — the injected contract. */
export interface DerivedHardening {
  readonly residency: ResidencyTier;
  readonly erase: EraseMode;
  readonly timing: TimingDiscipline;
  readonly substrate: Substrate;
  readonly provenance: Provenance;
  /** What triggered the derivation (e.g. ["Secret<T>", "secret.read effect"]); empty for a non-secret. */
  readonly triggers: readonly string[];
}

/**
 * Strictness RANK of a residency ceiling — LOWER = stricter (0 = register_only, the tightest).
 * The lattice is a total order; "only-tightens" (RD-0358 §3c-2) = never adopt a HIGHER rank than
 * the derived floor for a secret. `unrestricted` is the top (rank 4) = no ceiling at all.
 */
const RESIDENCY_RANK: Record<ResidencyTier, number> = {
  register_only: 0,
  no_dram_spill: 1,
  no_swap: 2,
  no_disk: 3,
  unrestricted: 4,
};

export const VALID_RESIDENCY: ReadonlySet<string> = new Set(Object.keys(RESIDENCY_RANK));
export const VALID_ERASE: ReadonlySet<string> = new Set<EraseMode>(["on_exit", "none"]);
export const VALID_TIMING: ReadonlySet<string> = new Set<TimingDiscipline>(["constant", "unconstrained"]);
export const VALID_SUBSTRATE: ReadonlySet<string> = new Set<Substrate>(["binary", "any"]);

/** The stricter (lower-rank) of two residency ceilings — the tighten combinator. */
export function stricterResidency(a: ResidencyTier, b: ResidencyTier): ResidencyTier {
  return RESIDENCY_RANK[a] <= RESIDENCY_RANK[b] ? a : b;
}

/** True when `tier` is at least as strict as `floor` (rank ≤). Used to detect a loosen (H-7). */
export function atLeastAsStrict(tier: ResidencyTier, floor: ResidencyTier): boolean {
  return RESIDENCY_RANK[tier] <= RESIDENCY_RANK[floor];
}

// ---------------------------------------------------------------------------
// H-1 — auto-derivation. The pure function H = f(τ, ε) (RD-0358 §8 M6).
// ---------------------------------------------------------------------------

/** The signal the type/effect system already carries — the ONLY input to auto-derivation. */
export interface HardeningSignal {
  readonly isSecret: boolean;            // the value is typed Secret<T>
  readonly isTainted: boolean;           // the value is Tainted<T>
  readonly hasSecretReadEffect: boolean; // the flow declares a secret.read / secret.* effect
}

/** The auto-derived secret floor (RD-0358 §2/§3b): the strictest hardening a secret implies. */
const SECRET_FLOOR: DerivedHardening = {
  residency: "no_swap",
  erase: "on_exit",
  timing: "constant",
  substrate: "binary",
  provenance: "auto-derived",
  triggers: [],
};

/** The non-secret default: no ceiling, no ceremony (the common case — the dev writes nothing). */
const NO_HARDENING: DerivedHardening = {
  residency: "unrestricted",
  erase: "none",
  timing: "unconstrained",
  substrate: "any",
  provenance: "none",
  triggers: [],
};

/**
 * H-1 — derive the STRICTEST hardening the type/effect implies, deterministically and purely.
 * A `Secret<T>` · `Tainted<T>` · a `secret.read` effect → the secret floor (no_swap + on_exit +
 * constant + binary), with ZERO developer annotation. Everything else → no hardening. This is
 * `f(τ, ε)` (M6): same input → byte-identical output, so the CI differential (HV1/HV9) is total.
 */
export function deriveAuto(signal: HardeningSignal): DerivedHardening {
  const triggers: string[] = [];
  if (signal.isSecret) triggers.push("Secret<T>");
  if (signal.isTainted) triggers.push("Tainted<T>");
  if (signal.hasSecretReadEffect) triggers.push("secret.read effect");
  if (triggers.length === 0) return NO_HARDENING;
  return { ...SECRET_FLOOR, triggers };
}

// ---------------------------------------------------------------------------
// H-2 / H-7 — reconcile an explicit `hardening {}` block with the auto floor.
// Tighten is always allowed; LOOSENING a secret's derived default requires the
// audited opt-out (H-7), else it is a fail-closed rejection.
// ---------------------------------------------------------------------------

/** A parsed explicit `hardening {}` block (any dimension may be omitted). */
export interface ExplicitHardening {
  readonly residency?: ResidencyTier;
  readonly erase?: EraseMode;
  readonly timing?: TimingDiscipline;
  readonly substrate?: Substrate;
  /** the `audited_loosen` opt-out token was present (H-7). */
  readonly auditedLoosen: boolean;
}

export interface Rejection {
  readonly code: string;
  readonly name: string;
  readonly reason: string;
}

export interface ReconcileResult {
  readonly effective: DerivedHardening;
  readonly rejections: readonly Rejection[];
}

/**
 * Reconcile the auto-derived floor with an explicit block. Rules (RD-0358 §3/§3c):
 *   • TIGHTEN (explicit stricter than derived) → always adopt; provenance = explicit-tighten.
 *   • LOOSEN a SECRET's derived default (explicit weaker) → requires `audited_loosen`; without it,
 *     a FUNGI-HARDEN-004 rejection (H-7) and the DERIVED value is kept (fail-closed, never weaker).
 *   • A non-secret setting its own (looser) ceiling is fine — it had no floor to loosen.
 */
export function reconcileExplicit(
  auto: DerivedHardening,
  explicit: ExplicitHardening,
): ReconcileResult {
  const rejections: Rejection[] = [];
  const isSecret = auto.provenance === "auto-derived";
  let provenance: Provenance = auto.provenance;

  // Residency — the lattice-ordered dimension.
  let residency = auto.residency;
  if (explicit.residency !== undefined) {
    if (atLeastAsStrict(explicit.residency, auto.residency)) {
      // tighten (or equal): adopt the explicit ceiling
      if (RESIDENCY_RANK[explicit.residency] < RESIDENCY_RANK[auto.residency]) provenance = "explicit-tighten";
      residency = explicit.residency;
    } else if (isSecret && !explicit.auditedLoosen) {
      rejections.push({
        code: FUNGI_HARDEN_004.code, name: FUNGI_HARDEN_004.name,
        reason: `residency ${explicit.residency} is weaker than the auto-derived ${auto.residency} for a secret — loosening requires \`audited_loosen\`.`,
      });
      // keep the stricter derived ceiling (fail-closed)
    } else {
      // audited loosen, or a non-secret's own ceiling
      residency = explicit.residency;
      if (isSecret) provenance = "audited-loosen";
    }
  }

  // Erase / timing / substrate — two-valued (strict vs lax). Same only-tighten discipline.
  const erase = pickTwoValued(auto.erase, explicit.erase, "on_exit", isSecret, explicit.auditedLoosen, rejections, "erase");
  const timing = pickTwoValued(auto.timing, explicit.timing, "constant", isSecret, explicit.auditedLoosen, rejections, "timing");
  const substrate = pickTwoValued(auto.substrate, explicit.substrate, "binary", isSecret, explicit.auditedLoosen, rejections, "substrate");
  if (erase.changed || timing.changed || substrate.changed) {
    if (provenance === "auto-derived") provenance = "explicit-tighten";
  }
  if (erase.loosened || timing.loosened || substrate.loosened) provenance = "audited-loosen";

  return {
    effective: { residency, erase: erase.value as EraseMode, timing: timing.value as TimingDiscipline, substrate: substrate.value as Substrate, provenance, triggers: auto.triggers },
    rejections,
  };
}

/** Shared reconciler for a two-valued dimension (strictValue is the tight pole). */
function pickTwoValued<T extends string>(
  autoVal: T, explicitVal: T | undefined, strictValue: T,
  isSecret: boolean, auditedLoosen: boolean, rejections: Rejection[], dim: string,
): { value: T; changed: boolean; loosened: boolean } {
  if (explicitVal === undefined || explicitVal === autoVal) return { value: autoVal, changed: false, loosened: false };
  const explicitIsStrict = explicitVal === strictValue;
  const autoIsStrict = autoVal === strictValue;
  if (explicitIsStrict && !autoIsStrict) return { value: explicitVal, changed: true, loosened: false }; // tighten
  // explicit is the lax pole while auto is strict → a loosen
  if (isSecret && !auditedLoosen) {
    rejections.push({
      code: FUNGI_HARDEN_004.code, name: FUNGI_HARDEN_004.name,
      reason: `${dim} ${explicitVal} is weaker than the auto-derived ${autoVal} for a secret — loosening requires \`audited_loosen\`.`,
    });
    return { value: autoVal, changed: false, loosened: false }; // fail-closed: keep strict
  }
  return { value: explicitVal, changed: false, loosened: isSecret };
}

// ---------------------------------------------------------------------------
// H-5 — the host-seam capability contract. A residency ceiling is only real if
// the host provides the primitive (mlock/no-swap/register-pin/no-persist). An
// UNDECLARED or incapable host FAILS CLOSED (H-6): the ceiling is unhonourable.
// ---------------------------------------------------------------------------

/** Key custody level (RD-0365): how strongly the host protects signing key material at rest.
 *  Each rung is strictly stronger:
 *    env-spore   — sealed-at-rest (env.spore SealArena); current shipped baseline (L1).
 *    os-keystore — OS keystore wraps the KEK (Windows DPAPI / macOS keychain); L2.
 *    tpm-sealed  — TPM 2.0 PCR-sealed KEK; key is bound to machine + measured boot; L3.
 *    hardware-signer — key never leaves TPM/HSM/YubiKey; signing happens inside device; L4.
 *  A host claiming a rung it cannot prove is refused at custody admission (H-5/H-6). */
export type KeyCustody = "env-spore" | "os-keystore" | "tpm-sealed" | "hardware-signer";

export interface HostResidencyCapability {
  readonly name: string;
  readonly canRegisterPin: boolean; // TRESOR-class register residency
  readonly canNoDramSpill: boolean; // on-package SRAM pinning, no DRAM
  readonly canNoSwap: boolean;      // mlock / MADV_DONTDUMP — never swap
  readonly canNoDisk: boolean;      // never persist to disk
  /** RD-0365 key custody level. This is a profile claim, never proof by itself: the
   *  `evaluateKeyCustody` admission seam requires a current native attestation for
   *  os-keystore, tpm-sealed and hardware-signer. Defaults to "env-spore" (the
   *  current shipped baseline) so existing profiles remain explicitly unenforced. */
  readonly keyCustody: KeyCustody;
}

/** Fail-closed default (H-6): no declared seam ⇒ NOTHING is guaranteed ⇒ any ceiling is unhonourable. */
export const UNKNOWN_HOST: HostResidencyCapability = Object.freeze({
  name: "<undeclared>", canRegisterPin: false, canNoDramSpill: false, canNoSwap: false, canNoDisk: false,
  keyCustody: "env-spore",
});

/**
 * Declared host seams (H-5). The names a `hardening { host <name> }` directive may reference.
 * These are the CONTRACT (design-stage); the actual syscalls live behind the framework-app-kernel
 * 9-primitive floor seam (a platform without the primitive resolves to UNKNOWN_HOST → fail-closed).
 *
 * keyCustody (RD-0365): the rung a host profile requests. The label is never evidence by itself:
 * `evaluateKeyCustody` below requires a current attestation and an injected verifier before any
 * rung above the env-spore baseline is admitted. This compiler module deliberately does not speak
 * TPM protocols or create quotes; that remains a native/platform responsibility behind the seam.
 */
const HOST_PROFILE_MAP = new Map<string, HostResidencyCapability>([
  // POSIX mlock: guarantees no-swap + no-disk; cannot pin to registers or forbid DRAM.
  ["mlock_posix", { name: "mlock_posix", canRegisterPin: false, canNoDramSpill: false, canNoSwap: true, canNoDisk: true, keyCustody: "env-spore" }],
  // A hypothetical register-pinned target (TRESOR-class) — honours every ceiling. Design-stage.
  // keyCustody: "hardware-signer" because a register-pinned target implies an HSM for key ops.
  ["register_pinned", { name: "register_pinned", canRegisterPin: true, canNoDramSpill: true, canNoSwap: true, canNoDisk: true, keyCustody: "hardware-signer" }],
  // Browser / WASM secure context: JavaScript sandbox guarantees no persistent disk writes (no filesystem
  // access from WASM without an explicit JS host bridge). Cannot mlock (no syscall surface), cannot forbid
  // DRAM. Satisfies `no_disk` only — the ceiling for browser-deployed WASM flows handling secrets.
  // Note: the "no persistent disk" guarantee is the browser sandbox, not a kernel primitive; this seam
  // is only appropriate for in-browser WASM deployments (target-wasm + browser runtime).
  // keyCustody: "env-spore" — browser sessions cannot provide TPM/HSM; L1 is the ceiling.
  ["browser_secure_context", { name: "browser_secure_context", canRegisterPin: false, canNoDramSpill: false, canNoSwap: false, canNoDisk: true, keyCustody: "env-spore" }],
]);

// Host capability records are registry-owned identities. Freeze each record so callers cannot
// mutate a profile after it has been resolved; evaluateKeyCustody also requires this exact object.
for (const profile of HOST_PROFILE_MAP.values()) Object.freeze(profile);
const CANONICAL_HOST_PROFILES: ReadonlyMap<string, HostResidencyCapability> = HOST_PROFILE_MAP;
// Expose a compatibility snapshot for diagnostics/tests. Admission never trusts this mutable view;
// it compares against the private canonical registry above.
export const HOST_PROFILES: ReadonlyMap<string, HostResidencyCapability> = new Map(CANONICAL_HOST_PROFILES);

/** Resolve a declared host name to its capability, fail-closed to UNKNOWN_HOST for an unknown/undeclared name. */
export function resolveHost(name: string | undefined): HostResidencyCapability {
  if (name === undefined) return UNKNOWN_HOST;
  return CANONICAL_HOST_PROFILES.get(name) ?? UNKNOWN_HOST;
}

/**
 * Versioned evidence envelope supplied by a native custody provider. The quote itself is opaque to
 * the compiler; `quoteDigest` identifies the exact quote bytes and `challengeDigest` binds that
 * quote to the admission challenge that the injected verifier checks. `hostName` prevents an
 * otherwise-valid quote from being replayed for a different declared profile. No private key,
 * quote bytes or TPM handle are stored in this module.
 */
export interface KeyCustodyAttestation {
  readonly schema: "galerina.key-custody-attestation.v1";
  readonly hostName: string;
  readonly keyCustody: Exclude<KeyCustody, "env-spore">;
  readonly pcrProfile: string;
  readonly quoteDigest: string;
  readonly challengeDigest: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

/** Native/platform verifier contract. A verifier must independently validate the quote and PCRs. */
export type KeyCustodyVerifier = (attestation: KeyCustodyAttestation, host: HostResidencyCapability) => boolean;

export interface KeyCustodyDecision {
  readonly admitted: boolean;
  readonly enforced: boolean;
  readonly reason: string;
}

const ELEVATED_CUSTODY: ReadonlySet<string> = new Set(["os-keystore", "tpm-sealed", "hardware-signer"]);
const ATTESTATION_KEYS = ["challengeDigest", "expiresAtMs", "hostName", "issuedAtMs", "keyCustody", "pcrProfile", "quoteDigest", "schema"] as const;

function validKeyCustodyAttestation(value: unknown): value is KeyCustodyAttestation {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(candidate).sort();
    if (keys.length !== ATTESTATION_KEYS.length || keys.some((key, index) => key !== ATTESTATION_KEYS[index])) return false;
    if (candidate.schema !== "galerina.key-custody-attestation.v1" || typeof candidate.hostName !== "string" || candidate.hostName.length < 1 || candidate.hostName.length > 128 || /[\u0000-\u001f\u007f]/u.test(candidate.hostName)) return false;
    if (typeof candidate.keyCustody !== "string" || !ELEVATED_CUSTODY.has(candidate.keyCustody)) return false;
    if (typeof candidate.pcrProfile !== "string" || candidate.pcrProfile.length < 1 || candidate.pcrProfile.length > 128 || /[\u0000-\u001f\u007f]/u.test(candidate.pcrProfile)) return false;
    if (typeof candidate.quoteDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(candidate.quoteDigest)) return false;
    if (typeof candidate.challengeDigest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(candidate.challengeDigest)) return false;
    if (typeof candidate.issuedAtMs !== "number" || !Number.isSafeInteger(candidate.issuedAtMs) || candidate.issuedAtMs < 0) return false;
    if (typeof candidate.expiresAtMs !== "number" || !Number.isSafeInteger(candidate.expiresAtMs) || candidate.expiresAtMs <= candidate.issuedAtMs) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Evaluate the custody claim at an admission boundary.
 *
 * The v1 env-spore baseline is admitted for a declared host with `enforced:false`; it makes no
 * hardware claim. Every elevated rung is denied unless the envelope is exact, current, matched to
 * the host and accepted by the injected native verifier. Missing, stale, malformed, mismatched or
 * verifier-failed evidence is always denied. This is an enforcement seam, not TPM evidence itself.
 */
export function evaluateKeyCustody(
  host: HostResidencyCapability,
  attestation?: KeyCustodyAttestation,
  verifier?: KeyCustodyVerifier,
  nowMs: number = Date.now(),
): KeyCustodyDecision {
  if (host === undefined || host === null || typeof host !== "object" || host.name === UNKNOWN_HOST.name) {
    return { admitted: false, enforced: false, reason: "host identity is undeclared" };
  }
  if (CANONICAL_HOST_PROFILES.get(host.name) !== host) {
    return { admitted: false, enforced: false, reason: "host capability is not a declared profile" };
  }
  if (host.keyCustody === "env-spore") {
    return { admitted: true, enforced: false, reason: "env-spore baseline does not claim hardware custody" };
  }
  if (!ELEVATED_CUSTODY.has(host.keyCustody)) {
    return { admitted: false, enforced: false, reason: "host declares an unknown custody rung" };
  }
  if (!validKeyCustodyAttestation(attestation)) {
    return { admitted: false, enforced: false, reason: "elevated custody requires a valid attestation" };
  }
  if (attestation.hostName !== host.name) {
    return { admitted: false, enforced: false, reason: "attestation host does not match declared profile" };
  }
  if (attestation.keyCustody !== host.keyCustody) {
    return { admitted: false, enforced: false, reason: "attestation custody rung does not match host" };
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < attestation.issuedAtMs || nowMs >= attestation.expiresAtMs) {
    return { admitted: false, enforced: false, reason: "custody attestation is stale or not yet valid" };
  }
  if (typeof verifier !== "function") {
    return { admitted: false, enforced: false, reason: "elevated custody has no native verifier" };
  }
  try {
    if (verifier(attestation, host) !== true) return { admitted: false, enforced: false, reason: "native custody verifier refused attestation" };
  } catch {
    return { admitted: false, enforced: false, reason: "native custody verifier failed" };
  }
  return { admitted: true, enforced: true, reason: "attested custody verified" };
}

/**
 * H-2 / HV5 — can the host honour this ceiling? Fail-closed: a ceiling the host cannot provide is
 * REJECTED (never silently spilled). `unrestricted` is always honourable (no guarantee needed).
 */
export function canHonour(ceiling: ResidencyTier, host: HostResidencyCapability): { ok: boolean; rejection?: Rejection } {
  const need: ReadonlyMap<ResidencyTier, boolean> = new Map([
    ["register_only", host.canRegisterPin],
    ["no_dram_spill", host.canNoDramSpill],
    ["no_swap", host.canNoSwap],
    ["no_disk", host.canNoDisk],
    ["unrestricted", true],
  ]);
  if (need.get(ceiling) === true) return { ok: true };
  return {
    ok: false,
    rejection: {
      code: FUNGI_HARDEN_005.code, name: FUNGI_HARDEN_005.name,
      reason: `host "${host.name}" cannot honour residency ${ceiling} — fail-closed REJECT (would force a spill past the ceiling).`,
    },
  };
}

// ---------------------------------------------------------------------------
// RD-0337 composition — the compiler-side epistemic trit (Option A, RD-0360). NO LONGER STUBBED.
//
// The runtime carries this trit in `galerina-tower-citizen/src/epistemic-type-state.ts`. The compiler
// is UPSTREAM of the runtime (core-compiler has no `tower-citizen` dependency and must not — that would
// invert the layer), so it carries its OWN mirror of the same RD-0337 trit here. The two are held in
// lock-step by a MANDATORY fail-closed conformance gate (compiler-trit ≡ runtime-trit) in tower-citizen's
// tests (`tests/hardening-trit-conformance.test.mjs`) — without it the two impls could drift (the
// compiler could rule a value `Trusted` that the runtime would `Refute`), so it is DoD at HV-suite rank.
//
// Encoding is byte-identical to the runtime `Verdict`/`Trust`: PROVEN = +1, UNKNOWN = 0, REFUTED = -1.
// ---------------------------------------------------------------------------

/** The compiler-side epistemic trust trit — the same balanced trit as the runtime `Trust`/`Verdict`. */
export type CompilerTrust = 1 | 0 | -1;
export const CompilerTrust = {
  PROVEN: 1 as const,   // +1 — proof discharged; trusted here (runtime Trust.PROVEN / Verdict.ALLOW)
  UNKNOWN: 0 as const,  //  0 — not yet proven; the FAIL-CLOSED default (runtime Trust.UNKNOWN / INDETERMINATE)
  REFUTED: -1 as const, // -1 — proven-bad; a sticky hard negative (runtime Trust.REFUTED / Verdict.DENY)
} as const;

/** The compile-time value-state NAME (EPISTEMIC_RESERVED) for a trit — the name-map the gate asserts. */
export function trustName(t: CompilerTrust): "Trusted" | "Unverified" | "Refuted" {
  return t === 1 ? "Trusted" : t === 0 ? "Unverified" : "Refuted";
}

/** refute — mark a value proven-bad. Sticky: `dischargeTrust` can never lift a REFUTED (No-Coercion). */
export function refute(): CompilerTrust {
  return CompilerTrust.REFUTED;
}

/**
 * combineTrust — the K3 conjunction (min-trit / vAnd): the LEAST-trusted operand wins, contagiously.
 * `Trusted`+`Unverified` → `Unverified`; anything+`Refuted` → `Refuted`. An untrusted operand can only
 * LOWER the result, never manufacture trust (No-Coercion). The exact algebra of the runtime `combine()`.
 *
 * WHY this is self-contained (does not import from @galerina/core-logic):
 *   `CompilerTrust` is a numeric trit enum (REFUTED=0, UNKNOWN=1, PROVEN=2) where the K3 min is trivially
 *   `Math.min(a, b)` / `a < b ? a : b`. The `@galerina/core-logic` TriState is an object type
 *   `{kind:"true"|"false"|"unknown", reasons?:[…]}` that carries provenance chains for type-checking and
 *   lattice-proofs. Converting between them at every call site would add noise with zero semantic gain —
 *   the algebra is identical (`min(a,b)`) but the representation intentionally differs:
 *     CompilerTrust  — compiler-only, numeric, allocation-free on the hot path.
 *     TriState       — cross-package, object, reason-tracking (used in `@galerina/tower-citizen`).
 *   The conformance test suite (`galerina-tower-citizen/tests/trit-conformance.test.mjs`, 6/6) verifies
 *   that both implementations produce the same truth table. This is the correct relationship: same algebra,
 *   separate representations, conformance-tested parity. (Bob review 2026-07, item 6.)
 */
export function combineTrust(a: CompilerTrust, b: CompilerTrust): CompilerTrust {
  return (a < b ? a : b) as CompilerTrust;
}

/**
 * dischargeTrust — the ONLY sanctioned lift path (mirrors the runtime `discharge`):
 *   REFUTED stays REFUTED (sticky — a refutation can never be resurrected);
 *   verified === true → PROVEN; verified === false → REFUTED; inconclusive (`undefined`) → UNKNOWN.
 */
export function dischargeTrust(current: CompilerTrust, verified: boolean | undefined): CompilerTrust {
  if (current === CompilerTrust.REFUTED) return CompilerTrust.REFUTED;
  if (verified === undefined) return CompilerTrust.UNKNOWN;
  return verified ? CompilerTrust.PROVEN : CompilerTrust.REFUTED;
}

/** boundaryTrusted — the fail-closed trust boundary: release IFF PROVEN. UNKNOWN and REFUTED both deny. */
export function boundaryTrusted(trust: CompilerTrust): boolean {
  return trust === CompilerTrust.PROVEN;
}

/** The outcome of an unhonourable-ceiling spill: the value's new trit + the diagnostic that announces it. */
export interface SpillOutcome {
  /** The value's NEW compile-time trust after a proven spill — REFUTED (sticky + contagious). */
  readonly retypedTo: CompilerTrust;
  readonly code: string;
  readonly reason: string;
}

/**
 * spillRetype — the HV5 governed downgrade, wired FOR REAL (RD-0360 Q1 Option A; the RD-0337 stub is gone).
 * When a value provably spills past its residency ceiling (the host cannot honour it), rather than a
 * silent spill the value's compile-time TYPE-STATE becomes REFUTED — sticky and contagious: it can never
 * be discharged back to `Trusted`, `combineTrust` propagates the refutation into anything derived from it,
 * and a downstream `boundaryTrusted` release therefore DENIES. This is the "loud governed downgrade" of
 * RD-0358 §3-2, composed with the shipped RD-0337 trit (held equivalent by the conformance gate).
 */
export function spillRetype(): SpillOutcome {
  return { retypedTo: refute(), code: FUNGI_HARDEN_007.code, reason: FUNGI_HARDEN_007.message };
}

// ---------------------------------------------------------------------------
// HV3 — `--show-derived`: expose EXACTLY what was injected (auditable, deterministic).
// ---------------------------------------------------------------------------

/** Deterministic, human-readable serialization of a derived hardening (the HV3 audit surface). */
export function showDerived(h: DerivedHardening): string {
  const src = h.triggers.length > 0 ? ` (${h.provenance} from ${h.triggers.join(", ")})` : ` (${h.provenance})`;
  return [
    `hardening${src} {`,
    `  residency: ${h.residency}`,
    `  erase:     ${h.erase}`,
    `  timing:    ${h.timing}`,
    `  substrate: ${h.substrate}`,
    `}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// M6 / HV1 / HV9 — the injection-determinism fingerprint. A pure, stable digest
// of the derived hardening. NOT a cryptographic signature (that is HV2 = the real
// signer, design-stage). It makes the CI differential a total detector of a
// weakened / drifted injection: hash(f(src)) must equal the committed hash.
// ---------------------------------------------------------------------------

/** Canonical, order-fixed string form of a hardening — the fingerprint pre-image. */
export function canonicalize(h: DerivedHardening): string {
  return `residency=${h.residency};erase=${h.erase};timing=${h.timing};substrate=${h.substrate};provenance=${h.provenance};triggers=${[...h.triggers].sort().join("|")}`;
}

/** FNV-1a 32-bit over the canonical form — deterministic, dependency-free (no crypto floor needed). */
export function fingerprint(h: DerivedHardening): string {
  const s = canonicalize(h);
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    // FNV prime 16777619, kept in 32-bit unsigned via Math.imul + >>> 0
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
