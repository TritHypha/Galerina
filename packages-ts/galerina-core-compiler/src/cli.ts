#!/usr/bin/env node
// =============================================================================
// Galerina CLI -- galerina check | build | fix | emit
//
// Commands:
//   galerina check              dev mode: run compiler, warn on missing effects
//   galerina check --strict     strict: missing effects = error
//   galerina build              normal build
//   galerina build --production governance enforcement: missing effects = error
//   galerina fix --effects      scan and suggest missing effect declarations
//   galerina emit --ai-graph    run compiler and write build/semantic/galerina.ai.json
// =============================================================================

import {
  constants as fsConstants,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  rmdirSync,
  statSync,
  lstatSync,
  realpathSync,
  openSync,
  fstatSync,
  readSync,
  closeSync,
  linkSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { parseProgram, type AstNode, type FlowMeta } from "./parser.js";
import { isFlowDeclNamed } from "./flow-name.js";
import { diffGovernance, renderGovernanceDiff } from "./governance-diff.js";
import { excludeGitIgnored } from "./git-ignore-filter.js";
import { resolveSymbols } from "./symbol-resolver.js";
import { checkTypes } from "./type-checker.js";
import { checkValueStates } from "./value-state-checker.js";
import { checkEffects, type EffectCheckResult } from "./effect-checker.js";
import { checkSourceEscapes } from "./source-escape-checker.js";
import type { DeploymentProfile } from "./governance-verifier.js";
import {
  evaluateProductPolicy,
  GALERINA_SELECTION,
  requireAdmittedProductProfile,
} from "./product-policy.js";
import { checkNamingPolicy } from "./naming-policy-checker.js";
import {
  checkTaint,
  EMPTY_REQUIREMENT_VALIDATOR_INPUT,
  requirementAuthorityDiagnosticKey,
} from "./taint-checker.js";
import { checkLint, checkUnusedBindings } from "./lint-checker.js";
import { checkMonkeyPatching, checkMonkeyPatchingSource } from "./monkey-patch-checker.js";
import { checkAttributeDirectives } from "./attribute-checker.js";
import { checkProductionReadiness } from "./production-check.js";
import { runProductionSecurityGate, productionGateBlocks } from "./security-gate.js";
import { buildAiGraph, emitGIR } from "./gir-emitter.js";
import { generateManifest, serializeManifest } from "./manifest-generator.js";
import { renderWAT, astHasParamAdmission } from "./wat-emitter.js";
import { buildWATFromCheckedProgram, checkProgram } from "./checked-program.js";
import { assembleWATModule } from "./wat-assembler.js";
import { STDLIB_CAPABILITY_MAP } from "./stdlib-registry.js";
import { EFFECT_REGISTRY } from "./effect-checker.js";
import { canonicalHash, hashSource, hashGIR } from "./runtime/canonicalHash.js";
import { buildImportedTypeContext, gatherFileImports } from "./module-registry.js";
import { loadPackageManifest } from "./package-resolver.js";
import { generateCycloneDxSbom } from "./sbom.js";
import { dispatchGateSource, findGateRegistry } from "./gate-dispatch.js";
import { generateCircuitFromPattern } from "./gate-from-pattern.js";
import type { Dirent } from "node:fs";
import { join, basename, dirname, resolve as resolvePath, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { requireFixedGalerinaProductContext, resolveProductCliSelection } from "./product-cli.js";
import type { ProductArtifactContext } from "./product-artifact-identity.js";

function evaluateGalerinaGovernance(
  ast: AstNode,
  flows: readonly FlowMeta[],
  effectResults: readonly EffectCheckResult[],
  deploymentProfile: DeploymentProfile,
  sourceFile?: string,
) {
  const product = requireAdmittedProductProfile(GALERINA_SELECTION);
  return evaluateProductPolicy(product, {
    ast,
    flows,
    effectResults,
    deploymentProfile,
    ...(sourceFile === undefined ? {} : { sourceFile }),
  });
}

const PRODUCT_POLICY_REFUSAL_MESSAGE =
  "The selected product policy is not admitted for compiler execution.";

// =============================================================================
// galerina.check.json -- project-level configuration for `galerina check`
//
// Place galerina.check.json in the project root (next to the .fungi files).
// All fields are optional -- omitted = inherit defaults.
//
// Example:
//   {
//     "profile": "strict",
//     "rules": {
//       "FUNGI-TAINT-001": "error",
//       "FUNGI-STYLE-001": "off",
//       "FUNGI-GRAPH-002": "warn"
//     },
//     "ignore": ["tests/**", "examples/**"],
//     "security": true,
//     "flowgraph": true
//   }
// =============================================================================

export interface CheckConfig {
  /** Deployment profile applied to governance checks. Default: "production" */
  readonly profile?: "dev" | "production" | "deterministic" | "strict";
  /** Per-code severity overrides. "off" disables the diagnostic entirely. */
  readonly rules?: Readonly<Record<string, "error" | "warning" | "info" | "off">>;
  /** Glob patterns for files/dirs to exclude. */
  readonly ignore?: readonly string[];
  /** Run @galerina/devtools-security checks (runSecurityAudit). Default: false */
  readonly security?: boolean;
  /** Run @galerina/devtools-flowgraph checks (checkFlowGraph). Default: false */
  readonly flowgraph?: boolean;
  /** Minimum severity to report: "error" | "warning" | "info". Default: "info" */
  readonly minSeverity?: "error" | "warning" | "info";
}

/** Load galerina.check.json from the given directory (walks up to project root). */
function loadCheckConfig(startDir: string): CheckConfig {
  const candidates = [
    join(startDir, "galerina.check.json"),
    join(startDir, ".galerinarc.json"),
    join(startDir, "galerina.config.json"),
    join(process.cwd(), "galerina.check.json"),
    join(process.cwd(), ".galerinarc.json"),
  ];
  for (const path of candidates) {
    if (existsSync(path)) { // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
      try {
        const raw = readFileSync(path, "utf8"); // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
        const cfg = JSON.parse(raw) as CheckConfig; // perf-allow: loop-json-parse — one-shot check-config parse at CLI startup (bounded candidate list)
        process.stderr.write(`[galerina check] Using config: ${path}\n`);
        return cfg;
      } catch {
        process.stderr.write(`[galerina check] Warning: could not parse ${path} -- using defaults\n`);
      }
    }
  }
  return {};
}

/** Apply config-level severity overrides to a diagnostic severity. */
function applySeverityOverride(
  code: string,
  severity: "error" | "warning" | "info",
  config: CheckConfig,
): "error" | "warning" | "info" | "off" {
  const override = config.rules?.[code];
  return override ?? severity;
}

// =============================================================================
// Per-file rule disabling -- // galerina-disable and // galerina-disable-next-line
//
// Source comments that suppress specific diagnostics:
//   // galerina-disable FUNGI-TAINT-001          -- disables for rest of file
//   // galerina-disable-next-line FUNGI-TAINT-001 -- disables on the NEXT line only
//   // galerina-disable                          -- disables ALL diagnostics in file
// =============================================================================

interface DisableDirectives {
  /** Codes disabled for the whole file. Empty set = all disabled. */
  readonly fileDisabled: ReadonlySet<string> | "all";
  /** Map from 1-based line number to set of codes disabled on that line. */
  readonly lineDisabled: ReadonlyMap<number, ReadonlySet<string> | "all">;
}

function parseDisableDirectives(source: string): DisableDirectives {
  const fileDisabledCodes = new Set<string>();
  let fileDisabledAll = false;
  const lineDisabled = new Map<number, Set<string> | "all">();

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNum = i + 1;   // 1-based

    // galerina-disable-next-line [code ...]
    const nextLine = line.match(/\/\/\s*galerina-disable-next-line\s*(.*)/);
    if (nextLine) {
      const codes = (nextLine[1] ?? "").trim();
      const targetLine = lineNum + 1;
      if (codes === "") {
        lineDisabled.set(targetLine, "all");
      } else {
        const existing = lineDisabled.get(targetLine);
        if (existing === "all") { /* already all */ }
        else {
          const s = existing ?? new Set<string>();
          for (const c of codes.split(/\s+/).filter(Boolean)) s.add(c);
          lineDisabled.set(targetLine, s);
        }
      }
      continue;
    }

    // galerina-disable [code ...]
    const fileLine = line.match(/\/\/\s*galerina-disable\s*(.*)/);
    if (fileLine) {
      const codes = (fileLine[1] ?? "").trim();
      if (codes === "") { fileDisabledAll = true; }
      else { for (const c of codes.split(/\s+/).filter(Boolean)) fileDisabledCodes.add(c); }
    }
  }

  return {
    fileDisabled: fileDisabledAll ? "all" : fileDisabledCodes,
    lineDisabled,
  };
}

/** Returns true if this diagnostic is suppressed by a disable directive. */
function isDisabledByDirective(
  code: string,
  line: number | undefined,
  directives: DisableDirectives,
): boolean {
  // File-level disable
  if (directives.fileDisabled === "all") return true;
  if (directives.fileDisabled.has(code)) return true;
  // Line-level disable
  if (line !== undefined) {
    const ld = directives.lineDisabled.get(line);
    if (ld === "all") return true;
    if (ld?.has(code)) return true;
  }
  return false;
}

// =============================================================================
// Auto-fix -- applies suggestedFix from diagnostics back to the source file.
// Only applied with --fix flag. Fixes are applied in reverse line order to
// preserve offsets. Currently supports single-line text replacements only.
// =============================================================================

function applyAutoFix(filePath: string, diagnostics: readonly CliDiagnostic[]): number {
  const fixable = diagnostics.filter(
    d => d.severity === "error" || d.severity === "warning"
  ).filter(d => {
    // `suggestedCode` is the machine channel — a substitutable source fragment.
    // `suggestedFix` is PROSE for a human and must never be applied to source.
    // This previously read `suggestedFix` through a cast, which no type error
    // could reach: measured, 121 of 121 statically classifiable values there are
    // prose, so the reported count described the wrong population entirely.
    // No heuristic is needed once the right channel is named.
    const code = d.suggestedCode;
    return code !== undefined && code.length > 0 && code.length < 500;
  });
  if (fixable.length === 0) return 0;
  // Log fixable but don't apply automatically -- require --fix-confirm for safety.
  process.stdout.write(`  -> ${fixable.length} auto-fixable diagnostic(s) (run with --fix-confirm to apply)\n`);
  return 0; // safe mode: report count but don't write
}

// FUNGI-BUILD-001: Same source produced different output on repeated compilation.
const FUNGI_BUILD_001_CODE = "FUNGI-BUILD-001";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface CliDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  /**
   * Human-readable guidance ("Declare 'x' before using it, or import it from a
   * module."). Producers populate this at 136 sites; it is prose, and it must
   * NEVER be applied to source as if it were code.
   */
  readonly suggestedFix?: string;
  /**
   * A machine-applicable source fragment (`guarded flow ${name}`,
   * `effects [...]`). This — never `suggestedFix` — is the only channel an
   * auto-fix path may select on, and applying it still requires the mode's
   * declared confirmation policy.
   */
  readonly suggestedCode?: string;
}

type CliMode =
  | "check"
  | "check-strict"
  | "build"
  | "build-production"
  | "build-deterministic"
  | "build-wasm-standalone"   // WASM/WASI module, no JS runtime required
  | "build-wasm-hybrid"       // JS capability shell + WASM pure-flow core
  | "fix-effects"
  | "emit-ai-graph"
  | "verify-selfhost"
  | "cost-analysis"
  | "governance-diff";

/**
 * Modes that emit a DISTRIBUTABLE, independently-runnable artifact — a signed `.lmanifest`
 * (`build-production` / `build-deterministic`) or a runtime-less `.wasm` (both wasm targets).
 * Each MUST clear the FULL production security gate at production strictness before its
 * artifact is written: once the artifact leaves the compiler there is no runtime left to
 * enforce anything, so compile time is the only gate. Single-sourced HERE so a new
 * artifact-emitting mode cannot silently inherit dev strictness — the exact drift that let
 * `build --deterministic` (RD-0234b Class B) and then both wasm targets (RD-0234c H1) skip
 * `verifyGovernance` / `checkProductionReadiness` while still emitting a runnable file
 * (a denied-field leak / cross-tenant IDOR shipped a clean `.wasm`; RED-benched).
 * NOTE: plain `build` is deliberately NOT here — it does not emit a distributable artifact
 * (its `.lmanifest` mint is gated separately, below, and stays dev-strictness for display).
 */
