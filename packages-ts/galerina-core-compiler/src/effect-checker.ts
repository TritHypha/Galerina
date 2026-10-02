// =============================================================================
// Galerina Phase 5 — Effect Checker
//
// Validates that effects declared on flows are consistent with their content.
// Spec: ../ZTF-Knowledge-Bases/effect-checker-and-boundary-checker.md
//
// Diagnostic codes: FUNGI-EFFECT-001..004 (compiler-diagnostics.md)
// =============================================================================

import { type AstNode, type ParseDiagnostic, type FlowMeta, type SourceLocation } from "./parser.js";
import { decodeFlowDecl, isFlowDeclNamed } from "./flow-name.js";
import { buildCallGraph, topoSort, detectCycle } from "@galerina/devtools-graph-algorithms";
import { effectsToFlags, type EffectFlagsMask, EffectCheckerFlags, type EffectCheckerFlagsMask } from "./type-registry.js";
import { getStdlibRequiredEffects, getStdlibModuleKind } from "./stdlib-registry.js";
import { FUNGI_REQUIREMENT_003 } from "./requirement-diagnostics.js";

// ---------------------------------------------------------------------------
// FlowEffectSummary — per-flow effect inference summary
// ---------------------------------------------------------------------------

export interface FlowEffectSummary {
  readonly flowName: string;
  readonly declaredEffects: readonly string[];
  readonly inferredEffects: readonly string[];
  readonly missingEffects: readonly string[];
  readonly extraEffects?: readonly string[];  // future: declared but not inferred
  /**
   * Bitset representation of declaredEffects for fast subset checks.
   * Use effectsSubset(required, declaredEffectsMask) for O(1) checking.
   * Phase 18E: populated by buildFlowEffectSummary().
   */
  readonly declaredEffectsMask: EffectFlagsMask;
  readonly inferredEffectsMask: EffectFlagsMask;
  readonly missingEffectsMask: EffectFlagsMask;
  /**
   * Effect-checker-proven properties for this flow.
   * PureComputeCandidate, ParallelSafe, KernelFusionCandidate, etc.
   * @see EffectCheckerFlags
   */
  readonly checkerFlags: EffectCheckerFlagsMask;
}

// ---------------------------------------------------------------------------
// EFFECT_REGISTRY — centralized operation → canonical-effect mapping
// ---------------------------------------------------------------------------

export const EFFECT_REGISTRY: Readonly<Record<string, readonly string[]>> = {
  // Database
  "database.find": ["database.read"],
  "database.get": ["database.read"],
  "database.select": ["database.read"],
  "database.query": ["database.read"],
  "database.insert": ["database.write"],
  "database.update": ["database.write"],
  "database.delete": ["database.write"],
  "database.upsert": ["database.write"],

  // Cache
  "cache.get": ["cache.read"],
  "cache.set": ["cache.write"],
  "cache.delete": ["cache.write"],

  // Network
  "http.get": ["network.outbound"],
  "http.post": ["network.outbound"],
  "http.put": ["network.outbound"],
  "http.patch": ["network.outbound"],
  "http.delete": ["network.outbound"],
  "https.get": ["network.outbound"],
  "https.post": ["network.outbound"],
  "https.put": ["network.outbound"],
  "https.patch": ["network.outbound"],
  "https.delete": ["network.outbound"],

  // Audit
  "AuditLog.write": ["audit.write"],
  "audit.write": ["audit.write"],
  "audit.log": ["audit.write"],

  // Filesystem
  "fs.read": ["storage.read"],
  "fs.readText": ["storage.read"],
  "fs.readBytes": ["storage.read"],
  "fs.write": ["storage.write"],
  "fs.writeText": ["storage.write"],
  "fs.writeBytes": ["storage.write"],
  "File.readText": ["storage.read"],
  "File.readBytes": ["storage.read"],

  // AI / inference
  "ai.inference": ["ai.inference"],
  "Model.run": ["ai.inference"],
  "Classifier.classify": ["ai.inference"],
  // RD-0364 governed inference bridge contract: granular per-call and model-load effects.
  "inference.invoke": ["inference.invoke"],
  "inference.load":   ["inference.load"],
  // Bridge method patterns: HybridInferenceEngine.infer → inference.invoke; Model.load → inference.load.
  "HybridInferenceEngine.infer":    ["inference.invoke"],
  "InferenceEngine.infer":          ["inference.invoke"],
  "BitNetBridge.infer":             ["inference.invoke"],
  "InferenceEngine.loadModel":      ["inference.load"],
  "InferenceEngine.registerModel":  ["inference.load"],
  "HybridInferenceEngine.seal":     ["inference.invoke"],

  // Email
  "email.send": ["network.outbound", "email.send"],
  "EmailService.send": ["network.outbound", "email.send"],

  // R4B: Anti-abuse — background execution
  "process.spawn": ["process.spawn"],
  "Process.spawn": ["process.spawn"],
  "RecordStore.findById": ["database.read"],
  "DynamicModelRegistry.load": ["inference.load"],
  "OpticalProjection.forward": ["ai.inference"],
  "QuantumOptimiser.run": ["ai.inference"],
  "QuantumSimulator.run": ["ai.inference"],
  "PatientDB.get": ["database.read", "pii.read"],
  "PatientDB.getEmail": ["database.read", "pii.read"],
  "PatientDB.findById": ["database.read", "pii.read"],
  "PatientsDB.find": ["database.read", "pii.read"],
  "PatientsDB.findById": ["database.read", "pii.read"],
  "PatientsDB.search": ["database.read", "pii.read"],
  "HealthDB.get": ["database.read", "phi.read"],

  // Phase 25: Crypto effects — signature verification and signing
  "Crypto.verify": ["crypto.verify"],
  "crypto.verify": ["crypto.verify"],
  "Crypto.sign": ["crypto.sign"],
  "crypto.sign": ["crypto.sign"],
  // #34 confidentiality — namespaced so generic functions named seal()/encrypt() are NOT
  // clobbered; using Crypto.encrypt/decrypt/seal requires the corresponding crypto effect.
  "Crypto.encrypt": ["crypto.encrypt"],
  "Crypto.decrypt": ["crypto.decrypt"],
  "Crypto.seal": ["crypto.seal"],

  // Phase 34: bcrypt password verification — requires crypto.verify effect
  "BCrypt.verify": ["crypto.verify"],
  "BCrypt.hash": ["crypto.verify"],

  // Phase 35: Password API facade — same effect as the underlying backend
  "Password.verify": ["crypto.verify"],
  "Password.hash": ["crypto.verify"],
  "Password.migrate": ["crypto.verify"],
  "Password.needsMigration": [],

  // Phase 36: Argon2id — requires crypto.verify effect
  "Argon2.verify": ["crypto.verify"],
  "Argon2.hash": ["crypto.verify"],

  // Phase 25: Secret / Vault reads
  "Secrets.get": ["secret.read"],
  "vault.secret": ["secret.read"],

  // Phase 25: Random generation
  "Random.secureBytes": ["random.generate"],
  "Random.bytes": ["random.generate"],

  // Phase 25: Clock — non-deterministic
  "Clock.now": ["clock.read"],
};

/**
 * Returns the canonical effects for a named operation, or [] if unknown.
 */
export function inferEffectsForOperation(name: string): readonly string[] {
  return EFFECT_REGISTRY[name] ?? [];
}

/**
 * Infers effects directly used in a flow's body by matching call names
 * against the EFFECT_REGISTRY.
 */
/**
 * C1 (threat-model) — module-alias resolver. A `let`/`const` binding of a bare module identifier
 * (`let x = AuditLog`) lets a caller rename an effectful module and call it through the alias
 * (`x.write(...)`), which the receiver-NAME matching below would miss — smuggling the effect (and the
 * tier floor + taint sink that key off the same name) past the capability model. This maps every alias
 * name back to the module it ultimately points at, with transitive resolution (`let y = x; let x = Http`)
 * and a cycle guard. Resolution can ONLY ADD inferred effects (a name resolves to a module or stays
 * itself), so it is fail-closed: it never removes an effect, and aliasing an effectful module and
 * calling it genuinely performs that effect, so detecting it is always correct.
 */
export function buildModuleAliasMap(flowNode: AstNode): ReadonlyMap<string, string> {
  const direct = new Map<string, string>();
  function collect(node: AstNode): void {
    if (node.kind === "letDecl" && node.value) {
      const rhs = node.children?.[0];
      // A module alias is `let x = AuditLog` — child[0] is a bare identifier. A literal/binary/member RHS
      // has child[0] of another kind and is correctly ignored. (For `let z = compute(1)` the parser binds
      // z to the bare identifier `compute` and emits the call args as a SEPARATE sibling statement, so z
      // resolves to "compute" — harmless, since it matches no effectful module.) Over-resolution only ever
      // ADDS effects, so it is fail-closed. `letDecl` is Galerina's only binding node.
      if (rhs?.kind === "identifier" && rhs.value) direct.set(node.value, rhs.value);
    }
    for (const c of node.children ?? []) collect(c);
  }
  collect(flowNode);
  const resolved = new Map<string, string>();
  for (const [name] of direct) {
    let cur = name;
    const seen = new Set<string>();
    while (direct.has(cur) && !seen.has(cur)) { seen.add(cur); cur = direct.get(cur)!; }
    if (cur !== name) resolved.set(name, cur);
  }
  return resolved;
}

/**
 * Scope-aware receiver shadowing (2026-07-09) — the C1 alias resolver's dual. A LOCAL binding that
 * REUSES a stdlib module's name (`pure flow f(env: Array<Int>)`, `let env = [1, 2, 3]`) makes
 * `env.get(0)` a call on the LOCAL VALUE, not the stdlib env module: the governed tree-walker
 * value-dispatches (verified by running — a shadowed `env.get(0)` returns the array element and
 * records NO effect), so attributing the module's effect (`secret.read`) to it is a false positive.
 * This is the FUNGI-EFFECT-003 blocker on the self-hosted corpus, whose interpreter names its
 * variable-environment Array `env` (runtime.fungi).
 *
 * FAIL-CLOSED boundaries (each pinned by a test in tests/effect-checker.test.mjs):
 *  - Only names that ARE stdlib module names (STDLIB_MODULE_KIND) can ever be suppressed — the
 *    convention patterns (`\w+DB.*`, `\w+Api.*`, ...) that DELIBERATELY match user/local receivers
 *    (`usersDB.insert`) are untouched.
 *  - A module ALIAS (`let env = Env`) is NOT a shadow — buildModuleAliasMap resolves it first and
 *    the effect still fires through the resolved module name.
 *  - Bindings are collected ONLY from flow/fn signature paramDecls and letDecls. Record-literal
 *    fields ALSO parse as paramDecl nodes, but they bind nothing — collecting them would let
 *    `let cfg = { env: 1 }` suppress a real unshadowed stdlib `env.get(...)` (a fail-open).
 *  - Granularity is flow-wide, matching the C1 alias map: a flow that both locally binds `env`
 *    AND calls the stdlib `env.get` unshadowed elsewhere resolves toward suppression. Accepted:
 *    the capitalised `Env.get` house spelling is never suppressed by a lowercase local, and
 *    binding a stdlib name while also calling that module in one flow is pathological.
 */
