/**
 * Finding-(ii) reconciliation — record-type structural adoption + honest member inference.
 *
 * The self-hosted corpus is written in the idiom `return { ty: "Int", … }` against a
 * declared `-> RtValue`, and `let e: AuditEntry = { … }`. The governed run's type-checker
 * collapsed every record literal to the opaque 'Record' and mis-fired TYPE-008/TYPE-002,
 * while `check` (which never ran the type-checker) stayed green — the check↔governed
 * divergence. Four fixes pinned here:
 *
 *  1. PARSER: a record-DECL field whose name lexes as a KEYWORD (`reason`, lexer.ts) was
 *     silently corrupted — the name token was skipped and the TYPE token became an untyped
 *     field name ("reason: String" → a field named "String"). parseRecordDecl now accepts
 *     keyword field names exactly like parseRecordLiteral always did.
 *  2. RETURN position: a `#record` literal vs a DECLARED record type is checked
 *     STRUCTURALLY (fields vs the declaration) — match adopts the type silently; mismatch
 *     emits a PRECISE TYPE-008 (missing/unknown/badly-typed fields). Stronger, not muted.
 *  3. LET position: same adoption for `let x: SomeRecord = { … }` (TYPE-002).
 *  4. MEMBER inference: an `Auto`-typed receiver's field access is UNKNOWN (undefined) —
 *     never guessed via the body/value/id name-heuristics (which mis-typed `entry.body` as
 *     String and `expr.value` as Decimal → false TYPE-005/002 on the corpus). A receiver
 *     whose type IS a declared record answers from the record schema (the real field type).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const check = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "record-adoption.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};

describe("parser: record-decl field names that lex as keywords", () => {
  it("`reason: String` stays a field named 'reason' (was: a field named 'String')", () => {
    const prog = L.parseProgram(
      `@version 1\nrecord TierDecision {\n  tier: String\n  reason: String\n  isOptimal: Bool\n}\n`,
      "kw-field.fungi");
    const walk = (n, f) => { f(n); (n.children ?? []).forEach((c) => walk(c, f)); };
    let fields;
    walk(prog.ast, (n) => { if (n.kind === "recordDecl" && n.value === "TierDecision") fields = (n.children ?? []).map((c) => c.value); });
    assert.deepEqual(fields, ["tier: String", "reason: String", "isOptimal: Bool"]);
  });
});

describe("TYPE-008: record literal returned as a declared record type", () => {
  it("matching literal ADOPTS the declared type — no diagnostic", () => {
    const errs = check(`
record TierDecision {tier: String reason: String isOptimal: Bool }
pure flow pick() -> TierDecision {
  return { tier: "bytecode", reason: "pure", isOptimal: true }
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("missing + unknown fields emit ONE precise TYPE-008 (fail-closed, not silent)", () => {
    const errs = check(`
record TierDecision {tier: String reason: String isOptimal: Bool }
pure flow pick() -> TierDecision {
  return { tier: "bytecode", extra: 1 }
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.equal(errs[0].code, "FUNGI-TYPE-008");
    assert.match(errs[0].message, /missing field\(s\): reason, isOptimal/);
    assert.match(errs[0].message, /unknown field\(s\): extra/);
  });

  it("a badly-typed field is named precisely (tier declared String, got Bool)", () => {
    const errs = check(`
record TierDecision {tier: String reason: String isOptimal: Bool }
pure flow pick() -> TierDecision {
  return { tier: true, reason: "r", isOptimal: false }
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.match(errs[0].message, /tier: declared 'String', got 'Bool'/);
  });
});

describe("TYPE-002: record literal bound at a let annotation", () => {
  it("matching literal adopts — `let e: Entry = { … }` is clean", () => {
    const errs = check(`
record Entry { effect: String actor: String }
pure flow mk() -> Int {
  let e: Entry = { effect: "audit.write", actor: "runtime" }
  return 1
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("mismatched literal fires the precise TYPE-002", () => {
    const errs = check(`
record Entry { effect: String actor: String }
pure flow mk() -> Int {
  let e: Entry = { effect: "audit.write" }
  return 1
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.equal(errs[0].code, "FUNGI-TYPE-002");
    assert.match(errs[0].message, /missing field\(s\): actor/);
  });
});

describe("member inference: Auto receivers and record schemas", () => {
  it("Auto receiver: `entry.body` is UNKNOWN, never String-guessed (no TYPE-005)", () => {
    const errs = check(`
pure flow takeStmts(stmts: Array<Auto>) -> Int { return stmts.count() }
pure flow drive(entry: Auto) -> Int {
  return takeStmts(entry.body)
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("declared-record receiver answers from the SCHEMA: String field into Int param errors", () => {
    const errs = check(`
record TierDecision {tier: String reason: String }
pure flow wantInt(n: Int) -> Int { return n }
pure flow drive(d: TierDecision) -> Int {
  return wantInt(d.tier)
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.equal(errs[0].code, "FUNGI-TYPE-005");
    assert.match(errs[0].message, /expects 'Int' but received 'String'/);
  });

  it("declared-record receiver: correctly-typed field access is clean", () => {
    const errs = check(`
record TierDecision {tier: String reason: String }
pure flow wantStr(s: String) -> String { return s }
pure flow drive(d: TierDecision) -> String {
  return wantStr(d.tier)
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });
});
