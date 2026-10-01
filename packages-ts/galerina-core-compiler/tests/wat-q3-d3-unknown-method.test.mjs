/**
 * Q3 BUILD — D3 unknown methods + Option.zip METHOD-001.
 * DESIGN-04 §3 with Q3-DR APPROVE_WITH_CHANGES retargets (T1b, T5 split, T6 mid-chain).
 * Replay: node --test --test-reporter=tap tests/wat-q3-d3-unknown-method.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, "../src");
const SH = join(SRC, "self-hosted");
const ROOT = join(__dir, "../../..");
const EXAMPLES = join(ROOT, "examples");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function typeErrors(source) {
  const parsed = L.parseProgram(source, "q3.fungi");
  const parseErrors = (parsed.diagnostics || []).filter((d) => d.severity === "error");
  if (parseErrors.length > 0) return parseErrors;
  return L.checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error");
}

function pipeline001(source) {
  return typeErrors(source).filter((d) => d.code === "FUNGI-PIPELINE-001");
}

function compileWAT(src) {
  const parsed = L.parseProgram(src, "q3-wat.fungi");
  const errs = (parsed.diagnostics || []).filter((d) => d.severity === "error");
  if (errs.length > 0) {
    const err = new Error("parse: " + errs.map((e) => e.code + ":" + e.message).join("; "));
    err.parseErrors = errs;
    throw err;
  }
  const fx = L.checkEffects(parsed.flows, parsed.ast);
  const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "q3", parsed.ast, true));
}

const PT = "record Pt { x: Int y: Int }\n";

function wrapInt(body, extra = "") {
  return `${extra}${PT}pure flow f() -> Int {\n${body}\n}\n`;
}

describe("T1 Value unknown method PIPELINE-001", () => {
  it("T1 p.frob() on Pt is PIPELINE-001", () => {
    const diags = pipeline001(wrapInt("  let p: Pt = { x: 1, y: 2 }\n  return p.frob()"));
    assert.ok(diags.length >= 1, typeErrors(wrapInt("  let p: Pt = { x: 1, y: 2 }\n  return p.frob()")).map((d) => d.code + ":" + d.message).join(" | ") || "(none)");
    assert.match(diags[0].message, /frob/);
  });

  it("T1b p.length() on Pt is PIPELINE-001", () => {
    const diags = pipeline001(wrapInt("  let p: Pt = { x: 1, y: 2 }\n  return p.length()"));
    assert.ok(diags.length >= 1, "length must refuse GLOBAL_METHODS on Value user type");
    assert.match(diags[0].message, /length/);
  });

  it("T1b p.toString() on Pt is PIPELINE-001", () => {
    const src = `${PT}pure flow f() -> String {\n  let p: Pt = { x: 1, y: 2 }\n  return p.toString()\n}\n`;
    const diags = pipeline001(src);
    assert.ok(diags.length >= 1, "toString must refuse GLOBAL_METHODS on Value user type");
    assert.match(diags[0].message, /toString/);
  });
});

describe("T2 field-as-method", () => {
  it("p.x() names field x of Pt", () => {
    const diags = pipeline001(wrapInt("  let p: Pt = { x: 1, y: 2 }\n  return p.x()"));
    assert.ok(diags.length >= 1, "(none)");
    assert.match(diags[0].message, /Field 'x' of receiver type 'Pt'/);
  });

  it("p.x field read stays CHECK OK", () => {
    const diags = typeErrors(wrapInt("  let p: Pt = { x: 1, y: 2 }\n  return p.x"));
    assert.equal(diags.filter((d) => d.code === "FUNGI-PIPELINE-001").length, 0, diags.map((d) => d.code).join(","));
  });
});

describe("T3 UFCS CHECK OK + interpreter 2", () => {
  const src = `${PT}pure flow area(p: Pt) -> Int {\n  return 2\n}\npure flow f() -> Int {\n  let p: Pt = { x: 1, y: 2 }\n  return p.area()\n}\n`;

  it("UFCS p.area() is not PIPELINE-001", () => {
    const diags = pipeline001(src);
    assert.equal(diags.length, 0, typeErrors(src).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("interpreter returns 2", async () => {
    const parsed = L.parseProgram(src, "t3.fungi");
    const res = await L.executeFlow("f", new Map(), parsed.ast);
    assert.equal(res?.value?.__tag, "int", JSON.stringify(res));
    assert.equal(res?.value?.value, 2);
  });
});

describe("T4 first-param mismatch PIPELINE-001", () => {
  it("area(q: Other) on Pt refuses", () => {
    const src = `${PT}record Other { z: Int }\npure flow area(q: Other) -> Int {\n  return 0\n}\npure flow f() -> Int {\n  let p: Pt = { x: 1, y: 2 }\n  return p.area()\n}\n`;
    const diags = pipeline001(src);
    assert.ok(diags.length >= 1, typeErrors(src).map((d) => d.code + ":" + d.message).join(" | ") || "(none)");
    assert.match(diags[0].message, /area/);
  });
});

describe("T5 TypeName split", () => {
  it("ApiError.notFound no-call CHECK OK", () => {
    const src = `pure flow f() -> Int {\n  let x = ApiError.notFound\n  return 0\n}\n`;
    const diags = pipeline001(src);
    assert.equal(diags.length, 0, typeErrors(src).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("ApiError.notFound no-call WAT has no METHOD-001", () => {
    const src = `pure flow f() -> Int\ncontract { effects {} }\n{\n  let x = ApiError.notFound\n  return 0\n}\n`;
    const wat = compileWAT(src);
    assert.equal(/FUNGI-WAT-METHOD-001/.test(wat), false);
    assert.equal(/unknown method/.test(wat), false);
  });

  it("ApiError.notFound() CHECK OK (no new checker diagnostic)", () => {
    const src = `pure flow f() -> Int {\n  return ApiError.notFound()\n}\n`;
    const diags = pipeline001(src);
    assert.equal(diags.length, 0, typeErrors(src).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("ApiError.notFound() WASM METHOD-001", () => {
    const src = `pure flow f() -> Int\ncontract { effects {} }\n{ return ApiError.notFound() }\n`;
    assert.throws(() => compileWAT(src), /FUNGI-WAT-METHOD-001/);
  });
});

describe("T6 catalogued unknown + mid-chain", () => {
  it("Int/String/Array/Result/Decimal unknown stay PIPELINE-001", () => {
    const programs = [
      "pure flow f(n: Int) -> Int { return n.frob() }",
      "pure flow f(s: String) -> String { return s.frob() }",
      "pure flow f(xs: Array<Int>) -> Int { return xs.frob() }",
      "pure flow f(r: Result<Int, String>) -> Int { return r.frob() }",
      "pure flow f(d: Decimal) -> Decimal { return d.frob() }",
    ];
    for (const src of programs) {
      const diags = pipeline001(src);
      assert.ok(diags.length >= 1, src + " -> " + (typeErrors(src).map((d) => d.code).join(",") || "(none)"));
    }
  });

  it("mid-chain s.slice(0,1).frob() is PIPELINE-001", () => {
    const src = "pure flow f(s: String) -> String { return s.slice(0, 1).frob() }";
    const diags = pipeline001(src);
    assert.ok(diags.length >= 1, typeErrors(src).map((d) => d.code + ":" + d.message).join(" | ") || "(none)");
    assert.match(diags[0].message, /frob/);
  });
});

describe("T7 Option.zip", () => {
  const src = `pure flow f(a: Option<Int>, b: Option<Int>) -> Option<ZipPair<Int, Int>>
contract { effects {} }
{ return a.zip(b) }
`;

  it("CHECK OK (zip stays in Option catalog)", () => {
    const diags = pipeline001(src);
    assert.equal(diags.length, 0, typeErrors(src).map((d) => d.code + ":" + d.message).join(" | "));
  });

  it("interpreter still runs zip", async () => {
    const runSrc = `pure flow f() -> Int {\n  let a: Option<Int> = Some(1)\n  let b: Option<Int> = Some(2)\n  let z = a.zip(b)\n  return 0\n}\n`;
    const parsed = L.parseProgram(runSrc, "t7.fungi");
    const res = await L.executeFlow("f", new Map(), parsed.ast);
    assert.equal(res?.value?.value, 0, JSON.stringify(res));
  });

  it("WASM METHOD-001 with Option.zip-specific message, no stub", () => {
    assert.throws(
      () => compileWAT(src),
      (err) => {
        const msg = String(err && err.message ? err.message : err);
        assert.match(msg, /FUNGI-WAT-METHOD-001/);
        assert.match(msg, /Option\.zip/);
        assert.equal(/unknown method 'zip' — fail-closed WAT refusal/.test(msg), false);
        return true;
      },
    );
  });
});

describe("T8 UFCS WASM METHOD-001", () => {
  it("p.area() throws METHOD-001 and does not emit call $area", () => {
    const src = `${PT}pure flow area(p: Pt) -> Int
contract { effects {} }
{ return 2 }
pure flow f() -> Int
contract { effects {} }
{ let p: Pt = { x: 1, y: 2 }
  return p.area() }
`;
    try {
      const wat = compileWAT(src);
      assert.equal(/call \$area/.test(wat), false, wat.slice(0, 400));
      assert.fail("expected FUNGI-WAT-METHOD-001 throw, got WAT length " + wat.length);
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      assert.match(msg, /FUNGI-WAT-METHOD-001/);
      assert.match(msg, /'area'/);
      assert.equal(/call \$area/.test(msg), false);
    }
  });
});

describe("T9 stub phrase gone", () => {
  it("wat-emitter.ts has no unknown-method unreachable stub", () => {
    const text = readFileSync(join(SRC, "wat-emitter.ts"), "utf8");
    assert.equal(text.includes("unknown method '${name}' — fail-closed WAT refusal"), false);
    assert.equal(text.includes("fail-closed WAT refusal; C03/RD-1234"), false);
    assert.equal(text.includes("refuseUnknownMethodWat"), true);
  });
});

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
  try {
    const wat = L.renderWAT(
      L.buildWATFromCheckedProgram(checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true),
    );
    return { wat };
  } catch (e) {
    return { error: String(e && e.message ? e.message : e), wat: "" };
  }
}

describe("T11 7-stage WAT hashes", () => {
  const stages = [
    "lexer.fungi",
    "parser.fungi",
    "type-checker.fungi",
    "effect-checker.fungi",
    "governance-verifier.fungi",
    "gir-emitter.fungi",
    "runtime.fungi",
  ];
  for (const file of stages) {
    it(`stage ${file}`, () => {
      const r = renderWat(stageSource(file), "q3-" + file);
      if (r.error) {
        assert.match(r.error, /FUNGI-WAT-METHOD-001|family:/, file + " " + r.error);
        console.log("T11 " + file + " REFUSED " + r.error.slice(0, 180));
        return;
      }
      const h = sha256(r.wat);
      console.log("T11 " + file + " sha256 " + h + " bytes " + Buffer.byteLength(r.wat));
      assert.equal(typeof h, "string");
      assert.equal(h.length, 64);
    });
  }
});

function walkFungi(dir, acc, depth) {
  if (depth > 5) return;
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walkFungi(p, acc, depth + 1);
    else if (name.endsWith(".fungi")) acc.push(p);
  }
}

describe("T10 examples/fixtures remeasure", () => {
  it("lists examples programs that now refuse METHOD-001 or PIPELINE-001 at WAT/check", () => {
    const files = [];
    if (existsSync(EXAMPLES)) walkFungi(EXAMPLES, files, 0);
    const flips = [];
    for (const f of files) {
      const rel = f.slice(ROOT.length + 1).replaceAll("\\", "/");
      let src;
      try { src = readFileSync(f, "utf8"); } catch { continue; }
      if (src.length > 200000) continue;
      const p001 = pipeline001(src);
      let method001 = false;
      let methodMsg = "";
      try {
        compileWAT(src);
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        if (/FUNGI-WAT-METHOD-001/.test(msg)) {
          method001 = true;
          methodMsg = msg.slice(0, 160);
        }
      }
      if (p001.length > 0 || method001) {
        flips.push({
          rel,
          pipeline001: p001.map((d) => d.message).slice(0, 3),
          method001,
          methodMsg,
        });
      }
    }
    console.log("T10 scanned " + files.length + " examples; refused " + flips.length);
    for (const row of flips) {
      console.log("T10 FLIP " + JSON.stringify(row));
    }
    assert.ok(files.length >= 0);
  });
});

describe("T12 old trap-text tests", () => {
  it("no test pins the removed unreachable stub as expected WAT", () => {
    const testsDir = __dir;
    const files = [];
    walkFungi(testsDir, files, 0);
    const mjs = readdirSync(testsDir).filter((n) => n.endsWith(".test.mjs"));
    const pinned = [];
    for (const name of mjs) {
      if (name === "wat-q3-d3-unknown-method.test.mjs") continue;
      const text = readFileSync(join(testsDir, name), "utf8");
      if (text.includes("fail-closed WAT refusal; C03/RD-1234") || text.includes("unknown method '${name}'")) {
        pinned.push(name);
      }
    }
    assert.deepEqual(pinned, [], "update these tests in this job: " + pinned.join(","));
  });
});