const BINDING_DECL_KINDS = new Set<string>(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl", "governedFlowDecl", "fnDecl"]);

export function collectLocalBindings(flowNode: AstNode): ReadonlySet<string> {
  const names = new Set<string>();
  function walk(node: AstNode): void {
    if (BINDING_DECL_KINDS.has(node.kind)) {
      for (const child of node.children ?? []) {
        if (child.kind === "paramDecl" && typeof child.value === "string") {
          // paramDecl.value is signature text "name: Type" (optionally modifier-prefixed);
          // the bound name is the last identifier before the colon.
          const beforeColon = child.value.split(":")[0] ?? "";
          const name = beforeColon.trim().split(/\s+/).pop() ?? "";
          if (name !== "") names.add(name);
        }
      }
    }
    if (node.kind === "letDecl" && node.value) names.add(node.value);
    for (const child of node.children ?? []) walk(child);
  }
  walk(flowNode);
  return names;
}

/** True when `raw` names a stdlib module but is locally REBOUND to data (param/let, not a module alias). */
function isShadowedStdlibReceiver(
  raw: string,
  localBindings: ReadonlySet<string>,
  aliasMap: ReadonlyMap<string, string>,
): boolean {
  return raw !== "" && localBindings.has(raw) && !aliasMap.has(raw) && getStdlibModuleKind(raw) !== undefined;
}

/**
 * Leftmost identifier of a call/member chain (`env.items.get` → `env`). For a bare call the first
 * child may be an argument identifier — harmless here, because every EFFECT_CALL_PATTERNS entry is
 * dotted and a bare call's callText is a single token that can never match one anyway.
 */
function rootReceiverRaw(node: AstNode): string {
  let cur = node.children?.[0];
  while (cur !== undefined && cur.kind !== "identifier") cur = cur.children?.[0];
  return cur?.kind === "identifier" ? (cur.value ?? "") : "";
}

export function inferDirectEffectsForFlow(
  flowNode: AstNode,
): readonly string[] {
  const effects = new Set<string>();
  const aliasMap = buildModuleAliasMap(flowNode);
  const localBindings = collectLocalBindings(flowNode);

  function walk(node: AstNode): void {
    if (node.kind === "callExpr") {
      // Build full call name: receiver.method or just method
      const methodName = node.value ?? "";
      const receiver = node.children?.[0];
      const rawReceiver = receiver?.kind === "identifier" ? (receiver.value ?? "") : "";
      // C1: resolve a module alias (`let x = AuditLog; x.write()` → `AuditLog.write`) before matching.
      // Shadow-aware: a local rebinding of a stdlib module name is DATA — suppress module attribution.
      const receiverName = isShadowedStdlibReceiver(rawReceiver, localBindings, aliasMap)
        ? ""
        : (aliasMap.get(rawReceiver) ?? rawReceiver);
      const fullName = receiverName !== "" ? `${receiverName}.${methodName}` : methodName;

      for (const effect of inferEffectsForOperation(fullName)) {
        effects.add(effect);
      }
      // Also try just the method name
      for (const effect of inferEffectsForOperation(methodName)) {
        effects.add(effect);
      }
    }
    for (const child of node.children ?? []) walk(child);
  }

  walk(flowNode);
  return [...effects].sort();  // sorted for determinism
}

/**
 * Builds a FlowEffectSummary for a flow, comparing declared vs inferred effects.
 * Computes EffectFlags bitset masks and EffectCheckerFlags properties.
 */
export function buildFlowEffectSummary(
  flowNode: AstNode,
  meta: FlowMeta,
): FlowEffectSummary {
  const declaredEffects = [...meta.declaredEffects].sort();
  const inferredEffects = inferDirectEffectsForFlow(flowNode);
  const declaredSet = new Set(declaredEffects);
  const missingEffects = inferredEffects.filter(e => !declaredSet.has(e));

  const declaredEffectsMask = effectsToFlags(declaredEffects);
  const inferredEffectsMask = effectsToFlags(inferredEffects);
  const missingEffectsMask  = effectsToFlags(missingEffects);

  // Compute EffectCheckerFlags: properties proven by effect analysis.
  // PureComputeCandidate: pure qualifier AND no I/O effects inferred or declared.
  const isPure = meta.qualifier === "pure";
  const hasNoIO = inferredEffects.length === 0 && declaredEffects.length === 0;
  const hasNoInferredIO = inferredEffects.length === 0;

  const pureComputeCandidate = isPure && hasNoInferredIO;
  const effectFree           = isPure && hasNoIO;
  const parallelSafe         = isPure && hasNoInferredIO;  // pure + no inferred I/O → safe to parallelize
  const kernelFusionCandidate = isPure && hasNoIO;          // truly effect-free → all ops can fuse
  const readyForAPU          = pureComputeCandidate;        // purity is the APU prerequisite; shape check is type-checker's job
  const readyForNPU          = pureComputeCandidate;        // purity prerequisite; tensor check is type-checker's job

  const checkerFlags: EffectCheckerFlagsMask =
    (pureComputeCandidate  ? EffectCheckerFlags.PureComputeCandidate  : EffectCheckerFlags.None) |
    (parallelSafe          ? EffectCheckerFlags.ParallelSafe          : EffectCheckerFlags.None) |
    (kernelFusionCandidate ? EffectCheckerFlags.KernelFusionCandidate : EffectCheckerFlags.None) |
    (effectFree            ? EffectCheckerFlags.EffectFree            : EffectCheckerFlags.None) |
    (readyForAPU           ? EffectCheckerFlags.ReadyForAPU           : EffectCheckerFlags.None) |
    (readyForNPU           ? EffectCheckerFlags.ReadyForNPU           : EffectCheckerFlags.None);

  return {
    flowName: meta.name,
    declaredEffects,
    inferredEffects,
    missingEffects,
    declaredEffectsMask,
    inferredEffectsMask,
    missingEffectsMask,
    checkerFlags,
  };
}

// ---------------------------------------------------------------------------
// Effect checker diagnostics
// ---------------------------------------------------------------------------

export interface EffectDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
  readonly suggestedCode?: string;
  /** Rust-style: secondary source locations giving context. */
  readonly relatedLocations?: readonly { message: string; location: SourceLocation }[];
  /** Elm-style: why this is a problem. */
  readonly why?: string;
  /** Elm-style: what goes wrong if ignored. */
  readonly risk?: string;
}

export interface EffectCheckResult {
  readonly flowName: string;
  readonly qualifier: "flow" | "secure" | "pure" | "guarded";
  readonly declaredEffects: readonly string[];
  readonly observedEffects: readonly string[];
  readonly diagnostics: readonly EffectDiagnostic[];
  /** Effect-checker-proven properties. See EffectCheckerFlags. */
  readonly checkerFlags: EffectCheckerFlagsMask;
}

/**
 * Effect checker run mode.
 * "development" — warn on missing effects (friendly for development).
 * "production"  — error on missing, unknown, or broad-alias effects.
 */
export type EffectCheckerMode = "development" | "production";

export const CANONICAL_EFFECTS = new Set([
  "database.read", "database.write",
  // cache.* is already wired in EFFECT_REGISTRY (cache.get/set/delete → cache.read/write)
  // but was missing here — a production compile would reject a declared cache effect that
  // the op-registry produces. Promoted to canonical (reconciliation 2026-07-01).
  "cache.read", "cache.write",
  "network.outbound", "network.inbound",
  "network.external", "network.internal",
  "secret.read", "secret.write",
  "audit.write",
  "storage.read", "storage.write",
  // Commit 2 (2026-07-01) — domain families aligned with the V_DPM capability layer (capability-types.ts):
  // ledger.mutate = the storage.write|audit.write composite; shell.execute = V_DPM bit 6 (shell_execute).
  "ledger.mutate", "shell.execute",
  "ai.inference",
  "compute.gpu", "compute.npu", "compute.cpu",
  "desktop.user.read",
  "native.call",
  "payment.charge",
  "pii.read",
  "phi.read", "phi.write",
  "email.send",
  // R4B: anti-abuse effects — prevent covert background execution and scheduled tasks
  "process.spawn",
  "worker.spawn",
  "event.schedule",
  // Phase 25: crypto effects — HSM/TPM signature ops require explicit declaration
  "crypto.verify",
  "crypto.sign",
  // #34 confidentiality — KEM-DEM / AEAD ops. Like sign/verify, these must run bit-exact
  // on the deterministic core (FUNGI-SUBSTRATE-001), never on a noisy/analog lane.
  "crypto.encrypt",
  "crypto.decrypt",
  "crypto.seal",
  // FUNGI-CRYPTO-PQ-001: signing-algorithm marker effects declared ALONGSIDE crypto.sign to
  // ASSERT the algorithm. The base `crypto.sign` handles call-matching; these mark whether
  // the signature is post-quantum. In a certified profile a PQ/hybrid marker is required.
  "crypto.sign.hybrid",
  "crypto.sign.mldsa65",
  "crypto.sign.slhdsa",
  "crypto.sign.ed25519",
  // Phase 25: random/clock non-deterministic effects
  "random.generate",
  "clock.read",
  // FUNGI-EFFECT reconciliation (2026-07-01): these already had EffectFlags bits in
  // type-registry.ts (EFFECT_NAME_TO_FLAG: StateRead/StateWrite/MessagePublish/ModelTrain)
  // but were missing from CANONICAL_EFFECTS — so the bitmask accepted them while a
  // production compile rejected them (FUNGI-EFFECT-004). Promoted to canonical so the
  // effect vocabulary is single-source consistent (scripts/audit-effect-canonicality.mjs).
  "state.read", "state.write",
  "message.publish",
  "ai.train",
  // Declared-effect reconciliation (2026-07-02, owner-directed "harden after proof"):
  // telemetry.read promoted from Stage-B-only to canonical (aerospace corpus uses it;
  // EffectFlags.TelemetryRead bit 14 in type-registry.ts). eval.execute is deliberately
  // NOT here — it is DENY-ONLY (see DENY_ONLY_EFFECTS below): recognised, never grantable.
  // memory.spill (H-6, RD-0358/RD-0360 Q2) is likewise DENY-ONLY, not here — a hardened
  // value's residency-ceiling crossing is never a grantable authority. (No memory.* entry
  // is canonical — the Q2 no-collision guardrail holds by construction.)
  "telemetry.read",
  // RD-0364 — governed inference bridge contract: per-call invocation + model-load resource/
  // supply-chain events. Distinct from ai.inference (generic capability-level) by granularity:
  //   inference.invoke — a per-call AI inference request (resource + latency surface).
  //   inference.load   — loading/registering a model (resource + supply-chain event; weights hash
  //                      must be verified at load time per RD-0364 §1).
  // Deny-by-default: a flow reaching an inference service without declaring one of these is
  // rejected at compile time (FUNGI-EFFECT-001). ai.inference remains the coarse alias (§3 CANONICAL_EFFECTS).
  "inference.invoke",
  "inference.load",
  // Vault effects (owner-ruled 2026-07-23): the vault is the governed channel for saving/fetching
  // variable values BETWEEN flows — cross-flow state, the sanctioned replacement for globals. It is
  // per-flow-per-variable permissioned: the vault DECLARATION's entry allow-list gates who may reach
  // it, and the accessing flow's own contract declares vault.read / vault.write. The governance
  // verifier (FUNGI-VAULT-003/004) already REQUIRES these names in a vault-accessing flow's effects,
  // but they were absent here, so validateDeclaredEffectNames 004-rejected them (the pincer). Promoted
  // to canonical to resolve it. Scope (request/flow/session/service/secure) lives in the vault
  // declaration, NEVER the effect name — two names only, no vault.session.read minting.
  // DISTINCT from the legacy secrets sense: the `vault.secret` call-pattern → secret.read
  // (INFERENCE_PATTERNS above) and the inert lowercase ["vault", "secret.read"] broad-effect row
  // are unchanged — those INFER secret.read; they are not these declared effect names.
  "vault.read", "vault.write",
]);

