// S10-R1 (1415-T9, X-COMP): RD-1296 A-E disposition (red first). RD-1296:16 routes A-B to RD-1413,
// C to RD-1414, D-E to RD-1415; Wasm-specific (historical WAT Q1) obligations stay deferred unless an
// explicit owner decision retires them (RD-1415:62,:74; RD-1728:95-96).
// Unit under test (S10-R2): src/composed-route.fungi classifyAeObligation(letter, successorBound, evidence, ownerRetire).
// letter: 1 A 2 B 3 C 4 D 5 E 6 WASM-Q1. successorBound: 0/1. evidence: 0 none 1 product-route 2 synthetic-only.
// ownerRetire: 0 none 1 owner-signed retirement decision. Packed: 100 SATISFIED, 106 UNRESOLVED (typed UNKNOWN),
// 108 RETIRED (explicit owner decision; no-op), 111 Unlisted.
// Zero-trust laws:
//  A1 every token is range-checked first; anything outside refuses 111.
//  A2 RETIRED 108 only with an owner-signed decision; nothing else retires (silence is not retirement).
//  A3 SATISFIED 100 only for letters A-E with a bound successor RD and product-route evidence.
//     Synthetic-only evidence never satisfies (RD-1415:62); no successor binding never satisfies.
//  A4 WASM-Q1 is never SATISFIED by a gateway route (RD-1415:74): 106 unless retired 108.
//  A5 the evidence/closure/S10-rd1296-ae-disposition.json table is exhaustive (A,B,C,D,E,WASM-Q1, each once),
//     maps successors per RD-1296:16, and every row's disposition equals the classifier on its tokens.
//  A6 a SATISFIED row lists evidence paths that exist in the repo; a RETIRED row names an existing owner decision file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SRC, invoke, evidence, readRepo } from "./harness.mjs";

const UNIT = join(SRC, "composed-route.fungi");
const NAME = { 100: "SATISFIED", 106: "UNRESOLVED", 108: "RETIRED" };
const LETTERS = ["A", "B", "C", "D", "E", "WASM-Q1"];
const SUCCESSOR = { A: "RD-1413", B: "RD-1413", C: "RD-1414", D: "RD-1415", E: "RD-1415", "WASM-Q1": "DEFERRED" };

export function oracle(l, s, e, r) {
  if (![1, 2, 3, 4, 5, 6].includes(l)) return 111;
  if (![0, 1].includes(s) || ![0, 1, 2].includes(e) || ![0, 1].includes(r)) return 111;
  if (r === 1) return 108;
  if (l === 6) return 106;
  if (s === 1 && e === 1) return 100;
  return 106;
}

function call(args) {
  const r = invoke(UNIT, "classifyAeObligation", args);
  assert.equal(r.status, 0, "classifyAeObligation(" + args.join(",") + ") status " + r.text);
  assert.equal(r.present, true, "classifyAeObligation(" + args.join(",") + ") value absent " + r.text);
  return r.value;
}

test("S10-R1 A1-A4 named cases", () => {
  assert.equal(call([4, 1, 1, 0]), 100, "D with successor and product-route evidence");
  assert.equal(call([4, 1, 2, 0]), 106, "synthetic-only evidence never satisfies");
  assert.equal(call([1, 0, 1, 0]), 106, "no successor binding never satisfies");
  assert.equal(call([3, 1, 0, 0]), 106, "no evidence is UNRESOLVED");
  assert.equal(call([6, 1, 1, 0]), 106, "WASM-Q1 is not satisfied by a gateway route");
  assert.equal(call([6, 0, 0, 1]), 108, "WASM-Q1 retired only by owner decision");
  assert.equal(call([0, 1, 1, 0]), 111, "letter 0 unlisted");
  assert.equal(call([7, 1, 1, 0]), 111, "letter 7 unlisted");
  assert.equal(call([1, 2, 1, 0]), 111, "successor token 2 unlisted");
  assert.equal(call([1, 1, 3, 0]), 111, "evidence token 3 unlisted");
  assert.equal(call([1, 1, 1, -1]), 111, "retire token -1 unlisted");
});

test("S10-R1 full grid matches the oracle; 100 only for A-E + successor + product-route + no retire", () => {
  for (const l of [0, 1, 2, 3, 4, 5, 6, 7]) {
    for (const s of [0, 1, 2]) {
      for (const e of [0, 1, 2, 3]) {
        for (const r of [0, 1, 2]) {
          assert.equal(call([l, s, e, r]), oracle(l, s, e, r), "classifyAeObligation(" + [l, s, e, r].join(",") + ")");
        }
      }
    }
  }
});

function table() {
  const t = evidence("closure/S10-rd1296-ae-disposition.json");
  assert.notEqual(t, null, "evidence/closure/S10-rd1296-ae-disposition.json missing");
  return JSON.parse(t);
}

test("S10-R1 A5: disposition table is exhaustive, successor-mapped and classifier-consistent", () => {
  const j = table();
  assert.equal(j.schema, "galerina.s10.rd1296-ae-disposition.v1");
  assert.deepEqual(j.rows.map((r) => r.obligation), LETTERS, "rows A,B,C,D,E,WASM-Q1 in order, each once");
  for (const row of j.rows) {
    assert.equal(row.successor, SUCCESSOR[row.obligation], row.obligation + " successor");
    const tk = row.tokens;
    assert.ok(tk && [tk.letter, tk.successorBound, tk.evidence, tk.ownerRetire].every(Number.isInteger), row.obligation + " tokens");
    assert.equal(tk.letter, LETTERS.indexOf(row.obligation) + 1, row.obligation + " letter token");
    const code = call([tk.letter, tk.successorBound, tk.evidence, tk.ownerRetire]);
    assert.ok(code in NAME, row.obligation + " classifier code " + code + " is not a disposition");
    assert.equal(row.disposition, NAME[code], row.obligation + " disposition must equal classifier");
    assert.ok(typeof row.reason === "string" && row.reason.length > 20, row.obligation + " reason");
  }
});

test("S10-R1 A6: SATISFIED rows cite existing product-route evidence; RETIRED rows cite an existing owner decision", () => {
  const j = table();
  for (const row of j.rows) {
    if (row.disposition === "SATISFIED") {
      assert.equal(row.evidenceKind, "product-route", row.obligation + " evidenceKind");
      assert.ok(Array.isArray(row.evidence) && row.evidence.length > 0, row.obligation + " evidence list");
      for (const p of row.evidence) assert.notEqual(readRepo(p), null, row.obligation + " evidence path missing: " + p);
    }
    if (row.disposition === "RETIRED") {
      assert.ok(typeof row.ownerDecision === "string", row.obligation + " ownerDecision");
      assert.notEqual(readRepo(row.ownerDecision), null, row.obligation + " owner decision file missing");
    }
  }
});