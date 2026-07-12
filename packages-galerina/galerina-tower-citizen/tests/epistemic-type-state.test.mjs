// Epistemic type-state (the trust trit, RD-0337) — fail-closed soundness + the
// contagion ORACLE. Follows the three-valued-governance.test.mjs discipline: the
// CONTAGION property (combine = min-trit) and No-Coercion (an operand can only LOWER)
// are pinned against an INDEPENDENT hand-authored reference (Math.min over balanced
// trits), NOT against the module's own vAnd — so a delegation bug cannot hide.
//
// Spec: ../../../ZTF-Knowledge-Bases/galerina-rd-0337-beyond-rust-tri-typesafety-and-a-ternary-native-safety-primitive.md
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Verdict, GOV_3VL_DIAGNOSTIC,
  Trust,
  unverified, trustedRoot, refute, discharge,
  map, combine, combineAll,
  isTrusted, isUnverified, isRefuted, trustOf,
  requireTrusted,
  optimistic, reconcile,
  allContracts, anyContract, evaluateContract,
  validateTriSchema,
  classJoin, triTyped, combineTriTyped, declassify, releaseTo,
} from "../dist/index.js";

const TRITS = [Trust.REFUTED, Trust.UNKNOWN, Trust.PROVEN]; // -1, 0, 1
// INDEPENDENT references (hand-authored, NOT the module's folds): balanced-trit min/max.
const refMin = (a, b) => Math.min(a, b);
const refMax = (a, b) => Math.max(a, b);

describe("Trust encoding — the verdict trit, lifted", () => {
  it("uses the SAME numeric encoding as Verdict (so the shipped folds operate directly)", () => {
    assert.equal(Trust.PROVEN, Verdict.ALLOW);
    assert.equal(Trust.UNKNOWN, Verdict.INDETERMINATE);
    assert.equal(Trust.REFUTED, Verdict.DENY);
  });
});

describe("1. Constructors — all fail-closed", () => {
  it("unverified() defaults to UNKNOWN — a value that merely exists is never trusted", () => {
    const e = unverified("raw@input");
    assert.equal(e.trust, Trust.UNKNOWN);
    assert.equal(e.value, "raw@input");
    assert.ok(isUnverified(e));
  });
  it("trustedRoot() is PROVEN and records an auditable reason", () => {
    const e = trustedRoot(42, "compile-time-constant");
    assert.equal(e.trust, Trust.PROVEN);
    assert.ok(e.provenance.some((p) => p.includes("trusted-root")));
    assert.ok(isTrusted(e));
  });
  it("refute() is REFUTED", () => {
    const e = refute("bad", "known-malicious");
    assert.equal(e.trust, Trust.REFUTED);
    assert.ok(isRefuted(e));
  });
});

describe("2. discharge — the ONLY sanctioned lift path", () => {
  it("UNKNOWN + passing verifier → PROVEN", () => {
    const e = discharge(unverified(5), (n) => n > 0, "positive");
    assert.equal(e.trust, Trust.PROVEN);
  });
  it("UNKNOWN + failing verifier → REFUTED (checked, and it failed)", () => {
    const e = discharge(unverified(-5), (n) => n > 0, "positive");
    assert.equal(e.trust, Trust.REFUTED);
  });
  it("UNKNOWN + THROWING verifier → UNKNOWN (inconclusive, never PROVEN — fail-closed)", () => {
    const e = discharge(unverified(5), () => { throw new Error("verifier exploded"); }, "boom");
    assert.equal(e.trust, Trust.UNKNOWN);
  });
  it("REFUTED is STICKY — re-verification with a passing verifier cannot resurrect it", () => {
    const e = discharge(refute(5, "poisoned"), () => true, "retry");
    assert.equal(e.trust, Trust.REFUTED);
    assert.ok(e.provenance.some((p) => p.includes("discharge-skipped(refuted)")));
  });
  it("PROVEN re-verified failing → REFUTED; re-verified throwing → UNKNOWN (drops)", () => {
    assert.equal(discharge(trustedRoot(5, "x"), () => false, "recheck").trust, Trust.REFUTED);
    assert.equal(discharge(trustedRoot(5, "x"), () => { throw 0; }, "recheck").trust, Trust.UNKNOWN);
  });
});

