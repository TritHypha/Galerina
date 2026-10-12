/**
 * galerina-ext-secrets-vault — Public facade
 *
 * Usage (most apps):
 *   const vault = GalerinaSecretsVault.fromEnv();
 *   await vault.loadContract(contractBlock);
 *   vault.useSecret("db_password", (dbPassword) => processValue(dbPassword));
 *   const timer = vault.startRotation(contractBlock);
 *   // ... at shutdown:
 *   vault.stop(timer);
 */
import { VaultClient } from "./vault-client.js";
import { SecretsRotationManager } from "./rotation-manager.js";
import type { SecretsContractBlock, SecretCredential, SecretHandleStatus } from "./types.js";

export { VaultClient } from "./vault-client.js";
export { SecretsRotationManager } from "./rotation-manager.js";
export type {
  SecretCredential,
  RotationPolicy,
  SecretsContractBlock,
  SecretHandle,
  SecretHandleStatus,
} from "./types.js";
export { SECRETS_GATEWAY_WIT } from "./types.js";

// ---------------------------------------------------------------------------
// Main facade
// ---------------------------------------------------------------------------

export class GalerinaSecretsVault {
  readonly #vaultClient: VaultClient;
  readonly #manager: SecretsRotationManager;

  private constructor(vaultClient: VaultClient) {
    this.#vaultClient = vaultClient;
    this.#manager = new SecretsRotationManager();
  }

  // --------------------------------------------------------------------------
  // Constructors
  // --------------------------------------------------------------------------

  /**
   * Build from environment variables.
   *   - Production: VAULT_ADDR + VAULT_TOKEN
   *   - Dev mode:   VAULT_DEV_ROOT_TOKEN_ID (auto-uses http://127.0.0.1:8200)
   */
  static fromEnv(): GalerinaSecretsVault {
    return new GalerinaSecretsVault(VaultClient.fromEnv());
  }

  /**
   * Build from explicit config (useful in tests or when credentials come from
   * a higher-level orchestrator).
   */
  static fromConfig(address: string, token: string): GalerinaSecretsVault {
    return new GalerinaSecretsVault(new VaultClient(address, token));
  }

  /** Build from an already-owned client (dependency-injection/test seam). */
  static fromClient(vaultClient: VaultClient): GalerinaSecretsVault {
    return new GalerinaSecretsVault(vaultClient);
  }

  // --------------------------------------------------------------------------
  // Loading + scoped use
  // --------------------------------------------------------------------------

  /**
   * Load all credentials declared in a `contract { secrets {} }` block.
   * Each credential is fetched from Vault and stored as the active handle.
   */
  async loadContract(block: SecretsContractBlock): Promise<void> {
    for (const cred of block.credentials) {
      await this.#manager.load(cred, this.#vaultClient);
    }
  }

  /**
   * Preferred scoped read. The callback receives an owned transient copy that
   * is wiped before this method returns, including when the callback throws.
   * Returns only whether a live credential was present; callback results are
   * discarded so the package creates no plaintext return channel.
   */
  useSecret(credentialId: string, callback: (value: Buffer) => void): boolean {
    return this.#manager.useActive(credentialId, callback);
  }

  /**
   * Manually rotate one credential without exposing provider internals.
   * A busy rotation or handled rotation failure rejects with the same opaque
   * error. Rejection means this attempt did not succeed; it does not imply the
   * credential will remain unavailable after another in-flight rotation
   * settles. Unexpected manager rejections may propagate separately.
   */
  async rotateCredential(credential: SecretCredential): Promise<void> {
    const rotated = await this.#manager.rotateOrFault(credential, this.#vaultClient);
    if (!rotated) {
      // Keep the facade's rejection contract without exposing provider details.
      throw new Error("manual credential rotation failed; credential unavailable");
    }
  }

  /** Return only redacted credential status. */
  getCredentialStatus(credentialId: string): SecretHandleStatus | undefined {
    return this.#manager.getHandle(credentialId);
  }

  // --------------------------------------------------------------------------
  // Rotation
  // --------------------------------------------------------------------------

  /**
   * Start the background rotation sweep defined in the contract block's
   * rotation policy.  Uses a default 1-hour interval if no rotation block
   * is declared.
   *
   * Returns the timer handle so the caller can stop it with `stop(timer)`.
   */
  startRotation(block: SecretsContractBlock): NodeJS.Timeout {
    const intervalMs = block.rotation?.interval ?? 3_600_000; // default 1 h
    // Honour the contract's on_rotation_fault policy; default fail-closed ("halt")
    // so a failed rotation never silently keeps serving a stale key (zero-trust).
    const onRotationFault = block.rotation?.onRotationFault ?? "halt";
    return this.#manager.startRotationSweep(
      block.credentials,
      this.#vaultClient,
      intervalMs,
      onRotationFault
    );
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Stop the rotation timer (if any) and zero-wipe all loaded credential
   * buffers. Safe to call multiple times. If a provider read is still in
   * flight or rotation is still finalizing, the vault is closed but this call
   * throws cleanup incomplete; call stop() again after the operation settles
   * to confirm cleanup completion.
   */
  stop(timer?: NodeJS.Timeout): void {
    if (timer !== undefined) {
      this.#manager.stopRotationSweep(timer);
    }
    this.#manager.dispose();
  }

}
