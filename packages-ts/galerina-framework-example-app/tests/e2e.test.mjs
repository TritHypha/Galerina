// e2e.test.mjs — the canonical scaffold -> fuse -> kernel -> serve proof for the
// "hello, governed world" app. The socket, kernel and WASM execution are real;
// central registry admission uses an explicit test-only ALLOW fixture and is not
// evidence of production registry authorization.
//
//   scaffold  `galerina new app <tmp>` emits this exact golden layout (asserted).
//   fuse      fusePackage runs the greeting WASM under explicit test-only unsigned
//             mode plus a test registry ALLOW. It does not prove signed production
//             admission or registry authority.
//   kernel    createAppKernel routes GET /hello to the fused compute; the secure
//             defaults still 404 an unknown path and 401 an auth-required route with
//             no channel verdict (zero-trust, fail-closed).
//   serve     createApiServer + listen(0) drive a REAL socket end-to-end: GET /hello
//             returns 200 + {message, status} JSON.

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createAppKernel, fusePackage } from "../../galerina-framework-app-kernel/dist/index.js";
import {
  paths,
  loadConfig,
  fuseGreeting,
  createGreetingKernel,
  startServer,
} from "../dist/server.js";

const SCAFFOLDER = fileURLToPath(new URL("../../../scripts/galerina-new.mjs", import.meta.url));
const fixtureRegistryAllow = () => ({ ok: true });

async function withUnsignedFixtureOptions(run) {
  return run({
    governanceDir: paths.governanceDir,
    allowUnsigned: true,
    registryCheck: fixtureRegistryAllow,
  });
}

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
      "src/App.fungi",
      "src/flows/greeting.fungi",
      "App.manifest",
      "config/app.config.json",
      "host/server.ts",
      "host/config.ts",
      "packages/greeting/package.fungi.json",
      "packages/greeting/src/index.fungi",
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
    const pkg = JSON.parse(readFileSync(join(target, "packages/greeting/package.fungi.json"), "utf8"));
    assert.deepEqual(pkg.capabilities, [], "greeting package grants no capabilities");
  });
});

// ── fuse ──────────────────────────────────────────────────────────────────────
test("fuse: explicit dev/test admission runs the greeting WASM without claiming signature proof", async () => {
  await withUnsignedFixtureOptions(async (fixtureOptions) => {
    const registryRequests = [];
    const greeting = await fusePackage(paths.greetingDir, {
      ...fixtureOptions,
      registryCheck: (request) => {
        registryRequests.push(request);
        return { ok: true };
      },
      warn: () => {},
    });
    const manifest = JSON.parse(readFileSync(join(paths.greetingDir, "dist", "greeting.lmanifest.json"), "utf8"));
    assert.deepEqual(registryRequests, [{
      name: manifest.fuse.name,
      version: manifest.fuse.version,
      sourceHash: manifest.fuse.wasmSha256,
      keyId: manifest.governanceSignature.keyId,
    }], "central admission receives the exact package identity and artifact digest once");
    assert.equal(greeting.name, "greeting");
    assert.deepEqual(greeting.capabilities, [], "fused with NO capabilities (deny-by-default)");
    assert.equal(greeting.invoke("main"), 200, "the governed compute returns HTTP 200");
  });
});

