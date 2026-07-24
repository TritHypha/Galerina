#!/usr/bin/env node
// =============================================================================================
// audit-flowparam-fidelity — the C4 FlowParam qualifier-fidelity gate (standing, self-tested)
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS (bridge 0145/0147, plan row C4): the Stage-B twin's parseParams used to have a
// readonly-only special case plus a generic capture branch that HARDCODED isReadonly:false. Any
// qualifier combination fell through to the generic branch, so `readonly tainted a: Int` parsed
// with isReadonly:false — a SILENT loss of an immutability guarantee, with zero errors. The fix
// (one qualifier loop + ONE capture path) landed with this gate; this gate pins it forever.
//
// WHAT IT CHECKS: R&D's 5-row probe table (bridge 0145) + a 6th maximal row (order-swapped
// qualifiers, generic type, dotted source_from origin), through the REAL self-hosted pipeline —
// lexer.fungi tokenize → parser.fungi parseFlows via the SHIPPED walker (twin-probe rule: never
// parseProgram, the TS parser runs ahead and would mask twin gaps).
//
// SELF-TEST (--self-test): proves the comparator itself goes RED on a wrong expectation and
// GREEN on the correct table — a gate that cannot fail is not a gate.
//
// EXIT: 0 = all rows green · 1 = fidelity mismatch (or self-test failure) · 2 = infra fail-closed.
// Deterministic, read-only, no writes, no network. Wire into phase-close alongside the twin gates.
// =============================================================================================
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "packages-galerina", "galerina-core-compiler", "dist", "index.js");
const SH_DIR = join(HERE, "..", "packages-galerina", "galerina-core-compiler", "src", "self-hosted");

let L;
try {
  L = await import(pathToFileURL(DIST).href);
  for (const fn of ["parseProgram", "resolveSymbols", "checkTypes", "executeFlow"]) {
    if (typeof L[fn] !== "function") throw new Error(`dist did not export ${fn}`);
  }
} catch (e) {
  console.error("FAIL-CLOSED (exit 2): could not import the SHIPPED dist — build Galerina first.\n  " + e.message);
  process.exit(2);
}

function loadSelfHosted(file) {
  const p = L.parseProgram(readFileSync(join(SH_DIR, file), "utf8"), file);
  L.resolveSymbols(p.ast);
  L.checkTypes(p.ast);
  const errs = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length) {
    console.error(`FAIL-CLOSED (exit 2): ${file} has errors: ${errs.map((e) => e.message).join("; ")}`);
    process.exit(2);
  }
  return p;
}

// ---- the row table (R&D bridge 0145 rows 1-5; row 6 = maximal composition, pinned here) -------
const ROWS = [
  { param: "a: Int",                                                    expect: { name: "a", typeName: "Int",          isReadonly: false, isTainted: false, sourceFrom: "" } },
  { param: "readonly a: Int",                                           expect: { name: "a", typeName: "Int",          isReadonly: true,  isTainted: false, sourceFrom: "" } },
  { param: "tainted a: Int",                                            expect: { name: "a", typeName: "Int",          isReadonly: false, isTainted: true,  sourceFrom: "" } },
  { param: "a: Int source_from Origin",                                 expect: { name: "a", typeName: "Int",          isReadonly: false, isTainted: false, sourceFrom: "Origin" } },
  { param: "readonly tainted a: Int source_from Origin",                expect: { name: "a", typeName: "Int",          isReadonly: true,  isTainted: true,  sourceFrom: "Origin" } },
  { param: "tainted readonly b: Array<Token> source_from Network.ClientSocket", expect: { name: "b", typeName: "Array<Token>", isReadonly: true,  isTainted: true,  sourceFrom: "Network.ClientSocket" } },
];

