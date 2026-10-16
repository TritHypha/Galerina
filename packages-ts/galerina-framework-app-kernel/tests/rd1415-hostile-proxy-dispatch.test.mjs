// WU4 fix-05: revoked/hostile Proxy throw cannot stick a released lease.
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

function revokedProxy() {
  const { proxy, revoke } = Proxy.revocable({ message: "hostile" }, {});
  revoke();
  return proxy;
}

function throwingProtoProxy() {
  return new Proxy({}, {
    getPrototypeOf() {
      throw new Error("getPrototypeOf-boom");
    },
  });
}

function makeKernel({ authority, auditSink, runtimeReport, dispatch }) {
  return createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      audit: { runtimeReport },
    }],
    dispatch,
    secretsProvider: countingProvider(),
    releaseAuthority: authority,
    auditSink,
  });
}

const cases = [
  { name: "sync-revoked", runtimeReport: true, asyncHandler: false, thrower: revokedProxy },
  { name: "async-revoked", runtimeReport: true, asyncHandler: true, thrower: revokedProxy },
  { name: "sync-revoked-no-report", runtimeReport: false, asyncHandler: false, thrower: revokedProxy },
  { name: "async-revoked-no-report", runtimeReport: false, asyncHandler: true, thrower: revokedProxy },
  { name: "sync-getPrototypeOf", runtimeReport: true, asyncHandler: false, thrower: throwingProtoProxy },
];

for (const scenario of cases) {
  test(`kernel: ${scenario.name} is HTTP 500 and delivery-unknown`, async () => {
    const authority = new ReleaseCommitAuthority();
    const auditSink = new InMemoryAuditSink();
    const kernel = makeKernel({
      authority,
      auditSink,
      runtimeReport: scenario.runtimeReport,
      dispatch: {
        pay: ({ getSecret }) => {
          getSecret("db.main", () => {});
          const thrown = scenario.thrower();
          if (scenario.asyncHandler) return Promise.reject(thrown);
          throw thrown;
        },
      },
    });
    const requestId = `rq-${scenario.name}`;
    const response = await kernel.handle(req(requestId));
    await waitMacrotask();
    const operationId = `${requestId}\u0000${1}`;
    const status = authority.status(operationId);
    const ack = authority.acknowledgeMinted(operationId);
    assert.equal(response.status, 500, `${scenario.name} http`);
    assert.equal(errorOf(response), "internal_error");
    assert.equal(status.state, "delivery-unknown", `${scenario.name} status`);
    assert.notEqual(ack, "acknowledged");
    assert.notEqual(ack, "released");
    if (scenario.runtimeReport) {
      const events = auditSink.drained();
      assert.equal(events.length >= 1, true, `${scenario.name} runtime event`);
      assert.equal(events.some((event) => event.status === 500), true);
    }
  });
}
