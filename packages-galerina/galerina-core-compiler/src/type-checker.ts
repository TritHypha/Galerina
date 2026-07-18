// =============================================================================
// Galerina Type Checker (Phase 6 → Phase 7A)
//
// Validates type references and structural rules in the parsed AST.
//
// Spec: ../ZTF-Knowledge-Bases/formal-type-system-spec.md
//
// Implemented diagnostics:
//   FUNGI-TYPE-001  UnknownType                — type name not in scope
//   FUNGI-TYPE-008  SilentNullDenied           — null / undefined used as value
//   FUNGI-TYPE-009  InvalidGenericInstantiation — wrong generic arity
//   FUNGI-TYPE-011  InvalidCollectionElement   — Array<T> element type mismatch
//   FUNGI-TYPE-017  QuantizedPrecisionMismatch — stub; fires when quantized/float tensors
//                                              mix without dequantize() (Phase 13, tensor scope)
//   FUNGI-TYPE-020  ShadowedBinding            — binding shadows outer-scope name (warning)
//   FUNGI-TYPE-021  NonExhaustiveMatch         — match missing arm(s)
//   FUNGI-TYPE-022  UnreachablePattern         — arm after wildcard or exhausted set
//   FUNGI-TYPE-032  InvalidCurrencyTag         — Money<CCY> tag is not a known ISO-4217 code (RD-0349 I1)
//   FUNGI-NAME-002  DuplicateName              — same name declared twice in same scope
//
// Implemented (continued):
//   FUNGI-TYPE-003  InvalidNominalConversion   — String → BrandedType requires gate (Phase 9A-2)
//   FUNGI-TYPE-004  InvalidBinaryOperation     — extended with String+non-String, Bool arithmetic,
//                                              String ordering comparisons
//   FUNGI-BINDING-005  ImmutableBindingReassigned — let/param reassignment rejected (Phase 11A.2)
//
// Deferred (require full expression type inference or call graph):
//   FUNGI-TYPE-002  TypeMismatch               — assignment compatibility (partial Phase 8A)
//   FUNGI-TYPE-005..007  Operator / call / return type checking
//   FUNGI-TYPE-010  UnsatisfiedGenericConstraint — generic constraint checks
//   FUNGI-TYPE-012..016  ResultType, SecretOp, MissingEffect, GovernedSink, TensorShape
//   FUNGI-TYPE-018  InvalidRuntimeTargetType
//   FUNGI-TYPE-019  UnknownSymbol
//   Module-level import resolution
//
// Protected/redacted boundary violations now live in value-state-checker.ts:
//   FUNGI-VALUESTATE-006  ProtectedBoundaryViolation
//   FUNGI-VALUESTATE-007  RedactedBoundaryViolation
//
// Symbol resolver (FUNGI-NAME-001, FUNGI-NAME-003) lives in symbol-resolver.ts
// =============================================================================

import { type AstNode, type SourceLocation } from "./parser.js";
import {
  resolveTypeId,
  TypeId,
  parseTensorType,
  tensorElementTypesCompatible,
  tensorDimensionCountsCompatible,
} from "./type-registry.js";
import { KNOWN_DOMAIN_TYPES } from "./package-type-registry.js";
import { MONEY_UNIT_TAGS } from "./unit-registry.generated.js";

// RD-0349 I1: the pinned ISO-4217 currency set — the SAME generated table the runtime `Money.of`
// enforces (stdlib.ts). A Money<CCY> whose tag is not here now fails at COMPILE time (FUNGI-TYPE-032),
// not only at runtime. The table is generated from the KB snapshot; its drift gate keeps it in sync.
const MONEY_UNIT_SET: ReadonlySet<string> = new Set<string>(MONEY_UNIT_TAGS);

// ---------------------------------------------------------------------------
// R5A: isBuiltInType — unified built-in type check (TypeId hot-path + BUILT_IN_TYPES fallback)
//
// Returns true when typeName is a recognised built-in:
//   1. Fast path: TypeId registry — numeric IDs for core types (Int, String, Bool, etc.)
//   2. Fallback: BUILT_IN_TYPES string Set — domain/enterprise types not yet assigned
//      a TypeId (e.g. Email, Url, PatientId, PatientError, AccountId).
//   3. Fallback: KNOWN_DOMAIN_TYPES — commonly used domain types that may appear in
//      Level 5+ CEC examples without an explicit import declaration.
//
// Use isBuiltInType() everywhere instead of calling resolveTypeId() or
// BUILT_IN_TYPES.has() directly — this is the single authoritative gate.
// The dual-check at call sites (isBuiltInType(x) || BUILT_IN_TYPES.has(x))
// is now collapsed into a single isBuiltInType(x) call.
// ---------------------------------------------------------------------------

function isBuiltInType(typeName: string): boolean {
  // Fast path: TypeId numeric registry (Int, String, Bool, Array, Result, etc.)
  if (resolveTypeId(typeName) !== TypeId.Unknown) return true;
  // Fallback 1: domain/enterprise types in the BUILT_IN_TYPES string Set
  if (BUILT_IN_TYPES.has(typeName)) return true;
  // Fallback 2: commonly used domain types (KNOWN_DOMAIN_TYPES)
  return KNOWN_DOMAIN_TYPES.has(typeName);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TypeDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
  /** Machine-applicable fix — the exact Galerina snippet to insert/replace, without prose. */
  readonly suggestedCode?: string;
  /** Rust-style: secondary source locations giving context (e.g. "declared here"). */
  readonly relatedLocations?: readonly { message: string; location: SourceLocation }[];
  /** Elm-style: why this is a problem. */
  readonly why?: string;
  /** Elm-style: what goes wrong if ignored. */
  readonly risk?: string;
}

export interface TypeCheckResult {
  readonly diagnostics: readonly TypeDiagnostic[];
}

// ---------------------------------------------------------------------------
// Diagnostic factory
//
// Branches explicitly on location/suggestedFix to satisfy
// exactOptionalPropertyTypes without assigning undefined to optional fields.
// suggestedCode is added via conditional spread — same safe pattern as parser.
// ---------------------------------------------------------------------------

function makeTCDiag(
  code: string,
  name: string,
  message: string,
  location: SourceLocation | undefined,
  suggestedFix: string | undefined,
  suggestedCode?: string,
): TypeDiagnostic {
  const sc = suggestedCode !== undefined ? { suggestedCode } : {};
  if (location !== undefined && suggestedFix !== undefined) {
    return { code, name, severity: "error", message, location, suggestedFix, ...sc };
  }
  if (location !== undefined) {
    return { code, name, severity: "error", message, location, ...sc };
  }
  if (suggestedFix !== undefined) {
    return { code, name, severity: "error", message, suggestedFix, ...sc };
  }
  return { code, name, severity: "error", message, ...sc };
}

// ---------------------------------------------------------------------------
// Inference markers
//
// These are NOT types — they are compile-time keywords that tell the type
// checker to defer resolution to the inference pass.
// Do NOT emit FUNGI-TYPE-001 for these names.
// Canonical source: ../ZTF-Knowledge-Bases/formal-type-system-spec.md §Auto
// ---------------------------------------------------------------------------

const INFERENCE_MARKERS: ReadonlySet<string> = new Set([
  "Auto",
]);

// ---------------------------------------------------------------------------
// Built-in type registry
// Canonical source: ../ZTF-Knowledge-Bases/formal-type-system-spec.md Section 2
// ---------------------------------------------------------------------------

const BUILT_IN_TYPES: ReadonlySet<string> = new Set([
  // Primitive
  "Bool", "Boolean", "Char", "Void",
  // K3 verdict (W5a, 2026-07-08): lattice DENY(-1) < UNKNOWN(0) < ALLOW(+1); lowers to WAT i32.
  "Verdict",
  // Numeric
  "Int", "Int8", "Int16", "Int32", "Int64",
  "UInt8", "UInt16", "UInt32", "UInt64",
  "Float", "Float16", "Float32", "Float64", "Double", "Decimal",
  // Text
  "String", "SecureString",
  // Temporal
  "Timestamp", "Duration",
  "Date", "Time", "DateTime",
  // Binary
  "Byte", "Bytes", "ReadOnlyView",
  // JSON
  "Json", "JsonNull", "JsonBool", "JsonNumber", "JsonString", "JsonArray", "JsonObject",
  // Collections
  "Array", "Set", "Map", "Channel",
  // Algebraic
  "Option", "Result",
  // Unit type — the singleton value type (like () in Haskell/Rust); returned by Ok(unit)
  "Unit",
  // List — canonical ordered collection alias for Array
  "List",
  // Numeric science / compute
  "Vector", "Matrix", "Tensor", "AnyTensor",
  // Compute / AI dimension labels
  "DynamicShape",
  // Domain / financial
  "Money", "GBP", "USD", "EUR", "JPY", "CHF", "CAD", "AUD",
  // HTTP / API
  "Request", "Response", "Context",
  // Error types
  "Error", "ApiError", "EmailError", "PaymentError", "ValidationError", "WebhookError",
  "DecodeError", "ParseError",
  // Branded types
  "Brand",
  // ── Security types ───────────────────────────────────────────────────────
  "Hash", "Signature", "Secret",
  // ── AI / ML types ────────────────────────────────────────────────────────
  "Prompt", "Embedding", "Classification", "ModelOutput", "Token",
  // ── Enterprise / governance types ────────────────────────────────────────
  "Policy", "AuditRecord", "AuditProof", "ExecutionPlan", "RuntimeReport",
  // ── Phase 11E: Domain identity types ────────────────────────────────────
  "Email", "Url", "Path", "Hostname", "Port", "CurrencyCode", "Reference",
  // Healthcare domain
  "PatientId", "NhsNumber", "PatientName", "DateOfBirth",
  // Financial domain
  "AccountId", "CardNumber", "SortCode", "TransactionId", "CustomerId",
  "OrderId",
  // Identity / access domain
  "UserId", "Actor", "TraceId", "TenantId", "Deadline",
  // ── Phase 11E: Domain error types ───────────────────────────────────────
  "AiError", "HealthError", "PatientError", "ReferralError", "NotificationError",
  "ExportError", "RecordError", "UserError", "OrderError",
  "AuthError", "PermissionError", "NetworkError",
  // ── Phase 11E: AI / ML types ────────────────────────────────────────────
  "Label", "ClassificationResult", "EmbeddingResult", "RiskScore",
  "Score",   // AI/ML generic confidence/relevance score
  // ── Phase 11E: Record / request / response types ─────────────────────────
  "PatientReadRequest", "PatientProfileResponse", "PatientProfileRequest",
  "CreatePatientRequest", "CreateOrderRequest", "CreateOrderResponse",
  // ── Phase 11E: import-resolved types (populated at runtime via import declarations) ──
  // These are registered here so the type checker accepts them without a local declaration.
  "PatientRecord", "HealthRecord", "ClinicalActor", "HealthRecord",
  "FinancialActor",
]);

// ---------------------------------------------------------------------------
// String-backed domain types
// These are built-in identity/domain types whose underlying representation is
// String. They are permitted in string concatenation (+) without requiring an
// explicit .toString() conversion — the type checker treats them as string-
// compatible operands for the + operator.
// ---------------------------------------------------------------------------

const STRING_BASED_TYPES: ReadonlySet<string> = new Set([
  "CurrencyCode", "Email", "Url", "Path", "Hostname", "Reference",
  "UserId", "Actor", "TraceId", "TenantId",
  "PatientId", "NhsNumber", "PatientName",
  "AccountId", "TransactionId", "CustomerId", "OrderId",
]);

// ---------------------------------------------------------------------------
// RD-0353 — Hallmark open types
// `hallmark X of T { gate: flow f, ops { … } }` mints a nominal type over a
// carrier. The schema's ops {} is the CLOSED algebra vocabulary a hallmark may
// participate in — deny-by-default, and a schema can never grant an effect (T3/T7).
// The epistemic/security governance vocabulary is reserved from minting (T1): a
// name carries no authority, so it may not be impersonated by a developer type.
// ---------------------------------------------------------------------------

const HALLMARK_ALGEBRA_OPS: ReadonlySet<string> = new Set([
  "add", "subtract", "scale", "ratio", "compare",
]);

const EPISTEMIC_RESERVED: ReadonlySet<string> = new Set([
  "Trusted", "Unverified", "Refuted", "Tainted", "SafeFor", "Secret", "Decision", "Verdict",
]);

// ---------------------------------------------------------------------------
// Generic arity rules
// Canonical source: ../ZTF-Knowledge-Bases/formal-type-system-spec.md Section 3
// ---------------------------------------------------------------------------

const GENERIC_ARITY: ReadonlyMap<string, number> = new Map([
  ["Option",       1],
  ["Result",       2],
  ["Array",        1],
  ["List",         1],  // List<T> — ordered collection alias for Array<T>
  ["Set",          1],
  ["Map",          2],
  ["Channel",      1],
  ["Vector",       2],
  ["Matrix",       3],
  ["Money",        1],
  ["Tensor",       2],  // Tensor<ElementType, Shape> — see galerina-tensor-arity-decision.md
  ["ReadOnlyView", 1],  // ReadOnlyView<T>
  ["Brand",        2],  // Brand<T, "Name">
  ["Embedding",    1],  // Embedding<768> — dimensioned embedding vector
  ["Secret",       1],  // Secret<ApiKey> — parameterised secret wrapper
]);

// Example strings for each generic type — used in fix suggestions (suggestedFix prose)
// and as suggestedCode (machine-applicable snippet)
const GENERIC_EXAMPLES: ReadonlyMap<string, string> = new Map([
  ["Option",       "Option<T>"],
  ["Result",       "Result<T, E>"],
  ["Array",        "Array<T>"],
  ["List",         "List<T>"],
  ["Set",          "Set<T>"],
  ["Map",          "Map<K, V>"],
  ["Channel",      "Channel<T>"],
  ["Vector",       "Vector<T, N>"],
  ["Matrix",       "Matrix<T, R, C>"],
  ["Money",        "Money<GBP>"],
  ["Tensor",       "Tensor<Float32, [Batch, Features]>"],
  ["ReadOnlyView", "ReadOnlyView<T>"],
  ["Brand",        "Brand<String, \"MyType\">"],
  ["Embedding",    "Embedding<768>"],
  ["Secret",       "Secret<ApiKey>"],
]);

// The KIND of each type-argument POSITION for a generic. A position that is anything but
// "type" is PAYLOAD — a nominal tag, a shape literal, or a dimension — and is NEVER a
// type reference, so checkTypeRef must not recurse into it. This declarative table is the
// single source of truth that replaces the old per-case regex skips (Brand tag / Tensor
// shape / numeric dim): a new generic with a non-type arg adds ONE row here and the type
// checker can never regress into that false-positive class again (057 Brand-tag, 401
// Tensor-shape). Generics whose args are ALL types (Option, Result, Array, Map,
// ReadOnlyView, Channel, Set, List, Secret) are omitted — the default kind is "type".
// Each row's length matches GENERIC_ARITY for that base.
type GenericArgKind = "type" | "tag" | "shape" | "dim";
const GENERIC_ARG_KINDS: ReadonlyMap<string, readonly GenericArgKind[]> = new Map([
  ["Brand",     ["type", "tag"]],        // Brand<T, Tag> — nominal identity tag (bare or quoted)
  ["Tensor",    ["type", "shape"]],      // Tensor<Elem, [d0, d1, ...]> — shape literal
  ["Vector",    ["type", "dim"]],        // Vector<Elem, N> — dimension (numeric or named)
  ["Matrix",    ["type", "dim", "dim"]], // Matrix<Elem, R, C> — row/col dimensions
  ["Money",     ["tag"]],                // Money<GBP> — currency tag
  ["Embedding", ["dim"]],                // Embedding<768> — dimension
]);

