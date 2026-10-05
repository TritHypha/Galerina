import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_DECLARATION_SCHEMA,
  MAX_AGENT_SOURCE_BYTES,
  lowerAgentDeclaration,
  parseAgentDeclarations,
  validateAgentDefinition,
} from "../dist/index.js";

const codes = (result) => result.diagnostics.map((d) => d.code);

const CANONICAL = `// reviewer agents
agent DocumentationAgent {
  input ProjectReviewRequest
  output AgentResult
  tools {
    document.read allow "./docs" // docs only
    repo.read allow "./src"
    security.scan allow
    shell deny
    network deny
  }
  effects [filesystem_read]
  permissions [
    project.read,
    file.propose_change,
    report.read
  ]
  failure return_typed_error
  limits {
    timeout 30s
    memory 128mb
    max_tool_calls 50
    max_tokens 12000
    rate_limit_per_minute 60
  }
}
`;

describe("agent declaration syntax (reference parser)", () => {
  it("parses the canonical form into a frozen compiler-facing node", () => {
    const result = parseAgentDeclarations(CANONICAL);
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.declarations.length, 1);
    const node = result.declarations[0];
    assert.equal(node.kind, "AgentDeclaration");
    assert.equal(node.schema, AGENT_DECLARATION_SCHEMA);
    assert.equal(node.name, "DocumentationAgent");
    assert.deepEqual(node.span, { line: 2, endLine: 26 });
    assert.equal(node.inputType, "ProjectReviewRequest");
    assert.equal(node.outputType, "AgentResult");
    assert.deepEqual(node.tools, [
      { tool: "document.read", decision: "allow", scope: "./docs" },
      { tool: "repo.read", decision: "allow", scope: "./src" },
      { tool: "security.scan", decision: "allow" },
      { tool: "shell", decision: "deny" },
      { tool: "network", decision: "deny" },
    ]);
    assert.deepEqual(node.effects, ["filesystem_read"]);
    assert.deepEqual(node.permissions, ["project.read", "file.propose_change", "report.read"]);
    assert.equal(node.failureBehaviour, "return_typed_error");
    assert.deepEqual(node.limits, {
      timeoutMs: 30_000,
      memoryBytes: 128 * 1_048_576,
      maxToolCalls: 50,
      maxTokens: 12_000,
      rateLimitPerMinute: 60,
    });
    assert.ok(Object.isFrozen(node) && Object.isFrozen(node.tools) && Object.isFrozen(node.limits));
  });

  it("lowers to an AgentDefinition that passes validateAgentDefinition", () => {
    const node = parseAgentDeclarations(CANONICAL).declarations[0];
    const lowered = lowerAgentDeclaration(node);
    assert.deepEqual(lowered.diagnostics, []);
    assert.equal(lowered.definition.name, "DocumentationAgent");
    assert.deepEqual(lowered.definition.limits, node.limits);
    assert.deepEqual(validateAgentDefinition(lowered.definition), []);
  });

  it("accepts the parallel-compute doc examples; failure defaults to fail_group", () => {
    const source = `agent DocumentationAgent {
  input ProjectReviewRequest
  output AgentResult

  tools {
    document.read allow "./docs"
    repo.read allow "./src"
    shell deny
    network deny
  }

  limits {
    timeout 30s
    memory 128mb
    max_tool_calls 50
  }
}

agent SecurityAgent {
  input ProjectReviewRequest
  output AgentResult

  tools {
    repo.read allow "./src"
    security.scan allow
    dependency.scan allow
    shell deny
  }

  effects [filesystem_read]

  limits {
    timeout 45s
    memory 256mb
    max_tool_calls 100
  }
}`;
    const result = parseAgentDeclarations(source);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.declarations.map((d) => [d.name, d.failureBehaviour, d.limits.timeoutMs]), [
      ["DocumentationAgent", "fail_group", 30_000],
      ["SecurityAgent", "fail_group", 45_000],
    ]);
  });

  it("refuses the MULTI_AGENT_RUNTIME draft clauses (model, visibility, deny, tools list, max_steps)", () => {
    const result = parseAgentDeclarations(`agent CodeAgent {
  model "best:code"
  input CodeTask
  output CodePatch
  visibility PublicProjectContext
  deny [
    file.write_direct
  ]
  tools [
    ProjectRead
  ]
  limits {
    max_steps 8
    timeout 60s
    memory 64mb
    max_tool_calls 8
  }
}`);
    assert.equal(result.declarations.length, 0);
    const found = codes(result);
    assert.ok(found.filter((c) => c === "Galerina_AGENT_DECL_CLAUSE_UNKNOWN").length >= 4, found.join(","));
    assert.ok(found.includes("Galerina_AGENT_DECL_LIMIT_UNKNOWN"));
  });

  it("requires input, output and the three core limits", () => {
    const missing = parseAgentDeclarations(`agent Bare {
}`);
    assert.equal(missing.declarations.length, 0);
    assert.deepEqual(codes(missing), [
      "Galerina_AGENT_DECL_CLAUSE_REQUIRED",
      "Galerina_AGENT_DECL_CLAUSE_REQUIRED",
      "Galerina_AGENT_DECL_CLAUSE_REQUIRED",
    ]);
    const partial = parseAgentDeclarations(`agent Partial {
  input A
  output B
  limits {
    timeout 5s
  }
}`);
    assert.equal(partial.declarations.length, 0);
    assert.equal(codes(partial).filter((c) => c === "Galerina_AGENT_DECL_CLAUSE_REQUIRED").length, 2);
  });

  it("refuses hostile or wildcard tool scopes and scoped denies", () => {
    for (const scope of ["../secrets", "./a/../../b", "/etc", "C:\\\\Users", "./src/*", "https://evil.example", ""]) {
      const result = parseAgentDeclarations(`agent T {
  input A
  output B
  tools {
    repo.read allow "${scope}"
  }
  limits {
    timeout 1s
    memory 1mb
    max_tool_calls 1
  }
}`);
      assert.equal(result.declarations.length, 0, scope);
      assert.deepEqual(codes(result), ["Galerina_AGENT_DECL_TOOL_SCOPE_INVALID"], scope);
    }
    const scopedDeny = parseAgentDeclarations(`agent T {
  input A
  output B
  tools {
    shell deny "./bin"
  }
  limits {
    timeout 1s
    memory 1mb
    max_tool_calls 1
  }
}`);
    assert.deepEqual(codes(scopedDeny), ["Galerina_AGENT_DECL_TOOL_SCOPE_INVALID"]);
  });

  it("drops an agent whose tool is both allowed and denied", () => {
    const result = parseAgentDeclarations(`agent T {
  input A
  output B
  tools {
    shell allow
    shell deny
  }
  limits {
    timeout 1s
    memory 1mb
    max_tool_calls 1
  }
}`);
    assert.equal(result.declarations.length, 0);
    assert.deepEqual(codes(result), ["Galerina_AGENT_TOOL_PERMISSION_CONFLICT"]);
    assert.match(result.diagnostics[0].path, /^line:1\.tools\.1$/);
  });

  it("refuses duplicate clauses, limits, list items and agent names", () => {
    const result = parseAgentDeclarations(`agent T {
  input A
  input A
  output B
  effects [a, a]
  limits {
    timeout 1s
    timeout 2s
    memory 1mb
    max_tool_calls 1
  }
}
agent T {
  input A
  output B
  limits {
    timeout 1s
    memory 1mb
    max_tool_calls 1
  }
}`);
    assert.equal(result.declarations.length, 0);
    assert.deepEqual(codes(result), [
      "Galerina_AGENT_DECL_CLAUSE_DUPLICATE",
      "Galerina_AGENT_DECL_LIST_INVALID",
      "Galerina_AGENT_DECL_CLAUSE_DUPLICATE",
      "Galerina_AGENT_DECL_NAME_DUPLICATE",
    ]);
  });

  it("parses limit units strictly", () => {
    const limitsOf = (timeout, memory, calls = "1") => parseAgentDeclarations(`agent T {
  input A
  output B
  limits {
    timeout ${timeout}
    memory ${memory}
    max_tool_calls ${calls}
  }
}`);
    assert.deepEqual(limitsOf("500ms", "64kb").declarations[0].limits, { timeoutMs: 500, memoryBytes: 65_536, maxToolCalls: 1 });
    assert.deepEqual(limitsOf("2m", "1gb").declarations[0].limits, { timeoutMs: 120_000, memoryBytes: 1_073_741_824, maxToolCalls: 1 });
    for (const [t, m, c] of [["30", "1mb", "1"], ["0s", "1mb", "1"], ["1h", "1mb", "1"], ["1s", "128", "1"], ["1s", "1tb", "1"], ["1s", "1mb", "5s"], ["1s", "1mb", "0"], ["-1s", "1mb", "1"], ["1.5s", "1mb", "1"]]) {
      const result = limitsOf(t, m, c);
      assert.equal(result.declarations.length, 0, `${t} ${m} ${c}`);
      assert.ok(codes(result).includes("Galerina_AGENT_DECL_LIMIT_INVALID"), `${t} ${m} ${c}`);
    }
  });

  it("never echoes source text in diagnostics", () => {
    const result = parseAgentDeclarations(`agent T {
  api_key "sk-live-SECRET123"
  input SECRETTYPE_lower
}
agent sk_live_SECRET456 {
}
password=SECRET789`);
    assert.equal(result.declarations.length, 0);
    assert.doesNotMatch(JSON.stringify(result.diagnostics), /SECRET|sk-live|sk_live|password/);
  });

  it("reports unterminated agents and blocks", () => {
    assert.deepEqual(codes(parseAgentDeclarations(`agent T {
  input A`)), ["Galerina_AGENT_DECL_UNTERMINATED"]);
    const tools = parseAgentDeclarations(`agent T {
  input A
  output B
  tools {
    shell deny`);
    assert.ok(codes(tools).includes("Galerina_AGENT_DECL_UNTERMINATED"));
  });

  it("refuses oversize source and stray top-level lines", () => {
    assert.deepEqual(codes(parseAgentDeclarations("x".repeat(MAX_AGENT_SOURCE_BYTES + 1))), ["Galerina_AGENT_DECL_LIMIT_EXCEEDED"]);
    assert.deepEqual(codes(parseAgentDeclarations("flow main() {")), ["Galerina_AGENT_DECL_SYNTAX_INVALID"]);
  });
});

