/**
 * RD-1295: governance / cli-check load set is a closed module graph.
 * Export names are not evidence — this walks the actual emitted JS imports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

import {
  Verdict,
  collapse,
  authorize,
  decideAtBoundary,
  allOf,
  vAnd,
  governAiProposal,
  forbiddenProfileModules,
  GOVERNANCE_FORBIDDEN_MODULES,
} from "../dist/governance.js";

const here = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(here, "..", "dist");
const GOVERNANCE_JS = join(DIST, "governance.js");

function relativeImports(file) {
  const text = readFileSync(file, "utf8");
  const found = [];
  for (const match of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    found.push(match[1]);
  }
  for (const match of text.matchAll(/import\s*\(\s*["'](\.[^"']+)["']\s*\)/g)) {
    found.push(match[1]);
  }
  return found;
}

function walkRuntimeGraph(entry) {
  const loaded = new Set();
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (loaded.has(file)) continue;
    loaded.add(file);
    let source;
    try {
      source = file;
      readFileSync(source);
    } catch {
      if (!file.endsWith(".js")) {
        queue.push(`${file}.js`);
      }
      continue;
    }
    for (const spec of relativeImports(source)) {
      const next = resolve(dirname(source), spec);
      queue.push(next.endsWith(".js") ? next : `${next}.js`);
    }
  }
  return [...loaded];
}

test("cli-check governance entry admits Allow and denies Unknown/Deny at the boundary", () => {
  const { ALLOW, DENY, INDETERMINATE } = Verdict;
  assert.equal(collapse(ALLOW), "allow");
  assert.equal(authorize(ALLOW), true);
  assert.equal(decideAtBoundary(ALLOW).authorized, true);
  assert.equal(decideAtBoundary(DENY).authorized, false);
  assert.equal(decideAtBoundary(INDETERMINATE).authorized, false);
  assert.ok(
    JSON.stringify(decideAtBoundary(INDETERMINATE).diagnostic).includes("FUNGI-GOV-3VL-001"),
    "unknown at the boundary must emit FUNGI-GOV-3VL-001",
  );
  assert.equal(allOf([ALLOW, ALLOW]), ALLOW);
  assert.equal(vAnd(ALLOW, INDETERMINATE), INDETERMINATE);
  assert.equal(vAnd(ALLOW, DENY), DENY);
});

test("No-Coercion: an AI ALLOW cannot enlarge a core DENY", () => {
  const { ALLOW, DENY } = Verdict;
  const result = governAiProposal([
    { action: "database.delete", coreVerdict: DENY, aiVerdict: ALLOW },
    { action: "database.read", coreVerdict: ALLOW, aiVerdict: ALLOW },
  ]);
  assert.equal(result.containmentHeld, true);
  assert.equal(result.noCoercionHeld, true);
  assert.deepEqual(result.admitted, ["database.read"]);
  assert.deepEqual(result.blockedHallucinations, ["database.delete"]);
});

test("governance runtime graph does not load forbidden profile modules", () => {
  const loaded = walkRuntimeGraph(GOVERNANCE_JS);
  const forbidden = forbiddenProfileModules(loaded, GOVERNANCE_FORBIDDEN_MODULES);
  assert.deepEqual(
    forbidden,
    [],
    `cli-check/governance loaded forbidden modules: ${forbidden.join(", ")}\n${loaded.join("\n")}`,
  );
  assert.ok(loaded.some((f) => f.replace(/\\/g, "/").endsWith("/trit-gates.js")));
  assert.ok(loaded.some((f) => f.replace(/\\/g, "/").endsWith("/three-valued-governance.js")));
});

test("the compatibility barrel still loads inference; that is not the cli-check graph", () => {
  const barrel = walkRuntimeGraph(join(DIST, "index.js"));
  const forbiddenOnBarrel = forbiddenProfileModules(barrel, ["hybrid-engine", "tpl-simulator"]);
  assert.ok(
    forbiddenOnBarrel.includes("hybrid-engine") || forbiddenOnBarrel.includes("tpl-simulator"),
    "the root barrel remains a compatibility surface that loads inference/TPL — isolation is the /governance entry",
  );
});

test("Node package exports resolve /governance without the barrel", () => {
  const req = createRequire(pathToFileURL(join(here, "x.js")));
  const pkg = req("../package.json");
  assert.equal(typeof pkg.exports["./governance"].import, "string");
  assert.ok(pkg.exports["./governance"].import.endsWith("governance.js"));
});
