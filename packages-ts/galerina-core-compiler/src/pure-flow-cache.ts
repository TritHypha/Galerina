// =============================================================================
// Galerina Pure Flow Memoization Cache
//
// Pure flows with EffectCheckerFlags.EffectFree are deterministic:
// same inputs → same output, always. Cache them.
//
// LRU eviction: max 1000 entries. Least-recently-used entries are evicted
// when the cache is full.
//
// Cache key: flowName + ":" + canonicalHash(args) — stable across calls
// Cache invalidation: explicit clear on source change (uses sourceHash)
// =============================================================================

import { createHash } from "node:crypto";
import { isProxy as isNodeProxy } from "node:util/types";
import type { GalerinaValue } from "./interpreter.js";
import { productArtifactKey, type ProductArtifactContext } from "./product-artifact-identity.js";

const MAX_ENTRIES = 1000;
const MAP_FOR_EACH = Map.prototype.forEach;
const MAP_SIZE_GETTER = Object.getOwnPropertyDescriptor(Map.prototype, "size")?.get;
const TYPED_ARRAY_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype), "length",
)?.get;
const UINT8_ARRAY_CONSTRUCTOR = Uint8Array;

// LRU doubly-linked list node
interface LRUNode {
  key:   string;
  exact: string;
  value: GalerinaValue;
  prev:  LRUNode | null;
  next:  LRUNode | null;
}

class LRUCache {
  private map    = new Map<string, LRUNode>();
  private head:  LRUNode = { key: "", exact: "", value: {} as GalerinaValue, prev: null, next: null };
  private tail:  LRUNode = { key: "", exact: "", value: {} as GalerinaValue, prev: null, next: null };
  private hits   = 0;
  private misses = 0;
  private evictions = 0;

  constructor() {
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  get(key: string, exact: string): GalerinaValue | undefined {
    const node = this.map.get(key);
    if (node === undefined) { this.misses++; return undefined; }
    if (exact.length > 0 && node.exact.length > 0 && node.exact !== exact) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    this.moveToFront(node);
    return ownGalerinaValue(node.value);
  }

  set(key: string, value: GalerinaValue, exact: string): void {
    const owned = ownGalerinaValue(value);
    const existing = this.map.get(key);
    if (existing !== undefined) {
      existing.value = owned;
      existing.exact = exact;
      this.moveToFront(existing);
      return;
    }
    const node: LRUNode = { key, exact, value: owned, prev: null, next: null };
    this.map.set(key, node);
    this.addToFront(node);
    if (this.map.size > MAX_ENTRIES) { this.evictLast(); this.evictions++; }
  }

  clear(): void { this.map.clear(); this.head.next = this.tail; this.tail.prev = this.head; }

  get stats() { return { size: this.map.size, hits: this.hits, misses: this.misses, evictions: this.evictions, hitRate: this.hits / Math.max(1, this.hits + this.misses) }; }

  private moveToFront(node: LRUNode): void { this.removeNode(node); this.addToFront(node); }
  private addToFront(node: LRUNode): void {
    node.prev = this.head; node.next = this.head.next!;
    this.head.next!.prev = node; this.head.next = node;
  }
  private removeNode(node: LRUNode): void {
    node.prev!.next = node.next; node.next!.prev = node.prev;
  }
  private evictLast(): void {
    const last = this.tail.prev!;
    if (last === this.head) return;
    this.removeNode(last); this.map.delete(last.key);
  }
}

// Session-scoped cache — lives for the lifetime of the process
const SESSION_CACHE = new LRUCache();

// ---------------------------------------------------------------------------
// FNV-1a structural fingerprint — O(1) cache-key derivation for GalerinaValue
//
// FNV-1a (32-bit) over the discriminant tag bytes + the numeric payload.
// Not a cryptographic hash — not used for security. Used only for the LRU
// cache key where:
//   • collisions are harmless (a false hit → wrong cached value → incorrect
//     result — impossible because same tag+payload is structural equality
//     for the simple variants that dominate the hot path).
//   • speed is critical (called on every memoised pure-flow lookup).
//
// Tag encoding: each __tag char contributes one FNV round.
// Payload encoding:
//   int/byte       — value as an integer FNV round.
//   int64/uint64   — low 32 bits XOR high 32 bits.
//   float/decimal  — string-of-value contributes per-char rounds.
//   bool/verdict   — numeric literal round.
//   string/secure  — per-char rounds.
//   char           — single-char round.
//   bytes          — per-byte rounds.
//   void/none      — no payload (tag alone).
//   record/list/
//   some/ok/err    — XOR child fingerprints (order-insensitive for record,
//                    order-sensitive for list).
//   others         — string rounds on toString representation.
//
// The 32-bit output is widened to a JS number (safe integer range).
// ---------------------------------------------------------------------------

const FNV_PRIME   = 0x01000193; // 16777619
const FNV_OFFSET  = 0x811c9dc5; // 2166136261

/** Compute one FNV-1a round for a single byte value (0–255). */
function fnvByte(hash: number, byte: number): number {
  return Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
}

/** Mix a non-negative integer into the FNV-1a accumulator. */
function fnvInt(hash: number, n: number): number {
  hash = fnvByte(hash, n & 0xff);
  hash = fnvByte(hash, (n >>> 8)  & 0xff);
  hash = fnvByte(hash, (n >>> 16) & 0xff);
  hash = fnvByte(hash, (n >>> 24) & 0xff);
  return hash;
}

/** Mix a string into the FNV-1a accumulator (UTF-16 code units). */
function fnvStr(hash: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    hash = fnvByte(hash, s.charCodeAt(i) & 0xff);
    hash = fnvByte(hash, (s.charCodeAt(i) >>> 8) & 0xff);
  }
  return hash;
}

