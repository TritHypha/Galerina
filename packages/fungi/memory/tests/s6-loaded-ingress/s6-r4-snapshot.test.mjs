// S6-R4 / S6-R5 (closure path S6, RD-1413 O2/O3; round check gcw-s6rc F1/F2) (gcw-s6e, 2026-10-23).
// R4: the query the Fungi verdict judged must be the exact query the handler receives. The kernel must
// read `query` and `queryCustody` once at step 2.5, verify a frozen copy, and dispatch only that copy.
// R5: loader integrity guards on synthetic hand-assembled WebAssembly (arity, pin, trap, non-zero).
// Synthetic data only. The SecretsProvider is a synthetic counter (S6 rule).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const AK = join(REPO, "packages-ts", "galerina-framework-app-kernel");
const AK_INDEX_JS = join(AK, "dist", "index.js");
const LOADER_JS = join(AK, "dist", "fungi-query-custody-loader.js");

function syntheticProvider(counter) {
  return {
    has: (n) => { counter.has += 1; return n === "SYN_VERIFY_KEY"; },
    use: (_n, fn) => { counter.use += 1; fn(new Uint8Array([7, 7, 7])); },
    revocationEpoch: () => 3,
  };
}
async function kernelSeeing(seen) {
  const { createAppKernel } = await import(pathToFileURL(AK_INDEX_JS).href);
  const counter = { has: 0, use: 0 };
  return createAppKernel({
    routes: [{ method: "POST", path: "/auth/verify", handler: "verify", auth: { mode: "public" }, secrets: { require: ["SYN_VERIFY_KEY"] } }],
    dispatch: { verify: ({ request, getSecret }) => {
      seen.push({ query: request.query, custody: request.queryCustody, frozenQuery: Object.isFrozen(request.query) });
      getSecret("SYN_VERIFY_KEY", () => undefined);
      return { body: { ok: true } };
    } },
    secretsProvider: syntheticProvider(counter),
  });
}
let IDEM = 0;
function baseReq() {
  IDEM += 1;
  return { method: "POST", path: "/auth/verify", headers: { "idempotency-key": "syn-r4-" + IDEM }, body: new Uint8Array(0), requestId: "rq-s6-r4-" + IDEM, receivedAt: 0 };
}
function keysOf(q) { return q === undefined || q === null ? [] : Object.keys(q).sort(); }

test("S6-R4a TOCTOU: a query getter that changes after the verdict never reaches the handler", async () => {
  const seen = [];
  const kernel = await kernelSeeing(seen);
  let qn = 0;
  const req = baseReq();
  Object.defineProperty(req, "query", { enumerable: true, get() { qn += 1; return qn === 1 ? { object: "a" } : { object: "a", evil: "1" }; } });
  req.queryCustody = [["object", "a"]];
  const res = await kernel.handle(req);
  if (res.status === 200) {
    assert.equal(seen.length, 1);
    assert.deepEqual(keysOf(seen[0].query), ["object"], "handler must see only the verified query");
  }
  assert.equal(qn, 1, "kernel must read request.query exactly once");
});

test("S6-R4b TOCTOU: a custody getter that changes after the verdict never reaches the handler", async () => {
  const seen = [];
  const kernel = await kernelSeeing(seen);
  let cn = 0;
  const req = baseReq();
  req.query = { object: "a" };
  Object.defineProperty(req, "queryCustody", { enumerable: true, get() { cn += 1; return cn === 1 ? [["object", "a"]] : [["object", "a"], ["evil", "1"]]; } });
  const res = await kernel.handle(req);
  assert.equal(res.status, 200, "control: the first read is a well-formed custody");
  assert.equal(cn, 1, "kernel must read request.queryCustody exactly once");
  assert.deepEqual(seen[0].custody.map((p) => p[0]), ["object"]);
});

test("S6-R4c the handler receives a frozen query copy (mutation after the verdict cannot widen it)", async () => {
  const seen = [];
  const kernel = await kernelSeeing(seen);
  const q = { object: "a" };
  const req = { ...baseReq(), query: q, queryCustody: [["object", "a"]] };
  const res = await kernel.handle(req);
  assert.equal(res.status, 200);
  assert.equal(seen[0].frozenQuery, true);
  assert.notEqual(seen[0].query, q, "dispatched query is the kernel's snapshot, not the caller's object");
});

