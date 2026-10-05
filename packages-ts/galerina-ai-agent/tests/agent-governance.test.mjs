import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import * as A from "../dist/index.js";
import { examples, NOW, reviewer } from "./fixtures-agent-governance.mjs";
import { outputs } from "./example-outputs.mjs";

const codes = (v) => v.diagnostics.map((d) => d.code).sort();
const DIGEST = `sha256:${"a".repeat(64)}`;

describe("examples are exactly what the helpers compute", () => {
  const computed = outputs();
  for (const name of Object.keys(examples)) {
    it(`examples/${name}.example.json`, () => {
      const file = JSON.parse(readFileSync(new URL(`../examples/${name}.example.json`, import.meta.url), "utf8"));
      assert.deepEqual(file.input, examples[name]);
      assert.deepEqual(file.expected, JSON.parse(JSON.stringify(computed[name])));
    });
  }
  it("merge-policy example drops the evidence-free High finding and keeps the low one for review", () => {
    const m = computed["merge-policy"];
    assert.deepEqual(m.dropped.map((f) => f.title), ["Possible secret in log"]);
    assert.equal(m.included.length, 2);
  });
  it("security report requires human review (timeout, unsafe tool, Critical finding)", () => {
    assert.equal(computed["security-report"].humanReviewRequired, true);
  });
  it("separated capability classes and the sandbox/approval example are allowed", () => {
    assert.equal(computed["capability-separation"].allowed, true);
    assert.equal(computed["sandbox-and-approval"].gate.allowed, true);
  });
  it("loop protection terminates the runaway, crashing and stalled agents", () => {
    assert.deepEqual(computed["loop-protection"].terminated.map((t) => t.reason), ["iterations", "crashes", "stalled"]);
  });
});

describe("validateSupervisedTaskGroup", () => {
  it("admits declared, unique members within the group deadline", () => {
    assert.equal(A.validateSupervisedTaskGroup({ name: "g", timeoutMs: 30_000, agents: ["reviewer"], cancelOnFailure: true }, [reviewer]).allowed, true);
  });
  it("refuses unknown, duplicate and outliving members, and empty or unbounded groups", () => {
    const v = A.validateSupervisedTaskGroup({ name: "g", timeoutMs: 10_000, agents: ["reviewer", "reviewer", "ghost"], cancelOnFailure: true }, [reviewer]);
    assert.deepEqual(codes(v), ["Galerina_AGENT_TASK_GROUP_DUPLICATE_MEMBER", "Galerina_AGENT_TASK_GROUP_MEMBER_OUTLIVES_GROUP", "Galerina_AGENT_TASK_GROUP_UNKNOWN_MEMBER"]);
    assert.deepEqual(codes(A.validateSupervisedTaskGroup({ name: "g", timeoutMs: Infinity, agents: [], cancelOnFailure: true }, [])), ["Galerina_AGENT_TASK_GROUP_EMPTY", "Galerina_AGENT_TASK_GROUP_TIMEOUT_REQUIRED"]);
  });
});

describe("validateAgentManifest (zero-trust manifest, class separation)", () => {
  const base = examples["capability-separation"];
  it("refuses unsigned manifests, wildcard or unscoped grants, mixed classes and ungranted effects", () => {
    const v = A.validateAgentManifest({
      ...base, signatureRequired: false,
      grants: [{ capability: "repo.*", capabilityClass: "read", scope: "repo" }, { capability: "x", capabilityClass: "read", scope: "" }, { capability: "x", capabilityClass: "deploy", scope: "env" }],
      effects: ["net.fetch"],
    });
    assert.deepEqual(codes(v), ["Galerina_AGENT_MANIFEST_CLASS_MIXED", "Galerina_AGENT_MANIFEST_EFFECT_UNGRANTED", "Galerina_AGENT_MANIFEST_GRANT_UNSCOPED", "Galerina_AGENT_MANIFEST_GRANT_WILDCARD", "Galerina_AGENT_MANIFEST_UNSIGNED"]);
  });
  it("refuses unknown manifest grant classes and data classifications", () => {
    assert.ok(codes(A.validateAgentManifest({ ...base, grants: [{ ...base.grants[0], capabilityClass: "owner" }] })).includes("Galerina_AGENT_MANIFEST_GRANT_CLASS_INVALID"));
    assert.ok(codes(A.validateAgentManifest({ ...base, maxDataClassification: "unclassified" })).includes("Galerina_AGENT_MANIFEST_CLASSIFICATION_INVALID"));
  });
});

