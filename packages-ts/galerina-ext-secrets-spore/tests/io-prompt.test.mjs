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
    const input = Buffer.from("ab\n");
    queueMicrotask(() => fake.emit("data", input));
    const got = await pending;
    assert.deepEqual([...got], [0x61, 0x62]);
    assert.ok(input.every((byte) => byte === 0), "consumed stdin event bytes must be wiped after copying");
    assert.equal(fake.isRaw, false);
  } finally {
    restore();
  }
});

test("promptNoEcho restores raw mode after Ctrl-C abort", async () => {
  const { fake, restore } = installFakeStdin({ isTTY: true });
  const observedSecretArrays = [];
  const originalPush = Array.prototype.push;
  Array.prototype.push = function (...items) {
    if (items.length === 1 && items[0] === 0x61) observedSecretArrays.push(this);
    return Reflect.apply(originalPush, this, items);
  };
  try {
    const pending = promptNoEcho("secret: ");
    const secretInput = Buffer.from("ab");
    const cancelInput = Buffer.from([0x03]);
    queueMicrotask(() => {
      fake.emit("data", secretInput);
      fake.emit("data", cancelInput);
    });
    await assert.rejects(() => pending, /aborted/);
    assert.ok(secretInput.every((byte) => byte === 0));
    assert.ok(cancelInput.every((byte) => byte === 0));
    assert.equal(fake.isRaw, false);
    assert.equal(observedSecretArrays.length, 1);
    assert.deepEqual(observedSecretArrays[0], [0, 0], "secret bytes accumulated before abort must be overwritten");
  } finally {
    Array.prototype.push = originalPush;
    restore();
  }
});

test("promptNoEcho rejects on stdin termination or handler error and clears accumulated bytes", async () => {
  for (const terminalEvent of ["end", "close", "error", "data-handler-error"]) {
    const { fake, restore } = installFakeStdin({ isTTY: true });
    const observedSecretArrays = [];
    const originalPush = Array.prototype.push;
    Array.prototype.push = function (...items) {
      if (terminalEvent === "data-handler-error" && items.length === 1 && items[0] === 0x62) {
        throw new Error("injected data-handler failure");
      }
      if (items.length === 1 && items[0] === 0x61) observedSecretArrays.push(this);
      return Reflect.apply(originalPush, this, items);
    };
    let input;
    try {
      const pending = promptNoEcho("secret: ").then(
        () => "resolved",
        () => "rejected",
      );
      input = Buffer.from("ab");
      fake.emit("data", input);
      if (terminalEvent === "error") fake.emit("error", new Error("injected stdin error"));
      else if (terminalEvent !== "data-handler-error") fake.emit(terminalEvent);
      const settled = await Promise.race([
        pending,
        new Promise((resolve) => setTimeout(() => resolve("pending"), 25)),
      ]);

      assert.equal(settled, "rejected", `${terminalEvent} must reject rather than leave prompt pending`);
      assert.equal(fake.isRaw, false, `${terminalEvent} must restore terminal mode`);
      assert.deepEqual([...input], [0, 0], "the consumed event buffer must be wiped");
      assert.equal(observedSecretArrays.length, 1);
      const expectedAccumulator = terminalEvent === "data-handler-error" ? [0] : [0, 0];
      assert.deepEqual(observedSecretArrays[0], expectedAccumulator, "accumulated password bytes must be wiped");
      for (const event of ["data", "end", "close", "error", "keypress"]) {
        assert.equal(fake.listenerCount(event), 0, `the ${event} listener must be removed after ${terminalEvent}`);
      }
    } finally {
      Array.prototype.push = originalPush;
      restore();
      fake.removeAllListeners();
    }
  }
});
