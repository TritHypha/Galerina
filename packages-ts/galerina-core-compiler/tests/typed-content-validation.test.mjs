import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkTypes,
  parseProgram,
  validateTypedContentBlock,
} from "../dist/index.js";

function typeErrors(source) {
  const parsed = parseProgram(source, "content.fungi");
  const parseErrors = parsed.diagnostics.filter((d) => d.severity === "error");
  if (parseErrors.length > 0) return parseErrors;
  return checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error");
}

describe("validateTypedContentBlock — type environment", () => {
  it("refuses a protected binding interpolated by type, not by name", () => {
    const diags = validateTypedContentBlock({
      blockType: "html",
      marker: "HTML",
      content: "<div>{{ token }}</div>\n",
      file: "content.fungi",
      startLine: 2,
      environment: { bindings: [{ name: "token", type: "protected String" }] },
    });
    assert.ok(
      diags.some((d) => d.code === "FUNGI-BLOCK-004"),
      `got ${diags.map((d) => d.code).join(",") || "(none)"}`,
    );
  });

  it("admits a binding named secret when its type is not protected", () => {
    const diags = validateTypedContentBlock({
      blockType: "html",
      marker: "HTML",
      content: "<div>{{ secret }}</div>\n",
      file: "content.fungi",
      startLine: 2,
      environment: { bindings: [{ name: "secret", type: "String" }] },
    });
    assert.equal(
      diags.some((d) => d.code === "FUNGI-BLOCK-004"),
      false,
      `name matching must not refuse String secret: ${diags.map((d) => d.code).join(",")}`,
    );
    assert.deepEqual(diags.map((d) => d.code), []);
  });

  it("refuses Secret and unbound interpolations, and unclosed {{", () => {
    const secret = validateTypedContentBlock({
      blockType: "script",
      marker: "SCRIPT",
      content: "window.x = {{ apiKey }};\n",
      file: "content.fungi",
      startLine: 2,
      environment: { bindings: [{ name: "apiKey", type: "Secret" }] },
    });
    assert.ok(secret.some((d) => d.code === "FUNGI-BLOCK-004"));

    const unbound = validateTypedContentBlock({
      blockType: "html",
      marker: "HTML",
      content: "<p>{{ missing }}</p>\n",
      file: "content.fungi",
      startLine: 2,
      environment: { bindings: [] },
    });
    assert.ok(unbound.some((d) => d.code === "FUNGI-BLOCK-005"));

    const unclosed = validateTypedContentBlock({
      blockType: "html",
      marker: "HTML",
      content: "<p>{{ title</p>\n",
      file: "content.fungi",
      startLine: 2,
      environment: { bindings: [{ name: "title", type: "String" }] },
    });
    assert.ok(unclosed.some((d) => d.code === "FUNGI-BLOCK-005"));
  });

  it("refuses closed injection constructs in html, script, and css", () => {
    const html = validateTypedContentBlock({
      blockType: "html",
      marker: "HTML",
      content: "<div onclick=\"x()\"></div>\n",
      file: "content.fungi",
      startLine: 2,
      environment: { bindings: [] },
    });
    assert.ok(html.some((d) => d.code === "FUNGI-BLOCK-006"));

    const script = validateTypedContentBlock({
      blockType: "script",
      marker: "SCRIPT",
      content: "eval(user);\n",
      file: "content.fungi",
      startLine: 2,
      environment: { bindings: [] },
    });
    assert.ok(script.some((d) => d.code === "FUNGI-BLOCK-006"));

    const css = validateTypedContentBlock({
      blockType: "css",
      marker: "CSS",
      content: "width: expression(alert(1));\n",
      file: "content.fungi",
      startLine: 2,
      environment: { bindings: [] },
    });
    assert.ok(css.some((d) => d.code === "FUNGI-BLOCK-006"));
  });
});

describe("checkTypes — typed content compiler wiring", () => {
  it("emits FUNGI-BLOCK-004 for protected interpolation in a flow", () => {
    const diags = typeErrors(`
pure flow render(token: protected String) -> String {
  html <<HTML
    <div>{{ token }}</div>
  HTML
  return "ok"
}
`);
    assert.ok(
      diags.some((d) => d.code === "FUNGI-BLOCK-004"),
      `got ${diags.map((d) => d.code).join(",") || "(none)"}`,
    );
  });

  it("does not emit FUNGI-BLOCK-004 for a String binding named secret", () => {
    const diags = typeErrors(`
pure flow render(secret: String) -> String {
  html <<HTML
    <div>{{ secret }}</div>
  HTML
  return "ok"
}
`);
    assert.equal(
      diags.some((d) => d.code === "FUNGI-BLOCK-004"),
      false,
      `name matching leaked: ${diags.map((d) => d.code + ":" + d.message).join(" | ")}`,
    );
  });
});
