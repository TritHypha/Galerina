import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lex, parseProgram } from "../dist/index.js";

describe("typed content block AST seam", () => {
  const source = `pure flow render() -> Html {
  html <<HTML
    <div>{secret}</div>
  HTML
  return "ok"
}`;

  it("preserves the block type, marker, and raw content", () => {
    const result = lex(source, "content.fungi");
    const token = result.tokens.find((candidate) => candidate.kind === "contentBlock");

    assert.ok(token, "expected one source-preserving contentBlock token");
    assert.deepEqual(token.contentBlock, {
      blockType: "html",
      marker: "HTML",
      content: "    <div>{secret}</div>\n",
      closed: true,
    });
    assert.deepEqual(result.diagnostics, []);
  });

  it("emits a typedContentBlockExpr node without treating embedded syntax as Fungi", () => {
    const result = parseProgram(source, "content.fungi");
    assert.deepEqual(result.diagnostics, []);

    const flowBlock = result.ast.children?.[0]?.children?.find((node) => node.kind === "block");
    const contentNode = flowBlock?.children?.[0];
    assert.equal(contentNode?.kind, "typedContentBlockExpr");
    assert.equal(contentNode?.blockType, "html");
    assert.equal(contentNode?.marker, "HTML");
    assert.equal(contentNode?.content, "    <div>{secret}</div>\n");
  });

  it("preserves the AST seam while refusing an unclosed block", () => {
    const result = parseProgram(
      "flow render() {\n  html <<HTML\n    <p>broken</p>\n}",
      "unclosed-content.fungi",
    );
    assert.ok(
      result.diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-BLOCK-002"),
      JSON.stringify(result.diagnostics),
    );
  });
});
