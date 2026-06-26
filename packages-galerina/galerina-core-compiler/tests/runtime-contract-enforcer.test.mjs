// =============================================================================
// Phase 11C — Runtime Contract Enforcer tests
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Import from the compiled dist output
import {
  createContractEnforcer,
} from "../dist/runtime/contractEnforcer.js";

import {
  createContext,
  isExpired,
} from "../dist/runtime/runtimeContext.js";

import {
  parseRetryPolicy,
  withRetry,
} from "../dist/runtime/retryPolicy.js";

import {
  parseLimitConfig,
  checkRequestSize,
  checkBatchSize,
} from "../dist/runtime/limitPolicy.js";

import {
  createEnforcementRecord,
  recordRetryAttempt,
  recordLimitViolation,
  formatEnforcementRecord,
} from "../dist/runtime/runtimeReport.js";

// ---------------------------------------------------------------------------
// RuntimeContext
// ---------------------------------------------------------------------------

describe("createContext", () => {
  it("creates a context with correct flowName", () => {
    const ctx = createContext("myFlow");
    assert.equal(ctx.flowName, "myFlow");
    assert.ok(typeof ctx.startedAt === "number");
    assert.ok(ctx.startedAt <= Date.now());
  });

  it("forwards optional traceId and actor", () => {
    const ctx = createContext("authFlow", { traceId: "abc-123", actor: "user:42" });
    assert.equal(ctx.traceId, "abc-123");
    assert.equal(ctx.actor, "user:42");
  });

  it("sets deadlineMs when provided", () => {
    const deadline = Date.now() + 5000;
    const ctx = createContext("timedFlow", { deadlineMs: deadline });
    assert.equal(ctx.deadlineMs, deadline);
  });
});

describe("isExpired", () => {
  it("returns false when no deadline is set", () => {
    const ctx = createContext("noDeadlineFlow");
    assert.equal(isExpired(ctx), false);
  });

  it("returns false when deadline is in the future", () => {
    const ctx = createContext("futureFlow", { deadlineMs: Date.now() + 60_000 });
    assert.equal(isExpired(ctx), false);
  });

  it("returns true when deadline is in the past", () => {
    const ctx = createContext("expiredFlow", { deadlineMs: Date.now() - 1 });
    assert.equal(isExpired(ctx), true);
  });
});

// ---------------------------------------------------------------------------
// ContractEnforcer — no contract node
// ---------------------------------------------------------------------------

describe("createContractEnforcer (no contract node)", () => {
  it("returns a valid enforcer with correct flowName context", () => {
    const enforcer = createContractEnforcer(undefined, "testFlow");
    assert.equal(enforcer.context.flowName, "testFlow");
    assert.equal(enforcer.enforcementRecord.flowName, "testFlow");
  });

  it("checkRequestSize does not throw when no limit is configured", () => {
    const enforcer = createContractEnforcer(undefined, "testFlow");
    assert.doesNotThrow(() => enforcer.checkRequestSize(999_999_999));
  });

  it("checkBatchSize does not throw when no limit is configured", () => {
    const enforcer = createContractEnforcer(undefined, "testFlow");
    assert.doesNotThrow(() => enforcer.checkBatchSize(1_000_000));
  });

  it("checkDeadline does not throw when no deadline is configured", () => {
    const enforcer = createContractEnforcer(undefined, "testFlow");
    assert.doesNotThrow(() => enforcer.checkDeadline());
  });
});

// ---------------------------------------------------------------------------
// ContractEnforcer — request size limits via parseLimitConfig
// ---------------------------------------------------------------------------

describe("checkRequestSize (via limitPolicy)", () => {
  it("does not throw when bytes are under the limit", () => {
    const config = { maxRequestSizeBytes: 1024 };
    const violation = checkRequestSize(512, config);
    assert.equal(violation, null);
  });

  it("returns a violation when bytes exceed the limit", () => {
    const config = { maxRequestSizeBytes: 1024 };
    const violation = checkRequestSize(2048, config);
    assert.notEqual(violation, null);
    assert.equal(violation?.kind, "request_size");
    assert.equal(violation?.limit, 1024);
    assert.equal(violation?.actual, 2048);
  });

  it("enforcer throws RangeError when bytes exceed the limit", () => {
    // Create a minimal contract AST with a limits section
    /** @type {import('../dist/parser.js').AstNode} */
    const contractNode = {
      kind: "contractDecl",
      children: [
        {
          kind: "contractSetDecl",
          value: "limits",
          children: [
            {
              kind: "identifier",
              value: "max request size 1 kb",
            },
          ],
        },
      ],
    };

    const enforcer = createContractEnforcer(contractNode, "limitedFlow");
    assert.throws(
      () => enforcer.checkRequestSize(2048),
      (err) => err instanceof RangeError && err.message.includes("SPORE-LIMIT"),
    );
  });

  it("enforcer does not throw when bytes are within the limit", () => {
    const contractNode = {
      kind: "contractDecl",
      children: [
        {
          kind: "contractSetDecl",
          value: "limits",
          children: [
            {
              kind: "identifier",
              value: "max request size 1 kb",
            },
          ],
        },
      ],
    };

    const enforcer = createContractEnforcer(contractNode, "limitedFlow");
    assert.doesNotThrow(() => enforcer.checkRequestSize(512));
  });
});

