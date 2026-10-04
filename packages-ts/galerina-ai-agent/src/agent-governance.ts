// Zero-trust agent governance contracts (TODO pass, Grok 2026-10-05).
//
// Every helper here is a pure, fail-closed decision over typed records: it returns a
// verdict plus typed diagnostics and never performs I/O, never grants authority on its
// own and never trusts a field the caller did not declare. An agent may REQUEST a
// capability; only the authority kernel (a non-agent principal) may GRANT one. The
// defaults are deny: anything not explicitly declared is refused.

import type { AgentDefinition, AgentDiagnostic, AgentTaskGroupPlan } from "./index.js";

export interface GovernanceVerdict {
  readonly allowed: boolean;
  readonly diagnostics: readonly AgentDiagnostic[];
}

function deny(code: string, message: string, path: string): AgentDiagnostic {
  return { code, severity: "error", message, path };
}

function verdict(diagnostics: readonly AgentDiagnostic[]): GovernanceVerdict {
  return { allowed: diagnostics.length === 0, diagnostics };
}

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;
const isNonEmpty = (value: string): boolean => value.trim().length > 0;

// ── supervised task groups ───────────────────────────────────────────────────
// A supervised group may only run declared agents, each at most once, and no member
// may be allowed to outlive the group's own deadline.
export function validateSupervisedTaskGroup(
  plan: AgentTaskGroupPlan,
  definitions: readonly AgentDefinition[],
): GovernanceVerdict {
  const diagnostics: AgentDiagnostic[] = [];
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const seen = new Set<string>();
  plan.agents.forEach((name, index) => {
    const path = `agents.${index}`;
    if (seen.has(name)) {
      diagnostics.push(deny("Galerina_AGENT_TASK_GROUP_DUPLICATE_MEMBER", `Agent "${name}" appears twice in one group.`, path));
      return;
    }
    seen.add(name);
    if (!byName.has(name)) {
      diagnostics.push(deny("Galerina_AGENT_TASK_GROUP_UNKNOWN_MEMBER", `Agent "${name}" has no definition; undeclared agents never run.`, path));
      return;
    }
    const definition = byName.get(name) as AgentDefinition;
    if (!(definition.limits.timeoutMs <= plan.timeoutMs)) {
      diagnostics.push(deny("Galerina_AGENT_TASK_GROUP_MEMBER_OUTLIVES_GROUP", `Agent "${name}" timeout exceeds the group timeout.`, path));
    }
  });
  if (plan.agents.length === 0) {
    diagnostics.push(deny("Galerina_AGENT_TASK_GROUP_EMPTY", "Agent task group requires at least one member agent.", "agents"));
  }
  if (!isPositiveFinite(plan.timeoutMs)) {
    diagnostics.push(deny("Galerina_AGENT_TASK_GROUP_TIMEOUT_REQUIRED", "Agent task group requires a positive finite timeout.", "timeoutMs"));
  }
  return verdict(diagnostics);
}

// ── capability classes and the zero-trust agent manifest ────────────────────
export type AgentCapabilityClass = "read" | "write" | "tool" | "package" | "deploy";

export interface AgentCapabilityGrant {
  readonly capability: string;
  readonly capabilityClass: AgentCapabilityClass;
  readonly scope: string;
}

export type DataClassification = "public" | "internal" | "confidential" | "secret";

export const DATA_CLASSIFICATION_RANK: Readonly<Record<DataClassification, number>> = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  secret: 3,
});

export interface AgentManifest {
  readonly name: string;
  readonly version: string;
  readonly grants: readonly AgentCapabilityGrant[];
  readonly effects: readonly string[];
  readonly maxDataClassification: DataClassification;
  readonly signatureRequired: boolean;
}

const WILDCARD = /[*?]/;

