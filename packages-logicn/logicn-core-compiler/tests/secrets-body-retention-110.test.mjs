// =============================================================================
// BUILD #110 — secrets{} body retention + secret-rotation ProofObligation (RD-0103)
//
// Before this build, the secrets{} credential/rotation body was DROPPED by the generic
// parseContractSubBlock (the declared credential policy silently discarded = fail-open).
// parseSecretsBlock now RETAINS it as a structured `secretsBlock` (credentialDecl/rotationDecl),
// and generateManifest binds a rotation policy to a SIGNED `secret-rotation` ProofObligation so the
// declared policy is machine-checkable. The rotation ENGINE stays in logicn-ext-secrets-vault
// (govern-don't-absorb); core only retains + records the policy.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram } from "../dist/index.js";
import { generateManifest } from "../dist/manifest-generator.js";

const SRC = `secure flow chargeCard(amount: Int) -> Int effects [secret.read database.write] {
  contract {
    secrets {
      credential db { provider vault path "secret/data/db" }
      rotation { interval 24h on_rotation_fault halt }
    }
  }
  return amount
}`;

function findDeep(node, kind, out = []) {
  if (node == null || typeof node !== "object") return out;
  if (node.kind === kind) out.push(node);
  for (const c of node.children ?? []) findDeep(c, kind, out);
  return out;
}

describe("BUILD #110: secrets{} body is RETAINED in the AST", () => {
  const { ast, diagnostics } = parseProgram(SRC, "t.lln");

  it("parses with zero errors", () => {
    const errs = (diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, errs.map((e) => `${e.code}: ${e.message}`).join(", "));
  });

  it("emits a structured secretsBlock with a credentialDecl carrying provider + path", () => {
    const secretsBlocks = findDeep(ast, "secretsBlock");
    assert.equal(secretsBlocks.length, 1, "exactly one secretsBlock");
    const creds = findDeep(secretsBlocks[0], "credentialDecl");
    assert.equal(creds.length, 1);
    assert.equal(creds[0].value, "db", "credential name retained");
    const credVals = (creds[0].children ?? []).map((c) => c.value);
    assert.ok(credVals.includes("provider:vault"), `provider missing: ${JSON.stringify(credVals)}`);
    // Values are stored VERBATIM (opaque to core — the ext engine interprets them), so a quoted
    // string keeps its quotes. The path is retained, not dropped; it is not part of the signed
    // obligation (only credential name + interval + fault are), so verbatim is signature-stable.
    assert.ok(credVals.some((v) => v.startsWith("path:") && v.includes("secret/data/db")), `path missing: ${JSON.stringify(credVals)}`);
  });

  it("emits a rotationDecl carrying the full duration (24h, not truncated to 24) + fault handler", () => {
    const rots = findDeep(ast, "rotationDecl");
    assert.equal(rots.length, 1);
    const rotVals = (rots[0].children ?? []).map((c) => c.value);
    assert.ok(rotVals.includes("interval:24h"), `interval not 24h (duration suffix dropped?): ${JSON.stringify(rotVals)}`);
    assert.ok(rotVals.includes("on_rotation_fault:halt"), `fault handler missing: ${JSON.stringify(rotVals)}`);
  });
});

describe("BUILD #110: manifest emits a signed secret-rotation ProofObligation", () => {
  const { ast, flows } = parseProgram(SRC, "t.lln");
  const manifest = generateManifest(SRC, "t.lln", flows, undefined, "2026-06-25T00:00:00.000Z", ast, SRC);
  const rotation = (manifest.proofObligations ?? []).filter((o) => o.kind === "secret-rotation");

  it("binds the declared rotation policy to a runtime-precheck obligation", () => {
    assert.equal(rotation.length, 1, "one secret-rotation obligation");
    assert.equal(rotation[0].flowName, "chargeCard");
    assert.equal(rotation[0].verified, "runtime-precheck");
    assert.match(rotation[0].description, /db rotates every 24h; on_rotation_fault=halt/);
  });
});

describe("BUILD #110: no false obligations / edge cases", () => {
  it("secrets{} with NO rotation policy emits NO secret-rotation obligation", () => {
    const src = `secure flow f(x: Int) -> Int effects [secret.read] {
  contract { secrets { credential api { provider vault } } }
  return x
}`;
    const { ast, flows } = parseProgram(src, "t.lln");
    const m = generateManifest(src, "t.lln", flows, undefined, "2026-06-25T00:00:00.000Z", ast, src);
    assert.equal((m.proofObligations ?? []).filter((o) => o.kind === "secret-rotation").length, 0);
  });

  it("a flow with NO secrets{} at all emits NO secret-rotation obligation (and still parses)", () => {
    const src = `pure flow f() -> Int\ncontract { intent { "no secrets" } }\n{ return 1 }`;
    const { ast, flows, diagnostics } = parseProgram(src, "t.lln");
    assert.equal((diagnostics ?? []).filter((d) => d.severity === "error").length, 0);
    const m = generateManifest(src, "t.lln", flows, undefined, "2026-06-25T00:00:00.000Z", ast, src);
    assert.equal((m.proofObligations ?? []).filter((o) => o.kind === "secret-rotation").length, 0);
  });

  it("an unknown NESTED block inside the body does not desync the parser (downstream flow intact)", () => {
    // Adversarial: a provider config or strategy with a nested {…} must be drained as a unit, not
    // token-by-token (which would consume the wrong } and swallow the next flow's governance).
    const src = `secure flow a(x: Int) -> Int effects [secret.read] {
  contract { secrets { credential db { provider vault aws { region useast1 } } rotation { interval 1h strategy { mode smooth } } } }
  return x
}
secure flow b(y: Int) -> Int effects [database.write] {
  contract { effects { database.write } }
  return y
}`;
    const { flows, diagnostics } = parseProgram(src, "t.lln");
    assert.equal((diagnostics ?? []).filter((d) => d.severity === "error").length, 0);
    assert.equal(flows.length, 2, "both flows parse despite the nested unknown blocks");
    const b = flows.find((f) => f.name === "b");
    assert.ok(b?.declaredEffects?.includes("database.write"), "downstream flow b's effects survived (no desync)");
  });

  it("multiple credentials under one rotation policy → one obligation each", () => {
    const src = `secure flow f(x: Int) -> Int effects [secret.read] {
  contract {
    secrets {
      credential db { provider vault }
      credential cache { provider vault }
      rotation { interval 1h }
    }
  }
  return x
}`;
    const { ast, flows } = parseProgram(src, "t.lln");
    const m = generateManifest(src, "t.lln", flows, undefined, "2026-06-25T00:00:00.000Z", ast, src);
    const rot = (m.proofObligations ?? []).filter((o) => o.kind === "secret-rotation");
    assert.equal(rot.length, 2);
    assert.ok(rot.some((o) => /db rotates every 1h/.test(o.description)));
    assert.ok(rot.some((o) => /cache rotates every 1h/.test(o.description)));
  });
});