// ---------------------------------------------------------------------------
// Type string parser
//
// Converts a raw type value string like "Result<User,ValidationError>" into
// { base: "Result", args: ["User", "ValidationError"] }.
//
// Handles:
//   - Plain types:              "Int"        → { base: "Int", args: [] }
//   - Generic types:            "Option<String>" → { base: "Option", args: ["String"] }
//   - Nested generics:          "Map<String,Array<Int>>"
//   - Postfix value-state words: "String unsafe" → { base: "String", args: [] }
//   - Numeric literal args:     "Matrix<Float32,4,4>" (4 is a numeric dim arg)
// ---------------------------------------------------------------------------

interface ParsedTypeRef {
  readonly base: string;
  readonly args: readonly string[];
}

const GOVERNANCE_QUALIFIER_PREFIXES = ["protected ", "redacted "] as const;

function parseTypeString(raw: string): ParsedTypeRef {
  let input = raw.trim();

  for (const prefix of GOVERNANCE_QUALIFIER_PREFIXES) {
    if (input.startsWith(prefix)) {
      input = input.slice(prefix.length).trim();
      break;
    }
  }

  const ltIdx = input.indexOf("<");
  const baseSection = ltIdx === -1 ? input : input.slice(0, ltIdx);
  // Strip postfix qualifiers (space-separated after the type name)
  const base = baseSection.split(/\s/)[0]?.trim() ?? baseSection;

  if (ltIdx === -1) {
    return { base, args: [] };
  }

  const gtIdx = input.lastIndexOf(">");
  if (gtIdx === -1) {
    // Malformed — missing closing >; return base only
    return { base, args: [] };
  }

  const innerStr = input.slice(ltIdx + 1, gtIdx).trim();
  if (innerStr === "") return { base, args: [] };

  // Split at top-level commas (not nested inside <...>)
  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of innerStr) {
    if (ch === "<" || ch === "[") {
      // Track BOTH generic (<...>) and shape-literal ([...]) nesting depth so a comma
      // inside a tensor shape — Tensor<Float32, [1, 128]> — is NOT split at top level
      // (which mis-counted it as 3 args → false FUNGI-TYPE-009 / -001 under --strict).
      depth++;
      current += ch;
    } else if (ch === ">" || ch === "]") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed !== "") args.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }
  const lastArg = current.trim();
  if (lastArg !== "") args.push(lastArg);

  return { base, args };
}

// ---------------------------------------------------------------------------
// Phase 8A — Type inference helpers
// ---------------------------------------------------------------------------

/** Numeric types that support arithmetic operators. */
const NUMERIC_TYPES: ReadonlySet<string> = new Set([
  "Int", "Int8", "Int16", "Int32", "Int64",
  "UInt8", "UInt16", "UInt32", "UInt64",
  "Float", "Float16", "Float32", "Float64",
  "Decimal", "Byte",
]);

/** Types that support ordering operators (<, <=, >, >=). */
const ORDERABLE_TYPES: ReadonlySet<string> = new Set([
  ...NUMERIC_TYPES, "Timestamp", "Duration", "String",
]);

/**
 * Returns true when a value of `inferred` type can be used where `declared`
 * type is expected. Phase 8A: covers literals, numeric widening, and
 * algebraic wrappers.
 */
function isAssignmentCompatible(declared: string, inferred: string): boolean {
  if (declared === inferred) return true;
  if (declared === "Auto" || declared === "" || inferred === "") return true;

  // TypeId fast-path: if both types are known in the TypeId registry and they differ,
  // they are incompatible (no widening). This avoids string allocation for core types.
  const declaredId = resolveTypeId(declared);
  const inferredId = resolveTypeId(inferred);
  if (
    declaredId !== TypeId.Unknown &&
    inferredId !== TypeId.Unknown &&
    declaredId !== inferredId
  ) {
    // Numeric widening: Int (TypeId.Int = 5) is compatible with all numeric types.
    // We still need to fall through to the numeric widening rules below, so only
    // short-circuit when neither side is Int/Float/Decimal (the widening types).
    const isWideningSource =
      inferredId === TypeId.Int ||
      inferredId === TypeId.Float32 ||
      inferredId === TypeId.Float64 ||
      (inferred === "Float") ||
      (inferred === "Decimal") ||
      (inferred === "Byte");
    if (!isWideningSource) {
      return false; // Known type mismatch — emit FUNGI-TYPE-002 with high confidence
    }
  }

  // Strip governance qualifiers (protected/redacted) from inferred before comparing.
  // "protected Email" is assignment-compatible with "Email" because the qualifier
  // is additive. FUNGI-VALUESTATE-006/007 handle the reverse case (plain X ← protected X).
  let nInferred = inferred;
  if (nInferred.startsWith("protected ")) nInferred = nInferred.slice(10).trim();
  else if (nInferred.startsWith("redacted ")) nInferred = nInferred.slice(9).trim();
  if (declared === nInferred) return true;

  // Strip generic args for comparison
  const declaredBase = declared.split("<")[0]?.trim() ?? declared;
  const inferredBase = nInferred.split("<")[0]?.trim() ?? nInferred;
  if (declaredBase === inferredBase) return true;

  // Numeric widening: Int literal is compatible with all numeric types
  if (nInferred === "Int"     && NUMERIC_TYPES.has(declared)) return true;
  if (nInferred === "Float"   && (declared === "Float"   || declared.startsWith("Float"))) return true;
  if (nInferred === "Decimal" && (declared === "Decimal" || declared.startsWith("Float"))) return true;
  if (nInferred === "Byte"    && (declared === "Byte"    || declared === "UInt8"))          return true;

  // Algebraic type wrappers — coarse match for Phase 8A
  if (inferredBase === "Result"  && declaredBase === "Result")  return true;
  if (inferredBase === "Option"  && declaredBase === "Option")  return true;
  if (inferredBase === "Money"   && declaredBase === "Money")   return true;

  // Void for bare return in Void flows
  if (nInferred === "Void" && declared === "Void") return true;

  return false;
}

// ---------------------------------------------------------------------------
// Type checker implementation
// ---------------------------------------------------------------------------

class TypeChecker {
  private readonly diagnostics: TypeDiagnostic[] = [];
  private readonly userDefinedTypes: Set<string>;
  private readonly enumVariants = new Map<string, Set<string>>();
  private readonly bindingScopes: Array<Set<string>> = [];

  constructor(importedTypes: readonly string[] = []) {
    this.userDefinedTypes = new Set(importedTypes);
  }
  /**
   * Phase 9A-2: user-defined types declared as `type X = Brand<T, "Name">`.
   * Bindings with these declared types require a validation gate — direct
   * String assignment (or unsafe let) is rejected with FUNGI-TYPE-003.
   */
  private readonly brandedTypes = new Set<string>();

  /**
   * RD-0353: hallmark open types — `hallmark X of T { gate: flow f, ops { … } }`.
   * name → { carrier, gate-flow, declared ops }. A hallmark is ALSO registered in
   * brandedTypes (construction-only → FUNGI-TYPE-003) and userDefinedTypes
   * (declare-or-reject → FUNGI-TYPE-001); this map adds the schema so the closed
   * ops vocabulary and cross-type non-unification can be enforced.
   */
  private readonly hallmarkSchemas = new Map<string, { carrier: string; gate: string; ops: Set<string> }>();

  // ── Phase 11A.2: binding kind tracking (let / mut / readonly) ────────────
  /** Per-scope map from binding name → declaration kind (for reassignment checks). */
  private readonly bindingKindScopes: Array<Map<string, "let" | "mut" | "readonly">> = [];

  // ── Phase 8A: type inference state ───────────────────────────────────────
  /** Maps binding name → inferred base type string (per scope). */
  private readonly typeScopes: Array<Map<string, string>> = [];
  /** Flow return type registry, built during collectDeclarations. */
  private readonly flowReturnTypes = new Map<string, string>();
  /** Flow parameter type list, built during collectDeclarations. */
  private readonly flowParamTypes = new Map<string, readonly string[]>();
  // Flow names already declared in THIS module. A second occurrence is a duplicate flow declaration:
  // it silently overwrites the signature registry above and collides only at WASM instantiate
  // ("Duplicate export name"). Tracked here so collectDeclarations can catch it at compile time.
  private readonly declaredFlowNames = new Set<string>();
  /** Flow declared effects registry, built during collectDeclarations. */
  private readonly flowDeclaredEffects = new Map<string, readonly string[]>();
  /** record NAME → (field name → declared field type, "" when unannotated).
   *  Built during collectDeclarations so a `#record` literal can be STRUCTURALLY
   *  checked against a declared record type instead of collapsing to the opaque
   *  'Record' (the check↔governed finding-(ii) divergence class). */
  private readonly recordFieldTypes = new Map<string, Map<string, string>>();
  /** Declared return type of the flow currently being walked. */
  private currentReturnType = "";
  /** Effects declared on the flow currently being walked (for TYPE-014). */
  private currentFlowEffects: readonly string[] = [];
  /** Name of the flow currently being walked (for TYPE-014 messages). */
  private currentFlowName = "";

  /** Structural record-literal adoption (shared by the return- and let-positions).
   *  When a `#record` literal meets a DECLARED record type: field-check it against the
   *  declaration. Full match → the literal IS that record type (returns true, no diagnostic).
   *  Mismatch → emits ONE precise diagnostic (missing/unknown/badly-typed fields) under the
   *  caller's code/name and returns true (handled). Not a record literal, or not a declared
   *  record → returns false (caller falls back to its generic diagnostic). */
  private tryRecordLiteralAdoption(
    declaredBase: string,
    expr: AstNode | undefined,
    location: AstNode["location"],
    diagCode: string,
    diagName: string,
    contextLabel: string,
  ): boolean {
    if (expr === undefined || expr.kind !== "callExpr" || expr.value !== "#record") return false;
    const declFields = this.recordFieldTypes.get(declaredBase);
    if (declFields === undefined) return false;
    const litFields = new Map<string, AstNode | undefined>();
    for (const f of expr.children ?? []) {
      if (f.kind === "identifier" && f.value) litFields.set(f.value, f.children?.[0]);
    }
    const missing = [...declFields.keys()].filter((k) => !litFields.has(k));
    const unknown = [...litFields.keys()].filter((k) => !declFields.has(k));
    const badTypes: string[] = [];
    for (const [fname, fval] of litFields) {
      const declType = declFields.get(fname);
      if (declType === undefined || declType === "" || fval === undefined) continue;
      const fInferred = this.inferType(fval);
      const fDeclBase = declType.split("<")[0]?.trim() ?? declType;
      if (fInferred !== undefined && fInferred !== "Record" &&
          !isAssignmentCompatible(fDeclBase, fInferred)) {
        badTypes.push(`${fname}: declared '${declType}', got '${fInferred}'`);
      }
    }
    if (missing.length > 0 || unknown.length > 0 || badTypes.length > 0) {
      const detail = [
        missing.length ? `missing field(s): ${missing.join(", ")}` : "",
        unknown.length ? `unknown field(s): ${unknown.join(", ")}` : "",
        ...badTypes,
      ].filter(Boolean).join("; ");
      this.diagnostics.push(makeTCDiag(
        diagCode,
        diagName,
        `Record literal does not match ${contextLabel}: ${detail}.`,
        location,
        `Make the literal's fields match the 'record ${declaredBase}' declaration exactly.`,
      ));
    }
    return true; // handled: adopted silently, or the precise diagnostic above
  }

  check(ast: AstNode): void {
    // Pass 1: Collect all user-defined type, enum, and flow signature names
    this.collectDeclarations(ast);
    // Pass 1b — #107 (extended): two TOP-LEVEL type-level declarations (type/record/enum/hallmark) with
    // the same name silently overwrite each other in the type registry (the 2nd wins — a silent
    // mis-compile). Flag the duplicate. TOP-LEVEL ONLY (ast.children): a flow-LOCAL type that shadows a
    // module type is a different scope (legitimate shadowing, e.g. examples/contracts.fungi), so it is
    // NOT flagged — verified the local decl is nested in the flow node, not a root child.
    this.checkDuplicateTopLevelTypes(ast);
    // Pass 2: Validate all type references and infer/check types
    this.pushBindingScope();
    this.pushTypeScope();
    this.walkNode(ast);
    this.popTypeScope();
    this.popBindingScope();
  }

  // #107 (extended): flag a duplicate TOP-LEVEL type-level declaration. type/record/enum/hallmark share
  // one module type namespace; a 2nd declaration of a name silently overrides the 1st in the registry.
  // Iterates ast.children so it sees ONLY module-level decls (a flow-local type shadow is nested and
  // therefore excluded). Reuses FUNGI-NAME-002 (DUPLICATE_NAME) — the same fault as a duplicate binding.
  private checkDuplicateTopLevelTypes(ast: AstNode): void {
    const TYPE_DECL_KINDS = new Set(["typeDecl", "recordDecl", "enumDecl", "hallmarkDecl"]);
    const seen = new Set<string>();
    for (const child of ast.children ?? []) {
      if (!TYPE_DECL_KINDS.has(child.kind)) continue;
      const nm = (child.value ?? "").trim();
      if (nm === "") continue;
      if (seen.has(nm)) {
        this.diagnostics.push({
          code: "FUNGI-NAME-002",
          name: "DUPLICATE_NAME",
          severity: "error",
          message: `Type '${nm}' is already declared in this module.`,
          ...(child.location !== undefined ? { location: child.location } : {}),
          suggestedFix: `Rename this declaration — a type named '${nm}' was already declared at module level; the second definition silently overrides the first.`,
        });
      } else {
        seen.add(nm);
      }
    }
  }

  getResult(): TypeCheckResult {
    return { diagnostics: [...this.diagnostics] };
  }

  // ── Declaration collection ────────────────────────────────────────────────

