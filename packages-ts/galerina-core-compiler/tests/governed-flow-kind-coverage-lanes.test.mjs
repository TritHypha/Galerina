// Checker-lane lookups that used `kind ∈ {flow,secure,pure,guarded} && value === name`
// missed governedFlowDecl twice (kind absent; value is governed:<floor>:<name>).
// Each live lane has a paired control: the same body on `guarded` still fires, so a
// governed miss cannot be explained as "the fixture is not a violation".
// Execution lanes (bytecode-vm, sync interpreter) keep omitting governed — fail-closed
// skip of the i32 fast path, not a silent checker miss.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseProgram,
  checkValueStates,
  checkUnusedBindings,
  checkEffects,
  effectResultsToDiagnostics,
  analyzeFlowDependencies,
  analyzeMillionReadLoopEnvelope,
  compileToBytecode,
  emitGIR,
} from "../dist/index.js";
import { collectLocalBindings } from "../dist/effect-checker.js";
import { generateManifest } from "../dist/manifest-generator.js";
import * as flowNameModule from "../dist/flow-name.js";

const { isFlowDeclNamed, declaredFlowName, FLOW_DECL_KINDS } = flowNameModule;
const OLD_SHAPE = (node, name) => FLOW_DECL_KINDS.has(node.kind) && node.value === name;

const GOV = `governed floor_2 flow moveit(raw: String) -> Int
contract { intent { "move" } }
{
  let unusedPlate = 1
  return 0
}
`;

function undeclaredFind(tierPrefix) {
  return `${tierPrefix} flow loadOrder(order: Order) -> Result<Order, OrderError>
contract { intent { "s" } effects {  } }
{
  return Ok(OrdersDB.find(order.id)?)
}
`;
}

function effectCodes(src) {
  const p = parseProgram(src, "fx.fungi");
  const results = checkEffects(p.flows, p.ast);
  return {
    parseErrors: (p.diagnostics ?? []).filter((d) => d.severity === "error"),
    results,
    codes: effectResultsToDiagnostics(results).map((d) => d.code),
    store: results.find((r) => r.flowName === "loadOrder"),
  };
}

