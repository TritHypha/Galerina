import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_APPK_001,
  FUNGI_APPK_002,
  FUNGI_APPK_003,
  FUNGI_APPK_004,
  TYPED_API_BOUNDARY_SCHEMA,
  createTypedApiBoundary,
  readTypedApiBoundary,
} from "../dist/typed-api-boundary.js";

function baseRoute(overrides = {}) {
  return {
    method: "POST",
    path: "/orders",
    handler: "createOrder",
    requestType: "CreateOrderRequest",
    responseType: "CreateOrderResponse",
    auth: { mode: "required", scopes: ["orders.write"] },
    body: {
      contentType: "application/json",
      maxSizeBytes: 262144,
      unknownFields: "deny",
      duplicateKeys: "deny",
    },
    idempotency: {
      enabled: true,
      header: "Idempotency-Key",
      ttlSeconds: 86400,
      onDuplicate: "reject",
    },
    limits: {
      rate: "30/minute",
      maxConcurrent: 5,
      memoryBytes: 33554432,
      timeoutMs: 5000,
    },
    ...overrides,
  };
}

function baseBoundary(overrides = {}) {
  return {
    schema: TYPED_API_BOUNDARY_SCHEMA,
    name: "OrdersApi",
    routes: [baseRoute()],
    ...overrides,
  };
}

describe("typed API boundary contract", () => {
  it("admits a closed OrdersApi-shaped boundary", () => {
    const result = readTypedApiBoundary(baseBoundary());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.schema, TYPED_API_BOUNDARY_SCHEMA);
    assert.equal(result.value.name, "OrdersApi");
    assert.equal(result.value.routes.length, 1);
    assert.equal(result.value.routes[0].method, "POST");
    assert.equal(result.value.routes[0].path, "/orders");
    assert.equal(result.value.diagnostics.length, 0);
  });

  it("refuses getters, symbols, and unknown keys without echo", () => {
    const hostile = {
      schema: TYPED_API_BOUNDARY_SCHEMA,
      name: "OrdersApi",
      routes: [baseRoute()],
    };
    Object.defineProperty(hostile, "secret", {
      get() {
        throw new Error("getter-ran");
      },
      enumerable: true,
    });
    const fromGetter = createTypedApiBoundary(hostile);
    assert.equal(fromGetter.diagnostics[0]?.code, FUNGI_APPK_001);
    assert.equal(fromGetter.diagnostics.some((d) => /getter|secret/i.test(d.message)), false);

    const withSymbol = {
      schema: TYPED_API_BOUNDARY_SCHEMA,
      name: "OrdersApi",
      routes: [baseRoute()],
      [Symbol("x")]: 1,
    };
    const fromSymbol = createTypedApiBoundary(withSymbol);
    assert.equal(fromSymbol.diagnostics[0]?.code, FUNGI_APPK_001);

    const unknownKey = {
      schema: TYPED_API_BOUNDARY_SCHEMA,
      name: "OrdersApi",
      routes: [baseRoute()],
      extra: "nope",
    };
    const fromUnknown = createTypedApiBoundary(unknownKey);
    assert.equal(fromUnknown.diagnostics[0]?.code, FUNGI_APPK_001);
    assert.equal(fromUnknown.diagnostics.some((d) => d.message.includes("extra")), false);
  });

  it("refuses NaN / Infinity / reserved modes / bad path without echo", () => {
    const nanBody = createTypedApiBoundary(
      baseBoundary({
        routes: [baseRoute({ body: { contentType: "application/json", maxSizeBytes: Number.NaN, unknownFields: "deny", duplicateKeys: "deny" } })],
      }),
    );
    assert.equal(nanBody.diagnostics.some((d) => d.code === FUNGI_APPK_002), true);
    assert.equal(nanBody.diagnostics.some((d) => /NaN/i.test(d.message)), false);

    const strip = createTypedApiBoundary(
      baseBoundary({
        routes: [baseRoute({ body: { contentType: "application/json", maxSizeBytes: 1, unknownFields: "strip", duplicateKeys: "deny" } })],
      }),
    );
    assert.equal(strip.diagnostics.some((d) => d.code === FUNGI_APPK_002 || d.code === FUNGI_APPK_004), true);
    assert.equal(strip.diagnostics.some((d) => d.message.includes("strip")), false);

    const replay = createTypedApiBoundary(
      baseBoundary({
        routes: [baseRoute({ idempotency: { enabled: true, header: "Idempotency-Key", ttlSeconds: 1, onDuplicate: "replay" } })],
      }),
    );
    assert.equal(replay.diagnostics.some((d) => d.code === FUNGI_APPK_002), true);
    assert.equal(replay.diagnostics.some((d) => d.message.includes("replay")), false);

    const badPath = createTypedApiBoundary(
      baseBoundary({ routes: [baseRoute({ path: "/../etc/passwd" })] }),
    );
    assert.equal(badPath.diagnostics.some((d) => d.code === FUNGI_APPK_002), true);
    assert.equal(badPath.diagnostics.some((d) => d.message.includes("passwd")), false);
  });

  it("refuses empty routes and duplicate method+path", () => {
    const empty = createTypedApiBoundary(baseBoundary({ routes: [] }));
    assert.equal(empty.diagnostics.some((d) => d.code === FUNGI_APPK_003), true);

    const dup = createTypedApiBoundary(
      baseBoundary({
        routes: [baseRoute(), baseRoute({ handler: "other" })],
      }),
    );
    assert.equal(dup.diagnostics.some((d) => d.code === FUNGI_APPK_003), true);
  });

  it("admits null optional policy blocks and null type names", () => {
    const result = readTypedApiBoundary(
      baseBoundary({
        routes: [
          baseRoute({
            requestType: null,
            responseType: null,
            auth: null,
            body: null,
            idempotency: null,
            limits: null,
          }),
        ],
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.routes[0].auth, null);
    assert.equal(result.value.routes[0].body, null);
  });

  it("never throws on flipping proxies", () => {
    let flips = 0;
    const proxy = new Proxy(
      { schema: TYPED_API_BOUNDARY_SCHEMA, name: "OrdersApi", routes: [baseRoute()] },
      {
        get(target, prop, receiver) {
          flips += 1;
          if (flips > 3 && prop === "routes") return null;
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
      },
    );
    assert.doesNotThrow(() => createTypedApiBoundary(proxy));
  });
});
