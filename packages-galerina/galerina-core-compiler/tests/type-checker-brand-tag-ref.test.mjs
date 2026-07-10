/**
 * #17 — checkTypeRef must not treat a string-literal type argument as a type name.
 *
 * The second parameter of Brand<T, "Name"> is a nominal TAG (a string literal),
 * not a type reference. checkTypeRef used to recurse into every type argument and
 * flagged the quoted tag as FUNGI-TYPE-001 ("Type '\"CustomerId\"' is not
 * defined"). The fix skips quoted args — but must NOT weaken detection of a
 * genuinely unknown *type* argument (e.g. Array<Bogus>).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const typeErrors = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "brand-tag.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};

describe("checkTypeRef: string-literal type arguments are tags, not type refs", () => {
  it("Brand<String, \"CustomerId\"> raises no FUNGI-TYPE-001 on the tag", () => {
    const errs = typeErrors(`type CustomerId = Brand<String, "CustomerId">`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("a branded alias is usable as a type without a false unknown-type error", () => {
    const errs = typeErrors(`
type OrderId = Brand<String, "OrderId">
pure flow mk(id: OrderId) -> OrderId { return id }`);
    assert.deepEqual(errs.map((e) => e.code), [], JSON.stringify(errs));
  });

  it("still flags a genuinely unknown TYPE argument (detection not weakened)", () => {
    const errs = typeErrors(`pure flow f() -> Array<Bogus> { return [] }`);
    assert.ok(
      errs.some((e) => e.code === "FUNGI-TYPE-001" && /Bogus/.test(e.message)),
      JSON.stringify(errs),
    );
  });
});
