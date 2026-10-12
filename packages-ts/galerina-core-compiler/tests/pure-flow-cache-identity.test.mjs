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
  assert.notEqual(exact, null, "plain owned records remain eligible for exact cache identity");
  setCachedPureFlow("own", rec, exact);
  fields.set("k", { __tag: "int", value: 99 });
  const hit = getCachedPureFlow("own", exact);
  assert.equal(hit.__tag, "record");
  assert.equal(hit.fields.get("k").value, 1);
  hit.fields.set("k", { __tag: "int", value: 7 });
  const hit2 = getCachedPureFlow("own", exact);
  assert.equal(hit2.fields.get("k").value, 1);
});

test("cache-owned byte copies do not invoke a host iterator accessor", () => {
  let iteratorReads = 0;
  const bytes = new Uint8Array([3, 7, 11]);
  Object.defineProperty(bytes, Symbol.iterator, {
    configurable: true,
    get() {
      iteratorReads += 1;
      return undefined;
    },
  });

  setCachedPureFlow("byte-copy-accessor", { __tag: "bytes", value: bytes });
  assert.equal(iteratorReads, 0);
  const hit = getCachedPureFlow("byte-copy-accessor");
  assert.equal(hit?.__tag, "bytes");
  assert.deepEqual([hit.value[0], hit.value[1], hit.value[2]], [3, 7, 11]);
  assert.equal(iteratorReads, 0);
});

test("cache-owned list copies do not invoke an own map accessor", () => {
  let mapReads = 0;
  const items = [{ __tag: "int", value: 13 }];
  Object.defineProperty(items, "map", {
    configurable: true,
    get() {
      mapReads += 1;
      return Array.prototype.map;
    },
  });
  setCachedPureFlow("list-copy-accessor", { __tag: "list", items });
  assert.equal(mapReads, 0);
  const hit = getCachedPureFlow("list-copy-accessor");
  assert.equal(hit?.__tag, "list");
  assert.equal(hit.items.length, 1);
  assert.equal(hit.items[0].value, 13);
  assert.equal(mapReads, 0);
});

test("cache-owned record copies do not invoke an own iterator accessor", () => {
  let iteratorReads = 0;
  const fields = new Map([["answer", { __tag: "int", value: 42 }]]);
  Object.defineProperty(fields, Symbol.iterator, {
    configurable: true,
    get() {
      iteratorReads += 1;
      return Map.prototype[Symbol.iterator];
    },
  });
  setCachedPureFlow("record-copy-accessor", { __tag: "record", fields });
  assert.equal(iteratorReads, 0);
  const hit = getCachedPureFlow("record-copy-accessor");
  assert.equal(hit?.__tag, "record");
  assert.equal(hit.fields.get("answer").value, 42);
  assert.equal(iteratorReads, 0);
});

test("cache-owned scalar copies ignore unrelated host accessors", () => {
  let reads = 0;
  const value = { __tag: "string", value: "owned" };
  Object.defineProperty(value, "hostMetadata", {
    enumerable: true,
    get() {
      reads += 1;
      throw new Error("unrelated host getter ran");
    },
  });
  setCachedPureFlow("scalar-copy-accessor", value);
  assert.equal(reads, 0);
  const hit = getCachedPureFlow("scalar-copy-accessor");
  assert.equal(hit?.__tag, "string");
  assert.equal(hit.value, "owned");
  assert.equal(reads, 0);
});

test("cache admission refuses an accessor-backed value tag without executing it", () => {
  let tagReads = 0;
  const value = {};
  Object.defineProperty(value, "__tag", {
    get() {
      tagReads += 1;
      throw new Error("host tag getter ran");
    },
  });
  assert.doesNotThrow(() => setCachedPureFlow("tag-copy-accessor", value));
  assert.equal(tagReads, 0);
  assert.equal(getCachedPureFlow("tag-copy-accessor"), undefined);
});

