import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const SRC = join(MEM, "src", "monotonic-time.fungi");
const TESTS = join(MEM, "tests", "46-monotonic-time");
const EVIDENCE = join(MEM, "evidence", "46-monotonic-time");

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

test("tests/46 evidence/46 and monotonic-time.fungi refuse local absolute path leaks", () => {
  const files = [SRC];
  walk(TESTS, files);
  if (existsSync(EVIDENCE) === true) {
    walk(EVIDENCE, files);
  }
  const slash = String.fromCharCode(47);
  const mnt = slash + "mnt" + slash;
  const home = slash + "home" + slash;
  const users = "Us" + "ers" + slash;
  const usersWin = "Us" + "ers" + String.fromCharCode(92);
  const appdata = "App" + "Data";
  const drive = /[A-Za-z]:[\\/]/;
  const hits = [];
  let i = 0;
  while (i < files.length) {
    const text = readFileSync(files[i], "utf8");
    const lines = text.split("\n");
    let li = 0;
    while (li < lines.length) {
      const line = lines[li];
      if (
        drive.test(line) === true ||
        line.includes(mnt) === true ||
        line.includes(home) === true ||
        line.includes(users) === true ||
        line.includes(usersWin) === true ||
        line.includes(appdata) === true
      ) {
        hits.push(String(li + 1));
      }
      li = li + 1;
    }
    i = i + 1;
  }
  assert.equal(hits.length, 0, "path leak lines: " + hits.join(" | "));
});
