#!/usr/bin/env node
// MEM-R1 synthetic SecretArena custodian. Speaks the provider wire protocol
// (u32 BE length, opcode byte, payload; reply u32 BE length, status byte, data)
// and misbehaves on purpose according to MR1_MODE. Synthetic data only.
import { readSync, writeSync } from "node:fs";

const OP_PUT = 1;
const OP_HAS = 2;
const OP_GET = 3;
const OP_CLEANUP = 4;
const OP_STATUS = 5;
const OP_EPOCH = 7;
const ST_OK = 0;
const ST_NOT_FOUND = 1;
const ST_QUARANTINED = 2;

const mode = process.env.MR1_MODE ?? "ok";
const store = new Map();
let epochCalls = 0;

function readExact(fd, n) {
  const out = Buffer.alloc(n);
  let offset = 0;
  while (offset < n) {
    let got = 0;
    try {
      got = readSync(fd, out, offset, n - offset);
    } catch (error) {
      if (error && error.code === "EAGAIN") continue;
      process.exit(0);
    }
    if (typeof got !== "number" || got <= 0) process.exit(0);
    offset += got;
  }
  return out;
}

function writeRaw(buf) {
  let offset = 0;
  while (offset < buf.length) {
    try {
      offset += writeSync(1, buf, offset, buf.length - offset);
    } catch (error) {
      if (error && error.code === "EAGAIN") continue;
      process.exit(0);
    }
  }
}

function header(len) {
  const h = Buffer.alloc(4);
  h.writeUInt32BE(len >>> 0, 0);
  return h;
}

function reply(status, data = Buffer.alloc(0)) {
  const payload = Buffer.concat([Buffer.from([status]), data]);
  writeRaw(Buffer.concat([header(payload.length), payload]));
}

function decodeName(payload) {
  const len = (payload[0] << 8) | payload[1];
  return { name: payload.subarray(2, 2 + len).toString("utf8"), rest: payload.subarray(2 + len) };
}

function epochBytes(value) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(value), 0);
  return b;
}

function misbehaveOnGet() {
  switch (mode) {
    case "trunc-get":
      writeRaw(header(10));
      writeRaw(Buffer.from([ST_OK, 0x41, 0x42]));
      process.exit(0);
      return true;
    case "zero-get":
      writeRaw(header(0));
      return true;
    case "huge-get":
      writeRaw(header(64 * 1024 * 1024 + 4096));
      return true;
    case "kill-get":
      process.kill(process.pid, "SIGKILL");
      return true;
    case "quar-get":
      reply(ST_QUARANTINED);
      return true;
    case "odd-status-get":
      reply(9, Buffer.from("MR1-SYNTHETIC-NOT-A-SECRET"));
      return true;
    default:
      return false;
  }
}

for (;;) {
  const len = readExact(0, 4).readUInt32BE(0);
  if (len === 0) process.exit(0);
  const body = readExact(0, len);
  const opcode = body[0];
  const payload = body.subarray(1);
  if (opcode === OP_STATUS) {
    reply(ST_OK, Buffer.from([0]));
  } else if (opcode === OP_PUT) {
    const { name, rest } = decodeName(payload);
    store.set(name, Buffer.from(rest));
    reply(ST_OK);
  } else if (opcode === OP_HAS) {
    const { name } = decodeName(payload);
    reply(ST_OK, Buffer.from([store.has(name) ? 1 : 0]));
  } else if (opcode === OP_GET) {
    if (misbehaveOnGet()) continue;
    const { name } = decodeName(payload);
    const value = store.get(name);
    if (value === undefined) reply(ST_NOT_FOUND);
    else reply(ST_OK, value);
  } else if (opcode === OP_EPOCH) {
    epochCalls += 1;
    if (mode === "epoch-down") reply(ST_OK, epochBytes(epochCalls === 1 ? 5 : 3));
    else if (mode === "epoch-short") reply(ST_OK, Buffer.alloc(7, 1));
    else reply(ST_OK, epochBytes(epochCalls));
  } else if (opcode === OP_CLEANUP) {
    store.clear();
    reply(ST_OK);
  } else {
    reply(ST_QUARANTINED);
  }
}
