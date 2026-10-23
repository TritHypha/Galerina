// S6-R6 (closure path S6, RD-1413 O2/O3; round check gcw-s6rc F2 survivors + S6-R4 ordering finding)
// (gcw-s6f, 2026-10-23). RED FIRST on f6f1fa71.
// R6a (KM3): an unloadable / tampered query-custody artifact answers EXACTLY 503 internal_error
//      (server-side unavailability), never 422 (a client refusal), and never enters the provider.
// R6b (LM2): a Record with no raw pair custody is observed as custodyToken 1 (UNKNOWN) on its own,
//      not only through the record token. Pinned on the observation vector and on a synthetic
//      WebAssembly export that echoes the custody token.
// R6c (AM1): api-server hands the kernel the ORDERED RAW pairs, not entries re-derived from the
//      Record (integer-like names are reordered by a Record; only raw pairs keep wire order).
// R6d (S6-R4 ordering): a missing Idempotency-Key is refused (409) before the secrets provider is
//      touched. Zero-trust choice: a pure request-shape refusal precedes any external entry.
// Synthetic data only. The SecretsProvider is a synthetic counter (S6 rule).
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const AK = join(REPO, "packages-ts", "galerina-framework-app-kernel");
const AK_INDEX_JS = join(AK, "dist", "index.js");
const LOADER_JS = join(AK, "dist", "fungi-query-custody-loader.js");
const API_INDEX_JS = join(REPO, "packages-ts", "galerina-framework-api-server", "dist", "index.js");

function syntheticProvider(counter) {
  return {
    has: (n) => { counter.has += 1; return n === "SYN_VERIFY_KEY"; },
    use: (_n, fn) => { counter.use += 1; fn(new Uint8Array([7, 7, 7])); },
    revocationEpoch: () => 3,
  };
}
function routes() {
  return [
    { method: "POST", path: "/auth/verify", handler: "verify", auth: { mode: "public" }, secrets: { require: ["SYN_VERIFY_KEY"] } },
    { method: "POST", path: "/x/verify", handler: "verify", auth: { mode: "public" }, secrets: { require: ["SYN_VERIFY_KEY"] } },
    { method: "GET", path: "/syn", handler: "syn", auth: { mode: "public" } },
  ];
}
function kernelWith(createAppKernel, counter, ran, seen = []) {
  return createAppKernel({
    routes: routes(),
    dispatch: {
      verify: ({ getSecret }) => { ran.verify += 1; getSecret("SYN_VERIFY_KEY", () => undefined); return { body: { ok: true } }; },
      syn: ({ request }) => { ran.syn += 1; seen.push(request.queryCustody); return { body: { ok: true } }; },
    },
    secretsProvider: syntheticProvider(counter),
  });
}
let N = 0;
function verifyReq(extraHeaders = { "idempotency-key": "syn-r6-" + (++N) }) {
  N += 1;
  return { method: "POST", path: "/auth/verify", headers: extraHeaders, body: new Uint8Array(0), query: { object: "a" }, queryCustody: [["object", "a"]], requestId: "rq-s6-r6-" + N, receivedAt: 0 };
}

/** A throwaway copy of the built app-kernel package (dist + assets + package.json; node_modules linked)
 *  so the shipped asset can be tampered without touching the repo tree. */
function kernelCopy() {
  const root = mkdtempSync(join(tmpdir(), "gcw-s6f-ak-"));
  cpSync(join(AK, "dist"), join(root, "dist"), { recursive: true });
  cpSync(join(AK, "assets"), join(root, "assets"), { recursive: true });
  writeFileSync(join(root, "package.json"), readFileSync(join(AK, "package.json")));
  symlinkSync(join(AK, "node_modules"), join(root, "node_modules"), "dir");
  return root;
}

