import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseProgram,
  executeFlow,
  clearPureFlowCache,
  pureFlowCacheKey,
  admitPureFlowSourceTag,
} from "../dist/index.js";

const BASE = Object.freeze({
  schemaVersion: 1,
  artifactNamespace: "galerina/v1",
  productId: "galerina",
  governanceClass: "zero-trust",
  policyDigest: `sha256:${"a".repeat(64)}`,
  safetyProfile: "strict",
  buildMode: "build-production",
  physicalProfile: "1",
});

test("admitPureFlowSourceTag refuses missing identity", () => {
  assert.throws(() => admitPureFlowSourceTag(undefined), /FUNGI-CACHE-001/);
  assert.throws(() => admitPureFlowSourceTag(""), /FUNGI-CACHE-001/);
  assert.throws(() => pureFlowCacheKey(BASE, "main", new Map(), ""), /FUNGI-CACHE-001/);
  const a = pureFlowCacheKey(BASE, "main", new Map(), "source-a");
  const b = pureFlowCacheKey(BASE, "main", new Map(), "source-b");
  assert.notEqual(a, b);
});

test("hostile: two bodies of the same flow name do not share a cached result", async () => {
  clearPureFlowCache();
  const args = new Map([["x", { __tag: "int", value: 42 }]]);
  const first = parseProgram("pure flow double(x: Int) -> Int {\n  return x\n}\n", "a.fungi");
  const r1 = await executeFlow("double", args, first.ast, first.flows, undefined, undefined, { pureFastPath: true });
  assert.equal(r1.value.__tag, "int");
  assert.equal(r1.value.value, 42);

  const second = parseProgram("pure flow double(x: Int) -> Int {\n  return 0\n}\n", "b.fungi");
  const r2 = await executeFlow("double", args, second.ast, second.flows, undefined, undefined, { pureFastPath: true });
  assert.equal(r2.value.__tag, "int");
  assert.equal(r2.value.value, 0, "second source must not be served the first body's cached 42");
  assert.notEqual(r2.executionTier, "cache");

  const r1b = await executeFlow("double", args, first.ast, first.flows, undefined, undefined, { pureFastPath: true });
  assert.equal(r1b.value.__tag, "int");
  assert.equal(r1b.value.value, 42);
});
