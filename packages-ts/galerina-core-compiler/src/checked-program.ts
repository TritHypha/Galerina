/**
 * CheckedProgram — the only mintable proof that a Fungi program passed the
 * production WASM front door (resolve → types → effects → governance).
 * WAT emission for cli + unlowered-node audits must require this token.
 */
import { resolve as resolvePath } from "node:path";
import { parseProgram, type AstNode, type FlowMeta } from "./parser.js";
import { resolveSymbols } from "./symbol-resolver.js";
import { checkTypes } from "./type-checker.js";
import { checkEffects, type EffectCheckResult } from "./effect-checker.js";
import {
  evaluateProductPolicy,
  GALERINA_SELECTION,
  requireAdmittedProductProfile,
} from "./product-policy.js";
import { productionGateBlocks, runProductionSecurityGate } from "./security-gate.js";
import { buildImportedTypeContext, gatherFileImports } from "./module-registry.js";
import { emitGIR } from "./gir-emitter.js";
import { buildWATModuleFromGIR, type WATModule } from "./wat-emitter.js";
import { STDLIB_CAPABILITY_MAP } from "./stdlib-registry.js";
import { FUNGI_WAT_CHECKED_001, createWatRefusalDiagnostic } from "./wat-emitter-refusals.js";

export const CHECKED_PROGRAM_KIND = "galerina.checked-program.v1" as const;
// FUNGI-WAT-CHECKED-001 is a constant { code, name, severity, message, suggestedFix } in FUNGI_WAT_DIAGNOSTICS
// (wat-emitter-refusals.ts); re-exported here so the existing import path keeps working.
export { FUNGI_WAT_CHECKED_001 };

export type CheckedProgram = {
  readonly kind: typeof CHECKED_PROGRAM_KIND;
  readonly ast: AstNode;
  readonly flows: readonly FlowMeta[];
  readonly source: string;
  readonly filePath: string;
  readonly effectResults: readonly EffectCheckResult[];
};

export type CheckProgramDiagnostic = {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
};

export type CheckProgramFailure = {
  readonly ok: false;
  readonly family: "parse" | "resolve" | "type" | "effects" | "governance" | "gate";
  readonly code: string;
  readonly diagnostics: readonly CheckProgramDiagnostic[];
};

export type CheckProgramSuccess = {
  readonly ok: true;
  readonly program: CheckedProgram;
};

export type CheckProgramResult = CheckProgramSuccess | CheckProgramFailure;

function fail(
  family: CheckProgramFailure["family"],
  code: string,
  diagnostics: readonly CheckProgramDiagnostic[],
): CheckProgramFailure {
  const frozen = diagnostics.map((d) => Object.freeze({
    code: typeof d.code === "string" && d.code.length > 0 ? d.code : FUNGI_WAT_CHECKED_001.code,
    severity: typeof d.severity === "string" && d.severity.length > 0 ? d.severity : "error",
    message: typeof d.message === "string" && d.message.length > 0 ? d.message : "checked-program refused",
  }));
  return Object.freeze({
    ok: false,
    family,
    code: typeof code === "string" && code.length > 0 ? code : FUNGI_WAT_CHECKED_001.code,
    diagnostics: Object.freeze(frozen),
  });
}

export function isCheckedProgram(value: unknown): value is CheckedProgram {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const rec = value as { readonly kind?: unknown };
  return rec.kind === CHECKED_PROGRAM_KIND
    && typeof (value as CheckedProgram).filePath === "string"
    && typeof (value as CheckedProgram).source === "string"
    && (value as CheckedProgram).ast !== null
    && (value as CheckedProgram).ast !== undefined
    && Array.isArray((value as CheckedProgram).flows)
    && Array.isArray((value as CheckedProgram).effectResults);
}

export function assertCheckedProgram(value: unknown): asserts value is CheckedProgram {
  if (typeof value === "number" && Number.isNaN(value)) {
    throw createWatRefusalDiagnostic(FUNGI_WAT_CHECKED_001, `${FUNGI_WAT_CHECKED_001.code}: WAT emission requires a CheckedProgram`);
  }
  if (!isCheckedProgram(value)) {
    throw createWatRefusalDiagnostic(FUNGI_WAT_CHECKED_001, `${FUNGI_WAT_CHECKED_001.code}: WAT emission requires a CheckedProgram`);
  }
}

function firstErrorCode(diags: readonly { readonly code?: string; readonly severity?: string }[], fallback: string): string {
  for (const d of diags) {
    if (d.severity === "error" && typeof d.code === "string" && d.code.length > 0) return d.code;
  }
  return fallback;
}

/**
 * The only function that may mint a CheckedProgram. Order matches the
 * production WASM gate in cli.ts runWasmStandaloneBuild, plus resolveSymbols
 * (cli comment: NAME-001 is import-dependent and lives beside gatherFileImports).
 */
