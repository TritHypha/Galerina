// Isolated hard-termination host adapter and authenticated receipts (Grok 2026-10-05).
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createReceiptSigner,
  createReceiptVerifier,
  createMemoryReceiptSequenceStore,
  createIsolatedHost,
  isolatedGuestArgs,
  startStructuredAwait,
  advanceStructuredAwait,
  TASK_RECEIPT_CAUSE_KIND,
  MIN_RECEIPT_KEY_BYTES,
  MIN_ISOLATED_NODE_MAJOR,
} from "../dist/index.js";

const hmacSha256 = (key, data) => new Uint8Array(createHmac("sha256", key).update(data).digest());
const KEY = { keyId: "host-key-1", key: new Uint8Array(randomBytes(32)) };
const OTHER = { keyId: "host-key-1", key: new Uint8Array(randomBytes(32)) };
const nodeMajor = Number(process.versions.node.split(".")[0]);
// The isolated host is fail-closed below MIN_ISOLATED_NODE_MAJOR (src/isolated-host.ts; the floor
// is deliberate and is not lowered here). On an older Node only the refusal is asserted, and that
// test runs on every Node. Tests that need a real isolated host are skipped with an explicit reason
// instead of failing, or passing vacuously, on a Node the host will never accept.
const ISOLATION_SUPPORTED = Number.isSafeInteger(nodeMajor) && nodeMajor >= MIN_ISOLATED_NODE_MAJOR;
const NEEDS_ISOLATED_HOST = ISOLATION_SUPPORTED
  ? false
  : `needs a real isolated host: Node ${nodeMajor} is below the fail-closed floor MIN_ISOLATED_NODE_MAJOR=${MIN_ISOLATED_NODE_MAJOR}, so createIsolatedHost refuses it (asserted by the refusal test)`;
const hostTest = (name, fn) => test(name, { skip: NEEDS_ISOLATED_HOST }, fn);

const dir = realpathSync(mkdtempSync(join(tmpdir(), "galerina-isolated-")));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const guest = (name, source) => {
  const path = join(dir, `${name}.mjs`);
  writeFileSync(path, source);
  return path;
};
const G = {
  echo: guest("echo", 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify({len:s.length,env:Object.keys(process.env).map(k=>k.toUpperCase()).sort()})));'),
  loop: guest("loop", "for(;;){}"),
  ignoreSignals: guest("ignore", 'process.on("SIGTERM",()=>{});process.on("SIGINT",()=>{});setInterval(()=>{},1000);'),
  fail: guest("fail", "process.exit(3);"),
  flood: guest("flood", 'const b="x".repeat(65536);for(;;){process.stdout.write(b);}'),
  badUtf8: guest("bad-utf8", "process.stdout.write(Buffer.from([0xff,0xfe,0x41]));"),
  fsWrite: guest("fs-write", `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(join(dir, "escaped.txt"))}, "x");`),
  fsReadSibling: guest("fs-read", `import fs from "node:fs"; process.stdout.write(fs.readFileSync(${JSON.stringify(join(dir, "echo.mjs"))}, "utf8"));`),
  child: guest("child", `import cp from "node:child_process"; cp.spawnSync(process.execPath, ["-e", "1"]); process.stdout.write("spawned");`),
  worker: guest("worker", `import { Worker } from "node:worker_threads"; new Worker("1", { eval: true }); process.stdout.write("worker");`),
  evalStr: guest("eval", `process.stdout.write(String(eval("1+1")) + new Function("return 2")());`),
};

let clock = 0;
const elapsedMs = () => clock;
const makeHost = (overrides = {}) => {
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const host = createIsolatedHost({ execPath: process.execPath, nodeMajor, spawn, signer, elapsedMs, ...overrides });
  return { host, verifier: createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() }) };
};
const spec = (entry, extra = {}) => ({ scopeId: "scope-1", taskId: "task-a", entry, input: "hello", deadlineMs: 5_000, maxOutputBytes: 4_096, maxHeapMb: 64, ...extra });

