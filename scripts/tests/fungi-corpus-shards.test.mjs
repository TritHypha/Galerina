import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import { validateCorpusRequest } from "../lib/fungi-corpus-receipt.mjs";
import { deriveCorpusShards } from "../lib/fungi-corpus-shards.mjs";

const sha256 = (value) => `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
const digest = (character) => `sha256:${character.repeat(64)}`;
const limits = { maxFiles: 2, maxBytes: 1024, timeoutMs: 1000, maxOutputBytes: 2048 };

function request(shardCount = 2) {
  return {
    schema: "galerina.fungi-corpus-request.v2",
    profile: "WORKSET",
    productId: "galerina",
    repositoryHead: "0".repeat(40),
    repositoryTree: "1".repeat(40),
    compilerDigest: digest("a"),
    fileSetDigest: digest("b"),
    shardCount,
    files: [
      { path: "packages/fungi/products/galerina/fixture/a.fungi", digest: digest("c"), expectationDigest: digest("d"), mode: "plain" },
      { path: "packages/fungi/products/galerina/fixture/b.fungi", digest: digest("e"), expectationDigest: digest("f"), mode: "plain" },
      { path: "packages/fungi/products/galerina/fixture/c.fungi", digest: digest("0"), expectationDigest: digest("1"), mode: "strict" },
    ],
  };
}

test("deriveCorpusShards creates a balanced contiguous request-bound partition", () => {
  const candidate = request();
  const result = deriveCorpusShards(candidate, limits);
  const expectedRequestDigest = sha256(candidate);
  assert.equal(result.kind, "accepted");
  assert.deepEqual(result.value.map((shard) => ({
    shardId: shard.shardId,
    shardIndex: shard.shardIndex,
    shardCount: shard.shardCount,
    startIndex: shard.startIndex,
    endIndexExclusive: shard.endIndexExclusive,
    requestDigest: shard.requestDigest,
    paths: shard.files.map((file) => file.path),
  })), [
    { shardId: "shard-1-of-2", shardIndex: 0, shardCount: 2, startIndex: 0, endIndexExclusive: 2, requestDigest: expectedRequestDigest, paths: ["packages/fungi/products/galerina/fixture/a.fungi", "packages/fungi/products/galerina/fixture/b.fungi"] },
    { shardId: "shard-2-of-2", shardIndex: 1, shardCount: 2, startIndex: 2, endIndexExclusive: 3, requestDigest: expectedRequestDigest, paths: ["packages/fungi/products/galerina/fixture/c.fungi"] },
  ]);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value[0].limits), true);
  assert.equal(Object.isFrozen(result.value[0].files[0]), true);
});

test("deriveCorpusShards caps shard count at file count without overlap or omission", () => {
  const result = deriveCorpusShards(request(99), limits);
  assert.equal(result.kind, "accepted");
  assert.deepEqual(result.value.map((shard) => shard.files.length), [1, 1, 1]);
  assert.deepEqual(result.value.flatMap((shard) => shard.files.map((file) => file.path)), request().files.map((file) => file.path));
});

test("deriveCorpusShards refuses missing, malformed and insufficient caller supplied limits", () => {
  const cases = [
    undefined,
    { ...limits, maxFiles: 0 },
    { ...limits, maxFiles: 1 },
    { ...limits, timeoutMs: Number.MAX_SAFE_INTEGER + 1 },
    { ...limits, unexpected: true },
    new Proxy({ ...limits }, {}),
  ];
  for (const candidate of cases) assert.equal(deriveCorpusShards(request(), candidate).kind, "refused");
});

test("deriveCorpusShards consumes only validated requests and returns no filesystem or source data", () => {
  const malformed = { ...request(), files: [{ ...request().files[0], path: "C:/escape.fungi" }, ...request().files.slice(1)] };
  assert.equal(validateCorpusRequest(malformed).kind, "refused");
  assert.equal(deriveCorpusShards(malformed, limits).kind, "refused");
  const shard = deriveCorpusShards(request(), limits).value[0];
  assert.deepEqual(Object.keys(shard), ["schema", "shardId", "shardIndex", "shardCount", "startIndex", "endIndexExclusive", "requestDigest", "limits", "files"]);
});
