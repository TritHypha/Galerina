// =============================================================================
// Anti-hallucination corpus — .fungi (2026-07-08; owner: "apply anti-hallucination
// to .fungi as well" + "i do not trust just one check to be certain of a
// hallucination — multi check phase").
//
// WHAT THIS IS. `.gate`'s "0% hallucination" property is not magic: it is a
// VERIFY-LOOP (author runs the checker, green = valid) over a FAIL-CLOSED
// grammar (unknown ⇒ REJECT, never best-effort). `.fungi` already has the
// same shape — the compiler is a numbered multi-phase pipeline (Phase 4
// lex/parse · Phase 5 effects · Phase 6 types · governance) and every
// "unknown ⇒ reject" gate in it IS an anti-hallucination gate. This file
// makes that guarantee EMPIRICAL: a corpus of things an AI plausibly
// hallucinates, each fed through the REAL phases, asserting it is REJECTED.
//
// WHY MULTI-PHASE (the owner's "don't trust one check"). A single check can be
// wrong two ways: a false negative leaks a hallucination; a false positive
// rejects valid code. So a hallucination must clear EVERY independent phase to
// survive, and the phases fail INDEPENDENTLY (different mechanisms: token /
// shape / vocabulary / type / dataflow). Where a class is high-risk we make
// the redundancy explicit — see H6, caught by BOTH the effect checker (Phase 5)
// and the governance verifier (A20), two different codes for one root cause.
//
// META-CHECK (who checks the checker). A check that silently passes a
// hallucination is itself a fail-open. This corpus is that guard: if a future
// edit defangs a phase, the relevant entry stops being caught and this test
// goes red. The CONTROLS prove the harness is not merely rejecting everything
// (anti-vacuous, A27).
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

// ---- phase probes -----------------------------------------------------------
// Each returns the list of error-severity diagnostic codes that phase raised.
// A THROW is treated as a catch (fail-closed: a phase that refuses to run on a
// malformed input has still rejected it) and recorded as a sentinel code.

function parsePhase(src, opts) {
  try {
    const p = L.parseProgram(src, "hallucination.fungi", opts);
    const codes = (p.diagnostics ?? [])
      .filter((d) => d.severity === "error")
      .map((d) => d.code ?? "PARSE-ERROR");
    return { p, codes };
  } catch (e) {
    return { p: null, codes: ["PARSE-THROW"] };
  }
}

function effectsPhase(p) {
  try {
    const res = L.checkEffects(p.flows, p.ast, "production", true);
    return (res ?? [])
      .flatMap((r) => r.diagnostics ?? [])
      .filter((d) => d.severity === "error")
      .map((d) => d.code ?? "EFFECT-ERROR");
  } catch {
    return ["EFFECTS-THROW"];
  }
}

function typesPhase(p) {
  try { L.resolveSymbols?.(p.ast); } catch { /* symbol errors surface via checkTypes / throw below */ }
  try {
    const r = L.checkTypes(p.ast);
    return (r.diagnostics ?? [])
      .filter((d) => d.severity === "error")
      .map((d) => d.code ?? "TYPE-ERROR");
  } catch {
    return ["TYPES-THROW"];
  }
}

function govPhase(p) {
  try {
    const effects = L.checkEffects(p.flows, p.ast);
    const r = L.verifyGovernance(p.ast, p.flows, effects, "production");
    return (r.diagnostics ?? [])
      .filter((d) => d.severity === "error")
      .map((d) => d.code ?? "GOV-ERROR");
  } catch {
    return ["GOV-THROW"];
  }
}

// Run every phase and return { phase: [codes...] } for phases that caught it.
function runPhases(src, opts) {
  const catchers = {};
  const { p, codes: parseCodes } = parsePhase(src, opts);
  if (parseCodes.length) catchers.parse = parseCodes;
  if (p) {
    const e = effectsPhase(p); if (e.length) catchers.effects = e;
    const t = typesPhase(p); if (t.length) catchers.types = t;
    const g = govPhase(p); if (g.length) catchers.governance = g;
  }
  return catchers;
}

const V = "@version 1\n";

