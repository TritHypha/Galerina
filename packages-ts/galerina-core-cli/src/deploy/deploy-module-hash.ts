// Deploy module-hash gate (TODO pass, Grok 2026-10-06; zero-trust defaults, owner may revisit).
//
// Checks the module/artefact bytes on disk before any deploy step. Reuses the verify path
// unchanged: readBuildArtefact (closed shape via descriptors) -> verifyArtefacts ->
// verifyHash (sha256 only, root-confined, regular non-symlink file, 64 KiB streaming,
// no-follow where supported). Codes stay FUNGI-VERIFY-001..005; no new vocabulary.
//
// Owner decision 2026-10-06 10:15 BST: live deploy is authorised for a follow-up PR, and
// this gate is the mandatory pre-deploy check for it. This slice still wires it into the
// dry-run command only. The result carries codes and a count only: never paths, hashes,
// bytes or refused values. Never throws.
//
// Limit (same as verify.ts): standard Node has no portable open-beneath / no-reparse
// primitive, so this is an integrity check, not a filesystem sandbox.

import { verifyArtefactIntegritySet } from "../verify/verify-integrity.js";
import { FUNGI_VERIFY_002 } from "../verify.js";

export interface DeployModuleHashResult {
  /** True only when the set is non-empty, duplicate-free and every entry verified. */
  readonly ok: boolean;
  /** Number of artefacts that verified (0 when ok is false). */
  readonly checked: number;
  /** Distinct FUNGI-VERIFY codes, sorted. Empty when ok is true. */
  readonly codes: readonly string[];
}

const CODE = /^FUNGI-VERIFY-\d{3}$/;

function refused(codes: readonly string[]): DeployModuleHashResult {
  const clean = [...new Set(codes.filter((c) => typeof c === "string" && CODE.test(c)))].sort();
  return Object.freeze({
    ok: false,
    checked: 0,
    codes: Object.freeze(clean.length > 0 ? clean : [FUNGI_VERIFY_002]),
  });
}

/**
 * Verify every BuildArtefact in `inputs` against its declared sha256 under `root`.
 * Fail-closed: a non-array, empty, sparse, duplicate or malformed set refuses, as does any
 * missing, escaping, non-regular or mismatching file.
 */
export async function verifyDeployModuleHashes(inputs: unknown, root = "."): Promise<DeployModuleHashResult> {
  try {
    if (typeof root !== "string" || root.length === 0) return refused([]);
    const set = await verifyArtefactIntegritySet(inputs, root);
    const codes = set.diagnostics.map((d) => d.code);
    if (set.success !== true || codes.length > 0) return refused(codes);
    const checked = set.artefacts.length;
    if (checked === 0 || !set.artefacts.every((a) => a.verified === true)) return refused(codes);
    return Object.freeze({ ok: true, checked, codes: Object.freeze([] as string[]) });
  } catch {
    return refused([]);
  }
}