// Deny-by-default: every declared effect must be backed by an explicit, scoped,
// non-wildcard grant; manifests must demand signatures; a single capability name may
// not appear under two classes (read/write/tool/package/deploy stay separate).
export function validateAgentManifest(manifest: AgentManifest): GovernanceVerdict {
  const diagnostics: AgentDiagnostic[] = [];
  if (!isNonEmpty(manifest.name)) diagnostics.push(deny("Galerina_AGENT_MANIFEST_NAME_REQUIRED", "Agent manifest requires a name.", "name"));
  if (!isNonEmpty(manifest.version)) diagnostics.push(deny("Galerina_AGENT_MANIFEST_VERSION_REQUIRED", "Agent manifest requires a version.", "version"));
  if (manifest.signatureRequired !== true) {
    diagnostics.push(deny("Galerina_AGENT_MANIFEST_UNSIGNED", "Agent manifests must require a signature; unsigned manifests are refused.", "signatureRequired"));
  }
  const classByCapability = new Map<string, AgentCapabilityClass>();
  manifest.grants.forEach((grant, index) => {
    const path = `grants.${index}`;
    if (!isNonEmpty(grant.capability) || WILDCARD.test(grant.capability)) {
      diagnostics.push(deny("Galerina_AGENT_MANIFEST_GRANT_WILDCARD", "Grants must name one exact capability.", `${path}.capability`));
    }
    if (!isNonEmpty(grant.scope) || WILDCARD.test(grant.scope)) {
      diagnostics.push(deny("Galerina_AGENT_MANIFEST_GRANT_UNSCOPED", "Grants must carry one exact, non-wildcard scope.", `${path}.scope`));
    }
    if (classByCapability.has(grant.capability) && classByCapability.get(grant.capability) !== grant.capabilityClass) {
      diagnostics.push(deny("Galerina_AGENT_MANIFEST_CLASS_MIXED", `Capability "${grant.capability}" is granted under two classes.`, path));
    }
    classByCapability.set(grant.capability, grant.capabilityClass);
  });
  manifest.effects.forEach((effect, index) => {
    if (!classByCapability.has(effect)) {
      diagnostics.push(deny("Galerina_AGENT_MANIFEST_EFFECT_UNGRANTED", `Effect "${effect}" has no matching grant.`, `effects.${index}`));
    }
  });
  return verdict(diagnostics);
}

// ── typed message bus with data classification ──────────────────────────────
export interface AgentMessage {
  readonly from: string;
  readonly to: string;
  readonly topic: string;
  readonly payloadType: string;
  readonly classification: DataClassification;
}

export interface AgentChannelPolicy {
  readonly topic: string;
  readonly payloadType: string;
  readonly clearance: DataClassification;
  readonly allowedSenders: readonly string[];
  readonly allowedReceivers: readonly string[];
}

export function routeAgentMessage(message: AgentMessage, channels: readonly AgentChannelPolicy[]): GovernanceVerdict {
  const at = channels.findIndex((candidate) => candidate.topic === message.topic);
  if (at < 0) return verdict([deny("Galerina_AGENT_BUS_UNKNOWN_TOPIC", `Topic "${message.topic}" is not declared.`, "topic")]);
  const channel = channels[at] as AgentChannelPolicy;
  const diagnostics: AgentDiagnostic[] = [];
  if (channel.payloadType !== message.payloadType) diagnostics.push(deny("Galerina_AGENT_BUS_PAYLOAD_TYPE", "Payload type does not match the channel type.", "payloadType"));
  if (!channel.allowedSenders.includes(message.from)) diagnostics.push(deny("Galerina_AGENT_BUS_SENDER", `Sender "${message.from}" is not allowed on this topic.`, "from"));
  if (!channel.allowedReceivers.includes(message.to)) diagnostics.push(deny("Galerina_AGENT_BUS_RECEIVER", `Receiver "${message.to}" is not allowed on this topic.`, "to"));
  if (DATA_CLASSIFICATION_RANK[message.classification] > DATA_CLASSIFICATION_RANK[channel.clearance]) {
    diagnostics.push(deny("Galerina_AGENT_BUS_CLASSIFICATION", "Message classification exceeds the channel clearance.", "classification"));
  }
  return verdict(diagnostics);
}

// ── tool gateway with secret, memory and cache guards ───────────────────────
export interface AgentToolCall {
  readonly agent: string;
  readonly tool: string;
  readonly argumentText: string;
  readonly requestedMemoryBytes: number;
  readonly classification: DataClassification;
  readonly cacheable: boolean;
}

export interface AgentToolGatewayPolicy {
  readonly secretMarkers: readonly string[];
}

