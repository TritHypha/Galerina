// =============================================================================
// @galerina/devtools-security — Path Sandbox
//
// Segment-safe filesystem path confinement checking.
// Extracted from stdlib.ts Security Audit F3 fix so it can be:
//   - used standalone in CI (no compiler dep)
//   - tested independently
//   - imported by other packages
//
// The key fix over the naive startsWith approach:
//   startsWith is bypassable:  /app/root2 passes when root = /app/root
//   path.relative is safe:     returns '..' when target escapes root
// =============================================================================

import { resolve, relative, isAbsolute } from "node:path";

export interface PathCheckResult {
  readonly allowed:    boolean;
  readonly reason?:    string;
  readonly resolvedTo: string;
  readonly rel:        string;
}

/**
 * Check whether `userPath` is safely confined within `fsRoot`.
 *
 * Uses path.relative() for segment-safe confinement — the only correct approach.
 * startsWith() is bypassable when root = "/app/root" and path = "/app/root2/evil".
 *
 * @param fsRoot   - The allowed root directory (absolute or relative to cwd)
 * @param userPath - The user-provided path to verify
 */
export function checkPathSandbox(fsRoot: string, userPath: string): PathCheckResult {
  const root       = resolve(fsRoot);
  const target     = resolve(root, userPath);
  const rel        = relative(root, target);
  const escapes    = rel.startsWith("..") || isAbsolute(rel);

  if (escapes) {
    return {
      allowed: false,
      reason: `Path '${userPath}' escapes the allowed root '${fsRoot}' (resolved: '${target}')`,
      resolvedTo: target,
      rel,
    };
  }
  return { allowed: true, resolvedTo: target, rel };
}

/**
 * Quick boolean: does this path escape the sandbox?
 * Returns true when the path is dangerous (should be BLOCKED).
 */
export function isPathEscape(fsRoot: string, userPath: string): boolean {
  return !checkPathSandbox(fsRoot, userPath).allowed;
}

/** Common test cases for path sandbox validation. */
export const PATH_SANDBOX_TEST_VECTORS = [
  { root: "/app", path: "subdir/file.txt",     expectBlocked: false, label: "normal nested path" },
  { root: "/app", path: "../etc/passwd",        expectBlocked: true,  label: "parent traversal" },
  { root: "/app", path: "/etc/passwd",          expectBlocked: true,  label: "absolute outside root" },
  { root: "/app", path: "/app2/evil",           expectBlocked: true,  label: "sibling prefix bypass" },
  { root: "/app", path: "../../../secret",        expectBlocked: true,  label: "multi-level traversal outside root" },
  { root: "/app", path: "a/b/c/d/file.json",   expectBlocked: false, label: "deep nested allowed" },
] as const;
