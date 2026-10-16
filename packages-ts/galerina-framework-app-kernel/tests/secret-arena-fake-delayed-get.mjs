#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSync, writeSync } from "node:fs";

const markPath = join(tmpdir(), "galerina-secret-arena-delayed.mark");
const secret = Buffer.from([9, 9, 9, 9]);

function mark(line) {
  writeFileSync(markPath, `${line}\n`, { flag: "a" });
}

function readExact(fd, n) {
  const out = Buffer.alloc(n);
  let offset = 0;
  while (offset < n) {
    const got = readSync(fd, out, offset, n - offset);
    if (typeof got !== "number" || got <= 0) process.exit(0);
    offset += got;
  }
  return out;
}

function writeFrame(fd, payload) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  writeSync(fd, header);
  writeSync(fd, payload);
}

process.on("SIGTERM", () => {
  mark(`killed:${process.pid}`);
  process.exit(0);
});
process.on("SIGINT", () => {
  mark(`killed:${process.pid}`);
  process.exit(0);
});

writeFileSync(markPath, `pid:${process.pid}\n`);

const helloHeader = readExact(0, 4);
const helloLen = helloHeader.readUInt32BE(0);
if (helloLen > 0) readExact(0, helloLen);
writeFrame(1, Buffer.from([0, 0]));

const getHeader = readExact(0, 4);
const getLen = getHeader.readUInt32BE(0);
if (getLen > 0) readExact(0, getLen);

await new Promise((resolve) => setTimeout(resolve, 6000));
try {
  writeFrame(1, Buffer.concat([Buffer.from([0]), secret]));
  mark("late-write:ok");
} catch (error) {
  mark(`late-write:fail:${error && error.code ? error.code : "err"}`);
}
process.exit(0);
