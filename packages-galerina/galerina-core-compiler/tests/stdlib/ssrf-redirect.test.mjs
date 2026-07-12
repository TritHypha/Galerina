// =============================================================================
// SSRF redirect-follow defence (DevSecOps pentest finding, CRITICAL)
//
// The egress guard runs on the original URL AND re-runs on every redirect
// Location — a guard-approved PUBLIC url returning
// `302 Location: http://169.254.169.254/` must NOT be transparently followed to
// the metadata/internal host. The dispatcher follows redirects manually and
// re-guards every Location with a hop cap.
//
// http.* dials through an injectable `ctx.dial` seam (node:http/https in
// production, connect pinned to the guard-cleared IP). These tests inject a fake
// dial to simulate redirects/responses with NO real network — the SSRF guard and
// redirect re-guard run for real AROUND the fake transport.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { callStdlib } from "../../dist/index.js";

// Redirect re-guard is asserted in the SECURE baseline — clear any ambient local-dev loopback signal so the
// internal redirect TARGETS (loopback/private/metadata) stay denied regardless of the runner's environment.
delete process.env.GALERINA_ALLOW_LOCALHOST;
delete process.env.NODE_ENV;
delete process.env.GALERINA_PROFILE;

const ctx = { recordEffect: () => {}, resolveIdentifier: () => undefined, callFlow: async () => ({}), applyFn: async () => ({}) };
const str = (value) => ({ __tag: "string", value });

// A fake transport: ONE NetDialResponse per dial call ({ status, ok, location, bytes }).
const dresp = (status, location = null, body = "") => ({
  status, ok: status >= 200 && status < 300, location, bytes: new TextEncoder().encode(body),
});
const getPinned = (url, dial) => callStdlib("http.get", undefined, [str(url)], { ...ctx, dial });

// 8.8.8.8 is a public literal IP — guard-approved, no DNS recheck/pin — so the ONLY thing under test is the
// redirect re-guard (the original URL passes; the redirect target is what must be re-checked). https so it
// satisfies the fail-secure dial posture (requireTls); the internal redirect TARGETS below stay http to
// prove a plaintext internal redirect is still blocked by host-category denial (which runs before the TLS check).
const PUBLIC = "https://8.8.8.8/feed";

test("a 302 redirect to a loopback host is BLOCKED (not followed)", async () => {
  const r = await getPinned(PUBLIC, () => dresp(302, "http://127.0.0.1:9/secret"));
  assert.equal(r.__tag, "err", "must not follow the redirect to loopback");
  assert.match(r.error?.value ?? "", /SSRF/);
});

test("a 302 redirect to the cloud-metadata endpoint is BLOCKED", async () => {
  const r = await getPinned(PUBLIC, () => dresp(302, "http://169.254.169.254/latest/meta-data/"));
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /SSRF/);
});

test("a redirect resolving to a private host is BLOCKED", async () => {
  const r = await getPinned(PUBLIC, () => dresp(301, "http://10.0.0.5/internal"));
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /SSRF/);
});

test("a redirect chain that stays public eventually returns the body", async () => {
  let n = 0;
  const r = await getPinned(PUBLIC, () => (n++ === 0 ? dresp(302, "https://1.1.1.1/next") : dresp(200, null, "OK-PUBLIC")));
  assert.equal(r.__tag, "ok", `a public→public redirect should succeed, got: ${JSON.stringify(r.value)}`);
});

test("an infinite redirect loop is capped (does not hang)", async () => {
  const r = await getPinned(PUBLIC, () => dresp(302, "https://2.2.2.2/loop"));
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /too many redirects/i);
});
