import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseProgram } from "../dist/index.js";
import { compileFile, MAX_COMPILER_SOURCE_BYTES } from "../dist/cli.js";

test("shallow unary minus still parses without PARSE-DEPTH", () => {
  const r = parseProgram("flow f() -> Int { return -1 }", "unary.fungi");
  assert.equal(
    r.diagnostics.some((d) => d.code === "FUNGI-PARSE-DEPTH-001"),
    false,
  );
});

test("hostile: a 300-long unary-not chain is refused as PARSE-DEPTH-001", () => {
  const src = `flow f() -> Bool { return ${"!".repeat(300)}true }`;
  const r = parseProgram(src, "unary-chain.fungi");
  assert.equal(
    r.diagnostics.some((d) => d.code === "FUNGI-PARSE-DEPTH-001"),
    true,
    `expected FUNGI-PARSE-DEPTH-001, got ${r.diagnostics.map((d) => d.code).join(",")}`,
  );
});

test("compileFile refuses a source larger than the intake ceiling", () => {
  const dir = mkdtempSync(join(tmpdir(), "galerina-src-bound-"));
  const file = join(dir, "huge.fungi");
  try {
    writeFileSync(file, Buffer.alloc(MAX_COMPILER_SOURCE_BYTES + 1));
    const r = compileFile(file, "check");
    assert.equal(r.diagnostics.some((d) => /intake ceiling|Cannot read file/.test(d.message)), true);
    assert.equal(r.diagnostics.some((d) => d.severity === "error"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
