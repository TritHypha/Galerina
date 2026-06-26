import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRouteRegistry, parseProgram } from "../dist/index.js";

function buildRegistry(source) {
  const parsed = parseProgram(source, "test.spore");
  return buildRouteRegistry(parsed.ast);
}

describe("Route registry", () => {
  it("finds route from routeDecl", () => {
    const registry = buildRegistry(`
route POST "/orders" { request CreateOrderRequest response OrderResponse flow createOrder }
`);
    assert.equal(registry.routes.length, 1);
    assert.equal(registry.routes[0].method, "POST");
    assert.equal(registry.routes[0].path, "/orders");
    assert.equal(registry.routes[0].flowName, "createOrder");
  });

  it("extracts request type", () => {
    const registry = buildRegistry(`
route POST "/orders" { request CreateOrderRequest response OrderResponse flow createOrder }
`);
    assert.equal(registry.routes[0].requestType, "CreateOrderRequest");
  });

  it("extracts response type", () => {
    const registry = buildRegistry(`
route POST "/orders" { request CreateOrderRequest response OrderResponse flow createOrder }
`);
    assert.equal(registry.routes[0].responseType, "OrderResponse");
  });

  it("matches exact path", () => {
    const registry = buildRegistry(`
route POST "/orders" { flow createOrder }
`);
    assert.ok(registry.match("POST", "/orders") !== null);
  });

  it("does not match wrong method", () => {
    const registry = buildRegistry(`
route POST "/orders" { flow createOrder }
`);
    assert.equal(registry.match("GET", "/orders"), null);
  });

  it("does not match wrong path", () => {
    const registry = buildRegistry(`
route POST "/orders" { flow createOrder }
`);
    assert.equal(registry.match("POST", "/users"), null);
  });

  it("matches path with parameter", () => {
    const registry = buildRegistry(`
route GET "/users/{id}" { flow getUser }
`);
    const match = registry.match("GET", "/users/123");
    assert.ok(match !== null);
    assert.equal(match?.params.get("id"), "123");
  });

  it("handles multiple routes", () => {
    const registry = buildRegistry(`
route GET "/orders" { flow getOrders }
route POST "/orders" { flow createOrder }
`);
    assert.equal(registry.routes.length, 2);
  });

  it("excludes route with no flow clause", () => {
    const registry = buildRegistry(`
route GET "/nothing" { request T response U }
`);
    assert.equal(registry.routes.length, 0);
  });

  it("builds regex for multiple path params", () => {
    const registry = buildRegistry(`
route GET "/users/{id}/orders/{orderId}" { flow getOrder }
`);
    const match = registry.match("GET", "/users/abc/orders/xyz");
    assert.ok(match !== null);
    assert.equal(match?.params.get("id"), "abc");
    assert.equal(match?.params.get("orderId"), "xyz");
  });
});