test("S6-R6a (KM3) unloadable query-custody artifact answers exactly 503 internal_error, provider 0; control copy admits", async () => {
  const cases = [
    ["control (genuine copy)", () => {}],
    ["tampered byte", (p) => { const b = readFileSync(p); b[b.length - 1] ^= 0x01; writeFileSync(p, b); }],
    ["missing asset", (p) => unlinkSync(p)],
    ["empty asset", (p) => writeFileSync(p, new Uint8Array(0))],
  ];
  for (const [label, damage] of cases) {
    const root = kernelCopy();
    try {
      damage(join(root, "assets", "query-custody.wasm"));
      const { createAppKernel } = await import(pathToFileURL(join(root, "dist", "index.js")).href + "?r6a=" + encodeURIComponent(label));
      const counter = { has: 0, use: 0 };
      const ran = { verify: 0, syn: 0 };
      const kernel = kernelWith(createAppKernel, counter, ran);
      const res = await kernel.handle(verifyReq());
      if (label.startsWith("control")) {
        assert.equal(res.status, 200, label + ": the copied kernel delivers, so the refusals below are attributable");
        continue;
      }
      assert.equal(res.status, 503, label + ": unavailable verdict must be 503 (server-side), never 422");
      const text = typeof res.body === "string" ? res.body : Buffer.from(res.body ?? new Uint8Array(0)).toString("utf8");
      assert.match(text, /internal_error/, label + ": registered code internal_error");
      assert.equal(ran.verify, 0, label + ": handler never runs");
      assert.equal(counter.has + counter.use, 0, label + ": provider never entered");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

// ---- synthetic hand-assembled WebAssembly (same encoder as S6-R5) ----
function uleb(n) { const out = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n); return out; }
function str(s) { const b = [...Buffer.from(s, "utf8")]; return [...uleb(b.length), ...b]; }
function section(id, body) { return [id, ...uleb(body.length), ...body]; }
function wasm(body) {
  const type = [0x60, ...uleb(10), ...Array(10).fill(0x7f), 0x01, 0x7f];
  const out = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  out.push(...section(1, [0x01, ...type]));
  out.push(...section(3, [0x01, 0x00]));
  out.push(...section(7, [0x01, ...str("admitQueryCustody"), 0x00, 0x00]));
  const fbody = [0x00, ...body, 0x0b];
  out.push(...section(10, [0x01, ...uleb(fbody.length), ...fbody]));
  return new Uint8Array(out);
}
const sha = (b) => createHash("sha256").update(b).digest("hex");

test("S6-R6b (LM2) Record-only query is custodyToken 1 (UNKNOWN) by itself: vector pin + echoing export refuses", async () => {
  const { observeQueryCustody, loadFungiQueryCustody } = await import(pathToFileURL(LOADER_JS).href);
  for (const q of [{ object: "a" }, {}]) {
    const v = observeQueryCustody({ query: q });
    assert.equal(v.length, 10);
    assert.equal(v[0], 0, "custodyClass Present");
    assert.equal(v[1], 1, "custodyToken must be 1 (UNKNOWN) when no raw pair custody exists");
  }
  assert.deepEqual(observeQueryCustody({ query: { object: "a" }, queryCustody: [["object", "a"]] }), [0, 0, 0, 1, 0, 0, 0, 0, 0, 0], "control vector");
  const echo = wasm([0x20, 0x01]); // return custodyToken
  const r = loadFungiQueryCustody({ wasmBytes: echo, expectedSha256: sha(echo) });
  assert.equal(r.ok, true);
  assert.equal(r.custody.verdict({ query: { object: "a" } }), "refuse", "Record-only refuses on the custody token alone");
  assert.equal(r.custody.verdict({ query: { object: "a" }, queryCustody: [["object", "a"]] }), "admit", "control: custody present");
});

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.end();
  });
}

test("S6-R6c (AM1) api-server hands over the ORDERED RAW pairs (integer-like names keep wire order)", async () => {
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  const { createApiServer, listen } = await import(pathToFileURL(API_INDEX_JS).href);
  const counter = { has: 0, use: 0 };
  const ran = { verify: 0, syn: 0 };
  const seen = [];
  const server = createApiServer({ allowInsecureLoopback: true, kernel: kernelWith(createAppKernel, counter, ran, seen) });
  const { port } = await listen(server, 0);
  try {
    assert.equal(await get(port, "/syn?b=1&2=x&a=3&10=y"), 200);
  } finally {
    await new Promise((r) => server.close(() => r(undefined)));
  }
  assert.equal(seen.length, 1);
  const custody = seen[0];
  assert.deepEqual(custody.map((p) => [p[0], p[1]]), [["b", "1"], ["2", "x"], ["a", "3"], ["10", "y"]], "wire order, not Record order");
  assert.equal(Object.isFrozen(custody), true);
  for (const p of custody) assert.equal(Object.isFrozen(p), true, "each raw pair is frozen");
});

test("S6-R6d (S6-R4 ordering) missing Idempotency-Key refuses 409 before the secrets provider is touched", async () => {
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  for (const [path, headers] of [["/auth/verify", {}], ["/auth/verify", { "idempotency-key": "" }], ["/x/verify", {}]]) {
    const counter = { has: 0, use: 0 };
    const ran = { verify: 0, syn: 0 };
    const kernel = kernelWith(createAppKernel, counter, ran);
    const res = await kernel.handle({ ...verifyReq(headers), path });
    assert.equal(res.status, 409, path + ": missing key is a 409");
    assert.equal(ran.verify, 0, path + ": handler never runs");
    assert.equal(counter.has + counter.use, 0, path + ": provider never entered before the 409");
  }
  const counter = { has: 0, use: 0 };
  const ran = { verify: 0, syn: 0 };
  const res = await kernelWith(createAppKernel, counter, ran).handle(verifyReq());
  assert.equal(res.status, 200, "control: with a key the route delivers");
  assert.equal(ran.verify, 1);
});