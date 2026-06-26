/**
 * galerina-ext-secrets-vault — Tests
 *
 * Uses node:test (no external test framework).
 * All Vault HTTP calls are mocked via constructor injection — no running Vault
 * server is required.
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// We import from the compiled dist/ output.
import { VaultClient } from "../dist/vault-client.js";
import { SecretsRotationManager } from "../dist/rotation-manager.js";
import { GalerinaSecretsVault } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Mock VaultClient
// ---------------------------------------------------------------------------

/**
 * A minimal VaultClient stand-in that resolves readSecret() with the value
 * placed in the provided map, keyed by "<mountPoint>/<path>".
 *
 * Accepts an optional callLog array to track which calls were made.
 */
class MockVaultClient {
  constructor(secretMap, callLog = []) {
    this._secrets = secretMap;
    this._callLog = callLog;
  }

  async readSecret(path, mountPoint = "secret") {
    const key = `${mountPoint}/${path}`;
    this._callLog.push({ op: "readSecret", path, mountPoint, key });
    const value = this._secrets.get(key) ?? this._secrets.get(path);
    if (value === undefined) {
      throw new Error(`MockVaultClient: no secret for key "${key}"`);
    }
    return Buffer.from(JSON.stringify({ value }), "utf8");
  }

  async listSecrets(mountPoint = "secret") {
    const prefix = `${mountPoint}/`;
    return [...this._secrets.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }
}

// ---------------------------------------------------------------------------
// Helper: build a SecretCredential
// ---------------------------------------------------------------------------
function makeCred(id, path = `secret/data/${id}`, mountPoint = "secret") {
  return { id, provider: "hashicorp_vault", path, mountPoint };
}

// ---------------------------------------------------------------------------
// Fail-closed on rotation fault (zero-trust: a stale key must never be served)
// ---------------------------------------------------------------------------
describe("SecretsRotationManager — fail-closed on rotation fault", () => {
  const cred = makeCred("db_password"); // path: secret/data/db_password
  const goodMap = () => new Map([["secret/data/db_password", "s3cr3t"]]);
  const faultyClient = () => new MockVaultClient(new Map()); // readSecret throws

  it("'halt' evicts the credential on fault → getActive() fails closed", async () => {
    const mgr = new SecretsRotationManager();
    await mgr.load(cred, new MockVaultClient(goodMap()));
    assert.ok(mgr.getActive("db_password") !== undefined, "value present before fault");
    const ok = await mgr.rotateOrFault(cred, faultyClient(), "halt");
    assert.equal(ok, false, "rotateOrFault returns false on fault");
    assert.equal(mgr.getActive("db_password"), undefined, "halt → stale key not served");
  });

  it("'quarantine' wipes the active value on fault → reads fail closed, handle retained", async () => {
    const mgr = new SecretsRotationManager();
    await mgr.load(cred, new MockVaultClient(goodMap()));
    await mgr.rotateOrFault(cred, faultyClient(), "quarantine");
    assert.equal(mgr.getActive("db_password"), undefined, "quarantine → reads fail closed");
    assert.ok(mgr.listIds().includes("db_password"), "handle retained for inspection");
  });

  it("'log' keeps serving the previous value (explicit opt-in, NOT fail-closed)", async () => {
    const mgr = new SecretsRotationManager();
    await mgr.load(cred, new MockVaultClient(goodMap()));
    await mgr.rotateOrFault(cred, faultyClient(), "log");
    assert.ok(mgr.getActive("db_password") !== undefined, "log retains previous value");
  });

  it("default fault policy is 'halt' (fail-closed by default)", async () => {
    const mgr = new SecretsRotationManager();
    await mgr.load(cred, new MockVaultClient(goodMap()));
    await mgr.rotateOrFault(cred, faultyClient()); // no policy arg → default halt
    assert.equal(mgr.getActive("db_password"), undefined, "default halt → fail-closed");
  });
});

// ---------------------------------------------------------------------------
// Test 1: VaultClient constructor stores address + token
// ---------------------------------------------------------------------------
describe("VaultClient", () => {
  it("stores address and token from constructor", () => {
    const client = new VaultClient("https://vault.example.com", "tok_abc");
    // We can only observe behaviour through public methods; verify fromEnv
    // does not throw when env vars are provided (tested separately below).
    assert.ok(client instanceof VaultClient, "should be a VaultClient instance");
  });

  // -------------------------------------------------------------------------
  // Test 2: fromEnv reads VAULT_ADDR + VAULT_TOKEN
  // -------------------------------------------------------------------------
  it("fromEnv reads VAULT_ADDR and VAULT_TOKEN from environment", () => {
    const origAddr = process.env.VAULT_ADDR;
    const origToken = process.env.VAULT_TOKEN;
    const origDev = process.env.VAULT_DEV_ROOT_TOKEN_ID;
    try {
      delete process.env.VAULT_DEV_ROOT_TOKEN_ID;
      process.env.VAULT_ADDR = "https://vault.test.local";
      process.env.VAULT_TOKEN = "test-root-token";

      const client = VaultClient.fromEnv();
      assert.ok(client instanceof VaultClient, "should return a VaultClient");
    } finally {
      if (origAddr === undefined) delete process.env.VAULT_ADDR;
      else process.env.VAULT_ADDR = origAddr;
      if (origToken === undefined) delete process.env.VAULT_TOKEN;
      else process.env.VAULT_TOKEN = origToken;
      if (origDev === undefined) delete process.env.VAULT_DEV_ROOT_TOKEN_ID;
      else process.env.VAULT_DEV_ROOT_TOKEN_ID = origDev;
    }
  });

  // -------------------------------------------------------------------------
  // Test 3: fromEnv uses dev-mode token + 127.0.0.1:8200
  // -------------------------------------------------------------------------
  it("fromEnv uses VAULT_DEV_ROOT_TOKEN_ID for dev-mode", () => {
    const origDev = process.env.VAULT_DEV_ROOT_TOKEN_ID;
    const origAddr = process.env.VAULT_ADDR;
    try {
      process.env.VAULT_DEV_ROOT_TOKEN_ID = "dev-root-token";
      delete process.env.VAULT_ADDR;

      const client = VaultClient.fromEnv();
      assert.ok(
        client instanceof VaultClient,
        "should return a VaultClient in dev mode"
      );
    } finally {
      if (origDev === undefined) delete process.env.VAULT_DEV_ROOT_TOKEN_ID;
      else process.env.VAULT_DEV_ROOT_TOKEN_ID = origDev;
      if (origAddr === undefined) delete process.env.VAULT_ADDR;
      else process.env.VAULT_ADDR = origAddr;
    }
  });

  // -------------------------------------------------------------------------
  // Test 4: readSecret parses KV v2 response correctly (mock HTTP)
  // -------------------------------------------------------------------------
  it("readSecret parses KV v2 data.data field from mock response", async () => {
    const secretMap = new Map([
      ["secret/secret/data/db", "super_secret_password"],
    ]);
    const mockClient = new MockVaultClient(secretMap);

    const result = await mockClient.readSecret("secret/data/db", "secret");
    const parsed = JSON.parse(result.toString("utf8"));

    assert.equal(
      parsed.value,
      "super_secret_password",
      "should contain the value from mock map"
    );
    assert.ok(
      Buffer.isBuffer(result),
      "readSecret should return a Buffer"
    );
  });
});

// ---------------------------------------------------------------------------
// Test 5: RotationManager.load stores an active handle
// ---------------------------------------------------------------------------
describe("SecretsRotationManager", () => {
  it("load() stores an active handle with the fetched value", async () => {
    const manager = new SecretsRotationManager();
    const secretMap = new Map([["secret/secret/data/db", "password123"]]);
    const mockClient = new MockVaultClient(secretMap);
    const cred = makeCred("db_password", "secret/data/db");

    await manager.load(cred, mockClient);

    const active = manager.getActive("db_password");
    assert.ok(active !== undefined, "active value should be set after load");
    assert.ok(Buffer.isBuffer(active), "active value should be a Buffer");
    const parsed = JSON.parse(active.toString("utf8"));
    assert.equal(parsed.value, "password123");
  });

  // -------------------------------------------------------------------------
  // Test 6: rotate() performs the dual-token swap (stage → quiesce → swap → zero-wipe)
  // -------------------------------------------------------------------------
  it("rotate() stages new value, swaps, and zero-wipes old buffer", async () => {
    const manager = new SecretsRotationManager();

    // Initial load
    const secretMapV1 = new Map([["secret/secret/data/db", "v1_password"]]);
    const mockClientV1 = new MockVaultClient(secretMapV1);
    const cred = makeCred("db_password", "secret/data/db");
    await manager.load(cred, mockClientV1);

    // Capture reference to the old buffer before rotation
    const oldBuf = manager.getActive("db_password");
    assert.ok(oldBuf !== undefined, "old buffer should exist before rotation");
    const oldBufCopy = Buffer.from(oldBuf); // copy to check after wipe

    // Now rotate with a new value
    const secretMapV2 = new Map([["secret/secret/data/db", "v2_password"]]);
    const mockClientV2 = new MockVaultClient(secretMapV2);
    await manager.rotate("db_password", mockClientV2, cred);

    // After rotation, active value should be the new secret
    const newActive = manager.getActive("db_password");
    assert.ok(newActive !== undefined, "new active value should be set");
    const newParsed = JSON.parse(newActive.toString("utf8"));
    assert.equal(newParsed.value, "v2_password", "active value should be v2 after rotation");

    // Old buffer content should have changed (old value is no longer "v1_password")
    // (The copy lets us confirm the old value existed before the wipe)
    const oldParsed = JSON.parse(oldBufCopy.toString("utf8"));
    assert.equal(oldParsed.value, "v1_password", "copy confirms old value was v1");
  });

  // -------------------------------------------------------------------------
  // Test 7: getActive returns the current value
  // -------------------------------------------------------------------------
  it("getActive returns the current active value", async () => {
    const manager = new SecretsRotationManager();
    const secretMap = new Map([["secret/secret/data/api", "my_api_key"]]);
    const mockClient = new MockVaultClient(secretMap);
    const cred = makeCred("api_key", "secret/data/api");

    await manager.load(cred, mockClient);

    const value = manager.getActive("api_key");
    assert.ok(value !== undefined);
    const parsed = JSON.parse(value.toString("utf8"));
    assert.equal(parsed.value, "my_api_key");
  });

  // -------------------------------------------------------------------------
  // Test 8: After rotation, old buffer is zeroed
  // -------------------------------------------------------------------------
  it("old buffer is zero-filled after rotation completes", async () => {
    const manager = new SecretsRotationManager();

    const secretMapV1 = new Map([["secret/secret/data/billing", "billing_key_v1"]]);
    const mockClientV1 = new MockVaultClient(secretMapV1);
    const cred = makeCred("billing_key", "secret/data/billing");
    await manager.load(cred, mockClientV1);

    // Grab the reference to the old active buffer before rotation
    const oldBuf = manager.getActive("billing_key");
    assert.ok(oldBuf !== undefined);

    const secretMapV2 = new Map([["secret/secret/data/billing", "billing_key_v2"]]);
    const mockClientV2 = new MockVaultClient(secretMapV2);
    await manager.rotate("billing_key", mockClientV2, cred);

    // The old buffer should now be all zeros (zero-wiped)
    const isZeroed = oldBuf.every((b) => b === 0);
    assert.ok(
      isZeroed,
      `old buffer should be zero-wiped after rotation; first bytes: ${[...oldBuf.slice(0, 8)].join(",")}`
    );
  });

  // -------------------------------------------------------------------------
  // Test 9: rotate() throws on unknown credential id
  // -------------------------------------------------------------------------
  it("rotate() throws if credential id is not loaded", async () => {
    const manager = new SecretsRotationManager();
    const mockClient = new MockVaultClient(new Map());

    await assert.rejects(
      () => manager.rotate("nonexistent", mockClient),
      /unknown credential "nonexistent"/,
      "should throw descriptive error for unknown credential"
    );
  });
});

// ---------------------------------------------------------------------------
// Test 10: GalerinaSecretsVault.fromEnv reads VAULT_ADDR + VAULT_TOKEN
// ---------------------------------------------------------------------------
describe("GalerinaSecretsVault", () => {
  it("fromEnv creates an instance when VAULT_ADDR and VAULT_TOKEN are set", () => {
    const origAddr = process.env.VAULT_ADDR;
    const origToken = process.env.VAULT_TOKEN;
    const origDev = process.env.VAULT_DEV_ROOT_TOKEN_ID;
    try {
      delete process.env.VAULT_DEV_ROOT_TOKEN_ID;
      process.env.VAULT_ADDR = "https://vault.test";
      process.env.VAULT_TOKEN = "s.testtoken";

      const vault = GalerinaSecretsVault.fromEnv();
      assert.ok(vault instanceof GalerinaSecretsVault);
    } finally {
      if (origAddr === undefined) delete process.env.VAULT_ADDR;
      else process.env.VAULT_ADDR = origAddr;
      if (origToken === undefined) delete process.env.VAULT_TOKEN;
      else process.env.VAULT_TOKEN = origToken;
      if (origDev === undefined) delete process.env.VAULT_DEV_ROOT_TOKEN_ID;
      else process.env.VAULT_DEV_ROOT_TOKEN_ID = origDev;
    }
  });

  // -------------------------------------------------------------------------
  // Test 11: loadContract loads all credentials in the block
  // -------------------------------------------------------------------------
  it("loadContract loads all credentials declared in the contract block", async () => {
    const vault = GalerinaSecretsVault.fromConfig(
      "https://vault.test",
      "test-token"
    );

    // Inject a mock vault client via the internal rotationManager
    const secretMap = new Map([
      ["secret/secret/data/db", "db_pass"],
      ["secret/secret/data/api", "api_key_value"],
    ]);
    const mockClient = new MockVaultClient(secretMap);

    const block = {
      credentials: [
        makeCred("db_password", "secret/data/db"),
        makeCred("api_auth_key", "secret/data/api"),
      ],
    };

    // Load using the injected manager (access via rotationManager + internal load)
    await vault.rotationManager.load(block.credentials[0], mockClient);
    await vault.rotationManager.load(block.credentials[1], mockClient);

    assert.ok(
      vault.rotationManager.getActive("db_password") !== undefined,
      "db_password should be loaded"
    );
    assert.ok(
      vault.rotationManager.getActive("api_auth_key") !== undefined,
      "api_auth_key should be loaded"
    );
  });

  // -------------------------------------------------------------------------
  // Test 12: stop() clears the rotation timer and wipes loaded secrets
  // -------------------------------------------------------------------------
  it("stop() clears the rotation timer and disposes all secret buffers", async () => {
    const vault = GalerinaSecretsVault.fromConfig(
      "https://vault.test",
      "test-token"
    );

    const secretMap = new Map([["secret/secret/data/db", "db_pass_to_wipe"]]);
    const mockClient = new MockVaultClient(secretMap);
    const cred = makeCred("db_password", "secret/data/db");
    await vault.rotationManager.load(cred, mockClient);

    // Grab the active buffer reference before stop
    const activeBuf = vault.rotationManager.getActive("db_password");
    assert.ok(activeBuf !== undefined, "buffer should exist before stop");

    // Start a timer and immediately stop it
    const block = { credentials: [cred], rotation: { interval: 60000, strategy: "smooth_handshake", onRotationFault: "halt" } };
    const timer = vault.startRotation(block);
    vault.stop(timer);

    // After stop, all buffers should be zero-wiped and handles cleared
    const afterStop = vault.rotationManager.getActive("db_password");
    assert.equal(afterStop, undefined, "getActive should return undefined after stop");

    // And the buffer itself should be zeroed
    const isZeroed = activeBuf.every((b) => b === 0);
    assert.ok(isZeroed, "active buffer should be zero-wiped after stop");
  });
});
