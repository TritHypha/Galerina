// =============================================================================
// @version header — BK-4/A4 (2026-07-08, W4)
//
// Every on-disk .fungi artifact carries `@version <int>` as line 1, and every
// consumer REJECTS: malformed, below the minimum-supported floor
// (anti-downgrade, A4), above the current version (unknown-future, BK-4), and
// — on the disk paths (requireVersionHeader) — ABSENT. Writing the tag without
// the read-gate is itself the BK-4 fail-open, so these tests pin the GATE.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, FUNGI_CURRENT_VERSION } from "../dist/index.js";

const FLOW = 'pure flow f() -> Void {\n  return\n}\n';
const code = (r, c) => r.diagnostics.filter((d) => d.code === c);

describe("@version header gate", () => {
  it("accepts @version 1 and reports it on the result", () => {
    const r = parseProgram(`@version 1\n${FLOW}`, "t.fungi", { requireVersionHeader: true });
    assert.equal(code(r, "FUNGI-SYNTAX-014").length, 0);
    assert.equal(code(r, "FUNGI-SYNTAX-015").length, 0);
    assert.deepEqual(r.versionHeader, { present: true, value: 1 });
  });

  it("REJECTS an unknown FUTURE version (BK-4: never best-effort parse a newer format)", () => {
    const r = parseProgram(`@version ${FUNGI_CURRENT_VERSION + 1}\n${FLOW}`, "t.fungi");
    const d = code(r, "FUNGI-SYNTAX-014");
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
  });

  it("REJECTS a below-floor version (A4 anti-downgrade)", () => {
    const r = parseProgram(`@version 0\n${FLOW}`, "t.fungi");
    const d = code(r, "FUNGI-SYNTAX-014");
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
  });

  it("REJECTS a malformed header (never guessed at)", () => {
    const r = parseProgram(`@version banana\n${FLOW}`, "t.fungi");
    assert.equal(code(r, "FUNGI-SYNTAX-014").length, 1);
  });

  it("ABSENT header is an ERROR on disk paths (requireVersionHeader: true)", () => {
    const r = parseProgram(FLOW, "t.fungi", { requireVersionHeader: true });
    const d = code(r, "FUNGI-SYNTAX-015");
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, "error");
  });

  it("absent header stays quiet for in-memory callers (migration window; corpus gated by fungi-scan --strict)", () => {
    const r = parseProgram(FLOW, "t.fungi");
    assert.equal(code(r, "FUNGI-SYNTAX-015").length, 0);
    assert.deepEqual(r.versionHeader, { present: false, value: null });
  });

  it("header line is BLANKED, not removed — downstream line numbers stay exact", () => {
    // top-level `let` is FUNGI-SYNTAX-006; place it on line 3 of a headered file
    const r = parseProgram(`@version 1\n\nlet x = 1\n`, "t.fungi");
    const d = code(r, "FUNGI-SYNTAX-006");
    assert.equal(d.length, 1);
    assert.equal(d[0].location.line, 3, "diagnostic must point at the REAL line of the file on disk");
  });

  it("tolerates a leading UTF-8 BOM (much of the corpus carries one)", () => {
    const r = parseProgram(`﻿@version 1\n${FLOW}`, "t.fungi", { requireVersionHeader: true });
    assert.equal(code(r, "FUNGI-SYNTAX-014").length, 0);
    assert.equal(code(r, "FUNGI-SYNTAX-015").length, 0);
    assert.deepEqual(r.versionHeader, { present: true, value: 1 });
  });

  it("@version NOT on line 1 does not count as a header (and the attribute machinery rejects it)", () => {
    const r = parseProgram(`// comment first\n@version 1\n${FLOW}`, "t.fungi", { requireVersionHeader: true });
    assert.equal(code(r, "FUNGI-SYNTAX-015").length, 1, "a misplaced header is ABSENT for the gate");
  });
});