  private collectDeclarations(node: AstNode): void {
    if ((node.kind === "typeDecl" || node.kind === "recordDecl" || node.kind === "enumDecl") && node.value) {
      this.userDefinedTypes.add(node.value.trim());
    }

    // Harvest record FIELDS (not just the name) so record literals can be structurally
    // checked. Parser shape: recordDecl children are paramDecl nodes valued "name: Type"
    // (or bare "name" when unannotated — stored as type "").
    if (node.kind === "recordDecl" && node.value) {
      const fields = new Map<string, string>();
      for (const child of node.children ?? []) {
        if (child.kind !== "paramDecl" || !child.value) continue;
        const colon = child.value.indexOf(":");
        const fname = (colon >= 0 ? child.value.slice(0, colon) : child.value).trim();
        const ftype = colon >= 0 ? child.value.slice(colon + 1).trim() : "";
        // #107 (extended): a duplicate field name silently overwrites the first in the record shape.
        // The first definition is authoritative; flag the second (FUNGI-NAME-002).
        if (fname !== "" && fields.has(fname)) {
          this.diagnostics.push({
            code: "FUNGI-NAME-002",
            name: "DUPLICATE_NAME",
            severity: "error",
            message: `Field '${fname}' is already declared in record '${node.value.trim()}'.`,
            ...(child.location !== undefined ? { location: child.location } : {}),
            suggestedFix: `Rename this field — '${fname}' appears more than once in the record.`,
          });
        } else if (fname !== "") {
          fields.set(fname, ftype);
        }
      }
      this.recordFieldTypes.set(node.value.trim(), fields);
    }

    // Phase 9A-2: detect Brand<T, "Name"> aliases → register as branded type
    // These types require a validation gate before assignment (FUNGI-TYPE-003).
    if (node.kind === "typeDecl" && node.value) {
      const aliasChild = node.children?.[0];
      if (aliasChild?.kind === "typeRef") {
        const parsed = parseTypeString(aliasChild.value ?? "");
        if (parsed.base === "Brand") {
          this.brandedTypes.add(node.value.trim());
        }
      }
    }

    // RD-0353: hallmark X of T { … } — a declared, gated nominal type. Register it
    // as a user type (declare-or-reject) AND a branded type (construction only
    // through its gate → FUNGI-TYPE-003), and capture its schema for op checks. The
    // mint-time gates (reserved name, ASCII, gate-mandatory, closed ops) fire in
    // walkNode → checkHallmarkDecl.
    if (node.kind === "hallmarkDecl" && node.value) {
      const hmName = node.value.trim();
      this.userDefinedTypes.add(hmName);
      this.brandedTypes.add(hmName);
      let carrier = "";
      let gate = "";
      const ops = new Set<string>();
      for (const c of node.children ?? []) {
        if (c.kind === "typeRef") carrier = (c.value ?? "").trim();
        else if (c.kind === "identifier" && c.value?.startsWith("gate:")) {
          gate = c.value.slice("gate:".length).trim();
        } else if (c.kind === "identifier" && c.value?.startsWith("ops:")) {
          for (const o of c.value.slice("ops:".length).split(",")) {
            const t = o.trim();
            if (t !== "") ops.add(t);
          }
        }
      }
      this.hallmarkSchemas.set(hmName, { carrier, gate, ops });
    }
    if (node.kind === "enumDecl" && node.value) {
      const variants = new Set<string>();
      for (const child of node.children ?? []) {
        if ((child.kind === "identifier" || child.kind === "enumVariant") && child.value) {
          const vname = child.value.trim();
          // #107 (extended): a duplicate enum variant is ambiguous. Flag the second (FUNGI-NAME-002).
          if (vname !== "" && variants.has(vname)) {
            this.diagnostics.push({
              code: "FUNGI-NAME-002",
              name: "DUPLICATE_NAME",
              severity: "error",
              message: `Variant '${vname}' is already declared in enum '${node.value.trim()}'.`,
              ...(child.location !== undefined ? { location: child.location } : {}),
              suggestedFix: `Rename this variant — '${vname}' appears more than once in the enum.`,
            });
          } else if (vname !== "") {
            variants.add(vname);
          }
        }
      }
      if (variants.size > 0) {
        this.enumVariants.set(node.value.trim(), variants);
      }
    }

    // Phase 8A: Build flow signature registry for call argument checking
    const FLOW_DECL_KINDS = new Set([
      "flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl",
    ]);
    if (FLOW_DECL_KINDS.has(node.kind) && node.value) {
      // FUNGI-NAME-002: two flows with the same name in one module silently overwrite each other in the
      // signature registry below and collide only at WASM instantiate ("Duplicate export name"). Catch
      // it at COMPILE time — the 2nd+ declaration of a name is the duplicate (the first is authoritative).
      if (this.declaredFlowNames.has(node.value)) {
        this.diagnostics.push({
          code: "FUNGI-NAME-002",
          name: "DUPLICATE_NAME",
          severity: "error",
          message: `Flow '${node.value}' is already declared in this module.`,
          ...(node.location !== undefined ? { location: node.location } : {}),
          suggestedFix: `Rename this flow — a flow named '${node.value}' was already declared. Duplicate flow names collide at WASM export.`,
        });
      } else {
        this.declaredFlowNames.add(node.value);
      }
      const children = node.children ?? [];
      // Extract return type from the first typeRef child (the return type annotation)
      const retTypeNode = children.find((c) => c.kind === "typeRef");
      if (retTypeNode?.value) {
        this.flowReturnTypes.set(node.value, parseTypeString(retTypeNode.value).base);
      }
      // Extract parameter types
      const paramTypes = children
        .filter((c) => c.kind === "paramDecl")
        .map((c) => {
          const typeRef = c.children?.find((t) => t.kind === "typeRef"); // perf-allow: loop-array-find — bounded N over a paramDecl's children (typeRef lookup)
          return typeRef?.value ? parseTypeString(typeRef.value).base : "";
        });
      this.flowParamTypes.set(node.value, paramTypes);

      // Extract declared effects for FUNGI-TYPE-014.
      // Effects appear in two possible AST shapes:
      //
      //   1. Direct effectsDecl child (legacy `with effects [...]`, now removed):
      //      { kind: "effectsDecl", children: [{ kind: "effectRef", value: "database.write" }] }
      //
      //   2. Inside contractDecl as "effects:block" identifier (canonical `contract { effects {} }`):
      //      { kind: "contractDecl", children: [
      //          { kind: "identifier", value: "effects:block",
      //            children: [{ kind: "identifier", value: "effect:database.write" }] }
      //      ]}
      //
      // The type-checker must handle both to support FUNGI-TYPE-014 with canonical syntax.

      // Path 1: direct effectsDecl (legacy)
      let effectNames: string[] = [];
      const effectsDeclNode = children.find((c) => c.kind === "effectsDecl");
      if (effectsDeclNode !== undefined) {
        effectNames = (effectsDeclNode.children ?? [])
          .filter((c) => c.kind === "effectRef" && c.value)
          .map((c) => c.value!.trim());
      } else {
        // Path 2: effects:block inside contractDecl (canonical form)
        const contractDecl = children.find((c) => c.kind === "contractDecl");
        if (contractDecl !== undefined) {
          const effectsBlock = (contractDecl.children ?? []).find(
            (c) => c.kind === "identifier" && (c.value === "effects:block" || c.value === "effects:")
          );
          if (effectsBlock !== undefined) {
            effectNames = (effectsBlock.children ?? [])
              .filter((c) => c.value?.startsWith("effect:") || c.value?.startsWith("effectRef:"))
              .map((c) => (c.value ?? "").replace(/^effect:|^effectRef:/, "").trim());
            // Also accept plain identifier children (dotted effect names)
            if (effectNames.length === 0) {
              effectNames = (effectsBlock.children ?? [])
                .filter((c) => c.kind === "identifier" && c.value && !c.value.includes(":"))
                .map((c) => c.value!.trim());
            }
          }
        }
      }
      this.flowDeclaredEffects.set(node.value, effectNames);
    }

    for (const child of node.children ?? []) {
      this.collectDeclarations(child);
    }
  }

  private pushBindingScope(): void {
    this.bindingScopes.push(new Set());
    this.bindingKindScopes.push(new Map());
  }

  private popBindingScope(): void {
    this.bindingScopes.pop();
    this.bindingKindScopes.pop();
  }

  private lookupBinding(name: string): boolean {
    for (let i = this.bindingScopes.length - 2; i >= 0; i--) {
      if (this.bindingScopes[i]!.has(name)) return true;
    }
    return false;
  }

  private lookupBindingInCurrentScope(name: string): boolean {
    return this.bindingScopes[this.bindingScopes.length - 1]?.has(name) ?? false;
  }

  private registerBinding(name: string): void {
    const scope = this.bindingScopes[this.bindingScopes.length - 1];
    if (scope !== undefined && name !== "") scope.add(name);
  }

  // ── Phase 11A.2: binding kind registration + lookup ──────────────────────

  private registerBindingKind(name: string, kind: "let" | "mut" | "readonly"): void {
    const scope = this.bindingKindScopes[this.bindingKindScopes.length - 1];
    if (scope !== undefined && name !== "") scope.set(name, kind);
  }

  /** Walk all scopes innermost-first; returns undefined if not found. */
  private lookupBindingKind(name: string): "let" | "mut" | "readonly" | undefined {
    for (let i = this.bindingKindScopes.length - 1; i >= 0; i--) {
      const kind = this.bindingKindScopes[i]!.get(name);
      if (kind !== undefined) return kind;
    }
    return undefined;
  }

  // ── Phase 8A: type scope management ──────────────────────────────────────

  private pushTypeScope(): void {
    this.typeScopes.push(new Map());
  }

  private popTypeScope(): void {
    this.typeScopes.pop();
  }

  private registerBindingType(name: string, type: string): void {
    const scope = this.typeScopes[this.typeScopes.length - 1];
    if (scope !== undefined && name !== "" && type !== "") scope.set(name, type);
  }

  private lookupBindingType(name: string): string | undefined {
    for (let i = this.typeScopes.length - 1; i >= 0; i--) {
      const t = this.typeScopes[i]!.get(name);
      if (t !== undefined) return t;
    }
    return undefined;
  }

