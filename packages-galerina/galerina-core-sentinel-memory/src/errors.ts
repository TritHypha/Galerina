// errors.ts — LSM trap types.
//
// The Sentinel Memory raises hard, named traps rather than returning error
// codes. A SecurityTrap is a deterministic memory-safety / governance fault
// (alignment, bounds, exhaustion, flight-lock, ternary corruption). A
// HardenedBorderViolation is raised when code attempts to cross a sealed
// boundary that is intentionally not wired in this build (e.g. an external
// photonic bus). Both carry a stable machine-readable `code`.

/** Deterministic memory-safety / governance fault. */
export class SecurityTrap extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SecurityTrap";
    this.code = code;
    // Restore the prototype chain (instanceof safety under down-level transpile output),
    // consistent with the sibling egress/io sentinels.
    Object.setPrototypeOf(this, SecurityTrap.prototype);
  }
}

/** Attempt to cross a sealed boundary not wired in this build. */
export class HardenedBorderViolation extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "HardenedBorderViolation";
    this.code = code;
    // Restore the prototype chain (instanceof safety under down-level transpile output),
    // consistent with the sibling egress/io sentinels.
    Object.setPrototypeOf(this, HardenedBorderViolation.prototype);
  }
}
