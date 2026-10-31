// MR20 shared sweep body (gap 1.3, .fungi side). Each shard test file sweeps
// the flows whose index in secret-arena.fungi is congruent to its shard number,
// so the four shards together cover every flow exactly once and run in parallel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flowSignatures, sweepJobs, pool, traceFindings, CANARY_INTS } from "./mr20-harness.mjs";

export const SHARDS = 4;

// Every packed result seen across the full sweep (MEM-R20 probe: 756 runs over
// 36 flows, 29 arena* entry points and 7 shared helpers; MEM-R22 added four
// one-use lease flows, whose canary results add -128 K3 UNKNOWN).
// A value outside this set is either a new refusal code (update the pin and
// the findings) or a result that carries caller bits: both must be looked at.
export const CLOSED_RESULTS = Object.freeze([
  -128, 0, 1, 11, 100, 106, 111, 112, 121, 124, 140, 144, 1061, 1110, 1111, 1211, 1240, 1401,
]);

export function shardFlows(k, sigs = flowSignatures()) {
  return sigs.filter((_, i) => i % SHARDS === k);
}

export function runShard(k) {
  test(`MR20 shard ${k}: canary on every Int argument leaves no trace and no result bits`, async () => {
    const sigs = shardFlows(k);
    assert.ok(sigs.length > 0, "shard must hold at least one flow");
    for (const s of sigs) {
      for (const p of s.params) assert.equal(p.type, "Int", `${s.flow}.${p.name} must be Int`);
    }
    const jobs = sweepJobs(sigs, [["synt", CANARY_INTS.synt], ["f3a", CANARY_INTS.f3a]]);
    const rs = await pool(jobs, 3);
    const byPos = new Map();
    for (const r of rs) {
      const key = `${r.flow}.${r.param}`;
      assert.equal(r.status, 0, `${key} [${r.label}] exit ${r.status}`);
      assert.ok(r.present, `${key} [${r.label}] packed result missing`);
      assert.deepEqual(traceFindings(r.text), [], `${key} [${r.label}] canary trace in run text`);
      assert.ok(CLOSED_RESULTS.includes(r.value), `${key} [${r.label}] result ${r.value} outside the closed set`);
      if (!byPos.has(key)) byPos.set(key, {});
      byPos.get(key)[r.label] = r.value;
    }
    for (const [key, v] of byPos) {
      assert.equal(v.synt, v.f3a, `${key}: two different canaries gave different results`);
    }
    assert.equal(rs.length, 2 * sigs.reduce((a, s) => a + s.params.length, 0));
  });
}
