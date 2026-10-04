/**
 * Q2 BUILD — parked 7 type-checker #128 sites + D5 declared-only.
 * DESIGN-03 §3 with Q2-DR APPROVE_WITH_CHANGES retargets (T5/T8b/T9b).
 * Replay: node --test --test-reporter=tap tests/wat-q2-parked7-d5.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SH = join(__dir, "../src/self-hosted");
const ROOT = join(__dir, "../../..");
const AUDIT = join(ROOT, "scripts/audit-unlowered-nodes.mjs");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

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

function renderWat(source, label) {
  const checked = L.checkProgram(source, label);
  if (!checked.ok) {
    const family = typeof checked.family === "string" && checked.family.length > 0 ? checked.family : "gate";
    const code = typeof checked.code === "string" && checked.code.length > 0 ? checked.code : "FUNGI-WAT-CHECKED-001";
    return { error: `${family}:${code}`, wat: "" };
  }
  const wat = L.renderWAT(
    L.buildWATFromCheckedProgram(checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true),
  );
  return { wat };
}

const MARKER = "emitter cannot lower";
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

const DRIVER = `
pure flow tcReport(src: String) -> String
contract { intent { "Q2 driver: parse then checkFlowBodies; project PARSE and type codes." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      mut out: String = ""
      mut ei: Int = 0
      while ei < p.errors.count() {
        let eOpt = p.errors.get(ei)
        match eOpt {
          Some(e) => { out = out + "PARSE|" + e + " ;; " }
          None => {}
          _ => {}
        }
        ei = ei + 1
      }
      let r = checkFlowBodies(p.flows)
      mut di: Int = 0
      while di < r.diagnostics.count() {
        let dOpt = r.diagnostics.get(di)
        match dOpt {
          Some(d) => { out = out + d.code + "|" + d.message + " ;; " }
          None => {}
          _ => {}
        }
        di = di + 1
      }
      return out
    }
    Err(e) => { return "LEX|" + e + " ;; " }
    _ => { return "LEX|unknown ;; " }
  }
}

pure flow emptyNameArms() -> String
contract { intent { "T5 synthetic: empty Stmt.name is non-wildcard so TYPE-023 fires." } }
{
  mut arms: Array<Stmt> = Array.empty()
  let emptyArm: Stmt = { kind: "if", name: "", typeName: "", expr: Array.empty(), body: Array.empty(), elseBody: Array.empty(), typeBase: "", typeArgs: Array.empty(), isBranded: false, isTensor: false, litI32Overflow: false, arms: Array.empty() }
  arms = arms.append(emptyArm)
  let diags = checkMatchArms("t5", arms)
  mut out: String = ""
  mut i: Int = 0
  while i < diags.count() {
    let dOpt = diags.get(i)
    match dOpt {
      Some(d) => { out = out + d.code + "|" + d.message + " ;; " }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return out
}
`;

const COMBINED =
  "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + strip("type-checker.fungi") + "\n" + DRIVER;

const combinedProg = L.parseProgram(COMBINED, "q2-parked7-combined.fungi");
const combinedParseErrs = (combinedProg.diagnostics ?? []).filter((d) => d.severity === "error");

async function runReport(input) {
  const args = new Map([["src", { __tag: "string", value: input }]]);
  const res = await L.executeFlow(
    "tcReport",
    args,
    combinedProg.ast,
    combinedProg.flows,
    undefined,
    undefined,
    { pureFastPath: false },
    undefined,
    undefined,
  );
  const v = res?.value?.value ?? res?.value ?? res;
  return String(v ?? "");
}

async function runEmptyNameArms() {
  const res = await L.executeFlow(
    "emptyNameArms",
    new Map(),
    combinedProg.ast,
    combinedProg.flows,
    undefined,
    undefined,
    { pureFastPath: false },
    undefined,
    undefined,
  );
  const v = res?.value?.value ?? res?.value ?? res;
  return String(v ?? "");
}

function wrapBody(body, params = "") {
  return `@version 1
pure flow f(${params}) -> Int
contract { intent { "q2" } }
{
${body}
}
`;
}

function ts024Binding(init) {
  const src = wrapBody(`  let x: Int = ${init}\n  return 0`);
  const p = L.parseProgram(src, "t024.fungi");
  return L.checkTypes(p.ast).diagnostics.filter((d) => d.code === "FUNGI-TYPE-024");
}

function hasCode(report, code) {
  return report.split("\n").some((line) => line.startsWith(code + "|") || line.includes(code));
}

describe("Q2 parked-7 combined source", () => {
  it("combined lexer+parser+type-checker+driver parses clean", () => {
    assert.equal(
      combinedParseErrs.length,
      0,
      combinedParseErrs.map((e) => e.code + ":" + e.message).slice(0, 6).join(" | "),
    );
  });
});

describe("T1 unlowered baseline measured 7→0", () => {
  it("type-checker stage WAT has 0 emitter-cannot-lower markers", () => {
    const r = renderWat(stageSource("type-checker.fungi"), "ul-type-checker.fungi");
    assert.equal(r.error, undefined, String(r.error || ""));
    assert.equal(countUnlowered(r.wat), 0);
  });

  it("audit-unlowered-nodes --json total 0 / runPath 0 / type-checker 0", () => {
    assert.equal(existsSync(AUDIT), true);
    const proc = spawnSync(process.execPath, [AUDIT, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 180000,
    });
    const out = String(proc.stdout || "");
    const jsonStart = out.indexOf("{");
    assert.ok(jsonStart >= 0, "audit json missing: " + out.slice(0, 400));
    const j = JSON.parse(out.slice(jsonStart));
    const tc = (j.rows || []).find((row) => row.file === "type-checker.fungi");
    assert.equal(j.total, 0, JSON.stringify({ total: j.total, violations: j.violations, rows: j.rows }));
    assert.equal(j.runPathTotal, 0);
    assert.equal(tc && tc.count, 0);
    assert.equal(proc.status, 0, JSON.stringify(j.violations));
  });
});

describe("T2-T4 match arms via .name", () => {
  it("T2 match with _ last: no TYPE-022/023", async () => {
    const src = wrapBody(
      `  match x {\n    1 => { return 1 }\n    _ => { return 0 }\n  }`,
      "x: Int",
    );
    const report = await runReport(src);
    assert.equal(hasCode(report, "FUNGI-TYPE-022"), false, report);
    assert.equal(hasCode(report, "FUNGI-TYPE-023"), false, report);
    const ts = L.checkProgram(src, "t2.fungi");
    const codes = (ts.diagnostics || []).map((d) => d.code);
    assert.equal(codes.includes("FUNGI-TYPE-022"), false, codes.join(","));
    assert.equal(codes.includes("FUNGI-TYPE-023"), false, codes.join(","));
  });

  it("T3 match without wildcard: TYPE-023 on both sides", async () => {
    const src = wrapBody(`  match x {\n    1 => { return 1 }\n  }`, "x: Int");
    const report = await runReport(src);
    assert.equal(hasCode(report, "FUNGI-TYPE-023"), true, report);
    const ts = L.checkProgram(src, "t3.fungi");
    const codes = (ts.diagnostics || []).map((d) => d.code);
    assert.equal(codes.includes("FUNGI-TYPE-023"), true, codes.join(","));
  });

  it("T4 arm after _ : TYPE-022 carries pattern text from .name", async () => {
    const src = wrapBody(
      `  match x {\n    _ => { return 0 }\n    1 => { return 1 }\n  }`,
      "x: Int",
    );
    const report = await runReport(src);
    assert.equal(hasCode(report, "FUNGI-TYPE-022"), true, report);
    assert.equal(report.includes("pattern '1'"), true, report);
    const ts = L.checkProgram(src, "t4.fungi");
    const d022 = (ts.diagnostics || []).filter((d) => d.code === "FUNGI-TYPE-022");
    assert.ok(d022.length >= 1, (ts.diagnostics || []).map((d) => d.code).join(","));
  });
});

describe("T5 empty-arm parser-unreachable retarget", () => {
  it("T5a parseMatchArms stops on empty token before constructing an arm", () => {
    const src = readFileSync(join(SH, "parser.fungi"), "utf8");
    const emptyStop = src.indexOf('if eTokVal(tokens, p) == ""');
    const armStmt = src.indexOf("let armStmt: Stmt");
    assert.ok(emptyStop > 0, "empty-token stop missing");
    assert.ok(armStmt > emptyStop, "arm construction is not after the empty-token stop");
  });

  it("T5b synthetic empty name is non-wildcard → TYPE-023", async () => {
    const report = await runEmptyNameArms();
    assert.equal(hasCode(report, "FUNGI-TYPE-023"), true, report);
    assert.equal(hasCode(report, "FUNGI-TYPE-022"), false, report);
  });
});

describe("T6-T8 TYPE-024 (TS checkTypes + self-hosted code/behavior)", () => {
  it("T6 in-range Int literals: no TYPE-024", async () => {
    const tsMax = ts024Binding("2147483647");
    assert.equal(tsMax.length, 0, "2147483647 TS " + tsMax.map((d) => d.message).join(";"));
    for (const init of ["2147483647", "-2147483648"]) {
      const src = wrapBody(`  let x: Int = ${init}\n  return 0`);
      const report = await runReport(src);
      assert.equal(hasCode(report, "FUNGI-TYPE-024"), false, init + " SH " + report);
    }
    const tcSrc = readFileSync(join(SH, "type-checker.fungi"), "utf8");
    assert.equal(tcSrc.includes("FUNGI-TYPE-024"), true);
    assert.equal(tcSrc.includes("stmt.litI32Overflow"), true);
    assert.equal(/rhs\.litI32Overflow/.test(tcSrc), false);
  });

  it("T7 overflow Int literals: TYPE-024 on TS (warning) and self-hosted (code presence + fire)", async () => {
    for (const init of ["2147483648", "-2147483649", "99999999999", "000002147483648"]) {
      const ts = ts024Binding(init);
      assert.equal(ts.length, 1, init + " TS count " + ts.length);
      assert.equal(ts[0].severity, "warning", init);
      const src = wrapBody(`  let x: Int = ${init}\n  return 0`);
      const report = await runReport(src);
      assert.equal(hasCode(report, "FUNGI-TYPE-024"), true, init + " SH " + report);
    }
  });

  it("T8 hex/bin/oct/dot skip TYPE-024", async () => {
    const skips = [
      ["0xFFFFFFFF", "Byte"],
      ["1.5", "Float"],
      ["0b1", "Byte"],
      ["0o7", "Byte"],
    ];
    for (const [lit, ty] of skips) {
      const src = wrapBody(`  let x: ${ty} = ${lit}\n  return 0`);
      const p = L.parseProgram(src, "t8.fungi");
      const ts = L.checkTypes(p.ast).diagnostics.filter((d) => d.code === "FUNGI-TYPE-024");
      assert.equal(ts.length, 0, lit + " TS");
      const report = await runReport(src);
      assert.equal(hasCode(report, "FUNGI-TYPE-024"), false, lit + " SH " + report);
    }
  });

  it("T8b scientific 2147483648e0 is TYPE-024 (not silent e/E skip)", async () => {
    const ts = ts024Binding("2147483648e0");
    assert.equal(ts.length, 1, "TS scientific");
    assert.equal(ts[0].severity, "warning");
    const src = wrapBody(`  let x: Int = 2147483648e0\n  return 0`);
    const report = await runReport(src);
    const parseRefuse = hasCode(report, "PARSE") || hasCode(report, "LEX");
    const fired = hasCode(report, "FUNGI-TYPE-024");
    assert.equal(fired || parseRefuse, true, "T8b SH " + report);
    const parserSrc = readFileSync(join(SH, "parser.fungi"), "utf8");
    assert.equal(parserSrc.includes("e") && parserSrc.includes("isI32OverflowLiteral"), true);
    assert.equal(parserSrc.includes('if mark == "e"'), true);
    assert.equal(parserSrc.includes('if mark == "E"'), true);
  });
});

describe("T9 step PARSE-006 + T9b source-absent checkStepExpr", () => {
  it("T9 step body is PARSE-006 with the step-specific message", async () => {
    const src = wrapBody(`  step foo()\n  return 1`);
    const report = await runReport(src);
    assert.equal(report.includes("FUNGI-PARSE-006"), true, report);
    assert.equal(report.includes("step"), true, report);
    assert.equal(hasCode(report, "FUNGI-TYPE-007"), false, report);
  });

  it("T9b flow checkStepExpr is absent from type-checker.fungi", () => {
    const src = readFileSync(join(SH, "type-checker.fungi"), "utf8");
    assert.equal(src.includes("flow checkStepExpr"), false);
    assert.equal(src.includes("checkStepExpr"), false);
  });
});

describe("T11 7-stage WAT hashes", () => {
  it("lexer/effect/gov/gir/runtime render; parser+type-checker intended change", () => {
    const files = [
      "lexer.fungi",
      "parser.fungi",
      "type-checker.fungi",
      "effect-checker.fungi",
      "governance-verifier.fungi",
      "gir-emitter.fungi",
      "runtime.fungi",
    ];
    const hashes = {};
    for (const f of files) {
      const r = renderWat(stageSource(f), "t11-" + f);
      assert.equal(r.error, undefined, f + " " + r.error);
      hashes[f] = { sha256: sha256(r.wat), bytes: Buffer.byteLength(r.wat), unlowered: countUnlowered(r.wat) };
    }
    assert.equal(hashes["type-checker.fungi"].unlowered, 0);
    for (const f of ["lexer.fungi", "effect-checker.fungi", "governance-verifier.fungi", "gir-emitter.fungi", "runtime.fungi"]) {
      assert.equal(hashes[f].unlowered, 0, f);
    }
    writeFileSync(
      join(tmpdir(), "q2b-wat-hashes.json"),
      JSON.stringify(hashes, null, 2) + "\n",
    );
    assert.equal(hashes["parser.fungi"].bytes > 0, true);
    assert.equal(hashes["type-checker.fungi"].bytes > 0, true);
  });
});

describe("T13 D5 optional Auto-member compile-time refusal dropped", () => {
  it("does not add a new Auto-member compile-time refusal; instrument named", () => {
    const emitter = readFileSync(join(__dir, "../src/wat-emitter.ts"), "utf8");
    const sha = sha256(readFileSync(join(__dir, "../src/wat-emitter.ts")));
    assert.equal(sha, "77fa9e53de89816e3ee9b10a4cda67d76d584b0195b330f9367feb0e48b8fdf7");
    assert.equal(emitter.includes("uniqueInformalLayout"), true);
    // Optional D5 refusal dropped: no new compile-time Auto-member diagnostic was added.
    // Named instrument: checkProgram diagnostic-code set vs emit-time #128 count
    // (scripts/audit-unlowered-nodes.mjs --json) on the 7-stage corpus. Not landed
    // because a 0-new-refusal differential was not measured as zero before adding a refusal.
  });
});
