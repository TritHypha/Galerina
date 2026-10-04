/**
 * AuditLogger — structured sidecar log channel for Tower executions
 *
 * Implements the LOAD→EXEC→ERASE breadcrumb pattern.
 * Every Tower action produces a structured AuditEvent referencing the artifact hash.
 *
 * Aligns with: CBOR Tag 410 AuditEvent schema (galerina-governed-tower-specification.md §3E)
 */

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface TowerAuditEvent {
  readonly eventId:       string;   // unique per event: "EVT-{timestamp}-{seq}"
  readonly timestamp:     string;   // ISO 8601 UTC
  readonly phase:         "LOAD" | "EXEC" | "ERASE" | "TRAP" | "VIOLATION";
  readonly correlationId: string;   // flows through entire lifecycle
  readonly artifactHash:  string;   // sha256 of the .wasm/.lnb artifact
  readonly engineId:      string;   // "bitnet-cpu", "groq-cloud", "nvfp4", "galerina"
  readonly severity:      "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  readonly category:      "LIFECYCLE" | "RUNTIME_VIOLATION" | "GOVERNANCE_DENIED" | "AUDIT_TRAIL" | "RESOURCE_LIMIT";
  readonly details:       Record<string, unknown>;
  readonly governancePass: boolean;
  /** Deterministic Logical Tick (from LST/Sentinel-Time) when a tick source is wired.
   *  Cycle-indexed timing that is replayable regardless of OS clock jitter. */
  readonly logicalTick?:  number;
}

/** A governed egress sink (e.g. Sentinel-Egress AuditEgress). The AuditLogger pushes
 *  serialized records here instead of calling appendFileSync directly, so all ledger
 *  writes pass through the Hardened Border's batched, tamper-evident write path. */
export interface EgressSink {
  push(record: string): void;
  flush(): unknown;
}

export interface AuditFilter {
  correlationId?: string;
  phase?: TowerAuditEvent["phase"];
  severity?: TowerAuditEvent["severity"];
  since?: string; // ISO timestamp
  limit?: number;
}

export interface AuditLoggerOptions {
  /**
   * Batched-async durable mode. When > 0, events buffer in memory and flush to
   * disk in BATCHES of this size (one `appendFileSync` per N events instead of
   * one per event). Durable, but a crash can lose up to `batchSize - 1` unflushed
   * events. Eliminates the per-event disk jitter that breaks constant-time flight.
   * Ignored in in-memory mode (logDir === null) or when an egress sink is set.
   */
  readonly batchSize?: number;
  /**
   * Deterministic Logical Tick source (Sentinel-Time). When set, each event is
   * stamped with `logicalTick = tickSource()` — cycle-indexed timing replayable
   * regardless of OS clock drift.
   */
  readonly tickSource?: () => number;
  /**
   * Governed egress sink (Sentinel-Egress). When set, the logger pushes serialized
   * events to this sink instead of calling appendFileSync — ALL ledger writes go
   * through the Hardened Border's batched, HMAC-chained, tamper-evident path.
   * Takes precedence over batchSize/disk.
   */
  readonly egress?: EgressSink;
}

const LEDGER_PHASES: ReadonlySet<string> = new Set(["LOAD", "EXEC", "ERASE", "TRAP", "VIOLATION"]);
const LEDGER_SEVERITIES: ReadonlySet<string> = new Set(["INFO", "WARNING", "ERROR", "CRITICAL"]);
const LEDGER_CATEGORIES: ReadonlySet<string> = new Set(["LIFECYCLE", "RUNTIME_VIOLATION", "GOVERNANCE_DENIED", "AUDIT_TRAIL", "RESOURCE_LIMIT"]);

function ledgerCorrupt(lineNo: number, why: string): Error {
  return new Error(`ERR_AUDIT_LEDGER_CORRUPT: ledger row ${lineNo} ${why}; refusing to replay a ledger with a dropped or forged row`);
}

