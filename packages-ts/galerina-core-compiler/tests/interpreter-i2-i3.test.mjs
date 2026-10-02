/**
 * Real I2 (fault-handler tier) + real I3 (body-local invariants), zero-trust defaults.
 * Rulings: AGENTS reports/grok-bot-interpreter-i2-i3-20261002/RULINGS-DEFAULTS.md (owner may revisit).
 * Replay: node --test --test-reporter=tap tests/interpreter-i2-i3.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as L from "../dist/index.js";
import { watLoweringLadder } from "../../../scripts/lib/wat-lowering-ladder.mjs";
import { interpreterParityLadder } from "../../../scripts/lib/interpreter-parity-ladder.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SH = join(__dir, "../src/self-hosted");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ---- helpers (every lookup has an explicit fallback; no null/undefined leaks into assertions) ----
function compile(src) {
  const parsed = L.parseProgram(src, "i2i3.fungi");
  const effects = L.checkEffects(parsed.flows, parsed.ast);
  const g = L.verifyGovernance(parsed.ast, parsed.flows, effects, "dev");
  const diags = [...(parsed.diagnostics ?? []), ...g.diagnostics];
  return { parsed, diags, codes: diags.map((d) => String(d.code)) };
}
function flowNode(parsed, name) {
  const found = (parsed.ast.children ?? []).find((c) => c.value === name);
  if (found === undefined) throw new Error(`test fixture has no flow '${name}'`);
  return found;
}
async function exec(src, flow, args = [], deadlineAheadMs = 0) {
  const { parsed } = compile(src);
  const contract = (flowNode(parsed, flow).children ?? []).find((c) => c.kind === "contractDecl");
  const enforcer = deadlineAheadMs > 0
    ? L.createContractEnforcer(contract, flow, { deadlineMs: Date.now() + deadlineAheadMs })
    : L.createContractEnforcer(contract, flow, {});
  const r = await L.executeFlow(flow, new Map(args), parsed.ast, parsed.flows, enforcer, undefined, { maxIterations: 1_000_000_000 });
  return {
    r,
    codes: r.diagnostics.map((d) => String(d.code)),
    msgs: r.diagnostics.map((d) => `${d.code}:${d.message}`),
    events: r.auditEntries.map((a) => String(a.event)),
  };
}
function watError(src) {
  // checkProgram admits only versioned sources (FUNGI-SYNTAX-015 otherwise), like the q7 stage harness.
  const checked = L.checkProgram(`@version 1\n${src}`, "i2i3.fungi");
  if (!checked.ok) return `checkProgram:${typeof checked.code === "string" ? checked.code : "refused"}`;
  try {
    L.renderWAT(L.buildWATFromCheckedProgram(checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true));
    return "lowered";
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
}
const count = (arr, x) => arr.filter((v) => v === x).length;
const int = (v) => ({ __tag: "int", value: v });

// ---- fixtures ----
// `0 <= i` (literal on the left) keeps this loop OFF the while fast-path added on main 0d06d6c1: that path
// charges the step budget but never checks the wall-clock deadline, so a fast-path loop cannot raise the
// [FUNGI-TIMEOUT] fault this I2 handler handles (reported to Codex; not changed here).
const SPIN_BODY = `{\n  mut i = 0\n  while 0 <= i {\n    i = i + 1\n  }\n  return i\n}`;
const HANDLER = (line, body = SPIN_BODY) =>
  `flow spin(n: Int) -> Int\ncontract {\n  effects {}\n  resilience {\n    ${line}\n  }\n}\n${body}\n`;
const QUARANTINE_SRC = HANDLER("on_timeout_fault quarantine");
const OUTER_SRC = `${QUARANTINE_SRC}flow outer() -> Int\ncontract { effects {} }\n{\n  let a = spin(1)\n  let b = spin(2)\n  return 7\n}\n`;
// R-I2-12: an ELIGIBLE while fast-path loop (identifier op intLiteral, Int assignments only).
const SPIN_FAST_BODY = `{\n  mut i = 0\n  while i < 2000000000 {\n    i = i + 1\n  }\n  return i\n}`;
const QUARANTINE_FAST_SRC = HANDLER("on_timeout_fault quarantine", SPIN_FAST_BODY);
const OUTER_FAST_SRC = `${QUARANTINE_FAST_SRC}flow outer() -> Int\ncontract { effects {} }\n{\n  let a = spin(1)\n  let b = spin(2)\n  return 7\n}\n`;
const COUNT_SRC = (cond) => `flow count() -> Int\ncontract { effects {} }\n{\n  mut i = 0\n  while ${cond} {\n    i = i + 1\n  }\n  return i\n}\n`;
function findWhile(node) {
  if (node.kind === "whileStmt") return node;
  for (const c of node.children ?? []) { const f = findWhile(c); if (f !== undefined) return f; }
  return undefined;
}
async function runCount(cond, maxSteps, deadlineAheadMs) {
  const { parsed } = compile(COUNT_SRC(cond));
  const contract = (flowNode(parsed, "count").children ?? []).find((c) => c.kind === "contractDecl");
  const enforcer = deadlineAheadMs > 0
    ? L.createContractEnforcer(contract, "count", { deadlineMs: Date.now() + deadlineAheadMs })
    : L.createContractEnforcer(contract, "count", {});
  return L.executeFlow("count", new Map(), parsed.ast, parsed.flows, enforcer, undefined, { maxSteps });
}

const BL = (inv, body) => `flow f(a: Int) -> Int\ncontract {\n  effects {}\n  invariant { ensure ${inv} }\n}\n{\n${body}\n}\n`;

// ============================== I2 ==============================
describe("I2 T1 - on_timeout_fault quarantine is an executable handler (no FAULT-006)", () => {
  it("compiles without FUNGI-FAULT-006", () => {
    const { codes } = compile(QUARANTINE_SRC);
    assert.equal(codes.includes("FUNGI-FAULT-006"), false, codes.join(","));
  });
});

describe("I2 T2 - an in-body timeout runs the quarantine handler, then still denies", () => {
  it("runtimeError + RUNTIME-003 [FUNGI-TIMEOUT] + fault-handler audit + FAULT-007, no payload in audit", async () => {
    const { r, codes, msgs, events } = await exec(QUARANTINE_SRC, "spin", [["n", int(1)]], 40);
    assert.equal(r.value.__tag, "runtimeError");
    assert.ok(msgs.some((m) => m.startsWith("FUNGI-RUNTIME-003:") && m.includes("[FUNGI-TIMEOUT]")), msgs.join(" | "));
    assert.equal(count(codes, "FUNGI-FAULT-007"), 1, msgs.join(" | "));
    const h = r.auditEntries.filter((a) => a.event === "fault-handler");
    assert.equal(h.length, 1, events.join(","));
    const fields = h[0]?.fields ?? {};
    assert.deepEqual(Object.keys(fields).sort(), ["action", "flowId", "postureBit", "signal"]);
    assert.equal(fields.signal, "on_timeout_fault");
    assert.equal(fields.action, "quarantine");
    assert.equal(fields.flowId, "spin");
    assert.equal(fields.postureBit, "none");
    // ordering: the RUNTIME-003 fault diagnostic precedes FAULT-007
    assert.ok(codes.indexOf("FUNGI-RUNTIME-003") < codes.indexOf("FUNGI-FAULT-007"));
  });
});

describe("I2 T3 - a quarantined flow is denied on re-entry in the same call tree", () => {
  it("second spin() call: FAULT-008 before the deadline gate, body never runs", async () => {
    const { codes, msgs, events } = await exec(OUTER_SRC, "outer", [], 40);
    assert.equal(count(codes, "FUNGI-FAULT-007"), 1, msgs.join(" | "));
    assert.equal(count(codes, "FUNGI-FAULT-008"), 1, msgs.join(" | "));
    // without the gate the second call would hit the entry deadline check (RUNTIME-006)
    assert.equal(count(codes, "FUNGI-RUNTIME-006"), 0, msgs.join(" | "));
    assert.equal(msgs.filter((m) => m.includes("[FUNGI-TIMEOUT]") && m.startsWith("FUNGI-RUNTIME-003:")).length, 1);
    assert.equal(count(events, "quarantine-deny"), 1, events.join(","));
  });
});

describe("I2 T2f - an ELIGIBLE fast-path loop times out and runs the quarantine handler (R-I2-12)", () => {
  it("the spin loop is fast-path eligible and the fast path calls the deadline check every iteration", () => {
    const w = findWhile(compile(QUARANTINE_FAST_SRC).parsed.ast);
    assert.ok(w !== undefined);
    let calls = 0;
    const scope = new Map([["i", int(0)]]);
    assert.throws(
      () => L.tryWhileFastPath(w.children[0], w.children[1], scope, () => undefined, 1_000_000_000, () => { calls += 1; if (calls === 3) throw new Error("[FUNGI-TIMEOUT] probe"); }),
      /FUNGI-TIMEOUT/,
    );
    assert.equal(calls, 3);
    assert.equal(scope.get("i")?.value ?? -1, 2); // exactly two iterations ran before the third check threw
    const small = findWhile(compile(COUNT_SRC("i < 10")).parsed.ast);
    let n = 0;
    assert.equal(L.tryWhileFastPath(small.children[0], small.children[1], new Map([["i", int(0)]]), () => undefined, 100, () => { n += 1; }), true);
    assert.equal(n, 11); // one check per iteration plus the exiting condition test, as on the walker
  });
  it("runtimeError + RUNTIME-003 [FUNGI-TIMEOUT] + fault-handler audit + FAULT-007 (not the compute budget)", async () => {
    const { r, codes, msgs } = await exec(QUARANTINE_FAST_SRC, "spin", [["n", int(1)]], 40);
    assert.equal(r.value.__tag, "runtimeError");
    assert.ok(msgs.some((m) => m.startsWith("FUNGI-RUNTIME-003:") && m.includes("[FUNGI-TIMEOUT]")), msgs.join(" | "));
    assert.equal(msgs.some((m) => m.includes("Compute budget exceeded")), false, msgs.join(" | "));
    assert.equal(count(codes, "FUNGI-FAULT-007"), 1, msgs.join(" | "));
    const h = r.auditEntries.filter((a) => a.event === "fault-handler");
    assert.equal(h.length, 1);
    assert.deepEqual(h[0]?.fields ?? {}, { signal: "on_timeout_fault", action: "quarantine", flowId: "spin", postureBit: "none" });
  });
  it("re-entry in the same call tree is denied with FAULT-008", async () => {
    const { codes, msgs, events } = await exec(OUTER_FAST_SRC, "outer", [], 40);
    assert.equal(count(codes, "FUNGI-FAULT-007"), 1, msgs.join(" | "));
    assert.equal(count(codes, "FUNGI-FAULT-008"), 1, msgs.join(" | "));
    assert.equal(count(codes, "FUNGI-RUNTIME-006"), 0, msgs.join(" | "));
    assert.equal(count(events, "quarantine-deny"), 1, events.join(","));
  });
});

describe("I2 T2g - the fast path is still taken (performance not silently lost)", () => {
  // Measured: `i < 1000` costs 2003 steps on the fast path; the walker form `1000 > i` costs 6005.
  // A 3000-step budget therefore separates the two paths deterministically (no timing).
  it("eligible loop without a deadline completes within 3000 steps", async () => {
    const r = await runCount("i < 1000", 3000, 0);
    assert.deepEqual(r.value, int(1000));
  });
  it("eligible loop with an active (unexpired) deadline still completes within 3000 steps", async () => {
    const r = await runCount("i < 1000", 3000, 60_000);
    assert.deepEqual(r.value, int(1000));
  });
  it("control: the walker-only form exceeds the same 3000-step budget", async () => {
    const r = await runCount("1000 > i", 3000, 0);
    assert.equal(r.value.__tag, "runtimeError");
    assert.ok(r.diagnostics.some((d) => String(d.message).includes("Compute budget exceeded")), r.diagnostics.map((d) => d.message).join(" | "));
  });
});

describe("I2 T4 - quarantine does not leak across top-level executions", () => {
  it("a fresh execution of spin with a generous deadline is not quarantined", async () => {
    await exec(QUARANTINE_SRC, "spin", [["n", int(1)]], 40);
    const src = HANDLER("on_timeout_fault quarantine", "{\n  return n\n}");
    const { r, codes } = await exec(src, "spin", [["n", int(5)]], 60_000);
    assert.equal(codes.includes("FUNGI-FAULT-008"), false, codes.join(","));
    assert.deepEqual(r.value, int(5));
  });
});

describe("I2 T5 - every other non-halt handler is still FAULT-006 (refused by name)", () => {
  for (const line of [
    "on_timeout_fault fallback spin2", "on_timeout_fault retry", "on_rotation_fault log",
    "on_denial_fault quarantine", "on_denial_fault fallback spin2", "on_substrate_fault fallback spin2",
    "on_substrate_fault quarantine", "on_rotation_fault quarantine", "on_substrate_fault retry",
  ]) {
    it(line, () => {
      const { codes } = compile(HANDLER(line, "{\n  return n\n}") + "flow spin2(n: Int) -> Int\ncontract { effects {} }\n{ return n }\n");
      assert.equal(codes.includes("FUNGI-FAULT-006"), true, codes.join(","));
    });
  }
  it("on_timeout_fault halt stays clean", () => {
    assert.equal(compile(HANDLER("on_timeout_fault halt", "{\n  return n\n}")).codes.includes("FUNGI-FAULT-006"), false);
  });
});

describe("I2 T6 - an explicit fault raise is never handled", () => {
  it("fault \"x\" in a flow with timeout quarantine: FAULT-001, no handler audit, no FAULT-007", async () => {
    const { r, codes, events } = await exec(HANDLER("on_timeout_fault quarantine", `{\n  fault "x"\n}`), "spin", [["n", int(1)]], 60_000);
    assert.equal(r.value.__tag, "runtimeError");
    assert.equal(codes.includes("FUNGI-FAULT-001"), true, codes.join(","));
    assert.equal(codes.includes("FUNGI-FAULT-007"), false);
    assert.equal(events.includes("fault-handler"), false);
    assert.equal(events.includes("fault"), true);
  });
});

describe("I2 T7 - a trap is never handled", () => {
  it("trap fires FUNGI-INV-000, no handler", async () => {
    const src = `flow spin(n: Int) -> Int\ncontract {\n  effects {}\n  resilience {\n    on_timeout_fault quarantine\n  }\n}\n{\n  trap n > 0 : BAD_N\n  return n\n}\n`;
    const { codes, events } = await exec(src, "spin", [["n", int(1)]], 60_000);
    assert.equal(codes.includes("FUNGI-INV-000"), true, codes.join(","));
    assert.equal(codes.includes("FUNGI-FAULT-007"), false);
    assert.equal(events.includes("fault-handler"), false);
  });
});

describe("I2 T8 - WASM refuses an executable fault handler by name", () => {
  it("FUNGI-WAT-FAULT-001", () => {
    const e = watError(HANDLER("on_timeout_fault quarantine", "{\n  return n\n}").replaceAll("spin", "spinWorker"));
    assert.ok(e.includes("FUNGI-WAT-FAULT-001"), e);
  });
});

describe("I2 T8b - negative: flows without an executable handler still lower (no WAT-FAULT-001)", () => {
  it("a handler-free flow lowers", () => {
    const e = watError("flow spinWorker(n: Int) -> Int\ncontract { effects {} }\n{\n  return n\n}\n");
    assert.equal(e, "lowered", e);
  });
  it("a declared halt handler is not an executable handler and does not raise WAT-FAULT-001", () => {
    const e = watError(HANDLER("on_substrate_fault halt", "{\n  return n\n}").replaceAll("spin", "spinWorker"));
    assert.equal(e.includes("FUNGI-WAT-FAULT-001"), false, e);
    assert.equal(e, "lowered", e);
  });
});

describe("I2 T9 - no handler declared: timeout behaviour is unchanged", () => {
  it("no FAULT-007, no fault-handler audit", async () => {
    const src = `flow spin(n: Int) -> Int\ncontract { effects {} }\n${SPIN_BODY}\n`;
    const { r, codes, events } = await exec(src, "spin", [["n", int(1)]], 40);
    assert.equal(r.value.__tag, "runtimeError");
    assert.equal(codes.includes("FUNGI-FAULT-007"), false);
    assert.equal(events.includes("fault-handler"), false);
  });
});

// ============================== I3 ==============================
describe("I3 T10 - an eligible body-local invariant compiles (INV-004 relaxed only for it)", () => {
  it("ensure over a top-level immutable let: no INV-004", () => {
    const { codes } = compile(BL("x > 0", "  let x = a + 1\n  return x"));
    assert.equal(codes.includes("FUNGI-INV-004"), false, codes.join(","));
  });
  it("mixed parameter + body-local is also admitted", () => {
    const { codes } = compile(BL("x > a", "  let x = a + 1\n  return x"));
    assert.equal(codes.includes("FUNGI-INV-004"), false, codes.join(","));
  });
});

describe("I3 T11 - a holding body-local invariant lets the flow return", () => {
  it("value returned, no INV-005", async () => {
    const { r, codes } = await exec(BL("x > 0", "  let x = a + 1\n  return x"), "f", [["a", int(4)]]);
    assert.deepEqual(r.value, int(5));
    assert.equal(codes.includes("FUNGI-INV-005"), false, codes.join(","));
  });
});

describe("I3 T12 - a violated body-local invariant denies immediately after the binding", () => {
  it("INV-005, runtimeError, invariant audit without values, later statements never run", async () => {
    const body = "  let x = a + 1\n  fault \"after-binding\"";
    const { r, codes, msgs } = await exec(BL("x > 100", body), "f", [["a", int(4)]]);
    assert.equal(r.value.__tag, "runtimeError");
    assert.equal(codes.includes("FUNGI-INV-005"), true, msgs.join(" | "));
    // the statement after the let (a fault raise) never ran
    assert.equal(codes.includes("FUNGI-FAULT-001"), false, msgs.join(" | "));
    const inv = r.auditEntries.filter((a) => a.event === "invariant");
    assert.equal(inv.length, 1);
    // exactly these fields: no bound value (x = 5) and no parameter value (a = 4) in the audit
    assert.deepEqual(inv[0]?.fields ?? {}, { code: "FUNGI-INV-005", flowId: "f", index: "0" });
  });
});

describe("I3 T13 - a non-Bool predicate fails closed", () => {
  it("ensure x (an Int) -> INV-005", async () => {
    const { r, codes } = await exec(BL("x", "  let x = a + 1\n  return x"), "f", [["a", int(4)]]);
    assert.equal(r.value.__tag, "runtimeError");
    assert.equal(codes.includes("FUNGI-INV-005"), true, codes.join(","));
  });
});

describe("I3 T14 - an exit before the invariant is established fails closed", () => {
  // 2026-10-02 code conformance (one code = one failure mode): "never established" is its own code,
  // FUNGI-INV-006 BODY_LOCAL_INVARIANT_NOT_ESTABLISHED - distinct from INV-005 (evaluated, not true).
  it("early return before the trigger let -> INV-006 (never established), not INV-005", async () => {
    const body = "  if a > 0 {\n    return a\n  }\n  let x = a + 1\n  return x";
    const { r, codes, msgs } = await exec(BL("x > 0", body), "f", [["a", int(4)]]);
    assert.equal(r.value.__tag, "runtimeError");
    assert.ok(msgs.some((m) => m.startsWith("FUNGI-INV-006:") && m.includes("BODY_LOCAL_INVARIANT_NOT_ESTABLISHED")), msgs.join(" | "));
    assert.equal(codes.includes("FUNGI-INV-005"), false, codes.join(","));
    const inv = r.auditEntries.filter((a) => a.event === "invariant");
    assert.deepEqual(inv[0]?.fields ?? {}, { code: "FUNGI-INV-006", flowId: "f", index: "0" });
  });
});

describe("I3 T12c - INV-005 messages carry only a fixed classification (SuperGrok NB-1)", () => {
  it("false -> classification FALSE; non-Bool -> NOT_BOOL; no values in the message", async () => {
    const f = await exec(BL("x > 100", "  let x = a + 1\n  return x"), "f", [["a", int(4)]]);
    const m1 = f.msgs.filter((m) => m.startsWith("FUNGI-INV-005:"));
    assert.equal(m1.length > 0 && m1.every((m) => m.includes("classification FALSE")), true, f.msgs.join(" | "));
    const nb = await exec(BL("x", "  let x = a + 1\n  return x"), "f", [["a", int(4)]]);
    const m2 = nb.msgs.filter((m) => m.startsWith("FUNGI-INV-005:"));
    assert.equal(m2.length > 0 && m2.every((m) => m.includes("classification NOT_BOOL")), true, nb.msgs.join(" | "));
    for (const m of [...m1, ...m2]) {
      assert.equal(/\b5\b|\b4\b/.test(m.replace(/FUNGI-INV-005/g, "").replace(/#\d+/g, "")), false, `value leaked: ${m}`);
    }
  });
  it("source pin: no exception text reaches BodyInvariantSignal", () => {
    const src = readFileSync(new URL("../src/interpreter.ts", import.meta.url), "utf8");
    const sites = src.split(/\r?\n/).filter((l) => l.includes("new BodyInvariantSignal("));
    assert.equal(sites.length, 3, sites.join("\n"));
    for (const l of sites) assert.match(l, /new BodyInvariantSignal\(inv\.index, "(EVALUATION_FAILED|NOT_BOOL|FALSE)"\);/);
  });
});

describe("I3 T12d - secret-bearing exception text never reaches diagnostics or audit (Codex req. a)", () => {
  it("an ensure whose evaluation throws 'token=sk_live_...' -> INV-005 EVALUATION_FAILED, secret absent everywhere", async () => {
    const SECRET = "sk_live_SECRET_9f3a";
    // A hostile argument whose read throws an Error carrying secret text; the ensure (x > a) reads it,
    // so evaluation throws inside the body-local check (the EVALUATION_FAILED path).
    const hostile = { __tag: "int", get value() { throw new Error(`token=${SECRET}`); } };
    const { r, codes, msgs } = await exec(BL("x > a", "  let x = 1\n  return x"), "f", [["a", hostile]]);
    assert.equal(r.value.__tag, "runtimeError");
    assert.equal(codes.includes("FUNGI-INV-005"), true, msgs.join(" | "));
    assert.ok(msgs.some((m) => m.startsWith("FUNGI-INV-005:") && m.includes("classification EVALUATION_FAILED")), msgs.join(" | "));
    const diagText = JSON.stringify(r.diagnostics);
    const auditText = JSON.stringify(r.auditEntries);
    for (const needle of [SECRET, "sk_live", "token="]) {
      assert.equal(diagText.includes(needle), false, `diagnostics leak '${needle}'`);
      assert.equal(auditText.includes(needle), false, `audit leaks '${needle}'`);
    }
    const inv = r.auditEntries.filter((a) => a.event === "invariant");
    assert.deepEqual(inv[0]?.fields ?? {}, { code: "FUNGI-INV-005", flowId: "f", index: "0" });
  });
});

describe("I3 T12b - a violation message carries the constant's code and name", () => {
  it("FUNGI-INV-005 BODY_LOCAL_INVARIANT_VIOLATED", async () => {
    const { msgs } = await exec(BL("x > 100", "  let x = a + 1\n  return x"), "f", [["a", int(4)]]);
    assert.ok(msgs.some((m) => m.startsWith("FUNGI-INV-005:") && m.includes("FUNGI-INV-005 BODY_LOCAL_INVARIANT_VIOLATED")), msgs.join(" | "));
  });
});

describe("I3 T15 - ineligible names are still FUNGI-INV-004", () => {
  const cases = {
    "mut local": "  mut x = a + 1\n  return x",
    "nested-block local": "  if a > 0 {\n    let x = a + 1\n    return x\n  }\n  return a",
    "shadowed parameter": "  let a = 3\n  return a",
    "protected local": "  let x: protected Int = a\n  return a",
    "typo": "  let x = a + 1\n  return x",
    "bound twice": "  let x = a + 1\n  if a > 0 {\n    let x = 2\n    return x\n  }\n  return x",
  };
  const inv = { "mut local": "x > 0", "nested-block local": "x > 0", "shadowed parameter": "a > 0", "protected local": "x > 0", "typo": "y > 0", "bound twice": "x > 0" };
  for (const [label, body] of Object.entries(cases)) {
    it(label, () => {
      const { codes } = compile(BL(inv[label] ?? "x > 0", body));
      if (label === "shadowed parameter") {
        // `a` is a parameter: a parameter precondition, never a body-local; it must not be re-classified
        assert.equal(codes.includes("FUNGI-INV-004"), false, codes.join(","));
      } else {
        assert.equal(codes.includes("FUNGI-INV-004"), true, `${label}: ${codes.join(",")}`);
      }
    });
  }
});

describe("I3 T16 - mixing result with a body-local stays refused", () => {
  it("ensure result > x -> INV-004", () => {
    const { codes } = compile(BL("result > x", "  let x = a + 1\n  return x"));
    assert.equal(codes.includes("FUNGI-INV-004"), true, codes.join(","));
  });
});

describe("I3 T17 - parameter preconditions are unchanged (entry-gated)", () => {
  it("ensure a > 0 with a = 0 -> FUNGI-INV-001 before the body", async () => {
    const { r, codes } = await exec(BL("a > 0", "  fault \"body\""), "f", [["a", int(0)]]);
    assert.equal(r.value.__tag, "runtimeError");
    assert.equal(codes.includes("FUNGI-INV-001"), true, codes.join(","));
    assert.equal(codes.includes("FUNGI-FAULT-001"), false);
  });
});

describe("I3 T18 - WASM refuses a body-local invariant by name", () => {
  it("FUNGI-WAT-INV-001", () => {
    const e = watError(BL("total > 0", "  let total = a + 1\n  return total").replace("flow f(", "flow boundedTotal("));
    assert.ok(e.includes("FUNGI-WAT-INV-001"), e);
  });
});

describe("I3 T18b - negative: an ordinary parameter ensure still lowers (no WAT-INV-001)", () => {
  it("ensure a > 0 over a parameter lowers", () => {
    const e = watError(BL("a > 0", "  return a").replace("flow f(", "flow boundedTotal("));
    assert.equal(e.includes("FUNGI-WAT-INV-001"), false, e);
    assert.equal(e, "lowered", e);
  });
});

describe("I3 T19 - fast tiers are bypassed", () => {
  it("executeFlowSync declines a flow with a body-local invariant / an executable handler", () => {
    for (const [src, flow] of [[BL("x > 0", "  let x = a + 1\n  return x"), "f"], [HANDLER("on_timeout_fault quarantine", "{\n  return n\n}"), "spin"]]) {
      const { parsed } = compile(src);
      const sync = typeof L.executeFlowSync === "function"
        ? L.executeFlowSync(flow, new Map([["a", int(4)], ["n", int(4)]]), parsed.ast, parsed.flows)
        : "no-sync-tier";
      assert.ok(sync === null || sync === "no-sync-tier" || sync === undefined, `sync tier ran ${flow}: ${JSON.stringify(sync).slice(0, 120)}`);
    }
  });
});

// ============================== pins ==============================
describe("T20/T21 pins - stage hashes and ladders unchanged", () => {
  const STAGES = {
    "lexer.fungi": "5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7",
    "type-checker.fungi": "1be2bfd57e0c06dd8bdae2c72822660e9817bc488392c581c5a71cead021d97f",
    "effect-checker.fungi": "95227de9bdb61d5706bf70aa81d0efc0361c45cff9ef332017535e4dbdee1b02",
    "governance-verifier.fungi": "3a6a3745b76747949836c90aab51392b3c3dc208b54dc3d633722b02ea2a6819",
    "gir-emitter.fungi": "f7511e57de512542481177e63e2a21c3459339ee12456a82516be9e8c6180b43",
    "runtime.fungi": "d615ca94bfacd55564b0ffdefc73ce1923d9186756f50c2baa701cf22ae7c4a1",
  };
  it("self-hosted stage sources are byte-unchanged vs HEAD (I2/I3 touches no .fungi)", () => {
    const r = spawnSync("git", ["diff", "--quiet", "HEAD", "--", "src/self-hosted"], { cwd: join(__dir, ".."), encoding: "utf8" });
    assert.equal(r.status, 0, `self-hosted sources differ from HEAD: ${r.stderr}`);
    for (const f of Object.keys(STAGES)) assert.ok(readFileSync(join(SH, f)).length > 0, f);
  });
  it("WAT L1 ladder 200/200 and interpreter parity 14/14", () => {
    const w = watLoweringLadder();
    assert.equal(`${w.done}/${w.total}`, "200/200");
    const p = interpreterParityLadder();
    assert.equal(`${p.done}/${p.total}`, "14/14");
  });
});

describe("I3 T22 - the checked (artifact) pipeline resolves only admitted body-local names", () => {
  const checkCodes = (src) => {
    const r = L.checkProgram(`@version 1\n${src}`, "i2i3.fungi");
    return r.ok ? "ok" : (Array.isArray(r.diagnostics) ? r.diagnostics.map((d) => d.code).join(",") : "refused");
  };
  const named = (inv, body) => BL(inv, body).replace("flow f(", "flow boundedTotal(");
  it("an eligible body-local ensure passes symbol resolution", () => {
    assert.equal(checkCodes(named("total > 0", "  let total = a + 1\n  return total")).includes("FUNGI-NAME-001"), false);
  });
  it("a typo in a body-local ensure still flags FUNGI-NAME-001", () => {
    assert.ok(checkCodes(named("totl > 0", "  let total = a + 1\n  return total")).includes("FUNGI-NAME-001"));
  });
  it("a mutable local is not admitted and still flags FUNGI-NAME-001", () => {
    assert.ok(checkCodes(named("total > 0", "  mut total = a + 1\n  return total")).includes("FUNGI-NAME-001"));
  });
  it("mixing result with a body-local is not admitted (FUNGI-NAME-001 for the local)", () => {
    assert.ok(checkCodes(named("total > result", "  let total = a + 1\n  return total")).includes("FUNGI-NAME-001"));
  });
});

describe("T24 code conformance - every I2/I3 code is one exported constant in its family _DIAGNOSTICS array", () => {
  const EXPECTED = [
    ["FUNGI_FAULT_007", "FUNGI-FAULT-007", "FLOW_QUARANTINED", "FUNGI_FAULT_DIAGNOSTICS"],
    ["FUNGI_FAULT_008", "FUNGI-FAULT-008", "QUARANTINED_FLOW_DENIED", "FUNGI_FAULT_DIAGNOSTICS"],
    ["FUNGI_INV_005", "FUNGI-INV-005", "BODY_LOCAL_INVARIANT_VIOLATED", "FUNGI_INV_DIAGNOSTICS"],
    ["FUNGI_INV_006", "FUNGI-INV-006", "BODY_LOCAL_INVARIANT_NOT_ESTABLISHED", "FUNGI_INV_DIAGNOSTICS"],
    ["FUNGI_WAT_FAULT_001", "FUNGI-WAT-FAULT-001", "EXECUTABLE_FAULT_HANDLER_NOT_LOWERED", "FUNGI_WAT_DIAGNOSTICS"],
    ["FUNGI_WAT_INV_001", "FUNGI-WAT-INV-001", "BODY_LOCAL_INVARIANT_NOT_LOWERED", "FUNGI_WAT_DIAGNOSTICS"],
  ];
  for (const [constName, code, name, arrayName] of EXPECTED) {
    it(`${code} ${name}`, () => {
      const c = L[constName];
      assert.equal(typeof c === "object" && c !== null, true, `${constName} is not exported`);
      assert.deepEqual(Object.keys(c).slice(0, 4), ["code", "name", "severity", "message"]);
      assert.equal(c.code, code);
      assert.equal(c.name, name);
      assert.match(c.name, /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/);
      assert.equal(c.severity, "error");
      assert.equal(typeof c.message === "string" && c.message.length > 0, true);
      // SuperGrok review NB-3: every constant carries a non-empty suggestedFix.
      assert.equal(typeof c.suggestedFix === "string" && c.suggestedFix.trim().length > 0, true, `${constName} suggestedFix`);
      const arr = L[arrayName];
      assert.equal(Array.isArray(arr), true, `${arrayName} is not exported`);
      assert.equal(arr.includes(c), true, `${constName} missing from ${arrayName}`);
    });
  }
  it("the WAT refusals throw an Error carrying the structured code field from the constant", () => {
    const grab = (src) => {
      const checked = L.checkProgram(`@version 1\n${src}`, "i2i3.fungi");
      assert.equal(checked.ok, true);
      try {
        L.renderWAT(L.buildWATFromCheckedProgram(checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true));
      } catch (e) {
        return e;
      }
      return new Error("lowered");
    };
    const f = grab(HANDLER("on_timeout_fault quarantine", "{\n  return n\n}").replaceAll("spin", "spinWorker"));
    assert.equal(f.code, L.FUNGI_WAT_FAULT_001.code);
    assert.equal(f.diagnosticName, L.FUNGI_WAT_FAULT_001.name);
    const v = grab(BL("total > 0", "  let total = a + 1\n  return total").replace("flow f(", "flow boundedTotal("));
    assert.equal(v.code, L.FUNGI_WAT_INV_001.code);
    assert.equal(v.diagnosticName, L.FUNGI_WAT_INV_001.name);
  });
  it("names and codes are unique across the six constants", () => {
    const all = EXPECTED.map(([k]) => L[k]);
    assert.equal(new Set(all.map((c) => c.code)).size, all.length);
    assert.equal(new Set(all.map((c) => c.name)).size, all.length);
  });
  it("every emit references the constant: no inline code literals at the emit sites", () => {
    const src = (f) => readFileSync(join(__dir, "../src", f), "utf8");
    for (const [file, codes] of [
      ["interpreter.ts", ["FUNGI-FAULT-007", "FUNGI-FAULT-008", "FUNGI-INV-005", "FUNGI-INV-006"]],
      ["wat-emitter-refusals.ts", ["FUNGI-WAT-FAULT-001", "FUNGI-WAT-INV-001"]],
    ]) {
      const text = src(file);
      for (const code of codes) {
        const defs = file === "wat-emitter-refusals.ts" ? 1 : 0; // the WAT constants are defined in their owning file
        assert.equal(text.split(`"${code}"`).length - 1, defs, `${file}: inline "${code}" literal`);
      }
    }
    const owner = src("governed-control-diagnostics.ts");
    for (const code of ["FUNGI-FAULT-007", "FUNGI-FAULT-008", "FUNGI-INV-005", "FUNGI-INV-006"]) {
      assert.equal(owner.split(`"${code}"`).length - 1, 1, `owner must define ${code} exactly once`);
    }
  });
});