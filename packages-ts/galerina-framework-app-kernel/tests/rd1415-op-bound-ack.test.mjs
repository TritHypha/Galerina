// WU4 / RD-1415 schedule-matrix: operation-bound ACK and status-only recovery.
// Synthetic data only. Does not modify rd1413-revocation-before-delivery.test.mjs.
import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";
import {
  createSecretGate,
  ReleaseCommitAuthority,
  RELEASE_LEASE_CAP,
  RELEASE_AUDIT_CAP,
  RELEASE_RETIRED_CAP,
  SecretReleaseRefused,
} from "../dist/secret-gate.js";

const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];

function countingProvider(stored = new Uint8Array(SYNTHETIC), epoch = 1) {
  let useCount = 0;
  let hasCount = 0;
  const provider = {
    has() {
      hasCount += 1;
      return true;
    },
    use(_name, fn) {
      useCount += 1;
      fn(stored);
    },
    revocationEpoch() {
      return epoch;
    },
    useCount() {
      return useCount;
    },
    hasCount() {
      return hasCount;
    },
  };
  return provider;
}

function isRefused(err, outcome) {
  return err instanceof SecretReleaseRefused && err.outcome === outcome && err.code === "secret_unavailable";
}

function assertCleanRecord(record, operationId) {
  assert.equal(Object.keys(record).sort().join(","), "operationId,outcome");
  assert.equal(record.operationId, operationId);
  assert.equal(typeof record.outcome, "string");
  const dumped = JSON.stringify(record);
  assert.equal(dumped.includes("\u0000"), false);
  assert.doesNotMatch(dumped, /digest|sha-?256|token|byteLength|"length"/i);
  for (const byte of SYNTHETIC) {
    assert.equal(dumped.includes(String(byte)), false);
  }
}

function assertCleanStatus(status, operationId, kind) {
  assert.equal(Object.keys(status).sort().join(","), "kind,operationId");
  assert.equal(status.operationId, operationId);
  assert.equal(status.kind, kind);
  const dumped = JSON.stringify(status);
  assert.equal(dumped.includes("\u0000"), false);
  assert.doesNotMatch(dumped, /digest|sha-?256|token|byteLength|"length"/i);
}

test("matrix: clean release + ACK", () => {
  const authority = new ReleaseCommitAuthority();
  const provider = countingProvider();
  const gate = createSecretGate(provider, { authority, requireBoundOperationId: true });
  gate.getSecret(["credential"], "credential", (view) => {
    assert.deepEqual([...view], SYNTHETIC);
  }, undefined, "op-clean");
  assert.equal(authority.stateOf("op-clean"), "released");
  assert.equal(gate.acknowledge("op-clean"), "acknowledged");
  assertCleanStatus(gate.status("op-clean"), "op-clean", "RELEASED_ACKED");
  assert.equal(gate.acknowledge("op-clean"), "acknowledged");
  for (const event of gate.auditEvents()) {
    assertCleanRecord(event, event.operationId);
  }
});

test("matrix: ACK wrong operation id / wrong token / before release refuses and changes nothing", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-ack-bound", 1);
  assert.equal(authority.ack("other-op", lease.token, 1), "missing");
  assert.equal(authority.stateOf("op-ack-bound"), "unused");
  assert.equal(authority.ack("op-ack-bound", "not-the-token", 1), "stale");
  assert.equal(authority.stateOf("op-ack-bound"), "unused");
  assert.equal(authority.ack("op-ack-bound", lease.token, 1), "stale");
  assert.equal(authority.stateOf("op-ack-bound"), "unused");
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  assert.equal(authority.ack("op-ack-bound", "not-the-token", 1), "stale");
  assert.equal(authority.stateOf("op-ack-bound"), "released");
  assert.equal(authority.ack("op-ack-bound", lease.token, 9), "stale");
  assert.equal(authority.stateOf("op-ack-bound"), "released");
  assert.equal(authority.ack("op-ack-bound", lease.token, 1), "acknowledged");
  assert.equal(authority.stateOf("op-ack-bound"), "acknowledged");
});

test("matrix: duplicate ACK is a no-op", () => {
  const authority = new ReleaseCommitAuthority();
  const lease = authority.mint("op-dup-ack", 1);
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
  assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  assert.equal(authority.consume(lease.leaseId, lease.token, 1), "replay");
  assert.equal(authority.stateOf("op-dup-ack"), "acknowledged");
});

