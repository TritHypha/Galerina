// =============================================================================
// Galerina Phase 11E — Import Resolver
//
// Resolves `import X from "module"` and `import { X, Y } from "module"`
// declarations found in the parsed AST.
//
// Built-in Galerina packages (@galerina/*) are resolved from the standard type
// registry below without needing physical package files.  External packages
// and relative paths are silently accepted (unknown names are registered
// without type information so the pipeline does not emit spurious errors).
//
// Usage:
//   const result = resolveImports(ast);
//   // result.typeNames  — all type-namespace names to seed into TypeChecker
//   // result.valueNames — all value-namespace names to seed into SymbolResolver
// =============================================================================

import { type AstNode } from "./parser.js";
import { loadPackageManifest, resolvePackageTypes } from "./package-resolver.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImportedSymbol {
  /** The name as it will appear in Galerina source (the local binding). */
  readonly name: string;
  /** The module path the name was imported from. */
  readonly sourceModule: string;
  /** Whether this resolves to a type/record/enum or a value/function/DB. */
  readonly kind: "type" | "value";
}

export interface ImportResolveResult {
  /** All resolved symbols from import declarations. */
  readonly symbols: readonly ImportedSymbol[];
  /** Convenience: just the type-namespace names (for TypeChecker). */
  readonly typeNames: readonly string[];
  /** Convenience: just the value-namespace names (for SymbolResolver). */
  readonly valueNames: readonly string[];
}

// ---------------------------------------------------------------------------
// Standard Galerina module registry
//
// These are the canonical types and values exported by the built-in
// @galerina/* packages.  Importing from these paths does not require
// physical package files — they resolve from this registry.
// ---------------------------------------------------------------------------

interface ModuleExports {
  readonly types: readonly string[];
  readonly values: readonly string[];
}

const GALERINA_MODULE_REGISTRY: ReadonlyMap<string, ModuleExports> = new Map([
  // ── Healthcare ────────────────────────────────────────────────────────
  ["@galerina/healthcare-types", {
    types: [
      "PatientId", "NhsNumber", "PatientName", "DateOfBirth",
      "PatientRecord", "HealthRecord", "ClinicalActor",
      "HealthError", "PatientError", "ReferralError",
      "PatientReadRequest", "PatientProfileResponse", "PatientProfileRequest",
      "CreatePatientRequest",
    ],
    values: ["PatientDB", "PatientsDB"],
  }],

  // ── Financial ─────────────────────────────────────────────────────────
  ["@galerina/financial-types", {
    types: [
      "AccountId", "CardNumber", "SortCode", "TransactionId",
      "CustomerId", "OrderId", "CurrencyCode",
      "PaymentError", "OrderError", "FinancialActor",
      "CreateOrderRequest", "CreateOrderResponse",
    ],
    values: ["PaymentsDB", "OrdersDB", "AccountsDB", "PaymentService"],
  }],

  // ── Identity / access ─────────────────────────────────────────────────
  ["@galerina/identity-types", {
    types: [
      "UserId", "Actor", "TraceId", "TenantId", "Deadline",
      "AuthError", "PermissionError",
    ],
    values: ["UsersDB"],
  }],

  // ── AI / ML ───────────────────────────────────────────────────────────
  ["@galerina/ai-types", {
    types: [
      "Label", "ClassificationResult", "EmbeddingResult", "RiskScore", "AiError",
    ],
    values: ["ClassifierModel", "RiskModel", "EmbeddingModel"],
  }],

  // ── Core utilities ────────────────────────────────────────────────────
  ["@galerina/core-types", {
    types: [
      "Email", "Url", "Path", "Hostname", "Port",
      "CurrencyCode", "Reference",
      "ValidationError", "NetworkError", "NotificationError",
      "ExportError", "RecordError", "UserError",
    ],
    values: ["EmailService", "NotificationService"],
  }],

  // ── Enterprise types ──────────────────────────────────────────────────
  ["@galerina/enterprise-types", {
    types: [
      "Policy", "AuditRecord", "AuditProof", "ExecutionPlan", "RuntimeReport",
    ],
    values: [],
  }],

  // ── Compute types ─────────────────────────────────────────────────────
  ["@galerina/compute-types", {
    types: [
      "ComputeTarget", "ExecutionPlan", "RuntimeReport",
    ],
    values: [],
  }],

  // ── Domain types ──────────────────────────────────────────────────────
  ["@galerina/domain-types", {
    types: [
      "Email", "Url", "Path", "CurrencyCode", "Reference",
      "UserId", "Actor", "TraceId", "TenantId", "Deadline",
    ],
    values: [],
  }],
]);

// ---------------------------------------------------------------------------
// Import declaration parser
//
// Handles the raw text produced by parser.ts's parseImportDecl():
//   "Email from \"@galerina/core-types\""
//   "{ PatientId , NhsNumber } from \"@galerina/healthcare-types\""
//   "* as types from \"@galerina/ai-types\""
//
// Returns: list of { localName, moduleSource } pairs.
// ---------------------------------------------------------------------------

interface RawImportItem {
  readonly localName: string;
  readonly moduleSource: string;
}

