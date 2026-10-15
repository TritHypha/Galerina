/**
 * Memory WU2: standalone compiler serve() must not reach a secret-requiring
 * handler without app-kernel gate 9.5. Synthetic fixtures only.
 */
import assert from "node:assert/strict";
import http from "node:http";
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

const GATE = /app-kernel gate 9\.5|secret-requiring and protected routes|secret-bearing effect|secrets block|unrecognised effect|deny-only effect|secret effects/u;
const LISTENER_REFUSED = /cannot serve|refuses secret|secret-bearing effect|secrets block|unrecognised effect|deny-only effect|POST \/auth\/verify|secret requirement unknown/u;

// effects { vault.read } — canonical, cited from effect-checker.ts CANONICAL_EFFECTS.
const VAULT_READ = `secure flow readVault(request: Request) -> Response
contract {
  intent { "Declare vault.read, the governed cross-flow channel." }
  effects { vault.read }
}
{
  return { reached: true }
}
route GET "/vault-read" {
  request Request
  response Response
  flow readVault
}`;

// effects { vault.write } — canonical, cited from effect-checker.ts CANONICAL_EFFECTS.
const VAULT_WRITE = `secure flow writeVault(request: Request) -> Response
contract {
  intent { "Declare vault.write, the governed cross-flow channel." }
  effects { vault.write }
}
{
  return { reached: true }
}
route POST "/vault-write" {
  request Request
  response Response
  flow writeVault
}`;

// Secrets.get infers secret.read — stdlib-registry.ts STDLIB_CAPABILITY_MAP and
// effect-checker.ts EFFECT_REGISTRY. Call shape from tests/value-state-secret-source-precision.test.mjs.
const SECRETS_GET = `secure flow fetchSecret(request: Request) -> Response
contract {
  intent { "Call Secrets.get so secret.read is inferred." }
  effects {}
}
{
  let value = Secrets.get("k")
  return { reached: true }
}
route GET "/secrets-get" {
  request Request
  response Response
  flow fetchSecret
}`;

// env.secret infers secret.read — stdlib-registry.ts and tests/domain-security.test.mjs.
const ENV_SECRET = `secure flow readEnvSecret(request: Request) -> Response
contract {
  intent { "Call env.secret so secret.read is inferred." }
  effects {}
}
{
  let apiKey = env.secret("API_KEY")
  return { reached: true }
}
route GET "/env-secret" {
  request Request
  response Response
  flow readEnvSecret
}`;

// contract secrets { credential ... } with no secret effect names —
// tests/secrets-body-retention-110.test.mjs and tests/contract-secrets-epilogue.test.mjs.
const SECRETS_BLOCK = `secure flow charge(request: Request) -> Response
contract {
  intent { "Sealed credential block with secret-free effect names." }
  effects { database.write }
  secrets {
    credential db { provider vault path "secret/data/db" }
    rotation { interval 24h on_rotation_fault halt }
  }
}
{
  return { reached: true }
}
route POST "/charge" {
  request Request
  response Response
  flow charge
}`;

// Unrecognised effect — effect-checker.ts validateDeclaredEffectNames FUNGI-EFFECT-004
// ("totally.fake.effect" is the file's own unknown-name example).
const UNRECOGNISED = `secure flow unknownEffect(request: Request) -> Response
contract {
  intent { "Declare an unrecognised effect name." }
  effects { totally.fake.effect }
}
{
  return { reached: true }
}
route GET "/unknown-effect" {
  request Request
  response Response
  flow unknownEffect
}`;

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

async function assertStartServerRefuses(source, file, pattern) {
  const ast = parseProgram(source, file).ast;
  let calls = 0;
  await assert.rejects(
    () => startServer(ast, { port: 0 }, async () => {
      calls += 1;
      return { __tag: "string", value: "reached" };
    }),
    pattern,
  );
  assert.equal(calls, 0, `${file}: secret-requiring handler must not run without the kernel gate`);
}

