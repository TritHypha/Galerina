import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { analyseProject } = require("../compiler/galerina.js");
const { checkSecurity } = require("../compiler/security-checker.js");
const { checkEffects } = require("../compiler/effect-checker.js");
const { checkJsonApi } = require("../compiler/json-api-checker.js");
const { checkVectorOffloadSafety } = require("../compiler/vector-offload-safety.js");
const { SCHEMA, buildIr, admitIr } = require("../compiler/ir.js");
const { optimiseIr } = require("../compiler/optimiser.js");
const { linkIr } = require("../compiler/linker.js");
const { emitCpuOutput } = require("../compiler/cpu-output.js");
const { emitWasmOutput } = require("../compiler/wasm-output.js");
const { generateCompilerReport } = require("../compiler/report-generator.js");
const { parseFile } = require("../compiler/parser.js");
const { createProgramAst, mergeFileAst, fileRecord } = require("../compiler/ast.js");
const { buildSymbolTable } = require("../compiler/symbol-table.js");

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "compiler", "galerina.js");
const hello = join(here, "..", "examples", "hello.fungi");

function projectFromSource(fileName, content) {
  return {
    root: "(memory)",
    input: "(memory)",
    files: [{ path: fileName, relativePath: fileName, content }]
  };
}

function parseOne(fileName, content) {
  const diagnostics = [];
  const source = { relativePath: fileName, content, path: fileName };
  const fileAst = parseFile(source, diagnostics);
  const ast = createProgramAst("0.1.0-prototype", ".");
  ast.files.push(fileRecord(fileName, "abc", 1));
  mergeFileAst(ast, fileAst);
  const symbols = buildSymbolTable(ast, diagnostics);
  return { ast, symbols, diagnostics, project: projectFromSource(fileName, content) };
}

describe("compiler pipeline", () => {
  it("security checker blocks server-only imports in a browser target", () => {
    const parsed = parseOne("browser-import.fungi", `target browser {
  enabled true
}
import server.database
secure flow main() -> Result<Void, Error> {
  return Ok()
}
`);
    checkSecurity(parsed.ast, parsed.diagnostics);
    assert.equal(parsed.diagnostics.some((item) => item.errorType === "BrowserImportBlocked"), true);
  });

  it("effect checker refuses I/O inside a pure flow", () => {
    const parsed = parseOne("pure-io.fungi", `pure flow load() -> Result<String, Error> {
  let text = readFile("x.txt")
  return Ok(text)
}
`);
    checkEffects(parsed.ast, parsed.diagnostics);
    assert.equal(parsed.diagnostics.some((item) => item.errorType === "PureFlowEffect"), true);
  });

  it("effect checker refuses undeclared database use when effects are listed", () => {
    const parsed = parseOne("effects.fungi", `flow save() -> Result<Void, Error>
effects [network.outbound] {
  database.write(row)
  return Ok()
}
`);
    checkEffects(parsed.ast, parsed.diagnostics);
    assert.equal(parsed.diagnostics.some((item) => item.errorType === "UndeclaredEffect"), true);
  });

  it("JSON/API checker refuses a POST route without handler and max_body_size", () => {
    const parsed = parseOne("api-bad.fungi", `api OrdersApi {
  POST "/orders" {
    request CreateOrderRequest
    response CreateOrderResponse
  }
}
`);
    checkJsonApi(parsed.ast, parsed.symbols, parsed.diagnostics);
    const hits = parsed.diagnostics.filter((item) => item.errorType === "JsonApiCheckError");
    assert.equal(hits.length >= 2, true);
  });

  it("vector/offload safety refuses a vector block with a database write", () => {
    const parsed = parseOne("vector-io.fungi", `flow run() -> Result<Void, Error> {
  let results = vector users {
    user => saveToDatabase(user)
  }
  return Ok()
}
`);
    checkVectorOffloadSafety(parsed.project, parsed.ast, parsed.diagnostics);
    assert.equal(parsed.diagnostics.some((item) => item.errorType === "VectorOffloadSafetyError"), true);
  });

  it("vector/offload safety refuses an offload node with I/O and no policy", () => {
    const parsed = parseOne("offload-io.fungi", `flow handle() -> Result<Void, Error> {
  offload AuditNode {
    writeFile("audit.log")
  }
  return Ok()
}
`);
    checkVectorOffloadSafety(parsed.project, parsed.ast, parsed.diagnostics);
    assert.equal(parsed.diagnostics.some((item) => item.errorType === "VectorOffloadSafetyError"), true);
  });

  it("IR, optimiser, linker and CPU/WASM prototypes stay non-executable placeholders", () => {
    const result = analyseProject(projectFromSource("hello.fungi", `secure flow main() -> Result<Void, Error> {
  print("hello from Galerina")
  return Ok()
}
`));
    const ir = buildIr(result.ast, result.symbols);
    assert.equal(ir.schema, SCHEMA);
    assert.equal(admitIr(ir).status, "ADMITTED");
    const opt = optimiseIr(ir, result.diagnostics);
    assert.equal(opt.status, "ADMITTED");
    assert.equal(opt.rewritten, false);
    const linked = linkIr(opt.ir, result.symbols, result.diagnostics);
    assert.equal(linked.status, "ADMITTED");
    const cpu = emitCpuOutput(linked);
    const wasm = emitWasmOutput(linked);
    assert.equal(cpu.executable, false);
    assert.equal(wasm.executable, false);
    assert.equal(cpu.runtimeStatus, "placeholder");
    assert.equal(wasm.runtimeStatus, "placeholder");
    const report = generateCompilerReport(result, result.pipeline);
    assert.equal(report.schema, "galerina.core.compiler-report.v1");
    assert.equal(result.pipeline.report.schema, "galerina.core.compiler-report.v1");
  });

  it("optimiser refuses when vector/offload safety errors are present", () => {
    const ir = { schema: SCHEMA, units: [] };
    const opt = optimiseIr(ir, [{ severity: "error", errorType: "VectorOffloadSafetyError" }]);
    assert.equal(opt.status, "REFUSED");
    assert.equal(opt.rewritten, false);
  });

  it("hello.fungi still has no pipeline errors", () => {
    const result = analyseProject(projectFromSource("hello.fungi", `secure flow main() -> Result<Void, Error>
contract { intent { "Print the canonical Galerina greeting." } }
{
  print("hello from Galerina")
  return Ok()
}
`));
    const errors = result.diagnostics.filter((item) => item.severity === "error");
    assert.equal(errors.length, 0, errors.map((item) => item.errorType + " " + item.problem).join("; "));
  });

  it("Galerina lint runs without writing artefacts", () => {
    const run = spawnSync(process.execPath, [cli, "lint", hello], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(run.stdout.includes("Galerina check:"), true);
  });
});