/**
 * Compute an FNV-1a structural fingerprint for a GalerinaValue.
 *
 * Returns a 32-bit unsigned integer as a JS number. Identical inputs always
 * produce the same output. Distinct strings can collide; cache identity uses
 * exact encodings, not this fingerprint.
 */
export function galerinaValueFingerprint(v: GalerinaValue): number {
  // Seed each variant with the FNV offset XOR the tag's first char code so
  // distinct empty variants (void, none) never collide.
  let h = fnvStr(FNV_OFFSET, v.__tag);
  switch (v.__tag) {
    case "int":    return fnvInt(h, v.value);
    case "byte":   return fnvInt(h, v.value);
    case "bool":   return fnvInt(h, v.value ? 1 : 0);
    case "verdict":return fnvInt(h, v.value + 1); // shift -1→0, 0→1, 1→2
    case "char":   return fnvStr(h, v.value);
    case "string": return fnvStr(h, v.value);
    case "secure": return fnvStr(h, v.value);
    case "decimal":return fnvStr(h, v.value);
    case "float":  return fnvStr(h, String(v.value));
    case "int64":
    case "uint64": {
      const lo = Number(v.value & BigInt(0xffffffff));
      const hi = Number((v.value >> BigInt(32)) & BigInt(0xffffffff));
      return fnvInt(fnvInt(h, lo), hi);
    }
    case "bytes": {
      for (let i = 0; i < v.value.length; i++) h = fnvByte(h, v.value[i]!);
      return h;
    }
    case "void":
    case "none":
      return h; // tag alone
    case "some":
    case "ok":
      return fnvInt(h, galerinaValueFingerprint(v.value));
    case "err":
      return fnvInt(h, galerinaValueFingerprint(v.error));
    case "list": {
      for (const item of v.items) h = fnvInt(h, galerinaValueFingerprint(item));
      return h;
    }
    case "record": {
      // Records are structurally unordered — XOR the per-field fingerprints.
      let xor = 0;
      for (const [k, fv] of v.fields) {
        xor ^= fnvInt(fnvStr(FNV_OFFSET, k), galerinaValueFingerprint(fv));
      }
      return fnvInt(h, xor);
    }
    case "protected":
    case "redacted":
    case "unresolved":
    case "runtimeError":
    case "error":
    case "function":
      return fnvStr(h, String("value" in v ? v.value : "name" in v ? v.name : "message" in v ? v.message : ""));
    default:
      // Exhaustive fallback — should never reach here for known tags.
      return h;
  }
}

