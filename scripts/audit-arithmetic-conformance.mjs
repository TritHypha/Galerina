#!/usr/bin/env node
/**
 * audit-arithmetic-conformance.mjs — PROTOTYPE from R&D (2026-07-19). Owner-directed:
 * "routinely check all maths thoroughly, even if other dev tools do the same thing."
 *
 * ── WHY A REDUNDANT TOOL IS THE RIGHT CALL ────────────────────────────────────────────────────
 * The overlap with wat-decimal-decline / wat-lowering / the parity tests is DELIBERATE. Every
 * false-green found on 2026-07-19 (five of them) was caught by a SECOND, independent instrument —
 * never by the first one being more careful. Arithmetic is where a wrong answer is silent, costly
 * and plausible, so it earns a dedicated adversarial checker even where coverage already exists.
 *
 * ── THE ONE RULE THAT MAKES THIS NON-VACUOUS ──────────────────────────────────────────────────
 * Every case is pinned to a KNOWN ANSWER derived BY HAND from the mathematical definition —
 * never to "whatever the system currently prints", and never to "Stage-A agrees with Stage-B".
 * Two stages agreeing on a WRONG value is reference vacuity: it is exactly the failure shape that
 * made `0.1 + 0.2` look fine, and it passes any parity-only test. A pin the implementation cannot
 * influence is the only thing that catches it.
 *
 * Verdicts: MATCH · DIVERGE · TRAPPED · DECLINED · GATE-BLOCKED · UNPARSEABLE · SKIPPED
 *   SKIPPED and UNPARSEABLE are NEVER counted clean — "unassessed" must not read like "passed".
 *
 * RUN:  node scripts/audit-arithmetic-conformance.mjs [--self-test] [--json] [--update-baseline]
 * EXIT: 0 clean · 1 a NEW off-baseline failure, or a self-test failure
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GALERINA_ROOT || join(HERE, "..");
const DIST = `file:///${join(ROOT, "packages-galerina/galerina-core-compiler/dist/index.js").replace(/\\/g, "/")}`;
const BASELINE = join(ROOT, "packages-galerina/galerina-core-compiler/tests/fixtures/arithmetic-conformance-baseline.json");
const L = await import(DIST);

for (const [n, ok] of [
  ["parseProgram", typeof L.parseProgram === "function"],
  ["checkTypes", typeof L.checkTypes === "function"],
  ["assembleWAT", typeof L.assembleWAT === "function"],
  ["executeFlowSync", typeof L.executeFlowSync === "function"],
]) if (!ok) { console.error(`[arith-conformance] ANCHOR GONE: ${n} — refusing to report clean.`); process.exit(1); }

const I = (value) => ({ __tag: "int", value });
const F = (value) => ({ __tag: "float", value });

/**
 * CASES — `want` is the exact mathematical answer, written by hand.
 * `expect`: "value" (must equal want) · "trap" (must not produce a value) · "refuse" (front-end must block).
 */
