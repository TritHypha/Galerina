/**
 * @galerina/core-sentinel-io (LSIO) — Sentinel I/O.
 *
 * Deterministic, governed, manifest-driven zero-copy data ingestion for the
 * Governed Tower. Pure TypeScript over `ArrayBuffer` / `SharedArrayBuffer`
 * (WASM-linear-memory-compatible) with HMAC-SHA256 / SHA-256 integrity at a
 * hardened border. Citizen Protocol v1.1.
 *
 * Pipeline:
 *   buildManifest / ManifestLoader  →  IntegrityMonitor (gate)  →  ZeroCopyMapper
 * fed by a PhotonicBusInterface ingest source (LocalDiskBus today).
 */

export { HardenedBorderViolation, SecurityTrap } from "./errors.js";

export {
  ManifestLoader,
  buildManifest,
  type IoBlock,
  type IoManifest,
} from "./manifest.js";

export {
  IntegrityMonitor,
  type IntegrityResult,
} from "./integrity-monitor.js";

export {
  ZeroCopyMapper,
  type MappedBlock,
} from "./zero-copy-mapper.js";

export {
  PhotonicBusInterface,
  LocalDiskBus,
  PhotonicBus,
  type IngestSourceKind,
} from "./photonic-bus-interface.js";
