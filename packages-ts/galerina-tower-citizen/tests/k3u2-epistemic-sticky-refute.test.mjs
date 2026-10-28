// K3U2 epistemic sticky-refute red tests (gcw-k3u4, 2026-10-25).
// After K3U2 made governance vAnd/allOf UNKNOWN-infectious, epistemic combine (which delegated to vAnd)
// let UNKNOWN absorb REFUTED: combine(refuted, unverified) became UNKNOWN, and discharge could then lift it
// to PROVEN. RD-0337 requires REFUTED to be sticky. The trust meet is REFUTED < UNKNOWN < PROVEN.
// K3-SK 2026-10-28: governance logic is now strong Kleene (DENY/REFUTED absorbs UNKNOWN under AND) in
// the shipped .fungi flows; the UNKNOWN-infectious vAnd above is the frozen, known-divergent TS reference.
// Synthetic data only.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Trust, Verdict, K3_UNKNOWN, unverified, trustedRoot, refute, discharge,
  combine, combineAll, validateTriSchema, triTyped, combineTriTyped,
} from "../dist/index.js";

test("K3U2-ET1 combine(refuted, unverified) is REFUTED in both orders", () => {
  assert.equal(combine(refute(1, "bad"), unverified(2), (a, b) => a + b).trust, Trust.REFUTED);
  assert.equal(combine(unverified(2), refute(1, "bad"), (a, b) => a + b).trust, Trust.REFUTED);
});

test("K3U2-ET2 a refuted operand cannot be laundered to PROVEN through combine then discharge", () => {
  const mixed = combine(refute(1, "bad"), unverified(2), (a, b) => a + b);
  assert.equal(discharge(mixed, () => true, "verifier-ok").trust, Trust.REFUTED);
});

test("K3U2-ET3 combineAll and combineTriTyped keep REFUTED dominant over UNKNOWN", () => {
  assert.equal(combineAll([unverified(1), refute(2, "x"), trustedRoot(3, "r")]).trust, Trust.REFUTED);
  assert.equal(combineAll([]).trust, Trust.UNKNOWN);
  assert.equal(combineAll([trustedRoot(1, "r"), unverified(2)]).trust, Trust.UNKNOWN);
  const out = combineTriTyped(
    triTyped(1, { proven: Trust.REFUTED, classification: "public" }),
    triTyped(2, { proven: Trust.UNKNOWN, classification: "public" }),
    (a, b) => a + b,
  );
  assert.equal(out.proven, Trust.REFUTED);
});

test("K3U2-ET4 tri-schema: a forbidden field present is a DENY record even when a pending field is absent", () => {
  const schema = {
    id: { requirement: "required", verify: (v) => typeof v === "string" },
    email: { requirement: "optional-pending", verify: (v) => typeof v === "string" },
    banned: { requirement: "forbidden" },
  };
  assert.equal(validateTriSchema({ id: "u1", banned: "x" }, schema).verdict, Verdict.DENY);
});

test("K3U2-ET5 the trust meet refuses non-trust values (NEUTRAL 0, junk, forged sentinel)", () => {
  const forged = Object.freeze({ kind: "K3_UNKNOWN", toString() { return "K3_UNKNOWN"; } });
  for (const bad of [0, Verdict.NEUTRAL, 2, NaN, "1", null, undefined, forged]) {
    assert.throws(() => combine({ value: 0, trust: bad, provenance: [] }, trustedRoot(1, "r"), () => 0), `trust ${String(bad)} must refuse`);
    assert.throws(() => combine(trustedRoot(1, "r"), { value: 0, trust: bad, provenance: [] }, () => 0), `trust ${String(bad)} must refuse (rhs)`);
  }
  assert.equal(Trust.UNKNOWN, K3_UNKNOWN);
});