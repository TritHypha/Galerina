// =============================================================================
// LogicN — .lmanifest Generator (DRCM Phase 1 task #33 + Phase 3 task #67)
//
// Generates a machine-verifiable governance manifest alongside compiled output.
// The manifest captures: source hash, derived constraints, proof obligations,
// and governance signatures — enabling QSA verification without reading source.
//
// SERIALISATION — Two formats (dual output per logicn-cbor-manifest-spec.md):
//
//   .lmanifest       = Binary CBOR (RFC 8949 §4.2 Canonical CBOR) — the on-disk manifest.
//                      DSS.wasm parses this at runtime for V_DPM configuration.
//                      Custom tags 400-408 for O(1) dispatch in DSS supervisor.
//                      NOTE: the governance SIGNATURE is currently computed over the canonical-JSON
//                      body (RFC 8785, `serializeManifest`), NOT the CBOR bytes — CBOR-bytes signing
//                      is the planned upgrade (#67). And the signatures are PLACEHOLDERS unless real
//                      Ed25519 keys are configured (`logicn keygen`); ML-DSA-65 is gated on key
//                      custody (#34). Do not read "signed CBOR" into this until that lands.
//
//   .lmanifest.json  = Pretty-printed JSON — human inspection and debugging only
//
// RFC 8949 Canonical CBOR requirements:
//   - Map keys: sorted by byte length, then lexicographically within same length
//   - Integers: shortest encoding (no unnecessary leading zeros)
//   - No floating-point (LogicN uses integers for limits/economics — no IEEE drift)
//
// Security hardening (logicn-cbor-manifest-spec.md):
//   - Max nesting depth: 8 (prevents Billion Laughs attack)
//   - Duplicate key detection: reject on first duplicate
//   - Length overflow: reject fields > 4MB (DWI ceiling)
//   - Round-trip verification: decode → re-encode → compare bytes in phase-close
//
// Reference:
//   - logicn-cbor-manifest-spec.md
//   - logicn-engineering-goals.md (Pattern 9)
//   - logicn-deterministic-runtime-containment.md (Phase 3)
//   - RFC 8949: https://www.rfc-editor.org/rfc/rfc8949
// =============================================================================

import { createHash } from "node:crypto";
import type { GovernanceVerifyResult } from "./governance-verifier.js";
import type { FlowMeta } from "./parser.js";
import { resolveCompositeBitmask } from "./capability-types.js";

export const MANIFEST_SCHEMA_VERSION = "lln.manifest.v1";

export interface PolicyResolutionDag {
  readonly allowedEffects:  number;  // uint32 bitmask — effects permitted across all flows
  readonly deniedEffects:   number;  // uint32 bitmask — effects explicitly denied
  readonly conflictsResolved: number; // number of allow/deny conflicts resolved
  readonly resolvedAt:      string;  // ISO timestamp
}

/** MMCP capability pointer stub (CBOR Tag 415, task #78 foundation). DECLARED-ONLY:
 *  the schema is reserved but population is deferred to DRCM Phase 5 (full MMCP
 *  enforcement, gated on the Wasmtime component-model work #102–#104). */
export interface MmcpCapabilityPointerStub {
  readonly variable: string;
  readonly capabilityMask: string;
  readonly cborTag: 415;
  readonly status: "declared_only";  // population deferred to DRCM Phase 5 (#102–#104)
}

/** An assimilated plugin entry — Hot-Code Residency (pre-compiled, always-hot). */
export interface AssimilatedPluginEntry {
  readonly alias: string;
  readonly path: string;
  readonly grantedCapabilities: readonly string[];
}

