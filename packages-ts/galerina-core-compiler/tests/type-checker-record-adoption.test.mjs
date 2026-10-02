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
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../dist/index.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const check = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "record-adoption.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};

const checkWithImportedRecord = (recordSource, src) => {
  const dir = join(tmpdir(), `galerina-record-import-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try {
    const recordPath = join(dir, "records.fungi");
    const mainPath = join(dir, "main.fungi");
    writeFileSync(recordPath, `@version 1\n${recordSource}`, "utf8");
    const prog = L.parseProgram(`@version 1\nimport "./records.fungi"\n${src}`, mainPath);
    assert.deepEqual(prog.diagnostics, [], JSON.stringify(prog.diagnostics));
    const imports = L.gatherFileImports(prog.ast, mainPath);
    assert.deepEqual(imports.diagnostics, [], JSON.stringify(imports.diagnostics));
    const context = L.buildImportedTypeContext(imports);
    return L.checkTypes(prog.ast, context).diagnostics.filter((d) => d.severity === "error");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

  it("admits an exact named record literal", () => {
    const errs = check(`
record TierDecision {tier: String reason: String isOptimal: Bool }
pure flow pick() -> TierDecision {
  return TierDecision { reason: "pure", isOptimal: true, tier: "bytecode" }
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("refuses a cross-nominal named record literal even when fields match", () => {
    const errs = check(`
record Alpha {value: Int }
record Beta {value: Int }
pure flow pick() -> Beta {
  return Alpha { value: 1 }
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.equal(errs[0].code, "FUNGI-TYPE-008");
    assert.match(errs[0].message, /names record 'Alpha'.*requires 'Beta'/);
  });

  it("refuses duplicate fields instead of collapsing the earlier value", () => {
    const errs = check(`
record Exact {value: Int }
pure flow pick() -> Exact {
  return Exact { value: 1, value: 2 }
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.equal(errs[0].code, "FUNGI-TYPE-008");
    assert.match(errs[0].message, /duplicate field\(s\): value/);
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

describe("imported record schemas", () => {
  const importedEntry = "record ImportedEntry { effect: String actor: String }\n";

  it("adopts an exact imported record schema", () => {
    const errs = checkWithImportedRecord(importedEntry, `
pure flow make() -> ImportedEntry {
  return ImportedEntry { effect: "audit.write", actor: "runtime" }
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("uses FUNGI-TYPE-008 for an imported return-record field mismatch", () => {
    const errs = checkWithImportedRecord(importedEntry, `
pure flow make() -> ImportedEntry {
  return ImportedEntry { effect: true, actor: "runtime" }
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.equal(errs[0].code, "FUNGI-TYPE-008");
    assert.match(errs[0].message, /effect: declared 'String', got 'Bool'/);
  });

  it("uses FUNGI-TYPE-002 for an imported let-record field mismatch", () => {
    const errs = checkWithImportedRecord(importedEntry, `
pure flow make() -> Int {
  let entry: ImportedEntry = { effect: "audit.write" }
  return 1
}`);
    assert.equal(errs.length, 1, JSON.stringify(errs));
    assert.equal(errs[0].code, "FUNGI-TYPE-002");
    assert.match(errs[0].message, /missing field\(s\): actor/);
  });
});

describe("RD-1296 nested contextual record admission", () => {
  const nestedDecls = `
record Sec { a: Int }
record Outer { inner: Sec, n: Int }
`;

  it("hostile: nested Sec missing required field a is TYPE-008 (return)", () => {
    const errs = check(`${nestedDecls}
pure flow pick() -> Outer {
  return Outer { inner: Sec { }, n: 1 }
}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-008"), JSON.stringify(errs));
    assert.ok(errs.some((e) => /missing field\(s\): a/.test(e.message)), JSON.stringify(errs));
  });

  it("hostile: anonymous nested record missing child is TYPE-008", () => {
    const errs = check(`${nestedDecls}
pure flow pick() -> Outer {
  return { inner: { }, n: 1 }
}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-008"), JSON.stringify(errs));
    assert.ok(errs.some((e) => /missing field\(s\): a/.test(e.message)), JSON.stringify(errs));
  });

  it("positive: complete Outer/Sec adopts with no diagnostic", () => {
    const errs = check(`${nestedDecls}
pure flow pick() -> Outer {
  return Outer { inner: Sec { a: 7 }, n: 99 }
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("hostile: nested let-binding missing field is TYPE-002", () => {
    const errs = check(`${nestedDecls}
pure flow mk() -> Int {
  let o: Outer = Outer { inner: Sec { }, n: 1 }
  return 1
}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-002"), JSON.stringify(errs));
    assert.ok(errs.some((e) => /missing field\(s\): a/.test(e.message)), JSON.stringify(errs));
  });

  it("positive: complete nested let-binding adopts", () => {
    const errs = check(`${nestedDecls}
pure flow mk() -> Int {
  let o: Outer = Outer { inner: Sec { a: 7 }, n: 99 }
  return 1
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("hostile: call argument with nested missing field is TYPE-005", () => {
    const errs = check(`${nestedDecls}
pure flow take(o: Outer) -> Int { return o.n }
pure flow drive() -> Int {
  return take(Outer { inner: Sec { }, n: 1 })
}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-005"), JSON.stringify(errs));
    assert.ok(errs.some((e) => /missing field\(s\): a/.test(e.message)), JSON.stringify(errs));
  });

  it("positive: call argument with complete nested record adopts", () => {
    const errs = check(`${nestedDecls}
pure flow take(o: Outer) -> Int { return o.n }
pure flow drive() -> Int {
  return take(Outer { inner: Sec { a: 7 }, n: 99 })
}`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("hostile: nested nominal mismatch is TYPE-008", () => {
    const errs = check(`
record Alpha { value: Int }
record Beta { value: Int }
record Wrap { inner: Beta }
pure flow pick() -> Wrap {
  return Wrap { inner: Alpha { value: 1 } }
}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-008"), JSON.stringify(errs));
    assert.ok(errs.some((e) => /names record 'Alpha'/.test(e.message)), JSON.stringify(errs));
  });

  it("hostile: nested duplicate field is TYPE-008", () => {
    const errs = check(`${nestedDecls}
pure flow pick() -> Outer {
  return Outer { inner: Sec { a: 1, a: 2 }, n: 1 }
}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-008"), JSON.stringify(errs));
    assert.ok(errs.some((e) => /duplicate field\(s\): a/.test(e.message)), JSON.stringify(errs));
  });

  it("hostile: repeated Node type still checks a later nested literal (missing inner child)", () => {
    const errs = check(`
record Node { child: Node, n: Int }
pure flow pick() -> Node {
  return Node { child: Node { n: 1 }, n: 7 }
}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-008"), JSON.stringify(errs));
    assert.ok(errs.some((e) => /missing field\(s\): child/.test(e.message)), JSON.stringify(errs));
  });

  it("Q1 omitted-inner-Node fixture is TYPE-008 on checkTypes (not a runtime-cycle witness)", () => {
    const errs = check(`
record Node { child: Node, n: Int }
pure flow h(s: Int) -> Node {
  return Node { child: Node { n: 1 }, n: s }
}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-008"), JSON.stringify(errs));
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

describe("RD-1296 nested record CLI consumer", () => {
  const nestedMissing = `@version 1
record Sec { a: Int }
record Outer { inner: Sec, n: Int }
pure flow pick() -> Outer {
  return Outer { inner: Sec { }, n: 1 }
}
`;
  const nestedComplete = `@version 1
record Sec { a: Int }
record Outer { inner: Sec, n: Int }
pure flow pick() -> Outer {
  return Outer { inner: Sec { a: 7 }, n: 99 }
}
`;

  function runCheck(src, extra = []) {
    const dir = join(tmpdir(), `galerina-nested-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "nested.fungi");
    writeFileSync(file, src, "utf8");
    try {
      const r = spawnSync(process.execPath, ["galerina.mjs", "check", file, ...extra], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
        timeout: 120000,
        env: { ...process.env },
      });
      return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("plain check keeps nested TYPE-008 advisory (exit 0)", () => {
    const r = runCheck(nestedMissing);
    assert.match(r.out, /FUNGI-TYPE-008|advisory/, r.out);
    assert.equal(r.status, 0, r.out);
  });

  it("--strict-types refuses nested missing field (exit 1)", () => {
    const r = runCheck(nestedMissing, ["--strict-types"]);
    assert.match(r.out, /FUNGI-TYPE-008/, r.out);
    assert.equal(r.status, 1, r.out);
  });

  it("--strict-types admits complete Outer/Sec (exit 0)", () => {
    const r = runCheck(nestedComplete, ["--strict-types"]);
    assert.doesNotMatch(r.out, /FUNGI-TYPE-008/, r.out);
    assert.equal(r.status, 0, r.out);
  });
});
