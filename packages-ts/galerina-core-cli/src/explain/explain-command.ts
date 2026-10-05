/**
 * `galerina explain` command wiring (zero-trust defaults, owner may revisit).
 *
 * Explains a closed ExplainManifestSlice and/or a closed DeploymentDenial.
 * Optionally writes explain-report.json. Never walks a live dependency tree.
 * Never probes runtime / policy / audit. Never echoes paths, tokens, or keys
 * in diagnostics / default details.
 *
 * Admitted flags: --manifest <file>, --denial <file>, --report <dir>, --json,
 * --trace, --effects, --capabilities. At least one of --manifest / --denial.
 * --tree / --runtime / --policy / --audit are recognized but refused.
 * Exit codes: 0 success, 2 usage, 4 validation (shape/domain refuse).
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { CliContext, CliError, CliResult } from "../types.js";
import {
  explainManifest,
  type ExplainDiagnostic,
  type ExplainOptions,
  type ExplainResult,
} from "./explain-trace.js";
import { explainDenial } from "./explain-denial.js";
import {
  createExplainReport,
  renderExplainReport,
  writeExplainReport,
  EXPLAIN_REPORT_FILE,
} from "./explain-reporter.js";

/** Unknown or duplicate flag / missing value / equals-form / positional. */
export const FUNGI_CLI_EXPLAIN_001 = "FUNGI-CLI-EXPLAIN-001";
/** Required input missing (need --manifest and/or --denial). */
export const FUNGI_CLI_EXPLAIN_002 = "FUNGI-CLI-EXPLAIN-002";
/** Input file unreadable / not JSON / not a plain object. */
export const FUNGI_CLI_EXPLAIN_003 = "FUNGI-CLI-EXPLAIN-003";
/** --tree / --runtime / --policy / --audit not admitted yet. */
export const FUNGI_CLI_EXPLAIN_004 = "FUNGI-CLI-EXPLAIN-004";
/** --report directory unusable (missing, not a dir, or report already exists). */
export const FUNGI_CLI_EXPLAIN_005 = "FUNGI-CLI-EXPLAIN-005";

export const EXPLAIN_EXIT_OK = 0;
export const EXPLAIN_EXIT_USAGE = 2;
export const EXPLAIN_EXIT_VALIDATION = 4;

const ADMITTED_FLAGS = Object.freeze([
  "--manifest",
  "--denial",
  "--report",
  "--json",
  "--trace",
  "--effects",
  "--capabilities",
  "--tree",
  "--runtime",
  "--policy",
  "--audit",
] as const);

export type ExplainFlagName = (typeof ADMITTED_FLAGS)[number];

export interface ExplainCommandOptions {
  readonly manifestPath?: string;
  readonly denialPath?: string;
  readonly reportDir?: string;
  readonly json: boolean;
  readonly trace: boolean;
  readonly effectsOnly: boolean;
  readonly capabilitiesOnly: boolean;
}

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

function isAdmittedFlag(name: string): name is ExplainFlagName {
  return (ADMITTED_FLAGS as readonly string[]).includes(name);
}

/**
 * Parse explain argv. Fail-closed: unknown flags, duplicates, missing values,
 * equals-form, positionals, and not-yet-admitted flags all refuse.
 */
