# Multi-Agent Runtime

## Purpose

Galerina may support multiple AI agents, but agents must be treated as untrusted
workers by default.

The design goal is:

```text
multi-agent AI that is typed, permissioned, audited, bounded, cache-aware and
safe by default
```

Galerina must not copy an uncontrolled agent model where agents freely call tools,
pass arbitrary text around, read secrets, write files, access the network and
loop until they appear to finish.

## Core Rule

Agents do not get direct access to files, secrets, tools, other agents, the
network or runtime memory.

Agents receive typed inputs and may only perform declared actions through the
Galerina agent runtime.

```text
Agents can think and propose.
Galerina decides what they can see, do, exchange and apply.
```

## Runtime Architecture

The safe runtime shape is:

```text
User Request
  -> Supervisor Agent
  -> Galerina Agent Runtime
       -> Agent Registry
       -> Policy Engine
       -> Typed Message Bus
       -> Tool Gateway
       -> Secret Guard
       -> Memory Guard
       -> Cache Guard
       -> Sandbox Manager
       -> Human Approval Gate
       -> Audit Report Generator
  -> Individual Agents
```

Agents must not directly call:

```text
files
.env
database
network
terminal
Git
other agents
deployment tools
LLM memory
```

They must request capabilities from the runtime. The runtime enforces policy,
records the decision and returns only typed results.

## Agent Manifest

Every agent needs a manifest before it can run.

Example shape:

```galerina
agent CodeAgent {
  model "best:code"

  input CodeTask
  output CodePatch

  visibility PublicProjectContext

  permissions [
    project.read,
    file.propose_change,
    report.read
  ]

  deny [
    file.write_direct,
    file.delete,
    secret.read,
    env.read,
    network.outbound,
    database.write,
    deploy.run
  ]

  tools [
    ProjectRead,
    CompilerCheck,
    DiffPropose
  ]

  limits {
    max_steps 8
    max_tokens 12000
    max_runtime 60 seconds
  }
}
```

The manifest must make these visible before execution:

```text
input type
output type
model policy
visibility scope
tool permissions
effect permissions
denied actions
memory policy
cache policy
sandbox policy
runtime limits
failure behavior
approval requirements
```

## Supervisor Pattern

Do not let every agent call every other agent.

Use a supervisor and typed runtime-mediated messages:

```text
SupervisorAgent decides the next step.
CodeAgent returns CodePatch to the runtime.
Runtime validates CodePatch.
Runtime passes CodePatch to SecurityAgent if policy allows it.
SecurityAgent returns SecurityReview.
SupervisorAgent decides whether to continue, stop or require human review.
```

The supervisor controls:

```text
which agent runs
which typed input it receives
which output schema is accepted
when to stop
whether a human review is required
```

## Typed Messages

Agents must exchange typed data, not arbitrary hidden memory or raw text blobs.

Example:

```galerina
type CodeTask = {
  filePath: String
  goal: String
  constraints: List<String>
  allowedChanges: List<String>
}

type CodePatch = {
  filePath: String
  summary: String
  diff: String
  riskLevel: RiskLevel
}
```

Message policies should define allowed and denied fields:

```galerina
message CodePatchMessage {
  from CodeAgent
  to SecurityAgent

  schema CodePatch

  deny_fields [
    secrets,
    env,
    rawCredentials,
    privateUserData
  ]
}
```

## Data Classification

Data must be classified before it moves between agents.

Recommended classes:

```galerina
enum DataClass {
  Public
  ProjectInternal
  UserPrivate
  Secret
  PaymentSensitive
  LegalSensitive
  SecuritySensitive
  RuntimeOnly
}
```

Default policy:

```text
allow Public between all agents
allow ProjectInternal only between approved project agents
deny Secret between all agents
deny PaymentSensitive to docs/code agents
require redaction for UserPrivate and SecuritySensitive
require audit for ProjectInternal and SecuritySensitive
```

## Visibility Scopes

Agents should only see the minimum context required for their role.

Example:

