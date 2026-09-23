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
  MAX_INDEX_BYTES,
  MAX_INDEX_TERM_EDGES,
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

export interface LoadGraphOptions {
  /** Tests may tighten this ceiling; callers cannot raise the fixed maximum. */
  maxIndexBytes?: number;
}

export interface SaveGraphOptions {
  /** Tests may tighten this ceiling; callers cannot raise the fixed maximum. */
  maxTermEdges?: number;
}

// Resolve a caller-supplied term-edge ceiling against the fixed contract
// maximum. A request to RAISE the ceiling is not honoured and not an error —
// it silently clamps — because the persisted format's limit is the reader's
// guarantee, and a writer that could lift it would put files on disk that no
// reader will accept. Tightening is allowed so tests can exercise the refusal
// without building a multi-million-edge fixture.
export function clampTermEdgeCeiling(requested: number | undefined): number {
  if (
    requested === undefined
    || !Number.isSafeInteger(requested)
    || requested < 0
  ) {
    return MAX_INDEX_TERM_EDGES;
  }
  return Math.min(requested, MAX_INDEX_TERM_EDGES);
}

function indexPath(root: string): string {
  return path.join(root, INDEX_DIR, INDEX_FILE);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// Why a save can decline to write. `ok` is the normal path; `term-edge-ceiling`
// means the graph is larger than the reader will ever accept back.
export type SaveOutcome =
  | { written: true }
  | { written: false; reason: "term-edge-ceiling"; edges: number; limit: number }
  | { written: false; reason: "invalid-payload" }
  | { written: false; reason: "unsafe-path" };

// Write the graph to <root>/.myco/index.json (creating the dir if needed).
//
// The writer enforces the SAME ceiling the reader enforces. Without this the
// two halves of the contract disagree: `saveGraph` would happily persist an
// index that `validateStoredIndex` rejects on sight, so every later run would
// discard the cache, rebuild it, and write the identical rejected file again —
// a cache that can never hit, costing a full re-index forever with nothing said
// out loud. Declining to write is the honest outcome: the caller is told, and
// no poisoned artifact is left on disk pretending to be a usable cache.
export async function saveGraph(
  root: string,
  graph: SearchGraph,
  options: SaveGraphOptions = {},
): Promise<SaveOutcome> {
  const limit = clampTermEdgeCeiling(options.maxTermEdges);
  const edges = graph.termEdgeCount();
  if (edges > limit) {
    return { written: false, reason: "term-edge-ceiling", edges, limit };
  }
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
  const validated = validateStoredIndex(payload, {
    ...DEFAULT_INDEX_LIMITS,
    maxTermEdges: limit,
  });
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

// Why a load produced no graph. `absent` = nothing to read (a genuine first
// run); `rejected` = an index EXISTS on disk but failed the contract.
//
// These are different facts and must not share a signal. Collapsing them to
// `null` is what let an over-ceiling index report itself as "first run" on
// every invocation: a refusal rendering as an absence, so the user sees a slow
// tool rather than a stated reason and has nothing to act on.
export type LoadStatus = "ok" | "absent" | "rejected" | "unsafe";

// Load the graph from disk, or null if there is no (compatible) index yet.
// Kept for callers that only need the graph; `loadGraphOutcome` is the form
// that can tell "no index" apart from "index refused".
export async function loadGraph(
  root: string,
  options: LoadGraphOptions = {},
): Promise<{ graph: SearchGraph; meta: IndexMeta } | null> {
  const outcome = await loadGraphOutcome(root, options);
  return outcome.status === "ok"
    ? { graph: outcome.graph, meta: outcome.meta }
    : null;
}

// Load the graph and SAY WHY when there is none.
export async function loadGraphOutcome(
  root: string,
  options: LoadGraphOptions = {},
): Promise<
  | { status: "ok"; graph: SearchGraph; meta: IndexMeta }
  | { status: "absent" | "rejected" | "unsafe" }
> {
  const maxIndexBytes = options.maxIndexBytes ?? MAX_INDEX_BYTES;
  if (
    !Number.isSafeInteger(maxIndexBytes)
    || maxIndexBytes < 1
    || maxIndexBytes > MAX_INDEX_BYTES
  ) {
    return { status: "rejected" };
  }
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
    if (stat.size > maxIndexBytes) {
      return { status: "rejected" };
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