const CASES = [
  // ── integer core ────────────────────────────────────────────────────────────────────────────
  { id: "int-add", expect: "value", want: 12, args: [7, 5], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a + b }` },
  { id: "int-sub", expect: "value", want: 2, args: [7, 5], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a - b }` },
  { id: "int-mul", expect: "value", want: 35, args: [7, 5], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a * b }` },
  // 7/2 = 3 by truncation toward zero. A language that rounded would give 4 — the pin discriminates.
  { id: "int-div-trunc", expect: "value", want: 3, args: [7, 2], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a / b }` },
  // -7/2: truncation toward zero gives -3; floor division would give -4. Sign behaviour is a
  // classic silent divergence between runtimes, so it gets its own pin.
  { id: "int-div-neg-trunc", expect: "value", want: -3, args: [-7, 2], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a / b }` },
  { id: "int-mod", expect: "value", want: 1, args: [7, 3], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a % b }` },
  // -7 % 3: C/wasm semantics take the sign of the DIVIDEND => -1 (Python would say 2).
  { id: "int-mod-neg-sign", expect: "value", want: -1, args: [-7, 3], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a % b }` },

  // ── adversarial: must FAIL, not silently produce a number ────────────────────────────────────
  // i32 signed overflow must TRAP (the emitter's fungi_checked_add_i32), never wrap to INT_MIN.
  { id: "int-overflow-traps", expect: "trap", args: [2147483647, 1], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a + b }` },
  { id: "int-div-by-zero-traps", expect: "trap", args: [7, 0], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a / b }` },
  { id: "int-mod-by-zero-traps", expect: "trap", args: [7, 0], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a % b }` },

  // ── comparisons ─────────────────────────────────────────────────────────────────────────────
  { id: "cmp-lt-true", expect: "value", want: 1, args: [3, 5], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Bool\ncontract { effects {} }\n{ return a < b }` },
  { id: "cmp-lt-false", expect: "value", want: 0, args: [5, 3], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Bool\ncontract { effects {} }\n{ return a < b }` },
  { id: "cmp-eq-true", expect: "value", want: 1, args: [3, 3], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Bool\ncontract { effects {} }\n{ return a == b }` },
  { id: "cmp-gte-boundary", expect: "value", want: 1, args: [3, 3], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Bool\ncontract { effects {} }\n{ return a >= b }` },

  // ── float: binary-exact cases (no tolerance needed, so a real divergence cannot hide) ────────
  { id: "float-add-exact", expect: "value", want: 0.75, args: [0.5, 0.25], wrap: F,
    src: `pure flow f(a: Float, b: Float) -> Float\ncontract { effects {} }\n{ return a + b }` },
  { id: "float-mul-exact", expect: "value", want: 0.25, args: [0.5, 0.5], wrap: F,
    src: `pure flow f(a: Float, b: Float) -> Float\ncontract { effects {} }\n{ return a * b }` },
  // 0.1+0.2 in IEEE-754 binary64 is EXACTLY 0.30000000000000004. For Float that is CORRECT
  // behaviour and the pin asserts it; the same value under Decimal would be a defect (below).
  { id: "float-ieee-inexact-is-correct", expect: "value", want: 0.30000000000000004, args: [0.1, 0.2], wrap: F,
    src: `pure flow f(a: Float, b: Float) -> Float\ncontract { effects {} }\n{ return a + b }` },

  // ── Decimal: must FAIL-CLOSED on WASM, never compute in f64 ──────────────────────────────────
  // Decimal exists for EXACT arithmetic. If any of these ever returns a value on Stage-B, the
  // compiler has started doing money in binary floating point. Pinning the refusal is the guard.
  ...["+", "-", "*", "/"].map((op) => ({
    id: `decimal-${op}-must-decline`, expect: "trap", args: [1, 2], wrap: I,
    src: `pure flow f(a: Decimal, b: Decimal) -> Decimal\ncontract { effects {} }\n{ return a ${op} b }`,
  })),
  ...["<", ">", "==", "!="].map((op) => ({
    id: `decimal-cmp-${op}-must-decline`, expect: "trap", args: [1, 2], wrap: I,
    src: `pure flow f(a: Decimal, b: Decimal) -> Bool\ncontract { effects {} }\n{ return a ${op} b }`,
  })),

  // ── Money: the known-live defect. 150/100 is EXACTLY 1.5; i32.div_s truncation gives 1. ──────
  // This case is expected-failing today and is BASELINED. It is also this suite's proof of
  // non-vacuity: a checker that cannot show a real defect has not been shown to work at all.
  { id: "money-ratio-must-not-truncate", expect: "value", want: 1.5, args: [150, 100], wrap: I,
    src: `pure flow f(revenue: Money<GBP>, cost: Money<GBP>) -> Decimal\ncontract { effects {} }\n{ return revenue / cost }` },
  // Adding two different currencies must be refused by the front end, not silently summed.
  { id: "money-currency-mismatch-refused", expect: "refuse",
    src: `pure flow f(a: Money<GBP>, b: Money<USD>) -> Money<GBP>\ncontract { effects {} }\n{ return a + b }` },

  // ── 64-bit: values beyond 2^53 prove real i64, not a JS double in disguise ────────────────────
  { id: "i64-add-beyond-2p53", expect: "value", want: 9007199254740995n, args: [9007199254740993n, 2n], wrap: I,
    src: `pure flow f(a: Int64, b: Int64) -> Int64\ncontract { effects {} }\n{ return a + b }` },
  { id: "i64-div-trunc", expect: "value", want: 3n, args: [7n, 2n], wrap: I,
    src: `pure flow f(a: Int64, b: Int64) -> Int64\ncontract { effects {} }\n{ return a / b }` },
  { id: "i64-div-neg-trunc", expect: "value", want: -3n, args: [-7n, 2n], wrap: I,
    src: `pure flow f(a: Int64, b: Int64) -> Int64\ncontract { effects {} }\n{ return a / b }` },

  // ── UNSIGNED 64-bit — the highest-risk family, and it is CORRECT. Pin it so it stays that way.
  // 2^64-1 divided by 2 is 2^63-1. A SIGNED lowering reads 2^64-1 as -1 and yields 0 — the exact
  // analogue of the Money i32.div_s truncation. Verified: the emitter uses i64.div_u / gt_u / rem_u.
  { id: "u64-div-high-bit-unsigned", expect: "value", want: 9223372036854775807n, args: [18446744073709551615n, 2n], wrap: I,
    src: `pure flow f(a: UInt64, b: UInt64) -> UInt64\ncontract { effects {} }\n{ return a / b }` },
  { id: "u64-cmp-high-bit-unsigned", expect: "value", want: 1, args: [18446744073709551615n, 1n], wrap: I,
    src: `pure flow f(a: UInt64, b: UInt64) -> Bool\ncontract { effects {} }\n{ return a > b }` },
  { id: "u64-mod-high-bit-unsigned", expect: "value", want: 5n, args: [18446744073709551615n, 10n], wrap: I,
    src: `pure flow f(a: UInt64, b: UInt64) -> UInt64\ncontract { effects {} }\n{ return a % b }` },

  // ── 32-bit float: KNOWN-BROKEN today (emitter routes Float32 through the INTEGER path:
  // `(param f32) (param f32) (result i32)` + fungi_checked_add_i32 => invalid module).
  // f32(0.1)+f32(0.2) rounded to f32 is 0.30000001192092896 — deliberately DIFFERENT from the
  // f64 answer, so this pin also proves the arithmetic is really being done at 32-bit width.
  { id: "f32-add-must-be-32bit", expect: "value", want: Math.fround(Math.fround(0.1) + Math.fround(0.2)), args: [0.1, 0.2], wrap: F,
    src: `pure flow f(a: Float32, b: Float32) -> Float32\ncontract { effects {} }\n{ return a + b }` },
  { id: "f32-add-exact-halves", expect: "value", want: 0.75, args: [0.5, 0.25], wrap: F,
    src: `pure flow f(a: Float32, b: Float32) -> Float32\ncontract { effects {} }\n{ return a + b }` },
  { id: "f16-add-exact-halves", expect: "value", want: 0.75, args: [0.5, 0.25], wrap: F,
    src: `pure flow f(a: Float16, b: Float16) -> Float16\ncontract { effects {} }\n{ return a + b }` },

  // ── narrow integers: in-range arithmetic works today ─────────────────────────────────────────
  { id: "int8-add-in-range", expect: "value", want: 120, args: [100, 20], wrap: I,
    src: `pure flow f(a: Int8, b: Int8) -> Int8\ncontract { effects {} }\n{ return a + b }` },
  { id: "byte-add-in-range", expect: "value", want: 250, args: [200, 50], wrap: I,
    src: `pure flow f(a: Byte, b: Byte) -> Byte\ncontract { effects {} }\n{ return a + b }` },

  // ── UNRULED: recorded, NOT judged. Int8/Int16 lower to i32 with no narrowing and no range
  // check, so 127+1 yields 128 — outside Int8's range, with no trap and no diagnostic. Whether
  // that is a defect depends on whether Galerina SPECIFIES Int8 as narrowing or as promote-to-Int.
  // I found no documented rule, so this suite records the behaviour and asks for a ruling rather
  // than inventing a pin. Note it is inconsistent with `Int`, which DOES trap on overflow.
  { id: "int8-overflow-127-plus-1", expect: "unruled", args: [127, 1], wrap: I, note: "Int8 range is -128..127",
    src: `pure flow f(a: Int8, b: Int8) -> Int8\ncontract { effects {} }\n{ return a + b }` },
  { id: "int16-overflow-32767-plus-1", expect: "unruled", args: [32767, 1], wrap: I, note: "Int16 range is -32768..32767",
    src: `pure flow f(a: Int16, b: Int16) -> Int16\ncontract { effects {} }\n{ return a + b }` },
  { id: "byte-overflow-255-plus-1", expect: "unruled", args: [255, 1], wrap: I, note: "Byte range is 0..255",
    src: `pure flow f(a: Byte, b: Byte) -> Byte\ncontract { effects {} }\n{ return a + b }` },
];

