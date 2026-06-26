/**
 * Fail-closed tests for @galerina/docs.
 *
 * The generator refuses to emit an empty, malformed, or misleading document, and
 * the standalone validator rejects hand-crafted invalid documents. A docs
 * generator is a governance surface: a broken contract must be a hard error, not
 * a silent partial.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { generateOpenApi, validateOpenApiDocument, OpenApiGenerationError } from "../dist/index.js";

const INFO = { title: "Test API", version: "1.0.0" };

// ── generator-level fail-closed ──────────────────────────────────────────────

test("no routes or policies → throws (refuses an empty API)", () => {
  assert.throws(() => generateOpenApi({ info: INFO }), OpenApiGenerationError);
  assert.throws(() => generateOpenApi({ info: INFO, routes: [] }), OpenApiGenerationError);
});

test("missing / empty info → throws", () => {
  const route = { method: "GET", path: "/x", handler: "x", auth: { mode: "public" } };
  assert.throws(() => generateOpenApi({ info: { version: "1.0.0" }, routes: [route] }), OpenApiGenerationError);
  assert.throws(() => generateOpenApi({ info: { title: "  ", version: "1.0.0" }, routes: [route] }), OpenApiGenerationError);
  assert.throws(() => generateOpenApi({ info: { title: "T", version: "" }, routes: [route] }), OpenApiGenerationError);
});

test("a route path that is not absolute → throws", () => {
  assert.throws(
    () => generateOpenApi({ info: INFO, routes: [{ method: "GET", path: "relative", handler: "h", auth: { mode: "public" } }] }),
    OpenApiGenerationError,
  );
});

test("two routes with the same method+path → throws", () => {
  assert.throws(
    () => generateOpenApi({
      info: INFO,
      routes: [
        { method: "GET", path: "/dup", handler: "a", auth: { mode: "public" } },
        { method: "GET", path: "/dup", handler: "b", auth: { mode: "public" } },
      ],
    }),
    OpenApiGenerationError,
  );
});

// ── standalone validator fail-closed ─────────────────────────────────────────

/** A minimal valid document we then corrupt in each test. */
function validDoc() {
  return generateOpenApi({
    info: INFO,
    routes: [{ method: "GET", path: "/ok", handler: "ok", auth: { mode: "public" } }],
  });
}

test("validator accepts a well-formed document", () => {
  assert.doesNotThrow(() => validateOpenApiDocument(validDoc()));
});

test("validator rejects a bad version string", () => {
  const doc = { ...validDoc(), openapi: "2.0" };
  assert.throws(() => validateOpenApiDocument(doc), OpenApiGenerationError);
});

test("validator rejects a dangling $ref", () => {
  const base = validDoc();
  const doc = {
    ...base,
    paths: {
      "/ok": {
        get: {
          ...base.paths["/ok"].get,
          responses: {
            "200": { description: "x", content: { "application/json": { schema: { $ref: "#/components/schemas/DoesNotExist" } } } },
          },
        },
      },
    },
  };
  assert.throws(() => validateOpenApiDocument(doc), /does not resolve/);
});

test("validator rejects a duplicate operationId", () => {
  const base = validDoc();
  const op = base.paths["/ok"].get;
  const doc = {
    ...base,
    paths: {
      "/a": { get: { ...op, operationId: "same" } },
      "/b": { get: { ...op, operationId: "same" } },
    },
  };
  assert.throws(() => validateOpenApiDocument(doc), /Duplicate operationId/);
});

test("validator rejects an operation with no responses", () => {
  const base = validDoc();
  const doc = {
    ...base,
    paths: { "/ok": { get: { ...base.paths["/ok"].get, responses: {} } } },
  };
  assert.throws(() => validateOpenApiDocument(doc), /no responses/);
});

test("validator rejects a path template with no matching path parameter", () => {
  const base = validDoc();
  const op = base.paths["/ok"].get;
  const doc = {
    ...base,
    // path declares {id} but the operation has no path parameter for it
    paths: { "/items/{id}": { get: { ...op, parameters: [] } } },
  };
  assert.throws(() => validateOpenApiDocument(doc), /has no matching path parameter/);
});

test("validator rejects a security requirement naming an undefined scheme", () => {
  const base = validDoc();
  const doc = {
    ...base,
    paths: { "/ok": { get: { ...base.paths["/ok"].get, security: [{ ghostAuth: [] }] } } },
  };
  assert.throws(() => validateOpenApiDocument(doc), /not defined in components.securitySchemes/);
});
