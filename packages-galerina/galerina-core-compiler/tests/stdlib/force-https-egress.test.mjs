// =============================================================================
// Force-HTTPS boot setting at the outbound dial (owner "force https on http").
//
// Default: plaintext PUBLIC http egress is DENIED (TLS required). An explicit operator opt-out
// (GALERINA_ALLOW_PLAINTEXT_EGRESS=true) relaxes it — but never relaxes the SSRF host guard.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { callStdlib } from "../../dist/index.js";

const ctx = { recordEffect: () => {}, resolveIdentifier: () => undefined, callFlow: async () => ({}), applyFn: async () => ({}) };
const str = (v) => ({ __tag: "string", value: v });
async function withFetch(fn, run) {
  const real = globalThis.fetch;
  globalThis.fetch = fn;
  try { return await run(); } finally { globalThis.fetch = real; }
}
const resp = (status, body = "OK") => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});

test("default (no env): plaintext PUBLIC http egress is denied (force-HTTPS)", async () => {
  delete process.env.GALERINA_ALLOW_PLAINTEXT_EGRESS;
  const r = await callStdlib("http.get", undefined, [str("http://example.com/x")], ctx);
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /TLS \(https\) required|TLS_REQUIRED/);
});

test("operator opt-out (=true): plaintext public http egress is permitted", async () => {
  process.env.GALERINA_ALLOW_PLAINTEXT_EGRESS = "true";
  try {
    const r = await withFetch(() => resp(200, "OK-PLAINTEXT"), () =>
      callStdlib("http.get", undefined, [str("http://example.com/x")], ctx));
    assert.equal(r.__tag, "ok", `expected ok, got ${JSON.stringify(r)}`);
  } finally {
    delete process.env.GALERINA_ALLOW_PLAINTEXT_EGRESS;
  }
});

test("the opt-out does NOT relax SSRF — an internal plaintext host is still denied", async () => {
  process.env.GALERINA_ALLOW_PLAINTEXT_EGRESS = "true";
  try {
    const r = await callStdlib("http.get", undefined, [str("http://169.254.169.254/latest/meta-data/")], ctx);
    assert.equal(r.__tag, "err");
    assert.match(r.error?.value ?? "", /SSRF/);
  } finally {
    delete process.env.GALERINA_ALLOW_PLAINTEXT_EGRESS;
  }
});

test("https on 443 is unaffected (the normal path still works)", async () => {
  delete process.env.GALERINA_ALLOW_PLAINTEXT_EGRESS;
  const r = await withFetch(() => resp(200, "OK-TLS"), () =>
    callStdlib("http.get", undefined, [str("https://example.com/x")], ctx));
  assert.equal(r.__tag, "ok", `expected ok, got ${JSON.stringify(r)}`);
});

// ── local-dev loopback exception ("be a bit smart and not block http://localhost") ──
const clearDev = () => { delete process.env.GALERINA_ALLOW_LOCALHOST; delete process.env.NODE_ENV; delete process.env.GALERINA_PROFILE; delete process.env.GALERINA_EGRESS_ALLOWED_HOSTS; };

test("local dev: http://localhost is ALLOWED with GALERINA_ALLOW_LOCALHOST=true", async () => {
  clearDev(); process.env.GALERINA_ALLOW_LOCALHOST = "true";
  try {
    const r = await withFetch(() => resp(200, "OK-LOCAL"), () =>
      callStdlib("http.get", undefined, [str("http://localhost:3000/api")], ctx));
    assert.equal(r.__tag, "ok", `expected ok, got ${JSON.stringify(r)}`);
  } finally { clearDev(); }
});

test("local dev: http://127.0.0.1 is ALLOWED when NODE_ENV=development", async () => {
  clearDev(); process.env.NODE_ENV = "development";
  try {
    const r = await withFetch(() => resp(200, "OK-LOCAL"), () =>
      callStdlib("http.get", undefined, [str("http://127.0.0.1:8080/")], ctx));
    assert.equal(r.__tag, "ok", `expected ok, got ${JSON.stringify(r)}`);
  } finally { clearDev(); }
});

test("fail-secure: with NO dev signal, http://localhost stays SSRF-denied", async () => {
  clearDev();
  const r = await callStdlib("http.get", undefined, [str("http://localhost:3000/")], ctx);
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /SSRF/);
});

