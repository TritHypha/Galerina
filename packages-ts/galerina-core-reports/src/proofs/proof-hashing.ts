// SHA-256 and execution-proof hashing (TODO pass, Grok 2026-10-05; owner may revisit).
// Pure SHA-256 (no node:crypto: the package border admits no Node core); file reads are
// injected through ProofIo.

import type { ExecutionProof, ExecutionProofHashes, ExecutionProofPaths } from "./execution-proof.js";
import type { ProofIo } from "./proof-runtime.js";

const UTF8 = new TextEncoder();
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15] as number;
      const b = w[i - 2] as number;
      w[i] = ((w[i - 16] as number) + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + (w[i - 7] as number) + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let a = h[0] as number, b = h[1] as number, c = h[2] as number, d = h[3] as number;
    let e = h[4] as number, f = h[5] as number, g = h[6] as number, hh = h[7] as number;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + (K[i] as number) + (w[i] as number)) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const add = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i += 1) h[i] = ((h[i] as number) + (add[i] as number)) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, h[i] as number);
  return out;
}

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Lowercase hex SHA-256 of the UTF-8 encoding of `input`. */
export function sha256(input: string): string {
  return toHex(sha256Bytes(UTF8.encode(input)));
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return toHex(sha256Bytes(typeof bytes === "string" ? UTF8.encode(bytes) : bytes));
}

export const PROOF_HASH_FIELDS = Object.freeze(["manifestSha256", "auditSha256", "evidenceSha256", "denialSha256", "artefactSha256"] as const);
const PATH_FOR: Readonly<Record<keyof ExecutionProofHashes, keyof ExecutionProofPaths>> = Object.freeze({
  manifestSha256: "manifest",
  auditSha256: "audit",
  evidenceSha256: "evidence",
  denialSha256: "denials",
  artefactSha256: "artefact",
});

export async function hashProofInputs(paths: ExecutionProofPaths, io: ProofIo): Promise<ExecutionProofHashes> {
  const out: Partial<Record<keyof ExecutionProofHashes, string>> = {};
  for (const field of PROOF_HASH_FIELDS) {
    const path = paths[PATH_FOR[field]];
    if (typeof path !== "string" || path.length === 0) throw new Error(`FUNGI-PROOF-004: proof input path for ${field} is missing.`);
    let bytes: Uint8Array | string;
    try {
      bytes = await io.readFile(path);
    } catch {
      throw new Error(`FUNGI-PROOF-004: proof input for ${field} could not be read.`);
    }
    if (typeof bytes !== "string" && !(bytes instanceof Uint8Array)) throw new Error(`FUNGI-PROOF-004: proof input for ${field} is not bytes.`);
    out[field] = sha256Hex(bytes);
  }
  return Object.freeze(out as ExecutionProofHashes);
}

/** Deterministic proof id: "proof-" + first 24 hex of SHA-256 over the five hashes in field order. */
export function proofIdFor(hashes: ExecutionProofHashes): string {
  return `proof-${sha256(PROOF_HASH_FIELDS.map((f) => hashes[f]).join("\n")).slice(0, 24)}`;
}

export async function buildExecutionProof(paths: ExecutionProofPaths, io: ProofIo): Promise<ExecutionProof> {
  const hashes = await hashProofInputs(paths, io);
  const generatedAt = io.now();
  return Object.freeze({ schemaVersion: "galerina.proof.v1", proofId: proofIdFor(hashes), generatedAt, hashes });
}