// The tool must be explicitly allowed for this agent (deny wins); no argument may carry
// a declared secret marker; the memory request must fit the agent budget; confidential
// and secret results are never cacheable.
export function evaluateToolGatewayCall(
  call: AgentToolCall,
  definition: AgentDefinition,
  policy: AgentToolGatewayPolicy,
): GovernanceVerdict {
  const diagnostics: AgentDiagnostic[] = [];
  if (call.agent !== definition.name) diagnostics.push(deny("Galerina_AGENT_GATEWAY_IDENTITY", "Call identity does not match the agent definition.", "agent"));
  const permissions = definition.tools.filter((permission) => permission.tool === call.tool);
  const allowed = permissions.length > 0 && permissions.every((permission) => permission.decision === "allow");
  if (!allowed) diagnostics.push(deny("Galerina_AGENT_GATEWAY_TOOL_DENIED", `Tool "${call.tool}" is not allowed for this agent.`, "tool"));
  if (policy.secretMarkers.some((marker) => isNonEmpty(marker) && call.argumentText.includes(marker))) {
    diagnostics.push(deny("Galerina_AGENT_GATEWAY_SECRET_IN_ARGUMENTS", "Tool arguments carry secret material.", "argumentText"));
  }
  if (!(isPositiveFinite(call.requestedMemoryBytes) && call.requestedMemoryBytes <= definition.limits.memoryBytes)) {
    diagnostics.push(deny("Galerina_AGENT_GATEWAY_MEMORY", "Requested memory is not within the agent budget.", "requestedMemoryBytes"));
  }
  if (call.cacheable && DATA_CLASSIFICATION_RANK[call.classification] >= DATA_CLASSIFICATION_RANK.confidential) {
    diagnostics.push(deny("Galerina_AGENT_GATEWAY_CACHE", "Confidential and secret results are never cached.", "cacheable"));
  }
  return verdict(diagnostics);
}

// ── MCP tool boundary gateway ───────────────────────────────────────────────
export interface McpToolDescriptor {
  readonly server: string;
  readonly serverDigest: string;
  readonly tool: string;
}

export interface McpServerPin {
  readonly server: string;
  readonly serverDigest: string;
  readonly allowedTools: readonly string[];
}

export interface McpBoundaryReport {
  readonly schema: "galerina.ai-agent.mcp-boundary-report.v1";
  readonly admitted: readonly string[];
  readonly refused: readonly { readonly server: string; readonly tool: string; readonly code: string }[];
  readonly descriptionsTrusted: false;
}

const SHA256_HEX = /^sha256:[0-9a-f]{64}$/;

// A remote MCP tool is admitted only if its server is pinned by exact digest and the
// tool is on that pin's allowlist. Tool descriptions and annotations are never trusted.
export function admitMcpTools(descriptors: readonly McpToolDescriptor[], pins: readonly McpServerPin[]): McpBoundaryReport {
  const admitted: string[] = [];
  const refused: { server: string; tool: string; code: string }[] = [];
  for (const descriptor of descriptors) {
    const at = pins.findIndex((candidate) => candidate.server === descriptor.server);
    const pin = pins[at] as McpServerPin;
    let code = "";
    if (at < 0) code = "Galerina_AGENT_MCP_SERVER_UNPINNED";
    else if (!SHA256_HEX.test(pin.serverDigest) || pin.serverDigest !== descriptor.serverDigest) code = "Galerina_AGENT_MCP_SERVER_DIGEST";
    else if (!pin.allowedTools.includes(descriptor.tool)) code = "Galerina_AGENT_MCP_TOOL_NOT_ALLOWED";
    if (code.length > 0) refused.push({ server: descriptor.server, tool: descriptor.tool, code });
    else admitted.push(`${descriptor.server}/${descriptor.tool}`);
  }
  return { schema: "galerina.ai-agent.mcp-boundary-report.v1", admitted, refused, descriptionsTrusted: false };
}

// ── capability leases and attenuation ───────────────────────────────────────
export interface CapabilityLease {
  readonly capability: string;
  readonly scope: string;
  readonly holder: string;
  readonly expiresAtMs: number;
  readonly maxUses: number;
}

const withinScope = (child: string, parent: string): boolean => child === parent || child.startsWith(`${parent}/`);

