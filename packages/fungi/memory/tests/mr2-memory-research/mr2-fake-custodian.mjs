#!/usr/bin/env node
// MEM-R2 synthetic SecretArena custodian. Same wire protocol as the MEM-R1
// fake (u32 BE length, opcode byte, payload; reply u32 BE length, status byte,
// data) but misbehaves on the reply LENGTH of has/status/put/epoch, the gap
// map H11 (length equality) surface. Synthetic data only.
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
const ST_UNLISTED = 9;

const mode = process.env.MR2_MODE ?? "ok";
const store = new Map();
let epochCalls = 0;
let statusCalls = 0;

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

function reply(status, data = Buffer.alloc(0)) {
  const payload = Buffer.concat([Buffer.from([status]), data]);
  const h = Buffer.alloc(4);
  h.writeUInt32BE(payload.length >>> 0, 0);
  writeRaw(Buffer.concat([h, payload]));
}

function decodeName(payload) {
  const len = (payload[0] << 8) | payload[1];
  return { name: payload.subarray(2, 2 + len), rest: payload.subarray(2 + len) };
}

function epochBytes(value) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(value), 0);
  return b;
}

function onHas(nameKey) {
  const present = store.has(nameKey) ? 1 : 0;
  switch (mode) {
    case "has-empty": return reply(ST_OK);
    case "has-two": return reply(ST_OK, Buffer.from([2]));
    case "has-long": return reply(ST_OK, Buffer.from([present, 0xaa]));
    case "has-unlisted": return reply(ST_UNLISTED, Buffer.from([1]));
    default: return reply(ST_OK, Buffer.from([present]));
  }
}

function onStatus() {
  statusCalls += 1;
  // The first STATUS is the provider's hello; misbehave only afterwards so the
  // provider opens and the later status() read is what is under test.
  if (statusCalls === 1) return reply(ST_OK, Buffer.from([0]));
  switch (mode) {
    case "status-empty": return reply(ST_OK);
    case "status-long": return reply(ST_OK, Buffer.from([0, 0xaa]));
    case "status-two": return reply(ST_OK, Buffer.from([2]));
    case "status-unlisted": return reply(ST_UNLISTED, Buffer.from([0]));
    default: return reply(ST_OK, Buffer.from([0]));
  }
}

function onPut(nameKey, rest) {
  switch (mode) {
    case "put-extra":
      store.set(nameKey, Buffer.from(rest));
      return reply(ST_OK, Buffer.from([0xaa, 0xbb]));
    case "put-unlisted":
      return reply(ST_UNLISTED);
    case "put-echo":
      // Hostile custodian echoes the stored bytes back in the put reply.
      return reply(ST_UNLISTED, Buffer.from(rest));
    default:
      store.set(nameKey, Buffer.from(rest));
      return reply(ST_OK);
  }
}

function onEpoch() {
  epochCalls += 1;
  switch (mode) {
    case "epoch-long": return reply(ST_OK, Buffer.concat([epochBytes(epochCalls), Buffer.from([0])]));
    case "epoch-empty": return reply(ST_OK);
    case "epoch-huge": return reply(ST_OK, Buffer.alloc(8, 0xff));
    case "epoch-unlisted": return reply(ST_UNLISTED, epochBytes(epochCalls));
    case "epoch-quar": return reply(ST_QUARANTINED);
    default: return reply(ST_OK, epochBytes(epochCalls));
  }
}

function onGet(nameKey) {
  const value = store.get(nameKey);
  if (mode === "get-unlisted-echo" && value !== undefined) return reply(ST_UNLISTED, value);
  if (value === undefined) return reply(ST_NOT_FOUND);
  return reply(ST_OK, value);
}

for (;;) {
  const len = readExact(0, 4).readUInt32BE(0);
  if (len === 0) process.exit(0);
  const body = readExact(0, len);
  const opcode = body[0];
  const payload = body.subarray(1);
  if (opcode === OP_STATUS) onStatus();
  else if (opcode === OP_PUT) {
    const { name, rest } = decodeName(payload);
    onPut(name.toString("hex"), rest);
  } else if (opcode === OP_HAS) onHas(decodeName(payload).name.toString("hex"));
  else if (opcode === OP_GET) onGet(decodeName(payload).name.toString("hex"));
  else if (opcode === OP_EPOCH) onEpoch();
  else if (opcode === OP_CLEANUP) {
    store.clear();
    reply(ST_OK);
  } else reply(ST_QUARANTINED);
}
