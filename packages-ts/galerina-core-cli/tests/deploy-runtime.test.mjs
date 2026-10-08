import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  readDeployRuntimeProfile,
  checkDeployRuntimeConsistency,
  DEPLOY_RUNTIME_SCHEMA,
  FUNGI_DEPLOY_003,
  FUNGI_DEPLOY_006,
  FUNGI_DEPLOY_007,
  FUNGI_DEPLOY_008,
} from "../dist/index.js";

function profile(over = {}) {
  return {
    schema: DEPLOY_RUNTIME_SCHEMA,
    profile: "workspace.default",
    target: "wasm",
    effects: ["audit.write"],
    capabilities: ["db.read"],
    ...over,
  };
}

describe("readDeployRuntimeProfile", () => {
  it("accepts a closed v1 profile", () => {
    const r = readDeployRuntimeProfile(profile());
    assert.equal(r.ok, true);
    assert.equal(r.value.target, "wasm");
    assert.deepEqual([...r.value.effects], ["audit.write"]);
  });

  it("accepts optional memoryMb and refuses -0 / NaN / non-integer", () => {
    const ok = readDeployRuntimeProfile(profile({ memoryMb: 64 }));
    assert.equal(ok.ok, true);
    assert.equal(ok.value.memoryMb, 64);
    const negZero = readDeployRuntimeProfile(profile({ memoryMb: -0 }));
    assert.equal(negZero.ok, false);
    assert.equal(negZero.diagnostics[0].code, FUNGI_DEPLOY_007);
    const nan = readDeployRuntimeProfile(profile({ memoryMb: Number.NaN }));
    assert.equal(nan.ok, false);
  });

  it("refuses unknown keys, getters, and unknown schema without echoing", () => {
    const extra = readDeployRuntimeProfile(profile({ extra: "ECHO_KEY" }));
    assert.equal(extra.ok, false);
    assert.equal(extra.diagnostics[0].code, FUNGI_DEPLOY_006);
    assert.equal(JSON.stringify(extra).includes("ECHO_KEY"), false);

    const hostile = {};
    for (const [k, v] of Object.entries(profile())) {
      Object.defineProperty(hostile, k, { value: v, enumerable: true });
    }
    Object.defineProperty(hostile, "extra", {
      get() {
        throw new Error("getter ran");
      },
      enumerable: true,
    });
    const g = readDeployRuntimeProfile(hostile);
    assert.equal(g.ok, false);
    assert.equal(g.diagnostics[0].code, FUNGI_DEPLOY_006);
    assert.equal(JSON.stringify(g).includes("getter ran"), false);

    const schema = readDeployRuntimeProfile(profile({ schema: "galerina.deploy-runtime/v0" }));
    assert.equal(schema.ok, false);
    assert.equal(schema.diagnostics[0].code, FUNGI_DEPLOY_006);
  });
});

describe("checkDeployRuntimeConsistency", () => {
  it("refuses target mismatch and policy-denied effects", () => {
    const read = readDeployRuntimeProfile(profile());
    assert.equal(read.ok, true);
    const mismatch = checkDeployRuntimeConsistency(read.value, "node", ["audit.write"]);
    assert.equal(mismatch[0].code, FUNGI_DEPLOY_008);
    assert.equal(JSON.stringify(mismatch).includes("wasm"), false);

    const denied = checkDeployRuntimeConsistency(read.value, "wasm", ["database.write"]);
    assert.equal(denied[0].code, FUNGI_DEPLOY_003);
    assert.equal(JSON.stringify(denied).includes("audit.write"), false);
  });
});
