#!/usr/bin/env node
import { formatCliResult } from "./output.js";
import { runCli } from "./cli.js";

export { runCli } from "./cli.js";
export { commands, findCommand } from "./commands.js";
export { formatCliResult } from "./output.js";
export { redactCliOutput, redactCliOutputChecked, SPORE_CLI_REDACT_001 } from "./security.js";
export type { RedactionResult } from "./security.js";
export type { CliCommand, CliContext, CliEnvironment, CliResult } from "./types.js";

if (process.argv[1]?.endsWith("index.js") === true) {
  const result = await runCli(process.argv.slice(2), process.cwd());
  const output = formatCliResult(result);

  if (output.length > 0) {
    console.log(output);
  }

  process.exitCode = result.code;
}