  /**
   * Infers the base type of an expression node.
   * Phase 8A: covers literals, bound identifiers, and simple binary expressions.
   * Returns undefined when type cannot be determined without full inference.
   */
  private inferType(node: AstNode): string | undefined {
    switch (node.kind) {
      case "numberLiteral": {
        const v = node.value ?? "";
        if (v.startsWith("0x") || v.startsWith("0b") || v.startsWith("0o")) return "Byte";
        if (v.includes(".")) return "Float";
        return "Int";
      }
      case "stringLiteral": return "String";
      case "charLiteral":   return "Char";
      case "boolLiteral":   return "Bool";

      case "identifier": {
        const name = node.value ?? "";
        if (name === "None")           return "Option";
        if (name === "true" || name === "false") return "Bool";
        if (name === "null" || name === "undefined") return "Null"; // caught separately
        // Return the full stored type (may include generic args: "Money<GBP>")
        return this.lookupBindingType(name);
      }

      case "memberExpr": {
        // R5B: member.field — infer base type from the receiver, then the field type.
        // If receiver type is "unknown" or not in scope → return undefined (don't crash).
        const receiverNode = node.children?.[0];
        if (receiverNode === undefined) return undefined;

        // W5a K3: the Verdict member-constants — Verdict.Deny / Verdict.Unknown /
        // Verdict.Allow — are the language's verdict PRODUCERS (until check/prefilter
        // land in W5b). Checked on the RAW receiver identifier, before type inference.
        if (receiverNode.kind === "identifier" && receiverNode.value === "Verdict") {
          const member = node.value ?? "";
          if (member === "Deny" || member === "Unknown" || member === "Allow") return "Verdict";
          return undefined; // Verdict.<anything-else> — left to FUNGI-K3 checks
        }

        const receiverType = this.inferType(receiverNode);
        const field = node.value ?? "";

        // Graceful fallback: undefined receiver type or explicit "unknown" → unknown field
        if (receiverType === undefined || receiverType === "unknown" || receiverType === "") return undefined;

        // An Auto-typed receiver is DEFERRED, not String-ish: guessing here is what mis-typed
        // `entry.body` (GIR statement Array) as String via the field-name heuristics below and
        // mis-fired TYPE-002/005 on the self-hosted corpus (finding ii). Unknown means unknown.
        const receiverBase = receiverType.split("<")[0]?.trim() ?? receiverType;
        if (receiverBase === "Auto") return undefined;

        // REAL record schema lookup (the "Phase 11B" this comment block promised): a receiver
        // whose type is a DECLARED record answers field accesses from its declaration — the
        // declared field type, or undefined for a field the record does not declare. Takes
        // precedence over every name-based heuristic below.
        const schema = this.recordFieldTypes.get(receiverBase);
        if (schema !== undefined) {
          const declared = schema.get(node.value ?? "");
          return declared === undefined || declared === "" ? undefined : declared;
        }

        // Request object fields — any field access on Request → String
        // This is the common case: request.body.email, request.params.id, etc.
        if (receiverType === "Request") return "String";

        // Protected/redacted wrapper: protected Email → access returns String
        if (receiverType.startsWith("protected ") || receiverType.startsWith("redacted ")) {
          return "String";
        }

        // Record field access: if the receiver is a known record type,
        // try to look up the field type from the record schema
        // For now: return String as a conservative approximation for field access
        // More accurate inference comes in Phase 11B with full type propagation
        if (field !== "" && receiverType !== "") {
          // Common HTTP/API fields
          if (field === "body" || field === "params" || field === "query" || field === "headers") {
            return "String";
          }
          if (field === "id" || field === "name" || field === "email" || field === "status" || field === "message") {
            return "String";
          }
          // Numeric fields
          if (field === "length" || field === "count" || field === "size") return "Int";
          if (field === "amount" || field === "score" || field === "value") return "Decimal";
          // Boolean fields
          if (field === "ok" || field === "success" || field === "active" || field === "enabled") return "Bool";
        }

        // R5B: For any other field access (unknown record types, etc.),
        // return undefined gracefully — do not crash, let later passes handle it.
        // Phase 11B will add full record schema lookup.
        return undefined;
      }

      case "listLiteral": {
        const firstElement = node.children?.[0];
        if (firstElement !== undefined) {
          const elemType = this.inferType(firstElement);
          if (elemType !== undefined) return `Array<${elemType}>`;
        }
        return "Array";
      }

      case "callExpr": {
        const method = node.value ?? "";
        // Algebraic constructors
        if (method === "Ok" || method === "Err") return "Result";
        if (method === "Some")                   return "Option";
        if (method === "Decimal")                return "Decimal";
        // Money constructors (receiver = Money)
        if (method === "gbp" || method === "usd" || method === "eur" || method === "jpy") return "Money";
        // Record literal { field: value }
        if (method === "#record") return "Record";

        // Use flowReturnTypes only for plain calls (not method calls).
        // A method call (receiver.method) may share a name with a user-defined flow,
        // but its return type is determined by the library, not the flow declaration.
        const isMethod = (node as AstNode & { callStyle?: string }).callStyle === "method";
        if (!isMethod) {
          const knownReturn = this.flowReturnTypes.get(method);
          if (knownReturn !== undefined) return knownReturn;
        }

        // Stdlib return type inference
        const receiverNode = node.children?.[0];
        const receiverType = receiverNode !== undefined ? this.inferType(receiverNode) : undefined;

        // Decimal partial-operator method forms (#53/#54): a.divide(b, scale, mode) / a.remainder(b) → Decimal.
        if (receiverType === "Decimal" && (method === "divide" || method === "remainder")) return "Decimal";

        // R5C: Validation gates — validate.<field>(raw) → "protected <Field>"
        // e.g. validate.email(raw) → "protected Email"
        //      validate.userId(raw) → "protected UserId"
        if (method.startsWith("validate.")) {
          const gateName = method.slice("validate.".length);
          if (gateName !== "") {
            const fieldType = gateName.charAt(0).toUpperCase() + gateName.slice(1);
            return `protected ${fieldType}`;
          }
          return "protected String";
        }
        if (method === "email" && receiverType === undefined) return "protected Email";

        // R5C: json.decode<T>() → "Result<T, DecodeError>"
        // The generic type arg is carried in node.typeArgs when present;
        // fall back to "Result<unknown, DecodeError>" when not inferrable.
        if (method === "decode" && receiverType === "Json") {
          const typeArg = (node as AstNode & { typeArgs?: readonly string[] }).typeArgs?.[0];
          if (typeArg !== undefined && typeArg !== "") return `Result<${typeArg}, DecodeError>`;
          return "Result<unknown, DecodeError>";
        }

        // protect/redact helpers
        if (method === "redact") return `redacted ${receiverType ?? ""}`.trim();
        if (method === "protect") return `protected ${receiverType ?? ""}`.trim();

        // String methods → String
        if (receiverType === "String") {
          if (["toLower", "toUpper", "trim", "trimStart", "trimEnd", "replace", "replaceAll", "slice"].includes(method)) {
            return "String";
          }
          if (["length", "charCount", "indexOf", "lastIndexOf"].includes(method)) return "Int";
          if (["startsWith", "endsWith", "contains", "isEmpty"].includes(method)) return "Bool";
        }

        // Array/list methods
        if (receiverType?.startsWith("Array") || receiverType === "Array") {
          if (method === "length" || method === "count") return "Int";
          if (method === "isEmpty") return "Bool";
        }

        // Map methods
        if (receiverType?.startsWith("Map<") || receiverType === "Map") {
          if (method === "size") return "Int";
          if (method === "has") return "Bool";
          if (method === "isEmpty") return "Bool";
          if (method === "get") {
            // Map<K,V>.get() → Option<V>
            const match = receiverType?.match(/^Map<[^,]+,\s*([^>]+)>/);
            if (match?.[1] !== undefined) return `Option<${match[1].trim()}>`;
            return "Option";
          }
        }

        // Timestamp/Duration methods
        if (method === "toMs" || method === "toSeconds" || method === "toMinutes") return "Int";
        if (method === "toIso" || method === "toString" || method === "format") return "String";
        if (method === "add" || method === "subtract") {
          if (receiverType?.includes("Timestamp")) return "Timestamp";
          if (receiverType?.includes("Duration")) return "Duration";
        }
        if (method === "before" || method === "after" || method === "equals") return "Bool";

        // Option methods
        if (receiverType === "Option" || receiverType?.startsWith("Option<")) {
          if (method === "isSome" || method === "isNone") return "Bool";
          if (method === "unwrapOr") return undefined; // returns T
          if (method === "map") return "Option"; // returns Option<mapped>
        }

        // Result methods
        if (receiverType === "Result" || receiverType?.startsWith("Result<")) {
          if (method === "isOk" || method === "isErr") return "Bool";
          if (method === "map" || method === "mapErr") return "Result";
        }

        // Numeric methods
        if (["toFixed", "toString"].includes(method)) return "String";
        if (["floor", "ceil", "round", "abs"].includes(method)) {
          return receiverType === "Float" ? "Float" : "Int";
        }
        if (["clamp", "min", "max"].includes(method)) return receiverType ?? "Int";
        if (method === "toInt") return "Result";
        if (method === "toFloat") return "Result";

        // Bytes methods
        if (receiverType === "Bytes") {
          if (method === "length" || method === "size") return "Int";
          if (method === "isEmpty") return "Bool";
          if (method === "toHex" || method === "toBase64" || method === "sha256Hex") return "String";
          if (method === "sha256") return "Bytes";
          if (method === "decode" || method === "toString") return "Result";
        }

        return undefined;
      }

      case "errorPropagation": {
        const inner = node.children?.[0];
        if (inner === undefined) return undefined;
        const innerType = this.inferType(inner);
        // ? on Result<T, E> → infers T (the Ok branch)
        if (innerType === "Result" || innerType?.startsWith("Result<")) {
          const match = innerType?.match(/^Result<([^,>]+)/);
          return match?.[1]?.trim() ?? undefined;
        }
        // ? on Option<T> → infers T
        if (innerType === "Option" || innerType?.startsWith("Option<")) {
          const match = innerType?.match(/^Option<([^>]+)/);
          return match?.[1]?.trim() ?? undefined;
        }
        return innerType;
      }

      case "binaryExpr": {
        const op = node.value ?? "";
        const left  = node.children?.[0];
        const right = node.children?.[1];
        if (!left || !right) return undefined;
        const leftType  = this.inferType(left);
        const rightType = this.inferType(right);
        if (!leftType || !rightType) return undefined;
        // String concatenation
        if (op === "+" && leftType === "String" && rightType === "String") return "String";
        // W5a K3: && / || (and the `and`/`or` spellings that desugar to them) are
        // OVERLOADED ON TYPE — Verdict×Verdict ⇒ K3 min/max ⇒ Verdict. Mixed
        // Verdict/Bool is a compile error (A9, enforced in checkBinaryOperatorTypes);
        // inference still reports Verdict so downstream sees the governed type.
        if ((op === "&&" || op === "||") && (leftType === "Verdict" || rightType === "Verdict")) {
          return "Verdict";
        }
        // Comparison and logical → Bool
        if (["==","!=","<","<=",">",">=","&&","||"].includes(op)) return "Bool";
        // RD-0353: hallmark algebra composes to the hallmark type. H (+|-) H → H;
        // H (*|/) scalar → H (scale); H / H → the carrier (ratio, dimensionless).
        // Operator LEGALITY is enforced in checkBinaryOperatorTypes; here we only
        // propagate the resulting type so a bound `let total = base + bonus` keeps
        // its hallmark identity. No-op for all non-hallmark programs.
        {
          const lB = leftType.split("<")[0] ?? leftType;
          const rB = rightType.split("<")[0] ?? rightType;
          const lHm = this.hallmarkSchemas.get(lB);
          const rHm = this.hallmarkSchemas.get(rB);
          if (lHm !== undefined && rHm !== undefined && lB === rB) {
            if (op === "/") return lHm.carrier !== "" ? lHm.carrier : undefined; // ratio → carrier
            return lB;                                                            // add/subtract → same hallmark
          }
          if (lHm !== undefined && rHm === undefined && NUMERIC_TYPES.has(rB)) return lB; // H * scalar → H
          if (rHm !== undefined && lHm === undefined && NUMERIC_TYPES.has(lB)) return rB; // scalar * H → H
        }
        // Numeric arithmetic → numeric result
        if (NUMERIC_TYPES.has(leftType) && NUMERIC_TYPES.has(rightType)) {
          if (leftType === "Decimal" || rightType === "Decimal") return "Decimal";
          if (leftType === "Float"   || rightType === "Float")   return "Float";
          // i64 Step 2a: Int64 is contagious — a mixed Int+Int64 expression is Int64, matching the
          // interpreter's int64-dispatch promotion (BigInt(int)) and the emitter's i64 routing (which
          // sign-extends the i32 operand). Behaviour-neutral for non-Int64 programs (needs an Int64 operand,
          // which FUNGI-NUMERIC-001 still gates). Keeps all three tiers agreeing on a mixed expression's type.
          if (leftType === "Int64" || rightType === "Int64") return "Int64";
          return leftType;
        }
        return undefined;
      }

      case "unaryExpr": {
        const op = node.value ?? "";
        if (op === "flip") return "Verdict"; // W5a K3 negation — Verdict-only (A9 checked in the walker)
        if (op === "!")  return "Bool";
        const operand = node.children?.[0];
        return operand ? this.inferType(operand) : undefined;
      }

      case "k3FoldExpr": {
        // W5a: all{…} (min-fold) / any{…} (max-fold) — always Verdict-typed.
        return "Verdict";
      }

      case "matchExpr": {
        // Task 3: infer match expression type from arm bodies.
        // Arms are children after the scrutinee (index 0).
        // Each matchArm's body is its last child.
        const arms = (node.children ?? []).slice(1);
        if (arms.length === 0) return undefined;
        const armTypes: string[] = [];
        for (const arm of arms) {
          // The body expression of an arm is typically its last child
          const body = arm.children?.[arm.children.length - 1];
          if (body === undefined) return undefined;
          const bodyType = this.inferType(body);
          if (bodyType === undefined) return undefined;
          armTypes.push(bodyType);
        }
        // If all arms agree on one type, return it; otherwise undefined
        if (armTypes.length === 0) return undefined;
        const firstType = armTypes[0]!;
        const allSame = armTypes.every((t) => t === firstType);
        return allSame ? firstType : undefined;
      }

      default:
        return undefined;
    }
  }

  // ── AST walker ────────────────────────────────────────────────────────────

