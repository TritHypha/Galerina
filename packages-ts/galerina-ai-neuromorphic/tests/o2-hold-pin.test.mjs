// O2 HOLD pin (2026-10-08). Counsel / element-map / provenance stay HOLD.
// This file pins the package-side remainder: one src file, empty border,
// four pure exports, TODO row still [HOLD]. It does not add an execution API.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import * as neuromorphic from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("O2 HOLD pin: package stays private, post-v1, non-executing", () => {
  it("src contains only index.ts", () => {
    const names = readdirSync(join(ROOT, "src")).filter((name) => name.endsWith(".ts")).sort();
    assert.deepEqual(names, ["index.ts"]);
  });

  it("keeps an empty package border", () => {
    const policy = JSON.parse(readFileSync(join(ROOT, ".graph", "boundary-policy.json"), "utf8"));
    assert.deepEqual(policy.allowedExternal, []);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.equal(pkg.private, true);
    assert.equal(Object.hasOwn(pkg, "dependencies"), false);
  });

  it("keeps the four pure runtime exports and no extra dist entry", () => {
    assert.deepEqual(Object.keys(neuromorphic).sort(), [
      "createNeuromorphicReport",
      "validateNeuromorphicPlan",
      "validateSpikeTrain",
      "validateSpikingModel",
    ]);
    const distNames = readdirSync(join(ROOT, "dist")).filter((name) => name.endsWith(".js")).sort();
    assert.deepEqual(distNames, ["index.js"]);
  });

  it("TODO counsel / element-map row stays HOLD", () => {
    const todo = readFileSync(join(ROOT, "TODO.md"), "utf8");
    assert.match(todo, /^\[HOLD\] Obtain a new element map, provenance review and qualified counsel decision/mu);
    assert.match(todo, /Owner decision 2026-10-06 10:14 BST \(O2, Phillip\)/u);
    assert.match(todo, /no legal opinion will be sought now/u);
    assert.equal(/^\[x\] Obtain a new element map/mu.test(todo), false);
  });
});
