// Denial serialisation (TODO pass, Grok 2026-10-05; owner may revisit).

import type { DenialReport } from "./denial-report.js";
import { validateDenialReport } from "./denial-validator.js";

const ORDER = ["schemaVersion", "denialId", "timestamp", "category", "reason", "policyId", "runtimeId", "effect", "capability", "destination", "diagnostics", "references"];

/** Canonical, deterministic JSON (two-space indent, trailing newline). Throws on an invalid or unsafe report. */
export function serializeDenialReport(report: DenialReport): string {
  const problems = validateDenialReport(report);
  if (problems.length > 0) throw new Error(`${problems[0]?.code ?? "FUNGI-DENIAL-003"}: denial report refused.`);
  const source = report as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ORDER) if (key in source) out[key] = source[key];
  return `${JSON.stringify(out, (_k: string, v: unknown) => v, 2)}\n`;
}
