/**
 * A match arm's payload variable must bind to the scrutinee's payload type — Some(it) on Option<T> → it:T;
 * Ok(it)/Err(e) on Result<T,E> → it:T / e:E. Before this, the arm variable was left untyped (Auto), so a
 * misuse `let x: Int = it` (where it is really a Flow) slipped through. This is the get→Option→match-bind
 * inference chain the P9 twins rely on (RD-0361 / RULING-100), and a correctness fix on its own.
 *
 * ★ Corpus-safety pin: Array<Auto>.get() → Option<Auto> → Some(it) → it:Auto is DELIBERATELY left unbound
 *   (Auto is skipped), so the self-hosted twins (which declare Array<Auto>) are byte-identical — no new error.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const typeErrors = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "match-bind.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};
const REC = "record Flow { name: String }\n";

describe("type-checker: match arm payload binding (get→Option→match-bind, P9)", () => {
  it("Some(it) on Option<Flow> binds it:Flow — using it as Int is FUNGI-TYPE-002", () => {
    const errs = typeErrors(
      `${REC}pure flow f(a: Array<Flow>) -> Int contract { effects {} } {\n` +
      `  match a.get(0) { Some(it) => { let bad: Int = it\n    return 0 } None => { return 0 } _ => { return 0 } } }`,
    );
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-002"), JSON.stringify(errs));
  });

  it("Some(it) on Option<Flow>, used AS Flow, is clean (it is correctly typed)", () => {
    const errs = typeErrors(
      `${REC}pure flow f(a: Array<Flow>) -> Option<Flow> contract { effects {} } {\n` +
      `  match a.get(0) { Some(it) => { let ok: Flow = it\n    return Some(ok) } None => { return None } _ => { return None } } }`,
    );
    assert.deepEqual(errs.map((e) => e.code), []);
  });

  it("Err(e) on Result<Flow,Int> binds e:Int (usable as Int), Ok(it) binds it:Flow (Int misuse fires)", () => {
    const errs = typeErrors(
      `${REC}pure flow g(r: Result<Flow, Int>) -> Int contract { effects {} } {\n` +
      `  match r { Ok(it) => { let bad: Int = it\n    return 0 } Err(e) => { return e } _ => { return 0 } } }`,
    );
    assert.ok(errs.some((e) => e.code === "FUNGI-TYPE-002"), JSON.stringify(errs));
  });

  it("★ corpus-safety: Array<Auto>.get() → Some(it) leaves it UNBOUND (Auto skipped) — no new error", () => {
    const errs = typeErrors(
      `pure flow h(a: Array<Auto>) -> Int contract { effects {} } {\n` +
      `  match a.get(0) { Some(it) => { let x: Int = it\n    return 0 } None => { return 0 } _ => { return 0 } } }`,
    );
    assert.deepEqual(errs.map((e) => e.code), []);
  });
});