// ---- controls: valid .fungi that MUST pass every phase (anti-vacuous) -------
const CONTROLS = [
  {
    id: "C1-pure-arithmetic",
    src: `${V}pure flow addOne(x: Int) -> Int\ncontract { effects {} }\n{ return x + 1 }`,
  },
  {
    id: "C2-verdict-lattice",
    src: `${V}pure flow decide() -> Verdict\ncontract { effects {} }\n{ return Verdict.Allow && Verdict.Deny }`,
  },
];

// ---- the hallucination corpus ----------------------------------------------
// `expect`: the DESIGNATED phase (and code where pinned). `minCatchers`: the
// number of INDEPENDENT phases required to catch it (>1 = defense-in-depth).
const CORPUS = [
  {
    id: "H1-invented-keyword",
    klass: "token — a construct keyword that does not exist",
    src: `${V}async flow f(x: Int) -> Int\ncontract { effects {} }\n{ return x }`,
    expect: { phase: "parse" },
  },
  {
    id: "H2-invented-governance-block",
    klass: "shape — an unknown governance block inside contract (A23)",
    src: `${V}secure flow store(data: String) -> Void\ncontract {\n  intent { "x" }\n  effects { database.write }\n  wizardry { grant all }\n}\n{ return }`,
    expect: { phase: "parse", code: "FUNGI-SYNTAX-011" },
  },
  {
    id: "H3-absent-version",
    klass: "provenance — no @version header on a disk-read path",
    src: `pure flow addOne(x: Int) -> Int\ncontract { effects {} }\n{ return x + 1 }`,
    opts: { requireVersionHeader: true },
    expect: { phase: "parse", code: "FUNGI-SYNTAX-015" },
  },
  {
    id: "H4-above-current-version",
    klass: "provenance — a version above the current floor",
    src: `@version 2\npure flow addOne(x: Int) -> Int\ncontract { effects {} }\n{ return x + 1 }`,
    opts: { requireVersionHeader: true },
    expect: { phase: "parse", code: "FUNGI-SYNTAX-014" },
  },
  {
    id: "H5-retired-gate-pragma",
    klass: "provenance — the retired #gate marker instead of @version",
    src: `#gate 0.3\npure flow addOne(x: Int) -> Int\ncontract { effects {} }\n{ return x + 1 }`,
    opts: { requireVersionHeader: true },
    expect: { phase: "parse" }, // 014 or 015 depending on how #gate is classed — both reject
  },
  {
    id: "H6-invented-effect-DEFENSE-IN-DEPTH",
    klass: "vocabulary — an invented token used as BOTH an effect and a grant",
    src: `${V}secure flow store(data: String) -> Void\ncontract {\n  intent { "x" }\n  effects { totally.fake.effect }\n  access { grant totally.fake.effect }\n}\n{ return }`,
    // The SAME invented vocabulary item is independently rejected in TWO places:
    // the effect checker rejects it in the effects{} position (Phase 5,
    // FUNGI-EFFECT-004), and the governance verifier rejects it in the
    // access{grant} position (A20 resolves grants against
    // ADMISSION_CAPABILITIES ∪ CANONICAL_EFFECTS, FUNGI-ACCESS-001). The
    // vocabulary is fail-closed at every point it appears, so mis-declaring a
    // hallucinated name in one clause cannot launder its use in another — the
    // owner's "don't trust just one check" made concrete. (A KNOWN alias like
    // db.read would resolve in the grant position, which is exactly why the
    // showcase uses an unambiguously invented token.)
    expect: { phase: "effects", code: "FUNGI-EFFECT-004" },
    alsoExpect: { phase: "governance", code: "FUNGI-ACCESS-001" },
    minCatchers: 2,
  },
  {
    id: "H7-invented-capability-grant",
    klass: "vocabulary — an invented capability in access{grant} (A20)",
    src: `${V}secure flow store(data: String) -> Void\ncontract {\n  intent { "x" }\n  effects { database.write }\n  access { grant totally.fake.capability }\n}\n{ return }`,
    expect: { phase: "governance", code: "FUNGI-ACCESS-001" },
  },
  {
    id: "H8-non-exhaustive-match",
    klass: "shape — a match with no _/ambig arm (RD-0240)",
    src: `${V}pure flow example() -> Void\ncontract { effects {} }\n{\n  let result = compute()\n  match result {\n    Ok(v) => print(v)\n    Err(e) => print(e)\n  }\n}`,
    expect: { phase: "governance", code: "FUNGI-MATCH-001" },
  },
  {
    id: "H9-verdict-bool-mix",
    klass: "type — a K3 Verdict mixed with a Bool (A9, a coerced UNKNOWN is a fail-open)",
    src: `${V}pure flow decide() -> Verdict\ncontract { effects {} }\n{ return Verdict.Allow && true }`,
    expect: { phase: "types", code: "FUNGI-K3-001" },
  },
  {
    id: "H10-flip-on-bool",
    klass: "type — flip() applied to a non-Verdict (A9)",
    src: `${V}pure flow bad() -> Verdict\ncontract { effects {} }\n{ return flip(true) }`,
    expect: { phase: "types", code: "FUNGI-K3-002" },
  },
  {
    id: "H11-invented-type",
    klass: "vocabulary — a type name that does not resolve",
    src: `${V}pure flow bad(x: Frobnicate) -> Int\ncontract { effects {} }\n{ return 0 }`,
    expect: { phase: "types" },
  },
];

