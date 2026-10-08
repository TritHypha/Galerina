import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BCRYPT_MAX_ROUNDS,
  BCRYPT_MIN_ROUNDS,
  createNodePasswordKdfProvider,
} from "../dist/crypto-provider-node.js";

const DUMMY = "dummy-password-value";

test("bcrypt hash at admitted rounds verifies", async () => {
  const p = createNodePasswordKdfProvider();
  const hashed = await p.invoke({ algorithm: "bcrypt", op: "password-hash", plaintext: DUMMY, rounds: BCRYPT_MIN_ROUNDS });
  assert.equal(hashed.ok, true);
  assert.equal(hashed.kind, "hash");
  const verified = await p.invoke({
    algorithm: "bcrypt",
    op: "password-verify",
    plaintext: DUMMY,
    hash: hashed.hash,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.matches, true);
});

test("bcrypt adapter refuses over-72-byte verification instead of accepting a truncated match", async () => {
  const p = createNodePasswordKdfProvider();
  const prefix = "a".repeat(72);
  const hashed = await p.invoke({
    algorithm: "bcrypt",
    op: "password-hash",
    plaintext: prefix,
    rounds: BCRYPT_MIN_ROUNDS,
  });
  assert.equal(hashed.ok, true);
  const exact = await p.invoke({
    algorithm: "bcrypt",
    op: "password-verify",
    plaintext: prefix,
    hash: hashed.hash,
  });
  assert.deepEqual(exact, { ok: true, kind: "verify", matches: true });

  const overflow = await p.invoke({
    algorithm: "bcrypt",
    op: "password-verify",
    plaintext: `${prefix}x`,
    hash: hashed.hash,
  });
  assert.equal(overflow.ok, false, "different suffix past bcrypt's 72-byte boundary must not match");
});

test("bcrypt adapter refuses over-72-byte hashes instead of silently truncating input", async () => {
  const p = createNodePasswordKdfProvider();
  const result = await p.invoke({
    algorithm: "bcrypt",
    op: "password-hash",
    plaintext: `${"a".repeat(72)}x`,
    rounds: BCRYPT_MIN_ROUNDS,
  });
  assert.equal(result.ok, false, "hashing must refuse rather than silently discard suffix bytes");
});

test("bcrypt adapter measures UTF-8 bytes and refuses a multi-byte overflow", async () => {
  const p = createNodePasswordKdfProvider();
  const exactLimit = await p.invoke({
    algorithm: "bcrypt",
    op: "password-hash",
    plaintext: `${"a".repeat(70)}é`,
    rounds: BCRYPT_MIN_ROUNDS,
  });
  assert.equal(exactLimit.ok, true, "70 ASCII bytes plus a two-byte character remain at the 72-byte limit");

  const result = await p.invoke({
    algorithm: "bcrypt",
    op: "password-hash",
    plaintext: `${"a".repeat(71)}é`,
    rounds: BCRYPT_MIN_ROUNDS,
  });
  assert.equal(result.ok, false, "71 ASCII bytes plus a two-byte character exceed the 72-byte limit");
});

test("hostile: source-controlled rounds above 12 are refused", async () => {
  const p = createNodePasswordKdfProvider();
  await assert.rejects(
    () => p.invoke({ algorithm: "bcrypt", op: "password-hash", plaintext: DUMMY, rounds: BCRYPT_MAX_ROUNDS + 1 }),
    /10\.\.12/,
  );
  await assert.rejects(
    () => p.invoke({ algorithm: "bcrypt", op: "password-hash", plaintext: DUMMY, rounds: Number.POSITIVE_INFINITY }),
    /10\.\.12/,
  );
});

test("hostile: cheap rounds below 10 are refused", async () => {
  const p = createNodePasswordKdfProvider();
  await assert.rejects(
    () => p.invoke({ algorithm: "bcrypt", op: "password-hash", plaintext: DUMMY, rounds: 4 }),
    /10\.\.12/,
  );
});
