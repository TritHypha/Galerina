import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram } from "../dist/parser.js";
import { checkEffects } from "../dist/effect-checker.js";
import { verifyGovernance, obligationBoundToFlow } from "../dist/governance-verifier.js";

function parseAndVerify(source, profile = "production") {
  const parsed = parseProgram(source, "test.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}

function manifestFor(result, flow) {
  const m = result.runtimeManifests.find((x) => x.flow === flow);
  assert.ok(m !== undefined, `expected runtime manifest for flow ${flow}`);
  return m;
}

function assertNoCrossAttach(result, shortName, longName) {
  const shortM = manifestFor(result, shortName);
  const longM = manifestFor(result, longName);
  for (const o of shortM.proofObligations) {
    assert.ok(
      obligationBoundToFlow(o, shortName),
      `flow ${shortName} must not carry obligation ${o} (would be a prefix leak from ${longName})`,
    );
    assert.ok(
      !obligationBoundToFlow(o, longName),
      `flow ${shortName} obligation ${o} must not also bind to ${longName}`,
    );
  }
  for (const o of longM.proofObligations) {
    assert.ok(
      obligationBoundToFlow(o, longName),
      `flow ${longName} must carry only its own obligations; got ${o}`,
    );
    assert.ok(
      !obligationBoundToFlow(o, shortName),
      `flow ${longName} obligation ${o} must not bind to prefix flow ${shortName}`,
    );
  }
}

const PAY_THEN_PAYALL = `
secure flow pay(readonly request: Request) -> Response
contract {
  intent { "Pay one." }
  effects { database.write audit.write }
}
{
  return Response.ok({})
}

secure flow payAll(readonly request: Request) -> Response
contract {
  intent { "Pay all." }
  effects { database.write audit.write }
}
{
  return Response.ok({})
}
`;

const PAYALL_THEN_PAY = `
secure flow payAll(readonly request: Request) -> Response
contract {
  intent { "Pay all." }
  effects { database.write audit.write }
}
{
  return Response.ok({})
}

secure flow pay(readonly request: Request) -> Response
contract {
  intent { "Pay one." }
  effects { database.write audit.write }
}
{
  return Response.ok({})
}
`;

describe("obligationBoundToFlow helper", () => {
  it("matches exact <kind>:<flow> and <kind>:<flow>:<rest>", () => {
    assert.equal(obligationBoundToFlow("intent_declared:pay", "pay"), true);
    assert.equal(obligationBoundToFlow("audit_required:pay", "pay"), true);
    assert.equal(obligationBoundToFlow("invariant_static:pay:ensure x:statically_verified", "pay"), true);
  });

  it("refuses prefix collisions (pay vs payAll)", () => {
    assert.equal(obligationBoundToFlow("intent_declared:payAll", "pay"), false);
    assert.equal(obligationBoundToFlow("audit_required:payAll", "pay"), false);
    assert.equal(obligationBoundToFlow("intent_declared:pay", "payAll"), false);
    assert.equal(obligationBoundToFlow("intent_declared:payAll", "payAll"), true);
  });

  it("refuses malformed or unbound strings", () => {
    assert.equal(obligationBoundToFlow("pay", "pay"), false);
    assert.equal(obligationBoundToFlow(":pay", "pay"), false);
    assert.equal(obligationBoundToFlow("intent_declared:", "pay"), false);
    assert.equal(obligationBoundToFlow("intent_declared:payment", "pay"), false);
  });
});

describe("runtime manifest proofObligations — pay / payAll no cross-attach", () => {
  it("pay declared before payAll: neither manifest carries the other's obligations", () => {
    const result = parseAndVerify(PAY_THEN_PAYALL, "production");
    assert.equal(result.runtimeManifests.length, 2);
    assertNoCrossAttach(result, "pay", "payAll");
    const pay = manifestFor(result, "pay");
    const payAll = manifestFor(result, "payAll");
    assert.ok(pay.proofObligations.includes("intent_declared:pay"));
    assert.ok(pay.proofObligations.includes("audit_required:pay"));
    assert.ok(payAll.proofObligations.includes("intent_declared:payAll"));
    assert.ok(payAll.proofObligations.includes("audit_required:payAll"));
    assert.ok(!pay.proofObligations.some((o) => o.includes("payAll")));
    assert.ok(!payAll.proofObligations.some((o) => o === "intent_declared:pay" || o === "audit_required:pay"));
  });

  it("payAll declared before pay: pay must not inherit payAll obligations (the historical leak)", () => {
    const result = parseAndVerify(PAYALL_THEN_PAY, "production");
    assert.equal(result.runtimeManifests.length, 2);
    assertNoCrossAttach(result, "pay", "payAll");
    const pay = manifestFor(result, "pay");
    // Historical bug: o.includes("pay") attached intent_declared:payAll and audit_required:payAll to pay.
    assert.deepEqual(
      [...pay.proofObligations].filter((o) => o.includes("payAll")),
      [],
      `pay must not carry any payAll obligation; got ${JSON.stringify(pay.proofObligations)}`,
    );
    assert.ok(pay.proofObligations.includes("intent_declared:pay"));
    assert.ok(pay.proofObligations.includes("audit_required:pay"));
  });
});