// ── receipts ──────────────────────────────────────────────────────────────────

test("receipt round-trips into the exact reducer event", () => {
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const verifier = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  for (const [cause, kind] of Object.entries(TASK_RECEIPT_CAUSE_KIND)) {
    const r = signer.sign({ scopeId: "s-" + cause, taskId: "t1", cause, elapsedMs: 7 });
    assert.equal(r.kind, kind);
    assert.equal(r.sequence, 1);
    assert.match(r.mac, /^[0-9a-f]{64}$/);
    const v = verifier.verify({ ...r });
    assert.equal(v.ok, true);
    assert.deepEqual({ ...v.event }, { kind, taskId: "t1", elapsedMs: 7 });
  }
});

test("tampered, re-keyed, unknown-key and inconsistent receipts are refused", () => {
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const verifier = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const r = signer.sign({ scopeId: "s1", taskId: "t1", cause: "deadline_kill", elapsedMs: 10 });
  assert.equal(verifier.verify({ ...r, elapsedMs: 9 }).error.code, "ERR_RUNTIME_RECEIPT_MAC");
  assert.equal(verifier.verify({ ...r, taskId: "t2" }).error.code, "ERR_RUNTIME_RECEIPT_MAC");
  assert.equal(verifier.verify({ ...r, kind: "task_succeeded", cause: "exit_zero" }).error.code, "ERR_RUNTIME_RECEIPT_MAC");
  assert.equal(verifier.verify({ ...r, kind: "task_succeeded" }).error.code, "ERR_RUNTIME_RECEIPT_CAUSE");
  assert.equal(verifier.verify({ ...r, keyId: "other" }).error.code, "ERR_RUNTIME_RECEIPT_KEY");
  const forged = createReceiptSigner({ key: OTHER, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() }).sign({ scopeId: "s1", taskId: "t1", cause: "exit_zero", elapsedMs: 10 });
  assert.equal(verifier.verify({ ...forged }).error.code, "ERR_RUNTIME_RECEIPT_MAC");
  assert.equal(verifier.verify({ ...r, version: "galerina.runtime.receipt.v0" }).error.code, "ERR_RUNTIME_RECEIPT_VERSION");
  assert.equal(verifier.verify({ ...r, mac: r.mac.toUpperCase() }).error.code, "ERR_RUNTIME_RECEIPT_SHAPE");
  // The genuine receipt still verifies: failed forgeries burn no sequence number.
  assert.equal(verifier.verify({ ...r }).ok, true);
});

test("replay and reordering are refused per scope", () => {
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const verifier = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const a = signer.sign({ scopeId: "s1", taskId: "t1", cause: "exit_zero", elapsedMs: 1 });
  const b = signer.sign({ scopeId: "s1", taskId: "t2", cause: "exit_zero", elapsedMs: 2 });
  const other = signer.sign({ scopeId: "s2", taskId: "t1", cause: "exit_zero", elapsedMs: 1 });
  assert.equal(b.sequence, 2);
  assert.equal(verifier.verify({ ...b }).ok, true);
  assert.equal(verifier.verify({ ...a }).error.code, "ERR_RUNTIME_RECEIPT_REPLAY");
  assert.equal(verifier.verify({ ...b }).error.code, "ERR_RUNTIME_RECEIPT_REPLAY");
  assert.equal(verifier.verify({ ...other }).ok, true);
});

