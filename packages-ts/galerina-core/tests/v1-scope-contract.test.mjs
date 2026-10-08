import assert from "node:assert/strict";
import { describe, it } from "node:test";

import scope from "../dist/v1-scope-contract.js";

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