async function runStageB(c) {
  const p = L.parseProgram(c.src, `${c.id}.fungi`, { requireVersionHeader: false });
  if (p.diagnostics.some((d) => d.severity === "error")) return { k: "GATE-BLOCKED", why: "parse" };
  const fx = L.checkEffects(p.flows, p.ast);
  const gate = [
    ...L.checkTypes(p.ast).diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
    ...L.verifyGovernance(p.ast, p.flows, fx, "production", `${c.id}.fungi`).diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
  ];
  if (gate.length) return { k: "GATE-BLOCKED", why: [...new Set(gate)].join(",") };
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "a", p.ast, true));
  const b = await L.assembleWAT(wat);
  // #141: reject the unfaithful STUB (valid:true PLUS a "NOT a faithful compile" diagnostic, #163) — a
  // wabt-rejected module comes back as the minimal-encoder stub; counting it as conforming is fail-open.
  if (b && typeof b === "object" && !(b instanceof Uint8Array) && (!b.valid || (b.diagnostics?.length ?? 0) > 0)) {
    return { k: "INVALID-MODULE", why: "unfaithful assembly: " + (b.diagnostics?.[0]?.message ?? "invalid").slice(0, 80) };
  }
  const u8 = b instanceof Uint8Array ? b : new Uint8Array(b?.bytes || b?.wasm || b);
  // `assembleWAT` returns an 8-byte EMPTY module for WAT it cannot parse, and that module
  // "validates". `<= 8`, never `< 8`.
  if (!u8 || u8.length <= 8) return { k: "UNPARSEABLE", why: `${u8?.length ?? 0}-byte empty module` };
  if (!WebAssembly.validate(u8)) return { k: "INVALID-MODULE" };
  let inst;
  try { inst = new WebAssembly.Instance(new WebAssembly.Module(u8), {}); }
  catch (e) { return { k: "TRAPPED", why: "instantiate: " + String(e.message).slice(0, 60) }; }
  const fn = Object.entries(inst.exports).find(([, v]) => typeof v === "function");
  if (!fn) return { k: "SKIPPED", why: "no exported function" };
  try { return { k: "VALUE", value: fn[1](...(c.args ?? [])) }; }
  catch { return { k: "TRAPPED", why: "runtime trap" }; }
}

