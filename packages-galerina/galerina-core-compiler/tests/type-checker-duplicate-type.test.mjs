/**
 * #107 (extended) — two TOP-LEVEL type-level declarations with the same name must be caught at compile.
 *
 * type / record / enum / hallmark share one module type namespace. A second declaration of a name
 * silently overwrote the first in the type registry (the 2nd wins — a silent mis-compile). checkTypes
 * now emits FUNGI-NAME-002 (DUPLICATE_NAME) for it. Critically, the check is TOP-LEVEL ONLY: a
 * flow-LOCAL type that shadows a module type is a different scope (legitimate shadowing, e.g.
 * examples/contracts.fungi) and must NOT be flagged.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const typeErrors = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "dup-type.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};

describe("#107 (extended): duplicate top-level type-level names (FUNGI-NAME-002)", () => {
  it("two module types with the same name → FUNGI-NAME-002", () => {
    const errs = typeErrors(`type Foo = Int\ntype Foo = Bool`);
    assert.ok(
      errs.some((e) => e.code === "FUNGI-NAME-002" && /Type 'Foo' is already declared/.test(e.message)),
      JSON.stringify(errs),
    );
  });

  it("duplicate enum name → FUNGI-NAME-002", () => {
    assert.ok(typeErrors(`enum Color { Red, Green }\nenum Color { Blue, Yellow }`).some((e) => e.code === "FUNGI-NAME-002"));
  });

  it("duplicate record name → FUNGI-NAME-002", () => {
    assert.ok(typeErrors(`record Point { x: Int }\nrecord Point { y: Bool }`).some((e) => e.code === "FUNGI-NAME-002"));
  });

  it("cross-kind collision (type Foo + record Foo) → FUNGI-NAME-002 (one module type namespace)", () => {
    assert.ok(typeErrors(`type Foo = Int\nrecord Foo { x: Int }`).some((e) => e.code === "FUNGI-NAME-002"));
  });

  it("distinct type names compile clean (no false positive)", () => {
    assert.deepEqual(typeErrors(`type Foo = Int\ntype Bar = Bool`).map((e) => e.code), []);
  });

  it("a flow-LOCAL type shadowing a module type is NOT a duplicate (different scope — the contracts.fungi case)", () => {
    const src = `type Foo = Int\nsecure flow f(x: Int) -> Int contract { effects {} } {\n  type Foo = Bool\n  return x\n}`;
    assert.deepEqual(
      typeErrors(src).filter((e) => e.code === "FUNGI-NAME-002").map((e) => e.code),
      [],
      "a flow-local type shadow must NOT be flagged as a module-level duplicate",
    );
  });
});
