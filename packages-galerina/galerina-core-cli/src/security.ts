// CLI output redaction — fail-closed tripwire (R&D 0094-redact PART-A, SPORE-CLI-REDACT-001).
//
// Two detector classes:
//  - ASSIGNMENT patterns scrub `key = value` / `header: value` forms (a prefix group is preserved).
//  - BARE patterns scrub credential tokens that are secrets REGARDLESS of surrounding context
//    (PEM private-key blocks, cloud access-key IDs, VCS/chat PATs, JWTs). These close the prior
//    fail-OPEN: a bare token with no `key=` prefix used to print as cleartext.
//
// A BARE match is also a TRIPWIRE: a raw credential token reaching CLI output means an upstream
// boundary already leaked it. The checked API reports that bypass (SPORE-CLI-REDACT-001) so a caller
// can fail closed (warn / suppress / exit non-zero); the value itself is always redacted either way.
// Redaction is best-effort defense-in-depth, never the primary secret boundary — it can only ever
// add safety, never weaken it.

export const SPORE_CLI_REDACT_001 = "SPORE-CLI-REDACT-001";

const REDACTION = "SecureString(redacted)";

interface Detector {
  readonly name: string;
  readonly pattern: RegExp;
  /** A bare credential token: its mere presence in CLI output is an upstream leak (tripwire). */
  readonly bare: boolean;
}

const DETECTORS: readonly Detector[] = [
  // --- assignment / header forms (prefix group preserved) ---
  { name: "bearer", pattern: /bearer\s+[a-z0-9._~+/=-]+/gi, bare: false },
  { name: "api-key-assign", pattern: /(api[_-]?key\s*=\s*)[^\s]+/gi, bare: false },
  { name: "token-assign", pattern: /(token\s*=\s*)[^\s]+/gi, bare: false },
  { name: "password-assign", pattern: /(password\s*=\s*)[^\s]+/gi, bare: false },
  { name: "secret-assign", pattern: /(secret[_-]?(?:key)?\s*[:=]\s*)[^\s]+/gi, bare: false },
  { name: "cookie-header", pattern: /(cookie\s*:\s*)[^\r\n]+/gi, bare: false },
  { name: "private-key-assign", pattern: /(private[_-]?key\s*=\s*)[^\s]+/gi, bare: false },
  // --- bare credential tokens (tripwire: secret regardless of context) ---
  { name: "pem-private-key", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, bare: true },
  { name: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|A3T)[0-9A-Z]{16}\b/g, bare: true },
  { name: "vcs-pat", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, bare: true },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, bare: true },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, bare: true }
];

export interface RedactionResult {
  /** The redacted text — always safe to print. */
  readonly text: string;
  /** Total number of secret-shaped spans scrubbed. */
  readonly redactions: number;
  /** True iff a BARE credential token was detected — an upstream leak reached CLI output. */
  readonly tripwire: boolean;
  /** Names (never values) of the bare detectors that fired. */
  readonly markers: readonly string[];
}

/**
 * Redact and report. The returned `text` is always safe to print; `tripwire`/`markers` let a caller
 * fail closed when a raw credential token slipped past an upstream boundary (SPORE-CLI-REDACT-001).
 */
export function redactCliOutputChecked(value: string): RedactionResult {
  let text = value;
  let redactions = 0;
  const markers: string[] = [];
  for (const d of DETECTORS) {
    // Fresh RegExp per use: shared global regexes carry `lastIndex` state across match/replace.
    const counter = new RegExp(d.pattern.source, d.pattern.flags);
    const found = text.match(counter);
    if (!found || found.length === 0) continue;
    redactions += found.length;
    if (d.bare) markers.push(d.name);
    const replacer = new RegExp(d.pattern.source, d.pattern.flags);
    text = text.replace(replacer, (_match, prefix?: string) => `${prefix ?? ""}${REDACTION}`);
  }
  return { text, redactions, tripwire: markers.length > 0, markers };
}

/** Convenience wrapper: redacted text only (caller output is unchanged). */
export function redactCliOutput(value: string): string {
  return redactCliOutputChecked(value).text;
}
