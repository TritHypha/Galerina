import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const GENERATOR = join(ROOT, "scripts", "generate-rd0873-first-native-slice-artifact.mjs");
const ARTIFACT = join(ROOT, "packages", "fungi", "products", "galerina", "rd0873-first-native-slice", "slice.checked.json");

test("RD-0873 artifact generator check mode accepts the current checked artifact", () => {
  const result = spawnSync(process.execPath, [GENERATOR, "--check"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.error, undefined, `child process error: ${result.error}`);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("RD-0873 artifact generator refuses metadata drift without changing the candidate", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "rd0873-artifact-generator-"));
  try {
    const original = JSON.parse(readFileSync(ARTIFACT, "utf8"));
    const tampered = { ...original, qualifier: "secure" };
    const tamperedBytes = `${JSON.stringify(tampered)}\n`;
    const candidatePath = join(tempRoot, "slice.checked.json");
    writeFileSync(candidatePath, tamperedBytes, "utf8");

    const result = spawnSync(process.execPath, [GENERATOR, "--check", "--check-artifact", candidatePath], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.error, undefined, `child process error: ${result.error}`);
    assert.notEqual(result.status, 0, "metadata that disagrees with current Fungi source must refuse");
    assert.match(result.stderr, /artifact qualifier must match/u);
    assert.equal(readFileSync(candidatePath, "utf8"), tamperedBytes,
      "read-only check mode must leave the mismatching candidate untouched");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
