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

test("code-index distinguishes descriptive registry entries from runtime emissions", () => {
  const root = mkdtempSync(join(tmpdir(), "code-index-registry-role-"));
  try {
    write(root, "packages-ts/example/src/report-codes.ts", [
      "const freeze = (entries) => Object.freeze(entries);",
      "export const REPORT_CODES = freeze([",
      '  { code: "FUNGI-REPORT-002", meaning: "Required audit field is missing" },',
      "]);",
      'export function failure() { return { code: "FUNGI-REPORT-002", message: "missing" }; }',
      "",
    ].join("\n"));
    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);
    const index = JSON.parse(readFileSync(join(root, "build", "code-index", "code-index.json"), "utf8"));
    const item = index.find(({ code }) => code === "FUNGI-REPORT-002");
    assert.deepEqual(item?.emits, ["packages-ts/example/src/report-codes.ts:5"]);
    assert.deepEqual(item?.defs, []);
    assert.deepEqual(item?.allSites.filter((site) => site.startsWith("ref ")), [
      "ref packages-ts/example/src/report-codes.ts:3",
    ]);
    assert.deepEqual(item?.names, []);
    assert.deepEqual(item?.severities, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
  // Fixtures must not inherit the coordinator's real-checkout Git authority.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...env, SOURCE_DATE_EPOCH: "1700000000" },
  });
}