function runStageA(c) {
  try {
    const p = L.parseProgram(c.src, `${c.id}.fungi`, { requireVersionHeader: false });
    if (p.diagnostics.some((d) => d.severity === "error")) return { k: "GATE-BLOCKED" };
    // .match, NOT .matchAll: matchAll on a NON-GLOBAL regex THROWS — which silently no-op'd this whole
    // Stage-A cross-check (runStageA always fell to `catch`→TRAPPED, so value cases passed on Stage-B==want
    // alone; the "[Stage-B only]" note printed but nothing enforced Stage-A). First `(...)` = the flow params.
    const names = (c.src.match(/\(([^)]*)\)/)?.[1] ?? "").split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);
    const m = new Map();
    (c.args ?? []).forEach((v, i) => { if (names[i]) m.set(names[i], (c.wrap ?? I)(v)); });
    const r = L.executeFlowSync("f", m, p.ast, p.flows);
    if (r === null || r === undefined) return { k: "DECLINED" };
    // the interpreter fail-closes with a runtimeError SENTINEL (IntegerOverflow / DivisionByZero / …) — that
    // is a TRAP, not a value; decode it before comparing (else it string-compares as a false DIVERGE).
    if (r && typeof r === "object" && r.__tag === "runtimeError") return { k: "TRAPPED" };
    const v = typeof r === "object" && r !== null && "value" in r ? r.value : r;
    return { k: "VALUE", value: v }; // keep BigInt EXACT — the old Number(bigint) was lossy for the i64/u64 pins
  } catch { return { k: "TRAPPED" }; }
}

