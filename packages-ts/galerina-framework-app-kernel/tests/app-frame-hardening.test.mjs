// App-frame hardening slice (grok/app-frame-hardening-20261003): closed route-policy validation,
// posture/env refusal, duplicate-route refusal, gate-recorded audit provenance, rate counted before
// decode, and strict registry verdicts. Each finding (S1-S5, S7-S9 of the 2026-10-03 app-frame
// review) has a refusing (negative) case and an admitting (positive) control.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAppKernel, resolveEffectiveRoutePolicy, fusePackage } from "../dist/index.js";

const enc = new TextEncoder();
const here = dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = join(here, "..", "..", "..", "examples", "fuse-demo", "my-custom-api-rest");

function req(over = {}) {
  return { method: "GET", path: "/r", headers: {}, body: new Uint8Array(0), query: {}, requestId: "rq", receivedAt: 0, ...over };
}
function post(bytes, over = {}) {
  return req({ method: "POST", headers: { "content-type": "application/json" }, body: bytes, ...over });
}
const ok = () => ({ body: { ok: true } });
const V = { T: (v) => typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).every((k) => k === "a") };
function kernel(route, extra = {}) {
  return createAppKernel({
    routes: [{ method: "GET", path: "/r", handler: "h", auth: { mode: "public" }, ...route }],
    dispatch: { h: ok },
    requestValidators: V,
    ...extra,
  });
}
function capturingSink() {
  const events = [];
  return {
    events,
    sink: {
      reserve: () => Object.freeze({ id: Symbol("audit") }),
      commit: (_r, e) => events.push(e),
      cancel: () => {},
      emit: (e) => events.push(e),
    },
  };
}

// ── S1: numeric policy values ──
const BAD_NUMBERS = [NaN, Infinity, -Infinity, -1, 1.5, "10", true];
for (const [block, field] of [["body", "maxSizeBytes"], ["limits", "maxConcurrent"], ["limits", "memoryBytes"], ["limits", "timeoutMs"]]) {
  for (const bad of BAD_NUMBERS) {
    test(`S1 refuses ${block}.${field} = ${String(bad)} at construction`, () => {
      assert.throws(() => kernel({ method: "POST", requestType: "T", idempotency: false, [block]: { [field]: bad } }),
        new RegExp(`Invalid route policy for 'POST /r': '${block}\\.${field}' must be an integer`));
    });
  }
  test(`S1 admits integer ${block}.${field} (control)`, () => {
    assert.doesNotThrow(() => kernel({ method: "POST", requestType: "T", idempotency: false, [block]: { [field]: 1000 } }));
  });
}

test("S1 refuses limits.timeoutMs above the host timer ceiling", () => {
  assert.throws(() => kernel({ limits: { timeoutMs: 2_147_483_648 } }), /'limits\.timeoutMs' must be an integer from 0 to 2147483647/);
});

test("S1 zero is fail-closed, not refused: maxSizeBytes 0 refuses every body (413)", async () => {
  const k = kernel({ method: "POST", requestType: "T", idempotency: false, body: { maxSizeBytes: 0 } });
  assert.equal((await k.handle(post(enc.encode("{}")))).status, 413);
});

test("S1 NaN can no longer disable the body ceiling or concurrency limit (previously 200)", () => {
  assert.throws(() => kernel({ method: "POST", requestType: "T", idempotency: false, body: { maxSizeBytes: NaN } }), /maxSizeBytes/);
  assert.throws(() => kernel({ limits: { maxConcurrent: NaN } }), /maxConcurrent/);
});

for (const bad of [NaN, 0, -1, Infinity, "60"]) {
  test(`S1 refuses idempotency.ttlSeconds = ${String(bad)}`, () => {
    assert.throws(() => kernel({ method: "POST", idempotency: { ttlSeconds: bad } }), /'idempotency\.ttlSeconds' must be a finite number above 0/);
  });
}
test("S1 admits a positive idempotency.ttlSeconds (control)", () => {
  assert.doesNotThrow(() => kernel({ method: "POST", idempotency: { ttlSeconds: 60 } }));
});

// ── S2: auth mode and other enums ──
for (const bad of ["Required", "PUBLIC", "", "none", 1]) {
  test(`S2 refuses auth.mode = ${JSON.stringify(bad)}`, () => {
    assert.throws(() => kernel({ auth: { mode: bad } }), /'auth\.mode' must be one of required, public/);
  });
}
test("S2 admits auth.mode required/public (controls); required without a verdict is 401", async () => {
  assert.doesNotThrow(() => kernel({ auth: { mode: "public" } }));
  const k = kernel({ auth: { mode: "required" } });
  assert.equal((await k.handle(req())).status, 401);
});

test("S2 refuses a wrong-case or unknown method", () => {
  assert.throws(() => kernel({ method: "get" }), /'method' must be one of GET/);
  assert.throws(() => kernel({ method: "TRACE" }), /'method' must be one of GET/);
});

