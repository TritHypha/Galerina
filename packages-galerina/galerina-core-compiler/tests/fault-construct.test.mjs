// =============================================================================
// W5b T2.2 — `fault <expr>` : the audited, terminal, fail-closed fault channel
//
// A fault is the governed error-RAISE (RD-0266 A10). Raise-only MVP (owner lock
// 2026-07-09): every fault is unhandled, so it can never be swallowed. Semantics:
//   • TERMINAL   — `fault` HALTS the flow; statements after it never run.
//   • AUDITED    — the raise is recorded (auditEntries `event:"fault"` +
//                  FUNGI-FAULT-001), DISTINCT from an anonymous runtime crash.
//   • DENIES     — no value is produced; audit.result === "error" (fail-closed,
//                  nothing downstream is authorized).
//   • NOT A VERDICT — a fault never collapses into a check arm / `_`.
//   • EFFECT-SAFE — an effect inside the reason expr is NOT a governance blind
//                   spot (the checkers descend into the reason).
//   • WASM fail-closed — a flow containing `fault` lowers to an `unreachable`
//                   trap, never a body that silently omits the raise.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const FLOW = (body, sig = "pure flow f(v: String) -> String", contract = "contract { effects {} }") =>
  `@version 1\n${sig}\n${contract}\n{\n  ${body}\n}`;

describe("T2.2 fault — parsing + AST shape", () => {
  it("parses `fault <expr>` into a faultStmt with a reason child", () => {
    const p = L.parseProgram(FLOW(`fault "boom"\n  return "x"`), "t.fungi");
    assert.equal((p.diagnostics ?? []).filter((d) => d.severity === "error").length, 0);
    const found = [];
    (function walk(n) { if (!n || typeof n !== "object") return; if (n.kind === "faultStmt") found.push(n); for (const c of n.children ?? []) walk(c); })(p.ast);
    assert.equal(found.length, 1);
    assert.equal((found[0].children ?? []).length, 1); // the reason expr
  });

  it("parses a bare `fault` (no reason) into a faultStmt with zero children", () => {
    const p = L.parseProgram(FLOW(`fault\n  return "x"`), "t.fungi");
    assert.equal((p.diagnostics ?? []).filter((d) => d.severity === "error").length, 0);
    let n0 = null;
    (function walk(n) { if (!n || typeof n !== "object") return; if (n.kind === "faultStmt") n0 = n; for (const c of n.children ?? []) walk(c); })(p.ast);
    assert.ok(n0 && (n0.children ?? []).length === 0);
  });
});

describe("T2.2 fault — runtime: HALT + AUDIT + DENY (fail-closed)", () => {
  it("raising `fault` halts the flow, audit.result='error', reason recorded", async () => {
    const p = L.parseProgram(FLOW(`fault "boom"\n  return "ok"`), "t.fungi");
    const r = await L.executeFlow("f", new Map([["v", { __tag: "string", value: "in" }]]), p.ast);
    assert.equal(r?.audit?.result, "error", "an unhandled fault must DENY (halt, never succeed)");
    assert.match(r?.value?.message ?? "", /fault: boom/, "the value is a runtimeError carrying the reason");
  });

  it("the raise is an AUDITED channel — FUNGI-FAULT-001 + an `event:\"fault\"` audit entry", async () => {
    const p = L.parseProgram(FLOW(`fault "denied by policy"`), "t.fungi");
    const r = await L.executeFlow("f", new Map([["v", { __tag: "string", value: "in" }]]), p.ast);
    assert.ok((r?.diagnostics ?? []).some((d) => d.code === "FUNGI-FAULT-001"), "a governed fault is FUNGI-FAULT-001, not an anonymous crash");
    assert.ok((r?.auditEntries ?? []).some((e) => e.event === "fault" && e.fields?.reason === "denied by policy"), "the fault raise is in the audit trail");
  });

  it("fault is TERMINAL — a statement after it never runs (no fallthrough)", async () => {
    const p = L.parseProgram(FLOW(`fault "stop"\n  return "REACHED"`), "t.fungi");
    const r = await L.executeFlow("f", new Map([["v", { __tag: "string", value: "in" }]]), p.ast);
    assert.notEqual(r?.value?.value, "REACHED", "code after a fault must be unreachable");
    assert.equal(r?.audit?.result, "error");
  });

  it("a fault raised from a NESTED check arm still unwinds to a halt (not swallowed)", async () => {
    const src = `@version 1\npure flow f(v: Verdict) -> String\ncontract { effects {} }\n{ check(v) { deny: { fault "denied" } if: { return "allow" } ambig: { return "u" } } return "fell-through" }`;
    const p = L.parseProgram(src, "t.fungi");
    const r = await L.executeFlow("f", new Map([["v", { __tag: "verdict", value: -1 }]]), p.ast);
    assert.equal(r?.audit?.result, "error");
    assert.match(r?.value?.message ?? "", /fault: denied/);
  });
});

describe("T2.2 fault — effect-safety (no governance blind spot)", () => {
  it("an undeclared effect inside the fault reason is still caught", () => {
    const src = `@version 1\nsecure flow f(v: String) -> Void\ncontract { intent { "x" } effects {} }\n{ fault Database.write("k", v) }`;
    const p = L.parseProgram(src, "e.fungi");
    const errs = L.checkEffects(p.flows, p.ast, "production", true).flatMap((r) => r.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.ok(errs.length > 0, "an effect in a fault reason must not be a governance blind spot");
  });
});

describe("T2.2 fault — WASM tier is fail-closed until lowered (no parity fail-open)", () => {
  it("a flow containing `fault` lowers to an (unreachable) trap in WASM", () => {
    const p = L.parseProgram(FLOW(`fault "boom"`, "pure flow f(v: Int) -> Void"), "t.fungi");
    let flow = null;
    (function w(n) { if (!n || typeof n !== "object") return; if (/FlowDecl$/.test(n.kind ?? "")) flow = n; for (const c of n.children ?? []) w(c); })(p.ast);
    const wat = L.emitWATFromFlowAST(flow, ["v"]);
    assert.equal(typeof wat, "string");
    assert.match(wat, /unsupported-in-WASM:\s*faultStmt|unreachable/, "fault must fail-CLOSED in WASM, never silently skip the raise");
  });
});
