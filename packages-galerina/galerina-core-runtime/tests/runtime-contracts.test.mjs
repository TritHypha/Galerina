import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createRuntimeReport,
  createRuntimeContext,
  decideRuntimeEffect,
  errorRuntimeResult,
  okRuntimeResult,
  validateRuntimeContext,
  DEFAULT_RUNTIME_EFFECT_POLICY,
} from "../dist/index.js";

describe("galerina-core-runtime contracts", () => {
  it("validates runtime context", () => {
    const diagnostics = validateRuntimeContext({
      mode: "checked",
      projectRoot: "",
      environment: "production",
      timeoutMs: 0,
    });

    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "Galerina_RUNTIME_PROJECT_ROOT_REQUIRED",
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "Galerina_RUNTIME_TIMEOUT_INVALID",
      ),
      true,
    );
    assert.equal(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "Galerina_RUNTIME_PRODUCTION_CHECKED_MODE",
      ),
      true,
    );
  });

  it("uses explicit runtime result variants", () => {
    assert.deepEqual(okRuntimeResult(42), { ok: true, value: 42 });
    assert.deepEqual(
      errorRuntimeResult({
        code: "Galerina_RUNTIME_TEST",
        safeMessage: "Test error.",
      }),
      {
        ok: false,
        error: {
          code: "Galerina_RUNTIME_TEST",
          safeMessage: "Test error.",
        },
      },
    );
  });

  it("denies network and process effects unless policy allows them", () => {
    assert.equal(
      decideRuntimeEffect({
        kind: "network",
        name: "fetch",
        resource: "api.example.com",
      }).allowed,
      false,
    );
    assert.equal(
      decideRuntimeEffect({
        kind: "process",
        name: "spawn",
        resource: "shell",
      }).allowed,
      false,
    );
  });

  it("creates runtime reports with warnings and effects", () => {
    const report = createRuntimeReport({
      context: {
        mode: "checked",
        projectRoot: ".",
        environment: "production",
      },
      durationMs: 12,
      effects: [{ kind: "clock", name: "now", resource: "system-clock" }],
    });

    assert.equal(report.mode, "checked");
    assert.equal(report.warnings.length, 1);
    assert.equal(report.effects[0]?.kind, "clock");
  });

  it("loads the checked runtime example as a valid report input", async () => {
    const example = JSON.parse(
      await readFile(
        new URL("../examples/checked-runtime-context.json", import.meta.url),
        "utf8",
      ),
    );
    const report = createRuntimeReport({
      context: example.context,
      durationMs: 10,
      effects: example.effects,
    });

    assert.equal(report.diagnostics.length, 0);
    assert.equal(report.effects[0]?.kind, "clock");
  });

  it("createRuntimeContext throws on invalid context", () => {
    assert.throws(
      () => createRuntimeContext({ mode: "checked", projectRoot: "", environment: "development" }),
      /project root/i,
    );
  });

  it("createRuntimeContext returns the context unchanged when valid", () => {
    const ctx = { mode: "compiled", projectRoot: "/app", environment: "production" };
    const result = createRuntimeContext(ctx);

    assert.equal(result.mode, "compiled");
    assert.equal(result.projectRoot, "/app");
    assert.equal(result.environment, "production");
  });

  it("DEFAULT_RUNTIME_EFFECT_POLICY allows clock and random, denies process", () => {
    assert.ok(DEFAULT_RUNTIME_EFFECT_POLICY.allowedEffects.includes("clock"));
    assert.ok(DEFAULT_RUNTIME_EFFECT_POLICY.allowedEffects.includes("random"));
    assert.equal(DEFAULT_RUNTIME_EFFECT_POLICY.denyProcessEffects, true);
    assert.equal(DEFAULT_RUNTIME_EFFECT_POLICY.requireExplicitNetworkPermission, true);
  });

  it("decideRuntimeEffect allows clock and random effects by default policy", () => {
    assert.equal(
      decideRuntimeEffect({ kind: "clock", name: "now", resource: "system-clock" }).allowed,
      true,
    );
    assert.equal(
      decideRuntimeEffect({ kind: "random", name: "uuid", resource: "crypto" }).allowed,
      true,
    );
  });

  it("decideRuntimeEffect denies filesystem effects by default", () => {
    const result = decideRuntimeEffect({ kind: "filesystem", name: "readFile", resource: "/etc/passwd" });
    assert.equal(result.allowed, false);
  });

  it("decideRuntimeEffect allows additional effects via custom policy", () => {
    const result = decideRuntimeEffect(
      { kind: "filesystem", name: "readFile", resource: "/tmp/data" },
      { allowedEffects: ["clock", "filesystem"], denyProcessEffects: true, requireExplicitNetworkPermission: true },
    );
    assert.equal(result.allowed, true);
  });

  it("createRuntimeReport includes effect list and production warning", () => {
    const report = createRuntimeReport({
      context: { mode: "checked", projectRoot: "/app", environment: "production" },
      durationMs: 50,
      effects: [
        { kind: "clock", name: "now", resource: "system-clock" },
        { kind: "database", name: "query", resource: "orders-db" },
      ],
    });

    assert.equal(report.effects.length, 2);
    assert.equal(report.effects[1]?.kind, "database");
    assert.ok(report.durationMs >= 0);
  });
});