// A derived lease may only narrow its parent: same capability, scope equal to or under
// the parent scope, no later expiry and no more uses. Anything else is refused.
export function attenuateLease(parent: CapabilityLease, child: CapabilityLease, nowMs: number): GovernanceVerdict {
  const diagnostics: AgentDiagnostic[] = [];
  if (!(parent.expiresAtMs > nowMs)) diagnostics.push(deny("Galerina_AGENT_LEASE_PARENT_EXPIRED", "The parent lease has expired.", "parent.expiresAtMs"));
  if (child.capability !== parent.capability) diagnostics.push(deny("Galerina_AGENT_LEASE_CAPABILITY_WIDENED", "A derived lease must keep the parent capability.", "capability"));
  if (!withinScope(child.scope, parent.scope)) diagnostics.push(deny("Galerina_AGENT_LEASE_SCOPE_WIDENED", "A derived lease scope must stay within the parent scope.", "scope"));
  if (!(child.expiresAtMs <= parent.expiresAtMs && child.expiresAtMs > nowMs)) diagnostics.push(deny("Galerina_AGENT_LEASE_EXPIRY_WIDENED", "A derived lease may not outlive its parent.", "expiresAtMs"));
  if (!(Number.isSafeInteger(child.maxUses) && child.maxUses > 0 && child.maxUses <= parent.maxUses)) diagnostics.push(deny("Galerina_AGENT_LEASE_USES_WIDENED", "A derived lease may not allow more uses.", "maxUses"));
  return verdict(diagnostics);
}

// ── authority-kernel separation ─────────────────────────────────────────────
export interface AiCapabilityRequest {
  readonly requester: string;
  readonly capability: string;
  readonly capabilityClass: AgentCapabilityClass;
  readonly scope: string;
  readonly justification: string;
}

export interface AuthorityDecisionInput {
  readonly request: AiCapabilityRequest;
  readonly decidedBy: string;
  readonly decidedByKind: "authority-kernel" | "agent" | "human";
  readonly humanApprovalId: string;
}

// Agents request; only the authority kernel decides. An agent deciding (including on
// its own request) is refused; write, package and deploy classes also need a recorded
// human approval id.
export function decideAiCapabilityRequest(input: AuthorityDecisionInput): GovernanceVerdict {
  const diagnostics: AgentDiagnostic[] = [];
  const { request } = input;
  if (input.decidedByKind !== "authority-kernel") diagnostics.push(deny("Galerina_AGENT_AUTHORITY_NOT_KERNEL", "Only the authority kernel may decide capability requests.", "decidedByKind"));
  if (input.decidedBy === request.requester) diagnostics.push(deny("Galerina_AGENT_AUTHORITY_SELF_GRANT", "A requester may never decide its own request.", "decidedBy"));
  if (!isNonEmpty(request.justification)) diagnostics.push(deny("Galerina_AGENT_AUTHORITY_JUSTIFICATION", "Capability requests must carry a justification.", "request.justification"));
  if (!isNonEmpty(request.scope) || WILDCARD.test(request.scope)) diagnostics.push(deny("Galerina_AGENT_AUTHORITY_UNSCOPED", "Capability requests must carry an exact scope.", "request.scope"));
  if (request.capabilityClass !== "read" && request.capabilityClass !== "tool" && !isNonEmpty(input.humanApprovalId)) {
    diagnostics.push(deny("Galerina_AGENT_AUTHORITY_HUMAN_APPROVAL", `Class "${request.capabilityClass}" needs a recorded human approval.`, "humanApprovalId"));
  }
  return verdict(diagnostics);
}

// ── trust roots, self-modification and AI-generated code quarantine ─────────
export interface AgentWriteIntent {
  readonly agent: string;
  readonly path: string;
}

export interface AgentWritePolicy {
  readonly trustRoots: readonly string[];
  readonly selfDefinitionPaths: readonly string[];
}

export interface SelfModificationReport {
  readonly schema: "galerina.ai-agent.self-modification-report.v1";
  readonly agent: string;
  readonly refusedTrustRootWrites: readonly string[];
  readonly refusedSelfModifications: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly humanReviewRequired: boolean;
}

const normalisePath = (path: string): string => path.replace(/\\/g, "/").replace(/\/+$/, "");
const underRoot = (path: string, root: string): boolean => {
  const p = normalisePath(path);
  const r = normalisePath(root);
  return p === r || p.startsWith(`${r}/`);
};

