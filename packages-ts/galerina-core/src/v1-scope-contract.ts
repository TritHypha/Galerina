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
