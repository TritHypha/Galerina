import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { promptNoEcho } from "../dist/io.js";

function installFakeStdin({ isTTY, withRaw = true }) {
  const fake = new EventEmitter();
  fake.isTTY = isTTY;
  fake.isRaw = false;
  fake.setRawMode = withRaw
    ? (mode) => { fake.isRaw = mode; return fake; }
    : undefined;
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

test("promptNoEcho refuses non-TTY stdin instead of falling back to echo", async () => {
  const { restore } = installFakeStdin({ isTTY: false });
  try {
    await assert.rejects(() => promptNoEcho("secret: "), /TTY/);
  } finally {
    restore();
  }
});

test("promptNoEcho restores raw mode after a successful read", async () => {
  const { fake, restore } = installFakeStdin({ isTTY: true });
  try {
    const pending = promptNoEcho("secret: ");
    queueMicrotask(() => fake.emit("data", Buffer.from("ab\n")));
    const got = await pending;
    assert.deepEqual([...got], [0x61, 0x62]);
    assert.equal(fake.isRaw, false);
  } finally {
    restore();
  }
});

test("promptNoEcho restores raw mode after Ctrl-C abort", async () => {
  const { fake, restore } = installFakeStdin({ isTTY: true });
  try {
    const pending = promptNoEcho("secret: ");
    queueMicrotask(() => fake.emit("data", Buffer.from([0x03])));
    await assert.rejects(() => pending, /aborted/);
    assert.equal(fake.isRaw, false);
  } finally {
    restore();
  }
});