// Trust roots are immutable to agents; an agent may never rewrite its own definition,
// manifest or policy. Paths with traversal segments are refused outright.
export function createSelfModificationReport(agent: string, intents: readonly AgentWriteIntent[], policy: AgentWritePolicy): SelfModificationReport {
  const refusedTrustRootWrites: string[] = [];
  const refusedSelfModifications: string[] = [];
  const allowedWrites: string[] = [];
  for (const intent of intents) {
    const traversal = normalisePath(intent.path).split("/").includes("..");
    if (traversal || policy.trustRoots.some((root) => underRoot(intent.path, root))) refusedTrustRootWrites.push(intent.path);
    else if (intent.agent === agent && policy.selfDefinitionPaths.some((root) => underRoot(intent.path, root))) refusedSelfModifications.push(intent.path);
    else allowedWrites.push(intent.path);
  }
  return {
    schema: "galerina.ai-agent.self-modification-report.v1",
    agent,
    refusedTrustRootWrites,
    refusedSelfModifications,
    allowedWrites,
    humanReviewRequired: refusedTrustRootWrites.length + refusedSelfModifications.length > 0,
  };
}

export type QuarantineState = "quarantined" | "reviewed" | "released" | "rejected";

export interface QuarantineRecord {
  readonly artifactDigest: string;
  readonly authorAgent: string;
  readonly state: QuarantineState;
  readonly reviewer: string;
  readonly reviewEvidence: string;
}

const QUARANTINE_EDGES: Readonly<Record<QuarantineState, readonly QuarantineState[]>> = Object.freeze({
  quarantined: ["reviewed", "rejected"],
  reviewed: ["released", "rejected"],
  released: [],
  rejected: [],
});

// AI-generated code enters quarantine and only leaves it through a review by a
// different principal with recorded evidence; released and rejected are terminal.
export function transitionQuarantine(record: QuarantineRecord, next: QuarantineRecord): GovernanceVerdict {
  const diagnostics: AgentDiagnostic[] = [];
  if (next.artifactDigest !== record.artifactDigest || !SHA256_HEX.test(next.artifactDigest)) diagnostics.push(deny("Galerina_AGENT_QUARANTINE_DIGEST", "The artifact digest must be a sha256 digest and may not change.", "artifactDigest"));
  if (next.authorAgent !== record.authorAgent) diagnostics.push(deny("Galerina_AGENT_QUARANTINE_AUTHOR", "The author may not change.", "authorAgent"));
  if (!QUARANTINE_EDGES[record.state].includes(next.state)) diagnostics.push(deny("Galerina_AGENT_QUARANTINE_TRANSITION", `Transition ${record.state} -> ${next.state} is not allowed.`, "state"));
  if (next.state === "reviewed" || next.state === "released") {
    if (!isNonEmpty(next.reviewer) || next.reviewer === next.authorAgent) diagnostics.push(deny("Galerina_AGENT_QUARANTINE_SELF_REVIEW", "Review needs a reviewer other than the author.", "reviewer"));
    if (!isNonEmpty(next.reviewEvidence)) diagnostics.push(deny("Galerina_AGENT_QUARANTINE_EVIDENCE", "Review needs recorded evidence.", "reviewEvidence"));
  }
  return verdict(diagnostics);
}

// ── sandbox policy and human approval gate ──────────────────────────────────
export interface AgentSandboxPolicy {
  readonly network: "deny" | "allowlist";
  readonly networkAllowlist: readonly string[];
  readonly filesystem: "deny" | "read-only" | "scratch-only";
  readonly processSpawn: "deny";
}

export function validateSandboxPolicy(policy: AgentSandboxPolicy): GovernanceVerdict {
  const diagnostics: AgentDiagnostic[] = [];
  if (policy.processSpawn !== "deny") diagnostics.push(deny("Galerina_AGENT_SANDBOX_SPAWN", "Agent sandboxes never spawn processes.", "processSpawn"));
  if (policy.network === "deny" && policy.networkAllowlist.length > 0) diagnostics.push(deny("Galerina_AGENT_SANDBOX_NETWORK_CONTRADICTION", "A denied network may not carry an allowlist.", "networkAllowlist"));
  if (policy.network === "allowlist" && (policy.networkAllowlist.length === 0 || policy.networkAllowlist.some((host) => !isNonEmpty(host) || WILDCARD.test(host)))) {
    diagnostics.push(deny("Galerina_AGENT_SANDBOX_NETWORK_ALLOWLIST", "Allowlisted networks need exact, non-wildcard hosts.", "networkAllowlist"));
  }
  return verdict(diagnostics);
}

export interface HumanApproval {
  readonly approvalId: string;
  readonly approver: string;
  readonly action: string;
  readonly expiresAtMs: number;
}

