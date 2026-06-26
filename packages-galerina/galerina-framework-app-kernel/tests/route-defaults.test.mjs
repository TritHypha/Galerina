// Secure-by-default route policy resolver (§10, framework P1 slice 1).
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveEffectiveRoutePolicy, SECURE_DEFAULTS } from "../dist/index.js";

test("a minimal POST route is maximally secure (deny-by-default)", () => {
  const p = resolveEffectiveRoutePolicy({ method: "POST", path: "/orders", handler: "createOrder" });
  assert.equal(p.auth.mode, "required");
  assert.equal(p.body.contentType, "application/json");
  assert.equal(p.body.maxSizeBytes, 256 * 1024);
  assert.equal(p.body.unknownFields, "deny");
  assert.equal(p.idempotency.enabled, true);          // POST is mutating
  assert.equal(p.idempotency.header, "Idempotency-Key");
  assert.equal(p.limits.rate, "60/minute");
  assert.equal(p.audit.runtimeReport, true);
  assert.deepEqual([...p.appliedDefaults].sort(), ["audit", "auth", "body", "idempotency", "limits"]);
  assert.deepEqual([...p.relaxations], []);
});

test("GET is not idempotency-gated by default", () => {
  const p = resolveEffectiveRoutePolicy({ method: "GET", path: "/health", handler: "health" });
  assert.equal(p.idempotency.enabled, false);
  assert.ok(!p.appliedDefaults.includes("idempotency"));
  assert.equal(p.auth.mode, "required");               // still auth-required by default
});

test("auth: public is recorded as an explicit relaxation", () => {
  const p = resolveEffectiveRoutePolicy({
    method: "GET", path: "/health", handler: "health", auth: { mode: "public" },
  });
  assert.equal(p.auth.mode, "public");
  assert.ok(p.relaxations.includes("auth:public"));
});

test("raising the body limit / loosening unknownFields is recorded", () => {
  const p = resolveEffectiveRoutePolicy({
    method: "POST", path: "/up", handler: "up",
    body: { maxSizeBytes: 5 * 1024 * 1024, unknownFields: "allow" },
  });
  assert.equal(p.body.maxSizeBytes, 5 * 1024 * 1024);
  assert.ok(p.relaxations.some((r) => r.startsWith("body.maxSize:")));
  assert.ok(p.relaxations.includes("body.unknownFields:allow"));
});

test("disabling idempotency on a mutating method is a recorded relaxation", () => {
  const p = resolveEffectiveRoutePolicy({ method: "DELETE", path: "/x", handler: "del", idempotency: false });
  assert.equal(p.idempotency.enabled, false);
  assert.ok(p.relaxations.includes("idempotency:disabled-on-mutating"));
});

test("posture 'on' tightens body + limit ceilings", () => {
  const normal = resolveEffectiveRoutePolicy({ method: "POST", path: "/a", handler: "h" });
  const hardened = resolveEffectiveRoutePolicy({ method: "POST", path: "/a", handler: "h" }, { posture: "on" });
  assert.ok(hardened.body.maxSizeBytes < normal.body.maxSizeBytes);
  assert.ok(hardened.limits.maxConcurrent < normal.limits.maxConcurrent);
  assert.equal(hardened.limits.rate, "30/minute");
});

test("SECURE_DEFAULTS are deny-by-default", () => {
  assert.equal(SECURE_DEFAULTS.auth.mode, "required");
  assert.equal(SECURE_DEFAULTS.body.unknownFields, "deny");
  assert.equal(SECURE_DEFAULTS.body.duplicateKeys, "deny");
  assert.equal(SECURE_DEFAULTS.audit.runtimeReport, true);
});
