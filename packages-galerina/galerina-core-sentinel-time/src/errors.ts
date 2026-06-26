// errors.ts — LST trap type.
//
// The Sentinel Time clock raises a hard, named fault rather than returning an
// error code. A PrecisionFault is a deterministic timing-governance violation:
// an invalid tick initialisation, a non-integer / negative advance, or a clock
// that has drifted beyond its stability envelope relative to physical time. It
// carries a stable machine-readable `code` so the audit trail can classify it.

/** Deterministic timing-governance fault (init / advance / drift). */
export class PrecisionFault extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PrecisionFault";
    this.code = code;
  }
}
