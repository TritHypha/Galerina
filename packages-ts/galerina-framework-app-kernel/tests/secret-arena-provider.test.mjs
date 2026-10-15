import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createSecretArenaProvider,
  createSecretGate,
  ERR_SECRET_ARENA_QUARANTINED,
  ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM,
  SecretArenaQuarantined,
  SecretArenaUnavailable,
} from "../dist/index.js";

const crateDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "galerina-core-runtime",
  "native",
  "vok-authority",
);
const binPath = join(crateDir, "target", "debug", "galerina-secret-arena-custodian");

function ensureBin() {
  if (process.platform !== "linux") return false;
  if (existsSync(binPath)) return true;
  const built = spawnSync("cargo", ["build", "--locked", "--bin", "galerina-secret-arena-custodian"], {
    cwd: crateDir,
    encoding: "utf8",
  });
  if (built.status !== 0) {
    throw new Error(`custodian build failed: ${built.stderr}`);
  }
  return existsSync(binPath);
}

function assertZero(bytes) {
  for (let i = 0; i < bytes.length; i += 1) {
    assert.equal(bytes[i], 0);
  }
}

test("construction refuses on non-Linux or when the native custodian is unavailable", () => {
  if (process.platform !== "linux") {
    assert.throws(
      () => createSecretArenaProvider(),
      (error) =>
        error instanceof SecretArenaUnavailable &&
        error.code === ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM,
    );
    return;
  }
  assert.throws(
    () => createSecretArenaProvider({ binPath: join(crateDir, "target", "debug", "no-such-custodian") }),
    (error) =>
      error instanceof SecretArenaUnavailable &&
      error.code === ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM,
  );
});

test("linux SecretArena provider wipes every exit path, quarantines, and serves the secret gate", async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  assert.equal(ensureBin(), true);
  const provider = createSecretArenaProvider({ binPath });
  t.after(() => {
    try {
      provider.dispose();
    } catch {
      // already dead
    }
  });

  const secret = new Uint8Array([7, 8, 9, 10]);
  provider.put("cred", secret);
  assert.equal(provider.has("cred"), true);
  assert.equal(provider.status().state, "active");
  assert.equal(provider.revocationEpoch(), 0);

  let returnedView;
  provider.use("cred", (view) => {
    returnedView = view;
    assert.deepEqual([...view], [7, 8, 9, 10]);
  });
  assert.ok(returnedView);
  assertZero(returnedView);

  let thrownView;
  assert.throws(() => {
    provider.use("cred", (view) => {
      thrownView = view;
      throw new Error("consumer-throw");
    });
  }, /consumer-throw/);
  assert.ok(thrownView);
  assertZero(thrownView);

  let transferredView;
  const transferError = new Error("transfer-then-throw");
  assert.throws(() => {
    provider.use("cred", (view) => {
      transferredView = view;
      if (view.buffer instanceof ArrayBuffer) {
        view.buffer.transfer();
      }
      throw transferError;
    });
  }, (error) => error === transferError);

  const ac = new AbortController();
  ac.abort();
  assert.throws(
    () => provider.use("cred", () => {}, { signal: ac.signal }),
    (error) => error instanceof SecretArenaUnavailable,
  );

  const timed = AbortSignal.timeout(1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.throws(
    () => provider.use("cred", () => {}, { signal: timed }),
    (error) => error instanceof SecretArenaUnavailable,
  );

  const gate = createSecretGate(provider);
  assert.equal(gate.admit(["cred"]), null);
  let gatedView;
  gate.getSecret(["cred"], "cred", (value) => {
    gatedView = value;
    assert.deepEqual([...value], [7, 8, 9, 10]);
  });
  assert.ok(gatedView);
  assertZero(gatedView);

  provider.debugForceCleanupFailure();
  assert.equal(provider.status().state, "quarantined");
  assert.deepEqual(Object.keys(provider.status()), ["state"]);
  assert.throws(
    () => provider.has("cred"),
    (error) => error instanceof SecretArenaQuarantined && error.code === ERR_SECRET_ARENA_QUARANTINED,
  );
  assert.throws(
    () => provider.use("cred", () => {}),
    (error) => error instanceof SecretArenaQuarantined,
  );
  assert.throws(
    () => provider.put("cred", secret),
    (error) => error instanceof SecretArenaQuarantined,
  );
});

test("linux provider failure and timeout wipe adapter-owned bytes", async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  assert.equal(ensureBin(), true);
  const provider = createSecretArenaProvider({ binPath });
  t.after(() => {
    try {
      provider.dispose();
    } catch {
      // already dead
    }
  });
  provider.put("cred", new Uint8Array([1, 2, 3]));
  let view;
  try {
    provider.use("cred", (value) => {
      view = value;
      provider.dispose();
      throw new Error("provider-failure");
    });
  } catch (error) {
    assert.match(String(error), /provider-failure|unavailable|quarantined/i);
  }
  if (view !== undefined) assertZero(view);
});
