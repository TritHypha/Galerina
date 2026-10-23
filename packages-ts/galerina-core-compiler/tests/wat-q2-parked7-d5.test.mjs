/**
 * Q2 BUILD — parked 7 type-checker #128 sites + D5 declared-only.
 * DESIGN-03 §3 with Q2-DR APPROVE_WITH_CHANGES retargets (T5/T8b/T9b).
 * Replay: node --test --test-reporter=tap tests/wat-q2-parked7-d5.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SH = join(__dir, "../src/self-hosted");
const ROOT = join(__dir, "../../..");
const AUDIT = join(ROOT, "scripts/audit-unlowered-nodes.mjs");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function assertFullyValidatedWAT(assembly, label) {
  assert.equal(assembly.valid, true,
    `${label} must produce a valid WebAssembly module: ${JSON.stringify(assembly.diagnostics)}`);
  assert.deepEqual(assembly.diagnostics, [],
    `${label} must use full WAT validation, not the diagnostic-bearing minimal-encoder fallback`);
}

it("rejects minimal-encoder fallback for both valid and malformed WAT when WABT is unavailable", () => {
  const loader = pathToFileURL(fileURLToPath(new URL("./helpers/deny-wabt-loader.mjs", import.meta.url))).href;
  const probe = fileURLToPath(new URL("./helpers/wabt-fallback-probe.mjs", import.meta.url));
  const child = spawnSync(process.execPath, ["--no-warnings", "--experimental-loader", loader, probe], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(child.error, undefined, `fallback probe did not launch: ${child.error ?? ""}`);
  assert.equal(child.status, 0, `fallback probe failed: ${child.stderr}`);
  const outcomes = JSON.parse(child.stdout.trim());
  assert.equal(outcomes.valid.valid, true, "minimal encoder may mark the simple binary header valid");
  assert.match(outcomes.valid.diagnostics[0] ?? "", /wabt not available/u);
  assert.throws(() => assertFullyValidatedWAT(outcomes.valid, "valid-WAT fallback"), /full WAT validation/u);
  assert.equal(outcomes.malformed.valid, true,
    "control demonstrates that the minimal encoder does not parse the malformed function body");
  assert.match(outcomes.malformed.diagnostics[0] ?? "", /wabt not available/u);
  assert.throws(() => assertFullyValidatedWAT(outcomes.malformed, "malformed-WAT fallback"), /full WAT validation/u);
});

function functionSection(wat, name) {
  const marker = `  (func $${name} `;
  const start = wat.indexOf(marker);
  assert.notEqual(start, -1, `missing emitted function ${name}`);
  const next = wat.indexOf("\n  (func $", start + marker.length);
  return wat.slice(start, next === -1 ? wat.length : next);
}

function assertFieldLoadAt(body, local, base, offset) {
  assert.match(body, new RegExp(
    `\\(local\\.set \\$${local} \\(i32\\.load \\(i32\\.add \\(local\\.get \\$${base}\\) \\(i32\\.const ${offset}\\)\\)\\)\\)`,
  ), `${local} must read its own destination from ${base}+${offset}`);
}

function assertExecutableUnresolvedMember(body, member) {
  assert.match(body, new RegExp(
    `\\(unreachable\\)\\s*\\(; unresolved member: ${member}\\b`,
  ), `${member} refusal must contain an executable trap, not only a comment`);
}

function assertNoMatchedPayloadFieldLoad(body) {
  assert.doesNotMatch(body,
    /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_\d+\) \(i32\.const \d+\)\)\)/,
    "a refused matched payload must not be read using an inferred field offset");
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

function renderWat(source, label) {
  const checked = L.checkProgram(source, label);
  if (!checked.ok) {
    const family = typeof checked.family === "string" && checked.family.length > 0 ? checked.family : "gate";
    const code = typeof checked.code === "string" && checked.code.length > 0 ? checked.code : "FUNGI-WAT-CHECKED-001";
    return { error: `${family}:${code}`, wat: "", diagnostics: checked.diagnostics ?? [] };
  }
  const wat = L.renderWAT(
    L.buildWATFromCheckedProgram(checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true),
  );
  return { wat };
}

function renderRawWat(source, label) {
  const parsed = L.parseProgram(source, label);
  const parseErrors = (parsed.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error");
  if (parseErrors.length > 0) return { error: `parse:${parseErrors[0].code}`, wat: "" };
  const effects = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
  return {
    wat: L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, label, parsed.ast, true,
    )),
  };
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

  it("buildStaticEnv lowers the declared StaticDecl field offsets", () => {
    const r = renderWat(stageSource("type-checker.fungi"), "static-decl-layout.fungi");
    assert.equal(r.error, undefined, String(r.error || ""));
    const body = functionSection(r.wat, "buildStaticEnv");
    for (const [local, offset] of [["name", 0], ["value", 4], ["typeName", 8]]) {
      assert.match(
        body,
        new RegExp(`\\(i32\\.load \\(i32\\.add \\(local\\.get \\$__fungi_match_2\\) \\(i32\\.const ${offset}\\)\\)\\)`),
        `${local} must load StaticDecl's declared field at offset ${offset}`,
      );
    }
    const checkBody = functionSection(r.wat, "checkStaticDecls");
    assert.match(
      checkBody,
      /\(call \$isKnownType \(i32\.load \(i32\.add \(local\.get \$__fungi_match_2\) \(i32\.const 8\)\)\)\)/,
      "checkStaticDecls must read StaticDecl.inferredType at its declared offset",
    );
    const resolveBody = functionSection(r.wat, "resolveStatic");
    assert.match(
      resolveBody,
      /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_2\) \(i32\.const 0\)\)\)/,
      "resolveStatic must read the declared static-entry name field",
    );
    assert.match(
      resolveBody,
      /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_2\) \(i32\.const 4\)\)\)/,
      "resolveStatic must read the declared static-entry value field",
    );
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

  it("T8b scientific 2147483648e0 cannot bypass Int admission", async () => {
    const ts = ts024Binding("2147483648e0");
    assert.equal(ts.length, 0, "scientific notation is a Float token, not an Int literal");
    const src = wrapBody(`  let x: Int = 2147483648e0\n  return 0`);
    const report = await runReport(src);
    const parseRefuse = hasCode(report, "PARSE") || hasCode(report, "LEX");
    const typeRefuse = hasCode(report, "FUNGI-TYPE-002") || hasCode(report, "FUNGI-TYPE-024");
    assert.equal(typeRefuse || parseRefuse, true, "T8b SH " + report);
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
  it("does not reuse an outer-scope layout proof for a shadowing inner binding", () => {
    const src = `pure flow nestedShadow(flag: Bool) -> Int
contract { effects {} }
{
  let selected = Array.empty().append({ name: "Outer", value: "V" }).get(0)
  if flag {
    let rows = Array.empty().append({ other: "Inner" })
    let selected = rows.get(0)
    match selected {
      Some(row) => { return row.name.count() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-shadowed-array-layout.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-shadowed-array-layout.fungi");
    assert.equal(checked.ok, true, `outer-scope shadowing is a warning, not a production compile refusal: ${JSON.stringify(checked)}`);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-shadowed-array-layout", parsed.ast, true,
    ));
    const body = functionSection(wat, "nestedShadow");

    assertExecutableUnresolvedMember(body, "name");
    assertNoMatchedPayloadFieldLoad(body);

    const injectedWrongPayloadLoad = `${body}\n(drop (i32.load (i32.add (local.get $__fungi_match_1) (i32.const 0))))`;
    assert.throws(() => assertNoMatchedPayloadFieldLoad(injectedWrongPayloadLoad),
    "the negative-control WAT must prove the no-wrong-load oracle can detect a payload read even without a $name local");
  });

  it("keeps a shadowed binding refused when an unrelated partial record offers the same field", () => {
    const src = `record Label { name: String }
pure flow nestedShadowWithLabel(flag: Bool) -> Int
contract { effects {} }
{
  let selected = Array.empty().append({ name: "Outer", value: "V" }).get(0)
  if flag {
    let rows = Array.empty().append({ other: "Inner" })
    let selected = rows.get(0)
    match selected {
      Some(row) => { return row.name.count() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-shadowed-array-layout-with-label.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-shadowed-array-layout-with-label.fungi");
    assert.equal(checked.ok, true, `the layout refusal is an emitter safeguard: ${JSON.stringify(checked)}`);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-shadowed-array-layout-with-label", parsed.ast, true,
    ));
    const body = functionSection(wat, "nestedShadowWithLabel");

    assertExecutableUnresolvedMember(body, "name");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("uses the selected fresh construction instead of a conflicting module append shape", () => {
    const src = `pure flow selectedLayout() -> Int
contract { effects {} }
{
  let selected = Array.empty().append({ name: "N", value: "V" }).get(0)
  match selected {
    Some(row) => {
      let name: String = row.name
      let value: String = row.value
      return name.count() + value.count()
    }
    None => { return 0 }
  }
}

pure flow unrelatedLayout() -> Int
contract { effects {} }
{
  let other = Array.empty().append({ value: "V", name: "N" }).get(0)
  match other {
    Some(row) => { return row.value.count() }
    None => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-selected-fresh-array-layout.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-selected-fresh-array-layout", parsed.ast, true,
    ));
    const body = functionSection(wat, "selectedLayout");

    assert.doesNotMatch(body, /unresolved member: /,
      "the locally selected fresh record must not be refused by another flow's layout");
    assertFieldLoadAt(body, "name", "__fungi_match_1", 0);
    assertFieldLoadAt(body, "value", "__fungi_match_1", 4);
  });

  it("does not let an unrelated partial record block a uniquely appended anonymous layout", () => {
    const src = `record Label { name: String }
pure flow readRows() -> Int
contract { effects {} }
{
  let rows: Array<Auto> = Array.empty()
  let appended = rows.append({ name: "N", value: "V" })
  let first = appended.get(0)
  match first {
    Some(row) => {
      let name: String = row.name
      let value: String = row.value
      return name.count() + value.count()
    }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-unrelated-partial-record.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "q2-unrelated-partial-record", parsed.ast, true));
    const body = functionSection(wat, "readRows");

    assert.doesNotMatch(body, /unresolved member: (?:name|value)/,
      "the exact appended {name,value} layout must resolve despite the unrelated Label {name}");
    assert.match(body, /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_1\) \(i32\.const 0\)\)\)/,
      "name must load from the first appended field slot");
    assert.match(body, /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_1\) \(i32\.const 4\)\)\)/,
      "value must load from the second appended field slot");
    assertFieldLoadAt(body, "name", "__fungi_match_1", 0);
    assertFieldLoadAt(body, "value", "__fungi_match_1", 4);

    const swapped = body
      .replace("(local.set $name (i32.load (i32.add (local.get $__fungi_match_1) (i32.const 0)))",
        "(local.set $name (i32.load (i32.add (local.get $__fungi_match_1) (i32.const 4)))")
      .replace("(local.set $value (i32.load (i32.add (local.get $__fungi_match_1) (i32.const 4)))",
        "(local.set $value (i32.load (i32.add (local.get $__fungi_match_1) (i32.const 0)))");
    assert.notEqual(swapped, body, "offset-swap mutation must alter the observed WAT");
    assert.throws(() => assertFieldLoadAt(swapped, "name", "__fungi_match_1", 0),
      "the destination-to-offset oracle must reject swapped fields");
  });

  it("preserves an explicitly declared Array<Record> layout and refuses a missing member", () => {
    const src = `record FlowDecl { kind: String name: String effects: Array<String> usedEffects: Array<String> }
pure flow checkFlowEffects(flows: Array<FlowDecl>) -> Int
contract { effects {} }
{
  mut i: Int = 0
  mut n: Int = 0
  while i < flows.count() {
    let fdOpt = flows.get(i)
    match fdOpt {
      Some(fd) => {
        let name: String = fd.name
        let kind: String = fd.kind
        let effects: Array<Auto> = fd.effects
        let usedEffects: Array<Auto> = fd.usedEffects
        n = n + effects.count() + usedEffects.count()
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return n
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-auto-member-positive.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "q2-auto-member-positive", parsed.ast, true));
    const body = functionSection(wat, "checkFlowEffects");
    const unresolved = [...body.matchAll(/unresolved member: ([\w.]+)/g)].map((match) => match[1]);
    assert.deepEqual(unresolved.filter((name) =>
      name === "kind" || name === "name" || name === "effects" || name === "usedEffects"
    ), [], "the uniquely reconstructed fields must not be lowered as refusal traps");

    for (const [local, offset] of [["kind", 0], ["name", 4], ["effects", 8], ["usedEffects", 12]]) {
      const fieldLoad = new RegExp(
        `\\(local\\.set \\$${local} \\(i32\\.load \\(i32\\.add \\(local\\.get \\$__fungi_match_2\\) \\(i32\\.const ${offset}\\)\\)\\)\\)`
      );
      assert.match(body, fieldLoad, `${local} must load FlowDecl's declared offset ${offset}`);
    }

    // Negative control: a real load on a separately typed record remains in the
    // same function, but the missing FlowDecl.name access must still refuse.
    const missingNameSource = src.replace(
      "kind: String name: String effects:",
      "kind: String effects:",
    );
    assert.notEqual(missingNameSource, src, "negative-control fixture must remove exactly the name field");

    // Keep an unconfounded refusal control: without another partial record,
    // FlowDecl itself must still refuse its missing `name` member.
    const missingNameParsedWithoutDecoy = L.parseProgram(
      `@version 1\n${missingNameSource}`, "q2-auto-member-missing-name-no-decoy.fungi",
    );
    assert.deepEqual((missingNameParsedWithoutDecoy.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const missingNameEffectsWithoutDecoy = L.checkEffects(
      missingNameParsedWithoutDecoy.flows, missingNameParsedWithoutDecoy.ast,
    );
    const { gir: missingNameGirWithoutDecoy } = L.emitGIR(
      missingNameParsedWithoutDecoy.ast, missingNameParsedWithoutDecoy.flows, missingNameEffectsWithoutDecoy,
    );
    const missingNameWatWithoutDecoy = L.renderWAT(L.buildWATModuleFromGIR(
      missingNameGirWithoutDecoy, undefined, "q2-auto-member-missing-name-no-decoy",
      missingNameParsedWithoutDecoy.ast, true,
    ));
    const missingNameBodyWithoutDecoy = functionSection(missingNameWatWithoutDecoy, "checkFlowEffects");
    assert.match(missingNameBodyWithoutDecoy, /unresolved member: name/);
    assertExecutableUnresolvedMember(missingNameBodyWithoutDecoy, "name");
    assert.doesNotMatch(missingNameBodyWithoutDecoy,
      /\(local\.set \$name \(i32\.load \(i32\.add \(local\.get \$__fungi_match_2\) \(i32\.const \d+\)\)\)\)/,
      "the missing FlowDecl.name must not become a field load without the KnownKind decoy");

    const negativeSource = missingNameSource
      .replace("record FlowDecl {", "record KnownKind { kind: String }\nrecord FlowDecl {")
      .replace("checkFlowEffects(flows: Array<FlowDecl>)", "checkFlowEffects(flows: Array<FlowDecl>, known: KnownKind)")
      .replace("  return n", "  let knownKind: String = known.kind\n  return n");
    assert.notEqual(negativeSource, missingNameSource, "negative control must add a distinct typed record access");
    const missingNameParsed = L.parseProgram(`@version 1\n${negativeSource}`, "q2-auto-member-missing-name.fungi");
    assert.deepEqual((missingNameParsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    assert.deepEqual(L.buildRecordLayouts(missingNameParsed.ast).get("FlowDecl"),
      ["kind", "effects", "usedEffects"], "the parsed negative control must not declare FlowDecl.name");
    const missingNameEffects = L.checkEffects(missingNameParsed.flows, missingNameParsed.ast);
    const { gir: missingNameGir } = L.emitGIR(missingNameParsed.ast, missingNameParsed.flows, missingNameEffects);
    const missingNameWat = L.renderWAT(L.buildWATModuleFromGIR(
      missingNameGir, undefined, "q2-auto-member-missing-name", missingNameParsed.ast, true,
    ));
    const missingNameBody = functionSection(missingNameWat, "checkFlowEffects");
    assert.match(missingNameBody, /unresolved member: name/);
    assert.match(missingNameBody,
      /\(local\.set \$knownKind \(i32\.load \(i32\.add \(local\.get \$p1\) \(i32\.const 0\)\)\)\)/,
      "the separately typed KnownKind load must remain in the negative control");
    assert.doesNotMatch(missingNameBody,
      /\(local\.set \$name \(i32\.load \(i32\.add \(local\.get \$__fungi_match_2\) \(i32\.const \d+\)\)\)\)/,
      "the unrelated KnownKind load must not satisfy FlowDecl.name access");

    const nonExecutableRefusal = missingNameBodyWithoutDecoy.replace(
      "(unreachable) (; unresolved member: name",
      "(i32.const 0) (; unresolved member: name",
    );
    assert.notEqual(nonExecutableRefusal, missingNameBodyWithoutDecoy,
      "non-executable refusal mutation must alter the WAT");
    assert.throws(() => assertExecutableUnresolvedMember(nonExecutableRefusal, "name"),
      "the refusal oracle must reject a comment attached to a value instead of a trap");
  });

  it("does not let another flow's append shape authorize a missing Auto member", () => {
    const src = `record FlowDecl { kind: String effects: String usedEffects: String }
pure flow checkFlowEffects(flows: Array<Auto>) -> Int
contract { effects {} }
{
  let fdOpt = flows.get(0)
  match fdOpt {
    Some(fd) => {
      let name: String = fd.name
      let kind: String = fd.kind
      let effects: String = fd.effects
      let usedEffects: String = fd.usedEffects
      return name.count() + kind.count() + effects.count() + usedEffects.count()
    }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow appendUnrelated(rows: Array<Auto>) -> Int
contract { effects {} }
{
  let other = rows.append({ kind: "K", name: "N", effects: "E", usedEffects: "U" })
  return other.count()
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-unrelated-flow-auto-append.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined,
      "q2-unrelated-flow-auto-append", parsed.ast, true));
    const body = functionSection(wat, "checkFlowEffects");

    assertExecutableUnresolvedMember(body, "name");
    assert.doesNotMatch(body,
      /\(local\.set \$name \(i32\.load \(i32\.add \(local\.get \$__fungi_match_1\) \(i32\.const \d+\)\)\)\)/,
      "an append to another flow's Array<Auto> cannot define FlowDecl's missing name field");
  });

  it("does not retain append-layout evidence after a mutable array binding is reassigned", () => {
    const src = `pure flow reassignedArray() -> Int
contract { effects {} }
{
  let rows: Array<Auto> = Array.empty()
  let appended = rows.append({ name: "N", value: "V" })
  mut chosen: Array<Auto> = appended
  chosen = rows
  let first = chosen.get(0)
  match first {
    Some(row) => { return row.name.count() }
    None => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-reassigned-auto-array.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-reassigned-auto-array", parsed.ast, true,
    ));
    const body = functionSection(wat, "reassignedArray");

    assertExecutableUnresolvedMember(body, "name");
    assert.doesNotMatch(body,
      /\(local\.set \$name \(i32\.load \(i32\.add \(local\.get \$__fungi_match_\d+\) \(i32\.const \d+\)\)\)\)/,
      "a reassigned array binding has no valid proof for the previous append's record layout");
  });

  it("does not infer the layout of an arbitrary input array from its appended tail", () => {
    const src = `record FlowDecl { kind: String effects: String usedEffects: String }
pure flow checkFlowEffects(flows: Array<Auto>) -> Int
contract { effects {} }
{
  let appended = flows.append({ kind: "K", name: "N", effects: "E", usedEffects: "U" })
  let fdOpt = appended.get(0)
  match fdOpt {
    Some(fd) => {
      let name: String = fd.name
      let kind: String = fd.kind
      let effects: String = fd.effects
      let usedEffects: String = fd.usedEffects
      return name.count() + kind.count() + effects.count() + usedEffects.count()
    }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-arbitrary-array-appended-tail.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined,
      "q2-arbitrary-array-appended-tail", parsed.ast, true));
    const body = functionSection(wat, "checkFlowEffects");

    assertExecutableUnresolvedMember(body, "name");
    assert.doesNotMatch(body,
      /\(local\.set \$name \(i32\.load \(i32\.add \(local\.get \$__fungi_match_1\) \(i32\.const \d+\)\)\)\)/,
      "the first input element is not proven to share the appended tail's layout");
  });

  it("does not treat a matching module record declaration as proof for Array<Auto> input", () => {
    const src = `record FlowDecl { kind: String name: String effects: String usedEffects: String }
pure flow readUnknown(flows: Array<Auto>) -> Int
contract { effects {} }
{
  let first = flows.get(0)
  match first {
    Some(row) => {
      let name: String = row.name
      let kind: String = row.kind
      let effects: String = row.effects
      let usedEffects: String = row.usedEffects
      return name.count() + kind.count() + effects.count() + usedEffects.count()
    }
    None => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-auto-input-matching-record.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-auto-input-matching-record", parsed.ast, true,
    ));
    const body = functionSection(wat, "readUnknown");

    for (const field of ["name", "kind", "effects", "usedEffects"]) {
      assertExecutableUnresolvedMember(body, field);
    }
    assert.doesNotMatch(body, /\(local\.set \$(?:name|kind|effects|usedEffects) \(i32\.load /,
      "a matching module declaration does not prove the runtime layout of Array<Auto> input");
  });

  it("does not let a different Auto array in the same flow authorize the matched array", () => {
    const src = `record FlowDecl { kind: String effects: String usedEffects: String }
pure flow checkFlowEffects(flows: Array<Auto>, other: Array<Auto>) -> Int
contract { effects {} }
{
  let unrelated = other.append({ kind: "K", name: "N", effects: "E", usedEffects: "U" })
  let fdOpt = flows.get(0)
  match fdOpt {
    Some(fd) => {
      let name: String = fd.name
      let kind: String = fd.kind
      let effects: String = fd.effects
      let usedEffects: String = fd.usedEffects
      return name.count() + kind.count() + effects.count() + usedEffects.count() + unrelated.count()
    }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-sibling-array-auto-append.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined,
      "q2-sibling-array-auto-append", parsed.ast, true));
    const body = functionSection(wat, "checkFlowEffects");

    assertExecutableUnresolvedMember(body, "name");
    assert.doesNotMatch(body,
      /\(local\.set \$name \(i32\.load \(i32\.add \(local\.get \$__fungi_match_1\) \(i32\.const \d+\)\)\)\)/,
      "an append to `other` cannot define the layout of `flows.get(0)` values");
  });

  it("refuses an unresolved nested local instead of using another flow's anonymous layout", () => {
    const src = `record Label { name: String }
pure flow readNested() -> Int
contract { effects {} }
{
  if true {
    let rows = Array.empty().append({ other: "Inner" })
    let selected = rows.get(0)
    match selected {
      Some(row) => { return row.name.count() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}
pure flow readNestedPositive() -> Int
contract { effects {} }
{
  if true {
    let rows = Array.empty().append({ other: "Inner" })
    let selected = rows.get(0)
    match selected {
      Some(row) => { return row.other.count() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}
pure flow appendElsewhere(rows: Array<Auto>) -> Int
contract { effects {} }
{
  let appended = rows.append({ name: "N" })
  return appended.count()
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-unresolved-nested-array-layout.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-unresolved-nested-array-layout", parsed.ast, true,
    ));
    const body = functionSection(wat, "readNested");

    assertExecutableUnresolvedMember(body, "name");
    assertNoMatchedPayloadFieldLoad(body);

    const positiveBody = functionSection(wat, "readNestedPositive");
    assert.doesNotMatch(positiveBody, /unresolved member: other/,
      "the actual field in the proven nested record remains lowerable");
    assert.match(positiveBody,
      /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_\d+\) \(i32\.const 0\)\)\)/,
      "the proven field must retain its actual offset in the nested record");
  });

  it("does not resolve a nested initializer through a later shadowing declaration", () => {
    const src = `record Label { name: String }
pure flow readBeforeShadow() -> Int
contract { effects {} }
{
  let rows = Array.empty().append({ other: "Outer" })
  if true {
    let selected = rows.get(0)
    let rows = Array.empty().append({ name: "Inner", value: "V" })
    match selected {
      Some(row) => { return row.name.count() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-nested-initializer-before-shadow.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-nested-initializer-before-shadow", parsed.ast, true,
    ));
    const body = functionSection(wat, "readBeforeShadow");

    assertExecutableUnresolvedMember(body, "name");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("does not treat an aliased append as a fresh array origin for get(0)", () => {
    const src = `record Label { other: String }
pure flow readAliasedOrigin() -> Int
contract { effects {} }
{
  if true {
    let seed = Array.empty()
    let alias = seed
    let viaAlias = alias.append({ name: "First" })
    let rows = seed.append({ other: "Second" })
    let selected = rows.get(0)
    match selected {
      Some(row) => { return row.other.count() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-aliased-array-origin.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-aliased-array-origin", parsed.ast, true,
    ));
    const body = functionSection(wat, "readAliasedOrigin");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("rejects a layout proof when an earlier append used an alias of the empty array", () => {
    const src = `record Label { other: String }
pure flow readReverseAlias() -> Int
contract { effects {} }
{
  let seed = Array.empty()
  let alias = seed
  let first = seed.append({ name: "First" })
  let rows = alias.append({ other: "Second" })
  let selected = rows.get(0)
  match selected {
    Some(row) => { let observed: String = row.other; return observed.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-reverse-alias-array-origin.fungi");
    assert.equal(checked.ok, true, `this is an emitter-layout safeguard: ${JSON.stringify(checked)}`);
    const wat = L.renderWAT(L.buildWATFromCheckedProgram(
      checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true,
    ));
    const body = functionSection(wat, "readReverseAlias");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("does not infer a fresh append layout from a method-returned array", () => {
    const src = `record Label { other: String }
pure flow prefilledRows() -> Array<Auto>
contract { effects {} }
{
  return Array.empty().append({ name: "First" })
}
pure flow readMethodOrigin() -> Int
contract { effects {} }
{
  if true {
    let rows = prefilledRows().append({ other: "Second" })
    let selected = rows.get(0)
    match selected {
      Some(row) => { let observed: String = row.other; return observed.length() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-method-array-origin.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-method-array-origin", parsed.ast, true,
    ));
    const body = functionSection(wat, "readMethodOrigin");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("refuses nested non-fresh returned arrays but preserves declared record inputs", () => {
    const src = `record Label { other: String }
pure flow prefilledRows() -> Array<Auto>
contract { effects {} }
{
  return Array.empty().append({ name: "First" })
}
pure flow readUnknown() -> Int
contract { effects {} }
{
  if true {
    let rows = prefilledRows()
    let selected = rows.get(0)
    match selected {
      Some(row) => { let observed: String = row.other; return observed.length() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}
pure flow readDeclared(rows: Array<Label>) -> Int
contract { effects {} }
{
  if true {
    let selected = rows.get(0)
    match selected {
      Some(row) => { let observed: String = row.other; return observed.length() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-nested-array-input-origin.fungi");
    assert.equal(checked.ok, true, `these are emitter layout refusals, not checked-front-door refusals: ${JSON.stringify(checked)}`);
    const wat = L.renderWAT(L.buildWATFromCheckedProgram(
      checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true,
    ));
    const unknownBody = functionSection(wat, "readUnknown");

    assertExecutableUnresolvedMember(unknownBody, "other");
    assertNoMatchedPayloadFieldLoad(unknownBody);

    const declaredBody = functionSection(wat, "readDeclared");
    assert.doesNotMatch(declaredBody, /unresolved member: other/,
      "the declared Array<Label> input retains its type-derived layout");
    assert.match(declaredBody,
      /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_\d+\) \(i32\.const 0\)\)\)/,
      "the declared field must lower from its record slot");
  });

  it("refuses alias-order and direct returned-array layouts without payload field loads", () => {
    const src = `record Label { other: String }
pure flow prefilledRows() -> Array<Auto>
contract { effects {} }
{
  return Array.empty().append({ name: "First" })
}
pure flow readReverseAlias() -> Int
contract { effects {} }
{
  let seed = Array.empty()
  let alias = seed
  let first = seed.append({ name: "First" })
  let rows = alias.append({ other: "Second" })
  let selected = rows.get(0)
  match selected {
    Some(row) => { let observed: String = row.other; return observed.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow readDirectReturnedArray() -> Int
contract { effects {} }
{
  if true {
    let rows = prefilledRows()
    let selected = rows.get(0)
    match selected {
      Some(row) => { let observed: String = row.other; return observed.length() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}
pure flow readNestedUnknown(rows: Array<Auto>) -> Int
contract { effects {} }
{
  if true {
    let selected = rows.get(0)
    match selected {
      Some(row) => { let observed: String = row.other; return observed.length() }
      None => { return 0 }
      _ => { return 0 }
    }
  }
  return 0
}`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-array-layout-origin-counterexamples.fungi");
    assert.equal(checked.ok, true, `these are emitter-layout safeguards: ${JSON.stringify(checked)}`);
    const wat = L.renderWAT(L.buildWATFromCheckedProgram(
      checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true,
    ));

    for (const flowName of ["readReverseAlias", "readDirectReturnedArray", "readNestedUnknown"]) {
      const body = functionSection(wat, flowName);
      assertExecutableUnresolvedMember(body, "other");
      assertNoMatchedPayloadFieldLoad(body);
    }
  });

  it("does not allow an erased Array<Auto> caller to reach a concrete Array<Record> field load", () => {
    const src = `record Label { other: String }
pure flow readDeclared(rows: Array<Label>) -> Int
contract { effects {} }
{
  match rows.get(0) {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow relay(rows: Array<Auto>) -> Int
contract { effects {} }
{
  return readDeclared(rows)
}`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-auto-to-record-boundary.fungi");
    assert.equal(checked.ok, false,
      "an Array<Auto> value must not satisfy a concrete record-layout contract without narrowing");
  });

  it("keeps the safe widening from a concrete array to an Array<Auto> consumer", () => {
    const src = `record Label { other: String }
pure flow consumeUnknown(rows: Array<Auto>) -> Int
contract { effects {} }
{ return 0 }
pure flow relayConcrete(rows: Array<Label>) -> Int
contract { effects {} }
{ return consumeUnknown(rows) }`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-record-to-auto-boundary.fungi");
    assert.equal(checked.ok, true, `known record payload may be erased for an Auto consumer: ${JSON.stringify(checked)}`);
  });

  it("lowers a mutable declared record array after self-append and get", () => {
    const src = `record Row { other: String }
pure flow readMutable(rowsSeed: Row) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(rowsSeed)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-mutable-declared-array-positive.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-mutable-declared-array-positive", parsed.ast, true,
    ));
    const body = functionSection(wat, "readMutable");

    assert.doesNotMatch(body, /unresolved member: other/,
      "the checked concrete element type must survive a proven self-append/get path");
    assert.match(body,
      /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_\d+\) \(i32\.const 0\)\)\)/,
      "the record field must lower from the concrete Row layout");
  });

  it("keeps mutable-array proof when an unrelated nested mutable shadows the append value name", () => {
    const src = `record Row { other: String }
record Other { other: String }
pure flow readAfterUnrelatedShadow(seed: Row, other: Other) -> Int
contract { effects {} }
{
  if true { mut seed: Other = other }
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(seed)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-mutable-array-unrelated-shadow.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-mutable-array-unrelated-shadow", parsed.ast, true,
    ));
    const body = functionSection(wat, "readAfterUnrelatedShadow");

    assert.doesNotMatch(body, /unresolved member: other/,
      "a nested same-name binding must not invalidate the outer immutable parameter proof");
    assert.match(body,
      /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_\d+\) \(i32\.const 0\)\)\)/,
      "the proven outer Row value must retain its field offset");
  });

  it("refuses mutable-array layout proof when an append value is shadowed at the nested use site", () => {
    const src = `record Row { other: String }
record Wrong { prefix: Int other: String }
pure flow readAfterShadow(seed: Row, wrong: Wrong) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(seed)
  if true {
    mut seed: Wrong = wrong
    rows = rows.append(seed)
  }
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-mutable-array-nested-shadow.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-mutable-array-nested-shadow", parsed.ast, true,
    ));
    const body = functionSection(wat, "readAfterShadow");
    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("does not treat a shadowed Array.empty spelling as the builtin allocator", () => {
    const src = `record Row { other: String }
pure flow readShadowedArray(Array: Int, seed: Row) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(seed)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-shadowed-array-empty-builtin.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    assert.throws(() => L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-shadowed-array-empty-builtin", parsed.ast, true,
    )), /FUNGI-WAT-METHOD-001: method 'Array\.empty'.*shadowed by a value binding/);
  });

  it("does not recover a concrete mutable-array layout from an Auto self-append", () => {
    const src = `record Row { other: String }
pure flow readAutoAppend(unknown: Auto) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(unknown)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-auto-mutable-array-self-append.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-auto-mutable-array-self-append", parsed.ast, true,
    ));
    const body = functionSection(wat, "readAutoAppend");
    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("refuses mutable-array layout recovery after the handle escapes or is reassigned", () => {
    const src = `record Row { other: String }
record Other { other: String }
record Wrong { prefix: Int other: String }
pure flow identityRow(value: Row) -> Row
contract { effects {} }
{ return value }
pure flow readAfterAlias(seed: Row) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(seed)
  let alias = rows
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow readAfterErasedAssignment(rowsUnknown: Array<Auto>, seed: Row) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(seed)
  rows = rowsUnknown
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow readAfterWrongElement(seed: Other) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(seed)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow readAfterMutatedValue(good: Row, bad: Wrong) -> Int
contract { effects {} }
{
  mut value: Row = good
  value = bad
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(value)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow readAfterMutatedAlias(good: Row, bad: Wrong) -> Int
contract { effects {} }
{
  mut value: Row = good
  value = bad
  let copied = value
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(copied)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow readAfterMutatedAliasChain(good: Row, bad: Wrong) -> Int
contract { effects {} }
{
  mut value: Row = good
  value = bad
  let copied = value
  let copiedAgain = copied
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(copiedAgain)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow readAfterCallWrappedMutatedValue(good: Row, bad: Wrong) -> Int
contract { effects {} }
{
  mut value: Row = good
  value = bad
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(identityRow(value))
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-mutable-array-unsafe-provenance.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-mutable-array-unsafe-provenance", parsed.ast, true,
    ));

    for (const flowName of ["readAfterAlias", "readAfterErasedAssignment", "readAfterWrongElement", "readAfterMutatedValue", "readAfterMutatedAlias", "readAfterMutatedAliasChain", "readAfterCallWrappedMutatedValue"]) {
      const body = functionSection(wat, flowName);
      assertExecutableUnresolvedMember(body, "other");
      assertNoMatchedPayloadFieldLoad(body);
    }
  });

  it("refuses mutable-array layout recovery when a loop backedge replaces the array after the read", () => {
    const src = `record Row { other: String }
pure flow readAcrossLoop(seed: Row, unknown: Array<Auto>, again: Bool) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  while again {
    rows = rows.append(seed)
    let selected = rows.get(0)
    match selected {
      Some(row) => { let observed = row.other.length() }
      None => {}
      _ => {}
    }
    rows = unknown
  }
  return 0
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-mutable-array-loop-backedge.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-mutable-array-loop-backedge", parsed.ast, true,
    ));
    const body = functionSection(wat, "readAcrossLoop");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("refuses mutable-array layout recovery for a read inside a for-each backedge", () => {
    const src = `record Row { other: String }
pure flow readAcrossFor(seed: Row, unknown: Array<Auto>, iterations: Array<Bool>) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  for item in iterations {
    rows = rows.append(seed)
    let selected = rows.get(0)
    match selected {
      Some(row) => { let observed = row.other.length() }
      None => {}
      _ => {}
    }
    rows = unknown
  }
  return 0
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-mutable-array-for-backedge.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-mutable-array-for-backedge", parsed.ast, true,
    ));
    const body = functionSection(wat, "readAcrossFor");
    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("refuses a mutable-array layout when one branch appends an incompatible record", () => {
    const src = `record Row { other: String }
record Wrong { prefix: Int other: String }
pure flow readAfterBranchJoin(good: Row, bad: Wrong, chooseGood: Bool) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  if chooseGood {
    rows = rows.append(good)
  } else {
    rows = rows.append(bad)
  }
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const parsed = L.parseProgram(`@version 1\n${src}`, "q2-mutable-array-branch-join.fungi");
    assert.deepEqual((parsed.diagnostics ?? []).filter((d) => d.severity === "error"), []);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(
      gir, undefined, "q2-mutable-array-branch-join", parsed.ast, true,
    ));
    const body = functionSection(wat, "readAfterBranchJoin");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("does not trust a concrete array annotation after an unproven append is copied", () => {
    const src = `record Row { other: String }
pure flow readCopiedArray(unknown: Auto) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(unknown)
  let copied: Array<Row> = rows
  let selected = copied.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
    }`;
    const rendered = renderWat(`@version 1\n${src}`, "q2-auto-append-typed-alias");
    if (rendered.error !== undefined) {
      assert.match(rendered.error, /FUNGI-TYPE-002/,
        "only the expected incompatible-append type refusal is an acceptable safe outcome");
      assert.ok(rendered.diagnostics.some((diagnostic) =>
        diagnostic.code === "FUNGI-TYPE-002" && diagnostic.message.includes("mutable binding 'rows'")),
      "the type refusal must come from validating the rows append payload");
      return;
    }
    const body = functionSection(rendered.wat, "readCopiedArray");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("does not pass an unproven mutable-array payload to a concrete record-array callee", () => {
    const src = `record Row { other: String }
pure flow readDeclared(rows: Array<Row>) -> Int
contract { effects {} }
{
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow relayUnknown(unknown: Auto) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(unknown)
  return readDeclared(rows)
    }`;
    const rendered = renderWat(`@version 1\n${src}`, "q2-auto-append-typed-callee");
    if (rendered.error !== undefined) {
      assert.match(rendered.error, /FUNGI-TYPE-002/,
        "only the expected incompatible-append type refusal is an acceptable safe outcome");
      assert.ok(rendered.diagnostics.some((diagnostic) =>
        diagnostic.code === "FUNGI-TYPE-002" && diagnostic.message.includes("mutable binding 'rows'")),
      "the type refusal must come from validating the rows append payload");
      return;
    }
    const body = functionSection(rendered.wat, "readDeclared");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("resolves a shadowing pattern binder instead of an outer same-name local", () => {
    const src = `record Row { other: String }
record Wrong { prefix: Int other: String }
pure flow readPatternBoundArray(source: Option<Wrong>) -> Int
contract { effects {} }
{
  let seed: Row = { other: "outer" }
  mut rows: Array<Row> = Array.empty()
  match source {
    Some(seed) => { rows = rows.append(seed) }
    None => {}
    _ => {}
  }
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
    }`;
    const rendered = renderWat(`@version 1\n${src}`, "q2-mutable-array-pattern-binder");
    const raw = renderRawWat(`@version 1\n${src}`, "q2-mutable-array-pattern-binder-raw");
    assert.equal(raw.error, undefined, `raw WAT parse failed: ${raw.error ?? ""}`);
    const rawBody = functionSection(raw.wat, "readPatternBoundArray");
    assertExecutableUnresolvedMember(rawBody, "other");
    assertNoMatchedPayloadFieldLoad(rawBody);
    if (rendered.error !== undefined) {
      assert.match(rendered.error, /FUNGI-TYPE-002/,
        "only an expected type refusal is an acceptable safe outcome");
      assert.ok(rendered.diagnostics.some((diagnostic) =>
        diagnostic.code === "FUNGI-TYPE-002" && diagnostic.message.includes("mutable binding 'rows'")),
      "the type refusal must come from validating the rows append payload");
      return;
    }
    const body = functionSection(rendered.wat, "readPatternBoundArray");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("preserves the concrete layout when a compatible pattern binder shadows an outer local", () => {
    const src = `record Row { other: String }
record Wrong { unrelated: Int }
pure flow readPatternBoundArray(source: Option<Row>) -> Int
contract { effects {} }
{
  mut seed: Wrong = { unrelated: 1 }
  mut rows: Array<Row> = Array.empty()
  match source {
    Some(seed) => { rows = rows.append(seed) }
    None => {}
    _ => {}
  }
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const rendered = renderWat(`@version 1\n${src}`, "q2-compatible-pattern-binder");
    assert.equal(rendered.error, undefined,
      `a statically compatible payload should retain its layout: ${rendered.error ?? ""}`);
    const body = functionSection(rendered.wat, "readPatternBoundArray");
    assert.match(body,
      /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_\d+\) \(i32\.const 0\)\)\)/,
      "the proven Row payload uses its declared field offset");
  });

  it("resolves a for-each binder instead of an outer same-name local", () => {
    const src = `record Row { other: String }
record Wrong { prefix: Int other: String }
pure flow readAfterWrongIteration(wrongRows: Array<Wrong>) -> Int
contract { effects {} }
{
  let seed: Row = { other: "outer" }
  mut rows: Array<Row> = Array.empty()
  for seed in wrongRows {
    rows = rows.append(seed)
  }
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
    }`;
    const rendered = renderWat(`@version 1\n${src}`, "q2-mutable-array-for-binder-after-loop");
    const raw = renderRawWat(`@version 1\n${src}`, "q2-mutable-array-for-binder-after-loop-raw");
    assert.equal(raw.error, undefined, `raw WAT parse failed: ${raw.error ?? ""}`);
    const rawBody = functionSection(raw.wat, "readAfterWrongIteration");
    assertExecutableUnresolvedMember(rawBody, "other");
    assertNoMatchedPayloadFieldLoad(rawBody);
    if (rendered.error !== undefined) {
      assert.match(rendered.error, /FUNGI-TYPE-002/,
        "only an expected type refusal is an acceptable safe outcome");
      assert.ok(rendered.diagnostics.some((diagnostic) =>
        diagnostic.code === "FUNGI-TYPE-002" && diagnostic.message.includes("mutable binding 'rows'")),
      "the type refusal must come from validating the rows append payload");
      return;
    }
    const body = functionSection(rendered.wat, "readAfterWrongIteration");

    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);
  });

  it("preserves the concrete layout for a compatible for-each binder shadowing an outer local", () => {
    const src = `record Row { other: String }
record Wrong { unrelated: Int }
pure flow readAfterRightIteration(goodRows: Array<Row>) -> Int
contract { effects {} }
{
  mut seed: Wrong = { unrelated: 1 }
  mut rows: Array<Row> = Array.empty()
  for seed in goodRows {
    rows = rows.append(seed)
  }
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const rendered = renderWat(`@version 1\n${src}`, "q2-compatible-for-binder");
    assert.equal(rendered.error, undefined,
      `a statically compatible payload should retain its layout: ${rendered.error ?? ""}`);
    const body = functionSection(rendered.wat, "readAfterRightIteration");
    assert.match(body,
      /\(i32\.load \(i32\.add \(local\.get \$__fungi_match_\d+\) \(i32\.const 0\)\)\)/,
      "the proven Row payload uses its declared field offset");
  });

  it("allows Array.empty after an Array shadow exits its lexical branch", () => {
    const src = `record Row { other: String }
pure flow readAfterExitedShadow(seed: Row) -> Int
contract { effects {} }
{
  if true { let Array: Int = 0 }
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(seed)
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const rendered = renderWat(`@version 1\n${src}`, "q2-array-builtin-after-exited-shadow");
    assert.equal(rendered.error, undefined,
      `an expired block-local Array binding must not shadow the builtin: ${rendered.error ?? ""}`);
    assert.match(rendered.wat, /\(call \$host___array_create\)/);
  });

  it("does not trust an annotated Array alias initialized by an unproven append", () => {
    const src = `record Row { other: String }
pure flow readAppendAlias(unknown: Auto) -> Int
contract { effects {} }
{
  mut rows: Array<Row> = Array.empty()
  rows = rows.append(unknown)
  let copied: Array<Row> = rows.append(unknown)
  let selected = copied.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const raw = renderRawWat(`@version 1\n${src}`, "q2-unproven-append-alias-raw");
    assert.equal(raw.error, undefined, `raw WAT parse failed: ${raw.error ?? ""}`);
    const body = functionSection(raw.wat, "readAppendAlias");
    assertExecutableUnresolvedMember(body, "other");
    assertNoMatchedPayloadFieldLoad(body);

    const checked = renderWat(`@version 1\n${src}`, "q2-unproven-append-alias-checked");
    assert.match(checked.error ?? "", /FUNGI-TYPE-002/,
      "the checked route must reject the unproven append before emission");
  });

  it("rejects an unproven appended array at a concrete-array call boundary", () => {
    const src = `record Row { other: String }
pure flow consumeRows(rows: Array<Row>) -> Int
contract { effects {} }
{
  let selected = rows.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}
pure flow relayUnknown(unknown: Auto) -> Int
contract { effects {} }
{
  let rows: Array<Row> = Array.empty()
  return consumeRows(rows.append(unknown))
}`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-unproven-append-call");
    assert.equal(checked.ok, false, "checked admission must reject the unknown payload");
    assert.ok(checked.diagnostics?.some((diagnostic) =>
      diagnostic.code === "FUNGI-TYPE-005" && diagnostic.message.includes("Array<Row>")),
    "the refusal must identify the concrete-array call argument boundary");
  });

  it("allocates distinct WAT locals for same-named declarations in sibling branches", async () => {
    const src = `pure flow siblingLocals(flag: Bool) -> Int
contract { effects {} }
{
  if flag { let scratch: Int = 1 }
  else { let scratch: Int = 2 }
  return 0
}`;
    const raw = renderRawWat(`@version 1\n${src}`, "q2-sibling-wat-locals");
    assert.equal(raw.error, undefined, `raw WAT parse failed: ${raw.error ?? ""}`);
    const body = functionSection(raw.wat, "siblingLocals");
    const localNames = [...body.matchAll(/^\s*\(local\s+(\$[^\s)]+)/gm)].map((match) => match[1]);
    assert.equal(new Set(localNames).size, localNames.length,
      `sibling lexical declarations must have unique WAT locals, got ${localNames.join(", ")}`);
    const validation = await L.assembleWAT(raw.wat);
    assertFullyValidatedWAT(validation, "sibling-branch WAT");
  });

  it("rejects a concrete record assignment that poisons a later Array<Row> call", () => {
    const src = `record Row { other: String }
record Wrong { unrelated: Int }
pure flow consumeRows(rows: Array<Row>) -> Int
contract { effects {} }
{ return 0 }
pure flow poisonThenConsume(good: Row, bad: Wrong) -> Int
contract { effects {} }
{
  mut value: Row = good
  value = bad
  let rows: Array<Row> = Array.empty()
  return consumeRows(rows.append(value))
}`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-record-assignment-poisons-array-layout");
    assert.equal(checked.ok, false,
      "a different concrete record assigned to a Row binding must be refused before it can attest Array<Row>");
    assert.ok(checked.diagnostics?.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-002"),
      "the concrete mutable assignment mismatch must be diagnosed");
  });

  it("rejects an append history containing an unproven value even when the final append is valid", () => {
    const src = `record Row { other: String }
pure flow consumeRows(rows: Array<Row>) -> Int
contract { effects {} }
{ return 0 }
pure flow relay(good: Row, unknown: Auto) -> Int
contract { effects {} }
{
  let rows: Array<Row> = Array.empty()
  return consumeRows(rows.append(unknown).append(good))
}`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-append-history-provenance");
    assert.equal(checked.ok, false,
      "the final valid payload must not erase an earlier unknown append from the array's provenance");
    assert.ok(checked.diagnostics?.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-005"),
      "the concrete-array call boundary must refuse the unresolved append history");
  });

  it("rejects an annotated Array alias initialized directly by an unproven append", () => {
    const src = `record Row { other: String }
pure flow aliasUnknown(rows: Array<Row>, unknown: Auto) -> Int
contract { effects {} }
{
  let copied: Array<Row> = rows.append(unknown)
  let selected = copied.get(0)
  match selected {
    Some(row) => { return row.other.length() }
    None => { return 0 }
    _ => { return 0 }
  }
}`;
    const checked = L.checkProgram(`@version 1\n${src}`, "q2-direct-unproven-append-alias");
    assert.equal(checked.ok, false,
      "the annotation must not upgrade an append result whose payload type is unproven");
    assert.ok(checked.diagnostics?.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-002"),
      "the invalid Array<Row> initializer must be rejected as a type mismatch");
  });

  it("lets Auto payload binders shadow outer concrete records before typed calls", () => {
    const cases = [
      {
        label: "Some",
        sourceType: "Option<Auto>",
        arms: "Some(seed) => { return consumeRows(rows.append(seed)) }\n    None => { return 0 }",
      },
      {
        label: "Ok",
        sourceType: "Result<Auto, Row>",
        arms: "Ok(seed) => { return consumeRows(rows.append(seed)) }\n    Err(other) => { return 0 }",
      },
      {
        label: "Err",
        sourceType: "Result<Row, Auto>",
        arms: "Ok(other) => { return 0 }\n    Err(seed) => { return consumeRows(rows.append(seed)) }",
      },
    ];
    for (const item of cases) {
      const src = `record Row { other: String }
pure flow consumeRows(rows: Array<Row>) -> Int
contract { effects {} }
{ return 0 }
pure flow relay(source: ${item.sourceType}, seed: Row, rows: Array<Row>) -> Int
contract { effects {} }
{
  match source {
    ${item.arms}
    _ => { return 0 }
  }
}`;
      const checked = L.checkProgram(`@version 1\n${src}`, `q2-auto-${item.label.toLowerCase()}-binder-shadows-outer`);
      assert.equal(checked.ok, false,
        `an erased ${item.label} payload must shadow, not inherit the outer Row type at the concrete-array boundary`);
      assert.ok(checked.diagnostics?.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-005"),
        `the ${item.label} payload's unknown type must be caught at the concrete-array call boundary`);
    }
  });

  it("gives for-each binders fresh WAT storage and unique locals across repeated names", async () => {
    const src = `record Row { other: String }
record Wrong { prefix: Int other: String }
pure flow keepOuter(first: Array<Wrong>, second: Array<Wrong>) -> Int
contract { effects {} }
{
  let seed: Row = { other: "outer" }
  for seed in first { let firstMarker: Int = 1 }
  for item in first { let secondMarker: Int = 2 }
  for item in second { let thirdMarker: Int = 3 }
  return seed.other.length()
}`;
    const rendered = renderWat(`@version 1\n${src}`, "q2-for-each-storage-is-lexical");
    assert.equal(rendered.error, undefined, `checked WAT build failed: ${rendered.error ?? ""}`);
    const body = functionSection(rendered.wat, "keepOuter");
    const localNames = [...body.matchAll(/^\s*\(local\s+(\$[^\s)]+)/gm)].map((match) => match[1]);
    assert.equal(new Set(localNames).size, localNames.length,
      `for-each binders need distinct locals, got ${localNames.join(", ")}`);
    assert.match(body, /\(local\.set \$seed__\d+ \(call \$host___array_get/,
      "iteration must write to a fresh local, not the outer Row parameter");
    assert.match(body, /\(i32\.load \(i32\.add \(local\.get \$seed\) \(i32\.const 0\)\)\)/,
      "post-loop Row access must still read the untouched outer local");
    const validation = await L.assembleWAT(rendered.wat);
    assertFullyValidatedWAT(validation, "for-each shadow WAT");
  });
});
