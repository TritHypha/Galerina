/**
 * RD-1295: app-kernel must import Tower subpaths, not the root barrel.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");
const BARREL = /from\s+["']@galerina\/tower-citizen["']/;
const SUBPATH = /from\s+["']@galerina\/tower-citizen\/(governance|custody)["']/;

function listTs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".ts")) out.push(join(dir, name));
  }
  return out;
}

test("positive: kernel.ts imports Tower /governance only", () => {
  const text = readFileSync(join(src, "kernel.ts"), "utf8");
  assert.equal(BARREL.test(text), false);
  assert.match(text, /@galerina\/tower-citizen\/governance/);
  assert.equal(/@galerina\/tower-citizen\/(?!governance)/.test(text), false);
});

test("hostile: no app-kernel src file imports the Tower root barrel", () => {
  const hits = [];
  for (const file of listTs(src)) {
    const text = readFileSync(file, "utf8");
    if (BARREL.test(text)) hits.push(file.replace(/\\/g, "/"));
  }
  assert.deepEqual(hits, []);
});

test("registry modules import /custody (and /governance when they fold trits)", () => {
  const generation = readFileSync(join(src, "registry-generation.ts"), "utf8");
  assert.equal(BARREL.test(generation), false);
  assert.match(generation, SUBPATH);
  const authority = readFileSync(join(src, "registry-rotation-authority.ts"), "utf8");
  assert.match(authority, /@galerina\/tower-citizen\/governance/);
  assert.match(authority, /@galerina\/tower-citizen\/custody/);
  assert.equal(BARREL.test(authority), false);
});
