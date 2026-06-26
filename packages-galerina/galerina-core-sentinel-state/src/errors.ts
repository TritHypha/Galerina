// errors.ts — LSS fault taxonomy.
//
// Two distinct failure classes, mirroring the Tower's existing vocabulary
// (sibling galerina-tower-citizen):
//
//   SecurityTrap            — an integrity violation was DETECTED. The data is
//                             present but cryptographically untrustworthy
//                             (tamper, corruption, wrong key). NEVER deserialise.
//   HardenedBorderViolation — a hardened precondition at the persistence border
//                             was breached (e.g. cold-boot expected a snapshot
//                             that does not exist). Fail closed.

/** Raised when a snapshot fails its integrity gate (checksum or HMAC). */
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

/** Raised when a hardened persistence-border precondition is violated. */
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
