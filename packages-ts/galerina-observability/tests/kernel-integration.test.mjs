// Kernel integration — surface observability THROUGH the real App Kernel, end-to-end.
// Imports the actual createAppKernel from the sibling package's built dist (additive, no kernel change).
import assert from "node:assert/strict";
import { test } from "node:test";

import { createAppKernel } from "../../galerina-framework-app-kernel/dist/index.js";
import {
  MetricsCollector,
  HealthRegistry,
  observabilityRoutes,
  instrumentDispatch,
  metricsAuditSink,
  createObservability,
} from "../dist/index.js";

const dec = new TextDecoder();

function req(over = {}) {
  return {
    method: "GET",
    path: "/",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId: "rq",
    receivedAt: 0,
    ...over,
  };
}

function bodyJson(res) {
  return res.body === undefined ? undefined : JSON.parse(dec.decode(res.body));
}

test("health probes surface as public kernel routes: live UP ⇒ 200", async () => {
  const registry = new HealthRegistry();
  const metrics = new MetricsCollector();
  const surface = observabilityRoutes({ registry, metrics });
  const kernel = createAppKernel({ routes: surface.routes, dispatch: surface.dispatch });

  const res = await kernel.handle(req({ method: "GET", path: "/health/live" }));
  assert.equal(res.status, 200);
  assert.equal(bodyJson(res).status, "UP");
});

test("readiness DOWN ⇒ 503 through the kernel", async () => {
  const registry = new HealthRegistry();
  registry.registerReadiness("db", () => false);
  const metrics = new MetricsCollector();
  const surface = observabilityRoutes({ registry, metrics });
  const kernel = createAppKernel({ routes: surface.routes, dispatch: surface.dispatch });

  const res = await kernel.handle(req({ method: "GET", path: "/health/ready" }));
  assert.equal(res.status, 503);
  assert.equal(bodyJson(res).status, "DOWN");
});

test("combined /health reflects both surfaces", async () => {
  const registry = new HealthRegistry();
  registry.registerReadiness("dep", () => true);
  const surface = observabilityRoutes({ registry, metrics: new MetricsCollector() });
  const kernel = createAppKernel({ routes: surface.routes, dispatch: surface.dispatch });

  const res = await kernel.handle(req({ method: "GET", path: "/health" }));
  assert.equal(res.status, 200);
  const b = bodyJson(res);
  assert.equal(b.status, "UP");
  assert.equal(b.liveness.status, "UP");
  assert.equal(b.readiness.status, "UP");
  assert.equal("components" in b, false);
});

test("public health responses are status-only and do not expose component detail", async () => {
  const registry = new HealthRegistry();
  registry.registerReadiness("db", () => ({ status: "DOWN", detail: "credential=secret-value" }));
  const surface = observabilityRoutes({ registry, metrics: new MetricsCollector() });
  const kernel = createAppKernel({ routes: surface.routes, dispatch: surface.dispatch });

  const ready = await kernel.handle(req({ method: "GET", path: "/health/ready" }));
  assert.equal(ready.status, 503);
  assert.deepEqual(bodyJson(ready), { status: "DOWN" });
  assert.ok(!new TextDecoder().decode(ready.body).includes("secret-value"));

  const combined = await kernel.handle(req({ method: "GET", path: "/health" }));
  assert.deepEqual(bodyJson(combined), {
    status: "DOWN",
    liveness: { status: "UP" },
    readiness: { status: "DOWN" },
  });
});

test("health fail-safe uses the tagged status-only public schema", async () => {
  const surface = observabilityRoutes({
    registry: {
      async liveness() { throw new Error("private failure"); },
      async readiness() { return { status: "UP", kind: "readiness", components: {} }; },
    },
    metrics: new MetricsCollector(),
  });
  const response = await surface.dispatch["observability.live"]({});
  assert.equal(response.status, 503);
  assert.deepEqual(response.body, { status: "DOWN" });
});

