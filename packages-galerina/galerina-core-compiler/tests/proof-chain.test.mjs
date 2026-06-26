import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProofChain,
  verifyProofChain,
} from "../dist/index.js";

const EMPTY_INPUTS = {
  source: "pure flow test() -> Void { return }",
  auditEvents: [],
  evidence: [],
  denials: [],
};

describe("Proof chain — buildProofChain", () => {
  it("produces spore.execution.proof.v1 schema version", () => {
    const chain = buildProofChain(EMPTY_INPUTS);
    assert.equal(chain.schemaVersion, "spore.execution.proof.v1");
  });

  it("produces a non-empty proofId", () => {
    const chain = buildProofChain(EMPTY_INPUTS);
    assert.ok(chain.proofId.length > 0);
    assert.ok(chain.proofId.startsWith("proof_"));
  });

  it("produces a generatedAt ISO timestamp", () => {
    const chain = buildProofChain(EMPTY_INPUTS);
    assert.ok(chain.generatedAt.length > 0);
    assert.ok(!isNaN(Date.parse(chain.generatedAt)));
  });

  it("produces five SHA-256 hashes (64 hex chars each)", () => {
    const chain = buildProofChain(EMPTY_INPUTS);
    const hexPattern = /^[0-9a-f]{64}$/;
    assert.ok(hexPattern.test(chain.hashes.manifestSha256), "manifestSha256 invalid");
    assert.ok(hexPattern.test(chain.hashes.auditSha256),    "auditSha256 invalid");
    assert.ok(hexPattern.test(chain.hashes.evidenceSha256), "evidenceSha256 invalid");
    assert.ok(hexPattern.test(chain.hashes.denialSha256),   "denialSha256 invalid");
    assert.ok(hexPattern.test(chain.hashes.artefactSha256), "artefactSha256 invalid");
  });

  it("different sources produce different artefact hashes", () => {
    const a = buildProofChain({ ...EMPTY_INPUTS, source: "flow a() -> Void { return }" });
    const b = buildProofChain({ ...EMPTY_INPUTS, source: "flow b() -> Void { return }" });
    assert.notEqual(a.hashes.artefactSha256, b.hashes.artefactSha256);
  });

  it("same inputs produce identical hashes (deterministic)", () => {
    const a = buildProofChain(EMPTY_INPUTS);
    const b = buildProofChain(EMPTY_INPUTS);
    assert.equal(a.hashes.manifestSha256,  b.hashes.manifestSha256);
    assert.equal(a.hashes.auditSha256,     b.hashes.auditSha256);
    assert.equal(a.hashes.evidenceSha256,  b.hashes.evidenceSha256);
    assert.equal(a.hashes.denialSha256,    b.hashes.denialSha256);
    assert.equal(a.hashes.artefactSha256,  b.hashes.artefactSha256);
  });

  it("audit events change the auditSha256", () => {
    const withEvent = buildProofChain({
      ...EMPTY_INPUTS,
      auditEvents: [{
        schemaVersion: "lln.runtime.audit.v1",
        id: "evt_1",
        timestamp: "2026-01-01T00:00:00.000Z",
        status: "Success",
        eventType: "FunctionExecution",
        source: "galerina-runtime",
        message: "test",
        flowName: "test",
        qualifier: "pure",
        traceId: "trace_1",
        metadata: {},
        evidence: [],
      }],
    });
    const without = buildProofChain(EMPTY_INPUTS);
    assert.notEqual(withEvent.hashes.auditSha256, without.hashes.auditSha256);
  });

  it("denial records change the denialSha256", () => {
    const withDenial = buildProofChain({
      ...EMPTY_INPUTS,
      denials: [{
        denialId: "denial_1",
        reason: "Governance: effect denied",
        flowName: "test",
        timestamp: "2026-01-01T00:00:00.000Z",
      }],
    });
    const without = buildProofChain(EMPTY_INPUTS);
    assert.notEqual(withDenial.hashes.denialSha256, without.hashes.denialSha256);
  });
});

describe("Proof chain — verifyProofChain", () => {
  it("verifies a chain built from the same inputs", () => {
    const chain = buildProofChain(EMPTY_INPUTS);
    const result = verifyProofChain(chain, EMPTY_INPUTS);
    assert.equal(result.verified, true);
    assert.equal(result.mismatches.length, 0);
  });

  it("detects tampered source (artefactSha256 mismatch)", () => {
    const chain = buildProofChain(EMPTY_INPUTS);
    const tamperedInputs = { ...EMPTY_INPUTS, source: "TAMPERED" };
    const result = verifyProofChain(chain, tamperedInputs);
    assert.equal(result.verified, false);
    assert.ok(result.mismatches.some((m) => m.includes("artefactSha256")));
  });

  it("detects added audit event (auditSha256 mismatch)", () => {
    const chain = buildProofChain(EMPTY_INPUTS);
    const result = verifyProofChain(chain, {
      ...EMPTY_INPUTS,
      auditEvents: [{
        schemaVersion: "lln.runtime.audit.v1",
        id: "injected",
        timestamp: "2026-01-01T00:00:00.000Z",
        status: "Success",
        eventType: "FunctionExecution",
        source: "galerina-runtime",
        message: "injected",
        flowName: "injected",
        qualifier: "pure",
        traceId: "trace_x",
        metadata: {},
        evidence: [],
      }],
    });
    assert.equal(result.verified, false);
    assert.ok(result.mismatches.some((m) => m.includes("auditSha256")));
  });
});

describe("Proof chain — audit writer JSONL", () => {
  it("toJSONL returns empty string for empty writer", async () => {
    const { createAuditWriter } = await import("../dist/index.js");
    const writer = createAuditWriter();
    assert.equal(writer.toJSONL(), "");
  });

  it("toJSONL produces one compact line per event", async () => {
    const { createAuditWriter, buildFlowAuditEvent } = await import("../dist/index.js");
    const writer = createAuditWriter();
    writer.append(buildFlowAuditEvent("test", "pure", "Success", "t1", []));
    writer.append(buildFlowAuditEvent("test", "pure", "Success", "t2", []));
    const jsonl = writer.toJSONL();
    const lines = jsonl.split("\n").filter((l) => l.trim() !== "");
    assert.equal(lines.length, 2);
    // Each line must be valid JSON
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line));
    }
  });

  it("rejects invalid schemaVersion", async () => {
    const { createAuditWriter } = await import("../dist/index.js");
    const writer = createAuditWriter();
    assert.throws(
      () => writer.append(/** @type {any} */({ schemaVersion: "bad.version", id: "x" })),
      /invalid schemaVersion/,
    );
  });

  it("evidence record contains gate firings", async () => {
    const { createAuditWriter } = await import("../dist/index.js");
    const writer = createAuditWriter();
    writer.recordGateFired("validate.email");
    writer.recordRedaction("email");
    const evidence = writer.getEvidenceRecord();
    assert.ok(evidence.validationGatesFired.includes("validate.email"));
    assert.ok(evidence.redactionsApplied.includes("email"));
  });

  it("denial records are tracked", async () => {
    const { createAuditWriter } = await import("../dist/index.js");
    const writer = createAuditWriter();
    writer.recordDenial("effect denied: remote.execution", "processOrder");
    const denials = writer.getDenials();
    assert.equal(denials.length, 1);
    assert.ok(denials[0].reason.includes("remote.execution"));
    assert.equal(denials[0].flowName, "processOrder");
  });
});
