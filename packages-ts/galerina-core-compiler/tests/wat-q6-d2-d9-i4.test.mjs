/**
 * Q6 BUILD — D2 refusal≠done + D9 INT64-001 + I4 step: wording.
 * DESIGN-07 §3 with Q6-DR APPROVE_WITH_CHANGES retargets (T1/T3/T5/T7/T8).
 * Replay: node --test --test-reporter=tap tests/wat-q6-d2-d9-i4.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as L from "../dist/index.js";
import { deriveLadder, bodyIsRefused, watLoweringLadderAsync } from "../../../scripts/lib/wat-lowering-ladder.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "../src");
const SH = join(SRC, "self-hosted");
const ROOT = join(__dir, "../../..");
const EXAMPLES = join(ROOT, "examples");
const DOCS = join(ROOT, "docs");
const MARKER = "emitter cannot lower";
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const EMITTER_AFTER = "77fa9e53de89816e3ee9b10a4cda67d76d584b0195b330f9367feb0e48b8fdf7";
const STACKED_EMITTER = "62f53d58b86ac8e0158428c37061b78d332cefa5466205bb5cd142f209e3a0eb";

const STAGE_HASHES = {
  "lexer.fungi": { sha256: "5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7", bytes: 425985 },
  "parser.fungi": { sha256: "5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7", bytes: 425985 },
  "type-checker.fungi": { sha256: "1be2bfd57e0c06dd8bdae2c72822660e9817bc488392c581c5a71cead021d97f", bytes: 593181 },
  "effect-checker.fungi": { sha256: "95227de9bdb61d5706bf70aa81d0efc0361c45cff9ef332017535e4dbdee1b02", bytes: 507412 },
  "governance-verifier.fungi": { sha256: "3a6a3745b76747949836c90aab51392b3c3dc208b54dc3d633722b02ea2a6819", bytes: 466103 },
  "gir-emitter.fungi": { sha256: "f7511e57de512542481177e63e2a21c3459339ee12456a82516be9e8c6180b43", bytes: 481889 },
  "runtime.fungi": { sha256: "d615ca94bfacd55564b0ffdefc73ce1923d9186756f50c2baa701cf22ae7c4a1", bytes: 536554 },
};

const CLASS_A_SNIPPETS = [
  "unresolved: ${name} — fail-closed (emitter cannot lower; #128-sibling)",
  "unknown Verdict member '${memberName}' — fail-closed (emitter cannot lower)",
  "unresolved record base: ${receiverNode.value ?? \"\"} — fail-closed (emitter cannot lower; #163)",
  "unresolved member: ${memberName} — fail-closed (emitter cannot lower; #128-sibling)",
  "#165: i32-only op over float operand — fail-closed (emitter cannot lower)",
  "unknown op: ${op} — fail-closed (emitter cannot lower; #128-sibling)",
  "unknown unary: ${op} — fail-closed (emitter cannot lower; #128-sibling)",
  "#record: field .${foreign.value ?? \"?\"} not in declared layout of ${declaredTypeName} — fail-closed (#32) (emitter cannot lower)",
  "#record-update: base type unknown — fail-closed (emitter cannot lower; #163)",
  "isPositive namespace shadowed by lexical binding — fail closed (emitter cannot lower)",
  "A2: '${name}' is a stdlib/Money constructor not yet lowered to a host import — fail-closed (task #163-A2) (emitter cannot lower)",
  "empty match — fail-closed (malformed; emitter cannot lower; #128-sibling)",
  "unhandled: ${node.kind} — fail-closed (emitter cannot lower; #128-sibling)",
  "unresolved block expr — fail-closed (emitter cannot lower block tail; #128-sibling)",
  "readonlyDecl+governed ${governedMarker} — fail-closed trap, not lowered to WAT (emitter cannot lower)",
  "unsupported-in-WASM: ${stmt.kind} — fail-closed trap (task #128), not yet lowered to WAT (emitter cannot lower)",
  "capability call — Phase 25 (emitter cannot lower)",
  "unreachable ;; emitter cannot lower",
  "Phase 25: empty body — fail-closed (emitter cannot lower → falls back to walker)",
  "Phase 25: no AST node found — fail-closed (emitter cannot lower → falls back to walker)",
  "Phase 25: no body info available — fail-closed (emitter cannot lower → falls back to walker)",
];

const D9_DETAILS = [
  "mixed UInt64×non-UInt64; sign promotion is not lowered",
  "i32-only op over UInt64 operand",
  "i32-only op over Int64 operand",
];

function emitterSrc() {
  return readFileSync(join(SRC, "wat-emitter.ts"), "utf8");
}
function refusalsSrc() {
  return readFileSync(join(SRC, "wat-emitter-refusals.ts"), "utf8");
}
function interpSrc() {
  return readFileSync(join(SRC, "interpreter.ts"), "utf8");
}
function docsGov() {
  return readFileSync(join(DOCS, "language/fungi/06-governance-constructs.md"), "utf8");
}
function linesOf(s) {
  return s.split(/\r?\n/);
}

function compileWAT(src, label = "q6.fungi") {
  const parsed = L.parseProgram(src, label);
  const errs = (parsed.diagnostics || []).filter((d) => d.severity === "error");
  if (errs.length > 0) {
    const err = new Error("parse: " + errs.map((e) => e.code + ":" + e.message).join("; "));
    err.parseErrors = errs;
    throw err;
  }
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "q6", parsed.ast, true));
}

function tryCompileWAT(src, label) {
  try {
    return { wat: compileWAT(src, label) };
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

function countUnlowered(wat) {
  let n = 0;
  for (const line of wat.split("\n")) {
    let i = 0;
    while ((i = line.indexOf(MARKER, i)) !== -1) {
      n++;
      i += MARKER.length;
    }
  }
  return n;
}

function walkFiles(dir, acc, depth, pred) {
  if (depth > 6) return;
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkFiles(p, acc, depth + 1, pred);
    else if (pred(name, p)) acc.push(p);
  }
}

function parseTap(raw) {
  const text = String(raw ?? "").replace(/\r/g, "");
  const tests = /# tests\s+(\d+)/.exec(text);
  const pass = /# pass\s+(\d+)/.exec(text);
  const fail = /# fail\s+(\d+)/.exec(text);
  return {
    tests: tests ? Number(tests[1]) : -1,
    pass: pass ? Number(pass[1]) : -1,
    fail: fail ? Number(fail[1]) : -1,
    notOk: [...text.matchAll(/^not ok .+$/gm)].map((m) => m[0]),
  };
}

describe("T1 classification table (stacked 52 → after-product)", () => {
  it("stacked pin 8208236c is the pre-product emitter; after-hash is this job", () => {
    assert.equal(STACKED_EMITTER.length, 64);
    assert.equal(sha256(readFileSync(join(SRC, "wat-emitter.ts"))), EMITTER_AFTER);
    assert.notEqual(EMITTER_AFTER, STACKED_EMITTER);
  });

  it("D9 three sites are INT64-001 throws, not unreachable stubs", () => {
    const src = emitterSrc();
    for (const detail of D9_DETAILS) {
      assert.equal(src.includes(`refuseMixed64BitWat(op, \`${detail}\`)`), true, detail);
    }
    assert.equal(src.includes("the walker handles it"), false);
    const refusals = refusalsSrc();
    assert.equal(refusals.includes("FUNGI-WAT-INT64-001"), true);
    assert.equal(refusals.includes("MIXED_64BIT_OP_NOT_LOWERED"), true);
    assert.equal(refusals.includes("KB registration is an owner/KB step before carry"), true);
  });

  it("remaining class-A stubs embed exact marker emitter cannot lower", () => {
    const src = emitterSrc();
    for (const snip of CLASS_A_SNIPPETS) {
      assert.equal(src.includes(snip), true, snip.slice(0, 80));
      assert.equal(snip.includes(MARKER), true, "snippet itself carries the marker");
    }
    assert.equal(src.includes('let body = "unreachable"'), false);
    assert.equal(src.includes("let body = (!isPureFlow && flowDeclaredEffects.length > 0)"), true);
    assert.equal(src.includes("unreachable ;; effectful flow not lowered (D8) — fail-closed"), true);
    assert.equal(src.includes("C20: matchesPattern WAT ABI is not admitted"), false);
    assert.equal(src.includes("refusePatternWat"), true);
    assert.equal(src.includes("refuseUnknownMethodWat"), true);
    assert.equal(refusalsSrc().includes("FUNGI-WAT-PATTERN-001"), true);
  });

  it(":818 comment-not-opcode; uncommented opcode sites listed (binary B, loop-fuel B, bare sentinels A)", () => {
    const emitLines = linesOf(emitterSrc());
    const helperComment = emitLines.find((l) => l.includes("strict-trapping checked helper") && l.includes("traps (unreachable)"));
    assert.equal(typeof helperComment, "string");
    assert.equal(/^\s*lines\.push\(`\s*;; /.test(helperComment), true, helperComment);
    assert.equal(helperComment.includes("then unreachable"), false);
    const loopFuel = emitLines.find((l) => l.includes("WAT_LOOP_FUEL_CAP") && l.includes("then unreachable"));
    assert.equal(typeof loopFuel, "string");
    assert.equal(loopFuel.includes(MARKER), false);
    const binary = readFileSync(join(SRC, "wat-emitter-binary.ts"), "utf8");
    const thenUnreach = [...binary.matchAll(/\(then unreachable\)/g)];
    assert.equal(thenUnreach.length, 10);
    const renderFallback = emitLines.find((l) => l.includes("unreachable ;; emitter cannot lower") && l.includes("lines.push"));
    assert.equal(typeof renderFallback, "string");
  });

  it("stacked 52 comment-unmarked (Q6-DR) dropped unknown-method; after product remaining A are marked", () => {
    // Q6-DR OBSERVED_TEST on stacked 8208236c: 52 comment-unmarked (17 A originally, minus
    // unknown-method already a METHOD-001 throw after Q3-B = 16 A in the 52, plus :818
    // comment-not-opcode, plus 35 B). After this job the three D9 A sites are throws.
    const stacked = {
      commentUnmarked: 52,
      classA: 16,
      classB: 35,
      commentNotOpcode: 1,
      unknownMethodDroppedByQ3B: true,
    };
    assert.equal(stacked.commentUnmarked, stacked.classA + stacked.classB + stacked.commentNotOpcode);
    const src = emitterSrc();
    assert.equal(src.includes("(unreachable) (; unknown method"), false);
    assert.equal(src.includes("refuseMixed64BitWat"), true);
  });
});

describe("T2 ladder self-test class-A-only flow done/not-done", () => {
  it("body without exact marker scores done; body with marker is refused; refused not added to done", () => {
    assert.equal(bodyIsRefused("(unreachable) (; C20: matchesPattern WAT ABI is not admitted ;)"), false);
    assert.equal(bodyIsRefused("(unreachable) (; C20: matchesPattern WAT ABI is not admitted (emitter cannot lower) ;)"), true);
    const r = deriveLadder({ lowered: ["a", "b"], unlowered: ["c"] });
    assert.equal(r.done, 2);
    assert.equal(r.refused, 1);
    assert.equal(r.total, 3);
    assert.equal(r.done + r.refused, r.total);
  });

  it("ladder --self-test stays green", () => {
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/lib/wat-lowering-ladder.mjs"), "--self-test"], {
      encoding: "utf8",
      cwd: ROOT,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal((r.stdout ?? "").includes("T2 red-today"), true);
    assert.equal((r.stdout ?? "").includes("T2 green"), true);
  });
});

describe("T3 L1 stacked 200/200 plus refused:N", () => {
  it("live ladder is 200/200 = 100 and reports refused separately", async () => {
    const live = await watLoweringLadderAsync();
    assert.equal(live.total, 200);
    assert.equal(live.done, 200);
    assert.equal(live.pct, 100);
    assert.equal(typeof live.refused, "number");
    assert.equal(live.refused, 0);
    assert.equal(live.done + live.refused, live.total);
  });
});

describe("T4 same-lib consumers", () => {
  it("audit-percent-evidence and component-health import wat-lowering-ladder.mjs", () => {
    const audit = readFileSync(join(ROOT, "scripts/audit-percent-evidence.mjs"), "utf8");
    const health = readFileSync(join(ROOT, "scripts/component-health.mjs"), "utf8");
    assert.equal(audit.includes('from "./lib/wat-lowering-ladder.mjs"'), true);
    assert.equal(health.includes('from "./lib/wat-lowering-ladder.mjs"'), true);
    assert.equal(audit.includes("watLoweringLadder()"), true);
    assert.equal(health.includes("watLoweringLadder()"), true);
  });
});

describe("T5 mixed / i32-only-over-64-bit → INT64-001; fixtures flip list", () => {
  const mixedSrc = `pure flow mix(a: UInt64, b: Int) -> UInt64
contract { effects {} }
{ return a + b }
`;
  const mixedLit = `pure flow mix(a: UInt64) -> UInt64
contract { effects {} }
{ return a + 1 }
`;

  it("mixed UInt64×Int is type-ok and INT64-001 at WAT emit", () => {
    const parsed = L.parseProgram(mixedSrc, "t5-mix.fungi");
    const typeErrs = L.checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error");
    assert.equal(typeErrs.length, 0, typeErrs.map((d) => d.code + ":" + d.message).join(" | "));
    const r = tryCompileWAT(mixedSrc, "t5-mix.fungi");
    assert.equal(typeof r.error, "string", "must refuse at emit");
    assert.equal(r.error.includes("FUNGI-WAT-INT64-001"), true, r.error);
    assert.equal(r.error.includes("MIXED_64BIT_OP_NOT_LOWERED") || r.error.includes("mixed UInt64"), true, r.error);
  });

  it("mixed UInt64×literal Int is INT64-001 at WAT emit", () => {
    const r = tryCompileWAT(mixedLit, "t5-mix-lit.fungi");
    assert.equal(typeof r.error, "string");
    assert.equal(r.error.includes("FUNGI-WAT-INT64-001"), true, r.error);
  });

  it("interpreter mixed UInt64×Int still returns the sum (unchanged)", async () => {
    const parsed = L.parseProgram(mixedSrc, "t5-mix-interp.fungi");
    const res = await L.executeFlow("mix", new Map([
      ["a", { __tag: "uint64", value: 2n }],
      ["b", { __tag: "int", value: 3 }],
    ]), parsed.ast);
    assert.equal(res.value.__tag, "uint64");
    assert.equal(res.value.value, 5n);
    assert.equal(res.executionTier, "tree");
  });

  it("i32-only-over-64-bit throw sites exist; bitwise is PARSE-001 so .fungi cannot hit them", () => {
    const src = emitterSrc();
    assert.equal(src.includes("i32-only op over UInt64 operand"), true);
    assert.equal(src.includes("i32-only op over Int64 operand"), true);
    const r = tryCompileWAT(`pure flow band(a: UInt64, b: UInt64) -> UInt64
contract { effects {} }
{ return a & b }
`, "t5-band.fungi");
    assert.equal(typeof r.error, "string");
    assert.equal(r.error.includes("FUNGI-PARSE-001"), true, r.error);
  });

  it("refuseMixed64BitWat throws named INT64-001", async () => {
    const R = await import("../dist/wat-emitter-refusals.js");
    let msg = "";
    try {
      R.refuseMixed64BitWat("&", "i32-only op over UInt64 operand");
    } catch (e) {
      msg = String(e && e.message ? e.message : e);
    }
    assert.equal(msg.includes("FUNGI-WAT-INT64-001"), true, msg);
    assert.equal(msg.includes("i32-only op over UInt64 operand"), true, msg);
  });

  it("lists every examples/fixtures program that flips builds→INT64-001", () => {
    const files = [];
    if (existsSync(EXAMPLES)) walkFiles(EXAMPLES, files, 0, (n) => n.endsWith(".fungi"));
    walkFiles(join(__dir), files, 0, (n) => n.endsWith(".fungi"));
    walkFiles(join(ROOT, "packages-ts/galerina-core-compiler/src/self-hosted"), files, 0, () => false);
    const flips = [];
    for (const f of files) {
      let src;
      try { src = readFileSync(f, "utf8"); } catch { continue; }
      if (src.length > 200000) continue;
      if (!/UInt64|Int64/.test(src)) continue;
      const r = tryCompileWAT(src, f);
      if (typeof r.error === "string" && r.error.includes("FUNGI-WAT-INT64-001")) {
        flips.push(f.slice(ROOT.length + 1).replaceAll("\\", "/"));
      }
    }
    console.log("T5 scanned " + files.length + " .fungi; INT64-001 flips " + flips.length + " " + JSON.stringify(flips));
    assert.deepEqual(flips, []);
  });
});

describe("T6 both-UInt64 keep checked-helper lowering", () => {
  it("+ / - / * lower to fungi_checked_*_u64", () => {
    const add = compileWAT(`pure flow add(a: UInt64, b: UInt64) -> UInt64
contract { effects {} }
{ return a + b }
`);
    assert.equal(add.includes("$fungi_checked_add_u64"), true, add);
    assert.equal(add.includes("FUNGI-WAT-INT64-001"), false);
    const sub = compileWAT(`pure flow sub(a: UInt64, b: UInt64) -> UInt64
contract { effects {} }
{ return a - b }
`);
    assert.equal(sub.includes("$fungi_checked_sub_u64"), true);
    const mul = compileWAT(`pure flow mul(a: UInt64, b: UInt64) -> UInt64
contract { effects {} }
{ return a * b }
`);
    assert.equal(mul.includes("$fungi_checked_mul_u64"), true);
  });

  it("interpreter both-UInt64 add is 2+3=5", async () => {
    const parsed = L.parseProgram(`pure flow add(a: UInt64, b: UInt64) -> UInt64
contract { effects {} }
{ return a + b }
`, "t6.fungi");
    const res = await L.executeFlow("add", new Map([
      ["a", { __tag: "uint64", value: 2n }],
      ["b", { __tag: "uint64", value: 3n }],
    ]), parsed.ast);
    assert.equal(res.value.__tag, "uint64");
    assert.equal(res.value.value, 5n);
  });
});

describe("T7 honesty pin nested Interpreter shares host state", () => {
  it("step:* wording is SIMULATED; runNestedFlow shares enforcer/capabilityHost/runtimeOptions/stepBudget; drcm.dwi_allocated; stdlib :1512/:1557", () => {
    const src = interpSrc();
    const ls = linesOf(src);
    // 2026-10-02: line indices moved by the real I2/I3 interpreter hunks (+156 / +40 lines, incl. the 2026-10-02 code-conformance import and the SuperGrok NB-1 classification type; re-pinned again after the replay onto main 0d06d6c1, and +3 for the R-I2-12 fast-path deadline check); content unchanged.
    assert.equal(ls[3382].includes("isolation is SIMULATED"), true, ls[3382]);
    assert.equal(ls[3382].includes("shared enforcer, capability host and step budget"), true, ls[3382]);
    const stepBlock = src.slice(src.indexOf("`step:flowName(args)`"), src.indexOf("`step:flowName(args)`") + 900);
    assert.equal(stepBlock.includes("isolation is simulated"), true);
    assert.equal(stepBlock.includes("drcm.dwi_allocated"), true);
    assert.equal(stepBlock.includes("runNestedFlow"), true);
    const nested = src.slice(src.indexOf("private async runNestedFlow"), src.indexOf("private async runNestedFlow") + 1800);
    assert.equal(nested.includes("new Interpreter(this.ast, this.knownFlows, this.enforcer, this.capabilityHost, this.runtimeOptions"), true);
    assert.equal(nested.includes("nested.stepBudget = this.stepBudget"), true);
    assert.equal(ls[1563].includes("sub.stepBudget = this.stepBudget"), true, ls[1563]);
    assert.equal(ls[1608].includes("sub.stepBudget = this.stepBudget"), true, ls[1608]);
  });
});

describe("T8 docs grep simulated/intended in the same paragraph", () => {
  it("06-governance-constructs.md:237 is intended/simulates in-paragraph", () => {
    const line = linesOf(docsGov())[236];
    assert.equal(line.includes("step call(...)"), true, line);
    assert.equal(/intended/i.test(line), true, line);
    assert.equal(/simulates/i.test(line), true, line);
    assert.equal(line.includes("shared-nothing"), true, line);
  });

  it("no docs/language paragraph claims step isolation as present fact without simulated/intended", () => {
    const files = [];
    walkFiles(join(DOCS, "language"), files, 0, (n) => n.endsWith(".md"));
    const bad = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      const paras = text.split(/\n\s*\n/);
      for (const p of paras) {
        if (!/`step|step call|step:/i.test(p)) continue;
        if (!/shared-nothing|isolate/i.test(p)) continue;
        if (/RD-0530/.test(p)) continue;
        const claimsPresent = /\b(invokes|runs|creates|is)\b.*\b(shared-nothing|isolate)\b/i.test(p)
          || /\bshared-nothing DWI isolate\b/i.test(p);
        const hasHedge = /simulat|intended|later|in progress|deferred|still being/i.test(p);
        if (claimsPresent && !hasHedge) {
          bad.push(f.slice(ROOT.length + 1).replaceAll("\\", "/") + ": " + p.replace(/\s+/g, " ").slice(0, 160));
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});

describe("T9 7-stage WAT hashes unchanged vs stacked Q3-B", () => {
  const stages = Object.keys(STAGE_HASHES);
  for (const file of stages) {
    it(`stage ${file} hash+bytes match stacked`, () => {
      const r = renderStageWat(stageSource(file), "q6-" + file);
      assert.equal(r.error, undefined, file + " " + r.error);
      const h = sha256(r.wat);
      const bytes = Buffer.byteLength(r.wat);
      const unlowered = countUnlowered(r.wat);
      console.log("T9 " + file + " sha256 " + h + " bytes " + bytes + " unlowered " + unlowered);
      assert.equal(h, STAGE_HASHES[file].sha256);
      assert.equal(bytes, STAGE_HASHES[file].bytes);
      assert.equal(unlowered, 0);
    });
  }
});

describe("T10 stay-green ×2 vs stacked baseline", () => {
  const suites = [
    { name: "q3", file: "wat-q3-d3-unknown-method.test.mjs", tests: 28 },
    { name: "method-chain", file: "type-checker-method-chain.test.mjs", tests: 7 },
    { name: "c02-decimal-hof", file: "wat-c02-decimal-hof.test.mjs", tests: 10 },
    { name: "c02-hof-refusal", file: "wat-c02-hof-refusal.test.mjs", tests: 10 },
    { name: "precision", file: "value-state-secret-source-precision.test.mjs", tests: 24 },
    { name: "secret006", file: "wat-secret006-runtime-stage.test.mjs", tests: 6 },
    { name: "q2", file: "wat-q2-parked7-d5.test.mjs", tests: 16 },
  ];

  function runSuite(file) {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_TEST_NAME_PATTERN;
    const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", join(__dir, file)], {
      encoding: "utf8",
      cwd: join(__dir, ".."),
      maxBuffer: 32 * 1024 * 1024,
      env,
    });
    const tap = parseTap((r.stdout ?? "") + (r.stderr ?? ""));
    return { status: r.status, tap, stdout: (r.stdout ?? "").slice(-2500), stderr: (r.stderr ?? "").slice(0, 500) };
  }

  for (const suite of suites) {
    it(`${suite.name} run 1 stay-green`, () => {
      const r = runSuite(suite.file);
      assert.equal(r.tap.fail, 0, suite.name + " fail status=" + r.status + " tap=" + JSON.stringify(r.tap) + " " + r.stdout.slice(-800) + r.stderr);
      assert.equal(r.tap.pass >= suite.tests, true, suite.name + " pass " + r.tap.pass + " expected>=" + suite.tests);
    });
    it(`${suite.name} run 2 stay-green`, () => {
      const r = runSuite(suite.file);
      assert.equal(r.tap.fail, 0, suite.name + " fail2 " + JSON.stringify(r.tap.notOk));
      assert.equal(r.tap.pass >= suite.tests, true, suite.name + " pass2 " + r.tap.pass);
    });
  }
});
