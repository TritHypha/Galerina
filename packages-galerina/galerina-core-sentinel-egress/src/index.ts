/**
 * `@galerina/core-sentinel-egress` (LSEG) — the governed write path for the audit
 * ledger.
 *
 * Replaces ad-hoc `fs.appendFileSync` per event (a Hardened-Border leak and a
 * ~1000x perf sink) with a fixed-capacity ring buffer feeding a batched,
 * HMAC-chained, tamper-evident flush: ONE disk write per batch.
 */
export { HardenedBorderViolation, SecurityTrap } from "./errors.js";
export { RingBuffer } from "./ring-buffer.js";
export {
  AuditEgress,
  readEgressLedger,
  type AuditBatch,
  type AuditEgressOptions,
} from "./audit-egress.js";