/**
 * Build a stable cache key for a pure flow call.
 * @param flowName   Name of the flow (e.g. "main")
 * @param args       Flow arguments
 * @param sourceTag  Optional tag that scopes the cache to a specific source context
 *                   (e.g. the source file path or source hash). Prevents cross-file
 *                   pollution when multiple files have a flow named "main".
 */
const MAX_EXACT_BYTES = 65_536;
const MAX_EXACT_DEPTH = 32;
const MAX_EXACT_NODES = 4_096;

export function admitPureFlowSourceTag(sourceTag: string | undefined | null): string {
  if (
    typeof sourceTag !== "string" ||
    sourceTag.length === 0 ||
    sourceTag.length > 256 ||
    sourceTag.includes("\0")
  ) {
    throw new Error("FUNGI-CACHE-001: pure-flow cache requires a non-empty source identity");
  }
  return sourceTag;
}

export function composeSourceBoundTag(sourceHash: string, extra: string): string {
  if (extra.length === 0) return sourceHash;
  const tag = `${sourceHash}:${extra}`;
  if (tag.length <= 256) return tag;
  const x = createHash("sha256").update(new TextEncoder().encode(extra)).digest("hex");
  return `${sourceHash}:x:${x}`;
}

const UNREADABLE = Symbol("unreadable-own-data");
const ABSENT = Symbol("absent-own-data");
const MAX_ENCODED_TEXT_BYTES = 65_536;