  private walkNode(node: AstNode): void {
    // RD-0277 §4: a decimal integer literal outside i32 wraps SILENTLY in WASM
    // lowering — surface it here (warning; the runtime trap is the hard backstop).
    if (node.kind === "numberLiteral") this.checkIntLiteralRange(node);
    // W5b T2.2: check(subject){…} dispatches on the K3 lattice — the subject MUST
    // be a Verdict (a Bool/Int coerced into a verdict branch is the A9 fail-open).
    if (node.kind === "checkExpr") this.checkCheckSubject(node);
    // W5b T2.4: prefilter(subject){…} is also verdict-only (same A9 rationale).
    if (node.kind === "prefilterExpr") this.checkPrefilterSubject(node);
    switch (node.kind) {
      case "flowDecl":
      case "secureFlowDecl":
      case "pureFlowDecl":
      case "guardedFlowDecl": {
        // Save + set the current flow's return type for return statement checking
        const prevReturnType = this.currentReturnType;
        const prevFlowEffects = this.currentFlowEffects;
        const prevFlowName = this.currentFlowName;
        const flowName = node.value ?? "";
        this.currentReturnType = this.flowReturnTypes.get(flowName) ?? "";
        this.currentFlowEffects = this.flowDeclaredEffects.get(flowName) ?? [];
        this.currentFlowName = flowName;
        this.pushBindingScope();
        this.pushTypeScope();
        // Register params first so they're in scope throughout the body
        const seenParams = new Set<string>();
        for (const child of node.children ?? []) {
          if (child.kind === "paramDecl") {
            const paramName = parseParamName(child.value ?? "");
            // #107 (extended): a duplicate parameter name is ambiguous — the 2nd binding silently
            // shadows the 1st in the flow scope. Flag it (FUNGI-NAME-002); the first is authoritative.
            if (paramName !== "" && seenParams.has(paramName)) {
              this.diagnostics.push({
                code: "FUNGI-NAME-002",
                name: "DUPLICATE_NAME",
                severity: "error",
                message: `Parameter '${paramName}' is already declared in this flow's parameter list.`,
                ...(child.location !== undefined ? { location: child.location } : {}),
                suggestedFix: `Rename this parameter — '${paramName}' appears more than once in the parameter list.`,
              });
            } else if (paramName !== "") {
              seenParams.add(paramName);
            }
            this.registerBinding(paramName);
            // Phase 11A.2: flow parameters are immutable (readonly) by default
            this.registerBindingKind(paramName, "readonly");
            // Register param type for inference.
            // Use the full type string (including generic args) so that Money<GBP>
            // parameters carry their currency parameter through to cross-currency checks.
            const typeRef = child.children?.find((c) => c.kind === "typeRef"); // perf-allow: loop-array-find — bounded N over a paramDecl's children (typeRef lookup)
            if (typeRef?.value) {
              const parsed = parseTypeString(typeRef.value);
              // Preserve generic args for Money (cross-currency checks) and other
              // parameterised types; fall back to base for simple types.
              const fullType = parsed.args.length > 0
                ? `${parsed.base}<${parsed.args.join(",")}>`
                : parsed.base;
              this.registerBindingType(paramName, fullType);
            }
            for (const typeChild of child.children ?? []) {
              if (typeChild.kind === "typeRef") {
                this.checkTypeRef(typeChild.value ?? "", typeChild.location);
              }
            }
          }
        }
        for (const child of node.children ?? []) {
          this.walkNode(child);
        }
        this.popTypeScope();
        this.popBindingScope();
        this.currentReturnType = prevReturnType;
        this.currentFlowEffects = prevFlowEffects;
        this.currentFlowName = prevFlowName;
        return;
      }

      case "fnDecl": {
        // fn gets its own scope for parameters; save return type
        const prevReturnTypeFn = this.currentReturnType;
        this.currentReturnType = "";
        this.pushBindingScope();
        this.pushTypeScope();
        for (const child of node.children ?? []) {
          if (child.kind === "paramDecl") {
            const paramName = parseParamName(child.value ?? "");
            this.registerBinding(paramName);
            // Phase 11A.2: fn parameters are also immutable (readonly)
            this.registerBindingKind(paramName, "readonly");
            const typeRef = child.children?.find((c) => c.kind === "typeRef"); // perf-allow: loop-array-find — bounded N over a paramDecl's children (typeRef lookup)
            if (typeRef?.value) {
              this.registerBindingType(paramName, parseTypeString(typeRef.value).base);
            }
            for (const typeChild of child.children ?? []) {
              if (typeChild.kind === "typeRef") {
                this.checkTypeRef(typeChild.value ?? "", typeChild.location);
              }
            }
          }
        }
        for (const child of node.children ?? []) {
          this.walkNode(child);
        }
        this.popTypeScope();
        this.popBindingScope();
        this.currentReturnType = prevReturnTypeFn;
        return;
      }

      // ── RD-0353: hallmark mint-time gates ────────────────────────────────
      case "hallmarkDecl":
        this.checkHallmarkDecl(node);
        return;

      case "block":
        this.pushBindingScope();
        this.pushTypeScope();
        for (const child of node.children ?? []) {
          this.walkNode(child);
        }
        this.popTypeScope();
        this.popBindingScope();
        return;

      // ── Phase 8A: return type checking ─────────────────────────────────────
      case "returnStmt": {
        const returnExpr = node.children?.[0];
        if (returnExpr !== undefined && this.currentReturnType !== "" && this.currentReturnType !== "Void") {
          const inferredType = this.inferType(returnExpr);
          if (inferredType !== undefined) {
            // Allow Ok/Err/Some/None for Result/Option return types
            const isOkErrReturn = returnExpr.kind === "callExpr" &&
              (returnExpr.value === "Ok" || returnExpr.value === "Err" || returnExpr.value === "Some");
            const declaredBase = this.currentReturnType.split("<")[0]?.trim() ?? this.currentReturnType;
            if (!isOkErrReturn && !isAssignmentCompatible(declaredBase, inferredType)) {
              // A `#record` LITERAL where a DECLARED record type is expected adopts that
              // record type STRUCTURALLY (fields checked against the declaration) instead of
              // collapsing to the opaque 'Record' — the corpus-wide `return { ty: "Int", … }
              // -> RtValue` idiom (finding-(ii) divergence class). Mismatches still error
              // with precise field detail: stronger than the string compare, never a mute.
              const adopted = this.tryRecordLiteralAdoption(
                declaredBase, returnExpr, node.location,
                "FUNGI-TYPE-008", "INVALID_RETURN_TYPE",
                `declared return type '${this.currentReturnType}'`,
              );
              if (!adopted) {
                this.diagnostics.push(makeTCDiag(
                  "FUNGI-TYPE-008",
                  "INVALID_RETURN_TYPE",
                  `Flow declares return type '${this.currentReturnType}' but this return expression has type '${inferredType}'.`,
                  node.location,
                  `Return a value of type '${this.currentReturnType}', or correct the flow return type declaration.`,
                ));
              }
            } else if (!isOkErrReturn && declaredBase === "Auto") {
              // Surface the deferral: isAssignmentCompatible() treats an `Auto`-declared
              // target as universally compatible, which silently mutes the return-type
              // check. Emit a visible advisory instead of nothing. Once an inference pass
              // resolves `Auto` to a concrete type, this site must re-check normally.
              this.diagnostics.push({
                code: "FUNGI-TYPE-026",
                name: "DEFERRED_TYPE_CHECK",
                severity: "warning",
                message: `Return type declared 'Auto'; the type check against this return expression ('${inferredType}') is deferred pending inference.`,
                ...(node.location !== undefined ? { location: node.location } : {}),
                suggestedFix: `Declare a concrete return type to enable full return-type checking.`,
              });
            }
          }
        }
        for (const child of node.children ?? []) this.walkNode(child);
        return;
      }

      // ── Phase 11A.2: assignment to existing binding (FUNGI-BINDING-005) ───────
      case "assignStmt": {
        const targetName = node.value ?? "";
        if (targetName !== "") {
          const kind = this.lookupBindingKind(targetName);
          if (kind === "let" || kind === "readonly") {
            this.diagnostics.push(makeTCDiag(
              "FUNGI-BINDING-005",
              "IMMUTABLE_BINDING_REASSIGNED",
              `Cannot reassign immutable binding '${targetName}'. Use 'mut' if reassignment is intended.`,
              node.location,
              `Change the declaration to: mut ${targetName}: ...`,
            ));
          }
        }
        for (const child of node.children ?? []) this.walkNode(child);
        return;
      }

      // ── Phase 8A: binary operator type checking ───────────────────────────
      case "binaryExpr": {
        const op = node.value ?? "";
        const leftNode  = node.children?.[0];
        const rightNode = node.children?.[1];
        if (leftNode !== undefined && rightNode !== undefined) {
          const leftType  = this.inferType(leftNode);
          const rightType = this.inferType(rightNode);
          if (leftType !== undefined && rightType !== undefined) {
            this.checkBinaryOperatorTypes(op, leftType, rightType, node.location);
          }
        }
        for (const child of node.children ?? []) this.walkNode(child);
        return;
      }

      // W5a K3 (A9): flip is Verdict-only, ! is Bool-only, fold operands all-Verdict.
      case "unaryExpr":
      case "k3FoldExpr": {
        this.checkK3UnaryAndFolds(node);
        for (const child of node.children ?? []) this.walkNode(child);
        return;
      }

      // ── Phase 8A: call argument count checking ────────────────────────────
      case "callExpr": {
        const flowName = node.value ?? "";
        // Skip arity/type checking for method calls (receiver.method(args)).
        // These are external library calls, not user-defined flow calls.
        if ((node as AstNode & { callStyle?: string }).callStyle === "method") {
          for (const child of node.children ?? []) this.walkNode(child);
          return;
        }
        const paramTypes = this.flowParamTypes.get(flowName);
        if (paramTypes !== undefined) {
          // Plain call: all children are arguments.
          const argNodes = node.children ?? [];

          // FUNGI-TYPE-007: wrong argument count
          if (argNodes.length !== paramTypes.length) {
            this.diagnostics.push(makeTCDiag(
              "FUNGI-TYPE-007",
              "INVALID_ARGUMENT_COUNT",
              `Flow '${flowName}' expects ${paramTypes.length} argument${paramTypes.length === 1 ? "" : "s"} but received ${argNodes.length}.`,
              node.location,
              `Provide exactly ${paramTypes.length} argument${paramTypes.length === 1 ? "" : "s"} to '${flowName}'.`,
            ));
          } else {
            // FUNGI-TYPE-005: argument type mismatch (for inferrable types only)
            for (let i = 0; i < argNodes.length; i++) {
              const argNode = argNodes[i];
              const expectedType = paramTypes[i];
              if (argNode === undefined || !expectedType) continue;
              const inferredArgType = this.inferType(argNode);
              if (inferredArgType !== undefined && !isAssignmentCompatible(expectedType, inferredArgType)) {
                this.diagnostics.push(makeTCDiag(
                  "FUNGI-TYPE-005",
                  "INVALID_CALL_ARG_TYPE",
                  `Argument ${i + 1} to '${flowName}' expects '${expectedType}' but received '${inferredArgType}'.`,
                  argNode.location,
                  `Pass a value of type '${expectedType}' as argument ${i + 1}.`,
                ));
              } else if (inferredArgType !== undefined && expectedType === "Auto") {
                // Surface the deferral (see FUNGI-TYPE-023 on returnStmt): an `Auto`-declared
                // parameter silently mutes the argument-type check via isAssignmentCompatible.
                this.diagnostics.push({
                  code: "FUNGI-TYPE-026",
                  name: "DEFERRED_TYPE_CHECK",
                  severity: "warning",
                  message: `Parameter ${i + 1} of '${flowName}' is declared 'Auto'; the type check against this argument ('${inferredArgType}') is deferred pending inference.`,
                  ...(argNode.location !== undefined ? { location: argNode.location } : {}),
                  suggestedFix: `Declare a concrete type for parameter ${i + 1} of '${flowName}' to enable full argument checking.`,
                });
              }
            }
          }

          // FUNGI-TYPE-014: MissingRequiredEffect
          // When the called flow declares effects that the current flow doesn't declare,
          // emit an error for each missing effect.
          const calledEffects = this.flowDeclaredEffects.get(flowName);
          if (calledEffects !== undefined && calledEffects.length > 0 && this.currentFlowName !== "") {
            const currentEffectSet = new Set(this.currentFlowEffects);
            for (const requiredEffect of calledEffects) {
              if (!currentEffectSet.has(requiredEffect)) {
                this.diagnostics.push(makeTCDiag(
                  "FUNGI-TYPE-014",
                  "MISSING_REQUIRED_EFFECT",
                  `Calling '${flowName}' requires effect '${requiredEffect}' but current flow '${this.currentFlowName}' does not declare it.`,
                  node.location,
                  `Add '${requiredEffect}' to the effects declaration of '${this.currentFlowName}'.`,
                  `effects [${[...this.currentFlowEffects, requiredEffect].join(", ")}]`,
                ));
              }
            }
          }
        }
        for (const child of node.children ?? []) this.walkNode(child);
        return;
      }

      case "identifier": {
        const val = node.value ?? "";
        if (val === "null" || val === "undefined") {
          this.diagnostics.push(makeTCDiag(
            "FUNGI-TYPE-025",
            "SILENT_NULL_DENIED",
            `'${val}' is not a valid Galerina value. Use Option<T> to represent absence.`,
            node.location,
            `Use None for absent values, or Option<T> as the type annotation.`,
            val === "null" ? "None" : undefined,
          ));
        }
        return;
      }

      case "matchExpr":
        this.checkMatchExhaustiveness(node);
        for (const child of node.children ?? []) {
          this.walkNode(child);
        }
        return;

      default:
        break;
    }

    if (node.kind === "typeRef") {
      this.checkTypeRef(node.value ?? "", node.location);
      // The type value is fully in .value; no children to walk
      return;
    }

    // Extract the type annotation embedded in letDecl / mutDecl / readonlyDecl value strings
    if (node.kind === "letDecl" || node.kind === "mutDecl" || node.kind === "readonlyDecl") {
      this.checkShadowedBinding(node);
      this.checkBindingTypeAnnotation(node);
      // Phase 8A: register binding type and check assignment compatibility
      this.checkAndRegisterBindingType(node);
      // Phase 11A.2: register binding kind for reassignment enforcement
      const bkName = parseBindingName(node.value ?? "");
      if (bkName !== "") {
        const declKind: "let" | "mut" | "readonly" =
          node.kind === "mutDecl" ? "mut"
          : node.kind === "readonlyDecl" ? "readonly"
          : "let";
        this.registerBindingKind(bkName, declKind);
      }
    }

    for (const child of node.children ?? []) {
      this.walkNode(child);
    }
  }

  private checkShadowedBinding(node: AstNode): void {
    const bindingName = parseBindingName(node.value ?? "");
    if (bindingName === "") return;

    if (this.lookupBindingInCurrentScope(bindingName)) {
      // ── FUNGI-NAME-002: Duplicate name in the SAME scope ─────────────────────
      this.diagnostics.push({
        code: "FUNGI-NAME-002",
        name: "DUPLICATE_NAME",
        severity: "error",
        message: `'${bindingName}' is already declared in this scope.`,
        ...(node.location !== undefined ? { location: node.location } : {}),
        suggestedFix: `Rename this binding — '${bindingName}' was already declared earlier in the same block.`,
      });
    } else if (this.lookupBinding(bindingName)) {
      // ── FUNGI-TYPE-020: Shadowing an OUTER scope binding ─────────────────────
      this.diagnostics.push({
        code: "FUNGI-TYPE-020",
        name: "SHADOWED_BINDING",
        severity: "warning",
        message: `Binding '${bindingName}' shadows an outer-scope binding with the same name.`,
        ...(node.location !== undefined ? { location: node.location } : {}),
        suggestedFix: `Rename this binding to avoid shadowing the outer '${bindingName}'.`,
      });
    }

    this.registerBinding(bindingName);
  }

  // ── Phase 8A: binding type registration + assignment checking ────────────

  private checkAndRegisterBindingType(node: AstNode): void {
    // Preserve the raw value before stripping prefixes (needed for unsafe-let detection below)
    const rawNodeValue = (node.value ?? "").trim();
    const isUnsafeLet = rawNodeValue.startsWith("unsafe ");

    let rest = rawNodeValue;
    if (rest.startsWith("unsafe ")) rest = rest.slice("unsafe ".length).trim();
    else if (rest.startsWith("safe "))   rest = rest.slice("safe ".length).trim();

    const colonIdx = rest.indexOf(":");
    const bindingName = (colonIdx === -1 ? rest : rest.slice(0, colonIdx)).trim();
    if (bindingName === "") return;

    // Extract the declared type annotation
    if (colonIdx !== -1) {
      const typeSection = rest.slice(colonIdx + 1).trim();
      const declaredBase = parseTypeString(typeSection).base;

      if (declaredBase !== "" && declaredBase !== "Auto") {
        // Register the binding with its declared type.
        // For generic types (Money<GBP>, Tensor<Float32,...>), preserve the full
        // type annotation so cross-generic comparisons (e.g. Money<GBP> vs Money<USD>)
        // can be detected. Strip governance qualifiers first.
        let registeredType = typeSection;
        for (const q of ["protected ", "redacted "]) {
          if (registeredType.startsWith(q)) { registeredType = registeredType.slice(q.length).trim(); break; }
        }
        this.registerBindingType(bindingName, registeredType !== "" ? registeredType : declaredBase);

        // Phase 8A: check assignment compatibility with init expression
        // Skip FUNGI-TYPE-002 when the declared type has a governance qualifier (protected/redacted)
        // — those bindings accept inferred protected/redacted types and the boundary checks
        // (FUNGI-VALUESTATE-006/007 in value-state-checker.ts) cover the reverse direction.
        // Also skip for view() MMCP types (view:cap1|cap2) — the governance verifier
        // validates capability-pointer access; type assignment is always the underlying type.
        const hasGovernanceQualifier = typeSection.startsWith("protected ") || typeSection.startsWith("redacted ");
        const isViewType = typeSection.startsWith("view:");
        const initNode = node.children?.[0];
        if (!hasGovernanceQualifier && !isViewType && initNode !== undefined) {
          const inferredType = this.inferType(initNode);
          if (inferredType !== undefined && !isAssignmentCompatible(declaredBase, inferredType)) {
            // `let x: SomeRecord = { … }` — same structural adoption as the return position
            // (finding ii): a matching literal IS the declared record; a mismatch gets the
            // precise field diagnostic from the helper instead of the generic one below.
            const adopted = this.tryRecordLiteralAdoption(
              declaredBase, initNode, node.location,
              "FUNGI-TYPE-002", "TYPE_MISMATCH",
              `declared type '${declaredBase}'`,
            );
            if (!adopted) {
              this.diagnostics.push(makeTCDiag(
                "FUNGI-TYPE-002",
                "TYPE_MISMATCH",
                `Cannot assign '${inferredType}' to '${declaredBase}'. The declared type and the value type are incompatible.`,
                node.location,
                `Change the value to a '${declaredBase}' expression, or update the type annotation.`,
                inferredType === "Int" && NUMERIC_TYPES.has(declaredBase)
                  ? undefined  // numeric widening — no code suggestion needed
                  : undefined,
              ));
            }
          }
        }

        // Phase 9A-2: FUNGI-TYPE-003 — branded type enforcement
        // A branded type (e.g. CustomerId = Brand<String, "CustomerId">) cannot be
        // assigned a raw String. The value must pass through a validation gate first.
        if (this.brandedTypes.has(declaredBase)) {
          // Case 1: `unsafe let x: BrandedType = ...` is always invalid.
          // The unsafe prefix means boundary-origin data — it bypasses the gate.
          let emitBrandedError = isUnsafeLet;
          // Case 2: inferred init type is String/SecureString — direct string literal
          // or an identifier known to be String is assigned without validation.
          if (!emitBrandedError && initNode !== undefined) {
            const inferredInitType = this.inferType(initNode);
            if (inferredInitType === "String" || inferredInitType === "SecureString") {
              emitBrandedError = true;
            }
          }
          if (emitBrandedError) {
            const gateName = `validate.${declaredBase.charAt(0).toLowerCase()}${declaredBase.slice(1)}`;
            this.diagnostics.push(makeTCDiag(
              "FUNGI-TYPE-003",
              "INVALID_NOMINAL_CONVERSION",
              `Cannot assign a raw String to branded type '${declaredBase}'. `
                + `Branded types require a validation gate (e.g. ${gateName}(raw)?).`,
              node.location,
              `Replace direct assignment with a validation gate call.`,
              `${gateName}(raw)?`,
            ));
          }
        }

        // Note: protected/redacted boundary violations are enforced in value-state-checker.ts
        // as FUNGI-VALUESTATE-006 (ProtectedBoundaryViolation) and
        // FUNGI-VALUESTATE-007 (RedactedBoundaryViolation).

        // FUNGI-TYPE-011: Array<T> element type mismatch
        if (declaredBase === "Array") {
          const parsed = parseTypeString(typeSection);
          const elementType = parsed.args[0];
          if (elementType && elementType !== "" && initNode !== undefined) {
            if (initNode.kind === "listLiteral") {
              for (const element of initNode.children ?? []) {
                const elemInferred = this.inferType(element);
                if (elemInferred !== undefined && elemInferred !== elementType &&
                    !isAssignmentCompatible(elementType, elemInferred)) {
                  this.diagnostics.push(makeTCDiag(
                    "FUNGI-TYPE-011",
                    "INVALID_COLLECTION_ELEMENT",
                    `Array<${elementType}> contains a '${elemInferred}' element. All elements must be '${elementType}'.`,
                    element.location,
                    `Change the element to a '${elementType}' value, or change the array type to Array<${elemInferred}>.`,
                  ));
                }
              }
            }
          }
        }

        // FUNGI-TYPE-016 / FUNGI-TYPE-030 / FUNGI-TYPE-017: Tensor type checking
        // When both declared and inferred types are Tensor<>, compare element types and
        // dimension counts using the tensor helpers from type-registry.
        if (declaredBase === "Tensor" && initNode !== undefined) {
          const inferredType = this.inferType(initNode);
          // inferredType may come from a binding (e.g. a parameter or let binding).
          // For Tensor checking we need the *full* declared type string vs. the inferred type.
          const inferredFull = inferredType ?? "";
          if (inferredFull.startsWith("Tensor<")) {
            const declaredTensor = parseTensorType(typeSection);
            const inferredTensor = parseTensorType(inferredFull);
            if (declaredTensor.valid && inferredTensor.valid) {
              // FUNGI-TYPE-030: element type mismatch
              if (!tensorElementTypesCompatible(declaredTensor.elementType, inferredTensor.elementType)) {
                this.diagnostics.push(makeTCDiag(
                  "FUNGI-TYPE-030",
                  "TENSOR_ELEMENT_TYPE_MISMATCH",
                  `Tensor element type mismatch: expected '${declaredTensor.elementType}' but got '${inferredTensor.elementType}'. Cannot assign Tensor<${inferredTensor.elementType}> to Tensor<${declaredTensor.elementType}>.`,
                  node.location,
                  `Use dequantize() to convert Int8 to Float32 before assignment, or quantize() for the reverse.`,
                ));

                // FUNGI-TYPE-017: QuantizedPrecisionMismatch — fires when mixing
                // quantized (Int8) and floating-point (Float32) tensors without dequantize().
                const isQuantizedMix =
                  (declaredTensor.elementType === "Float32" && inferredTensor.elementType === "Int8") ||
                  (declaredTensor.elementType === "Int8" && inferredTensor.elementType === "Float32");
                if (isQuantizedMix) {
                  this.diagnostics.push({
                    code: "FUNGI-TYPE-017",
                    name: "QUANTIZED_PRECISION_MISMATCH",
                    severity: "warning",
                    message: `Cannot mix quantized (Int8) and floating-point (Float32) tensors without explicit dequantize(). Declare the binding as Tensor<${inferredTensor.elementType}, [...]> or call dequantize() first.`,
                    ...(node.location !== undefined ? { location: node.location } : {}),
                    suggestedFix: `Call dequantize() to convert Int8 to Float32, or quantize() for Float32 to Int8.`,
                  });
                }
              }

              // FUNGI-TYPE-016: shape mismatch — rank differs, or fixed dimension values differ.
              // tensorDimensionCountsCompatible checks rank (number of dims).
              // Additionally, if rank matches, check fixed dimension values pairwise.
              const rankMismatch = !tensorDimensionCountsCompatible(declaredTensor.dimensions, inferredTensor.dimensions);
              let dimValueMismatch = false;
              if (!rankMismatch) {
                for (let i = 0; i < declaredTensor.dimensions.length; i++) {
                  const d = declaredTensor.dimensions[i];
                  const a = inferredTensor.dimensions[i];
                  if (typeof d === "number" && typeof a === "number" && d !== a) {
                    dimValueMismatch = true;
                    break;
                  }
                }
              }
              if (rankMismatch || dimValueMismatch) {
                this.diagnostics.push(makeTCDiag(
                  "FUNGI-TYPE-016",
                  "TENSOR_SHAPE_MISMATCH",
                  `Tensor shape mismatch: expected [${declaredTensor.dimensions.join(", ")}] but got [${inferredTensor.dimensions.join(", ")}].`,
                  node.location,
                  `Use Tensor.unsqueeze() to add a dimension, Tensor.squeeze() to remove one, or reshape to match [${declaredTensor.dimensions.join(", ")}].`,
                ));
              }
            }
          }
        }

      } else if (declaredBase === "Auto") {
        // Auto inference: register the inferred type
        const initNode = node.children?.[0];
        if (initNode !== undefined) {
          const inferredType = this.inferType(initNode);
          if (inferredType !== undefined) {
            this.registerBindingType(bindingName, inferredType);
          }
        }
      }
    } else {
      // No type annotation — try to infer from init expression
      const initNode = node.children?.[0];
      if (initNode !== undefined) {
        const inferredType = this.inferType(initNode);
        if (inferredType !== undefined) {
          this.registerBindingType(bindingName, inferredType);
        }
      }
    }
  }

