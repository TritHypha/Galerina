// Artefact integrity verification (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// `verifyHash` (../verify.ts) streams file bytes and compares digests. This module sits in front
// of that helper: it reads BuildArtefact metadata through property descriptors so a hostile
// getter/proxy cannot change path/kind/hash between checks, and it refuses anything outside the
// closed artefact shape before any filesystem open.
//
// Codes stay FUNGI-VERIFY-001..005 (same closed set as verify.ts). Diagnostics name a field
// when the shape is wrong, but never echo a refused value or an unknown key name.

import {
  FUNGI_VERIFY_001,
  FUNGI_VERIFY_004,
  FUNGI_VERIFY_005,
  verifyArtefacts,
  verifyHash,
  type BuildArtefact,
  type BuildArtefactKind,
  type VerificationResult,
  type VerifiedArtefact,
  type VerifyDiagnostic,
} from "../verify.js";

/** Exact BuildArtefact key list, in declaration order. */
export const BUILD_ARTEFACT_FIELDS = Object.freeze(["path", "kind", "hash", "target"] as const);
export type BuildArtefactField = (typeof BUILD_ARTEFACT_FIELDS)[number];

/** Closed BuildArtefact.kind vocabulary from the verify contracts. */
export const BUILD_ARTEFACT_KINDS = Object.freeze([
  "manifest",
  "bundle",
  "report",
  "hash",
  "map",
] as const);

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const FIELD_SET: ReadonlySet<string> = new Set(BUILD_ARTEFACT_FIELDS);
const KIND_SET: ReadonlySet<string> = new Set(BUILD_ARTEFACT_KINDS);

const diag = (code: string, message: string, path: string): VerifyDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, path });

export interface BuildArtefactRead {
  readonly ok: true;
  readonly artefact: BuildArtefact;
}

export interface BuildArtefactRefuse {
  readonly ok: false;
  readonly diagnostics: readonly VerifyDiagnostic[];
}

export type BuildArtefactReadResult = BuildArtefactRead | BuildArtefactRefuse;
/**
 * Read one BuildArtefact through property descriptors. Never runs getters. Refuses unknown
 * keys, symbol keys, accessors, custom prototypes, holes and non-string/non-kind values.
 */
