// Agent definition validators (moved out of index.ts, Grok 2026-10-05).
//
// agent-declaration.ts needs validateAgentDefinition. It used to import it from
// index.ts, which itself re-exports agent-declaration.ts: a runtime import cycle that
// only worked because the binding was read at call time. This module imports nothing
// at runtime (type-only imports are erased), so neither index.ts nor
// agent-declaration.ts depends on module evaluation order any more.

import type {
  AgentDefinition,
  AgentDiagnostic,
  AgentDiagnosticSeverity,
  AgentLimits,
  AgentToolDecision,
  AgentToolPermission,
} from "./index.js";

/** Internal helper shared with index.ts; not re-exported from the package entry. */
export function agentDiagnostic(
  code: string,
  severity: AgentDiagnosticSeverity,
  message: string,
  path?: string,
): AgentDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

// Every positive-limit rule an agent's resource budget must satisfy. A bound that
// is not a positive, finite number is rejected — an unbounded agent is unsafe.
export function validateAgentLimits(
  limits: AgentLimits,
  path = "limits",
): readonly AgentDiagnostic[] {
  const diagnostics: AgentDiagnostic[] = [];

  if (!(limits.timeoutMs > 0)) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_TIMEOUT_REQUIRED",
      "error",
      "Agent limits require a positive timeout.",
      `${path}.timeoutMs`,
    ));
  }

  if (!(limits.memoryBytes > 0)) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_MEMORY_LIMIT_REQUIRED",
      "error",
      "Agent limits require a positive memory budget.",
      `${path}.memoryBytes`,
    ));
  }

  if (!(limits.maxToolCalls > 0)) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_TOOL_CALL_LIMIT_REQUIRED",
      "error",
      "Agent limits require a positive maximum tool-call count.",
      `${path}.maxToolCalls`,
    ));
  }

  if (limits.maxTokens !== undefined && !(limits.maxTokens > 0)) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_MAX_TOKENS_INVALID",
      "error",
      "Agent max token budget, when set, must be positive.",
      `${path}.maxTokens`,
    ));
  }

  if (limits.rateLimitPerMinute !== undefined && !(limits.rateLimitPerMinute > 0)) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_RATE_LIMIT_INVALID",
      "error",
      "Agent rate limit, when set, must be positive.",
      `${path}.rateLimitPerMinute`,
    ));
  }

  return diagnostics;
}

// A tool that is both allowed and denied within one definition is a policy
// contradiction; fail-closed callers must treat it as denied. Reported as error.
export function validateAgentToolPermissions(
  tools: readonly AgentToolPermission[],
  path = "tools",
): readonly AgentDiagnostic[] {
  const diagnostics: AgentDiagnostic[] = [];
  const decisionByTool = new Map<string, AgentToolDecision>();

  tools.forEach((permission, index) => {
    if (permission.tool.trim().length === 0) {
      diagnostics.push(agentDiagnostic(
        "Galerina_AGENT_TOOL_NAME_REQUIRED",
        "error",
        "Agent tool permission requires a tool name.",
        `${path}.${index}.tool`,
      ));
      return;
    }

    const previous = decisionByTool.get(permission.tool);
    if (previous !== undefined && previous !== permission.decision) {
      diagnostics.push(agentDiagnostic(
        "Galerina_AGENT_TOOL_PERMISSION_CONFLICT",
        "error",
        `Tool "${permission.tool}" is both allowed and denied; fail-closed resolves to deny.`,
        `${path}.${index}`,
      ));
    }
    decisionByTool.set(permission.tool, permission.decision);
  });

  return diagnostics;
}

// Full structural + policy validation of an agent definition.
export function validateAgentDefinition(
  definition: AgentDefinition,
): readonly AgentDiagnostic[] {
  const diagnostics: AgentDiagnostic[] = [];

  if (definition.name.trim().length === 0) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_NAME_REQUIRED",
      "error",
      "Agent definition requires a name.",
      "name",
    ));
  }

  if (definition.inputType.trim().length === 0) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_INPUT_TYPE_REQUIRED",
      "error",
      "Agent definition requires an input type.",
      "inputType",
    ));
  }

  if (definition.outputType.trim().length === 0) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_OUTPUT_TYPE_REQUIRED",
      "error",
      "Agent definition requires an output type.",
      "outputType",
    ));
  }

  diagnostics.push(...validateAgentToolPermissions(definition.tools));
  diagnostics.push(...validateAgentLimits(definition.limits));

  return diagnostics;
}
