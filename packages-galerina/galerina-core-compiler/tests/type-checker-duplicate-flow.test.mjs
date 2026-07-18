/**
 * #107 — two flows with the SAME name in one module must be caught at COMPILE time.
 *
 * Before: duplicate flow names compiled clean (the type-checker's signature registry silently
 * overwrote the first with the second) and collided only at WASM instantiate with an opaque
 * "Duplicate export name". Now checkTypes emits FUNGI-NAME-002 (DUPLICATE_NAME) — the same fault as a
 * duplicate binding — for the 2nd+ declaration of a flow name, so it fails fast with a clear message.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const typeErrors = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "dup-flow.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};
const flow = (name) => `pure flow ${name}(x: Int) -> Int contract { effects {} } { return x }`;

describe("#107: duplicate flow names (FUNGI-NAME-002)", () => {
  it("two flows with the same name in one module → FUNGI-NAME-002 error", () => {
    const errs = typeErrors(`${flow("f")}\n${flow("f")}`);
    assert.ok(
      errs.some((e) => e.code === "FUNGI-NAME-002" && /Flow 'f' is already declared/.test(e.message)),
      JSON.stringify(errs),
    );
  });

  it("distinct flow names compile clean (no false positive)", () => {
    assert.deepEqual(typeErrors(`${flow("f")}\n${flow("g")}`).map((e) => e.code), []);
  });

  it("only the 2nd occurrence is flagged — the first is authoritative (one error per duplicate)", () => {
    const errs = typeErrors(`${flow("f")}\n${flow("f")}`).filter((e) => e.code === "FUNGI-NAME-002");
    assert.equal(errs.length, 1);
  });

  it("three flows with the same name → the 2nd and 3rd are both flagged", () => {
    const errs = typeErrors(`${flow("f")}\n${flow("f")}\n${flow("f")}`).filter((e) => e.code === "FUNGI-NAME-002");
    assert.equal(errs.length, 2);
  });

  it("secure/pure qualifiers do not change the rule — a dup across qualifiers still collides", () => {
    const src = `pure flow f(x: Int) -> Int contract { effects {} } { return x }\n`
      + `secure flow f(y: Int) -> Int contract { effects {} } { return y }`;
    assert.ok(typeErrors(src).some((e) => e.code === "FUNGI-NAME-002"), "cross-qualifier dup must still error");
  });
});
