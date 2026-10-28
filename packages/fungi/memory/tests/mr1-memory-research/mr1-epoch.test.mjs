// MEM-R1 gap 1.2 (provider side): stale or malformed revocation epochs refuse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { capture, linuxOnly, loadProvider, open } from "./mr1-harness.mjs";
import { staleEpochQuarantines } from "./mr1-scenarios.mjs";

test("MR1 epoch: a decreasing custodian epoch throws stale and quarantines", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(staleEpochQuarantines(await loadProvider()), true);
});

test("MR1 epoch: a 7-byte epoch frame refuses (never truncated or padded)", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "epoch-short");
  try {
    const r = capture(() => p.revocationEpoch());
    assert.equal(r.thrown, true);
    assert.equal(r.error instanceof mod.SecretArenaUnavailable, true);
    assert.match(String(r.error.message), /epoch is unavailable/);
  } finally {
    p.dispose();
  }
});

test("MR1 epoch: monotonic epochs pass through unchanged", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "ok");
  try {
    const a = p.revocationEpoch();
    const b = p.revocationEpoch();
    assert.equal(Number.isSafeInteger(a) && a > 0, true);
    assert.equal(b > a, true);
  } finally {
    p.dispose();
  }
});
