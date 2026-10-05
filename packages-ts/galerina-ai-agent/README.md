# Galerina Agent

`galerina-ai-agent` is the package for supervised AI agent definitions, tool
permissions, task groups, typed messages, visibility scopes, approval gates,
merge policies and agent reports.

It belongs in:

```text
/packages-ts/galerina-ai-agent
```

Use this package for:

```text
AgentDefinition
AgentToolPermission
AgentVisibilityScope
AgentMessageSchema
AgentDataExchangePolicy
AgentSecretPolicy
AgentMemoryPolicy
AgentCachePolicy
AgentSandboxPolicy
AgentLimits
AgentTaskGroupPlan
AgentResult
AgentMergePolicy
AgentReport
```

## Multi-Agent Runtime Model

Galerina agents are untrusted workers by default.

Agents must not directly access:

```text
files
.env
raw secrets
databases
network
terminal
Git
other agents
deployment tools
LLM memory
```

Agents receive typed inputs and may only perform declared actions through the
Galerina agent runtime. The runtime enforces policy through:

```text
supervisor agent
agent registry
typed message bus
tool gateway
MCP boundary gateway
secret guard
memory guard
cache guard
sandbox manager
human approval gate
audit report generator
```

The detailed runtime design lives in `../../docs/MULTI_AGENT_RUNTIME.md`.

## Boundary

`galerina-ai-agent` describes typed agent orchestration contracts. It does not own
model inference, vector math, target selection, runtime scheduling internals,
sandbox implementation or security primitive implementation.

Related packages:

| Package | Responsibility |
|---|---|
| `galerina-core-runtime` | structured concurrency, cancellation, timeout and supervision runtime |
| `galerina-core-security` | permissions, redaction, secret guards, unsafe reports and policy checks |
| `galerina-ai` | generic AI inference contracts and safety policy |
| `galerina-core-compute` | compute target planning and fallback reports |
| `galerina-core-vector` | vector, matrix, tensor and embedding operations |
| `galerina-target-cpu` | CPU fallback and orchestration baseline |
| `galerina-target-gpu` | GPU target planning for heavy compute |

Agents must be:

```text
typed
supervised
permissioned
bounded
cancelable
reportable
sandboxable
cache-guarded
approval-aware
```

## Default Denies

Agents must deny these by default:

```text
read .env
read raw secrets
write files directly
delete files
install dependencies
run shell commands
access production databases
deploy to production
send emails to real users
process payments
modify their own permissions
create more powerful agents
communicate directly with other agents
disable audit logs
```

Agents should normally propose code patches, docs changes, tests, reports and
deployment requests. Applying dangerous changes requires explicit policy and
human approval.

## MCP Tool Boundary Position

MCP tools, resources and prompts must enter agent workflows through declared
AI/tool boundaries. Agents must not treat an advertised MCP tool as permission
to use it.

MCP calls must remain:

```text
typed
permissioned
effect-checked
token-boundary checked
vault-limited
audited
reportable
```

Generic vault access through MCP is denied. Any future MCP runtime support
should produce MCP tool, resource exposure, effective permission and token
boundary reports before promotion into trusted agent workflows.

## AI Self-Modification Governance

AI agents may generate code, propose policy, request capabilities and produce
reports. They must not grant capabilities to themselves, approve their own
policy changes, edit their own execution boundary or modify trust roots without
external governance.

AI-authored code should enter quarantine before promotion:

```text
AI writes code
 -> quarantine
 -> syntax/type checks
 -> effect extraction
 -> policy evaluation
 -> sandbox tests
 -> audit report
 -> human/policy approval
 -> promotion
```

Agent authority should be issued as a revocable lease:

```text
capability
scope
duration
approver chain
audit required
```

Delegation must use capability attenuation: an agent may delegate only equal or
narrower authority than it already holds. No agent should have a `god mode`
role, and no process may grant itself broader authority than its approver chain
possesses.

The AI core and authority kernel are separate responsibilities. Agents may
reason, plan, generate code, analyse output and request authority. They must not
issue their own authority, edit their own boundary, approve their own policy
change or modify compiler, security, audit, capability-checker, package-signing
or cryptographic trust roots.

Read and write authority must be separate. File reads, file writes, package
installs, shell/tool calls, tests, migrations, deployment and policy edits are
different capabilities.

