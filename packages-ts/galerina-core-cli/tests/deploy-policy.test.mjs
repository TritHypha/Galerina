import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  readDeployPolicy,
  DEPLOY_POLICY_SCHEMA,
  FUNGI_DEPLOY_001,
  FUNGI_DEPLOY_002,
} from "../dist/index.js";

function slice(over = {}) {
  return {
    allowedEffects: ["audit.write", "database.write"],
    allowedTargets: ["node", "wasm"],
    requireVerified: true,
    ...over,
  };
}

function v1(over = {}) {
  return {
    schema: DEPLOY_POLICY_SCHEMA,
    allowedEffects: ["audit.write"],
    allowedTargets: ["wasm"],
    requireVerified: true,
    capabilities: ["db.read"],
    environment: "staging",
    ...over,
  };
}

describe("readDeployPolicy", () => {
  it("accepts the three-field EffectsPolicy slice", () => {
    const r = readDeployPolicy(slice());
    assert.equal(r.ok, true);
    assert.deepEqual([...r.value.policy.allowedEffects], ["audit.write", "database.write"]);
    assert.deepEqual([...r.value.capabilities], []);
    assert.equal(r.value.environment, undefined);
  });

  it("accepts galerina.deploy-policy/v1", () => {
    const r = readDeployPolicy(v1());
    assert.equal(r.ok, true);
    assert.equal(r.value.environment, "staging");
    assert.deepEqual([...r.value.capabilities], ["db.read"]);
    assert.equal(r.value.policy.requireVerified, true);
  });

  it("refuses unknown keys and getters without echoing", () => {
    const r = readDeployPolicy({ ...slice(), extra: "ECHO_KEY" });
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_DEPLOY_001);
    assert.equal(JSON.stringify(r).includes("ECHO_KEY"), false);

    const hostile = {};
    for (const [k, v] of Object.entries(slice())) {
      Object.defineProperty(hostile, k, { value: v, enumerable: true });
    }
    Object.defineProperty(hostile, "extra", {
      get() {
        throw new Error("getter ran");
      },
      enumerable: true,
    });
    const g = readDeployPolicy(hostile);
    assert.equal(g.ok, false);
    assert.equal(g.diagnostics[0].code, FUNGI_DEPLOY_001);
  });

  it("refuses unknown environment and unsorted capabilities", () => {
    const env = readDeployPolicy(v1({ environment: "prodution" }));
    assert.equal(env.ok, false);
    assert.equal(env.diagnostics[0].code, FUNGI_DEPLOY_002);
    assert.equal(JSON.stringify(env).includes("prodution"), false);

    const caps = readDeployPolicy(v1({ capabilities: ["net.http", "db.read"] }));
    assert.equal(caps.ok, false);
    assert.equal(caps.diagnostics[0].code, FUNGI_DEPLOY_002);
  });

  it("refuses unknown schema before interpreting fields", () => {
    const r = readDeployPolicy(v1({ schema: "galerina.deploy-policy/v0" }));
    assert.equal(r.ok, false);
    assert.equal(r.diagnostics[0].code, FUNGI_DEPLOY_001);
  });
});
