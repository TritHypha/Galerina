import { spawn } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliContext, CliResult } from "./types.js";

type CoreCommandName =
  | "check"
  | "build"
  | "run"
  | "serve"
  | "reports"
  | "security:check"
  | "routes";

interface CoreCommandMapping {
  readonly coreCommand: string;
  readonly defaultArgs?: readonly string[];
  readonly summary: string;
}

const CORE_COMMANDS: Readonly<Record<CoreCommandName, CoreCommandMapping>> = {
  check: {
    coreCommand: "check",
    summary: "Checked Galerina source with the core prototype compiler.",
  },
  build: {
    coreCommand: "build",
    summary: "Built Galerina source with the core prototype compiler.",
  },
  run: {
    coreCommand: "run",
    summary: "Ran Galerina source with the core prototype runtime.",
  },
  serve: {
    coreCommand: "serve",
    summary: "Created a Galerina serve plan with the core prototype compiler.",
  },
  reports: {
    coreCommand: "generate",
    summary: "Generated Galerina development reports with the core prototype compiler.",
  },
  "security:check": {
    coreCommand: "check",
    summary: "Checked Galerina source for core safety and security diagnostics.",
  },
  routes: {
    coreCommand: "openapi",
    summary: "Generated Galerina route/API metadata with the core prototype compiler.",
  },
};

export function createCoreCommandRunner(command: CoreCommandName) {
  return async (context: CliContext): Promise<CliResult> => {
    const mapping = CORE_COMMANDS[command];
    const compilerPath = resolveCoreCompilerPath();
    const args = [
      compilerPath,
      mapping.coreCommand,
      ...context.args,
      ...(mapping.defaultArgs ?? []),
    ];
    const result = await runNodeCommand(args, context.cwd);
    const details = [
      `Core command: Galerina ${mapping.coreCommand}`,
      `Exit code: ${result.code}`,
      ...splitOutput(result.stdout),
      ...splitOutput(result.stderr),
    ];

    return {
      ok: result.code === 0,
      code: result.code,
      message:
        result.code === 0
          ? mapping.summary
          : `Galerina ${command} failed through the core prototype compiler.`,
      details,
    };
  };
}

function resolveCoreCompilerPath(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDirectory, "../../galerina-core/compiler/galerina.js");
}

function runNodeCommand(
  args: readonly string[],
  cwd: string,
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: string) => stderrChunks.push(chunk));
    child.on("error", (error: Error) => {
      resolveResult({
        code: 1,
        stdout: "",
        stderr: error.message,
      });
    });
    child.on("close", (code: number | null) => {
      resolveResult({
        code: code ?? 1,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join(""),
      });
    });
  });
}

function splitOutput(output: string): readonly string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, 80);
}

export function relativeCoreCompilerPath(cwd: string): string {
  return relative(cwd, resolveCoreCompilerPath());
}
