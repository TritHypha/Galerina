// Computes every example's expected output from the shipped helpers.
import * as A from "../dist/index.js";
import { examples as E, NOW } from "./fixtures-agent-governance.mjs";
export function outputs() {
  const s = E["sandbox-and-approval"];
  return {
    "merge-policy": A.applyAgentMergePolicy(E["merge-policy"].findings, E["merge-policy"].policy),
    "security-report": A.createAgentReport({ ...E["security-report"], findings: E["merge-policy"].findings, mergePolicy: E["merge-policy"].policy }),
    "capability-separation": A.validateAgentManifest(E["capability-separation"]),
    "sandbox-and-approval": { sandbox: A.validateSandboxPolicy(s.sandbox), gate: A.evaluateHumanApprovalGate(s.action, s.requester, s.approvals, NOW) },
    "trust-root-protection": A.createSelfModificationReport(E["trust-root-protection"].agent, E["trust-root-protection"].intents, E["trust-root-protection"].policy),
    "loop-protection": A.createLoopProtectionReport(E["loop-protection"].observations, E["loop-protection"].limits),
  };
}
