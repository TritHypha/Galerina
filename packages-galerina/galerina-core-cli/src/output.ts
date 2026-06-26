import { redactCliOutputChecked, SPORE_CLI_REDACT_001 } from "./security.js";
import type { CliResult } from "./types.js";

export function formatCliResult(result: CliResult): string {
  const lines = [result.message, ...(result.details ?? [])];
  const redacted = redactCliOutputChecked(lines.join("\n"));
  if (redacted.tripwire) {
    // A raw credential token reached CLI output — already redacted, but surface the upstream leak
    // so an operator investigates the source rather than trusting the scrub silently (fail-closed).
    return `${SPORE_CLI_REDACT_001}: redacted ${redacted.markers.length} bare credential token(s) [${redacted.markers.join(", ")}] — investigate upstream leak\n${redacted.text}`;
  }
  return redacted.text;
}
