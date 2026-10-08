import assert from "node:assert/strict";
import { test } from "node:test";
import { readStdinBytesWith } from "../dist/io.js";

function trackBufferAllocations(run) {
  const owned = [];
  const alloc = Buffer.alloc;
  const from = Buffer.from;
  const concat = Buffer.concat;
  Buffer.alloc = function (...args) {
    const result = Reflect.apply(alloc, this, args);
    owned.push(result);
    return result;
  };
  Buffer.from = function (...args) {
    const result = Reflect.apply(from, this, args);
    owned.push(result);
    return result;
  };
  Buffer.concat = function (...args) {
    const result = Reflect.apply(concat, this, args);
    owned.push(result);
    return result;
  };
  try {
    return { result: run(), owned };
  } finally {
    Buffer.alloc = alloc;
    Buffer.from = from;
    Buffer.concat = concat;
  }
}

test("stdin reader keeps the returned value while wiping its scratch, chunk, and concat buffers", () => {
  const source = Uint8Array.of(0x70, 0x61, 0x73, 0x73, 0x0a);
  let reads = 0;
  const { result, owned } = trackBufferAllocations(() => readStdinBytesWith((_fd, target) => {
    if (reads++ > 0) return 0;
    target.set(source);
    return source.length;
  }));

  assert.deepEqual([...result], [0x70, 0x61, 0x73, 0x73]);
  assert.equal(owned.length, 3, "scratch, read chunk, and concatenated copy are all package-owned");
  for (const buffer of owned) assert.ok(buffer.every((byte) => byte === 0));
});

test("stdin reader wipes scratch and captured chunks when a later read fails", () => {
  const source = Uint8Array.of(0x73, 0x65, 0x63, 0x72, 0x65, 0x74);
  let reads = 0;
  const { result: error, owned } = trackBufferAllocations(() => {
    try {
      readStdinBytesWith((_fd, target) => {
        if (reads++ > 0) throw new Error("injected read failure");
        target.set(source);
        return source.length;
      });
    } catch (caught) {
      return caught;
    }
  });

  assert.match(error.message, /injected read failure/);
  assert.equal(owned.length, 2, "scratch and captured chunk exist before the injected failure");
  for (const buffer of owned) assert.ok(buffer.every((byte) => byte === 0));
});