// The gate opens only for an approval naming this exact action, from a human other than
// the requesting agent, that has not expired. Missing approval means closed.
export function evaluateHumanApprovalGate(action: string, requester: string, approvals: readonly HumanApproval[], nowMs: number): GovernanceVerdict {
  const approved = approvals.some((approval) => approval.action === action && isNonEmpty(approval.approvalId) && approval.approver !== requester && approval.expiresAtMs > nowMs);
  return approved
    ? verdict([])
    : verdict([deny("Galerina_AGENT_APPROVAL_REQUIRED", `Action "${action}" has no valid human approval.`, "approvals")]);
}

// ── loop / crash protection ─────────────────────────────────────────────────
export interface AgentLoopObservation {
  readonly agent: string;
  readonly iterations: number;
  readonly crashes: number;
  readonly identicalOutputsInARow: number;
}

export interface AgentLoopLimits {
  readonly maxIterations: number;
  readonly maxCrashes: number;
  readonly maxIdenticalOutputs: number;
}

export interface LoopProtectionReport {
  readonly schema: "galerina.ai-agent.loop-protection-report.v1";
  readonly terminated: readonly { readonly agent: string; readonly reason: "iterations" | "crashes" | "stalled" }[];
  readonly healthy: readonly string[];
}

export function createLoopProtectionReport(observations: readonly AgentLoopObservation[], limits: AgentLoopLimits): LoopProtectionReport {
  const terminated: { agent: string; reason: "iterations" | "crashes" | "stalled" }[] = [];
  const healthy: string[] = [];
  for (const o of observations) {
    if (!(o.iterations <= limits.maxIterations)) terminated.push({ agent: o.agent, reason: "iterations" });
    else if (!(o.crashes <= limits.maxCrashes)) terminated.push({ agent: o.agent, reason: "crashes" });
    else if (!(o.identicalOutputsInARow <= limits.maxIdenticalOutputs)) terminated.push({ agent: o.agent, reason: "stalled" });
    else healthy.push(o.agent);
  }
  return { schema: "galerina.ai-agent.loop-protection-report.v1", terminated, healthy };
}

// ── immutable AI audit log (hash chain) ─────────────────────────────────────
export interface AiAuditEntry {
  readonly sequence: number;
  readonly agent: string;
  readonly action: string;
  readonly detail: string;
  readonly previousDigest: string;
  readonly digest: string;
}

export const AI_AUDIT_GENESIS = `sha256:${"0".repeat(64)}`;

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// Dependency-free SHA-256 over the UTF-8 bytes of `text` (tests cross-check node:crypto).
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLength = bytes.length * 8;
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15] as number;
      const b = w[i - 2] as number;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]] as number[] as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + (K[i] as number) + (w[i] as number)) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const add = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i += 1) h[i] = ((h[i] as number) + (add[i] as number)) >>> 0;
  }
  return Array.from(h, (word) => word.toString(16).padStart(8, "0")).join("");
}

const auditPayload = (sequence: number, agent: string, action: string, detail: string, previousDigest: string): string =>
  JSON.stringify(["galerina.ai-agent.audit.v1", sequence, agent, action, detail, previousDigest]);

export function appendAiAuditEntry(log: readonly AiAuditEntry[], agent: string, action: string, detail: string): readonly AiAuditEntry[] {
  const previousDigest = log.length === 0 ? AI_AUDIT_GENESIS : (log[log.length - 1] as AiAuditEntry).digest;
  const sequence = log.length;
  const digest = `sha256:${sha256Hex(auditPayload(sequence, agent, action, detail, previousDigest))}`;
  return Object.freeze([...log, Object.freeze({ sequence, agent, action, detail, previousDigest, digest })]);
}

// Any edited, removed, reordered or inserted entry breaks the chain and is reported.
export function verifyAiAuditLog(log: readonly AiAuditEntry[]): GovernanceVerdict {
  let previousDigest = AI_AUDIT_GENESIS;
  for (let index = 0; index < log.length; index += 1) {
    const entry = log[index] as AiAuditEntry;
    const expected = `sha256:${sha256Hex(auditPayload(index, entry.agent, entry.action, entry.detail, previousDigest))}`;
    if (entry.sequence !== index || entry.previousDigest !== previousDigest || entry.digest !== expected) {
      return verdict([deny("Galerina_AGENT_AUDIT_CHAIN_BROKEN", `Audit chain breaks at entry ${index}.`, `${index}`)]);
    }
    previousDigest = entry.digest;
  }
  return verdict([]);
}