test("health timer cleanup failure remains a typed 503 through the kernel", async () => {
  const registry = new HealthRegistry({
    setTimer: () => 0,
    clearTimer: () => { throw new Error("timer cleanup failed"); },
  });
  registry.registerReadiness("db", () => true);
  const surface = observabilityRoutes({ registry, metrics: new MetricsCollector() });
  const kernel = createAppKernel({ routes: surface.routes, dispatch: surface.dispatch });
  const response = await kernel.handle(req({ method: "GET", path: "/health/ready" }));
  assert.equal(response.status, 503);
  assert.deepEqual(bodyJson(response), { status: "DOWN" });
});

test("/metrics is secure-by-default (required auth ⇒ 401 without a verdict)", async () => {
  const surface = observabilityRoutes({ registry: new HealthRegistry(), metrics: new MetricsCollector() });
  const kernel = createAppKernel({ routes: surface.routes, dispatch: surface.dispatch });
  const res = await kernel.handle(req({ method: "GET", path: "/metrics" }));
  assert.equal(res.status, 401);
});

test("/metrics with metricsAuth:public serves the JSON snapshot", async () => {
  const metrics = new MetricsCollector();
  metrics.record({ method: "GET", route: "/a", status: 200, durationMs: 5 });
  const surface = observabilityRoutes({ registry: new HealthRegistry(), metrics, metricsAuth: "public" });
  const kernel = createAppKernel({ routes: surface.routes, dispatch: surface.dispatch });
  const res = await kernel.handle(req({ method: "GET", path: "/metrics" }));
  assert.equal(res.status, 200);
  assert.equal(bodyJson(res).totalRequests, 1);
});

test("includePrometheus exposes app-ops text at /metrics/prometheus", async () => {
  const metrics = new MetricsCollector();
  metrics.record({ method: "GET", route: "/a", status: 200, durationMs: 5 });
  const surface = observabilityRoutes({
    registry: new HealthRegistry(), metrics, metricsAuth: "public", includePrometheus: true,
  });
  const kernel = createAppKernel({ routes: surface.routes, dispatch: surface.dispatch });
  const res = await kernel.handle(req({ method: "GET", path: "/metrics/prometheus" }));
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/plain/);
  assert.match(dec.decode(res.body), /app_requests_total/);
});

test("basePath emits one canonical prefix and rejects ambiguous or hostile paths", () => {
  const clean = observabilityRoutes({
    registry: new HealthRegistry(),
    metrics: new MetricsCollector(),
    basePath: "actuator/",
  });
  assert.equal(clean.routes[0].path, "/actuator/health/live");

  const invalid = [
    "//actuator//",
    "///",
    "/actuator/../admin",
    "/actuator?token=secret",
    "/actuator#fragment",
    "/actuator\\admin",
    "/actuátor",
    `/a${"x".repeat(200)}`,
    "/actuator/\u0000",
  ];
  for (const basePath of invalid) {
    assert.throws(
      () => observabilityRoutes({ registry: new HealthRegistry(), metrics: new MetricsCollector(), basePath }),
      /basePath/,
      basePath,
    );
  }
});

test("instrumentDispatch records counts AND latency for handled requests", async () => {
  const metrics = new MetricsCollector();
  const dispatch = instrumentDispatch(
    { echo: () => ({ status: 200, body: { ok: true } }) },
    metrics,
    // Deterministic latency: 0 then 12 ms.
    { now: (() => { let t = 0; return () => (t += 12) - 12; })() },
  );
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/echo", handler: "echo", auth: { mode: "public" } }],
    dispatch,
  });
  const res = await kernel.handle(req({ method: "GET", path: "/echo" }));
  assert.equal(res.status, 200);
  const s = metrics.snapshot();
  assert.equal(s.totalRequests, 1);
  assert.equal(s.latency.count, 1);
  assert.equal(s.latency.maxMs, 12);
});

