// partial-return.test.mjs — K3 ternary partial-return / Masked per-field shaper (R&D 0108 #2).
//
// Proves: ALLOW fields pass through byte-identical; DENY/INDETERMINATE fields become a typed
// Masked sentinel (keep-the-rest); deny-by-default on undefined/empty verdicts; per-field vAnd
// fold of actor caps; FUNGI-GOV-3VL-001 carried + sunk on every INDETERMINATE collapse; and the
// soundness invariant that a non-ALLOW verdict can NEVER return the value.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  partialReturn,
  maskByVerdict,
  isMasked,
  Verdict,
} from "../dist/index.js";

const { ALLOW, INDETERMINATE, DENY } = Verdict;

test("maskByVerdict: ALLOW keeps (null); DENY and INDETERMINATE withhold", () => {
  assert.equal(maskByVerdict(ALLOW), null, "ALLOW → keep the value");
  const d = maskByVerdict(DENY);
  assert.ok(isMasked(d) && d.reason === "denied" && d.verdict === DENY && d.diagnostic.kind === "NONE");
  const i = maskByVerdict(INDETERMINATE);
  assert.ok(isMasked(i) && i.reason === "indeterminate" && i.verdict === INDETERMINATE);
  assert.equal(i.diagnostic?.code, "FUNGI-GOV-3VL-001", "INDETERMINATE carries the audit diagnostic");
});

test("deny-by-default: undefined verdict and empty cap set both withhold (INDETERMINATE)", () => {
  const u = maskByVerdict(undefined);
  assert.ok(isMasked(u) && u.reason === "indeterminate", "undefined → deny-by-default");
  const e = maskByVerdict([]); // allOf([]) === INDETERMINATE
  assert.ok(isMasked(e) && e.reason === "indeterminate", "empty cap set → deny-by-default");
});

test("per-field vAnd fold: the most-cautious cap wins (can only lower, never lift)", () => {
  assert.equal(maskByVerdict([ALLOW, ALLOW]), null, "all-allow → keep");
  assert.ok(isMasked(maskByVerdict([ALLOW, DENY])), "any deny → withhold");
  assert.ok(isMasked(maskByVerdict([ALLOW, INDETERMINATE])), "any indeterminate → withhold");
  // K3U2: UNKNOWN is infectious in the vAnd fold (weak Kleene); NEUTRAL is the definite 0 and folds by min.
  assert.equal(maskByVerdict([ALLOW, INDETERMINATE, DENY]).verdict, Verdict.UNKNOWN, "fold with UNKNOWN = UNKNOWN");
  const folded = maskByVerdict([ALLOW, Verdict.NEUTRAL, DENY]);
  assert.equal(folded.verdict, DENY, "fold = min(+1,0,-1) = DENY");
  assert.equal(maskByVerdict([ALLOW, Verdict.NEUTRAL]).verdict, Verdict.NEUTRAL);
});

test("partialReturn: keep-the-rest — allowed fields pass through, others masked", () => {
  const record = { id: 7, name: "alice", ssn: "123-45-6789", note: "hi" };
  const caps = { id: ALLOW, name: ALLOW, ssn: DENY, note: INDETERMINATE };
  const out = partialReturn(record, (f) => caps[f]);

  assert.equal(out.shaped.id, 7, "allowed scalar returned byte-identical");
  assert.equal(out.shaped.name, "alice");
  assert.ok(isMasked(out.shaped.ssn) && out.shaped.ssn.reason === "denied");
  assert.ok(isMasked(out.shaped.note) && out.shaped.note.reason === "indeterminate");

  assert.deepEqual([...out.maskedFields].sort(), ["note", "ssn"]);
  assert.equal(out.allMasked, false, "not every field masked");
  assert.equal(out.diagnostics.length, 1, "one FUNGI-GOV-3VL-001 (the INDETERMINATE field)");
  assert.equal(out.diagnostics[0].field, "note");
  assert.equal(out.diagnostics[0].diagnostic.code, "FUNGI-GOV-3VL-001");
});

test("partialReturn: allowed object field is the SAME reference (no value transform)", () => {
  const nested = { city: "London" };
  const out = partialReturn({ addr: nested }, () => ALLOW);
  assert.equal(out.shaped.addr, nested, "admitted value returned untouched (===)");
});

test("partialReturn: deny-by-default for a field with no verdict supplied", () => {
  const out = partialReturn({ a: 1, b: 2 }, (f) => (f === "a" ? ALLOW : undefined));
  assert.equal(out.shaped.a, 1);
  assert.ok(isMasked(out.shaped.b) && out.shaped.b.reason === "indeterminate", "unmapped field withheld");
});

test("partialReturn: allMasked true only when every field withheld; false for empty record", () => {
  const all = partialReturn({ x: 1, y: 2 }, () => DENY);
  assert.equal(all.allMasked, true);
  assert.equal(partialReturn({}, () => ALLOW).allMasked, false, "empty record is not 'all masked'");
});

test("partialReturn: onDiagnostic sink fires once per INDETERMINATE field", () => {
  const seen = [];
  partialReturn({ a: 1, b: 2, c: 3 }, (f) => (f === "b" ? INDETERMINATE : DENY), (field, d) => seen.push([field, d.code]));
  assert.deepEqual(seen, [["b", "FUNGI-GOV-3VL-001"]], "only the INDETERMINATE collapse is audited (DENY is ordinary)");
});

test("SOUNDNESS: across every verdict, a non-ALLOW field never returns its value", () => {
  for (const v of [DENY, INDETERMINATE, undefined, [], [DENY], [INDETERMINATE], [ALLOW, DENY]]) {
    const out = partialReturn({ secret: "PLAINTEXT" }, () => v);
    assert.ok(isMasked(out.shaped.secret), `verdict ${JSON.stringify(v)} must withhold`);
    assert.notEqual(out.shaped.secret, "PLAINTEXT", "the value never leaks through a non-ALLOW verdict");
  }
});

// K3U2-PR (2026-10-25): the typed K3_UNKNOWN sentinel is a single Verdict (not a cap list); NEUTRAL is a
// definite non-ALLOW ("denied", no audit diagnostic); a forged look-alike object is refused, never folded.
test("K3U2-PR1: a single UNKNOWN field verdict is withheld as indeterminate with FUNGI-GOV-3VL-001", () => {
  const m = maskByVerdict(Verdict.UNKNOWN);
  assert.ok(isMasked(m) && m.reason === "indeterminate" && m.verdict === Verdict.UNKNOWN);
  assert.equal(m.diagnostic?.code, "FUNGI-GOV-3VL-001");
});
test("K3U2-PR2: a NEUTRAL field verdict is withheld as denied with no diagnostic", () => {
  const m = maskByVerdict(Verdict.NEUTRAL);
  assert.ok(isMasked(m) && m.reason === "denied" && m.verdict === Verdict.NEUTRAL);
  assert.deepEqual(m.diagnostic, { kind: "NONE" });
});
test("K3U2-PR3: a forged sentinel look-alike or junk object is refused, never folded or kept", () => {
  for (const junk of [{ kind: "K3_UNKNOWN" }, JSON.parse(JSON.stringify(Verdict.UNKNOWN)), { reduce: () => 1 }, 2, Number.NaN]) {
    assert.throws(() => maskByVerdict(junk));
  }
});
