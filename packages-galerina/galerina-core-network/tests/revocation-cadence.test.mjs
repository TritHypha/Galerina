// TLSTP S1/S4 — mid-stream revocation re-check cadence (config + pure helper). (TRACK c)
// Fail-closed: default = chunk_boundary; absent/invalid config ⇒ re-check every
// chunk, never "never". The helper only decides WHEN to re-check, never WHETHER
// to allow (that stays in the K3 fold), so it cannot weaken unknown→DENY.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REVOCATION_CADENCE, revocationRecheckDue } from "../dist/index.js";

const atBoundary = (msSinceLastCheck = 0) => ({ atChunkBoundary: true, msSinceLastCheck });
const midChunk = (msSinceLastCheck = 0) => ({ atChunkBoundary: false, msSinceLastCheck });

test("default cadence is chunk_boundary", () => {
  assert.deepEqual(DEFAULT_REVOCATION_CADENCE, { mode: "chunk_boundary" });
});

test("chunk_boundary: due exactly at a chunk boundary, not mid-chunk", () => {
  const c = { mode: "chunk_boundary" };
  assert.equal(revocationRecheckDue(c, atBoundary()), true);
  assert.equal(revocationRecheckDue(c, midChunk()), false);
  assert.equal(revocationRecheckDue(c, midChunk(10_000_000)), false);
  assert.equal(revocationRecheckDue(c, atBoundary(0)), true);
});

test("FAIL-CLOSED: absent cadence ⇒ chunk-boundary floor (re-check every chunk, never never)", () => {
  assert.equal(revocationRecheckDue(undefined, atBoundary()), true);
  assert.equal(revocationRecheckDue(undefined, midChunk()), false);
  assert.equal(revocationRecheckDue(null, atBoundary()), true);
  assert.equal(revocationRecheckDue(/** @type any */ (42), atBoundary()), true);
});

test("FAIL-CLOSED: unknown mode degrades to the chunk-boundary floor", () => {
  const bogus = /** @type any */ ({ mode: "yearly" });
  assert.equal(revocationRecheckDue(bogus, atBoundary()), true);
  assert.equal(revocationRecheckDue(bogus, midChunk()), false);
});

test("poll: due once elapsed reaches everyMs (inclusive), else not", () => {
  const c = { mode: "poll", everyMs: 5000 };
  assert.equal(revocationRecheckDue(c, midChunk(4999)), false);
  assert.equal(revocationRecheckDue(c, midChunk(5000)), true);
  assert.equal(revocationRecheckDue(c, midChunk(9999)), true);
});

test("poll is ALSO due at a chunk boundary even before the interval elapses (boundaries only ADD re-checks)", () => {
  const c = { mode: "poll", everyMs: 5000 };
  assert.equal(revocationRecheckDue(c, atBoundary(0)), true);
  assert.equal(revocationRecheckDue(c, atBoundary(1)), true);
});

test("FAIL-CLOSED: invalid poll everyMs (≤0 / non-finite) degrades to chunk-boundary floor, never 'never'", () => {
  for (const bad of [0, -1, -5000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const c = { mode: "poll", everyMs: bad };
    assert.equal(revocationRecheckDue(c, atBoundary(0)), true, `everyMs=${bad} must still re-check at boundary`);
    assert.equal(revocationRecheckDue(c, midChunk(0)), false, `everyMs=${bad} mid-chunk follows the floor`);
  }
});

test("FAIL-CLOSED: a broken clock (non-finite elapsed) in poll mode is treated as DUE, never skipped", () => {
  const c = { mode: "poll", everyMs: 5000 };
  assert.equal(revocationRecheckDue(c, midChunk(Number.NaN)), true);
  assert.equal(revocationRecheckDue(c, midChunk(Number.POSITIVE_INFINITY)), true);
});

test("INVARIANT: there is no (cadence,state) that yields 'never' — a chunk boundary always re-checks", () => {
  const cadences = [
    undefined,
    { mode: "chunk_boundary" },
    { mode: "poll", everyMs: 1 },
    { mode: "poll", everyMs: 60_000 },
    { mode: "poll", everyMs: 0 },
    { mode: "poll", everyMs: -1 },
    /** @type any */ ({ mode: "garbage" }),
  ];
  for (const c of cadences) {
    assert.equal(revocationRecheckDue(c, atBoundary(0)), true, `cadence ${JSON.stringify(c)} must re-check at a chunk boundary`);
  }
});

test("MONOTONICITY: poll never re-checks LESS than the chunk_boundary floor", () => {
  const floor = { mode: "chunk_boundary" };
  const poll = { mode: "poll", everyMs: 5000 };
  for (const atChunkBoundary of [true, false])
    for (const msSinceLastCheck of [0, 4999, 5000, 5001]) {
      const state = { atChunkBoundary, msSinceLastCheck };
      const floorDue = revocationRecheckDue(floor, state);
      const pollDue = revocationRecheckDue(poll, state);
      if (floorDue) assert.equal(pollDue, true, `poll must be due whenever floor is, at ${JSON.stringify(state)}`);
    }
});