  // ── RD-0353 — Hallmark open types (mint-time gates) ──────────────────────

  /** A hallmark may not mint a reserved name: a built-in type or currency/unit tag
   *  (both covered by BUILT_IN_TYPES) or the epistemic/security governance vocabulary. */
  private isReservedHallmarkName(name: string): boolean {
    return isBuiltInType(name) || EPISTEMIC_RESERVED.has(name);
  }

  private reservedHallmarkMessage(name: string): string {
    const CURRENCY = new Set(["GBP", "USD", "EUR", "JPY", "CHF", "CAD", "AUD"]);
    if (name === "Money") {
      return `'Money' is a reserved built-in type. For a currency amount use Money<GBP>; for a new quantity use a 'unit' declaration.`;
    }
    if (CURRENCY.has(name)) {
      return `'${name}' is a currency/unit tag, not a mintable name — did you want Money<${name}> or a 'unit' declaration?`;
    }
    if (EPISTEMIC_RESERVED.has(name)) {
      return `'${name}' is a reserved governance/epistemic term. Names carry no authority in Galerina, so it cannot be minted as a hallmark type.`;
    }
    return `'${name}' is a reserved built-in name and cannot be minted as a hallmark type.`;
  }

  private emitHallmarkOpDenied(
    typeName: string, algebraOp: string, operator: string,
    ops: ReadonlySet<string>, location: SourceLocation | undefined,
  ): void {
    const declared = ops.size > 0 ? [...ops].join(", ") : "(none)";
    this.diagnostics.push(makeTCDiag(
      "FUNGI-HALLMARK-005",
      "UNDECLARED_HALLMARK_OP",
      `Operator '${operator}' needs the '${algebraOp}' operation, which '${typeName}' does not declare (ops { ${declared} }). Undeclared operations are denied by default.`,
      location,
      `Add '${algebraOp}' to the '${typeName}' ops { } schema, or avoid '${operator}' on '${typeName}'.`,
    ));
  }

  /** Mint-time enforcement for a `hallmark X of T { … }` declaration: ASCII-only
   *  name (T2), reserved-name gate (T1/T9), mandatory gate, and the closed ops
   *  vocabulary (T3/T7). Construction-only and cross-type non-unification are
   *  enforced at use sites via brandedTypes/FUNGI-TYPE-003 and
   *  checkBinaryOperatorTypes/FUNGI-TYPE-004. */
  private checkHallmarkDecl(node: AstNode): void {
    const name = (node.value ?? "").trim();
    const loc = node.location;
    let carrier = "";
    let gate = "";
    let opsRaw: string | undefined;
    for (const c of node.children ?? []) {
      if (c.kind === "typeRef") carrier = (c.value ?? "").trim();
      else if (c.kind === "identifier" && c.value) {
        if (c.value.startsWith("gate:")) gate = c.value.slice("gate:".length).trim();
        else if (c.value.startsWith("ops:")) opsRaw = c.value.slice("ops:".length);
      }
    }
    const hasName = name !== "" && name !== "<unknown>";

    // T2 — ASCII-only identifier (homoglyph / mixed-script protection).
    if (hasName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      this.diagnostics.push(makeTCDiag(
        "FUNGI-HALLMARK-002",
        "NON_ASCII_HALLMARK_NAME",
        `Hallmark name '${name}' must be a plain ASCII identifier. Non-ASCII or mixed-script names are refused so a homoglyph cannot mint a look-alike of an existing type.`,
        loc,
        `Rename using ASCII letters, digits and underscore only.`,
      ));
    }

    // T1 / T9 — reserved-name gate.
    if (hasName && this.isReservedHallmarkName(name)) {
      this.diagnostics.push(makeTCDiag(
        "FUNGI-HALLMARK-001",
        "RESERVED_TYPE_NAME",
        this.reservedHallmarkMessage(name),
        loc,
        `Choose a name that is not a built-in type, currency/unit tag, or governance term.`,
      ));
    }

    // Gate mandatory — a hallmark without an assay is just an alias.
    if (gate === "") {
      const suffix = hasName ? name : "Name";
      this.diagnostics.push(makeTCDiag(
        "FUNGI-HALLMARK-003",
        "HALLMARK_GATE_REQUIRED",
        `Hallmark '${name}' has no gate. A hallmark is minted only through a mandatory assay: declare 'gate: flow <parseFn>' returning Result<${suffix}, Error>.`,
        loc,
        `Add a gate: gate: flow parse${suffix}`,
        `gate: flow parse${suffix}`,
      ));
    }

    // T3 / T7 — ops must be drawn from the closed algebra vocabulary (never effects).
    if (opsRaw !== undefined) {
      for (const raw of opsRaw.split(",")) {
        const opTok = raw.trim();
        if (opTok === "") continue;
        if (!HALLMARK_ALGEBRA_OPS.has(opTok)) {
          this.diagnostics.push(makeTCDiag(
            "FUNGI-HALLMARK-004",
            "UNKNOWN_HALLMARK_OP",
            `'${opTok}' is not a hallmark algebra operation. ops {} draws only from the closed set { ${[...HALLMARK_ALGEBRA_OPS].join(", ")} } — a schema can subtract capability, never grant an effect.`,
            loc,
            `Remove '${opTok}', or use one of: ${[...HALLMARK_ALGEBRA_OPS].join(", ")}.`,
          ));
        }
      }
    }

    // The carrier must resolve (a bogus carrier is FUNGI-TYPE-001).
    if (carrier !== "") this.checkTypeRef(carrier, loc);
  }

