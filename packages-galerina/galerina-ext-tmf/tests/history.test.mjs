// .spore append-only history chain (slice 5, G4). Verifies the deterministic SHAKE256 chain layer:
// §1 chain header + LINK leaf, §3 append/verify (hash-linked, fail-closed), §5 monotone-epoch /
// trusted-head freshness, and the §8 on-wire pack (recompute-by-root, link walk, strict membership).
// Mirrors the inline-self-check style of tmx256.test.mjs / kemdem.test.mjs (no external golden vectors
// are vendored for the history chain, so — exactly as kemdem.test.mjs does for KEM/AEAD — conformance
// is pinned by deterministic re-derivation + every fail-closed tamper/rollback case). Spec (frozen):
// spec/tmf-history-chain-v0.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chainHeader, parseChainHeader, linkLeaf, segmentRoot, appendSegment, verifyChain,
  enforceFreshness, encodePack, verifyPack, TmfHistoryError,
  CHAIN_HEADER_SIZE, GENESIS_PREV_ROOT, HIST_FLAG,
  leafHash,
} from "../dist/index.js";

const enc = new TextEncoder();
const isCode = (code) => (e) => e instanceof TmfHistoryError && e.code === code;
const CHAIN_ID = Uint8Array.from({ length: 16 }, (_, i) => 0xc0 + i);
const leaf = (s) => leafHash(1, 0, new Uint8Array(0), enc.encode(s));

function buildChain(n, chainId = CHAIN_ID) {
  const built = [];
  let prev = null;
  for (let k = 0; k < n; k++) { prev = appendSegment(prev, [leaf("payload-" + k)], { chainId }); built.push(prev); }
  return built; // [{ segment, root }, ...]
}
const packView = (a) => ({ epoch: a.segment.epoch, flags: a.segment.flags, contentLeaves: a.segment.contentLeaves, prevRoot: a.segment.prevRoot });

// ── §1 chain header + link-leaf ──────────────────────────────────────────────
test("§1 chain header is 24 bytes; epoch+flags round-trip; reserved flag bits rejected", () => {
  const hc = chainHeader(5, HIST_FLAG.SEALED | HIST_FLAG.SIGNED, CHAIN_ID);
  assert.equal(hc.length, CHAIN_HEADER_SIZE);
  const p = parseChainHeader(hc);
  assert.equal(p.epoch, 5);
  assert.equal(p.flags, HIST_FLAG.SEALED | HIST_FLAG.SIGNED);
  assert.deepEqual([...p.chainId], [...CHAIN_ID]);
  assert.throws(() => chainHeader(0, 0x8, CHAIN_ID), isCode("MalformedChain")); // reserved bit 3
});

test("§1 link-leaf binds (epoch, prev_root); genesis uses 0^32", () => {
  const g = linkLeaf(0, GENESIS_PREV_ROOT);
  assert.equal(g.length, 32);
  assert.notDeepEqual([...linkLeaf(1, GENESIS_PREV_ROOT)], [...g]); // epoch-bound
  assert.notDeepEqual([...linkLeaf(0, new Uint8Array(32).fill(7))], [...g]); // prev_root-bound
});

test("§1/§6 epoch and flags are BOUND into r_k (flipping erased / epoch changes the root)", () => {
  const seg = { epoch: 1, flags: 0, chainId: CHAIN_ID, prevRoot: new Uint8Array(32).fill(9), contentLeaves: [leaf("x")] };
  const r0 = segmentRoot(seg);
  assert.notDeepEqual([...r0], [...segmentRoot({ ...seg, flags: HIST_FLAG.ERASED })]); // §6 erased authenticated
  assert.notDeepEqual([...r0], [...segmentRoot({ ...seg, epoch: 2 })]);
});

// ── §3 append + verify (fail-closed) ─────────────────────────────────────────
test("§3 a valid chain verifies (genesis 0^32, monotone epochs, links)", () => {
  const segs = buildChain(4).map((a) => a.segment);
  const res = verifyChain(segs);
  assert.equal(res.length, 4);
  assert.equal(res.headEpoch, 3);
});

test("§3 a tampered link (forged prev_root) fails closed", () => {
  const segs = buildChain(3).map((a) => a.segment);
  const bad = segs.map((s, i) => i === 2 ? { ...s, prevRoot: new Uint8Array(32).fill(0xff) } : s);
  assert.throws(() => verifyChain(bad), isCode("IntegrityError"));
});

