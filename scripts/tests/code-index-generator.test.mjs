// code-index-generator.test.mjs — proves code-index check mode detects drift
// without mutating generated evidence.
// Version: 1.0.0 · Task 7 generator governance.
// Related: scripts/code-index.mjs; scripts/lib/generator-contract.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const SCRIPT = resolve("scripts/code-index.mjs");

/**
 * Write one fixture file, creating its parent directories.
 *
 * @param {string} root fixture root
 * @param {string} relativePath fixture-relative path
 * @param {string} content exact file content
 */
function write(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Run the real generator against an isolated fixture root.
 *
 * @param {string} root fixture root
 * @param {readonly string[]} args generator arguments
 */
function run(root, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SOURCE_DATE_EPOCH: "1700000000" },
  });
}

test("code-index --check refuses missing and drifted output without writing", () => {
  const root = mkdtempSync(join(tmpdir(), "code-index-generator-"));
  const markdown = join(root, "build", "code-index", "CODE_INDEX.md");
  try {
    write(
      root,
      "packages-ts/example/src/index.ts",
      'export const EXAMPLE = { code: "FUNGI-TEST-001", name: "EXAMPLE", severity: "error" };\n',
    );

    const missing = run(root, ["--check"]);
    assert.notEqual(missing.status, 0);
    assert.equal(existsSync(markdown), false);

    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);

    const current = run(root, ["--check"]);
    assert.equal(current.status, 0, current.stderr);

    writeFileSync(markdown, "tampered\n");
    const drifted = run(root, ["--check"]);
    assert.notEqual(drifted.status, 0);
    assert.equal(readFileSync(markdown, "utf8"), "tampered\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("code-index keeps one-line diagnostic metadata inside its own definition", () => {
  const root = mkdtempSync(join(tmpdir(), "code-index-definition-boundary-"));
  try {
    write(
      root,
      "packages-ts/example/src/index.ts",
      [
        'export const FIRST = { code: "FUNGI-TEST-001", name: "FIRST", severity: "error" } as const;',
        "export const SECOND = {",
        '  code: "FUNGI-TEST-002",',
        '  name: "SECOND",',
        '  severity: "warning",',
        "} as const;",
        "",
      ].join("\n"),
    );

    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);

    const index = JSON.parse(
      readFileSync(join(root, "build", "code-index", "code-index.json"), "utf8"),
    );
    const first = index.find(({ code }) => code === "FUNGI-TEST-001");
    assert.deepEqual(first?.names, ["FIRST"]);
    assert.deepEqual(first?.severities, ["error"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("code-index records bounded parser diagnostic emit calls only", () => {
  const root = mkdtempSync(join(tmpdir(), "code-index-parser-emit-"));
  try {
    write(
      root,
      "packages-ts/example/src/diagnostics.ts",
      [
        "export const PARSER_DIAGNOSTIC = {",
        '  code: "FUNGI-TEST-001",',
        '  name: "PARSER_DIAGNOSTIC",',
        '  severity: "error",',
        "} as const;",
        "",
      ].join("\n"),
    );
    write(
      root,
      "packages-ts/example/src/parser.ts",
      [
        "class Parser {",
        "  parse(): void {",
        "    this.emit(",
        "      PARSER_DIAGNOSTIC.code,",
        "      PARSER_DIAGNOSTIC.name,",
        '      "message",',
        "    );",
        '    this.emit("FUNGI-TEST-003", "LITERAL_DIAGNOSTIC", "message");',
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    write(
      root,
      "packages-ts/example/src/event-bus.ts",
      'bus.emit("FUNGI-TEST-002", "not a diagnostic");\n',
    );

    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);

    const index = JSON.parse(
      readFileSync(join(root, "build", "code-index", "code-index.json"), "utf8"),
    );
    const diagnostic = index.find(({ code }) => code === "FUNGI-TEST-001");
    const unrelated = index.find(({ code }) => code === "FUNGI-TEST-002");
    const literal = index.find(({ code }) => code === "FUNGI-TEST-003");
    assert.deepEqual(diagnostic?.emits, [
      "packages-ts/example/src/parser.ts:3",
    ]);
    assert.deepEqual(diagnostic?.names, ["PARSER_DIAGNOSTIC"]);
    assert.deepEqual(unrelated?.emits, []);
    assert.deepEqual(literal?.emits, [
      "packages-ts/example/src/parser.ts:8",
    ]);
    assert.deepEqual(literal?.names, ["LITERAL_DIAGNOSTIC"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("code-index includes Rust runtime error definitions, mappings, and tests", () => {
  const root = mkdtempSync(join(tmpdir(), "code-index-rust-runtime-errors-"));
  try {
    write(
      root,
      "packages-ts/example/native/src/errors.rs",
      [
        "pub struct RuntimeErrorCode {",
        "    pub code: &'static str,",
        "    pub name: &'static str,",
        "    pub severity: &'static str,",
        "    pub message: &'static str,",
        "}",
        "pub const ERR_EXAMPLE_REFUSED: RuntimeErrorCode = RuntimeErrorCode {",
        '    code: "ERR_EXAMPLE_REFUSED",',
        '    name: "EXAMPLE_REFUSED",',
        '    severity: "error",',
        '    message: "example refused",',
        "};",
        "fn runtime_code(error: Error) -> &'static RuntimeErrorCode {",
        "    match error { Error::Example => &ERR_EXAMPLE_REFUSED }",
        "}",
        "fn merely_mentions_code() { let _ = ERR_EXAMPLE_REFUSED; }",
        "",
      ].join("\n"),
    );
    write(
      root,
      "packages-ts/example/native/src/tests.rs",
      "#[test] fn code_is_stable() { assert_eq!(ERR_EXAMPLE_REFUSED.code, \\\"ERR_EXAMPLE_REFUSED\\\"); }\n",
    );

    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);

    const index = JSON.parse(
      readFileSync(join(root, "build", "code-index", "code-index.json"), "utf8"),
    );
    const item = index.find(({ code }) => code === "ERR_EXAMPLE_REFUSED");
    assert.deepEqual(item?.names, ["EXAMPLE_REFUSED"]);
    assert.deepEqual(item?.severities, ["error"]);
    assert.deepEqual(item?.defs, ["packages-ts/example/native/src/errors.rs:7"]);
    assert.deepEqual(item?.emits, ["packages-ts/example/native/src/errors.rs:14"]);
    assert.deepEqual(item?.allSites.filter((site) => site.startsWith("ref ")), [
      "ref packages-ts/example/native/src/errors.rs:16",
    ]);
    assert.equal(item?.tests, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