export function checkProgram(source: string, filePath: string): CheckProgramResult {
  if (typeof source !== "string" || typeof filePath !== "string" || source.length === 0 || filePath.length === 0) {
    return fail("parse", FUNGI_WAT_CHECKED_001.code, [{
      code: FUNGI_WAT_CHECKED_001.code,
      severity: FUNGI_WAT_CHECKED_001.severity,
      message: "checkProgram requires a source string and filePath string",
    }]);
  }

  const parseResult = parseProgram(source, filePath, { requireVersionHeader: true });
  if (parseResult === null || parseResult === undefined || parseResult.ast === null || parseResult.ast === undefined) {
    return fail("parse", "FUNGI-PARSE-001", [{
      code: "FUNGI-PARSE-001",
      severity: "error",
      message: "parseProgram returned no AST",
    }]);
  }
  const parseErrs = (parseResult.diagnostics ?? []).filter((d) => d.severity === "error");
  if (parseErrs.length > 0) {
    return fail("parse", firstErrorCode(parseErrs, "FUNGI-PARSE-001"), parseErrs);
  }

  const importResult = gatherFileImports(parseResult.ast, resolvePath(filePath));
  const importErrs = (importResult.diagnostics ?? []).filter((d) => d.severity === "error");
  if (importErrs.length > 0) {
    return fail("resolve", firstErrorCode(importErrs, "FUNGI-IMPORT-001"), importErrs);
  }
  const importedTypeContext = buildImportedTypeContext(importResult);

  const resolved = resolveSymbols(parseResult.ast);
  const resolveErrs = (resolved.diagnostics ?? []).filter((d) => d.severity === "error");
  if (resolveErrs.length > 0) {
    return fail("resolve", firstErrorCode(resolveErrs, "FUNGI-NAME-001"), resolveErrs);
  }

  const types = checkTypes(parseResult.ast, importedTypeContext);
  const typeErrs = (types.diagnostics ?? []).filter((d) => d.severity === "error");
  if (typeErrs.length > 0) {
    return fail("type", firstErrorCode(typeErrs, "FUNGI-TYPE-002"), typeErrs);
  }

  const effectResults = checkEffects(parseResult.flows, parseResult.ast);
  const effectErrs: CheckProgramDiagnostic[] = [];
  for (const row of effectResults) {
    for (const d of row.diagnostics ?? []) {
      if (d.severity === "error") effectErrs.push(d);
    }
  }
  if (effectErrs.length > 0) {
    return fail("effects", firstErrorCode(effectErrs, "FUNGI-EFFECT-001"), effectErrs);
  }

  let policyResult;
  try {
    const product = requireAdmittedProductProfile(GALERINA_SELECTION);
    policyResult = evaluateProductPolicy(product, {
      ast: parseResult.ast,
      flows: parseResult.flows,
      effectResults,
      deploymentProfile: "production",
      sourceFile: filePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "product policy refused";
    return fail("governance", "PRODUCT_POLICY_NOT_ADMITTED", [{
      code: "PRODUCT_POLICY_NOT_ADMITTED",
      severity: "error",
      message,
    }]);
  }
  if (!policyResult.ok) {
    return fail("governance", policyResult.code, policyResult.diagnostics);
  }
  const govErrs = policyResult.diagnostics.filter((d) => d.severity === "error");
  if (govErrs.length > 0) {
    return fail("governance", firstErrorCode(govErrs, "FUNGI-GOV-001"), govErrs);
  }

  const gate = runProductionSecurityGate(parseResult.ast, parseResult.flows, source, filePath);
  if (productionGateBlocks(gate)) {
    const gateErrs = gate.filter((d) => d.severity === "error");
    return fail("gate", firstErrorCode(gateErrs, "PRODUCTION_SECURITY_GATE"), gateErrs);
  }

  const program: CheckedProgram = Object.freeze({
    kind: CHECKED_PROGRAM_KIND,
    ast: parseResult.ast,
    flows: parseResult.flows,
    source,
    filePath,
    effectResults,
  });
  return Object.freeze({ ok: true, program });
}

/**
 * The only public WAT emission path for cli and audits. Unchecked GIR/AST
 * values are refused with FUNGI-WAT-CHECKED-001. J-R4 schemaVersion / where
 * / AST-required gates still run inside buildWATModuleFromGIR.
 */
export function buildWATFromCheckedProgram(
  program: unknown,
  capabilityMap?: ReadonlyMap<string, { readonly wasmImport?: string; readonly requiredEffects: readonly string[] }>,
  target: "wasm-standalone" | "wasm-hybrid" = "wasm-standalone",
  exportAllPure = false,
): WATModule {
  assertCheckedProgram(program);
  const girResult = emitGIR(program.ast, program.flows, program.effectResults);
  const map = capabilityMap === undefined ? STDLIB_CAPABILITY_MAP : capabilityMap;
  return buildWATModuleFromGIR(girResult.gir, map, target, program.ast, exportAllPure);
}