describe("3. map — preserves the trit (a pure transform never launders trust)", () => {
  it("keeps UNKNOWN unknown and PROVEN proven while transforming the payload", () => {
    assert.equal(map(unverified(2), (n) => n * 10).trust, Trust.UNKNOWN);
    assert.equal(map(unverified(2), (n) => n * 10).value, 20);
    assert.equal(map(trustedRoot(2, "x"), (n) => n * 10).trust, Trust.PROVEN);
  });
});

describe("4. combine — CONTAGION (oracle: = min-trit) + No-Coercion", () => {
  it("for ALL 9 trit pairs, combine's trit === independent Math.min reference", () => {
    for (const a of TRITS) {
      for (const b of TRITS) {
        const ea = { value: 1, trust: a, provenance: [] };
        const eb = { value: 2, trust: b, provenance: [] };
        const out = combine(ea, eb, (x, y) => x + y);
        assert.equal(out.trust, refMin(a, b), `combine(${a},${b})`);
        assert.equal(out.value, 3);
      }
    }
  });
  it("No-Coercion: the result can NEVER exceed either operand (unknown/refuted only lowers)", () => {
    for (const a of TRITS) {
      for (const b of TRITS) {
        const out = combine({ value: 0, trust: a, provenance: [] }, { value: 0, trust: b, provenance: [] }, () => 0);
        assert.ok(out.trust <= a && out.trust <= b, `no-coercion ${a},${b}`);
      }
    }
  });
  it("Trusted+Unverified → Unverified; anything+Refuted → Refuted", () => {
    assert.equal(combine(trustedRoot(1, "x"), unverified(2), (a, b) => a + b).trust, Trust.UNKNOWN);
    assert.equal(combine(trustedRoot(1, "x"), refute(2, "bad"), (a, b) => a + b).trust, Trust.REFUTED);
  });
});

describe("combineAll — allOf min-fold, deny-by-default empty", () => {
  it("empty → UNKNOWN (no vacuous PROVEN)", () => {
    assert.equal(combineAll([]).trust, Trust.UNKNOWN);
  });
  it("all-proven → PROVEN; one-unknown → UNKNOWN; one-refuted → REFUTED", () => {
    assert.equal(combineAll([trustedRoot(1, "a"), trustedRoot(2, "b")]).trust, Trust.PROVEN);
    assert.equal(combineAll([trustedRoot(1, "a"), unverified(2)]).trust, Trust.UNKNOWN);
    assert.equal(combineAll([trustedRoot(1, "a"), refute(2, "x")]).trust, Trust.REFUTED);
  });
  it("collects the payloads in order", () => {
    assert.deepEqual(combineAll([trustedRoot(1, "a"), trustedRoot(2, "b")]).value, [1, 2]);
  });
});

describe("requireTrusted — the fail-closed boundary", () => {
  it("PROVEN → authorized, releases the value", () => {
    const r = requireTrusted(trustedRoot("secret-data", "root"));
    assert.equal(r.authorized, true);
    assert.equal(r.value, "secret-data");
    assert.equal(r.diagnostic, null);
  });
  it("UNKNOWN → deny, value withheld (null), audited FUNGI-GOV-3VL-001", () => {
    let captured = null;
    const r = requireTrusted(unverified("maybe"), (d) => { captured = d; });
    assert.equal(r.authorized, false);
    assert.equal(r.value, null);
    assert.equal(r.diagnostic?.code, GOV_3VL_DIAGNOSTIC);
    assert.equal(captured?.code, GOV_3VL_DIAGNOSTIC);
  });
  it("REFUTED → deny, value withheld, NO indeterminate diagnostic (ordinary refusal)", () => {
    const r = requireTrusted(refute("bad", "x"));
    assert.equal(r.authorized, false);
    assert.equal(r.value, null);
    assert.equal(r.diagnostic, null);
  });
  it("trustOf reports the trit", () => {
    assert.equal(trustOf(unverified(1)), Trust.UNKNOWN);
  });
});

