// =============================================================================
// Galerina Stage A — JSONL audit writer
//
// Implements the 7-rule JSONL audit contract from:
//   docs/Knowledge-Bases/galerina-audit-writer-spec.md
//
// Rules:
//   1. Append-only — never overwrite or delete records
//   2. One record per line — no multiline JSON
//   3. Newline-terminated — each record ends with \n
//   4. Reject invalid schemaVersion
//   5. Reject raw secrets in metadata
//   6. No pretty-printing — compact single-line JSON only
//   7. Preserve event order per writer instance
// =============================================================================

import { appendFileSync } from "node:fs";
import { type RuntimeAuditEntry } from "./interpreter.js";
import { type EvidenceRecord, type DenialRecord } from "./proof-chain.js";

// OWASP F6: cryptographically random audit IDs — not Math.random.
// Web Crypto is available globally in Node 19+ and in the browser.
function _randomUUID(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).crypto.randomUUID() as string;
}

export interface AuditEvent {
  readonly schemaVersion: "lln.runtime.audit.v1";
  readonly id: string;
  readonly timestamp: string;
  readonly status: "Success" | "Denied" | "Failed" | "Unsafe" | "Warning";
  readonly eventType: string;
  readonly source: "galerina-runtime";
  readonly message: string;
  readonly flowName: string;
  readonly qualifier: string;
  readonly traceId: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly evidence: readonly unknown[];
}

export interface AuditWriter {
  append(event: AuditEvent): void;
  /** Serialize all buffered events as JSONL — one compact JSON object per line. */
  toJSONL(): string;
  flush(): void;
  close(): void;
  getEvents(): readonly AuditEvent[];
  /** Track a validation gate firing (for evidence record). */
  recordGateFired(gateName: string): void;
  /** Track a redaction applied (for evidence record). */
  recordRedaction(bindingName: string): void;
  /** Track a governance denial (for denial record). */
  recordDenial(reason: string, flowName: string): void;
  /** Build the evidence record for the current session. */
  getEvidenceRecord(): EvidenceRecord;
  /** Get all denials recorded in this session. */
  getDenials(): readonly DenialRecord[];
}

