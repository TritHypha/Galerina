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

function writeStatusOk() {
  writeFrame(1, Buffer.from([0, 0]));
}

function writeEpoch(n) {
  const payload = Buffer.alloc(9);
  payload[0] = 0;
  payload.writeBigUInt64BE(BigInt(n), 1);
  writeFrame(1, payload);
}

const OP_STATUS = 5;
const OP_EPOCH = 7;
const OP_CLEANUP = 4;
let epochCalls = 0;

while (true) {
  const header = readExact(0, 4);
  const len = header.readUInt32BE(0);
  if (!(len > 0)) process.exit(0);
  const frame = readExact(0, len);
  const opcode = frame[0];
  if (opcode === OP_STATUS) {
    writeStatusOk();
  } else if (opcode === OP_EPOCH) {
    epochCalls += 1;
    writeEpoch(epochCalls === 1 ? 5 : 3);
  } else if (opcode === OP_CLEANUP) {
    writeFrame(1, Buffer.from([0]));
  } else {
    writeFrame(1, Buffer.from([3]));
  }
}