describe("routeAgentMessage (typed bus, data classification)", () => {
  const channels = [{ topic: "review", payloadType: "Review", clearance: "internal", allowedSenders: ["reviewer"], allowedReceivers: ["merger"] }];
  const ok = { from: "reviewer", to: "merger", topic: "review", payloadType: "Review", classification: "internal" };
  it("routes a typed, cleared message", () => assert.equal(A.routeAgentMessage(ok, channels).allowed, true));
  it("refuses unknown topics, wrong types, parties and over-classified data", () => {
    assert.deepEqual(codes(A.routeAgentMessage({ ...ok, topic: "other" }, channels)), ["Galerina_AGENT_BUS_UNKNOWN_TOPIC"]);
    assert.deepEqual(codes(A.routeAgentMessage({ from: "x", to: "y", topic: "review", payloadType: "Diff", classification: "secret" }, channels)), ["Galerina_AGENT_BUS_CLASSIFICATION", "Galerina_AGENT_BUS_PAYLOAD_TYPE", "Galerina_AGENT_BUS_RECEIVER", "Galerina_AGENT_BUS_SENDER"]);
  });
  it("refuses classifications outside the declared closed set", () => {
    assert.deepEqual(codes(A.routeAgentMessage({ ...ok, classification: "unclassified" }, channels)), ["Galerina_AGENT_BUS_CLASSIFICATION"]);
    assert.deepEqual(codes(A.routeAgentMessage(ok, [{ ...channels[0], clearance: "unclassified" }])), ["Galerina_AGENT_BUS_CLASSIFICATION"]);
  });
});

describe("evaluateToolGatewayCall (tool gateway, secret/memory/cache guards)", () => {
  const policy = { secretMarkers: ["-----BEGIN", "ghp_"] };
  const call = { agent: "reviewer", tool: "repo.read", argumentText: "src/a.ts", requestedMemoryBytes: 1024, classification: "internal", cacheable: true };
  it("allows an allowed tool within budget", () => assert.equal(A.evaluateToolGatewayCall(call, reviewer, policy).allowed, true));
  it("refuses denied/undeclared tools, secrets, over-budget memory, caching confidential data and identity mismatch", () => {
    assert.deepEqual(codes(A.evaluateToolGatewayCall({ ...call, tool: "shell" }, reviewer, policy)), ["Galerina_AGENT_GATEWAY_TOOL_DENIED"]);
    assert.deepEqual(codes(A.evaluateToolGatewayCall({ ...call, tool: "net.fetch" }, reviewer, policy)), ["Galerina_AGENT_GATEWAY_TOOL_DENIED"]);
    assert.deepEqual(codes(A.evaluateToolGatewayCall({ agent: "other", tool: "repo.read", argumentText: "token ghp_abc", requestedMemoryBytes: 2 ** 40, classification: "secret", cacheable: true }, reviewer, policy)),
      ["Galerina_AGENT_GATEWAY_CACHE", "Galerina_AGENT_GATEWAY_IDENTITY", "Galerina_AGENT_GATEWAY_MEMORY", "Galerina_AGENT_GATEWAY_SECRET_IN_ARGUMENTS"]);
  });
  it("deny wins when a tool is both allowed and denied", () => {
    const mixed = { ...reviewer, tools: [{ tool: "repo.read", decision: "allow" }, { tool: "repo.read", decision: "deny" }] };
    assert.equal(A.evaluateToolGatewayCall(call, mixed, policy).allowed, false);
  });
  it("refuses unknown data classifications even when caching would otherwise be allowed", () => {
    assert.ok(codes(A.evaluateToolGatewayCall({ ...call, classification: "unclassified" }, reviewer, policy)).includes("Galerina_AGENT_GATEWAY_CLASSIFICATION"));
  });
});

