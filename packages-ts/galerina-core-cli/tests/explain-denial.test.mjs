import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FUNGI_EXPLAIN_001 } from "../dist/explain/explain-trace.js";
import {
  DEPLOYMENT_DENIAL_SCHEMA,
  FUNGI_EXPLAIN_005,
  FUNGI_EXPLAIN_006,
  explainDenial,
  isDeploymentDenialReasonCode,
  readDeploymentDenial,
} from "../dist/explain/explain-denial.js";

const codes = (xs) => xs.map((d) => d.code);

function goodDenial(over = {}) {
  return {
    schema: DEPLOYMENT_DENIAL_SCHEMA,
    status: "denied",
    reasonCode: "effect",
    subject: "net.fetch",
    profile: "production",
    ...over,
  };
}

describe("readDeploymentDenial / explainDenial", () => {
  it("admits closed reason codes only", () => {
    for (const c of ["effect", "capability", "target", "verified", "module", "integrity", "policy"]) {
      assert.equal(isDeploymentDenialReasonCode(c), true);
    }
    for (const bad of ["", "EFFECT", "network", null, 1, {}]) {
      assert.equal(isDeploymentDenialReasonCode(bad), false);
    }
  });

  it("explains a closed denial with denial-label traces", () => {
    const result = explainDenial(goodDenial({ module: "app.debug.client", function: "pingServer" }));
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.traces.length, 4);
    assert.deepEqual(
      result.traces.map((t) => [t.step, t.label, t.input, t.output]),
      [
        [0, "denial", "denial.effect", "net.fetch"],
        [1, "denial", "denial.profile", "production"],
        [2, "denial", "denial.module", "app.debug.client"],
        [3, "denial", "denial.function", "pingServer"],
      ],
    );
  });

  it("refuses shape / domain without echoing keys or values", () => {
    assert.deepEqual(codes(readDeploymentDenial(null).diagnostics), [FUNGI_EXPLAIN_001]);
    assert.deepEqual(codes(readDeploymentDenial({ ...goodDenial(), extra: true }).diagnostics), [FUNGI_EXPLAIN_001]);
    assert.deepEqual(codes(readDeploymentDenial({ ...goodDenial(), schema: "other" }).diagnostics), [FUNGI_EXPLAIN_005]);
    assert.deepEqual(codes(readDeploymentDenial({ ...goodDenial(), status: "ok" }).diagnostics), [FUNGI_EXPLAIN_005]);
    assert.deepEqual(codes(readDeploymentDenial({ ...goodDenial(), reasonCode: "network" }).diagnostics), [
      FUNGI_EXPLAIN_006,
    ]);
    assert.deepEqual(codes(readDeploymentDenial({ ...goodDenial(), subject: "BAD/path" }).diagnostics), [
      FUNGI_EXPLAIN_006,
    ]);
    const accessor = {};
    Object.defineProperty(accessor, "schema", { get: () => DEPLOYMENT_DENIAL_SCHEMA, enumerable: true });
    Object.assign(accessor, {
      status: "denied",
      reasonCode: "effect",
      subject: "net.fetch",
      profile: "production",
    });
    assert.deepEqual(codes(readDeploymentDenial(accessor).diagnostics), [FUNGI_EXPLAIN_001]);
    const hostile = new Proxy(
      {},
      {
        ownKeys: () => {
          throw new Error("ownKeys");
        },
      },
    );
    const r = explainDenial(hostile);
    assert.ok(r.diagnostics.length > 0);
    assert.equal(JSON.stringify(r).includes("ownKeys"), false);
    assert.equal(JSON.stringify(r).includes("network"), false);
  });
});