test("matrix: consumer throw after delivery is delivery-unknown; retry refuses", () => {
  const authority = new ReleaseCommitAuthority();
  const provider = countingProvider();
  const gate = createSecretGate(provider, { authority, requireBoundOperationId: true });
  const usesBefore = provider.useCount();
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {
      throw new Error("consumer-throw");
    }, undefined, "op-throw"),
    /consumer-throw/,
  );
  assertCleanStatus(gate.status("op-throw"), "op-throw", "DELIVERY_UNKNOWN");
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {}, undefined, "op-throw"),
    (err) => isRefused(err, "replay"),
  );
  assert.equal(provider.useCount(), usesBefore + 1);
  assert.equal(gate.acknowledge("op-throw"), "replay");
});

test("matrix: simulated crash between consume and ACK is status-only; recovery never calls use", () => {
  const authority = new ReleaseCommitAuthority();
  const provider = countingProvider();
  const gate = createSecretGate(provider, { authority, requireBoundOperationId: true });
  gate.getSecret(["credential"], "credential", () => {}, undefined, "op-crash");
  gate.noteUnknown("op-crash");
  assert.equal(authority.stateOf("op-crash"), "delivery-unknown");
  const uses = provider.useCount();
  const recovered = gate.status("op-crash");
  assertCleanStatus(recovered, "op-crash", "DELIVERY_UNKNOWN");
  assert.equal(provider.useCount(), uses);
  assert.equal(provider.hasCount() > 0, true);
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {}, undefined, "op-crash"),
    (err) => isRefused(err, "replay"),
  );
  assert.equal(provider.useCount(), uses);
  assert.equal(gate.acknowledge("op-crash"), "replay");
});

test("matrix: noteUnknown after ACK is a no-op (acknowledged stays acknowledged)", () => {
  const authority = new ReleaseCommitAuthority();
  const provider = countingProvider();
  const gate = createSecretGate(provider, { authority, requireBoundOperationId: true });
  gate.getSecret(["credential"], "credential", () => {}, undefined, "op-ack-unknown");
  assert.equal(authority.stateOf("op-ack-unknown"), "released");
  assert.equal(gate.acknowledge("op-ack-unknown"), "acknowledged");
  gate.noteUnknown("op-ack-unknown");
  assert.equal(authority.stateOf("op-ack-unknown"), "acknowledged");
  assertCleanStatus(gate.status("op-ack-unknown"), "op-ack-unknown", "RELEASED_ACKED");
  assert.equal(gate.acknowledge("op-ack-unknown"), "acknowledged");
});

test("matrix: timeout and abort of a released lease become delivery-unknown", () => {
  const authority = new ReleaseCommitAuthority();
  const provider = countingProvider();
  const gate = createSecretGate(provider, { authority, requireBoundOperationId: true });
  gate.getSecret(["credential"], "credential", () => {}, undefined, "op-timeout");
  gate.noteUnknown("op-timeout");
  assertCleanStatus(gate.status("op-timeout"), "op-timeout", "DELIVERY_UNKNOWN");
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {}, undefined, "op-timeout"),
    (err) => isRefused(err, "replay"),
  );
  gate.getSecret(["credential"], "credential", () => {}, undefined, "op-abort");
  gate.noteUnknown("op-abort");
  assertCleanStatus(gate.status("op-abort"), "op-abort", "DELIVERY_UNKNOWN");
  assert.equal(gate.acknowledge("op-abort"), "replay");
});

test("matrix: same-operation retry after ACK / unknown / fenced refuses", () => {
  const authority = new ReleaseCommitAuthority();
  const provider = countingProvider();
  const gate = createSecretGate(provider, { authority, requireBoundOperationId: true });
  gate.getSecret(["credential"], "credential", () => {}, undefined, "op-retry-ack");
  gate.acknowledge("op-retry-ack");
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {}, undefined, "op-retry-ack"),
    (err) => isRefused(err, "replay"),
  );
  const fenced = authority.mint("op-retry-fence", 1);
  authority.fence(fenced.leaseId);
  assert.throws(
    () => gate.getSecret(["credential"], "credential", () => {}, undefined, "op-retry-fence"),
    (err) => isRefused(err, "fenced"),
  );
});

test("matrix: eviction past RELEASE_LEASE_CAP then retry refuses, never mints fresh", () => {
  const authority = new ReleaseCommitAuthority();
  for (let i = 0; i < RELEASE_LEASE_CAP + 4; i += 1) {
    const lease = authority.mint(`op-evict-${i}`, 1);
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
    assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  }
  assert.ok(authority.size <= RELEASE_LEASE_CAP);
  assertCleanStatus(authority.status("op-evict-0"), "op-evict-0", "DELIVERY_UNKNOWN");
  assert.throws(
    () => authority.mint("op-evict-0", 1),
    (err) => isRefused(err, "replay"),
  );
  assert.equal(authority.ack("op-evict-0", "anything", 1), "replay");
});

