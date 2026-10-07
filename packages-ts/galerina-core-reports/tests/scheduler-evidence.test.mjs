import assert from "node:assert/strict";
import test from "node:test";
import {
  SCHEDULER_EVIDENCE_EVENTS,
  SCHEDULER_EVIDENCE_FIELDS,
  serializeSchedulerEvidence,
  validateSchedulerEvidence,
} from "../dist/index.js";

// Exact examples from docs/runtime-audit-log-schema-and-execution-proof.md.
const queued = () => ({ category: "scheduler", event: "execution_queued", traceId: "trace-600", queue: "storage-queue", priority: "normal" }); // section 31
const scheduled = () => ({ category: "scheduler", event: "task_scheduled", traceId: "trace-200", scheduler: "execution-coordinator", task: "parallel-batch-1", target: "cpu" }); // section 17

const codes = (r) => (r.ok ? [] : r.diagnostics.map((d) => `${d.code}:${d.field}`));

test("vocabulary is exactly the two documented events and their documented fields", () => {
  assert.deepEqual([...SCHEDULER_EVIDENCE_EVENTS], ["execution_queued", "task_scheduled"]);
  assert.deepEqual([...SCHEDULER_EVIDENCE_FIELDS.execution_queued], ["category", "event", "traceId", "queue", "priority"]);
  assert.deepEqual([...SCHEDULER_EVIDENCE_FIELDS.task_scheduled], ["category", "event", "traceId", "scheduler", "task", "target"]);
  assert.ok(Object.isFrozen(SCHEDULER_EVIDENCE_EVENTS) && Object.isFrozen(SCHEDULER_EVIDENCE_FIELDS));
  assert.ok(Object.isFrozen(SCHEDULER_EVIDENCE_FIELDS.execution_queued) && Object.isFrozen(SCHEDULER_EVIDENCE_FIELDS.task_scheduled));
});

test("both documented examples validate to detached frozen copies", () => {
  for (const make of [queued, scheduled]) {
    const input = make();
    const r = validateSchedulerEvidence(input);
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, make());
    assert.ok(Object.isFrozen(r.value));
    assert.notEqual(r.value, input);
    input.traceId = "trace-mutated";
    assert.notEqual(r.value.traceId, "trace-mutated");
  }
});

test("null-prototype records are accepted; class instances, arrays and primitives refuse", () => {
  assert.equal(validateSchedulerEvidence(Object.assign(Object.create(null), queued())).ok, true);
  class Ev { constructor() { Object.assign(this, queued()); } }
  for (const bad of [new Ev(), [queued()], null, undefined, "scheduler", 1, true]) {
    assert.deepEqual(codes(validateSchedulerEvidence(bad)), ["FUNGI-REPORT-002:record"]);
  }
});

test("category and event are closed", () => {
  assert.deepEqual(codes(validateSchedulerEvidence({ ...queued(), category: "runtime" })), ["FUNGI-REPORT-002:category"]);
  assert.deepEqual(codes(validateSchedulerEvidence({ ...queued(), category: undefined })), ["FUNGI-REPORT-002:category"]);
  for (const event of ["task_started", "EXECUTION_QUEUED", "", 1, null]) {
    assert.deepEqual(codes(validateSchedulerEvidence({ ...queued(), event })), ["FUNGI-REPORT-002:event"]);
  }
});

test("unknown and symbol keys refuse without echoing the key", () => {
  const extra = validateSchedulerEvidence({ ...queued(), sk_live_leak: "x" });
  assert.deepEqual(codes(extra), ["FUNGI-REPORT-002:record"]);
  assert.ok(!JSON.stringify(extra).includes("sk_live_leak"));
  assert.deepEqual(codes(validateSchedulerEvidence({ ...queued(), timestamp: "2026-01-01T12:00:00Z" })), ["FUNGI-REPORT-002:record"]);
  assert.deepEqual(codes(validateSchedulerEvidence({ ...queued(), [Symbol("s")]: 1 })), ["FUNGI-REPORT-002:record"]);
});

test("per-event shape is closed: a field documented only for the other event refuses", () => {
  assert.deepEqual(codes(validateSchedulerEvidence({ ...queued(), target: "cpu" })), ["FUNGI-REPORT-002:record"]);
  assert.deepEqual(codes(validateSchedulerEvidence({ ...scheduled(), queue: "storage-queue" })), ["FUNGI-REPORT-002:record"]);
  const { task, ...noTask } = scheduled();
  assert.deepEqual(codes(validateSchedulerEvidence({ ...noTask, priority: "normal" })), ["FUNGI-REPORT-002:record"]);
});

