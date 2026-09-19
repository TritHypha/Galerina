import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { deriveCorpusShards } from "./fungi-corpus-shards.mjs";

const REQUEST_KEYS = Object.freeze([
  "schema", "profile", "productId", "repositoryHead", "repositoryTree",
  "compilerDigest", "fileSetDigest", "shardCount", "files",
]);
const IDENTITY_KEYS = Object.freeze([
  "profile", "productId", "repositoryHead", "repositoryTree", "compilerDigest", "fileSetDigest",
]);
const FILE_KEYS = Object.freeze(["path", "digest", "expectationDigest", "mode"]);
const SHARD_KEYS = Object.freeze([
  "schema", "shardId", "shardIndex", "shardCount", "startIndex", "endIndexExclusive",
  "requestDigest", "limits", "files",
]);
const LIMIT_KEYS = Object.freeze(["maxFiles", "maxBytes", "timeoutMs", "maxOutputBytes"]);
const RECEIPT_KEYS = Object.freeze([
  "schema", "shardId", "shardDigest", "requestDigest", "startIndex", "endIndexExclusive",
  "status", "termination", "completed", "unprocessed", "resultDigest",
]);
const COMPLETED_KEYS = Object.freeze([...FILE_KEYS, "resultDigest"]);
const AGGREGATE_KEYS = Object.freeze([
  "schema", "status", "requestDigest", "shardCount", "receiptDigests", "holdReasons", "resultDigest",
]);
const RECEIPT_DIGEST_KEYS = Object.freeze(["shardId", "digest"]);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HASH = /^[0-9a-f]{40}$/u;
const STATUS = new Set(["PASS", "FINDING", "REFUSED"]);
const TERMINATION = new Set([
  "COMPLETE", "TIMEOUT", "CANCELLED", "CRASH", "OUTPUT_OVERFLOW", "MISSING_RESULT",
  "COMPILER_CHANGED", "REPOSITORY_CHANGED", "BYTE_OVERFLOW",
]);
const HOLD_REASONS = new Set([
  "MISSING_SHARD", "DUPLICATE_SHARD", "FOREIGN_SHARD", "INVALID_RECEIPT", "STALE_RECEIPT", "UNFINISHED_SHARD",
]);

function refused(code) {
  return Object.freeze({ kind: "refused", code });
}

function accepted(value) {
  return Object.freeze({ kind: "accepted", value: freeze(value) });
}

function freeze(value) {
  if (Array.isArray(value)) {
    for (const entry of value) freeze(entry);
  } else if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) freeze(entry);
  }
  return Object.freeze(value);
}

