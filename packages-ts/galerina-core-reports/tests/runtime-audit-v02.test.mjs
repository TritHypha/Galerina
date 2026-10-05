import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  FUNGI_DENIAL_CODES,
  FUNGI_EVIDENCE_CODES,
  FUNGI_PROOF_CODES,
  FUNGI_REPORT_CODES,
  RUNTIME_AUDIT_STATUSES,
  RUNTIME_AUDIT_STATUSES_V01,
  appendAuditEvent,
  buildExecutionProof,
  buildRuntimeEvidence,
  createDenialReport,
  createProofReport,
  serializeAuditEvent,
  serializeDenialReport,
  sha256,
  summarizeRuntimeEvidence,
  validateAuditSafety,
  validateDenialReport,
  validateExecutionProof,
  validateRuntimeAuditEvent,
} from "../dist/index.js";

const T = "2026-10-05T01:00:00.000Z";
const runtime = { runtimeId: "rt-1", environment: "production", target: "node", processId: "4242" };
const event = (over = {}) => ({
  schemaVersion: "galerina.runtime.audit.v1",
  eventId: "evt-1",
  timestamp: T,
  category: "network",
  status: "denied",
  message: "Outbound call denied by policy.",
  runtime,
  destination: "api.example.com",
  references: [{ type: "denial", id: "den-1" }],
  metadata: { z: "1", a: "2" },
  ...over,
});

describe("runtime audit events", () => {
  it("v0.2 statuses and the documented v0.1 form", () => {
    assert.deepEqual([...RUNTIME_AUDIT_STATUSES], ["allowed", "denied", "warning", "error", "executed", "verified"]);
    assert.equal(RUNTIME_AUDIT_STATUSES_V01.length, 7);
  });
  it("serialises one canonical JSONL line", () => {
    const line = serializeAuditEvent({ ...event(), metadata: { z: "1", a: "2" } });
    assert.ok(!line.includes("\n"));
    const parsed = JSON.parse(line);
    assert.deepEqual(Object.keys(parsed).slice(0, 3), ["schemaVersion", "eventId", "timestamp"]);
    assert.deepEqual(Object.keys(parsed.metadata), ["a", "z"]);
    assert.equal(serializeAuditEvent(event({ message: "line\nbreak" })).includes("\n"), false);
  });
  it("refuses invalid events with FUNGI-REPORT codes", () => {
    const codes = (e) => validateRuntimeAuditEvent(e).map((d) => d.code);
    assert.ok(codes(event({ schemaVersion: "v0" })).includes("FUNGI-REPORT-001"));
    assert.ok(codes(event({ status: "completed" })).includes("FUNGI-REPORT-002"));
    assert.ok(codes(event({ timestamp: "2026-10-05 01:00" })).includes("FUNGI-REPORT-003"));
    assert.ok(codes(event({ message: "auth Bearer abcdefghijklmnop" })).includes("FUNGI-REPORT-004"));
    assert.ok(codes(event({ metadata: { n: 1 } })).includes("FUNGI-REPORT-005"));
    assert.ok(codes(event({ extra: "x" })).includes("FUNGI-REPORT-002"));
    assert.throws(() => serializeAuditEvent(event({ status: "running" })), /FUNGI-REPORT-002/);
  });
  it("validateAuditSafety rejects sk_live_, Bearer tokens and private keys anywhere", () => {
    assert.equal(validateAuditSafety(event()), true);
    assert.equal(validateAuditSafety(event({ metadata: { key: "sk_live_abc123" } })), false);
    assert.equal(validateAuditSafety(event({ destination: "Bearer abcdefgh12345678" })), false);
    assert.equal(validateAuditSafety(event({ metadata: { "sk_live_inKey": "x" } })), false);
    assert.equal(validateAuditSafety(event({ message: "-----BEGIN RSA PRIVATE KEY-----" })), false);
  });
  it("appendAuditEvent writes exactly one terminated line and nothing for a refused event", async () => {
    const writes = [];
    const append = async (p, l) => { writes.push([p, l]); };
    await appendAuditEvent(event(), "build/reports/audit/runtime-audit.jsonl", append);
    assert.equal(writes.length, 1);
    assert.ok(writes[0][1].endsWith("}\n"));
    await assert.rejects(appendAuditEvent(event({ message: "sk_live_x1" }), "a.jsonl", append), /FUNGI-REPORT-004/);
    assert.equal(writes.length, 1);
  });
});