test("missing required fields are each reported", () => {
  const { queue, priority, ...rest } = queued();
  assert.deepEqual(codes(validateSchedulerEvidence(rest)), ["FUNGI-REPORT-002:queue", "FUNGI-REPORT-002:priority"]);
  const { traceId, target, ...rest2 } = scheduled();
  assert.deepEqual(codes(validateSchedulerEvidence(rest2)), ["FUNGI-REPORT-002:traceId", "FUNGI-REPORT-002:target"]);
});

test("token fields must match the audit id pattern", () => {
  for (const [field, value] of [["traceId", ""], ["traceId", "trace 600"], ["queue", 7], ["priority", null], ["priority", "-normal"], ["queue", "x".repeat(129)]]) {
    assert.deepEqual(codes(validateSchedulerEvidence({ ...queued(), [field]: value })), [`FUNGI-REPORT-002:${field}`]);
  }
  for (const [field, value] of [["scheduler", "a/b"], ["task", undefined], ["traceId", {}]]) {
    assert.deepEqual(codes(validateSchedulerEvidence({ ...scheduled(), [field]: value })), [`FUNGI-REPORT-002:${field}`]);
  }
});

test("target must be a known runtime target", () => {
  assert.equal(validateSchedulerEvidence({ ...scheduled(), target: "optical_io" }).ok, true);
  for (const target of ["CPU", "quantum", "", null, 1]) {
    assert.deepEqual(codes(validateSchedulerEvidence({ ...scheduled(), target })), ["FUNGI-REPORT-002:target"]);
  }
});

test("secret material refuses with FUNGI-REPORT-004 and is not echoed", () => {
  const secret = "sk_live_" + "abc123"; // short, assembled fixture: not a real key shape
  const r = validateSchedulerEvidence({ ...queued(), queue: secret });
  assert.equal(r.ok, false);
  assert.equal(r.diagnostics.length, 1);
  assert.equal(r.diagnostics[0].field, "queue");
  assert.ok(["FUNGI-REPORT-004", "FUNGI-REPORT-002"].includes(r.diagnostics[0].code));
  assert.ok(!JSON.stringify(r).includes(secret));
});

test("getters never run; accessor records refuse", () => {
  let ran = false;
  const input = queued();
  Object.defineProperty(input, "queue", { enumerable: true, get() { ran = true; return "storage-queue"; } });
  assert.deepEqual(codes(validateSchedulerEvidence(input)), ["FUNGI-REPORT-002:record"]);
  assert.equal(ran, false);
});

test("hostile proxies never throw", () => {
  const hostile = new Proxy({}, { ownKeys() { throw new Error("boom"); }, getPrototypeOf() { return Object.prototype; } });
  assert.deepEqual(codes(validateSchedulerEvidence(hostile)), ["FUNGI-REPORT-002:record"]);
  assert.equal(serializeSchedulerEvidence(hostile), undefined);
});

test("serialize emits one JSONL line in documented order, and refuses invalid input", () => {
  const shuffledQ = { priority: "normal", queue: "storage-queue", traceId: "trace-600", event: "execution_queued", category: "scheduler" };
  assert.equal(serializeSchedulerEvidence(shuffledQ), '{"category":"scheduler","event":"execution_queued","traceId":"trace-600","queue":"storage-queue","priority":"normal"}');
  const shuffledT = { target: "cpu", task: "parallel-batch-1", scheduler: "execution-coordinator", traceId: "trace-200", event: "task_scheduled", category: "scheduler" };
  const line = serializeSchedulerEvidence(shuffledT);
  assert.equal(line, '{"category":"scheduler","event":"task_scheduled","traceId":"trace-200","scheduler":"execution-coordinator","task":"parallel-batch-1","target":"cpu"}');
  assert.ok(!line.includes("\n"));
  assert.deepEqual(JSON.parse(line), scheduled());
  assert.equal(serializeSchedulerEvidence({ ...queued(), event: "nope" }), undefined);
  assert.equal(serializeSchedulerEvidence({ ...scheduled(), extra: 1 }), undefined);
});