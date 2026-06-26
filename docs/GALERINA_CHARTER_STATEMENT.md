# Galerina Charter Statement

> **When computation becomes light-speed, security must become computation.**

Galerina is a security-first, typed, AI-readable language, runtime and tooling ecosystem for building secure applications, controlled AI agents, typed APIs, deployment-aware services and future accelerator-ready software.

In the coming age of photonics, AI accelerators and high-speed distributed compute, the strongest software will not be defined by raw speed alone. The advantage will belong to systems that can evaluate trust, permissions, risk, data movement, runtime state and security policy as quickly and clearly as they process data.

Galerina is built for that future.

---

## 1. Mission

Galerina exists to make software safer, clearer and more explainable before it runs, while keeping the developer experience practical for humans and AI coding assistants.

Galerina should help developers build systems where:

- inputs are typed before they are trusted;
- permissions are declared before effects are allowed;
- secrets are used but not exposed;
- agent actions are supervised and audited;
- deployment is checked before traffic is enabled;
- runtime behaviour is reported in machine-readable form;
- future compute targets can be planned without making unsafe claims.

The project goal is not simply to create another syntax. The goal is to create a programming environment where application policy, agent policy, deployment policy and security policy are first-class parts of the system.

---

## 2. Core Charter Statement

Galerina is a security-first programming language concept and runtime ecosystem for API-heavy, JSON-native, AI-readable and accelerator-aware software.

It should remain easy enough for junior developers to read, strict enough for serious backend systems, and structured enough for AI coding tools to understand safely.

Galerina should prefer:

```text
explicit over hidden
typed over guessed
reported over assumed
permissioned over implicit
safe fallback over silent failure
policy before production
```

Galerina should reject:

```text
undefined
silent null
truthy/falsy security decisions
implicit type coercion
hidden exceptions as the default model
raw secrets in logs or reports
uncontrolled AI agents
silent target fallback
developer-machine assumptions in production
```

---

## 3. Strategic Focus

The near and mid-term focus is:

```text
secure applications
typed APIs
webhooks
local and small-team agents
safe runtime reports
deployment auto-configuration
package boundaries
security-first developer tooling
AI-readable project context
```

Galerina should not currently position itself around building an operating system. OS work is a long-way-off research path and should not distract from the practical product direction.

Future systems, kernel or OS-oriented work may be documented as long-term research only, not as an active v1 product focus.

---

## 4. Free and Open Scope

The free/open side of Galerina should drive adoption, learning and practical experimentation.

The following areas should remain free/open:

```text
Galerina compiler core
Galerina standard library
local web app runtime
local agent runtime
small-team/local agents
basic security reports
basic deployment checks
basic Docker/container output
basic API and webhook examples
documentation
examples
developer CLI
project graph tooling
```

The free/open platform should be useful enough for:

```text
individual developers
small teams
local development
learning
basic app building
basic local agents
basic security awareness
open-source package experimentation
```

Free/open Galerina must not depend on enterprise-only packages.

---

## 5. Enterprise Scope

Enterprise Galerina should sell governance, compliance, deployment safety and operational control.

Enterprise-only areas should include:

```text
enterprise agent orchestration
central agent runner
multi-team agent scheduling
agent governance console
agent approval queues
team permissions
SSO/SAML/OIDC identity integration
SCIM user provisioning
advanced audit reports
signed or tamper-evident audit logs
compliance reports
compliance evidence packs
certified package registry
private package registry
package approval workflows
advanced Kubernetes/security policy packs
production hardening automation
multi-cloud deployment automation
managed Galerina cloud
enterprise support
```

The commercial principle is:

```text
Free Galerina gets adoption.
Enterprise Galerina sells governance, compliance, deployment safety and operational control.
```

Enterprise packages must remain locked roadmap items unless explicitly unlocked by the project owner.

Reserved enterprise package names may include:

```text
galerina-agent-orchestrator-enterprise
galerina-agent-governance-enterprise
galerina-kubernetes-enterprise
galerina-security-policy-packs-enterprise
galerina-deploy-enterprise
galerina-audit-enterprise
galerina-compliance-enterprise
galerina-identity-enterprise
galerina-registry-enterprise
galerina-cloud-enterprise
galerina-support-enterprise
```

---

## 6. Security Charter

Galerina's strongest security position is secure web runtime policy.

Galerina should make security boundaries visible before code runs.

Galerina should make these visible and reportable:

```text
typed API boundaries
package effects
route policies
permissions
secret flows
network access
database access
AI/model output handling
cache policy
deployment gates
production overrides
```

The default trust model should be:

```text
untrusted until typed
untrusted until validated
untrusted until permissioned
untrusted until provenance is known
untrusted until policy allows it
untrusted until reports can explain it
```

Security-sensitive decisions should not rely on vague booleans or unknown states. Unknown policy states must be handled explicitly.

---

## 7. Secret Handling Charter

Secrets must be values that can be used, but not seen.

Galerina should support secret-safe development by ensuring:

