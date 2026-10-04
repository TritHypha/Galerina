/**
 * Q4n BUILD — D4 matchesPattern / extractGroups / replacePattern build-time refusal.
 * DESIGN-05N option (b) with Q4n-DR APPROVE_WITH_CHANGES retargets (T8/T10).
 * Replay: node --test --test-reporter=tap tests/wat-q4n-d4-pattern-refusal.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as L from "../dist/index.js";
import { watLoweringLadderAsync } from "../../../scripts/lib/wat-lowering-ladder.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "../src");
const SH = join(SRC, "self-hosted");
const ROOT = join(__dir, "../../..");
// The AGENTS checkout is a sibling repository: AGENTS_ROOT overrides (worktrees, CI); else ../AGENTS.
const AGENTS = typeof process.env.AGENTS_ROOT === "string" && process.env.AGENTS_ROOT.length > 0
  ? process.env.AGENTS_ROOT
  : join(ROOT, "..", "AGENTS");
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

const CODE = "FUNGI-WAT-PATTERN-001";
const NAME = "PATTERN_CAPABILITY_NOT_LOWERED";

function emitterSrc() {
  return readFileSync(join(SRC, "wat-emitter.ts"), "utf8");
}
function refusalsSrc() {
  return readFileSync(join(SRC, "wat-emitter-refusals.ts"), "utf8");
}
function pendingSrc() {
  return readFileSync(join(__dir, "fixtures/diagnostic-pending-registration.txt"), "utf8");
}
function c20TestSrc() {
  return readFileSync(join(__dir, "pattern-c20-capability.test.mjs"), "utf8");
}
function profileSrc() {
  return readFileSync(join(SRC, "profile-checker.ts"), "utf8");
}

function compileWAT(src, label = "q4n.fungi") {
  const parsed = L.parseProgram(src, label);
  const errs = (parsed.diagnostics || []).filter((d) => d.severity === "error");
  if (errs.length > 0) {
    throw new Error("parse: " + errs.map((e) => e.code + ":" + e.message).join("; "));
  }
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "q4n", parsed.ast, true));
}

function tryCompileWAT(src, label) {
  try {
    return { wat: compileWAT(src, label) };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) };
  }
}

function ctx() {
  return {
    recordEffect: () => {},
    resolveIdentifier: () => undefined,
    callFlow: async () => L.FUNGI_VOID,
    applyFn: async (_fn, arg) => arg,
  };
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

const LITERAL = `pure flow hasMatch(s: String) -> Bool
contract { effects {} }
{ return s.matchesPattern("^[a-z]+$") }
`;
const DYNAMIC = `pure flow hasMatch(s: String, p: String) -> Bool
contract { effects {} }
{ return s.matchesPattern(p) }
`;
const EXTRACT = `pure flow groups(s: String) -> String
contract { effects {} }
{ return s.extractGroups("^(a)$") }
`;
const REPLACE = `pure flow repl(s: String) -> String
contract { effects {} }
{ return s.replacePattern("a", "b") }
`;
// ZipPair GO 2026-10-02: Option<Int> zip now lowers; a Float payload is outside the i32 lane set and keeps METHOD-001.
const OPTION_ZIP = `pure flow z(a: Option<Float>) -> Option<Float>
contract { effects {} }
{ return a.zip(a) }
`;

describe("T1 literal matchesPattern: admitted lowers (D4 GO 2026-10-02); non-admitted → FUNGI-WAT-PATTERN-001", () => {
  it("admitted literal lowers to the bounded helper; no $matchesPattern / host pattern callee", () => {
    const r = tryCompileWAT(LITERAL, "t1.fungi");
    assert.equal("error" in r, false, r.error);
    assert.match(r.wat, /\(call \$fungi_pattern_match_[0-9a-f]{16} /);
    assert.equal(r.wat.includes("$host___matchesPattern"), false);
    assert.equal(/\(call \$matchesPattern\b/.test(r.wat), false);
  });
  it("non-admitted literal throws PATTERN-001; no $matchesPattern callee", () => {
    const r = tryCompileWAT(LITERAL.replace('"^[a-z]+$"', '"(a)"'), "t1b.fungi");
    assert.equal("error" in r, true, "expected build-time throw, got WAT");
    assert.match(r.error, new RegExp(CODE));
    assert.match(r.error, /literal pattern not admitted: FUNGI-PATTERN-002/);
    assert.equal(r.error.includes("$matchesPattern"), false);
    assert.equal(r.error.includes("$host___matchesPattern"), false);
  });
});

describe("T2 dynamic matchesPattern → FUNGI-WAT-PATTERN-001", () => {
  it("throws PATTERN-001 with dynamic wording", () => {
    const r = tryCompileWAT(DYNAMIC, "t2.fungi");
    assert.equal("error" in r, true, "expected build-time throw, got WAT");
    assert.match(r.error, new RegExp(CODE));
    assert.match(r.error, /C20: dynamic matchesPattern refused/);
    assert.equal(r.error.includes("FUNGI-WAT-METHOD-001"), false);
  });
});

describe("T3 extractGroups / replacePattern → PATTERN-001; Option.zip stays METHOD-001", () => {
  it("extractGroups is PATTERN-001 not METHOD-001", () => {
    const r = tryCompileWAT(EXTRACT, "t3e.fungi");
    assert.equal("error" in r, true, "expected build-time throw, got WAT");
    assert.match(r.error, new RegExp(CODE));
    assert.equal(r.error.includes("FUNGI-WAT-METHOD-001"), false);
  });
  it("replacePattern is PATTERN-001 not METHOD-001", () => {
    const r = tryCompileWAT(REPLACE, "t3r.fungi");
    assert.equal("error" in r, true, "expected build-time throw, got WAT");
    assert.match(r.error, new RegExp(CODE));
    assert.equal(r.error.includes("FUNGI-WAT-METHOD-001"), false);
  });
  it("Option.zip outside the i32 lane set stays METHOD-001", () => {
    const r = tryCompileWAT(OPTION_ZIP, "t3z.fungi");
    assert.equal("error" in r, true, "expected METHOD-001 throw");
    assert.match(r.error, /FUNGI-WAT-METHOD-001/);
    assert.equal(r.error.includes(CODE), false);
    assert.match(r.error, /ZipPair/);
  });
});

describe("T4 interpreter matchesPattern unchanged", () => {
  it("literal admitted is Bool; miss is Bool false", async () => {
    const hit = await L.callStdlib(
      "matchesPattern",
      { __tag: "string", value: "hello" },
      [{ __tag: "string", value: "^[a-z]+$" }],
      ctx(),
    );
    assert.equal(hit?.__tag, "bool");
    assert.equal(hit?.value, true);
    const miss = await L.callStdlib(
      "matchesPattern",
      { __tag: "string", value: "Hello" },
      [{ __tag: "string", value: "^[a-z]+$" }],
      ctx(),
    );
    assert.equal(miss?.__tag, "bool");
    assert.equal(miss?.value, false);
  });
});

describe("T5 interpreter extractGroups unchanged", () => {
  it("exact RegexError capture-spans message", async () => {
    const got = await L.callStdlib(
      "extractGroups",
      { __tag: "string", value: "a" },
      [{ __tag: "string", value: "^(a)$" }],
      ctx(),
    );
    assert.equal(got?.__tag, "err");
    const msg = typeof got?.error === "string" ? got.error : JSON.stringify(got);
    assert.match(String(msg), /RegexError: capture extraction is unsupported until certified capture spans exist/);
  });
});

describe("T6 C20 veto for word-boundary still err", () => {
  it("\\bword\\b stays err", async () => {
    const veto = await L.callStdlib(
      "matchesPattern",
      { __tag: "string", value: "word" },
      [{ __tag: "string", value: "\\bword\\b" }],
      ctx(),
    );
    assert.equal(veto?.__tag, "err");
  });
});

describe("T7 PROFILE-005B unchanged", () => {
  it("denyDynamicRegex true only for strict and high_integrity", () => {
    const src = profileSrc();
    assert.match(src, /strict:\s*\{[\s\S]*?denyDynamicRegex:\s*true/);
    assert.match(src, /high_integrity:\s*\{[\s\S]*?denyDynamicRegex:\s*true/);
    assert.match(src, /deterministic:\s*\{[\s\S]*?denyDynamicRegex:\s*false/);
    assert.equal(src.includes("FUNGI-PROFILE-005B"), true);
  });
});

describe("T8 pattern-c20 :96-111 retargeted to build-time refusal", () => {
  it("c20 test asserts PATTERN-001 throw; trap-text WAT includes are gone", () => {
    const src = c20TestSrc();
    assert.equal(src.includes(CODE), true);
    assert.equal(src.includes('wat.includes("C20: matchesPattern WAT ABI is not admitted")'), false);
    assert.equal(src.includes('wat.includes("C20: dynamic matchesPattern refused")'), false);
    assert.equal(src.includes("tryCompileWAT") || src.includes("assert.throws") || src.includes("error") && src.includes(CODE), true);
  });
});

describe("T9 no C20 run-time stub in wat-emitter.ts", () => {
  it("stub phrases absent from emitter; identity lives in refusals", () => {
    const emit = emitterSrc();
    const ref = refusalsSrc();
    assert.equal(emit.includes("WAT ABI is not admitted"), false);
    assert.equal(emit.includes("dynamic matchesPattern refused"), false);
    assert.equal(emit.includes("(unreachable) (; C20:"), false);
    assert.equal(ref.includes(CODE), true);
    assert.equal(ref.includes(NAME), true);
    assert.equal(ref.includes("C20:"), true);
    assert.equal(pendingSrc().includes(CODE), false);
    assert.equal(pendingSrc().includes("FUNGI-PATTERN-001"), true);
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
    assert.equal(live.done + live.refused, live.total);
  });
  it("7-stage WAT hashes match Q6-B pins", () => {
    for (const [file, pin] of Object.entries(STAGE_HASHES)) {
      const r = renderStageWat(stageSource(file), file);
      assert.equal("error" in r && r.error.length > 0, false, file + " " + r.error);
      const buf = Buffer.from(r.wat, "utf8");
      assert.equal(sha256(buf), pin.sha256, file);
      assert.equal(buf.length, pin.bytes, file + " bytes");
    }
  });
});

describe("T12 Codex zone hashes identical", () => {
  it("Z1/Z2/Z3 match DESIGN-05N capture", () => {
    const r = spawnSync(
      process.execPath,
      [join(AGENTS, "tools/grok-probe/q8-codex-zone-hash.mjs"), ROOT],
      { encoding: "utf8", cwd: AGENTS },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const rows = (r.stdout ?? "").trim().split(/\n/).filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(rows.length, 3);
    assert.equal(rows[0].sha256, ZONE.Z1);
    assert.equal(rows[1].sha256, ZONE.Z2);
    assert.equal(rows[2].sha256, ZONE.Z3);
  });
});
