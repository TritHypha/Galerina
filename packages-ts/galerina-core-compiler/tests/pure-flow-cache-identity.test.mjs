import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseProgram,
  executeFlow,
  clearPureFlowCache,
  pureFlowCacheKey,
  encodePureFlowArgs,
  galerinaValueFingerprint,
  getCachedPureFlow,
  setCachedPureFlow,
  admitPureFlowCacheIdentity,
  composeSourceBoundTag,
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

const LEFT = "1e3b337a72dda550";
const RIGHT = "7d98dbeaba50bb98";

test("fingerprint still collides; exact encoding and cache key do not", () => {
  const l = { __tag: "string", value: LEFT };
  const r = { __tag: "string", value: RIGHT };
  assert.equal(galerinaValueFingerprint(l), galerinaValueFingerprint(r));
  assert.equal(galerinaValueFingerprint(l), 455062583);
  assert.notEqual(encodePureFlowArgs(new Map([["x", l]])), encodePureFlowArgs(new Map([["x", r]])));
  assert.notEqual(
    pureFlowCacheKey(BASE, "echo", new Map([["x", l]]), "src"),
    pureFlowCacheKey(BASE, "echo", new Map([["x", r]]), "src"),
  );
});

test("hostile: forced same lookup key still misses on exact mismatch", () => {
  clearPureFlowCache();
  const l = { __tag: "string", value: LEFT };
  const r = { __tag: "string", value: RIGHT };
  const exactL = encodePureFlowArgs(new Map([["x", l]]));
  const exactR = encodePureFlowArgs(new Map([["x", r]]));
  setCachedPureFlow("forced-bucket", l, exactL);
  assert.equal(getCachedPureFlow("forced-bucket", exactR), undefined);
  const hit = getCachedPureFlow("forced-bucket", exactL);
  assert.equal(hit?.__tag, "string");
  assert.equal(hit.value, LEFT);
});

test("owned copies: mutating a stored record does not change later hits", () => {
  clearPureFlowCache();
  const fields = new Map([["k", { __tag: "int", value: 1 }]]);
  const rec = { __tag: "record", fields };
  const exact = encodePureFlowArgs(new Map([["x", rec]]));
  setCachedPureFlow("own", rec, exact);
  fields.set("k", { __tag: "int", value: 99 });
  const hit = getCachedPureFlow("own", exact);
  assert.equal(hit.__tag, "record");
  assert.equal(hit.fields.get("k").value, 1);
  hit.fields.set("k", { __tag: "int", value: 7 });
  const hit2 = getCachedPureFlow("own", exact);
  assert.equal(hit2.fields.get("k").value, 1);
});

test("composeSourceBoundTag hashes extra instead of dropping it past 256 bytes", () => {
  const hash = "sha256:" + "a".repeat(64);
  const a = composeSourceBoundTag(hash, "A".repeat(300));
  const b = composeSourceBoundTag(hash, "B".repeat(300));
  assert.notEqual(a, b);
  assert.ok(a.startsWith(hash + ":x:"));
  assert.ok(a.length <= 256);
});

test("executeFlow: colliding string arguments recompute distinct results", async () => {
  clearPureFlowCache();
  const src = parseProgram(
    "pure flow echo(x: String) -> String {\n  return x\n}\n",
    "echo.fungi",
  );
  const leftArgs = new Map([["x", { __tag: "string", value: LEFT }]]);
  const rightArgs = new Map([["x", { __tag: "string", value: RIGHT }]]);
  const r1 = await executeFlow("echo", leftArgs, src.ast, src.flows, undefined, undefined, { pureFastPath: true });
  assert.equal(r1.value.__tag, "string");
  assert.equal(r1.value.value, LEFT);
  const r2 = await executeFlow("echo", rightArgs, src.ast, src.flows, undefined, undefined, { pureFastPath: true });
  assert.equal(r2.value.__tag, "string");
  assert.equal(r2.value.value, RIGHT, "fingerprint collision must not reuse the left string");
  const r1b = await executeFlow("echo", leftArgs, src.ast, src.flows, undefined, undefined, { pureFastPath: true });
  assert.equal(r1b.value.__tag, "string");
  assert.equal(r1b.value.value, LEFT);
});

test("date-shaped argument strings stay distinct", () => {
  const a = encodePureFlowArgs(new Map([["t", { __tag: "string", value: "2026-01-01" }]]));
  const b = encodePureFlowArgs(new Map([["t", { __tag: "string", value: "2026-01-02" }]]));
  assert.notEqual(a, b);
  assert.notEqual(
    pureFlowCacheKey(BASE, "echo", new Map([["t", { __tag: "string", value: "2026-01-01" }]]), "src"),
    pureFlowCacheKey(BASE, "echo", new Map([["t", { __tag: "string", value: "2026-01-02" }]]), "src"),
  );
});

test("secure values are cache-ineligible", () => {
  assert.equal(encodePureFlowArgs(new Map([["s", { __tag: "secure", value: "secret" }]])), null);
  assert.equal(admitPureFlowCacheIdentity(BASE, "echo", new Map([["s", { __tag: "secure", value: "secret" }]]), "src"), null);
});
