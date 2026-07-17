// money-runtime-registry.test.mjs — RD-0349 I4: the runtime unit-table twin (G2 + G5).
// G2 was live: Money.of(amount, ANY_STRING) accepted any code and silently defaulted "GBP" — the
// compile-time tag hole reopened at runtime. G5 was live: constructors hand-listed 4 of the 7
// canonical currencies. Both close against ONE table (MONEY_UNIT_TAGS): constructors are GENERATED
// from it, `of` validates against it deny-by-default. Fires-on-bad + silent-on-good, both ways.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, executeFlow } from "../../dist/index.js";
import { MONEY_UNIT_TAGS } from "../../dist/stdlib.js";

const exec = async (body) => {
  const src = `@version 1
secure flow f() -> Text
contract { intent { "money runtime registry conformance" } effects {} }
{
${body}
}
`;
  const prog = parseProgram(src, "money-i4.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse error: ${errs.map((d) => d.message).join("; ")}`);
  return (await executeFlow("f", new Map(), prog.ast, prog.flows)).value;
};
// Good path: construct + render. Error path: return the constructed value DIRECTLY, so the flow
// result IS the refusal (interpreter semantics bind a runtimeError into a `let` and surface it on
// USE — returning it keeps the original message assertable, no interpreter change in this unit).
const run = (expr) => exec(`  let m = ${expr}\n  return m.toString()`);
const runErr = (expr) => exec(`  return ${expr}`);

describe("RD-0349 I4 — Money runtime unit table (G2/G5)", () => {
  // I1 LANDED 2026-07-17 — this assertion USED to pin the table's exact contents:
  //   assert.deepEqual([...MONEY_UNIT_TAGS], ["GBP","USD","EUR","JPY","CHF","CAD","AUD"]);
  // That was a snapshot of the HAND-TYPED table, and I1 is the rung that replaces it: stdlib.ts
  // promised "when I1's owner-gated pinned ISO snapshot lands, ONLY this table grows (full active
  // set)". The table is now GENERATED from the pinned snapshot (157 codes), so an exact-7 pin is a
  // stale literal, not a property. "One table, one source" SURVIVES in the two forms that carry the
  // meaning — and both are stronger than the old literal, because a hand-edit now fails them:
  //   (a) the source is the snapshot, evidenced by provenance (see unit-registry.test.mjs);
  //   (b) no ORPHAN currency TYPE — every compile-time currency type is admitted at runtime.
  // (b) is the direction that could actually bite: BUILT_IN_TYPES deliberately did NOT grow (157
  // global type names would collide with ordinary identifiers — ISO has `ALL` and `TRY`), so the
  // type list is a curated SUBSET and must stay one.
  it("one source: no orphan currency TYPE — every compile-time currency is runtime-admitted", () => {
    const COMPILE_TIME_CURRENCY_TYPES = ["GBP", "USD", "EUR", "JPY", "CHF", "CAD", "AUD"];
    for (const c of COMPILE_TIME_CURRENCY_TYPES) {
      assert.ok(MONEY_UNIT_TAGS.includes(c),
        `${c} is a currency TYPE in the type-checker but is not admitted by the runtime table — an orphan type`);
    }
  });

  it("the table is the full ISO active set, not the old hand-typed 7", () => {
    assert.ok(MONEY_UNIT_TAGS.length > 7, `expected the generated active set, got ${MONEY_UNIT_TAGS.length}`);
  });

  it("G5 closed: EVERY table currency has a generated constructor (incl. the 3 that were missing)", async () => {
    for (const tag of MONEY_UNIT_TAGS) {
      const v = await run(`Money.${tag.toLowerCase()}("12.34")`);
      assert.equal(v.__tag, "string", `Money.${tag.toLowerCase()} must construct — got ${v.__tag}: ${v.message ?? ""}`);
      assert.ok(v.value.startsWith(`${tag} `), `constructor tag mismatch: ${v.value}`);
    }
  });

  it("G2 closed: Money.of validates the code against the table (valid accepted)", async () => {
    const v = await run(`Money.of("9.99", "CHF")`);
    assert.equal(v.__tag, "string");
    assert.ok(v.value.startsWith("CHF "), `of must carry the validated code: ${v.value}`);
  });

  it("G2 closed: an unknown code is REFUSED with the valid set named (deny-by-default)", async () => {
    const v = await runErr(`Money.of("9.99", "BANANAS")`);
    assert.equal(v.__tag, "runtimeError", "unknown code must be a runtimeError, not a silent Money");
    assert.ok(/unknown currency code 'BANANAS'/.test(v.message), v.message);
    assert.ok(v.message.includes("GBP"), "the error names the valid codes");
  });

  it("tag hygiene: lowercase 'gbp' as a CODE is refused (exact-codepoint uppercase only)", async () => {
    const v = await runErr(`Money.of("1.00", "gbp")`);
    assert.equal(v.__tag, "runtimeError", "case-slip codes must not create a distinct sibling currency");
  });

  it("no silent default: Money.of with a MISSING code is refused (an unnamed unit is the bug class)", async () => {
    const v = await runErr(`Money.of("1.00")`);
    assert.equal(v.__tag, "runtimeError", "the old silent-GBP default must be gone");
  });

  it("behaviour preserved: the pre-existing constructors still round-trip (no regression)", async () => {
    const v = await run(`Money.gbp("10.50")`);
    assert.equal(v.__tag, "string");
    assert.equal(v.value, "GBP 10.50");
  });
});
