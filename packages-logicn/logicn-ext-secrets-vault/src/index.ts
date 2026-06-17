/**
 * logicn-ext-secrets-vault — Public facade
 *
 * Usage (most apps):
 *   const vault = LogicNSecretsVault.fromEnv();
 *   await vault.loadContract(contractBlock);
 *   const dbPassword = vault.getSecret("db_password");
 *   const timer = vault.startRotation(contractBlock);
 *   // ... at shutdown:
 *   vault.stop(timer);
 */
import { VaultClient } from "./vault-client.js";
import { SecretsRotationManager } from "./rotation-manager.js";
import type { SecretsContractBlock, SecretCredential } from "./types.js";

export { VaultClient } from "./vault-client.js";
export { SecretsRotationManager } from "./rotation-manager.js";
export type {
  SecretCredential,
  RotationPolicy,
  SecretsContractBlock,
  SecretHandle,
} from "./types.js";
export { SECRETS_GATEWAY_WIT } from "./types.js";

// ---------------------------------------------------------------------------
// Main facade
// ---------------------------------------------------------------------------

export class LogicNSecretsVault {
  private readonly vaultClient: VaultClient;
  private readonly manager: SecretsRotationManager;

  private constructor(vaultClient: VaultClient) {
    this.vaultClient = vaultClient;
    this.manager = new SecretsRotationManager();
  }

  // --------------------------------------------------------------------------
  // Constructors
  // --------------------------------------------------------------------------

  /**
   * Build from environment variables.
   *   - Production: VAULT_ADDR + VAULT_TOKEN
   *   - Dev mode:   VAULT_DEV_ROOT_TOKEN_ID (auto-uses http://127.0.0.1:8200)
   */
  static fromEnv(): LogicNSecretsVault {
    return new LogicNSecretsVault(VaultClient.fromEnv());
  }

  /**
   * Build from explicit config (useful in tests or when credentials come from
   * a higher-level orchestrator).
   */
  static fromConfig(address: string, token: string): LogicNSecretsVault {
    return new LogicNSecretsVault(new VaultClient(address, token));
  }

  // --------------------------------------------------------------------------
  // Loading + retrieval
  // --------------------------------------------------------------------------

  /**
   * Load all credentials declared in a `contract { secrets {} }` block.
   * Each credential is fetched from Vault and stored as the active handle.
   */
  async loadContract(block: SecretsContractBlock): Promise<void> {
    for (const cred of block.credentials) {
      await this.manager.load(cred, this.vaultClient);
    }
  }

  /**
   * Retrieve the current active value for a credential by id.
   * Returns undefined if the credential has not been loaded.
   */
  getSecret(credentialId: string): Buffer | undefined {
    return this.manager.getActive(credentialId);
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
    return this.manager.startRotationSweep(
      block.credentials,
      this.vaultClient,
      intervalMs,
      onRotationFault
    );
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Stop the rotation timer (if any) and zero-wipe all loaded credential
   * buffers.  Safe to call multiple times.
   */
  stop(timer?: NodeJS.Timeout): void {
    if (timer !== undefined) {
      this.manager.stopRotationSweep(timer);
    }
    this.manager.dispose();
  }

  /**
   * Expose the underlying manager for advanced use (e.g. manual per-credential
   * rotation or status inspection via the CLI).
   */
  get rotationManager(): SecretsRotationManager {
    return this.manager;
  }

  /**
   * Expose the underlying vault client (e.g. for the CLI `read` command).
   */
  get vaultClientInstance(): VaultClient {
    return this.vaultClient;
  }
}
