// R3: acknowledge throw fails closed (delivery-unknown/refused, never acknowledged).
// Synthetic data only. Does not modify rd1413-revocation-before-delivery.test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel, InMemoryAuditSink } from "../dist/kernel.js";
import { ReleaseCommitAuthority } from "../dist/secret-gate.js";

const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];
const dec = new TextDecoder();

function req(requestId) {
  return {
    method: "GET",
    path: "/pay",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId,
    receivedAt: 0,
  };
}

function errorOf(res) {
  if (res.body === undefined) return undefined;
  return JSON.parse(dec.decode(res.body)).error;
}

function waitMacrotask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function countingProvider(stored = new Uint8Array(SYNTHETIC)) {
  return {
    has() {
      return true;
    },
    use(_name, fn) {
      fn(new Uint8Array(stored));
    },
    revocationEpoch() {
      return 0;
    },
  };
}

class SelectiveThrowAck extends ReleaseCommitAuthority {
  constructor() {
    super();
    this.throwFor = new Set();
    this.throwAll = false;
    this.throwIfNot = null;
  }
  acknowledgeMinted(operationId) {
    if (this.throwAll || this.throwFor.has(operationId) || (this.throwIfNot !== null && operationId !== this.throwIfNot)) {
      throw new Error("forced-ack");
    }
    return super.acknowledgeMinted(operationId);
  }
}

function latestOperationId(authority) {
  const events = authority.auditEvents();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const id = events[i].operationId;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return "";
}

test("kernel: acknowledge throw is delivery-unknown and never acknowledged", async () => {
  const authority = new SelectiveThrowAck();
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      audit: { runtimeReport: true },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => {});
        return { body: { ok: true } };
      },
    },
    secretsProvider: countingProvider(),
    releaseAuthority: authority,
    auditSink: new InMemoryAuditSink(),
  });
  authority.throwAll = true;
  const response = await kernel.handle(req("rq-ack"));
  const operationId = latestOperationId(authority);
  await waitMacrotask();
  assert.equal(response.status, 500);
  assert.equal(errorOf(response), "internal_error");
  assert.equal(authority.status(operationId).kind, "DELIVERY_UNKNOWN");
  authority.throwAll = false;
  authority.throwFor.delete(operationId);
  assert.notEqual(authority.acknowledgeMinted(operationId), "acknowledged");
});

test("kernel: acknowledge throw on A leaves concurrent B acknowledged", async () => {
  const authority = new SelectiveThrowAck();
  let releaseB;
  const gate = new Promise((resolve) => {
    releaseB = resolve;
  });
  let calls = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      audit: { runtimeReport: true },
    }],
    dispatch: {
      pay: async ({ getSecret }) => {
        getSecret("db.main", () => {});
        calls += 1;
        if (calls === 1) {
          await gate;
        }
        return { body: { ok: true } };
      },
    },
    secretsProvider: countingProvider(),
    releaseAuthority: authority,
    auditSink: new InMemoryAuditSink(),
  });
  const pendingB = kernel.handle(req("rq-B"));
  await waitMacrotask();
  const operationB = latestOperationId(authority);
  assert.equal(authority.status(operationB).kind, "RELEASED_UNACKED");
  authority.throwIfNot = operationB;
  const responseA = await kernel.handle(req("rq-A"));
  const operationA = authority.auditEvents().map((e) => e.operationId).find((id) => id !== operationB) ?? "";
  await waitMacrotask();
  assert.equal(responseA.status, 500);
  assert.equal(authority.status(operationA).kind, "DELIVERY_UNKNOWN");
  assert.equal(authority.status(operationB).kind, "RELEASED_UNACKED");
  releaseB();
  const responseB = await pendingB;
  await waitMacrotask();
  assert.equal(responseB.status, 200);
  assert.equal(authority.status(operationB).kind, "RELEASED_ACKED");
  assert.equal(authority.status(operationA).kind, "DELIVERY_UNKNOWN");
});