test("cache identity and owned copies preserve narrow-float width", () => {
  const f16 = { __tag: "float", value: 1, width: 16 };
  const f32 = { __tag: "float", value: 1, width: 32 };
  const encoded16 = encodePureFlowArgs(new Map([["f", f16]]));
  const encoded32 = encodePureFlowArgs(new Map([["f", f32]]));
  assert.notEqual(encoded16, null);
  assert.notEqual(encoded32, null);
  assert.notEqual(encoded16, encoded32);

  setCachedPureFlow("float-width-copy", f16);
  const hit = getCachedPureFlow("float-width-copy");
  assert.equal(hit?.__tag, "float");
  assert.equal(hit.width, 16);

  setCachedPureFlow("float32-width-copy", f32);
  assert.equal(getCachedPureFlow("float32-width-copy")?.width, 32);
});

test("cache-owned float copy preserves an own undefined width against inherited host metadata", () => {
  const value = { __tag: "float", value: 1, width: undefined };
  const originalWidthDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "width");
  Object.defineProperty(Object.prototype, "width", {
    configurable: true,
    value: 16,
  });
  try {
    setCachedPureFlow("float-own-undefined-width", value);
    const hit = getCachedPureFlow("float-own-undefined-width");
    assert.equal(Object.hasOwn(hit, "width"), true);
    assert.equal(hit.width, undefined);
  } finally {
    if (originalWidthDescriptor === undefined) delete Object.prototype.width;
    else Object.defineProperty(Object.prototype, "width", originalWidthDescriptor);
  }
});

test("cache-owned float copy freezes an omitted width against later host-prototype changes", () => {
  const value = Object.create(null);
  Object.defineProperties(value, {
    __tag: { enumerable: true, value: "float" },
    value: { enumerable: true, value: 1 },
  });
  setCachedPureFlow("float-omitted-width", value);
  const originalWidthDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "width");
  Object.defineProperty(Object.prototype, "width", {
    configurable: true,
    value: 16,
  });
  try {
    const hit = getCachedPureFlow("float-omitted-width");
    assert.equal(Object.hasOwn(hit, "width"), true);
    assert.equal(hit.width, undefined);
  } finally {
    if (originalWidthDescriptor === undefined) delete Object.prototype.width;
    else Object.defineProperty(Object.prototype, "width", originalWidthDescriptor);
  }
});

test("cache admission refuses invalid or accessor-backed narrow-float width", () => {
  assert.equal(encodePureFlowArgs(new Map([[
    "f", { __tag: "float", value: 1, width: 64 },
  ]])), null);
  let reads = 0;
  const value = { __tag: "float", value: 1 };
  Object.defineProperty(value, "width", {
    get() {
      reads += 1;
      throw new Error("host float-width getter ran");
    },
  });
  assert.equal(encodePureFlowArgs(new Map([["f", value]])), null);
  assert.equal(reads, 0);

  const inheritedWidth = Object.create({ width: 16 });
  Object.defineProperties(inheritedWidth, {
    __tag: { value: "float", enumerable: true },
    value: { value: 1, enumerable: true },
  });
  assert.equal(encodePureFlowArgs(new Map([["f", inheritedWidth]])), null);
});

test("cache setter refuses proxy and accessor-backed list values without replacing a valid entry", () => {
  let traps = 0;
  let slotReads = 0;
  const valid = { __tag: "string", value: "preserved" };
  setCachedPureFlow("setter-refusal", valid);
  const proxyValue = new Proxy({ __tag: "int", value: 1 }, {
    get() { traps += 1; throw new Error("setter proxy getter ran"); },
    getOwnPropertyDescriptor() { traps += 1; throw new Error("setter proxy descriptor trap ran"); },
  });
  const listItems = new Array(1);
  Object.defineProperty(listItems, "0", {
    configurable: true,
    get() {
      slotReads += 1;
      throw new Error("setter list slot getter ran");
    },
  });
  const revoked = Proxy.revocable({ __tag: "int", value: 2 }, {});
  revoked.revoke();

  assert.doesNotThrow(() => setCachedPureFlow("setter-refusal", proxyValue));
  assert.doesNotThrow(() => setCachedPureFlow("setter-refusal", { __tag: "list", items: listItems }));
  assert.doesNotThrow(() => setCachedPureFlow("setter-refusal", revoked.proxy));
  assert.equal(traps, 0);
  assert.equal(slotReads, 0);
  assert.equal(getCachedPureFlow("setter-refusal")?.value, "preserved");
});

