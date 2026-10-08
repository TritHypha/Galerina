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
