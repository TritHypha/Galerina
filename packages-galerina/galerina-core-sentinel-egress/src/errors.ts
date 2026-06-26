/**
 * LSEG (Sentinel Egress) error types.
 *
 * Two distinct governed-boundary failure classes, mirroring the LSIO contract:
 *
 *  - {@link HardenedBorderViolation} — an *integrity* / containment failure at the
 *    hardened border. For the egress sink this is the class reserved for a write
 *    that cannot be made tamper-evident (e.g. the ledger directory is not the
 *    governed egress seam, or a chain head cannot be established). These MUST stop
 *    egress rather than fall back to ad-hoc, unattested writes.
 *
 *  - {@link SecurityTrap} — a *structural / contract* violation detected before any
 *    record is trusted (bad capacity, bad batch size, malformed config). These are
 *    caller / wiring faults.
 *
 * Both carry a stable machine-readable `code` (e.g. "EGR-RING-001") so the Governed
 * Tower can route on the code rather than the message string.
 */

export class HardenedBorderViolation extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HardenedBorderViolation";
    this.code = code;
    // Restore prototype chain when targeting ES2022 transpile-to-class output.
    Object.setPrototypeOf(this, HardenedBorderViolation.prototype);
  }
}

export class SecurityTrap extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SecurityTrap";
    this.code = code;
    Object.setPrototypeOf(this, SecurityTrap.prototype);
  }
}
