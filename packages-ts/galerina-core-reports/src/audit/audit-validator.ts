// validateAuditSafety (TODO pass, Grok 2026-10-05; owner may revisit).

import type { RuntimeAuditEvent } from "./audit-events.js";
import { containsSecretMaterial } from "./audit-redaction.js";

/** Rejects (false) events that carry raw secrets: sk_live_/sk_test_ keys, Bearer tokens, private-key blocks; anywhere, keys included. */
export function validateAuditSafety(event: RuntimeAuditEvent): boolean {
  return !containsSecretMaterial(event);
}
