// Q24 follow-up 02: acknowledged → delivery-unknown downgrade, local minted record.
// Synthetic data only. Does not modify other rd1415-* oracle tests.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAppKernel, InMemoryAuditSink } from "../dist/kernel.js";
import { ReleaseCommitAuthority } from "../dist/secret-gate.js";

const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];
const dec = new TextDecoder();
const here = dirname(fileURLToPath(import.meta.url));

function req(requestId) {
  return {
    method: "GET",
    path: "/pay",
    headers: {},
    body: new Uint8Array(0),
    query: {},
    requestId,
    receivedAt: 0,
  };
}

function errorOf(res) {
  if (res.body === undefined) return undefined;
  return JSON.parse(dec.decode(res.body)).error;
}

function waitMacrotask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function latestOperationId(authority) {
  const events = authority.auditEvents();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const id = events[i].operationId;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return "";
}

function countingProvider(stored = new Uint8Array(SYNTHETIC)) {
  return {
    has() {
      return true;
    },
    use(_name, fn) {
      fn(new Uint8Array(stored));
    },
    revocationEpoch() {
      return 0;
    },
  };
}

function throwingCommitSink() {
  return {
    reserve() {
      return { id: 1 };
    },
    commit() {
      throw new Error("audit-boom");
    },
    cancel() {},
    emit() {},
  };
}

function payRoute(over = {}) {
  return {
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      audit: { runtimeReport: true },
      ...over.route,
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => {});
        return { body: { ok: true } };
      },
      ...over.dispatch,
    },
    secretsProvider: over.secretsProvider ?? countingProvider(),
    auditSink: over.auditSink ?? new InMemoryAuditSink(),
  };
}

function kernelDistCopy() {
  const dir = mkdtempSync(join(tmpdir(), "galerina-q24-kernel-"));
  const distSrc = join(here, "..", "dist");
  cpSync(distSrc, join(dir, "dist"), { recursive: true });
  const nodeModules = join(here, "..", "node_modules");
  const linkType = process.platform === "win32" ? "junction" : "dir";
  symlinkSync(nodeModules, join(dir, "node_modules"), linkType);
  return dir;
}

test("audit commit throw after ack is HTTP 503 and DELIVERY_UNKNOWN", async () => {
  const authority = new ReleaseCommitAuthority();
  const kernel = createAppKernel({
    ...payRoute({ auditSink: throwingCommitSink() }),
    releaseAuthority: authority,
  });
  const response = await kernel.handle(req("rq-audit-down"));
  await waitMacrotask();
  const operationId = latestOperationId(authority);
  assert.equal(response.status, 503);
  assert.equal(errorOf(response), "audit_unavailable");
  assert.equal(authority.status(operationId).kind, "DELIVERY_UNKNOWN");
});

test("acknowledgeMinted throw after super.ack is DELIVERY_UNKNOWN never RELEASED_ACKED", async () => {
  class ThrowAfterAck extends ReleaseCommitAuthority {
    acknowledgeMinted(operationId) {
      super.acknowledgeMinted(operationId);
      throw new Error("after ack");
    }
  }
  const authority = new ThrowAfterAck();
  const kernel = createAppKernel({
    ...payRoute(),
    releaseAuthority: authority,
  });
  const response = await kernel.handle(req("rq-after-ack"));
  await waitMacrotask();
  const operationId = latestOperationId(authority);
  assert.equal(response.status, 500);
  assert.equal(authority.status(operationId).kind, "DELIVERY_UNKNOWN");
  assert.notEqual(authority.status(operationId).kind, "RELEASED_ACKED");
});

test("revokeDelivery is one-way and never upgrades a missing operation", () => {
  const authority = new ReleaseCommitAuthority();
  authority.revokeDelivery("never-minted");
  assert.equal(authority.status("never-minted").kind, "NOT_FOUND");
  const minted = authority.mint("op-unused", 1);
  authority.revokeDelivery(minted.leaseId);
  assert.equal(authority.stateOf(minted.leaseId), "unused");
  assert.notEqual(authority.status(minted.leaseId).kind, "RELEASED_ACKED");
});

