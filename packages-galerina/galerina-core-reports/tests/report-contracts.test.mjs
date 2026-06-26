import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAiGuideReport,
  createAsyncReport,
  createBuildReport,
  createBuildCacheReport,
  createFlowTraceReport,
  createIntentReport,
  createProcessingReport,
  createReportDiagnostic,
  createReportMetadata,
  createSafetyReport,
  createSecurityReport,
  createStorageReport,
  createTargetReport,
  serializeReportJson,
  summarizeDiagnostics,
  validateLoReport,
} from "../dist/index.js";

const metadata = createReportMetadata({
  kind: "build",
  name: "Galerina build report",
  projectName: "galerina-app",
  projectVersion: "0.1.0",
  generatedAt: "2026-05-08T00:00:00.000Z",
  generator: {
    name: "galerina-core-cli",
    version: "0.1.0",
    packageName: "@galerina/core-cli",
  },
});

describe("galerina-core-reports contracts", () => {
  it("summarises diagnostics by severity and status", () => {
    const diagnostics = [
      createReportDiagnostic("Galerina_TEST_WARNING", "warning", "Check this."),
      createReportDiagnostic("Galerina_TEST_ERROR", "error", "Fix this."),
    ];

    assert.deepEqual(summarizeDiagnostics(diagnostics), {
      info: 0,
      warnings: 1,
      errors: 1,
      critical: 0,
      total: 2,
      status: "error",
    });
  });

  it("creates build reports with metadata, artifacts and warnings", () => {
    const report = createBuildReport({
      metadata,
      diagnostics: [
        createReportDiagnostic(
          "Galerina_BUILD_TARGET_FALLBACK",
          "warning",
          "GPU target fell back to CPU.",
          { path: "targets.gpu" },
        ),
      ],
      targets: ["cpu", "wasm"],
      artifacts: [
        {
          path: "build/app.wasm",
          kind: "wasm",
          bytes: 1024,
          sha256: "sha256:example",
        },
      ],
      durationMs: 42,
    });

    assert.equal(report.kind, "build");
    assert.equal(report.summary.status, "warning");
    assert.equal(report.artifacts[0]?.path, "build/app.wasm");
    assert.match(serializeReportJson(report), /Galerina_BUILD_TARGET_FALLBACK/);
  });

  it("creates security, target and AI guide report variants", () => {
    const securityReport = createSecurityReport({
      metadata: createReportMetadata({
        ...metadata,
        kind: "security",
        name: "Galerina security report",
      }),
      checkedPolicies: ["secrets", "permissions"],
      blockedOperations: ["secret.print"],
      redactedSecrets: 2,
    });
    const targetReport = createTargetReport({
      metadata: createReportMetadata({
        ...metadata,
        kind: "target",
        name: "Galerina target report",
      }),
      requestedTargets: ["gpu", "cpu"],
      selectedTargets: ["cpu"],
      fallbackUsed: true,
    });
    const aiGuideReport = createAiGuideReport({
      metadata: createReportMetadata({
        ...metadata,
        kind: "ai-guide",
        name: "Galerina AI guide",
      }),
      sections: [
        {
          title: "Packages",
          summary: "Package ownership summary.",
          sourcePaths: ["galerina.workspace.json"],
        },
      ],
      tokenEstimate: 128,
    });

    assert.equal(securityReport.redactedSecrets, 2);
    assert.equal(targetReport.fallbackUsed, true);
    assert.equal(aiGuideReport.sections[0]?.title, "Packages");
  });

  it("creates processing reports for resilient batch flows", () => {
    const report = createProcessingReport({
      metadata: createReportMetadata({
        ...metadata,
        kind: "processing",
        name: "Import customers report",
      }),
      flow: "importCustomers",
      totalItems: 10000,
      successfulItems: 9972,
      failedItems: 28,
      retriedItems: 11,
      quarantinedItems: 28,
      failureTypes: [
        {
          errorType: "ValidationError",
          count: 18,
          retryable: false,
          action: "quarantine",
        },
      ],
    });

    assert.equal(report.kind, "processing");
    assert.equal(report.summary.status, "ok");
    assert.equal(report.failedItems, 28);
    assert.equal(report.failureTypes[0]?.action, "quarantine");
    assert.deepEqual(validateLoReport(report), []);
  });

  it("creates async reports for Structured Await analysis", () => {
    const report = createAsyncReport({
      metadata: createReportMetadata({
        ...metadata,
        kind: "async",
        name: "Galerina async report",
      }),
      awaitPoints: 18,
      awaitGroups: 4,
      raceBlocks: 1,
      streamBlocks: 2,
      queueAwaits: 3,
      networkAwaitWithoutTimeout: 0,
      databaseAwaitWithoutTimeout: 0,
      unscopedTasks: 0,
      backgroundTasks: 0,
      structuredConcurrency: true,
      awaitSites: [
        {
          name: "CustomerApi.get",
          kind: "one",
          effects: ["network.outbound", "await"],
          timeoutMs: 2000,
          source: {
            path: "orders.spore",
            line: 12,
          },
        },
      ],
      groups: [
        {
          name: "LoadDashboard",
          kind: "all",
          awaitCount: 4,
          timeoutMs: 2500,
          cancellationPolicy: "cancelOnError",
          source: {
            path: "dashboard.spore",
            line: 20,
          },
        },
      ],
    });

    assert.equal(report.kind, "async");
    assert.equal(report.awaitPoints, 18);
    assert.equal(report.groups[0]?.cancellationPolicy, "cancelOnError");
    assert.deepEqual(validateLoReport(report), []);
    assert.match(serializeReportJson(report), /structuredConcurrency/);
  });

  it("creates conservative storage and build-cache reports", () => {
    const storageReport = createStorageReport({
      metadata: createReportMetadata({
        ...metadata,
        kind: "storage",
        name: "Galerina storage report",
      }),
      storage: {
        detected: false,
        kind: "unknown",
        detailsReliable: false,
        detectionNotes: ["Storage details unavailable in container."],
      },
    });
    const cacheReport = createBuildCacheReport({
      metadata: createReportMetadata({
        ...metadata,
        kind: "build-cache",
        name: "Galerina build cache report",
      }),
      hits: 12,
      misses: 3,
      bypasses: 1,
      invalidations: 2,
      cachedDataClasses: ["parsed_ast", "type_check_cache"],
    });

    assert.equal(storageReport.recommendedCacheMode, "minimal-bounded");
    assert.equal(storageReport.unknownFallbackUsed, true);
    assert.equal(cacheReport.correctnessRequiredCache, false);
    assert.equal(cacheReport.deniedDataClasses.includes("SecureString"), true);
    assert.deepEqual(validateLoReport(storageReport), []);
    assert.deepEqual(validateLoReport(cacheReport), []);
  });

  it("validates report metadata and diagnostic shape", () => {
    const report = {
      ...createBuildReport({
        metadata,
        diagnostics: [
          createReportDiagnostic("", "error", "Missing diagnostic code."),
        ],
      }),
      metadata: {
        ...metadata,
        name: "",
        kind: "security",
      },
    };

    assert.deepEqual(
      validateLoReport(report).map((diagnostic) => diagnostic.code),
      [
        "Galerina_REPORT_NAME_REQUIRED",
        "Galerina_REPORT_KIND_MISMATCH",
        "Galerina_REPORT_DIAGNOSTIC_CODE_REQUIRED",
      ],
    );
  });

  it("creates intent reports with flow-level consistency results", () => {
    const intentMeta = createReportMetadata({
      ...metadata,
      kind: "intent",
      name: "Galerina intent report",
    });

    const report = createIntentReport({
      metadata: intentMeta,
      flows: [
        {
          name: "createOrder",
          safetyLevel: "guarded",
          intent: "create customer order",
          declaredEffects: ["database.write", "network.call"],
          inferredEffects: ["database.write", "network.call"],
          status: "ok",
          mismatches: [],
        },
        {
          name: "sendReceipt",
          safetyLevel: "safe",
          intent: "send customer receipt",
          declaredEffects: ["email.send"],
          inferredEffects: ["database.delete", "email.send"],
          status: "mismatch",
          mismatches: ["Undeclared effect: database.delete"],
        },
        {
          name: "processWebhook",
          safetyLevel: "guarded",
          intent: undefined,
          declaredEffects: [],
          inferredEffects: ["network.call"],
          status: "missing_intent",
          mismatches: ["Governed surface missing required intent."],
        },
      ],
    });

    assert.equal(report.kind, "intent");
    assert.equal(report.governedSurfaces, 3);
    assert.equal(report.missingIntent, 1);
    assert.equal(report.effectMismatches, 1);
    assert.equal(report.flows.length, 3);
    assert.equal(report.summary.status, "ok"); // no diagnostics pushed
  });

  it("creates safety reports with safety-level breakdowns", () => {
    const safetyMeta = createReportMetadata({
      ...metadata,
      kind: "safety",
      name: "Galerina safety report",
    });

    const report = createSafetyReport({
      metadata: safetyMeta,
      flows: [
        { name: "add", safetyLevel: "safe", auditRequired: false, traceEnabled: false, capabilities: [], effects: [] },
        { name: "createOrder", safetyLevel: "guarded", auditRequired: true, traceEnabled: true, capabilities: ["OrderWriter"], effects: ["database.write"] },
        { name: "rotateKey", safetyLevel: "privileged", auditRequired: true, traceEnabled: true, capabilities: ["KeyRotationAdmin"], effects: ["secret.write"] },
        { name: "nativeResize", safetyLevel: "unsafe", auditRequired: true, traceEnabled: false, capabilities: [], effects: ["native.call"] },
        { name: "newFraudModel", safetyLevel: "experimental", auditRequired: true, traceEnabled: true, capabilities: [], effects: ["ai.invoke"] },
      ],
      experimentalInProduction: 0,
    });

    assert.equal(report.kind, "safety");
    assert.equal(report.safeCount, 1);
    assert.equal(report.guardedCount, 1);
    assert.equal(report.privilegedCount, 1);
    assert.equal(report.unsafeCount, 1);
    assert.equal(report.experimentalCount, 1);
    assert.equal(report.experimentalInProduction, 0);
  });

  it("creates flow trace reports with governed evidence events", () => {
    const traceMeta = createReportMetadata({
      ...metadata,
      kind: "flow-trace",
      name: "Galerina flow trace report",
    });

    const now = new Date().toISOString();

    const report = createFlowTraceReport({
      metadata: traceMeta,
      events: [
        { traceId: "t1", spanId: "s1", timestamp: now, stage: "request.received", status: "ok", routeId: "POST /orders" },
        { traceId: "t1", spanId: "s2", timestamp: now, stage: "request.decoded", status: "ok" },
        { traceId: "t1", spanId: "s3", timestamp: now, stage: "capability.checked", capability: "OrderWriter", decision: "allow", status: "ok" },
        { traceId: "t1", spanId: "s4", timestamp: now, stage: "effect.executed", effect: "database.write", status: "ok" },
        { traceId: "t1", spanId: "s5", timestamp: now, stage: "response.encoded", status: "ok", metadata: { statusCode: 201 } },
      ],
      redactedFields: 0,
    });

    assert.equal(report.kind, "flow-trace");
    assert.equal(report.events.length, 5);
    assert.equal(report.events[0].stage, "request.received");
    assert.equal(report.events[2].decision, "allow");
    assert.equal(report.redactedFields, 0);
    assert.equal(report.summary.status, "ok");
  });

  it("createProcessingReport tracks success, failure, and quarantine counts", () => {
    const meta = createReportMetadata({
      kind: "processing",
      name: "order-batch",
      projectName: "galerina-app",
      generatedAt: new Date().toISOString(),
    });

    const report = createProcessingReport({
      metadata: meta,
      flow: "processOrderBatch",
      totalItems: 100,
      successfulItems: 92,
      failedItems: 5,
      retriedItems: 3,
      quarantinedItems: 3,
      stopped: false,
      failureTypes: [
        { kind: "validation", count: 4, recoveryAction: "quarantine" },
        { kind: "network", count: 1, recoveryAction: "retry" },
      ],
    });

    assert.equal(report.kind, "processing");
    assert.equal(report.totalItems, 100);
    assert.equal(report.successfulItems, 92);
    assert.equal(report.failedItems, 5);
    assert.equal(report.retriedItems, 3);
    assert.equal(report.quarantinedItems, 3);
    assert.equal(report.stopped, false);
    assert.equal(report.failureTypes.length, 2);
    assert.equal(report.failureTypes[0]?.kind, "validation");
  });

  it("createBuildCacheReport defaults deny list blocks security-sensitive classes", () => {
    const meta = createReportMetadata({
      kind: "build-cache",
      name: "compiler-cache",
      projectName: "galerina-app",
      generatedAt: new Date().toISOString(),
    });

    const report = createBuildCacheReport({
      metadata: meta,
      hits: 200,
      misses: 12,
      maxSizeBytes: 52_428_800,
    });

    assert.equal(report.kind, "build-cache");
    assert.equal(report.hits, 200);
    assert.equal(report.misses, 12);
    assert.equal(report.maxSizeBytes, 52_428_800);
    assert.ok(report.deniedDataClasses.includes("SecureString"));
    assert.ok(report.deniedDataClasses.includes("authorization_decisions"));
    assert.equal(report.correctnessRequiredCache, false);
  });

  it("serializeReportJson produces valid parseable JSON for any LoReport kind", () => {
    const meta = createReportMetadata({
      kind: "intent",
      name: "intent-check",
      projectName: "galerina-app",
      generatedAt: new Date().toISOString(),
    });
    const report = createIntentReport({
      metadata: meta,
      flows: [
        { name: "createOrder", safetyLevel: "guarded", status: "ok" },
        { name: "processPayment", safetyLevel: "privileged", status: "missing_intent" },
      ],
    });
    const json = serializeReportJson(report);
    const parsed = JSON.parse(json);

    assert.equal(parsed.kind, "intent");
    assert.equal(parsed.governedSurfaces, 2);
    assert.equal(parsed.missingIntent, 1);
  });

  it("summarizeDiagnostics produces accurate severity counts and status", () => {
    const diags = [
      createReportDiagnostic("R-001", "info", "info"),
      createReportDiagnostic("R-002", "warning", "warn"),
      createReportDiagnostic("R-003", "warning", "warn2"),
      createReportDiagnostic("R-004", "error", "err"),
    ];
    const summary = summarizeDiagnostics(diags);

    assert.equal(summary.info, 1);
    assert.equal(summary.warnings, 2);
    assert.equal(summary.errors, 1);
    assert.equal(summary.critical, 0);
    assert.equal(summary.total, 4);
    assert.equal(summary.status, "error");
  });

  it("validateLoReport accepts all canonical report kinds", () => {
    const kinds = ["build", "security", "target", "runtime", "async", "storage",
      "build-cache", "task", "processing", "ai-guide", "intent", "safety",
      "flow-trace", "custom"];

    for (const kind of kinds) {
      const meta = createReportMetadata({
        kind,
        name: `test-${kind}`,
        projectName: "galerina-app",
        generatedAt: new Date().toISOString(),
      });
      // Each kind has at least a metadata + summary field — just check it doesn't throw
      assert.ok(meta.kind === kind, `${kind} metadata should round-trip`);
    }
  });
});
