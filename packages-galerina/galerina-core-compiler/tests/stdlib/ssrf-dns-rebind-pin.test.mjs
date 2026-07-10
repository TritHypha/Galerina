// =============================================================================
// DNS-rebind pin regression (RD-0310 — live SSRF, DNS-rebinding TOCTOU)
//
// A hostname guard alone is TOCTOU-vulnerable: the name is validated at CHECK
// time, but a name-based fetch RE-RESOLVES at CONNECT time (public → private).
// networkAsync now resolves ONCE (ctx.resolveHost / node:dns), re-classifies
// EVERY resolved address (guardResolvedAddresses), and PINS the cleared
// addresses through connect (ctx.dial / node:http lookup locked to them).
//
// These tests drive both seams to prove:
//   (1) the validated address is threaded to the dial (the pin — no re-resolve),
//   (2) a rebind / mixed / failed resolution fails CLOSED with NO dial, and
//   (3) the default node:http transport performs a real request end-to-end.
// The guard is NOT part of the injectable surface: it always runs on whatever
// resolveHost returns, so injecting a resolver cannot smuggle a private answer past it.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { callStdlib } from "../../dist/index.js";

delete process.env.GALERINA_ALLOW_LOCALHOST;
delete process.env.NODE_ENV;
delete process.env.GALERINA_PROFILE;
delete process.env.GALERINA_EGRESS_ALLOWED_HOSTS;

const ctx = { recordEffect: () => {}, resolveIdentifier: () => undefined, callFlow: async () => ({}), applyFn: async () => ({}) };
const str = (value) => ({ __tag: "string", value });
const okResp = (body = "OK") => ({ status: 200, ok: true, location: null, bytes: new TextEncoder().encode(body) });

// A dial spy: records every (url, req) it is handed and returns a canned success.
function spyDial(response = okResp()) {
  const calls = [];
  const fn = async (url, req) => { calls.push({ url, req }); return response; };
  fn.calls = calls;
  return fn;
}

test("pins the check-time-validated IP through connect (the dial receives the resolved address)", async () => {
  const dial = spyDial();
  const r = await callStdlib("http.get", undefined, [str("https://pin.example.com/x")], {
    ...ctx, resolveHost: async () => ["93.184.216.34"], dial,
  });
  assert.equal(r.__tag, "ok", `expected ok, got ${JSON.stringify(r)}`);
  assert.equal(dial.calls.length, 1, "dial must be called exactly once");
  assert.deepEqual([...(dial.calls[0].req.pinnedIps ?? [])], ["93.184.216.34"],
    "dial MUST receive the validated address to pin the socket (this is the no-re-resolve guarantee)");
});

test("a rebinding resolution (public name → private IP) is denied BEFORE any dial", async () => {
  const dial = spyDial();
  const r = await callStdlib("http.get", undefined, [str("https://rebind.example.com/x")], {
    ...ctx, resolveHost: async () => ["10.0.0.5"], dial,
  });
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /SSRF/);
  assert.match(r.error?.value ?? "", /FUNGI-NET-001/);
  assert.equal(dial.calls.length, 0, "must NOT dial when the resolved address is non-public");
});

test("a MIXED resolution (one public, one private) is denied (no dial)", async () => {
  const dial = spyDial();
  const r = await callStdlib("http.get", undefined, [str("https://mixed.example.com/x")], {
    ...ctx, resolveHost: async () => ["93.184.216.34", "10.0.0.5"], dial,
  });
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /SSRF/);
  assert.equal(dial.calls.length, 0, "a single private address in the resolved set must deny the whole dial");
});

test("a resolution FAILURE fails closed (deny, no dial)", async () => {
  const dial = spyDial();
  const r = await callStdlib("http.get", undefined, [str("https://unresolvable.example.com/x")], {
    ...ctx, resolveHost: async () => { throw new Error("ENOTFOUND"); }, dial,
  });
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /DNS resolution failed|SSRF/);
  assert.equal(dial.calls.length, 0);
});

test("an injected resolver CANNOT bypass the guard — a metadata IP is still denied", async () => {
  const dial = spyDial();
  const r = await callStdlib("http.get", undefined, [str("https://sneaky.example.com/x")], {
    ...ctx, resolveHost: async () => ["169.254.169.254"], dial,
  });
  assert.equal(r.__tag, "err");
  assert.match(r.error?.value ?? "", /SSRF/);
  assert.equal(dial.calls.length, 0, "the guard re-classifies resolver output; an injected metadata IP must deny");
});

test("the default node:http dialer performs a real request end-to-end (loopback dev)", async () => {
  const server = createServer((_req, res) => { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("PINNED-DIAL-OK"); });
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  process.env.NODE_ENV = "development"; // opens the loopback-dev exception so http://127.0.0.1 is dialable
  try {
    // No ctx.dial → uses the REAL pinnedDial (node:http). 127.0.0.1 is a loopback literal (pin=null), so this
    // proves the transport itself works end-to-end after the fetch→node:http switch.
    const r = await callStdlib("http.get", undefined, [str(`http://127.0.0.1:${port}/`)], ctx);
    assert.equal(r.__tag, "ok", `expected ok, got ${JSON.stringify(r)}`);
    assert.equal(new TextDecoder().decode(r.value.value), "PINNED-DIAL-OK");
  } finally {
    delete process.env.NODE_ENV;
    await new Promise((resolve) => server.close(() => resolve(undefined)));
  }
});
