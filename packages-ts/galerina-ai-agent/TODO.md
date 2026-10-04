# Galerina Agent TODO

```text
[x] Create /packages-ts/galerina-ai-agent
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define agent, tool permission, limit, task group and report placeholders
[ ] Define agent syntax and compiler-facing contracts
    Open 2026-10-05: needs core-compiler grammar work; the runtime contracts below are in src/agent-governance.ts.
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
[x] Define immutable AI audit log contract
[x] Define loop/crash protection report examples
[x] Add examples
[x] Add tests
```

Evidence (Grok TODO pass, 2026-10-05): src/agent-governance.ts, tests/agent-governance.test.mjs, examples/*.example.json
(each example's expected output is recomputed and compared by the tests).
