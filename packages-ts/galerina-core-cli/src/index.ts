#!/usr/bin/env node
import { formatCliResult } from "./output.js";
import { runCli } from "./cli.js";

export { runCli, FUNGI_CLI_001, FUNGI_CLI_002, FUNGI_CLI_003 } from "./cli.js";
export { verifyHash, verifyArtefacts, sha256File, FUNGI_VERIFY_001, FUNGI_VERIFY_002, FUNGI_VERIFY_003, FUNGI_VERIFY_004, FUNGI_VERIFY_005 } from "./verify.js";
export type { BuildArtefact, BuildArtefactKind, VerifiedArtefact, VerificationResult, VerifyDiagnostic } from "./verify.js";
export { createVerificationReport, renderVerificationReport, writeVerificationReport, VERIFICATION_REPORT_FILE, VERIFICATION_REPORT_LIMITATIONS, VERIFICATION_REPORT_SCHEMA } from "./verify/verify-reporter.js";
export type { VerificationReport, VerificationReportArtefact, VerificationReportDiagnostic, VerificationReportOptions } from "./verify/verify-reporter.js";
export { commands, findCommand } from "./commands.js";
export { formatCliResult } from "./output.js";
export { redactCliOutput, redactCliOutputChecked, FUNGI_CLI_REDACT_001 } from "./security.js";
export type { RedactionResult } from "./security.js";
export type { CliCommand, CliContext, CliEnvironment, CliError, CliResult } from "./types.js";

if (process.argv[1]?.endsWith("index.js") === true) {
  const result = await runCli(process.argv.slice(2), process.cwd());
  const output = formatCliResult(result);

  if (output.length > 0) {
    console.log(output);
  }

  process.exitCode = result.code;
}
