# Galerina Agent TODO

```text
[x] Create /packages-ts/galerina-ai-agent
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define agent, tool permission, limit, task group and report placeholders
[x] Define agent syntax and compiler-facing contracts -- src/agent-declaration.ts: canonical `agent Name { ... }` form,
    AgentDeclarationNode (schema galerina.ai-agent.declaration.v1), reference parser parseAgentDeclarations and
    lowerAgentDeclaration -> AgentDefinition; tests/agent-declaration.test.mjs (Grok 2026-10-05; zero-trust defaults,
    owner may revisit). Not done here: wiring the grammar into galerina-core-compiler (core-compiler has uncommitted
    Codex work, so it was not touched); the compiler should emit AgentDeclarationNode and call lowerAgentDeclaration.
[x] Define supervised task group validation rules
[x] Define merge policy examples
[x] Define agent security report examples
[x] Define zero-trust agent manifest contracts
[x] Define typed message bus and data classification contracts
[x] Define tool gateway, secret guard, memory guard and cache guard contracts
[x] Define MCP AI/tool boundary gateway contracts and report schemas
[x] Define sandbox policy and human approval gate examples
[x] Define AI-generated code quarantine contracts
[x] Define capability lease and attenuation contracts
[x] Define authority-kernel separation contracts for AI capability requests
[x] Define immutable trust-root protection examples
[x] Define read/write/tool/package/deploy capability separation examples
[x] Define self-modification governance report examples
[x] Define local AI audit hash-chain consistency helper (not durable or externally anchored storage)
[x] Define loop/crash protection report examples
[x] Add examples
[x] Add tests
```

Evidence (Grok TODO pass, 2026-10-05): src/agent-governance.ts, tests/agent-governance.test.mjs, examples/*.example.json
(each example's expected output is recomputed and compared by the tests).
