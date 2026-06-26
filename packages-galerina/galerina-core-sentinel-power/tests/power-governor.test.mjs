import test from "node:test";
import assert from "node:assert/strict";

import {
  PowerGovernor,
  AEROSPACE_ENVELOPE,
  PowerFault,
} from "../dist/index.js";

const gov = () => new PowerGovernor(AEROSPACE_ENVELOPE);

test("read() defaults to 0 before any reading", () => {
  assert.equal(gov().read(), 0);
});

test("evaluate maps each band to the correct (state, kernel)", () => {
  const cases = [
    { temp: 50, state: "NOMINAL", kernel: "native" },
    { temp: 69, state: "NOMINAL", kernel: "native" },
    { temp: 70, state: "THROTTLED", kernel: "simd" }, // boundary == throttleC
    { temp: 75, state: "THROTTLED", kernel: "simd" },
    { temp: 84, state: "THROTTLED", kernel: "simd" },
    { temp: 85, state: "SAFETY", kernel: "shadow" }, // boundary == safeC
    { temp: 88, state: "SAFETY", kernel: "shadow" },
    { temp: 94, state: "SAFETY", kernel: "shadow" },
    { temp: 95, state: "TERMINAL", kernel: "shadow" }, // boundary == criticalC
    { temp: 100, state: "TERMINAL", kernel: "shadow" },
  ];
  for (const c of cases) {
    const g = gov();
    g.setReading(c.temp);
    const d = g.evaluate();
    assert.equal(d.state, c.state, `state @ ${c.temp}C`);
    assert.equal(d.kernel, c.kernel, `kernel @ ${c.temp}C`);
    assert.equal(d.tempC, c.temp);
    assert.equal(typeof d.reason, "string");
    assert.ok(d.reason.length > 0);
  }
});

test("TERMINAL reason notes the kill-switch", () => {
  const g = gov();
  g.setReading(100);
  assert.match(g.evaluate().reason, /kill-switch/i);
});

test("requestAdjustment denies up-tier at SAFETY, grants down-tier", () => {
  const g = gov();
  g.setReading(88); // SAFETY → ceiling shadow

  const native = g.requestAdjustment("native");
  assert.equal(native.granted, false);
  assert.equal(native.allowed, "shadow");

  const shadow = g.requestAdjustment("shadow");
  assert.equal(shadow.granted, true);
  assert.equal(shadow.allowed, "shadow");
});

test("requestAdjustment allows down-tier but denies up-tier at THROTTLED", () => {
  const g = gov();
  g.setReading(75); // THROTTLED → ceiling simd

  assert.equal(g.requestAdjustment("native").granted, false);
  assert.equal(g.requestAdjustment("native").allowed, "simd");

  assert.equal(g.requestAdjustment("simd").granted, true);
  assert.equal(g.requestAdjustment("shadow").granted, true); // cooler is fine
});

test("requestAdjustment grants native at NOMINAL", () => {
  const g = gov();
  g.setReading(50);
  const r = g.requestAdjustment("native");
  assert.equal(r.granted, true);
  assert.equal(r.allowed, "native");
});

test("assertWithinEnvelope throws LSP-CRITICAL-001 at/above criticalC", () => {
  const g = gov();
  g.setReading(95);
  assert.throws(
    () => g.assertWithinEnvelope(),
    (err) => err instanceof PowerFault && err.code === "LSP-CRITICAL-001",
  );

  const g2 = gov();
  g2.setReading(120);
  assert.throws(
    () => g2.assertWithinEnvelope(),
    (err) => err instanceof PowerFault && err.code === "LSP-CRITICAL-001",
  );
});

test("assertWithinEnvelope does not throw below criticalC", () => {
  for (const temp of [0, 50, 70, 85, 94]) {
    const g = gov();
    g.setReading(temp);
    assert.doesNotThrow(() => g.assertWithinEnvelope(), `@ ${temp}C`);
  }
});

test("sensor injection: evaluate uses sensor without setReading", () => {
  const g = new PowerGovernor(AEROSPACE_ENVELOPE, { sensor: () => 90 });
  assert.equal(g.read(), 90);
  const d = g.evaluate();
  assert.equal(d.state, "SAFETY");
  assert.equal(d.kernel, "shadow");
});

test("sensor is re-read on each evaluate (live sensor)", () => {
  let t = 50;
  const g = new PowerGovernor(AEROSPACE_ENVELOPE, { sensor: () => t });
  assert.equal(g.evaluate().state, "NOMINAL");
  t = 100;
  assert.equal(g.evaluate().state, "TERMINAL");
});

test("constructor validates the envelope", () => {
  assert.throws(
    () => new PowerGovernor({ throttleC: 95, safeC: 85, criticalC: 70 }),
    (err) => err instanceof PowerFault && err.code === "LSP-ENV-001",
  );
});
