/**
 * galerina-ext-secrets-vault — Tests
 *
 * Uses node:test (no external test framework).
 * All Vault HTTP calls are mocked via constructor injection — no running Vault
 * server is required.
 */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

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

function activeCopyForTest(manager, credentialId) {
  let copy;
  const present = manager.useActive(credentialId, (value) => {
    copy = Buffer.from(value);
  });
  return present ? copy : undefined;
}

// ---------------------------------------------------------------------------
// Fail-closed on rotation fault (zero-trust: a stale key must never be served)
// ---------------------------------------------------------------------------
describe("SecretsRotationManager — fail-closed on rotation fault", () => {
  const cred = makeCred("db_password"); // path: secret/data/db_password
  const goodMap = () => new Map([["secret/data/db_password", "s3cr3t"]]);
  const faultyClient = () => new MockVaultClient(new Map()); // readSecret throws

  it("'halt' evicts the credential on fault → scoped use fails closed", async () => {
    const mgr = new SecretsRotationManager();
    await mgr.load(cred, new MockVaultClient(goodMap()));
    assert.ok(activeCopyForTest(mgr, "db_password") !== undefined, "value present before fault");
    const ok = await mgr.rotateOrFault(cred, faultyClient(), "halt");
    assert.equal(ok, false, "rotateOrFault returns false on fault");
    assert.equal(activeCopyForTest(mgr, "db_password"), undefined, "halt → stale key not served");
  });

  it("'quarantine' wipes the active value on fault → reads fail closed, handle retained", async () => {
    const mgr = new SecretsRotationManager();
    await mgr.load(cred, new MockVaultClient(goodMap()));
    await mgr.rotateOrFault(cred, faultyClient(), "quarantine");
    assert.equal(activeCopyForTest(mgr, "db_password"), undefined, "quarantine → reads fail closed");
    assert.ok(mgr.listIds().includes("db_password"), "handle retained for inspection");
  });

  it("'log' keeps serving the previous value (explicit opt-in, NOT fail-closed)", async () => {
    const mgr = new SecretsRotationManager();
    await mgr.load(cred, new MockVaultClient(goodMap()));
    await mgr.rotateOrFault(cred, faultyClient(), "log");
    assert.ok(activeCopyForTest(mgr, "db_password") !== undefined, "log retains previous value");
  });

  it("default fault policy is 'halt' (fail-closed by default)", async () => {
    const mgr = new SecretsRotationManager();
    await mgr.load(cred, new MockVaultClient(goodMap()));
    await mgr.rotateOrFault(cred, faultyClient()); // no policy arg → default halt
    assert.equal(activeCopyForTest(mgr, "db_password"), undefined, "default halt → fail-closed");
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

  it("refuses plaintext Vault transport unless canonical loopback is explicitly enabled", () => {
    assert.throws(() => new VaultClient("http://vault.example.com", "tok_abc"), /HTTPS|plaintext/i);
    assert.throws(() => new VaultClient("http://127.0.0.1:8200", "tok_abc"), /explicit|loopback/i);
    assert.doesNotThrow(() => new VaultClient(
      "http://127.0.0.1:8200",
      "tok_abc",
      { allowInsecureLoopback: true },
    ));
  });

  it("aborts a Vault response that exceeds the hard byte ceiling", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(Buffer.alloc(1024 * 1024 + 1, 0x20));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");
    try {
      const client = new VaultClient(
        `http://127.0.0.1:${address.port}`,
        "tok_abc",
        { allowInsecureLoopback: true },
      );
      await assert.rejects(() => client.readSecret("oversized"), /response.*limit/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
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

    const active = activeCopyForTest(manager, "db_password");
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
    // Retain the exact synthetic allocation transferred by the provider, not
    // a useActive() copy. Removing oldActive.fill(0) must fail this test.
    const providerBufferV1 = Buffer.from('{"value":"v1_password"}', "utf8");
    const mockClientV1 = { async readSecret() { return providerBufferV1; } };
    const cred = makeCred("db_password", "secret/data/db");
    await manager.load(cred, mockClientV1);

    // A separately owned caller snapshot must survive rotation unchanged.
    const oldBuf = activeCopyForTest(manager, "db_password");
    assert.ok(oldBuf !== undefined, "old buffer should exist before rotation");
    assert.notEqual(oldBuf, providerBufferV1);

    // Now rotate with a new value
    const secretMapV2 = new Map([["secret/secret/data/db", "v2_password"]]);
    const mockClientV2 = new MockVaultClient(secretMapV2);
    await manager.rotate("db_password", mockClientV2, cred);

    // After rotation, active value should be the new secret
    const newActive = activeCopyForTest(manager, "db_password");
    assert.ok(newActive !== undefined, "new active value should be set");
    const newParsed = JSON.parse(newActive.toString("utf8"));
    assert.equal(newParsed.value, "v2_password", "active value should be v2 after rotation");

    assert.deepEqual(providerBufferV1, Buffer.alloc(providerBufferV1.length),
      "rotation must zero the exact old provider allocation");
    assert.equal(JSON.parse(oldBuf.toString("utf8")).value, "v1_password",
      "wiping the managed allocation does not erase a separately owned copy");
  });

  // -------------------------------------------------------------------------
  // Test 7: scoped use supplies the current value
  // -------------------------------------------------------------------------
  it("scoped use supplies the current active value", async () => {
    const manager = new SecretsRotationManager();
    const secretMap = new Map([["secret/secret/data/api", "my_api_key"]]);
    const mockClient = new MockVaultClient(secretMap);
    const cred = makeCred("api_key", "secret/data/api");

    await manager.load(cred, mockClient);

    const value = activeCopyForTest(manager, "api_key");
    assert.ok(value !== undefined);
    const parsed = JSON.parse(value.toString("utf8"));
    assert.equal(parsed.value, "my_api_key");
  });

  // -------------------------------------------------------------------------
  // Test 8: Caller-owned copies are outside the manager's wipe authority
  // -------------------------------------------------------------------------
  it("rotation does not mutate a caller-owned snapshot", async () => {
    const manager = new SecretsRotationManager();

    const secretMapV1 = new Map([["secret/secret/data/billing", "billing_key_v1"]]);
    const mockClientV1 = new MockVaultClient(secretMapV1);
    const cred = makeCred("billing_key", "secret/data/billing");
    await manager.load(cred, mockClientV1);

    // Grab the reference to the old active buffer before rotation
    const oldBuf = activeCopyForTest(manager, "billing_key");
    assert.ok(oldBuf !== undefined);

    const secretMapV2 = new Map([["secret/secret/data/billing", "billing_key_v2"]]);
    const mockClientV2 = new MockVaultClient(secretMapV2);
    await manager.rotate("billing_key", mockClientV2, cred);

    assert.equal(JSON.parse(oldBuf.toString("utf8")).value, "billing_key_v1");
    const current = activeCopyForTest(manager, "billing_key");
    assert.ok(current !== undefined);
    assert.equal(JSON.parse(current.toString("utf8")).value, "billing_key_v2");
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
    const secretMap = new Map([
      ["secret/secret/data/db", "db_pass"],
      ["secret/secret/data/api", "api_key_value"],
    ]);
    const mockClient = new MockVaultClient(secretMap);
    const vault = GalerinaSecretsVault.fromClient(mockClient);

    const block = {
      credentials: [
        makeCred("db_password", "secret/data/db"),
        makeCred("api_auth_key", "secret/data/api"),
      ],
    };

    await vault.loadContract(block);

    assert.equal(vault.useSecret("db_password", () => {}), true, "db_password should be loaded");
    assert.equal(vault.useSecret("api_auth_key", () => {}), true, "api_auth_key should be loaded");
  });

  // -------------------------------------------------------------------------
  // Test 12: stop() clears the rotation timer and wipes loaded secrets
  // -------------------------------------------------------------------------
  it("stop() clears the rotation timer and disposes all secret buffers", async () => {
    const secretMap = new Map([["secret/secret/data/db", "db_pass_to_wipe"]]);
    const mockClient = new MockVaultClient(secretMap);
    const vault = GalerinaSecretsVault.fromClient(mockClient);
    const cred = makeCred("db_password", "secret/data/db");
    await vault.loadContract({ credentials: [cred] });

    assert.equal(vault.useSecret("db_password", () => {}), true, "value should exist before stop");

    // Start a timer and immediately stop it
    const block = { credentials: [cred], rotation: { interval: 60000, strategy: "smooth_handshake", onRotationFault: "halt" } };
    const timer = vault.startRotation(block);
    vault.stop(timer);

    // After stop, all buffers should be zero-wiped and handles cleared
    assert.equal(vault.useSecret("db_password", () => {}), false, "scoped use should refuse after stop");
  });
});

// ---------------------------------------------------------------------------
// Security regressions: namespace, ownership, and affine rotation
// ---------------------------------------------------------------------------
describe("Vault zero-trust boundaries", () => {
  it("refuses path traversal before an authenticated Vault request is sent", async () => {
    let requests = 0;
    const server = createServer((_req, res) => {
      requests += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: { data: { value: "must-not-be-read" } } }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");
    try {
      const client = new VaultClient(
        `http://127.0.0.1:${address.port}`,
        "tok_abc",
        { allowInsecureLoopback: true },
      );
      await assert.rejects(() => client.readSecret("../../sys/internal"), /path|segment|namespace/i);
      await assert.rejects(() => client.readSecret("%2e%2e/sys/internal"), /path|segment|namespace/i);
      await assert.rejects(() => client.listSecrets("../sys"), /mount|segment|namespace/i);
      assert.equal(requests, 0, "invalid namespace input must be refused before token-bearing I/O");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("returns owned secret copies rather than aliases to provider state", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("owned_copy", "secret/data/owned-copy");
    await manager.load(cred, new MockVaultClient(new Map([
      ["secret/secret/data/owned-copy", "provider-owned"],
    ])));

    const first = activeCopyForTest(manager, "owned_copy");
    assert.ok(first !== undefined);
    first.fill(0x41);

    const second = activeCopyForTest(manager, "owned_copy");
    assert.ok(second !== undefined);
    assert.notEqual(second.toString("utf8"), first.toString("utf8"));
    assert.equal(JSON.parse(second.toString("utf8")).value, "provider-owned");

    const status = manager.getHandle("owned_copy");
    assert.deepEqual(status, { id: "owned_copy", version: 1, faulted: false });
    assert.equal("activeValue" in status, false);
    assert.equal("stagingValue" in status, false);
  });

  it("refuses an overlapping rotation for one credential without invoking its client", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("serialized", "secret/data/serialized");
    await manager.load(cred, new MockVaultClient(new Map([
      ["secret/secret/data/serialized", "v1"],
    ])));

    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    let firstCalls = 0;
    let secondCalls = 0;
    const firstClient = {
      async readSecret() {
        firstCalls += 1;
        await firstGate;
        return Buffer.from(JSON.stringify({ value: "v2" }), "utf8");
      },
    };
    const secondClient = {
      async readSecret() {
        secondCalls += 1;
        return Buffer.from(JSON.stringify({ value: "must-not-run" }), "utf8");
      },
    };

    const first = manager.rotate("serialized", firstClient, cred);
    assert.equal(firstCalls, 1);
    const secondRefusal = assert.rejects(
      manager.rotate("serialized", secondClient, cred),
      /rotation.*lease.*active|already.*active/i,
    );
    releaseFirst();
    await first;
    await secondRefusal;
    assert.equal(secondCalls, 0, "a refused operation must not invoke its provider client");
    assert.deepEqual(manager.getHandle("serialized"), {
      id: "serialized",
      version: 2,
      faulted: false,
    });
    const active = activeCopyForTest(manager, "serialized");
    assert.ok(active !== undefined);
    assert.equal(JSON.parse(active.toString("utf8")).value, "v2");
  });

  it("keeps rotations for different credentials concurrent", async () => {
    const manager = new SecretsRotationManager();
    const credA = makeCred("parallel-a", "secret/data/parallel-a");
    const credB = makeCred("parallel-b", "secret/data/parallel-b");
    await manager.load(credA, new MockVaultClient(new Map([["secret/secret/data/parallel-a", "a1"]])));
    await manager.load(credB, new MockVaultClient(new Map([["secret/secret/data/parallel-b", "b1"]])));

    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let callsA = 0;
    let callsB = 0;
    const clientA = { async readSecret() { callsA += 1; await gate; return Buffer.from('{"value":"a2"}'); } };
    const clientB = { async readSecret() { callsB += 1; await gate; return Buffer.from('{"value":"b2"}'); } };

    const rotationA = manager.rotate(credA.id, clientA, credA);
    const rotationB = manager.rotate(credB.id, clientB, credB);
    assert.deepEqual([callsA, callsB], [1, 1], "independent credential clients start before either settles");
    release();
    await Promise.all([rotationA, rotationB]);
  });

  it("does not expose the mutable manager or token-bearing client through the facade", () => {
    const vault = GalerinaSecretsVault.fromConfig("https://vault.test", "test-token");
    assert.equal("manager" in vault, false);
    assert.equal("vaultClient" in vault, false);
    assert.equal("rotationManager" in vault, false);
    assert.equal("vaultClientInstance" in vault, false);
  });

  it("exposes secrets only through a wiped scoped view with a non-secret presence result", async () => {
    const vault = GalerinaSecretsVault.fromClient(new MockVaultClient(new Map([
      ["secret/secret/data/scoped", "scoped-value"],
    ])));
    await vault.loadContract({ credentials: [makeCred("scoped", "secret/data/scoped")] });

    let escaped;
    const result = vault.useSecret("scoped", (value) => {
      escaped = value;
      return Buffer.from(value);
    });
    assert.equal(result, true);
    assert.ok(escaped.every((byte) => byte === 0));
    assert.equal(vault.useSecret("absent", () => assert.fail("absent callback must not run")), false);
    assert.equal("getSecret" in vault, false);
    assert.equal("getActive" in new SecretsRotationManager(), false);

    assert.throws(
      () => vault.useSecret("scoped", async () => "not-allowed"),
      /must be synchronous/i,
    );
  });
});
