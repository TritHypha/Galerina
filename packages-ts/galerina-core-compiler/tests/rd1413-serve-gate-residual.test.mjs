/**
 * WU2 residual: serve() must refuse secret/protected routes before startServer.
 * Discriminates the duplicate fence inside startServer. Does not modify
 * tests/rd1413-serve-gate.test.mjs (RD-1413 3/3 plus addenda stay untouched).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const runtimeSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/runtime.ts"),
  "utf8",
);

describe("WU2 residual serve() fence before startServer", () => {
  it("serve() calls standaloneServeSecretRefusal and throws on refuse before startServer", () => {
    const serveStart = runtimeSrc.indexOf("export async function serve(");
    assert.ok(serveStart >= 0, "serve() export missing");
    const nextExportLf = runtimeSrc.indexOf("\nexport ", serveStart + 1);
    const nextExportCrlf = runtimeSrc.indexOf("\r\nexport ", serveStart + 1);
    const candidates = [nextExportLf, nextExportCrlf].filter((idx) => idx >= 0);
    const serveEnd = candidates.length === 0 ? runtimeSrc.length : Math.min(...candidates);
    const body = runtimeSrc.slice(serveStart, serveEnd);
    const refuseCall = body.indexOf("standaloneServeSecretRefusal(");
    const startCall = body.indexOf("startServer(");
    assert.ok(refuseCall >= 0, "serve() must call standaloneServeSecretRefusal");
    assert.ok(startCall >= 0, "serve() must call startServer");
    assert.ok(refuseCall < startCall, "refusal must run before startServer");
    assert.match(body, /secretRefusal\.__tag === ["']refuse["']/u);
    assert.match(body, /throw new Error\(secretRefusal\.reason\)/u);
  });
});
