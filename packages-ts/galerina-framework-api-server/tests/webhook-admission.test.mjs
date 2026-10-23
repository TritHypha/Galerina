import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import http from "node:http";

import { createAppKernel } from "../../galerina-framework-app-kernel/dist/index.js";
import { Verdict } from "../../galerina-tower-citizen/dist/index.js";
import {
  MemoryReplayStore,
  admitWebhookReplay,
  createApiServer,
  listen,
  WEBHOOK_REPLAY_SCOPE,
} from "../dist/index.js";

const SECRET = "webhook-secret";
const BODY = Buffer.from(JSON.stringify({ amount: 100 }), "utf8");

function signature(body, secret = SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function request(port, { method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Begin a declared request body, send only its prefix, and let the test finish it later. */
function startRequestWithIncompleteBody(port, { method, path, headers = {}, body, prefixBytes }) {
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => {
    resolveResponse = resolve;
    rejectResponse = reject;
  });
  // Mark socket failures handled immediately; awaiting `response` still receives the rejection.
  void response.catch(() => undefined);
  const req = http.request({
    host: "127.0.0.1",
    port,
    method,
    path,
    headers: { ...headers, "content-length": String(body.byteLength) },
  }, (res) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(chunk));
    res.on("end", () => resolveResponse({
      status: res.statusCode,
      body: Buffer.concat(chunks).toString("utf8"),
    }));
  });
  req.on("error", rejectResponse);
  req.setTimeout(2000, () => req.destroy(new Error("incomplete upload timed out")));
  req.flushHeaders();
  req.write(body.subarray(0, prefixBytes));
  return {
    req,
    response,
    finish: () => setImmediate(() => req.end(body.subarray(prefixBytes))),
  };
}

