/**
 * LSP — Power fault.
 *
 * A single, deterministic error type for the Environmental Governor. The
 * `code` is a stable machine-readable identifier (e.g. `LSP-ENV-001`,
 * `LSP-CRITICAL-001`) so callers can branch on it without parsing prose.
 */
export class PowerFault extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PowerFault";
    this.code = code;
    // Keep the prototype chain correct when transpiled to ES2022 classes.
    Object.setPrototypeOf(this, PowerFault.prototype);
  }
}
