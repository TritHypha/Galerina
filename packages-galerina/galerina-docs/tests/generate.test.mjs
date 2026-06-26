/**
 * Generation tests for @galerina/docs.
 *
 * These drive the REAL generator over the REAL App Kernel route resolver
 * (resolveEffectiveRoutePolicy) — nothing is mocked. They assert that the emitted
 * OpenAPI document faithfully reflects what the kernel enforces: the security
 * requirement, the body gates, the idempotency contract, the rate limits, and the
 * exact set of error statuses each route can return.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { generateOpenApi, exportOpenApi, validateOpenApiDocument } from "../dist/index.js";
import { resolveEffectiveRoutePolicy } from "../../galerina-framework-app-kernel/dist/index.js";

const INFO = { title: "Test API", version: "1.0.0" };

test("basic generation → valid OpenAPI 3.1.0 document that re-validates and serialises", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "GET", path: "/ping", handler: "ping", auth: { mode: "public" } }],
  });
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(doc.info.title, "Test API");
  assert.deepEqual(Object.keys(doc.paths), ["/ping"]);
  // Self-validation passes (the generator already ran it; assert it explicitly too).
  assert.doesNotThrow(() => validateOpenApiDocument(doc));
  // Fully JSON-serialisable.
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(doc)));
});

test("exportOpenApi is the spec-named alias of generateOpenApi", () => {
  assert.equal(exportOpenApi, generateOpenApi);
});

test("auth-required route → bearerAuth security + 401 + defined security scheme", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "GET", path: "/me", handler: "me" }], // default auth: required
  });
  const op = doc.paths["/me"].get;
  assert.deepEqual(op.security, [{ bearerAuth: [] }]);
  assert.ok("401" in op.responses, "required-auth route documents 401");
  assert.ok(doc.components.securitySchemes?.bearerAuth, "bearerAuth scheme is defined");
  assert.equal(doc.components.securitySchemes.bearerAuth.scheme, "bearer");
});

test("public route → security:[] (the documented relaxation) and no 401", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "GET", path: "/public", handler: "pub", auth: { mode: "public" } }],
  });
  const op = doc.paths["/public"].get;
  assert.deepEqual(op.security, []);
  assert.ok(!("401" in op.responses), "public route does not document 401");
});

test("scoped route → 403 + x-galerina-scopes + scopes in description", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "GET", path: "/admin", handler: "admin", auth: { scopes: ["admin.read"] } }],
  });
  const op = doc.paths["/admin"].get;
  assert.ok("403" in op.responses, "scoped route documents 403");
  assert.deepEqual(op["x-galerina-scopes"], ["admin.read"]);
  assert.match(op.description, /admin\.read/);
});

test(":param path → {param} with a required path parameter", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "GET", path: "/users/:id/posts/:postId", handler: "getPost", auth: { mode: "public" } }],
  });
  assert.ok(doc.paths["/users/{id}/posts/{postId}"], "path is templated");
  const params = doc.paths["/users/{id}/posts/{postId}"].get.parameters;
  const pathParams = params.filter((p) => p.in === "path");
  assert.deepEqual(pathParams.map((p) => p.name).sort(), ["id", "postId"]);
  assert.ok(pathParams.every((p) => p.required === true), "path params are required");
});

test("mutating method → idempotency 409 + Idempotency-Key header param (kernel default)", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "POST", path: "/things", handler: "create", auth: { mode: "public" } }],
  });
  const op = doc.paths["/things"].post;
  assert.ok("409" in op.responses, "mutating route documents 409 (idempotency on by default)");
  const headerParam = (op.parameters ?? []).find((p) => p.in === "header" && p.name === "Idempotency-Key");
  assert.ok(headerParam, "Idempotency-Key header is documented");
  assert.equal(headerParam.required, false);
});

test("body-bearing route → requestBody + 413/415/422 + x-galerina-max-body-bytes", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "POST", path: "/upload", handler: "upload", requestType: "UploadReq", auth: { mode: "public" } }],
  });
  const op = doc.paths["/upload"].post;
  assert.ok(op.requestBody, "requestBody present");
  assert.ok(op.requestBody.content["application/json"], "JSON content present");
  for (const code of ["413", "415", "422"]) assert.ok(code in op.responses, `documents ${code}`);
  // Posture 'off' default body limit is 256 KiB.
  assert.equal(op["x-galerina-max-body-bytes"], 256 * 1024);
});

test("request/response types → component schemas + $ref, Error schema always present", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "POST", path: "/orders", handler: "createOrder", requestType: "CreateOrderRequest", responseType: "OrderResponse", auth: { mode: "public" } }],
  });
  assert.ok(doc.components.schemas.CreateOrderRequest, "request type schema defined");
  assert.ok(doc.components.schemas.OrderResponse, "response type schema defined");
  assert.ok(doc.components.schemas.Error, "shared Error schema defined");
  const op = doc.paths["/orders"].post;
  assert.equal(op.requestBody.content["application/json"].schema.$ref, "#/components/schemas/CreateOrderRequest");
  assert.equal(op.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/OrderResponse");
});

test("posture 'on' tightens the documented body ceiling to 64 KiB", () => {
  const doc = generateOpenApi({
    info: INFO,
    posture: "on",
    routes: [{ method: "POST", path: "/secure-upload", handler: "up", requestType: "R", auth: { mode: "public" } }],
  });
  assert.equal(doc.paths["/secure-upload"].post["x-galerina-max-body-bytes"], 64 * 1024);
});

test("already-resolved policies are documented verbatim", () => {
  const policy = resolveEffectiveRoutePolicy({ method: "GET", path: "/verbatim", handler: "v", auth: { mode: "public" } });
  const doc = exportOpenApi({ info: INFO, policies: [policy] });
  assert.ok(doc.paths["/verbatim"].get, "policy-sourced operation is present");
  assert.deepEqual(doc.paths["/verbatim"].get.security, []);
});

test("routes + policies can be combined in one document", () => {
  const policy = resolveEffectiveRoutePolicy({ method: "GET", path: "/from-policy", handler: "p", auth: { mode: "public" } });
  const doc = generateOpenApi({
    info: INFO,
    policies: [policy],
    routes: [{ method: "GET", path: "/from-route", handler: "r", auth: { mode: "public" } }],
  });
  assert.deepEqual(Object.keys(doc.paths).sort(), ["/from-policy", "/from-route"]);
});

test("openApiVersion '3.0.3' is honoured", () => {
  const doc = generateOpenApi({
    info: INFO,
    openApiVersion: "3.0.3",
    routes: [{ method: "GET", path: "/v3", handler: "v3", auth: { mode: "public" } }],
  });
  assert.equal(doc.openapi, "3.0.3");
});

test("duplicate handler names across routes → unique operationIds", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [
      { method: "GET", path: "/a", handler: "handler", auth: { mode: "public" } },
      { method: "GET", path: "/b", handler: "handler", auth: { mode: "public" } },
    ],
  });
  const ids = [doc.paths["/a"].get.operationId, doc.paths["/b"].get.operationId];
  assert.notEqual(ids[0], ids[1], "operationIds are de-duplicated");
});

test("an all-public API emits no security schemes and still validates", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "GET", path: "/open", handler: "open", auth: { mode: "public" } }],
  });
  assert.equal(doc.components.securitySchemes, undefined);
  assert.doesNotThrow(() => validateOpenApiDocument(doc));
});

test("relaxations are surfaced (public auth on an otherwise-default route)", () => {
  const doc = generateOpenApi({
    info: INFO,
    routes: [{ method: "GET", path: "/relaxed", handler: "r", auth: { mode: "public" } }],
  });
  assert.deepEqual(doc.paths["/relaxed"].get["x-galerina-relaxations"], ["auth:public"]);
});
