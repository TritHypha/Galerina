// PAT-NEU-01 surface guard (O2: private, post-v1, NON-EXECUTING).
// The boundary tests in pat-neu-01-boundary.test.mjs check function and class
// declaration names. This file closes the remaining routes by which an
// execution surface could arrive without tripping them:
//   - exported const/let arrow functions and object methods,
//   - any import, require, dynamic import, eval, Function, WebAssembly,
//     process, timer or global-object reference in the source,
//   - a widened runtime export surface,
//   - a report that grows authority-like fields or mutates its input.
// Any of these failing means a PAT-NEU-01 stop-and-review, not a test update.
// Zero-trust default; the owner may revisit after v1.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import ts from "typescript";

import * as neuromorphic from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const SOURCE_PATH = join(PACKAGE_ROOT, "src", "index.ts");

const AUTHORITY_NAME = /(?:^|[^a-z])(?:execut|run|start|spawn|implant|actuat|reconfigur|evolv|deploy|dispatch|invoke|fire|stimulat|train|learn|delay|refractor|topolog|admit|authori[sz]|grant)/iu;

async function parsedSource() {
  const text = await readFile(SOURCE_PATH, "utf8");
  return { text, file: ts.createSourceFile(SOURCE_PATH, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS) };
}

function allDeclaredNames(file) {
  const names = [];
  const visit = (node) => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
      || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertyAssignment(node)
      || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node))
      && node.name !== undefined && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      names.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:"'`])\/\/.*$/gmu, "$1");
}

describe("PAT-NEU-01 surface guard (O2 non-executing)", () => {
  it("has no import, require, dynamic import or module side door", async () => {
    const { file } = await parsedSource();
    const found = [];
    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) found.push("import");
      if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) found.push("re-export");
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("dynamic import");
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") found.push("require");
      ts.forEachChild(node, visit);
    };
    visit(file);
    assert.deepEqual(found, []);
  });

  it("references no execution, I/O, timer or global-object primitive", async () => {
    const { text } = await parsedSource();
    const code = stripComments(text);
    const banned = /\b(?:eval|Function|WebAssembly|process|globalThis|window|self|setTimeout|setInterval|setImmediate|queueMicrotask|fetch|Worker|SharedArrayBuffer|Atomics|Reflect|Proxy)\b/gu;
    assert.deepEqual(code.match(banned) ?? [], []);
  });

  it("declares no authority-shaped name anywhere (functions, consts, methods, types, fields)", async () => {
    const { file } = await parsedSource();
    assert.deepEqual(allDeclaredNames(file).filter((name) => AUTHORITY_NAME.test(name)), []);
  });

  it("keeps the runtime export surface to the four pure validators/report builder", () => {
    assert.deepEqual(Object.keys(neuromorphic).sort(), [
      "createNeuromorphicReport",
      "validateNeuromorphicPlan",
      "validateSpikeTrain",
      "validateSpikingModel",
    ]);
    for (const value of Object.values(neuromorphic)) assert.equal(typeof value, "function");
  });

  it("builds a report with only plans and warnings, and does not mutate its input", () => {
    const plan = Object.freeze({
      flow: "classify", model: "snn", targetPreference: Object.freeze([]),
      fallback: "cpu", maxEvents: 10, timeoutMs: 5,
    });
    const input = Object.freeze({ plans: Object.freeze([plan]) });
    const report = neuromorphic.createNeuromorphicReport(input);
    assert.deepEqual(Object.keys(report).sort(), ["plans", "warnings"]);
    assert.equal(report.plans, input.plans);
    assert.equal(report.warnings.length, 1);
    assert.match(report.warnings[0], /fallback/u);
  });

  it("reports an execution-shaped request field as data only: no field is added, nothing is admitted", () => {
    const plan = {
      flow: "f", model: "m", targetPreference: ["loihi"], fallback: "reject",
      maxEvents: 1, timeoutMs: 1, execute: true, actuate: "motor-0",
    };
    const report = neuromorphic.createNeuromorphicReport({ plans: [plan] });
    assert.deepEqual(Object.keys(report).sort(), ["plans", "warnings"]);
    assert.deepEqual(report.warnings, []);
    for (const key of ["executed", "admitted", "authorized", "authorised", "lease", "handle"]) {
      assert.equal(Object.hasOwn(report, key), false, key);
    }
  });
});