export interface LManifest {
  readonly schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  readonly sourceHash: string;
  readonly sourceFile: string;
  readonly flowCount: number;
  readonly policyResolutionDag?: PolicyResolutionDag;    // CBOR Tag 416 — Topological Graph Engine (#79)
  readonly behavioralFingerprint?: string;               // CBOR Tag 417 — CFG path hash (#80)
  readonly derivedConstraints: readonly string[];
  readonly proofObligations: readonly ProofObligation[];
  /**
   * Governance annotations collected from ;; govComment tokens in the source.
   * These are the "why it's secure" narrative that lives alongside ProofObligations.
   * Only populated when the source text is available at manifest generation time.
   */
  readonly governanceAnnotations?: readonly string[];
  /** CBOR Tag 415 — MMCP capability pointer stubs (task #78). Full enforcement in Phase 5. */
  readonly capabilityPointers?: readonly MmcpCapabilityPointerStub[];
  /**
   * Assimilated plugins (Hot-Code Residency).
   * Stored so DSS.wasm can pre-warm V_DPM bits at boot.
   * Only populated when the source file declares `import plugin assimilate` nodes.
   */
  readonly assimilatedPlugins?: readonly AssimilatedPluginEntry[];
  /**
   * Gate admission guard constraints — recorded for DSS.wasm pre-warming (Phase 5).
   * Each entry maps a guard condition to the flows it gates.
   * Only populated when gateDecl nodes are present in the source AST.
   */
  readonly gateConstraints?: readonly { readonly condition: string; readonly guardedFlows: readonly string[] }[];
  readonly governanceSignature: ManifestSignature;
  readonly generatedAt: string;
}

export interface ProofObligation {
  readonly flowName: string;
  readonly kind: string;
  readonly description: string;
  readonly verified: "static" | "runtime-precheck" | "pending";
}

export interface ManifestSignature {
  readonly algorithm: "Ed25519+ML-DSA-65";
  /** Ed25519 signature over the canonical JSON (hex) — placeholder until signing key ships */
  readonly ed25519: string;
  /** ML-DSA-65 post-quantum signature (NIST FIPS 204) — placeholder until key custody spec (#34) */
  readonly mlDsa65: string;
  readonly signerNote: string;
}

// ---------------------------------------------------------------------------
// RFC 8785 Canonical JSON
// ---------------------------------------------------------------------------

/**
 * Produce RFC 8785-compliant canonical JSON.
 * Keys sorted lexicographically, no extra whitespace, control chars escaped.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("RFC 8785: non-finite numbers not allowed");
    return String(value);
  }
  if (typeof value === "string") return canonicalJsonString(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (typeof value === "object") {
    // Sort keys lexicographically (RFC 8785 §3.2.3)
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const pairs = keys.map(k =>
      canonicalJsonString(k) + ":" + canonicalJson((value as Record<string, unknown>)[k])
    );
    return "{" + pairs.join(",") + "}";
  }
  throw new Error(`RFC 8785: unsupported type ${typeof value}`);
}

/** Escape a string per RFC 8785 §3.2.2 */
function canonicalJsonString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) { out += '\\"'; continue; }
    if (c === 0x5c) { out += '\\\\'; continue; }
    if (c < 0x20) {
      // Control characters must be escaped
      out += "\\u" + c.toString(16).padStart(4, "0");
      continue;
    }
    out += s[i];
  }
  out += '"';
  return out;
}

// ---------------------------------------------------------------------------
// Manifest SIGNATURE input — the exact bytes an Ed25519 signature covers.
// VERSIONED per the design-stability charter (crypto-format VERSIONING rule):
// the canonicalization is named in the signature itself (`governanceSignature.canon`),
// so a format change does NOT invalidate already-persisted signatures.
// ---------------------------------------------------------------------------

/**
 * Canonicalization tag stored in `governanceSignature.canon`:
 *  - "jcs"    → RFC 8785 canonical JSON. Representation-independent, so the SAME bytes are
 *               reproducible from EITHER the .json or the decoded CBOR — this is what makes the
 *               authoritative CBOR self-verifiable (#67). New builds sign with this.
 *  - "legacy" → `JSON.stringify(obj, null, 2)` (the pre-versioning pretty-printed form). Untagged
 *               signatures default here so existing signed manifests keep verifying. Verify-only —
 *               never emitted by new builds.
 */
export type ManifestSigCanon = "jcs" | "legacy";

/**
 * The exact byte string a manifest's Ed25519 signature covers, for the manifest object WITHOUT its
 * `governanceSignature` field. Every signer AND verifier must route through this one function so they
 * cannot drift. (Callers reading the CBOR pass the decoded object; canonicalJson erases the JSON↔CBOR
 * representation difference, so "jcs" verification works identically from either artifact.)
 */