// ---------------------------------------------------------------------------
// checkBatchSize
// ---------------------------------------------------------------------------

describe("checkBatchSize (via limitPolicy)", () => {
  it("returns null when count is within the limit", () => {
    const config = { maxBatchSize: 100 };
    assert.equal(checkBatchSize(50, config), null);
  });

  it("returns a violation when count exceeds the limit", () => {
    const config = { maxBatchSize: 100 };
    const violation = checkBatchSize(150, config);
    assert.notEqual(violation, null);
    assert.equal(violation?.kind, "batch_size");
    assert.equal(violation?.limit, 100);
    assert.equal(violation?.actual, 150);
  });
});

// ---------------------------------------------------------------------------
// Retry policy — withRetry
// ---------------------------------------------------------------------------

describe("withRetry", () => {
  it("succeeds immediately when fn does not throw", async () => {
    const policy = parseRetryPolicy(undefined);
    let calls = 0;
    const result = await withRetry("network", policy, async () => {
      calls++;
      return "ok";
    });
    assert.equal(result, "ok");
    assert.equal(calls, 1);
  });

  it("retries on failure up to maxAttempts", async () => {
    const policies = new Map([
      ["network", { maxAttempts: 3, strategy: "none", delayMs: 0 }],
    ]);
    const policy = { policies };
    let calls = 0;

    await assert.rejects(
      withRetry("network", policy, async () => {
        calls++;
        throw new Error("transient failure");
      }),
      /transient failure/,
    );

    assert.equal(calls, 3);
  });

  it("resolves on the second attempt when first fails", async () => {
    const policies = new Map([
      ["db", { maxAttempts: 3, strategy: "none", delayMs: 0 }],
    ]);
    const policy = { policies };
    let calls = 0;

    const result = await withRetry("db", policy, async () => {
      calls++;
      if (calls < 2) throw new Error("first attempt fails");
      return "success";
    });

    assert.equal(result, "success");
    assert.equal(calls, 2);
  });

  it("uses maxAttempts=1 for effects without a policy entry", async () => {
    const policy = parseRetryPolicy(undefined);
    let calls = 0;

    await assert.rejects(
      withRetry("unknown_effect", policy, async () => {
        calls++;
        throw new Error("always fails");
      }),
      /always fails/,
    );

    assert.equal(calls, 1);
  });
});

// ---------------------------------------------------------------------------
// ContractEnforcementRecord
// ---------------------------------------------------------------------------

describe("createEnforcementRecord", () => {
  it("creates a clean record with empty violations and retries", () => {
    const record = createEnforcementRecord("checkoutFlow");
    assert.equal(record.flowName, "checkoutFlow");
    assert.equal(record.deadlineExceeded, false);
    assert.equal(record.violations.length, 0);
    assert.equal(record.retries.size, 0);
  });
});

describe("recordRetryAttempt", () => {
  it("records retry attempt for an effect", () => {
    const record = createEnforcementRecord("flow");
    const updated = recordRetryAttempt(record, "network.outbound", 2, 3);
    const entry = updated.retries.get("network.outbound");
    assert.notEqual(entry, undefined);
    assert.equal(entry?.attemptsUsed, 2);
    assert.equal(entry?.maxAttempts, 3);
  });

  it("does not mutate the original record", () => {
    const record = createEnforcementRecord("flow");
    recordRetryAttempt(record, "network", 1, 3);
    assert.equal(record.retries.size, 0);
  });
});

describe("recordLimitViolation", () => {
  it("appends a violation message and updates limits", () => {
    const record = createEnforcementRecord("flow");
    const violation = { kind: /** @type {const} */ ("request_size"), limit: 1024, actual: 2048 };
    const updated = recordLimitViolation(record, violation);
    assert.equal(updated.violations.length, 1);
    assert.ok(updated.violations[0]?.includes("request_size"));
    assert.equal(updated.limits.requestSizeBytes, 2048);
    assert.equal(updated.limits.maxRequestSizeBytes, 1024);
  });
});

describe("formatEnforcementRecord", () => {
  it("produces a YAML-style string", () => {
    const record = createEnforcementRecord("myFlow");
    const formatted = formatEnforcementRecord(record);
    assert.ok(formatted.includes("flow: myFlow"));
    assert.ok(formatted.includes("deadline_exceeded: false"));
  });

  it("includes violations when present", () => {
    let record = createEnforcementRecord("myFlow");
    record = recordLimitViolation(record, { kind: "batch_size", limit: 100, actual: 200 });
    const formatted = formatEnforcementRecord(record);
    assert.ok(formatted.includes("violations:"));
    assert.ok(formatted.includes("batch_size"));
  });
});
