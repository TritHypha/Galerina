import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRouteRegistry, parseProgram, serve } from "../dist/index.js";

const SOURCE = `secure flow accept(request: Request) -> Response
contract {
  intent { "Bound request bytes before route execution." }
  limits { max request size 16 bytes }
  effects {}
}
{
  return { outcome: "accepted" }
}
route POST "/limited" {
  request Request
  response Response
  flow accept
}`;

const MULTI_ROUTE_SOURCE = `secure flow narrow(request: Request) -> Response
contract { intent { "Narrow route cap." } limits { max request size 8 bytes } effects {} }
{ return { outcome: "narrow" } }
secure flow wide(request: Request) -> Response
contract { intent { "Wide route cap." } limits { max request size 16 bytes } effects {} }
{ return { outcome: "wide" } }
route POST "/narrow" { request Request response Response flow narrow }
route POST "/wide" { request Request response Response flow wide }`;

const RAW_BODY_SOURCE = `secure flow inspectCiphertext(request: Request) -> Response
contract {
  intent { "Inspect only the size of synthetic ciphertext bytes." }
  limits { max request size 16 bytes }
  effects {}
}
{
  return {
    receivedBytes: request.rawBody.length(),
    receivedHex: request.rawBody.toHex(),
  }
}
route POST "/auth/verify" {
  request Request
  response Response
  flow inspectCiphertext
}`;

const AMBIGUOUS_AUTH_VERIFY_SOURCE = `secure flow genericAuth(request: Request) -> Response
contract { intent { "Generic auth route." } limits { max request size 16 bytes } effects {} }
{ return { value: request.jsonBody.value } }
route POST "/auth/{operation}" { request Request response Response flow genericAuth }`;

const AUTH_VERIFY_TEST_FLOW = `secure flow genericAuth(request: Request) -> Response
contract { intent { "Route ownership regression test." } limits { max request size 16 bytes } effects {} }
{ return { outcome: "test" } }`;

function authVerifyRouteSource(bindings) {
  const routes = bindings.map(({ method, path }) =>
    `route ${method} "${path}" { request Request response Response flow genericAuth }`,
  );
  return `${AUTH_VERIFY_TEST_FLOW}\n${routes.join("\n")}`;
}

async function assertServeRefuses(
  source,
  config,
  label,
  expectedError = /maxBodyBytes must be a positive safe integer|invalid or duplicate request-size contract|FUNGI-PARSE-001/u,
) {
  let server;
  try {
    server = await serve(source, "route-request-size.fungi", config);
  } catch (error) {
    assert.match(String(error), expectedError, label);
    return;
  }
  if (server !== undefined) await server.close();
  assert.fail(`${label}: serve unexpectedly opened a listener`);
}