function judge(c, b, a) {
  const norm = (v) => (typeof v === "boolean" ? (v ? 1 : 0) : v);
  // BigInt-safe: 3n and 3 must compare equal, and 2^64-1 must not go through Number().
  const same = (x, y) => String(norm(x)) === String(norm(y));
  // A case with no declared rule to conform to. Recorded, never scored — inventing a pin for
  // behaviour nobody has specified would be fabricating a spec, which is worse than a gap.
  if (c.expect === "unruled") {
    const observed = b.k === "VALUE" ? `returned ${b.value}` : b.k;
    return { ok: true, unruled: true, verdict: "UNRULED", detail: `${observed} — ${c.note ?? ""} (needs a semantics ruling)` };
  }
  if (c.expect === "refuse") {
    return b.k === "GATE-BLOCKED"
      ? { ok: true, verdict: "REFUSED", detail: b.why ?? "" }
      : { ok: false, verdict: "NOT-REFUSED", detail: `expected the front end to refuse; got ${b.k} ${b.value ?? ""}` };
  }
  if (c.expect === "trap") {
    if (b.k === "TRAPPED" || b.k === "INVALID-MODULE" || b.k === "GATE-BLOCKED") return { ok: true, verdict: "DECLINED", detail: b.k };
    if (b.k === "VALUE") return { ok: false, verdict: "COMPUTED-A-VALUE", detail: `expected fail-closed; got ${b.value}` };
    return { ok: false, verdict: b.k, detail: b.why ?? "unassessed — NOT clean" };
  }
  if (b.k !== "VALUE") return { ok: false, verdict: b.k, detail: b.why ?? "no value produced" };
  const got = norm(b.value);
  if (!same(got, c.want)) return { ok: false, verdict: "DIVERGE", detail: `Stage-B gave ${got}, exact answer is ${c.want}` };
  if (a.k === "VALUE" && !same(a.value, c.want)) {
    return { ok: false, verdict: "STAGE-A-DIVERGE", detail: `Stage-B correct but Stage-A gave ${norm(a.value)}` };
  }
  // Be explicit when only ONE runtime was actually exercised — a cross-check that silently
  // didn't run is not a cross-check, and must not read like one.
  const crossed = a.k === "VALUE" ? "" : "  [Stage-B only — Stage-A produced no value]";
  return { ok: true, verdict: "MATCH", detail: `${got}${crossed}` };
}

