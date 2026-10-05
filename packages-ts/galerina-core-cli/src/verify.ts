// Verify contracts (TODO pass, Grok 2026-10-05): artefact hash verification.
//
// Fail-closed: an artefact verifies only when its expected hash is a well-formed
// sha256 digest, its path stays inside the declared root (no traversal, no absolute
// paths, no symlinks), it is a regular file, and its bytes hash to the expected value.
// Diagnostics never echo file contents.

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type BuildArtefactKind = "manifest" | "bundle" | "report" | "hash" | "map";

export interface BuildArtefact {
  readonly path: string;
  readonly kind: BuildArtefactKind;
  readonly hash: string;
  readonly target: string;
}

export interface VerifyDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

export interface VerifiedArtefact {
  readonly path: string;
  readonly hash: string;
  readonly verified: boolean;
  readonly diagnostics: readonly VerifyDiagnostic[];
}

export interface VerificationResult {
  readonly success: boolean;
  readonly artefacts: readonly VerifiedArtefact[];
  readonly diagnostics: readonly VerifyDiagnostic[];
}

/** Expected hash is not `sha256:<64 lower-case hex>`. */
export const FUNGI_VERIFY_001 = "FUNGI-VERIFY-001";
/** Artefact is missing, unreadable or not a regular file. */
export const FUNGI_VERIFY_002 = "FUNGI-VERIFY-002";
/** Artefact bytes do not hash to the expected value. */
export const FUNGI_VERIFY_003 = "FUNGI-VERIFY-003";
/** Artefact path escapes the verification root (absolute, traversal or symlink). */
export const FUNGI_VERIFY_004 = "FUNGI-VERIFY-004";
/** The artefact set is empty or lists a path twice. */
export const FUNGI_VERIFY_005 = "FUNGI-VERIFY-005";

const SHA256 = /^sha256:[0-9a-f]{64}$/;

const diag = (code: string, message: string, path: string): VerifyDiagnostic => Object.freeze({ code, severity: "error" as const, message, path });

function result(path: string, hash: string, diagnostics: readonly VerifyDiagnostic[]): VerifiedArtefact {
  return Object.freeze({ path, hash, verified: diagnostics.length === 0, diagnostics: Object.freeze([...diagnostics]) });
}

export function sha256File(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** Verify one artefact under `root` against `expected` (defaults to the artefact's own declared hash). */
export async function verifyHash(artefact: BuildArtefact, expected: string = artefact.hash, root = "."): Promise<VerifiedArtefact> {
  const path = artefact.path;
  if (!SHA256.test(expected)) return result(path, "", [diag(FUNGI_VERIFY_001, "Expected hash must be sha256:<64 lower-case hex>.", path)]);
  if (path.length === 0 || isAbsolute(path) || path.split(/[\\/]/).includes("..")) {
    return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact path must be relative and stay inside the verification root.", path)]);
  }
  let bytes: Uint8Array;
  try {
    const rootReal = await realpath(resolve(root));
    const full = resolve(rootReal, path);
    const stat = await lstat(full);
    if (stat.isSymbolicLink()) return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact path is a symbolic link.", path)]);
    if (!stat.isFile()) return result(path, "", [diag(FUNGI_VERIFY_002, "Artefact is not a regular file.", path)]);
    const rel = relative(rootReal, await realpath(full));
    if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact resolves outside the verification root.", path)]);
    bytes = await readFile(full);
  } catch {
    return result(path, "", [diag(FUNGI_VERIFY_002, "Artefact is missing or unreadable.", path)]);
  }
  const actual = sha256File(bytes);
  return actual === expected ? result(path, actual, []) : result(path, actual, [diag(FUNGI_VERIFY_003, "Artefact hash does not match the expected value.", path)]);
}

/** Verify a whole artefact set; success needs a non-empty, duplicate-free set where every artefact verifies. */
export async function verifyArtefacts(artefacts: readonly BuildArtefact[], root = "."): Promise<VerificationResult> {
  const setDiagnostics: VerifyDiagnostic[] = [];
  if (artefacts.length === 0) setDiagnostics.push(diag(FUNGI_VERIFY_005, "No artefacts were given to verify.", ""));
  const seen = new Set<string>();
  for (const artefact of artefacts) {
    if (seen.has(artefact.path)) setDiagnostics.push(diag(FUNGI_VERIFY_005, "Artefact path is listed twice.", artefact.path));
    seen.add(artefact.path);
  }
  const verified: VerifiedArtefact[] = [];
  for (const artefact of artefacts) verified.push(await verifyHash(artefact, artefact.hash, root));
  const diagnostics = [...setDiagnostics, ...verified.flatMap((v) => v.diagnostics)];
  return Object.freeze({ success: diagnostics.length === 0, artefacts: Object.freeze(verified), diagnostics: Object.freeze(diagnostics) });
}