test("§3 interior tamper (mutate a content leaf) breaks the next link", () => {
  const segs = buildChain(3).map((a) => a.segment);
  segs[1] = { ...segs[1], contentLeaves: [leaf("TAMPERED")] }; // r_1 changes; r_2 still links the old r_1
  assert.throws(() => verifyChain(segs), isCode("IntegrityError"));
});

test("§3/§5 a non-monotone / rolled-back epoch fails closed", () => {
  const segs = buildChain(3).map((a) => a.segment);
  assert.throws(() => verifyChain([segs[0], segs[2]]), isCode("IntegrityError")); // epoch jumps 0 -> 2
});

// ── §5 freshness (monotone floor + trusted head) ─────────────────────────────
test("§5 monotone-epoch floor rejects an end-truncated (older) head", () => {
  const segs = buildChain(4).map((a) => a.segment); // head epoch 3
  verifyChain(segs, { minEpoch: 3 }); // head == floor -> ok
  assert.throws(() => verifyChain(segs.slice(0, 3), { minEpoch: 3 }), isCode("RollbackError")); // head epoch 2
});

test("§5 trusted-head pointer rejects a head that does not extend the trusted head", () => {
  const built = buildChain(4);
  const segs = built.map((a) => a.segment);
  const th = { chainId: CHAIN_ID, latestEpoch: 3, root: built[3].root };
  verifyChain(segs, { trustedHead: th }); // exact head -> ok
  // old shorter head (lower epoch) -> reject
  assert.throws(() => verifyChain(built.slice(0, 3).map((a) => a.segment), { trustedHead: th }), isCode("RollbackError"));
  // right epoch but wrong root -> reject
  const wrong = { chainId: CHAIN_ID, latestEpoch: 3, root: new Uint8Array(32) };
  assert.throws(() => verifyChain(segs, { trustedHead: wrong }), isCode("RollbackError"));
});

test("§5 standalone enforceFreshness gate (no policy = no-op; floor enforced)", () => {
  enforceFreshness({ chainId: CHAIN_ID, epoch: 5, root: new Uint8Array(32) }); // no policy -> ok
  assert.throws(() => enforceFreshness({ chainId: CHAIN_ID, epoch: 1, root: new Uint8Array(32) }, { minEpoch: 2 }), isCode("RollbackError"));
});

// ── §8 on-wire pack ──────────────────────────────────────────────────────────
test("§8 pack round-trips and verifies; table order is independent (lookup by recomputed root)", () => {
  const ps = buildChain(3).map(packView);
  const r = verifyPack(encodePack(CHAIN_ID, ps));
  assert.equal(r.headEpoch, 2);
  assert.equal(r.segmentCount, 3);
  verifyPack(encodePack(CHAIN_ID, [ps[2], ps[0], ps[1]])); // shuffled table still verifies
});

test("§8 a tampered segment body fails closed (recomputed root != hint)", () => {
  const blob = encodePack(CHAIN_ID, buildChain(2).map(packView)).slice();
  blob[blob.length - 1] ^= 0x01; // flip a byte in the last body's prev_root trailer
  assert.throws(() => verifyPack(blob), isCode("IntegrityError"));
});

test("§8 strict membership: an off-path fork (orphan) is rejected", () => {
  const built = buildChain(3);
  const ps = built.map(packView);
  const fork = { epoch: 1, flags: 0, contentLeaves: [leaf("FORK")], prevRoot: built[0].root }; // 2nd epoch-1, off the head walk
  assert.throws(() => verifyPack(encodePack(CHAIN_ID, [...ps, fork])), isCode("IntegrityError"));
});

test("§8 chain_id relabel fails (chain_id is under header_core)", () => {
  const blob = encodePack(CHAIN_ID, buildChain(2).map(packView)).slice();
  blob[16] ^= 0xff; // flip the pack-header chain_id -> mismatches each body's authenticated chain_id
  assert.throws(() => verifyPack(blob), isCode("IntegrityError"));
});

test("§8 bad magic / unsupported version fail closed", () => {
  const blob = encodePack(CHAIN_ID, buildChain(1).map(packView)).slice();
  const badMagic = blob.slice(); badMagic[0] ^= 0xff;
  assert.throws(() => verifyPack(badMagic), isCode("BadMagic"));
  const badVer = blob.slice(); badVer[8] = 1;
  assert.throws(() => verifyPack(badVer), isCode("UnsupportedVersion"));
});

test("§8 freshness is enforced inside the pack reader", () => {
  const blob = encodePack(CHAIN_ID, buildChain(3).map(packView));
  verifyPack(blob, { minEpoch: 2 }); // head epoch 2 == floor -> ok
  assert.throws(() => verifyPack(blob, { minEpoch: 3 }), isCode("RollbackError"));
});
