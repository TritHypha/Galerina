// R3: acknowledge throw fails closed (delivery-unknown/refused, never acknowledged).
// Synthetic data only. Does not modify rd1413-revocation-before-delivery.test.mjs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAppKernel, InMemoryAuditSink } from "../dist/kernel.js";
import { ReleaseCommitAuthority } from "../dist/secret-gate.js";

const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];
const dec = new TextDecoder();

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

class SelectiveThrowAck extends ReleaseCommitAuthority {
  constructor() {
    super();
    this.throwFor = new Set();
    this.throwAll = false;
    this.throwIfNot = null;
  }
  acknowledgeMinted(operationId) {
    if (this.throwAll || this.throwFor.has(operationId) || (this.throwIfNot !== null && operationId !== this.throwIfNot)) {
      throw new Error("forced-ack");
    }
    return super.acknowledgeMinted(operationId);
  }
}

function latestOperationId(authority) {
  const events = authority.auditEvents();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const id = events[i].operationId;
    if (typeof id === "string" && id.length > 0) return id;
  }
  return "";
}

test("kernel: acknowledge throw is delivery-unknown and never acknowledged", async () => {
  const authority = new SelectiveThrowAck();
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      audit: { runtimeReport: true },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => {});
        return { body: { ok: true } };
      },
    },
    secretsProvider: countingProvider(),
    releaseAuthority: authority,
    auditSink: new InMemoryAuditSink(),
  });
  authority.throwAll = true;
  const response = await kernel.handle(req("rq-ack"));
  const operationId = latestOperationId(authority);
  await waitMacrotask();
  assert.equal(response.status, 500);
  assert.equal(errorOf(response), "internal_error");
  assert.equal(authority.status(operationId).kind, "DELIVERY_UNKNOWN");
  authority.throwAll = false;
  authority.throwFor.delete(operationId);
  assert.notEqual(authority.acknowledgeMinted(operationId), "acknowledged");
});

test("kernel: acknowledge throw on A leaves concurrent B acknowledged", async () => {
  const authority = new SelectiveThrowAck();
  let releaseB;
  const gate = new Promise((resolve) => {
    releaseB = resolve;
  });
  let calls = 0;
  const kernel = createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      audit: { runtimeReport: true },
    }],
    dispatch: {
      pay: async ({ getSecret }) => {
        getSecret("db.main", () => {});
        calls += 1;
        if (calls === 1) {
          await gate;
        }
        return { body: { ok: true } };
      },
    },
    secretsProvider: countingProvider(),
    releaseAuthority: authority,
    auditSink: new InMemoryAuditSink(),
  });
  const pendingB = kernel.handle(req("rq-B"));
  await waitMacrotask();
  const operationB = latestOperationId(authority);
  assert.equal(authority.status(operationB).kind, "RELEASED_UNACKED");
  authority.throwIfNot = operationB;
  const responseA = await kernel.handle(req("rq-A"));
  const operationA = authority.auditEvents().map((e) => e.operationId).find((id) => id !== operationB) ?? "";
  await waitMacrotask();
  assert.equal(responseA.status, 500);
  assert.equal(authority.status(operationA).kind, "DELIVERY_UNKNOWN");
  assert.equal(authority.status(operationB).kind, "RELEASED_UNACKED");
  releaseB();
  const responseB = await pendingB;
  await waitMacrotask();
  assert.equal(responseB.status, 200);
  assert.equal(authority.status(operationB).kind, "RELEASED_ACKED");
  assert.equal(authority.status(operationA).kind, "DELIVERY_UNKNOWN");
});

function acceptingSink() {
  const events = [];
  return {
    reserve() {
      return { id: 1 };
    },
    commit(_reservation, event) {
      events.push(event);
    },
    cancel() {},
    emit(event) {
      events.push(event);
    },
    events,
  };
}

function payKernel(authority, sink) {
  return createAppKernel({
    routes: [{
      method: "GET",
      path: "/pay",
      handler: "pay",
      auth: { mode: "public" },
      secrets: { require: ["db.main"] },
      audit: { runtimeReport: true },
    }],
    dispatch: {
      pay: ({ getSecret }) => {
        getSecret("db.main", () => {});
        return { body: { ok: true } };
      },
    },
    secretsProvider: countingProvider(),
    releaseAuthority: authority,
    auditSink: sink,
  });
}

