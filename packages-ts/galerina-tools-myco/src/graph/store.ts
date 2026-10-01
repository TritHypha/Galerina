// store.ts — persist and reload the search graph.
//
// Only the FORWARD index is written to disk (each file with its term counts);
// the inverted and name indexes are rebuilt in memory by SearchGraph.setFile()
// on load. That keeps the on-disk format small and makes it the single source
// of truth for incremental re-indexing.
//
// The index lives at <root>/.myco/index.json. We deliberately do NOT store the
// absolute root path — it is derived from where the index file sits — so the
// artifact never embeds a machine-specific path.

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

import {
  DEFAULT_INDEX_LIMITS,
  validateStoredIndex,
} from "./index-contract.ts";
import type { StoredFile, StoredIndex } from "./index-contract.ts";
import { SearchGraph } from "./model.ts";
import type { TermCounts } from "./model.ts";

const FORMAT = 1;
export const INDEX_DIR = ".myco";
export const INDEX_FILE = "index.json";

export interface IndexMeta {
  createdAt: number;
  fileCount: number;
  termCount: number;
  omittedOverlongTerms: number;
  filesWithOmittedOverlongTerms: number;
}

function indexPath(root: string): string {
  return path.join(root, INDEX_DIR, INDEX_FILE);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// A structurally invalid payload is the only graph-contract refusal. There is
// no fixed aggregate file, edge, or serialized-byte budget.
export type SaveOutcome =
  | { written: true }
  | { written: false; reason: "invalid-payload" }
  | { written: false; reason: "unsafe-path" };

// Write the graph to <root>/.myco/index.json (creating the dir if needed).
//
export async function saveGraph(
  root: string,
  graph: SearchGraph,
): Promise<SaveOutcome> {
  const files: StoredFile[] = [];
  for (const rec of graph.files()) {
    const counts = graph.forwardOf(rec.id);
    if (!counts) continue;
    const stored: StoredFile = {
      p: rec.path,
      m: rec.mtimeMs,
      s: rec.size,
      t: [...counts].sort(([left], [right]) => compareCodeUnits(left, right)),
    };
    // Persist name-only reason so a reload does not re-open content search.
    if (rec.contentSkip === "binary") stored.k = "b";
    else if (rec.contentSkip === "large") stored.k = "l";
    else if (rec.omittedOverlongTerms) stored.o = rec.omittedOverlongTerms;
    files.push(stored);
  }
  files.sort((left, right) => compareCodeUnits(left.p, right.p));
  const payload: StoredIndex = { format: FORMAT, createdAt: Date.now(), files };
  const validated = validateStoredIndex(payload, DEFAULT_INDEX_LIMITS);
  if (validated === null) {
    return { written: false, reason: "invalid-payload" };
  }
  const dir = await admitCacheDirectory(root);
  if (dir === null) {
    return { written: false, reason: "unsafe-path" };
  }
  const dest = path.join(dir, INDEX_FILE);
  try {
    await fs.readlink(dest);
    return { written: false, reason: "unsafe-path" };
  } catch {
    // ENOENT / EINVAL / UNKNOWN: dest is missing or not a symlink.
  }
  try {
    const fileStat = await fs.lstat(dest);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      return { written: false, reason: "unsafe-path" };
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      return { written: false, reason: "unsafe-path" };
    }
  }
  const tmp = path.join(dir, `.${INDEX_FILE}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  try {
    const handle = await fs.open(tmp, "wx");
    try {
      await handle.writeFile(JSON.stringify(validated), "utf8");
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, dest);
  } catch {
    await fs.unlink(tmp).catch(() => undefined);
    return { written: false, reason: "unsafe-path" };
  }
  return { written: true };
}

async function admitCacheDirectory(root: string): Promise<string | null> {
  let rootStat;
  try {
    rootStat = await fs.lstat(root);
  } catch {
    return null;
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return null;
  const dir = path.join(root, INDEX_DIR);
  try {
    const existing = await fs.lstat(dir);
    if (existing.isSymbolicLink() || !existing.isDirectory()) return null;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") return null;
    try {
      await fs.mkdir(dir);
    } catch {
      return null;
    }
    try {
      const created = await fs.lstat(dir);
      if (created.isSymbolicLink() || !created.isDirectory()) return null;
    } catch {
      return null;
    }
  }
  try {
    const realRoot = await fs.realpath(root);
    const realDir = await fs.realpath(dir);
    const relativeDir = path.relative(realRoot, realDir);
    if (relativeDir !== INDEX_DIR) return null;
  } catch {
    return null;
  }
  return dir;
}

// Why a load produced no graph. `absent` = nothing to read; `rejected` = a malformed
// index EXISTS on disk. These facts must not share a signal.
export type LoadStatus = "ok" | "absent" | "rejected" | "unsafe";

// Load the graph from disk, or null if there is no (compatible) index yet.
// Kept for callers that only need the graph; `loadGraphOutcome` is the form
// that can tell "no index" apart from "index refused".
export async function loadGraph(
  root: string,
): Promise<{ graph: SearchGraph; meta: IndexMeta } | null> {
  const outcome = await loadGraphOutcome(root);
  return outcome.status === "ok"
    ? { graph: outcome.graph, meta: outcome.meta }
    : null;
}

// Load the graph and SAY WHY when there is none.
export async function loadGraphOutcome(
  root: string,
): Promise<
  | { status: "ok"; graph: SearchGraph; meta: IndexMeta }
  | { status: "absent" | "rejected" | "unsafe" }
> {
  let text: string;
  try {
    const requestedIndex = indexPath(root);
    const cacheDir = path.join(root, INDEX_DIR);
    try {
      const cacheStat = await fs.lstat(cacheDir);
      if (cacheStat.isSymbolicLink() || !cacheStat.isDirectory()) {
        return { status: "unsafe" };
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return { status: "absent" };
      }
      return { status: "rejected" };
    }
    const [realRoot, realIndex] = await Promise.all([
      fs.realpath(root),
      fs.realpath(requestedIndex),
    ]);
    const relativeIndex = path.relative(realRoot, realIndex);
    if (
      relativeIndex === ""
      || relativeIndex === ".."
      || relativeIndex.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeIndex)
    ) {
      return { status: "unsafe" };
    }
    const stat = await fs.lstat(requestedIndex);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { status: "unsafe" };
    }
    text = await fs.readFile(requestedIndex, "utf8");
  } catch (error: unknown) {
    // Only a genuinely missing path is absence. Permission failures, invalid
    // paths and I/O faults are rejected evidence, never a reassuring first run.
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return { status: "absent" };
    }
    return { status: "rejected" };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    return { status: "rejected" }; // a file IS there; it is corrupt, not missing
  }
  const data = validateStoredIndex(decoded);
  if (data === null) return { status: "rejected" };

  const graph = new SearchGraph();
  try {
    for (const f of data.files) {
      const counts: TermCounts = new Map(f.t);
      const skip = f.k === "b" ? "binary" as const : f.k === "l" ? "large" as const : undefined;
      graph.setFile(f.p, f.m, f.s, counts, skip, f.o ?? 0);
    }
  } catch {
    return { status: "rejected" };
  }
  return {
    status: "ok",
    graph,
    meta: {
      createdAt: data.createdAt,
      fileCount: graph.fileCount(),
      termCount: graph.termCount(),
      omittedOverlongTerms: data.files.reduce((sum, file) => sum + (file.o ?? 0), 0),
      filesWithOmittedOverlongTerms: data.files.filter((file) => (file.o ?? 0) > 0).length,
    },
  };
}
