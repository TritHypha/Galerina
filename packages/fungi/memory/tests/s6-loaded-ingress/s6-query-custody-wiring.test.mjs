// S6-R3 (closure path S6, RD-1413 O2/O3): kernel wiring of the pinned Fungi query-custody verdict (gcw-s6d, 2026-10-23).
// Positive controls prove R1 refusals are attributable to the verdict (not a blanket refusal), plus host-side
// observation faults (wrong custody shape, throwing getter, Record/custody mismatch) and artifact pin parity.
// Synthetic data only. The SecretsProvider is a synthetic counter (S6 rule).
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basename, dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const AK = join(REPO, "packages-ts", "galerina-framework-app-kernel");
const AK_INDEX_JS = join(AK, "dist", "index.js");
const API_INDEX_JS = join(REPO, "packages-ts", "galerina-framework-api-server", "dist", "index.js");
const LOADER_JS = join(AK, "dist", "fungi-query-custody-loader.js");
const ASSET = join(AK, "assets", "query-custody.wasm");
const GALERINA = join(REPO, "galerina.mjs");

function syntheticProvider(counter) {
  return {
    has: (n) => { counter.has += 1; return n === "SYN_VERIFY_KEY"; },
    use: (_n, fn) => { counter.use += 1; fn(new Uint8Array([7, 7, 7])); },
    revocationEpoch: () => 3,
  };
}
function kernelFor(createAppKernel, counter, ran) {
  return createAppKernel({
    routes: [{ method: "POST", path: "/auth/verify", handler: "verify", auth: { mode: "public" }, secrets: { require: ["SYN_VERIFY_KEY"] } }],
    dispatch: { verify: ({ getSecret }) => { ran.verify += 1; getSecret("SYN_VERIFY_KEY", () => undefined); return { body: { ok: true } }; } },
    secretsProvider: syntheticProvider(counter),
  });
}
let IDEM = 0;
function direct(kernel, query, extra) {
  return kernel.handle({ method: "POST", path: "/auth/verify", headers: { "idempotency-key": "syn-r3-" + (++IDEM) }, body: new Uint8Array(0), query, requestId: "rq-s6-r3-" + IDEM, receivedAt: 0, ...extra });
}

test("S6-R3a positive control: /auth/verify with matching raw custody delivers (direct and loopback)", async () => {
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  const { createApiServer, listen } = await import(pathToFileURL(API_INDEX_JS).href);
  const counter = { has: 0, use: 0 };
  const ran = { verify: 0 };
  const kernel = kernelFor(createAppKernel, counter, ran);
  for (const [q, c] of [[{}, []], [{ object: "a" }, [["object", "a"]]], [{ object: "a", version: "1" }, [["object", "a"], ["version", "1"]]]]) {
    const res = await direct(kernel, q, { queryCustody: c });
    assert.equal(res.status, 200, JSON.stringify(c));
  }
  const server = createApiServer({ allowInsecureLoopback: true, kernel });
  const { port } = await listen(server, 0);
  try {
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, method: "POST", path: "/auth/verify?object=a&version=1", headers: { "idempotency-key": "syn-r3-loop" } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 200, "loopback well-formed query delivers");
  } finally {
    await new Promise((r) => server.close(() => r(undefined)));
  }
  assert.equal(ran.verify, 4);
});

test("S6-R3b host observation faults refuse before the provider: mismatch, wrong shape, throwing getter, unknown/repeat names", async () => {
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  const throwing = {};
  Object.defineProperty(throwing, "queryCustody", { get() { throw new Error("syn"); }, enumerable: true });
  const cases = [
    ["Record value differs", { object: "b" }, { queryCustody: [["object", "a"]] }],
    ["Record has extra key", { object: "a", version: "1" }, { queryCustody: [["object", "a"]] }],
    ["Record missing key", {}, { queryCustody: [["object", "a"]] }],
    ["custody not array", { object: "a" }, { queryCustody: { 0: ["object", "a"], length: 1 } }],
    ["pair wrong arity", { object: "a" }, { queryCustody: [["object", "a", "x"]] }],
    ["pair value not string", { object: "1" }, { queryCustody: [["object", 1]] }],
    ["custody null", { object: "a" }, { queryCustody: null }],
    ["custody getter throws", { object: "a" }, throwing],
    ["repeat in custody", { object: "b" }, { queryCustody: [["object", "a"], ["object", "b"]] }],
    ["alias name v", { v: "2" }, { queryCustody: [["v", "2"]] }],
    ["case-folded name", { OBJECT: "a" }, { queryCustody: [["OBJECT", "a"]] }],
    ["Record is array", ["a"], { queryCustody: [["0", "a"]] }],
  ];
  for (const [label, query, extra] of cases) {
    const counter = { has: 0, use: 0 };
    const ran = { verify: 0 };
    const kernel = kernelFor(createAppKernel, counter, ran);
    const req = { method: "POST", path: "/auth/verify", headers: { "idempotency-key": "syn-r3b-" + (++IDEM) }, body: new Uint8Array(0), query, requestId: "rq-r3b", receivedAt: 0 };
    for (const k of Object.keys(extra)) Object.defineProperty(req, k, Object.getOwnPropertyDescriptor(extra, k));
    const res = await kernel.handle(req);
    assert.notEqual(res.status, 200, label);
    assert.equal(ran.verify, 0, label + ": handler never runs");
    assert.equal(counter.has + counter.use, 0, label + ": provider never entered");
  }
});

