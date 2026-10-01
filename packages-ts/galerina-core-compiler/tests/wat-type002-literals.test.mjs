/**
 * TYPE-002 record-literal completion — S2 a/b/c and S3 d.
 * Replay: node --test --test-reporter=tap tests/wat-type002-literals.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "../dist/index.js";
import { checkTypes } from "../dist/type-checker.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const SH = join(__dir, "../src/self-hosted");

const STMT_FIELDS = [
  "kind",
  "name",
  "typeName",
  "expr",
  "body",
  "elseBody",
  "typeBase",
  "typeArgs",
  "isBranded",
  "isTensor",
  "litI32Overflow",
  "arms",
];
const FLOW_FIELDS = [
  "name",
  "params",
  "body",
  "qualifier",
  "paramTypes",
  "returnType",
  "effects",
];

const STAGES = [
  "lexer.fungi",
  "parser.fungi",
  "type-checker.fungi",
  "effect-checker.fungi",
  "governance-verifier.fungi",
  "gir-emitter.fungi",
  "runtime.fungi",
];

const strip = (p) => {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

function extractRecordDecl(src, name) {
  const re = new RegExp(`(^|\\n)record\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) throw new Error(`missing record ${name}`);
  const start = m.index + (m[1] ? m[1].length : 0);
  const brace = src.indexOf("{", start);
  if (brace < 0) throw new Error(`record ${name} has no body`);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed record ${name}`);
}

function girRecordsForRuntime() {
  const src = strip("gir-emitter.fungi");
  return ["GIRNode", "GIRExprNode", "GIRModule", "GIRExpr", "GIRStmt", "FlowEntry"]
    .map((n) => extractRecordDecl(src, n))
    .join("\n\n");
}

function stageSource(file) {
  const extra = (file === "lexer.fungi" || file === "parser.fungi") ? "" : "\n" + strip(file);
  const girDecls = file === "runtime.fungi" ? "\n" + girRecordsForRuntime() : "";
  return "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + girDecls + extra;
}

function topLevelFields(literalSrc) {
  const brace = literalSrc.indexOf("{");
  if (brace < 0) return [];
  const fields = [];
  let depth = 0;
  let i = brace;
  while (i < literalSrc.length) {
    const c = literalSrc[i];
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      if (depth === 0) break;
      i++;
      continue;
    }
    if (depth === 1) {
      const rest = literalSrc.slice(i);
      const m = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (m) {
        fields.push(m[1]);
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return fields;
}

function findTypedLiterals(src, typeName) {
  const found = [];
  const re = new RegExp(
    `(?::\\s*${typeName}\\s*=\\s*(?:${typeName}\\s*)?\\{)|(?:${typeName}\\s*\\{)`,
    "g",
  );
  let m = re.exec(src);
  while (m) {
    const brace = src.indexOf("{", m.index);
    if (brace >= 0) {
      let depth = 0;
      let end = -1;
      for (let i = brace; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      if (end >= 0) {
        const line = src.slice(0, brace).split("\n").length;
        found.push({ line, text: src.slice(brace, end), fields: topLevelFields(src.slice(brace, end)) });
      }
    }
    m = re.exec(src);
  }
  return found;
}

function findAssignmentLiterals(src, ident) {
  const found = [];
  const re = new RegExp(`\\b${ident}\\s*=\\s*\\{`, "g");
  let m = re.exec(src);
  while (m) {
    const brace = src.indexOf("{", m.index);
    let depth = 0;
    let end = -1;
    for (let i = brace; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end >= 0) {
      const line = src.slice(0, brace).split("\n").length;
      found.push({ line, text: src.slice(brace, end), fields: topLevelFields(src.slice(brace, end)) });
    }
    m = re.exec(src);
  }
  return found;
}

describe("TYPE-002 record literals complete", () => {
  it("S2b: every Stmt literal in parser.fungi supplies all 12 fields", () => {
    const src = readFileSync(join(SH, "parser.fungi"), "utf8");
    const typed = findTypedLiterals(src, "Stmt");
    const assigned = findAssignmentLiterals(src, "whileStmt");
    const all = [];
    const seen = new Set();
    for (const row of [...typed, ...assigned]) {
      if (!row.fields.includes("kind")) continue;
      const key = `${row.line}:${row.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(row);
    }
    assert.ok(all.length >= 20, `expected at least 20 Stmt literals, found ${all.length}`);
    const incomplete = [];
    for (const row of all) {
      const missing = STMT_FIELDS.filter((f) => !row.fields.includes(f));
      if (missing.length > 0) incomplete.push({ line: row.line, missing, fields: row.fields });
    }
    assert.equal(incomplete.length, 0, JSON.stringify(incomplete));
    const matchRow = all.find((r) => r.text.includes('kind: "match"'));
    assert.ok(matchRow, "match Stmt literal must exist");
    assert.equal(matchRow.text.includes("arms: armsResult.arms"), true, "match literal must carry armsResult.arms");
    assert.equal(matchRow.text.includes("arms: Array.empty()"), false, "match literal must not empty arms");
  });

  it("S2b: FlowEntry sentinel in runtime.fungi supplies all 7 fields", () => {
    const src = readFileSync(join(SH, "runtime.fungi"), "utf8");
    const rows = findTypedLiterals(src, "FlowEntry");
    assert.ok(rows.length >= 1, "lookupFlow sentinel must exist");
    const incomplete = [];
    for (const row of rows) {
      const missing = FLOW_FIELDS.filter((f) => !row.fields.includes(f));
      if (missing.length > 0) incomplete.push({ line: row.line, missing, fields: row.fields });
    }
    assert.equal(incomplete.length, 0, JSON.stringify(incomplete));
  });

  it("S2a: checkTypes on each audit stageSource composition has 0 FUNGI-TYPE-002", () => {
    const rows = [];
    for (const file of STAGES) {
      const source = stageSource(file);
      const prog = L.parseProgram(source, file);
      const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
      assert.equal(parseErrs.length, 0, `${file} parse: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
      const types = checkTypes(prog.ast);
      const type002 = (types.diagnostics ?? []).filter(
        (d) => d.severity === "error" && d.code === "FUNGI-TYPE-002",
      );
      rows.push({ file, type002: type002.length });
      assert.equal(type002.length, 0, `${file} TYPE-002: ${JSON.stringify(type002.slice(0, 3))}`);
    }
    assert.equal(rows.length, 7);
  });

  it("S2c: a 6-of-12 record literal is still refused as FUNGI-TYPE-002", () => {
    const src = `@version 1
record Sample {
  kind: String
  name: String
  typeName: String
  expr: Array<Int>
  body: Array<Int>
  elseBody: Array<Int>
  typeBase: String
  typeArgs: Array<String>
  isBranded: Bool
  isTensor: Bool
  litI32Overflow: Bool
  arms: Array<Int>
}
pure flow f() -> Int {
  let s: Sample = { kind: "return", name: "", typeName: "", expr: Array.empty(), body: Array.empty(), elseBody: Array.empty() }
  return 1
}
`;
    const prog = L.parseProgram(src, "type002-neg.fungi");
    const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(parseErrs.length, 0, parseErrs[0]?.message ?? "");
    const types = checkTypes(prog.ast);
    const type002 = (types.diagnostics ?? []).filter(
      (d) => d.severity === "error" && d.code === "FUNGI-TYPE-002",
    );
    assert.equal(type002.length, 1, JSON.stringify(types.diagnostics));
    assert.match(type002[0].message, /missing field\(s\): typeBase, typeArgs, isBranded, isTensor, litI32Overflow, arms/);
    const checked = L.checkProgram(src, "type002-neg.fungi");
    assert.equal(checked.ok, false);
    assert.equal(checked.family, "type");
    assert.equal(checked.code, "FUNGI-TYPE-002");
  });

  it("S3d: self-hosted parse of match carries arms.count == body.count > 0", async () => {
    const DRIVER = `
pure flow parseStmtFromSource(src: String) -> StmtParse
contract { intent { "TYPE-002 match-arms driver: tokenize then parseStmt from position 0." } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      return parseStmt(toks, 0)
    }
    _ => {
      let empty: Stmt = Stmt { kind: "", name: "", typeName: "", expr: Array.empty(), body: Array.empty(), elseBody: Array.empty(), typeBase: "", typeArgs: Array.empty(), isBranded: false, isTensor: false, litI32Overflow: false, arms: Array.empty() }
      return StmtParse { stmt: empty, nextPos: 0 }
    }
  }
}
`;
    const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n" + DRIVER;
    const prog = L.parseProgram(SRC, "lexer-parser-match-driver.fungi");
    const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(parseErrs.length, 0, `driver parse: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
    const types = checkTypes(prog.ast);
    const type002 = (types.diagnostics ?? []).filter(
      (d) => d.severity === "error" && d.code === "FUNGI-TYPE-002",
    );
    assert.equal(type002.length, 0, JSON.stringify(type002.slice(0, 3)));
    const args = new Map([["src", { __tag: "string", value: "match x { 1 => { return 1 } _ => { return 0 } }" }]]);
    const res = await L.executeFlow("parseStmtFromSource", args, prog.ast, prog.flows, 0, 0, { pureFastPath: true });
    const rec = res?.value?.value ?? res?.value;
    const f = rec?.fields;
    const stmt = f?.get("stmt")?.value ?? f?.get("stmt");
    const sf = stmt?.fields;
    const itemsOf = (fv) => fv?.value?.items ?? fv?.items ?? [];
    const body = itemsOf(sf?.get("body"));
    const arms = itemsOf(sf?.get("arms"));
    assert.equal(sf?.get("kind")?.value, "match");
    assert.equal(body.length > 0, true, `body.count=${body.length}`);
    assert.equal(arms.length, body.length, `arms=${arms.length} body=${body.length}`);
  });
});
