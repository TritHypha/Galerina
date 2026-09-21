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

import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The file whose presence marks a Galerina workspace root. */
export const WORKSPACE_MARKER = "galerina.workspace.json";

function isWindowsDeviceNamespace(p: string): boolean {
  const normalized = p.replace(/\//g, "\\");
  return normalized.startsWith("\\\\?\\") || normalized.startsWith("\\\\.\\");
}

function hasWorkspaceMarker(dir: string): boolean {
  return existsSync(resolve(dir, WORKSPACE_MARKER));
}

type RealExistingResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: "missing" | "unresolvable" };

function realExisting(p: string): RealExistingResult {
  try {
    if (!existsSync(p)) return { ok: false, reason: "missing" };
    return { ok: true, path: realpathSync.native(p) };
  } catch {
    return { ok: false, reason: "unresolvable" };
  }
}

function isContained(root: string, target: string): boolean {
  const rel = relative(root, target);
  if (rel === "") return true;
  if (isAbsolute(rel)) return false;
  return !rel.split(/[\\/]/).includes("..") && !rel.startsWith("..");
}

function attestWorkspaceRoot(dir: string, origin: string): string {
  const resolved = resolve(dir);
  if (isWindowsDeviceNamespace(dir) || isWindowsDeviceNamespace(resolved)) {
    throw new Error(`galerina-test: Windows device-namespace paths are refused (${origin}).`);
  }
  if (!hasWorkspaceMarker(resolved)) {
    throw new Error(
      `galerina-test: ${origin} is not an attested Galerina workspace (no ${WORKSPACE_MARKER}).`,
    );
  }
  return resolved;
}

/** Walk up from `start` looking for `marker`; return the dir holding it, or null. */
function findUp(start: string, marker: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (isWindowsDeviceNamespace(dir)) return null;
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
 *   1. an explicit `rootDir` that contains galerina.workspace.json;
 *   2. $GALERINA_ROOT, attested the same way;
 *   3. the current working directory, walking up to a galerina.workspace.json;
 *   4. this module's location, walking up to a galerina.workspace.json.
 *
 * @throws if none of the above yields a workspace.
 */
export function resolveRoot(rootDir?: string): string {
  if (rootDir) return attestWorkspaceRoot(rootDir, "rootDir");
  const fromEnv = process.env.GALERINA_ROOT;
  if (fromEnv) return attestWorkspaceRoot(fromEnv, "$GALERINA_ROOT");
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
  if (typeof p !== "string" || p.length === 0) {
    throw new Error("galerina-test: target path is empty.");
  }
  if (isWindowsDeviceNamespace(root) || isWindowsDeviceNamespace(p)) {
    throw new Error("galerina-test: Windows device-namespace paths are refused.");
  }
  const resolvedRoot = resolve(root);
  const target = isAbsolute(p) ? resolve(p) : resolve(resolvedRoot, p);
  if (isWindowsDeviceNamespace(target)) {
    throw new Error("galerina-test: Windows device-namespace paths are refused.");
  }
  if (!isContained(resolvedRoot, target)) {
    throw new Error("galerina-test: target escapes the workspace root.");
  }
  const realRoot = realExisting(resolvedRoot);
  const realTarget = realExisting(target);
  // Missing paths stay lexical so resolveTarget can name a file that does not
  // yet exist. Unresolvable realpath is the same containment check on the
  // lexical names; the reason is kept so this is not a silent null collapse.
  const containedRoot = realRoot.ok ? realRoot.path : resolvedRoot;
  const containedTarget = realTarget.ok ? realTarget.path : target;
  if (!isContained(containedRoot, containedTarget)) {
    throw new Error("galerina-test: target escapes the physical workspace root.");
  }
  return target;
}
