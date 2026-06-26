// partial-return.test.mjs — K3 ternary partial-return / Masked per-field shaper (R&D 0108 #2).
//
// Proves: ALLOW fields pass through byte-identical; DENY/INDETERMINATE fields become a typed
// Masked sentinel (keep-the-rest); deny-by-default on undefined/empty verdicts; per-field vAnd
// fold of actor caps; SPORE-GOV-3VL-001 carried + sunk on every INDETERMINATE collapse; and the
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
  assert.ok(isMasked(d) && d.reason === "denied" && d.verdict === DENY && d.diagnostic === null);
  const i = maskByVerdict(INDETERMINATE);
  assert.ok(isMasked(i) && i.reason === "indeterminate" && i.verdict === INDETERMINATE);
  assert.equal(i.diagnostic?.code, "SPORE-GOV-3VL-001", "INDETERMINATE carries the audit diagnostic");
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
  const folded = maskByVerdict([ALLOW, INDETERMINATE, DENY]);
  assert.equal(folded.verdict, DENY, "fold = min(+1,0,-1) = DENY");
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
  assert.equal(out.diagnostics.length, 1, "one SPORE-GOV-3VL-001 (the INDETERMINATE field)");
  assert.equal(out.diagnostics[0].field, "note");
  assert.equal(out.diagnostics[0].diagnostic.code, "SPORE-GOV-3VL-001");
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
  assert.deepEqual(seen, [["b", "SPORE-GOV-3VL-001"]], "only the INDETERMINATE collapse is audited (DENY is ordinary)");
});

test("SOUNDNESS: across every verdict, a non-ALLOW field never returns its value", () => {
  for (const v of [DENY, INDETERMINATE, undefined, [], [DENY], [INDETERMINATE], [ALLOW, DENY]]) {
    const out = partialReturn({ secret: "PLAINTEXT" }, () => v);
    assert.ok(isMasked(out.shaped.secret), `verdict ${JSON.stringify(v)} must withhold`);
    assert.notEqual(out.shaped.secret, "PLAINTEXT", "the value never leaks through a non-ALLOW verdict");
  }
});
