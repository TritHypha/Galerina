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
