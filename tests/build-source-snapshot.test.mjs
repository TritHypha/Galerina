import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "galerina.mjs");

test("build signs the initially captured source string, not a later reread", () => {
  const src = readFileSync(CLI, "utf8");
  const capture = src.indexOf("const source = readUntrustedSource(fungiFile)");
  const gen = src.indexOf("generateManifest(", capture);
  assert.ok(capture >= 0 && gen > capture);
  const between = src.slice(capture, gen);
  assert.doesNotMatch(between, /readFileSync\(\s*fungiFile/);
  assert.match(src.slice(gen, gen + 120), /generateManifest\(\s*\n?\s*source\s*,/);
});