function exactRecord(value, keys) {
  try {
    if (
      value === null
      || typeof value !== "object"
      || Array.isArray(value)
      || utilTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Object.prototype
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string") || !keys.every((key) => Object.hasOwn(descriptors, key))) return null;
    const output = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function exactArray(value) {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const output = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, "value")
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function validDigest(value) {
  return typeof value === "string" && DIGEST.test(value);
}

function validPath(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.normalize("NFC")) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes(":") || value.includes("\0")) return false;
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function normalizeFile(value) {
  const file = exactRecord(value, FILE_KEYS);
  if (
    file === null
    || !validPath(file.path)
    || !validDigest(file.digest)
    || !validDigest(file.expectationDigest)
    || (file.mode !== "plain" && file.mode !== "strict")
  ) return null;
  return { path: file.path, digest: file.digest, expectationDigest: file.expectationDigest, mode: file.mode };
}

function sameFiles(left, right) {
  return left.length === right.length && left.every((file, index) => {
    const peer = right[index];
    return peer !== undefined
      && file.path === peer.path
      && file.digest === peer.digest
      && file.expectationDigest === peer.expectationDigest
      && file.mode === peer.mode;
  });
}

function normalizeLimits(value) {
  const limits = exactRecord(value, LIMIT_KEYS);
  if (limits === null || Object.values(limits).some((entry) => !Number.isSafeInteger(entry) || entry < 1)) return null;
  return {
    maxFiles: limits.maxFiles,
    maxBytes: limits.maxBytes,
    timeoutMs: limits.timeoutMs,
    maxOutputBytes: limits.maxOutputBytes,
  };
}

function sameLimits(left, right) {
  return left.maxFiles === right.maxFiles
    && left.maxBytes === right.maxBytes
    && left.timeoutMs === right.timeoutMs
    && left.maxOutputBytes === right.maxOutputBytes;
}

function normalizeRequest(value, expectedIdentity) {
  const request = exactRecord(value, REQUEST_KEYS);
  if (
    request === null
    || request.schema !== "galerina.fungi-corpus-request.v2"
    || (request.profile !== "WORKSET" && request.profile !== "PROJECT")
    || request.productId !== "galerina"
    || typeof request.repositoryHead !== "string"
    || !HASH.test(request.repositoryHead)
    || typeof request.repositoryTree !== "string"
    || !HASH.test(request.repositoryTree)
    || !validDigest(request.compilerDigest)
    || !validDigest(request.fileSetDigest)
    || !Number.isSafeInteger(request.shardCount)
    || request.shardCount < 1
  ) return null;
  if (expectedIdentity !== undefined) {
    const identity = exactRecord(expectedIdentity, IDENTITY_KEYS);
    if (identity === null || IDENTITY_KEYS.some((key) => identity[key] !== request[key])) return null;
  }
  const candidates = exactArray(request.files);
  if (candidates === null || candidates.length < 1) return null;
  const files = [];
  let previousPath = "";
  for (const candidate of candidates) {
    const file = normalizeFile(candidate);
    if (file === null || (files.length > 0 && file.path <= previousPath)) return null;
    files.push(file);
    previousPath = file.path;
  }
  return {
    schema: request.schema,
    profile: request.profile,
    productId: request.productId,
    repositoryHead: request.repositoryHead,
    repositoryTree: request.repositoryTree,
    compilerDigest: request.compilerDigest,
    fileSetDigest: request.fileSetDigest,
    shardCount: request.shardCount,
    files,
  };
}

function normalizeShard(value) {
  const shard = exactRecord(value, SHARD_KEYS);
  if (
    shard === null
    || shard.schema !== "galerina.fungi-corpus-shard.v2"
    || !Number.isSafeInteger(shard.shardIndex)
    || shard.shardIndex < 0
    || !Number.isSafeInteger(shard.shardCount)
    || shard.shardCount < 1
    || shard.shardIndex >= shard.shardCount
    || shard.shardId !== `shard-${shard.shardIndex + 1}-of-${shard.shardCount}`
    || !Number.isSafeInteger(shard.startIndex)
    || shard.startIndex < 0
    || !Number.isSafeInteger(shard.endIndexExclusive)
    || shard.endIndexExclusive <= shard.startIndex
    || !validDigest(shard.requestDigest)
  ) return null;
  const limits = normalizeLimits(shard.limits);
  const candidates = exactArray(shard.files);
  if (
    limits === null
    || candidates === null
    || candidates.length < 1
    || candidates.length > limits.maxFiles
    || shard.endIndexExclusive - shard.startIndex !== candidates.length
  ) return null;
  const files = [];
  let previousPath = "";
  for (const candidate of candidates) {
    const file = normalizeFile(candidate);
    if (file === null || (files.length > 0 && file.path <= previousPath)) return null;
    files.push(file);
    previousPath = file.path;
  }
  return {
    schema: shard.schema,
    shardId: shard.shardId,
    shardIndex: shard.shardIndex,
    shardCount: shard.shardCount,
    startIndex: shard.startIndex,
    endIndexExclusive: shard.endIndexExclusive,
    requestDigest: shard.requestDigest,
    limits,
    files,
  };
}

function sameShard(left, right) {
  return left.schema === right.schema
    && left.shardId === right.shardId
    && left.shardIndex === right.shardIndex
    && left.shardCount === right.shardCount
    && left.startIndex === right.startIndex
    && left.endIndexExclusive === right.endIndexExclusive
    && left.requestDigest === right.requestDigest
    && sameLimits(left.limits, right.limits)
    && sameFiles(left.files, right.files);
}

function normalizeCompleted(value) {
  const completed = exactRecord(value, COMPLETED_KEYS);
  if (
    completed === null
    || !validPath(completed.path)
    || !validDigest(completed.digest)
    || !validDigest(completed.expectationDigest)
    || (completed.mode !== "plain" && completed.mode !== "strict")
    || !validDigest(completed.resultDigest)
  ) return null;
  return {
    path: completed.path,
    digest: completed.digest,
    expectationDigest: completed.expectationDigest,
    mode: completed.mode,
    resultDigest: completed.resultDigest,
  };
}

function normalizeReceipt(value, shard) {
  const receipt = exactRecord(value, RECEIPT_KEYS);
  if (
    receipt === null
    || receipt.schema !== "galerina.fungi-corpus-shard-receipt.v2"
    || receipt.shardId !== shard.shardId
    || receipt.shardDigest !== canonicalDigest(shard)
    || receipt.requestDigest !== shard.requestDigest
    || receipt.startIndex !== shard.startIndex
    || receipt.endIndexExclusive !== shard.endIndexExclusive
    || !STATUS.has(receipt.status)
    || !TERMINATION.has(receipt.termination)
    || !validDigest(receipt.resultDigest)
  ) return null;
  const completedCandidates = exactArray(receipt.completed);
  const unprocessedCandidates = exactArray(receipt.unprocessed);
  if (completedCandidates === null || unprocessedCandidates === null) return null;
  const completed = [];
  for (const candidate of completedCandidates) {
    const entry = normalizeCompleted(candidate);
    if (entry === null) return null;
    completed.push(entry);
  }
  const unprocessed = [];
  for (const candidate of unprocessedCandidates) {
    const entry = normalizeFile(candidate);
    if (entry === null) return null;
    unprocessed.push(entry);
  }
  const covered = [...completed.map(({ resultDigest, ...file }) => file), ...unprocessed];
  if (!sameFiles(covered, shard.files)) return null;
  if (receipt.termination === "COMPLETE" && unprocessed.length !== 0) return null;
  if ((receipt.status === "PASS" || receipt.status === "FINDING") && receipt.termination !== "COMPLETE") return null;
  if (receipt.termination !== "COMPLETE" && receipt.status !== "REFUSED") return null;
  const base = {
    schema: receipt.schema,
    shardId: receipt.shardId,
    shardDigest: receipt.shardDigest,
    requestDigest: receipt.requestDigest,
    startIndex: receipt.startIndex,
    endIndexExclusive: receipt.endIndexExclusive,
    status: receipt.status,
    termination: receipt.termination,
    completed,
    unprocessed,
  };
  if (receipt.resultDigest !== canonicalDigest(base)) return null;
  return { ...base, resultDigest: receipt.resultDigest };
}

function receiptIdentity(value) {
  const record = exactRecord(value, RECEIPT_KEYS);
  return record === null || typeof record.shardId !== "string" ? null : record;
}

function staleReceipt(record, shard) {
  return record.requestDigest !== shard.requestDigest
    || record.shardDigest !== canonicalDigest(shard)
    || record.startIndex !== shard.startIndex
    || record.endIndexExclusive !== shard.endIndexExclusive;
}

export function validateCorpusRequest(value, expectedIdentity) {
  try {
    const request = normalizeRequest(value, expectedIdentity);
    return request === null ? refused("CORPUS_REQUEST_INVALID") : accepted(request);
  } catch {
    return refused("CORPUS_REQUEST_HOSTILE");
  }
}

export function validateShardReceipt(value, shard) {
  try {
    const expected = normalizeShard(shard);
    if (expected === null) return refused("CORPUS_SHARD_INVALID");
    const receipt = normalizeReceipt(value, expected);
    return receipt === null ? refused("CORPUS_SHARD_RECEIPT_INVALID") : accepted(receipt);
  } catch {
    return refused("CORPUS_SHARD_RECEIPT_HOSTILE");
  }
}

export function aggregateCorpusReceipts(value, shardValues, receiptValues) {
  try {
    const request = normalizeRequest(value);
    const suppliedShards = exactArray(shardValues);
    const suppliedReceipts = exactArray(receiptValues);
    if (request === null || suppliedShards === null || suppliedReceipts === null || suppliedShards.length < 1) return refused("CORPUS_AGGREGATE_INVALID");
    const shards = suppliedShards.map((candidate) => normalizeShard(candidate));
    if (shards.some((shard) => shard === null)) return refused("CORPUS_AGGREGATE_SHARDS");
    const firstShard = shards[0];
    if (firstShard === undefined || shards.some((shard) => !sameLimits(shard.limits, firstShard.limits))) return refused("CORPUS_AGGREGATE_SHARDS");
    const derivation = deriveCorpusShards(request, firstShard.limits);
    if (derivation.kind !== "accepted") return refused("CORPUS_AGGREGATE_SHARDS");
    const expectedShards = derivation.value;
    if (shards.length !== expectedShards.length || shards.some((shard, index) => !sameShard(shard, expectedShards[index]))) return refused("CORPUS_AGGREGATE_SHARDS");

    const byId = new Map(expectedShards.map((shard) => [shard.shardId, shard]));
    const validated = new Map();
    const grouped = new Map();
    const reasons = new Set();
    for (const candidate of suppliedReceipts) {
      const record = receiptIdentity(candidate);
      if (record === null) {
        reasons.add("INVALID_RECEIPT");
        continue;
      }
      const expected = byId.get(record.shardId);
      if (expected === undefined) {
        reasons.add("FOREIGN_SHARD");
        continue;
      }
      const group = grouped.get(expected.shardId) ?? [];
      group.push(candidate);
      grouped.set(expected.shardId, group);
    }
    for (const shard of expectedShards) {
      const group = grouped.get(shard.shardId) ?? [];
      if (group.length > 1) reasons.add("DUPLICATE_SHARD");
      const receipts = [];
      for (const candidate of group) {
        const record = receiptIdentity(candidate);
        if (record === null) {
          reasons.add("INVALID_RECEIPT");
          continue;
        }
        const receipt = normalizeReceipt(candidate, shard);
        if (receipt === null) {
          reasons.add(staleReceipt(record, shard) ? "STALE_RECEIPT" : "INVALID_RECEIPT");
          continue;
        }
        receipts.push(receipt);
      }
      receipts.sort((left, right) => {
        const leftDigest = canonicalDigest(left);
        const rightDigest = canonicalDigest(right);
        return leftDigest < rightDigest ? -1 : leftDigest > rightDigest ? 1 : 0;
      });
      const selected = receipts[0];
      if (selected !== undefined) {
        validated.set(shard.shardId, selected);
        if (selected.termination !== "COMPLETE") reasons.add("UNFINISHED_SHARD");
      }
    }
    for (const shard of expectedShards) if (!validated.has(shard.shardId)) reasons.add("MISSING_SHARD");
    const holdReasons = [...reasons].filter((reason) => HOLD_REASONS.has(reason)).sort();
    const orderedReceipts = expectedShards.flatMap((shard) => {
      const receipt = validated.get(shard.shardId);
      return receipt === undefined ? [] : [receipt];
    });
    const status = holdReasons.length > 0
      ? "HOLD"
      : orderedReceipts.some((receipt) => receipt.status === "REFUSED")
        ? "REFUSED"
        : orderedReceipts.some((receipt) => receipt.status === "FINDING") ? "FINDING" : "PASS";
    const base = {
      schema: "galerina.fungi-corpus-aggregate.v2",
      status,
      requestDigest: canonicalDigest(request),
      shardCount: expectedShards.length,
      receiptDigests: orderedReceipts.map((receipt) => ({ shardId: receipt.shardId, digest: canonicalDigest(receipt) })),
      holdReasons,
    };
    return accepted({ ...base, resultDigest: canonicalDigest(base) });
  } catch {
    return refused("CORPUS_AGGREGATE_HOSTILE");
  }
}
