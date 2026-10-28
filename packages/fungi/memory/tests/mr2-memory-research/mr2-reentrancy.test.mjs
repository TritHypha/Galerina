// MEM-R2 gaps 1.6 / H1 (concurrency) on the provider side. The TS provider is
// synchronous, so "concurrent" means re-entrant calls from inside a lease
// callback and async tasks racing to lease. Every lease must stay isolated and
// be wiped on return, whatever happens inside the callback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CANARY, NAME, allZero, bytes, capture, linuxOnly, loadProvider, open } from "./mr2-harness.mjs";
import { nestedLeasesAreWipedIndependently } from "./mr2-scenarios.mjs";

const decode = (view) => new TextDecoder().decode(view);

test("MR2 1.6: nested lease on the same name is isolated and wiped independently", async (t) => {
  if (!linuxOnly(t)) return;
  assert.equal(nestedLeasesAreWipedIndependently(await loadProvider()), true);
});

test("MR2 1.6 target: a second live lease on the same name is refused", { todo: "TS reference allows nested same-name leases; .fungi target is exactly one live lease per name" }, async (t) => {
  if (!linuxOnly(t)) return;
  const p = open(await loadProvider(), "ok");
  try {
    p.put(NAME, bytes(CANARY));
    let innerCalled = 0;
    p.use(NAME, () => {
      capture(() => p.use(NAME, () => { innerCalled += 1; }));
    });
    assert.equal(innerCalled, 0);
  } finally {
    p.dispose();
  }
});

test("MR2 1.6: dispose inside a callback wipes the view and refuses afterwards", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const p = open(mod, "ok");
  p.put(NAME, bytes(CANARY));
  let kept;
  let sawValue = "";
  capture(() => p.use(NAME, (view) => {
    kept = view;
    sawValue = decode(view);
    p.dispose();
  }));
  assert.equal(sawValue, CANARY);
  assert.equal(allZero(kept), true);
  for (const op of [() => p.use(NAME, () => {}), () => p.put(NAME, bytes("x")), () => p.revocationEpoch()]) {
    const r = capture(op);
    assert.equal(r.thrown, true);
    assert.equal(r.error instanceof mod.SecretArenaUnavailable, true);
  }
});

test("MR2 1.6: put over the leased name inside a callback leaves the live view a snapshot", async (t) => {
  if (!linuxOnly(t)) return;
  const p = open(await loadProvider(), "ok");
  try {
    p.put(NAME, bytes(CANARY));
    let kept;
    let during = "";
    p.use(NAME, (view) => {
      kept = view;
      p.put(NAME, bytes("MR2-REPLACED-SYNTHETIC"));
      during = decode(view);
    });
    assert.equal(during, CANARY);
    assert.equal(allZero(kept), true);
    let next = "";
    p.use(NAME, (view) => { next = decode(view); });
    assert.equal(next, "MR2-REPLACED-SYNTHETIC");
  } finally {
    p.dispose();
  }
});

test("MR2 1.6: a throwing callback propagates its own error, wipes, and stays active", async (t) => {
  if (!linuxOnly(t)) return;
  const p = open(await loadProvider(), "ok");
  try {
    p.put(NAME, bytes(CANARY));
    const boom = new Error("mr2 synthetic callback failure");
    let kept;
    const r = capture(() => p.use(NAME, (view) => { kept = view; throw boom; }));
    assert.equal(r.error, boom);
    assert.equal(allZero(kept), true);
    assert.equal(p.status().state, "active");
    let again = "";
    p.use(NAME, (view) => { again = decode(view); });
    assert.equal(again, CANARY);
  } finally {
    p.dispose();
  }
});

test("MR2 1.6: has and revocationEpoch inside a callback work and the epoch stays monotonic", async (t) => {
  if (!linuxOnly(t)) return;
  const p = open(await loadProvider(), "ok");
  try {
    p.put(NAME, bytes(CANARY));
    const before = p.revocationEpoch();
    let inside;
    let present;
    p.use(NAME, () => {
      present = p.has(NAME);
      inside = p.revocationEpoch();
    });
    assert.equal(present, true);
    assert.equal(inside > before, true);
    assert.equal(p.revocationEpoch() > inside, true);
  } finally {
    p.dispose();
  }
});

test("MR2 H1: racing async tasks never overlap a lease and each sees only its own value", async (t) => {
  if (!linuxOnly(t)) return;
  const p = open(await loadProvider(), "ok");
  try {
    const names = Array.from({ length: 8 }, (_, i) => `${NAME}-${i}`);
    names.forEach((n, i) => p.put(n, bytes(`${CANARY}-${i}`)));
    let active = 0;
    let maxActive = 0;
    const kept = [];
    const seen = new Map();
    await Promise.all(names.map(async (n, i) => {
      await new Promise((resolve) => setTimeout(resolve, (i * 7) % 5));
      await Promise.resolve();
      p.use(n, (view) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        kept.push(view);
        seen.set(n, decode(view));
        active -= 1;
      });
    }));
    assert.equal(maxActive, 1);
    names.forEach((n, i) => assert.equal(seen.get(n), `${CANARY}-${i}`));
    assert.equal(kept.every(allZero), true);
  } finally {
    p.dispose();
  }
});

test("MR2 H1: two providers never share a store", async (t) => {
  if (!linuxOnly(t)) return;
  const mod = await loadProvider();
  const a = open(mod, "ok");
  const b = open(mod, "ok");
  try {
    a.put(NAME, bytes(CANARY));
    assert.equal(a.has(NAME), true);
    assert.equal(b.has(NAME), false);
    let called = 0;
    b.use(NAME, () => { called += 1; });
    assert.equal(called, 0);
    a.dispose();
    assert.equal(b.status().state, "active");
  } finally {
    a.dispose();
    b.dispose();
  }
});
