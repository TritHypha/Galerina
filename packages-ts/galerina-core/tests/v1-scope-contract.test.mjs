import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import scope from "../dist/v1-scope-contract.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const {
  V1_SCOPE_SCHEMA,
  V1_ADMITTED_TARGETS,
  V1_POST_TARGETS,
  V1_POST_DOMAIN_PACKAGES,
  EXCLUDED_FROM_CORE,
  MATURITY_CHECKLIST_PATH,
  classifyV1Scope,
  admitV1CoreTarget,
  admitV1CorePackage,
  claimProductionMaturity,
  V1_CORE_LOGIC_TYPES,
  V1_POST_SYNTAX_FAMILIES,
  V1_WASM_TARGET_CONTRACT_SCHEMA,
  admitV1CoreLogicType,
  admitV1SyntaxFamily,
  admitV1WasmTargetContract,
  admitV1BindingKind,
  admitV1Visibility,
  admitV1MatchForm,
  admitV1PatternFamily,
  admitV1ConsoleMode,
  admitV1LanguageForm,
  V1_ADMITTED_BINDINGS,
  V1_ADMITTED_VISIBILITY,
  V1_ADMITTED_MATCH_FORMS,
  V1_ADMITTED_PATTERN_FAMILIES,
  V1_ADMITTED_CONSOLE_MODES,
  V1_EXCLUDED_LANGUAGE_FORMS,
  V1_CPU_TARGET_CONTRACT_SCHEMA,
  V1_ADMITTED_COMPUTE_SELECTORS,
  V1_POST_COMPUTE_SELECTORS,
  V1_TARGET_PLUGIN_NONE_SCHEMA,
  admitV1CpuTargetContract,
  admitV1ComputeSelector,
  admitV1TargetPluginBoundary,
  V1_ADMITTED_TEST_KINDS,
  V1_ADMITTED_TEST_ASSERTIONS,
  V1_ADMITTED_VECTOR_ORDER,
  V1_DEFAULT_VECTOR_ORDER,
  admitV1TestKind,
  admitV1TestAssertion,
  admitV1VectorOrder,
  V1_ADMITTED_COMPILER_LANGUAGES,
  V1_ADMITTED_COMPILER_FOLDERS,
  V1_ADMITTED_SYNTAX_DOC_DIRS,
  V1_HISTORICAL_SYNTAX_DOC_DIRS,
  V1_ADMITTED_SYNTAX_EXAMPLE_FILES,
  admitV1CompilerImplementationLanguage,
  admitV1CompilerFolder,
  admitV1SyntaxDocsDir,
  admitV1SyntaxExampleFile,
  V1_ADMITTED_AUTH_PROVIDER_TYPES,
  V1_ADMITTED_AUTH_POLICY_FAMILIES,
  V1_ADMITTED_AUTH_TOKEN_KINDS,
  V1_ADMITTED_JWT_ALGORITHMS,
  V1_ADMITTED_JWT_DIAGNOSTICS,
  V1_ADMITTED_BEARER_DIAGNOSTICS,
  V1_ADMITTED_OAUTH_CHECKS,
  V1_ADMITTED_PROOF_OF_POSSESSION,
  V1_ADMITTED_PROOF_CONSTRAINTS,
  V1_ADMITTED_CAPABILITY_CONSTRAINTS,
  V1_ADMITTED_AUTH_REPORTS,
  admitV1AuthProviderType,
  admitV1AuthPolicyFamily,
  admitV1AuthTokenKind,
  admitV1JwtAlgorithm,
  admitV1JwtDiagnostic,
  admitV1BearerDiagnostic,
  admitV1OauthCheck,
  admitV1ProofOfPossession,
  admitV1ProofConstraint,
  admitV1CapabilityConstraint,
  admitV1AuthReport,
  V1_ADMITTED_API_POLICY_FAMILIES,
  V1_ADMITTED_API_BODY_POLICY_FIELDS,
  V1_ADMITTED_API_BODY_DIAGNOSTICS,
  V1_ADMITTED_API_ROUTE_LIMITS,
  V1_ADMITTED_API_LOAD_DIAGNOSTICS,
  V1_ADMITTED_API_DUPLICATE_DIAGNOSTICS,
  V1_ADMITTED_IDEMPOTENCY_CONFLICTS,
  V1_ADMITTED_IDEMPOTENCY_RECOMMENDATIONS,
  V1_ADMITTED_API_REPORTS,
  V1_POST_CRYPTO_POLICY_REPORTS,
  V1_POST_PQ_WARNINGS,
  admitV1ApiPolicyFamily,
  admitV1ApiBodyPolicyField,
  admitV1ApiParseMode,
  admitV1ApiUnknownFieldPolicy,
  admitV1ApiBodyDiagnostic,
  admitV1ApiRouteLimit,
  admitV1ApiLoadDiagnostic,
  admitV1ApiDuplicateDiagnostic,
  admitV1ApiShapeMarker,
  admitV1IdempotencyConflict,
  admitV1IdempotencyException,
  admitV1IdempotencyRecommendation,
  admitV1ApiReport,
  admitV1CryptoPolicyReport,
  admitV1HardwareProofFlag,
  admitV1PqWarning,
} = scope;

