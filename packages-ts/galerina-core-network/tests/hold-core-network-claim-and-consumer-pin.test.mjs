import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  NETWORK_RUNTIME_AUDIT_CATEGORY,
  createNetworkPolicyReport,
  createNetworkReport,
  defineNetworkPolicy,
  networkPolicyReportToRuntimeAuditEvent,
  networkReportToRuntimeAuditEvent,
  refuseObservationalIdempotencyAdmission,
  validateIdempotency,
} from "../dist/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_SRC = join(ROOT, "src", "index.ts");
const WEBHOOK_SRC = join(ROOT, "src", "webhook.ts");

/** Closed RuntimeAuditCategory set copied from core-reports. Snapshot only; this package does not import core-reports. */
const CONSUMER_V1_CATEGORIES = Object.freeze([
  "effect",
  "capability",
  "boundary",
  "secret",
  "network",
  "policy",
  "denial",
  "proof",
]);

/** Pin 8bc08862 app-kernel IdempotencyStore.claim (kernel.ts:100-106). Snapshot only; this package does not import app-kernel. */
const KERNEL_CLAIM_SHAPE_PIN = Object.freeze({
  result: Object.freeze(["claimed", "duplicate"]),
  method: "claim",
  args: Object.freeze(["scope", "key", "ttlSeconds"]),
  seenDeprecated: true,
});

const policy = defineNetworkPolicy("api", {
  endpoints: [
    { direction: "outbound", protocol: "https", effect: "allow", hosts: ["api.example.com"], ports: [443] },
  ],
});
const ctx = {
  eventId: "net-hold-1",
  timestamp: "2026-10-07T12:00:00.000Z",
  runtime: { runtimeId: "rt-1", environment: "test", target: "node", processId: "proc-1" },
};

describe("L32 consumer snapshot (no core-reports import)", () => {
  it("producer category network is inside the pin-8 consumer closed set", () => {
    assert.equal(NETWORK_RUNTIME_AUDIT_CATEGORY, "network");
    assert.equal(CONSUMER_V1_CATEGORIES.includes(NETWORK_RUNTIME_AUDIT_CATEGORY), true);
    assert.equal(CONSUMER_V1_CATEGORIES.length, 8);
  });

  it("live sibling core-reports source still lists network when the monorepo tree is present", () => {
    const reportsSrc = join(ROOT, "..", "galerina-core-reports", "src", "audit", "audit-events.ts");
    assert.equal(existsSync(reportsSrc), true, "scratch clone must include sibling core-reports source");
    const live = readFileSync(reportsSrc, "utf8");
    assert.match(live, /export type RuntimeAuditCategory = .*\| "network" \|/);
    const listed = live.match(/export const RUNTIME_AUDIT_CATEGORIES[\s\S]*?Object\.freeze\(\[([^\]]+)\]/u);
    assert.notEqual(listed, null);
    const tokens = [...listed[1].matchAll(/"([a-z_]+)"/gu)].map((m) => m[1]);
    assert.deepEqual(tokens, [...CONSUMER_V1_CATEGORIES]);
  });

  it("mapped events always emit category network", () => {
    const report = createNetworkPolicyReport({
      policy,
      generatedAt: "2026-10-07T12:00:00.000Z",
      destinations: [{ name: "api", protocol: "https", host: "api.example.com", port: 443, tlsRequired: true }],
    });
    const policyEvent = networkPolicyReportToRuntimeAuditEvent(report, ctx);
    assert.equal(policyEvent.diagnostics.length, 0);
    assert.equal(policyEvent.event.category, "network");
    const net = createNetworkReport({ policy });
    const netEvent = networkReportToRuntimeAuditEvent(net, ctx);
    assert.equal(netEvent.diagnostics.length, 0);
    assert.equal(netEvent.event.category, "network");
  });
});

describe("L67 claim-shape parity (no app-kernel import)", () => {
  it("AtomicClaimResult and AtomicAdmissionStore.claim match the kernel claim snapshot", () => {
    const source = readFileSync(INDEX_SRC, "utf8");
    assert.match(source, /export type AtomicClaimResult = "claimed" \| "duplicate"/);
    const atomicStart = source.indexOf("export interface AtomicAdmissionStore");
    const atomicEnd = source.indexOf("export interface IdempotencyStore", atomicStart);
    const atomic = source.slice(atomicStart, atomicEnd);
    assert.match(atomic, /claim\(/);
    assert.match(atomic, /scope: string/);
    assert.match(atomic, /key: string/);
    assert.match(atomic, /ttlSeconds: number/);
    assert.deepEqual([...KERNEL_CLAIM_SHAPE_PIN.result], ["claimed", "duplicate"]);
    assert.equal(KERNEL_CLAIM_SHAPE_PIN.method, "claim");
    assert.deepEqual([...KERNEL_CLAIM_SHAPE_PIN.args], ["scope", "key", "ttlSeconds"]);
    assert.equal(KERNEL_CLAIM_SHAPE_PIN.seenDeprecated, true);
  });

  it("observational get/put stays record-only; admission still claim-only", async () => {
    const source = readFileSync(INDEX_SRC, "utf8");
    const idemStart = source.indexOf("export interface IdempotencyStore");
    const idemEnd = source.indexOf("export interface NetworkPolicy", idemStart);
    const idem = source.slice(idemStart, idemEnd);
    assert.match(idem, /get\(key: string\)/);
    assert.match(idem, /put\(record: IdempotencyRecord/);
    assert.equal(/claim\(/.test(idem), false);
    const webhook = readFileSync(WEBHOOK_SRC, "utf8");
    assert.match(webhook, /IdempotencyStore\.claim/);
    assert.equal(/IdempotencyStore\.seen/.test(webhook), false);
    const calls = [];
    const observational = {
      get(key) { calls.push(["get", key]); throw new Error("get must not run"); },
      put(record) { calls.push(["put", record]); throw new Error("put must not run"); },
    };
    const refused = refuseObservationalIdempotencyAdmission(observational);
    assert.deepEqual(refused.map((d) => d.code), ["Galerina_NETWORK_IDEMPOTENCY_STORE_FAILED"]);
    assert.deepEqual(calls, []);
    const seen = new Set();
    const store = {
      claim(scope, key) {
        const k = scope + "|" + key;
        if (seen.has(k)) return "duplicate";
        seen.add(k);
        return "claimed";
      },
    };
    assert.deepEqual(await validateIdempotency("hold-key-01", store), []);
    assert.deepEqual((await validateIdempotency("hold-key-01", store)).map((d) => d.code), ["Galerina_NETWORK_IDEMPOTENCY_DUPLICATE"]);
  });
});
