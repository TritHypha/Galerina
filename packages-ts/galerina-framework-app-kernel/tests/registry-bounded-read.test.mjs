import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBoundedRegularFile } from "../dist/index.js";

function stats(size) {
  return {
    dev: 1,
    ino: 2,
    mtimeMs: 3,
    size,
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
    isFIFO: () => false,
  };
}

test("readBoundedRegularFile admits a real file under the byte ceiling", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reg-read-"));
  const path = join(dir, "g.json");
  try {
    await writeFile(path, "{\"ok\":true}");
    const { promises: fs } = await import("node:fs");
    const bytes = await readBoundedRegularFile(fs, path, 1024);
    assert.equal(Buffer.from(bytes).toString("utf8"), "{\"ok\":true}");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("hostile: bounded read refuses oversize without calling readFile", async () => {
  let readFileCalled = false;
  const before = stats(4);
  const fs = {
    constants: { O_RDONLY: 0, O_NONBLOCK: 0 },
    async lstat() { return before; },
    async open() {
      return {
        async stat() { return before; },
        async read(buf, _off, length) {
          assert.ok(length <= 9, "read length must be maxBytes+1");
          return { bytesRead: 9 };
        },
        async readFile() {
          readFileCalled = true;
          return Buffer.alloc(1_000_000);
        },
        async close() {},
      };
    },
  };
  await assert.rejects(
    () => readBoundedRegularFile(fs, "/tmp/x", 8),
    /bounded regular file/,
  );
  assert.equal(readFileCalled, false);
});