test("matrix: omitted operationId and missing revocationEpoch refuse on the bound path", () => {
  const stored = new Uint8Array(SYNTHETIC);
  let uses = 0;
  const provider = {
    has() {
      return true;
    },
    use(_name, fn) {
      uses += 1;
      fn(stored);
    },
  };
  const bound = createSecretGate(provider, {
    requireBoundOperationId: true,
    requireRevocationEpoch: true,
  });
  assert.throws(
    () => bound.getSecret(["credential"], "credential", () => {}),
    (err) => isRefused(err, "missing"),
  );
  assert.equal(uses, 0);
  assert.throws(
    () => bound.getSecret(["credential"], "credential", () => {}, undefined, "op-no-epoch"),
    (err) => isRefused(err, "stale"),
  );
  assert.equal(uses, 0);
});

test("matrix: fixture residuals remain the default (oneshot + epoch 0)", () => {
  const stored = new Uint8Array(SYNTHETIC);
  let received;
  const gate = createSecretGate({
    has() {
      return true;
    },
    use(_name, fn) {
      fn(stored);
    },
  });
  gate.getSecret(["credential"], "credential", (view) => {
    received = [...view];
  });
  assert.deepEqual(received, SYNTHETIC);
});

test("matrix: recovery and audit never include secret bytes, lengths, digests or tokens", () => {
  const authority = new ReleaseCommitAuthority();
  const provider = countingProvider();
  const gate = createSecretGate(provider, { authority, requireBoundOperationId: true });
  gate.getSecret(["credential"], "credential", () => {}, undefined, "op-audit");
  gate.acknowledge("op-audit");
  const dumped = JSON.stringify({ status: gate.status("op-audit"), audit: gate.auditEvents() });
  assert.doesNotMatch(dumped, /digest|sha-?256/i);
  assert.equal(dumped.includes("\u0000"), false);
  assert.equal(dumped.includes('"token"'), false);
  assert.equal(dumped.includes('"byteLength"'), false);
  assert.equal(dumped.includes('"length"'), false);
  assert.equal(dumped.includes("SECRET"), false);
  assert.equal(dumped.includes(SYNTHETIC.join(",")), false);
  const hex = Buffer.from(Uint8Array.from(SYNTHETIC)).toString("hex");
  assert.equal(dumped.toLowerCase().includes(hex), false);
  const b64 = Buffer.from(Uint8Array.from(SYNTHETIC)).toString("base64");
  assert.equal(dumped.includes(b64), false);
});

test("matrix: audit log and retired set stay at cap", () => {
  const authority = new ReleaseCommitAuthority();
  for (let i = 0; i < RELEASE_LEASE_CAP + RELEASE_RETIRED_CAP + 1; i += 1) {
    const lease = authority.mint(`op-bound-${i}`, 1);
    assert.equal(authority.consume(lease.leaseId, lease.token, 1), "released");
    assert.equal(authority.ack(lease.leaseId, lease.token, 1), "acknowledged");
  }
  assert.ok(authority.size <= RELEASE_LEASE_CAP);
  assert.ok(authority.auditEvents().length <= RELEASE_AUDIT_CAP);
  assertCleanStatus(authority.status("op-bound-0"), "op-bound-0", "DELIVERY_UNKNOWN");
  for (const event of authority.auditEvents()) {
    assert.equal(Object.keys(event).sort().join(","), "operationId,outcome");
    assert.equal(typeof event.operationId, "string");
    assert.equal(typeof event.outcome, "string");
    const dumped = JSON.stringify(event);
    assert.doesNotMatch(dumped, /digest|sha-?256|token|byteLength|"length"/i);
  }
});

test("matrix: non-string operationId is coerced before freeze", () => {
  const authority = new ReleaseCommitAuthority();
  const status = authority.status(/** @type {any} */ (1));
  assertCleanStatus(status, "", "NOT_FOUND");
  assert.equal(authority.ack(/** @type {any} */ ({ id: "x" }), "token", 1), "missing");
  assert.equal(authority.acknowledgeMinted(/** @type {any} */ (9)), "missing");
  for (const event of authority.auditEvents()) {
    assert.equal(typeof event.operationId, "string");
    assertCleanRecord(event, event.operationId);
  }
});

test("kernel: requireRevocationEpoch and post-handler noteUnknown are wired", () => {
  const src = readFileSync(new URL("../src/kernel.ts", import.meta.url), "utf8");
  assert.match(src, /requireRevocationEpoch:\s*true/);
  assert.match(src, /unknownIfSpent/);
  assert.equal((src.match(/secretGate\.noteUnknown\(releaseOperationId\)/g) || []).length >= 3, true);
});
