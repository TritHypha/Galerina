# Reports: MCP

## Purpose

MCP reports prove how Model Context Protocol tools, resources and prompts are
declared, permissioned, bounded, exposed and audited in Galerina.

## Short Definition

An MCP report is generated evidence for AI/tool boundary access through MCP.

## Report Family

```text
mcp-tool-index.json
mcp-tool-definitions.json
mcp-effective-permissions.json
mcp-resource-exposure.json
mcp-token-boundary-report.json
mcp-vault-access-report.json
mcp-ai-summary.json
```

## Required Report Questions

MCP reports should answer:

- Which MCP servers and clients are declared?
- Which tools, resources and prompts are exposed?
- Which tools are denied?
- Which permissions and capabilities are required?
- Which effects can each tool perform?
- Which data classifications can enter AI context?
- Which vault entries can be read or written?
- Which token audience and protected resource metadata rules apply?
- Which calls need human approval?
- Which audit events are required?

## Example

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
  "dataExposure": {
    "allowed": [
      { "field": "id", "classification": "public_id" },
      { "field": "name", "classification": "pii" },
      { "field": "email", "classification": "pii" }
    ],
    "denied": [
      { "field": "paymentToken", "classification": "credential" },
      { "field": "passwordHash", "classification": "secret" }
    ]
  },
  "auditRequired": true,
  "safe": true
}
```

## Safety Rules

- MCP reports must not include raw secrets, tokens or sensitive payload dumps.
- Reports must distinguish declared tool capabilities from granted permissions.
- Token reports must show audience and resource-boundary checks without printing
  bearer tokens.
- Vault reports must show typed access and ownership checks without dumping
  stored values.
- AI summaries must be safe for AI tooling by default.
