/**
 * `galerina plan` command wiring (zero-trust defaults, owner may revisit).
 *
 * Loads a closed PlanWorkspaceInput JSON, runs estimateTarget (advisory only),
 * optionally writes compute-plan.json. Never probes live GPU / optical / memory /
 * energy / graph. Never echoes paths, tokens, or keys in diagnostics / default.
 *
 * Admitted flags: --workspace <file>, --target <token>, --memory <int>,
 * --parallelism <int>, --report <dir>, --json, --compatibility.
 * --runtime / --energy / --graph are recognized but refused (FUNGI-CLI-PLAN-004;
 * live probes HOLD). Exit codes: 0 success, 2 usage, 4 validation.
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { CliContext, CliError, CliResult } from "../types.js";
import {
  estimateTarget,
  isPlanRuntimeTarget,
  type PlanOptions,
  type PlanRuntimeTarget,
} from "./plan-contracts.js";
import {
  createComputePlanReport,
  renderComputePlanReport,
  writeComputePlanReport,
  COMPUTE_PLAN_REPORT_FILE,
} from "./plan-reporter.js";

/** Unknown or duplicate flag / missing value / equals-form / positional. */
export const FUNGI_CLI_PLAN_001 = "FUNGI-CLI-PLAN-001";
/** Required --workspace missing. */
export const FUNGI_CLI_PLAN_002 = "FUNGI-CLI-PLAN-002";
/** Input file unreadable / not JSON / not a plain object. */
export const FUNGI_CLI_PLAN_003 = "FUNGI-CLI-PLAN-003";
/** --runtime / --energy / --graph not admitted yet (live probe HOLD). */
export const FUNGI_CLI_PLAN_004 = "FUNGI-CLI-PLAN-004";
/** --report directory unusable (missing, not a dir, or report already exists). */
export const FUNGI_CLI_PLAN_005 = "FUNGI-CLI-PLAN-005";

export const PLAN_EXIT_OK = 0;
export const PLAN_EXIT_USAGE = 2;
export const PLAN_EXIT_VALIDATION = 4;

const ADMITTED_FLAGS = Object.freeze([
  "--workspace",
  "--target",
  "--memory",
  "--parallelism",
  "--report",
  "--json",
  "--compatibility",
  "--runtime",
  "--energy",
  "--graph",
] as const);

export type PlanFlagName = (typeof ADMITTED_FLAGS)[number];

export interface PlanCommandOptions {
  readonly workspacePath: string;
  readonly requestedTarget: PlanRuntimeTarget | null;
  readonly memoryOverride: number | null;
  readonly parallelismOverride: number | null;
  readonly reportDir?: string;
  readonly json: boolean;
  /** When true, facet mode enables only compatibility (other includes false). */
  readonly compatibilityOnly: boolean;
}

const MAX_MEMORY_MB = 1_048_576;
const MAX_PARALLELISM = 65_536;

function refuse(code: string, exitCode: number, safeMessage: string, suggestedFix: string): CliResult {
  const error: CliError = Object.freeze({ code, safeMessage, suggestedFix });
  return Object.freeze({
    ok: false as const,
    code: exitCode,
    message: `${code}: ${safeMessage}`,
    details: Object.freeze([`Fix: ${suggestedFix}`]),
    error,
  });
}

function isAdmittedFlag(name: string): name is PlanFlagName {
  return (ADMITTED_FLAGS as readonly string[]).includes(name);
}

function parseBoundedInt(raw: string, max: number): number | undefined {
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) return undefined;
  return n;
}

/**
 * Parse plan argv. Fail-closed: unknown flags, duplicates, missing values,
 * equals-form, positionals, and not-yet-admitted live-probe flags all refuse.
 */
