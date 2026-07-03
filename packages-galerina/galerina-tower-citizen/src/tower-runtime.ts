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
import { verifyPluginManifest, artifactBytesHash, type SignedPluginManifest } from "./plugin-manifest.js";
import type { AttestationPolicy } from "./bridge-attestation.js";

export type { TowerAuditEvent } from "./audit-logger.js";
export type { PluginMetadata, ExecutionResult } from "./plugin-sandbox.js";

export interface TowerConfig {
  readonly assimilationMemoryBudgetMB: number;  // from boot.fungi governance {}
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
  /**
   * RD-0236 #10: attestation policy used to verify a SIGNED plugin manifest at load(). When load() is
   * not opted out (see allowUnsignedLoad), a plugin MUST present a signedManifest that verifies against
   * this key (binding to the metadata's engineId + artifactHash) or it is refused before sandboxing.
   */
  readonly attestationPolicy?: AttestationPolicy;
  /**
   * RD-0236 #10 opt-in. load()'s signed-manifest check is DENY-BY-DEFAULT: a plugin presenting no
   * verifiable signed manifest is refused (ERR_UNVERIFIED_METADATA). Set this true to fall back to the
   * well-formed-hash floor only (the pre-follow-on behaviour) — used by the hybrid engine's own internal
   * tower, whose only load is its OWN hardcoded self-descriptor, not an external-plugin admission.
   * Hash-vs-bytes is ALWAYS enforced when artifact bytes are supplied, opt-in or not.
   */
  readonly allowUnsignedLoad?: boolean;
  /**
   * RD-0236 #10 follow-on²: the P9 certified profile FORBIDS allowUnsignedLoad. A certified tower must verify
   * a signed plugin manifest for every external load (deny-by-default) — the unsigned well-formed-hash floor
   * is not an acceptable admission bar under certification. Construction throws
   * ERR_CERTIFIED_UNSIGNED_LOAD_FORBIDDEN when both are set. (The hybrid engine's INTERNAL self-load tower is
   * a NON-certified bootstrap — it loads only its own hardcoded self-descriptor, not external plugins — so it
   * keeps the floor opt-in. Signing that self-descriptor to drop even the bootstrap exemption is coupled to
   * the committed-pubkey custody chain and tracked separately.)
   */
  readonly certified?: boolean;
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
      ...(config.attestationPolicy ? { attestationPolicy: config.attestationPolicy } : {}),
      allowUnsignedLoad: config.allowUnsignedLoad ?? false,
      certified: config.certified ?? false,
    };
    // Fail closed at construction: a certified tower cannot fall back to the unsigned-hash floor — every
    // external load must present a signed manifest that verifies (RD-0236 #10 follow-on²). Loud, not silent.
    if (this.config.certified && this.config.allowUnsignedLoad) {
      throw new Error("ERR_CERTIFIED_UNSIGNED_LOAD_FORBIDDEN: certified tower forbids allowUnsignedLoad — every external plugin load must present a signed manifest that verifies against the attestation policy");
    }
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

  async load(
    metadata: PluginMetadata,
    correlationId?: string,
    evidence?: { artifactBytes?: Uint8Array; signedManifest?: SignedPluginManifest },
  ): Promise<{ sandbox: PluginSandbox; correlationId: string; loadEvent: TowerAuditEvent }> {
    const corrId = correlationId ?? `CORR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Check assimilation budget
    if (metadata.maxMemoryMB > this.config.assimilationMemoryBudgetMB) {
      const ev = this.audit.trap(corrId, metadata.artifactHash, metadata.engineId, "BUDGET_EXCEEDED", {
        requestedMB: metadata.maxMemoryMB,
        budgetMB: this.config.assimilationMemoryBudgetMB,
      });
      throw new Error(`FUNGI-ASSIMILATE-002: Plugin exceeds assimilation_memory_budget (${metadata.maxMemoryMB}MB > ${this.config.assimilationMemoryBudgetMB}MB). AuditEvent: ${ev.eventId}`);
    }

    // Check plugin capacity
    if (this.sandboxes.size >= this.config.maxPlugins) {
      throw new Error(`FUNGI-ASSIMILATE-002: Tower at capacity (${this.config.maxPlugins} plugins). Evict a plugin first.`);
    }

    // RD-0236 #10: verify the plugin's artifact IDENTITY before it is sandboxed + executed. This
    // method's header documented a "verify artifact hash + manifest" gate that did NOT exist — metadata
    // was trusted verbatim, so a caller could load any plugin metadata unverified. Minimal fail-closed
    // floor: a load MUST carry a well-formed artifactHash (a `sha256:`-prefixed, non-empty identity) and
    // an engineId; unverifiable metadata is refused. (Full signed-manifest + hash-vs-bytes verification
    // is a follow-on that needs the signed manifest + artifact bytes plumbed into load() — RD-0236 TODO.)
    const ah = metadata.artifactHash;
    if (typeof ah !== "string" || !/^sha256:.+/.test(ah) || typeof metadata.engineId !== "string" || metadata.engineId.length === 0) {
      const ev = this.audit.trap(corrId, typeof ah === "string" && ah ? ah : "sha256:0", metadata.engineId ?? "?",
        "ERR_UNVERIFIED_METADATA", { reason: "plugin metadata lacks a well-formed artifactHash / engineId", artifactHash: ah });
      throw new Error(`FUNGI-ASSIMILATE-003: plugin metadata is unverifiable (artifactHash=${JSON.stringify(ah)}) — refusing to load (fail-closed). AuditEvent: ${ev.eventId}`);
    }

    // RD-0236 #10 follow-on: the REAL artifact verification the header always claimed (was: not implemented).
    // (a) hash-vs-bytes — ALWAYS enforced when bytes are supplied (opt-in or not): the declared artifactHash
    //     MUST equal the sha256 of the actual bytes, so a truthful-looking hash cannot cover tampered bytes.
    if (evidence?.artifactBytes !== undefined) {
      const actual = artifactBytesHash(evidence.artifactBytes);
      if (actual !== metadata.artifactHash) {
        const ev = this.audit.trap(corrId, metadata.artifactHash, metadata.engineId,
          "ERR_ARTIFACT_HASH_MISMATCH", { declared: metadata.artifactHash, actual });
        throw new Error(`FUNGI-ASSIMILATE-004: artifact bytes do not match the declared artifactHash (declared=${metadata.artifactHash}, actual=${actual}) — refusing to load (fail-closed). AuditEvent: ${ev.eventId}`);
      }
    }
    // (b) signed manifest — DENY-BY-DEFAULT: unless the deployment opts out via allowUnsignedLoad (e.g. the
    //     engine's own internal self-descriptor load), the plugin MUST present a signedManifest that verifies
    //     against the tower's attestationPolicy AND binds to THIS metadata's engineId + artifactHash (so a
    //     manifest signed for plugin A cannot admit plugin B).
    if (this.config.allowUnsignedLoad !== true) {
      if (!this.config.attestationPolicy) {
        const ev = this.audit.trap(corrId, metadata.artifactHash, metadata.engineId,
          "ERR_UNVERIFIED_METADATA", { reason: "no attestation policy configured to verify the plugin manifest (fail-secure; set allowUnsignedLoad to opt out)" });
        throw new Error(`FUNGI-ASSIMILATE-003: plugin load requires a signed manifest but no attestation policy is configured — refusing (fail-closed). AuditEvent: ${ev.eventId}`);
      }
      const res = await verifyPluginManifest(evidence?.signedManifest, this.config.attestationPolicy,
        { engineId: metadata.engineId, artifactHash: metadata.artifactHash });
      if (!res.ok) {
        const ev = this.audit.trap(corrId, metadata.artifactHash, metadata.engineId,
          "ERR_UNVERIFIED_METADATA", { reason: res.reason ?? "plugin manifest failed verification" });
        throw new Error(`FUNGI-ASSIMILATE-003: plugin manifest failed signature verification (${res.reason}) — refusing to load (fail-closed). AuditEvent: ${ev.eventId}`);
      }
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
