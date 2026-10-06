// Verify contracts (TODO pass, Grok 2026-10-05): artefact hash verification.
//
// Fail-closed for the checked path and opened file identity: an artefact verifies only
// when its hash is well-formed, its path is relative/root-confined, it is a regular
// non-symlink file at validation, and streamed bytes match. Standard Node does not
// provide a portable open-beneath/no-reparse primitive, so this is not race-proof if an
// adversary can concurrently mutate ancestor directories. Diagnostics never echo bytes.

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
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

async function sha256Handle(handle: Awaited<ReturnType<typeof open>>): Promise<string> {
  const hash = createHash("sha256");
  const chunk = new Uint8Array(64 * 1024);
  for (;;) {
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
    if (bytesRead === 0) break;
    hash.update(chunk.subarray(0, bytesRead));
  }
  return `sha256:${hash.digest("hex")}`;
}

function sameFileIdentity(a: { dev: number | bigint; ino: number | bigint }, b: { dev: number | bigint; ino: number | bigint }): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/** Verify one artefact under `root` against `expected` (defaults to the artefact's own declared hash). */
export async function verifyHash(artefact: BuildArtefact, expected?: string, root = "."): Promise<VerifiedArtefact> {
  let path = "";
  let expectedHash: unknown;
  try {
    if (artefact === null || typeof artefact !== "object" || typeof artefact.path !== "string" || typeof root !== "string") {
      return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact and root must have valid runtime shapes.", path)]);
    }
    path = artefact.path;
    expectedHash = expected ?? artefact.hash;
  } catch {
    return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact metadata could not be read safely.", path)]);
  }
  if (typeof expectedHash !== "string" || !SHA256.test(expectedHash)) return result(path, "", [diag(FUNGI_VERIFY_001, "Expected hash must be sha256:<64 lower-case hex>.", path)]);
  if (path.length === 0 || isAbsolute(path) || path.split(/[\\/]/).includes("..")) {
    return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact path must be relative and stay inside the verification root.", path)]);
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const rootReal = await realpath(resolve(root));
    const full = resolve(rootReal, path);
    const rel = relative(rootReal, await realpath(full));
    if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact resolves outside the verification root.", path)]);
    const flags = process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    handle = await open(full, flags);
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile()) return result(path, "", [diag(FUNGI_VERIFY_002, "Artefact is not a regular file.", path)]);
    const current = await lstat(full, { bigint: true });
    if (current.isSymbolicLink() || !current.isFile() || !sameFileIdentity(opened, current)) {
      return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact path changed during secure open or is a symbolic link.", path)]);
    }
    const openedRel = relative(rootReal, await realpath(full));
    if (openedRel.startsWith(`..${sep}`) || openedRel === ".." || isAbsolute(openedRel)) return result(path, "", [diag(FUNGI_VERIFY_004, "Artefact resolves outside the verification root.", path)]);
    const actual = await sha256Handle(handle);
    if (actual === expectedHash) return result(path, actual, []);
    return result(path, actual, [diag(FUNGI_VERIFY_003, "Artefact hash does not match the expected value.", path)]);
  } catch {
    return result(path, "", [diag(FUNGI_VERIFY_002, "Artefact is missing or unreadable.", path)]);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/** Verify a whole artefact set; success needs a non-empty, duplicate-free set where every artefact verifies. */
export async function verifyArtefacts(artefacts: readonly BuildArtefact[], root = "."): Promise<VerificationResult> {
  const setDiagnostics: VerifyDiagnostic[] = [];
  if (!Array.isArray(artefacts)) return Object.freeze({ success: false, artefacts: Object.freeze([]), diagnostics: Object.freeze([diag(FUNGI_VERIFY_005, "Artefact set must be an array.", "")]) });
  if (artefacts.length === 0) setDiagnostics.push(diag(FUNGI_VERIFY_005, "No artefacts were given to verify.", ""));
  const seen = new Set<string>();
  const verified: VerifiedArtefact[] = [];
  for (const artefact of artefacts) {
    let path: unknown;
    try { path = artefact !== null && typeof artefact === "object" ? artefact.path : undefined; } catch { path = undefined; }
    if (typeof path !== "string") {
      verified.push(result("", "", [diag(FUNGI_VERIFY_004, "Artefact path must be a readable string.", "")]));
      continue;
    }
    if (seen.has(path)) setDiagnostics.push(diag(FUNGI_VERIFY_005, "Artefact path is listed twice.", path));
    seen.add(path);
    verified.push(await verifyHash(artefact, undefined, root));
  }
  const diagnostics = [...setDiagnostics, ...verified.flatMap((v) => v.diagnostics)];
  return Object.freeze({ success: diagnostics.length === 0, artefacts: Object.freeze(verified), diagnostics: Object.freeze(diagnostics) });
}

export {
  FUNGI_VDEPLOY_001,
  FUNGI_VDEPLOY_002,
  FUNGI_VDEPLOY_003,
  FUNGI_VDEPLOY_004,
  FUNGI_VDEPLOY_005,
  verifyDeploy,
  readRunningVersionReceipt,
  readBuildManifestSlice,
  createVerifyDeployResult,
  readVerifyDeployResult,
  isVDeployTarget,
  VDEPLOY_TARGETS,
  RUNNING_VERSION_RECEIPT_SCHEMA,
  BUILD_MANIFEST_SLICE_SCHEMA,
} from "./verify/verify-deploy.js";
export {
  runVerifyDeployCommand,
  parseVerifyDeployArgs,
} from "./verify/verify-deploy-command.js";
export {
  createVerifyDeployReport,
  writeVerifyDeployReport,
  VERIFY_DEPLOY_REPORT_FILE,
} from "./verify/verify-deploy-reporter.js";