function ownOptionalDataValue(value: unknown, key: string): unknown | typeof ABSENT | typeof UNREADABLE {
  if (typeof value !== "object" || value === null) return UNREADABLE;
  try {
    if (isNodeProxy(value)) return UNREADABLE;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return ABSENT;
    return "value" in descriptor ? descriptor.value : UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

type CachedFloatWidth = { width: 16 | 32 | undefined };

function narrowFloatWidthForCache(value: unknown): CachedFloatWidth | null {
  const ownWidth = ownOptionalDataValue(value, "width");
  if (ownWidth === UNREADABLE) return null;
  let width: unknown;
  if (ownWidth !== ABSENT) {
    width = ownWidth;
  } else {
    if (typeof value !== "object" || value === null || isNodeProxy(value)) return null;
    let prototype: object | null;
    try {
      prototype = Object.getPrototypeOf(value);
    } catch {
      return null;
    }
    if (prototype === Object.prototype) {
      let inherited: PropertyDescriptor | undefined;
      try {
        inherited = Object.getOwnPropertyDescriptor(Object.prototype, "width");
      } catch {
        return null;
      }
      if (inherited !== undefined && !("value" in inherited)) return null;
      width = inherited?.value;
    } else if (prototype !== null) {
      return null;
    }
  }
  if (width === undefined) return { width: undefined };
  return width === 16 || width === 32 ? { width } : null;
}

function boundedUtf8Length(value: string, max = MAX_ENCODED_TEXT_BYTES): number | null {
  if (value.length > max) return null;
  const bytes = new TextEncoder().encode(value).byteLength;
  return bytes <= max ? bytes : null;
}

function ownDataValue(value: unknown, key: string): unknown | typeof UNREADABLE {
  if (typeof value !== "object" || value === null) return UNREADABLE;
  try {
    if (isNodeProxy(value)) return UNREADABLE;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

function encodeValue(v: GalerinaValue, depth: number, nodes: { n: number }, seen: WeakSet<object>): string | null {
  if (depth > MAX_EXACT_DEPTH || nodes.n >= MAX_EXACT_NODES) return null;
  nodes.n += 1;
  const tag = ownDataValue(v, "__tag");
  if (typeof tag !== "string") return null;
  const payload = ownDataValue(v, tag === "list" ? "items" : tag === "record" ? "fields" : "value");
  switch (tag) {
    case "int":
      if (typeof payload !== "number" || !Number.isSafeInteger(payload)) return null;
      return `I${payload}`;
    case "byte":
      if (typeof payload !== "number" || !Number.isInteger(payload) || payload < 0 || payload > 255) return null;
      return `U${payload}`;
    case "bool":
      if (typeof payload !== "boolean") return null;
      return payload ? "Bt" : "Bf";
    case "verdict":
      if (payload !== -1 && payload !== 0 && payload !== 1) return null;
      return `V${payload}`;
    case "char":
      if (typeof payload !== "string" || boundedUtf8Length(payload) === null) return null;
      return `Y${payload.length}:${payload}`;
    case "string":
      if (typeof payload !== "string" || boundedUtf8Length(payload) === null) return null;
      return `S${payload.length}:${payload}`;
    case "decimal":
      if (typeof payload !== "string" || boundedUtf8Length(payload) === null) return null;
      return `D${payload.length}:${payload}`;
    case "float": {
      if (typeof payload !== "number" || !Number.isFinite(payload)) return null;
      const floatWidth = narrowFloatWidthForCache(v);
      if (floatWidth === null) return null;
      const buf = new ArrayBuffer(8);
      new DataView(buf).setFloat64(0, payload, false);
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      return `F${floatWidth.width ?? 64}:${hex}`;
    }
    case "int64":
    case "uint64": {
      if (typeof payload !== "bigint") return null;
      if (tag === "int64" && BigInt.asIntN(64, payload) !== payload) return null;
      if (tag === "uint64" && BigInt.asUintN(64, payload) !== payload) return null;
      return `J${tag[0]}${payload.toString()}`;
    }
    case "bytes": {
      if (payload === null || typeof payload !== "object" || isNodeProxy(payload)
          || Object.getPrototypeOf(payload) !== Uint8Array.prototype
          || typeof TYPED_ARRAY_LENGTH_GETTER !== "function") return null;
      let length: number;
      try {
        length = Reflect.apply(TYPED_ARRAY_LENGTH_GETTER, payload, []) as number;
      } catch {
        return null;
      }
      if (!Number.isSafeInteger(length) || length < 0 || length > Math.floor((MAX_EXACT_BYTES - 16) / 2)) return null;
      const byteView = payload as Uint8Array;
      const bytes: string[] = [];
      for (let index = 0; index < length; index += 1) {
        const byte = byteView[index];
        if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) return null;
        bytes.push(byte.toString(16).padStart(2, "0"));
      }
      return `X${length}:${bytes.join("")}`;
    }
    case "void":
      return "0";
    case "none":
      return "N";
    case "some":
    case "ok": {
      if (seen.has(v)) return null;
      seen.add(v);
      if (payload === UNREADABLE) return null;
      const inner = encodeValue(payload as GalerinaValue, depth + 1, nodes, seen);
      if (inner === null) return null;
      return `${tag === "some" ? "M" : "K"}${inner}`;
    }
    case "err": {
      if (seen.has(v)) return null;
      seen.add(v);
      const error = ownDataValue(v, "error");
      if (error === UNREADABLE) return null;
      const inner = encodeValue(error as GalerinaValue, depth + 1, nodes, seen);
      if (inner === null) return null;
      return `E${inner}`;
    }
    case "list": {
      if (payload === UNREADABLE || payload === null || typeof payload !== "object"
          || isNodeProxy(payload) || !Array.isArray(payload)) return null;
      if (seen.has(v)) return null;
      seen.add(v);
      const length = ownDataValue(payload, "length");
      if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) return null;
      if (length > MAX_EXACT_NODES - nodes.n) return null;
      const items: string[] = [];
      let itemBytes = 0;
      for (let index = 0; index < length; index += 1) {
        const item = ownDataValue(payload, String(index));
        if (item === UNREADABLE) return null;
        const enc = encodeValue(item as GalerinaValue, depth + 1, nodes, seen);
        if (enc === null) return null;
        const encBytes = boundedUtf8Length(enc);
        if (encBytes === null || itemBytes > MAX_EXACT_BYTES - encBytes) return null;
        itemBytes += encBytes;
        items.push(enc);
      }
      if (itemBytes > MAX_EXACT_BYTES - Math.min(MAX_EXACT_BYTES, length * 4 + 16)) return null;
      return `L${items.length}:[${items.join(",")}]`;
    }
    case "record": {
      if (payload === UNREADABLE || payload === null || typeof payload !== "object"
          || isNodeProxy(payload) || typeof MAP_SIZE_GETTER !== "function"
          || Object.getPrototypeOf(payload) !== Map.prototype) return null;
      let size: unknown;
      try {
        size = Reflect.apply(MAP_SIZE_GETTER, payload, []);
      } catch {
        return null;
      }
      if (typeof size !== "number" || !Number.isSafeInteger(size)
          || size < 0 || size > MAX_EXACT_NODES - nodes.n) return null;
      if (seen.has(v)) return null;
      seen.add(v);
      const entries: Array<[string, GalerinaValue]> = [];
      let keyBytes = 0;
      let invalidKey = false;
      Reflect.apply(MAP_FOR_EACH, payload, [(fieldValue: GalerinaValue, fieldKey: unknown) => {
        if (invalidKey) return;
        if (typeof fieldKey !== "string") {
          invalidKey = true;
          return;
        }
        const fieldKeyBytes = boundedUtf8Length(fieldKey);
        if (fieldKeyBytes === null) {
          invalidKey = true;
          return;
        }
        keyBytes += fieldKeyBytes;
        if (keyBytes > MAX_EXACT_BYTES) {
          invalidKey = true;
          return;
        }
        entries.push([fieldKey, fieldValue]);
      }]);
      if (invalidKey || entries.length !== size) return null;
      entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
      const fields: string[] = [];
      let fieldBytes = 0;
      for (const [k, fv] of entries) {
        const enc = encodeValue(fv, depth + 1, nodes, seen);
        if (enc === null) return null;
        const encBytes = boundedUtf8Length(enc);
        const fieldOverhead = new TextEncoder().encode(`${k.length}:${k}=`).byteLength;
        if (encBytes === null || fieldBytes > MAX_EXACT_BYTES - encBytes - fieldOverhead) return null;
        fieldBytes += encBytes + fieldOverhead;
        fields.push(`${k.length}:${k}=${enc}`);
      }
      if (fieldBytes > MAX_EXACT_BYTES - Math.min(MAX_EXACT_BYTES, entries.length * 4 + 16)) return null;
      return `R${fields.length}:{${fields.join(",")}}`;
    }
    case "secure":
    case "protected":
    case "redacted":
    case "unresolved":
    case "function":
    case "runtimeError":
    case "error":
      return null;
    default:
      return null;
  }
}

export function encodePureFlowArgs(args: ReadonlyMap<string, GalerinaValue>): string | null {
  if (typeof args !== "object" || args === null || isNodeProxy(args)
      || Object.getPrototypeOf(args) !== Map.prototype
      || typeof MAP_FOR_EACH !== "function" || typeof MAP_SIZE_GETTER !== "function") return null;
  let size: unknown;
  try {
    size = Reflect.apply(MAP_SIZE_GETTER, args, []);
  } catch {
    return null;
  }
  if (typeof size !== "number" || !Number.isSafeInteger(size)
      || size < 0 || size > MAX_EXACT_NODES) return null;

  const nodes = { n: 0 };
  const seen = new WeakSet<object>();
  const entries: Array<[string, GalerinaValue]> = [];
  let keyBytes = 0;
  let invalid = false;
  try {
    Reflect.apply(MAP_FOR_EACH, args, [(value: GalerinaValue, key: unknown) => {
      if (invalid) return;
      if (typeof key !== "string") {
        invalid = true;
        return;
      }
      const argumentKeyBytes = boundedUtf8Length(key);
      if (argumentKeyBytes === null) {
        invalid = true;
        return;
      }
      keyBytes += argumentKeyBytes;
      if (keyBytes > MAX_EXACT_BYTES) {
        invalid = true;
        return;
      }
      entries.push([key, value]);
    }]);
  } catch {
    return null;
  }
  if (invalid || entries.length !== size) return null;
  entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  const parts: string[] = [];
  let exactBytes = 0;
  for (const [k, v] of entries) {
    if (v === undefined) return null;
    const enc = encodeValue(v, 0, nodes, seen);
    if (enc === null) return null;
    const keyHeader = `${k.length}:${k}=`;
    const keyHeaderBytes = boundedUtf8Length(keyHeader);
    const valueBytes = boundedUtf8Length(enc);
    if (keyHeaderBytes === null || valueBytes === null
        || exactBytes > MAX_EXACT_BYTES - keyHeaderBytes - valueBytes - (parts.length > 0 ? 1 : 0)) return null;
    exactBytes += keyHeaderBytes + valueBytes + (parts.length > 0 ? 1 : 0);
    parts.push(`${keyHeader}${enc}`);
  }
  const exact = parts.join(";");
  return exact;
}

function ownGalerinaValue(v: GalerinaValue): GalerinaValue {
  const tag = ownDataValue(v, "__tag");
  if (typeof tag !== "string") throw new TypeError("invalid cache value tag");
  if (tag === "void") return { __tag: "void" };
  if (tag === "none") return { __tag: "none" };

  const payloadKey = tag === "list" ? "items" : tag === "record" ? "fields" : tag === "err" ? "error" : "value";
  const payload = ownDataValue(v, payloadKey);
  if (payload === UNREADABLE) throw new TypeError("invalid cache value payload");

  switch (tag) {
    case "int":
    case "byte":
    case "bool":
    case "verdict":
    case "char":
    case "string":
    case "decimal":
    case "int64":
    case "uint64":
      return { __tag: tag, value: payload } as GalerinaValue;
    case "float": {
      if (typeof payload !== "number" || !Number.isFinite(payload)) throw new TypeError("invalid cache float value");
      const floatWidth = narrowFloatWidthForCache(v);
      if (floatWidth === null) throw new TypeError("invalid cache float width");
      const copy: GalerinaValue = floatWidth.width === undefined
        ? { __tag: "float", value: payload }
        : { __tag: "float", value: payload, width: floatWidth.width };
      if (floatWidth.width === undefined) {
        Object.defineProperty(copy, "width", {
          configurable: true,
          enumerable: true,
          value: undefined,
          writable: true,
        });
      }
      return copy;
    }
    case "bytes": {
      if (payload === null || typeof payload !== "object" || isNodeProxy(payload)
          || Object.getPrototypeOf(payload) !== Uint8Array.prototype
          || typeof TYPED_ARRAY_LENGTH_GETTER !== "function") {
        throw new TypeError("invalid cache byte payload");
      }
      let length: number;
      try {
        length = Reflect.apply(TYPED_ARRAY_LENGTH_GETTER, payload, []) as number;
      } catch {
        throw new TypeError("invalid cache byte payload");
      }
      if (!Number.isSafeInteger(length) || length < 0 || length > Math.floor((MAX_EXACT_BYTES - 16) / 2)) {
        throw new TypeError("invalid cache byte length");
      }
      const source = payload as Uint8Array;
      const copy = new UINT8_ARRAY_CONSTRUCTOR(length);
      for (let index = 0; index < length; index += 1) {
        const byte = source[index];
        if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) {
          throw new TypeError("invalid cache byte value");
        }
        copy[index] = byte;
      }
      return { __tag: "bytes", value: copy };
    }
    case "some":
      return { __tag: "some", value: ownGalerinaValue(payload as GalerinaValue) };
    case "ok":
      return { __tag: "ok", value: ownGalerinaValue(payload as GalerinaValue) };
    case "err":
      return { __tag: "err", error: ownGalerinaValue(payload as GalerinaValue) };
    case "list": {
      if (payload === null || typeof payload !== "object" || isNodeProxy(payload) || !Array.isArray(payload)) {
        throw new TypeError("invalid cache list payload");
      }
      const length = ownDataValue(payload, "length");
      if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > MAX_EXACT_NODES) {
        throw new TypeError("invalid cache list length");
      }
      const items: GalerinaValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const item = ownDataValue(payload, String(index));
        if (item === UNREADABLE) throw new TypeError("invalid cache list element");
        items.push(ownGalerinaValue(item as GalerinaValue));
      }
      return { __tag: "list", items: Object.freeze(items) };
    }
    case "record": {
      if (payload === null || typeof payload !== "object" || isNodeProxy(payload)
          || Object.getPrototypeOf(payload) !== Map.prototype
          || typeof MAP_FOR_EACH !== "function" || typeof MAP_SIZE_GETTER !== "function") {
        throw new TypeError("invalid cache record payload");
      }
      let size: unknown;
      try {
        size = Reflect.apply(MAP_SIZE_GETTER, payload, []);
      } catch {
        throw new TypeError("invalid cache record payload");
      }
      if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 || size > MAX_EXACT_NODES) {
        throw new TypeError("invalid cache record size");
      }
      const fields = new Map<string, GalerinaValue>();
      Reflect.apply(MAP_FOR_EACH, payload, [(fieldValue: unknown, fieldKey: unknown) => {
        if (typeof fieldKey !== "string") throw new TypeError("invalid cache record key");
        fields.set(fieldKey, ownGalerinaValue(fieldValue as GalerinaValue));
      }]);
      if (fields.size !== size) throw new TypeError("invalid cache record entries");
      return { __tag: "record", fields };
    }
    default:
      throw new TypeError("unsupported cache value tag");
  }
}

