import assert from "node:assert/strict";
import { test } from "node:test";

import { createSecretGate } from "../dist/secret-gate.js";

test("RD-1413: revocation between presence observation and delivery fences the consumer", () => {
  const stored = new Uint8Array([0x53, 0x45, 0x43, 0x52, 0x45, 0x54]);
  let revoked = false;
  let providerUseReturned = false;
  let providerOpens = 0;
  let consumerEntered = false;
  let bytesAtConsumerEntry = null;
  let storedBytesAtConsumerEntry = null;
  let storedBytesAfterRevocation = null;
  const events = [];

  const provider = {
    has() {
      const observedPresent = !revoked;
      events.push(`presence:${observedPresent ? "present" : "absent"}`);

      // Model revocation winning after the provider's presence snapshot, but
      // before the gate acts on that snapshot to deliver its staged bytes.
      if (providerUseReturned && observedPresent) {
        revoked = true;
        stored.fill(0);
        storedBytesAfterRevocation = [...stored];
        events.push("revoke-and-wipe");
      }

      return observedPresent;
    },
    use(_name, callback) {
      if (revoked) {
        events.push("provider-open-refused");
        throw new Error("credential revoked before provider open");
      }
      providerOpens += 1;
      events.push("provider-open");
      callback(stored);
      providerUseReturned = true;
    },
  };

  const gate = createSecretGate(provider);
  assert.equal(gate.admit(["credential"]), null);
  let refused = false;
  try {
    gate.getSecret(["credential"], "credential", (value) => {
      consumerEntered = true;
      events.push("consumer-entry");
      bytesAtConsumerEntry = [...value];
      storedBytesAtConsumerEntry = [...stored];
    });
  } catch {
    refused = true;
  }
  assert.deepEqual(
    {
      revoked,
      providerOpens,
      events,
      storedBytesAfterRevocation,
      consumerEntered,
      bytesAtConsumerEntry,
      storedBytesAtConsumerEntry,
      refused,
    },
    {
      revoked: true,
      providerOpens: 1,
      events: [
        "presence:present",
        "provider-open",
        "presence:present",
        "revoke-and-wipe",
      ],
      storedBytesAfterRevocation: [0, 0, 0, 0, 0, 0],
      consumerEntered: false,
      bytesAtConsumerEntry: null,
      storedBytesAtConsumerEntry: null,
      refused: true,
    },
    "revocation must fence the already-open operation before staged bytes cross the consumer boundary",
  );
});

test("RD-1413: revocation after admission refuses before provider open", () => {
  const stored = new Uint8Array([0x53, 0x45, 0x43, 0x52, 0x45, 0x54]);
  let revoked = false;
  let providerOpens = 0;
  let consumerEntered = false;

  const provider = {
    has() { return !revoked; },
    use(_name, callback) {
      if (revoked) throw new Error("credential revoked before provider open");
      providerOpens += 1;
      callback(stored);
    },
  };

  const gate = createSecretGate(provider);
  assert.equal(gate.admit(["credential"]), null);
  revoked = true;
  stored.fill(0);

  assert.throws(() => gate.getSecret(["credential"], "credential", () => {
    consumerEntered = true;
  }));
  assert.equal(providerOpens, 0);
  assert.equal(consumerEntered, false);
  assert.deepEqual([...stored], [0, 0, 0, 0, 0, 0]);
});

test("RD-1413 positive control: an active credential is delivered once", () => {
  const expected = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];
  const stored = new Uint8Array(expected);
  let revoked = false;
  let providerOpens = 0;
  let consumerEntries = 0;
  let received;

  const provider = {
    has() { return !revoked; },
    use(_name, callback) {
      if (revoked) throw new Error("credential revoked before provider open");
      providerOpens += 1;
      callback(stored);
    },
  };
  const gate = createSecretGate(provider);
  assert.equal(gate.admit(["credential"]), null);
  gate.getSecret(["credential"], "credential", (value) => {
    consumerEntries += 1;
    received = [...value];
  });

  assert.equal(providerOpens, 1);
  assert.equal(consumerEntries, 1);
  assert.deepEqual(received, expected);
});
