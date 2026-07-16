// rd0361-transport-fsm-execution.test.mjs — RD-0361 (TLSTP tranche): the S4 Recovering-FSM twin
// EXECUTES, and its transition projections are proven EQUAL to the REAL shipped `transportStep`.
//
// Same ladder as every execution twin:
//   R0  transport-fsm.fungi `galerina build`s to a real, signable WASM (4 pure projection flows).
//   R1  that WASM is signed + admitted through the attestation-first #105 gate + instantiated.
//   R3  FAIL-CLOSED DIFFERENTIAL: over the full context × event grid, the WASM projections
//       (nextState / erased / nextHasKeys / nextEnteredAt) EQUAL the decision the REAL
//       transportStep makes. The K3 fold g = allOf(subVerdicts) is computed on the .ts side by
//       the SHIPPED calculus (itself execution-proven — the b8-admission twin) and handed to the
//       twin as folded evidence, mirroring how step() itself consumes decideAtBoundary.
//   LAW pins on the WASM outputs (the RD's invariants, asserted directly):
//       INV-2/INV-6 — from a non-Established state, ONLY reverify g==+1 reaches Established;
//                     a 0 NEVER resumes (fail-closed hold).
//       INV-4       — Closed is absorbing for every event.
//       INV-1 join  — twin nextState==Established ⇔ the real permitData(next) admits payload.
//
// Nothing here is authoritative: the .ts FSM still decides at runtime. R4 flip is owner-gated (#143).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { transportStep, permitData } from "../dist/index.js";
import { allOf } from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "transport-fsm.fungi");

const KEYS = Object.freeze({ chain: "x25519+mlkem" });
const CFG = { timeoutMs: 500 }; // τ

// Context grid — encodings: state 0/1/2 · enteredAt -1 = null · hasKeys 0/1. Includes the
// degenerate Recovering-with-null-clock context (step() guards it; the twin must mirror).
const CONTEXTS = [
  { name: "Established+keys",        ts: { state: "Established", enteredRecoveringAt: null, keys: KEYS }, enc: [0, 1, -1] },
  { name: "Established-nokeys",      ts: { state: "Established", enteredRecoveringAt: null, keys: null }, enc: [0, 0, -1] },
  { name: "Recovering+keys@100",     ts: { state: "Recovering", enteredRecoveringAt: 100, keys: KEYS },  enc: [1, 1, 100] },
  { name: "Recovering-nokeys@100",   ts: { state: "Recovering", enteredRecoveringAt: 100, keys: null },  enc: [1, 0, 100] },
  { name: "Recovering+keys-nullclk", ts: { state: "Recovering", enteredRecoveringAt: null, keys: KEYS }, enc: [1, 1, -1] },
  { name: "Closed",                  ts: { state: "Closed", enteredRecoveringAt: null, keys: null },     enc: [2, 0, -1] },
];

// Event grid — kind 0 fault · 1 reverify · 2 tick · 3 fatal. Reverify carries REAL subVerdict
// arrays folded by the shipped allOf on the .ts side; the twin receives the folded g.
// Ticks probe strictly-before / exactly-at / past the τ boundary for enteredAt=100, τ=500.
const EVENTS = [
  { name: "fault@150",        ts: { kind: "fault", nowMs: 150 },                          enc: { kind: 0, g: 0, nowMs: 150 } },
  { name: "fatal",            ts: { kind: "fatal" },                                       enc: { kind: 3, g: 0, nowMs: 0 } },
  { name: "tick@599(<τ)",     ts: { kind: "tick", nowMs: 599 },                            enc: { kind: 2, g: 0, nowMs: 599 } },
  { name: "tick@600(=τ)",     ts: { kind: "tick", nowMs: 600 },                            enc: { kind: 2, g: 0, nowMs: 600 } },
  { name: "tick@9999(>τ)",    ts: { kind: "tick", nowMs: 9999 },                           enc: { kind: 2, g: 0, nowMs: 9999 } },
  { name: "reverify DENY",    ts: { kind: "reverify", subVerdicts: [1, 1, -1], nowMs: 150 }, enc: { kind: 1, g: -1, nowMs: 150 } },
  { name: "reverify INDET",   ts: { kind: "reverify", subVerdicts: [1, 1, 0], nowMs: 150 },  enc: { kind: 1, g: 0, nowMs: 150 } },
  { name: "reverify ALLOW",   ts: { kind: "reverify", subVerdicts: [1, 1, 1], nowMs: 150 },  enc: { kind: 1, g: 1, nowMs: 150 } },
];

