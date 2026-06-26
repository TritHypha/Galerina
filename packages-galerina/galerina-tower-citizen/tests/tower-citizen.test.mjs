/**
 * @galerina/tower-citizen — Integration Tests
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import { TowerRuntime, AuditLogger, PluginSandbox } from "../dist/index.js";

const TEST_METADATA = {
  engineId: "test-engine-v1",
  artifactPath: "/test/artifact.wasm",
  artifactHash: "sha256:test-artifact-hash",
  governanceTier: 1,
  license: "MIT",
  maxMemoryMB: 64,
  capabilityMask: 0b00100000,
};

const TEST_LOG_DIR = "build/audit-log-test";

after(() => {
  try { rmSync(TEST_LOG_DIR, { recursive: true }); } catch { /* ignore */ }
});

// ---------------------------------------------------------------------------
// AuditLogger
// ---------------------------------------------------------------------------

describe("AuditLogger: LOAD→EXEC→ERASE breadcrumb trail", () => {
  const logger = new AuditLogger(TEST_LOG_DIR);

  it("appends a LOAD event and returns a full TowerAuditEvent", () => {
    const ev = logger.load("CORR-001", "sha256:abc", "bitnet-cpu");
    assert.equal(ev.phase, "LOAD");
    assert.equal(ev.correlationId, "CORR-001");
    assert.equal(ev.governancePass, true);
    assert.match(ev.eventId, /^EVT-\d+-\d+$/);
  });

  it("appends an EXEC event with inputHash in details", () => {
    const ev = logger.exec("CORR-001", "sha256:abc", "bitnet-cpu", "sha256:inputXYZ");
    assert.equal(ev.phase, "EXEC");
    assert.equal(ev.details["inputHash"], "sha256:inputXYZ");
  });

  it("appends a TRAP event with governancePass=false", () => {
    const ev = logger.trap("CORR-001", "sha256:abc", "bitnet-cpu", "BUDGET_EXCEEDED", { requestedMB: 999 });
    assert.equal(ev.phase, "TRAP");
    assert.equal(ev.governancePass, false);
    assert.equal(ev.severity, "ERROR");
    assert.equal(ev.details["violation"], "BUDGET_EXCEEDED");
  });

  it("appends an ERASE event", () => {
    const ev = logger.erase("CORR-001", "sha256:abc", "bitnet-cpu", true, "sha256:out123");
    assert.equal(ev.phase, "ERASE");
    assert.equal(ev.governancePass, true);
  });

  it("queries by correlationId and returns all 4 events", () => {
    const events = logger.query({ correlationId: "CORR-001" });
    assert.equal(events.length, 4);
  });

  it("queries by phase", () => {
    const events = logger.query({ phase: "TRAP" });
    assert.ok(events.length >= 1);
    assert.ok(events.every(e => e.phase === "TRAP"));
  });

  it("getLifecycle shows complete=true and TRAP in phases", () => {
    const lc = logger.getLifecycle("CORR-001");
    assert.equal(lc.complete, true);
    assert.ok(lc.phases.includes("LOAD"));
    assert.ok(lc.phases.includes("ERASE"));
    assert.ok(lc.violations.length >= 1);
  });
});

// ---------------------------------------------------------------------------
// PluginSandbox
// ---------------------------------------------------------------------------

describe("PluginSandbox: lifecycle and validation", () => {
  it("starts not erased", () => {
    const sb = new PluginSandbox(TEST_METADATA);
    assert.equal(sb.isErased(), false);
  });

  it("erase() marks sandbox as erased", () => {
    const sb = new PluginSandbox(TEST_METADATA);
    sb.erase();
    assert.equal(sb.isErased(), true);
  });

  it("validate() accepts valid object input", () => {
    const sb = new PluginSandbox(TEST_METADATA);
    const r = sb.validate({ prompt: "hello" });
    assert.equal(r.valid, true);
    assert.equal(r.violations.length, 0);
  });

  it("validate() rejects null input", () => {
    const sb = new PluginSandbox(TEST_METADATA);
    const r = sb.validate(null);
    assert.equal(r.valid, false);
    assert.ok(r.violations.includes("NULL_INPUT"));
  });

  it("hashValue produces stable sha256: prefixed string", () => {
    const h = PluginSandbox.hashValue({ test: 1 });
    assert.match(h, /^sha256:[0-9a-f]{16}$/);
    // stable across calls
    assert.equal(h, PluginSandbox.hashValue({ test: 1 }));
  });
});

