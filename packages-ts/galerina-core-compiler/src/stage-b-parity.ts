import { createHash } from "node:crypto";
import { parseProgram } from "./parser.js";
import { checkTypes } from "./type-checker.js";
import { checkEffects } from "./effect-checker.js";
import { verifyGovernance } from "./governance-verifier.js";

export const STAGE_B_PARITY_SCHEMA = "fungi.compiler.stage-b-parity.v1";

export type StageBStage = "type" | "effect" | "governance";

export interface StageBParityAtom {
  readonly stage: StageBStage;
  readonly code: string;
}

/** Codes the Stage-B type-checker.fungi subset claims to share with Stage-A. */
export const STAGE_B_TYPE_CODE_SUBSET: readonly string[] = Object.freeze([
  "FUNGI-TYPE-001",
  "FUNGI-TYPE-004",
  "FUNGI-TYPE-008",
]);

function sortAtoms(atoms: readonly StageBParityAtom[]): StageBParityAtom[] {
  return [...atoms].sort((left, right) => {
    const stage = left.stage.localeCompare(right.stage);
    if (stage !== 0) return stage;
    return left.code.localeCompare(right.code);
  });
}

export function encodeStageBParity(atoms: readonly StageBParityAtom[]): string {
  const hash = createHash("sha256");
  hash.update(STAGE_B_PARITY_SCHEMA, "utf8");
  hash.update("\0", "utf8");
  hash.update("atoms", "utf8");
  hash.update("\0", "utf8");
  const encoder = new TextEncoder();
  for (const atom of sortAtoms(atoms)) {
    const stageBytes = encoder.encode(atom.stage);
    const codeBytes = encoder.encode(atom.code);
    const header = new Uint8Array(8);
    const view = new DataView(header.buffer);
    view.setUint32(0, stageBytes.length, false);
    view.setUint32(4, codeBytes.length, false);
    hash.update(header);
    hash.update(stageBytes);
    hash.update(codeBytes);
  }
  return hash.digest("hex");
}

export function hashStageBParity(atoms: readonly StageBParityAtom[]): string {
  return encodeStageBParity(atoms);
}

export function filterStageBTypeSubset(
  atoms: readonly StageBParityAtom[],
): readonly StageBParityAtom[] {
  const allowed = new Set(STAGE_B_TYPE_CODE_SUBSET);
  return atoms.filter((atom) => atom.stage === "type" && allowed.has(atom.code));
}

export function uniqueStageBAtoms(
  atoms: readonly StageBParityAtom[],
): readonly StageBParityAtom[] {
  const seen = new Set<string>();
  const unique: StageBParityAtom[] = [];
  for (const atom of sortAtoms(atoms)) {
    const key = `${atom.stage}\u0000${atom.code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(atom);
  }
  return Object.freeze(unique);
}

function pushStageErrors(
  atoms: StageBParityAtom[],
  stage: StageBStage,
  diagnostics: readonly { readonly severity: string; readonly code: string }[],
): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "error" && diagnostic.code !== "") {
      atoms.push({ stage, code: diagnostic.code });
    }
  }
}

export function collectHostStageBAtoms(
  source: string,
  file = "stage-b-parity.fungi",
): readonly StageBParityAtom[] {
  const parsed = parseProgram(source, file);
  const atoms: StageBParityAtom[] = [];
  // Parse is a prerequisite for the AST. Parse/lex codes are not type-stage
  // atoms; labelling them type would squat on FUNGI-TYPE-* identity.
  pushStageErrors(atoms, "type", checkTypes(parsed.ast).diagnostics);
  const effects = checkEffects(parsed.flows, parsed.ast);
  for (const result of effects) {
    pushStageErrors(atoms, "effect", result.diagnostics);
  }
  const governance = verifyGovernance(parsed.ast, parsed.flows, effects, "dev", file);
  pushStageErrors(atoms, "governance", governance.diagnostics);
  return Object.freeze(sortAtoms(atoms));
}
