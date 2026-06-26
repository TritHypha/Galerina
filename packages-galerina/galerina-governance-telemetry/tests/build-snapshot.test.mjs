// build-snapshot.test.mjs — the missing /metrics producer (R&D 0120-F4): a fail-closed projection of
// raw runtime governance state into a GovernanceSnapshot. Decodes the mask, reduces effects to families,
// allow-lists tier/status labels — so a host cannot leak an arbitrary label or payload through the exporter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGovernanceSnapshot, renderPrometheus, GOVERNANCE_FLAGS } from "../dist/index.js";

test("decodes governanceFlagsMask into the known flags (bit i → GOVERNANCE_FLAGS[i])", () => {
  const mask = (1 << 0) | (1 << 2) | (1 << 7); // RequiresAudit, ContainsPII, HasPolicy
  const snap = buildGovernanceSnapshot({ governanceFlagsMask: mask });
  assert.equal(snap.governanceFlags.RequiresAudit, true);
  assert.equal(snap.governanceFlags.ContainsPII, true);
  assert.equal(snap.governanceFlags.HasPolicy, true);
  assert.equal(snap.governanceFlags.DenyRemote, false);
  // every known flag is present (on or off), nothing outside GOVERNANCE_FLAGS
  assert.deepEqual(Object.keys(snap.governanceFlags).sort(), [...GOVERNANCE_FLAGS].sort());
});

test("reduces effects to FAMILIES, sums, drops unsafe labels", () => {
  const snap = buildGovernanceSnapshot({
    effectsObserved: { "network.outbound": 3, "network.inbound": 2, "database.write": 1 },
  });
  assert.equal(snap.effectsObserved.network, 5); // family-summed
  assert.equal(snap.effectsObserved.database, 1);
});

test("FAIL-CLOSED: allow-lists tier/status labels + drops unknown/payload-shaped labels", () => {
  const snap = buildGovernanceSnapshot({
    executionTiers: { tree: 5, "evil payload": 99, bytecode: 2 },
    auditEvents: { Denied: 4, "secret=hunter2": 1 },
  });
  assert.equal(snap.executionTiers.tree, 5);
  assert.equal(snap.executionTiers.bytecode, 2);
  assert.equal(snap.executionTiers["evil payload"], undefined, "unknown tier label dropped");
  assert.equal(snap.auditEvents.Denied, 4);
  assert.equal(snap.auditEvents["secret=hunter2"], undefined, "non-status label dropped");
});

test("drops non-finite counts (NaN / Infinity / non-number)", () => {
  const snap = buildGovernanceSnapshot({ allowedEffectsCount: NaN, proofObligationsCount: Infinity, governanceIndeterminateTotal: 3, queueDepth: 7 });
  assert.equal(snap.allowedEffectsCount, undefined);
  assert.equal(snap.proofObligationsCount, undefined);
  assert.equal(snap.governanceIndeterminateTotal, 3);
  assert.equal(snap.queueDepth, 7);
});

test("an unsafe behavioralFingerprint/build label is dropped (never leaked)", () => {
  const snap = buildGovernanceSnapshot({ behavioralFingerprint: "has spaces and ; payload", build: "v1.2.3" });
  assert.equal(snap.behavioralFingerprint, undefined);
  assert.equal(snap.build, "v1.2.3");
});

test("INTEGRATION: the produced snapshot renders cleanly through renderPrometheus, no payload leak", () => {
  const out = renderPrometheus(buildGovernanceSnapshot({
    governanceFlagsMask: 1,
    effectsObserved: { "network.out": 1, "secret.read": 2 },
    executionTiers: { tree: 1 },
    auditEvents: { Denied: 1 },
  }));
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});

test("empty state → empty-but-valid snapshot that still renders", () => {
  const snap = buildGovernanceSnapshot({});
  assert.equal(snap.governanceFlags, undefined);
  assert.equal(typeof renderPrometheus(snap), "string");
});