```text
.env files are never committed
.env values are never compiled into build output
secret values are never written to reports
secret values are never sent to agents or LLMs
secret values are never cached
secret values are never logged
secret names and fingerprints may be reported safely
```

Agents, AI tools and generated reports should receive only redacted metadata such as:

```json
{
  "secretName": "PAYMENT_API_KEY",
  "available": true,
  "fingerprint": "sha256:...",
  "value": "[REDACTED]"
}
```

---

## 8. Multi-Agent Runtime Charter

Galerina may support multiple AI agents, but agents must be treated as untrusted workers by default.

The agent runtime should be:

```text
typed
permissioned
audited
bounded
cache-aware
sandboxed where practical
safe by default
```

Core rule:

```text
Agents can think and propose.
Galerina decides what they can see, do, exchange and apply.
```

Agents must not directly access:

```text
.env
raw secrets
files
databases
network
terminal
Git
deployment tools
other agents
runtime memory
LLM memory
```

Agents should receive typed inputs and return typed outputs through the Galerina runtime.

Dangerous actions should require explicit policy and, where appropriate, human approval:

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

---

## 9. Deployment Charter

Galerina should treat deployment as a first-class build target, not as an afterthought handled only by Dockerfiles, YAML files and manual DevOps notes.

Deployment should follow this rule:

```text
Build from source.
Detect the target machine.
Configure safely for that target.
Never copy developer-machine assumptions.
Never expose secrets.
Verify before traffic.
Monitor after traffic.
Rollback if unstable.
Report everything.
```

Galerina should support:

```text
typed deployment config
preflight checks
generated deployment artefacts
safe secret handling
incremental builds
smaller outputs
health checks
readiness checks
smoke tests
rollback metadata
runtime capability profiles
AI-readable deployment reports
security gates
```

Production deployment should be blocked when safety gates fail, including:

```text
hardcoded secrets
missing required secrets
.env included in build output
secret values included in reports
unsigned artifacts where signing is required
dependency permission expansion without approval
debug mode in production
unsafe network rules
missing health endpoint
missing readiness endpoint
missing crash policy
failed smoke test
```

---

## 10. Package Charter

Galerina packages should be grouped so their purpose is visible from the directory name.

The project should keep a clear boundary between:

```text
packages/          normal app/vendor package space
packages-galerina/   Galerina language, runtime, tooling, target and domain packages
```

Core package families may include:

```text
galerina-core-*
galerina-ai-*
galerina-compliance-*
galerina-data-*
galerina-db-*
galerina-target-*
galerina-cpu-*
galerina-framework-*
galerina-devtools-*
galerina-tools-*
```

`galerina-core` defines the language. It must not become a web framework, CMS, admin dashboard, ORM or frontend framework.

Development-only packages must not become production dependencies unless explicitly enabled with a reported override.

---

## 11. AI and LLM Charter

AI/model output is untrusted by default.

Galerina should not allow AI output to directly approve security, payment, access-control, deployment or other high-impact decisions.

AI output should be:

```text
typed
validated
redacted
policy-reviewed
bounded
reported
```

Passive LLM cache should be allowed only when safe. It must use strict keys that include model, model version, prompt hash, input hash, policy hash, schema hash and security context.

LLM cache must deny inputs or outputs containing:

```text
secrets
payment-sensitive data
auth headers
cookies
raw environment values
unredacted private data
```

---

## 12. Compute and Accelerator Charter

Galerina should remain CPU-compatible by default.

Future support for GPU, AI accelerator, low-bit AI, optical I/O, photonic planning and ternary logic should be treated as package contracts, target planning, simulations or report artefacts until real backends exist.

Galerina should not claim measured performance until the compiler, memory model,
runtime and benchmark methodology exist.

Future accelerator targets should be selected by policy, configuration or target capability detection, not by hard-coding vendor devices into language syntax.

The correct long-term principle is:

```text
raw speed is not enough;
security decisions, trust boundaries and permission checks must become computable at runtime speed.
```

---

## 13. Documentation Charter

Galerina documentation should be practical, honest and AI-readable.

Docs should make clear:

```text
what is implemented
what is planned
what is experimental
what is future research
what is free/open
what is enterprise-only
what must not be claimed yet
```

AI-generated or planning documents are advisory. When documents conflict, the active repository structure, package READMEs, TODOs, workspace files, security rules and package boundary documents take precedence.

---

## 14. Non-Goals

Galerina should not currently claim to be:

```text
a stable production language
a finished compiler ecosystem
an operating system project
a certified compliance tool
a guaranteed faster runtime
a hardware acceleration platform by itself
a magic deployment system
an uncontrolled AI-agent platform
```

Galerina should not hide complexity behind magic.

Generated files should be inspectable, overrideable and explainable.

---

## 15. Guiding Principle

Galerina should be built around one central idea:

> **Security is not a plugin, middleware or afterthought. In Galerina, security rules, trust boundaries, permissions, deployment checks and agent actions should be part of the computable system itself.**

The future of software will not be won by speed alone.

It will be won by systems that can decide what is safe, trusted, permitted and correct as quickly as they compute the result.

Galerina is designed for that future.
