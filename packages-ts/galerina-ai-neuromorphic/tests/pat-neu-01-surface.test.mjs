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
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import ts from "typescript";

import * as neuromorphic from "../dist/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const SRC_DIR = join(PACKAGE_ROOT, "src");

const AUTHORITY_NAME = /(?:^|[^a-z])(?:execut|run|start|spawn|implant|actuat|reconfigur|evolv|deploy|dispatch|invoke|fire|stimulat|train|learn|delay|refractor|topolog|admit|authori[sz]|grant)/iu;

async function sourceFiles() {
  const names = (await readdir(SRC_DIR)).filter((name) => name.endsWith(".ts")).sort();
  const files = [];
  for (const name of names) {
    const path = join(SRC_DIR, name);
    const text = await readFile(path, "utf8");
    files.push({
      name,
      path,
      text,
      file: ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
    });
  }
  return files;
}

function namedDeclaration(node) {
  return ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
    || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertyAssignment(node)
    || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)
    || ts.isGetAccessor(node) || ts.isSetAccessor(node) || ts.isEnumMember(node)
    || ts.isShorthandPropertyAssignment(node)
    || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node);
}

function allDeclaredNames(file) {
  const names = [];
  const visit = (node) => {
    if (namedDeclaration(node) && node.name !== undefined) {
      if (ts.isComputedPropertyName(node.name)) names.push("[computed]");
      else if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) names.push(node.name.text);
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
  it("keeps src to a single index.ts (extra files are a PAT-NEU-01 stop)", async () => {
    const files = await sourceFiles();
    assert.deepEqual(files.map((entry) => entry.name), ["index.ts"]);
  });

  it("has no import, require, dynamic import or module side door", async () => {
    for (const entry of await sourceFiles()) {
      const found = [];
      const visit = (node) => {
        if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) found.push("import");
        if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) found.push("re-export");
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("dynamic import");
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") found.push("require");
        ts.forEachChild(node, visit);
      };
      visit(entry.file);
      assert.deepEqual(found, [], entry.name);
    }
  });

  it("references no execution, I/O, timer or global-object primitive", async () => {
    const banned = /\b(?:eval|Function|WebAssembly|process|globalThis|window|self|setTimeout|setInterval|setImmediate|queueMicrotask|fetch|Worker|SharedArrayBuffer|Atomics|Reflect|Proxy)\b/gu;
    for (const entry of await sourceFiles()) {
      const code = stripComments(entry.text);
      assert.deepEqual(code.match(banned) ?? [], [], entry.name);
    }
  });

  it("declares no authority-shaped name anywhere (functions, consts, methods, types, fields)", async () => {
    for (const entry of await sourceFiles()) {
      const names = allDeclaredNames(entry.file);
      assert.equal(names.includes("[computed]"), false, entry.name);
      assert.deepEqual(names.filter((name) => AUTHORITY_NAME.test(name)), [], entry.name);
    }
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