// Effects that are RECOGNISED but NEVER grantable — declaring one is an error at
// every profile (FUNGI-EFFECT-006, fail-closed; galerina.mjs folds it into the
// dev-integrity set). Keeping the name in the vocabulary (vs UNKNOWN) gives authors
// the real reason instead of a typo hint, and reconciles Stage-B knownEffects (C9)
// without making the effect grantable. C10 (audit-effect-canonicality) proves each
// name here is absent from EVERY grantable table (canonical/alias/flag/gir/cap).
//   • eval.execute — arbitrary dynamic evaluation: no capability bit, no host import,
//     no admission path may ever carry it.
//   • memory.spill — RD-0358 / RD-0360 Q2 (H-6): a hardened value crossing its
//     `hardening { residency … }` ceiling (a register-only / no-swap secret reaching
//     DRAM or swap). Deny-by-default and never grantable — no capability legitimises
//     leaking a hardened secret to memory, so a DECLARED spill cannot buy admission
//     the way FUNGI-HARDEN-005/007 already rejects the IMPLICIT spill (the two paths
//     close the door from both sides). A future GRANTABLE "audited paged-optimizer"
//     spill (RD-0356 B5) would be a DISTINCT canonical effect, never this name —
//     keeping memory.spill deny-only guarantees "declared spill" can never become a
//     synonym for "declared paging".
export const DENY_ONLY_EFFECTS: ReadonlySet<string> = new Set([
  "eval.execute",
  "memory.spill",
]);

const EFFECT_NAME_ALIASES: ReadonlyMap<string, string> = new Map([
  // Short aliases (no dot)
  ["network", "network.outbound"],
  ["database", "database.read"],
  ["filesystem", "storage.read"],
  ["secret", "secret.read"],
  ["ai", "ai.inference"],
  ["audit", "audit.write"],
  ["pii", "pii.read"],
  ["phi", "phi.read"],
  // Task 2: canonical effect alias map (CANONICAL_EFFECT_ALIASES)
  ["pii.write", "database.write"],
  ["http.get", "network.outbound"],
  ["http.post", "network.outbound"],
  ["http.put", "network.outbound"],
  ["http.delete", "network.outbound"],
  ["http.patch", "network.outbound"],
  ["file.read", "storage.read"],
  ["file.write", "storage.write"],
  // FUNGI-EFFECT reconciliation (2026-07-01): variant names that resolve to an
  // existing canonical effect (they already share its EffectFlags bit in
  // type-registry.ts). ai.remoteInference→AiInference, crypto.password.verify→CryptoVerify.
  ["ai.remoteInference", "ai.inference"],
  ["crypto.password.verify", "crypto.verify"],
  // Declared-effect reconciliation (2026-07-02): ai.infer was the Stage-B/corpus
  // spelling — one-way deprecation alias onto the canonical ai.inference.
  ["ai.infer", "ai.inference"],
  // secret.access is the coarse umbrella; nudge authors to the fine-grained
  // secret.read/secret.write (emits FUNGI-EFFECT-005 broad-alias warning, below).
  ["secret.access", "secret.read"],
  // RD-0364: ai.inference as coarse alias for inference.invoke (the most common path).
  // Authors using the coarse alias will get inference.invoke semantics. The fine-grained
  // inference.load must always be declared explicitly (no coarse alias — supply-chain event).
  ["ai.inference.invoke", "inference.invoke"],
  ["ai.inference.load",   "inference.load"],
]);

// ---------------------------------------------------------------------------
// Known effect-producing call patterns
// ---------------------------------------------------------------------------

// Phase 19 (legacy): regex-based call pattern matching for effect inference.
// Being replaced by STDLIB_CAPABILITY_MAP AST-based lookups (Phase 19A, FUNGI-STDLIB-001).
// These patterns remain for backward compatibility with non-stdlib call patterns
// (e.g. *DB.insert, *Payment.charge) that are not in STDLIB_CAPABILITY_MAP.
// Phase 20: migrate *DB.* and *Payment.* patterns to a structured registry.
// Do not add new regex patterns here — add to STDLIB_CAPABILITY_MAP instead.
const EFFECT_CALL_PATTERNS: ReadonlyMap<RegExp, string> = new Map([
  // Database
  [/\b\w+DB\.insert\b/, "database.write"],
  [/\b\w+DB\.update\b/, "database.write"],
  [/\b\w+DB\.update\w+/, "database.write"],
  [/\b\w+DB\.delete\b/, "database.write"],
  [/\b\w+DB\.\w+/, "database.read"],
  // Audit log
  [/\bAuditLog\.write\b/, "audit.write"],
  // HTTP client
  [/\bhttp\.get\b/, "network.outbound"],
  [/\bhttp\.post\b/, "network.outbound"],
  [/\bhttp\.put\b/, "network.outbound"],
  [/\bhttp\.patch\b/, "network.outbound"],
  [/\bhttp\.delete\b/, "network.outbound"],
  // Network adapters
  [/\b\w+Api\.charge\b/, "network.outbound"],
  [/\b\w+Api\.send\b/, "network.outbound"],
  [/\b\w+Adapter\.\w+/, "network.outbound"],
  [/\bEmailService\.\w+/, "network.outbound"],
  [/\b\w+(?:Gateway|Service|Client)\.(?:send|fetch|connect|refer)\b/, "network.outbound"],
  // Filesystem
  [/\bfs\.readText\b/, "storage.read"],
  [/\bfs\.read\b/, "storage.read"],
  [/\bFile\.read\b/, "storage.read"],
  [/\bfs\.writeText\b/, "storage.write"],
  [/\bfs\.write\b/, "storage.write"],
  [/\bFileSystem\.\w+/, "storage.write"],
  // Environment and secrets
  [/\bEnv\.get\b/, "secret.read"],
  [/\benv\.get\b/, "secret.read"],
  [/\benv\.secret\b/, "secret.read"],
  [/\bvault\.secret\b/, "secret.read"],
  // AI / inference
  [/\b\w*Model\.(?:run|infer|forward|embed|classify|classifyWithKey|confidence|score)\b/, "ai.inference"],
  // Payment
  [/\b\w*Payment(?:Gateway|Service)?\.(?:charge|initiate)\b/, "payment.charge"],
  [/\w+Payment\.\w+/, "payment.charge"],
  [/\w+Payments\.\w+/, "payment.charge"],
  // Desktop / host
  [/\bHost\.\w+/, "desktop.user.read"],
]);

// Native-prefixed static members are also used for enum variants and record data
// (for example NativeDiagnosticSeverity.Error). Only an invocation may cross the
// FFI boundary; a member read is not authority evidence.
const NATIVE_CALL_PATTERN = /\bNative\w+\.\w+/;

/**
 * Tracks the number of legacy regex patterns remaining in EFFECT_CALL_PATTERNS.
 * Used by tests to monitor migration progress toward STDLIB_CAPABILITY_MAP.
 * Target: 0 (all patterns migrated). Phase 20 goal.
 */
export const LEGACY_EFFECT_CALL_PATTERNS_COUNT = EFFECT_CALL_PATTERNS.size + 1;

/**
 * Effects whose evidence is intentionally not a call-pattern observation.
 * Some are explicit authority declarations by language contract; vault access
 * is checked by the dedicated vault/governance verifier. Calling these
 * "overdeclared" here would create an obligation no source program can
 * discharge and contradict the authoritative effect reference.
 */
const NON_CALL_OBSERVED_EFFECTS: ReadonlySet<string> = new Set([
  "ledger.mutate",
  "network.inbound",
  "network.external",
  "network.internal",
  "secret.write",
  "crypto.sign.ed25519",
  "crypto.sign.mldsa65",
  "crypto.sign.slhdsa",
  "crypto.sign.hybrid",
  "compute.cpu",
  "compute.gpu",
  "compute.npu",
  "worker.spawn",
  "event.schedule",
  "shell.execute",
  "telemetry.read",
  "pii.read",
  "phi.read",
  "phi.write",
  "vault.read",
  "vault.write",
]);

/**
 * Resolve a fully-qualified call through the structured registry first, then
 * fall back to the bounded legacy convention patterns. The authoritative
 * checker must not maintain a second, weaker capability list: doing so let
 * registered operations such as Clock.now satisfy the stdlib pass while
 * remaining invisible to declared-effect reconciliation.
 */
function inferEffectsForCallText(callText: string, isInvocation: boolean): readonly string[] {
  const registered = inferEffectsForOperation(callText);
  if (registered.length > 0) return registered;

  for (const [pattern, effect] of EFFECT_CALL_PATTERNS) {
    if (pattern.test(callText)) return [effect];
  }
  if (isInvocation && NATIVE_CALL_PATTERN.test(callText)) return ["native.call"];
  return [];
}

const PURE_FORBIDDEN_EFFECTS = new Set([
  "database.read", "database.write",
  "cache.read", "cache.write",
  "network.outbound", "network.external", "network.inbound", "network.internal",
  "secret.read", "secret.write",
  "audit.write",
  "storage.write", "storage.read", "ledger.mutate",
  "desktop.user.read",
  "native.call", "shell.execute",
  "payment.charge",
  "ai.inference",
  "pii.read", "pii.write",
  "phi.read", "phi.write",
  // R4B: spawning background processes is forbidden in pure flows
  "process.spawn",
  // FUNGI-EFFECT reconciliation (2026-07-01): promoted-to-canonical effects are
  // also forbidden in a pure flow (a pure flow performs no state mutation, message
  // publication, or model training).
  "state.read", "state.write", "message.publish", "ai.train",
  // 2026-07-02: telemetry.read is an observation of external state — an effect,
  // so forbidden in pure flows like every other read family.
  "telemetry.read",
]);

const PLAIN_FLOW_PRIVILEGED_EFFECTS = new Set([
  "secret.read",
  "payment.charge",
]);

// FUNGI-TIER-001 — effects that REQUIRE the `secure` flow tier. Touching any of these from a
// `flow`/`guarded` declaration under-declares the obligation (secure-only passes never attach).
// Deliberately conservative — benign reads (database.read, storage.read, desktop.user.read)
// stay guarded-tier and are NOT included, to avoid false floors.
const SECURE_REQUIRED_EFFECTS = new Set([
  // Border / egress
  "network.outbound", "network.external", "network.inbound", "network.internal", "email.send",
  // Credential & cryptographic material
  "secret.read", "secret.write",
  "crypto.sign", "crypto.verify", "crypto.encrypt", "crypto.decrypt",
  // High-consequence sinks & mutations
  "payment.charge", "audit.write", "database.write", "storage.write", "ledger.mutate",
  "ai.inference", "pii.read", "pii.write", "phi.read", "phi.write",
  // Code / process execution
  "process.spawn", "native.call", "shell.execute",
]);

