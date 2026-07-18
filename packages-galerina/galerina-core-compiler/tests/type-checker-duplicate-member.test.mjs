/**
 * #107 (extended) — duplicate names WITHIN a container are ambiguous and must be caught at compile.
 *
 * A duplicate enum variant, record field, or flow parameter silently overwrote/shadowed the first
 * (the enum variant Set and record field Map dedup silently; a duplicate param shadowed in the flow
 * scope). checkTypes now emits FUNGI-NAME-002 (DUPLICATE_NAME) for each — the same fault as any other
 * duplicate name.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const typeErrors = (src) =>
  L.checkTypes(L.parseProgram(`@version 1\n${src}`, "dup-member.fungi").ast).diagnostics.filter((d) => d.severity === "error");

describe("#107 (extended): duplicate names within a container (FUNGI-NAME-002)", () => {
  it("duplicate enum variant → FUNGI-NAME-002", () => {
    assert.ok(typeErrors(`enum E { A, A }`).some((e) => e.code === "FUNGI-NAME-002" && /Variant 'A' is already declared/.test(e.message)));
  });

  it("duplicate record field → FUNGI-NAME-002", () => {
    assert.ok(typeErrors(`record R { x: Int, x: Bool }`).some((e) => e.code === "FUNGI-NAME-002" && /Field 'x' is already declared/.test(e.message)));
  });

  it("duplicate flow parameter → FUNGI-NAME-002", () => {
    const src = `pure flow f(x: Int, x: Bool) -> Int contract { effects {} } { return 0 }`;
    assert.ok(typeErrors(src).some((e) => e.code === "FUNGI-NAME-002" && /Parameter 'x' is already declared/.test(e.message)));
  });

  it("distinct variants / fields / params compile clean (no false positives)", () => {
    assert.deepEqual(typeErrors(`enum E { A, B }`).map((e) => e.code), [], "distinct variants");
    assert.deepEqual(typeErrors(`record R { x: Int, y: Bool }`).map((e) => e.code), [], "distinct fields");
    assert.deepEqual(
      typeErrors(`pure flow f(x: Int, y: Bool) -> Int contract { effects {} } { return 0 }`).map((e) => e.code),
      [],
      "distinct params",
    );
  });
});