test("receipt shape is exact: accessors, extra keys, proxies and prototypes refuse without echo", () => {
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const verifier = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const r = signer.sign({ scopeId: "s1", taskId: "t1", cause: "exit_zero", elapsedMs: 1 });
  const withGetter = { ...r };
  Object.defineProperty(withGetter, "elapsedMs", { get() { throw new Error("boom"); }, enumerable: true });
  const throwing = new Proxy({ ...r }, { ownKeys() { throw new Error("boom"); } });
  const inherited = Object.assign(Object.create({ polluted: true }), r);
  for (const bad of [null, 1, "x", [], { ...r, extra: 1 }, withGetter, throwing, inherited, { ...r, elapsedMs: -1 }, { ...r, sequence: 0 }, { ...r, taskId: "bad\nid" }]) {
    const v = verifier.verify(bad);
    assert.equal(v.ok, false);
    assert.doesNotMatch(JSON.stringify(v), /boom|bad\\nid|polluted/);
  }
});

test("weak keys, duplicate key ids and a fake HMAC are refused at construction", () => {
  assert.throws(() => createReceiptSigner({ key: { keyId: "k", key: new Uint8Array(MIN_RECEIPT_KEY_BYTES - 1) }, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() }), { code: "ERR_RUNTIME_RECEIPT_CONFIG" });
  assert.throws(() => createReceiptVerifier({ keys: [KEY, KEY], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() }), { code: "ERR_RUNTIME_RECEIPT_CONFIG" });
  assert.throws(() => createReceiptVerifier({ keys: [], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() }), { code: "ERR_RUNTIME_RECEIPT_CONFIG" });
  const fake = () => new Uint8Array(32);
  assert.throws(() => createReceiptSigner({ key: KEY, hmacSha256: fake, sequenceStore: createMemoryReceiptSequenceStore() }), { code: "ERR_RUNTIME_RECEIPT_HMAC" });
  assert.throws(() => createReceiptVerifier({ keys: [KEY], hmacSha256: (k, d) => hmacSha256(k, d).slice(0, 16), sequenceStore: createMemoryReceiptSequenceStore() }), { code: "ERR_RUNTIME_RECEIPT_HMAC" });
});

test("signer copies the key: later mutation of the caller buffer does not change receipts", () => {
  const raw = new Uint8Array(randomBytes(32));
  const signer = createReceiptSigner({ key: { keyId: "k1", key: raw }, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const verifier = createReceiptVerifier({ keys: [{ keyId: "k1", key: Uint8Array.from(raw) }], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  raw.fill(0);
  assert.equal(verifier.verify({ ...signer.sign({ scopeId: "s1", taskId: "t1", cause: "exit_zero", elapsedMs: 0 }) }).ok, true);
});


test("durable sequence store refuses replay across verifier restart", () => {
  const signStore = createMemoryReceiptSequenceStore();
  const verifyStore = createMemoryReceiptSequenceStore();
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: signStore });
  const verifier1 = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: verifyStore });
  const r = signer.sign({ scopeId: "durable-1", taskId: "t1", cause: "exit_zero", elapsedMs: 1 });
  assert.equal(verifier1.verify({ ...r }).ok, true);
  // New verifier instance, same durable store: old receipt must still be refused.
  const verifier2 = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: verifyStore });
  assert.equal(verifier2.verify({ ...r }).error.code, "ERR_RUNTIME_RECEIPT_REPLAY");
  const r2 = signer.sign({ scopeId: "durable-1", taskId: "t2", cause: "exit_zero", elapsedMs: 2 });
  assert.equal(verifier2.verify({ ...r2 }).ok, true);
});

test("sequence store set failure refuses without accepting the receipt", () => {
  const signStore = createMemoryReceiptSequenceStore();
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: signStore });
  const r = signer.sign({ scopeId: "fail-store", taskId: "t1", cause: "exit_zero", elapsedMs: 1 });
  let sets = 0;
  const broken = Object.freeze({
    getLastSequence() { return undefined; },
    setLastSequence() { sets += 1; throw new Error("disk full"); },
    scopeCount() { return 0; },
  });
  const verifier = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: broken });
  assert.equal(verifier.verify({ ...r }).error.code, "ERR_RUNTIME_RECEIPT_SEQUENCE_STORE");
  assert.equal(sets, 1);
  // A working store still accepts the same receipt (broken store never persisted).
  const okVerifier = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  assert.equal(okVerifier.verify({ ...r }).ok, true);
});