// ---------------------------------------------------------------------------
// Helpers for suggestedCode generation
// ---------------------------------------------------------------------------

/** Build the complete `contract { effects { ... } }` block for EFFECT-001 in dev mode. */
function buildContractEffectsBlock(effects: readonly string[]): string {
  const lines = ["contract {", "  effects {"];
  for (const eff of effects) {
    lines.push(`    ${eff}`);
  }
  lines.push("  }", "}");
  return lines.join("\n");
}

interface RequirementStrictCallInventory {
  readonly targets: ReadonlySet<string>;
  readonly complete: boolean;
}

interface RequirementConstraintObservation extends RequirementStrictCallInventory {
  readonly directEffects: ReadonlySet<string>;
}

interface RequirementEffectContext {
  readonly withinBounds: boolean;
  readonly flowNodesByEvidence: ReadonlyMap<string, readonly AstNode[]>;
  readonly flowNodesByName: ReadonlyMap<string, readonly AstNode[]>;
  readonly constraintObservations: ReadonlyMap<AstNode, RequirementConstraintObservation>;
  readonly closureEffects: ReadonlyMap<string, ReadonlySet<string>>;
  readonly closureComplete: ReadonlyMap<string, boolean>;
}

interface MutableRequirementCallBudget {
  calls: number;
  exceeded: boolean;
}

const REQUIREMENT_EFFECT_MAX_FLOWS = 4096;
const REQUIREMENT_EFFECT_MAX_CALLS = 16384;

function requirementFlowEvidenceBase(
  name: string,
  location: SourceLocation | undefined,
): string {
  const locationParts = location === undefined
    ? ["<unknown>"]
    : [
        location.file,
        location.line,
        location.column,
        location.offset,
        location.endLine,
        location.endColumn,
        location.endOffset,
        location.length,
      ];
  return `${name}\u001f${locationParts.join("\u001f")}`;
}

function buildRequirementEffectContext(
  flows: readonly FlowMeta[],
  ast: AstNode,
): RequirementEffectContext {
  const metasByName = new Map<string, FlowMeta[]>();
  for (const flow of flows) {
    const sameName = metasByName.get(flow.name);
    if (sameName === undefined) {
      metasByName.set(flow.name, [flow]);
    } else {
      sameName.push(flow);
    }
  }

  const flowNodesByName = new Map<string, AstNode[]>();
  const knownNames = new Set(metasByName.keys());
  const importedBindings = new Set<string>();

  function collectImportBindings(raw: string): void {
    const fromIndex = raw.lastIndexOf(" from ");
    if (fromIndex === -1) return;
    const clause = raw.slice(0, fromIndex).trim();
    if (clause.startsWith("{")) {
      const closeIndex = clause.lastIndexOf("}");
      if (closeIndex === -1) return;
      for (const imported of clause.slice(1, closeIndex).split(",")) {
        const parts = imported.trim().split(/\s+as\s+/);
        const localName = (parts[1] ?? parts[0] ?? "").trim();
        if (localName !== "") importedBindings.add(localName);
      }
      return;
    }
    if (clause.startsWith("*")) {
      const parts = clause.split(/\s+as\s+/);
      const localName = (parts[1] ?? "").trim();
      if (localName !== "") importedBindings.add(localName);
      return;
    }
    const localName = clause.split(/\s+/)[0]?.trim() ?? "";
    if (localName !== "") importedBindings.add(localName);
  }

  function collectFlowNodes(node: AstNode): void {
    if (node.kind === "importDecl" && node.value !== undefined) {
      collectImportBindings(node.value);
    } else if (
      (node.kind === "importPluginDecl" || node.kind === "assimilatedPluginDecl")
      && node.value !== undefined
      && node.value !== ""
    ) {
      importedBindings.add(node.value);
    }
    const decoded = decodeFlowDecl(node);
    if (decoded !== undefined && !("error" in decoded) && knownNames.has(decoded.name)) {
      const sameName = flowNodesByName.get(decoded.name);
      if (sameName === undefined) {
        flowNodesByName.set(decoded.name, [node]);
      } else {
        sameName.push(node);
      }
      return;
    }
    for (const child of node.children ?? []) collectFlowNodes(child);
  }
  collectFlowNodes(ast);

  const metaKeysByEvidence = new Map<string, string[]>();
  const metaOrdinals = new Map<string, number>();
  for (const flow of flows) {
    const evidence = requirementFlowEvidenceBase(flow.name, flow.location);
    const ordinal = metaOrdinals.get(evidence) ?? 0;
    metaOrdinals.set(evidence, ordinal + 1);
    const key = `${evidence}\u001f${ordinal}`;
    const keys = metaKeysByEvidence.get(evidence);
    if (keys === undefined) metaKeysByEvidence.set(evidence, [key]);
    else keys.push(key);
  }

  const nodesByStableKey = new Map<string, AstNode>();
  const nodeKeysByEvidence = new Map<string, string[]>();
  const nodeOrdinals = new Map<string, number>();
  for (const [name, nodes] of flowNodesByName) {
    for (const node of nodes) {
      const evidence = requirementFlowEvidenceBase(name, node.location);
      const ordinal = nodeOrdinals.get(evidence) ?? 0;
      nodeOrdinals.set(evidence, ordinal + 1);
      const key = `${evidence}\u001f${ordinal}`;
      nodesByStableKey.set(key, node);
      const keys = nodeKeysByEvidence.get(evidence);
      if (keys === undefined) nodeKeysByEvidence.set(evidence, [key]);
      else keys.push(key);
    }
  }

  const flowNodesByEvidence = new Map<string, readonly AstNode[]>();
  for (const [evidence, metaKeys] of metaKeysByEvidence) {
    const nodeKeys = nodeKeysByEvidence.get(evidence) ?? [];
    if (metaKeys.length === 1 && nodeKeys.length === 1) {
      const node = nodesByStableKey.get(nodeKeys[0]!);
      if (node !== undefined) flowNodesByEvidence.set(evidence, [node]);
    } else {
      const flowName = evidence.split("\u001f", 1)[0] ?? "";
      flowNodesByEvidence.set(evidence, flowNodesByName.get(flowName) ?? []);
    }
  }

  if (flows.length > REQUIREMENT_EFFECT_MAX_FLOWS) {
    return {
      withinBounds: false,
      flowNodesByEvidence,
      flowNodesByName,
      constraintObservations: new Map(),
      closureEffects: new Map(),
      closureComplete: new Map(),
    };
  }

  const uniqueFlowNames = new Set<string>();
  for (const [name, metas] of metasByName) {
    if (metas.length === 1 && flowNodesByName.get(name)?.length === 1) {
      uniqueFlowNames.add(name);
    }
  }

  const constraintObservations = new Map<AstNode, RequirementConstraintObservation>();
  const directEffects = new Map<string, ReadonlySet<string>>();
  const strictCalls = new Map<string, RequirementStrictCallInventory>();
  const budget: MutableRequirementCallBudget = { calls: 0, exceeded: false };

  function classifyCall(
    node: AstNode,
    isLocallyBound: (name: string) => boolean,
  ): boolean {
    budget.calls += 1;
    if (budget.calls > REQUIREMENT_EFFECT_MAX_CALLS) {
      budget.exceeded = true;
      return false;
    }
    const name = node.value ?? "";
    const bare =
      node.callStyle === undefined
      && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
    if (
      !bare
      || importedBindings.has(name)
      || isLocallyBound(name)
      || !uniqueFlowNames.has(name)
    ) {
      return false;
    }
    return true;
  }

  for (const [name, flowNodes] of flowNodesByName) {
    for (const flowNode of flowNodes) {
      const scopes: Array<Set<string>> = [];
      const pushScope = (): void => { scopes.push(new Set()); };
      const popScope = (): void => { scopes.pop(); };
      const declare = (rawName: string): void => {
        const beforeColon = rawName.split(":")[0] ?? "";
        const bindingName = beforeColon.trim().split(/\s+/).pop() ?? "";
        if (bindingName !== "") scopes[scopes.length - 1]?.add(bindingName);
      };
      const isLocallyBound = (bindingName: string): boolean => {
        for (let index = scopes.length - 1; index >= 0; index -= 1) {
          if (scopes[index]?.has(bindingName) === true) return true;
        }
        return false;
      };

      const flowTargets = new Set<string>();
      let flowComplete = true;

      function walk(
        node: AstNode,
        insideFn: boolean,
        constraintTargets?: Set<string>,
        constraintState?: { complete: boolean },
      ): void {
        if (budget.exceeded) return;
        if (decodeFlowDecl(node) !== undefined) {
          pushScope();
          for (const child of node.children ?? []) {
            if (child.kind === "paramDecl") walk(child, insideFn);
          }
          for (const child of node.children ?? []) {
            if (child.kind !== "paramDecl") walk(child, insideFn);
          }
          popScope();
          return;
        }
        if (node.kind === "block") {
          pushScope();
          for (const child of node.children ?? []) {
            walk(child, insideFn, constraintTargets, constraintState);
          }
          popScope();
          return;
        }
        if (node.kind === "fnDecl") {
          declare(node.value ?? "");
          pushScope();
          for (const child of node.children ?? []) {
            walk(child, true, constraintTargets, constraintState);
          }
          popScope();
          return;
        }
        if (node.kind === "paramDecl") {
          declare(node.value ?? "");
          return;
        }
        if (
          node.kind === "letDecl"
          || node.kind === "mutDecl"
          || node.kind === "readonlyDecl"
        ) {
          const initializer = node.children?.[0];
          if (initializer !== undefined) {
            walk(initializer, insideFn, constraintTargets, constraintState);
          }
          declare(node.value ?? "");
          for (const child of (node.children ?? []).slice(1)) {
            walk(child, insideFn, constraintTargets, constraintState);
          }
          return;
        }
        if (node.kind === "matchArm" && node.value !== "__guard__") {
          pushScope();
          for (const child of node.children ?? []) {
            if (child.kind === "identifier") declare(child.value ?? "");
            else walk(child, insideFn, constraintTargets, constraintState);
          }
          popScope();
          return;
        }
        if (node.kind === "forEachStmt") {
          const collection = node.children?.[0];
          const body = node.children?.[1];
          const whereGuard = node.children?.[2];
          if (collection !== undefined) {
            walk(collection, insideFn, constraintTargets, constraintState);
          }
          pushScope();
          declare(node.value ?? "");
          if (whereGuard !== undefined) {
            walk(whereGuard, insideFn, constraintTargets, constraintState);
          }
          if (body !== undefined) walk(body, insideFn, constraintTargets, constraintState);
          popScope();
          return;
        }
        if (node.kind === "requirementConstraint") {
          const expression = node.children?.[0];
          const targets = new Set<string>();
          const state = { complete: expression !== undefined };
          if (expression !== undefined) walk(expression, insideFn, targets, state);
          constraintObservations.set(node, {
            directEffects: expression === undefined
              ? new Set<string>()
              : inferEffectsFromNode(expression),
            targets,
            complete: state.complete,
          });
          return;
        }
        if (node.kind === "callExpr") {
          const target = node.value;
          const resolved = classifyCall(node, isLocallyBound);
          if (!insideFn) {
            if (resolved && target !== undefined) flowTargets.add(target);
            else flowComplete = false;
          }
          if (constraintTargets !== undefined && constraintState !== undefined) {
            if (resolved && target !== undefined) constraintTargets.add(target);
            else constraintState.complete = false;
          }
        }
        for (const child of node.children ?? []) {
          walk(child, insideFn, constraintTargets, constraintState);
        }
      }

      walk(flowNode, false);
      if (uniqueFlowNames.has(name)) {
        directEffects.set(name, inferEffectsFromNode(flowNode));
        strictCalls.set(name, {
          targets: flowTargets,
          complete: flowComplete && !budget.exceeded,
        });
      }
    }
  }

  const closureEffects = new Map<string, Set<string>>();
  const closureComplete = new Map<string, boolean>();
  for (const name of uniqueFlowNames) {
    closureEffects.set(name, new Set(directEffects.get(name) ?? []));
    closureComplete.set(name, strictCalls.get(name)?.complete === true);
  }

  const strictCallGraph = buildCallGraph(
    [...uniqueFlowNames].map((name) => ({
      name,
      qualifier: metasByName.get(name)?.[0]?.qualifier ?? "",
      calledFlows: [...(strictCalls.get(name)?.targets ?? [])],
    })),
  );
  const cycleResult = detectCycle(strictCallGraph);
  const topoResult = topoSort(strictCallGraph);
  const topoNames = [...topoResult.order].reverse();
  const topologicallyOrdered = new Set(topoNames);
  const orderedNames = [
    ...topoNames,
    ...[...strictCallGraph.nodes()]
      .map((node) => node.id)
      .filter((name) => !topologicallyOrdered.has(name)),
  ];

  let settled = false;
  const maxPasses = cycleResult.hasCycle ? strictCallGraph.nodeCount + 1 : 1;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;
    for (const name of orderedNames) {
      const effects = closureEffects.get(name);
      if (effects === undefined) continue;
      for (const edge of strictCallGraph.outEdges(name)) {
        const target = edge.to;
        const targetEffects = closureEffects.get(target);
        if (targetEffects === undefined || closureComplete.get(target) !== true) {
          if (closureComplete.get(name) !== false) {
            closureComplete.set(name, false);
            changed = true;
          }
        }
        for (const effect of targetEffects ?? []) {
          if (!effects.has(effect)) {
            effects.add(effect);
            changed = true;
          }
        }
      }
    }
    if (!changed) {
      settled = true;
      break;
    }
    if (!cycleResult.hasCycle) {
      // Reverse topological order visits every callee before its caller, so one
      // monotone pass is complete for an acyclic strict graph.
      settled = true;
      break;
    }
  }

  return {
    withinBounds:
      flows.length <= REQUIREMENT_EFFECT_MAX_FLOWS
      && !budget.exceeded
      && settled,
    flowNodesByEvidence,
    flowNodesByName,
    constraintObservations,
    closureEffects,
    closureComplete,
  };
}

