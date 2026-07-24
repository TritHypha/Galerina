// Flagship (0119 item 2) — three-valued parameter admission `name: T where <k3-expr>`.
// The gate is Verdict-ALLOW-only at flow ENTRY: DENY and UNKNOWN both REFUSE (fail-closed K3),
// Bool auto-lifts, int-truthiness is NOT accepted. A parse-only `where` would be FAIL-OPEN, so
// parse + gate + diagnostics land as one unit and are proven together here.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkTypes, resolveSymbols, executeFlow } from "../dist/index.js";

async function parseAndRun(source, flowName, args = new Map()) {
  const parsed = parseProgram(source, "test.fungi");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  return await executeFlow(flowName, args, parsed.ast);
}
const INT = (n) => ({ __tag: "int", value: n });
const hasCode = (r, code) => (r.diagnostics ?? []).some((d) => d.code === code);

describe("Flagship — three-valued parameter admission (where)", () => {
  it("REFUSES on empty all{} (⇒ UNKNOWN, not ALLOW) — the fail-closed K3 core", async () => {
    const r = await parseAndRun(
      `pure flow gated(p: Int where all{}) -> Int { return p }`,
      "gated",
      new Map([["p", INT(5)]]),
    );
    assert.equal(r.value.__tag, "runtimeError", "UNKNOWN admission must refuse, body must not run");
    assert.ok(hasCode(r, "FUNGI-ADMIT-001"), "expected FUNGI-ADMIT-001 on UNKNOWN admission");
  });

  it("ADMITS on a Bool-true predicate (auto-lift ⇒ ALLOW)", async () => {
    const r = await parseAndRun(
      `pure flow gated(p: Int where true) -> Int { return p }`,
      "gated",
      new Map([["p", INT(7)]]),
    );
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 7);
    assert.ok(!hasCode(r, "FUNGI-ADMIT-001"), "Bool-true admits, no refusal");
  });

  it("REFUSES on a Bool-false predicate (auto-lift ⇒ DENY)", async () => {
    const r = await parseAndRun(
      `pure flow gated(p: Int where false) -> Int { return p }`,
      "gated",
      new Map([["p", INT(7)]]),
    );
    assert.equal(r.value.__tag, "runtimeError");
    assert.ok(hasCode(r, "FUNGI-ADMIT-001"), "Bool-false denies");
  });

  it("REFUSES on an Int predicate — NO int-truthiness (unlike the A7 precondition gate)", async () => {
    const r = await parseAndRun(
      `pure flow gated(p: Int where 5) -> Int { return p }`,
      "gated",
      new Map([["p", INT(7)]]),
    );
    assert.equal(r.value.__tag, "runtimeError", "a non-zero Int must NOT admit (no truthiness)");
    assert.ok(hasCode(r, "FUNGI-ADMIT-001"));
  });

  it("evaluates a param-referencing predicate: ADMITS when it holds, REFUSES when it doesn't", async () => {
    const src = `pure flow gated(p: Int where p >= 0) -> Int { return p }`;
    const ok = await parseAndRun(src, "gated", new Map([["p", INT(3)]]));
    assert.equal(ok.value.__tag, "int");
    assert.equal(ok.value.value, 3);
    const bad = await parseAndRun(src, "gated", new Map([["p", INT(-1)]]));
    assert.equal(bad.value.__tag, "runtimeError", "predicate false ⇒ refuse");
    assert.ok(hasCode(bad, "FUNGI-ADMIT-001"));
  });

  it("a flow WITHOUT where is unaffected (control)", async () => {
    const r = await parseAndRun(
      `pure flow plain(p: Int) -> Int { return p }`,
      "plain",
      new Map([["p", INT(9)]]),
    );
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 9);
    assert.ok(!hasCode(r, "FUNGI-ADMIT-001"));
  });

  it("REFUSES `where` on an fn helper parameter (FUNGI-ADMIT-003 — fn is not a governed entry point)", () => {
    const parsed = parseProgram(
      `pure flow outer(p: Int) -> Int {\n  fn helper(q: Int where true) -> Int { return q }\n  return helper(p)\n}`,
      "test.fungi",
    );
    assert.ok(
      (parsed.diagnostics ?? []).some((d) => d.code === "FUNGI-ADMIT-003"),
      "expected FUNGI-ADMIT-003 for a where on an fn param",
    );
  });
});