test("cache-owned byte values detach both input and returned-hit mutations", () => {
  const source = new Uint8Array([3, 7, 11]);
  setCachedPureFlow("byte-owned-copy", { __tag: "bytes", value: source });
  source[0] = 99;
  const first = getCachedPureFlow("byte-owned-copy");
  assert.equal(first?.__tag, "bytes");
  assert.deepEqual([first.value[0], first.value[1], first.value[2]], [3, 7, 11]);
  first.value[1] = 88;
  const second = getCachedPureFlow("byte-owned-copy");
  assert.deepEqual([second.value[0], second.value[1], second.value[2]], [3, 7, 11]);
});

test("cache-owned nested list/option/result values detach input and returned-hit mutations", () => {
  const leaf = { __tag: "string", value: "original" };
  const source = {
    __tag: "list",
    items: [{ __tag: "some", value: { __tag: "ok", value: { __tag: "err", error: leaf } } }],
  };
  setCachedPureFlow("nested-owned-copy", source);
  leaf.value = "input-mutated";

  const first = getCachedPureFlow("nested-owned-copy");
  assert.equal(first?.items[0].value.value.error.value, "original");
  first.items[0].value.value.error.value = "hit-mutated";
  const second = getCachedPureFlow("nested-owned-copy");
  assert.equal(second.items[0].value.value.error.value, "original");
});

