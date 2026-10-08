// V1 package freeze and keep-out-of-core scope (TODO pass, SuperGrok 2026-10-08).
//
// Pure fail-closed classifier. This package records admitted v1 targets and
// families that stay out of Galerina core. It does not parse .fungi, grant
// SLIDE/VOK, register 8/16-trit profiles, or commit a memory-safety model.

export const V1_SCOPE_SCHEMA = "galerina.core.v1-scope.v1" as const;

export const MATURITY_CHECKLIST_PATH = "docs/language-core-maturity-roadmap.md" as const;

export const V1_ADMITTED_TARGETS = Object.freeze(["cpu", "wasm"] as const);

export type V1AdmittedTarget = (typeof V1_ADMITTED_TARGETS)[number];

export const V1_POST_TARGETS = Object.freeze([
  "gpu",
  "ai_accelerator",
  "photonic",
  "optical_io",
  "dart",
  "flutter",
  "react",
  "react_native",
  "angular",
  "javascript_esm",
  "node",
  "browser",
  "mobile_native",
  "wavelength",
  "onnx",
  "server",
  "native",
] as const);

export type V1PostTarget = (typeof V1_POST_TARGETS)[number];

export const V1_POST_DOMAIN_PACKAGES = Object.freeze([
  "image",
  "video",
  "search",
  "translation_provider",
  "text_ai",
  "device",
  "flutter_ui",
] as const);

export type V1PostDomainPackage = (typeof V1_POST_DOMAIN_PACKAGES)[number];

export const EXCLUDED_FROM_CORE = Object.freeze([
  "camera",
  "microphone",
  "bluetooth",
  "gps",
  "notifications",
  "media_players",
  "mobile_ui",
  "summarisation",
  "generation",
  "embeddings",
  "moderation",
  "translation",
  "nlp",
  "identity_providers",
  "login_products",
  "mfa_products",
  "new_crypto_algorithms",
  "web_frameworks",
  "load_balancers",
  "api_gateways",
  "queue_backends",
  "rate_limit_stores",
  "fixed_routers",
  "controller_frameworks",
  "middleware_stacks",
  "idempotency_storage",
] as const);

export type ExcludedFromCore = (typeof EXCLUDED_FROM_CORE)[number];

export type V1ScopeClass = "admitted" | "post_v1" | "excluded_from_core" | "unknown";

export interface CoreScopeDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly path: string;
}

export interface V1ScopeDecision {
  readonly schema: typeof V1_SCOPE_SCHEMA;
  readonly status: "ADMITTED" | "REFUSED";
  readonly token: string;
  readonly scopeClass: V1ScopeClass;
  readonly v1Core: false | true;
  readonly diagnostics: readonly CoreScopeDiagnostic[];
}

const refuseDiag = (code: string, message: string, path: string): CoreScopeDiagnostic =>
  Object.freeze({ code, severity: "error" as const, message, path });

function asToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function classifyV1Scope(token: string): V1ScopeClass {
  if ((V1_ADMITTED_TARGETS as readonly string[]).includes(token)) return "admitted";
  if ((V1_POST_TARGETS as readonly string[]).includes(token)) return "post_v1";
  if ((V1_POST_DOMAIN_PACKAGES as readonly string[]).includes(token)) return "post_v1";
  if ((EXCLUDED_FROM_CORE as readonly string[]).includes(token)) return "excluded_from_core";
  return "unknown";
}

function decide(token: string, scopeClass: V1ScopeClass, diagnostics: readonly CoreScopeDiagnostic[]): V1ScopeDecision {
  const admitted = scopeClass === "admitted" && diagnostics.length === 0;
  return Object.freeze({
    schema: V1_SCOPE_SCHEMA,
    status: admitted ? "ADMITTED" as const : "REFUSED" as const,
    token,
    scopeClass,
    v1Core: admitted,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

export function admitV1CoreTarget(target: unknown): V1ScopeDecision {
  const token = asToken(target);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_TARGET_REQUIRED", "A v1 core target name is required.", "target"),
    ]);
  }
  const scopeClass = classifyV1Scope(token);
  if (scopeClass === "admitted") return decide(token, scopeClass, []);
  if (scopeClass === "post_v1") {
    return decide(token, scopeClass, [
      refuseDiag("Galerina_CORE_V1_TARGET_POST", "Target is post-v1; v1 core admits only cpu and wasm.", "target"),
    ]);
  }
  if (scopeClass === "excluded_from_core") {
    return decide(token, scopeClass, [
      refuseDiag("Galerina_CORE_V1_TARGET_EXCLUDED", "Target is excluded from Galerina core.", "target"),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_TARGET_UNKNOWN", "Target is not an admitted v1 core target.", "target"),
  ]);
}

export function admitV1CorePackage(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_PACKAGE_REQUIRED", "A package family name is required.", "package"),
    ]);
  }
  const scopeClass = classifyV1Scope(token);
  if (scopeClass === "admitted") return decide(token, scopeClass, []);
  if (scopeClass === "post_v1") {
    return decide(token, scopeClass, [
      refuseDiag("Galerina_CORE_V1_PACKAGE_FROZEN", "Non-essential package expansion is frozen until v1 syntax and grammar settle.", "package"),
    ]);
  }
  if (scopeClass === "excluded_from_core") {
    return decide(token, scopeClass, [
      refuseDiag("Galerina_CORE_V1_PACKAGE_EXCLUDED", "This family stays out of Galerina core.", "package"),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_PACKAGE_UNKNOWN", "Package family is not admitted as v1 core.", "package"),
  ]);
}

