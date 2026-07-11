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

/** Every hardening diagnostic constant — for registry tests + tooling. */
export const HARDENING_DIAGNOSTICS = [
  FUNGI_HARDEN_001, FUNGI_HARDEN_002, FUNGI_HARDEN_003,
  FUNGI_HARDEN_004, FUNGI_HARDEN_005, FUNGI_HARDEN_006,
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

export interface HostResidencyCapability {
  readonly name: string;
  readonly canRegisterPin: boolean; // TRESOR-class register residency
  readonly canNoDramSpill: boolean; // on-package SRAM pinning, no DRAM
  readonly canNoSwap: boolean;      // mlock / MADV_DONTDUMP — never swap
  readonly canNoDisk: boolean;      // never persist to disk
}

/** Fail-closed default (H-6): no declared seam ⇒ NOTHING is guaranteed ⇒ any ceiling is unhonourable. */
export const UNKNOWN_HOST: HostResidencyCapability = {
  name: "<undeclared>", canRegisterPin: false, canNoDramSpill: false, canNoSwap: false, canNoDisk: false,
};

/**
 * Declared host seams (H-5). The names a `hardening { host <name> }` directive may reference.
 * These are the CONTRACT (design-stage); the actual syscalls live behind the framework-app-kernel
 * 9-primitive floor seam (a platform without the primitive resolves to UNKNOWN_HOST → fail-closed).
 */
export const HOST_PROFILES: ReadonlyMap<string, HostResidencyCapability> = new Map([
  // POSIX mlock: guarantees no-swap + no-disk; cannot pin to registers or forbid DRAM.
  ["mlock_posix", { name: "mlock_posix", canRegisterPin: false, canNoDramSpill: false, canNoSwap: true, canNoDisk: true }],
  // A hypothetical register-pinned target (TRESOR-class) — honours every ceiling. Design-stage.
  ["register_pinned", { name: "register_pinned", canRegisterPin: true, canNoDramSpill: true, canNoSwap: true, canNoDisk: true }],
]);

/** Resolve a declared host name to its capability, fail-closed to UNKNOWN_HOST for an unknown/undeclared name. */
export function resolveHost(name: string | undefined): HostResidencyCapability {
  if (name === undefined) return UNKNOWN_HOST;
  return HOST_PROFILES.get(name) ?? UNKNOWN_HOST;
}

/**
 * H-2 / HV5 — can the host honour this ceiling? Fail-closed: a ceiling the host cannot provide is
 * REJECTED (never silently spilled). `unrestricted` is always honourable (no guarantee needed).
 */
export function canHonour(ceiling: ResidencyTier, host: HostResidencyCapability): { ok: boolean; rejection?: Rejection } {
  const need: Record<ResidencyTier, boolean> = {
    register_only: host.canRegisterPin,
    no_dram_spill: host.canNoDramSpill,
    no_swap: host.canNoSwap,
    no_disk: host.canNoDisk,
    unrestricted: true,
  };
  if (need[ceiling]) return { ok: true };
  return {
    ok: false,
    rejection: {
      code: FUNGI_HARDEN_005.code, name: FUNGI_HARDEN_005.name,
      reason: `host "${host.name}" cannot honour residency ${ceiling} — fail-closed REJECT (would force a spill past the ceiling).`,
    },
  };
}

// ---------------------------------------------------------------------------
// RD-0337 composition — STUBBED. Do NOT read this as implemented.
// ---------------------------------------------------------------------------

/**
 * On a PROVEN spill past the ceiling, RD-0358 §3-2 wants the value's TYPE to become `Refuted`/
 * `Tainted` (contagious) — a "loud governed downgrade" rather than a hard REJECT. That composition
 * needs the epistemic type-state (RD-0337), which has not landed. Until it does, the prototype
 * takes the STRICTER fail-closed path (REJECT via FUNGI-HARDEN-005). This marker exists so the gap
 * is explicit and testable — it is NOT a working downgrade.
 */
export const RD0337_TYPESTATE_STUB = {
  status: "STUB" as const,
  requires: "RD-0337 (epistemic type-state: Trusted/Unverified/Refuted)",
  wouldRetypeTo: "Refuted | Tainted",
  note: "A proven spill should re-type the value Refuted/Tainted (contagious). Not wired — composes with RD-0337. The prototype REJECTS fail-closed (FUNGI-HARDEN-005) instead of the softer governed downgrade.",
} as const;

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
