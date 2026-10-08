import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_RVP_001,
  FUNGI_APPK_RVP_002,
  FUNGI_APPK_RVP_003,
  FUNGI_APPK_RVP_004,
  REQUEST_VALIDATION_POLICY_SCHEMA,
  createRequestValidationPolicy,
  readRequestValidationPolicy,
} from "../dist/request-validation-policy.js";

function basePolicy(overrides = {}) {
  return {
    schema: REQUEST_VALIDATION_POLICY_SCHEMA,
    requestType: "CreateOrderRequest",
    bodyRequired: true,
    contentType: "application/json",
    maxSizeBytes: 262144,
    unknownFields: "deny",
    duplicateKeys: "deny",
    admittedFields: ["currency", "customerId", "items"],
    ...overrides,
  };
}

describe("request validation policy contract", () => {
  it("admits a closed CreateOrderRequest-shaped policy", () => {
    const result = readRequestValidationPolicy(basePolicy());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, REQUEST_VALIDATION_POLICY_SCHEMA);
    assert.equal(result.value.requestType, "CreateOrderRequest");
    assert.equal(result.value.bodyRequired, true);
    assert.equal(result.value.unknownFields, "deny");
    assert.equal(result.value.admittedFields.length, 3);
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
    const fromGetter = createRequestValidationPolicy(hostile);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_RVP_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    const withSymbol = { ...basePolicy(), [Symbol("x")]: 1 };
    const fromSymbol = createRequestValidationPolicy(withSymbol);
    assert.equal(fromSymbol.diagnostics[0]?.code, FUNGI_APPK_RVP_001);

    const unknownKey = { ...basePolicy(), extra: "nope" };
    const fromUnknown = createRequestValidationPolicy(unknownKey);
    assert.equal(fromUnknown.diagnostics[0]?.code, FUNGI_APPK_RVP_001);
    assert.equal(fromUnknown.diagnostics.some((d) => d.message.includes("extra")), false);
  });

  it("refuses NaN / Infinity / reserved strip / bad field tokens without echo", () => {
    const nan = createRequestValidationPolicy(basePolicy({ maxSizeBytes: Number.NaN }));
    assert.equal(nan.diagnostics.some((d) => d.code === FUNGI_APPK_RVP_002), true);
    assert.equal(nan.diagnostics.some((d) => /NaN/i.test(d.message)), false);

    const inf = createRequestValidationPolicy(basePolicy({ maxSizeBytes: Number.POSITIVE_INFINITY }));
    assert.equal(inf.diagnostics.some((d) => d.code === FUNGI_APPK_RVP_002), true);

    const strip = createRequestValidationPolicy(basePolicy({ unknownFields: "strip" }));
    assert.equal(strip.diagnostics.some((d) => d.code === FUNGI_APPK_RVP_002), true);
    assert.equal(strip.diagnostics.some((d) => d.message.includes("strip")), false);

    const badField = createRequestValidationPolicy(basePolicy({ admittedFields: ["ok", "../passwd"] }));
    assert.equal(badField.diagnostics.some((d) => d.code === FUNGI_APPK_RVP_002 || d.code === FUNGI_APPK_RVP_004), true);
    assert.equal(badField.diagnostics.some((d) => d.message.includes("passwd")), false);
  });

  it("refuses deny with empty admittedFields and bodyRequired with zero size", () => {
    const emptyDeny = createRequestValidationPolicy(basePolicy({ admittedFields: [] }));
    assert.equal(emptyDeny.diagnostics.some((d) => d.code === FUNGI_APPK_RVP_003), true);

    const zeroBody = createRequestValidationPolicy(basePolicy({ maxSizeBytes: 0 }));
    assert.equal(zeroBody.diagnostics.some((d) => d.code === FUNGI_APPK_RVP_003), true);
  });

  it("admits allow with empty admittedFields and bodyRequired=false with zero size", () => {
    const openAllow = readRequestValidationPolicy(
      basePolicy({ unknownFields: "allow", admittedFields: [] }),
    );
    assert.equal(openAllow.ok, true);

    const noBody = readRequestValidationPolicy(
      basePolicy({ bodyRequired: false, maxSizeBytes: 0, admittedFields: [] , unknownFields: "allow" }),
    );
    assert.equal(noBody.ok, true);
    if (!noBody.ok) return;
    assert.equal(noBody.value.bodyRequired, false);
    assert.equal(noBody.value.maxSizeBytes, 0);
  });

  it("never throws on flipping proxies", () => {
    let flips = 0;
    const proxy = new Proxy(basePolicy(), {
      get(target, prop, receiver) {
        flips += 1;
        if (flips > 3 && prop === "admittedFields") return null;
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
    assert.doesNotThrow(() => createRequestValidationPolicy(proxy));
  });
});