export interface ProductionMaturityClaim {
  readonly checklistPath: string;
  readonly claimed: boolean;
}

/** Closed v1 logic/algebra names. Int/String/Bytes stay outside this catalog. */
export const V1_CORE_LOGIC_TYPES = Object.freeze([
  "Bool",
  "Tri",
  "Decision",
  "Option",
  "Result",
] as const);

export type V1CoreLogicType = (typeof V1_CORE_LOGIC_TYPES)[number];

export const V1_WASM_TARGET_CONTRACT_SCHEMA = "galerina.core.v1-wasm-target.v1" as const;

export const V1_POST_SYNTAX_FAMILIES = Object.freeze([
  "dart",
  "flutter",
  "javascript_esm",
  "node",
  "browser",
  "react",
  "react_native",
  "angular",
  "device",
  "flutter_ui",
  "text_ai",
  "image",
  "video",
  "search",
  "wavelength",
  "onnx",
  "gpu",
  "ai_accelerator",
  "photonic",
  "optical_io",
  "dom_event",
  "form_validation",
  "safe_html",
  "service_worker",
  "push_notification",
  "camera",
  "nlp",
] as const);

export function admitV1CoreLogicType(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_LOGIC_TYPE_REQUIRED", "A v1 core logic type name is required.", "type"),
    ]);
  }
  if ((V1_CORE_LOGIC_TYPES as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_LOGIC_TYPE_UNKNOWN",
      "v1 core logic types are Bool, Tri, Decision, Option and Result only.",
      "type",
    ),
  ]);
}

export function admitV1SyntaxFamily(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_SYNTAX_REQUIRED", "A syntax family name is required.", "syntax"),
    ]);
  }
  if ((V1_ADMITTED_TARGETS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_POST_SYNTAX_FAMILIES as readonly string[]).includes(token) || classifyV1Scope(token) === "post_v1") {
    return decide(token, "post_v1", [
      refuseDiag(
        "Galerina_CORE_V1_SYNTAX_POST",
        "Post-v1 syntax is refused until the v1 cpu/wasm grammar settles.",
        "syntax",
      ),
    ]);
  }
  if (classifyV1Scope(token) === "excluded_from_core") {
    return decide(token, "excluded_from_core", [
      refuseDiag("Galerina_CORE_V1_SYNTAX_EXCLUDED", "This syntax family stays out of Galerina core.", "syntax"),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_SYNTAX_UNKNOWN", "Syntax family is not an admitted v1 core family.", "syntax"),
  ]);
}

export function admitV1WasmTargetContract(schema: unknown): V1ScopeDecision {
  const token = asToken(schema);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_WASM_CONTRACT_REQUIRED", "The v1 wasm target contract schema is required.", "schema"),
    ]);
  }
  if (token !== V1_WASM_TARGET_CONTRACT_SCHEMA) {
    return decide(token, "unknown", [
      refuseDiag(
        "Galerina_CORE_V1_WASM_CONTRACT_UNKNOWN",
        "v1 wasm target syntax/report identity is galerina.core.v1-wasm-target.v1 only.",
        "schema",
      ),
    ]);
  }
  return decide(token, "admitted", []);
}

export const V1_CPU_TARGET_CONTRACT_SCHEMA = "galerina.core.v1-cpu-target.v1" as const;

/** Named cpu|wasm only. `auto` / `best` / accelerator selectors stay post-v1. */
export const V1_ADMITTED_COMPUTE_SELECTORS = Object.freeze(["cpu", "wasm"] as const);

export const V1_POST_COMPUTE_SELECTORS = Object.freeze([
  "auto",
  "best",
  "gpu",
  "photonic",
  "prefer_photonic",
  "fallback_gpu",
  "onnx",
  "ai_accelerator",
] as const);

/** v1 admits no target plugins. This schema is the closed none-boundary. */
export const V1_TARGET_PLUGIN_NONE_SCHEMA = "galerina.core.v1-target-plugin-none.v1" as const;

export function admitV1CpuTargetContract(schema: unknown): V1ScopeDecision {
  const token = asToken(schema);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_CPU_CONTRACT_REQUIRED", "The v1 cpu target contract schema is required.", "schema"),
    ]);
  }
  if (token !== V1_CPU_TARGET_CONTRACT_SCHEMA) {
    return decide(token, "unknown", [
      refuseDiag(
        "Galerina_CORE_V1_CPU_CONTRACT_UNKNOWN",
        "v1 cpu target syntax/report identity is galerina.core.v1-cpu-target.v1 only.",
        "schema",
      ),
    ]);
  }
  return decide(token, "admitted", []);
}