// Same identity on both sides is intentional: dropping a registry code, masking
// a whole line, or suppressing a code globally must not satisfy these controls.
const record = '{ code: "FUNGI-REPORT-002", meaning: "missing" }';
const descriptiveRecord = '{ code: "FUNGI-REPORT-FIELD-MISSING", meaning: "missing" }';
const fixtureCases = [
  {
    name: "same-line registry then real return keeps both roles",
    source: `export const C = Object.freeze([${record}]); function fail() { return ${record}; }`,
    refs: [1], emits: [1],
  },
  {
    name: "same-line real return then registry keeps both roles",
    source: `function fail() { return ${record}; } export const C = Object.freeze([${record}]);`,
    refs: [1], emits: [1],
  },
  {
    name: "descriptive identity retains discovery and runtime emission",
    code: "FUNGI-REPORT-FIELD-MISSING",
    source: `export const C = [${descriptiveRecord}];\nfunction fail() { return ${descriptiveRecord}; }`,
    refs: [1], emits: [2],
  },
  {
    name: "runtime frozen array is not a registry",
    source: `function fail() { return Object.freeze([${record}]); }`,
    refs: [], emits: [1],
  },
  {
    name: "reviewed typed copy-freeze helper admits direct data only",
    source: 'const freeze = (entries: readonly unknown[]): readonly unknown[] => Object.freeze(entries.map((e) => Object.freeze({ ...e })));\n'
      + `export const C = freeze([${record}]);\nfunction fail() { return ${record}; }`,
    refs: [2], emits: [3],
  },
  {
    name: "misleading freeze helper with side effects gets no exemption",
    source: `const freeze = (entries) => { emit(entries); return Object.freeze(entries); };\nexport const C = freeze([${record}]);`,
    refs: [], emits: [2],
  },
  {
    name: "unresolved alias gets no registry exemption",
    source: `const freeze = Object.freeze;\nexport const C = freeze([${record}]);`,
    refs: [], emits: [2],
  },
  {
    name: "nested diagnostic calls are not blanked with their array",
    source: `export const C = Object.freeze([makeDiagnostic(${record})]);`,
    refs: [], emits: [1],
  },
  {
    name: "comments strings and regex cannot lend code-field authority",
    source: `/* ${record} */\nconst text = '${record}';\nconst pattern = /${record}/;\nfunction fail() { return ${record}; }`,
    refs: [1, 2, 3], emits: [4],
  },
  {
    name: "template text is inert but its executable substitution survives",
    source: 'const text = `code: "FUNGI-REPORT-002" ${(() => { return ' + record + '; })()}`;',
    refs: [1], emits: [1],
  },
  {
    name: "meaning text and neighboring metadata do not name the registry",
    source: 'export const C = [{ meaning: \'name: "FAKE", severity: "error"\', code: "FUNGI-REPORT-002" }];'
      + ' const neighbor = { name: "NEIGHBOR", severity: "warning" };\n'
      + 'function fail() { return { code: "FUNGI-REPORT-002", message: "missing" }; }',
    refs: [1], emits: [2],
  },
  {
    name: "real metadata belongs only to the enclosing emitted object",
    source: `export const C = [${record}];\n`
      + 'function fail() { return { code: "FUNGI-REPORT-002", name: "ACTUAL", severity: "error" }; }'
      + ' const neighbor = { name: "NEIGHBOR", severity: "warning" };',
    refs: [1], emits: [2], names: ["ACTUAL"], severities: ["error"],
  },
  {
    name: "error template text remains a real emission",
    source: 'function fail(message) { throw new Error(`FUNGI-REPORT-002: ${message}`); }',
    refs: [], emits: [1],
  },
  {
    name: "spread records get no registry exemption",
    source: 'export const C = [{ code: "FUNGI-REPORT-002", meaning: "missing", ...extra }];',
    refs: [], emits: [1],
  },
  {
    name: "computed meaning and getter records get no registry exemption",
    source: 'export const C = [{ code: "FUNGI-REPORT-002", ["meaning"]: "missing" }];\n'
      + 'export const D = [{ code: "FUNGI-REPORT-002", get meaning() { return "missing"; } }];',
    refs: [], emits: [1, 2],
  },
  {
    name: "shadowed Object gets no freeze exemption",
    source: `const Object = { freeze: emit };\nexport const C = Object.freeze([${record}]);`,
    refs: [], emits: [2],
  },
  {
    name: "helper parameter defaults get no freeze exemption",
    source: `const freeze = (entries = emit()) => Object.freeze(entries);\nexport const C = freeze([${record}]);`,
    refs: [], emits: [2],
  },
  {
    name: "descriptive reference annotation does not suppress numeric runtime fields",
    source: 'function fail() { return { code: "FUNGI-REPORT-002", meaning: "code-catalog-reference" }; }',
    refs: [], emits: [1],
  },
];
for (const fixture of fixtureCases) {
  test(`code-index ${fixture.name}`, () => {
    const root = mkdtempSync(join(tmpdir(), "code-index-structural-"));
    const path = "packages-ts/example/src/arbitrary-owner.ts";
    try {
      write(root, path, fixture.source + "\n");
      const generated = run(root);
      assert.equal(generated.status, 0, generated.stderr);
      const index = JSON.parse(readFileSync(join(root, "build/code-index/code-index.json"), "utf8"));
      const item = index.find(({ code }) => code === (fixture.code ?? "FUNGI-REPORT-002"));
      assert.ok(item, "discovery must not be dropped to eliminate false emissions");
      assert.deepEqual(item.emits, fixture.emits.map((line) => `${path}:${line}`));
      assert.deepEqual(item.defs, []);
      assert.deepEqual(item.allSites.filter((site) => site.startsWith("ref ")),
        fixture.refs.map((line) => `ref ${path}:${line}`));
      assert.equal(item.occurrences, fixture.refs.length + fixture.emits.length, "no legacy double counting");
      assert.deepEqual(item.names, fixture.names ?? []);
      assert.deepEqual(item.severities, fixture.severities ?? []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("code-index preserves metadata at a constant-identifier emission", () => {
  const root = mkdtempSync(join(tmpdir(), "code-index-constant-metadata-"));
  try {
    write(root, "packages-ts/example/src/constant.ts", 'export const CODE = "FUNGI-REPORT-002";\n');
    write(root, "packages-ts/example/src/runtime.ts", [
      "function fail() { return {",
      "  code: CODE,",
      '  name: "ACTUAL",',
      '  severity: "warning",',
      "}; }",
    ].join("\n"));
    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);
    const index = JSON.parse(readFileSync(join(root, "build/code-index/code-index.json"), "utf8"));
    const item = index.find(({ code }) => code === "FUNGI-REPORT-002");
    assert.deepEqual(item?.emits, ["packages-ts/example/src/runtime.ts:2"]);
    assert.deepEqual(item?.names, ["ACTUAL"]);
    assert.deepEqual(item?.severities, ["warning"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("code-index actual report registry and caller regenerate reproducibly without filename exemptions", () => {
  const root = mkdtempSync(join(tmpdir(), "code-index-report-owner-"));
  try {
    write(root, "packages-ts/example/src/arbitrary.ts", readFileSync(
      resolve("packages-ts/galerina-core-reports/src/shared/report-codes.ts"), "utf8"));
    write(root, "packages-ts/example/src/audit-jsonl.ts", readFileSync(
      resolve("packages-ts/galerina-core-reports/src/audit/audit-jsonl.ts"), "utf8"));
    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);
    const outputs = ["code-index.json", "CODE_INDEX.md", "provenance.json"];
    const before = outputs.map((file) => readFileSync(join(root, "build/code-index", file), "utf8"));
    const index = JSON.parse(before[0]);
    const item = index.find(({ code }) => code === "FUNGI-REPORT-002");
    assert.deepEqual(item?.defs, []);
    assert.deepEqual(item?.names, []);
    assert.deepEqual(item?.severities, []);
    assert.ok(item?.allSites.some((site) => site.startsWith("ref packages-ts/example/src/arbitrary.ts:")));
    assert.ok(item?.emits.some((site) => site.startsWith("packages-ts/example/src/audit-jsonl.ts:")));
    assert.ok(index.every((entry) => entry.emits.every((site) => !site.startsWith("packages-ts/example/src/arbitrary.ts:"))));
    const repeated = run(root);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.deepEqual(outputs.map((file) => readFileSync(join(root, "build/code-index", file), "utf8")), before);
    const checked = run(root, ["--check"]);
    assert.equal(checked.status, 0, checked.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
        '    // } ERR_EXAMPLE_REFUSED must not close the function or emit',
        '    let example = "} ERR_EXAMPLE_REFUSED";',
        "    match error { Error::Example => &ERR_EXAMPLE_REFUSED }",
        "}",
        "fn merely_mentions_code() { let _ = ERR_EXAMPLE_REFUSED; }",
        "",
      ].join("\n"),
    );
    write(
      root,
      "packages-ts/example/native/src/tests.rs",
      '#[test] fn code_is_stable() { assert_eq!(ERR_EXAMPLE_REFUSED.code, "ERR_EXAMPLE_REFUSED"); }\n',
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
    assert.deepEqual(item?.emits, ["packages-ts/example/native/src/errors.rs:16"]);
    assert.deepEqual(item?.allSites.filter((site) => site.startsWith("ref ")), [
      "ref packages-ts/example/native/src/errors.rs:18",
    ]);
    assert.equal(item?.tests, 1);
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
