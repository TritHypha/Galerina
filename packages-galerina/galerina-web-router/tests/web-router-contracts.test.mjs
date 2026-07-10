import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_ROUTE_PARAM_VALIDATORS,
  WEB_ROUTER_CHECKS,
  createWebRouteReport,
  deriveWebRouterReportStatus,
  validateLinkTarget,
  validateRouteContract,
  validateRouteDataFetchContract,
  validateRoutePreloadPolicy,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const goodRoute = {
  name: "product-detail",
  pathTemplate: "/products/:productId",
  params: [{ name: "productId", validator: "uuid" }],
  dataFetch: {
    queryContractRef: "@galerina/data-query#FindProduct",
    responseContractRef: "@galerina/data-response#ProductResponse",
  },
};

const goodPreload = { maxPreloadRoutes: 5 };

describe("typed routes — every :param declares a validator", () => {
  it("declares exactly the four param validator kinds", () => {
    assert.deepEqual(KNOWN_ROUTE_PARAM_VALIDATORS, [
      "string",
      "integer",
      "uuid",
      "slug",
    ]);
  });

  it("accepts a route whose template params are all declared", () => {
    assert.deepEqual(codes(validateRouteContract(goodRoute)), []);
  });

  it("ERRORS on a template param with no declared validator", () => {
    const diags = validateRouteContract({
      name: "orders",
      pathTemplate: "/orders/:orderId/items/:itemId",
      params: [{ name: "orderId", validator: "integer" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_PARAM_UNDECLARED"]);
    assert.equal(diags[0].severity, "error");
    assert.match(diags[0].message, /:itemId/);
  });

  it("WARNS on a declared param the template never uses", () => {
    const diags = validateRouteContract({
      name: "orders",
      pathTemplate: "/orders/:orderId",
      params: [
        { name: "orderId", validator: "integer" },
        { name: "legacyId", validator: "string" },
      ],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_PARAM_UNUSED"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects an unknown validator kind instead of defaulting it", () => {
    const diags = validateRouteContract({
      ...goodRoute,
      params: [{ name: "productId", validator: "regex" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_PARAM_VALIDATOR_UNKNOWN"]);
  });

  it("rejects duplicate and unnamed param declarations", () => {
    const diags = validateRouteContract({
      name: "r",
      pathTemplate: "/x/:a",
      params: [
        { name: "a", validator: "string" },
        { name: "a", validator: "integer" },
        { name: " ", validator: "string" },
      ],
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_ROUTER_PARAM_DUPLICATE",
      "Galerina_WEB_ROUTER_PARAM_NAME_REQUIRED",
    ]);
  });

  it("requires a route name and a path template", () => {
    const diags = validateRouteContract({
      name: " ",
      pathTemplate: "",
      params: [],
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_ROUTER_PATH_TEMPLATE_REQUIRED",
      "Galerina_WEB_ROUTER_ROUTE_NAME_REQUIRED",
    ]);
  });

  it("rejects a ':' segment with no parameter name", () => {
    const diags = validateRouteContract({
      name: "r",
      pathTemplate: "/x/:",
      params: [],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_PATH_PARAM_MALFORMED"]);
  });
});

describe("route-level data fetch — typed query/response refs required", () => {
  it("requires non-empty query and response contract references", () => {
    const diags = validateRouteDataFetchContract({
      queryContractRef: "",
      responseContractRef: "  ",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_ROUTER_QUERY_CONTRACT_REF_REQUIRED",
      "Galerina_WEB_ROUTER_RESPONSE_CONTRACT_REF_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });

  it("surfaces data fetch diagnostics through the route validator", () => {
    const diags = validateRouteContract({
      ...goodRoute,
      dataFetch: { queryContractRef: " ", responseContractRef: "x#Y" },
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_QUERY_CONTRACT_REF_REQUIRED"]);
  });
});

describe("safe link generation — deny-by-default scheme allowlist", () => {
  it("accepts relative targets, https, localhost http and mailto", () => {
    for (const href of [
      "/products/1",
      "./relative",
      "../up",
      "#section",
      "?page=2",
      "products/nested",
      "https://example.com/docs",
      "mailto:hello@example.com",
      "http://localhost:3000/dev",
      "http://127.0.0.1/dev",
      "http://[::1]:8080/dev",
    ]) {
      assert.deepEqual(codes(validateLinkTarget(href)), [], href);
    }
  });

  it("REJECTS javascript:, data: and vbscript: schemes as errors", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      const diags = validateLinkTarget(href);
      assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_LINK_SCHEME_FORBIDDEN"], href);
      assert.equal(diags[0].severity, "error");
    }
  });

  it("strips control characters before scheme detection (no evasion)", () => {
    const diags = validateLinkTarget("java\tscript:alert(1)");
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_LINK_SCHEME_FORBIDDEN"]);
  });

  it("REJECTS unknown schemes by default", () => {
    for (const href of ["ftp://host/file", "file:///etc/passwd", "app://open"]) {
      const diags = validateLinkTarget(href);
      assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_LINK_SCHEME_UNKNOWN"], href);
    }
  });

  it("REJECTS protocol-relative targets (they look relative, navigate cross-origin)", () => {
    const diags = validateLinkTarget("//evil.example/pay");
    assert.deepEqual(codes(diags), [
      "Galerina_WEB_ROUTER_LINK_PROTOCOL_RELATIVE_FORBIDDEN",
    ]);
    assert.equal(diags[0].severity, "error");
  });

  it("restricts cleartext http to localhost hosts only", () => {
    const diags = validateLinkTarget("http://evil.example/x");
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_LINK_HTTP_REQUIRES_LOCALHOST"]);
  });

  it("is not fooled by userinfo in front of the real host", () => {
    const diags = validateLinkTarget("http://localhost@evil.example/x");
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_LINK_HTTP_REQUIRES_LOCALHOST"]);
  });

  it("requires a non-empty link target", () => {
    const diags = validateLinkTarget("   ");
    assert.deepEqual(codes(diags), ["Galerina_WEB_ROUTER_LINK_TARGET_REQUIRED"]);
  });
});

describe("preload policy — bounded", () => {
  it("accepts a positive integer bound", () => {
    assert.deepEqual(codes(validateRoutePreloadPolicy(goodPreload)), []);
  });

  it("requires a positive integer maxPreloadRoutes", () => {
    for (const maxPreloadRoutes of [0, -1, 1.5, Number.NaN]) {
      const diags = validateRoutePreloadPolicy({ maxPreloadRoutes });
      assert.deepEqual(
        codes(diags),
        ["Galerina_WEB_ROUTER_PRELOAD_BOUND_REQUIRED"],
        String(maxPreloadRoutes),
      );
    }
  });
});

describe("createWebRouteReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for clean routes and links", () => {
    const report = createWebRouteReport({
      routes: [goodRoute],
      links: ["/products/1", "https://example.com"],
      preload: goodPreload,
    });
    assert.equal(report.routeCount, 1);
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_ROUTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("fails the links check when a javascript: link is generated", () => {
    const report = createWebRouteReport({
      routes: [goodRoute],
      links: ["javascript:alert(1)"],
      preload: goodPreload,
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_WEB_ROUTER_LINK_SCHEME_FORBIDDEN",
    ]);
    assert.equal(report.checks.links, "fail");
    assert.equal(report.checks.routes, "pass");
    assert.equal(report.checks.dataFetch, "pass");
    assert.equal(report.checks.preload, "pass");
  });

  it("fails routes, dataFetch and preload checks from their own diagnostics", () => {
    const report = createWebRouteReport({
      routes: [
        {
          name: "broken",
          pathTemplate: "/x/:id",
          params: [],
          dataFetch: { queryContractRef: "", responseContractRef: "" },
        },
      ],
      preload: { maxPreloadRoutes: 0 },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_WEB_ROUTER_PARAM_UNDECLARED",
      "Galerina_WEB_ROUTER_PRELOAD_BOUND_REQUIRED",
      "Galerina_WEB_ROUTER_QUERY_CONTRACT_REF_REQUIRED",
      "Galerina_WEB_ROUTER_RESPONSE_CONTRACT_REF_REQUIRED",
    ]);
    assert.equal(report.checks.routes, "fail");
    assert.equal(report.checks.dataFetch, "fail");
    assert.equal(report.checks.preload, "fail");
    assert.equal(report.checks.links, "pass");
  });

  it("reports partial with warning messages for an unused declared param", () => {
    const report = createWebRouteReport({
      routes: [
        {
          name: "orders",
          pathTemplate: "/orders/:orderId",
          params: [
            { name: "orderId", validator: "integer" },
            { name: "legacyId", validator: "string" },
          ],
        },
      ],
      preload: goodPreload,
    });
    assert.equal(report.status, "partial");
    assert.deepEqual(codes(report.diagnostics), ["Galerina_WEB_ROUTER_PARAM_UNUSED"]);
    assert.deepEqual(report.warnings, [report.diagnostics[0].message]);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_ROUTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveWebRouterReportStatus([]), "success");
    assert.equal(
      deriveWebRouterReportStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveWebRouterReportStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});
