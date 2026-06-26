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
mcp-ai-summary.json
```

## V1 Position

MCP is a platform concept, not a core language requirement. V1 should document
the boundary rules and report targets so future MCP support cannot bypass
Galerina permissions, effects, classification, vault rules or audit requirements.

## Knowledge Base

See [MCP AI Tool Boundaries](../Knowledge-Bases/mcp-ai-tool-boundaries.md).