// ---- assertions -------------------------------------------------------------

describe("anti-hallucination: controls pass every phase (anti-vacuous, A27)", () => {
  for (const c of CONTROLS) {
    it(`${c.id} — clean through parse/effects/types/governance`, () => {
      const catchers = runPhases(c.src, c.opts);
      assert.deepEqual(
        catchers,
        {},
        `a VALID control must clear every phase; instead caught by: ${JSON.stringify(catchers)}`,
      );
    });
  }
});

describe("anti-hallucination: every corpus entry is caught by >= 1 phase (0% pass-through)", () => {
  for (const h of CORPUS) {
    it(`${h.id} — ${h.klass}`, () => {
      const catchers = runPhases(h.src, h.opts);
      const phasesThatCaught = Object.keys(catchers);
      assert.ok(
        phasesThatCaught.length >= 1,
        `HALLUCINATION SLIPPED THROUGH ALL PHASES — ${h.id} was accepted. catchers=${JSON.stringify(catchers)}`,
      );
    });
  }
});

describe("anti-hallucination: each entry is caught by its designated phase (checker wiring)", () => {
  for (const h of CORPUS) {
    it(`${h.id} — designated ${h.expect.phase}${h.expect.code ? ` / ${h.expect.code}` : ""}`, () => {
      const catchers = runPhases(h.src, h.opts);
      const codes = catchers[h.expect.phase];
      assert.ok(codes, `${h.id}: expected the ${h.expect.phase} phase to reject it; catchers=${JSON.stringify(catchers)}`);
      if (h.expect.code) {
        assert.ok(
          codes.includes(h.expect.code),
          `${h.id}: expected ${h.expect.code} from ${h.expect.phase}; got ${JSON.stringify(codes)}`,
        );
      }
    });
  }
});

describe('anti-hallucination: high-risk classes are caught by >= 2 INDEPENDENT phases ("don\'t trust one check")', () => {
  for (const h of CORPUS.filter((x) => (x.minCatchers ?? 1) >= 2)) {
    it(`${h.id} — defense-in-depth`, () => {
      const catchers = runPhases(h.src, h.opts);
      const n = Object.keys(catchers).length;
      assert.ok(
        n >= h.minCatchers,
        `${h.id}: expected >= ${h.minCatchers} independent phases to catch it; only ${n} did (${JSON.stringify(catchers)})`,
      );
      if (h.alsoExpect) {
        const codes = catchers[h.alsoExpect.phase];
        assert.ok(codes, `${h.id}: expected the redundant ${h.alsoExpect.phase} phase to ALSO reject it`);
        if (h.alsoExpect.code) {
          assert.ok(
            codes.includes(h.alsoExpect.code),
            `${h.id}: redundant phase should raise ${h.alsoExpect.code}; got ${JSON.stringify(codes)}`,
          );
        }
      }
    });
  }
});

describe("anti-hallucination: aggregate guarantee", () => {
  it("no hallucination in the corpus survives the multi-check pipeline", () => {
    const survivors = CORPUS.filter((h) => Object.keys(runPhases(h.src, h.opts)).length === 0);
    assert.deepEqual(
      survivors.map((h) => h.id),
      [],
      `these hallucinations were ACCEPTED (a fail-open): ${survivors.map((h) => h.id).join(", ")}`,
    );
  });
});
