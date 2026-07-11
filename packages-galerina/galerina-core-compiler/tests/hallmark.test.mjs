// hallmark — RD-0353: developer-minted open types (a name, a carrier, a mandatory
// assay gate, a closed algebra schema). This suite is the §2c REFUSE gallery as
// executable acceptance: the mint accepts a well-formed declaration, and every
// abuse case (T1/T2/T3/T7/T9 + gate-mandatory + construction-only + non-unification
// + ops-deny) is refused, fail-closed. checkTypes() returns ALL diagnostics (the
// plain-vs-strict split is a CLI presentation layer), so a code present here is a
// code the checker emits.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkTypes } from "../dist/index.js";

function check(source) {
  const parsed = parseProgram(source, "hallmark.test.fungi");
  return checkTypes(parsed.ast);
}
const has = (r, code) => r.diagnostics.some((d) => d.code === code);
const codes = (r) => r.diagnostics.map((d) => d.code).join(", ") || "(none)";

// A well-formed pair: an identity hallmark and a quantity hallmark with a declared
// algebra. Both gates are parse-don't-validate (return Result), construction happens
// only inside the gate, and awardBonus uses only DECLARED ops.
const POSITIVE = `@version 1
hallmark CustomerRef of String {
  gate: flow assayCustomerRef
}
hallmark LoyaltyPoints of Decimal {
  ops:  { add, subtract, scale, compare }
  gate: flow assayPoints
}
pure flow assayCustomerRef(raw: String) -> Result<CustomerRef, ValidationError> {
  contract { intent "Assay a raw string into a CustomerRef." }
  return Ok(CustomerRef(raw))
}
pure flow assayPoints(raw: Decimal) -> Result<LoyaltyPoints, ValidationError> {
  contract { intent "Admit a whole, non-negative balance." }
  return Ok(LoyaltyPoints(raw))
}
pure flow awardBonus(base: LoyaltyPoints, bonus: LoyaltyPoints) -> LoyaltyPoints {
  contract { intent "Add a promotion bonus." }
  let total = base + bonus
  return total
}
`;

describe("Hallmark (RD-0353) — the mint accepts a well-formed declaration", () => {
  it("a gated hallmark with declared ops type-checks clean (no hallmark rejects)", () => {
    const r = check(POSITIVE);
    const rejects = r.diagnostics.filter(
      (d) => d.code.startsWith("FUNGI-HALLMARK") || d.code === "FUNGI-TYPE-003" || d.code === "FUNGI-TYPE-004",
    );
    assert.equal(rejects.length, 0, `expected no hallmark rejects, got: ${codes(r)}`);
  });

  it("declared 'add' means base + bonus is accepted", () => {
    // Same program; assert specifically the ops-deny code is absent.
    assert.ok(!has(check(POSITIVE), "FUNGI-HALLMARK-005"), "add is declared");
  });

  it("declared 'scale' means value * 2 is accepted and stays the hallmark type", () => {
    const r = check(POSITIVE + `
pure flow scaleOk(p: LoyaltyPoints) -> LoyaltyPoints {
  contract { intent "scale by a dimensionless factor" }
  let doubled = p * 2
  return doubled
}
`);
    assert.ok(!has(r, "FUNGI-HALLMARK-005"), `scale is declared; got: ${codes(r)}`);
    // p * 2 keeps LoyaltyPoints, so the LoyaltyPoints return type is satisfied (no TYPE-008).
    assert.ok(!has(r, "FUNGI-TYPE-008"), `scale preserves the hallmark type; got: ${codes(r)}`);
  });
});

// ── §2c REFUSE gallery — mint-time gates ─────────────────────────────────────
describe("Hallmark — mint-time gates (fail-closed)", () => {
  it("T1: minting a built-in name (Money) → FUNGI-HALLMARK-001", () => {
    assert.ok(has(check(`@version 1\nhallmark Money of Decimal { gate: flow g }`), "FUNGI-HALLMARK-001"));
  });
  it("T9: minting a currency/unit tag (GBP) → FUNGI-HALLMARK-001", () => {
    assert.ok(has(check(`@version 1\nhallmark GBP of Decimal { gate: flow g }`), "FUNGI-HALLMARK-001"));
  });
  it("T1: minting an epistemic/governance term (Verdict) → FUNGI-HALLMARK-001", () => {
    assert.ok(has(check(`@version 1\nhallmark Verdict of Int { gate: flow g }`), "FUNGI-HALLMARK-001"));
  });
  it("T1: minting an epistemic term (Trusted) → FUNGI-HALLMARK-001", () => {
    assert.ok(has(check(`@version 1\nhallmark Trusted of String { gate: flow g }`), "FUNGI-HALLMARK-001"));
  });
  it("gate mandatory: a hallmark with no gate → FUNGI-HALLMARK-003", () => {
    assert.ok(has(check(`@version 1\nhallmark NoGate of String { }`), "FUNGI-HALLMARK-003"));
  });
  it("a well-formed hallmark does NOT trip the gate-required check", () => {
    assert.ok(!has(check(`@version 1\nhallmark Okay of String { gate: flow g }`), "FUNGI-HALLMARK-003"));
  });
  it("T3/T7: an op outside the closed algebra (shell) → FUNGI-HALLMARK-004", () => {
    assert.ok(has(check(`@version 1\nhallmark Bad of Decimal { ops: { add, shell } gate: flow g }`), "FUNGI-HALLMARK-004"));
  });
  it("T3: a schema cannot grant an effect-shaped op (network) → FUNGI-HALLMARK-004", () => {
    assert.ok(has(check(`@version 1\nhallmark Bad2 of Decimal { ops: { network } gate: flow g }`), "FUNGI-HALLMARK-004"));
  });
  it("the closed algebra ops (add/subtract/scale/ratio/compare) are all accepted", () => {
    assert.ok(!has(check(`@version 1\nhallmark Q of Decimal { ops: { add, subtract, scale, ratio, compare } gate: flow g }`), "FUNGI-HALLMARK-004"));
  });
});

