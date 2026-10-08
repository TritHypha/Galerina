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