// ---- run one source through the SELF-HOSTED pipeline and extract flows[0].params[0] -----------
const vStr = (s) => ({ __tag: "string", value: s });
const un = (v) => (v && typeof v === "object" && "value" in v && v.fields === undefined ? v.value : v);
function recField(rec, key) {
  if (!rec || !(rec.fields instanceof Map)) return undefined;
  return rec.fields.get(key);
}
async function parseFirstParam(lexerAst, parserAst, paramText) {
  const src = `pure flow probe(${paramText}) -> Int { return 0 }`;
  const lexRes = await L.executeFlow("tokenize", new Map([["source", vStr(src)]]), lexerAst);
  let toks = lexRes.value ?? lexRes;
  if (toks && toks.__tag === "ok") toks = toks.value;
  const parseRes = await L.executeFlow("parseFlows", new Map([["tokens", toks]]), parserAst);
  let pr = parseRes.value ?? parseRes;
  if (pr && pr.__tag === "ok") pr = pr.value;
  const flows = recField(pr, "flows");
  const flow0 = flows && Array.isArray(flows.items) ? flows.items[0] : undefined;
  const params = recField(flow0, "params");
  const p0 = params && Array.isArray(params.items) ? params.items[0] : undefined;
  if (!p0) return { __missing: true, raw: JSON.stringify({ hasFlows: !!flows, hasFlow0: !!flow0, hasParams: !!params }) };
  return {
    name: un(recField(p0, "name")),
    typeName: un(recField(p0, "typeName")),
    isReadonly: un(recField(p0, "isReadonly")),
    isTainted: un(recField(p0, "isTainted")),
    sourceFrom: un(recField(p0, "sourceFrom")),
  };
}

function compare(got, expect) {
  if (got.__missing) return ["param record missing from parse result (" + got.raw + ")"];
  const diffs = [];
  for (const k of Object.keys(expect)) {
    if (got[k] !== expect[k]) diffs.push(`${k}: expected ${JSON.stringify(expect[k])}, got ${JSON.stringify(got[k])}`);
  }
  return diffs;
}

async function runTable(rows, lexerAst, parserAst, label) {
  let failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const { param, expect } = rows[i];
    const got = await parseFirstParam(lexerAst, parserAst, param);
    const diffs = compare(got, expect);
    if (diffs.length) {
      failed++;
      console.log(`  ❌ row ${i + 1} \`${param}\` — ${diffs.join(" · ")}`);
    } else {
      console.log(`  ✅ row ${i + 1} \`${param}\``);
    }
  }
  console.log(`${label}: ${rows.length - failed}/${rows.length} rows green`);
  return failed;
}

// ---- main -------------------------------------------------------------------------------------
const SELF_TEST = process.argv.includes("--self-test");
console.log("== audit-flowparam-fidelity :: Stage-B twin parseParams qualifier fidelity (C4) ==");
const lexer = loadSelfHosted("lexer.fungi");
const parser = loadSelfHosted("parser.fungi");

if (SELF_TEST) {
  // RED leg: a deliberately wrong expectation MUST fail — a comparator that cannot go red is no gate.
  const redRows = [{ param: "readonly a: Int", expect: { ...ROWS[1].expect, isReadonly: false } }];
  console.log("-- self-test RED leg (wrong expectation must FAIL) --");
  const redFailed = await runTable(redRows, lexer.ast, parser.ast, "red-leg");
  // GREEN leg: the real table must pass.
  console.log("-- self-test GREEN leg (real table must PASS) --");
  const greenFailed = await runTable(ROWS, lexer.ast, parser.ast, "green-leg");
  if (redFailed === 1 && greenFailed === 0) {
    console.log("SELF-TEST PASS: comparator goes RED on a wrong expectation and GREEN on the table.");
    process.exit(0);
  }
  console.error(`SELF-TEST FAIL: red-leg failed=${redFailed} (want 1), green-leg failed=${greenFailed} (want 0).`);
  process.exit(1);
}

const failed = await runTable(ROWS, lexer.ast, parser.ast, "fidelity");
process.exit(failed === 0 ? 0 : 1);
