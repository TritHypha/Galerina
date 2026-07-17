/**
 * Self-hosted effect checker (effect-checker.fungi) — execution tests.
 *
 * Exercises the Stage B declared-vs-used effect reconciliation by executing
 * the .fungi flows through the production interpreter and asserting their
 * diagnostics. Codes match the Stage A compiler's canonical meanings:
 *   - FUNGI-EFFECT-001 (UNDECLARED_EFFECT)          — used effect not declared
 *   - FUNGI-EFFECT-003 (EFFECT_BOUNDARY_VIOLATION)  — pure flow declares/uses effects
 *   - FUNGI-EFFECT-004 (UNKNOWN_EFFECT)             — effect not in known registry
 *   - FUNGI-EFFECT-005 (advisory, carried from stub) — secure/guarded declares none
 *
 * Each flow record passed in carries:
 *   name: String, kind: String, effects: Array<String> (declared),
 *   usedEffects: Array<String> (effects the parser decomposed from the body).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const EC_FUNGI = join(__dir, "..", "src", "self-hosted", "effect-checker.fungi");

const program = parseProgram(readFileSync(EC_FUNGI, "utf8"), "effect-checker.fungi");

// ── value-model builders (interpreter takes tagged values / Maps) ──
const vStr = (s) => ({ __tag: "string", value: String(s) });
const vList = (items) => ({ __tag: "list", items });

function vRecord(obj) {
  const fields = new Map();
  for (const [k, v] of Object.entries(obj)) fields.set(k, v);
  return { __tag: "record", fields };
}

const flow = ({ name, kind, effects = [], usedEffects = [] }) =>
  vRecord({
    name: vStr(name),
    kind: vStr(kind),
    effects: vList(effects.map(vStr)),
    usedEffects: vList(usedEffects.map(vStr)),
  });

async function check(flows) {
  const args = new Map([["flows", vList(flows)]]);
  const r = await executeFlow(
    "checkFlowEffects", args, program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const rec = r.value ?? r;
  const diags = rec.fields.get("diagnostics").items.map((d) => {
    const x = d.value ?? d;
    return {
      code: x.fields.get("code").value,
      flowName: x.fields.get("flowName").value,
      severity: x.fields.get("severity").value,
    };
  });
  return {
    flowCount: rec.fields.get("flowCount").value,
    cleanFlows: rec.fields.get("cleanFlows").value,
    diags,
  };
}

const codesFor = (diags, flowName) =>
  diags.filter((d) => d.flowName === flowName).map((d) => d.code).sort();

// ── AST builders for body-derived checks (checkBodyEffects) ──
// Expr: { kind, value, litType, children:Array<Expr> }
const eLit = (v, litType = "int") =>
  vRecord({ kind: vStr("lit"), value: vStr(v), litType: vStr(litType), children: vList([]) });
const eName = (v) =>
  vRecord({ kind: vStr("name"), value: vStr(v), litType: vStr(""), children: vList([]) });
const eCall = (callee, args = []) =>
  vRecord({ kind: vStr("call"), value: vStr(callee), litType: vStr(""), children: vList(args) });
const eBinary = (op, l, r) =>
  vRecord({ kind: vStr("binary"), value: vStr(op), litType: vStr(""), children: vList([l, r]) });

// Stmt: { kind, name, typeName, expr:Array<Expr>, body:Array<Stmt>, elseBody:Array<Stmt> }
const stmt = ({ kind = "exprStmt", name = "", typeName = "", expr = [], body = [], elseBody = [] }) =>
  vRecord({
    kind: vStr(kind),
    name: vStr(name),
    typeName: vStr(typeName),
    expr: vList(expr),
    body: vList(body),
    elseBody: vList(elseBody),
  });

// Flow record carrying a body AST (used effects are DERIVED, not supplied).
const bodyFlow = ({ name, kind, effects = [], body = [] }) =>
  vRecord({
    name: vStr(name),
    kind: vStr(kind),
    effects: vList(effects.map(vStr)),
    body: vList(body),
  });

async function checkBody(flows) {
  const args = new Map([["flows", vList(flows)]]);
  const r = await executeFlow(
    "checkBodyEffects", args, program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const rec = r.value ?? r;
  const diags = rec.fields.get("diagnostics").items.map((d) => {
    const x = d.value ?? d;
    return {
      code: x.fields.get("code").value,
      flowName: x.fields.get("flowName").value,
      severity: x.fields.get("severity").value,
    };
  });
  return {
    flowCount: rec.fields.get("flowCount").value,
    cleanFlows: rec.fields.get("cleanFlows").value,
    diags,
  };
}

describe("effect-checker.fungi — parses clean", () => {
  it("has zero parse errors", () => {
    const errors = program.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, errors.map((e) => e.message).join(", "));
  });
});

describe("effect-checker.fungi — clean reconciliation (used ⊆ declared)", () => {
  it("guarded flow using exactly its declared effects → no diagnostics", async () => {
    const { diags, cleanFlows } = await check([
      flow({ name: "a", kind: "guarded", effects: ["database.read"], usedEffects: ["database.read"] }),
    ]);
    assert.deepEqual(codesFor(diags, "a"), []);
    assert.equal(cleanFlows, 1);
  });

  it("declares more than it uses → FUNGI-EFFECT-007 overdeclared (Stage-A parity)", async () => {
    const { diags } = await check([
      flow({ name: "a2", kind: "guarded", effects: ["database.read", "audit.write"], usedEffects: ["database.read"] }),
    ]);
    // audit.write is declared but never used → overdeclared warning; database.read is used → no 001.
    assert.deepEqual(codesFor(diags, "a2"), ["FUNGI-EFFECT-007"]);
  });
});

describe("effect-checker.fungi — FUNGI-EFFECT-001 UndeclaredEffect", () => {
  it("uses an effect it did not declare → FUNGI-EFFECT-001", async () => {
    const { diags } = await check([
      flow({ name: "b", kind: "guarded", effects: ["database.read"], usedEffects: ["database.read", "network.outbound"] }),
    ]);
    assert.deepEqual(codesFor(diags, "b"), ["FUNGI-EFFECT-001"]);
  });
});

describe("effect-checker.fungi — FUNGI-EFFECT-004 UnknownEffect", () => {
  it("declares an effect not in the registry → FUNGI-EFFECT-004", async () => {
    const { diags } = await check([
      flow({ name: "d", kind: "guarded", effects: ["bogus.declared"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "d"), ["FUNGI-EFFECT-004"]);
  });

  it("uses an unknown effect → undeclared (001) + unknown (004) + overdeclared (007)", async () => {
    const { diags } = await check([
      flow({ name: "c", kind: "guarded", effects: ["database.read"], usedEffects: ["bogus.effect"] }),
    ]);
    // bogus.effect: used-but-undeclared (001) + unknown (004); database.read: declared-but-unused (007).
    assert.deepEqual(codesFor(diags, "c"), ["FUNGI-EFFECT-001", "FUNGI-EFFECT-004", "FUNGI-EFFECT-007"]);
  });
});

describe("effect-checker.fungi — FUNGI-EFFECT-007 OverdeclaredEffect", () => {
  it("a known effect declared but never used → FUNGI-EFFECT-007 warning", async () => {
    const { diags } = await check([
      flow({ name: "od", kind: "guarded", effects: ["database.read", "audit.write"], usedEffects: ["database.read"] }),
    ]);
    const od = diags.filter((d) => d.flowName === "od");
    assert.deepEqual(od.map((d) => d.code), ["FUNGI-EFFECT-007"]);
    assert.equal(od[0].severity, "warning");
  });

  it("an UNKNOWN declared-unused effect stays 004-only (002 not double-reported)", async () => {
    const { diags } = await check([
      flow({ name: "odu", kind: "guarded", effects: ["bogus.declared"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "odu"), ["FUNGI-EFFECT-004"]);
  });

  it("a pure flow's declared effect stays 003-only (not 002)", async () => {
    const { diags } = await check([
      flow({ name: "odp", kind: "pure", effects: ["database.read"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "odp"), ["FUNGI-EFFECT-003"]);
  });
});

describe("effect-checker.fungi — FUNGI-EFFECT-003 PureViolation", () => {
  it("pure flow that USES an effect → FUNGI-EFFECT-003 (plus 001, nothing declared)", async () => {
    const { diags } = await check([
      flow({ name: "e", kind: "pure", effects: [], usedEffects: ["database.read"] }),
    ]);
    assert.deepEqual(codesFor(diags, "e"), ["FUNGI-EFFECT-001", "FUNGI-EFFECT-003"]);
  });

  it("pure flow that DECLARES an effect → FUNGI-EFFECT-003 (count check kept)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "pure", effects: ["database.read"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-003"]);
  });

  it("pure flow with no effects declared or used → clean", async () => {
    const { diags } = await check([
      flow({ name: "f0", kind: "pure", effects: [], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f0"), []);
  });
});

// FUNGI-EFFECT-005 (BROAD_ALIAS_USED, warning) + FUNGI-EFFECT-009 (NON_CANONICAL_EFFECT, error) —
// the alias-cluster. 005 was previously a SQUAT here (a secure/guarded flow declaring no effects);
// Stage-A emits NO diagnostic for that, and 005 is canonically BROAD_ALIAS_USED. Un-squatted 2026-07-17
// (R&D-adjudicated). Grounded vs raw Stage-A validateDeclaredEffectNames: broad alias (network/…/
// secret.access) -> 005; non-broad alias (http.get/pii.write) -> 009; payment.charge is CANONICAL
// (in knownEffects) -> 008 not 004; an invention -> 004. (RD-0412 §4, effect-checker twin, alias-cluster.)
describe("effect-checker.fungi — FUNGI-EFFECT-005 / 009 alias-cluster (un-squatted)", () => {
  it("secure flow declaring no effects → NO diagnostic (un-squatted; Stage-A emits nothing)", async () => {
    const { diags } = await check([
      flow({ name: "g", kind: "secure", effects: [], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "g"), []);
  });

  it("a broad alias (network) → 005 warning alone", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["network"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-005"]);
    assert.equal(diags.filter((d) => d.flowName === "f")[0].severity, "warning");
  });

  it("another broad alias (secret.access) → 005 (not 004/009)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["secret.access"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-005"]);
  });

  it("a non-broad alias (http.get) → 009 error", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["http.get"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-009"]);
    assert.equal(diags.filter((d) => d.flowName === "f")[0].severity, "error");
  });

  it("pii.write is a non-broad alias → 009 (the L823 '004' comment is stale; Stage-A emits 009)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["pii.write"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-009"]);
  });

  it("payment.charge (plain, used) → 008 alone, no spurious 004 (now canonical in knownEffects)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["payment.charge"], usedEffects: ["payment.charge"] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-008"]);
  });

  it("a true invention (totally.fake.effect) → 004 (unknown, not an alias)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["totally.fake.effect"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-004"]);
  });
});

describe("effect-checker.fungi — aggregate & edge cases", () => {
  it("empty flow list → no diagnostics, flowCount 0", async () => {
    const { flowCount, cleanFlows, diags } = await check([]);
    assert.equal(flowCount, 0);
    assert.equal(cleanFlows, 0);
    assert.equal(diags.length, 0);
  });

  it("multi-flow: counts every flow and aggregates diagnostics per flow", async () => {
    const { flowCount, cleanFlows, diags } = await check([
      flow({ name: "ok", kind: "guarded", effects: ["database.read"], usedEffects: ["database.read"] }),
      flow({ name: "bad", kind: "guarded", effects: ["database.read"], usedEffects: ["network.outbound"] }),
      flow({ name: "purebad", kind: "pure", effects: [], usedEffects: ["audit.write"] }),
    ]);
    assert.equal(flowCount, 3);
    assert.equal(cleanFlows, 1);
    assert.deepEqual(codesFor(diags, "ok"), []);
    // bad: network.outbound used-but-undeclared (001) + database.read declared-but-unused (002).
    assert.deepEqual(codesFor(diags, "bad"), ["FUNGI-EFFECT-001", "FUNGI-EFFECT-007"]);
    assert.deepEqual(codesFor(diags, "purebad"), ["FUNGI-EFFECT-001", "FUNGI-EFFECT-003"]);
  });
});

describe("effect-checker.fungi — checkBodyEffects (body-derived effects)", () => {
  it("body calls dbRead but declares no effects → FUNGI-EFFECT-001", async () => {
    const { diags, cleanFlows } = await checkBody([
      bodyFlow({ name: "f1", kind: "guarded", effects: [], body: [
        stmt({ kind: "exprStmt", expr: [eCall("dbRead")] }),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "f1"), ["FUNGI-EFFECT-001"]);
    assert.equal(cleanFlows, 0);
  });

  it("same dbRead call WITH database.read declared → clean", async () => {
    const { diags, cleanFlows } = await checkBody([
      bodyFlow({ name: "f2", kind: "guarded", effects: ["database.read"], body: [
        stmt({ kind: "exprStmt", expr: [eCall("dbRead")] }),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "f2"), []);
    assert.equal(cleanFlows, 1);
  });

  it("pure flow that calls dbWrite → FUNGI-EFFECT-003 (plus 001, nothing declared)", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "f3", kind: "pure", effects: [], body: [
        stmt({ kind: "exprStmt", expr: [eCall("dbWrite")] }),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "f3"), ["FUNGI-EFFECT-001", "FUNGI-EFFECT-003"]);
  });

  it("effectful call nested inside an if body → still detected (recursion)", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "f4", kind: "guarded", effects: [], body: [
        stmt({ kind: "if", expr: [eName("cond")], body: [
          stmt({ kind: "exprStmt", expr: [eCall("netGet")] }),
        ]}),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "f4"), ["FUNGI-EFFECT-001"]);
  });

  it("effectful call nested inside an if ELSE body → still detected (else recursion)", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "f4e", kind: "guarded", effects: [], body: [
        stmt({ kind: "if", expr: [eName("cond")],
          body: [stmt({ kind: "exprStmt", expr: [eName("noop")] })],
          elseBody: [stmt({ kind: "exprStmt", expr: [eCall("dbWrite")] })] }),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "f4e"), ["FUNGI-EFFECT-001"]);
  });

  it("effectful call nested inside a while body → still detected (recursion)", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "f4b", kind: "guarded", effects: [], body: [
        stmt({ kind: "while", expr: [eName("cond")], body: [
          stmt({ kind: "exprStmt", expr: [eCall("writeFile")] }),
        ]}),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "f4b"), ["FUNGI-EFFECT-001"]);
  });

  it("call buried in a binary argument (x + auditWrite()) → detected", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "f5", kind: "guarded", effects: [], body: [
        stmt({ kind: "return", expr: [eBinary("+", eName("x"), eCall("auditWrite"))] }),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "f5"), ["FUNGI-EFFECT-001"]);
  });

  it("call passed as a call argument (dbWrite(netGet())) → both effects detected", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "f5b", kind: "guarded", effects: ["database.write"], body: [
        stmt({ kind: "exprStmt", expr: [eCall("dbWrite", [eCall("netGet")])] }),
      ]}),
    ]);
    // dbWrite is declared; netGet (network.inbound) is not → one 001.
    assert.deepEqual(codesFor(diags, "f5b"), ["FUNGI-EFFECT-001"]);
  });

  it("only non-effectful calls / pure arithmetic → clean", async () => {
    const { diags, cleanFlows } = await checkBody([
      bodyFlow({ name: "f6", kind: "pure", effects: [], body: [
        stmt({ kind: "return", expr: [eBinary("+", eLit("1"), eCall("helper", [eLit("2")]))] }),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "f6"), []);
    assert.equal(cleanFlows, 1);
  });

  it("multi-flow body pass: counts every flow and aggregates per flow", async () => {
    const { flowCount, cleanFlows, diags } = await checkBody([
      bodyFlow({ name: "ok", kind: "guarded", effects: ["database.read"], body: [
        stmt({ kind: "exprStmt", expr: [eCall("dbRead")] }),
      ]}),
      bodyFlow({ name: "bad", kind: "guarded", effects: [], body: [
        stmt({ kind: "exprStmt", expr: [eCall("netPost")] }),
      ]}),
      bodyFlow({ name: "purebad", kind: "pure", effects: [], body: [
        stmt({ kind: "exprStmt", expr: [eCall("auditWrite")] }),
      ]}),
    ]);
    assert.equal(flowCount, 3);
    assert.equal(cleanFlows, 1);
    assert.deepEqual(codesFor(diags, "ok"), []);
    assert.deepEqual(codesFor(diags, "bad"), ["FUNGI-EFFECT-001"]);
    assert.deepEqual(codesFor(diags, "purebad"), ["FUNGI-EFFECT-001", "FUNGI-EFFECT-003"]);
  });
});

// FUNGI-EFFECT-002 (TRANSITIVE_EFFECT_NOT_DECLARED, error) — a flow that calls (directly or
// transitively) a flow declaring an effect it does not declare (Stage-A collectTransitiveCalledEffects,
// effect-checker.ts:942). Uses checkBodyEffects (it has each flow's body + declared effects → the call
// graph). Mirrors the Stage-A algorithm; the real-parser leg is in self-hosted-pipeline.test.mjs.
describe("effect-checker.fungi — FUNGI-EFFECT-002 TRANSITIVE_EFFECT_NOT_DECLARED", () => {
  it("A calls B (declares network.outbound); A declares nothing → 002 on A", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "a", kind: "flow", effects: [], body: [
        stmt({ kind: "exprStmt", expr: [eCall("b")] }),
      ]}),
      bodyFlow({ name: "b", kind: "flow", effects: ["network.outbound"], body: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "a"), ["FUNGI-EFFECT-002"]);
    assert.deepEqual(codesFor(diags, "b"), []);
  });

  it("A calls B and A DECLARES the effect → clean (no 002)", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "a", kind: "flow", effects: ["network.outbound"], body: [
        stmt({ kind: "exprStmt", expr: [eCall("b")] }),
      ]}),
      bodyFlow({ name: "b", kind: "flow", effects: ["network.outbound"], body: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "a"), []);
  });

  it("transitive: A→B→C (C declares network.outbound); A and B under-declare → 002 on both", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "a", kind: "flow", effects: [], body: [
        stmt({ kind: "exprStmt", expr: [eCall("b")] }),
      ]}),
      bodyFlow({ name: "b", kind: "flow", effects: [], body: [
        stmt({ kind: "exprStmt", expr: [eCall("c")] }),
      ]}),
      bodyFlow({ name: "c", kind: "flow", effects: ["network.outbound"], body: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "a"), ["FUNGI-EFFECT-002"]);
    assert.deepEqual(codesFor(diags, "b"), ["FUNGI-EFFECT-002"]);
    assert.deepEqual(codesFor(diags, "c"), []);
  });

  it("a cycle A↔B is path-guarded (terminates); only the under-declarer gets 002", async () => {
    const { diags } = await checkBody([
      bodyFlow({ name: "a", kind: "flow", effects: [], body: [
        stmt({ kind: "exprStmt", expr: [eCall("b")] }),
      ]}),
      bodyFlow({ name: "b", kind: "flow", effects: ["network.outbound"], body: [
        stmt({ kind: "exprStmt", expr: [eCall("a")] }),
      ]}),
    ]);
    assert.deepEqual(codesFor(diags, "a"), ["FUNGI-EFFECT-002"]);
    assert.deepEqual(codesFor(diags, "b"), []);
  });
});

describe("effect-checker.fungi — no duplicate diagnostics", () => {
  it("a used + declared unknown effect emits exactly ONE FUNGI-EFFECT-004", async () => {
    const { diags } = await check([
      flow({ name: "x", kind: "guarded", effects: ["bogus.x"], usedEffects: ["bogus.x"] }),
    ]);
    assert.deepEqual(codesFor(diags, "x"), ["FUNGI-EFFECT-004"]);
  });

  it("a repeated used effect emits FUNGI-EFFECT-001 only once", async () => {
    const { diags } = await check([
      flow({ name: "y", kind: "guarded", effects: ["database.read"], usedEffects: ["network.outbound", "network.outbound"] }),
    ]);
    assert.deepEqual(codesFor(diags, "y"), ["FUNGI-EFFECT-001", "FUNGI-EFFECT-007"]);
  });
});

// FUNGI-EFFECT-008 (PRIVILEGED_EFFECT_ON_PLAIN_FLOW, warning) — a plain `flow` (kind "flow") declaring a
// privileged effect (secret.read / payment.charge, Stage-A PLAIN_FLOW_PRIVILEGED_EFFECTS) under-declares
// the security tier; the fix is `secure flow`. Verified vs Stage-A checkFlowEffects raw diagnostics:
// plain+secret.read → 008; secure/pure/non-privileged declarer → no 008. Tests use secret.read (a KNOWN
// effect); payment.charge is also privileged but is NOT yet in the twin's knownEffects() (a latent
// FUNGI-EFFECT-004 gap flagged for the canonical-effects alignment). (RD-0412 §4, effect-checker twin.)
describe("effect-checker.fungi — FUNGI-EFFECT-008 PRIVILEGED_EFFECT_ON_PLAIN_FLOW", () => {
  it("plain flow declaring a used privileged effect (secret.read) → 008 alone", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["secret.read"], usedEffects: ["secret.read"] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-008"]);
  });

  it("a SECURE flow with the same privileged effect → clean (no 008)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "secure", effects: ["secret.read"], usedEffects: ["secret.read"] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("a plain flow with a NON-privileged effect (database.read) → no 008", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["database.read"], usedEffects: ["database.read"] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });

  it("plain flow declaring an UNUSED privileged effect → 007 + 008 (co-emission)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["secret.read"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-007", "FUNGI-EFFECT-008"]);
  });
});

// FUNGI-EFFECT-006 (DENY_ONLY_EFFECT, error) — a declared effect Stage-A recognises but can NEVER grant
// (eval.execute, memory.spill; Stage-A DENY_ONLY_EFFECTS, effect-checker.ts:447). Checked FIRST in the
// declared loop and, like Stage-A validateDeclaredEffectNames' `continue`, SKIPS 004/007/008 for that
// effect. Grounded vs Stage-A checkFlowEffects raw diagnostics (probe): plain/secure/guarded memory.spill
// → 006 alone; a pure flow adds 003 (pure boundary); a second, non-deny effect keeps its own checks
// (per-effect). (RD-0412 §4, effect-checker twin, 006-frontier.)
describe("effect-checker.fungi — FUNGI-EFFECT-006 DENY_ONLY_EFFECT", () => {
  it("plain flow declaring a deny-only effect (memory.spill) → 006 alone (no 004/007)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["memory.spill"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-006"]);
  });

  it("plain flow declaring eval.execute (the other deny-only name) → 006 alone", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["eval.execute"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-006"]);
  });

  it("a SECURE flow declaring memory.spill → 006 alone (deny-only fires on any kind)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "secure", effects: ["memory.spill"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-006"]);
  });

  it("a GUARDED flow declaring memory.spill → 006 alone", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "guarded", effects: ["memory.spill"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-006"]);
  });

  it("a PURE flow declaring memory.spill → 003 + 006 (pure boundary + deny-only)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "pure", effects: ["memory.spill"], usedEffects: [] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-003", "FUNGI-EFFECT-006"]);
  });

  it("deny-only + a used privileged effect → 006 + 008 (per-effect; deny-only doesn't mask 008)", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["memory.spill", "secret.read"], usedEffects: ["secret.read"] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), ["FUNGI-EFFECT-006", "FUNGI-EFFECT-008"]);
  });

  it("a KNOWN non-deny effect (database.read, used) → no 006", async () => {
    const { diags } = await check([
      flow({ name: "f", kind: "flow", effects: ["database.read"], usedEffects: ["database.read"] }),
    ]);
    assert.deepEqual(codesFor(diags, "f"), []);
  });
});
