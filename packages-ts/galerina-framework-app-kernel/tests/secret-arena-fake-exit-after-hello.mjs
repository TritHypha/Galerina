#!/usr/bin/env node
import { readSync, writeSync } from "node:fs";

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

const header = readExact(0, 4);
const len = header.readUInt32BE(0);
if (len > 0) readExact(0, len);
writeFrame(1, Buffer.from([0, 0]));
process.exit(0);
