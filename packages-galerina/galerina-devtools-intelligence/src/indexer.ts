// =============================================================================
// galerina-devtools-intelligence — Workspace Indexer
//
// Walk all .spore files in a directory, parse each, extract IndexedFlow objects,
// and save as workspace.lindex (JSON).
//
// Supports incremental update: files whose mtime hasn't changed are skipped
// and existing IndexedFlow entries are preserved.
// =============================================================================

import { readdir, readFile, stat, writeFile, readFile as readFileAsync } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { createHash, createHmac } from "node:crypto";
import { parseProgram } from "@galerina/core-compiler";
import { extractFlows } from "./extractor.js";
import type { IndexedFlow, WorkspaceIndex } from "./types.js";

const INDEX_FILENAME = "workspace.lindex";
const INDEX_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// SPORE-INTEL-001 — index integrity (anti poisoned-index)
//
// The .lindex is a CACHE whose `flows`/`fileHashes` are TRUSTED on an incremental build (a file whose
// stored hash matches is not re-parsed — its cached flows are reused). An attacker who can write the
// .lindex could therefore pair FABRICATED flows with a correct content hash and have them trusted
// unverified. We bind the whole index under an integrity tag and re-verify it on load; any mismatch /
// absence DISCARDS the cache and forces a full re-parse (fail-closed). With GALERINA_INDEX_HMAC_KEY set
// the tag is an HMAC (tamper-RESISTANT — unforgeable without the key); without it, a SHA-256 digest
// (tamper-EVIDENT — catches corruption + naive edits; a write-capable attacker can recompute it, so
// set the key in untrusted-FS environments).
// ---------------------------------------------------------------------------

/** Deterministic serialization of the index for the integrity tag (excludes `integrity` itself). */
function serializeForIntegrity(index: WorkspaceIndex): string {
  return JSON.stringify({
    version: index.version,
    builtAt: index.builtAt,
    workspaceDir: index.workspaceDir,
    flows: index.flows,
    fileHashes: index.fileHashes ?? {},
    skippedFiles: index.skippedFiles ?? 0,
  });
}

/** Compute the SPORE-INTEL-001 integrity tag (HMAC if keyed, else SHA-256 digest). */
export function computeIndexIntegrity(index: WorkspaceIndex): string {
  const data = serializeForIntegrity(index);
  const key = process.env.GALERINA_INDEX_HMAC_KEY;
  if (key !== undefined && key.length > 0) {
    return "hmac-sha256:" + createHmac("sha256", key).update(data, "utf8").digest("hex");
  }
  return "sha256:" + createHash("sha256").update(data, "utf8").digest("hex");
}

