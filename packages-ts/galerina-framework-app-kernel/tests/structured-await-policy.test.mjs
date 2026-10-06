import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_SAW_001,
  FUNGI_APPK_SAW_002,
  FUNGI_APPK_SAW_003,
  FUNGI_APPK_SAW_004,
  FUNGI_APPK_SAW_005,
  STRUCTURED_AWAIT_POLICY_SCHEMA,
  createStructuredAwaitPolicy,
  readStructuredAwaitPolicy,
} from "../dist/structured-await-policy.js";

function limits(overrides = {}) {
  return {
    maxRequestTimeoutMs: 3000,
    maxExternalAwaitTimeoutMs: 2500,
    maxChildConcurrency: 6,
    maxStreamItems: 1000,
    ...overrides,
  };
}

function basePolicy(overrides = {}) {
  return {
    schema: STRUCTURED_AWAIT_POLICY_SCHEMA,
    name: "DashboardAwait",
    requestScope: "required",
    onRequestCancel: "cancel_children",
    onChildError: "cancel_siblings",
    backgroundWork: "deny",
    externalAwaitTimeout: "required",
    admittedAwaitModes: ["all", "race", "single"],
    limits: limits(),
    ...overrides,
  };
}

function hasNoHoles(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(hasNoHoles);
  if (typeof value === "object") return Object.values(value).every(hasNoHoles);
  return true;
}

