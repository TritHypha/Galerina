// OPEN-S5-3 (Galerina queue row 7): killing tests for the seven all-sites survivors.
// The all-sites run (s5-all-sites-mutants.mjs, gcw-wd-e92deb55) left SSC sites 1 and 3 and SPU
// sites 2 to 6 SURVIVED: every one removes a delivery-unknown write that another layer repeats,
// so the final lease state never changed. These tests pin each layer on its own:
//   * a layer census with a write-dropping authority (markUnknown is recorded, never applied, so
//     the release shell asks again at every layer) shows how many independent writes each path
//     makes; removing a layer lowers the count,
//   * a throw-once authority proves the finalize retry (kernel.ts finalizeSecretRelease),
//   * a child process with a failing staged wipe proves the wipe-failure write (secret-gate.ts).
// Test-only: TS src is frozen reference and is not edited. Synthetic secrets only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const AK_DIST = join(REPO, "packages-ts", "galerina-framework-app-kernel", "dist");
const { createAppKernel, InMemoryAuditSink } = await import(pathToFileURL(join(AK_DIST, "kernel.js")).href);
const { ReleaseCommitAuthority } = await import(pathToFileURL(join(AK_DIST, "secret-gate.js")).href);

const SYNTHETIC = [0x73, 0x79, 0x6e, 0x74, 0x68, 0x2d, 0x73, 0x35];
const dec = new TextDecoder();

function req(requestId) {
  return { method: "GET", path: "/pay", headers: {}, body: new Uint8Array(0), query: {}, requestId, receivedAt: 0 };
}
const opIdOf = (requestId) => `${requestId}\u0000${1}`;
const errorOf = (res) => (res.body === undefined || res.body.length === 0 ? undefined : JSON.parse(dec.decode(res.body)).error);
const waitMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

/** has() is true until use() has run once, then false: a revoke between open and staged delivery. */
function provider({ revokeAfterUse = false } = {}) {
  let used = false;
  return {
    has() {
      return !(revokeAfterUse && used);
    },
    use(_name, fn) {
      used = true;
      fn(new Uint8Array(SYNTHETIC));
    },
    revocationEpoch() {
      return 0;
    },
  };
}

/** Records every delivery-unknown write and drops it, so each layer is asked separately. */
class DroppingAuthority extends ReleaseCommitAuthority {
  constructor() {
    super();
    this.unknownWrites = new Map();
  }
  markUnknown(operationId) {
    this.unknownWrites.set(operationId, (this.unknownWrites.get(operationId) ?? 0) + 1);
  }
  writes(operationId) {
    return this.unknownWrites.get(operationId) ?? 0;
  }
}

/** The first delivery-unknown write for an armed operation throws; later writes apply. */
class ThrowOnceAuthority extends ReleaseCommitAuthority {
  constructor() {
    super();
    this.armed = new Set();
    this.unknownCalls = 0;
  }
  markUnknown(operationId) {
    this.unknownCalls += 1;
    if (this.armed.delete(operationId)) throw new Error("synthetic-unknown-write-lost");
    return super.markUnknown(operationId);
  }
}

function kernelWith(handler, authority, opts = {}) {
  return createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      audit: { runtimeReport: true },
      ...(opts.timeoutMs === undefined ? {} : { limits: { timeoutMs: opts.timeoutMs } }),
    }],
    dispatch: { pay: handler },
    secretsProvider: provider(opts),
    releaseAuthority: authority,
    auditSink: new InMemoryAuditSink(),
  });
}

async function run(handler, opts = {}) {
  const dropping = new DroppingAuthority();
  const dropped = await kernelWith(handler, dropping, opts).handle(req("rq-census"));
  await waitMacrotask();
  const real = new ReleaseCommitAuthority();
  const live = await kernelWith(handler, real, opts).handle(req("rq-live"));
  await waitMacrotask();
  return {
    writes: dropping.writes(opIdOf("rq-census")),
    droppedStatus: dropped.status,
    liveStatus: live.status,
    liveError: errorOf(live),
    liveState: real.status(opIdOf("rq-live")).state,
  };
}

test("census: success path ends delivery-unknown through finalize (MB-06 baseline)", async () => {
  const r = await run(({ getSecret }) => {
    getSecret("db.main", () => {});
    return { body: { ok: true } };
  });
  assert.equal(r.liveStatus, 200);
  assert.equal(r.liveState, "delivery-unknown");
  assert.ok(r.writes >= 1, `writes=${r.writes}`);
});

test("SPU kernel.ts:1229 handler fault after a spent lease writes delivery-unknown itself, then finalize", async () => {
  const r = await run(({ getSecret }) => {
    getSecret("db.main", () => {});
    throw new Error("synthetic handler fault");
  });
  assert.equal(r.liveStatus, 500);
  assert.equal(r.liveError, "internal_error");
  assert.equal(r.liveState, "delivery-unknown");
  // Layer 1: the handler-fault branch. Layer 2: finalizeSecretRelease at publication.
  assert.ok(r.writes >= 2, `handler-fault path made ${r.writes} delivery-unknown write(s), want >= 2`);
});