describe("admitMcpTools (MCP boundary gateway)", () => {
  it("admits only pinned servers with matching digest and allowlisted tools; descriptions untrusted", () => {
    const r = A.admitMcpTools(
      [{ server: "git", serverDigest: DIGEST, tool: "log" }, { server: "git", serverDigest: DIGEST, tool: "push" }, { server: "git", serverDigest: `sha256:${"b".repeat(64)}`, tool: "log" }, { server: "web", serverDigest: DIGEST, tool: "get" }],
      [{ server: "git", serverDigest: DIGEST, allowedTools: ["log"] }],
    );
    assert.deepEqual(r.admitted, ["git/log"]);
    assert.deepEqual(r.refused.map((x) => x.code), ["Galerina_AGENT_MCP_TOOL_NOT_ALLOWED", "Galerina_AGENT_MCP_SERVER_DIGEST", "Galerina_AGENT_MCP_SERVER_UNPINNED"]);
    assert.equal(r.descriptionsTrusted, false);
  });
});

describe("attenuateLease (capability lease attenuation)", () => {
  const parent = { capability: "repo.write", scope: "repo/docs", holder: "kernel", expiresAtMs: NOW + 60_000, maxUses: 10 };
  it("allows a strictly narrower child", () => {
    assert.equal(A.attenuateLease(parent, { ...parent, holder: "bot", scope: "repo/docs/api", expiresAtMs: NOW + 1000, maxUses: 1 }, NOW).allowed, true);
  });
  it("refuses any widening and expired parents", () => {
    assert.deepEqual(codes(A.attenuateLease(parent, { capability: "repo.admin", scope: "repo/docsx", holder: "bot", expiresAtMs: NOW + 120_000, maxUses: 11 }, NOW)),
      ["Galerina_AGENT_LEASE_CAPABILITY_WIDENED", "Galerina_AGENT_LEASE_EXPIRY_WIDENED", "Galerina_AGENT_LEASE_SCOPE_WIDENED", "Galerina_AGENT_LEASE_USES_WIDENED"]);
    assert.ok(codes(A.attenuateLease(parent, parent, NOW + 60_000)).includes("Galerina_AGENT_LEASE_PARENT_EXPIRED"));
  });
});

describe("decideAiCapabilityRequest (authority-kernel separation)", () => {
  const request = { requester: "release-bot", capability: "deploy.staging", capabilityClass: "deploy", scope: "env/staging", justification: "release 1.2" };
  it("allows a kernel decision with human approval for deploy", () => {
    assert.equal(A.decideAiCapabilityRequest({ request, decidedBy: "kernel", decidedByKind: "authority-kernel", humanApprovalId: "APR-1" }).allowed, true);
  });
  it("refuses agent self-grants, missing approval, justification and scope", () => {
    assert.deepEqual(codes(A.decideAiCapabilityRequest({ request: { ...request, justification: " ", scope: "env/*" }, decidedBy: "release-bot", decidedByKind: "agent", humanApprovalId: "" })),
      ["Galerina_AGENT_AUTHORITY_HUMAN_APPROVAL", "Galerina_AGENT_AUTHORITY_JUSTIFICATION", "Galerina_AGENT_AUTHORITY_NOT_KERNEL", "Galerina_AGENT_AUTHORITY_SELF_GRANT", "Galerina_AGENT_AUTHORITY_UNSCOPED"]);
  });
  it("read and tool classes need no human approval", () => {
    assert.equal(A.decideAiCapabilityRequest({ request: { ...request, capabilityClass: "read" }, decidedBy: "kernel", decidedByKind: "authority-kernel", humanApprovalId: "" }).allowed, true);
  });
  it("refuses unknown capability classes even when an approval id is supplied", () => {
    assert.ok(codes(A.decideAiCapabilityRequest({ request: { ...request, capabilityClass: "owner" }, decidedBy: "kernel", decidedByKind: "authority-kernel", humanApprovalId: "APR-1" })).includes("Galerina_AGENT_AUTHORITY_CLASS_INVALID"));
  });
});

