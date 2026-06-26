/**
 * galerina-ext-secrets-vault — CLI
 *
 * Usage:
 *   node dist/cli.js read <vault-path>           # read a secret
 *   node dist/cli.js rotate <credential-id>      # manually trigger rotation
 *   node dist/cli.js status                      # show loaded credentials
 *
 * Requires: VAULT_ADDR + VAULT_TOKEN env vars (or VAULT_DEV_ROOT_TOKEN_ID).
 */
import { GalerinaSecretsVault } from "./index.js";
import type { SecretCredential } from "./types.js";

const [, , command, ...args] = process.argv;

function usage(): void {
  console.error(`
galerina-secrets-vault — HashiCorp Vault CLI for Galerina contract.secrets {} blocks

Commands:
  read <vault-path> [mount-point]   Read a KV v2 secret (default mount: secret)
  rotate <credential-id> <path>     Manually trigger rotation for a credential
  status                            Show env config status

Environment variables:
  VAULT_ADDR             Vault server address (e.g. https://vault.example.com)
  VAULT_TOKEN            Vault token for authentication
  VAULT_DEV_ROOT_TOKEN_ID  Dev mode token (uses http://127.0.0.1:8200)
`);
}

async function run(): Promise<void> {
  if (!command) {
    usage();
    process.exit(1);
  }

  switch (command) {
    case "read": {
      const [vaultPath, mountPoint] = args;
      if (!vaultPath) {
        console.error("Error: vault-path is required");
        usage();
        process.exit(1);
      }

      let vault: GalerinaSecretsVault;
      try {
        vault = GalerinaSecretsVault.fromEnv();
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }

      const cred: SecretCredential = {
        id: "__cli_read__",
        provider: "hashicorp_vault",
        path: vaultPath,
        ...(mountPoint !== undefined ? { mountPoint } : {}),
      };

      await vault.loadContract({ credentials: [cred] });
      const value = vault.getSecret("__cli_read__");
      if (value === undefined) {
        console.error("Error: secret not found");
        process.exit(1);
      }
      // Output raw JSON from KV v2 data.data field
      process.stdout.write(value.toString("utf8") + "\n");
      vault.stop();
      break;
    }

    case "rotate": {
      const [credentialId, vaultPath, mountPoint] = args;
      if (!credentialId || !vaultPath) {
        console.error("Error: credential-id and path are required");
        usage();
        process.exit(1);
      }

      let vault: GalerinaSecretsVault;
      try {
        vault = GalerinaSecretsVault.fromEnv();
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }

      const cred: SecretCredential = {
        id: credentialId,
        provider: "hashicorp_vault",
        path: vaultPath,
        ...(mountPoint !== undefined ? { mountPoint } : {}),
      };

      // Load first, then rotate
      await vault.loadContract({ credentials: [cred] });
      await vault.rotationManager.rotate(credentialId, vault.vaultClientInstance, cred);

      const handle = vault.rotationManager.getHandle(credentialId);
      console.log(
        `Rotated "${credentialId}" successfully. Version: ${handle?.version ?? "?"}`
      );
      vault.stop();
      break;
    }

    case "status": {
      const addr = process.env["VAULT_ADDR"];
      const token = process.env["VAULT_TOKEN"];
      const devToken = process.env["VAULT_DEV_ROOT_TOKEN_ID"];

      console.log("galerina-ext-secrets-vault status");
      console.log("--------------------------------");
      if (devToken) {
        console.log(`Mode:        dev`);
        console.log(`VAULT_ADDR:  ${addr ?? "http://127.0.0.1:8200 (default)"}`);
        console.log(`Token:       VAULT_DEV_ROOT_TOKEN_ID set`);
      } else {
        console.log(`Mode:        production`);
        console.log(`VAULT_ADDR:  ${addr ?? "(not set)"}`);
        console.log(`Token:       ${token ? "VAULT_TOKEN set" : "(not set)"}`);
      }
      break;
    }

    default:
      console.error(`Unknown command: "${command}"`);
      usage();
      process.exit(1);
  }
}

run().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