function checkRequirementConstraintEffects(
  flowNode: AstNode,
  context: RequirementEffectContext,
): readonly EffectDiagnostic[] {
  const diagnostics: EffectDiagnostic[] = [];

  function walk(node: AstNode): void {
    if (node.kind === "requirementConstraint") {
      const observation = context.constraintObservations.get(node);
      let effectFree =
        context.withinBounds
        && observation !== undefined
        && observation.complete
        && observation.directEffects.size === 0;
      for (const target of observation?.targets ?? []) {
        if (
          context.closureComplete.get(target) !== true
          || (context.closureEffects.get(target)?.size ?? 0) !== 0
        ) {
          effectFree = false;
        }
      }
      if (!effectFree) {
        diagnostics.push({
          ...FUNGI_REQUIREMENT_003,
          ...(node.location !== undefined ? { location: node.location } : {}),
        });
      }
      return;
    }
    for (const child of node.children ?? []) walk(child);
  }

  walk(flowNode);
  return diagnostics;
}

// ---------------------------------------------------------------------------
// Public checker entry points
// ---------------------------------------------------------------------------

export function checkEffects(
  flows: readonly FlowMeta[],
  ast: AstNode,
  mode: EffectCheckerMode = "production",
  enforceTierFloor = false,
): readonly EffectCheckResult[] {
  const effectfulFlows = new Set(
    flows
      .filter((flow) => flow.qualifier !== "pure" && flow.declaredEffects.length > 0)
      .map((flow) => flow.name),
  );
  const callGraph = buildFlowCallGraph(flows, ast);
  const requirementContext = buildRequirementEffectContext(flows, ast);

  return flows.map((flow) => checkFlowEffectsInternal(
    flow,
    ast,
    flows,
    callGraph,
    effectfulFlows,
    mode,
    enforceTierFloor,
    requirementContext,
  ));
}

export function checkFlowEffects(
  flow: FlowMeta,
  ast: AstNode,
  allFlows: readonly FlowMeta[] = [flow],
  callGraph: ReadonlyMap<string, ReadonlySet<string>> = buildFlowCallGraph(allFlows, ast),
  effectfulFlows: ReadonlySet<string> = new Set(
    allFlows
      .filter((candidate) => candidate.qualifier !== "pure" && candidate.declaredEffects.length > 0)
      .map((candidate) => candidate.name),
  ),
  mode: EffectCheckerMode = "production",
  enforceTierFloor = false,
): EffectCheckResult {
  return checkFlowEffectsInternal(
    flow,
    ast,
    allFlows,
    callGraph,
    effectfulFlows,
    mode,
    enforceTierFloor,
    buildRequirementEffectContext(allFlows, ast),
  );
}

