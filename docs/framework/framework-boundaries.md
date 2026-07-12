# Framework: Boundaries

## Purpose

Boundaries define trust crossings in Galerina applications.

## Short Definition

A boundary is any place where data or authority crosses from one trust area into
another.

## Boundary Types

```text
route/API
package/plugin
storage
external API
event/queue
AI/tool
MCP server/tool/resource/prompt
compute target
vault
native interop
```

## Syntax Examples

```galerina
boundary storage UsersDatabase {
  type postgres
  model User
  permission use user_storage_access
}
```

```galerina
boundary external PaymentProvider {
  type api
  request ChargePaymentRequest
  response ChargePaymentResponse
  permission use payment_provider_access
}
```

## Security Rules

- Every boundary crossing must validate data.
- Every boundary crossing must check permission.
- Every boundary crossing must be reportable.
- Every boundary crossing must prevent data from becoming authority. Claimed
  roles, object ownership and permissions in input are not trusted facts.
- Every untrusted boundary should assign resource budgets before execution.
- Unknown trust must default to untrusted.
- Native, AI/tool and external boundaries require stricter reports.
- AI/tool boundaries must separate AI intent from authority issuance. AI may
  request capabilities, but the runtime authority kernel must decide whether
  scoped, revocable authority is leased.
- AI-generated code must enter quarantine before it is promoted into trusted app
  or package code.
- MCP boundaries must declare tools, resources, prompts, token-boundary rules,
  typed input/output, limits, effects and audit requirements before use.
- MCP tool availability is not permission; Galerina permission checks still
  decide whether a caller may use a tool or resource.

## Generated Reports

```text
boundary-report.json
external-boundary-report.json
storage-boundary-report.json
ai-tool-boundary-report.json
mcp-boundary-report.json
compute-boundary-report.json
malicious-data-report.json
resource-budget-report.json
hardware-risk-report.json
ai-authority-request-report.json
ai-code-quarantine-report.json
capability-lease-report.json
```

## Related Boundary Concepts

- [Events](framework-events.md)
- [Repositories And Storage](framework-repositories-storage.md)
- [Adapters And Connectors](framework-adapters-connectors.md)
- [MCP AI Tool Boundaries](framework-mcp-ai-tool-boundaries.md)
- [AI Self-Modification Governance](../../../ZTF-Knowledge-Bases/ai-self-modification-governance.md)
- [Malicious Data And Exploit Resistance](../../../ZTF-Knowledge-Bases/malicious-data-and-exploit-resistance.md)

## Knowledge Base

See [Core Application Model](../../../ZTF-Knowledge-Bases/core-application-model.md) and
[Boundary Extension Concepts](../../../ZTF-Knowledge-Bases/boundary-extension-concepts.md).
