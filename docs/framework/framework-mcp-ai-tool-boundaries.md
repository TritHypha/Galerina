# Framework: MCP AI Tool Boundaries

## Purpose

MCP AI tool boundaries define how Galerina applications may expose or consume
Model Context Protocol tools, resources and prompts without giving AI systems
hidden authority.

## Short Definition

An MCP AI tool boundary is a governed `AI/tool` boundary for MCP servers,
clients, tools, resources and prompts.

## Framework Position

MCP support belongs under the existing boundary model:

```text
data -> flow -> permission -> boundary -> report
```

It should not create a separate authority path.

## MCP Boundary Responsibilities

An MCP boundary should declare:

- MCP server or client identity
- transport
- auth and token-audience rules
- allowed and denied tools
- allowed and denied resources
- prompt exposure rules
- typed tool input and output
- data classification
- required permissions and capabilities
- allowed effects
- timeout and call limits
- vault access rules
- human approval gates
- audit events
- report targets

## Security Rules

- MCP tools, resources and prompts are untrusted until declared.
- MCP tool availability is not permission.
- MCP tool execution must enter through a typed Galerina flow.
- MCP resources must have classification before entering AI context.
- MCP prompts must be treated as workflow contracts, not trusted code.
- Token passthrough is denied.
- MCP clients must not receive direct generic vault access.
- Session IDs must not be used as authentication.
- Tool outputs must pass through response/view contracts before exposure.
- Risky effects require permission, audit and optional human approval.

### Client-Side Rules — consuming an untrusted MCP server

The rules above govern Galerina exposing its own tools. When Galerina, a
subagent or a bridge consumes an external MCP server, that server is untrusted.
Future MCP client support must also satisfy:

- Tool and agent output is untrusted data, not instructions. The orchestrating
  agent must not execute directives found in tool results; results must enter
  the model as quoted, non-authoritative data. This content/instruction
  separation is distinct from the response/view exposure rule above and
  addresses the lethal-trifecta risk of private-data access, untrusted content
  and an exfiltration path.
- Approved tool definitions must be pinned by hash and re-validated before each
  call. Allow and deny lists gate unknown tools; a changed schema or description
  on an already-approved tool forces re-approval, never silent trust.
- MCP sampling is an admission decision, not an implicit capability. A server
  request to invoke the client model is denied by default and requires
  permission, audit and optional human approval.
- Tool integrity must be verified, not assumed. A tool may return wrong or stale
  data with no error, so MCP tools must carry a freshness or integrity signal
  such as a staleness flag or content hash, and the consumer must verify it
  rather than trust a status field alone.
- External MCP servers are third-party supply chain. Provenance, a pinned
  version and a binary checksum are required before trust, as for any
  third-party dependency.

## Syntax Example

```galerina
boundary ai_tool CustomerSupportMcp {
  protocol mcp
  transport http

  auth {
    oauth_resource_server true
    token_audience "customer-support-mcp"
    require protected_resource_metadata
    deny token_passthrough
  }

  tools {
    allow searchTickets using SupportTicketSearchTool
    allow getCustomerSummary using CustomerSummaryTool
    deny deleteCustomer
  }

  resources {
    allow SupportArticles view: public
    allow CustomerTickets view: private requires permission support.private.read
    deny PaymentTokens view: secret
  }

  permission use support_ai_tool_access
}
```

## Report Targets

```text
mcp-tool-index.json
mcp-tool-definitions.json
mcp-effective-permissions.json
mcp-resource-exposure.json
mcp-token-boundary-report.json
mcp-vault-access-report.json
mcp-tool-definition-pinning-report.json
mcp-sampling-admission-report.json
mcp-tool-integrity-report.json
mcp-server-supplychain-report.json
mcp-ai-summary.json
```

## V1 Position

MCP is a platform concept, not a core language requirement. V1 should document
the boundary rules and report targets so future MCP support cannot bypass
Galerina permissions, effects, classification, vault rules or audit requirements.

## Knowledge Base

See [MCP AI Tool Boundaries](../Knowledge-Bases/mcp-ai-tool-boundaries.md).
