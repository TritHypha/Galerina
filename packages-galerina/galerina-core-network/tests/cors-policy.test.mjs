// cors-policy.test.mjs — deny-by-default CORS admission + the classic CORS footgun defences.

import assert from "node:assert/strict";
import { test } from "node:test";
import { guardCorsRequest } from "../dist/index.js";

const GET = { method: "GET" };

// ── same-origin / non-CORS ─────────────────────────────────────────────────────
test("no Origin header → allowed, emits no CORS headers (not cross-origin)", () => {
  const d = guardCorsRequest({ method: "GET" }, { allowedOrigins: [] });
  assert.equal(d.allowed, true);
  assert.equal(d.headers, undefined);
});

// ── exact allow-list admission (footgun #1/#2) ─────────────────────────────────
test("exact allowed origin → admitted; echoes THAT origin + Vary: Origin (never reflects blindly)", () => {
  const d = guardCorsRequest({ ...GET, origin: "https://app.example.com" }, { allowedOrigins: ["https://app.example.com"] });
  assert.equal(d.allowed, true);
  assert.equal(d.headers?.["Access-Control-Allow-Origin"], "https://app.example.com");
  assert.equal(d.headers?.["Vary"], "Origin");
});

test("origin not on the allow-list → DENIED (deny-by-default, never reflected)", () => {
  const d = guardCorsRequest({ ...GET, origin: "https://evil.com" }, { allowedOrigins: ["https://app.example.com"] });
  assert.equal(d.allowed, false);
  assert.equal(d.code, "Galerina_NETWORK_CORS_ORIGIN_DENIED");
  assert.equal(d.headers, undefined);
});

test("suffix/substring attack → DENIED (exact match only)", () => {
  // The attacker registers a host that merely CONTAINS the allowed one.
  for (const evil of ["https://app.example.com.attacker.com", "https://evilapp.example.com", "https://app.example.como"]) {
    const d = guardCorsRequest({ ...GET, origin: evil }, { allowedOrigins: ["https://app.example.com"] });
    assert.equal(d.allowed, false, evil);
  }
});

test("empty allow-list + a cross-origin request → DENIED", () => {
  const d = guardCorsRequest({ ...GET, origin: "https://app.example.com" }, { allowedOrigins: [] });
  assert.equal(d.allowed, false);
});

// ── null origin (footgun #3) ───────────────────────────────────────────────────
test("null Origin → DENIED (sandboxed-iframe / file:// bypass)", () => {
  const d = guardCorsRequest({ ...GET, origin: "null" }, { allowedOrigins: ["https://app.example.com"] });
  assert.equal(d.allowed, false);
  assert.equal(d.code, "Galerina_NETWORK_CORS_NULL_ORIGIN");
});

// ── wildcard + credentials (footgun #4) ────────────────────────────────────────
test("wildcard '*' without credentials → allowed, ACAO: '*'", () => {
  const d = guardCorsRequest({ ...GET, origin: "https://anything.example" }, { allowedOrigins: ["*"] });
  assert.equal(d.allowed, true);
  assert.equal(d.headers?.["Access-Control-Allow-Origin"], "*");
});

test("wildcard '*' WITH credentials → DENIED (forbidden combination)", () => {
  const d = guardCorsRequest({ ...GET, origin: "https://anything.example" }, { allowedOrigins: ["*"], allowCredentials: true });
  assert.equal(d.allowed, false);
  assert.equal(d.code, "Galerina_NETWORK_CORS_WILDCARD_CREDENTIALS");
});

test("credentials with an EXACT origin → allowed, echoes the origin + Allow-Credentials: true (never '*')", () => {
  const d = guardCorsRequest(
    { ...GET, origin: "https://app.example.com" },
    { allowedOrigins: ["https://app.example.com"], allowCredentials: true },
  );
  assert.equal(d.allowed, true);
  assert.equal(d.headers?.["Access-Control-Allow-Origin"], "https://app.example.com");
  assert.equal(d.headers?.["Access-Control-Allow-Credentials"], "true");
});

test("wildcard config but the origin is ALSO exactly listed → echoes the specific origin, not '*'", () => {
  const d = guardCorsRequest(
    { ...GET, origin: "https://app.example.com" },
    { allowedOrigins: ["*", "https://app.example.com"] },
  );
  assert.equal(d.allowed, true);
  assert.equal(d.headers?.["Access-Control-Allow-Origin"], "https://app.example.com");
});

// ── preflight (footgun #5) ─────────────────────────────────────────────────────
const PF_POLICY = { allowedOrigins: ["https://app.example.com"], allowedMethods: ["GET", "POST", "PUT"], allowedHeaders: ["Content-Type", "X-Trace"] };

test("preflight with an allowed method + headers → allowed + Allow-Methods/Headers", () => {
  const d = guardCorsRequest(
    { method: "OPTIONS", origin: "https://app.example.com", isPreflight: true, requestMethod: "PUT", requestHeaders: ["content-type"] },
    PF_POLICY,
  );
  assert.equal(d.allowed, true);
  assert.equal(d.isPreflight, true);
  assert.match(d.headers?.["Access-Control-Allow-Methods"] ?? "", /PUT/);
  assert.match(d.headers?.["Access-Control-Allow-Headers"] ?? "", /Content-Type/);
});

test("preflight with a disallowed method → DENIED", () => {
  const d = guardCorsRequest(
    { method: "OPTIONS", origin: "https://app.example.com", isPreflight: true, requestMethod: "DELETE" },
    PF_POLICY,
  );
  assert.equal(d.allowed, false);
  assert.equal(d.code, "Galerina_NETWORK_CORS_METHOD_DENIED");
});

test("preflight with a disallowed header → DENIED", () => {
  const d = guardCorsRequest(
    { method: "OPTIONS", origin: "https://app.example.com", isPreflight: true, requestMethod: "POST", requestHeaders: ["X-Evil"] },
    PF_POLICY,
  );
  assert.equal(d.allowed, false);
  assert.equal(d.code, "Galerina_NETWORK_CORS_HEADER_DENIED");
});

test("preflight header check is case-insensitive; maxAge is emitted", () => {
  const d = guardCorsRequest(
    { method: "OPTIONS", origin: "https://app.example.com", isPreflight: true, requestMethod: "post", requestHeaders: ["CONTENT-TYPE", "x-trace"] },
    { ...PF_POLICY, maxAgeSec: 600 },
  );
  assert.equal(d.allowed, true);
  assert.equal(d.headers?.["Access-Control-Max-Age"], "600");
});

test("preflight method defaults to GET/HEAD/POST when unspecified; PUT then rejected", () => {
  const d = guardCorsRequest(
    { method: "OPTIONS", origin: "https://app.example.com", isPreflight: true, requestMethod: "PUT" },
    { allowedOrigins: ["https://app.example.com"] },
  );
  assert.equal(d.allowed, false);
});
