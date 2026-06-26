/**
 * TowerRuntime — the core Tower Citizen class
 *
 * Manages the Load/Execute/Erase lifecycle for governed AI inference plugins.
 * Every action produces a structured AuditEvent in the Tower log.
 *
 * Architecture:
 *   Load:    Verify artifact hash + manifest → create sandbox
 *   Execute: Schema validate → dispatch to engine → capture AuditEvent
 *   Erase:   Clear sandbox state → write completion to audit trail
 */

import { AuditLogger, TowerAuditEvent, type AuditLoggerOptions, type EgressSink } from "./audit-logger.js";
import { PluginSandbox, ExecutionResult, PluginMetadata } from "./plugin-sandbox.js";

export type { TowerAuditEvent } from "./audit-logger.js";
export type { PluginMetadata, ExecutionResult } from "./plugin-sandbox.js";

export interface TowerConfig {
  readonly assimilationMemoryBudgetMB: number;  // from boot.spore governance {}
  readonly auditDepth: "minimal" | "standard" | "full";
  readonly maxPlugins: number;
  /** In-memory audit ledger (no disk writes). For ephemeral / benchmark contexts. */
  readonly auditInMemory: boolean;
  /** Batched-async durable audit: flush every N events (one disk write per batch).
   *  0 = per-event sync (default). Eliminates per-event jitter for constant-time flight. */
  readonly auditBatchSize: number;
  /** Deterministic Logical Tick source (Sentinel-Time) for cycle-indexed audit timing. */
  readonly auditTickSource?: () => number;
  /** Governed egress sink (Sentinel-Egress) — all ledger writes pass through it. */
  readonly auditEgress?: EgressSink;
}

export class TowerRuntime {
  private readonly config: TowerConfig;
  private readonly audit: AuditLogger;
  private readonly sandboxes = new Map<string, PluginSandbox>();

  constructor(config: Partial<TowerConfig> = {}) {
    this.config = {
      assimilationMemoryBudgetMB: config.assimilationMemoryBudgetMB ?? 256,
      auditDepth: config.auditDepth ?? "full",
      maxPlugins: config.maxPlugins ?? 8,
      auditInMemory: config.auditInMemory ?? false,
      auditBatchSize: config.auditBatchSize ?? 0,
      ...(config.auditTickSource ? { auditTickSource: config.auditTickSource } : {}),
      ...(config.auditEgress ? { auditEgress: config.auditEgress } : {}),
    };
    const auditOpts: AuditLoggerOptions = {
      batchSize: this.config.auditBatchSize,
      ...(config.auditTickSource ? { tickSource: config.auditTickSource } : {}),
      ...(config.auditEgress ? { egress: config.auditEgress } : {}),
    };
    this.audit = this.config.auditInMemory
      ? new AuditLogger(null, auditOpts)
      : new AuditLogger(undefined, auditOpts);
  }

  // ── LOAD ──────────────────────────────────────────────────────────────────

  async load(metadata: PluginMetadata, correlationId?: string): Promise<{ sandbox: PluginSandbox; correlationId: string; loadEvent: TowerAuditEvent }> {
    const corrId = correlationId ?? `CORR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Check assimilation budget
    if (metadata.maxMemoryMB > this.config.assimilationMemoryBudgetMB) {
      const ev = this.audit.trap(corrId, metadata.artifactHash, metadata.engineId, "BUDGET_EXCEEDED", {
        requestedMB: metadata.maxMemoryMB,
        budgetMB: this.config.assimilationMemoryBudgetMB,
      });
      throw new Error(`SPORE-ASSIMILATE-002: Plugin exceeds assimilation_memory_budget (${metadata.maxMemoryMB}MB > ${this.config.assimilationMemoryBudgetMB}MB). AuditEvent: ${ev.eventId}`);
    }

    // Check plugin capacity
    if (this.sandboxes.size >= this.config.maxPlugins) {
      throw new Error(`SPORE-ASSIMILATE-002: Tower at capacity (${this.config.maxPlugins} plugins). Evict a plugin first.`);
    }

    const sandbox = new PluginSandbox(metadata);
    this.sandboxes.set(corrId, sandbox);
    const loadEvent = this.audit.load(corrId, metadata.artifactHash, metadata.engineId);

    return { sandbox, correlationId: corrId, loadEvent };
  }

  // ── EXECUTE ───────────────────────────────────────────────────────────────

  async execute(sandbox: PluginSandbox, input: unknown, correlationId: string): Promise<ExecutionResult> {
    if (sandbox.isErased()) throw new Error("SANDBOX_ERASED: Cannot execute an erased sandbox");

    const inputHash = PluginSandbox.hashValue(input);
    const { artifactHash, engineId } = sandbox.metadata;

    // SANITIZE & INTERROGATE — schema validation before execution
    const validation = sandbox.validate(input);
    if (!validation.valid) {
      const trapCode = `ERR_SCHEMA_${validation.violations[0]}`;
      this.audit.trap(correlationId, artifactHash, engineId, trapCode, { violations: validation.violations, inputHash });
      return { success: false, outputHash: "sha256:0", latencyMs: 0, trapFired: true, trapCode, correlationId };
    }

    this.audit.exec(correlationId, artifactHash, engineId, inputHash);
    const t0 = Date.now();

    // Dispatch to engine (Phase 1: stub — real dispatch in galerina-ext-bridge-*)
    // The actual engine call happens via the assimilated plugin interface
    const latencyMs = Date.now() - t0;
    const outputHash = PluginSandbox.hashValue({ input, engineId, timestamp: Date.now() });

    return { success: true, outputHash, latencyMs, trapFired: false, correlationId };
  }

  // ── ERASE ─────────────────────────────────────────────────────────────────

  async erase(sandbox: PluginSandbox, correlationId: string, result?: ExecutionResult): Promise<void> {
    sandbox.erase();
    this.sandboxes.delete(correlationId);
    this.audit.erase(correlationId, sandbox.metadata.artifactHash, sandbox.metadata.engineId, result?.success ?? true, result?.outputHash);
  }

  // ── EVICT ─────────────────────────────────────────────────────────────────

  evict(correlationId: string): boolean {
    const sandbox = this.sandboxes.get(correlationId);
    if (!sandbox) return false;
    sandbox.erase();
    this.sandboxes.delete(correlationId);
    this.audit.append({
      phase: "ERASE", correlationId,
      artifactHash: sandbox.metadata.artifactHash,
      engineId: sandbox.metadata.engineId,
      severity: "WARNING", category: "LIFECYCLE",
      details: { action: "explicit_evict", reason: "Tower.evict() called" },
      governancePass: true,
    });
    return true;
  }

  /** Get audit trail for a specific correlationId */
  getLifecycle(correlationId: string) { return this.audit.getLifecycle(correlationId); }
  getAudit() { return this.audit; }
  getActiveSandboxCount() { return this.sandboxes.size; }
}