for (const [name, block, value, msg] of [
  ["body.unknownFields", { body: { unknownFields: "Deny" } }, "Deny", /'body\.unknownFields' must be one of deny, allow/],
  ["body.duplicateKeys", { body: { duplicateKeys: "lastwins" } }, "lastwins", /'body\.duplicateKeys' must be one of deny, lastWins/],
  ["idempotency.onDuplicate", { method: "POST", idempotency: { onDuplicate: "Reject" } }, "Reject", /'idempotency\.onDuplicate' must be one of reject(?!, replay)/],
  ["idempotency.enabled", { method: "POST", idempotency: { enabled: 1 } }, 1, /'idempotency\.enabled' must be a boolean/],
  ["idempotency.header", { method: "POST", idempotency: { header: "Bad Header" } }, "Bad Header", /'idempotency\.header' must be a valid HTTP header name/],
  ["audit.runtimeReport", { audit: { runtimeReport: "false" } }, "false", /'audit\.runtimeReport' must be a boolean/],
  ["auth.scopes", { auth: { mode: "public", scopes: ["a", "a"] } }, "dup", /'auth\.scopes' repeats 'a'/],
  ["secrets.require", { secrets: { require: [""] } }, "", /'secrets\.require' entries must be non-empty strings/],
  ["body.contentType", { body: { contentType: " " } }, " ", /'body\.contentType' must be a non-empty string/],
]) {
  test(`S2 refuses ${name} = ${JSON.stringify(value)}`, () => {
    assert.throws(() => kernel(block), msg);
  });
}
test("S2 admits valid enum, boolean and list values (control)", () => {
  assert.doesNotThrow(() => kernel({
    method: "POST",
    body: { unknownFields: "allow", duplicateKeys: "lastWins", contentType: "application/json" },
    idempotency: { enabled: true, onDuplicate: "reject", header: "Idempotency-Key" },
    audit: { runtimeReport: true },
    auth: { mode: "public", scopes: ["a", "b"] },
  }));
});

test("S2 resolveEffectiveRoutePolicy refuses directly too, and rejects an unknown resolved posture", () => {
  assert.throws(() => resolveEffectiveRoutePolicy({ method: "GET", path: "/r", handler: "h", auth: { mode: "Required" } }), /auth\.mode/);
  assert.throws(() => resolveEffectiveRoutePolicy({ method: "GET", path: "/r", handler: "h" }, { posture: "ON" }), /Unknown resolved posture 'ON'/);
  assert.equal(resolveEffectiveRoutePolicy({ method: "GET", path: "/r", handler: "h" }, { posture: "on" }).limits.maxConcurrent, 5);
});

// ── S8: strip is refused until implemented ──
test("S8 refuses body.unknownFields 'strip' (not implemented)", () => {
  assert.throws(() => kernel({ method: "POST", requestType: "T", body: { unknownFields: "strip" } }), /'body\.unknownFields: strip' is not implemented/);
});
test("S8 'deny' still refuses an extra field at request time (control)", async () => {
  const k = kernel({ method: "POST", requestType: "T", idempotency: false, body: { unknownFields: "deny" } });
  assert.equal((await k.handle(post(enc.encode(JSON.stringify({ a: 1, extra: 1 }))))).status, 422);
  assert.equal((await k.handle(post(enc.encode(JSON.stringify({ a: 1 }))))).status, 200);
});

// ── S3: posture and env strings ──
for (const bad of ["ON", "Off", "secure", ""]) {
  test(`S3 refuses posture ${JSON.stringify(bad)} (previously downgraded to 'off')`, () => {
    assert.throws(() => kernel({}, { posture: bad }), /Unknown security posture/);
  });
}
test("S3 refuses an unknown env string", () => {
  assert.throws(() => kernel({}, { posture: "auto", env: "Production" }), /Unknown environment 'Production'/);
});
test("S3 admits off/on/auto and omitted posture (controls); 'on' still tightens the body ceiling", async () => {
  for (const p of ["off", "on", "auto"]) assert.doesNotThrow(() => kernel({}, { posture: p }));
  assert.doesNotThrow(() => kernel({}));
  const big = enc.encode(JSON.stringify({ a: "x".repeat(100_000) }));
  const on = kernel({ method: "POST", requestType: "T", idempotency: false }, { posture: "on" });
  assert.equal((await on.handle(post(big))).status, 413);
});

// ── S4: duplicate routes ──
test("S4 refuses two declarations for the same method and path", () => {
  assert.throws(() => createAppKernel({
    routes: [
      { method: "GET", path: "/r", handler: "a", auth: { mode: "public" } },
      { method: "GET", path: "/r", handler: "b", auth: { mode: "public" } },
    ],
    dispatch: { a: ok, b: ok },
  }), /Duplicate route declaration for 'GET \/r'/);
});
test("S4 admits the same path with different methods (control)", async () => {
  const k = createAppKernel({
    routes: [
      { method: "GET", path: "/r", handler: "a", auth: { mode: "public" } },
      { method: "DELETE", path: "/r", handler: "b", auth: { mode: "public" }, idempotency: false },
    ],
    dispatch: { a: () => ({ status: 201, body: {} }), b: () => ({ status: 202, body: {} }) },
  });
  assert.equal((await k.handle(req())).status, 201);
  assert.equal((await k.handle(req({ method: "DELETE" }))).status, 202);
});

