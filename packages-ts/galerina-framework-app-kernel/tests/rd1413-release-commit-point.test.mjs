// Addendum-01 (c) red/green tests for result-sink release as the atomic commit point.
// Synthetic data only. Does not modify rd1413-revocation-before-delivery.test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createAppKernel } from "../dist/index.js";
import {
  createSecretGate,
  ReleaseCommitAuthority,
  SecretReleaseRefused,
} from "../dist/secret-gate.js";

const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];

function liveProvider(stored, hooks = {}) {
  let revoked = false;
  let opens = 0;
  const provider = {
    has() {
      const present = !revoked;
      if (typeof hooks.afterHas === "function") hooks.afterHas(present);
      return present;
    },
    use(_name, callback) {
      if (revoked) throw new Error("credential revoked before provider open");
      opens += 1;
      callback(stored);
    },
    revoke() {
      revoked = true;
      stored.fill(0);
    },
    opens() {
      return opens;
    },
  };
  return provider;
}

function isRefused(err, outcome) {
  return err instanceof SecretReleaseRefused && err.outcome === outcome && err.code === "secret_unavailable";
}

test("CAS: missing lease refuses", () => {
  const authority = new ReleaseCommitAuthority();
  assert.equal(authority.consume("no-such-lease", "token", 0), "missing");
  assert.equal(authority.stateOf("no-such-lease"), "missing");
});

test("CAS: stale ordering token refuses and fences the unused lease", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-stale-token", 2);
  assert.equal(authority.consume(lease.leaseId, "not-the-token", 2), "stale");
  assert.equal(authority.stateOf("op-stale-token"), "fenced");
  assert.equal(authority.consume(lease.leaseId, lease.token, 2), "fenced");
});

test("CAS: stale epoch refuses as one compare-and-consume step", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-stale-epoch", 3);
  assert.equal(authority.consume(lease.leaseId, lease.token, 4), "stale");
  assert.equal(authority.stateOf("op-stale-epoch"), "fenced");
});

test("CAS: replayed consumed lease refuses", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-replay", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "replay");
  assert.equal(authority.stateOf("op-replay"), "released");
});

test("CAS: revoke-before-release fences; consume refuses", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-rev-first", 1);
  authority.fence(lease.leaseId);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "fenced");
  assert.equal(authority.stateOf("op-rev-first"), "fenced");
});

test("CAS: release-before-revoke completes once; later fence cannot recall", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-rel-first", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  authority.fence(lease.leaseId);
  assert.equal(authority.stateOf("op-rel-first"), "released");
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "replay");
});

test("CAS: uncertain delivery is status-only; no retry redisclosure", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-unknown", 0);
  assert.equal(authority.consume(lease.leaseId, lease.token, 0), "released");
  authority.markUnknown(lease.leaseId);
  assert.equal(authority.stateOf("op-unknown"), "delivery-unknown");
  assert.equal(authority.consume(lease.leaseId, lease.token, 0), "replay");
});

test("getSecret: revoke-before-release (epoch advanced after open) refuses with no consumer entry", () => {
  const stored = new Uint8Array(SYNTHETIC);
  let epoch = 0;
  let opened = false;
  let consumerEntered = false;
  const provider = {
    has() {
      if (opened) epoch += 1;
      return true;
    },
    use(_name, callback) {
      opened = true;
      callback(stored);
    },
    revocationEpoch() {
      return epoch;
    },
  };
  const authority = new ReleaseCommitAuthority();
  const gate = createSecretGate(provider, { authority });
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {
      consumerEntered = true;
    }, undefined, "op-epoch-race"),
    (err) => isRefused(err, "stale"),
  );
  assert.equal(consumerEntered, false);
  assert.equal(authority.stateOf("op-epoch-race"), "fenced");
});

