/**
 * `galerina init` — thin alias of `galerina new app` (W01 L976).
 *
 * Owner ruling 2026-10-05 (owner may revisit): do not fork a second scaffolder;
 * delegate to `scripts/galerina-new.mjs` in `app` mode, which already copies the
 * deny-by-default golden template and refuses to overwrite.
 *
 * Zero-trust: argv only (no shell), fixed script path relative to this package,
 * unknown flags refused, target required, raw paths never echoed in CliError.
 */

import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CliContext, CliError, CliResult } from "./types.js";

export const FUNGI_CLI_INIT_001 = "FUNGI-CLI-INIT-001";
export const FUNGI_CLI_INIT_002 = "FUNGI-CLI-INIT-002";
export const FUNGI_CLI_INIT_003 = "FUNGI-CLI-INIT-003";
export const FUNGI_CLI_INIT_004 = "FUNGI-CLI-INIT-004";
export const FUNGI_CLI_INIT_005 = "FUNGI-CLI-INIT-005";

/** Environment keys the scaffolder may see (SuperGrok C1 #63 NB-1): enough for Node
 *  to start and for reproducible timestamps; secrets in the caller's env are not passed. */
export const INIT_CHILD_ENV_KEYS: readonly string[] = Object.freeze([
  "PATH", "Path", "SystemRoot", "SYSTEMROOT", "HOME", "USERPROFILE", "TEMP", "TMP", "TMPDIR",
  "LANG", "LC_ALL", "SOURCE_DATE_EPOCH",
]);

export function initChildEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of INIT_CHILD_ENV_KEYS) {
    const value = Object.hasOwn(source, key) ? source[key] : undefined;
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

function refuse(code: string, safeMessage: string, suggestedFix: string): CliResult {
  const error: CliError = Object.freeze({ code, safeMessage, suggestedFix });
  return Object.freeze({
    ok: false as const,
    code: 2,
    message: `${code}: ${safeMessage}`,
    details: [`Fix: ${suggestedFix}`],
    error,
  });
}

/** Resolve the repo-root scaffolder from this package's dist/ or src/ location. */
/** Returns the scaffolder path, or "" when it is absent (the caller refuses). */
export async function resolveNewAppScaffolder(fromUrl: string = import.meta.url): Promise<string> {
  const here = dirname(fileURLToPath(fromUrl));
  // packages-ts/galerina-core-cli/{src|dist} -> repo root -> scripts/galerina-new.mjs
  const candidate = resolve(here, "..", "..", "..", "scripts", "galerina-new.mjs");
  try {
    await access(candidate);
    return candidate;
  } catch {
    // Absent scaffolder is reported as a typed refusal by the caller (fail closed).
    return "";
  }
}

/**
 * Parse `init` args. Accepted forms:
 *   init <dir>
 *   init app <dir>
 *   init <dir> --name <name>
 *   init app <dir> --name <name>
 * `package` mode is deliberately refused: `init` means a runnable app.
 */
export function parseInitArgs(args: readonly string[]):
  | { readonly ok: true; readonly targetDir: string; readonly name?: string }
  | { readonly ok: false; readonly result: CliResult } {
  const positionals: string[] = [];
  let name = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (a === "--name") {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("-")) {
        return { ok: false, result: refuse(FUNGI_CLI_INIT_002, "--name was given without a value.", "Pass --name <app-name>.") };
      }
      name = next;
      i++;
      continue;
    }
    if (a.startsWith("--")) {
      return { ok: false, result: refuse(FUNGI_CLI_INIT_003, "Unknown flag was given to init.", "Accepted flags: --name <app-name>.") };
    }
    if (a.startsWith("-")) {
      return { ok: false, result: refuse(FUNGI_CLI_INIT_003, "Unknown flag was given to init.", "Accepted flags: --name <app-name>.") };
    }
    positionals.push(a);
  }

  let targetDir = "";
  if (positionals.length === 1) {
    targetDir = positionals[0] ?? "";
  } else if (positionals.length === 2 && positionals[0] === "app") {
    targetDir = positionals[1] ?? "";
  } else if (positionals.length >= 1 && positionals[0] === "package") {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_INIT_001,
        "galerina init scaffolds a runnable app only.",
        "Use `galerina init <dir>` (or `node scripts/galerina-new.mjs package <dir>` for a package).",
      ),
    };
  } else {
    return {
      ok: false,
      result: refuse(
        FUNGI_CLI_INIT_001,
        "galerina init requires a target directory.",
        "Usage: galerina init <dir> [--name <app-name>]",
      ),
    };
  }

  if (targetDir.length === 0) {
    return { ok: false, result: refuse(FUNGI_CLI_INIT_001, "galerina init requires a target directory.", "Usage: galerina init <dir>") };
  }
  return name.length > 0 ? { ok: true, targetDir, name } : { ok: true, targetDir };
}

export async function runInitCommand(context: CliContext): Promise<CliResult> {
  const parsed = parseInitArgs(context.args);
  if (!parsed.ok) return parsed.result;

  const scaffolder = await resolveNewAppScaffolder();
  if (scaffolder === "") {
    return refuse(
      FUNGI_CLI_INIT_004,
      "The galerina-new app scaffolder was not found next to this CLI package.",
      "Run from a Galerina checkout that contains scripts/galerina-new.mjs.",
    );
  }

  const argv = ["app", parsed.targetDir];
  if (parsed.name !== undefined) argv.push("--name", parsed.name);

  const result = spawnSync(process.execPath, [scaffolder, ...argv], {
    cwd: context.cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: initChildEnvironment(process.env),
  });

  if (result.error !== undefined) {
    return refuse(FUNGI_CLI_INIT_004, "Failed to start the galerina-new app scaffolder.", "Ensure Node can execute scripts/galerina-new.mjs.");
  }

  const status = result.status ?? 1;
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  if (status === 0) {
    return {
      ok: true,
      code: 0,
      message: stdout.length > 0 ? stdout : `Initialized Galerina app at the requested directory (via galerina new app).`,
      ...(stderr.length > 0 ? { details: [stderr] } : {}),
    };
  }
  // The scaffolder already refuses overwrite / missing template; surface its
  // operator message without inventing a second refusal vocabulary.
  // SuperGrok C1 #63 NB-2: the structured error stays path-free; the scaffolder's own
  // local operator output is kept only in details.
  const output = stderr.length > 0 ? stderr : stdout;
  const error: CliError = Object.freeze({
    code: FUNGI_CLI_INIT_005,
    safeMessage: "galerina new app refused the request.",
    suggestedFix: "Use a new or empty target directory; see details for the scaffolder's reason.",
  });
  return Object.freeze({
    ok: false as const,
    code: status,
    message: `${FUNGI_CLI_INIT_005}: galerina new app refused the request.`,
    ...(output.length > 0 ? { details: Object.freeze([output]) } : {}),
    error,
  });
}