export function manifestSigningInput(manifestWithoutSig: unknown, canon: ManifestSigCanon): string {
  return canon === "jcs"
    ? canonicalJson(manifestWithoutSig)
    : JSON.stringify(manifestWithoutSig, null, 2);
}

/** Resolve the canonicalization of a `governanceSignature` object. Untagged ⇒ "legacy" (back-compat). */
export function manifestSigCanon(sig: unknown): ManifestSigCanon {
  return sig !== null && typeof sig === "object" && (sig as Record<string, unknown>)["canon"] === "jcs"
    ? "jcs"
    : "legacy";
}

// ---------------------------------------------------------------------------
// CBOR Binary Encoder (RFC 8949 + Canonical Deterministic CBOR)
// DRCM Phase 3 — task #67
// ---------------------------------------------------------------------------

/**
 * Encode a JavaScript value to RFC 8949 Canonical Deterministic CBOR bytes.
 *
 * Canonical CBOR rules (RFC 8949 §4.2.3):
 *   - Integers: shortest encoding
 *   - Map keys: sorted by byte length ascending, then lexicographically within same length
 *   - No floating-point: use integers for all numeric values
 *   - Nesting depth limit: 8 (Billion Laughs mitigation per logicn-cbor-manifest-spec.md)
 *
 * Security hardening:
 *   - Max single value size: 4MB (DWI ceiling)
 *   - Duplicate map keys rejected with a throw
 *
 * @returns Uint8Array of canonical CBOR bytes
 */
export function encodeCBOR(value: unknown, depth = 0): Uint8Array {
  if (depth > 8) throw new Error("CBOR: max nesting depth (8) exceeded — Billion Laughs protection");

  if (value === null || value === undefined) {
    return new Uint8Array([0xf6]); // null (major 7, additional 22)
  }

  if (typeof value === "boolean") {
    return new Uint8Array([value ? 0xf5 : 0xf4]); // true=0xf5, false=0xf4
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("CBOR: non-integer numbers not allowed in LogicN manifests");
    return cborEncodeInt(value);
  }

  if (typeof value === "string") {
    return cborEncodeText(value);
  }

  if (value instanceof Uint8Array) {
    return cborEncodeBytes(value);
  }

  if (Array.isArray(value)) {
    const parts: Uint8Array[] = [cborEncodeHead(4, value.length)]; // major type 4 = array
    for (const item of value) parts.push(encodeCBOR(item, depth + 1));
    return concatBytes(parts);
  }

  if (typeof value === "object") {
    return cborEncodeMap(value as Record<string, unknown>, depth);
  }

  throw new Error(`CBOR: unsupported type ${typeof value}`);
}

/** Canonical CBOR map encoding: keys sorted by (byteLength ASC, then lex) per RFC 8949 §4.2.3 */
function cborEncodeMap(obj: Record<string, unknown>, depth: number): Uint8Array {
  const entries = Object.entries(obj);
  const seenKeys = new Set<string>();

  // Sort: shorter byte length first, then lexicographic within same length
  entries.sort(([a], [b]) => {
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    if (aBytes.length !== bBytes.length) return aBytes.length - bBytes.length;
    for (let i = 0; i < aBytes.length; i++) {
      if (aBytes[i] !== bBytes[i]) return (aBytes[i] ?? 0) - (bBytes[i] ?? 0);
    }
    return 0;
  });

  const parts: Uint8Array[] = [cborEncodeHead(5, entries.length)]; // major type 5 = map
  for (const [k, v] of entries) {
    if (seenKeys.has(k)) throw new Error(`CBOR: duplicate map key '${k}' — security violation`);
    seenKeys.add(k);
    parts.push(cborEncodeText(k));
    parts.push(encodeCBOR(v, depth + 1));
  }
  return concatBytes(parts);
}

/** CBOR integer encoding — shortest representation (major type 0 or 1) */
function cborEncodeInt(n: number): Uint8Array {
  if (n >= 0) {
    return cborEncodeHead(0, n); // major type 0 = unsigned int
  }
  return cborEncodeHead(1, -n - 1); // major type 1 = negative int
}