export function admitV1ComputeSelector(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_COMPUTE_SELECTOR_REQUIRED", "A v1 compute selector is required.", "selector"),
    ]);
  }
  if ((V1_ADMITTED_COMPUTE_SELECTORS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_POST_COMPUTE_SELECTORS as readonly string[]).includes(token)) {
    return decide(token, "post_v1", [
      refuseDiag(
        "Galerina_CORE_V1_COMPUTE_SELECTOR_POST",
        "v1 compute selectors are cpu and wasm only; auto, best and accelerator selectors stay post-v1.",
        "selector",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_COMPUTE_SELECTOR_UNKNOWN", "Compute selector is not an admitted v1 selector.", "selector"),
  ]);
}

export function admitV1TargetPluginBoundary(schema: unknown): V1ScopeDecision {
  const token = asToken(schema);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag(
        "Galerina_CORE_V1_PLUGIN_REQUIRED",
        "A v1 target-plugin boundary schema is required.",
        "schema",
      ),
    ]);
  }
  if (token === V1_TARGET_PLUGIN_NONE_SCHEMA) {
    return decide(token, "admitted", []);
  }
  return decide(token, "post_v1", [
    refuseDiag(
      "Galerina_CORE_V1_PLUGIN_POST",
      "v1 admits no target plugins; only galerina.core.v1-target-plugin-none.v1 is the closed boundary.",
      "schema",
    ),
  ]);
}

/** Closed v1 binding keywords. var/const stay excluded (FUNGI-SYNTAX-001/002). */
export const V1_ADMITTED_BINDINGS = Object.freeze(["let", "mut", "readonly"] as const);

export type V1AdmittedBinding = (typeof V1_ADMITTED_BINDINGS)[number];

export const V1_REFUSED_BINDINGS = Object.freeze(["var", "const"] as const);

/** Planned visibility catalog from docs/modules-and-visibility.md. Module syntax form stays HOLD. */
export const V1_ADMITTED_VISIBILITY = Object.freeze(["private", "module", "package", "public"] as const);

export type V1AdmittedVisibility = (typeof V1_ADMITTED_VISIBILITY)[number];

/** Exhaustive match is the v1 form. switch/case are not Galerina core syntax. */
export const V1_ADMITTED_MATCH_FORMS = Object.freeze(["match"] as const);

export const V1_REFUSED_MATCH_FORMS = Object.freeze(["switch", "case"] as const);

/** Named Pattern identity only. Parser support stays HOLD (W13 C20). */
export const V1_ADMITTED_PATTERN_FAMILIES = Object.freeze(["Pattern"] as const);

export const V1_REFUSED_PATTERN_FAMILIES = Object.freeze(["UnsafeRegex", "javascript_regexp"] as const);

/** Debug sinks allowed in run/dev. Production console is refused. */
export const V1_ADMITTED_CONSOLE_MODES = Object.freeze(["run", "dev"] as const);

export const V1_REFUSED_CONSOLE_MODES = Object.freeze(["production"] as const);

export const V1_EXCLUDED_LANGUAGE_FORMS = Object.freeze([
  "classes",
  "inheritance",
  "raw_object_dump",
] as const);

export function admitV1BindingKind(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_BINDING_REQUIRED", "A v1 binding keyword is required.", "binding"),
    ]);
  }
  if ((V1_ADMITTED_BINDINGS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_REFUSED_BINDINGS as readonly string[]).includes(token)) {
    return decide(token, "excluded_from_core", [
      refuseDiag(
        "Galerina_CORE_V1_BINDING_EXCLUDED",
        "var and const are not Galerina binding keywords.",
        "binding",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_BINDING_UNKNOWN", "Binding keyword is not an admitted v1 form.", "binding"),
  ]);
}

export function admitV1Visibility(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_VISIBILITY_REQUIRED", "A visibility name is required.", "visibility"),
    ]);
  }
  if ((V1_ADMITTED_VISIBILITY as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_VISIBILITY_UNKNOWN",
      "v1 visibility names are private, module, package and public only.",
      "visibility",
    ),
  ]);
}

export function admitV1MatchForm(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_MATCH_REQUIRED", "A match form name is required.", "match"),
    ]);
  }
  if ((V1_ADMITTED_MATCH_FORMS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_REFUSED_MATCH_FORMS as readonly string[]).includes(token)) {
    return decide(token, "excluded_from_core", [
      refuseDiag(
        "Galerina_CORE_V1_MATCH_EXCLUDED",
        "switch and case are not v1 core syntax; use exhaustive match.",
        "match",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_MATCH_UNKNOWN", "Match form is not an admitted v1 form.", "match"),
  ]);
}

export function admitV1PatternFamily(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_PATTERN_REQUIRED", "A pattern family name is required.", "pattern"),
    ]);
  }
  if ((V1_ADMITTED_PATTERN_FAMILIES as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_REFUSED_PATTERN_FAMILIES as readonly string[]).includes(token)) {
    return decide(token, "excluded_from_core", [
      refuseDiag(
        "Galerina_CORE_V1_PATTERN_UNSAFE",
        "UnsafeRegex and JavaScript RegExp are refused as v1 core production gates.",
        "pattern",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_PATTERN_UNKNOWN", "Pattern family is not an admitted v1 family.", "pattern"),
  ]);
}

export function admitV1ConsoleMode(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_CONSOLE_REQUIRED", "A console mode name is required.", "console"),
    ]);
  }
  if ((V1_ADMITTED_CONSOLE_MODES as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_REFUSED_CONSOLE_MODES as readonly string[]).includes(token)) {
    return decide(token, "excluded_from_core", [
      refuseDiag(
        "Galerina_CORE_V1_CONSOLE_PRODUCTION",
        "Production console debug sinks are refused.",
        "console",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_CONSOLE_UNKNOWN", "Console mode is not an admitted v1 debug sink.", "console"),
  ]);
}

export function admitV1LanguageForm(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_LANGUAGE_FORM_REQUIRED", "A language form name is required.", "form"),
    ]);
  }
  if ((V1_EXCLUDED_LANGUAGE_FORMS as readonly string[]).includes(token)) {
    return decide(token, "excluded_from_core", [
      refuseDiag(
        "Galerina_CORE_V1_LANGUAGE_FORM_EXCLUDED",
        "Classes, inheritance and raw object dumps stay out of Galerina core.",
        "form",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_LANGUAGE_FORM_UNKNOWN", "Language form is not an excluded-from-core catalog entry.", "form"),
  ]);
}

/** Closed v1 test kinds from docs/testing.md. memory_safety stays out (memory-model). */
export const V1_ADMITTED_TEST_KINDS = Object.freeze([
  "unit",
  "integration",
  "api",
  "webhook",
  "json_validation",
  "security",
  "diagnostic_format",
  "target_fallback",
  "source_map",
  "ai_context",
  "type_checker",
  "compiler_report",
] as const);

export type V1AdmittedTestKind = (typeof V1_ADMITTED_TEST_KINDS)[number];

/** Closed v1 test assertions from docs/testing.md. */
export const V1_ADMITTED_TEST_ASSERTIONS = Object.freeze([
  "expected_success",
  "expected_diagnostics",
  "expected_target_fallback",
  "expected_source_map_location",
  "expected_generated_report_fields",
] as const);

export type V1AdmittedTestAssertion = (typeof V1_ADMITTED_TEST_ASSERTIONS)[number];

/** Vector output order from docs/vector-model.md Order Rules. Default preserve_order. */
export const V1_ADMITTED_VECTOR_ORDER = Object.freeze([
  "preserve_order",
  "unordered",
] as const);

export type V1AdmittedVectorOrder = (typeof V1_ADMITTED_VECTOR_ORDER)[number];

export const V1_DEFAULT_VECTOR_ORDER = "preserve_order" as const;

export function admitV1TestKind(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_TEST_KIND_REQUIRED", "A v1 test kind name is required.", "testKind"),
    ]);
  }
  if ((V1_ADMITTED_TEST_KINDS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_TEST_KIND_UNKNOWN",
      "Test kind is not an admitted v1 kind from docs/testing.md.",
      "testKind",
    ),
  ]);
}

