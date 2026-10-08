import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  FUNGI_REPORT_CODES,
  RUNTIME_AUDIT_CATEGORIES,
  serializeAuditEvent,
  validateRuntimeAuditEvent,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = "2026-10-07T12:00:00.000Z";
const runtime = { runtimeId: "rt-1", environment: "test", target: "node", processId: "proc-1" };
const V1 = Object.freeze([
  "effect", "capability", "boundary", "secret", "network", "policy", "denial", "proof",
]);
/** docs/runtime-audit-log-schema-and-execution-proof.md section 16 list; not a v1 vocabulary. */
const DOCS_SECTION_16 = Object.freeze([
  "runtime", "execution", "effect", "capability", "denial", "fallback", "scheduler", "deployment", "health", "integrity",
]);

const event = (over = {}) => ({
  schemaVersion: "galerina.runtime.audit.v1",
  eventId: "evt-1",
  timestamp: T,
  category: "network",
  status: "denied",
  message: "Outbound call denied by policy.",
  runtime,
  ...over,
});

function walkSrc(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkSrc(p));
    else if (name.isFile()) out.push(p);
  }
  return out;
}

describe("v1 runtime audit closed set (L34 parent terms stay owner decisions)", () => {
  it("freezes exactly eight RuntimeAuditCategory tokens in documented order", () => {
    assert.equal(Object.isFrozen(RUNTIME_AUDIT_CATEGORIES), true);
    assert.deepEqual([...RUNTIME_AUDIT_CATEGORIES], [...V1]);
    assert.equal(RUNTIME_AUDIT_CATEGORIES.length, 8);
    assert.deepEqual(FUNGI_REPORT_CODES.map((e) => e.code), [
      "FUNGI-REPORT-001", "FUNGI-REPORT-002", "FUNGI-REPORT-003", "FUNGI-REPORT-004", "FUNGI-REPORT-005",
    ]);
  });

  it("admits each v1 category with deterministic JSONL", () => {
    for (const category of V1) {
      const first = serializeAuditEvent(event({ category, eventId: `evt-${category}` }));
      const second = serializeAuditEvent(event({ category, eventId: `evt-${category}` }));
      assert.equal(first, second);
      assert.equal(first.includes("\n"), false);
      const parsed = JSON.parse(first);
      assert.equal(parsed.category, category);
      assert.equal(parsed.schemaVersion, "galerina.runtime.audit.v1");
      assert.deepEqual(Object.keys(parsed).slice(0, 6), [
        "schemaVersion", "eventId", "timestamp", "category", "status", "message",
      ]);
      const hex = createHash("sha256").update(first).digest("hex");
      assert.equal(createHash("sha256").update(second).digest("hex"), hex);
    }
  });

  it("refuses docs-section-16-only categories and unknown tokens with FUNGI-REPORT-002", () => {
    const docsOnly = DOCS_SECTION_16.filter((c) => !V1.includes(c));
    assert.deepEqual(docsOnly, ["runtime", "execution", "fallback", "scheduler", "deployment", "health", "integrity"]);
    for (const category of [...docsOnly, "FUNGI-AUDIT-001", "trace", ""]) {
      const diags = validateRuntimeAuditEvent(event({ category }));
      assert.ok(diags.some((d) => d.code === "FUNGI-REPORT-002" && d.path === "category"), category);
      assert.throws(() => serializeAuditEvent(event({ category })), /FUNGI-REPORT-002/);
    }
  });

  it("refuses a traceId field; v1 has no trace-correlation key", () => {
    const diags = validateRuntimeAuditEvent(event({ traceId: "tr-1" }));
    assert.ok(diags.some((d) => d.code === "FUNGI-REPORT-002" && d.path === "traceId"));
    assert.throws(() => serializeAuditEvent(event({ traceId: "tr-1" })), /FUNGI-REPORT-002/);
  });

  it("package src does not emit FUNGI-AUDIT codes", () => {
    const files = walkSrc(join(ROOT, "src"));
    assert.ok(files.length > 0);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(text.includes("FUNGI-AUDIT"), false, file);
    }
  });
});
