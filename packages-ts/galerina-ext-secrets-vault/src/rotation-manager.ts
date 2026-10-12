/**
 * galerina-ext-secrets-vault — SecretsRotationManager
 *
 * Implements the dual-token validation window described in the design doc:
 *
 *   Stage new value → quiesce (50 ms drain window) → atomic swap → zero-wipe old slot
 *
 * The guest is never restarted; in-flight reads using the old value complete
 * safely within the quiesce window before the swap happens.
 */
import type { SecretCredential, SecretHandle, SecretHandleStatus, RotationPolicy } from "./types.js";
import type { VaultClient } from "./vault-client.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Quiesce wait: allow in-flight reads to drain before the atomic swap. */
const QUIESCE_MS = 50;
const isBuffer = Buffer.isBuffer.bind(Buffer);
const copyBuffer = Buffer.from.bind(Buffer);
const allocateBuffer = Buffer.alloc.bind(Buffer);
const fillBytes = Uint8Array.prototype.fill;
const setBytes = Uint8Array.prototype.set;
const applyIntrinsic = Reflect.apply;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "length",
)?.get;
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag,
)?.get;

function wipeBuffer(value: Uint8Array): void {
  fillBytes.call(value, 0);
}

function wipeOrRetain(value: Uint8Array, retainFailedWipe: (value: Uint8Array) => void): boolean {
  try {
    wipeBuffer(value);
    return true;
  } catch {
    // Keep every failed cleanup obligation, including detached views that
    // cannot be retried through this reference. Their bytes were not proven
    // wiped, so protected access stays quarantined rather than assuming safety.
    retainFailedWipe(value);
    return false;
  }
}

function ownProviderBuffer(
  value: unknown,
  retainFailedWipe: (value: Uint8Array) => void,
  retainUnverifiableOutput: (value: unknown) => void,
): Buffer {
  if (!isBuffer(value)) {
    // A provider contract violation can still hand us secret bytes. Clean a
    // genuine Uint8Array view through captured intrinsics, but refuse to adopt
    // it as the manager's Buffer. Other opaque values may be secret-bearing;
    // no generic operation can prove or perform their cleanup.
    let isUint8ArrayView = false;
    if (typedArrayTagGetter !== undefined) {
      try {
        isUint8ArrayView = applyIntrinsic(typedArrayTagGetter, value, []) === "Uint8Array";
      } catch {
        // Fall through to the opaque-output refusal below.
      }
    }
    if (isUint8ArrayView) {
      wipeOrRetain(value as Uint8Array, retainFailedWipe);
    } else if (
      value !== null && (
        typeof value === "object" || typeof value === "function" ||
        typeof value === "string" || typeof value === "symbol" || typeof value === "bigint"
      )
    ) {
      retainUnverifiableOutput(value);
    }
    throw new TypeError("SecretsRotationManager: provider must return a Buffer");
  }

  let ownedValue: Buffer | undefined;
  try {
    if (typedArrayLengthGetter === undefined) {
      throw new TypeError("typed-array length intrinsic is unavailable");
    }
    const length = applyIntrinsic(typedArrayLengthGetter, value, []) as number;
    ownedValue = allocateBuffer(length);
    applyIntrinsic(setBytes, ownedValue, [value]);
  } catch {
    wipeOrRetain(value, retainFailedWipe);
    if (ownedValue !== undefined) wipeOrRetain(ownedValue, retainFailedWipe);
    throw new Error("SecretsRotationManager: provider buffer transfer failed");
  }

  if (!wipeOrRetain(value, retainFailedWipe)) {
    wipeOrRetain(ownedValue, retainFailedWipe);
    throw new Error("SecretsRotationManager: provider buffer cleanup failed");
  }
  return ownedValue;
}

function ownDataProperty(target: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError("credential property must be an own data property");
  }
  return descriptor.value;
}