async function runAll(cases) {
  const out = [];
  for (const c of cases) {
    const b = await runStageB(c);
    const a = c.expect === "value" ? runStageA(c) : { k: "n/a" };
    out.push([c, judge(c, b, a)]);
  }
  return out;
}

// ── self-test: the checker must FIRE on a fabricated wrong pin, and stay quiet on a true one ──
if (process.argv.includes("--self-test")) {
  const truePin = { id: "st-true", expect: "value", want: 12, args: [7, 5], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a + b }` };
  const falsePin = { ...truePin, id: "st-false", want: 13 };  // 7+5 is not 13
  const trapPin = { id: "st-trap", expect: "trap", args: [7, 5], wrap: I,
    src: `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a + b }` }; // does NOT trap
  const [[, t], [, f], [, tp]] = await runAll([truePin, falsePin, trapPin]);
  const checks = [
    ["a TRUE pin passes (the harness can execute at all)", t.ok && t.verdict === "MATCH"],
    ["a FALSE pin is caught (the checker discriminates)", !f.ok && f.verdict === "DIVERGE"],
    ["a wrong fail-closed expectation is caught", !tp.ok && tp.verdict === "COMPUTED-A-VALUE"],
    // ★ the Stage-A cross-check must be LIVE — the true pin has to exercise BOTH stages, not fall to the
    // "[Stage-B only]" note. This is the guard against the matchAll(non-global-regex) silent-skip regressing.
    ["★ Stage-A cross-check is LIVE for an i32 pin (NOT 'Stage-B only' — guards the matchAll silent-skip)",
      t.verdict === "MATCH" && !/Stage-B only/.test(t.detail ?? "")],
  ];
  let ok = true;
  for (const [n, pass] of checks) { console.log(`  ${pass ? "PASS" : "FAIL"}  ${n}`); if (!pass) ok = false; }
  console.log(ok ? `self-test ${checks.length}/${checks.length}` : "SELF-TEST FAILED — this suite proves nothing");
  process.exit(ok ? 0 : 1);
}

const results = await runAll(CASES);
const failures = results.filter(([, r]) => !r.ok).map(([c]) => c.id);
const unruled = results.filter(([, r]) => r.unruled);
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { known_failing: [] };
const known = new Set(baseline.known_failing ?? []);
const fresh = failures.filter((id) => !known.has(id));
const fixed = [...known].filter((id) => !failures.includes(id));

if (process.argv.includes("--update-baseline")) {
  writeFileSync(BASELINE, JSON.stringify({ known_failing: failures.sort() }, null, 2) + "\n");
  console.log(`baseline updated: ${failures.length} known-failing`);
  process.exit(0);
}
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ results: results.map(([c, r]) => ({ id: c.id, ...r })), fresh, fixed }, null, 2));
} else {
  console.log(`audit-arithmetic-conformance — ${results.length} pinned case(s)\n`);
  for (const [c, r] of results) {
    const mark = r.ok ? "ok  " : known.has(c.id) ? "base" : "FAIL";
    console.log(`  ${mark} ${c.id.padEnd(34)} ${r.verdict.padEnd(18)} ${r.detail}`);
  }
  const scored = results.filter(([, r]) => !r.unruled);
  console.log(`\n${scored.filter(([, r]) => r.ok).length}/${scored.length} conform · ${known.size} baselined · ${unruled.length} UNRULED (recorded, not scored)`);
  if (unruled.length) {
    console.log("  UNRULED — behaviour observed, but no declared rule to conform to. Needs an owner/main ruling:");
    for (const [c, r] of unruled) console.log(`    ? ${c.id.padEnd(32)} ${r.detail}`);
  }
  if (fixed.length) console.log(`  ${fixed.length} baselined case(s) now pass — shrink the baseline: --update-baseline`);
}
if (fresh.length) {
  console.error(`\nVIOLATIONS: ${fresh.length} NEW arithmetic failure(s) — ${fresh.join(", ")}`);
  process.exit(1);
}
console.log(`\nVIOLATIONS: 0`);