describe("4b. optimistic-then-verify", () => {
  it("optimistic() is UNKNOWN — an approximation can never be mistaken for a verified result", () => {
    const approx = optimistic(3.14159, "photonic-lane");
    assert.equal(approx.trust, Trust.UNKNOWN);
    assert.equal(requireTrusted(approx).authorized, false);
  });
  it("reconcile discharges against the exact oracle (pass→PROVEN, fail→REFUTED)", () => {
    assert.equal(reconcile(optimistic(10), (n) => n === 10, "exact").trust, Trust.PROVEN);
    assert.equal(reconcile(optimistic(10), (n) => n === 11, "exact").trust, Trust.REFUTED);
  });
});

describe("2. Abstaining K3 contract — ALLOW / DENY / ABSTAIN that composes", () => {
  const positive = (n) => (n > 0 ? Verdict.ALLOW : Verdict.DENY);
  const abstain = () => Verdict.INDETERMINATE;

  it("allContracts folds via allOf; a single ABSTAIN keeps the whole INDETERMINATE (safe)", () => {
    assert.equal(allContracts([positive, abstain])(5), Verdict.INDETERMINATE);
    assert.equal(allContracts([positive, positive])(5), Verdict.ALLOW);
    assert.equal(allContracts([positive, positive])(-1), Verdict.DENY);
    assert.equal(allContracts([])(5), Verdict.INDETERMINATE); // deny-by-default
  });
  it("anyContract folds via anyOf", () => {
    assert.equal(anyContract([positive, abstain])(-1), Verdict.INDETERMINATE);
    assert.equal(anyContract([positive, () => Verdict.ALLOW])(-1), Verdict.ALLOW);
  });
  it("enforce: proceeds only on ALLOW; ABSTAIN and DENY both stop (fail-closed); ABSTAIN audited", () => {
    assert.equal(evaluateContract(5, positive, "enforce").proceed, true);
    const denied = evaluateContract(-1, positive, "enforce");
    assert.equal(denied.proceed, false);
    assert.equal(denied.violated, true);
    const abstained = evaluateContract(5, abstain, "enforce");
    assert.equal(abstained.proceed, false);
    assert.equal(abstained.violated, true);
    assert.equal(abstained.diagnostic?.code, GOV_3VL_DIAGNOSTIC);
  });
  it("observe: detected-but-proceed (violation surfaced, never silent)", () => {
    const o = evaluateContract(-1, positive, "observe");
    assert.equal(o.proceed, true);
    assert.equal(o.violated, true);
  });
  it("ignore: proceeds regardless, still reports the verdict", () => {
    const i = evaluateContract(-1, positive, "ignore");
    assert.equal(i.proceed, true);
    assert.equal(i.verdict, Verdict.DENY);
  });
});