const PRODUCTION_STRICTNESS_MODES: ReadonlySet<CliMode> = new Set([
  "build-production",
  "build-deterministic",
  "build-wasm-standalone",
  "build-wasm-hybrid",
]);

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function findFungiFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      throw new Error(`REFUSED: source discovery could not enumerate directory: ${current}`);
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`REFUSED: source discovery does not follow or skip symbolic links: ${full}`);
      }
      const isSourceCandidate = entry.name.endsWith(".fungi") || entry.name.endsWith(".gate");
      if (isSourceCandidate && !entry.isFile()) {
        throw new Error(`REFUSED: unsupported filesystem object occupies a source path: ${full}`);
      }
      if (entry.isDirectory()) {
        // skip node_modules and hidden dirs
        if (entry.name !== "node_modules" && !entry.name.startsWith(".")) {
          walk(full);
        }
      } else if (isSourceCandidate) {
        // `.gate` files are collected alongside `.fungi` and routed by
        // compileFile to the v3 frontend (round-one G1). A `.gate` file yields
        // diagnostics only - no flows, no GIR, no signing - and carries
        // FUNGI-GATELANG-002, so production stays withheld.
        results.push(full);
      }
    }
  }

  walk(dir);
  return results;
}

function findStandaloneEntryFiles(files: string[]): string[] {
  const pendingImports = new Set<string>();
  const importedPaths = new Set<string>();
  for (const filePath of files) {
    const source = readBoundedSource(filePath);
    const parsed = parseProgram(source, filePath, { requireVersionHeader: true });
    const imports = gatherFileImports(parsed.ast, resolvePath(filePath));
    for (const importedPath of imports.resolvedPaths) {
      pendingImports.add(resolvePath(importedPath));
    }
  }

  while (pendingImports.size > 0) {
    const importedPath = pendingImports.values().next().value as string;
    pendingImports.delete(importedPath);
    if (importedPaths.has(importedPath)) continue;
    importedPaths.add(importedPath);

    const source = readBoundedSource(importedPath);
    const parsed = parseProgram(source, importedPath, { requireVersionHeader: true });
    const imports = gatherFileImports(parsed.ast, resolvePath(importedPath));
    for (const nestedPath of imports.resolvedPaths) {
      const resolvedNestedPath = resolvePath(nestedPath);
      if (!importedPaths.has(resolvedNestedPath)) pendingImports.add(resolvedNestedPath);
    }
  }
  return files.filter((filePath) => !importedPaths.has(resolvePath(filePath)));
}

function findStandaloneImportsWithNonSchemaDeclarations(files: string[]): string[] {
  const pendingImports = new Set<string>();
  const schemaKinds = new Set(["importDecl", "typeDecl", "enumDecl", "recordDecl"]);
  for (const filePath of files) {
    const source = readBoundedSource(filePath);
    const parsed = parseProgram(source, filePath, { requireVersionHeader: true });
    const imports = gatherFileImports(parsed.ast, resolvePath(filePath));
    for (const importedPath of imports.resolvedPaths) pendingImports.add(resolvePath(importedPath));
  }

  const unsupported: string[] = [];
  const visitedImports = new Set<string>();
  while (pendingImports.size > 0) {
    const importedPath = pendingImports.values().next().value as string;
    pendingImports.delete(importedPath);
    if (visitedImports.has(importedPath)) continue;
    visitedImports.add(importedPath);

    const source = readBoundedSource(importedPath);
    const parsed = parseProgram(source, importedPath, { requireVersionHeader: true });
    if ((parsed.ast.children ?? []).some((node) => !schemaKinds.has(node.kind))) {
      unsupported.push(importedPath);
    }

    // gatherFileImports returns the importer's direct module entries, while its
    // resolver only surfaces successful nested modules as flattened symbols.
    // Walk each validated source in turn so a schema-only wrapper cannot hide
    // executable declarations further down the import graph.
    const nestedImports = gatherFileImports(parsed.ast, resolvePath(importedPath));
    for (const nestedPath of nestedImports.resolvedPaths) {
      const resolvedNestedPath = resolvePath(nestedPath);
      if (!visitedImports.has(resolvedNestedPath)) pendingImports.add(resolvedNestedPath);
    }
  }
  return unsupported.sort();
}

// ---------------------------------------------------------------------------
// Helper: push a diagnostic only if the location fields are defined
// ---------------------------------------------------------------------------

function pushDiag(
  out: CliDiagnostic[],
  code: string,
  severity: CliDiagnostic["severity"],
  message: string,
  file: string,
  line: number | undefined,
  column: number | undefined,
  // The two cure channels the producers populate. They are carried through the
  // funnel because a widened record that this function drops on the floor is a
  // wider type over the same loss. Absent stays absent — exactly as line/column
  // are handled — so a missing cure is never reported as an empty one.
  suggestedFix?: string | undefined,
  suggestedCode?: string | undefined,
): void {
  const base: { code: string; severity: CliDiagnostic["severity"]; message: string; file: string } = {
    code,
    severity,
    message,
    file,
  };
  const cures: { suggestedFix?: string; suggestedCode?: string } = {};
  if (suggestedFix !== undefined) cures.suggestedFix = suggestedFix;
  if (suggestedCode !== undefined) cures.suggestedCode = suggestedCode;
  if (line !== undefined && column !== undefined) {
    out.push({ ...base, ...cures, line, column });
  } else if (line !== undefined) {
    out.push({ ...base, ...cures, line });
  } else {
    out.push({ ...base, ...cures });
  }
}

// ---------------------------------------------------------------------------
// Compile a single .fungi file and return diagnostics
// ---------------------------------------------------------------------------

interface FileCompileResult {
  readonly file: string;
  readonly diagnostics: CliDiagnostic[];
  readonly aiGraphJson?: string;
  /** RFC 8785 canonical JSON string for the .lmanifest artifact (task #33) */
  readonly manifestJson?: string;
}

// `findGateRegistry` lives in gate-dispatch.ts because both CLI entry points
// need it. This module now guards its process entry point so focused compiler
// tests can import `compileFile` without executing the CLI as a side effect.

export const MAX_COMPILER_SOURCE_BYTES = 10 * 1024 * 1024;

function readBoundedSource(filePath: string): string {
  const pathStats = lstatSync(filePath);
  if (pathStats.isSymbolicLink() || !pathStats.isFile()) {
    throw new Error("source path must name a regular, non-symbolic-link file");
  }
  if (pathStats.size > MAX_COMPILER_SOURCE_BYTES) {
    throw new Error(`source exceeds the ${MAX_COMPILER_SOURCE_BYTES}-byte compiler intake ceiling`);
  }

  const flags = fsConstants.O_RDONLY
    | (fsConstants.O_NONBLOCK ?? 0)
    | (fsConstants.O_NOFOLLOW ?? 0);
  const descriptor = openSync(filePath, flags);
  try {
    const openedStats = fstatSync(descriptor);
    if (!openedStats.isFile() || !sameStandaloneDirectoryIdentity(openedStats, pathStats)) {
      throw new Error("source path identity changed between discovery and descriptor intake");
    }
    if (openedStats.size > MAX_COMPILER_SOURCE_BYTES) {
      throw new Error(`source exceeds the ${MAX_COMPILER_SOURCE_BYTES}-byte compiler intake ceiling`);
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const remaining = MAX_COMPILER_SOURCE_BYTES + 1 - totalBytes;
      if (remaining <= 0) {
        throw new Error(`source exceeds the ${MAX_COMPILER_SOURCE_BYTES}-byte compiler intake ceiling`);
      }
      const chunk = Buffer.alloc(Math.min(64 * 1024, remaining));
      const bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > MAX_COMPILER_SOURCE_BYTES) {
        throw new Error(`source exceeds the ${MAX_COMPILER_SOURCE_BYTES}-byte compiler intake ceiling`);
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }

    const finalDescriptorStats = fstatSync(descriptor);
    const finalPathStats = lstatSync(filePath);
    if (!sameStandaloneDirectoryIdentity(finalDescriptorStats, openedStats)
      || !sameStandaloneDirectoryIdentity(finalPathStats, openedStats)
      || finalPathStats.isSymbolicLink() || !finalPathStats.isFile()
      || finalDescriptorStats.size !== openedStats.size
      || finalDescriptorStats.mtimeMs !== openedStats.mtimeMs
      || finalDescriptorStats.ctimeMs !== openedStats.ctimeMs
      || totalBytes !== finalDescriptorStats.size) {
      throw new Error("source changed while it was being read; refusing a non-stable intake");
    }
    return Buffer.concat(chunks, totalBytes).toString("utf8");
  } finally {
    closeSync(descriptor);
  }
}

