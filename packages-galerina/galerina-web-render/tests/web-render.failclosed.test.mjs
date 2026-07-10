// FUNGI-WEB fail-closed ACCEPTANCE tests — galerina-web-render (RD-0100 web-* fail-closed contract).
//
// Enforced by scripts/audit-web-stub-guard.mjs: a web-* implementation must be BORN fail-closed,
// so the moment src/ exists this file must too. Each test exercises a governance/
// web-failclosed-contract.json invariant (R1..R6) for THIS package and asserts the
// unknown -> DENY / deny-by-default behaviour — never that unsafe content can render.
// XSS is the highest risk here (CWE-79); the render gate is the whole family's sanitiser choke point.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  validateRenderableContent,
  createDomUpdateReport,
  KNOWN_RENDERABLE_CONTENT_KINDS,
} from "../dist/index.js";

const errorCodes = (ds) => ds.filter((d) => d.severity === "error").map((d) => d.code);

describe("web-render fail-closed acceptance (FUNGI-WEB-001..003)", () => {
  it("R1/R6 (CWE-79): the renderable union is text|safe_html ONLY — a smuggled raw_html kind fails closed", () => {
    assert.deepEqual([...KNOWN_RENDERABLE_CONTENT_KINDS].sort(), ["safe_html", "text"]);
    // R3/R6 FUNGI-WEB-002: an untyped caller smuggling { kind: "raw_html" } is DENIED, not rendered.
    const raw = validateRenderableContent({ kind: "raw_html", value: "<script>alert(1)</script>" });
    assert.deepEqual(errorCodes(raw), ["Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN"]);
    // R6: any unknown content classification -> DENY (never assumed safe).
    const unknown = validateRenderableContent({ kind: "marquee" });
    assert.deepEqual(errorCodes(unknown), ["Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN"]);
  });

  it("R1 (CWE-79): plain text is a first-class escaped kind — there is no unescaped-text path to opt into", () => {
    // Text carrying markup is accepted as TEXT (escaped by construction), not as HTML.
    assert.deepEqual(validateRenderableContent({ kind: "text", value: "<b>literal, not markup</b>" }), []);
  });

  it("R2 FUNGI-WEB-001 (CWE-79/116): SafeHtml without a sanitize-policy ref is DENIED — unsanitised HTML cannot pass the gate", () => {
    const unsanitised = validateRenderableContent({ kind: "safe_html", sanitizePolicyRef: "   " });
    assert.deepEqual(errorCodes(unsanitised), ["Galerina_WEB_RENDER_SANITIZE_POLICY_REF_REQUIRED"]);
    // Only a named data-html sanitiser policy admits HTML — the impl consumes the shipped
    // sanitiser gate by reference (reuseMandate), it does not fork a sanitiser.
    assert.deepEqual(
      validateRenderableContent({ kind: "safe_html", sanitizePolicyRef: "@galerina/data-html#ArticlePolicy" }),
      [],
    );
  });

  it("R5 FUNGI-WEB-003: an unsafe-render decision surfaces in the report and forces status=failed — never a silent unsafe render", () => {
    const report = createDomUpdateReport({
      target: "#app",
      plan: { name: "p", stateContractRef: "@galerina/web-state#ProductPageState", maxPatchOps: 100 },
      content: [{ kind: "raw_html", value: "<img src=x onerror=alert(1)>" }],
      counts: { nodesCreated: 0, nodesUpdated: 0, nodesRemoved: 0 },
    });
    assert.equal(report.status, "failed");
    assert.equal(report.checks.contentGate, "fail");
    assert.ok(report.diagnostics.some((d) => d.code === "Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN"));
  });
});
