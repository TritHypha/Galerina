// unit-registry-generator.test.mjs — proves selected-root currency-table/twin
// preflight and non-mutating exact drift refusal.
// Version: 1.0.0 · Task 7 generator governance.
// Related: scripts/gen-unit-registry.mjs; data/iso-4217/.
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

const SCRIPT = resolve("scripts/gen-unit-registry.mjs");
const PROVENANCE = resolve("scripts/lib/provenance.mjs");
const SNAPSHOT = resolve("data/iso-4217/list-one-2026-07-16.xml");
const TWIN_REL =
  "packages-ts/galerina-core-compiler/src/self-hosted/type-checker.fungi";
const OUT_REL =
  "packages-ts/galerina-core-compiler/src/unit-registry.generated.ts";

/**
 * Write one fixture file, creating its parent directories.
 *
 * @param {string} root fixture root
 * @param {string} relativePath fixture-relative path
 * @param {string | Buffer} content exact content
 */
function write(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/**
 * Install the pinned input and a valid marker-owned twin in one root.
 */
function installRepository(root) {
  write(
    root,
    "data/iso-4217/list-one-2026-07-16.xml",
    readFileSync(SNAPSHOT),
  );
  write(
    root,
    TWIN_REL,
    [
      "pure flow isKnownCurrency(t: String) -> Bool {",
      "  // <generated:currency-set>",
      "  stale",
      "  // </generated:currency-set>",
      "  return false",
      "}",
      "",
    ].join("\n"),
  );
}

/**
 * Keep the generator harness distinct from its selected repository so an
 * ignored --root cannot touch the live checkout during the RED phase.
 */
function fixture() {
  const harness = mkdtempSync(join(tmpdir(), "unit-registry-generator-"));
  const selected = join(harness, "selected");
  write(harness, "package.json", '{"type":"module"}\n');
  write(harness, "scripts/gen-unit-registry.mjs", readFileSync(SCRIPT, "utf8"));
  write(harness, "scripts/lib/provenance.mjs", readFileSync(PROVENANCE, "utf8"));
  write(harness, "scripts/lib/cli-help.mjs", readFileSync(resolve("scripts/lib/cli-help.mjs"), "utf8"));
  installRepository(harness);
  installRepository(selected);
  assert.equal(spawnSync("git", ["init"], { cwd: selected }).status, 0);
  assert.equal(spawnSync("git", ["add", "--", "."], { cwd: selected }).status, 0);
  return { harness, selected };
}

/**
 * Run the copied real generator against the selected fixture root.
 *
 * @param {string} harness harness root
 * @param {string} selected selected repository root
 * @param {readonly string[]} args generator mode arguments
 */
function run(harness, selected, args = []) {
  return spawnSync(
    process.execPath,
    [join(harness, "scripts", "gen-unit-registry.mjs"), "--root", selected, ...args],
    {
      encoding: "utf8",
      env: { ...process.env, SOURCE_DATE_EPOCH: "1700000000" },
    },
  );
}

test("unit registry preflights and checks every selected-root output", () => {
  const { harness, selected } = fixture();
  const output = join(selected, OUT_REL);
  const twin = join(selected, TWIN_REL);
  const provenance = join(selected, "build/unit-registry/provenance.json");
  try {
    const missing = run(harness, selected, ["--check"]);
    assert.notEqual(missing.status, 0);
    assert.equal(existsSync(output), false);

    const generated = run(harness, selected);
    assert.equal(generated.status, 0, generated.stderr);
    assert.equal(existsSync(output), true);
    assert.equal(existsSync(provenance), true);
    assert.match(readFileSync(twin, "utf8"), /if t == "GBP"/);
    assert.equal(run(harness, selected, ["--check"]).status, 0);

    writeFileSync(output, "tampered\n");
    const twinBefore = readFileSync(twin, "utf8");
    const provenanceBefore = readFileSync(provenance, "utf8");
    const drifted = run(harness, selected, ["--check"]);
    assert.notEqual(drifted.status, 0);
    assert.equal(readFileSync(output, "utf8"), "tampered\n");
    assert.equal(readFileSync(twin, "utf8"), twinBefore);
    assert.equal(readFileSync(provenance, "utf8"), provenanceBefore);

    assert.equal(run(harness, selected).status, 0);
    const outputBefore = readFileSync(output, "utf8");
    writeFileSync(twin, "markerless\n");
    const unsafeGenerate = run(harness, selected);
    assert.notEqual(unsafeGenerate.status, 0);
    assert.equal(readFileSync(output, "utf8"), outputBefore);

    writeFileSync(
      twin,
      [
        "  // <generated:currency-set>",
        "  // </generated:currency-set>",
        "  // <generated:currency-set>",
        "  // </generated:currency-set>",
        "",
      ].join("\n"),
    );
    const duplicateMarkers = run(harness, selected);
    assert.notEqual(duplicateMarkers.status, 0);
    assert.equal(readFileSync(output, "utf8"), outputBefore);

    installRepository(selected);
    assert.equal(run(harness, selected).status, 0);
    writeFileSync(provenance, "tampered\n");
    const provenanceDrift = run(harness, selected, ["--check"]);
    assert.notEqual(provenanceDrift.status, 0);
    assert.equal(readFileSync(provenance, "utf8"), "tampered\n");
  } finally {
    rmSync(harness, { recursive: true, force: true });
  }
});
