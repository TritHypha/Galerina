// HealthRegistry — liveness/readiness, fail-closed aggregation, bounded per-check timeout.
import assert from "node:assert/strict";
import { test } from "node:test";

import { HealthRegistry } from "../dist/index.js";

test("no checks: liveness UP and readiness UP by default", async () => {
  const h = new HealthRegistry();
  assert.equal((await h.liveness()).status, "UP");
  assert.equal((await h.readiness()).status, "UP");
});

test("readiness aggregates: any DOWN component ⇒ DOWN", async () => {
  const h = new HealthRegistry();
  h.registerReadiness("db", () => true);
  h.registerReadiness("cache", () => false);
  const r = await h.readiness();
  assert.equal(r.status, "DOWN");
  assert.equal(r.components.db.status, "UP");
  assert.equal(r.components.cache.status, "DOWN");
});

test("boolean and ComponentHealth results both supported; detail is kept", async () => {
  const h = new HealthRegistry();
  h.registerReadiness("bool", () => true);
  h.registerReadiness("struct", () => ({ status: "UP", detail: "ok" }));
  const r = await h.readiness();
  assert.equal(r.status, "UP");
  assert.equal(r.components.bool.status, "UP");
  assert.equal(r.components.struct.detail, "ok");
});

test("a check that THROWS is reported DOWN (fail-closed), evaluation never throws", async () => {
  const h = new HealthRegistry();
  h.registerReadiness("boom", () => { throw new Error("dependency exploded"); });
  let report;
  await assert.doesNotReject(async () => { report = await h.readiness(); });
  assert.equal(report.status, "DOWN");
  assert.equal(report.components.boom.status, "DOWN");
  // The internal error message must not surface verbatim in the detail.
  assert.ok(!String(report.components.boom.detail).includes("exploded"));
});

test("a rejecting async check is reported DOWN", async () => {
  const h = new HealthRegistry();
  h.registerReadiness("async", async () => { throw new Error("nope"); });
  const r = await h.readiness();
  assert.equal(r.status, "DOWN");
});

test("a hung check times out to DOWN (deterministic via injected timer)", async () => {
  // Inject a timer that fires immediately so a never-resolving check resolves to DOWN at once.
  const h = new HealthRegistry({
    checkTimeoutMs: 5,
    setTimer: (cb) => { cb(); return 0; },
    clearTimer: () => {},
  });
  h.registerReadiness("hang", () => new Promise(() => {})); // never settles
  const r = await h.readiness();
  assert.equal(r.status, "DOWN");
  assert.equal(r.components.hang.detail, "timeout");
});

test("timer cleanup failure is typed DOWN and preserves an existing failure result", async () => {
  const cleanupFails = () => { throw new Error("timer cleanup failed"); };

  const healthy = new HealthRegistry({ setTimer: () => 0, clearTimer: cleanupFails });
  healthy.registerReadiness("db", () => true);
  const healthyReport = await healthy.readiness();
  assert.equal(healthyReport.status, "DOWN");
  assert.deepEqual(healthyReport.components.db, { status: "DOWN", detail: "timer cleanup failed" });

  const failing = new HealthRegistry({ setTimer: () => 0, clearTimer: cleanupFails });
  failing.registerReadiness("db", () => { throw new Error("dependency failed"); });
  const failingReport = await failing.readiness();
  assert.equal(failingReport.status, "DOWN");
  assert.deepEqual(failingReport.components.db, { status: "DOWN", detail: "check threw" });
});

test("a malformed (garbage) result is treated as DOWN", async () => {
  const h = new HealthRegistry();
  h.registerReadiness("weird", () => ({ notAStatus: true }));
  const r = await h.readiness();
  assert.equal(r.status, "DOWN");
});

test("liveness and readiness are independent surfaces", async () => {
  const h = new HealthRegistry();
  h.registerReadiness("dep", () => false); // not ready…
  assert.equal((await h.liveness()).status, "UP");   // …but the process is alive
  assert.equal((await h.readiness()).status, "DOWN");
});

test("unregister removes a check", async () => {
  const h = new HealthRegistry();
  h.registerReadiness("dep", () => false);
  assert.equal((await h.readiness()).status, "DOWN");
  h.unregister("dep");
  assert.equal((await h.readiness()).status, "UP");
});