function checkFlowEffectsInternal(
  flow: FlowMeta,
  ast: AstNode,
  allFlows: readonly FlowMeta[],
  callGraph: ReadonlyMap<string, ReadonlySet<string>>,
  effectfulFlows: ReadonlySet<string>,
  mode: EffectCheckerMode,
  enforceTierFloor: boolean,
  requirementContext: RequirementEffectContext,
): EffectCheckResult {
  const diagnostics: EffectDiagnostic[] = [];
  const flowNode = findFlowNode(ast, flow.name);
  const flowEvidence = requirementFlowEvidenceBase(flow.name, flow.location);
  const requirementFlowNodes = requirementContext.flowNodesByEvidence.get(flowEvidence)
    ?? requirementContext.flowNodesByName.get(flow.name)
    ?? [];
  // Task 4: infer effects together with call locations so we can point to specific calls
  const observedEffects = flowNode === undefined ? new Set<string>() : inferEffectsFromNode(flowNode);
  const effectCallLocations = flowNode === undefined ? new Map<string, SourceLocation>() : inferEffectCallLocations(flowNode);
  const fnHelperEffects = flowNode === undefined ? new Map<string, SourceLocation | undefined>() : collectFnHelperEffects(flowNode);

  validateDeclaredEffectNames(flow, diagnostics);

  if (flow.qualifier === "pure" && flow.declaredEffects.length > 0) {
    diagnostics.push({
      code: "FUNGI-EFFECT-003",
      name: "EFFECT_BOUNDARY_VIOLATION",
      severity: "error",
      message: `pure flow "${flow.name}" declares effects ${formatEffects(flow.declaredEffects)}. Pure flows must have no effects.`,
      location: flow.location,
      suggestedFix: `Remove the effects declaration, or change "pure flow" to "guarded flow" if side effects are needed.`,
      suggestedCode: `pure flow ${flow.name}`,
    });
  }

  if (flow.qualifier === "pure" && flowNode !== undefined) {
    for (const effect of observedEffects) {
      if (PURE_FORBIDDEN_EFFECTS.has(effect)) {
        diagnostics.push({
          code: "FUNGI-EFFECT-003",
          name: "EFFECT_BOUNDARY_VIOLATION",
          severity: "error",
          message: `pure flow "${flow.name}" uses "${effect}" which is forbidden in pure flows.`,
          location: flow.location,
          suggestedFix: `Move this call to a guarded or secure flow and declare the required effect.`,
          suggestedCode: `guarded flow ${flow.name}`,
        });
      }
    }

    for (const callName of unique(findCallsToEffectfulFlows(flowNode, effectfulFlows))) {
      diagnostics.push({
        code: "FUNGI-EFFECT-003",
        name: "EFFECT_BOUNDARY_VIOLATION",
        severity: "error",
        message: `pure flow "${flow.name}" calls "${callName}" which has declared effects. Pure flows cannot call effectful flows.`,
        location: flow.location,
        suggestedFix: `Change "pure flow" to "guarded flow" and declare the required effects.`,
        suggestedCode: `guarded flow ${flow.name}`,
      });
    }
  }

  // EFFECT-001 (undeclared) / EFFECT-002 (overdeclared): the declared effect set must be a
  // SUPERSET of the observed effects for EVERY governed flow kind. Unqualified `flow` is governed
  // too — it "defaults to governed behavior" (galerina-core-intent-safety-effects.md:43) — so it is
  // checked here alongside `guarded`/`secure`. Only `pure` is excluded: its zero-effect boundary is
  // enforced by the stricter EFFECT-003 path above.
  //
  // FO-DISPATCH-MISSING-CASE (galerina-fail-open-taxonomy.md): this gate previously enumerated only
  // secure/guarded and OMITTED plain `flow`, so a plain flow performing an undeclared effect on a
  // user-named receiver (e.g. `OrdersDB.find` → database.read, which is neither a secure-tier nor a
  // registered stdlib effect) emitted ZERO diagnostics and signed a manifest attesting effects
  // [none]. The enumeration must cover every effectful flow kind — see the exhaustiveness test in
  // tests/effect-checker.test.mjs.
  if (flow.qualifier !== "pure" && flowNode !== undefined) {
    const declared = new Set(flow.declaredEffects);
    const qualifierLabel = flow.qualifier === "flow" ? "plain flow" : `${flow.qualifier} flow`;
    // Pre-compute all missing effects for complete suggestedCode generation
    const missingEffects = [...observedEffects].filter(e => !declared.has(e));
    const mergedEffects = [...new Set([...flow.declaredEffects, ...missingEffects])].sort(); // perf-allow: loop-sort — per-flow one-shot sort over a small effect set (merged / secure-trigger effects); not loop-invariant across flows, not a hot path

    for (const effect of observedEffects) {
      if (!declared.has(effect)) {
        // Task 4: point to the specific call expression that requires the effect
        const callLocation = effectCallLocations.get(effect) ?? flow.location;
        // Task 5: suggestedCode is the complete contract.effects block with all merged effects
        const suggestedContractBlock = mergedEffects.length > 0
          ? buildContractEffectsBlock(mergedEffects)
          : "";
        const detail = {
          severity: "error",
          message: `${qualifierLabel} "${flow.name}" uses effect "${effect}" which is not declared.`,
          location: callLocation,
          suggestedFix: `Add "${effect}" to the effects declaration: effects [${mergedEffects.join(", ")}]`,
          suggestedCode: suggestedContractBlock,
        } as const;
        if (effect === "pii.read") {
          diagnostics.push({
            code: "FUNGI-PII-001",
            name: "PII_AUTHORITY_MISSING",
            ...detail,
          });
        } else if (effect === "phi.read" || effect === "phi.write") {
          diagnostics.push({
            code: "FUNGI-PHI-001",
            name: "PHI_AUTHORITY_MISSING",
            ...detail,
          });
        } else {
          diagnostics.push({
            code: "FUNGI-EFFECT-001",
            name: "UNDECLARED_EFFECT",
            ...detail,
          });
        }
      }
    }

    for (const effect of flow.declaredEffects) {
      if (
        !observedEffects.has(effect)
        && !fnHelperEffects.has(effect)
        && !NON_CALL_OBSERVED_EFFECTS.has(effect)
        && !hasTransitiveEffect(flow.name, effect, allFlows, callGraph, new Set())
      ) {
        if (effect === "audit.write") {
          diagnostics.push({
            code: "FUNGI-AUDIT-001",
            name: "AUDIT_EVIDENCE_MISSING",
            severity: "error",
            message: `${qualifierLabel} "${flow.name}" declares audit.write but produces no audit evidence.`,
            location: flow.location,
            suggestedFix: `Call AuditLog.write on every terminal path, or remove audit.write when no audit obligation exists.`,
          });
        } else {
          diagnostics.push({
            code: "FUNGI-EFFECT-007",
            name: "OVERDECLARED_EFFECT",
            severity: "warning",
            message: `${qualifierLabel} "${flow.name}" declares effect "${effect}" but no matching operation was observed.`,
            location: flow.location,
            suggestedFix: `Remove "${effect}" from the effects declaration if it is not required.`,
          });
        }
      }
    }
  }

  validateInterFlowPropagation(flow, allFlows, callGraph, ast, diagnostics);

  if (flow.qualifier === "flow") {
    for (const effect of flow.declaredEffects) {
      if (PLAIN_FLOW_PRIVILEGED_EFFECTS.has(effect)) {
        diagnostics.push({
          code: "FUNGI-EFFECT-008",
          name: "PRIVILEGED_EFFECT_ON_PLAIN_FLOW",
          severity: "warning",
          message: `Plain flow "${flow.name}" declares privileged effect "${effect}". Use "secure flow" for security-sensitive operations.`,
          location: flow.location,
          suggestedFix: `Change "flow" to "secure flow".`,
          suggestedCode: `secure flow ${flow.name}`,
        });
      }
    }
  }

  // FUNGI-TIER-001 (landing A+B): a flow/guarded declaration that touches a secure-required effect
  // under-declares the obligation — the secure-only passes (intent justification, epilogue proof,
  // secret-egress sealing) gate on qualifier === "secure" and never attach at this tier. Floor:
  // escalate to `secure`. The scan ALWAYS runs; severity is gated on enforceTierFloor — production
  // builds (build-production / build-deterministic) ESCALATE to error (fail the build), while
  // dev/check emit a WARNING so testers see the obligation early without the corpus-breaking error
  // churn. `pure` is intentionally excluded — pure + these effects is already a hard FUNGI-EFFECT-003
  // error above. (Landing A dev-mode warning, 2026-06-24.)
  if (flow.qualifier === "flow" || flow.qualifier === "guarded") {
    const tierEffects = new Set<string>([...observedEffects, ...flow.declaredEffects]);
    const secureTriggers = [...tierEffects].filter((e) => SECURE_REQUIRED_EFFECTS.has(e)).sort(); // perf-allow: loop-sort — per-flow one-shot sort over a small effect set (merged / secure-trigger effects); not loop-invariant across flows, not a hot path
    if (secureTriggers.length > 0) {
      diagnostics.push({
        code: "FUNGI-TIER-001",
        name: "UNDER_DECLARED_FLOW_TIER",
        severity: enforceTierFloor ? "error" : "warning",
        message: `${flow.qualifier} flow "${flow.name}" uses secure-tier effect(s) ${formatEffects(secureTriggers)} but is declared "${flow.qualifier}", not "secure". Secure-only obligations (intent justification, epilogue proof, secret-egress sealing) are skipped at this tier.`,
        location: flow.location,
        suggestedFix: `Declare it "secure flow ${flow.name}" so the secure-tier obligations attach.`,
        suggestedCode: `secure flow ${flow.name}`,
      });
    }
  }

  // FUNGI-STDLIB-001: check stdlib calls against STDLIB_CAPABILITY_MAP
  if (flowNode !== undefined) {
    for (const diag of checkStdlibEffects(flow, flowNode, mode)) {
      diagnostics.push(diag);
    }
  }
  for (const requirementFlowNode of requirementFlowNodes) {
    for (const diag of checkRequirementConstraintEffects(requirementFlowNode, requirementContext)) {
      diagnostics.push(diag);
    }
  }

  // Compute EffectCheckerFlags for this flow
  const isPure = flow.qualifier === "pure";
  const hasNoInferredIO = observedEffects.size === 0;
  const hasNoIO = hasNoInferredIO && flow.declaredEffects.length === 0;
  const pureComputeCandidate  = isPure && hasNoInferredIO;
  const checkerFlags: EffectCheckerFlagsMask =
    (pureComputeCandidate     ? EffectCheckerFlags.PureComputeCandidate  : EffectCheckerFlags.None) |
    (pureComputeCandidate     ? EffectCheckerFlags.ParallelSafe          : EffectCheckerFlags.None) |
    (isPure && hasNoIO        ? EffectCheckerFlags.KernelFusionCandidate : EffectCheckerFlags.None) |
    (isPure && hasNoIO        ? EffectCheckerFlags.EffectFree            : EffectCheckerFlags.None) |
    (pureComputeCandidate     ? EffectCheckerFlags.ReadyForAPU           : EffectCheckerFlags.None) |
    (pureComputeCandidate     ? EffectCheckerFlags.ReadyForNPU           : EffectCheckerFlags.None);

  return {
    flowName: flow.name,
    qualifier: flow.qualifier,
    declaredEffects: flow.declaredEffects,
    observedEffects: [...observedEffects],
    diagnostics,
    checkerFlags,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

// Broad aliases are the short forms without a dot-path qualifier.
// Using these emits FUNGI-EFFECT-005 (BroadAliasUsed — warning, not error).
// Other non-canonical names emit FUNGI-EFFECT-004 (error).
const BROAD_EFFECT_ALIASES: ReadonlySet<string> = new Set([
  "network", "database", "filesystem", "secret", "ai", "audit", "pii", "phi",
  // secret.access is a coarse umbrella (access ⊇ read/write); treated as a broad
  // alias so it is accepted with a nudge (FUNGI-EFFECT-005) toward secret.read /
  // secret.write rather than a hard reject. Reconciliation 2026-07-01.
  // NOTE (2026-07-02; number corrected 2026-07-17): pii.write is deliberately NOT a BROAD alias — so
  // it takes the non-broad alias arm below → FUNGI-EFFECT-009 (NON_CANONICAL_EFFECT) error suggesting
  // database.write (the "#20 split" moved this off 004). The Wave-2 intent — "error, not warning" —
  // holds: 009 is still an error, so softening to a warning would widen the accept surface. The
  // teaching corpus declares database.write and carries the pii intent in privacy{}/protected params.
  "secret.access",
]);

// Levenshtein (small, local) — used ONLY to nudge a LIKELY TYPO of a real
// effect name toward its canonical spelling. It never changes WHAT is rejected
// (unknown names stay FUNGI-EFFECT-004 errors); it only adds a "did you mean"
// suggestion. A wild invention (e.g. totally.fake.effect) lands far from every
// canonical name and correctly gets NO suggestion — the generic list instead.
function effectEditDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  const row: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? (row[j - 1] ?? j - 1)
          : 1 + Math.min(row[j] ?? j, prev, row[j - 1] ?? j - 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[n] = prev;
  }
  return row[n] ?? 0;
}

function nearestCanonicalEffect(name: string): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  // Consider canonical names AND alias keys (a typo of a known alias should
  // still resolve to the alias's canonical spelling, not be left dangling).
  for (const cand of CANONICAL_EFFECTS) {
    const d = effectEditDistance(name, cand);
    if (d < bestDist) { bestDist = d; best = cand; }
  }
  for (const [alias, canonical] of EFFECT_NAME_ALIASES) {
    const d = effectEditDistance(name, alias);
    if (d < bestDist) { bestDist = d; best = canonical; }
  }
  // Only nudge when the miss is plausibly a typo: within max(2, len/4) edits.
  const threshold = Math.max(2, Math.floor(name.length / 4));
  return best !== undefined && bestDist <= threshold ? best : undefined;
}

function validateDeclaredEffectNames(flow: FlowMeta, diagnostics: EffectDiagnostic[]): void {
  for (const effect of flow.declaredEffects) {
    // Deny-only names are checked FIRST: recognised, never grantable, every profile.
    if (DENY_ONLY_EFFECTS.has(effect)) {
      diagnostics.push({
        code: "FUNGI-EFFECT-006",
        name: "DENY_ONLY_EFFECT",
        severity: "error",
        message: `Effect "${effect}" is deny-only: it is a recognised name but can never be granted (no capability, no host import, no admission path). Remove it — there is no declaration that makes this flow admissible.`,
        location: flow.location,
        suggestedFix: `Remove "${effect}" from the effects declaration and restructure the flow to avoid dynamic evaluation.`,
        why: `Deny-only effects mark operations the platform refuses by construction. Declaring one is not an under-declaration to fix but a design boundary: the operation itself is not admissible.`,
      });
      continue;
    }
    const canonical = EFFECT_NAME_ALIASES.get(effect);
    if (canonical !== undefined) {
      if (BROAD_EFFECT_ALIASES.has(effect)) {
        // FUNGI-EFFECT-005: broad alias — warn, not error; developer should use canonical form
        diagnostics.push({
          code: "FUNGI-EFFECT-005",
          name: "BROAD_ALIAS_USED",
          severity: "warning",
          message: `Effect "${effect}" is a broad alias. Use the canonical name "${canonical}" to precisely declare authority.`,
          location: flow.location,
          suggestedFix: `Replace "${effect}" with "${canonical}" in the effects declaration.`,
          suggestedCode: canonical,
          why: `Broad aliases are ambiguous and may grant more authority than intended. "${effect}" maps to "${canonical}" but a future Galerina version may expand the meaning.`,
        });
      } else {
        // Other alias variants (e.g. "http.get" → "network.outbound") — non-canonical, error
        diagnostics.push({
          code: "FUNGI-EFFECT-009",
          name: "NON_CANONICAL_EFFECT",
          severity: "error",
          message: `Effect "${effect}" is not a canonical effect name. Use "${canonical}".`,
          location: flow.location,
          suggestedFix: `Replace "${effect}" with "${canonical}" in the effects declaration.`,
          suggestedCode: canonical,
        });
      }
    } else if (!CANONICAL_EFFECTS.has(effect)) {
      const near = nearestCanonicalEffect(effect);
      diagnostics.push({
        code: "FUNGI-EFFECT-004",
        name: "UNKNOWN_EFFECT",
        severity: "error",
        message: near
          ? `Effect "${effect}" is not a recognised Galerina effect name. Did you mean "${near}"?`
          : `Effect "${effect}" is not a recognised Galerina effect name.`,
        location: flow.location,
        ...(near ? { suggestedCode: near } : {}),
        suggestedFix: near
          ? `Replace "${effect}" with "${near}", or use a canonical effect name (network.outbound, database.write, audit.write, secret.read, storage.read).`
          : `Use a canonical effect name such as: network.outbound, database.write, audit.write, secret.read, storage.read`,
      });
    }
  }
}

