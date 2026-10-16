import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  buildRouteRegistry,
  callStdlib,
  getResolverReport,
  parseProgram,
} from "../dist/index.js";
import { RateLimiter, startServer } from "../dist/route-dispatcher.js";

const ctx = {
  recordEffect: () => {},
  resolveIdentifier: () => undefined,
  callFlow: async () => ({}),
  applyFn: async () => ({}),
};
const str = (value) => ({ __tag: "string", value });

function ast(source) {
  return parseProgram(source, "security-closure.fungi").ast;
}

test("standalone routes refuse unsupported permission clauses", () => {
  assert.throws(
    () => buildRouteRegistry(ast('route GET "/admin" { flow admin permission role.admin }')),
    /permission.*not executable/i,
  );
});

test("route literal segments cannot inject regular-expression syntax", () => {
  const registry = buildRouteRegistry(ast('route GET "/files/a.+/{id}" { flow readFile }'));
  assert.ok(registry.match("GET", "/files/a.+/42") !== null);
  assert.equal(registry.match("GET", "/files/aaaa/42"), null);
});

test("standalone route server refuses malformed and over-depth JSON before execution and redacts faults", async () => {
  const program = ast(`secure flow x(request: Request) -> Response
contract {
  intent { "Secret-free JSON body probe." }
  effects {}
}
{
  return { outcome: "ok" }
}
route POST "/x" { flow x }`);
  let calls = 0;
  let mode = "ok";
  const running = await startServer(program, { port: 0 }, async () => {
    calls += 1;
    if (mode === "throw") throw new Error("secret compiler detail");
    return { __tag: "string", value: "ok" };
  });
  try {
    const malformed = await fetch(`http://127.0.0.1:${running.port}/x`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{bad",
    });
    assert.equal(malformed.status, 422);
    assert.equal(calls, 0);

    const nested = `${"[".repeat(80)}0${"]".repeat(80)}`;
    const deep = await fetch(`http://127.0.0.1:${running.port}/x`, {
      method: "POST", headers: { "content-type": "application/json" }, body: nested,
    });
    assert.equal(deep.status, 422);
    assert.equal(calls, 0);

    mode = "throw";
    const fault = await fetch(`http://127.0.0.1:${running.port}/x`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(fault.status, 500);
    assert.equal((await fault.text()).includes("secret compiler detail"), false);
  } finally {
    await running.close();
  }
});

test("standalone route server refuses non-loopback binding until an authenticated host owns exposure", async () => {
  const program = ast('route GET "/x" { flow x }');
  await assert.rejects(
    () => startServer(program, { port: 0, host: "0.0.0.0" }, async () => ({ __tag: "string", value: "no" })),
    /loopback|authenticated|external/i,
  );
});

test("compiler rate state has a hard identity capacity and reclaims expired entries", () => {
  let now = 1_000;
  const limiter = new RateLimiter(2, { capacity: 2, now: () => now });
  assert.equal(limiter.isAllowed("client-a"), true);
  assert.equal(limiter.isAllowed("client-b"), true);
  assert.equal(limiter.isAllowed("client-c"), false, "new identities refuse at the hard capacity");
  now += 60_001;
  assert.equal(limiter.isAllowed("client-c"), true, "expired identities are reclaimed before refusal");
});

test("the canonical JSON decoder refuses an over-depth value", async () => {
  const nested = `${"[".repeat(80)}0${"]".repeat(80)}`;
  const result = await callStdlib("json.decode", undefined, [str(nested)], ctx);
  assert.equal(result.__tag, "err");
  assert.match(result.error.value, /DecodeError/);
});

test("dynamic regex uses the certified non-backtracking engine and bounds subjects", async () => {
  const ambiguous = await callStdlib("matchesPattern", str(`${"a".repeat(20)}!`), [str("^(a|aa)+$")], ctx);
  assert.equal(ambiguous.__tag, "bool");
  assert.equal(ambiguous.value, false);
  const oversized = await callStdlib("matchesPattern", str("a".repeat(4097)), [str("^a+$")], ctx);
  assert.equal(oversized.__tag, "err");
  const excessive = await callStdlib(
    "matchesPattern",
    str("a".repeat(4096)),
    [str("(a?){500}z")],
    ctx,
  );
  assert.equal(excessive.__tag, "err");
  assert.match(excessive.error.value, /certificate|work|budget/i);
  const control = await callStdlib("matchesPattern", str("hello"), [str("^[a-z]+$")], ctx);
  assert.equal(control.__tag, "bool");
  assert.equal(control.value, true);
});

test("uncertified capture extraction and regex replacement refuse closed", async () => {
  const groups = await callStdlib("extractGroups", str("2024-03-15"), [str("(\\d{4})-(\\d{2})-(\\d{2})")], ctx);
  assert.equal(groups.__tag, "err");
  assert.match(groups.error.value, /capture|certified|unsupported/i);

  const replacement = await callStdlib("replacePattern", str("aaaa"), [str("a+"), str("x")], ctx);
  assert.equal(replacement.__tag, "err");
  assert.match(replacement.error.value, /literal|certified|unsupported/i);
});

test("raw environment allow-list cannot authorize metadata egress", async () => {
  const previous = process.env.GALERINA_EGRESS_ALLOWED_HOSTS;
  process.env.GALERINA_EGRESS_ALLOWED_HOSTS = "169.254.169.254";
  let dialled = false;
  try {
    const result = await callStdlib("http.get", undefined, [str("http://169.254.169.254/latest/meta-data")], {
      ...ctx,
      dial: async () => { dialled = true; return { status: 200, ok: true, location: null, bytes: new Uint8Array() }; },
    });
    assert.equal(result.__tag, "err");
    assert.equal(dialled, false);
  } finally {
    if (previous === undefined) delete process.env.GALERINA_EGRESS_ALLOWED_HOSTS;
    else process.env.GALERINA_EGRESS_ALLOWED_HOSTS = previous;
  }
});

test("default HTTP dial aborts a response above the hard byte cap", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/octet-stream" });
    res.end(Buffer.alloc(4 * 1024 * 1024 + 1));
  });
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const result = await callStdlib("http.get", undefined, [str(`http://127.0.0.1:${port}/`)], ctx);
    assert.equal(result.__tag, "err");
    assert.match(result.error.value, /response.*limit/i);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("resolver reports metadata as non-authorizing until bytes and signatures are verified", () => {
  const report = getResolverReport([{
    name: "forged", version: "1.0.0", hash: `sha256:${"a".repeat(64)}`, signature: "present",
  }], "2026-08-11T00:00:00.000Z");
  assert.equal(report.packages[0].trusted, false);
});
