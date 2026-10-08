import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_RLW_001,
  FUNGI_APPK_RLW_002,
  FUNGI_APPK_RLW_003,
  FUNGI_APPK_RLW_004,
  RATE_LIMIT_WORKLOAD_POLICY_SCHEMA,
  createRateLimitWorkloadPolicy,
  readRateLimitWorkloadPolicy,
} from "../dist/rate-limit-workload-policy.js";

function rule(id, keyKind, windowMs, maxRequests) {
  return { id, keyKind, windowMs, maxRequests };
}

function workload(overrides = {}) {
  return {
    maxConcurrent: 32,
    maxQueueDepth: 128,
    maxRequestDurationMs: 5000,
    ...overrides,
  };
}

function basePolicy(overrides = {}) {
  return {
    schema: RATE_LIMIT_WORKLOAD_POLICY_SCHEMA,
    name: "OrdersRateLimit",
    defaultDecision: "deny",
    admittedKeyKinds: ["principal", "principal_route", "route"],
    rules: [
      rule("orders_read", "route", 60_000, 120),
      rule("orders_write", "principal_route", 60_000, 30),
    ],
    workload: workload(),
    ...overrides,
  };
}

describe("rate-limit and workload control policy", () => {
  it("admits a closed rate-limit + workload policy", () => {
    const result = readRateLimitWorkloadPolicy(basePolicy());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, RATE_LIMIT_WORKLOAD_POLICY_SCHEMA);
    assert.equal(result.value.name, "OrdersRateLimit");
    assert.equal(result.value.defaultDecision, "deny");
    assert.equal(result.value.admittedKeyKinds.length, 3);
    assert.equal(result.value.rules.length, 2);
    assert.equal(result.value.rules[0]?.id, "orders_read");
    assert.equal(result.value.rules[1]?.keyKind, "principal_route");
    assert.equal(result.value.workload.maxConcurrent, 32);
    assert.equal(result.value.diagnostics.length, 0);
  });

  it("refuses getters, symbols, and unknown keys without echo", () => {
    const hostile = basePolicy();
    Object.defineProperty(hostile, "secret", {
      get() {
        throw new Error("getter-ran");
      },
      enumerable: true,
    });
    const fromGetter = createRateLimitWorkloadPolicy(hostile);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_RLW_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    const withSymbol = { ...basePolicy(), [Symbol("x")]: 1 };
    const fromSymbol = createRateLimitWorkloadPolicy(withSymbol);
    assert.equal(fromSymbol.diagnostics[0]?.code, FUNGI_APPK_RLW_001);

    const unknownKey = { ...basePolicy(), extra: "nope" };
    const fromUnknown = createRateLimitWorkloadPolicy(unknownKey);
    assert.equal(fromUnknown.diagnostics[0]?.code, FUNGI_APPK_RLW_001);
    assert.equal(fromUnknown.diagnostics.some((d) => d.message.includes("extra")), false);
  });

  it("refuses allow/bypass default, NaN ceilings, and bad key kinds without echo", () => {
    const allow = createRateLimitWorkloadPolicy(basePolicy({ defaultDecision: "allow" }));
    assert.equal(allow.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_002), true);
    assert.equal(allow.diagnostics.some((d) => d.message.includes("allow")), false);

    const bypass = createRateLimitWorkloadPolicy(basePolicy({ defaultDecision: "bypass" }));
    assert.equal(bypass.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_002), true);
    assert.equal(bypass.diagnostics.some((d) => d.message.includes("bypass")), false);

    const nan = createRateLimitWorkloadPolicy(
      basePolicy({
        rules: [rule("orders_read", "route", Number.NaN, 120)],
      }),
    );
    assert.equal(nan.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_002), true);
    assert.equal(nan.diagnostics.some((d) => /NaN|nan/i.test(d.message)), false);

    const inf = createRateLimitWorkloadPolicy(
      basePolicy({
        workload: workload({ maxConcurrent: Number.POSITIVE_INFINITY }),
      }),
    );
    assert.equal(inf.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_002), true);
    assert.equal(inf.diagnostics.some((d) => /Infinity|inf/i.test(d.message)), false);

    const zero = createRateLimitWorkloadPolicy(
      basePolicy({
        rules: [rule("orders_read", "route", 0, 120)],
      }),
    );
    assert.equal(zero.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_002), true);

    const badKind = createRateLimitWorkloadPolicy(
      basePolicy({ admittedKeyKinds: ["principal", "ip"] }),
    );
    assert.equal(badKind.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_002), true);
    assert.equal(badKind.diagnostics.some((d) => d.message.includes("ip")), false);
  });

  it("refuses empty rules, duplicate ids, and keyKind outside admitted set", () => {
    const empty = createRateLimitWorkloadPolicy(basePolicy({ rules: [] }));
    assert.equal(empty.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_003), true);

    const dup = createRateLimitWorkloadPolicy(
      basePolicy({
        rules: [
          rule("orders_read", "route", 60_000, 120),
          rule("orders_read", "principal", 60_000, 30),
        ],
      }),
    );
    assert.equal(dup.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_003), true);

    const outside = createRateLimitWorkloadPolicy(
      basePolicy({
        admittedKeyKinds: ["route"],
        rules: [rule("orders_read", "principal", 60_000, 120)],
      }),
    );
    assert.equal(outside.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_003), true);
    assert.equal(outside.diagnostics.some((d) => d.message.includes("principal")), false);
  });

  it("refuses unsorted admittedKeyKinds / rules and dense-array violations", () => {
    const unsortedKinds = createRateLimitWorkloadPolicy(
      basePolicy({ admittedKeyKinds: ["route", "principal"] }),
    );
    assert.equal(unsortedKinds.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_002), true);

    const unsortedRules = createRateLimitWorkloadPolicy(
      basePolicy({
        rules: [
          rule("orders_write", "principal_route", 60_000, 30),
          rule("orders_read", "route", 60_000, 120),
        ],
      }),
    );
    assert.equal(unsortedRules.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_003), true);

    const sparse = [];
    sparse[0] = "principal";
    sparse[2] = "route";
    const sparseList = createRateLimitWorkloadPolicy(basePolicy({ admittedKeyKinds: sparse }));
    assert.equal(sparseList.diagnostics.some((d) => d.code === FUNGI_APPK_RLW_004), true);
  });

  it("never throws on flipping proxies", () => {
    let flips = 0;
    const proxy = new Proxy(basePolicy(), {
      get(target, prop, receiver) {
        flips += 1;
        if (flips > 3 && prop === "rules") return null;
        return Reflect.get(target, prop, receiver);
      },
      getOwnPropertyDescriptor(target, prop) {
        flips += 1;
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
      ownKeys(target) {
        flips += 1;
        return Reflect.ownKeys(target);
      },
    });
    assert.doesNotThrow(() => createRateLimitWorkloadPolicy(proxy));
  });
});