export function admitV1TestAssertion(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_TEST_ASSERTION_REQUIRED", "A v1 test assertion name is required.", "assertion"),
    ]);
  }
  if ((V1_ADMITTED_TEST_ASSERTIONS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_TEST_ASSERTION_UNKNOWN",
      "Test assertion is not an admitted v1 assertion from docs/testing.md.",
      "assertion",
    ),
  ]);
}

export function admitV1VectorOrder(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_VECTOR_ORDER_REQUIRED", "A v1 vector order policy is required.", "order"),
    ]);
  }
  if ((V1_ADMITTED_VECTOR_ORDER as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_VECTOR_ORDER_UNKNOWN",
      "v1 vector order policies are preserve_order and unordered only.",
      "order",
    ),
  ]);
}

/**
 * This package's compiler language split from src/index.ts and compiler/README.md.
 * Typed contracts live in TypeScript; the v0.1 CLI stays plain CJS.
 */
export const V1_ADMITTED_COMPILER_LANGUAGES = Object.freeze([
  "typescript_contracts",
  "cjs_prototype",
] as const);

export type V1AdmittedCompilerLanguage = (typeof V1_ADMITTED_COMPILER_LANGUAGES)[number];

/** Closed package folders that form the compiler/docs scaffold. */
export const V1_ADMITTED_COMPILER_FOLDERS = Object.freeze([
  "compiler",
  "src",
  "tests",
  "grammar",
  "schemas",
  "docs",
  "examples",
] as const);

export type V1AdmittedCompilerFolder = (typeof V1_ADMITTED_COMPILER_FOLDERS)[number];

/** Live syntax-doc folders. Historical docs/sytax spelling is recorded, not admitted. */
export const V1_ADMITTED_SYNTAX_DOC_DIRS = Object.freeze([
  "docs/syntax",
  "docs/syntax-examples",
] as const);

export const V1_HISTORICAL_SYNTAX_DOC_DIRS = Object.freeze([
  "docs/sytax",
  "docs/sytax-examples",
] as const);

/** Per-feature example files listed in docs/syntax-examples/README.md. */
export const V1_ADMITTED_SYNTAX_EXAMPLE_FILES = Object.freeze([
  "async-dart-flutter.md",
  "structured-await.md",
  "api-data-security-and-load-control.md",
  "api-duplicate-detection-and-idempotency.md",
  "auth-token-verification.md",
  "backend-compute-targets.md",
  "device-capability-boundaries.md",
  "js-ts-framework-targets.md",
  "patterns-and-regex.md",
  "text-ai-package-boundaries.md",
] as const);

export type V1AdmittedSyntaxExampleFile = (typeof V1_ADMITTED_SYNTAX_EXAMPLE_FILES)[number];

export function admitV1CompilerImplementationLanguage(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag(
        "Galerina_CORE_V1_COMPILER_LANGUAGE_REQUIRED",
        "A v1 compiler implementation language is required.",
        "language",
      ),
    ]);
  }
  if ((V1_ADMITTED_COMPILER_LANGUAGES as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_COMPILER_LANGUAGE_UNKNOWN",
      "v1 compiler languages in this package are typescript_contracts and cjs_prototype only.",
      "language",
    ),
  ]);
}