test("minted operation whose status lies NOT_FOUND is HTTP 500", async () => {
  class LyingNotFound extends ReleaseCommitAuthority {
    status(operationId) {
      return Object.freeze({ kind: "NOT_FOUND", operationId });
    }
  }
  const authority = new LyingNotFound();
  const kernel = createAppKernel({
    ...payRoute(),
    releaseAuthority: authority,
  });
  const response = await kernel.handle(req("rq-lie-not-found"));
  await waitMacrotask();
  assert.equal(response.status, 500);
});

test("publication deadline after getSecret is DELIVERY_UNKNOWN", async () => {
  const authority = new ReleaseCommitAuthority();
  const kernel = createAppKernel({
    ...payRoute({
      route: { limits: { timeoutMs: 20, memoryBytes: 65536, maxConcurrent: 4 } },
      dispatch: {
        pay: async ({ getSecret }) => {
          getSecret("db.main", () => {});
          await new Promise(() => {});
        },
      },
    }),
    releaseAuthority: authority,
  });
  const response = await kernel.handle(req("rq-deadline"));
  await waitMacrotask();
  const operationId = latestOperationId(authority);
  assert.equal(response.status, 504);
  assert.equal(authority.status(operationId).kind, "DELIVERY_UNKNOWN");
});

test("mutant: drop kernel downgrade on audit throw leaves ACKED", async (t) => {
  const dir = kernelDistCopy();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const kernelPath = join(dir, "dist", "kernel.js");
  const original = readFileSync(kernelPath, "utf8");
  const needle = "secretGate.noteUndelivered(releaseOperationId);";
  assert.equal(original.includes(needle), true);
  writeFileSync(kernelPath, original.replace(needle, "void 0;"));
  const probe = join(dir, "probe-downgrade.mjs");
  writeFileSync(probe, [
    "import assert from 'node:assert/strict';",
    `import { createAppKernel } from ${JSON.stringify(pathToFileURL(kernelPath).href)};`,
    `import { ReleaseCommitAuthority } from ${JSON.stringify(pathToFileURL(join(dir, "dist", "secret-gate.js")).href)};`,
    "const authority = new ReleaseCommitAuthority();",
    "const kernel = createAppKernel({",
    "  routes: [{ method: 'GET', path: '/pay', handler: 'pay', auth: { mode: 'public' }, secrets: { require: ['db.main'] }, audit: { runtimeReport: true } }],",
    "  dispatch: { pay: ({ getSecret }) => { getSecret('db.main', () => {}); return { body: { ok: true } }; } },",
    "  secretsProvider: { has() { return true; }, use(_n, fn) { fn(new Uint8Array([1])); }, revocationEpoch() { return 0; } },",
    "  releaseAuthority: authority,",
    "  auditSink: { reserve() { return { id: 1 }; }, commit() { throw new Error('boom'); }, cancel() {}, emit() {} },",
    "});",
    "const res = await kernel.handle({ method: 'GET', path: '/pay', headers: {}, body: new Uint8Array(0), query: {}, requestId: 'x', receivedAt: 0 });",
    "const events = authority.auditEvents();",
    "const id = events[events.length - 1]?.operationId ?? '';",
    "assert.equal(res.status, 503);",
    "assert.equal(authority.status(id).kind, 'DELIVERY_UNKNOWN');",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probe], { encoding: "utf8", timeout: 20000 });
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

test("mutant: revokeDelivery no-op leaves ACKED after audit throw", async (t) => {
  const dir = kernelDistCopy();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const authPath = join(dir, "dist", "release-commit-point.js");
  const original = readFileSync(authPath, "utf8");
  const needle = "        switch (rec.state) {\n            case \"acknowledged\":\n                rec.state = \"delivery-unknown\";";
  assert.equal(original.includes(needle), true);
  writeFileSync(authPath, original.replace(
    needle,
    "        switch (rec.state) {\n            case \"acknowledged\":\n                rec.state = rec.state;",
  ));
  const probe = join(dir, "probe-noop.mjs");
  writeFileSync(probe, [
    "import assert from 'node:assert/strict';",
    `import { createAppKernel } from ${JSON.stringify(pathToFileURL(join(dir, "dist", "kernel.js")).href)};`,
    `import { ReleaseCommitAuthority } from ${JSON.stringify(pathToFileURL(join(dir, "dist", "secret-gate.js")).href)};`,
    "const authority = new ReleaseCommitAuthority();",
    "const kernel = createAppKernel({",
    "  routes: [{ method: 'GET', path: '/pay', handler: 'pay', auth: { mode: 'public' }, secrets: { require: ['db.main'] }, audit: { runtimeReport: true } }],",
    "  dispatch: { pay: ({ getSecret }) => { getSecret('db.main', () => {}); return { body: { ok: true } }; } },",
    "  secretsProvider: { has() { return true; }, use(_n, fn) { fn(new Uint8Array([1])); }, revocationEpoch() { return 0; } },",
    "  releaseAuthority: authority,",
    "  auditSink: { reserve() { return { id: 1 }; }, commit() { throw new Error('boom'); }, cancel() {}, emit() {} },",
    "});",
    "const res = await kernel.handle({ method: 'GET', path: '/pay', headers: {}, body: new Uint8Array(0), query: {}, requestId: 'x', receivedAt: 0 });",
    "const events = authority.auditEvents();",
    "const id = events[events.length - 1]?.operationId ?? '';",
    "assert.equal(res.status, 503);",
    "assert.equal(authority.status(id).kind, 'DELIVERY_UNKNOWN');",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probe], { encoding: "utf8", timeout: 20000 });
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

test("mutant: revokeDelivery must not upgrade a missing op to acknowledged", async (t) => {
  const dir = kernelDistCopy();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const authPath = join(dir, "dist", "release-commit-point.js");
  const original = readFileSync(authPath, "utf8");
  const needle = "        const rec = this.#leases.get(id);\n        if (rec === undefined) {\n            return;\n        }";
  assert.equal(original.includes(needle), true);
  writeFileSync(authPath, original.replace(
    needle,
    "        const rec = this.#leases.get(id);\n        if (rec === undefined) {\n            this.#leases.set(id, { token: \"x\", epoch: 0, state: \"acknowledged\" });\n            return;\n        }",
  ));
  const probe = join(dir, "probe-upgrade.mjs");
  writeFileSync(probe, [
    "import assert from 'node:assert/strict';",
    `import { ReleaseCommitAuthority } from ${JSON.stringify(pathToFileURL(join(dir, "dist", "secret-gate.js")).href)};`,
    "const authority = new ReleaseCommitAuthority();",
    "authority.revokeDelivery('never-minted');",
    "assert.equal(authority.status('never-minted').kind, 'NOT_FOUND');",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probe], { encoding: "utf8", timeout: 20000 });
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

test("mutant: trust status NOT_FOUND skip leaves minted op unacked success", async (t) => {
  const dir = kernelDistCopy();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const kernelPath = join(dir, "dist", "kernel.js");
  const original = readFileSync(kernelPath, "utf8");
  const needle = "                    case \"NOT_FOUND\":\n                        noteUnknownBestEffort();\n                        throw new Error(\"GALERINA_SECRET_ACKNOWLEDGE_FAILED\");";
  assert.equal(original.includes(needle), true);
  writeFileSync(kernelPath, original.replace(
    needle,
    "                    case \"NOT_FOUND\":\n                        return;",
  ));
  const probe = join(dir, "probe-notfound.mjs");
  writeFileSync(probe, [
    "import assert from 'node:assert/strict';",
    `import { createAppKernel } from ${JSON.stringify(pathToFileURL(kernelPath).href)};`,
    `import { ReleaseCommitAuthority } from ${JSON.stringify(pathToFileURL(join(dir, "dist", "secret-gate.js")).href)};`,
    "class LyingNotFound extends ReleaseCommitAuthority {",
    "  status(operationId) { return Object.freeze({ kind: 'NOT_FOUND', operationId }); }",
    "}",
    "const authority = new LyingNotFound();",
    "const kernel = createAppKernel({",
    "  routes: [{ method: 'GET', path: '/pay', handler: 'pay', auth: { mode: 'public' }, secrets: { require: ['db.main'] }, audit: { runtimeReport: true } }],",
    "  dispatch: { pay: ({ getSecret }) => { getSecret('db.main', () => {}); return { body: { ok: true } }; } },",
    "  secretsProvider: { has() { return true; }, use(_n, fn) { fn(new Uint8Array([1])); }, revocationEpoch() { return 0; } },",
    "  releaseAuthority: authority,",
    "  auditSink: { reserve() { return { id: 1 }; }, commit() {}, cancel() {}, emit() {} },",
    "});",
    "const res = await kernel.handle({ method: 'GET', path: '/pay', headers: {}, body: new Uint8Array(0), query: {}, requestId: 'x', receivedAt: 0 });",
    "assert.equal(res.status, 500);",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probe], { encoding: "utf8", timeout: 20000 });
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

test("mutant: not-ok finalize skips noteUnknown", async (t) => {
  const dir = kernelDistCopy();
  t.after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // leftover
    }
  });
  const kernelPath = join(dir, "dist", "kernel.js");
  const original = readFileSync(kernelPath, "utf8");
  const needle = "                if (ok !== true) {\n                    noteUnknownBestEffort();\n                    return;\n                }";
  assert.equal(original.includes(needle), true);
  writeFileSync(kernelPath, original.replace(needle, "                if (ok !== true) {\n                    return;\n                }"));
  const probe = join(dir, "probe-gm6.mjs");
  writeFileSync(probe, [
    "import assert from 'node:assert/strict';",
    `import { createAppKernel } from ${JSON.stringify(pathToFileURL(kernelPath).href)};`,
    `import { ReleaseCommitAuthority } from ${JSON.stringify(pathToFileURL(join(dir, "dist", "secret-gate.js")).href)};`,
    "const authority = new ReleaseCommitAuthority();",
    "const kernel = createAppKernel({",
    "  routes: [{ method: 'GET', path: '/pay', handler: 'pay', auth: { mode: 'public' }, secrets: { require: ['db.main'] }, audit: { runtimeReport: true }, limits: { timeoutMs: 20, memoryBytes: 65536, maxConcurrent: 4 } }],",
    "  dispatch: { pay: async ({ getSecret }) => { getSecret('db.main', () => {}); await new Promise(() => {}); } },",
    "  secretsProvider: { has() { return true; }, use(_n, fn) { fn(new Uint8Array([1])); }, revocationEpoch() { return 0; } },",
    "  releaseAuthority: authority,",
    "  auditSink: { reserve() { return { id: 1 }; }, commit() {}, cancel() {}, emit() {} },",
    "});",
    "const res = await kernel.handle({ method: 'GET', path: '/pay', headers: {}, body: new Uint8Array(0), query: {}, requestId: 'x', receivedAt: 0 });",
    "const events = authority.auditEvents();",
    "const id = events[events.length - 1]?.operationId ?? '';",
    "assert.equal(res.status, 504);",
    "assert.equal(authority.status(id).kind, 'DELIVERY_UNKNOWN');",
    "",
  ].join("\n"));
  const run = spawnSync(process.execPath, [probe], { encoding: "utf8", timeout: 20000 });
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});
