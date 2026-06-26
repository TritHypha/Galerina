// =============================================================================
// @galerina/devtools-pci — Black Box Compliance Ledger (#146)
//
// Consumes the audit-egress ledger produced by @galerina/core-sentinel-egress
// (AuditEgress / readEgressLedger) and emits a structured, append-only,
// HASH-LINKED compliance report for an auditor.
//
// The egress ledger is an HMAC-chained sequence of batches, each carrying a
// list of opaque audit-record strings. This module:
//   1. Reads those batches (format-compatible with readEgressLedger).
//   2. Parses each record into a normalised compliance entry capturing
//      WHO / WHAT / EFFECT / DECISION / TIMESTAMP.
//   3. Hash-links the entries into an append-only chain (SHA-256), so the
//      auditor's report is itself tamper-evident, independent of the egress
//      HMAC key.
//
// Deny-by-default: a record whose decision cannot be determined is recorded
// as "deny" (fail-closed), never silently "allow".
//
// Schema version: spore.compliance-ledger.v1
// =============================================================================

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Egress ledger shape (format-compatible with @galerina/core-sentinel-egress)
// ---------------------------------------------------------------------------

/**
 * One flushed batch of audit records, as written by AuditEgress to
 * `<dir>/audit-egress.jsonl`. Re-declared here (structurally identical to the
 * egress package's `AuditBatch`) so the ledger can be consumed without taking
 * a hard build-time dependency on the egress package internals.
 */
export interface EgressBatch {
  readonly seq: number;
  readonly count: number;
  readonly prevHash: string;
  readonly batchHash: string;
  readonly records: readonly string[];
}

/** Ledger file name written by AuditEgress under its egress directory. */
const EGRESS_LEDGER_FILE = "audit-egress.jsonl";

/** Genesis chain head for the compliance report: 64 hex zeros (SHA-256 width). */
const GENESIS = "0".repeat(64);

/** Compliance report file name written under the configured report directory. */
const COMPLIANCE_LEDGER_FILE = "compliance-ledger.jsonl";

/**
 * Read and parse the egress ledger under `dir`.
 *
 * Parses each non-blank line of `<dir>/audit-egress.jsonl` into an
 * {@link EgressBatch}. Returns `[]` if the ledger file does not exist.
 * Format-compatible with `readEgressLedger` from @galerina/core-sentinel-egress.
 */
