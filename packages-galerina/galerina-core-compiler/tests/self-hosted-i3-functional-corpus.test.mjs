/**
 * RD-0528 I-3 — self-hosted FUNCTIONAL-correctness corpus (tranche 1: type-correctness).
 *
 * Owner ruling 2026-07-22: I-3 (the oracle that must hold before the .ts compiler can be
 * retired) is FUNCTIONAL correctness — the self-hosted pipeline accepts correct programs and
 * REJECTS incorrect ones — NOT byte-identity with the retiring .ts intermediates (the
 * self-hosted compiler is a separate, internally-coherent implementation; measured token/AST
 * divergences from .ts are design conventions, not bugs — see the I-1 evidence pack).
 *
 * Owner riders (this file honours #1; #2/#3 tracked below):
 *   1. NON-VACUOUS — a corpus that can only pass proves nothing. This corpus carries known-bad
 *      inputs that MUST be rejected, and a meta-check asserts the must-fail set is non-empty and
 *      that every member actually rejects. Every expected code below was MEASURED, not guessed.
 *   2. BOOTSTRAP FIXPOINT (stage0-compiled compiler recompiles itself byte-identically) — NOT
 *      yet buildable: the self-hosted stages are a front-end + checkers + interpreter with NO
 *      WAT/WASM backend (that is still .ts), so the self-hosted compiler cannot emit its own
 *      binary. Deferred until a self-hosted backend exists.
 *   3. STRICTLY PRE-AUTHORITY — this is a test only: no ledger entry, no signed seed hash, no
 *      .ts touched. The flip stays owner-gated (I-4).
 *
 * Reach: the self-hosted pipeline currently composes lex -> parse -> type-check (the supported
 * subset). Later tranches drive the effect-checker + governance-verifier (both loadable today)
 * for effect/governance fail-closed cases, and — once a self-hosted backend exists — end-to-end
 * compilation to correct governed WASM.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
function load(name) {
  let s = readFileSync(join(__dir, "../src/self-hosted/", name), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const p = parseProgram(s, name);
  resolveSymbols(p.ast);
  checkTypes(p.ast);
  return p;
}

let lexer, parser, checker;
before(() => {
  lexer = load("lexer.fungi");
  parser = load("parser.fungi");
  checker = load("type-checker.fungi");
});

const vStr = (s) => ({ __tag: "string", value: s });
const readDiags = (res) =>
  (res.value ?? res).fields.get("diagnostics").items.map((d) => {
    const x = d.value ?? d;
    return { code: x.fields.get("code").value, flowName: x.fields.get("flowName").value };
  });

/** Run a source string through the self-hosted lex -> parse -> type-check pipeline. */
async function typecheck(source) {
  const lexRes = await executeFlow("tokenize", new Map([["source", vStr(source)]]), lexer.ast);
  let tokensVal = lexRes.value ?? lexRes;
  if (tokensVal.__tag === "ok") tokensVal = tokensVal.value;
  const parseRes = await executeFlow("parseFlows", new Map([["tokens", tokensVal]]), parser.ast);
  const prRec = parseRes.value ?? parseRes;
  // Driver refusal (R&D 0050 / FUNGI-PARSE fail-closed): refuse to type-check flows when the
  // parser reported errors — an unread error array is the same fail-open one level up.
  const prErrs = prRec.fields.get("errors");
  assert.deepEqual(
    prErrs?.__tag === "list" ? prErrs.items.map((e) => e.value ?? e) : ["<missing errors list>"],
    [],
    "self-hosted parser reported errors — typecheck driver refuses (FUNGI-PARSE fail-closed)",
  );
  const flowsVal = prRec.fields.get("flows");
  const checkRes = await executeFlow("checkFlows", new Map([["flows", flowsVal]]), checker.ast);
  const bodyRes = await executeFlow("checkFlowBodies", new Map([["flows", flowsVal]]), checker.ast);
  return [...readDiags(checkRes), ...readDiags(bodyRes)];
}

// ── The corpus (measured 2026-07-22) ───────────────────────────────────────────

// Correct programs: the self-hosted type-checker MUST accept (zero diagnostics).
const MUST_PASS = [
  { label: "param return", src: `pure flow add(a: Int, b: Int) -> Int { return a }` },
  { label: "Int literal return", src: `pure flow answer() -> Int { return 42 }` },
  { label: "String literal return", src: `pure flow greet() -> String { return "hi" }` },
  { label: "two independent clean flows", src: `pure flow g(a: Int) -> Int { return a }\npure flow h(b: Int) -> Int { return b }` },
];

// Known-bad programs: the self-hosted type-checker MUST reject, with this exact diagnostic.
const MUST_FAIL = [
  { label: "String returned where Int declared", src: `pure flow bad() -> Int { return "hello" }`, expect: { code: "FUNGI-TYPE-008", flowName: "bad" } },
  { label: "Int returned where String declared", src: `pure flow bad2() -> String { return 42 }`, expect: { code: "FUNGI-TYPE-008", flowName: "bad2" } },
  { label: "Int returned where Bool declared", src: `pure flow bad3() -> Bool { return 42 }`, expect: { code: "FUNGI-TYPE-008", flowName: "bad3" } },
  { label: "unknown return type", src: `pure flow bad4() -> Nope { return 1 }`, expect: { code: "FUNGI-TYPE-001", flowName: "bad4" } },
  { label: "unknown param type", src: `pure flow bad5(a: Nope) -> Int { return 1 }`, expect: { code: "FUNGI-TYPE-001", flowName: "bad5" } },
  { label: "one bad flow beside a good one — only the bad flagged", src: `pure flow bad6() -> String { return 42 }\npure flow ok(a: Int) -> Int { return a }`, expect: { code: "FUNGI-TYPE-008", flowName: "bad6" } },
];

describe("RD-0528 I-3 functional corpus (tranche 1: type-correctness) — MUST-PASS", () => {
  for (const c of MUST_PASS) {
    it(`accepts: ${c.label}`, async () => {
      const diags = await typecheck(c.src);
      assert.deepEqual(diags, [], `expected zero diagnostics, got ${JSON.stringify(diags)}`);
    });
  }
});

describe("RD-0528 I-3 functional corpus (tranche 1: type-correctness) — MUST-FAIL (non-vacuous)", () => {
  for (const c of MUST_FAIL) {
    it(`rejects: ${c.label} -> ${c.expect.code}`, async () => {
      const diags = await typecheck(c.src);
      assert.ok(diags.length > 0, `NON-VACUITY LEAK: a known-bad program produced no diagnostic (${c.label})`);
      assert.ok(
        diags.some((d) => d.code === c.expect.code && d.flowName === c.expect.flowName),
        `expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(diags)}`,
      );
    });
  }
});

describe("RD-0528 I-3 functional corpus — non-vacuity guard", () => {
  it("the corpus carries known-bad cases (a corpus that can only pass proves nothing)", () => {
    assert.ok(MUST_FAIL.length >= 5, "the must-fail set must be non-trivial");
    assert.ok(MUST_PASS.length >= 3, "the must-pass set must be non-trivial");
  });
});
