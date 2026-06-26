// sentinel-egress-time.test.mjs — the audit border, fully sealed.
//
// Wires Sentinel-Time (LST) and Sentinel-Egress into the Tower's audit path:
//   - Every audit event is stamped with a deterministic LogicalTick (LST), not
//     wall-clock time → replayable timing.
//   - Every ledger write goes through the governed Egress sink (fixed ring +
//     batched, HMAC-chained, tamper-evident flush) — NOT raw appendFileSync.
//
// This closes the "fs.appendFileSync leak" in the Hardened Border: the runtime
// no longer writes the audit ledger directly; it hands records to the egress
// sentinel, which is the only component that touches the ledger file.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TowerRuntime, AuditLogger } from "../dist/index.js";
import { LogicalClock } from "../../galerina-core-sentinel-time/dist/index.js";
import { AuditEgress, readEgressLedger } from "../../galerina-core-sentinel-egress/dist/index.js";

let counter = 0;
const uniqueDir = () => `build/egress-it-${process.pid}-${++counter}`;

test("LST stamps every audit event with a deterministic LogicalTick", () => {
  const clock = new LogicalClock(1000);
  const logger = new AuditLogger(null, { tickSource: () => clock.tick() }); // in-mem + tick
  logger.append({ phase: "LOAD", correlationId: "t1", artifactHash: "h", engineId: "e", severity: "INFO", category: "LIFECYCLE", details: {}, governancePass: true });
  logger.append({ phase: "EXEC", correlationId: "t1", artifactHash: "h", engineId: "e", severity: "INFO", category: "AUDIT_TRAIL", details: {}, governancePass: true });
  const ev = logger.query({ correlationId: "t1" });
  assert.equal(ev.length, 2);
  assert.equal(ev[0].logicalTick, 1001, "first event stamped with tick 1001");
  assert.equal(ev[1].logicalTick, 1002, "ticks are monotonic and cycle-indexed");
});

test("audit writes go through the governed Egress sink (no direct appendFileSync)", () => {
  const dir = uniqueDir();
  const egress = new AuditEgress({ dir, batchSize: 5 });
  const clock = new LogicalClock(0);
  const logger = new AuditLogger(null, { egress, tickSource: () => clock.tick() });

  for (let i = 0; i < 12; i++) {
    logger.append({ phase: "EXEC", correlationId: "e" + i, artifactHash: "h", engineId: "eng", severity: "INFO", category: "AUDIT_TRAIL", details: { i }, governancePass: true });
  }
  logger.flush(); // flush the partial final batch

  // The egress ledger (NOT the tower's own file) holds every record, HMAC-chained.
  const batches = readEgressLedger(dir);
  const total = batches.reduce((n, b) => n + b.count, 0);
  assert.equal(total, 12, "all 12 audit records reached the governed egress ledger");
  assert.equal(AuditEgress.verifyChain(batches), true, "egress HMAC chain verifies (tamper-evident)");
  // query() still works (from memory) during egress operation.
  assert.equal(logger.query({ correlationId: "e0" }).length, 1);
});

test("a tampered egress batch fails chain verification", () => {
  const dir = uniqueDir();
  const egress = new AuditEgress({ dir, batchSize: 3 });
  const logger = new AuditLogger(null, { egress });
  for (let i = 0; i < 6; i++) logger.append({ phase: "EXEC", correlationId: "x" + i, artifactHash: "h", engineId: "e", severity: "INFO", category: "AUDIT_TRAIL", details: {}, governancePass: true });
  logger.flush();
  const batches = readEgressLedger(dir);
  assert.ok(batches.length >= 2);
  // Forge a record inside a committed batch.
  const forged = batches.map((b, i) => i === 0 ? { ...b, records: [...b.records.slice(0, -1), '{"phase":"FORGED"}'] } : b);
  assert.equal(AuditEgress.verifyChain(forged), false, "forged audit record breaks the chain");
});

test("TowerRuntime routes its audit through LST + Egress when configured", async () => {
  const dir = uniqueDir();
  const egress = new AuditEgress({ dir, batchSize: 4 });
  const clock = new LogicalClock(500);
  const tower = new TowerRuntime({ auditInMemory: true, auditTickSource: () => clock.tick(), auditEgress: egress });
  const meta = { engineId: "uhie", artifactPath: "p", artifactHash: "sha256:x", governanceTier: 1, license: "Apache-2.0", maxMemoryMB: 64, capabilityMask: 0 };
  const { sandbox, correlationId } = await tower.load(meta, "RUN-1");
  await tower.erase(sandbox, correlationId);
  tower.getAudit().flush();

  const events = tower.getAudit().query({ correlationId: "RUN-1" });
  assert.ok(events.length >= 2, "LOAD + ERASE recorded");
  assert.ok(events.every((e) => typeof e.logicalTick === "number"), "every Tower event carries a LogicalTick");
  const batches = readEgressLedger(dir);
  assert.ok(batches.reduce((n, b) => n + b.count, 0) >= 2, "Tower audit reached the governed egress ledger");
});
