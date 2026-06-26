// =============================================================================
// Phase 11D — Governed Memory tests
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGovernedMemory } from "../dist/index.js";

// ---------------------------------------------------------------------------
// createGovernedMemory
// ---------------------------------------------------------------------------

describe("createGovernedMemory", () => {
  it("returns a GovernedMemory object with expected methods", () => {
    const mem = createGovernedMemory();
    assert.ok(typeof mem.register === "function");
    assert.ok(typeof mem.access === "function");
    assert.ok(typeof mem.canAccess === "function");
    assert.ok(typeof mem.getAll === "function");
    assert.ok(typeof mem.getAccessLog === "function");
  });

  it("starts with empty registry", () => {
    const mem = createGovernedMemory();
    assert.equal(mem.getAll().length, 0);
  });
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("register", () => {
  it("returns a tag with id, ownerFlow, qualifier, and baseType", () => {
    const mem = createGovernedMemory();
    const tag = mem.register("authFlow", "protected", "Email");
    assert.ok(typeof tag.id === "string");
    assert.ok(tag.id.length > 0);
    assert.equal(tag.ownerFlow, "authFlow");
    assert.equal(tag.qualifier, "protected");
    assert.equal(tag.baseType, "Email");
    assert.ok(typeof tag.createdAt === "number");
    assert.ok(tag.createdAt <= Date.now());
    assert.deepEqual(tag.accessLog, []);
  });

  it("assigns unique IDs to separate registrations", () => {
    const mem = createGovernedMemory();
    const tag1 = mem.register("flow", "protected", "Email");
    const tag2 = mem.register("flow", "redacted", "PatientId");
    assert.notEqual(tag1.id, tag2.id);
  });

  it("supports redacted qualifier", () => {
    const mem = createGovernedMemory();
    const tag = mem.register("medFlow", "redacted", "PatientId");
    assert.equal(tag.qualifier, "redacted");
    assert.equal(tag.baseType, "PatientId");
  });
});

// ---------------------------------------------------------------------------
// access and getAccessLog
// ---------------------------------------------------------------------------

describe("access and getAccessLog", () => {
  it("records an access in the access log", () => {
    const mem = createGovernedMemory();
    const tag = mem.register("ownerFlow", "protected", "Email");
    mem.access(tag.id, "readerFlow");
    const log = mem.getAccessLog(tag.id);
    assert.equal(log.length, 1);
    assert.equal(log[0], "readerFlow");
  });

  it("records multiple accesses in order", () => {
    const mem = createGovernedMemory();
    const tag = mem.register("owner", "protected", "SSN");
    mem.access(tag.id, "flowA");
    mem.access(tag.id, "flowB");
    mem.access(tag.id, "flowC");
    const log = mem.getAccessLog(tag.id);
    assert.deepEqual([...log], ["flowA", "flowB", "flowC"]);
  });

  it("returns empty array for unknown id", () => {
    const mem = createGovernedMemory();
    assert.deepEqual([...mem.getAccessLog("nonexistent")], []);
  });

  it("access on unknown id is a no-op", () => {
    const mem = createGovernedMemory();
    assert.doesNotThrow(() => mem.access("nonexistent", "someFlow"));
  });
});

// ---------------------------------------------------------------------------
// getAll
// ---------------------------------------------------------------------------

describe("getAll", () => {
  it("returns all registered values", () => {
    const mem = createGovernedMemory();
    mem.register("flow1", "protected", "Email");
    mem.register("flow2", "redacted", "PatientId");
    mem.register("flow3", "protected", "SSN");
    assert.equal(mem.getAll().length, 3);
  });

  it("reflects access log updates in getAll", () => {
    const mem = createGovernedMemory();
    const tag = mem.register("owner", "protected", "Email");
    mem.access(tag.id, "reader");
    const all = mem.getAll();
    const found = all.find((t) => t.id === tag.id);
    assert.ok(found !== undefined);
    assert.equal(found.accessLog.length, 1);
    assert.equal(found.accessLog[0], "reader");
  });
});

// ---------------------------------------------------------------------------
// canAccess
// ---------------------------------------------------------------------------

describe("canAccess", () => {
  it("returns true for any flow (Phase 11D placeholder)", () => {
    const mem = createGovernedMemory();
    const tag = mem.register("owner", "protected", "Email");
    assert.equal(mem.canAccess(tag.id, "anyFlow"), true);
    assert.equal(mem.canAccess(tag.id, "owner"), true);
    assert.equal(mem.canAccess("nonexistent", "flow"), true);
  });
});
