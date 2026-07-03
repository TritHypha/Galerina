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

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { TowerRuntime, AuditLogger } from "../dist/index.js";
import { LogicalClock } from "../../galerina-core-sentinel-time/dist/index.js";
import { AuditEgress, readEgressLedger } from "../../galerina-core-sentinel-egress/dist/index.js";

// ── Test hygiene: isolate the egress scratch ledgers, and don't leak them ──────
// The egress sentinel writes scratch ledgers under build/egress-it-<pid>-<n>. The
// OS recycles PIDs across `node --test` runs, so WITHOUT cleanup a fresh run can
// land on a dir left by a PRIOR run that already holds 12 records; readEgressLedger
// then counts stale 12 + fresh 12 = 24 and the `total === 12` assertion fails — a
// flaky, code-change-free gate failure. Left unchecked these dirs also accumulate
// without bound (999+ observed). Two guards keep this border deterministic:
//   1. sweepScratchDirs() removes only THIS process's egress-it-<pid>-* dirs (OWN_PREFIX). Run once
//      at load (clears a recycled PID's stale leftovers from a prior/crashed run of the SAME pid) and
//      again via after() (so a clean run leaves nothing behind — no disk leak). Scoped to own pid so a
//      parallel `node --test` sibling's LIVE egress-it-<otherpid>-* dir is never deleted mid-run — a
//      broad-prefix sweep raced siblings (the 50-year-mistake broad match; audit-scratchdir-hygiene flags it).
//   2. uniqueDir() hard-resets its specific target dir before handing it out, so
//      each test starts from a clean slate even when the PID has been recycled.
const SCRATCH_ROOT = "build";
const SCRATCH_PREFIX = "egress-it-";
const OWN_PREFIX = `${SCRATCH_PREFIX}${process.pid}-`; // own-PID: never touch a concurrent sibling's dirs

const sweepScratchDirs = () => {
  let entries;
  try {
    entries = readdirSync(SCRATCH_ROOT, { withFileTypes: true });
  } catch {
    return; // build/ not created yet — nothing to sweep
  }
  for (const e of entries) {
    if (e.isDirectory() && e.name.startsWith(OWN_PREFIX)) {
      rmSync(join(SCRATCH_ROOT, e.name), { recursive: true, force: true });
    }
  }
};

sweepScratchDirs();       // clear stale dirs from prior (possibly crashed) runs
after(sweepScratchDirs);  // don't leak this run's dirs

let counter = 0;
const uniqueDir = () => {
  const dir = `${SCRATCH_ROOT}/${OWN_PREFIX}${++counter}`;
  rmSync(dir, { recursive: true, force: true }); // PID reuse: never inherit a prior run's records
  return dir;
};

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
  const tower = new TowerRuntime({ auditInMemory: true, auditTickSource: () => clock.tick(), auditEgress: egress, allowUnsignedLoad: true });
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