export function admitV1CompilerFolder(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_COMPILER_FOLDER_REQUIRED", "A compiler folder name is required.", "folder"),
    ]);
  }
  if ((V1_ADMITTED_COMPILER_FOLDERS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_COMPILER_FOLDER_UNKNOWN",
      "Compiler folder is not an admitted v1 scaffold folder.",
      "folder",
    ),
  ]);
}

export function admitV1SyntaxDocsDir(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_SYNTAX_DIR_REQUIRED", "A syntax docs directory path is required.", "dir"),
    ]);
  }
  if ((V1_ADMITTED_SYNTAX_DOC_DIRS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_HISTORICAL_SYNTAX_DOC_DIRS as readonly string[]).includes(token)) {
    return decide(token, "unknown", [
      refuseDiag(
        "Galerina_CORE_V1_SYNTAX_DIR_HISTORICAL",
        "docs/sytax is the historical spelling; live folders are docs/syntax and docs/syntax-examples.",
        "dir",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_SYNTAX_DIR_UNKNOWN", "Syntax docs directory is not an admitted live path.", "dir"),
  ]);
}

export function admitV1SyntaxExampleFile(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag(
        "Galerina_CORE_V1_SYNTAX_EXAMPLE_REQUIRED",
        "A syntax example file name is required.",
        "example",
      ),
    ]);
  }
  if ((V1_ADMITTED_SYNTAX_EXAMPLE_FILES as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_SYNTAX_EXAMPLE_UNKNOWN",
      "Example file is not listed in docs/syntax-examples/README.md.",
      "example",
    ),
  ]);
}

/**
 * Auth catalogs from docs/auth-token-verification-boundaries.md.
 * Parser/runtime verification stays with core-security and the app kernel.
 * Post-quantum and hardware_proof stay out of this freeze.
 */
export const V1_ADMITTED_AUTH_PROVIDER_TYPES = Object.freeze(["oauth2"] as const);

export const V1_REFUSED_AUTH_PROVIDER_TYPES = Object.freeze([
  "identity_provider",
  "oidc_provider",
  "login_product",
] as const);

export const V1_ADMITTED_AUTH_POLICY_FAMILIES = Object.freeze([
  "bearer",
  "jwt",
  "oauth2",
  "proof_of_possession",
  "capability_tokens",
  "reports",
] as const);

export const V1_EXPERIMENTAL_AUTH_POLICY_FAMILIES = Object.freeze(["hardware_proof"] as const);

export const V1_ADMITTED_AUTH_TOKEN_KINDS = Object.freeze(["bearer", "jwt"] as const);

export const V1_ADMITTED_JWT_ALGORITHMS = Object.freeze(["RS256", "ES256", "EdDSA"] as const);

export const V1_REFUSED_JWT_ALGORITHMS = Object.freeze(["none"] as const);

export const V1_ADMITTED_JWT_DIAGNOSTICS = Object.freeze([
  "alg_none",
  "expired",
  "wrong_issuer",
  "wrong_audience",
  "missing_signature",
  "unknown_algorithm",
  "untrusted_key",
  "missing_required_claims",
  "unverified_claim_use",
] as const);

export const V1_ADMITTED_BEARER_DIAGNOSTICS = Object.freeze([
  "logged",
  "local_storage",
  "client_safe",
  "missing_expiry",
] as const);

export const V1_ADMITTED_OAUTH_CHECKS = Object.freeze([
  "issuer",
  "audience",
  "scope",
  "jwks",
  "pkce",
] as const);

export const V1_ADMITTED_PROOF_OF_POSSESSION = Object.freeze(["dpop", "mtls"] as const);

export const V1_ADMITTED_PROOF_CONSTRAINTS = Object.freeze([
  "bind_method",
  "bind_path",
  "bind_body",
  "replay_cache",
  "nonce",
] as const);

export const V1_ADMITTED_CAPABILITY_CONSTRAINTS = Object.freeze([
  "bind_action",
  "bind_resource",
  "bind_request_hash",
  "nonce",
] as const);

export const V1_ADMITTED_AUTH_REPORTS = Object.freeze([
  "auth_report",
  "token_report",
  "jwt_validation_report",
  "oauth_security_report",
  "proof_report",
  "capability_token_report",
  "request_proof_report",
  "ai_guide",
] as const);

export function admitV1AuthProviderType(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_AUTH_PROVIDER_REQUIRED", "An auth_provider type is required.", "provider"),
    ]);
  }
  if ((V1_ADMITTED_AUTH_PROVIDER_TYPES as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_REFUSED_AUTH_PROVIDER_TYPES as readonly string[]).includes(token)) {
    return decide(token, "excluded_from_core", [
      refuseDiag(
        "Galerina_CORE_V1_AUTH_PROVIDER_EXCLUDED",
        "Identity, OIDC-provider and login products stay out of Galerina core.",
        "provider",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_AUTH_PROVIDER_UNKNOWN", "v1 auth_provider type is oauth2 only.", "provider"),
  ]);
}

export function admitV1AuthPolicyFamily(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_AUTH_POLICY_REQUIRED", "An auth_policy family name is required.", "auth_policy"),
    ]);
  }
  if ((V1_ADMITTED_AUTH_POLICY_FAMILIES as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_EXPERIMENTAL_AUTH_POLICY_FAMILIES as readonly string[]).includes(token)) {
    return decide(token, "post_v1", [
      refuseDiag(
        "Galerina_CORE_V1_AUTH_HARDWARE_EXPERIMENTAL",
        "hardware_proof is experimental and stays out of the v1 auth_policy freeze.",
        "auth_policy",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_AUTH_POLICY_UNKNOWN", "auth_policy family is not an admitted v1 family.", "auth_policy"),
  ]);
}

export function admitV1AuthTokenKind(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_AUTH_TOKEN_REQUIRED", "An auth token kind is required.", "token"),
    ]);
  }
  if ((V1_ADMITTED_AUTH_TOKEN_KINDS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_AUTH_TOKEN_UNKNOWN", "v1 auth token kinds are bearer and jwt only.", "token"),
  ]);
}