function parseImportValue(raw: string): readonly RawImportItem[] {
  // Extract module path (last quoted string)
  const moduleMatch = raw.match(/from\s+["']([^"']+)["']/);
  const moduleSource = moduleMatch?.[1] ?? "<unknown>";

  // Extract the import clause (everything before `from`)
  const fromIdx = raw.lastIndexOf(" from ");
  const clause = (fromIdx === -1 ? raw : raw.slice(0, fromIdx)).trim();

  // Named imports: { X, Y, Z }
  if (clause.startsWith("{")) {
    const inner = clause.slice(1, clause.lastIndexOf("}")).trim();
    return inner.split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        // handle "X as localX" aliasing
        const asParts = s.split(/\s+as\s+/);
        const localName = (asParts[1] ?? asParts[0] ?? s).trim();
        return { localName, moduleSource };
      });
  }

  // Namespace import: * as ns
  if (clause.startsWith("*")) {
    const asParts = clause.split(/\s+as\s+/);
    const localName = (asParts[1] ?? "").trim();
    if (localName !== "") return [{ localName, moduleSource }];
    return [];
  }

  // Default / bare import: single name
  const name = clause.split(/\s/)[0]?.trim() ?? "";
  if (name !== "" && name !== "import") {
    return [{ localName: name, moduleSource }];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Package manifest cache
//
// Keyed by moduleSource (e.g. "@myorg/customer-types") → type names list.
// Populated lazily on first import of a non-@galerina/* package.
// ---------------------------------------------------------------------------

const manifestTypeCache = new Map<string, readonly string[]>();

/**
 * Attempt to load a package.galerina.yaml for a non-@galerina/* module.
 * Searches in `<nodeModulesRoot>/<moduleSource>/package.galerina.yaml`.
 * Returns the exported type names, or an empty array if not found.
 */
function loadExternalManifestTypes(
  moduleSource: string,
  nodeModulesRoot: string,
): readonly string[] {
  if (manifestTypeCache.has(moduleSource)) {
    return manifestTypeCache.get(moduleSource)!;
  }

  const packagePath = `${nodeModulesRoot}/${moduleSource}`;
  const manifest = loadPackageManifest(packagePath);
  const types: readonly string[] = manifest !== undefined
    ? resolvePackageTypes(manifest)
    : [];

  manifestTypeCache.set(moduleSource, types);
  return types;
}

// ---------------------------------------------------------------------------
// Resolve a single imported name against the module registry
// ---------------------------------------------------------------------------

function resolveSymbol(
  localName: string,
  moduleSource: string,
  nodeModulesRoot?: string,
): ImportedSymbol {
  const exports = GALERINA_MODULE_REGISTRY.get(moduleSource);
  if (exports !== undefined) {
    if (exports.types.includes(localName)) {
      return { name: localName, sourceModule: moduleSource, kind: "type" };
    }
    if (exports.values.includes(localName)) {
      return { name: localName, sourceModule: moduleSource, kind: "value" };
    }
    // Imported from a known module but not in the registry — treat as type
    // (conservative: the user declared it; no point erroring here)
    return { name: localName, sourceModule: moduleSource, kind: "type" };
  }

  // Non-@galerina/* package — try package.galerina.yaml manifest
  if (nodeModulesRoot !== undefined && !moduleSource.startsWith("@galerina/")) {
    const manifestTypes = loadExternalManifestTypes(moduleSource, nodeModulesRoot);
    if (manifestTypes.includes(localName)) {
      return { name: localName, sourceModule: moduleSource, kind: "type" };
    }
    // Not in manifest types → treat as value (external service/DB)
    if (manifestTypes.length > 0) {
      return { name: localName, sourceModule: moduleSource, kind: "value" };
    }
  }

  // Unknown / external module — silently accept as a value name
  // The compiler does not error on missing external modules at this phase.
  return { name: localName, sourceModule: moduleSource, kind: "value" };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Walks the top-level AST for `importDecl` nodes and resolves all imported
 * names against the built-in Galerina module registry.
 *
 * For non-@galerina/* imports, if `nodeModulesRoot` is provided the resolver
 * will look for a `package.galerina.yaml` manifest inside the package directory
 * and use it to classify names as types vs values.
 *
 * @param ast             The root `program` node from `parseProgram()`.
 * @param nodeModulesRoot Optional path to the project's node_modules directory.
 * @returns               All resolved symbols, with convenience `typeNames`/`valueNames` lists.
 */
export function resolveImports(ast: AstNode, nodeModulesRoot?: string): ImportResolveResult {
  const symbols: ImportedSymbol[] = [];

  for (const node of ast.children ?? []) {
    if (node.kind !== "importDecl") continue;
    const raw = (node.value ?? "").trim();
    if (raw === "") continue;

    const items = parseImportValue(raw);
    for (const { localName, moduleSource } of items) {
      if (localName === "") continue;
      symbols.push(resolveSymbol(localName, moduleSource, nodeModulesRoot));
    }
  }

  const typeNames = symbols.filter((s) => s.kind === "type").map((s) => s.name);
  const valueNames = symbols.filter((s) => s.kind === "value").map((s) => s.name);

  return { symbols, typeNames, valueNames };
}
