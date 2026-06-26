# MCP AI Tool Boundaries

## Purpose

Galerina may support the Model Context Protocol (MCP) as a controlled integration
boundary for AI tools, resources and prompts.

MCP connects AI systems to external context and actions. Galerina's role is to
make that access typed, permissioned, classified, bounded, audited and
reportable.

## Short Definition

```text
MCP boundary = declared AI/tool access through data, flow, permission, boundary and report
```

## Core Rule

```text
All MCP tools, resources and prompts must be declared as Galerina AI/tool boundaries before use.
```

A Galerina flow may call MCP tools only through a declared AI/tool contract with:

- typed input and output
- data classification
- required permission
- allowed effects
- tool/resource limits
- token-boundary rules
- audit requirements
- generated reports

## Concept Mapping

| MCP concept | Galerina concept | Meaning |
| --- | --- | --- |
| MCP server | `boundary ai_tool` or `boundary external` | Server that exposes context or tools |
| Tool | declared tool action / secure flow | Function the AI may ask to execute |
| Resource | typed data/context boundary | Context or data exposed to the AI or host |
| Prompt | AI workflow contract | Reusable prompt/workflow template |
| Client/host | actor / runtime caller | Caller requesting context or tools |
| Authorization scopes | permissions / capabilities | Authority required to use the tool or data |
| Tool execution | secure flow | Checked execution path |
| Tool result | response/view contract | Safe output from the tool |
| Audit/security | generated reports | Proof of allowed, denied and used access |

## Five-Part Galerina Model

```text
data       = MCP resources, tool inputs, tool outputs, prompt context and vault entries
flow       = typed Galerina flow invoked through the MCP boundary
permission = OAuth/auth plus Galerina permission, capability, effect and approval rules
boundary   = MCP server, client, tool, resource, prompt, filesystem root, network or vault crossing
report     = proof of exposure, access, denial, approval and token-boundary checks
```

## Boundary Example

```galerina
boundary ai_tool CustomerSupportMcp {
  protocol mcp
  transport http
  server "customer-support"

  tools {
    allow searchTickets
    allow getCustomerSummary
    deny deleteCustomer
    deny exportCustomerData
  }

  resources {
    allow SupportArticles view: public
    allow CustomerTickets view: private requires permission support.private.read
    deny PaymentTokens view: secret
  }

  auth {
    oauth_resource_server true
    token_audience "customer-support-mcp"
    require protected_resource_metadata
    deny token_passthrough
  }

  permission use support_ai_tool_access
}
```

## Tool Contract Example

```galerina
contract ai_tool CustomerLookupTool {
  protocol mcp
  tool getCustomerById

  input {
    customerId: UUID view: public
  }

  output CustomerToolResult {
    id: UUID view: public
    name: String view: private
    email: Email view: private
  }

  deny output {
    passwordHash view: secret
    paymentToken view: secret
    internalRiskScore view: internal
  }

  permission use customer_lookup_ai_tool

  limits {
    timeout 3s
    maxCallsPerRequest 3
  }

  audit {
    required true
    event "mcp.customer.lookup"
  }
}
```

## Flow Example

```galerina
flow answerCustomerQuestion(
  request: SupportQuestion,
  ctx: RequestContext
) -> AnswerCustomerQuestionResult
  permission use support_ai_assistant
contract {
  types {
    type AnswerCustomerQuestionResult = Result<SupportAnswer, AiToolError>
  }
}
{
  let customer = try CustomerSupportMcp.getCustomerById(request.customerId)
    using CustomerLookupTool

  return Ok(SupportAnswer.from(customer))
}
```

## Permission Rules

MCP tool availability is not permission.

Galerina should check:

- whether the MCP client may connect
- whether the actor may call the tool
- whether the tool may see the requested data
- whether the tool may perform the requested effects
- whether the call needs human approval
- whether the tool output may enter AI context
- whether the result may leave through the selected response/view

## Token Boundary Rules

For HTTP MCP transports, Galerina should follow the MCP authorization model rather
than invent hidden login behaviour.

Rules:

- protected MCP servers act as OAuth resource servers
- MCP clients act as OAuth clients
- access tokens must be issued for the intended MCP server
- clients must use protected resource metadata for authorization discovery
- token passthrough is denied
- sessions are not authentication
- all inbound authorized requests remain subject to Galerina permission checks

## Vault Rules

Scoped vaults may support MCP workflows, but MCP clients must not receive generic
vault access.

Allowed:

```galerina
tool Orders.preview uses vault.session.CustomerProfileData
  when permission OrdersPreview is granted
```

Rejected:

```galerina
tool Vault.getAnything
```

Vault access through MCP must be:

- typed
- owner-checked
- TTL-limited
- permission-checked
- classification-aware
- auditable

## Generated Reports

Galerina should generate MCP report targets such as:

```text
mcp-tool-index.json
mcp-tool-definitions.json
mcp-effective-permissions.json
mcp-resource-exposure.json
mcp-token-boundary-report.json
mcp-vault-access-report.json
mcp-ai-summary.json
```

Example report shape:

```json
{
  "reportType": "galerina.mcp.effective_permissions",
  "tool": "CustomerSupportMcp.getCustomerById",
  "actor": "support-ai-agent",
  "allowed": true,
  "requiredPermissions": [
    "ai.agent.support",
    "support.read",
    "support.pii.read"
  ],
  "allowedEffects": [
    "mcp.tool.call",
    "audit.write"
  ],
  "deniedEffects": [
    "storage.write",
    "file.write",
    "secret.read"
  ],
  "auditRequired": true,
  "safe": true
}
```

## Priority Placement

MCP support is a platform concept.

It should not be treated as a v1 core-language requirement unless the secure web
runtime needs an AI/tool gateway. The v1 requirement is to preserve the boundary
rules so MCP can be added without weakening Galerina's security model.

## Best Short Statement

```text
MCP connects AI systems to tools and context.
Galerina controls, types, limits and reports how those capabilities are used.
```
