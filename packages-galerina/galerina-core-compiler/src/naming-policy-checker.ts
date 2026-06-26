// =============================================================================
// Galerina Phase 17A — Naming Policy Checker
//
// Enforces naming conventions as a compiler pass:
//   - Flow/fn names → camelCase   (SPORE-STYLE-001)
//   - Type/record/enum names → PascalCase  (SPORE-STYLE-002)
//   - Sensitive binding names → suggest SecureString  (SPORE-STYLE-SEC-001)
// =============================================================================

import { type AstNode, type SourceLocation } from "./parser.js";

// ---------------------------------------------------------------------------
// Diagnostic codes (exported as named constants)
// ---------------------------------------------------------------------------

export const SPORE_STYLE_001 = {
  code: "SPORE-STYLE-001",
  name: "FlowNameCamelCase",
  severity: "warning" as const,
  message: "Flow and fn names should use camelCase (e.g. getUser, createPatient).",
} as const;

export const SPORE_STYLE_002 = {
  code: "SPORE-STYLE-002",
  name: "TypeNamePascalCase",
  severity: "warning" as const,
  message: "Type, record, and enum names should use PascalCase (e.g. UserId, PatientRecord).",
} as const;

export const SPORE_STYLE_SEC_001 = {
  code: "SPORE-STYLE-SEC-001",
  name: "SensitiveBindingType",
  severity: "warning" as const,
  message: "Binding name looks sensitive. Use SecureString or protected String to enforce security constraints.",
} as const;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NamingPolicyConfig {
  readonly flowNames: "camelCase" | "snake_case" | "none";
  readonly typeNames: "PascalCase" | "none";
  readonly variableNames: "camelCase" | "none";
  readonly severity: "error" | "warning" | "info";
}

const DEFAULT_NAMING_POLICY: NamingPolicyConfig = {
  flowNames: "camelCase",
  typeNames: "PascalCase",
  variableNames: "camelCase",
  severity: "warning",
};

export type NamingPolicyDiagnosticCode =
  | "SPORE-STYLE-001"
  | "SPORE-STYLE-002"
  | "SPORE-STYLE-SEC-001";

export interface NamingPolicyDiagnostic {
  readonly code: NamingPolicyDiagnosticCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
}

export interface NamingPolicyResult {
  readonly diagnostics: readonly NamingPolicyDiagnostic[];
}

// ---------------------------------------------------------------------------
// Naming-style helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `name` is camelCase:
 *   - Starts with a lowercase letter
 *   - Contains only letters, digits, and no separators (_, -)
 */
function isCamelCase(name: string): boolean {
  if (name.length === 0) return false;
  // Must start with lowercase letter
  if (!/^[a-z]/.test(name)) return false;
  // Must not contain underscores, hyphens, or spaces
  if (/[_\- ]/.test(name)) return false;
  // Must contain only alphanumeric characters
  if (!/^[a-zA-Z0-9]+$/.test(name)) return false;
  return true;
}

/**
 * Returns true if `name` is PascalCase:
 *   - Starts with an uppercase letter
 *   - Contains only letters and digits (no separators)
 */
function isPascalCase(name: string): boolean {
  if (name.length === 0) return false;
  if (!/^[A-Z]/.test(name)) return false;
  if (/[_\- ]/.test(name)) return false;
  if (!/^[a-zA-Z0-9]+$/.test(name)) return false;
  return true;
}

/**
 * Convert any name (snake_case, PascalCase, kebab-case) to camelCase.
 */
function toCamelCase(name: string): string {
  // Split on underscores, hyphens, and spaces
  const parts = name.split(/[_\-\s]+/);
  if (parts.length === 0) return name;

  const first = (parts[0] ?? "").toLowerCase();
  const rest = parts
    .slice(1)
    .map((p) => (p.length === 0 ? "" : p[0]!.toUpperCase() + p.slice(1).toLowerCase()));

  // If first part starts uppercase (PascalCase input), lowercase it
  return first + rest.join("");
}

/**
 * Convert any name to PascalCase.
 */
