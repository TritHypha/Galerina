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
