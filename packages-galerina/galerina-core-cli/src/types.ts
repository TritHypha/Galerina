export type CliEnvironment = "development" | "test" | "staging" | "production";

export interface CliContext {
  readonly cwd: string;
  readonly env: CliEnvironment;
  readonly args: readonly string[];
}

export interface CliResult {
  readonly ok: boolean;
  readonly code: number;
  readonly message: string;
  readonly details?: readonly string[];
}

export interface CliCommand {
  readonly name: string;
  readonly description: string;
  run(context: CliContext): Promise<CliResult>;
}
