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
    timeout: 30000,
    maxBuffer: 1048576,
    env: { ...env, SOURCE_DATE_EPOCH: "1700000000" },
  });
}

// Same identity on both sides is intentional: dropping a registry code, masking
// a whole line, or suppressing a code globally must not satisfy these controls.
const record = '{ code: "FUNGI-REPORT-002", meaning: "missing" }';
const descriptiveRecord = '{ code: "FUNGI-REPORT-FIELD-MISSING", meaning: "missing" }';
const frozenOwner = 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\n';
const fixtureCases = [
  ...[
    ['getter replacement', 'Object.__defineGetter__("freeze", () => emit);'],
    ['setter replacement', 'Object.__defineSetter__("freeze", emit);'],
    ['unknown mutator', 'Object.setPrototypeOf(target, replacement);'],
    ['freeze descriptor replacement', 'Object.defineProperty(target, "freeze", { value: emit });'],
    ['accessor descriptor', 'Object.defineProperty(target, "cause", { get: effect });'],
    ['spread call shape', 'Object.entries(...input);'],
    ['unsupported call chain', 'Object.freeze.call(target, input);'],
  ].map(([name, operation]) => ({
    name: `F1 ${name} retains diagnostic fallback`,
    source: operation + '\n' + frozenOwner + 'new Error(C.code);',
    refs: [], defs: [], emits: [2],
  })),
  {
    name: "F1 getter replacement retains frozen-array fallback",
    source: 'Object.__defineGetter__("freeze", () => emit);\n'
      + `export const C = Object.freeze([${record}]);`,
    refs: [], defs: [], emits: [2],
  },
  {
    name: "F1 getter replacement retains helper-registry fallback",
    source: 'Object.__defineGetter__("freeze", () => emit);\n'
      + 'const freeze = entries => Object.freeze(entries);\n'
      + `export const C = freeze([${record}]);`,
    refs: [], defs: [], emits: [3],
  },
  {
    name: "F1 supported ordinary calls preserve frozen owner and direct sink",
    source: frozenOwner
      + 'Object.entries({}); Object.getPrototypeOf(value); Object.create(null);\n'
      + 'Object.prototype.hasOwnProperty.call(value, "key");\n'
      + 'const failure = new Error("detail"); Object.defineProperty(failure, "cause", { value: cause, configurable: true });\n'
      + 'new Error(C.code);',
    refs: [], defs: [1], emits: [5],
  },
  {
    name: "F1 ordinary method twin preserves frozen-array registry references",
    source: 'Object.entries({}); Object.prototype.hasOwnProperty.call({}, "key");\n'
      + `export const C = Object.freeze([${record}]);\nfunction fail() { return ${record}; }`,
    refs: [2], defs: [], emits: [3],
  },
  ...[
    ['object destructuring', '({ code: C.code } = input);'],
    ['array destructuring', '[C.code] = input;'],
    ['nested destructuring', '({ nested: [{ value: C.code }] } = input);'],
    ['wrapped destructuring', '[(C.code as string)] = input;'],
    ['non-null wrapped target', '[C.code!] = input;'],
    ['double wrapped target', '((C.code)) = input;'],
    ['object rest target', '({ ...C.code } = input);'],
    ['array rest target', '[...C.code] = input;'],
    ['defaulted target', '[C.code = fallback] = input;'],
    ['for-in target', 'for (C.code in input) {}'],
    ['for-of target', 'for (C.code of input) {}'],
  ].map(([name, operation]) => ({
    name: `F2 ${name} disables constant sink resolution`,
    source: frozenOwner + operation + '\nnew Error(C.code);',
    refs: [], defs: [1], emits: [],
  })),
  ...[
    ['object value', 'const read = { label: C.code };'],
    ['nested wrapped value', 'const read = [{ label: ((C.code as string)) }];'],
    ['negated container value', 'const read = !{ label: C.code };'],
    ['computed destructuring key', '({ [C.code]: target } = input);'],
    ['destructuring default value', '[target = C.code] = input;'],
    ['for-of iterable', 'for (const value of [C.code]) {}'],
    ['for-in expression', 'for (const key in { label: C.code }) {}'],
  ].map(([name, operation]) => ({
    name: `F2 ${name} preserves read and template sink`,
    source: frozenOwner + operation + '\nnew Error(`${C.code}: detail`);',
    refs: [], defs: [1], emits: [3],
  })),
  {
    name: "frozen diagnostic definition and constant-backed Error have separate roles",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002", name: "FAILURE", severity: "error" } as const);\n'
      + 'Object.entries({}); Object.prototype.hasOwnProperty.call({}, "x");\n'
      + 'function fail(detail) { return new Error(`${C.code}: ${detail}`); }',
    refs: [], defs: [1], emits: [3], names: ["FAILURE"], severities: ["error"],
  },
  {
    name: "unused frozen diagnostic definition does not invent an emission",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\nconst read = C.code;',
    refs: [], defs: [1], emits: [],
  },
  {
    name: "shadowed diagnostic binding cannot supply an Error identity",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\n'
      + 'function fail(C) { return new Error(`${C.code}`); }',
    refs: [], defs: [1], emits: [],
  },
  {
    name: "shadowed Error constructor cannot supply an emission",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\n'
      + 'function fail(Error) { return new Error(`${C.code}`); }',
    refs: [], defs: [1], emits: [],
  },
  {
    name: "replaced freeze gets no definition exemption",
    source: 'Object.freeze = emit;\nexport const C = Object.freeze({ code: "FUNGI-REPORT-002" });',
    refs: [], emits: [2],
  },
  {
    name: "reassigned Error gets no constant-backed emission",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\n'
      + 'Error = Custom;\nfunction fail() { return new Error(C.code); }',
    refs: [], defs: [1], emits: [],
  },
  {
    name: "constant alias escape does not imply a resolved sink",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\n'
      + 'const alias = C;\nfunction fail() { return new Error(C.code); }',
    refs: [], defs: [1], emits: [],
  },
  {
    name: "constant property mutation disables sink resolution",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\n'
      + 'C.code = other;\nfunction fail() { return new Error(C.code); }',
    refs: [], defs: [1], emits: [],
  },
  {
    name: "nested callback in Error does not establish message evaluation",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\n'
      + 'function fail() { return new Error(() => C.code); }',
    refs: [], defs: [1], emits: [],
  },
  {
    name: "direct code message is a resolved sink without template text",
    source: 'export const C = Object.freeze({ code: "FUNGI-REPORT-002" });\n'
      + 'function fail() { return new Error(C.code); }',
    refs: [], defs: [1], emits: [2],
  },
  {
    name: "arbitrary wrapper does not acquire definition authority",
    source: 'export const C = wrap({ code: "FUNGI-REPORT-002" });',
    refs: [], emits: [1],
  },
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
      assert.deepEqual(item.defs, (fixture.defs ?? []).map((line) => `${path}:${line}`));
      assert.deepEqual(item.allSites.filter((site) => site.startsWith("ref ")),
        fixture.refs.map((line) => `ref ${path}:${line}`));
      assert.equal(item.occurrences, fixture.refs.length + fixture.emits.length + (fixture.defs?.length ?? 0), "no legacy double counting");
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

test("code-index locates the real frozen Wasm grant owner and Error sink", () => {
  const root = mkdtempSync(join(tmpdir(), "code-index-wasm-grant-"));
  const path = "packages-ts/example/src/arbitrary-runtime.ts";
  try {
    const source = readFileSync(resolve("packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts"), "utf8");
    write(root, path, source);
    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);
    const index = JSON.parse(readFileSync(join(root, "build/code-index/code-index.json"), "utf8"));
    const item = index.find(({ code }) => code === "FUNGI-WASM-GRANT-001");
    // Locate the input witnesses independently; the output must point at the
    // literal definition and the Error construction, not just mention the code.
    const lines = source.split(/\r?\n/);
    const definition = lines.findIndex((line) => line.includes('code: "FUNGI-WASM-GRANT-001"')) + 1;
    const sink = lines.findIndex((line) => line.includes('new Error(`${FUNGI_WASM_GRANT_001.code}')) + 1;
    assert.ok(definition > 0 && sink > definition);
    assert.deepEqual(item?.defs, [`${path}:${definition}`]);
    assert.deepEqual(item?.emits, [`${path}:${sink}`]);
    assert.deepEqual(item?.names, ["EFFECT_GRANT_NOT_ALLOWLISTED"]);
    assert.deepEqual(item?.severities, ["error"]);
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

function assertCheckRefusal(result, expectedMessage) {
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, expectedMessage);
}

test("code-index refusal oracle rejects failed children and unrelated failures", () => {
  const expected = /code-index: missing generated output/;
  const refusal = { status: 1, error: undefined, signal: null, stderr: "code-index: missing generated output build/code-index/CODE_INDEX.md" };
  assert.doesNotThrow(() => assertCheckRefusal(refusal, expected));
  for (const failed of [
    { ...refusal, status: null, error: new Error("spawn ENOENT") },
    { ...refusal, status: null, error: new Error("ETIMEDOUT"), signal: "SIGTERM" },
    { ...refusal, error: new Error("ENOBUFS") },
    { ...refusal, signal: "SIGTERM" },
    { ...refusal, status: 2 },
    { ...refusal, stderr: "unrelated generator failure" },
  ]) {
    assert.throws(() => assertCheckRefusal(failed, expected));
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
    assertCheckRefusal(missing, /code-index: missing generated output build\/code-index\/CODE_INDEX\.md/);
    assert.equal(existsSync(markdown), false);

    const generated = run(root);
    assert.equal(generated.status, 0, generated.stderr);

    const current = run(root, ["--check"]);
    assert.equal(current.status, 0, current.stderr);

    writeFileSync(markdown, "tampered\n");
    const drifted = run(root, ["--check"]);
    assertCheckRefusal(drifted, /code-index: generated output drift build\/code-index\/CODE_INDEX\.md/);
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