export function admitV1JwtAlgorithm(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_JWT_ALG_REQUIRED", "A JWT algorithm name is required.", "algorithm"),
    ]);
  }
  if ((V1_ADMITTED_JWT_ALGORITHMS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  if ((V1_REFUSED_JWT_ALGORITHMS as readonly string[]).includes(token)) {
    return decide(token, "excluded_from_core", [
      refuseDiag("Galerina_CORE_V1_JWT_ALG_NONE", "JWT algorithm none is denied.", "algorithm"),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_JWT_ALG_UNKNOWN",
      "v1 JWT algorithms are RS256, ES256 and EdDSA only.",
      "algorithm",
    ),
  ]);
}

export function admitV1JwtDiagnostic(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_JWT_DIAGNOSTIC_REQUIRED", "A JWT diagnostic name is required.", "jwt"),
    ]);
  }
  if ((V1_ADMITTED_JWT_DIAGNOSTICS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_JWT_DIAGNOSTIC_UNKNOWN",
      "JWT diagnostic is not in the closed docs/auth-token-verification-boundaries.md set.",
      "jwt",
    ),
  ]);
}

export function admitV1BearerDiagnostic(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_BEARER_DIAGNOSTIC_REQUIRED", "A bearer-token diagnostic name is required.", "bearer"),
    ]);
  }
  if ((V1_ADMITTED_BEARER_DIAGNOSTICS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_BEARER_DIAGNOSTIC_UNKNOWN",
      "Bearer diagnostics are logged, local_storage, client_safe and missing_expiry.",
      "bearer",
    ),
  ]);
}

export function admitV1OauthCheck(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_OAUTH_CHECK_REQUIRED", "An OAuth policy check name is required.", "oauth"),
    ]);
  }
  if ((V1_ADMITTED_OAUTH_CHECKS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_OAUTH_CHECK_UNKNOWN",
      "v1 OAuth checks are issuer, audience, scope, jwks and pkce.",
      "oauth",
    ),
  ]);
}

export function admitV1ProofOfPossession(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_POP_REQUIRED", "A proof-of-possession name is required.", "pop"),
    ]);
  }
  if ((V1_ADMITTED_PROOF_OF_POSSESSION as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_POP_UNKNOWN", "v1 proof-of-possession forms are dpop and mtls.", "pop"),
  ]);
}

export function admitV1ProofConstraint(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_PROOF_CONSTRAINT_REQUIRED", "A request-proof constraint is required.", "proof"),
    ]);
  }
  if ((V1_ADMITTED_PROOF_CONSTRAINTS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_PROOF_CONSTRAINT_UNKNOWN",
      "Request-proof constraints are bind_method, bind_path, bind_body, replay_cache and nonce.",
      "proof",
    ),
  ]);
}

export function admitV1CapabilityConstraint(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag(
        "Galerina_CORE_V1_CAPABILITY_CONSTRAINT_REQUIRED",
        "A capability-token constraint is required.",
        "capability",
      ),
    ]);
  }
  if ((V1_ADMITTED_CAPABILITY_CONSTRAINTS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_CAPABILITY_CONSTRAINT_UNKNOWN",
      "Capability constraints are bind_action, bind_resource, bind_request_hash and nonce.",
      "capability",
    ),
  ]);
}

export function admitV1AuthReport(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_AUTH_REPORT_REQUIRED", "An auth report name is required.", "report"),
    ]);
  }
  if ((V1_ADMITTED_AUTH_REPORTS as readonly string[]).includes(token)) {
    return decide(token, "admitted", []);
  }
  return decide(token, "unknown", [
    refuseDiag(
      "Galerina_CORE_V1_AUTH_REPORT_UNKNOWN",
      "Auth report is not in the closed v1 set; hardware_proof and crypto_policy reports stay out.",
      "report",
    ),
  ]);
}

export function claimProductionMaturity(input: ProductionMaturityClaim): V1ScopeDecision {
  const path = asToken(input.checklistPath) ?? "";
  if (path !== MATURITY_CHECKLIST_PATH) {
    return decide(path, "unknown", [
      refuseDiag(
        "Galerina_CORE_V1_MATURITY_CHECKLIST",
        "Production-maturity claims must use docs/language-core-maturity-roadmap.md as the checklist.",
        "checklistPath",
      ),
    ]);
  }
  if (input.claimed !== false) {
    return decide(path, "admitted", [
      refuseDiag(
        "Galerina_CORE_V1_MATURITY_CLAIM",
        "This package must not claim production maturity; the checklist is a gate, not a clearance.",
        "claimed",
      ),
    ]);
  }
  return decide(path, "admitted", []);
}

/**
 * API catalogs from docs/api-data-security-and-load-control.md and
 * docs/api-duplicate-detection-and-idempotency.md.
 * Parser/runtime stay with core-compiler, core-security, and the app kernel.
 * Post-quantum and hardware_proof stay post-v1 refuse.
 */
