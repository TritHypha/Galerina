import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateCorpusReceipts,
  validateCorpusRequest,
  validateShardReceipt,
} from "../lib/fungi-corpus-receipt.mjs";
import { deriveCorpusShards } from "../lib/fungi-corpus-shards.mjs";

const sha256 = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
const digest = (character) => `sha256:${character.repeat(64)}`;
const identity = Object.freeze({
  profile: "WORKSET",
  productId: "galerina",
  repositoryHead: "0".repeat(40),
  repositoryTree: "1".repeat(40),
  compilerDigest: digest("a"),
  fileSetDigest: digest("b"),
});
const limits = Object.freeze({ maxFiles: 2, maxBytes: 1024, timeoutMs: 1000, maxOutputBytes: 2048 });

function request() {
  return {
    schema: "galerina.fungi-corpus-request.v2",
    ...identity,
    shardCount: 2,
    files: [
      { path: "packages/fungi/products/galerina/fixture/a.fungi", digest: digest("c"), expectationDigest: digest("d"), mode: "plain" },
      { path: "packages/fungi/products/galerina/fixture/b.fungi", digest: digest("e"), expectationDigest: digest("f"), mode: "strict" },
      { path: "packages/fungi/products/galerina/fixture/c.fungi", digest: digest("0"), expectationDigest: digest("1"), mode: "plain" },
    ],
  };
}

function receiptFor(shard, status = "PASS", termination = "COMPLETE") {
  const completed = termination === "COMPLETE"
    ? shard.files.map((file, index) => ({ ...file, resultDigest: digest(String(index + 2)) }))
    : shard.files.slice(0, 1).map((file) => ({ ...file, resultDigest: digest("2") }));
  const unprocessed = termination === "COMPLETE" ? [] : shard.files.slice(1).map((file) => ({ ...file }));
  const base = {
    schema: "galerina.fungi-corpus-shard-receipt.v2",
    shardId: shard.shardId,
    shardDigest: sha256(shard),
    requestDigest: shard.requestDigest,
    startIndex: shard.startIndex,
    endIndexExclusive: shard.endIndexExclusive,
    status,
    termination,
    completed,
    unprocessed,
  };
  return { ...base, resultDigest: sha256(base) };
}

function bindReceipt(receipt, changes) {
  const { resultDigest: ignored, ...base } = receipt;
  const bound = { ...base, ...changes };
  return { ...bound, resultDigest: sha256(bound) };
}

test("validateCorpusRequest accepts the exact request identity as a frozen canonical clone", () => {
  const candidate = request();
  const result = validateCorpusRequest(candidate, identity);
  assert.deepEqual(result, { kind: "accepted", value: candidate });
  assert.notEqual(result.value, candidate);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.files), true);
  assert.equal(Object.isFrozen(result.value.files[0]), true);
});

test("validateCorpusRequest refuses closed-schema neighbours and stale identities", () => {
  const cases = [
    { ...request(), unexpected: true },
    { ...request(), Profile: "WORKSET" },
    { ...request(), profile: "PROJECT" },
    { ...request(), productId: "other" },
    { ...request(), shardCount: 0 },
    { ...request(), files: [request().files[1], request().files[0], request().files[2]] },
    { ...request(), files: [request().files[0], request().files[0], request().files[2]] },
    { ...request(), files: [{ ...request().files[0], path: "/absolute.fungi" }, ...request().files.slice(1)] },
    { ...request(), files: [{ ...request().files[0], path: "packages/../escape.fungi" }, ...request().files.slice(1)] },
  ];
  for (const candidate of cases) assert.equal(validateCorpusRequest(candidate, identity).kind, "refused");
  assert.equal(validateCorpusRequest(request(), { ...identity, repositoryHead: "2".repeat(40) }).kind, "refused");
});

test("validateCorpusRequest refuses hostile and exotic JavaScript input without invoking accessors", () => {
  const accessor = request();
  Object.defineProperty(accessor, "profile", { enumerable: true, get() { throw new Error("must not execute"); } });
  const nonNfc = { ...request(), files: [{ ...request().files[0], path: "packages/fungi/cafe\u0301.fungi" }, ...request().files.slice(1)] };
  const symbol = request();
  symbol[Symbol("hidden")] = true;
  const unsafe = { ...request(), shardCount: Number.MAX_SAFE_INTEGER + 1 };
  const proxy = new Proxy(request(), { ownKeys() { throw new Error("must not execute"); } });
  for (const candidate of [accessor, nonNfc, symbol, unsafe, proxy]) assert.equal(validateCorpusRequest(candidate, identity).kind, "refused");
});

test("validateShardReceipt binds digest, range, terminal status and file order permanently", () => {
  const shards = deriveCorpusShards(request(), limits).value;
  const receipt = receiptFor(shards[0]);
  assert.deepEqual(validateShardReceipt(receipt, shards[0]), { kind: "accepted", value: receipt });
  const mutations = [
    { ...receipt, shardDigest: digest("9") },
    { ...receipt, endIndexExclusive: receipt.endIndexExclusive - 1 },
    { ...receipt, status: "FINDING" },
    { ...receipt, completed: [...receipt.completed].reverse() },
  ];
  for (const candidate of mutations) assert.equal(validateShardReceipt(candidate, shards[0]).kind, "refused");
});

