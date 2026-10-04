// contract-registry-generator.test.mjs — proves selected-root contract
// discovery, exact artifact checking, provenance, and non-mutating refusal.
// Version: 1.0.0 · Task 7 generator governance.
// Related: scripts/gen-contract-registry.mjs; scripts/lib/provenance.mjs.
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

const SCRIPT = resolve("scripts/gen-contract-registry.mjs");
const PROVENANCE = resolve("scripts/lib/provenance.mjs");

/**
 * Write one fixture file, creating its parent directories.
 *
 * @param {string} root fixture root
 * @param {string} relativePath fixture-relative path
 * @param {string} content exact content
 */
function write(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Create a harness containing the real generator and a separately selected
 * repository root. Keeping these roots distinct catches ambient-root reads and
 * writes without allowing a RED test to mutate the working repository.
 */
function fixture() {
  const harness = mkdtempSync(join(tmpdir(), "contract-registry-generator-"));
  const selected = join(harness, "selected");
  write(harness, "package.json", '{"type":"module"}\n');
  write(harness, "scripts/gen-contract-registry.mjs", readFileSync(SCRIPT, "utf8"));
  write(harness, "scripts/lib/provenance.mjs", readFileSync(PROVENANCE, "utf8"));
  write(harness, "scripts/lib/cli-help.mjs", readFileSync(resolve("scripts/lib/cli-help.mjs"), "utf8"));

  const compiler = [
    "export function parseProgram(source) {",
    "  return { flows: [{",
    '    name: "fixtureFlow", qualifier: "secure", params: [],',
    '    returnType: "Bool", declaredEffects: ["audit.write"],',
    "    location: { offset: 0 },",
    "  }] };",
    "}",
    "",
  ].join("\n");
  write(harness, "packages-ts/galerina-core-compiler/dist/index.js", compiler);
  write(selected, "package.json", '{"type":"module"}\n');
  write(selected, "packages-ts/galerina-core-compiler/dist/index.js", compiler);
  write(
    selected,
    "packages-ts/example/src/fixture.fungi",
    'secure flow fixtureFlow() -> Bool contract { intent { "fixture contract" } effects { audit.write } }\n',
  );
  assert.equal(spawnSync("git", ["init"], { cwd: selected }).status, 0);
  assert.equal(
    spawnSync("git", ["add", "--", "packages-ts"], { cwd: selected }).status,
    0,
  );
  return { harness, selected };
}

/**
 * Run the copied real generator with the selected root.
 *
 * @param {string} harness harness root
 * @param {string} selected selected repository root
 * @param {readonly string[]} args generator mode arguments
 */
function run(harness, selected, args = []) {
  return spawnSync(
    process.execPath,
    [join(harness, "scripts", "gen-contract-registry.mjs"), "--root", selected, ...args],
    {
      encoding: "utf8",
      env: { ...process.env, SOURCE_DATE_EPOCH: "1700000000" },
    },
  );
}

test("contract registry checks every selected-root artifact without writing", () => {
  const { harness, selected } = fixture();
  const out = join(selected, "docs", "contract-registry");
  const markdown = join(out, "CONTRACT_REGISTRY.md");
  const json = join(out, "contract-registry.json");
  const provenance = join(out, "provenance.json");
  try {
    const missing = run(harness, selected, ["--check"]);
    assert.notEqual(missing.status, 0);
    assert.equal(existsSync(markdown), false);

    const generated = run(harness, selected);
    assert.equal(generated.status, 0, generated.stderr);
    assert.equal(existsSync(markdown), true);
    assert.equal(existsSync(json), true);
    assert.equal(existsSync(provenance), true);
    assert.match(readFileSync(markdown, "utf8"), /fixtureFlow/);
    assert.equal(run(harness, selected, ["--check"]).status, 0);

    writeFileSync(json, "tampered\n");
    const markdownBefore = readFileSync(markdown, "utf8");
    const driftedJson = run(harness, selected, ["--check"]);
    assert.notEqual(driftedJson.status, 0);
    assert.equal(readFileSync(json, "utf8"), "tampered\n");
    assert.equal(readFileSync(markdown, "utf8"), markdownBefore);

    assert.equal(run(harness, selected).status, 0);
    writeFileSync(provenance, "tampered\n");
    const driftedProvenance = run(harness, selected, ["--check"]);
    assert.notEqual(driftedProvenance.status, 0);
    assert.equal(readFileSync(provenance, "utf8"), "tampered\n");
  } finally {
    rmSync(harness, { recursive: true, force: true });
  }
});
