// =============================================================================
// Galerina — Secret Sink Monitor (DRCM Phase 1 — task #31)
//
// Canonical runtime implementation, wired into the interpreter's stdlib bridge
// (sink_monitor::scan / security::interim::scan) and covered by
// governance-verifier.test.mjs.
//
// Implements the cleartext sliding-window prefix scan for the DSS Secret Sink:
//   - SHA-256 hash comparison against a streaming cleartext payload is BROKEN
//     for substring detection (the hash changes entirely with adjacent bytes).
//   - CORRECT approach: store an 8-character cleartext prefix token from each
//     secret with length >= 12 in a write-only lookaside set, then check whether
//     any registered prefix appears as a SUBSTRING of the output payload. A match
//     emits SPORE-SECRET-BREACH (trap code 3001).
//
// Reference: galerina-governance-rules.md K-005
// =============================================================================

const MIN_SECRET_LENGTH = 12;
const PREFIX_TOKEN_LENGTH = 8;

/** Module-level singleton — one monitor per interpreter session */
class SecretSinkMonitor {
  readonly #prefixes = new Set<string>();

  /** Register a secret — extracts 8-char prefix if secret is ≥ 12 chars */
  register(rawSecret: string): void {
    if (rawSecret.length >= MIN_SECRET_LENGTH) {
      this.#prefixes.add(rawSecret.substring(0, PREFIX_TOKEN_LENGTH));
    }
  }

  /** Scan a payload for registered prefix substrings. Returns trap code or 0. */
  scan(payload: string): { isClean: boolean; trapCode: number } {
    for (const prefix of this.#prefixes) {
      if (payload.includes(prefix)) {
        return { isClean: false, trapCode: 3001 }; // SPORE-SECRET-BREACH
      }
    }
    return { isClean: true, trapCode: 0 };
  }

  get count(): number { return this.#prefixes.size; }
  clear(): void { this.#prefixes.clear(); }
}

/** Session-scoped sink monitor singleton — reset between interpreter runs */
export const activeSinkMonitor = new SecretSinkMonitor();
