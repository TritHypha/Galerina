// MEM-R2 gap H11 (length equality) on the provider side: replies whose status
// or data length is off by any amount must never be read as success. Where the
// frozen TS reference is laxer than the .fungi target the target is recorded as
// a todo test, so the divergence is visible without editing frozen TS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANARY, NAME, assertNoCanary, bytes, capture, linuxOnly, loadProvider, open } from "./mr2-harness.mjs";
import {
  epochHugeQuarantines,
  epochWrongLengthRefused,
  getUnlistedNeverCallsBack,
  hasByteTwoNeverPresent,
  hasUnlistedNeverPresent,
  statusUnlistedQuarantines,
} from "./mr2-scenarios.mjs";

test("MR2 H11: has() reply byte 2 never reads as present", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(hasByteTwoNeverPresent(await loadProvider()), true);
});

test("MR2 H11: has() empty reply never reads as present", async (t) => {
  if (!linuxOnly(t)) return;
  const p = open(await loadProvider(), "has-empty");
  try {
    p.put(NAME, bytes(CANARY));
    let seen;
    const r = capture(() => { seen = p.has(NAME); });
    assert.equal(r.thrown || seen === false, true);
  } finally {
    p.dispose();
  }
});

test("MR2 H11: has() unlisted status never reads as present", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(hasUnlistedNeverPresent(await loadProvider()), true);
});

test("MR2 H11: status() unlisted status quarantines", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(statusUnlistedQuarantines(await loadProvider()), true);
});

for (const mode of ["epoch-long", "epoch-empty", "epoch-unlisted"]) {
  test(`MR2 H11: revocationEpoch refuses ${mode}`, async (t) => {
    if (!linuxOnly(t)) return;
    assert.equal(epochWrongLengthRefused(await loadProvider(), mode), true);
  });
}

test("MR2 H11: epoch above MAX_SAFE_INTEGER is refused and quarantines", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(epochHugeQuarantines(await loadProvider()), true);
});

test("MR2 H11: quarantined epoch reply freezes the epoch and quarantines", async (t) => {
  if (!linuxOnly(t)) return;
  const p = open(await loadProvider(), "epoch-quar");
  try {
    // Entering quarantine is itself a revocation (the provider bumps its local
    // epoch once); after that the epoch is frozen and never follows the
    // custodian again.
    let first;
    const r = capture(() => { first = p.revocationEpoch(); });
    assert.equal(r.thrown, false);
    assert.equal(Number.isSafeInteger(first) && first >= 1, true);
    for (let i = 0; i < 3; i += 1) assert.equal(p.revocationEpoch(), first);
    assert.equal(p.status().state, "quarantined");
  } finally {
    p.dispose();
  }
});

test("MR2 H11: unlisted get status never reaches the callback or the error", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(getUnlistedNeverCallsBack(await loadProvider()), true);
});

test("MR2 H11: unlisted and echoing put replies are refused without leaking", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  for (const mode of ["put-unlisted", "put-echo"]) {
    const p = open(mod, mode);
    try {
      const r = capture(() => p.put(NAME, bytes(CANARY)));
      assert.equal(r.thrown, true, mode);
      assert.equal(r.error instanceof mod.SecretArenaUnavailable, true, mode);
      assertNoCanary(`${r.error.message}\n${r.error.stack}`, mode);
    } finally {
      p.dispose();
    }
  }
});

// .fungi target (zero trust): any reply whose length is not exactly the
// expected length is UNKNOWN and quarantines. The frozen TS reference ignores
// trailing bytes and reads an empty status as active, so these stay todo.
for (const [mode, check] of [
  ["has-long", (p) => capture(() => p.has(NAME)).thrown && p.status().state === "quarantined"],
  ["status-empty", (p) => p.status().state === "quarantined"],
  ["status-long", (p) => p.status().state === "quarantined"],
  ["status-two", (p) => p.status().state === "quarantined"],
  ["put-extra", (p) => capture(() => p.put(NAME, bytes(CANARY))).thrown],
  ["epoch-long", (p) => { capture(() => p.revocationEpoch()); return p.status().state === "quarantined"; }],
]) {
  test(`MR2 H11 target: ${mode} is UNKNOWN and quarantines`, { todo: "TS reference is lax here; .fungi target, see evidence/mr2-memory-research/findings.md" }, async (t) => {
    if (!linuxOnly(t)) return;
    const p = open(await loadProvider(), mode);
    try {
      if (mode === "has-long") p.put(NAME, bytes(CANARY));
      assert.equal(check(p), true);
    } finally {
      p.dispose();
    }
  });
}
