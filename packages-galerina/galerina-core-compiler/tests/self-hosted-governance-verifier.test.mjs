/**
 * Self-hosted governance verifier (governance-verifier.spore) — execution tests.
 *
 * Exercises the Stage B governance checks by executing the .spore flows through
 * the production interpreter and asserting their diagnostics. Covers:
 *   - SPORE-GOV-002 (secure flow declares no effects)
 *   - SPORE-VAL-001 (safety_critical flow missing audit.write)
 *   - SPORE-VAL-002 (safety_critical flow not deterministic)
 *   - hasAudit derived from the effects array (not trusted from caller)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseProgram, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const GOV_LLN = join(__dir, "..", "src", "self-hosted", "governance-verifier.spore");

const program = parseProgram(readFileSync(GOV_LLN, "utf8"), "governance-verifier.spore");

// ── value-model builders (interpreter takes tagged values / Maps) ──
const vInt = (n) => ({ __tag: "int", value: n });
const vBool = (b) => ({ __tag: "bool", value: b });
const vStr = (s) => ({ __tag: "string", value: String(s) });
const vList = (items) => ({ __tag: "list", items });

function vRecord(obj) {
  const fields = new Map();
  for (const [k, v] of Object.entries(obj)) fields.set(k, v);
  return { __tag: "record", fields };
}

function flowRecord({ name, kind, effects, classification, deterministic }) {
  return vRecord({
    name: vStr(name),
    kind: vStr(kind),
    effects: vList(effects.map(vStr)),
    classification: vStr(classification),
    deterministic: vBool(deterministic),
  });
}

async function verify(flowDefs) {
  const args = new Map([["flows", vList(flowDefs.map(flowRecord))]]);
  const r = await executeFlow(
    "verifyGovernance", args, program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const rec = r.value ?? r;
  const field = (name) => rec.fields.get(name).value;
  const diags = rec.fields.get("diagnostics").items.map((d) => {
    const r = d.value ?? d;
    return {
      code: r.fields.get("code").value,
      flowName: r.fields.get("flowName").value,
    };
  });
  return { passed: field("passed"), failed: field("failed"), diags };
}

const codesFor = (diags, flowName) =>
  diags.filter((d) => d.flowName === flowName).map((d) => d.code).sort();

describe("governance-verifier.spore — parses clean", () => {
  it("has zero parse errors", () => {
    const errors = program.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, errors.map((e) => e.message).join(", "));
  });
});

describe("governance-verifier.spore — secure flow effect requirement (SPORE-GOV-002)", () => {
  it("secure flow with no effects → SPORE-GOV-002", async () => {
    const { failed, diags } = await verify([
      { name: "chargeCard", kind: "secure", effects: [], classification: "standard", deterministic: false },
    ]);
    assert.equal(failed, 1);
    assert.deepEqual(codesFor(diags, "chargeCard"), ["SPORE-GOV-002"]);
  });

  it("secure flow with at least one effect → passes", async () => {
    const { passed, failed, diags } = await verify([
      { name: "chargeCard", kind: "secure", effects: ["net.write"], classification: "standard", deterministic: false },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
    assert.deepEqual(codesFor(diags, "chargeCard"), []);
  });
});

describe("governance-verifier.spore — safety_critical requirements (SPORE-VAL-001/002)", () => {
  it("missing audit.write → SPORE-VAL-001", async () => {
    const { diags } = await verify([
      { name: "fireThruster", kind: "guarded", effects: ["hw.write"], classification: "safety_critical", deterministic: true },
    ]);
    assert.deepEqual(codesFor(diags, "fireThruster"), ["SPORE-VAL-001"]);
  });

  it("not deterministic → SPORE-VAL-002", async () => {
    const { diags } = await verify([
      { name: "fireThruster", kind: "guarded", effects: ["audit.write"], classification: "safety_critical", deterministic: false },
    ]);
    assert.deepEqual(codesFor(diags, "fireThruster"), ["SPORE-VAL-002"]);
  });

  it("audit.write present + deterministic → passes", async () => {
    const { passed, failed, diags } = await verify([
      { name: "fireThruster", kind: "guarded", effects: ["audit.write"], classification: "safety_critical", deterministic: true },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
    assert.deepEqual(codesFor(diags, "fireThruster"), []);
  });

  it("hasAudit is derived from effects — audit.write among several effects satisfies VAL-001", async () => {
    const { diags } = await verify([
      { name: "fireThruster", kind: "guarded", effects: ["hw.write", "audit.write", "log.write"], classification: "safety_critical", deterministic: true },
    ]);
    assert.deepEqual(codesFor(diags, "fireThruster"), []);
  });
});

describe("governance-verifier.spore — combined / multi-flow pass", () => {
  it("secure + safety_critical violations accumulate per flow", async () => {
    // logEvent is BOTH secure (no effects → GOV-002) AND safety_critical
    // (no audit → VAL-001, not deterministic → VAL-002): 3 diagnostics.
    const { passed, failed, diags } = await verify([
      { name: "okFlow", kind: "secure", effects: ["net.write"], classification: "standard", deterministic: false },
      { name: "chargeCard", kind: "secure", effects: [], classification: "standard", deterministic: false },
      { name: "logEvent", kind: "secure", effects: [], classification: "safety_critical", deterministic: false },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 2);
    assert.deepEqual(codesFor(diags, "okFlow"), []);
    assert.deepEqual(codesFor(diags, "chargeCard"), ["SPORE-GOV-002"]);
    assert.deepEqual(codesFor(diags, "logEvent"), ["SPORE-GOV-002", "SPORE-VAL-001", "SPORE-VAL-002"]);
  });

  it("empty flow list → 0 passed / 0 failed", async () => {
    const { passed, failed, diags } = await verify([]);
    assert.equal(passed, 0);
    assert.equal(failed, 0);
    assert.equal(diags.length, 0);
  });
});

// ── Body-AST governance (checkBodyGovernance) ──────────────────
//
// A `secure` flow must actually CALL audit (callee "auditWrite") in its body.
// We build flow records by hand including a `body` array of Stmt records.

const callExpr = (callee, children = []) =>
  vRecord({ kind: vStr("call"), value: vStr(callee), litType: vStr(""), children: vList(children) });
const nameExpr = (id = "x") =>
  vRecord({ kind: vStr("name"), value: vStr(id), litType: vStr(""), children: vList([]) });
const binaryExpr = (l, r) =>
  vRecord({ kind: vStr("binary"), value: vStr("=="), litType: vStr(""), children: vList([l, r]) });
const stmt = (kind, expr = [], body = [], elseBody = []) =>
  vRecord({
    kind: vStr(kind), name: vStr(""), typeName: vStr(""),
    expr: vList(expr), body: vList(body), elseBody: vList(elseBody),
  });

function bodyFlowRecord({ name, kind, body }) {
  return vRecord({ name: vStr(name), kind: vStr(kind), body: vList(body) });
}

async function checkBody(flowDefs) {
  const args = new Map([["flows", vList(flowDefs.map(bodyFlowRecord))]]);
  const r = await executeFlow(
    "checkBodyGovernance", args, program.ast, program.flows,
    undefined, undefined, { pureFastPath: false }, undefined, undefined,
  );
  const rec = r.value ?? r;
  const field = (name) => rec.fields.get(name).value;
  const diags = rec.fields.get("diagnostics").items.map((d) => {
    const x = d.value ?? d;
    return { code: x.fields.get("code").value, flowName: x.fields.get("flowName").value };
  });
  return { passed: field("passed"), failed: field("failed"), diags };
}

describe("governance-verifier.spore — body audit-call governance (SPORE-VAL-001)", () => {
  it("secure flow whose body calls auditWrite → passes", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "chargeCard", kind: "secure",
        body: [stmt("exprStmt", [callExpr("auditWrite")])] },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
    assert.deepEqual(codesFor(diags, "chargeCard"), []);
  });

  it("secure flow with NO audit call → SPORE-VAL-001", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "chargeCard", kind: "secure",
        body: [stmt("exprStmt", [callExpr("doThing")])] },
    ]);
    assert.equal(passed, 0);
    assert.equal(failed, 1);
    assert.deepEqual(codesFor(diags, "chargeCard"), ["SPORE-VAL-001"]);
  });

  it("secure flow whose audit call is nested inside an if body → passes (recursion)", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "chargeCard", kind: "secure",
        body: [stmt("if", [], [stmt("exprStmt", [callExpr("auditWrite")])])] },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
    assert.deepEqual(codesFor(diags, "chargeCard"), []);
  });

  it("secure flow whose audit call is ONLY in the else branch → passes (else recursion)", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "chargeCard", kind: "secure",
        body: [stmt("if", [nameExpr("cond")],
          [stmt("exprStmt", [callExpr("doThing")])],
          [stmt("exprStmt", [callExpr("auditWrite")])])] },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
    assert.deepEqual(codesFor(diags, "chargeCard"), []);
  });

  it("secure flow with no audit in either branch → SPORE-VAL-001", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "chargeCard", kind: "secure",
        body: [stmt("if", [nameExpr("cond")],
          [stmt("exprStmt", [callExpr("doThing")])],
          [stmt("exprStmt", [callExpr("doOther")])])] },
    ]);
    assert.equal(passed, 0);
    assert.equal(failed, 1);
    assert.deepEqual(codesFor(diags, "chargeCard"), ["SPORE-VAL-001"]);
  });

  it("non-secure (pure) flow without audit → no diagnostic", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "compute", kind: "pure",
        body: [stmt("exprStmt", [callExpr("doThing")])] },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
    assert.deepEqual(codesFor(diags, "compute"), []);
  });

  it("non-secure (flow) flow without audit → no diagnostic", async () => {
    const { passed, failed } = await checkBody([
      { name: "orchestrate", kind: "flow",
        body: [stmt("exprStmt", [callExpr("doThing")])] },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
  });

  it("audit call appearing as a call ARGUMENT → detected (passes)", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "chargeCard", kind: "secure",
        body: [stmt("exprStmt", [callExpr("wrap", [callExpr("auditWrite")])])] },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
    assert.deepEqual(codesFor(diags, "chargeCard"), []);
  });

  it("audit call inside a binary (if condition) → detected (passes)", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "chargeCard", kind: "secure",
        body: [stmt("if", [binaryExpr(nameExpr(), callExpr("auditWrite"))], [])] },
    ]);
    assert.equal(passed, 1);
    assert.equal(failed, 0);
    assert.deepEqual(codesFor(diags, "chargeCard"), []);
  });

  it("multi-flow: secure-no-audit fails, secure-audit + non-secure pass", async () => {
    const { passed, failed, diags } = await checkBody([
      { name: "okSecure", kind: "secure", body: [stmt("exprStmt", [callExpr("auditWrite")])] },
      { name: "badSecure", kind: "secure", body: [stmt("exprStmt", [callExpr("doThing")])] },
      { name: "purePass", kind: "pure", body: [] },
    ]);
    assert.equal(passed, 2);
    assert.equal(failed, 1);
    assert.deepEqual(codesFor(diags, "okSecure"), []);
    assert.deepEqual(codesFor(diags, "badSecure"), ["SPORE-VAL-001"]);
    assert.deepEqual(codesFor(diags, "purePass"), []);
  });
});