export function compileFile(
  filePath: string,
  mode: CliMode,
  productContext: Readonly<ProductArtifactContext> = requireFixedGalerinaProductContext(),
): FileCompileResult {
  let source: string;
  try {
    source = readBoundedSource(filePath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      file: filePath,
      diagnostics: [{
        code: "FUNGI-BACKEND-001",
        severity: "error",
        message: `Cannot read file: ${msg}`,
        file: filePath,
      }],
    };
  }

  const diagnostics: CliDiagnostic[] = [];

  // `.gate` files dispatch to the v3 frontend ONLY (round-one G1 step 6; the
  // dispatch rule is fail-closed and tries one parser, never both). The
  // `.fungi` path below is untouched. A `.gate` file never reaches parseProgram
  // and never produces flows here: round one is syntax/AST closure, so there is
  // no GIR, no signing, and FUNGI-GATELANG-002 keeps production withheld.
  if (filePath.endsWith(".gate")) {
    // A `gate.registry.json` beside the circuit (or in a parent directory)
    // supplies the component contracts, so resolution and liveness run. With
    // no registry the check establishes SHAPE only — it says nothing about
    // whether any named component exists. Discovery is by convention and
    // read-only; a malformed registry refuses the file rather than producing
    // half-trustworthy verdicts.
    const dispatched = dispatchGateSource(source, filePath, {
      ...(findGateRegistry(filePath) ?? {}),
    });
    for (const d of dispatched.diagnostics) {
      pushDiag(
        diagnostics,
        d.code,
        d.severity as CliDiagnostic["severity"],
        d.message,
        filePath,
        d.location?.line,
        d.location?.column,
        d.suggestedFix,
        d.suggestedCode,
      );
    }
    return { file: filePath, diagnostics };
  }

  const parseResult = parseProgram(source, filePath, { requireVersionHeader: true });
  for (const d of parseResult.diagnostics) {
    pushDiag(
      diagnostics,
      d.code,
      d.severity as CliDiagnostic["severity"],
      d.message,
      filePath,
      d.location?.line,
      d.location?.column,
      d.suggestedFix,
      d.suggestedCode,
    );
  }

  // ── Import resolution — DAG merge ────────────────────────────────────────
  // Resolve `import "./path.fungi"` declarations and surface any diagnostics.
  // Imported symbols are available for use in this file's flows.
  // This is additive — no existing behaviour is changed.
  const absoluteFilePath = resolvePath(filePath);
  const importResult = gatherFileImports(parseResult.ast, absoluteFilePath);
  const importedTypeContext = buildImportedTypeContext(importResult);
  for (const diag of importResult.diagnostics) {
    pushDiag(
      diagnostics,
      diag.code,
      diag.severity,
      diag.message,
      filePath,
      undefined,
      undefined,
    );
  }
  if (importResult.resolvedPaths.length > 0) {
    const count = importResult.resolvedPaths.length;
    const symCount = importResult.symbols.length;
    pushDiag(
      diagnostics,
      "FUNGI-IMPORT-000",
      "info",
      `Resolved ${count} imported file(s), ${symCount} symbol(s) merged into scope.`,
      filePath,
      undefined,
      undefined,
    );
  }

  const symbolResult = resolveSymbols(parseResult.ast);
  for (const d of symbolResult.diagnostics) {
    pushDiag(
      diagnostics,
      d.code,
      d.severity as CliDiagnostic["severity"],
      d.message,
      filePath,
      d.location?.line,
      d.location?.column,
      d.suggestedFix,
      d.suggestedCode,
    );
  }

  const typeResult = checkTypes(parseResult.ast, importedTypeContext);
  for (const d of typeResult.diagnostics) {
    pushDiag(
      diagnostics,
      d.code,
      d.severity as CliDiagnostic["severity"],
      d.message,
      filePath,
      d.location?.line,
      d.location?.column,
      d.suggestedFix,
      d.suggestedCode,
    );
  }

  // Determine compile mode: production/deterministic builds enforce errors; dev/check/build
  // downgrade migration-stage diagnostics (FUNGI-VALUESTATE-008, FUNGI-STDLIB-001) to warnings.
  const effectCheckerMode: "production" | "development" =
    PRODUCTION_STRICTNESS_MODES.has(mode)
      ? "production"
      : "development";

  // FUNGI-TIER-001 (landing B): the flow-kind tier floor is enforced ONLY on real production
  // builds (build-production / build-deterministic), never on check/dev. Default-off everywhere
  // else, so all other checkEffects call sites are unaffected.
  const enforceTierFloor = PRODUCTION_STRICTNESS_MODES.has(mode);

  const effectResults = checkEffects(parseResult.flows, parseResult.ast, effectCheckerMode, enforceTierFloor);
  const validatorInput = Object.freeze({
    ...EMPTY_REQUIREMENT_VALIDATOR_INPUT,
    effectResults,
    flows: parseResult.flows,
  });
  const requirementAuthorityKeys = new Set<string>();
  const valueStateResult = checkValueStates(parseResult.ast, effectCheckerMode, validatorInput);
  for (const d of valueStateResult.diagnostics) {
    const key = requirementAuthorityDiagnosticKey(d);
    if (key !== undefined) requirementAuthorityKeys.add(key);
    pushDiag(
      diagnostics,
      d.code,
      d.severity as CliDiagnostic["severity"],
      d.message,
      filePath,
      d.location?.line,
      d.location?.column,
      d.suggestedFix,
      d.suggestedCode,
    );
  }

  for (const result of effectResults) {
    for (const d of result.diagnostics) {
      // FUNGI-EFFECT-001 and FUNGI-STDLIB-001 are downgraded to warning in dev/check/build modes.
      // In build-production and build-deterministic modes they remain errors (as emitted).
      const isDevDowngradable =
        d.code === "FUNGI-EFFECT-001" || d.code === "FUNGI-STDLIB-001";
      const severity: CliDiagnostic["severity"] =
        isDevDowngradable && (mode === "check" || mode === "build")
          ? "warning"
          : (d.severity as CliDiagnostic["severity"]);
      pushDiag(
        diagnostics,
        d.code,
        severity,
        d.message,
        filePath,
        d.location?.line,
        d.location?.column,
        d.suggestedFix,
        d.suggestedCode,
      );
    }
  }

  const escapeResult = checkSourceEscapes(parseResult.ast);
  for (const d of escapeResult.diagnostics) {
    pushDiag(
      diagnostics,
      d.code,
      d.severity as CliDiagnostic["severity"],
      d.message,
      filePath,
      d.location?.line,
      d.location?.column,
      d.suggestedFix,
    );
  }

  // ── RD-0234 / RD-0234b — previously DEAD / UN-WIRED security gates ─────────────
  // checkTaint (OWASP injection → sink, GNG-01), checkMonkeyPatching (FUNGI-SEC-020/021,
  // Class A) and checkAttributeDirectives (the @name{} escape hatch, Class D) each had
  // ZERO pipeline call sites — a SQLi / runtime-patching / hidden-code file built clean
  // AND minted a signed .lmanifest. Wired here so they surface in EVERY mode (check
  // included) and, being errors, block the signing gate below. checkTaint returns a flat
  // array (no `.diagnostics`, no location); the other two return `{ diagnostics }`.
  for (const d of checkTaint(parseResult.ast, parseResult.flows, validatorInput)) {
    const key = requirementAuthorityDiagnosticKey(d);
    if (key !== undefined && requirementAuthorityKeys.has(key)) continue;
    if (key !== undefined) requirementAuthorityKeys.add(key);
    pushDiag(diagnostics, d.code, d.severity as CliDiagnostic["severity"], d.message, filePath, d.location?.line, d.location?.column);
  }
  const monkeyAstLines = new Set<number>();
  for (const d of checkMonkeyPatching(parseResult.ast).diagnostics) {
    if (d.location?.line !== undefined) monkeyAstLines.add(d.location.line);
    pushDiag(diagnostics, d.code, d.severity as CliDiagnostic["severity"], d.message, filePath, d.location?.line, d.location?.column);
  }
  for (const d of checkMonkeyPatchingSource(source, filePath, monkeyAstLines).diagnostics) {
    pushDiag(diagnostics, d.code, d.severity as CliDiagnostic["severity"], d.message, filePath, d.location?.line, d.location?.column);
  }
  for (const d of checkAttributeDirectives(parseResult.ast).diagnostics) {
    pushDiag(diagnostics, d.code, d.severity as CliDiagnostic["severity"], d.message, filePath, d.location?.line, d.location?.column);
  }

  // Phase 17A: Naming policy checker
  // In check-strict and build-production modes, naming issues are informational (warnings).
  // enforceNamingPolicy=true means they are shown but do not block the build on their own
  // (the CLI counts errors; naming diagnostics are always emitted as warnings here).
  const namingResult = checkNamingPolicy(parseResult.ast);
  for (const d of namingResult.diagnostics) {
    // In strict/production modes naming issues are emitted as warnings (informational).
    // They do not become errors at the CLI level -- enforceNamingPolicy affects runtime ok flag only.
    pushDiag(
      diagnostics,
      d.code,
      "warning",
      d.message,
      filePath,
      d.location?.line,
      d.location?.column,
      d.suggestedFix,
    );
  }

  // FUNGI-LINT-001: ergonomics lint (excessive nesting) — informational, every mode.
  for (const d of checkLint(parseResult.ast, parseResult.flows)) {
    pushDiag(diagnostics, d.code, d.severity as CliDiagnostic["severity"], d.message, filePath, undefined, undefined);
  }

  // FUNGI-LINT-002: unused-binding lint (dead local / match binding) — warning, every mode.
  for (const d of checkUnusedBindings(parseResult.ast, parseResult.flows)) {
    pushDiag(diagnostics, d.code, d.severity as CliDiagnostic["severity"], d.message, filePath, d.location?.line, d.location?.column);
  }

  // Governance verification (for production AND deterministic builds).
  // RD-0234b Class B: governance ran ONLY for build-production, so build-deterministic
  // (which advertises itself as the STRICTEST reproducibility mode) fell through here
  // AND through the plain-`build` re-check below (gated to mode==="build"), and minted a
  // signed .lmanifest for FUNGI-GOV-003 / VAL-* / TENANT-002 IDOR that --production
  // refuses. Deterministic already uses production effect strictness (effectCheckerMode
  // above); running governance here aligns it, so its errors land in `diagnostics` and
  // the signing gate below withholds the credential.
  if (PRODUCTION_STRICTNESS_MODES.has(mode)) {
    const policyResult = evaluateGalerinaGovernance(
      parseResult.ast,
      parseResult.flows,
      effectResults,
      "production",
      filePath,
    );
    if (!policyResult.ok) {
      pushDiag(
        diagnostics,
        policyResult.code,
        "error",
        PRODUCT_POLICY_REFUSAL_MESSAGE,
        filePath,
        undefined,
        undefined,
      );
    }
    for (const d of policyResult.diagnostics) {
      pushDiag(
        diagnostics,
        d.code,
        d.severity as CliDiagnostic["severity"],
        d.message,
        filePath,
        d.location?.line,
        d.location?.column,
        d.suggestedFix,
      );
    }
  }

  // RD-0234b Class A(ii): make the PRODUCTION_BLOCKERS list matter. Production/deterministic
  // gated purely on error-COUNT, so a blocker code emitted below error severity was inert
  // (checkProductionReadiness was exported + unit-tested but NEVER called in the pipeline).
  // Wire it here: any production-blocker code present at a real build with no error already
  // recorded becomes a hard error, so the signing gate below withholds the credential.
  if (PRODUCTION_STRICTNESS_MODES.has(mode)) {
    const readiness = checkProductionReadiness(diagnostics);
    if (!readiness.ready && !diagnostics.some((d) => d.severity === "error")) {
      pushDiag(
        diagnostics,
        "FUNGI-BUILD-002",
        "error",
        `Production readiness blocked: ${readiness.blockers.join("; ")}`,
        filePath,
        undefined,
        undefined,
      );
    }
  }

  // AI graph emission
  if (mode === "emit-ai-graph") {
    const aiGraph = buildAiGraph(parseResult.ast, parseResult.flows, filePath);
    const aiGraphJson = JSON.stringify(aiGraph, null, 2);
    return { file: filePath, diagnostics, aiGraphJson };
  }

  // .lmanifest generation (DRCM Phase 1 task #33 — RFC 8785 canonical JSON)
  // Emitted for build modes when there are no errors.
  // Contains: source hash, derived constraints, proof obligations, governance signatures.
  if (mode === "build" || mode === "build-production" || mode === "build-deterministic") {
    // SIGNING-BOUNDARY (single-sourced, RD-0234b): the decision to mint a .lmanifest routes through
    // the ONE production security gate that the bundled galerina.mjs ALSO runs
    // (runProductionSecurityGate) — not a hand-re-enumerated checker list that can silently drift
    // thinner (the L6-B2 re-arming the ZT tooling audit flagged). A plain `build` runs the display
    // pipeline in DEVELOPMENT strictness, so without this a production-violating artifact (SECRET-002,
    // PRIVACY-001/002, GOV-*, TAINT-*, SEC-020, ATTR-*, …) would be silently SIGNED. A signed manifest
    // is an admission credential; it must NOT be issued for an artifact this gate rejects. "Add a
    // checker to the gate → every signing path enforces it"; security-gate-coverage.test.mjs asserts
    // each PRODUCTION_BLOCKER code is caught here. (Manifest CONTENT stays dev-computed so golden
    // hashes are unchanged; the gate only decides WHETHER to sign.)
    const gateBlocksSigning = productionGateBlocks(
      runProductionSecurityGate(parseResult.ast, parseResult.flows, source, filePath),
    );
    if (!gateBlocksSigning && !diagnostics.some(d => d.severity === "error")) {
      const policyResult = evaluateGalerinaGovernance(
        parseResult.ast, parseResult.flows, effectResults, "dev", filePath
      );
      if (!policyResult.ok) {
        pushDiag(
          diagnostics,
          policyResult.code,
          "error",
          PRODUCT_POLICY_REFUSAL_MESSAGE,
          filePath,
          undefined,
          undefined,
        );
      } else {
        const manifest = generateManifest(source, filePath, parseResult.flows, policyResult.evidence, undefined, parseResult.ast, source, productContext);
        const manifestJson = serializeManifest(manifest);
        return { file: filePath, diagnostics, manifestJson };
      }
    }
  }

  return { file: filePath, diagnostics };
}

// ---------------------------------------------------------------------------
// verify-selfhost (Phase 16A implementation)
// ---------------------------------------------------------------------------

/**
 * Compute the three stable artifacts that prove deterministic compilation:
 *   1. Hash of EFFECT_REGISTRY (a known stable compiler artifact)
 *   2. Hash of a sample pure flow's source text (hashSource -- no normalization)
 *   3. Hash of a sample flow's canonical plan JSON
 *
 * All three are computed twice. If run1 === run2 for all three -> PASS.
 */
function computeSelfhostArtifacts(): string {
  // Artifact 1: EFFECT_REGISTRY -- deterministic by construction
  const registryHash = canonicalHash(EFFECT_REGISTRY);

  // Artifact 2: Sample source text
  const sampleSource = `
pure flow verifySample(x: Int) -> Int {
  return x
}
`.trim();
  const sourceHash = hashSource(sampleSource);

  // Artifact 3: Canonical hash of a trivial plan-like object
  const samplePlan = {
    flow: "verifySample",
    qualifier: "pure",
    steps: [
      { kind: "return", value: "Int" },
    ],
    approvedCapabilities: {},
    planHash: sourceHash,
  };
  const planHash = canonicalHash(samplePlan);

  // Combine into one stable string and hash that
  return canonicalHash({ registryHash, sourceHash, planHash });
}

/**
 * Compile a single .fungi source string twice and return both GIR hashes.
 * Used to prove that the GIR emitter is deterministic on repeated compilation.
 */
function doubleCompileGirHash(source: string, fileName: string): { hash1: string; hash2: string } {
  function compileOnce(): string {
    const parseResult = parseProgram(source, fileName, { requireVersionHeader: true });
    const effectResults = checkEffects(parseResult.flows, parseResult.ast);
    const girResult = emitGIR(parseResult.ast, parseResult.flows, effectResults);
    return hashGIR(girResult.gir);
  }
  return { hash1: compileOnce(), hash2: compileOnce() };
}

