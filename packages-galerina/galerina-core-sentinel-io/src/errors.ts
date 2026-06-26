/**
 * LSIO error types.
 *
 * Two distinct governed-boundary failure classes:
 *
 *  - {@link HardenedBorderViolation} — an *integrity* / containment failure at the
 *    hardened border (a manifest block whose bytes do not match its expected
 *    digest, or a future-seam facility that is not present in this build). These
 *    are the "the data crossing the border is not what the manifest swore it
 *    would be" failures. They MUST stop ingestion.
 *
 *  - {@link SecurityTrap} — a *structural / contract* violation detected before any
 *    bytes are trusted (malformed manifest, out-of-range bus read, source buffer
 *    too small for the manifest). These are caller/wiring faults.
 *
 * Both carry a stable machine-readable `code` (e.g. "LSIO-INTEGRITY-001") so the
 * Governed Tower can route on the code rather than the message string.
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