function snapshotCredential(credential: SecretCredential): SecretCredential {
  try {
    if (typeof credential !== "object" || credential === null) {
      throw new TypeError("credential must be an object");
    }
    const id = ownDataProperty(credential, "id");
    const provider = ownDataProperty(credential, "provider");
    const path = ownDataProperty(credential, "path");
    const mountDescriptor = Object.getOwnPropertyDescriptor(credential, "mountPoint");
    if (mountDescriptor !== undefined && !("value" in mountDescriptor)) {
      throw new TypeError("mountPoint must be a data property");
    }
    const mountPoint = mountDescriptor === undefined ? "secret" : mountDescriptor.value;
    if (
      typeof id !== "string" || id.length === 0 ||
      provider !== "hashicorp_vault" ||
      typeof path !== "string" || path.length === 0 ||
      typeof mountPoint !== "string" || mountPoint.length === 0
    ) {
      throw new TypeError("credential fields are invalid");
    }
    return Object.freeze({ id, provider, path, mountPoint });
  } catch {
    throw new Error("SecretsRotationManager: invalid credential descriptor");
  }
}

function logErrorSafely(message: string): void {
  try {
    console.error(message);
  } catch {
    // Diagnostic output is never allowed to prevent a security state change.
  }
}

/** A duplicate request is not a fault in the rotation already holding the lease. */
class RotationLeaseBusyError extends Error {
  constructor() {
    super("SecretsRotationManager.rotate: rotation lease already active");
    this.name = "RotationLeaseBusyError";
  }
}

/** Provider exceptions may contain secret material, so never propagate them. */
async function readProviderSecret(
  vaultClient: VaultClient,
  path: string,
  mountPoint: string
): Promise<Buffer> {
  try {
    return await vaultClient.readSecret(path, mountPoint);
  } catch {
    throw new Error("SecretsRotationManager: vault provider read failed");
  }
}

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

export class SecretsRotationManager {
  /** credential-id → live handle */
  private readonly handles: Map<string, SecretHandle> = new Map();
  /** At most one live rotation lease per credential. Concurrent requests refuse. */
  private readonly rotations: Map<string, Promise<void>> = new Map();
  /** At most one provider load may publish a credential at a time. */
  private readonly loading = new Set<string>();
  /** Provider code may re-enter this manager; close active reads until it settles. */
  private providerReadsInProgress = 0;
  /** Failed wipes stay owned here until a later attempt succeeds. */
  private readonly pendingWipes = new Set<Uint8Array>();
  /** Opaque provider outputs have no safe generic wipe/retry path. */
  private readonly unverifiableProviderOutputs = new Set<unknown>();
  private lifecycleGeneration = 0;
  private disposed = false;

  private wipeOwnedBuffer(value: Uint8Array): boolean {
    try {
      wipeBuffer(value);
      this.pendingWipes.delete(value);
      return true;
    } catch {
      this.pendingWipes.add(value);
      return false;
    }
  }

  private retryPendingWipes(): boolean {
    if (this.unverifiableProviderOutputs.size > 0) return false;
    for (const value of this.pendingWipes) {
      this.wipeOwnedBuffer(value);
    }
    return this.pendingWipes.size === 0;
  }

  private async readFromProvider<T>(
    vaultClient: VaultClient,
    path: string,
    mountPoint: string,
    takeOwnership: (providerValue: Buffer) => T,
  ): Promise<T> {
    this.providerReadsInProgress += 1;
    try {
      const providerValue = await readProviderSecret(vaultClient, path, mountPoint);
      return takeOwnership(providerValue);
    } finally {
      this.providerReadsInProgress -= 1;
    }
  }

