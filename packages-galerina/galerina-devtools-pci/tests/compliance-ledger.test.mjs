/**
 * @galerina/devtools-pci — Black Box Compliance Ledger Tests (#146)
 *
 * Verifies the compliance-ledger module that consumes the audit-egress ledger
 * (from @galerina/core-sentinel-egress) and emits a structured, append-only,
 * HASH-LINKED compliance report (who/what/effect/decision/timestamp).
 *
 * Tests exercise the REAL AuditEgress writer end-to-end, plus the module's own
 * tamper-evident chain verification and deny-by-default normalisation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";

import {
  buildComplianceReport,
  buildComplianceReportFromDir,
  readEgressBatches,
  appendComplianceLedger,
  readComplianceLedger,
  verifyComplianceChain,
} from "../dist/index.js";

// The real audit-egress writer (consumed end-to-end).
import { AuditEgress } from "../../galerina-core-sentinel-egress/dist/index.js";

function freshDir(tag) {
  return mkdtempSync(join(tmpdir(), `spore-compliance-${tag}-`));
}

const FIXED_TS = "2026-06-14T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Test 1: end-to-end — consume a REAL AuditEgress ledger and emit a report
// ---------------------------------------------------------------------------
describe("end-to-end: consumes a real audit-egress ledger", () => {
  it("reads AuditEgress batches and emits one entry per record", () => {
    const dir = freshDir("e2e");
    const eg = new AuditEgress({ dir, batchSize: 2 });
    eg.push(JSON.stringify({ who: "alice", action: "charge", effect: "database.write", decision: "allow", ts: "2026-06-14T10:00:00.000Z" }));
    eg.push(JSON.stringify({ who: "bob", action: "refund", effect: "audit.write", decision: "deny", ts: "2026-06-14T10:01:00.000Z" }));
    eg.push(JSON.stringify({ who: "carol", action: "settle", effect: "network.outbound", decision: "allow", ts: "2026-06-14T10:02:00.000Z" }));
    eg.flush();

    const batches = readEgressBatches(dir);
    assert.ok(batches.length >= 1, "expected at least one egress batch");

    const report = buildComplianceReportFromDir(dir, FIXED_TS);
    assert.equal(report.schemaVersion, "spore.compliance-ledger.v1");
    assert.equal(report.entries.length, 3, "one compliance entry per audit record");

    const [e0, e1, e2] = report.entries;
    assert.equal(e0.who, "alice");
    assert.equal(e0.what, "charge");
    assert.equal(e0.effect, "database.write");
    assert.equal(e0.decision, "allow");
    assert.equal(e0.timestamp, "2026-06-14T10:00:00.000Z");

    assert.equal(e1.who, "bob");
    assert.equal(e1.decision, "deny");

    assert.equal(e2.who, "carol");
    assert.equal(e2.decision, "allow");

    assert.equal(report.allowCount, 2);
    assert.equal(report.denyCount, 1);
  });
});

// ---------------------------------------------------------------------------
// Test 2: hash-linked chain — prevHash links, monotonic seq, verifies
// ---------------------------------------------------------------------------
describe("hash-linked chain", () => {
  it("links each entry to the previous and verifies as intact", () => {
    const batches = [
      { seq: 0, count: 2, prevHash: "x", batchHash: "y", records: [
        JSON.stringify({ who: "a", action: "op1", effect: "e1", decision: "allow" }),
        JSON.stringify({ who: "b", action: "op2", effect: "e2", decision: "deny" }),
      ] },
    ];
    const report = buildComplianceReport(batches, "/tmp/x", FIXED_TS);

    const GENESIS = "0".repeat(64);
    assert.equal(report.entries[0].prevHash, GENESIS, "first entry links to genesis");
    assert.equal(report.entries[0].seq, 0);
    assert.equal(report.entries[1].seq, 1);
    assert.equal(report.entries[1].prevHash, report.entries[0].entryHash, "entry 1 links to entry 0");
    assert.equal(report.chainHead, report.entries[1].entryHash, "chainHead is last entryHash");
    assert.notEqual(report.entries[0].entryHash, report.entries[1].entryHash);

    assert.ok(verifyComplianceChain(report.entries), "freshly built chain must verify");
  });
});

// ---------------------------------------------------------------------------
// Test 3: tamper detection — mutating any field breaks verification
// ---------------------------------------------------------------------------
describe("tamper detection", () => {
  it("verifyComplianceChain returns false when an entry field is altered", () => {
    const batches = [
      { seq: 0, count: 2, prevHash: "p", batchHash: "h", records: [
        JSON.stringify({ who: "alice", action: "charge", effect: "db.write", decision: "allow" }),
        JSON.stringify({ who: "mallory", action: "exfiltrate", effect: "network.outbound", decision: "deny" }),
      ] },
    ];
    const report = buildComplianceReport(batches, "/tmp/x", FIXED_TS);
    assert.ok(verifyComplianceChain(report.entries));

    // Flip a denied decision to "allow" without recomputing the hash.
    const tampered = report.entries.map((e, i) =>
      i === 1 ? { ...e, decision: "allow" } : e);
    assert.equal(verifyComplianceChain(tampered), false, "tampered decision must fail verification");

    // Reorder entries (splice attack).
    const reordered = [report.entries[1], report.entries[0]];
    assert.equal(verifyComplianceChain(reordered), false, "reordered chain must fail verification");
  });
});

// ---------------------------------------------------------------------------
// Test 4: deny-by-default — unknown/missing/opaque records fail closed
// ---------------------------------------------------------------------------
describe("deny-by-default normalisation", () => {
  it("records deny when decision is missing, unknown, or the record is opaque", () => {
    const batches = [
      { seq: 0, count: 4, prevHash: "p", batchHash: "h", records: [
        JSON.stringify({ who: "a", action: "x", effect: "e" }),            // no decision field
        JSON.stringify({ who: "b", action: "y", effect: "e", decision: "maybe" }), // unknown token
        "plain-non-json-record",                                            // opaque string
        JSON.stringify({ who: "c", action: "z", effect: "e", decision: "allow" }), // explicit allow
      ] },
    ];
    const report = buildComplianceReport(batches, "/tmp/x", FIXED_TS);
    assert.equal(report.entries[0].decision, "deny", "missing decision => deny");
    assert.equal(report.entries[1].decision, "deny", "unknown token => deny");
    assert.equal(report.entries[2].decision, "deny", "opaque record => deny");
    assert.equal(report.entries[2].what, "plain-non-json-record", "opaque record raw kept as what");
    assert.equal(report.entries[3].decision, "allow", "explicit allow => allow");
    assert.equal(report.denyCount, 3);
    assert.equal(report.allowCount, 1);
  });

  it("recognises common allow synonyms and alternate field names", () => {
    const batches = [
      { seq: 0, count: 3, prevHash: "p", batchHash: "h", records: [
        JSON.stringify({ principal: "svc", operation: "read", capability: "io.read", outcome: "permitted" }),
        JSON.stringify({ user: "svc2", op: "write", resource: "fs", verdict: "GRANTED" }),
        JSON.stringify({ subject: "svc3", event: "rotate", cap: "secrets", result: "denied" }),
      ] },
    ];
    const report = buildComplianceReport(batches, "/tmp/x", FIXED_TS);
    assert.equal(report.entries[0].who, "svc");
    assert.equal(report.entries[0].what, "read");
    assert.equal(report.entries[0].effect, "io.read");
    assert.equal(report.entries[0].decision, "allow", "'permitted' => allow");
    assert.equal(report.entries[1].decision, "allow", "'GRANTED' (case-insensitive) => allow");
    assert.equal(report.entries[2].decision, "deny", "'denied' => deny");
  });
});

// ---------------------------------------------------------------------------
// Test 5: append-only persistence + read-back round-trips and verifies
// ---------------------------------------------------------------------------
describe("append-only persistence", () => {
  it("appends entries to disk, reads them back, and they verify", () => {
    const dir = freshDir("persist");
    const batches = [
      { seq: 0, count: 2, prevHash: "p", batchHash: "h", records: [
        JSON.stringify({ who: "a", action: "op1", effect: "e1", decision: "allow" }),
        JSON.stringify({ who: "b", action: "op2", effect: "e2", decision: "deny" }),
      ] },
    ];
    const report = buildComplianceReport(batches, dir, FIXED_TS);
    const path = appendComplianceLedger(dir, report);
    assert.ok(path.endsWith("compliance-ledger.jsonl"));

    const readBack = readComplianceLedger(dir);
    assert.equal(readBack.length, 2, "round-trips all entries");
    assert.deepEqual(readBack[0], report.entries[0], "entry 0 round-trips exactly");
    assert.deepEqual(readBack[1], report.entries[1], "entry 1 round-trips exactly");
    assert.ok(verifyComplianceChain(readBack), "persisted chain still verifies");
  });

  it("is append-only: a second build appended later keeps prior lines", () => {
    const dir = freshDir("append");
    const r1 = buildComplianceReport(
      [{ seq: 0, count: 1, prevHash: "p", batchHash: "h", records: [
        JSON.stringify({ who: "a", action: "first", effect: "e", decision: "allow" }) ] }],
      dir, FIXED_TS);
    appendComplianceLedger(dir, r1);
    const r2 = buildComplianceReport(
      [{ seq: 0, count: 1, prevHash: "p", batchHash: "h", records: [
        JSON.stringify({ who: "b", action: "second", effect: "e", decision: "deny" }) ] }],
      dir, FIXED_TS);
    appendComplianceLedger(dir, r2);

    const all = readComplianceLedger(dir);
    assert.equal(all.length, 2, "both appends present (nothing overwritten)");
    assert.equal(all[0].what, "first");
    assert.equal(all[1].what, "second");
  });
});

// ---------------------------------------------------------------------------
// Test 6: empty ledger — missing dir yields an empty, valid report
// ---------------------------------------------------------------------------
describe("empty ledger handling", () => {
  it("a missing egress dir yields an empty report with genesis chain head", () => {
    const report = buildComplianceReportFromDir(join(tmpdir(), `spore-compliance-missing-${process.pid}-${Date.now()}`), FIXED_TS);
    assert.equal(report.entries.length, 0);
    assert.equal(report.batchCount, 0);
    assert.equal(report.allowCount, 0);
    assert.equal(report.denyCount, 0);
    assert.equal(report.chainHead, "0".repeat(64), "empty report head is genesis");
    assert.ok(verifyComplianceChain(report.entries), "empty chain trivially verifies");
    assert.deepEqual(readEgressBatches("definitely-does-not-exist-xyz"), [], "missing dir => []");
  });
});

// ---------------------------------------------------------------------------
// Test 7: report JSON is auditor-consumable (valid JSON, all required fields)
// ---------------------------------------------------------------------------
describe("auditor-consumable JSON", () => {
  it("serialises to valid JSON with who/what/effect/decision/timestamp on every entry", () => {
    const batches = [
      { seq: 0, count: 1, prevHash: "p", batchHash: "h", records: [
        JSON.stringify({ who: "auditor-target", action: "access", effect: "secrets.read", decision: "allow", ts: "2026-06-14T12:00:00.000Z" }) ] },
    ];
    const report = buildComplianceReport(batches, "/tmp/x", FIXED_TS);
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    assert.equal(parsed.schemaVersion, "spore.compliance-ledger.v1");
    assert.ok(Array.isArray(parsed.entries));
    const e = parsed.entries[0];
    for (const field of ["who", "what", "effect", "decision", "timestamp", "entryHash", "prevHash", "seq"]) {
      assert.ok(field in e, `entry must carry '${field}'`);
    }
    assert.equal(typeof parsed.generatedAt, "string");
  });
});
