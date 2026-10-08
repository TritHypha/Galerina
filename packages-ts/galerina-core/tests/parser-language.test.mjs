import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const { parseFile } = require("../compiler/parser.js");
const { createProgramAst, mergeFileAst, fileRecord } = require("../compiler/ast.js");
const { buildSymbolTable } = require("../compiler/symbol-table.js");
const { admitSuggestCommand, suggestVector } = require("../compiler/vector-suggest.js");

function source(relativePath, content) {
  return { relativePath, content, path: relativePath };
}

describe("parser / AST / symbol table", () => {
  it("parses a secure flow into AST and symbol table", () => {
    const diagnostics = [];
    const fileAst = parseFile(source("hello.fungi", `secure flow main() -> Result<Void, Error> {
  return Ok()
}
`), diagnostics);
    const ast = createProgramAst("0.1.0-prototype", ".");
    ast.files.push(fileRecord("hello.fungi", "abc", 3));
    mergeFileAst(ast, fileAst);
    const symbols = buildSymbolTable(ast, diagnostics);
    assert.equal(fileAst.flows[0].name, "main");
    assert.equal(ast.language, "Galerina");
    assert.equal(symbols.flows.main.qualifier, "secure");
  });

  it("refuses unknown suggest commands", () => {
    const refused = admitSuggestCommand("refactor");
    assert.equal(refused.status, "REFUSED");
    assert.equal(admitSuggestCommand("vector").status, "ADMITTED");
  });

  it("does not rewrite source when suggesting vector loops", () => {
    const project = {
      files: [source("loop.fungi", `flow total(order: Order) -> Int {
  let totals = []
  for item in order.items {
    totals.add(item.price * item.quantity)
  }
  return 0
}
`)]
    };
    const report = suggestVector(project);
    assert.equal(report.rewritten, false);
    assert.equal(report.suggestions.length, 1);
  });
});
