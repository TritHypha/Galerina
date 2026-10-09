import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRustRuntimeErrorDefinitions } from "../lib/rust-runtime-error-codes.mjs";

const live = `pub const ERR_REAL: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_REAL",
    name: "REAL",
    severity: "error",
    message: "real // not a comment",
};`;

test("Rust definitions exclude nested comments and string examples", () => {
  const source = `/* outer /* nested */\n${live}\n*/\nconst EXAMPLE: &str = r###"\n${live}\n"###;\n${live}`;
  const defs = parseRustRuntimeErrorDefinitions(source);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].message, "real // not a comment");
  assert.equal(defs[0].line, 17);
});

test("Rust definition locations do not consume preceding blank lines", () => {
  const defs = parseRustRuntimeErrorDefinitions(`\n\n${live}`);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].line, 3);
});

test("an unfinished example inside a raw string cannot swallow the next declaration", () => {
  const source = `const EXAMPLE: &str = r#"
pub const ERR_FAKE: RuntimeErrorCode = RuntimeErrorCode {
"#;
${live.replace('severity: "error"', 'severity: "fatal"')}`;
  const defs = parseRustRuntimeErrorDefinitions(source);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].code, "ERR_REAL");
  assert.equal(defs[0].severity, "fatal");
});

test("raw-string metadata cannot impersonate other fields", () => {
  const source = `pub const ERR_REAL: RuntimeErrorCode = RuntimeErrorCode {
    code: "ERR_REAL",
    name: "REAL",
    message: r#"
    severity: "error",
    message: "fake",
    "#,
    severity: "fatal",
};`;
  const defs = parseRustRuntimeErrorDefinitions(source);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].severity, "fatal");
  assert.equal(defs[0].message, undefined, "unsupported raw-string metadata must be invalid, not spoofed");
});
