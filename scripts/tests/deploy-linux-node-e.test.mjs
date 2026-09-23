import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "deploy-linux.sh");

const SNIPPET =
  "import fs from 'node:fs'; const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); process.stdout.write(m.sourceHash||'')";

test("deploy-linux.sh reads the manifest path from argv, not an interpolated basename", () => {
  const sh = readFileSync(SCRIPT, "utf8");
  assert.match(sh, /process\.argv\[1\]/);
  assert.match(sh, /node --input-type=module -e "/);
  assert.doesNotMatch(sh, /node --input-type=module -e "[^"]*\$\{/);
  assert.ok(sh.includes(SNIPPET));
});

test("hostile: a metacharacter manifest path is data, not shell or JS syntax", () => {
  const dir = mkdtempSync(join(tmpdir(), "galerina-deploy-e-"));
  const hostile = join(dir, "x; echo pwned.lmanifest.json");
  try {
    writeFileSync(hostile, JSON.stringify({ sourceHash: "sha256:deadbeef" }));
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", SNIPPET, hostile],
      { encoding: "utf8", shell: false, timeout: 10_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "sha256:deadbeef");
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /pwned/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
