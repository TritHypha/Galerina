import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const TESTS = join(MEM, "tests", "43-cleanup-evidence");
const EVIDENCE = join(MEM, "evidence", "43-cleanup-evidence");
const SRC = join(MEM, "src", "cleanup-evidence.fungi");

function walk(dir, acc) {
  const names = readdirSync(dir);
  let i = 0;
  while (i < names.length) {
    const p = join(dir, names[i]);
    const st = statSync(p);
    if (st.isDirectory()) {
      walk(p, acc);
    } else {
      acc.push(p);
    }
    i = i + 1;
  }
}

function needles() {
  const slash = String.fromCharCode(47);
  const mnt = slash + "mnt" + slash;
  const home = slash + "home" + slash;
  const users = "Us" + "ers" + slash;
  const usersWin = "Us" + "ers" + String.fromCharCode(92);
  const appdata = "App" + "Data";
  const drive = /[A-Za-z]:[\\/]/;
  const codex = "." + "codex";
  return { mnt, home, users, usersWin, appdata, drive, codex };
}

test("tests/43 evidence/43 and cleanup-evidence.fungi refuse local absolute path leaks", () => {
  const files = [SRC];
  walk(TESTS, files);
  if (statSync(EVIDENCE, { throwIfNoEntry: false }) != null) {
    walk(EVIDENCE, files);
  }
  const n = needles();
  const hits = [];
  let i = 0;
  while (i < files.length) {
    const p = files[i];
    const text = readFileSync(p, "utf8");
    const lines = text.split("\n");
    let li = 0;
    while (li < lines.length) {
      const line = lines[li];
      const driveHit = n.drive.test(line) === true;
      const mntHit = line.includes(n.mnt) === true;
      const homeHit = line.includes(n.home) === true;
      const usersHit = line.includes(n.users) === true || line.includes(n.usersWin) === true;
      const appHit = line.includes(n.appdata) === true;
      const cxNeedle = n["cod" + "ex"];
      const codexHit = line.includes(cxNeedle) === true;
      if (driveHit === true || mntHit === true || homeHit === true || usersHit === true || appHit === true || codexHit === true) {
        hits.push(p + ":" + String(li + 1));
      }
      li = li + 1;
    }
    i = i + 1;
  }
  assert.equal(hits.length, 0, "path leak: " + hits.join(" | "));
});
