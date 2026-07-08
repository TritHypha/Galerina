// =============================================================================
// W5a K3 verdict operators — machine-checked truth tables on BOTH tiers
// (2026-07-08 syntax update; owner: "check maths", zero-trust).
//
// Lattice (Q2 LOCKED): DENY(-1) < UNKNOWN(0) < ALLOW(+1).
//   and/&&  = lattice min      or/||  = lattice max      flip = negation
// Empty folds: all{} ⇒ UNKNOWN(0) — the SPEC override of min's vacuous-ALLOW
// identity; any{} ⇒ DENY(-1) — max's true mathematical identity AND the
// stricter zero-trust choice (documented deviation from uniform-UNKNOWN).
//
// Every cell of every table is executed on BOTH tiers — the tree-walker and
// the REAL WASM pipeline (GIR → WAT → assemble → sign → admit → instantiate) —
// and must agree. A single divergent cell is a fail-open moved to the other
// tier (the #55 parity discipline).
//
// A9 (FUNGI-K3-001/002/003): mixed Verdict/Bool operands, flip-on-Bool,
// !-on-Verdict, and non-Verdict fold operands are COMPILE errors.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const TRITS = [-1, 0, 1];
const NAME = { "-1": "Deny", "0": "Unknown", "1": "Allow" };
const V = (t) => `Verdict.${NAME[String(t)]}`;

const FLOW = (expr, ret = "Verdict") =>
  `pure flow f() -> ${ret}\ncontract { effects {} }\n{ return ${expr} }`;

async function walkerRun(src) {
  const p = L.parseProgram(src, "k3.fungi");
  assert.equal(p.diagnostics.filter((d) => d.severity === "error").length, 0, "parse clean");
  try { L.resolveSymbols(p.ast); L.checkTypes(p.ast); } catch { /* checker throws are surfaced by tests below */ }
  const r = await L.executeFlow("f", new Map(), p.ast);
  return r?.value;
}