/** Decode one persisted JSONL row into a TowerAuditEvent, or throw ERR_AUDIT_LEDGER_CORRUPT. */
function decodeLedgerRow(line: string, lineNo: number): TowerAuditEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    throw ledgerCorrupt(lineNo, "is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw ledgerCorrupt(lineNo, "is not a JSON object");
  const r = raw as Record<string, unknown>;
  for (const k of ["eventId", "timestamp", "correlationId", "artifactHash", "engineId"]) {
    if (typeof r[k] !== "string") throw ledgerCorrupt(lineNo, `has a missing or non-string '${k}'`);
  }
  if (typeof r.phase !== "string" || !LEDGER_PHASES.has(r.phase)) throw ledgerCorrupt(lineNo, "has an unknown phase");
  if (typeof r.severity !== "string" || !LEDGER_SEVERITIES.has(r.severity)) throw ledgerCorrupt(lineNo, "has an unknown severity");
  if (typeof r.category !== "string" || !LEDGER_CATEGORIES.has(r.category)) throw ledgerCorrupt(lineNo, "has an unknown category");
  if (typeof r.governancePass !== "boolean") throw ledgerCorrupt(lineNo, "has a non-boolean governancePass");
  if (typeof r.details !== "object" || r.details === null || Array.isArray(r.details)) throw ledgerCorrupt(lineNo, "has non-object details");
  if ("logicalTick" in r && !(typeof r.logicalTick === "number" && Number.isFinite(r.logicalTick))) {
    throw ledgerCorrupt(lineNo, "has a non-finite logicalTick");
  }
  return r as unknown as TowerAuditEvent;
}

export class AuditLogger {
  private readonly logPath: string | null;
  private readonly inMemory: boolean;
  private readonly batchSize: number;
  private readonly tickSource: (() => number) | null;
  private readonly egress: EgressSink | null;
  private readonly mem: TowerAuditEvent[] = [];
  private buffer: string[] = []; // pending unflushed lines (batched mode)
  private seq = 0;

  /**
   * @param logDir  Directory for the append-only JSONL ledger (default, persistent).
   *                Pass `null` for IN-MEMORY mode: events are held in memory only,
   *                no disk writes. Use for ephemeral / high-throughput / benchmark
   *                contexts where the persistent ledger is not required. In-memory
   *                mode also makes `query()` O(n) instead of re-reading the file.
   * @param opts    { batchSize } enables batched-async durable mode (see above).
   */
  constructor(logDir: string | null = "build/audit-log", opts: AuditLoggerOptions = {}) {
    this.batchSize = opts.batchSize && opts.batchSize > 0 ? Math.floor(opts.batchSize) : 0;
    this.tickSource = opts.tickSource ?? null;
    this.egress = opts.egress ?? null;
    if (logDir === null) {
      this.inMemory = true;
      this.logPath = null;
    } else {
      this.inMemory = false;
      mkdirSync(logDir, { recursive: true });
      this.logPath = join(logDir, "tower-citizen-audit.jsonl");
    }
  }

  append(event: Omit<TowerAuditEvent, "eventId" | "timestamp">): TowerAuditEvent {
    const full: TowerAuditEvent = {
      ...event,
      eventId: `EVT-${Date.now()}-${++this.seq}`,
      timestamp: new Date().toISOString(),
      // Stamp the deterministic Logical Tick (Sentinel-Time) when wired.
      ...(this.tickSource ? { logicalTick: this.tickSource() } : {}),
    };
    this.mem.push(full); // always keep in memory for O(n) query
    if (this.egress) {
      // Governed egress (Sentinel-Egress): all ledger writes pass through the
      // batched, HMAC-chained, tamper-evident sink — no direct appendFileSync.
      this.egress.push(JSON.stringify(full));
    } else if (this.inMemory) {
      // nothing more — in-memory only
    } else if (this.batchSize > 0) {
      this.buffer.push(JSON.stringify(full) + "\n");
      if (this.buffer.length >= this.batchSize) this.flush();
    } else {
      appendFileSync(this.logPath!, JSON.stringify(full) + "\n");
    }
    return full;
  }

  /** Force any buffered events to durable storage. Flushes the egress sink (if any)
   *  and the batched disk buffer. Call at flush points and on graceful shutdown. */
  flush(): void {
    if (this.egress) this.egress.flush();
    if (this.buffer.length === 0 || this.logPath === null) return;
    appendFileSync(this.logPath, this.buffer.join(""));
    this.buffer = [];
  }

  /** Number of events buffered but not yet flushed to disk (batched mode). */
  pendingCount(): number { return this.buffer.length; }

  load(correlationId: string, artifactHash: string, engineId: string): TowerAuditEvent {
    return this.append({
      phase: "LOAD", correlationId, artifactHash, engineId,
      severity: "INFO", category: "LIFECYCLE",
      details: { action: "artifact_loaded" },
      governancePass: true,
    });
  }

