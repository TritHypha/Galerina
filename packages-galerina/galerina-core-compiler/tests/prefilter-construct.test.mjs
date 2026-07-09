// =============================================================================
// W5b T2.4 — `prefilter(v){ deny:/maybe: }` : the DENY-ONLY gate
//
// A prefilter is an early rejection stage that runs BEFORE the real authorize.
// Its defining zero-trust property (A8): it can only DENY or DEFER, NEVER ALLOW.
//   • NO ALLOW ARM      — an `if:`/allow arm is FUNGI-PREFILTER-003 (a prefilter
//                         cannot allow; the allow decision belongs to authorize).
//   • ALLOW IS DOWNGRADED — at runtime a +1/ALLOW subject routes to the `maybe`
//                         (defer) arm, never an allow path. This is THE core:
//                         a prefilter never honours an early allow.
//   • EXHAUSTIVE        — both deny/maybe arms required (FUNGI-PREFILTER-001).
//   • VERDICT-ONLY      — a Bool/Int subject is FUNGI-PREFILTER-002 (A9).
//   • FAIL-CLOSED       — a non-verdict subject TRAPS at runtime.
//   • EFFECT-SAFE       — an effect inside an arm is still checked.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const P = (arms, subjType = "Verdict") =>
  `@version 1\npure flow f(v: ${subjType}) -> String\ncontract { effects {} }\n{\n  prefilter(v) { ${arms} }\n  return "fell-through"\n}`;

function errCodes(src, withTypes = false) {
  const p = L.parseProgram(src, "t.fungi");
  let ds = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  if (withTypes) {
    try { ds = ds.concat((L.checkTypes(p.ast).diagnostics ?? []).filter((d) => d.severity === "error")); } catch { /* surfaced below */ }
  }
  return ds.map((d) => d.code);
}

describe("T2.4 prefilter — parsing + AST shape", () => {
  it("parses prefilter(v){ deny:/maybe: } into a prefilterExpr with 2 arms", () => {
    const p = L.parseProgram(P(`deny:{return "d"} maybe:{return "m"}`), "t.fungi");
    assert.equal((p.diagnostics ?? []).filter((d) => d.severity === "error").length, 0);
    const found = [];
    (function walk(n) { if (!n || typeof n !== "object") return; if (n.kind === "prefilterExpr") found.push(n); for (const c of n.children ?? []) walk(c); })(p.ast);
    assert.equal(found.length, 1);
    const arms = (found[0].children ?? []).filter((c) => c.kind === "prefilterArm").map((a) => a.value);
    assert.deepEqual(arms.sort(), ["deny", "maybe"]);
  });
});

describe("T2.4 prefilter — the DENY-ONLY guarantee", () => {
  it("an `if:`/allow arm is FUNGI-PREFILTER-003 (a prefilter cannot ALLOW)", () => {
    assert.ok(errCodes(P(`deny:{return "d"} maybe:{return "m"} if:{return "a"}`)).includes("FUNGI-PREFILTER-003"));
  });
  it("an `allow:` arm is also rejected", () => {
    assert.ok(errCodes(P(`deny:{return "d"} maybe:{return "m"} allow:{return "a"}`)).includes("FUNGI-PREFILTER-003"));
  });
  it("a valid deny/maybe prefilter has no PREFILTER diagnostics", () => {
    assert.deepEqual(errCodes(P(`deny:{return "d"} maybe:{return "m"}`), true).filter((c) => c?.startsWith("FUNGI-PREFILTER")), []);
  });
});

describe("T2.4 prefilter — exhaustiveness (FUNGI-PREFILTER-001)", () => {
  it("a missing maybe arm is FUNGI-PREFILTER-001", () => {
    assert.ok(errCodes(P(`deny:{return "d"}`)).includes("FUNGI-PREFILTER-001"));
  });
  it("a missing deny arm is FUNGI-PREFILTER-001", () => {
    assert.ok(errCodes(P(`maybe:{return "m"}`)).includes("FUNGI-PREFILTER-001"));
  });
});

describe("T2.4 prefilter — verdict-only subject (FUNGI-PREFILTER-002)", () => {
  it("a Bool subject is FUNGI-PREFILTER-002", () => {
    assert.ok(errCodes(P(`deny:{return "d"} maybe:{return "m"}`, "Bool"), true).includes("FUNGI-PREFILTER-002"));
  });
  it("a Verdict subject is NOT flagged (anti-vacuous)", () => {
    assert.ok(!errCodes(P(`deny:{return "d"} maybe:{return "m"}`, "Verdict"), true).includes("FUNGI-PREFILTER-002"));
  });
});

describe("T2.4 prefilter — interpreter dispatch (allow is DOWNGRADED, never honoured)", () => {
  const src = P(`deny:{return "denied"} maybe:{return "deferred"}`);
  for (const [name, val, want] of [["Deny", -1, "denied"], ["Unknown", 0, "deferred"], ["Allow", 1, "deferred"]]) {
    it(`Verdict.${name} (${val}) routes to '${want === "denied" ? "deny" : "maybe"}'`, async () => {
      const p = L.parseProgram(src, "t.fungi");
      const r = await L.executeFlow("f", new Map([["v", { __tag: "verdict", value: val }]]), p.ast);
      assert.equal(r?.value?.value, want);
    });
  }
  it("ALLOW never reaches an allow path — there is none; it defers (the zero-trust core)", async () => {
    const p = L.parseProgram(src, "t.fungi");
    const r = await L.executeFlow("f", new Map([["v", { __tag: "verdict", value: 1 }]]), p.ast);
    assert.equal(r?.value?.value, "deferred", "a prefilter must NOT honour an early allow");
    assert.notEqual(r?.value?.value, "fell-through");
  });
});

describe("T2.4 prefilter — runtime fail-closed + effect-safety", () => {
  it("a non-verdict subject at runtime TRAPS (never silently picks an arm)", async () => {
    const p = L.parseProgram(P(`deny:{return "d"} maybe:{return "m"}`), "t.fungi");
    const r = await L.executeFlow("f", new Map([["v", { __tag: "int", value: 1 }]]), p.ast);
    assert.equal(r?.audit?.result, "error");
    assert.match(r?.value?.message ?? "", /Verdict|fail-closed/);
  });
  it("an undeclared effect INSIDE a prefilter arm is still caught", () => {
    const src = `@version 1\nsecure flow f(v: Verdict) -> Void\ncontract { intent { "x" } effects {} }\n{ prefilter(v) { deny: { Database.write("k","v") } maybe: { return } } }`;
    const p = L.parseProgram(src, "e.fungi");
    const errs = L.checkEffects(p.flows, p.ast, "production", true).flatMap((r) => r.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.ok(errs.length > 0, "an effect in a prefilter arm must not be a governance blind spot");
  });
});

describe("T2.4 prefilter — WASM tier is fail-closed until lowered", () => {
  it("prefilter{} lowers to an (unreachable) trap in WASM", () => {
    const src = `@version 1\npure flow f(v: Verdict) -> Void\ncontract { effects {} }\n{ prefilter(v) { deny:{return} maybe:{return} } }`;
    const p = L.parseProgram(src, "t.fungi");
    let flow = null;
    (function w(n) { if (!n || typeof n !== "object") return; if (/FlowDecl$/.test(n.kind ?? "")) flow = n; for (const c of n.children ?? []) w(c); })(p.ast);
    const wat = L.emitWATFromFlowAST(flow, ["v"]);
    assert.match(wat, /unsupported-in-WASM:\s*prefilterExpr|unreachable/);
  });
});
