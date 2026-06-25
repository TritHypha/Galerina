/**
 * contract { secrets {} } / { epilogue {} } / { economics {} } — parser recognition.
 *
 * These governed sub-blocks are AUTO-by-default (omitted → the runtime populates/handles
 * them, like economics) and an explicit declaration overrides. The Stage-A compiler must
 * recognize and RETAIN them as first-class contract sub-block nodes (not silently skip),
 * so downstream passes (governance, taint stamping, cost inference) can consume them.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram } from "../dist/index.js";

function contractSubBlocks(ast) {
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.kind === "contractDecl") {
      for (const c of n.children ?? []) out.push(c.value ?? c.kind);
    }
    for (const c of n.children ?? []) walk(c);
  })(ast);
  return out;
}

const SRC = `secure flow charge(amount: Int) -> Result<Int, String>
contract {
  intent { "Charge with sealed credentials and a proof receipt." }
  effects { database.write }
  economics { max_compute_cost "£0.05"  max_ai_tokens 5000 }
  secrets {
    credential db_password { provider "hashicorp_vault" path "secret/data/db" }
    rotation { interval 1h  strategy smooth_handshake  on_rotation_fault halt }
  }
  epilogue { generate_proof zk_snark_receipt  on_verification_failure halt_pipeline }
}
{
  AuditLog.write("charged")
  return Ok(amount)
}`;

describe("contract sub-blocks — secrets / epilogue / economics", () => {
  const parsed = parseProgram(SRC, "t.lln");

  it("parses with zero errors", () => {
    const errs = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, errs.map((e) => `${e.code}: ${e.message}`).join(", "));
  });

  it("retains economics, secrets, and epilogue as contract sub-blocks", () => {
    const blocks = contractSubBlocks(parsed.ast);
    assert.ok(blocks.includes("economics:block"), `economics missing: ${JSON.stringify(blocks)}`);
    // BUILD #110: secrets is now retained as a dedicated structured `secretsBlock` node (kind, not the
    // generic `secrets:block` value) so its credential/rotation body survives — see numeric/secrets test.
    assert.ok(blocks.includes("secretsBlock"), `secrets missing: ${JSON.stringify(blocks)}`);
    assert.ok(blocks.includes("epilogue:block"), `epilogue missing: ${JSON.stringify(blocks)}`);
  });

  it("a flow that omits secrets/epilogue still parses (auto-by-default, no block required)", () => {
    const p = parseProgram(`pure flow f() -> Int\ncontract { intent { "no governed blocks" } }\n{ return 1 }`, "t.lln");
    const errs = p.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, errs.map((e) => e.code).join(", "));
  });
});

describe("contract sub-blocks — cyber_physical_hardening + liability (auto-by-default)", () => {
  // Test: cyber_physical_hardening parses and is retained
  it("cyber_physical_hardening {} parses and is retained in contractDecl", () => {
    const p = parseProgram(`secure flow f(x: Int) -> Int
contract {
  intent { "Tier 1 sovereign flow." }
  effects { audit.write }
  economics { max_risk_liability "50000" }
  cyber_physical_hardening {
    enclosure_shielding active_mesh
    fault_mitigation lockstep
    on_tamper_signal zeroize
  }
}
{ return x }`, "t.lln");
    const errs = p.diagnostics.filter(d => d.severity === "error");
    assert.equal(errs.length, 0, errs.map(e => e.code).join(", "));
    const blocks = contractSubBlocks(p.ast);
    assert.ok(blocks.includes("cyber_physical_hardening:block"), `cyber_physical_hardening missing: ${JSON.stringify(blocks)}`);
  });

  // Test: liability {} parses (even though writing it manually is discouraged)
  it("liability {} parses (though writing it manually triggers GOV-018 warning)", () => {
    const p = parseProgram(`secure flow f(x: Int) -> Int
contract { intent { "x." }  effects { audit.write }  liability { max_exposure 10000 } }
{ return x }`, "t.lln");
    const errs = p.diagnostics.filter(d => d.severity === "error");
    assert.equal(errs.length, 0, errs.map(e => e.code).join(", "));
    const blocks = contractSubBlocks(p.ast);
    assert.ok(blocks.includes("liability:block"), `liability missing: ${JSON.stringify(blocks)}`);
  });

  // Test: omitting both blocks is correct (auto-by-default)
  it("omitting cyber_physical_hardening and liability is correct for normal flows (auto-by-default)", () => {
    const p = parseProgram(`pure flow f(x: Int) -> Int
contract { intent { "Standard flow — no manual hardening needed." } }
{ return x }`, "t.lln");
    const errs = p.diagnostics.filter(d => d.severity === "error");
    assert.equal(errs.length, 0);
    const blocks = contractSubBlocks(p.ast);
    assert.ok(!blocks.includes("cyber_physical_hardening:block"), "cyber_physical_hardening should be absent");
    assert.ok(!blocks.includes("liability:block"), "liability should be absent");
  });
});