describe("3. Tri-schema — present / unknown-pending / forbidden", () => {
  const schema = {
    id: { requirement: "required", verify: (v) => typeof v === "string" },
    email: { requirement: "optional-pending", verify: (v) => typeof v === "string" && v.includes("@") },
    banned: { requirement: "forbidden" },
  };

  it("fully-known valid record → PROVEN; known holds the proven fields", () => {
    const r = validateTriSchema({ id: "u1", email: "a@b.com" }, schema);
    assert.equal(r.verdict, Verdict.ALLOW);
    assert.deepEqual(r.known, { id: "u1", email: "a@b.com" });
  });
  it("optional-pending ABSENT → record UNKNOWN, but the known parts are still usable (partial-knowledge safe)", () => {
    const r = validateTriSchema({ id: "u1" }, schema);
    assert.equal(r.fields.email.trust, Trust.UNKNOWN);
    assert.equal(r.verdict, Verdict.INDETERMINATE);
    assert.deepEqual(r.known, { id: "u1" });
    assert.equal(r.diagnostic?.code, GOV_3VL_DIAGNOSTIC);
  });
  it("required MISSING → REFUTED record", () => {
    assert.equal(validateTriSchema({ email: "a@b.com" }, schema).verdict, Verdict.DENY);
  });
  it("forbidden PRESENT → REFUTED record", () => {
    assert.equal(validateTriSchema({ id: "u1", banned: "x" }, schema).fields.banned.trust, Trust.REFUTED);
    assert.equal(validateTriSchema({ id: "u1", banned: "x" }, schema).verdict, Verdict.DENY);
  });
  it("forbidden ABSENT → PROVEN (correctly absent)", () => {
    assert.equal(validateTriSchema({ id: "u1" }, schema).fields.banned.trust, Trust.PROVEN);
  });
  it("present but verify FAILS → REFUTED field", () => {
    assert.equal(validateTriSchema({ id: 123 }, schema).fields.id.trust, Trust.REFUTED);
  });
});

describe("+ 3-axis type ⟨what × proven × classification⟩", () => {
  it("triTyped defaults BOTH governed axes fail-closed (proven=UNKNOWN, class=secret)", () => {
    const v = triTyped("payload");
    assert.equal(v.proven, Trust.UNKNOWN);
    assert.equal(v.classification, "secret");
  });
  it("classJoin ⊔ takes the most-restrictive (contagious UPWARD)", () => {
    assert.equal(classJoin("public", "secret"), "secret");
    assert.equal(classJoin("internal", "public"), "internal");
    assert.equal(classJoin("public", "public"), "public");
  });
  it("combineTriTyped is contagious on BOTH axes (proven=min, class=most-restrictive)", () => {
    const out = combineTriTyped(
      triTyped(1, { proven: Trust.PROVEN, classification: "public" }),
      triTyped(2, { proven: Trust.UNKNOWN, classification: "internal" }),
      (a, b) => a + b,
    );
    assert.equal(out.value, 3);
    assert.equal(out.proven, Trust.UNKNOWN);
    assert.equal(out.classification, "internal");
  });
  it("releaseTo: PROVEN + class ≤ sink → allow", () => {
    const r = releaseTo(triTyped("x", { proven: Trust.PROVEN, classification: "public" }), "internal");
    assert.equal(r.authorized, true);
    assert.equal(r.value, "x");
  });
  it("releaseTo: secret value → public sink is a LEAK → deny, value withheld", () => {
    const r = releaseTo(triTyped("x", { proven: Trust.PROVEN, classification: "secret" }), "public");
    assert.equal(r.classVerdict, Verdict.DENY);
    assert.equal(r.authorized, false);
    assert.equal(r.value, null);
  });
  it("releaseTo: UNKNOWN proven → deny + FUNGI-GOV-3VL-001 even when classification clears", () => {
    const r = releaseTo(triTyped("x", { proven: Trust.UNKNOWN, classification: "public" }), "public");
    assert.equal(r.authorized, false);
    assert.equal(r.diagnostic?.code, GOV_3VL_DIAGNOSTIC);
  });
  it("composite is allOf(proven, class) — either axis can only lower the outcome", () => {
    // proven ALLOW, class ALLOW → ALLOW ; proven ALLOW, class DENY → DENY
    assert.equal(releaseTo(triTyped(1, { proven: Trust.PROVEN, classification: "public" }), "public").composite, Verdict.ALLOW);
    assert.equal(releaseTo(triTyped(1, { proven: Trust.PROVEN, classification: "secret" }), "public").composite, Verdict.DENY);
  });
});

