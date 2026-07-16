// lib/find-files.mjs — THE shared file-finder for dev tools (owner-directed 2026-07-16): every dev
// tool that discovers files uses THIS, never its own globs. Two verified failure classes it encodes:
//
//   1. git pathspec quirk: `src/**/*.ts` alone MISSES files sitting directly under src/ (67 vs 431 in
//      the live tree — the secret-gate pair was missed exactly this way). findTracked() always queries
//      BOTH glob forms and de-dups.
//   2. graph-finder query shape: myco's word-mode dotted query under-matched extensions pre-0.1.1
//      (283/447). graphFind() uses the robust token+endsWith shape AND cross-checks coverage against
//      the git index (the tracked-corpus source of truth) — a finder hole becomes a reported DRIFT,
//      never a silently smaller corpus. (audit-fungi-corpus-check.mjs is the reference consumer.)
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MYCO = resolve(ROOT, "packages-galerina", "galerina-tools-myco", "dist", "cli.js");
const SPAWN = { encoding: "utf8", shell: false }; // node/git are real exes — no shell, no DEP0190

/** Tracked files for a base glob — queries BOTH `<base>/*.ext` and `<base>/**\/*.ext` forms (quirk #1). */
export function findTracked(...globs) {
  const expanded = [...new Set(globs.flatMap((g) =>
    g.includes("/**/") ? [g, g.replace("/**/", "/")] : g.includes("*") ? [g] : [g]))];
  const r = spawnSync("git", ["ls-files", ...expanded], { ...SPAWN, cwd: ROOT, timeout: 60000 });
  return [...new Set((r.stdout ?? "").split(/\r?\n/).map((s) => s.trim().replace(/\\/g, "/")).filter(Boolean))];
}

/** Graph-finder (myco) filename search for an extension; null when unavailable/truncated (degrade loudly). */
export function graphFindByExt(ext, { limit = 40000 } = {}) {
  if (!existsSync(MYCO)) return null;
  // myco 0.1.1: a leading-dot filename query IS an extension match (the 0.1.0 word-mode under-match
  // was fixed at the root). If an older dist under-matches, the git-union + drift report catch it.
  const r = spawnSync("node", [MYCO, "-f", ext, ROOT, "--json", "--no-color", "-n", String(limit)], { ...SPAWN, timeout: 180000 });
  const stdout = r.stdout ?? ""; const j = stdout.indexOf("{"); // an index-refresh banner may precede the JSON
  if (j < 0) return null;
  try {
    const parsed = JSON.parse(stdout.slice(j));
    if (parsed.summary?.truncated) return null;
    return [...new Set((parsed.matches ?? []).map((m) => String(m.path ?? "").replace(/\\/g, "/")).filter((p) => p.endsWith(ext)))];
  } catch { return null; }
}

/**
 * The standard corpus find: graph finder ∪ git index, with finder-drift accounting.
 * Returns { files, finder, finderDrift } — drift = tracked files the graph finder missed (report it;
 * the union keeps the corpus complete either way). scope = optional path-prefix regex.
 */
export function findCorpus(ext, trackedGlobs, scopeRe) {
  const inScope = (p) => (scopeRe ? scopeRe.test(p) : true);
  const tracked = findTracked(...trackedGlobs).filter((p) => p.endsWith(ext) && inScope(p));
  const viaGraph = graphFindByExt(ext);
  if (viaGraph === null) return { files: tracked, finder: "git index only (graph finder unavailable)", finderDrift: -1 };
  const graphScoped = viaGraph.filter(inScope);
  const files = [...new Set([...graphScoped, ...tracked])].sort();
  const finderDrift = tracked.filter((f) => !graphScoped.includes(f)).length;
  return { files, finder: `myco graph (${graphScoped.length}) ∪ git index (${tracked.length})`, finderDrift };
}
