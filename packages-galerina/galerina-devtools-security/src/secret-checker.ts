// =============================================================================
// @galerina/devtools-security — Secret / Credential Leak Detection
//
// Detects potential secrets in audit metadata, log entries, and structured data.
// Based on Security Audit F5 fix in audit-writer.ts.
//
// Two detection modes:
//   1. Key-name detection — identifies known sensitive field names
//   2. Value-pattern detection — identifies common credential patterns in values
// =============================================================================

export interface SecretCheckResult {
  readonly clean:   boolean;
  readonly finding?: string;
  readonly field?:  string;
}

/** Known sensitive key names (normalised: lowercase, underscores). */
const SENSITIVE_KEYS = new Set([
  "password", "passwd", "pwd", "secret", "token", "api_key", "apikey",
  "api_secret", "access_token", "refresh_token", "private_key", "signing_key",
  "authorization", "auth", "credential", "credentials", "client_secret",
  "bearer", "session_token", "webhook_secret", "encryption_key", "master_key",
]);

/** Patterns that suggest credential values. */
const CREDENTIAL_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /^(Bearer|Basic|Digest)\s+\S+/i,  label: "HTTP authorization header value" },
  { re: /^sk-[A-Za-z0-9]{20,}/,           label: "OpenAI-style API key (sk-...)" },
  { re: /^ghp_[A-Za-z0-9]{36}/,           label: "GitHub personal access token (ghp_...)" },
  { re: /^ghr_[A-Za-z0-9]{36}/,           label: "GitHub refresh token (ghr_...)" },
  { re: /^ey[A-Za-z0-9+/]{8,}\.[A-Za-z0-9+/]{8,}/,    label: "JWT (base64.base64.sig)" },
  { re: /^AKIA[A-Z0-9]{16}/,              label: "AWS access key (AKIA...)" },
  { re: /^[A-Za-z0-9+/]{40,}={0,2}$/,    label: "Long base64-encoded value (possible key)" },
];

/** Normalise a key name for lookup. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[-.\s]/g, "_");
}

/**
 * Check a key-value pair for potential secret leakage.
 * Returns a finding if the key name or value looks like a credential.
 */
export function checkKeyValueForSecret(key: string, value: string): SecretCheckResult {
  const normKey = normaliseKey(key);
  if (SENSITIVE_KEYS.has(normKey)) {
    return { clean: false, finding: `Sensitive field name '${key}' — redact before writing to audit`, field: key };
  }
  for (const { re, label } of CREDENTIAL_PATTERNS) {
    if (re.test(value)) {
      return { clean: false, finding: `Value for '${key}' matches credential pattern: ${label}`, field: key };
    }
  }
  return { clean: true };
}

/**
 * Check all key-value pairs in a metadata object.
 * Returns the first finding, or clean=true if all are safe.
 */
export function checkMetadataForSecrets(metadata: Readonly<Record<string, string>>): SecretCheckResult {
  for (const [key, value] of Object.entries(metadata)) {
    const result = checkKeyValueForSecret(key, value);
    if (!result.clean) return result;
  }
  return { clean: true };
}

/**
 * Redact a metadata object — replace suspicious values with [REDACTED].
 * Non-destructive: returns a new object.
 */
export function redactMetadata(metadata: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const check = checkKeyValueForSecret(key, value);
    out[key] = check.clean ? value : "[REDACTED]";
  }
  return out;
}
