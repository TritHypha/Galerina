/**
 * Phase 41 — Stage B Compilation Service (Runtime-in-Galerina → 50% foundation)
 *
 * Tests the compilationService.spore HTTP endpoint that routes source text
 * through Stage B analysis. Proves the governed runtime can now process
 * Galerina source as a service.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, startServer } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SERVICE = join(__dir, "..", "..", "..", "examples", "auth-service", "compilationService.spore");

describe("Phase 41: compilationService.spore", () => {
  let server;
  const PORT = 3919;
  const url = `http://127.0.0.1:${PORT}/compile/tokenize`;

  before(async () => {
    const src = readFileSync(SERVICE, "utf8");
    const prog = parseProgram(src, "compilationService.spore");
    server = await startServer(prog.ast, prog.flows, { port: PORT });
  });

  after(async () => { if (server) await server.close(); });

  async function post(body) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, json: JSON.parse(await r.text()) };
  }

  it("detects flow in Galerina source", async () => {
    const r = await post({ source: "pure flow add(a: Int, b: Int) -> Int contract { effects {} } { return a + b }" });
    assert.equal(r.status, 200);
    assert.equal(r.json.hasFlow, true);
  });

  it("detects contract block", async () => {
    const r = await post({ source: "secure flow f() -> Bool contract { effects { audit.write } } { return true }" });
    assert.equal(r.json.hasContract, true);
  });

  it("returns stage=B in every response", async () => {
    const r = await post({ source: "hello world" });
    assert.equal(r.json.stage, "B");
  });

  it("returns correct wordCount", async () => {
    const r = await post({ source: "one two three four five" });
    assert.equal(r.json.wordCount, 5);
  });

  it("source without flow → hasFlow=false", async () => {
    const r = await post({ source: "this is plain text not galerina" });
    assert.equal(r.json.hasFlow, false);
  });

  it("compilationService.spore parses with zero errors", () => {
    const src = readFileSync(SERVICE, "utf8");
    const prog = parseProgram(src, "compilationService.spore");
    const errs = (prog.diagnostics ?? []).filter(d => d.severity === "error");
    assert.equal(errs.length, 0);
  });
});