  exec(correlationId: string, artifactHash: string, engineId: string, inputHash: string): TowerAuditEvent {
    return this.append({
      phase: "EXEC", correlationId, artifactHash, engineId,
      severity: "INFO", category: "LIFECYCLE",
      details: { inputHash, action: "execution_started" },
      governancePass: true,
    });
  }

  trap(correlationId: string, artifactHash: string, engineId: string, violation: string, details: Record<string, unknown>): TowerAuditEvent {
    return this.append({
      phase: "TRAP", correlationId, artifactHash, engineId,
      severity: "ERROR", category: "RUNTIME_VIOLATION",
      // Logger-owned fields are written LAST so caller-supplied details can never rename, blank or
      // forge the recorded violation / rollbackStatus (zero-trust default, owner may revisit).
      details: { ...details, violation, rollbackStatus: "clean" },
      governancePass: false,
    });
  }

  erase(correlationId: string, artifactHash: string, engineId: string, success: boolean, outputHash?: string): TowerAuditEvent {
    return this.append({
      phase: "ERASE", correlationId, artifactHash, engineId,
      severity: success ? "INFO" : "WARNING", category: "LIFECYCLE",
      details: { success, outputHash, action: "sandbox_erased" },
      governancePass: success,
    });
  }

  /**
   * Query the ledger. A persistent ledger is replayed from disk and every non-empty row must decode
   * to a well-formed audit event; a corrupt, torn or forged row throws `ERR_AUDIT_LEDGER_CORRUPT`
   * instead of being silently dropped (zero-trust default, owner may revisit: a dropped row is
   * indistinguishable from a deleted one, so the reader fails closed rather than return a shorter,
   * clean-looking history). Recovery or quarantine of a damaged ledger is an explicit operator step.
   */
  query(filter: AuditFilter = {}): TowerAuditEvent[] {
    let events: TowerAuditEvent[];
    if (this.inMemory || this.batchSize > 0 || this.egress) {
      events = this.mem.slice();
    } else {
      if (!existsSync(this.logPath!)) return [];
      const lines = readFileSync(this.logPath!, "utf-8").split(/\r?\n/);
      events = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === "") continue;
        events.push(decodeLedgerRow(lines[i], i + 1)); // perf-allow: loop-json-parse — audit-ledger replay; each line is distinct
      }
    }
    if (filter.correlationId) events = events.filter(e => e.correlationId === filter.correlationId);
    if (filter.phase) events = events.filter(e => e.phase === filter.phase);
    if (filter.severity) events = events.filter(e => e.severity === filter.severity);
    if (filter.since) events = events.filter(e => e.timestamp >= filter.since!);
    if (filter.limit) events = events.slice(-filter.limit);
    return events;
  }

  /**
   * Log a TPL (Ternary Photonic Logic) state transition.
   *
   * Every virtual photonic gate trigger is captured here with its correlation ID,
   * so the reasoning for each ternary state change is immutable and queryable.
   * Audit is recorded at the vector/operation level (not per-bit) to avoid
   * overwhelming the ledger — see TPL Standard v1.0 §3.
   */
  logTransition(t: {
    correlationId: string;
    artifactHash?: string;
    engineId?: string;
    fromState: number;   // -1 | 0 | 1
    toState: number;     // -1 | 0 | 1
    operation: string;   // "TMAC" | "GATE_COMMIT" | "GATE_HOLD" | ...
    authorized?: boolean;
  }): TowerAuditEvent {
    return this.append({
      phase: "EXEC",
      correlationId: t.correlationId,
      artifactHash: t.artifactHash ?? "sha256:tpl-vpp",
      engineId: t.engineId ?? "galerina-tpl-vpp",
      severity: "INFO",
      category: "AUDIT_TRAIL",
      details: {
        action: "tpl_transition",
        fromState: t.fromState,
        toState: t.toState,
        operation: t.operation,
      },
      governancePass: t.authorized ?? true,
    });
  }

  /** Return the LOAD→EXEC→ERASE lifecycle for a correlationId */
  getLifecycle(correlationId: string): { complete: boolean; phases: TowerAuditEvent["phase"][]; violations: string[] } {
    const events = this.query({ correlationId });
    const phases = events.map(e => e.phase);
    const violations = events.filter(e => e.phase === "TRAP" || e.phase === "VIOLATION").map(e => String(e.details["violation"] ?? "unknown"));
    return {
      complete: phases.includes("LOAD") && phases.includes("ERASE"),
      phases,
      violations,
    };
  }
}
