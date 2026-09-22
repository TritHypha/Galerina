import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = (summary) => ({
  schema: "galerina.status-ledger.v1",
  asOf: "2026-09-22",
  milestone: "Bounded ledger summary contract",
  roadmap: "docs/ROADMAP.md",
  openGates: [{ id: "SUMMARY-CONTROL", summary, evidence: "docs/ROADMAP.md" }],
});

function runLedger(value) {
  const dir = mkdtempSync(join(tmpdir(), "galerina-status-summary-"));
  try {
    const file = join(dir, "ledger.json");
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
    const result = spawnSync(process.execPath, ["scripts/status.mjs"], {
      cwd: root, encoding: "utf8", windowsHide: true,
      timeout: 10_000, maxBuffer: 262_144,
      env: { ...process.env, GALERINA_STATUS_LEDGER: file },
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null, "fixture must finish within its bound");
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const length of [241, 2048]) {
  test(`status preserves a complete ${length}-character gate summary`, () => {
    const summary = "S".repeat(length - 4) + "END!";
    const result = runLedger(fixture(summary));
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(summary), "summary must not be truncated");
  });
}

test("status refuses a summary beyond the 2048-character bound", () => {
  const result = runLedger(fixture("S".repeat(2049)));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFUSED: status ledger.*summary/);
  assert.equal(result.stdout, "");
});

for (const summary of ["", "before\nafter", "before\u001bafter"]) {
  test(`status refuses empty or control-bearing summary ${JSON.stringify(summary)}`, () => {
    const result = runLedger(fixture(summary));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /REFUSED: status ledger.*summary/);
    assert.equal(result.stdout, "");
  });
}

test("status keeps the independent 240-character milestone bound", () => {
  const value = fixture("Valid summary");
  value.milestone = "M".repeat(241);
  const result = runLedger(value);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFUSED: status ledger.*milestone/);
});

test("status still refuses a file above 16384 bytes before parsing", () => {
  const result = runLedger(" ".repeat(16385));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REFUSED: status ledger.*16,?384 bytes/);
  assert.equal(result.stdout, "");
});
