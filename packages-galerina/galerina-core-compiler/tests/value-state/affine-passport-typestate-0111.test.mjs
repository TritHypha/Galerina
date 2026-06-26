// =============================================================================
// RD-0111 — affine consume-once + monotone Raw→Verified→Authorized→Sealed passport typestate.
//
// Two compile-time denies on Passport-typed values in the shipped value-state checker:
//   SPORE-AFFINE-001   — a passport consumed at an authority sink cannot be re-used (affine/linear).
//   SPORE-PASSPORT-002 — a passport below a sink's required stage is denied (illegal stage-skip).
// Lifts the rd-0087 proven abstract invariant onto real .spore source. Binary/digital, deny-by-default
// (an un-gated passport is Raw=0). The chain-recognition (`authorize.passport(v)` where v is an
// unannotated let-binding) is the load-bearing detail the original build-spec got wrong.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkValueStates } from "../../dist/index.js";

const codes = (src) =>
  (checkValueStates(parseProgram(src).ast, "production").diagnostics ?? []).map((d) => String(d.code));
const isPassportDeny = (c) => /AFFINE|PASSPORT/i.test(c);

describe("RD-0111 passport typestate: the two denies fire", () => {
  it("consume-once: a passport re-used at a second authority sink → SPORE-AFFINE-001", () => {
    const c = codes(`secure flow grantTwice(p: Passport) -> Bool {
  let v = verify.passport(p)
  let a = authorize.passport(v)
  database.write(a)
  response.body(a)
}`);
    assert.ok(c.includes("SPORE-AFFINE-001"), `expected SPORE-AFFINE-001, got: ${c.join(",")}`);
  });

  it("state-skip: a Raw passport at an Authorized-requiring sink → SPORE-PASSPORT-002", () => {
    const c = codes(`secure flow skipStages(p: Passport) -> Bool {
  response.body(p)
}`);
    assert.ok(c.includes("SPORE-PASSPORT-002"), `expected SPORE-PASSPORT-002, got: ${c.join(",")}`);
  });
});

describe("RD-0111 passport typestate: not over-broad", () => {
  it("a legal single-use, in-order flow fires ZERO passport denies (the chain stamps each stage)", () => {
    const c = codes(`secure flow grantOnce(p: Passport) -> Bool {
  let v = verify.passport(p)
  let a = authorize.passport(v)
  let s = seal.passport(a)
  database.write(s)
}`);
    assert.equal(c.filter(isPassportDeny).length, 0, `over-broad: ${c.filter(isPassportDeny).join(",")}`);
  });

  it("an over-qualified passport (Sealed at an Authorized-requiring sink) is allowed", () => {
    const c = codes(`secure flow sealedOk(p: Passport) -> Bool {
  let v = verify.passport(p)
  let a = authorize.passport(v)
  let s = seal.passport(a)
  response.body(s)
}`);
    assert.equal(c.filter(isPassportDeny).length, 0, `over-qualified should pass: ${c.filter(isPassportDeny).join(",")}`);
  });

  it("a NON-passport value at the same sink fires no passport deny (gate scoped to Passport bindings)", () => {
    const c = codes(`secure flow plain(x: String) -> Bool {
  let safeX = validate.text(x)
  database.write(safeX)
}`);
    assert.equal(c.filter(isPassportDeny).length, 0);
  });
});
