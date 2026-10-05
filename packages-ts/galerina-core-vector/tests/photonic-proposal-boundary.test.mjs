// The vector photonic governance notes stay proposal-only until galerina-core-photonic
// settles cross-package ownership (core-photonic HOLD-PHOTONIC-TRANSPORT / -DIAGNOSTICS /
// -BOUNDARY). Zero-trust default (Grok Bot 2026-10-05, owner may revisit): this package
// must not export, declare or depend on any of the proposed photonic contracts.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import * as vector from "../dist/index.js";

const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), "utf8");

// Every symbol the notes (28.txt) propose to place in this package.
const PROPOSED_SYMBOLS = [
  "OpticalTransportMode",
  "PhotonicCapability",
  "PhotonicTopology",
  "PhotonicRuntimeTarget",
  "PhotonicExecutionPlan",
  "estimateOpticalSuitability",
  "buildPhotonicPlan",
  "resolveFallback",
  "validateTransportMode",
  "validatePhotonicTarget",
  "validatePhotonicPlan",
  "FUNGI-PHOTONIC",
];

describe("vector photonic governance notes are proposal-only", () => {
  it("exports no photonic or optical runtime value", () => {
    const leaked = Object.keys(vector).filter((name) => /photonic|optical/i.test(name));
    assert.deepEqual(leaked, []);
  });

  it("declares none of the proposed photonic contracts in source or published types", async () => {
    for (const rel of ["src/index.ts", "dist/index.d.ts", "dist/index.js"]) {
      const text = await read(rel);
      const found = PROPOSED_SYMBOLS.filter((symbol) => text.includes(symbol));
      assert.deepEqual(found, [], `${rel} must not carry proposal-only photonic contracts`);
      assert.doesNotMatch(text, /photonic|optical/i, `${rel} must not mention photonic or optical concepts`);
    }
  });

  it("emits no photonic diagnostic codes", () => {
    const report = vector.createVectorReport({
      operations: [{ name: "", inputs: [], output: { elementType: "", dimension: { lanes: 0 } } }],
      tensorOperations: [{ name: "", inputs: [], output: { elementType: "Float32", shape: { dimensions: [] } }, pure: true }],
    });
    assert.ok(report.diagnostics.length > 0);
    for (const diagnostic of report.diagnostics) {
      assert.match(diagnostic.code, /^Galerina_(VECTOR|MATRIX|TENSOR)_/);
    }
  });

  it("takes no dependency on a photonic package", async () => {
    const pkg = JSON.parse(await read("package.json"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies });
    assert.deepEqual(deps.filter((name) => /photonic/i.test(name)), []);
  });

  it("README keeps the material labelled proposal/reference only", async () => {
    const readme = await read("README.md");
    assert.match(readme, /proposal\/reference only/);
    assert.match(readme, /Resolution required before implementation/);
  });
});
