import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_AUDIT_LINE_LENGTH,
  MAX_REPORT_ITEMS,
  capabilityEvidenceAuditEvent,
  createAuditReport,
  createCapabilityReport,
  createDenialReport,
  createDenialReportSummary,
  createEffectReport,
  effectEvidenceAuditEvent,
  serializeAuditEvent,
  validateRuntimeAuditEvent,
} from "../dist/index.js";

const T = "2026-10-05T10:00:00Z";
const runtime = { runtimeId: "rt-1", environment: "test", target: "node", processId: "p-1" };
const cap = (over = {}) => ({ schemaVersion: "galerina.evidence.v1", evidenceId: "ev-c1", generatedAt: T, capability: "db.orders.write", decision: "allow", reason: "granted by policy", references: [], ...over });
const eff = (over = {}) => ({ schemaVersion: "galerina.evidence.v1", evidenceId: "ev-e1", generatedAt: T, effect: "db.write", declared: true, inferred: true, transitive: false, allowed: true, reason: "declared", ...over });
const MARKER = "do-not-copy-marker-91c";

describe("capability and effect evidence audit-event shapes", () => {
  it("capability evidence becomes a valid capability event with an evidence reference and no reason text", () => {
    const event = capabilityEvidenceAuditEvent(cap({ reason: MARKER, policyId: "pol-1", references: [{ type: "policy", id: "pol-1" }] }), { eventId: "e-1", timestamp: T, runtime });
    assert.deepEqual(validateRuntimeAuditEvent(event), []);
    assert.equal(event.category, "capability");
    assert.equal(event.status, "allowed");
    assert.deepEqual(event.references, [{ type: "evidence", id: "ev-c1" }, { type: "policy", id: "pol-1" }]);
    assert.deepEqual({ ...event.metadata }, { decision: "allow", policyId: "pol-1" });
    assert.ok(!JSON.stringify(event).includes(MARKER));
    assert.ok(Object.isFrozen(event));
    assert.equal(capabilityEvidenceAuditEvent(cap({ decision: "deny" }), { eventId: "e-2", timestamp: T, runtime }).status, "denied");
  });

  it("effect evidence becomes a valid effect event; it serialises as one JSONL line", () => {
    const event = effectEvidenceAuditEvent(eff({ allowed: false, reason: MARKER }), { eventId: "e-3", timestamp: T, runtime });
    assert.equal(event.category, "effect");
    assert.equal(event.status, "denied");
    assert.deepEqual({ ...event.metadata }, { declared: "true", inferred: "true", transitive: "false" });
    assert.ok(!serializeAuditEvent(event).includes(MARKER));
  });

  it("invalid evidence or event params throw with a FUNGI code", () => {
    assert.throws(() => capabilityEvidenceAuditEvent(cap({ decision: "maybe" }), { eventId: "e-1", timestamp: T, runtime }), /^Error: FUNGI-EVIDENCE-002/);
    assert.throws(() => effectEvidenceAuditEvent(eff({ declared: false, inferred: false }), { eventId: "e-1", timestamp: T, runtime }), /^Error: FUNGI-EVIDENCE-002/);
    assert.throws(() => capabilityEvidenceAuditEvent(cap(), { eventId: "e-1", timestamp: "yesterday", runtime }), /^Error: FUNGI-REPORT-003/);
    assert.throws(() => effectEvidenceAuditEvent(eff(), undefined), /^Error: FUNGI-REPORT-/);
  });

  it("events copy the caller runtime: later mutation cannot change the event or its JSONL line", () => {
    for (const make of [(rt) => capabilityEvidenceAuditEvent(cap(), { eventId: "e-m", timestamp: T, runtime: rt }), (rt) => effectEvidenceAuditEvent(eff(), { eventId: "e-m", timestamp: T, runtime: rt })]) {
      const rt = { ...runtime, region: "eu-west-2" };
      const event = make(rt);
      const before = serializeAuditEvent(event);
      assert.notEqual(event.runtime, rt);
      assert.ok(Object.isFrozen(event.runtime));
      rt.environment = "prod";
      rt.processId = "p-evil";
      rt.extra = MARKER;
      delete rt.region;
      assert.equal(serializeAuditEvent(event), before);
      assert.equal(event.runtime.environment, "test");
      assert.equal(event.runtime.region, "eu-west-2");
      assert.ok(!before.includes(MARKER));
    }
  });

  it("a runtime with an own __proto__ key or a throwing getter is refused, not merged", () => {
    const polluted = JSON.parse('{"runtimeId":"rt-1","environment":"test","target":"node","processId":"p-1","__proto__":{"polluted":"yes"}}');
    assert.throws(() => capabilityEvidenceAuditEvent(cap(), { eventId: "e-p", timestamp: T, runtime: polluted }), /^Error: FUNGI-REPORT-002/);
    assert.equal({}.polluted, undefined);
    const hostile = { ...runtime };
    Object.defineProperty(hostile, "environment", { enumerable: true, get() { throw new Error(MARKER); } });
    assert.throws(() => effectEvidenceAuditEvent(eff(), { eventId: "e-h", timestamp: T, runtime: hostile }), (e) => /^FUNGI-REPORT-002/.test(e.message) && !e.message.includes(MARKER));
  });
});

