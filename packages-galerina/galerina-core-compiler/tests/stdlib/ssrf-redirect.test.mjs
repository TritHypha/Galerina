// =============================================================================
// SSRF redirect-follow defence (DevSecOps pentest finding, CRITICAL)
//
// The egress guard ran once on the original URL, but fetch defaults to
// redirect:"follow" — so a guard-approved PUBLIC url returning
// `302 Location: http://169.254.169.254/` was transparently followed to the
// metadata/internal host, un-re-checked. The fix sets redirect:"manual" and
// re-guards every Location with a hop cap. These tests monkeypatch global.fetch
// to simulate redirects (no real network).
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { callStdlib } from "../../dist/index.js";

const ctx = { recordEffect: () => {}, resolveIdentifier: () => undefined, callFlow: async () => ({}), applyFn: async () => ({}) };
const str = (value) => ({ __tag: "string", value });

async function withFetch(fn, run) {
  const real = globalThis.fetch;
  globalThis.fetch = fn;
  try { return await run(); } finally { globalThis.fetch = real; }
}
const resp = (status, location, body = "") => ({
  status, ok: status >= 200 && status < 300,
  headers: { get: (k) => (k.toLowerCase() === "location" ? location : null) },
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});

// 8.8.8.8 is a public literal IP — guard-approved, no DNS recheck — so the ONLY thing under test is the
// redirect re-guard (the original URL passes; the redirect target is what must be re-checked).
const PUBLIC = "http://8.8.8.8/feed";

test("a 302 redirect to a loopback host is BLOCKED (not followed)", async () => {
  const r = await withFetch(() => resp(302, "http://127.0.0.1:9/secret"), () =>
    callStdlib("http.get", undefined, [str(PUBLIC)], ctx));
  assert.equal(r.__tag, "err", "must not follow the redirect to loopback");
  assert.match(r.error?.value ?? "", /SSRF/);
});

test("a 302 redirect to the cloud-metadata endpoint is BLOCKED", async () => {
  const r = await withFetch(() => resp(302, "http://169.254.169.254/latest/meta-data/"), () =>
    callStdlib("http.get", undefined, [str(PUBLIC)], ctx));
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /SSRF/);
});

test("a relative redirect resolving to a private host is BLOCKED", async () => {
  // 10.0.0.5 via an absolute Location; a relative Location is resolved against the current URL.
  const r = await withFetch(() => resp(301, "http://10.0.0.5/internal"), () =>
    callStdlib("http.get", undefined, [str(PUBLIC)], ctx));
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /SSRF/);
});

test("a redirect chain that stays public eventually returns the body", async () => {
  let n = 0;
  const r = await withFetch(() => (n++ === 0 ? resp(302, "http://1.1.1.1/next") : resp(200, null, "OK-PUBLIC")), () =>
    callStdlib("http.get", undefined, [str(PUBLIC)], ctx));
  assert.equal(r.__tag, "ok", `a public→public redirect should succeed, got: ${JSON.stringify(r.value)}`);
});

test("an infinite redirect loop is capped (does not hang)", async () => {
  const r = await withFetch(() => resp(302, "http://2.2.2.2/loop"), () =>
    callStdlib("http.get", undefined, [str(PUBLIC)], ctx));
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /too many redirects/i);
});