test("SPU kernel.ts:1211 deadline after a spent lease writes delivery-unknown itself, then finalize", async () => {
  const r = await run(async ({ getSecret }) => {
    getSecret("db.main", () => {});
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { body: { late: true } };
  }, { timeoutMs: 20 });
  assert.notEqual(r.liveStatus, 200);
  assert.equal(r.liveState, "delivery-unknown");
  // Layer 1: the deadline branch. Layer 2: finalizeSecretRelease at publication.
  assert.ok(r.writes >= 2, `deadline path made ${r.writes} delivery-unknown write(s), want >= 2`);
});

test("SSC secret-gate.ts:423 + SPU kernel.ts:1225 staging revoke after consume: gate and kernel each write", async () => {
  const r = await run(({ getSecret }) => {
    getSecret("db.main", () => {});
    return { body: { ok: true } };
  }, { revokeAfterUse: true });
  assert.equal(r.liveStatus, 503);
  assert.equal(r.liveState, "delivery-unknown");
  // Layer 1: refuseStaging in the gate (fence alone only moves unused). Layer 2: the kernel's
  // release-refused branch. This path has no finalize, so each layer is the other's only backup.
  assert.ok(r.writes >= 2, `staging-revoke path made ${r.writes} delivery-unknown write(s), want >= 2`);
});

test("SPU kernel.ts:1241 handler that swallows a staging refusal: gate, unknownIfSpent and finalize each write", async () => {
  const r = await run(({ getSecret }) => {
    try {
      getSecret("db.main", () => {});
    } catch {
      // a hostile handler swallows the refusal and claims success
    }
    return { body: { ok: true } };
  }, { revokeAfterUse: true });
  assert.equal(r.liveStatus, 500);
  assert.equal(r.liveError, "internal_error");
  assert.equal(r.liveState, "delivery-unknown");
  // Layer 1: gate refuseStaging. Layer 2: unknownIfSpent in the sealed-refusal branch.
  // Layer 3: finalizeSecretRelease at publication.
  assert.ok(r.writes >= 3, `swallowed-refusal path made ${r.writes} delivery-unknown write(s), want >= 3`);
});

test("SPU kernel.ts:1120 a lost finalize write is retried once and the lease still ends delivery-unknown", async () => {
  const authority = new ThrowOnceAuthority();
  const kernel = kernelWith(({ getSecret }) => {
    getSecret("db.main", () => {});
    return { body: { ok: true } };
  }, authority);
  const opId = opIdOf("rq-retry");
  authority.armed.add(opId);
  const response = await kernel.handle(req("rq-retry"));
  await waitMacrotask();
  assert.equal(authority.armed.has(opId), false, "the armed write was reached");
  assert.ok(authority.unknownCalls >= 2, `unknownCalls=${authority.unknownCalls}`);
  assert.equal(authority.status(opId).state, "delivery-unknown");
  assert.notEqual(response.status, 200, "a lost delivery-unknown write never publishes success");
});

test("SSC secret-gate.ts:486 a failed staged wipe marks the lease delivery-unknown (child process)", () => {
  // Uint8Array.prototype.fill is captured when secret-gate.js loads, so the failing wipe is
  // installed before the import, in a separate process, and armed only by the consumer.
  const gate = pathToFileURL(join(AK_DIST, "secret-gate.js")).href;
  const code = `
    const realFill = Object.getPrototypeOf(Uint8Array.prototype).fill;
    let armed = false;
    Object.defineProperty(Uint8Array.prototype, "fill", { configurable: true, writable: true,
      value: function (...args) { if (armed) { armed = false; throw new Error("synthetic-wipe-fault"); }
        return Reflect.apply(realFill, this, args); } });
    const { createSecretGate, ReleaseCommitAuthority } = await import(${JSON.stringify(gate)});
    const authority = new ReleaseCommitAuthority();
    const g = createSecretGate({ has: () => true, use: (_n, fn) => fn(new Uint8Array([${SYNTHETIC.join(",")}])),
      revocationEpoch: () => 0 }, { authority });
    let thrown = null;
    try { g.getSecret(["k"], "k", () => { armed = true; }, undefined, "op-wipe"); }
    catch (e) { thrown = e && e.name; }
    process.stdout.write(JSON.stringify({ thrown, state: g.status("op-wipe").state, armedLeft: armed }));
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.armedLeft, false, "the staged wipe was reached and failed");
  assert.equal(out.thrown, "SecretGateWipeFailed");
  assert.equal(out.state, "delivery-unknown");
});