describe("standalone serve() addendum-01 fail-closed classifier", () => {
  it("refuses effects { vault.read } before opening a listener", async () => {
    await assertServeRefuses(VAULT_READ, "vault-read.fungi", GATE);
    await assertStartServerRefuses(VAULT_READ, "vault-read.fungi", GATE);
  });

  it("refuses effects { vault.write } before opening a listener", async () => {
    await assertServeRefuses(VAULT_WRITE, "vault-write.fungi", GATE);
    await assertStartServerRefuses(VAULT_WRITE, "vault-write.fungi", GATE);
  });

  it("refuses a flow that calls Secrets.get (inferred secret.read)", async () => {
    await assertServeRefuses(SECRETS_GET, "secrets-get.fungi", LISTENER_REFUSED);
    await assertStartServerRefuses(SECRETS_GET, "secrets-get.fungi", GATE);
  });

  it("refuses a flow that calls env.secret (inferred secret.read)", async () => {
    await assertServeRefuses(ENV_SECRET, "env-secret.fungi", LISTENER_REFUSED);
    await assertStartServerRefuses(ENV_SECRET, "env-secret.fungi", GATE);
  });

  it("refuses a contract secrets { credential ... } block with no secret effect names", async () => {
    await assertServeRefuses(SECRETS_BLOCK, "secrets-block.fungi", GATE);
    await assertStartServerRefuses(SECRETS_BLOCK, "secrets-block.fungi", GATE);
  });

  it("refuses an unrecognised effect name before opening a listener", async () => {
    await assertServeRefuses(UNRECOGNISED, "unrecognised.fungi", LISTENER_REFUSED);
    await assertStartServerRefuses(UNRECOGNISED, "unrecognised.fungi", GATE);
  });
});

function secretFreeDeclaredRoute(method, path) {
  return `secure flow genericAuth(request: Request) -> Response
contract {
  intent { "Secret-free loopback." }
  effects {}
}
{
  return { outcome: "handler-ran" }
}
route ${method} "${path}" {
  request Request
  response Response
  flow genericAuth
}`;
}

async function withListenCount(run) {
  const original = http.Server.prototype.listen;
  let calls = 0;
  http.Server.prototype.listen = function (...args) {
    calls += 1;
    return original.apply(this, args);
  };
  try {
    await run();
    return calls;
  } finally {
    http.Server.prototype.listen = original;
  }
}

const NESTED_SECRETS_GET = `secure flow readSecret(request: Request) -> Response
contract { intent { "Nested." } effects {} }
{
  fn hidden() -> String { return Secrets.get("SUPERSECRETPLANTEDVALUE") }
  return { outcome: hidden() }
}
route POST "/x" {
  request Request
  response Response
  flow readSecret
}`;

const CALLEE_FLOW_SECRETS_GET = `secure flow helper(request: Request) -> Response
contract { intent { "Sibling callee." } effects {} }
{
  return { outcome: Secrets.get("SUPERSECRETPLANTEDVALUE") }
}
secure flow readSecret(request: Request) -> Response
contract { intent { "Route calls sibling." } effects {} }
{
  return helper()
}
route POST "/x" {
  request Request
  response Response
  flow readSecret
}`;

const MODULE_FN_SECRETS_GET = `fn hidden() -> String { return Secrets.get("SUPERSECRETPLANTEDVALUE") }
secure flow readSecret(request: Request) -> Response
contract { intent { "Route calls module fn." } effects {} }
{
  return { outcome: hidden() }
}
route POST "/x" {
  request Request
  response Response
  flow readSecret
}`;

describe("WU2 fix-01 normalised /auth/verify identity (F1) and nested-fn startServer fence (F2)", () => {
  const bypasses = [
    ["POST", "/auth/verify/"],
    ["POST", "/Auth/Verify"],
    ["POST", "/AUTH/VERIFY"],
    ["POST", "/auth/%76erify"],
    ["GET", "/auth/verify"],
    ["PUT", "/auth/verify"],
  ];

  for (const [method, path] of bypasses) {
    it(`refuses ${method} ${path} before listen`, async () => {
      const calls = await withListenCount(async () => {
        await assertServeRefuses(
          secretFreeDeclaredRoute(method, path),
          `auth-verify-bypass-${method}-${path.replaceAll("/", "_")}.fungi`,
          /reserved|gate 9\.5/u,
        );
      });
      assert.equal(calls, 0, `${method} ${path} must not call listen`);
    });
  }

  it("startServer refuses nested fn Secrets.get before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(NESTED_SECRETS_GET, "nested-fn-secrets-get.fungi", GATE);
      await assertServeRefuses(NESTED_SECRETS_GET, "nested-fn-secrets-get.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "nested fn Secrets.get must not call listen");
  });
});

describe("WU2 fix-02 startServer callee-flow and module-level helper fence", () => {
  it("startServer refuses sibling-flow Secrets.get before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(CALLEE_FLOW_SECRETS_GET, "callee-flow-secrets-get.fungi", GATE);
    });
    assert.equal(calls, 0, "callee-flow Secrets.get must not call listen");
  });

  it("startServer refuses module-level fn Secrets.get before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(MODULE_FN_SECRETS_GET, "module-fn-secrets-get.fungi", GATE);
    });
    assert.equal(calls, 0, "module-level fn Secrets.get must not call listen");
  });
});

