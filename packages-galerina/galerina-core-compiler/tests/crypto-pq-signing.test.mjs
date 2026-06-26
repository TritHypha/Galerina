// SPORE-CRYPTO-PQ-001 (#34 capstone): a crypto.sign effect in a CERTIFIED profile must declare a
// post-quantum/hybrid signing algorithm. Ed25519-only signatures are Shor-breakable (harvest-now-
// forge-later), so they are denied in production/deterministic profiles; dev allows them.
// The algorithm is asserted with a marker effect alongside crypto.sign:
//   effects { crypto.sign crypto.sign.hybrid }   ← PASS
//   effects { crypto.sign }                       ← FAIL in a certified profile (no algorithm)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkEffects, verifyGovernance } from "../dist/index.js";

function verify(effects, profile) {
  const src = `secure flow signReceipt(req: Request) -> Result<Response, ApiError>
contract { effects { ${effects} } }
{ return Ok(Response.ok({})) }`;
  const parsed = parseProgram(src, "t.spore");
  const eff = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, eff, profile);
}
const has = (r) => r.diagnostics.some((d) => d.code === "SPORE-CRYPTO-PQ-001");

describe("SPORE-CRYPTO-PQ-001 — Sign effects must be post-quantum in a certified profile", () => {
  it("bare crypto.sign in production is DENIED (no algorithm declared)", () => {
    assert.equal(has(verify("crypto.sign audit.write", "production")), true);
  });
  it("crypto.sign + crypto.sign.hybrid in production is allowed", () => {
    assert.equal(has(verify("crypto.sign crypto.sign.hybrid audit.write", "production")), false);
  });
  it("crypto.sign + crypto.sign.mldsa65 in production is allowed", () => {
    assert.equal(has(verify("crypto.sign crypto.sign.mldsa65 audit.write", "production")), false);
  });
  it("crypto.sign + crypto.sign.slhdsa in production is allowed", () => {
    assert.equal(has(verify("crypto.sign crypto.sign.slhdsa audit.write", "production")), false);
  });
  it("crypto.sign + crypto.sign.ed25519 (classical only) in production is DENIED", () => {
    assert.equal(has(verify("crypto.sign crypto.sign.ed25519 audit.write", "production")), true);
  });
  it("bare crypto.sign in DEV is allowed (rule is certified-profile-only)", () => {
    assert.equal(has(verify("crypto.sign audit.write", "dev")), false);
  });
  it("a flow with no signing is inert (no SPORE-CRYPTO-PQ-001)", () => {
    assert.equal(has(verify("database.read", "production")), false);
  });
  it("deterministic profile also enforces it", () => {
    assert.equal(has(verify("crypto.sign audit.write", "deterministic")), true);
  });
});
