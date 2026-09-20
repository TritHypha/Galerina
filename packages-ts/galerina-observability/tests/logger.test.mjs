// Logger — leveled structured logs, redaction, fail-closed sink, injectable clock.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createLogger, MemoryLogSink, JsonLineSink, safeStringify } from "../dist/index.js";

test("emits structured records to the sink with an injected clock", () => {
  const sink = new MemoryLogSink();
  const log = createLogger({ sink, clock: () => 12345 });
  log.info("hello", { a: 1 });
  const [rec] = sink.records();
  assert.equal(rec.level, "info");
  assert.equal(rec.msg, "hello");
  assert.equal(rec.at, 12345);
  assert.deepEqual(rec.fields, { a: 1 });
});

test("a retained records snapshot cannot inject a record into the sink", () => {
  const sink = new MemoryLogSink();
  const original = { level: "info", msg: "original", at: 1 };
  sink.write(original);

  const retained = sink.records();
  retained.push({ level: "error", msg: "injected", at: 2 });

  assert.deepEqual(sink.records(), [original]);
});

test("a retained records snapshot cannot delete a record from the sink", () => {
  const sink = new MemoryLogSink();
  const first = { level: "info", msg: "first", at: 1 };
  const second = { level: "info", msg: "second", at: 2 };
  sink.write(first);
  sink.write(second);

  const retained = sink.records();
  retained.splice(0, 1);

  assert.deepEqual(sink.records(), [first, second]);
});

test("clear does not mutate a previously retained records snapshot", () => {
  const sink = new MemoryLogSink();
  const original = { level: "info", msg: "original", at: 1 };
  sink.write(original);

  const retained = sink.records();
  sink.clear();

  assert.deepEqual(sink.records(), []);
  assert.deepEqual(retained, [original]);
});

test("minLevel filters lower-severity records", () => {
  const sink = new MemoryLogSink();
  const log = createLogger({ sink, minLevel: "warn" });
  log.debug("d");
  log.info("i");
  log.warn("w");
  log.error("e");
  assert.deepEqual(sink.records().map((r) => r.level), ["warn", "error"]);
});

test("an invalid runtime minLevel conservatively defaults to info", () => {
  const sink = new MemoryLogSink();
  const log = createLogger({ sink, minLevel: "verbose" });
  log.debug("d");
  log.info("i");
  assert.deepEqual(sink.records().map((r) => r.level), ["info"]);
});

test("sensitive field keys are redacted before reaching the sink", () => {
  const sink = new MemoryLogSink();
  const log = createLogger({ sink });
  log.info("login", { user: "alice", password: "hunter2", token: "abc.def", note: "ok" });
  const [rec] = sink.records();
  assert.equal(rec.fields.user, "alice");
  assert.equal(rec.fields.note, "ok");
  assert.equal(rec.fields.password, "[redacted]");
  assert.equal(rec.fields.token, "[redacted]");
  assert.ok(!JSON.stringify(rec).includes("hunter2"), "secret value must not appear anywhere");
});

test("child loggers extend name and base fields and share the sink", () => {
  const sink = new MemoryLogSink();
  const root = createLogger({ sink, name: "app", baseFields: { svc: "orders" } });
  const child = root.child("worker", { shard: 3 });
  child.info("tick", { n: 1 });
  const [rec] = sink.records();
  assert.equal(rec.logger, "app.worker");
  assert.equal(rec.fields.svc, "orders");
  assert.equal(rec.fields.shard, 3);
  assert.equal(rec.fields.n, 1);
});

test("a logger snapshots base fields against caller mutation", () => {
  const sink = new MemoryLogSink();
  const baseFields = { svc: "orders", version: 1 };
  const log = createLogger({ sink, baseFields });

  baseFields.svc = "payments";
  baseFields.version = 2;
  log.info("tick");

  const [rec] = sink.records();
  assert.deepEqual(rec.fields, { svc: "orders", version: 1 });
});

test("a throwing sink is isolated: logging never propagates, failures are counted", () => {
  const log = createLogger({
    sink: { write() { throw new Error("disk full"); } },
  });
  assert.doesNotThrow(() => log.error("boom"));
  assert.equal(log.sinkFailures(), 1);
});

test("safeStringify degrades unserialisable fields instead of throwing", () => {
  const circular = {};
  circular.self = circular;
  const out = safeStringify({ level: "info", msg: "x", at: 0, fields: circular });
  const parsed = JSON.parse(out); // must be valid JSON
  assert.equal(parsed.level, "info");
  assert.match(out, /not serialisable/);
});

test("safeStringify returns its canonical fallback for hostile top-level undefined", () => {
  assert.equal(safeStringify(undefined), '{"level":"error","msg":"log record not serialisable","at":0}');
});

test("safeStringify returns its canonical fallback when toJSON returns undefined", () => {
  const hostile = { toJSON: () => undefined };
  assert.equal(safeStringify(hostile), '{"level":"error","msg":"log record not serialisable","at":0}');
});

test("JsonLineSink writes one JSON line per record to the supplied writer (no ambient I/O)", () => {
  const lines = [];
  const log = createLogger({ sink: new JsonLineSink((l) => lines.push(l)), clock: () => 7 });
  log.info("line", { k: "v" });
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.msg, "line");
  assert.equal(parsed.at, 7);
  assert.equal(parsed.fields.k, "v");
});
