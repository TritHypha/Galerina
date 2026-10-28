// MEM-R1 gaps 1.1 / 2.5 (provider side): a borrowed view is dead after the
// callback returns, escape channels are refused, and a disposed provider
// refuses every operation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANARY, allZero, bytes, capture, linuxOnly, loadProvider, open } from "./mr1-harness.mjs";
import { borrowedViewIsWipedAfterReturn } from "./mr1-scenarios.mjs";

test("MR1 lease: view captured inside use is all-zero after return", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(borrowedViewIsWipedAfterReturn(await loadProvider()), true);
});

test("MR1 lease: callback returning a value or a promise is refused and still wiped", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "ok");
  try {
    p.put("mr1", bytes(CANARY));
    for (const ret of [1, Promise.resolve(0)]) {
      let kept;
      const r = capture(() => p.use("mr1", (view) => { kept = view; return ret; }));
      assert.equal(r.thrown, true);
      assert.match(String(r.error.message), /escape channel is forbidden/);
      assert.equal(allZero(kept), true);
    }
  } finally {
    p.dispose();
  }
});

test("MR1 lease: missing name never invokes the callback", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "ok");
  try {
    let called = 0;
    p.use("mr1-absent", () => { called += 1; });
    assert.equal(called, 0);
    assert.equal(p.has("mr1-absent"), false);
  } finally {
    p.dispose();
  }
});

test("MR1 lease: aborted signal refuses before any custodian get", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "ok");
  try {
    p.put("mr1", bytes(CANARY));
    const ac = new AbortController();
    ac.abort();
    let called = 0;
    const r = capture(() => p.use("mr1", () => { called += 1; }, { signal: ac.signal }));
    assert.equal(r.thrown, true);
    assert.equal(r.error instanceof mod.SecretArenaUnavailable, true);
    assert.equal(called, 0);
  } finally {
    p.dispose();
  }
});

test("MR1 lease: after dispose every operation refuses and status is quarantined", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "ok");
  p.put("mr1", bytes(CANARY));
  p.dispose();
  let called = 0;
  for (const op of [
    () => p.use("mr1", () => { called += 1; }),
    () => p.put("mr2", bytes("x")),
    () => p.has("mr1"),
    () => p.revocationEpoch(),
  ]) {
    const r = capture(op);
    assert.equal(r.thrown, true);
    assert.equal(r.error instanceof mod.SecretArenaUnavailable, true);
  }
  assert.equal(called, 0);
  assert.equal(p.status().state, "quarantined");
  p.dispose();
});