  /**
   * Phase 8A: check binary operator type compatibility.
   * Emits FUNGI-TYPE-004 for incompatible operand types.
   */
  private checkBinaryOperatorTypes(
    op: string,
    leftType: string,
    rightType: string,
    location: SourceLocation | undefined,
  ): void {
    // ── Phase 8B: Money<C> cross-currency enforcement ────────────────────────
    // Extract base type for Money checking (e.g. "Money" from "Money<GBP>")
    const leftBase  = leftType.split("<")[0]?.trim()  ?? leftType;
    const rightBase = rightType.split("<")[0]?.trim() ?? rightType;

    if (leftBase === "Money" && rightBase === "Money") {
      if (op === "+" || op === "-") {
        if (leftType !== rightType) {
          // Cross-currency addition/subtraction: Money<GBP> + Money<USD> → FUNGI-TYPE-004
          this.diagnostics.push(makeTCDiag(
            "FUNGI-TYPE-004",
            "INVALID_BINARY_OPERATION",
            `Cannot ${op === "+" ? "add" : "subtract"} '${leftType}' and '${rightType}'. Money arithmetic requires the same currency.`,
            location,
            `Use fx.convert() for explicit currency conversion before arithmetic.`,
            `fx.convert(amount, TargetCurrency)?`,
          ));
        }
        return; // same-currency is valid
      }
      if (op === "*") {
        // Money<C> * Money<C> is dimensionally invalid (produces Money²)
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Operator '*' cannot be applied to two Money values. Use 'Money<C> * Decimal' for scaling.`,
          location,
          `Multiply by a Decimal rate instead: amount * Decimal("0.20")`,
        ));
        return;
      }
      if (op === "/" && leftType !== rightType) {
        // Money<GBP> / Money<USD> is invalid (ratio requires same currency)
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Cannot divide '${leftType}' by '${rightType}'. Currency ratio requires same currency.`,
          location,
          `Use fx.convert() first, or divide same-currency values.`,
        ));
        return;
      }
      return; // Money<C> / Money<C> → Decimal ratio, valid
    }

    // ── RD-0353 — Hallmark open types: nominal, closed-algebra operands ───────
    // A hallmark type is nominal over a carrier; its schema's ops {} is the CLOSED
    // set of algebra operations it participates in (deny-by-default). Distinct
    // hallmark types never unify (FUNGI-TYPE-004); an operator whose algebra op is
    // undeclared is FUNGI-HALLMARK-005.
    {
      const leftHm = this.hallmarkSchemas.get(leftBase);
      const rightHm = this.hallmarkSchemas.get(rightBase);
      if (leftHm !== undefined || rightHm !== undefined) {
        const COMPARISONS = new Set(["<", ">", "<=", ">=", "==", "!="]);
        // Two DIFFERENT hallmark types never unify.
        if (leftHm !== undefined && rightHm !== undefined && leftBase !== rightBase) {
          this.diagnostics.push(makeTCDiag(
            "FUNGI-TYPE-004",
            "INVALID_BINARY_OPERATION",
            `'${leftBase}' and '${rightBase}' are distinct hallmark types and never unify under '${op}'.`,
            location,
            `Hallmark types are nominal — operate on values of the same type, or convert through an explicit gate.`,
          ));
          return;
        }
        // Same hallmark type on both sides — same-type algebra.
        if (leftHm !== undefined && rightHm !== undefined) {
          if (op === "*") {
            this.diagnostics.push(makeTCDiag(
              "FUNGI-TYPE-004",
              "INVALID_BINARY_OPERATION",
              `Operator '*' cannot be applied to two '${leftBase}' values (that would be '${leftBase}²'). Scale by a dimensionless number instead.`,
              location,
              `Scale by a number: value * 2.`,
            ));
            return;
          }
          const need = op === "+" ? "add"
            : op === "-" ? "subtract"
            : op === "/" ? "ratio"
            : COMPARISONS.has(op) ? "compare"
            : undefined;
          if (need !== undefined && !leftHm.ops.has(need)) {
            this.emitHallmarkOpDenied(leftBase, need, op, leftHm.ops, location);
          }
          return;
        }
        // Hallmark <op> non-hallmark: scalar scaling/comparison, else non-unification.
        const schema = (leftHm ?? rightHm)!;
        const hmName = leftHm !== undefined ? leftBase : rightBase;
        const otherBase = leftHm !== undefined ? rightBase : leftBase;
        if (NUMERIC_TYPES.has(otherBase)) {
          if (op === "*" || op === "/") {
            if (!schema.ops.has("scale")) this.emitHallmarkOpDenied(hmName, "scale", op, schema.ops, location);
            return;
          }
          if (COMPARISONS.has(op)) {
            if (!schema.ops.has("compare")) this.emitHallmarkOpDenied(hmName, "compare", op, schema.ops, location);
            return;
          }
          // + or - with a bare number: a hallmark is not a raw number.
          this.diagnostics.push(makeTCDiag(
            "FUNGI-TYPE-004",
            "INVALID_BINARY_OPERATION",
            `Operator '${op}' cannot combine hallmark type '${hmName}' with a bare '${otherBase}'. Add/subtract two '${hmName}' values, or scale (*) by a number.`,
            location,
            `Use '${hmName}' ${op} '${hmName}', or scale by a number.`,
          ));
          return;
        }
        // Hallmark vs an unrelated built-in (Money, String, …) → never unify.
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `'${leftBase}' and '${rightBase}' never unify under '${op}' — a hallmark type is nominal and shares no algebra with other types.`,
          location,
          `Operate on values of the same hallmark type.`,
        ));
        return;
      }
    }

    // ── Decimal partial-operator REDIRECT (#53/#54) ──────────────────────────
    // `/` and `%` on a Decimal are PARTIAL: exact decimal division is non-terminating (1/3 = 0.333…) and
    // needs an EXPLICIT rounding policy + scale. A silent default-rounding on money is itself a fail-open, so
    // the bare operator is a compile-reject that REDIRECTS to the obligation-carrying method form (the owner's
    // "turn no into yes, this way"). Money/Decimal scaling is valid (handled above / by moneyBinary) → exclude
    // any Money operand here.
    if ((leftBase === "Decimal" || rightBase === "Decimal") &&
        leftBase !== "Money" && rightBase !== "Money" &&
        (op === "/" || op === "%")) {
      if (op === "/") {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-NUMERIC-OP-001",
          "PARTIAL_DECIMAL_OPERATOR",
          "Operator '/' is not available for Decimal — exact decimal division is non-terminating (1/3 = 0.333…) and needs an explicit rounding policy + scale (a silent default rounding on money is a fail-open).",
          location,
          'Use the method form a.divide(b, scale, rounding) — e.g. total.divide(qty, 2, "halfEven"). Modes: halfEven|halfUp|halfDown|up|down|ceiling|floor.',
          'total.divide(qty, 2, "halfEven")',
        ));
      } else {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-NUMERIC-OP-001",
          "PARTIAL_DECIMAL_OPERATOR",
          "Operator '%' is not available for Decimal — use the exact method form (modulo on a value that supports a rounding policy must be explicit).",
          location,
          "Use the method form a.remainder(b) — e.g. total.remainder(qty).",
          "total.remainder(qty)",
        ));
      }
      return;
    }

    // String + non-String = error
    // Exception 1: if the non-String operand is an unknown/user-defined type (not in
    // BUILT_IN_TYPES), skip TYPE-004 — TYPE-001 was already emitted for the unknown
    // type, and user types may legitimately support concatenation via toString().
    // Exception 2: STRING_BASED_TYPES are domain identity types backed by String;
    // they are valid string concatenation operands without explicit .toString().
    if (op === "+") {
      if (leftBase === "String" && rightBase !== "String" && rightBase !== "") {
        // R5A: isBuiltInType — unified check (TypeId registry + BUILT_IN_TYPES + KNOWN_DOMAIN_TYPES)
        if (isBuiltInType(rightBase) && !STRING_BASED_TYPES.has(rightBase)) {
          this.diagnostics.push(makeTCDiag(
            "FUNGI-TYPE-004",
            "INVALID_BINARY_OPERATION",
            `Cannot use '+' between 'String' and '${rightBase}'. String concatenation requires both operands to be String.`,
            location,
            `Convert the '${rightBase}' to String first using .toString()`,
          ));
        }
        return;
      }
      if (rightBase === "String" && leftBase !== "String" && leftBase !== "") {
        // R5A: isBuiltInType — unified check (TypeId registry + BUILT_IN_TYPES + KNOWN_DOMAIN_TYPES)
        if (isBuiltInType(leftBase) && !STRING_BASED_TYPES.has(leftBase)) {
          this.diagnostics.push(makeTCDiag(
            "FUNGI-TYPE-004",
            "INVALID_BINARY_OPERATION",
            `Cannot use '+' between '${leftBase}' and 'String'. String concatenation requires both operands to be String.`,
            location,
            `Convert the '${leftBase}' to String first using .toString()`,
          ));
        }
        return;
      }
    }

    // Bool arithmetic = error
    if (["+", "-", "*", "/", "%"].includes(op)) {
      if (leftBase === "Bool" || rightBase === "Bool") {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Arithmetic operator '${op}' cannot be applied to Bool. Bool supports only '&&', '||', and '!'.`,
          location,
          `Use '&&' or '||' for boolean logic, not arithmetic operators.`,
        ));
        return;
      }
    }

    // Arithmetic operators
    if (["+", "-", "*", "/", "%"].includes(op)) {
      if (op === "+" && leftType === "String" && rightType === "String") return; // concat OK
      if (NUMERIC_TYPES.has(leftType) && NUMERIC_TYPES.has(rightType)) {
        // Decimal precision warning when used in Money context (per Stage 1 decision)
        // Full Decimal precision checking in Stage 2
        return; // numeric arithmetic is valid
      }
      // Invalid: string + int, bool + int, etc.
      if (!NUMERIC_TYPES.has(leftType) || !NUMERIC_TYPES.has(rightType)) {
        // Allow Money<C> * Decimal (Decimal is numeric, Money is not in NUMERIC_TYPES)
        if (leftBase === "Money" && NUMERIC_TYPES.has(rightType)) return;  // Money * Decimal: valid
        if (rightBase === "Money" && NUMERIC_TYPES.has(leftType)) return;  // Decimal * Money: valid
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Operator '${op}' cannot be applied to '${leftType}' and '${rightType}'. Both operands must be numeric, or both String for '+'.`,
          location,
          `Use compatible types: two numeric values, or two Strings for concatenation.`,
        ));
      }
      return;
    }

    // Equality operators
    if (op === "==" || op === "!=") {
      // SecureString equality is caught by value-state checker (FUNGI-SECRET-002)
      // Cross-type equality: warn but allow for now (Phase 8B will tighten)
      if (leftType !== rightType && !NUMERIC_TYPES.has(leftType) && !NUMERIC_TYPES.has(rightType)) {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Equality operator '${op}' used on different types: '${leftType}' and '${rightType}'.`,
          location,
          `Ensure both sides of '${op}' have the same type.`,
        ));
      }
      return;
    }

    // Comparison operators
    if (["<", "<=", ">", ">="].includes(op)) {
      // tri-lint 0397-C (FUNGI-GOV-3VL-004): NO ORDERED COMPARISON ON A Verdict. Authorization is
      // `== Verdict.Allow` (== +1) ONLY. `v >= 1` / `v > 0` is a fail-OPEN the instant an out-of-domain
      // value appears (the SIMD `7`-byte class, generalised): the {−1,0,+1} order exists for the K3
      // ALGEBRA (min/max fold internals), never for user authorization. This fires BEFORE the generic
      // ORDERABLE_TYPES check so the author gets the security reason, not "comparable types".
      if (leftType === "Verdict" || rightType === "Verdict") {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-GOV-3VL-004",
          "ORDERED_COMPARISON_ON_VERDICT",
          `Operator '${op}' orders a Verdict (K3 DENY/UNKNOWN/ALLOW). Authorization is '== Verdict.Allow' ONLY — ` +
          `an ordered test like 'v >= 1' fails OPEN the moment an out-of-domain value appears. The order is for the ` +
          `algebra (min/max folds), never for a user decision.`,
          location,
          `Authorize with '== Verdict.Allow' (exact match); use 'match' to branch all three arms.`,
        ));
        return;
      }
      // String comparison with non-String = error
      if ((leftBase === "String" && rightBase !== "String" && rightBase !== "") ||
          (rightBase === "String" && leftBase !== "String" && leftBase !== "")) {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Operator '${op}' cannot compare 'String' with '${leftBase === "String" ? rightBase : leftBase}'. Only same-type comparison is allowed.`,
          location,
          `Compare values of the same type.`,
        ));
        return;
      }
      if (!ORDERABLE_TYPES.has(leftType) || !ORDERABLE_TYPES.has(rightType)) {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Comparison operator '${op}' requires comparable types, got '${leftType}' and '${rightType}'.`,
          location,
          `Use numeric or Timestamp values with comparison operators.`,
        ));
      }
      return;
    }

    // Logical operators — W5a K3 (2026-07-08): overloaded ON TYPE.
    //   Verdict × Verdict ⇒ K3 min (&&/and) / max (||/or)  — the governed lane
    //   Bool    × Bool    ⇒ boolean                         — the classic lane
    //   MIXED             ⇒ compile ERROR (A9) — an UNKNOWN(0) verdict silently
    //   coerced to a truthy Bool is the BK-2-class fail-open; never coerce.
    if (op === "&&" || op === "||") {
      const leftIsVerdict = leftType === "Verdict";
      const rightIsVerdict = rightType === "Verdict";
      if (leftIsVerdict && rightIsVerdict) return; // K3 lane — sound
      if (leftIsVerdict !== rightIsVerdict) {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-K3-001",
          "MIXED_VERDICT_BOOL_OPERANDS",
          `Operator '${op}' cannot mix Verdict and Bool operands ('${leftType}' ${op} '${rightType}'). ` +
          `A verdict coerced to a boolean silently turns UNKNOWN into a decision (fail-open). ` +
          `Compare explicitly (e.g. x == Verdict.Allow) or keep both sides Verdict.`,
          location,
          `Make both operands Verdict (K3 min/max) or both Bool.`,
        ));
        return;
      }
      if (leftType !== "Bool") {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Logical operator '${op}' requires Bool operands, but left operand is '${leftType}'.`,
          location,
          `Ensure both operands are Bool.`,
        ));
      }
      if (rightType !== "Bool") {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-004",
          "INVALID_BINARY_OPERATION",
          `Logical operator '${op}' requires Bool operands, but right operand is '${rightType}'.`,
          location,
          `Ensure both operands are Bool.`,
        ));
      }
      return;
    }
  }

  /**
   * RD-0277 §4: Galerina `Int` lowers to WASM i32. A decimal integer literal
   * outside the i32 range wraps SILENTLY in lowering (2654435761 -> -1640531535).
   * The runtime overflow trap is the fail-closed backstop for COMPUTED overflow,
   * but a constant that cannot be represented is a silent correctness footgun —
   * surface it. WARNING (not error): a bare integer literal is ALSO accepted in
   * Float context, so an error would false-reject a legitimate 2654435761-as-Float;
   * the fix hint offers the `.0` form. Hex/bin/oct (Byte) and decimals (Float) are
   * different lanes and skipped.
   */
  /**
   * W5b T2.2: `check(subject){ if:/deny:/ambig: }` dispatches on the K3 verdict
   * lattice, so its subject must be a `Verdict`. A Bool/Int subject would coerce
   * a value into a governance branch (the A9 coercion fail-open) — reject it and
   * point non-verdict dispatch at `match` instead.
   */
  private checkCheckSubject(node: AstNode): void {
    const subject = node.children?.[0];
    if (subject === undefined) return;
    const t = this.inferType(subject);
    if (t !== undefined && t !== "Verdict") {
      this.diagnostics.push(makeTCDiag(
        "FUNGI-CHECK-002",
        "CHECK_SUBJECT_NOT_VERDICT",
        `check(...) dispatches on a Verdict (the K3 DENY/UNKNOWN/ALLOW lattice), but its subject is '${t}'. ` +
        `check is verdict-only; use 'match' for '${t}' values.`,
        subject.location ?? node.location,
        `Make the subject a Verdict, or use 'match' for '${t}'.`,
      ));
    }
  }

  private checkPrefilterSubject(node: AstNode): void {
    const subject = node.children?.[0];
    if (subject === undefined) return;
    const t = this.inferType(subject);
    if (t !== undefined && t !== "Verdict") {
      this.diagnostics.push(makeTCDiag(
        "FUNGI-PREFILTER-002",
        "PREFILTER_SUBJECT_NOT_VERDICT",
        `prefilter(...) dispatches on a Verdict (the deny-only gate over the K3 lattice), but its subject is '${t}'. ` +
        `prefilter is verdict-only; use 'match' for '${t}' values.`,
        subject.location ?? node.location,
        `Make the subject a Verdict, or use 'match' for '${t}'.`,
      ));
    }
  }

  private checkIntLiteralRange(node: AstNode): void {
    const v = node.value ?? "";
    if (v.includes(".") || v.startsWith("0x") || v.startsWith("0b") || v.startsWith("0o")) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    if (n > 2147483647 || n < -2147483648) {
      const d = makeTCDiag(
        "FUNGI-TYPE-024",
        "INT_LITERAL_I32_OVERFLOW",
        `Integer literal ${v} is outside the 32-bit Int range [-2147483648, 2147483647]. ` +
        `Galerina Int lowers to WASM i32, so used as an Int this constant WRAPS silently ` +
        `(e.g. 2654435761 -> -1640531535). Keep it within range, restructure to stay < 2^31, ` +
        `or write it as a Float literal (add '.0') if a Float was intended.`,
        node.location,
        `Use a value in -2147483648..2147483647, or make it a Float (add '.0').`,
      );
      this.diagnostics.push({ ...d, severity: "warning" });
    }
  }

  /**
   * W5a K3 (A9): `flip` is Verdict-only K3 negation; `!` stays Bool-only.
   * Cross-application is a compile ERROR — `!verdict` would boolean-negate a
   * trit (UNKNOWN becomes a decision), and `flip(bool)` would smuggle a Bool
   * into the governed lane. k3FoldExpr operands must ALL be Verdict.
   */
  private checkK3UnaryAndFolds(node: AstNode): void {
    if (node.kind === "unaryExpr") {
      const op = node.value ?? "";
      const operand = node.children?.[0];
      const operandType = operand ? this.inferType(operand) : undefined;
      if (op === "flip" && operandType !== undefined && operandType !== "Verdict") {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-K3-002",
          "VERDICT_UNARY_MISMATCH",
          `'flip' is K3 negation and applies ONLY to Verdict operands, got '${operandType}'. ` +
          `Use '!' for Bool negation.`,
          node.location,
          `flip(Verdict) only; for Bool use !x.`,
        ));
      }
      if (op === "!" && operandType === "Verdict") {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-K3-002",
          "VERDICT_UNARY_MISMATCH",
          `'!' is Bool negation and cannot apply to a Verdict — boolean-negating a trit turns ` +
          `UNKNOWN into a decision (fail-open). Use flip(x) (K3: flip(UNKNOWN)=UNKNOWN).`,
          node.location,
          `Use flip(x) for verdicts.`,
        ));
      }
    }
    if (node.kind === "k3FoldExpr") {
      for (const child of node.children ?? []) {
        const t = this.inferType(child);
        if (t !== undefined && t !== "Verdict") {
          this.diagnostics.push(makeTCDiag(
            "FUNGI-K3-003",
            "FOLD_OPERAND_NOT_VERDICT",
            `'${node.value}{ }' folds Verdicts (K3 ${node.value === "all" ? "min" : "max"}), but an operand is '${t}'. ` +
            `Every operand must be a Verdict.`,
            child.location ?? node.location,
            `Ensure every ${node.value}{} operand is Verdict-typed.`,
          ));
        }
      }
    }
  }

  // ── Binding type annotation extraction ───────────────────────────────────

  private checkBindingTypeAnnotation(node: AstNode): void {
    // letDecl / mutDecl value format:
    //   [safetyPrefix " "] name ": " typeAnnotation
    // e.g. "unsafe rawEmail: String" or "counter: Int"
    let rest = (node.value ?? "").trim();

    // Strip safetyPrefix
    if (rest.startsWith("unsafe ")) rest = rest.slice("unsafe ".length).trim();
    else if (rest.startsWith("safe ")) rest = rest.slice("safe ".length).trim();

    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) return; // no type annotation

    const typeSection = rest.slice(colonIdx + 1).trim();
    if (typeSection === "") return;

    this.checkTypeRef(typeSection, node.location);
  }

  // ── Type reference validation ─────────────────────────────────────────────

  private checkTypeRef(rawValue: string, location: SourceLocation | undefined): void {
    if (rawValue === "" || rawValue === "<unknown>") return;

    // ── MMCP view() type: view:cap1|cap2 — capability-masked pointer (task #78) ──
    // These are first-class type annotations emitted by the parser as "view:<capMask>".
    // The governance verifier validates capability bits; the type checker only verifies
    // that the syntax is structurally well-formed. No FUNGI-TYPE-001 for view: types.
    if (rawValue.startsWith("view:")) return;

    const { base, args } = parseTypeString(rawValue);

    if (base === "") return;

    // Skip numeric literals used as dimension args (Matrix<Float32, 4, 4>)
    if (/^\d/.test(base)) return;

    // Skip inference markers — Auto defers to the inference pass, never FUNGI-TYPE-001
    if (INFERENCE_MARKERS.has(base)) return;

    // ── FUNGI-TYPE-001: Unknown type ──────────────────────────────────────────
    // R5A: isBuiltInType is the unified gate — covers TypeId registry, BUILT_IN_TYPES,
    // and KNOWN_DOMAIN_TYPES. userDefinedTypes covers locally declared types.
    if (!isBuiltInType(base) && !this.userDefinedTypes.has(base)) {
      const suggestion = this.fuzzyTypeSuggestion(base);
      const singleCandidate = this.fuzzySingleCandidate(base);
      this.diagnostics.push(makeTCDiag(
        "FUNGI-TYPE-001",
        "UNKNOWN_TYPE",
        `Type '${base}' is not defined. It is not a built-in type and no 'type ${base}' or 'enum ${base}' declaration was found in scope.`,
        location,
        suggestion,
        singleCandidate,  // suggestedCode: unambiguous single match, undefined otherwise
      ));
      // Don't check arity of an unknown type — it would be noise
      return;
    }

    // ── FUNGI-TYPE-009: Generic arity mismatch ─────────────────────────────────
    const expectedArity = GENERIC_ARITY.get(base);
    if (expectedArity !== undefined) {
      const argCount = args.filter((a) => a.trim() !== "").length;
      if (argCount !== expectedArity) {
        const example = GENERIC_EXAMPLES.get(base) ?? `${base}<T>`;
        this.diagnostics.push(makeTCDiag(
          "FUNGI-TYPE-009",
          "INVALID_GENERIC_INSTANTIATION",
          `Generic type '${base}' expects ${expectedArity} type argument${expectedArity === 1 ? "" : "s"} but received ${argCount}.`,
          location,
          `${base} requires exactly ${expectedArity} type argument${expectedArity === 1 ? "" : "s"}. Example: ${example}`,
          example,  // suggestedCode: the canonical example form, without prose
        ));
      }
    }

    // Recursively check each TYPE-kind argument. A generic's non-type positions
    // (nominal tags, shape literals, dimensions) are declared in GENERIC_ARG_KINDS and
    // are never type references — that table is the single source of truth, replacing
    // the old per-case regex skips (Brand tag / Tensor shape / numeric dim). Defense in
    // depth: even a "type" position holding a literal, a quoted tag, or a bracketed
    // shape is payload, not a type name. Location for nested args is Phase 7.
    const argKinds = GENERIC_ARG_KINDS.get(base);
    for (let i = 0; i < args.length; i++) {
      const trimmed = (args[i] ?? "").trim();
      if (trimmed === "") continue;
      const argKind = argKinds?.[i] ?? "type";
      // RD-0349 I1: a Money currency tag is a payload position (never a type name), so the loop
      // skips type-recursion for it — but it is NOT unvalidated: it must be a known ISO-4217 code.
      if (argKind === "tag" && base === "Money") this.checkMoneyCurrencyTag(trimmed, location);
      if (argKind !== "type") continue; // declared payload position
      if (/^[\d"'\[]/.test(trimmed)) continue; // literal / quoted tag / shape literal
      this.checkTypeRef(trimmed, location);
    }
  }

  // ── RD-0349 I1: compile-time currency-tag validation ──────────────────────
  // Money<CCY>'s tag must be a known ISO-4217 code (the MONEY_UNIT_SET the runtime `Money.of` uses).
  // A typo'd or invented code (Money<GPB>, Money<BANANAS>) previously compiled clean and was caught
  // only at runtime, if the value ever flowed through Money.of — this closes G1/G2's compile half.
  // Metals (XAU) and reserved codes (XXX/XTS) are (correctly) absent from the admissible set, so they
  // reject here too; their SPECIFIC "use Commodity<XAU>" routing waits on Commodity<T> (RD-0350 C1).
  // Reuses the module-level levenshtein for the "did you mean" hint.
  private checkMoneyCurrencyTag(rawTag: string, location: SourceLocation | undefined): void {
    const tag = rawTag.replace(/^["']|["']$/g, "").trim(); // bare or quoted
    if (tag === "" || MONEY_UNIT_SET.has(tag)) return;
    // Rank so the likely typo leads: a single adjacent transposition (GPB↔GBP) reads as ONE human typo
    // but standard levenshtein scores it 2 — tie it with distance-1 so it sorts ahead of the noise of
    // unrelated distance-2 codes.
    const lt = tag.toLowerCase();
    const rank = (c: string): number => {
      const lc = c.toLowerCase();
      const d = levenshtein(lc, lt);
      if (d <= 1 || lc.length !== lt.length) return d;
      for (let k = 0; k + 1 < lt.length; k++) {
        if (lt.slice(0, k) + lt[k + 1] + lt[k] + lt.slice(k + 2) === lc) return 1;
      }
      return d;
    };
    const near = MONEY_UNIT_TAGS
      .map((c) => [c, rank(c)] as const)
      .filter(([, d]) => d <= 2)
      .sort((a, b) => a[1] - b[1])        // closest first, so the intended code leads
      .slice(0, 3)
      .map(([c]) => c);
    const hint = near.length ? ` Did you mean ${near.join(", ")}?` : "";
    this.diagnostics.push(makeTCDiag(
      "FUNGI-TYPE-032",
      "INVALID_CURRENCY_TAG",
      `Money<${tag}>: '${tag}' is not a known ISO-4217 currency code — Money models legal-tender currencies only.${hint}`,
      location,
      near.length
        // A near hit is almost certainly a typo — keep the developer on the currency path.
        ? `A Money currency tag must be an ISO-4217 code (e.g. Money<GBP>, Money<USD>).${hint}`
        // No near hit — likely a commodity/custom asset, not a mistyped currency. Money is the wrong
        // type (a commodity has no issuer and no minor-unit scale); point at the escape hatch. (The
        // dedicated commodity type is RD-0350 C1, not yet built — don't name a type that doesn't exist.)
        : `A Money currency tag must be an ISO-4217 code (e.g. Money<GBP>). If '${tag}' is a commodity or custom asset rather than legal tender, Money is the wrong type — model it with its own unit/asset type, not Money.`,
      near.length === 1 ? `Money<${near[0]}>` : undefined,
    ));
  }

  // ── Fuzzy suggestion ──────────────────────────────────────────────────────

  private checkMatchExhaustiveness(node: AstNode): void {
    const arms = (node.children ?? []).slice(1);
    const armPatterns = new Set(
      arms.map((a) => a.value ?? "").filter((v) => v !== ""),
    );

    // A match's catch-all may be written `_ =>` or `else =>` — both are wildcards.
    const isWildcardPat = (v: string | undefined): boolean => v === "_" || v === "else";
    const hasWildcard = armPatterns.has("_") || armPatterns.has("else");

    // ── FUNGI-TYPE-022: Unreachable pattern ──────────────────────────────────
    // Any arm that follows a wildcard (`_` or `else`) is unreachable.
    for (let i = 0; i < arms.length; i++) {
      const arm = arms[i]!;
      if (isWildcardPat(arm.value) && i < arms.length - 1) {
        // Every arm after the wildcard is unreachable
        for (let j = i + 1; j < arms.length; j++) {
          const unreachable = arms[j]!;
          this.diagnostics.push(makeTCDiag(
            "FUNGI-TYPE-022",
            "UNREACHABLE_PATTERN",
            `Pattern '${unreachable.value ?? "?"}' is unreachable — the wildcard arm already covers all remaining cases.`,
            unreachable.location,
            `Remove this unreachable arm, or move it before the wildcard.`,
          ));
        }
        break;
      }
    }

    // ── FUNGI-TYPE-023: Mandatory wildcard arm (task #174) ───────────────────
    // Every match MUST end with a `_ =>` (or `else =>`) catch-all. This is a
    // fail-closed, deny-by-default rule (Zero Trust Framework): an unhandled
    // or future case routes to the explicit wildcard rather than silently
    // escaping the match. It supersedes variant-exhaustiveness checking — a
    // missing variant is now caught by the mandatory wildcard.
    if (!hasWildcard) {
      this.diagnostics.push(makeTCDiag(
        "FUNGI-TYPE-023",
        "MISSING_WILDCARD_ARM",
        `match must end with a wildcard '_ =>' (or 'else =>') catch-all arm.`,
        node.location,
        `Add a final wildcard arm so every case is handled (fail-closed).`,
        `_ => ...`,
      ));
    }

    // ── tri-lint 0397-B (FUNGI-GOV-3VL-003): no wildcard over DENY on a Verdict match ─────────
    // On a Verdict subject, ALL THREE K3 members (Allow / Deny / Unknown) must be NAMED arms.
    // FUNGI-TYPE-023 makes the wildcard mandatory, so on a Verdict it is the DEAD backstop only
    // (reachable by out-of-domain values alone — the SIMD `7`-byte class): if Deny or Unknown is
    // left to `_`, an authorization outcome is decided by a catch-all (fail-open by omission);
    // if Allow is left to `_`, "not denied" becomes admission and out-of-domain junk is ALLOWED.
    // `check(v){ if:/deny:/ambig: }` enforces this structurally (FUNGI-CHECK-001) — this rule
    // catches `match` used instead. `when` guards do NOT count as naming a member: a guard is an
    // arbitrary expression, exactly the shape -004 exists to kill on Verdicts.
    const scrutinee = (node.children ?? [])[0];
    if (scrutinee !== undefined && this.inferType(scrutinee) === "Verdict") {
      const namedMembers = new Set<string>();
      for (const p of armPatterns) {
        for (const part of p.split("|")) namedMembers.add(part.trim());
      }
      const missing = ["Allow", "Deny", "Unknown"].filter((m) => !namedMembers.has(m));
      if (missing.length > 0) {
        this.diagnostics.push(makeTCDiag(
          "FUNGI-GOV-3VL-003",
          "WILDCARD_OVER_DENY_ON_VERDICT_MATCH",
          `match over a Verdict leaves ${missing.join(" and ")} to the wildcard arm. All three K3 members ` +
          `(Allow / Deny / Unknown) must be NAMED arms — a catch-all that absorbs a verdict decides ` +
          `authorization by omission (fail-open), and '_' standing in for Allow admits out-of-domain values. ` +
          `The mandatory wildcard is the dead backstop only.`,
          node.location,
          `Name all three arms (Allow => ... Deny => ... Unknown => ...), keep '_' as the final backstop — ` +
          `or use check(v) { if:/deny:/ambig: }, the sanctioned Verdict dispatch.`,
        ));
      }
    }
  }

  private fuzzyTypeSuggestion(typeName: string): string | undefined {
    const lower = typeName.toLowerCase();
    const candidates: string[] = [];

    for (const t of BUILT_IN_TYPES) {
      const tLower = t.toLowerCase();
      if (
        (lower.length >= 3 && tLower.startsWith(lower.slice(0, 3))) ||
        levenshtein(tLower, lower) <= 2
      ) {
        candidates.push(t);
      }
    }

    if (candidates.length === 1) {
      return `Did you mean '${candidates[0]}'?`;
    }
    if (candidates.length > 1 && candidates.length <= 4) {
      return `Did you mean one of: ${candidates.map((c) => `'${c}'`).join(", ")}?`;
    }
    return undefined;
  }

  /**
   * Returns the single unambiguous candidate type name when there is exactly
   * one fuzzy match — used as suggestedCode so tooling can apply the fix
   * directly without parsing prose.
   */
  private fuzzySingleCandidate(typeName: string): string | undefined {
    const lower = typeName.toLowerCase();
    const candidates: string[] = [];

    for (const t of BUILT_IN_TYPES) {
      const tLower = t.toLowerCase();
      if (
        (lower.length >= 3 && tLower.startsWith(lower.slice(0, 3))) ||
        levenshtein(tLower, lower) <= 2
      ) {
        candidates.push(t);
      }
    }

    return candidates.length === 1 ? candidates[0] : undefined;
  }
}

// ---------------------------------------------------------------------------
// Levenshtein distance (for fuzzy type suggestions)
// ---------------------------------------------------------------------------

function parseParamName(value: string): string {
  const colonIdx = value.indexOf(":");
  return (colonIdx === -1 ? value : value.slice(0, colonIdx)).trim();
}

function parseBindingName(value: string): string {
  let rest = value.trim();
  if (rest.startsWith("unsafe ")) rest = rest.slice("unsafe ".length).trim();
  else if (rest.startsWith("safe ")) rest = rest.slice("safe ".length).trim();

  const colonIdx = rest.indexOf(":");
  return (colonIdx === -1 ? rest : rest.slice(0, colonIdx)).trim();
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  const row: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? (row[j - 1] ?? j - 1)
          : 1 + Math.min(row[j] ?? j, prev, row[j - 1] ?? j - 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[n] = prev;
  }

  return row[n] ?? 0;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Runs the type checker on a parsed Galerina AST.
 *
 * Call this after `parseProgram()`. The checker validates:
 *   - All type references resolve to a built-in or user-declared type
 *   - All generic type instantiations use the correct number of type arguments
 *
 * @param ast            The root `program` node from `parseProgram()`.
 * @param importedTypes  Optional list of type names resolved from import declarations
 *                       (Phase 11E). These are added to the user-defined type set so
 *                       FUNGI-TYPE-001 is not emitted for them.
 * @returns    A result object containing all type diagnostics.
 */
export function checkTypes(ast: AstNode, importedTypes?: readonly string[]): TypeCheckResult {
  const checker = new TypeChecker(importedTypes ?? []);
  checker.check(ast);
  return checker.getResult();
}