Reports should include AI authority requests, code quarantine status, approval
decisions, changed files, tests run, granted capabilities and lease expiry.

See `../../../ZTF-Knowledge-Bases/reference/language/ai-self-modification-governance.md`.

Final rule:

```text
galerina-ai-agent owns agent contracts.
galerina-core-runtime owns execution supervision.
galerina-core-compute owns heavy compute planning.
galerina-core-security owns permission and safety policy.
```

## Zero-trust agent governance contracts

`src/agent-governance.ts` adds pure policy decisions over already-parsed records. Callers must validate untrusted bytes against the declared schemas before calling these helpers; they are not runtime schema parsers. Each returns `{ allowed, diagnostics }` or a typed report, and none performs I/O or grants authority.

| Contract | What it does |
|---|---|
| `validateSupervisedTaskGroup` | Only declared, unique members run, and none may outlive the group. |
| `validateAgentManifest` | Signed manifests only. Grants must be exact and scoped, with no wildcards. read/write/tool/package/deploy stay separate. Every effect needs a grant. |
| `routeAgentMessage` | Typed topics with sender and receiver allowlists and a data-classification clearance. |
| `evaluateToolGatewayCall` | Tool allowlist (deny wins), secret-marker guard, memory budget guard, and no caching of confidential or secret data. |
| `admitMcpTools` | MCP servers must be pinned by sha256 digest with a tool allowlist. Descriptions are never trusted. |
| `attenuateLease` | A derived lease can only narrow its parent: capability, scope, expiry and uses. |
| `decideAiCapabilityRequest` | Agents request and the authority kernel decides. No self-grants. write/package/deploy need a human approval id. |
| `createSelfModificationReport`, `transitionQuarantine` | Trust roots are immutable. An agent cannot rewrite its own definition. AI-generated code is released only through an independent review that records evidence. |
| `validateSandboxPolicy`, `evaluateHumanApprovalGate` | No process spawn and exact network allowlists. Approvals are per action, expire, and cannot come from the requester. |
| `createLoopProtectionReport` | Iteration, crash and stall limits. |
| `appendAiAuditEntry`, `verifyAiAuditLog`, `sha256Hex` | A local hash-chain consistency helper with a dependency-free SHA-256. It does not provide durable storage, signatures, or a trusted external head anchor; a complete rewritten chain can be recomputed. |

Worked examples are in `examples/*.example.json`. The tests recompute each example's expected output.

## Agent declaration syntax (compiler-facing contract)

`src/agent-declaration.ts` defines the canonical source form and the node a compiler front end emits for it
(zero-trust defaults, 2026-10-05; owner may revisit):

```galerina
agent DocumentationAgent {
  input ProjectReviewRequest
  output AgentResult
  tools {
    repo.read allow "./src"
    security.scan allow
    shell deny
  }
  effects [filesystem_read]
  permissions [project.read]
  failure return_typed_error
  limits {
    timeout 30s
    memory 128mb
    max_tool_calls 50
    max_tokens 12000
    rate_limit_per_minute 60
  }
}
```

| Piece | Contract |
|---|---|
| `AgentDeclarationNode` | `kind: "AgentDeclaration"`, `schema: "galerina.ai-agent.declaration.v1"`, name, span, input/output types, tools, effects, permissions, limits, failure behaviour. |
| `parseAgentDeclarations(source)` | Reference parser. Returns only declarations with no error, plus diagnostics with line numbers and codes (source text is never echoed). |
| `lowerAgentDeclaration(node)` | Treats the node as untrusted, re-checks kind, schema, name, failure behaviour and scopes, then runs `validateAgentDefinition`. Returns an `AgentDefinition` only when there is no error. |

Rules: input, output and `limits { timeout, memory, max_tool_calls }` are required. Tools that are not listed are
denied. An allow scope must be exact and relative (no wildcard, absolute path, drive letter, URL or `..`). `failure`
defaults to `fail_group`. Unknown or duplicate clauses are refused, including the `model`, `visibility` and
`deny [...]` clauses of the draft in `docs/MULTI_AGENT_RUNTIME.md`. Units: timeout `ms|s|m`, memory `kb|mb|gb`.
The core-compiler grammar is not wired yet.
