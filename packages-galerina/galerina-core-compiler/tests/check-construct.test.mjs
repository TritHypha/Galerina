// =============================================================================
// W5b T2.2 — the `check(v){ if:/deny:/ambig: }` K3 tri-branch construct
//
// `check` dispatches on a Verdict over the lattice DENY(-1) < UNKNOWN(0) <
// ALLOW(+1): the `deny` / `ambig` / `if` arms. It is the governed error/branch
// model (RD-0240, RD-0266 §4) — total, constant-shape, fail-closed:
//   • EXHAUSTIVE — all three arms required (FUNGI-CHECK-001); a missing arm is an
//     unrouted verdict = fail-open.
//   • VERDICT-ONLY — a Bool/Int subject is FUNGI-CHECK-002 (a coerced value in a
//     governance branch is the A9 fail-open); use `match` for non-verdicts.
//   • EFFECT-SAFE — an effect inside an arm is NOT a blind spot (the checkers
//     descend into arm bodies).
//   • FAIL-CLOSED at runtime — a non-verdict subject or a missing arm TRAPS.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const V = (arms, subjType = "Verdict") =>
  `@version 1\npure flow f(v: ${subjType}) -> String\ncontract { effects {} }\n{\n  check(v) { ${arms} }\n  return "fell-through"\n}`;

function errCodes(src, withTypes = false) {
  const p = L.parseProgram(src, "t.fungi");
  let ds = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  if (withTypes) {
    try { ds = ds.concat((L.checkTypes(p.ast).diagnostics ?? []).filter((d) => d.severity === "error")); } catch { /* surfaced below */ }
  }
  return ds.map((d) => d.code);
}

describe("T2.2 check — parsing + AST shape", () => {
  it("parses check(v){ if:/deny:/ambig: } into a checkExpr with 3 arms", () => {
    const p = L.parseProgram(V(`if:{return "a"} deny:{return "d"} ambig:{return "u"}`), "t.fungi");
    assert.equal((p.diagnostics ?? []).filter((d) => d.severity === "error").length, 0);
    const found = [];
    (function walk(n) { if (!n || typeof n !== "object") return; if (n.kind === "checkExpr") found.push(n); for (const c of n.children ?? []) walk(c); })(p.ast);
    assert.equal(found.length, 1);
    const arms = (found[0].children ?? []).filter((c) => c.kind === "checkArm").map((a) => a.value);
    assert.deepEqual(arms.sort(), ["ambig", "deny", "if"]);
  });
});

describe("T2.2 check — interpreter dispatch (K3 lattice)", () => {
  const src = V(`if:{return "allow"} deny:{return "deny"} ambig:{return "unknown"}`);
  for (const [name, val, want] of [["Deny", -1, "deny"], ["Unknown", 0, "unknown"], ["Allow", 1, "allow"]]) {
    it(`Verdict.${name} (${val}) runs the '${want === "deny" ? "deny" : want === "unknown" ? "ambig" : "if"}' arm`, async () => {
      const p = L.parseProgram(src, "t.fungi");
      const r = await L.executeFlow("f", new Map([["v", { __tag: "verdict", value: val }]]), p.ast);
      assert.equal(r?.value?.value, want); // executeFlow => { value: GalerinaValue{__tag,value} }
    });
  }
});

describe("T2.2 check — exhaustiveness (FUNGI-CHECK-001, fail-closed)", () => {
  it("valid 3-arm check has no CHECK diagnostics", () => {
    assert.deepEqual(errCodes(V(`if:{return "a"} deny:{return "d"} ambig:{return "u"}`), true).filter((c) => c?.startsWith("FUNGI-CHECK")), []);
  });
  it("a missing arm is FUNGI-CHECK-001", () => {
    assert.ok(errCodes(V(`if:{return "a"} deny:{return "d"}`)).includes("FUNGI-CHECK-001"));
  });
  it("two missing arms => two FUNGI-CHECK-001", () => {
    const c = errCodes(V(`if:{return "a"}`)).filter((x) => x === "FUNGI-CHECK-001");
    assert.equal(c.length, 2);
  });
});

describe("T2.2 check — verdict-only subject (FUNGI-CHECK-002)", () => {
  it("a Bool subject is FUNGI-CHECK-002", () => {
    assert.ok(errCodes(V(`if:{return "a"} deny:{return "d"} ambig:{return "u"}`, "Bool"), true).includes("FUNGI-CHECK-002"));
  });
  it("a Verdict subject is NOT flagged (anti-vacuous)", () => {
    assert.ok(!errCodes(V(`if:{return "a"} deny:{return "d"} ambig:{return "u"}`, "Verdict"), true).includes("FUNGI-CHECK-002"));
  });
});

describe("T2.2 check — effect-safety (no blind spot)", () => {
  it("an undeclared effect INSIDE a check arm is still caught", () => {
    const src = `@version 1\nsecure flow f(v: Verdict) -> Void\ncontract { intent { "x" } effects {} }\n{ check(v) { if: { Database.write("k","v") } deny: { return } ambig: { return } } }`;
    const p = L.parseProgram(src, "e.fungi");
    const errs = L.checkEffects(p.flows, p.ast, "production", true).flatMap((r) => r.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.ok(errs.length > 0, "an effect in a check arm must not be a governance blind spot");
  });
});

describe("T2.2 check — runtime fail-closed", () => {
  it("a non-verdict subject at runtime TRAPS (never coerces into a branch)", async () => {
    // The type checker rejects this at compile time; the interpreter is the belt-and-braces:
    // runFlow catches the trap into audit.result='error' (never silently picks an arm).
    const p = L.parseProgram(V(`if:{return "a"} deny:{return "d"} ambig:{return "u"}`), "t.fungi");
    const r = await L.executeFlow("f", new Map([["v", { __tag: "int", value: 1 }]]), p.ast);
    assert.equal(r?.audit?.result, "error", "a non-verdict subject must TRAP, never silently pick an arm");
    assert.match(r?.value?.message ?? "", /Verdict|fail-closed/);
  });
});
