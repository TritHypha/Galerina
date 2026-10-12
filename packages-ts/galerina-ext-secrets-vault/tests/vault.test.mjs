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

let wipeFailureModuleSequence = 0;
async function importManagerWithWipeFailureControl() {
  const control = { target: undefined, remaining: 0, allocations: [], failures: new Map(), failNextAllocatedWipes: 0 };
  const originalFill = Uint8Array.prototype.fill;
  const originalAlloc = Buffer.alloc;
  Uint8Array.prototype.fill = function (...args) {
    if (this === control.target && control.remaining > 0) {
      control.remaining -= 1;
      throw new Error("injected wipe failure");
    }
    const remaining = control.failures.get(this) ?? 0;
    if (remaining > 0) {
      control.failures.set(this, remaining - 1);
      throw new Error("injected wipe failure");
    }
    return Reflect.apply(originalFill, this, args);
  };
  Buffer.alloc = function (size, ...args) {
    const value = Reflect.apply(originalAlloc, this, [size, ...args]);
    control.allocations.push(value);
    if (control.failNextAllocatedWipes > 0) {
      control.failNextAllocatedWipes -= 1;
      control.failures.set(value, 1);
    }
    return value;
  };
  try {
    const { SecretsRotationManager: Manager } = await import(
      `../dist/rotation-manager.js?wipe-failure-${wipeFailureModuleSequence++}`
    );
    return { Manager, control };
  } finally {
    Uint8Array.prototype.fill = originalFill;
    Buffer.alloc = originalAlloc;
  }
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

describe("GalerinaSecretsVault — manual rotation", () => {
  const credential = makeCred("manual_rotation");

  it("keeps successful manual rotation available", async () => {
    const client = new MockVaultClient(new Map([["secret/data/manual_rotation", "before"]]));
    const vault = GalerinaSecretsVault.fromClient(client);
    try {
      await vault.loadContract({ credentials: [credential] });
      client._secrets.set("secret/data/manual_rotation", "after");

      await vault.rotateCredential(credential);

      let observed;
      assert.equal(vault.useSecret("manual_rotation", (value) => { observed = value.toString("utf8"); }), true);
      assert.equal(JSON.parse(observed).value, "after");
    } finally {
      vault.stop();
    }
  });

  it("refuses an overlapping manual rotation without disrupting the active rotation", async () => {
    let markProviderStarted;
    const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });
    let releaseProvider;
    const pendingProviderValue = new Promise((resolve) => { releaseProvider = resolve; });
    let providerCalls = 0;
    const client = {
      readSecret() {
        providerCalls += 1;
        if (providerCalls === 1) {
          return Promise.resolve(Buffer.from('{"value":"before"}', "utf8"));
        }
        if (providerCalls === 2) {
          markProviderStarted();
          return pendingProviderValue;
        }
        throw new Error("unexpected duplicate provider call");
      },
    };
    const vault = GalerinaSecretsVault.fromClient(client);
    let firstRotation;
    try {
      await vault.loadContract({ credentials: [credential] });
      firstRotation = vault.rotateCredential(credential);
      await providerStarted;

      await assert.rejects(
        vault.rotateCredential(credential),
        (error) => error instanceof Error &&
          error.message.startsWith("manual credential rotation failed") &&
          !error.message.includes(credential.id) &&
          error.cause === undefined,
      );
      assert.equal(providerCalls, 2, "the refused second call must not reach the provider");

      releaseProvider(Buffer.from('{"value":"after"}', "utf8"));
      await firstRotation;

      let observed;
      assert.equal(vault.useSecret(credential.id, (value) => { observed = value.toString("utf8"); }), true);
      assert.equal(observed, '{"value":"after"}', "the first rotation must remain usable after the duplicate is refused");
    } finally {
      releaseProvider(Buffer.from('{"value":"after"}', "utf8"));
      await firstRotation?.catch(() => {});
      vault.stop();
    }
  });

  it("uses the fail-closed halt policy on provider failure and still rejects", async () => {
    let providerCalls = 0;
    const providerFailureSentinel = "PROVIDER_PRIVATE_SENTINEL_DO_NOT_DISCLOSE";
    const client = {
      async readSecret() {
        providerCalls += 1;
        if (providerCalls === 1) return Buffer.from('{"value":"synthetic-old-value"}', "utf8");
        throw new Error(providerFailureSentinel);
      },
    };
    const vault = GalerinaSecretsVault.fromClient(client);
    try {
      await vault.loadContract({ credentials: [credential] });

      await assert.rejects(
        vault.rotateCredential(credential),
        (error) => error instanceof Error &&
          error.message === "manual credential rotation failed; credential unavailable" &&
          !error.message.includes(providerFailureSentinel) &&
          error.cause === undefined,
      );
      assert.equal(providerCalls, 2, "provider failure must be observed only by the rotation attempt");
      let callbackRan = false;
      assert.equal(vault.useSecret("manual_rotation", () => { callbackRan = true; }), false);
      assert.equal(callbackRan, false, "a failed manual rotation must not retain the old credential as usable");
    } finally {
      vault.stop();
    }
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
  // Test 9: rotate() throws without echoing an unknown credential id
  // -------------------------------------------------------------------------
  it("rotate() throws if credential id is not loaded", async () => {
    const manager = new SecretsRotationManager();
    const mockClient = new MockVaultClient(new Map());

    await assert.rejects(
      () => manager.rotate("nonexistent", mockClient),
      (error) => error.message === "SecretsRotationManager.rotate: unknown credential",
      "unknown credential errors must not echo caller-controlled identifiers"
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
  // Test 12: stop() is terminal, clears the timer, and wipes loaded secrets
  // -------------------------------------------------------------------------
  it("stop() clears the timer, wipes secrets, and refuses later loads", async () => {
    const secretMap = new Map([["secret/secret/data/db", "db_pass_to_wipe"]]);
    const callLog = [];
    const mockClient = new MockVaultClient(secretMap, callLog);
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
    const callsAfterStop = callLog.length;
    await assert.rejects(
      vault.loadContract({ credentials: [cred] }),
      /manager is disposed/,
      "stopped vaults must not reacquire credentials",
    );
    assert.equal(callLog.length, callsAfterStop, "load after stop must refuse before provider access");
  });
});

// ---------------------------------------------------------------------------
// Security regressions: namespace, ownership, and affine rotation
// ---------------------------------------------------------------------------
describe("Vault zero-trust boundaries", () => {
  it("refuses and wipes the exact byte view when a provider returns Uint8Array instead of Buffer", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-uint8array-contract-violation");
    const secret = Buffer.from("malformed-provider-secret");
    const backing = Uint8Array.from([0x5a, ...secret, 0xa5]);
    const providerView = backing.subarray(1, -1);

    await assert.rejects(
      manager.load(cred, { async readSecret() { return providerView; } }),
      /provider must return a Buffer/,
    );

    assert.deepEqual([...providerView], Array(secret.length).fill(0),
      "the malformed provider byte view must be wiped before refusal");
    assert.equal(backing[0], 0x5a, "bytes before the provider view must remain untouched");
    assert.equal(backing.at(-1), 0xa5, "bytes after the provider view must remain untouched");
    assert.deepEqual(manager.listIds(), [], "a malformed provider value must never be committed");
  });

  it("quarantines existing reads and future loads after an un-wipeable detached provider view", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-detached-uint8array-load");
    await manager.load(cred, { async readSecret() { return Buffer.from("existing-secret"); } });
    const backing = new ArrayBuffer(4);
    const providerView = new Uint8Array(backing);
    providerView.set([0x73, 0x65, 0x63, 0x72]);
    const transferredBacking = structuredClone(backing, { transfer: [backing] });
    assert.equal(backing.byteLength, 0, "the provider's view is genuinely detached");
    assert.deepEqual([...new Uint8Array(transferredBacking)], [0x73, 0x65, 0x63, 0x72],
      "the transferred bytes remain available outside the detached provider view");

    await assert.rejects(
      manager.load(cred, { async readSecret() { return providerView; } }),
      /provider must return a Buffer/,
    );

    let callbackCalls = 0;
    assert.equal(manager.useActive(cred.id, () => { callbackCalls += 1; }), false,
      "unresolved provider cleanup must quarantine previously active protected reads");
    assert.equal(callbackCalls, 0);
    let providerCalls = 0;
    await assert.rejects(
      manager.load(makeCred("provider-after-detached-load"), {
        async readSecret() { providerCalls += 1; return Buffer.from("later-secret"); },
      }),
      /cleanup incomplete/,
    );
    assert.equal(providerCalls, 0, "later provider access must stay closed while cleanup is unresolved");
  });

  it("quarantines existing reads and future loads after an un-wipeable proxy provider view", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-proxy-uint8array-load");
    await manager.load(cred, { async readSecret() { return Buffer.from("existing-secret"); } });

    const providerView = Uint8Array.from(Buffer.from("proxy-secret"));
    const providerProxy = new Proxy(providerView, {});
    await assert.rejects(
      manager.load(cred, { async readSecret() { return providerProxy; } }),
      /provider must return a Buffer/,
    );

    assert.deepEqual([...providerView], [...Buffer.from("proxy-secret")],
      "the wrapped provider bytes remain outside the manager's wipe capability");
    let callbackCalls = 0;
    assert.equal(manager.useActive(cred.id, () => { callbackCalls += 1; }), false,
      "unverified provider cleanup must quarantine the prior active handle");
    assert.equal(callbackCalls, 0);

    let providerCalls = 0;
    await assert.rejects(
      manager.load(makeCred("provider-after-proxy-load"), {
        async readSecret() { providerCalls += 1; return Buffer.from("later-secret"); },
      }),
      /cleanup incomplete/,
    );
    assert.equal(providerCalls, 0, "provider access must stay closed while proxy cleanup is unresolved");
  });

  it("does not trust a proxy-reported prototype when deciding provider cleanup is complete", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-proxy-hidden-prototype-load");
    await manager.load(cred, { async readSecret() { return Buffer.from("existing-secret"); } });

    const providerView = Uint8Array.from(Buffer.from("hidden-proxy-secret"));
    const providerProxy = new Proxy(providerView, {
      getPrototypeOf() { return Object.prototype; },
    });
    await assert.rejects(
      manager.load(cred, { async readSecret() { return providerProxy; } }),
      /provider must return a Buffer/,
    );

    let callbackCalls = 0;
    assert.equal(manager.useActive(cred.id, () => { callbackCalls += 1; }), false,
      "unknown proxy cleanup must block the previously active credential");
    assert.equal(callbackCalls, 0);
    let providerCalls = 0;
    await assert.rejects(
      manager.load(makeCred("provider-after-hidden-proxy-load"), {
        async readSecret() { providerCalls += 1; return Buffer.from("later-secret"); },
      }),
      /cleanup incomplete/,
    );
    assert.equal(providerCalls, 0, "provider access must remain closed after opaque output");
  });

  it("refuses re-entrant active reads while a provider load is still unresolved", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-reentrant-load");
    await manager.load(cred, { async readSecret() { return Buffer.from("existing-secret"); } });

    const backing = new ArrayBuffer(4);
    const providerView = new Uint8Array(backing);
    providerView.set([0x6e, 0x65, 0x77, 0x21]);
    structuredClone(backing, { transfer: [backing] });
    let reentrantRead = true;

    await assert.rejects(
      manager.load(cred, {
        async readSecret() {
          reentrantRead = manager.useActive(cred.id, () => {});
          return providerView;
        },
      }),
      /provider must return a Buffer/,
    );

    assert.equal(reentrantRead, false,
      "provider re-entry must not read the prior active secret before malformed provider bytes are rejected");
  });

  it("refuses re-entrant active reads while a provider rotation is still unresolved", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-reentrant-rotation");
    await manager.load(cred, { async readSecret() { return Buffer.from("existing-secret"); } });

    const backing = new ArrayBuffer(4);
    const providerView = new Uint8Array(backing);
    providerView.set([0x72, 0x6f, 0x74, 0x21]);
    structuredClone(backing, { transfer: [backing] });
    let reentrantRead = true;

    await assert.rejects(
      manager.rotate(cred.id, {
        async readSecret() {
          reentrantRead = manager.useActive(cred.id, () => {});
          return providerView;
        },
      }, cred),
      /provider must return a Buffer/,
    );

    assert.equal(reentrantRead, false,
      "provider re-entry must not read the prior active secret before malformed rotation bytes are rejected");
  });

  it("keeps reads closed until every concurrent provider operation settles", async () => {
    const manager = new SecretsRotationManager();
    const first = makeCred("provider-concurrent-first");
    const second = makeCred("provider-concurrent-second");
    await manager.load(first, { async readSecret() { return Buffer.from("first-old"); } });
    await manager.load(second, { async readSecret() { return Buffer.from("second-old"); } });

    const deferred = () => {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      return { promise, resolve };
    };
    const firstProvider = deferred();
    const secondProvider = deferred();
    const firstLoad = manager.load(first, { readSecret() { return firstProvider.promise; } });
    const secondLoad = manager.load(second, { readSecret() { return secondProvider.promise; } });

    assert.equal(manager.useActive(first.id, () => {}), false);
    firstProvider.resolve(Buffer.from("first-new"));
    await firstLoad;
    assert.equal(manager.useActive(second.id, () => {}), false,
      "one completed provider must not reopen reads while another provider remains unresolved");

    secondProvider.resolve(Buffer.from("second-new"));
    await secondLoad;
    assert.equal(manager.useActive(first.id, () => {}), true);
    assert.equal(manager.useActive(second.id, () => {}), true);
  });

  it("refuses active reads throughout the rotation quiescence interval", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("rotation-quiescence-read-gate");
    const unrelatedCred = makeCred("rotation-quiescence-unrelated");
    await manager.load(cred, { async readSecret() { return Buffer.from("old-active"); } });
    await manager.load(unrelatedCred, { async readSecret() { return Buffer.from("unrelated-active"); } });

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    let releaseQuiescence;
    let markQuiescenceStarted;
    const quiescenceStarted = new Promise((resolve) => { markQuiescenceStarted = resolve; });
    let rotation;
    let rotationOutcome;
    let resolveCandidate;
    let candidateReleased = false;
    let readinessWatchdog;
    let cleanupWatchdog;
    const assertBufferEquals = (actual, expectedText, message) => {
      const expected = Buffer.from(expectedText);
      try {
        assert.ok(actual?.equals(expected), message);
      } finally {
        actual?.fill(0);
        expected.fill(0);
      }
    };

    globalThis.setTimeout = (callback, delay, ...args) => {
      if (delay === 50) {
        releaseQuiescence = () => callback(...args);
        markQuiescenceStarted();
        return undefined;
      }
      return originalSetTimeout(callback, delay, ...args);
    };

    const releaseCandidate = () => {
      if (!candidateReleased && resolveCandidate !== undefined) {
        candidateReleased = true;
        resolveCandidate(Buffer.from("new-active"));
      }
    };

    try {
      const candidate = new Promise((resolve) => { resolveCandidate = resolve; });
      rotation = manager.rotate(cred.id, {
        readSecret() { return candidate; },
      }, cred);
      rotationOutcome = rotation.then(
        () => ({ kind: "fulfilled" }),
        (error) => ({ kind: "rejected", error }),
      );
      releaseCandidate();
      const orderingPoint = await Promise.race([
        quiescenceStarted.then(() => ({ kind: "quiescence" })),
        rotationOutcome.then((outcome) => ({ kind: "rotation-settled", outcome })),
        new Promise((resolve) => {
          readinessWatchdog = originalSetTimeout(() => resolve({ kind: "watchdog" }), 1_000);
        }),
      ]);
      if (readinessWatchdog !== undefined) originalClearTimeout(readinessWatchdog);
      assert.equal(orderingPoint.kind, "quiescence",
        "rotation must reach quiescence before settling or timing out");

      const duringQuiescence = activeCopyForTest(manager, cred.id);
      try {
        assert.equal(duringQuiescence, undefined,
          "the old active secret must not be served once rotation has entered quiescence");
      } finally {
        duringQuiescence?.fill(0);
      }
      assertBufferEquals(
        activeCopyForTest(manager, unrelatedCred.id),
        "unrelated-active",
        "a different credential remains usable while this credential is quiescing",
      );
      releaseQuiescence();
      releaseQuiescence = undefined;
      const completion = await Promise.race([
        rotationOutcome,
        new Promise((resolve) => {
          cleanupWatchdog = originalSetTimeout(() => resolve({ kind: "cleanup-timeout" }), 1_000);
        }),
      ]);
      if (cleanupWatchdog !== undefined) originalClearTimeout(cleanupWatchdog);
      assert.notEqual(completion.kind, "cleanup-timeout",
        "rotation must settle after quiescence is released");
      assert.equal(completion.kind, "fulfilled");
      assertBufferEquals(
        activeCopyForTest(manager, cred.id),
        "new-active",
        "the rotated value is active after completion",
      );
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      if (readinessWatchdog !== undefined) originalClearTimeout(readinessWatchdog);
      if (cleanupWatchdog !== undefined) originalClearTimeout(cleanupWatchdog);
      releaseQuiescence?.();
      releaseCandidate();
      if (rotationOutcome !== undefined) {
        await Promise.race([
          rotationOutcome,
          new Promise((resolve) => {
            const timer = originalSetTimeout(() => resolve({ kind: "cleanup-timeout" }), 1_000);
            cleanupWatchdog = timer;
          }),
        ]);
        if (cleanupWatchdog !== undefined) originalClearTimeout(cleanupWatchdog);
      }
      manager.dispose();
    }
  });

  it("keeps malformed cleanup quarantine after a concurrent valid provider settles", async () => {
    const manager = new SecretsRotationManager();
    const slow = makeCred("provider-race-slow");
    const malformed = makeCred("provider-race-malformed");
    await manager.load(slow, { async readSecret() { return Buffer.from("slow-old"); } });
    await manager.load(malformed, { async readSecret() { return Buffer.from("malformed-old"); } });

    let resolveSlow;
    const slowResult = new Promise((resolve) => { resolveSlow = resolve; });
    const slowLoad = manager.load(slow, { readSecret() { return slowResult; } });
    const backing = new ArrayBuffer(4);
    const providerView = new Uint8Array(backing);
    providerView.set([0x73, 0x65, 0x63, 0x72]);
    structuredClone(backing, { transfer: [backing] });

    await assert.rejects(
      manager.load(malformed, { async readSecret() { return providerView; } }),
      /provider must return a Buffer/,
    );
    assert.equal(manager.useActive(slow.id, () => {}), false);

    resolveSlow(Buffer.from("slow-new"));
    await slowLoad;
    assert.equal(manager.useActive(slow.id, () => {}), false,
      "settling another provider must not clear an unresolved malformed-view cleanup obligation");
  });

  it("quarantines rotation reads and future rotations after an un-wipeable detached provider view", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-detached-uint8array-rotation");
    await manager.load(cred, { async readSecret() { return Buffer.from("existing-secret"); } });
    const backing = new ArrayBuffer(4);
    const providerView = new Uint8Array(backing);
    providerView.set([0x72, 0x6f, 0x74, 0x31]);
    const transferredBacking = structuredClone(backing, { transfer: [backing] });
    assert.equal(backing.byteLength, 0, "the provider's view is genuinely detached");
    assert.deepEqual([...new Uint8Array(transferredBacking)], [0x72, 0x6f, 0x74, 0x31],
      "the transferred bytes remain available outside the detached provider view");

    await assert.rejects(
      manager.rotate(cred.id, { async readSecret() { return providerView; } }, cred),
      /provider must return a Buffer/,
    );

    let callbackCalls = 0;
    assert.equal(manager.useActive(cred.id, () => { callbackCalls += 1; }), false,
      "unresolved provider cleanup must quarantine the existing protected read");
    assert.equal(callbackCalls, 0);
    let providerCalls = 0;
    await assert.rejects(
      manager.rotate(cred.id, { async readSecret() { providerCalls += 1; return Buffer.from("later-secret"); } }, cred),
      /cleanup incomplete/,
    );
    assert.equal(providerCalls, 0, "later provider access must stay closed while cleanup is unresolved");
  });

  it("closes reads, attempts every wipe, and retries failed cleanup on repeated disposal", async () => {
    const { Manager, control } = await importManagerWithWipeFailureControl();
    const manager = new Manager();
    const first = makeCred("dispose-wipe-failure-first");
    const second = makeCred("dispose-wipe-failure-second");
    await manager.load(first, { async readSecret() { return Buffer.from("first-secret"); } });
    const firstOwned = control.allocations.at(-1);
    await manager.load(second, { async readSecret() { return Buffer.from("second-secret"); } });
    const secondOwned = control.allocations.at(-1);
    let callbackCalls = 0;

    control.target = firstOwned;
    control.remaining = 1;
    assert.throws(
      () => manager.dispose(),
      (error) => error instanceof Error && error.message === "SecretsRotationManager: cleanup incomplete",
    );
    assert.deepEqual(manager.listIds(), [], "failed cleanup must not leave readable handles registered");
    assert.equal(manager.useActive(first.id, () => { callbackCalls += 1; }), false);
    assert.equal(manager.useActive(second.id, () => { callbackCalls += 1; }), false);
    assert.equal(Uint8Array.prototype.every.call(secondOwned, (byte) => byte === 0), true,
      "one failed wipe must not prevent cleanup attempts for other handles");
    assert.equal(Uint8Array.prototype.some.call(firstOwned, (byte) => byte !== 0), true,
      "the injected first cleanup failure must be observable before retry");

    assert.doesNotThrow(() => manager.dispose(), "a second dispose must retry retained cleanup obligations");
    assert.equal(Uint8Array.prototype.every.call(firstOwned, (byte) => byte === 0), true);
    assert.equal(manager.useActive(first.id, () => { callbackCalls += 1; }), false);
    assert.equal(callbackCalls, 0, "closed managers must never invoke scoped readers");
  });

  it("wipes an unpublished replacement copy when old-handle cleanup fails, then retries safely", async () => {
    const { Manager, control } = await importManagerWithWipeFailureControl();
    const manager = new Manager();
    const cred = makeCred("replacement-wipe-failure");
    await manager.load(cred, { async readSecret() { return Buffer.from("old-value"); } });
    const oldOwned = control.allocations.at(-1);
    const beforeReplacement = control.allocations.length;
    control.target = oldOwned;
    control.remaining = 1;

    await assert.rejects(
      manager.load(cred, { async readSecret() { return Buffer.from("new-value"); } }),
      (error) => error instanceof Error && error.message === "SecretsRotationManager: cleanup incomplete",
    );
    const rejectedCandidate = control.allocations[beforeReplacement];
    assert.ok(rejectedCandidate);
    assert.equal(Uint8Array.prototype.every.call(rejectedCandidate, (byte) => byte === 0), true,
      "the uncommitted candidate must be wiped when replacement cannot commit");
    assert.equal(manager.useActive(cred.id, () => {}), false,
      "a manager with unresolved cleanup must fail closed before serving the previous handle");

    await manager.load(cred, { async readSecret() { return Buffer.from("retry-value"); } });
    assert.equal(Uint8Array.prototype.every.call(oldOwned, (byte) => byte === 0), true,
      "a later operation must first retry pending cleanup");
    assert.equal(activeCopyForTest(manager, cred.id)?.toString("utf8"), "retry-value");
  });

  it("retains a retired rotation buffer and blocks every scoped read until cleanup retries", async () => {
    const { Manager, control } = await importManagerWithWipeFailureControl();
    const manager = new Manager();
    const rotating = makeCred("rotation-retirement-wipe-failure");
    const unrelated = makeCred("rotation-retirement-unrelated");
    await manager.load(rotating, { async readSecret() { return Buffer.from("old-rotating"); } });
    const retired = control.allocations.at(-1);
    await manager.load(unrelated, { async readSecret() { return Buffer.from("unrelated-live"); } });
    control.failures.set(retired, 1);

    await assert.rejects(
      manager.rotate(rotating.id, { async readSecret() { return Buffer.from("new-rotating"); } }, rotating),
      (error) => error instanceof Error && error.message === "SecretsRotationManager: cleanup incomplete",
    );
    assert.equal(Uint8Array.prototype.some.call(retired, (byte) => byte !== 0), true,
      "the injected retirement failure must be visible before retry");
    let callbackCalls = 0;
    assert.equal(manager.useActive(rotating.id, () => { callbackCalls += 1; }), false,
      "the rotated handle must be faulted after its retired bytes failed cleanup");
    assert.equal(manager.useActive(unrelated.id, () => { callbackCalls += 1; }), false,
      "pending cleanup must gate unrelated live handles too");
    assert.equal(callbackCalls, 0);

    await manager.load(unrelated, { async readSecret() { return Buffer.from("unrelated-after-retry"); } });
    assert.equal(Uint8Array.prototype.every.call(retired, (byte) => byte === 0), true,
      "the next admitted manager operation must retry and complete retirement");
    assert.deepEqual(manager.getHandle(rotating.id), {
      id: rotating.id,
      version: 2,
      faulted: true,
    }, "retirement failure must remain a per-handle fault after global cleanup completes");
    assert.equal(manager.useActive(rotating.id, () => { callbackCalls += 1; }), false,
      "clearing pending cleanup must not reopen the rotated handle");
    assert.equal(callbackCalls, 0, "a persistently faulted handle must never invoke its callback");
    assert.equal(activeCopyForTest(manager, unrelated.id)?.toString("utf8"), "unrelated-after-retry");
    assert.deepEqual(manager.getHandle(rotating.id), {
      id: rotating.id,
      version: 2,
      faulted: true,
    }, "serving an unrelated credential must not reopen the retired credential");
    assert.equal(manager.useActive(rotating.id, () => { callbackCalls += 1; }), false,
      "the retired credential must remain unavailable after unrelated access");
    assert.equal(callbackCalls, 0, "rechecking the retired credential must not invoke its callback");
  });

  it("retains a halt-evicted buffer when wiping fails and does not leak the failure", async () => {
    const { Manager, control } = await importManagerWithWipeFailureControl();
    const manager = new Manager();
    const cred = makeCred("halt-eviction-wipe-failure");
    await manager.load(cred, { async readSecret() { return Buffer.from("halt-secret"); } });
    const owned = control.allocations.at(-1);
    control.failures.set(owned, 1);

    assert.equal(await manager.rotateOrFault(
      cred,
      { async readSecret() { throw new Error("provider unavailable"); } },
      "halt",
    ), false, "halt policy must report the failed rotation without leaking a wipe exception");
    assert.deepEqual(manager.listIds(), [], "halt evicts the handle before fallible cleanup completes");
    assert.equal(manager.useActive(cred.id, () => {}), false);
    assert.equal(Uint8Array.prototype.some.call(owned, (byte) => byte !== 0), true,
      "failed wipe remains observable until retry");

    assert.doesNotThrow(() => manager.dispose(), "dispose retries the retained halt-eviction obligation");
    assert.equal(Uint8Array.prototype.every.call(owned, (byte) => byte === 0), true,
      "dispose retries the eviction cleanup obligation");
  });

  it("retains both provider and owned buffers if provider transfer cleanup fails", async () => {
    const { Manager, control } = await importManagerWithWipeFailureControl();
    const manager = new Manager();
    const cred = makeCred("provider-transfer-wipe-failure");
    const providerOwned = Buffer.from("provider-transfer-secret");
    control.failures.set(providerOwned, 1);
    control.failNextAllocatedWipes = 1;

    await assert.rejects(
      manager.load(cred, { async readSecret() { return providerOwned; } }),
      /provider buffer cleanup failed/,
    );
    const retainedCopy = control.allocations.at(-1);
    assert.ok(retainedCopy);
    assert.equal(Uint8Array.prototype.some.call(providerOwned, (byte) => byte !== 0), true);
    assert.equal(Uint8Array.prototype.some.call(retainedCopy, (byte) => byte !== 0), true);
    assert.equal(manager.useActive(cred.id, () => {}), false);

    assert.doesNotThrow(() => manager.dispose(), "dispose retries both retained transfer-cleanup obligations");
    assert.equal(Uint8Array.prototype.every.call(providerOwned, (byte) => byte === 0), true,
      "manager must retain the provider-buffer wipe obligation");
    assert.equal(Uint8Array.prototype.every.call(retainedCopy, (byte) => byte === 0), true,
      "manager must retain the unpublished owned-copy wipe obligation");
  });

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

  it("publishes the rotation lease before provider code can re-enter", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("reentrant", "secret/data/reentrant");
    await manager.load(cred, new MockVaultClient(new Map([
      ["secret/secret/data/reentrant", "v1"],
    ])));

    let nestedRotation;
    let nestedProviderCalls = 0;
    const nestedClient = {
      async readSecret() {
        nestedProviderCalls += 1;
        return Buffer.from(JSON.stringify({ value: "must-not-run" }), "utf8");
      },
    };
    const reentrantClient = {
      readSecret() {
        nestedRotation = manager.rotate(cred.id, nestedClient, cred);
        return Promise.resolve(Buffer.from(JSON.stringify({ value: "v2" }), "utf8"));
      },
    };

    const firstRotation = manager.rotate(cred.id, reentrantClient, cred);
    const nestedRefusal = assert.rejects(
      nestedRotation,
      /rotation.*lease.*active|already.*active/i,
    );
    await firstRotation;
    await nestedRefusal;
    assert.equal(nestedProviderCalls, 0, "the re-entrant provider must not start without the credential lease");
    const active = activeCopyForTest(manager, cred.id);
    assert.ok(active !== undefined);
    assert.equal(JSON.parse(active.toString("utf8")).value, "v2");
  });

  for (const policy of ["halt", "quarantine"]) {
    it(`does not let a duplicate rotateOrFault(${policy}) corrupt the active rotation`, async () => {
      const manager = new SecretsRotationManager();
      const cred = makeCred(`fault-reentry-${policy}`);
      await manager.load(cred, new MockVaultClient(new Map([
        [`secret/${cred.path}`, "v1"],
      ])));

      let nestedResult;
      let nestedProviderCalls = 0;
      const nestedClient = {
        async readSecret() {
          nestedProviderCalls += 1;
          return Buffer.from('{"value":"must-not-run"}');
        },
      };
      const outerClient = {
        readSecret() {
          nestedResult = manager.rotateOrFault(cred, nestedClient, policy);
          return Promise.resolve(Buffer.from('{"value":"v2"}'));
        },
      };

      await manager.rotate(cred.id, outerClient, cred);
      assert.equal(await nestedResult, false, "the duplicate attempt is refused");
      assert.equal(nestedProviderCalls, 0, "the duplicate provider never starts");
      assert.deepEqual(manager.getHandle(cred.id), {
        id: cred.id,
        version: 2,
        faulted: false,
      }, "busy refusal must not apply a fault policy to the in-flight operation");
      const active = activeCopyForTest(manager, cred.id);
      assert.ok(active !== undefined);
      assert.equal(JSON.parse(active.toString("utf8")).value, "v2");

      await manager.rotate(cred.id, {
        async readSecret() { return Buffer.from('{"value":"v3"}'); },
      }, cred);
      assert.equal(manager.getHandle(cred.id).version, 3, "lease is released for a later rotation");
    });

    it(`applies outer ${policy} policy when its provider propagates a nested busy refusal`, async () => {
      const manager = new SecretsRotationManager();
      const cred = makeCred(`propagated-busy-${policy}`);
      await manager.load(cred, new MockVaultClient(new Map([
        [`secret/${cred.path}`, "v1"],
      ])));

      let nestedProviderCalls = 0;
      const nestedClient = {
        async readSecret() {
          nestedProviderCalls += 1;
          return Buffer.from('{"value":"must-not-run"}');
        },
      };
      const outerClient = {
        async readSecret() {
          await manager.rotate(cred.id, nestedClient, cred);
          return Buffer.from('{"value":"unreachable"}');
        },
      };

      assert.equal(await manager.rotateOrFault(cred, outerClient, policy), false);
      assert.equal(nestedProviderCalls, 0, "the nested provider never starts");
      if (policy === "halt") {
        assert.equal(manager.getHandle(cred.id), undefined, "outer halt evicts after its acquired operation fails");
        assert.equal(activeCopyForTest(manager, cred.id), undefined);
      } else {
        assert.deepEqual(manager.getHandle(cred.id), {
          id: cred.id,
          version: 1,
          faulted: true,
        }, "outer quarantine applies to the acquired operation's propagated failure");
        assert.equal(activeCopyForTest(manager, cred.id), undefined);
      }
    });
  }

  for (const policy of ["halt", "quarantine", "log"]) {
    it(`keeps the rotation lease through ${policy} logging and releases it after settlement`, async () => {
      const manager = new SecretsRotationManager();
      const cred = makeCred(`fault-policy-logger-reentry-${policy}`);
      await manager.load(cred, { async readSecret() { return Buffer.from("v1"); } });

      let nestedResult;
      let nestedProviderCalls = 0;
      const originalError = console.error;
      console.error = (message) => {
        if (message === `[galerina-ext-secrets-vault] rotation failed; policy=${policy}; ${policy === "halt"
          ? "credential evicted (fail-closed)"
          : policy === "quarantine"
            ? "active value wiped (fail-closed)"
            : "stale value retained (not fail-closed)"}`) {
          nestedResult = manager.rotateOrFault(cred, {
            async readSecret() {
              nestedProviderCalls += 1;
              return Buffer.from("must-not-start-during-policy");
            },
          }, policy);
        }
      };
      try {
        assert.equal(await manager.rotateOrFault(cred, {
          async readSecret() { throw new Error("synthetic provider failure"); },
        }, policy), false);
      } finally {
        console.error = originalError;
      }

      assert.ok(nestedResult instanceof Promise, "fault-policy logger synchronously re-entered rotation");
      assert.equal(await nestedResult, false, "re-entry must be refused while the outer lease is held");
      assert.equal(nestedProviderCalls, 0, "the nested provider must not start during failure-policy logging");

      if (policy === "halt") {
        assert.equal(manager.getHandle(cred.id), undefined);
        await manager.load(cred, { async readSecret() { return Buffer.from("reload"); } });
      } else if (policy === "quarantine") {
        assert.deepEqual(manager.getHandle(cred.id), { id: cred.id, version: 1, faulted: true });
      } else {
        assert.equal(activeCopyForTest(manager, cred.id)?.toString("utf8"), "v1");
      }

      assert.equal(await manager.rotateOrFault(cred, {
        async readSecret() { return Buffer.from("after-policy"); },
      }, policy), true, "a settled fault-policy operation must release its lease");
      assert.equal(activeCopyForTest(manager, cred.id)?.toString("utf8"), "after-policy");
    });
  }

  it("keeps the rotation lease until the failure policy is applied", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("fault-policy-lease-order");
    await manager.load(cred, new MockVaultClient(new Map([
      [`secret/${cred.path}`, "v1"],
    ])));

    let rejectProvider;
    const firstRotation = manager.rotateOrFault(cred, {
      readSecret() {
        return new Promise((_resolve, reject) => { rejectProvider = reject; });
      },
    }, "halt");
    assert.equal(typeof rejectProvider, "function", "first provider call has started");
    rejectProvider(new Error("synthetic provider failure"));

    let retryProviderCalls = 0;
    const retry = Promise.resolve()
      .then(() => undefined)
      .then(() => undefined)
      .then(() => undefined)
      .then(() => manager.rotateOrFault(cred, {
        async readSecret() {
          retryProviderCalls += 1;
          return Buffer.from("must-not-be-used");
        },
      }, "halt"));

    assert.equal(await firstRotation, false, "the failed rotation is refused");
    assert.equal(await retry, false, "the overlapping retry is refused");
    assert.equal(retryProviderCalls, 0,
      "provider access cannot begin between rejection and application of the halt policy");
    assert.equal(manager.getHandle(cred.id), undefined, "halt evicts after the failure policy owns the lease");
  });

  for (const policy of ["halt", "quarantine"]) {
    it(`does not apply an older rotation's ${policy} policy to a newer successful load`, async () => {
      const manager = new SecretsRotationManager();
      const cred = makeCred(`replacement-load-${policy}`);
      await manager.load(cred, { async readSecret() { return Buffer.from('{"value":"v1"}'); } });

      let rejectRotation;
      const pendingRotation = manager.rotateOrFault(cred, {
        readSecret() {
          return new Promise((_resolve, reject) => { rejectRotation = reject; });
        },
      }, policy);
      assert.equal(typeof rejectRotation, "function", "the rotation provider has started");

      await manager.load(cred, { async readSecret() { return Buffer.from('{"value":"new-load"}'); } });
      rejectRotation(new Error("the older rotation failed after load replacement"));

      assert.equal(await pendingRotation, false, "the failed rotation remains a refusal");
      assert.deepEqual(manager.getHandle(cred.id), {
        id: cred.id,
        version: 2,
        faulted: false,
      }, "failure policy must not invalidate a different handle installed after the rotation started");
      assert.equal(
        JSON.parse(activeCopyForTest(manager, cred.id).toString("utf8")).value,
        "new-load",
        "the newer successfully loaded secret remains available",
      );
    });
  }

  for (const malformed of [null, { value: "not a Buffer" }]) {
    it(`rejects malformed provider result ${String(malformed)} without adopting it`, async () => {
      const manager = new SecretsRotationManager();
      const cred = makeCred(`malformed-result-${malformed === null ? "null" : "object"}`);
      await manager.load(cred, new MockVaultClient(new Map([
        [`secret/${cred.path}`, "v1"],
      ])));

      await assert.rejects(
        manager.rotate(cred.id, { async readSecret() { return malformed; } }, cred),
        /provider.*Buffer/i,
      );
      assert.deepEqual(manager.getHandle(cred.id), {
        id: cred.id,
        version: 1,
        faulted: false,
      }, "invalid candidate must not be committed");
      if (malformed === null) {
        const active = activeCopyForTest(manager, cred.id);
        assert.ok(active !== undefined);
        assert.equal(JSON.parse(active.toString("utf8")).value, "v1");

        await manager.rotate(cred.id, {
          async readSecret() { return Buffer.from('{"value":"v2"}'); },
        }, cred);
        assert.equal(manager.getHandle(cred.id).version, 2, "known empty refusal releases the rotation lease");
        const replacement = activeCopyForTest(manager, cred.id);
        assert.ok(replacement !== undefined);
        assert.equal(JSON.parse(replacement.toString("utf8")).value, "v2");
      } else {
        assert.equal(manager.useActive(cred.id, () => assert.fail("opaque provider output must quarantine reads")), false);
        let providerCalls = 0;
        await assert.rejects(
          manager.rotate(cred.id, {
            async readSecret() { providerCalls += 1; return Buffer.from("later-secret"); },
          }, cred),
          /cleanup incomplete/,
        );
        assert.equal(providerCalls, 0, "unverifiable provider data blocks later provider access");
        assert.throws(() => manager.dispose(), /cleanup incomplete/,
          "manager disposal must report the retained unverifiable provider output");
        assert.deepEqual(manager.listIds(), [], "disposal still wipes and removes manager-owned handles");
      }
    });
  }

  it("takes ownership of an independent wiped copy from the provider during load", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-buffer-alias-load");
    const providerBuffer = Buffer.from("load-secret");
    await manager.load(cred, {
      async readSecret() { return providerBuffer; },
    });

    assert.ok(providerBuffer.every((byte) => byte === 0), "provider-returned bytes are wiped after transfer");
    providerBuffer.fill(0x58);
    let activeValue;
    assert.equal(manager.useActive(cred.id, (value) => { activeValue = value.toString("utf8"); }), true);
    assert.equal(activeValue, "load-secret", "later provider-buffer mutation cannot change the active copy");
  });

  it("takes ownership of an independent wiped copy from the provider during rotation", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-buffer-alias-rotation");
    await manager.load(cred, new MockVaultClient(new Map([
      [`secret/${cred.path}`, "v1"],
    ])));
    const providerBuffer = Buffer.from("rotation-secret");
    await manager.rotate(cred.id, {
      async readSecret() { return providerBuffer; },
    }, cred);

    assert.ok(providerBuffer.every((byte) => byte === 0), "provider-returned bytes are wiped after transfer");
    providerBuffer.fill(0x58);
    let activeValue;
    assert.equal(manager.useActive(cred.id, (value) => { activeValue = value.toString("utf8"); }), true);
    assert.equal(activeValue, "rotation-secret", "later provider-buffer mutation cannot change the active copy");
  });

  it("copies only the provider Buffer view without invoking provider valueOf during load", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-valueof-alias-load");
    const expected = Buffer.from("load-valueof-secret");
    const providerStorage = Buffer.from([0x11, ...expected, 0x22]);
    const providerBuffer = providerStorage.subarray(1, -1);
    let valueOfCalls = 0;
    providerBuffer.valueOf = () => {
      valueOfCalls += 1;
      return providerBuffer.buffer;
    };

    await manager.load(cred, { async readSecret() { return providerBuffer; } });

    let activeLength;
    let activeBytes;
    assert.equal(manager.useActive(cred.id, (value) => {
      activeLength = value.length;
      activeBytes = Uint8Array.prototype.slice.call(value);
    }), true);
    assert.equal(valueOfCalls, 0, "provider-controlled coercion must not run during byte transfer");
    assert.equal(activeLength, expected.length, "the active copy must preserve the provider view bounds");
    assert.deepEqual(activeBytes, Uint8Array.prototype.slice.call(expected));
    assert.equal(Uint8Array.prototype.every.call(providerBuffer, (byte) => byte === 0), true,
      "the exact provider view must be wiped after transfer");
    assert.deepEqual(providerStorage, Buffer.from([0x11, ...Buffer.alloc(expected.length), 0x22]),
      "bytes outside the provider view must not be wiped");
  });

  it("copies only the provider Buffer view without invoking provider valueOf during rotation", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-valueof-alias-rotation");
    await manager.load(cred, { async readSecret() { return Buffer.from("v1"); } });
    const expected = Buffer.from("rotation-valueof-secret");
    const providerStorage = Buffer.from([0x11, ...expected, 0x22]);
    const providerBuffer = providerStorage.subarray(1, -1);
    let valueOfCalls = 0;
    providerBuffer.valueOf = () => {
      valueOfCalls += 1;
      return providerBuffer.buffer;
    };

    await manager.rotate(cred.id, { async readSecret() { return providerBuffer; } }, cred);

    let activeLength;
    let activeBytes;
    assert.equal(manager.useActive(cred.id, (value) => {
      activeLength = value.length;
      activeBytes = Uint8Array.prototype.slice.call(value);
    }), true);
    assert.equal(valueOfCalls, 0, "provider-controlled coercion must not run during byte transfer");
    assert.equal(activeLength, expected.length, "the active copy must preserve the provider view bounds");
    assert.deepEqual(activeBytes, Uint8Array.prototype.slice.call(expected));
    assert.equal(Uint8Array.prototype.every.call(providerBuffer, (byte) => byte === 0), true,
      "the exact provider view must be wiped after transfer");
    assert.deepEqual(providerStorage, Buffer.from([0x11, ...Buffer.alloc(expected.length), 0x22]),
      "bytes outside the provider view must not be wiped");
  });

  it("transfers an empty provider Buffer without creating bytes", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-empty-buffer");
    const providerBuffer = Buffer.alloc(0);
    await manager.load(cred, { async readSecret() { return providerBuffer; } });
    let activeLength = -1;
    assert.equal(manager.useActive(cred.id, (value) => { activeLength = value.length; }), true);
    assert.equal(activeLength, 0);
    assert.equal(providerBuffer.length, 0);
  });

  it("transfers an empty provider Buffer during rotation without creating bytes", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-empty-buffer-rotation");
    await manager.load(cred, { async readSecret() { return Buffer.from("v1"); } });
    const providerBuffer = Buffer.alloc(0);

    await manager.rotate(cred.id, { async readSecret() { return providerBuffer; } }, cred);

    let activeLength = -1;
    assert.equal(manager.useActive(cred.id, (value) => { activeLength = value.length; }), true);
    assert.equal(activeLength, 0);
    assert.deepEqual(manager.getHandle(cred.id), { id: cred.id, version: 2, faulted: false });
    assert.equal(providerBuffer.length, 0);
  });

  it("refuses a detached provider Buffer during load without creating a handle", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-detached-buffer-load");
    const backing = new ArrayBuffer(4);
    const providerBuffer = Buffer.from(backing);
    structuredClone(backing, { transfer: [backing] });
    assert.equal(backing.byteLength, 0, "the provider backing store is genuinely detached");

    await assert.rejects(
      manager.load(cred, { async readSecret() { return providerBuffer; } }),
      /provider buffer transfer failed/,
    );
    assert.equal(manager.getHandle(cred.id), undefined, "detached bytes must never become active");
  });

  it("quarantines the existing handle after detached rotation bytes cannot be wiped", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-detached-buffer-rotation");
    await manager.load(cred, { async readSecret() { return Buffer.from("v1"); } });
    const backing = new ArrayBuffer(4);
    const providerBuffer = Buffer.from(backing);
    structuredClone(backing, { transfer: [backing] });
    assert.equal(backing.byteLength, 0, "the provider backing store is genuinely detached");

    await assert.rejects(
      manager.rotate(cred.id, { async readSecret() { return providerBuffer; } }, cred),
      /provider buffer transfer failed/,
    );
    assert.deepEqual(manager.getHandle(cred.id), {
      id: cred.id,
      version: 1,
      faulted: false,
    });
    assert.equal(manager.useActive(cred.id, () => assert.fail("unresolved cleanup must quarantine reads")), false,
      "a detached provider value must not leave the previous secret readable");
    let providerCalls = 0;
    await assert.rejects(
      manager.rotate(cred.id, {
        async readSecret() { providerCalls += 1; return Buffer.from("v2"); },
      }, cred),
      /cleanup incomplete/,
    );
    assert.equal(providerCalls, 0, "an unresolved detached wipe must block later provider access");
  });

  it("wipes a provider Buffer through the typed-array intrinsic during load", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-overridden-fill-load");
    const providerBuffer = Buffer.from("load-secret-with-overridden-fill");
    let overriddenFillCalls = 0;
    providerBuffer.fill = () => {
      overriddenFillCalls += 1;
      throw new Error("provider cleanup leaked this error");
    };

    await manager.load(cred, { async readSecret() { return providerBuffer; } });

    assert.equal(overriddenFillCalls, 0, "provider-controlled instance methods must not perform cleanup");
    assert.equal(Uint8Array.prototype.every.call(providerBuffer, (byte) => byte === 0), true);
    let activeValue;
    assert.equal(manager.useActive(cred.id, (value) => { activeValue = value.toString("utf8"); }), true);
    assert.equal(activeValue, "load-secret-with-overridden-fill");
  });

  it("wipes a provider Buffer through the typed-array intrinsic during rotation", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-overridden-fill-rotation");
    await manager.load(cred, { async readSecret() { return Buffer.from("v1"); } });
    const providerBuffer = Buffer.from("rotation-secret-with-overridden-fill");
    let overriddenFillCalls = 0;
    providerBuffer.fill = () => {
      overriddenFillCalls += 1;
      throw new Error("provider cleanup leaked this error");
    };

    await manager.rotate(cred.id, { async readSecret() { return providerBuffer; } }, cred);

    assert.equal(overriddenFillCalls, 0, "provider-controlled instance methods must not perform cleanup");
    assert.equal(Uint8Array.prototype.every.call(providerBuffer, (byte) => byte === 0), true);
    let activeValue;
    assert.equal(manager.useActive(cred.id, (value) => { activeValue = value.toString("utf8"); }), true);
    assert.equal(activeValue, "rotation-secret-with-overridden-fill");
  });

  it("does not log provider errors or attacker-controlled credential identifiers", async () => {
    const manager = new SecretsRotationManager();
    const credentialId = "credential-id\nforged-log-entry";
    const cred = makeCred(credentialId);
    await manager.load(cred, {
      async readSecret() { return Buffer.from("active-secret"); },
    });

    const providerSecret = "provider-error-containing-secret-material";
    const messages = [];
    const originalError = console.error;
    console.error = (...values) => messages.push(values.join(" "));
    try {
      assert.equal(await manager.rotateOrFault(cred, {
        async readSecret() { throw new Error(providerSecret); },
      }, "halt"), false);
    } finally {
      console.error = originalError;
    }

    assert.deepEqual(messages, [
      "[galerina-ext-secrets-vault] rotation failed; policy=halt; credential evicted (fail-closed)",
    ]);
    assert.equal(messages.some((message) => message.includes(providerSecret)), false);
    assert.equal(messages.some((message) => message.includes(credentialId)), false);
    assert.equal(messages.some((message) => message.includes("forged-log-entry")), false);
  });

  it("does not expose provider exception text to direct load or rotate callers", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("provider-exception-redaction");
    const providerSecret = "provider-exception-secret-material";
    const provider = {
      async readSecret() { throw new Error(providerSecret); },
    };
    const safeProviderFailure = (error) =>
      error instanceof Error &&
      error.message === "SecretsRotationManager: vault provider read failed" &&
      error.cause === undefined &&
      !error.message.includes(providerSecret);

    await assert.rejects(manager.load(cred, provider), safeProviderFailure);
    await manager.load(cred, { async readSecret() { return Buffer.from("active-secret"); } });
    await assert.rejects(manager.rotate(cred.id, provider, cred), safeProviderFailure);
  });

  it("fails closed for an invalid runtime rotation policy instead of falling through to log", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("invalid-rotation-policy");
    await manager.load(cred, { async readSecret() { return Buffer.from("active-secret"); } });

    let providerCalls = 0;
    assert.equal(await manager.rotateOrFault(cred, {
      async readSecret() {
        providerCalls += 1;
        throw new Error("provider failure");
      },
    }, "unexpected-policy"), false);
    assert.equal(providerCalls, 0, "invalid policy is refused before provider access");
    assert.equal(manager.getHandle(cred.id), undefined, "invalid policy must not leave stale secret active");
  });

  it("does not let invalid-policy refusal evict a credential with an active rotation lease", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("invalid-policy-active-lease");
    await manager.load(cred, { async readSecret() { return Buffer.from("v1"); } });
    let markProviderStarted;
    const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });
    let releaseProvider;
    const providerResult = new Promise((resolve) => { releaseProvider = resolve; });
    const activeRotation = manager.rotate(cred.id, {
      readSecret() {
        markProviderStarted();
        return providerResult;
      },
    }, cred);
    await providerStarted;

    let duplicateProviderCalls = 0;
    assert.equal(await manager.rotateOrFault(cred, {
      async readSecret() {
        duplicateProviderCalls += 1;
        return Buffer.from("must-not-run");
      },
    }, "unexpected-policy"), false);
    assert.equal(duplicateProviderCalls, 0);
    assert.deepEqual(manager.getHandle(cred.id), { id: cred.id, version: 1, faulted: false });

    releaseProvider(Buffer.from("v2"));
    await activeRotation;
    assert.deepEqual(manager.getHandle(cred.id), { id: cred.id, version: 2, faulted: false });
  });

  it("does not let provider re-entry with an invalid policy corrupt its owning rotation", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("invalid-policy-reentrant-lease");
    await manager.load(cred, { async readSecret() { return Buffer.from("v1"); } });
    let nestedResult;
    let nestedProviderCalls = 0;
    const result = await manager.rotateOrFault(cred, {
      readSecret() {
        nestedResult = manager.rotateOrFault(cred, {
          async readSecret() {
            nestedProviderCalls += 1;
            return Buffer.from("must-not-run");
          },
        }, "unexpected-policy");
        return Promise.resolve(Buffer.from("v2"));
      },
    }, "halt");

    assert.equal(result, true);
    assert.equal(await nestedResult, false);
    assert.equal(nestedProviderCalls, 0);
    assert.deepEqual(manager.getHandle(cred.id), { id: cred.id, version: 2, faulted: false });
  });

  for (const policy of ["halt", "quarantine"]) {
    it(`completes ${policy} protection even when the logger throws`, async () => {
      const manager = new SecretsRotationManager();
      const cred = makeCred(`throwing-logger-${policy}`);
      await manager.load(cred, { async readSecret() { return Buffer.from("active-secret"); } });
      const originalError = console.error;
      console.error = () => { throw new Error("logger failure"); };
      try {
        assert.equal(await manager.rotateOrFault(cred, {
          async readSecret() { throw new Error("provider failure"); },
        }, policy), false);
      } finally {
        console.error = originalError;
      }
      assert.equal(manager.useActive(cred.id, () => {}), false, "protection is applied before optional logging");
    });
  }

  it("rejects accessor-backed credential descriptors without executing their getters", async () => {
    const manager = new SecretsRotationManager();
    let getterCalls = 0;
    const credential = {
      provider: "hashicorp_vault",
      path: "secret/data/accessor",
      get id() {
        getterCalls += 1;
        throw new Error("credential accessor secret");
      },
    };

    await assert.rejects(
      manager.load(credential, { async readSecret() { return Buffer.from("unused"); } }),
      (error) => error.message === "SecretsRotationManager: invalid credential descriptor" && error.cause === undefined,
    );
    assert.equal(getterCalls, 0);
  });

  it("turns an invalid credential descriptor into a non-throwing rotation refusal", async () => {
    const manager = new SecretsRotationManager();
    let getterCalls = 0;
    let providerCalls = 0;
    const credential = {
      provider: "hashicorp_vault",
      path: "secret/data/rotate-accessor",
      get id() {
        getterCalls += 1;
        throw new Error("credential accessor secret");
      },
    };

    assert.equal(await manager.rotateOrFault(credential, {
      async readSecret() {
        providerCalls += 1;
        return Buffer.from("unused");
      },
    }, "halt"), false);
    assert.equal(getterCalls, 0, "descriptor refusal must not invoke accessors");
    assert.equal(providerCalls, 0, "descriptor refusal must happen before provider access");
  });

  it("does not emit unhandled rejections when the background sweep sees an invalid descriptor", async () => {
    const manager = new SecretsRotationManager();
    const credential = {
      provider: "hashicorp_vault",
      path: "secret/data/sweep-accessor",
      get id() {
        throw new Error("credential accessor secret");
      },
    };
    const unhandled = [];
    const onUnhandled = (reason) => { unhandled.push(reason); };
    const originalError = console.error;
    let refusalLogs = 0;
    let providerCalls = 0;
    let resolveRefusal;
    let timeout;
    const refusalLogged = new Promise((resolve) => { resolveRefusal = resolve; });
    process.on("unhandledRejection", onUnhandled);
    console.error = (message) => {
      if (message === "[galerina-ext-secrets-vault] invalid credential descriptor; rotation refused") {
        refusalLogs += 1;
        resolveRefusal();
      }
    };
    const timer = manager.startRotationSweep([credential], {
      async readSecret() {
        providerCalls += 1;
        return Buffer.from("unused");
      },
    }, 1, "halt");
    try {
      await Promise.race([
        refusalLogged,
        new Promise((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("rotation sweep did not process the invalid descriptor")), 1000);
        }),
      ]);
      // Keep the listener installed through the next event-loop turn, when
      // Node reports any Promise rejection that escaped the detached sweep task.
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      manager.stopRotationSweep(timer);
      if (timeout !== undefined) clearTimeout(timeout);
      process.removeListener("unhandledRejection", onUnhandled);
      console.error = originalError;
    }
    assert.ok(refusalLogs > 0, "the sweep must demonstrably process and refuse the descriptor");
    assert.equal(providerCalls, 0, "an invalid descriptor must be refused before provider access");
    assert.deepEqual(unhandled, []);
  });

  it("keeps the acquired credential key when provider code mutates the shared credential ID", async () => {
    const manager = new SecretsRotationManager();
    const credA = makeCred("mutable-id-a");
    const credB = makeCred("mutable-id-b");
    await manager.load(credA, new MockVaultClient(new Map([
      [`secret/${credA.path}`, "a1"],
      [`secret/${credB.path}`, "b1"],
    ])));
    await manager.load(credB, new MockVaultClient(new Map([
      [`secret/${credA.path}`, "a1"],
      [`secret/${credB.path}`, "b1"],
    ])));

    const mutatingProvider = {
      readSecret() {
        credA.id = credB.id;
        return Promise.resolve(Buffer.from('{"value":"a2"}'));
      },
    };
    assert.equal(await manager.rotateOrFault(credA, mutatingProvider, "halt"), true);
    assert.deepEqual(manager.getHandle(credB.id), {
      id: credB.id,
      version: 1,
      faulted: false,
    }, "provider re-entry must not retarget the acquired operation");

    credA.id = "mutable-id-a";
    await assert.doesNotReject(
      manager.rotate(credA.id, { async readSecret() { return Buffer.from('{"value":"a3"}'); } }, credA),
      "the original credential lease must be released after success",
    );
  });

  it("applies provider failure policy to the captured ID, not a mutated credential object", async () => {
    const manager = new SecretsRotationManager();
    const credA = makeCred("mutable-failure-a");
    const credB = makeCred("mutable-failure-b");
    const client = new MockVaultClient(new Map([
      [`secret/${credA.path}`, "a1"],
      [`secret/${credB.path}`, "b1"],
    ]));
    await manager.load(credA, client);
    await manager.load(credB, client);

    const mutatingFailureProvider = {
      readSecret() {
        credA.id = credB.id;
        throw new Error("provider failed after changing shared credential metadata");
      },
    };
    assert.equal(await manager.rotateOrFault(credA, mutatingFailureProvider, "halt"), false);
    assert.equal(manager.getHandle("mutable-failure-a"), undefined, "halt applies to the acquired credential A");
    assert.deepEqual(manager.getHandle("mutable-failure-b"), {
      id: "mutable-failure-b",
      version: 1,
      faulted: false,
    }, "credential B remains unchanged");
    assert.equal(activeCopyForTest(manager, "mutable-failure-b")?.toString("utf8"), '{"value":"b1"}');
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

  it("refuses and wipes a provider result that arrives after disposal", async () => {
    const providerBuffer = Buffer.from("late-secret");
    const ownedBuffers = [];
    const originalAlloc = Buffer.alloc;
    let InstrumentedManager;
    try {
      Buffer.alloc = function observedAlloc(size, ...args) {
        const result = Reflect.apply(originalAlloc, this, [size, ...args]);
        if (size === providerBuffer.length) ownedBuffers.push(result);
        return result;
      };
      ({ SecretsRotationManager: InstrumentedManager } = await import("../dist/rotation-manager.js?dispose-owned-buffer-observation"));
    } finally {
      Buffer.alloc = originalAlloc;
    }

    const manager = new InstrumentedManager();
    const cred = makeCred("load-after-dispose");
    let markProviderStarted;
    const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });
    let releaseProvider;
    const providerResult = new Promise((resolve) => { releaseProvider = resolve; });
    const loading = manager.load(cred, {
      readSecret() {
        markProviderStarted();
        return providerResult;
      },
    });

    await providerStarted;
    assert.throws(
      () => manager.dispose(),
      /cleanup incomplete/,
      "disposal must report that the in-flight provider result has not been cleaned yet",
    );
    releaseProvider(providerBuffer);

    await assert.rejects(
      loading,
      (error) => error instanceof Error && error.message === "SecretsRotationManager: load invalidated by disposal",
    );
    assert.deepEqual(manager.listIds(), [], "a late provider result must not repopulate a disposed manager");
    assert.equal(Uint8Array.prototype.every.call(providerBuffer, (byte) => byte === 0), true,
      "the provider-owned result must be wiped even though the load is refused");
    assert.equal(ownedBuffers.length, 1, "the provider result must have produced one distinct manager-owned allocation");
    assert.notEqual(ownedBuffers[0], providerBuffer, "the manager-owned copy must not alias the provider buffer");
    assert.equal(Uint8Array.prototype.every.call(ownedBuffers[0], (byte) => byte === 0), true,
      "the manager-owned copy must also be wiped when disposal invalidates the load");
    assert.doesNotThrow(() => manager.dispose(), "disposal completes after the late provider result is cleaned");
  });

  it("reports cleanup incomplete while disposal races a pending provider read", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("dispose-pending-provider-read");
    let markProviderStarted;
    const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });
    let releaseProvider;
    const providerResult = new Promise((resolve) => { releaseProvider = resolve; });
    const loading = manager.load(cred, {
      readSecret() {
        markProviderStarted();
        return providerResult;
      },
    });

    await providerStarted;
    assert.throws(
      () => manager.dispose(),
      /cleanup incomplete/,
      "synchronous disposal must not report cleanup complete while provider output is unresolved",
    );

    const providerBuffer = Buffer.from("late-valid-secret");
    releaseProvider(providerBuffer);
    await assert.rejects(loading, /load invalidated by disposal/);
    assert.equal(Uint8Array.prototype.every.call(providerBuffer, (byte) => byte === 0), true,
      "the late provider buffer is wiped before disposal can complete");
    assert.doesNotThrow(() => manager.dispose(), "a later disposal attempt can confirm cleanup completion");
  });

  it("keeps disposal incomplete when a pending provider read resolves to an opaque proxy", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("dispose-pending-opaque-provider-read");
    let markProviderStarted;
    const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });
    let releaseProvider;
    const providerResult = new Promise((resolve) => { releaseProvider = resolve; });
    const loading = manager.load(cred, {
      readSecret() {
        markProviderStarted();
        return providerResult;
      },
    });

    await providerStarted;
    assert.throws(() => manager.dispose(), /cleanup incomplete/);

    const providerView = Uint8Array.from(Buffer.from("late-opaque-secret"));
    releaseProvider(new Proxy(providerView, {}));
    await assert.rejects(loading, /provider must return a Buffer/);
    assert.deepEqual([...providerView], [...Buffer.from("late-opaque-secret")],
      "the provider-owned proxy target is not falsely reported as wiped");
    assert.equal(manager.useActive(cred.id, () => assert.fail("disposed manager cannot serve secrets")), false);
    assert.throws(
      () => manager.dispose(),
      /cleanup incomplete/,
      "the unresolved opaque cleanup obligation remains visible after the read settles",
    );
  });

  it("reports cleanup incomplete until an in-flight rotation wipes its unpublished candidate", async () => {
    const { Manager, control } = await importManagerWithWipeFailureControl();
    const manager = new Manager();
    const cred = makeCred("dispose-during-rotation-finalization");
    await manager.load(cred, { async readSecret() { return Buffer.from("old-active"); } });

    const originalSetTimeout = globalThis.setTimeout;
    let releaseQuiescence;
    let markQuiescenceStarted;
    const quiescenceStarted = new Promise((resolve) => { markQuiescenceStarted = resolve; });
    globalThis.setTimeout = (callback, delay, ...args) => {
      if (delay === 50) {
        releaseQuiescence = () => callback(...args);
        markQuiescenceStarted();
        return undefined;
      }
      return originalSetTimeout(callback, delay, ...args);
    };

    let rotationOutcome;
    try {
      const rotation = manager.rotate(cred.id, {
        async readSecret() { return Buffer.from("unpublished-candidate"); },
      }, cred);
      rotationOutcome = rotation.then(
        () => ({ kind: "fulfilled" }),
        (error) => ({ kind: "rejected", error }),
      );
      const orderingPoint = await Promise.race([
        quiescenceStarted.then(() => ({ kind: "quiescence" })),
        rotationOutcome.then((outcome) => ({ kind: "rotation-settled", outcome })),
        new Promise((resolve) => originalSetTimeout(() => resolve({ kind: "watchdog" }), 1_000)),
      ]);
      assert.equal(orderingPoint.kind, "quiescence", "rotation must reach its finalization window");

      const unpublishedCandidate = control.allocations.at(-1);
      assert.ok(unpublishedCandidate, "provider transfer must create a manager-owned candidate");
      assert.equal(Uint8Array.prototype.some.call(unpublishedCandidate, (byte) => byte !== 0), true,
        "candidate bytes remain live while rotation is waiting to commit");
      assert.throws(
        () => manager.dispose(),
        /cleanup incomplete/,
        "dispose must not report completion while the rotation still owns a live candidate",
      );

      releaseQuiescence();
      releaseQuiescence = undefined;
      const completion = await rotationOutcome;
      assert.equal(completion.kind, "rejected");
      assert.match(completion.error.message, /credential changed during rotation/);
      assert.equal(Uint8Array.prototype.every.call(unpublishedCandidate, (byte) => byte === 0), true,
        "the invalidated rotation wipes its unpublished candidate before settling");
      assert.doesNotThrow(() => manager.dispose(), "a retry confirms cleanup after rotation settlement");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      releaseQuiescence?.();
      if (rotationOutcome !== undefined) await rotationOutcome;
      manager.dispose();
    }
  });

  it("surfaces rotation-finalization cleanup through the public vault stop method", async () => {
    const cred = makeCred("facade-stop-during-rotation-finalization");
    let readCount = 0;
    const vault = GalerinaSecretsVault.fromClient({
      async readSecret() {
        readCount += 1;
        return Buffer.from(readCount === 1 ? "old-active" : "new-candidate");
      },
    });
    await vault.loadContract({ credentials: [cred] });

    const originalSetTimeout = globalThis.setTimeout;
    let releaseQuiescence;
    let markQuiescenceStarted;
    const quiescenceStarted = new Promise((resolve) => { markQuiescenceStarted = resolve; });
    globalThis.setTimeout = (callback, delay, ...args) => {
      if (delay === 50) {
        releaseQuiescence = () => callback(...args);
        markQuiescenceStarted();
        return undefined;
      }
      return originalSetTimeout(callback, delay, ...args);
    };

    let rotationOutcome;
    try {
      rotationOutcome = vault.rotateCredential(cred).then(
        () => ({ kind: "fulfilled" }),
        (error) => ({ kind: "rejected", error }),
      );
      const orderingPoint = await Promise.race([
        quiescenceStarted.then(() => ({ kind: "quiescence" })),
        rotationOutcome.then((outcome) => ({ kind: "rotation-settled", outcome })),
        new Promise((resolve) => originalSetTimeout(() => resolve({ kind: "watchdog" }), 1_000)),
      ]);
      assert.equal(orderingPoint.kind, "quiescence", "facade rotation must enter finalization");
      assert.throws(() => vault.stop(), /cleanup incomplete/,
        "the public stop method must surface an unfinished rotation cleanup");
      assert.equal(vault.useSecret(cred.id, () => assert.fail("stopped vault must not serve secrets")), false);

      releaseQuiescence();
      releaseQuiescence = undefined;
      const completion = await rotationOutcome;
      assert.equal(completion.kind, "rejected");
      assert.match(completion.error.message, /manual credential rotation failed/);
      assert.doesNotThrow(() => vault.stop(), "a repeated stop confirms cleanup after rotation settlement");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      releaseQuiescence?.();
      if (rotationOutcome !== undefined) await rotationOutcome;
      vault.stop();
    }
  });

  it("captures disposal before inspecting a re-entrant credential descriptor", async () => {
    const manager = new SecretsRotationManager();
    let providerCalls = 0;
    const credential = new Proxy(makeCred("descriptor-disposes"), {
      getOwnPropertyDescriptor(target, property) {
        if (property === "id") manager.dispose();
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });

    await assert.rejects(
      manager.load(credential, {
        async readSecret() {
          providerCalls += 1;
          return Buffer.from("must-not-be-requested");
        },
      }),
      (error) => error instanceof Error && error.message === "SecretsRotationManager: load invalidated by disposal",
    );
    assert.equal(providerCalls, 0, "descriptor-triggered disposal must be detected before provider access");
    assert.deepEqual(manager.listIds(), []);
  });

  it("refuses new loads after terminal disposal before provider access", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("load-after-terminal-dispose");
    manager.dispose();
    let providerCalls = 0;

    await assert.rejects(
      manager.load(cred, {
        async readSecret() {
          providerCalls += 1;
          return Buffer.from("must-not-be-requested");
        },
      }),
      (error) => error instanceof Error && error.message === "SecretsRotationManager: manager is disposed",
    );
    assert.equal(providerCalls, 0, "terminal disposal must refuse before provider access");
    assert.deepEqual(manager.listIds(), []);
  });

  it("refuses a second same-credential load while the first provider read is pending", async () => {
    const manager = new SecretsRotationManager();
    const cred = makeCred("overlapping-load");
    let markFirstStarted;
    const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
    let releaseFirst;
    const firstResult = new Promise((resolve) => { releaseFirst = resolve; });
    const firstLoad = manager.load(cred, {
      readSecret() {
        markFirstStarted();
        return firstResult;
      },
    });
    await firstStarted;

    let duplicateProviderCalls = 0;
    await assert.rejects(
      manager.load(cred, {
        async readSecret() {
          duplicateProviderCalls += 1;
          return Buffer.from("must-not-be-requested");
        },
      }),
      (error) => error instanceof Error && error.message === "SecretsRotationManager: load already active",
    );
    assert.equal(duplicateProviderCalls, 0, "overlapping load refusal must precede provider access");

    releaseFirst(Buffer.from("first-load"));
    await firstLoad;
    assert.equal(activeCopyForTest(manager, cred.id)?.toString("utf8"), "first-load");
  });

  it("does not expose the mutable manager or token-bearing client through the facade", () => {
    const vault = GalerinaSecretsVault.fromConfig("https://vault.test", "test-token");
    assert.equal("manager" in vault, false);
    assert.equal("vaultClient" in vault, false);
    assert.equal("rotationManager" in vault, false);
    assert.equal("vaultClientInstance" in vault, false);
  });

  it("TypeScript bootstrap: a transferred callback copy survives the wiped scoped view", async () => {
    const vault = GalerinaSecretsVault.fromClient(new MockVaultClient(new Map([
      ["secret/secret/data/scoped", "scoped-value"],
    ])));
    await vault.loadContract({ credentials: [makeCred("scoped", "secret/data/scoped")] });

    let escaped;
    let escapedCopy;
    try {
      const result = vault.useSecret("scoped", (value) => {
        escaped = value;
        escapedCopy = Buffer.from(value);
      });
      assert.equal(result, true);
      assert.ok(escaped.every((byte) => byte === 0), "the scoped view is wiped before return");
      assert.equal(escapedCopy.toString("utf8"), '{"value":"scoped-value"}',
        "a callback-created copy survives the manager's wipe of the scoped view");
    } finally {
      escapedCopy?.fill(0);
    }
    assert.equal(vault.useSecret("absent", () => assert.fail("absent callback must not run")), false);
    assert.equal("getSecret" in vault, false);
    assert.equal("getActive" in new SecretsRotationManager(), false);

    assert.throws(
      () => vault.useSecret("scoped", async () => "not-allowed"),
      /must be synchronous/i,
    );
  });
});
