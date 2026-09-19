import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { validateCorpusRequest } from "./fungi-corpus-receipt.mjs";

const LIMIT_KEYS = Object.freeze(["maxFiles", "maxBytes", "timeoutMs", "maxOutputBytes"]);

function refused(code) {
  return Object.freeze({ kind: "refused", code });
}

function freeze(value) {
  if (Array.isArray(value)) {
    for (const entry of value) freeze(entry);
  } else if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) freeze(entry);
  }
  return Object.freeze(value);
}

function exactLimits(value) {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)) return null;
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== LIMIT_KEYS.length || !LIMIT_KEYS.every((key) => Object.hasOwn(descriptors, key))) return null;
    const output = {};
    for (const key of LIMIT_KEYS) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")
        || descriptor.get !== undefined
        || descriptor.set !== undefined
        || !Number.isSafeInteger(descriptor.value)
        || descriptor.value < 1
      ) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

export function deriveCorpusShards(value, limitValue) {
  try {
    const requestResult = validateCorpusRequest(value);
    const limits = exactLimits(limitValue);
    if (requestResult.kind !== "accepted" || limits === null) return refused("CORPUS_SHARDS_INVALID");
    const request = requestResult.value;
    const shardCount = Math.min(request.shardCount, request.files.length);
    const baseSize = Math.floor(request.files.length / shardCount);
    const remainder = request.files.length % shardCount;
    const requestDigest = canonicalDigest(request);
    const shards = [];
    let startIndex = 0;
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
      const size = baseSize + (shardIndex < remainder ? 1 : 0);
      if (size > limits.maxFiles) return refused("CORPUS_SHARDS_MAX_FILES");
      const endIndexExclusive = startIndex + size;
      shards.push({
        schema: "galerina.fungi-corpus-shard.v2",
        shardId: `shard-${shardIndex + 1}-of-${shardCount}`,
        shardIndex,
        shardCount,
        startIndex,
        endIndexExclusive,
        requestDigest,
        limits: { ...limits },
        files: request.files.slice(startIndex, endIndexExclusive).map((file) => ({ ...file })),
      });
      startIndex = endIndexExclusive;
    }
    return Object.freeze({ kind: "accepted", value: freeze(shards) });
  } catch {
    return refused("CORPUS_SHARDS_HOSTILE");
  }
}
