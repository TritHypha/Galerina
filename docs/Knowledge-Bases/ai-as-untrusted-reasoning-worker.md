# AI As Untrusted Reasoning Worker

## Purpose

Galerina should support AI by treating AI as an untrusted reasoning worker, not
as trusted program logic.

Core rule:

```text
AI can suggest.
Galerina must verify.
Runtime must enforce.
```

AI may assist language, runtime, developer and operational workflows. It must
not replace validation, policy, evidence, capability checks, human review or
runtime enforcement.

## Language-Level Support

AI concepts should be language-level typed contracts, not hidden framework
features.

Candidate contract concepts:

```text
AiTask
AiWorker
AiModel
AiContext
AiEvidence
AiClaim
AiDecision
AiToolCall
AiReport
```

Example conceptual syntax:

```galerina
ai task SummariseInvoice {
  input InvoiceText
  output InvoiceSummary
  evidence required
  tools none
  hallucination_policy deny_unverified_claims
}
```

This syntax is conceptual until formally specified.

AI outputs should declare:

```text
what it claims
what source supports it
confidence level
missing information
tool use requested
whether human review is required
```

## Runtime Pipeline

AI execution should run through a controlled runtime pipeline:

```text
1. Security phase
2. Load trusted policy
3. Load untrusted context
4. Redact secrets
5. Run AI worker
6. Validate structured output
7. Verify claims against evidence
8. Enforce permissions
9. Require human approval if needed
10. Emit report
```

Nothing AI-related should happen before the security phase.

## Hallucination Handling

Galerina cannot fully stop hallucination, but it can make hallucination
non-authoritative.

Rules:

```text
No evidence -> mark as unverified
No source -> cannot become fact
Low confidence -> require review
Contradiction found -> reject or escalate
Missing data -> return Unknown, not a guess
```

AI should return typed results:

```galerina
Result<VerifiedAnswer, AiError>
```

not raw text.

Possible errors:

```text
InsufficientEvidence
UnverifiedClaim
SourceConflict
PromptInjectionRisk
ToolDenied
HumanReviewRequired
```

## ML Worker Agents

ML workers should be sandboxed runtime workers:

```text
no secrets by default
no filesystem by default
no network by default
no database writes by default
bounded memory
bounded runtime
typed tool permissions
full audit report
```

Example conceptual worker declaration:

```galerina
worker FraudModelWorker {
  input TransactionBatch
  output FraudScoreReport
  effects [ai.infer]
  deny [network.external, secrets.read, database.write]
}
```

This syntax is conceptual until formally specified.

## Required Separation

Galerina should separate:

```text
AI inference      -> model prediction
AI reasoning      -> explanation or planning
AI tool use       -> controlled runtime action
AI memory         -> restricted typed storage
AI authority      -> never automatic
```

AI output should not directly:

```text
mutate state
change policy
deploy code
send emails
access secrets
grant permissions
write to databases
call external networks
```

unless a typed policy explicitly grants that ability and the runtime enforces
the boundary.

## Anti-Hallucination Reports

Galerina should eventually produce:

```text
ai-context-report.json
ai-claim-report.json
ai-evidence-report.json
ai-tool-permission-report.json
ai-hallucination-risk-report.json
human-review-report.json
```

These reports should be machine-readable, redacted and audit-friendly.

## Tool Permissions

AI tool use must be explicit. Tool requests should be represented as typed
runtime actions, not implicit model authority.

Every tool call should include:

```text
requested tool
declared purpose
input shape
data classification
permission required
evidence needed
approval status
result status
audit event
```

Denied tool calls should be reported, not silently retried through another
path.

## Evidence Model

Evidence must be explicit and traceable.

AI claims should distinguish:

```text
verified fact
supported inference
unsupported claim
contradicted claim
unknown
```

Only verified facts and policy-approved supported inferences may influence
runtime decisions.

## Relationship To Other Concepts

This concept complements:

- [AI Self-Modification Governance](ai-self-modification-governance.md)
- [Generative Runtime Mapper](generative-runtime-mapper.md)
- [MCP AI Tool Boundaries](mcp-ai-tool-boundaries.md)
- [Securely Governed Runtime](securely-governed-runtime.md)

The AI self-modification model defines authority boundaries. This concept
defines how ordinary AI reasoning and ML workers should be typed, verified,
sandboxed and reported.

## Final Principle

Galerina should not trust AI.

It should make AI useful by forcing it into typed tasks, bounded workers,
evidence-backed claims, permission-gated tools and reportable runtime
decisions.

AI may assist the language and runtime, but it must never replace security,
validation or proof.
