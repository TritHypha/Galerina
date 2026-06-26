import test from "node:test";
import assert from "node:assert/strict";

import {
  LocalDiskBus,
  PhotonicBus,
  HardenedBorderViolation,
  SecurityTrap,
} from "../dist/index.js";

test("LocalDiskBus streams a subrange that shares the source buffer", () => {
  const data = new TextEncoder().encode("0123456789");
  const bus = new LocalDiskBus(data);
  bus.connect();

  const view = bus.stream(2, 4);
  assert.equal(new TextDecoder().decode(view), "2345");
  // Zero-copy: the streamed view is over the SAME ArrayBuffer as the source.
  assert.equal(view.buffer, data.buffer);
  assert.equal(bus.kind, "disk");
});

test("LocalDiskBus refuses streaming before connect (LSIO-BUS-001)", () => {
  const bus = new LocalDiskBus(new Uint8Array(8));
  assert.throws(
    () => bus.stream(0, 4),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-BUS-001",
  );
});

test("LocalDiskBus refuses out-of-range stream (LSIO-BUS-001)", () => {
  const bus = new LocalDiskBus(new Uint8Array(8));
  bus.connect();
  assert.throws(
    () => bus.stream(4, 8),
    (e) => e instanceof SecurityTrap && e.code === "LSIO-BUS-001",
  );
});

test("LocalDiskBus.validateBusIntegrity() === true", () => {
  const bus = new LocalDiskBus(new Uint8Array(1));
  assert.equal(bus.validateBusIntegrity(), true);
});

test("PhotonicBus.connect() throws HardenedBorderViolation (future seam)", () => {
  const bus = new PhotonicBus();
  assert.equal(bus.kind, "photonic");
  assert.equal(bus.validateBusIntegrity(), false);
  assert.throws(
    () => bus.connect(),
    (e) => e instanceof HardenedBorderViolation && e.code === "LSIO-PBI-001",
  );
  assert.throws(
    () => bus.stream(0, 1),
    (e) => e instanceof HardenedBorderViolation && e.code === "LSIO-PBI-001",
  );
});