test("kernel: acknowledge throw commits audit status 500 origin kernel", async () => {
  const authority = new SelectiveThrowAck();
  const sink = acceptingSink();
  const kernel = payKernel(authority, sink);
  authority.throwAll = true;
  const response = await kernel.handle(req("rq-ack-audit"));
  await waitMacrotask();
  assert.equal(response.status, 500);
  assert.equal(errorOf(response), "internal_error");
  assert.equal(sink.events.length, 1);
  assert.equal(sink.events[0].status, 500);
  assert.equal(sink.events[0].origin, "kernel");
  const operationId = latestOperationId(authority);
  assert.equal(authority.status(operationId).kind, "DELIVERY_UNKNOWN");
});

class OutcomeAck extends ReleaseCommitAuthority {
  constructor(outcome) {
    super();
    this.outcome = outcome;
  }
  acknowledgeMinted() {
    return this.outcome;
  }
}

for (const outcome of ["released", "fenced", "replay", "stale", "missing", "delivery-unknown"]) {
  test(`kernel: acknowledge ${outcome} is HTTP 500 and never acknowledged`, async () => {
    const authority = new OutcomeAck(outcome);
    const sink = acceptingSink();
    const kernel = payKernel(authority, sink);
    const response = await kernel.handle(req(`rq-out-${outcome}`));
    await waitMacrotask();
    const operationId = latestOperationId(authority);
    assert.equal(response.status, 500);
    assert.equal(errorOf(response), "internal_error");
    assert.equal(sink.events[0].status, 500);
    assert.equal(sink.events[0].origin, "kernel");
    assert.notEqual(authority.status(operationId).kind, "RELEASED_ACKED");
    assert.notEqual(authority.acknowledgeMinted(operationId), "acknowledged");
  });
}

test("kernel: acknowledge unrecognized outcome is HTTP 500 and never acknowledged", async () => {
  const authority = new OutcomeAck("nope");
  const sink = acceptingSink();
  const kernel = payKernel(authority, sink);
  const response = await kernel.handle(req("rq-out-nope"));
  await waitMacrotask();
  const operationId = latestOperationId(authority);
  assert.equal(response.status, 500);
  assert.equal(errorOf(response), "internal_error");
  assert.equal(sink.events[0].status, 500);
  assert.notEqual(authority.status(operationId).kind, "RELEASED_ACKED");
});

class PostCommitThrowAck extends ReleaseCommitAuthority {
  acknowledgeMinted(operationId) {
    super.acknowledgeMinted(operationId);
    throw new Error("post-commit-throw");
  }
}

test("kernel: acknowledgeMinted throw after setting acknowledged is HTTP 500 audit 500", async () => {
  const authority = new PostCommitThrowAck();
  const sink = acceptingSink();
  const kernel = payKernel(authority, sink);
  const response = await kernel.handle(req("rq-post-commit-throw"));
  await waitMacrotask();
  assert.equal(response.status, 500);
  assert.equal(errorOf(response), "internal_error");
  assert.equal(sink.events.length, 1);
  assert.equal(sink.events[0].status, 500);
  assert.equal(sink.events[0].origin, "kernel");
  // N3 blocked: markUnknown is a no-op once acknowledgeMinted has set "acknowledged".
  // Leftover status stays RELEASED_ACKED. Un-ack needs release-commit-point.ts.
});

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