// ── S5: audit provenance ──
test("S5 a handler-forged {error} body is NOT recorded as a kernel gate code", async () => {
  const { sink, events } = capturingSink();
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/r", handler: "h", auth: { mode: "public" } }],
    dispatch: { h: () => ({ status: 401, body: { error: "unauthorized" } }) },
    auditSink: sink,
  });
  const res = await k.handle(req());
  assert.equal(res.status, 401);
  assert.equal(events.length, 1);
  assert.equal(events[0].errorCode, undefined);
  assert.equal(events[0].origin, "handler");
});
test("S5 a real kernel refusal records its own gate code (control)", async () => {
  const { sink, events } = capturingSink();
  const k = createAppKernel({
    routes: [{ method: "GET", path: "/r", handler: "h" }],
    dispatch: { h: ok },
    auditSink: sink,
  });
  assert.equal((await k.handle(req())).status, 401);
  assert.equal(events[0].errorCode, "unauthorized");
  assert.equal(events[0].origin, "kernel");
});
test("S5 a handler success records origin 'handler' and no code", async () => {
  const { sink, events } = capturingSink();
  const k = kernel({}, { auditSink: sink });
  assert.equal((await k.handle(req())).status, 200);
  assert.equal(events[0].errorCode, undefined);
  assert.equal(events[0].origin, "handler");
});

// ── S7: rate counted before decode ──
test("S7 malformed bodies use up the rate budget (previously 3x422 then 200)", async () => {
  const k = kernel({ method: "POST", requestType: "T", idempotency: false, limits: { rate: "1/minute" } });
  assert.equal((await k.handle(post(enc.encode("{bad")))).status, 422);
  assert.equal((await k.handle(post(enc.encode("{bad")))).status, 429);
  assert.equal((await k.handle(post(enc.encode("{}")))).status, 429);
});
test("S7 a well-formed body inside the budget is admitted (control)", async () => {
  const k = kernel({ method: "POST", requestType: "T", idempotency: false, limits: { rate: "2/minute" } });
  assert.equal((await k.handle(post(enc.encode("{}")))).status, 200);
  assert.equal((await k.handle(post(enc.encode("{}")))).status, 200);
  assert.equal((await k.handle(post(enc.encode("{}")))).status, 429);
});

// ── S9 (fuse half): strict registry verdict ──
test("S9 a truthy non-boolean registry verdict refuses the fuse", async () => {
  await assert.rejects(
    () => fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: () => ({ ok: 1 }) }),
    /FUNGI-FUSE-REGISTRY-DENIED/,
  );
  await assert.rejects(
    () => fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: () => ({ ok: "yes" }) }),
    /FUNGI-FUSE-REGISTRY-DENIED/,
  );
});
test("S9 a literal true registry verdict still admits (control)", async () => {
  const component = await fusePackage(DEMO_DIR, { allowUnsigned: true, warn: () => {}, registryCheck: () => ({ ok: true }) });
  assert.equal(component.name, "my-custom-api-rest");
});

// ── S8b: onDuplicate 'replay' is refused until implemented (the kernel only ever rejects a duplicate) ──
const REPLAY_REFUSED = /'idempotency\.onDuplicate: replay' is not implemented/;
test("S8b refuses idempotency.onDuplicate 'replay' (not implemented)", () => {
  assert.throws(() => kernel({ method: "POST", requestType: "T", idempotency: { enabled: true, onDuplicate: "replay" } }), REPLAY_REFUSED);
});
test("S8b refuses 'replay' even on a disabled idempotency block (a declaration must not lie)", () => {
  assert.throws(() => kernel({ method: "POST", requestType: "T", idempotency: { enabled: false, onDuplicate: "replay" } }), REPLAY_REFUSED);
});
test("S8b resolveEffectiveRoutePolicy refuses 'replay' directly too", () => {
  assert.throws(
    () => resolveEffectiveRoutePolicy({ method: "POST", path: "/r", handler: "h", requestType: "T", idempotency: { onDuplicate: "replay" } }),
    REPLAY_REFUSED,
  );
});
test("S8b 'reject' still admits and a duplicate key is 409; the default resolves to 'reject' (control)", async () => {
  const k = kernel({ method: "POST", requestType: "T", idempotency: { enabled: true, onDuplicate: "reject" } });
  const send = () => post(enc.encode(JSON.stringify({ a: 1 })), { headers: { "content-type": "application/json", "idempotency-key": "k-1" } });
  assert.equal((await k.handle(send())).status, 200);
  assert.equal((await k.handle(send())).status, 409);
  const resolved = resolveEffectiveRoutePolicy({ method: "POST", path: "/r", handler: "h", requestType: "T", idempotency: { enabled: true } });
  assert.equal(resolved.idempotency.onDuplicate, "reject");
});
