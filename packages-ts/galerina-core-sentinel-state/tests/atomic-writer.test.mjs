// atomic-writer.test.mjs — double-buffered atomic write/read.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, symlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { StateSerializer, AtomicWriter, SecurityTrap, refuseSnapshotSpecialFile } from "../dist/index.js";
import { tmpDir } from "./_tmp.mjs";

const TEST_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

test("write → read round-trips a snapshot", () => {
  const w = new AtomicWriter(tmpDir());
  const s = new StateSerializer({ hmacKey: TEST_KEY });
  const snap = s.serialize({ a: 1, b: [1, 2, 3] }, 5);
  w.write("ckpt", snap);
  const back = w.read("ckpt");
  assert.deepEqual(back, snap);
});

test("read of a missing name returns null", () => {
  const w = new AtomicWriter(tmpDir());
  assert.equal(w.read("does-not-exist"), null);
});

test("write and scrub refuse a planted snapshot symlink", (t) => {
  const dir = tmpDir();
  const w = new AtomicWriter(dir);
  const s = new StateSerializer({ hmacKey: TEST_KEY });
  const snap = s.serialize({ a: 1 }, 1);
  const outside = join(dir, "..", `outside-${process.pid}.txt`);
  writeFileSync(outside, "secret-outside");
  const live = join(dir, "ckpt.snap");
  try {
    symlinkSync(outside, live);
  } catch (err) {
    t.skip(`file symlink not permitted: ${err && err.code}`);
    return;
  }
  assert.throws(() => w.write("ckpt", snap), (err) => err instanceof SecurityTrap && err.code === "LSS-LINK-001");
  assert.throws(() => w.read("ckpt"), (err) => err instanceof SecurityTrap && err.code === "LSS-LINK-001");
  assert.throws(() => w.scrub("ckpt"), (err) => err instanceof SecurityTrap && err.code === "LSS-LINK-001");
  assert.equal(readFileSync(outside, "utf8"), "secret-outside");
});

test("scrub zero-unlinks an orphaned .tmp even when no .snap exists", () => {
  const dir = tmpDir();
  const w = new AtomicWriter(dir);
  const tmp = join(dir, "ckpt.tmp");
  writeFileSync(tmp, JSON.stringify({ plaintext: "secret-in-flight" }));
  w.scrub("ckpt");
  assert.equal(existsSync(tmp), false);
  assert.equal(existsSync(join(dir, "ckpt.snap")), false);
});

test("FIFO snapshot identity is refused before open", () => {
  assert.throws(
    () => refuseSnapshotSpecialFile({
      isSymbolicLink: () => false,
      isFile: () => false,
      isFIFO: () => true,
    }, "ckpt"),
    (err) => err instanceof SecurityTrap && err.code === "LSS-FIFO-001",
  );
});

test("live Linux FIFO stats refuse LSS-FIFO-001", () => {
  const probe = fileURLToPath(new URL("./fifo-live-linux.mjs", import.meta.url));
  if (process.platform === "linux") {
    const r = spawnSync(process.execPath, [probe], { encoding: "utf8" });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /LSS-FIFO-001/);
    return;
  }
  const mnt = "/mnt/" + probe[0].toLowerCase() + probe.slice(2).replaceAll("\\", "/");
  const r = spawnSync("wsl.exe", ["-e", "bash", "-lc", `node ${JSON.stringify(mnt)}`], {
    encoding: "utf8",
    timeout: 60000,
  });
  if (r.error && r.error.code === "ENOENT") return;
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(`${r.stdout}`, /LSS-FIFO-001/);
});

test("snapshot names cannot escape the storage directory", () => {
  const w = new AtomicWriter(tmpDir());
  const s = new StateSerializer({ hmacKey: TEST_KEY });
  const snap = s.serialize({ a: 1 }, 1);
  assert.throws(() => w.write("../escape", snap), (err) => err instanceof SecurityTrap && err.code === "LSS-NAME-001");
  assert.throws(() => w.read("a/../../x"), (err) => err instanceof SecurityTrap && err.code === "LSS-NAME-001");
});