// ---------------------------------------------------------------------------
// TowerRuntime
// ---------------------------------------------------------------------------

describe("TowerRuntime: Load→Execute→Erase lifecycle", () => {
  it("loads a plugin within budget", async () => {
    const tower = new TowerRuntime({ assimilationMemoryBudgetMB: 256 });
    const { sandbox, correlationId, loadEvent } = await tower.load(TEST_METADATA);
    assert.ok(correlationId.startsWith("CORR-"));
    assert.equal(loadEvent.phase, "LOAD");
    assert.equal(tower.getActiveSandboxCount(), 1);
    await tower.erase(sandbox, correlationId);
    assert.equal(tower.getActiveSandboxCount(), 0);
  });

  it("rejects plugin exceeding assimilation_memory_budget", async () => {
    const tower = new TowerRuntime({ assimilationMemoryBudgetMB: 32 });
    await assert.rejects(
      () => tower.load(TEST_METADATA),
      /SPORE-ASSIMILATE-002/
    );
  });

  it("execute() runs successfully on valid input", async () => {
    const tower = new TowerRuntime({ assimilationMemoryBudgetMB: 256 });
    const { sandbox, correlationId } = await tower.load(TEST_METADATA);
    const result = await tower.execute(sandbox, { prompt: "test" }, correlationId);
    assert.equal(result.success, true);
    assert.equal(result.trapFired, false);
    assert.match(result.outputHash, /^sha256:/);
    await tower.erase(sandbox, correlationId, result);
  });

  it("execute() traps on null input", async () => {
    const tower = new TowerRuntime({ assimilationMemoryBudgetMB: 256 });
    const { sandbox, correlationId } = await tower.load(TEST_METADATA);
    const result = await tower.execute(sandbox, null, correlationId);
    assert.equal(result.success, false);
    assert.equal(result.trapFired, true);
    assert.match(result.trapCode ?? "", /ERR_SCHEMA_/);
  });

  it("execute() throws on erased sandbox", async () => {
    const tower = new TowerRuntime({ assimilationMemoryBudgetMB: 256 });
    const { sandbox, correlationId } = await tower.load(TEST_METADATA);
    await tower.erase(sandbox, correlationId);
    await assert.rejects(
      () => tower.execute(sandbox, { prompt: "test" }, correlationId),
      /SANDBOX_ERASED/
    );
  });

  it("evict() removes sandbox and emits ERASE audit event", async () => {
    const tower = new TowerRuntime({ assimilationMemoryBudgetMB: 256 });
    const { correlationId } = await tower.load(TEST_METADATA);
    assert.equal(tower.getActiveSandboxCount(), 1);
    const evicted = tower.evict(correlationId);
    assert.equal(evicted, true);
    assert.equal(tower.getActiveSandboxCount(), 0);
  });

  it("getLifecycle() returns complete lifecycle after Load→Execute→Erase", async () => {
    const tower = new TowerRuntime({ assimilationMemoryBudgetMB: 256 });
    const { sandbox, correlationId } = await tower.load(TEST_METADATA);
    const result = await tower.execute(sandbox, { prompt: "lifecycle test" }, correlationId);
    await tower.erase(sandbox, correlationId, result);
    const lc = tower.getLifecycle(correlationId);
    assert.equal(lc.complete, true);
    assert.ok(lc.phases.includes("LOAD"));
    assert.ok(lc.phases.includes("EXEC"));
    assert.ok(lc.phases.includes("ERASE"));
  });
});
