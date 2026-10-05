// Conservative secret-material screening for audit artefacts; acceptance is not proof that data is secret-free.
// Audit logs store hashes, status flags, presence checks and capability names only.

const SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  /sk_(?:live|test)_[A-Za-z0-9]/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]);

const MAX_DEPTH = 16;
const SENSITIVE_FIELD_PARTS = new Set([
  "password",
  "passwd",
  "passphrase",
  "secret",
  "token",
  "credential",
  "credentials",
  "authorization",
  "bearer",
  "cookie",
  "session",
  "refresh",
  "jwt",
  "otp",
  "pin",
  "nonce",
  "csrf",
  "seed",
]);
const NON_SECRET_FIELD_SUFFIXES = new Set([
  "count",
  "length",
  "present",
  "configured",
  "exists",
  "status",
]);

function isSensitiveFieldName(name: string, value: unknown): boolean {
  const parts = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.length === 2 && parts[0] === "cookie" && parts[1] === "name" && typeof value === "string") return false;
  if (parts.length === 2 && parts[0] === "refresh" && parts[1] === "interval" &&
    (typeof value === "string" || typeof value === "number")) return false;
  const suffix = parts[parts.length - 1]!;
  if ((typeof value === "boolean" || typeof value === "number") && NON_SECRET_FIELD_SUFFIXES.has(suffix)) return false;
  return parts.some((part) => SENSITIVE_FIELD_PARTS.has(part)) ||
    (parts.includes("connection") && parts.includes("string")) ||
    ((parts.includes("api") || parts.includes("access") || parts.includes("private") || parts.includes("client") ||
      parts.includes("signing") || parts.includes("encryption") || parts.includes("master")) &&
      parts.some((part) => part === "key" || part === "keys"));
}

/** True when any string reachable in `value` (keys included) looks like secret material. Over-deep or cyclic input counts as unsafe. */
export function containsSecretMaterial(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): boolean {
  if (typeof value === "string") return SECRET_PATTERNS.some((p) => p.test(value));
  if (typeof value !== "object" || value === null) return false;
  if (depth >= MAX_DEPTH || seen.has(value)) return true;
  seen.add(value);
  try {
    const isArray = Array.isArray(value);
    if (!isArray) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return true;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Reflect.ownKeys(descriptors).some((key) => {
      if (typeof key !== "string") return true;
      const descriptor = descriptors[key]!;
      if (!("value" in descriptor)) return true;
      const item = descriptor.value;
      return (isSensitiveFieldName(key, item) && item !== null && item !== undefined) ||
        containsSecretMaterial(key, depth + 1, seen) ||
        containsSecretMaterial(item, depth + 1, seen);
    });
  } catch {
    return true;
  }
}

export const AUDIT_REDACTED = "[REDACTED]";

/** Returns the string, or the redaction marker when it carries secret material. */
export function redactAuditText(text: string): string {
  return containsSecretMaterial(text) ? AUDIT_REDACTED : text;
}
