// e2e.test.mjs — the canonical scaffold -> fuse -> kernel -> serve proof for the
// "hello, governed world" app. Nothing is mocked:
//
//   scaffold  `galerina new app <tmp>` emits this exact golden layout (asserted).
//   fuse      fusePackage admits the SIGNED greeting.wasm fail-closed (sha256 pin +
//             Ed25519 signature VERIFIED — no allowUnsigned) and invoke("main") runs
//             the governed wasm, returning the HTTP status 200.
//   kernel    createAppKernel routes GET /hello to the fused compute; the secure
//             defaults still 404 an unknown path and 401 an auth-required route with
//             no channel verdict (zero-trust, fail-closed).
//   serve     createApiServer + listen(0) drive a REAL socket end-to-end: GET /hello
//             returns 200 + {message, status} JSON.

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, existsSync, readFileSync, cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { createAppKernel, fusePackage } from "../../galerina-framework-app-kernel/dist/index.js";
import {
  paths,
  loadConfig,
  fuseGreeting,
  createGreetingKernel,
  startServer,
} from "../dist/server.js";

const SCAFFOLDER = fileURLToPath(new URL("../../../scripts/galerina-new.mjs", import.meta.url));

// ── helpers ───────────────────────────────────────────────────────────────────
function withTempDir(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-e2e-"));
  try {
    return fn(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** Fire one request through the socket and collect the full response. */
function request(port, { method, path, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }),
      );
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

// ── scaffold ────────────────────────────────────────────────────────────────────
test("scaffold: `galerina new app` emits the runnable golden layout", () => {
  withTempDir((base) => {
    const target = join(base, "my-app");
    const r = spawnSync(process.execPath, [SCAFFOLDER, "app", target], { encoding: "utf8", shell: false });
    assert.equal(r.status, 0, `scaffold should succeed:\n${r.stderr}`);

    for (const rel of [
      "src/App.spore",
      "src/flows/greeting.spore",
      "App.manifest",
      "config/app.config.json",
      "host/server.ts",
      "host/config.ts",
      "packages/greeting/package.spore.json",
      "packages/greeting/src/index.spore",
      "tests/e2e.test.mjs",
      "package.json",
      "tsconfig.json",
      "deps/README.md",
      "proofs/README.md",
      "README.md",
      ".gitignore",
    ]) {
      assert.ok(existsSync(join(target, rel)), `expected ${rel} to be scaffolded`);
    }

    // Deny-by-default: the emitted app and its compute package grant nothing.
    const manifest = JSON.parse(readFileSync(join(target, "App.manifest"), "utf8"));
    assert.equal(manifest.kind, "app");
    assert.deepEqual(manifest.capabilities, [], "app capabilities default to []");
    const pkg = JSON.parse(readFileSync(join(target, "packages/greeting/package.spore.json"), "utf8"));
    assert.deepEqual(pkg.capabilities, [], "greeting package grants no capabilities");
  });
});

// ── fuse ──────────────────────────────────────────────────────────────────────
test("fuse: the SIGNED greeting wasm is admitted VERIFIED (no allowUnsigned) and invoke('main') => 200", async () => {
  // No allowUnsigned: this only passes because the manifest's Ed25519 signature
  // verifies against the repo governance public key — real signed admission.
  const greeting = await fusePackage(paths.greetingDir, { governanceDir: paths.governanceDir, warn: () => {} });
  assert.equal(greeting.name, "greeting");
  assert.deepEqual(greeting.capabilities, [], "fused with NO capabilities (deny-by-default)");
  assert.equal(greeting.invoke("main"), 200, "the governed compute returns HTTP 200");
});

test("fuse: when App.manifest pins the greeting dep, the sha256 matches the built wasm byte-for-byte", () => {
  const manifest = JSON.parse(readFileSync(paths.manifestPath, "utf8"));
  const wasm = readFileSync(join(paths.greetingDir, "dist", "greeting.wasm"));
  const actual = "sha256:" + createHash("sha256").update(wasm).digest("hex");
  const dep = (manifest.deps ?? []).find((d) => d.name === "greeting");
  if (dep) {
    // Pinned (this in-repo app): the declared hash MUST match the binary exactly.
    assert.equal(dep.sha256, actual, "the declared sha256 matches the built wasm byte-for-byte");
    assert.ok(typeof dep.signer === "string" && dep.signer.length > 0, "a signer key id is declared");
  } else {
    // A fresh scaffold starts deny-by-default (deps []); the user pins after building.
    assert.ok(wasm.length > 0, "the greeting wasm is built and ready to be pinned into deps[]");
  }
});

test("fuse: a REVOKED signing key is refused at app fusion (revocation gate wired, fail-closed)", async () => {
  // The greeting is signed by the repo's ACTIVE key. This stands up a SEPARATE governance
  // dir that REVOKES that exact signer, then proves fuseGreeting refuses to fuse it — i.e.
  // the host injects the revocation gate. Without the injection the kernel runs NO
  // revocation check (Gate 2b only fires when a revocationCheck is passed), so this fusion
  // would WRONGLY succeed — which is the fail-open this test guards against.
  const greetingManifest = JSON.parse(
    readFileSync(join(paths.greetingDir, "dist", "greeting.lmanifest.json"), "utf8"),
  );
  const signerKeyId = greetingManifest.governanceSignature?.keyId;
  assert.ok(typeof signerKeyId === "string" && signerKeyId.length > 0, "greeting declares a signer key id");

  const base = mkdtempSync(join(tmpdir(), "galerina-revoke-"));
  try {
    // Full COPY of the repo governance dir (pubkeys + registry module + trust anchor) so
    // signature verification still has the signer's public key…
    const govDir = join(base, "governance");
    cpSync(paths.governanceDir, govDir, { recursive: true });

    // …but with the greeting's own signer added to the revocation list. That signer is also
    // the registry's pinned signer, so assertRegistryTrustworthy fails closed ("signed by a
    // REVOKED key") and the host's revocation gate refuses the fuse — fail-closed.
    const regPath = join(govDir, "revocations.json");
    const reg = JSON.parse(readFileSync(regPath, "utf8"));
    reg.revoked.push({
      keyId: signerKeyId, algorithm: "ed25519", revokedAt: "2026-06-24",
      reason: "test: revoke the greeting signer to assert the app-fusion revocation gate",
    });
    writeFileSync(regPath, JSON.stringify(reg, null, 2));

    await assert.rejects(
      () => fuseGreeting({ governanceDir: govDir }),
      (err) => /REVOK|REVOCATION/i.test(err.message),
      "fuseGreeting must refuse to fuse a package whose signing key is revoked",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// ── kernel ──────────────────────────────────────────────────────────────────────
test("kernel: GET /hello dispatches to the fused compute; unknown path 404s (fail-closed routing)", async () => {
  const config = loadConfig(paths.configPath);
  const greeting = await fuseGreeting();
  const kernel = createGreetingKernel(config, greeting);

  const ok = await kernel.handle({
    method: "GET", path: "/hello", headers: {}, body: new Uint8Array(),
    query: {}, requestId: "t1", receivedAt: 0,
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(ok.body)), {
    message: "hello, governed world", status: 200,
  });

  const missing = await kernel.handle({
    method: "GET", path: "/nope", headers: {}, body: new Uint8Array(),
    query: {}, requestId: "t2", receivedAt: 0,
  });
  assert.equal(missing.status, 404, "an undeclared route is refused, not served");
});

test("kernel: an auth-required route 401s with no channel verdict (zero-trust default)", async () => {
  // The secure default is auth: required; with no channelVerdict and no opt-in
  // fallback, the kernel denies BEFORE the handler runs.
  let ran = false;
  const kernel = createAppKernel({
    routes: [{ method: "GET", path: "/secure", handler: "secure" }],
    dispatch: { secure: () => { ran = true; return { status: 200 }; } },
  });
  const res = await kernel.handle({
    method: "GET", path: "/secure", headers: {}, body: new Uint8Array(),
    query: {}, requestId: "t3", receivedAt: 0,
  });
  assert.equal(res.status, 401, "required-auth route denies header-presence-only admission");
  assert.equal(ran, false, "the handler never ran (denied before dispatch)");
});

// ── serve ─────────────────────────────────────────────────────────────────────
test("serve: a REAL HTTP GET /hello through the api-server returns 200 + the greeting JSON", async () => {
  const config = loadConfig(paths.configPath);
  // Ephemeral port for the test.
  const started = await startServer({ ...config, http: { ...config.http, port: 0 } });
  try {
    const res = await request(started.port, { method: "GET", path: "/hello" });
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"] ?? "", /application\/json/);
    assert.deepEqual(JSON.parse(res.body), { message: "hello, governed world", status: 200 });

    const missing = await request(started.port, { method: "GET", path: "/nope" });
    assert.equal(missing.status, 404, "the transport funnels everything through the kernel's routing");
  } finally {
    await started.close();
  }
});
