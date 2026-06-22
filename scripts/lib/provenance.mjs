// provenance.mjs — TASK-BLD-003 / #216: a build-provenance stamp for generated artifacts so "what produced this,
// at what git commit, when" is auditable + freshness is checkable. Generators (code-index/gen-code-registry/kb-index)
// write a sidecar `provenance.json` next to their artifact via writeProvenance(); audit-provenance.mjs reads it.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export function gitCommit(root = process.cwd()) {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return null; }
}

/** Build the provenance block: tool name, the HEAD commit at generation time, an ISO timestamp, and the node version. */
export function provenance(tool, root = process.cwd()) {
  return { tool, gitCommit: gitCommit(root), builtAt: new Date().toISOString(), node: process.version };
}

/** Write `<outDir>/provenance.json` for a generated artifact. Called by each generator after it writes its artifact. */
export function writeProvenance(outDir, tool, root = process.cwd()) {
  const block = provenance(tool, root);
  writeFileSync(join(outDir, "provenance.json"), JSON.stringify(block, null, 2) + "\n");
  return block;
}
