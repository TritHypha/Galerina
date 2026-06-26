// =============================================================================
// galerina-core — canonical shared types for the Galerina platform
//
// Package: @galerina/core
// Role:    Foundational type definitions for compiler, runtime, and tooling.
//          The compiler itself (compiler/galerina.js) stays in plain CJS.
//          This module provides typed contracts for downstream packages.
// =============================================================================

// ---------------------------------------------------------------------------
// Diagnostic types
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface SourceLocation {
  /** Source file path (relative to project root). */
  readonly file: string;
  /** 1-based line number. */
  readonly line: number;
  /** 1-based column number. */
  readonly column: number;
}

/**
 * Minimal diagnostic shape shared across all Galerina packages.
 *
 * Every package-specific diagnostic type (LogicDiagnostic, ConfigDiagnostic,
 * SecurityDiagnostic, etc.) is structurally compatible with this interface.
 * Once workspace links are established, package diagnostics will formally
 * extend BaseDiagnostic via imports from @galerina/core.
 */
export interface BaseDiagnostic {
  /** Structured diagnostic code in SPORE-SERIES-NNN format. */
  readonly code: string;
  /** Screaming-snake-case name. Example: "DUPLICATE_STATE". */
  readonly name: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
}

/**
 * Full compiler diagnostic — extends BaseDiagnostic with source location
 * and an optional suggested fix for IDE integration.
 */
export interface CompilerDiagnostic extends BaseDiagnostic {
  /**
   * Source location of the error or warning.
   * Absent for diagnostics that cannot be attributed to a specific position.
   */
  readonly location?: SourceLocation;
  /** Human-readable fix suggestion for IDE quick-fix integration. */
  readonly suggestedFix?: string;
}

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

export type TokenKind =
  | "identifier"
  | "keyword"
  | "string"
  | "char"
  | "number"
  | "boolean"
  | "operator"
  | "symbol"
  | "comment"
  | "docComment"
  | "newline"
  | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  /** 1-based line number. */
  readonly line: number;
  /** 1-based column number. */
  readonly column: number;
  /** Byte offset of token start in source. */
  readonly start: number;
  /** Byte offset of token end in source (exclusive). */
  readonly end: number;
}

export interface LexResult {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly CompilerDiagnostic[];
}

// ---------------------------------------------------------------------------
// AST types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Typed content block types
// ---------------------------------------------------------------------------

/**
 * The four canonical typed content block types.
 * All use heredoc-style `<<MARKER … MARKER` syntax.
 */
export type ContentBlockType = "html" | "dom" | "script" | "css";

export const CONTENT_BLOCK_TYPES: readonly ContentBlockType[] = [
  "html",
  "dom",
  "script",
  "css",
] as const;

/**
 * A typed content block expression — heredoc-style embedded content.
 *
 * @example
 *   html <<HTML
 *     <div class="foo">Hello Galerina</div>
 *   HTML
 *
 *   script <<SCRIPT
 *     console.log("hello");
 *   SCRIPT
 *
 * The `marker` must appear alone at the start of a line to close the block.
 * Content is preserved exactly as written.
 */
export interface TypedContentBlockExpression {
  readonly kind: "typedContentBlockExpr";
  readonly blockType: ContentBlockType;
  /** The closing marker string, e.g. "HTML", "SCRIPT". */
  readonly marker: string;
  /** Raw block content, exactly as written between opening and closing marker. */
  readonly content: string;
  readonly location?: SourceLocation;
}

// ---------------------------------------------------------------------------
// Variable binding types
// ---------------------------------------------------------------------------

/**
 * The three canonical binding keywords in Galerina.
 *
 * let      — immutable binding; value cannot be reassigned.
 * mut      — mutable binding; reassignment is explicit and visible.
 * readonly — immutable binding with a read-only view over the value;
 *            safe to share; mutation through this reference is rejected.
 *
 * `var` and `const` are NOT valid Galerina keywords (SPORE-SYNTAX-001/002).
 */
export type BindingKind = "let" | "mut" | "readonly";

/** AST shape for a variable binding declaration. */
export interface BindingDeclaration {
  readonly kind: BindingKind;
  readonly name: string;
  readonly typeAnnotation?: string;
  readonly location?: SourceLocation;
}

// ---------------------------------------------------------------------------
// Method-chain (pipeline) types
// ---------------------------------------------------------------------------

/**
 * A single method call within a method-chain pipeline.
 *
 * @example
 *   input.validate()
 *   orders.filter(o => o.active)
 *   payment.redactSecrets().toReport()
 */