describe("lowerAgentDeclaration (compiler-facing contract)", () => {
  const base = () => ({ ...parseAgentDeclarations(CANONICAL).declarations[0] });

  it("refuses nodes with the wrong kind or schema", () => {
    for (const patch of [{ kind: "FlowDeclaration" }, { schema: "galerina.ai-agent.declaration.v0" }]) {
      const lowered = lowerAgentDeclaration({ ...base(), ...patch });
      assert.equal(lowered.definition, undefined);
      assert.deepEqual(lowered.diagnostics.map((d) => d.code), ["Galerina_AGENT_DECL_SCHEMA_INVALID"]);
    }
  });

  it("re-checks a hand-built node: name, failure, scopes and limits", () => {
    const lowered = lowerAgentDeclaration({
      ...base(),
      name: "lower",
      failureBehaviour: "ignore",
      tools: [{ tool: "repo.read", decision: "allow", scope: "../x" }, { tool: "shell", decision: "deny", scope: "./bin" }],
      limits: { timeoutMs: 0, memoryBytes: 1, maxToolCalls: 1 },
    });
    assert.equal(lowered.definition, undefined);
    assert.deepEqual(lowered.diagnostics.map((d) => d.code), [
      "Galerina_AGENT_DECL_NAME_INVALID",
      "Galerina_AGENT_DECL_FAILURE_INVALID",
      "Galerina_AGENT_DECL_TOOL_SCOPE_INVALID",
      "Galerina_AGENT_DECL_TOOL_SCOPE_INVALID",
      "Galerina_AGENT_TIMEOUT_REQUIRED",
    ]);
  });

  it("re-checks types, tool names and list items on a hand-built node", () => {
    const lowered = lowerAgentDeclaration({
      ...base(),
      inputType: "lower case",
      outputType: "",
      tools: [{ tool: "Shell Exec", decision: "allow" }, { tool: "shell", decision: "maybe" }],
      effects: ["Network.*"],
      permissions: ["a", "a"],
    });
    assert.equal(lowered.definition, undefined);
    const found = lowered.diagnostics.map((d) => [d.code, d.path]);
    for (const expected of [
      ["Galerina_AGENT_DECL_TYPE_INVALID", "inputType"],
      ["Galerina_AGENT_DECL_TYPE_INVALID", "outputType"],
      ["Galerina_AGENT_DECL_TOOL_INVALID", "tools.0"],
      ["Galerina_AGENT_DECL_TOOL_INVALID", "tools.1"],
      ["Galerina_AGENT_DECL_LIST_INVALID", "effects"],
      ["Galerina_AGENT_DECL_LIST_INVALID", "permissions"],
    ]) {
      assert.ok(found.some(([c, p]) => c === expected[0] && p === expected[1]), JSON.stringify(expected));
    }
  });

  it("an unclosed list does not swallow the next agent", () => {
    const result = parseAgentDeclarations(`agent Broken {
  input A
  output B
  effects [a,
  limits {
    timeout 1s
    memory 1mb
    max_tool_calls 1
  }
}
agent Fine {
  input A
  output B
  limits {
    timeout 1s
    memory 1mb
    max_tool_calls 1
  }
}`);
    assert.deepEqual(result.declarations.map((d) => d.name), ["Fine"]);
    assert.deepEqual(codes(result), ["Galerina_AGENT_DECL_LIST_INVALID"]);
  });

  it("returns a frozen copy that later node mutation cannot reach", () => {
    const node = base();
    const tools = node.tools.map((t) => ({ ...t }));
    const lowered = lowerAgentDeclaration({ ...node, tools });
    tools[0].scope = "../escape";
    assert.equal(lowered.definition.tools[0].scope, "./docs");
    assert.ok(Object.isFrozen(lowered.definition) && Object.isFrozen(lowered.definition.tools[0]));
  });
});
