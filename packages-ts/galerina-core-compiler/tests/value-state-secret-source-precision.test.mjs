/**
 * DESIGN-02 / Q1b secret-SOURCE precision.
 * Replay: node --test --test-reporter=tap tests/value-state-secret-source-precision.test.mjs
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

const s006 = (diags) =>
  (diags || []).filter(
    (d) => d.code === "FUNGI-SECRET-006" || String(d.message || "").includes("FUNGI-SECRET-006"),
  );

const codes = (r) => (r.diagnostics || []).map((d) => d.code + ":" + (d.message || "")).join(" | ");

function walkCalls(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (node.kind === "callExpr") {
    const c0 = (node.children || [])[0];
    out.push({
      value: node.value,
      callStyle: Object.prototype.hasOwnProperty.call(node, "callStyle") ? node.callStyle : "<absent>",
      child0Kind: c0 && c0.kind,
      child0Value: c0 && c0.value,
    });
  }
  for (const c of node.children || []) walkCalls(c, out);
  return out;
}

const strip = (p) => {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

function extractRecordDecl(src, name) {
  const re = new RegExp(`(^|\\n)record\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) throw new Error("missing record " + name);
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
  throw new Error("unclosed " + name);
}

function girRecordsForRuntime() {
  const src = strip("gir-emitter.fungi");
  return ["GIRNode", "GIRExprNode", "GIRModule", "GIRExpr", "GIRStmt", "FlowEntry"]
    .map((n) => extractRecordDecl(src, n))
    .join("\n\n");
}

function stageSource(runtimeSrc) {
  return "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + girRecordsForRuntime() + "\n" + runtimeSrc.replace(/^@version 1\s*/m, "");
}

const accessor = (call) => `@version 1
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

const nShape = (localName) => `@version 1
pure flow bindOne(e: Array<Int>, v: Int) -> Array<Int>
contract { intent { "bind" } }
{
  return e
}
pure flow f(x: Int) -> Int
contract { intent { "plain-call local namespace name" } }
{
  mut ${localName}: Array<Int> = Array.empty()
  ${localName} = bindOne(${localName}, x)
  return 0
}
`;

describe("Q1b secret-SOURCE precision", () => {
  it("N1. local env passed to bindOne no longer SECRET-006", () => {
    const r = L.checkProgram(nShape("env"), "n1.fungi");
    assert.equal(s006(r.diagnostics).length, 0, codes(r));
  });

  function nLetShape(localName) {
    return `@version 1