const CONTRACT = (intent) => `contract { intent { "${intent}" } effects {} }`;
const POST_X = `route POST "/x" {
  request Request
  response Response
  flow readSecret
}`;

const P1_MODULE_FN_WITH_ARG = `fn hidden(k: String) -> String { return Secrets.get(k) }
secure flow readSecret(request: Request) -> Response
${CONTRACT("p1")}
{
  return { outcome: hidden("SUPERSECRETPLANTEDVALUE") }
}
${POST_X}`;

const P5_UNKNOWN_CALL_WITH_ARG = `secure flow readSecret(request: Request) -> Response
${CONTRACT("p5")}
{
  return { outcome: mystery("SUPERSECRETPLANTEDVALUE") }
}
${POST_X}`;

const P6_SECRETFREE_SIBLING_WITH_ARG = `secure flow helper(request: Request) -> Response
${CONTRACT("p6h")}
{
  return { outcome: "ok" }
}
secure flow readSecret(request: Request) -> Response
${CONTRACT("p6")}
{
  return helper(request)
}
${POST_X}`;

const P7_ALIAS_OF_SIBLING = `secure flow helper(request: Request) -> Response
${CONTRACT("p7h")}
{
  return { outcome: Secrets.get("SUPERSECRETPLANTEDVALUE") }
}
secure flow readSecret(request: Request) -> Response
${CONTRACT("p7")}
{
  let f = helper
  return f(request)
}
${POST_X}`;

const P8_STEP_HELPER = `secure flow helper(request: Request) -> Response
${CONTRACT("p8h")}
{
  return { outcome: Secrets.get("SUPERSECRETPLANTEDVALUE") }
}
secure flow readSecret(request: Request) -> Response
${CONTRACT("p8")}
{
  return step helper(request)
}
${POST_X}`;

describe("WU2 fix-03 startServer argument-bearing, step, and alias fence", () => {
  it("P1 startServer refuses module-level fn with args before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(P1_MODULE_FN_WITH_ARG, "p1-module-fn-arg.fungi", GATE);
      await assertServeRefuses(P1_MODULE_FN_WITH_ARG, "p1-module-fn-arg.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "P1 must not call listen");
  });

  it("P5 startServer refuses unknown call with args before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(P5_UNKNOWN_CALL_WITH_ARG, "p5-unknown-arg.fungi", GATE);
      await assertServeRefuses(P5_UNKNOWN_CALL_WITH_ARG, "p5-unknown-arg.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "P5 must not call listen");
  });

  it("P6 startServer still listens for a secret-free sibling called with args", async () => {
    const ast = parseProgram(P6_SECRETFREE_SIBLING_WITH_ARG, "p6-secretfree-sibling.fungi").ast;
    const calls = await withListenCount(async () => {
      const running = await startServer(ast, { port: 0 }, async () => {
        return { __tag: "ok", value: { __tag: "string", value: "ok" } };
      });
      await running.close();
    });
    assert.equal(calls, 1, "P6 secret-free sibling with args must listen");
  });

  it("P7 startServer refuses alias of sibling Secrets.get before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(P7_ALIAS_OF_SIBLING, "p7-alias-sibling.fungi", GATE);
      await assertServeRefuses(P7_ALIAS_OF_SIBLING, "p7-alias-sibling.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "P7 must not call listen");
  });

  it("P8 startServer refuses step helper Secrets.get before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(P8_STEP_HELPER, "p8-step-helper.fungi", GATE);
      await assertServeRefuses(P8_STEP_HELPER, "p8-step-helper.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "P8 must not call listen");
  });
});

const R3_OK_HIDDEN = `fn hidden(k: String) -> String { return Secrets.get(k) }
secure flow readSecret(request: Request) -> Response
${CONTRACT("r3ok")}
{
  return Ok(hidden("SUPERSECRETPLANTEDVALUE"))
}
${POST_X}`;

const R3_REDACT_MYSTERY = `secure flow readSecret(request: Request) -> Response
${CONTRACT("r3rm")}
{
  return redact(mystery(request))
}
${POST_X}`;

const R3_OK_STEP_HELPER = `secure flow helper(request: Request) -> Response
${CONTRACT("r3h")}
{
  return { outcome: Secrets.get("SUPERSECRETPLANTEDVALUE") }
}
secure flow readSecret(request: Request) -> Response
${CONTRACT("r3okstep")}
{
  return Ok(step helper(request))
}
${POST_X}`;

const R4_SHADOW_REDACT = `secure flow readSecret(request: Request) -> Response
${CONTRACT("r4")}
{
  fn redact(request: Request) -> Response {
    return { outcome: Secrets.get("SUPERSECRETPLANTEDVALUE") }
  }
  return redact(request)
}
${POST_X}`;