export const V1_ADMITTED_API_POLICY_FAMILIES = Object.freeze([
  "api_policy",
  "body_policy",
  "route_limits",
  "queue_handoff",
  "client_identity",
  "duplicate_detection",
  "idempotency",
  "reports",
] as const);

export const V1_ADMITTED_API_BODY_POLICY_FIELDS = Object.freeze([
  "content_type",
  "max_size",
  "parse_mode",
  "unknown_fields",
] as const);

export const V1_ADMITTED_API_PARSE_MODES = Object.freeze(["strict"] as const);

export const V1_ADMITTED_API_UNKNOWN_FIELD_POLICIES = Object.freeze(["deny"] as const);

export const V1_ADMITTED_API_BODY_DIAGNOSTICS = Object.freeze([
  "content_type_mismatch",
  "strict_body_decode",
  "unknown_field",
  "duplicate_key",
  "unsafe_coercion",
  "request_scoped_body_lifetime",
  "large_body_streaming",
] as const);

export const V1_ADMITTED_API_ROUTE_LIMITS = Object.freeze([
  "rate",
  "max_concurrent",
  "timeout",
  "memory",
] as const);

export const V1_ADMITTED_API_LOAD_DIAGNOSTICS = Object.freeze([
  "concurrency_pool_alignment",
  "trusted_proxy",
  "x_forwarded_for",
] as const);

export const V1_ADMITTED_API_DUPLICATE_DIAGNOSTICS = Object.freeze([
  "duplicate_route",
  "duplicate_route_name",
  "duplicate_schema_shape",
  "duplicate_external_client",
  "duplicate_outbound_payload",
  "api_version_conflict",
  "webhook_duplicate_event",
  "idempotency_payload_mismatch",
] as const);

export const V1_ADMITTED_API_SHAPE_MARKERS = Object.freeze([
  "intentionally_same_shape_as",
  "intentionally_same_base_as",
] as const);

export const V1_ADMITTED_IDEMPOTENCY_CONFLICTS = Object.freeze([
  "return_previous_response",
  "reject_duplicate",
  "hold_for_review",
  "raise_error",
] as const);

export const V1_ADMITTED_IDEMPOTENCY_EXCEPTIONS = Object.freeze([
  "not_required",
] as const);

export const V1_ADMITTED_IDEMPOTENCY_RECOMMENDATIONS = Object.freeze([
  "database.write",
  "network.outbound",
  "payment",
  "webhook",
] as const);

export const V1_ADMITTED_API_REPORTS = Object.freeze([
  "api_security_report",
  "api_memory_report",
  "load_control_report",
  "api_manifest",
  "duplicate_api_report",
  "idempotency_report",
  "ai_guide",
] as const);

export const V1_POST_CRYPTO_POLICY_REPORTS = Object.freeze([
  "crypto_policy_report",
  "hardware_proof_report",
  "pq_hybrid_report",
] as const);

export const V1_POST_PQ_WARNINGS = Object.freeze([
  "post_quantum",
  "hybrid",
] as const);

function admitCatalog(
  name: unknown,
  admitted: readonly string[],
  path: string,
  requiredCode: string,
  requiredMsg: string,
  unknownCode: string,
  unknownMsg: string,
): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [refuseDiag(requiredCode, requiredMsg, path)]);
  }
  if (admitted.includes(token)) return decide(token, "admitted", []);
  return decide(token, "unknown", [refuseDiag(unknownCode, unknownMsg, path)]);
}

export function admitV1ApiPolicyFamily(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_POLICY_FAMILIES, "api_policy",
    "Galerina_CORE_V1_API_POLICY_REQUIRED", "An api_policy family name is required.",
    "Galerina_CORE_V1_API_POLICY_UNKNOWN", "api_policy family is not an admitted v1 family.",
  );
}

export function admitV1ApiBodyPolicyField(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_BODY_POLICY_FIELDS, "body",
    "Galerina_CORE_V1_API_BODY_FIELD_REQUIRED", "A body-policy field name is required.",
    "Galerina_CORE_V1_API_BODY_FIELD_UNKNOWN", "Body-policy fields are content_type, max_size, parse_mode and unknown_fields.",
  );
}

export function admitV1ApiParseMode(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_PARSE_MODES, "parse_mode",
    "Galerina_CORE_V1_API_PARSE_MODE_REQUIRED", "A body parse_mode is required.",
    "Galerina_CORE_V1_API_PARSE_MODE_UNKNOWN", "v1 body parse_mode is strict only.",
  );
}

export function admitV1ApiUnknownFieldPolicy(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_UNKNOWN_FIELD_POLICIES, "unknown_fields",
    "Galerina_CORE_V1_API_UNKNOWN_FIELDS_REQUIRED", "An unknown_fields policy is required.",
    "Galerina_CORE_V1_API_UNKNOWN_FIELDS_UNKNOWN", "v1 unknown_fields policy is deny only.",
  );
}

export function admitV1ApiBodyDiagnostic(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_BODY_DIAGNOSTICS, "body_diagnostic",
    "Galerina_CORE_V1_API_BODY_DIAGNOSTIC_REQUIRED", "An API body diagnostic name is required.",
    "Galerina_CORE_V1_API_BODY_DIAGNOSTIC_UNKNOWN", "API body diagnostic is not in the closed load-control set.",
  );
}