export interface PureFlowCacheIdentity {
  readonly key: string;
  readonly exact: string;
}

export function admitPureFlowCacheIdentity(
  context: ProductArtifactContext,
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue>,
  sourceTag: string,
): PureFlowCacheIdentity | null {
  const admitted = admitPureFlowSourceTag(sourceTag);
  const exact = encodePureFlowArgs(args);
  if (exact === null) return null;
  const digest = "sha256:" + createHash("sha256")
    .update(new TextEncoder().encode(`${flowName}\n${admitted}\n${exact}`))
    .digest("hex");
  return { key: `${productArtifactKey(context, digest)}:${flowName}`, exact };
}

export function pureFlowCacheKey(
  context: ProductArtifactContext,
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue>,
  sourceTag: string,
): string {
  const identity = admitPureFlowCacheIdentity(context, flowName, args, sourceTag);
  if (identity === null) {
    throw new Error("FUNGI-CACHE-002: arguments are not cache-eligible");
  }
  return identity.key;
}

export function getCachedPureFlow(key: string, exact = ""): GalerinaValue | undefined {
  try {
    return SESSION_CACHE.get(key, exact);
  } catch {
    return undefined;
  }
}

/**
 * Set a cached pure-flow result.
 *
 * Phase 33 security: The cache is process-wide. PII-touching flows MUST NOT
 * be cached — a result from user A could be served to user B if they send
 * the same arguments. The caller is responsible for checking PII status before
 * calling this function.
 *
 * Flows that have `ContainsPII` in their GovernanceFlags, or whose declared
 * effects include `pii.*` / `phi.*`, should set `noCache: true` in their
 * runtimeOptions and never reach this function.
 *
 * @param key   - Cache key from pureFlowCacheKey()
 * @param value - The deterministic result to cache
 */
export function setCachedPureFlow(key: string, value: GalerinaValue, exact = ""): void {
  if (typeof key !== "string" || typeof exact !== "string") return;
  if (encodePureFlowArgs(new Map([["value", value]])) === null) return;
  try {
    SESSION_CACHE.set(key, value, exact);
  } catch {
    // Unreadable or malformed host values are cache-ineligible.
  }
}

export function clearPureFlowCache(): void {
  SESSION_CACHE.clear();
}

export function getPureFlowCacheStats() {
  return SESSION_CACHE.stats;
}
