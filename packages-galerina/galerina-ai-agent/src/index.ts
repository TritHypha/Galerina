export type AgentToolDecision = "allow" | "deny";

export type AgentFailureBehaviour =
  | "fail_group"
  | "return_typed_error"
  | "cancel_dependents"
  | "continue_with_warning";

export interface AgentToolPermission {
  readonly tool: string;
  readonly decision: AgentToolDecision;
  readonly scope?: string;
}

export interface AgentLimits {
  readonly timeoutMs: number;
  readonly memoryBytes: number;
  readonly maxToolCalls: number;
  readonly maxTokens?: number;
  readonly rateLimitPerMinute?: number;
}

export interface AgentDefinition {
  readonly name: string;
  readonly inputType: string;
  readonly outputType: string;
  readonly tools: readonly AgentToolPermission[];
  readonly effects: readonly string[];
  readonly permissions: readonly string[];
  readonly limits: AgentLimits;
  readonly failureBehaviour: AgentFailureBehaviour;
}

export interface AgentTaskGroupPlan {
  readonly name: string;
  readonly timeoutMs: number;
  readonly agents: readonly string[];
  readonly cancelOnFailure: boolean;
}

export interface AgentFinding {
  readonly title: string;
  readonly severity: "Low" | "Medium" | "High" | "Critical";
  readonly evidence: string;
  readonly confidence: number;
}

export interface AgentResult {
  readonly agent: string;
  readonly status: "passed" | "failed" | "canceled" | "timeout";
  readonly findings: readonly AgentFinding[];
  readonly confidence: number;
  readonly error?: string;
}

export interface AgentMergePolicy {
  readonly name: string;
  readonly requireEvidenceFor: readonly AgentFinding["severity"][];
  readonly minimumConfidence: number;
  readonly lowConfidenceAction: "drop" | "review" | "include_with_warning";
}

export interface AgentReport {
  readonly flow: string;
  readonly parallel: boolean;
  readonly timeoutMs: number;
  readonly agents: readonly {
    readonly name: string;
    readonly status: AgentResult["status"];
    readonly toolCalls: number;
    readonly memoryBytes: number;
    readonly durationMs: number;
  }[];
  readonly unsafeToolsUsed: readonly string[];
  readonly humanReviewRequired: boolean;
  readonly warnings: readonly string[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below are the runtime
// enforcement of that contract, mirroring the sibling AI packages
// (galerina-ai, galerina-ai-neural, galerina-ai-lowbit): fail-closed validators
// that return typed diagnostics, plus policy/report builders. They own no model
// inference, scheduling or security primitives — only the agent-contract checks.

export type AgentDiagnosticSeverity = "warning" | "error";

export interface AgentDiagnostic {
  readonly code: string;
  readonly severity: AgentDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// One row of the per-agent execution statistics carried in an AgentReport.
export interface AgentRunStat {
  readonly name: string;
  readonly status: AgentResult["status"];
  readonly toolCalls: number;
  readonly memoryBytes: number;
  readonly durationMs: number;
}

export interface AgentMergeOutcome {
  readonly included: readonly AgentFinding[];
  readonly dropped: readonly AgentFinding[];
  readonly warnings: readonly string[];
}

function agentDiagnostic(
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

// A supervised task group must name itself, bound its runtime and carry at least
// one member agent.
export function validateAgentTaskGroupPlan(
  plan: AgentTaskGroupPlan,
): readonly AgentDiagnostic[] {
  const diagnostics: AgentDiagnostic[] = [];

  if (plan.name.trim().length === 0) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_TASK_GROUP_NAME_REQUIRED",
      "error",
      "Agent task group requires a name.",
      "name",
    ));
  }

  if (!(plan.timeoutMs > 0)) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_TASK_GROUP_TIMEOUT_REQUIRED",
      "error",
      "Agent task group requires a positive timeout.",
      "timeoutMs",
    ));
  }

  if (plan.agents.length === 0) {
    diagnostics.push(agentDiagnostic(
      "Galerina_AGENT_TASK_GROUP_EMPTY",
      "error",
      "Agent task group requires at least one member agent.",
      "agents",
    ));
  }

  return diagnostics;
}

// Apply a merge policy to a set of findings. Fail-closed: a finding whose
// severity demands evidence but carries none is dropped (never silently merged);
// low-confidence findings are dropped, kept-for-review, or kept-with-warning per
// the policy's declared lowConfidenceAction.
export function applyAgentMergePolicy(
  findings: readonly AgentFinding[],
  policy: AgentMergePolicy,
): AgentMergeOutcome {
  const included: AgentFinding[] = [];
  const dropped: AgentFinding[] = [];
  const warnings: string[] = [];

  for (const finding of findings) {
    const evidenceRequired = policy.requireEvidenceFor.includes(finding.severity);
    if (evidenceRequired && finding.evidence.trim().length === 0) {
      dropped.push(finding);
      warnings.push(
        `Dropped ${finding.severity} finding "${finding.title}": evidence required but missing.`,
      );
      continue;
    }

    if (finding.confidence < policy.minimumConfidence) {
      if (policy.lowConfidenceAction === "drop") {
        dropped.push(finding);
        warnings.push(
          `Dropped low-confidence finding "${finding.title}" (${finding.confidence} < ${policy.minimumConfidence}).`,
        );
        continue;
      }
      included.push(finding);
      warnings.push(
        policy.lowConfidenceAction === "review"
          ? `Low-confidence finding "${finding.title}" retained for human review.`
          : `Low-confidence finding "${finding.title}" included with warning.`,
      );
      continue;
    }

    included.push(finding);
  }

  return { included, dropped, warnings };
}

// Build a supervised-run report. Human review is required whenever any agent did
// not pass, any surviving finding is High/Critical, or any unsafe tool was used —
// none of which a supervisor may auto-approve.
export function createAgentReport(input: {
  readonly flow: string;
  readonly parallel: boolean;
  readonly timeoutMs: number;
  readonly runs: readonly AgentRunStat[];
  readonly findings?: readonly AgentFinding[];
  readonly mergePolicy?: AgentMergePolicy;
  readonly unsafeToolsUsed?: readonly string[];
}): AgentReport {
  const unsafeToolsUsed = input.unsafeToolsUsed ?? [];
  const rawFindings = input.findings ?? [];
  const outcome = input.mergePolicy === undefined
    ? { included: rawFindings, dropped: [] as readonly AgentFinding[], warnings: [] as readonly string[] }
    : applyAgentMergePolicy(rawFindings, input.mergePolicy);

  const warnings: string[] = [...outcome.warnings];

  const notPassed = input.runs.filter((run) => run.status !== "passed");
  for (const run of notPassed) {
    warnings.push(`Agent "${run.name}" did not pass (status: ${run.status}).`);
  }
  for (const tool of unsafeToolsUsed) {
    warnings.push(`Unsafe tool "${tool}" was used and requires review.`);
  }

  const hasHighImpactFinding = outcome.included.some(
    (finding) => finding.severity === "High" || finding.severity === "Critical",
  );

  const humanReviewRequired =
    notPassed.length > 0 || unsafeToolsUsed.length > 0 || hasHighImpactFinding;

  return {
    flow: input.flow,
    parallel: input.parallel,
    timeoutMs: input.timeoutMs,
    agents: input.runs.map((run) => ({
      name: run.name,
      status: run.status,
      toolCalls: run.toolCalls,
      memoryBytes: run.memoryBytes,
      durationMs: run.durationMs,
    })),
    unsafeToolsUsed,
    humanReviewRequired,
    warnings,
  };
}