test("fuse: the host forwards the exact greeting identity to the injected registry", async () => {
  await withUnsignedFixtureOptions(async (fixtureOptions) => {
    const registryRequests = [];
    const greeting = await fuseGreeting({
      ...fixtureOptions,
      registryCheck: (request) => {
        registryRequests.push(request);
        return { ok: true };
      },
    });
    const manifest = JSON.parse(readFileSync(join(paths.greetingDir, "dist", "greeting.lmanifest.json"), "utf8"));
    assert.deepEqual(registryRequests, [{
      name: manifest.fuse.name,
      version: manifest.fuse.version,
      sourceHash: manifest.fuse.wasmSha256,
      keyId: manifest.governanceSignature.keyId,
    }], "the host forwards the exact package identity and artifact digest once");
    assert.equal(greeting.invoke("main"), 200);
  });
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

test("fuse: a package key in a valid signed fixture revocation registry is refused", async () => {
  const greetingManifest = JSON.parse(
    readFileSync(join(paths.greetingDir, "dist", "greeting.lmanifest.json"), "utf8"),
  );
  const signerKeyId = greetingManifest.governanceSignature?.keyId;
  assert.ok(typeof signerKeyId === "string" && signerKeyId.length > 0, "greeting declares a signer key id");

  const base = mkdtempSync(join(tmpdir(), "galerina-revoke-"));
  try {
    const govDir = join(base, "governance");
    mkdirSync(govDir);
    copyFileSync(join(paths.governanceDir, "revocation-registry.mjs"), join(govDir, "revocation-registry.mjs"));

    const fixtureRootKeyId = "e2e-fixture-root";
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const registryModule = await import(pathToFileURL(join(govDir, "revocation-registry.mjs")).href);
    const registry = registryModule.signRegistryObject({
      schemaVersion: 1,
      appendOnly: true,
      revoked: [{
        keyId: signerKeyId, algorithm: "ed25519", revokedAt: "2026-06-24",
        reason: "test-only revocation fixture; no production key or authority",
      }],
    }, privateKey.export({ format: "pem", type: "pkcs8" }).toString(), fixtureRootKeyId);
    writeFileSync(
      join(govDir, `signing-key-${fixtureRootKeyId}.pub.pem`),
      publicKey.export({ format: "pem", type: "spki" }).toString(),
    );
    writeFileSync(join(govDir, "revocations.json"), JSON.stringify(registry, null, 2));
    writeFileSync(
      join(govDir, "trust-anchor.json"),
      JSON.stringify({ registrySigningRootKeyId: `mismatched-${fixtureRootKeyId}` }, null, 2),
    );

    await assert.rejects(
      () => fuseGreeting({ governanceDir: govDir, allowUnsigned: true, registryCheck: fixtureRegistryAllow }),
      /FUNGI-FUSE-REVOCATION-UNTRUSTED/,
      "a signed test registry with a mismatched pinned root is refused",
    );

    writeFileSync(
      join(govDir, "trust-anchor.json"),
      JSON.stringify({ registrySigningRootKeyId: fixtureRootKeyId }, null, 2),
    );

    await assert.rejects(
      () => fuseGreeting({ governanceDir: govDir, allowUnsigned: true, registryCheck: fixtureRegistryAllow }),
      /FUNGI-FUSE-KEY-REVOKED/,
      "a trusted test registry must refuse the package key even when its package signature is treated as unsigned",
    );
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("fuse: denied, malformed, or throwing registry decisions refuse before WASM instantiation", async () => {
  const instantiate = WebAssembly.instantiate;
  let instantiateCalls = 0;
  WebAssembly.instantiate = function (...args) {
    instantiateCalls += 1;
    return Reflect.apply(instantiate, this, args);
  };
  try {
    const cases = [
      ["deny", () => ({ ok: false, reason: "fixture denial" }), /FUNGI-FUSE-REGISTRY-DENIED/],
      ["malformed", () => ({ ok: "true" }), /FUNGI-FUSE-REGISTRY-DENIED/],
      ["throw", () => { throw new Error("fixture authority failure"); }, /fixture authority failure/],
    ];
    for (const [label, registryCheck, expected] of cases) {
      await assert.rejects(
        () => fuseGreeting({ governanceDir: paths.governanceDir, allowUnsigned: true, registryCheck }),
        expected,
        `${label} central-registry decision must refuse fusion`,
      );
    }
    assert.equal(instantiateCalls, 0, "no denied or invalid registry decision reaches WASM instantiation");
  } finally {
    WebAssembly.instantiate = instantiate;
  }
});

test("fuse: the host refuses without an injected central ALLOW authority", async () => {
  await assert.rejects(
    () => fuseGreeting(),
    /FUNGI-FUSE-REGISTRY-REQUIRED/,
    "the example host must not invent or default a package-registry ALLOW",
  );
});

test("fuse: allowUnsigned does not bypass an existing untrusted revocation registry", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "galerina-untrusted-governance-"));
  const governanceDir = join(rootDir, "governance");
  mkdirSync(governanceDir);
  writeFileSync(
    join(governanceDir, "revocation-registry.mjs"),
    'export function assertRegistryTrustworthy() { throw new Error("test: untrusted registry"); }\n' +
      'export function isKeyRevoked() { return false; }\n',
  );
  try {
    await assert.rejects(
      () => fuseGreeting({ governanceDir, allowUnsigned: true, registryCheck: fixtureRegistryAllow }),
      /FUNGI-FUSE-REVOCATION-UNTRUSTED/,
      "dev unsigned mode may not turn a present but untrusted registry into an absent revocation gate",
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("fuse: allowUnsigned does not bypass a missing registry inside an existing governance directory", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "galerina-incomplete-governance-"));
  const governanceDir = join(rootDir, "governance");
  mkdirSync(governanceDir);
  try {
    await assert.rejects(
      () => fuseGreeting({ governanceDir, allowUnsigned: true, registryCheck: fixtureRegistryAllow }),
      /FUNGI-FUSE-REVOCATION-UNTRUSTED/,
      "an existing but incomplete governance directory is not equivalent to an absent development directory",
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("fuse: explicit unsigned development admission remains available when governance is absent", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "galerina-no-governance-"));
  const governanceDir = join(rootDir, "governance");
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(String(message));
  try {
    const greeting = await fuseGreeting({
      governanceDir,
      allowUnsigned: true,
      registryCheck: fixtureRegistryAllow,
    });
    assert.equal(greeting.invoke("main"), 200);
    assert.ok(
      warnings.some((message) => message.includes("governance directory absent")),
      "the development-only governance absence is explicit in the warning",
    );
  } finally {
    console.warn = originalWarn;
    rmSync(rootDir, { recursive: true, force: true });
  }
});

// ── kernel ──────────────────────────────────────────────────────────────────────
test("kernel: GET /hello dispatches to the fused compute; unknown path 404s (fail-closed routing)", async () => {
  const config = loadConfig(paths.configPath);
  await withUnsignedFixtureOptions(async (fixtureOptions) => {
    const greeting = await fuseGreeting(fixtureOptions);
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
  await withUnsignedFixtureOptions(async (fixtureOptions) => {
    // Ephemeral port for the test.
    const started = await startServer(
      { ...config, http: { ...config.http, port: 0 } },
      fixtureOptions,
    );
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
});