function toPascalCase(name: string): string {
  // Split on underscores, hyphens, spaces, or at uppercase boundaries
  // e.g. "userId" → ["user", "Id"] → "UserId"
  // First, split on explicit separators
  const parts = name.split(/[_\-\s]+/);

  return parts
    .map((p) => {
      if (p.length === 0) return "";
      return p[0]!.toUpperCase() + p.slice(1);
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Sensitive binding detection
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  "password",
  "secret",
  "apikey",   // normalised lowercase match
  "token",
];

const SAFE_PREFIXES = ["raw", "unsafe"];

function isSensitiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_PATTERNS.some((pat) => lower.includes(pat));
}

function hasSafePrefix(name: string): boolean {
  const lower = name.toLowerCase();
  return SAFE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// AST walker
// ---------------------------------------------------------------------------

/** Flow/fn declaration kinds. */
const FLOW_KINDS = new Set<string>([
  "flowDecl",
  "secureFlowDecl",
  "pureFlowDecl",
  "guardedFlowDecl",
  "fnDecl",
]);

/** Type declaration kinds. */
const TYPE_KINDS = new Set<string>(["typeDecl", "recordDecl", "enumDecl"]);

/** Binding declaration kinds. */
const BINDING_KINDS = new Set<string>(["letDecl", "mutDecl", "readonlyDecl"]);

/**
 * Extract the declared name from a flow/type/binding node.
 * The parser encodes the declaration header in `node.value`.
 *
 * Examples:
 *   flowDecl   .value: "getUser(id: UserId) -> PatientRecord"
 *   typeDecl   .value: "UserId = Brand<String, \"UserId\">"
 *   recordDecl .value: "PatientRecord { ... }"
 *   enumDecl   .value: "OrderStatus { ... }"
 *   letDecl    .value: "password"   (the BARE binding name — the RHS is a CHILD node, NOT part of .value;
 *                                    the real parser never emits "password = rhs". RD-0122.)
 * The leading-identifier regex below tolerates both the header forms above and the bare-name form.
 */
function extractDeclName(node: AstNode): string | undefined {
  const raw = (node.value ?? "").trim();
  if (raw === "") return undefined;

  // For flows: "name(params) -> ReturnType [effects ...]"
  if (FLOW_KINDS.has(node.kind)) {
    // Take everything before the first "(" or whitespace
    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    return match?.[1];
  }

  // For types/records/enums: "Name = ..." or "Name { ..."
  if (TYPE_KINDS.has(node.kind)) {
    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    return match?.[1];
  }

  // For bindings: "name: Type = expr" or "name = expr"
  if (BINDING_KINDS.has(node.kind)) {
    const match = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    return match?.[1];
  }

  return undefined;
}

/**
 * Walk the AST recursively, collecting diagnostics.
 */
function walkNode(
  node: AstNode,
  config: NamingPolicyConfig,
  diags: NamingPolicyDiagnostic[],
): void {
  const name = extractDeclName(node);

  if (name !== undefined) {
    // ── Flow/fn naming check (SPORE-STYLE-001) ──────────────────────────────
    if (FLOW_KINDS.has(node.kind) && config.flowNames !== "none") {
      if (!isCamelCase(name)) {
        const suggested = toCamelCase(name);
        const diag: NamingPolicyDiagnostic = {
          code: "SPORE-STYLE-001",
          severity: config.severity === "info" ? "warning" : config.severity,
          message: `Flow name '${name}' should be camelCase. Suggested: '${suggested}'`,
          suggestedFix: suggested,
          ...(node.location !== undefined ? { location: node.location } : {}),
        };
        diags.push(diag);
      }
    }

    // ── Type/record/enum naming check (SPORE-STYLE-002) ─────────────────────
    if (TYPE_KINDS.has(node.kind) && config.typeNames !== "none") {
      if (!isPascalCase(name)) {
        const suggested = toPascalCase(name);
        const diag: NamingPolicyDiagnostic = {
          code: "SPORE-STYLE-002",
          severity: config.severity === "info" ? "warning" : config.severity,
          message: `Type name '${name}' should be PascalCase. Suggested: '${suggested}'`,
          suggestedFix: suggested,
          ...(node.location !== undefined ? { location: node.location } : {}),
        };
        diags.push(diag);
      }
    }

    // ── Sensitive binding check (SPORE-STYLE-SEC-001) — always checked ──────
    if (BINDING_KINDS.has(node.kind)) {
      if (isSensitiveName(name) && !hasSafePrefix(name)) {
        const diag: NamingPolicyDiagnostic = {
          code: "SPORE-STYLE-SEC-001",
          severity: "warning",
          message: `Binding '${name}' looks sensitive. Use SecureString or protected String.`,
          suggestedFix: `Use 'unsafe let ${name}: SecureString' to acknowledge the security boundary, or prefix with 'raw' (e.g. 'raw${name[0]!.toUpperCase()}${name.slice(1)}').`,
          ...(node.location !== undefined ? { location: node.location } : {}),
        };
        diags.push(diag);
      }
    }
  }

  // Recurse into children
  for (const child of node.children ?? []) {
    walkNode(child, config, diags);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks naming conventions across the AST.
 *
 * Merges `config` with the `DEFAULT_NAMING_POLICY` so callers only need to
 * provide the fields they want to override.
 */
export function checkNamingPolicy(
  ast: AstNode,
  config?: Partial<NamingPolicyConfig>,
): NamingPolicyResult {
  const effectiveConfig: NamingPolicyConfig = {
    ...DEFAULT_NAMING_POLICY,
    ...config,
  };

  const diagnostics: NamingPolicyDiagnostic[] = [];
  walkNode(ast, effectiveConfig, diagnostics);

  return { diagnostics };
}
