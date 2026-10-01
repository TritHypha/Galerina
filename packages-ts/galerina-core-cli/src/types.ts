export type CliEnvironment = "development" | "test" | "staging" | "production";

export interface CliContext {
  readonly cwd: string;
  readonly env: CliEnvironment;
  readonly args: readonly string[];
}

/** Structured, operator-safe CLI error: never echoes raw user input. */
export interface CliError {
  readonly code: string;
  readonly safeMessage: string;
  readonly suggestedFix: string;
}

export interface CliResult {
  readonly ok: boolean;
  readonly code: number;
  readonly message: string;
  readonly details?: readonly string[];
  readonly error?: CliError;
}

export interface CliCommand {
  readonly name: string;
  readonly description: string;
  run(context: CliContext): Promise<CliResult>;
}