test("cache setter enforces exact output byte limits including its value-key wrapper", () => {
  const exact = { __tag: "string", value: "x".repeat(65_521) };
  setCachedPureFlow("setter-exact-byte-limit", exact);
  assert.equal(getCachedPureFlow("setter-exact-byte-limit")?.value.length, 65_521);

  setCachedPureFlow("setter-over-byte-limit", { __tag: "string", value: "x".repeat(65_522) });
  assert.equal(getCachedPureFlow("setter-over-byte-limit"), undefined);
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

test("executeFlow: cache identity keeps equal-valued floats with different widths distinct", async () => {
  clearPureFlowCache();
  const src = parseProgram(
    "pure flow echoFloat(x: Float) -> Float {\n  return x\n}\n",
    "echo-float-width.fungi",
  );
  const f16Cold = await executeFlow(
    "echoFloat",
    new Map([["x", { __tag: "float", value: 1.0001, width: 16 }]]),
    src.ast,
    src.flows,
    undefined,
    undefined,
    { pureFastPath: true },
  );
  const f32Cold = await executeFlow(
    "echoFloat",
    new Map([["x", { __tag: "float", value: 1.0001, width: 32 }]]),
    src.ast,
    src.flows,
    undefined,
    undefined,
    { pureFastPath: true },
  );
  const f16Hit = await executeFlow(
    "echoFloat",
    new Map([["x", { __tag: "float", value: 1.0001, width: 16 }]]),
    src.ast,
    src.flows,
    undefined,
    undefined,
    { pureFastPath: true },
  );
  const f32Hit = await executeFlow(
    "echoFloat",
    new Map([["x", { __tag: "float", value: 1.0001, width: 32 }]]),
    src.ast,
    src.flows,
    undefined,
    undefined,
    { pureFastPath: true },
  );

  assert.equal(f16Cold.executionTier, "sync");
  assert.equal(f16Cold.value.__tag, "float");
  assert.equal(f16Cold.value.width, 16);
  assert.equal(f32Cold.executionTier, "sync", "Float32 must not reuse the cached Float16 result");
  assert.equal(f32Cold.value.__tag, "float");
  assert.equal(f32Cold.value.width, 32);
  assert.equal(f16Hit.executionTier, "cache");
  assert.equal(f16Hit.value.width, 16);
  assert.equal(f32Hit.executionTier, "cache");
  assert.equal(f32Hit.value.width, 32);
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

test("cache admission refuses host accessors and proxies without executing them", () => {
  let reads = 0;
  const accessorTag = {};
  Object.defineProperty(accessorTag, "__tag", {
    get() {
      reads += 1;
      throw new Error("host tag getter ran");
    },
  });
  assert.equal(encodePureFlowArgs(new Map([["x", accessorTag]])), null);

  const accessorItems = [];
  Object.defineProperty(accessorItems, "0", {
    configurable: true,
    get() {
      reads += 1;
      throw new Error("host list getter ran");
    },
  });
  accessorItems.length = 1;
  assert.equal(encodePureFlowArgs(new Map([["x", { __tag: "list", items: accessorItems }]])), null);

  let traps = 0;
  const proxyValue = new Proxy({ __tag: "int", value: 7 }, {
    get() { traps += 1; throw new Error("host proxy get trap ran"); },
    getOwnPropertyDescriptor() { traps += 1; throw new Error("host proxy descriptor trap ran"); },
  });
  assert.equal(encodePureFlowArgs(new Map([["x", proxyValue]])), null);

  const bytes = new Uint8Array([1, 2, 255]);
  Object.defineProperty(bytes, Symbol.iterator, {
    configurable: true,
    get() {
      reads += 1;
      throw new Error("host byte iterator getter ran");
    },
  });
  assert.equal(encodePureFlowArgs(new Map([["x", { __tag: "bytes", value: bytes }]])), "1:x=X3:0102ff");
  assert.equal(reads, 0, "cache encoding must never run host accessors");
  assert.equal(traps, 0, "proxy detection must not invoke proxy traps");
});

test("cache admission rejects nested and revoked container proxies before inspection", () => {
  let traps = 0;
  const trapped = target => new Proxy(target, {
    getPrototypeOf() { traps += 1; throw new Error("container proxy trap ran"); },
    get() { traps += 1; throw new Error("container proxy trap ran"); },
  });

  const recordFields = trapped(new Map([["k", { __tag: "int", value: 1 }]]));
  const listItems = Proxy.revocable([{ __tag: "int", value: 1 }], {
    get() { traps += 1; throw new Error("revoked list proxy trap ran"); },
  });
  const byteValue = trapped(new Uint8Array([1, 2, 3]));
  const revokedFields = Proxy.revocable(new Map([["k", { __tag: "int", value: 1 }]]), {});
  const revokedBytes = Proxy.revocable(new Uint8Array([1]), {});
  const forgedMap = Object.setPrototypeOf({}, Map.prototype);
  const forgedBytes = Object.setPrototypeOf({}, Uint8Array.prototype);

  assert.equal(encodePureFlowArgs(new Map([[
    "record", { __tag: "record", fields: recordFields },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "list", { __tag: "list", items: listItems.proxy },
  ]])), null);
  listItems.revoke();
  assert.equal(encodePureFlowArgs(new Map([[
    "list", { __tag: "list", items: listItems.proxy },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "bytes", { __tag: "bytes", value: byteValue },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "record", { __tag: "record", fields: revokedFields.proxy },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "bytes", { __tag: "bytes", value: revokedBytes.proxy },
  ]])), null);
  revokedFields.revoke();
  revokedBytes.revoke();
  assert.equal(encodePureFlowArgs(new Map([[
    "record", { __tag: "record", fields: revokedFields.proxy },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "bytes", { __tag: "bytes", value: revokedBytes.proxy },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "record", { __tag: "record", fields: forgedMap },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "bytes", { __tag: "bytes", value: forgedBytes },
  ]])), null);
  assert.equal(traps, 0, "cache admission must detect proxies before reflective operations");
});

test("cache admission rejects a proxied outer argument map without calling its traps", () => {
  let traps = 0;
  const args = new Proxy(new Map([["x", { __tag: "int", value: 1 }]]), {
    get() { traps += 1; throw new Error("outer map get trap ran"); },
    getPrototypeOf() { traps += 1; throw new Error("outer map prototype trap ran"); },
  });
  assert.equal(encodePureFlowArgs(args), null);
  assert.equal(traps, 0);

  const revokedOuter = Proxy.revocable(new Map([["x", { __tag: "int", value: 1 }]]), {});
  revokedOuter.revoke();
  assert.equal(encodePureFlowArgs(revokedOuter.proxy), null);
  assert.equal(encodePureFlowArgs(Object.setPrototypeOf({}, Map.prototype)), null);

  let methodCalls = 0;
  class HostMap extends Map {
    keys() { methodCalls += 1; throw new Error("overridden keys ran"); }
    get() { methodCalls += 1; throw new Error("overridden get ran"); }
  }
  assert.equal(encodePureFlowArgs(new HostMap([["x", { __tag: "int", value: 1 }]])), null);

  const ownOverrides = new Map([["x", { __tag: "int", value: 1 }]]);
  Object.defineProperties(ownOverrides, {
    keys: { get() { methodCalls += 1; throw new Error("own keys getter ran"); } },
    get: { get() { methodCalls += 1; throw new Error("own get getter ran"); } },
  });
  assert.equal(encodePureFlowArgs(ownOverrides), "1:x=I1");
  assert.equal(methodCalls, 0);
});

test("cache admission preserves the three numeric Verdict values distinctly", () => {
  const encoded = [-1, 0, 1].map(value => encodePureFlowArgs(new Map([[
    "decision", { __tag: "verdict", value },
  ]])));
  assert.ok(encoded.every(value => value !== null));
  assert.equal(new Set(encoded).size, 3);
  for (const value of ["allow", -2, 2, NaN]) {
    assert.equal(encodePureFlowArgs(new Map([[
      "decision", { __tag: "verdict", value },
    ]])), null);
  }
});

test("cache admission refuses oversized outer and nested collections", () => {
  const tooManyArgs = new Map(Array.from({ length: 4097 }, (_, index) => [
    `a${index}`, { __tag: "int", value: index },
  ]));
  const tooManyItems = Array.from({ length: 4097 }, (_, value) => ({ __tag: "int", value }));
  const tooManyFields = new Map(Array.from({ length: 4097 }, (_, index) => [
    `f${index}`, { __tag: "int", value: index },
  ]));
  const tooManyBytes = new Uint8Array(65_536);
  assert.equal(encodePureFlowArgs(tooManyArgs), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "list", { __tag: "list", items: tooManyItems },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "record", { __tag: "record", fields: tooManyFields },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "bytes", { __tag: "bytes", value: tooManyBytes },
  ]])), null);
});