test("production: localhost denied even with the dev flag (never open loopback in prod)", async () => {
  clearDev(); process.env.GALERINA_ALLOW_LOCALHOST = "true"; process.env.NODE_ENV = "production";
  try {
    const r = await callStdlib("http.get", undefined, [str("http://localhost:3000/")], ctx);
    assert.equal(r.__tag, "err");
    assert.match(r.error?.value ?? "", /SSRF/);
  } finally { clearDev(); }
});

test("loopback dev does NOT open metadata/private even with the dev signal", async () => {
  clearDev(); process.env.GALERINA_ALLOW_LOCALHOST = "true";
  try {
    for (const u of ["http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/"]) {
      const r = await callStdlib("http.get", undefined, [str(u)], ctx);
      assert.equal(r.__tag, "err", u);
      assert.match(r.error?.value ?? "", /SSRF/, u);
    }
  } finally { clearDev(); }
});

// ── internal egress proxy: "even in production we need to work with an internal proxy" ──
test("internal proxy: an allow-listed host works in PRODUCTION (http, odd port, internal)", async () => {
  clearDev();
  process.env.NODE_ENV = "production";
  process.env.GALERINA_EGRESS_ALLOWED_HOSTS = "proxy.internal";
  try {
    const r = await withFetch(() => resp(200, "OK-PROXY"), () =>
      callStdlib("http.get", undefined, [str("http://proxy.internal:8080/fetch")], ctx));
    assert.equal(r.__tag, "ok", `expected ok, got ${JSON.stringify(r)}`);
  } finally { clearDev(); delete process.env.GALERINA_EGRESS_ALLOWED_HOSTS; }
});

test("internal proxy: the allow-list opens ONLY the listed host (a sibling stays SSRF-denied)", async () => {
  clearDev();
  process.env.GALERINA_EGRESS_ALLOWED_HOSTS = "proxy.internal";
  try {
    const r = await callStdlib("http.get", undefined, [str("http://other.internal/")], ctx);
    assert.equal(r.__tag, "err");
    assert.match(r.error?.value ?? "", /SSRF/);
  } finally { delete process.env.GALERINA_EGRESS_ALLOWED_HOSTS; }
});

// ── allow-list AUDIT (security follow-up to b6033e1): the SSRF/force-HTTPS bypass leaves a trail ──
async function withStderr(run) {
  const real = process.stderr.write.bind(process.stderr);
  const lines = [];
  process.stderr.write = (s) => { lines.push(String(s)); return true; };
  try { await run(); } finally { process.stderr.write = real; }
  return lines.join("");
}

test("allow-list audit: an admitted bypass host is logged to the audit trail (stderr)", async () => {
  clearDev();
  process.env.NODE_ENV = "production";
  process.env.GALERINA_EGRESS_ALLOWED_HOSTS = "audit-a.internal";
  try {
    const out = await withStderr(() => withFetch(() => resp(200, "OK"), () =>
      callStdlib("http.get", undefined, [str("http://audit-a.internal:8080/x")], ctx)));
    assert.match(out, /galerina:egress-audit/);
    assert.match(out, /audit-a\.internal/);
    assert.match(out, /GALERINA_EGRESS_ALLOWED_HOSTS/);
  } finally { clearDev(); }
});

test("allow-list audit: a normal public host is NOT audited (only the bypass leaves a trail)", async () => {
  clearDev();
  const out = await withStderr(() => withFetch(() => resp(200, "OK"), () =>
    callStdlib("http.get", undefined, [str("https://normal-not-audited.example.com/x")], ctx)));
  assert.doesNotMatch(out, /egress-audit/);
});

test("allow-list audit: repeated dials of the same host log once per process (deduped)", async () => {
  clearDev();
  process.env.GALERINA_EGRESS_ALLOWED_HOSTS = "audit-dedupe.internal";
  try {
    const out = await withStderr(() => withFetch(() => resp(200, "OK"), async () => {
      await callStdlib("http.get", undefined, [str("http://audit-dedupe.internal/1")], ctx);
      await callStdlib("http.get", undefined, [str("http://audit-dedupe.internal/2")], ctx);
    }));
    const hits = (out.match(/audit-dedupe\.internal/g) ?? []).length;
    assert.equal(hits, 1, `expected exactly one audit line, got ${hits}`);
  } finally { clearDev(); }
});
