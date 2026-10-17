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
  const minted = `${requestId}\u00001`;
  assert.equal(response.status, 200);
  assert.equal(authority.status(clientOp).kind, "NOT_FOUND");
  assert.equal(authority.stateOf(clientOp), "missing");
  assert.notEqual(authority.status(minted).kind, "NOT_FOUND");
  assert.equal(authority.status(minted).kind, "RELEASED_ACKED");
  assert.equal(authority.stateOf(minted), "acknowledged");
});