test("instrumented handler that THROWS ⇒ kernel 500 AND a recorded 5xx error (fail-closed)", async () => {
  const metrics = new MetricsCollector();
  const dispatch = instrumentDispatch(
    { boom: () => { throw new Error("secret detail"); } },
    metrics,
  );
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/boom", handler: "boom", auth: { mode: "public" } }],
    dispatch,
  });
  const res = await kernel.handle(req({ method: "GET", path: "/boom" }));
  assert.equal(res.status, 500);
  assert.ok(!dec.decode(res.body).includes("secret detail"), "no internal leak");
  const s = metrics.snapshot();
  assert.equal(s.errors, 1);
  assert.equal(s.byStatusClass["5xx"], 1);
});

test("metricsAuditSink feeds counts off the kernel audit pipe (counts only, no latency)", async () => {
  const metrics = new MetricsCollector();
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/a", handler: "a", auth: { mode: "public" } }],
    dispatch: { a: () => ({ status: 200, body: {} }) },
    auditSink: metricsAuditSink(metrics),
  });
  await kernel.handle(req({ method: "GET", path: "/a" }));
  await kernel.handle(req({ method: "GET", path: "/missing" })); // 404 — still audited
  const s = metrics.snapshot();
  assert.equal(s.totalRequests, 2);
  assert.equal(s.byStatusClass["2xx"], 1);
  assert.equal(s.byStatusClass["4xx"], 1);
  assert.equal(s.latency.count, 0); // audit pipe carries no duration
});

test("createObservability bundles a ready-to-compose surface", async () => {
  const obs = createObservability({ routes: { metricsAuth: "public" } });
  obs.registry.registerReadiness("ready", () => true);
  const appDispatch = { hi: () => ({ status: 200, body: { hi: true } }) };
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/hi", handler: "hi", auth: { mode: "public" } }, ...obs.routes],
    dispatch: obs.instrument({ ...appDispatch, ...obs.dispatch }),
  });
  assert.equal((await kernel.handle(req({ method: "GET", path: "/hi" }))).status, 200);
  assert.equal((await kernel.handle(req({ method: "GET", path: "/health/ready" }))).status, 200);
  const metricsRes = await kernel.handle(req({ method: "GET", path: "/metrics" }));
  assert.equal(metricsRes.status, 200);
  // The three handled requests were all instrumented into the bundled collector.
  assert.ok(bodyJson(metricsRes).totalRequests >= 2);
});

test("createObservability rejects route authority overrides and non-data options", () => {
  assert.throws(
    () => createObservability({ routes: { registry: new HealthRegistry() } }),
    /unsupported key 'registry'/,
  );
  assert.throws(
    () => createObservability({ routes: { metrics: new MetricsCollector() } }),
    /unsupported key 'metrics'/,
  );

  const accessorRoutes = {};
  Object.defineProperty(accessorRoutes, "metricsAuth", {
    configurable: true,
    enumerable: true,
    get() { throw new Error("getter must not run"); },
  });
  assert.throws(
    () => createObservability({ routes: accessorRoutes }),
    /routes\.metricsAuth must be an own data property/,
  );

  const inheritedRoutes = Object.create({ metricsAuth: "public" });
  assert.throws(
    () => createObservability({ routes: inheritedRoutes }),
    /plain or null prototype/,
  );
});

test("createObservability refuses mixing auditSink and instrument metrics seams", () => {
  const auditFirst = createObservability();
  const reservation = auditFirst.auditSink.reserve();
  auditFirst.auditSink.cancel(reservation);
  assert.throws(
    () => auditFirst.instrument({}),
    /mutually exclusive/,
  );

  const instrumentFirst = createObservability();
  instrumentFirst.instrument({});
  assert.throws(
    () => instrumentFirst.auditSink.reserve(),
    /mutually exclusive/,
  );
});
