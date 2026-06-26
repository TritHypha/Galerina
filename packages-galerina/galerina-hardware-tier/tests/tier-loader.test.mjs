// tier-loader.test.mjs — the 0054 D2 §2.4 loader + selection contract (fall-through, floor).

import { test } from "node:test";
import assert from "node:assert/strict";
import { selectTier, createTierLoader } from "../dist/index.js";

// Distinct sentinel registries (the loader only chooses one; it never inspects contents).
const binary = new Map([["binary-marker", {}]]);
const hybrid = new Map([["hybrid-marker", {}]]);
const photonic = new Map([["photonic-marker", {}]]);

test("selection contract: photonic > hybrid > binary when all present", () => {
  assert.equal(selectTier({ binary, hybrid, photonic }, "photonic").selected, "photonic");
  assert.equal(selectTier({ binary, hybrid, photonic }, "hybrid").selected, "hybrid");
  assert.equal(selectTier({ binary, hybrid, photonic }, "binary").selected, "binary");
});

test("fall-through: photonic requested but absent → hybrid; both absent → binary (the floor)", () => {
  assert.equal(selectTier({ binary, hybrid }, "photonic").selected, "hybrid"); // photonic absent → hybrid
  assert.equal(selectTier({ binary }, "photonic").selected, "binary");         // both absent → binary
  assert.equal(selectTier({ binary }, "hybrid").selected, "binary");           // hybrid absent → binary
  assert.equal(selectTier({ binary }, "binary").registry, binary);             // binary is always there
});

test("the returned registry is exactly the selected tier's registry", () => {
  assert.equal(selectTier({ binary, hybrid, photonic }, "photonic").registry, photonic);
  assert.equal(selectTier({ binary, hybrid }, "photonic").registry, hybrid);
  assert.equal(selectTier({ binary }, "photonic").registry, binary);
});

test("createTierLoader resolves the cached tier ONCE per call and selects accordingly", () => {
  let resolves = 0;
  const loader = createTierLoader({ binary, hybrid, photonic }, () => { resolves++; return "photonic"; });
  assert.equal(loader().selected, "photonic");
  assert.equal(loader().selected, "photonic");
  assert.equal(resolves, 2, "the loader consults the (cached) directive per call, not per kernel");
});

test("binary is reached unconditionally — a loader with only binary never throws and always returns it", () => {
  for (const requested of ["photonic", "hybrid", "binary"]) {
    const sel = selectTier({ binary }, requested);
    assert.equal(sel.selected, "binary");
    assert.equal(sel.registry, binary);
  }
});
