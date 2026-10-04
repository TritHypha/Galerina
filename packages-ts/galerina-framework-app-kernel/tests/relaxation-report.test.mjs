// Relaxation report completeness (app-frame follow-up to PR #5). The security report records
// every explicit weakening of the secure defaults (types.ts: "every explicit relaxation recorded
// for the security report"). body.maxSize and limits.maxConcurrent above the posture ceiling are
// recorded; a raised limits.rate or limits.timeoutMs was not, so a route could loosen its rate
// limit or deadline without the report showing it. Each case has a recorded (negative) and a
// not-recorded (positive control) twin, under both resolved postures.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel, resolveEffectiveRoutePolicy } from "../dist/index.js";

const route = (limits) => ({ method: "GET", path: "/r", handler: "h", limits });
const relax = (limits, posture) =>
  [...resolveEffectiveRoutePolicy(route(limits), posture === "on" ? { posture: "on" } : { posture: "off" }).relaxations];

test("a rate above the posture ceiling is a recorded relaxation (off: 60/minute)", () => {
  assert.ok(relax({ rate: "61/minute" }, "off").includes("limits.rate:61/minute"));
  assert.ok(relax({ rate: "100000/minute" }, "off").includes("limits.rate:100000/minute"));
});

test("a rate at or below the ceiling is not a relaxation (off)", () => {
  for (const rate of ["60/minute", "59/minute", "1/minute", "0/minute"]) {
    assert.deepEqual(relax({ rate }, "off").filter((r) => r.startsWith("limits.rate")), [], rate);
  }
});

test("the rate ceiling is posture-aware (on: 30/minute)", () => {
  assert.ok(relax({ rate: "31/minute" }, "on").includes("limits.rate:31/minute"));
  assert.ok(relax({ rate: "60/minute" }, "on").includes("limits.rate:60/minute"));
  assert.deepEqual(relax({ rate: "30/minute" }, "on").filter((r) => r.startsWith("limits.rate")), []);
});

test("a timeout above the posture ceiling is a recorded relaxation (off: 10000 ms)", () => {
  assert.ok(relax({ timeoutMs: 10_001 }, "off").includes("limits.timeoutMs:10001"));
  assert.ok(relax({ timeoutMs: 600_000 }, "off").includes("limits.timeoutMs:600000"));
});

test("a timeout at or below the ceiling is not a relaxation (0 ms is fail-closed)", () => {
  for (const timeoutMs of [10_000, 9_999, 1, 0]) {
    assert.deepEqual(relax({ timeoutMs }, "off").filter((r) => r.startsWith("limits.timeoutMs")), [], String(timeoutMs));
  }
});

test("the timeout ceiling is posture-aware (on: 5000 ms)", () => {
  assert.ok(relax({ timeoutMs: 5_001 }, "on").includes("limits.timeoutMs:5001"));
  assert.ok(relax({ timeoutMs: 10_000 }, "on").includes("limits.timeoutMs:10000"));
  assert.deepEqual(relax({ timeoutMs: 5_000 }, "on").filter((r) => r.startsWith("limits.timeoutMs")), []);
});

test("controls: maxConcurrent stays recorded, defaults record nothing, all three can stack", () => {
  assert.ok(relax({ maxConcurrent: 11 }, "off").includes("limits.maxConcurrent:11"));
  const p = resolveEffectiveRoutePolicy({ method: "GET", path: "/r", handler: "h" }, { posture: "off" });
  assert.deepEqual([...p.relaxations], []);
  assert.ok(p.appliedDefaults.includes("limits"));
  assert.deepEqual(
    relax({ rate: "120/minute", maxConcurrent: 20, timeoutMs: 20_000 }, "off").filter((r) => r.startsWith("limits.")).sort(),
    ["limits.maxConcurrent:20", "limits.rate:120/minute", "limits.timeoutMs:20000"],
  );
});

test("a malformed rate is still refused by the kernel; resolution records no rate relaxation for it", () => {
  assert.deepEqual(relax({ rate: "fast" }, "off").filter((r) => r.startsWith("limits.rate")), []);
  assert.throws(
    () => createAppKernel({ routes: [{ ...route({ rate: "fast" }), auth: { mode: "public" } }], dispatch: { h: () => ({ body: { ok: true } }) } }),
    /Unsupported route rate 'fast'/,
  );
});

test("the runtime audit event carries the rate and timeout relaxations", async () => {
  const events = [];
  const auditSink = {
    reserve: () => Object.freeze({ id: Symbol("audit") }),
    commit: (_r, e) => events.push(e),
    cancel: () => {},
    emit: (e) => events.push(e),
  };
  const k = createAppKernel({
    routes: [{ ...route({ rate: "90/minute", timeoutMs: 15_000 }), auth: { mode: "public" } }],
    dispatch: { h: () => ({ body: { ok: true } }) },
    posture: "off",
    auditSink,
  });
  const res = await k.handle({ method: "GET", path: "/r", headers: {}, body: new Uint8Array(0), query: {}, requestId: "rq", receivedAt: 0 });
  assert.equal(res.status, 200);
  assert.equal(events.length, 1);
  assert.ok(events[0].relaxations.includes("limits.rate:90/minute"));
  assert.ok(events[0].relaxations.includes("limits.timeoutMs:15000"));
  assert.ok(events[0].relaxations.includes("auth:public"));
});