const STATE_NUM = { Established: 0, Recovering: 1, Closed: 2 };

test("RD-0361 TLSTP · S4 FSM: R0 build → R1 #105-admit → R3 WASM projections ≡ real transportStep (+ INV pins)", async () => {
  assert.ok(existsSync(COMPILER), "galerina-core-compiler dist not built — run the full suite before this gate");
  const L = await import(pathToFileURL(COMPILER).href);

  // ── R0 · the twin builds to real WASM ──
  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "transport-fsm.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "transport-fsm", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin assembles to WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + admit (attestation-first #105), then instantiate ──
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  const X = instance.exports;
  for (const f of ["s4NextState", "s4Erased", "s4NextHasKeys", "s4NextEnteredAt"]) {
    assert.equal(typeof X[f], "function", `${f} admitted + exported (R1)`);
  }

  // ── R3 · fail-closed differential over the full grid ──
  let points = 0;
  for (const c of CONTEXTS) {
    for (const ev of EVENTS) {
      const real = transportStep(c.ts, ev.ts, CFG);
      const [st, hk, ea] = c.enc;
      const { kind, g, nowMs } = ev.enc;
      const args = [st, hk, ea, kind, g, nowMs, CFG.timeoutMs];
      const label = `${c.name} × ${ev.name}`;

      // On reverify, the twin's g must be exactly what the shipped fold computes (join honesty).
      // Closed absorbs BEFORE consulting governance (INV-4), so no decision exists there.
      if (ev.ts.kind === "reverify") {
        assert.equal(allOf(ev.ts.subVerdicts), g, `${label}: encoded g must equal the shipped allOf fold`);
        if (c.enc[0] !== 2) {
          assert.equal(real.decision?.verdict, g, `${label}: the real step's audited decision must carry the same fold`);
        } else {
          assert.equal(real.decision, null, `${label}: Closed absorbs without consulting governance`);
        }
      }

      assert.equal(X.s4NextState(...args), STATE_NUM[real.next.state], `${label}: nextState`);
      assert.equal(X.s4Erased(...args), real.erased ? 1 : 0, `${label}: erased`);
      assert.equal(X.s4NextHasKeys(...args), real.next.keys !== null ? 1 : 0, `${label}: nextHasKeys`);
      assert.equal(X.s4NextEnteredAt(...args), real.next.enteredRecoveringAt ?? -1, `${label}: nextEnteredAt`);
      points += 4;

      // INV-1 join: the twin's Established verdict must coincide with the real data chokepoint.
      assert.equal(X.s4NextState(...args) === 0, permitData(real.next), `${label}: INV-1 join (permitData ⇔ Established)`);
    }
  }
  assert.equal(points, CONTEXTS.length * EVENTS.length * 4, `full grid covered (${points} projection points)`);

  // ── LAW pins on the WASM outputs directly ──
  // INV-2 + INV-6: from every non-Established live context, the ONLY event reaching Established
  // is reverify g==+1; a 0 NEVER resumes.
  for (const c of CONTEXTS.filter((x) => x.enc[0] === 1)) {
    for (const ev of EVENTS) {
      const [st, hk, ea] = c.enc;
      const out = X.s4NextState(st, hk, ea, ev.enc.kind, ev.enc.g, ev.enc.nowMs, CFG.timeoutMs);
      if (ev.enc.kind === 1 && ev.enc.g === 1) {
        assert.equal(out, 0, `INV-2: ${c.name} resumes ONLY via reverify(+1)`);
      } else {
        assert.notEqual(out, 0, `INV-2/INV-6: ${c.name} × ${ev.name} must NOT reach Established`);
      }
    }
  }
  // INV-4: Closed is absorbing for every event; keys stay erased.
  for (const ev of EVENTS) {
    assert.equal(X.s4NextState(2, 0, -1, ev.enc.kind, ev.enc.g, ev.enc.nowMs, CFG.timeoutMs), 2, `INV-4: Closed absorbs ${ev.name}`);
    assert.equal(X.s4NextHasKeys(2, 0, -1, ev.enc.kind, ev.enc.g, ev.enc.nowMs, CFG.timeoutMs), 0, `INV-4: keys stay erased under ${ev.name}`);
  }
});