describe("admitWebhookReplay — HMAC before replay/decode", () => {
  it("claims replay after a valid HMAC and does not decode on HMAC failure", async () => {
    const store = new MemoryReplayStore({ now: () => 10_000 });
    const events = [];
    const ok = await admitWebhookReplay({
      body: BODY,
      headers: {
        "x-hub-signature-256": signature(BODY),
        "x-event-id": "evt-1",
      },
      secret: SECRET,
      signatureHeader: "x-hub-signature-256",
      eventIdHeader: "x-event-id",
      replayStore: store,
      replayTtlSeconds: 30,
      signaturePrefix: "sha256=",
      decode: () => { events.push("decode"); return { amount: 100 }; },
      hooks: {
        onHmac: (value) => events.push(value ? "hmac-ok" : "hmac-fail"),
        onReplayClaim: (value) => events.push(`replay-${value}`),
      },
    });
    assert.equal(ok.ok, true);
    assert.deepEqual(events, ["hmac-ok", "replay-claimed", "decode"]);

    events.length = 0;
    const forged = await admitWebhookReplay({
      body: BODY,
      headers: {
        "x-hub-signature-256": signature(BODY, "wrong"),
        "x-event-id": "evt-2",
      },
      secret: SECRET,
      signatureHeader: "x-hub-signature-256",
      eventIdHeader: "x-event-id",
      replayStore: store,
      replayTtlSeconds: 30,
      signaturePrefix: "sha256=",
      decode: () => { events.push("decode"); return {}; },
      hooks: {
        onHmac: (value) => events.push(value ? "hmac-ok" : "hmac-fail"),
        onReplayClaim: (value) => events.push(`replay-${value}`),
      },
    });
    assert.equal(forged.ok, false);
    assert.equal(forged.reason, "hmac");
    assert.deepEqual(events, ["hmac-fail"]);
    assert.equal(store.claim(WEBHOOK_REPLAY_SCOPE, "evt-2", 30), "claimed");
  });

  it("refuses a duplicate event id until TTL expiry and isolates namespaces", async () => {
    let now = 10_000;
    const store = new MemoryReplayStore({ now: () => now });
    const first = await admitWebhookReplay({
      body: BODY,
      headers: {
        "x-hub-signature-256": signature(BODY),
        "x-event-id": "evt-dup",
      },
      secret: SECRET,
      signatureHeader: "x-hub-signature-256",
      eventIdHeader: "x-event-id",
      replayStore: store,
      replayTtlSeconds: 2,
      signaturePrefix: "sha256=",
    });
    const second = await admitWebhookReplay({
      body: BODY,
      headers: {
        "x-hub-signature-256": signature(BODY),
        "x-event-id": "evt-dup",
      },
      secret: SECRET,
      signatureHeader: "x-hub-signature-256",
      eventIdHeader: "x-event-id",
      replayStore: store,
      replayTtlSeconds: 2,
      signaturePrefix: "sha256=",
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "replay");
    assert.equal(store.claim("idempotency", "evt-dup", 2), "claimed");

    now = 12_000;
    const afterExpiry = await admitWebhookReplay({
      body: BODY,
      headers: {
        "x-hub-signature-256": signature(BODY),
        "x-event-id": "evt-dup",
      },
      secret: SECRET,
      signatureHeader: "x-hub-signature-256",
      eventIdHeader: "x-event-id",
      replayStore: store,
      replayTtlSeconds: 2,
      signaturePrefix: "sha256=",
    });
    assert.equal(afterExpiry.ok, true);
  });

  it("binds replay identity to the authenticated body, not the unsigned event id", async () => {
    const store = new MemoryReplayStore({ now: () => 10_000 });
    const first = await admitWebhookReplay({
      body: BODY,
      headers: {
        "x-hub-signature-256": signature(BODY),
        "x-event-id": "evt-a",
      },
      secret: SECRET,
      signatureHeader: "x-hub-signature-256",
      eventIdHeader: "x-event-id",
      replayStore: store,
      replayTtlSeconds: 30,
      signaturePrefix: "sha256=",
    });
    const second = await admitWebhookReplay({
      body: BODY,
      headers: {
        "x-hub-signature-256": signature(BODY),
        "x-event-id": "evt-b",
      },
      secret: SECRET,
      signatureHeader: "x-hub-signature-256",
      eventIdHeader: "x-event-id",
      replayStore: store,
      replayTtlSeconds: 30,
      signaturePrefix: "sha256=",
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.reason, "replay");
  });

  it("refuses a malformed claim result without treating it as claimed", async () => {
    const store = {
      claim() { return "maybe"; },
    };
    const result = await admitWebhookReplay({
      body: BODY,
      headers: {
        "x-hub-signature-256": signature(BODY),
        "x-event-id": "evt-bad",
      },
      secret: SECRET,
      signatureHeader: "x-hub-signature-256",
      eventIdHeader: "x-event-id",
      replayStore: store,
      replayTtlSeconds: 30,
      signaturePrefix: "sha256=",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "malformed");
  });
});

describe("createApiServer webhook gate", () => {
  it("rechecks revoked authority after an incomplete signed upload before HMAC, replay, or dispatch", async () => {
    const ran = { value: 0 };
    const events = [];
    let claims = 0;
    let authorized = true;
    const phases = [];
    const store = new MemoryReplayStore({ now: () => 10_000 });
    const replayStore = {
      claim(...args) {
        claims += 1;
        return store.claim(...args);
      },
    };
    const body = Buffer.from(JSON.stringify({ amount: 321 }), "utf8");
    const kernel = createAppKernel({
      routes: [{
        method: "POST",
        path: "/charge",
        handler: "charge",
        requestType: "ChargeRequest",
        auth: { mode: "required", scopes: ["orders:write"] },
      }],
      requestValidators: {
        ChargeRequest(value) {
          return value !== null && typeof value === "object" && !Array.isArray(value)
            && Number.isFinite(value.amount);
        },
      },
      dispatch: {
        charge: () => { ran.value += 1; return { status: 200, body: { ok: true } }; },
      },
    });
    const server = createApiServer({
      kernel,
      allowInsecureLoopback: true,
      resolveChannelVerdict: () => Verdict.ALLOW,
      resolvePrincipal(_context, phase) {
        phases.push(phase);
        return {
          principalId: "gateway-a",
          principalScopes: authorized ? ["orders:write"] : [],
        };
      },
      webhook: {
        secret: SECRET,
        signatureHeader: "x-hub-signature-256",
        eventIdHeader: "x-event-id",
        replayStore,
        replayTtlSeconds: 30,
        signaturePrefix: "sha256=",
        hooks: {
          onHmac: (ok) => events.push(ok ? "hmac-ok" : "hmac-fail"),
          onReplayClaim: (result) => events.push(`replay-${result}`),
        },
      },
    });
    const { port } = await listen(server, 0);
    let pending;
    try {
      pending = startRequestWithIncompleteBody(port, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "idemp-upload-revoked",
          "x-hub-signature-256": signature(body),
          "x-event-id": "evt-upload-revoked",
        },
        body,
        prefixBytes: 8,
      });
      const preflightDeadline = Date.now() + 1000;
      while (phases.length === 0 && Date.now() < preflightDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.deepEqual(phases, ["preflight"], "preflight must occur while upload remains incomplete");
      authorized = false;
      pending.finish();
      const denied = await pending.response;
      assert.equal(denied.status, 403);
      assert.deepEqual(phases, ["preflight", "dispatch"]);
      assert.equal(claims, 0, "revoked authority must not consume replay identity");
      assert.deepEqual(events, [], "revoked authority must not invoke webhook admission hooks");
      assert.equal(ran.value, 0, "revoked authority must not dispatch the protected handler");

      // Paired ALLOW control: a distinct valid signed event reaches each downstream stage.
      authorized = true;
      phases.length = 0;
      const allowedBody = Buffer.from(JSON.stringify({ amount: 322 }), "utf8");
      const allowed = await request(port, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "idemp-upload-allowed",
          "x-hub-signature-256": signature(allowedBody),
          "x-event-id": "evt-upload-allowed",
        },
        body: allowedBody,
      });
      assert.equal(allowed.status, 200);
      assert.deepEqual(phases, ["preflight", "dispatch"]);
      assert.equal(claims, 1);
      assert.deepEqual(events, ["hmac-ok", "replay-claimed"]);
      assert.equal(ran.value, 1);
    } finally {
      pending?.req.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("refuses revoked route scope before consuming a webhook replay identity", async () => {
    const ran = { value: false };
    let claims = 0;
    const store = new MemoryReplayStore({ now: () => 10_000 });
    const replayStore = {
      claim(...args) {
        claims += 1;
        return store.claim(...args);
      },
    };
    const body = Buffer.from(JSON.stringify({ amount: 321 }), "utf8");
    const phases = [];
    const kernel = createAppKernel({
      routes: [{
        method: "POST",
        path: "/charge",
        handler: "charge",
        requestType: "ChargeRequest",
        auth: { mode: "required", scopes: ["orders:write"] },
      }],
      requestValidators: {
        ChargeRequest(value) {
          return value !== null && typeof value === "object" && !Array.isArray(value)
            && Number.isFinite(value.amount);
        },
      },
      dispatch: {
        charge: () => { ran.value = true; return { status: 200, body: { ok: true } }; },
      },
    });
    const server = createApiServer({
      kernel,
      allowInsecureLoopback: true,
      resolveChannelVerdict: () => Verdict.ALLOW,
      resolvePrincipal(_context, phase) {
        phases.push(phase);
        return {
          principalId: "gateway-a",
          principalScopes: phase === "preflight" ? ["orders:write"] : [],
        };
      },
      webhook: {
        secret: SECRET,
        signatureHeader: "x-hub-signature-256",
        eventIdHeader: "x-event-id",
        replayStore,
        replayTtlSeconds: 30,
        signaturePrefix: "sha256=",
      },
    });
    const { port } = await listen(server, 0);
    try {
      const response = await request(port, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "revoked-scope-positive-control",
          "x-hub-signature-256": signature(body),
          "x-event-id": "evt-revoked-scope",
        },
        body,
      });
      assert.equal(response.status, 403);
      assert.equal(claims, 0, "revoked route authority must not consume replay identity");
      assert.equal(ran.value, false);
      assert.deepEqual(phases, ["preflight", "dispatch"]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("does not dispatch the kernel handler on invalid HMAC or replay", async () => {
    const ran = { value: false };
    const store = new MemoryReplayStore({ now: () => 10_000 });
    const kernel = createAppKernel({
      routes: [{
        method: "POST",
        path: "/charge",
        handler: "charge",
        requestType: "ChargeRequest",
        auth: { mode: "public" },
      }],
      requestValidators: {
        ChargeRequest(value) {
          return value !== null && typeof value === "object" && !Array.isArray(value)
            && Object.keys(value).length === 1 && Number.isFinite(value.amount);
        },
      },
      dispatch: {
        charge: () => { ran.value = true; return { status: 200, body: { ok: true } }; },
      },
    });
    const server = createApiServer({
      kernel,
      allowInsecureLoopback: true,
      webhook: {
        secret: SECRET,
        signatureHeader: "x-hub-signature-256",
        eventIdHeader: "x-event-id",
        replayStore: store,
        replayTtlSeconds: 30,
        signaturePrefix: "sha256=",
      },
    });
    const { port } = await listen(server, 0);
    try {
      const forged = await request(port, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signature(BODY, "wrong"),
          "x-event-id": "evt-http-1",
        },
        body: BODY,
      });
      assert.equal(forged.status, 401);
      assert.equal(ran.value, false);

      const first = await request(port, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "charge-http-2",
          "x-hub-signature-256": signature(BODY),
          "x-event-id": "evt-http-2",
        },
        body: BODY,
      });
      assert.equal(first.status, 200);
      assert.equal(ran.value, true);

      ran.value = false;
      const replayed = await request(port, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "charge-http-2b",
          "x-hub-signature-256": signature(BODY),
          "x-event-id": "evt-http-2",
        },
        body: BODY,
      });
      assert.equal(replayed.status, 409);
      assert.equal(ran.value, false);

      const rotatedId = await request(port, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "charge-http-3",
          "x-hub-signature-256": signature(BODY),
          "x-event-id": "evt-http-3",
        },
        body: BODY,
      });
      assert.equal(rotatedId.status, 409);
      assert.equal(ran.value, false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("hostile: a non-ALLOW channel does not consume replay identity", async () => {
    const ran = { value: false };
    const store = new MemoryReplayStore({ now: () => 10_000 });
    const uniqueBody = Buffer.from(JSON.stringify({ amount: 777 }), "utf8");
    const kernel = createAppKernel({
      routes: [{
        method: "POST",
        path: "/charge",
        handler: "charge",
        requestType: "ChargeRequest",
        auth: { mode: "public" },
      }],
      requestValidators: {
        ChargeRequest(value) {
          return value !== null && typeof value === "object" && !Array.isArray(value)
            && Object.keys(value).length === 1 && Number.isFinite(value.amount);
        },
      },
      dispatch: {
        charge: () => { ran.value = true; return { status: 200, body: { ok: true } }; },
      },
    });
    const denied = createApiServer({
      kernel,
      allowInsecureLoopback: true,
      resolveChannelVerdict: () => undefined,
      webhook: {
        secret: SECRET,
        signatureHeader: "x-hub-signature-256",
        eventIdHeader: "x-event-id",
        replayStore: store,
        replayTtlSeconds: 30,
        signaturePrefix: "sha256=",
      },
    });
    const { port: deniedPort } = await listen(denied, 0);
    try {
      const blocked = await request(deniedPort, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": signature(uniqueBody),
          "x-event-id": "evt-channel-1",
        },
        body: uniqueBody,
      });
      assert.equal(blocked.status, 401);
      assert.equal(ran.value, false);
    } finally {
      await new Promise((resolve) => denied.close(resolve));
    }

    const allowed = createApiServer({
      kernel,
      allowInsecureLoopback: true,
      resolveChannelVerdict: () => Verdict.ALLOW,
      resolvePrincipal: () => ({ principalId: "webhook-test", principalScopes: [] }),
      webhook: {
        secret: SECRET,
        signatureHeader: "x-hub-signature-256",
        eventIdHeader: "x-event-id",
        replayStore: store,
        replayTtlSeconds: 30,
        signaturePrefix: "sha256=",
      },
    });
    const { port: allowedPort } = await listen(allowed, 0);
    try {
      const ok = await request(allowedPort, {
        method: "POST",
        path: "/charge",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "charge-channel-1",
          "x-hub-signature-256": signature(uniqueBody),
          "x-event-id": "evt-channel-1",
        },
        body: uniqueBody,
      });
      assert.equal(ok.status, 200, ok.body);
      assert.equal(ran.value, true);
    } finally {
      await new Promise((resolve) => allowed.close(resolve));
    }
  });
});
