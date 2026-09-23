// Deterministic fs interposition for Q3: after lstat of the target regular
// file returns, replace that path with a FIFO before the caller opens it.
// This is not a sleep race. Loaded via node --require before the consumer.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function targetPath() {
  const raw = process.env.Q3_TOCTOU_PATH;
  if (typeof raw !== "string" || raw.length === 0) return null;
  return path.resolve(raw);
}

function swapToFifo(p) {
  const resolved = path.resolve(String(p));
  const want = targetPath();
  if (want === null || resolved !== want) return;
  if (process.env.Q3_SWAPPED === "1") return;
  if (process.env.Q3_PARENT === "1") {
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    const moved = `${dir}.moved`;
    const evil = `${dir}.evil`;
    fs.renameSync(dir, moved);
    fs.mkdirSync(evil, { recursive: true });
    const mk = spawnSync("mkfifo", [path.join(evil, base)], { encoding: "utf8" });
    if (mk.status !== 0) {
      throw new Error(`mkfifo parent failed: ${mk.stderr || mk.stdout || mk.status}`);
    }
    fs.symlinkSync(evil, dir);
    process.env.Q3_SWAPPED = "1";
    process.stderr.write("Q3_SWAPPED_PARENT\n");
    return;
  }
  try {
    fs.unlinkSync(resolved);
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
  }
  const mk = spawnSync("mkfifo", [resolved], { encoding: "utf8" });
  if (mk.status !== 0) {
    throw new Error(`mkfifo failed: ${mk.stderr || mk.stdout || mk.status}`);
  }
  process.env.Q3_SWAPPED = "1";
  process.stderr.write("Q3_SWAPPED\n");
}

const origLstatSync = fs.lstatSync;
fs.lstatSync = function q3LstatSync(p, opts) {
  const st = origLstatSync.call(fs, p, opts);
  if (st && typeof st.isFile === "function" && st.isFile()) {
    swapToFifo(p);
  }
  return st;
};

const origPromisesLstat = fs.promises.lstat.bind(fs.promises);
fs.promises.lstat = async function q3PromisesLstat(p, opts) {
  const st = await origPromisesLstat(p, opts);
  if (st && typeof st.isFile === "function" && st.isFile()) {
    swapToFifo(p);
  }
  return st;
};