test("S6-R4d a Proxy query whose get trap changes per read is judged and dispatched from one read", async () => {
  const seen = [];
  const kernel = await kernelSeeing(seen);
  let gets = 0;
  const target = { object: "a" };
  const proxy = new Proxy(target, { get(t, k) { if (k === "object") { gets += 1; return gets === 1 ? "a" : "b"; } return Reflect.get(t, k); } });
  const res = await kernel.handle({ ...baseReq(), query: proxy, queryCustody: [["object", "a"]] });
  if (res.status === 200) assert.equal(seen[0].query.object, "a", "handler sees the verified value");
  assert.equal(gets, 1, "each Record value is read once");
});

// ---- R5: synthetic hand-assembled WebAssembly for loader guards ----
function uleb(n) { const out = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n); return out; }
function str(s) { const b = [...Buffer.from(s, "utf8")]; return [...uleb(b.length), ...b]; }
function section(id, body) { return [id, ...uleb(body.length), ...body]; }
function wasm({ params = 10, body = [0x41, 0x00], withImport = false, name = "admitQueryCustody" } = {}) {
  const type = [0x60, ...uleb(params), ...Array(params).fill(0x7f), 0x01, 0x7f];
  const out = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  out.push(...section(1, [0x01, ...type]));
  if (withImport) out.push(...section(2, [0x01, ...str("m"), ...str("f"), 0x00, 0x00]));
  out.push(...section(3, [0x01, 0x00]));
  out.push(...section(7, [0x01, ...str(name), 0x00, withImport ? 0x01 : 0x00]));
  const fbody = [0x00, ...body, 0x0b];
  out.push(...section(10, [0x01, ...uleb(fbody.length), ...fbody]));
  return new Uint8Array(out);
}
const sha = (b) => createHash("sha256").update(b).digest("hex");
const okReq = { query: { object: "a" }, queryCustody: [["object", "a"]] };

test("S6-R5a control: a synthetic pinned 10-arg import-free export returning 0 loads and admits", async () => {
  const { loadFungiQueryCustody } = await import(pathToFileURL(LOADER_JS).href);
  const b = wasm();
  const r = loadFungiQueryCustody({ wasmBytes: b, expectedSha256: sha(b) });
  assert.equal(r.ok, true);
  assert.equal(r.custody.verdict(okReq), "admit");
});

test("S6-R5b loader guards: wrong arity, wrong pin, trapping or non-zero export never admit", async () => {
  const { loadFungiQueryCustody } = await import(pathToFileURL(LOADER_JS).href);
  for (const params of [9, 11, 0]) {
    const b = wasm({ params });
    const r = loadFungiQueryCustody({ wasmBytes: b, expectedSha256: sha(b) });
    assert.equal(r.ok, false, "arity " + params);
    assert.equal(r.custody.verdict(okReq), "unavailable");
  }
  const good = wasm();
  for (const pin of [sha(wasm({ body: [0x41, 0x01] })), sha(good).toUpperCase(), "", "0".repeat(64)]) {
    const r = loadFungiQueryCustody({ wasmBytes: good, expectedSha256: pin });
    assert.equal(r.ok, false, "pin " + pin.slice(0, 8));
    assert.equal(r.custody.verdict(okReq), "unavailable");
  }
  const trap = wasm({ body: [0x00] });
  const rt = loadFungiQueryCustody({ wasmBytes: trap, expectedSha256: sha(trap) });
  assert.equal(rt.ok, true);
  assert.equal(rt.custody.verdict(okReq), "refuse", "a trap refuses");
  for (const k of [1, 2, 0x7f]) {
    const b = wasm({ body: [0x41, k] });
    const r = loadFungiQueryCustody({ wasmBytes: b, expectedSha256: sha(b) });
    assert.equal(r.custody.verdict(okReq), "refuse", "code " + k);
  }
  const misnamed = wasm({ name: "admitQuery" });
  assert.equal(loadFungiQueryCustody({ wasmBytes: misnamed, expectedSha256: sha(misnamed) }).ok, false);
});

test("S6-R5c an import-bearing artifact never loads (guard plus instantiation with no imports)", async () => {
  const { loadFungiQueryCustody } = await import(pathToFileURL(LOADER_JS).href);
  const b = wasm({ withImport: true });
  const r = loadFungiQueryCustody({ wasmBytes: b, expectedSha256: sha(b) });
  assert.equal(r.ok, false);
  assert.equal(r.custody.verdict(okReq), "unavailable");
});