/**
 * Phase 34 — synthetic verifyPassword loopback fixture.
 * This does not prove protected production I/O, gateway authentication, or Fungi runtime erasure.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseProgram, serve, executeFlow, checkEffects, verifyGovernance, checkTaint, createNodePasswordKdfProvider } from "../dist/index.js";
import bcrypt from "bcryptjs";

const kdf = { cryptoProvider: createNodePasswordKdfProvider() };

const __dir = dirname(fileURLToPath(import.meta.url));
const SERVICE = join(__dir, "..", "..", "..", "examples", "auth-service", "verifyPasswordService.fungi");
const FIXTURE_PASSWORD = "correct horse battery";

function loadService() {
  const src = readFileSync(SERVICE, "utf8");
  return parseProgram(src, "verifyPasswordService.fungi");
}

// ── BCrypt stdlib ───────────────────────────────────────────────────────────

describe("Phase 34: BCrypt stdlib", () => {
  it("BCrypt.verify returns true for the correct password", async () => {
    const hash = bcrypt.hashSync(FIXTURE_PASSWORD, 10);
    const src = "pure flow c(p: String, h: String) -> Bool contract { effects {} } { return BCrypt.verify(p, h) }";
    const prog = parseProgram(src, "t.fungi");
    const r = await executeFlow("c", new Map([["p", { __tag: "string", value: FIXTURE_PASSWORD }], ["h", { __tag: "string", value: hash }]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("BCrypt.verify returns false for the wrong password", async () => {
    const hash = bcrypt.hashSync(FIXTURE_PASSWORD, 10);
    const src = "pure flow c(p: String, h: String) -> Bool contract { effects {} } { return BCrypt.verify(p, h) }";
    const prog = parseProgram(src, "t.fungi");
    const r = await executeFlow("c", new Map([["p", { __tag: "string", value: "wrong" }], ["h", { __tag: "string", value: hash }]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.deepEqual(r.value, { __tag: "bool", value: false });
  });

  it("BCrypt.verify never throws on a malformed hash (returns false)", async () => {
    const src = "pure flow c(p: String, h: String) -> Bool contract { effects {} } { return BCrypt.verify(p, h) }";
    const prog = parseProgram(src, "t.fungi");
    const r = await executeFlow("c", new Map([["p", { __tag: "string", value: "x" }], ["h", { __tag: "string", value: "not-a-hash" }]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.deepEqual(r.value, { __tag: "bool", value: false });
  });

  it("BCrypt.hash produces a verifiable $2b$ hash", async () => {
    const src = "pure flow h(p: String) -> String contract { effects {} } { return BCrypt.hash(p) }";
    const prog = parseProgram(src, "t.fungi");
    const r = await executeFlow("h", new Map([["p", { __tag: "string", value: "hunter2" }]]), prog.ast, prog.flows, undefined, undefined, kdf);
    assert.equal(r.value.__tag, "string");
    assert.ok(r.value.value.startsWith("$2"));
    assert.ok(bcrypt.compareSync("hunter2", r.value.value));
  });
});

describe("Interpreter equality refusal ordering", () => {
  it("short-circuits a failed left operand for == and != without suppressing valid RHS effects", async () => {
    const expectedHash = "$argon2id$v=19$m=16,t=2,p=1$controlled";
    const runComparison = async (operator, password) => {
      const source = `secure flow compare(request: Request, candidate: String) -> Bool
contract { intent { "Compare one request field." } effects { crypto.verify } }
{
  unsafe let supplied: String = request.jsonBody.password
  return supplied ${operator} Password.hash(candidate)
}`;
      const program = parseProgram(source, "equality-refusal-order.fungi");
      assert.equal(
        (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error").length,
        0,
        "the regression fixture must parse without recovery",
      );
      let providerCalls = 0;
      const provider = {
        schema: "fungi.security.crypto-provider.v1",
        invoke: async (request) => {
          providerCalls += 1;
          assert.equal(request.op, "password-hash");
          return {
            ok: true,
            kind: "hash",
            algorithm: "argon2id",
            hash: expectedHash,
          };
        },
      };
      const jsonFields = new Map();
      if (password !== undefined) jsonFields.set("password", { __tag: "string", value: password });
      const result = await executeFlow(
        "compare",
        new Map([
          ["request", { __tag: "record", fields: new Map([["jsonBody", { __tag: "record", fields: jsonFields }]]) }],
          ["candidate", { __tag: "string", value: "synthetic" }],
        ]),
        program.ast,
        program.flows,
        undefined,
        undefined,
        { cryptoProvider: provider },
      );
      return { result, providerCalls };
    };

    for (const operator of ["==", "!="]) {
      const missing = await runComparison(operator, undefined);
      assert.equal(missing.result.value.__tag, "runtimeError", `${operator} propagates missing left operand`);
      assert.equal(missing.providerCalls, 0, `${operator} skips RHS effect after left refusal`);

      const valid = await runComparison(operator, expectedHash);
      assert.deepEqual(valid.result.value, { __tag: "bool", value: operator === "==" });
      assert.equal(valid.providerCalls, 1, `${operator} still evaluates valid RHS exactly once`);
    }
  });
});

// ── Service compiles cleanly ──────────────────────────────────────────────────

describe("Phase 34: verifyPasswordService.fungi compiles", () => {
  it("parses with zero errors", () => {
    const prog = loadService();
    const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
    assert.equal(errs.length, 0, errs.map(e => e.code + ":" + e.message).join(" | "));
  });

  it("declares the verifyPassword flow and the POST route", () => {
    const prog = loadService();
    assert.ok(prog.flows.some(f => f.name === "verifyPassword"));
    const routes = (prog.ast.children ?? []).filter(c => c.kind === "routeDecl").map(c => c.value);
    assert.ok(routes.includes("POST /auth/verify"), `routes: ${routes.join(",")}`);
  });

  it("does not persist verification outcomes through an audit sink", () => {
    const source = readFileSync(SERVICE, "utf8");
    assert.doesNotMatch(source, /AuditLog\.write\s*\(/);
  });

  it("raises no taint findings (password → BCrypt.verify is a valid comparison sink)", () => {
    const prog = loadService();
    const taint = checkTaint(prog.ast, prog.flows).map(d => d.code);
    assert.equal(taint.length, 0, `unexpected taint: ${taint.join(",")}`);
  });

  it("crypto.verify effect is required and satisfied (no FUNGI-EFFECT-001)", () => {
    const prog = loadService();
    const fx = checkEffects(prog.flows, prog.ast);
    const gov = verifyGovernance(prog.ast, prog.flows, fx, "production");
    const undeclared = gov.diagnostics.filter(d => d.code === "FUNGI-EFFECT-001");
    assert.equal(undeclared.length, 0, undeclared.map(d => d.message).join(" | "));
  });
});

// ── Synthetic loopback HTTP execution; not production protected-I/O evidence ───

describe("Phase 34: synthetic loopback HTTP service", () => {
  let server;
  const PORT = 3917;
  const url = `http://127.0.0.1:${PORT}/auth/verify`;

  before(async () => {
    const source = readFileSync(SERVICE, "utf8");
    server = await serve(source, "verifyPasswordService.fungi", { port: PORT }, kdf);
  });

  after(async () => { if (server) await server.close(); });

  async function post(body) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, json: JSON.parse(await r.text()) };
  }

  it("correct synthetic fixture password → one matched outcome", async () => {
    const r = await post({ email: "a@b.com", password: FIXTURE_PASSWORD });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { outcome: "matched" });
  });

  it("wrong synthetic fixture password → one not-matched outcome", async () => {
    const r = await post({ email: "a@b.com", password: "definitely wrong" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { outcome: "not-matched" });
  });

  it("empty password → UNKNOWN without opening the provider", async () => {
    let providerCalls = 0;
    const emptyServer = await serve(readFileSync(SERVICE, "utf8"), "verifyPasswordService.fungi", { port: PORT + 3 }, {
      cryptoProvider: {
        schema: "fungi.security.crypto-provider.v1",
        invoke: async () => {
          providerCalls += 1;
          return { ok: true, kind: "verify", matches: false };
        },
      },
    });
    try {
      const response = await fetch(`http://127.0.0.1:${PORT + 3}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: "" }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { outcome: "unknown" });
      assert.equal(providerCalls, 0);
    } finally {
      await emptyServer.close();
    }
  });

  it("missing password → refuses before provider access, never a mismatch", async () => {
    let providerCalls = 0;
    const missingServer = await serve(readFileSync(SERVICE, "utf8"), "verifyPasswordService.fungi", { port: PORT + 4 }, {
      cryptoProvider: {
        schema: "fungi.security.crypto-provider.v1",
        invoke: async () => {
          providerCalls += 1;
          return { ok: true, kind: "verify", matches: false };
        },
      },
    });
    try {
      const response = await fetch(`http://127.0.0.1:${PORT + 4}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com" }),
      });
      const body = await response.json();
      assert.equal(response.status, 500);
      assert.equal(Object.hasOwn(body, "outcome"), false);
      assert.equal(providerCalls, 0);
    } finally {
      await missingServer.close();
    }
  });

  it("unknown route → 404", async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/nonexistent`, { method: "POST" });
    assert.equal(r.status, 404);
  });

  it("malformed JSON is refused without returning an authentication outcome", async () => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    assert.equal(r.status, 422);
    const body = await r.json();
    assert.equal(Object.hasOwn(body, "outcome"), false);
  });

  it("provider failure is UNKNOWN, never a conclusive password mismatch", async () => {
    const source = readFileSync(SERVICE, "utf8");
    const failureServer = await serve(source, "verifyPasswordService.fungi", { port: PORT + 1 }, {
      cryptoProvider: {
        schema: "fungi.security.crypto-provider.v1",
        invoke: async () => { throw new Error("controlled provider failure"); },
      },
    });
    try {
      const response = await fetch(`http://127.0.0.1:${PORT + 1}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: FIXTURE_PASSWORD }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { outcome: "unknown" });
    } finally {
      await failureServer.close();
    }
  });

  it("built-in bcrypt callback failure is UNKNOWN, never a password mismatch", async () => {
    const source = readFileSync(SERVICE, "utf8");
    const originalCompare = bcrypt.compare;
    const failureServer = await serve(source, "verifyPasswordService.fungi", { port: PORT + 2 }, kdf);
    bcrypt.compare = (_plain, _hash, callback) => callback(new Error("controlled bcrypt backend failure"), false);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT + 2}/auth/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@b.com", password: FIXTURE_PASSWORD }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { outcome: "unknown" });
    } finally {
      bcrypt.compare = originalCompare;
      await failureServer.close();
    }
  });
});