describe("audit-report.json", () => {
  const line = (eventId, over = {}, ts = T) => serializeAuditEvent(capabilityEvidenceAuditEvent(cap(over), { eventId, timestamp: ts, runtime }));
  it("counts valid events by category and status and records the time range", () => {
    const lines = [line("e-1"), line("e-2", { decision: "deny" }, "2026-10-05T09:00:00Z"), serializeAuditEvent(effectEvidenceAuditEvent(eff(), { eventId: "e-3", timestamp: "2026-10-05T11:00:00.5Z", runtime })), ""];
    const r = createAuditReport(lines, T);
    assert.equal(r.schema, "galerina.report.audit.v1");
    assert.equal(r.eventCount, 3);
    assert.equal(r.byCategory.capability, 2);
    assert.equal(r.byCategory.effect, 1);
    assert.equal(r.byStatus.allowed, 2);
    assert.equal(r.byStatus.denied, 1);
    assert.equal(r.firstTimestamp, "2026-10-05T09:00:00Z");
    assert.equal(r.lastTimestamp, "2026-10-05T11:00:00.5Z");
    assert.equal(r.complete, true);
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.byCategory));
  });

  it("rejects bad lines by number only: unparsable, invalid, duplicate id, empty, over-long", () => {
    const bad = JSON.stringify({ schemaVersion: "galerina.runtime.audit.v1", eventId: "x", message: MARKER });
    const r = createAuditReport([line("e-1"), `{${MARKER}`, bad, line("e-1"), "", "x".repeat(MAX_AUDIT_LINE_LENGTH + 1), line("e-9")], T);
    assert.equal(r.eventCount, 2);
    assert.deepEqual([...r.rejectedLines], [2, 3, 4, 5, 6]);
    assert.equal(r.complete, false);
    assert.ok(!JSON.stringify(r).includes(MARKER));
    assert.ok(r.rejectedCodes.every((c) => /^FUNGI-REPORT-00\d$/.test(c)));
  });

  it("refuses a bad generatedAt or non-array input", () => {
    assert.throws(() => createAuditReport([], "now"), /^Error: FUNGI-REPORT-003/);
    assert.throws(() => createAuditReport("line", T), /^Error: FUNGI-REPORT-002/);
    const empty = createAuditReport([], T);
    assert.equal(empty.eventCount, 0);
    assert.equal(empty.firstTimestamp, undefined);
    assert.equal(empty.complete, true);
  });

  it("reads at most MAX_REPORT_ITEMS lines; a trailing empty line does not count toward the cap", () => {
    const template = JSON.parse(line("e-0"));
    const lines = Array.from({ length: MAX_REPORT_ITEMS + 1 }, (_, i) => JSON.stringify({ ...template, eventId: `e-${i}` }));
    const over = createAuditReport(lines, T);
    assert.equal(over.eventCount, MAX_REPORT_ITEMS);
    assert.equal(over.truncated, true);
    assert.equal(over.complete, false);
    assert.deepEqual([...over.rejectedLines], []);
    lines[MAX_REPORT_ITEMS] = "";
    const atCap = createAuditReport(lines, T);
    assert.equal(atCap.eventCount, MAX_REPORT_ITEMS);
    assert.equal(atCap.truncated, false);
    assert.equal(atCap.complete, true);
  });
});

