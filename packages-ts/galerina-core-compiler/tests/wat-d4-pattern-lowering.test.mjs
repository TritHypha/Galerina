/**
 * D4 (Codex GO 2026-10-02, relatedCommit 0d06d6c1) - bounded pure in-Wasm
 * lowering of `s.matchesPattern("<literal>")` for literals admitted by
 * fungi.pattern.capability.v1. Everything else keeps FUNGI-WAT-PATTERN-001.
 *
 * Differential: admitted Wasm == interpreter (executeFlow) == tri-regex
 * verdict, plus hand truth rows so agreement is not vacuous. Limits: the
 * interpreter returns a RegexError value; the Wasm helper traps. Neither
 * yields a Bool.
 * Replay: node --test --test-reporter=tap tests/wat-d4-pattern-lowering.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";
import { admitPatternCapability } from "../dist/pattern-capability.js";
import { planPatternMatchWat, WAT_PATTERN_MAX_SLOTS } from "../dist/wat-emitter-pattern.js";

const CODE = "FUNGI-WAT-PATTERN-001";

const PATTERNS = [
  "^[a-z]+$", "abc", "a+b", "^$", "", "x*", "colou?r", "^(?:ab|cd)+$",
  "[0-9]{3}-[0-9]{4}", "foo$", "^foo", ".", "a.c", "[^a]", "a|b|c",
  "(?:a|b)*c", "a{0,50}b", "a$|^b", "[a-z]{100}", "(?:[a-z]+[0-9]+){20}",
];

const SUBJECTS = [
  "", "a", "b", "c", "abc", "xabcx", "hello", "Hello", "aab", "aaab", "ab", "cdab", "abcd",
  "colour", "color", "colr", "123-4567", "x123-4567y", "12-34567", "foo", "barfoo", "foobar",
  "a\nc", "a\u{1F600}c", "\u{1F600}", "\uD800", "xxx", "bbbc", "abab", "b$", "ba",
  "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0", "a".repeat(50) + "b", "a".repeat(51) + "b",
  "z".repeat(93),
];

function flowName(i) { return `m${i}`; }

function programFor(patterns) {
  return patterns.map((p, i) => `pure flow ${flowName(i)}(s: String) -> Bool
contract { effects {} }
{ return s.matchesPattern(${JSON.stringify(p)}) }
`).join("\n");
}

function buildWat(src, label) {
  const prog = L.parseProgram(src, label);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${JSON.stringify(errs)}`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, label, prog.ast, true));
  return { prog, wat };
}

function tryBuild(src, label) {
  try { return buildWat(src, label); } catch (e) { return { error: String(e && e.message ? e.message : e) }; }
}

async function instantiate(src, label) {
  const { prog, wat } = buildWat(src, label);
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, `WAT did not assemble: ${JSON.stringify(assembled.diagnostics)}`);
  const host = L.createHostRuntime();
  let nextHandle = 0;
  for (const entry of L.getInternedStrings()) {
    host.seedString(entry.handle, entry.value);
    nextHandle = Math.max(nextHandle, entry.handle + 1);
  }
  const keys = L.generateRunnerKeypair();
  const attestation = L.signWasm(assembled.wasm, keys.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keys.publicKeyPem },
    host,
  });
  return { prog, wat, host, instance, nextHandle };
}

function callWasm(ctx, fn, s) {
  const h = ctx.nextHandle++;
  ctx.host.seedString(h, s);
  return ctx.instance.exports[fn](h);
}

async function callInterp(prog, fn, s) {
  try {
    const r = await L.executeFlow(fn, new Map([["s", { __tag: "string", value: s }]]), prog.ast, prog.flows);
    return r?.value;
  } catch (e) {
    return { __tag: "thrown", error: String(e && e.message ? e.message : e) };
  }
}

function oracle(p, s) {
  const a = admitPatternCapability(p);
  assert.equal(a.ok, true, `oracle pattern must admit: ${p}`);
  return a.matcher.test(s).verdict === 1;
}

function helperBodies(wat) {
  return wat.split(/\(func \$/).filter((part) => part.startsWith("fungi_pattern_match_"));
}

describe("D4-T1 admitted literal lowers to a bounded pure in-Wasm helper", () => {
  it("every candidate pattern admits and plans", () => {
    for (const p of PATTERNS) {
      const plan = planPatternMatchWat(JSON.stringify(p));
      assert.equal(plan.ok, true, `${p}: ${plan.ok ? "" : plan.reason}`);
    }
  });
  it("WAT calls the helper; no pattern host callee, no stub, no memory traffic", async () => {
    const { wat } = buildWat(programFor(PATTERNS), "d4t1.fungi");
    assert.equal(wat.includes("$host___matchesPattern"), false);
    assert.equal(wat.includes("C20:"), false);
    assert.equal(wat.includes(CODE), false);
    const bodies = helperBodies(wat);
    assert.equal(bodies.length, PATTERNS.length, "one helper per distinct pattern");
    for (const b of bodies) {
      for (const banned of ["i32.load", "i32.store", "i64.load", "i64.store", "f64.load", "f64.store", "memory.grow", "call_indirect", "__fungi_heap"]) {
        assert.equal(b.includes(banned), false, `helper must not use ${banned}`);
      }
      const callees = [...b.matchAll(/\(call \$([A-Za-z0-9_]+)/g)].map((m) => m[1]);
      for (const c of callees) {
        assert.equal(c === "host___str_length" || c === "host___str_char_at", true, `unexpected callee ${c}`);
      }
    }
    const assembled = await L.assembleWAT(wat);
    assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  });
  it("same pattern in two flows emits one helper; emission is deterministic", () => {
    const src = programFor(["^foo", "^foo"]);
    const a = buildWat(src, "d4t1b.fungi").wat;
    const b = buildWat(src, "d4t1b.fungi").wat;
    assert.equal(a, b);
    assert.equal(helperBodies(a).length, 1);
  });
});

describe("D4-T2 differential: Wasm == interpreter == tri-regex verdict", () => {
  it("all admitted patterns x subjects agree and return Bool", async () => {
    const ctx = await instantiate(programFor(PATTERNS), "d4t2.fungi");
    let rows = 0;
    let trues = 0;
    for (let i = 0; i < PATTERNS.length; i++) {
      const p = PATTERNS[i];
      for (const s of SUBJECTS) {
        const want = oracle(p, s);
        const iv = await callInterp(ctx.prog, flowName(i), s);
        assert.equal(iv?.__tag, "bool", `${p} interpreter ${JSON.stringify(s)} -> ${JSON.stringify(iv)}`);
        assert.equal(iv.value, want, `${p} interpreter ${JSON.stringify(s)}`);
        const wv = callWasm(ctx, flowName(i), s);
        assert.equal(wv === 0 || wv === 1, true, `${p} WASM returned non-Bool ${wv}`);
        assert.equal(wv === 1, want, `${p} WASM ${JSON.stringify(s)}`);
        rows++;
        if (want) trues++;
      }
    }
    assert.equal(rows, PATTERNS.length * SUBJECTS.length);
    assert.ok(trues > 50 && trues < rows - 50, `non-degenerate verdict mix (${trues}/${rows})`);
  });
});

describe("D4-T3 hand truth rows (not vacuous)", () => {
  const ROWS = [
    ["^[a-z]+$", "hello", true], ["^[a-z]+$", "Hello", false], ["^[a-z]+$", "", false],
    ["colou?r", "color", true], ["colou?r", "colour", true], ["colou?r", "colr", false],
    ["a.c", "a\u{1F600}c", true], ["a.c", "a\nc", false],
    ["^$", "", true], ["^$", "a", false], ["", "anything", true], ["", "", true],
    ["foo$", "barfoo", true], ["foo$", "foobar", false], ["^foo", "foobar", true], ["^foo", "barfoo", false],
    ["[0-9]{3}-[0-9]{4}", "x123-4567y", true], ["[0-9]{3}-[0-9]{4}", "12-34567", false],
    ["a$|^b", "ba", true], ["a$|^b", "ab", false], ["[^a]", "aaa", false], ["[^a]", "aab", true],
  ];
  it("Wasm and interpreter give the stated verdicts", async () => {
    const pats = [...new Set(ROWS.map((r) => r[0]))];
    const ctx = await instantiate(programFor(pats), "d4t3.fungi");
    for (const [p, s, want] of ROWS) {
      const fn = flowName(pats.indexOf(p));
      assert.equal(callWasm(ctx, fn, s) === 1, want, `${p} WASM ${JSON.stringify(s)}`);
      const iv = await callInterp(ctx.prog, fn, s);
      assert.equal(iv?.__tag, "bool");
      assert.equal(iv.value, want, `${p} interpreter ${JSON.stringify(s)}`);
    }
  });
});

describe("D4-T4 limits mirror the interpreter; over-limit is fail-closed in both tiers", () => {
  const LIMIT_PATS = ["abc", "[a-z]{100}"];
  async function both(ctx, i, s) {
    const iv = await callInterp(ctx.prog, flowName(i), s);
    let trapped = "";
    let wv;
    try { wv = callWasm(ctx, flowName(i), s); } catch (e) { trapped = String(e && e.message ? e.message : e); }
    return { iv, wv, trapped };
  }
  it("UTF-16 length 4096 runs; 4097 refuses (interpreter non-Bool, Wasm traps)", async () => {
    const ctx = await instantiate(programFor(LIMIT_PATS), "d4t4a.fungi");
    const ok = await both(ctx, 0, "a".repeat(4096));
    assert.equal(ok.iv?.__tag, "bool");
    assert.equal(ok.trapped, "");
    assert.equal(ok.wv, 0);
    const over = await both(ctx, 0, "a".repeat(4097));
    assert.notEqual(over.iv?.__tag, "bool", JSON.stringify(over.iv));
    assert.match(over.trapped, /unreachable/);
  });
  it("astral subjects count UTF-16 units: 2048 emoji run, 2049 refuse", async () => {
    const ctx = await instantiate(programFor(LIMIT_PATS), "d4t4b.fungi");
    const ok = await both(ctx, 0, "\u{1F600}".repeat(2048));
    assert.equal(ok.iv?.__tag, "bool");
    assert.equal(ok.trapped, "");
    const over = await both(ctx, 0, "\u{1F600}".repeat(2049));
    assert.notEqual(over.iv?.__tag, "bool", JSON.stringify(over.iv));
    assert.match(over.trapped, /unreachable/);
  });
  it("certified-work bound: [a-z]{100} admits 93 code points, refuses 94 and 100", async () => {
    const ctx = await instantiate(programFor(LIMIT_PATS), "d4t4c.fungi");
    const ok = await both(ctx, 1, "a".repeat(93));
    assert.equal(ok.iv?.__tag, "bool");
    assert.equal(ok.iv.value, false);
    assert.equal(ok.wv, 0);
    for (const n of [94, 100]) {
      const over = await both(ctx, 1, "a".repeat(n));
      assert.notEqual(over.iv?.__tag, "bool", `${n}: ${JSON.stringify(over.iv)}`);
      assert.match(over.trapped, /unreachable/, `${n}`);
    }
  });
});

describe("D4-T5 refusals stay FUNGI-WAT-PATTERN-001", () => {
  const one = (p) => programFor([p]);
  it("dynamic pattern", () => {
    const r = tryBuild(`pure flow d(s: String, p: String) -> Bool
contract { effects {} }
{ return s.matchesPattern(p) }
`, "d4t5a.fungi");
    assert.match(r.error ?? "", new RegExp(CODE));
    assert.match(r.error, /C20: dynamic matchesPattern refused/);
  });
  it("non-admitted literal: word boundary (TPRX-UNSUPPORTED)", () => {
    // Fungi source text is `"\bword\b"` (single backslashes), as an author writes it.
    const r = tryBuild('pure flow m0(s: String) -> Bool\ncontract { effects {} }\n{ return s.matchesPattern("\\bword\\b") }\n', "d4t5b.fungi");
    assert.match(r.error ?? "", new RegExp(CODE));
    assert.match(r.error, /literal pattern not admitted: TPRX-UNSUPPORTED/);
  });
  it("non-admitted literal: capture group (FUNGI-PATTERN-002)", () => {
    const r = tryBuild(one("(a)"), "d4t5c.fungi");
    assert.match(r.error ?? "", new RegExp(CODE));
    assert.match(r.error, /FUNGI-PATTERN-002/);
  });
  it("admitted literal over the in-Wasm automaton bound", () => {
    const r = tryBuild(one("[a-z]{300}"), "d4t5d.fungi");
    assert.match(r.error ?? "", new RegExp(CODE));
    assert.match(r.error, new RegExp(`300 slots; the in-Wasm bound is ${WAT_PATTERN_MAX_SLOTS}`));
  });
  it("extractGroups and replacePattern unchanged", () => {
    for (const [m, args] of [["extractGroups", `"^(a)$"`], ["replacePattern", `"a", "b"`]]) {
      const r = tryBuild(`pure flow f(s: String) -> String
contract { effects {} }
{ return s.${m}(${args}) }
`, `d4t5${m}.fungi`);
      assert.match(r.error ?? "", new RegExp(CODE));
      assert.match(r.error, new RegExp(`C20: ${m} WAT ABI is not admitted`));
    }
  });
});

describe("D4-T6 tri-regex tables() is a frozen copy", () => {
  it("snapshot is frozen and does not alias the matcher", () => {
    const a = admitPatternCapability("^[a-z]+$");
    assert.equal(a.ok, true);
    const t = a.matcher.tables();
    assert.equal(Object.isFrozen(t), true);
    assert.equal(Object.isFrozen(t.rows), true);
    assert.equal(Object.isFrozen(t.initStart.bits), true);
    assert.throws(() => { "use strict"; t.rows[0][0] = 0; });
    assert.equal(a.matcher.test("hello").verdict, 1);
    assert.equal(a.matcher.test("Hello").verdict, -1);
  });
});

describe("D4-T7 production gate unchanged (C03 method catalog does not admit String.matchesPattern)", () => {
  it("checkProgram refuses with FUNGI-PIPELINE-001 before WAT; D4 does not widen the gate", () => {
    const checked = L.checkProgram(`@version 1
pure flow hasMatch(s: String) -> Bool
contract { intent { "D4 gate tripwire" } effects {} }
{ return s.matchesPattern("^[a-z]+$") }
`, "d4t7.fungi");
    assert.equal(checked.ok, false);
    assert.match(JSON.stringify(checked.diagnostics ?? []), /FUNGI-PIPELINE-001/);
    assert.match(JSON.stringify(checked.diagnostics ?? []), /Unknown method 'matchesPattern' on receiver type 'String'/);
  });
});