test("missing or invalid sequenceStore is refused at construction", () => {
  assert.throws(() => createReceiptVerifier({ keys: [KEY], hmacSha256 }), { code: "ERR_RUNTIME_RECEIPT_CONFIG" });
  assert.throws(() => createReceiptSigner({ key: KEY, hmacSha256 }), { code: "ERR_RUNTIME_RECEIPT_CONFIG" });
  assert.throws(() => createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: {} }), { code: "ERR_RUNTIME_RECEIPT_CONFIG" });
  assert.throws(() => createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: { getLastSequence: 1, setLastSequence() {}, scopeCount() { return 0; } } }), { code: "ERR_RUNTIME_RECEIPT_CONFIG" });
});

// ── isolated host ─────────────────────────────────────────────────────────────

test("guest args: permission model, entry-only read, no eval, bounded heap", () => {
  assert.deepEqual([...isolatedGuestArgs({ entry: G.echo, maxHeapMb: 64 })], [
    "--permission", "--disallow-code-generation-from-strings", `--allow-fs-read=${G.echo}`, "--max-old-space-size=64", "--", G.echo,
  ]);
});

// libuv always forwards this fixed set of system variables to a Windows child, even with an
// empty env; nothing else from the host environment reaches the guest.
const WINDOWS_LIBUV_REQUIRED_ENV = new Set(["HOMEDRIVE", "HOMEPATH", "LOGONSERVER", "PATH", "SYSTEMDRIVE", "SYSTEMROOT", "TEMP", "USERDOMAIN", "USERNAME", "USERPROFILE", "WINDIR"]);

hostTest("cooperative guest succeeds without the host environment and with a verifiable receipt", async () => {
  const { host, verifier } = makeHost();
  clock = 3;
  process.env.GALERINA_ISOLATED_TEST_SECRET = "s3cr3t";
  process.env.NODE_OPTIONS = "--allow-fs-write=*";
  let r;
  try {
    r = await host.run(spec(G.echo)).result;
  } finally {
    delete process.env.GALERINA_ISOLATED_TEST_SECRET;
    delete process.env.NODE_OPTIONS;
  }
  assert.equal(r.outcome, "succeeded");
  const seen = JSON.parse(r.output);
  assert.equal(seen.len, 5);
  const allowed = process.platform === "win32" ? WINDOWS_LIBUV_REQUIRED_ENV : new Set();
  assert.deepEqual(seen.env.filter((k) => !allowed.has(k)), []);
  assert.equal(r.receipt.cause, "exit_zero");
  const v = verifier.verify({ ...r.receipt });
  assert.equal(v.ok, true);
  assert.deepEqual({ ...v.event }, { kind: "task_succeeded", taskId: "task-a", elapsedMs: 3 });
});

hostTest("non-cooperative busy loop is hard-terminated at its deadline", async () => {
  const { host, verifier } = makeHost();
  const started = Date.now();
  const r = await host.run(spec(G.loop, { deadlineMs: 300 })).result;
  assert.equal(r.outcome, "timed_out");
  assert.equal(r.receipt.cause, "deadline_kill");
  assert.equal(r.receipt.kind, "task_cancelled");
  assert.ok(Date.now() - started < 4_000, "guest was stopped promptly");
  assert.equal(verifier.verify({ ...r.receipt }).ok, true);
});

hostTest("guest that ignores SIGTERM/SIGINT is still stopped by host cancel", async () => {
  const { host } = makeHost();
  const run = host.run(spec(G.ignoreSignals));
  setTimeout(() => run.cancel(), 200);
  const r = await run.result;
  assert.equal(r.outcome, "cancelled");
  assert.equal(r.receipt.cause, "cancel_kill");
  run.cancel(); // idempotent after settle
});