describe("capability-report.json and effect-report.json", () => {
  it("aggregates capability decisions per capability and flags denials", () => {
    const r = createCapabilityReport([cap(), cap({ evidenceId: "ev-c2", decision: "deny", policyId: "pol-2" }), cap({ evidenceId: "ev-c3", capability: "audit.append" })], T);
    assert.deepEqual(r.capabilities.map((x) => ({ ...x })), [
      { capability: "audit.append", allowed: 1, denied: 0 },
      { capability: "db.orders.write", allowed: 1, denied: 1 },
    ]);
    assert.deepEqual([...r.deniedCapabilities], ["db.orders.write"]);
    assert.deepEqual([...r.policyIds], ["pol-2"]);
    assert.equal(r.complete, true);
  });

  it("rejected and duplicate capability evidence leaves the report incomplete without copying content", () => {
    const r = createCapabilityReport([cap(), cap(), cap({ evidenceId: "ev-c9", decision: MARKER })], T);
    assert.deepEqual([...r.rejectedIndices], [1, 2]);
    assert.deepEqual([...r.rejectedCodes], ["FUNGI-EVIDENCE-002", "FUNGI-EVIDENCE-003"]);
    assert.equal(r.complete, false);
    assert.ok(!JSON.stringify(r).includes(MARKER));
  });

  it("effect report lists undeclared-inferred, denied and conflicting effects", () => {
    const r = createEffectReport([
      eff(),
      eff({ evidenceId: "ev-e2", effect: "net.http", declared: false, inferred: true, transitive: true, allowed: true }),
      eff({ evidenceId: "ev-e3", allowed: false }),
      eff({ evidenceId: "ev-e4", effect: "fs.write", declared: true, inferred: false, allowed: false }),
    ], T);
    assert.deepEqual(r.effects.map((x) => x.effect), ["db.write", "fs.write", "net.http"]);
    assert.deepEqual([...r.undeclaredInferredEffects], ["net.http"]);
    assert.deepEqual([...r.deniedEffects], ["db.write", "fs.write"]);
    assert.deepEqual([...r.conflictingEffects], ["db.write"]);
    assert.equal(r.complete, true);
    assert.throws(() => createEffectReport(null, T), /^Error: FUNGI-EVIDENCE-002/);
  });

  it("evidence past MAX_REPORT_ITEMS is not read and leaves the report truncated and incomplete", () => {
    const items = Array.from({ length: MAX_REPORT_ITEMS + 1 }, (_, i) => cap({ evidenceId: `ev-${i}` }));
    const r = createCapabilityReport(items, T);
    assert.deepEqual(r.capabilities.map((x) => ({ ...x })), [{ capability: "db.orders.write", allowed: MAX_REPORT_ITEMS, denied: 0 }]);
    assert.deepEqual([...r.rejectedIndices], []);
    assert.equal(r.truncated, true);
    assert.equal(r.complete, false);
  });
});

describe("denial-report.json", () => {
  const denial = (over = {}) => createDenialReport({ denialId: "d-1", timestamp: T, category: "network", reason: "not allowlisted", runtimeId: "rt-1", diagnostics: ["FUNGI-NETWORK-001"], ...over });
  it("summarises denials by category with ids, policies and code-shaped diagnostics only", () => {
    const r = createDenialReportSummary([
      denial(),
      denial({ denialId: "d-2", category: "capability", policyId: "pol-1", diagnostics: ["FUNGI-CAP-002", "free text here"] }),
    ], T);
    assert.equal(r.schema, "galerina.report.denial.v1");
    assert.equal(r.denialCount, 2);
    assert.equal(r.byCategory.network, 1);
    assert.equal(r.byCategory.capability, 1);
    assert.equal(r.byCategory.secret, 0);
    assert.deepEqual([...r.denialIds], ["d-1", "d-2"]);
    assert.deepEqual([...r.policyIds], ["pol-1"]);
    assert.deepEqual([...r.diagnosticCodes], ["FUNGI-CAP-002", "FUNGI-NETWORK-001"]);
    assert.equal(r.complete, true);
  });

  it("invalid or duplicate denials are rejected by index", () => {
    const r = createDenialReportSummary([denial(), denial(), { ...denial({ denialId: "d-3" }), category: "weather" }], T);
    assert.equal(r.denialCount, 1);
    assert.deepEqual([...r.rejectedIndices], [1, 2]);
    assert.equal(r.complete, false);
    assert.throws(() => createDenialReportSummary([], "today"), /^Error: FUNGI-DENIAL-003/);
  });
});
