import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createPipelineReport,
  validateBackpressurePolicy,
  validateCheckpointPolicy,
  validatePipelineDefinition,
  validateQuarantinePolicy,
  validateRetryPolicy,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const stage = (name, inputType, outputType) => ({
  name,
  transform: { name: `${name}-t`, inputType, outputType },
  backpressure: { maxInFlight: 64, onSaturation: "block" },
});

const goodPipeline = {
  name: "events-ingest",
  source: { name: "events-queue", kind: "queue" },
  stages: [stage("decode", "Bytes", "Event"), stage("enrich", "Event", "EnrichedEvent")],
  checkpoint: { intervalItems: 500, store: "checkpoint-store" },
  budgets: { memoryBytes: 256 * 1024 * 1024, timeoutMs: 60_000 },
  quarantine: { destination: "events-dlq", maxItems: 10_000 },
};

describe("validateBackpressurePolicy — no bound, no pipeline", () => {
  it("accepts a positive bound with a known saturation behaviour", () => {
    assert.deepEqual(
      codes(validateBackpressurePolicy({ maxInFlight: 8, onSaturation: "fail" })),
      [],
    );
  });

  it("rejects zero, negative, NaN and fractional bounds", () => {
    for (const maxInFlight of [0, -1, Number.NaN, 1.5]) {
      const diags = validateBackpressurePolicy({ maxInFlight, onSaturation: "block" });
      assert.deepEqual(codes(diags), ["Galerina_DATA_PIPELINE_BACKPRESSURE_BOUND_REQUIRED"]);
    }
  });

  it("rejects an unknown saturation behaviour", () => {
    const diags = validateBackpressurePolicy({ maxInFlight: 8, onSaturation: "hope" });
    assert.deepEqual(codes(diags), ["Galerina_DATA_PIPELINE_SATURATION_MODE_UNKNOWN"]);
  });
});

describe("validateCheckpointPolicy — checkpoints must recur somewhere real", () => {
  it("accepts a positive interval and a store", () => {
    assert.deepEqual(
      codes(validateCheckpointPolicy({ intervalItems: 100, store: "s" })),
      [],
    );
  });

  it("rejects a non-positive interval and a blank store", () => {
    const diags = validateCheckpointPolicy({ intervalItems: 0, store: " " });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_PIPELINE_CHECKPOINT_INTERVAL_REQUIRED",
      "Galerina_DATA_PIPELINE_CHECKPOINT_STORE_REQUIRED",
    ]);
  });
});

describe("validateRetryPolicy — finite retries with sane backoff", () => {
  it("accepts bounded retries", () => {
    assert.deepEqual(
      codes(validateRetryPolicy({ maxAttempts: 3, backoffMs: 100, maxBackoffMs: 5000 })),
      [],
    );
  });

  it("rejects unbounded attempts", () => {
    const diags = validateRetryPolicy({ maxAttempts: Number.POSITIVE_INFINITY, backoffMs: 100 });
    assert.deepEqual(codes(diags), ["Galerina_DATA_PIPELINE_RETRY_BOUND_REQUIRED"]);
  });

  it("rejects maxBackoff below backoff and non-positive backoff", () => {
    assert.deepEqual(
      codes(validateRetryPolicy({ maxAttempts: 3, backoffMs: 100, maxBackoffMs: 50 })),
      ["Galerina_DATA_PIPELINE_RETRY_BACKOFF_INVALID"],
    );
    assert.deepEqual(
      codes(validateRetryPolicy({ maxAttempts: 3, backoffMs: 0 })),
      ["Galerina_DATA_PIPELINE_RETRY_BACKOFF_INVALID"],
    );
  });
});

