// JSONL serialisation and append (TODO pass, Grok 2026-10-05; owner may revisit).
// This package performs no I/O: appendAuditEvent hands one complete line to an injected
// appender (for example a wrapper over fs.promises.appendFile with flag "a").

import { validateRuntimeAuditEvent, type RuntimeAuditEvent } from "./audit-events.js";

const ORDER = ["schemaVersion", "eventId", "timestamp", "category", "status", "message", "runtime", "effect", "capability", "destination", "references", "metadata"] as const;
const RUNTIME_ORDER = ["runtimeId", "environment", "target", "processId", "region"] as const;

function ordered(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

/** One JSONL line (no trailing newline) in canonical key order. Throws on an invalid or unsafe event. */
export function serializeAuditEvent(event: RuntimeAuditEvent): string {
  const diagnostics = validateRuntimeAuditEvent(event);
  if (diagnostics.length > 0) {
    throw new Error(`${diagnostics[0]?.code ?? "FUNGI-REPORT-002"}: audit event refused (${diagnostics.map((d) => d.code).join(", ")}).`);
  }
  const record = ordered(event as unknown as Record<string, unknown>, ORDER);
  record.runtime = ordered(event.runtime as unknown as Record<string, unknown>, RUNTIME_ORDER);
  if (event.metadata !== undefined) {
    const md: Record<string, string> = {};
    for (const key of Object.keys(event.metadata).sort()) md[key] = event.metadata[key] as string;
    record.metadata = md;
  }
  return JSON.stringify(record);
}

export type AuditLineAppender = (filePath: string, line: string) => Promise<void>;

/** Validates and serialises first, then appends exactly one "\n"-terminated line. Nothing is written for a refused event. */
export async function appendAuditEvent(event: RuntimeAuditEvent, filePath: string, append: AuditLineAppender): Promise<void> {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\0")) throw new Error("FUNGI-REPORT-005: audit file path is invalid.");
  const line = serializeAuditEvent(event);
  await append(filePath, `${line}\n`);
}
