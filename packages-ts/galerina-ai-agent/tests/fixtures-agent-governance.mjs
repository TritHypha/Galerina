// Shared example inputs for the agent-governance examples and tests.
export const NOW = 1_800_000_000_000;
export const reviewer = {
  name: "reviewer", inputType: "Diff", outputType: "Review",
  tools: [{ tool: "repo.read", decision: "allow", scope: "repo/src" }, { tool: "shell", decision: "deny" }],
  effects: ["repo.read"], permissions: ["read"],
  limits: { timeoutMs: 20_000, memoryBytes: 128 * 1024 * 1024, maxToolCalls: 8 },
  failureBehaviour: "return_typed_error",
};
export const examples = {
  "merge-policy": {
    findings: [
      { title: "SQL injection in /search", severity: "Critical", evidence: "src/search.ts:42 concatenates input", confidence: 0.92 },
      { title: "Possible secret in log", severity: "High", evidence: "", confidence: 0.9 },
      { title: "Unused import", severity: "Low", evidence: "src/a.ts:1", confidence: 0.4 },
    ],
    policy: { name: "security-review", requireEvidenceFor: ["High", "Critical"], minimumConfidence: 0.6, lowConfidenceAction: "review" },
  },
  "security-report": {
    flow: "pr-security-review", parallel: true, timeoutMs: 60_000,
    runs: [
      { name: "reviewer", status: "passed", toolCalls: 5, memoryBytes: 64 * 1024 * 1024, durationMs: 12_000 },
      { name: "fuzzer", status: "timeout", toolCalls: 8, memoryBytes: 96 * 1024 * 1024, durationMs: 60_000 },
    ],
    unsafeToolsUsed: ["shell"],
  },
  "capability-separation": {
    name: "release-bot", version: "1.0.0", signatureRequired: true, maxDataClassification: "internal",
    grants: [
      { capability: "repo.read", capabilityClass: "read", scope: "repo/src" },
      { capability: "repo.write", capabilityClass: "write", scope: "repo/docs" },
      { capability: "lint.run", capabilityClass: "tool", scope: "repo/src" },
      { capability: "registry.publish", capabilityClass: "package", scope: "registry/@galerina/example" },
      { capability: "deploy.staging", capabilityClass: "deploy", scope: "env/staging" },
    ],
    effects: ["repo.read", "repo.write", "lint.run", "registry.publish", "deploy.staging"],
  },
  "sandbox-and-approval": {
    sandbox: { network: "allowlist", networkAllowlist: ["registry.npmjs.org"], filesystem: "scratch-only", processSpawn: "deny" },
    action: "deploy.staging", requester: "release-bot",
    approvals: [{ approvalId: "APR-0001", approver: "phillip", action: "deploy.staging", expiresAtMs: 1_800_000_600_000 }],
  },
  "trust-root-protection": {
    agent: "release-bot",
    intents: [
      { agent: "release-bot", path: "docs/CHANGELOG.md" },
      { agent: "release-bot", path: "governance/trust-roots/root.pub" },
      { agent: "release-bot", path: "agents/release-bot/manifest.json" },
      { agent: "release-bot", path: "docs/../governance/trust-roots/root.pub" },
    ],
    policy: { trustRoots: ["governance/trust-roots", ".github/workflows"], selfDefinitionPaths: ["agents/release-bot"] },
  },
  "loop-protection": {
    observations: [
      { agent: "planner", iterations: 12, crashes: 0, identicalOutputsInARow: 1 },
      { agent: "coder", iterations: 400, crashes: 0, identicalOutputsInARow: 2 },
      { agent: "tester", iterations: 20, crashes: 4, identicalOutputsInARow: 0 },
      { agent: "summariser", iterations: 30, crashes: 0, identicalOutputsInARow: 9 },
    ],
    limits: { maxIterations: 100, maxCrashes: 2, maxIdenticalOutputs: 5 },
  },
};