const codes = (d) => d.diagnostics.map((x) => x.code).sort();

describe("v1 core target scope", () => {
  it("admits only cpu and wasm", () => {
    assert.deepEqual([...V1_ADMITTED_TARGETS], ["cpu", "wasm"]);
    assert.equal(admitV1CoreTarget("cpu").status, "ADMITTED");
    assert.equal(admitV1CoreTarget("wasm").v1Core, true);
    assert.equal(admitV1CoreTarget("cpu").schema, V1_SCOPE_SCHEMA);
    assert.equal(classifyV1Scope("cpu"), "admitted");
  });

  it("refuses GPU, AI accelerator, photonic and optical I/O as post-v1", () => {
    for (const target of ["gpu", "ai_accelerator", "photonic", "optical_io"]) {
      const d = admitV1CoreTarget(target);
      assert.equal(d.status, "REFUSED", target);
      assert.equal(d.scopeClass, "post_v1", target);
      assert.ok(codes(d).includes("Galerina_CORE_V1_TARGET_POST"), target);
    }
    assert.ok(V1_POST_TARGETS.includes("gpu"));
  });

  it("refuses dart, flutter, node, browser and framework adapters as post-v1", () => {
    for (const target of ["dart", "flutter", "javascript_esm", "node", "browser", "react", "angular"]) {
      const d = admitV1CoreTarget(target);
      assert.equal(d.status, "REFUSED", target);
      assert.equal(d.scopeClass, "post_v1", target);
    }
  });

  it("refuses unknown and empty targets", () => {
    const unknown = admitV1CoreTarget("cuda");
    assert.equal(unknown.status, "REFUSED");
    assert.ok(codes(unknown).includes("Galerina_CORE_V1_TARGET_UNKNOWN"));
    const empty = admitV1CoreTarget("  ");
    assert.equal(empty.status, "REFUSED");
    assert.ok(codes(empty).includes("Galerina_CORE_V1_TARGET_REQUIRED"));
  });
});