export function parsePlanArgs(args: readonly string[]):
  | { readonly ok: true; readonly options: PlanCommandOptions }
  | { readonly ok: false; readonly result: CliResult } {
  let workspacePath = "";
  let requestedTarget: PlanRuntimeTarget | null = null;
  let memoryOverride: number | null = null;
  let parallelismOverride: number | null = null;
  let reportDir = "";
  let json = false;
  let compatibilityOnly = false;
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string" || a.length === 0) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PLAN_001,
          PLAN_EXIT_USAGE,
          "Plan received an empty argument.",
          "Pass only admitted plan flags.",
        ),
      };
    }
    if (a.startsWith("--") && a.includes("=")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PLAN_001,
          PLAN_EXIT_USAGE,
          "Plan does not accept --flag=value forms.",
          "Pass --flag <value> with a separate argument.",
        ),
      };
    }
    if (!a.startsWith("--")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PLAN_001,
          PLAN_EXIT_USAGE,
          "Plan does not accept positional arguments.",
          "Pass inputs through --workspace / --target / --memory / --parallelism / --report.",
        ),
      };
    }
    if (!isAdmittedFlag(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PLAN_001,
          PLAN_EXIT_USAGE,
          "Plan received an unknown flag.",
          "Use only --workspace, --target, --memory, --parallelism, --report, --json, --compatibility (and note --runtime/--energy/--graph are not admitted yet).",
        ),
      };
    }
    if (seen.has(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PLAN_001,
          PLAN_EXIT_USAGE,
          "A plan flag was given more than once.",
          "Pass each flag at most once.",
        ),
      };
    }
    seen.add(a);

    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--compatibility") {
      compatibilityOnly = true;
      continue;
    }
    if (a === "--runtime" || a === "--energy" || a === "--graph") {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PLAN_004,
          PLAN_EXIT_USAGE,
          "Plan flag is not admitted yet.",
          "Omit --runtime / --energy / --graph until live plan probes land.",
        ),
      };
    }

    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_PLAN_001,
          PLAN_EXIT_USAGE,
          "Plan flag is missing its value.",
          "Pass --flag <value> with a non-flag value argument.",
        ),
      };
    }
    i += 1;

    if (a === "--workspace") {
      workspacePath = next;
      continue;
    }
    if (a === "--report") {
      reportDir = next;
      continue;
    }
    if (a === "--target") {
      if (!isPlanRuntimeTarget(next)) {
        return {
          ok: false,
          result: refuse(
            FUNGI_CLI_PLAN_001,
            PLAN_EXIT_USAGE,
            "Plan target is outside the closed vocabulary.",
            "Pass --target with an admitted PlanRuntimeTarget token.",
          ),
        };
      }
      requestedTarget = next;
      continue;
    }
    if (a === "--memory") {
      const n = parseBoundedInt(next, MAX_MEMORY_MB);
      if (n === undefined) {
        return {
          ok: false,
          result: refuse(
            FUNGI_CLI_PLAN_001,
            PLAN_EXIT_USAGE,
            "Plan memory override is outside the closed domain.",
            "Pass --memory with a non-negative safe integer within bounds.",
          ),
        };
      }
      memoryOverride = n;
      continue;
    }
    if (a === "--parallelism") {
      const n = parseBoundedInt(next, MAX_PARALLELISM);
      if (n === undefined) {
        return {
          ok: false,
          result: refuse(
            FUNGI_CLI_PLAN_001,
            PLAN_EXIT_USAGE,
            "Plan parallelism override is outside the closed domain.",
            "Pass --parallelism with a non-negative safe integer within bounds.",
          ),
        };
      }
      parallelismOverride = n;
      continue;
    }
  }

  if (workspacePath.length === 0) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_PLAN_002,
        PLAN_EXIT_USAGE,
        "Plan requires a workspace input.",
        "Pass --workspace <file> naming a closed PlanWorkspaceInput JSON object.",
      ),
    };
  }

  return {
    ok: true,
    options: Object.freeze({
      workspacePath,
      requestedTarget,
      memoryOverride,
      parallelismOverride,
      ...(reportDir.length > 0 ? { reportDir } : {}),
      json,
      compatibilityOnly,
    }),
  };
}

