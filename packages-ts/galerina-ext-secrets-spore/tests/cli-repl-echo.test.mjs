// Hostile: the REPL attaches echoing readline to stdin/stderr, then calls
// promptNoEcho for `set` and passphrase. Dummy secret bytes only.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { promptNoEcho, promptNoEchoExclusive } from "../dist/io.js";

const DUMMY = Buffer.from("dummy-secret-value");

function installFakeTty() {
  const fake = new EventEmitter();
  fake.isTTY = true;
  fake.isRaw = false;
  fake.setRawMode = (mode) => {
    fake.isRaw = mode;
    return fake;
  };
  fake.resume = () => fake;
  fake.pause = () => fake;
  fake.removeAllListeners = EventEmitter.prototype.removeAllListeners;
  fake.removeListener = EventEmitter.prototype.removeListener;
  fake.listeners = EventEmitter.prototype.listeners;
  fake.on = EventEmitter.prototype.on;
  const original = process.stdin;
  Object.defineProperty(process, "stdin", { configurable: true, value: fake });
  return {
    fake,
    restore() {
      Object.defineProperty(process, "stdin", { configurable: true, value: original });
    },
  };
}

test("hostile control: live _ttyWrite still echoes dummy secret bytes", async () => {
  const chunks = [];
  const output = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  const fakeRl = {
    pause() {},
    resume() {},
    _ttyWrite(s) { output.write(String(s)); },
  };
  fakeRl._ttyWrite(DUMMY.toString());
  assert.equal(Buffer.concat(chunks).includes(DUMMY), true, "detector must go red when _ttyWrite still echos");
});

test("promptNoEchoExclusive mutes readline _ttyWrite for dummy secret bytes", async () => {
  const { fake, restore } = installFakeTty();
  const chunks = [];
  const output = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  output.isTTY = true;
  const rl = createInterface({ input: fake, output, terminal: true });
  try {
    const pending = promptNoEchoExclusive("value: ", rl);
    queueMicrotask(() => {
      if (typeof rl._ttyWrite === "function") rl._ttyWrite(DUMMY.toString());
      fake.emit("data", Buffer.concat([DUMMY, Buffer.from("\n")]));
    });
    const got = await pending;
    assert.deepEqual([...got], [...DUMMY]);
    assert.equal(Buffer.concat(chunks).includes(DUMMY), false, "secret bytes must not appear on readline output");
  } finally {
    rl.close();
    restore();
  }
});

test("promptNoEchoExclusive restores _ttyWrite after Ctrl-C", async () => {
  const { fake, restore } = installFakeTty();
  const output = new Writable({
    write(_chunk, _enc, cb) { cb(); },
  });
  output.isTTY = true;
  const rl = createInterface({ input: fake, output, terminal: true });
  const originalTty = rl._ttyWrite;
  try {
    const pending = promptNoEchoExclusive("value: ", rl);
    queueMicrotask(() => fake.emit("data", Buffer.from([0x03])));
    await assert.rejects(() => pending, /aborted/);
    assert.equal(rl._ttyWrite, originalTty);
  } finally {
    rl.close();
    restore();
  }
});

test("promptNoEcho with attached readline does not echo dummy secret bytes", async () => {
  const { fake, restore } = installFakeTty();
  const chunks = [];
  const output = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  output.isTTY = true;
  const rl = createInterface({ input: fake, output, terminal: true });
  try {
    const pending = promptNoEcho("value: ");
    queueMicrotask(() => fake.emit("data", Buffer.concat([DUMMY, Buffer.from("\n")])));
    const got = await pending;
    assert.deepEqual([...got], [...DUMMY]);
    assert.equal(Buffer.concat(chunks).includes(DUMMY), false);
  } finally {
    rl.close();
    restore();
  }
});
