// RD-1415: kernel-minted release id is requestId\0seq. Client fields never become the lease id.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppKernel } from "../dist/kernel.js";
import { ReleaseCommitAuthority } from "../dist/secret-gate.js";

const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];

test("kernel: client operation id in header body query is never the lease id", async () => {
  const authority = new ReleaseCommitAuthority();
  const stored = new Uint8Array(SYNTHETIC);
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => {});
        return { body: { ok: true } };
      },
    },
    secretsProvider: {
      has() {
        return true;
      },
      use(_name, fn) {
        fn(new Uint8Array(stored));
      },
      revocationEpoch() {
        return 1;
      },
    },
    releaseAuthority: authority,
  });
  const clientOp = "client-chosen-op-id";
  const requestId = "rq-kernel-mint";
  const response = await kernel.handle({
    method: "GET",
    path: "/pay",
    headers: {
      "x-operation-id": clientOp,
      operationId: clientOp,
    },
    body: new Uint8Array(0),
    query: { operationId: clientOp },
    operationId: clientOp,
    requestId,
    receivedAt: 0,
  });
  const mintedFromRequest = `${requestId}\u00001`;
  assert.equal(response.status, 200);
  assert.equal(authority.status(clientOp).kind, "NOT_FOUND");
  assert.equal(authority.stateOf(clientOp), "missing");
  assert.equal(authority.status(requestId).kind, "NOT_FOUND");
  assert.equal(authority.status(mintedFromRequest).kind, "NOT_FOUND");
  const released = authority.auditEvents().filter((e) => e.outcome === "released");
  assert.equal(released.length, 1);
  const minted = released[0].operationId;
  assert.notEqual(minted, clientOp);
  assert.notEqual(minted, requestId);
  assert.notEqual(minted, mintedFromRequest);
  assert.equal(authority.status(minted).kind, "RELEASED_ACKED");
  assert.equal(authority.stateOf(minted), "acknowledged");
});

test("kernel: two kernels sharing one authority and requestId get different lease ids", async () => {
  const authority = new ReleaseCommitAuthority();
  const stored = new Uint8Array(SYNTHETIC);
  function makeKernel() {
    return createAppKernel({
      routes: [{
        method: "GET",
        path: "/pay",
        handler: "pay",
        auth: { mode: "public" },
        secrets: { require: ["db.main"] },
      }],
      dispatch: {
        pay: ({ getSecret }) => {
          getSecret("db.main", () => {});
          return { body: { ok: true } };
        },
      },
      secretsProvider: {
        has() {
          return true;
        },
        use(_name, fn) {
          fn(new Uint8Array(stored));
        },
        revocationEpoch() {
          return 1;
        },
      },
      releaseAuthority: authority,
    });
  }
  const requestId = "rq-shared";
  const req = {
    method: "GET",
    path: "/pay",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId,
    receivedAt: 0,
  };
  const k1 = makeKernel();
  const k2 = makeKernel();
  const r1 = await k1.handle(req);
  const r2 = await k2.handle(req);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  const released = authority.auditEvents().filter((e) => e.outcome === "released");
  assert.equal(released.length, 2);
  assert.notEqual(released[0].operationId, released[1].operationId);
  assert.notEqual(released[0].operationId, `${requestId}\u00001`);
  assert.notEqual(released[1].operationId, `${requestId}\u00001`);
});