hostTest("non-zero exit, output flood and invalid UTF-8 fail closed", async () => {
  const { host } = makeHost();
  const fail = await host.run(spec(G.fail)).result;
  assert.equal(fail.outcome, "failed");
  assert.equal(fail.receipt.cause, "exit_nonzero");
  const flood = await host.run(spec(G.flood, { taskId: "task-b" })).result;
  assert.equal(flood.outcome, "failed");
  assert.equal(flood.receipt.cause, "output_limit_kill");
  assert.equal("output" in flood, false);
  const bad = await host.run(spec(G.badUtf8, { taskId: "task-c" })).result;
  assert.equal(bad.outcome, "failed");
  assert.equal(bad.receipt.cause, "output_invalid");
});

hostTest("guest cannot write files, read siblings, spawn processes, start workers or eval strings", async () => {
  const { host } = makeHost();
  for (const entry of [G.fsWrite, G.fsReadSibling, G.child, G.worker, G.evalStr]) {
    const r = await host.run(spec(entry)).result;
    assert.equal(r.outcome, "failed", entry);
    assert.equal(r.receipt.cause, "exit_nonzero", entry);
  }
  assert.equal(existsSync(join(dir, "escaped.txt")), false);
});

hostTest("missing executable is a spawn failure, not a success", async () => {
  const missing = process.platform === "win32" ? "C:\\no-such-dir\\node.exe" : "/no-such-dir/node";
  const { host } = makeHost({ execPath: missing });
  const r = await host.run(spec(G.echo)).result;
  assert.equal(r.outcome, "failed");
  assert.equal(r.receipt.cause, "spawn_failed");
});

hostTest("invalid specs are refused before anything is spawned", async () => {
  let calls = 0;
  const spy = (...a) => { calls += 1; return spawn(...a); };
  const { host } = makeHost({ spawn: spy });
  const bad = [
    spec("relative/guest.mjs"),
    spec(G.echo.replace(/\.mjs$/, ".js")),
    spec(G.echo + ",x.mjs"),
    spec(G.echo, { deadlineMs: 0 }),
    spec(G.echo, { deadlineMs: 600_001 }),
    spec(G.echo, { maxOutputBytes: 1_048_577 }),
    spec(G.echo, { maxHeapMb: 8 }),
    spec(G.echo, { input: "x".repeat(65_537) }),
    spec(G.echo, { taskId: "bad id" }),
    { ...spec(G.echo), extra: true },
  ];
  // A literal ".." segment must be refused (join() normalises, so build it by hand).
  const sep = process.platform === "win32" ? "\\" : "/";
  bad.push(spec(dir + sep + ".." + sep + "echo.mjs"));
  for (const s of bad) {
    const r = await host.run(s).result;
    assert.equal(r.outcome, "refused", JSON.stringify({ ...s, input: s.input.length }));
    assert.equal(r.error.code, "ERR_RUNTIME_ISOLATED_SPEC");
  }
  assert.equal(calls, 0);
});

test("host configuration is validated: old Node, relative exec path, missing signer", () => {
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  // Admissible Node major, so each refusal below is caused by the one field it changes (on every Node).
  const base = { execPath: process.execPath, nodeMajor: Math.max(nodeMajor, MIN_ISOLATED_NODE_MAJOR), spawn, signer, elapsedMs };
  assert.throws(() => createIsolatedHost({ ...base, nodeMajor: 20 }), { code: "ERR_RUNTIME_ISOLATED_CONFIG" });
  assert.throws(() => createIsolatedHost({ ...base, execPath: "node" }), { code: "ERR_RUNTIME_ISOLATED_CONFIG" });
  assert.throws(() => createIsolatedHost({ ...base, signer: {} }), { code: "ERR_RUNTIME_ISOLATED_CONFIG" });
  assert.throws(() => createIsolatedHost({ ...base, extra: 1 }), { code: "ERR_RUNTIME_ISOLATED_CONFIG" });
});