/** True iff `index.integrity` matches a fresh recompute (constant-time compare). */
export function verifyIndexIntegrity(index: WorkspaceIndex): boolean {
  const stored = index.integrity;
  if (typeof stored !== "string" || stored.length === 0) return false; // no tag → fail-closed
  const expected = computeIndexIntegrity(index);
  if (stored.length !== expected.length) return false;
  // constant-time compare (avoid a timing oracle on the tag)
  let diff = 0;
  for (let i = 0; i < stored.length; i++) diff |= stored.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// File system walk
// ---------------------------------------------------------------------------

async function walkLlnFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function recurse(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and dist
        if (entry.name !== "node_modules" && entry.name !== "dist" && !entry.name.startsWith(".")) {
          await recurse(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(".spore")) {
        results.push(fullPath);
      }
    }
  }

  await recurse(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Index load / save
// ---------------------------------------------------------------------------

async function loadExistingIndex(indexPath: string): Promise<WorkspaceIndex | null> {
  try {
    const raw = await readFileAsync(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" && parsed !== null &&
      (parsed as WorkspaceIndex).version === INDEX_VERSION
    ) {
      // SPORE-INTEL-001: never trust a cached index that fails its integrity tag (poisoned/corrupt) —
      // discard it and let the caller fully re-parse (fail-closed). Never silent.
      if (!verifyIndexIntegrity(parsed as WorkspaceIndex)) {
        console.warn(`SPORE-INTEL-001: ${INDEX_FILENAME} integrity check FAILED — discarding cached index, full re-parse (a poisoned/corrupt index is not trusted)`);
        return null;
      }
      return parsed as WorkspaceIndex;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveIndex(indexPath: string, index: WorkspaceIndex): Promise<void> {
  // Bind the index under its integrity tag BEFORE writing (computed over every other field).
  const sealed: WorkspaceIndex = { ...index, integrity: computeIndexIntegrity(index) };
  await writeFile(indexPath, JSON.stringify(sealed, null, 2), "utf-8");
}

/**
 * SPORE-INTEL-002: refuse a path-traversal `indexDir`. A raw `..` segment (CWE-22) is rejected so an
 * indexDir derived from untrusted input cannot escape its intended root and plant/overwrite a
 * `workspace.lindex` elsewhere. A deliberate absolute or sub-path with NO `..` segment is allowed
 * (a trusted caller may legitimately write the index to a separate cache dir).
 */
function assertIndexDirSandboxed(indexDir: string | undefined): void {
  if (indexDir === undefined) return; // default (= workspaceDir) is safe
  if (indexDir.split(/[\\/]+/).includes("..")) {
    throw new Error(`SPORE-INTEL-002: indexDir contains a '..' path-traversal segment — refusing to write ${INDEX_FILENAME} (CWE-22)`);
  }
}

// ---------------------------------------------------------------------------
// Public: buildIndex
// ---------------------------------------------------------------------------

export interface IndexBuildResult {
  /** Total flows indexed */
  flowCount: number;
  /** Files newly indexed (parsed this run) */
  filesIndexed: number;
  /** Files skipped because mtime unchanged */
  filesSkipped: number;
  /** Path to the .lindex file */
  indexPath: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Build or incrementally update the workspace.lindex file for `workspaceDir`.
 *
 * @param workspaceDir  Directory to walk for .spore files
 * @param indexDir      Where to write workspace.lindex (defaults to workspaceDir)
 */
export async function buildIndex(
  workspaceDir: string,
  indexDir?: string,
): Promise<IndexBuildResult> {
  const t0 = Date.now();
  assertIndexDirSandboxed(indexDir); // SPORE-INTEL-002 — reject path-traversal before any write
  const absWorkspace = resolve(workspaceDir);
  const absIndexDir  = resolve(indexDir ?? workspaceDir);
  const indexPath    = join(absIndexDir, INDEX_FILENAME);

  // Load existing index for incremental support
  const existing = await loadExistingIndex(indexPath);
  const existingByPath = new Map<string, IndexedFlow[]>();
  const existingFileHashes: Record<string, string> = existing?.fileHashes ?? {};
  if (existing !== null) {
    for (const flow of existing.flows) {
      const arr = existingByPath.get(flow.filePath) ?? [];
      arr.push(flow);
      existingByPath.set(flow.filePath, arr);
    }
  }

  // Walk workspace for .spore files
  const llnFiles = await walkLlnFiles(absWorkspace);

  const allFlows: IndexedFlow[] = [];
  const newFileHashes: Record<string, string> = {};
  let filesIndexed = 0;
  let filesSkipped = 0;

  for (const filePath of llnFiles) {
    // Check mtime for incremental (fast pre-filter)
    let mtime = 0;
    try {
      const st = await stat(filePath);
      mtime = st.mtimeMs;
    } catch {
      // Skip unreadable files
      continue;
    }

    // Read file content for SHA-256 differential check
    let source = "";
    try {
      source = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    // Compute SHA-256 of file content
    const contentHash = createHash("sha256").update(source, "utf8").digest("hex");
    newFileHashes[filePath] = contentHash;

    // Skip if content hash matches existing index (content unchanged)
    const existingFlows = existingByPath.get(filePath);
    if (
      existingFlows !== undefined &&
      existingFlows.length > 0 &&
      existingFileHashes[filePath] === contentHash
    ) {
      // File content unchanged — reuse existing indexed flows
      allFlows.push(...existingFlows);
      filesSkipped++;
      continue;
    }

    // Parse and extract
    const parseResult = parseProgram(source, relative(absWorkspace, filePath));
    const flows = extractFlows({ parseResult, filePath, source, sourceMtime: mtime });
    allFlows.push(...flows);
    filesIndexed++;
  }

  const index: WorkspaceIndex = {
    version: INDEX_VERSION,
    builtAt: new Date().toISOString(),
    workspaceDir: absWorkspace,
    flows: allFlows,
    fileHashes: newFileHashes,
    skippedFiles: filesSkipped,
  };

  await saveIndex(indexPath, index);

  return {
    flowCount: allFlows.length,
    filesIndexed,
    filesSkipped,
    indexPath,
    durationMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Public: loadIndex
// ---------------------------------------------------------------------------

export async function loadIndex(workspaceDir: string): Promise<IndexedFlow[]> {
  const indexPath = join(resolve(workspaceDir), INDEX_FILENAME);
  const index = await loadExistingIndex(indexPath);
  return index?.flows ?? [];
}