export interface MethodChainCall {
  readonly methodName: string;
  readonly typeArguments?: readonly string[];
  readonly location?: SourceLocation;
}

/**
 * A method-chain pipeline expression.
 *
 * @example
 *   input
 *     .validate()
 *     .sanitize()
 *     .save()
 */
export interface MethodChainExpression {
  readonly kind: "methodChainExpr";
  /** The initial receiver (variable or expression before the first dot). */
  readonly receiver: string;
  readonly calls: readonly MethodChainCall[];
  readonly location?: SourceLocation;
}

// ---------------------------------------------------------------------------
// Intent, safety level, and effect types
// ---------------------------------------------------------------------------

/**
 * Explicit safety classification for flows and blocks.
 *
 * safe        — pure or low-risk; no side-effectful operations
 * guarded     — governed code with declared effects, policies, and audit
 * privileged  — high-authority code requiring declared capabilities
 * unsafe      — bypasses normal safety guarantees; requires approval + fallback
 * experimental — non-production / feature-flagged; blocked in production targets
 */
export type SafetyLevel =
  | "safe"
  | "guarded"
  | "privileged"
  | "unsafe"
  | "experimental";

/**
 * A developer-declared statement of purpose for a flow or block.
 * Captured at parse time and embedded in the AST and manifest.
 */
export interface IntentDeclaration {
  /** Raw intent text as written by the developer, e.g. "create customer order". */
  readonly text: string;
  readonly location?: SourceLocation;
}

/**
 * A single effect reference in an `effects [...]` declaration.
 * Effects name the security-sensitive operations a flow may perform.
 *
 * Canonical effect groups: auth, permission, secret, network, database,
 * payment, email, ai, native, filesystem, shell, audit.
 */
export interface EffectReference {
  /** Dot-path effect name, e.g. "database.write", "secret.read". */
  readonly name: string;
  readonly location?: SourceLocation;
}

/**
 * Metadata extracted from a flow or block header at parse time.
 * Used by the intent checker, manifest generator, and runtime planner.
 */
export interface FlowDeclarationMetadata {
  readonly name: string;
  readonly safetyLevel: SafetyLevel;
  readonly intent?: IntentDeclaration;
  readonly declaredEffects: readonly EffectReference[];
  readonly requiredCapabilities: readonly string[];
  readonly auditRequired: boolean;
  readonly traceEnabled: boolean;
  /** Only present on unsafe blocks. */
  readonly unsafeReason?: string;
  /** Only present on unsafe blocks. Name of the safe fallback flow. */
  readonly fallbackFlow?: string;
  readonly location?: SourceLocation;
}

// ---------------------------------------------------------------------------
// Flow trace types (governed evidence — never raw debug output)
// ---------------------------------------------------------------------------

export type FlowTraceStage =
  | "request.received"
  | "request.decoded"
  | "validation.completed"
  | "policy.checked"
  | "capability.checked"
  | "effect.executed"
  | "handler.started"
  | "handler.completed"
  | "response.encoded"
  | "request.denied";

export type FlowTraceStatus = "ok" | "warning" | "denied" | "error";

export type FlowTraceDecision = "allow" | "deny" | "unknown" | "conflict";

/**
 * A single governed trace event emitted during flow execution.
 * All secret and PII fields must be redacted before emission.
 * This is auditable evidence, not a debugging dump.
 */