test("getSecret: release-before-revoke delivers once; later revoke cannot recall or reuse", () => {
  const stored = new Uint8Array(SYNTHETIC);
  const provider = liveProvider(stored);
  const authority = new ReleaseCommitAuthority();
  const gate = createSecretGate(provider, { authority });
  let received;
  gate.getSecret(["credential"], "credential", (view) => {
    received = [...view];
  }, undefined, "op-deliver-once");
  assert.deepEqual(received, SYNTHETIC);
  assert.equal(authority.stateOf("op-deliver-once"), "released");
  provider.revoke();
  let second;
  assert.throws(
    () => gate.getSecret(["credential"], "credential", (view) => {
      second = [...view];
    }, undefined, "op-deliver-once"),
    (err) => isRefused(err, "replay"),
  );
  assert.equal(second, undefined);
  assert.equal(provider.opens(), 1);
});

test("getSecret: consumer throw after D is delivery-unknown; retry refuses without redisclosure", () => {
  const stored = new Uint8Array(SYNTHETIC);
  const provider = liveProvider(stored);
  const authority = new ReleaseCommitAuthority();
  const gate = createSecretGate(provider, { authority });
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {
      throw new Error("consumer failed after seeing bytes");
    }, undefined, "op-partial"),
    (err) => err instanceof Error && err.message === "consumer failed after seeing bytes",
  );
  assert.equal(authority.stateOf("op-partial"), "delivery-unknown");
  let retryEntered = false;
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {
      retryEntered = true;
    }, undefined, "op-partial"),
    (err) => isRefused(err, "replay"),
  );
  assert.equal(retryEntered, false);
  assert.equal(provider.opens(), 1);
});

test("getSecret: SealArena-like transient wipe still delivers when has() stays true", () => {
  const stored = new Uint8Array(SYNTHETIC);
  let received;
  const provider = {
    has() {
      return true;
    },
    use(_name, fn) {
      const transient = new Uint8Array(stored);
      try {
        fn(transient);
      } finally {
        transient.fill(0);
      }
    },
  };
  const gate = createSecretGate(provider);
  gate.getSecret(["credential"], "credential", (view) => {
    received = [...view];
  });
  assert.deepEqual(received, SYNTHETIC);
});

test("getSecret: SealArena-like revoke after use (has false) fences without consumer entry", () => {
  const stored = new Uint8Array(SYNTHETIC);
  let useReturned = false;
  let consumerEntered = false;
  const provider = {
    has() {
      return useReturned ? false : true;
    },
    use(_name, fn) {
      const transient = new Uint8Array(stored);
      try {
        fn(transient);
      } finally {
        transient.fill(0);
        useReturned = true;
      }
    },
  };
  const gate = createSecretGate(provider);
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {
      consumerEntered = true;
    }),
    (err) => isRefused(err, "fenced"),
  );
  assert.equal(consumerEntered, false);
});

test("kernel: result-sink fence maps to 503 secret_unavailable without leaking", async () => {
  const stored = new Uint8Array(SYNTHETIC);
  let revoked = false;
  let useReturned = false;
  let consumerEntered = false;
  const provider = {
    has() {
      const observedPresent = !revoked;
      if (useReturned && observedPresent) {
        revoked = true;
        stored.fill(0);
      }
      return observedPresent;
    },
    use(_name, callback) {
      if (revoked) throw new Error("credential revoked before provider open");
      callback(stored);
      useReturned = true;
    },
  };
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/auth/verify",
      handler: "verify",
      auth: { mode: "public" },
      secrets: { require: ["credential"] },
    }],
    dispatch: {
      verify: ({ getSecret }) => {
        getSecret("credential", (view) => {
          consumerEntered = true;
          return { leaked: [...view] };
        });
        return { body: { ok: true } };
      },
    },
    secretsProvider: provider,
  });
  const res = await kernel.handle({
    method: "GET",
    path: "/auth/verify",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId: "u1-verify-fence",
    receivedAt: 0,
  });
  assert.equal(res.status, 503);
  const body = JSON.parse(new TextDecoder().decode(res.body));
  assert.equal(body.error, "secret_unavailable");
  assert.equal(body.message, "A required secret is unavailable.");
  assert.equal(Object.prototype.hasOwnProperty.call(body, "outcome"), false);
  assert.equal(consumerEntered, false);
});