describe("execution proofs", () => {
  const files = { m: "manifest", a: "audit-lines", e: "evidence", d: "denials", x: new Uint8Array([1, 2, 3]) };
  const paths = { manifest: "m", audit: "a", evidence: "e", denials: "d", artefact: "x" };
  const io = { readFile: async (p) => { if (!(p in files)) throw new Error("ENOENT"); return files[p]; }, now: () => T };
  it("sha256 matches node:crypto", () => {
    for (const s of ["", "abc", "x".repeat(1000)]) assert.equal(sha256(s), createHash("sha256").update(s).digest("hex"));
  });
  it("builds a deterministic proof and validates it", async () => {
    const proof = await buildExecutionProof(paths, io);
    assert.equal(proof.schemaVersion, "galerina.proof.v1");
    assert.equal(proof.hashes.artefactSha256, createHash("sha256").update(Buffer.from([1, 2, 3])).digest("hex"));
    assert.match(proof.proofId, /^proof-[0-9a-f]{24}$/);
    assert.equal(await validateExecutionProof(proof, paths, io), true);
    assert.deepEqual(createProofReport(proof, true).diagnosticCodes, []);
  });
  it("fails on tampered input, tampered proof, unreadable input or wrong id", async () => {
    const proof = await buildExecutionProof(paths, io);
    const tampered = { ...io, readFile: async (p) => (p === "a" ? "audit-lines-edited" : io.readFile(p)) };
    assert.equal(await validateExecutionProof(proof, paths, tampered), false);
    assert.equal(await validateExecutionProof({ ...proof, hashes: { ...proof.hashes, auditSha256: "0".repeat(64) } }, paths, io), false);
    assert.equal(await validateExecutionProof(proof, { ...paths, audit: "missing" }, io), false);
    assert.equal(await validateExecutionProof({ ...proof, proofId: "proof-" + "0".repeat(24) }, paths, io), false);
    await assert.rejects(buildExecutionProof({ ...paths, denials: "missing" }, io), /FUNGI-PROOF-004/);
    assert.deepEqual(createProofReport(proof, false).diagnosticCodes, ["FUNGI-PROOF-005"]);
  });
});

describe("denials", () => {
  const input = { denialId: "den-1", timestamp: T, category: "network", reason: "Destination not allowlisted.", runtimeId: "rt-1", destination: "evil.example", diagnostics: ["FUNGI-NET-004"], references: [{ type: "policy", id: "pol-1" }] };
  it("creates, validates and serialises a v0.2 denial", () => {
    const d = createDenialReport(input);
    assert.ok(Object.isFrozen(d));
    assert.deepEqual(validateDenialReport(d), []);
    const text = serializeDenialReport(d);
    assert.ok(text.endsWith("}\n"));
    assert.deepEqual(Object.keys(JSON.parse(text))[0], "schemaVersion");
  });
  it("refuses bad category, missing reason, secrets and bad schema", () => {
    assert.throws(() => createDenialReport({ ...input, category: "dns" }), /FUNGI-DENIAL-002/);
    assert.throws(() => createDenialReport({ ...input, reason: "" }), /FUNGI-DENIAL-003/);
    assert.throws(() => createDenialReport({ ...input, reason: "token sk_live_abc" }), /FUNGI-DENIAL-004/);
    assert.ok(validateDenialReport({ ...createDenialReport(input), schemaVersion: "x" }).some((p) => p.code === "FUNGI-DENIAL-001"));
  });
});

describe("evidence", () => {
  const cap = (id, decision = "allow") => ({ schemaVersion: "galerina.evidence.v1", evidenceId: id, generatedAt: T, capability: "net.fetch", decision, reason: "policy", references: [] });
  const eff = (id, over = {}) => ({ schemaVersion: "galerina.evidence.v1", evidenceId: id, generatedAt: T, effect: "network", declared: true, inferred: true, transitive: false, allowed: true, reason: "declared", ...over });
  const base = { runtimeId: "rt-1", target: "node", environment: "production", generatedAt: T };
  it("builds clean runtime evidence", async () => {
    const ev = await buildRuntimeEvidence({ ...base, capabilityDecisions: [cap("c1"), cap("c2", "deny")], effectDecisions: [eff("e1"), eff("e2", { declared: false, allowed: false })], denialReferences: [{ type: "denial", id: "den-1" }] });
    assert.deepEqual(ev.diagnostics, []);
    const s = summarizeRuntimeEvidence(ev);
    assert.deepEqual([s.capabilitiesAllowed, s.capabilitiesDenied, s.effectsAllowed, s.effectsDenied, s.clean], [1, 1, 1, 1, true]);
    assert.deepEqual(s.undeclaredInferredEffects, ["network"]);
  });
  it("drops contradictory, duplicate, unsafe or mistyped entries into diagnostics", async () => {
    const ev = await buildRuntimeEvidence({
      ...base,
      capabilityDecisions: [cap("c1"), cap("c1"), { ...cap("c3"), reason: "sk_live_leak" }, { ...cap("c4"), schemaVersion: "v0" }],
      effectDecisions: [eff("e1", { declared: false, inferred: false })],
      proofReferences: [{ type: "denial", id: "x" }],
    });
    assert.equal(ev.capabilityEvidence.length, 1);
    assert.equal(ev.effectEvidence.length, 0);
    assert.equal(ev.proofReferences.length, 0);
    assert.deepEqual(ev.diagnostics, ["FUNGI-EVIDENCE-001", "FUNGI-EVIDENCE-002", "FUNGI-EVIDENCE-003", "FUNGI-EVIDENCE-004"]);
    await assert.rejects(buildRuntimeEvidence({ ...base, target: "cuda", capabilityDecisions: [], effectDecisions: [] }), /target/);
  });
  it("registers every diagnostic family", () => {
    assert.deepEqual([FUNGI_REPORT_CODES.length, FUNGI_PROOF_CODES.length, FUNGI_DENIAL_CODES.length, FUNGI_EVIDENCE_CODES.length], [5, 5, 4, 4]);
  });
});
