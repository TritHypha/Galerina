import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { receiveMessageOnPort } from "node:worker_threads";
import {
  createSecretArenaProvider,
  ERR_SECRET_ARENA_QUARANTINED,
  ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM,
  SecretArenaQuarantined,
  SecretArenaUnavailable,
} from "../dist/secret-arena-provider.js";
import { createSecretGate } from "../dist/secret-gate.js";

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
  const barrelSrc = readFileSync(new URL("../dist/index.js", import.meta.url), "utf8");
  const providerSrc = readFileSync(new URL("../src/secret-arena-provider.ts", import.meta.url), "utf8");
  assert.equal(providerSrc.includes("ForTests"), false);
  assert.equal(barrelSrc.includes("killSecretArenaChildForTests"), false);
  assert.equal(barrelSrc.includes("debugForceCleanupFailure"), false);
  assert.match(barrelSrc, /createSecretArenaProvider/);
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

  const previousCustodian = process.env.GALERINA_SECRET_ARENA_CUSTODIAN;
  process.env.GALERINA_SECRET_ARENA_CUSTODIAN = join(crateDir, "target", "debug", "no-such-custodian");
  t.after(() => {
    if (previousCustodian === undefined) delete process.env.GALERINA_SECRET_ARENA_CUSTODIAN;
    else process.env.GALERINA_SECRET_ARENA_CUSTODIAN = previousCustodian;
  });
  const pinned = createSecretArenaProvider();
  t.after(() => {
    try {
      pinned.dispose();
    } catch {
      // already dead
    }
  });
  assert.equal(pinned.status().state, "active");
  pinned.dispose();

  const provider = createSecretArenaProvider({ binPath });
  t.after(() => {
    try {
      provider.dispose();
    } catch {
      // already dead
    }
  });
  assert.equal(typeof provider.debugForceCleanupFailure, "undefined");

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
  assert.throws(() => {
    provider.use("cred", (view) => {
      transferredView = view;
      if (view.buffer instanceof ArrayBuffer && typeof view.buffer.transfer === "function") {
        const transferred = view.buffer.transfer();
        throw new Error(`transfer-was-allowed:${[...new Uint8Array(transferred)].join(",")}`);
      }
      throw new Error("transfer-unavailable");
    });
  }, (error) => error instanceof Error && !/transfer-was-allowed/u.test(error.message));
  assert.ok(transferredView);
  assertZero(transferredView);
  assert.equal(provider.status().state, "active");
  assert.equal(provider.has("cred"), true);

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

  assert.equal(provider.status().state, "active");
  assert.equal(provider.has("cred"), true);
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

function chmodFake(path) {
  chmodSync(path, 0o755);
  return path;
}

test("linux child-death quarantines without a production test hook", async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-exit-after-hello.mjs"));
  const provider = createSecretArenaProvider({ binPath: fake });
  t.after(() => {
    try {
      provider.dispose();
    } catch {
      // already dead
    }
  });
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
    () => provider.put("cred", new Uint8Array([1])),
    (error) => error instanceof SecretArenaQuarantined,
  );
});

test("linux short custodian read wipes and refuses construction", async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-short-read.mjs"));
  assert.throws(
    () => createSecretArenaProvider({ binPath: fake }),
    (error) => error instanceof SecretArenaUnavailable,
  );
});

test("linux captured transfer paths cannot copy live secret bytes", async (t) => {
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
  const capturedTransfer = ArrayBuffer.prototype.transfer;
  const capturedToFixed = ArrayBuffer.prototype.transferToFixedLength;

  const assertNoLiveCopy = (run) => {
    let view;
    let leaked;
    assert.throws(() => {
      provider.use("cred", (value) => {
        view = value;
        leaked = run(value);
        if (leaked !== undefined) {
          throw new Error(`transfer-was-allowed:${[...new Uint8Array(leaked)].join(",")}`);
        }
        throw new Error("transfer-unavailable");
      });
    }, (error) => error instanceof Error && !/transfer-was-allowed/u.test(error.message));
    assert.ok(view);
    assertZero(view);
    if (leaked !== undefined) {
      try {
        assertZero(new Uint8Array(leaked));
      } catch {
        assert.equal(leaked, undefined);
      }
    }
  };

  if (typeof capturedTransfer === "function") {
    assertNoLiveCopy((value) => capturedTransfer.call(value.buffer));
  }
  if (typeof capturedToFixed === "function") {
    assertNoLiveCopy((value) => capturedToFixed.call(value.buffer));
  }
  assertNoLiveCopy((value) => structuredClone(value.buffer, { transfer: [value.buffer] }));
  assertNoLiveCopy((value) => {
    const { port1, port2 } = new MessageChannel();
    port1.postMessage(value.buffer, [value.buffer]);
    const received = receiveMessageOnPort(port2);
    port1.close();
    port2.close();
    return received?.message;
  });

  let sliced;
  provider.use("cred", (value) => {
    sliced = value.slice();
  });
  assert.deepEqual([...sliced], [7, 8, 9, 10]);
  assert.equal(provider.status().state, "active");
});
