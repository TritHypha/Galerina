// WU4 fix-04: ACK only after final HTTP response and successful audit commit.
// Synthetic data only. Does not modify rd1413-revocation-before-delivery.test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel } from "../dist/kernel.js";
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

function lateCallbackProvider(stored = new Uint8Array(SYNTHETIC)) {
  return {
    has() {
      return true;
    },
    use(_name, fn) {
      fn(new Uint8Array(stored));
      queueMicrotask(() => {
        queueMicrotask(() => {
          try {
            fn(new Uint8Array(stored));
          } catch {
            // gate refuses the late callback
          }
        });
      });
    },
    revocationEpoch() {
      return 0;
    },
  };
}

function throwingCommitSink() {
  return {
    reserve() {
      return { id: 1 };
    },
    commit() {
      throw new Error("audit-boom");
    },
    cancel() {},
    emit() {},
  };
}

function acceptingSink() {
  const events = [];
  return {
    reserve() {
      return { id: 1 };
    },
    commit(_reservation, event) {
      events.push(event);
    },
    cancel() {},
    emit(event) {
      events.push(event);
    },
    events,
  };
}

test("audit-sink commit throw is HTTP 503 and status is not acknowledged", async () => {
  const authority = new ReleaseCommitAuthority();
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
    auditSink: throwingCommitSink(),
  });
  const response = await kernel.handle(req("rq-audit-boom"));
  await waitMacrotask();
  const operationId = `rq-audit-boom\u0000${1}`;
  const status = authority.status(operationId);
  assert.equal(response.status, 503);
  assert.equal(errorOf(response), "audit_unavailable");
  assert.equal(status.state, "delivery-unknown");
});

test("late provider callback before publication seal is error HTTP and not acknowledged", async () => {
  const authority = new ReleaseCommitAuthority();
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
    secretsProvider: lateCallbackProvider(),
    releaseAuthority: authority,
    auditSink: acceptingSink(),
  });
  const response = await kernel.handle(req("rq-late-cb"));
  await waitMacrotask();
  const operationId = `rq-late-cb\u0000${1}`;
  const status = authority.status(operationId);
  assert.equal(response.status >= 500, true);
  assert.equal(status.state, "delivery-unknown");
});

test("clean publication and audit commit leaves the lease delivery-unknown, never acknowledged (MB-06)", async () => {
  const authority = new ReleaseCommitAuthority();
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
    auditSink: acceptingSink(),
  });
  const response = await kernel.handle(req("rq-clean-ack"));
  await waitMacrotask();
  const operationId = `rq-clean-ack\u0000${1}`;
  assert.equal(response.status, 200);
  // MB-06 (Phillip 2026-10-22, option a): a successful handoff is DELIVERY_UNKNOWN (106); the
  // kernel never acknowledges, and a later ACK cannot promote the lease to acknowledged.
  assert.equal(authority.status(operationId).state, "delivery-unknown");
  assert.notEqual(authority.acknowledgeMinted(operationId), "acknowledged");
  assert.equal(authority.status(operationId).state, "delivery-unknown");
});
