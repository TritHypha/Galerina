// 0017 — first-class fault handlers (on_*_fault). The `on_<signal>_fault <action>` lines inside
// resilience {} get typed, fail-closed semantics: every fault class resolves to a handler (declared or
// the secure `halt` default), the matrix is surfaced on GIRFlow.faultHandlers for 0016's generator, and
// fail-open / monotonicity-violating declarations are rejected (SPORE-FAULT-003 / SPORE-FAULT-001).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram, checkEffects, verifyGovernance, emitGIR } from "../dist/index.js";

function pipeline(source) {
  const parsed = parseProgram(source, "test.spore");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return { parsed, effects };
}
function gov(source, profile = "dev") {
  const { parsed, effects } = pipeline(source);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}
function girFlow(source) {
  const { parsed, effects } = pipeline(source);
  return emitGIR(parsed.ast, parsed.flows, effects).gir.flows[0];
}
const has = (g, code) => g.diagnostics.some((d) => d.code === code);
const codes = (g) => g.diagnostics.map((d) => d.code).join(", ");

const withResilience = (body) => `flow fetchOrder(id: String) -> Result<String, String>
contract {
  intent { "Fetch an order with declared fault handling." }
  effects { network.outbound }
  resilience {
${body}
  }
}
{
  let r = OrdersDB.read(id)?
  return Ok(r)
}`;

const noResilience = `flow plainFetch(id: String) -> Result<String, String>
contract {
  intent { "Fetch with no resilience block." }
  effects { network.outbound }
}
{
  let r = OrdersDB.read(id)?
  return Ok(r)
}`;

describe("0017: fault-handler matrix surfaces on GIRFlow.faultHandlers", () => {
  it("a declared handler surfaces the FULL 4-class matrix (declared + inferred-default halt)", () => {
    const f = girFlow(withResilience("    on_timeout_fault quarantine"));
    assert.ok(Array.isArray(f.faultHandlers), "faultHandlers present when a handler is declared");
    assert.equal(f.faultHandlers.length, 4, "all four fault classes materialised");
    const bySignal = Object.fromEntries(f.faultHandlers.map((h) => [h.signal, h]));
    assert.deepEqual(bySignal.on_timeout_fault, { signal: "on_timeout_fault", action: "quarantine", source: "declared" });
    // the three undeclared classes fall back to the fail-closed secure default
    for (const s of ["on_rotation_fault", "on_denial_fault", "on_substrate_fault"]) {
      assert.equal(bySignal[s].action, "halt", `${s} → secure default halt`);
      assert.equal(bySignal[s].source, "inferred-default", `${s} → inferred-default`);
    }
  });

  it("fallback <flow> carries the target flow name", () => {
    const f = girFlow(withResilience("    on_substrate_fault fallback degraded_read_flow"));
    const h = f.faultHandlers.find((x) => x.signal === "on_substrate_fault");
    assert.equal(h.action, "fallback");
    assert.equal(h.target, "degraded_read_flow");
    assert.equal(h.source, "declared");
  });

  it("a flow with NO declared handler omits faultHandlers (keeps canonical GIR/hash unchanged)", () => {
    const f = girFlow(noResilience);
    assert.equal(f.faultHandlers, undefined, "no faultHandlers surface for a purely-default flow");
  });
});

describe("0017: fail-closed default + monotonicity diagnostics", () => {
  it("undeclared faults never fail open — secure default is halt (no diagnostic, clean)", () => {
    const g = gov(withResilience("    on_timeout_fault halt"));
    assert.ok(!has(g, "SPORE-FAULT-003"), codes(g));
    assert.ok(!has(g, "SPORE-FAULT-001"), codes(g));
  });

  it("SPORE-FAULT-003: a fail-OPEN `log` outside on_rotation_fault is rejected", () => {
    const g = gov(withResilience("    on_timeout_fault log"));
    assert.ok(has(g, "SPORE-FAULT-003"), codes(g));
  });

  it("`log` IS allowed on on_rotation_fault (back-compat opt-in) — no SPORE-FAULT-003", () => {
    const g = gov(withResilience("    on_rotation_fault log"));
    assert.ok(!has(g, "SPORE-FAULT-003"), codes(g));
    // and the matrix records it as the declared log action (the one fail-open exception)
    const f = girFlow(withResilience("    on_rotation_fault log"));
    assert.equal(f.faultHandlers.find((h) => h.signal === "on_rotation_fault").action, "log");
  });

  it("SPORE-FAULT-001: on_denial_fault retry is rejected (deny-only monotonicity)", () => {
    const g = gov(withResilience("    on_denial_fault retry"));
    assert.ok(has(g, "SPORE-FAULT-001"), codes(g));
  });

  it("a disallowed/fail-open action is COERCED to halt in the matrix (fail-closed by construction)", () => {
    const f = girFlow(withResilience("    on_timeout_fault log"));
    // even though SPORE-FAULT-003 fires, the materialised handler is the safe halt, never log
    assert.equal(f.faultHandlers.find((h) => h.signal === "on_timeout_fault").action, "halt");
  });
});
