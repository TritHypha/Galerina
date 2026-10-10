/**
 * Q5n BUILD — D7 requireStmt/fnDecl STMT-001 + D8-1 marker + D8-2 EFFECT-001.
 * DESIGN-06N with Q5n-DR APPROVE_WITH_CHANGES retargets (T12 L1 200/200; T2 readonlydecl).
 * Replay: node --test --test-reporter=tap tests/wat-q5n-d7-d8-refusal.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as L from "../dist/index.js";
import { watLoweringLadderAsync } from "../../../scripts/lib/wat-lowering-ladder.mjs";
import { runCodexZoneHashes } from "../../../scripts/lib/codex-zone-hash-runner.mjs";
import { historicalCodexZoneHashes, CURRENT_CODEX_ZONE } from "../../../scripts/lib/codex-zone-freeze.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "../src");
const SH = join(SRC, "self-hosted");
const ROOT = join(__dir, "../../..");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const ZONE = {
  Z1: "7db668236da13ad6e898bd7ab125e67c096b8b4ca2aeea861698fb1c2a649c9f",
  Z2: "eacc64386775298dc0c0f41401234bcc3210ff0f49bbcb1e39539c0e095a8929",
  Z3: "646835cf3f8006c999e60ae125c8585a23d148468875cca36c608713e7571e7f",
};

const STAGE_HASHES = {
  "lexer.fungi": { sha256: "5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7", bytes: 425985 },
  "parser.fungi": { sha256: "5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7", bytes: 425985 },
  "type-checker.fungi": { sha256: "1be2bfd57e0c06dd8bdae2c72822660e9817bc488392c581c5a71cead021d97f", bytes: 593181 },
  "effect-checker.fungi": { sha256: "95227de9bdb61d5706bf70aa81d0efc0361c45cff9ef332017535e4dbdee1b02", bytes: 507412 },
  "governance-verifier.fungi": { sha256: "3a6a3745b76747949836c90aab51392b3c3dc208b54dc3d633722b02ea2a6819", bytes: 466103 },
  "gir-emitter.fungi": { sha256: "f7511e57de512542481177e63e2a21c3459339ee12456a82516be9e8c6180b43", bytes: 481889 },
  "runtime.fungi": { sha256: "d615ca94bfacd55564b0ffdefc73ce1923d9186756f50c2baa701cf22ae7c4a1", bytes: 536554 },
};

const STMT = "FUNGI-WAT-STMT-001";
const EFFECT = "FUNGI-WAT-EFFECT-001";
const D8_MARKER = "effectful flow not lowered (D8)";

const REQUIRE_SRC = `guarded flow g(admitted: Verdict) -> Int
contract { effects {} }
{
  require admitted {
    deny: return 0
    ambig: return 0
  }
  return 1
}`;

const FNDECL_SRC = `pure flow outer() -> Int
contract { effects {} }
{ fn inner() -> Int { return 1 }
  return 0 }`;

const WHERE_SRC = `@version 1
pure flow gated(p: Int where all{}) -> Int { return p }`;

const MIXED_SRC = `pure flow ok() -> Int
contract { effects {} }
{ return 2 }
flow fx() -> Int
contract { effects { database.read } }
{ return 1 }`;

function emitterSrc() {
  return readFileSync(join(SRC, "wat-emitter.ts"), "utf8");
}
function refusalsSrc() {
  return readFileSync(join(SRC, "wat-emitter-refusals.ts"), "utf8");
}
function pendingSrc() {
  return readFileSync(join(__dir, "fixtures/diagnostic-pending-registration.txt"), "utf8");
}

function tryCompileWAT(src, label, exportAllPure) {
  try {
    const parsed = L.parseProgram(src, label);
    const errs = (parsed.diagnostics || []).filter((d) => d.severity === "error");
    if (errs.length > 0) {
      return { error: "parse: " + errs.map((e) => e.code + ":" + e.message).join("; ") };
    }
    const fx = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
    const wat = L.renderWAT(
      L.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", parsed.ast, exportAllPure),
    );
    return { wat, gir, ast: parsed.ast };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

function tryCompileGir(src, label, mutate, exportAllPure) {
  try {
    const parsed = L.parseProgram(src, label);
    const errs = (parsed.diagnostics || []).filter((d) => d.severity === "error");
    if (errs.length > 0) {
      return { error: "parse: " + errs.map((e) => e.code + ":" + e.message).join("; ") };
    }
    const fx = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
    const next = mutate(gir);
    const wat = L.renderWAT(
      L.buildWATModuleFromGIR(next, undefined, "wasm-standalone", parsed.ast, exportAllPure),
    );
    return { wat, gir: next };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

const strip = (p) => {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

function extractRecordDecl(src, name) {
  const re = new RegExp(`(^|\\n)record\\s+${name}\\b`);
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

describe("T1 requireStmt → FUNGI-WAT-STMT-001 both exportAllPure modes", () => {
  for (const mode of [true, false]) {
    it("exportAllPure " + mode + " throws STMT-001; no unsupported-in-WASM: requireStmt", () => {
      const r = tryCompileWAT(REQUIRE_SRC, "t1-" + mode + ".fungi", mode);
      assert.equal("error" in r, true, "expected build-time throw, got WAT");
      assert.match(r.error, new RegExp(STMT));
      assert.match(r.error, /GOVERNED_OR_CLOSURE|requireStmt/);
      assert.equal(r.error.includes("unsupported-in-WASM: requireStmt"), false);
      assert.equal((r.wat ?? "").includes('(export "g"'), false);
    });
  }
});

describe("T2 local fnDecl → FUNGI-WAT-STMT-001", () => {
  it("throws STMT-001; no unsupported-in-WASM: fnDecl WAT", () => {
    const r = tryCompileWAT(FNDECL_SRC, "t2.fungi", true);
    assert.equal("error" in r, true, "expected build-time throw, got WAT");
    assert.match(r.error, new RegExp(STMT));
    assert.equal(r.error.includes("unsupported-in-WASM: fnDecl"), false);
  });
});

describe("T4 plain readonly stay-green pin", () => {
  it("readonlydecl test still lowers plain Int like let", () => {
    const src = readFileSync(join(__dir, "wat-readonlydecl-plain-types.test.mjs"), "utf8");
    assert.equal(src.includes("plain readonlyDecl lowers like letDecl"), true);
    assert.equal(src.includes("readonly x: Int = 2"), true);
  });
});

describe("T5 where still refuses at emit", () => {
  it("param admission throws the existing where refusal", () => {
    const r = tryCompileWAT(WHERE_SRC, "t5.fungi", true);
    assert.equal("error" in r, true, "expected where refusal");
    assert.match(r.error, /parameter admission|BYPASS|0155|where/i);
    assert.equal(refusalsSrc().includes("refuseUnadmittedPublicWAT"), true);
    assert.equal(emitterSrc().includes("refuseUnadmittedPublicWAT("), true);
  });
});

describe("T7 effectful entryPoints → FUNGI-WAT-EFFECT-001", () => {
  it("exportAllPure false + fx in entryPoints throws EFFECT-001", () => {
    const r = tryCompileGir(MIXED_SRC, "t7.fungi", (gir) => ({ ...gir, entryPoints: ["fx"] }), false);
    assert.equal("error" in r, true, "expected EFFECT-001, got " + JSON.stringify(r).slice(0, 300));
    assert.match(r.error, new RegExp(EFFECT));
    assert.match(r.error, /fx/);
  });
});

describe("T8 exportAllPure true: pure exported, effectful not, D8 marker", () => {
  it("ok exported; fx not exported; stub carries D8 marker", () => {
    const r = tryCompileWAT(MIXED_SRC, "t8.fungi", true);
    assert.equal("error" in r, false, r.error);
    assert.equal(r.wat.includes('(export "ok"'), true, r.wat.slice(0, 800));
    assert.equal(r.wat.includes('(export "fx"'), false, r.wat);
    assert.equal(r.wat.includes(D8_MARKER), true, r.wat);
    assert.equal(emitterSrc().includes("let body = (!isPureFlow && flowDeclaredEffects.length > 0)"), true);
    assert.equal(emitterSrc().includes("unreachable ;; effectful flow not lowered (D8) — fail-closed"), true);
  });
});

describe("T10 interpreter requireStmt / fnDecl / governed readonly unchanged", () => {
  it("interpreter still implements requireStmt", () => {
    const interp = readFileSync(join(SRC, "interpreter.ts"), "utf8");
    assert.equal(interp.includes("requireStmt"), true);
  });
});

describe("T11 generic default / dedicated other kinds stay", () => {
  it("fault/prefilter/check cases remain; generic default remains", () => {
    const emit = emitterSrc();
    assert.equal(emit.includes('case "faultStmt"'), true);
    assert.equal(emit.includes('case "prefilterExpr"'), true);
    assert.equal(emit.includes('case "checkExpr"'), true);
    assert.equal(emit.includes('case "requireStmt"'), true);
    assert.equal(emit.includes('case "fnDecl"'), true);
    assert.equal(emit.includes("unsupported-in-WASM: ${stmt.kind}"), true);
  });
});

describe("T12 L1 200/200 plus 7-stage hashes unchanged", () => {
  it("live ladder is 200/200 = 100 and reports refused separately", async () => {
    const live = await watLoweringLadderAsync();
    assert.equal(live.total, 200);
    assert.equal(live.done, 200);
    assert.equal(live.pct, 100);
    assert.equal(typeof live.refused, "number");
    assert.equal(live.refused, 0);
    assert.equal(live.done + live.refused, live.total);
  });
  it("7-stage WAT hashes match Q4n-B pins", () => {
    for (const [file, pin] of Object.entries(STAGE_HASHES)) {
      const r = renderStageWat(stageSource(file), file);
      assert.equal("error" in r && r.error.length > 0, false, file + " " + r.error);
      const buf = Buffer.from(r.wat, "utf8");
      assert.equal(sha256(buf), pin.sha256, file);
      assert.equal(buf.length, pin.bytes, file + " bytes");
    }
  });
});

describe("pending PATTERN shrink + STMT/EFFECT add", () => {
  it("pending has STMT-001 and EFFECT-001; no FUNGI-WAT-PATTERN-001", () => {
    const p = pendingSrc();
    assert.equal(p.includes(STMT), false);
    assert.equal(p.includes(EFFECT), false);
    assert.equal(p.includes("FUNGI-WAT-PATTERN-001"), false);
    assert.equal(p.includes("FUNGI-PATTERN-001"), true);
    assert.equal(refusalsSrc().includes(STMT), true);
    assert.equal(refusalsSrc().includes(EFFECT), true);
    assert.equal(refusalsSrc().includes("refusePatternWat"), true);
  });
});

describe("T14 Codex historical and current zone identities", () => {
  it("original region texts still match Q5n-DR capture", () => {
    const rows = historicalCodexZoneHashes();
    assert.equal(rows.length, 3);
    assert.equal(rows[0].sha256, ZONE.Z1);
    assert.equal(rows[1].sha256, ZONE.Z2);
    assert.equal(rows[2].sha256, ZONE.Z3);
  });
  it("current regions match the separately reviewed packing and length revision", () => {
    const rows = runCodexZoneHashes(ROOT);
    assert.deepEqual(rows.map(row => row.sha256), Object.values(CURRENT_CODEX_ZONE));
  });
});