describe("transitionQuarantine (AI-generated code quarantine)", () => {
  const q = { artifactDigest: DIGEST, authorAgent: "coder", state: "quarantined", reviewer: "", reviewEvidence: "" };
  it("releases only via independent, evidenced review", () => {
    const reviewed = { ...q, state: "reviewed", reviewer: "phillip", reviewEvidence: "PR #12 review" };
    assert.equal(A.transitionQuarantine(q, reviewed).allowed, true);
    assert.equal(A.transitionQuarantine(reviewed, { ...reviewed, state: "released" }).allowed, true);
  });
  it("refuses skipping review, self-review, digest swaps and leaving terminal states", () => {
    assert.deepEqual(codes(A.transitionQuarantine(q, { ...q, state: "released", reviewer: "coder", reviewEvidence: "" })),
      ["Galerina_AGENT_QUARANTINE_EVIDENCE", "Galerina_AGENT_QUARANTINE_SELF_REVIEW", "Galerina_AGENT_QUARANTINE_TRANSITION"]);
    assert.ok(codes(A.transitionQuarantine(q, { ...q, artifactDigest: `sha256:${"c".repeat(64)}`, state: "rejected" })).includes("Galerina_AGENT_QUARANTINE_DIGEST"));
    assert.ok(codes(A.transitionQuarantine({ ...q, state: "rejected" }, { ...q, state: "quarantined" })).includes("Galerina_AGENT_QUARANTINE_TRANSITION"));
  });
});

describe("sandbox policy and human approval gate", () => {
  it("refuses spawn, contradictory or wildcard network policies", () => {
    assert.deepEqual(codes(A.validateSandboxPolicy({ network: "deny", networkAllowlist: ["a"], filesystem: "deny", processSpawn: "allow" })), ["Galerina_AGENT_SANDBOX_NETWORK_CONTRADICTION", "Galerina_AGENT_SANDBOX_SPAWN"]);
    assert.deepEqual(codes(A.validateSandboxPolicy({ network: "allowlist", networkAllowlist: ["*.example.com"], filesystem: "deny", processSpawn: "deny" })), ["Galerina_AGENT_SANDBOX_NETWORK_ALLOWLIST"]);
    assert.deepEqual(codes(A.validateSandboxPolicy({ network: "allow", networkAllowlist: [], filesystem: "unrestricted", processSpawn: "deny" })), ["Galerina_AGENT_SANDBOX_FILESYSTEM_INVALID", "Galerina_AGENT_SANDBOX_NETWORK_INVALID"]);
  });
  it("closes the gate for missing, expired, self-issued or other-action approvals", () => {
    const a = examples["sandbox-and-approval"];
    assert.equal(A.evaluateHumanApprovalGate(a.action, a.requester, [], NOW).allowed, false);
    assert.equal(A.evaluateHumanApprovalGate(a.action, a.requester, a.approvals, a.approvals[0].expiresAtMs).allowed, false);
    assert.equal(A.evaluateHumanApprovalGate(a.action, "phillip", a.approvals, NOW).allowed, false);
    assert.equal(A.evaluateHumanApprovalGate("deploy.prod", a.requester, a.approvals, NOW).allowed, false);
    assert.equal(A.evaluateHumanApprovalGate(a.action, a.requester, [{ ...a.approvals[0], approver: "" }], NOW).allowed, false);
  });
});

describe("immutable AI audit log", () => {
  it("sha256Hex matches node:crypto, including multi-block and non-ASCII input", () => {
    for (const s of ["", "abc", "x".repeat(55), "y".repeat(64), "z".repeat(1000), "caf\u00e9 \u2713"]) {
      assert.equal(A.sha256Hex(s), createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });
  it("a chained log verifies, and any edit, removal, reorder or insertion breaks it", () => {
    let log = [];
    for (const action of ["request", "decide", "execute"]) log = A.appendAiAuditEntry(log, "bot", action, `detail ${action}`);
    assert.equal(A.verifyAiAuditLog(log).allowed, true);
    assert.equal(log[0].previousDigest, A.AI_AUDIT_GENESIS);
    assert.ok(Object.isFrozen(log) && Object.isFrozen(log[0]));
    const broken = [
      [{ ...log[0], detail: "edited" }, log[1], log[2]],
      [log[0], log[2]],
      [log[1], log[0], log[2]],
      [log[0], log[0], log[1], log[2]],
    ];
    for (const b of broken) assert.deepEqual(codes(A.verifyAiAuditLog(b)), ["Galerina_AGENT_AUDIT_CHAIN_BROKEN"]);
  });
});