```galerina
visibility_scope PublicProjectContext {
  include [
    "src/**/*.fungi",
    "docs/**/*.md",
    "reports/compiler-report.json"
  ]

  exclude [
    ".env",
    "**/*.key",
    "**/secrets/**",
    "runtime/private/**"
  ]

  redact [
    "api_key",
    "token",
    "password",
    "authorization",
    "cookie"
  ]
}
```

Typical visibility:

| Agent | Can see | Cannot see |
| --- | --- | --- |
| `PlannerAgent` | user request, architecture summary | secrets, raw files unless needed |
| `CodeAgent` | selected source files, compiler errors | `.env`, production data |
| `SecurityAgent` | source files, policy reports | raw secrets |
| `TestAgent` | test files, proposed patch | payment keys |
| `DocsAgent` | public docs, API types | private logs |
| `DeployAgent` | build reports, deployment request | raw source unless needed |

## Secret Guard

Agents must never receive secret values directly.

Bad:

```galerina
agent.input = Env.get("PAYMENT_API_KEY")
```

Good:

```galerina
SecretGuard.signRequest({
  secret: "PAYMENT_API_KEY",
  payload: requestBody,
  algorithm: hmac_sha256
})
```

An agent may request a secret-backed operation. It must not read or export the
secret value.

Secret metadata can be exposed when needed:

```json
{
  "secretName": "PAYMENT_API_KEY",
  "available": true,
  "fingerprint": "sha256:7b31...c91a",
  "value": "[REDACTED]"
}
```

## Tool Gateway

Agents must not run tools directly.

Example tool policy:

```galerina
tool GitRead {
  allow commands [
    "status",
    "diff",
    "log"
  ]

  deny commands [
    "push",
    "reset",
    "clean",
    "rebase"
  ]
}

tool DiffPropose {
  allow propose_patch true
  deny write_direct true
}
```

The gateway enforces:

```text
which tool can run
which arguments are allowed
which files can be read
which commands are denied
which environment can be used
which results are redacted
```

## Propose Versus Apply

Agents should normally propose changes, not apply them.

Actions that require human approval by default:

```text
file.write
dependency.install
database.migrate
production.deploy
secret.create
secret.rotate
email.send_bulk
payment.refund
permission_change
```

Actions that may be automatic under policy:

```text
report.write
test.generate
diff.propose
docs.propose
compiler.check
security.scan
```

## Sandbox Policy

Agents should run in isolated environments where practical:

```text
container
microVM
WASM sandbox
restricted process
read-only filesystem
no shell by default
no network by default
no .env mount
temporary workspace
```

Example:

```galerina
sandbox_policy DefaultAgentSandbox {
  filesystem {
    mode readonly

    allow_read [
      "./src",
      "./docs",
      "./reports"
    ]

    deny_read [
      ".env",
      "./secrets",
      "./private",
      "./runtime/crashes/raw"
    ]

    allow_write [
      "./agent-output"
    ]
  }

  network {
    default deny
  }

  process {
    shell false
    exec false
    max_memory 512mb
    max_cpu 1
  }

  environment {
    expose_env false
  }
}
```

## Memory Policy

Agent memory must be controlled. Agents should not automatically remember
secrets, personal data, raw user messages, authorization headers, cookies or
environment values.

Recommended memory modes:

| Memory type | Meaning |
| --- | --- |
| `none` | No memory |
| `readonly` | Can read context but not update it |
| `session` | Temporary memory for one task |
| `project` | Project-level memory |
| `tenant` | Customer/account-specific memory |
| `secure` | Encrypted memory |
| `redacted` | Secret-safe memory only |

Default policy:

```text
session-only unless explicitly configured
deny storing secrets and raw private data
allow public data
allow redacted project-internal data
encrypt project and user-private memory
expire memory by TTL
```

## Passive LLM Cache

Agent caching must be passive and guarded.

Example policy:

```galerina
llm_cache_policy AgentCache {
  mode passive

  deny_if_contains [
    Secret,
    PaymentSensitive,
    auth_header,
    cookie,
    env_value
  ]

  require_schema_validation true
  require_redaction true
  isolate_by_project true
  isolate_by_tenant true

  key include [
    agent_name,
    model,
    model_version,
    prompt_hash,
    input_hash,
    policy_hash,
    output_schema_hash
  ]
}
```