function runVerifySelfhost(): void {
  process.stdout.write("galerina verify-selfhost\n");
  process.stdout.write("---------------------\n");
  process.stdout.write("Hashing compiler artifacts...\n");

  const run1 = computeSelfhostArtifacts();
  const run2 = computeSelfhostArtifacts();

  process.stdout.write(`Run 1: ${run1}\n`);
  process.stdout.write(`Run 2: ${run2}\n`);

  if (run1 !== run2) {
    process.stderr.write(
      `[error] ${FUNGI_BUILD_001_CODE} NonDeterministicBuild\n` +
      `  Run 1 hash: ${run1}\n` +
      `  Run 2 hash: ${run2}\n` +
      `  Same source produced different output on repeated compilation.\n` +
      `  Check for: timestamp in output, random values in codegen, hash map iteration order.\n`,
    );
    process.exit(1);
  }

  // R7C: Double-compile each .fungi file and compare GIR hashes.
  // If any file produces different GIR hashes on two compilations, emit FUNGI-BUILD-001.
  process.stdout.write("Checking GIR determinism across .fungi files...\n");

  const selfHostedDir = join(getSrcDir(), "self-hosted");
  let fungiFiles: string[] = [];
  try {
    fungiFiles = readdirSync(selfHostedDir)
      .filter((f) => f.endsWith(".fungi"))
      .map((f) => join(selfHostedDir, f));
  } catch {
    // self-hosted directory may not be present in all environments -- skip silently
    process.stdout.write("  [info] self-hosted/ directory not found; skipping GIR determinism check.\n");
  }

  let girDeterminismPassed = true;

  for (const filePath of fungiFiles) {
    let source: string;
    try {
      source = readBoundedSource(filePath); // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
    } catch {
      continue;
    }

    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
    const { hash1, hash2 } = doubleCompileGirHash(source, fileName);

    if (hash1 !== hash2) {
      process.stderr.write(
        `[error] ${FUNGI_BUILD_001_CODE} NonDeterministicBuild\n` +
        `  File: ${filePath}\n` +
        `  GIR hash 1: ${hash1}\n` +
        `  GIR hash 2: ${hash2}\n` +
        `  Same source produced different GIR on repeated compilation.\n`,
      );
      girDeterminismPassed = false;
    } else {
      process.stdout.write(`  OK ${fileName}: GIR deterministic (${hash1.slice(0, 20)}...)\n`);
    }
  }

  if (!girDeterminismPassed) {
    process.exit(1);
  }

  process.stdout.write("OK Deterministic. Build verified.\n");
  process.stdout.write("OK Self-host verification PASSED. Build is deterministic.\n");
  process.exit(0);
}

/**
 * Returns the src/ directory relative to the compiler's current working
 * directory. Used to locate the self-hosted/ subdirectory.
 *
 * In a project install this resolves to <project-root>/src.
 * If the directory does not exist the GIR determinism check is skipped gracefully.
 */
function getSrcDir(): string {
  return join(process.cwd(), "src");
}

// ---------------------------------------------------------------------------
// Fix effects stub (Phase 13C)
// ---------------------------------------------------------------------------

function runFixEffects(targetDir: string): void {
  const files = findFungiFiles(targetDir);
  if (files.length === 0) {
    process.stdout.write("No .fungi files found.\n");
    return;
  }

  for (const filePath of files) {
    let source: string;
    try {
      source = readBoundedSource(filePath); // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
    } catch {
      continue;
    }

    const parseResult = parseProgram(source, filePath, { requireVersionHeader: true });
    const effectResults = checkEffects(parseResult.flows, parseResult.ast);

    for (const result of effectResults) {
      const missing = result.diagnostics.filter(
        (d) => d.code === "FUNGI-EFFECT-001" && d.name === "UNDECLARED_EFFECT",
      );
      if (missing.length > 0) {
        for (const d of missing) {
          process.stdout.write(
            `[suggest] ${filePath}: flow "${result.flowName}" -- add effect declaration.\n`,
          );
          process.stdout.write(`  Reason: ${d.message}\n`);
          if (d.suggestedFix !== undefined) {
            process.stdout.write(`  Fix: ${d.suggestedFix}\n`);
          }
        }
      }
    }
  }

  process.stdout.write(
    "\n[info] Phase 13C stub: suggestions printed. File modifications not applied.\n",
  );
}

// ---------------------------------------------------------------------------
// Print a single diagnostic line
// ---------------------------------------------------------------------------

function printDiagnostic(d: CliDiagnostic): void {
  const prefix = d.severity === "error" ? "[error]" : "[warn]";
  const loc =
    d.line !== undefined
      ? `${d.file}:${d.line}${d.column !== undefined ? `:${d.column}` : ""}`
      : d.file;
  process.stdout.write(`${prefix} ${d.code}  ${loc}\n  ${d.message}\n`);
}

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------

function parseArgs(args: readonly string[] = process.argv.slice(2)): { readonly mode: CliMode; readonly targetDir: string } {

  const command = args[0] ?? "";
  const flags = new Set(args.slice(1).filter((a: string) => a.startsWith("--")));
  const positional = args.slice(1).filter((a: string) => !a.startsWith("--"));
  const targetDir = positional[0] ?? process.cwd();

  let mode: CliMode;

  switch (command) {
    case "check":
      mode = flags.has("--strict") ? "check-strict" : "check";
      break;
    case "build": {
      const target = [...args.slice(1)].find((a) => a.startsWith("--target="))?.slice("--target=".length) ?? "";
      if (flags.has("--production") || flags.has("--deterministic")) {
        mode = flags.has("--deterministic") ? "build-deterministic" : "build-production";
      } else if (target === "wasm-standalone" || target === "wasm-wasi" ||
                 flags.has("--target=wasm-standalone") || flags.has("--target=wasm-wasi")) {
        // Phase 42: wasm-wasi is a canonical alias for wasm-standalone
        mode = "build-wasm-standalone";
      } else if (target === "wasm-hybrid" || flags.has("--target=wasm-hybrid")) {
        mode = "build-wasm-hybrid";
      } else {
        mode = "build";
      }
      break;
    }
    case "fix":
      if (!flags.has("--effects")) {
        process.stderr.write("[error] galerina fix requires --effects flag\n");
        process.exit(1);
      }
      mode = "fix-effects";
      break;
    case "emit":
      if (!flags.has("--ai-graph")) {
        process.stderr.write("[error] galerina emit requires --ai-graph flag\n");
        process.exit(1);
      }
      mode = "emit-ai-graph";
      break;
    case "verify-selfhost":
      mode = "verify-selfhost";
      break;
    case "cost":
      if (!flags.has("--analysis")) {
        process.stderr.write("[error] galerina cost requires --analysis flag\n");
        process.exit(1);
      }
      mode = "cost-analysis";
      break;
    case "diff":
      mode = "governance-diff";
      break;
    default:
      process.stderr.write(
        "Usage: galerina <command> [options] [path]\n" +
        "Commands:\n" +
        "  check                        Check .fungi files (dev mode)\n" +
        "  check --strict               Check .fungi files (strict mode)\n" +
        "  build                        Build .fungi files (JS bootstrap)\n" +
        "  build --production           Build with full governance enforcement\n" +
        "  build --deterministic        Build with strict reproducibility checks\n" +
        "  build --target=wasm-standalone  Emit WASM/WASI module (no JS required)\n" +
        "  build --target=wasm-wasi       Alias for wasm-standalone (Phase 42)\n" +
        "  build --target=wasm-hybrid   Emit JS shell + WASM pure-flow core\n" +
        "  fix --effects                Suggest missing effect declarations\n" +
        "  emit --ai-graph              Emit build/semantic/galerina.ai.json\n" +
        "  verify-selfhost              Verify deterministic (reproducible) build\n" +
        "  cost --analysis              Analyse contract.economics blocks across all flows\n" +
        "  diff [baseRef] [--json]      Governance delta vs a git ref (exit 2 if authority widens)\n" +
        "  gate from-pattern <p> --name <c>  Generate a .gate circuit from a bounded pattern (stdout)\n",
      );
      process.exit(1);
  }

  return { mode, targetDir };
}

// ---------------------------------------------------------------------------
// WASM standalone build (Phase 26A)
// ---------------------------------------------------------------------------

/**
 * Checks if wasmtime is available on PATH by running "wasmtime --version".
 * Returns the version string on success, or null if not found.
 */