describe("non-essential package freeze and keep-out families", () => {
  it("freezes image, video, search, text_ai, device and flutter_ui expansion", () => {
    for (const name of V1_POST_DOMAIN_PACKAGES) {
      const d = admitV1CorePackage(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "post_v1", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_PACKAGE_FROZEN"), name);
    }
  });

  it("keeps camera, microphone, Bluetooth, GPS, notifications, media players and mobile UI out of core", () => {
    for (const name of ["camera", "microphone", "bluetooth", "gps", "notifications", "media_players", "mobile_ui"]) {
      const d = admitV1CorePackage(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "excluded_from_core", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_PACKAGE_EXCLUDED"), name);
    }
  });

  it("keeps summarisation, generation, embeddings, moderation, translation and NLP out of core", () => {
    for (const name of ["summarisation", "generation", "embeddings", "moderation", "translation", "nlp"]) {
      const d = admitV1CorePackage(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "excluded_from_core", name);
    }
  });

  it("keeps identity providers, login products, MFA products and new crypto algorithms out of core", () => {
    for (const name of ["identity_providers", "login_products", "mfa_products", "new_crypto_algorithms"]) {
      const d = admitV1CorePackage(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "excluded_from_core", name);
    }
  });

  it("keeps web frameworks, load balancers, API gateways, queue backends and rate-limit stores out of core", () => {
    for (const name of ["web_frameworks", "load_balancers", "api_gateways", "queue_backends", "rate_limit_stores"]) {
      const d = admitV1CorePackage(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "excluded_from_core", name);
    }
  });

  it("keeps fixed routers, controller frameworks, middleware stacks and idempotency storage out of core", () => {
    for (const name of ["fixed_routers", "controller_frameworks", "middleware_stacks", "idempotency_storage"]) {
      const d = admitV1CorePackage(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "excluded_from_core", name);
    }
    assert.ok(EXCLUDED_FROM_CORE.includes("api_gateways"));
  });
});

describe("maturity checklist", () => {
  it("refuses a production-maturity claim even with the canonical checklist path", () => {
    const d = claimProductionMaturity({
      checklistPath: MATURITY_CHECKLIST_PATH,
      claimed: true,
    });
    assert.equal(d.status, "REFUSED");
    assert.ok(codes(d).includes("Galerina_CORE_V1_MATURITY_CLAIM"));
  });

  it("refuses a mismatched checklist path", () => {
    const d = claimProductionMaturity({
      checklistPath: "docs/other.md",
      claimed: false,
    });
    assert.equal(d.status, "REFUSED");
    assert.ok(codes(d).includes("Galerina_CORE_V1_MATURITY_CHECKLIST"));
  });

  it("records the checklist without claiming production maturity", () => {
    const d = claimProductionMaturity({
      checklistPath: "docs/language-core-maturity-roadmap.md",
      claimed: false,
    });
    assert.equal(d.status, "ADMITTED");
    assert.deepEqual(d.diagnostics, []);
  });
});

describe("v1 core logic types", () => {
  it("admits Bool, Tri, Decision, Option and Result only", () => {
    assert.deepEqual([...V1_CORE_LOGIC_TYPES], ["Bool", "Tri", "Decision", "Option", "Result"]);
    for (const name of V1_CORE_LOGIC_TYPES) {
      const d = admitV1CoreLogicType(name);
      assert.equal(d.status, "ADMITTED", name);
      assert.equal(d.v1Core, true, name);
    }
  });

  it("refuses Decimal, Float, Verdict and empty names", () => {
    for (const name of ["Decimal", "Float", "Verdict", "Int"]) {
      const d = admitV1CoreLogicType(name);
      assert.equal(d.status, "REFUSED", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_LOGIC_TYPE_UNKNOWN"), name);
    }
    const empty = admitV1CoreLogicType("  ");
    assert.equal(empty.status, "REFUSED");
    assert.ok(codes(empty).includes("Galerina_CORE_V1_LOGIC_TYPE_REQUIRED"));
  });
});

describe("post-v1 syntax refuse", () => {
  it("admits cpu and wasm syntax families", () => {
    assert.equal(admitV1SyntaxFamily("cpu").status, "ADMITTED");
    assert.equal(admitV1SyntaxFamily("wasm").status, "ADMITTED");
  });

  it("refuses dart, wavelength, onnx, DOM and NLP as post-v1 or excluded", () => {
    for (const name of ["dart", "wavelength", "onnx", "dom_event", "gpu", "image"]) {
      const d = admitV1SyntaxFamily(name);
      assert.equal(d.status, "REFUSED", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_SYNTAX_POST"), name);
      assert.ok(V1_POST_SYNTAX_FAMILIES.includes(name), name);
    }
    const nlp = admitV1SyntaxFamily("nlp");
    assert.equal(nlp.status, "REFUSED");
    assert.ok(codes(nlp).includes("Galerina_CORE_V1_SYNTAX_POST") || codes(nlp).includes("Galerina_CORE_V1_SYNTAX_EXCLUDED"));
  });
});

describe("v1 wasm target contract", () => {
  it("admits the closed wasm syntax/report schema and refuses others", () => {
    const ok = admitV1WasmTargetContract(V1_WASM_TARGET_CONTRACT_SCHEMA);
    assert.equal(ok.status, "ADMITTED");
    const bad = admitV1WasmTargetContract("galerina.core.v1-gpu-target.v1");
    assert.equal(bad.status, "REFUSED");
    assert.ok(codes(bad).includes("Galerina_CORE_V1_WASM_CONTRACT_UNKNOWN"));
  });
});
describe("v1 binding keywords", () => {
  it("admits let, mut and readonly", () => {
    assert.deepEqual([...V1_ADMITTED_BINDINGS], ["let", "mut", "readonly"]);
    for (const name of V1_ADMITTED_BINDINGS) {
      assert.equal(admitV1BindingKind(name).status, "ADMITTED", name);
    }
  });

  it("refuses var and const", () => {
    for (const name of ["var", "const"]) {
      const d = admitV1BindingKind(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "excluded_from_core", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_BINDING_EXCLUDED"), name);
    }
    const empty = admitV1BindingKind(" ");
    assert.equal(empty.status, "REFUSED");
    assert.ok(codes(empty).includes("Galerina_CORE_V1_BINDING_REQUIRED"));
  });
});

describe("v1 visibility catalog", () => {
  it("admits private, module, package and public only", () => {
    assert.deepEqual([...V1_ADMITTED_VISIBILITY], ["private", "module", "package", "public"]);
    for (const name of V1_ADMITTED_VISIBILITY) {
      assert.equal(admitV1Visibility(name).status, "ADMITTED", name);
    }
    const d = admitV1Visibility("export");
    assert.equal(d.status, "REFUSED");
    assert.ok(codes(d).includes("Galerina_CORE_V1_VISIBILITY_UNKNOWN"));
  });
});

describe("v1 match form", () => {
  it("admits match and refuses switch/case", () => {
    assert.deepEqual([...V1_ADMITTED_MATCH_FORMS], ["match"]);
    assert.equal(admitV1MatchForm("match").status, "ADMITTED");
    for (const name of ["switch", "case"]) {
      const d = admitV1MatchForm(name);
      assert.equal(d.status, "REFUSED", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_MATCH_EXCLUDED"), name);
    }
  });
});

describe("v1 pattern family production gate", () => {
  it("admits Pattern identity and refuses UnsafeRegex", () => {
    assert.deepEqual([...V1_ADMITTED_PATTERN_FAMILIES], ["Pattern"]);
    assert.equal(admitV1PatternFamily("Pattern").status, "ADMITTED");
    for (const name of ["UnsafeRegex", "javascript_regexp"]) {
      const d = admitV1PatternFamily(name);
      assert.equal(d.status, "REFUSED", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_PATTERN_UNSAFE"), name);
    }
  });
});

describe("v1 console mode", () => {
  it("admits run/dev debug sinks and refuses production", () => {
    assert.deepEqual([...V1_ADMITTED_CONSOLE_MODES], ["run", "dev"]);
    assert.equal(admitV1ConsoleMode("run").status, "ADMITTED");
    assert.equal(admitV1ConsoleMode("dev").status, "ADMITTED");
    const prod = admitV1ConsoleMode("production");
    assert.equal(prod.status, "REFUSED");
    assert.ok(codes(prod).includes("Galerina_CORE_V1_CONSOLE_PRODUCTION"));
  });
});

describe("excluded language forms", () => {
  it("keeps classes, inheritance and raw object dumps out of core", () => {
    assert.deepEqual([...V1_EXCLUDED_LANGUAGE_FORMS], ["classes", "inheritance", "raw_object_dump"]);
    for (const name of V1_EXCLUDED_LANGUAGE_FORMS) {
      const d = admitV1LanguageForm(name);
      assert.equal(d.status, "REFUSED", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_LANGUAGE_FORM_EXCLUDED"), name);
    }
  });
});

describe("v1 cpu target contract", () => {
  it("admits only galerina.core.v1-cpu-target.v1", () => {
    assert.equal(V1_CPU_TARGET_CONTRACT_SCHEMA, "galerina.core.v1-cpu-target.v1");
    assert.equal(admitV1CpuTargetContract(V1_CPU_TARGET_CONTRACT_SCHEMA).status, "ADMITTED");
    const unknown = admitV1CpuTargetContract("galerina.core.v1-wasm-target.v1");
    assert.equal(unknown.status, "REFUSED");
    assert.ok(codes(unknown).includes("Galerina_CORE_V1_CPU_CONTRACT_UNKNOWN"));
    const empty = admitV1CpuTargetContract("");
    assert.equal(empty.status, "REFUSED");
    assert.ok(codes(empty).includes("Galerina_CORE_V1_CPU_CONTRACT_REQUIRED"));
  });
});

describe("v1 compute selector", () => {
  it("admits cpu and wasm; refuses auto, best and accelerator selectors", () => {
    assert.deepEqual([...V1_ADMITTED_COMPUTE_SELECTORS], ["cpu", "wasm"]);
    for (const name of V1_ADMITTED_COMPUTE_SELECTORS) {
      assert.equal(admitV1ComputeSelector(name).status, "ADMITTED", name);
    }
    for (const name of V1_POST_COMPUTE_SELECTORS) {
      const d = admitV1ComputeSelector(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "post_v1", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_COMPUTE_SELECTOR_POST"), name);
    }
  });
});

describe("v1 target plugin boundary", () => {
  it("admits only the closed none-plugin schema", () => {
    assert.equal(V1_TARGET_PLUGIN_NONE_SCHEMA, "galerina.core.v1-target-plugin-none.v1");
    assert.equal(admitV1TargetPluginBoundary(V1_TARGET_PLUGIN_NONE_SCHEMA).status, "ADMITTED");
    const plugin = admitV1TargetPluginBoundary("galerina.core.v1-target-plugin.v1");
    assert.equal(plugin.status, "REFUSED");
    assert.equal(plugin.scopeClass, "post_v1");
    assert.ok(codes(plugin).includes("Galerina_CORE_V1_PLUGIN_POST"));
  });
});
describe("v1 test kinds", () => {
  it("admits the closed docs/testing.md kinds and refuses memory_safety", () => {
    assert.deepEqual([...V1_ADMITTED_TEST_KINDS], [
      "unit", "integration", "api", "webhook", "json_validation", "security",
      "diagnostic_format", "target_fallback", "source_map", "ai_context",
      "type_checker", "compiler_report",
    ]);
    for (const name of V1_ADMITTED_TEST_KINDS) {
      assert.equal(admitV1TestKind(name).status, "ADMITTED", name);
    }
    const memory = admitV1TestKind("memory_safety");
    assert.equal(memory.status, "REFUSED");
    assert.ok(codes(memory).includes("Galerina_CORE_V1_TEST_KIND_UNKNOWN"));
    const empty = admitV1TestKind("");
    assert.equal(empty.status, "REFUSED");
    assert.ok(codes(empty).includes("Galerina_CORE_V1_TEST_KIND_REQUIRED"));
  });
});

describe("v1 test assertions", () => {
  it("admits the closed docs/testing.md assertions", () => {
    assert.deepEqual([...V1_ADMITTED_TEST_ASSERTIONS], [
      "expected_success",
      "expected_diagnostics",
      "expected_target_fallback",
      "expected_source_map_location",
      "expected_generated_report_fields",
    ]);
    for (const name of V1_ADMITTED_TEST_ASSERTIONS) {
      assert.equal(admitV1TestAssertion(name).status, "ADMITTED", name);
    }
    const unknown = admitV1TestAssertion("expected_timeout");
    assert.equal(unknown.status, "REFUSED");
    assert.ok(codes(unknown).includes("Galerina_CORE_V1_TEST_ASSERTION_UNKNOWN"));
  });
});

describe("v1 vector order policy", () => {
  it("admits preserve_order and unordered; default is preserve_order", () => {
    assert.equal(V1_DEFAULT_VECTOR_ORDER, "preserve_order");
    assert.deepEqual([...V1_ADMITTED_VECTOR_ORDER], ["preserve_order", "unordered"]);
    for (const name of V1_ADMITTED_VECTOR_ORDER) {
      assert.equal(admitV1VectorOrder(name).status, "ADMITTED", name);
    }
    const reorder = admitV1VectorOrder("reorder");
    assert.equal(reorder.status, "REFUSED");
    assert.ok(codes(reorder).includes("Galerina_CORE_V1_VECTOR_ORDER_UNKNOWN"));
  });
});

describe("v1 compiler implementation language", () => {
  it("admits typescript_contracts and cjs_prototype only", () => {
    assert.deepEqual([...V1_ADMITTED_COMPILER_LANGUAGES], ["typescript_contracts", "cjs_prototype"]);
    for (const name of V1_ADMITTED_COMPILER_LANGUAGES) {
      assert.equal(admitV1CompilerImplementationLanguage(name).status, "ADMITTED", name);
    }
    const rust = admitV1CompilerImplementationLanguage("rust");
    assert.equal(rust.status, "REFUSED");
    assert.ok(codes(rust).includes("Galerina_CORE_V1_COMPILER_LANGUAGE_UNKNOWN"));
    const empty = admitV1CompilerImplementationLanguage("");
    assert.equal(empty.status, "REFUSED");
    assert.ok(codes(empty).includes("Galerina_CORE_V1_COMPILER_LANGUAGE_REQUIRED"));
  });
});

describe("v1 compiler folder structure", () => {
  it("admits the closed scaffold folders and they exist on disk", () => {
    assert.deepEqual([...V1_ADMITTED_COMPILER_FOLDERS], [
      "compiler", "src", "tests", "grammar", "schemas", "docs", "examples",
    ]);
    for (const name of V1_ADMITTED_COMPILER_FOLDERS) {
      assert.equal(admitV1CompilerFolder(name).status, "ADMITTED", name);
      assert.ok(existsSync(join(packageRoot, name)), name);
    }
    const dist = admitV1CompilerFolder("dist");
    assert.equal(dist.status, "REFUSED");
    assert.ok(codes(dist).includes("Galerina_CORE_V1_COMPILER_FOLDER_UNKNOWN"));
  });
});

describe("v1 syntax example files", () => {
  it("admits live docs/syntax paths and refuses the historical sytax spelling", () => {
    assert.deepEqual([...V1_ADMITTED_SYNTAX_DOC_DIRS], ["docs/syntax", "docs/syntax-examples"]);
    for (const name of V1_ADMITTED_SYNTAX_DOC_DIRS) {
      assert.equal(admitV1SyntaxDocsDir(name).status, "ADMITTED", name);
      assert.ok(existsSync(join(packageRoot, name)), name);
    }
    for (const name of V1_HISTORICAL_SYNTAX_DOC_DIRS) {
      const d = admitV1SyntaxDocsDir(name);
      assert.equal(d.status, "REFUSED", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_SYNTAX_DIR_HISTORICAL"), name);
    }
  });

  it("admits the README example files and they exist under both live folders", () => {
    assert.equal(V1_ADMITTED_SYNTAX_EXAMPLE_FILES.length, 10);
    for (const name of V1_ADMITTED_SYNTAX_EXAMPLE_FILES) {
      assert.equal(admitV1SyntaxExampleFile(name).status, "ADMITTED", name);
      assert.ok(existsSync(join(packageRoot, "docs", "syntax-examples", name)), name);
      assert.ok(existsSync(join(packageRoot, "docs", "syntax", name)), name);
    }
    const missing = admitV1SyntaxExampleFile("let-binding.md");
    assert.equal(missing.status, "REFUSED");
    assert.ok(codes(missing).includes("Galerina_CORE_V1_SYNTAX_EXAMPLE_UNKNOWN"));
  });
});

describe("v1 auth provider and policy", () => {
  it("admits oauth2 and refuses identity/OIDC/login products", () => {
    assert.deepEqual([...V1_ADMITTED_AUTH_PROVIDER_TYPES], ["oauth2"]);
    assert.equal(admitV1AuthProviderType("oauth2").status, "ADMITTED");
    const idp = admitV1AuthProviderType("identity_provider");
    assert.equal(idp.status, "REFUSED");
    assert.ok(codes(idp).includes("Galerina_CORE_V1_AUTH_PROVIDER_EXCLUDED"));
    const empty = admitV1AuthProviderType("");
    assert.equal(empty.status, "REFUSED");
    assert.ok(codes(empty).includes("Galerina_CORE_V1_AUTH_PROVIDER_REQUIRED"));
  });

  it("admits the closed auth_policy families and parks hardware_proof", () => {
    assert.deepEqual([...V1_ADMITTED_AUTH_POLICY_FAMILIES], [
      "bearer", "jwt", "oauth2", "proof_of_possession", "capability_tokens", "reports",
    ]);
    for (const name of V1_ADMITTED_AUTH_POLICY_FAMILIES) {
      assert.equal(admitV1AuthPolicyFamily(name).status, "ADMITTED", name);
    }
    const hw = admitV1AuthPolicyFamily("hardware_proof");
    assert.equal(hw.status, "REFUSED");
    assert.equal(hw.scopeClass, "post_v1");
    assert.ok(codes(hw).includes("Galerina_CORE_V1_AUTH_HARDWARE_EXPERIMENTAL"));
  });

  it("admits bearer and jwt token kinds", () => {
    assert.deepEqual([...V1_ADMITTED_AUTH_TOKEN_KINDS], ["bearer", "jwt"]);
    assert.equal(admitV1AuthTokenKind("bearer").status, "ADMITTED");
    assert.equal(admitV1AuthTokenKind("session_cookie").status, "REFUSED");
  });
});

describe("v1 JWT algorithms and diagnostics", () => {
  it("admits RS256 ES256 EdDSA and denies alg none", () => {
    assert.deepEqual([...V1_ADMITTED_JWT_ALGORITHMS], ["RS256", "ES256", "EdDSA"]);
    for (const name of V1_ADMITTED_JWT_ALGORITHMS) {
      assert.equal(admitV1JwtAlgorithm(name).status, "ADMITTED", name);
    }
    const none = admitV1JwtAlgorithm("none");
    assert.equal(none.status, "REFUSED");
    assert.ok(codes(none).includes("Galerina_CORE_V1_JWT_ALG_NONE"));
    const hs = admitV1JwtAlgorithm("HS256");
    assert.equal(hs.status, "REFUSED");
    assert.ok(codes(hs).includes("Galerina_CORE_V1_JWT_ALG_UNKNOWN"));
  });

  it("admits the closed JWT diagnostic set including unverified_claim_use", () => {
    assert.ok(V1_ADMITTED_JWT_DIAGNOSTICS.includes("alg_none"));
    assert.ok(V1_ADMITTED_JWT_DIAGNOSTICS.includes("unverified_claim_use"));
    for (const name of V1_ADMITTED_JWT_DIAGNOSTICS) {
      assert.equal(admitV1JwtDiagnostic(name).status, "ADMITTED", name);
    }
    const extra = admitV1JwtDiagnostic("weak_secret");
    assert.equal(extra.status, "REFUSED");
    assert.ok(codes(extra).includes("Galerina_CORE_V1_JWT_DIAGNOSTIC_UNKNOWN"));
  });
});

describe("v1 bearer, OAuth, proof and reports", () => {
  it("admits bearer SecureString diagnostics", () => {
    assert.deepEqual([...V1_ADMITTED_BEARER_DIAGNOSTICS], [
      "logged", "local_storage", "client_safe", "missing_expiry",
    ]);
    for (const name of V1_ADMITTED_BEARER_DIAGNOSTICS) {
      assert.equal(admitV1BearerDiagnostic(name).status, "ADMITTED", name);
    }
  });

  it("admits OAuth issuer audience scope jwks pkce checks", () => {
    assert.deepEqual([...V1_ADMITTED_OAUTH_CHECKS], ["issuer", "audience", "scope", "jwks", "pkce"]);
    for (const name of V1_ADMITTED_OAUTH_CHECKS) {
      assert.equal(admitV1OauthCheck(name).status, "ADMITTED", name);
    }
    const device = admitV1OauthCheck("device_code");
    assert.equal(device.status, "REFUSED");
    assert.ok(codes(device).includes("Galerina_CORE_V1_OAUTH_CHECK_UNKNOWN"));
  });

  it("admits DPoP and mTLS only", () => {
    assert.deepEqual([...V1_ADMITTED_PROOF_OF_POSSESSION], ["dpop", "mtls"]);
    assert.equal(admitV1ProofOfPossession("dpop").status, "ADMITTED");
    assert.equal(admitV1ProofOfPossession("mtls").status, "ADMITTED");
    const puf = admitV1ProofOfPossession("photonic_puf");
    assert.equal(puf.status, "REFUSED");
    assert.ok(codes(puf).includes("Galerina_CORE_V1_POP_UNKNOWN"));
  });

  it("admits request-proof and capability constraints including nonce/replay_cache", () => {
    assert.ok(V1_ADMITTED_PROOF_CONSTRAINTS.includes("replay_cache"));
    assert.ok(V1_ADMITTED_PROOF_CONSTRAINTS.includes("nonce"));
    for (const name of V1_ADMITTED_PROOF_CONSTRAINTS) {
      assert.equal(admitV1ProofConstraint(name).status, "ADMITTED", name);
    }
    for (const name of V1_ADMITTED_CAPABILITY_CONSTRAINTS) {
      assert.equal(admitV1CapabilityConstraint(name).status, "ADMITTED", name);
    }
  });

  it("admits the closed auth report set and refuses hardware/crypto_policy reports", () => {
    assert.ok(V1_ADMITTED_AUTH_REPORTS.includes("auth_report"));
    assert.ok(V1_ADMITTED_AUTH_REPORTS.includes("token_report"));
    assert.ok(V1_ADMITTED_AUTH_REPORTS.includes("proof_report"));
    assert.ok(V1_ADMITTED_AUTH_REPORTS.includes("ai_guide"));
    for (const name of V1_ADMITTED_AUTH_REPORTS) {
      assert.equal(admitV1AuthReport(name).status, "ADMITTED", name);
    }
    const hw = admitV1AuthReport("hardware_proof_report");
    assert.equal(hw.status, "REFUSED");
    assert.ok(codes(hw).includes("Galerina_CORE_V1_AUTH_REPORT_UNKNOWN"));
    const pq = admitV1AuthReport("crypto_policy_report");
    assert.equal(pq.status, "REFUSED");
    assert.ok(codes(pq).includes("Galerina_CORE_V1_AUTH_REPORT_UNKNOWN"));
  });
});

describe("v1 API body policy and load-control catalogs", () => {
  it("admits api_policy families from the load-control and duplicate-detection docs", () => {
    assert.deepEqual([...V1_ADMITTED_API_POLICY_FAMILIES], [
      "api_policy", "body_policy", "route_limits", "queue_handoff",
      "client_identity", "duplicate_detection", "idempotency", "reports",
    ]);
    for (const name of V1_ADMITTED_API_POLICY_FAMILIES) {
      assert.equal(admitV1ApiPolicyFamily(name).status, "ADMITTED", name);
    }
    const gw = admitV1ApiPolicyFamily("api_gateway");
    assert.equal(gw.status, "REFUSED");
    assert.ok(codes(gw).includes("Galerina_CORE_V1_API_POLICY_UNKNOWN"));
  });

  it("admits body-policy fields, strict parse_mode and deny unknown_fields", () => {
    assert.deepEqual([...V1_ADMITTED_API_BODY_POLICY_FIELDS], [
      "content_type", "max_size", "parse_mode", "unknown_fields",
    ]);
    for (const name of V1_ADMITTED_API_BODY_POLICY_FIELDS) {
      assert.equal(admitV1ApiBodyPolicyField(name).status, "ADMITTED", name);
    }
    assert.equal(admitV1ApiParseMode("strict").status, "ADMITTED");
    assert.equal(admitV1ApiParseMode("loose").status, "REFUSED");
    assert.equal(admitV1ApiUnknownFieldPolicy("deny").status, "ADMITTED");
    assert.equal(admitV1ApiUnknownFieldPolicy("allow").status, "REFUSED");
  });

  it("admits closed body diagnostics and route limits including memory budget name", () => {
    for (const name of V1_ADMITTED_API_BODY_DIAGNOSTICS) {
      assert.equal(admitV1ApiBodyDiagnostic(name).status, "ADMITTED", name);
    }
    const sniff = admitV1ApiBodyDiagnostic("content_sniff");
    assert.equal(sniff.status, "REFUSED");
    assert.ok(codes(sniff).includes("Galerina_CORE_V1_API_BODY_DIAGNOSTIC_UNKNOWN"));
    assert.deepEqual([...V1_ADMITTED_API_ROUTE_LIMITS], [
      "rate", "max_concurrent", "timeout", "memory",
    ]);
    for (const name of V1_ADMITTED_API_ROUTE_LIMITS) {
      assert.equal(admitV1ApiRouteLimit(name).status, "ADMITTED", name);
    }
    for (const name of V1_ADMITTED_API_LOAD_DIAGNOSTICS) {
      assert.equal(admitV1ApiLoadDiagnostic(name).status, "ADMITTED", name);
    }
    const xff = admitV1ApiLoadDiagnostic("x_forwarded_for");
    assert.equal(xff.status, "ADMITTED");
    const spoof = admitV1ApiLoadDiagnostic("trust_all_proxies");
    assert.equal(spoof.status, "REFUSED");
  });
});

describe("v1 API duplicate, idempotency and report catalogs", () => {
  it("admits duplicate diagnostics and intentional-shape markers", () => {
    for (const name of V1_ADMITTED_API_DUPLICATE_DIAGNOSTICS) {
      assert.equal(admitV1ApiDuplicateDiagnostic(name).status, "ADMITTED", name);
    }
    assert.equal(admitV1ApiShapeMarker("intentionally_same_shape_as").status, "ADMITTED");
    assert.equal(admitV1ApiShapeMarker("intentionally_same_base_as").status, "ADMITTED");
    const extra = admitV1ApiDuplicateDiagnostic("duplicate_controller");
    assert.equal(extra.status, "REFUSED");
    assert.ok(codes(extra).includes("Galerina_CORE_V1_API_DUPLICATE_DIAGNOSTIC_UNKNOWN"));
  });

  it("admits idempotency conflict modes, not_required exception and effect recommendations", () => {
    assert.deepEqual([...V1_ADMITTED_IDEMPOTENCY_CONFLICTS], [
      "return_previous_response", "reject_duplicate", "hold_for_review", "raise_error",
    ]);
    for (const name of V1_ADMITTED_IDEMPOTENCY_CONFLICTS) {
      assert.equal(admitV1IdempotencyConflict(name).status, "ADMITTED", name);
    }
    assert.equal(admitV1IdempotencyException("not_required").status, "ADMITTED");
    assert.equal(admitV1IdempotencyException("skip").status, "REFUSED");
    for (const name of V1_ADMITTED_IDEMPOTENCY_RECOMMENDATIONS) {
      assert.equal(admitV1IdempotencyRecommendation(name).status, "ADMITTED", name);
    }
  });

  it("admits closed API report set including manifest, duplicate, load-control and ai_guide", () => {
    assert.deepEqual([...V1_ADMITTED_API_REPORTS], [
      "api_security_report", "api_memory_report", "load_control_report",
      "api_manifest", "duplicate_api_report", "idempotency_report", "ai_guide",
    ]);
    for (const name of V1_ADMITTED_API_REPORTS) {
      assert.equal(admitV1ApiReport(name).status, "ADMITTED", name);
    }
    const store = admitV1ApiReport("rate_limit_store_report");
    assert.equal(store.status, "REFUSED");
    assert.ok(codes(store).includes("Galerina_CORE_V1_API_REPORT_UNKNOWN"));
  });
});

describe("v1 post-quantum and hardware_proof stay post-v1", () => {
  it("refuses crypto_policy, hardware_proof and pq_hybrid reports as post-v1", () => {
    for (const name of V1_POST_CRYPTO_POLICY_REPORTS) {
      const d = admitV1CryptoPolicyReport(name);
      assert.equal(d.status, "REFUSED", name);
      assert.equal(d.scopeClass, "post_v1", name);
      assert.ok(codes(d).includes("Galerina_CORE_V1_CRYPTO_REPORT_POST"), name);
    }
    const extra = admitV1CryptoPolicyReport("kyber_report");
    assert.equal(extra.status, "REFUSED");
    assert.ok(codes(extra).includes("Galerina_CORE_V1_CRYPTO_REPORT_UNKNOWN"));
  });

  it("refuses hardware_proof flag and post_quantum/hybrid warnings as post-v1", () => {
    const hw = admitV1HardwareProofFlag("hardware_proof");
    assert.equal(hw.status, "REFUSED");
    assert.equal(hw.scopeClass, "post_v1");
    assert.ok(codes(hw).includes("Galerina_CORE_V1_AUTH_HARDWARE_EXPERIMENTAL"));
    const pq = admitV1PqWarning("post_quantum");
    const hybrid = admitV1PqWarning("hybrid");
    assert.equal(pq.status, "REFUSED");
    assert.equal(hybrid.status, "REFUSED");
    assert.equal(pq.scopeClass, "post_v1");
    assert.ok(codes(pq).includes("Galerina_CORE_V1_PQ_WARNING_POST"));
  });
});