Cached input and output must not leak between projects, tenants, users, security
contexts or agent roles.

## Loop And Crash Protection

Agent runtime policy must define hard bounds:

```galerina
agent_runtime_policy DefaultAgentRuntime {
  max_steps 20
  max_agent_calls 40
  max_retries 2
  max_runtime 3 minutes
  max_patch_size 200kb

  on_loop_detected {
    stop
    write_report
    require_human_review
  }

  on_policy_violation {
    stop_agent
    preserve_evidence
    write_security_report
  }
}
```

The runtime should detect:

```text
same agent calling the same agent repeatedly
same task being rewritten repeatedly
same failed patch being retried
no progress after N steps
tool-call cycles
runaway token or cost growth
repeated policy violations
```

## Audit Reports

Every multi-agent run must produce an audit report.

Example shape:

```json
{
  "agentRun": {
    "workflow": "ImplementWebhook",
    "agent": "CodeAgent",
    "sandbox": "container",
    "networkAccess": false,
    "envAccess": false,
    "secretsAccessed": false,
    "toolsUsed": [
      "ProjectRead",
      "DiffPropose"
    ],
    "filesRead": [
      "api/payment-webhook.fungi",
      "domain/payments.fungi"
    ],
    "filesWritten": [],
    "patchesProposed": [
      "api/payment-webhook.fungi"
    ],
    "messagesSent": [
      "CodePatch"
    ],
    "policyViolations": [],
    "humanApprovalRequired": true
  }
}
```

Blocked actions must also be reported:

```json
{
  "policyViolation": {
    "agent": "CodeAgent",
    "action": "env.read",
    "target": ".env",
    "decision": "blocked",
    "reason": "Agents cannot read .env values"
  }
}
```

## Secure Workflow Example

```galerina
multi_agent workflow ImplementFeature {
  input FeatureRequest
  output FeatureResult

  supervisor SupervisorAgent

  agents [
    PlannerAgent,
    CodeAgent,
    SecurityAgent,
    TestAgent,
    ReviewAgent
  ]

  policy {
    sandbox DefaultAgentSandbox
    data_exchange AgentDataPolicy
    secrets AgentSecretPolicy
    approval AgentApproval
    runtime DefaultAgentRuntime
  }

  run {
    let plan = PlannerAgent.run(input)
    let patch = CodeAgent.run(plan)
    let securityReview = SecurityAgent.review(patch)

    match securityReview.decision {
      case Deny {
        return Err(SecurityRejected)
      }

      case Review {
        return Err(HumanReviewRequired)
      }

      case Allow {
        continue
      }
    }

    let tests = TestAgent.generate(patch)
    let finalReview = ReviewAgent.check({
      patch: patch,
      tests: tests
    })

    return Ok({
      patch: patch,
      tests: tests,
      review: finalReview
    })
  }
}
```

## Default Denies

Agents must not do these by default:

```text
read .env
read raw secrets
write source files directly
delete files
install dependencies
run shell commands
access production databases
deploy to production
send emails to real users
process payments
refund payments
modify their own permissions
create more powerful agents
send secrets to LLMs
cache secret-containing prompts
communicate with other agents directly
disable audit logs
```

Any exception requires explicit policy, narrow scope, runtime enforcement,
audit reporting and human approval where necessary.

## Enterprise Boundary

Local and small-team agent workflows may be free/open when they stay local,
typed, bounded and reportable.

The following remain enterprise-only and locked until explicitly unlocked:

```text
multi-team agent orchestration
central agent runner
team governance console
agent approval queues
cross-project audit dashboard
compliance evidence export
enterprise risk scoring
long-term audit retention
SSO/SAML-backed agent permissions
```

See `ENTERPRISE.md`.

## Best Model

The strongest Galerina agent model is:

```text
zero-trust agents
capability-based permissions
typed message passing
no direct secret access
no direct tool access
no direct file writes
sandboxed execution
human approval for dangerous actions
full audit trail
policy reports
```
