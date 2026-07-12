// Defensive controls (RD-0325 / RD-0326) — the two prompt-specified test classes:
//   Class 1 — hostile-direct-access: the proxy is removed/forged; the app must stay safe.
//   Class 2 — enumeration: sequential-id / route-guess / login-oracle probes must ALL uniformly deny.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  proxyIsTrusted, resolveClientAddress,
  uniformResourceResponse, uniformAuthResponse,
  boundPageLimit, SECURE_PAGINATION, isOpaqueId,
} from "../dist/index.js";

describe("Test class — hostile-direct-access (RD-0325): the proxy is untrusted until it proves identity", () => {
  const spoofedXff = { socketPeer: "203.0.113.9", forwardedFor: "10.0.0.1", proxy: { method: "none" } };

  it("spoofed X-Forwarded-For with NO proxy proof → ignored; the socket peer is authoritative", () => {
    const d = resolveClientAddress(spoofedXff);
    assert.equal(d.clientIp, "203.0.113.9");
    assert.equal(d.source, "socket-peer");
    assert.equal(d.proxyTrusted, false);
  });

  it("verified AND pinned mTLS → X-Forwarded-For is honoured", () => {
    const d = resolveClientAddress({
      socketPeer: "10.0.0.5", forwardedFor: "198.51.100.7",
      proxy: { method: "mtls", mtlsClientCertVerified: true, mtlsSubjectPinned: true },
    });
    assert.equal(d.clientIp, "198.51.100.7");
    assert.equal(d.source, "forwarded");
    assert.equal(d.proxyTrusted, true);
  });

  it("mTLS verified but subject NOT pinned → fail-closed untrusted (presence ≠ pinned)", () => {
    assert.equal(proxyIsTrusted({ method: "mtls", mtlsClientCertVerified: true, mtlsSubjectPinned: false }), false);
    const d = resolveClientAddress({
      socketPeer: "10.0.0.5", forwardedFor: "198.51.100.7",
      proxy: { method: "mtls", mtlsClientCertVerified: true, mtlsSubjectPinned: false },
    });
    assert.equal(d.source, "socket-peer");
  });

  it("gateway token: honoured only when verified", () => {
    assert.equal(proxyIsTrusted({ method: "gateway-token", gatewayTokenVerified: true }), true);
    assert.equal(proxyIsTrusted({ method: "gateway-token", gatewayTokenVerified: false }), false);
    assert.equal(proxyIsTrusted({ method: "gateway-token" }), false);
  });

  it("blank/whitespace X-Forwarded-For under a TRUSTED proxy → falls back to the peer, never \"\"", () => {
    const d = resolveClientAddress({
      socketPeer: "10.0.0.5", forwardedFor: "   ",
      proxy: { method: "mtls", mtlsClientCertVerified: true, mtlsSubjectPinned: true },
    });
    assert.equal(d.clientIp, "10.0.0.5");
    assert.equal(d.source, "socket-peer");
    assert.equal(d.proxyTrusted, true); // proxy IS trusted, but there is no usable forwarded value
  });

  it("method 'none' is never trusted regardless of other flags", () => {
    assert.equal(proxyIsTrusted({ method: "none", mtlsClientCertVerified: true, mtlsSubjectPinned: true }), false);
  });
});

describe("Test class — enumeration (RD-0326): probes must return UNIFORM denials (no differential)", () => {
  it("resource: not-found and forbidden are byte-identical (no object-existence oracle)", () => {
    const nf = uniformResourceResponse("not-found");
    const fb = uniformResourceResponse("forbidden");
    assert.deepEqual({ status: nf.status, code: nf.code }, { status: fb.status, code: fb.code });
    assert.equal(nf.authorized, false);
    assert.equal(fb.authorized, false);
    assert.equal(uniformResourceResponse("ok").authorized, true);
  });

  it("auth: user-unknown and bad-credentials are identical (no account-existence oracle)", () => {
    const uu = uniformAuthResponse("user-unknown");
    const bc = uniformAuthResponse("bad-credentials");
    assert.deepEqual({ status: uu.status, code: uu.code }, { status: bc.status, code: bc.code });
    assert.equal(uu.authenticated, false);
    assert.equal(uniformAuthResponse("ok").authenticated, true);
  });

  it("pagination is bounded: absent / hostile limits fail-closed to default or cap (no full-table walk)", () => {
    assert.equal(boundPageLimit(undefined).limit, SECURE_PAGINATION.defaultLimit);
    assert.equal(boundPageLimit(0).limit, SECURE_PAGINATION.defaultLimit);
    assert.equal(boundPageLimit(-5).limit, SECURE_PAGINATION.defaultLimit);
    assert.equal(boundPageLimit(Number.NaN).limit, SECURE_PAGINATION.defaultLimit);
    assert.equal(boundPageLimit(3.5).limit, SECURE_PAGINATION.defaultLimit); // non-integer
    const huge = boundPageLimit(1_000_000);
    assert.equal(huge.limit, SECURE_PAGINATION.maxLimit);
    assert.equal(huge.clamped, true);
    assert.deepEqual(boundPageLimit(50), { limit: 50, clamped: false, reason: "within-bounds" });
  });

  it("opaque-id: sequential/guessable ids are rejected, opaque tokens accepted", () => {
    assert.equal(isOpaqueId("1001"), false);              // sequential DB key
    assert.equal(isOpaqueId("42"), false);
    assert.equal(isOpaqueId("abc"), false);               // too short
    assert.equal(isOpaqueId("has spaces in it here"), false); // non-charset
    assert.equal(isOpaqueId("V1StGXR8_Z5jdHi6B-myT"), true);  // nanoid-style opaque token
    assert.equal(isOpaqueId("9f8c7b6a5e4d3c2b1a0f9e8d"), true); // 24-hex opaque (not pure-decimal)
  });
});