export function parseExplainArgs(args: readonly string[]):
  | { readonly ok: true; readonly options: ExplainCommandOptions }
  | { readonly ok: false; readonly result: CliResult } {
  let manifestPath = "";
  let denialPath = "";
  let reportDir = "";
  let json = false;
  let trace = false;
  let effectsOnly = false;
  let capabilitiesOnly = false;
  const seen = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string" || a.length === 0) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_EXPLAIN_001,
          EXPLAIN_EXIT_USAGE,
          "Explain received an empty argument.",
          "Pass only admitted explain flags.",
        ),
      };
    }
    if (a.startsWith("--") && a.includes("=")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_EXPLAIN_001,
          EXPLAIN_EXIT_USAGE,
          "Explain does not accept --flag=value forms.",
          "Pass --flag <value> with a separate argument.",
        ),
      };
    }
    if (!a.startsWith("--")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_EXPLAIN_001,
          EXPLAIN_EXIT_USAGE,
          "Explain does not accept positional arguments.",
          "Pass inputs through --manifest / --denial / --report.",
        ),
      };
    }
    if (!isAdmittedFlag(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_EXPLAIN_001,
          EXPLAIN_EXIT_USAGE,
          "Explain received an unknown flag.",
          "Use only --manifest, --denial, --report, --json, --trace, --effects, --capabilities (and note --tree/--runtime/--policy/--audit are not admitted yet).",
        ),
      };
    }
    if (seen.has(a)) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_EXPLAIN_001,
          EXPLAIN_EXIT_USAGE,
          "An explain flag was given more than once.",
          "Pass each flag at most once.",
        ),
      };
    }
    seen.add(a);

    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--trace") {
      trace = true;
      continue;
    }
    if (a === "--effects") {
      effectsOnly = true;
      continue;
    }
    if (a === "--capabilities") {
      capabilitiesOnly = true;
      continue;
    }
    if (a === "--tree" || a === "--runtime" || a === "--policy" || a === "--audit") {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_EXPLAIN_004,
          EXPLAIN_EXIT_USAGE,
          "Explain flag is not admitted yet.",
          "Omit --tree / --runtime / --policy / --audit until dependency-tree / runtime / policy / audit explain lands.",
        ),
      };
    }

    const next = args[i + 1];
    if (next === undefined || next.startsWith("-")) {
      return {
        ok: false,
        result: refuse(
          FUNGI_CLI_EXPLAIN_001,
          EXPLAIN_EXIT_USAGE,
          "An explain flag that needs a value was given without one.",
          "Pass --manifest <file>, --denial <file>, or --report <dir>.",
        ),
      };
    }
    i += 1;
    if (a === "--manifest") manifestPath = next;
    else if (a === "--denial") denialPath = next;
    else if (a === "--report") reportDir = next;
  }

  if (manifestPath.length === 0 && denialPath.length === 0) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_EXPLAIN_002,
        EXPLAIN_EXIT_USAGE,
        "Explain requires --manifest <file> and/or --denial <file>.",
        "Pass a closed ExplainManifestSlice and/or DeploymentDenial JSON object.",
      ),
    };
  }

  // --trace is accepted; traces are always produced when inputs validate.
  void trace;

  const options: ExplainCommandOptions = Object.freeze({
    ...(manifestPath.length > 0 ? { manifestPath } : {}),
    ...(denialPath.length > 0 ? { denialPath } : {}),
    ...(reportDir.length > 0 ? { reportDir } : {}),
    json,
    trace,
    effectsOnly,
    capabilitiesOnly,
  });
  return { ok: true, options };
}

async function readJsonObject(
  filePath: string,
  cwd: string,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly result: CliResult }> {
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  let text: string;
  try {
    text = await readFile(absolute, "utf8");
  } catch {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_EXPLAIN_003,
        EXPLAIN_EXIT_USAGE,
        "An explain input file could not be read.",
        "Ensure --manifest / --denial names a readable UTF-8 JSON object.",
      ),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_EXPLAIN_003,
        EXPLAIN_EXIT_USAGE,
        "An explain input file was not valid JSON.",
        "Provide a JSON object matching the closed explain shape.",
      ),
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_EXPLAIN_003,
        EXPLAIN_EXIT_USAGE,
        "An explain input must be a JSON object.",
        "Provide a single closed-shape object (not an array).",
      ),
    };
  }
  return { ok: true, value: parsed };
}

function buildOptions(opts: ExplainCommandOptions): ExplainOptions {
  if (opts.effectsOnly === true && opts.capabilitiesOnly !== true) {
    return Object.freeze({
      includeEffects: true,
      includeCapabilities: false,
      includeBoundaries: false,
      includeImports: false,
    });
  }
  if (opts.capabilitiesOnly === true && opts.effectsOnly !== true) {
    return Object.freeze({
      includeEffects: false,
      includeCapabilities: true,
      includeBoundaries: false,
      includeImports: false,
    });
  }
  if (opts.effectsOnly === true && opts.capabilitiesOnly === true) {
    return Object.freeze({
      includeEffects: true,
      includeCapabilities: true,
      includeBoundaries: false,
      includeImports: false,
    });
  }
  return Object.freeze({
    includeEffects: true,
    includeCapabilities: true,
    includeBoundaries: true,
    includeImports: true,
  });
}

