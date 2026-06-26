// #56 safe fix applier — pure, fail-safe single-line span replacement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFixEdits, computeAutoFix } from "../dist/index.js";

const SRC = "pure flow f() -> Void {\n  let x: Emial = bad\n  let y: Strng = z\n}\n";

test("applies a single-token replacement at a precise span (the canonical type-typo fix)", () => {
  // line 2, "Emial" at columns 10..15 (1-based, endColumn exclusive = 15) → "Email"
  const r = applyFixEdits(SRC, [{ line: 2, column: 10, endColumn: 15, replacement: "Email" }]);
  assert.equal(r.applied, 1);
  assert.equal(r.skipped, 0);
  assert.match(r.result.split("\n")[1], /let x: Email = bad/);
  assert.match(r.result.split("\n")[2], /let y: Strng = z/); // line 3 untouched
});

test("applies MULTIPLE edits across lines without offset drift (descending order)", () => {
  const r = applyFixEdits(SRC, [
    { line: 2, column: 10, endColumn: 15, replacement: "Email" },
    { line: 3, column: 10, endColumn: 15, replacement: "String" },
  ]);
  assert.equal(r.applied, 2);
  assert.match(r.result.split("\n")[1], /let x: Email = bad/);
  assert.match(r.result.split("\n")[2], /let y: String = z/);
});

test("FAIL-SAFE: overlapping edits on the same line — only the first (by sort) applies, the other is skipped", () => {
  const r = applyFixEdits(SRC, [
    { line: 2, column: 10, endColumn: 15, replacement: "Email" },
    { line: 2, column: 12, endColumn: 16, replacement: "XXXX" }, // overlaps the first
  ]);
  assert.equal(r.applied, 1);
  assert.equal(r.skipped, 1);
});

test("FAIL-SAFE: an out-of-range span (bad line / column past EOL) is skipped, not misapplied", () => {
  const r = applyFixEdits(SRC, [
    { line: 99, column: 1, endColumn: 2, replacement: "X" },          // line beyond source
    { line: 2, column: 1, endColumn: 999, replacement: "Y" },         // endColumn past line end
  ]);
  assert.equal(r.applied, 0);
  assert.equal(r.skipped, 2);
  assert.equal(r.result, SRC); // unchanged
});

test("preserves CRLF line terminators byte-for-byte", () => {
  const crlf = "a: Emial\r\nb: ok\r\n";
  const r = applyFixEdits(crlf, [{ line: 1, column: 4, endColumn: 9, replacement: "Email" }]);
  assert.equal(r.applied, 1);
  assert.equal(r.result, "a: Email\r\nb: ok\r\n");
});

test("an empty edit list is a no-op", () => {
  const r = applyFixEdits(SRC, []);
  assert.equal(r.applied, 0);
  assert.equal(r.result, SRC);
});

// ── computeAutoFix: re-check-gated orchestration (the core of `galerina fix`) ──
const TYPO_FIX = [{ line: 2, column: 10, endColumn: 15, replacement: "Email" }];

test("computeAutoFix ACCEPTS a fix when the re-check shows no new errors", () => {
  // original had 1 error (the typo); the fixed source re-checks to 0 → accept.
  const out = computeAutoFix(SRC, TYPO_FIX, 1, (cand) => (cand.includes("Emial") ? 1 : 0));
  assert.equal(out.applied, 1);
  assert.equal(out.accepted, true);
  assert.match(out.fixedSource.split("\n")[1], /let x: Email = bad/);
});

test("FAIL-CLOSED: computeAutoFix REJECTS a fix that increases the error count (keeps the original)", () => {
  // a recheck that reports MORE errors than the original → reject, return the original source untouched.
  const out = computeAutoFix(SRC, TYPO_FIX, 1, () => 5);
  assert.equal(out.accepted, false);
  assert.equal(out.fixedSource, SRC);
});

test("FAIL-CLOSED: a recheck that THROWS rejects the fix", () => {
  const out = computeAutoFix(SRC, TYPO_FIX, 1, () => { throw new Error("parse blew up"); });
  assert.equal(out.accepted, false);
  assert.equal(out.fixedSource, SRC);
});

test("computeAutoFix with no fixEdits is a no-op (accepted=false, source unchanged)", () => {
  let recheckCalls = 0;
  const out = computeAutoFix(SRC, [], 0, () => { recheckCalls++; return 0; });
  assert.equal(out.applied, 0);
  assert.equal(out.accepted, false);
  assert.equal(out.fixedSource, SRC);
  assert.equal(recheckCalls, 0); // never rechecks when there is nothing to apply
});

test("a pure insertion (column === endColumn) inserts without deleting", () => {
  // insert "?" after `bad` on line 2 — endColumn === column means a zero-width span (insertion).
  const line2 = SRC.split("\n")[1]; // "  let x: Emial = bad"
  const col = line2.length + 1;     // 1-based position just past the last char
  const r = applyFixEdits(SRC, [{ line: 2, column: col, endColumn: col, replacement: "?" }]);
  assert.equal(r.applied, 1);
  assert.equal(r.result.split("\n")[1], line2 + "?");
});