  /**
   * Load a credential from Vault and store it as the active handle.
   * If a handle for this id already exists it is replaced (fresh load).
   * Concurrent same-id loads and loads after dispose() are refused.
   */
  async load(
    credential: SecretCredential,
    vaultClient: VaultClient
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("SecretsRotationManager: manager is disposed");
    }
    if (!this.retryPendingWipes()) {
      throw new Error("SecretsRotationManager: cleanup incomplete");
    }
    const lifecycleGeneration = this.lifecycleGeneration;
    const snapshot = snapshotCredential(credential);
    if (this.disposed || this.lifecycleGeneration !== lifecycleGeneration) {
      throw new Error("SecretsRotationManager: load invalidated by disposal");
    }
    const credentialId = snapshot.id;
    if (this.loading.has(credentialId)) {
      throw new Error("SecretsRotationManager: load already active");
    }
    this.loading.add(credentialId);
    let activeValue: Buffer | undefined;
    let committed = false;
    try {
      activeValue = await this.readFromProvider(
        vaultClient,
        snapshot.path,
        snapshot.mountPoint ?? "secret",
        (providerValue) => ownProviderBuffer(
          providerValue,
          (failed) => { this.pendingWipes.add(failed); },
          (opaque) => { this.unverifiableProviderOutputs.add(opaque); },
        ),
      );
      if (this.disposed || this.lifecycleGeneration !== lifecycleGeneration) {
        throw new Error("SecretsRotationManager: load invalidated by disposal");
      }
      const existing = this.handles.get(credentialId);
      const version = existing !== undefined ? existing.version + 1 : 1;

      // Zero-wipe the old active value if we're replacing
      if (existing !== undefined) {
        existing.faulted = true;
        const activeWiped = this.wipeOwnedBuffer(existing.activeValue);
        let stagingWiped = true;
        if (existing.stagingValue !== null) {
          stagingWiped = this.wipeOwnedBuffer(existing.stagingValue);
        }
        if (!activeWiped || !stagingWiped) {
          throw new Error("SecretsRotationManager: cleanup incomplete");
        }
      }

      this.handles.set(credentialId, {
        id: credentialId,
        activeValue,
        stagingValue: null,
        version,
      });
      committed = true;
    } finally {
      this.loading.delete(credentialId);
      if (!committed && activeValue !== undefined) {
        this.wipeOwnedBuffer(activeValue);
      }
    }
  }

  /**
   * Dual-token rotation:
   *   1. Fetch new secret from Vault → store in stagingValue
   *   2. Quiesce: wait QUIESCE_MS for in-flight reads to complete
   *   3. Atomic swap: activeValue ← stagingValue
   *   4. Zero-wipe the old active buffer
   *   5. Clear stagingValue
   */
  private beginRotation(
    credentialId: string,
    vaultClient: VaultClient,
    credential?: SecretCredential
  ): Promise<void> | undefined {
    if (this.rotations.has(credentialId)) return undefined;

    let resolveOperation!: () => void;
    let rejectOperation!: (reason: unknown) => void;
    const operation = new Promise<void>((resolve, reject) => {
      resolveOperation = resolve;
      rejectOperation = reject;
    });
    this.rotations.set(credentialId, operation);
    // Publish the lease before calling provider code: readSecret may re-enter
    // this manager synchronously before returning its Promise.
    void this.rotateOnce(credentialId, vaultClient, credential).then(
      resolveOperation,
      rejectOperation,
    );
    return operation;
  }

  private releaseRotation(credentialId: string, operation: Promise<void>): void {
    if (this.rotations.get(credentialId) === operation) {
      this.rotations.delete(credentialId);
    }
  }

  async rotate(
    credentialId: string,
    vaultClient: VaultClient,
    credential?: SecretCredential
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("SecretsRotationManager: manager is disposed");
    }
    if (!this.retryPendingWipes()) {
      throw new Error("SecretsRotationManager: cleanup incomplete");
    }
    if (typeof credentialId !== "string" || credentialId.length === 0) {
      throw new Error("SecretsRotationManager.rotate: invalid credential key");
    }
    const snapshot = credential === undefined ? undefined : snapshotCredential(credential);
    if (snapshot !== undefined && snapshot.id !== credentialId) {
      throw new Error("SecretsRotationManager.rotate: credential descriptor does not match key");
    }
    const operation = this.beginRotation(credentialId, vaultClient, snapshot);
    if (operation === undefined) throw new RotationLeaseBusyError();
    try {
      await operation;
    } finally {
      this.releaseRotation(credentialId, operation);
    }
  }

  private async rotateOnce(
    credentialId: string,
    vaultClient: VaultClient,
    credential?: SecretCredential
  ): Promise<void> {
    const handle = this.handles.get(credentialId);
    if (handle === undefined) {
      throw new Error("SecretsRotationManager.rotate: unknown credential");
    }

    // Keep the candidate operation-local until the owned commit point.
    const path = credential?.path ?? credentialId;
    const mountPoint = credential?.mountPoint ?? "secret";
    const newValue = await this.readFromProvider(
      vaultClient,
      path,
      mountPoint,
      (providerValue) => ownProviderBuffer(
        providerValue,
        (failed) => { this.pendingWipes.add(failed); },
        (opaque) => { this.unverifiableProviderOutputs.add(opaque); },
      ),
    );
    let committed = false;
    try {
      await new Promise<void>((res) => setTimeout(res, QUIESCE_MS));
      if (this.handles.get(credentialId) !== handle) {
        throw new Error("SecretsRotationManager.rotate: credential changed during rotation");
      }

      const oldActive = handle.activeValue;
      handle.activeValue = newValue;
      handle.stagingValue = null;
      (handle as unknown as { version: number }).version += 1;
      committed = true;
      if (!this.wipeOwnedBuffer(oldActive)) {
        handle.faulted = true;
        throw new Error("SecretsRotationManager: cleanup incomplete");
      }
      } finally {
      if (!committed && !this.wipeOwnedBuffer(newValue)) {
        throw new Error("SecretsRotationManager: cleanup incomplete");
      }
    }
  }

  /**
   * Run a synchronous callback with one transient owned copy of the active value.
   * The copy is wiped before return; the only method result is non-secret presence.
   */
  useActive(credentialId: string, callback: (value: Buffer) => void): boolean {
    if (
      this.disposed ||
      this.providerReadsInProgress > 0 ||
      this.pendingWipes.size > 0 ||
      this.unverifiableProviderOutputs.size > 0 ||
      this.rotations.has(credentialId)
    ) return false;
    const handle = this.handles.get(credentialId);
    // Fail closed: a faulted (quarantined) credential is never served.
    if (handle === undefined || handle.faulted === true) return false;
    const value = copyBuffer(handle.activeValue);
    try {
      const result: unknown = callback(value);
      if (
        typeof result === "object" &&
        result !== null &&
        "then" in result &&
        typeof (result as { readonly then?: unknown }).then === "function"
      ) {
        throw new Error("SecretsRotationManager.useActive callback must be synchronous");
      }
      return true;
    } finally {
      if (!this.wipeOwnedBuffer(value)) {
        throw new Error("SecretsRotationManager: cleanup incomplete");
      }
    }
  }

  /** Return an immutable, redacted status view with no secret buffers. */
  getHandle(credentialId: string): SecretHandleStatus | undefined {
    const handle = this.handles.get(credentialId);
    if (handle === undefined) return undefined;
    return Object.freeze({
      id: handle.id,
      version: handle.version,
      faulted: handle.faulted === true,
    });
  }

  /**
   * Return all credential ids currently loaded.
   */
  listIds(): string[] {
    return Array.from(this.handles.keys());
  }

  /**
   * Zero-wipe and remove a credential handle. After eviction `useActive` returns
   * false, so any downstream read fails closed — a stale key is never served.
   */
  private evict(credentialId: string): boolean {
    const h = this.handles.get(credentialId);
    if (h === undefined) return true;
    h.faulted = true;
    this.handles.delete(credentialId);
    const activeWiped = this.wipeOwnedBuffer(h.activeValue);
    const stagingWiped = h.stagingValue === null || this.wipeOwnedBuffer(h.stagingValue);
    return activeWiped && stagingWiped;
  }

  /**
   * Rotate a credential and, if the rotation FAILS, apply the contract's
   * `on_rotation_fault` policy — so a stale key is never silently retained
   * (zero-trust: we cannot trust a stale key). Never throws; returns true if
   * rotated, false if a fault was handled.
   *   - "halt"       → evict the credential (zero-wipe + remove); useActive fails closed.
   *   - "quarantine" → wipe the active value + mark faulted; useActive fails closed,
   *                    handle retained for inspection.
   *   - "log"        → log and keep serving the previous value (explicit opt-in,
   *                    NOT fail-closed — for dev/non-sensitive credentials only).
   */
  async rotateOrFault(
    credential: SecretCredential,
    vaultClient: VaultClient,
    onRotationFault: RotationPolicy["onRotationFault"] = "halt"
  ): Promise<boolean> {
    if (this.disposed || !this.retryPendingWipes()) return false;
    // Bind this invocation to one primitive key before any provider-controlled
    // callback can mutate the caller-owned credential object.
    let snapshot: SecretCredential;
    try {
      snapshot = snapshotCredential(credential);
    } catch {
      logErrorSafely("[galerina-ext-secrets-vault] invalid credential descriptor; rotation refused");
      return false;
    }
    const credentialId = snapshot.id;
    if (onRotationFault !== "halt" && onRotationFault !== "quarantine" && onRotationFault !== "log") {
      if (this.rotations.has(credentialId)) return false;
      const cleanupComplete = this.evict(credentialId);
      logErrorSafely(
        `[galerina-ext-secrets-vault] invalid rotation policy; credential evicted${cleanupComplete ? "" : "; cleanup pending"} (fail-closed)`,
      );
      return false;
    }
    const handleAtStart = this.handles.get(credentialId);
    // Acquisition and policy ownership are decided synchronously in one step:
    // only a call refused here may bypass its requested fault policy. Once an
    // operation is acquired, any propagated provider rejection is its failure,
    // even if the rejection originated as a nested busy error.
    const operation = this.beginRotation(credentialId, vaultClient, snapshot);
    if (operation === undefined) return false;
    try {
      await operation;
      const h = this.handles.get(credentialId);
      if (h !== undefined && h === handleAtStart) h.faulted = false;
      return true;
    } catch {
      if (onRotationFault === "halt") {
        if (this.handles.get(credentialId) === handleAtStart) {
          const cleanupComplete = this.evict(credentialId);
          logErrorSafely(
            `[galerina-ext-secrets-vault] rotation failed; policy=halt; credential evicted${cleanupComplete ? "" : "; cleanup pending"} (fail-closed)`,
          );
        }
      } else if (onRotationFault === "quarantine") {
        const h = this.handles.get(credentialId);
        if (h !== undefined && h === handleAtStart) {
          h.faulted = true;
          const activeWiped = this.wipeOwnedBuffer(h.activeValue);
          const stagingWiped = h.stagingValue === null || this.wipeOwnedBuffer(h.stagingValue);
          h.stagingValue = null;
          logErrorSafely(activeWiped && stagingWiped
            ? "[galerina-ext-secrets-vault] rotation failed; policy=quarantine; active value wiped (fail-closed)"
            : "[galerina-ext-secrets-vault] rotation failed; policy=quarantine; cleanup pending (fail-closed)");
        } else {
          logErrorSafely("[galerina-ext-secrets-vault] rotation failed; policy=quarantine; credential unavailable (fail-closed)");
        }
      } else {
        logErrorSafely("[galerina-ext-secrets-vault] rotation failed; policy=log; stale value retained (not fail-closed)");
      }
      return false;
    } finally {
      this.releaseRotation(credentialId, operation);
    }
  }

  /**
   * Start a background rotation sweep that rotates all credentials on a fixed
   * interval. On a rotation fault the `onRotationFault` policy is applied
   * (default **"halt"** — fail-closed by default). Returns the timer so the
   * caller can stop it.
   */
  startRotationSweep(
    credentials: SecretCredential[],
    vaultClient: VaultClient,
    intervalMs: number,
    onRotationFault: RotationPolicy["onRotationFault"] = "halt"
  ): NodeJS.Timeout {
    if (this.disposed) {
      throw new Error("SecretsRotationManager: manager is disposed");
    }
    if (!this.retryPendingWipes()) throw new Error("SecretsRotationManager: cleanup incomplete");
    return setInterval(() => {
      for (const cred of credentials) {
        // rotateOrFault never throws — it applies the fault policy internally.
        void this.rotateOrFault(cred, vaultClient, onRotationFault);
      }
    }, intervalMs);
  }

  /**
   * Stop a running rotation sweep timer.
   */
  stopRotationSweep(timer: NodeJS.Timeout): void {
    clearInterval(timer);
  }

  /**
   * Permanently close this manager, zero-wipe loaded handles, clear the map,
   * and invalidate provider loads that have not reached their commit point.
   * Throws cleanup incomplete while provider reads or rotations are still
   * unresolved; call again after those operations settle to confirm cleanup
   * completion. Create a new manager to resume after shutdown. Safe to call
   * repeatedly.
   */
  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      this.lifecycleGeneration += 1;
    }
    const pendingBeforeDispose = [...this.pendingWipes];
    for (const value of pendingBeforeDispose) {
      this.wipeOwnedBuffer(value);
    }
    for (const handle of this.handles.values()) {
      this.wipeOwnedBuffer(handle.activeValue);
      if (handle.stagingValue !== null) {
        this.wipeOwnedBuffer(handle.stagingValue);
      }
    }
    this.handles.clear();
    if (
      this.rotations.size > 0 ||
      this.providerReadsInProgress > 0 ||
      this.pendingWipes.size > 0 ||
      this.unverifiableProviderOutputs.size > 0
    ) {
      throw new Error("SecretsRotationManager: cleanup incomplete");
    }
  }
}