test("cache admission keeps record and list identity deterministic by their semantics", () => {
  const first = new Map([
    ["b", { __tag: "int", value: 2 }],
    ["a", { __tag: "int", value: 1 }],
  ]);
  const reordered = new Map([
    ["a", { __tag: "int", value: 1 }],
    ["b", { __tag: "int", value: 2 }],
  ]);
  const recordA = encodePureFlowArgs(new Map([[
    "r", { __tag: "record", fields: first },
  ]]));
  const recordB = encodePureFlowArgs(new Map([[
    "r", { __tag: "record", fields: reordered },
  ]]));
  assert.notEqual(recordA, null, "record ordering control must encode both records");
  assert.notEqual(recordB, null, "record ordering control must encode both records");
  assert.equal(recordA, recordB, "record identity is independent of Map insertion order");

  const listA = encodePureFlowArgs(new Map([[
    "l", { __tag: "list", items: [{ __tag: "int", value: 1 }, { __tag: "int", value: 2 }] },
  ]]));
  const listB = encodePureFlowArgs(new Map([[
    "l", { __tag: "list", items: [{ __tag: "int", value: 2 }, { __tag: "int", value: 1 }] },
  ]]));
  assert.notEqual(listA, listB, "list identity preserves element order");
});

test("cache admission accepts a long record key once, within the exact-byte limit", () => {
  const key = "k".repeat(40_000);
  const encoded = encodePureFlowArgs(new Map([[
    "r", { __tag: "record", fields: new Map([[key, { __tag: "int", value: 1 }]]) },
  ]]));
  assert.ok(encoded !== null);
  assert.ok(encoded.startsWith(`1:r=R1:{${key.length}:`));
  assert.ok(encoded.endsWith("=I1}"));
  assert.equal(encoded.length, 40_018);
  assert.ok(Buffer.byteLength(encoded, "utf8") < 65_536);
});