describe("ZERO-TRUST INVARIANTS I1–I4 (owner-ratified 2026-07-10)", () => {
  const abstain = () => Verdict.INDETERMINATE;

  it("I1: only +1 authorizes — ABSTAIN and DENY both deny at every boundary", () => {
    for (const t of [Trust.REFUTED, Trust.UNKNOWN]) {
      assert.equal(requireTrusted({ value: 1, trust: t, provenance: [] }).authorized, false, `trust ${t}`);
    }
    assert.equal(evaluateContract(0, abstain, "enforce").proceed, false);
    assert.equal(evaluateContract(0, () => Verdict.DENY, "enforce").proceed, false);
  });

  it("I2: composition only lowers/defers — allOf([ALLOW,ABSTAIN]) defers→deny; anyOf never upgrades ABSTAIN to ALLOW", () => {
    assert.equal(allContracts([() => Verdict.ALLOW, abstain])(0), Verdict.INDETERMINATE);
    assert.equal(anyContract([() => Verdict.DENY, abstain])(0), Verdict.INDETERMINATE);
  });

  it("I3: abstention is LOUD in EVERY mode — the audit sink fires under enforce, observe AND ignore", () => {
    for (const mode of ["enforce", "observe", "ignore"]) {
      let heard = null;
      evaluateContract(0, abstain, mode, (d) => { heard = d; });
      assert.equal(heard?.code, GOV_3VL_DIAGNOSTIC, `mode ${mode} must not silence the audit`);
    }
  });

  it("I3b: 'denied by policy' (DENY, no diagnostic) is distinguishable from 'check could not run' (ABSTAIN, diagnostic)", () => {
    assert.equal(evaluateContract(0, () => Verdict.DENY, "enforce").diagnostic, null);
    assert.equal(evaluateContract(0, abstain, "enforce").diagnostic?.code, GOV_3VL_DIAGNOSTIC);
  });

  it("I4: an outcome existing is NOT a grant — authorization only via explicit booleans", () => {
    const o = evaluateContract(0, abstain, "ignore");
    assert.equal(o.proceed, true); // functional-safety escape hatch…
    assert.equal(o.violated, true); // …but explicitly NOT a clean pass
    assert.notEqual(o.verdict, Verdict.ALLOW); // a consumer reading "has outcome ⇒ go" has both flags against it
  });
});

describe("declassify — the audited gate DOWN the classification lattice (axis-3 discharge)", () => {
  it("lowers only through an encode/redact transform + records provenance; trust (axis 2) rides unchanged", () => {
    const v = triTyped({ email: "a@b.com" }, { proven: Trust.UNKNOWN, classification: "secret" });
    const out = declassify(v, "public", () => ({ email: "***redacted***" }), "redact-pii");
    assert.equal(out.classification, "public");
    assert.deepEqual(out.value, { email: "***redacted***" });
    assert.equal(out.proven, Trust.UNKNOWN); // orthogonal: declassify never touches trust
    assert.ok(out.provenance.some((p) => p.includes("declassified:secret→public:redact-pii")));
  });
  it("a non-lowering target is a HARD error (raising is classJoin's job)", () => {
    assert.throws(() => declassify(triTyped(1, { classification: "public" }), "secret", (x) => x, "nope"));
    assert.throws(() => declassify(triTyped(1, { classification: "internal" }), "internal", (x) => x, "same"));
  });
  it("a throwing encoder aborts — nothing is released", () => {
    assert.throws(
      () => declassify(triTyped(1, { classification: "secret" }), "public", () => { throw new Error("encoder down"); }, "x"),
      /encoder down/,
    );
  });
  it("declassified output passes releaseTo where the original was a leak-DENY", () => {
    const secret = triTyped("raw-pii", { proven: Trust.PROVEN, classification: "secret" });
    assert.equal(releaseTo(secret, "public").authorized, false); // leak → deny
    const pub = declassify(secret, "public", () => "redacted", "egress-encode");
    assert.equal(releaseTo(pub, "public").authorized, true);
    assert.equal(releaseTo(pub, "public").value, "redacted"); // the ENCODED payload leaves, never the original
  });
});