describe("route contract request-size limit", () => {
  let server;

  before(async () => {
    server = await serve(SOURCE, "route-request-size.fungi", {
      port: 0,
      maxBodyBytes: 1024,
    });
  });

  after(async () => {
    if (server !== undefined) await server.close();
  });

  it("accepts the exact contract limit", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/limited`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "1234567890abcdef",
    });
    assert.equal(response.status, 200, await response.text());
  });

  it("rejects a request over the flow limit before dispatch", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/limited`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "1234567890abcdefX",
    });
    const body = await response.json();
    assert.equal(response.status, 413, JSON.stringify(body));
    assert.deepEqual(body, { error: "Request body too large" });
  });

  it("counts UTF-8 wire bytes rather than Unicode characters", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/limited`, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: "é".repeat(9),
    });
    assert.equal(response.status, 413, "nine two-byte characters exceed the 16-byte cap");
  });

  it("does not widen a stricter server-wide body cap", async () => {
    const strictServer = await serve(SOURCE, "route-request-size.fungi", {
      port: 0,
      maxBodyBytes: 8,
    });
    try {
      const response = await fetch(`http://127.0.0.1:${strictServer.port}/limited`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "123456789",
      });
      assert.equal(response.status, 413);
    } finally {
      await strictServer.close();
    }
  });

  it("keeps distinct route flows bound to their own request ceilings", async () => {
    const multiServer = await serve(MULTI_ROUTE_SOURCE, "route-request-size.fungi", { port: 0 });
    try {
      const narrow = await fetch(`http://127.0.0.1:${multiServer.port}/narrow`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "123456789",
      });
      const wide = await fetch(`http://127.0.0.1:${multiServer.port}/wide`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "123456789",
      });
      assert.equal(narrow.status, 413);
      assert.equal(wide.status, 200);
    } finally {
      await multiServer.close();
    }
  });

  it("accepts a request-size limit alongside other recognized limit kinds", async () => {
    const source = SOURCE.replace(
      "limits { max request size 16 bytes }",
      "limits { max request size 16 bytes\n    max batch size 100\n    max memory 256 MB\n    max prompt 4096 chars }",
    );
    const siblingLimitServer = await serve(source, "route-request-size.fungi", { port: 0 });
    try {
      const response = await fetch(`http://127.0.0.1:${siblingLimitServer.port}/limited`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "12345678901234567",
      });
      assert.equal(response.status, 413);
    } finally {
      await siblingLimitServer.close();
    }
  });

  it("refuses an invalid global body cap before opening a listener", async () => {
    await assertServeRefuses(SOURCE, { port: 0, maxBodyBytes: Number.NaN }, "NaN global cap");
  });

  it("refuses malformed and duplicate Fungi request-size declarations", async () => {
    const cases = [
      ["missing unit", SOURCE.replace("max request size 16 bytes", "max request size 16")],
      ["missing size keyword", SOURCE.replace("max request size 16 bytes", "max request 16 bytes")],
      ["missing separator before number", SOURCE.replace("max request size 16 bytes", "max request size16 bytes")],
      ["pluralized size keyword", SOURCE.replace("max request size 16 bytes", "max request sizes 16 bytes")],
      ["underscore typo", SOURCE.replace("max request size 16 bytes", "max request_size 16 bytes")],
      ["camel-case typo", SOURCE.replace("max request size 16 bytes", "max requestSize 16 bytes")],
      ["pluralized request typo", SOURCE.replace("max request size 16 bytes", "max requests sizes 16 bytes")],
      ["quoted declaration", SOURCE.replace("max request size 16 bytes", '"max request size 16 bytes"')],
      ["numeric-only declaration", SOURCE.replace("max request size 16 bytes", "16")],
      ["quoted declaration alongside valid cap", SOURCE.replace(
        "max request size 16 bytes",
        'max request size 16 bytes\n    "max batch size 100"',
      )],
      ["numeric-only declaration alongside valid cap", SOURCE.replace(
        "max request size 16 bytes",
        "max request size 16 bytes\n    100",
      )],
      ["nested exposes declaration", SOURCE.replace(
        "max request size 16 bytes",
        'exposes { "max request size 16 bytes" }',
      )],
      ["bare emits declaration", SOURCE.replace("max request size 16 bytes", "emits")],
      ["bare denies declaration", SOURCE.replace("max request size 16 bytes", "denies")],
      ["nested malformed declaration alongside valid cap", SOURCE.replace(
        "limits { max request size 16 bytes }",
        'limits { max request size 16 bytes\n    exposes { "max request size 16 bytes" } }',
      )],
      ["missing limits braces", SOURCE.replace(
        "limits { max request size 16 bytes }",
        "limits max request size 16 bytes",
      )],
      ["missing limits braces alongside valid cap", SOURCE.replace(
        "limits { max request size 16 bytes }",
        "limits max request size 16 bytes\n    max batch size 100",
      )],
      ["duplicate declaration", SOURCE.replace(
        "max request size 16 bytes",
        "max request size 16 bytes\n    max request size 32 bytes",
      )],
      ["duplicate limits section", SOURCE.replace(
        "limits { max request size 16 bytes }",
        "limits { max request size 16 bytes }\n  limits { max request size 32 bytes }",
      )],
    ];

    for (const [label, source] of cases) {
      await assertServeRefuses(source, { port: 0 }, label);
    }
  });
});

describe("POST /auth/verify reserved on standalone serve", () => {
  const reserved = /POST \/auth\/verify/u;

  it("refuses to open a listener for an exact POST /auth/verify route", async () => {
    await assertServeRefuses(RAW_BODY_SOURCE, { port: 0, maxBodyBytes: 1024 }, "exact /auth/verify", reserved);
  });

  it("matches only the exact raw path in the route registry", () => {
    const program = parseProgram(RAW_BODY_SOURCE, "auth-verify-raw-body.fungi");
    const registry = buildRouteRegistry(program.ast);
    assert.ok(registry.match("POST", "/auth/verify") !== null);
    assert.ok(registry.match("POST", "/auth/verify?request=one") !== null);
    for (const path of [
      "/auth/verify/",
      "//auth/verify",
      "/%61uth/verify",
      "/auth/verify/extra",
      "/:operation/verify",
    ]) {
      assert.equal(registry.match("POST", path), null, `unexpected route match for raw path ${path}`);
    }
  });

  it("refuses a generic POST route that also claims the protected endpoint", async () => {
    await assertServeRefuses(
      AMBIGUOUS_AUTH_VERIFY_SOURCE,
      { port: 0 },
      "generic POST claims /auth/verify",
      reserved,
    );
  });

  it("refuses every overlapping POST route shape regardless of declaration order", async () => {
    const refusedBindings = [
      [
        { method: "POST", path: "/auth/{operation}" },
        { method: "POST", path: "/auth/verify" },
      ],
      [
        { method: "POST", path: "/auth/verify" },
        { method: "POST", path: "/auth/{operation}" },
      ],
      [
        { method: "POST", path: "/auth/verify" },
        { method: "POST", path: "/auth/verify" },
      ],
      [{ method: "POST", path: "/{resource}/{operation}" }],
      [{ method: "POST", path: "/auth/{prefix}fy" }],
      [{ method: "POST", path: "/auth/verify" }],
    ];

    for (const bindings of refusedBindings) {
      await assertServeRefuses(
        authVerifyRouteSource(bindings),
        { port: 0 },
        `overlapping bindings: ${bindings.map(({ path }) => path).join(", ")}`,
        reserved,
      );
    }
  });

  it("allows non-overlapping or other-method templates", async () => {
    const allowedBindings = [
      [{ method: "POST", path: "/auth/{operation}/details" }],
      [{ method: "GET", path: "/auth/{operation}" }],
    ];

    for (const bindings of allowedBindings) {
      const allowedServer = await serve(authVerifyRouteSource(bindings), "auth-verify-route-control.fungi", { port: 0 });
      await allowedServer.close();
    }
  });
});