export interface FlowTraceEvent {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly timestamp: string;
  readonly stage: FlowTraceStage;
  readonly status: FlowTraceStatus;
  readonly routeId?: string;
  readonly effect?: string;
  readonly capability?: string;
  readonly decision?: FlowTraceDecision;
  /**
   * Non-secret metadata only. Must not contain secrets, PII, or raw payloads.
   * Redacted values must be replaced with the string "[REDACTED]".
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type AstNodeKind =
  | "program"
  | "importDecl"
  | "useDecl"
  | "typeDecl"
  | "enumDecl"
  // ── Flow declarations (base + safety-level variants) ──
  | "flowDecl"
  | "secureFlowDecl"
  | "pureFlowDecl"
  | "guardedFlowDecl"
  | "privilegedFlowDecl"
  | "unsafeFlowDecl"
  | "experimentalFlowDecl"
  // ── Unsafe native block ──
  | "unsafeBlock"
  // ── Flow header sub-declarations ──
  | "intentDecl"
  | "requiresCapabilityDecl"
  | "fallbackDecl"
  // ── API and route declarations ──
  | "apiDecl"
  | "routeDecl"
  | "handlerDecl"
  | "effectsDecl"
  | "webhookDecl"
  // ── Compute and target ──
  | "computeDecl"
  | "targetDecl"
  // ── Variable declarations (let / mut / readonly) ──
  | "letDecl"
  | "mutDecl"
  | "readonlyDecl"
  // ── Leaf nodes (literals and identifiers) ──
  | "identifier"
  | "stringLiteral"
  | "charLiteral"
  | "byteLiteral"
  | "numberLiteral"
  | "boolLiteral"
  // ── Expressions ──
  | "binaryExpr"
  | "callExpr"
  | "memberExpr"
  | "methodChainExpr"
  | "typedContentBlockExpr"
  | "matchExpr"
  | "matchArm"
  // ── Statements ──
  | "ifStmt"
  | "block"
  | "returnStmt"
  // ── Concurrency ──
  | "parallelBlock"
  | "workerDecl"
  | "channelDecl"
  | "checkpointStmt"
  | "rollbackStmt"
  // ── Tracing ──
  | "traceFlowDecl"
  // ── Security and secrets ──
  | "secretDecl"
  | "vaultGlobalDecl"
  | "securityBlock"
  | "permissionsBlock"
  | "jsonPolicyBlock"
  // ── Memory config block (manifest/project-level) ──
  //    Use configMemoryBlock for project manifest memory settings (boot.spore).
  //    Use borrowScopeBlock for code-level ownership/borrow scope (Phase 4+).
  //    "memoryBlock" is retained as a legacy alias — prefer the specific names.
  | "memoryBlock"
  | "configMemoryBlock"
  | "borrowScopeBlock"
  // ── Memory ownership expressions (Phase 3 vocabulary, parsed in Phase 4) ──
  | "borrowExpr"       // borrow x  — immutable temporary access, no transfer
  | "borrowMutExpr"    // borrow mut x  — exclusive mutable access for a scope
  | "moveExpr"         // move x  — explicit ownership transfer, source invalidated
  | "pinnedDecl"       // pinned x  — memory locked for DMA / accelerator transfer
  | "ownershipTransfer" // x -> y  — explicit ownership transfer to target
  // ── Runtime-owned resources ──
  | "resourceDecl"
  | "resourceScopeDecl"
  | "resourceInitBlock"
  | "resourceShutdownBlock"
  | "usesDecl";

export interface AstNode {
  readonly kind: AstNodeKind;
  readonly location?: SourceLocation;
  /** Child nodes for structural nodes (blocks, declarations, etc.). */
  readonly children?: readonly AstNode[];
  /** Raw value for leaf nodes (literals, identifiers). */
  readonly value?: string;
}

export interface ParseResult {
  readonly ast?: AstNode;
  readonly diagnostics: readonly CompilerDiagnostic[];
}

// ---------------------------------------------------------------------------
// Build types
// ---------------------------------------------------------------------------

export type BuildOutputKind = "target" | "target-plan" | "report" | "manifest";

export interface BuildOutput {
  readonly path: string;
  readonly kind: BuildOutputKind;
  readonly format: "placeholder" | "javascript-placeholder" | "text" | "json" | "binary";
  readonly cleanup?: boolean;
}

export interface BuildManifest {
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly project: string;
  readonly version: string;
  readonly targets: readonly string[];
  readonly outputs: readonly BuildOutput[];
  readonly diagnostics: readonly CompilerDiagnostic[];
}

// ---------------------------------------------------------------------------
// Note: EnvironmentMode is the canonical type for deployment environments.
// It is defined and owned by @galerina/core-config. When workspace links are
// established, packages that need EnvironmentMode should import it from there.
// ---------------------------------------------------------------------------
// Compiler diagnostic helpers
// ---------------------------------------------------------------------------

/**
 * Construct a CompilerDiagnostic with the canonical SPORE-* code format.
 */
export function createCompilerDiagnostic(
  code: string,
  name: string,
  severity: DiagnosticSeverity,
  message: string,
  location?: SourceLocation,
  suggestedFix?: string,
): CompilerDiagnostic {
  return {
    code,
    name,
    severity,
    message,
    ...(location === undefined ? {} : { location }),
    ...(suggestedFix === undefined ? {} : { suggestedFix }),
  };
}

/**
 * Returns true if the diagnostics array contains at least one error.
 */
export function hasErrors(
  diagnostics: readonly CompilerDiagnostic[],
): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/**
 * Returns only the diagnostics with the given severity.
 */
export function filterBySeverity(
  diagnostics: readonly CompilerDiagnostic[],
  severity: DiagnosticSeverity,
): readonly CompilerDiagnostic[] {
  return diagnostics.filter((d) => d.severity === severity);
}