test("cache admission enforces exact output byte boundaries for ASCII and multibyte text", () => {
  const exactAscii = encodePureFlowArgs(new Map([[
    "x", { __tag: "string", value: "a".repeat(65_525) },
  ]]));
  assert.ok(exactAscii !== null);
  assert.equal(Buffer.byteLength(exactAscii, "utf8"), 65_536);
  assert.equal(encodePureFlowArgs(new Map([[
    "x", { __tag: "string", value: "a".repeat(65_526) },
  ]])), null);

  const exactMultibyte = encodePureFlowArgs(new Map([[
    "xx", { __tag: "string", value: "é".repeat(32_762) },
  ]]));
  assert.ok(exactMultibyte !== null);
  assert.equal(Buffer.byteLength(exactMultibyte, "utf8"), 65_536);
  assert.equal(encodePureFlowArgs(new Map([[
    "xx", { __tag: "string", value: "é".repeat(32_763) },
  ]])), null);
  assert.equal(encodePureFlowArgs(new Map([[
    "xx", { __tag: "string", value: `${"é".repeat(32_762)}a` },
  ]])), null, "one ASCII byte beyond the multibyte exact boundary is refused");
});

test("cache admission accepts exact depth and node limits and refuses one beyond", () => {
  const nested = count => {
    let value = { __tag: "int", value: 1 };
    for (let index = 0; index < count; index += 1) value = { __tag: "some", value };
    return value;
  };
  assert.ok(encodePureFlowArgs(new Map([["depth", nested(32)]])) !== null);
  assert.equal(encodePureFlowArgs(new Map([["depth", nested(33)]])), null);

  const exactNodes = Array.from({ length: 4_095 }, (_, value) => ({ __tag: "int", value }));
  const overNodes = Array.from({ length: 4_096 }, (_, value) => ({ __tag: "int", value }));
  assert.ok(encodePureFlowArgs(new Map([[
    "items", { __tag: "list", items: exactNodes },
  ]])) !== null);
  assert.equal(encodePureFlowArgs(new Map([[
    "items", { __tag: "list", items: overNodes },
  ]])), null);

  const exactAcrossArguments = new Map(Array.from({ length: 4_094 }, (_, index) => [
    `a${index}`, { __tag: "int", value: index },
  ]));
  exactAcrossArguments.set("nested", { __tag: "list", items: [{ __tag: "int", value: 1 }] });
  assert.ok(encodePureFlowArgs(exactAcrossArguments) !== null);

  const overAcrossArguments = new Map(Array.from({ length: 4_094 }, (_, index) => [
    `a${index}`, { __tag: "int", value: index },
  ]));
  overAcrossArguments.set("nested", {
    __tag: "list",
    items: [{ __tag: "int", value: 1 }, { __tag: "int", value: 2 }],
  });
  assert.equal(encodePureFlowArgs(overAcrossArguments), null);
});

test("cache admission stops encoding map keys once the byte limit is exceeded", () => {
  const OriginalTextEncoder = globalThis.TextEncoder;
  let encodedKeys = 0;
  class CountingTextEncoder extends OriginalTextEncoder {
    encode(input, options) {
      encodedKeys += 1;
      return super.encode(input, options);
    }
  }
  const keys = ["a".repeat(30_000), "b".repeat(30_000), "c".repeat(30_000), "d"];
  const args = new Map(keys.map((key, index) => [key, { __tag: "int", value: index }]));
  const fields = new Map(keys.map((key, index) => [key, { __tag: "int", value: index }]));
  globalThis.TextEncoder = CountingTextEncoder;
  try {
    assert.equal(encodePureFlowArgs(args), null);
    assert.equal(encodedKeys, 3, "outer map stops examining keys after its first over-budget prefix");

    encodedKeys = 0;
    assert.equal(encodePureFlowArgs(new Map([[
      "r", { __tag: "record", fields },
    ]])), null);
    assert.equal(encodedKeys, 4, "record map stops examining keys after its first over-budget prefix");
  } finally {
    globalThis.TextEncoder = OriginalTextEncoder;
  }
});

test("cache admission refuses hostile values nested under Some, Ok and Err", () => {
  let traps = 0;
  const hostile = new Proxy({ __tag: "int", value: 1 }, {
    get() { traps += 1; throw new Error("nested value get trap ran"); },
    getOwnPropertyDescriptor() { traps += 1; throw new Error("nested value descriptor trap ran"); },
  });
  for (const wrapper of [
    { __tag: "some", value: hostile },
    { __tag: "ok", value: hostile },
    { __tag: "err", error: hostile },
  ]) {
    assert.equal(encodePureFlowArgs(new Map([["x", wrapper]])), null);
  }
  assert.equal(traps, 0);
});