export function admitV1ApiRouteLimit(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_ROUTE_LIMITS, "limits",
    "Galerina_CORE_V1_API_ROUTE_LIMIT_REQUIRED", "A route-limit name is required.",
    "Galerina_CORE_V1_API_ROUTE_LIMIT_UNKNOWN", "Route limits are rate, max_concurrent, timeout and memory.",
  );
}

export function admitV1ApiLoadDiagnostic(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_LOAD_DIAGNOSTICS, "load",
    "Galerina_CORE_V1_API_LOAD_DIAGNOSTIC_REQUIRED", "An API load diagnostic name is required.",
    "Galerina_CORE_V1_API_LOAD_DIAGNOSTIC_UNKNOWN", "Load diagnostics are concurrency_pool_alignment, trusted_proxy and x_forwarded_for.",
  );
}

export function admitV1ApiDuplicateDiagnostic(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_DUPLICATE_DIAGNOSTICS, "duplicate",
    "Galerina_CORE_V1_API_DUPLICATE_DIAGNOSTIC_REQUIRED", "An API duplicate diagnostic name is required.",
    "Galerina_CORE_V1_API_DUPLICATE_DIAGNOSTIC_UNKNOWN", "Duplicate diagnostic is not in the closed idempotency-doc set.",
  );
}

export function admitV1ApiShapeMarker(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_SHAPE_MARKERS, "shape",
    "Galerina_CORE_V1_API_SHAPE_MARKER_REQUIRED", "An intentional-shape marker is required.",
    "Galerina_CORE_V1_API_SHAPE_MARKER_UNKNOWN", "Shape markers are intentionally_same_shape_as and intentionally_same_base_as.",
  );
}

export function admitV1IdempotencyConflict(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_IDEMPOTENCY_CONFLICTS, "idempotency",
    "Galerina_CORE_V1_IDEMPOTENCY_CONFLICT_REQUIRED", "An idempotency conflict mode is required.",
    "Galerina_CORE_V1_IDEMPOTENCY_CONFLICT_UNKNOWN", "Conflict modes are return_previous_response, reject_duplicate, hold_for_review and raise_error.",
  );
}

export function admitV1IdempotencyException(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_IDEMPOTENCY_EXCEPTIONS, "idempotency",
    "Galerina_CORE_V1_IDEMPOTENCY_EXCEPTION_REQUIRED", "An idempotency exception token is required.",
    "Galerina_CORE_V1_IDEMPOTENCY_EXCEPTION_UNKNOWN", "v1 idempotency exception token is not_required only.",
  );
}

export function admitV1IdempotencyRecommendation(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_IDEMPOTENCY_RECOMMENDATIONS, "idempotency",
    "Galerina_CORE_V1_IDEMPOTENCY_RECOMMENDATION_REQUIRED", "An effect-based idempotency recommendation is required.",
    "Galerina_CORE_V1_IDEMPOTENCY_RECOMMENDATION_UNKNOWN", "Recommendations are database.write, network.outbound, payment and webhook.",
  );
}

export function admitV1ApiReport(name: unknown): V1ScopeDecision {
  return admitCatalog(
    name, V1_ADMITTED_API_REPORTS, "report",
    "Galerina_CORE_V1_API_REPORT_REQUIRED", "An API report name is required.",
    "Galerina_CORE_V1_API_REPORT_UNKNOWN", "API report is not in the closed v1 set.",
  );
}

export function admitV1CryptoPolicyReport(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_CRYPTO_REPORT_REQUIRED", "A crypto-policy report name is required.", "crypto"),
    ]);
  }
  if ((V1_POST_CRYPTO_POLICY_REPORTS as readonly string[]).includes(token)) {
    return decide(token, "post_v1", [
      refuseDiag(
        "Galerina_CORE_V1_CRYPTO_REPORT_POST",
        "crypto_policy, hardware_proof and pq_hybrid reports stay post-v1.",
        "crypto",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_CRYPTO_REPORT_UNKNOWN", "Crypto-policy report is not a recorded post-v1 token.", "crypto"),
  ]);
}

export function admitV1HardwareProofFlag(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_HARDWARE_PROOF_REQUIRED", "A hardware_proof flag name is required.", "hardware_proof"),
    ]);
  }
  if (token === "hardware_proof") {
    return decide(token, "post_v1", [
      refuseDiag(
        "Galerina_CORE_V1_AUTH_HARDWARE_EXPERIMENTAL",
        "hardware_proof is experimental and stays out of the v1 auth_policy freeze.",
        "hardware_proof",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_HARDWARE_PROOF_UNKNOWN", "Experimental hardware proof flag is hardware_proof only.", "hardware_proof"),
  ]);
}

export function admitV1PqWarning(name: unknown): V1ScopeDecision {
  const token = asToken(name);
  if (token === undefined) {
    return decide("", "unknown", [
      refuseDiag("Galerina_CORE_V1_PQ_WARNING_REQUIRED", "A post-quantum warning name is required.", "pq"),
    ]);
  }
  if ((V1_POST_PQ_WARNINGS as readonly string[]).includes(token)) {
    return decide(token, "post_v1", [
      refuseDiag(
        "Galerina_CORE_V1_PQ_WARNING_POST",
        "post_quantum and hybrid crypto-policy warnings stay post-v1.",
        "pq",
      ),
    ]);
  }
  return decide(token, "unknown", [
    refuseDiag("Galerina_CORE_V1_PQ_WARNING_UNKNOWN", "PQ warning tokens are post_quantum and hybrid.", "pq"),
  ]);
}
