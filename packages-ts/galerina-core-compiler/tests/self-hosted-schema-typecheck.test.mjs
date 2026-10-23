import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const selfHosted = join(here, "../src/self-hosted");

function stripVersion(file) {
  return readFileSync(join(selfHosted, file), "utf8").replace(/^@version 1\s*/m, "");
}

function typeDiagnosticsFor(file) {
  const source = ["lexer.fungi", "parser.fungi", file]
    .map(stripVersion)
    .join("\n");
  return L.checkProgram(`@version 1\n${source}`, file);
}

describe("self-hosted modules preserve concrete schema types", () => {
  for (const file of ["effect-checker.fungi", "governance-verifier.fungi"]) {
    it(`${file} has no Auto/String or Auto/record type errors`, () => {
      const checked = typeDiagnosticsFor(file);
      assert.equal(checked.ok, true, `${file} should pass the full checked-program gate: ${JSON.stringify(checked.diagnostics ?? checked)}`);
      assert.deepEqual(checked.diagnostics ?? [], [], `${file} type diagnostics`);
    });
  }
});
