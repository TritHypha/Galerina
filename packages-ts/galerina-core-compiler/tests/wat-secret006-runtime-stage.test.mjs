/**
 * SECRET-006 runtime-stage false-positive (Option A) — DESIGN-01 §3.1 tests 1–5 + 2b.
 * Replay: node --test --test-reporter=tap tests/wat-secret006-runtime-stage.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SH = join(__dir, "../src/self-hosted");
const ROOT = join(__dir, "../../..");

const strip = (p) => {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

function extractRecordDecl(src, name) {
  const re = new RegExp(`(^|\\n)record\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) throw new Error(`missing record ${name}`);
  const start = m.index + (m[1] ? m[1].length : 0);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed record ${name}`);
}

function girRecordsForRuntime() {
  const src = strip("gir-emitter.fungi");
  return ["GIRNode", "GIRExprNode", "GIRModule", "GIRExpr", "GIRStmt", "FlowEntry"]
    .map((n) => extractRecordDecl(src, n))
    .join("\n\n");
}

function stageSource(file) {
  const extra = file === "lexer.fungi" || file === "parser.fungi" ? "" : "\n" + strip(file);
  const girDecls = file === "runtime.fungi" ? "\n" + girRecordsForRuntime() : "";
  return "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + girDecls + extra;
}

const s006 = (diags) =>
  (diags || []).filter(
    (d) => d.code === "FUNGI-SECRET-006" || String(d.message || "").includes("FUNGI-SECRET-006"),
  );

describe("SECRET-006 runtime stage Option A", () => {
  it("1. runtime audit stage source passes checkProgram", () => {
    const src = stageSource("runtime.fungi");
    const r = L.checkProgram(src, "runtime-stage.fungi");
    const codes = (r.diagnostics || []).map((d) => d.code + ":" + d.message).slice(0, 8);
    assert.equal(r.ok, true, codes.join(" | "));
    assert.equal(s006(r.diagnostics).length, 0, codes.join(" | "));
  });

  function accessorSrc(call) {
    return `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
secure flow f() -> String
contract { intent { "true secret accessor" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  return sink(${call})
}
`;
  }

  function walkCalls(node, out = []) {
    if (!node || typeof node !== "object") return out;
    if (node.kind === "callExpr") {
      const c0 = (node.children || [])[0];
      out.push({
        value: node.value,
        child0Kind: c0 && c0.kind,
        child0Value: c0 && c0.value,
      });
    }
    for (const c of node.children || []) walkCalls(c, out);
    return out;
  }

  it("2. true secret-source passed to a flow still errors (decls present)", () => {
    const src = accessorSrc('Secrets.get("k")');
    const r = L.checkProgram(src, "true-secret-to-flow.fungi");
    const hits = s006(r.diagnostics);
    const codes = (r.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | ");
    assert.ok(hits.length >= 1, codes);
    assert.equal(hits[0].severity, "error");
    assert.ok(!(r.diagnostics || []).some((d) => d.code === "FUNGI-NAME-001"), codes);
  });

  it("2b. Env.get and Secrets.get still fire SECRET-006 as method accessors", () => {
    const secretsGet = accessorSrc('Secrets.get("k")');
    const envGet = accessorSrc('Env.get("k")');
    const rs = L.checkProgram(secretsGet, "secrets-get.fungi");
    const re = L.checkProgram(envGet, "env-get.fungi");
    const codesS = (rs.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | ");
    const codesE = (re.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | ");
    assert.ok(s006(rs.diagnostics).length >= 1, codesS);
    assert.ok(s006(re.diagnostics).length >= 1, codesE);
    assert.equal(s006(rs.diagnostics)[0].severity, "error");
    assert.equal(s006(re.diagnostics)[0].severity, "error");
    assert.ok(!(rs.diagnostics || []).some((d) => d.code === "FUNGI-NAME-001"), codesS);
    assert.ok(!(re.diagnostics || []).some((d) => d.code === "FUNGI-NAME-001"), codesE);

    const accessorCalls = walkCalls(L.parseProgram(envGet, "env-get.fungi").ast);
    const getCall = accessorCalls.find((c) => c.value === "get");
    assert.ok(getCall, JSON.stringify(accessorCalls));
    assert.equal(getCall.child0Kind, "identifier");
    assert.equal(getCall.child0Value, "Env");

    const fp = `@version 1
pure flow bindOne(e: Array<Int>, v: Int) -> Array<Int>
contract { intent { "bind" } }
{
  return e
}
pure flow g(x: Int) -> Int
contract { intent { "false-positive shape" } }
{
  mut env: Array<Int> = Array.empty()
  env = bindOne(env, x)
  return 0
}
`;
    const fpCalls = walkCalls(L.parseProgram(fp, "fp.fungi").ast);
    const bindCall = fpCalls.find((c) => c.value === "bindOne");
    assert.ok(bindCall, JSON.stringify(fpCalls));
    assert.equal(bindCall.child0Kind, "identifier");
    assert.equal(bindCall.child0Value, "env");
  });

  it("3. local named env passed to a flow is no longer SECRET-006 (Q1b PlainCall)", () => {
    const src = `@version 1
pure flow bindOne(e: Array<Int>, v: Int) -> Array<Int>
contract { intent { "bind" } }
{
  return e
}
pure flow f(x: Int) -> Int
contract { intent { "plain-call local env" } }
{
  mut env: Array<Int> = Array.empty()
  env = bindOne(env, x)
  return 0
}
`;
    const r = L.checkProgram(src, "local-env.fungi");
    assert.equal(s006(r.diagnostics).length, 0, (r.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("4. redact still declassifies a real secret crossing", () => {
    const body = (inner) => `pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
secure flow f() -> String
contract { intent { "secret crossing" } secrets { credential k { provider "vault" } } }
{
  ${inner}
}
`;
    const live = L.checkValueStates(
      L.parseProgram(body('return sink(secret.get("k"))'), "live-secret.fungi").ast,
      "production",
    );
    const redacted = L.checkValueStates(
      L.parseProgram(body('return sink(redact(secret.get("k")))'), "redact-secret.fungi").ast,
      "production",
    );
    const liveHits = s006(live.diagnostics);
    assert.ok(liveHits.length >= 1, (live.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "));
    assert.equal(liveHits[0].severity, "error");
    assert.equal(
      s006(redacted.diagnostics).length,
      0,
      (redacted.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "),
    );
  });

  it("5. no redact(scopeEnv); gate/allow-list pins unchanged; checker has sourceReceiverSegment", () => {
    const runtime = readFileSync(join(SH, "runtime.fungi"), "utf8");
    assert.equal(/redact\s*\(\s*scopeEnv/.test(runtime), false);
    const sha = (rel) =>
      createHash("sha256").update(readFileSync(join(__dir, rel))).digest("hex");
    const checker = readFileSync(join(__dir, "../src/value-state-checker.ts"), "utf8");
    assert.match(checker, /function sourceReceiverSegment\(/);
    assert.equal(/callStyle:\s*"plain"/.test(checker), false);
    assert.equal(sha("../src/security-gate.ts"), "4b0b683f457a27b8f2bffe3caaa60b7b12ed6cc5847717cbbc50007447e2ee99");
    assert.equal(sha("../src/checked-program.ts"), "fcb26657e6d7ab1332cd7d14adde8c5546f163169e51eb1b9ce21427a8d7a7d5");
  });
});