test("a Node below the isolation floor is refused before anything starts (runs on every Node)", () => {
  let calls = 0;
  const spy = (...a) => { calls += 1; return spawn(...a); };
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const config = (major) => ({ execPath: process.execPath, nodeMajor: major, spawn: spy, signer, elapsedMs });
  for (const major of [18, 20, MIN_ISOLATED_NODE_MAJOR - 1]) {
    assert.throws(() => createIsolatedHost(config(major)), { code: "ERR_RUNTIME_ISOLATED_CONFIG" });
  }
  if (ISOLATION_SUPPORTED) {
    assert.equal(typeof createIsolatedHost(config(nodeMajor)).run, "function");
  } else {
    // The running Node itself is refused: no host exists, so no guest can ever be spawned.
    assert.throws(() => createIsolatedHost(config(nodeMajor)), { code: "ERR_RUNTIME_ISOLATED_CONFIG" });
  }
  assert.equal(calls, 0, "nothing is spawned while a host is constructed or refused");
});

hostTest("a bad clock yields receipt_unavailable, never an unreceipted success", async () => {
  const { host } = makeHost({ elapsedMs: () => -1 });
  const r = await host.run(spec(G.echo)).result;
  assert.equal(r.outcome, "receipt_unavailable");
  assert.equal("receipt" in r, false);
});

hostTest("a kill whose exit is never observed is termination_unconfirmed, with no receipt", async () => {
  // Fake child that never emits close: termination must not be claimed.
  const fakeSpawn = () => ({ pid: 4242, stdin: null, stdout: null, on() {}, kill() { return true; } });
  const { host } = makeHost({ spawn: fakeSpawn });
  const r = await host.run(spec(G.echo, { deadlineMs: 10 })).result;
  assert.equal(r.outcome, "termination_unconfirmed");
  assert.equal(r.error.code, "ERR_RUNTIME_ISOLATED_UNCONFIRMED");
  assert.equal("receipt" in r, false);
});

hostTest("end to end: reducer timeout waits for the authenticated hard-termination receipt", async () => {
  const signer = createReceiptSigner({ key: KEY, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  const verifier = createReceiptVerifier({ keys: [KEY], hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() });
  let now = 0;
  const host = createIsolatedHost({ execPath: process.execPath, nodeMajor, spawn, signer, elapsedMs: () => now });
  const start = startStructuredAwait({
    version: "galerina.runtime.await.v1", scopeId: "scope-e2e", taskIds: ["task-a"], timeoutMs: 300, maxInFlight: 1,
    completion: { kind: "all", onFailure: "cancel_remaining" },
  });
  assert.equal(start.ok, true);
  assert.deepEqual(start.commands.map((c) => c.kind), ["start"]);
  const run = host.run({ ...spec(G.loop, { deadlineMs: 300 }), scopeId: "scope-e2e" });
  const tick = advanceStructuredAwait(start.state, { kind: "tick", elapsedMs: 300 });
  assert.equal(tick.ok, true);
  assert.equal(tick.state.scopeStatus, "cancelling");
  assert.deepEqual(tick.commands.map((c) => c.kind), ["cancel"]);
  now = 301;
  const r = await run.result;
  // A forged success for the same task is refused before it can reach the reducer.
  const forged = createReceiptSigner({ key: OTHER, hmacSha256, sequenceStore: createMemoryReceiptSequenceStore() }).sign({ scopeId: "scope-e2e", taskId: "task-a", cause: "exit_zero", elapsedMs: 301 });
  assert.equal(verifier.verify({ ...forged }).ok, false);
  const v = verifier.verify({ ...r.receipt });
  assert.equal(v.ok, true);
  const done = advanceStructuredAwait(tick.state, v.event);
  assert.equal(done.ok, true);
  assert.equal(done.state.scopeStatus, "timed_out");
  assert.deepEqual(done.commands.map((c) => c.kind), ["terminal"]);
});