pure flow bindOne(e: Array<Int>, v: Int) -> Array<Int>
contract { intent { "bind" } }
{
  return e
}
pure flow f(x: Int) -> Int
contract { intent { "plain-call let namespace name" } }
{
  let ${localName}: Array<Int> = Array.empty()
  let z = bindOne(${localName}, x)
  return 0
}
`;
  }

  it("N2. locals vault/kms/secrets no longer SECRET-006", () => {
    for (const name of ["kms", "secrets"]) {
      const r = L.checkProgram(nShape(name), "n2-" + name + ".fungi");
      assert.equal(s006(r.diagnostics).length, 0, name + " " + codes(r));
    }
    const vaultSrc = nLetShape("vault");
    const parsed = L.parseProgram(vaultSrc, "n2-vault.fungi");
    assert.equal(
      (parsed.diagnostics || []).filter((d) => d.code === "FUNGI-PARSE-001").length,
      0,
      "vault parse " + (parsed.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "),
    );
    const r = L.checkProgram(vaultSrc, "n2-vault.fungi");
    assert.equal(s006(r.diagnostics).length, 0, "vault " + codes(r));
  });

  it("N3. SecureString local named env still SECRET-006", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
secure flow f() -> String
contract { intent { "n3" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  let env = Env.get("k")
  return sink(env)
}
`;
    const r = L.checkProgram(src, "n3.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    assert.equal(hits[0].severity, "error");
  });

  it("M1. Env.get and Secrets.get still SECRET-006", () => {
    for (const call of ['Env.get("k")', 'Secrets.get("k")']) {
      const r = L.checkProgram(accessor(call), "m1.fungi");
      const hits = s006(r.diagnostics);
      assert.ok(hits.length >= 1, call + " " + codes(r));
      assert.equal(hits[0].severity, "error");
      assert.ok(!(r.diagnostics || []).some((d) => d.code === "FUNGI-NAME-001"), call + " " + codes(r));
    }
  });

  it("M3. Env::get is a method accessor and SECRET-006", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
secure flow f() -> String
contract { intent { "m3" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  let s = Env::get("k")
  return sink(s)
}
`;
    const parsed = L.parseProgram(src, "m3.fungi");
    const getCall = walkCalls(parsed.ast).find((c) => c.value === "get");
    assert.ok(getCall, JSON.stringify(walkCalls(parsed.ast)));
    assert.equal(getCall.callStyle, "method");
    const r = L.checkProgram(src, "m3.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    assert.equal(hits[0].severity, "error");
  });

  it("O1. env?.get is errorPropagation+method", () => {
    const src = accessor('env?.get("k")');
    const parsed = L.parseProgram(src, "o1.fungi");
    const getCall = walkCalls(parsed.ast).find((c) => c.value === "get");
    assert.ok(getCall, JSON.stringify(walkCalls(parsed.ast)));
    assert.equal(getCall.callStyle, "method");
    assert.equal(getCall.child0Kind, "errorPropagation");
  });

  it("O1b. Env.get? still SECRET-006", () => {
    const r = L.checkProgram(accessor('Env.get("k")?'), "o1b.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    assert.equal(hits[0].severity, "error");
  });

  it("A3. a local method receiver named env is not the secret-provider namespace", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
pure flow f() -> String
contract { intent { "a3" } }
{
  let env: String = "k"
  return sink(env.get("k"))
}
`;
    const vs = L.checkValueStates(L.parseProgram(src, "a3.fungi").ast, "production");
    assert.equal(s006(vs.diagnostics).length, 0,
      (vs.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("does not treat local collection methods or non-accessor namespace methods as secret reads", () => {
    const localArray = `@version 1
pure flow readIndex(env: Array<Int>, index: Int) -> Option<Int>
contract { intent { "read a local array element" } }
{
  return env.get(index)
}
pure flow appendValue(env: Array<Int>, value: Int) -> Array<Int>
contract { intent { "append to a local array" } }
{
  return env.append(value)
}
`;
    const local = L.checkProgram(localArray, "local-env-array-methods.fungi");
    assert.equal(s006(local.diagnostics).length, 0, codes(local));

    const wrongAccessor = `@version 1
secure flow appendVault(value: Int) -> Int
contract { intent { "call an unrelated method on a namespace-like name" } effects { secret.read } }
{
  return vault.append(value)
}
`;
    const namespace = L.checkValueStates(
      L.parseProgram(wrongAccessor, "vault-append-not-secret.fungi").ast,
      "production",
    );
    assert.equal(s006(namespace.diagnostics).length, 0,
      (namespace.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "));

    const alias = `@version 1
secure flow readAliasedCredential() -> String
contract { intent { "read through the supported Env module alias" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  let env = Env
  return env.get("k")
}
`;
    const aliased = L.checkValueStates(
      L.parseProgram(alias, "aliased-env-secret-source.fungi").ast,
      "production",
    );
    assert.ok(s006(aliased.diagnostics).length >= 1,
      (aliased.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("P2. bare namespace env via checkValueStates still SECRET-006", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
pure flow g() -> String
contract { intent { "p2" } }
{
  return sink(env)
}
`;
    const vs = L.checkValueStates(L.parseProgram(src, "p2.fungi").ast, "production");
    const hits = s006(vs.diagnostics);
    assert.ok(hits.length >= 1, (vs.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("R1. redact still declassifies (paired KAT)", () => {
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
      L.parseProgram(body('return sink(secret.get("k"))'), "live.fungi").ast,
      "production",
    );
    const redacted = L.checkValueStates(
      L.parseProgram(body('return sink(redact(secret.get("k")))'), "redact.fungi").ast,
      "production",
    );
    assert.ok(s006(live.diagnostics).length >= 1, (live.diagnostics || []).map((d) => d.code).join(","));
    assert.equal(s006(redacted.diagnostics).length, 0, (redacted.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("D1. match Env.get cannot escape through an identity flow as ordinary String", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
secure flow f() -> String
contract { intent { "d1" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  match Env.get("k") {
    Ok(v) => { return sink(v) }
    _ => { return sink("x") }
  }
}
`;
    const r = L.checkProgram(src, "d1.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    assert.ok(hits.every((diagnostic) => diagnostic.severity === "error"), JSON.stringify(hits));
  });

  it("does not let a secure flow return a secret source through an ordinary String result", () => {
    const src = `@version 1
secure flow readCredential() -> String
contract { intent { "read a credential" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  return Env.get("k")
}
`;
    const r = L.checkProgram(src, "secret-return-as-string.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    assert.equal(hits[0]?.severity, "error", JSON.stringify(hits));
  });

  it("preserves explicitly secret-typed returns and permits explicit redaction", () => {
    const cases = [
      [`@version 1
secure flow keepCredential(key: SecureString) -> SecureString
contract { intent { "retain the secret type" } }
{ return key }`, "secure-return.fungi"],
      [`@version 1
secure flow redactCredential(key: SecureString) -> String
contract { intent { "redact before returning" } }
{ return redact(key) }`, "redacted-return.fungi"],
    ];
    for (const [src, file] of cases) {
      const r = L.checkProgram(src, file);
      assert.equal(s006(r.diagnostics).length, 0, `${file}: ${codes(r)}`);
    }
  });

  it("retains secret provenance when distinct constant returns are selected by a secret branch", () => {
    const src = `@version 1
pure flow sink(value: Bool) -> Bool
contract { intent { "identity sink" } }
{
  return value
}
secure flow f(key: SecureString) -> Bool
contract { intent { "secret-dependent result" } }
{
  let result = match 0 {
    _ => {
      if !key { return true }
      else { return false }
    }
  }
  return sink(result)
}
`;
    const r = L.checkProgram(src, "secret-selected-return.fungi");
    assert.ok(s006(r.diagnostics).length >= 1, codes(r));
  });

  it("does not mark an identical constant return secret merely because a secret branch chose it", () => {
    const src = `@version 1
pure flow sink(value: Bool) -> Bool
contract { intent { "identity sink" } }
{
  return value
}
secure flow f(key: SecureString) -> Bool
contract { intent { "constant secret-controlled result" } }
{
  let result = match 0 {
    _ => {
      if !key { return true }
      else { return true }
    }
  }
  return sink(result)
}
`;
    const r = L.checkProgram(src, "same-constant-secret-branch.fungi");
    assert.equal(s006(r.diagnostics).length, 0, codes(r));
  });

  it("AST: plain bindOne is callStyle absent; Env.get is method", () => {
    const plain = walkCalls(L.parseProgram(nShape("env"), "ast-n1.fungi").ast).find((c) => c.value === "bindOne");
    assert.ok(plain);
    assert.equal(plain.callStyle, "<absent>");
    assert.equal(plain.child0Kind, "identifier");
    assert.equal(plain.child0Value, "env");
    const method = walkCalls(L.parseProgram(accessor('Env.get("k")'), "ast-m1.fungi").ast).find((c) => c.value === "get");
    assert.ok(method);
    assert.equal(method.callStyle, "method");
    assert.equal(method.child0Value, "Env");
  });

  it("S1. sink helper pins unchanged", () => {
    // Git's Windows checkout may translate repository LF bytes to CRLF. Hash
    // canonical source text so this invariant is independent of checkout EOLs.
    const sha = (rel) => createHash("sha256")
      .update(readFileSync(join(__dir, rel), "utf8").replace(/\r\n/g, "\n"))
      .digest("hex");
    assert.equal(sha("../src/security-gate.ts"), "9f537d9adef482f2786ca8c517aec772ea7a189fd9d20f50cdbfdef0b8492741");
    assert.equal(sha("../src/checked-program.ts"), "fcb26657e6d7ab1332cd7d14adde8c5546f163169e51eb1b9ce21427a8d7a7d5");
    const src = readFileSync(join(__dir, "../src/value-state-checker.ts"), "utf8");
    assert.match(src, /function receiverSegment\(/);
    assert.match(src, /function isSerializationCall\(/);
    assert.match(src, /function isLogCall\(/);
    assert.match(src, /function isNetworkSink\(/);
    assert.match(src, /function isModelSink\(/);
    assert.equal(/callStyle:\s*"plain"/.test(src), false);
  });

  it("N4. TEMP pre-rename runProgram shape passes checkProgram", () => {
    let runtime = strip("runtime.fungi");
    runtime = runtime.replace(/scopeEnv/g, "env");
    assert.match(runtime, /mut env: Array<Binding>/);
    const src = stageSource(runtime);
    const r = L.checkProgram(src, "runtime-prerename.fungi");
    assert.equal(r.ok, true, codes(r).slice(0, 500));
    assert.equal(s006(r.diagnostics).length, 0, codes(r).slice(0, 500));
  });

  it("M1b. lowercase accessors still SECRET-006 via checkValueStates", () => {
    for (const call of [
      'secret.get("k")',
      'secrets.get("k")',
      'vault.read("k")',
      'vault.get("k")',
      'kms.decrypt("k")',
    ]) {
      const vs = L.checkValueStates(L.parseProgram(accessor(call), "m1b.fungi").ast, "production");
      assert.ok(s006(vs.diagnostics).length >= 1, call + " " + (vs.diagnostics || []).map((d) => d.code).join(","));
    }
  });

  it("M2. dotted receiver app.env.get still SECRET-006", () => {
    const vs = L.checkValueStates(
      L.parseProgram(accessor('app.env.get("k")'), "m2.fungi").ast,
      "production",
    );
    assert.ok(s006(vs.diagnostics).length >= 1, (vs.diagnostics || []).map((d) => d.code).join(","));
  });

  it("M4. Env.get? already covered by O1b; let-bound Env.get? still SECRET-006", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
secure flow f() -> String
contract { intent { "m4" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  let s = Env.get("k")?
  return sink(s)
}
`;
    const r = L.checkProgram(src, "m4.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    assert.equal(hits[0].severity, "error");
  });

  it("A1. alias of Env.get still SECRET-006", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
secure flow f() -> String
contract { intent { "a1" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  let s = Env.get("k")
  let t = s
  return sink(t)
}
`;
    const r = L.checkProgram(src, "a1.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    assert.equal(hits[0].severity, "error");
  });

  it("A2. let e = env is NAME-001 through checkProgram", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
pure flow f() -> String
contract { intent { "a2" } }
{
  let e = env
  return sink(e)
}
`;
    const r = L.checkProgram(src, "a2.fungi");
    assert.ok(
      (r.diagnostics || []).some((d) => d.code === "FUNGI-NAME-001"),
      codes(r),
    );
  });

  it("P1. Env.get through helper and record still SECRET-006", () => {
    const through = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
pure flow wrap(x: String) -> String
contract { intent { "wrap" } }
{
  return x
}
secure flow f() -> String
contract { intent { "p1" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  return sink(wrap(Env.get("k")))
}
`;
    const r = L.checkProgram(through, "p1-wrap.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    const rec = L.checkValueStates(
      L.parseProgram(accessor('{ k: Env.get("k") }'), "p1-rec.fungi").ast,
      "production",
    );
    assert.ok(s006(rec.diagnostics).length >= 1, (rec.diagnostics || []).map((d) => d.code).join(","));
  });

  it("C1. Env.get computed key still SECRET-006", () => {
    const src = `@version 1
pure flow sink(x: String) -> String
contract { intent { "identity sink" } }
{
  return x
}
secure flow f() -> String
contract { intent { "c1" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  let name = "k"
  return sink(Env.get(name))
}
`;
    const r = L.checkProgram(src, "c1.fungi");
    const hits = s006(r.diagnostics);
    assert.ok(hits.length >= 1, codes(r));
    assert.equal(hits[0].severity, "error");
  });

  it("R2. constantTimeEquals declassifies", () => {
    const src = `@version 1
pure flow sink(x: Bool) -> Bool
contract { intent { "bool sink" } }
{
  return x
}
secure flow f() -> Bool
contract { intent { "r2" } effects { secret.read } secrets { credential k { provider "vault" } } }
{
  let ok = Crypto.constantTimeEquals(Env.get("k"), "h")
  return sink(ok)
}
`;
    const vs = L.checkValueStates(L.parseProgram(src, "r2.fungi").ast, "production");
    assert.equal(
      s006(vs.diagnostics).length,
      0,
      (vs.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "),
    );
  });

  it("O1-fire. env?.get SECRET-006 via checkValueStates", () => {
    const vs = L.checkValueStates(L.parseProgram(accessor('env?.get("k")'), "o1f.fungi").ast, "production");
    assert.ok(s006(vs.diagnostics).length >= 1, (vs.diagnostics || []).map((d) => d.code).join(","));
  });

  it("N2-vault-mut. mut vault is PARSE-001 on this parser pin", () => {
    const parsed = L.parseProgram(nShape("vault"), "n2-mut-vault.fungi");
    assert.ok(
      (parsed.diagnostics || []).some((d) => d.code === "FUNGI-PARSE-001"),
      "expected PARSE-001, got " + (parsed.diagnostics || []).map((d) => d.code + ":" + d.message).join(" | "),
    );
  });
});
