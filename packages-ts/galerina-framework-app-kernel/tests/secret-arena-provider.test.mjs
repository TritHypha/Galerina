import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
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

function linuxPidIsRunning(pid) {
  const statusPath = `/proc/${pid}/status`;
  if (!existsSync(statusPath)) return false;
  const status = readFileSync(statusPath, "utf8");
  const match = /State:\s+([A-Z])/u.exec(status);
  if (match === null) return false;
  return match[1] !== "Z";
}

function killFakePid(pid) {
  if (typeof pid !== "number" || Number.isInteger(pid) !== true || pid <= 0) {
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // already dead
  }
}

function waitUntilNotRunning(pid, budgetMs) {
  const start = Date.now();
  while (linuxPidIsRunning(pid) && Date.now() - start < budgetMs) {
    // Busy-wait so this check does not pump the event loop.
  }
  return linuxPidIsRunning(pid);
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
  const epoch = provider.revocationEpoch();
  assert.equal(typeof epoch, "number");
  assert.equal(Number.isSafeInteger(epoch) && epoch >= 0, true);
  assert.equal(epoch > 0, true, "EPOCH after quarantine is strictly greater than the start epoch 0");
  assert.equal(provider.status().state, "quarantined");
});

test("linux decreasing custodian epoch quarantines and refuses stale authority", async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-decreasing-epoch.mjs"));
  const provider = createSecretArenaProvider({ binPath: fake });
  t.after(() => {
    try {
      provider.dispose();
    } catch {
      // already dead
    }
  });
  const first = provider.revocationEpoch();
  assert.equal(first, 5);
  assert.throws(
    () => provider.revocationEpoch(),
    (error) =>
      error instanceof SecretArenaUnavailable &&
      error.code === ERR_SECRET_ARENA_UNSUPPORTED_PLATFORM &&
      /stale/u.test(error.message),
  );
  assert.equal(provider.status().state, "quarantined");
  const after = provider.revocationEpoch();
  assert.equal(typeof after, "number");
  assert.equal(after > first, true, "EPOCH after quarantine is strictly greater than every epoch served before");
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

test("linux captured Memory ignores a post-load constructor replacement", async (t) => {
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
  const secret = new Uint8Array([7, 8, 9, 10, 11, 12, 13]);
  provider.put("cred", secret);
  const OrigMemory = WebAssembly.Memory;
  let constructed = 0;
  t.after(() => {
    WebAssembly.Memory = OrigMemory;
  });
  WebAssembly.Memory = function forcedMemory() {
    constructed += 1;
    throw new RangeError("forced-memory");
  };
  WebAssembly.Memory.prototype = OrigMemory.prototype;
  let delivered;
  provider.use("cred", (view) => {
    delivered = Uint8Array.from(view);
  });
  assert.deepEqual([...delivered], [...secret]);
  assert.equal(constructed, 0);
  assert.equal(provider.status().state, "active");
});

test("linux GET timeout kills the custodian and drops late secret bytes", { timeout: 20000 }, async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const markPath = join(tmpdir(), "galerina-secret-arena-delayed.mark");
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-delayed-get.mjs"));
  const provider = createSecretArenaProvider({ binPath: fake });
  t.after(() => {
    try {
      provider.dispose();
    } catch {
      // already dead
    }
  });
  assert.throws(
    () => provider.use("cred", () => {}),
    (error) => error instanceof SecretArenaUnavailable,
  );
  assert.equal(provider.status().state, "quarantined");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const mark = existsSync(markPath) ? readFileSync(markPath, "utf8") : "";
  assert.match(mark, /pid:\d+/);
  const pidLine = mark.split("\n").find((line) => line.startsWith("pid:"));
  const pid = Number(pidLine?.slice(4));
  assert.equal(Number.isInteger(pid) && pid > 0, true);
  const stillAlive = spawnSync("kill", ["-0", String(pid)], { encoding: "utf8" });
  assert.notEqual(stillAlive.status, 0);
  assert.match(mark, /killed:|late-write:fail/);
  assert.equal(mark.includes("late-write:ok"), false);
});