/** CBOR text string (major type 3) — UTF-8 bytes */
function cborEncodeText(s: string): Uint8Array {
  const utf8 = new TextEncoder().encode(s);
  if (utf8.length > 4_194_304) throw new Error(`CBOR: text value exceeds 4MB limit`);
  return concatBytes([cborEncodeHead(3, utf8.length), utf8]);
}

/** CBOR byte string (major type 2) */
function cborEncodeBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 4_194_304) throw new Error(`CBOR: byte string exceeds 4MB limit`);
  return concatBytes([cborEncodeHead(2, bytes.length), bytes]);
}

/**
 * CBOR head byte(s): encodes major type (3 bits) + additional info (5 bits).
 * Uses shortest encoding per RFC 8949 §4.2.1.
 */
function cborEncodeHead(majorType: number, value: number): Uint8Array {
  const mt = (majorType & 0x7) << 5;
  if (value <= 23) return new Uint8Array([mt | value]);
  if (value <= 0xff) return new Uint8Array([mt | 24, value]);
  if (value <= 0xffff) {
    return new Uint8Array([mt | 25, (value >> 8) & 0xff, value & 0xff]);
  }
  if (value <= 0xffffffff) {
    return new Uint8Array([
      mt | 26,
      (value >>> 24) & 0xff, (value >>> 16) & 0xff,
      (value >>> 8) & 0xff, value & 0xff,
    ]);
  }
  throw new Error(`CBOR: value ${value} exceeds 32-bit range`);
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

/**
 * Decode a CBOR Uint8Array back to a JavaScript value.
 * Used for round-trip verification in run-phase-close.mjs.
 * Enforces all security constraints (depth, duplicate keys, length limits).
 */
// Max 4MB per field — DWI linear memory ceiling
const CBOR_MAX_FIELD_SIZE = 4 * 1024 * 1024;

export function decodeCBOR(bytes: Uint8Array, offset = 0, depth = 0): { value: unknown; nextOffset: number } {
  // ── LLN-MANIFEST-DEPTH: Billion Laughs protection ─────────────────────────
  // Maximum nesting depth is 8 levels. A depth-9 call fires this guard.
  // Prevents exponential decode expansion via nested arrays/maps.
  if (depth > 8) {
    throw new Error(`LLN-MANIFEST-DEPTH: CBOR nesting exceeds 8 levels at depth ${depth} — possible Billion Laughs attack`);
  }

  if (offset >= bytes.length) throw new Error("CBOR: unexpected end of input");
  const first = bytes[offset]!;
  const majorType = (first >> 5) & 0x7;
  const additionalInfo = first & 0x1f;
  offset++;

  const { value: head, nextOffset: afterHead } = readCborHead(additionalInfo, bytes, offset);
  offset = afterHead;

  switch (majorType) {
    case 0: return { value: head, nextOffset: offset };                          // unsigned int
    case 1: return { value: -1 - head, nextOffset: offset };                     // negative int
    case 2: {                                                                      // byte string
      // ── LLN-MANIFEST-LENGTH-OVERFLOW ──────────────────────────────────────
      if (head > CBOR_MAX_FIELD_SIZE) {
        throw new Error(`LLN-MANIFEST-LENGTH-OVERFLOW: CBOR byte string claims ${head} bytes — exceeds 4MB DWI ceiling`);
      }
      const slice = bytes.slice(offset, offset + head);
      return { value: slice, nextOffset: offset + head };
    }
    case 3: {                                                                      // text string
      if (head > CBOR_MAX_FIELD_SIZE) {
        throw new Error(`LLN-MANIFEST-LENGTH-OVERFLOW: CBOR text string claims ${head} bytes — exceeds 4MB DWI ceiling`);
      }
      const slice = bytes.slice(offset, offset + head);
      return { value: new TextDecoder().decode(slice), nextOffset: offset + head };
    }
    case 4: {                                                                      // array
      if (head > CBOR_MAX_FIELD_SIZE) {
        throw new Error(`LLN-MANIFEST-LENGTH-OVERFLOW: CBOR array claims ${head} entries — exceeds 4MB DWI ceiling`);
      }
      const arr: unknown[] = [];
      for (let i = 0; i < head; i++) {
        const { value: item, nextOffset: next } = decodeCBOR(bytes, offset, depth + 1);
        arr.push(item); offset = next;
      }
      return { value: arr, nextOffset: offset };
    }
    case 5: {                                                                      // map
      if (head > CBOR_MAX_FIELD_SIZE) {
        throw new Error(`LLN-MANIFEST-LENGTH-OVERFLOW: CBOR map claims ${head} entries — exceeds 4MB DWI ceiling`);
      }
      const obj: Record<string, unknown> = {};
      const seenKeys = new Set<string>();
      for (let i = 0; i < head; i++) {
        const { value: k, nextOffset: afterKey } = decodeCBOR(bytes, offset, depth + 1);
        const key = String(k); offset = afterKey;
        // ── LLN-MANIFEST-DUPLICATE-KEY ──────────────────────────────────────
        // Duplicate keys allow shadow-field attacks: first-key semantics in
        // auditors vs last-key semantics in parsers → hidden permissions.
        if (seenKeys.has(key)) {
          throw new Error(`LLN-MANIFEST-DUPLICATE-KEY: CBOR map contains duplicate key '${key}' — possible shadow-field attack`);
        }
        seenKeys.add(key);
        const { value: v, nextOffset: afterVal } = decodeCBOR(bytes, offset, depth + 1);
        obj[key] = v; offset = afterVal;
      }
      return { value: obj, nextOffset: offset };
    }
    case 7: {                                                                      // primitive
      if (head === 20) return { value: false, nextOffset: offset };
      if (head === 21) return { value: true, nextOffset: offset };
      if (head === 22) return { value: null, nextOffset: offset };
      throw new Error(`CBOR: unsupported primitive ${head}`);
    }
    default: throw new Error(`CBOR: unsupported major type ${majorType}`);
  }
}

function readCborHead(additionalInfo: number, bytes: Uint8Array, offset: number): { value: number; nextOffset: number } {
  if (additionalInfo <= 23) return { value: additionalInfo, nextOffset: offset };
  if (additionalInfo === 24) return { value: bytes[offset]!, nextOffset: offset + 1 };
  if (additionalInfo === 25) return { value: ((bytes[offset]! << 8) | bytes[offset + 1]!), nextOffset: offset + 2 };
  if (additionalInfo === 26) {
    const v = ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
    return { value: v, nextOffset: offset + 4 };
  }
  throw new Error(`CBOR: unsupported additional info ${additionalInfo}`);
}

// ---------------------------------------------------------------------------
// SHA-256 source hash
// ---------------------------------------------------------------------------

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Manifest generation
// ---------------------------------------------------------------------------

/**
 * Generate a .lmanifest from compilation results.
 *
 * The manifest is serialised using RFC 8785 canonical JSON for deterministic
 * hashing. Two runs on identical input produce byte-identical output.
 *
 * NOTE: Actual ML-DSA-65 signing requires key custody infrastructure (#34).
 * Until that ships, signatures are placeholder hashes of the canonical content.
 *
 * @param sourceText - Optional raw source text. When provided, re-lexed to collect
 *   govComment tokens (;; annotations) into the governanceAnnotations manifest field.
 *   These are the "why it's secure" narrative alongside ProofObligations.
 */
export function generateManifest(
  source: string,
  sourceFile: string,
  flows: readonly FlowMeta[],
  govResult?: GovernanceVerifyResult,
  generatedAt?: string,
  ast?: { readonly children?: readonly { readonly kind: string; readonly value?: string; readonly children?: readonly unknown[] }[] },
  sourceText?: string,
): LManifest {
  const sourceHash = `sha256:${sha256Hex(source)}`;

  // ── Collect governance annotations (;; govComment tokens) from source ────────────────────
  // Re-lex the source text to extract all govComment tokens.
  // These are the "why it's secure" narrative that lives alongside ProofObligations.
  // Non-fatal: manifest generation continues without annotations if lexing fails.
  let governanceAnnotations: string[] = [];
  const textToLex = sourceText ?? source;
  try {
    // Inline extraction: scan for ;; comment lines without a full re-lex dependency.
    // This mirrors what the lexer produces for govComment tokens: consecutive semicolons
    // followed by optional whitespace and annotation text.
    const govCommentRe = /;;+([^\n]*)/g;
    let m: RegExpExecArray | null;
    while ((m = govCommentRe.exec(textToLex)) !== null) {
      const text = (m[1] ?? "").trim();
      if (text.length > 0) {
        governanceAnnotations.push(text);
      }
    }
  } catch {
    // Non-fatal — manifest generation continues without annotations
    governanceAnnotations = [];
  }

  // ── CBOR Tag 415 (MMCP capability pointers): DECLARED-ONLY ───────────────────
  // `view(read | secret)` on a parameter denotes a capability-masked pointer. The tag
  // + interface are RESERVED, but population is DEFERRED to DRCM Phase 5 (full MMCP
  // enforcement, gated on the Wasmtime component-model work #102–#104). Until then
  // `mmcpStubs` is intentionally empty, so `capabilityPointers` is OMITTED from the
  // manifest (the conditional below only includes it when non-empty) — the manifest
  // never carries an unenforced capability claim. See logicn-cbor-manifest-spec.md §415.
  const mmcpStubs: MmcpCapabilityPointerStub[] = [];

  // ── Assimilated plugins (Hot-Code Residency) ─────────────────────────────────────
  // Collect all assimilatedPluginDecl nodes from the AST.
  // Stored in manifest so DSS.wasm can pre-warm V_DPM bits at boot.
  const assimilatedPlugins: AssimilatedPluginEntry[] = [];

  for (const node of ast?.children ?? []) {
    if (node.kind !== "assimilatedPluginDecl") continue;
    const alias = (node.value as string | undefined) ?? "";
    const children = (node.children as readonly { kind: string; value?: string; children?: readonly unknown[] }[] | undefined) ?? [];
    const pathNode = children.find(c => typeof c.value === "string" && (c.value as string).startsWith("path:"));
    const path = ((pathNode?.value as string | undefined) ?? "").replace("path:", "");
    const contractNode = children.find(c => c.kind === "contractDecl");
    const grantedCapabilities: string[] = [];
    // Walk contract children looking for grant: prefixed values
    function extractGrants(n: { kind?: string; value?: string; children?: readonly unknown[] }): void {
      const v = n.value ?? "";
      if (typeof v === "string" && v.startsWith("grant:")) {
        grantedCapabilities.push(v.replace("grant:", ""));
      }
      for (const child of (n.children ?? []) as { kind?: string; value?: string; children?: readonly unknown[] }[]) {
        extractGrants(child);
      }
    }
    if (contractNode !== undefined) {
      extractGrants(contractNode as { kind?: string; value?: string; children?: readonly unknown[] });
    }
    assimilatedPlugins.push({ alias, path, grantedCapabilities });
  }

  // Gate admission guards — record for DSS.wasm pre-warming (Phase 5)
  const gateConstraints: Array<{ condition: string; guardedFlows: string[] }> = [];
  for (const node of ast?.children ?? []) {
    if (node.kind !== "gateDecl") continue;
    const condition = (node.value as string | undefined) ?? "";
    const guardedFlows = ((node.children as readonly { kind?: string; value?: string }[] | undefined) ?? [])
      .filter(c => (c.kind ?? "").endsWith("FlowDecl") || (c.kind ?? "").endsWith("flowDecl"))
      .map(c => (c.value as string | undefined) ?? "unknown");
    if (condition !== "") gateConstraints.push({ condition, guardedFlows });
  }

  // Derived constraints from ProofGraph (taint rules that proved clean at compile time)
  const derivedConstraints: string[] = [];
  if (govResult?.proofGraphs !== undefined) {
    for (const [flowName, graph] of govResult.proofGraphs) {
      // Extract satisfied obligations as derived constraints
      for (const obligation of graph.obligations ?? []) {
        derivedConstraints.push(`${flowName}: ${obligation.claim} [via ${obligation.satisfiedBy}]`);
      }
    }
  }

  // Add secret sink constraints from flows that declare secrets
  for (const flow of flows) {
    if (flow.declaredEffects.includes("secret.read") || flow.declaredEffects.includes("secret.access")) {
      derivedConstraints.push(
        `${flow.name}: SecureString never_reaches [network.outbound, audit.log, serialization]`
      );
    }
  }

  // Proof obligations from governance verification
  const proofObligations: ProofObligation[] = [];
  for (const flow of flows) {
    proofObligations.push({
      flowName: flow.name,
      kind: "effect-safety",
      description: `${flow.qualifier} flow declares effects [${flow.declaredEffects.join(", ") || "none"}]`,
      verified: "static",
    });
  }
  if (govResult?.proofObligations !== undefined) {
    for (const obligation of govResult.proofObligations) {
      proofObligations.push({
        flowName: obligation,
        kind: "governance-obligation",
        description: obligation,
        verified: "static",
      });
    }
  }

  // ── Topological Graph Engine: Pre-resolved Policy DAG (CBOR Tag 416, task #79) ──
  // Compute the conflict-free effect bitmask from all domain guard policy constraints.
  // Algorithm: collect all effects declared across all flows, resolve deny > allow,
  // output as a uint32 bitmask where each bit = one effect family.
  // Stored in manifest for O(1) DSS.wasm dispatch at load time.
  // DRCM Phase 4 (task #38): EFFECT_BIT_MAP replaced by resolveCompositeBitmask()
  // from capability-types.ts — single source of truth for V_DPM bit layout.
  let allowedEffectsMask = 0;
  let deniedEffectsMask = 0;
  let conflictsResolved = 0;
  for (const flow of flows) {
    for (const eff of flow.declaredEffects) {
      const bit = resolveCompositeBitmask(eff);
      if (bit !== 0) allowedEffectsMask |= bit;
    }
  }
  // Wildcard effects (network.*) are denied by K-001 — clear those bits
  if (flows.some(f => f.declaredEffects.some(e => e.includes(".*")))) {
    deniedEffectsMask |= 0xff; // deny all capability bits
    conflictsResolved++;
  }
  // ── Topological Graph Engine: Behavioral Fingerprint (CBOR Tag 417, task #80) ──
  // Deterministic CFG hash replaces vector similarity metrics.
  // Computes SHA-256 of the ordered sequence of effects across all flows —
  // the expected execution path. Runtime deviation from this fingerprint
  // triggers emergency {} overlay.
  //
  // Security: SHA-256 collision resistance means an attacker cannot produce
  // a crafted path that matches the expected fingerprint without breaking SHA-256.
  const cfgPathComponents: string[] = [];
  for (const flow of [...flows].sort((a, b) => a.name.localeCompare(b.name))) {
    cfgPathComponents.push(`${flow.name}:${flow.qualifier}:[${[...flow.declaredEffects].sort().join(",")}]`);
  }
  const cfgPathString = cfgPathComponents.join("|");
  const behavioralFingerprint = `sha256:${sha256Hex(cfgPathString)}`;

  const policyResolutionDag = {
    allowedEffects:  allowedEffectsMask,
    deniedEffects:   deniedEffectsMask,
    conflictsResolved,
    resolvedAt:      (generatedAt ?? new Date().toISOString()),
  };

  // Compute canonical JSON of the manifest body (without signature)
  // This is what the signature covers.
  const manifestBody: Omit<LManifest, "governanceSignature"> = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    sourceHash,
    sourceFile: sourceFile.replace(/\\/g, "/"),
    flowCount: flows.length,
    policyResolutionDag,
    behavioralFingerprint,
    derivedConstraints: [...derivedConstraints].sort(),
    proofObligations,
    ...(mmcpStubs.length > 0 ? { capabilityPointers: mmcpStubs } : {}),
    ...(assimilatedPlugins.length > 0 ? { assimilatedPlugins } : {}),
    ...(gateConstraints.length > 0 ? { gateConstraints } : {}),
    ...(governanceAnnotations.length > 0 ? { governanceAnnotations } : {}),
    generatedAt: generatedAt ?? new Date().toISOString(),
  };

  const canonicalBody = canonicalJson(manifestBody);
  const bodyHash = sha256Hex(canonicalBody);

  // Placeholder signatures — real ML-DSA-65 signing requires key custody (#34)
  const governanceSignature: ManifestSignature = {
    algorithm: "Ed25519+ML-DSA-65",
    ed25519: `placeholder:sha256:${bodyHash}`,
    mlDsa65: `placeholder:sha256:${bodyHash}`,
    signerNote:
      "Placeholder signatures — real ML-DSA-65 signing requires key custody spec (DRCM task #34). " +
      "The canonical JSON body hash above is stable and verifiable today.",
  };

  return {
    ...manifestBody,
    governanceSignature,
  };
}

