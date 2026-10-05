import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPUTE_AUDIT_EVENT_KINDS,
  COMPUTE_AUDIT_OUTCOMES,
  COMPUTE_AUDIT_SCHEMA_VERSION,
  PLANNER_RESPONSIBILITIES,
  SCHEDULER_RESPONSIBILITIES,
  buildComputeAuditEvent,
  defaultPlannerResponsibilityClaims,
  defaultSchedulerResponsibilityClaims,
  validateComputeAuditEventShape,
  validatePlannerResponsibilityClaim,
  validateSchedulerResponsibilityClaim,
} from "../dist/index.js";

describe("scheduler responsibilities", () => {
  it("names the four TODO responsibilities and defaults them to planning_only", () => {
    assert.deepEqual([...SCHEDULER_RESPONSIBILITIES], [
      "thermal_balancing",
      "queue_depth",
      "fairness",
      "fallback",
    ]);
    assert.ok(Object.isFrozen(SCHEDULER_RESPONSIBILITIES));
    const claims = defaultSchedulerResponsibilityClaims();
    assert.equal(claims.length, 4);
    for (const c of claims) {
      assert.equal(c.availability, "planning_only");
      assert.deepEqual(validateSchedulerResponsibilityClaim(c), []);
    }
  });

  it("refuses unknown names, live availability spellings and hostile shapes without echo", () => {
    assert.ok(
      validateSchedulerResponsibilityClaim({ name: "preempt", availability: "planning_only" }).some(
        (d) => d.code === "Galerina_COMPUTE_SCHEDULER_UNKNOWN",
      ),
    );
    assert.ok(
      validateSchedulerResponsibilityClaim({ name: "fairness", availability: "available" }).some(
        (d) => d.code === "Galerina_COMPUTE_SCHEDULER_AVAILABILITY",
      ),
    );
    const marker = "do-not-echo-sched-99";
    const d = validateSchedulerResponsibilityClaim({
      name: "fairness",
      availability: "planning_only",
      [marker]: true,
    });
    assert.equal(d[0].code, "Galerina_COMPUTE_SCHEDULER_CLAIM_SHAPE");
    assert.doesNotMatch(JSON.stringify(d), new RegExp(marker));
  });
});

describe("planner responsibilities", () => {
  it("names the four TODO responsibilities and defaults them to planning_only", () => {
    assert.deepEqual([...PLANNER_RESPONSIBILITIES], [
      "parallelism",
      "memory",
      "energy_cost",
      "backend_suitability",
    ]);
    const claims = defaultPlannerResponsibilityClaims();
    assert.equal(claims.length, 4);
    for (const c of claims) assert.deepEqual(validatePlannerResponsibilityClaim(c), []);
  });

  it("refuses unknown names and non-planning availability", () => {
    assert.ok(
      validatePlannerResponsibilityClaim({ name: "latency", availability: "planning_only" }).some(
        (d) => d.code === "Galerina_COMPUTE_PLANNER_UNKNOWN",
      ),
    );
    assert.ok(
      validatePlannerResponsibilityClaim({ name: "memory", availability: "available" }).some(
        (d) => d.code === "Galerina_COMPUTE_PLANNER_AVAILABILITY",
      ),
    );
  });
});

describe("compute audit event shapes", () => {
  it("admits closed planner/scheduler/fallback/distributed shapes", () => {
    assert.deepEqual([...COMPUTE_AUDIT_EVENT_KINDS], [
      "planner",
      "scheduler",
      "fallback",
      "distributed_execution",
    ]);
    assert.ok(COMPUTE_AUDIT_OUTCOMES.includes("not_admitted"));
    const cases = [
      { schemaVersion: COMPUTE_AUDIT_SCHEMA_VERSION, kind: "planner", subject: "parallelism", outcome: "planned" },
      { schemaVersion: COMPUTE_AUDIT_SCHEMA_VERSION, kind: "scheduler", subject: "fairness", outcome: "planned" },
      { schemaVersion: COMPUTE_AUDIT_SCHEMA_VERSION, kind: "fallback", subject: "cpu_fallback", outcome: "fallback_selected" },
      { schemaVersion: COMPUTE_AUDIT_SCHEMA_VERSION, kind: "distributed_execution", subject: "distributed_compute", outcome: "not_admitted" },
    ];
    for (const c of cases) {
      assert.deepEqual(validateComputeAuditEventShape(c), []);
      const built = buildComputeAuditEvent(c);
      assert.equal(built.ok, true);
      assert.equal(built.event.schemaVersion, COMPUTE_AUDIT_SCHEMA_VERSION);
    }
  });

  it("refuses cross-kind subjects, free-text, wrong version and hostile extras without echo", () => {
    assert.ok(
      validateComputeAuditEventShape({
        schemaVersion: COMPUTE_AUDIT_SCHEMA_VERSION,
        kind: "planner",
        subject: "fairness",
        outcome: "planned",
      }).some((d) => d.code === "Galerina_COMPUTE_AUDIT_SUBJECT"),
    );
    assert.ok(
      validateComputeAuditEventShape({
        schemaVersion: "galerina.compute.audit-event.v0",
        kind: "fallback",
        subject: "cpu_fallback",
        outcome: "fallback_selected",
      }).some((d) => d.code === "Galerina_COMPUTE_AUDIT_VERSION"),
    );
    const marker = "secret-audit-detail-77";
    const d = validateComputeAuditEventShape({
      schemaVersion: COMPUTE_AUDIT_SCHEMA_VERSION,
      kind: "scheduler",
      subject: "queue_depth",
      outcome: "planned",
      detail: marker,
    });
    assert.equal(d[0].code, "Galerina_COMPUTE_AUDIT_SHAPE");
    assert.doesNotMatch(JSON.stringify(d), new RegExp(marker));
    const refused = buildComputeAuditEvent({
      schemaVersion: COMPUTE_AUDIT_SCHEMA_VERSION,
      kind: "scheduler",
      subject: "queue_depth",
      outcome: "planned",
      detail: marker,
    });
    assert.equal(refused.ok, false);
  });
});
