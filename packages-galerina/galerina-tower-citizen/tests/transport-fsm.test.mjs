// transport-fsm.test.mjs — TLSTP S4 Recovering-FSM conformance (RD galerina-tlstp-s4-recovering-fsm).
// Proves the six safety invariants + the three worked examples + the two charter guards (resume rides
// === ALLOW only; the FSM state is never aliased to the trit). Pure logic over the shipped K3 calculus.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { transportStep as step, permitData, initialTransportContext as initCtx } from "../dist/index.js";

const CFG = { timeoutMs: 5000 }; // τ
const KEYS = Object.freeze({ chain: "x25519+mlkem" });
const established = () => initCtx(KEYS);
const recovering = (enteredAt = 1000) => ({ state: "Recovering", enteredRecoveringAt: enteredAt, keys: KEYS });
const closed = () => ({ state: "Closed", enteredRecoveringAt: null, keys: null });
// events
const fault = (nowMs) => ({ kind: "fault", nowMs });
const reverify = (subVerdicts, nowMs = 2000) => ({ kind: "reverify", subVerdicts, nowMs });
const tick = (nowMs) => ({ kind: "tick", nowMs });
const fatal = () => ({ kind: "fatal" });
const OK4 = [1, 1, 1, 1], IND4 = [1, 1, 1, 0], DENY4 = [1, 1, 1, -1];

describe("S4 — worked examples (RD §3)", () => {
  test("Example A: Established --fault--> Recovering (hold) --reverify(+1)--> Established (RESUME)", () => {
    let ctx = established();
    assert.ok(permitData(ctx), "steady Established permits data");
    ctx = step(ctx, fault(1000), CFG).next;
    assert.equal(ctx.state, "Recovering");
    assert.equal(ctx.keys, KEYS, "keys held during Recovering");
    assert.ok(!permitData(ctx), "INV-1: Recovering DENIES data");
    const r = step(ctx, reverify(OK4, 2200), CFG);
    assert.equal(r.next.state, "Established", "resume on a fresh +1");
    assert.equal(r.next.keys, KEYS, "keys resumed, never erased");
    assert.equal(r.decision.authorized, true);
    assert.ok(permitData(r.next), "data permitted again");
  });

  test("Example B: Recovering --reverify(0)--> stay (no resume, audited) --tick(Δt≥τ)--> Closed/Erase", () => {
    let diags = [];
    let ctx = recovering(0);
    const r0 = step(ctx, reverify(IND4, 2000), CFG, (d) => diags.push(d));
    assert.equal(r0.next.state, "Recovering", "a 0 does NOT resume (INV-6)");
    assert.equal(r0.decision.authorized, false);
    assert.equal(r0.decision.diagnostic?.code, "FUNGI-GOV-3VL-001", "the 0 is audited, not dropped");
    assert.equal(diags.length, 1, "diagnostic forwarded to the sink");
    // timeout
    let erased = null;
    const r1 = step(r0.next, tick(6000), CFG, undefined, (k) => { erased = k; });
    assert.equal(r1.next.state, "Closed", "INV-3: Δt ≥ τ → Closed");
    assert.equal(r1.next.keys, null, "keys zeroized on timeout");
    assert.equal(r1.erased, true);
    assert.equal(erased, KEYS, "erase seam invoked with the live keys");
  });

  test("Example C: Recovering --reverify(-1)--> Closed/Erase (hard deny, no timeout)", () => {
    let erased = null;
    const r = step(recovering(0), reverify(DENY4, 2000), CFG, undefined, (k) => { erased = k; });
    assert.equal(r.next.state, "Closed");
    assert.equal(r.next.keys, null, "keys erased on a -1");
    assert.equal(r.erased, true);
    assert.equal(erased, KEYS);
  });
});

describe("S4 — the six invariants", () => {
  test("INV-1: only Established permits data", () => {
    assert.ok(permitData(established()));
    assert.ok(!permitData(recovering()));
    assert.ok(!permitData(closed()));
  });

  test("INV-2 (exhaustive): a non-Established state reaches Established ONLY via reverify(+1)", () => {
    const states = [recovering(0), closed()];
    const events = [fault(2000), tick(2000), tick(9000), fatal(), reverify(OK4), reverify(IND4), reverify(DENY4)];
    for (const s of states) {
      for (const e of events) {
        const next = step(s, e, CFG).next;
        if (next.state === "Established") {
          assert.equal(e.kind, "reverify", `silent resume from ${s.state} via ${e.kind}`);
          assert.equal(Math.min(...e.subVerdicts), 1, "resume only on an all-ALLOW fold (=== +1)");
        }
      }
    }
  });

  test("INV-3: Recovering times out to Closed once Δt ≥ τ; stays if Δt < τ", () => {
    assert.equal(step(recovering(0), tick(4999), CFG).next.state, "Recovering", "Δt < τ stays");
    assert.equal(step(recovering(0), tick(5000), CFG).next.state, "Closed", "Δt == τ closes");
  });

  test("INV-4: Closed is absorbing and keys stay ∅", () => {
    for (const e of [fault(1), reverify(OK4), reverify(IND4), reverify(DENY4), tick(9e9), fatal()]) {
      const r = step(closed(), e, CFG);
      assert.equal(r.next.state, "Closed", `Closed absorbs ${e.kind}`);
      assert.equal(r.next.keys, null);
      assert.equal(r.erased, false, "nothing to erase in Closed");
    }
  });

  test("INV-5/INV-6 (No-Coercion + fail-closed): resume rides === ALLOW, never !== DENY", () => {
    // A fresh 0 from Established degrades to Recovering (not a resume, not an admit).
    const r = step(established(), reverify(IND4, 3000), CFG);
    assert.equal(r.next.state, "Recovering", "Established + 0 → Recovering (degrade)");
    assert.equal(r.next.enteredRecoveringAt, 3000, "the τ clock starts");
    // A degrade-only side input (a single -1/0 in the fold) can never produce +1 → never resumes.
    for (const sub of [[1, 1, 1, 0], [1, 0, 1, 1], [-1, 1, 1, 1], [0, 0, 0, 0]]) {
      assert.notEqual(step(recovering(0), reverify(sub, 2000), CFG).next.state, "Established",
        `a fold containing ${JSON.stringify(sub)} must not resume`);
    }
  });

  test("fatal from any live state → Closed/Erase", () => {
    for (const s of [established(), recovering(0)]) {
      const r = step(s, fatal(), CFG);
      assert.equal(r.next.state, "Closed");
      assert.equal(r.next.keys, null);
      assert.equal(r.erased, true, "live keys erased on fatal");
    }
  });

  test("charter guard: reverify(0) is NOT read as resume even from Recovering (the !== DENY bug)", () => {
    const r = step(recovering(0), reverify(IND4, 2000), CFG);
    assert.equal(r.next.state, "Recovering", "0 holds — never resumes");
    // and the keys are NOT erased on a 0 (only -1 / timeout / fatal erase)
    assert.equal(r.next.keys, KEYS, "a 0 holds keys (no premature erase)");
    assert.equal(r.erased, false);
  });
});