export function readEgressBatches(dir: string): EgressBatch[] {
  const path = join(dir, EGRESS_LEDGER_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const out: EgressBatch[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    out.push(JSON.parse(trimmed) as EgressBatch);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Compliance entry / report types
// ---------------------------------------------------------------------------

/** Normalised governance decision. Deny-by-default: unknown => "deny". */
export type ComplianceDecision = "allow" | "deny";

/**
 * One normalised, hash-linked compliance entry for the auditor.
 *
 * The auditor's question is always: WHO did WHAT, with what EFFECT, and was it
 * ALLOWED or DENIED — and WHEN. Every field is populated (deny-by-default for
 * the decision) so an auditor never sees an ambiguous row.
 */
export interface ComplianceEntry {
  /** Position in the append-only chain (0-based). */
  readonly seq: number;
  /** Egress batch this record came from. */
  readonly batchSeq: number;
  /** Index of the record within its egress batch. */
  readonly recordIndex: number;
  /** WHO — the acting principal/actor (best-effort; "unknown" if absent). */
  readonly who: string;
  /** WHAT — the action/operation/flow (best-effort; "unknown" if absent). */
  readonly what: string;
  /** EFFECT — the declared/observed effect (best-effort; "unknown" if absent). */
  readonly effect: string;
  /** DECISION — allow/deny. Deny-by-default when undeterminable. */
  readonly decision: ComplianceDecision;
  /** TIMESTAMP — ISO-8601 event time (record's own, else report build time). */
  readonly timestamp: string;
  /** The raw, verbatim egress record string (so nothing is lost). */
  readonly raw: string;
  /** SHA-256 of the previous entry's `entryHash` (GENESIS for the first). */
  readonly prevHash: string;
  /** SHA-256 hash linking this entry to the chain. */
  readonly entryHash: string;
}

/** A full, append-only compliance report over an egress ledger. */
export interface ComplianceReport {
  readonly schemaVersion: "spore.compliance-ledger.v1";
  /** Egress directory the report was derived from. */
  readonly sourceDir: string;
  /** Number of egress batches consumed. */
  readonly batchCount: number;
  /** Hash-linked compliance entries, in chain order. */
  readonly entries: readonly ComplianceEntry[];
  /** Final chain head: last `entryHash`, or GENESIS if empty. */
  readonly chainHead: string;
  /** Count of allow decisions. */
  readonly allowCount: number;
  /** Count of deny decisions. */
  readonly denyCount: number;
  /** When this report was generated (ISO-8601). */
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------------
// Record parsing (tolerant: JSON objects, or opaque strings)
// ---------------------------------------------------------------------------

const WHO_KEYS = ["who", "actor", "principal", "subject", "user", "identity", "caller"] as const;
const WHAT_KEYS = ["what", "action", "operation", "op", "flow", "event", "activity"] as const;
const EFFECT_KEYS = ["effect", "effects", "capability", "cap", "resource"] as const;
const DECISION_KEYS = ["decision", "outcome", "result", "verdict", "allowed"] as const;
const TIMESTAMP_KEYS = ["timestamp", "ts", "time", "at", "occurredAt", "auditedAt"] as const;

function firstString(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v) && v.length > 0) {
      return v.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join(",");
    }
  }
  return undefined;
}

/**
 * Normalise a decision token to allow/deny — DENY-BY-DEFAULT.
 *
 * Only an explicit, recognised allow token yields "allow". Everything else
 * (deny tokens, unknown tokens, missing field) fails closed to "deny".
 */
function normaliseDecision(raw: string | undefined): ComplianceDecision {
  if (raw === undefined) return "deny";
  const t = raw.trim().toLowerCase();
  switch (t) {
    case "allow":
    case "allowed":
    case "permit":
    case "permitted":
    case "granted":
    case "grant":
    case "pass":
    case "ok":
    case "true":
      return "allow";
    default:
      // deny / denied / reject / blocked / fail / false / anything unknown
      return "deny";
  }
}

/** Try to parse a record string as a JSON object. Returns undefined otherwise. */
function tryParseObject(record: string): Record<string, unknown> | undefined {
  const trimmed = record.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** SHA-256 hex of `prevHash + "\n" + serialisedFields`. */
function computeEntryHash(prevHash: string, who: string, what: string, effect: string,
                          decision: ComplianceDecision, timestamp: string, raw: string): string {
  const h = createHash("sha256");
  // Length-prefix each field so no field-boundary injection is possible.
  const parts = [prevHash, who, what, effect, decision, timestamp, raw];
  h.update(parts.map(p => `${p.length}:${p}`).join("|"));
  return h.digest("hex");
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

/**
 * Build an append-only, hash-linked compliance report from egress batches.
 *
 * Each opaque audit-record string is normalised into a {@link ComplianceEntry}
 * (who/what/effect/decision/timestamp), then SHA-256 hash-linked to the prior
 * entry. The decision is DENY-BY-DEFAULT: any record we cannot positively read
 * as "allow" is recorded as "deny".
 *
 * @param batches      - egress batches (e.g. from {@link readEgressBatches})
 * @param generatedAt  - optional fixed report timestamp (ISO-8601); defaults to now
 */
export function buildComplianceReport(
  batches: readonly EgressBatch[],
  sourceDir: string,
  generatedAt?: string,
): ComplianceReport {
  const builtAt = generatedAt ?? new Date().toISOString();
  const entries: ComplianceEntry[] = [];
  let prevHash = GENESIS;
  let seq = 0;
  let allowCount = 0;
  let denyCount = 0;

  for (const batch of batches) {
    for (let recordIndex = 0; recordIndex < batch.records.length; recordIndex++) {
      const raw = batch.records[recordIndex] ?? "";
      const obj = tryParseObject(raw);

      let who = "unknown";
      let what = "unknown";
      let effect = "unknown";
      let decision: ComplianceDecision;
      let timestamp = builtAt;

      if (obj !== undefined) {
        who = firstString(obj, WHO_KEYS) ?? "unknown";
        what = firstString(obj, WHAT_KEYS) ?? "unknown";
        effect = firstString(obj, EFFECT_KEYS) ?? "unknown";
        decision = normaliseDecision(firstString(obj, DECISION_KEYS));
        timestamp = firstString(obj, TIMESTAMP_KEYS) ?? builtAt;
      } else {
        // Opaque non-JSON record: we cannot read a decision -> fail closed.
        what = raw.length > 0 ? raw : "unknown";
        decision = "deny";
      }

      const entryHash = computeEntryHash(prevHash, who, what, effect, decision, timestamp, raw);
      entries.push({
        seq,
        batchSeq: batch.seq,
        recordIndex,
        who,
        what,
        effect,
        decision,
        timestamp,
        raw,
        prevHash,
        entryHash,
      });

      if (decision === "allow") allowCount++;
      else denyCount++;

      prevHash = entryHash;
      seq++;
    }
  }

  return {
    schemaVersion: "spore.compliance-ledger.v1",
    sourceDir,
    batchCount: batches.length,
    entries,
    chainHead: prevHash,
    allowCount,
    denyCount,
    generatedAt: builtAt,
  };
}

/**
 * Read an egress ledger directory and build a compliance report from it.
 *
 * Convenience wrapper: {@link readEgressBatches} + {@link buildComplianceReport}.
 */
export function buildComplianceReportFromDir(dir: string, generatedAt?: string): ComplianceReport {
  return buildComplianceReport(readEgressBatches(dir), dir, generatedAt);
}

// ---------------------------------------------------------------------------
// Append-only persistence + verification
// ---------------------------------------------------------------------------

/**
 * Append a compliance report's entries to the on-disk compliance ledger as
 * newline-delimited JSON (one entry per line), under `<dir>/compliance-ledger.jsonl`.
 *
 * Append-only: this NEVER rewrites existing lines. The directory is created
 * recursively if absent. Returns the path written.
 */
export function appendComplianceLedger(dir: string, report: ComplianceReport): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, COMPLIANCE_LEDGER_FILE);
  if (report.entries.length === 0) return path;
  const lines = report.entries.map(e => JSON.stringify(e)).join("\n") + "\n";
  appendFileSync(path, lines);
  return path;
}

/**
 * Read the on-disk compliance ledger (one {@link ComplianceEntry} per line).
 * Returns `[]` if the file does not exist.
 */
export function readComplianceLedger(dir: string): ComplianceEntry[] {
  const path = join(dir, COMPLIANCE_LEDGER_FILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: ComplianceEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    out.push(JSON.parse(trimmed) as ComplianceEntry);
  }
  return out;
}

/**
 * Verify a hash-linked compliance chain.
 *
 * For each entry: confirm `prevHash` links to the prior entry's `entryHash`
 * (GENESIS for the first), confirm `seq` is monotonic from 0, and recompute
 * `entryHash` from the entry's fields — any mismatch (tamper, reorder, splice)
 * returns `false`.
 *
 * @returns `true` iff the compliance chain is intact (tamper-evident).
 */
export function verifyComplianceChain(entries: readonly ComplianceEntry[]): boolean {
  let expectedPrev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e === undefined) return false;
    if (e.seq !== i) return false;
    if (e.prevHash !== expectedPrev) return false;
    if (e.decision !== "allow" && e.decision !== "deny") return false;
    const recomputed = computeEntryHash(
      e.prevHash, e.who, e.what, e.effect, e.decision, e.timestamp, e.raw,
    );
    if (recomputed !== e.entryHash) return false;
    expectedPrev = e.entryHash;
  }
  return true;
}
