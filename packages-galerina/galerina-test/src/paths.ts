// Workspace-root resolution + target-path helpers.
//
// The harness drives tooling that lives in a Galerina workspace — scripts/, the R6
// corpus under tests/r6-corpus/, the compiler's fidelity-differential test, and
// the examples/ tree. It locates that workspace by the presence of
// galerina.workspace.json, so it works whether invoked from the package, the repo
// root, or a downstream consumer's own workspace.
//
// Fail-closed: when no workspace root can be found, resolveRoot THROWS rather
// than guessing a directory and silently running nothing.

import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The file whose presence marks a Galerina workspace root. */
export const WORKSPACE_MARKER = "galerina.workspace.json";

/** Walk up from `start` looking for `marker`; return the dir holding it, or null. */
function findUp(start: string, marker: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(resolve(dir, marker))) return dir; // perf-allow: loop-sync-io — one-shot workspace-root walk-up; distinct dir per iteration, returns on first hit
    const parent = dirname(dir);
    if (parent === dir) return null; // hit the filesystem root
    dir = parent;
  }
}

/**
 * Resolve the Galerina workspace root.
 *
 * Order of precedence:
 *   1. an explicit `rootDir` (trusted as-is — a consumer points at their workspace);
 *   2. $GALERINA_ROOT;
 *   3. the current working directory, walking up to a galerina.workspace.json;
 *   4. this module's location, walking up to a galerina.workspace.json.
 *
 * @throws if none of the above yields a workspace.
 */
export function resolveRoot(rootDir?: string): string {
  if (rootDir) return resolve(rootDir);
  const fromEnv = process.env.GALERINA_ROOT;
  if (fromEnv) return resolve(fromEnv);
  const found =
    findUp(process.cwd(), WORKSPACE_MARKER) ??
    findUp(dirname(fileURLToPath(import.meta.url)), WORKSPACE_MARKER);
  if (found) return found;
  throw new Error(
    `galerina-test: could not locate a Galerina workspace (no ${WORKSPACE_MARKER} ` +
      `found from rootDir / $GALERINA_ROOT / cwd). Pass { rootDir } or set $GALERINA_ROOT.`,
  );
}

/** Resolve a target that may be absolute or relative to the workspace root. */
export function resolveTarget(root: string, p: string): string {
  return isAbsolute(p) ? p : resolve(root, p);
}