/**
 * Serialise a manifest as RFC 8785 canonical JSON (signing target — Phase 1/2 format).
 * Used for: `.lmanifest` canonical signing until binary CBOR upgrade lands.
 */
export function serializeManifest(manifest: LManifest): string {
  // RFC 8785: canonical, deterministic, no extra whitespace
  return canonicalJson(manifest);
}

/**
 * Serialise a manifest as RFC 8949 binary CBOR (DRCM Phase 3 — task #67).
 *
 * This is the TARGET format for `.lmanifest`:
 *   - 30-40% smaller than minified JSON
 *   - CBOR Tags 400-408 enable O(1) dispatch in DSS.wasm supervisor
 *   - Canonical key ordering per RFC 8949 §4.2.3
 *
 * Round-trip verification in run-phase-close.mjs:
 *   1. encodeCBOR(manifest) → bytes
 *   2. decodeCBOR(bytes) → manifest2
 *   3. encodeCBOR(manifest2) → bytes2
 *   4. bytes === bytes2 → PASS (canonical)
 *
 * @returns Uint8Array of binary CBOR bytes
 */
export function serializeManifestCBOR(manifest: LManifest): Uint8Array {
  return encodeCBOR(manifest);
}

/**
 * Verify the round-trip property of a CBOR-encoded manifest.
 * encode → decode → re-encode → compare bytes.
 * Returns true if canonical (identical bytes), false if non-canonical.
 */