async function wasmRun(src) {
  const p = L.parseProgram(src, "k3.fungi");
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "p", p.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid, `assembles: ${JSON.stringify(asm.diagnostics).slice(0, 300)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime(),
  });
  return Number(instance.exports["f"]());
}

async function bothTiers(expr) {
  const src = FLOW(expr);
  const w = await walkerRun(src);
  assert.equal(w?.__tag, "verdict", `walker verdict tag for: ${expr} (got ${w?.__tag})`);
  const g = await wasmRun(src);
  assert.equal(g, w.value, `TIER DIVERGENCE on '${expr}': walker=${w.value} wasm=${g}`);
  return w.value;
}

describe("K3 truth tables — every cell, both tiers (maths machine-checked)", () => {
  it("and/&& = lattice min over all 9 cells", async () => {
    for (const a of TRITS) for (const b of TRITS) {
      const got = await bothTiers(`${V(a)} && ${V(b)}`);
      assert.equal(got, Math.min(a, b), `min(${a},${b})`);
    }
  });

  it("or/|| = lattice max over all 9 cells", async () => {
    for (const a of TRITS) for (const b of TRITS) {
      const got = await bothTiers(`${V(a)} || ${V(b)}`);
      assert.equal(got, Math.max(a, b), `max(${a},${b})`);
    }
  });

  it("the readable spellings `and`/`or` compute the SAME K3 results (desugar identity)", async () => {
    assert.equal(await bothTiers(`${V(-1)} and ${V(1)}`), -1, "Deny and Allow = Deny");
    assert.equal(await bothTiers(`${V(0)} or ${V(-1)}`), 0, "Unknown or Deny = Unknown");
  });

  it("flip = negation: flip(Deny)=Allow, flip(Unknown)=Unknown, flip(Allow)=Deny", async () => {
    for (const a of TRITS) {
      // 0 - a (not -a): JS unary minus mints -0, and strict assert distinguishes 0 from -0
      assert.equal(await bothTiers(`flip(${V(a)})`), 0 - a, `flip(${a})`);
    }
  });

  it("De Morgan holds on all 9 cells: flip(a && b) == flip(a) || flip(b)", async () => {
    for (const a of TRITS) for (const b of TRITS) {
      const lhs = await bothTiers(`flip(${V(a)} && ${V(b)})`);
      const rhs = await bothTiers(`flip(${V(a)}) || flip(${V(b)})`);
      assert.equal(lhs, rhs, `De Morgan at (${a},${b})`);
      assert.equal(lhs, Math.max(0 - a, 0 - b), `= max(-a,-b) at (${a},${b})`); // 0-a avoids JS -0
    }
  });

  it("UNKNOWN never upgrades: Unknown&&Allow=Unknown, Unknown||Deny=Unknown (Maybe is not a grant)", async () => {
    assert.equal(await bothTiers(`${V(0)} && ${V(1)}`), 0);
    assert.equal(await bothTiers(`${V(0)} || ${V(-1)}`), 0);
  });
});

describe("K3 folds — all{}/any{} + the empty-fold identities", () => {
  it("all{ Deny Unknown Allow } = Deny (min-fold); any{ … } = Allow (max-fold)", async () => {
    assert.equal(await bothTiers(`all { ${V(-1)}\n${V(0)}\n${V(1)} }`), -1);
    assert.equal(await bothTiers(`any { ${V(-1)}\n${V(0)}\n${V(1)} }`), 1);
  });

  it("all{ Unknown Allow } = Unknown — a fold over non-denies still cannot mint an ALLOW", async () => {
    assert.equal(await bothTiers(`all { ${V(0)}\n${V(1)} }`), 0);
  });

  it("EMPTY all{} = UNKNOWN(0) — the vacuous-ALLOW min identity is overridden (never a grant)", async () => {
    const got = await bothTiers(`all { }`);
    assert.equal(got, 0);
    assert.notEqual(got, 1, "an empty conjunction must NEVER be ALLOW");
  });

  it("EMPTY any{} = DENY(-1) — max's true identity and the zero-trust choice", async () => {
    assert.equal(await bothTiers(`any { }`), -1);
  });
});

describe("A9 compile gates — FUNGI-K3-001/002/003", () => {
  const k3diags = (src) => {
    const p = L.parseProgram(src, "k3.fungi");
    const res = L.checkTypes(p.ast);
    return (res?.diagnostics ?? []).filter((d) => d.code?.startsWith("FUNGI-K3-"));
  };

  it("mixed Verdict && Bool ⇒ FUNGI-K3-001 ERROR (a coerced UNKNOWN is a fail-open)", () => {
    const d = k3diags(FLOW(`${V(1)} && true`));
    assert.equal(d.length, 1);
    assert.equal(d[0].code, "FUNGI-K3-001");
    assert.equal(d[0].severity, "error");
  });

  it("flip(Bool) ⇒ FUNGI-K3-002; !(Verdict) ⇒ FUNGI-K3-002", () => {
    assert.equal(k3diags(FLOW(`flip(true)`))[0]?.code, "FUNGI-K3-002");
    assert.equal(k3diags(FLOW(`!${V(1)}`, "Bool"))[0]?.code, "FUNGI-K3-002");
  });

  it("a non-Verdict fold operand ⇒ FUNGI-K3-003", () => {
    assert.equal(k3diags(FLOW(`all { ${V(1)}\ntrue }`))[0]?.code, "FUNGI-K3-003");
  });

  it("anti-vacuous: pure-Verdict and pure-Bool forms raise NO K3 diagnostics", () => {
    assert.equal(k3diags(FLOW(`${V(1)} && ${V(0)}`)).length, 0);
    assert.equal(k3diags(FLOW(`true && false`, "Bool")).length, 0);
    assert.equal(k3diags(FLOW(`flip(${V(1)})`)).length, 0);
  });
});

describe("Bool lane regression guard — the K3 overload must not touch classic booleans", () => {
  it("true && false / true || false still compute Bool on both tiers", async () => {
    const w1 = await walkerRun(FLOW(`true && false`, "Bool"));
    assert.equal(w1?.__tag, "bool");
    assert.equal(w1.value, false);
    assert.equal(await wasmRun(FLOW(`true && false`, "Bool")), 0);
    assert.equal(await wasmRun(FLOW(`true || false`, "Bool")), 1);
  });
});