test("linux SIGTERM-ignoring custodian is SIGKILL'd within grace plus margin", { timeout: 20000 }, async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "galerina-arena-sigterm-"));
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const markPath = join(dir, "mark");
  const previousMark = process.env.GALERINA_SECRET_ARENA_MARK;
  process.env.GALERINA_SECRET_ARENA_MARK = markPath;
  t.after(() => {
    if (previousMark === undefined) delete process.env.GALERINA_SECRET_ARENA_MARK;
    else process.env.GALERINA_SECRET_ARENA_MARK = previousMark;
  });
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-ignore-sigterm.py"));
  const provider = createSecretArenaProvider({ binPath: fake });
  const fakePid = { pid: 0 };
  t.after(() => {
    killFakePid(fakePid.pid);
  });
  t.after(() => {
    try {
      provider.dispose();
    } catch {
      // already dead
    }
  });
  const started = Date.now();
  assert.throws(
    () => provider.use("cred", () => {}),
    (error) => error instanceof SecretArenaUnavailable,
  );
  const elapsed = Date.now() - started;
  const mark = existsSync(markPath) ? readFileSync(markPath, "utf8") : "";
  assert.match(mark, /pid:\d+/);
  const pidLine = mark.split("\n").find((line) => line.startsWith("pid:"));
  const pid = Number(pidLine?.slice(4));
  fakePid.pid = pid;
  assert.equal(Number.isInteger(pid) && pid > 0, true);
  assert.equal(waitUntilNotRunning(pid, 50), false, "custodian must be SIGKILLed before the next event-loop turn (zombie counts as dead)");
  assert.match(mark, /sigterm:/);
  const rpcDeadlineMs = 5000;
  const graceMs = 100;
  const marginMs = 1500;
  assert.equal(
    elapsed <= rpcDeadlineMs + graceMs + marginMs,
    true,
    `kill must complete inside RPC deadline ${rpcDeadlineMs} + grace ${graceMs} + margin ${marginMs}; elapsed=${elapsed}`,
  );
});

test("linux dispose then process.exit SIGKILLs a SIGTERM-ignoring fake", { timeout: 20000 }, async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "galerina-arena-exit-"));
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const markPath = join(dir, "mark");
  const scriptPath = join(dir, "exit-after-dispose.mjs");
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-ignore-sigterm.py"));
  const fakePid = { pid: 0 };
  t.after(() => {
    killFakePid(fakePid.pid);
  });
  const providerUrl = new URL("../dist/secret-arena-provider.js", import.meta.url).href;
  writeFileSync(scriptPath, [
    `import { createSecretArenaProvider } from ${JSON.stringify(providerUrl)};`,
    `const provider = createSecretArenaProvider({ binPath: ${JSON.stringify(fake)} });`,
    "try { provider.dispose(); } catch {}",
    "process.exit(0);",
    "",
  ].join("\n"));
  const started = Date.now();
  const run = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, GALERINA_SECRET_ARENA_MARK: markPath },
    encoding: "utf8",
    timeout: 15000,
  });
  const elapsed = Date.now() - started;
  assert.equal(run.status, 0, run.stderr);
  const mark = existsSync(markPath) ? readFileSync(markPath, "utf8") : "";
  assert.match(mark, /pid:\d+/);
  const pidLine = mark.split("\n").find((line) => line.startsWith("pid:"));
  const pid = Number(pidLine?.slice(4));
  fakePid.pid = pid;
  assert.equal(Number.isInteger(pid) && pid > 0, true);
  const stillAlive = spawnSync("kill", ["-0", String(pid)], { encoding: "utf8" });
  assert.notEqual(stillAlive.status, 0, "fake must be dead after dispose then process.exit");
  const rpcDeadlineMs = 5000;
  const graceMs = 100;
  const marginMs = 1500;
  assert.equal(
    elapsed <= rpcDeadlineMs + graceMs + marginMs,
    true,
    `exit-path kill must complete inside RPC deadline ${rpcDeadlineMs} + grace ${graceMs} + margin ${marginMs}; elapsed=${elapsed}`,
  );
});