function mergeResults(parts: readonly ExplainResult[]): ExplainResult {
  const traces: ExplainResult["traces"][number][] = [];
  const effects: string[] = [];
  const capabilities: string[] = [];
  const boundaries: string[] = [];
  const diagnostics: ExplainDiagnostic[] = [];
  for (const part of parts) {
    for (const d of part.diagnostics) diagnostics.push(d);
    for (const e of part.effects) {
      if (!effects.includes(e)) effects.push(e);
    }
    for (const c of part.capabilities) {
      if (!capabilities.includes(c)) capabilities.push(c);
    }
    for (const b of part.boundaries) {
      if (!boundaries.includes(b)) boundaries.push(b);
    }
    for (const t of part.traces) {
      traces.push(
        Object.freeze({
          step: traces.length,
          label: t.label,
          input: t.input,
          output: t.output,
          diagnostics: t.diagnostics,
        }),
      );
    }
  }
  effects.sort();
  capabilities.sort();
  boundaries.sort();
  return Object.freeze({
    traces: Object.freeze(traces),
    effects: Object.freeze(effects),
    capabilities: Object.freeze(capabilities),
    boundaries: Object.freeze(boundaries),
    diagnostics: Object.freeze(diagnostics),
  });
}

export async function runExplainCommand(context: CliContext): Promise<CliResult> {
  const parsed = parseExplainArgs(context.args);
  if (!parsed.ok) return parsed.result;
  const { options } = parsed;
  const parts: ExplainResult[] = [];

  if (options.manifestPath !== undefined) {
    const loaded = await readJsonObject(options.manifestPath, context.cwd);
    if (!loaded.ok) return loaded.result;
    parts.push(explainManifest(loaded.value, buildOptions(options)));
  }
  if (options.denialPath !== undefined) {
    const loaded = await readJsonObject(options.denialPath, context.cwd);
    if (!loaded.ok) return loaded.result;
    parts.push(explainDenial(loaded.value));
  }

  const result = mergeResults(parts);
  if (result.diagnostics.length > 0) {
    return refuse(
      FUNGI_CLI_EXPLAIN_001,
      EXPLAIN_EXIT_VALIDATION,
      "Explain input failed closed-shape validation.",
      "Provide closed ExplainManifestSlice / DeploymentDenial objects with admitted tokens only.",
    );
  }

  let reportJson: string | undefined;
  if (options.reportDir !== undefined) {
    const absolute = isAbsolute(options.reportDir) ? options.reportDir : resolve(context.cwd, options.reportDir);
    try {
      const written = await writeExplainReport(result, absolute);
      reportJson = renderExplainReport(written.report);
    } catch {
      return refuse(
        FUNGI_CLI_EXPLAIN_005,
        EXPLAIN_EXIT_USAGE,
        "Explain could not write explain-report.json.",
        "Pass --report naming an existing empty-of-report directory (exclusive create; no overwrite).",
      );
    }
  } else if (options.json === true) {
    reportJson = renderExplainReport(createExplainReport(result));
  }

  const details: string[] = [];
  if (options.trace === true || options.json === true) {
    details.push(`traces=${String(result.traces.length)}`);
  }
  if (reportJson !== undefined) {
    details.push(reportJson);
  } else {
    details.push("Explain completed.");
    if (EXPLAIN_REPORT_FILE.length > 0) {
      details.push(`Use --report <dir> to emit ${EXPLAIN_REPORT_FILE}.`);
    }
  }

  return Object.freeze({
    ok: true as const,
    code: EXPLAIN_EXIT_OK,
    message: "Explain completed.",
    details: Object.freeze(details),
  });
}
