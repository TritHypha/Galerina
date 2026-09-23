import { test } from "node:test";
import assert from "node:assert/strict";
import { md, renderReceiptMarkdown } from "../dist/index.js";

test("hostile: source-controlled intent cannot inject markdown or HTML", () => {
  assert.equal(md("a|b"), "a\\|b");
  assert.equal(md("<script>"), "&lt;script&gt;");
  assert.equal(md("line\nbreak"), "line break");
  const rendered = renderReceiptMarkdown({
    flowName: "evil|flow",
    sourceFile: "x.fungi",
    qualifier: "secure",
    returnType: "Int",
    params: [],
    contract: {
      intent: 'leak\n<script>alert(1)</script> | **bold**',
      effects: ["storage.write"],
      authority: [],
      economicsHints: [],
      hasSecrets: false,
      hasEpilogue: false,
    },
    governance: { taintSources: [], sinkTypes: [], governanceCodes: [] },
    callees: [],
    tokenEstimate: { fullSourceTokens: 1, receiptTokens: 1, reductionPct: 0 },
    generatedAt: "2026-09-23T00:00:00.000Z",
  });
  assert.ok(rendered.includes("&lt;script&gt;"));
  assert.equal(rendered.includes("<script>"), false);
  assert.ok(rendered.includes("\\|"));
});