test("linux captured set hides secret bytes from a post-load prototype tamper", async (t) => {
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
  const secret = new Uint8Array([7, 8, 9, 10, 11, 12, 13]);
  provider.put("cred", secret);
  const origSet = Uint8Array.prototype.set;
  /** @type {number[][]} */
  const seen = [];
  t.after(() => {
    Uint8Array.prototype.set = origSet;
  });
  Uint8Array.prototype.set = function forcedSet(source, ...rest) {
    if (source instanceof Uint8Array) {
      seen.push([...source]);
    }
    return origSet.apply(this, [source, ...rest]);
  };
  let delivered;
  provider.use("cred", (view) => {
    delivered = Uint8Array.from(view);
  });
  assert.deepEqual([...delivered], [...secret]);
  for (const bytes of seen) {
    assert.deepEqual(bytes.includes(7) && bytes.length === secret.length && bytes.every((value, i) => value === secret[i]), false);
  }
  assert.equal(provider.status().state, "active");
});

function arenaMutantDist() {
  const dir = mkdtempSync(join(tmpdir(), "galerina-q24-arena-"));
  const distSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  cpSync(distSrc, join(dir, "dist"), { recursive: true });
  return dir;
}

test("mutant: live-prototype set sees secret bytes", async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  assert.equal(ensureBin(), true);
  const dir = arenaMutantDist();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const providerPath = join(dir, "dist", "secret-arena-provider.js");
  const original = readFileSync(providerPath, "utf8");
  const needle = "intrinsicApply(intrinsicTypedArraySet, backing, [data]);";
  assert.equal(original.includes(needle), true);
  writeFileSync(providerPath, original.replace(needle, "backing.set(data);"));
  const probePath = join(dir, "probe-set.mjs");
  const href = pathToFileURL(providerPath).href;
  writeFileSync(probePath, [
    "import assert from 'node:assert/strict';",
    `import { createSecretArenaProvider } from ${JSON.stringify(href)};`,
    `const binPath = ${JSON.stringify(binPath)};`,
    "const provider = createSecretArenaProvider({ binPath });",
    "try {",
    "  const secret = new Uint8Array([7, 8, 9, 10, 11, 12, 13]);",
    "  provider.put('cred', secret);",
    "  const origSet = Uint8Array.prototype.set;",
    "  const seen = [];",
    "  Uint8Array.prototype.set = function forcedSet(source, ...rest) {",
    "    if (source instanceof Uint8Array) seen.push([...source]);",
    "    return origSet.apply(this, [source, ...rest]);",
    "  };",
    "  try {",
    "    provider.use('cred', () => {});",
    "  } finally {",
    "    Uint8Array.prototype.set = origSet;",
    "  }",
    "  const leaked = seen.some((bytes) => bytes.length === secret.length && bytes.every((value, i) => value === secret[i]));",
    "  assert.equal(leaked, false);",
    "} finally {",
    "  try { provider.dispose(); } catch {}",
    "}",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probePath], { encoding: "utf8" });
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

test("mutant: timer-only escalation leaves the fake alive before the next turn", { timeout: 20000 }, async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const dir = arenaMutantDist();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const providerPath = join(dir, "dist", "secret-arena-provider.js");
  const original = readFileSync(providerPath, "utf8");
  const needle = `    const deadline = intrinsicNow() + SIGTERM_GRACE_MS;
    while (custodianAlive(child) && intrinsicNow() < deadline) {
        // Busy-wait so SIGKILL does not depend on a later event-loop turn.
    }
    if (!custodianAlive(child)) {
        liveCustodians.delete(child);
        return;
    }
    try {
        child.kill("SIGKILL");
    }`;
  const swapped = `    const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
    }, SIGTERM_GRACE_MS);
    child.once("exit", () => { clearTimeout(timer); });
    if (!custodianAlive(child)) {
        liveCustodians.delete(child);
        return;
    }
    try {
        child.kill("SIGTERM");
    }`;
  assert.equal(original.includes(needle), true);
  writeFileSync(providerPath, original.replace(needle, swapped));
  const markDir = mkdtempSync(join(tmpdir(), "galerina-q24-timer-"));
  t.after(() => {
    try {
      rmSync(markDir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const markPath = join(markDir, "mark");
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-ignore-sigterm.py"));
  const fakePid = { pid: 0 };
  t.after(() => {
    killFakePid(fakePid.pid);
  });
  const probePath = join(dir, "probe-timer.mjs");
  const href = pathToFileURL(providerPath).href;
  writeFileSync(probePath, [
    "import assert from 'node:assert/strict';",
    "import { spawnSync } from 'node:child_process';",
    "import { existsSync, readFileSync } from 'node:fs';",
    `import { createSecretArenaProvider } from ${JSON.stringify(href)};`,
    `const fake = ${JSON.stringify(fake)};`,
    `const markPath = ${JSON.stringify(markPath)};`,
    "const provider = createSecretArenaProvider({ binPath: fake });",
    "try {",
    "  try { provider.use('cred', () => {}); } catch {}",
    "  try { provider.dispose(); } catch {}",
    "  const mark = existsSync(markPath) ? readFileSync(markPath, 'utf8') : '';",
    "  const pidLine = mark.split('\\n').find((line) => line.startsWith('pid:'));",
    "  const pid = Number(pidLine?.slice(4));",
    "  assert.equal(Number.isInteger(pid) && pid > 0, true);",
    "  const stillAlive = spawnSync('kill', ['-0', String(pid)], { encoding: 'utf8' });",
    "  assert.notEqual(stillAlive.status, 0);",
    "} finally {",
    "  try { provider.dispose(); } catch {}",
    "}",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probePath], {
    encoding: "utf8",
    env: { ...process.env, GALERINA_SECRET_ARENA_MARK: markPath },
    timeout: 15000,
  });
  const mark = existsSync(markPath) ? readFileSync(markPath, "utf8") : "";
  const pidLine = mark.split("\n").find((line) => line.startsWith("pid:"));
  fakePid.pid = Number(pidLine?.slice(4));
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

function secretBytes() {
  return new Uint8Array([7, 8, 9, 10, 11, 12, 13]);
}

function containsSecret(buf, secret) {
  const v = new Uint8Array(buf);
  outer: for (let i = 0; i + secret.length <= v.length; i += 1) {
    for (let j = 0; j < secret.length; j += 1) {
      if (v[i + j] !== secret[j]) continue outer;
    }
    return true;
  }
  return false;
}

test("linux post-load subarray tamper never sees secret bytes", async (t) => {
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
  const secret = secretBytes();
  provider.put("cred", secret);
  const origSub = Uint8Array.prototype.subarray;
  const taProto = Object.getPrototypeOf(Uint8Array.prototype);
  const bufGet = Object.getOwnPropertyDescriptor(taProto, "buffer").get;
  const lenGet = Object.getOwnPropertyDescriptor(taProto, "length").get;
  let seen = false;
  t.after(() => {
    Uint8Array.prototype.subarray = origSub;
  });
  Uint8Array.prototype.subarray = function (...args) {
    if (Reflect.apply(lenGet, this, []) % 65536 === 0 && containsSecret(Reflect.apply(bufGet, this, []), secret)) {
      seen = true;
    }
    return Reflect.apply(origSub, this, args);
  };
  provider.use("cred", () => {});
  Uint8Array.prototype.subarray = origSub;
  assert.equal(seen, false);
  assert.equal(provider.status().state, "active");
});

test("linux subarray decoy on wipe cannot leave secret in backing after use", async (t) => {
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
  const secret = secretBytes();
  provider.put("cred", secret);
  const origSub = Uint8Array.prototype.subarray;
  const taProto = Object.getPrototypeOf(Uint8Array.prototype);
  const bufGet = Object.getOwnPropertyDescriptor(taProto, "buffer").get;
  const lenGet = Object.getOwnPropertyDescriptor(taProto, "length").get;
  let stash = undefined;
  let calls = 0;
  t.after(() => {
    Uint8Array.prototype.subarray = origSub;
  });
  Uint8Array.prototype.subarray = function (...args) {
    if (Reflect.apply(lenGet, this, []) % 65536 === 0 && Reflect.apply(lenGet, this, []) > 0) {
      calls += 1;
      stash = Reflect.apply(bufGet, this, []);
      if (calls >= 2) return new Uint8Array(args[1] - args[0]);
    }
    return Reflect.apply(origSub, this, args);
  };
  provider.use("cred", () => {});
  Uint8Array.prototype.subarray = origSub;
  assert.equal(stash !== undefined && containsSecret(stash, secret), false);
  assert.equal(provider.status().state, "active");
});

test("linux post-load Memory.prototype.buffer getter never sees secret bytes", async (t) => {
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
  const secret = secretBytes();
  provider.put("cred", secret);
  const desc = Object.getOwnPropertyDescriptor(WebAssembly.Memory.prototype, "buffer");
  let seen = false;
  t.after(() => {
    Object.defineProperty(WebAssembly.Memory.prototype, "buffer", desc);
  });
  Object.defineProperty(WebAssembly.Memory.prototype, "buffer", {
    configurable: true,
    get() {
      const b = Reflect.apply(desc.get, this, []);
      if (containsSecret(b, secret)) seen = true;
      return b;
    },
  });
  provider.use("cred", () => {});
  Object.defineProperty(WebAssembly.Memory.prototype, "buffer", desc);
  assert.equal(seen, false);
  assert.equal(provider.status().state, "active");
});

test("linux post-load put path set tamper never sees secret bytes", async (t) => {
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
  const secret = secretBytes();
  const origSet = Uint8Array.prototype.set;
  const seen = [];
  t.after(() => {
    Uint8Array.prototype.set = origSet;
  });
  Uint8Array.prototype.set = function forcedSet(source, ...rest) {
    if (source instanceof Uint8Array) seen.push([...source]);
    return origSet.apply(this, [source, ...rest]);
  };
  provider.put("cred", secret);
  Uint8Array.prototype.set = origSet;
  for (const bytes of seen) {
    assert.equal(bytes.length === secret.length && bytes.every((value, i) => value === secret[i]), false);
  }
  assert.equal(provider.status().state, "active");
});

test("linux process.exit without dispose SIGKILLs a SIGTERM-ignoring fake", { timeout: 20000 }, async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "galerina-arena-exit-nodisp-"));
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const markPath = join(dir, "mark");
  const scriptPath = join(dir, "exit-without-dispose.mjs");
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-ignore-sigterm.py"));
  const fakePid = { pid: 0 };
  t.after(() => {
    killFakePid(fakePid.pid);
  });
  const providerUrl = new URL("../dist/secret-arena-provider.js", import.meta.url).href;
  writeFileSync(scriptPath, [
    `import { createSecretArenaProvider } from ${JSON.stringify(providerUrl)};`,
    `const provider = createSecretArenaProvider({ binPath: ${JSON.stringify(fake)} });`,
    "void provider;",
    "process.exit(0);",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [scriptPath], {
    env: { ...process.env, GALERINA_SECRET_ARENA_MARK: markPath },
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(run.status, 0, run.stderr);
  const mark = existsSync(markPath) ? readFileSync(markPath, "utf8") : "";
  assert.match(mark, /pid:\d+/);
  const pidLine = mark.split("\n").find((line) => line.startsWith("pid:"));
  const pid = Number(pidLine?.slice(4));
  fakePid.pid = pid;
  assert.equal(Number.isInteger(pid) && pid > 0, true);
  const stillAlive = spawnSync("kill", ["-0", String(pid)], { encoding: "utf8" });
  assert.notEqual(stillAlive.status, 0, "fake must be dead after process.exit without dispose");
});

test("mutant: set-throw catch wipe removed leaves GET copy", async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  assert.equal(ensureBin(), true);
  const dir = arenaMutantDist();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const providerPath = join(dir, "dist", "secret-arena-provider.js");
  const original = readFileSync(providerPath, "utf8");
  const needle = "intrinsicApply(intrinsicFill, backing, [0]);";
  assert.equal(original.includes(needle), true);
  writeFileSync(providerPath, original.replace(needle, "void 0;"));
  const liveSet = original.replace(
    "intrinsicApply(intrinsicTypedArraySet, backing, [data]);",
    "backing.set(data);",
  );
  writeFileSync(providerPath, liveSet.replace(needle, "void 0;"));
  const probePath = join(dir, "probe-gm1.mjs");
  const href = pathToFileURL(providerPath).href;
  writeFileSync(probePath, [
    "import assert from 'node:assert/strict';",
    `import { createSecretArenaProvider } from ${JSON.stringify(href)};`,
    `const binPath = ${JSON.stringify(binPath)};`,
    "const provider = createSecretArenaProvider({ binPath });",
    "try {",
    "  const secret = new Uint8Array([7, 8, 9, 10, 11, 12, 13]);",
    "  provider.put('cred', secret);",
    "  const origSet = Uint8Array.prototype.set;",
    "  let leaked = false;",
    "  Uint8Array.prototype.set = function forcedSet(source, ...rest) {",
    "    if (source instanceof Uint8Array && source.length === secret.length) leaked = true;",
    "    throw new Error('set boom');",
    "  };",
    "  try {",
    "    try { provider.use('cred', () => {}); } catch {}",
    "  } finally {",
    "    Uint8Array.prototype.set = origSet;",
    "  }",
    "  assert.equal(provider.status().state, 'quarantined');",
    "} finally {",
    "  try { provider.dispose(); } catch {}",
    "}",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probePath], { encoding: "utf8" });
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

test("mutant: liveCustodians.add removed leaves fake alive after process.exit", { timeout: 20000 }, async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  const dir = arenaMutantDist();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const providerPath = join(dir, "dist", "secret-arena-provider.js");
  const original = readFileSync(providerPath, "utf8");
  const needle = "liveCustodians.add(child);";
  assert.equal(original.includes(needle), true);
  writeFileSync(providerPath, original.replace(needle, "void 0;"));
  const markDir = mkdtempSync(join(tmpdir(), "galerina-q24-gm2-"));
  t.after(() => {
    try {
      rmSync(markDir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const markPath = join(markDir, "mark");
  const fake = chmodFake(join(dirname(fileURLToPath(import.meta.url)), "secret-arena-fake-ignore-sigterm.py"));
  const fakePid = { pid: 0 };
  t.after(() => {
    killFakePid(fakePid.pid);
  });
  const probePath = join(dir, "probe-gm2.mjs");
  const href = pathToFileURL(providerPath).href;
  writeFileSync(probePath, [
    `import { createSecretArenaProvider } from ${JSON.stringify(href)};`,
    `const provider = createSecretArenaProvider({ binPath: ${JSON.stringify(fake)} });`,
    "void provider;",
    "process.exit(0);",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probePath], {
    encoding: "utf8",
    env: { ...process.env, GALERINA_SECRET_ARENA_MARK: markPath },
    timeout: 15000,
  });
  assert.equal(run.status, 0, run.stderr);
  const mark = existsSync(markPath) ? readFileSync(markPath, "utf8") : "";
  const pidLine = mark.split("\n").find((line) => line.startsWith("pid:"));
  const pid = Number(pidLine?.slice(4));
  fakePid.pid = pid;
  const stillAlive = spawnSync("kill", ["-0", String(pid)], { encoding: "utf8" });
  assert.equal(stillAlive.status, 0, "mutant must leave the fake alive so the test goes RED");
});

test("mutant: put-path live payload.set sees secret bytes", async (t) => {
  if (process.platform !== "linux") {
    t.skip("linux secretmem only");
    return;
  }
  assert.equal(ensureBin(), true);
  const dir = arenaMutantDist();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const providerPath = join(dir, "dist", "secret-arena-provider.js");
  const original = readFileSync(providerPath, "utf8");
  const needle = "intrinsicApply(intrinsicTypedArraySet, payload, [value, nameBytes.length]);";
  assert.equal(original.includes(needle), true);
  writeFileSync(providerPath, original.replace(needle, "payload.set(value, nameBytes.length);"));
  const probePath = join(dir, "probe-gm4.mjs");
  const href = pathToFileURL(providerPath).href;
  writeFileSync(probePath, [
    "import assert from 'node:assert/strict';",
    `import { createSecretArenaProvider } from ${JSON.stringify(href)};`,
    `const binPath = ${JSON.stringify(binPath)};`,
    "const provider = createSecretArenaProvider({ binPath });",
    "try {",
    "  const secret = new Uint8Array([7, 8, 9, 10, 11, 12, 13]);",
    "  const origSet = Uint8Array.prototype.set;",
    "  const seen = [];",
    "  Uint8Array.prototype.set = function forcedSet(source, ...rest) {",
    "    if (source instanceof Uint8Array) seen.push([...source]);",
    "    return origSet.apply(this, [source, ...rest]);",
    "  };",
    "  try {",
    "    provider.put('cred', secret);",
    "  } finally {",
    "    Uint8Array.prototype.set = origSet;",
    "  }",
    "  const leaked = seen.some((bytes) => bytes.length === secret.length && bytes.every((value, i) => value === secret[i]));",
    "  assert.equal(leaked, false);",
    "} finally {",
    "  try { provider.dispose(); } catch {}",
    "}",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probePath], { encoding: "utf8" });
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});
