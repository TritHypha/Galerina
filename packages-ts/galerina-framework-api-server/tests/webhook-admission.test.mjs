import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import http from "node:http";

import { createAppKernel } from "../../galerina-framework-app-kernel/dist/index.js";
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
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
