/**
 * Egress-guard hardening — regression tests for the fail-open holes found by the
 * 2026-06-16 adversarial audit of FUNGI-SECRET-006 / FUNGI-PRIVACY-004. Each was empirically
 * confirmed to leak (no diagnostic) before the fix; all must now be caught. The holes
 * affected the propagation graph (assignStmt, record-spread, string interpolation), the
 * sink set (response.body / ai.remoteInference / vector-store), the embedding recognizer
 * (instance receivers), and cross-flow propagation.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkValueStates } from "../dist/index.js";

const wrap = (body) => `secure flow f(req: Request) -> Int
contract { effects { ai.inference  network.outbound } secrets { credential k { provider "vault" } } }
{
${body}
  return 0
}`;
const chk = (src) => checkValueStates(parseProgram(src, "test.fungi").ast);
const has = (r, code) => r.diagnostics.some((d) => d.code === code);
const codes = (r) => r.diagnostics.map((d) => d.code).join(", ");

describe("egress hardening — A1 bare assignment (assignStmt) re-derives flags", () => {
  it("a secret assigned into a mut binding then egressed → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  mut s = "x"\n  let kk = secret.get("api")\n  s = kk\n  let x = http.post("u", s)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("an embedding assigned into a mut binding then egressed → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  mut s = "x"\n  let e = EmbeddingModel.run(req)\n  s = e\n  let x = http.post("u", s)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
  it("reassigning a secret binding to redact(...) clears it → clean", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  mut s = kk\n  s = redact(kk)\n  let x = http.post("u", s)'));
    assert.ok(!has(r, "FUNGI-SECRET-005"), codes(r));
  });
});

describe("egress hardening — H3 safelist inversion (unknown receiver ⇒ deny-by-default)", () => {
  it("a raw secret to an UNKNOWN egress service (in no denylist) → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = AcmeCloudThing.upload(kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("a raw secret to another unlisted service via .submit → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = WeirdSink.submit(kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("a raw secret to an ON-HOST secret-safe primitive (vault.store) is exempt → clean", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = vault.store(kk)'));
    assert.ok(!has(r, "FUNGI-SECRET-005"), codes(r));
  });
});

describe("egress hardening — A2 record spread/update keeps the flag", () => {
  it("a secret in a { ...base, tok } spread → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let base = mkRec()\n  let kk = secret.get("api")\n  let rec = { ...base, tok: kk }\n  let x = http.post("u", rec)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("an embedding in a { ...base, v } spread → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let base = mkRec()\n  let e = EmbeddingModel.run(req)\n  let rec = { ...base, v: e }\n  let x = http.post("u", rec)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — A3 string interpolation keeps the flag", () => {
  it('a secret in `"...${k}..."` → FUNGI-SECRET-005', () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let msg = "Authorization: ${kk}"\n  let x = http.post("u", msg)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it('an embedding in `"...${e}..."` → FUNGI-PRIVACY-002', () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let msg = "vec=${e}"\n  let x = http.post("u", msg)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — A5 sink coverage (response.body / remote inference / vector store)", () => {
  it("a secret to response.body → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = response.body(kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("an embedding to ai.remoteInference → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let x = ai.remoteInference(e)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
  it("an embedding to VectorDB.write → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let x = VectorDB.write(e)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — A6 instance-receiver embedding recognizer", () => {
  it("a lowercase embeddingModel.run(...) → FUNGI-PRIVACY-002 (egress arm keeps the code)", () => {
    const r = chk(wrap('  let e = embeddingModel.run(req)\n  let x = http.post("u", e)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — A4 cross-flow propagation surfaces a warning", () => {
  const SRC = (rhs) => `secure flow egress(v: String) -> Int
contract { effects { network.outbound } }
{
  let r = http.post("u", v)
  return 0
}
secure flow caller(req: Request) -> Int
contract { effects { ai.inference  network.outbound } secrets { credential k { provider "vault" } } }
{
${rhs}
  return 0
}`;
  it("a secret passed to a user flow → FUNGI-SECRET-006 (warning)", () => {
    const r = chk(SRC('  let kk = secret.get("api")\n  let z = egress(kk)'));
    const d = r.diagnostics.find((x) => x.code === "FUNGI-SECRET-006");
    assert.ok(d && d.severity === "warning", codes(r));
  });
  it("an embedding passed to a user flow → FUNGI-PRIVACY-004 (warning)", () => {
    const r = chk(SRC('  let e = EmbeddingModel.run(req)\n  let z = egress(e)'));
    const d = r.diagnostics.find((x) => x.code === "FUNGI-PRIVACY-004");
    assert.ok(d && d.severity === "warning", codes(r));
  });
});

// RD-0124 NOW-2: in PRODUCTION the cross-flow secret/embedding handoff fails CLOSED (error), not just a
// warning — an unsealed secret crossing an inter-procedurally-unverified flow boundary must not ship.
describe("egress hardening — A4 cross-flow FAILS CLOSED in production (RD-0124 NOW-2)", () => {
  const SRC = (rhs) => `secure flow egress(v: String) -> Int
contract { effects { network.outbound } }
{
  let r = http.post("u", v)
  return 0
}
secure flow caller(req: Request) -> Int
contract { effects { ai.inference  network.outbound } secrets { credential k { provider "vault" } } }
{
${rhs}
  return 0
}`;
  const chkProd = (src) => checkValueStates(parseProgram(src, "test.fungi").ast, "production");
  it("a secret crossing a flow boundary → FUNGI-SECRET-006 ERROR in production", () => {
    const r = chkProd(SRC('  let kk = secret.get("api")\n  let z = egress(kk)'));
    const d = r.diagnostics.find((x) => x.code === "FUNGI-SECRET-006");
    assert.ok(d && d.severity === "error", codes(r));
  });
  it("an embedding crossing a flow boundary → FUNGI-PRIVACY-004 ERROR in production", () => {
    const r = chkProd(SRC('  let e = EmbeddingModel.run(req)\n  let z = egress(e)'));
    const d = r.diagnostics.find((x) => x.code === "FUNGI-PRIVACY-004");
    assert.ok(d && d.severity === "error", codes(r));
  });
});

// ── Container read-back: store in a record/array, read an element back, then egress ──
// The adversarial review flagged this as a possible gap; the propagation (container binding is
// tagged; member/index access carries the flag to the new binding) actually closes it. Locked in.
describe("egress hardening — container read-back is tracked", () => {
  it("secret stored in a record then read back via field → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let rec = { tok: kk }\n  let x = rec.tok\n  let y = http.post("u", x)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("secret stored in an array then read back via index → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let arr = [kk]\n  let x = arr[0]\n  let y = http.post("u", x)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("embedding stored in an array then read back via index → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let arr = [e]\n  let x = arr[0]\n  let y = http.post("u", x)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});

describe("egress hardening — no false positives", () => {
  it("seal()-ed embedding stays clean", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let s = seal(e)\n  let x = http.post("u", s)'));
    assert.ok(!has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
  it("a derived non-secret value stays clean", () => {
    const r = chk(wrap('  let a = build(1)\n  let b = a.slice(0,2)\n  let x = http.post("u", b)'));
    assert.ok(!has(r, "FUNGI-SECRET-005"), codes(r));
  });
});

describe("egress hardening — VSC-003 memberExpr receivers don't bypass the recognizers", () => {
  it("secret to a memberExpr network sink (client.http.post) → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  let x = client.http.post("u", kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("secret via a memberExpr source (ctx.secrets.get) then egressed → FUNGI-SECRET-005", () => {
    const r = chk(wrap('  let kk = ctx.secrets.get("api")\n  let x = http.post("u", kk)'));
    assert.ok(has(r, "FUNGI-SECRET-005"), codes(r));
  });
  it("embedding to a memberExpr sink (client.http.post) → FUNGI-PRIVACY-002", () => {
    const r = chk(wrap('  let e = EmbeddingModel.run(req)\n  let x = client.http.post("u", e)'));
    assert.ok(has(r, "FUNGI-PRIVACY-002"), codes(r));
  });
});