// ── §2c REFUSE gallery — use-site gates ──────────────────────────────────────
const BASE = `@version 1
hallmark CustomerRef of String { gate: flow assayCustomerRef }
hallmark LoyaltyPoints of Decimal {
  ops:  { add, subtract, scale, compare }
  gate: flow assayPoints
}
pure flow assayPoints(raw: Decimal) -> Result<LoyaltyPoints, ValidationError> {
  contract { intent "assay" }
  return Ok(LoyaltyPoints(raw))
}
`;

describe("Hallmark — use-site gates (fail-closed)", () => {
  it("§2c#3 — ratio undeclared: base / bonus → FUNGI-HALLMARK-005", () => {
    const r = check(BASE + `
pure flow r(base: LoyaltyPoints, bonus: LoyaltyPoints) -> Decimal {
  contract { intent "ratio" }
  let x = base / bonus
  return x
}
`);
    assert.ok(has(r, "FUNGI-HALLMARK-005"), codes(r));
  });

  it("§2c#4 — LoyaltyPoints and Money<GBP> never unify → FUNGI-TYPE-004", () => {
    const r = check(BASE + `
pure flow u(p: LoyaltyPoints, m: Money<GBP>) -> LoyaltyPoints {
  contract { intent "unify" }
  let x = p + m
  return x
}
`);
    assert.ok(has(r, "FUNGI-TYPE-004"), codes(r));
  });

  it("§2c#4 — two distinct hallmark types never unify → FUNGI-TYPE-004", () => {
    const r = check(BASE + `
pure flow d(c: CustomerRef, p: LoyaltyPoints) -> Void {
  contract { intent "distinct" }
  let x = c + p
}
`);
    assert.ok(has(r, "FUNGI-TYPE-004"), codes(r));
  });

  it("multiplying two hallmark values is dimensionally invalid → FUNGI-TYPE-004", () => {
    const r = check(BASE + `
pure flow m2(a: LoyaltyPoints, b: LoyaltyPoints) -> LoyaltyPoints {
  contract { intent "squared" }
  let x = a * b
  return x
}
`);
    assert.ok(has(r, "FUNGI-TYPE-004"), codes(r));
  });

  it("§2c#5 — construction only through the gate: let c: CustomerRef = \"…\" → FUNGI-TYPE-003", () => {
    const r = check(BASE + `
pure flow k(seed: String) -> CustomerRef {
  contract { intent "construct" }
  let c: CustomerRef = "CUST-00000001"
  return c
}
`);
    assert.ok(has(r, "FUNGI-TYPE-003"), codes(r));
  });

  it("declared ops pass: base + bonus (add) and base - bonus (subtract) are accepted", () => {
    const r = check(BASE + `
pure flow ok(base: LoyaltyPoints, bonus: LoyaltyPoints) -> LoyaltyPoints {
  contract { intent "ok" }
  let a = base + bonus
  let b = base - bonus
  return a
}
`);
    assert.ok(!has(r, "FUNGI-HALLMARK-005"), codes(r));
    assert.ok(!has(r, "FUNGI-TYPE-004"), codes(r));
  });
});

// ── §2c#7 — declare-or-reject (no use-equals-create, T6; reuses FUNGI-TYPE-001) ──
describe("Hallmark — declare-or-reject (the PHP hole is closed)", () => {
  it("a typo'd hallmark name is FUNGI-TYPE-001, not silently minted", () => {
    const r = check(`@version 1
hallmark CustomerRef of String { gate: flow g }
pure flow t(x: CustomerReff) -> Void { contract { intent "typo" } }
`);
    assert.ok(has(r, "FUNGI-TYPE-001"), codes(r));
  });
});