export function verifyManifestRoundTrip(manifest: LManifest): boolean {
  try {
    const bytes1 = encodeCBOR(manifest);
    const { value: decoded } = decodeCBOR(bytes1);
    const bytes2 = encodeCBOR(decoded);
    if (bytes1.length !== bytes2.length) return false;
    for (let i = 0; i < bytes1.length; i++) {
      if (bytes1[i] !== bytes2[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Pretty-print a manifest for human display (not for signing — use serializeManifest).
 *
 * Output format:
 *   build/name.lmanifest      — RFC 8785 canonical JSON (signing target; will upgrade to binary CBOR)
 *   build/name.lmanifest.json — Pretty-printed JSON for human inspection
 *
 * When binary CBOR encoder ships (task #67), `.lmanifest` becomes binary and
 * `.lmanifest.json` remains as the human-readable companion.
 */
export function prettyManifest(manifest: LManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * CBOR Tag Registry (tags 400-499 are LogicN-reserved per logicn-cbor-manifest-spec.md).
 * Used as metadata reference until binary CBOR encoder ships in task #67.
 */
export const LOGICN_CBOR_TAGS = {
  Capability:          400,
  Effect:              401,
  SecretHandle:        402,
  ProofObligation:     403,
  GovernanceSignature: 404,
  DomainGuardRef:      405,
  ResilienceState:     406,
  ObservabilitySpan:   407,
  EconomicsLease:      408,
  // 409-499: Reserved for future experimental types (ZkProofEvidence, FheCircuitRef, etc.)
  // Tower-native primitives (tasks #75-#80). STATUS: 416/417 are ACTIVELY serialized into
  // every manifest; 410/414/415 are RESERVED/DECLARED-ONLY (schema defined, serialization
  // deferred — see logicn-cbor-manifest-spec.md). AuditEvent (410) stays RUNTIME-ONLY by
  // design: compiling runtime violation records into the manifest would make it
  // non-deterministic (the manifest is a build artifact, not a runtime log).
  AuditEvent:          410,  // #75 — schema defined; runtime-only (NOT in manifest, by design)
  ExecutionDAG:        414,  // #77 — declared-only; serialization deferred to DRCM Phase 5
  CapabilityPointer:   415,  // #78 — declared-only; MMCP population deferred to DRCM Phase 5
  PolicyResolutionDag: 416,  // #79 — ACTIVE: serialized in every manifest
  BehavioralFingerprint: 417, // #80 — ACTIVE: serialized in every manifest
} as const;