function validateInterFlowPropagation(
  flow: FlowMeta,
  allFlows: readonly FlowMeta[],
  callGraph: ReadonlyMap<string, ReadonlySet<string>>,
  ast: AstNode,
  diagnostics: EffectDiagnostic[],
): void {
  const declared = new Set(flow.declaredEffects);
  const requiredEffects = collectTransitiveCalledEffects(flow.name, allFlows, callGraph, new Set([flow.name]));

  for (const [effect, calledName] of requiredEffects) {
    if (!declared.has(effect)) {
      diagnostics.push({
        code: "FUNGI-EFFECT-002",
        name: "TRANSITIVE_EFFECT_NOT_DECLARED",
        severity: "error",
        message: `Flow "${flow.name}" calls "${calledName}" which requires effect "${effect}", but "${flow.name}" does not declare it.`,
        location: flow.location,
        suggestedFix: `Add "${effect}" to effects: effects [${[...declared, effect].join(", ")}]`,
        suggestedCode: `effects [${[...declared, effect].join(", ")}]`,
      });
    }
  }

  // Task 3: check fn helpers declared within this flow for effect-producing calls.
  // Applies to every governed flow kind (flow/guarded/secure); `pure` is excluded — its
  // zero-effect boundary is enforced by EFFECT-003. (Was gated to secure/guarded only; the
  // plain-`flow` omission was the same FO-DISPATCH-MISSING-CASE fail-open as the EFFECT-001 gate.)
  const flowNode = findFlowNode(ast, flow.name);
  if (flowNode !== undefined && flow.qualifier !== "pure") {
    const fnHelperEffects = collectFnHelperEffects(flowNode);
    for (const [effect, fnCallLoc] of fnHelperEffects) {
      if (!declared.has(effect)) {
        diagnostics.push({
          code: "FUNGI-EFFECT-002",
          name: "TRANSITIVE_EFFECT_NOT_DECLARED",
          severity: "error",
          message: `Flow "${flow.name}" has a fn helper that uses effect "${effect}" which is not declared on the parent flow.`,
          location: fnCallLoc ?? flow.location,
          suggestedFix: `Add "${effect}" to effects: effects [${[...declared, effect].join(", ")}]`,
          suggestedCode: `effects [${[...declared, effect].join(", ")}]`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// FUNGI-STDLIB-001: stdlib call requires undeclared effect
// ---------------------------------------------------------------------------

// FAIL-CLOSED (#153): the broad effect that *any* method on a known-effectful
// stdlib module requires, used when the specific method is NOT registered in
// STDLIB_CAPABILITY_MAP. An unregistered method on an effectful module (e.g.
// `Database.someNewMethod()`) must NOT be treated as effect-free; it has to
// carry at least the module's broad authority so the developer is forced to
// declare it. Deny-by-default: if a module is known to be effectful, its
// authority is required even for methods the compiler does not yet recognise.
const EFFECTFUL_MODULE_BROAD_EFFECT: ReadonlyMap<string, string> = new Map([
  ["File",         "storage.read"],
  ["FileSystem",   "storage.read"],
  ["fs",           "storage.read"],
  ["Http",         "network.outbound"],
  ["http",         "network.outbound"],
  ["https",        "network.outbound"],
  ["Database",     "database.read"],
  ["database",     "database.read"],
  ["AuditLog",     "audit.write"],
  ["audit",        "audit.write"],
  ["Secrets",      "secret.read"],
  ["Env",          "secret.read"],
  ["env",          "secret.read"],
  ["vault",        "secret.read"],
  ["EmailService", "email.send"],
  ["email",        "email.send"],
  ["AI",           "ai.inference"],
  ["ai",           "ai.inference"],
  ["Model",        "ai.inference"],
  ["Classifier",   "ai.inference"],
  ["Clock",        "clock.read"],
  ["Random",       "random.generate"],
]);

/**
 * FAIL-CLOSED (#153): returns the broad effect required for an *unregistered*
 * method on a known-effectful module, or undefined when the receiver is not a
 * known-effectful stdlib module (user-defined / pure modules are unaffected).
 *
 * The receiver MUST be a capitalised module name (e.g. `Database`, `AuditLog`,
 * `Http`). The lowercase aliases that also live in STDLIB_MODULE_KIND
 * (`email`, `http`, `database`, ...) are deliberately NOT matched here: a
 * lowercase first-child identifier is far more likely to be a record-field key
 * (`{ email: ... }`) or a local binding than a real module reference, and
 * treating it as a module produced false positives. Real module-qualified calls
 * in Galerina are capitalised, matching the convention used across the compiler.
 */
function broadEffectForUnknownEffectfulCall(
  receiverName: string,
  methodName: string,
): string | undefined {
  if (receiverName === "") return undefined;
  // Only capitalised receivers are treated as module references.
  const first = receiverName[0] ?? "";
  if (first < "A" || first > "Z") return undefined;
  // Synthetic / non-method member access (e.g. record-literal internals) is not
  // a real effectful operation — ignore anything that is not a plain identifier
  // method name.
  if (methodName === "" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(methodName)) return undefined;
  if (getStdlibModuleKind(receiverName) !== "effectful") return undefined;
  return EFFECTFUL_MODULE_BROAD_EFFECT.get(receiverName);
}

/**
 * Walks the AST for callExpr nodes in a flow's body.
 * For each call, reconstructs the full qualified name (receiver.method or method)
 * and looks it up in STDLIB_CAPABILITY_MAP.
 * If found AND any required effect is NOT in flow.declaredEffects → emit FUNGI-STDLIB-001.
 *
 * FAIL-CLOSED (#153): if the receiver is a known-effectful module but the
 * specific method is NOT in the capability map, the call is treated as
 * requiring the module's broad effect (FUNGI-STDLIB-002) instead of being
 * silently allowed.
 *
 * Severity: "error" in production mode, "warning" in development mode.
 */
export function checkStdlibEffects(
  flow: FlowMeta,
  flowNode: AstNode,
  mode: EffectCheckerMode = "production",
): readonly EffectDiagnostic[] {
  const diagnostics: EffectDiagnostic[] = [];
  const declared = new Set(flow.declaredEffects);
  const severity: "error" | "warning" = mode === "production" ? "error" : "warning";
  const aliasMap = buildModuleAliasMap(flowNode); // C1: resolve `let x = Module` aliases
  const localBindings = collectLocalBindings(flowNode); // shadow-aware receiver resolution

  function walk(node: AstNode): void {
    if (node.kind === "callExpr") {
      const methodName = node.value ?? "";
      const receiver = node.children?.[0];
      const rawReceiver =
        receiver?.kind === "identifier" ? (receiver.value ?? "") : "";
      // C1: resolve a module alias (`let x = AuditLog; x.someMethod()` → AuditLog) so an UNREGISTERED
      // method on an aliased effectful module still requires the module's broad effect (#153 deny-by-
      // default). The alias resolves a lowercase `x` to the capitalised module name the gate expects.
      // Shadow-aware: a local rebinding of a stdlib module name is DATA — clearing the receiver
      // suppresses the module-keyed fullName lookup AND the broad-effect gate (empty receiver returns
      // undefined there); the bare methodName fallback below still runs unchanged.
      const receiverName = isShadowedStdlibReceiver(rawReceiver, localBindings, aliasMap)
        ? ""
        : (aliasMap.get(rawReceiver) ?? rawReceiver);
      const fullName =
        receiverName !== "" ? `${receiverName}.${methodName}` : methodName;

      // Check full qualified name first, then plain method name as fallback
      const namesToCheck: string[] = fullName !== methodName
        ? [fullName, methodName]
        : [methodName];

      let matchedInMap = false;
      for (const name of namesToCheck) {
        const requiredEffects = getStdlibRequiredEffects(name);
        if (requiredEffects === undefined) continue;  // not in stdlib map

        matchedInMap = true;
        for (const requiredEffect of requiredEffects) {
          if (requiredEffect === "") continue;  // pure stdlib call — no effect needed
          if (!declared.has(requiredEffect)) {
            diagnostics.push({
              code: "FUNGI-STDLIB-001",
              name: "STDLIB_EFFECT_NOT_DECLARED",
              severity,
              message: `${name} requires ${requiredEffect} which is not declared in the contract.`,
              ...(node.location !== undefined ? { location: node.location } : {}),
              suggestedFix: `Add ${requiredEffect} to the contract: contract { effects { ${requiredEffect} } }`,
              suggestedCode: requiredEffect,
            });
          }
        }
        break;  // matched the first name that exists in the map; don't double-report
      }

      // FAIL-CLOSED (#153): the call did NOT match any capability-map entry, but
      // the receiver is a known-effectful stdlib module. An unregistered method
      // on such a module must not be silently allowed — require the module's
      // broad effect (deny-by-default for unrecognised effectful operations).
      if (!matchedInMap) {
        const broadEffect = broadEffectForUnknownEffectfulCall(receiverName, methodName);
        if (broadEffect !== undefined && !declared.has(broadEffect)) {
          diagnostics.push({
            code: "FUNGI-STDLIB-002",
            name: "UNKNOWN_EFFECTFUL_STDLIB_CALL",
            severity,
            message: `${fullName} is an unrecognised method on the effectful module "${receiverName}"; it requires at least ${broadEffect} which is not declared in the contract. Effectful modules are deny-by-default: declare the effect or use a recognised operation.`,
            ...(node.location !== undefined ? { location: node.location } : {}),
            suggestedFix: `Add ${broadEffect} to the contract: contract { effects { ${broadEffect} } }`,
            suggestedCode: broadEffect,
          });
        }
      }
    }
    for (const child of node.children ?? []) walk(child);
  }

  walk(flowNode);
  return diagnostics;
}

function collectTransitiveCalledEffects(
  flowName: string,
  allFlows: readonly FlowMeta[],
  callGraph: ReadonlyMap<string, ReadonlySet<string>>,
  seen: Set<string>,
): Map<string, string> {
  const effects = new Map<string, string>();
  const calledFlows = callGraph.get(flowName) ?? new Set<string>();

  for (const calledName of calledFlows) {
    const calledMeta = allFlows.find((candidate) => candidate.name === calledName); // perf-allow: loop-array-find — linear flow lookup in the recursive transitive-effect walk; a real fix threads a name→FlowMeta index (deferred); bounded by call-graph size; security pass
    if (calledMeta === undefined) continue;

    for (const effect of calledMeta.declaredEffects) {
      if (!effects.has(effect)) {
        effects.set(effect, calledName);
      }
    }

    if (!seen.has(calledName)) {
      seen.add(calledName);
      for (const [effect, introducer] of collectTransitiveCalledEffects(calledName, allFlows, callGraph, seen)) {
        if (!effects.has(effect)) {
          effects.set(effect, introducer);
        }
      }
    }
  }

  return effects;
}

function hasTransitiveEffect(
  flowName: string,
  effect: string,
  allFlows: readonly FlowMeta[],
  callGraph: ReadonlyMap<string, ReadonlySet<string>>,
  seen: Set<string>,
): boolean {
  if (seen.has(flowName)) return false;
  seen.add(flowName);

  const calledFlows = callGraph.get(flowName) ?? new Set<string>();
  for (const calledName of calledFlows) {
    const calledMeta = allFlows.find((candidate) => candidate.name === calledName); // perf-allow: loop-array-find — linear flow lookup in the recursive transitive-effect walk; a real fix threads a name→FlowMeta index (deferred); bounded by call-graph size; security pass
    if (calledMeta?.declaredEffects.includes(effect) === true) return true;
    if (hasTransitiveEffect(calledName, effect, allFlows, callGraph, seen)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function findFlowNode(ast: AstNode, name: string): AstNode | undefined {
  // A governed flow parses to `governedFlowDecl` with an encoded value
  // ("governed:<floor>:<name>"), so the old `kind ∈ SET && value === name` shape
  // missed it twice and a governed flow was effect-checked as if it had NO body
  // (observedEffects empty). `isFlowDeclNamed` decodes all five tiers, so a
  // governed flow is now found and checked at least as strictly as a guarded one.
  function walk(node: AstNode): AstNode | undefined {
    if (isFlowDeclNamed(node, name)) {
      return node;
    }
    for (const child of node.children ?? []) {
      const found = walk(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  return walk(ast);
}

function buildFlowCallGraph(
  flows: readonly FlowMeta[],
  ast: AstNode,
): ReadonlyMap<string, ReadonlySet<string>> {
  const knownFlows = new Set(flows.map((flow) => flow.name));

  // Build plain descriptors for each flow — no AstNode references cross the boundary
  const descriptors = flows.map((flow) => {
    const node = findFlowNode(ast, flow.name);
    const calledFlows: string[] = [];
    if (node !== undefined) {
      const calls = new Set<string>();
      findDirectFlowCalls(node, knownFlows, calls);
      calledFlows.push(...calls);
    }
    return {
      name: flow.name,
      qualifier: flow.qualifier,
      calledFlows,
    };
  });

  // Use devtools-graph to build a formal CallGraph for structural analysis
  const callGraph = buildCallGraph(descriptors);

  // Check for circular flow dependencies and log via detectCycle
  const cycleResult = detectCycle(callGraph);
  if (cycleResult.hasCycle && cycleResult.cycle !== undefined) {
    // Cycle detected — callers will see diagnostic FUNGI-EFFECT-002 from
    // collectTransitiveCalledEffects (which guards against infinite recursion
    // using the `seen` set). The cycle is recorded here for future diagnostics.
    // No throw: the checker degrades gracefully on cycles.
    void cycleResult.cycle; // acknowledged; used by topoSort result below
  }

  // Use topoSort to produce a processing order (leaves first, callers last).
  // The `order` is available for future passes that need bottom-up propagation.
  const { order: _topoOrder } = topoSort(callGraph);
  void _topoOrder; // available for downstream use if needed

  // Convert the CallGraph back to the adjacency map the rest of this module uses.
  // This keeps the existing recursive helpers (hasTransitiveEffect, etc.) unchanged.
  const adjacency = new Map<string, ReadonlySet<string>>();
  for (const node of callGraph.nodes()) {
    const callees = new Set(callGraph.outEdges(node.id).map((edge) => edge.to));
    adjacency.set(node.id, callees);
  }

  return adjacency;
}

function findDirectFlowCalls(
  node: AstNode,
  knownFlows: ReadonlySet<string>,
  result: Set<string>,
): void {
  if (node.kind === "callExpr" && node.value !== undefined && knownFlows.has(node.value)) {
    result.add(node.value);
  }
  for (const child of node.children ?? []) {
    findDirectFlowCalls(child, knownFlows, result);
  }
}

function findCallsToEffectfulFlows(
  node: AstNode,
  effectfulFlows: ReadonlySet<string>,
): string[] {
  const calls: string[] = [];

  function walk(n: AstNode): void {
    if (n.kind === "callExpr" && n.value !== undefined && effectfulFlows.has(n.value)) {
      calls.push(n.value);
    }
    for (const child of n.children ?? []) {
      walk(child);
    }
  }

  walk(node);
  return calls;
}

function inferEffectsFromNode(node: AstNode): Set<string> {
  const effects = new Set<string>();
  const aliasMap = buildModuleAliasMap(node); // C1: resolve `let x = Module` aliases before matching
  const localBindings = collectLocalBindings(node); // shadow-aware: local rebind of a module name is data

  function walk(n: AstNode): void {
    // Task 3: skip fnDecl bodies — their effects are handled separately via
    // collectFnHelperEffects / validateInterFlowPropagation to emit EFFECT-002
    if (n.kind === "fnDecl") return;
    if (n.kind === "callExpr" || n.kind === "memberExpr") {
      if (!isShadowedStdlibReceiver(rootReceiverRaw(n), localBindings, aliasMap)) {
        const callText = buildCallText(n, aliasMap);
        for (const effect of inferEffectsForCallText(callText, n.kind === "callExpr")) {
          effects.add(effect);
        }
      }
    }
    for (const child of n.children ?? []) {
      walk(child);
    }
  }

  walk(node);
  return effects;
}

/**
 * Task 4: Walk the flow node and record the source location of the FIRST call
 * expression that requires each effect. Used to point EFFECT-001 at the specific
 * call rather than the flow declaration header.
 */
function inferEffectCallLocations(node: AstNode): Map<string, SourceLocation> {
  const locations = new Map<string, SourceLocation>();
  const aliasMap = buildModuleAliasMap(node); // C1: alias-aware, consistent with inferEffectsFromNode
  const localBindings = collectLocalBindings(node); // shadow-aware, consistent with inferEffectsFromNode

  function walk(n: AstNode): void {
    // Skip fnDecl bodies — consistent with inferEffectsFromNode
    if (n.kind === "fnDecl") return;
    if (n.kind === "callExpr" || n.kind === "memberExpr") {
      if (!isShadowedStdlibReceiver(rootReceiverRaw(n), localBindings, aliasMap)) {
        const callText = buildCallText(n, aliasMap);
        for (const effect of inferEffectsForCallText(callText, n.kind === "callExpr")) {
          if (!locations.has(effect) && n.location !== undefined) {
            locations.set(effect, n.location);
          }
        }
      }
    }
    for (const child of n.children ?? []) {
      walk(child);
    }
  }

  walk(node);
  return locations;
}

/**
 * Task 3: Find fn helpers declared within a flow node and collect the effects
 * their bodies produce, together with the call site location.
 *
 * A fn helper is a `fnDecl` node that appears as a child of the flow body.
 * Its body is walked for effect-producing call expressions.
 */
function collectFnHelperEffects(flowNode: AstNode): Map<string, SourceLocation | undefined> {
  const effects = new Map<string, SourceLocation | undefined>();
  // Shadow-aware, consistent with inferEffectsFromNode. Collected flow-wide (fn helper paramDecls
  // are fnDecl children, so BINDING_DECL_KINDS picks them up); no aliasMap here — this walk never
  // alias-resolved (buildCallText is called bare), so an empty map keeps behaviour identical.
  const localBindings = collectLocalBindings(flowNode);
  const noAliases: ReadonlyMap<string, string> = new Map();

  function walkForFns(n: AstNode): void {
    if (n.kind === "fnDecl") {
      // Walk the fn body for effect calls
      for (const child of n.children ?? []) {
        walkForEffects(child);
      }
      return; // don't recurse further into nested fnDecls here
    }
    for (const child of n.children ?? []) {
      walkForFns(child);
    }
  }

  function walkForEffects(n: AstNode): void {
    if (n.kind === "callExpr" || n.kind === "memberExpr") {
      if (!isShadowedStdlibReceiver(rootReceiverRaw(n), localBindings, noAliases)) {
        const callText = buildCallText(n);
        for (const effect of inferEffectsForCallText(callText, n.kind === "callExpr")) {
          if (!effects.has(effect)) {
            effects.set(effect, n.location);
          }
        }
      }
    }
    for (const child of n.children ?? []) {
      walkForEffects(child);
    }
  }

  walkForFns(flowNode);
  return effects;
}

function buildCallText(node: AstNode, aliasMap?: ReadonlyMap<string, string>): string {
  if (node.kind === "callExpr") {
    const methodName = node.value ?? "";
    const receiver = node.children?.[0];
    if (receiver !== undefined) {
      const receiverText = buildCallText(receiver, aliasMap);
      // C1: an alias resolves a lowercase receiver to a module name (`x` → `AuditLog`); the raw node is
      // not member-like (lowercase `x`), so also accept when the RESOLVED text looks like a module, so
      // `x.write` builds as `AuditLog.write` and the effect patterns match. Resolving a non-module alias
      // is harmless — the resulting text simply won't match any effect pattern.
      if (receiverText !== "" && (receiverLooksLikeMemberReceiver(receiver) || nameLooksLikeModule(receiverText))) {
        return `${receiverText}.${methodName}`;
      }
    }
    return methodName;
  }
  if (node.kind === "memberExpr") {
    const receiver = node.children?.[0];
    const member = node.value ?? "";
    if (receiver !== undefined) {
      const receiverText = buildCallText(receiver, aliasMap);
      return receiverText !== "" ? `${receiverText}.${member}` : member;
    }
    return member;
  }
  if (node.kind === "identifier") {
    const name = node.value ?? "";
    // C1: resolve a module alias at the receiver leaf (`let x = AuditLog` → `x` reads as `AuditLog`).
    return aliasMap?.get(name) ?? name;
  }
  return "";
}

function nameLooksLikeModule(value: string): boolean {
  return /^[A-Z]/.test(value) || value === "http" || value === "fs" || value === "env" || value === "json" || value === "toml" || value === "vault";
}

function receiverLooksLikeMemberReceiver(node: AstNode): boolean {
  if (node.kind === "memberExpr") return true;
  if (node.kind !== "identifier") return false;
  return nameLooksLikeModule(node.value ?? "");
}

function formatEffects(effects: readonly string[]): string {
  return `[${effects.join(", ")}]`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

// ---------------------------------------------------------------------------
// Flat diagnostic converter (for merging into CompilerResult)
// ---------------------------------------------------------------------------

export function effectResultsToDiagnostics(
  results: readonly EffectCheckResult[],
): readonly ParseDiagnostic[] {
  return results.flatMap((r) =>
    r.diagnostics.map((d) => ({
      code: d.code,
      name: d.name,
      severity: d.severity,
      message: d.message,
      ...(d.location !== undefined ? { location: d.location } : {}),
      ...(d.suggestedFix !== undefined ? { suggestedFix: d.suggestedFix } : {}),
      ...(d.suggestedCode !== undefined ? { suggestedCode: d.suggestedCode } : {}),
    })),
  );
}
