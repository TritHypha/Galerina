import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProgram, checkTypes } from "../dist/index.js";

function errors(source) {
  const parsed = parseProgram(source, "pipeline.fungi");
  const parseErrors = parsed.diagnostics.filter((d) => d.severity === "error");
  if (parseErrors.length > 0) return parseErrors;
  return checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error");
}

test("unknown method on Array is FUNGI-PIPELINE-001", () => {
  const diags = errors(`
pure flow bad(xs: Array<Int>) -> Int {
  return xs.notAMethod()
}
`);
  assert.ok(
    diags.some((d) => d.code === "FUNGI-PIPELINE-001"),
    `got ${diags.map((d) => d.code).join(", ") || "(none)"}`,
  );
});

test("append then length on Array is admitted", () => {
  const diags = errors(`
pure flow ok(xs: Array<Int>) -> Int {
  return xs.append(1).length
}
`);
  assert.equal(
    diags.some((d) => d.code.startsWith("FUNGI-PIPELINE-")),
    false,
    `pipeline diagnostics: ${diags.map((d) => d.code).join(", ")}`,
  );
});

test("Map.empty and keys are admitted type-name constructors", () => {
  const diags = errors(`
pure flow ok() -> Array<String> {
  let values: Map<String, Int> = Map.empty()
  return values.keys()
}
`);
  assert.equal(
    diags.some((d) => d.code.startsWith("FUNGI-PIPELINE-")),
    false,
    `pipeline diagnostics: ${diags.map((d) => d.code).join(", ")}`,
  );
});

test("fs.readText is admitted as a stdlib module method", () => {
  const diags = errors(`
guarded flow read() -> String
contract { effects { storage.read } }
{
  return fs.readText("/tmp/x")
}
`);
  assert.equal(
    diags.some((d) => d.code.startsWith("FUNGI-PIPELINE-")),
    false,
    `pipeline diagnostics: ${diags.map((d) => d.code).join(", ")}`,
  );
});

test("unbound PascalCase service constructors are not PIPELINE-001", () => {
  const diags = errors(`
pure flow charge() -> Int {
  return PaymentGateway.charge(1)
}
`);
  assert.equal(
    diags.some((d) => d.code.startsWith("FUNGI-PIPELINE-")),
    false,
    `pipeline diagnostics: ${diags.map((d) => d.code).join(", ")}`,
  );
});

test("lowercase unknown receivers still refuse unknown methods", () => {
  const diags = errors(`
pure flow bad(gateway: Int) -> Int {
  return gateway.charge(1)
}
`);
  assert.ok(
    diags.some((d) => d.code === "FUNGI-PIPELINE-001"),
    `got ${diags.map((d) => d.code).join(", ") || "(none)"}`,
  );
});

test("Array.map of a Result-returning callback traverses to Result<Array<T>, E>", () => {
  const diags = errors(`
pure flow classify(t: String) -> Result<String, String> {
  return Ok(t)
}
pure flow batch(texts: Array<String>) -> Result<Array<String>, String> {
  let labels = texts.map(classify)?
  return Ok(labels)
}
`);
  assert.equal(
    diags.filter((d) => d.code === "FUNGI-TYPE-008" || d.code.startsWith("FUNGI-PIPELINE-")).length,
    0,
    `got ${diags.map((d) => d.code).join(", ") || "(none)"}`,
  );
});
