// MR20 coverage pins: the sweep reads its flow list from secret-arena.fungi,
// so these pins catch a regex that silently stops matching, and prove the
// shards partition the flows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { flowSignatures, unitSource, canaryWindows, intSpellings, traceFindings, CANARY_INTS, CANARY_TEXT } from "./mr20-harness.mjs";
import { SHARDS, shardFlows } from "./mr20-sweep-shard.mjs";

test("MR20 sweep sees every pure flow in the unit", () => {
  const sigs = flowSignatures();
  const declared = [...unitSource().matchAll(/^pure flow (\w+)\(/gm)].map((m) => m[1]);
  assert.deepEqual(sigs.map((s) => s.flow), declared, "every pure flow is swept");
  assert.ok(sigs.length >= 36, `expected at least 36 flows, saw ${sigs.length}`);
  const params = sigs.reduce((a, s) => a + s.params.length, 0);
  assert.ok(params >= 378, `expected at least 378 Int params, saw ${params}`);
});

test("MR20 shards partition the flows exactly once", () => {
  const all = flowSignatures().map((s) => s.flow);
  const seen = [];
  for (let k = 0; k < SHARDS; k += 1) seen.push(...shardFlows(k).map((s) => s.flow));
  assert.deepEqual([...seen].sort(), [...all].sort());
  assert.equal(new Set(seen).size, seen.length);
});

test("MR20 canary integers are the canary's own bytes and fit i32", () => {
  assert.equal(CANARY_TEXT, "SYNTH-CANARY-7f3a");
  assert.equal(CANARY_INTS.synt, 0x53594e54);
  assert.equal(CANARY_INTS.cana, 0x43414e41);
  assert.equal(CANARY_INTS.f3a, 0x37663361);
  for (const n of Object.values(CANARY_INTS)) assert.ok(n >= -2147483648 && n <= 2147483647);
  assert.equal(canaryWindows().length, CANARY_TEXT.length - 3);
});

test("MR20 trace scanner catches every spelling it claims to", () => {
  for (const w of canaryWindows()) assert.ok(traceFindings(`x${w}x`).length > 0, w);
  for (const n of Object.values(CANARY_INTS)) {
    for (const s of intSpellings(n)) assert.ok(traceFindings(`=> ${s}`).length > 0, s);
  }
  assert.deepEqual(traceFindings("=> 1401\nok 111 106 1240"), []);
});

test("MR20 harness never writes the tracked unit", () => {
  const before = readFileSync(new URL("../../src/secret-arena.fungi", import.meta.url), "utf8");
  assert.equal(unitSource(), before);
});