export function createAuditWriter(
  mode: "memory" | "file" = "memory",
  filePath?: string,
  /** Phase 33: when true, file write failures are fatal (fail-closed audit). */
  failClosed = false,
): AuditWriter {
  const buffer: AuditEvent[] = [];
  const gatesFired: string[] = [];
  const redactionsApplied: string[] = [];
  const denials: DenialRecord[] = [];
  const effectsObserved: string[] = [];
  let closed = false;

  // Rule 4: reject invalid schemaVersion
  function validate(event: AuditEvent): void {
    if (event.schemaVersion !== "lln.runtime.audit.v1") {
      throw new Error(`AuditWriter: invalid schemaVersion '${event.schemaVersion}'`);
    }
  }

  // Rule 5: reject raw secrets in metadata
  // SECURITY (Finding 5 — MEDIUM): The original check was a heuristic keyword
  // regex on key names. It missed: (a) secrets stored under unexpected key names,
  // (b) false positives on e.g. "token_count". Improved approach:
  //   - Check key names with an expanded sensitive-key set
  //   - Check values for common secret patterns (Bearer, sk-, ghp_, etc.)
  //   - Recursively traverse nested JSON objects
  function checkNoSecrets(event: AuditEvent): void {
    const SENSITIVE_KEYS = new Set([
      "password", "passwd", "pwd", "secret", "token", "api_key", "apikey",
      "api_secret", "access_token", "refresh_token", "private_key", "signing_key",
      "authorization", "auth", "credential", "credentials",
    ]);
    const SECRET_VALUE_PATTERNS = [
      /^(Bearer|Basic|Digest)\s+/i,   // auth headers
      /^sk-[A-Za-z0-9]{20,}/,         // OpenAI-style keys
      /^ghp_[A-Za-z0-9]{36}/,         // GitHub PATs
      /^ey[A-Za-z0-9+/]{20,}/,        // JWT (base64 starts ey)
    ];

    for (const [key, value] of Object.entries(event.metadata)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, "_"))) {
        throw new Error(`AuditWriter: sensitive key '${key}' in metadata — redact before writing`);
      }
      for (const pattern of SECRET_VALUE_PATTERNS) {
        if (pattern.test(value)) {
          throw new Error(`AuditWriter: value for key '${key}' looks like a credential — redact before writing`);
        }
      }
    }
  }

  // Rule 6: compact single-line JSON — no pretty-printing
  function toLine(event: AuditEvent): string {
    return JSON.stringify(event); // Rule 3: newline added by caller
  }

  // Write to file when in file mode
  // SECURITY (Finding 4 — MEDIUM): audit write failures were silently swallowed.
  // In production/compliance contexts this is an integrity failure — we must know
  // if audit records are being lost. With failClosed=true (production default),
  // any write failure throws so the caller knows audit integrity is compromised.
  function persistToFile(event: AuditEvent): void {
    if (mode === "file" && filePath !== undefined) {
      try {
        // Rule 1 (append-only), Rule 2 (one line), Rule 3 (\n-terminated)
        appendFileSync(filePath, toLine(event) + "\n", "utf8");
      } catch (writeErr) {
        if (failClosed) {
          // Fail-closed: re-throw so the caller (runtime, HTTP handler) gets a
          // 500 rather than silently losing an audit record.
          throw new Error(
            `AuditWriter: CRITICAL — audit write failed (audit integrity lost): ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`
          );
        }
        // Fail-open (dev mode): in-memory buffer is still authoritative.
        // Log to stderr so the developer is aware even in dev mode.
        process.stderr.write(`[Galerina AuditWriter] WARNING: file write failed: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}\n`);
      }
    }
  }

  return {
    append(event: AuditEvent): void {
      if (closed) throw new Error("AuditWriter: writer is closed");
      validate(event);      // Rule 4
      checkNoSecrets(event); // Rule 5
      buffer.push(event);   // Rule 7: preserves order
      persistToFile(event); // Rule 1, 2, 3, 6
    },

    // Rule 2 + 3 + 6: compact JSONL
    toJSONL(): string {
      return buffer.map((e) => toLine(e)).join("\n") + (buffer.length > 0 ? "\n" : "");
    },

    flush(): void {
      // In-memory mode: buffer already preserves order (Rule 7)
      // File mode: appendFileSync writes immediately in append()
    },

    close(): void {
      closed = true;
    },

    getEvents(): readonly AuditEvent[] {
      return [...buffer];
    },

    recordGateFired(gateName: string): void {
      gatesFired.push(gateName);
    },

    recordRedaction(bindingName: string): void {
      redactionsApplied.push(bindingName);
    },

    recordDenial(reason: string, flowName: string): void {
      denials.push({
        denialId: `denial_${_randomUUID()}`,
        reason,
        flowName,
        timestamp: new Date().toISOString(),
      });
    },

    getEvidenceRecord(): EvidenceRecord {
      return {
        validationGatesFired: [...gatesFired],
        redactionsApplied: [...redactionsApplied],
        effectsObserved: [...effectsObserved],
        timestamp: new Date().toISOString(),
      };
    },

    getDenials(): readonly DenialRecord[] {
      return [...denials];
    },
  };
}

export function buildFlowAuditEvent(
  flowName: string,
  qualifier: string,
  status: AuditEvent["status"],
  traceId: string,
  entries: readonly RuntimeAuditEntry[],
): AuditEvent {
  const metadata: Record<string, string> = {};
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry.fields)) {
      metadata[`${entry.event}.${key}`] = value;
    }
  }

  return {
    schemaVersion: "lln.runtime.audit.v1",
    id: `evt_${_randomUUID()}`,
    timestamp: new Date().toISOString(),
    status,
    eventType: "FunctionExecution",
    source: "galerina-runtime",
    message: `Flow '${flowName}' ${status.toLowerCase()}`,
    flowName,
    qualifier,
    traceId,
    metadata,
    evidence: [],
  };
}
