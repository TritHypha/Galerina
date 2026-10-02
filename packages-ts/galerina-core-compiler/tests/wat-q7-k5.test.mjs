/**
 * Q9 recode — K5 I2 FAULT-006 error + I3 INV-004 body-local pin.
 * Owner 2026-10-01: DECLARED_HANDLER_NOT_EXECUTED moves to unused FUNGI-FAULT-006.
 * Replay: node --test --test-reporter=tap tests/wat-q7-k5.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as L from "../dist/index.js";
import { faultHandlerDiagMeta } from "../dist/governance-verifier.js";
import { watLoweringLadderAsync } from "../../../scripts/lib/wat-lowering-ladder.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "../src");
const SH = join(SRC, "self-hosted");
const ROOT = join(__dir, "../../..");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const CODE = "FUNGI-FAULT-006";

const STAGE_HASHES = {
  "lexer.fungi": { sha256: "5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7", bytes: 425985 },
  "parser.fungi": { sha256: "5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7", bytes: 425985 },
  "type-checker.fungi": { sha256: "1be2bfd57e0c06dd8bdae2c72822660e9817bc488392c581c5a71cead021d97f", bytes: 593181 },
  "effect-checker.fungi": { sha256: "95227de9bdb61d5706bf70aa81d0efc0361c45cff9ef332017535e4dbdee1b02", bytes: 507412 },
  "governance-verifier.fungi": { sha256: "3a6a3745b76747949836c90aab51392b3c3dc208b54dc3d633722b02ea2a6819", bytes: 466103 },
  "gir-emitter.fungi": { sha256: "f7511e57de512542481177e63e2a21c3459339ee12456a82516be9e8c6180b43", bytes: 481889 },
  "runtime.fungi": { sha256: "d615ca94bfacd55564b0ffdefc73ce1923d9186756f50c2baa701cf22ae7c4a1", bytes: 536554 },
};

function emitterSrc() { return readFileSync(join(SRC, "wat-emitter.ts"), "utf8"); }
function interpSrc() { return readFileSync(join(SRC, "interpreter.ts"), "utf8"); }
function govSrc() { return readFileSync(join(SRC, "governance-verifier.ts"), "utf8"); }
function resSrc() { return readFileSync(join(SRC, "resilience-inference.ts"), "utf8"); }
function pendingSrc() { return readFileSync(join(__dir, "fixtures/diagnostic-pending-registration.txt"), "utf8"); }

function pipeline(source, label) {
  const parsed = L.parseProgram(source, label);
  const effects = L.checkEffects(parsed.flows, parsed.ast);
  return { parsed, effects };
}
function gov(source, label) {
  const { parsed, effects } = pipeline(source, label);
  return { g: L.verifyGovernance(parsed.ast, parsed.flows, effects, "dev"), parsed };
}
function has(g, code) { return g.diagnostics.some((d) => d.code === code); }

const HANDLER_SRC = (actionLine) => `flow f() -> Int
contract {
  effects {}
  resilience {
    ${actionLine}
  }
}
{ fault "x" }
flow f2() -> Int
contract { effects {} }
{ return 1 }`;

const strip = (p) => {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};
function extractRecordDecl(src, name) {
  const re = new RegExp("(^|\\n)record\\s+" + name + "\\b");
  const m = re.exec(src);
  if (!m) throw new Error("missing record " + name);
  const start = m.index + (m[1] ? m[1].length : 0);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}
function girRecordsForRuntime() {
  const src = strip("gir-emitter.fungi");
  return ["GIRNode", "GIRExprNode", "GIRModule", "GIRExpr", "GIRStmt", "FlowEntry"]
    .map((n) => extractRecordDecl(src, n))
    .join("\n\n");
}
function stageSource(file) {
  const extra = file === "lexer.fungi" || file === "parser.fungi" ? "" : "\n" + strip(file);
  const girDecls = file === "runtime.fungi" ? "\n" + girRecordsForRuntime() : "";
  return "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + girDecls + extra;
}
function renderStageWat(source, label) {
  const checked = L.checkProgram(source, label);
  if (!checked.ok) {
    const family = typeof checked.family === "string" && checked.family.length > 0 ? checked.family : "gate";
    const code = typeof checked.code === "string" && checked.code.length > 0 ? checked.code : "FUNGI-WAT-CHECKED-001";
    return { error: `${family}:${code}`, wat: "" };
  }
  try {
    const wat = L.renderWAT(
      L.buildWATFromCheckedProgram(checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true),
    );
    return { wat };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e), wat: "" };
  }
}

describe("T1 fault raise stay-green pin", () => {
  it("fault-construct source still pins halt/audit/FAULT-001", () => {
    const t = readFileSync(join(__dir, "fault-construct.test.mjs"), "utf8");
    assert.equal(t.includes("FUNGI-FAULT-001"), true);
    assert.equal(t.includes('event:"fault"'), true);
    assert.equal(interpSrc().includes("an unhandled fault HALTS + AUDITS + DENIES"), true);
  });
});

describe("T1 recode FAULT-006 source identity", () => {
  it("new code present in both src files; FUNGI-FAULT-004 absent including comments", () => {
    assert.equal(resSrc().includes("FUNGI-FAULT-006"), true);
    assert.equal(govSrc().includes("FUNGI-FAULT-006"), true);
    assert.equal(resSrc().includes("FUNGI-FAULT-004"), false);
    assert.equal(govSrc().includes("FUNGI-FAULT-004"), false);
  });
});

describe("T2 fallback compile error FAULT-006", () => {
  it("on_substrate_fault fallback f2 is FAULT-006 error; f2 never runs", async () => {
    const { g, parsed } = gov(HANDLER_SRC("on_substrate_fault fallback f2"), "t2.fungi");
    assert.equal(has(g, CODE), true, g.diagnostics.map((d) => d.code + ":" + d.message).join(" | "));
    const d = g.diagnostics.find((x) => x.code === CODE);
    assert.equal(d.name, "DECLARED_HANDLER_NOT_EXECUTED");
    assert.equal(d.severity, "error");
    assert.match(d.message, /halt, audit and deny/i);
    assert.match(d.message, /not executed/i);
    assert.match(String(d.suggestedFix ?? ""), /Replace the declared action with 'halt'/);
    assert.equal(g.diagnostics.some((x) => String(x.message).includes("declared-not-executed")), false);
    const r = await L.executeFlow("f", new Map(), parsed.ast);
    assert.equal(r?.audit?.result, "error");
    assert.notEqual(r?.value?.value, 1, "fallback f2 is not executed");
    assert.equal(JSON.stringify(r?.auditEntries ?? []).includes("declared-not-executed"), false);
  });
});

describe("T3 quarantine/retry compile error FAULT-006", () => {
  // 2026-10-02 real I2 (R-I2-1, zero-trust default, owner may revisit): `on_timeout_fault quarantine` is now
  // EXECUTED (FUNGI-FAULT-007/008, tests/interpreter-i2-i3.test.mjs), so it is no longer FAULT-006. Retry stays.
  it("on_timeout_fault quarantine is executed, so no longer FAULT-006", () => {
    const { g } = gov(HANDLER_SRC("on_timeout_fault quarantine"), "t3q.fungi");
    assert.equal(has(g, CODE), false, g.diagnostics.map((d) => d.code).join(","));
  });
  for (const line of ["on_timeout_fault retry"]) {
    it(line + " is FAULT-006", () => {
      const { g } = gov(HANDLER_SRC(line), "t3.fungi");
      assert.equal(has(g, CODE), true, g.diagnostics.map((d) => d.code).join(","));
      const d = g.diagnostics.find((x) => x.code === CODE);
      assert.equal(d.name, "DECLARED_HANDLER_NOT_EXECUTED");
      assert.equal(d.severity, "error");
      assert.match(d.message, /halt, audit and deny/i);
    });
  }
});

describe("T4 declared halt has no FAULT-006", () => {
  it("on_substrate_fault halt is clean of FAULT-006 and FAULT-004; raise still halts", async () => {
    const { g, parsed } = gov(HANDLER_SRC("on_substrate_fault halt"), "t4.fungi");
    assert.equal(has(g, CODE), false, g.diagnostics.map((d) => d.code + ":" + d.message).join(" | "));
    assert.equal(has(g, "FUNGI-FAULT-004"), false, g.diagnostics.map((d) => d.code + ":" + d.message).join(" | "));
    const r = await L.executeFlow("f", new Map(), parsed.ast);
    assert.equal(r?.audit?.result, "error");
    assert.equal((r?.diagnostics ?? []).some((d) => d.code === "FUNGI-FAULT-001"), true);
    assert.equal((r?.auditEntries ?? []).some((e) => e.event === "fault"), true);
    assert.equal(JSON.stringify(r?.auditEntries ?? []).includes("declared-not-executed"), false);
  });
});

describe("T5 FAULT-001/003 stay-green source", () => {
  it("fault-handlers-0017 still asserts FAULT-001 and FAULT-003", () => {
    const t = readFileSync(join(__dir, "fault-handlers-0017.test.mjs"), "utf8");
    assert.equal(t.includes("FUNGI-FAULT-001"), true);
    assert.equal(t.includes("FUNGI-FAULT-003"), true);
    assert.equal(t.includes("on_denial_fault retry"), true);
    assert.equal(t.includes("on_timeout_fault log"), true);
  });
});

describe("T6 trap stay-green", () => {
  it("TrapSignal / FUNGI-INV-000 remain separate from FaultSignal", () => {
    const i = interpSrc();
    assert.equal(i.includes("class TrapSignal"), true);
    assert.equal(i.includes("FUNGI-INV-000"), true);
    assert.equal(i.includes("class FaultSignal"), true);
  });
});

describe("T7 body-local ensure is INV-004", () => {
  // 2026-10-02 real I3 (R-I3-1, zero-trust default, owner may revisit): a top-level immutable single-bound
  // non-protected `let` is now an ADMITTED body-local invariant (checked at runtime, FUNGI-INV-005), so it is
  // no longer INV-004. `readonly` and every other ineligible local below stay INV-004.
  it("ensure naming an eligible body-local let is admitted (no FUNGI-INV-004)", () => {
    const src = `pure flow t(amount: Int) -> Int
contract {
  intent { "body-local pin." }
  invariant { ensure k > 0; }
}
{ let k: Int = 1
  return amount }`;
    const { g } = gov(src, "t7.fungi");
    assert.equal(has(g, "FUNGI-INV-004"), false, g.diagnostics.map((d) => d.code + ":" + d.message).join(" | "));
  });
  it("ensure naming a body-local readonly is FUNGI-INV-004", () => {
    const src = `pure flow t(amount: Int) -> Int
contract {
  intent { "body-local readonly pin." }
  invariant { ensure k > 0; }
}
{ readonly k: Int = 1
  return amount }`;
    const { g } = gov(src, "t7b.fungi");
    assert.equal(has(g, "FUNGI-INV-004"), true, g.diagnostics.map((d) => d.code + ":" + d.message).join(" | "));
  });
});

describe("T8 result / param ensure stay-green", () => {
  it("ensure result and ensure param are not INV-004", () => {
    const src = `pure flow t(amount: Int) -> Int
contract {
  intent { "stay-green." }
  invariant { ensure amount > 0; ensure result <= 100; }
}
{ return amount }`;
    const { g } = gov(src, "t8.fungi");
    assert.equal(has(g, "FUNGI-INV-004"), false, g.diagnostics.map((d) => d.code + ":" + d.message).join(" | "));
  });
});

describe("T9 WASM faultStmt trap unchanged", () => {
  it("live stacked lines :3127 / :3937 still trap (re-pinned on main 0d06d6c1, +26)", () => {
    const lines = emitterSrc().split("\n");
    assert.equal(lines[3126].includes("case \"faultStmt\""), true, lines[3126]);
    assert.equal(lines[3936].includes("case \"faultStmt\""), true, lines[3936]);
    assert.equal(emitterSrc().includes("W5b T2.2 terminal audited channel, WASM tier traps"), true);
  });
});

describe("T10 L1 200/200 plus 7-stage hashes unchanged", () => {
  it("live ladder is 200/200 = 100 and reports refused separately", async () => {
    const live = await watLoweringLadderAsync();
    assert.equal(live.total, 200);
    assert.equal(live.done, 200);
    assert.equal(live.pct, 100);
    assert.equal(typeof live.refused, "number");
    assert.equal(live.refused, 0);
  });
  it("7-stage WAT hashes match Q5n-B pins", () => {
    for (const [file, pin] of Object.entries(STAGE_HASHES)) {
      const r = renderStageWat(stageSource(file), file);
      assert.equal("error" in r && r.error.length > 0, false, file + " " + r.error);
      const buf = Buffer.from(r.wat, "utf8");
      assert.equal(sha256(buf), pin.sha256, file);
      assert.equal(buf.length, pin.bytes, file + " bytes");
    }
  });
});

describe("T11 pending omits FAULT-006 + source pins", () => {
  it("pending omits FAULT-006; omits FAULT-004/STMT-001/EFFECT-001; keeps PATTERN-001; src omits FAULT-004", () => {
    const p = pendingSrc();
    assert.equal(p.includes(CODE), false);
    assert.equal(p.includes("FUNGI-FAULT-004"), false);
    assert.equal(p.includes("FUNGI-WAT-STMT-001"), false);
    assert.equal(p.includes("FUNGI-WAT-EFFECT-001"), false);
    assert.equal(p.includes("FUNGI-PATTERN-001"), true);
    assert.equal(resSrc().includes(CODE), true);
    assert.equal(govSrc().includes(CODE), true);
    assert.equal(resSrc().includes("FUNGI-FAULT-004"), false);
    assert.equal(govSrc().includes("FUNGI-FAULT-004"), false);
    assert.equal(resSrc().includes("DECLARED_HANDLER_NOT_EXECUTED"), true);
    assert.equal(govSrc().includes("DECLARED_HANDLER_NOT_EXECUTED"), true);
    assert.equal(interpSrc().includes("declared-not-executed"), false);
    assert.equal(resSrc().includes("d.action !== \"halt\""), true);
  });
});

describe("T12 mapper explicit; unknown does not receive handler name/hint", () => {
  it("FAULT-006 maps to DECLARED_HANDLER_NOT_EXECUTED and the halt hint", () => {
    const m = faultHandlerDiagMeta("FUNGI-FAULT-006");
    assert.equal(m.kind, "found");
    assert.equal(m.kind === "found" ? m.name : "", "DECLARED_HANDLER_NOT_EXECUTED");
    assert.match(m.kind === "found" ? m.hint : "", /Replace the declared action with 'halt'/);
  });
  it("FAULT-001 and FAULT-003 keep their names", () => {
    const a = faultHandlerDiagMeta("FUNGI-FAULT-001");
    const b = faultHandlerDiagMeta("FUNGI-FAULT-003");
    assert.equal(a.kind, "found");
    assert.equal(b.kind, "found");
    assert.equal(a.kind === "found" ? a.name : "", "FAULT_HANDLER_MONOTONICITY");
    assert.equal(b.kind === "found" ? b.name : "", "FAULT_HANDLER_FAIL_OPEN");
  });
  it("synthetic unknown FAULT code is none and does not receive handler name or hint", () => {
    const m = faultHandlerDiagMeta("FUNGI-FAULT-999");
    assert.equal(m.kind, "none");
    assert.equal(m.kind === "none" ? m.reason : "", "unknown-fault-code");
    const blob = JSON.stringify(m);
    assert.equal(blob.includes("DECLARED_HANDLER_NOT_EXECUTED"), false);
    assert.equal(blob.includes("Replace the declared action with 'halt'"), false);
  });
});