export function readBuildArtefact(input: unknown): BuildArtefactReadResult {
  try {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact must be a plain data object.", "")]),
      });
    }
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) {
      return Object.freeze({
        ok: false as const,
        diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact must be a plain data object.", "")]),
      });
    }
    const names = Reflect.ownKeys(input);
    for (const key of names) {
      if (typeof key === "symbol" || !FIELD_SET.has(key)) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact has a key outside the closed shape.", "")]),
        });
      }
    }
    const out: { path?: string; kind?: BuildArtefactKind; hash?: string; target?: string } = {};
    for (const field of BUILD_ARTEFACT_FIELDS) {
      const desc = Object.getOwnPropertyDescriptor(input, field);
      if (!desc) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact is missing a required field.", "")]),
        });
      }
      if (desc.get !== undefined || desc.set !== undefined || !("value" in desc)) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact field must be a data property.", "")]),
        });
      }
      const value = desc.value;
      if (typeof value !== "string") {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact field must be a string.", "")]),
        });
      }
      if (field === "kind" && !KIND_SET.has(value)) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact kind is outside the closed vocabulary.", "")]),
        });
      }
      if (field === "hash" && !SHA256.test(value)) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_VERIFY_001, "Expected hash must be sha256:<64 lower-case hex>.", typeof out.path === "string" ? out.path : "")]),
        });
      }
      if (field === "path" && value.length === 0) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact path must be a non-empty string.", "")]),
        });
      }
      if (field === "target" && value.length === 0) {
        return Object.freeze({
          ok: false as const,
          diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact target must be a non-empty string.", "")]),
        });
      }
      (out as Record<string, string>)[field] = value;
    }
    const artefact = Object.freeze({
      path: out.path!,
      kind: out.kind!,
      hash: out.hash!,
      target: out.target!,
    }) as BuildArtefact;
    return Object.freeze({ ok: true as const, artefact });
  } catch {
    return Object.freeze({
      ok: false as const,
      diagnostics: Object.freeze([diag(FUNGI_VERIFY_004, "Artefact metadata could not be read safely.", "")]),
    });
  }
}
function refusedVerified(diagnostics: readonly VerifyDiagnostic[], path = ""): VerifiedArtefact {
  return Object.freeze({
    path,
    hash: "",
    verified: false,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Closed-shape read, then byte digest via verifyHash. Never throws. */
export async function verifyArtefactIntegrity(
  input: unknown,
  root = ".",
  expected?: string,
): Promise<VerifiedArtefact> {
  const read = readBuildArtefact(input);
  if (!read.ok) return refusedVerified(read.diagnostics);
  return verifyHash(read.artefact, expected, root);
}

/**
 * Closed-shape read of every entry, then verifyArtefacts on the frozen copies.
 * A set that is not a dense array, or that contains a refused shape, fails closed.
 */
export async function verifyArtefactIntegritySet(inputs: unknown, root = "."): Promise<VerificationResult> {
  try {
    if (!Array.isArray(inputs)) {
      const d = diag(FUNGI_VERIFY_005, "Artefact set must be an array.", "");
      return Object.freeze({
        success: false,
        artefacts: Object.freeze([] as VerifiedArtefact[]),
        diagnostics: Object.freeze([d]),
      });
    }
    const keys = Reflect.ownKeys(inputs);
    for (const key of keys) {
      if (typeof key === "symbol") {
        const d = diag(FUNGI_VERIFY_005, "Artefact set must be a dense array of artefacts.", "");
        return Object.freeze({
          success: false,
          artefacts: Object.freeze([] as VerifiedArtefact[]),
          diagnostics: Object.freeze([d]),
        });
      }
      if (key === "length") continue;
      if (!/^(0|[1-9][0-9]*)$/.test(key)) {
        const d = diag(FUNGI_VERIFY_005, "Artefact set must be a dense array of artefacts.", "");
        return Object.freeze({
          success: false,
          artefacts: Object.freeze([] as VerifiedArtefact[]),
          diagnostics: Object.freeze([d]),
        });
      }
      const idx = Number(key);
      if (idx < 0 || idx >= inputs.length) {
        const d = diag(FUNGI_VERIFY_005, "Artefact set must be a dense array of artefacts.", "");
        return Object.freeze({
          success: false,
          artefacts: Object.freeze([] as VerifiedArtefact[]),
          diagnostics: Object.freeze([d]),
        });
      }
    }
    for (let i = 0; i < inputs.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(inputs, i)) {
        const d = diag(FUNGI_VERIFY_005, "Artefact set must be a dense array of artefacts.", "");
        return Object.freeze({
          success: false,
          artefacts: Object.freeze([] as VerifiedArtefact[]),
          diagnostics: Object.freeze([d]),
        });
      }
    }
    const artefacts: BuildArtefact[] = [];
    const early: VerifiedArtefact[] = [];
    const earlyDiags: VerifyDiagnostic[] = [];
    for (const entry of inputs) {
      const read = readBuildArtefact(entry);
      if (!read.ok) {
        early.push(refusedVerified(read.diagnostics));
        earlyDiags.push(...read.diagnostics);
        continue;
      }
      artefacts.push(read.artefact);
    }
    if (early.length > 0) {
      return Object.freeze({
        success: false,
        artefacts: Object.freeze(early),
        diagnostics: Object.freeze(earlyDiags),
      });
    }
    return verifyArtefacts(artefacts, root);
  } catch {
    const d = diag(FUNGI_VERIFY_005, "Artefact set could not be read safely.", "");
    return Object.freeze({
      success: false,
      artefacts: Object.freeze([] as VerifiedArtefact[]),
      diagnostics: Object.freeze([d]),
    });
  }
}