/**
 * Phases 43-46 — Governance, Audit Chain, Proof Verifier, Type Registry services
 *
 * Tests four new governed HTTP services that form the runtime-in-Galerina
 * introspection and audit layer:
 *
 *   Phase 43 — governanceService.spore      POST /governance/verify  (port 3920)
 *   Phase 44 — auditChainService.spore      POST /audit/chain        (port 3921)
 *   Phase 45 — proofVerifierService.spore   POST /proof/verify       (port 3922)
 *   Phase 46 — typeRegistryService.spore    POST /types/resolve      (port 3923)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, startServer } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SERVICES = join(__dir, "..", "..", "..", "examples", "auth-service");

function loadService(filename) {
  const src = readFileSync(join(SERVICES, filename), "utf8");
  return parseProgram(src, filename);
}

// ── Phase 43: governanceService.spore ──────────────────────────────────────────

describe("Phase 43: governanceService.spore", () => {
  let server;
  const PORT = 3920;
  const url = `http://127.0.0.1:${PORT}/governance/verify`;

  before(async () => {
    const prog = loadService("governanceService.spore");
    server = await startServer(prog.ast, prog.flows, { port: PORT });
  });

  after(async () => { if (server) await server.close(); });

  async function post(body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: JSON.parse(await r.text()) };
  }

  it("governanceService.spore parses with zero errors", () => {
    const prog = loadService("governanceService.spore");
    const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
    assert.equal(errs.length, 0, errs.map(e => e.message).join(", "));
  });

  it("effects containing 'secure' → level 2, governed: true", async () => {
    const r = await post({ effects: "network.inbound, audit.write (secure)", qualifier: "secure" });
    assert.equal(r.status, 200);
    assert.equal(r.json.level, 2);
    assert.equal(r.json.governed, true);
  });

  it("effects containing 'critical' → level 3", async () => {
    const r = await post({ effects: "critical.write", qualifier: "secure" });
    assert.equal(r.status, 200);
    assert.equal(r.json.level, 3);
  });

  it("effects containing 'guarded' → level 1", async () => {
    const r = await post({ effects: "guarded.read", qualifier: "guarded" });
    assert.equal(r.status, 200);
    assert.equal(r.json.level, 1);
  });

  it("unknown effects → level 0", async () => {
    const r = await post({ effects: "network.inbound", qualifier: "pure" });
    assert.equal(r.status, 200);
    assert.equal(r.json.level, 0);
  });

  it("level 2 → requiresAudit: true", async () => {
    const r = await post({ effects: "secure.write", qualifier: "secure" });
    assert.equal(r.json.requiresAudit, true);
  });

  it("level 1 → requiresAudit: false", async () => {
    const r = await post({ effects: "guarded.read", qualifier: "guarded" });
    assert.equal(r.json.requiresAudit, false);
  });

  it("qualifier 'pure' → qualifierValid: true", async () => {
    const r = await post({ effects: "none", qualifier: "pure" });
    assert.equal(r.json.qualifierValid, true);
  });

  it("qualifier 'guarded' → qualifierValid: true", async () => {
    const r = await post({ effects: "guarded.read", qualifier: "guarded" });
    assert.equal(r.json.qualifierValid, true);
  });

  it("qualifier 'unknown' → qualifierValid: false", async () => {
    const r = await post({ effects: "network.inbound", qualifier: "unknown" });
    assert.equal(r.json.qualifierValid, false);
  });
});

// ── Phase 44: auditChainService.spore ──────────────────────────────────────────

describe("Phase 44: auditChainService.spore", () => {
  let server;
  const PORT = 3921;
  const url = `http://127.0.0.1:${PORT}/audit/chain`;

  before(async () => {
    const prog = loadService("auditChainService.spore");
    server = await startServer(prog.ast, prog.flows, { port: PORT });
  });

  after(async () => { if (server) await server.close(); });

  async function post(body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: JSON.parse(await r.text()) };
  }

  it("auditChainService.spore parses with zero errors", () => {
    const prog = loadService("auditChainService.spore");
    const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
    assert.equal(errs.length, 0, errs.map(e => e.message).join(", "));
  });

  it("returns eventId as flowName:timestamp", async () => {
    const r = await post({ flowName: "verifyPassword", status: "Success", timestamp: "2026-06-01T00:00:00Z" });
    assert.equal(r.status, 200);
    assert.equal(r.json.eventId, "verifyPassword:2026-06-01T00:00:00Z");
  });

  it("returns chained: true and correct schemaVersion", async () => {
    const r = await post({ flowName: "checkCapability", status: "Denied", timestamp: "2026-06-01T12:00:00Z" });
    assert.equal(r.json.chained, true);
    assert.equal(r.json.schemaVersion, "lln.runtime.audit.v1");
  });

  it("status 'Success' → statusValid: true", async () => {
    const r = await post({ flowName: "f", status: "Success", timestamp: "t1" });
    assert.equal(r.json.statusValid, true);
  });

  it("status 'Denied' → statusValid: true", async () => {
    const r = await post({ flowName: "f", status: "Denied", timestamp: "t2" });
    assert.equal(r.json.statusValid, true);
  });

  it("status 'Failed' → statusValid: true", async () => {
    const r = await post({ flowName: "f", status: "Failed", timestamp: "t3" });
    assert.equal(r.json.statusValid, true);
  });

  it("status 'Pending' → statusValid: false", async () => {
    const r = await post({ flowName: "f", status: "Pending", timestamp: "t4" });
    assert.equal(r.json.statusValid, false);
  });

  it("eventId is stable concat regardless of content", async () => {
    const r = await post({ flowName: "a", status: "Success", timestamp: "b" });
    assert.equal(r.json.eventId, "a:b");
  });
});

// ── Phase 45: proofVerifierService.spore ───────────────────────────────────────

describe("Phase 45: proofVerifierService.spore", () => {
  let server;
  const PORT = 3922;
  const url = `http://127.0.0.1:${PORT}/proof/verify`;

  before(async () => {
    const prog = loadService("proofVerifierService.spore");
    server = await startServer(prog.ast, prog.flows, { port: PORT });
  });

  after(async () => { if (server) await server.close(); });

  async function post(body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: JSON.parse(await r.text()) };
  }

  it("proofVerifierService.spore parses with zero errors", () => {
    const prog = loadService("proofVerifierService.spore");
    const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
    assert.equal(errs.length, 0, errs.map(e => e.message).join(", "));
  });

  it("algorithm 'lln.gov.sig.v1' → valid: true, strength: 3", async () => {
    const r = await post({ algorithm: "lln.gov.sig.v1", signaturePresent: true });
    assert.equal(r.status, 200);
    assert.equal(r.json.valid, true);
    assert.equal(r.json.strength, 3);
  });

  it("algorithm 'sha256' → valid: true, strength: 2", async () => {
    const r = await post({ algorithm: "sha256", signaturePresent: true });
    assert.equal(r.json.valid, true);
    assert.equal(r.json.strength, 2);
  });

  it("unknown algorithm → valid: false, strength: 0", async () => {
    const r = await post({ algorithm: "md5", signaturePresent: false });
    assert.equal(r.json.valid, false);
    assert.equal(r.json.strength, 0);
  });

  it("phase39Ready matches valid field", async () => {
    const r = await post({ algorithm: "lln.gov.sig.v1", signaturePresent: true });
    assert.equal(r.json.phase39Ready, r.json.valid);
  });

  it("algorithm is echoed back in response", async () => {
    const r = await post({ algorithm: "sha256", signaturePresent: false });
    assert.equal(r.json.algorithm, "sha256");
  });
});

// ── Phase 46: typeRegistryService.spore ────────────────────────────────────────

describe("Phase 46: typeRegistryService.spore", () => {
  let server;
  const PORT = 3923;
  const url = `http://127.0.0.1:${PORT}/types/resolve`;

  before(async () => {
    const prog = loadService("typeRegistryService.spore");
    server = await startServer(prog.ast, prog.flows, { port: PORT });
  });

  after(async () => { if (server) await server.close(); });

  async function post(body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: JSON.parse(await r.text()) };
  }

  it("typeRegistryService.spore parses with zero errors", () => {
    const prog = loadService("typeRegistryService.spore");
    const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
    assert.equal(errs.length, 0, errs.map(e => e.message).join(", "));
  });

  it("'Int' → isBuiltin: true, category: 'primitive', resolved: true", async () => {
    const r = await post({ typeName: "Int" });
    assert.equal(r.status, 200);
    assert.equal(r.json.isBuiltin, true);
    assert.equal(r.json.category, "primitive");
    assert.equal(r.json.resolved, true);
  });

  it("'Bool' → isBuiltin: true, category: 'primitive'", async () => {
    const r = await post({ typeName: "Bool" });
    assert.equal(r.json.isBuiltin, true);
    assert.equal(r.json.category, "primitive");
  });

  it("'String' → isBuiltin: true, category: 'primitive'", async () => {
    const r = await post({ typeName: "String" });
    assert.equal(r.json.isBuiltin, true);
    assert.equal(r.json.category, "primitive");
  });

  it("'Bytes' → isBuiltin: true, category: 'primitive'", async () => {
    const r = await post({ typeName: "Bytes" });
    assert.equal(r.json.isBuiltin, true);
  });

  it("'UserId' (unknown custom type) → isBuiltin: false, category: 'unknown'", async () => {
    const r = await post({ typeName: "UserId" });
    assert.equal(r.json.isBuiltin, false);
    assert.equal(r.json.category, "unknown");
  });

  it("typeName is echoed back in response", async () => {
    const r = await post({ typeName: "Float" });
    assert.equal(r.json.typeName, "Float");
  });
});