function kernelMutantProbe(kernelHref) {
  return [
    "import assert from 'node:assert/strict';",
    `import { createAppKernel } from ${JSON.stringify(kernelHref)};`,
    `import { ReleaseCommitAuthority } from ${JSON.stringify(new URL("./secret-gate.js", kernelHref).href)};`,
    "const SYNTHETIC = [0x53, 0x45, 0x43, 0x52, 0x45, 0x54];",
    "const dec = new TextDecoder();",
    "function req(requestId) {",
    "  return { method: 'GET', path: '/pay', headers: {}, body: new Uint8Array(0), query: {}, requestId, receivedAt: 0 };",
    "}",
    "function errorOf(res) {",
    "  if (res.body === undefined) return undefined;",
    "  return JSON.parse(dec.decode(res.body)).error;",
    "}",
    "class SelectiveThrowAck extends ReleaseCommitAuthority {",
    "  acknowledgeMinted() { throw new Error('forced-ack'); }",
    "}",
    "class OutcomeAck extends ReleaseCommitAuthority {",
    "  acknowledgeMinted() { return 'stale'; }",
    "}",
    "class PostCommitThrowAck extends ReleaseCommitAuthority {",
    "  acknowledgeMinted(operationId) {",
    "    super.acknowledgeMinted(operationId);",
    "    throw new Error('post-commit-throw');",
    "  }",
    "}",
    "function countingProvider() {",
    "  return { has() { return true; }, use(_n, fn) { fn(new Uint8Array(SYNTHETIC)); }, revocationEpoch() { return 0; } };",
    "}",
    "function acceptingSink() {",
    "  const events = [];",
    "  return { reserve() { return { id: 1 }; }, commit(_r, e) { events.push(e); }, cancel() {}, emit(e) { events.push(e); }, events };",
    "}",
    "function payKernel(authority, sink) {",
    "  return createAppKernel({",
    "    routes: [{ method: 'GET', path: '/pay', handler: 'pay', auth: { mode: 'public' }, secrets: { require: ['db.main'] }, audit: { runtimeReport: true } }],",
    "    dispatch: { pay: ({ getSecret }) => { getSecret('db.main', () => {}); return { body: { ok: true } }; } },",
    "    secretsProvider: countingProvider(),",
    "    releaseAuthority: authority,",
    "    auditSink: sink,",
    "  });",
    "}",
    "const mode = process.argv[2];",
    "const sink = acceptingSink();",
    "if (mode === 'n1') {",
    "  const kernel = payKernel(new SelectiveThrowAck(), sink);",
    "  const response = await kernel.handle(req('rq-n1'));",
    "  assert.equal(response.status, 500);",
    "  assert.equal(errorOf(response), 'internal_error');",
    "  assert.equal(sink.events[0].status, 500);",
    "  assert.equal(sink.events[0].origin, 'kernel');",
    "} else if (mode === 'n2') {",
    "  const kernel = payKernel(new OutcomeAck(), sink);",
    "  const response = await kernel.handle(req('rq-n2'));",
    "  assert.equal(response.status, 500);",
    "  assert.equal(sink.events[0].status, 500);",
    "} else if (mode === 'n3') {",
    "  const authority = new PostCommitThrowAck();",
    "  const kernel = payKernel(authority, sink);",
    "  const response = await kernel.handle(req('rq-n3'));",
    "  assert.equal(response.status, 500);",
    "  assert.equal(sink.events[0].status, 500);",
    "  const id = authority.auditEvents().at(-1)?.operationId ?? '';",
    "  assert.notEqual(authority.status(id).kind, 'RELEASED_ACKED');",
    "} else {",
    "  throw new Error('unknown mode');",
    "}",
    "",
  ].join("\n");
}

function runKernelMutant(id, mutate, mode) {
  const dir = mkdtempSync(join(tmpdir(), `galerina-q24-${id}-`));
  try {
    cpSync(distDir, join(dir, "dist"), { recursive: true });
    const kernelPath = join(dir, "dist", "kernel.js");
    const original = readFileSync(kernelPath, "utf8");
    const mutated = mutate(original);
    assert.notEqual(mutated, original, `${id} must change kernel.js`);
    writeFileSync(kernelPath, mutated);
    const probePath = join(dir, "probe.mjs");
    writeFileSync(probePath, kernelMutantProbe(pathToFileURL(kernelPath).href));
    const run = spawnSync(process.execPath, [probePath, mode], { encoding: "utf8" });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("mutant: audit before finalize goes red", () => {
  const run = runKernelMutant("audit-before-finalize", (src) => {
    const block = `            try {
                outcome.finalizeSecretRelease?.(publicationOk);
            }
            catch {
                response = errorResponse(500, "internal_error", "Handler failed.");
            }
            const event = {`;
    const swapped = `            const event = {`;
    assert.equal(src.includes(block), true);
    return src.replace(block, swapped);
  }, "n1");
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

test("mutant: ignore ack outcome goes red", () => {
  const run = runKernelMutant("ignore-ack-outcome", (src) => {
    const needle = `                switch (outcome) {
                    case "acknowledged":
                        return;`;
    const swapped = `                return;
                switch (outcome) {
                    case "acknowledged":
                        return;`;
    assert.equal(src.includes(needle), true);
    return src.replace(needle, swapped);
  }, "n2");
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});

test("mutant: leave acknowledged on post-commit throw is blocked", () => {
  const run = runKernelMutant("leave-acked-post-commit-throw", (src) => {
    const needle = `                catch {
                    noteUnknownBestEffort();
                    throw new Error("GALERINA_SECRET_ACKNOWLEDGE_FAILED");
                }`;
    const swapped = `                catch {
                    throw new Error("GALERINA_SECRET_ACKNOWLEDGE_FAILED");
                }`;
    assert.equal(src.includes(needle), true);
    return src.replace(needle, swapped);
  }, "n3");
  // Both mutated and original leave RELEASED_ACKED: markUnknown cannot un-ack.
  assert.notEqual(run.status, 0, run.stderr + run.stdout);
});
