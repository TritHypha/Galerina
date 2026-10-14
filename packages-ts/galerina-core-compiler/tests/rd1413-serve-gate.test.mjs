/**
 * Memory WU2: standalone compiler serve() must not reach a secret-requiring
 * handler without app-kernel gate 9.5. Synthetic fixtures only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, serve } from "../dist/index.js";
import { startServer } from "../dist/route-dispatcher.js";

const SECRET_FREE = `secure flow hello(request: Request) -> Response
contract {
  intent { "Secret-free loopback." }
  effects {}
}
{
  return { outcome: "hello" }
}
route GET "/hello" {
  request Request
  response Response
  flow hello
}`;

const AUTH_VERIFY = `secure flow inspect(request: Request) -> Response
contract {
  intent { "Inspect synthetic ciphertext size." }
  effects {}
}
{
  return { reached: true }
}
route POST "/auth/verify" {
  request Request
  response Response
  flow inspect
}`;

const SECRET_READ = `secure flow readSecret(request: Request) -> Response
contract {
  intent { "Declare a secret-read requirement." }
  effects { secret.read }
}
{
  return { reached: true }
}
route GET "/secret" {
  request Request
  response Response
  flow readSecret
}`;

const MIXED = `${SECRET_FREE}
${AUTH_VERIFY}`;

const FIXTURE_AUTH = `secure flow verifyPassword(request: Request) -> Response
contract {
  intent { "Synthetic fixture away from production /auth/verify." }
  effects { crypto.verify }
}
{
  return { outcome: "fixture" }
}
route POST "/__fixture/auth/verify" {
  request Request
  response Response
  flow verifyPassword
}`;

const GATE = /app-kernel gate 9\.5|secret-requiring and protected routes|secret effects/u;

async function assertServeRefuses(source, file, pattern) {
  let server;
  try {
    server = await serve(source, file, { port: 0 });
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), pattern);
    return;
  }
  await server.close();
  assert.fail(`${file}: serve opened a listener instead of refusing`);
}

describe("standalone serve() secret/protected gate", () => {
  it("refuses POST /auth/verify before opening a listener", async () => {
    await assertServeRefuses(AUTH_VERIFY, "auth-verify.fungi", /POST \/auth\/verify is reserved/u);
  });

  it("refuses a secret.read route before opening a listener", async () => {
    await assertServeRefuses(SECRET_READ, "secret-read.fungi", GATE);
  });

  it("refuses a mixed program that also binds POST /auth/verify", async () => {
    await assertServeRefuses(MIXED, "mixed-auth-verify.fungi", /POST \/auth\/verify is reserved/u);
  });

  it("still serves a secret-free route and reaches its handler", async () => {
    const server = await serve(SECRET_FREE, "secret-free.fungi", { port: 0 });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/hello`);
      const bodyText = await response.text();
      assert.equal(response.status, 200, bodyText);
      assert.equal(JSON.parse(bodyText).outcome, "hello");
    } finally {
      await server.close();
    }
  });

  it("still serves a crypto.verify fixture that is not POST /auth/verify", async () => {
    const server = await serve(FIXTURE_AUTH, "fixture-auth.fungi", { port: 0 });
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/__fixture/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(response.status, 200, await response.text());
    } finally {
      await server.close();
    }
  });

  it("startServer never invokes the executor for POST /auth/verify", async () => {
    const ast = parseProgram(AUTH_VERIFY, "auth-verify.fungi").ast;
    let calls = 0;
    await assert.rejects(
      () => startServer(ast, { port: 0 }, async () => {
        calls += 1;
        return { __tag: "string", value: "reached" };
      }),
      /POST \/auth\/verify is reserved/u,
    );
    assert.equal(calls, 0, "secret-requiring handler must not run without the kernel gate");
  });

  it("startServer still invokes the executor for a secret-free route", async () => {
    const ast = parseProgram(SECRET_FREE, "secret-free.fungi").ast;
    let calls = 0;
    const running = await startServer(ast, { port: 0 }, async () => {
      calls += 1;
      return { __tag: "ok", value: { __tag: "string", value: "ok" } };
    });
    try {
      const response = await fetch(`http://127.0.0.1:${running.port}/hello`);
      const bodyText = await response.text();
      assert.equal(response.status, 200, bodyText);
      assert.equal(calls, 1);
    } finally {
      await running.close();
    }
  });
});
