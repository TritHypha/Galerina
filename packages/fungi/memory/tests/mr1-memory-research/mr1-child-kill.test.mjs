// MEM-R1 gap 3.4: custodian killed mid-request; custodian-reported quarantine;
// unknown status byte refuses without delivering bytes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANARY, assertNoCanary, bytes, capture, linuxOnly, loadProvider, open } from "./mr1-harness.mjs";
import { killedCustodianFailsClosed } from "./mr1-scenarios.mjs";

test("MR1 kill: SIGKILL of the custodian during get fails closed and quarantines", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(killedCustodianFailsClosed(await loadProvider()), true);
});

test("MR1 kill: custodian-reported QUARANTINED on get throws SecretArenaQuarantined, epoch frozen", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "quar-get");
  try {
    const before = p.revocationEpoch();
    p.put("mr1", bytes(CANARY));
    let called = 0;
    const r = capture(() => p.use("mr1", () => { called += 1; }));
    assert.equal(r.thrown, true);
    assert.equal(r.error instanceof mod.SecretArenaQuarantined, true);
    assert.equal(called, 0);
    assert.equal(p.status().state, "quarantined");
    assert.equal(p.revocationEpoch() > before, true, "quarantine fences strictly past last epoch");
    assert.equal(capture(() => p.has("mr1")).error instanceof mod.SecretArenaQuarantined, true);
  } finally {
    p.dispose();
  }
});

test("MR1 kill: unlisted status byte on get refuses, delivers nothing, leaks no payload", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "odd-status-get");
  try {
    p.put("mr1", bytes(CANARY));
    let called = 0;
    const r = capture(() => p.use("mr1", () => { called += 1; }));
    assert.equal(r.thrown, true);
    assert.equal(r.error instanceof mod.SecretArenaUnavailable, true);
    assert.equal(called, 0);
    assertNoCanary(r.error.message, "odd-status");
    assert.equal(String(r.error.message).includes("MR1-SYNTHETIC"), false, "custodian payload not echoed");
  } finally {
    p.dispose();
  }
});
