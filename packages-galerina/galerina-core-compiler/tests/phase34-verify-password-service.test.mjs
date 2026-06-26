/**
 * Phase 34 — verifyPassword governed HTTP service (Runtime-in-Galerina 25%)
 *
 * Verifies the first .spore file that IS a runtime service:
 *   HTTP POST → governance → BCrypt.verify → audit → governed JSON response
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseProgram, startServer, executeFlow, checkEffects, verifyGovernance, checkTaint } from "../dist/index.js";
import bcrypt from "bcryptjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SERVICE = join(__dir, "..", "..", "..", "examples", "auth-service", "verifyPasswordService.spore");
const FIXTURE_PASSWORD = "correct horse battery";

function loadService() {
  const src = readFileSync(SERVICE, "utf8");
  return parseProgram(src, "verifyPasswordService.spore");
}

// ── BCrypt stdlib ───────────────────────────────────────────────────────────

describe("Phase 34: BCrypt stdlib", () => {
  it("BCrypt.verify returns true for the correct password", async () => {
    const hash = bcrypt.hashSync(FIXTURE_PASSWORD, 10);
    const src = "pure flow c(p: String, h: String) -> Bool contract { effects {} } { return BCrypt.verify(p, h) }";
    const prog = parseProgram(src, "t.spore");
    const r = await executeFlow("c", new Map([["p", { __tag: "string", value: FIXTURE_PASSWORD }], ["h", { __tag: "string", value: hash }]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: true });
  });

  it("BCrypt.verify returns false for the wrong password", async () => {
    const hash = bcrypt.hashSync(FIXTURE_PASSWORD, 10);
    const src = "pure flow c(p: String, h: String) -> Bool contract { effects {} } { return BCrypt.verify(p, h) }";
    const prog = parseProgram(src, "t.spore");
    const r = await executeFlow("c", new Map([["p", { __tag: "string", value: "wrong" }], ["h", { __tag: "string", value: hash }]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: false });
  });

  it("BCrypt.verify never throws on a malformed hash (returns false)", async () => {
    const src = "pure flow c(p: String, h: String) -> Bool contract { effects {} } { return BCrypt.verify(p, h) }";
    const prog = parseProgram(src, "t.spore");
    const r = await executeFlow("c", new Map([["p", { __tag: "string", value: "x" }], ["h", { __tag: "string", value: "not-a-hash" }]]), prog.ast, prog.flows);
    assert.deepEqual(r.value, { __tag: "bool", value: false });
  });

  it("BCrypt.hash produces a verifiable $2b$ hash", async () => {
    const src = "pure flow h(p: String) -> String contract { effects {} } { return BCrypt.hash(p) }";
    const prog = parseProgram(src, "t.spore");
    const r = await executeFlow("h", new Map([["p", { __tag: "string", value: "hunter2" }]]), prog.ast, prog.flows);
    assert.equal(r.value.__tag, "string");
    assert.ok(r.value.value.startsWith("$2"));
    assert.ok(bcrypt.compareSync("hunter2", r.value.value));
  });
});

// ── Service compiles cleanly ──────────────────────────────────────────────────

describe("Phase 34: verifyPasswordService.spore compiles", () => {
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

  it("raises no taint findings (password → BCrypt.verify is a valid comparison sink)", () => {
    const prog = loadService();
    const taint = checkTaint(prog.ast, prog.flows).map(d => d.code);
    assert.equal(taint.length, 0, `unexpected taint: ${taint.join(",")}`);
  });

  it("crypto.verify effect is required and satisfied (no SPORE-EFFECT-001)", () => {
    const prog = loadService();
    const fx = checkEffects(prog.flows, prog.ast);
    const gov = verifyGovernance(prog.ast, prog.flows, fx, "production");
    const undeclared = gov.diagnostics.filter(d => d.code === "SPORE-EFFECT-001");
    assert.equal(undeclared.length, 0, undeclared.map(d => d.message).join(" | "));
  });
});

// ── Live HTTP end-to-end ──────────────────────────────────────────────────────

describe("Phase 34: live HTTP service", () => {
  let server;
  const PORT = 3917;
  const url = `http://127.0.0.1:${PORT}/auth/verify`;

  before(async () => {
    const prog = loadService();
    server = await startServer(prog.ast, prog.flows, { port: PORT });
  });

  after(async () => { if (server) await server.close(); });

  async function post(body) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, json: JSON.parse(await r.text()) };
  }

  it("correct password → 200 { success: true }", async () => {
    const r = await post({ email: "a@b.com", password: FIXTURE_PASSWORD });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { success: true });
  });

  it("wrong password → 200 { success: false }", async () => {
    const r = await post({ email: "a@b.com", password: "definitely wrong" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { success: false });
  });

  it("missing password → 200 { success: false } (no crash)", async () => {
    const r = await post({ email: "a@b.com" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { success: false });
  });

  it("unknown route → 404", async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/nonexistent`, { method: "POST" });
    assert.equal(r.status, 404);
  });

  it("malformed JSON body does not crash the server (still responds)", async () => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" });
    assert.ok(r.status >= 200 && r.status < 600);
    await r.text();
  });
});