test("S6-R3c loader: pinned asset hashes to the compiled-in pin and equals a fresh build of flattened query-custody.fungi", async () => {
  assert.equal(existsSync(LOADER_JS), true, "loader not built: " + LOADER_JS);
  const m = await import(pathToFileURL(LOADER_JS).href);
  const asset = new Uint8Array(readFileSync(ASSET));
  assert.equal(createHash("sha256").update(asset).digest("hex"), m.QUERY_CUSTODY_SHA256);
  const unit = readFileSync(join(MEM, "src", "query-custody.fungi"), "utf8");
  const parts = unit.split("\nimport \"./c-boundary.fungi\"\n");
  assert.equal(parts.length, 2);
  const strip = (s) => s.slice(s.indexOf("@version 1") + 10);
  const dir = mkdtempSync(join(tmpdir(), "s6r3c-"));
  const file = join(dir, basename(dir).replace(/[^A-Za-z0-9]/g, "") + ".fungi");
  const name = basename(file, ".fungi");
  writeFileSync(file, readFileSync(join(MEM, "src", "c-boundary.fungi"), "utf8") + "\n" + strip(parts.join("\n")));
  const outs = ["wasm", "wat", "lmanifest", "lmanifest.json", "governance-impact.json"].map((e) => join(REPO, "build", name + "." + e));
  try {
    const r = spawnSync(process.execPath, [GALERINA, "build", file], { encoding: "utf8", cwd: REPO, timeout: 180000 });
    assert.equal(r.status, 0, (r.stdout || "") + (r.stderr || ""));
    assert.deepEqual(new Uint8Array(readFileSync(outs[0])), asset, "asset equals fresh build");
  } finally {
    for (const p of outs) rmSync(p, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S6-R3d loader refuses tampered, empty, wrong-pin, non-byte and lying artifacts as unavailable (never admit)", async () => {
  const m = await import(pathToFileURL(LOADER_JS).href);
  const asset = new Uint8Array(readFileSync(ASSET));
  const flipped = new Uint8Array(asset); flipped[flipped.length - 1] ^= 1;
  const good = { query: { object: "a" }, queryCustody: [["object", "a"]] };
  const ok = m.loadFungiQueryCustody({ wasmBytes: asset, expectedSha256: m.QUERY_CUSTODY_SHA256 });
  assert.equal(ok.ok, true);
  assert.equal(ok.custody.verdict(good), "admit");
  for (const [label, input] of [
    ["tampered", { wasmBytes: flipped, expectedSha256: m.QUERY_CUSTODY_SHA256 }],
    ["tampered with own pin", { wasmBytes: flipped, expectedSha256: createHash("sha256").update(flipped).digest("hex") }],
    ["empty", { wasmBytes: new Uint8Array(0), expectedSha256: m.QUERY_CUSTODY_SHA256 }],
    ["bad pin", { wasmBytes: asset, expectedSha256: "00" }],
    ["string bytes", { wasmBytes: "query-custody.wasm", expectedSha256: m.QUERY_CUSTODY_SHA256 }],
    ["undefined", undefined],
  ]) {
    const r = m.loadFungiQueryCustody(input);
    assert.equal(r.ok, false, label);
    assert.equal(r.custody.verdict(good), "unavailable", label);
  }
  // A module whose admitQueryCustody always returns 0 (hand-assembled, synthetic) only loads under its own pin;
  // the kernel never takes a pin from outside, so this proves the pin, not the module, is the gate.
  const always0 = new Uint8Array([0,97,115,109,1,0,0,0,1,14,1,96,10,127,127,127,127,127,127,127,127,127,127,1,127,3,2,1,0,7,21,1,17,97,100,109,105,116,81,117,101,114,121,67,117,115,116,111,100,121,0,0,10,6,1,4,0,65,0,11]);
  const own = m.loadFungiQueryCustody({ wasmBytes: always0, expectedSha256: m.QUERY_CUSTODY_SHA256 });
  assert.equal(own.ok, false, "a lying module never matches the compiled-in pin");
});