describe("validateQuarantinePolicy — bounded and addressed", () => {
  it("accepts a destination with a bound", () => {
    assert.deepEqual(
      codes(validateQuarantinePolicy({ destination: "dlq", maxItems: 100 })),
      [],
    );
  });

  it("rejects a blank destination or unbounded quarantine", () => {
    assert.deepEqual(codes(validateQuarantinePolicy({ destination: "", maxItems: 100 })), [
      "Galerina_DATA_PIPELINE_QUARANTINE_INVALID",
    ]);
    assert.deepEqual(codes(validateQuarantinePolicy({ destination: "dlq", maxItems: 0 })), [
      "Galerina_DATA_PIPELINE_QUARANTINE_INVALID",
    ]);
  });
});

describe("validatePipelineDefinition — bounded stages, typed flow, budgets", () => {
  it("accepts a fully-bounded pipeline", () => {
    assert.deepEqual(codes(validatePipelineDefinition(goodPipeline)), []);
  });

  it("errors when a stage has no backpressure bound", () => {
    const diags = validatePipelineDefinition({
      ...goodPipeline,
      stages: [
        {
          ...stage("decode", "Bytes", "Event"),
          backpressure: { maxInFlight: 0, onSaturation: "block" },
        },
      ],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_PIPELINE_BACKPRESSURE_BOUND_REQUIRED"));
  });

  it("errors on a stage type mismatch", () => {
    const diags = validatePipelineDefinition({
      ...goodPipeline,
      stages: [stage("decode", "Bytes", "Event"), stage("enrich", "Row", "EnrichedRow")],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_PIPELINE_STAGE_TYPE_MISMATCH"]);
  });

  it("requires at least one stage and rejects duplicates", () => {
    assert.ok(
      codes(validatePipelineDefinition({ ...goodPipeline, stages: [] })).includes(
        "Galerina_DATA_PIPELINE_STAGES_REQUIRED",
      ),
    );
    const dup = validatePipelineDefinition({
      ...goodPipeline,
      stages: [stage("decode", "Bytes", "Event"), stage("decode", "Event", "Event")],
    });
    assert.ok(codes(dup).includes("Galerina_DATA_PIPELINE_STAGE_DUPLICATE"));
  });

  it("requires memory and timeout budgets", () => {
    const diags = validatePipelineDefinition({
      ...goodPipeline,
      budgets: { memoryBytes: 0, timeoutMs: Number.NaN },
    });
    assert.ok(codes(diags).includes("Galerina_DATA_PIPELINE_MEMORY_BUDGET_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_PIPELINE_TIMEOUT_REQUIRED"));
  });

  it("warns when no quarantine is declared", () => {
    const { quarantine, ...noQuarantine } = goodPipeline;
    const diags = validatePipelineDefinition(noQuarantine);
    assert.deepEqual(codes(diags), ["Galerina_DATA_PIPELINE_QUARANTINE_UNDECLARED"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects an unknown source kind", () => {
    const diags = validatePipelineDefinition({
      ...goodPipeline,
      source: { name: "s", kind: "carrier_pigeon" },
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_PIPELINE_SOURCE_KIND_UNKNOWN"]);
  });
});

describe("createPipelineReport — processing reports with honest failure math", () => {
  it("builds a clean report", () => {
    const report = createPipelineReport({
      pipeline: "events-ingest",
      processedCount: 1000,
      failedCount: 0,
      quarantinedCount: 0,
      checkpointCount: 2,
    });
    assert.deepEqual(report.diagnostics, []);
    assert.equal(report.processedCount, 1000);
  });

  it("warns when failures were not quarantined", () => {
    const report = createPipelineReport({
      pipeline: "events-ingest",
      processedCount: 1000,
      failedCount: 5,
      quarantinedCount: 2,
      checkpointCount: 2,
    });
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_DATA_PIPELINE_FAILURES_NOT_QUARANTINED",
    ]);
    assert.equal(report.warnings.length, 1);
  });

  it("rejects invalid counts", () => {
    const report = createPipelineReport({
      pipeline: "events-ingest",
      processedCount: -1,
      failedCount: 0.5,
      quarantinedCount: 0,
      checkpointCount: 0,
    });
    assert.equal(
      codes(report.diagnostics).filter((c) => c === "Galerina_DATA_PIPELINE_COUNT_INVALID").length,
      2,
    );
  });
});
