import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_RETRY_ATTEMPTS,
  withRetry,
} from "../dist/runtime/retryPolicy.js";

function policy(maxAttempts, strategy = "linear", delayMs = 0) {
  return { policies: new Map([["io", { maxAttempts, strategy, delayMs }]]) };
}

test("withRetry succeeds on the first attempt without extra calls", async () => {
  let calls = 0;
  const value = await withRetry("io", policy(3), async () => {
    calls += 1;
    return 7;
  });
  assert.equal(value, 7);
  assert.equal(calls, 1);
});

test("hostile: Infinity attempts collapse to one try, not an unbounded loop", async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry("io", policy(Number.POSITIVE_INFINITY), async () => {
      calls += 1;
      throw new Error("fail");
    }),
    /fail/,
  );
  assert.equal(calls, 1);
});

test("hostile: 1e9 declared attempts still stop at MAX_RETRY_ATTEMPTS", async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry("io", policy(1_000_000_000), async () => {
      calls += 1;
      throw new Error("fail");
    }),
    /fail/,
  );
  assert.equal(calls, MAX_RETRY_ATTEMPTS);
});

test("non-positive attempts collapse to one try", async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry("io", policy(0), async () => {
      calls += 1;
      throw new Error("fail");
    }),
    /fail/,
  );
  assert.equal(calls, 1);
});
