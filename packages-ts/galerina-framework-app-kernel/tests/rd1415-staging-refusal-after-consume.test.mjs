// WU4 fix-03: staging refusal after consume must not leave the lease released.
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

function latestOperationId(authority) {
  const events = authority.auditEvents();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const id = events[i].operationId;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return "";
}

function dumpHasSecret(value) {
  const dumped = JSON.stringify(value);
  if (dumped.includes("SECRET")) return true;
  if (dumped.includes("\u0000")) return true;
  if (dumped.includes(SYNTHETIC.join(","))) return true;
  const hex = Buffer.from(Uint8Array.from(SYNTHETIC)).toString("hex");
  if (dumped.toLowerCase().includes(hex)) return true;
  const b64 = Buffer.from(Uint8Array.from(SYNTHETIC)).toString("base64");
  if (dumped.includes(b64)) return true;
  return false;
}

function waitMacrotask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function hasThrowProvider(stored) {
  let opened = false;
  return {
    has() {
      if (opened) throw new Error("has-boom");
      return true;
    },
    use(_name, fn) {
      opened = true;
      fn(new Uint8Array(stored));
    },
    revocationEpoch() {
      return 0;
    },
  };
}

function liveMutationProvider(stored) {
  let opened = false;
  return {
    has() {
      if (opened) stored[0] ^= 0xff;
      return true;
    },
    use(_name, fn) {
      opened = true;
      fn(stored);
    },
    revocationEpoch() {
      return 0;
    },
  };
}

function hasFalseProvider(stored) {
  let opened = false;
  return {
    has() {
      return opened ? false : true;
    },
    use(_name, fn) {
      opened = true;
      fn(new Uint8Array(stored));
    },
    revocationEpoch() {
      return 0;
    },
  };
}

const cases = [
  { name: "has-throw", provider: hasThrowProvider },
  { name: "live-mutation", provider: liveMutationProvider },
  { name: "has-false", provider: hasFalseProvider },
];

function makeKernel({ provider, authority, auditSink, catchRefusal }) {
  let consumerCalled = 0;
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
        if (catchRefusal) {
          try {
            getSecret("db.main", () => {
              consumerCalled += 1;
            });
          } catch {
            // handler swallows the staging refusal
          }
          return { body: { ok: true } };
        }
        getSecret("db.main", () => {
          consumerCalled += 1;
        });
        return { body: { ok: true } };
      },
    },
    secretsProvider: provider,
    releaseAuthority: authority,
    auditSink,
  });
  return {
    kernel,
    consumerCalled: () => consumerCalled,
  };
}

for (const scenario of cases) {
  for (const catchRefusal of [false, true]) {
    const mode = catchRefusal ? "handler-caught" : "uncaught";
    test(`kernel: ${scenario.name} ${mode} does not leave the lease released`, async () => {
      const stored = new Uint8Array(SYNTHETIC);
      const authority = new ReleaseCommitAuthority();
      const auditSink = new InMemoryAuditSink();
      const harness = makeKernel({
        provider: scenario.provider(stored),
        authority,
        auditSink,
        catchRefusal,
      });
      const requestId = `rq-${scenario.name}-${mode}`;
      const response = await harness.kernel.handle(req(requestId));
      await waitMacrotask();
      const operationId = latestOperationId(authority);
      const status = authority.status(operationId);
      const ack = authority.acknowledgeMinted(operationId);
      const bodyText = response.body === undefined ? "" : dec.decode(response.body);
      const auditDump = JSON.stringify(auditSink.drained());

      assert.equal(harness.consumerCalled(), 0, `${scenario.name} ${mode} consumer`);
      assert.notEqual(status.kind, "RELEASED_UNACKED", `${scenario.name} ${mode} status`);
      assert.equal(status.kind, "DELIVERY_UNKNOWN", `${scenario.name} ${mode} status`);
      assert.equal(Object.keys(status).sort().join(","), "kind,operationId");
      assert.notEqual(ack, "released");
      assert.notEqual(ack, "acknowledged");
      assert.equal(ack, "replay");
      if (catchRefusal) {
        assert.equal(response.status, 500, `${scenario.name} ${mode} http`);
        assert.equal(errorOf(response), "internal_error");
      } else {
        assert.equal(response.status, 503, `${scenario.name} ${mode} http`);
        assert.equal(errorOf(response), "secret_unavailable");
      }
      assert.equal(bodyText.includes("SECRET"), false);
      assert.equal(dumpHasSecret(status), false);
      assert.equal(dumpHasSecret(authority.auditEvents()), false);
      assert.equal(auditDump.includes("SECRET"), false);
      assert.doesNotMatch(auditDump, /digest|sha-?256|"token"/i);
    });
  }
}
