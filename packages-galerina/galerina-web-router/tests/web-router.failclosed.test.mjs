// FUNGI-WEB fail-closed ACCEPTANCE tests — galerina-web-router (RD-0100 web-* fail-closed contract).
//
// Enforced by scripts/audit-web-stub-guard.mjs: a web-* implementation must be BORN fail-closed,
// so the moment src/ exists this file must too. Each test exercises a governance/
// web-failclosed-contract.json invariant (U1..U4) for THIS package and asserts the
// unknown -> DENY / deny-by-default behaviour — never that an unsafe target can navigate.
// Open-redirect (CWE-601) and href-XSS (CWE-79) are the risks: link generation is an allowlist.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateLinkTarget,
  validateRouteContract,
  validateRouteDataFetchContract,
  KNOWN_ROUTE_PARAM_VALIDATORS,
} from "../dist/index.js";

const errorCodes = (ds) => ds.filter((d) => d.severity === "error").map((d) => d.code);

const goodRoute = {
  name: "product-detail",
  pathTemplate: "/products/:productId",
  params: [{ name: "productId", validator: "uuid" }],
  dataFetch: {
    queryContractRef: "@galerina/data-query#FindProduct",
    responseContractRef: "@galerina/data-response#ProductResponse",
  },
};

describe("web-router fail-closed acceptance (FUNGI-WEB-020..022)", () => {
  it("U1 FUNGI-WEB-020 (CWE-20): a route param must be validated against the typed contract — an undeclared or unknown-validator param is DENIED", () => {
    // The four validator kinds are a closed set: URL input is attacker-controlled.
    assert.deepEqual([...KNOWN_ROUTE_PARAM_VALIDATORS].sort(), ["integer", "slug", "string", "uuid"]);
    // A template ":param" with no declared validator fails closed — no untyped param reaches a fetch/render.
    const undeclared = validateRouteContract({
      name: "orders",
      pathTemplate: "/orders/:orderId/items/:itemId",
      params: [{ name: "orderId", validator: "integer" }],
    });
    assert.deepEqual(errorCodes(undeclared), ["Galerina_WEB_ROUTER_PARAM_UNDECLARED"]);
    // An unknown validator kind is rejected, never defaulted to a permissive one.
    const unknownValidator = validateRouteContract({
      name: "product-detail",
      pathTemplate: "/products/:productId",
      params: [{ name: "productId", validator: "regex" }],
    });
    assert.deepEqual(errorCodes(unknownValidator), ["Galerina_WEB_ROUTER_PARAM_VALIDATOR_UNKNOWN"]);
    // The fetch side must name its typed data contracts; a route data fetch with no refs fails closed.
    const untypedFetch = validateRouteDataFetchContract({ queryContractRef: "", responseContractRef: "  " });
    assert.ok(errorCodes(untypedFetch).includes("Galerina_WEB_ROUTER_QUERY_CONTRACT_REF_REQUIRED"));
    assert.ok(errorCodes(untypedFetch).includes("Galerina_WEB_ROUTER_RESPONSE_CONTRACT_REF_REQUIRED"));
    // Clean: a fully-declared typed route passes the gate (it discriminates, it does not blanket-deny).
    assert.deepEqual(validateRouteContract(goodRoute), []);
  });

  it("U2 FUNGI-WEB-021 (CWE-601): a navigation target must resolve to an allowlisted destination — protocol-relative //host and cross-origin http are DENIED", () => {
    // "//evil.example" looks relative but navigates cross-origin: open-redirect, denied.
    assert.deepEqual(errorCodes(validateLinkTarget("//evil.example/pay")), ["Galerina_WEB_ROUTER_LINK_PROTOCOL_RELATIVE_FORBIDDEN"]);
    // http is localhost-only; an externally-controlled http host is not on the allowlist.
    assert.deepEqual(errorCodes(validateLinkTarget("http://evil.example/x")), ["Galerina_WEB_ROUTER_LINK_HTTP_REQUIRES_LOCALHOST"]);
    // Userinfo cannot smuggle a localhost prefix in front of the real host.
    assert.deepEqual(errorCodes(validateLinkTarget("http://localhost@evil.example/x")), ["Galerina_WEB_ROUTER_LINK_HTTP_REQUIRES_LOCALHOST"]);
    // Clean: same-origin relative paths, https, mailto and localhost http are the expressible outcomes.
    for (const href of ["/products/1", "./rel", "#frag", "https://example.com/docs", "mailto:hi@example.com", "http://localhost:3000/dev"]) {
      assert.deepEqual(errorCodes(validateLinkTarget(href)), [], href);
    }
  });

  it("U3 FUNGI-WEB-022 (CWE-79): executable and unknown schemes are DENIED by default — control-char evasion cannot slip past the gate", () => {
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"]) {
      assert.deepEqual(errorCodes(validateLinkTarget(href)), ["Galerina_WEB_ROUTER_LINK_SCHEME_FORBIDDEN"], href);
    }
    // Control characters/whitespace are stripped BEFORE scheme detection: "java\tscript:" is still forbidden.
    assert.deepEqual(errorCodes(validateLinkTarget("java\tscript:alert(1)")), ["Galerina_WEB_ROUTER_LINK_SCHEME_FORBIDDEN"]);
    assert.deepEqual(errorCodes(validateLinkTarget("java\nscript:alert(1)")), ["Galerina_WEB_ROUTER_LINK_SCHEME_FORBIDDEN"]);
    // Any scheme outside the allowlist is denied by default, not passed through.
    for (const href of ["ftp://host/file", "file:///etc/passwd", "app://open"]) {
      assert.deepEqual(errorCodes(validateLinkTarget(href)), ["Galerina_WEB_ROUTER_LINK_SCHEME_UNKNOWN"], href);
    }
  });

  it("U4 (unknown -> DENY): an empty or unrecognised target denies navigation rather than defaulting to allow", () => {
    assert.deepEqual(errorCodes(validateLinkTarget("   ")), ["Galerina_WEB_ROUTER_LINK_TARGET_REQUIRED"]);
    // An unrecognised scheme is the "unknown" case — it fails closed (SCHEME_UNKNOWN), never silently allowed.
    assert.deepEqual(errorCodes(validateLinkTarget("wss://evil.example/socket")), ["Galerina_WEB_ROUTER_LINK_SCHEME_UNKNOWN"]);
  });
});