describe("governedFlowDecl checker-lane coverage", () => {
  it("discriminating control: OLD kind+value lookup MISSES governed; decoder FINDS it", () => {
    const p = parseProgram(GOV, "gov.fungi");
    const node = (p.ast.children ?? []).find((c) => c.kind === "governedFlowDecl");
    assert.ok(node, "parser must emit governedFlowDecl");
    assert.equal(OLD_SHAPE(node, "moveit"), false, "control: old lookup misses governed");
    assert.equal(isFlowDeclNamed(node, "moveit"), true, "decoder finds governed by declared name");
    assert.equal(declaredFlowName(node), "moveit");
    assert.equal(node.value, "governed:floor_2:moveit");
  });

  it("analyzeFlowDependencies indexes a governed flow by its declared name", () => {
    const p = parseProgram(GOV, "gov.fungi");
    assert.deepEqual((p.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const deps = analyzeFlowDependencies(p.ast);
    assert.ok(deps.has("moveit"), `expected moveit in deps, got ${[...deps.keys()].join(",") || "none"}`);
    assert.equal(deps.has("governed:floor_2:moveit"), false, "must not index the encoded value as the name");
  });

  it("non-regression: analyzeFlowDependencies still indexes an ordinary flow", () => {
    const p = parseProgram(`flow plain(x: Int) -> Int contract { intent { "p" } } { return x }`, "plain.fungi");
    const deps = analyzeFlowDependencies(p.ast);
    assert.ok(deps.has("plain"), `expected plain in deps, got ${[...deps.keys()].join(",") || "none"}`);
  });

  it("collectLocalBindings sees governed-flow params (BINDING_DECL_KINDS includes governedFlowDecl)", () => {
    const p = parseProgram(GOV, "gov.fungi");
    const node = (p.ast.children ?? []).find((c) => c.kind === "governedFlowDecl");
    assert.ok(node, "parser must emit governedFlowDecl");
    const names = collectLocalBindings(node);
    assert.ok(names.has("raw"), `expected param raw, got ${[...names].join(",") || "none"}`);
  });

  it("checkUnusedBindings sees an unused local inside a governed flow", () => {
    const p = parseProgram(GOV, "gov.fungi");
    const diags = checkUnusedBindings(p.ast, p.flows);
    const hit = diags.find((d) => d.bindingName === "unusedPlate" && d.flowName === "moveit");
    assert.ok(hit, `expected unusedPlate on moveit, got ${diags.map((d) => `${d.flowName}:${d.bindingName}`).join(",") || "none"}`);
  });

  it("CONTROL: guarded undeclared OrdersDB.find fires FUNGI-EFFECT-001 (instrument can go red)", () => {
    const { parseErrors, store, codes } = effectCodes(undeclaredFind("guarded"));
    assert.deepEqual(parseErrors, [], "guarded control must parse");
    assert.ok(store, "guarded loadOrder must be effect-checked");
    assert.ok(store.observedEffects.includes("database.read"), `guarded observedEffects=${store.observedEffects.join(",")}`);
    assert.ok(codes.includes("FUNGI-EFFECT-001"), `guarded must fire EFFECT-001, got ${codes.join(",") || "none"}`);
  });

  it("governed undeclared OrdersDB.find fires FUNGI-EFFECT-001 (same body; findFlowNode found the body)", () => {
    // If findFlowNode still used kind+value, observedEffects would be empty and EFFECT-001 would not fire.
    const { parseErrors, store, codes } = effectCodes(undeclaredFind("governed floor_2"));
    assert.deepEqual(parseErrors, [], "governed fixture must parse");
    assert.ok(store, "effect result must be keyed by declared name 'loadOrder', not the encoding");
    assert.equal(store.flowName, "loadOrder");
    assert.ok(store.observedEffects.includes("database.read"), `governed observedEffects=${store.observedEffects.join(",") || "empty"}`);
    assert.ok(codes.includes("FUNGI-EFFECT-001"), `governed must fire EFFECT-001, got ${codes.join(",") || "none"}`);
  });

  it("checkValueStates walks governedFlowDecl (VS-008 on a governed sink)", () => {
    const p = parseProgram(
      `governed floor_3 flow test(raw: String) -> Result<String, Error>
contract { effects { database.write } }
{
  let saved = DB.insert(raw)?
  return Ok(saved)
}
`,
      "vs.fungi",
    );
    const r = checkValueStates(p.ast);
    const n = r.diagnostics.filter((d) => d.code === "FUNGI-VALUESTATE-008");
    assert.ok(n.length >= 1, `expected FUNGI-VALUESTATE-008, got ${r.diagnostics.map((d) => d.code).join(",") || "none"}`);
  });

  it("analyzeMillionReadLoopEnvelope finds a governed flow instead of FLOW_NOT_FOUND", () => {
    const p = parseProgram(GOV, "gov.fungi");
    const env = analyzeMillionReadLoopEnvelope(p.ast, "moveit");
    assert.equal(
      env.failureIds?.includes("FLOW_NOT_FOUND") ?? false,
      false,
      `governed moveit must be found; got ${JSON.stringify(env.failureIds ?? env)}`,
    );
  });

  it("emitGIR carries governed paramTypes under the declared name", () => {
    const p = parseProgram(
      `governed floor_2 flow capCheck(state: Int, effect: String) -> Bool
contract { intent { "gate" } effects {} }
{ return true }
`,
      "gir.fungi",
    );
    const fx = checkEffects(p.flows, p.ast);
    const { gir } = emitGIR(p.ast, p.flows, fx);
    const flow = gir.flows.find((f) => f.name === "capCheck");
    assert.ok(flow, `expected GIR flow capCheck, got ${(gir.flows ?? []).map((f) => f.name).join(",") || "none"}`);
    assert.equal(gir.flows.some((f) => f.name === "governed:floor_2:capCheck"), false);
    assert.deepEqual(flow.paramTypes, ["Int", "String"]);
  });

  it("generateManifest secret-rotation obligation is keyed by the declared governed name", () => {
    const src = `governed floor_2 secure flow chargeCard(x: String) -> String
contract {
  intent { "pay" }
  secrets {
    credential db { provider vault }
    rotation { interval 24h on_rotation_fault halt }
  }
}
{ return x }
`;
    const p = parseProgram(src, "rot.fungi");
    assert.deepEqual((p.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const manifest = generateManifest(src, "rot.fungi", p.flows, undefined, "2026-10-01T00:00:00.000Z", p.ast, src);
    const rotation = (manifest.proofObligations ?? []).filter((o) => o.kind === "secret-rotation");
    assert.ok(rotation.length >= 1, `expected secret-rotation obligation, got ${JSON.stringify(manifest.proofObligations ?? [])}`);
    assert.equal(rotation[0].flowName, "chargeCard");
    assert.equal(rotation.some((o) => String(o.flowName).includes("governed:")), false);
  });

  it("bytecode fast path still refuses governed (execution-lane exclusion, fail-closed)", () => {
    const p = parseProgram(GOV, "gov.fungi");
    assert.equal(compileToBytecode(p.ast, "moveit"), null);
  });
});