const SECRET_FREE_OK = `secure flow hello(request: Request) -> Response
${CONTRACT("okfree")}
{
  return Ok({ outcome: "ok" })
}
route GET "/hello" {
  request Request
  response Response
  flow hello
}`;

const SECRET_FREE_REDACT = `secure flow hello(request: Request) -> Response
${CONTRACT("redactfree")}
{
  return redact("ok")
}
route GET "/hello" {
  request Request
  response Response
  flow hello
}`;

const X1_ALIAS_IN_RECORD = `secure flow helper(request: Request) -> Response
${CONTRACT("x1h")}
{
  return { outcome: Secrets.get("SUPERSECRETPLANTEDVALUE") }
}
secure flow readSecret(request: Request) -> Response
${CONTRACT("x1")}
{
  let r = { h: helper }
  return { outcome: "ok" }
}
${POST_X}`;

const X2_STEP_UNKNOWN = `secure flow readSecret(request: Request) -> Response
${CONTRACT("x2")}
{
  return step mystery(request)
}
${POST_X}`;

const X4_STEP_SECRETFREE = `secure flow helper(request: Request) -> Response
${CONTRACT("x4h")}
{
  return { outcome: "ok" }
}
secure flow readSecret(request: Request) -> Response
${CONTRACT("x4")}
{
  return step helper(request)
}
${POST_X}`;

describe("WU2 fix-04 builtin allowlist, arg walk, and shadowing", () => {
  it("R3 Ok(hidden) with secret helper refuses before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(R3_OK_HIDDEN, "r3-ok-hidden.fungi", GATE);
      await assertServeRefuses(R3_OK_HIDDEN, "r3-ok-hidden.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "Ok(hidden) must not call listen");
  });

  it("R3 redact(mystery) refuses before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(R3_REDACT_MYSTERY, "r3-redact-mystery.fungi", GATE);
      await assertServeRefuses(R3_REDACT_MYSTERY, "r3-redact-mystery.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "redact(mystery) must not call listen");
  });

  it("R3 Ok(step helper) with secret helper refuses before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(R3_OK_STEP_HELPER, "r3-ok-step-helper.fungi", GATE);
      await assertServeRefuses(R3_OK_STEP_HELPER, "r3-ok-step-helper.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "Ok(step helper) must not call listen");
  });

  it("R4 shadowed fn redact that reads Secrets.get refuses before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(R4_SHADOW_REDACT, "r4-shadow-redact.fungi", GATE);
      await assertServeRefuses(R4_SHADOW_REDACT, "r4-shadow-redact.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "shadowed redact must not call listen");
  });

  it("secret-free Ok(...) still listens", async () => {
    const ast = parseProgram(SECRET_FREE_OK, "secret-free-ok.fungi").ast;
    const calls = await withListenCount(async () => {
      const running = await startServer(ast, { port: 0 }, async () => {
        return { __tag: "ok", value: { __tag: "string", value: "ok" } };
      });
      await running.close();
    });
    assert.equal(calls, 1, "secret-free Ok must listen");
  });

  it("secret-free redact(...) still listens", async () => {
    const ast = parseProgram(SECRET_FREE_REDACT, "secret-free-redact.fungi").ast;
    const calls = await withListenCount(async () => {
      const running = await startServer(ast, { port: 0 }, async () => {
        return { __tag: "ok", value: { __tag: "string", value: "ok" } };
      });
      await running.close();
    });
    assert.equal(calls, 1, "secret-free redact must listen");
  });

  it("X1 alias in a record field refuses before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(X1_ALIAS_IN_RECORD, "x1-alias-record.fungi", GATE);
      await assertServeRefuses(X1_ALIAS_IN_RECORD, "x1-alias-record.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "X1 must not call listen");
  });

  it("X2 step mystery refuses before listen", async () => {
    const calls = await withListenCount(async () => {
      await assertStartServerRefuses(X2_STEP_UNKNOWN, "x2-step-mystery.fungi", GATE);
      await assertServeRefuses(X2_STEP_UNKNOWN, "x2-step-mystery.fungi", LISTENER_REFUSED);
    });
    assert.equal(calls, 0, "X2 must not call listen");
  });

  it("X4 secret-free step helper still listens", async () => {
    const ast = parseProgram(X4_STEP_SECRETFREE, "x4-step-secretfree.fungi").ast;
    const calls = await withListenCount(async () => {
      const running = await startServer(ast, { port: 0 }, async () => {
        return { __tag: "ok", value: { __tag: "string", value: "ok" } };
      });
      await running.close();
    });
    assert.equal(calls, 1, "X4 secret-free step helper must listen");
  });
});

