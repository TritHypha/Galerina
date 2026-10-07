import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { serve } from "../dist/index.js";

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

async function assertServeRefuses(source, config, label) {
  let server;
  try {
    server = await serve(source, "route-request-size.fungi", config);
  } catch (error) {
    assert.match(String(error), /maxBodyBytes must be a positive safe integer|invalid or duplicate request-size contract|FUNGI-PARSE-001/u, label);
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
