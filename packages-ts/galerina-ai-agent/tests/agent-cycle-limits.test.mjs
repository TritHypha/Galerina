// Runs in its own process: agent-declaration.js is the FIRST module loaded, so a
// reintroduced runtime dependency on index.js evaluation order would surface here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { lowerAgentDeclaration, parseAgentDeclarations } from "../dist/agent-declaration.js";

const SOURCE = `agent Reviewer {
  input Diff
  output Review
  limits {
    timeout 30s
    memory 64mb
    max_tool_calls 5
  }
}`;
const base = () => ({ ...parseAgentDeclarations(SOURCE).declarations[0] });

describe("ai-agent import cycle removed", () => {
  it("agent-declaration and agent-validation import nothing from index.js at runtime", () => {
    for (const file of ["agent-declaration.js", "agent-validation.js"]) {
      const js = readFileSync(new URL(`../dist/${file}`, import.meta.url), "utf8");
      assert.ok(!/from\s+["']\.\/index\.js["']/.test(js), `${file} must not import ./index.js at runtime`);
    }
  });

  it("works when agent-declaration.js is loaded before index.js", () => {
    const lowered = lowerAgentDeclaration(base());
    assert.ok(lowered.definition, JSON.stringify(lowered.diagnostics));
    assert.deepEqual(Object.keys(lowered.definition.limits).sort(), ["maxToolCalls", "memoryBytes", "timeoutMs"]);
    assert.equal(lowered.definition.limits.maxToolCalls, 5);
  });
});

describe("lowerAgentDeclaration: strict limits on hand-built nodes", () => {
  it("refuses unknown limit keys and never copies them into the definition", () => {
    const node = base();
    const lowered = lowerAgentDeclaration({ ...node, limits: { ...node.limits, sandbox: "off" } });
    assert.equal(lowered.definition, undefined);
    assert.ok(lowered.diagnostics.some((d) => d.code === "Galerina_AGENT_DECL_LIMIT_UNKNOWN" && d.path === "limits"));
    assert.ok(!JSON.stringify(lowered.diagnostics).includes("sandbox"));
  });

  it("refuses non-integer, string, infinite and non-record limits", () => {
    const node = base();
    for (const [key, value] of [["timeoutMs", "5000"], ["memoryBytes", 1.5], ["maxToolCalls", Infinity], ["maxTokens", 2.5], ["rateLimitPerMinute", Number.NaN]]) {
      const lowered = lowerAgentDeclaration({ ...node, limits: { ...node.limits, [key]: value } });
      assert.equal(lowered.definition, undefined, key);
      assert.ok(lowered.diagnostics.some((d) => d.code === "Galerina_AGENT_DECL_LIMIT_INVALID" && d.path === `limits.${key}`), key);
    }
    for (const limits of [null, [], "limits"]) {
      assert.equal(lowerAgentDeclaration({ ...node, limits }).definition, undefined, String(limits));
    }
  });
});

describe("lowerAgentDeclaration: non-positive limits stay with validateAgentLimits", () => {
  it("a negative maxTokens is refused once, by the definition validator", () => {
    const node = base();
    const lowered = lowerAgentDeclaration({ ...node, limits: { ...node.limits, maxTokens: -1 } });
    assert.equal(lowered.definition, undefined);
    assert.deepEqual(lowered.diagnostics.map((d) => d.code), ["Galerina_AGENT_MAX_TOKENS_INVALID"]);
  });
});

describe("lowerAgentDeclaration: exact node and tool shape", () => {
  it("refuses unknown keys on the node and on tool entries without echoing them", () => {
    const node = base();
    for (const bad of [{ ...node, model: "gpt-x" }, { ...node, tools: [{ tool: "repo.read", decision: "allow", sudo: true }] }]) {
      const lowered = lowerAgentDeclaration(bad);
      assert.equal(lowered.definition, undefined);
      assert.ok(lowered.diagnostics.some((d) => d.code === "Galerina_AGENT_DECL_FIELD_UNKNOWN"));
      assert.ok(!/gpt-x|sudo/.test(JSON.stringify(lowered.diagnostics)));
    }
  });

  it("a parser-produced node still lowers, and tools carry only tool/decision/scope", () => {
    const node = base();
    const lowered = lowerAgentDeclaration({ ...node, tools: [{ tool: "repo.read", decision: "allow", scope: "./src" }] });
    assert.ok(lowered.definition, JSON.stringify(lowered.diagnostics));
    assert.deepEqual(Object.keys(lowered.definition.tools[0]).sort(), ["decision", "scope", "tool"]);
  });
});
