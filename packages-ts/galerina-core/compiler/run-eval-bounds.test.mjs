import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  collectRunFunctions,
  collectRunVariables,
  collectRunOutput,
} = require("./galerina.js");

function runSource(content) {
  const functions = collectRunFunctions(content);
  const variables = collectRunVariables(content, functions);
  return collectRunOutput(content, variables, functions);
}

test("a simple flow return is evaluated", () => {
  const output = runSource(`
pure flow greet() -> String { return "hi" }
print(greet())
`);
  assert.deepEqual(output, ["hi"]);
});

test("hostile: mutual recursion is refused by the visiting set", () => {
  const started = Date.now();
  const output = runSource(`
pure flow ping() -> String { return pong() }
pure flow pong() -> String { return ping() }
print(ping())
`);
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(output, [""]);
});

test("hostile: a 40-deep call chain is refused by the depth cap", () => {
  const lines = [];
  for (let i = 0; i < 40; i++) {
    lines.push(`pure flow f${i}() -> String { return f${i + 1}() }`);
  }
  lines.push(`pure flow f40() -> String { return "leaf" }`);
  lines.push("print(f0())");
  const started = Date.now();
  const output = runSource(lines.join("\n"));
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(output, [""]);
});