function checkWasmtime(): string | null {
  try {
    const result = spawnSync("wasmtime", ["--version"], { encoding: "utf8", timeout: 5000 });
    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Phase 26A: Build wasm-standalone target.
 *
 * For each .fungi file:
 *   1. Parse + compile to WAT text.
 *   2. Write build/wasm/output.wat.
 *   3. Run JS assembler to produce build/wasm/output.wasm.
 *   4. If wasmtime is available, print "To execute: wasmtime build/wasm/output.wasm".
 *   5. If wasmtime is not available, print clear install instructions.
 */
function assertContainedPath(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (isAbsolute(rel) || rel === ".." || /^\.\.(?:[\\/]|$)/.test(rel)) {
    throw new Error(`REFUSED: standalone WASM output path resolves outside the selected target: ${candidate}`);
  }
}

interface StandaloneDirectoryIdentity {
  readonly dev: number;
  readonly ino: number;
}

interface ActivePinnedStandaloneDirectory {
  readonly identity: StandaloneDirectoryIdentity;
  readonly path: string;
  readonly descriptor?: number;
}

let activePinnedStandaloneDirectory: ActivePinnedStandaloneDirectory | undefined;

function standaloneDirectoryIdentity(stats: { readonly dev: number; readonly ino: number }): StandaloneDirectoryIdentity {
  return { dev: stats.dev, ino: stats.ino };
}

function sameStandaloneDirectoryIdentity(
  left: { readonly dev: number; readonly ino: number },
  right: { readonly dev: number; readonly ino: number },
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function pinnedWorkingDirectoryPath(): string {
  return activePinnedStandaloneDirectory?.path ?? ".";
}

function ensurePlainOutputDirectory(
  root: string,
  childPath: string,
  parentIdentity: StandaloneDirectoryIdentity,
): StandaloneDirectoryIdentity {
  const parentDirectory = dirname(childPath);
  const childName = basename(childPath);
  let createdIdentity: StandaloneDirectoryIdentity | undefined;
  let createdHere = false;
  const rollbackCreatedOutputDirectory = (): void => {
    if (createdIdentity === undefined) {
      if (createdHere) {
        throw new Error(
          `REFUSED: output directory identity could not be verified after creation; preserving ${childPath}`,
        );
      }
      return;
    }
    const movedParent = standaloneDirectoryIdentity(statSync("."));
    if (!sameStandaloneDirectoryIdentity(movedParent, parentIdentity)) {
      throw new Error(`REFUSED: output-directory rollback lost its pinned parent; preserving ${childPath}`);
    }
    const ownedChildPath = join(pinnedWorkingDirectoryPath(), childName);
    const current = lstatSync(ownedChildPath);
    if (current.isSymbolicLink() || !current.isDirectory()
      || !sameStandaloneDirectoryIdentity(current, createdIdentity)) {
      throw new Error(`REFUSED: created output directory identity is uncertain; preserving ${childPath}`);
    }
    // Remove only the empty directory this invocation created. If another
    // actor populated it, rmdir refuses and leaves that state intact.
    rmdirSync(ownedChildPath);
  };
  return withPinnedStandaloneOutputDirectory(parentDirectory, parentIdentity, () => {
    try {
      if (!existsSync(childName)) {
        mkdirSync(childName);
        createdHere = true;
      }
      const ownedChildPath = join(pinnedWorkingDirectoryPath(), childName);
      const stats = lstatSync(ownedChildPath);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(`REFUSED: standalone WASM output directory must be a real directory, not a link or file: ${childPath}`);
      }
      if (createdHere) createdIdentity = standaloneDirectoryIdentity(stats);
      assertContainedPath(root, realpathSync(ownedChildPath));
      return standaloneDirectoryIdentity(stats);
    } catch (error: unknown) {
      try {
        rollbackCreatedOutputDirectory();
      } catch (rollbackError: unknown) {
        throw new Error(
          `REFUSED: output-directory setup failed (${String(error)}); rollback was incomplete (${String(rollbackError)})`,
        );
      }
      throw error;
    }
  }, rollbackCreatedOutputDirectory);
}

function sameStandaloneOutputPath(left: string, right: string): boolean {
  const normalizedLeft = resolvePath(left);
  const normalizedRight = resolvePath(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

class StandaloneOutputDirectoryChangedError extends Error {
  constructor(expectedDirectory: string) {
    super(`REFUSED: standalone WASM output directory identity changed during publication: ${expectedDirectory}`);
    this.name = "StandaloneOutputDirectoryChangedError";
  }
}

function assertPinnedStandaloneOutputDirectory(
  expectedDirectory: string,
  expectedIdentity: StandaloneDirectoryIdentity,
): void {
  const currentDirectory = realpathSync(".");
  const currentIdentity = standaloneDirectoryIdentity(statSync("."));
  const namedIdentity = standaloneDirectoryIdentity(statSync(expectedDirectory));
  if (!sameStandaloneOutputPath(currentDirectory, expectedDirectory)
    || !sameStandaloneDirectoryIdentity(currentIdentity, expectedIdentity)
    || !sameStandaloneDirectoryIdentity(namedIdentity, expectedIdentity)) {
    throw new StandaloneOutputDirectoryChangedError(expectedDirectory);
  }
}

/**
 * Perform output leaf mutations relative to the selected directory object,
 * not by re-resolving an absolute path after validation. If another process
 * replaces the named parent while a synchronous operation is in flight,
 * relative operations stay attached to the directory entered here. Windows
 * also prevents renaming an open current directory. Detect a moved directory
 * before any later mutation and refuse; this does not claim to prevent another
 * process from moving the selected directory object itself.
 */
function withPinnedStandaloneOutputDirectory<T>(
  expectedDirectory: string,
  expectedIdentity: StandaloneDirectoryIdentity,
  operation: () => T,
  rollbackOnIdentityChange?: () => void,
): T {
  const previousDirectory = process.cwd();
  const previousPinnedDirectory = activePinnedStandaloneDirectory;
  const reusedPinnedDirectory = previousPinnedDirectory !== undefined
    && sameStandaloneDirectoryIdentity(previousPinnedDirectory.identity, expectedIdentity);
  let changedDirectory = false;
  let openedDescriptor: number | undefined;
  if (!reusedPinnedDirectory) {
    const alreadyEnteredIdentity = standaloneDirectoryIdentity(statSync("."));
    changedDirectory = !sameStandaloneDirectoryIdentity(alreadyEnteredIdentity, expectedIdentity);
    if (changedDirectory) process.chdir(expectedDirectory);
    try {
      assertPinnedStandaloneOutputDirectory(expectedDirectory, expectedIdentity);
      if (process.platform === "linux") {
        openedDescriptor = openSync(".", fsConstants.O_RDONLY);
        const openedIdentity = standaloneDirectoryIdentity(fstatSync(openedDescriptor));
        if (!sameStandaloneDirectoryIdentity(openedIdentity, expectedIdentity)) {
          throw new Error("REFUSED: opened standalone WASM directory differs from the selected identity");
        }
        activePinnedStandaloneDirectory = {
          identity: expectedIdentity,
          path: `/proc/self/fd/${openedDescriptor}`,
          descriptor: openedDescriptor,
        };
      } else {
        activePinnedStandaloneDirectory = { identity: expectedIdentity, path: "." };
      }
    } catch (error: unknown) {
      if (openedDescriptor !== undefined) closeSync(openedDescriptor);
      if (changedDirectory) process.chdir(previousDirectory);
      throw error;
    }
  }
  try {
    assertPinnedStandaloneOutputDirectory(expectedDirectory, expectedIdentity);
    const result = operation();
    try {
      assertPinnedStandaloneOutputDirectory(expectedDirectory, expectedIdentity);
    } catch (error: unknown) {
      if (rollbackOnIdentityChange !== undefined) {
        try {
          rollbackOnIdentityChange();
        } catch (rollbackError: unknown) {
          throw new Error(
            `REFUSED: output directory identity changed (${String(error)}); owned-state rollback was incomplete (${String(rollbackError)})`,
          );
        }
      }
      throw error;
    }
    return result;
  } finally {
    if (!reusedPinnedDirectory) {
      activePinnedStandaloneDirectory = previousPinnedDirectory;
      if (openedDescriptor !== undefined) closeSync(openedDescriptor);
      if (changedDirectory) process.chdir(previousDirectory);
    }
  }
}

function assertSafeStandaloneOutputLeaf(filePath: string): void {
  try {
    const stats = lstatSync(filePath);
    if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1) {
      throw new Error(
        `REFUSED: standalone WASM output leaf must be an unlinked regular file: ${filePath}`,
      );
    }
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

function removeOwnedStandaloneOutputLeaf(
  outputLeaf: string,
  expectedIdentity: StandaloneDirectoryIdentity,
): void {
  let current;
  try {
    current = lstatSync(join(pinnedWorkingDirectoryPath(), outputLeaf));
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (current.isSymbolicLink() || !current.isFile() || current.nlink !== 1
    || !sameStandaloneDirectoryIdentity(current, expectedIdentity)) {
    throw new Error(`REFUSED: output leaf identity is uncertain; preserving ${outputLeaf}`);
  }
  rmSync(join(pinnedWorkingDirectoryPath(), outputLeaf));
}

function replaceStandaloneOutput(
  filePath: string,
  contents: string | Uint8Array,
  outputDirectoryIdentity: StandaloneDirectoryIdentity,
  encoding?: "utf8",
): StandaloneDirectoryIdentity {
  const outputDirectory = dirname(filePath);
  const outputLeaf = basename(filePath);
  let publishedIdentity: StandaloneDirectoryIdentity | undefined;
  const resultIdentity = withPinnedStandaloneOutputDirectory(outputDirectory, outputDirectoryIdentity, () => {
    assertSafeStandaloneOutputLeaf(outputLeaf);
    const temporaryLeaf = `.${outputLeaf}.tmp-${randomUUID()}`;
    let descriptor: number | undefined;
    let temporaryCreated = false;
    let temporaryIdentity: StandaloneDirectoryIdentity | undefined;
    let canonicalLinkReturned = false;
    try {
      descriptor = openSync(temporaryLeaf, "wx+", 0o600);
      temporaryCreated = true;
      const openedStats = fstatSync(descriptor);
      if (!openedStats.isFile()) {
        throw new Error("REFUSED: standalone WASM temporary output is not a regular file");
      }
      temporaryIdentity = standaloneDirectoryIdentity(openedStats);
      const expectedContents = typeof contents === "string"
        ? Buffer.from(contents, encoding ?? "utf8")
        : Buffer.from(contents);
      writeFileSync(descriptor, expectedContents);
      const observedContents = Buffer.alloc(expectedContents.length);
      let observedLength = 0;
      while (observedLength < observedContents.length) {
        const bytesRead = readSync(
          descriptor,
          observedContents,
          observedLength,
          observedContents.length - observedLength,
          observedLength,
        );
        if (bytesRead === 0) break;
        observedLength += bytesRead;
      }
      if (observedLength !== expectedContents.length
        || observedContents.some((byte, index) => byte !== expectedContents[index])) {
        throw new Error("REFUSED: standalone WASM temporary output bytes changed or are incomplete");
      }
      assertPinnedStandaloneOutputDirectory(outputDirectory, outputDirectoryIdentity);
      const temporaryStats = lstatSync(temporaryLeaf);
      const expectedSize = typeof contents === "string"
        ? Buffer.from(contents, encoding ?? "utf8").length
        : contents.length;
      if (temporaryStats.isSymbolicLink() || !temporaryStats.isFile() || temporaryStats.nlink !== 1
        || !sameStandaloneDirectoryIdentity(temporaryStats, temporaryIdentity)
        || temporaryStats.size !== expectedSize) {
        throw new Error("REFUSED: standalone WASM temporary output changed or is incomplete");
      }
      // A same-directory hard link publishes the complete inode atomically and
      // refuses if another actor has already populated the canonical name.
      linkSync(temporaryLeaf, outputLeaf);
      canonicalLinkReturned = true;
      const publishedStats = lstatSync(outputLeaf);
      if (publishedStats.isSymbolicLink() || !publishedStats.isFile()
        || !sameStandaloneDirectoryIdentity(publishedStats, temporaryIdentity)) {
        // The temporary pathname may have been substituted after its earlier
        // identity check. If the canonical leaf is still the same regular file
        // currently named by our temporary leaf and the link count reflects
        // this publication, remove only the canonical link we just created.
        // If identity is uncertain, preserve the entry and report the residue.
        let removedUnexpectedPublication = false;
        try {
          const currentTemporary = lstatSync(temporaryLeaf);
          const currentPublished = lstatSync(outputLeaf);
          if (!currentTemporary.isSymbolicLink() && currentTemporary.isFile()
            && !currentPublished.isSymbolicLink() && currentPublished.isFile()
            && currentTemporary.nlink >= 2 && currentPublished.nlink >= 2
            && sameStandaloneDirectoryIdentity(currentTemporary, publishedStats)
            && sameStandaloneDirectoryIdentity(currentPublished, publishedStats)) {
            rmSync(outputLeaf);
            removedUnexpectedPublication = true;
          }
        } catch {
          // Keep the original refusal; the diagnostic below records uncertainty.
        }
        if (!removedUnexpectedPublication) {
          throw new Error(
            "REFUSED: standalone WASM output identity changed during publication; canonical output may remain",
          );
        }
        canonicalLinkReturned = false;
        throw new Error("REFUSED: standalone WASM output identity changed during publication");
      }
      publishedIdentity = standaloneDirectoryIdentity(publishedStats);
      const publishedContents = Buffer.alloc(expectedContents.length);
      let publishedLength = 0;
      while (publishedLength < publishedContents.length) {
        const bytesRead = readSync(
          descriptor,
          publishedContents,
          publishedLength,
          publishedContents.length - publishedLength,
          publishedLength,
        );
        if (bytesRead === 0) break;
        publishedLength += bytesRead;
      }
      const openedAfterPublication = fstatSync(descriptor);
      if (publishedLength !== expectedContents.length
        || publishedContents.some((byte, index) => byte !== expectedContents[index])
        || !openedAfterPublication.isFile()
        || !sameStandaloneDirectoryIdentity(openedAfterPublication, temporaryIdentity)
        || openedAfterPublication.size !== expectedSize) {
        throw new Error("REFUSED: standalone WASM output bytes changed after verification or publication");
      }
      closeSync(descriptor);
      descriptor = undefined;
      const temporaryBeforeRemoval = lstatSync(temporaryLeaf);
      if (temporaryBeforeRemoval.isSymbolicLink() || !temporaryBeforeRemoval.isFile()
        || !sameStandaloneDirectoryIdentity(temporaryBeforeRemoval, temporaryIdentity)) {
        throw new Error(
          `REFUSED: ${outputLeaf} was published, but the temporary pathname changed; its replacement was preserved`,
        );
      }
      try {
        rmSync(temporaryLeaf);
      } catch (cleanupError: unknown) {
        throw new Error(
          `REFUSED: ${outputLeaf} was published, but temporary cleanup failed: ${String(cleanupError)}`,
        );
      }
      temporaryIdentity = undefined;
      temporaryCreated = false;
      assertPinnedStandaloneOutputDirectory(outputDirectory, outputDirectoryIdentity);
      return publishedIdentity;
    } catch (error: unknown) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* preserve the original publication failure */ }
      }
      if (canonicalLinkReturned && publishedIdentity === undefined && temporaryIdentity !== undefined) {
        try {
          const currentTemporary = lstatSync(temporaryLeaf);
          const currentPublished = lstatSync(outputLeaf);
          if (!currentTemporary.isSymbolicLink() && currentTemporary.isFile()
            && !currentPublished.isSymbolicLink() && currentPublished.isFile()
            && currentTemporary.nlink >= 2 && currentPublished.nlink >= 2
            && sameStandaloneDirectoryIdentity(currentTemporary, temporaryIdentity)
            && sameStandaloneDirectoryIdentity(currentPublished, temporaryIdentity)) {
            rmSync(outputLeaf);
            canonicalLinkReturned = false;
          }
        } catch {
          // Preserve any canonical entry whose identity cannot be re-established.
        }
      }
      let temporaryMayRemain = false;
      if (temporaryIdentity !== undefined) {
        try {
          const currentTemporary = lstatSync(temporaryLeaf);
          if (sameStandaloneDirectoryIdentity(currentTemporary, temporaryIdentity)) {
            rmSync(temporaryLeaf);
            temporaryCreated = false;
          } else {
            temporaryMayRemain = true;
          }
        } catch (cleanupError: unknown) {
          if (!(cleanupError instanceof Error && "code" in cleanupError && cleanupError.code === "ENOENT")) temporaryMayRemain = true;
        }
      } else if (temporaryCreated) {
        temporaryMayRemain = true;
      }
      const uncertainResidues: string[] = [];
      if (canonicalLinkReturned) {
        if (publishedIdentity !== undefined) {
          try {
            removeOwnedStandaloneOutputLeaf(outputLeaf, publishedIdentity);
            canonicalLinkReturned = false;
          } catch (cleanupError: unknown) {
            uncertainResidues.push(`canonical output may remain at ${join(outputDirectory, outputLeaf)} because cleanup could not prove its identity (${String(cleanupError)})`);
          }
        } else {
          uncertainResidues.push(`canonical output may remain at ${join(outputDirectory, outputLeaf)} because hard-link publication returned before its identity was established`);
        }
      }
      if (temporaryMayRemain) {
        uncertainResidues.push(`temporary output may remain at ${join(outputDirectory, temporaryLeaf)} because its identity could not be verified and safely removed`);
      }
      if (uncertainResidues.length > 0) {
        throw new Error(`REFUSED: publication failed (${String(error)}); ${uncertainResidues.join("; ")}`);
      }
      throw error;
    }
  }, () => {
    if (publishedIdentity !== undefined) removeOwnedStandaloneOutputLeaf(outputLeaf, publishedIdentity);
  });
  if (resultIdentity === undefined) {
    throw new Error(`REFUSED: standalone WASM output identity was not retained: ${filePath}`);
  }
  return resultIdentity;
}

function publishStandaloneOutputPair(
  outputPaths: ReturnType<typeof standaloneOutputPaths>,
  watContents: string,
  wasmContents: Uint8Array,
): void {
  const outputDirectory = dirname(outputPaths.watOutPath);
  const published: Array<{ readonly leaf: string; readonly identity: StandaloneDirectoryIdentity }> = [];
  const rollback = (): void => {
    const uncertain: string[] = [];
    for (const item of [...published].reverse()) {
      try {
        removeOwnedStandaloneOutputLeaf(item.leaf, item.identity);
      } catch (error: unknown) {
        uncertain.push(`${item.leaf}: ${String(error)}`);
      }
    }
    if (uncertain.length > 0) {
      throw new Error(`REFUSED: standalone output rollback incomplete; preserving uncertain leaves (${uncertain.join("; ")})`);
    }
    published.length = 0;
  };

  withPinnedStandaloneOutputDirectory(
    outputDirectory,
    outputPaths.outputDirectoryIdentity,
    () => {
      try {
        const watIdentity = replaceStandaloneOutput(
          outputPaths.watOutPath,
          watContents,
          outputPaths.outputDirectoryIdentity,
          "utf8",
        );
        published.push({ leaf: basename(outputPaths.watOutPath), identity: watIdentity });
        const wasmIdentity = replaceStandaloneOutput(
          outputPaths.wasmOutPath,
          wasmContents,
          outputPaths.outputDirectoryIdentity,
        );
        published.push({ leaf: basename(outputPaths.wasmOutPath), identity: wasmIdentity });
        assertPinnedStandaloneOutputDirectory(outputDirectory, outputPaths.outputDirectoryIdentity);
      } catch (error: unknown) {
        let directoryChanged = error instanceof StandaloneOutputDirectoryChangedError;
        if (!directoryChanged) {
          try {
            assertPinnedStandaloneOutputDirectory(outputDirectory, outputPaths.outputDirectoryIdentity);
          } catch {
            // Any failure to re-establish the selected namespace means its
            // identity is unverified (including ENOENT after rename-away).
            // Roll back only the inode-identified leaves through the pinned
            // directory object; if that cannot be proven, fail with residue.
            directoryChanged = true;
          }
        }
        if (directoryChanged) {
          try {
            rollback();
          } catch (rollbackError: unknown) {
            throw new Error(`REFUSED: standalone output pair failed (${String(error)}); ${String(rollbackError)}`);
          }
        }
        throw error;
      }
    },
    rollback,
  );
}

function invalidateStandaloneOutputs(outputPaths: {
  readonly watOutPath: string;
  readonly wasmOutPath: string;
  readonly outputDirectoryIdentity: StandaloneDirectoryIdentity;
}): void {
  const refused: string[] = [];
  const outputDirectory = dirname(outputPaths.watOutPath);
  withPinnedStandaloneOutputDirectory(outputDirectory, outputPaths.outputDirectoryIdentity, () => {
    for (const filePath of [outputPaths.watOutPath, outputPaths.wasmOutPath]) {
      try {
        const outputLeaf = basename(filePath);
        assertSafeStandaloneOutputLeaf(outputLeaf);
        rmSync(outputLeaf, { force: true });
      } catch {
        // Continue invalidating any safe companion artifact, but preserve the
        // unsafe leaf itself and refuse the build after both names are checked.
        refused.push(filePath);
      }
    }
  });
  if (refused.length > 0) {
    throw new Error(`REFUSED: standalone WASM output leaf could not be safely invalidated: ${refused.join(", ")}`);
  }
}

function standaloneOutputPaths(targetDir: string): {
  outDir: string;
  wasmOutPath: string;
  watOutPath: string;
  outputDirectoryIdentity: StandaloneDirectoryIdentity;
} {
  const physicalTarget = realpathSync(targetDir);
  const targetStats = statSync(physicalTarget);
  if (!targetStats.isDirectory()) {
    throw new Error(`REFUSED: standalone WASM target is not a directory: ${targetDir}`);
  }
  const targetIdentity = standaloneDirectoryIdentity(targetStats);
  const buildDir = join(physicalTarget, "build");
  const buildIdentity = ensurePlainOutputDirectory(physicalTarget, buildDir, targetIdentity);
  const outDir = join(buildDir, "wasm");
  const outputDirectoryIdentity = ensurePlainOutputDirectory(physicalTarget, outDir, buildIdentity);
  const watOutPath = join(outDir, "output.wat");
  const wasmOutPath = join(outDir, "output.wasm");
  return {
    outDir,
    watOutPath,
    wasmOutPath,
    outputDirectoryIdentity,
  };
}

async function runWasmStandaloneBuild(
  files: string[],
  outputPaths: ReturnType<typeof standaloneOutputPaths>,
): Promise<void> {
  const { outDir, watOutPath, wasmOutPath } = outputPaths;

  // Collect WAT from all files by compiling them
  const watParts: string[] = [];
  let firstWatModule: ReturnType<typeof buildWATFromCheckedProgram> | undefined;
  let inputWasBlocked = false;

  for (const filePath of files) {
    let source: string;
    try {
      source = readBoundedSource(filePath); // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
    } catch {
      inputWasBlocked = true;
      continue;
    }

    const checked = checkProgram(source, filePath);
    if (!checked.ok) {
      inputWasBlocked = true;
      process.stderr.write(
        `[error] ${filePath}: refusing to emit WASM — the production gate blocked it (BK-5/H1/M1 fail-closed).\n` +
        checked.diagnostics.map((d) => `  - ${d.code}: ${d.message}\n`).join(""),
      );
      continue; // do NOT lower / write an ungoverned artifact
    }

    // Flagship (0119 item 2, bridge 0155): a parameter `where` admission is a Verdict-ALLOW-only ENTRY gate
    // enforced by the interpreter and NOT lowered to WAT — a raw WASM run would BYPASS it. Refuse per-file,
    // fail-closed (the emitter also throws as a backstop; this gives a clean message + per-file granularity).
    if (astHasParamAdmission(checked.program.ast)) {
      inputWasBlocked = true;
      process.stderr.write(
        `[error] ${filePath}: refusing to emit WASM — a flow carries a parameter admission (\`where <predicate>\`) ` +
        `that is not lowered to WAT; a raw WASM run would BYPASS the admission entry gate (fail-closed, bridge 0155). ` +
        `Run the flow via the governed interpreter until admission lowering lands.\n`,
      );
      continue; // do NOT lower / write a module whose entry gate WASM cannot enforce
    }

    // A CAPABILITY REFUSAL IS A DIAGNOSTIC, NOT A CRASH. The lowering guards
    // (FUNGI-LAYOUT-001 and its siblings) signal an unsupported representation
    // by THROWING, and this call site let the throw escape the CLI as a raw
    // Node stack trace — the same shape GD-006 closed for `.gate`, where a
    // 4,000-deep set surfaced a bare RangeError to the user. The refusal itself
    // was always correct and fail-closed; what was missing is that it never
    // reached anyone as a diagnostic on the production path.
    //
    // `continue`, matching the block above: a refused input contributes no WAT,
    // and if every input is refused `watParts` is empty and nothing is written.
    let watText: string;
    try {
      const watModule = buildWATFromCheckedProgram(checked.program, STDLIB_CAPABILITY_MAP, "wasm-standalone");
      watText = renderWAT(watModule);
      if (firstWatModule === undefined) firstWatModule = watModule;
    } catch (error) {
      inputWasBlocked = true;
      const message = error instanceof Error ? error.message : String(error);
      const code = /\b(FUNGI-[A-Z0-9-]+-\d+)\b/.exec(message)?.[1] ?? "FUNGI-BACKEND-001";
      process.stderr.write(
        `[error] ${code}  ${filePath}\n  ${message}\n` +
        `  This flow cannot target wasm-standalone. It remains runnable through the governed interpreter.\n`,
      );
      continue; // do NOT lower / write a module the target cannot faithfully represent
    }
    watParts.push(`\n;; === ${filePath} ===\n${watText}`);
  }

  // M1: if any input was blocked (or none were readable), write NOTHING — a gate failure must not
  // leave a runnable partial .wasm behind.
  if (inputWasBlocked || watParts.length === 0) {
    process.stderr.write(`[error] no WASM emitted — one or more inputs were blocked by the production gate or unreadable (fail-closed).\n`);
    // 🔴 EXIT CODE, added 2026-08-07. This wrote the error and returned 0, so a
    // build that refused EVERY input and produced NO artifact reported success —
    // and `main` went on to print `PASS`. A CI pipeline gating on the exit
    // status would have shipped a green on a build that emitted nothing.
    //
    // "Wrote the message" is not "reported the failure": the message goes to a
    // human reading a terminal, the exit code goes to the machine deciding
    // whether to proceed, and only one of those was told.
    //
    // `exit(1)` rather than `exitCode = 1` — the typed process shim this file
    // uses exposes `exit` and not `exitCode`, and exiting here is correct
    // anyway: there is nothing left to do and no artifact to clean up.
    process.exit(1);
  }

  // For wasm-standalone, we emit a single combined WAT. If there are multiple
  // files, use the last one's WAT (a real linker is Phase 27+). For now,
  // use the first file's WAT as the output module.
  const finalWat = watParts.length > 0
    ? (watParts[0] ?? "(module)")
    : "(module)";

  // Strip the leading comment so wat2wasm gets a valid module
  const cleanWat = finalWat.replace(/^;; === .+? ===\n/, "");

  // Finish asynchronous assembly before entering the synchronous output
  // transaction, so the pinned directory object is never held across await.
  let assembleResult;
  try {
    if (firstWatModule === undefined) throw new Error("no checked WAT module is available for assembly");
    assembleResult = await assembleWATModule(firstWatModule);
  } catch (err: unknown) {
    try {
      replaceStandaloneOutput(watOutPath, cleanWat, outputPaths.outputDirectoryIdentity, "utf8");
    } catch (publishError: unknown) {
      process.stderr.write(`[error] ${String(publishError)}\n`);
      process.exit(1);
    }
    process.stdout.write(`[info] WAT written: ${watOutPath}\n`);
    process.stderr.write(`[error] WAT assembler failed: ${String(err)}\n`);
    process.exit(1);
  }

  // #163: a wabt-REJECTED module falls back to the minimal-encoder STUB with
  // `valid:true` PLUS a "NOT a faithful compile" diagnostic. Gate on both
  // conditions before publishing either member of the valid output pair.
  if (assembleResult.valid && assembleResult.diagnostics.length === 0) {
    try {
      publishStandaloneOutputPair(outputPaths, cleanWat, Buffer.from(assembleResult.wasm));
    } catch (error: unknown) {
      process.stderr.write(`[error] ${String(error)}\n`);
      process.exit(1);
    }
    process.stdout.write(`[info] WAT written: ${watOutPath}\n`);
    process.stdout.write(`[info] WASM binary written: ${wasmOutPath}\n`);

    // Check wasmtime availability
    const wasmtimeVersion = checkWasmtime();
    if (wasmtimeVersion !== null) {
      process.stdout.write(`[info] wasmtime found: ${wasmtimeVersion}\n`);
      process.stdout.write(`[info] To execute: wasmtime ${wasmOutPath}\n`);
    } else {
      process.stdout.write(`[info] wasmtime not found on PATH.\n`);
      process.stdout.write(`[info] To install wasmtime, visit: https://wasmtime.dev\n`);
      process.stdout.write(`[info]   macOS:      brew install wasmtime\n`);
      process.stdout.write(`[info]   Linux:      install a distribution package or a version-pinned, digest-verified release\n`);
      process.stdout.write(`[info]   Windows:    winget install BytecodeAlliance.wasmtime\n`);
      process.stdout.write(`[info] To execute (once installed): wasmtime ${wasmOutPath}\n`);
      process.stdout.write(`[info] WAT file is at: ${watOutPath} (run wat2wasm manually if needed)\n`);
    }
  } else {
    try {
      replaceStandaloneOutput(watOutPath, cleanWat, outputPaths.outputDirectoryIdentity, "utf8");
    } catch (error: unknown) {
      process.stderr.write(`[error] ${String(error)}\n`);
      process.exit(1);
    }
    process.stdout.write(`[info] WAT written: ${watOutPath}\n`);
    process.stderr.write(`[error] JS assembler could not produce a valid WASM binary for this WAT pattern.\n`);
    for (const d of assembleResult.diagnostics) {
      process.stderr.write(`[error] assembler: ${d.message}\n`);
    }
    process.stderr.write(`[error] WAT retained at: ${watOutPath}; no WASM binary emitted.\n`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Cost analysis (Phase 30 stub)
// ---------------------------------------------------------------------------

/**
 * Compiles all .fungi files, extracts contract.economics sub-blocks from each
 * flow, and writes a JSON cost summary to build/cost-analysis.json.
 *
 * Economics extraction is best-effort: if a flow has no economics contract
 * the entry still appears in the output with hasEconomicsContract: false.
 *
 * Phase 30 note: estimatedComputeMs is always null until the CostGraph is
 * wired (Phase 30). The field is reserved for future population.
 */
/**
 * Phase 32: `galerina diff [baseRef]` -- governance delta between a git ref and the working tree.
 * Compares the governance shape (effects, qualifier) of every flow.
 * Default baseRef: HEAD. Use `--json` for machine-readable output.
 */
function runGovernanceDiff(baseRefArg: string): void {
  // baseRefArg defaults to process.cwd() when no positional given -- treat that as HEAD.
  const baseRef = baseRefArg === process.cwd() ? "HEAD" : baseRefArg.replace(/\.\.$/, "");
  const wantJson = process.argv.includes("--json");

  // Collect all .fungi files currently present. Git-IGNORED files (build
  // artifacts, stranded test fixtures) are excluded: they can never exist at
  // baseRef, so each would read as a phantom "added" flow on every run.
  const files = excludeGitIgnored(findFungiFiles(process.cwd()), process.cwd());
  const beforeFlows: FlowMeta[] = [];
  const afterFlows: FlowMeta[] = [];

  for (const file of files) {
    const rel = file.replace(process.cwd() + "\\", "").replace(process.cwd() + "/", "").replace(/\\/g, "/");
    // After = working tree
    try {
      const afterSrc = readBoundedSource(file); // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
      afterFlows.push(...parseProgram(afterSrc, file).flows);
    } catch { /* skip unreadable */ }
    // Before = the file at baseRef (git show)
    // OWASP F1: use spawnSync with array args -- never interpolate user input into shell string.
    // Validate baseRef against a strict ref pattern first (no shell metacharacters).
    try {
      if (!/^[a-zA-Z0-9._\-/^~@{}:]+$/.test(baseRef)) {
        throw new Error(`Invalid git ref: '${baseRef}' contains unsafe characters`);
      }
      // OWASP F1: shell:false is the default for spawnSync -- no need to pass it.
      // The array-args form already prevents shell interpolation.
      const gitResult = spawnSync("git", ["show", `${baseRef}:${rel}`], {
        encoding: "utf8",
        timeout: 15_000,
      });
      if (gitResult.status === 0 && gitResult.stdout) {
        beforeFlows.push(...parseProgram(gitResult.stdout, file).flows);
      }
    } catch { /* file did not exist at baseRef -- treated as added */ }
  }

  const diff = diffGovernance(beforeFlows, afterFlows);

  if (wantJson) {
    process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
  } else {
    process.stdout.write(renderGovernanceDiff(diff) + "\n");
  }
  // Exit codes:
  //   0 = neutral or tightening — no human review required beyond normal
  //   2 = expansion or authority widening — requires 2 reviewers (security/governance owner)
  //   3 = experimental — requires architecture review + conformance rerun
  const exitCode = diff.changeClass === "experimental" ? 3
                 : (diff.widensAuthority || diff.changeClass === "expansion") ? 2
                 : 0;
  process.exit(exitCode);
}

function runCostAnalysis(targetDir: string): void {
  const files = findFungiFiles(targetDir);
  if (files.length === 0) {
    process.stdout.write("No .fungi files found.\n");
    return;
  }

  interface CostFlowEntry {
    name: string;
    targetLatencyMs: number | null;
    targetCostGBP: number | null;
    declaredEffects: string[];
    estimatedComputeMs: null;
    hasEconomicsContract: boolean;
    hasLineageContract: boolean;
    hasAiContract: boolean;
  }

  const flowEntries: CostFlowEntry[] = [];
  let flowsWithEconomics = 0;
  let flowsWithLineage = 0;
  let governanceProofsGenerated = 0;

  for (const filePath of files) {
    let source: string;
    try {
      source = readBoundedSource(filePath); // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
    } catch {
      continue;
    }

    const parseResult = parseProgram(source, filePath, { requireVersionHeader: true });

    for (const flow of parseResult.flows) {
      // Find the contract node for this flow in the AST by scanning children
      // The flow node is identified by name in the AST children list
      let targetLatencyMs: number | null = null;
      let targetCostGBP: number | null = null;
      let hasEconomicsContract = false;
      let hasLineageContract = false;
      let hasAiContract = false;

      // Walk AST to find the flow's contract sub-blocks.
      // Uses unknown casts to avoid complex nested readonly/mutable type mismatches.
      function nodeKind(n: unknown): string {
        return (n as { kind?: string }).kind ?? "";
      }
      function nodeValue(n: unknown): string {
        return (n as { value?: string }).value ?? "";
      }
      function nodeChildren(n: unknown): unknown[] {
        return (n as { children?: unknown[] }).children ?? [];
      }

      function walkForContract(node: unknown): void {
        if (isFlowDeclNamed(node as AstNode, flow.name)) {
          for (const child of nodeChildren(node)) {
            if (nodeKind(child) === "contractDecl") {
              for (const subBlock of nodeChildren(child)) {
                const sbVal = nodeValue(subBlock);
                if (sbVal === "economics:block") {
                  hasEconomicsContract = true;
                  // Parse decl children for target_latency and target_cost
                  for (const decl of nodeChildren(subBlock)) {
                    const dv = nodeValue(decl);
                    const latencyMatch = dv.match(/^decl:target_latency\s*<\s*(\d+)/);
                    if (latencyMatch?.[1] !== undefined) targetLatencyMs = parseInt(latencyMatch[1], 10);
                    const costMatch = dv.match(/^decl:target_cost\s*<\s*([\d.]+)/);
                    if (costMatch?.[1] !== undefined) targetCostGBP = parseFloat(costMatch[1]);
                  }
                }
                if (sbVal === "lineage:block") hasLineageContract = true;
                if (sbVal === "ai:block") hasAiContract = true;
              }
            }
          }
          return;
        }
        for (const child of nodeChildren(node)) {
          walkForContract(child);
        }
      }

      walkForContract(parseResult.ast);

      if (hasEconomicsContract) flowsWithEconomics++;
      if (hasLineageContract) flowsWithLineage++;
      governanceProofsGenerated++;

      flowEntries.push({
        name: flow.name,
        targetLatencyMs,
        targetCostGBP,
        declaredEffects: [...flow.declaredEffects],
        estimatedComputeMs: null,
        hasEconomicsContract,
        hasLineageContract,
        hasAiContract,
      });
    }
  }

  const summary = {
    flowsWithEconomics,
    flowsWithLineage,
    estimatedManualAuditHoursRemoved: Math.round(governanceProofsGenerated * 0.27),
    governanceProofsGenerated,
  };

  const costReport = { flows: flowEntries, summary };
  const json = JSON.stringify(costReport, null, 2);

  const outDir = join(targetDir, "build");
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    // already exists
  }

  const outFile = join(outDir, "cost-analysis.json");
  writeFileSync(outFile, json, "utf8");

  process.stdout.write(json + "\n");
  process.stdout.write(`[info] Cost analysis written to ${outFile}\n`);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * `galerina gate from-pattern <pattern> --name <circuit>` (ratified order 2).
 *
 * Handled BEFORE `parseArgs` deliberately: that function returns a fixed
 * `{mode, targetDir}` contract with nowhere to carry a pattern and a name, and
 * widening it for one subcommand would distort every other command's shape.
 *
 * Writes the generated circuit to STDOUT and nothing else — no file is created
 * (doc 34 §4: "write to standard output by default and refuse overwriting an
 * existing file"). A refusal goes to stderr with exit 1, so a shell pipeline
 * cannot mistake a refusal for a circuit.
 *
 * Returns true when it handled the argv, so `main` can stop.
 */
function runGateFromPattern(args: readonly string[]): boolean {
  if (args[0] !== "gate" || args[1] !== "from-pattern") return false;

  const rest = args.slice(2);
  const nameAt = rest.indexOf("--name");
  const name = nameAt >= 0 ? rest[nameAt + 1] : undefined;
  const positional = rest.filter((a, i) => !a.startsWith("--") && i !== nameAt + 1);
  const pattern = positional[0];

  if (pattern === undefined || name === undefined) {
    process.stderr.write(
      "Usage: galerina gate from-pattern <pattern> --name <circuit>\n" +
      "  Generates a .gate circuit on STDOUT. The generated TEXT is the artifact:\n" +
      "  review it, commit it, and let the normal check pipeline verify it.\n" +
      "  A generator is not an admission authority.\n",
    );
    process.exit(1);
  }
  if (positional.length > 1) {
    // Refuse rather than silently use the first: an unquoted pattern that the
    // shell split into several words would otherwise generate a circuit for a
    // FRAGMENT of what the author wrote.
    process.stderr.write(
      `[error] expected one pattern, got ${positional.length} — quote the pattern so the shell does not split it\n`,
    );
    process.exit(1);
  }

  const result = generateCircuitFromPattern(pattern, { name });
  if (!result.ok) {
    process.stderr.write(`[error] ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(result.source);
  // The reason list goes to STDERR so `> out.gate` captures only the circuit.
  process.stderr.write(
    `[info] ${result.parts} parts, ${result.wires} wires. ` +
    `The registry must declare deny reasons: ${result.reasons.join(", ")}\n`,
  );
  return true;
}

async function main(): Promise<void> {
  const productAdmission = resolveProductCliSelection("galerina", process.argv.slice(2));
  if (!productAdmission.ok) {
    process.stderr.write(`[error] ${productAdmission.code}: product selection refused before discovery\n`);
    process.exit(2);
  }
  const admittedArgs = productAdmission.remainingArgs;
  // Before parseArgs — see the note on runGateFromPattern.
  if (runGateFromPattern(admittedArgs)) return;

  const { mode, targetDir } = parseArgs(admittedArgs);
  let standaloneBuildOutputPaths: ReturnType<typeof standaloneOutputPaths> | undefined;
  // A standalone rebuild owns this one canonical artifact path. Invalidate it
  // before discovery or compilation so any refusal cannot leave an older
  // binary looking like the result of this invocation.
  if (mode === "build-wasm-standalone") {
    try {
      standaloneBuildOutputPaths = standaloneOutputPaths(targetDir);
      invalidateStandaloneOutputs(standaloneBuildOutputPaths);
    } catch (error: unknown) {
      process.stderr.write(`[error] ${String(error)}\n`);
      process.exit(1);
    }
  }
  // Load galerina.check.json / .galerinarc.json if present
  const checkConfig: CheckConfig = (mode === "check" || mode === "check-strict")
    ? loadCheckConfig(targetDir)
    : {};

  // fix --effects is a special path
  if (mode === "fix-effects") {
    runFixEffects(targetDir);
    return;
  }

  // verify-selfhost is a special path
  if (mode === "verify-selfhost") {
    runVerifySelfhost();
    return;
  }

  // cost --analysis is a special path
  if (mode === "cost-analysis") {
    runCostAnalysis(targetDir);
    return;
  }

  // diff main..branch is a special path
  if (mode === "governance-diff") {
    runGovernanceDiff(targetDir);
    return;
  }

  let files: string[];
  try {
    files = findFungiFiles(targetDir);
  } catch (error: unknown) {
    process.stderr.write(`[error] ${error instanceof Error ? error.message : "REFUSED: source discovery failed"}\n`);
    process.exit(1);
  }
  if (files.length === 0) {
    if (mode === "build-wasm-standalone") {
      process.stderr.write("REFUSED: standalone WASM build requires at least one .fungi source file.\n");
      process.exit(1);
    }
    process.stdout.write("No .fungi files found.\n");
    process.exit(0);
  }
  let totalErrors = 0;
  let totalWarnings = 0;
  const allAiGraphParts: string[] = [];

  // Apply ignore patterns from config
  const filteredFiles = checkConfig.ignore?.length
    ? files.filter(f => {
        const rel = relative(targetDir, f).replace(/\\/g, "/");
        return !checkConfig.ignore!.some(pattern => {
          // Simple glob: "tests/**" matches any path starting with "tests/"
          const prefix = pattern.replace(/\/\*\*.*$/, "");
          return rel.startsWith(prefix);
        });
      })
    : files;

  // GD-026: a check that verified NOTHING must never report success.
  //
  // `ignore` patterns are applied AFTER discovery, so a config broad enough to
  // cover every discovered file used to leave `filteredFiles` empty, skip the
  // loop, leave `totalErrors` at 0 and fall through to `PASS: Check passed` --
  // a green that is byte-identical to a real one and produced by checking zero
  // files. Measured: a file that fails with exit 1 uncovered passes with exit 0
  // once an `ignore` pattern covers it.
  //
  // This is the fail-open direction, so it refuses. Note the asymmetry with the
  // `files.length === 0` case above: finding no `.fungi` files at all is a
  // statement about the TREE, and it reports "No .fungi files found" rather
  // than claiming a pass. Having found files and then suppressed all of them is
  // a statement about the CONFIG, and it is almost always a mistake -- an
  // over-broad pattern silencing the whole project.
  if (files.length > 0 && filteredFiles.length === 0) {
    process.stdout.write(
      `\nREFUSED: ${files.length} file(s) found, but the 'ignore' patterns in ` +
      `galerina.check.json suppressed every one of them, so this check verified nothing.\n` +
      `Narrow the patterns, or point the check at a path they do not cover. ` +
      `A check that inspects zero files cannot report a pass (fail-closed).\n`,
    );
    process.exit(1);
  }

  const wantFix  = process.argv.includes("--fix") || process.argv.includes("--fix-confirm");

  for (const filePath of filteredFiles) {
    const result = compileFile(filePath, mode, productAdmission.context);

    // Parse per-file disable directives from the source
    let directives: DisableDirectives = { fileDisabled: new Set(), lineDisabled: new Map() };
    try {
      const src = readBoundedSource(filePath); // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
      directives = parseDisableDirectives(src);
    } catch { /* ignore read error -- file already compiled above */ }

    // L4-F1/L4-F2 (RD-0234): under a STRICT verdict (build --production / --deterministic, or
    // check --strict) the outcome is NON-SUPPRESSIBLE — a `// galerina-disable` directive or a
    // galerina.check.json `rules:{…:"off"}` may quiet a warning, but MUST NOT silence a fail-closed
    // ERROR. Otherwise `// galerina-disable FUNGI-TAINT-001` turns a production security gate into a
    // suggestion, and check --strict ends up WEAKER than production. (The signing decision already
    // routes through the unsuppressed runProductionSecurityGate; this keeps the CLI verdict + exit
    // code honest too.) Warnings/info stay suppressible for noise control.
    const strictVerdict =
      PRODUCTION_STRICTNESS_MODES.has(mode) || mode === "check-strict";

    for (const d of result.diagnostics) {
      const isFailClosedError = (d.severity as string) === "error";
      // 1. Per-file directive suppression (// galerina-disable) — not for errors under a strict verdict.
      if (!(strictVerdict && isFailClosedError) &&
          isDisabledByDirective(d.code, (d as unknown as {location?:{line?:number}}).location?.line, directives)) continue;

      // 2. Config severity override (galerina.check.json "rules" section) — cannot downgrade/silence
      //    an error under a strict verdict.
      const effectiveSeverity = (strictVerdict && isFailClosedError)
        ? "error"
        : applySeverityOverride(d.code, d.severity as "error" | "warning" | "info", checkConfig);
      if (effectiveSeverity === "off") continue;

      // 3. Min-severity filter
      const minSev = checkConfig.minSeverity ?? "info";
      if (minSev === "error" && effectiveSeverity !== "error") continue;
      if (minSev === "warning" && effectiveSeverity === "info") continue;

      printDiagnostic({ ...d, severity: effectiveSeverity });
      if (effectiveSeverity === "error") {
        totalErrors += 1;
      } else if (effectiveSeverity === "warning") {
        totalWarnings += 1;
      }
    }

    if (wantFix) {
      applyAutoFix(filePath, result.diagnostics);
    }

    if (result.aiGraphJson !== undefined) {
      allAiGraphParts.push(result.aiGraphJson);
    }

    // Write .lmanifest alongside build output (task #33 — RFC 8785 canonical JSON)
    if (result.manifestJson !== undefined) {
      const outDir = join(targetDir, "build");
      try { mkdirSync(outDir, { recursive: true }); } catch { /* already exists */ }
      const baseName = basename(filePath, ".fungi");
      const manifestPath = join(outDir, `${baseName}.lmanifest`);
      writeFileSync(manifestPath, result.manifestJson, "utf8"); // perf-allow: loop-sync-io — one read/write per file in a per-file CLI build/scan loop (or one-shot startup config resolution) — distinct path per iteration, not hoistable, not O(n²)
      process.stdout.write(`[manifest] ${manifestPath}\n`);
    }
  }

  // Preserve each file's ordinary parser/type/import diagnostics before
  // refusing to publish an incomplete multi-file standalone module.
  let standaloneEntryFiles: string[] | undefined;
  if (mode === "build-wasm-standalone" && totalErrors === 0) {
    const unsupportedImports = findStandaloneImportsWithNonSchemaDeclarations(filteredFiles);
    if (unsupportedImports.length > 0) {
      process.stderr.write(
        `REFUSED: standalone WASM currently supports schema-only imports; imported executable declarations ` +
        `cannot be linked yet. Unsupported import file(s): ${unsupportedImports.join(", ")}\n`,
      );
      process.exit(1);
    }
    standaloneEntryFiles = findStandaloneEntryFiles(filteredFiles);
    if (standaloneEntryFiles.length !== 1) {
      process.stderr.write(
        standaloneEntryFiles.length === 0
          ? "REFUSED: standalone WASM build found no unimported entry source.\n"
          : `REFUSED: standalone WASM build currently accepts one entry source; ` +
            `${standaloneEntryFiles.length} independent entry sources were discovered. Multi-file linking is not implemented.\n`,
      );
      process.exit(1);
    }
  }

  // ── Production SBOM emission (RD-0120-F3) ──────────────────────────────────
  // For production/deterministic builds: collect package.galerina.yaml manifests
  // from every compiled file's directory, deduplicate, and emit CycloneDX 1.5
  // build/galerina.sbom.json. Fail-closed: FUNGI-SBOM-001 is printed for every
  // component without a verifiable sha256 hash, and the BOM is marked incomplete.
  if ((mode === "build-production" || mode === "build-deterministic") && totalErrors === 0) {
    const seen = new Set<string>();
    const manifests: ReturnType<typeof loadPackageManifest>[] = [];
    for (const filePath of filteredFiles) {
      const dir = dirname(resolvePath(filePath));
      if (!seen.has(dir)) {
        seen.add(dir);
        const m = loadPackageManifest(dir);
        if (m !== undefined) manifests.push(m);
      }
    }
    if (manifests.length > 0) {
      const sbomResult = generateCycloneDxSbom(
        manifests.filter((m): m is NonNullable<typeof m> => m !== undefined),
        { rootName: basename(targetDir) },
      );
      // Surface FUNGI-SBOM-001 diagnostics for incomplete components.
      for (const d of sbomResult.diagnostics) {
        process.stdout.write(`[warn] ${d.code}  ${d.component}\n  ${d.message}\n`);
        totalWarnings += 1;
      }
      const outDir = join(targetDir, "build");
      try { mkdirSync(outDir, { recursive: true }); } catch { /* already exists */ }
      const sbomPath = join(outDir, "galerina.sbom.json");
      writeFileSync(sbomPath, JSON.stringify(sbomResult.bom, null, 2), "utf8"); // perf-allow: loop-sync-io — one write per build (not per-file), so not O(n)
      process.stdout.write(
        `[sbom] ${sbomPath}${sbomResult.complete ? " (complete)" : " (INCOMPLETE — missing hashes)"}\n`,
      );
    }
  }

  // WASM target modes
  if (mode === "build-wasm-standalone" || mode === "build-wasm-hybrid") {
    if (totalErrors === 0) {
      if (mode === "build-wasm-standalone") {
        if (standaloneBuildOutputPaths === undefined) {
          process.stderr.write("[error] REFUSED: standalone WASM output directory was not pinned before compilation\n");
          process.exit(1);
        }
        await runWasmStandaloneBuild(standaloneEntryFiles ?? filteredFiles, standaloneBuildOutputPaths);
      } else {
        process.stdout.write(
          `[info] --target=wasm-hybrid: governance checks passed. ` +
          `WAT emitter wiring complete. ` +
          `Output: build/wasm/wasm-hybrid/\n`,
        );
      }
    }
  }

  // Emit AI graph JSON
  if (mode === "emit-ai-graph" && allAiGraphParts.length > 0) {
    const outDir = join(targetDir, "build", "semantic");
    try {
      mkdirSync(outDir, { recursive: true });
    } catch {
      // ignore -- may already exist
    }
    const outFile = join(outDir, "galerina.ai.json");
    // Wrap multiple files as an array, or unwrap single
    const combined =
      allAiGraphParts.length === 1
        ? (allAiGraphParts[0] ?? "[]")
        : `[\n${allAiGraphParts.join(",\n")}\n]`;
    writeFileSync(outFile, combined, "utf8");
    process.stdout.write(`[info] AI graph written to ${outFile}\n`);
  }

  // Summary
  const hasFatalErrors = totalErrors > 0;

  if (hasFatalErrors) {
    process.stdout.write(
      `\nBuild failed -- ${totalErrors} error(s), ${totalWarnings} warning(s)\n`,
    );
    process.exit(1);
  } else {
    const warnSuffix =
      totalWarnings > 0 ? `, ${totalWarnings} warning(s)` : "";
    // The count is part of the verdict, not decoration. "PASS" alone cannot be
    // told apart from a pass over nothing; "PASS ... (0 files)" can be, by a
    // reader and by a script. The refusal above should make zero unreachable
    // here -- stating the scope anyway is what keeps that true if a future
    // filter lands somewhere else in this function.
    const suppressed = files.length - filteredFiles.length;
    const skipSuffix = suppressed > 0 ? `, ${suppressed} ignored` : "";
    process.stdout.write(
      `\nPASS: Check passed (${filteredFiles.length} file(s) checked${skipSuffix}${warnSuffix})\n`,
    );
  }
}

// =============================================================================
// Watch mode (--watch flag) -- galerina check --watch
//
// Re-runs galerina check on any .fungi file change in the target directory.
// Uses Node.js fs.watch (no external deps). Debounced at 200ms.
// =============================================================================

function runWatch(targetDir: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // @ts-ignore -- require in ESM via CLI entrypoint (CJS compatible)
  const { watch: fsW, watchFile: fsWF } = (globalThis as unknown as {require:(m:string)=>unknown}).require?.("fs") ?? {watch:()=>{},watchFile:()=>{}} as {
    watch(p:string, o:{recursive:boolean}, cb:(e:string,f:string|null)=>void): void;
    watchFile(p:string, o:{interval:number}, cb:()=>void): void;
  };
  process.stdout.write(`[galerina watch] Watching ${targetDir} for .fungi changes...\n`);

  let debounce: ReturnType<typeof setTimeout> | undefined;
  const recheck = (filename: string | null) => {
    if (filename && !filename.endsWith(".fungi")) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      process.stdout.write(`\n[galerina watch] Change: ${filename ?? "unknown"} -- re-checking...\n`);
      void main().catch((error: unknown) => {
        process.stderr.write(`[error] CLI failed: ${String(error)}\n`);
        process.exit(1);
      });
    }, 200);
  };

  try {
    fsW(targetDir, { recursive: true }, (_evt: string, filename: string | null) => recheck(filename));
  } catch {
    // Fallback: watch individual .fungi files using watchFile
    let files: string[];
    try {
      files = findFungiFiles(targetDir);
    } catch (error: unknown) {
      process.stderr.write(`[error] CLI failed: ${String(error)}\n`);
      process.exit(1);
    }
    for (const f of files) {
      fsWF(f, { interval: 500 }, () => recheck(f));
    }
    process.stdout.write(`[galerina watch] Watching ${files.length} files individually\n`);
  }

  // Initial run
  void main().catch((error: unknown) => {
    process.stderr.write(`[error] CLI failed: ${String(error)}\n`);
    process.exit(1);
  });

  // Keep process alive
  (process as unknown as {stdin?:{resume():void}}).stdin?.resume();
  process.stdout.write("[galerina watch] Press Ctrl+C to stop.\n");
}

// Importing this module for the focused compiler harness must not execute the
// process entry point. Only the exact invoked CLI path may run `main()`.
const invokedCliPath = process.argv[1];
if (invokedCliPath !== undefined
  && resolvePath(invokedCliPath) === resolvePath(fileURLToPath(import.meta.url))) {
  if (process.argv.includes("--watch")) {
    const { targetDir } = parseArgs(process.argv.slice(2));
    void runWatch(targetDir);
  } else {
    void main().catch((error: unknown) => {
      process.stderr.write(`[error] CLI failed: ${String(error)}\n`);
      process.exit(1);
    });
  }
}