describe("request Structured Await scope and cancellation policy", () => {
  it("admits a closed Structured Await policy", () => {
    const result = readStructuredAwaitPolicy(basePolicy({ diagnostics: [] }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, STRUCTURED_AWAIT_POLICY_SCHEMA);
    assert.equal(result.value.name, "DashboardAwait");
    assert.equal(result.value.requestScope, "required");
    assert.equal(result.value.onRequestCancel, "cancel_children");
    assert.equal(result.value.onChildError, "cancel_siblings");
    assert.equal(result.value.backgroundWork, "deny");
    assert.equal(result.value.externalAwaitTimeout, "required");
    assert.deepEqual([...result.value.admittedAwaitModes], ["all", "race", "single"]);
    assert.equal(result.value.limits.maxExternalAwaitTimeoutMs, 2500);
    assert.equal(result.value.diagnostics.length, 0);
    assert.equal(Object.isFrozen(result.value), true);
    assert.equal(Object.isFrozen(result.value.limits), true);
    assert.equal(hasNoHoles(result.value), true);
  });

  it("refuses getters, symbols, custom prototypes and unknown keys without echo", () => {
    const hostile = basePolicy();
    let ran = false;
    Object.defineProperty(hostile, "secret", {
      get() {
        ran = true;
        throw new Error("getter-ran");
      },
      enumerable: true,
    });
    const fromGetter = createStructuredAwaitPolicy(hostile);
    assert.equal(ran, false);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_SAW_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    const withSymbol = { ...basePolicy(), [Symbol("x")]: 1 };
    assert.equal(createStructuredAwaitPolicy(withSymbol).diagnostics[0]?.code, FUNGI_APPK_SAW_001);

    const proto = Object.assign(Object.create({ inherited: true }), basePolicy());
    assert.equal(createStructuredAwaitPolicy(proto).diagnostics[0]?.code, FUNGI_APPK_SAW_001);

    const unknownKey = createStructuredAwaitPolicy({ ...basePolicy(), extra: "nope" });
    assert.equal(unknownKey.diagnostics[0]?.code, FUNGI_APPK_SAW_001);
    assert.equal(unknownKey.diagnostics.some((d) => d.message.includes("extra")), false);

    const nestedUnknown = createStructuredAwaitPolicy(basePolicy({ limits: { ...limits(), unlimited: true } }));
    assert.equal(nestedUnknown.diagnostics[0]?.code, FUNGI_APPK_SAW_004);
    assert.equal(nestedUnknown.diagnostics.some((d) => d.message.includes("unlimited")), false);

    for (const bad of [null, undefined, 42, "policy", [basePolicy()]]) {
      assert.equal(createStructuredAwaitPolicy(bad).diagnostics[0]?.code, FUNGI_APPK_SAW_001);
    }
  });

  it("refuses relaxed scope / cancel / child-error / background / external-timeout tokens without echo", () => {
    const cases = [
      ["requestScope", "optional"],
      ["requestScope", "none"],
      ["onRequestCancel", "detach"],
      ["onRequestCancel", "ignore"],
      ["onChildError", "continue"],
      ["onChildError", "ignore"],
      ["backgroundWork", "allow"],
      ["backgroundWork", "queue_handoff"],
      ["externalAwaitTimeout", "optional"],
      ["externalAwaitTimeout", "none"],
    ];
    for (const [field, token] of cases) {
      const refused = createStructuredAwaitPolicy(basePolicy({ [field]: token }));
      assert.equal(refused.diagnostics.length, 1, `${field}=${token}`);
      assert.equal(refused.diagnostics[0]?.code, FUNGI_APPK_SAW_002);
      assert.equal(refused.diagnostics[0]?.field, field);
      assert.equal(refused.diagnostics[0]?.message.includes(token), false);
    }
    const schema = createStructuredAwaitPolicy(basePolicy({ schema: "galerina.app-kernel.structured-await-policy/v2" }));
    assert.equal(schema.diagnostics[0]?.code, FUNGI_APPK_SAW_002);
    const name = createStructuredAwaitPolicy(basePolicy({ name: "../etc/passwd" }));
    assert.equal(name.diagnostics[0]?.code, FUNGI_APPK_SAW_002);
    assert.equal(name.diagnostics.some((d) => d.message.includes("passwd")), false);
  });

  it("refuses NaN / Infinity / zero / unsafe limits and external timeout above request timeout", () => {
    for (const [field, value] of [
      ["maxRequestTimeoutMs", Number.NaN],
      ["maxRequestTimeoutMs", 0],
      ["maxExternalAwaitTimeoutMs", Number.POSITIVE_INFINITY],
      ["maxChildConcurrency", -1],
      ["maxChildConcurrency", 1.5],
      ["maxStreamItems", Number.MAX_SAFE_INTEGER + 2],
      ["maxStreamItems", "1000"],
    ]) {
      const refused = createStructuredAwaitPolicy(basePolicy({ limits: limits({ [field]: value }) }));
      assert.equal(refused.diagnostics[0]?.code, FUNGI_APPK_SAW_002, `${field}`);
      assert.equal(refused.diagnostics[0]?.field, field);
      assert.equal(refused.diagnostics.some((d) => /NaN|Infinity/i.test(d.message)), false);
    }
    const order = createStructuredAwaitPolicy(
      basePolicy({ limits: limits({ maxRequestTimeoutMs: 1000, maxExternalAwaitTimeoutMs: 1001 }) }),
    );
    assert.equal(order.diagnostics[0]?.code, FUNGI_APPK_SAW_003);
    const missing = { ...limits() };
    delete missing.maxStreamItems;
    assert.equal(createStructuredAwaitPolicy(basePolicy({ limits: missing })).diagnostics[0]?.code, FUNGI_APPK_SAW_001);
    assert.equal(createStructuredAwaitPolicy(basePolicy({ limits: [3000] })).diagnostics[0]?.code, FUNGI_APPK_SAW_004);
  });

  it("refuses empty / duplicate / unsorted / wildcard / sparse await-mode lists and non-empty input diagnostics", () => {
    assert.equal(
      createStructuredAwaitPolicy(basePolicy({ admittedAwaitModes: [] })).diagnostics[0]?.code,
      FUNGI_APPK_SAW_003,
    );
    assert.equal(
      createStructuredAwaitPolicy(basePolicy({ admittedAwaitModes: ["all", "all"] })).diagnostics[0]?.code,
      FUNGI_APPK_SAW_003,
    );
    assert.equal(
      createStructuredAwaitPolicy(basePolicy({ admittedAwaitModes: ["race", "all"] })).diagnostics[0]?.code,
      FUNGI_APPK_SAW_002,
    );
    const wildcard = createStructuredAwaitPolicy(basePolicy({ admittedAwaitModes: ["*"] }));
    assert.equal(wildcard.diagnostics[0]?.code, FUNGI_APPK_SAW_002);
    assert.equal(wildcard.diagnostics.some((d) => d.message.includes("*")), false);
    const sparse = [];
    sparse[0] = "all";
    sparse[2] = "stream";
    assert.equal(
      createStructuredAwaitPolicy(basePolicy({ admittedAwaitModes: sparse })).diagnostics[0]?.code,
      FUNGI_APPK_SAW_004,
    );
    const injected = createStructuredAwaitPolicy(
      basePolicy({ diagnostics: [{ code: "X", severity: "error", message: "pre-seeded", field: "record" }] }),
    );
    assert.equal(injected.diagnostics[0]?.code, FUNGI_APPK_SAW_005);
  });

  it("never throws on hostile proxies and refused output carries no null / NaN / undefined", () => {
    let flips = 0;
    const proxy = new Proxy(basePolicy(), {
      get(target, prop, receiver) {
        flips += 1;
        if (flips > 3 && prop === "limits") return null;
        return Reflect.get(target, prop, receiver);
      },
      getOwnPropertyDescriptor(target, prop) {
        flips += 1;
        if (prop === "limits") throw new Error("descriptor-trap");
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
      ownKeys(target) {
        flips += 1;
        return Reflect.ownKeys(target);
      },
    });
    let refused;
    assert.doesNotThrow(() => {
      refused = createStructuredAwaitPolicy(proxy);
    });
    assert.equal(refused.diagnostics.length > 0, true);
    assert.equal(refused.diagnostics.some((d) => d.message.includes("descriptor-trap")), false);
    assert.equal(hasNoHoles(refused), true);
    const read = readStructuredAwaitPolicy(proxy);
    assert.equal(read.ok, false);
  });
});