test("aggregateCorpusReceipts normalizes valid arrival order and maps incomplete evidence to HOLD", () => {
  const candidate = request();
  const shards = deriveCorpusShards(candidate, limits).value;
  const receipts = shards.map((shard) => receiptFor(shard));
  const sequential = aggregateCorpusReceipts(candidate, shards, receipts);
  const parallel = aggregateCorpusReceipts(candidate, shards, [...receipts].reverse());
  assert.equal(sequential.kind, "accepted");
  assert.equal(sequential.value.status, "PASS");
  assert.deepEqual(parallel, sequential);
  assert.deepEqual(sequential.value.receiptDigests.map(({ shardId }) => shardId), shards.map(({ shardId }) => shardId));
  const hold = aggregateCorpusReceipts(candidate, shards, [receipts[0]]);
  assert.deepEqual(hold.value.status, "HOLD");
  assert.deepEqual(hold.value.holdReasons, ["MISSING_SHARD"]);
  const duplicate = aggregateCorpusReceipts(candidate, shards, [
    { ...receipts[0], resultDigest: digest("9") },
    receipts[0],
    receipts[1],
  ]);
  assert.deepEqual(duplicate.value.holdReasons, ["DUPLICATE_SHARD", "INVALID_RECEIPT"]);
});

test("aggregateCorpusReceipts preserves exact terminal shard algebra", () => {
  const candidate = request();
  const shards = deriveCorpusShards(candidate, limits).value;
  const finding = aggregateCorpusReceipts(candidate, shards, [receiptFor(shards[0], "FINDING"), receiptFor(shards[1])]);
  const refused = aggregateCorpusReceipts(candidate, shards, [receiptFor(shards[0], "REFUSED"), receiptFor(shards[1])]);
  const unfinished = aggregateCorpusReceipts(candidate, shards, [receiptFor(shards[0], "REFUSED", "TIMEOUT"), receiptFor(shards[1])]);
  assert.equal(finding.value.status, "FINDING");
  assert.equal(refused.value.status, "REFUSED");
  assert.deepEqual(unfinished.value.status, "HOLD");
  assert.deepEqual(unfinished.value.holdReasons, ["UNFINISHED_SHARD"]);
});

test("aggregateCorpusReceipts groups invalid and valid duplicates independently of arrival order", () => {
  const candidate = request();
  const shards = deriveCorpusShards(candidate, limits).value;
  const valid = receiptFor(shards[0]);
  const invalid = { ...valid, resultDigest: digest("9") };
  const tail = receiptFor(shards[1]);
  const forward = aggregateCorpusReceipts(candidate, shards, [invalid, valid, tail]);
  const reverse = aggregateCorpusReceipts(candidate, shards, [valid, invalid, tail]);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.value.holdReasons, ["DUPLICATE_SHARD", "INVALID_RECEIPT"]);
  assert.equal(forward.value.receiptDigests.length, 2);
});

test("aggregateCorpusReceipts selects distinct valid duplicates deterministically", () => {
  const candidate = request();
  const shards = deriveCorpusShards(candidate, limits).value;
  const first = receiptFor(shards[0]);
  const second = bindReceipt(first, {
    completed: first.completed.map((entry) => ({ ...entry, resultDigest: digest("8") })),
  });
  const tail = receiptFor(shards[1]);
  const forward = aggregateCorpusReceipts(candidate, shards, [first, second, tail]);
  const reverse = aggregateCorpusReceipts(candidate, shards, [second, first, tail]);
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.value.holdReasons, ["DUPLICATE_SHARD"]);
});

test("receipt and aggregate validation reject a shard that exceeds its own maxFiles limit", () => {
  const candidate = request();
  const shards = deriveCorpusShards(candidate, limits).value;
  const overflow = shards.map((shard) => ({ ...shard, limits: { ...shard.limits, maxFiles: 1 } }));
  assert.equal(validateShardReceipt(receiptFor(overflow[0]), overflow[0]).kind, "refused");
  assert.equal(aggregateCorpusReceipts(candidate, overflow, overflow.map((shard) => receiptFor(shard))).kind, "refused");
});

test("validateShardReceipt refuses REFUSED COMPLETE receipts with unprocessed files", () => {
  const shard = deriveCorpusShards(request(), limits).value[0];
  const complete = receiptFor(shard, "REFUSED");
  const partial = bindReceipt(complete, {
    completed: complete.completed.slice(0, 1),
    unprocessed: shard.files.slice(1).map((file) => ({ ...file })),
  });
  assert.equal(validateShardReceipt(partial, shard).kind, "refused");
});

test("validateShardReceipt admits only REFUSED byte-overflow receipts with partial coverage", () => {
  const shard = deriveCorpusShards(request(), limits).value[0];
  const overflow = receiptFor(shard, "REFUSED", "BYTE_OVERFLOW");
  assert.deepEqual(validateShardReceipt(overflow, shard), { kind: "accepted", value: overflow });
  for (const status of ["PASS", "FINDING"]) {
    assert.equal(validateShardReceipt(receiptFor(shard, status, "BYTE_OVERFLOW"), shard).kind, "refused");
  }
});