async function readJsonObject(
  path: string,
  cwd: string,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly result: CliResult }> {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  let text: string;
  try {
    text = await readFile(absolute, "utf8");
  } catch {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_PLAN_003,
        PLAN_EXIT_VALIDATION,
        "Plan could not read the workspace input.",
        "Pass --workspace naming a readable JSON file.",
      ),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_PLAN_003,
        PLAN_EXIT_VALIDATION,
        "Plan workspace input is not valid JSON.",
        "Provide a JSON object matching PlanWorkspaceInput.",
      ),
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_PLAN_003,
        PLAN_EXIT_VALIDATION,
        "Plan workspace input must be a JSON object.",
        "Provide a plain object matching PlanWorkspaceInput.",
      ),
    };
  }
  return { ok: true, value: parsed };
}

function buildOptions(command: PlanCommandOptions): PlanOptions {
  if (command.compatibilityOnly) {
    return Object.freeze({
      includeGpu: false,
      includeOptical: false,
      includeWasm: false,
      includeCompatibility: true,
      requestedTarget: command.requestedTarget,
    });
  }
  return Object.freeze({
    includeGpu: true,
    includeOptical: true,
    includeWasm: true,
    includeCompatibility: true,
    requestedTarget: command.requestedTarget,
  });
}

function applyOverrides(workspace: unknown, command: PlanCommandOptions): unknown {
  if (command.memoryOverride === null && command.parallelismOverride === null) return workspace;
  if (workspace === null || typeof workspace !== "object" || Array.isArray(workspace)) return workspace;
  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(workspace)) {
    if (typeof key !== "string") continue;
    const d = Object.getOwnPropertyDescriptor(workspace, key);
    if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) continue;
    copy[key] = d.value;
  }
  if (command.memoryOverride !== null) copy.estimatedMemoryMb = command.memoryOverride;
  if (command.parallelismOverride !== null) copy.parallelism = command.parallelismOverride;
  return copy;
}

/** Run `galerina plan`. Never throws to the CLI host. */
export async function runPlanCommand(context: CliContext): Promise<CliResult> {
  const parsed = parsePlanArgs(context.args);
  if (!parsed.ok) return parsed.result;
  const options = parsed.options;

  const loaded = await readJsonObject(options.workspacePath, context.cwd);
  if (!loaded.ok) return loaded.result;

  const workspaceInput = applyOverrides(loaded.value, options);
  const plan = estimateTarget(workspaceInput, buildOptions(options));

  if (plan.diagnostics.length > 0) {
    return refuse(
      FUNGI_CLI_PLAN_001,
      PLAN_EXIT_VALIDATION,
      "Plan workspace failed closed-shape validation.",
      "Provide a closed PlanWorkspaceInput object with admitted tokens and finite non-negative integers only.",
    );
  }

  let reportJson: string | undefined;
  if (options.reportDir !== undefined) {
    const absolute = isAbsolute(options.reportDir) ? options.reportDir : resolve(context.cwd, options.reportDir);
    try {
      const written = await writeComputePlanReport(plan, absolute);
      reportJson = renderComputePlanReport(written.report);
    } catch {
      return refuse(
        FUNGI_CLI_PLAN_005,
        PLAN_EXIT_USAGE,
        "Plan could not write compute-plan.json.",
        "Pass --report naming an existing empty-of-report directory (exclusive create; no overwrite).",
      );
    }
  } else if (options.json === true) {
    reportJson = renderComputePlanReport(createComputePlanReport(plan));
  }

  const details: string[] = [];
  if (reportJson !== undefined) {
    details.push(reportJson);
  } else {
    details.push("Plan completed.");
    details.push(`Use --report <dir> to emit ${COMPUTE_PLAN_REPORT_FILE}.`);
  }

  return Object.freeze({
    ok: true as const,
    code: PLAN_EXIT_OK,
    message: "Plan completed.",
    details: Object.freeze(details),
  });
}
