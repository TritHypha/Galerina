import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const SCRIPT = fileURLToPath(new URL("../../../../../scripts/audit-fungi-memory-folder.mjs", import.meta.url));
const REPO = dirname(dirname(SCRIPT));

function run(rootDir, dirRel) {
  const r = spawnSync(process.execPath, [SCRIPT, "--root", rootDir, "--dir", dirRel], {
    encoding: "utf8",
  });
  let report;
  try {
    report = JSON.parse(r.stdout.trim().split("\n").pop());
  } catch {
    report = { outcome: "PARSE_FAIL", reasons: [r.stdout, r.stderr] };
  }
  return { status: r.status, report };
}

function seedAdmitted(folder) {
  writeFileSync(join(folder, "README.md"), "# m\n");
  mkdirSync(join(folder, "src"), { recursive: true });
  writeFileSync(join(folder, "src", "README.md"), "src\n");
  writeFileSync(join(folder, "src", "c-boundary.fungi"), "@version 1\n");
  writeFileSync(join(folder, "src", "body-reader.fungi"), "@version 1\n");
  mkdirSync(join(folder, "tests"), { recursive: true });
  writeFileSync(join(folder, "tests", "README.md"), "tests\n");
  mkdirSync(join(folder, "tests", "31-body-reader"), { recursive: true });
  writeFileSync(join(folder, "tests", "31-body-reader", "probe.md"), "p\n");
  mkdirSync(join(folder, "evidence", "31-body-reader"), { recursive: true });
  writeFileSync(join(folder, "evidence", "31-body-reader", "note.md"), "n\n");
  writeFileSync(join(folder, "memory-fungi.manifest.json"), "{}\n");
}

test("live memory folder is FOLDER_ADMITTED or FOLDER_REFUSED with listed reasons", () => {
  const r = run(REPO, "packages/fungi/memory");
  assert.notEqual(r.report.outcome, "PARSE_FAIL");
  const listed = ["FOLDER_ADMITTED", "FOLDER_UNGOVERNED", "FOLDER_REFUSED"];
  assert.equal(listed.includes(r.report.outcome), true);
});

test("admitted seed is FOLDER_ADMITTED", () => {
  const tmp = mkdtempSync(join(tmpdir(), "q31-folder-"));
  const mem = join(tmp, "packages", "fungi", "memory");
  mkdirSync(mem, { recursive: true });
  seedAdmitted(mem);
  const r = run(tmp, "packages/fungi/memory");
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.report.outcome, "FOLDER_ADMITTED");
  assert.equal(r.status, 0);
});

test("tracked node_modules tree is FOLDER_REFUSED", () => {
  const tmp = mkdtempSync(join(tmpdir(), "q31-folder-"));
  const mem = join(tmp, "packages", "fungi", "memory");
  mkdirSync(mem, { recursive: true });
  seedAdmitted(mem);
  mkdirSync(join(mem, "node_modules", "x"), { recursive: true });
  writeFileSync(join(mem, "node_modules", "x", "index.js"), "1\n");
  const r = run(tmp, "packages/fungi/memory");
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.report.outcome, "FOLDER_REFUSED");
  assert.equal(r.status, 2);
  assert.equal(r.report.reasons.some((x) => String(x).includes("node_modules")), true);
});

test("stray package.json is FOLDER_REFUSED", () => {
  const tmp = mkdtempSync(join(tmpdir(), "q31-folder-"));
  const mem = join(tmp, "packages", "fungi", "memory");
  mkdirSync(mem, { recursive: true });
  seedAdmitted(mem);
  writeFileSync(join(mem, "package.json"), "{}\n");
  const r = run(tmp, "packages/fungi/memory");
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.report.outcome, "FOLDER_REFUSED");
  assert.equal(r.status, 2);
  assert.equal(r.report.reasons.some((x) => String(x).includes("package.json")), true);
});

test("stray package.fungi.json is FOLDER_REFUSED", () => {
  const tmp = mkdtempSync(join(tmpdir(), "q31-folder-"));
  const mem = join(tmp, "packages", "fungi", "memory");
  mkdirSync(mem, { recursive: true });
  seedAdmitted(mem);
  writeFileSync(join(mem, "package.fungi.json"), "{}\n");
  const r = run(tmp, "packages/fungi/memory");
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.report.outcome, "FOLDER_REFUSED");
  assert.equal(r.status, 2);
  assert.equal(r.report.reasons.some((x) => String(x).includes("package.fungi.json")), true);
});

test("unlisted file is FOLDER_REFUSED", () => {
  const tmp = mkdtempSync(join(tmpdir(), "q31-folder-"));
  const mem = join(tmp, "packages", "fungi", "memory");
  mkdirSync(mem, { recursive: true });
  seedAdmitted(mem);
  writeFileSync(join(mem, "stray.txt"), "x\n");
  const r = run(tmp, "packages/fungi/memory");
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.report.outcome, "FOLDER_REFUSED");
  assert.equal(r.status, 2);
  assert.equal(r.report.reasons.some((x) => String(x).includes("stray.txt")), true);
});
