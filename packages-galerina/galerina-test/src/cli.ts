#!/usr/bin/env node
// galerina-test — the harness front door.
//
//   galerina-test [unit|e2e|conformance|fidelity|all] [flags]
//
// No subcommand runs `all`. An unknown subcommand exits non-zero (fail-closed).
// The process exit code IS the harness verdict (0 pass, non-zero fail). In human
// mode the child tools stream their own output live; `--json` captures and emits
// a machine-readable CheckResult instead.

import {
  runAll,
  runConformance,
  runE2e,
  runFidelity,
  runUnit,
} from "./runners.js";
import type { AllOptions, CheckResult, CheckScope } from "./types.js";

const KINDS = new Set<CheckScope>([
  "unit",
  "e2e",
  "conformance",
  "fidelity",
  "all",
]);

function usage(): void {
  process.stdout.write(
    `galerina-test — the consolidated Galerina test harness

Usage:
  galerina-test [unit|e2e|conformance|fidelity|all] [flags]

Checks:
  unit          per-package node:test suites (scripts/run-all-tests.cjs)
  e2e           compile example apps end-to-end (galerina check|build)
  conformance   the R6 Stage-A ≡ Stage-B parity gate
  fidelity      the 0014 walker ≡ bytecode ≡ WASM differential
  all           every check (default)

Flags:
  --root <dir>     workspace root (default: auto-detected via galerina.workspace.json)
  --core           unit: only the SOT-core packages (fast)
  --build          e2e: also \`galerina build\`, not just \`check\`
  --bail           stop at the first failure
  --json           emit a machine-readable CheckResult (captures child output)
  --timeout <ms>   per-target spawn timeout
  -h, --help       this message
`,
  );
}

function fail(msg: string): never {
  process.stderr.write(`galerina-test: ${msg}\n\n`);
  usage();
  process.exit(2);
}

interface ParsedArgs {
  readonly scope: CheckScope;
  readonly opts: AllOptions;
  readonly json: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args = argv.slice(2);
  const positionals: string[] = [];
  // Mutable accumulator; narrowed to AllOptions on return.
  const opts: {
    rootDir?: string;
    core?: boolean;
    build?: boolean;
    bail?: boolean;
    bailScope?: boolean;
    timeoutMs?: number;
    packages?: string[];
    inheritStdio?: boolean;
  } = {};
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!; // bounded by the loop condition
    if (a === "--root") {
      const v = args[++i];
      if (!v) fail("--root requires a directory");
      opts.rootDir = v;
    } else if (a === "--timeout") {
      const v = args[++i];
      const n = Number(v);
      if (!v || !Number.isFinite(n) || n <= 0) fail("--timeout requires a positive number of ms");
      opts.timeoutMs = n;
    } else if (a === "--core") {
      opts.core = true;
    } else if (a === "--build") {
      opts.build = true;
    } else if (a === "--bail") {
      opts.bail = true;
      opts.bailScope = true;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    } else if (a.startsWith("--")) {
      fail(`unknown flag: ${a}`);
    } else {
      positionals.push(a);
    }
  }

  // First positional is the subcommand (fail-closed on an unknown one); any
  // remaining positionals are unit package names.
  let scope: CheckScope = "all";
  if (positionals.length > 0) {
    const first = positionals[0]!;
    if (!KINDS.has(first as CheckScope)) fail(`unknown subcommand: ${first}`);
    scope = first as CheckScope;
    const rest = positionals.slice(1);
    if (rest.length > 0) opts.packages = rest;
  }

  // Human mode streams child output live; --json captures it for the payload.
  if (!json) opts.inheritStdio = true;
  return { scope, opts: opts as AllOptions, json };
}

function dispatch(scope: CheckScope, opts: AllOptions): Promise<CheckResult> {
  switch (scope) {
    case "unit":
      return runUnit(opts);
    case "e2e":
      return runE2e(opts);
    case "conformance":
      return runConformance(opts);
    case "fidelity":
      return runFidelity(opts);
    case "all":
      return runAll(opts);
  }
}

function mark(ok: boolean): string {
  return ok ? "✅" : "❌";
}

function printHuman(result: CheckResult): void {
  process.stdout.write(
    `\nlogicn-test ${result.kind} — ${result.ok ? "PASS" : "FAIL"}: ${result.detail}\n`,
  );
  for (const child of result.children ?? []) {
    process.stdout.write(
      `  ${mark(child.ok)} ${child.kind.padEnd(12)} ${child.detail}\n`,
    );
  }
}

async function main(): Promise<void> {
  const { scope, opts, json } = parseArgs(process.argv);
  let result: CheckResult;
  try {
    result = await dispatch(scope, opts);
  } catch (err) {
    // Fail-closed: any thrown error (e.g. no workspace found) is a failure.
    const msg = err instanceof Error ? err.message : String(err);
    if (json) {
      process.stdout.write(
        JSON.stringify(
          { kind: scope, ok: false, exitCode: 1, durationMs: 0, detail: msg },
          null,
          2,
        ) + "\n",
      );
    } else {
      process.stderr.write(`galerina-test: ${msg}\n`);
    }
    process.exit(1);
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    printHuman(result);
  }
  process.exit(result.exitCode);
}

void main();
